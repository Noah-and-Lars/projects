"""Turns the downloaded, animated Browning Hi-Power with its own arms into the
game's fifth gun.

The model is "FPS Character Animation Pack Pistol" by Cristian David Duque
Camacho (CC BY 4.0, see README.md, Credits):
https://sketchfab.com/3d-models/fps-character-animation-pack-pistol-e2815a5bea3a4e3895b3c29a2586e671
Download its glTF version and unzip it so that the folder holds scene.gltf
and scene.bin, with its textures either in textures/ (as scene.gltf names
them) or loose beside scene.gltf. Then, from the project-fish folder:

    blender --background --python tools/blender/convert_hipistol.py -- build/hipistol-source build/hipistol-raw.glb

(npm run build-hipistol does this and compresses the result into
assets/hipistol.glb.)

The download calls the gun "HIpistol": by its shape it's a Browning
Hi-Power (a ring hammer, the slide's front third stepped down narrower and
lower, a single thumb safety at the back of the frame on the left, a round
magazine catch behind the trigger guard, a short tang and no grip safety,
one screw in each grip panel). Like the FN 502 (convert_fn502.py) it comes
with its maker's own arms (black gloves and black camouflage sleeves) and
animations, and the game plays its maker's clips as they are. It's made of
two skeletons: the gun's (frame, slide, hammer, magazine, the round in it,
trigger, each with a control bone above it) and the arms' (a Rigify body:
spine, shoulders, arms, hands with bones in the palm, fingers), each with
its own skin, and eleven animations that move both: the gun's skeleton is
moved as a whole to follow the hand. This script keeps the skeletons (as one
rig), the skinning and the keys, and only:
- Puts both skeletons on one rig, its root at the eye: the arms' head bone
  (EYE_BONE), where it is at the start of the idle clip. (There's no camera
  in the file. The arms' camera bone sits 50 cm in front of the head,
  inside the gun, so it isn't the eye; the head bone is, and in the aimed
  idle clip the sights line up 9 mm under it, straight ahead.) Everything is
  turned into gun space (metres, +X right, +Y up, -Z forward), the bones'
  frames too.
- Makes it real size: the download is 4.0 times bigger than a Hi-Power
  (197 mm long, GUN_LENGTH), so everything (gun, arms, animation) is scaled
  about the eye by as much. From the eye this changes nothing: the whole
  picture shrinks about it.
- The two skeletons' roots (and the gun's root bone) are scaled 1.5 times
  in the download: those scales are folded into their bones' places, so
  every bone is unscaled. Where every clip holds a bone still at the same
  place, that's its rest. The few bones the clips do scale (the arms
  stretch a little, and a finger in the reload) keep their scale keys.
- Keeps every clip with every key as made (see CLIPS: idle, aimIdle, walk,
  aimWalk, run, shoot, aimShoot, reload, draw, hide). Every clip is given
  every bone any clip moves (a bone a clip leaves alone is held where it
  rests), so each sets the whole pose. Nothing is added, retimed or
  re-posed. The download's Change clip (a quick raise, the reverse of Hold)
  is left out: the game draws the gun with its Equip clip.
- Leaves out the bones no point is weighted to and that hold none that are
  (the legs, the spine's own, the weapon and camera bones, the round's
  control bone).
- Adds a node on the gun's frame bone, `gun`, turned so that in the aimed
  idle pose (where the gun is held straight) its space is gun space moved
  to the frame bone: the game measures the gun's points in it and hangs the
  muzzle flash on it.
- Textures: 2048 px WebP (the gun's are 2048 already, the gloves' and
  sleeves' 4096). The metal/roughness textures keep the ambient occlusion
  in their red, as the download's gun does. The download's materials use
  KHR_materials_specular, a texture of how strongly the non-metal parts
  reflect (Sketchfab's specular F0, 0.5 the usual: SKETCHFAB_F0). Metal
  parts ignore it and on the rest it hardly changes, so each material
  keeps its average there as a single specularFactor: the sleeves have the
  usual all over (so none is kept), the gun's few non-metal parts (the grip
  panels) hardly any, and the gloves have none. The textures carry no maker's marks or logos to rub
  off.
- Keeps who made it and its license in the file (asset.copyright).
- Names the parts, bones, materials and animations plainly.

The game's constants for this gun (MODEL_HIPISTOL in src/viewmodel/
hipistol.js) are printed at the end (HIPISTOL ...), measured from the
result.
"""

import json
import math
import os
import re
import sys
import time

import bpy
import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import log  # noqa: E402
from rigged_gltf import (Writer, clip_pose, cut, inside, matrix_quat, node_matrix, quat_matrix,  # noqa: E402
                         read_gltf, sample, skin, trs_matrix, webp_bytes, write_clips, write_mesh)
from texture_edit import image_array, store  # noqa: E402

ARGS = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else sys.argv[1:]
SOURCE, OUT_GLB = ARGS[0], ARGS[1]

