# First-person hands for Free Criminal's guns: a right hand on the pistol grip, a left hand under the handguard, on a
# vertical grip or cupping the right hand, each with a forearm going back towards the shooter, built in the gun's own frame
# (x, y, z = game; muzzle +z; the shooter's RIGHT is -x, because facing +z with y up puts your right hand at -x).
# Colours are markers the game swaps for the player's look: skin = magenta (PAINT), sleeve = cyan. Exported as the part
# 'hands_<key>' of guns.fcm, drawn by the game in place of its old block hands.
import bpy, bmesh, math
import numpy as np
from mathutils import Vector, Matrix

SKIN, SLEEVE = 'skin', 'sleeve'   # roles write_fcm turns into the marker colours

def _mat(role):
    m = bpy.data.materials.get('fc_' + role)
    if m is None:
        m = bpy.data.materials.new('fc_' + role); m.use_nodes = True
        c = (1, 0, 1) if role == SKIN else (0, 1, 1)
        m.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (*c, 1); m.diffuse_color = (*c, 1)
    return m

def _box(bm, centre, t, n, size, mi):
    """A box at centre with its long axis along t, width along n, thickness along t x n; size = (len, width, thick)."""
    t = Vector(t).normalized(); n = Vector(n); n = (n - t * n.dot(t)).normalized(); r = t.cross(n)
    M = Matrix(((t.x, n.x, r.x, centre[0]), (t.y, n.y, r.y, centre[1]), (t.z, n.z, r.z, centre[2]), (0, 0, 0, 1)))
    g = bmesh.ops.create_cube(bm, size=1.0, matrix=M @ Matrix.Diagonal((size[0], size[1], size[2], 1)))
    for f in bm.faces:
        if f.material_index == 0 and f not in _box.seen: f.material_index = mi; _box.seen.add(f)
_box.seen = set()

def _tube(bm, a, b, r0, r1, mi, seg=10):
    a = Vector(a); b = Vector(b); d = b - a
    M = Matrix.Translation((a + b) / 2) @ d.to_track_quat('Z', 'Y').to_matrix().to_4x4() @ Matrix.Diagonal((1, 1, d.length / 2, 1))
    bmesh.ops.create_cone(bm, cap_ends=True, segments=seg, radius1=r0, radius2=r1, depth=2, matrix=M)
    for f in bm.faces:
        if f not in _box.seen: f.material_index = mi; _box.seen.add(f)

def _ellipse(c, axes, u, v, th):
    """Point on an ellipse: centre c, semi-axes (a along unit u, b along unit v), angle th (0 = +v direction)."""
    a, b = axes
    return Vector(c) + Vector(u) * (a * math.sin(th)) + Vector(v) * (b * math.cos(th))

def wrap_hand(bm, c, axes, u, v, n, palm_th, finger_ths, thumb_th, top, spacing=0.019, sign=1, fw=0.017, ft=0.015, seglen=0.024):
    """A hand wrapped round an ellipse (centre c, semi-axes `axes` along u and v, the hand's own axis n = the direction the
    fingers are stacked along, pointing from the index finger towards the little finger). palm_th = where the palm sits,
    finger_ths = the three angles of each finger's segments (increasing round the grip), thumb_th = where the thumb lies.
    top = the index finger's coordinate along n (fingers go on from there, spacing apart)."""
    u = Vector(u).normalized(); v = Vector(v).normalized(); n = Vector(n).normalized()
    R = (axes[0] + ft / 2 + 0.004, axes[1] + ft / 2 + 0.004)
    def P(th, k): return _ellipse(Vector(c) + n * k, R, u, v, th)
    def tangent(th): return (u * (R[0] * math.cos(th)) - v * (R[1] * math.sin(th))).normalized()
    # palm: a slab against the grip, tall enough for the four fingers
    pc = _ellipse(Vector(c) + n * (top + 1.5 * spacing), (R[0] + 0.006, R[1] + 0.006), u, v, palm_th)
    _box(bm, pc, tangent(palm_th), n, (0.062, 4 * spacing + 0.012, 0.03), 0)
    # fingers
    for i in range(4):
        k = top + i * spacing
        for j, th in enumerate(finger_ths):
            L = seglen * (1.0 if j < 2 else 0.8)
            _box(bm, P(th, k), tangent(th), n, (L, fw * (1 - 0.08 * i), ft), 0)
        # knuckle fill between palm and first segment
        _box(bm, P((palm_th + finger_ths[0]) / 2, k), tangent((palm_th + finger_ths[0]) / 2), n, (seglen, fw * (1 - 0.08 * i), ft), 0)
    # thumb: a longer box lying along the grip on the far side, pointing forward (n x direction of the fingers)
    tc = P(thumb_th, top - 0.004)
    _box(bm, tc + n * 0.004, Vector(v) * sign if abs(Vector(v).dot(n)) < 0.9 else u, n, (0.055, 0.02, 0.018), 0)
    _box(bm, P(thumb_th, top + 0.004), tangent(thumb_th), n, (0.035, 0.02, 0.017), 0)
    return pc

