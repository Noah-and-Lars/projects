"""Turns the downloaded, animated AK-74M with its own arms into the game's
tenth gun.

The model is "FPS AK-74m animations" by Cransh (CC BY 4.0, see README.md,
Credits):
https://sketchfab.com/3d-models/fps-ak-74m-animations-94be8385c402474cacd39bc096c6ca14
Download its glTF version and unzip it so that the folder holds scene.gltf
and scene.bin, with its textures either in textures/ (as scene.gltf names
them) or loose beside scene.gltf. Then, from the project-fish folder:

    blender --background --python tools/blender/convert_ak74m.py -- build/upload-ak74m build/ak74m-raw.glb

and compress the result into assets/ak74m.glb:

    gltf-transform meshopt build/ak74m-raw.glb assets/ak74m.glb --level high

It's made by the same maker as the FN 502 and the Makarov PM, and the
download is the same kind (cransh_rig.py reads all three): one skeleton
holds the arms (Cransh's own gloved hands and sleeves) and the rifle
(receiver, bolt carrier with its charging handle, trigger, safety lever,
magazine, and a second magazine, the fresh one the reloads bring in), with
its own camera, and eight clips: AK_Idle (a loop of the hands breathing),
AK_Draw, AK_Walk, AK_Run, AK_Shot (one shot: the bolt carrier runs back and
home), AK_Reload and AK_Reload_var2 (two ways of changing the magazine with
rounds left: in the first the fresh magazine knocks the old one out, in the
second the old one is pulled out first and stowed), and AK_Reload_full
(from empty: the first reload, then the support hand reaches under and
pulls the charging handle). There are no put-away or inspect clips. This
script keeps the skeleton, the skinning and the keys, and only:
- Turns and scales everything into gun space (metres, +X right, +Y up, -Z
  forward), with the rig's root at the eye the maker framed it from (the
  download's camera), so putting the rig at the gun layer's camera shows
  the rifle as its maker framed it.
- Makes it real size: the download is 1 / SCALE times bigger than an
  AK-74M (943 mm long with its stock unfolded), so everything (rifle, arms,
  animation) is scaled by SCALE. From the eye this changes nothing.
- Keeps the eight clips with every key as made (idle, draw, walk, run,
  shoot, reload, reload2, reloadEmpty). Every clip is given every bone any
  clip moves (a bone a clip leaves alone is held where it rests). Nothing
  is added, retimed or re-posed. In both reloads with rounds left and in
  the empty one, the fresh magazine is a second magazine (mag2_j, its own
  mesh) that rests out of view behind the eye; once it's seated, the clip
  puts the gun's own magazine (mag_j) back in its place and the second one
  back behind the eye in the same frame, as its maker made it.
- The safety lever's bone is scaled 1.28 times in the download, in every
  key of every clip alike: that scale is folded into its inverse bind
  matrix (nothing hangs under it), so every bone is unscaled; the points
  stay exactly where they were (checked).
- Leaves out the IK pole targets, the head bone (nothing is weighted to it
  or hangs on it; the camera is a node of its own) and the bones' `_end`
  tips.
- Adds a node on the rifle's receiver bone, `gun`, turned so that over the
  idle loop it's lined up with gun space on average, moved to the receiver
  bone: the game measures the rifle's points in it and hangs the muzzle
  flash on it. The receiver bone's own axes are the rifle's (its +X right,
  -Y up, +Z towards the muzzle: its bore runs along +Z).
- Textures: kept as made (metal/roughness; the rifle's ambient occlusion
  is in the red of its metal/roughness texture, as the download has it),
  shrunk from 4096 px to 2048 and stored as WebP. The rifle's
  KHR_materials_specular is left out: its texture isn't in the download
  (without it the extension's factor alone would dull the rifle's
  non-metal parts far more than its maker had them). Its serial numbers
  are rubbed off (RUB_OUT); there are no maker's logos on it. The rear
  sight's range figures stay.
- Keeps who made it and its license in the file (asset.copyright).
- Names the parts, bones, materials and animations plainly.

The game's constants for this gun are printed at the end (AK74M ...),
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
from cransh_rig import Gun, convert, r4, rest_frame  # noqa: E402
from rigged_gltf import Writer, clip_pose, find, matrix_quat, read_gltf, skin, webp_bytes, write_clips, write_mesh, write_rig  # noqa: E402
from texture_edit import deviation_mask, image_array, rub_out, store  # noqa: E402

ARGS = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else sys.argv[1:]
SOURCE, OUT_GLB = ARGS[0], ARGS[1]

# --- Placing it ---------------------------------------------------------------
# The download's armature is Z up with the muzzle towards -Y, as the FN
# 502's. Its rifle is GUN_LENGTH units long along the bore, from the butt
# plate to the front of the muzzle brake; an AK-74M is 943 mm with its stock
# unfolded (as it is here).
GUN_LENGTH = 1.38443
SCALE = 0.943 / GUN_LENGTH  # download units to metres (0.681)
# The eye: the download's camera.
CAMERA_NODE = 'Camera'

# The clips: ours, and the download's animation each is (all of it).
CLIPS = [
    ('idle', 'AK_Idle', None),
    ('draw', 'AK_Draw', None),
    ('walk', 'AK_Walk', None),
    ('run', 'AK_Run', None),
    ('shoot', 'AK_Shot', None),
    ('reload', 'AK_Reload', None),
    ('reload2', 'AK_Reload_var2', None),
    ('reloadEmpty', 'AK_Reload_full', None),
]
# The idle loop is sampled this often (seconds) for where the rifle rests on
# average.
REST_STEP = 1 / 60

# The rifle's bones (download names, less their numbered endings) and ours
# (the arms' are cransh_rig.arm_bones): the receiver (with the barrel,
# stock, grip, handguard, sights, dust cover: all one piece), the bolt
# carrier (with its charging handle and gas piston), the trigger, the
# safety lever, the magazine and the fresh magazine.
BONES = {'PBody': 'frame_j', 'Rif': 'bolt_j', 'Trigger': 'trigger_j', 'Safety': 'safety_j', 'Pmag': 'mag_j',
         'Pmag2': 'mag2_j'}
DROPPED = {'Head_Cam'}
# The bone whose scale is folded into its inverse bind matrix.
SCALED_BONE = 'Safety'

MESHES = {'arms_arms_0': 'arms', 'Ak_ak74m_0': 'gun', 'Mag_2_ak74m_0': 'mag2'}
MATERIALS = {'arms': 'ak74m_arms', 'ak74m': 'ak74m_gun'}

# The receiver bone's axes as the rifle's own (right, up, back: columns, in
# the bone's space).
OWN_AXES = np.diag([1.0, -1.0, -1.0])

# Where the ejection port's middle is (the rifle's own frame: metres right,
# up and back from the receiver bone), found on the model with the bolt
# carrier fully back (the shot clip at 0.058 s), when the opening shows: it
# runs from 43 mm in front of the bone to 37 mm behind it, about 15 to 30 mm
# above the bore's level in the receiver's right wall, over the magazine
# well.
PORT_OWN = np.array([0.018, 0.0195, -0.003])

# --- Textures -------------------------------------------------------------------
SIZE = 2048
WEBP_QUALITY = 90
# Marks rubbed off the rifle's textures: boxes in the download's 4096 px
# textures (x0, y0, x1, y1, rows from the top), where whatever stands out
# from its surroundings is filled from round it.
RUB_OUT = [
    (1477, 699, 1545, 733),  # receiver: part of a serial number
    (1984, 3126, 2080, 3162),  # receiver: a serial number
    (1510, 3532, 1543, 3566),  # a stamped number's end, by a seam
]
STANDS_OUT = (0.05, 0.08, 0.06)

# Who made it and its license (from its license.txt), in asset.extras as the
# other models keep them.
EXTRAS = {
    'title': 'FPS AK-74m animations',
    'source': 'https://sketchfab.com/3d-models/fps-ak-74m-animations-94be8385c402474cacd39bc096c6ca14',
    'author': 'Cransh (https://sketchfab.com/ccransh)',
    'license': 'CC-BY-4.0 (http://creativecommons.org/licenses/by/4.0/)',
}

COPYRIGHT = ('This work is based on "FPS AK-74m animations" '
             '(https://sketchfab.com/3d-models/fps-ak-74m-animations-94be8385c402474cacd39bc096c6ca14) '
             'by Cransh (https://sketchfab.com/ccransh) licensed under CC-BY-4.0 '
             '(http://creativecommons.org/licenses/by/4.0/). '
             'Changed for Project Fish: turned, scaled to real size and placed for the game, serial numbers '
             'rubbed off, textures shrunk and stored as WebP, compressed.')


def plain_uv(g, material, uv):
    """The texture coordinates as they are (no texture transforms here), and
    the wrapping of the material's textures."""
    pbr = material.get('pbrMetallicRoughness', {})
    infos = [i for i in (pbr.get('baseColorTexture'), pbr.get('metallicRoughnessTexture'),
                         material.get('normalTexture'), material.get('occlusionTexture')) if i]
    assert not any(i.get('extensions') or i.get('texCoord') for i in infos), 'unexpected texture transform'
    samplers = {json.dumps(g['samplers'][g['textures'][i['index']]['sampler']]) for i in infos}
    assert len(samplers) == 1, 'the textures are wrapped differently'
    sampler = json.loads(samplers.pop())
    return uv, (sampler.get('wrapS', 10497), sampler.get('wrapT', 10497))


