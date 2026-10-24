# Inspect a downloaded Sketchfab glTF in headless Blender: size, face count, materials and their textures, and whether
# the car has a modelled interior (faces inside the cabin volume). Usage:
#   blender -b --python inspect_gltf.py -- <path/to/scene.gltf|.glb> [json-out]
import bpy, sys, os, json
import numpy as np
from mathutils import Vector

argv = sys.argv[sys.argv.index('--') + 1:]
path = argv[0]; out = argv[1] if len(argv) > 1 else None
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=path)
dg = bpy.context.evaluated_depsgraph_get()
meshes = [o for o in bpy.data.objects if o.type == 'MESH']
allco = []; faces = 0; objs = []
for o in meshes:
    me = o.evaluated_get(dg).to_mesh()
    n = len(me.vertices)
    if n:
        co = np.empty(n * 3); me.vertices.foreach_get('co', co); co = co.reshape(-1, 3)
        M = np.array(o.matrix_world); co = co @ M[:3, :3].T + M[:3, 3]
        allco.append(co)
    f = len(me.polygons); faces += f
    objs.append(dict(name=o.name, faces=f, mats=[m.name for m in me.materials if m], parent=o.parent.name if o.parent else None))
    o.evaluated_get(dg).to_mesh_clear()
co = np.concatenate(allco) if allco else np.zeros((1, 3))
mn, mx = co.min(0), co.max(0); size = mx - mn
# the longest horizontal axis is the car's length
axes = sorted(range(3), key=lambda i: -size[i]); L = size[axes[0]]
# interior test: triangles whose centre is well inside the body box (middle 55% of width/length, above the wheel line)
inside = 0; cab = 0
for o in meshes:
    me = o.evaluated_get(dg).to_mesh()
    if not len(me.polygons): continue
    n = len(me.polygons); c = np.empty(n * 3); me.polygons.foreach_get('center', c); c = c.reshape(-1, 3)
    M = np.array(o.matrix_world); c = c @ M[:3, :3].T + M[:3, 3]
    rel = (c - mn) / np.maximum(size, 1e-6)
    up = 2 if size[2] < size[0] and size[2] < size[1] else (1 if size[1] < size[0] and size[1] < size[2] else 0)
    horiz = [i for i in range(3) if i != up]
    m = np.ones(n, bool)
    for i in horiz: m &= (rel[:, i] > 0.22) & (rel[:, i] < 0.78)
    m &= (rel[:, up] > 0.35) & (rel[:, up] < 0.9)
    inside += int(m.sum())
    o.evaluated_get(dg).to_mesh_clear()
mats = {}
for m in bpy.data.materials:
    if not m.use_nodes: mats[m.name] = {'nodes': False}; continue
    info = {}
    for n in m.node_tree.nodes:
        if n.type == 'TEX_IMAGE' and n.image:
            tgt = [l.to_socket.name for l in n.outputs[0].links] + [l.to_socket.name for l in n.outputs[1].links]
            info[n.image.name] = dict(size=list(n.image.size), to=tgt)
        if n.type == 'BSDF_PRINCIPLED':
            info['_base'] = [round(v, 3) for v in n.inputs['Base Color'].default_value[:3]]
            info['_metal'] = round(n.inputs['Metallic'].default_value, 2); info['_rough'] = round(n.inputs['Roughness'].default_value, 2)
            info['_alpha'] = round(n.inputs['Alpha'].default_value, 2)
    mats[m.name] = info
names = ' '.join(o['name'].lower() for o in objs)
hints = {k: (k in names) for k in ['seat', 'steer', 'dash', 'interior', 'wheel', 'door', 'glass', 'mirror', 'brake', 'caliper', 'light', 'engine', 'pedal', 'gauge', 'cluster']}
rep = dict(path=path, faces=faces, objects=len(objs), size=[round(float(x), 3) for x in size], length=round(float(L), 3),
           interior_faces=inside, interior_pct=round(100 * inside / max(1, faces), 1), hints=hints,
           materials=mats, objs=sorted(objs, key=lambda o: -o['faces'])[:60])
print('INSPECT ' + json.dumps(rep))
if out: json.dump(rep, open(out, 'w'), indent=1)
