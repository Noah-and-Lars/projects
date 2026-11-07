"""Reading the animated guns with their own arms that Cransh makes (the FN
502, convert_fn502.py, and the Makarov PM, convert_makarov.py): both are
the same kind of download, one FBX armature with the arms and the gun on
it, its own camera, and a handful of clips, so the converters share how
it's read, turned into gun space and measured. Each converter says what's
its own in a Gun (below): its bones' and meshes' names, its size, its
clips and where its eye is.

The rig, as both downloads have it: `_rootJoint` holding `Root` (the arms'
shoulders, the gun's frame and magazine hang under it), the two IK hand
controls with the hands under them, and two IK pole targets (no point is
weighted to them: left out). The arms' bones are named alike on both:
Arm_L, UpArm_L, Forearm_L, three twist bones, IK_Hand_Cntrl_L, Hand_L and
the fingers Bone_L.004 to .022 (and _R). Bones ending `_end` (leaf tips
some exports add, with nothing weighted to them) are left out too.
"""

import math

import numpy as np

from common import log
from rigged_gltf import Rig, clip_pose, cut, matrix_quat, node_matrix, quat_matrix, skin, trs_matrix

# The fingers' chains, from the hand (.004-.007 is the index finger, from
# its metacarpal; then the middle, ring and little fingers, by their
# lengths; .020-.022 the thumb).
FINGERS = [('index', 4, 4), ('middle', 8, 4), ('ring', 12, 4), ('little', 16, 4), ('thumb', 20, 3)]


def arm_bones():
    """The arms' bones (download names, less their numbered endings) and
    ours, the same on every Cransh rig."""
    bones = {'_rootJoint': 'rig', 'Root': 'body'}
    for s in ('L', 'R'):
        bones.update({f'Arm_{s}': f'shoulder_{s}', f'UpArm_{s}': f'upperarm_{s}', f'Forearm_{s}': f'forearm_{s}',
                      f'BoneTwist_03.{s}': f'twist1_{s}', f'BoneTwist_02.{s}': f'twist2_{s}',
                      f'BoneTwist_01.{s}': f'twist3_{s}', f'IK_Hand_Cntrl_{s}': f'hand_ik_{s}', f'Hand_{s}': f'hand_{s}'})
        for finger, start, count in FINGERS:
            for k in range(count):
                bones[f'Bone_{s}.{start + k:03d}'] = f'{finger}{k if count == 4 else k + 1}_{s}'
    return bones


class Gun:
    """What's particular to one download:
    - bones: the gun's bones (download names, less their numbered endings)
      and ours (frame_j, slide_j, trigger_j, hammer_j, mag_j), added to the
      arms' (arm_bones); dropped: bones left out (with what hangs under
      them), besides the IK pole targets and the `_end` tips.
    - meshes: mesh names and ours; dropped_meshes: meshes left out.
    - materials: material names and ours.
    - scale: download units to metres (from its real length).
    - camera_node: the name of the eye's node (an FBX camera, looking along
      its own +X, up its +Y).
    - clips: [(ours, the download's animation, None for all of it or a
      time for a still at it)].
    - uv(g, material, uv): a mesh's texture coordinates as the file keeps
      them, and its textures' wrapping (wrapS, wrapT).
    - port_ahead: where the ejection port's middle is, this far (metres) in
      front of the rear sight.
    - rest_times: the times in the idle clip the gun's frame is lined up
      with gun space at, on average (one for a still).
    - mesh_fix: {mesh name: 4x4 matrix} for a mesh whose points the
      download keeps in another space than its skin's: the matrix takes
      them into it (its normals turned with it, and its faces' winding
      turned over if it mirrors them).
    - own_frame: 'bone' (the gun is measured in its frame bone's axes) or
      'slide' (in the frame its slide's sights set, for a frame bone that
      points another way: see slide_frame).
    """

    def __init__(self, bones, meshes, materials, scale, clips, uv, port_ahead, camera_node='Camera',
                 dropped=(), dropped_meshes=(), rest_times=(0.0,), mesh_fix=None,
                 own_frame='bone'):
        self.bones = {**arm_bones(), **bones}
        self.dropped = {'IK_PoleTrgt_L', 'IK_PoleTrgt_R', *dropped}
        self.meshes, self.materials, self.scale, self.clips = meshes, materials, scale, clips
        self.uv, self.port_ahead, self.camera_node = uv, port_ahead, camera_node
        self.dropped_meshes = set(dropped_meshes)
        self.rest_times = tuple(rest_times)
        self.mesh_fix = mesh_fix or {}
        self.own_frame = own_frame
        self.debug = None


# --- Reading the download -------------------------------------------------------

