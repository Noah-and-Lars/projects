"""Turns a downloaded, animated .45 pistol with its own arms into the game's
third gun, the PF-23.

The model is "Mark 23 Animated (Free)" by BarcodeGames (Sketchfab Standard
license, see README.md, Credits):
https://sketchfab.com/3d-models/mark-23-animated-free-7abebe340aca4f46b36368417b3ca920
Download its glTF version and unzip it so that the folder holds scene.gltf,
scene.bin and textures/. Then, from the project-fish folder:

    blender --background --python tools/blender/convert_pistol23.py -- build/pistol23-source build/pistol23-raw.glb

(npm run build-pistol23 does this and compresses the result into
assets/pistol23.glb.)

Unlike the other two guns, this one comes with its own arms: bare forearms
and fingerless gloves, rigged on one skeleton with the gun and animated with
it. The game draws them instead of the soldier's arms while the PF-23 is held
and plays the model's own animations, so this script keeps the skeleton, the
skinning and the animations, and only:
- Turns and scales everything into gun space (metres, +X right, +Y up, -Z
  forward), with the rig's root at the eye the arms were posed for
  (CAMERA), so putting the rig at the gun layer's camera shows the gun as
  its maker framed it. The skeleton's own bone frames are turned too, so a
  point in the gun's bone space reads the game's way round.
- Makes it real size: the download's gun would be 275 mm long, the real
  gun is 245 mm, so everything (gun, arms, animation) is scaled by
  SCALE, which also brings the outsized hands nearer a real hand's size.
  From the eye this changes nothing: the whole picture shrinks about it.
- Cuts the download's one timeline into separate animations, each starting
  at 0 and keeping every key of its own stretch: reload, shoot, hide (put
  away) and draw, and a one-frame idle (the pose shoot starts from). Every
  animation moves every bone any of them moves, so each one sets the whole
  pose and they can be blended in any order.
- Keeps the slide running straight back along the gun (its keys let it
  drift a few millimetres sideways).
- Gives the trigger, the hammer and the slide stop bones of their own (they
  are loose pieces in the frame's mesh) so the game can pull, cock and lift
  them; until it does they move with the gun.
- Textures: rubs the caliber marking off the slide and engraves the game's
  own "PF-23  CAL .45" in its place, rubs a small stamp off the barrel hood,
  and doubles the gun's 512 px texture to 1024 px so the new letters are
  crisp. The hands and gloves have no markings; the gloves' texture is
  doubled to 1024 px too, and sharpened a little. The gun's colour is
  taken a little off blue and the skin's toned down (GUN_COLOUR,
  HANDS_COLOUR). All are stored as WebP.
- Keeps who made it and its license in the file (asset.copyright).
- Names the parts, bones, materials and animations plainly.

The game's constants for this gun (MODEL23 in src/viewmodel/pistol23.js) are
printed at the end (PISTOL23 ...), measured from the result.
"""

import json
import math
import os
import struct
import sys
import tempfile
import time

import bpy
import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import log  # noqa: E402
from texture_edit import (box_blur, clone_over, deviation_mask, image_array, letters, rub_out,  # noqa: E402
                          store, to_linear)

ARGS = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else sys.argv[1:]
SOURCE, OUT_GLB = ARGS[0], ARGS[1]

# --- Placing it ---------------------------------------------------------------
# The download is Y up with the muzzle towards +Z (so its right is -X), in
# what look like centimetres. Its gun is 27.47 units long from the hammer
# spur to the barrel's crown; the real gun is 245 mm.
SCALE = 0.245 / 27.47  # download units to metres (0.00892)
# The eye the arms were posed for, in the download's units: fitted to the
# outline of the gun, hands and arms in the model page's own picture (whose
# view is about 50 degrees high). From it the rear sight is 0.29 m ahead,
# 32 mm to the right and 4 mm below the eye, so the sights line up just
# under it. (That picture's view is also turned 1.8 degrees left; that isn't
# kept: here the gun points straight ahead, -Z, at the middle of the view.)
CAMERA = (-6.79, 154.62, -36.18)

# The download's animations (they share one timeline) and ours. Each runs
# from the first to the last key of its own channels. The idle pose is the
# first frame of the shot (the end of the draw is the same pose).
CLIPS = [('idle', 'Shoot'), ('draw', 'Draw'), ('hide', 'Hide'), ('shoot', 'Shoot'), ('reload', 'Reload')]
IDLE_LENGTH = 1 / 30  # seconds: two equal keys, so it has a length

# Bones (download names, less their numbered endings) and ours.
BONES = {
    '_rootJoint': 'rig', 'Mark23_Root': 'rig_root', 'Spine2': 'spine',
    'main_j': 'frame_j', 'side_j': 'slide_j', 'Mag_j': 'mag_j',
}
for side, s in (('Left', 'L'), ('Right', 'R')):
    BONES.update({f'{side}Shoulder1': f'shoulder_{s}', f'{side}Arm1': f'upperarm_{s}',
                  f'{side}ForeArm1': f'forearm_{s}', f'{side}Hand1': f'hand_{s}'})
    for finger in ('Thumb', 'Index', 'Middle', 'Ring', 'Pinky'):
        for k in range(1, 5):
            BONES[f'{side}Hand{finger}{k}'] = f'{finger.lower()}{k}_{s}'

