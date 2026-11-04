"""Builds the detailed gloves and sleeves for Project Fish in Blender.

Run from the project-fish folder:

    npm install
    node tools/export-arm-base.mjs build/arm-base
    blender --background --python tools/blender/build_arms.py -- build/arm-base assets/arms.glb --blend build/arms.blend

(or `python tools/blender/build_arms.py build/arm-base assets/arms.glb` with
Blender's Python module, `pip install bpy`). Takes a few minutes.

Starting from the posed hands and sleeves exported from the game, it:

- Gloves: adds a moulded hard knuckle guard and a velcro wrist strap with a
  rubber pull tab as real geometry, then paints and bakes the small detail
  into textures: stitched seams down the sides of every finger, leather
  fingertip caps and palm, padded finger knuckles with a flex groove, ribbed
  flex panel on the back of the hand, elastic wrist cuff.
- Sleeves: adds fabric folds bunched up at the cuff and a velcro cuff tab as
  geometry, and bakes ripstop weave, a double-stitched hem and a stitched
  seam along the forearm into textures.
- Bakes ambient occlusion with the pistol and both hands in place, so the
  creases between fingers and where they press on the gun are shaded.
- Exports everything as one glTF file (.glb) the game loads. The --blend file
  can be opened in Blender to keep working on the models by hand.

Coordinates: the game's gun space (metres, Y up, muzzle towards -Z) becomes
Blender's (Z up) as (x, -z, y); the glTF exporter converts back.
"""

import json
import math
import os
import sys
import tempfile
import time

import bpy
import numpy as np
from mathutils import Vector, noise
from mathutils.bvhtree import BVHTree

ARGS = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else sys.argv[1:]
BASE_DIR, OUT_GLB = ARGS[0], ARGS[1]
BLEND = ARGS[ARGS.index('--blend') + 1] if '--blend' in ARGS else None
SIZE = int(ARGS[ARGS.index('--size') + 1]) if '--size' in ARGS else 1024
AO_SAMPLES = int(ARGS[ARGS.index('--ao-samples') + 1]) if '--ao-samples' in ARGS else 48

GLOVE_TRIANGLES = 16000
SLEEVE_TRIANGLES = 20000

# Colours (sRGB)
GLOVE_FABRIC = '#2a2b2e'
GLOVE_LEATHER = '#201f1e'
GLOVE_PAD = '#161718'
GLOVE_THREAD = '#56564f'
GLOVE_RIB = '#1d1e20'
SLEEVE_FABRIC = '#4d533f'
SLEEVE_THREAD = '#61654f'
ARMOR = '#121314'
STRAP = '#1b1b1d'
TAB = '#141415'


def log(*args):
    print(f'[{time.strftime("%H:%M:%S")}]', *args, flush=True)


def to_blender(v):
    return np.array([v[0], -v[2], v[1]], dtype=np.float64)


def unit(v):
    return v / np.linalg.norm(v)


def srgb_to_linear(hex_color):
    c = np.array([int(hex_color[i:i + 2], 16) / 255 for i in (1, 3, 5)])
    return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)


def linear_to_srgb(c):
    c = np.clip(c, 0, 1)
    return np.where(c <= 0.0031308, c * 12.92, 1.055 * np.power(c, 1 / 2.4) - 0.055)


def smoothstep(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0, 1)
    return t * t * (3 - 2 * t)


def dashes(x, period, duty=0.62):
    return (np.mod(x, period) / period) < duty


def near_line(d, width):
    """1 on a line (d = distance from it), fading out over `width`."""
    return np.exp(-(d / width) ** 2)


def low_noise(p, wavelength, seed):
    """Smooth, cheap 3D noise from a few crossed waves (range about -1..1)."""
    rng = np.random.default_rng(seed)
    total = np.zeros(len(p))
    for _ in range(5):
        k = unit(rng.normal(size=3)) * (2 * math.pi / wavelength) * rng.uniform(0.7, 1.4)
        total += np.sin(p @ k + rng.uniform(0, 2 * math.pi))
    return total / 2.2


# --- Scene and objects --------------------------------------------------------

def reset_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.render.engine = 'CYCLES'
    scene.cycles.device = 'CPU'
    scene.render.bake.margin = 12
    scene.render.bake.margin_type = 'EXTEND'
    world = bpy.data.worlds.new('World')
    world.light_settings.distance = 0.04  # ambient occlusion reach: 4 cm
    scene.world = world
    return scene


