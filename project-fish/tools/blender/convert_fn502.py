"""Turns the downloaded, animated FN 502 Tactical with its own arms into the
game's fourth gun.

The model is "FPS animations FN 502 Tactical" by Cransh (CC BY 4.0, see
README.md, Credits):
https://sketchfab.com/3d-models/fps-animations-fn-502-tactical-dad2ee1250054a63adaa81918887c0fe
Download its glTF version and unzip it so that the folder holds scene.gltf
and scene.bin, with its textures either in textures/ (as scene.gltf names
them) or loose beside scene.gltf. Then, from the project-fish folder:

    blender --background --python tools/blender/convert_fn502.py -- build/fn502-source build/fn502-raw.glb

(npm run build-fn502 does this and compresses the result into
assets/fn502.glb.)

Like the Beretta (convert_beretta.py), it comes with its own arms (gloved
hands and sleeves) and its own animations, and the game plays its maker's
clips as they are. One skeleton holds the arms and the gun (frame, slide,
trigger, hammer, magazine), and there are five clips: FN_Shot (one shot),
FN_Reload (with rounds left: the slide doesn't move), FN_ReloadFull (from
empty: after the fresh magazine goes in, the support hand racks the slide),
FN_Walk and FN_Run (the hands' sway walking and running). Every clip starts
and ends in the same pose, the one the gun rests in. There are no draw, put-
away or inspect clips, and none with the slide locked back. This script
keeps the skeleton, the skinning and the keys, and only:
- Turns and scales everything into gun space (metres, +X right, +Y up, -Z
  forward), with the rig's root at the eye the maker framed it from (the
  download's own camera, CAMERA), so putting the rig at the gun layer's
  camera shows the gun as its maker framed it. The bones' frames are
  turned too.
- Makes it real size: the download is SCALE times bigger than an FN 502
  Tactical (190 mm long), so everything (gun, arms, animation) is scaled by
  it. From the eye this changes nothing: the whole picture shrinks about it.
- Keeps the clips with every key as made (idle, shoot, reload, reloadEmpty,
  walk, run), and takes one more from them: idle, a still of the pose every
  clip starts in (FN_Shot's first frame). Every clip is given every bone
  any clip moves (a bone a clip leaves alone is held where it rests), so
  each sets the whole pose. Nothing is added, retimed or re-posed.
- Leaves out the two IK pole targets (no point is weighted to them) and the
  scale keys (all 1).
- Adds a node on the gun's frame bone, `gun`, turned so that in the idle
  pose its space is gun space moved to the frame bone (the gun is held
  turned a little onto its side): the game measures the gun's points in it
  and hangs the muzzle flash on it.
- Textures: the download's are specular/glossiness (KHR_materials_pbr-
  SpecularGlossiness, which three.js no longer reads), so they're turned
  into metal/roughness, texel by texel (as Khronos's converter does), and
  shrunk from 4096 px (ARMS_SIZE, GUN_SIZE, ORM_SIZE). The gun's are turned half round
  on the model (KHR_texture_transform): that's put into its texture
  coordinates instead. The maker's name and logos, its address, the model
  number, the serial and proof marks are rubbed off the gun's (RUB_OUT; the
  calibre and the magazine's round count stay). The arms' ambient
  occlusion goes in the red of their metal/roughness texture. All are
  stored as WebP.
- Keeps who made it and its license in the file (asset.copyright).
- Names the parts, bones, materials and animations plainly.

The game's constants for this gun (MODEL_FN502 in src/viewmodel/fn502.js)
are printed at the end (FN502 ...), measured from the result.
"""

import json
import math
import os
import sys
import time

import bpy
import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import linear_to_srgb, log  # noqa: E402
from rigged_gltf import (Rig, Writer, clip_pose, cut, inside, loose_pieces, matrix_quat, node_matrix,  # noqa: E402
                         quat_matrix, read_gltf, sample, skin, trs_matrix, webp_bytes, write_clips, write_mesh,
                         write_rig)
from texture_edit import box_blur, clone_over, deviation_mask, image_array, rub_out, store, to_linear  # noqa: E402

ARGS = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else sys.argv[1:]
SOURCE, OUT_GLB = ARGS[0], ARGS[1]