# The meshes (download names) and ours, with their materials.
MESHES = {
    'Hand_Mesh_Hand_D_0': 'hands', 'Hand_Mesh_Glove_D_0': 'gloves',
    'main_Mark23_D_0': 'frame', 'Side_Mark23_D_0': 'slide', 'mag_Mark23_D_0': 'magazine',
}
MATERIALS = {'Hand_D': 'pistol23_hands', 'Glove_D': 'pistol23_gloves', 'Mark23_D': 'pistol23_gun'}
# The steel slide and the polymer frame share the gun's one texture, which
# has its light and wear painted in. Fully metallic (the download's default)
# it mirrors the gun layer's sky and looks like bare grey steel, so it's
# mostly the painted colour with a little sheen.
GUN_METALNESS = 0.35
GUN_ROUGHNESS = 0.55
# The texture's steel is painted a little blue; this takes the blue cast off
# so it sits with the other two guns' near-neutral black.
GUN_COLOUR = [1.0, 0.96, 0.88, 1.0]
# The bare forearms' skin is painted bright and pink: in the game's light it
# was the brightest thing at the bottom of the view and drew the eye off the
# gun. Toned down and given a little of skin's sheen.
HANDS_COLOUR = [0.74, 0.64, 0.59, 1.0]
HANDS_ROUGHNESS = 0.7
# The gloves' texture is only 512 px and looks smeared when aiming, with the
# support glove filling the bottom of the view: it's doubled, and sharpened
# a little (an unsharp mask: this much of the difference from a blur of
# this radius, in pixels, added back).
GLOVE_TEXTURE_SIZE = 1024
GLOVE_SHARPEN = (0.6, 2)
# Kept in the file (asset.copyright, which the compression keeps): who made
# the model and under what license.
COPYRIGHT = ('Based on a model by BarcodeGames (https://sketchfab.com/barcodegames), Sketchfab Standard license '
             '(https://sketchfab.com/licenses), changed for Project Fish. Only for use as part of the game; '
             'not to be extracted, republished or reused as a stand-alone file.')

# Loose pieces of the frame's mesh that get bones of their own: the middle
# of each piece (download units, at rest) and the point it turns about.
# The trigger pivots at its top; the hammer on the pin through the frame in
# front of it; the slide stop on its pin, whose head is at its front end.
PIECES = {
    'trigger_j': {'near': (-10.82, 147.07, 4.97), 'pivot': 'top'},
    'hammer_j': {'near': (-10.80, 150.48, -5.19), 'pivot': (-10.80, 149.445, -3.32)},
    'slidestop_j': {'near': (-9.07, 149.43, 3.92), 'pivot': 'pin', 'pin_near': (-9.18, 149.45, 6.2)},
}

# --- Textures -------------------------------------------------------------------
GUN_TEXTURE_SIZE = 1024  # doubled from the download's 512 px
# In the doubled gun texture (x0, y0, x1, y1): the caliber marking on the
# slide's left side (its letters are stored upside down: the texture's rows
# run bottom to top along the slide), and a small stamp on the barrel hood.
CALIBER_BOX = (230, 962, 396, 996)
HOOD_STAMP_BOX = (596, 26, 704, 60)
MARKING = 'PF-23  CAL .45'
WEBP_QUALITY = 90


# --- Reading the download -------------------------------------------------------
COMPONENTS = {5126: np.float32, 5123: np.uint16, 5121: np.uint8, 5125: np.uint32, 5122: np.int16, 5120: np.int8}
WIDTH = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4, 'MAT4': 16}


def read_gltf(folder):
    with open(os.path.join(folder, 'scene.gltf')) as f:
        g = json.load(f)
    # (The download is someone else's file: its buffer must be a plain file
    # name in its own folder, not a path that reaches out of it.)
    uri = g['buffers'][0]['uri']
    path = os.path.realpath(os.path.join(folder, uri))
    if (uri != os.path.basename(uri) or uri.startswith('data:') or '..' in uri or os.path.isabs(uri)
            or os.path.dirname(path) != os.path.realpath(folder)):
        raise SystemExit(f'unexpected buffer {uri!r}: it should be a file next to scene.gltf')
    with open(path, 'rb') as f:
        data = f.read()

    def accessor(i):
        a = g['accessors'][i]
        view = g['bufferViews'][a['bufferView']]
        n = WIDTH[a['type']]
        dt = np.dtype(COMPONENTS[a['componentType']])
        offset = view.get('byteOffset', 0) + a.get('byteOffset', 0)
        stride = view.get('byteStride') or n * dt.itemsize
        rows = np.frombuffer(data, np.uint8, count=stride * (a['count'] - 1) + n * dt.itemsize, offset=offset)
        rows = np.lib.stride_tricks.as_strided(rows, (a['count'], n * dt.itemsize), (stride, 1))
        out = np.ascontiguousarray(rows).view(dt).reshape(a['count'], n)
        if a.get('normalized'):
            out = out.astype(np.float64) / np.iinfo(dt).max
        return out

    return g, accessor


def quat_matrix(q):
    x, y, z, w = q
    return np.array([[1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)],
                     [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
                     [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)]])


def slerp(a, b, t):
    d = float(a @ b)
    if d < 0:
        b, d = -b, -d
    if d > 0.9995:
        r = a + t * (b - a)
        return r / np.linalg.norm(r)
    th = math.acos(d)
    return (math.sin((1 - t) * th) * a + math.sin(t * th) * b) / math.sin(th)


def sample(times, values, t, path):
    """A channel's value at time t (held before its first key and after its
    last), interpolated as glTF's LINEAR does."""
    if t <= times[0]:
        return values[0].copy()
    if t >= times[-1]:
        return values[-1].copy()
    i = int(np.searchsorted(times, t)) - 1
    f = (t - times[i]) / (times[i + 1] - times[i])
    if path == 'rotation':
        return slerp(values[i], values[i + 1], f)
    return values[i] * (1 - f) + values[i + 1] * f


def trs_matrix(t, r, s=(1, 1, 1)):
    m = np.eye(4)
    m[:3, :3] = quat_matrix(r) * np.asarray(s)
    m[:3, 3] = t
    return m


# --- The rig --------------------------------------------------------------------

class Rig:
    """The skeleton as a list of bones (name, parent, rest translation and
    rotation, inverse bind matrix), in either space, and a pose evaluator."""

    def __init__(self, names, parents, translations, rotations, inverse_binds):
        self.names = list(names)
        self.parents = list(parents)
        self.t = [np.asarray(v, np.float64) for v in translations]
        self.r = [np.asarray(v, np.float64) for v in rotations]
        self.ibm = [np.asarray(m, np.float64) for m in inverse_binds]

    def index(self, name):
        return self.names.index(name)

    def world(self, pose=None):
        """World matrices of every bone (rig space) for a pose: {bone: {'translation': v, 'rotation': q}}."""
        out = []
        for k in range(len(self.names)):
            t, r = self.t[k], self.r[k]
            if pose and k in pose:
                t = pose[k].get('translation', t)
                r = pose[k].get('rotation', r)
            m = trs_matrix(t, r)
            p = self.parents[k]
            out.append(m if p is None else out[p] @ m)
        return out


