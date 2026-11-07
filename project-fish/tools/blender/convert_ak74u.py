"""Turns the downloaded, animated AK-74U with its own arms into the game's
eleventh gun.

The model is "AK74U | FREE ANIMATION." by BURNER (CC BY 4.0, see README.md,
Credits):
https://sketchfab.com/3d-models/ak74u-free-animation-2ab66220c48b465e9501067667965569
Its arms are a Mixamo stock character's (Adobe's Mixamo, whose characters
may be used in games): bare hands and forearms (Ch08_Body) in the sleeves
of a grey hoodie (Ch08_Hoodie). Download its glTF version and unzip it so
that the folder holds scene.gltf and scene.bin, with its textures either in
textures/ (as scene.gltf names them) or loose beside scene.gltf. Then, from
the project-fish folder:

    blender --background --python tools/blender/convert_ak74u.py -- build/upload-krinkov build/ak74u-raw.glb

(and compress it: gltf-transform meshopt build/ak74u-raw.glb assets/ak74u.glb --level high)

It's made by the same maker as the Beretta, and the same way (this script
follows convert_beretta.py, with rigged_gltf.py for the shared code): one
skeleton holds the arms (from the neck down: shoulders, arms, hands and
fingers) and, on a bone of its own beside them, the gun (frame, magazine,
bolt carrier with its charging handle, magazine catch, trigger), plus a second
magazine bone for the magazine that comes and goes in the reloads. It has
seven clips, each its own animation on the download, all starting and
ending in the same ready pose (DRAW's start and OLSER's end excepted):
DRAW, IDLE (a 16.5 s loop of the hands at rest), INSPEC (inspect), SHOOT,
RELOAD1 (with rounds left: the magazine is taken out and put away, and a
fresh one put in; the bolt doesn't move), RELOAD2 (from empty: the empty
magazine is pulled and dropped, the fresh one put in, and the charging
handle is pulled back and let go; it's the only clip that moves the bolt)
and OLSER (put away). The game draws these arms instead of the soldier's
while it's held and plays the maker's own clips as they are, so this
script keeps the skeleton, the skinning and the keys, and only:
- Turns and scales everything into gun space (metres, +X right, +Y up, -Z
  forward), with the rig's root at the eye the arms were posed for
  (CAMERA: the download has no camera), so putting the rig at the gun
  layer's camera shows the gun as its maker framed it. The bones' own
  frames are turned too.
- Makes it real size: the download's gun is SCALE times smaller than an
  AK-74U (730 mm long with its stock unfolded, as it is here), so
  everything (gun, arms, animation) is scaled by it. From the eye this
  changes nothing: the whole picture grows about it.
- Keeps the seven clips with every key as made (idle, draw, inspect,
  shoot, reload, reloadEmpty, hide). Every clip is given every bone any
  clip moves (a bone a clip leaves alone is held where it rests: only the
  inspect moves the right shoulder). Nothing is added, retimed or re-posed.
- Leaves out the four IK target bones (no point is weighted to them) and
  the scale keys (all 1).
- Splits the download's one magazine mesh into its two magazines, one on
  each magazine bone (`ak74u_magazine` on mag_j, the one in the gun at
  rest; `ak74u_magazine_b` on mag2_j, parked out of view below and behind
  the eye except in the empty reload, where it's the empty one in the gun
  at the start and is dropped).
- Keeps the download's Gun_Null.001 (`ak74u_blackout`): a flat black
  panel of 76 triangles inside the receiver, on the frame bone, that stops
  the light (and the magazine and handguard behind it) showing through the
  slots in the receiver's sides. It has no texture; its material is plain
  black, as made.
- Adds a node on the gun's frame bone, `gun`, turned so that in the idle
  pose its space is gun space moved to the frame (the frame bone itself is
  turned: its Y runs along the bore): the game measures the gun's points
  in it and hangs the muzzle flash on it.
- Textures: the hands come with the stock character's whole 4096 px body
  texture; only a band across it is the hands', so that band is cut out
  (the hands' texture coordinates moved to match) at half size
  (HANDS_SIZE). The hoodie's (whole outfit) texture and the gun's are
  shrunk to 2048 px, the magazine's kept at its 1024. The gun's normal map
  is a JPEG on the download; it's read as it is. The gun's material uses
  KHR_materials_specular (a texture of how strongly its non-metal parts
  reflect, Sketchfab's specular F0); it's kept as one value, its average
  over the non-metal parts (as convert_hipistol.py does); it comes to 1,
  the usual, so none is kept. A serial (stretched lettering in a recess)
  and a star and a code stamped on the receiver's left side are rubbed off
  the gun's textures (RUB_OUT); the selector's markings and the rear
  sight's range marks stay. The skin is toned down a little, as the
  Beretta's (SKIN_COLOUR). All are stored as WebP.
- Keeps who made it and its license in the file (asset.copyright).
- Names the parts, bones, materials and animations plainly.

The game's constants for this gun are printed at the end (AK74U ...),
measured from the result.
"""

