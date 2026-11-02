"""Realistic operators from MakeHuman's CC0 data (run inside Blender, headless). No MakeHuman code is used: this
script reads the data files itself (base mesh, shape targets, .proxy/.mhclo fitting, .mhmat materials).

blender -b --python sg_human.py -- <mh-assets> <base-dir> <out-dir> <variant> [stage] [preview.png]
  variant: cauc | afr | asian     stage: fit (stop after fitting, preview) | all (default)

Builds a young adult male (shape target per variant), the low-poly body proxy with the variant's skin, eyes and
eyebrows, a combat shirt and trousers (recoloured from the casual suit, folds kept), boots and gloves, then (stage
'all') poses it holding a carbine, rigs it to the game's parts and exports one character file.
Axes: MakeHuman is y up, facing +z, in decimetres; the game is y up, facing -z, in metres; Blender is z up.
"""
import bpy, bmesh, sys, os, math, json, re
import numpy as np
from mathutils import Vector, Matrix, Quaternion

argv = sys.argv[sys.argv.index('--') + 1:]
MH, BASE, OUT, VAR = argv[0], argv[1], argv[2], argv[3]
STAGE = argv[4] if len(argv) > 4 else 'all'
PREV = argv[5] if len(argv) > 5 else None
os.makedirs(OUT, exist_ok=True)
VARS = {
    'cauc': {'target': 'caucasian-male-young', 'skin': 'skins/young_caucasian_male/young_caucasian_male.mhmat', 'eyes': 'brown'},
    'afr': {'target': 'african-male-young', 'skin': 'skins/young_african_male/young_african_male.mhmat', 'eyes': 'brown'},
    'asian': {'target': 'asian-male-young', 'skin': 'skins/young_asian_male/young_asian_male.mhmat', 'eyes': 'brownlight'},
}
V = VARS[VAR]

# ---------------- data readers ----------------
def read_obj(path):
    vs, vts, faces, groups, g = [], [], [], [], None
    for line in open(path, encoding='utf-8', errors='ignore'):
        if line.startswith('v '): vs.append([float(t) for t in line.split()[1:4]])
        elif line.startswith('vt '): vts.append([float(t) for t in line.split()[1:3]])
        elif line.startswith('g '): g = line.split()[1] if len(line.split()) > 1 else None
        elif line.startswith('f '):
            f = []
            for t in line.split()[1:]:
                p = t.split('/'); f.append((int(p[0]) - 1, int(p[1]) - 1 if len(p) > 1 and p[1] else -1))
            faces.append(f); groups.append(g)
    return np.array(vs, np.float64), np.array(vts, np.float64) if vts else None, faces, groups

def read_target(name):
    d = []
    for line in open(os.path.join(BASE, name + '.target')):
        if line.startswith('#') or not line.strip(): continue
        t = line.split(); d.append((int(t[0]), float(t[1]), float(t[2]), float(t[3])))
    return d

def read_fit(path):
    """.proxy / .mhclo: scale references, per-vertex references (1 or 3 base vertices + offset), hidden base verts"""
    sc, refs, dele, info, sect = {}, [], set(), {}, None
    for line in open(path, encoding='utf-8', errors='ignore'):
        s = line.strip()
        if not s or s.startswith('#'): continue
        t = s.split()
        if re.match(r'^-?\d', t[0]) and sect == 'verts':
            if len(t) == 1: refs.append(([int(t[0])], [1.0], [0, 0, 0]))
            else: refs.append(([int(t[0]), int(t[1]), int(t[2])], [float(t[3]), float(t[4]), float(t[5])], [float(t[6]), float(t[7]), float(t[8])]))
            continue
        if re.match(r'^-?\d', t[0]) and sect == 'delete':
            i = 0
            while i < len(t):
                if i + 2 < len(t) and t[i + 1] == '-': dele.update(range(int(t[i]), int(t[i + 2]) + 1)); i += 3
                else: dele.add(int(t[i])); i += 1
            continue
        k = t[0]
        if k in ('x_scale', 'y_scale', 'z_scale'): sc[k[0]] = (int(t[1]), int(t[2]), float(t[3]))
        elif k == 'verts': sect = 'verts'
        elif k == 'delete_verts': sect = 'delete'
        else:
            sect = None
            if len(t) > 1: info[k] = ' '.join(t[1:])
    return sc, refs, dele, info

def fit(Vb, fitdata):
    sc, refs, _, _ = fitdata
    s = np.array([abs(Vb[sc[a][0], i] - Vb[sc[a][1], i]) / sc[a][2] if a in sc else 1.0 for i, a in enumerate('xyz')])
    out = np.zeros((len(refs), 3))
    for n, (ix, w, off) in enumerate(refs):
        out[n] = sum(Vb[i] * ww for i, ww in zip(ix, w)) + np.array(off) * s
    return out