# --- Placing it ---------------------------------------------------------------
# A Browning Hi-Power is 197 mm long, muzzle to the back of the hammer.
GUN_LENGTH = 0.197
# The eye: the arms' head bone, at the start of the idle clip.
EYE_BONE = 'DEF-spine.006'
EYE_CLIP = 'idle'
# The download's world is Y up and the gun points along +Z, its right
# towards -X: to ours (+X right, +Y up, -Z forward) is a half turn about Y.
R0 = np.diag([-1.0, 1.0, -1.0])
# Where the ejection port's middle is: this far (metres) in front of the rear
# sight (from the model: the opening is 79-107 mm from the back of the gun,
# the rear sight's back face 31 mm).
PORT_AHEAD = 0.062

# The clips: ours, and the download's animation each is (all of it).
PREFIX = 'RIG_UE5_Comando_'
CLIPS = [
    ('idle', 'Idle'), ('aimIdle', 'Aim_Idle'),
    ('walk', 'Walk'), ('aimWalk', 'Aim_Walk'), ('run', 'Run'),
    ('shoot', 'Fire'), ('aimShoot', 'Aim_Fire'),
    ('reload', 'Reload'),
    ('draw', 'Equip'), ('hide', 'Hold'),
]

# Bones (download names, less their numbered endings) and ours; the rest are
# named after theirs (see plain).
BONES = {
    'Armature': 'gun_base', 'Root': 'gun_root', 'DEF_Cuerpo': 'frame_j',
    'Ctrl_Corredera': 'slide_ctrl', 'DEF_Corredera': 'slide_j', 'Ctrl_Martillo': 'hammer_ctrl', 'DEF_Martillo': 'hammer_j',
    'Ctrl_Cargador': 'mag_ctrl', 'DEF_Cargador': 'mag_j', 'DEF_Bala': 'round_j', 'Ctrl_Bala': 'round_ctrl',
    'Ctrl_Gatillo': 'trigger_ctrl', 'DEF_Gatillo': 'trigger_j',
    'SK_Comando': 'arms_base', 'root': 'body',
}
FINGERS = {'f_index': 'index', 'f_middle': 'middle', 'f_ring': 'ring', 'f_pinky': 'little', 'thumb': 'thumb', 'palm': 'palm'}


def plain(raw):
    """Our name for a download bone (its name less its numbered ending)."""
    if raw in BONES:
        return BONES[raw]
    m = re.fullmatch(r'DEF-(\w+)\.(\d\d)\.([LR])', raw)  # fingers, thumbs, palm bones
    if m and m.group(1) in FINGERS:
        return f'{FINGERS[m.group(1)]}{int(m.group(2))}_{m.group(3)}'
    m = re.fullmatch(r'DEF-(shoulder|upper_arm|forearm|hand|breast)\.([LR])(\.001)?', raw)
    if m:
        return f'{m.group(1).replace("_", "")}{"2" if m.group(3) else ""}_{m.group(2)}'
    # (The rest: the Rigify body's mechanism bones, lower case with no dots,
    # which three.js leaves out of names, and the side last.)
    m = re.fullmatch(r'(.*?)\.([LR])((?:\.\d+)?)', raw)
    base, side = (m.group(1) + m.group(3), '_' + m.group(2)) if m else (raw, '')
    return re.sub(r'[^a-z0-9]+', '_', base.lower()).strip('_') + side


MESHES = {'Pistol_HIpistol_0': 'gun', 'SKM_Comando_M_Gloves_Black_0': 'gloves', 'SKM_Comando_M_Shirt_BlackCamo2_0': 'sleeves'}
MATERIALS = {'HIpistol': 'hipistol_gun', 'M_Gloves_Black': 'hipistol_gloves', 'M_Shirt_BlackCamo2': 'hipistol_sleeves'}

# --- Textures -------------------------------------------------------------------
SIZE = 2048
WEBP_QUALITY = 90
# The specular F0 Sketchfab takes as the usual one (see textures), and a
# specularFactor this close to 1 is left out.
SKETCHFAB_F0 = 0.5
SPECULAR_KEEP = 0.9

EXTRAS = {
    'title': 'FPS Character Animation Pack Pistol',
    'source': 'https://sketchfab.com/3d-models/fps-character-animation-pack-pistol-e2815a5bea3a4e3895b3c29a2586e671',
    'author': 'Cristian David Duque Camacho (https://sketchfab.com/DuqueCD7)',
    'license': 'CC-BY-4.0 (http://creativecommons.org/licenses/by/4.0/)',
}

COPYRIGHT = ('This work is based on "FPS Character Animation Pack Pistol" '
             '(https://sketchfab.com/3d-models/fps-character-animation-pack-pistol-e2815a5bea3a4e3895b3c29a2586e671) '
             'by Cristian David Duque Camacho (https://sketchfab.com/DuqueCD7) licensed under CC-BY-4.0 '
             '(http://creativecommons.org/licenses/by/4.0/). '
             'Changed for Project Fish: both skeletons put on one rig, turned, scaled to real size and placed for '
             'the game, its clips as made (one left out), materials\' specular textures made single values, '
             'textures shrunk and stored as WebP, compressed.')