# --- Reading the download -------------------------------------------------------

def fold_scale(g, accessor):
    """The download with SCALED_BONE's scale (the same in its rest and in
    every key) folded into its inverse bind matrix: the bone unscaled, its
    scale keys gone, and an accessor reading the changed matrices. Nothing
    is weighted to what hangs under it (its `_end` tip, left out)."""
    nodes = g['nodes']
    skin_def = g['skins'][0]
    i = next(k for k, n in enumerate(nodes) if n['name'].rsplit('_', 1)[0] == SCALED_BONE)
    assert all(nodes[c]['name'].rsplit('_', 1)[0].endswith('_end') for c in nodes[i].get('children', []))
    s = np.asarray(nodes[i]['scale'], np.float64)
    assert np.ptp(s) < 1e-5, 'not scaled evenly'
    for anim in g['animations']:
        for ch in anim['channels']:
            if ch['target']['node'] == i and ch['target']['path'] == 'scale':
                values = accessor(anim['samplers'][ch['sampler']]['output']).astype(np.float64)
                assert np.abs(values - s).max() < 1e-4, f'{SCALED_BONE} is scaled differently in {anim["name"]}'
        anim['channels'] = [ch for ch in anim['channels']
                            if not (ch['target']['node'] == i and ch['target']['path'] == 'scale')]
    nodes[i]['scale'] = [1.0, 1.0, 1.0]
    k = skin_def['joints'].index(i)
    ibm_accessor = skin_def['inverseBindMatrices']
    S = np.diag([s[0], s[1], s[2], 1.0])
    log(f'{nodes[i]["name"]}: its scale {s[0]:.4f} folded into its inverse bind matrix')

    def read(a):
        out = accessor(a)
        if a != ibm_accessor:
            return out
        m = out.reshape(-1, 4, 4).transpose(0, 2, 1).astype(np.float64)
        m[k] = S @ m[k]
        return m.transpose(0, 2, 1).reshape(-1, 16)

    return read