import json
import math
import os
import sys
import time

import bpy
import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import log  # noqa: E402
from rigged_gltf import (Rig, Writer, clip_pose, find, matrix_quat, node_matrix, quat_matrix, read_gltf, skin,  # noqa: E402
                         trs_matrix, webp_bytes, write_clips, write_mesh, write_rig)
from texture_edit import deviation_mask, image_array, rub_out, store  # noqa: E402

ARGS = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else sys.argv[1:]
SOURCE, OUT_GLB = ARGS[0], ARGS[1]


def option(name, default):
    return ARGS[ARGS.index(name) + 1] if name in ARGS else default


# --- Placing it ---------------------------------------------------------------
# The download's armature is Z up with the muzzle towards -Y (so its right is
# -X), in metres, as the Beretta's. Its gun is GUN_LENGTH long along the
# bore at rest, from the muzzle device's crown to the butt plate of the
# unfolded stock; an AK-74U is 730 mm.
GUN_LENGTH = 0.65815
SCALE = 0.730 / GUN_LENGTH  # download units to metres (1.109)
# The eye the arms were posed for (download units, in the armature's space;
# the download has no camera or head bone): straight above the neck bone,
# 9 cm up, about where the character's head bone would be, on the middle
# line the gun is brought to when it's inspected. The gun rests shouldered,
# low and to the right (its sights 2 cm under the eye and 7.5 cm right of
# it), and the reloads' hands and magazines stay in view. The game places it
# from there.
CAMERA = tuple(float(x) for x in option('--camera', '0.0,0.0305,1.605').split(','))

# The clips: ours and the download's animation each is (all of it).
CLIPS = [
    ('idle', 'IDLE'),
    ('draw', 'DRAW'),
    ('inspect', 'INSPEC'),
    ('shoot', 'SHOOT'),
    ('reload', 'RELOAD1'),
    ('reloadEmpty', 'RELOAD2'),
    ('hide', 'OLSER'),
]

# Bones (download names, less their numbered endings) and ours. The IK
# targets are left out.
BONES = {'_rootJoint': 'rig', 'mixamorig7:Neck': 'neck',
         'Bone': 'frame_j', 'carg': 'mag_j', 'carg2': 'mag2_j', 'recam': 'bolt_j', 'seg': 'mag_catch_j',
         'gatillo': 'trigger_j'}
DROPPED = {'mixamorig7:LeftHand.001', 'mixamorig7:RightHand.001', 'mixamorig7:LeftArm.001',
           'mixamorig7:RightArm.001'}
for side, s in (('Left', 'L'), ('Right', 'R')):
    BONES.update({f'mixamorig7:{side}Shoulder': f'shoulder_{s}', f'mixamorig7:{side}Arm': f'upperarm_{s}',
                  f'mixamorig7:{side}ForeArm': f'forearm_{s}', f'mixamorig7:{side}Hand': f'hand_{s}'})
    for finger in ('Thumb', 'Index', 'Middle', 'Ring', 'Pinky'):
        for k in range(1, 4):
            BONES[f'mixamorig7:{side}Hand{finger}{k}'] = f'{finger.lower()}{k}_{s}'

# The download's meshes and ours (the magazines are split by bone below).
MESHES = {'Ch08_Body_Ch08_body_0': 'hands', 'Ch08_Hoodie_Ch08_body1_0': 'sleeves', 'Gun_Krinkov_0': 'gun',
          'Gun_Magazine_0': 'magazines', 'Gun_Null.001_0': 'blackout'}
DROPPED_MESHES = set()
MATERIALS = {'Ch08_body': 'ak74u_hands', 'Ch08_body1': 'ak74u_sleeves', 'Krinkov': 'ak74u_gun',
             'Magazine': 'ak74u_magazine', 'Null.001': 'ak74u_blackout'}

# --- Textures -------------------------------------------------------------------
# The band of the body texture the hands use (u0, v0, u1, v1; glTF's v down
# from the top), a little wider than their texture coordinates, and its
# size once cut out (wide, high: half the download's).
HANDS_BOX = (0.0, 0.552, 1.0, 0.866)
HANDS_SIZE = (2048, 644)
SIZE = 2048
WEBP_QUALITY = 90
# The stock character's skin is painted pale and bright, as the Beretta's
# (the same maker's, a Mixamo character too): toned down as much as on the
# Beretta, so in the gun layer's light the bare hands don't draw the eye off
# the gun.
SKIN_COLOUR = [0.8, 0.74, 0.7, 1.0]
# The specular F0 Sketchfab takes as the usual one, and a specularFactor
# this close to 1 is left out (as in convert_hipistol.py).
SKETCHFAB_F0 = 0.5
SPECULAR_KEEP = 0.9
# Marks rubbed off the gun's textures: boxes in the download's 4096 px
# textures (x0, y0, x1, y1, rows from the top), where whatever stands out
# from its surroundings is filled from round it.
RUB_OUT = [
    (1824, 310, 1964, 370),   # receiver, left side: stretched lettering (a serial) in a recess
    (2786, 3278, 2837, 3428),  # receiver, left side, at the front: a star and a stamped code
]
STANDS_OUT = (0.035, 0.05, 0.05)