# --- A rig with scale -----------------------------------------------------------
# (As rigged_gltf.Rig, but its bones may be scaled too: this download's arms
# stretch a little.)

class Rig:
    def __init__(self):
        self.names, self.parents, self.t, self.r, self.s, self.ibm = [], [], [], [], [], []

    def index(self, name):
        return self.names.index(name)

    def world(self, pose=None):
        out = []
        for k in range(len(self.names)):
            t, r, s = self.t[k], self.r[k], self.s[k]
            if pose and k in pose:
                t = pose[k].get('translation', t)
                r = pose[k].get('rotation', r)
                s = pose[k].get('scale', s)
            m = trs_matrix(t, r, s)
            p = self.parents[k]
            out.append(m if p is None else out[p] @ m)
        return out


def write_rig(w, root_name, rig, frame_bone, gun_turn):
    """As rigged_gltf.write_rig, with the bones' scales."""
    g = w.g
    g['nodes'].append({'name': root_name, 'children': []})
    first = 1
    for k, name in enumerate(rig.names):
        node = {'name': name}
        if np.abs(rig.t[k]).max() > 0:
            node['translation'] = [float(x) for x in rig.t[k]]
        if np.abs(rig.r[k] - [0, 0, 0, 1]).max() > 0:
            node['rotation'] = [float(x) for x in rig.r[k] / np.linalg.norm(rig.r[k])]
        if np.abs(rig.s[k] - 1).max() > 0:
            node['scale'] = [float(x) for x in rig.s[k]]
        g['nodes'].append(node)
    for k, p in enumerate(rig.parents):
        if p is None:
            g['nodes'][0]['children'].append(first + k)
        else:
            g['nodes'][first + p].setdefault('children', []).append(first + k)
    roots = [k for k, p in enumerate(rig.parents) if p is None]
    g['skins'].append({'name': f'{root_name}_rig', 'joints': list(range(first, first + len(rig.names))),
                       'inverseBindMatrices': w.accessor(np.array([m.T.reshape(-1) for m in rig.ibm]), 'MAT4')})
    if len(roots) == 1:
        g['skins'][-1]['skeleton'] = first + roots[0]
    g['nodes'].append({'name': 'gun', 'rotation': [float(x) for x in gun_turn]})
    g['nodes'][first + rig.index(frame_bone)].setdefault('children', []).append(len(g['nodes']) - 1)
    return first


# --- Reading the download -------------------------------------------------------