def read_mat(path):
    m = {}
    for line in open(path, encoding='utf-8', errors='ignore'):
        t = line.strip().split(None, 1)
        if len(t) == 2: m[t[0]] = t[1]
    return m

def tex_path(matfile, key):
    m = read_mat(matfile); p = m.get(key)
    if not p: return None
    p = p.strip('"')
    for cand in (os.path.join(os.path.dirname(matfile), os.path.basename(p)), os.path.join(MH, p), os.path.join(os.path.dirname(matfile), p)):
        if os.path.exists(cand): return cand
    return None

# ---------------- the body shape ----------------
Vb, _, bfaces, bgroups = read_obj(os.path.join(BASE, 'base.obj'))
for idx, dx, dy, dz in read_target(V['target']): Vb[idx] += (dx, dy, dz)
# a little more muscle than average (operators)
for idx, dx, dy, dz in read_target('universal-male-young-maxmuscle-averageweight'): Vb[idx] += np.array((dx, dy, dz)) * 0.35
# joint centres from the helper cubes
JOINT = {}
gv = {}
for f, g in zip(bfaces, bgroups):
    if g and g.startswith('joint-'):
        gv.setdefault(g, set()).update(i for i, _ in f)
for g, ids in gv.items(): JOINT[g[6:]] = Vb[sorted(ids)].mean(0)

# MakeHuman (dm, facing +z) -> game (m, facing -z), scaled so the eyes sit at the game's eye height (1.62 m)
ground = JOINT['ground'][1]
eye_y = (JOINT['l-eye'][1] + JOINT['r-eye'][1]) / 2
S = 1.62 / (eye_y - ground)
def to_game(P):
    P = np.asarray(P, np.float64)
    return np.stack([-P[..., 0] * S, (P[..., 1] - ground) * S, -P[..., 2] * S], -1)
J = {k: to_game(v) for k, v in JOINT.items()}
print('SGH joints', {k: [round(c, 3) for c in J[k]] for k in ('l-upper-leg', 'l-knee', 'l-ankle', 'pelvis', 'neck', 'head', 'l-shoulder', 'l-elbow', 'l-hand')}, flush=True)

# ---------------- pieces: body proxy, clothes, eyes, brows ----------------
PIECES = []  # dicts: name, zone, verts(game), uvs, faces[(v,vt)...], tex, alpha, normal
hidden = set()
def piece(name, folder, zone, alpha=False, tint=None):
    d = os.path.join(MH, folder)
    fp = [f for f in os.listdir(d) if f.endswith('.mhclo') or f.endswith('.proxy')][0]
    fd = read_fit(os.path.join(d, fp))
    objf = fd[3].get('obj_file', os.path.splitext(fp)[0] + '.obj').strip()
    Vo, VT, F, _ = read_obj(os.path.join(d, objf))
    P = to_game(fit(Vb, fd))
    matf = os.path.join(d, fd[3]['material'].strip()) if 'material' in fd[3] else None
    hidden.update(fd[2])
    PIECES.append(dict(name=name, zone=zone, v=P, vt=VT, f=F, refs=fd[1], mat=matf, alpha=alpha))
    return PIECES[-1]

body = piece('body', 'proxymeshes/male1591', 'skin')
body['mat'] = os.path.join(MH, V['skin'])
suit = piece('suit', 'clothes/male_casualsuit02', 'cloth')
boots = piece('boots', 'clothes/shoes03', 'boot')
GLOVES = 'clothes/' + next(d for d in sorted(os.listdir(os.path.join(MH, 'clothes'))) if d.endswith('_gloves_short'))  # the short gloves of the CC0 gloves pack
gloves = piece('gloves', GLOVES, 'dark')
eyes = piece('eyes', 'eyes/low-poly', 'eye')
eyes['mat'] = os.path.join(MH, 'eyes/materials', V['eyes'] + '.mhmat')
brows = piece('brows', 'eyebrows/eyebrow001', 'brow', alpha=True)
# drop body faces fully under clothes (they would only poke through)
keep = []
for f in body['f']:
    allh = all(all(r in hidden for r in body['refs'][vi][0]) for vi, _ in f)
    if not allh: keep.append(f)
print('SGH body faces', len(body['f']), '->', len(keep), flush=True)
body['keep'] = set(map(id, keep))

# ---------------- into Blender ----------------
bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene
def g2b(P): P = np.asarray(P); return np.stack([P[..., 0], -P[..., 2], P[..., 1]], -1)

def load_img(path, name):
    if not path: return None
    im = bpy.data.images.load(path); im.name = name; return im

