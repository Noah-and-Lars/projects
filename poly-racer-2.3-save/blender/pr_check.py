# Read an exported .fcm back the way the game does and render it with Cycles: outside 3/4 front, outside rear, the
# cockpit view from meta.eye looking forward (with the steering wheel in place), and a top-down cutaway of the interior.
#   blender -b --python pr_check.py -- <models-dir> <car-id> <out.png> [paint-hex] [samples]
import bpy, sys, os, json, struct, math
import numpy as np
from mathutils import Vector

argv = sys.argv[sys.argv.index('--') + 1:]
mdir, cid, out = argv[0], argv[1], argv[2]
paint = argv[3] if len(argv) > 3 else '#1d4fa3'; samples = int(argv[4]) if len(argv) > 4 else 12
PAINT = tuple(int(paint[i:i + 2], 16) / 255 for i in (1, 3, 5))

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
def group_mat(g, tex_dir):
    key = json.dumps(g, sort_keys=True)
    if key in _mats: return _mats[key]
    m = bpy.data.materials.new('g'); m.use_nodes = True; nt = m.node_tree; b = nt.nodes['Principled BSDF']
    k = g['k']
    col = g.get('col') or [0.8, 0.8, 0.8]
    if k == 'paint':
        c = PAINT
        b.inputs['Base Color'].default_value = (*srgb2lin(c), 1); b.inputs['Metallic'].default_value = 0.3; b.inputs['Roughness'].default_value = 0.35
        b.inputs['Coat Weight'].default_value = 1.0; b.inputs['Coat Roughness'].default_value = 0.05
        if g.get('tex'):   # tint like the game: the texture's brightness relative to its own paint colour, onto the car's colour
            ti = nt.nodes.new('ShaderNodeTexImage'); ti.image = bpy.data.images.load(os.path.join(tex_dir, g['tex']), check_existing=True)
            base = g.get('base') or [0.5, 0.5, 0.5]
            div = nt.nodes.new('ShaderNodeVectorMath'); div.operation = 'DIVIDE'; div.inputs[1].default_value = tuple(max(0.03, x) for x in srgb2lin(base))
            lum = nt.nodes.new('ShaderNodeVectorMath'); lum.operation = 'DOT_PRODUCT'; lum.inputs[1].default_value = (0.3, 0.59, 0.11)
            clampn = nt.nodes.new('ShaderNodeClamp'); clampn.inputs['Min'].default_value = 0.0; clampn.inputs['Max'].default_value = 1.15
            mul = nt.nodes.new('ShaderNodeVectorMath'); mul.operation = 'SCALE'; mul.inputs[0].default_value = tuple(srgb2lin(c))
            nt.links.new(ti.outputs[0], div.inputs[0]); nt.links.new(div.outputs[0], lum.inputs[0]); nt.links.new(lum.outputs['Value'], clampn.inputs[0])
            nt.links.new(clampn.outputs[0], mul.inputs['Scale']); nt.links.new(mul.outputs[0], b.inputs['Base Color'])
    elif k == 'glass':
        b.inputs['Base Color'].default_value = (*srgb2lin([min(1, c * 1.2) for c in col]), 1); b.inputs['Roughness'].default_value = 0.02
        b.inputs['Alpha'].default_value = max(0.35, g.get('a', 0.5)); m.blend_method = 'BLEND'
    elif k == 'chrome' or k == 'mirror':
        b.inputs['Base Color'].default_value = (0.9, 0.9, 0.92, 1); b.inputs['Metallic'].default_value = 1.0; b.inputs['Roughness'].default_value = 0.08
    else:
        b.inputs['Base Color'].default_value = (*srgb2lin(col), 1); b.inputs['Roughness'].default_value = g.get('r', 0.5); b.inputs['Metallic'].default_value = g.get('m', 0.0)
        if g.get('tex'):
            ti = nt.nodes.new('ShaderNodeTexImage'); ti.image = bpy.data.images.load(os.path.join(tex_dir, g['tex']), check_existing=True)
            nt.links.new(ti.outputs[0], b.inputs['Base Color'])
            if k == 'decal': nt.links.new(ti.outputs['Alpha'], b.inputs['Alpha']); m.surface_render_method = 'BLENDED'
        if g.get('emit'):
            b.inputs['Emission Color'].default_value = (*srgb2lin(g['emit']), 1); b.inputs['Emission Strength'].default_value = 2.0
    if g.get('rtex') and k != 'paint':
        ti = nt.nodes.new('ShaderNodeTexImage'); ti.image = bpy.data.images.load(os.path.join(tex_dir, g['rtex']), check_existing=True); ti.image.colorspace_settings.name = 'Non-Color'
        sep = nt.nodes.new('ShaderNodeSeparateColor'); nt.links.new(ti.outputs[0], sep.inputs[0])
        nt.links.new(sep.outputs[1], b.inputs['Roughness']); nt.links.new(sep.outputs[2], b.inputs['Metallic'])
    if g.get('ntex'):
        ti = nt.nodes.new('ShaderNodeTexImage'); ti.image = bpy.data.images.load(os.path.join(tex_dir, g['ntex']), check_existing=True); ti.image.colorspace_settings.name = 'Non-Color'
        nm = nt.nodes.new('ShaderNodeNormalMap'); nt.links.new(ti.outputs[0], nm.inputs['Color']); nt.links.new(nm.outputs[0], b.inputs['Normal'])
    cull_backfaces(m)
    _mats[key] = m
    return m

