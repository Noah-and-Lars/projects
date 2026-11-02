"""Turn a downloaded model into a small game model (run inside Blender, headless).
blender -b --python sg_model.py -- <in.gltf> <out.glb> <max_tris> <tex_px> [preview.png]

- joins every mesh, applies transforms, puts the origin at the bottom centre
- decimates a copy to max_tris
- bakes the original's colour (all its materials) and ambient occlusion onto one new atlas (selected to active)
- exports position, normal, uv and one JPEG texture (albedo x AO) as GLB, front of the model = glTF +Z
"""
import bpy, sys, os, math, bmesh
from mathutils import Vector

argv = sys.argv[sys.argv.index('--') + 1:]
SRC, OUT, MAXT, PX = argv[0], argv[1], int(argv[2]), int(argv[3])
PREV = argv[4] if len(argv) > 4 else None

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=SRC)
meshes = [o for o in bpy.context.scene.objects if o.type == 'MESH']
for o in bpy.context.scene.objects: o.select_set(False)
# apply parents and transforms
for o in meshes:
    o.select_set(True)
bpy.context.view_layer.objects.active = meshes[0]
bpy.ops.object.parent_clear(type='CLEAR_KEEP_TRANSFORM')
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
if len(meshes) > 1: bpy.ops.object.join()
hi = bpy.context.view_layer.objects.active
hi.name = 'hi'
for o in list(bpy.context.scene.objects):
    if o != hi: bpy.data.objects.remove(o, do_unlink=True)

# origin: bottom centre
bb = [hi.matrix_world @ Vector(c) for c in hi.bound_box]
mn = Vector((min(v.x for v in bb), min(v.y for v in bb), min(v.z for v in bb)))
mx = Vector((max(v.x for v in bb), max(v.y for v in bb), max(v.z for v in bb)))
off = Vector(((mn.x + mx.x) / 2, (mn.y + mx.y) / 2, mn.z))
hi.data.transform(__import__('mathutils').Matrix.Translation(-off))
hi.data.update()
dims = mx - mn
tris0 = sum(len(p.vertices) - 2 for p in hi.data.polygons)

# low copy
lo = hi.copy(); lo.data = hi.data.copy(); lo.name = 'lo'
bpy.context.scene.collection.objects.link(lo)
for o in bpy.context.scene.objects: o.select_set(False)
lo.select_set(True); bpy.context.view_layer.objects.active = lo
bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT')
bpy.ops.mesh.remove_doubles(threshold=0.0005)
bpy.ops.object.mode_set(mode='OBJECT')
if tris0 > MAXT:
    m = lo.modifiers.new('dec', 'DECIMATE'); m.ratio = max(0.01, MAXT / tris0); m.use_collapse_triangulate = True
    bpy.ops.object.modifier_apply(modifier='dec')
# fresh atlas uvs
while lo.data.uv_layers: lo.data.uv_layers.remove(lo.data.uv_layers[0])
lo.data.uv_layers.new(name='atlas')
bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT')
bpy.ops.uv.smart_project(angle_limit=math.radians(60), island_margin=0.004, area_weight=0.0, scale_to_bounds=False)
bpy.ops.uv.pack_islands(margin=0.004)
bpy.ops.object.mode_set(mode='OBJECT')
lo.data.materials.clear()
img_c = bpy.data.images.new('col', PX, PX); img_a = bpy.data.images.new('ao', PX, PX)
mat = bpy.data.materials.new('baked'); mat.use_nodes = True
nt = mat.node_tree; tn = nt.nodes.new('ShaderNodeTexImage'); tn.image = img_c
lo.data.materials.append(mat)
for p in lo.data.polygons: p.use_smooth = True

sc = bpy.context.scene; sc.render.engine = 'CYCLES'; sc.cycles.device = 'CPU'
sc.render.bake.use_selected_to_active = True
sc.render.bake.cage_extrusion = max(0.01, max(dims) * 0.012)
sc.render.bake.max_ray_distance = max(0.02, max(dims) * 0.03)
sc.render.bake.margin = 6
for o in sc.objects: o.select_set(False)
hi.select_set(True); lo.select_set(True); bpy.context.view_layer.objects.active = lo

def bake(kind, img, samples, **kw):
    tn.image = img; nt.nodes.active = tn
    sc.cycles.samples = samples
    bpy.ops.object.bake(type=kind, **kw)

# the original's materials must not render alpha-clipped holes black: fine for these props
bake('DIFFUSE', img_c, 1, pass_filter={'COLOR'})
# AO on the low model itself (sees its own crevices), more samples
sc.render.bake.use_selected_to_active = False
hi.hide_render = True
for o in sc.objects: o.select_set(False)
lo.select_set(True)
sc.world = bpy.data.worlds.new('w') if not sc.world else sc.world
bake('AO', img_a, 48)
hi.hide_render = False

# albedo x soft AO -> final texture
import numpy as np
c = np.array(img_c.pixels[:]).reshape(-1, 4); a = np.array(img_a.pixels[:]).reshape(-1, 4)
ao = 0.35 + 0.65 * a[:, :1]
c[:, :3] *= ao
img_c.pixels[:] = c.ravel()
img_c.file_format = 'JPEG'
tn.image = img_c
nt.links.new(tn.outputs['Color'], nt.nodes['Principled BSDF'].inputs['Base Color'])
bpy.data.objects.remove(hi, do_unlink=True)
bsdf = nt.nodes['Principled BSDF']; bsdf.inputs['Roughness'].default_value = 0.8
bsdf.inputs['Metallic'].default_value = 0.0

# export: Blender -Y (front) becomes glTF +Z
for o in sc.objects: o.select_set(False)
lo.select_set(True)
bpy.ops.export_scene.gltf(filepath=OUT, export_format='GLB', use_selection=True, export_image_format='JPEG',
                          export_jpeg_quality=86, export_materials='EXPORT', export_normals=True, export_texcoords=True,
                          export_tangents=False, export_attributes=False, export_yup=True, export_apply=True)
tris1 = sum(len(p.vertices) - 2 for p in lo.data.polygons)
print(f'SGMODEL {os.path.basename(OUT)} dims={dims.x:.2f}x{dims.y:.2f}x{dims.z:.2f} tris {tris0}->{tris1}', flush=True)

if PREV:
    # quick look: 3/4 front view
    cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam')); sc.collection.objects.link(cam)
    r = max(dims) * 1.6
    cam.location = (r * 0.7, -r * 1.1, dims.z * 0.5 + r * 0.45)
    d = Vector((0, 0, dims.z * 0.45)) - cam.location; cam.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()
    sc.camera = cam
    light = bpy.data.objects.new('sun', bpy.data.lights.new('sun', 'SUN')); light.rotation_euler = (0.8, 0.2, 0.6); sc.collection.objects.link(light)
    sc.world.use_nodes = True; sc.world.node_tree.nodes['Background'].inputs['Strength'].default_value = 0.6
    sc.render.engine = 'CYCLES'; sc.cycles.samples = 24; sc.cycles.use_denoising = False
    sc.render.resolution_x = sc.render.resolution_y = 320; sc.render.filepath = PREV
    bpy.ops.render.render(write_still=True)
