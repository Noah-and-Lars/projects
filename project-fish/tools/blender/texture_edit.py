"""Editing downloaded models' textures: finding and rubbing out lettering,
engraving made-up markings, and filling patches from their surroundings.
Used by convert_pistol45.py and convert_pistol9.py.

Images are handled as numpy arrays (rows from the top, values 0..1, RGBA).
"""

import math
import os

import bpy
import numpy as np

from shapes import inside_polygon, link


def to_linear(c):
    return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)


def load_image(name):
    """The imported texture (the one its material uses) for a file name."""
    stem = os.path.splitext(name)[0]
    for image in bpy.data.images:
        if image.users and (image.name.startswith(stem) or os.path.basename(image.filepath) == name):
            return image
    raise SystemExit(f'texture {name} not found')


def image_array(image):
    """An image's pixels, rows from the top (Blender's run from the bottom)."""
    w, h = image.size
    a = np.empty(w * h * 4, np.float32)
    image.pixels.foreach_get(a)
    return a.reshape(h, w, 4)[::-1].copy()


def store(image, a):
    image.pixels.foreach_set(np.ascontiguousarray(a[::-1]).reshape(-1))
    image.update()


def box_blur(a, r):
    """Mean over a (2r+1) square, per channel (edges clamped)."""
    out = a
    for axis in (0, 1):
        pad = [(0, 0)] * a.ndim
        pad[axis] = (r + 1, r)
        c = np.cumsum(np.pad(out, pad, mode='edge'), axis=axis, dtype=np.float64)
        n = out.shape[axis]
        out = (np.take(c, np.arange(2 * r + 1, 2 * r + 1 + n), axis=axis) - np.take(c, np.arange(0, n), axis=axis)) / (2 * r + 1)
    return out


def text_mask(normal, box, band):
    """The engraved letters inside box (x0, y0, x1, y1, image pixels) and the
    band (a polygon round the line of text): where the normal map tilts away
    from its smooth surroundings."""
    x0, y0, x1, y1 = box
    n = normal[y0:y1, x0:x1, :3].astype(np.float64)
    smooth = box_blur(n, 5)
    tilt = np.linalg.norm(n - smooth, axis=2)
    yy, xx = np.mgrid[y0:y1, x0:x1]
    in_band = inside_polygon(xx.ravel() + 0.5, yy.ravel() + 0.5, band).reshape(xx.shape)
    mask = (tilt > 0.08) & in_band
    # Grow it a little so the letters' soft edges go too.
    grown = box_blur(mask.astype(np.float64), 2) > 0.02
    return grown


def letters(text, height_px):
    """The marking as a 0..1 image, white letters on black, drawn with
    Blender's built-in font (turned into a mesh and filled in)."""
    curve = bpy.data.curves.new('marking', 'FONT')
    curve.body = text
    curve.size = 1.0
    curve.space_character = 1.05
    obj = link(bpy.data.objects.new('marking', curve))
    depsgraph = bpy.context.evaluated_depsgraph_get()
    mesh = bpy.data.meshes.new_from_object(obj.evaluated_get(depsgraph))
    bpy.data.objects.remove(obj)
    bpy.data.curves.remove(curve)
    v = np.array([vv.co[:2] for vv in mesh.vertices])
    tris = [p.vertices[:] for p in mesh.polygons]
    bpy.data.meshes.remove(mesh)
    lo, hi = v.min(0), v.max(0)
    s = height_px / (hi[1] - lo[1])
    w, h = int((hi[0] - lo[0]) * s) + 6, int(height_px) + 6
    yy, xx = np.mgrid[0:h, 0:w]
    p = np.c_[xx.ravel() + 0.5, yy.ravel() + 0.5]
    # Supersample 3x3 for soft edges.
    acc = np.zeros(len(p))
    for dx in (-1 / 3, 0, 1 / 3):
        for dy in (-1 / 3, 0, 1 / 3):
            q = p + [dx, dy]
            inside = np.zeros(len(p), bool)
            for t in tris:
                pts = (v[list(t)] - lo) * s + 3
                pts[:, 1] = h - pts[:, 1]  # image rows go down
                inside |= inside_polygon(q[:, 0], q[:, 1], pts)
            acc += inside
    return (acc / 9).reshape(h, w)


