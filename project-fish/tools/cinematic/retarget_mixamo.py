"""Puts the cinematic's Mixamo clips on the soldier.

Reads the Mixamo animations listed in tools/cinematic/clips.json (FBX
Binary, "without skin", 30 fps, downloaded into build/mixamo/; never
committed) and writes them, retargeted onto the soldier's own CC_Base
skeleton (assets/soldier.glb), into one animation-only .glb: no mesh, just
nodes named as his bones and one animation per clip
(assets/cinematic/soldier_clips.glb, which src/showcase/cinematic/ plays).

    npm run build-cinematic-clips
    # which is:
    blender --background --python tools/cinematic/retarget_mixamo.py -- \
        tools/cinematic/clips.json assets/cinematic/soldier_clips.glb
    # options: --candidates  every clip in the file's "candidates" list too
    #          --only a,b    just these clips
    #          --report r.json  per-clip facts (lengths, travel, feet, hands,
    #                           and checks: wrist twist, knees or elbows
    #                           bending the wrong way, hands inside his body)

How:
- Each Mixamo bone ("mixamorig:" dropped) is matched to one of his bones
  by bone_map.json; his bones the map leaves out keep their rest under
  their parent, except his forearm twist bones (below).
- Rest poses. Mixamo's clips are made on its T-posed skeleton; the
  reference for that is the X Bot's bind pose (build/mixamo/Soccer_Game_Pack/
  files/X Bot.fbx, which clips.json names). His file rests in his idle
  pose (arms down). Each pair of bones is lined up by a whole frame, not
  just a direction: the way the bone points (at the bone the map's `aim`
  names) and a second direction that fixes its roll (the map's `roll`):
  the character's left for the spine, legs and feet, up for the
  collarbones, the palm's width (index knuckle to little-finger knuckle)
  for the arm, hand and fingers, the palm's normal for the thumb. So a
  palm that faces down in Mixamo's T-pose faces down on him too, and his
  forearm turns with his hand instead of twisting the wrist.
- Every frame, each Mixamo bone's turn away from its rest (in the world)
  is given to his matching bone, from his lined-up rest; his bones' own
  turns, relative to their parents, are worked out from those. His forearm
  twist bones take their share of the hand's twist about the forearm (the
  map's `twist`), so the sleeve twists along the forearm.
- A clip may be trimmed (`trim`) or, for a cycle like a run, repeated
  (`loops`), its hips carried on by what one cycle covers.
- Root motion stays on his hips, as translation: Mixamo's hips' travel is
  scaled by his leg length to Mixamo's (hip to ankle), starting over the
  origin facing +Z (the film places each clip where its slot starts).
- Feet on the ground: his legs aren't Mixamo's in proportion, so the same
  turns leave his soles a little above or below where Mixamo's are. Each
  frame his hips are raised or lowered so his lower sole is as high as
  Mixamo's (scaled), fully while Mixamo's is near the ground and fading to
  the clip's usual correction when it's well up (a dive), smoothed over a
  few frames.
- Both skeletons are compared in the glTF frame (Y up, metres, facing +Z).

Needs only Blender (its FBX importer) and numpy. The animation is
Mixamo's (mixamo.com, Adobe); each animation's extras name its source.
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
FPS = 30.0


def log(*a):
    print('[retarget]', *a, flush=True)


def parse_args():
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else sys.argv[1:]
    if len(argv) < 2:
        raise SystemExit(__doc__)
    o = {'config': argv[0], 'out': argv[1], 'candidates': False, 'only': None, 'report': None}
    i = 2
    while i < len(argv):
        a = argv[i]
        if a == '--candidates':
            o['candidates'] = True; i += 1
        elif a == '--only':
            o['only'] = argv[i + 1].split(','); i += 2
        elif a == '--report':
            o['report'] = argv[i + 1]; i += 2
        else:
            raise SystemExit('unknown option ' + a)
    return o


base = lambda name: re.sub(r'_\d+$', '', name)  # 'CC_Base_Hip_01' -> 'CC_Base_Hip'
plain = lambda name: name.split(':')[-1]  # 'mixamorig:Hips' -> 'Hips'


# ---- His skeleton, from the .glb's JSON (its nodes aren't compressed) ----

def read_gltf_json(path):
    with open(path, 'rb') as f:
        blob = f.read()
    magic, _version, _length = struct.unpack_from('<III', blob, 0)
    if magic != 0x46546C67:
        raise SystemExit(path + ' is not a .glb')
    size, _kind = struct.unpack_from('<II', blob, 12)
    return json.loads(blob[20:20 + size])


def trs(node):
    if 'matrix' in node:
        m = Matrix([node['matrix'][i::4] for i in range(4)])
        t, r, s = m.decompose()
        return t, r, s
    t = Vector(node.get('translation', [0, 0, 0]))
    x, y, z, w = node.get('rotation', [0, 0, 0, 1])
    return t, Quaternion((w, x, y, z)), Vector(node.get('scale', [1, 1, 1]))


def soldier_skeleton(path):
    g = read_gltf_json(path)
    nodes = g['nodes']
    parent = {}
    for i, n in enumerate(nodes):
        for c in n.get('children', []):
            parent[c] = i
    local = {i: trs(n) for i, n in enumerate(nodes)}
    world = {}

    def W(i):
        if i not in world:
            t, r, s = local[i]
            m = Matrix.LocRotScale(t, r, s)
            world[i] = (W(parent[i]) @ m) if i in parent else m
        return world[i]

    bones = {base(n['name']): i for i, n in enumerate(nodes) if n.get('name', '').startswith('CC_Base_')}
    depth = lambda i: 0 if i not in parent else 1 + depth(parent[i])
    order = sorted(bones.values(), key=depth)
    return {'nodes': nodes, 'parent': parent, 'local': local, 'W': W, 'bones': bones, 'order': order}


def rot_of(m):
    return m.to_3x3().normalized().to_quaternion().normalized()


# ---- Mixamo ----

def load_fbx(path):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.fbx(filepath=path, automatic_bone_orientation=False, ignore_leaf_bones=True)
    arms = [o for o in bpy.context.scene.objects if o.type == 'ARMATURE']
    if not arms:
        raise SystemExit(path + ': no skeleton')
    return arms[0]


def rest_of(arm):
    """Each bone's rest (glTF frame) by its plain name."""
    return {plain(b.name): B2G @ arm.matrix_world @ b.matrix_local for b in arm.data.bones}