# Who made it and its license (from its license.txt), in asset.extras as the
# other models keep them.
EXTRAS = {
    'title': 'AK74U | FREE ANIMATION.',
    'source': 'https://sketchfab.com/3d-models/ak74u-free-animation-2ab66220c48b465e9501067667965569',
    'author': 'BURNER (https://sketchfab.com/Alexander_Ovelar)',
    'license': 'CC-BY-4.0 (http://creativecommons.org/licenses/by/4.0/)',
    'arms': 'A Mixamo character\'s (Adobe Mixamo)',
}
COPYRIGHT = ('This work is based on "AK74U | FREE ANIMATION." '
             '(https://sketchfab.com/3d-models/ak74u-free-animation-2ab66220c48b465e9501067667965569) '
             'by BURNER (https://sketchfab.com/Alexander_Ovelar) licensed under CC-BY-4.0 '
             '(http://creativecommons.org/licenses/by/4.0/). The arms are a Mixamo character\'s (Adobe Mixamo). '
             'Changed for Project Fish: turned, scaled to real size and placed for the game, the serial number and '
             'stamps rubbed off, the skin toned down, textures cut down, shrunk and stored as WebP, compressed.')


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

    assert len(g['skins']) == 1, 'expected one skeleton'
    skin_def = g['skins'][0]
    root = skin_def['skeleton']
    W = world_of(parent_of[root])  # the armature's space, A, to the download's world
    assert np.allclose(node_matrix(nodes[root]), np.eye(4)), 'the skeleton root is moved'
    assert abs(abs(np.linalg.det(W[:3, :3])) - 1) < 1e-6, 'the armature is scaled'

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
    Hw = H @ np.linalg.inv(W)  # the download's world to ours

    def turn_q(q):
        return matrix_quat(R @ quat_matrix(q) @ R.T)

    def turn_t(t):
        return SCALE * (R @ np.asarray(t, np.float64))

    rig = Rig()
    bone_of = {}  # download node: our bone

    def add(i):
        if stem(i) in DROPPED:
            assert not nodes[i].get('children'), f'{nodes[i]["name"]} has children'
            return
        if stem(i) not in BONES:
            raise SystemExit(f'unknown bone {nodes[i]["name"]}')
        n = nodes[i]
        parent = bone_of.get(parent_of.get(i))
        t, r = n.get('translation', [0, 0, 0]), n.get('rotation', [0, 0, 0, 1])
        assert 'matrix' not in n and np.allclose(n.get('scale', [1, 1, 1]), 1, atol=1e-5)
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
    assert set(skin_def['joints']) >= set(bone_of), 'a bone outside the skin'
    rig.ibm = [None] * len(rig.names)
    ibm_all = accessor(skin_def['inverseBindMatrices']).reshape(-1, 4, 4).transpose(0, 2, 1).astype(np.float64)
    for j, m in zip(skin_def['joints'], ibm_all):
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
        if m['name'] in DROPPED_MESHES:
            continue
        assert len(m['primitives']) == 1 and node.get('skin') == 0
        prim = m['primitives'][0]
        a = prim['attributes']
        J = accessor(a['JOINTS_0']).astype(np.int64)
        w = accessor(a['WEIGHTS_0']).astype(np.float64)
        w /= w.sum(1, keepdims=True)
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
            'source': (pos, J),
        }

    # Check: at rest, our rig puts every vertex where the download's does,
    # carried into our space.
    mats = np.array([world_of(j) @ b for j, b in zip(joints_of, ibm_all)])
    for name, mesh in meshes.items():
        pos, J = mesh.pop('source')
        p = np.c_[pos, np.ones(len(pos))]
        expect = np.zeros((len(p), 3))
        for k in range(4):
            expect += mesh['weights'][:, k:k + 1] * np.einsum('nij,nj->ni', mats[J[:, k]], p)[:, :3]
        expect = (np.c_[expect, np.ones(len(expect))] @ Hw.T)[:, :3]
        got = skin(rig, mesh)
        assert np.abs(expect - got).max() < 1e-6, f'{name} moved by {np.abs(expect - got).max()}'

    # The two magazines, one on each magazine bone.
    mags = meshes.pop('magazines')
    dom = mags['joints'][np.arange(len(mags['position'])), mags['weights'].argmax(1)]
    assert (mags['weights'].max(1) > 0.999).all(), 'a magazine point shared between bones'
    for bone, name in ((rig.index('mag_j'), 'magazine'), (rig.index('mag2_j'), 'magazine_b')):
        keep_tri = (dom[mags['triangles']] == bone).all(1)
        assert ((dom[mags['triangles']] == bone).any(1) == keep_tri).all(), 'a triangle across both magazines'
        used = np.unique(mags['triangles'][keep_tri])
        remap = np.full(len(mags['position']), -1)
        remap[used] = np.arange(len(used))
        meshes[name] = {k: (v[used] if k not in ('triangles', 'material') else v)
                        for k, v in mags.items()}
        meshes[name]['triangles'] = remap[mags['triangles'][keep_tri]]
        log(f'{name}: {len(used)} points, {keep_tri.sum()} triangles')

    # The clips, each the download's animation of that name.
    rest = {}
    clips = {}
    by_name = {a['name']: a for a in g['animations']}
    assert set(by_name) == {c for _, c in CLIPS}, sorted(by_name)
    for name, source in CLIPS:
        anim = by_name[source]
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
            assert times[0] < 1e-4, f'{source} starts at {times[0]}'
            tracks[(bone, path)] = (times - times[0], values)
        clips[name] = {'tracks': tracks}
    # Every clip moves every bone any clip moves; a bone a clip leaves alone
    # is held where it rests.
    every = set().union(*(c['tracks'] for c in clips.values()))
    for name, clip in clips.items():
        duration = max(t[-1] for t, _ in clip['tracks'].values())
        for key in sorted(every - set(clip['tracks'])):
            bone, path = key
            v = rig.r[bone] if path == 'rotation' else rig.t[bone]
            clip['tracks'][key] = (np.array([0.0, duration]), np.array([v, v]))
            rest.setdefault(name, []).append(f'{rig.names[bone]}.{path}')
        clip['duration'] = float(duration)
        log(f'{name}: {duration:.3f} s, {sum(len(t) for t, _ in clip["tracks"].values())} keys on '
            f'{len(clip["tracks"])} tracks' + (f' (held at rest: {", ".join(rest[name])})' if name in rest else ''))
    return rig, meshes, clips