def placed(shape, mask_img, at, angle, flip_rows):
    """mask_img (0..1) placed with its centre at `at` (x, y pixels) and turned
    by `angle` (radians, image space; the letters read along (cos, sin)), as a
    full-size image of `shape` (h, w). flip_rows mirrors the letters (for
    textures whose lettering is stored mirrored)."""
    h, w = mask_img.shape
    ca, sa = math.cos(angle), math.sin(angle)
    half = int(math.hypot(w, h) / 2) + 4
    cx, cy = at
    ys, xs = np.mgrid[cy - half:cy + half, cx - half:cx + half]
    # Back into the letters' image: undo the turn (and the flip).
    dx, dy = xs + 0.5 - cx, ys + 0.5 - cy
    if flip_rows:
        dy = -dy
    lx = ca * dx + sa * dy + w / 2
    ly = -sa * dx + ca * dy + h / 2
    ok = (lx >= 0) & (lx < w - 1) & (ly >= 0) & (ly < h - 1)
    ix, iy = np.clip(lx.astype(int), 0, w - 2), np.clip(ly.astype(int), 0, h - 2)
    fx, fy = lx - ix, ly - iy
    m = (mask_img[iy, ix] * (1 - fx) * (1 - fy) + mask_img[iy, ix + 1] * fx * (1 - fy)
         + mask_img[iy + 1, ix] * (1 - fx) * fy + mask_img[iy + 1, ix + 1] * fx * fy)
    m = np.where(ok, m, 0.0)
    out = np.zeros(shape)
    out[cy - half:cy + half, cx - half:cx + half] = box_blur(m, 1)
    return out


def engrave(normal, mask_img, at, angle, flip_rows, sign, depth=1.4):
    """Adds engraved letters to the normal map: mask_img (0..1) placed with its
    centre at `at` (x, y pixels), turned by `angle` (see placed). `sign` is the
    map's slope signs (measure_engrave_sign). Returns the placed letters
    (0..1, full size), for colouring them in other maps."""
    m = placed(normal.shape[:2], mask_img, at, angle, flip_rows)
    ys, xs = np.nonzero(m > 0)
    y0, y1, x0, x1 = ys.min() - 2, ys.max() + 3, xs.min() - 2, xs.max() + 3
    mm = m[y0:y1, x0:x1]
    # Engraved: the surface drops where the letters are. Tangent-space normal
    # from the height: (-dh/dx, -dh/dy) with the image's rows going down,
    # matching the sign of the letters this replaced.
    hgt = -mm * depth
    gx = (np.roll(hgt, -1, 1) - np.roll(hgt, 1, 1)) / 2
    gy = (np.roll(hgt, -1, 0) - np.roll(hgt, 1, 0)) / 2
    region = normal[y0:y1, x0:x1, :3].astype(np.float64) * 2 - 1
    region[..., 0] += -gx * sign[0]
    region[..., 1] += -gy * sign[1]
    region /= np.linalg.norm(region, axis=2, keepdims=True)
    normal[y0:y1, x0:x1, :3] = (region + 1) / 2
    return m


def measure_engrave_sign(normal, box, mask):
    """How the original letters' slopes show in the normal map, so the new ones
    match (the map's green may be flipped)."""
    x0, y0, x1, y1 = box
    n = normal[y0:y1, x0:x1, :3].astype(np.float64) * 2 - 1
    m = box_blur(mask.astype(np.float64), 1)
    gx = (np.roll(m, -1, 1) - np.roll(m, 1, 1)) / 2
    gy = (np.roll(m, -1, 0) - np.roll(m, 1, 0)) / 2
    sx = np.sign(np.sum(gx * n[..., 0]))
    sy = np.sign(np.sum(gy * n[..., 1]))
    # Height of engraved letters is -m, so -dh/dx = +gx: red goes with +gx.
    return float(sx or 1), float(sy or 1)


# --- Rubbing things out --------------------------------------------------------