def make_material(p):
    m = bpy.data.materials.new(p['name']); m.use_nodes = True
    nt = m.node_tree; b = nt.nodes['Principled BSDF']
    b.inputs['Roughness'].default_value = 0.75
    if p['mat']:
        dif = tex_path(p['mat'], 'diffuseTexture')
        if dif:
            t = nt.nodes.new('ShaderNodeTexImage'); t.image = load_img(dif, p['name'] + '_dif')
            nt.links.new(t.outputs['Color'], b.inputs['Base Color'])
            if p['alpha']:
                nt.links.new(t.outputs['Alpha'], b.inputs['Alpha'])
                tp = tex_path(p['mat'], 'transparencyMapTexture')
            p['dif'] = dif
        nrm = tex_path(p['mat'], 'normalmapTexture')
        if nrm: p['nrm'] = nrm
        ao = tex_path(p['mat'], 'aomapTexture')
        if ao: p['ao'] = ao
    return m

OBJS = {}
for p in PIECES:
    me = bpy.data.meshes.new(p['name'])
    verts = g2b(p['v'])
    me.from_pydata(verts.tolist(), [], [[vi for vi, _ in f] for f in p['f']])
    me.update()
    if p['vt'] is not None:
        uv = me.uv_layers.new(name='UV')
        k = 0
        for f in p['f']:
            for vi, ti in f:
                uv.data[k].uv = p['vt'][ti] if ti >= 0 else (0, 0); k += 1
    for poly in me.polygons: poly.use_smooth = True
    ob = bpy.data.objects.new(p['name'], me); sc.collection.objects.link(ob)
    ob.data.materials.append(make_material(p))
    OBJS[p['name']] = ob
print('SGH pieces', {k: len(o.data.vertices) for k, o in OBJS.items()}, flush=True)
json.dump({k: [float(c) for c in v] for k, v in J.items()}, open(os.path.join(OUT, f'joints_{VAR}.json'), 'w'))

def preview(path, views=((0, 1), (1, 0.6))):
    import tempfile
    cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam')); sc.collection.objects.link(cam)
    cam.data.lens = 50
    sun = bpy.data.objects.new('sun', bpy.data.lights.new('sun', 'SUN')); sun.rotation_euler = (0.9, 0.2, -0.6); sun.data.energy = 3.5; sc.collection.objects.link(sun)
    w = bpy.data.worlds.new('w'); w.use_nodes = True; w.node_tree.nodes['Background'].inputs['Strength'].default_value = 0.5; sc.world = w
    sc.render.engine = 'CYCLES'; sc.cycles.samples = 24; sc.cycles.use_denoising = False
    sc.render.resolution_x = 420; sc.render.resolution_y = 720
    tiles = []
    for i, (ang, _) in enumerate(views):
        a = math.radians(ang * 180 + 15)
        cam.location = (math.sin(a) * 4.2, math.cos(a) * 4.2, 1.0)  # game -z (front) is Blender +y
        cam.rotation_euler = (Vector((0, 0, 0.92)) - cam.location).to_track_quat('-Z', 'Y').to_euler()
        sc.camera = cam
        f = os.path.join(tempfile.gettempdir(), f'sgh_prev_{i}.png'); sc.render.filepath = f
        bpy.ops.render.render(write_still=True); tiles.append(f)
    # side by side
    imgs = [bpy.data.images.load(f) for f in tiles]
    W, H = imgs[0].size; out = bpy.data.images.new('prev', W * len(imgs), H)
    px = np.zeros((H, W * len(imgs), 4), np.float32)
    for i, im in enumerate(imgs): px[:, i * W:(i + 1) * W] = np.array(im.pixels[:]).reshape(H, W, 4)
    out.pixels[:] = px.ravel(); out.filepath_raw = path; out.file_format = 'PNG'; out.save()
    bpy.data.objects.remove(cam, do_unlink=True); bpy.data.objects.remove(sun, do_unlink=True)

if STAGE == 'fit':
    if PREV: preview(PREV)
    sys.exit(0)

# ======================= stage all: gear, pose, rig, export =======================
FAB = sys.argv[sys.argv.index('--') + 1:][6] if len(argv) > 6 else None  # optional fabric dir
def jb(name): return Vector(g2b(J[name]).tolist())
def gv(name): return J[name].copy()

# ---------- measurements from the fitted clothes ----------
SV = PIECES[1]['v']  # suit, game coords
band = SV[(SV[:, 1] > 1.12) & (SV[:, 1] < 1.36) & (np.abs(SV[:, 0]) < 0.17)]
chest = dict(x0=-0.165, x1=0.165, zf=float(np.percentile(band[:, 2], 2)), zb=float(np.percentile(band[:, 2], 98)))
BV = PIECES[0]['v']
head_top = BV[:, 1].max()
hb = BV[BV[:, 1] > J['head'][1]]
head_w = hb[:, 0].max() - hb[:, 0].min(); head_zf = hb[:, 2].min(); head_zb = hb[:, 2].max()
print('SGH chest', {k: round(float(v), 3) for k, v in chest.items()}, 'head top', round(float(head_top), 3), 'w', round(float(head_w), 3), flush=True)

