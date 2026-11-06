"""Turns an animated gun download whose arms are the Unreal Engine mannequin
("Manny") into a game gun held by the soldier's own arms: the download's
gun and its clips, played on the soldier's sleeves and gloved hands.

The downloads are by TheParaziT (CC BY 4.0, see README.md, Credits):
- "Xiri X4 Animations", a pistol:
  https://sketchfab.com/3d-models/xiri-x4-animations-9c66f74e346e4c5e8b1d4e5fcddc8a37
- "MP7A1 Animations", a compact submachine gun:
  https://sketchfab.com/3d-models/mp7a1-animations-0a55689855594f2496c2debdb7e6f5bc
Download the glTF version and unzip it so the folder holds scene.gltf,
scene.bin and textures/. Then, from the project-fish folder:

    blender --background --python tools/blender/convert_retarget.py -- build/upload-xiri build/x4-raw.glb --arms assets/soldier.glb
    gltf-transform meshopt build/x4-raw.glb assets/x4.glb --level high
    blender --background --python tools/blender/convert_retarget.py -- build/upload-mp7 build/mp7-raw.glb --arms assets/soldier.glb
    gltf-transform meshopt build/mp7-raw.glb assets/mp7.glb --level high

(--arms is the soldier's model, assets/soldier.glb: his first-person arms,
the meshes tagged firstPerson 'arms', and his skeleton come from it.)

Why: the downloads' arms are Epic Games' Unreal Engine mannequin (the
SK_Mannequin_Arms meshes and their MI_Manny materials and textures), which
Epic only allows in Unreal Engine projects. So none of the mannequin's
meshes or textures are written, not even unused: only its skeleton's
animation is read, and played on the soldier's arms (the sleeves and gloves
the game already draws in first person, on his CC_Base_* bones) by
retargeting, here at build time:
- The gun, its parts and its clips are the download's, every key as made;
  the gun's parts (slide, barrel, hammer, trigger, magazine, bolt and the
  rest) move only as its clips move them.
- Each frame, each of his hands is put where the mannequin's is on the gun:
  turned as its hand is (their knuckle rows lined up, as src/player/
  fpArms.js does), his middle knuckle on its middle knuckle.
- Each of his finger bones is turned as the mannequin's matching bone is,
  with a rest-pose correction: each bone's own axes are put onto the other
  rig's by its length (towards the next joint) and the axis it bends about
  (so a curl is a curl, for the thumb too, whose bones' axes differ most).
  The mannequin's palm bones (metacarpals) have no match in his hand: their
  turn goes into his fingers' first bones.
- His chest is placed once (per gun) so his shoulders are where the
  mannequin's are, turned as its chest is. His collarbones reach for the
  mannequin's shoulders each frame; where his arm (45 cm, against the
  mannequin's 55) can't reach the hand from there, the shoulder goes
  towards the hand just as far as it must (REACH). His upper arm and
  forearm reach the wrist by two-bone IK, the elbow bending towards where
  the mannequin's elbow is, the forearm a hinge; half the wrist's twist
  goes into his lower forearm (the glove's cuff and the sleeve's end), as
  in fpArms.js. Nothing is added: the moves are the clips'.
- Everything is put in gun space (metres, +X right, +Y up, -Z forward),
  with the rig's root at the eye: the download's own first-person camera
  (the MP7's `Camera` node on the head; the X4, which has the same
  skeleton and head but no camera node, uses the same place).
- His bones keep their names (CC_Base_L_Hand, CC_Base_R_Index1, ...), their
  local axes and their units (centimetres, under a node scaled as his model
  is), so an outfit glove (assets/gear/gloves_*.glb, bound to his bones)
  can be put on these hands by joint name with its own inverse bind
  matrices, exactly as src/gear.js puts it on him.
- The gun's textures: maker's logos and brand names rubbed off (RUB_OUT),
  kept at their own size up to TEXTURE_SIZE, stored as WebP. His sleeves'
  and gloves' textures are copied from his model as they are.
- Keeps who made it and its license in the file (asset.copyright).

The game's constants for each gun are printed at the end (RETARGET ...),
measured from the result, and with --report FILE written there too.
"""

import json
import math
import os
import sys
import time

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from glb_read import read_glb  # noqa: E402
from rigged_gltf import (Writer, inside, matrix_quat, node_matrix, quat_matrix, read_gltf, sample,  # noqa: E402
                         trs_matrix)


def log(*args):
    print(f'[{time.strftime("%H:%M:%S")}]', *args, flush=True)


ARGS = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else sys.argv[1:]
if os.environ.get('RETARGET_NO_MAIN'):
    ARGS = ['', '']


def option(name, default=None):
    return ARGS[ARGS.index(name) + 1] if name in ARGS else default


POSITIONAL = [a for i, a in enumerate(ARGS) if not a.startswith('--') and not (i > 0 and ARGS[i - 1].startswith('--'))]
SOURCE, OUT_GLB = POSITIONAL[0], POSITIONAL[1]
ARMS = option('--arms', 'assets/soldier.glb')
REPORT = option('--report')
NO_TEXTURES = '--no-textures' in ARGS
FIT_FINGERS = '--no-fit' not in ARGS  # (--no-fit: his fingers turned as the mannequin's only)  # (quick builds for checking the motion: plain grey textures)

# --- The guns -------------------------------------------------------------------

LICENSE = 'CC-BY-4.0 (http://creativecommons.org/licenses/by/4.0/)'
AUTHOR = 'TheParaziT (https://sketchfab.com/TheParaziT)'
ARMS_NOTE = ('The arms are the game\'s soldier\'s own sleeves and gloves (from "Soldier Full Tactical Gear" by '
             'DanlyVostok, CC BY 4.0), playing the download\'s animations retargeted onto his skeleton; the '
             'download\'s Unreal Engine mannequin arms (Epic Games\' "Manny", meshes and textures) were removed '
             'and are not in this file.')

GUNS = {
    'x4': {
        'mesh': 'X4_Object',
        'title': 'Xiri X4 Animations',
        'source': 'https://sketchfab.com/3d-models/xiri-x4-animations-9c66f74e346e4c5e8b1d4e5fcddc8a37',
        'prefix': 'MC_X4_',
        # (ours, the download's clip)
        'clips': [('idle', 'idle'), ('shoot', 'shoot'), ('shootLast', 'shoot_last'), ('afterShoot', 'after_shoot'),
                  ('dry', 'shoot_dry'), ('reload', 'reload'), ('reloadEmpty', 'full_reload'), ('inspect', 'inspect'),
                  ('lower', 'ready_to_low'), ('walk', 'walk_fwd_loop'), ('walkStart', 'walk_fwd_start'),
                  ('walkEnd', 'walk_fwd_end'), ('run', 'run_loop'), ('runStart', 'run_start'), ('runEnd', 'run_end')],
        'bones': {'body': 'frame', 'slide': 'slide', 'barrel': 'barrel', 'trigger': 'trigger', 'hammer': 'hammer',
                  'mag_release': 'mag_release', 'slide_release': 'slide_stop', 'mag': 'magazine',
                  'mag_bullet_1': 'magazine_round_1', 'mag_bullet_2': 'magazine_round_2',
                  'mag_bullet_3': 'magazine_round_3'},
        'materials': {'Level_1.004': 'x4_gun'},
        # Markings rubbed off (box in the texture as the download has it, at
        # its own size (x0, y0, x1, y1), how; see convert_fn502.py): the
        # maker's name and the model on the slide and frame, the maker's
        # name along both sides of the grip (on stippling: only what stands
        # out more than the stippling does) and the serial. The magazine's
        # round count stays.
        'rub_out': {'Level_1.004': [((688, 196, 748, 248), 'letters'), ((626, 400, 690, 456), 'letters'),
                                    ((312, 566, 438, 624), 'letters', (0.12, 0.16, 0.12)),
                                    ((1232, 468, 1292, 602), 'letters', (0.12, 0.16, 0.12)),
                                    ((272, 680, 324, 704), 'letters')]},
    },
    'mp7': {
        'mesh': 'mp7a1_Object',
        'title': 'MP7A1 Animations',
        'source': 'https://sketchfab.com/3d-models/mp7a1-animations-0a55689855594f2496c2debdb7e6f5bc',
        'prefix': 'MC_MP7_',
        'clips': [('idle', 'idle'), ('draw', 'show'), ('hide', 'hide'), ('shoot', 'shoot'),
                  ('afterShoot', 'after_shoot'), ('dry', 'shoot_dry'), ('reload', 'reload'),
                  ('reloadEmpty', 'full_reload'), ('inspect', 'inspect'), ('safetyOn', 'safety_on'),
                  ('safetyOff', 'safety_off'), ('lower', 'ready_to_low'), ('walk', 'walk_fwd_loop'),
                  ('walkStart', 'walk_fwd_start'), ('walkEnd', 'walk_fwd_end'), ('run', 'run_loop'),
                  ('runStart', 'run_start'), ('runEnd', 'run_end')],
        'bones': {'body': 'frame', 'stock': 'stock', 'stock_lock': 'stock_lock', 'slide_lock': 'bolt_catch',
                  'trigger': 'trigger', 'trigger_p2': 'trigger_blade', 'mag_lock': 'mag_release', 'mag': 'magazine',
                  'bullet_1': 'magazine_round_1', 'bullet_2': 'magazine_round_2', 'foregrip': 'foregrip',
                  'foregrip_lock': 'foregrip_lock', 'bolt_handle': 'charging_handle', 'silencer': 'suppressor',
                  'front_scope': 'front_sight', 'back_scope': 'rear_sight', 'fire_switch': 'selector',
                  'scope': 'red_dot'},
        'materials': {'Slot_1': 'mp7_receiver', 'slot_2': 'mp7_parts', 'slot_3': 'mp7_stock'},
        'rub_out': {
            # The receiver: the maker's logo and the model name on both sides
            # of the grip, and a line of small print; the calibre and the
            # selector's markings stay.
            'Slot_1': [((688, 398, 802, 447), 'letters'), ((662, 656, 732, 684), 'letters'),
                       ((0, 372, 142, 420), 'letters')],
            # The receiver's side: the maker's logo, model, calibre, serial
            # and proof marks; the red dot's brand name and the print above it.
            'slot_2': [((118, 278, 178, 482), 'letters'), ((518, 222, 612, 268), 'letters')],
        },
    },
}
TEXTURE_SIZE = 2048
WEBP_QUALITY = 90
STANDS_OUT = (0.05, 0.08, 0.06)  # colour, normal, metal/roughness (see texture_edit.deviation_mask)

