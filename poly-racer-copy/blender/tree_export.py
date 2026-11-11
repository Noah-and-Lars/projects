# Export a Sketchfab tree (glTF) for Poly Racer's Ultra trees: one FCM part 'tree' with a single atlas texture
# (bark and leaves side by side, uvs remapped), normalised so the ground is at y = 0 and the top at y = 1 (the game
# scales it to the kind's height). Leaves and anything with alpha are marked as cut-out (k = 'leaf').
#   blender -b --python tree_export.py -- <gltf-dir> <out-dir> <kind> [max-tris]
import bpy, sys, os, glob, json, struct
import numpy as np
from mathutils import Vector
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE)
argv = sys.argv[sys.argv.index('--') + 1:]
src, out, kind = argv[:3]; max_tris = int(argv[3]) if len(argv) > 3 else 14000
os.makedirs(os.path.join(out, 'trees'), exist_ok=True)

bpy.ops.wm.read_factory_settings(use_empty=True)
fn = glob.glob(os.path.join(src, '**', '*.gltf'), recursive=True) + glob.glob(os.path.join(src, '**', '*.glb'), recursive=True)
bpy.ops.import_scene.gltf(filepath=fn[0])
objs = [o for o in bpy.data.objects if o.type == 'MESH']
dg = bpy.context.evaluated_depsgraph_get()

