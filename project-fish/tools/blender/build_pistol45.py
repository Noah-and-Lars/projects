"""Builds the second pistol for Project Fish in Blender: a classic
single-action .45 in the style of the 1911 (made-up markings, no real
maker's).

Run from the project-fish folder (see package.json, "build-pistol45"):

    node tools/export-arm-base.mjs build/arm-base
    blender --background --python tools/blender/build_pistol45.py -- build/arm-base/pistol45.json build/pistol45-raw.glb --blend build/pistol45.blend

It uses the side profiles in src/viewmodel/pistol45.js, so its grip,
trigger and controls sit where the game's hands expect them, and adds:

- A crisp, slab-sided slide with vertical rear serrations, an ejection
  port well forward (hollow underneath, with the chamber and the round in it),
  a barrel bushing and recoil spring plug at the muzzle, a notch for the
  slide stop, the firing pin stop and extractor at the back, plain black
  sights (a blade at the front, a square notch at the back) and engraved
  markings.
- A steel frame with a rounded trigger guard, the grip safety's curved
  beavertail, an arched mainspring housing with vertical serrations and a
  lanyard loop, finger reliefs behind the trigger, a magazine well, a slot
  for the hammer and a (made-up) serial number.
- Separate parts the game moves: the slide, barrel, hammer (cocked and
  falling), trigger, slide stop, thumb safety, magazine (single stack, with
  witness holes, the top round and the follower) and the round in the
  chamber.
- Checkered walnut grip panels with a smooth diamond round each screw, and
  slotted screws.
- A worn blued finish: bare steel on edges and high points, holster wear
  and scratches; and baked ambient occlusion.

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
from mathutils import Matrix, Vector

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import (  # noqa: E402
    SETTINGS, apply_modifiers, bake_ao, bake_normal_from_height, bake_positions, bake_world_normals, log,
    low_noise, plain_material, reset_scene, smoothstep, srgb_to_linear, textured_material, uv_unwrap,
)
from shapes import (  # noqa: E402
    bevel, box, convexity, cut, cylinder, distance_to_outline, ellipsoid, engrave, extrude_xy, from_bmesh,
    inside_polygon, join, lerp_color, link, prism, rounded_corner, scratches, set_pivot,
    sharp_edges, triangulate, wedge,
)

ARGS = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else sys.argv[1:]
PROFILES_JSON, OUT_GLB = ARGS[0], ARGS[1]
BLEND = ARGS[ARGS.index('--blend') + 1] if '--blend' in ARGS else None

# Colours (sRGB hex): blued steel and where it's worn, walnut, brass.
BLUED = '#26282c'
BARE_STEEL = '#85888e'
WORN_FINISH = '#4a4d52'
DARK_STEEL = '#17181b'
BARREL_STEEL = '#55534f'
WALNUT = '#35231a'
WALNUT_DARK = '#1f1209'
BRASS = '#c9a04a'
COPPER = '#b8733a'

with open(PROFILES_JSON) as f:
    P = json.load(f)
SLIDE_HALF = P['slide']['width'] / 2
SLIDE_TOP = P['slideInfo']['top']
SLIDE_FRONT = -P['slideInfo']['front']  # s of the muzzle end
NOSE_FROM = P['slideInfo']['noseFrom']
NOSE_BOTTOM = P['slideInfo']['noseBottom']
FRAME_HALF = P['frame']['width'] / 2
SIGHT_TOP = P['sights']['height']
TOP_ROUND = 0.0052  # radius the top edges of the slide are rounded to (flat sides, rounded top)
# The breech face, with the slide forward: the 1911's long extractor puts it
# well forward of the back of the slide. The barrel runs 127 mm from here.
BREECH = 0.0362
BARREL_LEN = 0.127
PORT = (BREECH - 0.0004, BREECH + 0.0345)  # the ejection port (s)
PLUG_Y = -0.0168  # height of the recoil spring plug's centre

# Where the grip screws are (s, y): one near the top, one near the bottom of
# each panel, on the grip's centre line.
SCREWS = [(-0.0022, -0.0375), (-0.018, -0.1035)]

# The .45 round: case and bullet radii and lengths.
CASE_R, CASE_LEN = 0.006, 0.0228
BULLET_R, ROUND_LEN = 0.0057, 0.0324


def round_45(name, s0, at=(0.0, 0.0)):
    """A .45 round lying along s with the back of its case at s0: brass case
    with its rim, extractor groove and primer, and a round-nosed bullet."""
    rim = cylinder('rim', CASE_R, s0, s0 + 0.0012, at=at, segments=28)
    groove = cylinder('groove', CASE_R - 0.0008, s0 + 0.0012, s0 + 0.0024, at=at, segments=28)
    body = cylinder('case', CASE_R, s0 + 0.0024, s0 + CASE_LEN, at=at, segments=28, end_radius=CASE_R - 0.0001)
    bevel(rim, 0.0003, 2)
    case = join(rim, groove, body)
    plain_material(case, BRASS, 0.3, metallic=0.85)
    primer = cylinder('primer', 0.0022, s0 - 0.0001, s0 + 0.0003, at=at, segments=20)
    plain_material(primer, '#b9b4aa', 0.35, metallic=0.9)
    nose_len = ROUND_LEN - CASE_LEN
    shank = cylinder('bullet', BULLET_R, s0 + CASE_LEN, s0 + CASE_LEN + nose_len * 0.35, at=at, segments=24)
    nose = cylinder('nose', BULLET_R, s0 + CASE_LEN + nose_len * 0.35, s0 + CASE_LEN + nose_len * 0.8, at=at, segments=24, end_radius=0.0038)
    tip = cylinder('tip', 0.0038, s0 + CASE_LEN + nose_len * 0.8, s0 + ROUND_LEN, at=at, segments=24, end_radius=0.0014)
    bullet = join(shank, nose, tip)
    plain_material(bullet, COPPER, 0.35, metallic=0.9)
    out = join(case, primer, bullet)
    out.name = out.data.name = name
    return out


# --- Slide and barrel ------------------------------------------------------------

def build_slide():
    slide = prism('slide', P['slide']['points'], P['slide']['width'])
    bevel(slide, 0.0011, 3)
    cutters = []
    # The rounded top: both top corners turned off along the whole length.
    for side in (-1, 1):
        cutters.append(extrude_xy('round_top', rounded_corner(side * SLIDE_HALF, SLIDE_TOP, TOP_ROUND, side, 1, steps=14), -0.04, 0.18))
    # The nose under the barrel is rounded underneath, round the recoil spring.
    for side in (-1, 1):
        cutters.append(extrude_xy('round_nose', rounded_corner(side * SLIDE_HALF, NOSE_BOTTOM, 0.0085, side, -1, steps=14), NOSE_FROM - 0.002, 0.18))
    # Ejection port: a small one in the right side and the top, with the
    # barrel showing in it.
    cutters.append(box('port', 0.0008, 0.02, PORT[0], PORT[1], 0.0046, 0.03))
    # Under the port the slide is hollow round the chamber, so with the slide
    # back the chamber, and the round in it, can be seen.
    cutters.append(box('breech', -0.0064, 0.0064, PORT[0], PORT[1], -0.0082, 0.003))
    # Rear serrations: eighteen fine vertical V grooves each side.
    for side in (-1, 1):
        xe = side * SLIDE_HALF
        for k in range(18):
            s = -0.0287 + k * 0.00125
            tri = [(xe + side * 0.0005, s - 0.00042), (xe - side * 0.00052, s), (xe + side * 0.0005, s + 0.00042)]
            bm = bmesh.new()
            lo = [bm.verts.new((x, ss, -0.0088)) for x, ss in tri]
            hi = [bm.verts.new((x, ss, SLIDE_TOP - TOP_ROUND + 0.0004)) for x, ss in tri]
            bm.faces.new(lo[::-1])
            bm.faces.new(hi)
            for i in range(3):
                j = (i + 1) % 3
                bm.faces.new((lo[i], lo[j], hi[j], hi[i]))
            bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
            cutters.append(from_bmesh('serration', bm))
    # The muzzle end: a seat for the barrel bushing, and the hole the recoil
    # spring plug sits in under it.
    cutters.append(cylinder('bushing_seat', 0.0099, SLIDE_FRONT - 0.0012, SLIDE_FRONT + 0.01))
    cutters.append(cylinder('plug_hole', 0.0055, SLIDE_FRONT - 0.008, SLIDE_FRONT + 0.01, at=(0.0, PLUG_Y)))
    # The notch on the bottom left the slide stop rises into when the slide
    # locks back.
    cutters.append(cylinder('stop_notch', 0.0042, -SLIDE_HALF - 0.001, -SLIDE_HALF + 0.003, axis='x', at=(0.0675, -0.0105)))
    # The firing pin stop on the back face: its seam, the firing pin's end,
    # and the extractor's tail.
    for x0, x1, y0, y1 in ((-0.0061, -0.0057, -0.0078, 0.0112), (0.0057, 0.0061, -0.0078, 0.0112), (-0.0061, 0.0061, -0.0078, -0.0074)):
        cutters.append(box('stop_seam', x0, x1, -0.0352, -0.0335, y0, y1))
    cutters.append(cylinder('firing_pin', 0.0019, -0.0352, -0.0338))
    cutters.append(cylinder('extractor_tail', 0.0017, -0.0352, -0.0339, at=(0.0046, 0.004)))
    cut(slide, *cutters)
    # Markings (made up): the model on the left with the calibre in front of
    # it, and the model again on the right.
    engrave(slide, 'PF-45', 0.005, (-SLIDE_HALF, 0.06, 0.0012), (0, -1, 0), (0, 0, 1), depth=0.00022)
    engrave(slide, 'CAL .45', 0.0024, (-SLIDE_HALF, 0.1, 0.0016), (0, -1, 0), (0, 0, 1), depth=0.00018)
    engrave(slide, 'MODEL PF-45', 0.0026, (SLIDE_HALF, 0.1, 0.0012), (0, 1, 0), (0, 0, 1), depth=0.00018)

    # Small sights in dovetails: a square-notched rear sight and a thin front
    # blade with a sloped face towards the muzzle.
    rear_s = -P['sights']['rearZ']
    rear = box('rear_sight', -0.0047, 0.0047, rear_s, rear_s + 0.0065, SLIDE_TOP - 0.0012, SIGHT_TOP)
    cut(rear, box('notch', -0.0011, 0.0011, -0.04, 0.0, SIGHT_TOP - 0.0017, 0.04))
    bevel(rear, 0.0003, 2)
    front_s = -P['sights']['frontZ']
    front = box('front_sight', -0.001, 0.001, front_s, front_s + 0.0058, SLIDE_TOP - 0.0012, SIGHT_TOP)
    cut(front, prism('ramp', [(front_s + 0.0022, SIGHT_TOP + 0.002), (front_s + 0.0075, SIGHT_TOP + 0.002), (front_s + 0.0075, SLIDE_TOP + 0.0004)], 0.006))
    bevel(front, 0.0003, 2)
    join(slide, rear, front)
    sharp_edges(slide)

    # The barrel: a separate part, as it only follows the slide a little way.
    # Its back end shows in the ejection port; the bushing holds its muzzle.
    hood = cylinder('hood', 0.0077, BREECH + 0.0004, BREECH + 0.037, segments=40)
    tube = cylinder('tube', 0.0074, BREECH + 0.036, BREECH + BARREL_LEN, segments=40)
    barrel = join(hood, tube)
    cut(barrel, cylinder('chamber', 0.0062, BREECH - 0.001, BREECH + 0.024, segments=32))
    cut(barrel, cylinder('bore', 0.0057, BREECH + 0.06, SLIDE_FRONT + 0.01, segments=32))
    engrave(barrel, '45 AUTO', 0.0026, (0.0, BREECH + 0.021, 0.0077), (0, 1, 0), (1, 0, 0), depth=0.00018)
    sharp_edges(barrel)
    plain_material(barrel, BARREL_STEEL, 0.3, metallic=1.0)
    barrel.name = barrel.data.name = 'barrel'
    # The round in the chamber, drawn back with the slide when it's eased back.
    chamber_round = round_45('chamber_round', BREECH + 0.0006)
    chamber_round.parent = barrel

    # The bushing round the muzzle and the recoil spring plug under it.
    bushing = cylinder('bushing', 0.0098, SLIDE_FRONT - 0.0011, SLIDE_FRONT + 0.0008, segments=40)
    cut(bushing, cylinder('bushing_hole', 0.00745, SLIDE_FRONT - 0.003, SLIDE_FRONT + 0.003, segments=40))
    bevel(bushing, 0.0003, 2)
    plug = cylinder('plug', 0.0052, SLIDE_FRONT - 0.0075, SLIDE_FRONT - 0.0004, at=(0.0, PLUG_Y), segments=32)
    cut(plug, cylinder('plug_dish', 0.0036, SLIDE_FRONT - 0.0012, SLIDE_FRONT + 0.002, at=(0.0, PLUG_Y), segments=24))
    bevel(plug, 0.0003, 2)
    muzzle = join(bushing, plug)
    muzzle.name = muzzle.data.name = 'muzzle_parts'
    sharp_edges(muzzle)
    plain_material(muzzle, '#3b3c40', 0.32, metallic=1.0)
    return slide, barrel, muzzle


# --- Frame -----------------------------------------------------------------------

def build_frame():
    frame = prism('frame', P['frame']['points'], P['frame']['width'])
    bevel(frame, 0.0016, 4)
    guard = prism('guard_hole', P['frame']['holes'][0], 0.05)
    cutters = [guard]
    top = P['frame']['points'][0][1]
    # A dark line where the slide sits on the frame: its top edges chamfered.
    cutters += [wedge('gap_line', [(side * (FRAME_HALF + 0.0005), top + 0.0005), (side * (FRAME_HALF + 0.0005), top - 0.0007),
                                   (side * (FRAME_HALF - 0.0007), top + 0.0005)][::side], -0.05, NOSE_FROM + 0.001) for side in (-1, 1)]
    # The slot at the back the hammer sits in, between the frame's tangs, and
    # the one the trigger comes out of.
    # The front strap is well rounded across.
    for side in (-1, 1):
        cutters.append(round_along('round_strap', (side * FRAME_HALF, 0.0), 0.0058, side, -1, (0.026, -0.0605), (0.0055, -0.1205)))
    for side in (-1, 1):
        cutters.append(extrude_xy('round_dust_cover', rounded_corner(side * FRAME_HALF, NOSE_BOTTOM, 0.0065, side, -1, steps=12), 0.084, NOSE_FROM + 0.002))
    cutters.append(box('hammer_slot', -0.0037, 0.0037, -0.065, -0.0336, -0.0262, 0.02))
    cutters.append(box('trigger_slot', -0.0034, 0.0034, 0.0498, 0.0595, -0.031, -0.0262))
    # The magazine well, open at the bottom.
    mag = P['magazine']
    # (The body's outline, carried on down past the bottom of the grip.)
    body = [list(c) for c in mag['body']]
    for i in (0, 3):
        body[i] = [body[i][0] + (-0.13 - body[i][1]) * mag['slope'], -0.13]
    well = prism('well', body, mag['width'] + 0.0007)
    cutters.append(well)
    # Seam where the grip safety meets the mainspring housing.
    cutters.append(box('seam', -0.012, 0.012, -0.0385, -0.031, -0.0635, -0.0628))
    # Scallops in both sides behind the trigger, for the finger.
    cutters += [ellipsoid('relief', (side * (FRAME_HALF + 0.0029), 0.0425, -0.0245), (0.0042, 0.0085, 0.0055)) for side in (-1, 1)]
    cut(frame, *cutters)
    # The (made-up) serial number on the right, above the trigger.
    engrave(frame, 'NO. 11045', 0.0022, (FRAME_HALF, 0.064, -0.0185), (0, 1, 0), (0, 0, 1), depth=0.0002)
    # Inside the line, the rail the slide runs on, so the line is dark rather
    # than see-through.
    rail = box('slide_rail', -(FRAME_HALF - 0.0016), FRAME_HALF - 0.0016, -0.033, NOSE_FROM - 0.002, top - 0.0004, -0.01055)
    # The lanyard loop at the bottom of the mainspring housing.
    loop = cylinder('lanyard_loop', 0.0034, -0.0017, 0.0017, axis='x', at=(-0.0428, -0.1222), segments=24)
    cut(loop, cylinder('loop_hole', 0.0019, -0.003, 0.003, axis='x', at=(-0.0428, -0.1229), segments=20))
    bevel(loop, 0.0004, 2)
    join(frame, rail, loop)
    sharp_edges(frame, 40)
    return frame


def panel_pillow(panel, side, inner, width, dome=0.0011):
    """Subdivides a flat grip panel and bulges its outer face out a little,
    most in the middle."""
    mod = panel.modifiers.new('Smooth', 'SUBSURF')
    mod.levels = 2
    mod.render_levels = 2
    apply_modifiers(panel)
    pts = np.array(P['gripPanel']['points'])
    cs, cy = pts.mean(axis=0)
    half = (pts.max(axis=0) - pts.min(axis=0)) / 2
    for v in panel.data.vertices:
        x, s, y = v.co
        outward = (abs(x) - inner) / width  # 0 at the frame, 1 at the outer face
        if outward < 0.5:
            continue
        r = min(1.0, ((s - cs) / half[0]) ** 2 + ((y - cy) / half[1]) ** 2)
        v.co.x += side * dome * (1 - r) * (outward - 0.5) * 2


def round_along(name, corner_xy, radius, sx, sy, a, b, steps=12):
    """Like a round_top cut, but along any straight line in the side view,
    from a to b (s, y): rounds off a long corner of the frame (the front
    strap's edges). corner_xy is the corner's (x, f): f across the line
    (towards the side the corner points, sy)."""
    (s0, y0), (s1, y1) = a, b
    length = math.hypot(s1 - s0, y1 - y0)
    ts, ty = (s1 - s0) / length, (y1 - y0) / length
    fs, fy = ty, -ts  # across the line, to the right of its direction
    cutter = extrude_xy(name, rounded_corner(corner_xy[0], corner_xy[1], radius, sx, sy, steps), -0.003, length + 0.003)
    # Local (x, t, f) to Blender (x, s, y).
    m = Matrix(((1, 0, 0, 0), (0, ts, fs, s0), (0, ty, fy, y0), (0, 0, 0, 1)))
    cutter.data.transform(m)
    return cutter


def build_grips():
    """The two walnut panels, their screws, and nothing else: one object
    for the wood, one for the screws."""
    panels = []
    width, inner = P['gripPanel']['width'], P['gripPanel']['inner']
    for side in (-1, 1):
        panel = prism('grip_panel', P['gripPanel']['points'], width)
        panel.data.transform(Matrix.Translation((side * (inner + width / 2), 0, 0)))
        bevel(panel, 0.0018, 2, 25)
        # Pillowed: domed outwards, thickest in the middle, softly rounded
        # all round the edge.
        panel_pillow(panel, side, inner, width)
        # The left one is cut away round the magazine release.
        if side < 0:
            cut(panel, cylinder('release_cutout', 0.0059, -inner - width - 0.002, -inner + 0.001, axis='x', at=(0.0225, -0.0415), segments=32))
        # The screws sit in shallow counterbores.
        for s, y in SCREWS:
            x0, x1 = sorted((side * (inner + width - 0.0007), side * (inner + width + 0.001)))
            cut(panel, cylinder('counterbore', 0.0036, x0, x1, axis='x', at=(s, y), segments=28))
        panels.append(panel)
    grips = join(panels[0], panels[1])
    grips.name = grips.data.name = 'grips'
    sharp_edges(grips, 45)

    screws = []
    for side in (-1, 1):
        for s, y in SCREWS:
            x0, x1 = side * (inner + width - 0.0007), side * (inner + width - 0.0001)
            head = cylinder('screw', 0.0031, min(x0, x1), max(x0, x1), axis='x', at=(s, y), segments=24)
            bevel(head, 0.0003, 2)
            # The slot, at an angle (screws never end up lined up).
            slot = box('slot', min(x0, x1) - 0.001, max(x0, x1) + 0.001, s - 0.0036, s + 0.0036, y - 0.00045, y + 0.00045)
            slot.data.transform(Matrix.Translation((0, s, y)) @ Matrix.Rotation(math.radians(30 + 50 * (s + y) * 100 % 60), 4, 'X') @ Matrix.Translation((0, -s, -y)))
            cut(head, slot)
            screws.append(head)
    screws_obj = join(screws[0], *screws[1:])
    screws_obj.name = screws_obj.data.name = 'grip_screws'
    sharp_edges(screws_obj)
    plain_material(screws_obj, '#6d6f74', 0.35, metallic=1.0)
    return grips, screws_obj


# --- Small parts -----------------------------------------------------------------

def build_small_parts():
    # The hammer, modelled down against the slide; the game cocks it back.
    hammer = prism('hammer', P['hammer']['points'], P['hammer']['width'])
    bevel(hammer, 0.0008, 3)
    # Grooves across the top of its spur for the thumb.
    for k in range(5):
        s = -0.0475 - k * 0.0017
        cut(hammer, box('spur_groove', -0.005, 0.005, s - 0.0004, s + 0.0004, 0.009 - k * 0.0002, 0.016))
    sharp_edges(hammer)
    plain_material(hammer, DARK_STEEL, 0.4, metallic=0.85)
    set_pivot(hammer, tuple(P['hammerPivot']))

    trigger = prism('trigger', P['trigger']['points'], P['trigger']['width'])
    bevel(trigger, 0.0008, 3)
    for k in range(5):
        x = -0.002 + k * 0.001
        cut(trigger, box('trigger_groove', x - 0.00016, x + 0.00016, 0.0574, 0.06, -0.0475, -0.0295))
    sharp_edges(trigger)
    plain_material(trigger, DARK_STEEL, 0.4, metallic=0.85)

    # The thumb safety on the left, with the paddle the thumb rides on.
    w = P['thumbSafety']['width']
    safety = prism('thumb_safety', P['thumbSafety']['points'], w)
    safety.data.transform(Matrix.Translation((-(FRAME_HALF + w / 2), 0, 0)))
    paddle = box('paddle', -FRAME_HALF - w - 0.002, -FRAME_HALF - w + 0.0003, -0.0125, -0.0032, -0.0135, -0.0115)
    boss = cylinder('safety_boss', 0.0042, -FRAME_HALF - w - 0.0007, -FRAME_HALF - w + 0.0002, axis='x', at=(-0.0302, -0.0182), segments=28)
    safety = join(safety, paddle, boss)
    bevel(safety, 0.0005, 3)
    for k in range(4):
        s = -0.0112 + k * 0.0022
        cut(safety, box('paddle_groove', -FRAME_HALF - w - 0.004, -FRAME_HALF - w - 0.0016, s - 0.0004, s + 0.0004, -0.0145, -0.011))
    safety.name = safety.data.name = 'thumb_safety'
    sharp_edges(safety)
    plain_material(safety, DARK_STEEL, 0.42, metallic=0.8)

    # The slide stop on the left: its lever, the pin head, and grooves across
    # the thumb pad.
    w = P['slideStop']['width']
    stop = prism('slide_stop', P['slideStop']['points'], w)
    stop.data.transform(Matrix.Translation((-(FRAME_HALF + w / 2), 0, 0)))
    pin = cylinder('stop_pin', 0.0032, -FRAME_HALF - w - 0.0008, -FRAME_HALF - w + 0.0002, axis='x', at=tuple(P['slideStopPivot'][1:]), segments=28)
    stop = join(stop, pin)
    bevel(stop, 0.0005, 3)
    for k in range(4):
        s = 0.0208 + k * 0.0019
        cut(stop, box('pad_groove', -FRAME_HALF - w - 0.001, -FRAME_HALF - w + 0.0004, s - 0.0004, s + 0.0004, -0.0185, -0.0092))
    stop.name = stop.data.name = 'slide_stop'
    sharp_edges(stop)
    plain_material(stop, DARK_STEEL, 0.42, metallic=0.8)
    set_pivot(stop, tuple(P['slideStopPivot']))

    # Controls that don't move (in the game): the magazine release button with
    # its checkering, and the plunger tube between the slide stop and safety.
    release = cylinder('mag_release', 0.0046, -FRAME_HALF - 0.0017, -FRAME_HALF + 0.0005, axis='x', at=(0.0225, -0.0415), segments=32)
    bevel(release, 0.0004, 2)
    for k in range(-3, 4):
        cut(release, box('release_groove', -FRAME_HALF - 0.003, -FRAME_HALF - 0.0013, 0.0225 + k * 0.0012 - 0.0003, 0.0225 + k * 0.0012 + 0.0003, -0.047, -0.036))
        cut(release, box('release_groove', -FRAME_HALF - 0.003, -FRAME_HALF - 0.0013, 0.017, 0.028, -0.0415 + k * 0.0012 - 0.0003, -0.0415 + k * 0.0012 + 0.0003))
    tube = cylinder('plunger_tube', 0.0022, 0.0055, 0.0186, at=(-FRAME_HALF - 0.0017, -0.0128), segments=20)
    bevel(tube, 0.0006, 2)
    controls = join(release, tube)
    controls.name = controls.data.name = 'controls'
    sharp_edges(controls)
    plain_material(controls, DARK_STEEL, 0.42, metallic=0.8)

    # Pins through the frame: hammer pin and sear pin on both sides, the slide
    # stop pin's end on the right, the mainspring housing pin at the bottom.
    pins = []
    hp = P['hammerPivot']
    for s, y, r in ((hp[1], hp[2], 0.0018), (-0.031, -0.028, 0.0016), (-0.041, -0.112, 0.0012)):
        pins.append(cylinder('pin', r, -FRAME_HALF - 0.0003, FRAME_HALF + 0.0003, axis='x', at=(s, y), segments=18))
    sp = P['slideStopPivot']
    pins.append(cylinder('stop_pin_end', 0.0021, FRAME_HALF - 0.0003, FRAME_HALF + 0.0004, axis='x', at=(sp[1], sp[2]), segments=18))
    pins_obj = join(pins[0], *pins[1:])
    pins_obj.name = pins_obj.data.name = 'pins'
    sharp_edges(pins_obj)
    plain_material(pins_obj, '#4a4b4f', 0.35, metallic=1.0)
    return hammer, trigger, safety, stop, controls, pins_obj


def build_magazine():
    """The whole magazine: a slim steel body with witness holes down the
    right side, the thin baseplate, the top round, the follower, and brass
    behind each hole to show how many are left."""
    mag = P['magazine']
    body = prism('mag_body', mag['body'], mag['width'])
    bevel(body, 0.0009, 2)
    slope, top_y, depth = mag['slope'], mag['top'], mag['depth']
    back_at = lambda y: mag['frontTop'] - depth + (y - top_y) * slope  # noqa: E731
    holes = []
    # A hole for each round from the second to the seventh, down the back of
    # the right side (where the cases' heads show).
    centres = []
    for k in range(6):
        y = top_y - 0.0185 - k * 0.0119
        s = back_at(y) + 0.008
        centres.append((s, y))
        holes.append(cylinder('witness_hole', 0.0016, mag['width'] / 2 - 0.0012, mag['width'] / 2 + 0.001, axis='x', at=(s, y), segments=16))
    # The top is open between the feed lips, down to the follower.
    holes.append(box('feed_lips', -mag['width'] / 2 + 0.0016, mag['width'] / 2 - 0.0016, back_at(top_y) + 0.002, mag['frontTop'] - 0.004, top_y - 0.004, top_y + 0.001))
    cut(body, *holes)
    sharp_edges(body)
    plain_material(body, '#2a2b2f', 0.4, metallic=0.8)
    base = prism('mag_base', mag['base'], mag['baseWidth'])
    bevel(base, 0.0006, 2)
    sharp_edges(base)
    plain_material(base, '#1f2023', 0.45, metallic=0.75)
    magazine = join(base, body)
    magazine.name = magazine.data.name = 'magazine'

    # The top round, in the feed lips, angled up a little at the nose as the
    # follower pushes it against them.
    top_round = round_45('magazine_round', back_at(top_y) + 0.0015, at=(0.0, top_y + 0.0052))
    top_round.parent = magazine
    follower = box('magazine_follower', -mag['width'] / 2 + 0.0011, mag['width'] / 2 - 0.0011, back_at(top_y) + 0.0012, mag['frontTop'] - 0.0015, top_y - 0.0042, top_y - 0.0015)
    bevel(follower, 0.0004, 2)
    follower.name = follower.data.name = 'magazine_follower'
    plain_material(follower, '#1b1c1f', 0.5, metallic=0.4)
    follower.parent = magazine
    # Brass behind each witness hole: magazine_rounds_1 is the top hole, with
    # brass while there are 2 or more; the bottom one (6) only when it's full.
    for k, (s, y) in enumerate(centres):
        disc = cylinder('brass', 0.0015, mag['width'] / 2 - 0.0016, mag['width'] / 2 - 0.0009, axis='x', at=(s, y), segments=16)
        disc.name = disc.data.name = f'magazine_rounds_{k + 1}'
        plain_material(disc, BRASS, 0.3, metallic=0.85)
        disc.parent = magazine
    return magazine


# --- Textures --------------------------------------------------------------------

def steel_maps(p, n, ao, seed):
    """A worn blued finish: bare steel on edges and high points, holster wear
    rubbed along the sides, fine machining marks, and scratches."""
    metal, steel = srgb_to_linear(BLUED), srgb_to_linear(BARE_STEEL)
    curve = convexity(p, n)
    patchy = 0.6 + 0.4 * low_noise(p, 0.006, seed)
    wear = np.clip(smoothstep(130, 620, curve) * patchy, 0, 1)
    color = metal * (1 - wear[:, None]) + steel * wear[:, None]
    rough = 0.46 * (1 - wear) + 0.24 * wear
    marks = low_noise(p * np.array([40, 1, 40]), 0.03, seed + 1)
    rough += 0.03 * marks
    color *= (1 + 0.025 * low_noise(p, 0.03, seed + 2) + 0.008 * marks)[:, None]
    height = 0.000006 * marks
    side = np.abs(n[:, 0]) > 0.7
    rubbed = smoothstep(0.35, 0.95, 0.5 + 0.5 * low_noise(p * np.array([1, 0.4, 1]), 0.009, seed + 3))
    holster = side * rubbed * 0.1
    color = lerp_color(color, WORN_FINISH, holster)
    rough = rough * (1 - holster) + 0.27 * holster
    scratch = scratches(p, n, 240, seed + 4)
    color = lerp_color(color, BARE_STEEL, scratch * 0.8)
    rough = rough * (1 - scratch) + 0.18 * scratch
    height -= 0.00003 * scratch
    return color, np.clip(rough, 0.05, 1), height


def frame_maps(p, n, ao):
    color, rough, height = steel_maps(p, n, ao, 41)
    # The arched mainspring housing has fine vertical serrations (grooves
    # running down it), below the grip safety.
    back = (n[:, 1] < -0.55) & (p[:, 2] < -0.065) & (p[:, 2] > -0.1195)
    tri = lambda t: np.abs((t % 1.0) - 0.5) * 2  # noqa: E731
    ridges = tri(p[:, 0] / 0.0011)
    edge = smoothstep(0.0098, 0.0088, np.abs(p[:, 0]))
    serrated = back * edge
    height = height + 0.0002 * serrated * (ridges - 0.5)
    color = lerp_color(color, DARK_STEEL, serrated * (1 - ridges) * 0.5)
    return color, rough, height


def grip_maps(p, n, ao):
    """Walnut, with diamond checkering, a smooth diamond round each screw and
    a smooth border round the edge of each panel."""
    s, y = p[:, 1], p[:, 2]
    outer = np.abs(n[:, 0]) > 0.6
    # Grain runs along the grip.
    along = s * 0.34 + y
    grain = low_noise(np.stack([p[:, 0] * 30, along * 4, (s - y * 0.34) * 60], axis=1), 0.02, 81)
    figure = low_noise(p, 0.012, 82)
    color = srgb_to_linear(WALNUT) * (1 + 0.42 * grain + 0.25 * figure)[:, None]
    # Checkering: two sets of fine grooves crossing at an angle, leaving
    # little pyramids.
    angle = math.radians(32)
    pitch = 0.0016
    a = (s * math.cos(angle) + y * math.sin(angle)) / pitch
    b = (-s * math.cos(angle) + y * math.sin(angle)) / pitch
    tri = lambda t: np.abs((t % 1.0) - 0.5) * 2  # noqa: E731
    pyramids = np.minimum(tri(a), tri(b))
    border = smoothstep(0.0022, 0.0032, distance_to_outline(s, y, P['gripPanel']['points'])) * inside_polygon(s, y, P['gripPanel']['points'])
    smooth = np.zeros(len(p))
    for cs, cy in SCREWS:
        # A diamond, taller than it's wide, along the grip.
        du, dv = (s - cs) * math.cos(math.radians(19)) + (y - cy) * math.sin(math.radians(19)), (y - cy) * math.cos(math.radians(19)) - (s - cs) * math.sin(math.radians(19))
        smooth = np.maximum(smooth, smoothstep(1.05, 0.95, np.abs(du) / 0.0085 + np.abs(dv) / 0.0115))
    checkered = outer * border * (1 - smooth)
    height = 0.00036 * checkered * (pyramids - 0.5)
    color = lerp_color(color, WALNUT_DARK, checkered * (1 - pyramids) * 0.7)
    rough = 0.45 + 0.2 * checkered * (1 - pyramids)
    # Edges worn a little lighter.
    curve = convexity(p, n)
    edge = np.clip(smoothstep(250, 900, curve), 0, 1) * 0.35
    color = color * (1 + 0.6 * edge)[:, None]
    return color, np.clip(rough, 0.05, 1), height


# --- Build -----------------------------------------------------------------------

def main():
    started = time.time()
    reset_scene()
    log('slide')
    slide, barrel, muzzle = build_slide()
    log('frame')
    frame = build_frame()
    grips, screws = build_grips()
    hammer, trigger, safety, stop, controls, pins = build_small_parts()
    magazine = build_magazine()

    small_parts = (hammer, trigger, safety, stop, controls)
    for obj, make_maps, metallic in ((slide, lambda p, n, ao: steel_maps(p, n, ao, 21), 1.0),
                                     (frame, frame_maps, 1.0),
                                     (grips, grip_maps, 0.0),
                                     *((part, lambda p, n, ao, k=k: steel_maps(p, n, ao, 101 + 10 * k), 1.0) for k, part in enumerate(small_parts))):
        # The small parts get smaller textures.
        SETTINGS['size'] = 512 if obj in small_parts else 1024
        log('textures for', obj.name, f'({sum(len(f.vertices) - 2 for f in obj.data.polygons)} triangles)')
        triangulate(obj)
        sharp_edges(obj, 55)
        uv_unwrap(obj)
        p = bake_positions(obj)
        n = bake_world_normals(obj)
        ao = bake_ao(obj)
        color, rough, height = make_maps(p, n, ao)
        normal_image = bake_normal_from_height(obj, height)
        color = color * (0.35 + 0.65 * ao)[:, None]
        textured_material(obj, color, rough, normal_image, metallic=metallic)

    root = link(bpy.data.objects.new('pistol', None))
    for obj in (slide, barrel, frame, grips, screws, hammer, trigger, safety, stop, controls, pins, magazine):
        obj.parent = root
    muzzle.parent = slide

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