def convert(g, accessor):
    nodes = g['nodes']
    parent_of = {c: i for i, n in enumerate(nodes) for c in n.get('children', [])}

    def stem(i):
        raw = nodes[i]['name']
        return raw.rsplit('_', 1)[0] if raw.rsplit('_', 1)[-1].isdigit() else raw

    stems = [stem(i) for i in range(len(nodes))]
    by_stem = {s: i for i, s in enumerate(stems)}

    def world_of(i):
        m = node_matrix(nodes[i])
        while i in parent_of:
            i = parent_of[i]
            m = node_matrix(nodes[i]) @ m
        return m

    # The animations: {ours: {(node, path): (times, values)}}.
    anims = {}
    for anim in g['animations']:
        tracks = {}
        for ch in anim['channels']:
            s = anim['samplers'][ch['sampler']]
            assert s.get('interpolation', 'LINEAR') == 'LINEAR'
            tracks[(ch['target']['node'], ch['target']['path'])] = (accessor(s['input'])[:, 0].astype(np.float64),
                                                                     accessor(s['output']).astype(np.float64))
        anims[anim['name'].split('|')[-1]] = tracks
    for _, source in CLIPS:
        assert PREFIX + source in anims, f'no {source} animation'
    sources = {ours: anims[PREFIX + source] for ours, source in CLIPS}

    # The download's own pose of every node at time t in a clip (for checks).
    def download_world(clip, t):
        tracks = sources[clip]
        out = {}

        def w(i):
            if i in out:
                return out[i]
            n = nodes[i]
            if 'matrix' in n:
                m = node_matrix(n)
            else:
                trs = {'translation': n.get('translation', [0, 0, 0]), 'rotation': n.get('rotation', [0, 0, 0, 1]),
                       'scale': n.get('scale', [1, 1, 1])}
                for path in trs:
                    if (i, path) in tracks:
                        trs[path] = sample(*tracks[(i, path)], t, path)
                m = trs_matrix(trs['translation'], trs['rotation'], trs['scale'])
            out[i] = m if i not in parent_of else w(parent_of[i]) @ m
            return out[i]
        return w

    # The meshes and their skins; the bones any point is weighted to.
    mesh_nodes = [i for i, n in enumerate(nodes) if 'mesh' in n]
    weighted = set()
    for i in mesh_nodes:
        prim = g['meshes'][nodes[i]['mesh']]['primitives']
        assert len(prim) == 1
        a = prim[0]['attributes']
        J, W = accessor(a['JOINTS_0']).astype(np.int64), accessor(a['WEIGHTS_0'])
        joints = np.array(g['skins'][nodes[i]['skin']]['joints'])
        weighted |= set(joints[J[W > 0]].tolist())

    # The two skeletons: the subtrees of the root node's children that hold
    # a weighted bone. A bone is kept if it or a bone under it is weighted;
    # empty nodes between (no transform, not moved) are passed over.
    root_node = parent_of[g['skins'][0]['joints'][0]]
    while stems[root_node] != 'RootNode':
        root_node = parent_of[root_node]
    W_A = world_of(root_node)  # the root node's space, A, to the download's world
    scale_a = np.cbrt(np.linalg.det(W_A[:3, :3]))
    assert np.allclose(W_A[:3, :3] / scale_a, np.eye(3), atol=1e-6), 'the root node is turned'
    animated = {node for tracks in anims.values() for node, _ in tracks}

    def holds_weight(i):
        return i in weighted or any(holds_weight(c) for c in nodes[i].get('children', []))

    def empty(i):
        n = nodes[i]
        return (i not in weighted and i not in animated and 'matrix' not in n
                and not any(k in n for k in ('translation', 'rotation', 'scale')))

    order, parent_bone = [], {}

    def visit(i, parent):
        if not holds_weight(i):
            return
        if 'mesh' in nodes[i]:
            return
        if empty(i):
            for c in nodes[i].get('children', []):
                visit(c, parent)
            return
        assert 'matrix' not in nodes[i], f'{nodes[i]["name"]} has a matrix'
        parent_bone[i] = parent
        order.append(i)
        for c in nodes[i].get('children', []):
            visit(c, i)

    for c in nodes[root_node]['children']:
        visit(c, None)
    kept = set(order)
    log(f'{len(order)} bones kept of {len(nodes)} nodes')

    # Rest: the download's, except where every clip holds a channel at one
    # value (then that).
    rest = {}
    for i in order:
        n = nodes[i]
        rest[i] = {'translation': np.array(n.get('translation', [0, 0, 0]), np.float64),
                   'rotation': np.array(n.get('rotation', [0, 0, 0, 1]), np.float64),
                   'scale': np.array(n.get('scale', [1, 1, 1]), np.float64)}
    tracks_of = {ours: {k: v for k, v in tr.items() if k[0] in kept} for ours, tr in sources.items()}
    channels = sorted(set(k for tr in tracks_of.values() for k in tr))
    for key in channels:
        if not all(key in tr for tr in tracks_of.values()):
            continue
        values = np.concatenate([tr[key][1] for tr in tracks_of.values()])
        if np.ptp(values, 0).max() < 1e-5 * max(1.0, np.abs(values).max()):
            rest[key[0]][key[1]] = values.mean(0)
            for tr in tracks_of.values():
                del tr[key]
    # (Scale keys that never leave the rest are dropped.)
    for tr in tracks_of.values():
        for key in [k for k in tr if k[1] == 'scale']:
            if np.abs(tr[key][1] - rest[key[0]]['scale']).max() < 1e-4:
                del tr[key]

    # Uniform scales on bones the clips don't scale are folded away (into the
    # places of the bones under them).
    baked = {}
    for i in order:
        s = rest[i]['scale']
        scaled = any((i, 'scale') in tr for tr in tracks_of.values())
        if not scaled and abs(s[0] - 1) > 1e-4 and np.ptp(s) < 1e-4 * s[0]:
            baked[i] = float(s.mean())
            rest[i]['scale'] = np.ones(3)
    log('folded scales', {nodes[i]['name']: round(s, 4) for i, s in baked.items()})
    above = {}  # the product of the folded scales over each bone (not its own)
    own = {}  # and with its own
    for i in order:
        p = parent_bone[i]
        above[i] = 1.0 if p is None else own[p]
        own[i] = above[i] * baked.get(i, 1.0)

    # The eye, in A.
    head = by_stem[EYE_BONE]
    eye = (np.linalg.inv(W_A) @ download_world(EYE_CLIP, 0.0)(head))[:3, 3]
    log(f'eye (download world): {np.round(W_A[:3, :3] @ eye, 4)}')

    # The gun's length in A, along its bore in the aimed idle pose (the frame
    # bone's own axis there), for the scale.
    gun_mesh = next(i for i in mesh_nodes if MESHES[g['meshes'][nodes[i]['mesh']]['name']] == 'gun')

    def skinned_download(i, w):
        m = g['meshes'][nodes[i]['mesh']]['primitives'][0]['attributes']
        sk = g['skins'][nodes[i]['skin']]
        ibm = accessor(sk['inverseBindMatrices']).reshape(-1, 4, 4).transpose(0, 2, 1).astype(np.float64)
        mats = np.array([w(j) @ b for j, b in zip(sk['joints'], ibm)])
        pos = accessor(m['POSITION']).astype(np.float64)
        J = accessor(m['JOINTS_0']).astype(np.int64)
        wt = accessor(m['WEIGHTS_0']).astype(np.float64)
        wt /= wt.sum(1, keepdims=True)
        p = np.c_[pos, np.ones(len(pos))]
        out = np.zeros((len(pos), 3))
        for k in range(4):
            out += wt[:, k:k + 1] * np.einsum('nij,nj->ni', mats[J[:, k]], p)[:, :3]
        return out

    w_aim = download_world('aimIdle', 0.0)
    gp = skinned_download(gun_mesh, w_aim)
    gp_a = (np.c_[gp, np.ones(len(gp))] @ np.linalg.inv(W_A).T)[:, :3]
    frame_aim = np.linalg.inv(W_A) @ w_aim(by_stem['DEF_Cuerpo'])
    bore = frame_aim[:3, :3] @ np.array([0, 1.0, 0]) / np.linalg.norm(frame_aim[:3, 1])  # its own +Y: forward
    length_a = float(np.ptp(gp_a @ bore))
    k = GUN_LENGTH / length_a
    log(f'gun: {length_a:.2f} units long, {length_a * scale_a / GUN_LENGTH:.2f} times real size')

    # A to ours: p' = k R0 (p - eye).
    L = np.eye(4)
    L[:3, :3] = R0 * k
    H = np.eye(4)
    H[:3, :3] = R0 * k
    H[:3, 3] = -k * (R0 @ eye)
    Hw = H @ np.linalg.inv(W_A)  # the download's world to ours

    def turn_q(q):
        return matrix_quat(R0 @ quat_matrix(q) @ R0.T)

    def place(i, t):
        """A bone's translation (download, in its parent's space) as ours."""
        t = np.asarray(t, np.float64)
        if parent_bone[i] is None:
            return k * (R0 @ (t - eye))
        return k * above[i] * (R0 @ t)

    rig = Rig()
    bone_of = {}
    for i in order:
        bone_of[i] = len(rig.names)
        rig.names.append(plain(stems[i]))
        rig.parents.append(None if parent_bone[i] is None else bone_of[parent_bone[i]])
        rig.t.append(place(i, rest[i]['translation']))
        rig.r.append(turn_q(rest[i]['rotation']))
        rig.s.append(np.abs(R0) @ rest[i]['scale'])
    assert len(set(rig.names)) == len(rig.names), 'two bones with one name'
    # Inverse bind matrices: L S(own) IBM Hw^-1 (any skin's, for each bone).
    rig.ibm = [None] * len(rig.names)
    for sk in g['skins']:
        ibm = accessor(sk['inverseBindMatrices']).reshape(-1, 4, 4).transpose(0, 2, 1).astype(np.float64)
        for j, m in zip(sk['joints'], ibm):
            if j in bone_of:
                S = np.diag([own[j]] * 3 + [1.0])
                rig.ibm[bone_of[j]] = L @ S @ m @ np.linalg.inv(Hw)
    for b, m in enumerate(rig.ibm):
        if m is None:  # (a bone that's in no skin: weighted to by nothing)
            rig.ibm[b] = np.linalg.inv(rig.world()[b])

    # The meshes, into our space (normals turned), their joints our bones.
    meshes = {}
    rot = Hw[:3, :3] / np.cbrt(np.linalg.det(Hw[:3, :3]))
    for i in mesh_nodes:
        m = g['meshes'][nodes[i]['mesh']]
        prim = m['primitives'][0]
        a = prim['attributes']
        sk = g['skins'][nodes[i]['skin']]
        lookup = np.array([bone_of.get(j, -1) for j in sk['joints']])
        J = accessor(a['JOINTS_0']).astype(np.int64)
        w = accessor(a['WEIGHTS_0']).astype(np.float64)
        w /= w.sum(1, keepdims=True)
        joints = lookup[J]
        assert (joints[w > 0] >= 0).all(), f'{m["name"]}: weighted to a left-out bone'
        joints[joints < 0] = 0
        pos = accessor(a['POSITION']).astype(np.float64)
        material = g['materials'][prim['material']]
        for slot in ('baseColorTexture', 'metallicRoughnessTexture'):
            assert material['pbrMetallicRoughness'].get(slot, {}).get('texCoord', 0) == 0
        meshes[MESHES[m['name']]] = {
            'position': (np.c_[pos, np.ones(len(pos))] @ Hw.T)[:, :3],
            'normal': accessor(a['NORMAL']).astype(np.float64) @ rot.T,
            'uv': accessor(a['TEXCOORD_0']).astype(np.float64), 'joints': joints, 'weights': w,
            'triangles': accessor(prim['indices']).astype(np.int64).reshape(-1, 3),
            'material': MATERIALS[material['name']], 'node': i,
        }

    # The clips, into our space. Every clip sets every bone any clip moves.
    clips = {}
    every = sorted(set(key for tr in tracks_of.values() for key in tr))
    for ours, source in CLIPS:
        tr = tracks_of[ours]
        duration = max(t[-1] for t, _ in sources[ours].values())
        out = {}
        for (i, path) in every:
            b = bone_of[i]
            if (i, path) in tr:
                times, values = tr[(i, path)]
            else:
                times, values = np.array([0.0, duration]), np.array([rest[i][path]] * 2)
            if path == 'rotation':
                values = np.array([turn_q(q) for q in values])
                for n in range(1, len(values)):
                    if values[n] @ values[n - 1] < 0:
                        values[n] = -values[n]
            elif path == 'translation':
                values = np.array([place(i, v) for v in values])
            else:
                values = values @ np.abs(R0).T
            out[(b, path)] = (times, values)
        out = cut(out, 0.0, duration)
        clips[ours] = {'tracks': out, 'duration': float(duration), 'source': source}
        log(f'{ours}: {duration:.3f} s from {source}, {sum(len(t) for t, _ in out.values())} keys on {len(out)} tracks')

    # Check: in several poses our rig puts every point where the download's
    # does, carried into our space.
    for clip, t in (('idle', 0.0), ('aimIdle', 1.0), ('reload', 1.0), ('draw', 0.7), ('run', 0.3)):
        w = download_world(clip, t)
        for name, mesh in meshes.items():
            expect = skinned_download(mesh['node'], w)
            expect = (np.c_[expect, np.ones(len(expect))] @ Hw.T)[:, :3]
            got = skin(rig, mesh, clip_pose(clips[clip], t))
            assert np.abs(expect - got).max() < 2e-5, f'{name} in {clip} at {t} s is off by {np.abs(expect - got).max()}'
    log('every point is where the download has it (5 poses checked)')
    for mesh in meshes.values():
        mesh.pop('node')
    return rig, meshes, clips, k