def read_obj(path):
    verts, faces = [], []
    with open(path) as f:
        for line in f:
            if line.startswith('v '):
                x, y, z = map(float, line.split()[1:4])
                verts.append((x, -z, y))
            elif line.startswith('f '):
                faces.append([int(p.split('/')[0]) - 1 for p in line.split()[1:]])
    return verts, faces


def mesh_object(name, verts, faces):
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(verts, [], faces)
    mesh.validate()
    mesh.polygons.foreach_set('use_smooth', [True] * len(mesh.polygons))
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(obj)
    return obj


def apply_modifiers(obj):
    depsgraph = bpy.context.evaluated_depsgraph_get()
    mesh = bpy.data.meshes.new_from_object(obj.evaluated_get(depsgraph))
    obj.modifiers.clear()
    old = obj.data
    obj.data = mesh
    bpy.data.meshes.remove(old)
    mesh.polygons.foreach_set('use_smooth', [True] * len(mesh.polygons))


def triangle_count(obj):
    return sum(len(p.vertices) - 2 for p in obj.data.polygons)


def decimate(obj, triangles):
    mod = obj.modifiers.new('Decimate', 'DECIMATE')
    mod.ratio = min(1.0, triangles / triangle_count(obj))
    apply_modifiers(obj)


def voxel_remesh(obj, size):
    mod = obj.modifiers.new('Remesh', 'REMESH')
    mod.mode = 'VOXEL'
    mod.voxel_size = size
    apply_modifiers(obj)


def select_only(obj):
    for o in bpy.context.scene.objects:
        o.select_set(False)
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj


def uv_unwrap(obj):
    select_only(obj)
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.smart_project(angle_limit=math.radians(60), island_margin=0.006, area_weight=0.0)
    bpy.ops.object.mode_set(mode='OBJECT')


def bvh(obj):
    depsgraph = bpy.context.evaluated_depsgraph_get()
    return BVHTree.FromObject(obj, depsgraph)


def vertex_array(obj):
    co = np.empty(len(obj.data.vertices) * 3)
    obj.data.vertices.foreach_get('co', co)
    return co.reshape(-1, 3)


def set_vertex_array(obj, co):
    obj.data.vertices.foreach_set('co', co.reshape(-1))
    obj.data.update()


def vertex_normals(obj):
    n = np.empty(len(obj.data.vertices) * 3)
    obj.data.vertices.foreach_get('normal', n)
    return n.reshape(-1, 3)


def grid_patch(name, rows, cols, point_at):
    """A grid surface; point_at(i, j) gives each vertex (or None to leave it out)."""
    verts, index = [], {}
    for i in range(rows):
        for j in range(cols):
            p = point_at(i, j)
            if p is not None:
                index[i, j] = len(verts)
                verts.append(tuple(p))
    faces = []
    for i in range(rows - 1):
        for j in range(cols - 1):
            quad = [(i, j), (i, j + 1), (i + 1, j + 1), (i + 1, j)]
            if all(q in index for q in quad):
                faces.append([index[q] for q in quad])
    return mesh_object(name, verts, faces)


# --- Baking -------------------------------------------------------------------

def new_image(name, float_buffer=False, color=False):
    image = bpy.data.images.new(name, SIZE, SIZE, alpha=False, float_buffer=float_buffer)
    image.colorspace_settings.name = 'sRGB' if color else 'Non-Color'
    return image


def bake(obj, image, kind, build_nodes=None, samples=1):
    """Bakes `kind` (EMIT, NORMAL, AO) of obj into image, using a temporary
    material whose nodes build_nodes(nodes, links) sets up."""
    mat = bpy.data.materials.new(f'bake_{obj.name}_{kind}')
    mat.use_nodes = True
    nodes, links = mat.node_tree.nodes, mat.node_tree.links
    nodes.clear()
    out = nodes.new('ShaderNodeOutputMaterial')
    shader = build_nodes(nodes, links) if build_nodes else nodes.new('ShaderNodeBsdfDiffuse').outputs[0]
    links.new(shader, out.inputs['Surface'])
    target = nodes.new('ShaderNodeTexImage')
    target.image = image
    nodes.active = target
    obj.data.materials.clear()
    obj.data.materials.append(mat)
    bpy.context.scene.cycles.samples = samples
    select_only(obj)
    if kind == 'NORMAL':
        bpy.ops.object.bake(type='NORMAL', normal_space='TANGENT')
    else:
        bpy.ops.object.bake(type=kind)
    obj.data.materials.clear()
    bpy.data.materials.remove(mat)


