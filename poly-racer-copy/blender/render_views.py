# Render a downloaded car (glTF) with Cycles in headless Blender: two outside views (one from each end, so the front is
# visible) and two views from inside the cabin (looking each way), into one image.
#   blender -b --python render_views.py -- <scene.gltf> <out.png> [samples]
import bpy, sys, os, math
import numpy as np
from mathutils import Vector

argv = sys.argv[sys.argv.index('--') + 1:]
path, out = argv[0], argv[1]; samples = int(argv[2]) if len(argv) > 2 else 24
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=path)
sc = bpy.context.scene
meshes = [o for o in bpy.data.objects if o.type == 'MESH']
dg = bpy.context.evaluated_depsgraph_get()
co = []
for o in meshes:
    me = o.evaluated_get(dg).to_mesh()
    if len(me.vertices):
        c = np.empty(len(me.vertices) * 3); me.vertices.foreach_get('co', c); c = c.reshape(-1, 3)
        M = np.array(o.matrix_world); co.append(c @ M[:3, :3].T + M[:3, 3])
    o.evaluated_get(dg).to_mesh_clear()
co = np.concatenate(co); mn, mx = co.min(0), co.max(0); size = mx - mn; cen = (mn + mx) / 2
L = max(size[0], size[1]); up = 2
along = 0 if size[0] >= size[1] else 1; across = 1 - along
# a ground plane and a simple sky
bpy.ops.mesh.primitive_plane_add(size=L * 6, location=(cen[0], cen[1], mn[2]))
gm = bpy.data.materials.new('ground'); gm.use_nodes = True; gm.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (0.25, 0.25, 0.26, 1)
bpy.context.object.data.materials.append(gm)
w = bpy.data.worlds.new('w'); sc.world = w; w.use_nodes = True
bg = w.node_tree.nodes['Background']; bg.inputs[0].default_value = (0.55, 0.65, 0.8, 1); bg.inputs[1].default_value = 1.0
sky = w.node_tree.nodes.new('ShaderNodeTexSky'); sky.sky_type = 'MULTIPLE_SCATTERING'; sky.sun_elevation = math.radians(40); sky.sun_rotation = math.radians(220); sky.sun_intensity = 0.6
w.node_tree.links.new(sky.outputs[0], bg.inputs[0])
sc.render.engine = 'CYCLES'; sc.cycles.samples = samples; sc.cycles.use_denoising = True; sc.cycles.device = 'CPU'
sc.render.resolution_x = 640; sc.render.resolution_y = 360; sc.render.film_transparent = False
sc.view_settings.view_transform = 'AgX'
cam = bpy.data.cameras.new('c'); co_ = bpy.data.objects.new('cam', cam); sc.collection.objects.link(co_); sc.camera = co_
def look(pos, target, fov=60):
    co_.location = Vector(pos); d = Vector(target) - Vector(pos); co_.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler(); cam.angle = math.radians(fov)
views = []
for sgn in (1, -1):   # outside, 3/4 from each end
    p = cen.copy(); p[along] += sgn * L * 1.1; p[across] += L * 0.75; p[up] = mn[2] + size[2] * 1.05
    t = cen.copy(); t[up] = mn[2] + size[2] * 0.4
    views.append((p, t, 45, 'out%+d' % sgn))
for sgn in (1, -1):   # inside, from the middle of the cabin, looking each way
    p = cen.copy(); p[across] -= size[across] * 0.18; p[up] = mn[2] + size[2] * 0.68; p[along] -= sgn * L * 0.02
    t = p.copy(); t[along] += sgn * 2; t[up] -= 0.25
    views.append((p, t, 80, 'in%+d' % sgn))
tiles = []
for i, (p, t, fov, name) in enumerate(views):
    look(p, t, fov); sc.render.filepath = out[:-4] + '_%d.png' % i; bpy.ops.render.render(write_still=True); tiles.append(sc.render.filepath)
# stitch 2x2 with blender's image api
W, H = 640, 360; big = bpy.data.images.new('sheet', W * 2, H * 2); px = np.zeros((H * 2, W * 2, 4), np.float32)
for i, f in enumerate(tiles):
    im = bpy.data.images.load(f); a = np.empty(W * H * 4, np.float32); im.pixels.foreach_get(a); a = a.reshape(H, W, 4)
    x, y = (i % 2) * W, (1 - i // 2) * H; px[y:y + H, x:x + W] = a; os.remove(f)
big.pixels.foreach_set(px.ravel()); big.filepath_raw = out; big.file_format = 'PNG'; big.save()
print('RENDERED', out, 'size', [round(float(s), 2) for s in size])
