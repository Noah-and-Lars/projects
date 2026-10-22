# Free Criminal: Sketchfab models -> the game's .fcm files, with textures.
# Run inside Blender (5.x). Builds on the same file format as fc_details.write_fcm, plus what the game's 2.2 loader reads:
#   - a part may name one texture ("tex": "<file>" in models/tex/); textured triangles get WHITE vertex colours
#     (the shader multiplies map x vertex colour), flat ones their material colour, paint the magenta marker
#   - a top-level "meta" object (cars: wheels [[x,y,z]x4] + wr; guns: guns[key] = {len, hold})
# A part whose triangles use several images gets them packed into one atlas (plus a white tile for its flat triangles).
# Game frame: x right, y up, z forward. Blender (x, y, z) -> game (x, z, -y), so the game's +z (nose, muzzle) is Blender's -y.
import bpy, bmesh, math, json, struct, os
import numpy as np
from mathutils import Vector, Matrix

PAINT = (1.0, 0.0, 1.0)
ROLE_BY_MAT = {'fc_skin': 'skin', 'fc_sleeve': 'sleeve', 'fc_dark': 'dark'}   # roles by material name (meshes with several materials)
TEX_MAX = 1024

def to_game(co): return np.c_[co[:, 0], co[:, 2], -co[:, 1]]

def smooth_normals(P, deg=32.0):
    """P: (n,3,3) triangle corners. Per-corner normals averaged over faces that share the position and are within deg degrees."""
    n = P.shape[0]
    fn = np.cross(P[:, 1] - P[:, 0], P[:, 2] - P[:, 0]); l = np.linalg.norm(fn, axis=1); l[l == 0] = 1; fn /= l[:, None]
    key = np.round(P.reshape(-1, 3) * 2000).astype(np.int64)
    k1 = key[:, 0] * 73856093 ^ key[:, 1] * 19349663 ^ key[:, 2] * 83492791
    order = np.argsort(k1, kind='stable'); ks = k1[order]
    cs = math.cos(math.radians(deg)); out = np.empty((n * 3, 3))
    fnc = np.repeat(fn, 3, axis=0)
    starts = np.r_[0, np.flatnonzero(np.diff(ks)) + 1, len(ks)]
    for s, e in zip(starts[:-1], starts[1:]):
        idx = order[s:e]
        if e - s > 64: out[idx] = fnc[idx]; continue    # a huge pile of corners on one spot: keep them flat
        N = fnc[idx]; m = ((N @ N.T) >= cs).astype(np.float64)
        out[idx] = m @ N
    l = np.linalg.norm(out, axis=1); l[l == 0] = 1
    return out / l[:, None]