# ---------- gear: own models, game coords ----------
GEAR = []  # (object, group, zone)
GZ = {}
def zone_mat(zone, col):
    if zone in GZ: return GZ[zone]
    m = bpy.data.materials.new('z_' + zone); m.use_nodes = True
    m.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (*col, 1)
    GZ[zone] = m; return m
ZCOL = {'vest': (.36, .35, .29), 'acc': (.7, .5, .15), 'dark': (.05, .05, .055), 'helmet': (.33, .33, .29), 'gun': (.06, .06, .065)}
def add_gear(ob, group, zone, bevel=0.0, seg=3):
    ob.data.materials.clear(); ob.data.materials.append(zone_mat(zone, ZCOL[zone]))
    if bevel:
        m = ob.modifiers.new('b', 'BEVEL'); m.width = bevel; m.segments = seg; m.limit_method = 'ANGLE'
        bpy.context.view_layer.objects.active = ob; bpy.ops.object.modifier_apply(modifier='b')
    for p in ob.data.polygons: p.use_smooth = True
    GEAR.append((ob, group, zone)); return ob
def gbox(group, zone, c, size, bevel=0.01, rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_cube_add(size=1); ob = bpy.context.object
    ob.scale = (size[0], size[2], size[1]); ob.rotation_euler = (rot[0], -rot[2], rot[1]); ob.location = Vector(g2b(np.array(c)).tolist())
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    return add_gear(ob, group, zone, bevel=min(bevel, min(size) * 0.45))
def gell(group, zone, c, r, rot=(0, 0, 0), seg=24, cut=None, thick=0):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=seg, ring_count=seg // 2, radius=1); ob = bpy.context.object
    if cut is not None:
        bm = bmesh.new(); bm.from_mesh(ob.data)
        bmesh.ops.delete(bm, geom=[v for v in bm.verts if v.co.z < cut], context='VERTS'); bm.to_mesh(ob.data); bm.free()
    ob.scale = (r[0], r[2], r[1]); ob.rotation_euler = (rot[0], -rot[2], rot[1]); ob.location = Vector(g2b(np.array(c)).tolist())
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    if thick:
        m = ob.modifiers.new('t', 'SOLIDIFY'); m.thickness = thick; m.offset = -1
        bpy.context.view_layer.objects.active = ob; bpy.ops.object.modifier_apply(modifier='t')
    return add_gear(ob, group, zone)
def gtube(group, zone, a, b, r0, r1, seg=16):
    A, B = Vector(g2b(np.array(a)).tolist()), Vector(g2b(np.array(b)).tolist()); d = B - A
    bpy.ops.mesh.primitive_cone_add(vertices=seg, radius1=r0, radius2=r1, depth=d.length); ob = bpy.context.object
    ob.rotation_euler = d.to_track_quat('Z', 'Y').to_euler(); ob.location = (A + B) / 2
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    return add_gear(ob, group, zone)

cx0, cx1, zf, zb = chest['x0'], chest['x1'], chest['zf'], chest['zb']
ym = 1.22
# plate carrier: front and back plate bags, cummerbund, shoulder straps, pouches, radio, patch
gbox('torso', 'vest', (0, ym + 0.02, zf - 0.025), (0.29, 0.33, 0.05), 0.018)
gbox('torso', 'vest', (0, ym + 0.03, zb + 0.016), (0.28, 0.32, 0.035), 0.016)
gbox('torso', 'vest', (0, ym - 0.1, (zf + zb) / 2), (cx1 - cx0 + 0.035, 0.13, zb - zf + 0.06), 0.03)
for x in (-0.1, 0.1):
    gbox('torso', 'vest', (x, J['l-shoulder'][1] + 0.06, (zf + zb) / 2), (0.06, 0.025, zb - zf + 0.03), 0.01)
for x in (-0.085, 0.0, 0.085):
    gbox('torso', 'vest', (x, ym - 0.06, zf - 0.07), (0.075, 0.12, 0.045), 0.012)
    gbox('torso', 'dark', (x, ym + 0.01, zf - 0.073), (0.077, 0.022, 0.048), 0.006)
gbox('torso', 'vest', (0, ym + 0.12, zf - 0.06), (0.2, 0.08, 0.035), 0.012)                  # admin pouch
gbox('torso', 'dark', (cx1 - 0.01, ym - 0.02, (zf + zb) / 2 - 0.03), (0.05, 0.12, 0.07), 0.012)   # radio
gtube('torso', 'dark', (cx1 - 0.01, ym + 0.04, (zf + zb) / 2 - 0.02), (cx1 - 0.01, ym + 0.2, (zf + zb) / 2 - 0.01), 0.005, 0.004, 8)
gbox('torso', 'acc', (-0.07, ym + 0.12, zf - 0.08), (0.07, 0.045, 0.006), 0.003)               # team patch
gbox('torso', 'dark', (0, J['pelvis'][1] + 0.03, (zf + zb) / 2 - 0.005), (cx1 - cx0 + 0.01, 0.05, zb - zf + 0.02), 0.012)  # belt
gbox('torso', 'vest', (cx1 - 0.02, J['pelvis'][1] - 0.04, 0.0), (0.04, 0.14, 0.08), 0.012)    # thigh-side pouch
# helmet (high cut), ear protection and headband, mount on the front
hc = (0.0, head_top - 0.075, (head_zf + head_zb) / 2)
gell('head', 'helmet', hc, (head_w / 2 + 0.03, 0.11, (head_zb - head_zf) / 2 + 0.03), rot=(-0.12, 0, 0), seg=32, cut=-0.2, thick=0.012)
for s in (-1, 1):
    gbox('head', 'dark', (s * (head_w / 2 + 0.035), hc[1] - 0.005, hc[2] + 0.01), (0.012, 0.022, 0.14), 0.005)  # rails
    gell('head', 'dark', (s * (head_w / 2 + 0.02), J['l-eye'][1] - 0.035, hc[2] + 0.025), (0.028, 0.045, 0.04))   # ear cups
gbox('head', 'dark', (0, hc[1] + 0.035, head_zf - 0.035), (0.05, 0.035, 0.025), 0.008)                        # mount
gbox('head', 'acc', (0, head_top + 0.035, hc[2] + 0.04), (0.04, 0.008, 0.08), 0.003)                          # stripe
# knee pads
for side in ('l', 'r'):
    k = J[side + '-knee']
    gell('shin' + side.upper(), 'dark', (k[0], k[1] + 0.01, k[2] - 0.075), (0.055, 0.07, 0.028))
# carbine (gun group); origin = the gun's position in the game, muzzle along -z
GUN0 = np.array((0.12, J['l-shoulder'][1] - 0.03, -0.32))
def G0(x, y, z): return tuple(GUN0 + (x, y, z))
gbox('gun', 'gun', G0(0, 0, -0.03), (0.048, 0.08, 0.3), 0.006)                    # receiver
gbox('gun', 'gun', G0(0, 0.048, -0.08), (0.028, 0.016, 0.38), 0.003)              # top rail
gbox('gun', 'gun', G0(0, -0.004, -0.27), (0.056, 0.058, 0.2), 0.012)              # handguard
gtube('gun', 'gun', G0(0, 0.004, -0.36), G0(0, 0.004, -0.53), 0.01, 0.01, 12)      # barrel
gbox('gun', 'gun', G0(0, 0.004, -0.53), (0.026, 0.026, 0.045), 0.005)             # muzzle device
gbox('gun', 'gun', G0(0, -0.09, -0.09), (0.032, 0.14, 0.06), 0.008, rot=(-0.22, 0, 0))  # magazine
gbox('gun', 'gun', G0(0, -0.075, 0.06), (0.032, 0.1, 0.042), 0.008, rot=(0.32, 0, 0))   # pistol grip
gtube('gun', 'gun', G0(0, -0.005, 0.1), G0(0, -0.005, 0.16), 0.014, 0.014, 12)     # buffer tube
gbox('gun', 'gun', G0(0, -0.015, 0.2), (0.04, 0.085, 0.11), 0.014)                # stock
gbox('gun', 'gun', G0(0, 0.08, -0.05), (0.04, 0.048, 0.08), 0.01)                 # optic
gbox('gun', 'gun', G0(0, -0.05, -0.29), (0.028, 0.04, 0.045), 0.007)              # fore grip
GRIP_R = G0(0, -0.07, 0.045)     # right hand on the pistol grip
GRIP_L = G0(-0.004, -0.045, -0.24)  # left hand under the handguard

# ---------- the posing rig (A pose) ----------
arm = bpy.data.armatures.new('rig'); rig = bpy.data.objects.new('rig', arm); sc.collection.objects.link(rig)
for o in sc.objects: o.select_set(False)
rig.select_set(True); bpy.context.view_layer.objects.active = rig
bpy.ops.object.mode_set(mode='EDIT'); eb = arm.edit_bones
def palm_normal(side):
    w, a, b = gv(side + '-hand'), gv(side + '-finger-2-1'), gv(side + '-finger-5-1')
    n = np.cross(a - w, b - w); n /= np.linalg.norm(n)
    # the palm faces the body in the A pose: towards x = 0
    if n[0] * (1 if side == 'l' else -1) < 0: n = -n
    return n
def mk(name, a, b, parent=None, roll=None):
    e = eb.new(name); e.head = Vector(g2b(np.array(a)).tolist()); e.tail = Vector(g2b(np.array(b)).tolist())
    if parent: e.parent = eb[parent]
    if roll is not None: e.align_roll(Vector(g2b(np.array(roll)).tolist()))
    return e
mk('torso', gv('pelvis'), gv('neck'))
mk('head', gv('neck'), np.array((0, head_top, gv('head')[2])), 'torso')
for s in ('l', 'r'):
    S = s.upper()
    mk('thigh' + S, gv(s + '-upper-leg'), gv(s + '-knee'), 'torso')
    mk('shin' + S, gv(s + '-knee'), gv(s + '-ankle'), 'thigh' + S)
    mk('foot' + S, gv(s + '-ankle'), gv(s + '-foot-2'), 'shin' + S)
    pn = palm_normal(s)
    mk('clav' + S, gv(s + '-clavicle'), gv(s + '-shoulder'), 'torso')
    mk('upper' + S, gv(s + '-shoulder'), gv(s + '-elbow'), 'clav' + S)
    mk('fore' + S, gv(s + '-elbow'), gv(s + '-hand'), 'upper' + S)
    mk('hand' + S, gv(s + '-hand'), gv(s + '-finger-3-1'), 'fore' + S, roll=pn)
    for f in range(1, 6):
        prev = 'hand' + S
        for k in range(1, 4):
            nm = f'f{S}{f}{k}'
            mk(nm, gv(f'{s}-finger-{f}-{k}'), gv(f'{s}-finger-{f}-{k + 1}'), prev, roll=pn); prev = nm
bpy.ops.object.mode_set(mode='OBJECT')

# ---------- weights: heat on the full body, copied to the clothes ----------
bodyob = OBJS['body']
for o in sc.objects: o.select_set(False)
bodyob.select_set(True); rig.select_set(True); bpy.context.view_layer.objects.active = rig
bpy.ops.object.parent_set(type='ARMATURE_AUTO')
nweighted = sum(1 for v in bodyob.data.vertices if len(v.groups))
print('SGH heat weights on', nweighted, 'of', len(bodyob.data.vertices), flush=True)
for name in ('suit', 'boots', 'gloves'):
    ob = OBJS[name]
    for g in bodyob.vertex_groups: ob.vertex_groups.new(name=g.name)
    m = ob.modifiers.new('dt', 'DATA_TRANSFER'); m.object = bodyob; m.use_vert_data = True
    m.data_types_verts = {'VGROUP_WEIGHTS'}; m.vert_mapping = 'POLYINTERP_NEAREST'
    m.layers_vgroup_select_src = 'ALL'; m.layers_vgroup_select_dst = 'NAME'
    bpy.context.view_layer.objects.active = ob; bpy.ops.object.modifier_apply(modifier='dt')
    am = ob.modifiers.new('arm', 'ARMATURE'); am.object = rig
for name in ('eyes', 'brows'):
    ob = OBJS[name]; vg = ob.vertex_groups.new(name='head'); vg.add(list(range(len(ob.data.vertices))), 1.0, 'REPLACE')
    am = ob.modifiers.new('arm', 'ARMATURE'); am.object = rig

# ---------- pose: rifle hold ----------
bpy.context.view_layer.objects.active = rig; bpy.ops.object.mode_set(mode='POSE')
pb = rig.pose.bones
def empty(name, p):
    e = bpy.data.objects.new(name, None); e.location = Vector(g2b(np.array(p)).tolist()); sc.collection.objects.link(e); return e
for S, grip, pole in (('R', GRIP_R, (0.55, 1.0, 0.15)), ('L', GRIP_L, (-0.5, 0.95, -0.2))):
    # the wrist sits a hand's length behind the grip point
    c = pb['fore' + S].constraints.new('IK'); c.target = empty('ik' + S, grip); c.pole_target = empty('pole' + S, pole)
    c.chain_count = 2; c.pole_angle = math.radians(-90)
bpy.context.view_layer.update()
def set_hand(S, fwd, palm):
    """orient the hand: bone axis (wrist -> knuckles) along fwd, palm facing palm (game vectors)"""
    y = Vector(g2b(np.array(fwd)).tolist()).normalized(); z = Vector(g2b(np.array(palm)).tolist())
    z = (z - y * z.dot(y)).normalized(); x = y.cross(z)
    M = Matrix((x, y, z)).transposed().to_4x4(); M.translation = pb['hand' + S].matrix.translation
    pb['hand' + S].matrix = M; bpy.context.view_layer.update()
set_hand('R', (0.0, -0.45, -0.89), (-1, 0, 0))      # on the pistol grip, palm against its right side
set_hand('L', (0.35, 0.15, -0.92), (0.2, 1, 0))      # under the handguard, palm up
def curl(S, f, angs):
    for k, a in enumerate(angs, 1):
        b = pb[f'f{S}{f}{k}']; b.rotation_mode = 'XYZ'; b.rotation_euler = (a, 0, 0)
for f, a in ((1, (0.3, 0.4, 0.3)), (2, (0.5, 0.9, 0.5)), (3, (1.3, 1.3, 0.9)), (4, (1.35, 1.3, 0.9)), (5, (1.4, 1.3, 0.9))): curl('R', f, a)
for f, a in ((1, (0.2, 0.3, 0.2)), (2, (1.0, 1.0, 0.7)), (3, (1.05, 1.0, 0.7)), (4, (1.1, 1.0, 0.7)), (5, (1.15, 1.0, 0.7))): curl('L', f, a)
bpy.context.view_layer.update()
bpy.ops.object.mode_set(mode='OBJECT')
print('SGH posed', flush=True)
if STAGE == 'pose':
    if PREV: preview(PREV, views=((0, 1), (0.6, 1), (1.4, 1)))
    sys.exit(0)

# ---------- freeze the pose, drop the hidden body ----------
SKINNED = ['body', 'suit', 'boots', 'gloves', 'eyes', 'brows']
for name in SKINNED:
    ob = OBJS[name]; bpy.context.view_layer.objects.active = ob
    for m in list(ob.modifiers): bpy.ops.object.modifier_apply(modifier=m.name)
# fewer triangles where nobody looks closely (boots, gloves, the uniform); weights and uvs survive
for name, target in (('boots', 900), ('gloves', 1100), ('suit', 2600)):
    ob = OBJS[name]; n = sum(len(p.vertices) - 2 for p in ob.data.polygons)
    if n > target:
        m = ob.modifiers.new('dec', 'DECIMATE'); m.ratio = target / n; m.use_collapse_triangulate = True
        bpy.context.view_layer.objects.active = ob; bpy.ops.object.modifier_apply(modifier='dec')
keep_idx = {i for i, f in enumerate(PIECES[0]['f']) if id(f) in body['keep']}
bm = bmesh.new(); bm.from_mesh(bodyob.data); bm.faces.ensure_lookup_table()
bmesh.ops.delete(bm, geom=[f for i, f in enumerate(bm.faces) if i not in keep_idx], context='FACES_ONLY')
bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context='VERTS')
bm.to_mesh(bodyob.data); bm.free()

