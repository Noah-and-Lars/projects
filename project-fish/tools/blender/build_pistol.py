"""Builds the detailed pistol for Project Fish in Blender.

Run from the project-fish folder (see package.json, "build-pistol"):

    node tools/export-arm-base.mjs build/arm-base
    blender --background --python tools/blender/build_pistol.py -- build/arm-base/pistol.json build/pistol-raw.glb --blend build/pistol.blend

It uses the same side profiles as the game's built-in pistol (pistol.js), so
the hands still fit, and adds:

- Rounded machined edges everywhere, chamfered top edges on the slide, and a
  rounded grip that fills the hand.
- Real cuts: ejection port with the barrel hood inside, angled cocking
  serrations front and back, recessed barrel crown and bore, rear sight notch,
  accessory rail slots under the frame.
- Small parts: three-dot sights, extractor, striker plate, slide stop,
  takedown levers, magazine release, pins, trigger with safety blade.
- Textures: worn bare-metal edges on the slide, stippled grip, slightly
  glossier worn edges on the polymer, and baked ambient occlusion.

Profiles are in game units: (s, y) with s = distance forward (-z) and y up.
In Blender that's simply (x, y, z) = (side, s, y).
"""

import json
import math
import os
import sys
import time

import bpy
import bmesh
import numpy as np
from mathutils import Matrix

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import (  # noqa: E402
    SETTINGS, apply_modifiers, bake_ao, bake_normal_from_height, bake_positions,
    bake_world_normals, log, low_noise, plain_material, reset_scene, select_only,
    smoothstep, srgb_to_linear, textured_material, uv_unwrap,
)

ARGS = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else sys.argv[1:]
PROFILES_JSON, OUT_GLB = ARGS[0], ARGS[1]
BLEND = ARGS[ARGS.index('--blend') + 1] if '--blend' in ARGS else None
SETTINGS['size'] = int(ARGS[ARGS.index('--size') + 1]) if '--size' in ARGS else 1024
SETTINGS['ao_samples'] = int(ARGS[ARGS.index('--ao-samples') + 1]) if '--ao-samples' in ARGS else 64

SLIDE_METAL = '#2a2c30'
BARE_STEEL = '#80838a'
POLYMER = '#1d1e21'
DARK_STEEL = '#16171a'
BARREL = '#5d5a54'
DOT = '#f2f2e6'

SLIDE_TOP = 0.0165
# Outline of the rounded grip shell: the frame's grip, half a millimetre bigger.
GRIP_SHELL = [(0.0265, -0.0575), (0.0205, -0.075), (0.0115, -0.1), (0.0045, -0.12), (0.0025, -0.1245),
              (-0.0465, -0.1245), (-0.0505, -0.1182), (-0.0345, -0.0575)]
SLIDE_HALF = 0.0245 / 2
FRAME_HALF = 0.0235 / 2


# --- Building blocks ------------------------------------------------------------

def link(obj):
    bpy.context.scene.collection.objects.link(obj)
    return obj


def from_bmesh(name, bm):
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    return link(bpy.data.objects.new(name, mesh))