# --- Placing it ---------------------------------------------------------------
# The download's armature is Z up with the muzzle towards -Y (so its right is
# -X). Its gun is GUN_LENGTH units long along the bore, from the back of the
# slide to the front of the thread protector; an FN 502 Tactical is 190 mm.
GUN_LENGTH = 0.26853
SCALE = 0.19 / GUN_LENGTH  # download units to metres (0.708)
# The eye: the download's camera (an FBX camera, looking along its own +X,
# which in the armature's space is forward, -Y, with +Z up).
CAMERA_NODE = 'Camera'
# Where the ejection port's middle is: this far (metres) in front of the rear
# sight (from the model: the opening is 70-111 mm from the slide's back).
PORT_AHEAD = 0.075

# The clips: ours, and the download's animation each is (all of it), or for
# a still, the animation and the time it's taken at.
CLIPS = [
    ('idle', 'FN_Shot', 0.0),
    ('shoot', 'FN_Shot', None),
    ('reload', 'FN_Reload', None),
    ('reloadEmpty', 'FN_ReloadFull', None),
    ('walk', 'FN_Walk', None),
    ('run', 'FN_Run', None),
]

# Bones (download names, less their numbered endings) and ours. The IK pole
# targets are left out (the hands hang under their IK controls, which are
# kept: every bone's keys are baked).
BONES = {'_rootJoint': 'rig', 'Root': 'body',
         'Main': 'frame_j', 'Slide': 'slide_j', 'Trigger': 'trigger_j', 'Hammer': 'hammer_j', 'Mag': 'mag_j'}
DROPPED = {'IK_PoleTrgt_L', 'IK_PoleTrgt_R'}
# The fingers' chains, from the hand (.004-.007 is the index finger, from
# its metacarpal; then the middle, ring and little fingers, by their
# lengths; .020-.022 the thumb).
FINGERS = [('index', 4, 4), ('middle', 8, 4), ('ring', 12, 4), ('little', 16, 4), ('thumb', 20, 3)]
for s in ('L', 'R'):
    BONES.update({f'Arm_{s}': f'shoulder_{s}', f'UpArm_{s}': f'upperarm_{s}', f'Forearm_{s}': f'forearm_{s}',
                  f'BoneTwist_03.{s}': f'twist1_{s}', f'BoneTwist_02.{s}': f'twist2_{s}',
                  f'BoneTwist_01.{s}': f'twist3_{s}', f'IK_Hand_Cntrl_{s}': f'hand_ik_{s}', f'Hand_{s}': f'hand_{s}'})
    for finger, start, count in FINGERS:
        for k in range(count):
            BONES[f'Bone_{s}.{start + k:03d}'] = f'{finger}{k if count == 4 else k + 1}_{s}'

MESHES = {'arms_arms_0': 'arms', '502_1_low.001_gun_0': 'gun'}
MATERIALS = {'arms': 'fn502_arms', 'material': 'fn502_gun'}

# --- Textures -------------------------------------------------------------------
ARMS_SIZE = 1024
GUN_SIZE = 1024
# (Their metalness, roughness and ambient occlusion are smooth enough at
# half that.)
ORM_SIZE = 512
WEBP_QUALITY = 88
# The specular colour a non-metal reflects (Khronos's converter's 4%).
DIELECTRIC = 0.04

# Markings rubbed off the gun's textures: (box in the download's 4096 px
# textures (x0, y0, x1, y1), how): 'letters' fills just what stands out
# (letters on a plain surface), 'fill' the whole box, 'clone' copies the
# patch beside it (for stippling).
RUB_OUT = [
    ((396, 560, 540, 1020), 'letters'),  # frame, right: the maker's address and the maker's line
    ((1396, 586, 1504, 812), 'letters'),  # slide, right: serial, proof and date marks
    ((1596, 1616, 1772, 1820), 'fill'),  # grip side: the maker's logo
    ((2092, 866, 2296, 1048), 'letters'),  # slide, left: the maker's logo (the calibre above it stays)
    ((1986, 1296, 2384, 1424), 'letters'),  # frame: model, calibre and serial line
    ((3458, 1886, 3548, 2046), 'letters'),  # frame plate: serial and proof marks
    ((70, 3524, 256, 3706), 'clone'),  # grip back: the maker's logo
    ((888, 3524, 1076, 3706), 'clone'),  # grip back: the maker's logo, other side
    ((3212, 2812, 3348, 3048), 'letters'),  # slide: the model number
    ((2538, 2788, 2592, 2862), 'letters'),  # frame: proof marks
]
STANDS_OUT = (0.06, 0.08, 0.06)  # colour, normal map, specular/glossiness