def forearm(bm, wrist, direction, length=0.42, r0=0.034, r1=0.046):
    """Skin wrist then a sleeve going `direction` from the wrist for `length`."""
    d = Vector(direction).normalized()
    _tube(bm, wrist, wrist + d * 0.045, 0.028, r0, 0)
    _tube(bm, wrist + d * 0.04, wrist + d * length, r0, r1, 1)

def build_hands(root, key, grip, left=None, right_arm_dir=(-0.35, -0.55, -1.0), left_arm_dir=(0.45, -0.45, -1.0)):
    """grip = dict(c=(x,y,z) grip centre at palm height, rx, rz = half-widths, rake = radians the grip leans back, top = y of
    the index finger). left = None | dict(kind='under', c, rx, ry) | dict(kind='vgrip', c, rx, rz, rake) | dict(kind='cup').
    Returns the object (part hands_<key>)."""
    col = root.users_collection[0]
    for o in [o for o in root.children if o.name == 'hands_' + key]: bpy.data.objects.remove(o)
    _box.seen = set(); bm = bmesh.new()
    # right hand on the pistol grip: the grip's axis leans back by rake; fingers stack downwards along -axis
    ax = Vector(grip['axis']).normalized() if 'axis' in grip else Vector((0, math.cos(grip['rake']), -math.sin(grip['rake']))).normalized()    # up along the grip (a knife handle: along it)
    u = Vector((1, 0, 0)); v = Vector((0, 1, 0)) if 'axis' in grip else Vector((0, 0, 1)); v = (v - ax * v.dot(ax)).normalized()   # across and forward (or up), in the grip's section
    c = Vector(grip['c']); n = -ax
    k0 = -(grip.get('top', c.y + 0.03) - c.y) / max(1e-6, ax.y) if False else 0.0
    top_k = grip['top_k'] if 'top_k' in grip else -(grip.get('top', c.y + 0.035) - c.y)      # along n (down) from the centre: negative = above the centre
    pc = wrap_hand(bm, c, (grip['rx'], grip['rz']), u, v, n, palm_th=math.radians(-150), finger_ths=[math.radians(a) for a in (-55, 5, 65)],
                   thumb_th=math.radians(135), top=top_k, sign=1)
    wrist = pc + n * 0.06 - v * 0.02
    forearm(bm, wrist, right_arm_dir)
    if left:
        kind = left['kind']
        if kind == 'under':   # palm under the handguard, fingers up the shooter's right (-x) side, thumb on the left (+x)
            c2 = Vector(left['c']); u2 = Vector((-1, 0, 0)); v2 = Vector((0, -1, 0)); n2 = Vector((0, 0, -1))
            pc2 = wrap_hand(bm, c2, (left['rx'], left['ry']), u2, v2, n2, palm_th=math.radians(-35), finger_ths=[math.radians(a) for a in (20, 75, 125)],
                            thumb_th=math.radians(-100), top=-0.03, sign=-1)
            wrist2 = pc2 + n2 * 0.055 - v2 * 0.0
        elif kind == 'vgrip':   # left hand on a vertical grip: palm back-left (+x), fingers round the front to -x
            ax2 = Vector((0, math.cos(left.get('rake', 0.1)), -math.sin(left.get('rake', 0.1)))).normalized()
            u2 = Vector((-1, 0, 0)); v2 = Vector((0, 0, 1)); v2 = (v2 - ax2 * v2.dot(ax2)).normalized(); c2 = Vector(left['c']); n2 = -ax2
            pc2 = wrap_hand(bm, c2, (left['rx'], left['rz']), u2, v2, n2, palm_th=math.radians(-150), finger_ths=[math.radians(a) for a in (-55, 5, 65)],
                            thumb_th=math.radians(135), top=-(left.get('top', c2.y + 0.03) - c2.y), sign=1)
            wrist2 = pc2 + n2 * 0.06 - v2 * 0.02
        else:   # 'cup': the left hand round the right hand's fingers, a size bigger and a touch lower
            c2 = c + n * 0.012; u2 = Vector((-1, 0, 0)); v2 = v
            pc2 = wrap_hand(bm, c2, (grip['rx'] + 0.014, grip['rz'] + 0.016), u2, v2, n, palm_th=math.radians(-150), finger_ths=[math.radians(a) for a in (-55, 5, 65)],
                            thumb_th=math.radians(135), top=top_k + 0.012, sign=1, fw=0.015, ft=0.013, seglen=0.021)
            wrist2 = pc2 + n * 0.06 - v * 0.02
        forearm(bm, wrist2, left_arm_dir)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    me = bpy.data.meshes.new('hands_' + key); bm.to_mesh(me); bm.free()
    me.transform(Matrix(((1, 0, 0, 0), (0, 0, -1, 0), (0, 1, 0, 0), (0, 0, 0, 1))))   # built in game coords (x, y, z) -> blender (x, -z, y)
    me.materials.append(_mat(SKIN)); me.materials.append(_mat(SLEEVE))
    o = bpy.data.objects.new('hands_' + key, me); col.objects.link(o); o.parent = root; o['fc_part'] = 'hands_' + key
    return o