def prism(name, points, width):
    """A side profile (s, y) pushed out to `width`, centred on x = 0."""
    bm = bmesh.new()
    half = width / 2
    left = [bm.verts.new((-half, s, y)) for s, y in points]
    right = [bm.verts.new((half, s, y)) for s, y in points]
    n = len(points)
    bm.faces.new(left[::-1])
    bm.faces.new(right)
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new((left[i], left[j], right[j], right[i]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return from_bmesh(name, bm)


def box(name, x0, x1, s0, s1, y0, y1):
    obj = prism(name, [(s0, y0), (s1, y0), (s1, y1), (s0, y1)], x1 - x0)
    obj.data.transform(Matrix.Translation(((x0 + x1) / 2, 0, 0)))
    return obj


def cylinder(name, radius, start, end, axis='s', at=(0.0, 0.0), segments=40):
    """A cylinder from start to end along s (forward) or x (sideways).
    `at` is where its axis is: (x, y) for an s cylinder, (s, y) for an x one."""
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=segments, radius1=radius, radius2=radius, depth=end - start)
    # create_cone makes it along Z, centred on 0.
    middle = (start + end) / 2
    if axis == 's':
        bmesh.ops.rotate(bm, verts=bm.verts, cent=(0, 0, 0), matrix=Matrix.Rotation(math.radians(-90), 3, 'X'))
        bmesh.ops.translate(bm, verts=bm.verts, vec=(at[0], middle, at[1]))
    else:
        bmesh.ops.rotate(bm, verts=bm.verts, cent=(0, 0, 0), matrix=Matrix.Rotation(math.radians(90), 3, 'Y'))
        bmesh.ops.translate(bm, verts=bm.verts, vec=(middle, at[0], at[1]))
    return from_bmesh(name, bm)


def wedge(name, tri_xy, s0, s1):
    """A prism with a triangular cross-section in the (x, y) plane, running along s."""
    bm = bmesh.new()
    a = [bm.verts.new((x, s0, y)) for x, y in tri_xy]
    b = [bm.verts.new((x, s1, y)) for x, y in tri_xy]
    bm.faces.new(a[::-1])
    bm.faces.new(b)
    for i in range(3):
        j = (i + 1) % 3
        bm.faces.new((a[i], a[j], b[j], b[i]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return from_bmesh(name, bm)


def join(target, *others):
    select_only(target)
    for o in others:
        o.select_set(True)
    bpy.ops.object.join()
    return target


def bevel(obj, width, segments=3, angle=30):
    mod = obj.modifiers.new('Bevel', 'BEVEL')
    mod.width = width
    mod.segments = segments
    mod.limit_method = 'ANGLE'
    mod.angle_limit = math.radians(angle)
    mod.profile = 0.5
    apply_modifiers(obj)


def cut(obj, *cutters):
    """Removes each cutter's volume from obj."""
    for cutter in cutters:
        mod = obj.modifiers.new('Cut', 'BOOLEAN')
        mod.operation = 'DIFFERENCE'
        mod.solver = 'EXACT'
        mod.object = cutter
        apply_modifiers(obj)
        bpy.data.objects.remove(cutter)


def triangulate(obj):
    mod = obj.modifiers.new('Triangulate', 'TRIANGULATE')
    mod.quad_method = 'BEAUTY'
    mod.ngon_method = 'BEAUTY'
    mod.keep_custom_normals = True
    apply_modifiers(obj)


def sharp_edges(obj, angle=35):
    """Smooth shading, but crisp where faces meet at more than `angle` degrees."""
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    limit = math.radians(angle)
    for e in bm.edges:
        e.smooth = not (e.is_manifold and e.calc_face_angle(0) > limit) and e.is_manifold
    for f in bm.faces:
        f.smooth = True
    bm.to_mesh(obj.data)
    bm.free()


# --- Parts ---------------------------------------------------------------------

def build_slide(p):
    slide = prism('slide', p['slide']['points'], p['slide']['width'])
    bevel(slide, 0.0007)

    cutters = []
    # Chamfers along both top edges.
    c = 0.0019
    for side in (-1, 1):
        xe = side * SLIDE_HALF
        tri = [(xe - side * c, SLIDE_TOP + 0.0005), (xe + side * 0.0005, SLIDE_TOP + 0.0005), (xe + side * 0.0005, SLIDE_TOP - c)]
        cutters.append(wedge('chamfer', tri if side > 0 else tri[::-1], -0.04, 0.16))
    # Ejection port: top and right side, with the barrel hood showing inside.
    cutters.append(box('port', -0.0034, 0.02, 0.006, 0.044, 0.0062, 0.03))
    # Cocking serrations, front and back, both sides: V grooves leaning forward a little.
    for side in (-1, 1):
        xe = side * SLIDE_HALF
        for s0, count in ((-0.0265, 9), (0.113, 6)):
            for k in range(count):
                s = s0 + k * 0.0024
                bm = bmesh.new()
                pts = [(xe + side * 0.0005, s - 0.00065), (xe - side * 0.00085, s), (xe + side * 0.0005, s + 0.00065)]
                lean = 0.0012
                lo = [bm.verts.new((x, ss, -0.0072)) for x, ss in pts]
                hi = [bm.verts.new((x, ss + lean, 0.0128)) for x, ss in pts]
                bm.faces.new(lo[::-1])
                bm.faces.new(hi)
                for i in range(3):
                    j = (i + 1) % 3
                    bm.faces.new((lo[i], lo[j], hi[j], hi[i]))
                bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
                cutters.append(from_bmesh('serration', bm))
    # Recess at the muzzle for the barrel crown.
    cutters.append(cylinder('recess', 0.0069, 0.1475, 0.16))
    cut(slide, *cutters)

    parts = []
    # Barrel: hood in the ejection port, crown and bore at the muzzle.
    parts.append(box('hood', -0.0056, 0.0056, 0.0066, 0.0436, -0.004, 0.0122))
    barrel = cylinder('barrel', 0.0065, 0.13, 0.1505)
    cut(barrel, cylinder('bore', 0.0046, 0.12, 0.16))
    bevel(barrel, 0.0004, 2)
    parts.append(barrel)
    # Rear sight with a U notch, front sight post.
    rear = box('rear_sight', -0.0082, 0.0082, -0.0248, -0.0168, SLIDE_TOP - 0.001, SLIDE_TOP + 0.0058)
    cut(rear, box('notch', -0.0018, 0.0018, -0.03, -0.01, SLIDE_TOP + 0.0026, 0.04))
    bevel(rear, 0.0004, 2)
    front = box('front_sight', -0.0017, 0.0017, 0.1376, 0.1438, SLIDE_TOP - 0.001, SLIDE_TOP + 0.0052)
    bevel(front, 0.0004, 2)
    # Extractor on the right, striker plate at the back.
    extractor = box('extractor', 0.0115, 0.0129, 0.009, 0.031, 0.0035, 0.0082)
    bevel(extractor, 0.0003, 2)
    plate = box('striker_plate', -0.0076, 0.0076, -0.0326, -0.0306, -0.0082, 0.0108)
    bevel(plate, 0.0004, 2)
    parts += [rear, front, extractor, plate]
    join(slide, *parts)
    sharp_edges(slide)

    # The sight dots, on the faces towards the shooter: separate, so they can glow a little.
    dots = []
    for x, s, y in ((-0.005, -0.0248, SLIDE_TOP + 0.0031), (0.005, -0.0248, SLIDE_TOP + 0.0031), (0.0, 0.1376, SLIDE_TOP + 0.0034)):
        d = cylinder('dot', 0.00098 if x else 0.0011, s - 0.00025, s + 0.0002, at=(x, y), segments=20)
        dots.append(d)
    sight_dots = join(dots[0], *dots[1:])
    sight_dots.name = 'sight_dots'
    sight_dots.data.name = 'sight_dots'
    plain_material(sight_dots, DOT, 0.4, emission=0.6)
    return slide, sight_dots


def build_frame(p):
    frame = prism('frame', p['frame']['points'], p['frame']['width'])
    bevel(frame, 0.0008)
    guard = prism('guard_hole', p['frame']['holes'][0], 0.05)
    rail = [box('rail_slot', -0.02, 0.02, s, s + 0.0032, -0.03, -0.0255) for s in (0.098, 0.1155)]
    side_grooves = [box('rail_groove', side * FRAME_HALF - 0.0008, side * FRAME_HALF + 0.002, 0.09, 0.14, -0.0232, -0.0214) for side in (-1, 1)]
    cut(frame, guard, *rail, *side_grooves)

    # A rounded grip shell over the frame's square-edged grip, so it fills the hand.
    grip = prism('grip', GRIP_SHELL, p['grip']['width'])
    bevel(grip, 0.0055, 6, 25)
    join(frame, grip)
    sharp_edges(frame, 40)
    return frame


def build_small_parts(p):
    trigger = prism('trigger', p['trigger']['points'], p['trigger']['width'])
    bevel(trigger, 0.0007, 2)
    blade = box('safety_blade', -0.0011, 0.0011, 0.0545, 0.0595, -0.0555, -0.039)
    bevel(blade, 0.0003, 2)
    join(trigger, blade)
    sharp_edges(trigger)
    plain_material(trigger, POLYMER, 0.55)

    magazine = prism('magazine', p['magazine']['points'], p['magazine']['width'])
    bevel(magazine, 0.0012, 3)
    sharp_edges(magazine)
    plain_material(magazine, POLYMER, 0.6)

    controls = [
        box('slide_stop', -FRAME_HALF - 0.0021, -FRAME_HALF + 0.0004, -0.007, 0.0135, -0.0168, -0.0118),
        box('slide_stop_pad', -FRAME_HALF - 0.0029, -FRAME_HALF, -0.006, 0.0, -0.0166, -0.0122),
        box('takedown_l', -FRAME_HALF - 0.0014, -FRAME_HALF + 0.0004, 0.0425, 0.052, -0.0178, -0.0142),
        box('takedown_r', FRAME_HALF - 0.0004, FRAME_HALF + 0.0014, 0.0425, 0.052, -0.0178, -0.0142),
        box('mag_release', -FRAME_HALF - 0.0018, -FRAME_HALF + 0.0004, 0.0198, 0.026, -0.0435, -0.0365),
    ]
    for c in controls:
        bevel(c, 0.00035, 2)
    controls_obj = join(controls[0], *controls[1:])
    controls_obj.name = controls_obj.data.name = 'controls'
    sharp_edges(controls_obj)
    plain_material(controls_obj, DARK_STEEL, 0.42, metallic=0.7)

    pins = [cylinder('pin', 0.0013, -FRAME_HALF - 0.0003, FRAME_HALF + 0.0003, axis='x', at=(s, y), segments=18)
            for s, y in ((0.041, -0.0176), (0.0122, -0.0206))]
    pins_obj = join(pins[0], *pins[1:])
    pins_obj.name = pins_obj.data.name = 'pins'
    sharp_edges(pins_obj)
    plain_material(pins_obj, '#4a4b4f', 0.35, metallic=1.0)
    return [trigger, magazine, controls_obj, pins_obj]


# --- Textures -----------------------------------------------------------------

def convexity(p, n):
    """How sharply the surface curves outwards at each texel (edges are high)."""
    size = SETTINGS['size']
    P = p.reshape(size, size, 3)
    N = n.reshape(size, size, 3)
    total = np.zeros((size, size))
    count = np.zeros((size, size))
    for axis in (0, 1):
        for step in (1, -1):
            dp = np.roll(P, step, axis) - P
            dn = np.roll(N, step, axis) - N
            dist = np.linalg.norm(dp, axis=2)
            ok = (dist > 1e-6) & (dist < 0.0012)  # same UV island
            # Normals spreading apart along the surface = convex edge.
            c = np.where(ok, np.sum(dn * dp, axis=2) / np.maximum(dist, 1e-6) ** 2, 0)
            total += c
            count += ok
    return (total / np.maximum(count, 1)).reshape(-1)


def slide_maps(p, n):
    count = len(p)
    metal, steel = srgb_to_linear(SLIDE_METAL), srgb_to_linear(BARE_STEEL)
    curve = convexity(p, n)
    # Bare steel where the finish has worn off the sharpest edges, a bit patchy.
    patchy = 0.55 + 0.45 * low_noise(p, 0.006, 21)
    wear = np.clip(smoothstep(250, 900, curve) * patchy, 0, 1)
    color = metal * (1 - wear[:, None]) + steel * wear[:, None]
    rough = 0.36 * (1 - wear) + 0.2 * wear
    # Fine lengthwise polishing marks and slight unevenness.
    rough += 0.035 * low_noise(p * np.array([30, 1, 30]), 0.02, 22)
    color *= (1 + 0.04 * low_noise(p, 0.03, 23))[:, None]
    # Striker plate at the back is polymer.
    plate = (p[:, 1] < -0.0302) & (np.abs(p[:, 0]) < 0.0078)
    color[plate] = srgb_to_linear(POLYMER)
    rough[plate] = 0.6
    return color, np.clip(rough, 0.05, 1), np.zeros(count)


def inside_polygon(xs, ys, polygon):
    """Which points (xs, ys) are inside the polygon (even-odd rule)."""
    result = np.zeros(len(xs), bool)
    n = len(polygon)
    for i in range(n):
        (x0, y0), (x1, y1) = polygon[i], polygon[(i + 1) % n]
        crosses = (y0 > ys) != (y1 > ys)
        x_at = x0 + (ys - y0) * (x1 - x0) / ((y1 - y0) or 1e-12)
        result ^= crosses & (xs < x_at)
    return result


def stipple(u, v, cell=0.0009, seed=5):
    """Raised dots scattered over a surface, from 2D surface coordinates."""
    rng = np.random.default_rng(seed)
    table = rng.random((64, 64, 2))
    iu, iv = np.floor(u / cell).astype(int), np.floor(v / cell).astype(int)
    nearest = np.full(len(u), 9.0)
    for du in (-1, 0, 1):
        for dv in (-1, 0, 1):
            cu, cv = iu + du, iv + dv
            jitter = table[cu % 64, cv % 64]
            pu = (cu + 0.15 + 0.7 * jitter[:, 0]) * cell
            pv = (cv + 0.15 + 0.7 * jitter[:, 1]) * cell
            nearest = np.minimum(nearest, np.hypot(u - pu, v - pv))
    return smoothstep(cell * 0.42, cell * 0.12, nearest)


def frame_maps(p, n, profiles):
    count = len(p)
    color = np.tile(srgb_to_linear(POLYMER), (count, 1))
    curve = convexity(p, n)
    edge = np.clip(smoothstep(300, 1100, curve), 0, 1)
    # Polymer goes slightly glossy and lighter where hands rub the edges.
    rough = 0.64 - 0.2 * edge + 0.03 * low_noise(p, 0.015, 31)
    color *= (1 + 0.25 * edge + 0.04 * low_noise(p, 0.03, 32))[:, None]
    height = np.zeros(count)

    # Stippling on the grip panels: inside the panel outline, on its outer surfaces.
    in_panel = inside_polygon(p[:, 1], p[:, 2], profiles['grip']['points']) & (np.abs(p[:, 0]) > FRAME_HALF - 0.0002)
    side_facing = np.abs(n[:, 0]) > 0.6
    u = np.where(side_facing, p[:, 1], p[:, 0])
    v = p[:, 2]
    dots = stipple(u, v)
    fade = smoothstep(0.0, 0.0015, np.minimum(np.abs(p[:, 0]) - FRAME_HALF, 1))
    height += np.where(in_panel, 0.00011 * dots * fade, 0)
    rough = np.where(in_panel, rough + 0.12, rough)
    color = np.where(in_panel[:, None], color * (0.95 + 0.1 * dots[:, None]), color)
    return color, np.clip(rough, 0.05, 1), height


# --- Build --------------------------------------------------------------------

def main():
    started = time.time()
    reset_scene()
    with open(PROFILES_JSON) as f:
        profiles = json.load(f)

    log('slide')
    slide, dots = build_slide(profiles)
    log('frame')
    frame = build_frame(profiles)
    small = build_small_parts(profiles)

    for obj, make_maps, metallic in ((slide, lambda p, n: slide_maps(p, n), 1.0),
                                     (frame, lambda p, n: frame_maps(p, n, profiles), 0.0)):
        log('textures for', obj.name, f'({sum(len(f.vertices) - 2 for f in obj.data.polygons)} triangles)')
        triangulate(obj)
        sharp_edges(obj, 35 if obj is slide else 40)
        uv_unwrap(obj)
        p = bake_positions(obj)
        n = bake_world_normals(obj)
        color, rough, height = make_maps(p, n)
        normal_image = bake_normal_from_height(obj, height)
        ao = bake_ao(obj)
        color = color * (0.35 + 0.65 * ao)[:, None]
        textured_material(obj, color, rough, normal_image, metallic=metallic)

    # Hierarchy: the slide (with its sight dots) moves on its own when firing.
    root = link(bpy.data.objects.new('pistol', None))
    for obj in (slide, frame, *small):
        obj.parent = root
    dots.parent = slide

    for o in bpy.context.scene.objects:
        o.select_set(True)
    os.makedirs(os.path.dirname(os.path.abspath(OUT_GLB)), exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=os.path.abspath(OUT_GLB),
        export_format='GLB',
        use_selection=True,
        export_yup=True,
        export_apply=True,
        export_tangents=True,
        export_image_format='WEBP',
        export_image_quality=90,
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