COPYRIGHT = ('This work is based on "FPS animations FN 502 Tactical" '
             '(https://sketchfab.com/3d-models/fps-animations-fn-502-tactical-dad2ee1250054a63adaa81918887c0fe) '
             'by Cransh (https://sketchfab.com/ccransh) licensed under CC-BY-4.0 '
             '(http://creativecommons.org/licenses/by/4.0/). '
             'Changed for Project Fish: turned, scaled to real size and placed for the game, an idle still taken '
             'from its shot clip, markings rubbed off, materials turned into metal/roughness, textures shrunk and '
             'stored as WebP, compressed.')


# --- Reading the download -------------------------------------------------------

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

    assert len(g['skins']) == 1
    skin_def = g['skins'][0]
    root = skin_def['skeleton']
    W = world_of(parent_of[root])  # the armature's space, A, to the download's world
    assert np.allclose(node_matrix(nodes[root]), np.eye(4)), 'the skeleton root is moved'

    # The eye: the camera, in the armature's space (an FBX camera looks
    # along its own +X, up its +Y).
    cam = next(i for i, n in enumerate(nodes) if n.get('name') == CAMERA_NODE)
    C = np.linalg.inv(W) @ world_of(cam)
    look, up = C[:3, 0] / np.linalg.norm(C[:3, 0]), C[:3, 1] / np.linalg.norm(C[:3, 1])
    assert np.allclose(look, [0, -1, 0], atol=1e-4) and np.allclose(up, [0, 0, 1], atol=1e-4), (look, up)
    camera = C[:3, 3]
    log(f'eye (armature space): {np.round(camera, 4)}')

    # A to ours: p' = S R (p - C). R: -X (the gun's right) to +X, Z up to
    # +Y, -Y (forward) to -Z.
    R = np.array([[-1.0, 0, 0], [0, 0, 1.0], [0, 1.0, 0]])
    L = np.eye(4)
    L[:3, :3] = R * SCALE
    L_inv = np.linalg.inv(L)
    H = np.eye(4)
    H[:3, :3] = R * SCALE
    H[:3, 3] = -SCALE * (R @ camera)
    Hw = H @ np.linalg.inv(W)  # the download's world to ours

    def turn_q(q):
        return matrix_quat(R @ quat_matrix(q) @ R.T)

    def turn_t(t):
        return SCALE * (R @ np.asarray(t, np.float64))

    rig = Rig()
    bone_of = {}

    def add(i):
        if stem(i) in DROPPED:
            return
        if stem(i) not in BONES:
            raise SystemExit(f'unknown bone {nodes[i]["name"]}')
        n = nodes[i]
        parent = bone_of.get(parent_of.get(i))
        t, r = n.get('translation', [0, 0, 0]), n.get('rotation', [0, 0, 0, 1])
        assert 'matrix' not in n and np.allclose(n.get('scale', [1, 1, 1]), 1, atol=1e-4)
        rig.names.append(BONES[stem(i)])
        rig.parents.append(parent)
        if parent is None:
            local = H @ trs_matrix(t, r) @ L_inv  # from the eye to the armature's origin
            rig.t.append(local[:3, 3])
            rig.r.append(matrix_quat(local[:3, :3]))
        else:
            rig.t.append(turn_t(t))
            rig.r.append(turn_q(r))
        bone_of[i] = len(rig.names) - 1
        for c in n.get('children', []):
            add(c)

    add(root)
    rig.ibm = [None] * len(rig.names)
    ibm = accessor(skin_def['inverseBindMatrices']).reshape(-1, 4, 4).transpose(0, 2, 1).astype(np.float64)
    for j, m in zip(skin_def['joints'], ibm):
        if j in bone_of:
            rig.ibm[bone_of[j]] = L @ m @ np.linalg.inv(Hw)
    assert all(m is not None for m in rig.ibm)

    # Meshes, into our space (normals turned), their joints our bones.
    meshes = {}
    rot = Hw[:3, :3] / np.cbrt(np.linalg.det(Hw[:3, :3]))
    joints_of = skin_def['joints']
    lookup = np.array([bone_of.get(j, -1) for j in joints_of])
    for node in nodes:
        if 'mesh' not in node:
            continue
        m = g['meshes'][node['mesh']]
        assert len(m['primitives']) == 1
        prim = m['primitives'][0]
        a = prim['attributes']
        J = accessor(a['JOINTS_0']).astype(np.int64)
        w = accessor(a['WEIGHTS_0']).astype(np.float64)
        w /= w.sum(1, keepdims=True)
        joints = lookup[J]
        assert (joints[w > 0] >= 0).all(), f'{m["name"]}: weighted to a left-out bone'
        joints[joints < 0] = 0
        pos = accessor(a['POSITION']).astype(np.float64)
        material = g['materials'][prim['material']]
        uv = accessor(a['TEXCOORD_0']).astype(np.float64)
        uv, wraps = texture_turn(g, material, uv)
        meshes[MESHES[m['name']]] = {
            'position': (np.c_[pos, np.ones(len(pos))] @ Hw.T)[:, :3],
            'normal': accessor(a['NORMAL']).astype(np.float64) @ rot.T,
            'uv': uv, 'joints': joints, 'weights': w,
            'triangles': accessor(prim['indices']).astype(np.int64).reshape(-1, 3),
            'material': MATERIALS[material['name']], 'wraps': wraps,
            'source': (pos, J),
        }

    # Check: at rest, our rig puts every vertex where the download's does,
    # carried into our space.
    mats = np.array([world_of(j) @ b for j, b in zip(joints_of, ibm)])
    for name, mesh in meshes.items():
        pos, J = mesh.pop('source')
        p = np.c_[pos, np.ones(len(pos))]
        expect = np.zeros((len(p), 3))
        for k in range(4):
            expect += mesh['weights'][:, k:k + 1] * np.einsum('nij,nj->ni', mats[J[:, k]], p)[:, :3]
        expect = (np.c_[expect, np.ones(len(expect))] @ Hw.T)[:, :3]
        got = skin(rig, mesh)
        assert np.abs(expect - got).max() < 1e-6, f'{name} moved by {np.abs(expect - got).max()}'

    # The animations, into our space.
    anims = {}
    for anim in g['animations']:
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
                assert np.allclose(values, 1, atol=1e-3), f'{nodes[node]["name"]} is scaled'
                continue
            bone = bone_of[node]
            if path == 'rotation':
                values = np.array([turn_q(q) for q in values])
                for i in range(1, len(values)):
                    if values[i] @ values[i - 1] < 0:
                        values[i] = -values[i]
            elif path == 'translation':
                values = values * SCALE @ R.T
                if rig.parents[bone] is None:
                    assert np.ptp(values, 0).max() < 1e-9, 'the root is moved'
                    continue  # (it's the root's rest place, in the download's units: ours is kept)
            else:
                raise SystemExit(f'unexpected {path} channel')
            if rig.parents[bone] is None:
                assert np.ptp(values, 0).max() < 1e-9, 'the root is turned'
                continue
            tracks[(bone, path)] = (times, values)
        anims[anim['name'].split('|')[-1]] = tracks

    # Every clip sets every bone any clip moves (where a clip leaves one
    # alone, it rests where it's bound).
    every = sorted(set(k for tracks in anims.values() for k in tracks))
    clips = {}
    for name, source, still in CLIPS:
        tracks = dict(anims[source])
        duration = max(t[-1] for t, _ in tracks.values())
        for bone, path in every:
            if (bone, path) not in tracks:
                rest = rig.t[bone] if path == 'translation' else rig.r[bone]
                tracks[(bone, path)] = (np.array([0.0, duration]), np.array([rest, rest]))
        out = cut(tracks, still, still) if still is not None else cut(tracks, 0.0, duration)
        clips[name] = {'tracks': out, 'duration': float(max(t[-1] for t, _ in out.values())), 'source': source}
        log(f'{name}: {clips[name]["duration"]:.3f} s from {source}{"" if still is None else f" at {still} s"}, '
            f'{sum(len(t) for t, _ in out.values())} keys on {len(out)} tracks')
    # (Every clip starts and ends in the idle pose, or nearly: see how far
    # each bone is from it.)
    idle = rig.world(clip_pose(clips['idle'], 0))
    for name, clip in clips.items():
        for t in (0, clip['duration']):
            other = rig.world(clip_pose(clip, t))
            gaps = [np.abs(a[:3, 3] - b[:3, 3]).max() for a, b in zip(idle, other)]
            k = int(np.argmax(gaps))
            if gaps[k] > 0.001:
                log(f'  {name} at {t:.2f} s: {rig.names[k]} {gaps[k] * 1000:.1f} mm from where it is at idle')
    return rig, meshes, clips


