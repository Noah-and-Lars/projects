# Cover shots: a few of the exported cars racing on a kerbed circuit straight under a Poly Haven sky, in Cycles.
#   blender -b --python pr_cover.py -- <models-dir> <out.png> <time: morning|evening|night> [samples] [width] [cars...]
# The cars are listed as id:hex pairs (hex = paint), the first one is the hero nearest the camera.
import bpy, sys, os, math, json
import numpy as np
from mathutils import Vector, Matrix
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE)
import pr_load
S = os.path.dirname(HERE)
argv = sys.argv[sys.argv.index('--') + 1:]
mdir, out, when = argv[0], argv[1], argv[2]
samples = int(argv[3]) if len(argv) > 3 else 96; width = int(argv[4]) if len(argv) > 4 else 1920
cars = argv[5:] or ['sports_b:#c8102e', 'muscle_b:#1d4fa3', 'super_b:#e8e8e8', 'suv_a:#2f6e3a', 'hatch_c:#d9a21b']
HDRI = {'morning': ('belfast_sunset_puresky_2k.hdr', 1.0, 160), 'evening': ('kiara_8_sunset_2k.hdr', 1.0, 35), 'night': ('rogland_clear_night_2k.hdr', 0.35, 0), 'day': ('kloofendal_48d_partly_cloudy_puresky_2k.hdr', 1.0, 120)}
hdr, strength, rotz = HDRI[when]
if os.environ.get('COVER_ROT'): rotz = float(os.environ['COVER_ROT'])
night = when == 'night'
hexrgb = lambda h: tuple(int(h[i:i + 2], 16) / 255 for i in (1, 3, 5))

bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene
# ---- world
w = bpy.data.worlds.new('w'); sc.world = w; w.use_nodes = True; nt = w.node_tree
bg = nt.nodes['Background']; env = nt.nodes.new('ShaderNodeTexEnvironment'); env.image = bpy.data.images.load(os.path.join(S, 'polyhaven', hdr))
mapn = nt.nodes.new('ShaderNodeMapping'); tc = nt.nodes.new('ShaderNodeTexCoord'); mapn.inputs['Rotation'].default_value = (0, 0, math.radians(rotz))
nt.links.new(tc.outputs['Generated'], mapn.inputs[0]); nt.links.new(mapn.outputs[0], env.inputs[0]); nt.links.new(env.outputs[0], bg.inputs[0]); bg.inputs[1].default_value = strength

def mat(name, rgb, rough=0.6, metal=0.0, emit=None, tex=None, scale=4.0):
    m = bpy.data.materials.new(name); m.use_nodes = True; b = m.node_tree.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = (*rgb, 1); b.inputs['Roughness'].default_value = rough; b.inputs['Metallic'].default_value = metal
    if emit: b.inputs['Emission Color'].default_value = (*emit[0], 1); b.inputs['Emission Strength'].default_value = emit[1]
    if tex:
        nt_ = m.node_tree; co = nt_.nodes.new('ShaderNodeTexCoord'); mp = nt_.nodes.new('ShaderNodeMapping'); mp.inputs['Scale'].default_value = (scale, scale, scale)
        nt_.links.new(co.outputs['UV'], mp.inputs[0])
        for sock, fn, data in (('Base Color', tex[0], False), ('Roughness', tex[2], True)):
            if not fn: continue
            ti = nt_.nodes.new('ShaderNodeTexImage'); ti.image = bpy.data.images.load(fn, check_existing=True)
            if data: ti.image.colorspace_settings.name = 'Non-Color'
            nt_.links.new(mp.outputs[0], ti.inputs[0]); nt_.links.new(ti.outputs[0], b.inputs[sock])
        if tex[1]:
            ti = nt_.nodes.new('ShaderNodeTexImage'); ti.image = bpy.data.images.load(tex[1], check_existing=True); ti.image.colorspace_settings.name = 'Non-Color'
            nm = nt_.nodes.new('ShaderNodeNormalMap'); nm.inputs['Strength'].default_value = 0.6
            nt_.links.new(mp.outputs[0], ti.inputs[0]); nt_.links.new(ti.outputs[0], nm.inputs['Color']); nt_.links.new(nm.outputs[0], b.inputs['Normal'])
    return m

