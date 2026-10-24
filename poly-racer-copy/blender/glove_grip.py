# The cockpit glove: the rigged glove (Sketchfab a88b04f2..., "Glove Rigged" by Masterbauer, CC-BY) posed gripping a
# steering-wheel rim, put in the game's hand frame and written as an FCM part. Hand frame (metres): the rim's tube runs
# along +y through the origin; the palm faces -x (the wheel's centre); the wrist is towards the driver (+z).
#   blender -b --python grip.py -- <src> <out-dir> <curl> <thumb> [render]
import bpy, sys, os, glob, functools, math, json, struct
import numpy as np
from mathutils import Vector, Matrix
print = functools.partial(print, flush=True)
argv = sys.argv[sys.argv.index('--') + 1:]; src, out = argv[:2]; curl = float(argv[2]); tcurl = float(argv[3]); render = len(argv) > 4 and argv[4] == 'render'
RIM_R = 0.0165   # tube radius of a steering wheel rim
os.makedirs(out, exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=glob.glob(os.path.join(src, '*.gltf'))[0])
for o in list(bpy.data.objects):
    if o.type == 'MESH' and o.name.startswith('Icosphere'): bpy.data.objects.remove(o)
arm = [o for o in bpy.data.objects if o.type == 'ARMATURE'][0]
glove = [o for o in bpy.data.objects if o.type == 'MESH'][0]
def deformed():
    bpy.context.view_layer.update()
    dg = bpy.context.evaluated_depsgraph_get(); ev = glove.evaluated_get(dg); me = ev.to_mesh()
    P = np.array([tuple(glove.matrix_world @ v.co) for v in me.vertices]); ev.to_mesh_clear(); return P
def bone_world(name, tail=False):
    pb = [b for b in arm.pose.bones if b.name.split('_')[0] == name][0]
    return np.array(arm.matrix_world @ (pb.tail if tail else pb.head))
# the frame from the open hand: finger direction, across the knuckles, and the side the fingers curl to
for pb in arm.pose.bones: pb.rotation_mode = 'XYZ'
P0 = deformed()
wrist = bone_world('arm1.02') if any(b.name.startswith('arm1.02') for b in arm.pose.bones) else None
names = [b.name.split('_')[0] for b in arm.pose.bones]
wr = bone_world([n for n in names if n.startswith('arm1')][0])
knM = bone_world('Middle.001'); knI = bone_world('Index.001'); knP = bone_world('pinky.001')
tipM0 = bone_world('Middle.004', tail=True)
def setpose(c, t):
    for pb in arm.pose.bones:
        n = pb.name.split('_')[0]
        pb.rotation_euler = (0, 0, 0)
        for f in ('Index', 'Middle', 'Ring', 'pinky'):
            if n.startswith(f + '.') and not n.endswith('end'):
                k = int(n.split('.')[1])   # 1 = knuckle .. 4 = tip
                pb.rotation_euler = (c * (1.15 if k == 1 else 1.0 if k < 4 else 0.7), 0, 0)
        if n.startswith('Thumb.'):
            pb.rotation_euler = (t, 0, 0)
