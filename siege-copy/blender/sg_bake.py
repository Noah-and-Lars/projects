"""Bake a Siege map's lighting in Cycles (run inside Blender, headless).
blender -b --python sg_bake.py -- <bake-dir> <map> <out.bin> [samples] [preview.png]

Reads <bake-dir>/<map>.json + .bin from dump_map.js: the map's static meshes and models (baked per vertex), the wall
chunks (occluders, with one small probe quad per chunk face), and the light fixtures (point lights).
Bakes diffuse direct + indirect light (no albedo) to vertex colours, scales it to the game's brightness and writes
the game's light file: uint32 header length, JSON header {v, seg:[{k, n}]}, then uint8 RGB per segment (value x 100).
"""
import bpy, sys, os, json, math, time
import numpy as np

argv = sys.argv[sys.argv.index('--') + 1:]
DIR, KEY, OUT = argv[0], argv[1], argv[2]
SAMPLES = int(argv[3]) if len(argv) > 3 else 96
PREVIEW = argv[4] if len(argv) > 4 else None
T0 = time.time()
J = json.load(open(os.path.join(DIR, KEY + '.json')))
BIN = open(os.path.join(DIR, KEY + '.bin'), 'rb').read()
def arr(ref, dt):
    o, n = ref; return np.frombuffer(BIN, dtype=dt, count=n, offset=o)

bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene
sc.render.engine = 'CYCLES'; sc.cycles.device = 'CPU'
sc.cycles.samples = SAMPLES; sc.cycles.use_denoising = False
sc.cycles.max_bounces = 4; sc.cycles.diffuse_bounces = 3; sc.cycles.glossy_bounces = 0; sc.cycles.transmission_bounces = 0
sc.cycles.sample_clamp_indirect = 4.0
sc.render.bake.target = 'VERTEX_COLORS'
sc.render.bake.use_selected_to_active = False

def g2b(a):  # game (x, y up, z) -> Blender (x, -z, y up)
    a = a.reshape(-1, 3); return np.stack([a[:, 0], -a[:, 2], a[:, 1]], 1)

mats = {}
def material(alb):
    key = tuple(round(c, 2) for c in alb)
    if key in mats: return mats[key]
    m = bpy.data.materials.new('m%d' % len(mats))
    m.use_nodes = True
    b = m.node_tree.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = (min(alb[0], .9), min(alb[1], .9), min(alb[2], .9), 1)
    b.inputs['Roughness'].default_value = 1.0
    if 'Specular IOR Level' in b.inputs: b.inputs['Specular IOR Level'].default_value = 0.0
    mats[key] = m; return m

def make_mesh(name, verts, tris, alb=None, smooth=False, colattr=True, loop_cols=None):
    me = bpy.data.meshes.new(name)
    nv = len(verts); nt = len(tris)
    me.vertices.add(nv); me.vertices.foreach_set('co', verts.astype(np.float32).ravel())
    me.loops.add(nt * 3); me.loops.foreach_set('vertex_index', tris.astype(np.int32).ravel())
    me.polygons.add(nt); me.polygons.foreach_set('loop_start', np.arange(0, nt * 3, 3, dtype=np.int32))
    me.update(calc_edges=True); me.validate(clean_customdata=False)
    me.polygons.foreach_set('use_smooth', np.full(nt, smooth, dtype=bool))
    if alb is not None: me.materials.append(material(alb))
    if colattr:
        ca = me.color_attributes.new('Lit', 'FLOAT_COLOR', 'POINT')
        me.color_attributes.active_color = ca
    if loop_cols is not None:  # per-face albedo for the occluder boxes
        ca = me.color_attributes.new('Alb', 'BYTE_COLOR', 'CORNER'); ca.data.foreach_set('color', loop_cols.astype(np.float32).ravel())
    ob = bpy.data.objects.new(name, me); sc.collection.objects.link(ob)
    return ob

# ----- static meshes and models: baked -----
targets = []
for i, m in enumerate(J['meshes']):
    pos = g2b(arr(m['pos'], np.float32))
    if m['idx']:
        tris = arr(m['idx'], np.uint32).reshape(-1, 3)
    else:
        tris = np.arange(len(pos), dtype=np.uint32).reshape(-1, 3)
    ob = make_mesh('m%d' % i, pos, tris, m['alb'], smooth=bool(m['idx']))
    targets.append((ob, m))