# The eye: the MP7 download's `Camera` node, on the head bone (the head
# doesn't move in any clip). The X4 has the same skeleton and head but no
# camera node: it gets the same one.
CAMERA_ON_HEAD = {'translation': [0.0, 0.0491, 0.0], 'rotation': [0.0, 0.0, -0.70710678, 0.70710678]}

# His reach: the most of his arm's length (shoulder to wrist) a clip's pose
# may take before the shoulder goes towards the hand.
REACH = 0.97
# How far his collarbones turn (at most, radians) to put his shoulders
# where the mannequin's are; the rest is a slide of the collarbone.
CLAVICLE_TURN = 0.5
# Digits whose first two bones point at the mannequin's next joints rather
# than copying its bones' turns (see Retarget.pose).
AIMED = ('Thumb',)
# Over how many frames each way a hand's move out of the gun is smoothed.
PALM_SMOOTH = 3

# --- Small maths ------------------------------------------------------------------


def unit(v):
    return v / np.linalg.norm(v)


def basis(along, across):
    """A rotation whose columns are along, across (made square to it) and
    their cross."""
    x = unit(np.asarray(along, np.float64))
    y = np.asarray(across, np.float64) - x * (x @ across)
    y = unit(y)
    return np.c_[x, y, np.cross(x, y)]


def rot_between(a, b):
    """The smallest rotation (matrix) taking direction a to b."""
    a, b = unit(a), unit(b)
    v = np.cross(a, b)
    c = float(a @ b)
    if c < -0.999999:
        p = unit(np.cross(a, [1, 0, 0] if abs(a[0]) < 0.9 else [0, 1, 0]))
        return 2 * np.outer(p, p) - np.eye(3)
    k = np.array([[0, -v[2], v[1]], [v[2], 0, -v[0]], [-v[1], v[0], 0]])
    return np.eye(3) + k + k @ k / (1 + c)


def axis_angle(axis, angle):
    axis = unit(axis)
    k = np.array([[0, -axis[2], axis[1]], [axis[2], 0, -axis[0]], [-axis[1], axis[0], 0]])
    return np.eye(3) + math.sin(angle) * k + (1 - math.cos(angle)) * k @ k


def angle_of(m):
    return math.acos(max(-1.0, min(1.0, (np.trace(m) - 1) / 2)))


def limit_turn(m, most):
    a = angle_of(m)
    if a <= most:
        return m
    q = matrix_quat(m)
    axis = q[:3] / max(np.linalg.norm(q[:3]), 1e-12)
    return axis_angle(axis, most)


def stem(name):
    return name.rsplit('_', 1)[0] if name.rsplit('_', 1)[-1].isdigit() else name


# --- Reading the download -----------------------------------------------------------

class Download:
    """The download's node tree, its skin and its animations, and every
    node's place (the glTF's world: Y up, metres) at any time in a clip."""

    def __init__(self, folder):
        self.g, self.accessor = read_gltf(folder)
        g = self.g
        self.nodes = g['nodes']
        self.parent = {c: i for i, n in enumerate(self.nodes) for c in n.get('children', [])}
        self.by = {}
        for i, n in enumerate(self.nodes):
            self.by.setdefault(stem(n.get('name', '')), i)
        assert len(g['skins']) == 1, 'one skin expected'
        self.skin = g['skins'][0]
        self.ibm = self.accessor(self.skin['inverseBindMatrices']).reshape(-1, 4, 4).transpose(0, 2, 1).astype(np.float64)
        self.anims = {}
        for a in g['animations']:
            tracks = {}
            for ch in a['channels']:
                s = a['samplers'][ch['sampler']]
                assert s.get('interpolation', 'LINEAR') == 'LINEAR'
                tracks[(ch['target']['node'], ch['target']['path'])] = (
                    self.accessor(s['input'])[:, 0].astype(np.float64), self.accessor(s['output']).astype(np.float64))
            self.anims[a['name'].split('|')[-1]] = tracks

    def times(self, clip):
        ts = np.unique(np.concatenate([t for t, _ in self.anims[clip].values()]))
        # (Keys closer than a millisecond are one key.)
        keep = np.r_[True, np.diff(ts) > 1e-3]
        return ts[keep]

    def local(self, i, clip, ts):
        """A node's local matrices at times ts (n, 4, 4)."""
        n = self.nodes[i]
        tracks = self.anims[clip] if clip else {}
        if 'matrix' in n:
            assert not any((i, p) in tracks for p in ('translation', 'rotation', 'scale'))
            return np.repeat(node_matrix(n)[None], len(ts), 0)
        out = np.empty((len(ts), 4, 4))
        for k, t in enumerate(ts):
            T = n.get('translation', [0, 0, 0])
            R = n.get('rotation', [0, 0, 0, 1])
            S = n.get('scale', [1, 1, 1])
            if (i, 'translation') in tracks:
                T = sample(*tracks[(i, 'translation')], t, 'translation')
            if (i, 'rotation') in tracks:
                R = sample(*tracks[(i, 'rotation')], t, 'rotation')
            if (i, 'scale') in tracks:
                S = sample(*tracks[(i, 'scale')], t, 'scale')
            out[k] = trs_matrix(T, R, S)
        return out

    def worlds(self, wanted, clip, ts):
        """World matrices of the wanted nodes (and their ancestors) at ts."""
        cache = {}

        def w(i):
            if i in cache:
                return cache[i]
            m = self.local(i, clip, ts)
            if i in self.parent:
                m = w(self.parent[i]) @ m
            cache[i] = m
            return m

        return {i: w(i) for i in wanted}


# --- The soldier's arms -----------------------------------------------------------------

SIDES = ('L', 'R')
FINGERS = ('Index', 'Mid', 'Ring', 'Pinky', 'Thumb')
MANNY_FINGERS = {'Index': 'index', 'Mid': 'middle', 'Ring': 'ring', 'Pinky': 'pinky', 'Thumb': 'thumb'}


def arm_bone_names():
    names = ['CC_Base_Spine02']
    for s in SIDES:
        names += [f'CC_Base_{s}_{b}' for b in ('Clavicle', 'Upperarm', 'UpperarmTwist01', 'UpperarmTwist02',
                                                'Forearm', 'ForearmTwist01', 'ForearmTwist02', 'Hand')]
        names += [f'CC_Base_{s}_{f}{k}' for f in FINGERS for k in (1, 2, 3)]
    return names


class Soldier:
    """His skeleton (rest pose, from his model's node tree), his first-person
    arms' meshes (posed by his skin's inverse bind matrices) and their
    materials and textures, from assets/soldier.glb."""

    def __init__(self, path):
        g, accessor, view = read_glb(path)
        self.g, self.accessor, self.view = g, accessor, view
        nodes = g['nodes']
        parent = {c: i for i, n in enumerate(nodes) for c in n.get('children', [])}
        self.parent_node = parent
        import re
        self.by = {re.sub(r'_\d+$', '', n['name']): i for i, n in enumerate(nodes) if 'name' in n}
        skin = g['skins'][0]
        self.joints = skin['joints']
        self.joint_names = [re.sub(r'_\d+$', '', nodes[j]['name']) for j in self.joints]
        self.ibm = accessor(skin['inverseBindMatrices']).reshape(-1, 4, 4).transpose(0, 2, 1).astype(np.float64)

        def world(i):
            m = node_matrix(nodes[i])
            while i in parent:
                i = parent[i]
                m = node_matrix(nodes[i]) @ m
            return m

        self.world_node = world
        # His bones' scale (his model is in centimetres under a scaled node).
        m = world(self.by['CC_Base_Spine02'])
        self.scale = float(np.linalg.norm(m[:3, 0]))
        self.names = arm_bone_names()
        self.rest_t, self.rest_r, self.rest_world = {}, {}, {}
        for n in self.names:
            node = nodes[self.by[n]]
            self.rest_t[n] = np.array(node.get('translation', [0, 0, 0]), np.float64)
            self.rest_r[n] = quat_matrix(node.get('rotation', [0, 0, 0, 1]))
            w = world(self.by[n])
            self.rest_world[n] = (w[:3, :3] / self.scale, w[:3, 3])
        self.parent = {}
        for n in self.names:
            p = nodes[parent[self.by[n]]]['name']
            p = re.sub(r'_\d+$', '', p)
            self.parent[n] = p if p in self.names else None
        # His first-person arms' meshes.
        self.meshes = []
        for i, node in enumerate(nodes):
            if 'mesh' not in node or (node.get('extras') or {}).get('firstPerson') != 'arms':
                continue
            for prim in g['meshes'][node['mesh']]['primitives']:
                a = prim['attributes']
                J = accessor(a['JOINTS_0']).astype(np.int64)
                W = accessor(a['WEIGHTS_0']).astype(np.float64)
                W /= W.sum(1, keepdims=True)
                used = set(self.joint_names[j] for j in np.unique(J[W > 0]))
                missing = used - set(self.names)
                assert not missing, f'his arms are weighted to bones left out: {missing}'
                self.meshes.append({
                    'material': g['materials'][prim['material']],
                    'position': accessor(a['POSITION']).astype(np.float64),
                    'normal': accessor(a['NORMAL']).astype(np.float64)[:, :3],
                    'uv': accessor(a['TEXCOORD_0']).astype(np.float64),
                    'joints': J, 'weights': W,
                    'triangles': accessor(prim['indices']).astype(np.int64).reshape(-1, 3),
                })

    def bone_local_frames(self):
        """In his rest pose, each arm bone's world rotation and place (his
        model's space, metres)."""
        return self.rest_world

    def image(self, info):
        tex = self.g['textures'][info['index']]
        src = tex.get('extensions', {}).get('EXT_texture_webp', {}).get('source', tex.get('source'))
        im = self.g['images'][src]
        return im['mimeType'], self.view(im['bufferView'])


