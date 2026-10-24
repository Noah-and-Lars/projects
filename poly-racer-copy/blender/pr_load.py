# Load an exported .fcm car into Blender with materials like the game's (shared by pr_check and pr_cover).
import bpy, os, json, struct
import numpy as np

def read_fcm(path):
    b = open(path, 'rb').read(); assert b[:4] == b'FCM1'
    hl = struct.unpack('<I', b[4:8])[0]; hdr = json.loads(b[8:8 + hl]); base = 8 + hl; out = {}
    for k, p in hdr['parts'].items():
        n = p['v']
        pos = np.frombuffer(b, '<f4', n * 3, base + p['po']).reshape(n, 3)
        nor = np.frombuffer(b, 'i1', n * 3, base + p['no']).reshape(n, 3) / 127
        col = np.frombuffer(b, 'u1', n * 3, base + p['co']).reshape(n, 3) / 255
        uv = np.frombuffer(b, '<f4', n * 2, base + p['uo']).reshape(n, 2) if 'uo' in p else None
        idx = np.frombuffer(b, '<u4' if p['i32'] else '<u2', p['i'], base + p['io'])
        out[k] = dict(pos=pos, nor=nor, col=col, uv=uv, idx=idx, groups=p.get('groups') or [dict(s=0, n=p['i'], k='plain', tex=p.get('tex'))])
    return out, hdr.get('meta', {})

def srgb2lin(c):
    c = np.asarray(c, dtype=np.float64); return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)

_mats = {}
def group_mat(g, tex_dir, paint, lamps=0.0):
    """paint: (r, g, b) sRGB 0-1; lamps: emission strength for lamp groups (night)."""
    key = json.dumps(g, sort_keys=True) + str(paint) + str(lamps)
    if key in _mats: return _mats[key]
    m = bpy.data.materials.new('g'); m.use_nodes = True; nt = m.node_tree; b = nt.nodes['Principled BSDF']
    k = g['k']; col = g.get('col') or [0.8, 0.8, 0.8]
    def img(name, data=False):
        ti = nt.nodes.new('ShaderNodeTexImage'); ti.image = bpy.data.images.load(os.path.join(tex_dir, name), check_existing=True)
        if data: ti.image.colorspace_settings.name = 'Non-Color'
        return ti
    if k == 'paint':
        c = paint
        b.inputs['Base Color'].default_value = (*srgb2lin(c), 1); b.inputs['Metallic'].default_value = 0.35; b.inputs['Roughness'].default_value = 0.32
        b.inputs['Coat Weight'].default_value = 1.0; b.inputs['Coat Roughness'].default_value = 0.04
        if g.get('tex') and g.get('base'):
            ti = img(g['tex']); base = g['base']
            div = nt.nodes.new('ShaderNodeVectorMath'); div.operation = 'DIVIDE'; div.inputs[1].default_value = tuple(max(0.03, x) for x in srgb2lin(base))
            lum = nt.nodes.new('ShaderNodeVectorMath'); lum.operation = 'DOT_PRODUCT'; lum.inputs[1].default_value = (0.3, 0.59, 0.11)
            cl = nt.nodes.new('ShaderNodeClamp'); cl.inputs['Max'].default_value = 1.15
            mul = nt.nodes.new('ShaderNodeVectorMath'); mul.operation = 'SCALE'; mul.inputs[0].default_value = tuple(srgb2lin(c))
            nt.links.new(ti.outputs[0], div.inputs[0]); nt.links.new(div.outputs[0], lum.inputs[0]); nt.links.new(lum.outputs['Value'], cl.inputs[0])
            nt.links.new(cl.outputs[0], mul.inputs['Scale']); nt.links.new(mul.outputs[0], b.inputs['Base Color'])
    elif k == 'glass':
        b.inputs['Base Color'].default_value = (0.55, 0.6, 0.66, 1); b.inputs['Roughness'].default_value = 0.02   # a neutral tint whatever the model says
        b.inputs['Transmission Weight'].default_value = 1.0; b.inputs['IOR'].default_value = 1.45
    elif k in ('chrome', 'mirror'):
        b.inputs['Base Color'].default_value = (0.92, 0.92, 0.94, 1); b.inputs['Metallic'].default_value = 1.0; b.inputs['Roughness'].default_value = 0.06 if k == 'mirror' else 0.12
    else:
        b.inputs['Base Color'].default_value = (*srgb2lin(col), 1); b.inputs['Roughness'].default_value = g.get('r', 0.5); b.inputs['Metallic'].default_value = min(0.9, g.get('m', 0.0))
        if g.get('tex'): ti = img(g['tex']); nt.links.new(ti.outputs[0], b.inputs['Base Color'])
        if k == 'decal' and g.get('tex'): nt.links.new(ti.outputs['Alpha'], b.inputs['Alpha']); m.surface_render_method = 'BLENDED'
        if k == 'emit':
            ec = srgb2lin(g.get('emit') or col)
            b.inputs['Emission Color'].default_value = (*ec, 1); b.inputs['Emission Strength'].default_value = 1.5 + lamps
            if g.get('tex'): nt.links.new(ti.outputs[0], b.inputs['Emission Color'])
    if g.get('rtex') and k != 'paint':
        ti = img(g['rtex'], True); sep = nt.nodes.new('ShaderNodeSeparateColor'); nt.links.new(ti.outputs[0], sep.inputs[0])
        nt.links.new(sep.outputs[1], b.inputs['Roughness']); nt.links.new(sep.outputs[2], b.inputs['Metallic'])
    if g.get('ntex'):
        ti = img(g['ntex'], True); nm = nt.nodes.new('ShaderNodeNormalMap'); nt.links.new(ti.outputs[0], nm.inputs['Color']); nt.links.new(nm.outputs[0], b.inputs['Normal'])
    cull_backfaces(m)
    _mats[key] = m
    return m