# --- Textures -------------------------------------------------------------------

def load(path, colour, size=None):
    image = bpy.data.images.load(os.path.abspath(path))
    image.colorspace_settings.name = 'sRGB' if colour else 'Non-Color'
    if size and tuple(image.size) != (size, size):
        image.scale(size, size)
    return image


def new_image(name, a, colour=False):
    h, w = a.shape[:2]
    image = bpy.data.images.new(name, w, h, alpha=True)
    image.colorspace_settings.name = 'sRGB' if colour else 'Non-Color'
    store(image, np.ascontiguousarray(a, np.float32))
    return image


def cut_out(path, colour, box, size):
    """The part of an image in box (u0, v0, u1, v1; v down from the top), at
    size (wide, high), as an array; and the box as cut (whole texels)."""
    image = load(path, colour)
    w, h = image.size
    x0, x1 = int(round(box[0] * w)), int(round(box[2] * w))
    y0, y1 = int(round(box[1] * h)), int(round(box[3] * h))
    part = new_image(image.name + '_cut', image_array(image)[y0:y1, x0:x1], colour)
    part.scale(*size)
    return image_array(part), (x0 / w, y0 / h, x1 / w, y1 / h)


def textures(g, meshes):
    tex = lambda info: find(SOURCE, g['images'][g['textures'][info['index']]['source']]['uri'], required=True)  # noqa: E731
    mats = {m['name']: m for m in g['materials']}
    out = {}
    folder = 'project-fish-ak74u'

    def finish(name, colour, mr, normal, info):
        colour[..., 3] = 1
        mr[..., 0] = 1  # (red: no ambient occlusion in it)
        mr[..., 3] = 1
        normal[..., 3] = 1
        out[name] = {'colour': webp_bytes(new_image(f'{name}_colour', colour, True), f'{name}_colour', WEBP_QUALITY, folder),
                     'metal_rough': webp_bytes(new_image(f'{name}_mr', mr), f'{name}_mr', WEBP_QUALITY, folder),
                     'normal': webp_bytes(new_image(f'{name}_normal', normal), f'{name}_normal', WEBP_QUALITY, folder),
                     **info}

    def factors(m):
        pbr = m['pbrMetallicRoughness']
        assert pbr.get('baseColorFactor', [1, 1, 1, 1]) == [1, 1, 1, 1] and pbr.get('roughnessFactor', 1) == 1
        assert 'occlusionTexture' not in m and 'emissiveTexture' not in m
        return {'metallicFactor': pbr['metallicFactor']} if 'metallicFactor' in pbr else {}

    # The hands: the band of the body texture they use.
    m = mats['Ch08_body']
    pbr = m['pbrMetallicRoughness']
    colour, box = cut_out(tex(pbr['baseColorTexture']), True, HANDS_BOX, HANDS_SIZE)
    mr, _ = cut_out(tex(pbr['metallicRoughnessTexture']), False, HANDS_BOX, HANDS_SIZE)
    normal, _ = cut_out(tex(m['normalTexture']), False, HANDS_BOX, HANDS_SIZE)
    uv = meshes['hands']['uv']
    assert uv[:, 1].min() >= box[1] and uv[:, 1].max() <= box[3], 'the hands use texture outside the band'
    uv[:, 0] = (uv[:, 0] - box[0]) / (box[2] - box[0])
    uv[:, 1] = (uv[:, 1] - box[1]) / (box[3] - box[1])
    log(f'hands texture: the band {[round(x, 4) for x in box]} at {HANDS_SIZE}')
    finish('ak74u_hands', colour, mr, normal, factors(m))

    # The sleeves, the gun and the magazine: whole.
    for source, name, size in (('Ch08_body1', 'ak74u_sleeves', SIZE), ('Krinkov', 'ak74u_gun', SIZE),
                               ('Magazine', 'ak74u_magazine', None)):
        m = mats[source]
        pbr = m['pbrMetallicRoughness']
        colour = image_array(load(tex(pbr['baseColorTexture']), True, size))
        mr = image_array(load(tex(pbr['metallicRoughnessTexture']), False, size))
        normal = image_array(load(tex(m['normalTexture']), False, size))
        info = factors(m)
        if name == 'ak74u_gun':
            k = colour.shape[0] / 4096
            for box4096 in RUB_OUT:
                b = (int(math.floor(box4096[0] * k)), int(math.floor(box4096[1] * k)),
                     int(math.ceil(box4096[2] * k)), int(math.ceil(box4096[3] * k)))
                maps = [colour, mr, normal]
                rub_out(maps, b, deviation_mask(maps, b, STANDS_OUT), normal=2)
            log(f'gun: {len(RUB_OUT)} marks rubbed off')
        metal = mr[..., 2] * info.get('metallicFactor', 1)
        spec = m.get('extensions', {}).get('KHR_materials_specular')
        if spec:
            assert spec.get('specularColorFactor', [1, 1, 1]) == [1, 1, 1] and 'specularColorTexture' not in spec
            f0 = image_array(load(tex(spec['specularTexture']), False, colour.shape[0]))[..., 3] * spec.get('specularFactor', 1)
            strength = np.minimum(f0 / SKETCHFAB_F0, 1)
            dielectric = metal < 0.5
            factor = float(strength[dielectric].mean()) if dielectric.any() else 1.0
            log(f'{name}: specular {factor:.3f} on average over its non-metal parts ({dielectric.mean() * 100:.0f}% of it)')
            if factor < SPECULAR_KEEP:
                info['specular'] = round(factor, 3)
        log(f'{name}: {colour.shape[1]} px, metalness {metal.mean():.3f} on average, roughness {mr[..., 1].mean():.3f}')
        finish(name, colour, mr, normal, info)
    return out