def check_winding(meshes):
    """How many of each mesh's faces are wound anticlockwise round their
    normals (as glTF's front faces are)."""
    for name, m in meshes.items():
        p, n, t = m['position'], m['normal'], m['triangles']
        face = np.cross(p[t[:, 1]] - p[t[:, 0]], p[t[:, 2]] - p[t[:, 0]])
        agree = np.einsum('ij,ij->i', face, n[t].sum(1)) > 0
        log(f'{name}: {agree.mean():.3f} of its faces wound round their normals')
        assert agree.mean() > 0.9, f'{name} is inside out'


# --- Measuring --------------------------------------------------------------------

def measure(rig, meshes, clips, rest_times):
    """The game's constants for the rifle (its points in the `gun` node's
    space, where the receiver is at rest; the clips' events) and the `gun`
    node's turn on the receiver bone."""
    out = {'scale': round(SCALE, 5)}
    fj, bj, mj, m2 = (rig.index(n) for n in ('frame_j', 'bolt_j', 'mag_j', 'mag2_j'))
    hl, hr = rig.index('hand_L'), rig.index('hand_R')
    idle = clip_pose(clips['idle'], 0)
    world = rig.world(idle)
    Fb = rest_frame(rig, clips, fj, rest_times)
    gun_turn = matrix_quat(Fb[:3, :3].T)
    F = Fb.copy()
    F[:3, :3] = Fb[:3, :3] @ OWN_AXES
    out['frame'] = r4(F[:3, 3])
    out['cant_deg'] = round(math.degrees(math.atan2(F[0, 1], F[1, 1])), 2)  # top towards the left (+)
    # (How far its bore points off straight ahead at rest: degrees, up and
    # to the left.)
    back = F[:3, 2]
    out['bore_up_deg'] = round(math.degrees(math.asin(-back[1])), 2)
    out['bore_left_deg'] = round(math.degrees(math.atan2(back[0], back[2])), 2)
    in_gun = lambda p: F[:3, :3] @ np.asarray(p, np.float64)  # noqa: E731  (the rifle's own frame to the gun node's)

    mesh = meshes['gun']
    gp = skin(rig, mesh, idle)
    dom = mesh['joints'][np.arange(len(gp)), mesh['weights'].argmax(1)]
    own = (np.c_[gp, np.ones(len(gp))] @ np.linalg.inv(world[fj]).T)[:, :3] @ OWN_AXES
    fv = own[dom == fj]
    out['gun_length'] = round(float(np.ptp(fv[:, 2])), 4)
    out['gun_height'] = round(float(np.ptp(own[:, 1])), 4)
    out['gun_width'] = round(float(np.ptp(own[:, 0])), 4)

    # The muzzle: the middle of the muzzle brake's front face (the receiver
    # piece reaching furthest forward).
    front = fv[fv[:, 2] < fv[:, 2].min() + 0.0006]
    brake = fv[fv[:, 2] < fv[:, 2].min() + 0.02]
    muzzle_own = np.array([(brake[:, 0].max() + brake[:, 0].min()) / 2, (brake[:, 1].max() + brake[:, 1].min()) / 2,
                           front[:, 2].min()])
    out['muzzle_own'] = r4(muzzle_own)
    out['muzzle'] = r4(in_gun(muzzle_own))
    out['bore_height_own'] = round(float(muzzle_own[1]), 4)

    # The sights. The front sight: its post, between the two ears of its
    # hood, the highest point near the middle within the front sight block
    # (the receiver piece's highest points in the front quarter); the rear
    # sight: the top of its leaf, the notch in the middle of it (and the
    # notch's bottom).
    z0, z1 = fv[:, 2].min(), fv[:, 2].max()
    fore = fv[fv[:, 2] < z0 + 0.25 * (z1 - z0)]
    ears = fore[fore[:, 1] > fore[:, 1].max() - 0.0005]
    block = fore[(fore[:, 2] > ears[:, 2].min() - 0.008) & (fore[:, 2] < ears[:, 2].max() + 0.008)]
    post = block[np.abs(block[:, 0] - ears[:, 0].mean()) < 0.0012]
    post_top = post[post[:, 1] > post[:, 1].max() - 0.0003]
    mid = fv[(fv[:, 2] > z0 + 0.25 * (z1 - z0)) & (fv[:, 2] < z0 + 0.6 * (z1 - z0))]
    leaf = mid[mid[:, 1] > mid[:, 1].max() - 0.0003]
    leaf_x = (leaf[:, 0].max() + leaf[:, 0].min()) / 2
    notch = mid[(np.abs(mid[:, 0] - leaf_x) < 0.0012) & (mid[:, 2] > leaf[:, 2].min() - 0.003)
                & (mid[:, 2] < leaf[:, 2].max() + 0.003) & (mid[:, 1] > leaf[:, 1].max() - 0.003)]
    notch_bottom = notch[:, 1].min() if len(notch) else leaf[:, 1].max()
    out['sights_own'] = {
        'rearTop': round(float(leaf[:, 1].max()), 4), 'notchBottom': round(float(notch_bottom), 4),
        'rearZ': round(float(leaf[:, 2].max()), 4), 'rearX': round(float(leaf_x), 4),
        'frontTop': round(float(post_top[:, 1].max()), 4), 'frontZ': round(float(post[:, 2].max()), 4),
        'frontX': round(float(post_top[:, 0].mean()), 4), 'earsTop': round(float(ears[:, 1].max()), 4),
        'leafWidth': round(float(np.ptp(leaf[:, 0])), 4),
    }
    s = out['sights_own']
    r_pt = in_gun([s['rearX'], s['rearTop'], s['rearZ']])
    f_pt = in_gun([s['frontX'], s['frontTop'], s['frontZ']])
    out['sights'] = {'x': round(float(r_pt[0]), 4), 'height': round(float(r_pt[1]), 4), 'rearZ': round(float(r_pt[2]), 4),
                     'frontZ': round(float(f_pt[2]), 4), 'front_x': round(float(f_pt[0]), 4),
                     'front_height': round(float(f_pt[1]), 4)}
    # The ejection port (see PORT_OWN).
    out['port_own'] = r4(PORT_OWN)
    out['port'] = r4(in_gun(PORT_OWN))

    # The bolt carrier, its charging handle's knob (its furthest point to the
    # right) and the magazines.
    bv = own[dom == bj]
    knob = bv[bv[:, 0] > bv[:, 0].max() - 0.004].mean(0)
    out['charging_handle_own'] = r4(knob)
    out['charging_handle'] = r4(in_gun(knob))
    mv = own[dom == mj]
    out['magazine_own'] = {'top': round(float(mv[:, 1].max()), 4), 'bottom': round(float(mv[:, 1].min()), 4),
                           'front': round(float(mv[:, 2].min()), 4), 'back': round(float(mv[:, 2].max()), 4)}

    # The second magazine, seated, against the gun's own: their points are
    # the same mesh, so where each sits on its bone tells how far apart they
    # are when the bones are (at the swap).
    m2v = meshes['mag2']
    p2 = skin(rig, m2v, idle)
    loc2 = (np.c_[p2, np.ones(len(p2))] @ np.linalg.inv(world[m2]).T)[:, :3]
    loc1 = (np.c_[gp[dom == mj], np.ones(int((dom == mj).sum()))] @ np.linalg.inv(world[mj]).T)[:, :3]
    out['mag2_vs_mag_on_bone_mm'] = round(float(np.linalg.norm(loc2.mean(0) - loc1.mean(0)) * 1000), 2)

    # The clips' events, from the bones' paths (in the receiver's space).
    def path(clip, step=1 / 120):
        n = int(round(clips[clip]['duration'] / step)) + 1
        ts = np.linspace(0, clips[clip]['duration'], n)
        return ts, [rig.world(clip_pose(clips[clip], t)) for t in ts]

    rel = lambda w, b: np.linalg.inv(w[fj]) @ w[b]  # noqa: E731
    rest_bolt = rel(world, bj)[:3, 3]
    rest_mag = rel(world, mj)
    rest_hand = rel(world, hl)[:3, 3]
    rest_hand_r = rel(world, hr)[:3, 3]
    mag_points = loc1

    def mag2_gap(w):
        """How far the second magazine's points are from where the gun's own
        sit at rest (mean, metres)."""
        a = (np.c_[mag_points, np.ones(len(mag_points))] @ (w[fj] @ rest_mag).T)[:, :3]
        b = (np.c_[loc2, np.ones(len(loc2))] @ w[m2].T)[:, :3]
        return float(np.linalg.norm(a - b, axis=1).mean())

    def first(ts, mask):
        return round(float(ts[np.argmax(mask)]), 3) if mask.any() else None

    def last(ts, mask):
        return round(float(ts[len(mask) - 1 - np.argmax(mask[::-1])]), 3) if mask.any() else None

    events = {}
    for clip in clips:
        ts, ws = path(clip)
        bolt = np.array([np.linalg.norm(rel(w, bj)[:3, 3] - rest_bolt) for w in ws])
        mag = np.array([np.linalg.norm(rel(w, mj)[:3, 3] - rest_mag[:3, 3]) for w in ws])
        gap2 = np.array([mag2_gap(w) for w in ws])
        hand = np.array([np.linalg.norm(rel(w, hl)[:3, 3] - rest_hand) for w in ws])
        hand_r = np.array([np.linalg.norm(rel(w, hr)[:3, 3] - rest_hand_r) for w in ws])
        frame = np.array([np.linalg.norm(w[fj][:3, 3] - F[:3, 3]) for w in ws])
        e = {'duration': round(clips[clip]['duration'], 3), 'boltMax': round(float(bolt.max()), 4),
             'magMax': round(float(mag.max()), 4), 'frameMax': round(float(frame.max()), 4),
             'supportHandMax': round(float(hand.max()), 4), 'shootingHandMax': round(float(hand_r.max()), 4)}
        if bolt.max() > 0.003:
            moved = bolt > 0.0005
            e['boltStarts'] = first(ts, moved)
            e['boltFullyBack'] = round(float(ts[np.argmax(bolt)]), 3)
            full = bolt > bolt.max() - 0.0005
            e['boltRelease'] = last(ts, full)
            e['boltHome'] = last(ts, moved)
            e['boltTravel'] = round(float(bolt.max()), 4)
        if mag.max() > 0.003:
            moved = mag > 0.002
            e['magOut'] = first(ts, moved)
            # (Gone: furthest away, where it's put out of the way.)
            far = mag > 0.98 * mag.max()
            e['magGone'] = first(ts, far)
            e['magBack'] = last(ts, moved)  # the gun's own put back in its place (the swap)
        if gap2.min() < 0.03:
            near = gap2 < 0.01
            e['mag2Seated'] = first(ts, gap2 < 0.005) or first(ts, near)
            e['mag2SeatGapMm'] = round(float(gap2[ts < (e.get('magBack') or ts[-1]) + 1e-6].min() * 1000), 1)
            e['mag2Arrives'] = first(ts, gap2 < 0.06)
        if hand.max() > 0.01:
            off = hand > 0.01
            e['handOff'] = first(ts, off)
            e['handOn'] = last(ts, off)
        if hand_r.max() > 0.01:
            e['shootingHandOn'] = last(ts, hand_r > 0.01)
        events[clip] = e
    out['events'] = events
    out['boltTravel'] = events['shoot'].get('boltTravel', 0)
    out['bones'] = rig.names
    return out, gun_turn