# ---- Lining up the two rests ----

def frame(aim, second):
    """A rotation whose X is `aim` and whose XY plane holds `second`."""
    x = aim.normalized()
    z = x.cross(second)
    if z.length < 1e-6:
        return None
    z.normalize()
    y = z.cross(x)
    return Matrix((x, y, z)).transposed()  # columns x, y, z


def roll_vector(kind, side, pos):
    """The second direction for a bone, from one skeleton's rest joint
    positions (pos: Mixamo names -> Vector), as named in bone_map's roll."""
    if kind == 'left':
        return Vector((1, 0, 0))
    if kind == 'up':
        return Vector((0, 1, 0))
    if kind == 'forward':
        return Vector((0, 0, 1))
    hand = pos[side + 'Hand']
    across = pos[side + 'HandPinky1'] - pos[side + 'HandIndex1']  # the palm's width
    if kind == 'palm':
        return across
    if kind == 'palm_normal':
        along = pos[side + 'HandMiddle1'] - hand
        return along.cross(across)
    raise SystemExit('unknown roll ' + kind)


def line_up(bmap, mapped, src_rest, tgt_pos_by_m, tgt_rest_rot):
    """For each mapped Mixamo bone m: the turn taking his bone's rest frame
    to Mixamo's (both by aim + roll), and his lined-up rest turn."""
    aims, rolls = bmap['aim'], bmap['roll']
    src_pos = {m: src_rest[m].to_translation() for m in src_rest}
    align = {}
    for m in mapped:
        a = aims.get(m)
        if a not in mapped:
            continue
        side = 'Left' if m.startswith('Left') else 'Right' if m.startswith('Right') else ''
        kind = next(v for k, v in rolls.items() if k != 'about' and re.fullmatch(k, m))
        if kind == 'world':
            align[m] = Quaternion()
            continue
        fs = frame(src_pos[a] - src_pos[m], roll_vector(kind, side, src_pos))
        ft = frame(tgt_pos_by_m[a] - tgt_pos_by_m[m], roll_vector(kind, side, tgt_pos_by_m))
        if fs is None or ft is None:
            raise SystemExit('cannot line up ' + m)
        align[m] = (fs @ ft.transposed()).to_quaternion()
    return align