setpose(0, 0); P0 = deformed()   # the open hand in the same (rest) pose the curls start from
setpose(0.5, 0)
P1 = deformed()
# the hand's directions from the mesh itself (the rig's bones live in another space): the fingertips are what moves
# most when the fingers curl, the cuff is the far end from them, and the fingers curl towards the palm
disp = P1 - P0; mv = np.linalg.norm(disp, axis=1); tip = mv > np.quantile(mv, 0.95)
tips0 = P0[tip].mean(0); dist = np.linalg.norm(P0 - tips0, axis=1); cuffc = P0[dist > np.quantile(dist, 0.97)].mean(0)
# the hand's length: the long axis of the open hand, pointing to the end that moves when the fingers curl
cen = P0.mean(0); w_, V_ = np.linalg.eigh((P0 - cen).T @ (P0 - cen)); F = V_[:, -1]
if (tips0 - cen).dot(F) < 0: F = -F
cuffc = cen - F * np.abs((P0 - cen) @ F).max() * 0.9
Np = disp[tip].mean(0); Np -= F * Np.dot(F); Np /= np.linalg.norm(Np)
A = np.cross(F, Np)
# the thumb: which side of the hand moves when only the thumb curls
setpose(0, 0.6); Pt = deformed(); tm = np.linalg.norm(Pt - P0, axis=1); th = tm > np.quantile(tm, 0.97)
thumb_side = float((P0[th].mean(0) - P0.mean(0)).dot(A))
print('[gg] thumb on', '+A' if thumb_side > 0 else '-A', round(thumb_side, 3))
if thumb_side < 0: A = -A   # index and thumb on +y (a right hand); a left-hand model is mirrored by that
wr = cuffc; tipM0 = tips0
print('[gg] hand length', round(float(np.linalg.norm(tipM0 - wr)), 3), 'det', round(float(np.linalg.det(np.stack([-Np, A, -F]))), 2))
# the frame: finger direction -> -z, palm normal -> -x, index side -> +y (a right hand at 3 o'clock)
R = np.stack([-Np, A, -F])     # rows: new x, y, z
scale = 0.1                    # the model is in decimetres
def grip_hole(Q):
    """the biggest empty circle the fingers wrap round, in the x-z plane of the slab across the palm"""
    sl = Q[np.abs(Q[:, 1] - np.median(Q[:, 1])) < 0.025][:, [0, 2]]
    lo, hi = sl.min(0), sl.max(0); best = (-1, None)
    zcap = Q[:, 2].max() - 0.075          # not the hollow inside the cuff: the grip is towards the fingers
    for x in np.linspace(lo[0], hi[0], 60):
        for z in np.linspace(lo[1], min(hi[1], zcap), 60):
            d = sl - (x, z); r = np.sqrt((d ** 2).sum(1))
            near = r < 0.06
            if near.sum() < 50: continue
            ang = np.floor((np.arctan2(d[near, 1], d[near, 0]) + np.pi) / (np.pi / 4)).astype(int)
            if len(set(ang.tolist())) < 7: continue            # enclosed on nearly every side
            c = r.min()
            if c > best[0]: best = (c, (x, z))
    return best
res = None
for c in [curl] if curl > 0 else [0.55, 0.65, 0.75, 0.85, 0.95, 1.05]:
    setpose(c, tcurl)
    Qc = deformed() @ R.T * scale
    rad, at = grip_hole(Qc)
    print('[gg] curl', c, 'hole radius', None if at is None else round(float(rad), 4))
    if at is None: continue
    score = abs(rad - (RIM_R + 0.0025))
    if res is None or score < res[0]: res = (score, c, Qc, at, rad)