# --- Retargeting ----------------------------------------------------------------------------

def frames_for_fingers(soldier):
    """Each finger bone's rest-pose correction: in its own axes, the
    direction it runs along (to the next joint) and the axis it bends
    (curls) about, for his bones and the mannequin's. His (CC) bones run
    along +Y; his fingers bend about -Z (left) or +Z (right), his thumbs'
    about -X. The mannequin's run along +X (left) or -X (right) and all
    bend about +Z."""
    out = {}
    for s in SIDES:
        for f in FINGERS:
            for k in (1, 2, 3):
                his_along = np.array([0.0, 1.0, 0.0])
                if f == 'Thumb':
                    his_hinge = np.array([-1.0, 0.0, 0.0])
                else:
                    his_hinge = np.array([0.0, 0.0, -1.0 if s == 'L' else 1.0])
                its_along = np.array([1.0 if s == 'L' else -1.0, 0.0, 0.0])
                its_hinge = np.array([0.0, 0.0, 1.0])
                out[f'CC_Base_{s}_{f}{k}'] = (basis(his_along, his_hinge), basis(its_along, its_hinge))
    return out


class Retarget:
    def __init__(self, dl, soldier, cfg):
        self.dl, self.soldier, self.cfg = dl, soldier, cfg
        by = dl.by
        # The eye, in the glTF's world (from the idle clip's first frame:
        # the head never moves).
        idle = cfg['prefix'] + 'idle'
        head = dl.worlds([by['head']], idle, [0.0])[by['head']][0]
        if 'Camera' in by:
            cam = dl.worlds([by['Camera']], idle, [0.0])[by['Camera']][0]
            self.camera_source = 'the download\'s Camera node'
        else:
            cam = head @ trs_matrix(CAMERA_ON_HEAD['translation'], CAMERA_ON_HEAD['rotation'])
            self.camera_source = 'the MP7 download\'s Camera node, on the same head'
        # An Unreal camera looks along its +X, up its +Y... here (after the
        # download's own axis change) along +X with +Y up: check.
        look, up = unit(cam[:3, 0]), unit(cam[:3, 1])
        assert np.allclose(up, [0, 1, 0], atol=1e-3), up
        self.eye = cam[:3, 3]
        # Gun space: forward (look) to -Z, up to +Y, right (look x up) to +X.
        right = np.cross(look, up)
        self.G = np.eye(4)
        self.G[:3, :3] = np.array([right, up, -look])
        self.G[:3, 3] = -self.G[:3, :3] @ self.eye
        log(f'eye: {self.camera_source}, at {np.round(self.eye, 4)} looking {np.round(look, 3)}')

    # The mannequin's bones we follow.
    def manny_names(self):
        out = ['spine_05', 'neck_01', 'head']
        for s in ('l', 'r'):
            out += [f'clavicle_{s}', f'upperarm_{s}', f'lowerarm_{s}', f'hand_{s}']
            out += [f'{f}_{k:02d}_{s}' for f in MANNY_FINGERS.values() for k in (1, 2, 3)]
        return out

    def manny(self, clip, ts):
        by = self.dl.by
        names = self.manny_names()
        w = self.dl.worlds([by[n] for n in names], clip, ts)
        return {n: self.G[None] @ w[by[n]] for n in names}

    def place_chest(self):
        """His chest's place (rotation and position of CC_Base_Spine02, gun
        space) so his shoulders are where the mannequin's are in the idle
        pose, turned as its chest is."""
        S = self.soldier
        M = self.manny(self.cfg['prefix'] + 'idle', [0.0])
        p = lambda n: M[n][0, :3, 3]  # noqa: E731
        its_across = p('upperarm_l') - p('upperarm_r')
        its_up = p('neck_01') - p('spine_05')
        his = S.rest_world
        his_across = his['CC_Base_L_Upperarm'][1] - his['CC_Base_R_Upperarm'][1]
        his_up = S.world_node(S.by['CC_Base_NeckTwist01'])[:3, 3] - his['CC_Base_Spine02'][1]
        # (Right-handed frames: across, up made square to it.)
        R = basis(its_across, its_up) @ basis(his_across, his_up).T
        his_mid = (his['CC_Base_L_Upperarm'][1] + his['CC_Base_R_Upperarm'][1]) / 2
        its_mid = (p('upperarm_l') + p('upperarm_r')) / 2
        chest_r = R @ his['CC_Base_Spine02'][0]
        chest_p = its_mid + R @ (his['CC_Base_Spine02'][1] - his_mid)
        log(f'his shoulders {np.linalg.norm(his_across) * 100:.1f} cm apart, the mannequin\'s '
            f'{np.linalg.norm(its_across) * 100:.1f}; his chest turned {math.degrees(angle_of(R)):.0f} deg')
        self.chest = (chest_r, chest_p)
        self.chest_turn = R
        return self.chest

    def setup(self):
        S = self.soldier
        s = S.scale
        self.place_chest()
        self.finger_frames = frames_for_fingers(S)
        self.arm = {}
        for side in SIDES:
            b = lambda n: f'CC_Base_{side}_{n}'  # noqa: E731
            up_t, fo_t, ha_t = S.rest_t[b('Forearm')], S.rest_t[b('Hand')], S.rest_t[b('Upperarm')]
            a, c = np.linalg.norm(up_t) * s, np.linalg.norm(fo_t) * s
            # His elbow's hinge, from his rest pose (his elbows bent): in his
            # upper arm's and forearm's own axes.
            Ru, pu = S.rest_world[b('Upperarm')]
            Rf, pf = S.rest_world[b('Forearm')]
            ph = S.rest_world[b('Hand')][1]
            hinge = unit(np.cross(pf - pu, ph - pf))
            bend = math.degrees(math.acos(unit(pf - pu) @ unit(ph - pf)))
            assert bend > 15, f'his {side} elbow is too straight at rest ({bend:.0f} deg) to find its hinge'
            # His knuckles in his hand's axes (cm).
            t = lambda n: S.rest_t[b(n)]  # noqa: E731
            self.arm[side] = {
                'upper': a, 'fore': c, 'reach': a + c,
                'up_along': unit(up_t), 'up_hinge': Ru.T @ hinge,
                'fo_along': unit(fo_t), 'fo_hinge': Rf.T @ hinge,
                'cl_along': unit(ha_t), 'clavicle': np.linalg.norm(ha_t) * s,
                'mid': t('Mid1'), 'across': t('Pinky1') - t('Index1'),
            }
            log(f'his {side} arm: upper arm {a * 100:.1f} cm, forearm {c * 100:.1f} cm '
                f'(elbow bent {bend:.0f} deg at rest)')

    def finger_points(self):
        """His glove's points on each finger bone (mostly on it), in that
        bone's own frame (his units, centimetres)."""
        S = self.soldier
        glove = next(m for m in S.meshes if 'Glove' in m['material']['name'])
        dom = glove['joints'][np.arange(len(glove['joints'])), glove['weights'].argmax(1)]
        strong = glove['weights'].max(1) > 0.5
        out = {}
        for side in SIDES:
            for f, j in [('Hand', 0)] + [(f, j) for f in FINGERS for j in (1, 2, 3)]:
                n = f'CC_Base_{side}_{f}{j}' if j else f'CC_Base_{side}_Hand'
                if n:
                    k = S.joint_names.index(n)
                    sel = (dom == k) & strong
                    p = np.c_[glove['position'][sel], np.ones(sel.sum())] @ S.ibm[k].T
                    out[n] = p[:, :3]
        return out

    def fit_fingers(self, R, P, M, where, volume):
        """See FIT. R, P (his bones, per frame) are changed in place."""
        s = self.soldier.scale
        if not hasattr(self, 'points'):
            self.points = self.finger_points()
        n = len(next(iter(R.values())))
        steps = np.arange(FIT['step'], FIT['most'] + 1e-9, FIT['step'])
        angles = np.concatenate([[0.0], np.ravel(np.c_[steps, -steps])])
        stats = {'fixed': 0, 'left': 0, 'worstIn': 0.0, 'worstGap': 0.0}
        lo = -FIT['inside']
        for side in SIDES:
            ms = side.lower()
            for f in FINGERS:
                chain = [f'CC_Base_{side}_{f}{j}' for j in (1, 2, 3)]
                # (Axes tried: the one it bends about, and for the thumb also
                # sideways; 0 and 1 index his anatomical frame's columns.)
                axes = (1, 2) if f == 'Thumb' else (1,)
                tries = [(ax, a) for ax in axes for a in angles]
                prev = {name: 0.0 for name in chain}
                for k in range(n):
                    for j, name in [(j, c) for _ in range(FIT['passes']) for j, c in enumerate(chain)]:
                        pts = self.points[name] * s
                        if not len(pts):
                            continue
                        # Does the mannequin's matching bone touch the gun?
                        a0 = M[f'{MANNY_FINGERS[f]}_{j + 1:02d}_{ms}'][k][:3, 3]
                        if j < 2:
                            b0 = M[f'{MANNY_FINGERS[f]}_{j + 2:02d}_{ms}'][k][:3, 3]
                        else:
                            b0 = a0 + (a0 - M[f'{MANNY_FINGERS[f]}_{j:02d}_{ms}'][k][:3, 3]) * 0.8
                        line = a0 + (b0 - a0) * np.linspace(0.15, 1, 6)[:, None]
                        touching = volume.distance(line, where[k]).min() < FIT['touch']
                        hi = FIT['gap'] if touching else np.inf
                        frame = R[name][k] @ self.finger_frames[name][0]
                        own = pts @ R[name][k].T
                        kids = [self.points[c] * s @ R[c][k].T + (P[c][k] - P[name][k]) for c in chain[j + 1:]]
                        kids = np.concatenate(kids) if kids else np.zeros((0, 3))
                        rots = np.stack([axis_angle(frame[:, ax], ang) for ax, ang in tries])
                        d_own = volume.distance(P[name][k] + np.einsum('tij,vj->tvi', rots, own), where[k]).min(1)
                        d_kid = (volume.distance(P[name][k] + np.einsum('tij,vj->tvi', rots, kids), where[k]).min(1)
                                 if len(kids) else np.full(len(tries), np.inf))
                        ok = (d_own >= lo) & (d_own <= hi) & (d_kid >= lo)
                        if ok[0]:
                            prev[name] = 0.0
                            continue
                        # (Of those that do, the nearest the last frame's turn.)
                        far = np.array([abs(ang - prev[name]) + (0.02 if ax == 2 else 0) for ax, ang in tries])
                        if ok.any():
                            pick = int(np.argmin(np.where(ok, far, np.inf)))
                            stats['fixed'] += 1
                        else:
                            # (Into the gun is worse than off it.)
                            miss = (4 * np.maximum(lo - d_own, 0) + np.maximum(d_own - hi, 0) + 4 * np.maximum(lo - d_kid, 0))
                            pick = int(np.argmin(miss + far * 1e-4))
                            stats['left'] += 1
                            stats['worstIn'] = max(stats['worstIn'], float(max(lo - d_own[pick], 0)))
                            if np.isfinite(hi) and np.isfinite(d_own[pick]):
                                stats['worstGap'] = max(stats['worstGap'], float(max(d_own[pick] - hi, 0)))
                        ax, ang = tries[pick]
                        prev[name] = ang if ax == 1 else 0.0
                        self.turn_chain(R, P, chain[j:], k, frame[:, ax], ang)
                stats['frames'] = n
        stats['worstIn'] = round(stats['worstIn'] * 1000, 1)
        stats['worstGap'] = round(stats['worstGap'] * 1000, 1)
        return stats

    def turn_chain(self, R, P, chain, k, axis, angle):
        """Turns a finger's bones from chain[0] out about chain[0]'s joint."""
        if abs(angle) < 1e-9:
            return
        T = axis_angle(axis, angle)
        root = P[chain[0]][k].copy()
        for name in chain:
            R[name][k] = T @ R[name][k]
            P[name][k] = root + T @ (P[name][k] - root)


    def hands(self, M, n, volume=None, where=None):
        """Each hand's turn and his wrist's place, per frame: turned as the
        mannequin's hand (their knuckle rows lined up), his middle knuckle
        on its middle knuckle; then, his gloved hand being thicker than the
        mannequin's bare one, moved straight out of the gun as far as his
        palm and his fingers' first bones are in it (FIT['inside']),
        smoothed over the frames (PALM_SMOOTH) so it doesn't shake."""
        S, s = self.soldier, self.soldier.scale
        out = {}
        for side in SIDES:
            ms = side.lower()
            arm = self.arm[side]
            his_frame = basis(arm['mid'], arm['across'])
            turn = np.zeros((n, 3, 3))
            wrist = np.zeros((n, 3))
            push = np.zeros((n, 3))
            for k in range(n):
                mp = lambda nm: M[f'{nm}_{ms}'][k][:3, 3]  # noqa: E731
                turn[k] = basis(mp('middle_01') - mp('hand'), mp('pinky_01') - mp('index_01')) @ his_frame.T
                wrist[k] = mp('middle_01') - turn[k] @ (arm['mid'] * s)
                if volume is None:
                    continue
                pts = self.palm_points(side, turn[k], wrist[k], M, k)
                for _ in range(4):
                    d = volume.distance(pts + push[k], where[k])
                    i = int(np.argmin(d))
                    if d[i] >= -FIT['inside']:
                        break
                    g = volume.gradient(pts[i] + push[k], where[k])
                    push[k] += g * (-FIT['inside'] * 0.5 - d[i])
            if volume is not None and n > 2:
                # (The most of each frame's neighbours', then averaged: it
                # stays out of the gun and moves smoothly.)
                r = PALM_SMOOTH
                mag = np.linalg.norm(push, axis=1)
                idx = np.clip(np.arange(n)[:, None] + np.arange(-r, r + 1)[None], 0, n - 1)
                pick = idx[np.arange(n), mag[idx].argmax(1)]
                pushed = push[pick]
                push = pushed[idx].mean(1)
            out[side] = (turn, wrist + push, np.linalg.norm(push, axis=1))
        return out

    def palm_points(self, side, turn, wrist, M, k):
        """His glove's palm and fingers' first bones (but the thumb's) where
        his hand is turned `turn` at `wrist`, the first bones turned as the
        mannequin's."""
        S, s = self.soldier, self.soldier.scale
        if not hasattr(self, 'points'):
            self.points = self.finger_points()
        ms = side.lower()
        pts = [wrist + (self.points[f'CC_Base_{side}_Hand'] * s) @ turn.T]
        for f in FINGERS[:4]:
            name = f'CC_Base_{side}_{f}1'
            his_o, its_o = self.finger_frames[name]
            rot = M[f'{MANNY_FINGERS[f]}_01_{ms}'][k][:3, :3] @ its_o @ his_o.T
            at = wrist + turn @ (S.rest_t[name] * s)
            pts.append(at + (self.points[name] * s) @ rot.T)
        return np.concatenate(pts)

    def pose(self, clip, volume=None, where=None):
        """His arm bones' world rotations and places (gun space) at each of
        the clip's key times, and what had to give."""
        S, s = self.soldier, self.soldier.scale
        ts = self.dl.times(clip)
        M = self.manny(clip, ts)
        n = len(ts)
        hands = self.hands(M, n, volume, where)
        R = {name: np.zeros((n, 3, 3)) for name in S.names}
        P = {name: np.zeros((n, 3)) for name in S.names}
        stats = {'slide': {'L': 0.0, 'R': 0.0}, 'clavicleTurn': {'L': 0.0, 'R': 0.0}, 'reach': {'L': 0.0, 'R': 0.0},
                 'handGap': {'L': 0.0, 'R': 0.0}, 'palmOut': {'L': 0.0, 'R': 0.0}}
        chest_r, chest_p = self.chest

        def child(name, k, rot):
            par = S.parent[name]
            P[name][k] = P[par][k] + R[par][k] @ (S.rest_t[name] * s)
            R[name][k] = rot

        for k in range(n):
            R['CC_Base_Spine02'][k] = chest_r
            P['CC_Base_Spine02'][k] = chest_p
            for side in SIDES:
                ms = side.lower()
                arm = self.arm[side]
                b = lambda nm: f'CC_Base_{side}_{nm}'  # noqa: E731
                m = lambda nm: M[f'{nm}_{ms}'][k]  # noqa: E731
                mp = lambda nm: m(nm)[:3, 3]  # noqa: E731
                # The hand (see hands()).
                hand_r, wrist = hands[side][0][k], hands[side][1][k]
                stats['palmOut'][side] = max(stats['palmOut'][side], float(hands[side][2][k]))
                # The collarbone: from its rest turn (on his placed chest),
                # turned towards where the shoulder must be.
                cl = b('Clavicle')
                cl_rest = chest_r @ S.rest_r[cl]
                cl_p = chest_p + chest_r @ (S.rest_t[cl] * s)
                want = mp('upperarm')
                d = np.linalg.norm(wrist - want)
                if d > REACH * arm['reach']:
                    want = wrist + (want - wrist) * (REACH * arm['reach'] / d)
                turn = limit_turn(rot_between(cl_rest @ arm['cl_along'], want - cl_p), CLAVICLE_TURN)
                cl_r = turn @ cl_rest
                shoulder = cl_p + cl_r @ (S.rest_t[b('Upperarm')] * s)
                slide = np.zeros(3)
                d = np.linalg.norm(wrist - shoulder)
                if d > REACH * arm['reach']:
                    slide = (wrist - shoulder) * (1 - REACH * arm['reach'] / d)
                shoulder = shoulder + slide
                stats['slide'][side] = max(stats['slide'][side], float(np.linalg.norm(slide)))
                stats['clavicleTurn'][side] = max(stats['clavicleTurn'][side], math.degrees(angle_of(turn)))
                R[cl][k] = cl_r
                P[cl][k] = cl_p + slide
                # Two-bone IK, the elbow towards the mannequin's.
                a, c = arm['upper'], arm['fore']
                v = wrist - shoulder
                d = np.linalg.norm(v)
                stats['reach'][side] = max(stats['reach'][side], d / arm['reach'])
                d_ = min(max(d, abs(a - c) + 1e-4), a + c - 1e-5)
                u = v / d
                x = (a * a - c * c + d_ * d_) / (2 * d_)
                r = math.sqrt(max(a * a - x * x, 0))
                pole = mp('lowerarm') - shoulder
                pole = pole - u * (pole @ u)
                if np.linalg.norm(pole) < 1e-6:
                    pole = np.array([0.0, -1.0, 0.0]) - u * (-u[1])
                pole = unit(pole)
                elbow = shoulder + u * x + pole * r
                wrist_got = shoulder + u * d_
                stats['handGap'][side] = max(stats['handGap'][side], float(np.linalg.norm(wrist_got - wrist)))
                hinge = np.cross(elbow - shoulder, wrist_got - elbow)
                hinge = unit(hinge) if np.linalg.norm(hinge) > 1e-9 else unit(np.cross(u, pole))
                up_r = basis(elbow - shoulder, hinge) @ basis(arm['up_along'], arm['up_hinge']).T
                fo_r = basis(wrist_got - elbow, hinge) @ basis(arm['fo_along'], arm['fo_hinge']).T
                child(b('Upperarm'), k, up_r)
                child(b('UpperarmTwist01'), k, up_r @ S.rest_r[b('UpperarmTwist01')])
                child(b('UpperarmTwist02'), k, R[b('UpperarmTwist01')][k] @ S.rest_r[b('UpperarmTwist02')])
                child(b('Forearm'), k, fo_r)
                child(b('ForearmTwist01'), k, fo_r @ S.rest_r[b('ForearmTwist01')])
                # Half the wrist's twist about the forearm into its lower
                # half (fpArms.js does the same).
                q = matrix_quat(fo_r.T @ hand_r)
                along = arm['fo_along']
                twist = 2 * math.atan2(q[:3] @ along, q[3])
                if twist > math.pi:
                    twist -= 2 * math.pi
                elif twist < -math.pi:
                    twist += 2 * math.pi
                t1 = R[b('ForearmTwist01')][k]
                axis = S.rest_r[b('ForearmTwist01')].T @ along
                child(b('ForearmTwist02'), k, t1 @ axis_angle(axis, twist / 2) @ S.rest_r[b('ForearmTwist02')])
                child(b('Hand'), k, hand_r)
                # The fingers: each bone turned as the mannequin's, with its
                # rest-pose correction.
                # His thumb's root is a good way from the mannequin's (25 mm),
                # so its first two bones point at the mannequin's next thumb
                # joints instead (each still turned about its length as the
                # mannequin's is), keeping the thumb where it is on the gun.
                for f in FINGERS:
                    for j in (1, 2, 3):
                        name = b(f'{f}{j}')
                        his_o, its_o = self.finger_frames[name]
                        its = m(f'{MANNY_FINGERS[f]}_{j:02d}')[:3, :3] @ its_o
                        child(name, k, np.eye(3))
                        if f in AIMED and j < 3:
                            to = mp(f'{MANNY_FINGERS[f]}_{j + 1:02d}') - P[name][k]
                            its = basis(to, its[:, 1])
                        R[name][k] = its @ his_o.T
        return ts, R, P, stats, M