def clip_pose(clip, t):
    """A clip's pose at time t: {bone: {path: value}}."""
    pose = {}
    for (bone, path), (times, values) in clip['tracks'].items():
        pose.setdefault(bone, {})[path] = sample(times, values, t, path)
    return pose


def skin(rig, mesh, pose=None):
    """A mesh's vertices posed (rig space)."""
    mats = np.array([w @ b for w, b in zip(rig.world(pose), rig.ibm)])
    p = np.c_[mesh['position'], np.ones(len(mesh['position']))]
    out = np.zeros((len(p), 3))
    for k in range(4):
        out += mesh['weights'][:, k:k + 1] * np.einsum('nij,nj->ni', mats[mesh['joints'][:, k]], p)[:, :3]
    return out


def loose_pieces(position, triangles):
    """Which loose piece each triangle belongs to (pieces share no corners;
    corners at the same place count as shared)."""
    _, corner = np.unique(np.round(position, 3), axis=0, return_inverse=True)
    corner = corner.ravel()
    parent = np.arange(corner.max() + 1)

    def find(a):
        while parent[a] != a:
            parent[a] = parent[parent[a]]
            a = parent[a]
        return a

    tris = corner[triangles]
    for a, b, c in tris:
        ra = find(a)
        parent[find(b)] = ra
        parent[find(c)] = ra
    return np.array([find(t[0]) for t in tris])


def convert(g, accessor):
    nodes = g['nodes']
    skin_def = g['skins'][0]
    joints = skin_def['joints']
    # The nodes above the skeleton turn Z up and back again: they add up to
    # nothing, so the skeleton's root is in the download's world space.
    above = np.eye(4)
    for n in nodes[:2]:
        above = above @ np.array(n['matrix']).reshape(4, 4).T
    assert np.allclose(above, np.eye(4), atol=1e-9), 'the download has a transform above the skeleton'

    def bone_name(i):
        raw = nodes[i]['name']
        stem = raw.rsplit('_', 1)[0] if raw[-1].isdigit() else raw
        stem = stem[:-2] if stem.endswith('_1') else stem
        if stem not in BONES:
            raise SystemExit(f'unknown bone {raw}')
        return BONES[stem]

    parent_of = {c: i for i, n in enumerate(nodes) for c in n.get('children', [])}
    ibm = accessor(skin_def['inverseBindMatrices']).reshape(-1, 4, 4).transpose(0, 2, 1).astype(np.float64)

    # Download space to ours: p' = S R (p - C). R turns half round Y (the
    # muzzle from +Z to -Z, its right from -X to +X).
    R = np.diag([-1.0, 1.0, -1.0])
    G = np.eye(4)
    G[:3, :3] = R * SCALE
    G_inv = np.linalg.inv(G)
    C = np.asarray(CAMERA, np.float64)
    H = np.eye(4)
    H[:3, 3] = -SCALE * (R @ C)
    H = H @ G  # p' = H p
    H_inv = np.linalg.inv(H)

    def turn_q(q):
        # R q R^-1 for the half turn about Y.
        return np.array([-q[0], q[1], -q[2], q[3]], np.float64)

    def turn_t(t):
        return SCALE * (R @ np.asarray(t, np.float64))

    names, parents, ts, rs, ibms = [], [], [], [], []
    for k, j in enumerate(joints):
        n = nodes[j]
        names.append(bone_name(j))
        p = parent_of.get(j)
        parents.append(joints.index(p) if p in joints else None)
        t, r = n.get('translation', [0, 0, 0]), n.get('rotation', [0, 0, 0, 1])
        assert 'scale' not in n and 'matrix' not in n
        if parents[-1] is None:
            # The top bone: from the eye to the download's origin.
            local = H @ trs_matrix(t, r) @ G_inv
            ts.append(local[:3, 3])
            rs.append(turn_q(r))
            assert np.allclose(local[:3, :3], quat_matrix(turn_q(r)), atol=1e-9)
        else:
            ts.append(turn_t(t))
            rs.append(turn_q(r))
        ibms.append(G @ ibm[k] @ H_inv)
    rig = Rig(names, parents, ts, rs, ibms)

    # Meshes, posed into our space (normals turned).
    meshes = {}
    for m in g['meshes']:
        prim = m['primitives'][0]
        a = prim['attributes']
        pos = accessor(a['POSITION']).astype(np.float64)
        w = accessor(a['WEIGHTS_0']).astype(np.float64)
        w /= w.sum(1, keepdims=True)
        meshes[MESHES[m['name']]] = {
            'position': (np.c_[pos, np.ones(len(pos))] @ H.T)[:, :3],
            'normal': accessor(a['NORMAL']).astype(np.float64) @ R.T,
            'uv': accessor(a['TEXCOORD_0']).astype(np.float64),
            'joints': accessor(a['JOINTS_0']).astype(np.int64),
            'weights': w,
            'triangles': accessor(prim['indices']).astype(np.int64).reshape(-1, 3),
            'material': MATERIALS[g['materials'][prim['material']]['name']],
        }

    # Check: posed at rest, our skeleton puts every vertex where the download's
    # does, carried into our space.
    src_rig = Rig(names, parents,
                  [nodes[j].get('translation', [0, 0, 0]) for j in joints],
                  [nodes[j].get('rotation', [0, 0, 0, 1]) for j in joints], ibm)
    for m in g['meshes']:
        prim = m['primitives'][0]
        src = {'position': accessor(prim['attributes']['POSITION']).astype(np.float64),
               'joints': meshes[MESHES[m['name']]]['joints'], 'weights': meshes[MESHES[m['name']]]['weights']}
        expect = (np.c_[skin(src_rig, src), np.ones(len(src['position']))] @ H.T)[:, :3]
        got = skin(rig, meshes[MESHES[m['name']]])
        assert np.abs(expect - got).max() < 1e-6, f'{m["name"]} moved by {np.abs(expect - got).max()}'

    # Animations, cut out of the shared timeline.
    union = set()
    source = {}
    for a in g['animations']:
        tracks = {}
        lo, hi = math.inf, -math.inf
        for ch in a['channels']:
            s = a['samplers'][ch['sampler']]
            assert s.get('interpolation', 'LINEAR') == 'LINEAR'
            bone = joints.index(ch['target']['node'])
            path = ch['target']['path']
            times = accessor(s['input'])[:, 0].astype(np.float64)
            values = accessor(s['output']).astype(np.float64)
            if path == 'rotation':
                values = np.array([turn_q(q) for q in values])
                # Each key on the same side as the one before (shortest way round).
                for i in range(1, len(values)):
                    if values[i] @ values[i - 1] < 0:
                        values[i] = -values[i]
            elif path == 'translation':
                assert rig.parents[bone] is not None, 'the top bone is animated'
                values = values * SCALE @ R.T
                if rig.names[bone] == 'slide_j':
                    # The slide drifts up to 4 mm sideways as it goes back
                    # (a slip in the keys); it runs straight along the gun.
                    values[:, 0] = rig.t[bone][0]
            else:
                raise SystemExit(f'unexpected {path} channel')
            tracks[(bone, path)] = (times, values)
            union.add((bone, path))
            lo, hi = min(lo, times[0]), max(hi, times[-1])
        source[a['name']] = {'tracks': tracks, 'start': lo, 'end': hi}

    clips = {}
    for name, src_name in CLIPS:
        src = source[src_name]
        start, end = src['start'], src['end']
        if name == 'idle':
            end = start
        tracks = {}
        for key in sorted(union):
            bone, path = key
            if key in src['tracks']:
                times, values = src['tracks'][key]
                inside = (times > start + 1e-4) & (times < end - 1e-4)
                t = [0.0] + list(times[inside] - start)
                v = [sample(times, values, start, path)] + list(values[inside])
                if end > start:
                    t.append(end - start)
                    v.append(sample(times, values, end, path))
            else:
                # Not moved in this stretch: held at rest (as the download plays it).
                rest = rig.t[bone] if path == 'translation' else rig.r[bone]
                t, v = [0.0], [rest]
                if end > start:
                    t.append(end - start)
                    v.append(rest)
            if name == 'idle':
                t, v = [0.0, IDLE_LENGTH], [v[0], v[0]]
            tracks[key] = (np.array(t), np.array(v))
        clips[name] = {'tracks': tracks, 'duration': float(max(t[-1] for t, _ in tracks.values())),
                       'source_start': start}
        log(f'{name}: {clips[name]["duration"]:.3f} s from {src_name} {start:.3f}-{end:.3f} s, '
            f'{sum(len(t) for t, _ in tracks.values())} keys on {len(tracks)} tracks')
    return rig, meshes, clips


