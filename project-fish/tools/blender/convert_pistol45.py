"""Turns a downloaded 1911 model into the game's second pistol.

The model is "Colt m1911" by neyr (CC BY 4.0, see README.md, Credits):
https://sketchfab.com/3d-models/colt-m1911-2cfbca3cd37a426c8dbf6474504703e8
Download its glTF version and unzip it so that the folder holds
scene.gltf, scene.bin and textures/. Then, from the project-fish folder:

    blender --background --python tools/blender/convert_pistol45.py -- build/m1911-source build/pistol45-raw.glb --blend build/pistol45.blend

(npm run build-pistol45 does this and compresses the result into
assets/pistol45.glb.)

What it changes:
- Turns and scales it into gun space (metres, +X right, +Y up, -Z forward)
  and places it so its grip is where the game's hands hold a pistol
  (GRIP in src/viewmodel/pistol.js).
- Groups its 32 pieces into the parts the game moves, with the game's names:
  slide (with its sights, barrel bushing and recoil spring plug), barrel,
  frame, hammer, trigger, slide stop, thumb safety, magazine release and
  magazine (with its top round).
- Makes the wooden grip panels thicker (the game's hands are posed round a
  31 mm wide grip).
- Adds the parts it doesn't have: the middle of the barrel (seen when the
  slide is locked back), a round in the chamber, and a magazine follower.
- Textures: rubs out the maker's name engraved on the frame and engraves the
  game's own made-up markings there instead; darkens the steel to a deep
  blued finish with lighter wear on the edges; and halves them to 2048 px.

The game's constants for this gun (pivots, sights, muzzle) are printed at
the end, measured from the result.
"""

import json
import math
import os
import sys
import time

import bpy
import bmesh
import numpy as np
from mathutils import Matrix, Vector

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import linear_to_srgb, log, plain_material  # noqa: E402
from shapes import inside_polygon, join, link  # noqa: E402

ARGS = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else sys.argv[1:]
SOURCE, OUT_GLB = ARGS[0], ARGS[1]
BLEND = ARGS[ARGS.index('--blend') + 1] if '--blend' in ARGS else None
# For trying out other sizes and holds: --grow k makes it k times bigger about
# the middle of the grip (GROW_ABOUT), and --raise d moves it d metres up in
# the hand.
GROW = float(ARGS[ARGS.index('--grow') + 1]) if '--grow' in ARGS else 1.0
RAISE = float(ARGS[ARGS.index('--raise') + 1]) if '--raise' in ARGS else 0.0

# --- Placing it ---------------------------------------------------------------
# The download is in its own units with the muzzle towards -X and its left
# side towards +Z. This scale makes it 216 mm long, the real gun's length.
SCALE = 0.08896
# Where it goes after turning and scaling (gun space, metres): centred side
# to side, with its grip where the hands hold a pistol's: the front strap on
# the grip line, and high in the hand so the web of the hand is under the
# beavertail, as a 1911 is held (contacts like the first pistol's).
OFFSET = (-0.0101, -0.0422, -0.0515)
# The grip panels' outsides are pushed out to this far from the middle.
GRIP_HALF_WIDTH = 0.0150 * GROW
FRAME_HALF_WIDTH = 0.0103 * GROW  # where the panels sit on the frame
# The middle of the grip (gun space), which --grow scales about.
GROW_ABOUT = (0.0, -0.0863, 0.014)

# The download's pieces (by the start of their node names) and the part each
# becomes.
PARTS = {
    'up': 'slide', 'scope': 'slide', 'scope2': 'slide',
    'barrel2': 'slide', 'barrel3': 'slide', 'barrelButton': 'slide',  # bushing and recoil spring plug
    'barrel': 'barrel', 'insBarrel': 'barrel',  # the muzzle and the chamber end seen through the port
    'down': 'frame', 'hammer2': 'frame',  # the frame and its trigger guard
    'handle2': 'frame', 'handle3': 'frame',  # mainspring housing and grip safety
    'pipe': 'frame', 'upPart2': 'frame',
    'smallButtons': 'frame', 'smallButtons2': 'frame', 'smallButtons3': 'frame',
    'smallButtons4': 'frame', 'smallButtons5': 'frame',
    'handle': 'grips', 'screwUP': 'grips', 'screwUP2': 'grips', 'screwDOWN': 'grips', 'screwDOWN2': 'grips',
    'upPart': 'hammer',
    'hammer': 'trigger',
    'sidePart': 'slide_stop',
    'sidePart2': 'thumb_safety',
    'button': 'mag_release',
    'mag': 'magazine',
    'bullet2': 'magazine_round', 'bullet': 'magazine_round',
}