# --- Writing the file -----------------------------------------------------------

MESH_ORDER = ('hands', 'sleeves', 'gun', 'blackout', 'magazine', 'magazine_b')


def write_glb(rig, meshes, clips, images, gun_turn, path):
    w = Writer('Project Fish convert_ak74u.py', COPYRIGHT, EXTRAS)
    g = w.g
    first = write_rig(w, 'ak74u', rig, 'frame_j', gun_turn)
    g['samplers'].append({'magFilter': 9729, 'minFilter': 9987, 'wrapS': 10497, 'wrapT': 10497})
    material_index = {}
    for name, im in images.items():
        pbr = {'baseColorTexture': w.texture(name, im['colour'], 0),
               'metallicRoughnessTexture': w.texture(f'{name}_metal_rough', im['metal_rough'], 0)}
        if 'metallicFactor' in im:
            pbr['metallicFactor'] = im['metallicFactor']
        if name == 'ak74u_hands':
            pbr['baseColorFactor'] = SKIN_COLOUR
        m = {'name': name, 'doubleSided': True, 'pbrMetallicRoughness': pbr,
             'normalTexture': w.texture(f'{name}_normal', im['normal'], 0)}
        if 'specular' in im:
            m['extensions'] = {'KHR_materials_specular': {'specularFactor': im['specular']}}
            if 'KHR_materials_specular' not in g['extensionsUsed']:
                g['extensionsUsed'].append('KHR_materials_specular')
        g['materials'].append(m)
        material_index[name] = len(g['materials']) - 1
    # The blackout panel's: plain black, as made (no textures).
    g['materials'].append({'name': 'ak74u_blackout', 'doubleSided': True,
                           'pbrMetallicRoughness': {'baseColorFactor': [0.0, 0.0, 0.0, 1.0], 'metallicFactor': 0.0}})
    material_index['ak74u_blackout'] = len(g['materials']) - 1
    for name in MESH_ORDER:
        # (Named apart from the `gun` node.)
        write_mesh(w, f'ak74u_{name}', meshes[name], material_index[meshes[name]['material']])
    write_clips(w, clips, first)
    w.write(path)