# ---------- game parts: which group each pose bone belongs to ----------
GROUPS = ['torso', 'head', 'thighL', 'shinL', 'thighR', 'shinR', 'arms']
def gmap(b):
    if b in ('torso', 'clavL', 'clavR'): return 'torso'
    if b == 'head': return 'head'
    if b.startswith('thigh'): return b
    if b.startswith('shin') or b.startswith('foot'): return 'shin' + b[-1]
    return 'arms'
ORIGIN = {
    'hips': (0.0, float((J['l-upper-leg'][1] + J['r-upper-leg'][1]) / 2), 0.0),
    'torso': (0.0, float(J['pelvis'][1]), 0.0),
    'head': tuple(float(c) for c in J['neck']),
    'thighL': tuple(float(c) for c in J['l-upper-leg']), 'thighR': tuple(float(c) for c in J['r-upper-leg']),
    'shinL': tuple(float(c) for c in J['l-knee']), 'shinR': tuple(float(c) for c in J['r-knee']),
    'arms': (0.0, float(J['l-shoulder'][1]), float(J['l-shoulder'][2])),
    'gun': tuple(float(c) for c in GUN0),
}
# gear is rigid on its group: one group, weight 1
for ob, group, zone in GEAR:
    vg = ob.vertex_groups.new(name='G:' + ('arms' if group == 'gun' else group)); vg.add(list(range(len(ob.data.vertices))), 1.0, 'REPLACE')
    # fabric and plastic get box-projected uvs (texture tiles about every 25 cm)
    bpy.context.view_layer.objects.active = ob
    for o in sc.objects: o.select_set(False)
    ob.select_set(True); bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.cube_project(cube_size=0.25, correct_aspect=False, scale_to_bounds=False); bpy.ops.object.mode_set(mode='OBJECT')