# --- Finish -------------------------------------------------------------------
# The download's steel is a light, heavily worn grey. Blued steel is much
# darker: the base colour of metal (metallic texels) is scaled to this, and
# the bright worn edges are kept but toned down.
BLUED = np.array([0.055, 0.058, 0.064])  # linear
WEAR = np.array([0.36, 0.37, 0.39])  # linear, bare steel on the worn edges
TEXTURE_SIZE = 2048

# The made-up markings, engraved where the download had its maker's name.
MARKING = 'PF-45  CAL .45'


def part_of(name):
    """The download's node name (e.g. 'barrel2_low.001_6') to our part."""
    return PARTS.get(name.split('_low')[0])


def import_source():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=os.path.join(SOURCE, 'scene.gltf'))
    # Bake every node's transform into its mesh, and remember which piece it was.
    pieces = []
    for obj in list(bpy.context.scene.objects):
        if obj.type != 'MESH':
            continue
        piece = obj.parent.name if obj.parent else obj.name
        matrix = obj.matrix_world.copy()
        obj.parent = None
        obj.data = obj.data.copy()
        obj.data.transform(matrix)
        obj.matrix_world = Matrix.Identity(4)
        obj.name = piece
        pieces.append(obj)
    for obj in list(bpy.context.scene.objects):
        if obj.type != 'MESH':
            bpy.data.objects.remove(obj)
    # Into gun space: in Blender (Z up) the muzzle goes from -X to +Y
    # (forward, -Z in the game), a quarter turn about Z.
    place = (Matrix.Translation((OFFSET[0], -OFFSET[2], OFFSET[1])) @ Matrix.Rotation(-math.pi / 2, 4, 'Z')
             @ Matrix.Scale(SCALE, 4))
    if GROW != 1.0 or RAISE:
        about = Vector((GROW_ABOUT[0], -GROW_ABOUT[2], GROW_ABOUT[1]))
        place = (Matrix.Translation((0, 0, RAISE)) @ Matrix.Translation(about) @ Matrix.Scale(GROW, 4)
                 @ Matrix.Translation(-about) @ place)
        log(f'grown {GROW}x about the grip, raised {RAISE * 1000:.1f} mm')
    for obj in pieces:
        obj.data.transform(place)
    return pieces


def verts(obj):
    a = np.empty(len(obj.data.vertices) * 3)
    obj.data.vertices.foreach_get('co', a)
    return a.reshape(-1, 3)


def set_verts(obj, v):
    obj.data.vertices.foreach_set('co', v.reshape(-1))
    obj.data.update()


def thicken_grips(grips):
    """Pushes the outsides of the grip panels (and the screw heads) out."""
    v = verts(grips)
    side = np.abs(v[:, 0])
    out = side > FRAME_HALF_WIDTH
    outer = side[out].max()
    k = (GRIP_HALF_WIDTH - FRAME_HALF_WIDTH) / (outer - FRAME_HALF_WIDTH)
    v[out, 0] = np.sign(v[out, 0]) * (FRAME_HALF_WIDTH + (side[out] - FRAME_HALF_WIDTH) * k)
    set_verts(grips, v)


def axis_of(v):
    """A round's centre and its axis (unit, base to nose), from its vertices."""
    c = v.mean(0)
    _, _, vt = np.linalg.svd(v - c)
    a = vt[0]
    t = (v - c) @ a
    # The nose is the narrow end: fewer vertices far from the axis there.
    r = np.linalg.norm((v - c) - np.outer(t, a), axis=1)
    if r[t > 0].mean() > r[t < 0].mean():
        a = -a
    t = (v - c) @ a
    return c, a, t.min(), t.max()


def round_in_chamber(round_obj, barrel):
    """A copy of the magazine's top round, in the chamber at the back of the
    barrel and lined up with the bore."""
    chamber = round_obj.copy()
    chamber.data = round_obj.data.copy()
    link(chamber)
    chamber.name = 'chamber_round'
    v = verts(chamber)
    c, a, t0, _ = axis_of(v)
    bore = bore_of(barrel)
    # Blender: forward is +Y. Turn the round's axis onto +Y and put its base at
    # the back of the chamber.
    turn = np.array(Vector(a).rotation_difference(Vector((0, 1, 0))).to_matrix())
    base = c + a * t0
    v = (v - base) @ turn.T + np.array([0.0, bore['chamber_back'], bore['y']])
    set_verts(chamber, v)
    return chamber


