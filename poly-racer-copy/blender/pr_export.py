# Poly Racer 2.0 car exporter: a Sketchfab glTF (imported in headless Blender 5.x) -> models/<id>.fcm + models/tex/*.jpg
#
# File format: the FCM1 container the game already reads (header JSON + float32 positions, int8 normals, uint8 colours,
# float32 uv, uint16/32 indices per part), plus, new in 2.0, per-part "groups": index ranges that each carry their own
# material: {s, n, k (kind: paint/plain/glass/lamp/chrome/mirror/emit), tex, ntex, rtex (metal in B, roughness in G, as
# glTF), col (sRGB), r, m, a (alpha), base (dominant sRGB colour of a painted texture, so the game can tint it)}.
# Parts: body (the painted shell + trim), det (lamps, chrome, plates, badges, underside), glass, lamp, wheel (the
# front wheel on the +x side, centred on its hub), interior (everything in the cabin but the steering wheel), swheel (the
# steering wheel centred on its hub) and the LODs mid / lo. meta: wheels [[x,y,z]x4], wr, eye, swheel {pos, axis, r},
# cluster {pos, nrm, w, h}, mirror {pos, nrm, w, h}, side ('L'/'R' hand drive), len/wid/ht.
# Frames: Blender x right-of-car-when-facing... (see below), y, z up; the nose points to -Y. The game frame is
# (x, z, -y) of Blender's: x = Blender x, up = Blender z, forward = -Blender y. parseFCM then turns x and z round.
import bpy, bmesh, math, json, struct, os, re, sys, time
import numpy as np
from mathutils import Vector, Matrix

PAINT = (1.0, 0.0, 1.0)
TEX_DIR = None
TEX_MAX = {'body': 2048, 'interior': 1024, 'det': 1024, 'wheel': 1024, 'swheel': 1024, 'glass': 512, 'lamp': 512, 'mid': 512, 'lo': 256}
LOG = []
def log(*a):
    s = ' '.join(str(x) for x in a); LOG.append(s); print('[pr]', s)

def to_game(co): return np.c_[co[:, 0], co[:, 2], -co[:, 1]]
def gv(v): return [round(float(v[0]), 4), round(float(v[2]), 4), round(float(-v[1]), 4)]

