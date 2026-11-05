"""Shape-making helpers shared by the Blender model scripts (the pistols):
profiles pushed out to a thickness, boxes, cylinders, wedges, booleans,
bevels, engraving, and the per-texel helpers used to paint wear and
texture (convexity, scratches, stippling).

Coordinates are (x, y, z) = (side, s, y), with s the distance forward and y
up, as in the game's gun space turned into Blender's.
"""

import math

import bmesh
import bpy
import numpy as np
from mathutils import Matrix, Vector

from common import SETTINGS, apply_modifiers, log, select_only, smoothstep, srgb_to_linear


def filleted(points):
    """A polygon with its corners rounded off: each point is (s, y, radius).
    The same as filleted() in pistol.js."""
    out = []
    n = len(points)
    for i in range(n):
        px, py, radius = points[i]
        ax, ay = points[i - 1][:2]
        bx, by = points[(i + 1) % n][:2]
        if not radius:
            out.append((px, py))
            continue
        la, lb = math.hypot(ax - px, ay - py), math.hypot(bx - px, by - py)
        u1 = ((ax - px) / la, (ay - py) / la)
        u2 = ((bx - px) / lb, (by - py) / lb)
        half = math.acos(max(-1.0, min(1.0, u1[0] * u2[0] + u1[1] * u2[1]))) / 2
        if half < 1e-3 or half > math.pi / 2 - 1e-3:
            out.append((px, py))
            continue
        d = min(radius / math.tan(half), 0.45 * la, 0.45 * lb)
        r = d * math.tan(half)
        bis = (u1[0] + u2[0], u1[1] + u2[1])
        lbis = math.hypot(*bis)
        cx = px + bis[0] / lbis * (r / math.sin(half))
        cy = py + bis[1] / lbis * (r / math.sin(half))
        a1 = math.atan2(py + u1[1] * d - cy, px + u1[0] * d - cx)
        a2 = math.atan2(py + u2[1] * d - cy, px + u2[0] * d - cx)
        sweep = (a2 - a1 + math.pi) % (2 * math.pi) - math.pi
        steps = max(2, math.ceil(abs(sweep) / (math.pi / 12)))
        for k in range(steps + 1):
            t = a1 + sweep * k / steps
            out.append((cx + r * math.cos(t), cy + r * math.sin(t)))
    return out


def link(obj):
    bpy.context.scene.collection.objects.link(obj)
    return obj


def from_bmesh(name, bm):
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    return link(bpy.data.objects.new(name, mesh))