def bore_of(barrel):
    """Where the bore is: its height and the muzzle and chamber ends (Blender
    coordinates: y forward, z up)."""
    v = verts(barrel)
    muzzle = v[v[:, 1] > v[:, 1].max() - 0.004]  # the muzzle end
    y = (muzzle[:, 2].max() + muzzle[:, 2].min()) / 2
    return {
        'y': y,
        'radius': (muzzle[:, 2].max() - muzzle[:, 2].min()) / 2,
        'muzzle': v[:, 1].max(),
        'muzzle_back': muzzle[:, 1].min(),
        'chamber_back': v[:, 1].min(),
        'hood_front': v[v[:, 1] < v[:, 1].max() - 0.02][:, 1].max(),
    }


def barrel_tube(barrel):
    """The middle of the barrel, from behind the muzzle to the hood."""
    b = bore_of(barrel)
    bm = bmesh.new()
    length = b['muzzle_back'] - b['hood_front'] + 0.004
    bmesh.ops.create_cone(bm, cap_ends=False, segments=32, radius1=b['radius'] * 0.97, radius2=b['radius'] * 0.97,
                          depth=length)
    bmesh.ops.rotate(bm, verts=bm.verts, cent=(0, 0, 0), matrix=Matrix.Rotation(math.radians(-90), 3, 'X'))
    bmesh.ops.translate(bm, verts=bm.verts, vec=(0, b['hood_front'] - 0.002 + length / 2, b['y']))
    for f in bm.faces:
        f.smooth = True
    mesh = bpy.data.meshes.new('barrel_tube')
    bm.to_mesh(mesh)
    bm.free()
    tube = link(bpy.data.objects.new('barrel_tube', mesh))
    plain_material(tube, '#1c1d20', 0.42, metallic=1.0)
    return tube


def follower(magazine):
    """A flat follower at the top of the magazine, seen when it's empty."""
    v = verts(magazine)
    top = v[:, 2].max()
    lips = v[v[:, 2] > top - 0.003]
    x0, x1 = lips[:, 0].min() + 0.0015, lips[:, 0].max() - 0.0015
    y0, y1 = lips[:, 1].min() + 0.002, lips[:, 1].max() - 0.002
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.scale(bm, vec=(x1 - x0, y1 - y0, 0.003), verts=bm.verts)
    bmesh.ops.translate(bm, vec=((x0 + x1) / 2, (y0 + y1) / 2, top - 0.004), verts=bm.verts)
    mesh = bpy.data.meshes.new('magazine_follower')
    bm.to_mesh(mesh)
    bm.free()
    obj = link(bpy.data.objects.new('magazine_follower', mesh))
    plain_material(obj, '#1a1b1e', 0.6, metallic=0.6)
    return obj


# --- Textures -----------------------------------------------------------------

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
    img = np.zeros((h, w))
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


def engrave(normal, mask_img, at, angle, flip_rows, depth=1.4):
    """Adds engraved letters to the normal map: mask_img (0..1) placed with its
    centre at `at` (x, y pixels), turned by `angle` (radians, image space)."""
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
    m = box_blur(m, 1)
    # Engraved: the surface drops where the letters are. Tangent-space normal
    # from the height: (-dh/dx, -dh/dy) with the image's rows going down,
    # matching the sign of the letters this replaced (see ENGRAVE_SIGN).
    hgt = -m * depth
    gx = (np.roll(hgt, -1, 1) - np.roll(hgt, 1, 1)) / 2
    gy = (np.roll(hgt, -1, 0) - np.roll(hgt, 1, 0)) / 2
    region = normal[cy - half:cy + half, cx - half:cx + half, :3].astype(np.float64) * 2 - 1
    region[..., 0] += -gx * ENGRAVE_SIGN[0]
    region[..., 1] += -gy * ENGRAVE_SIGN[1]
    region /= np.linalg.norm(region, axis=2, keepdims=True)
    normal[cy - half:cy + half, cx - half:cx + half, :3] = (region + 1) / 2


# Signs of the engraving's slopes in this normal map (x, y), measured from the
# letters that were there: +1 means a slope down towards +x (or down the
# image) shows as a higher red (or green).
ENGRAVE_SIGN = (1.0, 1.0)


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


# Where the maker's name is engraved in the 2048 px normal map: a box
# (x0, y0, x1, y1) and, inside it, a band round the line of letters.
NAME_BOX = (100, 1080, 300, 1190)
NAME_BAND = [(122, 1182), (116, 1150), (262, 1090), (274, 1124)]