def texture_turn(g, material, uv):
    """A material's texture coordinates with its KHR_texture_transform (the
    same on all its textures: here a half turn about the origin) put into
    them, and the wrapping its textures need (wrapS, wrapT: repeated or
    mirrored, as the download's sampler has them)."""
    spec = material.get('extensions', {}).get('KHR_materials_pbrSpecularGlossiness', {})
    infos = [i for i in (spec.get('diffuseTexture'), spec.get('specularGlossinessTexture'),
                         material.get('normalTexture'), material.get('occlusionTexture')) if i]
    transforms = {json.dumps(i.get('extensions', {}).get('KHR_texture_transform')) for i in infos}
    samplers = {json.dumps(g['samplers'][g['textures'][i['index']]['sampler']]) for i in infos}
    assert len(transforms) == 1 and len(samplers) == 1, 'the textures are moved or wrapped differently'
    tt, sampler = json.loads(transforms.pop()), json.loads(samplers.pop())
    wraps = (sampler.get('wrapS', 10497), sampler.get('wrapT', 10497))
    if not tt:
        return uv, wraps
    assert set(tt) == {'rotation'} and abs(math.cos(tt['rotation']) + 1) < 1e-9, f'unexpected texture transform {tt}'
    # A half turn: (u, v) to (-u, -v). Mirrored, -x reads the same texel as
    # x; repeated, as 1 - x (for 0..1).
    out = uv.copy()
    for axis, wrap in enumerate(wraps):
        if wrap == 10497:
            assert uv[:, axis].min() > -1e-6 and uv[:, axis].max() < 1 + 1e-6
            out[:, axis] = 1 - uv[:, axis]
        else:
            assert wrap == 33648, wrap
    return out, wraps