_, curl, Q, at, rad = res
Q = Q - np.array([at[0], np.median(Q[:, 1]), at[1]])
print('[gg] chose curl', curl, 'hole', round(float(rad), 4))
_pr = (P0 - cen) @ F; _ce = _pr < _pr.min() * 0.7; _te = _pr > _pr.max() * 0.7
print('[gg] dbg F', F.round(2), 'Np', Np.round(2), 'A', A.round(2), 'extent along F', round(float(_pr.min()), 3), round(float(_pr.max()), 3))
setpose(curl, tcurl); _Pc = deformed(); print('[gg] dbg cuff moved', np.linalg.norm(_Pc[_ce] - P0[_ce], axis=1).max().round(3), 'tip moved', np.linalg.norm(_Pc[_te] - P0[_te], axis=1).mean().round(3), 'Q-vs-Pc', np.abs((_Pc[_ce] - P0[_ce])).mean(0).round(3))
print('[gg] dbg P0 extents', (P0.max(0) - P0.min(0)).round(3), 'cuff-end in frame', Q[_ce].mean(0).round(3), 'tip-end in frame', Q[_te].mean(0).round(3))
print('[gg] frame bbox', Q.min(0).round(3), Q.max(0).round(3))
# write the posed mesh back so it can be rendered and baked
me = glove.data
mod = [m for m in glove.modifiers if m.type == 'ARMATURE']
for m in mod: glove.modifiers.remove(m)
glove.parent = None; glove.matrix_world = Matrix.Identity(4)
for i, v in enumerate(me.vertices): v.co = Vector(Q[i])
me.update()
bpy.data.objects.remove(arm)
# lighter and tidy: about 12k triangles, normals pointing out everywhere
for o in bpy.context.selected_objects: o.select_set(False)
glove.select_set(True); bpy.context.view_layer.objects.active = glove
dec = glove.modifiers.new('dec', 'DECIMATE'); dec.ratio = float(os.environ.get('GLOVE_RATIO', '0.12'))
bpy.ops.object.modifier_apply(modifier='dec')
bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT'); bpy.ops.mesh.normals_make_consistent(inside=False); bpy.ops.object.mode_set(mode='OBJECT')
bpy.ops.object.shade_smooth()
me = glove.data
Q = np.array([tuple(v.co) for v in me.vertices])
print('[gg] decimated to', len(me.polygons), 'faces')
# the rim, for the check render and the occlusion bake
bpy.ops.mesh.primitive_cylinder_add(radius=RIM_R, depth=0.4, vertices=32, location=(0, 0, 0), rotation=(math.pi / 2, 0, 0))
rim = bpy.context.active_object; rim.name = 'rim'
rm = bpy.data.materials.new('rimM'); rm.diffuse_color = (0.05, 0.05, 0.05, 1); rim.data.materials.append(rm)
# baked occlusion into a colour attribute
sc = bpy.context.scene; sc.render.engine = 'CYCLES'; sc.cycles.device = 'CPU'; sc.cycles.samples = 64
if not sc.world: sc.world = bpy.data.worlds.new('w0')
sc.world.light_settings.distance = 0.025
# occlusion, worked out here: rays from each point over both sides of its surface (the model's normals can't be
# trusted to point out everywhere), the open side's share of rays that get away within 3 cm, the rim included
from mathutils.bvhtree import BVHTree
from mathutils import Vector as _V
import random
dg = bpy.context.evaluated_depsgraph_get()
bvh_g = BVHTree.FromObject(glove, dg); bvh_r = BVHTree.FromObject(rim, dg)
rnd = random.Random(7); dirs = []
while len(dirs) < 40:
    v = _V((rnd.uniform(-1, 1), rnd.uniform(-1, 1), rnd.uniform(-1, 1)))
    if 0.05 < v.length <= 1: dirs.append(v.normalized())
ao = np.zeros(len(me.vertices))
for i, v in enumerate(me.vertices):
    n = v.normal; o = v.co
    best = 0
    for sgn in (1, -1):
        free = tot = 0
        for d in dirs:
            c = d.dot(n) * sgn
            if c <= 0.05: continue
            start = o + n * (sgn * 0.0006)
            hit = bvh_g.ray_cast(start, d, 0.03)[0] is not None or bvh_r.ray_cast(start, d, 0.03)[0] is not None
            free += c * (0 if hit else 1); tot += c
        if tot: best = max(best, free / tot)
    ao[i] = best
