"""Turns the downloaded, animated SPAS-12 shotgun with its own arms into the
game's twelfth gun.

The model is "FPS Character Animation Pack Saps-12" by Cristian David Duque
Camacho (CC BY 4.0, see README.md, Credits):
https://sketchfab.com/3d-models/fps-character-animation-pack-saps-12-3e5ebbd4ace24f2e92eadb7252927b31
Download its glTF version and unzip it so that the folder holds scene.gltf
and scene.bin, with its textures either in textures/ (as scene.gltf names
them) or loose beside scene.gltf. Then, from the project-fish folder:

    blender --background --python tools/blender/convert_saps12.py -- build/upload-saps12 build/saps12-raw.glb

and compress the result into assets/saps12.glb:

    gltf-transform meshopt build/saps12-raw.glb assets/saps12.glb --level high

The download calls the gun "Saps-12" (and its skeleton "SK_Spas-12"): by
its shape it's a Franchi SPAS-12, the Italian dual-mode (pump or
semi-automatic) combat shotgun: a pump fore-end that slides on the
magazine tube under the barrel, a perforated heat shield over the barrel, a
tall receiver with the ejection port and the bolt's handle on its right, a
loading port under it with a shell lifter, a pistol grip, and the stamped
metal stock folded over the top of the receiver, its butt hook at the
front. Its clips show both modes: Fire is a semi-automatic shot (the gun
recoils and the bolt runs back and forward on its own, the fore-end stays),
and Accion_Fire is a pump stroke without a shot (the support hand pulls the
fore-end and the bolt back together and pushes them home). The magazine is
the tube: the download's reload is the shotgun's, one shell at a time (see
CLIPS).

Like the Browning Hi-Power (convert_hipistol.py), by the same maker, it
comes with its maker's own arms (black gloves and black camouflage
sleeves: the same Rigify body) and animations, and the game plays its
maker's clips as they are. It's made of two skeletons: the gun's (receiver,
fore-end, bolt, trigger, shell lifter and a shell, each with a control bone
above it) and the arms', each with its own skin, and ten animations that
move both: the gun's skeleton is moved as a whole to follow the hands. This
script keeps the skeletons (as one rig), the skinning and the keys, and
only:
- Puts both skeletons on one rig, its root at the eye: the download's
  camera (a node with no camera in it, standing still in every clip at the
  head; the arms' head bone is 5 mm to its right), where it is in the idle
  clip. Everything is turned into gun space (metres, +X right, +Y up,
  -Z forward), the bones' frames too.
- Makes it real size: the download's gun is 1 / SCALE times bigger than a
  SPAS-12 with its stock folded (GUN_LENGTH long, muzzle to the back of the
  folded stock's hinge), so everything (gun, arms, animation) is scaled
  about the eye by as much. From the eye this changes nothing.
- Keeps every clip with every key as made (see CLIPS). Every clip is given
  every bone any clip moves (a bone a clip leaves alone is held where it
  rests), so each sets the whole pose. Nothing is added, retimed or
  re-posed.
- Leaves out the bones no point is weighted to and that hold none that are
  (the legs, the spine's own, the weapon and camera bones).
- Adds a node on the gun's receiver bone, `gun`, turned so that its space
  is gun space when the gun is held straight (the receiver bone's own
  axes: the bore along its +Y, its +Z up): the game measures the gun's
  points in it and hangs the muzzle flash on it.
- Textures: 2048 px WebP (the gun's, gloves' and sleeves' are 4096 on the
  download), the shell's 1024 px (2048). The metal/roughness textures keep
  the ambient occlusion in their red, as the download's gun does. The
  sleeves' specular F0 texture becomes a single specularFactor as on the
  Hi-Power (where it's the usual, none is kept). The gun's textures carry
  no maker's marks; the shell's do (a made-up maker's emblem and name on
  its side and a headstamp on its base): they're rubbed off (SHELL_RUB),
  the "12/70" calibre on its side kept.
- Keeps who made it and its license in the file (asset.copyright).
- Names the parts, bones, materials and animations plainly.

The game's constants for this gun are printed at the end (SAPS12 ...),
measured from the result.
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
from texture_edit import box_blur, image_array, rub_out, store  # noqa: E402

ARGS = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else sys.argv[1:]
SOURCE, OUT_GLB = ARGS[0], ARGS[1]

# --- Placing it ---------------------------------------------------------------
# A SPAS-12 is 820 mm long with its stock folded (1041 mm unfolded), muzzle to
# the back of the receiver's stock hinge; the download's gun is modelled with
# its stock folded.
GUN_LENGTH = 0.820
# The eye: the download's camera node (it stands still in every clip).
EYE_NODE = 'Camera'
# The download's world is Y up and the gun points along +Z, its right
# towards -X: to ours (+X right, +Y up, -Z forward) is a half turn about Y.
R0 = np.diag([-1.0, 1.0, -1.0])
# The rear sight: a blade on the receiver's top, between the barrel's heat
# shield and the folded stock's latch (in the `gun` node's space, metres:
# the box it's in, min and max corners).
REAR_SIGHT_BOX = ((-0.008, 0.07, 0.03), (0.008, 0.095, 0.0546))
# The receiver bone's own axes (the download's): the bore runs along +Y,
# up is -Z (so right is -X).
BORE_AXIS = np.array([0.0, 1.0, 0.0])
UP_AXIS = np.array([0.0, 0.0, -1.0])

# The clips: ours, and the download's animation each is (all of it).
#   idle, walk, run: loops.
#   shoot: one semi-automatic shot (the bolt cycles by itself).
#   pump: the support hand works the fore-end, back and home: no shot. For
#     chambering a shell after loading an empty gun (the zip has no other
#     clip for it), or after each shot in pump mode.
#   reloadStart, reload, reloadEnd: loading the tube one shell at a time.
#     reloadStart takes the support hand off the fore-end to the shells;
#     reload pushes one shell into the loading port (the lifter is pressed
#     in) and goes back for the next, so it's played once per shell, back to
#     back; reloadEnd brings the hand back to the fore-end.
#   draw (Equip), hide (Hold: lowered out of sight).
PREFIX = 'RIG_UE5_Comando_'
CLIPS = [
    ('idle', 'Idle'), ('walk', 'Walk'), ('run', 'Run'),
    ('shoot', 'Fire'), ('pump', 'Accion_Fire'),
    ('reloadStart', 'IdleToReload'), ('reload', 'Reload'), ('reloadEnd', 'ReloadToIdle'),
    ('draw', 'Equip'), ('hide', 'Hold'),
]

# Bones (download names, less their numbered endings) and ours; the rest are
# named after theirs (see plain). (The maker's names are Spanish ones put
# into English: "bedroom" is recamara, here the shell lifter under the
# receiver; "Guardians" is guardamanos, the fore-end.)
BONES = {
    'SK_Spas-12.001': 'gun_base', 'CTRL-Root': 'gun_ctrl', 'Root': 'receiver_j',
    'CTRL-bedroom': 'lifter_ctrl', 'DEF-bedroom': 'lifter_j',
    'CTRL-trigger': 'trigger_ctrl', 'DEF-trigger': 'trigger_j',
    'CTRL-Guardians': 'pump_ctrl', 'DEF-Guardians': 'pump_j',
    'CTRL-Bolt': 'bolt_ctrl', 'DEF-Bolt': 'bolt_j',
    'CTRL-case': 'shell_ctrl', 'DEF-case': 'shell_j',
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


MESHES = {'SKM_Saps-12.002_Weapon_0': 'gun', 'SKM_Saps-12.002_Case_0': 'shell',
          'SKM_Comando_M_Gloves_Black_0': 'gloves', 'SKM_Comando_M_Shirt_BlackCamo2_0': 'sleeves'}
MATERIALS = {'Weapon': 'saps12_gun', 'Case': 'saps12_shell', 'M_Gloves_Black': 'saps12_gloves',
             'M_Shirt_BlackCamo2': 'saps12_sleeves'}

# --- Textures -------------------------------------------------------------------
SIZE = {'saps12_shell': 1024}  # (the rest SIZE_DEFAULT)
SIZE_DEFAULT = 2048
WEBP_QUALITY = 90
# The specular F0 Sketchfab takes as the usual one, and a specularFactor
# this close to 1 is left out.
SKETCHFAB_F0 = 0.5
SPECULAR_KEEP = 0.9
# The maker's marks, rubbed off in the textures at their full size (boxes x0,
# y0, x1, y1 in texels from the top left):
# - the gun's (4096 px): the maker's stamp along the right of the receiver
#   ("S.P.A.S. 12 - L. Franchi S.p.A. - Brescia - Made in Italy"), letters
#   pressed into the normal map and darkening the ambient occlusion: covered
#   in every map by the plain strip of the receiver's side GUN_STAMP_FROM
#   rows above it. The "S" by the safety is kept: it's a marking of how the
#   gun works.
GUN_STAMP = [(1426, 2348, 2034, 2386)]
GUN_STAMP_FROM = 40
# (Two pins' heads by the stamp, left where they are: centre, radius.)
GUN_STAMP_KEEP = [((1734, 2391), 9), ((1989, 2379), 9)]
# - the shell's (2048 px):
#   - on its side (twice, the two halves of the tube): a maker's emblem and
#     name, dark print on the red (found as texels much darker than the red
#     round them); the "12/70" above them is kept;
#   - on its base (twice): the headstamp, letters raised round the primer in
#     the normal map (found as normals that stand out from their smooth
#     surroundings, in the ring between the primer and the rim).
SHELL_PRINT = [(220, 750, 800, 1140), (220, 1440, 800, 1850)]
SHELL_HEADSTAMP = [((1190, 1490), 72, 142), ((1530, 1490), 72, 142)]  # centre, inner and outer radius

EXTRAS = {
    'title': 'FPS Character Animation Pack Saps-12',
    'source': 'https://sketchfab.com/3d-models/fps-character-animation-pack-saps-12-3e5ebbd4ace24f2e92eadb7252927b31',
    'author': 'Cristian David Duque Camacho (https://sketchfab.com/DuqueCD7)',
    'license': 'CC-BY-4.0 (http://creativecommons.org/licenses/by/4.0/)',
}

COPYRIGHT = ('This work is based on "FPS Character Animation Pack Saps-12" '
             '(https://sketchfab.com/3d-models/fps-character-animation-pack-saps-12-3e5ebbd4ace24f2e92eadb7252927b31) '
             'by Cristian David Duque Camacho (https://sketchfab.com/DuqueCD7) licensed under CC-BY-4.0 '
             '(http://creativecommons.org/licenses/by/4.0/). '
             'Changed for Project Fish: both skeletons put on one rig, turned, scaled to real size and placed for '
             'the game, its clips as made, the sleeves\' specular texture made a single value, the shell\'s '
             'markings rubbed off, textures shrunk and stored as WebP, compressed.')


# --- A rig with scale -----------------------------------------------------------
# (As rigged_gltf.Rig, but its bones may be scaled too: this download's arms
# stretch a little, as the Hi-Power's do.)

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
    assert len(anims) == len(CLIPS), 'an animation that is not in CLIPS'
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
    # places of the bones under them). (This download has none, but the
    # Hi-Power's had.)
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

    # The eye, in A. (The camera node stands still in every clip.)
    cam = by_stem[EYE_NODE]
    assert not any(n == cam for tracks in anims.values() for n, _ in tracks), 'the camera moves'
    eye = (np.linalg.inv(W_A) @ download_world('idle', 0.0)(cam))[:3, 3]
    log(f'eye (download world): {np.round(W_A[:3, :3] @ eye, 4)}')

    # The gun's length in A, along its bore (the receiver bone's own axis),
    # for the scale.
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

    w_idle = download_world('idle', 0.0)
    gp = skinned_download(gun_mesh, w_idle)
    gp_a = (np.c_[gp, np.ones(len(gp))] @ np.linalg.inv(W_A).T)[:, :3]
    frame_idle = np.linalg.inv(W_A) @ w_idle(by_stem['Root'])
    bore = frame_idle[:3, :3] @ BORE_AXIS
    bore /= np.linalg.norm(bore)
    length_a = float(np.ptp(gp_a @ bore))
    k = GUN_LENGTH / length_a
    log(f'gun: {length_a:.2f} units long, {length_a * scale_a / GUN_LENGTH:.2f} times real size; '
        f'bore (ours) {np.round(R0 @ bore, 3)}')
    assert (R0 @ bore)[2] < -0.9, 'the gun does not point forward'

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
    poses = (('idle', 0.0), ('shoot', 0.15), ('pump', 0.2), ('reload', 0.5), ('reloadStart', 0.6),
             ('reloadEnd', 0.2), ('draw', 0.4), ('run', 0.3), ('hide', 0.4))
    for clip, t in poses:
        w = download_world(clip, t)
        for name, mesh in meshes.items():
            expect = skinned_download(mesh['node'], w)
            expect = (np.c_[expect, np.ones(len(expect))] @ Hw.T)[:, :3]
            got = skin(rig, mesh, clip_pose(clips[clip], t))
            assert np.abs(expect - got).max() < 2e-5, f'{name} in {clip} at {t} s is off by {np.abs(expect - got).max()}'
    log(f'every point is where the download has it ({len(poses)} poses checked)')
    for mesh in meshes.values():
        mesh.pop('node')
    return rig, meshes, clips, k


# --- Textures -------------------------------------------------------------------

def load(path, colour, size=None):
    """A texture as a Blender image, shrunk to size (if given)."""
    image = bpy.data.images.load(os.path.abspath(path))
    image.colorspace_settings.name = 'sRGB' if colour else 'Non-Color'
    image.alpha_mode = 'STRAIGHT'
    if size and tuple(image.size) != (size, size):
        image.scale(size, size)
    return image


def new_image(name, a, colour=False):
    h, w = a.shape[:2]
    image = bpy.data.images.new(name, w, h, alpha=True)
    image.colorspace_settings.name = 'sRGB' if colour else 'Non-Color'
    store(image, a.astype(np.float32))
    return image


def shell_marks(maps):
    """The maker's marks on the shell (in its 2048 px textures: colour,
    normal, orm; see SHELL_PRINT and SHELL_HEADSTAMP), each a dict: box,
    mask (inside the box), maps (which of the three to fill)."""
    colour, normal = maps[0], maps[1]
    assert colour.shape[0] == 2048, 'the shell texture is not 2048 px'
    out = []
    for box in SHELL_PRINT:
        x0, y0, x1, y1 = box
        # Print: black on the red (the red's own red is far above this
        # everywhere, its grunge too). The roughness has it as well; the
        # normal map hasn't (its fine ribs are left as they are).
        dark = colour[y0:y1, x0:x1, 0] < 0.3
        out.append({'box': box, 'mask': box_blur(dark.astype(np.float64), 4) > 0.02, 'maps': (0, 2)})
    for (cx, cy), r0, r1 in SHELL_HEADSTAMP:
        box = (cx - r1, cy - r1, cx + r1, cy + r1)
        yy, xx = np.mgrid[box[1]:box[3], box[0]:box[2]]
        rr = np.hypot(xx + 0.5 - cx, yy + 0.5 - cy)
        region = normal[box[1]:box[3], box[0]:box[2], :3].astype(np.float64)
        stands_out = np.linalg.norm(region - box_blur(region, 6), axis=2) > 0.05
        mask = (box_blur(stands_out.astype(np.float64), 2) > 0.02) & (rr > r0) & (rr < r1)
        out.append({'box': box, 'mask': mask, 'maps': (0, 1, 2)})
    return out


def gun_marks(maps):
    """The maker's stamp on the gun (in its 4096 px textures; see
    GUN_STAMP): covered with the strip of the same flat side just above it
    (the same grain, so it doesn't show as a smooth patch)."""
    assert maps[1].shape[0] == 4096, 'the gun texture is not 4096 px'
    return [{'box': box, 'above': GUN_STAMP_FROM, 'keep': GUN_STAMP_KEEP, 'maps': (0, 1, 2)} for box in GUN_STAMP]


def clone_from_above(a, box, rows, keep=()):
    """Covers box in a with the patch `rows` above it, blended in at the
    edges, except round the points in keep ((x, y), radius)."""
    x0, y0, x1, y1 = box
    weight = np.zeros((y1 - y0, x1 - x0))
    weight[2:-2, 2:-2] = 1
    yy, xx = np.mgrid[y0:y1, x0:x1]
    for (cx, cy), r in keep:
        weight[np.hypot(xx + 0.5 - cx, yy + 0.5 - cy) < r] = 0
    weight = box_blur(weight, 2)[..., None]
    a[y0:y1, x0:x1] = a[y0:y1, x0:x1] * (1 - weight) + a[y0 - rows:y1 - rows, x0:x1] * weight


# Materials whose textures have marks to rub off: a function finding them
# (in the textures at their full size).
MARKS = {'saps12_shell': shell_marks, 'saps12_gun': gun_marks}


def textures(g):
    images = [inside(SOURCE, im['uri']) for im in g['images']]
    tex = lambda info: images[g['textures'][info['index']]['source']]  # noqa: E731
    out = {}
    for m in g['materials']:
        name = MATERIALS[m['name']]
        pbr = m['pbrMetallicRoughness']
        assert pbr.get('baseColorFactor', [1, 1, 1, 1]) == [1, 1, 1, 1] and pbr.get('roughnessFactor', 1) == 1
        size = SIZE.get(name, SIZE_DEFAULT)
        occlusion = 'occlusionTexture' in m
        if occlusion:
            assert m['occlusionTexture']['index'] == pbr['metallicRoughnessTexture']['index'], 'occlusion apart'
        paths = [(tex(pbr['baseColorTexture']), True), (tex(m['normalTexture']), False),
                 (tex(pbr['metallicRoughnessTexture']), False)]
        if name in MARKS:
            # (Rubbed at their full size, then shrunk.)
            full = [image_array(load(p, c)) for p, c in paths]
            marks = MARKS[name](full)
            for mark in marks:
                chosen = [full[i] for i in mark['maps']]
                if 'above' in mark:
                    for a in chosen:
                        clone_from_above(a, mark['box'], mark['above'], mark.get('keep', ()))
                else:
                    rub_out(chosen, mark['box'], mark['mask'], margin=8,
                            normal=mark['maps'].index(1) if 1 in mark['maps'] else None)
            log(f'{name}: {len(marks)} markings rubbed off')
            made = [new_image(f'{name}_{k}', a, c) for k, a, (_, c) in zip(('colour', 'normal', 'orm'), full, paths)]
            del full
            for image in made:
                if tuple(image.size) != (size, size):
                    image.scale(size, size)
            colour, normal, orm = (image_array(image) for image in made)
        else:
            colour, normal, orm = (image_array(load(p, c, size)) for p, c in paths)
        colour[..., 3] = 1
        orm[..., 3] = 1
        if not occlusion:
            orm[..., 0] = 1
        metal = orm[..., 2] * pbr.get('metallicFactor', 1)
        info = {'occlusion': occlusion, 'metallicFactor': pbr.get('metallicFactor')}
        spec = m.get('extensions', {}).get('KHR_materials_specular')
        if spec:
            assert spec.get('specularColorFactor', [1, 1, 1]) == [1, 1, 1] and 'specularColorTexture' not in spec
            # (Its alpha is Sketchfab's specular F0, where 0.5 is the usual
            # 4 % a non-metal reflects: KHR_materials_specular's 1.)
            f0 = image_array(load(tex(spec['specularTexture']), False, size))[..., 3] * spec.get('specularFactor', 1)
            strength = np.minimum(f0 / SKETCHFAB_F0, 1)
            dielectric = metal < 0.5
            factor = float(strength[dielectric].mean()) if dielectric.any() else 1.0
            log(f'{name}: specular {factor:.3f} on average over its non-metal parts ({dielectric.mean() * 100:.0f}% '
                f'of it; from {strength[dielectric].min():.2f} to {strength[dielectric].max():.2f})')
            if factor < SPECULAR_KEEP:
                info['specular'] = round(factor, 3)
        log(f'{name}: metalness {metal.mean():.3f} on average, roughness {orm[..., 1].mean():.3f}')
        folder = 'project-fish-saps12'
        out[name] = {
            'colour': webp_bytes(new_image(f'{name}_colour_out', colour, True), f'{name}_colour', WEBP_QUALITY, folder),
            'normal': webp_bytes(new_image(f'{name}_normal_out', normal), f'{name}_normal', WEBP_QUALITY, folder),
            'orm': webp_bytes(new_image(f'{name}_orm_out', orm), f'{name}_orm', WEBP_QUALITY, folder),
            **info,
        }
        for image in list(bpy.data.images):
            bpy.data.images.remove(image)
    return out


# --- Writing the file -----------------------------------------------------------

def write_glb(rig, meshes, clips, images, gun_turn, path):
    w = Writer('Project Fish convert_saps12.py', COPYRIGHT, EXTRAS)
    g = w.g
    first = write_rig(w, 'saps12', rig, 'receiver_j', gun_turn)
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
    for name in ('gun', 'shell', 'gloves', 'sleeves'):
        # (Named apart from the `gun` node.)
        write_mesh(w, f'saps12_{name}', meshes[name], material_index[meshes[name]['material']])
    write_clips(w, clips, first)
    w.write(path)


# --- Measuring --------------------------------------------------------------------

def r4(v):
    return [round(float(x), 4) for x in v]


def first_last(ts, on):
    """The first and last times a condition holds."""
    if not on.any():
        return None, None
    return round(float(ts[np.argmax(on)]), 3), round(float(ts[len(on) - 1 - np.argmax(on[::-1])]), 3)


def measure(rig, meshes, clips):
    out = {}
    idle = clip_pose(clips['idle'], 0)
    world = rig.world(idle)
    fj = rig.index('receiver_j')
    F = world[fj]
    assert abs(np.linalg.det(F[:3, :3]) - 1) < 1e-4, 'the receiver bone is scaled'
    # The `gun` node: on the receiver bone, its axes gun space's when the gun
    # is held straight: x right, y up, z back, from the bone's own (ours:
    # R0 turns the bone's axes as it turns everything).
    fwd, up = R0 @ BORE_AXIS, R0 @ UP_AXIS
    G = np.column_stack([np.cross(fwd, up), up, -fwd])
    assert abs(np.linalg.det(G) - 1) < 1e-9
    gun_turn = matrix_quat(G)
    N = F.copy()
    N[:3, :3] = F[:3, :3] @ G  # the gun node in the idle pose
    out['frame'] = r4(F[:3, 3])
    # How it's held in the idle pose (the hip; there's no aimed pose): which
    # way the bore points (yaw: + to the left; pitch: + up) and its cant
    # about the bore (roll: + its top to the right).
    f = N[:3, :3] @ np.array([0, 0, -1.0])
    u = N[:3, :3] @ np.array([0, 1.0, 0])
    side = np.cross(f, [0, 1.0, 0])
    side /= np.linalg.norm(side)
    level_up = np.cross(side, f)
    out['idle_aim'] = {'yaw_deg': round(math.degrees(math.atan2(-f[0], -f[2])), 2),
                       'pitch_deg': round(math.degrees(math.asin(f[1])), 2),
                       'roll_deg': round(math.degrees(math.atan2(u @ side, u @ level_up)), 2),
                       'turn_quat': r4(matrix_quat(N[:3, :3]))}
    to_gun = np.linalg.inv(N)

    def in_gun(p):
        return (np.c_[p, np.ones(len(p))] @ to_gun.T)[:, :3]

    gun = meshes['gun']
    gp = skin(rig, gun, idle)
    own_g = in_gun(gp)
    dom = gun['joints'][np.arange(len(gp)), gun['weights'].argmax(1)]
    part = {n: own_g[dom == rig.index(n)] for n in ('receiver_j', 'pump_j', 'bolt_j', 'lifter_j', 'trigger_j')}
    out['gun_length'] = round(float(np.ptp(own_g[:, 2])), 4)
    out['gun_height'] = round(float(np.ptp(own_g[:, 1])), 4)
    out['gun_width'] = round(float(np.ptp(own_g[:, 0])), 4)
    out['gun_box'] = {'min': r4(own_g.min(0)), 'max': r4(own_g.max(0))}
    out['parts'] = {n: {'min': r4(p.min(0)), 'max': r4(p.max(0))} for n, p in part.items()}
    # The muzzle: the barrel's front face (the bore's middle). The barrel is
    # the frame's part that reaches furthest forward.
    rv = part['receiver_j']
    front = rv[rv[:, 2] < rv[:, 2].min() + 0.002]
    muzzle = np.array([(front[:, 0].max() + front[:, 0].min()) / 2, (front[:, 1].max() + front[:, 1].min()) / 2,
                       rv[:, 2].min()])
    out['muzzle'] = r4(muzzle)
    out['muzzle_face'] = {'x': r4([front[:, 0].min(), front[:, 0].max()]), 'y': r4([front[:, 1].min(), front[:, 1].max()])}
    # The sights: the front sight is the highest point in the gun's front
    # sixth; the rear sight the highest point of the receiver behind the
    # bolt's front (the stock folded over the top is higher still behind
    # that, so it's left out: points behind the receiver's back are not
    # counted).
    zmin, zmax = own_g[:, 2].min(), own_g[:, 2].max()
    fore = rv[rv[:, 2] < zmin + (zmax - zmin) / 6]
    fs = fore[fore[:, 1] > fore[:, 1].max() - 0.0008]
    out['front_sight'] = r4([fs[:, 0].mean(), fs[:, 1].max(), fs[:, 2].mean()])
    # (Its back face: the post's points within 3 mm of its top.)
    post = fore[fore[:, 1] > fore[:, 1].max() - 0.003]
    # The rear sight: the blade on the receiver's top (REAR_SIGHT_BOX), its
    # top and back face.
    (x0, y0, z0), (x1, y1, z1) = REAR_SIGHT_BOX
    blade = rv[(rv[:, 0] > x0) & (rv[:, 0] < x1) & (rv[:, 1] > y0) & (rv[:, 1] < y1) & (rv[:, 2] > z0) & (rv[:, 2] < z1)]
    assert len(blade) > 20, 'no rear sight'
    top = blade[blade[:, 1] > blade[:, 1].max() - 0.0008]
    out['sights'] = {'x': round(float((blade[:, 0].max() + blade[:, 0].min()) / 2), 4),
                     'height': round(float(blade[:, 1].max()), 4), 'rearZ': round(float(top[:, 2].max()), 4),
                     'frontZ': round(float(post[:, 2].max()), 4), 'front_height': round(float(fore[:, 1].max()), 4),
                     'front_x': round(float((post[:, 0].max() + post[:, 0].min()) / 2), 4)}
    out['bolt_rest'] = {'min': r4(part['bolt_j'].min(0)), 'max': r4(part['bolt_j'].max(0))}
    # The ejection port: on the receiver's right, where the bolt's right face
    # shows through it (the middle of the bolt part's right side).
    bv = part['bolt_j']
    out['port'] = r4([bv[:, 0].max(), (bv[:, 1].max() + bv[:, 1].min()) / 2, (bv[:, 2].max() + bv[:, 2].min()) / 2])
    # The shell: its size (length along its own long axis, diameter).
    sp = in_gun(skin(rig, meshes['shell'], idle))
    ext = np.ptp(sp, 0)
    out['shell'] = {'rest_centre': r4((sp.max(0) + sp.min(0)) / 2), 'size_xyz': r4(ext),
                    'length': round(float(ext.max()), 4), 'diameter': round(float(np.sort(ext)[1]), 4)}

    # The clips' events, from the bones' paths (in the receiver's space).
    def path(clip, step=1 / 120):
        n = int(round(clips[clip]['duration'] / step)) + 1
        ts = np.linspace(0, clips[clip]['duration'], n)
        return ts, [rig.world(clip_pose(clips[clip], t)) for t in ts]

    names = {'bolt': 'bolt_j', 'pump': 'pump_j', 'shell': 'shell_j', 'lifter': 'lifter_j', 'trigger': 'trigger_j',
             'handL': 'hand_L', 'handR': 'hand_R'}
    ids = {k: rig.index(v) for k, v in names.items()}
    wi = rig.world(idle)
    rest = {k: np.linalg.inv(wi[fj]) @ wi[b] for k, b in ids.items()}

    def angle(m):
        return math.degrees(math.acos(np.clip((np.trace(m[:3, :3]) - 1) / 2, -1, 1)))

    events = {}
    tracks = {}
    for clip in clips:
        ts, ws = path(clip)
        rel = {k: [np.linalg.inv(wm[fj]) @ wm[b] for wm in ws] for k, b in ids.items()}
        d = {k: np.array([np.linalg.norm(m[:3, 3] - rest[k][:3, 3]) for m in v]) for k, v in rel.items()}
        a = {k: np.array([angle(np.linalg.inv(rest[k]) @ m) for m in v]) for k, v in rel.items()}
        frame = np.array([np.linalg.norm(wm[fj][:3, 3] - wi[fj][:3, 3]) for wm in ws])
        # (The gun's turn from where it rests in the idle pose: the recoil.)
        turn = np.array([angle(np.linalg.inv(wi[fj]) @ wm[fj]) for wm in ws])
        e = {'duration': round(clips[clip]['duration'], 3), 'frameMax': round(float(frame.max()), 4),
             'turnMax_deg': round(float(turn.max()), 1), 'turnMaxAt': round(float(ts[np.argmax(turn)]), 3)}
        for k in ('bolt', 'pump'):
            if d[k].max() > 0.003:
                e[f'{k}Travel'] = round(float(d[k].max()), 4)
                e[f'{k}Starts'], e[f'{k}Home'] = first_last(ts, d[k] > 0.0005)
                e[f'{k}FullyBack'], e[f'{k}Release'] = first_last(ts, d[k] > d[k].max() - 0.0005)
        if a['trigger'].max() > 2:
            e['triggerPulled'], e['triggerReleased'] = first_last(ts, a['trigger'] > a['trigger'].max() * 0.8)
        if a['lifter'].max() > 2:
            e['lifterMax_deg'] = round(float(a['lifter'].max()), 1)
            e['lifterIn'], e['lifterOut'] = first_last(ts, a['lifter'] > 2)
        if d['shell'].max() > 0.003:
            # (Away from where it rests in the receiver: in the hand; then
            # pushed in: back at its rest, out of sight in the tube.)
            e['shellAway'], e['shellIn'] = first_last(ts, d['shell'] > 0.002)
            e['shellAwayAtStart'] = round(float(d['shell'][0]), 4)
            # (When it reaches the loading port: within 2 cm of its rest.)
            near = d['shell'] < 0.02
            e['shellAtPort'] = round(float(ts[np.argmax(near)]), 3)
        if d['handL'].max() > 0.01:
            e['handLOff'], e['handLOn'] = first_last(ts, d['handL'] > 0.01)
            e['handLMax'] = round(float(d['handL'].max()), 4)
            e['handLStart'] = round(float(d['handL'][0]), 4)
            e['handLEnd'] = round(float(d['handL'][-1]), 4)
        if d['handR'].max() > 0.01:
            e['handROff'], e['handROn'] = first_last(ts, d['handR'] > 0.01)
        if clip == 'draw':
            away = frame > 0.003
            e['settled'] = round(float(ts[len(away) - 1 - np.argmax(away[::-1])]), 3)
        if clip == 'shoot':
            e['recoilStarts'] = round(float(ts[np.argmax(turn > 0.5)]), 3)
            back = turn < 1.0
            e['recoilSettled'] = round(float(ts[len(back) - 1 - np.argmax(~back[::-1])]), 3) if (~back).any() else 0.0
        events[clip] = e
        tracks[clip] = (ts, ws)
    out['events'] = events

    # How well the clips join (the largest jump of any arm or gun bone, in
    # the eye's space, metres; the shell left out: it's out of sight in the
    # tube when it jumps to the hand).
    skip = {rig.index('shell_j'), rig.index('shell_ctrl')}
    keep = [b for b in range(len(rig.names)) if b not in skip]

    def pose_at(clip, t):
        wm = rig.world(clip_pose(clips[clip], t))
        return np.array([wm[b][:3, 3] for b in keep])

    joins = {}
    for a_, b_ in (('reloadStart', 'reload'), ('reload', 'reload'), ('reload', 'reloadEnd'), ('reloadEnd', 'idle'),
                   ('idle', 'reloadStart'), ('shoot', 'idle'), ('pump', 'idle'), ('reloadEnd', 'pump'),
                   ('draw', 'idle'), ('idle', 'hide'), ('idle', 'walk'), ('idle', 'run'), ('walk', 'walk'),
                   ('run', 'run'), ('idle', 'idle')):
        jump = np.linalg.norm(pose_at(a_, clips[a_]['duration']) - pose_at(b_, 0), axis=1)
        joins[f'{a_}>{b_}'] = {'m': round(float(jump.max()), 4), 'worst': rig.names[keep[int(jump.argmax())]]}
    out['joins'] = joins
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
    info['gun_turn'] = r4(gun_turn)
    assert abs(info['gun_length'] - GUN_LENGTH) < 0.002, f'the gun is {info["gun_length"]} m long'
    bpy.ops.wm.read_factory_settings(use_empty=True)
    images = textures(g)
    log('textures', {f'{n}_{k2}': f'{len(v) / 1e3:.0f} kB' for n, im in images.items() for k2, v in im.items()
                     if isinstance(v, bytes)})
    write_glb(rig, meshes, clips, images, gun_turn, OUT_GLB)
    log('wrote', OUT_GLB, f'{os.path.getsize(OUT_GLB) / 1e6:.2f} MB')
    info['clips'] = {name: round(c['duration'], 4) for name, c in clips.items()}
    info['specular'] = {n: im.get('specular') for n, im in images.items()}
    print('SAPS12 ' + json.dumps(info))
    log(f'done in {time.time() - started:.0f} s')


main()
