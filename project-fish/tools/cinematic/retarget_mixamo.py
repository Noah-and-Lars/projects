"""Puts a Mixamo clip on the soldier: reads a Mixamo animation (FBX,
"without skin", 30 fps) and writes it as a small .glb holding only that
animation on the soldier's own bones (assets/soldier.glb's CC_Base
skeleton), for a slot of the cinematic (src/showcase/cinematic/edit.js).

    blender --background --python tools/cinematic/retarget_mixamo.py -- \
        build/mixamo/sprint.fbx assets/soldier.glb assets/cinematic/sprint.glb [--trim 0.2 2.4] [--fps 30]

How (see tools/cinematic/README.md):
- Each Mixamo bone ("mixamorig:" prefix dropped) is matched to one of his
  bones by bone_map.json.
- Rest poses: Mixamo's skeleton rests in a T-pose; his may rest otherwise.
  So his rest pose is first lined up with Mixamo's, bone by bone in the
  world: each of his bones is turned (the smallest turn) to point the way
  its Mixamo bone points at rest (at the bone named in the map's `aim`).
- Every frame, each Mixamo bone's turn away from its rest (in the world) is
  given to his matching bone, from that lined-up rest; his bones' own
  turns, relative to their parents, are worked out from those. His bones
  the map leaves out keep their rest relative to their parent; his forearm
  twist bones take their share of the hand's twist (the map's `twist`).
- His hips move as Mixamo's do, scaled by how tall his hips stand to its,
  starting over the origin (the film places each clip where its slot starts),
  so a clip downloaded with its root motion (not "In Place") carries him.
- Both are compared in the glTF frame (Y up, metres, facing +Z).

It writes the animation's keys at the clip's own frames: rotations for the
mapped and twist bones, the hips' position, on nodes named as his bones
(with the number his file gives each), which is all the film reads.
Needs only Blender (its FBX importer) and numpy.
"""

import json
import math
import os
import re
import struct
import sys

import bpy
import numpy as np
from mathutils import Matrix, Quaternion, Vector

HERE = os.path.dirname(os.path.abspath(__file__))
# Blender's frame (Z up) to glTF's (Y up): (x, y, z) -> (x, z, -y).
B2G = Matrix(((1, 0, 0, 0), (0, 0, 1, 0), (0, -1, 0, 0), (0, 0, 0, 1)))


def log(*a):
    print('[retarget]', *a, flush=True)


def args():
    # (Blender passes its own arguments first, then ours after '--'.)
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else sys.argv[1:]
    if len(argv) < 3:
        raise SystemExit(__doc__)
    opts = {'fbx': argv[0], 'soldier': argv[1], 'out': argv[2], 'fps': 30.0, 'trim': None}
    i = 3
    while i < len(argv):
        if argv[i] == '--fps':
            opts['fps'] = float(argv[i + 1]); i += 2
        elif argv[i] == '--trim':
            opts['trim'] = (float(argv[i + 1]), float(argv[i + 2])); i += 3
        else:
            raise SystemExit('unknown option ' + argv[i])
    return opts


base = lambda name: re.sub(r'_\d+$', '', name)  # 'CC_Base_Hip_01' -> 'CC_Base_Hip'
plain = lambda name: name.split(':')[-1]  # 'mixamorig:Hips' -> 'Hips'


# ---- His skeleton, from the .glb's JSON ----

def read_gltf_json(path):
    with open(path, 'rb') as f:
        blob = f.read()
    magic, version, length = struct.unpack_from('<III', blob, 0)
    if magic != 0x46546C67:
        raise SystemExit(path + ' is not a .glb')
    size, kind = struct.unpack_from('<II', blob, 12)
    return json.loads(blob[20:20 + size])


def trs_matrix(node):
    if 'matrix' in node:
        return Matrix([node['matrix'][i::4] for i in range(4)])
    t = Vector(node.get('translation', [0, 0, 0]))
    x, y, z, w = node.get('rotation', [0, 0, 0, 1])
    s = node.get('scale', [1, 1, 1])
    return Matrix.LocRotScale(t, Quaternion((w, x, y, z)), Vector(s))


def soldier_skeleton(path):
    g = read_gltf_json(path)
    nodes = g['nodes']
    parent = {}
    for i, n in enumerate(nodes):
        for c in n.get('children', []):
            parent[c] = i
    world = {}

    def w(i):
        if i not in world:
            local = trs_matrix(nodes[i])
            world[i] = (w(parent[i]) @ local) if i in parent else local
        return world[i]

    bones = {}
    for i, n in enumerate(nodes):
        name = n.get('name', '')
        if name.startswith('CC_Base_'):
            bones[base(name)] = i
    order = sorted(bones.values(), key=lambda i: depth(i, parent))
    return {'nodes': nodes, 'parent': parent, 'world': w, 'bones': bones, 'order': order}


def depth(i, parent):
    d = 0
    while i in parent:
        i = parent[i]
        d += 1
    return d