ca = me.color_attributes.new('ao', 'BYTE_COLOR', 'POINT')
for i, c in enumerate(ca.data): c.color = (ao[i], ao[i], ao[i], 1)
print('[gg] ao mean', round(float(ao.mean()), 3), 'min', round(float(ao.min()), 3))
if render:
    gm = bpy.data.materials.new('gm'); gm.use_nodes = True
    nt = gm.node_tree; b = nt.nodes['Principled BSDF']; b.inputs['Base Color'].default_value = (0.08, 0.08, 0.09, 1); b.inputs['Roughness'].default_value = 0.6
    vc = nt.nodes.new('ShaderNodeVertexColor'); vc.layer_name = 'ao'; mul = nt.nodes.new('ShaderNodeMix'); mul.data_type = 'RGBA'; mul.blend_type = 'MULTIPLY'; mul.inputs[0].default_value = 1
    mul.inputs[6].default_value = (0.75, 0.12, 0.1, 1); nt.links.new(vc.outputs[0], mul.inputs[7]); nt.links.new(mul.outputs[2], b.inputs['Base Color'])
    me.materials.clear(); me.materials.append(gm)
    w = bpy.data.worlds.new('w'); w.use_nodes = True; w.node_tree.nodes['Background'].inputs[0].default_value = (0.75, 0.75, 0.8, 1); sc.world = w
    sc.cycles.samples = 24; sc.render.resolution_x = 420; sc.render.resolution_y = 420
    cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam')); sc.collection.objects.link(cam); sc.camera = cam
    c = Vector(((Q.min(0) + Q.max(0)) / 2).tolist()); r = float(np.linalg.norm(Q.max(0) - Q.min(0)))
    for name, d in (('driver', Vector((0.25, 0.1, 1))), ('side', Vector((0, -1, 0.15))), ('front', Vector((0.3, 0.2, -1))), ('out', Vector((1, 0.1, 0.3)))):
        cam.location = c + d.normalized() * r * 1.5; cam.rotation_euler = (c - cam.location).to_track_quat('-Z', 'Y').to_euler()
        sc.render.filepath = os.path.join(out, 'grip_' + name + '.png'); bpy.ops.render.render(write_still=True)
# write the FCM part: positions, normals, colours (white) + occlusion, uvs if any
bpy.data.objects.remove(rim)
me.calc_loop_triangles()
nv = len(me.vertices)
# the game's loader turns models round (x and z negated), so they are written turned round already
FL = np.array([-1, 1, -1], np.float32)
pos = (Q * FL).astype(np.float32)
nrm = np.array([tuple(v.normal) for v in me.vertices], np.float32) * FL
tri = np.array([tuple(t.vertices) for t in me.loop_triangles], np.uint32)
uv = None
if me.uv_layers:
    uvl = me.uv_layers.active.data; uv = np.zeros((nv, 2), np.float32)
    for t in me.loop_triangles:
        for li, vi in zip(t.loops, t.vertices): uv[vi] = tuple(uvl[li].uv)
def al(b): return b + b'\0' * (-len(b) % 4)
blob = b''; part = {'v': nv, 'i': int(tri.size), 'groups': [{'s': 0, 'n': int(tri.size), 'k': 'plain', 'col': [1, 1, 1], 'r': 0.7, 'm': 0}]}
part['po'] = len(blob); blob += pos.tobytes(); blob = al(blob)
part['no'] = len(blob); blob += np.clip(np.round(nrm * 127), -127, 127).astype(np.int8).tobytes(); blob = al(blob)
part['co'] = len(blob); blob += np.full((nv, 3), 255, np.uint8).tobytes(); blob = al(blob)
part['ao'] = len(blob); blob += np.clip(np.round(ao * 255), 0, 255).astype(np.uint8).tobytes(); blob = al(blob)
if uv is not None: part['uo'] = len(blob); blob += uv.tobytes(); blob = al(blob)
big = nv > 65535; part['i32'] = big
part['io'] = len(blob); blob += (tri.astype(np.uint32) if big else tri.astype(np.uint16)).tobytes(); blob = al(blob)
# the wrist (where the sleeve goes in): the middle of the glove's cuff end
cz = Q[:, 2].max(); cuff = Q[Q[:, 2] > cz - 0.01]
meta = {'wrist': [round(float(x), 4) for x in cuff.mean(0)], 'cuffR': round(float(np.linalg.norm(cuff[:, :2] - cuff[:, :2].mean(0), axis=1).mean()), 4), 'rimR': RIM_R,
        'credit': '"Glove Rigged" by Masterbauer (Sketchfab, CC Attribution), posed for the game'}
hj = json.dumps({'parts': {'glove': part}, 'meta': meta}).encode(); hj += b' ' * (-(8 + len(hj)) % 4)
open(os.path.join(out, 'glove.fcm'), 'wb').write(b'FCM1' + struct.pack('<I', len(hj)) + hj + blob)
print('[gg] wrote glove.fcm', nv, 'verts', tri.shape[0], 'tris', 'uv' if uv is not None else 'no uv', meta)