def give_pieces_bones(rig, meshes):
    """Moves the trigger, hammer and slide stop onto bones of their own."""
    frame = meshes['frame']
    piece = loose_pieces(frame['position'], frame['triangles'])
    to_ours = lambda p: SCALE * (np.diag([-1.0, 1.0, -1.0]) @ (np.asarray(p, np.float64) - np.asarray(CAMERA)))  # noqa: E731
    frame_j = rig.index('frame_j')
    rest = rig.world()
    pivots = {}
    for name, spec in PIECES.items():
        centres = {}  # the middle of each piece's box
        for L in np.unique(piece):
            v = frame['position'][frame['triangles'][piece == L].ravel()]
            centres[L] = (v.min(0) + v.max(0)) / 2
        near = to_ours(spec['near'])
        L = min(centres, key=lambda k: np.linalg.norm(centres[k] - near))
        assert np.linalg.norm(centres[L] - near) < 0.004, f'{name}: nearest piece is {np.linalg.norm(centres[L] - near):.4f} m away'
        verts = np.unique(frame['triangles'][piece == L].ravel())
        v = frame['position'][verts]
        if spec['pivot'] == 'top':
            top = v[v[:, 1] > v[:, 1].max() - 0.0015]
            pivot = top.mean(0)
        elif spec['pivot'] == 'pin':
            pin_near = to_ours(spec['pin_near'])
            P = min(centres, key=lambda k: np.linalg.norm(centres[k] - pin_near))
            pv = np.unique(frame['triangles'][piece == P].ravel())
            pivot = frame['position'][pv].mean(0)
            pivot[0] = v[:, 0].mean()
            verts = np.union1d(verts, pv)  # the pin's head turns with it
        else:
            pivot = to_ours(spec['pivot'])
        # The new bone: a child of the frame's, at the pivot, not turned.
        k = len(rig.names)
        local = np.linalg.inv(rest[frame_j]) @ trs_matrix(pivot, (0, 0, 0, 1))
        rig.names.append(name)
        rig.parents.append(frame_j)
        rig.t.append(local[:3, 3])
        rig.r.append(np.array([0.0, 0.0, 0.0, 1.0]))
        bind = rest[frame_j] @ local
        rig.ibm.append(np.linalg.inv(bind))
        frame['joints'][verts] = [k, 0, 0, 0]
        frame['weights'][verts] = [1.0, 0, 0, 0]
        pivots[name] = pivot
        log(f'{name}: {len(verts)} vertices, pivot {np.round(pivot, 4).tolist()}')
    return pivots


# --- Textures -------------------------------------------------------------------

def load(path, size=None):
    image = bpy.data.images.load(os.path.abspath(path))
    image.colorspace_settings.name = 'sRGB'
    if size and image.size[0] != size:
        image.scale(size, size)
    return image


def stamp(shape, img, centre, flip_rows):
    """img (0..1) as a full-size image of `shape`, centred on `centre` (x, y
    pixels), level; flip_rows mirrors it top to bottom (for lettering stored
    that way). (texture_edit.placed turns it too, but needs room round it.)"""
    h, w = img.shape
    out = np.zeros(shape)
    y0, x0 = centre[1] - h // 2, centre[0] - w // 2
    out[y0:y0 + h, x0:x0 + w] = img[::-1] if flip_rows else img
    return box_blur(out, 1)