def box(name, size, at, m, rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_cube_add(size=1, location=at); o = bpy.context.object; o.name = name; o.scale = size; o.rotation_euler = rot; o.data.materials.append(m); return o

def plane(name, sx, sy, at, m):
    bpy.ops.mesh.primitive_plane_add(size=1, location=at); o = bpy.context.object; o.name = name; o.scale = (sx, sy, 1); o.data.materials.append(m)
    # uvs scaled with the plane so the texture keeps its metre size
    for l in o.data.uv_layers.active.data: l.uv = (l.uv[0] * sx / 4, l.uv[1] * sy / 4)
    return o

PH = os.path.join(S, 'polyhaven')
asphalt = mat('asphalt', (0.5, 0.5, 0.5), 0.75, tex=(os.path.join(PH, 'asphalt_02_diff_2k.jpg'), os.path.join(PH, 'asphalt_02_nor_gl_2k.jpg'), os.path.join(PH, 'asphalt_02_rough_2k.jpg')), scale=1.0)
grass = mat('grass', (0.045, 0.085, 0.025), 0.95)
kerbR = mat('kerbR', (0.6, 0.05, 0.04), 0.5); kerbW = mat('kerbW', (0.85, 0.85, 0.8), 0.5)
armco = mat('armco', (0.75, 0.76, 0.78), 0.35, 0.9); post = mat('post', (0.25, 0.26, 0.28), 0.6, 0.5)
white = mat('line', (0.9, 0.9, 0.85), 0.5)
# ---- the track: a straight into a gentle left-hander, kerbs, armco on posts, grass
RW = 13.0
plane('grass', 400, 400, (0, 0, -0.01), grass)
plane('road', RW, 220, (0, -40, 0), asphalt)
for s in (-1, 1):
    plane('line%d' % s, 0.15, 220, (s * (RW / 2 - 0.3), -40, 0.003), white)
    for i in range(0, 60):
        y = 30 - i * 2.0
        box('kerb%d_%d' % (s, i), (0.9, 2.0, 0.05), (s * (RW / 2 + 0.45), y, 0.02), kerbR if i % 2 else kerbW)
    for i in range(0, 56):
        y = 36 - i * 4.0
        box('armco%d_%d' % (s, i), (0.08, 4.02, 0.32), (s * (RW / 2 + 3.4), y, 0.55), armco)
        box('post%d_%d' % (s, i), (0.1, 0.1, 0.75), (s * (RW / 2 + 3.5), y, 0.38), post)
# a grandstand-ish wall far left and some tyre-stack colour
tyre = mat('tyre', (0.03, 0.03, 0.03), 0.9)
for i in range(14):
    box('tyres%d' % i, (0.9, 0.9, 0.7), (-(RW / 2 + 5.5), -20 - i * 1.1, 0.35), tyre)
# lamp posts (lit at night)
lampM = mat('lampM', (0.9, 0.9, 0.85), 0.3, emit=((1.0, 0.9, 0.7), 40.0 if night else 0.0))
for i in range(6):
    y = 20 - i * 18; x = RW / 2 + 4.5
    box('pole%d' % i, (0.18, 0.18, 9), (x, y, 4.5), post); box('arm%d' % i, (3.0, 0.14, 0.14), (x - 1.4, y, 8.9), post); box('lamp%d' % i, (0.6, 0.3, 0.12), (x - 2.7, y, 8.8), lampM)
    if night:
        bpy.ops.object.light_add(type='SPOT', location=(x - 2.7, y, 8.7)); l = bpy.context.object; l.data.energy = 9000; l.data.color = (1.0, 0.85, 0.6); l.data.spot_size = math.radians(120); l.data.shadow_soft_size = 0.4
        l.rotation_euler = (0, 0, 0)
# ---- the cars: the hero front-left, the rest behind in a loose pack
slots = [(-2.4, -7.0, 0.05), (2.7, -2.0, -0.05), (-0.9, 3.5, 0.06), (3.3, 8.5, -0.03), (-3.1, 13.5, 0.04)]
for i, spec in enumerate(cars[:len(slots)]):
    cid, hx = spec.split(':'); x, y, yaw = slots[i]
    root, meta, objs = pr_load.load_car(mdir, cid, hexrgb(hx), at=(x, y, 0), yaw=yaw, lamps=25.0 if night else 0.0, steer=yaw * 1.5)
    if night:   # headlight beams
        L = meta.get('len', 4.5)
        for sx in (-0.62, 0.62):
            bpy.ops.object.light_add(type='SPOT', location=(sx, -L / 2 + 0.15, 0.68)); l = bpy.context.object; l.parent = root
            l.data.energy = 1800; l.data.color = (1.0, 0.95, 0.85); l.data.spot_size = math.radians(70); l.data.spot_blend = 0.6; l.data.shadow_soft_size = 0.1
            l.rotation_euler = (math.radians(96), 0, 0)
# ---- camera: low, ahead of the hero, looking back down the straight
cam = bpy.data.cameras.new('c'); co = bpy.data.objects.new('cam', cam); sc.collection.objects.link(co); sc.camera = co
cam.lens = 32; cam.sensor_width = 36
# ahead of the pack and low, the cars coming at the camera; the hero fills the left of the frame
pos = Vector((-6.8, -14.8, 1.0)); tgt = Vector((0.6, -3.0, 0.55))
co.location = pos; co.rotation_euler = (tgt - pos).to_track_quat('-Z', 'Y').to_euler()
cam.dof.use_dof = True; cam.dof.focus_distance = (tgt - pos).length * 0.75; cam.dof.aperture_fstop = 5.6
# ---- render
sc.render.engine = 'CYCLES'; sc.cycles.samples = samples; sc.cycles.use_denoising = True; sc.cycles.device = 'CPU'
sc.render.resolution_x = width; sc.render.resolution_y = width * 9 // 16; sc.render.film_transparent = False
sc.view_settings.view_transform = 'AgX'; sc.view_settings.look = 'AgX - Medium High Contrast'
sc.view_settings.exposure = 0.3 if night else 0.0
sc.render.filepath = out; bpy.ops.render.render(write_still=True)
print('COVER', out)