# --- Textures -------------------------------------------------------------------

def load(path, colour, size):
    image = bpy.data.images.load(os.path.abspath(path))
    image.colorspace_settings.name = 'sRGB' if colour else 'Non-Color'
    image.alpha_mode = 'STRAIGHT'
    if tuple(image.size) != (size, size):
        image.scale(size, size)
    return image


def new_image(name, a, colour=False):
    h, w = a.shape[:2]
    image = bpy.data.images.new(name, w, h, alpha=True)
    image.colorspace_settings.name = 'sRGB' if colour else 'Non-Color'
    store(image, a.astype(np.float32))
    return image


def textures(g):
    images = [inside(SOURCE, im['uri']) for im in g['images']]
    tex = lambda info: images[g['textures'][info['index']]['source']]  # noqa: E731
    out = {}
    for m in g['materials']:
        name = MATERIALS[m['name']]
        pbr = m['pbrMetallicRoughness']
        assert pbr.get('baseColorFactor', [1, 1, 1, 1]) == [1, 1, 1, 1] and pbr.get('roughnessFactor', 1) == 1
        colour = image_array(load(tex(pbr['baseColorTexture']), True, SIZE))
        colour[..., 3] = 1
        normal = image_array(load(tex(m['normalTexture']), False, SIZE))
        orm = image_array(load(tex(pbr['metallicRoughnessTexture']), False, SIZE))
        orm[..., 3] = 1
        occlusion = 'occlusionTexture' in m
        if occlusion:
            assert m['occlusionTexture']['index'] == pbr['metallicRoughnessTexture']['index'], 'occlusion apart'
        else:
            orm[..., 0] = 1
        metal = orm[..., 2] * pbr.get('metallicFactor', 1)
        info = {'occlusion': occlusion, 'metallicFactor': pbr.get('metallicFactor')}
        spec = m.get('extensions', {}).get('KHR_materials_specular')
        if spec:
            assert spec.get('specularColorFactor', [1, 1, 1]) == [1, 1, 1] and 'specularColorTexture' not in spec
            # (Its alpha is Sketchfab's specular F0, where 0.5 is the usual
            # 4 % a non-metal reflects: KHR_materials_specular's 1.)
            f0 = image_array(load(tex(spec['specularTexture']), False, SIZE))[..., 3] * spec.get('specularFactor', 1)
            strength = np.minimum(f0 / SKETCHFAB_F0, 1)
            dielectric = metal < 0.5
            factor = float(strength[dielectric].mean()) if dielectric.any() else 1.0
            log(f'{name}: specular {factor:.3f} on average over its non-metal parts ({dielectric.mean() * 100:.0f}% '
                f'of it; from {strength[dielectric].min():.2f} to {strength[dielectric].max():.2f})')
            if factor < SPECULAR_KEEP:
                info['specular'] = round(factor, 3)
        log(f'{name}: metalness {metal.mean():.3f} on average, roughness {orm[..., 1].mean():.3f}')
        folder = 'project-fish-hipistol'
        out[name] = {
            'colour': webp_bytes(new_image(f'{name}_colour', colour, True), f'{name}_colour', WEBP_QUALITY, folder),
            'normal': webp_bytes(new_image(f'{name}_normal', normal), f'{name}_normal', WEBP_QUALITY, folder),
            'orm': webp_bytes(new_image(f'{name}_orm', orm), f'{name}_orm', WEBP_QUALITY, folder),
            **info,
        }
    return out