# ----- wall chunks: occluders with their own albedo -----
bx = arr(J['boxes'], np.float32).reshape(-1, 6); ba = arr(J['boxAlb'], np.float32).reshape(-1, 3)
if len(bx):
    c = np.array([[0,0,0],[1,0,0],[1,1,0],[0,1,0],[0,0,1],[1,0,1],[1,1,1],[0,1,1]], dtype=np.float32)
    lo, hi = bx[:, None, :3], bx[:, None, 3:]
    v = lo + (hi - lo) * c[None]  # game coords
    verts = g2b(v.reshape(-1, 3))
    q = np.array([[0,2,1],[0,3,2],[4,5,6],[4,6,7],[0,1,5],[0,5,4],[3,7,6],[3,6,2],[0,4,7],[0,7,3],[1,2,6],[1,6,5]], dtype=np.uint32)
    tris = (q[None] + (np.arange(len(bx), dtype=np.uint32) * 8)[:, None, None]).reshape(-1, 3)
    cols = np.concatenate([np.repeat(np.clip(ba, 0, .9), 36, 0), np.ones((len(bx) * 36, 1), np.float32)], 1)
    occ = make_mesh('walls', verts, tris, None, colattr=False, loop_cols=cols)
    m = bpy.data.materials.new('wallmat'); m.use_nodes = True
    nt = m.node_tree; a = nt.nodes.new('ShaderNodeVertexColor'); a.layer_name = 'Alb'
    b = nt.nodes['Principled BSDF']; nt.links.new(a.outputs['Color'], b.inputs['Base Color']); b.inputs['Roughness'].default_value = 1.0
    if 'Specular IOR Level' in b.inputs: b.inputs['Specular IOR Level'].default_value = 0.0
    occ.data.materials.append(m)
# ----- probes: a 3 cm quad per wall chunk face -----
pr = arr(J['probes'], np.float32).reshape(-1, 6)
probe_ob = None
if len(pr):
    P = pr[:, :3]; N = pr[:, 3:]
    up = np.where(np.abs(N[:, 1:2]) > 0.9, np.array([[1, 0, 0]], np.float32), np.array([[0, 1, 0]], np.float32))
    t = np.cross(N, up); t /= np.linalg.norm(t, axis=1, keepdims=True); b = np.cross(N, t)
    s = 0.015
    corners = [P - t * s - b * s, P + t * s - b * s, P + t * s + b * s, P - t * s + b * s]
    # winding so the face normal is N
    verts = g2b(np.stack(corners, 1).reshape(-1, 3))
    base = (np.arange(len(P), dtype=np.uint32) * 4)[:, None]
    tris = np.concatenate([base + np.array([0, 1, 2], np.uint32), base + np.array([0, 2, 3], np.uint32)], 1).reshape(-1, 3)
    probe_ob = make_mesh('probes', verts, tris, (0.5, 0.5, 0.5))
    # make sure every quad faces along its probe normal
    me = probe_ob.data; fn = np.zeros(len(me.polygons) * 3, np.float32); me.polygons.foreach_get('normal', fn)
    want = np.repeat(g2b(N), 2, 0)
    flip = (fn.reshape(-1, 3) * want).sum(1) < 0
    if flip.any():
        import bmesh
        bm = bmesh.new(); bm.from_mesh(me); bm.faces.ensure_lookup_table()
        bmesh.ops.reverse_faces(bm, faces=[bm.faces[i] for i in np.nonzero(flip)[0]]); bm.to_mesh(me); bm.free()
        ca = me.color_attributes.get('Lit') or me.color_attributes.new('Lit', 'FLOAT_COLOR', 'POINT'); me.color_attributes.active_color = ca

# ----- lights -----
for i, L in enumerate(J['lights']):
    I = max(L['r'], L['g'], L['b'], 1e-3)
    wall = L['style'] in ('sconce', 'lamp', 'lantern')
    ld = bpy.data.lights.new('L%d' % i, 'POINT' if wall else 'SPOT')
    # daytime: the fittings look whiter next to daylight
    ld.color = tuple(0.55 * c + 0.45 for c in (L['r'] / I, L['g'] / I, L['b'] / I))
    ld.energy = I * (140.0 if wall else 190.0)
    ld.shadow_soft_size = 0.15
    if not wall: ld.spot_size = math.radians(165); ld.spot_blend = 0.6
    ob = bpy.data.objects.new('L%d' % i, ld); ob.location = (L['x'], -L['z'], L['y'] - 0.1)
    # ceiling fixtures shine down (spot rotation 0 points down -Z)
    sc.collection.objects.link(ob)
# daylight: a bright sky and a low warm sun through the windows and doors
w = bpy.data.worlds.new('day'); w.use_nodes = True
w.node_tree.nodes['Background'].inputs['Color'].default_value = (0.55, 0.68, 0.86, 1)
w.node_tree.nodes['Background'].inputs['Strength'].default_value = 2.4
sc.world = w
sun = bpy.data.objects.new('sun', bpy.data.lights.new('sun', 'SUN')); sun.data.energy = 3.0; sun.data.angle = math.radians(1.5)
sun.data.color = (1.0, 0.94, 0.84); sun.rotation_euler = (math.radians(52), 0, math.radians(35)); sc.collection.objects.link(sun)
print(f'SGBAKE scene ready {time.time() - T0:.1f}s', flush=True)