# --- Measuring --------------------------------------------------------------------

def r4(v):
    return [round(float(x), 4) for x in v]


def measure(rig, meshes, clips):
    out = {'scale': round(SCALE, 5), 'camera': list(CAMERA)}
    idle = clip_pose(clips['idle'], 0)
    world = rig.world(idle)
    B = {n: rig.index(n) for n in ('frame_j', 'mag_j', 'mag2_j', 'bolt_j', 'mag_catch_j', 'trigger_j', 'hand_L',
                                   'hand_R', 'index1_R', 'neck')}
    F = world[B['frame_j']]
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
    dom = gun['joints'][np.arange(len(gp)), gun['weights'].argmax(1)]
    fv = gp[dom == B['frame_j']]
    out['gun_length'] = round(float(np.ptp(gp[:, 2])), 4)
    out['gun_box'] = {'min': r4(gp.min(0)), 'max': r4(gp.max(0))}
    # The bore's direction at rest (the frame bone's own axis along it).
    axes = {k: r4(F[:3, i]) for i, k in enumerate('xyz')}
    out['frame_bone_axes'] = axes
    # The muzzle: the middle of the crown (the points within 2 mm of the front).
    front = gp[:, 2].min()
    crown = gp[gp[:, 2] < front + 0.002]
    muzzle = np.array([(crown[:, 0].max() + crown[:, 0].min()) / 2, (crown[:, 1].max() + crown[:, 1].min()) / 2, front])
    out['muzzle'] = r4(muzzle)
    out['muzzle_in_gun'] = r4((to_gun @ np.r_[muzzle, 1])[:3])
    # The top profile along the gun's middle (for the sights): the highest
    # point every 5 mm along it, within 3 mm of the bore's line.
    near = fv[np.abs(fv[:, 0] - muzzle[0]) < 0.003]
    zs = np.arange(near[:, 2].min(), near[:, 2].max(), 0.005)
    profile = []
    for z in zs:
        sl = near[(near[:, 2] >= z) & (near[:, 2] < z + 0.005)]
        if len(sl):
            profile.append([round(float(z + 0.0025), 4), round(float(sl[:, 1].max()), 4)])
    out['top_profile'] = profile
    mv = skin(rig, meshes['magazine'], idle)
    out['magazine_box'] = {'min': r4(mv.min(0)), 'max': r4(mv.max(0))}
    # The sights. The rear sight is the highest thing on the gun's middle
    # line (its block, behind the hinged top cover's front, flanked by
    # ears): its notch's bottom is the lowest of the highest points across
    # the block's middle 3 mm. The front sight is a post between two ears on
    # the gas block, 7 to 10 cm behind the muzzle: its top is the highest
    # point within 1 mm of the middle line there.
    mid = fv[np.abs(fv[:, 0] - muzzle[0]) < 0.006]
    rz = mid[mid[:, 1].argmax(), 2]
    block = mid[np.abs(mid[:, 2] - rz) < 0.008]
    cols = []
    for x in np.arange(muzzle[0] - 0.0015, muzzle[0] + 0.0015, 0.0005):
        c = block[(block[:, 0] >= x) & (block[:, 0] < x + 0.0005)]
        if len(c):
            cols.append(c[c[:, 1].argmax()])
    notch = min(cols, key=lambda p: p[1])
    post_zone = fv[(fv[:, 2] > front + 0.07) & (fv[:, 2] < front + 0.10) & (np.abs(fv[:, 0] - muzzle[0]) < 0.001)]
    post = post_zone[post_zone[:, 1].argmax()]
    out['sights'] = {'rearNotch': r4(notch), 'frontPost': r4(post), 'rearTop': round(float(mid[:, 1].max()), 4)}
    out['sights_in_gun'] = {'rearNotch': r4((to_gun @ np.r_[notch, 1])[:3]), 'frontPost': r4((to_gun @ np.r_[post, 1])[:3])}
    d = post - notch
    out['sight_line_deg'] = {'down': round(math.degrees(math.atan2(-d[1], -d[2])), 3),
                             'right': round(math.degrees(math.atan2(d[0], -d[2])), 3),
                             'note': 'from the rear notch to the front post, against the bore (level at idle)'}
    out['sight_height_over_bore'] = {'rear': round(float(notch[1] - muzzle[1]), 4), 'front': round(float(post[1] - muzzle[1]), 4)}
    # The ejection port: on the receiver's right side, in the cut-out of the
    # dust cover where the bolt carrier shows, over the magazine's top.
    top = mv[mv[:, 1] > mv[:, 1].max() - 0.006]
    pz = (top[:, 2].max() + top[:, 2].min()) / 2
    side = fv[(np.abs(fv[:, 2] - pz) < 0.03) & (fv[:, 1] > muzzle[1] + 0.01) & (fv[:, 1] < muzzle[1] + 0.035)]
    port = np.array([side[:, 0].max(), muzzle[1] + 0.025, pz - 0.01])
    out['port'] = r4(port)
    out['port_in_gun'] = r4((to_gun @ np.r_[port, 1])[:3])
    out['muzzle_from_eye_deg'] = {'right': round(math.degrees(math.atan2(muzzle[0], -muzzle[2])), 2),
                                  'down': round(math.degrees(math.atan2(-muzzle[1], -muzzle[2])), 2)}
    out['rear_notch_from_eye_deg'] = {'right': round(math.degrees(math.atan2(notch[0], -notch[2])), 2),
                                      'down': round(math.degrees(math.atan2(-notch[1], -notch[2])), 2)}
    bv = gp[dom == B['bolt_j']]
    out['bolt_box'] = {'min': r4(bv.min(0)), 'max': r4(bv.max(0))}
    cv = gp[dom == B['mag_catch_j']]
    out['mag_catch_box'] = {'min': r4(cv.min(0)), 'max': r4(cv.max(0))}
    tv = gp[dom == B['trigger_j']]
    out['trigger_box'] = {'min': r4(tv.min(0)), 'max': r4(tv.max(0))}
    out['hands_idle'] = {k: r4(world[B[k]][:3, 3]) for k in ('hand_L', 'hand_R', 'index1_R', 'neck')}
    m2 = skin(rig, meshes['magazine_b'], idle)
    out['magazine_b_idle_box'] = {'min': r4(m2.min(0)), 'max': r4(m2.max(0))}

    # The clips' events, from the bones' paths (in the frame's space).
    def path(clip, step=1 / 120):
        n = int(round(clips[clip]['duration'] / step)) + 1
        ts = np.linspace(0, clips[clip]['duration'], n)
        return ts, [rig.world(clip_pose(clips[clip], t)) for t in ts]

    fj = B['frame_j']
    rest_rel = {k: np.linalg.inv(F) @ world[B[k]] for k in ('mag_j', 'mag2_j', 'bolt_j', 'trigger_j', 'mag_catch_j',
                                                            'hand_L', 'hand_R')}

    def rel(wm, k):
        return np.linalg.inv(wm[fj]) @ wm[B[k]]

    def moved(ws, k, rest_m=None):
        r0 = rest_rel[k] if rest_m is None else rest_m
        return np.array([np.linalg.norm(rel(wm, k)[:3, 3] - r0[:3, 3]) for wm in ws])

    def turned(ws, k):
        return np.array([math.degrees(math.acos(np.clip((np.trace(rest_rel[k][:3, :3].T @ rel(wm, k)[:3, :3]) - 1) / 2, -1, 1)))
                         for wm in ws])

    def first(ts, mask):
        return round(float(ts[np.argmax(mask)]), 3) if mask.any() else None

    def last(ts, mask):
        return round(float(ts[len(mask) - 1 - np.argmax(mask[::-1])]), 3) if mask.any() else None

    def runs(ts, mask):
        """The stretches where mask holds: [[start, end], ...]."""
        out_, start = [], None
        for t, m in zip(ts, mask):
            if m and start is None:
                start = t
            if not m and start is not None:
                out_.append([round(float(start), 3), round(float(t), 3)])
                start = None
        if start is not None:
            out_.append([round(float(start), 3), round(float(ts[-1]), 3)])
        return out_

    events = {}
    for clip in clips:
        ts, ws = path(clip)
        e = {'duration': round(clips[clip]['duration'], 3)}
        frame_move = np.array([np.linalg.norm(wm[fj][:3, 3] - F[:3, 3]) for wm in ws])
        frame_turn = np.array([math.degrees(math.acos(np.clip((np.trace(F[:3, :3].T @ wm[fj][:3, :3]) - 1) / 2, -1, 1)))
                               for wm in ws])
        e['frameMoveMax'] = round(float(frame_move.max()), 4)
        e['frameTurnMaxDeg'] = round(float(frame_turn.max()), 2)
        bolt = moved(ws, 'bolt_j')
        if bolt.max() > 0.003:
            e['boltMax'] = round(float(bolt.max()), 4)
            e['boltStarts'] = first(ts, bolt > 0.0005)
            e['boltFullyBack'] = round(float(ts[np.argmax(bolt)]), 3)
            e['boltHome'] = last(ts, bolt > 0.0005)
            e['boltPath'] = [[round(float(ts[i]), 3), round(float(bolt[i]), 4)] for i in range(0, len(ts), 6)
                             if bolt[i] > 0.0002 or (i + 6 < len(ts) and bolt[i + 6] > 0.0002)]
        trig = turned(ws, 'trigger_j')
        if trig.max() > 1:
            e['triggerMaxDeg'] = round(float(trig.max()), 2)
            e['triggerPulled'] = first(ts, trig > trig.max() * 0.9)
            e['triggerBack'] = last(ts, trig > 1)
        catch = turned(ws, 'mag_catch_j')
        if catch.max() > 1:
            e['magCatchMaxDeg'] = round(float(catch.max()), 2)
            e['magCatchPressed'] = runs(ts, catch > 1)
        for k, label in (('mag_j', 'mag'), ('mag2_j', 'magB')):
            mag = moved(ws, k, rest_rel['mag_j'])  # (from the magazine well)
            inwell = mag < 0.002
            e[f'{label}InWell'] = runs(ts, inwell)
            # When one that isn't in the well at the clip's start (the fresh
            # one, waiting below the gun) is taken: 1 cm from where it was.
            own = np.array([np.linalg.norm(wm[B[k]][:3, 3] - ws[0][B[k]][:3, 3]) for wm in ws])
            if not inwell[0] and inwell.any():
                e[f'{label}Taken'] = first(ts, own > 0.01)
            if not inwell.all():
                e[f'{label}Path'] = [[round(float(ts[i]), 2), round(float(mag[i]), 3)] for i in range(0, len(ts), 12)]
        for k in ('hand_L', 'hand_R'):
            hand = moved(ws, k)
            e[f'{k}OffGun'] = runs(ts, hand > 0.01)
        if clip == 'draw':
            e['gunSettled'] = first(ts, np.array([np.all(frame_move[i:] < 0.003) for i in range(len(ts))]))
            e['gunNear'] = first(ts, np.array([np.all(frame_move[i:] < 0.015) for i in range(len(ts))]))
        if clip == 'hide':
            e['gunLeaves'] = first(ts, frame_move > 0.003)
        if clip == 'shoot':
            z = np.array([(np.linalg.inv(F) @ wm[fj])[:3, 3] for wm in ws])
            back = np.linalg.norm(z, axis=1)
            e['kickMax'] = round(float(back.max()), 4)
            e['kickPeak'] = round(float(ts[np.argmax(back)]), 3)
            e['kickSettled'] = first(ts, np.array([np.all(back[i:] < 0.001) for i in range(len(ts))]))
            e['kickPath'] = [[round(float(ts[i]), 3), round(float(back[i]), 4), round(float(frame_turn[i]), 2)]
                             for i in range(0, len(ts), 4)]
        # How the clip starts and ends against the idle pose (every bone).
        def pose_gap(wm):
            return max(np.linalg.norm(a[:3, 3] - b[:3, 3]) for k, (a, b) in enumerate(zip(wm, world))
                       if k not in (B['mag_j'], B['mag2_j']))
        e['startGap'] = round(float(pose_gap(ws[0])), 5)
        e['endGap'] = round(float(pose_gap(ws[-1])), 5)
        events[clip] = e
    out['events'] = events
    out['bones'] = rig.names
    return out, gun_turn


def main():
    started = time.time()
    g, accessor = read_gltf(SOURCE)
    log('bones', len(g['skins'][0]['joints']), 'meshes', [m['name'] for m in g['meshes']],
        'animations', [a['name'] for a in g['animations']])
    rig, meshes, clips = convert(g, accessor)
    info, gun_turn = measure(rig, meshes, clips)
    assert abs(info['gun_length'] - 0.730) < 0.002, f'the gun is {info["gun_length"]} m long'
    bpy.ops.wm.read_factory_settings(use_empty=True)
    images = textures(g, meshes)
    log('textures', {n: {k: f'{len(v) / 1e3:.0f} kB' for k, v in im.items() if isinstance(v, bytes)}
                     for n, im in images.items()})
    write_glb(rig, meshes, clips, images, gun_turn, OUT_GLB)
    log('wrote', OUT_GLB, f'{os.path.getsize(OUT_GLB) / 1e6:.2f} MB')
    info['clips'] = {k: round(c['duration'], 4) for k, c in clips.items()}
    info['specular'] = {n: im.get('specular') for n, im in images.items()}
    print('AK74U ' + json.dumps(info))
    log(f'done in {time.time() - started:.0f} s')


main()