# ---------------------------------------------------------------- materials
def mat_info(m):
    """(image or None, rgb, role) for a material. role from the custom prop 'fc' if set ('paint', 'glass', 'lamp', ...)."""
    img = None; rgb = (0.8, 0.8, 0.8)
    if m is None: return None, rgb, None
    if m.use_nodes:
        bsdf = next((n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED'), None)
        if bsdf:
            inp = bsdf.inputs['Base Color']; rgb = tuple(inp.default_value[:3])
            es = bsdf.inputs.get('Emission Strength'); ec = bsdf.inputs.get('Emission Color')
            if es and ec and es.default_value > 0 and not ec.is_linked and min(ec.default_value[:3]) < 0.9: rgb = tuple(ec.default_value[:3])   # a lamp coloured by its glow
            if inp.is_linked:   # follow the link back to an image (through mix / multiply nodes)
                stack = [inp.links[0].from_node]; seen = set()
                while stack:
                    n = stack.pop()
                    if n in seen: continue
                    seen.add(n)
                    if n.type == 'TEX_IMAGE' and n.image: img = n.image; break
                    for i in n.inputs:
                        for l in i.links: stack.append(l.from_node)
    else: rgb = tuple(m.diffuse_color[:3])
    return img, rgb, m.get('fc')

def lin2srgb(c):
    c = np.clip(np.asarray(c, dtype=np.float64), 0, 1)
    return np.where(c <= 0.0031308, c * 12.92, 1.055 * np.power(c, 1 / 2.4) - 0.055)

# ---------------------------------------------------------------- triangles
def eval_tris(ob, depsgraph, root_inv):
    """Triangles of the evaluated object in the root's frame: corners (n,3,3), material per triangle, uv (n,3,2) or None."""
    ev = ob.evaluated_get(depsgraph); me = ev.to_mesh()
    if me is None or len(me.polygons) == 0:
        ev.to_mesh_clear(); return None
    me.calc_loop_triangles()
    mw = root_inv @ ob.matrix_world
    nv = len(me.vertices); co = np.empty(nv * 3); me.vertices.foreach_get('co', co); co = co.reshape(nv, 3)
    co = (np.c_[co, np.ones(nv)] @ np.array(mw).T)[:, :3]
    nt = len(me.loop_triangles); tri = np.empty(nt * 3, dtype=np.int64); me.loop_triangles.foreach_get('vertices', tri); tri = tri.reshape(nt, 3)
    tmi = np.empty(nt, dtype=np.int64); me.loop_triangles.foreach_get('material_index', tmi)
    mats = list(me.materials) or [None]
    tm = [mats[min(i, len(mats) - 1)] for i in tmi]
    uv = None
    if me.uv_layers.active:
        nl = len(me.loops); uvd = np.empty(nl * 2); me.uv_layers.active.data.foreach_get('uv', uvd); uvd = uvd.reshape(nl, 2)
        lp = np.empty(nt * 3, dtype=np.int64); me.loop_triangles.foreach_get('loops', lp); uv = uvd[lp.reshape(nt, 3)]
    P = co[tri]
    if mw.determinant() < 0: P = P[:, ::-1]; uv = uv[:, ::-1] if uv is not None else None   # mirrored object: keep faces outward
    ev.to_mesh_clear()
    return P, tm, uv

# ---------------------------------------------------------------- textures
TEX_FILTERS = {}   # image name -> f(px) applied to the pixels of the written texture (sampling for classification sees the original)

def img_pixels(img, size, raw=False):
    """The image as (h, w, 4) float sRGB-ish values, scaled to fit size x size."""
    w, h = img.size   # read the pixels as they are in Blender (an edited image keeps its edits), then shrink with numpy
    if w == 0 or h == 0: return None
    px = np.empty(w * h * 4, dtype=np.float32); img.pixels.foreach_get(px); px = px.reshape(h, w, 4)
    if not raw and img.name in TEX_FILTERS: px = TEX_FILTERS[img.name](px)
    while max(px.shape[0], px.shape[1]) >= 2 * size and px.shape[0] % 2 == 0 and px.shape[1] % 2 == 0:   # halve by averaging
        px = px.reshape(px.shape[0] // 2, 2, px.shape[1] // 2, 2, 4).mean(axis=(1, 3))
    s = min(1.0, size / max(px.shape[0], px.shape[1]))
    if s < 1.0:   # what's left: nearest pixel
        nh, nw = max(1, round(px.shape[0] * s)), max(1, round(px.shape[1] * s))
        px = px[(np.arange(nh) * px.shape[0] // nh)][:, (np.arange(nw) * px.shape[1] // nw)]
    return np.ascontiguousarray(px)

def save_jpg(px, path, quality=88):
    h, w = px.shape[:2]
    im = bpy.data.images.new('fc_tex_out', w, h, alpha=False)
    im.pixels.foreach_set(np.ascontiguousarray(px, dtype=np.float32).ravel())
    im.filepath_raw = path; im.file_format = 'JPEG'
    im.save(filepath=path, quality=quality)
    bpy.data.images.remove(im)

def build_texture(images, has_flat, path):
    """Pack images (+ a white tile when some triangles are flat) into one texture <= TEX_MAX. Returns {image: (u0, v0, du, dv)}, white uv."""
    tiles = list(images) + (['white'] if has_flat else [])
    n = len(tiles); cols = math.ceil(math.sqrt(n)); rows = math.ceil(n / cols)
    cell = TEX_MAX // cols if n > 1 else TEX_MAX
    if n == 1:
        px = img_pixels(images[0], TEX_MAX); save_jpg(px, path)
        return {images[0]: (0.0, 0.0, 1.0, 1.0)}, None
    W, H = cols * cell, rows * cell
    out = np.ones((H, W, 4), dtype=np.float32); rects = {}; white = None
    for i, t in enumerate(tiles):
        cx, cy = i % cols, i // cols; x0, y0 = cx * cell, cy * cell   # rows from the bottom (blender's pixel order)
        if t == 'white': white = ((x0 + cell / 2) / W, (y0 + cell / 2) / H); continue
        px = img_pixels(t, cell); ph, pw = px.shape[:2]
        if (pw, ph) != (cell, cell):   # stretch to the cell (nearest), uvs map to the whole cell
            yi = (np.arange(cell) * ph // cell); xi = (np.arange(cell) * pw // cell); px = px[yi][:, xi]
        out[y0:y0 + cell, x0:x0 + cell] = px
        pad = 1.5 / cell   # keep a hair inside the cell so filtering doesn't bleed
        rects[t] = (x0 / W + pad * cell / W, y0 / H + pad * cell / H, (cell - 3) / W, (cell - 3) / H)
    save_jpg(out, path)
    return rects, white

# ---------------------------------------------------------------- writing
_SAMPLES = {}
def paint_mask(img, uv, rgb, tol, share=1.0):
    """True for triangles whose corners, edge midpoints and centre all sample within tol of rgb on img (sRGB 0-1)."""
    if img.name not in _SAMPLES: _SAMPLES[img.name] = img_pixels(img, 1024, raw=True)
    px = _SAMPLES[img.name]; h, w = px.shape[:2]
    pts = np.concatenate([uv, (uv + np.roll(uv, 1, axis=1)) / 2, uv.mean(axis=1, keepdims=True)], axis=1)   # (n, 7, 2)
    pts = pts - np.floor(pts)
    c = px[np.clip((pts[..., 1] * h).astype(int), 0, h - 1), np.clip((pts[..., 0] * w).astype(int), 0, w - 1), :3]
    return (np.abs(c - np.array(rgb)).max(axis=2) < tol).mean(axis=1) >= share   # share = the fraction of the 7 samples that must match

def sample(img, uv):
    """Colour of img (sRGB 0-1) at each triangle's uv centre: low-poly 'palette' textures become flat vertex colours."""
    if img.name not in _SAMPLES: _SAMPLES[img.name] = img_pixels(img, 1024, raw=True)
    px = _SAMPLES[img.name]; h, w = px.shape[:2]
    c = uv.mean(axis=1); c = c - np.floor(c)
    return px[np.clip((c[:, 1] * h).astype(int), 0, h - 1), np.clip((c[:, 0] * w).astype(int), 0, w - 1), :3]

def write_fcm(parts, path, tex_dir, prefix, meta=None, keep_uv=('decalR', 'decalL')):
    """parts: {name: list of (P (n,3,3) blender coords in root frame, mats list, uv (n,3,2) or None, opts dict)}.
    opts: role ('paint', 'white', 'dark'), flat (sample the texture into vertex colours), paint (sRGB colour that marks paint
    on a flattened texture), tol (how close to it)."""
    hdr = {'parts': {}}; blobs = []; off = 0; done = {}
    for pname, chunks in parts.items():
        P_all, C_all, U_all, T_img = [], [], [], []
        for P, mats, uv, o in chunks:
            flat = {}
            if o.get('flat') and uv is not None:
                for m in set(mats):
                    img = mat_info(m)[0]
                    if img is not None:
                        sel = np.array([mm == m for mm in mats]); flat[m] = (sel, sample(img, uv[sel]))
            fc = {}
            for m, (sel, cols) in flat.items():
                for j, i in enumerate(np.flatnonzero(sel)): fc[i] = cols[j]
            tp = set()
            if o.get('texpaint') is not None and uv is not None:
                for m in set(mats):
                    img = mat_info(m)[0]
                    if img is not None:
                        sel = np.array([mm == m for mm in mats]); pm = paint_mask(img, uv[sel], o['texpaint'], o.get('tol', 0.12), o.get('texshare', 1.0))
                        tp.update(int(i) for i in np.flatnonzero(sel)[pm])
            for i in range(len(P)):
                img, rgb, r = mat_info(mats[i]); r = o.get('role') or r or ROLE_BY_MAT.get(mats[i].name if mats[i] else '')
                if i in tp: c = PAINT; img = None
                elif i in fc:
                    c = tuple(fc[i]); img = None
                    if o.get('paint') is not None and np.abs(np.array(c) - o['paint']).max() < o.get('tol', 0.08): c = PAINT
                elif r == 'paint': c = PAINT; img = None
                elif r == 'white': c = (1, 1, 1); img = None
                elif r == 'dark': c = (0.03, 0.04, 0.05); img = None
                elif r == 'skin': c = PAINT; img = None            # hands: the game swaps magenta for the player's skin colour
                elif r == 'sleeve': c = (0.0, 1.0, 1.0); img = None   # and cyan for the sleeve
                else: c = (1.0, 1.0, 1.0) if (img is not None and uv is not None) else tuple(lin2srgb(rgb))
                if uv is None: img = None
                P_all.append(P[i]); C_all.append(c); U_all.append(uv[i] if uv is not None else np.zeros((3, 2))); T_img.append(img)
        if not P_all: continue
        P = to_game(np.array(P_all).reshape(-1, 3)).reshape(-1, 3, 3)
        cols = np.repeat(np.array(C_all, dtype=np.float64), 3, axis=0)
        U = np.array(U_all, dtype=np.float64)
        imgs = [i for i in dict.fromkeys(T_img) if i is not None]
        tex = None
        if imgs:
            has_flat = any(i is None for i in T_img)
            tkey = (tuple(i.name for i in imgs), has_flat)
            if tkey in done: tex, rects, white = done[tkey]
            else:
                tex = prefix + '-' + pname + '.jpg'
                rects, white = build_texture(imgs, has_flat, os.path.join(tex_dir, tex)); done[tkey] = (tex, rects, white)
            for t in range(len(T_img)):
                im = T_img[t]
                if im is None: U[t] = white if white else (0.5, 0.5)
                elif rects[im] != (0.0, 0.0, 1.0, 1.0):
                    u0, v0, du, dv = rects[im]; uv = U[t]
                    uv = uv - np.floor(uv.min(axis=0))         # a tiled triangle goes back into the 0-1 square
                    uv = np.clip(uv, 0, 1)
                    U[t] = np.c_[u0 + uv[:, 0] * du, v0 + uv[:, 1] * dv]
        N = smooth_normals(P)
        pos = P.reshape(-1, 3).astype(np.float32); uvs = U.reshape(-1, 2)
        has_uv = bool(tex) or pname in keep_uv
        key = np.c_[np.round(pos * 5000), np.round(N * 100), np.round(cols * 255), np.round(uvs * 8000) if has_uv else np.zeros((len(pos), 2))]
        _, first, inv = np.unique(key, axis=0, return_index=True, return_inverse=True); inv = inv.reshape(-1)
        vpos = pos[first]; vn = N[first]; vc = cols[first]; vu = uvs[first]
        blob = bytearray()
        o_pos = len(blob); blob += vpos.astype('<f4').tobytes()
        o_nor = len(blob); blob += np.clip(np.round(vn * 127), -127, 127).astype(np.int8).tobytes()
        while len(blob) % 4: blob += b'\0'
        o_col = len(blob); blob += np.clip(np.round(vc * 255), 0, 255).astype(np.uint8).tobytes()
        while len(blob) % 4: blob += b'\0'
        o_uv = len(blob)
        if has_uv: blob += vu.astype('<f4').tobytes()
        o_idx = len(blob); big = len(vpos) > 65000
        blob += (inv.astype('<u4') if big else inv.astype('<u2')).tobytes()
        while len(blob) % 4: blob += b'\0'
        m = dict(v=int(len(vpos)), i=int(len(inv)), po=o_pos + off, no=o_nor + off, co=o_col + off, io=o_idx + off, i32=big)
        if has_uv: m['uo'] = o_uv + off
        if tex: m['tex'] = tex
        hdr['parts'][pname] = m; blobs.append(bytes(blob)); off += len(blob)
    if meta: hdr['meta'] = meta
    hj = json.dumps(hdr).encode(); pad = (4 - (8 + len(hj)) % 4) % 4
    with open(path, 'wb') as f:
        f.write(b'FCM1'); f.write(struct.pack('<I', len(hj) + pad)); f.write(hj + b' ' * pad)
        for b in blobs: f.write(b)
    return {p: (m['v'], m['i'] // 3, m.get('tex')) for p, m in hdr['parts'].items()}

def collect(root, part_of):
    """Triangles of every visible mesh under root, bucketed by part_of(object) (None = skip)."""
    dg = bpy.context.evaluated_depsgraph_get(); inv = root.matrix_world.inverted(); parts = {}
    def walk(o):
        yield o
        for c in o.children: yield from walk(c)
    for ob in walk(root):
        if ob.type != 'MESH' or ob.hide_render: continue
        p = part_of(ob)
        if p is None: continue
        r = eval_tris(ob, dg, inv)
        if r is None: continue
        parts.setdefault(p, []).append((r[0], r[1], r[2], {k: (list(ob[k]) if k in ('paint', 'texpaint') else ob[k]) for k in ('role', 'flat', 'paint', 'tol', 'texpaint', 'texshare') if k in ob}))
    return parts

# ---------------------------------------------------------------- cars
# A car spec: src = mesh objects (names), wheels = the four wheels as lists of mesh names (any order), rot = degrees about z
# that turn the nose to -y, roles = [(material-name prefix, part, opts)] (part None = leave out), flat/paint for palette
# textures. The car is copied (the Sketchfab import stays untouched), turned, scaled to the game's length, its roof moved to
# the game's height (ht) and its tyres put on the ground (y = 0).
def _copy(o, col, parent):
    me = o.data.copy(); me.transform(o.matrix_world)
    c = bpy.data.objects.new('fc.' + o.name, me); col.objects.link(c); c.parent = parent
    return c

def _bbox(obs):
    co = np.concatenate([np.array([v.co for v in o.data.vertices]) for o in obs if len(o.data.vertices)])
    return co.min(axis=0), co.max(axis=0)

def _xf(obs, M):
    for o in obs: o.data.transform(M); o.data.update()

def fit_car(key, spec, ct, at):
    """Builds the fitted car under an empty 'FC_<key>' (in collection fc_<key>) placed at world x = at. Returns (root, meta)."""
    name = 'fc_' + key
    old = bpy.data.collections.get(name)
    if old:
        for o in list(old.all_objects): bpy.data.objects.remove(o)
        bpy.data.collections.remove(old)
    col = bpy.data.collections.new(name); bpy.context.scene.collection.children.link(col)
    root = bpy.data.objects.new('FC_' + key, None); col.objects.link(root)
    obs = []; wheel_sets = []
    for n in spec['src']:
        o = bpy.data.objects[n]
        mname = o.data.materials[0].name if o.data.materials else ''
        def hit(pre): return (pre[1:] in (mname + '|' + o.name).lower()) if pre.startswith('*') else (mname.startswith(pre) or o.name.startswith(pre))
        role = spec['classify'](o.name, mname) if spec.get('classify') else next(((p, op) for pre, p, op in spec['roles'] if hit(pre)), ('body', {}))
        if role[0] is None: continue
        c = _copy(o, col, root); c['fc_part'] = role[0]
        for k, v in role[1].items(): c[k] = v
        obs.append(c)
    if spec.get('split_wheels'):   # one mesh holds all four wheels: split it into pieces and group them by corner
        groups = {}; cen = np.array(sum(_bbox(obs), np.zeros(3))) / 2   # corners relative to the body's centre
        for n in spec['split_wheels']:
            c = _copy(bpy.data.objects[n], col, root)
            bm = bmesh.new(); bm.from_mesh(c.data); bm.verts.ensure_lookup_table()
            for f in bm.faces:
                m = f.calc_center_median()
                groups.setdefault((m.x > cen[0], m.y > cen[1]), []).append(f.index)
            bm.free()
            for q, idx in groups.items():
                part = bpy.data.objects.new(c.name + '.%d%d' % q, c.data.copy()); col.objects.link(part); part.parent = root
                bm = bmesh.new(); bm.from_mesh(part.data); bm.faces.ensure_lookup_table(); keep = set(idx)
                bmesh.ops.delete(bm, geom=[f for f in bm.faces if f.index not in keep], context='FACES'); bm.to_mesh(part.data); bm.free()
                part['fc_part'] = 'wheelsrc'; wheel_sets.append([part])
                for k, v in spec.get('wheel_opts', {}).items(): part[k] = v
            bpy.data.objects.remove(c); groups = {}
    for ws in spec['wheels']:
        wo = []
        for n in ws:
            c = _copy(bpy.data.objects[n], col, root); c['fc_part'] = 'wheelsrc'
            for k, v in spec.get('wheel_opts', {}).items(): c[k] = v
            wo.append(c)
        wheel_sets.append(wo)
    allw = [o for ws in wheel_sets for o in ws]
    everything = obs + allw
    _xf(everything, Matrix.Rotation(math.radians(spec.get('rot', 0)), 4, 'Z'))
    mn, mx = _bbox([o for o in obs if o['fc_part'] in ('body',)] + allw)
    s = ct['l'] / (mx[1] - mn[1])
    _xf(everything, Matrix.Scale(s, 4) @ Matrix.Translation(Vector((-(mn[0] + mx[0]) / 2, -(mn[1] + mx[1]) / 2, -mn[2]))))
    # the roof to the game's height: stretch the body (not the wheels) up or down about the ground
    mn, mx = _bbox([o for o in obs if o['fc_part'] in ('body', 'glass')])
    kz = spec.get('kz') or ct['ht'] / mx[2]
    _xf(obs, Matrix.Diagonal((1, 1, kz, 1)))
    # wheels: centres from each set's box, the +x side front wheel becomes the model's one wheel part
    centres = []
    for ws in wheel_sets:
        a, b = _bbox(ws); centres.append(((a + b) / 2, (b[2] - a[2]) / 2, ws))
    rad = min(c[1] for c in centres)
    tmpl = sorted([c for c in centres if c[0][0] > 0], key=lambda c: c[0][1])[0]  # +x side, most forward (-y)
    for c in centres:
        for o in c[2]:
            if c is tmpl: o['fc_part'] = 'wheel'; o.data.transform(Matrix.Translation(-c[0]))
            else: o['fc_part'] = 'wheelsrc'   # the other three stay as they are (not exported)
    # meta: game frame (x, y, z) = blender (x, z, -y); wheels sit on the ground, so y = rad
    meta = {'wheels': [[round(float(c[0][0]), 4), round(float(rad), 4), round(float(-c[0][1]), 4)] for c in centres], 'wr': round(float(rad), 4)}
    tw = next(o for o in tmpl[2]); root['fc_meta'] = json.dumps(meta)
    for o in tmpl[2]: o.location = tmpl[0]           # shown in place in blender; exported from its own origin (see export_car)
    root.location = (at, 0, 0)
    return root, meta, dict(s=round(s, 4), kz=round(kz, 4), width=round(float(_bbox([o for o in obs if o['fc_part'] == 'body'])[1][0] * 2), 3))

def add_lods(root, mid=0.35, lo=0.1):
    """mid = the body simplified; lo = body + glass (dark) simplified more. Decimate modifiers on copies, applied at export."""
    col = root.users_collection[0]
    for o in [o for o in root.children if o.get('fc_part') in ('mid', 'lo')]: bpy.data.objects.remove(o)
    src = [o for o in root.children if o.get('fc_part') in ('body', 'glass') and not o.hide_render]
    for part, ratio in (('mid', mid), ('lo', lo)):
        for o in src:
            if part == 'mid' and o['fc_part'] != 'body': continue
            c = bpy.data.objects.new(o.name + '.' + part, o.data); col.objects.link(c); c.parent = root
            c.matrix_world = o.matrix_world.copy()
            for k in ('flat', 'paint', 'tol', 'role'):
                if k in o: c[k] = o[k]
            if o['fc_part'] == 'glass': c['role'] = 'dark'
            c['fc_part'] = part; c.hide_render = True
            if len(o.data.polygons) > 40:
                d = c.modifiers.new('lod', 'DECIMATE'); d.ratio = ratio; d.use_collapse_triangulate = True

def add_decals(root, ct, nz=120, ny=14):
    """The livery panels down each side, laid out like the game's liveryMat expects: u along the car (0 at the front on the
    right side, at the back on the left), v from the sill band up to under the windows. Each grid point is shot onto the
    painted body from outside; squares that miss (wheel arches, windows) are left out."""
    from mathutils.bvhtree import BVHTree
    col = root.users_collection[0]
    for o in [o for o in root.children if o.get('fc_part') in ('decalR', 'decalL')]: bpy.data.objects.remove(o)
    paint = [o for o in root.children if o.get('fc_part') == 'body' and o.get('role') == 'paint' and not o.hide_render]
    bm = bmesh.new()
    for o in paint:
        t = o.data.copy(); t.transform(root.matrix_world.inverted() @ o.matrix_world); bm.from_mesh(t); bpy.data.meshes.remove(t)
    tree = BVHTree.FromBMesh(bm); co = np.array([v.co for v in bm.verts]); bm.free()
    glass = [o for o in root.children if o.get('fc_part') == 'glass']
    gco = np.concatenate([np.array([root.matrix_world.inverted() @ o.matrix_world @ v.co for v in o.data.vertices]) for o in glass])
    mid = np.abs(co[:, 1]) < 0.4; gm = np.abs(gco[:, 1]) < 0.4
    yB = co[mid, 2].min() + 0.1; yT = (gco[gm, 2].min() if gm.any() else co[mid, 2].max() - 0.3) - 0.07
    L = ct['l']; H = L / 2; zA = H - 0.3; zB = -H + 0.26
    meta = json.loads(root['fc_meta']); wr = meta['wr']; wz_list = sorted({w[2] for w in meta['wheels']})
    for sd in (1, -1):
        dm = bmesh.new(); uvl = dm.loops.layers.uv.new('uv'); grid = []
        for i in range(nz + 1):
            row = []
            for j in range(ny + 1):
                z = zB + (zA - zB) * i / nz; y = yB + (yT - yB) * j / ny
                hit = tree.ray_cast(Vector((sd * (ct['w'] / 2 + 1), -z, y)), Vector((-sd, 0, 0)), ct['w'])
                ok = hit[0] is not None and hit[0].x * sd > ct['w'] * 0.3 and hit[1].x * sd > 0.35
                if not ok:   # a small hole in the paint (a side marker): take the nearest paint instead
                    near = tree.find_nearest(Vector((sd * ct['w'] / 2, -z, y)), 0.12)
                    if near[0] is not None and near[1].x * sd > 0.35: hit, ok = near, True
                arch = min(math.hypot(z - wz, y - wr) for wz in wz_list) - (wr + 0.07)
                if arch < 0: ok = False
                p = (hit[0] + hit[1].normalized() * 0.006) if ok else Vector((sd * ct['w'] / 2, -z, y))
                row.append((dm.verts.new(p), ok, (z, y)))
            grid.append(row)
        for i in range(nz):
            for j in range(ny):
                q = (grid[i][j], grid[i + 1][j], grid[i + 1][j + 1], grid[i][j + 1])
                if not all(c[1] for c in q): continue
                vs = tuple(c[0] for c in q); f = dm.faces.new(tuple(reversed(vs)) if sd > 0 else vs)
                for lp, c in zip(f.loops, (reversed(q) if sd > 0 else q)):
                    z, y = c[2]; lp[uvl].uv = ((zA - z) / (zA - zB) if sd > 0 else (z - zB) / (zA - zB), (y - yB) / (yT - yB))
        for v in [v for v in dm.verts if not v.link_faces]: dm.verts.remove(v)
        me = bpy.data.meshes.new('decal'); dm.to_mesh(me); dm.free()
        o = bpy.data.objects.new('decal' + ('R' if sd > 0 else 'L'), me); col.objects.link(o); o.parent = root
        o['fc_part'] = 'decalR' if sd > 0 else 'decalL'; o['role'] = 'white'
    return dict(yB=round(yB, 3), yT=round(yT, 3))

def export_car(root, path, tex_dir, decals=False, prefix=None):
    dg = bpy.context.evaluated_depsgraph_get(); inv = root.matrix_world.inverted(); parts = {}
    for ob in root.children:
        p = ob.get('fc_part')
        if ob.type != 'MESH' or p in (None, 'wheelsrc') or ob.hide_render and p not in ('mid', 'lo'): continue
        if p.startswith('decal') and not decals: continue
        frame = ob.matrix_world.inverted() if p == 'wheel' else inv   # the wheel in its own frame (centred on its axle)
        r = eval_tris(ob, dg, frame)
        if r is None: continue
        o = {k: (list(ob[k]) if k in ('paint', 'texpaint') else ob[k]) for k in ('role', 'flat', 'paint', 'tol', 'texpaint', 'texshare') if k in ob}
        if p == 'glass': o['role'] = 'dark'
        parts.setdefault(p, []).append((r[0], r[1], r[2], o))
    meta = json.loads(root['fc_meta'])
    name = prefix or os.path.splitext(os.path.basename(path))[0]
    return write_fcm(parts, path, tex_dir, name, meta)

# ---------------------------------------------------------------- guns
# Gun frame (game): x right, y up, z forward; muzzle at +z, the pistol grip just behind z = 0 where HOLD's g puts the hand.
# In Blender that is: muzzle towards -y, up +z. fit_gun turns the model (rot about z, degrees), scales it (scale) and moves
# it so that the model point 'grip' (game y, z, measured after turning) lands on the HOLD grip spot (gy, gz).
def fit_gun(key, src, rot, scale=1.0, grip=None, at=None, drop=(), cut=(), budget=6000):
    name = 'fg_' + key
    old = bpy.data.collections.get(name)
    if old:
        for o in list(old.all_objects): bpy.data.objects.remove(o)
        bpy.data.collections.remove(old)
    col = bpy.data.collections.new(name); bpy.context.scene.collection.children.link(col)
    root = bpy.data.objects.new('FG_' + key, None); col.objects.link(root)
    obs = [_copy(bpy.data.objects[n], col, root) for n in src if not any(n.startswith(d) for d in drop)]
    for axis, deg in (rot if isinstance(rot, (list, tuple)) else [('Z', rot)]): _xf(obs, Matrix.Rotation(math.radians(deg), 4, axis))   # rot: degrees about Z, or [(axis, deg), ...] in order
    mn, mx = _bbox(obs); c = (mn + mx) / 2
    _xf(obs, Matrix.Scale(scale, 4) @ Matrix.Translation(Vector((-c[0], -c[1], -c[2]))))
    for z0, z1, y0, y1 in cut:   # boxes (game z, y in the centred model) whose faces are removed (stray parts)
        for o in obs:
            bm = bmesh.new(); bm.from_mesh(o.data)
            dead = [f for f in bm.faces if z0 < -f.calc_center_median().y < z1 and y0 < f.calc_center_median().z < y1]
            if dead: bmesh.ops.delete(bm, geom=dead, context='FACES'); bm.to_mesh(o.data)
            bm.free()
    if grip is not None:   # grip = (model y, model z) in game coords after centring, at = (HOLD y, HOLD z)
        _xf(obs, Matrix.Translation(Vector((0, -(at[1] - grip[1]), at[0] - grip[0]))))
    for o in obs: o['fc_part'] = key
    tris = sum(sum(len(p.vertices) - 2 for p in o.data.polygons) for o in obs)
    if budget and tris > budget:   # too many triangles for a hand-held gun: simplify every piece by the same ratio
        for o in obs:
            if len(o.data.polygons) > 60:
                d = o.modifiers.new('slim', 'DECIMATE'); d.ratio = budget / tris; d.use_collapse_triangulate = True
    if at: root.location = (0, 0, 0)
    mn, mx = _bbox(obs)
    # game-frame facts: muzzle z (len), bore height there, top of the gun
    co = np.concatenate([np.array([v.co for v in o.data.vertices]) for o in obs])
    tip = co[co[:, 1] < mn[1] + 0.012]
    return root, dict(len=round(float(-mn[1]), 4), bore=round(float(np.median(tip[:, 2])), 4), top=round(float(mx[2]), 4),
                      bottom=round(float(mn[2]), 4), back=round(float(-mx[1]), 4), width=round(float(mx[0] - mn[0]), 4))

def grid_obj(col, z0=-0.4, z1=1.4, y0=-0.4, y1=0.4, step=0.01):
    """A cm grid in the game's side plane (x = -0.1, behind the gun): every 5 cm darker, the axes red (z = 0) / green (y = 0)."""
    me = bpy.data.meshes.new('grid'); bm = bmesh.new(); w = 0.0006
    def bar(a, b, wide, mi):
        v = [bm.verts.new(p) for p in ((-0.1, -a[0], a[1] - wide), (-0.1, -b[0], b[1] - wide), (-0.1, -b[0], b[1] + wide), (-0.1, -a[0], a[1] + wide))] if a[1] == b[1] else \
            [bm.verts.new(p) for p in ((-0.1, -a[0] - wide, a[1]), (-0.1, -a[0] + wide, a[1]), (-0.1, -b[0] + wide, b[1]), (-0.1, -b[0] - wide, b[1]))]
        f = bm.faces.new(v); f.material_index = mi
    n = int(round((z1 - z0) / step))
    for i in range(n + 1):
        z = z0 + i * step; k = int(round(z / step))
        bar((z, y0), (z, y1), w * (3 if k % 5 == 0 else 1), 2 if k == 0 else (1 if k % 5 == 0 else 0))
    n = int(round((y1 - y0) / step))
    for i in range(n + 1):
        y = y0 + i * step; k = int(round(y / step))
        bar((z0, y), (z1, y), w * (3 if k % 5 == 0 else 1), 3 if k == 0 else (1 if k % 5 == 0 else 0))
    bm.to_mesh(me); bm.free()
    for nm, c in (('g_l', (0.75, 0.78, 0.82)), ('g_d', (0.35, 0.38, 0.42)), ('g_z', (0.9, 0.1, 0.1)), ('g_y', (0.1, 0.7, 0.1))):
        m = bpy.data.materials.get(nm) or bpy.data.materials.new(nm); m.diffuse_color = (*c, 1); m.use_nodes = True
        m.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (*c, 1); me.materials.append(m)
    o = bpy.data.objects.new('grid', me); col.objects.link(o); o['fc_part'] = 'grid'
    return o

def _flat_mat(name, rgb, emit=0.0):
    m = bpy.data.materials.get(name)
    if m is None:
        m = bpy.data.materials.new(name); m.use_nodes = True; b = m.node_tree.nodes['Principled BSDF']
        b.inputs['Base Color'].default_value = (*rgb, 1)
        if emit: b.inputs['Emission Color'].default_value = (*rgb, 1); b.inputs['Emission Strength'].default_value = emit
    return m

def red_dot(root, key, z, y, length=0.05):
    """A small open red-dot sight standing on a rail at height y (game), centred at game z: a base, a round hood and the dot.
    Its centre (the dot) is y + 0.036, which is the gun's sight height."""
    col = root.users_collection[0]; bm = bmesh.new(); r_out, r_in, cy = 0.021, 0.0165, y + 0.036
    ring = []
    for i in range(24):   # an annulus in the x-y plane, extruded along the gun
        a = 2 * math.pi * i / 24; ring.append((math.cos(a), math.sin(a)))
    def V(x, yy, zz): return bm.verts.new((x, -zz, yy))
    for k0, k1 in ((r_out, r_in),):
        f0 = [V(c * k0, cy + s_ * k0, z - length / 2) for c, s_ in ring]; f1 = [V(c * k0, cy + s_ * k0, z + length / 2) for c, s_ in ring]
        i0 = [V(c * k1, cy + s_ * k1, z - length / 2) for c, s_ in ring]; i1 = [V(c * k1, cy + s_ * k1, z + length / 2) for c, s_ in ring]
        for i in range(24):
            j = (i + 1) % 24
            bm.faces.new((f0[i], f0[j], f1[j], f1[i])); bm.faces.new((i0[j], i0[i], i1[i], i1[j]))
            bm.faces.new((f0[j], f0[i], i0[i], i0[j])); bm.faces.new((f1[i], f1[j], i1[j], i1[i]))
    bmesh.ops.create_cube(bm, size=1.0, matrix=Matrix.Translation((0, -z, y + 0.008)) @ Matrix.Diagonal((0.03, length * 1.1, 0.016, 1)))
    bmesh.ops.create_cube(bm, size=1.0, matrix=Matrix.Translation((0, -z, y + 0.016)) @ Matrix.Diagonal((0.012, length * 0.6, 0.012, 1)))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    me = bpy.data.meshes.new('reddot'); bm.to_mesh(me); bm.free(); me.materials.append(_flat_mat('fc_sight', (0.035, 0.037, 0.04)))
    o = bpy.data.objects.new('reddot_' + key, me); col.objects.link(o); o.parent = root; o['fc_part'] = key
    bm = bmesh.new(); bmesh.ops.create_uvsphere(bm, u_segments=8, v_segments=6, radius=0.0022, matrix=Matrix.Translation((0, -(z + length / 2 - 0.004), cy)))
    me = bpy.data.meshes.new('dot'); bm.to_mesh(me); bm.free(); me.materials.append(_flat_mat('fc_dot', (1.0, 0.05, 0.03), 5.0))
    d = bpy.data.objects.new('dot_' + key, me); col.objects.link(d); d.parent = root; d['fc_part'] = key
    return cy

def export_guns(roots, path, tex_dir, meta):
    """Every gun into one file, one part per gun key, each in its own root's frame (the root sits at the world origin)."""
    dg = bpy.context.evaluated_depsgraph_get(); parts = {}
    for key, root in roots.items():
        inv = root.matrix_world.inverted()
        for ob in root.children:
            if ob.type != 'MESH' or ob.get('fc_part') not in (key, 'hands_' + key): continue
            pk = ob['fc_part']
            r = eval_tris(ob, dg, inv)
            if r is not None: parts.setdefault(pk, []).append((r[0], r[1], r[2], {}))
    return write_fcm(parts, path, tex_dir, 'gun', {'guns': meta})

def _mesh_obj(name, bm, col, parent, part, role='dark'):
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free(); me.materials.append(_flat_mat('fc_dark', (0.03, 0.035, 0.04)))
    o = bpy.data.objects.new(name, me); col.objects.link(o); o.parent = parent; o['fc_part'] = part; o['role'] = role
    return o

def _tube(bm, a, b, r=0.022, seg=10):
    """A cylinder between two game points (x, y, z) in blender coords."""
    a = Vector((a[0], -a[2], a[1])); b = Vector((b[0], -b[2], b[1])); d = b - a
    m = Matrix.Translation((a + b) / 2) @ d.to_track_quat('Z', 'Y').to_matrix().to_4x4() @ Matrix.Diagonal((r, r, d.length / 2, 1))
    bmesh.ops.create_cone(bm, cap_ends=True, segments=seg, radius1=1, radius2=1, depth=2, matrix=m)

def add_police_gear(root, ct, z_bar, roof_y, lights_bottom):
    """A slim dark light bar across the roof (its top just under the game's red/blue lamps) and a push bar at the nose."""
    from mathutils.bvhtree import BVHTree
    col = root.users_collection[0]
    for o in [o for o in root.children if o.name.startswith(('lightbar', 'pushbar'))]: bpy.data.objects.remove(o)
    body = [o for o in root.children if o.get('fc_part') == 'body' and not o.hide_render]
    bm = bmesh.new()
    for o in body:
        t = o.data.copy(); t.transform(root.matrix_world.inverted() @ o.matrix_world); bm.from_mesh(t); bpy.data.meshes.remove(t)
    tree = BVHTree.FromBMesh(bm); bm.free()
    def roof_at(x, z):
        h = tree.ray_cast(Vector((x, -z, roof_y + 1)), Vector((0, 0, -1)), 3)
        return h[0].z if h[0] is not None else roof_y
    top = lights_bottom - 0.004; h = 0.052; w = 1.12; d = 0.24
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1, matrix=Matrix.Translation((0, -z_bar, top - h / 2)) @ Matrix.Diagonal((w, d, h, 1)))
    for x in (-0.42, 0.42):   # feet down to the roof
        ry = roof_at(x, z_bar); bmesh.ops.create_cube(bm, size=1, matrix=Matrix.Translation((x, -z_bar, (ry + top - h) / 2)) @ Matrix.Diagonal((0.06, 0.12, max(0.01, top - h - ry + 0.006), 1)))
    _mesh_obj('lightbar', bm, col, root, 'det')
    # push bar: two uprights, two cross tubes, struts back into the bumper
    zn = ct['l'] / 2; bm = bmesh.new()
    for x in (-0.38, 0.38):
        _tube(bm, (x, 0.30, zn + 0.09), (x, 0.82, zn + 0.09), 0.02)
        _tube(bm, (x, 0.42, zn + 0.09), (x, 0.40, zn - 0.14), 0.016)
        _tube(bm, (x, 0.80, zn + 0.09), (x, 0.74, zn - 0.16), 0.016)
    _tube(bm, (-0.40, 0.56, zn + 0.09), (0.40, 0.56, zn + 0.09), 0.018)
    _tube(bm, (-0.40, 0.76, zn + 0.09), (0.40, 0.76, zn + 0.09), 0.018)
    _tube(bm, (-0.40, 0.36, zn + 0.09), (0.40, 0.36, zn + 0.09), 0.018)
    _mesh_obj('pushbar', bm, col, root, 'det')

def scope_tube(root, key, z, y, length=0.2, r=0.017):
    """A plain scope on a rail: a tube (bell at the front) on two mounts; its centre line is y + 0.04 (the sight height)."""
    col = root.users_collection[0]; cy = y + 0.04; bm = bmesh.new()
    def cyl(zc, l, rad): bmesh.ops.create_cone(bm, cap_ends=True, segments=16, radius1=rad, radius2=rad, depth=l, matrix=Matrix.Translation((0, -zc, cy)) @ Matrix.Rotation(math.pi / 2, 4, 'X'))
    cyl(z, length, r); cyl(z + length / 2 + 0.025, 0.05, r * 1.35); cyl(z - length / 2 - 0.02, 0.04, r * 1.2)
    for zz in (z - length * 0.3, z + length * 0.3):
        bmesh.ops.create_cube(bm, size=1, matrix=Matrix.Translation((0, -zz, (y + cy) / 2)) @ Matrix.Diagonal((0.026, 0.024, cy - y, 1)))
    bmesh.ops.create_cone(bm, cap_ends=True, segments=12, radius1=0.006, radius2=0.006, depth=0.03, matrix=Matrix.Translation((0, -z, cy + r + 0.012)))   # turret
    _mesh_obj('scope_' + key, bm, col, root, key)
    return cy

def dz_classify(oname, mname):
    """Parts of DanielZhabotinsky's cars: paint = the <code>_Bodymat material; the transparent lights-and-glass material is
    window glass (lamp covers are left out, the game lights the lamps themselves); the opaque one is the lamps; the rest
    (UCB_BOTTOM trims and underside, interiors, badges, plates, calipers) is textured detail."""
    n = (oname + '|' + mname).lower(); m = mname.lower()
    if 'bodymat' in m: return ('body', {'role': 'paint'})
    if 'transpe' in m: return (None, {}) if ('light' in n and 'glass' in oname.lower()) or 'taillights' in n else ('glass', {})
    if 'lights_and_glass' in m: return ('lamp', {'flat': 1})
    return ('det', {})

def dz_spec(colname, rot, extra_roles=()):
    """A spec for one of DanielZhabotinsky's cars: parts are named <code>_<part>_<material>, with the same part names in every model."""
    col = bpy.data.collections[colname]; ms = [o.name for o in col.all_objects if o.type == 'MESH']
    low = lambda n: n.lower()
    wheels = [[n] for n in ms if 'wheel' in low(n) and 'steering' not in low(n)]
    src = [n for n in ms if n not in sum(wheels, [])]
    roles = list(extra_roles) + [
        ('*glass', 'glass', {}), ('*windshield', 'glass', {}), ('*rear_glass', 'glass', {}), ('*window', 'glass', {}),
        ('*headlights_glass', None, {}), ('*taillights_glass', None, {}),
        ('*blinker', 'lamp', {'flat': 1}), ('*brakelight', 'lamp', {'flat': 1}), ('*headlight', 'lamp', {'flat': 1}), ('*taillight', 'lamp', {'flat': 1}), ('*reverse', 'lamp', {'flat': 1}),
        ('*interior', 'det', {}), ('*steering', 'det', {}), ('*badge', 'det', {}), ('*_np_', 'det', {}), ('*numberplate', 'det', {}), ('*mirror', 'det', {}),
        ('*bodymat', 'body', {'role': 'paint'}), ('*hood', 'body', {'role': 'paint'}), ('*trunk', 'body', {'role': 'paint'}), ('*door', 'body', {'role': 'paint'}), ('*body', 'body', {'role': 'paint'})]
    return dict(src=src, wheels=wheels, rot=rot, roles=roles, classify=dz_classify, kz=1.0)