# ---- Reading one clip ----

def sole_points(pos_foot, pos_toe, foot_rot, toe_rot, ground=0.0):
    """Heel and toe-tip points (fixed to the foot and toe bones) from a rest
    skeleton: under the ankle a little back, and ahead of the toe joint."""
    heel = Vector((pos_foot.x, ground, pos_foot.z - 0.03))
    tip = Vector((pos_toe.x, ground, pos_toe.z + 0.07))
    return (foot_rot.inverted() @ (heel - pos_foot), toe_rot.inverted() @ (tip - pos_toe))


def main():
    o = parse_args()
    cfg = json.load(open(o['config']))
    root = os.path.dirname(os.path.abspath(o['config']))
    proj = os.path.normpath(os.path.join(root, cfg.get('project', '../..')))
    src_dir = os.path.join(proj, cfg['source'])
    bmap = json.load(open(os.path.join(HERE, 'bone_map.json')))
    names = bmap['bones']
    twists = {k: v for k, v in bmap['twist'].items() if k != 'about'}
    sk = soldier_skeleton(os.path.join(proj, cfg['soldier']))
    nodes, parent, W, local = sk['nodes'], sk['parent'], sk['W'], sk['local']
    bones = sk['bones']

    # Mixamo's rest: the X Bot's bind pose.
    xbot = load_fbx(os.path.join(src_dir, cfg['rest']))
    src_rest = {m: r for m, r in rest_of(xbot).items() if m in names}
    mapped = {m: names[m] for m in names if m in src_rest and names[m] in bones}
    tgt_rest = {b: W(i) for b, i in bones.items()}
    tgt_pos_by_m = {m: tgt_rest[b].to_translation() for m, b in mapped.items()}
    tgt_rot = {b: rot_of(tgt_rest[b]) for b in tgt_rest}
    align = line_up(bmap, mapped, src_rest, tgt_pos_by_m, tgt_rot)
    for m in mapped:
        if m not in align:  # an end bone turns as its parent did
            p = xbot.data.bones['mixamorig:' + m].parent
            align[m] = align.get(plain(p.name), Quaternion()) if p else Quaternion()
    aligned = {mapped[m]: align[m] @ tgt_rot[mapped[m]] for m in mapped}
    src_rest_rot = {m: rot_of(src_rest[m]) for m in mapped}

    # Leg length, his to Mixamo's (hip joint to ankle, both legs).
    def leg(pos, up, lo, ft):
        return sum((pos(s + up) - pos(s + lo)).length + (pos(s + lo) - pos(s + ft)).length for s in ('Left', 'Right')) / 2
    k = leg(lambda n: tgt_pos_by_m[n], 'UpLeg', 'Leg', 'Foot') / leg(lambda n: src_rest[n].to_translation(), 'UpLeg', 'Leg', 'Foot')
    log('his legs to Mixamo\'s:', round(k, 4))
    hip_i = bones['CC_Base_Hip']
    hip_rest = tgt_rest['CC_Base_Hip'].to_translation()
    src_hip_rest = src_rest['Hips'].to_translation()
    hip_parent_inv = W(parent[hip_i]).inverted()

    # Sole points, both skeletons, fixed to their foot and toe bones.
    soles_src, soles_tgt = {}, {}
    for s, S in (('Left', 'L'), ('Right', 'R')):
        soles_src[s] = sole_points(src_rest[s + 'Foot'].to_translation(), src_rest[s + 'ToeBase'].to_translation(),
                                   src_rest_rot[s + 'Foot'], src_rest_rot[s + 'ToeBase'])
        soles_tgt[s] = sole_points(tgt_pos_by_m[s + 'Foot'], tgt_pos_by_m[s + 'ToeBase'],
                                   tgt_rot['CC_Base_%s_Foot' % S], tgt_rot['CC_Base_%s_ToeBase' % S])

    tw = {bones[t]: (bones[d], s) for t, (d, s) in twists.items() if t in bones and d in bones}
    animated = sorted(set(bones[b] for b in mapped.values()) | set(tw))
    want_i = {bones[b]: m for m, b in mapped.items()}
    rest_q = {i: local[i][1] for i in sk['order']}
    rest_t = {i: local[i][0] for i in sk['order']}

    jobs = list(cfg['clips'])
    if o['candidates']:
        jobs += cfg.get('candidates', [])
    if o['only']:
        jobs = [j for j in jobs if j['name'] in o['only']]
    anims, report = [], {}
    for job in jobs:
        arm = load_fbx(os.path.join(src_dir, job['file']))
        if not arm.animation_data or not arm.animation_data.action:
            raise SystemExit(job['file'] + ': no animation')
        pb = {plain(p.name): p for p in arm.pose.bones}
        miss = [m for m in mapped if m not in pb]
        if miss:
            log(job['name'], 'missing bones (left at rest):', ', '.join(miss))
        own_rest = rest_of(arm)
        drift = max((own_rest[m].to_translation() - src_rest[m].to_translation()).length for m in mapped if m in own_rest)
        if drift > 0.05:
            log(job['name'], 'warning: its skeleton is not the X Bot\'s (%.3f m apart)' % drift)
        scene = bpy.context.scene
        a0, a1 = arm.animation_data.action.frame_range
        frames = list(range(int(round(a0)), int(round(a1)) + 1))
        if job.get('trim'):
            t0, t1 = job['trim']
            frames = [f for f in frames if t0 - 1e-6 <= (f - frames[0]) / FPS <= t1 + 1e-6]
        # A cycle (a run) played `loops` times over, carrying him on: its last
        # frame is its first, so each repeat starts one frame in, its hips
        # moved on by what one cycle carries them.
        loops = int(job.get('loops', 1))
        step = Vector((0, 0, 0))
        if loops > 1:
            ends = []
            for f in (frames[0], frames[-1]):
                scene.frame_set(f)
                ends.append((B2G @ arm.matrix_world @ pb['Hips'].matrix).to_translation())
            step = Vector((ends[1].x - ends[0].x, 0, ends[1].z - ends[0].z))
        seq = [(f, 0) for f in frames] + [(f, n) for n in range(1, loops) for f in frames[1:]]
        rot_keys = {i: [] for i in animated}
        hip_raw, src_sole, tgt_sole, facing, hands = [], [], [], [], []
        checks = {'wristTwist': [0.0, 0.0], 'kneeBackwards': 0, 'handInBody': 0, 'elbowBackwards': 0}
        for f, lap in seq:
            scene.frame_set(f)
            now = {m: B2G @ arm.matrix_world @ pb[m].matrix for m in mapped if m in pb}
            wrot = {}
            for i in sk['order']:
                p = parent.get(i)
                pw = wrot[p] if p in wrot else rot_of(W(p))
                m = want_i.get(i)
                if m in now:
                    wrot[i] = rot_of(now[m]) @ src_rest_rot[m].inverted() @ aligned[base(nodes[i]['name'])]
                else:
                    wrot[i] = pw @ rest_q[i]
            # Twist bones: their share of the hand's twist about the forearm.
            for i, (drv, share) in tw.items():
                fore = parent[drv]
                rel = wrot[fore].inverted() @ wrot[drv]
                delta = rel @ rest_q[drv].inverted()
                axis = rest_t[drv].normalized()
                v = Vector((delta.x, delta.y, delta.z))
                proj = axis * v.dot(axis)
                twist = Quaternion((delta.w, proj.x, proj.y, proj.z))
                twist = twist.normalized() if twist.magnitude > 1e-9 else Quaternion()
                side = 0 if '_L_' in nodes[i]['name'] else 1
                checks['wristTwist'][side] = max(checks['wristTwist'][side], math.degrees(2 * math.acos(min(1.0, abs(twist.w)))))
                chain, j = Quaternion(), i
                while j != fore:
                    chain = rest_q[j] @ chain
                    j = parent[j]
                wrot[i] = wrot[fore] @ Quaternion().slerp(twist, share) @ chain
                for c in sk['order']:
                    if parent.get(c) == i and c not in want_i:
                        wrot[c] = wrot[i] @ rest_q[c]
            for i in animated:
                lq = (wrot[parent[i]] if parent[i] in wrot else rot_of(W(parent[i]))).inverted() @ wrot[i]
                rot_keys[i].append(lq.normalized())
            hp = now['Hips'].to_translation() + step * lap
            hip_raw.append(hp)
            # Soles: Mixamo's, and his (from his hips' plain scaled place).
            src_sole.append(min((now[s + p].to_translation() + rot_of(now[s + p]) @ v).y
                                for s in ('Left', 'Right') for p, v in zip(('Foot', 'ToeBase'), soles_src[s])))
            # His joints' places by his own chain (rest offsets, these turns).
            hip_w = Vector((hip_rest.x, hip_rest.y + k * (hp.y - src_hip_rest.y), hip_rest.z))
            pos = {hip_i: hip_w}
            for i in sk['order']:
                if i == hip_i:
                    continue
                p = parent[i]
                if p in pos:
                    sc = W(p).to_scale()
                    off = Vector((rest_t[i].x * sc.x, rest_t[i].y * sc.y, rest_t[i].z * sc.z))
                    pos[i] = pos[p] + wrot[p] @ off
            pts = []
            for s, S in (('Left', 'L'), ('Right', 'R')):
                fi, ti = bones['CC_Base_%s_Foot' % S], bones['CC_Base_%s_ToeBase' % S]
                pts += [(pos[fi] + wrot[fi] @ soles_tgt[s][0]).y, (pos[ti] + wrot[ti] @ soles_tgt[s][1]).y]
            tgt_sole.append(min(pts))
            lr = now['LeftUpLeg'].to_translation() - now['RightUpLeg'].to_translation()
            fwd = lr.cross(Vector((0, 1, 0)))
            facing.append(math.atan2(fwd.x, fwd.z))
            hands.append({s: [round(c, 3) for c in pos[bones['CC_Base_%s_Hand' % S]] - hip_w + Vector((0, hip_w.y, 0))]
                          for s, S in (('L', 'L'), ('R', 'R'))})
            # Checks: knees bending forwards, elbows bending backwards (both
            # against the bend Mixamo's own joint makes), a hand inside his
            # chest or belly.
            J = lambda n: pos[bones['CC_Base_' + n]]
            M = lambda n: now[n].to_translation()
            for S, s in (('L', 'Left'), ('R', 'Right')):
                for a, b, c, ma, mb, mc, key in (('%s_Thigh', '%s_Calf', '%s_Foot', 'UpLeg', 'Leg', 'Foot', 'kneeBackwards'),
                                                 ('%s_Upperarm', '%s_Forearm', '%s_Hand', 'Arm', 'ForeArm', 'Hand', 'elbowBackwards')):
                    n_his = (J(b % S) - J(a % S)).cross(J(c % S) - J(b % S))
                    n_mx = (M(s + mb) - M(s + ma)).cross(M(s + mc) - M(s + mb))
                    if n_his.length > 0.01 and n_mx.length > 0.01 and n_his.normalized().dot(n_mx.normalized()) < 0:
                        checks[key] += 1
                h = J(S + '_Hand')
                for lo, hi in (('Waist', 'Spine02'), ('Spine02', 'NeckTwist01')):
                    A, B = J(lo), J(hi)
                    u = max(0.0, min(1.0, (h - A).dot(B - A) / (B - A).length_squared))
                    if (A + (B - A) * u - h).length < 0.09:
                        checks['handInBody'] += 1

        # Feet on the ground (see the top).
        corr = [k * s - t for s, t in zip(src_sole, tgt_sole)]
        wts = [min(1.0, max(0.0, (0.25 - s) / (0.25 - 0.08))) for s in src_sole]
        contact = [c for c, w in zip(corr, wts) if w >= 1.0]
        usual = float(np.median(contact)) if contact else float(np.median(corr))
        if job.get('ground', True):
            mixed = [w * c + (1 - w) * usual for c, w in zip(corr, wts)]
            n = len(mixed)
            lift = [sum(mixed[max(0, j - 2):j + 3]) / len(mixed[max(0, j - 2):j + 3]) for j in range(n)]
        else:
            lift = [0.0] * len(corr)
        start = hip_raw[0]
        hip_keys = []
        for hp, up in zip(hip_raw, lift):
            target = Vector((hip_rest.x + k * (hp.x - start.x), hip_rest.y + k * (hp.y - src_hip_rest.y) + up,
                             hip_rest.z + k * (hp.z - start.z)))
            hip_keys.append(hip_parent_inv @ target)
        for i in animated:
            ks = rot_keys[i]
            for j in range(1, len(ks)):
                if ks[j].dot(ks[j - 1]) < 0:
                    ks[j] = -ks[j]
        times = [j / FPS for j in range(len(seq))]
        end = hip_raw[-1]
        info = {
            'source': job['file'], 'trim': job.get('trim'), 'loops': loops, 'duration': round(times[-1], 4), 'frames': len(times),
            'travel': [round(k * (end.x - start.x), 3), round(k * (end.z - start.z), 3)],
            'facing': [round(math.degrees(facing[0]), 1), round(math.degrees(facing[-1]), 1)],
            'groundLift': {'usual': round(usual, 3), 'min': round(min(lift), 3), 'max': round(max(lift), 3)},
            'checks': dict(checks, wristTwist=[round(v, 1) for v in checks['wristTwist']]),
        }
        anims.append((job['name'], times, rot_keys, hip_keys, info))
        report[job['name']] = dict(info, soleSrc=[round(k * s, 3) for s in src_sole], soleHis=[round(t + u, 3) for t, u in zip(tgt_sole, lift)],
                                   hips=[[round(k * (hp.x - start.x), 3), round(k * (hp.z - start.z), 3)] for hp in hip_raw],
                                   hipY=[round(hip_rest.y + k * (hp.y - src_hip_rest.y) + u, 3) for hp, u in zip(hip_raw, lift)],
                                   facingAll=[round(math.degrees(a), 1) for a in facing], hands=hands)
        log('%-24s %3d frames %.2fs travel %s facing %s lift %s checks %s' % (job['name'], len(times), times[-1], info['travel'], info['facing'], info['groundLift'], info['checks']))
    write_glb(o['out'], nodes, animated, hip_i, anims)
    log('wrote', o['out'], '-', len(anims), 'clips,', len(animated), 'bones')
    if o['report']:
        json.dump(report, open(o['report'], 'w'))