# ----- bake -----
for o in sc.objects: o.select_set(False)
bake_obs = [o for o, _ in targets] + ([probe_ob] if probe_ob else [])
for o in bake_obs: o.select_set(True)
bpy.context.view_layer.objects.active = bake_obs[0]
bpy.ops.object.bake(type='DIFFUSE', pass_filter={'DIRECT', 'INDIRECT'}, target='VERTEX_COLORS')
print(f'SGBAKE baked {time.time() - T0:.1f}s', flush=True)

def lit(ob):
    ca = ob.data.color_attributes['Lit']; a = np.zeros(len(ca.data) * 4, np.float32); ca.data.foreach_get('color', a)
    return a.reshape(-1, 4)[:, :3]

# ----- calibrate to the game's brightness: game = amb + k * baked, matched on the static meshes -----
amb = np.array([0.21, 0.21, 0.22], np.float32)  # daytime: no room is ever dark
gl, bl = [], []
res = []
def weld(b, m):
    pos = arr(m['pos'], np.float32).reshape(-1, 3); nor = arr(m['nor'], np.float32).reshape(-1, 3)
    key = np.concatenate([np.round(pos * 50), np.round(nor * 4)], 1).astype(np.int64)
    _, inv = np.unique(key, axis=0, return_inverse=True); inv = inv.ravel()
    s = np.zeros((inv.max() + 1, 3)); np.add.at(s, inv, b); c = np.bincount(inv).astype(np.float64)
    return (s / c[:, None])[inv].astype(np.float32)
for ob, m in targets:
    b = weld(lit(ob), m); g = arr(m['col'], np.float32).reshape(-1, 3)
    res.append((m['k'], b))
    if m['k'].startswith('st:'):
        gl.append(g.mean(1)); bl.append(b.mean(1))
gl = np.concatenate(gl); bl = np.concatenate(bl)
TARGET = 0.5  # a bright daytime interior (the night version matched the game's median, about 0.3)
k = float((TARGET - amb.mean()) / max(np.median(bl), 1e-5))
print(f'SGBAKE game median {np.median(gl):.3f} baked median {np.median(bl):.4f} k {k:.2f}', flush=True)

def final(b):
    # soft roll-off of hot spots (the game caps at 1.6)
    x = k * b
    return amb[None] + 0.95 * (1 - np.exp(-x / 0.95))  # daylight: a tighter shoulder so sun patches don't burn out

segs, blobs = [], []
for kk, b in res:
    v = final(b); u8 = np.clip(np.round(v * 100), 0, 255).astype(np.uint8).ravel()
    segs.append({'k': kk, 'n': int(u8.size)}); blobs.append(u8.tobytes())
if probe_ob:
    pb = lit(probe_ob).reshape(-1, 4, 3).mean(1)
    # smooth across each wall face: average with the chunks around it on the same plane (3 x 3 buckets of 0.45 m)
    Pp, Nn = pr[:, :3], pr[:, 3:]
    ax = np.argmax(np.abs(Nn), 1); sg = np.sign(Nn[np.arange(len(Nn)), ax]).astype(int)
    d = np.round(Pp[np.arange(len(Pp)), ax] / 0.05).astype(int)
    oth = np.array([[1, 2], [0, 2], [0, 1]])[ax]
    ia = np.floor(Pp[np.arange(len(Pp)), oth[:, 0]] / 0.45).astype(int); ib = np.floor(Pp[np.arange(len(Pp)), oth[:, 1]] / 0.45).astype(int)
    buckets = {}
    for i in range(len(Pp)):
        kk = (ax[i], sg[i], d[i], ia[i], ib[i]); e = buckets.get(kk)
        if e is None: buckets[kk] = [pb[i].astype(np.float64).copy(), 1]
        else: e[0] += pb[i]; e[1] += 1
    sm = np.zeros_like(pb)
    for i in range(len(Pp)):
        acc = np.zeros(3); n = 0
        for da in (-2, -1, 0, 1, 2):
            for db in (-2, -1, 0, 1, 2):
                e = buckets.get((ax[i], sg[i], d[i], ia[i] + da, ib[i] + db))
                if e is not None:
                    w = 3.0 if (da == 0 and db == 0) else (1.5 if abs(da) + abs(db) == 1 else 0.6)
                    acc += e[0] * w; n += e[1] * w
        sm[i] = acc / n
    pb = sm.astype(np.float32)
    u8 = np.clip(np.round(final(pb) * 100), 0, 255).astype(np.uint8).ravel()
    segs.append({'k': 'pr', 'n': int(u8.size)}); blobs.append(u8.tobytes())
H = json.dumps({'v': 1, 'map': KEY, 'k': k, 'samples': SAMPLES, 'seg': segs}).encode()
with open(OUT, 'wb') as f:
    f.write(len(H).to_bytes(4, 'little')); f.write(H)
    for b in blobs: f.write(b)
print(f'SGBAKE wrote {OUT} {os.path.getsize(OUT) // 1024} KB in {time.time() - T0:.1f}s', flush=True)