# --- Textures -------------------------------------------------------------------

def load(path, colour):
    image = bpy.data.images.load(os.path.abspath(path))
    image.colorspace_settings.name = 'sRGB' if colour else 'Non-Color'
    if tuple(image.size) != (SIZE, SIZE):
        image.scale(SIZE, SIZE)
    return image


def new_image(name, a, colour=False):
    h, w = a.shape[:2]
    image = bpy.data.images.new(name, w, h, alpha=True)
    image.colorspace_settings.name = 'sRGB' if colour else 'Non-Color'
    store(image, a.astype(np.float32))
    return image


def textures(g):
    """Each material's textures as WebP bytes (colour, metal_rough, normal),
    its factors, and whether its metal/roughness texture holds ambient
    occlusion in its red."""
    tex = lambda info: g['images'][g['textures'][info['index']]['source']]['uri']  # noqa: E731
    mats = {m['name']: m for m in g['materials']}
    out = {}
    for name, key in (('arms', 'arms'), ('ak74m', 'gun')):
        m = mats[name]
        pbr = m['pbrMetallicRoughness']
        assert pbr.get('baseColorFactor', [1, 1, 1, 1]) == [1, 1, 1, 1] and 'emissiveTexture' not in m
        colour = image_array(load(find(SOURCE, tex(pbr['baseColorTexture']), required=True), True))
        mr = image_array(load(find(SOURCE, tex(pbr['metallicRoughnessTexture']), required=True), False))
        normal = image_array(load(find(SOURCE, tex(m['normalTexture']), required=True), False))
        occlusion = 'occlusionTexture' in m
        if occlusion:
            assert m['occlusionTexture']['index'] == pbr['metallicRoughnessTexture']['index'], 'separate occlusion'
        if key == 'gun':
            k = SIZE / 4096
            maps = [colour, mr, normal]
            for box4096 in RUB_OUT:
                box = (int(math.floor(box4096[0] * k)), int(math.floor(box4096[1] * k)),
                       int(math.ceil(box4096[2] * k)), int(math.ceil(box4096[3] * k)))
                rub_out(maps, box, deviation_mask(maps, box, STANDS_OUT), normal=2)
            log(f'gun: {len(RUB_OUT)} marks rubbed off')
        log(f'{key}: metalness {mr[..., 2].mean() * pbr.get("metallicFactor", 1):.3f} on average, '
            f'roughness {mr[..., 1].mean() * pbr.get("roughnessFactor", 1):.3f}'
            + (f', occlusion {mr[..., 0].mean():.3f}' if occlusion else ''))
        if not occlusion:
            mr[..., 0] = 1
        mr[..., 3] = 1
        colour[..., 3] = 1
        normal[..., 3] = 1
        folder = 'project-fish-ak74m'
        out[f'{key}_colour'] = webp_bytes(new_image(f'{key}_colour', colour, True), f'{key}_colour', WEBP_QUALITY, folder)
        out[f'{key}_metal_rough'] = webp_bytes(new_image(f'{key}_metal_rough', mr), f'{key}_metal_rough', WEBP_QUALITY,
                                               folder)
        out[f'{key}_normal'] = webp_bytes(new_image(f'{key}_normal', normal), f'{key}_normal', WEBP_QUALITY, folder)
        out[f'{key}_factors'] = {k: pbr[k] for k in ('metallicFactor', 'roughnessFactor') if k in pbr}
        out[f'{key}_occlusion'] = occlusion
    return out