# ---------- ambient occlusion with everything in place ----------
bpy.ops.mesh.primitive_plane_add(size=8); ground_ob = bpy.context.object
ALL = [OBJS[n] for n in SKINNED] + [g[0] for g in GEAR]
sc.render.engine = 'CYCLES'; sc.cycles.device = 'CPU'; sc.cycles.samples = 48
sc.render.bake.target = 'VERTEX_COLORS'; sc.render.bake.use_selected_to_active = False
if not sc.world: sc.world = bpy.data.worlds.new('w')
for o in sc.objects: o.select_set(False)
for o in ALL:
    ca = o.data.color_attributes.new('AO', 'FLOAT_COLOR', 'POINT'); o.data.color_attributes.active_color = ca; o.select_set(True)
bpy.context.view_layer.objects.active = ALL[0]
bpy.ops.object.bake(type='AO')
bpy.data.objects.remove(ground_ob, do_unlink=True)
print('SGH ao baked', flush=True)

# ---------- merge per material zone and export ----------
ZONE_OF = {'body': 'skin', 'suit': 'cloth', 'boots': 'boot', 'gloves': 'glove', 'eyes': 'eye', 'brows': 'brow'}
SRC = {'skin': tex_path(os.path.join(MH, V['skin']), 'diffuseTexture'), 'cloth': PIECES[1].get('dif'), 'boot': PIECES[2].get('dif'),
       'glove': PIECES[3].get('dif'), 'eye': PIECES[4].get('dif'), 'brow': PIECES[5].get('dif'),
       'vest': 'FAB:Fabric061', 'helmet': 'FAB:Plastic010'}