# --- Fitting his fingers to the gun ------------------------------------------------------------
# His gloved fingers are thicker and a little longer than the mannequin's
# bare ones, and his hand is shaped differently, so turned as its are some
# finger bones end up in the gun or off it. Each finger bone (knuckle out)
# is turned about the axis it bends on, as little as it takes: out of the
# gun if it's in it deeper than FIT['inside'], or onto it if the
# mannequin's matching bone touches the gun there (its bone's middle line
# within FIT['touch'] of the gun's surface: the mannequin's skeleton only,
# never its mesh) and his is more than FIT['gap'] off it; by at most
# FIT['most']. The turns are smoothed over the clip's frames.
FIT = {'inside': 0.002, 'gap': 0.0025, 'touch': 0.012, 'most': math.radians(35), 'step': math.radians(1.5),
       'cell': 0.002, 'band': 0.012, 'spacing': 0.0018, 'passes': 2}


class GunVolume:
    """Each moving part of the gun as a signed distance field (negative
    inside) on a grid in its own (idle) place, made from its surface."""

    def __init__(self, gun, bones):
        self.parts = []
        cell, band = FIT['cell'], FIT['band']
        r = int(math.ceil(band / cell))
        off = np.array([(x, y, z) for x in range(-r, r + 1) for y in range(-r, r + 1) for z in range(-r, r + 1)
                        if x * x + y * y + z * z <= r * r + 1])
        rng = np.random.default_rng(1)
        for j in range(len(bones)):
            pts, nrm = [], []
            for m in gun:
                dom = m['joints'][np.arange(len(m['joints'])), m['weights'].argmax(1)]
                tri = m['triangles'][(dom[m['triangles']] == j).all(1)]
                if not len(tri):
                    continue
                p = m['position']
                a, b, c = p[tri[:, 0]], p[tri[:, 1]], p[tri[:, 2]]
                n = np.cross(b - a, c - a)
                area = np.linalg.norm(n, axis=1) / 2
                n = n / np.maximum(2 * area[:, None], 1e-15)
                vn = m['normal'][tri].sum(1)
                n = n * np.where((n * vn).sum(1) < 0, -1.0, 1.0)[:, None]
                cnt = np.maximum(1, np.round(area / FIT['spacing'] ** 2).astype(int))
                rep = np.repeat(np.arange(len(tri)), cnt)
                u, v = rng.random(len(rep)), rng.random(len(rep))
                flip = u + v > 1
                u[flip], v[flip] = 1 - u[flip], 1 - v[flip]
                pts.append(a[rep] + (b - a)[rep] * u[:, None] + (c - a)[rep] * v[:, None])
                nrm.append(n[rep])
            if not pts:
                continue
            pts, nrm = np.concatenate(pts), np.concatenate(nrm)
            lo = pts.min(0) - band - 2 * cell
            dims = np.ceil((pts.max(0) + band + 2 * cell - lo) / cell).astype(int) + 1
            size = int(np.prod(dims))
            udf = np.full(size, np.inf)
            sdf = np.full(size, np.inf)
            base = np.floor((pts - lo) / cell).astype(int)
            chunk = max(1, 3_000_000 // len(off))
            for start in range(0, len(pts), chunk):
                bb = base[start:start + chunk]
                cells = (bb[:, None, :] + off[None]).reshape(-1, 3)
                d = lo + cells * cell - np.repeat(pts[start:start + chunk], len(off), 0)
                dist = np.sqrt((d * d).sum(1))
                sign = np.where((d * np.repeat(nrm[start:start + chunk], len(off), 0)).sum(1) < 0, -1.0, 1.0)
                flat = np.ravel_multi_index(cells.T, dims)
                order = np.lexsort((dist, flat))
                flat, dist, sign = flat[order], dist[order], sign[order]
                first = np.r_[True, flat[1:] != flat[:-1]]
                flat, dist, sign = flat[first], dist[first], sign[first]
                better = dist < udf[flat]
                udf[flat[better]] = dist[better]
                sdf[flat[better]] = dist[better] * sign[better]
            sdf = sdf.reshape(dims)
            self.parts.append({'joint': j, 'lo': lo, 'dims': dims, 'sdf': sdf})

    def distance(self, points, where):
        """The signed distance of points (gun space, any shape (..., 3)) to
        the gun, its parts placed by `where` (joint -> 4x4, from their idle
        place to now). Beyond the band: +inf."""
        shape = points.shape[:-1]
        q = points.reshape(-1, 3)
        out = np.full(len(q), np.inf)
        for part in self.parts:
            D = where[part['joint']]
            local = (q - D[:3, 3]) @ D[:3, :3]
            # (Trilinear, from the grid's corners: the values are at lo + i * cell.)
            f = (local - part['lo']) / FIT['cell']
            i0 = np.floor(f).astype(int)
            ok = ((i0 >= 0) & (i0 < part['dims'] - 1)).all(1)
            if not ok.any():
                continue
            i0, t = i0[ok], f[ok] - i0[ok]
            sdf = part['sdf']
            val = np.zeros(len(i0))
            for dx in (0, 1):
                for dy in (0, 1):
                    for dz in (0, 1):
                        w = (t[:, 0] if dx else 1 - t[:, 0]) * (t[:, 1] if dy else 1 - t[:, 1]) * (t[:, 2] if dz else 1 - t[:, 2])
                        val = val + w * sdf[i0[:, 0] + dx, i0[:, 1] + dy, i0[:, 2] + dz]
            val[~np.isfinite(val)] = np.inf
            out[ok] = np.minimum(out[ok], val)
        return out.reshape(shape)

    def gradient(self, point, where, h=0.001):
        """Which way is out of the gun at a point (unit)."""
        e = np.eye(3) * h
        d = self.distance(np.concatenate([point + e, point - e]), where)
        g = np.where(np.isfinite(d[:3]) & np.isfinite(d[3:]), d[:3] - d[3:], 0)
        n = np.linalg.norm(g)
        return g / n if n > 1e-12 else np.zeros(3)


# --- The gun ---------------------------------------------------------------------------------

def gun_bones(dl, cfg):
    """The gun's bones (download node indices), the frame first, each after
    its parent."""
    order = []

    def add(i):
        order.append(i)
        for c in dl.nodes[i].get('children', []):
            add(c)

    add(dl.by['body'])
    for i in order:
        assert stem(dl.nodes[i]['name']) in cfg['bones'], f'unnamed gun bone {dl.nodes[i]["name"]}'
    return order


def gun_meshes(dl, cfg, rt, bones):
    """The gun's meshes in gun space, posed as at the idle clip's first
    frame (its bind pose here), weighted to our gun bones."""
    g, acc = dl.g, dl.accessor
    idle = cfg['prefix'] + 'idle'
    joints = dl.skin['joints']
    W0 = dl.worlds(joints, idle, [0.0])
    mats = np.array([W0[j][0] @ b for j, b in zip(joints, dl.ibm)])
    lookup = np.array([bones.index(j) if j in bones else -1 for j in joints])
    out = []
    for node in dl.nodes:
        if 'mesh' not in node:
            continue
        mesh = g['meshes'][node['mesh']]
        if not mesh['name'].startswith(cfg['mesh']):
            continue  # (the mannequin's arms, and the MP7's viewer cube, are never read)
        assert len(mesh['primitives']) == 1
        prim = mesh['primitives'][0]
        a = prim['attributes']
        J = acc(a['JOINTS_0']).astype(np.int64)
        W = acc(a['WEIGHTS_0']).astype(np.float64)
        W /= W.sum(1, keepdims=True)
        ours = lookup[J]
        assert (ours[W > 0] >= 0).all(), f'{mesh["name"]} is weighted to a bone that isn\'t the gun\'s'
        ours[ours < 0] = 0
        pos = acc(a['POSITION']).astype(np.float64)
        nrm = acc(a['NORMAL']).astype(np.float64)
        P4 = np.c_[pos, np.ones(len(pos))]
        world = np.zeros((len(pos), 3))
        normal = np.zeros((len(pos), 3))
        for k in range(4):
            mk = mats[J[:, k]]
            world += W[:, k:k + 1] * np.einsum('nij,nj->ni', mk, P4)[:, :3]
            normal += W[:, k:k + 1] * np.einsum('nij,nj->ni', mk[:, :3, :3], nrm)
        world = (np.c_[world, np.ones(len(world))] @ rt.G.T)[:, :3]
        normal = normal @ rt.G[:3, :3].T
        material = g['materials'][prim['material']]
        out.append({'name': cfg['materials'][material['name']], 'material': material, 'position': world,
                    'normal': normal, 'uv': acc(a['TEXCOORD_0']).astype(np.float64), 'joints': ours, 'weights': W,
                    'triangles': acc(prim['indices']).astype(np.int64).reshape(-1, 3)})
    return out


# --- Textures -----------------------------------------------------------------------------------

def gun_textures(dl, cfg, folder):
    """Each gun material's colour, metal/roughness and normal maps as WebP,
    markings rubbed off."""
    g = dl.g
    out = {}
    if NO_TEXTURES:
        return out
    import bpy
    from rigged_gltf import webp_bytes
    from texture_edit import deviation_mask, image_array, rub_out, store
    bpy.ops.wm.read_factory_settings(use_empty=True)
    for m in g['materials']:
        if m['name'] not in cfg['materials']:
            continue
        name = cfg['materials'][m['name']]
        pbr = m['pbrMetallicRoughness']
        infos = [pbr['baseColorTexture'], m['normalTexture'], pbr['metallicRoughnessTexture']]
        images = []
        for k, info in enumerate(infos):
            assert info.get('texCoord', 0) == 0 and 'extensions' not in info
            path = inside(folder, g['images'][g['textures'][info['index']]['source']]['uri'])
            im = bpy.data.images.load(os.path.abspath(path))
            im.colorspace_settings.name = 'sRGB' if k == 0 else 'Non-Color'
            images.append(im)
        size = images[0].size[0]
        maps = [image_array(im) for im in images]
        for box, how, *more in cfg['rub_out'].get(m['name'], []):
            assert how == 'letters' or how == 'fill'
            mask = deviation_mask(maps, box, more[0] if more else STANDS_OUT) if how == 'letters' else None
            rub_out(maps, box, mask, normal=1)
        if cfg['rub_out'].get(m['name']):
            log(f'{name}: {len(cfg["rub_out"][m["name"]])} markings rubbed off')
        for k, (im, a, kind) in enumerate(zip(images, maps, ('colour', 'normal', 'metal_rough'))):
            store(im, a)
            if size > TEXTURE_SIZE:
                im.scale(TEXTURE_SIZE, TEXTURE_SIZE)
            out[(name, kind)] = webp_bytes(im, f'{name}_{kind}', WEBP_QUALITY, 'project-fish-retarget')
        log(f'{name}: textures {min(size, TEXTURE_SIZE)} px, '
            + ', '.join(f'{kind} {len(out[(name, kind)]) / 1e3:.0f} kB' for kind in ('colour', 'normal', 'metal_rough')))
    return out


# --- Writing the file -------------------------------------------------------------------------------

def write_glb(path, key, cfg, dl, rt, bones, gun, clips, arm_rest):
    S = rt.soldier
    s = S.scale
    copyright_ = (f'This work is based on "{cfg["title"]}" ({cfg["source"]}) by {AUTHOR} licensed under {LICENSE}. '
                  'Changed for Project Fish: turned, placed for the game with the rig\'s root at the eye; the clips '
                  'kept as made, retargeted onto the soldier\'s arms; markings rubbed off; textures stored as WebP; '
                  'compressed. ' + ARMS_NOTE)
    extras = {'title': cfg['title'], 'source': cfg['source'], 'author': AUTHOR, 'license': LICENSE,
              'arms': 'the soldier\'s (assets/soldier.glb): CC_Base_* bones, centimetres, under the `arms` node'}
    w = Writer('Project Fish convert_retarget.py', copyright_, extras)
    g = w.g
    names = cfg['bones']
    # Nodes: 0 the root (the eye); the gun's bones; the `gun` node; the
    # `arms` node (his model's scale) and his bones.
    g['nodes'].append({'name': key, 'children': []})
    node_of = {}
    for i in bones:
        node_of[('gun', i)] = len(g['nodes'])
        g['nodes'].append({'name': names[stem(dl.nodes[i]['name'])]})
    for i in bones:
        par = dl.parent[i]
        here = g['nodes'][node_of[('gun', i)]]
        if i == bones[0]:
            g['nodes'][0]['children'].append(node_of[('gun', i)])
            m = clips['idle']['gun'][i][0]
        else:
            g['nodes'][node_of[('gun', par)]].setdefault('children', []).append(node_of[('gun', i)])
            m = dl.local(i, None, [0.0])[0]
        sc = np.linalg.norm(m[:3, :3], axis=0)
        assert np.allclose(sc, 1, atol=1e-3), f'{here["name"]} is scaled'
        here['translation'] = [float(x) for x in m[:3, 3]]
        here['rotation'] = [float(x) for x in matrix_quat(m[:3, :3] / sc)]
    # The `gun` node: on the frame, lined up with gun space in the idle pose.
    F = clips['idle']['gun'][bones[0]][0]
    g['nodes'].append({'name': 'gun', 'rotation': [float(x) for x in matrix_quat(F[:3, :3].T)]})
    g['nodes'][node_of[('gun', bones[0])]].setdefault('children', []).append(len(g['nodes']) - 1)
    arms_node = len(g['nodes'])
    g['nodes'].append({'name': 'arms', 'scale': [s, s, s], 'children': []})
    g['nodes'][0]['children'].append(arms_node)
    for n in S.names:
        node_of[('arm', n)] = len(g['nodes'])
        node = {'name': n}
        t = S.rest_t[n] if S.parent[n] else arm_rest['t'][n]
        node['translation'] = [float(x) for x in t]
        node['rotation'] = [float(x) for x in matrix_quat(arm_rest['r'][n])]
        g['nodes'].append(node)
    for n in S.names:
        par = S.parent[n]
        target = arms_node if par is None else node_of[('arm', par)]
        g['nodes'][target].setdefault('children', []).append(node_of[('arm', n)])
    # The skin: the gun's bones, then his; bound in the idle clip's first frame.
    joints = [node_of[('gun', i)] for i in bones] + [node_of[('arm', n)] for n in S.names]
    bind = [clips['idle']['gunWorld'][i][0] for i in bones]
    for n in S.names:
        m = np.eye(4)
        m[:3, :3] = clips['idle']['R'][n][0] * s
        m[:3, 3] = clips['idle']['P'][n][0]
        bind.append(m)
    ibm = [np.linalg.inv(m) for m in bind]
    g['skins'].append({'name': f'{key}_rig', 'joints': joints, 'skeleton': 0,
                       'inverseBindMatrices': w.accessor(np.array([m.T.reshape(-1) for m in ibm]), 'MAT4')})
    joint_index = {('gun', i): k for k, i in enumerate(bones)}
    joint_index.update({('arm', n): len(bones) + k for k, n in enumerate(S.names)})

    # Materials and textures.
    images = clips['__textures']
    g['samplers'].append({'magFilter': 9729, 'minFilter': 9987, 'wrapS': 10497, 'wrapT': 10497})
    material_index = {}
    for mesh in gun:
        name = mesh['name']
        if name in material_index:
            continue
        m = {'name': name, 'doubleSided': True, 'pbrMetallicRoughness': {}}
        if (name, 'colour') in images:
            m['pbrMetallicRoughness']['baseColorTexture'] = w.texture(name, images[(name, 'colour')])
            m['pbrMetallicRoughness']['metallicRoughnessTexture'] = w.texture(f'{name}_metal_rough',
                                                                               images[(name, 'metal_rough')])
            m['normalTexture'] = w.texture(f'{name}_normal', images[(name, 'normal')])
        else:
            m['pbrMetallicRoughness'].update({'baseColorFactor': [0.35, 0.35, 0.36, 1], 'metallicFactor': 0.6,
                                              'roughnessFactor': 0.5})
        g['materials'].append(m)
        material_index[name] = len(g['materials']) - 1
    # His materials: as in his model, their textures copied (WebP) as they are.
    copied = {}

    def copy_texture(info, label):
        mime, data = S.image(info)
        assert mime == 'image/webp', mime
        if info['index'] not in copied:
            copied[info['index']] = w.texture(label, data)
        out = dict(copied[info['index']])
        if 'scale' in info:
            out['scale'] = info['scale']
        if 'strength' in info:
            out['strength'] = info['strength']
        return out

    his_materials = {}
    for mesh in S.meshes:
        src = mesh['material']
        if src['name'] in his_materials:
            continue
        label = 'soldier_gloves' if 'Glove' in src['name'] else 'soldier_sleeves'
        m = json.loads(json.dumps(src))
        m['name'] = label
        pbr = m.get('pbrMetallicRoughness', {})
        for k in ('baseColorTexture', 'metallicRoughnessTexture'):
            if k in pbr:
                pbr[k] = copy_texture(pbr[k], f'{label}_{k}')
        for k in ('normalTexture', 'occlusionTexture'):
            if k in m:
                m[k] = copy_texture(m[k], f'{label}_{k}')
        spec = m.get('extensions', {}).get('KHR_materials_specular')
        if spec:
            for k in ('specularTexture', 'specularColorTexture'):
                if k in spec:
                    spec[k] = copy_texture(spec[k], f'{label}_{k}')
            g.setdefault('extensionsUsed', []).append('KHR_materials_specular')
        g['materials'].append(m)
        his_materials[src['name']] = (len(g['materials']) - 1, label)

    def mesh_out(name, position, normal, uv, joints_, weights, triangles, material, extras_=None):
        n = normal / np.maximum(np.linalg.norm(normal, axis=1, keepdims=True), 1e-12)
        top = np.argsort(-weights, axis=1)[:, :4]
        J = np.take_along_axis(joints_, top, 1)
        Wt = np.take_along_axis(weights, top, 1)
        Wt /= Wt.sum(1, keepdims=True)
        attrs = {'POSITION': w.accessor(position, 'VEC3', target=34962, bounds=True),
                 'NORMAL': w.accessor(n, 'VEC3', target=34962),
                 'TEXCOORD_0': w.accessor(uv, 'VEC2', target=34962),
                 'JOINTS_0': w.accessor(J, 'VEC4', 5123, target=34962),
                 'WEIGHTS_0': w.accessor(Wt, 'VEC4', target=34962)}
        prim = {'attributes': attrs, 'indices': w.accessor(triangles.reshape(-1, 1), 'SCALAR', 5125, target=34963),
                'material': material}
        g['meshes'].append({'name': name, 'primitives': [prim]})
        node = {'name': name, 'mesh': len(g['meshes']) - 1, 'skin': 0}
        if extras_:
            node['extras'] = extras_
        g['nodes'].append(node)
        g['nodes'][0]['children'].append(len(g['nodes']) - 1)

    for mesh in gun:
        J = np.array([[joint_index[('gun', bones[j])] for j in row] for row in mesh['joints']])
        mesh_out(mesh['name'], mesh['position'], mesh['normal'], mesh['uv'], J, mesh['weights'], mesh['triangles'],
                 material_index[mesh['name']], {'part': 'gun'})
    # His arms, in his bind pose here (the idle clip's first frame).
    his_joint = np.array([joint_index[('arm', n)] if n in S.names else 0 for n in S.joint_names])
    mats_now = {n: bind[joint_index[('arm', n)]] for n in S.names}
    for mesh in S.meshes:
        J, Wt = mesh['joints'], mesh['weights']
        P4 = np.c_[mesh['position'], np.ones(len(mesh['position']))]
        pos = np.zeros((len(P4), 3))
        nrm = np.zeros((len(P4), 3))
        for k in range(J.shape[1]):
            for j in np.unique(J[:, k]):
                sel = J[:, k] == j
                if not (Wt[sel, k] > 0).any():
                    continue
                M = mats_now[S.joint_names[j]] @ S.ibm[j]
                pos[sel] += Wt[sel, k:k + 1] * (P4[sel] @ M.T)[:, :3]
                nrm[sel] += Wt[sel, k:k + 1] * (mesh['normal'][sel] @ np.linalg.inv(M[:3, :3]))
        index, label = his_materials[mesh['material']['name']]
        mesh_out(label, pos, nrm, mesh['uv'], his_joint[J], Wt, mesh['triangles'], index,
                 {'part': 'arms', 'firstPerson': 'arms', **({'soldierGloves': True} if label == 'soldier_gloves' else {})})
    # Clips: every bone any clip moves, in every clip.
    moved = {i for name, clip in clips.items() if not name.startswith('__') for i, v in clip['gunMoved'].items() if v}
    for name, clip in clips.items():
        if name.startswith('__'):
            continue
        anim = {'name': name, 'channels': [], 'samplers': []}
        ts = clip['times']
        tin = w.accessor((ts - ts[0]).reshape(-1, 1), 'SCALAR', bounds=True)

        def channel(node, path, values):
            anim['samplers'].append({'input': tin, 'output': w.accessor(values, 'VEC4' if path == 'rotation' else 'VEC3'),
                                     'interpolation': 'LINEAR'})
            anim['channels'].append({'sampler': len(anim['samplers']) - 1, 'target': {'node': node, 'path': path}})

        for i in bones:
            if i != bones[0] and i not in moved:
                continue
            local = clip['gun'][i] if i == bones[0] else clip['gunLocal'][i]
            q = np.array([matrix_quat(m[:3, :3] / np.linalg.norm(m[:3, :3], axis=0)) for m in local])
            for k in range(1, len(q)):
                if q[k] @ q[k - 1] < 0:
                    q[k] = -q[k]
            channel(node_of[('gun', i)], 'rotation', q)
            channel(node_of[('gun', i)], 'translation', local[:, :3, 3])
        for n in S.names:
            par = S.parent[n]
            Rn, Pn = clip['R'][n], clip['P'][n]
            if par is None:
                lr, lt = Rn, Pn / s
            else:
                Rp, Pp = clip['R'][par], clip['P'][par]
                lr = np.einsum('nji,njk->nik', Rp, Rn)
                lt = np.einsum('nji,nj->ni', Rp, Pn - Pp) / s
            q = np.array([matrix_quat(m) for m in lr])
            for k in range(1, len(q)):
                if q[k] @ q[k - 1] < 0:
                    q[k] = -q[k]
            channel(node_of[('arm', n)], 'rotation', q)
            if np.abs(lt - S.rest_t[n]).max() > 1e-4 and par is not None:
                channel(node_of[('arm', n)], 'translation', lt)
            elif par is None:
                channel(node_of[('arm', n)], 'translation', lt)
        g['animations'].append(anim)
    # (Translation tracks only where a bone slides: every clip must set the
    # same bones, so a bone sliding in one clip gets a track in all.)
    slid = set()
    for anim in g['animations']:
        for ch in anim['channels']:
            if ch['target']['path'] == 'translation':
                slid.add(ch['target']['node'])
    for anim, (name, clip) in zip(g['animations'], [(k, v) for k, v in clips.items() if not k.startswith('__')]):
        have = {(c['target']['node'], c['target']['path']) for c in anim['channels']}
        tin = anim['samplers'][0]['input']
        for node in slid:
            if (node, 'translation') in have:
                continue
            nm = g['nodes'][node]['name']
            if nm in S.rest_t:
                vals = np.repeat(S.rest_t[nm][None], len(clip['times']), 0)
                anim['samplers'].append({'input': tin, 'output': w.accessor(vals, 'VEC3'), 'interpolation': 'LINEAR'})
                anim['channels'].append({'sampler': len(anim['samplers']) - 1, 'target': {'node': node, 'path': 'translation'}})
    if not g['textures']:
        for k in ('textures', 'images', 'samplers'):
            g[k] = []
        g['extensionsUsed'] = [e for e in g['extensionsUsed'] if e != 'EXT_texture_webp']
        g['extensionsRequired'] = []
    g['extensionsUsed'] = sorted(set(g['extensionsUsed']))
    w.write(path)


# --- Measuring --------------------------------------------------------------------------------------

def r4(v):
    return [round(float(x), 4) for x in v]


def measure(key, cfg, dl, rt, bones, gun, clips):
    """The points and times the game needs, in the `gun` node's space (gun
    space at idle, moved to the frame bone) and the file's (the eye's)."""
    names = cfg['bones']
    by_name = {names[stem(dl.nodes[i]['name'])]: i for i in bones}
    F = clips['idle']['gun'][bones[0]][0]
    to_own = np.linalg.inv(F)
    out = {'gun': key, 'eye': 'the rig root (0, 0, 0): ' + rt.camera_source, 'frame_idle': r4(F[:3, 3])}
    allp = np.concatenate([m['position'] for m in gun])
    own = (np.c_[allp, np.ones(len(allp))] @ to_own.T)[:, :3]
    out['size'] = {'length': round(float(np.ptp(own[:, 2])), 4), 'height': round(float(np.ptp(own[:, 1])), 4),
                   'width': round(float(np.ptp(own[:, 0])), 4)}

    def part(name):
        i = by_name[name]
        k = bones.index(i)
        pts = []
        for m in gun:
            dom = m['joints'][np.arange(len(m['joints'])), m['weights'].argmax(1)]
            pts.append(m['position'][dom == k])
        p = np.concatenate(pts)
        return (np.c_[p, np.ones(len(p))] @ to_own.T)[:, :3] @ F[:3, :3].T  # in the gun node's axes, from the frame

    frame_pts = part('frame')
    barrel = 'suppressor' if 'suppressor' in by_name else ('barrel' if 'barrel' in by_name else 'frame')
    bp = part(barrel)
    front = bp[bp[:, 2] < bp[:, 2].min() + 0.0008]
    out['muzzle'] = r4([(front[:, 0].max() + front[:, 0].min()) / 2, (front[:, 1].max() + front[:, 1].min()) / 2,
                        bp[:, 2].min()])
    out['muzzle_part'] = barrel
    if 'slide' in by_name:
        top_part = part('slide')
    else:
        top_part = frame_pts
    out['top'] = round(float(top_part[:, 1].max()), 4)
    # Iron sights: the rear and front sights' tops (the MP7's flip-up
    # sights; the X4's on its slide).
    if 'rear_sight' in by_name:
        rs, fs = part('rear_sight'), part('front_sight')
        rd = part('red_dot')
        out['sights'] = {'rearTop': round(float(rs[:, 1].max()), 4), 'rearZ': round(float(rs[:, 2].max()), 4),
                         'frontTop': round(float(fs[:, 1].max()), 4), 'frontZ': round(float(fs[:, 2].min()), 4),
                         'x': round(float((rs[:, 0].max() + rs[:, 0].min()) / 2), 4)}
        out['redDot'] = {'top': round(float(rd[:, 1].max()), 4), 'bottom': round(float(rd[:, 1].min()), 4),
                         'back': round(float(rd[:, 2].max()), 4), 'front': round(float(rd[:, 2].min()), 4),
                         'x': round(float((rd[:, 0].max() + rd[:, 0].min()) / 2), 4)}
    else:
        sv = top_part
        middle = (sv[:, 2].max() + sv[:, 2].min()) / 2
        rear = sv[sv[:, 2] > middle]
        rear = rear[rear[:, 1] > rear[:, 1].max() - 0.0008]
        fore = sv[sv[:, 2] < middle]
        fore = fore[fore[:, 1] > fore[:, 1].max() - 0.0008]
        out['sights'] = {'rearTop': round(float(rear[:, 1].max()), 4), 'rearZ': round(float(rear[:, 2].max()), 4),
                         'frontTop': round(float(fore[:, 1].max()), 4), 'frontZ': round(float(fore[:, 2].min()), 4),
                         'x': round(float(rear[:, 0].mean()), 4)}
    # The sight line in the file's space (from the eye) at idle.
    s = out['sights']
    out['sightsFromEye'] = {'rear': r4(np.array([s['x'], s['rearTop'], s['rearZ']]) + F[:3, 3]),
                            'front': r4(np.array([s['x'], s['frontTop'], s['frontZ']]) + F[:3, 3])}
    # The ejection port: the X4's on the slide's right, over the chamber;
    # the MP7's on the receiver's right, in front of the charging handle.
    if 'slide' in by_name:
        sl = part('slide')
        out['port'] = r4([sl[:, 0].max() - 0.002, sl[:, 1].max() - 0.008, s['rearZ'] - 0.06])
    else:
        ch = part('charging_handle')
        out['port'] = r4([frame_pts[:, 0].max() - 0.002, ch[:, 1].min() - 0.004, ch[:, 2].min() - 0.05])
    out['cant_deg'] = round(math.degrees(math.atan2(F[0, 1], F[1, 1])), 2)

    # Events, from the parts' paths in the frame's space.
    def rel(clip, name):
        i = by_name[name]
        Fr = clips[clip]['gun'][bones[0]]
        Pw = clips[clip]['gunWorld'][i]
        return np.einsum('nij,nj->ni', np.linalg.inv(Fr), np.c_[Pw[:, :3, 3], np.ones(len(Pw))])[:, :3]

    events = {}
    for name, clip in clips.items():
        if name.startswith('__'):
            continue
        ts = clip['times'] - clip['times'][0]
        e = {'duration': round(float(ts[-1]), 3), 'source': clip['source']}
        for part_name, label in (('slide', 'slide'), ('charging_handle', 'bolt'), ('magazine', 'mag'),
                                 ('trigger', 'trigger'), ('hammer', 'hammer'), ('selector', 'selector'),
                                 ('bolt_catch', 'boltCatch'), ('slide_stop', 'slideStop')):
            if part_name not in by_name:
                continue
            p = rel(name, part_name)
            moved = np.linalg.norm(p - rel('idle', part_name)[0], axis=1)
            if part_name in ('trigger', 'selector', 'bolt_catch', 'slide_stop', 'hammer'):
                i = by_name[part_name]
                R0 = clips['idle']['gunLocal'][i][0][:3, :3]
                ang = np.array([math.degrees(angle_of(R0.T @ m[:3, :3])) for m in clip['gunLocal'][i]])
                if ang.max() > 2 or moved.max() > 0.001:
                    e[label] = {'starts': round(float(ts[np.argmax((ang > 1) | (moved > 0.0005))]), 3),
                                'most': round(float(ts[np.argmax(np.maximum(ang, moved * 1000))]), 3),
                                'mostDeg': round(float(ang.max()), 1), 'mostMm': round(float(moved.max() * 1000), 1),
                                'back': round(float(ts[len(ang) - 1 - np.argmax(((ang > 1) | (moved > 0.0005))[::-1])]), 3)}
                continue
            if moved.max() < 0.002:
                continue
            on = moved > 0.002
            far = moved > moved.max() - 0.001
            e[label] = {'starts': round(float(ts[np.argmax(on)]), 3), 'most': round(float(ts[np.argmax(moved)]), 3),
                        'mostMm': round(float(moved.max() * 1000), 1),
                        'lastFar': round(float(ts[len(far) - 1 - np.argmax(far[::-1])]), 3),
                        'home': round(float(ts[len(on) - 1 - np.argmax(on[::-1])]), 3) if not on[-1] else None,
                        'endMm': round(float(moved[-1] * 1000), 1)}
            if label == 'mag' and moved.max() > 0.15:
                # (The clips use one magazine bone for both: the old one
                # drops away out of view and the same bone comes back as the
                # fresh one, in the support hand.)
                gone = moved > 0.15
                first = int(np.argmax(gone))
                back = first + int(np.argmax(~gone[first:]))
                e[label]['gone'] = round(float(ts[first]), 3)
                e[label]['backInHand'] = round(float(ts[back]), 3)
        e['retarget'] = clip['stats']
        events[name] = e
    out['clips'] = events
    out['bones'] = {'gun': [names[stem(dl.nodes[i]['name'])] for i in bones], 'arms': rt.soldier.names}
    return out


def main():
    started = time.time()
    dl = Download(SOURCE)
    meshes = [m['name'] for m in dl.g['meshes']]
    key = next(k for k, c in GUNS.items() if any(n.startswith(c['mesh']) for n in meshes))
    cfg = GUNS[key]
    log(f'{key}: {cfg["title"]}; meshes {meshes}; {len(dl.anims)} animations')
    soldier = Soldier(ARMS)
    log(f'his arms: {len(soldier.meshes)} meshes, bones in units of {soldier.scale:.6f} m')
    rt = Retarget(dl, soldier, cfg)
    rt.setup()
    bones = gun_bones(dl, cfg)
    gun = gun_meshes(dl, cfg, rt, bones)
    for m in gun:
        log(f'gun mesh {m["name"]}: {len(m["position"])} points, {len(m["triangles"])} triangles')
    volume = GunVolume(gun, bones) if FIT_FINGERS else None
    if volume:
        log(f'the gun as {len(volume.parts)} distance fields')
    idle_world = dl.worlds(bones, cfg['prefix'] + 'idle', [0.0])
    clips = {}
    for name, src in cfg['clips']:
        clip = cfg['prefix'] + src
        ts = dl.times(clip)
        gw = dl.worlds(bones, clip, ts)
        where = None
        if volume:
            where = [{j: rt.G @ gw[i][k] @ np.linalg.inv(idle_world[i][0]) @ np.linalg.inv(rt.G)
                      for j, i in enumerate(bones)} for k in range(len(ts))]
        ts, R, P, stats, M = rt.pose(clip, volume, where)
        if volume:
            stats['fit'] = rt.fit_fingers(R, P, M, where, volume)
        top = rt.G[None] @ gw[bones[0]]
        gun_local = {i: dl.local(i, clip, ts) for i in bones[1:]}
        moved = {i: any((i, p) in dl.anims[clip] and np.ptp(dl.anims[clip][(i, p)][1], 0).max() > 1e-6
                        for p in ('translation', 'rotation')) for i in bones[1:]}
        clips[name] = {'times': ts, 'R': R, 'P': P,
                       'stats': {k: ({s_: round(v, 3) for s_, v in d.items()} if k != 'fit' else d)
                                 for k, d in stats.items()},
                       'gun': {bones[0]: top}, 'gunLocal': gun_local, 'gunMoved': moved,
                       'gunWorld': {i: rt.G[None] @ gw[i] for i in bones}, 'source': clip}
        log(f'{name} ({clip}): {ts[-1] - ts[0]:.3f} s, {len(ts)} keys; reach '
            f'{{L: {stats["reach"]["L"]:.2f}, R: {stats["reach"]["R"]:.2f}}}, '
            f'shoulder slid {{L: {stats["slide"]["L"] * 100:.1f}, R: {stats["slide"]["R"] * 100:.1f}}} cm, '
            f'hand short {{L: {stats["handGap"]["L"] * 1000:.1f}, R: {stats["handGap"]["R"] * 1000:.1f}}} mm'
            + (f', palm out of the gun {{L: {stats["palmOut"]["L"] * 1000:.1f}, R: {stats["palmOut"]["R"] * 1000:.1f}}} mm'
               f', finger bones fitted {stats["fit"]["fixed"]}, not quite {stats["fit"]["left"]} (at worst '
               f'{stats["fit"]["worstIn"]} mm in, {stats["fit"]["worstGap"]} mm off)' if volume else ''))
    arm_rest = {'t': {}, 'r': {}}
    for n in soldier.names:
        par = soldier.parent[n]
        Rn = clips['idle']['R'][n][0]
        if par is None:
            arm_rest['t'][n] = clips['idle']['P'][n][0] / soldier.scale
            arm_rest['r'][n] = Rn
        else:
            arm_rest['r'][n] = clips['idle']['R'][par][0].T @ Rn
    clips['__textures'] = gun_textures(dl, cfg, SOURCE)
    write_glb(OUT_GLB, key, cfg, dl, rt, bones, gun, clips, arm_rest)
    log('wrote', OUT_GLB, f'{os.path.getsize(OUT_GLB) / 1e6:.2f} MB')
    info = measure(key, cfg, dl, rt, bones, gun, clips)
    text = json.dumps(info)
    print('RETARGET ' + text)
    if REPORT:
        with open(REPORT, 'w') as f:
            json.dump(info, f, indent=1)
    log(f'done in {time.time() - started:.0f} s')


if not os.environ.get('RETARGET_NO_MAIN'):
    main()
