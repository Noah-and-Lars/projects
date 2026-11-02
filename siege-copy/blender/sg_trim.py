"""Wall trim textures, baked in Blender (headless).
blender -b --python sg_trim.py -- <out-dir> [paint-texture.jpg]

wainscot: 1.0 m wide x 1.0 m tall: skirting board (0-0.13 m), a raised panel frame, a chair rail at the top.
crown:    1.0 m wide x 0.16 m tall: cove moulding under the ceiling.
For each: <name>_col.png (white paint x ambient occlusion) and <name>_nrm.png (tangent-space normal, OpenGL), baked from
modelled geometry onto a flat plane, so the game can lay them on a flat wall."""
import bpy, bmesh, sys, os, math
from mathutils import Vector

argv = sys.argv[sys.argv.index('--') + 1:]
OUT = argv[0]; PAINT = argv[1] if len(argv) > 1 else None
os.makedirs(OUT, exist_ok=True)

def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene; sc.render.engine = 'CYCLES'; sc.cycles.device = 'CPU'
    sc.world = bpy.data.worlds.new('w'); return sc

def box(x0, x1, z0, z1, d, bevel=0.0, seg=4, name='b'):
    """a box on the wall: x across, z up, d = how far it stands out (towards -y, the viewer)"""
    bpy.ops.mesh.primitive_cube_add(size=1); o = bpy.context.object; o.name = name
    o.scale = (x1 - x0, d, z1 - z0); o.location = ((x0 + x1) / 2, -d / 2, (z0 + z1) / 2)
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    if bevel:
        m = o.modifiers.new('bv', 'BEVEL'); m.width = bevel; m.segments = seg; m.profile = 0.5
        bpy.context.view_layer.objects.active = o; bpy.ops.object.modifier_apply(modifier='bv')
    return o

def rod(x0, x1, z, r, name='r'):
    """a half-round moulding along x at height z"""
    bpy.ops.mesh.primitive_cylinder_add(vertices=32, radius=r, depth=x1 - x0); o = bpy.context.object; o.name = name
    o.rotation_euler = (0, math.pi / 2, 0); o.location = ((x0 + x1) / 2, 0, z)
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True); return o

def frame(x0, x1, z0, z1, w, d, bev):
    """a raised moulding frame (four mitred bars)"""
    return [box(x0, x1, z0, z0 + w, d, bev), box(x0, x1, z1 - w, z1, d, bev), box(x0, x0 + w, z0, z1, d, bev), box(x1 - w, x1, z0, z1, d, bev)]

def bake(name, W, H, px_w, px_h, build):
    sc = reset()
    hi = build()
    for o in hi: o.select_set(True)
    bpy.context.view_layer.objects.active = hi[0]
    if len(hi) > 1: bpy.ops.object.join()
    hiob = bpy.context.view_layer.objects.active
    # backing wall (also part of the high model) and the flat target plane
    bpy.ops.mesh.primitive_plane_add(size=1); back = bpy.context.object
    back.scale = (W * 1.4, 1, H * 1.4); back.rotation_euler = (math.pi / 2, 0, 0); back.location = (W / 2, 0.0005, H / 2)
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    for o in sc.objects: o.select_set(False)
    hiob.select_set(True); back.select_set(True); bpy.context.view_layer.objects.active = hiob; bpy.ops.object.join()
    bpy.ops.mesh.primitive_plane_add(size=1); lo = bpy.context.object
    lo.scale = (W, 1, H); lo.rotation_euler = (math.pi / 2, 0, 0); lo.location = (W / 2, -0.0001, H / 2)
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    # uv 0..1 over the plane, u across, v up
    me = lo.data
    for l in me.loops:
        co = me.vertices[l.vertex_index].co
    uvl = me.uv_layers.new(name='uv')
    for poly in me.polygons:
        for li in poly.loop_indices:
            co = me.vertices[me.loops[li].vertex_index].co
            uvl.data[li].uv = (co.x / W, co.z / H)
    img_n = bpy.data.images.new(name + '_n', px_w, px_h); img_a = bpy.data.images.new(name + '_a', px_w, px_h)
    mat = bpy.data.materials.new('m'); mat.use_nodes = True; tn = mat.node_tree.nodes.new('ShaderNodeTexImage'); mat.node_tree.nodes.active = tn
    lo.data.materials.append(mat)
    hm = bpy.data.materials.new('h'); hm.use_nodes = True; hiob.data.materials.clear(); hiob.data.materials.append(hm)
    for p in hiob.data.polygons: p.use_smooth = True
    sc.render.bake.use_selected_to_active = True; sc.render.bake.cage_extrusion = 0.06; sc.render.bake.max_ray_distance = 0.1; sc.render.bake.margin = 4
    for o in sc.objects: o.select_set(False)
    hiob.select_set(True); lo.select_set(True); bpy.context.view_layer.objects.active = lo
    sc.cycles.samples = 1; tn.image = img_n; bpy.ops.object.bake(type='NORMAL', normal_space='TANGENT')
    sc.cycles.samples = 64; tn.image = img_a; bpy.ops.object.bake(type='AO')
    for img, suf in ((img_n, '_nrm'), (img_a, '_ao')):
        img.filepath_raw = os.path.join(OUT, name + suf + '.png'); img.file_format = 'PNG'; img.save()
    print('SGTRIM', name, flush=True)

# ---- wainscot: skirting, panel frame, chair rail ----
def wainscot():
    p = []
    p.append(box(0, 1, 0, 0.125, 0.018, 0.004, name='skirting'))
    p.append(rod(0, 1, 0.128, 0.007, name='skirt_cap'))
    p.append(box(0, 1, 0.885, 0.955, 0.016, 0.006, name='rail'))
    p.append(rod(0, 1, 0.962, 0.009, name='rail_top'))
    p.append(rod(0, 1, 0.878, 0.006, name='rail_under'))
    p += frame(0.08, 0.92, 0.22, 0.8, 0.032, 0.009, 0.006)
    p.append(box(0.125, 0.875, 0.265, 0.755, 0.004, 0.012, name='raised'))  # a softly raised field inside the frame
    return p
bake('wainscot', 1.0, 1.0, 512, 512, wainscot)

# ---- crown moulding: a cove with fillets ----
def crown():
    p = [box(0, 1, 0.0, 0.03, 0.012, 0.004, name='fillet_lo'), box(0, 1, 0.13, 0.16, 0.03, 0.004, name='fillet_hi')]
    bpy.ops.mesh.primitive_cylinder_add(vertices=48, radius=0.07, depth=1); c = bpy.context.object
    c.rotation_euler = (0, math.pi / 2, 0); c.location = (0.5, 0.045, 0.085); bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    p.append(c); p.append(rod(0, 1, 0.03, 0.008, name='bead'))
    return p
bake('crown', 1.0, 0.16, 512, 96, crown)
