# Reads exported .fcm files back into Blender the way the game reads them, to check an export by eye:
# vertex colours (paint stays the magenta marker), the part's texture (models/tex/), car wheels placed from meta.wheels
# (the left ones mirrored, like the game's mirrorGeo). Game (x, y, z) -> Blender (x, -z, y).
import bpy, json, struct, os
import numpy as np

def read_fcm(path):
    b = open(path, 'rb').read()
    assert b[:4] == b'FCM1'
    hl = struct.unpack('<I', b[4:8])[0]; hdr = json.loads(b[8:8 + hl]); base = 8 + hl; out = {}
    for k, p in hdr['parts'].items():
        n = p['v']
        pos = np.frombuffer(b, '<f4', n * 3, base + p['po']).reshape(n, 3)
        col = np.frombuffer(b, 'u1', n * 3, base + p['co']).reshape(n, 3) / 255
        uv = np.frombuffer(b, '<f4', n * 2, base + p['uo']).reshape(n, 2) if 'uo' in p else None
        idx = np.frombuffer(b, '<u4' if p['i32'] else '<u2', p['i'], base + p['io']).reshape(-1, 3)
        out[k] = dict(pos=pos, col=col, uv=uv, idx=idx, tex=p.get('tex'))
    return out, hdr.get('meta')

def _mat(tex_path):
    key = 'chk:' + (os.path.basename(tex_path) if tex_path else 'plain')
    m = bpy.data.materials.get(key)
    if m: return m
    m = bpy.data.materials.new(key); m.use_nodes = True; nt = m.node_tree; bsdf = nt.nodes['Principled BSDF']
    vc = nt.nodes.new('ShaderNodeVertexColor'); vc.layer_name = 'col'
    if tex_path:
        ti = nt.nodes.new('ShaderNodeTexImage'); ti.image = bpy.data.images.load(tex_path, check_existing=True)
        mul = nt.nodes.new('ShaderNodeMix'); mul.data_type = 'RGBA'; mul.blend_type = 'MULTIPLY'; mul.inputs[0].default_value = 1
        nt.links.new(ti.outputs[0], mul.inputs[6]); nt.links.new(vc.outputs[0], mul.inputs[7]); nt.links.new(mul.outputs[2], bsdf.inputs['Base Color'])
    else: nt.links.new(vc.outputs[0], bsdf.inputs['Base Color'])
    bsdf.inputs['Roughness'].default_value = 0.5
    return m

def make(name, d, tex_dir, col, mirror=False):
    P = d['pos'].copy()
    if mirror: P[:, 0] *= -1
    B = np.c_[P[:, 0], -P[:, 2], P[:, 1]]
    idx = d['idx'][:, ::-1] if mirror else d['idx']
    me = bpy.data.meshes.new(name); me.from_pydata(B.tolist(), [], idx.tolist())
    ca = me.color_attributes.new('col', 'FLOAT_COLOR', 'POINT')
    # colours in the file are the game's (sRGB-like) values; blender wants linear
    lin = np.where(d['col'] <= 0.04045, d['col'] / 12.92, ((d['col'] + 0.055) / 1.055) ** 2.4)
    ca.data.foreach_set('color', np.c_[lin, np.ones(len(lin))].ravel().astype(np.float32))
    if d['uv'] is not None:
        uvl = me.uv_layers.new(name='uv'); li = np.empty(len(me.loops), dtype=np.int64); me.loops.foreach_get('vertex_index', li)
        uvl.data.foreach_set('uv', d['uv'][li].ravel().astype(np.float32))
    me.materials.append(_mat(os.path.join(tex_dir, d['tex']) if d['tex'] else None))
    o = bpy.data.objects.new(name, me); col.objects.link(o)
    return o

def load_car(path, at, parts=('body', 'det', 'glass', 'lamp', 'wheel', 'decalR', 'decalL'), colname='check'):
    col = bpy.data.collections.get(colname) or bpy.data.collections.new(colname)
    if col.name not in bpy.context.scene.collection.children: bpy.context.scene.collection.children.link(col)
    P, meta = read_fcm(path); tex_dir = os.path.join(os.path.dirname(path), 'tex'); name = os.path.basename(path)
    root = bpy.data.objects.new('CHK_' + name, None); col.objects.link(root); root.location = at
    for k in parts:
        if k not in P: continue
        if k == 'wheel' and meta and 'wheels' in meta:
            for i, (x, y, z) in enumerate(meta['wheels']):
                o = make('%s.wheel%d' % (name, i), P[k], tex_dir, col, mirror=x < 0); o.parent = root; o.location = (x, -z, y)
        else:
            o = make(name + '.' + k, P[k], tex_dir, col); o.parent = root
    return root, meta