def img_of(m):
    """(image, alpha_image_or_None) feeding the Base Color of a material, if any."""
    if not m or not m.use_nodes: return None, None
    b = next((n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED'), None)
    if not b: return None, None
    def src_img(sock):
        for l in sock.links:
            n = l.from_node
            if n.type == 'TEX_IMAGE': return n.image
            for i in n.inputs:
                r = src_img(i)
                if r: return r
        return None
    return src_img(b.inputs['Base Color']), src_img(b.inputs['Alpha'])

# gather triangles per material
tris = []   # (P (n,3,3), N, UV, material)
for o in objs:
    ev = o.evaluated_get(dg); me = ev.to_mesh()
    if me is None or not len(me.polygons): continue
    me.calc_loop_triangles()
    M = np.array(o.matrix_world)
    nv = len(me.vertices); co = np.empty(nv * 3); me.vertices.foreach_get('co', co); co = (co.reshape(nv, 3) @ M[:3, :3].T + M[:3, 3])
    nt = len(me.loop_triangles); tri = np.empty(nt * 3, dtype=np.int64); me.loop_triangles.foreach_get('vertices', tri); tri = tri.reshape(nt, 3)
    lp = np.empty(nt * 3, dtype=np.int64); me.loop_triangles.foreach_get('loops', lp); lp = lp.reshape(nt, 3)
    tmi = np.empty(nt, dtype=np.int64); me.loop_triangles.foreach_get('material_index', tmi)
    nl = len(me.loops); nd = np.empty(nl * 3); me.corner_normals.foreach_get('vector', nd); N = nd.reshape(nl, 3)[lp]
    NM = np.linalg.inv(M[:3, :3]).T; N = N @ NM.T; l = np.linalg.norm(N, axis=2); l[l == 0] = 1; N = N / l[..., None]
    uv = None
    if me.uv_layers.active:
        uvd = np.empty(nl * 2); me.uv_layers.active.data.foreach_get('uv', uvd); uv = uvd.reshape(nl, 2)[lp]
    if uv is None: uv = np.zeros((nt, 3, 2))
    mats = list(me.materials) or [None]
    P = co[tri]
    if o.matrix_world.determinant() < 0: P = P[:, ::-1]; N = N[:, ::-1]; uv = uv[:, ::-1]
    for mi in np.unique(tmi):
        sel = tmi == mi; tris.append((P[sel], N[sel], uv[sel], mats[min(mi, len(mats) - 1)]))
    ev.to_mesh_clear()
# one entry per material
bym = {}
for P, N, uv, m in tris:
    k = m.name if m else ''
    if k in bym: bym[k] = (np.concatenate([bym[k][0], P]), np.concatenate([bym[k][1], N]), np.concatenate([bym[k][2], uv]), m)
    else: bym[k] = (P, N, uv, m)
tris = list(bym.values())

# normalise: z up in Blender -> the game's y up; ground at 0, height 1
allP = np.concatenate([t[0] for t in tris]).reshape(-1, 3)
mn, mx = allP.min(0), allP.max(0); h = mx[2] - mn[2]; cx, cy = (mn[0] + mx[0]) / 2, (mn[1] + mx[1]) / 2
def norm(P):
    Q = P.copy(); Q[..., 0] -= cx; Q[..., 1] -= cy; Q[..., 2] -= mn[2]; Q /= h
    return np.stack([Q[..., 0], Q[..., 2], -Q[..., 1]], axis=-1)   # x, up, forward
def normN(N): return np.stack([N[..., 0], N[..., 2], -N[..., 1]], axis=-1)
print('[tree] %s: %d materials, height %.2f m, %d tris' % (kind, len(tris), h, sum(len(t[0]) for t in tris)))

# the atlas: each material's image in a column of its own; uvs are wrapped into [0,1) then packed (numpy only)
def resample(px, w, hh):
    H0, W0 = px.shape[:2]; ys = (np.arange(hh) * H0 / hh).astype(int); xs = (np.arange(w) * W0 / w).astype(int)
    return px[ys][:, xs]
cols = []
for P, N, uv, m in tris:
    img, aimg = img_of(m)
    if img is None or not img.size[0]:
        c = (0.45, 0.35, 0.25, 1.0)
        if m and m.use_nodes:
            b = next((n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED'), None)
            if b: c = tuple(b.inputs['Base Color'].default_value)
        px = np.tile(np.array(c, np.float32), (64, 64, 1)); alpha = False
    else:
        w, hh = img.size; px = np.array(img.pixels[:], dtype=np.float32).reshape(hh, w, 4)
        if aimg is not None and aimg != img and aimg.size[0]:
            w2, h2 = aimg.size; apx = np.array(aimg.pixels[:], dtype=np.float32).reshape(h2, w2, 4); px[:, :, 3] = resample(apx, w, hh)[:, :, 0]
        alpha = bool((px[:, :, 3] < 0.5).mean() > 0.02) or bool(m and m.blend_method != 'OPAQUE')
    cols.append((px, alpha))
H = 1024; widths = [max(64, min(2048, int(px.shape[1] * H / px.shape[0]))) for px, _ in cols]
W = sum(widths); atlas = np.zeros((H, W, 4), np.float32); x = 0; ranges = []
for (px, _), w in zip(cols, widths):
    atlas[:, x:x + w] = resample(px, w, H); ranges.append((x / W, w / W)); x += w
if W > 2048: atlas = resample(atlas, 2048, int(H * 2048 / W))
aimg_out = bpy.data.images.new('atlas', atlas.shape[1], atlas.shape[0], alpha=True); aimg_out.pixels = atlas.ravel().tolist()
aimg_out.file_format = 'PNG'; aimg_out.filepath_raw = os.path.join(out, 'trees', kind + '.png'); aimg_out.save()
# the part
chunks = []; total = 0
for (P, N, uv, m), (x0, xw), (im, alpha) in zip(tris, ranges, cols):
    u = (uv[..., 0] % 1.0) * xw + x0; v = uv[..., 1] % 1.0
    chunks.append((norm(P), normN(N), np.stack([u, v], axis=-1), 'leaf' if alpha else 'bark')); total += len(P)
# budget: drop a share of leaf triangles if over (leaves are many small cards; thinning them keeps the shape)
if total > max_tris:
    keep = max_tris / total
    out_chunks = []
    for P, N, U, k in chunks:
        if k == 'leaf' and len(P) > 200:
            idx = np.random.RandomState(3).permutation(len(P))[:max(1, int(len(P) * keep))]; out_chunks.append((P[idx], N[idx], U[idx], k))
        else: out_chunks.append((P, N, U, k))
    chunks = out_chunks
    print('[tree] thinned to %d tris' % sum(len(c[0]) for c in chunks))

# write: FCM1 with one part, two groups (bark then leaf), positions float32, normals int8, colours white, uv float32
pos = []; nor = []; uvs = []; idx = []; groups = []; n = 0
for k in ('bark', 'leaf'):
    s = len(idx) * 3 if False else n
    start = n
    for P, N, U, kk in chunks:
        if kk != k: continue
        m = len(P) * 3
        pos.append(P.reshape(-1, 3)); nor.append(N.reshape(-1, 3)); uvs.append(U.reshape(-1, 2)); idx.append(np.arange(n, n + m)); n += m
    if n > start: groups.append({'s': start, 'n': n - start, 'k': 'plain', 'atlas': kind + '.png', 'r': 0.85, 'm': 0.0, 'cut': 1 if k == 'leaf' else 0})
pos = np.concatenate(pos).astype(np.float32); nor = np.concatenate(nor); uvs = np.concatenate(uvs).astype(np.float32); idx = np.concatenate(idx)
big = n > 65535
blob = pos.tobytes(); po = 0
no = len(blob); blob += np.clip(np.round(nor * 127), -127, 127).astype(np.int8).tobytes()
co = len(blob); blob += (np.full((n, 3), 255, np.uint8)).tobytes()
uo = len(blob); blob += uvs.tobytes()
io = len(blob); blob += (idx.astype(np.uint32) if big else idx.astype(np.uint16)).tobytes()
hdr = {'parts': {'tree': {'v': int(n), 'i': int(len(idx)), 'po': po, 'no': no, 'co': co, 'uo': uo, 'io': io, 'i32': big, 'groups': groups}}, 'meta': {'kind': kind, 'h': round(float(h), 3)}}
hj = json.dumps(hdr).encode()
with open(os.path.join(out, 'trees', kind + '.fcm'), 'wb') as f:
    f.write(b'FCM1'); f.write(struct.pack('<I', len(hj))); f.write(hj); f.write(blob)
print('[tree] wrote %s.fcm: %d tris, atlas %dx%d, groups %s' % (kind, len(idx) // 3, atlas.shape[1], atlas.shape[0], [(g['k'], g['cut'], g['n'] // 3) for g in groups]))