def convert(g, accessor, gun):
    """The download as our rig (in gun space: metres, +X right, +Y up, -Z
    forward, its root at the eye), its meshes and its clips."""
    SCALE = gun.scale
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

    def dropped(i):
        return stem(i) in gun.dropped or stem(i).endswith('_end')

    assert len(g['skins']) == 1
    skin_def = g['skins'][0]
    root = skin_def['skeleton']
    W = world_of(parent_of[root])  # the armature's space, A, to the download's world
    assert np.allclose(node_matrix(nodes[root]), np.eye(4)), 'the skeleton root is moved'

    # The eye: the camera, in the armature's space (an FBX camera looks
    # along its own +X, up its +Y).
    cam = next(i for i, n in enumerate(nodes) if n.get('name') == gun.camera_node)
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
        if dropped(i):
            return
        if stem(i) not in gun.bones:
            raise SystemExit(f'unknown bone {nodes[i]["name"]}')
        n = nodes[i]
        parent = bone_of.get(parent_of.get(i))
        t, r = n.get('translation', [0, 0, 0]), n.get('rotation', [0, 0, 0, 1])
        assert 'matrix' not in n and np.allclose(n.get('scale', [1, 1, 1]), 1, atol=1e-4)
        rig.names.append(gun.bones[stem(i)])
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
            if c in skin_def['joints']:
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
        if m['name'] in gun.dropped_meshes:
            log(f'left out: {m["name"]}')
            continue
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
        normal = accessor(a['NORMAL']).astype(np.float64)
        triangles = accessor(prim['indices']).astype(np.int64).reshape(-1, 3)
        if m['name'] in gun.mesh_fix:
            X = np.asarray(gun.mesh_fix[m['name']], np.float64)
            pos = (np.c_[pos, np.ones(len(pos))] @ X.T)[:, :3]
            linear = X[:3, :3] / np.cbrt(abs(np.linalg.det(X[:3, :3])))
            normal = normal @ linear.T
            if np.linalg.det(linear) < 0:
                triangles = triangles[:, ::-1].copy()  # (mirrored: its faces' winding turns over)
        material = g['materials'][prim['material']]
        uv = accessor(a['TEXCOORD_0']).astype(np.float64)
        uv, wraps = gun.uv(g, material, uv)
        meshes[gun.meshes[m['name']]] = {
            'position': (np.c_[pos, np.ones(len(pos))] @ Hw.T)[:, :3],
            'normal': normal @ rot.T,
            'uv': uv, 'joints': joints, 'weights': w,
            'triangles': triangles,
            'material': gun.materials[material['name']], 'wraps': wraps,
            'source': (pos, J),  # (as fitted, if it was)
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
            if node not in bone_of:
                assert dropped(node), f'{nodes[node]["name"]} is animated'
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
    for name, source, still in gun.clips:
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


# --- Measuring --------------------------------------------------------------------

def r4(v):
    return [round(float(x), 4) for x in v]


def rest_frame(rig, clips, fj, times):
    """The frame bone's matrix in the idle pose: at its one time, or the
    mean over several (its turn the nearest to the mean of theirs)."""
    mats = [rig.world(clip_pose(clips['idle'], t))[fj] for t in times]
    if len(mats) == 1:
        return mats[0]
    F = np.eye(4)
    F[:3, 3] = np.mean([m[:3, 3] for m in mats], 0)
    u, _, vt = np.linalg.svd(np.mean([m[:3, :3] for m in mats], 0))
    F[:3, :3] = u @ vt
    return F


def slide_frame(slide, turn):
    """The gun's own frame (right, up, back), in the frame bone's space, from
    its slide's points there (at rest), for a frame bone whose axes aren't
    the gun's: right as near the rig's +X as the bone's axes come (turn:
    the frame bone's turn at rest, into the rig's space, where the gun
    points forward, -Z, its top up), back along the line over its sights
    (the slide's highest points near its back and its front, first found
    along its longest extent) and up from those. Returns the 3x3 turn whose
    columns are those axes."""
    # (The bone's axis nearest the rig's right: the right to start from.)
    k = int(np.argmax(np.abs(turn[0])))
    right = np.eye(3)[k] * np.sign(turn[0, k])
    c = slide - slide.mean(0)
    _, _, vt = np.linalg.svd(c, full_matrices=False)
    back = vt[0] if (turn @ vt[0])[2] > 0 else -vt[0]
    for _ in range(3):
        right = right - back * (right @ back)
        right /= np.linalg.norm(right)
        axes = np.c_[right, np.cross(back, right), back]
        own = c @ axes
        middle = (own[:, 2].max() + own[:, 2].min()) / 2
        rear = own[own[:, 2] > middle]
        fore = own[own[:, 2] < middle]
        r = rear[rear[:, 1] > rear[:, 1].max() - 0.0008].mean(0)
        f = fore[fore[:, 1] > fore[:, 1].max() - 0.0008].mean(0)
        r[1], f[1] = rear[:, 1].max(), fore[:, 1].max()
        line = axes @ (r - f)
        back = line / np.linalg.norm(line)
    right = right - back * (right @ back)
    right /= np.linalg.norm(right)
    return np.c_[right, np.cross(back, right), back]


def measure(rig, meshes, clips, gun, event_clips=('shoot', 'reload', 'reloadEmpty', 'walk', 'run'), parts=False):
    """The game's constants for the gun (its points in the `gun` node's
    space, where the frame is at rest, the clips' events) and the `gun`
    node's turn on the frame bone."""
    out = {'scale': round(gun.scale, 5)}
    fj, sj, mj, hl = rig.index('frame_j'), rig.index('slide_j'), rig.index('mag_j'), rig.index('hand_L')
    idle = clip_pose(clips['idle'], gun.rest_times[0])
    world = rig.world(idle)
    Fb = rest_frame(rig, clips, fj, gun.rest_times)
    # The `gun` node: at the frame bone, turned so that at idle it's lined up
    # with gun space. The gun is measured in its own frame: the frame bone's
    # own axes (right, up, back: it's held turned a little about its bore),
    # or for a gun whose frame bone points another way (gun.own_frame:
    # 'slide'), the frame its slide sets (see slide_frame).
    gun_turn = matrix_quat(Fb[:3, :3].T)
    mesh = meshes['gun']
    gp = skin(rig, mesh, idle)
    dom = mesh['joints'][np.arange(len(gp)), mesh['weights'].argmax(1)]
    # (Its points in the frame bone's space, which they're fixed in at rest.)
    local = (np.c_[gp, np.ones(len(gp))] @ np.linalg.inv(world[fj]).T)[:, :3]
    if gun.own_frame == 'slide':
        G = slide_frame(local[dom == sj], Fb[:3, :3])
        log(f'frame bone axes at rest (rig space, columns): {np.round(Fb[:3, :3], 3).tolist()}; the gun\'s: '
            f'{np.round(Fb[:3, :3] @ G, 3).tolist()}')
        local = local @ G
        F = Fb.copy()
        F[:3, :3] = Fb[:3, :3] @ G
    else:
        F = Fb
    own = local
    out['frame_idle'] = r4(F[:3, 3])
    out['cant_deg'] = round(math.degrees(math.atan2(F[0, 1], F[1, 1])), 2)  # top towards the left (+)
    in_gun = lambda p: F[:3, :3] @ np.asarray(p, np.float64)  # noqa: E731  (the gun's own frame to the gun node's)

    if gun.debug:
        np.save(gun.debug, np.c_[own, dom])
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
    # the chamber (its middle port_ahead in front of the rear sight).
    port_own = np.array([sv[:, 0].max() - 0.002, top - 0.008, s['rearZ'] - gun.port_ahead])
    out['port_own'] = r4(port_own)
    out['port'] = r4(in_gun(port_own))

    # The clips' events, from the bones' paths (in the frame's space).
    def path(clip, step=1 / 120):
        n = int(round(clips[clip]['duration'] / step)) + 1
        ts = np.linspace(0, clips[clip]['duration'], n)
        return ts, [rig.world(clip_pose(clips[clip], t)) for t in ts]

    rest_slide = (np.linalg.inv(world[fj]) @ world[sj])[:3, 3]
    rest_mag = (np.linalg.inv(world[fj]) @ world[mj])[:3, 3]
    rest_hand = (np.linalg.inv(world[fj]) @ world[hl])[:3, 3]
    events = {}
    for clip in event_clips:
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
            if slide[0] > 0.0005 or slide[-1] > 0.0005:
                e['slideAtEnds'] = [round(float(slide[0]), 4), round(float(slide[-1]), 4)]
        if mag.max() > 0.003:
            moved = mag > 0.002
            e['magOut'] = round(float(ts[np.argmax(moved)]), 3)
            far = mag > 0.95 * mag.max()
            e['magGrab'] = round(float(ts[len(far) - 1 - np.argmax(far[::-1])]), 3)  # it starts back from the belt
            e['magIn'] = round(float(ts[len(moved) - 1 - np.argmax(moved[::-1])]), 3)
        if hand.max() > 0.01:
            off = hand > 0.01
            e['handOn'] = round(float(ts[len(off) - 1 - np.argmax(off[::-1])]), 3)
        if parts:
            # (parts) When the trigger and hammer move from where they rest
            # (turned more than 2 degrees), and when they're furthest.
            for key, bone in (('trigger', 'trigger_j'), ('hammer', 'hammer_j')):
                b = rig.index(bone)
                rest = (np.linalg.inv(world[fj]) @ world[b])[:3, :3]
                angle = np.array([math.degrees(math.acos(np.clip((np.trace(rest.T @ (np.linalg.inv(wm[fj]) @ wm[b])[:3, :3])
                                                                   - 1) / 2, -1, 1))) for wm in ws])
                if angle.max() > 2:
                    moved = angle > 2
                    e[key] = {'moves': round(float(ts[np.argmax(moved)]), 3), 'most': round(float(ts[np.argmax(angle)]), 3),
                              'back': round(float(ts[len(moved) - 1 - np.argmax(moved[::-1])]), 3),
                              'degrees': round(float(angle.max()), 1)}
        events[clip] = e
    out['events'] = events
    out['slideTravel'] = events['shoot']['slideTravel']
    out['bones'] = rig.names
    return out, gun_turn
