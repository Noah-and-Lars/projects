"""An original AK-pattern rifle (classic stamped-receiver layout, our own model) for the first-person view (run inside Blender, headless).
blender -b --python sg_rifle2.py -- <out-dir> [preview.png]

Built in the game's gun space (x right, y up, -z forward, metres) on the existing rifle's anchor points, so the hands,
grips and reload animation fit unchanged: bore at y 0.031, muzzle at z -0.57, magazine well around z -0.09 (magazine
straight down), pistol grip around (0, -0.062, 0.038) raked 0.173 rad, trigger at (0, -0.024, -0.018), handguard round
the bore from z -0.13 to -0.43, stock to z 0.32.
Materials: anodised aluminium, polymer, steel, glass, red dot. Edge wear (Cycles pointiness), scuffs and ambient
occlusion are baked into one 2048 atlas. Writes rifle2.bin (parts: body by material, magazine separately) + rifle2.jpg.
"""
import bpy, bmesh, sys, os, math, json
import numpy as np
from mathutils import Vector, Matrix, Euler

argv = sys.argv[sys.argv.index('--') + 1:]
OUT = argv[0]; PREV = argv[1] if len(argv) > 1 else None
os.makedirs(OUT, exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene

def G(x, y, z): return Vector((x, -z, y))  # game -> Blender
MATS = {}
def mat(name, col, wear_col, rough, metal):
    m = bpy.data.materials.new(name); m.use_nodes = True; nt = m.node_tree; N = nt.nodes; L = nt.links
    b = N['Principled BSDF']; b.inputs['Roughness'].default_value = rough; b.inputs['Metallic'].default_value = metal
    geo = N.new('ShaderNodeNewGeometry'); ramp = N.new('ShaderNodeValToRGB')
    ramp.color_ramp.elements[0].position = 0.535; ramp.color_ramp.elements[1].position = 0.6
    noise = N.new('ShaderNodeTexNoise'); noise.inputs['Scale'].default_value = 140.0; noise.inputs['Detail'].default_value = 6.0
    nr = N.new('ShaderNodeValToRGB'); nr.color_ramp.elements[0].position = 0.42; nr.color_ramp.elements[1].position = 0.62
    mul = N.new('ShaderNodeMath'); mul.operation = 'MULTIPLY'
    L.new(geo.outputs['Pointiness'], ramp.inputs['Fac']); L.new(noise.outputs['Fac'], nr.inputs['Fac'])
    L.new(ramp.outputs['Color'], mul.inputs[0]); L.new(nr.outputs['Color'], mul.inputs[1])
    # scuffs: a second, sparse noise
    sc_n = N.new('ShaderNodeTexNoise'); sc_n.inputs['Scale'].default_value = 34.0; sc_n.inputs['Detail'].default_value = 3.0
    sr = N.new('ShaderNodeValToRGB'); sr.color_ramp.elements[0].position = 0.74; sr.color_ramp.elements[1].position = 0.8
    L.new(sc_n.outputs['Fac'], sr.inputs['Fac'])
    add = N.new('ShaderNodeMath'); add.operation = 'MAXIMUM'; L.new(mul.outputs[0], add.inputs[0])
    sm = N.new('ShaderNodeMath'); sm.operation = 'MULTIPLY'; sm.inputs[1].default_value = 0.1; L.new(sr.outputs['Color'], sm.inputs[0]); L.new(sm.outputs[0], add.inputs[1])
    mix = N.new('ShaderNodeMix'); mix.data_type = 'RGBA'
    mix.inputs['A'].default_value = (*col, 1); mix.inputs['B'].default_value = (*wear_col, 1)
    L.new(add.outputs[0], mix.inputs['Factor'])
    ao = N.new('ShaderNodeAmbientOcclusion'); ao.inputs['Distance'].default_value = 0.02; ao.samples = 16
    L.new(mix.outputs['Result'], ao.inputs['Color'])
    aom = N.new('ShaderNodeMix'); aom.data_type = 'RGBA'; aom.blend_type = 'MULTIPLY'; aom.inputs['Factor'].default_value = 0.75
    L.new(mix.outputs['Result'], aom.inputs['A']); L.new(ao.outputs['AO'], aom.inputs['B'])
    L.new(aom.outputs['Result'], b.inputs['Base Color'])
    MATS[name] = m; return m
mat('alu', (0.05, 0.052, 0.056), (0.24, 0.245, 0.25), 0.45, 0.6)
mat('poly', (0.04, 0.04, 0.042), (0.1, 0.1, 0.1), 0.7, 0.0)
mat('steel', (0.028, 0.028, 0.03), (0.26, 0.26, 0.27), 0.38, 0.85)
mat('polymag', (0.04, 0.04, 0.042), (0.1, 0.1, 0.1), 0.7, 0.0)  # the magazine: polymer, kept apart for the reload
gl = bpy.data.materials.new('glass'); gl.use_nodes = True; gl.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (0.05, 0.12, 0.1, 1); MATS['glass'] = gl
rd = bpy.data.materials.new('red'); rd.use_nodes = True; rd.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (1, 0.1, 0.05, 1); MATS['red'] = rd

PARTS = []  # (object, material, group)
def finish(o, m, group='body', bevel=0.0, seg=2):
    if group == 'mag' and m == 'poly': m = 'polymag'
    o.data.materials.clear(); o.data.materials.append(MATS[m])
    if bevel:
        b = o.modifiers.new('bv', 'BEVEL'); b.width = bevel; b.segments = seg; b.limit_method = 'ANGLE'; b.angle_limit = math.radians(40)
    for p in o.data.polygons: p.use_smooth = True
    PARTS.append((o, m, group)); return o
def box(c, size, m, rot=(0, 0, 0), bevel=0.0015, group='body', seg=2):
    bpy.ops.mesh.primitive_cube_add(size=1); o = bpy.context.object
    o.scale = (size[0], size[2], size[1]); o.rotation_euler = Euler((rot[0], -rot[2], rot[1]))
    o.location = G(*c); bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    return finish(o, m, group, bevel, seg)
def cyl(a, b, r, m, verts=24, r2=None, group='body', bevel=0.0008, rot_off=0.0):
    A, B = G(*a), G(*b); d = B - A
    bpy.ops.mesh.primitive_cone_add(vertices=verts, radius1=r, radius2=r2 if r2 is not None else r, depth=d.length); o = bpy.context.object
    q = d.to_track_quat('Z', 'Y'); o.rotation_euler = q.to_euler(); o.rotation_euler.rotate_axis('Z', rot_off)
    o.location = (A + B) / 2; bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    return finish(o, m, group, bevel)
def cut(target, cutter):
    m = target.modifiers.new('cut', 'BOOLEAN'); m.operation = 'DIFFERENCE'; m.object = cutter; m.solver = 'EXACT'
    bpy.context.view_layer.objects.active = target; bpy.ops.object.modifier_apply(modifier='cut')
    bpy.data.objects.remove(cutter, do_unlink=True)
def cutter_box(c, size, rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_cube_add(size=1); o = bpy.context.object
    o.scale = (size[0], size[2], size[1]); o.rotation_euler = Euler((rot[0], -rot[2], rot[1])); o.location = G(*c)
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True); return o

BY = 0.03  # bore height
def bend_box(c0, c1, w, d, m, group='body', bevel=0.003):
    """a box from point c0 to c1 (game y, z), width w (x), depth d across its length"""
    (y0, z0), (y1, z1) = c0, c1; L = math.hypot(y1 - y0, z1 - z0); ang = math.atan2(z1 - z0, y1 - y0)
    return box((0, (y0 + y1) / 2, (z0 + z1) / 2), (w, L, d), m, rot=(-ang if False else ang, 0, 0), bevel=bevel, group=group)
# ---- receiver: stamped steel, rounded dust cover, rails of the rear sight, trunnion ----
rc = box((0, 0.02, -0.01), (0.029, 0.06, 0.22), 'steel', bevel=0.0025, seg=3)
cut(rc, cutter_box((0.0145, 0.03, -0.055), (0.006, 0.014, 0.06)))                  # ejection port
cyl((0, 0.05, -0.115), (0, 0.05, 0.1), 0.0142, 'steel', 32, bevel=0.0006)         # dust cover
for i in range(5): box((0, 0.064, -0.08 + i * 0.04), (0.012, 0.003, 0.004), 'steel', bevel=0.0005)   # cover ribs
box((0.0158, 0.022, 0.0), (0.0025, 0.012, 0.12), 'steel', rot=(0.06, 0, 0), bevel=0.0008)           # selector lever
box((0.022, 0.04, -0.02), (0.012, 0.007, 0.01), 'steel', bevel=0.0015)            # charging handle
box((0, 0.008, -0.14), (0.03, 0.05, 0.04), 'steel', bevel=0.002)                  # trunnion
box((0, 0.062, -0.135), (0.02, 0.016, 0.05), 'steel', bevel=0.0015)               # rear sight block
box((0, 0.074, -0.13), (0.016, 0.004, 0.035), 'steel', rot=(0.05, 0, 0), bevel=0.0006)  # rear sight leaf
box((0, -0.03, -0.12), (0.027, 0.03, 0.06), 'steel', bevel=0.0025)                # magazine well
box((0, -0.042, -0.03), (0.012, 0.004, 0.08), 'steel', bevel=0.001)               # trigger guard
box((0, -0.03, -0.068), (0.012, 0.026, 0.004), 'steel', bevel=0.001)
box((0, -0.028, -0.02), (0.004, 0.024, 0.006), 'steel', rot=(0.25, 0, 0), bevel=0.0008)  # trigger
box((0, -0.022, 0.04), (0.027, 0.03, 0.075), 'steel', bevel=0.002)              # lower rear of the receiver: the grip mounts here
gp = box((0, -0.068, 0.05), (0.03, 0.095, 0.036), 'poly', rot=(-0.3, 0, 0), bevel=0.009, seg=4)  # pistol grip
for i in range(4): box((0, -0.045 - i * 0.02, 0.046 + i * 0.006 + 0.018), (0.027, 0.003, 0.004), 'poly', rot=(-0.3, 0, 0), bevel=0.001)
# ---- handguards: an oval lower, a gas tube cover, the gas block and front sight, barrel, brake ----
lh = cyl((0, 0.012, -0.165), (0, 0.012, -0.37), 0.026, 'poly', 32, bevel=0.003)
lh.scale = (0.88, 1.0, 1.15); bpy.context.view_layer.objects.active = lh; bpy.ops.object.transform_apply(scale=True)
for i in range(3): box((0, 0.012 - 0.029, -0.2 - i * 0.06), (0.03, 0.004, 0.012), 'poly', bevel=0.001)   # finger ridges underneath
cyl((0, 0.048, -0.17), (0, 0.048, -0.36), 0.0135, 'poly', 24, bevel=0.002)          # gas tube cover
cyl((0, BY, -0.37), (0, BY, -0.64), 0.0092, 'steel', 20)                             # barrel
box((0, 0.042, -0.385), (0.02, 0.04, 0.03), 'steel', bevel=0.002)                    # gas block
box((0, 0.045, -0.6), (0.016, 0.032, 0.022), 'steel', bevel=0.0015)                  # front sight base
box((0, 0.068, -0.6), (0.002, 0.016, 0.002), 'steel', bevel=0.0003)                  # front sight post
for s in (-1, 1): box((s * 0.007, 0.072, -0.6), (0.002, 0.022, 0.012), 'steel', bevel=0.0004)  # post ears
mb = cyl((0, BY, -0.635), (0, BY, -0.69), 0.0125, 'steel', 24, bevel=0.0008)         # muzzle brake
cut(mb, cutter_box((0, BY + 0.016, -0.685), (0.03, 0.02, 0.03), rot=(0.5, 0, 0)))  # its slanted cut
cut(mb, cutter_box((0.012, BY, -0.66), (0.01, 0.006, 0.01)))
# ---- stock: tapering from the receiver to the butt ----
st = box((0, 0.004, 0.27), (0.034, 0.07, 0.34), 'poly', bevel=0.007, seg=4)
bm = bmesh.new(); bm.from_mesh(st.data)
for v in bm.verts:   # the butt end (game z > 0.27) drops and grows
    gz = -v.co.y
    if gz > 0.27: v.co.z -= (gz - 0.27) * 0.25 * (1 if v.co.z < 0.004 else 0.2)
bm.to_mesh(st.data); bm.free()
box((0, -0.018, 0.452), (0.036, 0.11, 0.016), 'poly', bevel=0.005, seg=3)            # butt plate
# ---- magazine: curved forward, ribbed ----
pts = [(-0.02, -0.105), (-0.07, -0.112), (-0.12, -0.124), (-0.17, -0.141), (-0.215, -0.162)]
for i in range(4):
    bend_box(pts[i], pts[i + 1], 0.024, 0.064 - i * 0.002, 'poly', group='mag', bevel=0.003)
    for s in (-1, 1): bend_box((pts[i][0] - 0.004, pts[i][1]), (pts[i + 1][0] + 0.004, pts[i + 1][1]), 0.003, 0.03, 'poly', group='mag', bevel=0.0008) if False else None
for i in range(4):
    for s in (-1, 1):
        y, z = (pts[i][0] + pts[i + 1][0]) / 2, (pts[i][1] + pts[i + 1][1]) / 2
        box((s * 0.0125, y, z), (0.002, 0.005, 0.05), 'poly', rot=(0.15 + i * 0.12, 0, 0), bevel=0.0008, group='mag')
box((0, -0.226, -0.168), (0.028, 0.012, 0.07), 'poly', rot=(0.5, 0, 0), bevel=0.003, group='mag')   # floor plate
# ---- apply modifiers ----
for o, m, g in PARTS:
    bpy.context.view_layer.objects.active = o
    for md in list(o.modifiers): bpy.ops.object.modifier_apply(modifier=md.name)
    if hasattr(o.data, 'set_sharp_from_angle'): o.data.set_sharp_from_angle(angle=math.radians(38))  # flat faces stay crisp, bevels stay round

# ---- one atlas for all parts: join by group, smart uv, bake the material colour (wear, scuffs, AO) ----
for o in sc.objects: o.select_set(False)
objs = [o for o, m, g in PARTS]
for o in objs: o.select_set(True)
bpy.context.view_layer.objects.active = objs[0]; bpy.ops.object.join()
J = bpy.context.view_layer.objects.active
# remember which faces are the magazine (by material index after join, the group is lost): tag with a vertex group
mag_set = set()
bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT')
bpy.ops.uv.smart_project(angle_limit=math.radians(55), island_margin=0.003, scale_to_bounds=False)
bpy.ops.uv.pack_islands(margin=0.003); bpy.ops.object.mode_set(mode='OBJECT')
img = bpy.data.images.new('rifle2', 2048, 2048)
# empty slots (left by the boolean cuts) take the aluminium
for i, m in enumerate(J.data.materials):
    if m is None: J.data.materials[i] = MATS['alu']
for m in set(J.data.materials):
    nt = m.node_tree; tn = nt.nodes.new('ShaderNodeTexImage'); tn.image = img; nt.nodes.active = tn
sc.render.engine = 'CYCLES'; sc.cycles.device = 'CPU'; sc.cycles.samples = 32
sc.render.bake.target = 'IMAGE_TEXTURES'; sc.render.bake.use_selected_to_active = False; sc.render.bake.margin = 6
sc.world = bpy.data.worlds.new('w')
for o in sc.objects: o.select_set(False)
J.select_set(True); bpy.context.view_layer.objects.active = J
bpy.ops.object.bake(type='DIFFUSE', pass_filter={'COLOR'})
img.filepath_raw = os.path.join(OUT, 'rifle2.png'); img.file_format = 'PNG'; img.save()

# ---- export: split by material; the magazine faces are those below the receiver around the well ----
me = J.data; me.calc_loop_triangles()
uvl = me.uv_layers.active.data
names = [m.name for m in me.materials]
out, blobs, off = [], [], 0
def put(a):
    global off
    b = a.tobytes(); pad = (-len(b)) % 4; blobs.append(b + b'\0' * pad); o = off; off += len(b) + pad; return o
groups = {}
for tri in me.loop_triangles:
    mname = names[me.polygons[tri.polygon_index].material_index]
    # magazine: polymer triangles below y -0.033 (game) between z -0.16 and -0.03
    cs = [me.vertices[me.loops[li].vertex_index].co for li in tri.loops]
    gy = sum(c.z for c in cs) / 3; gz = -sum(c.y for c in cs) / 3
    grp = 'mag' if mname == 'polymag' else 'body'
    if mname == 'polymag': mname = 'poly'
    groups.setdefault((mname, grp), []).append(tri)
for (mname, grp), tris in groups.items():
    vmap, P, N, UV, I = {}, [], [], [], []
    for tri in tris:
        for li in tri.loops:
            vi = me.loops[li].vertex_index; uv = tuple(uvl[li].uv); n = tuple(me.corner_normals[li].vector) if hasattr(me, 'corner_normals') else tuple(me.vertices[vi].normal)
            key = (vi, round(uv[0], 5), round(uv[1], 5), round(n[0], 3), round(n[1], 3), round(n[2], 3))
            if key not in vmap:
                co = me.vertices[vi].co; vmap[key] = len(P); P.append((co.x, co.z, -co.y)); N.append((n[0], n[2], -n[1])); UV.append(uv)
            I.append(vmap[key])
    nv = len(P)
    out.append({'mat': mname, 'group': grp, 'nv': nv, 'ni': len(I), 'pos': put(np.array(P, np.float32)), 'nor': put(np.array(N, np.float32)),
                'uv': put(np.array(UV, np.float32)), 'idx': put(np.array(I, np.uint16 if nv < 65536 else np.uint32)), 'i32': nv >= 65536})
    print(f'SGCARB {mname}/{grp}: {nv} verts {len(I) // 3} tris', flush=True)
H = {'v': 1, 'parts': out, 'tex': 'rifle2.jpg', 'muzzle': [0, BY, 0.69], 'eject': [0.016, 0.034, 0.055]}
hb = json.dumps(H).encode(); hb += b' ' * ((-len(hb)) % 4)
with open(os.path.join(OUT, 'rifle2.bin'), 'wb') as f:
    f.write(len(hb).to_bytes(4, 'little')); f.write(hb)
    for b in blobs: f.write(b)
print('SGCARB wrote', os.path.getsize(os.path.join(OUT, 'rifle2.bin')) // 1024, 'KB', flush=True)

if PREV:
    # a look in Cycles with the baked colour on everything
    for m in set(J.data.materials):
        nt = m.node_tree; b = nt.nodes['Principled BSDF']
        tn = [n for n in nt.nodes if n.type == 'TEX_IMAGE'][0]
        for l in list(b.inputs['Base Color'].links): nt.links.remove(l)
        nt.links.new(tn.outputs['Color'], b.inputs['Base Color'])
    cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam')); sc.collection.objects.link(cam); cam.data.lens = 50
    cam.location = G(1.25, 0.32, 0.12); cam.rotation_euler = (G(0, -0.02, -0.12) - cam.location).to_track_quat('-Z', 'Y').to_euler(); sc.camera = cam
    sun = bpy.data.objects.new('sun', bpy.data.lights.new('sun', 'SUN')); sun.data.energy = 3; sun.rotation_euler = (0.7, 0.2, 0.9); sc.collection.objects.link(sun)
    sc.world.use_nodes = True; sc.world.node_tree.nodes['Background'].inputs['Strength'].default_value = 0.8
    sc.cycles.samples = 48; sc.render.resolution_x = 1100; sc.render.resolution_y = 520; sc.render.filepath = PREV
    bpy.ops.render.render(write_still=True)