def write_glb(path, nodes, animated, hip_i, anims):
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

    animations = []
    for name, times, rot_keys, hip_keys, info in anims:
        t = add(times, 'SCALAR', len(times), True)
        samplers, channels = [], []
        for i in animated:
            q = [c for r in rot_keys[i] for c in (r.x, r.y, r.z, r.w)]
            samplers.append({'input': t, 'output': add(q, 'VEC4', len(times)), 'interpolation': 'LINEAR'})
            channels.append({'sampler': len(samplers) - 1, 'target': {'node': index[i], 'path': 'rotation'}})
        p = [c for v in hip_keys for c in (v.x, v.y, v.z)]
        samplers.append({'input': t, 'output': add(p, 'VEC3', len(times)), 'interpolation': 'LINEAR'})
        channels.append({'sampler': len(samplers) - 1, 'target': {'node': index[hip_i], 'path': 'translation'}})
        animations.append({'name': name, 'samplers': samplers, 'channels': channels,
                           'extras': dict(info, credit='Animation from Mixamo (mixamo.com, Adobe)')})
    g = {
        'asset': {
            'version': '2.0', 'generator': 'Project Fish tools/cinematic/retarget_mixamo.py',
            'copyright': 'Animations from Mixamo (mixamo.com, Adobe), retargeted onto the soldier',
        },
        'scene': 0, 'scenes': [{'nodes': list(range(len(out_nodes)))}], 'nodes': out_nodes,
        'animations': animations,
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