# --- Textures -------------------------------------------------------------------

def load(path, colour, size):
    image = bpy.data.images.load(os.path.abspath(path))
    image.colorspace_settings.name = 'sRGB' if colour else 'Non-Color'
    image.scale(size, size)
    return image


def new_image(name, a, colour=False):
    h, w = a.shape[:2]
    image = bpy.data.images.new(name, w, h, alpha=True)
    image.colorspace_settings.name = 'sRGB' if colour else 'Non-Color'
    store(image, a.astype(np.float32))
    return image


def brightness(c):
    return np.sqrt(0.299 * c[..., 0] ** 2 + 0.587 * c[..., 1] ** 2 + 0.114 * c[..., 2] ** 2)


def metal_rough(diffuse, spec_gloss, spec_factor, gloss_factor):
    """Specular/glossiness texels (sRGB colour and specular, glossiness in
    the specular's alpha) as metal/roughness: base colour (sRGB), metalness
    and roughness, as Khronos's converter works them out."""
    d = to_linear(diffuse[..., :3])
    s = to_linear(spec_gloss[..., :3]) * np.asarray(spec_factor)
    strength = s.max(-1)
    one_minus = 1 - strength
    db, sb = brightness(d), brightness(s)
    a = DIELECTRIC
    b = db * one_minus / (1 - a) + sb - 2 * a
    c = a - sb
    metal = np.clip((-b + np.sqrt(np.maximum(b * b - 4 * a * c, 0))) / (2 * a), 0, 1)
    metal[sb < a] = 0
    from_diffuse = d * (one_minus / (1 - a) / np.maximum(1 - metal, 1e-6))[..., None]
    from_spec = (s - a * (1 - metal)[..., None]) / np.maximum(metal, 1e-6)[..., None]
    base = np.clip(from_diffuse + (from_spec - from_diffuse) * (metal * metal)[..., None], 0, 1)
    rough = 1 - spec_gloss[..., 3] * gloss_factor
    return linear_to_srgb(base), metal, rough