def rot_of(m):
    """The turn of a (possibly scaled) matrix."""
    return m.to_3x3().normalized().to_quaternion().normalized()


# ---- The Mixamo clip ----

def load_fbx(path):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.fbx(filepath=path, automatic_bone_orientation=False, ignore_leaf_bones=True)
    arms = [o for o in bpy.context.scene.objects if o.type == 'ARMATURE']
    if not arms:
        raise SystemExit(path + ': no skeleton')
    arm = arms[0]
    if not arm.animation_data or not arm.animation_data.action:
        raise SystemExit(path + ': no animation')
    return arm


def main():
    o = args()
    bmap = json.load(open(os.path.join(HERE, 'bone_map.json')))
    names, aims, twists = bmap['bones'], bmap['aim'], {k: v for k, v in bmap['twist'].items() if k != 'about'}
    sk = soldier_skeleton(o['soldier'])
    nodes, parent, W = sk['nodes'], sk['parent'], sk['world']

    arm = load_fbx(o['fbx'])
    pbones = {plain(pb.name): pb for pb in arm.pose.bones}
    missing = [m for m in names if m not in pbones]
    if missing:
        log('not in the clip (left at rest):', ', '.join(missing))
    mapped = {m: names[m] for m in names if m in pbones and names[m] in sk['bones']}
    scene = bpy.context.scene
    a0, a1 = arm.animation_data.action.frame_range
    frames = list(range(int(round(a0)), int(round(a1)) + 1))
    fps = o['fps']
    if o['trim']:
        frames = [f for f in frames if o['trim'][0] - 1e-6 <= (f - frames[0]) / fps <= o['trim'][1] + 1e-6]
    log(len(frames), 'frames at', fps, 'fps:', round((len(frames) - 1) / fps, 3), 's')

    # Rest: both skeletons in the glTF frame.
    scene.frame_set(frames[0])
    src_rest = {m: B2G @ arm.matrix_world @ arm.data.bones[pbones[m].name].matrix_local for m in mapped}
    tgt_rest = {b: W(i) for b, i in sk['bones'].items()}
    # Lining his rest up with Mixamo's: each bone turned to point as its
    # Mixamo bone points.
    align = {}
    for m, b in mapped.items():
        a = aims.get(m)
        if a in mapped:
            ds = src_rest[a].to_translation() - src_rest[m].to_translation()
            dt = tgt_rest[mapped[a]].to_translation() - tgt_rest[b].to_translation()
            align[m] = dt.normalized().rotation_difference(ds.normalized()) if ds.length > 1e-6 and dt.length > 1e-6 else Quaternion()
    for m in mapped:
        if m not in align:
            # (An end bone turns as its parent did.)
            p = arm.data.bones[pbones[m].name].parent
            align[m] = align.get(plain(p.name), Quaternion()) if p else Quaternion()
    aligned = {b: align[m] @ rot_of(tgt_rest[b]) for m, b in mapped.items()}
    src_rest_rot = {m: rot_of(src_rest[m]) for m in mapped}

    # The hips: scaled by how tall his stand to Mixamo's.
    hip_m = next(m for m, b in mapped.items() if b == 'CC_Base_Hip')
    hip_i = sk['bones']['CC_Base_Hip']
    k = tgt_rest['CC_Base_Hip'].to_translation().y / max(1e-6, src_rest[hip_m].to_translation().y)
    log('hips scaled by', round(k, 3))
    hip_parent_inv = W(parent[hip_i]).inverted()

    rest_local = {i: trs_matrix(nodes[i]) for i in sk['order']}
    by_index = {i: base(nodes[i]['name']) for i in sk['order']}
    tw = {sk['bones'][t]: (sk['bones'][d], s) for t, (d, s) in twists.items() if t in sk['bones'] and d in sk['bones']}
    animated = sorted(set(sk['bones'][b] for b in mapped.values()) | set(tw))
    rot_keys = {i: [] for i in animated}
    hip_keys = []
    start = None
    for f in frames:
        scene.frame_set(f)
        want = {}
        for m, b in mapped.items():
            now = rot_of(B2G @ arm.matrix_world @ pbones[m].matrix)
            want[sk['bones'][b]] = now @ src_rest_rot[m].inverted() @ aligned[b]
        # His bones' world turns, parents first; mapped bones as wanted, the
        # rest as at rest under their parent.
        wrot = {}
        top = {}
        for i in sk['order']:
            p = parent.get(i)
            pw = wrot[p] if p in wrot else rot_of(W(p)) if p is not None else Quaternion()
            if i in want:
                wrot[i] = want[i]
            else:
                wrot[i] = pw @ rest_local[i].to_quaternion()
            top[i] = pw
        # Twist bones: their share of the hand's twist about the forearm.
        for i, (drv, share) in tw.items():
            fore = parent[drv]
            rel = top[drv].inverted() @ wrot[drv]  # the hand in the forearm's frame, now
            rel0 = rest_local[drv].to_quaternion()
            delta = rel @ rel0.inverted()
            axis = rest_local[drv].to_translation().normalized()
            v = Vector((delta.x, delta.y, delta.z))
            proj = axis * v.dot(axis)
            twist = Quaternion((delta.w, proj.x, proj.y, proj.z))
            twist = twist.normalized() if twist.magnitude > 1e-9 else Quaternion()
            chain = Quaternion()
            j = i
            while j != fore:
                chain = rest_local[j].to_quaternion() @ chain
                j = parent[j]
            wrot[i] = wrot[fore] @ Quaternion().slerp(twist, share) @ chain
            # (Its children follow.)
            for c in sk['order']:
                if parent.get(c) == i and c not in want:
                    wrot[c] = wrot[i] @ rest_local[c].to_quaternion()
        for i in animated:
            local = (wrot[parent[i]] if parent[i] in wrot else rot_of(W(parent[i]))).inverted() @ wrot[i]
            rot_keys[i].append(local.normalized())
        hp = (B2G @ arm.matrix_world @ pbones[hip_m].matrix).to_translation()
        if start is None:
            start = hp.copy()
        target = Vector((tgt_rest['CC_Base_Hip'].to_translation().x + k * (hp.x - start.x), k * hp.y, tgt_rest['CC_Base_Hip'].to_translation().z + k * (hp.z - start.z)))
        hip_keys.append(hip_parent_inv @ target)

    times = [(f - frames[0]) / fps for f in frames]
    # Keep each quaternion on the same side as the last (no flips between keys).
    for i in animated:
        ks = rot_keys[i]
        for j in range(1, len(ks)):
            if ks[j].dot(ks[j - 1]) < 0:
                ks[j] = -ks[j]
    write_glb(o['out'], nodes, animated, hip_i, times, rot_keys, hip_keys, os.path.basename(o['fbx']))
    log('wrote', o['out'], '-', len(animated), 'bones,', len(times), 'keys')