def fix_gun_texture(image):
    a = image_array(image)
    # 1. The caliber marking: find its light letters, cover the box with the
    # slide's surface from beside it, then engrave ours along the same line.
    x0, y0, x1, y1 = CALIBER_BOX
    lum = to_linear(a[..., :3]) @ np.array([0.2126, 0.7152, 0.0722])
    region = lum[y0:y1, x0:x1]
    smooth = box_blur(region, 6)
    mask = (region - smooth) > 0.012
    ys, xs = np.nonzero(mask)
    letter_colour = np.percentile(a[y0:y1, x0:x1, :3][mask], 90, axis=0)
    centre = (int(round(xs.mean())) + x0, int(round(ys.mean())) + y0)
    height = np.percentile(ys, 97) - np.percentile(ys, 3)
    length = xs.max() - xs.min()
    log(f'caliber marking: {mask.sum()} px, centre {centre}, {length} x {height:.0f} px, '
        f'colour {np.round(letter_colour, 3).tolist()}')
    sx, sy = clone_over([a], CALIBER_BOX)
    log(f'covered from ({sx}, {sy}) px away')
    img = letters(MARKING, height * 0.85)
    if img.shape[1] > length * 1.15:
        img = letters(MARKING, height * 0.85 * length * 1.15 / img.shape[1])
    m = stamp(a.shape[:2], img, centre, flip_rows=True)[..., None]
    # Engraved letters: light where the finish is cut, with a faint dark
    # edge under them.
    shade = np.clip(np.roll(m, 1, 0) - m, 0, 1)
    a[..., :3] = a[..., :3] * (1 - m) + letter_colour * m
    a[..., :3] *= 1 - 0.25 * shade
    log(f'engraved {MARKING!r}, {img.shape[0]} x {img.shape[1]} px')

    # 2. The stamp on the barrel hood: dark marks on a light ground.
    box = HOOD_STAMP_BOX
    hole = deviation_mask([a], box, [0.06], grow=2)
    rub_out([a], box, hole)
    log(f'hood stamp: {hole.sum()} px rubbed out')
    store(image, a)


def webp_bytes(image, name):
    folder = os.path.join(tempfile.gettempdir(), 'project-fish-pistol23')
    os.makedirs(folder, exist_ok=True)
    path = os.path.join(folder, name + '.webp')
    # (Blender saves an image it hasn't changed as the file it came from, so
    # its pixels are set again first.)
    store(image, image_array(image))
    image.file_format = 'WEBP'
    image.save(filepath=path, quality=WEBP_QUALITY)
    with open(path, 'rb') as f:
        return f.read()


def textures():
    folder = os.path.join(SOURCE, 'textures')
    gun = load(os.path.join(folder, 'Mark23_D_baseColor.png'), GUN_TEXTURE_SIZE)
    fix_gun_texture(gun)
    hands = load(os.path.join(folder, 'Hand_D_baseColor.png'))
    gloves = load(os.path.join(folder, 'Glove_D_baseColor.png'), GLOVE_TEXTURE_SIZE)
    a = image_array(gloves)
    amount, radius = GLOVE_SHARPEN
    a[..., :3] = np.clip(a[..., :3] + amount * (a[..., :3] - box_blur(a[..., :3], radius)), 0, 1)
    store(gloves, a)
    return {'pistol23_gun': webp_bytes(gun, 'pistol23_gun'),
            'pistol23_hands': webp_bytes(hands, 'pistol23_hands'),
            'pistol23_gloves': webp_bytes(gloves, 'pistol23_gloves')}


# --- Writing the file -----------------------------------------------------------

class Writer:
    def __init__(self):
        self.g = {'asset': {'version': '2.0', 'generator': 'Project Fish convert_pistol23.py', 'copyright': COPYRIGHT},
                  'scene': 0, 'scenes': [{'nodes': [0]}], 'nodes': [], 'meshes': [], 'skins': [],
                  'materials': [], 'textures': [], 'images': [], 'samplers': [], 'animations': [],
                  'accessors': [], 'bufferViews': [], 'buffers': [],
                  'extensionsUsed': ['EXT_texture_webp'], 'extensionsRequired': ['EXT_texture_webp']}
        self.data = bytearray()

    def view(self, raw, target=None):
        while len(self.data) % 4:
            self.data.append(0)
        v = {'buffer': 0, 'byteOffset': len(self.data), 'byteLength': len(raw)}
        if target:
            v['target'] = target
        self.data += raw
        self.g['bufferViews'].append(v)
        return len(self.g['bufferViews']) - 1

    def accessor(self, array, kind, component=5126, target=None, bounds=False):
        array = np.ascontiguousarray(array, dtype={5126: np.float32, 5123: np.uint16, 5125: np.uint32}[component])
        a = {'bufferView': self.view(array.tobytes(), target), 'componentType': component,
             'count': int(array.shape[0]), 'type': kind}
        if bounds:
            flat = array.reshape(array.shape[0], -1)
            a['min'] = [float(x) for x in flat.min(0)]
            a['max'] = [float(x) for x in flat.max(0)]
        self.g['accessors'].append(a)
        return len(self.g['accessors']) - 1

    def write(self, path):
        while len(self.data) % 4:
            self.data.append(0)
        self.g['buffers'] = [{'byteLength': len(self.data)}]
        text = json.dumps(self.g, separators=(',', ':')).encode()
        text += b' ' * (-len(text) % 4)
        out = bytearray(struct.pack('<III', 0x46546C67, 2, 12 + 8 + len(text) + 8 + len(self.data)))
        out += struct.pack('<II', len(text), 0x4E4F534A) + text
        out += struct.pack('<II', len(self.data), 0x004E4942) + self.data
        os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
        with open(path, 'wb') as f:
            f.write(out)