def textures(g):
    images = [inside(SOURCE, im['uri']) for im in g['images']]
    tex = lambda info: images[g['textures'][info['index']]['source']]  # noqa: E731
    mats = {m['name']: m for m in g['materials']}
    out = {}
    for name, size in (('arms', ARMS_SIZE), ('material', GUN_SIZE)):
        m = mats[name]
        sg = m['extensions']['KHR_materials_pbrSpecularGlossiness']
        assert sg.get('diffuseFactor', [1, 1, 1, 1]) == [1.0, 1.0, 1.0, 1.0]
        diffuse = image_array(load(tex(sg['diffuseTexture']), True, size))
        normal = image_array(load(tex(m['normalTexture']), False, size))
        spec = image_array(load(tex(sg['specularGlossinessTexture']), True, size))
        if name == 'material':
            k = size / 4096
            maps = [diffuse, normal, spec]
            for box4096, how in RUB_OUT:
                box = (int(math.floor(box4096[0] * k)), int(math.floor(box4096[1] * k)),
                       int(math.ceil(box4096[2] * k)), int(math.ceil(box4096[3] * k)))
                if how == 'letters':
                    rub_out(maps, box, deviation_mask(maps, box, STANDS_OUT), normal=1)
                elif how == 'fill':
                    rub_out(maps, box, None, normal=1)
                else:
                    clone_over(maps, box, guide=1)
            log(f'gun: {len(RUB_OUT)} markings rubbed off')
        # (Blender gives the glossiness of a grey-and-alpha image in alpha.)
        base, metal, rough = metal_rough(diffuse, spec, sg.get('specularFactor', [1, 1, 1]), sg.get('glossinessFactor', 1))
        log(f'{name}: metalness {metal.mean():.3f} on average ({(metal > 0.5).mean() * 100:.0f}% metal), '
            f'roughness {rough.mean():.3f}')
        colour = np.concatenate([base, np.ones(base.shape[:2] + (1,))], -1)
        orm = np.ones(base.shape[:2] + (4,))
        orm[..., 1], orm[..., 2] = rough, metal
        if 'occlusionTexture' in m:
            orm[..., 0] = image_array(load(tex(m['occlusionTexture']), False, size))[..., 0]
        key = 'arms' if name == 'arms' else 'gun'
        image = new_image(f'{key}_colour', colour, True)
        out[f'{key}_colour'] = webp_bytes(image, f'{key}_colour', WEBP_QUALITY, 'project-fish-fn502')
        image = new_image(f'{key}_orm', orm)
        image.scale(ORM_SIZE, ORM_SIZE)
        out[f'{key}_orm'] = webp_bytes(image, f'{key}_orm', WEBP_QUALITY, 'project-fish-fn502')
        out[f'{key}_normal'] = webp_bytes(new_image(f'{key}_normal', normal), f'{key}_normal', WEBP_QUALITY,
                                          'project-fish-fn502')
        out[f'{key}_occlusion'] = 'occlusionTexture' in m
    return out


# --- Writing the file -----------------------------------------------------------

def write_glb(rig, meshes, clips, images, gun_turn, path):
    w = Writer('Project Fish convert_fn502.py', COPYRIGHT)
    g = w.g
    first = write_rig(w, 'fn502', rig, 'frame_j', gun_turn)
    material_index = {}
    for key, name in (('arms', 'fn502_arms'), ('gun', 'fn502_gun')):
        # (Its textures wrap as the download's did: the gun's are mirrored
        # across, its left side using its right side's texture.)
        wrap_s, wrap_t = meshes[key]['wraps']
        sampler = {'magFilter': 9729, 'minFilter': 9987, 'wrapS': wrap_s, 'wrapT': wrap_t}
        if sampler not in g['samplers']:
            g['samplers'].append(sampler)
        at = g['samplers'].index(sampler)
        orm = w.texture(f'{name}_metal_rough', images[f'{key}_orm'], at)
        m = {'name': name, 'doubleSided': True,
             'pbrMetallicRoughness': {'baseColorTexture': w.texture(name, images[f'{key}_colour'], at),
                                      'metallicRoughnessTexture': orm},
             'normalTexture': w.texture(f'{name}_normal', images[f'{key}_normal'], at)}
        if images[f'{key}_occlusion']:
            m['occlusionTexture'] = dict(orm)
        g['materials'].append(m)
        material_index[name] = len(g['materials']) - 1
    for name in ('arms', 'gun'):
        # (Named apart from the `gun` node.)
        write_mesh(w, f'fn502_{name}', meshes[name], material_index[meshes[name]['material']])
    write_clips(w, clips, first)
    w.write(path)