# --- Writing the file -----------------------------------------------------------

def write_glb(rig, meshes, clips, images, gun_turn, path):
    w = Writer('Project Fish convert_ak74m.py', COPYRIGHT, EXTRAS)
    g = w.g
    first = write_rig(w, 'ak74m', rig, 'frame_j', gun_turn)
    material_index = {}
    for key, name in (('arms', 'ak74m_arms'), ('gun', 'ak74m_gun')):
        wrap_s, wrap_t = meshes[key]['wraps']
        sampler = {'magFilter': 9729, 'minFilter': 9987, 'wrapS': wrap_s, 'wrapT': wrap_t}
        if sampler not in g['samplers']:
            g['samplers'].append(sampler)
        at = g['samplers'].index(sampler)
        mr = w.texture(f'{name}_metal_rough', images[f'{key}_metal_rough'], at)
        pbr = {'baseColorTexture': w.texture(name, images[f'{key}_colour'], at), 'metallicRoughnessTexture': mr,
               **images[f'{key}_factors']}
        m = {'name': name, 'doubleSided': True, 'pbrMetallicRoughness': pbr,
             'normalTexture': w.texture(f'{name}_normal', images[f'{key}_normal'], at)}
        if images[f'{key}_occlusion']:
            m['occlusionTexture'] = dict(mr)
        g['materials'].append(m)
        material_index[name] = len(g['materials']) - 1
    for name in ('arms', 'gun', 'mag2'):
        # (Named apart from the `gun` node.)
        write_mesh(w, f'ak74m_{name}', meshes[name], material_index[meshes[name]['material']])
    write_clips(w, clips, first)
    w.write(path)