# --- Writing the file -----------------------------------------------------------

def write_glb(rig, meshes, clips, images, gun_turn, path):
    w = Writer('Project Fish convert_hipistol.py', COPYRIGHT, EXTRAS)
    g = w.g
    first = write_rig(w, 'hipistol', rig, 'frame_j', gun_turn)
    g['samplers'].append({'magFilter': 9729, 'minFilter': 9987, 'wrapS': 10497, 'wrapT': 10497})
    material_index = {}
    for name, im in images.items():
        orm = w.texture(f'{name}_metal_rough', im['orm'], 0)
        pbr = {'baseColorTexture': w.texture(name, im['colour'], 0), 'metallicRoughnessTexture': orm}
        if im['metallicFactor'] is not None:
            pbr['metallicFactor'] = im['metallicFactor']
        m = {'name': name, 'doubleSided': True, 'pbrMetallicRoughness': pbr,
             'normalTexture': w.texture(f'{name}_normal', im['normal'], 0)}
        if im['occlusion']:
            m['occlusionTexture'] = dict(orm)
        if 'specular' in im:
            m['extensions'] = {'KHR_materials_specular': {'specularFactor': im['specular']}}
            if 'KHR_materials_specular' not in g['extensionsUsed']:
                g['extensionsUsed'].append('KHR_materials_specular')
        g['materials'].append(m)
        material_index[name] = len(g['materials']) - 1
    for name in ('gun', 'gloves', 'sleeves'):
        # (Named apart from the `gun` node.)
        write_mesh(w, f'hipistol_{name}', meshes[name], material_index[meshes[name]['material']])
    write_clips(w, clips, first)
    w.write(path)