def section(root, key, y=None, z=None, tol=0.012, within=None):
    """Bounding box (min, max) of the gun's vertices in a slab: y within tol of y and/or z within tol of z, optionally also
    inside `within` = (xmin, xmax, ymin, ymax, zmin, zmax). Game coords."""
    pts = []
    for o in root.children:
        if o.type != 'MESH' or o.get('fc_part') != key: continue
        co = np.array([v.co for v in o.data.vertices]); g = np.c_[co[:, 0], co[:, 2], -co[:, 1]]
        m = np.ones(len(g), bool)
        if y is not None: m &= np.abs(g[:, 1] - y) < tol
        if z is not None: m &= np.abs(g[:, 2] - z) < tol
        if within is not None:
            w = within; m &= (g[:, 0] >= w[0]) & (g[:, 0] <= w[1]) & (g[:, 1] >= w[2]) & (g[:, 1] <= w[3]) & (g[:, 2] >= w[4]) & (g[:, 2] <= w[5])
        if m.any(): pts.append(g[m])
    if not pts: return None
    p = np.concatenate(pts); return p.min(axis=0), p.max(axis=0)

def bvh_of(root, key):
    """A ray-cast tree of the gun's surface in game coords (low-poly guns have few vertices, so slabs of vertices miss)."""
    from mathutils.bvhtree import BVHTree
    verts = []; polys = []
    dg = bpy.context.evaluated_depsgraph_get()
    for o in root.children:
        if o.type != 'MESH' or o.get('fc_part') != key: continue
        me = o.evaluated_get(dg).to_mesh(); base = len(verts)
        verts += [(v.co.x, v.co.z, -v.co.y) for v in me.vertices]
        polys += [[base + i for i in p.vertices] for p in me.polygons]
        o.evaluated_get(dg).to_mesh_clear()
    return BVHTree.FromPolygons(verts, polys)

def probe(bvh, o, d, maxd=1.0):
    """Distance along d from o to the gun's surface, or None."""
    h = bvh.ray_cast(Vector(o), Vector(d).normalized(), maxd)
    return None if h[0] is None else h[3]

def measure_grip(bvh, y, z, rz_default=0.024):
    """The pistol grip round (y, z): back strap by a ray from behind, sides by rays from each side, rake from the back strap
    2.5 cm up and down. Returns the grip dict build_hands wants."""
    back = probe(bvh, (0, y, z - 0.07), (0, 0, 1), 0.12); back = z - 0.07 + back if back is not None else z - rz_default   # the ray starts just behind HOLD.g so a stock further back is not hit
    up = probe(bvh, (0, y + 0.025, z - 0.07), (0, 0, 1), 0.12); dn = probe(bvh, (0, y - 0.025, z - 0.07), (0, 0, 1), 0.12)
    rake = math.atan2((dn - up) if (up is not None and dn is not None) else 0.02, 0.05)
    if not 0.05 < rake < 0.6: rake = 0.3   # the rays hit the trigger guard or magazine instead: a usual pistol-grip lean
    zc = back + rz_default
    l = probe(bvh, (0.1, y, zc), (-1, 0, 0), 0.2); r = probe(bvh, (-0.1, y, zc), (1, 0, 0), 0.2)
    xl = 0.1 - l if l is not None else 0.015; xr = -0.1 + r if r is not None else -0.015
    return dict(c=((xl + xr) / 2, y, zc), rx=max(0.012, (xl - xr) / 2), rz=rz_default, rake=rake, top=y + 0.04)

def measure_guard(bvh, y, z):
    """The handguard at z: bottom and top by vertical rays, sides by rays from each side at the middle height."""
    b = probe(bvh, (0, y - 0.25, z), (0, 1, 0), 0.5); t = probe(bvh, (0, y + 0.3, z), (0, -1, 0), 0.6)
    yb = y - 0.25 + b if b is not None else y - 0.03; yt = y + 0.3 - t if t is not None else y + 0.03
    ym = (yb + yt) / 2
    l = probe(bvh, (0.15, ym, z), (-1, 0, 0), 0.3); r = probe(bvh, (-0.15, ym, z), (1, 0, 0), 0.3)
    xl = 0.15 - l if l is not None else 0.025; xr = -0.15 + r if r is not None else -0.025
    return dict(kind='under', c=((xl + xr) / 2, ym, z), rx=max(0.012, (xl - xr) / 2), ry=max(0.012, (yt - yb) / 2))
