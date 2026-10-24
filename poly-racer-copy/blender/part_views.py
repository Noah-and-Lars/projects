# Render each part of an exported car on its own from the driver's side, to see which part a missing panel belongs to.
#   blender -b --python part_views.py -- <models-dir> <id> <out-prefix>
import bpy, sys, os, math
from mathutils import Vector
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE)
import pr_load
mdir, cid, out = sys.argv[sys.argv.index('--') + 1:][:3]
bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene; sc.render.engine = 'BLENDER_EEVEE' if hasattr(bpy.types, 'SCENE_OT_render') else 'BLENDER_WORKBENCH'
sc.render.engine = 'CYCLES'; sc.cycles.samples = 12; sc.cycles.use_denoising = False; sc.cycles.device = 'CPU'
w = bpy.data.worlds.new('w'); sc.world = w; w.use_nodes = True; w.node_tree.nodes['Background'].inputs[1].default_value = 1.0
sc.render.resolution_x = 900; sc.render.resolution_y = 500
root, meta, objs = pr_load.load_car(mdir, cid, (0.8, 0.8, 0.8))
L = meta.get('len', 5)
cam = bpy.data.cameras.new('c'); co = bpy.data.objects.new('cam', cam); sc.collection.objects.link(co); sc.camera = co
pos = Vector((L * 1.4, L * 0.35, L * 0.45)); tgt = Vector((0, L * 0.1, 0.9))
co.location = pos; co.rotation_euler = (tgt - pos).to_track_quat('-Z', 'Y').to_euler(); cam.lens = 35
cols = {'body': (0.9, 0.9, 0.9, 1), 'det': (0.2, 0.5, 0.9, 1), 'interior': (0.9, 0.3, 0.2, 1), 'glass': (0.3, 0.9, 0.9, 1), 'lamp': (0.9, 0.9, 0.2, 1), 'wheel': (0.3, 0.3, 0.3, 1), 'swheel': (0.9, 0.2, 0.9, 1), 'mid': (0.5, 0.5, 0.5, 1), 'lo': (0.5, 0.5, 0.5, 1)}
objs = list(objs.items())
for k, o in objs:
    kk = 'wheel' if k.startswith('wheel') else k; o['part'] = kk
    m = bpy.data.materials.new('pv_' + k); m.use_nodes = True; b = m.node_tree.nodes['Principled BSDF']; b.inputs['Base Color'].default_value = cols.get(kk, (1, 1, 1, 1)); b.inputs['Roughness'].default_value = 0.7
    o.data.materials.clear(); o.data.materials.append(m)
def shot(keep, name):
    for k, o in objs: o.hide_render = o.get('part') not in keep
    sc.render.filepath = '%s_%s.png' % (out, name); bpy.ops.render.render(write_still=True)
shot({'body', 'det', 'glass', 'lamp', 'wheel', 'interior', 'swheel'}, 'all'); shot({'body'}, 'body'); shot({'det'}, 'det'); shot({'interior'}, 'interior')