def write_glb(rig, meshes, clips, images, path, glove_specular):
    w = Writer()
    g = w.g
    # Node 0 is the rig's root (the eye); the bones follow in skin order,
    # then the meshes.
    g['nodes'].append({'name': 'pistol23', 'children': []})
    first_bone = 1
    for k, name in enumerate(rig.names):
        node = {'name': name}
        if np.abs(rig.t[k]).max() > 0:
            node['translation'] = [float(x) for x in rig.t[k]]
        if np.abs(rig.r[k] - [0, 0, 0, 1]).max() > 0:
            node['rotation'] = [float(x) for x in rig.r[k] / np.linalg.norm(rig.r[k])]
        g['nodes'].append(node)
    for k, p in enumerate(rig.parents):
        if p is None:
            g['nodes'][0]['children'].append(first_bone + k)
        else:
            g['nodes'][first_bone + p].setdefault('children', []).append(first_bone + k)
    g['skins'].append({'name': 'pistol23_rig', 'joints': list(range(first_bone, first_bone + len(rig.names))),
                       'skeleton': first_bone + rig.parents.index(None),
                       'inverseBindMatrices': w.accessor(np.array([m.T.reshape(-1) for m in rig.ibm]), 'MAT4')})

    g['samplers'].append({'magFilter': 9729, 'minFilter': 9987, 'wrapS': 10497, 'wrapT': 10497})
    material_index = {}
    for name, data in images.items():
        g['images'].append({'name': name, 'mimeType': 'image/webp', 'bufferView': w.view(data)})
        g['textures'].append({'sampler': 0, 'extensions': {'EXT_texture_webp': {'source': len(g['images']) - 1}}})
        mat = {'name': name, 'doubleSided': True,
               'pbrMetallicRoughness': {'baseColorTexture': {'index': len(g['textures']) - 1},
                                        'metallicFactor': 0.0, 'roughnessFactor': 0.94}}
        if name == 'pistol23_gun':
            mat['pbrMetallicRoughness'].update(metallicFactor=GUN_METALNESS, roughnessFactor=GUN_ROUGHNESS,
                                               baseColorFactor=GUN_COLOUR)
        if name == 'pistol23_hands':
            mat['pbrMetallicRoughness'].update(roughnessFactor=HANDS_ROUGHNESS, baseColorFactor=HANDS_COLOUR)
        if name == 'pistol23_gloves' and glove_specular is not None:
            mat['extensions'] = {'KHR_materials_specular': glove_specular}
            g['extensionsUsed'].append('KHR_materials_specular')
        g['materials'].append(mat)
        material_index[name] = len(g['materials']) - 1

    for name in ('hands', 'gloves', 'frame', 'slide', 'magazine'):
        m = meshes[name]
        n = m['normal'] / np.linalg.norm(m['normal'], axis=1, keepdims=True)
        attrs = {'POSITION': w.accessor(m['position'], 'VEC3', target=34962, bounds=True),
                 'NORMAL': w.accessor(n, 'VEC3', target=34962),
                 'TEXCOORD_0': w.accessor(m['uv'], 'VEC2', target=34962),
                 'JOINTS_0': w.accessor(m['joints'], 'VEC4', 5123, target=34962),
                 'WEIGHTS_0': w.accessor(m['weights'], 'VEC4', target=34962)}
        prim = {'attributes': attrs, 'indices': w.accessor(m['triangles'].reshape(-1, 1), 'SCALAR', 5125, target=34963),
                'material': material_index[m['material']]}
        g['meshes'].append({'name': name, 'primitives': [prim]})
        g['nodes'].append({'name': name, 'mesh': len(g['meshes']) - 1, 'skin': 0})
        g['nodes'][0]['children'].append(len(g['nodes']) - 1)

    for name, clip in clips.items():
        anim = {'name': name, 'channels': [], 'samplers': []}
        for (bone, prop), (times, values) in clip['tracks'].items():
            kind = 'VEC4' if prop == 'rotation' else 'VEC3'
            anim['samplers'].append({'input': w.accessor(times.reshape(-1, 1), 'SCALAR', bounds=True),
                                     'output': w.accessor(values, kind), 'interpolation': 'LINEAR'})
            anim['channels'].append({'sampler': len(anim['samplers']) - 1,
                                     'target': {'node': first_bone + bone, 'path': prop}})
        g['animations'].append(anim)
    w.write(path)


# --- Measuring --------------------------------------------------------------------

def r5(v):
    return [round(float(x), 4) for x in v]


def in_bone(rig, bone, p, pose=None):
    """Point p (rig space) in a bone's own space (posed or at rest)."""
    m = rig.world(pose)[rig.index(bone)]
    return (np.linalg.inv(m) @ np.r_[p, 1])[:3]


