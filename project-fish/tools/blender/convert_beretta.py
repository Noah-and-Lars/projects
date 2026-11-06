"""Turns the downloaded, animated Beretta with its own arms into the game's
third gun.

The model is "Beretta Pistol FPS ANIMATION" by BURNER (CC BY 4.0, see
README.md, Credits):
https://sketchfab.com/3d-models/beretta-pistol-fps-animation-0313ab1888994c14abeaf444d7af3217
Its arms are a Mixamo stock character's (Adobe's Mixamo, whose characters
may be used in games). Download its glTF version and unzip it so that the
folder holds scene.gltf and scene.bin, with its textures either in
textures/ (as scene.gltf names them) or loose beside scene.gltf. Then, from
the project-fish folder:

    blender --background --python tools/blender/convert_beretta.py -- build/upload-beretta build/beretta-raw.glb

(npm run build-beretta does this and compresses the result into
assets/beretta.glb.)

This gun comes with its own arms: bare forearms
and hands on one skeleton, a second small skeleton for the gun (frame,
slide, trigger, lever, magazine), and one 16.8 s animation holding all its
clips back to back. The game draws those arms instead of the soldier's
while it's held and plays the maker's own clips as they are, so this
script keeps the skeletons, the skinning and the keys, and only:
- Puts both skeletons on one rig and turns and scales everything into gun
  space (metres, +X right, +Y up, -Z forward), with the rig's root at the
  eye the arms were posed for (CAMERA), so putting the rig at the gun
  layer's camera shows the gun as its maker framed it. The bones' own
  frames are turned too.
- Makes it real size: the download's gun is SCALE times smaller than a
  92FS (217 mm long), so everything (gun, arms, animation) is scaled by it.
  From the eye this changes nothing: the whole picture grows about it.
- Cuts the one timeline into the clips (CLIPS), each starting at 0 and
  keeping every key of its own stretch: draw, inspect, shoot, reload (with
  rounds left), shootLast (the last round: the slide stays back), reload-
  Empty (slide locked back at the start, released at the end) and hide, and
  two one-frame stills taken from it: idle (the pose the gun rests in
  between them) and idleEmpty (the same with the slide locked back, where
  shootLast ends). Every clip moves every bone the timeline moves, so each
  sets the whole pose. Nothing is added, retimed or re-posed. (Where they
  are on the timeline was found from the bones' motion: the gun and hands
  hold the idle pose, quite still, between each clip and the next.)
- Leaves out the two IK target bones (no point is weighted to them) and the
  scale keys (all 1).
- Adds a node on the gun's frame bone, `gun`, turned so that in the idle
  pose its space is gun space moved to the frame (the frame bone itself is
  turned half round): the game measures the gun's points in it and hangs
  the muzzle flash on it.
- Textures: the arms come with the stock character's whole 4096 px body
  texture; only its right part is the arms', so that part is cut out (the
  arms' texture coordinates moved to match) and shrunk to ARMS_SIZE. The
  gun's are shrunk to GUN_SIZE. There are no maker's marks or logos on
  them to rub off (none in the colour or the normal map). All are stored
  as WebP. The skin isn't metal (the download leaves its metalness at 1),
  and it's toned down a little (SKIN_COLOUR).
- Keeps who made it and its license in the file (asset.copyright).
- Names the parts, bones, materials and animations plainly.

The game's constants for this gun (MODEL_BERETTA in src/viewmodel/beretta.js) are
printed at the end (BERETTA ...), measured from the result.
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
from texture_edit import image_array, store  # noqa: E402

ARGS = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else sys.argv[1:]
SOURCE, OUT_GLB = ARGS[0], ARGS[1]


def option(name, default):
    return ARGS[ARGS.index(name) + 1] if name in ARGS else default


# --- Placing it ---------------------------------------------------------------
# The download's armatures are Z up with the muzzle towards -Y (so its right
# is -X). Its gun is GUN_LENGTH units long along the bore, from the hammer
# to the muzzle;
# a 92FS is 217 mm.
GUN_LENGTH = 0.18717
SCALE = 0.217 / GUN_LENGTH  # download units to metres (1.159)
# The eye the arms were posed for (download units, in the armatures' space):
# on the line the gun is held out along when it's shown off (inspected,
# reloaded), 1 cm right of its middle, and 7 cm above its sights at rest,
# so the gun rests low and a little right, as at the hip. The game places it
# from there (see RIG in src/viewmodel/viewmodel.js).
CAMERA = tuple(float(x) for x in option('--camera', '-0.01,0.0,0.125').split(','))

# The clips: (name, start, end) on the download's timeline (seconds); a
# still is one frame (start = end).
CLIPS = [
    ('idle', 1.5, 1.5),
    ('draw', 1 / 30, 4 / 3),
    ('inspect', 5 / 3, 6.7),
    ('shoot', 7.5, 8 + 2 / 15),
    ('reload', 8 + 1 / 3, 11 + 1 / 30),
    ('shootLast', 11 + 1 / 3, 11 + 13 / 15),
    ('idleEmpty', 11 + 14 / 15, 11 + 14 / 15),
    ('reloadEmpty', 12.0, 16 + 1 / 30),
    ('hide', 16 + 1 / 3, 16 + 5 / 6),
]
STILL_LENGTH = 1 / 30  # seconds: two equal keys, so a still has a length

# Bones (download names, less their numbered endings) and ours. The IK
# targets are left out.
BONES = {'_rootJoint': 'rig', 'mixamorig2:Spine2': 'spine',
         'ARMA': 'frame_j', 'GATILLO': 'trigger_j', 'CORREDERA': 'slide_j', 'PALANCA': 'lever_j', 'CARGADOR': 'mag_j'}
DROPPED = {'mixamorig2:LeftArmIK.001', 'mixamorig2:RightArmIK.001'}
for side, s in (('Left', 'L'), ('Right', 'R')):
    BONES.update({f'mixamorig2:{side}Shoulder': f'shoulder_{s}', f'mixamorig2:{side}Arm': f'upperarm_{s}',
                  f'mixamorig2:{side}ForeArm': f'forearm_{s}', f'mixamorig2:{side}ForeArm.001': f'wrist_{s}',
                  f'mixamorig2:{side}Hand': f'hand_{s}'})
    for finger in ('Thumb', 'Index', 'Middle', 'Ring', 'Pinky'):
        for k in range(1, 4):
            BONES[f'mixamorig2:{side}Hand{finger}{k}'] = f'{finger.lower()}{k}_{s}'

MESHES = {'Ch22_Body_TEXTURA_0': 'arms', 'hammer_beretta_0': 'gun'}
MATERIALS = {'TEXTURA': 'beretta_arms', 'beretta': 'beretta_gun'}

# --- Textures -------------------------------------------------------------------
# The part of the body texture the arms use (u0, v0, u1, v1, glTF's v down
# from the top), a little wider than their texture coordinates, and its
# size once cut out (wide, high). A few triangles at the cut ends of the
# upper arms, behind the eye, are mapped elsewhere on the body (the shirt):
# they're given the skin at SHOULDER_UV.
ARMS_BOX = (0.554, 0.0, 1.0, 0.698)
ARMS_SIZE = (1024, 1600)
SHOULDER_UV = (0.80, 0.12)
GUN_SIZE = 1024
WEBP_QUALITY = 88
SKIN_ROUGHNESS = 0.6
# The stock character's skin is painted pale and bright: in the gun layer's
# light the bare arms were the brightest thing at the bottom of the view and
# drew the eye off the gun. Toned down a little.
SKIN_COLOUR = [0.8, 0.74, 0.7, 1.0]

# Who made it and its license (from its license.txt), in asset.extras as the
# other models keep them.
EXTRAS = {
    'title': 'Beretta Pistol FPS ANIMATION',
    'source': 'https://sketchfab.com/3d-models/beretta-pistol-fps-animation-0313ab1888994c14abeaf444d7af3217',
    'author': 'BURNER (https://sketchfab.com/Alexander_Ovelar)',
    'license': 'CC-BY-4.0 (http://creativecommons.org/licenses/by/4.0/)',
    'arms': 'A Mixamo character\'s (Adobe Mixamo)',
}
COPYRIGHT = ('This work is based on "Beretta Pistol FPS ANIMATION" '
             '(https://sketchfab.com/3d-models/beretta-pistol-fps-animation-0313ab1888994c14abeaf444d7af3217) '
             'by BURNER (https://sketchfab.com/Alexander_Ovelar) licensed under CC-BY-4.0 '
             '(http://creativecommons.org/licenses/by/4.0/). The arms are a Mixamo character\'s (Adobe Mixamo). '
             'Changed for Project Fish: turned, scaled to real size and placed for the game, the animation cut '
             'into clips, textures cut down, shrunk and stored as WebP, compressed.')

# --- Reading the download -------------------------------------------------------
COMPONENTS = {5126: np.float32, 5123: np.uint16, 5121: np.uint8, 5125: np.uint32, 5122: np.int16, 5120: np.int8}
WIDTH = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4, 'MAT4': 16}


def inside(folder, uri):
    """The path of a file the download names, which must be a plain file in
    its own folder (or its textures/ folder), not one reaching out of it."""
    base = os.path.realpath(folder)
    if uri.startswith('data:') or os.path.isabs(uri) or '..' in uri.replace('\\', '/').split('/'):
        raise SystemExit(f'unexpected file {uri!r} in the download')
    for candidate in (uri, os.path.basename(uri)):
        path = os.path.realpath(os.path.join(folder, candidate))
        if os.path.commonpath([base, path]) == base and os.path.isfile(path):
            return path
    raise SystemExit(f'{uri} not found in {folder}')


def read_gltf(folder):
    with open(os.path.join(folder, 'scene.gltf')) as f:
        g = json.load(f)
    with open(inside(folder, g['buffers'][0]['uri']), 'rb') as f:
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


def matrix_quat(m):
    t = np.trace(m)
    if t > 0:
        s = math.sqrt(t + 1) * 2
        q = [(m[2, 1] - m[1, 2]) / s, (m[0, 2] - m[2, 0]) / s, (m[1, 0] - m[0, 1]) / s, s / 4]
    elif m[0, 0] > m[1, 1] and m[0, 0] > m[2, 2]:
        s = math.sqrt(1 + m[0, 0] - m[1, 1] - m[2, 2]) * 2
        q = [s / 4, (m[0, 1] + m[1, 0]) / s, (m[0, 2] + m[2, 0]) / s, (m[2, 1] - m[1, 2]) / s]
    elif m[1, 1] > m[2, 2]:
        s = math.sqrt(1 + m[1, 1] - m[0, 0] - m[2, 2]) * 2
        q = [(m[0, 1] + m[1, 0]) / s, s / 4, (m[1, 2] + m[2, 1]) / s, (m[0, 2] - m[2, 0]) / s]
    else:
        s = math.sqrt(1 + m[2, 2] - m[0, 0] - m[1, 1]) * 2
        q = [(m[0, 2] + m[2, 0]) / s, (m[1, 2] + m[2, 1]) / s, s / 4, (m[1, 0] - m[0, 1]) / s]
    q = np.array(q, np.float64)
    return q / np.linalg.norm(q)


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


def node_matrix(n):
    if 'matrix' in n:
        return np.array(n['matrix'], np.float64).reshape(4, 4).T
    return trs_matrix(n.get('translation', [0, 0, 0]), n.get('rotation', [0, 0, 0, 1]), n.get('scale', [1, 1, 1]))


# --- The rig --------------------------------------------------------------------

class Rig:
    """The skeleton as a list of bones (name, parent, rest translation and
    rotation, inverse bind matrix) and a pose evaluator."""

    def __init__(self):
        self.names, self.parents, self.t, self.r, self.ibm = [], [], [], [], []

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
    _, corner = np.unique(np.round(position, 5), axis=0, return_inverse=True)
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
    parent_of = {c: i for i, n in enumerate(nodes) for c in n.get('children', [])}

    def world_of(i):
        m = node_matrix(nodes[i])
        while i in parent_of:
            i = parent_of[i]
            m = node_matrix(nodes[i]) @ m
        return m

    def stem(i):
        raw = nodes[i]['name']
        return raw.rsplit('_', 1)[0] if raw.rsplit('_', 1)[-1].isdigit() else raw

    # Both skeletons hang under a node with the same transform (the
    # armatures' space, A, to the download's world): their roots are one.
    skins = g['skins']
    roots = [s['skeleton'] for s in skins]
    above = [world_of(parent_of[r]) for r in roots]
    assert np.allclose(above[0], above[1], atol=1e-9), 'the two skeletons are placed differently'
    W = above[0]  # A to the download's world
    for r in roots:
        assert np.allclose(node_matrix(nodes[r]), np.eye(4)), 'a skeleton root is moved'

    # A to ours: p' = S R (p - C). R: -X (the gun's right) to +X, Z up to
    # +Y, -Y (forward) to -Z.
    R = np.array([[-1.0, 0, 0], [0, 0, 1.0], [0, 1.0, 0]])
    assert abs(np.linalg.det(R) - 1) < 1e-9
    L = np.eye(4)
    L[:3, :3] = R * SCALE  # (the linear part: bones' frames are turned by R)
    L_inv = np.linalg.inv(L)
    H = np.eye(4)
    H[:3, :3] = R * SCALE
    H[:3, 3] = -SCALE * (R @ np.asarray(CAMERA, np.float64))
    H_inv = np.linalg.inv(H)
    Hw = H @ np.linalg.inv(W)  # the download's world to ours

    def turn_q(q):
        return matrix_quat(R @ quat_matrix(q) @ R.T)

    def turn_t(t):
        return SCALE * (R @ np.asarray(t, np.float64))

    rig = Rig()
    bone_of = {}  # download node: our bone

    def add(i):
        if stem(i) in DROPPED:
            return
        if i in roots and roots.index(i) > 0:
            bone_of[i] = bone_of[roots[0]]
        else:
            if stem(i) not in BONES:
                raise SystemExit(f'unknown bone {nodes[i]["name"]}')
            n = nodes[i]
            p = parent_of.get(i)
            parent = bone_of.get(p)
            t, r = n.get('translation', [0, 0, 0]), n.get('rotation', [0, 0, 0, 1])
            assert 'matrix' not in n and np.allclose(n.get('scale', [1, 1, 1]), 1, atol=1e-4)
            rig.names.append(BONES[stem(i)])
            rig.parents.append(parent)
            if parent is None:
                local = H @ trs_matrix(t, r) @ L_inv  # from the eye to the armatures' origin
                rig.t.append(local[:3, 3])
                rig.r.append(matrix_quat(local[:3, :3]))
            else:
                rig.t.append(turn_t(t))
                rig.r.append(turn_q(r))
            bone_of[i] = len(rig.names) - 1
        for c in nodes[i].get('children', []):
            add(c)

    for r in roots:
        add(r)
    rig.ibm = [None] * len(rig.names)
    for s in skins:
        ibm = accessor(s['inverseBindMatrices']).reshape(-1, 4, 4).transpose(0, 2, 1).astype(np.float64)
        for j, m in zip(s['joints'], ibm):
            if j in bone_of and (j not in roots or j == roots[0]):
                rig.ibm[bone_of[j]] = L @ m @ np.linalg.inv(Hw)
    assert all(m is not None for m in rig.ibm)

    # Meshes, into our space (normals turned), their joints our bones.
    meshes = {}
    rot = Hw[:3, :3] / np.cbrt(np.linalg.det(Hw[:3, :3]))
    for node in nodes:
        if 'mesh' not in node:
            continue
        m = g['meshes'][node['mesh']]
        prim = m['primitives'][0]
        a = prim['attributes']
        joints_of = skins[node['skin']]['joints']
        J = accessor(a['JOINTS_0']).astype(np.int64)
        w = accessor(a['WEIGHTS_0']).astype(np.float64)
        w /= w.sum(1, keepdims=True)
        lookup = np.array([bone_of.get(j, -1) for j in joints_of])
        joints = lookup[J]
        assert (joints[w > 0] >= 0).all(), f'{m["name"]}: weighted to a left-out bone'
        joints[joints < 0] = 0
        pos = accessor(a['POSITION']).astype(np.float64)
        meshes[MESHES[m['name']]] = {
            'position': (np.c_[pos, np.ones(len(pos))] @ Hw.T)[:, :3],
            'normal': accessor(a['NORMAL']).astype(np.float64) @ rot.T,
            'uv': accessor(a['TEXCOORD_0']).astype(np.float64),
            'joints': joints, 'weights': w,
            'triangles': accessor(prim['indices']).astype(np.int64).reshape(-1, 3),
            'material': MATERIALS[g['materials'][prim['material']]['name']],
            'source': (node, pos, J, joints_of),
        }

    # Check: at rest, our rig puts every vertex where the download's does,
    # carried into our space.
    for name, mesh in meshes.items():
        node, pos, J, joints_of = mesh.pop('source')
        skin_def = skins[node['skin']]
        ibm = accessor(skin_def['inverseBindMatrices']).reshape(-1, 4, 4).transpose(0, 2, 1).astype(np.float64)
        mats = np.array([world_of(j) @ b for j, b in zip(joints_of, ibm)])
        p = np.c_[pos, np.ones(len(pos))]
        expect = np.zeros((len(p), 3))
        for k in range(4):
            expect += mesh['weights'][:, k:k + 1] * np.einsum('nij,nj->ni', mats[J[:, k]], p)[:, :3]
        expect = (np.c_[expect, np.ones(len(expect))] @ Hw.T)[:, :3]
        got = skin(rig, mesh)
        assert np.abs(expect - got).max() < 1e-6, f'{name} moved by {np.abs(expect - got).max()}'

    # The animation: one timeline, cut into the clips.
    assert len(g['animations']) == 1
    anim = g['animations'][0]
    tracks = {}
    for ch in anim['channels']:
        s = anim['samplers'][ch['sampler']]
        assert s.get('interpolation', 'LINEAR') == 'LINEAR'
        node, path = ch['target']['node'], ch['target']['path']
        times = accessor(s['input'])[:, 0].astype(np.float64)
        values = accessor(s['output']).astype(np.float64)
        if stem(node) in DROPPED:
            continue
        if path == 'scale':
            assert np.allclose(values, 1, atol=1e-4), f'{nodes[node]["name"]} is scaled'
            continue
        bone = bone_of[node]
        assert rig.parents[bone] is not None, 'the root is animated'
        if path == 'rotation':
            values = np.array([turn_q(q) for q in values])
            for i in range(1, len(values)):
                if values[i] @ values[i - 1] < 0:
                    values[i] = -values[i]
        elif path == 'translation':
            values = values * SCALE @ R.T
        else:
            raise SystemExit(f'unexpected {path} channel')
        tracks[(bone, path)] = (times, values)
    log(f'timeline: {len(tracks)} tracks, {min(t[0] for t, _ in tracks.values()):.3f}'
        f'-{max(t[-1] for t, _ in tracks.values()):.3f} s')

    clips = {}
    for name, start, end in CLIPS:
        out = {}
        for key in sorted(tracks):
            times, values = tracks[key]
            path = key[1]
            if end > start:
                inner = (times > start + 1e-4) & (times < end - 1e-4)
                t = [0.0] + list(times[inner] - start) + [end - start]
                v = [sample(times, values, start, path)] + list(values[inner]) + [sample(times, values, end, path)]
            else:
                v0 = sample(times, values, start, path)
                t, v = [0.0, STILL_LENGTH], [v0, v0]
            out[key] = (np.array(t), np.array(v))
        clips[name] = {'tracks': out, 'duration': float(max(t[-1] for t, _ in out.values())), 'start': start}
        log(f'{name}: {clips[name]["duration"]:.3f} s from {start:.3f}-{end:.3f} s, '
            f'{sum(len(t) for t, _ in out.values())} keys on {len(out)} tracks')
    return rig, meshes, clips


# --- Textures -------------------------------------------------------------------

def load(path, colour=True):
    image = bpy.data.images.load(os.path.abspath(path))
    image.colorspace_settings.name = 'sRGB' if colour else 'Non-Color'
    return image


def webp_bytes(image, name):
    folder = os.path.join(tempfile.gettempdir(), 'project-fish-beretta')
    os.makedirs(folder, exist_ok=True)
    path = os.path.join(folder, name + '.webp')
    store(image, image_array(image))
    image.file_format = 'WEBP'
    image.save(filepath=path, quality=WEBP_QUALITY)
    with open(path, 'rb') as f:
        return f.read()


def cut_out(image, box, size):
    """The part of an image in box (u0, v0, u1, v1; v down from the top), at
    size (wide, high)."""
    w, h = image.size
    x0, x1 = int(round(box[0] * w)), int(round(box[2] * w))
    y0, y1 = int(round(box[1] * h)), int(round(box[3] * h))
    a = image_array(image)[y0:y1, x0:x1]
    out = bpy.data.images.new(image.name + '_cut', x1 - x0, y1 - y0, alpha=True)
    out.colorspace_settings.name = image.colorspace_settings.name
    store(out, a)
    out.scale(*size)
    return out, (x0 / w, y0 / h, x1 / w, y1 / h)


def textures(g, meshes):
    images = [inside(SOURCE, im['uri']) for im in g['images']]
    tex = lambda i: images[g['textures'][i]['source']]  # noqa: E731
    mats = {m['name']: m for m in g['materials']}
    arms, gun = mats['TEXTURA'], mats['beretta']
    out = {}
    colour, box = cut_out(load(tex(arms['pbrMetallicRoughness']['baseColorTexture']['index'])), ARMS_BOX, ARMS_SIZE)
    normal, _ = cut_out(load(tex(arms['normalTexture']['index']), False), ARMS_BOX, ARMS_SIZE)
    out['arms_colour'] = webp_bytes(colour, 'arms_colour')
    out['arms_normal'] = webp_bytes(normal, 'arms_normal')
    # The arms' texture coordinates into the cut-out part.
    uv = meshes['arms']['uv']
    tris = meshes['arms']['triangles']
    centre = uv[tris].mean(1)
    stray = (centre[:, 0] < box[0]) | (centre[:, 0] > box[2]) | (centre[:, 1] < box[1]) | (centre[:, 1] > box[3])
    stray_verts = np.unique(tris[stray].ravel())
    uv[stray_verts] = SHOULDER_UV
    uv[:, 0] = (uv[:, 0] - box[0]) / (box[2] - box[0])
    uv[:, 1] = (uv[:, 1] - box[1]) / (box[3] - box[1])
    assert uv.min() >= -1e-6 and uv.max() <= 1 + 1e-6, (uv.min(0), uv.max(0))
    log(f'arms texture: {box}, {stray.sum()} triangles at the shoulders given plain skin')
    for key, index, colourful in (('gun_colour', gun['pbrMetallicRoughness']['baseColorTexture']['index'], True),
                                  ('gun_metal_rough', gun['pbrMetallicRoughness']['metallicRoughnessTexture']['index'], False),
                                  ('gun_normal', gun['normalTexture']['index'], False)):
        image = load(tex(index), colourful)
        image.scale(GUN_SIZE, GUN_SIZE)
        out[key] = webp_bytes(image, key)
    return out, arms.get('pbrMetallicRoughness', {}).get('roughnessFactor', 1.0)


# --- Writing the file -----------------------------------------------------------

class Writer:
    def __init__(self):
        self.g = {'asset': {'version': '2.0', 'generator': 'Project Fish convert_beretta.py', 'copyright': COPYRIGHT,
                            'extras': EXTRAS},
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

    def texture(self, name, data):
        self.g['images'].append({'name': name, 'mimeType': 'image/webp', 'bufferView': self.view(data)})
        self.g['textures'].append({'sampler': 0, 'extensions': {'EXT_texture_webp': {'source': len(self.g['images']) - 1}}})
        return {'index': len(self.g['textures']) - 1}

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


def write_glb(rig, meshes, clips, images, gun_turn, path):
    w = Writer()
    g = w.g
    # Node 0 is the rig's root (the eye); the bones follow in skin order,
    # then the `gun` node on the frame bone, then the meshes.
    g['nodes'].append({'name': 'beretta', 'children': []})
    first = 1
    for k, name in enumerate(rig.names):
        node = {'name': name}
        if np.abs(rig.t[k]).max() > 0:
            node['translation'] = [float(x) for x in rig.t[k]]
        if np.abs(rig.r[k] - [0, 0, 0, 1]).max() > 0:
            node['rotation'] = [float(x) for x in rig.r[k] / np.linalg.norm(rig.r[k])]
        g['nodes'].append(node)
    for k, p in enumerate(rig.parents):
        if p is None:
            g['nodes'][0]['children'].append(first + k)
        else:
            g['nodes'][first + p].setdefault('children', []).append(first + k)
    g['skins'].append({'name': 'beretta_rig', 'joints': list(range(first, first + len(rig.names))),
                       'skeleton': first + rig.parents.index(None),
                       'inverseBindMatrices': w.accessor(np.array([m.T.reshape(-1) for m in rig.ibm]), 'MAT4')})
    g['nodes'].append({'name': 'gun', 'rotation': [float(x) for x in gun_turn]})
    g['nodes'][first + rig.index('frame_j')].setdefault('children', []).append(len(g['nodes']) - 1)

    g['samplers'].append({'magFilter': 9729, 'minFilter': 9987, 'wrapS': 10497, 'wrapT': 10497})
    arms_rough = images.pop('_arms_roughness')
    g['materials'].append({'name': 'beretta_arms', 'doubleSided': True,
                           'pbrMetallicRoughness': {'baseColorTexture': w.texture('beretta_arms', images['arms_colour']),
                                                    'metallicFactor': 0.0, 'roughnessFactor': min(arms_rough, SKIN_ROUGHNESS),
                                                    'baseColorFactor': SKIN_COLOUR},
                           'normalTexture': w.texture('beretta_arms_normal', images['arms_normal'])})
    g['materials'].append({'name': 'beretta_gun', 'doubleSided': True,
                           'pbrMetallicRoughness': {'baseColorTexture': w.texture('beretta_gun', images['gun_colour']),
                                                    'metallicRoughnessTexture': w.texture('beretta_gun_metal_rough', images['gun_metal_rough'])},
                           'normalTexture': w.texture('beretta_gun_normal', images['gun_normal'])})
    material_index = {'beretta_arms': 0, 'beretta_gun': 1}

    for name in ('arms', 'gun'):
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
                                     'target': {'node': first + bone, 'path': prop}})
        g['animations'].append(anim)
    w.write(path)


# --- Measuring --------------------------------------------------------------------

def r4(v):
    return [round(float(x), 4) for x in v]


def measure(rig, meshes, clips):
    out = {'scale': round(SCALE, 5), 'camera': list(CAMERA)}
    idle = clip_pose(clips['idle'], 0)
    world = rig.world(idle)
    fj, sj, mj = rig.index('frame_j'), rig.index('slide_j'), rig.index('mag_j')
    F = world[fj]
    # The `gun` node: at the frame bone, turned so that at idle it's lined up
    # with gun space.
    gun_turn = matrix_quat(F[:3, :3].T)
    G = F.copy()
    G[:3, :3] = np.eye(3)
    to_gun = np.linalg.inv(G)
    out['frame_idle'] = r4(F[:3, 3])
    out['frame_turn_deg'] = round(math.degrees(math.acos(np.clip((np.trace(F[:3, :3]) - 1) / 2, -1, 1))), 2)

    gun = meshes['gun']
    gp = skin(rig, gun, idle)
    pieces = loose_pieces(gun['position'], gun['triangles'])
    vert_piece = np.zeros(len(gp), np.int64)
    vert_piece[gun['triangles'].ravel()] = np.repeat(pieces, 3)
    dom = gun['joints'][np.arange(len(gp)), gun['weights'].argmax(1)]
    out['gun_length'] = round(float(np.ptp(gp[:, 2])), 4)
    out['gun_box'] = {'min': r4(gp.min(0)), 'max': r4(gp.max(0))}
    out['gun_height'] = round(float(np.ptp(gp[:, 1])), 4)
    # The slide (the points on its bone) and the barrel (the frame's piece
    # reaching furthest forward).
    sv = gp[dom == sj]
    out['slide'] = {'top': round(float(sv[:, 1].max()), 4), 'front': round(float(sv[:, 2].min()), 4),
                    'back': round(float(sv[:, 2].max()), 4), 'halfWidth': round(float(np.ptp(sv[:, 0]) / 2), 4),
                    'centreX': round(float((sv[:, 0].max() + sv[:, 0].min()) / 2), 4)}
    front = {}
    for L in np.unique(vert_piece[dom == fj]):
        v = gp[(vert_piece == L) & (dom == fj)]
        front[L] = v[:, 2].min()
    barrel = min(front, key=front.get)
    bv = gp[(vert_piece == barrel)]
    crown = bv[bv[:, 2] < bv[:, 2].min() + 0.001]
    muzzle = np.array([(crown[:, 0].max() + crown[:, 0].min()) / 2, (crown[:, 1].max() + crown[:, 1].min()) / 2, bv[:, 2].min()])
    out['muzzle'] = r4(muzzle)
    out['muzzle_in_gun'] = r4((to_gun @ np.r_[muzzle, 1])[:3])
    # The sights: the slide's highest pieces at its back and front.
    spieces = {}
    for L in np.unique(vert_piece[dom == sj]):
        v = gp[(vert_piece == L) & (dom == sj)]
        spieces[L] = v
    body = max(spieces, key=lambda L: len(spieces[L]))
    middle = (sv[:, 2].max() + sv[:, 2].min()) / 2
    tall = sorted(spieces.values(), key=lambda v: -v[:, 1].max())
    rear = next(v for v in tall if v[:, 2].mean() > middle)
    frontsight = next(v for v in tall if v[:, 2].mean() < middle)
    # (The sights may be part of the slide's main piece: then their tops
    # are the slide's highest points at each end.)
    if rear is spieces[body] or frontsight is spieces[body]:
        top = sv[:, 1].max()
        high = sv[sv[:, 1] > top - 0.004]
        rear = high[high[:, 2] > middle]
        frontsight = high[high[:, 2] < middle]
    out['sights'] = {
        'rearTop': round(float(rear[:, 1].max()), 4), 'rearZ': round(float(rear[rear[:, 1] > rear[:, 1].max() - 0.001][:, 2].max()), 4),
        'rearX': round(float((rear[:, 0].max() + rear[:, 0].min()) / 2), 4),
        'frontTop': round(float(frontsight[:, 1].max()), 4),
        'frontZ': round(float(frontsight[frontsight[:, 1] > frontsight[:, 1].max() - 0.001][:, 2].max()), 4),
        'frontX': round(float((frontsight[:, 0].max() + frontsight[:, 0].min()) / 2), 4)}
    s = out['sights']
    out['sights_in_gun'] = {'x': round(s['rearX'] - F[0, 3], 4), 'height': round(s['rearTop'] - F[1, 3], 4),
                            'frontHeight': round(s['frontTop'] - F[1, 3], 4),
                            'rearZ': round(s['rearZ'] - F[2, 3], 4), 'frontZ': round(s['frontZ'] - F[2, 3], 4)}
    # The ejection port: on the slide's right side, just under its top, a
    # little in front of the rear sight (where a 92's is).
    out['port'] = r4([sv[:, 0].max() - 0.002, out['slide']['top'] - 0.011, s['rearZ'] - 0.045])
    out['port_in_gun'] = r4((to_gun @ np.r_[out['port'], 1])[:3])
    mv = gp[dom == mj]
    out['magazine_box'] = {'min': r4(mv.min(0)), 'max': r4(mv.max(0))}
    out['eye_to_rear_sight'] = [s['rearX'], s['rearTop'], s['rearZ']]
    out['view_angles_deg'] = {'right': round(math.degrees(math.atan2(s['rearX'], -s['rearZ'])), 2),
                              'down': round(math.degrees(math.atan2(-s['rearTop'], -s['rearZ'])), 2)}

    # The clips' events, from the bones' paths (in the frame's space).
    def path(clip, step=1 / 120):
        n = int(round(clips[clip]['duration'] / step)) + 1
        ts = np.linspace(0, clips[clip]['duration'], n)
        return ts, [rig.world(clip_pose(clips[clip], t)) for t in ts]

    rest_slide = (np.linalg.inv(F) @ world[sj])[:3, 3]
    rest_mag = (np.linalg.inv(F) @ world[mj])[:3, 3]
    events = {}
    for clip in ('shoot', 'shootLast', 'reload', 'reloadEmpty', 'draw', 'hide', 'inspect'):
        ts, ws = path(clip)
        slide = np.array([np.linalg.norm((np.linalg.inv(wm[fj]) @ wm[sj])[:3, 3] - rest_slide) for wm in ws])
        mag = np.array([np.linalg.norm((np.linalg.inv(wm[fj]) @ wm[mj])[:3, 3] - rest_mag) for wm in ws])
        frame = np.array([np.linalg.norm(wm[fj][:3, 3] - F[:3, 3]) for wm in ws])
        e = {'duration': round(clips[clip]['duration'], 3), 'slideMax': round(float(slide.max()), 4),
             'magMax': round(float(mag.max()), 4)}
        if slide.max() > 0.003:
            e['slideStarts'] = round(float(ts[np.argmax(slide > slide[0] + 0.0005)]), 3)
            back = slide > 0.003
            e['slideBack'] = round(float(ts[np.argmax(back)]), 3)
            e['slideFullyBack'] = round(float(ts[np.argmax(slide)]), 3)
            home = len(back) - 1 - np.argmax(back[::-1])
            e['slideHome'] = round(float(ts[home]), 3) if home < len(ts) - 1 else None
            if clip == 'reloadEmpty':
                # The slide goes on back from where it's locked, and is let go.
                full = slide > slide[0] + 0.002
                if full.any():
                    e['slidePulled'] = round(float(ts[np.argmax(full)]), 3)
                    e['slideRelease'] = round(float(ts[np.argmax(slide)]), 3)
        if mag.max() > 0.003:
            moved = mag > 0.002
            e['magOut'] = round(float(ts[np.argmax(moved)]), 3)
            e['magFurthest'] = round(float(ts[np.argmax(mag)]), 3)
            last = len(moved) - 1 - np.argmax(moved[::-1])
            e['magIn'] = round(float(ts[last]), 3)
            e['magPath'] = [[round(float(ts[i]), 2), round(float(mag[i]), 3)] for i in range(0, len(ts), 12)]
        if clip == 'draw':
            settled = frame < 0.003
            k = len(settled) - 1
            while k > 0 and settled[k - 1]:
                k -= 1
            e['gunSettled'] = round(float(ts[k]), 3)
            near = frame < 0.015
            k = len(near) - 1
            while k > 0 and near[k - 1]:
                k -= 1
            e['gunNear'] = round(float(ts[k]), 3)
        if clip == 'hide':
            e['gunLeaves'] = round(float(ts[np.argmax(frame > 0.003)]), 3)
        events[clip] = e
    out['events'] = events
    out['bones'] = rig.names
    return out, gun_turn


def main():
    started = time.time()
    g, accessor = read_gltf(SOURCE)
    log('bones', sum(len(s['joints']) for s in g['skins']), 'meshes', [m['name'] for m in g['meshes']],
        'animations', [a['name'] for a in g['animations']])
    rig, meshes, clips = convert(g, accessor)
    info, gun_turn = measure(rig, meshes, clips)
    bpy.ops.wm.read_factory_settings(use_empty=True)
    images, arms_rough = textures(g, meshes)
    images['_arms_roughness'] = arms_rough
    log('textures', {k: f'{len(v) / 1e3:.0f} kB' for k, v in images.items() if isinstance(v, bytes)})
    write_glb(rig, meshes, clips, images, gun_turn, OUT_GLB)
    log('wrote', OUT_GLB, f'{os.path.getsize(OUT_GLB) / 1e6:.2f} MB')
    info['clips'] = {k: round(c['duration'], 4) for k, c in clips.items()}
    info['timeline'] = {k: round(c['start'], 4) for k, c in clips.items()}
    print('BERETTA ' + json.dumps(info))
    log(f'done in {time.time() - started:.0f} s')


main()