def main():
    started = time.time()
    g, raw_accessor = read_gltf(SOURCE)
    log('bones', sum(len(s['joints']) for s in g['skins']), 'meshes', [m['name'] for m in g['meshes']],
        'animations', [a['name'] for a in g['animations']])
    accessor = fold_scale(g, raw_accessor)
    duration = max(float(accessor(s['input'])[-1, 0]) for a in g['animations'] if a['name'].endswith('AK_Idle')
                   for s in a['samplers'])
    rest_times = np.arange(0, duration, REST_STEP)
    gun = Gun(BONES, MESHES, MATERIALS, SCALE, CLIPS, plain_uv, 0.0, camera_node=CAMERA_NODE, dropped=DROPPED,
              rest_times=rest_times)
    rig, meshes, clips = convert(g, accessor, gun)
    check_winding(meshes)
    info, gun_turn = measure(rig, meshes, clips, rest_times)
    assert abs(info['gun_length'] - 0.943) < 0.001, f'the rifle is {info["gun_length"]} m long'
    bpy.ops.wm.read_factory_settings(use_empty=True)
    images = textures(g)
    log('textures', {k: f'{len(v) / 1e3:.0f} kB' for k, v in images.items() if isinstance(v, bytes)})
    write_glb(rig, meshes, clips, images, gun_turn, OUT_GLB)
    log('wrote', OUT_GLB, f'{os.path.getsize(OUT_GLB) / 1e6:.2f} MB')
    info['clips'] = {k: round(c['duration'], 4) for k, c in clips.items()}
    print('AK74M ' + json.dumps(info))
    log(f'done in {time.time() - started:.0f} s')


if __name__ == '__main__':
    main()
