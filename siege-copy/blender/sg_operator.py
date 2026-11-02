"""Build the operator character in parts (run inside Blender, headless).
blender -b --python sg_operator.py -- <out-dir> [preview.png]

An original, generic tactical operator: helmet with rails and ear protection, goggles, balaclava, combat shirt,
plate carrier with pouches, belt, cargo trousers, knee and elbow pads, gloves, boots and a carbine.
It is cut into the parts sgPerson() animates, each in that part's own space (game axes: y up, -z forward):
  thigh (leg group), shin (shin group, boot included), torso, head, arms (rifle hold), gun.
Every material is one of the game's colour zones (cloth, vest, acc, skin, dark, boot), so each operator's colours still
apply. Ambient occlusion is baked with all parts posed together and stored as the vertex colour.
Writes <out-dir>/op_<part>.glb.
"""
import bpy, bmesh, sys, os, math
from mathutils import Vector, Matrix

argv = sys.argv[sys.argv.index('--') + 1:]
OUT = argv[0]; PREV = argv[1] if len(argv) > 1 else None
os.makedirs(OUT, exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene

def G(x, y, z): return Vector((x, -z, y))  # game -> Blender
ZONES = {}
for zn, col in [('cloth', (.35, .38, .33)), ('vest', (.42, .41, .33)), ('acc', (.7, .5, .15)), ('skin', (.72, .54, .42)), ('dark', (.06, .06, .07)), ('boot', (.11, .1, .09))]:
    m = bpy.data.materials.new(zn); m.use_nodes = True
    m.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (*col, 1)
    ZONES[zn] = m

PARTS = {}  # part -> list of objects
# where each part's origin sits in the posed character (game coords), for the AO bake and the preview
ORIG = {'thighR': G(0.11, 0.92, 0), 'thighL': G(-0.11, 0.92, 0), 'shinR': G(0.11, 0.46, 0), 'shinL': G(-0.11, 0.46, 0),
        'torso': G(0, 0.92, 0), 'head': G(0, 1.52, 0), 'arms': G(0, 1.37, 0), 'gun': G(0.08, 1.23, -0.42)}

def finish(ob, part, zone, bevel=0, seg=2, sub=0):
    ob.data.materials.clear(); ob.data.materials.append(ZONES[zone])
    if bevel:
        m = ob.modifiers.new('b', 'BEVEL'); m.width = bevel; m.segments = seg; m.limit_method = 'ANGLE'
    if sub:
        m = ob.modifiers.new('s', 'SUBSURF'); m.levels = sub; m.render_levels = sub
    for p in ob.data.polygons: p.use_smooth = True
    PARTS.setdefault(part, []).append(ob)
    return ob

def rbox(part, zone, c, size, bevel=0.012, rot=(0, 0, 0), seg=3):
    """rounded box, centre and size in game axes (x, y, z sizes), rot in game axes (radians, XYZ)"""
    bpy.ops.mesh.primitive_cube_add(size=1)
    ob = bpy.context.object
    ob.scale = (size[0], size[2], size[1])
    ob.rotation_euler = (rot[0], -rot[2], rot[1])
    ob.location = G(*c) + ORIG[part]
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    return finish(ob, part, zone, bevel=min(bevel, min(size) * 0.45), seg=seg)

def ell(part, zone, c, r, rot=(0, 0, 0), seg=20, cut=None):
    """ellipsoid; cut = keep only the part above this local game-y (for the helmet shell)"""
    bpy.ops.mesh.primitive_uv_sphere_add(segments=seg, ring_count=max(8, seg // 2), radius=1)
    ob = bpy.context.object
    if cut is not None:
        bm = bmesh.new(); bm.from_mesh(ob.data)
        bmesh.ops.delete(bm, geom=[v for v in bm.verts if v.co.z < cut], context='VERTS'); bm.to_mesh(ob.data); bm.free()
        # a little thickness for the rim
        m = ob.modifiers.new('t', 'SOLIDIFY'); m.thickness = 0.06; m.offset = 1
    ob.scale = (r[0], r[2], r[1]); ob.rotation_euler = (rot[0], -rot[2], rot[1])
    ob.location = G(*c) + ORIG[part]
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    return finish(ob, part, zone)

def tube(part, zone, a, b, r0, r1, seg=16, caps=True):
    """tapered cylinder from a to b (game coords, part space) with rounded ends"""
    A, B = G(*a) + ORIG[part], G(*b) + ORIG[part]
    d = B - A; L = d.length
    bpy.ops.mesh.primitive_cone_add(vertices=seg, radius1=r0, radius2=r1, depth=L, end_fill_type='NOTHING')
    ob = bpy.context.object
    ob.rotation_euler = d.to_track_quat('Z', 'Y').to_euler(); ob.location = (A + B) / 2
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    finish(ob, part, zone)
    if caps:
        for p, r in ((a, r0), (b, r1)): ell(part, zone, p, (r, r, r), seg=seg)
    return ob

def ik(sh, hand, l1, l2, pole):
    """elbow position for a two-bone arm"""
    S, H, P = Vector(sh), Vector(hand), Vector(pole)
    d = H - S; L = min(d.length, l1 + l2 - 1e-3); dn = d.normalized()
    a = (l1 * l1 - l2 * l2 + L * L) / (2 * L); h = math.sqrt(max(0, l1 * l1 - a * a))
    up = (P - S - dn * (P - S).dot(dn)).normalized()
    return tuple(S + dn * a + up * h)

# ---------------- legs (one of each side; the game mirrors nothing, it builds both from these) ----------------
for side, s in (('R', 1), ('L', -1)):
    t = 'thigh' + side
    tube(t, 'cloth', (0, -0.02, 0), (0, -0.44, 0.005), 0.096, 0.07, caps=False)
    ell(t, 'cloth', (0, -0.02, 0), (0.096, 0.06, 0.096))
    rbox(t, 'vest', (s * 0.075, -0.25, -0.005), (0.035, 0.14, 0.1), 0.012)           # cargo pocket
    rbox(t, 'dark', (s * 0.088, -0.25, -0.005), (0.006, 0.02, 0.07), 0.002)          # pocket flap edge
    rbox(t, 'dark', (0, -0.075, 0), (0.19, 0.035, 0.19), 0.015) if False else None
    h = 'shin' + side
    ell(h, 'cloth', (0, 0.0, 0.0), (0.072, 0.06, 0.074))
    tube(h, 'cloth', (0, -0.01, 0), (0, -0.34, 0.01), 0.07, 0.056, caps=False)
    ell(h, 'dark', (0, 0.005, -0.06), (0.06, 0.075, 0.035))                            # knee pad
    rbox(h, 'dark', (0, 0.005, -0.075), (0.07, 0.016, 0.02), 0.004)                    # strap
    rbox(h, 'boot', (0, -0.395, -0.035), (0.11, 0.13, 0.25), 0.035)                    # boot
    rbox(h, 'dark', (0, -0.455, -0.035), (0.118, 0.03, 0.27), 0.01)                    # sole
    tube(h, 'boot', (0, -0.36, 0.01), (0, -0.30, 0.01), 0.058, 0.056, caps=False)      # boot collar
    for k in range(4): rbox(h, 'dark', (0, -0.345 + k * 0.0 - 0.0, -0.1 + k * 0.035), (0.06, 0.008, 0.01), 0.002)  # laces

# ---------------- torso ----------------
T = 'torso'
rbox(T, 'cloth', (0, 0.12, 0), (0.32, 0.22, 0.2), 0.07)                               # hips and belly
rbox(T, 'cloth', (0, 0.36, 0), (0.38, 0.3, 0.22), 0.08)                               # chest
tube(T, 'dark', (0, 0.5, 0), (0, 0.6, 0), 0.058, 0.055, caps=False)                    # neck (balaclava)
rbox(T, 'dark', (0, 0.04, 0), (0.35, 0.06, 0.23), 0.02)                               # belt
rbox(T, 'acc', (0, 0.04, -0.118), (0.06, 0.04, 0.012), 0.004)                         # buckle
for x in (-0.14, 0.14): rbox(T, 'vest', (x, 0.03, -0.06), (0.05, 0.09, 0.07), 0.012)   # belt pouches
rbox(T, 'vest', (0.17, 0.0, 0.05), (0.04, 0.16, 0.07), 0.012)                         # holster-like pouch
# plate carrier
rbox(T, 'vest', (0, 0.32, -0.125), (0.31, 0.34, 0.055), 0.02)                         # front plate bag
rbox(T, 'vest', (0, 0.33, 0.12), (0.31, 0.36, 0.05), 0.02)                            # back plate bag
rbox(T, 'vest', (0, 0.22, 0), (0.39, 0.13, 0.27), 0.03)                               # cummerbund
for x in (-0.12, 0.12): rbox(T, 'vest', (x, 0.5, -0.02), (0.065, 0.02, 0.22), 0.008)   # shoulder straps
for k, x in enumerate((-0.09, 0.0, 0.09)):
    rbox(T, 'vest', (x, 0.24, -0.172), (0.075, 0.13, 0.05), 0.012)                    # magazine pouches
    rbox(T, 'dark', (x, 0.315, -0.176), (0.075, 0.025, 0.052), 0.006)                 # flaps
rbox(T, 'dark', (0.1, 0.39, -0.16), (0.07, 0.09, 0.035), 0.01)                        # radio
tube(T, 'dark', (0.12, 0.43, -0.16), (0.12, 0.53, -0.15), 0.006, 0.005, caps=False)   # antenna
rbox(T, 'acc', (-0.1, 0.4, -0.157), (0.08, 0.05, 0.008), 0.003)                       # team patch
for x in (-0.205, 0.205): rbox(T, 'acc', (x, 0.47, 0), (0.1, 0.07, 0.17), 0.03)       # shoulder pads (operator colour)
rbox(T, 'vest', (0, 0.33, 0.155), (0.22, 0.18, 0.04), 0.015)                          # back pouch

# ---------------- head ----------------
H = 'head'
ell(H, 'dark', (0, 0.07, 0.005), (0.092, 0.115, 0.102))                               # balaclava
ell(H, 'skin', (0, 0.08, -0.058), (0.06, 0.04, 0.045))                                # eyes band
ell(H, 'vest', (0, 0.095, 0.008), (0.112, 0.118, 0.122), cut=-0.18, seg=28)             # helmet shell
for s in (-1, 1):
    rbox(H, 'dark', (s * 0.113, 0.1, 0.008), (0.012, 0.026, 0.13), 0.005)             # side rails
    ell(H, 'dark', (s * 0.1, 0.055, 0.01), (0.03, 0.05, 0.045))                       # ear protection
rbox(H, 'dark', (0, 0.15, -0.118), (0.05, 0.035, 0.024), 0.008)                       # mount on the front
rbox(H, 'acc', (0, 0.209, 0.03), (0.045, 0.012, 0.08), 0.004)                         # operator stripe
rbox(H, 'dark', (0, 0.085, -0.092), (0.15, 0.046, 0.035), 0.016)                      # goggles
rbox(H, 'skin', (0, 0.105, -0.113), (0.14, 0.032, 0.006), 0.006) if False else None
rbox(H, 'dark', (0, 0.085, 0.0), (0.2, 0.016, 0.19), 0.006)                           # strap

# ---------------- gun (carbine; muzzle at z -0.6, as the game's flash) ----------------
U = 'gun'
rbox(U, 'dark', (0, 0.0, -0.04), (0.05, 0.085, 0.34), 0.008)                          # receiver
rbox(U, 'dark', (0, 0.055, -0.08), (0.03, 0.02, 0.4), 0.004)                          # top rail
rbox(U, 'dark', (0, -0.01, -0.3), (0.056, 0.06, 0.22), 0.012)                         # handguard
tube(U, 'dark', (0, 0.01, -0.4), (0, 0.01, -0.58), 0.011, 0.011, caps=False)          # barrel
rbox(U, 'dark', (0, 0.01, -0.59), (0.03, 0.03, 0.05), 0.006)                          # muzzle device
rbox(U, 'dark', (0, -0.1, -0.1), (0.035, 0.15, 0.065), 0.01, rot=(-0.2, 0, 0))        # magazine
rbox(U, 'dark', (0, -0.085, 0.09), (0.035, 0.11, 0.045), 0.01, rot=(0.3, 0, 0))       # pistol grip
rbox(U, 'dark', (0, -0.01, 0.2), (0.04, 0.09, 0.13), 0.015)                           # stock
tube(U, 'dark', (0, 0.0, 0.12), (0, 0.0, 0.15), 0.015, 0.015, caps=False)             # buffer tube
rbox(U, 'dark', (0, 0.09, -0.06), (0.04, 0.05, 0.09), 0.012)                          # optic
rbox(U, 'acc', (0, -0.05, -0.33), (0.03, 0.04, 0.05), 0.008)                          # vertical grip, tinted

# ---------------- arms in the rifle hold (arms group space; group sits at torso y 0.45) ----------------
A = 'arms'
gun_o = (0.08, -0.14, -0.42)
rh = (gun_o[0], gun_o[1] - 0.085, gun_o[2] + 0.085)          # right hand on the pistol grip
lh = (gun_o[0] - 0.005, gun_o[1] - 0.045, gun_o[2] - 0.30)   # left hand on the handguard
for side, s, hand, pole in (('R', 1, rh, (0.45, -0.45, 0.05)), ('L', -1, lh, (-0.45, -0.35, -0.1))):
    sh = (s * 0.2, 0.02, 0.0)
    el = ik(sh, hand, 0.29, 0.29, pole)
    tube(A, 'cloth', sh, el, 0.052, 0.045)
    tube(A, 'cloth', el, hand, 0.044, 0.035)
    ell(A, 'dark', el, (0.05, 0.05, 0.05))                                               # elbow pad
    wrist = tuple(Vector(el).lerp(Vector(hand), 0.86))
    tube(A, 'dark', wrist, hand, 0.035, 0.038, caps=False)                                # glove cuff
    ell(A, 'dark', hand, (0.04, 0.045, 0.05))                                            # gloved hand

# ---------------- AO, with everything posed together ----------------
for o in sc.objects: o.select_set(False)
objs = [o for L in PARTS.values() for o in L]
for o in objs:
    o.select_set(True); bpy.context.view_layer.objects.active = o
    for m in list(o.modifiers): bpy.ops.object.modifier_apply(modifier=m.name)
    o.select_set(False)
# ground plane for the bake only
bpy.ops.mesh.primitive_plane_add(size=6, location=(0, 0, 0)); ground = bpy.context.object
ground.select_set(False)
sc.render.engine = 'CYCLES'; sc.cycles.device = 'CPU'; sc.cycles.samples = 64
sc.render.bake.target = 'VERTEX_COLORS'; sc.render.bake.use_selected_to_active = False
sc.world = bpy.data.worlds.new('w')
for o in objs:
    ca = o.data.color_attributes.new('Col', 'FLOAT_COLOR', 'POINT'); o.data.color_attributes.active_color = ca
    o.select_set(True)
bpy.context.view_layer.objects.active = objs[0]
bpy.ops.object.bake(type='AO')
bpy.data.objects.remove(ground, do_unlink=True)
# soften: AO 0..1 -> 0.45..1
for o in objs:
    ca = o.data.color_attributes['Col']
    for d in ca.data:
        a = d.color[0]; v = 0.45 + 0.55 * a; d.color = (v, v, v, 1)

if PREV:
    cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam')); sc.collection.objects.link(cam)
    cam.location = (1.3, 2.5, 1.45); cam.rotation_euler = (Vector((0, 0, 0.95)) - cam.location).to_track_quat('-Z', 'Y').to_euler()
    sc.camera = cam
    sun = bpy.data.objects.new('sun', bpy.data.lights.new('sun', 'SUN')); sun.rotation_euler = (0.7, 0.3, 0.8); sun.data.energy = 3; sc.collection.objects.link(sun)
    sc.world.use_nodes = True; sc.world.node_tree.nodes['Background'].inputs['Strength'].default_value = 0.5
    sc.cycles.samples = 24; sc.render.resolution_x = 480; sc.render.resolution_y = 640; sc.render.filepath = PREV
    bpy.ops.render.render(write_still=True)

# ---------------- export each part in its own space ----------------
for part, L in PARTS.items():
    for o in sc.objects: o.select_set(False)
    for o in L:
        o.select_set(True)
    bpy.context.view_layer.objects.active = L[0]
    if len(L) > 1: bpy.ops.object.join()
    ob = bpy.context.view_layer.objects.active
    ob.data.transform(Matrix.Translation(-ORIG[part])); ob.data.update()
    for o in sc.objects: o.select_set(False)
    ob.select_set(True)
    name = part[:-1] if part[-1] in 'RL' and part[:-1] in ('thigh', 'shin') else part
    if part in ('thighL', 'shinL'): name = part  # left side kept separately (pocket on the outside)
    bpy.ops.export_scene.gltf(filepath=os.path.join(OUT, 'op_' + (part if part[-1] in 'RL' else part) + '.glb'), export_format='GLB',
                              use_selection=True, export_materials='EXPORT', export_normals=True, export_texcoords=False,
                              export_vertex_color='ACTIVE', export_all_vertex_colors=False, export_yup=True, export_apply=True)
    tris = sum(len(p.vertices) - 2 for p in ob.data.polygons)
    print(f'SGOP {part} tris {tris}', flush=True)