def cull_backfaces(m):
    nt = m.node_tree; out = next(n for n in nt.nodes if n.type == 'OUTPUT_MATERIAL'); bsdf = nt.nodes['Principled BSDF']
    geo = nt.nodes.new('ShaderNodeNewGeometry'); tr = nt.nodes.new('ShaderNodeBsdfTransparent'); mix = nt.nodes.new('ShaderNodeMixShader')
    nt.links.new(geo.outputs['Backfacing'], mix.inputs['Fac']); nt.links.new(bsdf.outputs[0], mix.inputs[1]); nt.links.new(tr.outputs[0], mix.inputs[2]); nt.links.new(mix.outputs[0], out.inputs['Surface'])

def make(name, d, tex_dir, at=(0, 0, 0), mirror=False):
    P = d['pos'].copy()
    if mirror: P[:, 0] *= -1
    B = np.c_[P[:, 0], -P[:, 2], P[:, 1]]
    idx = d['idx'].reshape(-1, 3); idx = idx[:, ::-1] if mirror else idx
    me = bpy.data.meshes.new(name); me.from_pydata(B.tolist(), [], idx.tolist())
    if d['uv'] is not None:
        uvl = me.uv_layers.new(name='uv'); li = np.empty(len(me.loops), dtype=np.int64); me.loops.foreach_get('vertex_index', li)
        uvl.data.foreach_set('uv', d['uv'][li].ravel().astype(np.float32))
    # custom normals from the file
    N = d['nor'].copy()
    if mirror: N[:, 0] *= -1
    NB = np.c_[N[:, 0], -N[:, 2], N[:, 1]]; li = np.empty(len(me.loops), dtype=np.int64); me.loops.foreach_get('vertex_index', li)
    me.validate(verbose=False)
    if len(me.loops) == len(li):
        li = np.empty(len(me.loops), dtype=np.int64); me.loops.foreach_get('vertex_index', li)
        l = np.linalg.norm(NB, axis=1); NB[l < 0.5] = (0, 0, 1)
        try: me.normals_split_custom_set(NB[li].tolist())
        except Exception as e: print('normals skipped', e)
    mi = np.zeros(len(me.polygons), dtype=np.int64)
    for gi, g in enumerate(d['groups']):
        me.materials.append(group_mat(g, tex_dir)); mi[g['s'] // 3:(g['s'] + g['n']) // 3] = gi
    me.polygons.foreach_set('material_index', mi)
    me.update()
    o = bpy.data.objects.new(name, me); bpy.context.scene.collection.objects.link(o); o.location = at
    return o

bpy.ops.wm.read_factory_settings(use_empty=True)
P, meta = read_fcm(os.path.join(mdir, cid + '.fcm')); tex_dir = os.path.join(mdir, 'tex')
objs = {}
for k in ('body', 'det', 'glass', 'lamp', 'interior'):
    if k in P: objs[k] = make(k, P[k], tex_dir)
if 'wheel' in P and meta.get('wheels'):
    for i, (x, y, z) in enumerate(meta['wheels']): objs['wheel%d' % i] = make('wheel%d' % i, P['wheel'], tex_dir, at=(x, -z, y), mirror=x < 0)
if 'swheel' in P and meta.get('swheel'):
    p = meta['swheel']['pos']; objs['swheel'] = make('swheel', P['swheel'], tex_dir, at=(p[0], -p[2], p[1]))
sc = bpy.context.scene
bpy.ops.mesh.primitive_plane_add(size=40, location=(0, 0, 0))
gm = bpy.data.materials.new('ground'); gm.use_nodes = True; gm.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (0.22, 0.22, 0.23, 1); gm.node_tree.nodes['Principled BSDF'].inputs['Roughness'].default_value = 0.8
bpy.context.object.data.materials.append(gm)
w = bpy.data.worlds.new('w'); sc.world = w; w.use_nodes = True
bg = w.node_tree.nodes['Background']; bg.inputs[1].default_value = 1.0
sky = w.node_tree.nodes.new('ShaderNodeTexSky'); sky.sky_type = 'MULTIPLE_SCATTERING'; sky.sun_elevation = math.radians(35); sky.sun_rotation = math.radians(200); sky.sun_intensity = 0.5
w.node_tree.links.new(sky.outputs[0], bg.inputs[0])
sc.render.engine = 'CYCLES'; sc.cycles.samples = samples; sc.cycles.use_denoising = True; sc.cycles.device = 'CPU'
sc.render.resolution_x = 640; sc.render.resolution_y = 360; sc.view_settings.view_transform = 'AgX'
cam = bpy.data.cameras.new('c'); co = bpy.data.objects.new('cam', cam); sc.collection.objects.link(co); sc.camera = co
def look(pos, target, fov=60):
    co.location = Vector(pos); d = Vector(target) - Vector(pos); co.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler(); cam.angle = math.radians(fov)
L = meta.get('len', 4.5); H = meta.get('ht', 1.4); Wd = meta.get('wid', 1.9)
# blender frame: nose at -y
views = [((Wd * 1.2, -L * 1.0, H * 1.1), (0, 0, H * 0.4), 45), ((-Wd * 1.2, L * 1.0, H * 1.0), (0, 0, H * 0.4), 45)]
e = meta.get('eye', [0.4, 1.1, 0]); eye = (e[0], -e[2], e[1])
views.append(((eye[0], eye[1], eye[2]), (eye[0], eye[1] - 3, eye[2] - 0.35), 70))
views.append(((eye[0] + 0.0, eye[1] - 0.1, eye[2] + 0.05), (eye[0] - 0.6, eye[1] - 1.0, eye[2] - 0.5), 80))
# cutaway for the top view: hide the roof by clipping the camera (start clip beyond the roof)
tiles = []
for i, (p, t, fov) in enumerate(views):
    look(p, t, fov); sc.render.filepath = out[:-4] + '_%d.png' % i; bpy.ops.render.render(write_still=True); tiles.append(sc.render.filepath)
Wd_, H_ = 640, 360; big = bpy.data.images.new('sheet', Wd_ * 2, H_ * 2); px = np.zeros((H_ * 2, Wd_ * 2, 4), np.float32)
for i, f in enumerate(tiles):
    im = bpy.data.images.load(f); a = np.empty(Wd_ * H_ * 4, np.float32); im.pixels.foreach_get(a); a = a.reshape(H_, Wd_, 4)
    x, y = (i % 2) * Wd_, (1 - i // 2) * H_; px[y:y + H_, x:x + Wd_] = a; os.remove(f)
big.pixels.foreach_set(px.ravel()); big.filepath_raw = out; big.file_format = 'PNG'; big.save()
print('CHECKED', out, json.dumps({k: v for k, v in meta.items() if k != 'cabin'}))