def cull_backfaces(m):
    nt = m.node_tree; out = next(n for n in nt.nodes if n.type == 'OUTPUT_MATERIAL'); bsdf = nt.nodes['Principled BSDF']
    geo = nt.nodes.new('ShaderNodeNewGeometry'); tr = nt.nodes.new('ShaderNodeBsdfTransparent'); mix = nt.nodes.new('ShaderNodeMixShader')
    nt.links.new(geo.outputs['Backfacing'], mix.inputs['Fac']); nt.links.new(bsdf.outputs[0], mix.inputs[1]); nt.links.new(tr.outputs[0], mix.inputs[2]); nt.links.new(mix.outputs[0], out.inputs['Surface'])

def make_part(name, d, tex_dir, paint, parent, at=(0, 0, 0), mirror=False, lamps=0.0, col=None):
    P = d['pos'].copy()
    if mirror: P[:, 0] *= -1
    B = np.c_[P[:, 0], -P[:, 2], P[:, 1]]
    idx = d['idx'].reshape(-1, 3); idx = idx[:, ::-1] if mirror else idx
    me = bpy.data.meshes.new(name); me.from_pydata(B.tolist(), [], idx.tolist())
    li = np.empty(len(me.loops), dtype=np.int64); me.loops.foreach_get('vertex_index', li)
    if d['uv'] is not None:
        uvl = me.uv_layers.new(name='uv'); uvl.data.foreach_set('uv', d['uv'][li].ravel().astype(np.float32))
    N = d['nor'].copy()
    if mirror: N[:, 0] *= -1
    NB = np.c_[N[:, 0], -N[:, 2], N[:, 1]]
    me.validate(verbose=False)
    if len(me.loops) == len(li):
        li = np.empty(len(me.loops), dtype=np.int64); me.loops.foreach_get('vertex_index', li)
        l = np.linalg.norm(NB, axis=1); NB[l < 0.5] = (0, 0, 1)
        try: me.normals_split_custom_set(NB[li].tolist())
        except Exception as e: print('normals skipped', e)
    mi = np.zeros(len(me.polygons), dtype=np.int64)
    for gi, g in enumerate(d['groups']):
        me.materials.append(group_mat(g, tex_dir, paint, lamps)); mi[g['s'] // 3:(g['s'] + g['n']) // 3] = gi
    me.polygons.foreach_set('material_index', mi); me.update()
    o = bpy.data.objects.new(name, me); (col or bpy.context.scene.collection).objects.link(o); o.location = at; o.parent = parent
    return o

def load_car(mdir, cid, paint=(0.1, 0.3, 0.7), at=(0, 0, 0), yaw=0.0, lamps=0.0, steer=0.0, col=None):
    """Builds the car under an empty at `at`, turned by yaw (radians, about z). Returns (root, meta, parts dict)."""
    P, meta = read_fcm(os.path.join(mdir, cid + '.fcm')); tex_dir = os.path.join(mdir, 'tex')
    root = bpy.data.objects.new('CAR_' + cid, None); (col or bpy.context.scene.collection).objects.link(root)
    root.location = at; root.rotation_euler = (0, 0, yaw)
    objs = {}
    for k in ('body', 'det', 'glass', 'lamp', 'interior'):
        if k in P: objs[k] = make_part(cid + '.' + k, P[k], tex_dir, paint, root, lamps=lamps, col=col)
    if 'wheel' in P and meta.get('wheels'):
        for i, (x, y, z) in enumerate(meta['wheels']):
            w = make_part('%s.wheel%d' % (cid, i), P['wheel'], tex_dir, paint, root, at=(x, -z, y), mirror=x < 0, col=col)
            if -z < 0: w.rotation_euler = (0, 0, steer)   # the front wheels (nose at -y) steer
            objs['wheel%d' % i] = w
    if 'swheel' in P and meta.get('swheel'):
        p = meta['swheel']['pos']; objs['swheel'] = make_part(cid + '.swheel', P['swheel'], tex_dir, paint, root, at=(p[0], -p[2], p[1]), col=col)
    return root, meta, objs