# --- Measuring --------------------------------------------------------------------

def r4(v):
    return [round(float(x), 4) for x in v]


def measure(rig, meshes, clips):
    out = {'scale': round(SCALE, 5)}
    idle = clip_pose(clips['idle'], 0)
    world = rig.world(idle)
    fj, sj, mj, hl = rig.index('frame_j'), rig.index('slide_j'), rig.index('mag_j'), rig.index('hand_L')
    F = world[fj]
    # The `gun` node: at the frame bone, turned so that at idle it's lined up
    # with gun space. The frame bone's own axes are the gun's (right, up,
    # back): it's held turned a little about its bore.
    gun_turn = matrix_quat(F[:3, :3].T)
    out['frame_idle'] = r4(F[:3, 3])
    out['cant_deg'] = round(math.degrees(math.atan2(F[0, 1], F[1, 1])), 2)  # top towards the left (+)
    to_own = np.linalg.inv(F)  # into the gun's own frame
    in_gun = lambda p: F[:3, :3] @ np.asarray(p, np.float64)  # noqa: E731  (the gun's own frame to the gun node's)

    gun = meshes['gun']
    gp = skin(rig, gun, idle)
    own = (np.c_[gp, np.ones(len(gp))] @ to_own.T)[:, :3]
    pieces = loose_pieces(gun['position'], gun['triangles'])
    vert_piece = np.zeros(len(gp), np.int64)
    vert_piece[gun['triangles'].ravel()] = np.repeat(pieces, 3)
    dom = gun['joints'][np.arange(len(gp)), gun['weights'].argmax(1)]
    out['gun_length'] = round(float(np.ptp(own[:, 2])), 4)
    out['gun_height'] = round(float(np.ptp(own[:, 1])), 4)
    out['gun_width'] = round(float(np.ptp(own[:, 0])), 4)
    sv = own[dom == sj]
    out['slide'] = {'top': round(float(sv[:, 1].max()), 4), 'front': round(float(sv[:, 2].min()), 4),
                    'back': round(float(sv[:, 2].max()), 4), 'right': round(float(sv[:, 0].max()), 4)}
    # The muzzle: the middle of the front face of whatever reaches furthest
    # forward on the frame (the barrel's thread protector).
    fv = own[dom == fj]
    front = fv[fv[:, 2] < fv[:, 2].min() + 0.0008]
    muzzle_own = np.array([(front[:, 0].max() + front[:, 0].min()) / 2, (front[:, 1].max() + front[:, 1].min()) / 2,
                           fv[:, 2].min()])
    out['muzzle_own'] = r4(muzzle_own)
    out['muzzle'] = r4(in_gun(muzzle_own))
    # The sights: the slide's highest points near its back and front.
    top = sv[:, 1].max()
    middle = (sv[:, 2].max() + sv[:, 2].min()) / 2
    rear = sv[sv[:, 2] > middle]
    rear = rear[rear[:, 1] > rear[:, 1].max() - 0.0008]
    fore = sv[sv[:, 2] < middle]
    fore = fore[fore[:, 1] > fore[:, 1].max() - 0.0008]
    out['sights_own'] = {'rearTop': round(float(rear[:, 1].max()), 4), 'rearZ': round(float(rear[:, 2].max()), 4),
                         'rearX': round(float(rear[:, 0].mean()), 4), 'frontTop': round(float(fore[:, 1].max()), 4),
                         'frontZ': round(float(fore[:, 2].max()), 4), 'frontX': round(float(fore[:, 0].mean()), 4),
                         'slideTop': round(float(top), 4)}
    s = out['sights_own']
    r_pt = in_gun([s['rearX'], s['rearTop'], s['rearZ']])
    f_pt = in_gun([s['frontX'], s['frontTop'], s['frontZ']])
    out['sights'] = {'x': round(float(r_pt[0]), 4), 'height': round(float(r_pt[1]), 4), 'rearZ': round(float(r_pt[2]), 4),
                     'frontZ': round(float(f_pt[2]), 4), 'front_x': round(float(f_pt[0]), 4),
                     'front_height': round(float(f_pt[1]), 4)}
    # The ejection port: on the slide's right side, just under its top, over
    # the chamber (its middle PORT_AHEAD in front of the rear sight).
    port_own = np.array([sv[:, 0].max() - 0.002, top - 0.008, s['rearZ'] - PORT_AHEAD])
    out['port_own'] = r4(port_own)
    out['port'] = r4(in_gun(port_own))

    # The clips' events, from the bones' paths (in the frame's space).
    def path(clip, step=1 / 120):
        n = int(round(clips[clip]['duration'] / step)) + 1
        ts = np.linspace(0, clips[clip]['duration'], n)
        return ts, [rig.world(clip_pose(clips[clip], t)) for t in ts]

    rest_slide = (np.linalg.inv(F) @ world[sj])[:3, 3]
    rest_mag = (np.linalg.inv(F) @ world[mj])[:3, 3]
    rest_hand = (np.linalg.inv(F) @ world[hl])[:3, 3]
    events = {}
    for clip in ('shoot', 'reload', 'reloadEmpty', 'walk', 'run'):
        ts, ws = path(clip)
        slide = np.array([np.linalg.norm((np.linalg.inv(wm[fj]) @ wm[sj])[:3, 3] - rest_slide) for wm in ws])
        mag = np.array([np.linalg.norm((np.linalg.inv(wm[fj]) @ wm[mj])[:3, 3] - rest_mag) for wm in ws])
        hand = np.array([np.linalg.norm((np.linalg.inv(wm[fj]) @ wm[hl])[:3, 3] - rest_hand) for wm in ws])
        frame = np.array([np.linalg.norm(wm[fj][:3, 3] - F[:3, 3]) for wm in ws])
        e = {'duration': round(clips[clip]['duration'], 3), 'slideMax': round(float(slide.max()), 4),
             'magMax': round(float(mag.max()), 4), 'frameMax': round(float(frame.max()), 4)}
        if slide.max() > 0.003:
            back = slide > 0.0005
            e['slideStarts'] = round(float(ts[np.argmax(back)]), 3)
            e['slideFullyBack'] = round(float(ts[np.argmax(slide)]), 3)
            # (Let go: the last moment it's still fully back.)
            full = slide > slide.max() - 0.0005
            e['slideRelease'] = round(float(ts[len(full) - 1 - np.argmax(full[::-1])]), 3)
            e['slideHome'] = round(float(ts[len(back) - 1 - np.argmax(back[::-1])]), 3)
            e['slideTravel'] = round(float(slide.max()), 4)
        if mag.max() > 0.003:
            moved = mag > 0.002
            e['magOut'] = round(float(ts[np.argmax(moved)]), 3)
            far = mag > 0.95 * mag.max()
            e['magGrab'] = round(float(ts[len(far) - 1 - np.argmax(far[::-1])]), 3)  # it starts back from the belt
            e['magIn'] = round(float(ts[len(moved) - 1 - np.argmax(moved[::-1])]), 3)
        if hand.max() > 0.01:
            off = hand > 0.01
            e['handOn'] = round(float(ts[len(off) - 1 - np.argmax(off[::-1])]), 3)
        events[clip] = e
    out['events'] = events
    out['slideTravel'] = events['shoot']['slideTravel']
    out['bones'] = rig.names
    return out, gun_turn


def main():
    started = time.time()
    g, accessor = read_gltf(SOURCE)
    log('bones', sum(len(s['joints']) for s in g['skins']), 'meshes', [m['name'] for m in g['meshes']],
        'animations', [a['name'] for a in g['animations']])
    rig, meshes, clips = convert(g, accessor)
    info, gun_turn = measure(rig, meshes, clips)
    assert abs(info['gun_length'] - 0.19) < 0.001, f'the gun is {info["gun_length"]} m long'
    bpy.ops.wm.read_factory_settings(use_empty=True)
    images = textures(g)
    log('textures', {k: f'{len(v) / 1e3:.0f} kB' for k, v in images.items() if isinstance(v, bytes)})
    write_glb(rig, meshes, clips, images, gun_turn, OUT_GLB)
    log('wrote', OUT_GLB, f'{os.path.getsize(OUT_GLB) / 1e6:.2f} MB')
    info['clips'] = {k: round(c['duration'], 4) for k, c in clips.items()}
    print('FN502 ' + json.dumps(info))
    log(f'done in {time.time() - started:.0f} s')


main()