# ---------------------------------------------------------------- materials
def principled(m):
    if m is None or not m.use_nodes: return None
    return next((n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED'), None)

def image_into(sock):
    """The image feeding a socket (through mix/normal-map/separate nodes), or None."""
    if sock is None or not sock.is_linked: return None
    stack = [sock.links[0].from_node]; seen = set()
    while stack:
        n = stack.pop()
        if n in seen: continue
        seen.add(n)
        if n.type == 'TEX_IMAGE' and n.image: return n.image
        for i in n.inputs:
            for l in i.links: stack.append(l.from_node)
    return None

def lin2srgb(c):
    c = np.clip(np.asarray(c, dtype=np.float64), 0, 1)
    return np.where(c <= 0.0031308, c * 12.92, 1.055 * np.power(c, 1 / 2.4) - 0.055)

_MI = {}
def mat_info(m):
    """{base: image|None, nrm: image|None, mr: image|None, col: sRGB rgb, r, metal, alpha, emit: rgb|None, name}"""
    if m is None: return dict(base=None, nrm=None, mr=None, col=(0.8, 0.8, 0.8), r=0.5, metal=0.0, alpha=1.0, emit=None, name='')
    if m.name in _MI: return _MI[m.name]
    b = principled(m)
    d = dict(base=None, nrm=None, mr=None, col=(0.8, 0.8, 0.8), r=0.5, metal=0.0, alpha=1.0, emit=None, name=m.name)
    if b:
        d['base'] = image_into(b.inputs['Base Color']); d['col'] = tuple(lin2srgb(b.inputs['Base Color'].default_value[:3]))
        d['nrm'] = image_into(b.inputs['Normal'])
        d['mr'] = image_into(b.inputs['Roughness']) or image_into(b.inputs['Metallic'])
        d['r'] = float(b.inputs['Roughness'].default_value); d['metal'] = float(b.inputs['Metallic'].default_value)
        a = b.inputs['Alpha']; d['alpha'] = float(a.default_value) if not a.is_linked else 1.0   # a linked alpha (cutout) counts as opaque
        if a.is_linked:
            ai = image_into(a)
            if ai is not None and ai.size[0] > 0: d['alpha_img'] = ai
        es = b.inputs.get('Emission Strength'); ec = b.inputs.get('Emission Color')
        if es and ec and es.default_value > 0 and (ec.is_linked or max(ec.default_value[:3]) > 0.05):
            d['emit'] = tuple(lin2srgb(ec.default_value[:3])) if not ec.is_linked else (1, 1, 1); d['emit_img'] = image_into(ec)
    _MI[m.name] = d
    return d

# ---------------------------------------------------------------- textures
_PIX = {}
def img_pixels(img, size):
    """(h, w, 4) float32, shrunk by halving to <= size (power of two sized images shrink exactly)."""
    key = (img.name, size)
    if key in _PIX: return _PIX[key]
    w, h = img.size
    if w == 0 or h == 0: return None
    px = np.empty(w * h * 4, dtype=np.float32); img.pixels.foreach_get(px); px = px.reshape(h, w, 4)
    while max(px.shape[0], px.shape[1]) > size and px.shape[0] % 2 == 0 and px.shape[1] % 2 == 0:
        px = px.reshape(px.shape[0] // 2, 2, px.shape[1] // 2, 2, 4).mean(axis=(1, 3))
    if max(px.shape[0], px.shape[1]) > size:
        s = size / max(px.shape[0], px.shape[1]); nh, nw = max(1, round(px.shape[0] * s)), max(1, round(px.shape[1] * s))
        px = px[(np.arange(nh) * px.shape[0] // nh)][:, (np.arange(nw) * px.shape[1] // nw)]
    px = np.ascontiguousarray(px, dtype=np.float32)
    _PIX[key] = px
    return px

def save_png(px, path):
    h, w = px.shape[:2]
    im = bpy.data.images.new('pr_tex_out', w, h, alpha=True)
    im.pixels.foreach_set(np.ascontiguousarray(px, dtype=np.float32).ravel())
    im.filepath_raw = path; im.file_format = 'PNG'; im.save(filepath=path)
    bpy.data.images.remove(im)

def save_jpg(px, path, quality=86):
    h, w = px.shape[:2]
    im = bpy.data.images.new('pr_tex_out', w, h, alpha=False)
    im.pixels.foreach_set(np.ascontiguousarray(px, dtype=np.float32).ravel())
    im.filepath_raw = path; im.file_format = 'JPEG'
    im.save(filepath=path, quality=quality)
    bpy.data.images.remove(im)

_TEX_DONE = {}
def write_tex(img, prefix, kind, size, linear=False, alpha=False):
    """Write an image as jpg (png with alpha for decals) under TEX_DIR (once per image+size); returns the file name."""
    if img is None: return None
    key = (img.name, size, alpha)
    if key in _TEX_DONE: return _TEX_DONE[key]
    px = img_pixels(img, size)
    if px is None: return None
    name = re.sub(r'[^a-z0-9]+', '-', ('%s-%s-%s' % (prefix, kind, os.path.splitext(img.name)[0])).lower()).strip('-')[:60] + ('.png' if alpha else '.jpg')
    # Blender holds the pixels linear for colour images (it converts on load); write back as sRGB. Data images stay as they are.
    out = px.copy()
    if not linear and img.colorspace_settings.name not in ('Non-Color', 'Linear Rec.709', 'Linear'):
        out[..., :3] = lin2srgb(out[..., :3])
    if alpha: save_png(out, os.path.join(TEX_DIR, name))
    else: save_jpg(out, os.path.join(TEX_DIR, name), quality=90 if kind == 'n' else 86)
    _TEX_DONE[key] = name
    return name

def dominant(img, uv):
    """Dominant (median) sRGB colour of the texels a set of triangles covers: the paint colour baked into a texture."""
    px = img_pixels(img, 512); h, w = px.shape[:2]
    c = uv.reshape(-1, 2); c = c - np.floor(c)
    s = px[np.clip((c[:, 1] * h).astype(int), 0, h - 1), np.clip((c[:, 0] * w).astype(int), 0, w - 1), :3]
    col = np.median(s, axis=0)
    if img.colorspace_settings.name not in ('Non-Color',): col = lin2srgb(col)
    return tuple(float(x) for x in col)

# ---------------------------------------------------------------- triangles
def drop_transparent(P, N, tm, uv):
    """Leaves out triangles sitting on the transparent part of a cut-out texture (decal sheets over the paint)."""
    if uv is None: return P, N, tm, uv
    keep = np.ones(len(P), bool); done = False
    for m in set(tm):
        d = mat_info(m)
        if not d.get('alpha_img'): continue
        px = img_pixels(d['alpha_img'], 512)
        if px is None or px.shape[2] < 4: continue
        sel = np.array([x == m for x in tm]); c = uv[sel].mean(axis=1); c = c - np.floor(c); h, w = px.shape[:2]
        al = px[np.clip((c[:, 1] * h).astype(int), 0, h - 1), np.clip((c[:, 0] * w).astype(int), 0, w - 1), 3]
        keep[np.flatnonzero(sel)[al < 0.35]] = False; done = True
    if not done or keep.all(): return P, N, tm, uv
    k = np.flatnonzero(keep)
    return P[k], (N[k] if N is not None else None), [tm[i] for i in k], uv[k]

def eval_tris(ob, dg, root_inv, with_normals=True):
    """(P (n,3,3), N (n,3,3) or None, mats per tri, uv (n,3,2) or None) in the root's frame."""
    ev = ob.evaluated_get(dg); me = ev.to_mesh()
    if me is None or len(me.polygons) == 0:
        ev.to_mesh_clear(); return None
    me.calc_loop_triangles()
    mw = root_inv @ ob.matrix_world; M = np.array(mw)
    nv = len(me.vertices); co = np.empty(nv * 3); me.vertices.foreach_get('co', co); co = co.reshape(nv, 3)
    co = co @ M[:3, :3].T + M[:3, 3]
    nt = len(me.loop_triangles); tri = np.empty(nt * 3, dtype=np.int64); me.loop_triangles.foreach_get('vertices', tri); tri = tri.reshape(nt, 3)
    lp = np.empty(nt * 3, dtype=np.int64); me.loop_triangles.foreach_get('loops', lp); lp = lp.reshape(nt, 3)
    tmi = np.empty(nt, dtype=np.int64); me.loop_triangles.foreach_get('material_index', tmi)
    mats = list(me.materials) or [None]
    tm = [mats[min(i, len(mats) - 1)] for i in tmi]
    uv = None
    if me.uv_layers.active:
        nl = len(me.loops); uvd = np.empty(nl * 2); me.uv_layers.active.data.foreach_get('uv', uvd); uv = uvd.reshape(nl, 2)[lp]
    N = None
    if with_normals:
        nl = len(me.loops); nd = np.empty(nl * 3); me.corner_normals.foreach_get('vector', nd); N = nd.reshape(nl, 3)[lp]
        NM = np.linalg.inv(M[:3, :3]).T; N = N @ NM.T; l = np.linalg.norm(N, axis=2); l[l == 0] = 1; N = N / l[..., None]
    P = co[tri]
    if mw.determinant() < 0:
        P = P[:, ::-1]; uv = uv[:, ::-1] if uv is not None else None; N = N[:, ::-1] if N is not None else None
    if N is not None:
        # a panel whose winding runs against its own shading normals (a door the artist flipped) would be culled
        # as a back face in the game: turn those triangles round so the winding agrees with the normals
        g = np.cross(P[:, 1] - P[:, 0], P[:, 2] - P[:, 0]); bad = np.einsum('ij,ij->i', g, N.mean(axis=1)) < 0
        if bad.any():
            P = P.copy(); N = N.copy(); P[bad] = P[bad][:, ::-1]; N[bad] = N[bad][:, ::-1]
            if uv is not None: uv = uv.copy(); uv[bad] = uv[bad][:, ::-1]
            if bad.sum() > 50: log('%d of %d triangles of %s wound backwards: turned round' % (int(bad.sum()), len(P), ob.name[:40]))
    ev.to_mesh_clear()
    return P, N, tm, uv

# ---------------------------------------------------------------- writing
class Part:
    """Triangles collected for one exported part: lists of chunks (P, N, mats, uv, opts)."""
    def __init__(self, name): self.name = name; self.chunks = []
    def add(self, P, N, mats, uv, opts=None): self.chunks.append((P, N, mats, uv, opts or {}))
    def ntris(self): return sum(len(c[0]) for c in self.chunks)

def kind_of(m, opts):
    """Material kind for a triangle's material: paint / glass / lamp / chrome / mirror / emit / plain."""
    if opts.get('kind'): return opts['kind']
    d = mat_info(m); n = d['name'].lower()
    if d['alpha'] < 0.95 and not d['base']: return 'glass'
    if 'glass' in n and 'light' not in n and 'lamp' not in n: return 'glass'
    if 'mirror' in n and d['metal'] > 0.8 and d['r'] < 0.15: return 'mirror'
    if d['metal'] > 0.85 and d['r'] < 0.25 and not d['base']: return 'chrome'
    if d['emit'] is not None: return 'emit'
    return 'plain'


def bake_vertex_ao(targets, occluders, samples=24, distance=1.6):
    """Ambient occlusion baked into vertex colours in Cycles. targets: {name: (vpos (n,3), inv (m,))}; occluders: list of
    (n,3,3) triangle arrays. All in the same frame. Returns {name: ao (n,) in 0..1}."""
    import bmesh
    sc = bpy.context.scene; objs = []
    def mesh_obj(name, verts, faces):
        me = bpy.data.meshes.new(name); me.from_pydata([tuple(v) for v in verts], [], [tuple(f) for f in faces]); me.update()
        ob = bpy.data.objects.new(name, me); sc.collection.objects.link(ob); return ob
    for i, T in enumerate(occluders):
        T = T.reshape(-1, 3); mesh_obj('ao_occ%d' % i, T, np.arange(len(T)).reshape(-1, 3))
        objs.append(bpy.data.objects['ao_occ%d' % i])
    out = {}
    old_engine = sc.render.engine; sc.render.engine = 'CYCLES'; sc.cycles.samples = samples; sc.cycles.device = 'CPU'
    if sc.world is None: sc.world = bpy.data.worlds.new('ao_world')
    sc.world.light_settings.distance = distance
    sc.render.bake.use_selected_to_active = False; sc.render.bake.target = 'VERTEX_COLORS'
    for name, (vpos, inv) in targets.items():
        ob = mesh_obj('ao_' + name, vpos, inv.reshape(-1, 3)); objs.append(ob)
        ob.data.color_attributes.new('ao', 'FLOAT_COLOR', 'POINT')
        for o in bpy.data.objects: o.select_set(False)
        ob.select_set(True); bpy.context.view_layer.objects.active = ob
        bpy.ops.object.bake(type='AO', target='VERTEX_COLORS')
        ca = ob.data.color_attributes['ao']; n = len(ob.data.vertices); vals = np.empty(n * 4); ca.data.foreach_get('color', vals)
        out[name] = np.clip(vals.reshape(n, 4)[:, 0], 0, 1)
    for ob in objs:
        me = ob.data; bpy.data.objects.remove(ob); bpy.data.meshes.remove(me)
    sc.render.engine = old_engine
    return out

def write_fcm(parts, path, prefix, meta=None):
    hdr = {'parts': {}}; blobs = []; off = 0
    built = []   # (pname, vpos, vn, vc, vu, inv, groups)
    for part in parts:
        if not part.chunks: continue
        pname = part.name; size = TEX_MAX.get(pname, 1024)
        # group key -> lists
        G = {}
        for P, N, mats, uv, o in part.chunks:
            for i in range(len(P)):
                m = mats[i]; d = mat_info(m); k = kind_of(m, o)
                col = PAINT if k == 'paint' else (d['emit'] if k == 'emit' and d['emit'] else d['col'])
                key = (k, m.name if m else '', bool(uv is not None and (d['base'] or d['nrm'] or d['mr'])))
                g = G.setdefault(key, dict(k=k, m=m, P=[], N=[], U=[], d=d, flat=bool(o.get('flat')), tint=bool(o.get('tint', True)), col=col))
                g['P'].append(P[i]); g['N'].append(N[i] if N is not None else None); g['U'].append(uv[i] if uv is not None else np.zeros((3, 2)))
        pos_all, nor_all, uv_all, col_all, idx_all, groups = [], [], [], [], [], []
        base = 0
        for key, g in G.items():
            P = np.array(g['P']); n = len(P); U = np.array(g['U'], dtype=np.float64)
            N = np.array([x if x is not None else [[0, 0, 1]] * 3 for x in g['N']], dtype=np.float64)
            d = g['d']; k = g['k']
            grp = dict(s=0, n=n * 3, k=k)
            textured = key[2]
            if textured and k not in ('glass',):
                if k == 'decal' and d['base'] is not None: grp['tex'] = write_tex(d['base'], prefix, 'd', min(size, 1024), alpha=True)
                elif d['base'] is not None:
                    if k == 'paint' and g['tint']:
                        grp['tex'] = write_tex(d['base'], prefix, 'c', size); grp['base'] = [round(x, 3) for x in dominant(d['base'], U)]
                    elif k == 'paint': pass   # paint with the texture ignored: flat marker colour
                    else: grp['tex'] = write_tex(d['base'], prefix, 'c', size)
                if d['nrm'] is not None and pname not in ('lo',): grp['ntex'] = write_tex(d['nrm'], prefix, 'n', min(size, 1024), linear=True)
                if d['mr'] is not None and pname not in ('lo',): grp['rtex'] = write_tex(d['mr'], prefix, 'r', min(size, 1024), linear=True)
            if 'tex' not in grp or k == 'paint': grp['col'] = [round(float(c), 3) for c in g['col']]
            grp['r'] = round(d['r'], 2); grp['m'] = round(d['metal'], 2)
            if k == 'glass': grp['a'] = round(max(0.15, min(0.9, d['alpha'] if d['alpha'] < 0.95 else 0.5)), 2); grp['col'] = [round(float(c), 3) for c in d['col']]
            if k == 'emit' and d['emit']: grp['emit'] = [round(float(c), 3) for c in d['emit']]
            # vertex colours: the marker for paint, else white (textures) or the flat colour
            if k == 'paint': vc = np.array(PAINT)
            elif 'tex' in grp: vc = np.array((1.0, 1.0, 1.0))
            else: vc = np.array(g['col'][:3])
            has_uv = any(t in grp for t in ('tex', 'ntex', 'rtex'))
            pos = to_game(P.reshape(-1, 3)); nor = to_game(N.reshape(-1, 3)); uvs = U.reshape(-1, 2) if has_uv else np.zeros((n * 3, 2))
            cols = np.repeat(vc[None, :], n * 3, axis=0)
            if k == 'emit' and pname == 'lamp':
                # the game tells head from tail lamps by the vertex colour: white at the front, red at the back, amber at the sides
                cz = np.repeat(P[:, :, 1].mean(axis=1), 3); front = cz < 0
                flat = np.array(g['col'][:3]); isred = flat[0] > 0.45 and flat[1] < flat[0] * 0.5
                if 'tex' in grp or not isred:
                    cols = np.where(front[:, None], np.array([[1.0, 1.0, 1.0]]), np.array([[0.95, 0.12, 0.1]])) * (cols if 'tex' not in grp else 1.0)
            pos_all.append(pos); nor_all.append(nor); uv_all.append(uvs); col_all.append(cols)
            grp['s'] = base; base += n * 3; groups.append(grp)
        pos = np.concatenate(pos_all).astype(np.float32); nor = np.concatenate(nor_all); uvs = np.concatenate(uv_all); cols = np.concatenate(col_all)
        # weld corners that share everything
        keyv = np.c_[np.round(pos * 4000), np.round(nor * 60), np.round(cols * 255), np.round(uvs * 4000)]
        _, first, inv = np.unique(keyv, axis=0, return_index=True, return_inverse=True); inv = inv.reshape(-1).astype(np.int64)
        vpos = pos[first]; vn = nor[first]; vc = cols[first]; vu = uvs[first]
        built.append((pname, vpos, vn, vc, vu, inv, groups))
    # ambient occlusion in the vertices of the body and the detail, with the whole car (wheels on their hubs) as occluder
    ao_of = {}
    if not os.environ.get('PR_NO_AO'):
        occ = {}
        for pname, vpos, vn, vc, vu, inv, groups in built:
            if pname in ('mid', 'lo', 'swheel'): continue
            T = vpos[inv].reshape(-1, 3, 3)
            if pname == 'wheel' and meta and meta.get('wheels'):
                for i, (x, r, z) in enumerate(meta['wheels']):
                    W = T.copy(); W[:, :, 0] = np.where(x < 0, -W[:, :, 0], W[:, :, 0]) + x; W[:, :, 1] += r; W[:, :, 2] += z; occ['wheel%d' % i] = W
            else: occ[pname] = T
        for pname, vpos, vn, vc, vu, inv, groups in built:
            if pname not in ('body', 'det'): continue
            try:   # the part occludes itself through its own mesh; the other parts are added as occluders
                ao_of.update(bake_vertex_ao({pname: (vpos, inv)}, [T for k, T in occ.items() if k != pname]))
                log('ambient occlusion baked into %s (mean %.2f)' % (pname, float(ao_of[pname].mean())))
            except Exception as e: log('ambient occlusion bake failed:', e)
    for pname, vpos, vn, vc, vu, inv, groups in built:
        blob = bytearray()
        o_pos = len(blob); blob += vpos.astype('<f4').tobytes()
        o_nor = len(blob); blob += np.clip(np.round(vn * 127), -127, 127).astype(np.int8).tobytes()
        while len(blob) % 4: blob += b'\0'
        o_col = len(blob); blob += np.clip(np.round(vc * 255), 0, 255).astype(np.uint8).tobytes()
        while len(blob) % 4: blob += b'\0'
        o_uv = len(blob); blob += vu.astype('<f4').tobytes()
        o_idx = len(blob); big = len(vpos) > 65000
        blob += (inv.astype('<u4') if big else inv.astype('<u2')).tobytes()
        while len(blob) % 4: blob += b'\0'
        m = dict(v=int(len(vpos)), i=int(len(inv)), po=o_pos + off, no=o_nor + off, co=o_col + off, uo=o_uv + off, io=o_idx + off, i32=big, groups=groups)
        if pname in ao_of:
            o_ao = len(blob); blob += np.clip(np.round(ao_of[pname] * 255), 0, 255).astype(np.uint8).tobytes()
            while len(blob) % 4: blob += b'\0'
            m['ao'] = o_ao + off
        hdr['parts'][pname] = m; blobs.append(bytes(blob)); off += len(blob)
        log('part %-9s %7d tris %7d verts %2d groups %s' % (pname, len(inv) // 3, len(vpos), len(groups), ' '.join(sorted(set(g['k'] for g in groups)))))
    if meta: hdr['meta'] = meta
    hj = json.dumps(hdr, separators=(',', ':')).encode(); pad = (4 - (8 + len(hj)) % 4) % 4
    with open(path, 'wb') as f:
        f.write(b'FCM1'); f.write(struct.pack('<I', len(hj) + pad)); f.write(hj + b' ' * pad)
        for b in blobs: f.write(b)
    log('wrote', os.path.basename(path), round(os.path.getsize(path) / 1e6, 2), 'MB')
    return hdr

# ---------------------------------------------------------------- the car
KW = {   # keyword tables for classifying objects by their own and their material's names
    'wheel': ['wheel', 'tire', 'tyre', 'rim', 'brake', 'caliper', 'disc', 'rotor', 'hub'],
    'glass': ['glass', 'window', 'windshield', 'windscreen'],
    'interior': ['interior', 'seat', 'dash', 'console', 'carpet', 'pedal', 'belt', 'floor', 'roof_lining', 'headliner', 'door_card', 'doorcard', 'gauge', 'cluster', 'cockpit', 'cabin', 'shifter', 'gear', 'sunvisor', 'visor', 'armrest', 'handbrake', 'leather', 'fabric', 'alcantara'],
    'swheel': ['steering', 'steer', 'volante', 'lenkrad'],
    'lamp': ['headlight', 'taillight', 'tail_light', 'head_light', 'lamp', 'light', 'lens', 'blinker', 'indicator', 'turn_signal', 'brakelight', 'fog', 'reflector', 'drl'],
    'paint': ['paint', 'body', 'carpaint', 'car_paint', 'bodywork', 'carrosserie', 'exterior'],
    'decal': ['decal', 'sticker', 'logo', 'badge', 'badging', 'plate', 'stripe', 'livery', 'symbol', 'text', 'label', 'emblem', 'detail', 'stitch'],
    'skip': ['logo_plane', 'shadow', 'plane_shadow', 'floor_plane', 'backdrop', 'ground', 'cube', 'collision', 'dummy', 'stand', 'studio', 'env'],
}
def has_kw(s, kws): s = s.lower(); return any(k in s for k in kws)

def classify_default(ob, m):
    """-> (part, opts) for an object with material m by names."""
    on = ob.name.lower(); mn = (m.name if m else '').lower(); both = on + '|' + mn
    if has_kw(both, KW['skip']) and not has_kw(both, KW['paint'] + KW['interior']): return None, {}
    if mat_info(m).get('alpha_img') is not None and has_kw(both, KW['decal']): return 'det', {'kind': 'decal'}
    if has_kw(both, KW['swheel']): return 'swheel', {}
    if has_kw(both, KW['wheel']) and not has_kw(both, ['well', 'arch', 'fender', 'steering']): return 'wheelsrc', {}
    d = mat_info(m)
    if has_kw(both, KW['interior']): return 'interior', {}
    if has_kw(both, KW['glass']) and (d['alpha'] < 0.95 or 'glass' in mn): return 'glass', {}
    if has_kw(both, KW['lamp']): return 'det', {'kind': 'lamp' if d['alpha'] >= 0.95 or 'lens' in mn or 'light' in mn else 'glass'}
    if has_kw(mn, KW['paint']) or (has_kw(on, KW['paint']) and d['metal'] < 0.5 and d['r'] < 0.7): return 'body', {'kind': 'paint'}
    if d['alpha'] < 0.95: return 'glass', {}
    return 'det', {}


class PaintShell:
    """The painted surface as a grid of cells (2 cm) with the paint's normal and centre in each, to find triangles
    lying on it or just inside it (inner duplicate shells); trims standing proud of the paint are kept."""
    def __init__(self, P, N, cell=0.02):
        self.cell = cell; self.ok = len(P) > 0
        if not self.ok: return
        c = P.mean(axis=1); n = N.mean(axis=1); l = np.linalg.norm(n, axis=1); l[l == 0] = 1; n = n / l[:, None]
        keys = np.round(c / cell).astype(np.int64)
        self.cells = {}
        for k, nn, cc in zip(map(tuple, keys), n, c):
            a = self.cells.get(k)
            if a is None: self.cells[k] = [nn.copy(), cc.copy(), 1]
            else: a[0] += nn; a[1] += cc; a[2] += 1
    def on(self, P, N):
        """Mask of triangles within a cell of the paint, facing the same way, and not standing out from it."""
        if not self.ok or len(P) == 0: return np.zeros(len(P), bool)
        c = P.mean(axis=1); n = N.mean(axis=1); l = np.linalg.norm(n, axis=1); l[l == 0] = 1; n = n / l[:, None]
        keys = np.round(c / self.cell).astype(np.int64); out = np.zeros(len(P), bool)
        for i, (k, nn, cc) in enumerate(zip(map(tuple, keys), n, c)):
            for dx in (-1, 0, 1):
                for dy in (-1, 0, 1):
                    for dz in (-1, 0, 1):
                        a = self.cells.get((k[0] + dx, k[1] + dy, k[2] + dz))
                        if a is None: continue
                        pn = a[0] / max(1e-9, np.linalg.norm(a[0])); pc = a[1] / a[2]
                        if abs(float(pn @ nn)) > 0.9 and float((cc - pc) @ pn) < 0.006: out[i] = True; break
                    if out[i]: break
                if out[i]: break
        return out

def mesh_objects(): return [o for o in bpy.data.objects if o.type == 'MESH']

def bbox(objs, dg, inv):
    co = []
    for o in objs:
        r = eval_tris(o, dg, inv, with_normals=False)
        if r: co.append(r[0].reshape(-1, 3))
    co = np.concatenate(co); return co.min(0), co.max(0)

def decimated(ob, ratio):
    """A copy of ob with a Decimate modifier (not applied: the evaluated mesh is read)."""
    c = ob.copy(); c.data = ob.data; bpy.context.scene.collection.objects.link(c)
    md = c.modifiers.new('dec', 'DECIMATE'); md.ratio = ratio; md.use_collapse_triangulate = True
    return c

BUDGET = {'body': 45000, 'det': 45000, 'interior': 32000, 'glass': 6000, 'lamp': 6000, 'wheelsrc': 2500, 'swheel': 4000}

def components(P):
    """Connected components of triangles (n,3,3) by shared corner positions: label per triangle."""
    key = np.round(P.reshape(-1, 3) * 2000).astype(np.int64)
    _, vid = np.unique(key, axis=0, return_inverse=True); vid = vid.reshape(-1, 3)
    parent = np.arange(vid.max() + 1)
    def find(a):
        while parent[a] != a: parent[a] = parent[parent[a]]; a = parent[a]
        return a
    for t in vid:
        a = find(t[0])
        for b in (t[1], t[2]):
            rb = find(b)
            if rb != a: parent[rb] = a
    roots = np.array([find(v) for v in vid[:, 0]])
    _, lab = np.unique(roots, return_inverse=True)
    return lab.reshape(-1)

def find_wheels_spatial(P, W, H):
    """Wheels without names: ring-shaped connected pieces near the corners at ground level, one per quadrant.
    P: triangles (n,3,3) of the body/det objects. Returns {quadrant: dict(c, r, hw)} with four entries, or None."""
    c = P.mean(axis=1)
    low = (c[:, 2] < min(1.0, H * 0.62)) & (np.abs(c[:, 0]) > W * 0.2)
    idx = np.flatnonzero(low)
    if len(idx) < 100: return None
    lab = components(P[idx]); cands = []
    for l in np.unique(lab):
        sel = idx[lab == l]
        if len(sel) < 60: continue
        q = P[sel].reshape(-1, 3); mn, mx = q.min(0), q.max(0); ext = mx - mn
        if 0.42 < ext[1] < 1.1 and 0.42 < ext[2] < 1.1 and abs(ext[1] - ext[2]) < 0.22 * max(ext[1], ext[2]) and ext[0] < 0.55:
            cands.append(dict(c=(mn + mx) / 2, r=float(ext[2] / 2), hw=float(ext[0] / 2), n=len(sel)))
    best = {}
    # a tyre touches the ground: its centre is one radius up. Rings higher than that (a spare, a roof vent, a seat
    # frame, a door's window frame) are not wheels, however big; among the grounded ones the biggest wins
    grounded = [w for w in cands if abs(w['c'][2] - w['r']) < 0.12]
    for w in (grounded or cands):
        q = (w['c'][0] > 0, w['c'][1] > 0)
        if q not in best or w['r'] > best[q]['r']: best[q] = w
    log('spatial wheels: %d ring pieces, %d corners' % (len(cands), len(best)))
    return best if len(best) == 4 else None

def in_wheel(c, wheels, margin=0.015):
    """For centroids c (n,3): which wheel's cylinder each lies in (-1 = none)."""
    out = np.full(len(c), -1)
    for i, w in enumerate(wheels):
        d = np.hypot(c[:, 1] - w['c'][1], c[:, 2] - w['c'][2])
        m = (d <= w['r'] + margin) & (np.abs(c[:, 0] - w['c'][0]) <= w['hw'] + margin)
        m |= np.linalg.norm(c - w['c'], axis=1) <= w['r'] + 0.02   # a wheel modelled steered sticks out of the cylinder
        out[m] = i
    return out


def find_steering_wheel_hough(P, cab, side_hint=None, debug=False, wide=False):
    """A steering wheel welded to its column or dash: a Hough vote for a ring of radius 0.16-0.22 m in a plane raked
    like a wheel (its axis tilted 10-40 degrees up from the car's length axis). Returns (min, max) of a box round it."""
    c = P.mean(axis=1)
    H = cab['z1'] + 0.03; xmax = cab.get('xw', 0.8)
    zone = (c[:, 2] > cab['z0'] + 0.28) & (c[:, 2] < min(H * 0.85, cab['z0'] + 1.15)) & (np.abs(c[:, 0]) > 0.1) & (np.abs(c[:, 0]) < xmax)
    zone &= (c[:, 1] > cab.get('ya', -1e9)) & (c[:, 1] < cab.get('yb', 1e9))
    if not wide: zone &= (c[:, 1] > cab['y0'] - 0.35) & (c[:, 1] < cab['y0'] + 1.0)
    if side_hint == 'L': zone &= c[:, 0] > 0
    if side_hint == 'R': zone &= c[:, 0] < 0
    pts = c[zone]
    if len(pts) < 120: return None
    best = None
    for rake in (12, 22, 32, 42, 54, 66):
        t = math.radians(rake); a = np.array([0.0, math.cos(t), math.sin(t)])   # the axis, pointing back to the driver and up
        e1 = np.array([1.0, 0.0, 0.0]); e2 = np.cross(a, e1)
        u = pts @ e1; v = pts @ e2; w = pts @ a
        for r in (0.165, 0.18, 0.195, 0.21):
            th = np.linspace(0, 2 * np.pi, 20, endpoint=False)
            cu = (u[:, None] - r * np.cos(th)[None, :]).ravel(); cv = (v[:, None] - r * np.sin(th)[None, :]).ravel(); cw = np.repeat(w, len(th))
            key = np.c_[np.round(cu / 0.02), np.round(cv / 0.02), np.round(cw / 0.04)].astype(np.int64)
            uniq, cnt = np.unique(key, axis=0, return_counts=True)
            k = np.argmax(cnt); cen = uniq[k] * np.array([0.02, 0.02, 0.04]); votes = int(cnt[k])
            if votes < 20: continue
            # refit the radius, then see how much of the ring is there
            d = np.hypot(u - cen[0], v - cen[1]); near = (np.abs(d - r) < 0.05) & (np.abs(w - cen[2]) < 0.06)
            rr = float(np.median(d[near])) if near.sum() > 20 else r
            onring = (np.abs(d - rr) < 0.03) & (np.abs(w - cen[2]) < 0.06)
            ang = np.arctan2(v[onring] - cen[1], u[onring] - cen[0]); nb = len(np.unique(np.floor((ang + np.pi) / (2 * np.pi) * 24).astype(int)))
            ok = (nb >= 20 and votes >= 22) or (nb >= 13 and votes >= 50)
            score = (nb * 25 + min(votes, 400)) * (2 if ok else 1)
            if best is None or score > best[0]: best = (score, ok, votes, rake, rr, cen, a, e1, e2, nb)
    if best is None: return None
    score, ok, cnt, rake, r, cen, a, e1, e2, nb = best
    if debug: log('swheel hough: best %d votes, rake %d, r %.3f, ring bins %d/24, at' % (cnt, rake, r, nb), [round(float(x), 2) for x in cen[0] * e1 + cen[1] * e2 + cen[2] * a])
    if not ok: return None
    centre = cen[0] * e1 + cen[1] * e2 + cen[2] * a
    # the box round the wheel: the rim's disc plus a little depth (hub, spokes, airbag)
    corners = []
    for du in (-r - 0.035, r + 0.035):
        for dv in (-r - 0.035, r + 0.035):
            for dw in (-0.09, 0.07): corners.append(centre + du * e1 + dv * e2 + dw * a)
    corners = np.array(corners)
    return corners.min(0), corners.max(0)

def find_steering_wheel(P, cab, side_hint=None, debug=False, wide=False):
    """Among triangles (n,3,3), the connected piece shaped like a steering wheel (a ring 0.3-0.46 m across, thin, ahead of
    a front seat, on the driver's side). Returns (min, max) of its box or None."""
    c = P.mean(axis=1)
    # between the axles, a hand's width or more off the centre line but well inside the car's sides (tail lamps,
    # fog lamps and badges are rings too), at the height of a dashboard
    H = cab['z1'] + 0.03; xmax = cab.get('xw', 0.8)
    zone = (c[:, 2] > cab['z0'] + 0.28) & (c[:, 2] < min(H * 0.85, cab['z0'] + 1.15)) & (np.abs(c[:, 0]) > 0.12) & (np.abs(c[:, 0]) < xmax)
    zone &= (c[:, 1] > cab.get('ya', -1e9)) & (c[:, 1] < cab.get('yb', 1e9))
    if not wide: zone &= (c[:, 1] > cab['y0'] - 0.15) & (c[:, 1] < cab['y0'] + 0.8)
    if side_hint == 'L': zone &= c[:, 0] > 0
    if side_hint == 'R': zone &= c[:, 0] < 0
    if zone.sum() < 50:
        if debug: log('swheel search: only %d tris in the zone (of %d); zone y %.2f..%.2f z %.2f..%.2f |x| < %.2f' % (zone.sum(), len(P), cab.get('ya', -9), cab.get('yb', 9), max(cab['z0'] + 0.25, H * 0.5), H * 0.82, xmax))
        return None
    idx = np.flatnonzero(zone); lab = components(P[idx])
    best = None; seen = []
    for l in np.unique(lab):
        sel = idx[lab == l]
        if len(sel) < 40: continue
        q = P[sel].reshape(-1, 3); ext = q.max(0) - q.min(0); e = np.sort(ext)
        seen.append((len(sel), [round(float(x), 2) for x in ext]))
        if 0.3 < e[2] < 0.48 and 0.26 < e[1] < 0.48 and e[0] < 0.22:
            if best is None or len(sel) > best[0]: best = (len(sel), q.min(0), q.max(0))
    if debug: log('swheel search: zone tris', len(idx), 'components', sorted(seen, reverse=True)[:8])
    return (best[1], best[2]) if best else None

def build_car(spec, out_path, tex_dir, prefix):
    """spec: id, gltf, rot (deg about Z so the nose points to -Y), len (m), classify overrides, side, budgets."""
    global TEX_DIR; TEX_DIR = tex_dir; os.makedirs(tex_dir, exist_ok=True); LOG.clear(); _TEX_DONE.clear(); _PIX.clear(); _MI.clear()
    t0 = time.time()
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=spec['gltf'])
    # one root: rotate so the nose is at -Y, scale to the game's length, put the tyres on z = 0, centre x and y
    root = bpy.data.objects.new('ROOT', None); bpy.context.scene.collection.objects.link(root)
    objs = mesh_objects()
    for o in objs:
        if o.parent is None: o.parent = root
        elif o.parent.type != 'MESH' and o.parent.parent is None and o.parent is not root: o.parent.parent = root
    for e in bpy.data.objects:
        if e.type == 'EMPTY' and e is not root and e.parent is None: e.parent = root
    bpy.context.view_layer.update()
    dg = bpy.context.evaluated_depsgraph_get()
    I = Matrix.Identity(4)
    # classify first (names), so the wheels can be measured
    cls = {}
    ov = spec.get('classify', {})
    for o in objs:
        m = o.data.materials[0] if o.data.materials else None
        part, opts = None, {}
        for pat, val in ov.items():
            if re.search(pat, o.name + '|' + (m.name if m else ''), re.I): part, opts = (val if isinstance(val, list) else [val, {}]); break
        else:
            part, opts = classify_default(o, m)
        cls[o.name] = (part, dict(opts))
    # no paint found by name: the material covering the most of the outside is the body paint (tinted texture)
    if not any(cls[o.name][0] == 'body' and cls[o.name][1].get('kind') == 'paint' for o in objs) and spec.get('auto_paint', True):
        dg0 = bpy.context.evaluated_depsgraph_get(); area = {}
        for o in objs:
            if cls[o.name][0] not in ('body', 'det'): continue
            r = eval_tris(o, dg0, I, with_normals=False)
            if r is None: continue
            P, tm = r[0], r[2]
            A = 0.5 * np.linalg.norm(np.cross(P[:, 1] - P[:, 0], P[:, 2] - P[:, 0]), axis=1)
            for m in set(tm):
                sel = np.array([x == m for x in tm]); key = m.name if m else ''
                area[key] = area.get(key, 0.0) + float(A[sel].sum())
        if area:
            top = max(area, key=area.get)
            for o in objs:
                m = o.data.materials[0] if o.data.materials else None
                if (m.name if m else '') == top and cls[o.name][0] in ('body', 'det'): cls[o.name] = ('body', {'kind': 'paint', 'tint': spec.get('tint', True)})
            log('auto paint: material %s covers the most outside (%.1f m2)' % (top, area[top]))
    # the car's extent and the transform. rot 'auto': the long axis goes along y, and the nose is the end the
    # steering wheel is nearer to.
    body_objs = [o for o in objs if cls[o.name][0] in ('body', 'det', 'glass', 'wheelsrc')]
    wobjs = [o for o in objs if cls[o.name][0] == 'wheelsrc']
    rot_deg = spec.get('rot', 'auto'); auto = rot_deg == 'auto'
    if auto:
        bpy.context.view_layer.update(); dg = bpy.context.evaluated_depsgraph_get()
        mn, mx = bbox(body_objs, dg, I); rot_deg = 0 if (mx[1] - mn[1]) >= (mx[0] - mn[0]) else 90
    for attempt in range(2):
        rot = Matrix.Rotation(math.radians(rot_deg), 4, 'Z')
        root.matrix_world = rot
        bpy.context.view_layer.update(); dg = bpy.context.evaluated_depsgraph_get()
        mn, mx = bbox(body_objs, dg, I)
        L = mx[1] - mn[1]; s = spec['len'] / L
        T = Matrix.Translation(Vector((-(mn[0] + mx[0]) / 2 * s, -(mn[1] + mx[1]) / 2 * s, -mn[2] * s)))
        root.matrix_world = T @ Matrix.Scale(s, 4) @ rot
        bpy.context.view_layer.update(); dg = bpy.context.evaluated_depsgraph_get()
        mn, mx = bbox(body_objs, dg, I)
        log('rot %d scale %.4f  size %.2f x %.2f x %.2f' % (rot_deg, s, mx[0] - mn[0], mx[1] - mn[1], mx[2] - mn[2]))
        # wheels: cluster the wheel objects' centres into four corners
        cen = []
        for o in wobjs:
            a, b = bbox([o], dg, I); cen.append(((a + b) / 2, (b[2] - a[2]) / 2, b[2] - a[2], o))
        corners = {}
        if cen:
            cx = np.array([c[0] for c in cen]); mid = (cx.min(0) + cx.max(0)) / 2
            for c in cen:
                q = (c[0][0] > mid[0], c[0][1] > mid[1]); corners.setdefault(q, []).append(c)
        spatial = False
        if len(corners) == 4:
            wheels = {}
            for q, lst in corners.items():
                big = max(lst, key=lambda c: c[2])
                # the hub: the centre of the biggest piece (the tyre); radius from its height
                wheels[q] = dict(c=big[0], r=big[2] / 2, hw=0.2, objs=[c[3] for c in lst])
        else:
            # no named wheels: look for them in the geometry of the body and detail objects
            tris = [eval_tris(o, dg, I, with_normals=False) for o in objs if cls[o.name][0] in ('body', 'det', 'wheelsrc')]
            Pall = np.concatenate([r[0] for r in tris if r is not None])
            found = find_wheels_spatial(Pall, mx[0] - mn[0], mx[2])
            if found:
                # the ring piece found may be just the rim: the cylinder that takes the wheel out of the body is at least a tyre wide
                wheels = {q: dict(c=w['c'], r=w['r'], hw=max(w['hw'], 0.14), objs=[]) for q, w in found.items()}; spatial = True
                for o in objs:
                    if cls[o.name][0] == 'wheelsrc': cls[o.name] = ('det', {})   # a lone named piece joins the detail
            else: wheels = None
        if wheels:
            rad = float(np.mean([w['r'] for w in wheels.values()]))
            # put the tyres on the ground
            low = min(w['c'][2] - w['r'] for w in wheels.values())
            if abs(low) > 0.005:
                root.matrix_world = Matrix.Translation(Vector((0, 0, -low))) @ root.matrix_world
                bpy.context.view_layer.update(); dg = bpy.context.evaluated_depsgraph_get()
                for w in wheels.values(): w['c'] = w['c'] - np.array([0, 0, low])
                mn, mx = bbox(body_objs, dg, I)
        else:
            log('WARNING: found %d wheel corners (%d wheel objects) and no wheels in the geometry: no own wheels' % (len(corners), len(wobjs)))
            rad = spec.get('wr', 0.35)
        # the template wheel: +x side, most forward (smallest y)
        tmpl = None
        if wheels:
            tmpl = min([w for q, w in wheels.items() if q[0]], key=lambda w: w['c'][1])
            for q, w in wheels.items(): log('wheel %s: hub (%.2f, %.2f, %.2f) r %.3f half-width %.3f' % ('FR' if q == (True, False) else 'RR' if q == (True, True) else 'FL' if q == (False, False) else 'RL', *w['c'], w['r'], w['hw']))
            wheel_meta = [gv(w['c']) for w in wheels.values()]
            # z forward in the game = -y here; y up = z here: gv does that
            for i, w in enumerate(wheels.values()): wheel_meta[i][1] = round(float(w['r']), 4)
        # the cabin box (for spatial interior tests): between the axles, above the sills
        W = mx[0] - mn[0]; H = mx[2]
        if wheels:
            ys = sorted(set(round(float(w['c'][1]), 2) for w in wheels.values())); yf, yr = min(ys), max(ys)
        else: yf, yr = mn[1] + spec['len'] * 0.2, mx[1] - spec['len'] * 0.2
        cab = dict(x0=-W / 2 + 0.07, x1=W / 2 - 0.07, y0=yf + 0.45, y1=yr + 0.65, z0=rad * 0.9 + 0.08, z1=H - 0.03,
                   ya=yf + 0.25, yb=yr - 0.15, xw=W * 0.28)   # ya/yb/xw: where a steering wheel can be
        spec.setdefault('cabin', {}); cab.update(spec['cabin'])
        if not (auto and attempt == 0): break
        # which end is the nose? look for the steering wheel anywhere along the car
        swy = None
        named = [o for o in objs if cls[o.name][0] == 'swheel']
        for o in named:
            r = eval_tris(o, dg, I, with_normals=False)
            if r is None: continue
            e = np.sort(r[0].reshape(-1, 3).max(0) - r[0].reshape(-1, 3).min(0))
            if e[2] < 0.25 or e[1] < 0.12: continue   # a logo
            swy = float(r[0][:, :, 1].mean()); log('auto rot: named steering part %s at y %.2f' % (o.name, swy)); break
        for o in ([] if swy is not None else objs):
            if cls[o.name][0] not in ('interior', 'det', 'body'): continue
            r = eval_tris(o, dg, I, with_normals=False)
            if r is None: continue
            box = find_steering_wheel(r[0], cab, None, wide=True) or find_steering_wheel_hough(r[0], cab, None, wide=True, debug=True)
            if box: swy = float((box[0][1] + box[1][1]) / 2); break
        if swy is None: log('auto rot: no steering wheel to tell the nose by, keeping rot', rot_deg); break
        if swy > 0: rot_deg += 180; log('auto rot: the steering wheel is at y %.2f, turning the car round' % swy)
        else: log('auto rot: the steering wheel is at y %.2f, nose at -y' % swy); break
    # a detail object that lies on the painted shell (a duplicate skin: decals, dirt layers, "finish" copies) would
    # z-fight with the paint: leave it out
    dg0 = bpy.context.evaluated_depsgraph_get()
    paint_objs = [o for o in objs if cls[o.name][0] == 'body' and cls[o.name][1].get('kind') == 'paint']
    if paint_objs and spec.get('drop_skins', True):
        cen = []
        for o in paint_objs:
            r = eval_tris(o, dg0, I, with_normals=False)
            if r is not None: cen.append(r[0].mean(axis=1))
        if cen:
            cen = np.concatenate(cen); cell = 0.03
            keys = set(map(tuple, np.round(cen / cell).astype(np.int64)))
            for o in objs:
                if cls[o.name][0] not in ('det', 'interior', 'body') or cls[o.name][1].get('kind') in ('lamp', 'decal', 'paint'): continue
                r = eval_tris(o, dg0, I, with_normals=False)
                if r is None or len(r[0]) < 30: continue
                q = np.round(r[0].mean(axis=1) / cell).astype(np.int64)
                hit = np.array([tuple(k) in keys for k in q])
                if hit.mean() > 0.6:
                    cls[o.name] = (None, {}); log('duplicate skin over the paint left out: %s (%.0f%% of %d tris)' % (o.name, 100 * hit.mean(), len(hit)))
    # objects named in paint_if_outside (regex on object|material) whose triangles are mostly outside the cabin box are
    # body panels in another material (doors, bumpers): they are painted too
    if spec.get('paint_if_outside'):
        for o in objs:
            m = o.data.materials[0] if o.data.materials else None
            if cls[o.name][0] not in ('det', 'body', 'interior') or cls[o.name][1].get('kind') == 'paint': continue
            if not re.search(spec['paint_if_outside'], o.name + '|' + (m.name if m else ''), re.I): continue
            r = eval_tris(o, dg, I, with_normals=False)
            if r is None: continue
            c = r[0].mean(axis=1)
            outside = (np.abs(c[:, 0]) > cab['x1'] - 0.03) | (c[:, 1] < cab['y0']) | (c[:, 1] > cab['y1']) | (c[:, 2] < cab['z0']) | (c[:, 2] > cab['z1'] - 0.02)
            if outside.mean() > 0.6:
                cls[o.name] = ('body', {'kind': 'paint', 'tint': spec.get('tint', True)}); log('painted (outside the cabin): %s' % o.name[:50])
    # the painted shell, to drop any other triangle lying on it (duplicate skins z-fight with the paint in the game)
    shell = None
    if spec.get('drop_skins', True):
        pp, pn = [], []
        for o in objs:
            if cls[o.name][0] == 'body' and cls[o.name][1].get('kind') == 'paint':
                r = eval_tris(o, dg, I)
                if r is not None: pp.append(r[0]); pn.append(r[1])
        if pp: shell = PaintShell(np.concatenate(pp), np.concatenate(pn))
    # triangle budgets: decimate the source objects of a part class that is over its budget
    tri_of = {o.name: len(o.data.polygons) * (1 if all(len(p.vertices) == 3 for p in o.data.polygons[:50]) else 2) for o in objs}
    totals = {}
    for o in objs:
        part = cls[o.name][0]
        if part: totals[part] = totals.get(part, 0) + tri_of[o.name]
    ratio = {p: min(1.0, BUDGET.get(p, 1e9) * (4 if p == 'wheelsrc' else 1) / max(1, t)) for p, t in totals.items()}
    # the steering wheel, when it isn't its own object: look for it in the full-detail interior/det geometry first
    sw_box = None
    if spec.get('swheel'):
        sp = np.array(spec['swheel']['pos'], dtype=np.float64); sr = spec['swheel'].get('r', 0.2)
        sw_box = (sp - np.array([sr + 0.04, 0.12, sr + 0.04]), sp + np.array([sr + 0.04, 0.12, sr + 0.04]))
        log('steering wheel placed by hand at', spec['swheel']['pos'])
    elif not any(cls[o.name][0] == 'swheel' for o in objs) and spec.get('find_swheel', True):
        for o in objs:
            if cls[o.name][0] not in ('interior', 'det', 'body'): continue
            r = eval_tris(o, dg, I, with_normals=False)
            if r is None: continue
            sw_box = find_steering_wheel(r[0], cab, spec.get('side'), debug=True) or find_steering_wheel_hough(r[0], cab, spec.get('side'), debug=True)
            if sw_box: log('steering wheel found in', o.name); break
    src_of = {}
    for o in objs:
        part = cls[o.name][0]
        if part and ratio[part] < 0.98 and tri_of[o.name] > 200:
            c = decimated(o, ratio[part]); src_of[c.name] = o.name
        else: src_of[o.name] = o.name
    bpy.context.view_layer.update(); dg = bpy.context.evaluated_depsgraph_get()
    use = [bpy.data.objects[n] for n in src_of]
    log('budgets: ' + ' '.join('%s %d->x%.2f' % (p, t, ratio[p]) for p, t in totals.items() if ratio[p] < 0.98))
    # collect the parts
    parts = {k: Part(k) for k in ('body', 'det', 'glass', 'lamp', 'wheel', 'interior', 'swheel')}
    inv = I
    sw_objs = []
    for o in use:
        part, opts = cls[src_of[o.name]]
        if part is None or part == 'wheelsrc': continue
        r = eval_tris(o, dg, inv)
        if r is None: continue
        P, N, mats, uv = r
        n_in = len(P); dest = {}
        if part == 'swheel': sw_objs.append((o, P)); parts['swheel'].add(P, N, mats, uv, opts); continue
        if shell is not None and part in ('body', 'det', 'interior') and opts.get('kind') not in ('paint', 'lamp', 'decal'):
            on = shell.on(P, N)
            cc = P.mean(axis=1)   # only outside the cabin: trims inside the car may legitimately touch body-coloured parts
            on &= ~((cc[:, 0] > cab['x0']) & (cc[:, 0] < cab['x1']) & (cc[:, 1] > cab['y0']) & (cc[:, 1] < cab['y1']) & (cc[:, 2] > cab['z0']) & (cc[:, 2] < cab['z1']))
            if on.any():
                keep = np.flatnonzero(~on)
                if len(keep) == 0: continue
                if on.sum() > 20: log('%d triangles of %s lay on the paint: left out' % (int(on.sum()), o.name[:50]))
                dest['on paint'] = int(on.sum())
                P, N, mats, uv = P[keep], N[keep], [mats[i] for i in keep], (uv[keep] if uv is not None else None)
        if part in ('body', 'det') and spatial and wheels:
            # wheels found in the geometry: their triangles leave the body; the template corner becomes the wheel part
            wl = list(wheels.values()); wi = in_wheel(P.mean(axis=1), wl)
            ti = next(i for i, w in enumerate(wl) if w is tmpl)
            sel = np.flatnonzero(wi == ti)
            if len(sel): parts['wheel'].add(P[sel] - np.array(tmpl['c']), N[sel], [mats[i] for i in sel], uv[sel] if uv is not None else None, {'kind': 'plain'} if opts.get('kind') == 'paint' else {})
            keep = np.flatnonzero(wi < 0); dest['in wheels'] = len(P) - len(keep)
            if len(P) - len(keep) > 300:
                cw = P[wi >= 0].reshape(-1, 3); log('  %s: %d tris in the wheel cylinders span x %.2f..%.2f y %.2f..%.2f z %.2f..%.2f (wheels %s)' % (o.name[:30], len(P) - len(keep), *cw.min(0)[[0]], *cw.max(0)[[0]], *cw.min(0)[[1]], *cw.max(0)[[1]], *cw.min(0)[[2]], *cw.max(0)[[2]], sorted(set(int(i) for i in wi[wi >= 0]))))
            if len(keep) == 0: continue
            P, N, mats, uv = P[keep], N[keep], [mats[i] for i in keep], (uv[keep] if uv is not None else None)
        if part in ('body', 'det') and opts.get('kind') != 'paint' and spec.get('split_interior', True):
            # triangles wholly inside the cabin box go to the interior (seats, dash, door cards modelled in the same mesh);
            # painted panels never do: a mid-engined deck or a door jamb inside the box is still the car's colour
            c = P.mean(axis=1)
            ins = (c[:, 0] > cab['x0']) & (c[:, 0] < cab['x1']) & (c[:, 1] > cab['y0']) & (c[:, 1] < cab['y1']) & (c[:, 2] > cab['z0']) & (c[:, 2] < cab['z1'])
            # ...but not the shell itself: faces whose normal points outwards through the box sides stay
            if ins.any():
                nrm = N.mean(axis=1); outward = (np.abs(nrm[:, 0]) > 0.85) & (np.abs(c[:, 0]) > cab['x1'] - 0.12)
                roofy = (nrm[:, 2] > 0.85) & (c[:, 2] > cab['z1'] - 0.1)
                ins &= ~(outward | roofy)
            if ins.any():
                sel = np.flatnonzero(ins); msel = [mats[i] for i in sel]
                parts['interior'].add(P[sel], N[sel], msel, uv[sel] if uv is not None else None, {})
                keep = np.flatnonzero(~ins); dest['interior'] = len(sel)
                if len(keep) == 0: continue
                P, N, mats, uv = P[keep], N[keep], [mats[i] for i in keep], (uv[keep] if uv is not None else None)
        if part == 'lamp': opts = dict(opts, kind='lamp'); part = 'det'
        if part == 'det' and opts.get('kind') == 'lamp':
            parts['lamp'].add(P, N, mats, uv, {'kind': 'emit'})
            continue
        parts[part].add(P, N, mats, uv, opts); dest[part] = len(P)
        if n_in >= 400 and len(dest) > 1: log('split %s (%d tris): %s' % (o.name[:40], n_in, ', '.join('%s %d' % kv for kv in dest.items())))
    # the wheel part: the template wheel's objects, moved onto their hub
    if tmpl:
        wo = [o for o in use if src_of[o.name] in [x.name for x in tmpl['objs']]]
        for o in wo:
            r = eval_tris(o, dg, Matrix.Translation(Vector(tmpl['c'])).inverted())
            if r: parts['wheel'].add(r[0], r[1], r[2], r[3], {})
    # meta
    meta = dict(len=round(float(mx[1] - mn[1]), 3), wid=round(float(W), 3), ht=round(float(H), 3), wr=round(float(rad), 4))
    if wheels: meta['wheels'] = wheel_meta
    side = spec.get('side')
    # steering wheel: a named object, else the ring-shaped piece of the interior ahead of the driver's seat
    def cut_swheel_box(box):
        lo_, hi_ = box[0] - 0.01, box[1] + 0.01; cut = 0
        for pname in ('interior', 'det'):
            for ci, (P, N, mats, uv, o) in enumerate(parts[pname].chunks):
                c = P.mean(axis=1); m = np.all((c > lo_) & (c < hi_), axis=1)
                if not m.any(): continue
                sel = np.flatnonzero(m); keep = np.flatnonzero(~m); cut += len(sel)
                parts['swheel'].add(P[sel], N[sel], [mats[i] for i in sel], uv[sel] if uv is not None else None, {})
                sw_objs.append((None, P[sel]))
                parts[pname].chunks[ci] = (P[keep], N[keep], [mats[i] for i in keep], uv[keep] if uv is not None else None, o)
        log('steering wheel cut out by its box (%d tris)' % cut)
    if not sw_objs and sw_box is not None: cut_swheel_box(sw_box)
    if sw_objs:
        SP = np.concatenate([p.reshape(-1, 3) for _, p in sw_objs])
        c = (SP.min(0) + SP.max(0)) / 2; ext = SP.max(0) - SP.min(0)
        e = np.sort(ext)
        if spec.get('swheel'):   # placed by hand: the named parts go back to the interior, the hand box decides
            for P, N, mats, uv, o in parts['swheel'].chunks: parts['interior'].add(P, N, mats, uv, o)
            parts['swheel'] = Part('swheel'); sw_objs = []
            cut_swheel_box(sw_box); log('named steering parts set aside: the wheel is where the spec says')
        elif e[2] < 0.25 or e[1] < 0.12:   # a logo, a strip or a button named "steering": not the wheel
            for P, N, mats, uv, o in parts['swheel'].chunks: parts['interior'].add(P, N, mats, uv, o)
            parts['swheel'] = Part('swheel'); sw_objs = []
            log('named steering part is tiny (%.2f m): looking for the wheel the usual way' % e[2])
            for o in objs:
                if cls[o.name][0] not in ('interior', 'det', 'body', 'swheel'): continue
                r = eval_tris(o, dg, I, with_normals=False)
                if r is None: continue
                sw_box = find_steering_wheel(r[0], cab, spec.get('side'), debug=True) or find_steering_wheel_hough(r[0], cab, spec.get('side'), debug=True)
                if sw_box: log('steering wheel found in', o.name); break
            if sw_box is not None: cut_swheel_box(sw_box)
        elif e[1] > 0.55 or abs(c[0]) < 0.18:
            # a named "steering" object that is more than the wheel (the column, the dash, both sides): find the ring in it
            PP = np.concatenate([p for _, p in sw_objs])
            box = find_steering_wheel_hough(PP, dict(cab, ya=-1e9, yb=1e9, xw=9), spec.get('side'), debug=True, wide=True)
            if box is not None:
                lo_, hi_ = box; keep_sw = Part('swheel'); rest = []
                for P, N, mats, uv, o in parts['swheel'].chunks:
                    cc = P.mean(axis=1); m = np.all((cc > lo_) & (cc < hi_), axis=1)
                    sel = np.flatnonzero(m); kp = np.flatnonzero(~m)
                    if len(sel): keep_sw.add(P[sel], N[sel], [mats[i] for i in sel], uv[sel] if uv is not None else None, o)
                    if len(kp): parts['interior'].add(P[kp], N[kp], [mats[i] for i in kp], uv[kp] if uv is not None else None, o)
                parts['swheel'] = keep_sw; sw_objs = [(None, ch[0]) for ch in keep_sw.chunks]
                SP = np.concatenate([p.reshape(-1, 3) for _, p in sw_objs]); c = (SP.min(0) + SP.max(0)) / 2; ext = SP.max(0) - SP.min(0)
                log('named steering part was too big (%.2f m): kept the ring inside it' % e[1])
            else:
                for P, N, mats, uv, o in parts['swheel'].chunks: parts['interior'].add(P, N, mats, uv, o)
                parts['swheel'] = Part('swheel'); sw_objs = []
                log('named steering part was too big (%.2f m) and holds no ring: it stays in the interior' % e[1])
                # look for the wheel the usual way, in the full-detail interior
                for o in objs:
                    if cls[o.name][0] not in ('interior', 'det', 'body', 'swheel'): continue
                    r = eval_tris(o, dg, I, with_normals=False)
                    if r is None: continue
                    sw_box = find_steering_wheel(r[0], cab, spec.get('side'), debug=True) or find_steering_wheel_hough(r[0], cab, spec.get('side'), debug=True)
                    if sw_box: log('steering wheel found in', o.name); break
                if sw_box is not None: cut_swheel_box(sw_box)
    if sw_objs:
        SP = np.concatenate([p.reshape(-1, 3) for _, p in sw_objs])
        c = (SP.min(0) + SP.max(0)) / 2; ext = SP.max(0) - SP.min(0)
        # the rim's plane: PCA of the points; the axis is the least-variance direction, pointing back to the driver (+y)
        q = SP - SP.mean(0); cov = q.T @ q / len(q); val, vec = np.linalg.eigh(cov); axis = vec[:, 0]
        if axis[1] < 0: axis = -axis
        # the rim radius from the two middle extents (a named steering wheel can bring its column along)
        e = np.sort(ext); rr = float((e[1] + min(e[2], e[1] * 1.1)) / 4)
        if e[2] > e[1] * 1.3:   # the column: the hub is where the rim's plane is, not the box centre
            c = np.array([c[0], float(np.median(SP[:, 1])), c[2]])
        meta['swheel'] = dict(pos=gv(c), axis=gv(axis), r=round(rr, 3))
        if side is None: side = 'L' if c[0] > 0 else 'R'
        # re-centre the steering wheel on its hub
        sw = Part('swheel')
        for P, N, mats, uv, o in parts['swheel'].chunks: sw.add(P - c, N, mats, uv, o)
        parts['swheel'] = sw
        log('steering wheel at', [round(float(x), 2) for x in c], 'r', round(rr, 3), 'axis', [round(float(x), 2) for x in axis], 'side', side)
    else:
        log('no steering wheel found'); side = side or 'L'
    meta['side'] = side
    sx = 1 if side == 'L' else -1
    if 'swheel' in meta:
        p = np.array([meta['swheel']['pos'][0], -meta['swheel']['pos'][2], meta['swheel']['pos'][1]])   # back to blender
        eye = np.array([p[0], p[1] + 0.6, min(H - 0.2, p[2] + 0.33)])
        a = np.array([meta['swheel']['axis'][0], -meta['swheel']['axis'][2], meta['swheel']['axis'][1]])
        cl = p - a * 0.22 + np.array([0, 0, 0.06])
        meta['cluster'] = dict(pos=gv(cl), nrm=gv(a), w=0.3, h=0.12)
    else:
        eye = np.array([sx * W * 0.2, (cab['y0'] + cab['y1']) / 2 - 0.1, H - 0.3])
    meta['eye'] = gv(eye)
    meta['cabin'] = {k: round(float(v), 3) for k, v in cab.items()}
    meta['mirror'] = dict(pos=gv(np.array([0, cab['y0'] + 0.05, H - 0.12])), nrm=gv(np.array([0, 1, -0.1])), w=0.26, h=0.07)
    if spec.get('eye'): meta['eye'] = gv(np.array(spec['eye'], dtype=np.float64)); log('eye placed by hand at', spec['eye'])
    if spec.get('interior_only_cockpit'): meta['inOnly'] = 1   # the interior shows through the body from outside: draw it only from the driver's seat
    if spec.get('meta'): meta.update(spec['meta'])
    # LODs: body + det + glass decimated further (the interior is left out: it's behind the glass)
    lod_parts = []
    for lname, budget in (('mid', spec.get('mid', 16000)), ('lo', spec.get('lo', 4000))):
        lp = Part(lname); made = []
        tot = sum(tri_of[o.name] for o in objs if cls[o.name][0] in ('body', 'det', 'glass'))
        rr = min(1.0, budget / max(1, tot))
        for o in objs:
            part, opts = cls[o.name]
            if part not in ('body', 'det', 'glass') or len(o.data.polygons) < 20: continue
            if tri_of[o.name] * rr < 12: continue   # tiny bits vanish in the distance
            made.append((decimated(o, rr), part, opts))
        bpy.context.view_layer.update(); dg2 = bpy.context.evaluated_depsgraph_get()
        for c, part, opts in made:
            r = eval_tris(c, dg2, inv)
            if r:
                P, N, mats, uv = r
                # the far versions leave out the wheels (drawn separately) and the interior (behind the glass)
                cc = P.mean(axis=1); drop = np.zeros(len(P), bool)
                if spatial and wheels: drop |= in_wheel(cc, list(wheels.values())) >= 0
                if part in ('body', 'det') and opts.get('kind') != 'paint':
                    drop |= (cc[:, 0] > cab['x0']) & (cc[:, 0] < cab['x1']) & (cc[:, 1] > cab['y0']) & (cc[:, 1] < cab['y1']) & (cc[:, 2] > cab['z0']) & (cc[:, 2] < cab['z1'] - 0.12) & (np.abs(cc[:, 0]) < cab['x1'] - 0.12)
                keep = np.flatnonzero(~drop)
                if len(keep):
                    oo = dict(opts)
                    if part == 'glass': oo['kind'] = 'glass'
                    lp.add(P[keep], N[keep], [mats[i] for i in keep], uv[keep] if uv is not None else None, oo)
            bpy.data.objects.remove(c)
        lod_parts.append(lp)
    hdr = write_fcm([parts[k] for k in ('body', 'det', 'glass', 'lamp', 'wheel', 'interior', 'swheel')] + lod_parts, out_path, prefix, meta)
    log('done in %.1fs' % (time.time() - t0))
    return hdr, meta, LOG[:]