def fix_textures():
    global ENGRAVE_SIGN
    base = load_image('DefaultMaterial.003_baseColor.png')
    orm = load_image('DefaultMaterial.003_metallicRoughness.png')
    normal = load_image('DefaultMaterial.003_normal.png')
    for image in (orm, normal):
        image.colorspace_settings.name = 'Non-Color'

    # Work at the size they'll be shipped at.
    for image in (base, orm, normal):
        image.scale(TEXTURE_SIZE, TEXTURE_SIZE)
    log('textures scaled to', TEXTURE_SIZE)

    # 1. The maker's name: find its letters, measure their direction, then
    # cover them with clean surface from beside them.
    n = image_array(normal)
    x0, y0, x1, y1 = NAME_BOX
    mask = text_mask(n, NAME_BOX, NAME_BAND)
    ENGRAVE_SIGN = measure_engrave_sign(n, NAME_BOX, mask)
    ys, xs = np.nonzero(mask)
    pts = np.c_[xs + x0, ys + y0].astype(np.float64)
    centre = pts.mean(0)
    _, _, vt = np.linalg.svd(pts - centre)
    along = vt[0] if vt[0][0] > 0 else -vt[0]
    across = np.array([-along[1], along[0]])
    t = (pts - centre) @ along
    u = (pts - centre) @ across
    log(f'maker\'s name: {len(pts)} px, centre {centre.round(1)}, along {along.round(3)}, '
        f'{t.max() - t.min():.0f} x {u.max() - u.min():.0f} px, slope signs {ENGRAVE_SIGN}')
    # Clone from a strip the letters' height plus a bit away, across the text
    # (towards the flat middle of the slide, away from the edge).
    shift = across * (np.ptp(np.percentile(u, [4, 96])) + 7)
    if (centre + shift)[1] > centre[1]:
        shift = -shift
    sx, sy = int(round(shift[0])), int(round(shift[1]))
    feather = box_blur(mask.astype(np.float64), 2)
    feather = np.clip(feather * 3, 0, 1)[..., None]
    src = n[y0 + sy:y1 + sy, x0 + sx:x1 + sx, :3]
    n[y0:y1, x0:x1, :3] = n[y0:y1, x0:x1, :3] * (1 - feather) + src * feather
    # 2. Our marking in its place, along the same line, about as tall.
    lo, hi = np.percentile(u, [4, 96])
    height = (hi - lo) * 0.8
    img = letters(MARKING, height)
    # No longer than the name it replaces (the flat it's on ends just past it).
    length = (t.max() - t.min()) * 0.85
    if img.shape[1] > length:
        height *= length / img.shape[1]
        img = letters(MARKING, height)
    log(f'engraving {MARKING!r}, {height:.0f} x {img.shape[1]} px')
    # The download's letters read upside down and backwards in the texture
    # (its rows run bottom to top on the frame), so ours go in flipped the
    # same way, along the same line.
    # (Centred a little behind the old name: the flat ends just in front of it.)
    angle = math.atan2(-along[1], along[0])
    at = centre + along * 9
    engrave(n, img, (int(at[0]), int(at[1])), angle, flip_rows=True)
    store(normal, n)

    # 3. Blued steel: darken the metal, keeping the bright wear on its edges.
    b = image_array(base)
    o = image_array(orm)
    metal = np.clip((o[..., 2] - 0.3) / 0.4, 0, 1)[..., None]  # glTF: metalness in blue
    lin = to_linear(b[..., :3])  # the image's values are sRGB
    lum = lin @ np.array([0.2126, 0.7152, 0.0722])
    # How worn each texel looks: the download's light edges.
    wear = np.clip((lum - 0.12) / 0.35, 0, 1)[..., None] ** 1.4
    blued = BLUED * (0.75 + 0.5 * np.clip(lum / 0.12, 0, 2)[..., None]) * (1 - wear) + WEAR * wear
    b[..., :3] = linear_to_srgb(lin * (1 - metal) + blued * metal)
    store(base, b)
    # A little smoother where worn (polished by hands and holsters).
    o[..., 1] = o[..., 1] * (1 - 0.25 * wear[..., 0] * metal[..., 0])
    store(orm, o)

    # Magazine steel: blued too (its texture's metal is the same light grey);
    # the round keeps its brass and copper.
    mb = load_image('DefaultMaterial.004_baseColor.png')
    mo = load_image('DefaultMaterial.004_metallicRoughness.png')
    mn = load_image('DefaultMaterial.004_normal.png')
    for image in (mo, mn):
        image.colorspace_settings.name = 'Non-Color'
    for image in (mb, mo, mn):
        if image.size[0] > TEXTURE_SIZE // 2:
            image.scale(TEXTURE_SIZE // 2, TEXTURE_SIZE // 2)
    b, o = image_array(mb), image_array(mo)
    lin = to_linear(b[..., :3])
    metal = np.clip((o[..., 2] - 0.3) / 0.4, 0, 1)[..., None]
    lum = lin @ np.array([0.2126, 0.7152, 0.0722])
    wear = np.clip((lum - 0.12) / 0.35, 0, 1)[..., None] ** 1.4
    brass = (b[..., 0] > b[..., 2] * 1.25)[..., None]
    blued = BLUED * (0.75 + 0.5 * np.clip(lum / 0.12, 0, 2)[..., None]) * (1 - wear) + WEAR * wear
    b[..., :3] = np.where(brass, b[..., :3], linear_to_srgb(lin * (1 - metal) + blued * metal))
    store(mb, b)


def measure(parts, bore):
    """The constants the game needs for this gun (gun space, metres)."""
    def game(p):  # Blender (x, y, z) to gun space
        return [round(float(p[0]), 5), round(float(p[2]), 5), round(float(-p[1]), 5)]

    out = {}
    for name in ('slide', 'frame', 'hammer', 'trigger', 'slide_stop', 'thumb_safety', 'mag_release', 'magazine', 'grips'):
        v = verts(parts[name])
        out[name] = {'min': game(np.r_[v[:, 0].min(), v[:, 1].max(), v[:, 2].min()]),
                     'max': game(np.r_[v[:, 0].max(), v[:, 1].min(), v[:, 2].max()])}
    out['bore'] = {'y': round(float(bore['y']), 5), 'muzzle_z': round(float(-bore['muzzle']), 5),
                   'chamber_z': round(float(-bore['chamber_back']), 5), 'radius': round(float(bore['radius']), 5)}
    return out


def main():
    started = time.time()
    pieces = import_source()
    log('pieces:', ', '.join(sorted(o.name for o in pieces)))
    groups = {}
    for obj in pieces:
        part = part_of(obj.name)
        if part is None:
            raise SystemExit(f'unknown piece {obj.name}')
        groups.setdefault(part, []).append(obj)
    parts = {}
    for name, objs in groups.items():
        target = join(objs[0], *objs[1:]) if len(objs) > 1 else objs[0]
        target.name = target.data.name = name
        parts[name] = target

    log('joined into', ', '.join(sorted(parts)))
    thicken_grips(parts['grips'])
    join(parts['frame'], parts['grips'])
    parts['frame'].name = 'frame'
    parts['grips'] = parts['frame']

    bore = bore_of(parts['barrel'])
    tube = barrel_tube(parts['barrel'])
    chamber = round_in_chamber(parts['magazine_round'], parts['barrel'])
    join(parts['barrel'], tube)
    parts['barrel'].name = 'barrel'
    chamber.parent = parts['barrel']
    parts['magazine_round'].parent = parts['magazine']
    follower(parts['magazine']).parent = parts['magazine']

    log('added the barrel, chamber round and follower')
    fix_textures()
    log('textures done')

    root = link(bpy.data.objects.new('pistol', None))
    for name in ('slide', 'barrel', 'frame', 'hammer', 'trigger', 'slide_stop', 'thumb_safety', 'mag_release', 'magazine'):
        parts[name].parent = root
    for obj in bpy.context.scene.objects:
        if obj.type == 'MESH':
            obj.data.polygons.foreach_set('use_smooth', [True] * len(obj.data.polygons))

    info = measure(parts, bore)
    print('PISTOL45 ' + json.dumps(info))

    for o in bpy.context.scene.objects:
        o.select_set(True)
    os.makedirs(os.path.dirname(os.path.abspath(OUT_GLB)), exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=os.path.abspath(OUT_GLB),
        export_format='GLB',
        use_selection=True,
        export_yup=True,
        export_apply=True,
        export_tangents=True,
        export_image_format='WEBP',
        export_image_quality=88,
        export_animations=False,
    )
    log('wrote', OUT_GLB, f'{os.path.getsize(OUT_GLB) / 1e6:.1f} MB')
    if BLEND:
        os.makedirs(os.path.dirname(os.path.abspath(BLEND)), exist_ok=True)
        bpy.ops.file.pack_all()
        bpy.ops.wm.save_as_mainfile(filepath=os.path.abspath(BLEND))
        log('saved', BLEND)
    log(f'done in {time.time() - started:.0f} s')


main()