def write_glb(path, nodes, animated, hip_i, times, rot_keys, hip_keys, source):
    out_nodes, index = [], {}
    for i in sorted(set(animated) | {hip_i}):
        n = nodes[i]
        index[i] = len(out_nodes)
        out_nodes.append({k: n[k] for k in ('name', 'translation', 'rotation', 'scale') if k in n})
    blob = bytearray()
    views, accessors = [], []

    def add(data, kind, count, minmax=False):
        while len(blob) % 4:
            blob.append(0)
        raw = np.asarray(data, np.float32).tobytes()
        views.append({'buffer': 0, 'byteOffset': len(blob), 'byteLength': len(raw)})
        blob.extend(raw)
        acc = {'bufferView': len(views) - 1, 'componentType': 5126, 'count': count, 'type': kind}
        if minmax:
            acc['min'] = [float(min(data))]
            acc['max'] = [float(max(data))]
        accessors.append(acc)
        return len(accessors) - 1

    t = add(times, 'SCALAR', len(times), True)
    samplers, channels = [], []
    for i in animated:
        q = [c for r in rot_keys[i] for c in (r.x, r.y, r.z, r.w)]
        samplers.append({'input': t, 'output': add(q, 'VEC4', len(times)), 'interpolation': 'LINEAR'})
        channels.append({'sampler': len(samplers) - 1, 'target': {'node': index[i], 'path': 'rotation'}})
    p = [c for v in hip_keys for c in (v.x, v.y, v.z)]
    samplers.append({'input': t, 'output': add(p, 'VEC3', len(times)), 'interpolation': 'LINEAR'})
    channels.append({'sampler': len(samplers) - 1, 'target': {'node': index[hip_i], 'path': 'translation'}})
    name = os.path.splitext(os.path.basename(path))[0]
    g = {
        'asset': {
            'version': '2.0', 'generator': 'Project Fish tools/cinematic/retarget_mixamo.py',
            'copyright': 'Animation: Mixamo (Adobe), retargeted onto the soldier',
            'extras': {'source': source, 'credit': 'Animation from Mixamo (mixamo.com, Adobe)'},
        },
        'scene': 0, 'scenes': [{'nodes': list(range(len(out_nodes)))}], 'nodes': out_nodes,
        'animations': [{'name': name, 'samplers': samplers, 'channels': channels}],
        'buffers': [{'byteLength': len(blob)}], 'bufferViews': views, 'accessors': accessors,
    }
    js = json.dumps(g, separators=(',', ':')).encode()
    while len(js) % 4:
        js += b' '
    while len(blob) % 4:
        blob.append(0)
    os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
    with open(path, 'wb') as f:
        f.write(struct.pack('<III', 0x46546C67, 2, 12 + 8 + len(js) + 8 + len(blob)))
        f.write(struct.pack('<II', len(js), 0x4E4F534A) + js)
        f.write(struct.pack('<II', len(blob), 0x004E4942) + bytes(blob))


if __name__ == '__main__':
    main()