TEXNAME = {'skin': f'skin_{VAR}.jpg', 'cloth': 'cloth.jpg', 'boot': 'boot.jpg', 'glove': 'glove.jpg', 'eye': f'eye_{V["eyes"]}.jpg', 'brow': 'brow.png', 'vest': 'vest.jpg', 'helmet': 'helmet.jpg'}
byzone = {}
for n in SKINNED: byzone.setdefault(ZONE_OF[n], []).append(OBJS[n])
for ob, group, zone in GEAR: byzone.setdefault(zone, []).append(ob)
gidx = {g: i for i, g in enumerate(GROUPS)}
parts, blobs, off = [], [], 0
def put(a):
    global off
    b = a.tobytes(); pad = (-len(b)) % 4; blobs.append(b + b'\0' * pad); o = off; off += len(b) + pad; return o
for zone, obs in byzone.items():
    for o in sc.objects: o.select_set(False)
    for o in obs: o.select_set(True)
    bpy.context.view_layer.objects.active = obs[0]
    if len(obs) > 1: bpy.ops.object.join()
    ob = bpy.context.view_layer.objects.active; me = ob.data
    me.calc_loop_triangles()
    uvl = me.uv_layers.active.data if me.uv_layers.active else None
    aoa = me.color_attributes.get('AO')
    names = [g.name for g in ob.vertex_groups]
    vmap, P, N, UV, C, JI, JW, IDX = {}, [], [], [], [], [], [], []
    for tri in me.loop_triangles:
        for li in tri.loops:
            vi = me.loops[li].vertex_index
            uv = tuple(uvl[li].uv) if uvl else (0.0, 0.0)
            key = (vi, round(uv[0], 5), round(uv[1], 5))
            if key not in vmap:
                v = me.vertices[vi]
                vmap[key] = len(P)
                co, no = v.co, v.normal
                P.append((co.x, co.z, -co.y)); N.append((no.x, no.z, -no.y)); UV.append(uv)
                a = aoa.data[vi].color[0] if aoa else 1.0
                C.append(int(max(0, min(255, round((0.4 + 0.6 * a) * 255)))))
                w = {}
                for ge in v.groups:
                    nm = names[ge.group]; g = nm[2:] if nm.startswith('G:') else gmap(nm)
                    if g in gidx: w[g] = w.get(g, 0) + ge.weight
                top = sorted(w.items(), key=lambda t: -t[1])[:4] or [('torso', 1.0)]
                tot = sum(t[1] for t in top) or 1
                ji = [gidx[t[0]] for t in top] + [0] * (4 - len(top)); jw = [t[1] / tot for t in top] + [0] * (4 - len(top))
                q = [int(round(x * 255)) for x in jw]; q[0] += 255 - sum(q)
                JI.append(ji); JW.append(q)
            IDX.append(vmap[key])
    nv = len(P)
    rec = {'zone': zone, 'tex': TEXNAME.get(zone), 'src': SRC.get(zone), 'alpha': zone == 'brow', 'nv': nv, 'ni': len(IDX),
           'pos': put(np.array(P, np.float32)), 'nor': put(np.array(N, np.float32)), 'uv': put(np.array(UV, np.float32)),
           'ao': put(np.array(C, np.uint8)), 'ji': put(np.array(JI, np.uint8)), 'jw': put(np.array(JW, np.uint8)),
           'idx': put(np.array(IDX, np.uint16 if nv < 65536 else np.uint32)), 'i32': nv >= 65536}
    parts.append(rec)
    print(f'SGH part {zone}: {nv} verts {len(IDX) // 3} tris', flush=True)
flash = (GUN0 + np.array((0, 0.004, -0.57))).tolist()
H = {'v': 1, 'variant': VAR, 'groups': GROUPS, 'origin': ORIGIN, 'flash': flash, 'parts': parts,
     'height': float(head_top), 'license': 'CC0 (MakeHuman data, Poly Haven / ambientCG textures); gear and rig built for this game'}
hb = json.dumps(H).encode(); hb += b' ' * ((-len(hb)) % 4)
with open(os.path.join(OUT, f'op_{VAR}.bin'), 'wb') as f:
    f.write(len(hb).to_bytes(4, 'little')); f.write(hb)
    for b in blobs: f.write(b)
print('SGH wrote', os.path.join(OUT, f'op_{VAR}.bin'), os.path.getsize(os.path.join(OUT, f'op_{VAR}.bin')) // 1024, 'KB', flush=True)