def prism(name, points, width):
    """A side profile (s, y) pushed out to `width`, centred on x = 0."""
    bm = bmesh.new()
    half = width / 2
    left = [bm.verts.new((-half, s, y)) for s, y in points]
    right = [bm.verts.new((half, s, y)) for s, y in points]
    n = len(points)
    bm.faces.new(left[::-1])
    bm.faces.new(right)
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new((left[i], left[j], right[j], right[i]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return from_bmesh(name, bm)


def box(name, x0, x1, s0, s1, y0, y1):
    obj = prism(name, [(s0, y0), (s1, y0), (s1, y1), (s0, y1)], x1 - x0)
    obj.data.transform(Matrix.Translation(((x0 + x1) / 2, 0, 0)))
    return obj


def cylinder(name, radius, start, end, axis='s', at=(0.0, 0.0), segments=40, end_radius=None):
    """A cylinder from start to end along s (forward) or x (sideways).
    `at` is where its axis is: (x, y) for an s cylinder, (s, y) for an x one.
    end_radius makes it a cone (narrower or wider at the end)."""
    bm = bmesh.new()
    r2 = radius if end_radius is None else end_radius
    bmesh.ops.create_cone(bm, cap_ends=True, segments=segments, radius1=radius, radius2=r2, depth=end - start)
    # create_cone makes it along Z, centred on 0.
    middle = (start + end) / 2
    if axis == 's':
        bmesh.ops.rotate(bm, verts=bm.verts, cent=(0, 0, 0), matrix=Matrix.Rotation(math.radians(-90), 3, 'X'))
        bmesh.ops.translate(bm, verts=bm.verts, vec=(at[0], middle, at[1]))
    else:
        bmesh.ops.rotate(bm, verts=bm.verts, cent=(0, 0, 0), matrix=Matrix.Rotation(math.radians(90), 3, 'Y'))
        bmesh.ops.translate(bm, verts=bm.verts, vec=(middle, at[0], at[1]))
    return from_bmesh(name, bm)


def wedge(name, tri_xy, s0, s1):
    """A prism with a triangular cross-section in the (x, y) plane, running along s."""
    bm = bmesh.new()
    a = [bm.verts.new((x, s0, y)) for x, y in tri_xy]
    b = [bm.verts.new((x, s1, y)) for x, y in tri_xy]
    bm.faces.new(a[::-1])
    bm.faces.new(b)
    for i in range(3):
        j = (i + 1) % 3
        bm.faces.new((a[i], a[j], b[j], b[i]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return from_bmesh(name, bm)


def ellipsoid(name, center, radii, segments=32):
    """An ellipsoid at center (x, s, y) with radii (x, s, y)."""
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=segments, v_segments=segments // 2, radius=1.0)
    for v in bm.verts:
        v.co = Vector((center[0] + v.co.x * radii[0], center[1] + v.co.y * radii[1], center[2] + v.co.z * radii[2]))
    return from_bmesh(name, bm)


def set_pivot(obj, pivot):
    """Moves obj's origin to `pivot` (x, s, y) without moving the mesh, so the
    game can turn it about that point."""
    obj.data.transform(Matrix.Translation(Vector(pivot) * -1))
    obj.location = Vector(pivot)


def join(target, *others):
    select_only(target)
    for o in others:
        o.select_set(True)
    bpy.ops.object.join()
    return target


def bevel(obj, width, segments=3, angle=30):
    mod = obj.modifiers.new('Bevel', 'BEVEL')
    mod.width = width
    mod.segments = segments
    mod.limit_method = 'ANGLE'
    mod.angle_limit = math.radians(angle)
    mod.profile = 0.5
    apply_modifiers(obj)


def cut(obj, *cutters):
    """Removes each cutter's volume from obj."""
    for cutter in cutters:
        mod = obj.modifiers.new('Cut', 'BOOLEAN')
        mod.operation = 'DIFFERENCE'
        mod.solver = 'EXACT'
        mod.object = cutter
        apply_modifiers(obj)
        bpy.data.objects.remove(cutter)


def triangulate(obj):
    mod = obj.modifiers.new('Triangulate', 'TRIANGULATE')
    mod.quad_method = 'BEAUTY'
    mod.ngon_method = 'BEAUTY'
    mod.keep_custom_normals = True
    apply_modifiers(obj)


def engrave(obj, text, size, center, x_axis, y_axis, depth=0.00028):
    """Cuts `text` into obj's surface. center: where the middle of the text
    sits on the surface; x_axis: the reading direction; y_axis: up the letters."""
    curve = bpy.data.curves.new('text', 'FONT')
    curve.body = text
    curve.size = size
    curve.extrude = depth
    curve.align_x = 'CENTER'
    curve.align_y = 'CENTER'
    letters = link(bpy.data.objects.new('text', curve))
    x, y = Vector(x_axis).normalized(), Vector(y_axis).normalized()
    z = x.cross(y)
    rotation = Matrix((x, y, z)).transposed().to_4x4()
    letters.matrix_world = Matrix.Translation(center) @ rotation
    bpy.context.view_layer.update()
    depsgraph = bpy.context.evaluated_depsgraph_get()
    cutter = link(bpy.data.objects.new('engraving', bpy.data.meshes.new_from_object(letters.evaluated_get(depsgraph))))
    cutter.matrix_world = letters.matrix_world
    bpy.data.objects.remove(letters)
    # If the cut goes wrong (it can with some letter shapes), keep the surface as it was.
    before = obj.data.copy()
    faces = len(obj.data.polygons)
    cut(obj, cutter)
    if len(obj.data.polygons) < faces * 0.9:
        log('engraving', repr(text), 'failed; leaving it out')
        old = obj.data
        obj.data = before
        bpy.data.meshes.remove(old)
    else:
        bpy.data.meshes.remove(before)


def sharp_edges(obj, angle=35):
    """Smooth shading, but crisp where faces meet at more than `angle` degrees."""
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    limit = math.radians(angle)
    for e in bm.edges:
        e.smooth = not (e.is_manifold and e.calc_face_angle(0) > limit) and e.is_manifold
    for f in bm.faces:
        f.smooth = True
    bm.to_mesh(obj.data)
    bm.free()


def convexity(p, n):
    """How sharply the surface curves outwards at each texel (edges are high)."""
    size = SETTINGS['size']
    P = p.reshape(size, size, 3)
    N = n.reshape(size, size, 3)
    total = np.zeros((size, size))
    count = np.zeros((size, size))
    for axis in (0, 1):
        for step in (1, -1):
            dp = np.roll(P, step, axis) - P
            dn = np.roll(N, step, axis) - N
            dist = np.linalg.norm(dp, axis=2)
            ok = (dist > 1e-6) & (dist < 0.0012)  # same UV island
            # Normals spreading apart along the surface = convex edge.
            c = np.where(ok, np.sum(dn * dp, axis=2) / np.maximum(dist, 1e-6) ** 2, 0)
            total += c
            count += ok
    return (total / np.maximum(count, 1)).reshape(-1)


def lerp_color(color, target_hex, amount):
    amount = np.clip(amount, 0, 1)[:, None]
    return color * (1 - amount) + srgb_to_linear(target_hex) * amount


def surface_coords(p, n):
    """2D coordinates on each texel's surface, picked by which way it faces:
    sides use (forward, up), top and bottom (side, forward), ends (side, up)."""
    ax = np.argmax(np.abs(n), axis=1)
    u = np.where(ax == 0, p[:, 1], p[:, 0])
    v = np.where(ax == 2, p[:, 1], p[:, 2])
    return ax, u, v


def scratches(p, n, count, seed, along_bias=0.8):
    """Thin random scratches (0..1). Most run lengthwise, like holster wear."""
    rng = np.random.default_rng(seed)
    ax, u, v = surface_coords(p, n)
    out = np.zeros(len(p))
    lo, hi = p.min(axis=0), p.max(axis=0)
    for _ in range(count):
        face = rng.choice([0, 2, 1], p=[0.7, 0.25, 0.05])
        mine = ax == face
        if face == 0:
            cu, cv = rng.uniform(lo[1], hi[1]), rng.uniform(lo[2], hi[2])
        elif face == 2:
            cu, cv = rng.uniform(lo[0], hi[0]), rng.uniform(lo[1], hi[1])
        else:
            cu, cv = rng.uniform(lo[0], hi[0]), rng.uniform(lo[2], hi[2])
        length = rng.uniform(0.002, 0.014)
        lengthwise = rng.random() < along_bias
        angle = rng.normal(0, 0.18) if lengthwise else rng.uniform(0, math.pi)
        if face == 2 and lengthwise:
            angle += math.pi / 2  # on the top, "lengthwise" is along v
        du, dv = math.cos(angle) * length / 2, math.sin(angle) * length / 2
        near = mine & (np.abs(u - cu) < abs(du) + 0.001) & (np.abs(v - cv) < abs(dv) + 0.001)
        if not near.any():
            continue
        pu, pv = u[near] - (cu - du), v[near] - (cv - dv)
        t = np.clip((pu * 2 * du + pv * 2 * dv) / (4 * (du * du + dv * dv)), 0, 1)
        dist = np.hypot(pu - t * 2 * du, pv - t * 2 * dv)
        width = rng.uniform(0.00006, 0.00014)
        strength = rng.uniform(0.4, 1.0) * np.sin(np.pi * t) ** 0.5  # fades out at both ends
        out[near] = np.maximum(out[near], strength * smoothstep(width, 0, dist))
    return out


def inside_polygon(xs, ys, polygon):
    """Which points (xs, ys) are inside the polygon (even-odd rule)."""
    result = np.zeros(len(xs), bool)
    n = len(polygon)
    for i in range(n):
        (x0, y0), (x1, y1) = polygon[i], polygon[(i + 1) % n]
        crosses = (y0 > ys) != (y1 > ys)
        x_at = x0 + (ys - y0) * (x1 - x0) / ((y1 - y0) or 1e-12)
        result ^= crosses & (xs < x_at)
    return result


def distance_to_outline(xs, ys, polygon):
    """How far points (xs, ys) are from the nearest edge of a polygon."""
    best = np.full(len(xs), np.inf)
    n = len(polygon)
    for i in range(n):
        (x0, y0), (x1, y1) = polygon[i], polygon[(i + 1) % n]
        dx, dy = x1 - x0, y1 - y0
        t = np.clip(((xs - x0) * dx + (ys - y0) * dy) / (dx * dx + dy * dy or 1e-12), 0, 1)
        best = np.minimum(best, np.hypot(xs - (x0 + t * dx), ys - (y0 + t * dy)))
    return best


def stipple(u, v, cell=0.0009, seed=5):
    """Raised dots scattered over a surface, from 2D surface coordinates."""
    rng = np.random.default_rng(seed)
    table = rng.random((64, 64, 2))
    iu, iv = np.floor(u / cell).astype(int), np.floor(v / cell).astype(int)
    nearest = np.full(len(u), 9.0)
    for du in (-1, 0, 1):
        for dv in (-1, 0, 1):
            cu, cv = iu + du, iv + dv
            jitter = table[cu % 64, cv % 64]
            pu = (cu + 0.15 + 0.7 * jitter[:, 0]) * cell
            pv = (cv + 0.15 + 0.7 * jitter[:, 1]) * cell
            nearest = np.minimum(nearest, np.hypot(u - pu, v - pv))
    return smoothstep(cell * 0.42, cell * 0.12, nearest)


def extrude_xy(name, xy_points, s0, s1):
    """A prism with any cross-section in the (x, y) plane, running along s
    from s0 to s1 (wedge() is the triangular case)."""
    bm = bmesh.new()
    a = [bm.verts.new((x, s0, y)) for x, y in xy_points]
    b = [bm.verts.new((x, s1, y)) for x, y in xy_points]
    bm.faces.new(a[::-1])
    bm.faces.new(b)
    n = len(xy_points)
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new((a[i], a[j], b[j], b[i]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return from_bmesh(name, bm)


def rounded_corner(cx, cy, radius, sx, sy, steps=10, margin=0.001):
    """The (x, y) cross-section of what to cut away to round off a corner of
    a box: the corner at (cx, cy), rounded with `radius`; sx and sy (±1) say
    which way the corner points."""
    pts = [(cx + sx * margin, cy + sy * margin), (cx + sx * margin, cy - sy * radius)]
    ox, oy = cx - sx * radius, cy - sy * radius  # centre of the round
    for k in range(steps + 1):
        t = (math.pi / 2) * k / steps
        pts.append((ox + sx * radius * math.cos(t), oy + sy * radius * math.sin(t)))
    pts.append((cx - sx * radius, cy + sy * margin))
    # Keep the winding consistent whichever way the corner points.
    area = sum(x0 * y1 - x1 * y0 for (x0, y0), (x1, y1) in zip(pts, pts[1:] + pts[:1]))
    return pts if area > 0 else pts[::-1]