# --- Measuring --------------------------------------------------------------------

def r4(v):
    return [round(float(x), 4) for x in v]


def measure(rig, meshes, clips):
    out = {}
    aim = clip_pose(clips['aimIdle'], 0)
    idle = clip_pose(clips['idle'], 0)
    world = rig.world(aim)
    fj, sj, mj, hl = rig.index('frame_j'), rig.index('slide_j'), rig.index('mag_j'), rig.index('hand_L')
    F = world[fj]
    assert abs(np.linalg.det(F[:3, :3]) - 1) < 1e-4, 'the frame bone is scaled'
    # The `gun` node: at the frame bone, turned so that in the aimed idle
    # pose it's lined up with gun space (the gun's held straight there).
    gun_turn = matrix_quat(F[:3, :3].T)
    out['frame'] = r4(F[:3, 3])
    to_own = np.linalg.inv(F)  # into the gun's own frame
    in_gun = lambda p: F[:3, :3] @ np.asarray(p, np.float64)  # noqa: E731  (the gun's own frame to the gun node's)
    # (How it's held at the hip: the frame there, and its turn from straight.)
    Fi = rig.world(idle)[fj]
    turn_hip = Fi[:3, :3] @ F[:3, :3].T
    out['hip_turn_deg'] = round(math.degrees(math.acos(np.clip((np.trace(turn_hip) - 1) / 2, -1, 1))), 1)

    gun = meshes['gun']
    gp = skin(rig, gun, aim)
    own = (np.c_[gp, np.ones(len(gp))] @ to_own.T)[:, :3]
    own_g = own @ F[:3, :3].T  # (in the gun node's axes: x right, y up, z back)
    dom = gun['joints'][np.arange(len(gp)), gun['weights'].argmax(1)]
    out['gun_length'] = round(float(np.ptp(own_g[:, 2])), 4)
    out['gun_height'] = round(float(np.ptp(own_g[:, 1])), 4)
    out['gun_width'] = round(float(np.ptp(own_g[:, 0])), 4)
    sv = own_g[dom == sj]
    out['slide'] = {'top': round(float(sv[:, 1].max()), 4), 'front': round(float(sv[:, 2].min()), 4),
                    'back': round(float(sv[:, 2].max()), 4), 'right': round(float(sv[:, 0].max()), 4)}
    # The muzzle: the middle of the front face of whatever reaches furthest
    # forward (the barrel).
    front = own_g[own_g[:, 2] < own_g[:, 2].min() + 0.0008]
    muzzle = np.array([(front[:, 0].max() + front[:, 0].min()) / 2, (front[:, 1].max() + front[:, 1].min()) / 2,
                       own_g[:, 2].min()])
    out['muzzle'] = r4(muzzle)
    # The sights: the slide's highest points near its back and front.
    middle = (sv[:, 2].max() + sv[:, 2].min()) / 2
    rear = sv[sv[:, 2] > middle]
    rear = rear[rear[:, 1] > rear[:, 1].max() - 0.0008]
    fore = sv[sv[:, 2] < middle]
    fore = fore[fore[:, 1] > fore[:, 1].max() - 0.0008]
    out['sights'] = {'x': round(float(rear[:, 0].mean()), 4), 'height': round(float(rear[:, 1].max()), 4),
                     'rearZ': round(float(rear[:, 2].max()), 4), 'frontZ': round(float(fore[:, 2].max()), 4),
                     'front_x': round(float(fore[:, 0].mean()), 4), 'front_height': round(float(fore[:, 1].max()), 4),
                     'slideTop': round(float(sv[:, 1].max()), 4)}
    s = out['sights']
    # (Where the rear sight is at the hip, in the file's space: the idle
    # pose's frame, the sight on it.)
    out['hipSight'] = r4(Fi[:3, 3] + Fi[:3, :3] @ F[:3, :3].T @ np.array([s['x'], s['height'], s['rearZ']]))
    # (Where the eye is from the sights' line in the aimed idle pose.)
    rear_pt = F[:3, 3] + np.array([s['x'], s['height'], s['rearZ']])
    out['aim_rear_sight'] = r4(rear_pt)
    # The ejection port: on the slide's right side, just under its top, over
    # the chamber (its middle PORT_AHEAD in front of the rear sight).
    out['port'] = r4([sv[:, 0].max() - 0.002, s['slideTop'] - 0.007, s['rearZ'] - PORT_AHEAD])

    # The clips' events, from the bones' paths (in the frame's space).
    def path(clip, step=1 / 120):
        n = int(round(clips[clip]['duration'] / step)) + 1
        ts = np.linspace(0, clips[clip]['duration'], n)
        return ts, [rig.world(clip_pose(clips[clip], t)) for t in ts]

    wi = rig.world(idle)
    rest_slide = (np.linalg.inv(wi[fj]) @ wi[sj])[:3, 3]
    rest_mag = (np.linalg.inv(wi[fj]) @ wi[mj])[:3, 3]
    rest_hand = (np.linalg.inv(wi[fj]) @ wi[hl])[:3, 3]
    events = {}
    for clip in ('shoot', 'aimShoot', 'reload', 'draw', 'hide', 'walk', 'aimWalk', 'run', 'idle', 'aimIdle'):
        ts, ws = path(clip)
        slide = np.array([np.linalg.norm((np.linalg.inv(wm[fj]) @ wm[sj])[:3, 3] - rest_slide) for wm in ws])
        mag = np.array([np.linalg.norm((np.linalg.inv(wm[fj]) @ wm[mj])[:3, 3] - rest_mag) for wm in ws])
        hand = np.array([np.linalg.norm((np.linalg.inv(wm[fj]) @ wm[hl])[:3, 3] - rest_hand) for wm in ws])
        frame = np.array([np.linalg.norm(wm[fj][:3, 3] - wi[fj][:3, 3]) for wm in ws])
        e = {'duration': round(clips[clip]['duration'], 3), 'slideMax': round(float(slide.max()), 4),
             'magMax': round(float(mag.max()), 4), 'frameMax': round(float(frame.max()), 4)}
        if slide.max() > 0.003:
            back = slide > 0.0005
            e['slideStarts'] = round(float(ts[np.argmax(back)]), 3)
            e['slideFullyBack'] = round(float(ts[np.argmax(slide)]), 3)
            full = slide > slide.max() - 0.0005
            e['slideRelease'] = round(float(ts[len(full) - 1 - np.argmax(full[::-1])]), 3)
            e['slideHome'] = round(float(ts[len(back) - 1 - np.argmax(back[::-1])]), 3)
            e['slideTravel'] = round(float(slide.max()), 4)
        if mag.max() > 0.003:
            moved = mag > 0.002
            e['magOut'] = round(float(ts[np.argmax(moved)]), 3)
            far = mag > 0.95 * mag.max()
            e['magGrab'] = round(float(ts[len(far) - 1 - np.argmax(far[::-1])]), 3)
            e['magIn'] = round(float(ts[len(moved) - 1 - np.argmax(moved[::-1])]), 3)
        if hand.max() > 0.01:
            off = hand > 0.01
            e['handOn'] = round(float(ts[len(off) - 1 - np.argmax(off[::-1])]), 3)
        if clip == 'draw':
            # (Settled: from when the frame stays within 3 mm of where it rests.)
            away = frame > 0.003
            e['settled'] = round(float(ts[len(away) - 1 - np.argmax(away[::-1])]), 3)
        events[clip] = e
    out['events'] = events
    out['slideTravel'] = events['shoot']['slideTravel']
    out['bones'] = len(rig.names)
    return out, gun_turn


