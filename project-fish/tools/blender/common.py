"""Shared helpers for the Project Fish Blender build scripts: scene set-up,
mesh helpers, texture baking and materials. Units are metres; Blender is Z up.
"""

import math
import os
import tempfile
import time

import bpy
import numpy as np
from mathutils.bvhtree import BVHTree

# Texture size and ambient occlusion quality; the build scripts set these.
SETTINGS = {'size': 1024, 'ao_samples': 48}


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


def low_noise(p, wavelength, seed, waves=16):
    """Smooth 3D noise (roughly -1..1): many waves in random directions, so it
    looks like natural blotches rather than stripes."""
    rng = np.random.default_rng(seed)
    total = np.zeros(len(p))
    for _ in range(waves):
        k = unit(rng.normal(size=3)) * (2 * math.pi / wavelength) * rng.uniform(0.6, 1.6)
        total += np.sin(p @ k + rng.uniform(0, 2 * math.pi))
    return total / (1.5 * math.sqrt(waves / 2))


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
    mesh.name = obj.name
    mesh.polygons.foreach_set('use_smooth', [True] * len(mesh.polygons))


def triangle_count(obj):
    return sum(len(p.vertices) - 2 for p in obj.data.polygons)


def decimate(obj, triangles):
    mod = obj.modifiers.new('Decimate', 'DECIMATE')
    mod.ratio = min(1.0, triangles / triangle_count(obj))
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


def new_image(name, float_buffer=False, color=False):
    image = bpy.data.images.new(name, SETTINGS['size'], SETTINGS['size'], alpha=False, float_buffer=float_buffer)
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
    a = np.empty(SETTINGS['size'] ** 2 * 4, np.float32)
    image.pixels.foreach_get(a)
    return a.reshape(SETTINGS['size'], SETTINGS['size'], 4)


def set_pixels(image, rgb):
    rgba = np.ones((SETTINGS['size'], SETTINGS['size'], 4), np.float32)
    rgba[..., :3] = rgb.reshape(SETTINGS['size'], SETTINGS['size'], -1)
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


def bake_world_normals(obj):
    """Smooth world-space surface normal of every texel."""
    image = new_image(f'{obj.name}_wnormal', float_buffer=True)

    def nodes_for(nodes, links):
        geo = nodes.new('ShaderNodeNewGeometry')
        scale = nodes.new('ShaderNodeVectorMath')
        scale.operation = 'MULTIPLY_ADD'
        scale.inputs[1].default_value = (0.5, 0.5, 0.5)
        scale.inputs[2].default_value = (0.5, 0.5, 0.5)
        links.new(geo.outputs['Normal'], scale.inputs[0])
        emit = nodes.new('ShaderNodeEmission')
        links.new(scale.outputs[0], emit.inputs['Color'])
        return emit.outputs[0]

    bake(obj, image, 'EMIT', nodes_for)
    n = (pixels(image)[..., :3].astype(np.float64) - 0.5) * 2
    bpy.data.images.remove(image)
    return n.reshape(-1, 3)


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
    bake(obj, image, 'AO', samples=SETTINGS['ao_samples'])
    ao = pixels(image)[..., 0].astype(np.float64)
    bpy.data.images.remove(image)
    # Soften the sampling noise a little.
    blurred = ao.copy()
    for axis in (0, 1):
        blurred = (np.roll(blurred, 1, axis) + 2 * blurred + np.roll(blurred, -1, axis)) / 4
    return blurred.reshape(-1)


def textured_material(obj, color, roughness, normal_image, metallic=0.0):
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
    bsdf.inputs['Metallic'].default_value = metallic
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


def plain_material(obj, hex_color, roughness, metallic=0.0, emission=0.0):
    mat = bpy.data.materials.new(obj.name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes['Principled BSDF']
    bsdf.inputs['Base Color'].default_value = (*srgb_to_linear(hex_color), 1)
    bsdf.inputs['Roughness'].default_value = roughness
    bsdf.inputs['Metallic'].default_value = metallic
    if emission:
        bsdf.inputs['Emission Color'].default_value = (*srgb_to_linear(hex_color), 1)
        bsdf.inputs['Emission Strength'].default_value = emission
    obj.data.materials.clear()
    obj.data.materials.append(mat)