def measure(rig, meshes, clips, pivots):
    frame, slide, mag = meshes['frame'], meshes['slide'], meshes['magazine']
    out = {'scale': SCALE, 'camera': list(CAMERA)}
    idle = clip_pose(clips['idle'], 0)
    world = rig.world(idle)
    fj, sj, mj = rig.index('frame_j'), rig.index('slide_j'), rig.index('mag_j')
    # In the idle pose the gun's bones aren't turned, so their spaces are gun
    # space moved to their pivots.
    for b in (fj, sj, mj):
        assert np.allclose(world[b][:3, :3], np.eye(3), atol=2e-3), rig.names[b]
    out['bones_idle'] = {rig.names[b]: r5(world[b][:3, 3]) for b in (fj, sj, mj)}

    fp = skin(rig, frame, idle)
    pieces = loose_pieces(frame['position'], frame['triangles'])
    sizes = {L: (pieces == L).sum() for L in np.unique(pieces)}
    # The barrel: the loose piece reaching furthest forward.
    tri_front = {L: fp[frame['triangles'][pieces == L].ravel()][:, 2].min() for L in sizes}
    barrel = min(tri_front, key=tri_front.get)
    bv = fp[np.unique(frame['triangles'][pieces == barrel].ravel())]
    crown = bv[bv[:, 2] < bv[:, 2].min() + 0.0008]
    muzzle = np.array([(crown[:, 0].max() + crown[:, 0].min()) / 2, (crown[:, 1].max() + crown[:, 1].min()) / 2,
                       bv[:, 2].min()])
    out['muzzle'] = r5(muzzle)
    out['muzzle_in_frame_j'] = r5(in_bone(rig, 'frame_j', muzzle, idle))
    out['bore_radius'] = round(float((crown[:, 1].max() - crown[:, 1].min()) / 2), 4)
    out['barrel_back_z'] = round(float(bv[:, 2].max()), 4)
    gun_all = np.r_[fp, skin(rig, slide, idle), skin(rig, mag, idle)]
    out['gun_length'] = round(float(np.ptp(gun_all[:, 2])), 4)
    out['gun_box'] = {'min': r5(gun_all.min(0)), 'max': r5(gun_all.max(0))}

    sp = skin(rig, slide, idle)
    spieces = loose_pieces(slide['position'], slide['triangles'])
    body = max(np.unique(spieces), key=lambda L: (spieces == L).sum())
    sbody = sp[np.unique(slide['triangles'][spieces == body].ravel())]
    out['slide'] = {'top': round(float(sbody[:, 1].max()), 4), 'halfWidth': round(float(np.ptp(sbody[:, 0]) / 2), 4),
                    'centreX': round(float((sbody[:, 0].max() + sbody[:, 0].min()) / 2), 4),
                    'back': round(float(sbody[:, 2].max()), 4), 'front': round(float(sbody[:, 2].min()), 4)}
    # The sights: the loose pieces standing on the slide's top, at the back
    # and the front.
    # (The biggest at each end: the white dots are loose pieces too.)
    sights = []
    for L in np.unique(spieces):
        v = sp[np.unique(slide['triangles'][spieces == L].ravel())]
        if v[:, 1].max() > sbody[:, 1].max() + 0.003:
            sights.append(v)
    middle = (sbody[:, 2].max() + sbody[:, 2].min()) / 2
    rear = max((v for v in sights if v[:, 2].mean() > middle), key=len)
    front = max((v for v in sights if v[:, 2].mean() < middle), key=len)
    # The back faces of the blades, at their tops (the rear sight's base runs
    # on behind its blade).
    rear_blade = rear[rear[:, 1] > rear[:, 1].max() - 0.0006]
    front_blade = front[front[:, 1] > front[:, 1].max() - 0.0006]
    cx = (rear[:, 0].max() + rear[:, 0].min()) / 2
    # The notch's sides: the rear sight's corners nearest the middle on
    # either side; its bottom is the lowest of their corners above the slide.
    tops = rear[rear[:, 1] > rear[:, 1].max() - 0.0006]  # the two blades' tops
    inner = (tops[tops[:, 0] < cx][:, 0].max(), tops[tops[:, 0] > cx][:, 0].min())
    notch = rear[((np.abs(rear[:, 0] - inner[0]) < 0.0003) | (np.abs(rear[:, 0] - inner[1]) < 0.0003))
                 & (rear[:, 1] > sbody[:, 1].max() + 0.001)]
    notch_bottom = notch[:, 1].min()
    out['sights'] = {
        'rearTop': round(float(rear[:, 1].max()), 4), 'notchBottom': round(float(notch_bottom), 4),
        'notchWidth': round(float(inner[1] - inner[0]), 4),
        'frontTop': round(float(front[:, 1].max()), 4),
        'rearZ': round(float(rear_blade[:, 2].max()), 4), 'frontZ': round(float(front_blade[:, 2].max()), 4), 'frontX': round(float(front[:, 0].mean()), 4),
        'rearX': round(float(cx), 4)}
    # The ejection port: on the slide's right side over the barrel's hood
    # (the box in the frame's mesh seen through it).
    hood_near = SCALE * (np.diag([-1.0, 1.0, -1.0]) @ (np.array([-10.8, 151.5, 7.2]) - np.asarray(CAMERA)))
    hood = min(sizes, key=lambda L: np.linalg.norm(fp[frame['triangles'][pieces == L].ravel()].mean(0) - hood_near))
    hv = fp[np.unique(frame['triangles'][pieces == hood].ravel())]
    port = np.array([sbody[:, 0].max(), hv[:, 1].max() - 0.004, hv[:, 2].mean()])
    out['port'] = r5(port)
    out['port_in_slide_j'] = r5(in_bone(rig, 'slide_j', port, idle))
    out['pivots'] = {k: r5(v) for k, v in pivots.items()}
    out['pivots_in_frame_j'] = {k: r5(in_bone(rig, 'frame_j', v, idle)) for k, v in pivots.items()}
    mv = skin(rig, mag, idle)
    out['magazine_box'] = {'min': r5(mv.min(0)), 'max': r5(mv.max(0))}

    # The eye's view of it (the rig's root is the eye).
    rs = np.array([out['sights']['rearX'], out['sights']['rearTop'], out['sights']['rearZ']])
    out['eye_to_rear_sight'] = r5(rs)
    out['view_angles_deg'] = {'right': round(math.degrees(math.atan2(rs[0], -rs[2])), 2),
                              'down': round(math.degrees(math.atan2(-rs[1], -rs[2])), 2)}

    # Events in each clip, from the bones' paths.
    def path(clip, bone, step=1 / 120):
        n = int(round(clips[clip]['duration'] / step)) + 1
        ts = np.linspace(0, clips[clip]['duration'], n)
        ps = []
        for t in ts:
            pose = clip_pose(clips[clip], t)
            wm = rig.world(pose)
            ps.append((wm, pose))
        return ts, ps

    events = {}
    # Shoot: slide travel (along the gun) and when it's furthest back.
    ts, ps = path('shoot', 'slide_j')
    travel = np.array([in_bone(rig, 'frame_j', wm[sj][:3, 3], pose)[2] for wm, pose in ps])
    travel -= travel[0]
    k = int(np.argmax(travel))
    back = travel > travel.max() * 0.5
    events['shoot'] = {'slideBack': round(float(ts[k]), 3), 'slideTravel': round(float(travel.max()), 4),
                       'slideStartsBack': round(float(ts[np.argmax(travel > 0.0005)]), 3),
                       'slideHome': round(float(ts[len(travel) - 1 - np.argmax(travel[::-1] > 0.0005)]), 3),
                       'halfBackFrom': round(float(ts[np.argmax(back)]), 3),
                       'duration': round(clips['shoot']['duration'], 3)}
    gun_kick = np.array([wm[fj][:3, 3] for wm, _ in ps])
    events['shoot']['gunKickMax'] = r5(np.abs(gun_kick - gun_kick[0]).max(0))
    events['shoot']['gunPitchMaxDeg'] = round(max(math.degrees(math.acos(np.clip(wm[fj][1, 1], -1, 1))) for wm, _ in ps), 2)

    # Reload: the magazine (in the frame's space) and the slide.
    hand = rig.index('hand_L')
    ts, ps = path('reload', 'mag_j')
    mag_in_frame = np.array([in_bone(rig, 'frame_j', wm[mj][:3, 3], pose) for wm, pose in ps])
    off = np.linalg.norm(mag_in_frame - mag_in_frame[0], axis=1)
    mag_len = float(np.ptp(mv[:, 1]))
    moved = off > 0.001
    first_move = int(np.argmax(moved))
    out_of_well = int(np.argmax(off > mag_len))
    back_in = len(off) - 1 - int(np.argmax(off[::-1] > mag_len))  # last time it's a magazine's length away
    seated = len(off) - 1 - int(np.argmax(off[::-1] > 0.001))
    far = int(np.argmax(off))
    slide_t = np.array([in_bone(rig, 'frame_j', wm[sj][:3, 3], pose)[2] for wm, pose in ps])
    slide_t -= slide_t[0]
    sk = np.nonzero(slide_t > 0.002)[0]
    rack = int(np.argmax(slide_t))
    events['reload'] = {
        'magReleased': round(float(ts[first_move]), 3), 'magClear': round(float(ts[out_of_well]), 3),
        'magFurthest': round(float(ts[far]), 3), 'magFurthestOffset': round(float(off[far]), 4),
        'newMagAtWell': round(float(ts[back_in]), 3), 'magSeated': round(float(ts[seated]), 3),
        'slideBackFrom': round(float(ts[sk[0]]), 3) if len(sk) else None,
        'slideFullyBack': round(float(ts[rack]), 3), 'slideBackMax': round(float(slide_t.max()), 4),
        'slideReleased': round(float(ts[sk[-1]]), 3) if len(sk) else None,
        'duration': round(clips['reload']['duration'], 3)}
    # When the magazine is out of the view (its top below the lower edge of
    # the game's 62 degree gun layer view), and when the new one is in the
    # support hand (held at a steady distance from its wrist).
    top_in_mag = np.array([0, out['magazine_box']['max'][1] - world[mj][1, 3], 0])
    tops = np.array([(wm[mj] @ np.r_[top_in_mag, 1])[:3] for wm, _ in ps])
    hidden = (np.degrees(np.arctan2(-tops[:, 1], -tops[:, 2])) > 31) | (tops[:, 2] > 0)
    gone = first_move + int(np.argmax(hidden[first_move:]))
    back = gone + int(np.argmax(~hidden[gone:]))
    to_hand = np.array([np.linalg.norm(wm[mj][:3, 3] - wm[hand][:3, 3]) for wm, _ in ps])
    held = np.abs(to_hand - to_hand[back_in]) < 0.002
    in_hand = far + int(np.argmax(held[far:]))
    events['reload'].update({'magOutOfSight': round(float(ts[gone]), 3), 'newMagInHand': round(float(ts[in_hand]), 3),
                             'newMagInSight': round(float(ts[back]), 3),
                             'slideHome': round(float(ts[rack + int(np.argmax(slide_t[rack:] < 0.0005))]), 3)})
    step = max(1, len(ts) // 24)
    out['magazine_path'] = [[round(float(ts[i]), 3)] + r5(mag_in_frame[i]) for i in range(0, len(ts), step)]
    # Draw and hide: when the gun is where it rests (draw) or as low as it goes (hide).
    for clip in ('draw', 'hide'):
        ts, ps = path(clip, 'frame_j')
        pos = np.array([wm[fj][:3, 3] for wm, _ in ps])
        rest = world[fj][:3, 3]
        d = np.linalg.norm(pos - rest, axis=1)
        ang = np.array([math.degrees(math.acos(np.clip((np.trace(wm[fj][:3, :3]) - 1) / 2, -1, 1))) for wm, _ in ps])
        ready = d < 0.003
        e = {'duration': round(clips[clip]['duration'], 3), 'gunStart': r5(pos[0]), 'gunEnd': r5(pos[-1]),
             'turnStartDeg': round(float(ang[0]), 1), 'turnEndDeg': round(float(ang[-1]), 1)}
        # The view's lower edge with the game's 62 degree gun layer view:
        # where the top of the slide goes out of sight.
        top_back = [out['slide']['centreX'], out['slide']['top'], out['slide']['back']]
        slide_top = np.array([(wm[sj] @ np.r_[in_bone(rig, 'slide_j', top_back, idle), 1])[:3]
                              for wm, _ in ps])
        below = np.degrees(np.arctan2(-slide_top[:, 1], -slide_top[:, 2])) > 31
        if clip == 'draw':
            e['gunReady'] = round(float(ts[np.argmax(ready & (np.arange(len(ts)) > np.argmax(~ready)))]), 3)
            e['inSight'] = round(float(ts[np.argmax(~below)]), 3)
        else:
            e['gunLeaves'] = round(float(ts[np.argmax(d > 0.003)]), 3)
            e['outOfSight'] = round(float(ts[np.argmax(below)]), 3) if below.any() else None
        events[clip] = e
    out['events'] = events

    # What the support hand does: its wrist in the frame's space over each clip.
    hands = {}
    for clip in ('reload', 'shoot', 'draw', 'hide'):
        ts, ps = path(clip, 'hand_L', 1 / 10)
        hands[clip] = [[round(float(t), 2)] + r5(in_bone(rig, 'frame_j', wm[hand][:3, 3], pose)) + r5(wm[hand][:3, 3])
                       for t, (wm, pose) in zip(ts, ps)]
    out['support_hand'] = hands
    return out


def main():
    started = time.time()
    g, accessor = read_gltf(SOURCE)
    log('bones', len(g['skins'][0]['joints']), 'meshes', [m['name'] for m in g['meshes']],
        'animations', [a['name'] for a in g['animations']])
    rig, meshes, clips = convert(g, accessor)
    pivots = give_pieces_bones(rig, meshes)
    glove = next(m for m in g['materials'] if m['name'] == 'Glove_D')
    glove_specular = glove.get('extensions', {}).get('KHR_materials_specular')
    bpy.ops.wm.read_factory_settings(use_empty=True)
    images = textures()
    log('textures', {k: f'{len(v) / 1e3:.0f} kB' for k, v in images.items()})
    write_glb(rig, meshes, clips, images, OUT_GLB, glove_specular)
    log('wrote', OUT_GLB, f'{os.path.getsize(OUT_GLB) / 1e6:.2f} MB')
    info = measure(rig, meshes, clips, pivots)
    info['bones'] = rig.names
    info['clips'] = {k: round(c['duration'], 4) for k, c in clips.items()}
    print('PISTOL23 ' + json.dumps(info))
    log(f'done in {time.time() - started:.0f} s')


main()