def pixels(image):
    a = np.empty(SIZE * SIZE * 4, np.float32)
    image.pixels.foreach_get(a)
    return a.reshape(SIZE, SIZE, 4)


def set_pixels(image, rgb):
    rgba = np.ones((SIZE, SIZE, 4), np.float32)
    rgba[..., :3] = rgb.reshape(SIZE, SIZE, -1)
    image.pixels.foreach_set(rgba.reshape(-1))
    image.update()


def bake_positions(obj):
    """World position of every texel."""
    image = new_image(f'{obj.name}_position', float_buffer=True)

    def nodes_for(nodes, links):
        geo = nodes.new('ShaderNodeNewGeometry')
        scale = nodes.new('ShaderNodeVectorMath')
        scale.operation = 'MULTIPLY_ADD'
        scale.inputs[1].default_value = (0.5, 0.5, 0.5)
        scale.inputs[2].default_value = (0.5, 0.5, 0.5)
        links.new(geo.outputs['Position'], scale.inputs[0])
        emit = nodes.new('ShaderNodeEmission')
        links.new(scale.outputs[0], emit.inputs['Color'])
        return emit.outputs[0]

    bake(obj, image, 'EMIT', nodes_for)
    p = (pixels(image)[..., :3].astype(np.float64) - 0.5) * 2
    bpy.data.images.remove(image)
    return p.reshape(-1, 3)


def bake_normal_from_height(obj, height):
    """Turns a height map (metres) into a tangent-space normal map."""
    h_image = new_image(f'{obj.name}_height', float_buffer=True)
    set_pixels(h_image, np.repeat(height.reshape(-1, 1), 3, axis=1))
    n_image = new_image(f'{obj.name}_normal')

    def nodes_for(nodes, links):
        tex = nodes.new('ShaderNodeTexImage')
        tex.image = h_image
        tex.interpolation = 'Linear'
        bump = nodes.new('ShaderNodeBump')
        bump.inputs['Strength'].default_value = 1.0
        bump.inputs['Distance'].default_value = 1.0
        links.new(tex.outputs['Color'], bump.inputs['Height'])
        bsdf = nodes.new('ShaderNodeBsdfDiffuse')
        links.new(bump.outputs['Normal'], bsdf.inputs['Normal'])
        return bsdf.outputs[0]

    bake(obj, n_image, 'NORMAL', nodes_for)
    bpy.data.images.remove(h_image)
    return n_image


def bake_ao(obj):
    image = new_image(f'{obj.name}_ao', float_buffer=True)
    bake(obj, image, 'AO', samples=AO_SAMPLES)
    ao = pixels(image)[..., 0].astype(np.float64)
    bpy.data.images.remove(image)
    # Soften the sampling noise a little.
    blurred = ao.copy()
    for axis in (0, 1):
        blurred = (np.roll(blurred, 1, axis) + 2 * blurred + np.roll(blurred, -1, axis)) / 4
    return blurred.reshape(-1)


def textured_material(obj, color, roughness, normal_image):
    """Final material: base colour, roughness and normal map."""
    name = obj.name
    color_image = new_image(f'{name}_color', color=True)
    set_pixels(color_image, linear_to_srgb(color))
    rough_image = new_image(f'{name}_roughness')
    set_pixels(rough_image, np.repeat(roughness.reshape(-1, 1), 3, axis=1))

    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nodes, links = mat.node_tree.nodes, mat.node_tree.links
    bsdf = nodes['Principled BSDF']
    bsdf.inputs['Metallic'].default_value = 0.0
    c = nodes.new('ShaderNodeTexImage')
    c.image = color_image
    links.new(c.outputs['Color'], bsdf.inputs['Base Color'])
    r = nodes.new('ShaderNodeTexImage')
    r.image = rough_image
    links.new(r.outputs['Color'], bsdf.inputs['Roughness'])
    n = nodes.new('ShaderNodeTexImage')
    n.image = normal_image
    nm = nodes.new('ShaderNodeNormalMap')
    links.new(n.outputs['Color'], nm.inputs['Color'])
    links.new(nm.outputs['Normal'], bsdf.inputs['Normal'])
    obj.data.materials.clear()
    obj.data.materials.append(mat)

    # Save the images next to each other so the exporter (and the .blend) can find them.
    folder = os.path.join(tempfile.gettempdir(), 'project-fish-textures')
    os.makedirs(folder, exist_ok=True)
    for image in (color_image, rough_image, normal_image):
        image.filepath_raw = os.path.join(folder, image.name + '.png')
        image.file_format = 'PNG'
        image.save()