def deviation_mask(maps, box, thresholds, grow=2):
    """Where any of the maps (arrays) stands out from its smooth surroundings
    inside box: letters, logos, codes. thresholds: one per map."""
    x0, y0, x1, y1 = box
    mask = np.zeros((y1 - y0, x1 - x0), bool)
    for a, t in zip(maps, thresholds):
        region = a[y0:y1, x0:x1, :3].astype(np.float64)
        dev = np.linalg.norm(region - box_blur(region, 6), axis=2)
        mask |= dev > t
    return box_blur(mask.astype(np.float64), grow) > 0.02


def inpaint(a, hole):
    """Fills the hole (bool, same height and width as a) from the texels round
    it: each hole texel gets the mean of the nearest known ones, looking
    further out until there are some."""
    known = (~hole).astype(np.float64)
    acc = a * known[..., None]
    out = a.copy()
    todo = hole.copy()
    r = 1
    while todo.any() and r < max(a.shape[:2]):
        w = box_blur(known, r)
        s = box_blur(acc, r)
        ok = todo & (w > 0.02)
        out[ok] = s[ok] / w[ok, None]
        todo &= ~ok
        r *= 2
    # Soften the fill a little so it has no rings.
    soft = box_blur(out, 2)
    out[hole] = soft[hole]
    return out


def rub_out(maps, box, mask=None, margin=24, normal=None):
    """Fills `mask` (inside box; the whole box if None) in every map from the
    texels round it. `normal` is the index of the normal map in maps, if any,
    whose filled normals are made unit length again."""
    x0, y0, x1, y1 = box
    h, w = maps[0].shape[:2]
    X0, Y0, X1, Y1 = max(0, x0 - margin), max(0, y0 - margin), min(w, x1 + margin), min(h, y1 + margin)
    hole = np.zeros((Y1 - Y0, X1 - X0), bool)
    if mask is None:
        hole[y0 - Y0:y1 - Y0, x0 - X0:x1 - X0] = True
    else:
        hole[y0 - Y0:y1 - Y0, x0 - X0:x1 - X0] = mask
    for k, a in enumerate(maps):
        region = a[Y0:Y1, X0:X1].astype(np.float64)
        filled = inpaint(region, hole)
        if k == normal:
            v = filled[..., :3] * 2 - 1
            v /= np.maximum(np.linalg.norm(v, axis=2, keepdims=True), 1e-6)
            filled[..., :3] = (v + 1) / 2
        a[Y0:Y1, X0:X1] = filled


def clone_over(maps, box, guide=0, gap=4):
    """Covers box in every map with a copy of the patch beside it (above,
    below, left or right: whichever matches the box's surroundings best in
    maps[guide]), blended in at the edges. For textured surfaces (stippling)
    where a smooth fill would show."""
    x0, y0, x1, y1 = box
    bw, bh = x1 - x0, y1 - y0
    g = maps[guide][..., :3].astype(np.float64)
    h, w = g.shape[:2]
    ring = 4
    best = None
    for sx, sy in ((bw + gap, 0), (-bw - gap, 0), (0, bh + gap), (0, -bh - gap)):
        if not (0 <= x0 + sx - ring and x1 + sx + ring <= w and 0 <= y0 + sy - ring and y1 + sy + ring <= h):
            continue
        here = g[y0 - ring:y1 + ring, x0 - ring:x1 + ring]
        there = g[y0 - ring + sy:y1 + ring + sy, x0 - ring + sx:x1 + ring + sx]
        edge = np.ones(here.shape[:2], bool)
        edge[ring:-ring, ring:-ring] = False
        cost = np.mean((here[edge] - there[edge]) ** 2)
        if best is None or cost < best[0]:
            best = (cost, sx, sy)
    _, sx, sy = best
    weight = np.zeros((bh, bw))
    weight[3:-3, 3:-3] = 1
    weight = box_blur(weight, 3)[..., None]
    for a in maps:
        src = a[y0 + sy:y1 + sy, x0 + sx:x1 + sx].copy()
        a[y0:y1, x0:x1] = a[y0:y1, x0:x1] * (1 - weight) + src * weight
    return sx, sy
