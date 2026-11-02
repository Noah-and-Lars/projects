"""Sleeve folds for the first-person arms, baked in Blender (headless).
blender -b --python sg_sleeve.py -- <out-dir>

A fabric tube (radius 4.5 cm, 30 cm long) with compression folds that bunch towards both ends, diagonal wrinkles and a
seam, baked (normal, tangent space; ambient occlusion) onto a plain tube whose uvs match three.js' CylinderGeometry:
u goes once round, v runs along the length. Writes sleeve_nrm.png and sleeve_ao.png (1024)."""
import bpy, bmesh, sys, os, math, random
from mathutils import Vector

OUT = sys.argv[sys.argv.index('--') + 1:][0]
os.makedirs(OUT, exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene
R, LEN = 0.045, 0.3
random.seed(7)
waves = [(random.uniform(0.6, 1.6), random.uniform(0, 6.28), random.uniform(-0.6, 0.6), random.uniform(0.6, 1.0)) for _ in range(9)]

def fold(u, v):
    """outward offset (m) of the cloth at u (0..1 round) and v (0..1 along)"""
    a = u * 2 * math.pi
    ends = math.exp(-((v - 0.08) / 0.16) ** 2) + math.exp(-((v - 0.92) / 0.18) ** 2) * 1.3   # bunched at both ends
    d = 0.0
    for f, ph, tilt, amp in waves:          # rings that wander round the arm (diagonal wrinkles)
        d += amp * math.sin((v * 26 * f + tilt * math.sin(a + ph) * 2.2 + ph) * 1.0) * (0.25 + ends)
    d *= 0.0011
    d += 0.0016 * math.sin(a * 3 + v * 9) * ends                       # broad lobes where the cloth gathers
    seam = math.exp(-((u - 0.5) / 0.008) ** 2) * -0.0008                 # the seam on the underside
    return d + seam

def tube(name, segs, rows, displaced):
    me = bpy.data.meshes.new(name); bm = bmesh.new()
    verts = []
    for j in range(rows + 1):
        v = j / rows; ring = []
        for i in range(segs):
            u = i / segs; a = u * 2 * math.pi
            r = R + (fold(u, v) if displaced else 0)
            ring.append(bm.verts.new((math.cos(a) * r, math.sin(a) * r, v * LEN)))
        verts.append(ring)
    uv = bm.loops.layers.uv.new('uv')
    for j in range(rows):
        for i in range(segs):
            i2 = (i + 1) % segs
            f = bm.faces.new((verts[j][i], verts[j][i2], verts[j + 1][i2], verts[j + 1][i]))
            for l, (uu, vv) in zip(f.loops, ((i / segs, j / rows), ((i + 1) / segs, j / rows), ((i + 1) / segs, (j + 1) / rows), (i / segs, (j + 1) / rows))):
                l[uv].uv = (uu, vv)
    bm.normal_update(); bm.to_mesh(me); bm.free()
    ob = bpy.data.objects.new(name, me); sc.collection.objects.link(ob)
    for p in me.polygons: p.use_smooth = True
    return ob

hi = tube('hi', 256, 220, True)
lo = tube('lo', 64, 8, False)
# normals must point out of the tube
for ob in (hi, lo):
    me = ob.data; c = sum((Vector(p.center) for p in me.polygons), Vector()) / len(me.polygons)
    p = me.polygons[0]
    if Vector(p.normal).dot(Vector(p.center) - Vector((0, 0, p.center.z))) < 0:
        bm = bmesh.new(); bm.from_mesh(me); bmesh.ops.reverse_faces(bm, faces=bm.faces[:]); bm.to_mesh(me); bm.free()
img_n = bpy.data.images.new('n', 1024, 1024); img_a = bpy.data.images.new('a', 1024, 1024)
m = bpy.data.materials.new('m'); m.use_nodes = True; tn = m.node_tree.nodes.new('ShaderNodeTexImage'); m.node_tree.nodes.active = tn; lo.data.materials.append(m)
hm = bpy.data.materials.new('h'); hm.use_nodes = True; hi.data.materials.append(hm)
sc.render.engine = 'CYCLES'; sc.cycles.device = 'CPU'; sc.world = bpy.data.worlds.new('w')
sc.render.bake.use_selected_to_active = True; sc.render.bake.cage_extrusion = 0.006; sc.render.bake.max_ray_distance = 0.012; sc.render.bake.margin = 4
for o in sc.objects: o.select_set(False)
hi.select_set(True); lo.select_set(True); bpy.context.view_layer.objects.active = lo
sc.cycles.samples = 1; tn.image = img_n; bpy.ops.object.bake(type='NORMAL', normal_space='TANGENT')
sc.world.light_settings.distance = 0.01
sc.cycles.samples = 48; tn.image = img_a; bpy.ops.object.bake(type='AO')
for img, nm in ((img_n, 'sleeve_nrm'), (img_a, 'sleeve_ao')):
    img.filepath_raw = os.path.join(OUT, nm + '.png'); img.file_format = 'PNG'; img.save()
print('SGSLEEVE done', flush=True)