def plain_material(obj, hex_color, roughness):
    mat = bpy.data.materials.new(obj.name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes['Principled BSDF']
    bsdf.inputs['Base Color'].default_value = (*srgb_to_linear(hex_color), 1)
    bsdf.inputs['Roughness'].default_value = roughness
    bsdf.inputs['Metallic'].default_value = 0.0
    obj.data.materials.clear()
    obj.data.materials.append(mat)


# --- Gloves -------------------------------------------------------------------

def finger_bones(hand, grip):
    """Every finger and thumb bone, with the direction the back of that finger faces."""
    g0, gd = to_blender(grip['top']), unit(to_blender(grip['down']))
    bones = []
    chains = hand['fingers'] + [hand['thumb']]
    for ci, chain in enumerate(chains):
        joints = [to_blender(j) for j in chain['joints']]
        radii = chain['radii']
        cum = 0.0
        for bi in range(len(joints) - 1):
            a, b = joints[bi], joints[bi + 1]
            axis = unit(b - a)
            mid = (a + b) / 2
            # Fingers curl round the grip, so the back of each finger faces away from it.
            away = mid - (g0 + gd * ((mid - g0) @ gd))
            back = unit(away - axis * (away @ axis))
            bones.append(dict(a=a, b=b, ra=radii[bi], rb=radii[bi + 1], axis=axis, back=back,
                              side=np.cross(axis, back), length=np.linalg.norm(b - a), cum=cum,
                              chain=ci, bone=bi, thumb=ci == len(chains) - 1))
            cum += np.linalg.norm(b - a)
    return bones


def glove_maps(p, hand, grip):
    """Colour, roughness and height for every texel of a glove."""
    n = len(p)
    fabric, leather = srgb_to_linear(GLOVE_FABRIC), srgb_to_linear(GLOVE_LEATHER)
    pad_c, thread, rib_c = srgb_to_linear(GLOVE_PAD), srgb_to_linear(GLOVE_THREAD), srgb_to_linear(GLOVE_RIB)
    color = np.tile(fabric, (n, 1))
    rough = np.full(n, 0.86)
    height = np.zeros(n)

    wrist = to_blender(hand['wrist'])
    along, across = to_blender(hand['along']), to_blender(hand['across'])
    back, forearm = to_blender(hand['back']), to_blender(hand['forearm'])
    palm_center = to_blender(hand['palmCenter'])

    # Nearest bone for every texel.
    bones = finger_bones(hand, grip)
    best = np.full(n, np.inf)
    which = np.zeros(n, int)
    t_best = np.zeros(n)
    for k, b in enumerate(bones):
        ab = b['b'] - b['a']
        t = np.clip(((p - b['a']) @ ab) / (ab @ ab), 0, 1)
        d = np.linalg.norm(p - (b['a'] + t[:, None] * ab), axis=1) - (b['ra'] + (b['rb'] - b['ra']) * t)
        closer = d < best
        best[closer], which[closer], t_best[closer] = d[closer], k, t[closer]

    theta = np.zeros(n)  # angle round the finger: 0 = back of the finger, ±π = the pad side
    radius = np.full(n, 0.01)
    length = np.zeros(n)  # distance along the finger from its knuckle
    bone_no = np.zeros(n, int)
    thumb = np.zeros(n, bool)
    for k, b in enumerate(bones):
        m = which == k
        if not m.any():
            continue
        t = t_best[m]
        r = p[m] - (b['a'] + t[:, None] * (b['b'] - b['a']))
        theta[m] = np.arctan2(r @ b['side'], r @ b['back'])
        radius[m] = b['ra'] + (b['rb'] - b['ra']) * t
        length[m] = b['cum'] + t * b['length']
        bone_no[m] = b['bone']
        thumb[m] = b['thumb']
    on_finger = (best < 0.0025) & ~(thumb & (bone_no == 0))
    abs_theta = np.abs(theta)

    # Leather on the palm side of the hand and of the fingers.
    side_of_hand = (p - palm_center) @ back
    palm_side = np.where(on_finger, abs_theta > math.radians(100), side_of_hand < -0.003)
    color[palm_side] = leather
    rough[palm_side] = 0.64
    grain = low_noise(p, 0.0011, 1) * 0.5 + low_noise(p, 0.0006, 2) * 0.5
    height += np.where(palm_side, grain * 0.00004, 0)

    # Leather caps over the fingertips, joined on by a stitched seam.
    cap_t = 0.42
    tip_bone = on_finger & (bone_no == 2)
    bone_len = np.array([b['length'] for b in bones])[which]
    cap_along = (t_best - cap_t) * bone_len  # + towards the tip
    cap = tip_bone & (cap_along > 0)
    color[cap] = leather
    rough[cap] = 0.62
    height -= np.where(tip_bone, 0.00022 * near_line(cap_along, 0.00035), 0)
    cap_stitch = tip_bone & ~palm_side & (np.abs(cap_along + 0.0011) < 0.00024) & dashes(theta * radius, 0.0026)
    color[cap_stitch] = thread
    height += np.where(cap_stitch, 0.00012, 0)

    # Seams down both sides of every finger, stitched on the back panel.
    seam = math.radians(100)
    seam_dist = (abs_theta - seam) * radius
    height -= np.where(on_finger, 0.00022 * near_line(seam_dist, 0.00035), 0)
    side_stitch = on_finger & ~cap & (np.abs(seam_dist + 0.0011) < 0.00024) & dashes(length, 0.0026)
    color[side_stitch] = thread
    rough[side_stitch] = 0.72
    height += np.where(side_stitch, 0.00013, 0)

    # Padded knuckle patches over the middle joint of each finger (the thumb's last joint).
    joint_len = {}
    for b in bones:
        if (not b['thumb'] and b['bone'] == 1) or (b['thumb'] and b['bone'] == 2):
            joint_len[b['chain']] = b['cum']
    chain_of = np.array([b['chain'] for b in bones])[which]
    joint_at = np.array([joint_len.get(c, -1) for c in range(len(joint_len) + 1)])[chain_of]
    u = length - joint_at  # along the finger, from the joint
    v = theta * radius  # across the back of the finger
    q = np.stack([np.abs(u) - 0.0068, np.abs(v) - 0.0062], axis=1)
    pad_sd = np.linalg.norm(np.maximum(q + 0.003, 0), axis=1) + np.minimum(np.max(q + 0.003, axis=1), 0) - 0.003
    in_pad = on_finger & (joint_at >= 0) & (abs_theta < math.radians(80))
    pad = np.where(in_pad, smoothstep(0.0004, -0.0004, pad_sd), 0)
    color = color * (1 - pad[:, None]) + pad_c * pad[:, None]
    rough = rough * (1 - pad) + 0.52 * pad
    height += 0.00055 * pad - 0.00028 * pad * near_line(u, 0.00035)
    pad_stitch = in_pad & (np.abs(pad_sd + 0.0009) < 0.0002) & dashes(u + v, 0.0024)
    color[pad_stitch] = thread
    height += np.where(pad_stitch, 0.0001, 0)

    # Back of the hand: ribbed flex panel below the knuckle guard, and the seam
    # where the back panel meets the palm.
    on_hand = ~on_finger
    a = (p - wrist) @ along
    c = (p - palm_center) @ across
    ribs = on_hand & ~palm_side & (a > 0.035) & (a < 0.06) & (np.abs(c) < 0.027)
    rib_shape = 0.5 + 0.5 * np.cos(2 * math.pi * (a - 0.035) / 0.0034)
    fade = smoothstep(0.027, 0.022, np.abs(c)) * smoothstep(0.035, 0.038, a) * smoothstep(0.06, 0.057, a)
    height += np.where(ribs, 0.0003 * rib_shape * fade, 0)
    color[ribs] *= (0.85 + 0.15 * rib_shape[ribs])[:, None]
    edge_dist = side_of_hand + 0.003
    height -= np.where(on_hand, 0.0002 * near_line(edge_dist, 0.00035), 0)
    edge_stitch = on_hand & (np.abs(edge_dist - 0.0011) < 0.00024) & dashes(a + c, 0.0026)
    color[edge_stitch] = thread
    height += np.where(edge_stitch, 0.00012, 0)

    # Elastic cuff round the wrist.
    w = (p - wrist) @ forearm
    e1 = unit(back - forearm * (back @ forearm))
    e2 = np.cross(forearm, e1)
    r = p - wrist
    around = np.arctan2(r @ e2, r @ e1)
    cuff = on_hand & (w > -0.004)
    color[cuff] = rib_c
    rough[cuff] = 0.9
    height += np.where(cuff, 0.00016 * np.cos(around * 70), 0)
    height -= np.where(on_hand, 0.00022 * near_line(w + 0.004, 0.0004), 0)

    # Slight unevenness, so it doesn't look like plastic.
    color *= (1 + 0.05 * low_noise(p, 0.03, 3))[:, None]
    rough = np.clip(rough + 0.04 * low_noise(p, 0.02, 4), 0, 1)
    # Darken the grooves a little.
    color *= (1 - 0.35 * np.clip(-height / 0.0003, 0, 1))[:, None]
    return color, rough, height


def knuckle_guard(name, glove, hand):
    """A moulded hard shell over the four knuckles, sitting on the glove."""
    back, along = unit(to_blender(hand['back'])), unit(to_blender(hand['along']))
    knuckles = [to_blender(f['joints'][0]) for f in hand['fingers']]
    radii = [f['radii'][0] for f in hand['fingers']]
    across = unit(knuckles[-1] - knuckles[0])
    across = unit(across - back * (across @ back))
    along = unit(np.cross(back, across))
    if along @ to_blender(hand['along']) < 0:
        along = -along
    center = np.mean(knuckles, axis=0) - along * 0.003
    half_w = np.linalg.norm(knuckles[-1] - knuckles[0]) / 2 + 0.011
    half_h = 0.0125
    tree = bvh(glove)
    # Where each knuckle and the gaps between them sit across the guard.
    k_pos = [((k - center) @ across) / half_w for k in knuckles]
    gaps = [(k_pos[i] + k_pos[i + 1]) / 2 for i in range(len(k_pos) - 1)]
    rows, cols = 26, 110

    def point(i, j):
        a = -1 + 2 * j / (cols - 1)
        b = -1 + 2 * i / (rows - 1)
        shape = abs(a) ** 5 + abs(b) ** 4
        if shape > 1:
            return None
        q = center + across * (a * half_w) + along * (b * half_h)
        hit, normal, _, _ = tree.ray_cast(Vector(q + back * 0.04), Vector(-back), 0.08)
        if hit is None:
            return None
        hit, normal = np.array(hit), np.array(normal)
        thickness = 0.0016 * smoothstep(1.0, 0.55, shape)
        for kp, r in zip(k_pos, radii):
            thickness += 0.0016 * math.exp(-((a - kp) * half_w) ** 2 / (2 * 0.0052 ** 2)) * smoothstep(1.0, 0.4, abs(b))
        for g in gaps:
            thickness -= 0.0007 * math.exp(-(((a - g) * half_w) / 0.0006) ** 2) * smoothstep(1.0, 0.6, shape)
        return hit + normal * (0.0003 + max(thickness, 0))

    obj = grid_patch(name, rows, cols, point)
    obj.data.polygons.foreach_set('use_smooth', [True] * len(obj.data.polygons))
    plain_material(obj, ARMOR, 0.42)
    return obj


def wrist_strap(name, hand):
    """Velcro strap round the wrist, with a rubber pull tab on the back."""
    wrist, forearm = to_blender(hand['wrist']), unit(to_blender(hand['forearm']))
    back = to_blender(hand['back'])
    e1 = unit(back - forearm * (back @ forearm))
    e2 = np.cross(forearm, e1)
    # The glove's wrist is a cone from radius 25.5 mm (at the wrist) to 28 mm (6 cm along).
    glove_r = lambda w: 0.0255 + 0.0025 * w / 0.06
    start, end = 0.013, 0.035
    rows, cols = 18, 96

    def band(i, j):
        u = i / (rows - 1)
        ang = 2 * math.pi * j / cols
        w = start + (end - start) * u
        edge = smoothstep(0.0, 0.15, u) * smoothstep(1.0, 0.85, u)
        r = glove_r(w) + 0.0004 + 0.0016 * edge
        return wrist + forearm * w + (e1 * math.cos(ang) + e2 * math.sin(ang)) * r

    verts, faces = [], []
    for i in range(rows):
        for j in range(cols):
            verts.append(tuple(band(i, j)))
    for i in range(rows - 1):
        for j in range(cols):
            a, b = i * cols + j, i * cols + (j + 1) % cols
            faces.append([a, b, b + cols, a + cols])
    strap = mesh_object(name, verts, faces)
    plain_material(strap, STRAP, 0.85)

    # Pull tab: the strap's loose end, lying over the band towards the thumb side.
    tab_center = 0.62  # angle (radians) round from the back of the wrist

    def tab(i, j):
        u = -1 + 2 * i / 15
        v = -1 + 2 * j / 23
        shape = abs(u) ** 4 + abs(v) ** 4
        if shape > 1:
            return None
        w = (start + end) / 2 + u * 0.012
        ang = tab_center + v * 0.016 / 0.03
        lift = 0.0014 * smoothstep(1.0, 0.5, shape) + 0.0009 * smoothstep(0.3, 0.9, v) * smoothstep(1.0, 0.6, shape)
        r = glove_r(w) + 0.0021 + lift
        return wrist + forearm * w + (e1 * math.cos(ang) + e2 * math.sin(ang)) * r

    pull = grid_patch(name + '_tab', 16, 24, tab)
    pull.data.polygons.foreach_set('use_smooth', [True] * len(pull.data.polygons))
    plain_material(pull, TAB, 0.5)
    return strap, pull


# --- Sleeves ------------------------------------------------------------------

def sleeve_frame(hand, side):
    wrist, forearm = to_blender(hand['wrist']), unit(to_blender(hand['forearm']))
    start = wrist + forearm * 0.034
    # e1 points to the outside of the arm and up; the seam runs along the opposite side.
    outward = to_blender([1.0 if side == 'right' else -1.0, 0.7, 0.0])
    e1 = unit(outward - forearm * (outward @ forearm))
    e2 = np.cross(forearm, e1)
    return start, forearm, e1, e2


def add_folds(obj, frame):
    """Pushes the sleeve surface in and out into fabric folds."""
    start, f, e1, e2 = frame
    co = vertex_array(obj)
    nrm = vertex_normals(obj)
    r = co - start
    t = r @ f
    around = np.arctan2(r @ e2, r @ e1)
    wobble = np.array([noise.noise(Vector(c * 60)) for c in co])
    wobble2 = np.array([noise.noise(Vector(c * 25 + 7.3)) for c in co])
    # Rings of bunched fabric just above the cuff, fading further up the arm.
    bunch = np.exp(-np.maximum(t - 0.025, 0) / 0.05) * np.sin(2 * math.pi * t / 0.011 + 1.1 * np.sin(around * 2 + t * 40) + 1.5 * wobble)
    # Long diagonal folds from the forearm twisting.
    twist = np.sin(around * 3 + t * 55 + 2.2 * wobble2) * smoothstep(0.03, 0.08, t)
    amount = 0.0021 * bunch + 0.0014 * twist + 0.0008 * wobble2
    amount *= smoothstep(0.019, 0.03, t)  # the hem stays stiff and smooth
    set_vertex_array(obj, co + nrm * amount[:, None])


def sleeve_maps(p, frame):
    start, f, e1, e2 = frame
    n = len(p)
    fabric, thread = srgb_to_linear(SLEEVE_FABRIC), srgb_to_linear(SLEEVE_THREAD)
    color = np.tile(fabric, (n, 1))
    rough = np.full(n, 0.93)
    height = np.zeros(n)
    r = p - start
    t = r @ f
    around = np.arctan2(r @ e2, r @ e1)
    radius = np.linalg.norm(r - t[:, None] * f, axis=1)
    s = around * radius  # distance round the arm

    # Ripstop: a grid of thicker threads every 5.5 mm.
    grid = 0.0055
    dt = np.abs(np.mod(t / grid + 0.5, 1) - 0.5) * grid
    ds = np.abs(np.mod(s / grid + 0.5, 1) - 0.5) * grid
    lines = np.maximum(near_line(dt, 0.0002), near_line(ds, 0.0002))
    height += 0.0001 * lines
    color *= (1 + 0.08 * lines)[:, None]

    # Hem at the cuff: a fold line and two rows of stitching.
    hem = t < 0.02
    height -= np.where(hem | (t < 0.021), 0.0003 * near_line(t - 0.0185, 0.0004), 0)
    for row in (0.0035, 0.0145):
        st = (np.abs(t - row) < 0.00026) & dashes(s, 0.0032, 0.66)
        color[st] = thread
        rough[st] = 0.8
        height += np.where(st, 0.00013, 0)

    # Seam along the inside of the forearm: a raised ridge with stitching either side.
    seam_d = (math.pi - np.abs(around)) * radius
    height += 0.0003 * smoothstep(0.0025, 0.0008, seam_d)
    for off in (0.0017,):
        st = (np.abs(seam_d - off) < 0.00026) & dashes(t, 0.0032, 0.66) & (t > 0.02)
        color[st] = thread
        height += np.where(st, 0.00012, 0)

    # Uneven dye and wear.
    color *= (1 + 0.05 * low_noise(p, 0.04, 5) + 0.025 * low_noise(p, 0.008, 6))[:, None]
    rough = np.clip(rough + 0.03 * low_noise(p, 0.02, 7), 0, 1)
    color *= (1 - 0.3 * np.clip(-height / 0.0003, 0, 1))[:, None]
    return color, rough, height


def cuff_tab(name, sleeve, frame):
    """Velcro adjustment tab on the outside of the cuff."""
    start, f, e1, e2 = frame
    tree = bvh(sleeve)
    center_angle = 0.25

    def point(i, j):
        u = -1 + 2 * i / 17
        v = -1 + 2 * j / 21
        shape = abs(u) ** 4 + (abs(v) ** 3 if v > 0 else abs(v) ** 6)
        if shape > 1:
            return None
        t = 0.017 + u * 0.014
        ang = center_angle + v * 0.4
        d = e1 * math.cos(ang) + e2 * math.sin(ang)
        origin = start + f * t + d * 0.08
        hit, normal, _, _ = tree.ray_cast(Vector(origin), Vector(-d), 0.1)
        if hit is None:
            return None
        lift = 0.0004 + 0.0014 * smoothstep(1.0, 0.6, shape)
        return np.array(hit) + np.array(normal) * lift

    tab = grid_patch(name, 18, 22, point)
    tab.data.polygons.foreach_set('use_smooth', [True] * len(tab.data.polygons))
    plain_material(tab, '#454b38', 0.95)
    return tab


# --- Build --------------------------------------------------------------------

def main():
    started = time.time()
    reset_scene()
    with open(os.path.join(BASE_DIR, 'rig.json')) as f:
        rig = json.load(f)

    pistol = mesh_object('pistol', *read_obj(os.path.join(BASE_DIR, 'pistol.obj')))
    keep = []
    textured = []

    for side in ('right', 'left'):
        hand = rig[side]
        log(side, 'glove')
        glove = mesh_object(f'{side}_glove', *read_obj(os.path.join(BASE_DIR, f'{side}_glove.obj')))
        decimate(glove, GLOVE_TRIANGLES)
        uv_unwrap(glove)
        keep += [glove, knuckle_guard(f'{side}_knuckle_guard', glove, hand), *wrist_strap(f'{side}_strap', hand)]
        textured.append((glove, lambda p, hand=hand: glove_maps(p, hand, rig['grip'])))

        log(side, 'sleeve')
        frame = sleeve_frame(hand, side)
        sleeve = mesh_object(f'{side}_sleeve', *read_obj(os.path.join(BASE_DIR, f'{side}_sleeve.obj')))
        voxel_remesh(sleeve, 0.0015)
        add_folds(sleeve, frame)
        decimate(sleeve, SLEEVE_TRIANGLES)
        uv_unwrap(sleeve)
        keep += [sleeve, cuff_tab(f'{side}_cuff_tab', sleeve, frame)]
        textured.append((sleeve, lambda p, frame=frame: sleeve_maps(p, frame)))

    for obj, make_maps in textured:
        log('textures for', obj.name)
        p = bake_positions(obj)
        color, rough, height = make_maps(p)
        normal_image = bake_normal_from_height(obj, height)
        ao = bake_ao(obj)
        color = color * (0.3 + 0.7 * ao)[:, None]
        textured_material(obj, color, rough, normal_image)

    bpy.data.objects.remove(pistol)
    for obj in keep:
        obj.select_set(True)
    os.makedirs(os.path.dirname(os.path.abspath(OUT_GLB)), exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=os.path.abspath(OUT_GLB),
        export_format='GLB',
        use_selection=True,
        export_yup=True,
        export_apply=True,
        export_tangents=True,
        export_image_format='WEBP',
        export_image_quality=88,
        export_draco_mesh_compression_enable=True,
        export_draco_mesh_compression_level=7,
        export_animations=False,
    )
    log('wrote', OUT_GLB, f'{os.path.getsize(OUT_GLB) / 1e6:.1f} MB')
    if BLEND:
        os.makedirs(os.path.dirname(os.path.abspath(BLEND)), exist_ok=True)
        bpy.ops.file.pack_all()
        bpy.ops.wm.save_as_mainfile(filepath=os.path.abspath(BLEND))
        log('saved', BLEND)
    log(f'done in {time.time() - started:.0f} s')


main()