def main():
    started = time.time()
    g, accessor = read_gltf(SOURCE)
    log('bones', sum(len(s['joints']) for s in g['skins']), 'meshes', [m['name'] for m in g['meshes']],
        'animations', [a['name'] for a in g['animations']])
    rig, meshes, clips, k = convert(g, accessor)
    info, gun_turn = measure(rig, meshes, clips)
    info['scale'] = round(k, 6)
    assert abs(info['gun_length'] - GUN_LENGTH) < 0.001, f'the gun is {info["gun_length"]} m long'
    bpy.ops.wm.read_factory_settings(use_empty=True)
    images = textures(g)
    log('textures', {f'{n}_{k2}': f'{len(v) / 1e3:.0f} kB' for n, im in images.items() for k2, v in im.items()
                     if isinstance(v, bytes)})
    write_glb(rig, meshes, clips, images, gun_turn, OUT_GLB)
    log('wrote', OUT_GLB, f'{os.path.getsize(OUT_GLB) / 1e6:.2f} MB')
    info['clips'] = {name: round(c['duration'], 4) for name, c in clips.items()}
    info['specular'] = {n: im.get('specular') for n, im in images.items()}
    print('HIPISTOL ' + json.dumps(info))
    log(f'done in {time.time() - started:.0f} s')


main()
