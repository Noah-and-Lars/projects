"""Turns a downloaded 9 mm pistol, and the attachments that come with it, into
the game's first pistol (the PF-9).

The model is "Pistol 9mm Custom" by ~D-Try~ (CC BY 4.0, see README.md,
Credits):
https://sketchfab.com/3d-models/pistol-9mm-custom-7bb44ec1d8e14925aeebbfa8374b87cf
Download its glTF version and unzip it so that the folder holds scene.gltf,
scene.bin and textures/. Then, from the project-fish folder:

    blender --background --python tools/blender/convert_pistol9.py -- build/pistol9-source build/pistol9-raw.glb --blend build/pistol9.blend
    node tools/finish_pistol9.mjs build/pistol9-raw.glb assets/pistol.glb

(npm run build-pistol does both.)

The download is a showcase scene: four copies of the pistol (two bare, two
fitted with attachments) and a row of loose attachments. This takes the
first fitted copy, which has its magazine in, and from it:
- The pistol's own pieces, grouped into the parts the game moves, with the
  game's names: slide (with its sights), extractor, barrel, frame, trigger
  (with its safety blade), slide stop, magazine release and magazine.
- Each attachment as one hidden part named att_<id>, already in its mounted
  place, for the loadout menu to show (src/attachments.js):
    att_reddot      red dot sight (on the clamp mount; the game moves it onto
                    the rail cover when that's fitted instead)
    att_clamp       clamp mount: clamps the frame's rail and bridges over the
                    slide, with rails on top, both sides and underneath
    att_cover       rail cover: a cover over the front of the slide with a
                    rail on top (moves with the slide)
    att_light_long  long light (on the clamp mount's bottom rail)
    att_light_compact  compact light (on the frame's rail)
    att_laser       laser (on the clamp mount's left rail)
    att_can_short, att_can_long  round suppressors (on the barrel)
    att_can_box     box suppressor (clamps to the frame's rail)
  Attachments that come only as loose copies are moved into place with the
  transforms measured from the fitted copies.
- A round in the chamber and two in the top of the magazine (from the loose
  cartridge, made real size), and a magazine follower.

It places everything in gun space (metres, +X right, +Y up, -Z forward) with
the grip where the game's hands hold a pistol (GRIP in
src/viewmodel/pistol.js), and makes it 14% wider: the download is real size
in length and height but thinner than the real thing, and the game's hands
are posed round a full-width grip. (The round suppressors keep their shape.)

Textures: rubs out the maker's and model markings, serials and emblems on
the pistol and magazine, and the brand names, logos and codes on the
attachments; engraves the game's own "PF-9" on the slide; and shrinks them
(the pistol's to 2048 px, the rest to 1024 or less). Materials get the game's
names (and textures, in finish_pistol9.mjs).

The game's constants for this gun are printed at the end (POINTS9 ...).
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
from common import log, plain_material  # noqa: E402
from shapes import join, link  # noqa: E402
from texture_edit import (box_blur, clone_over, deviation_mask, engrave, image_array, letters,  # noqa: E402
                          load_image, measure_engrave_sign, rub_out, store)

ARGS = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else sys.argv[1:]
SOURCE, OUT_GLB = ARGS[0], ARGS[1]
BLEND = ARGS[ARGS.index('--blend') + 1] if '--blend' in ARGS else None

# --- Placing it ---------------------------------------------------------------
# The download is in metres and already turned the game's way (muzzle -Z).
# Wider by this much (x), about the middle.
WIDEN = 1.14
# Then moved by this (gun space, metres), which puts the front strap's finger
# ridges on the grip line and the web of the hand under the tang, as on the
# first pistol.
OFFSET = (0.0, -0.1287, -0.2173)
# The loose cartridge is a little small: made real size (29.7 mm long).
ROUND_SCALE = 1.195


def named(stem, first, last):
    return [stem if k == 0 else f'{stem}.{k:03d}' for k in range(first, last + 1)]


P = lambda k: 'CustomPistol9mm' if k == 0 else f'CustomPistol9mm.{k:03d}'  # noqa: E731

# The fitted pistol's pieces (download node names) and the part each becomes.
GUN = {
    'slide': [P(0), P(6), P(7), P(12), P(18)],  # body, sights, back plate, striker block
    'extractor': [P(9)],
    'barrel': [P(8)],
    'frame': [P(22), P(1), P(2), P(3), P(5), P(10), P(11), P(13), P(14), P(15), P(21)],
    'trigger': [P(16)],
    'safety_blade': [P(17)],
    'slide_stop': [P(19)],
    'mag_release': [P(20), P(4)],
    'magazine': named('Magazine9mm', 0, 3),
}
ROUND = 'Bullet9x19'

# The attachments: id -> (download pieces, where those pieces are).
ATTACHMENTS = {
    'reddot': (named('AIM', 0, 19), 'fitted'),
    'clamp': (named('PicatinyBracing1', 0, 6), 'fitted'),
    'cover': (['PicatinyBracing2.002'], 'second'),
    'light_long': (named('Fleshlight1', 0, 10), 'fitted'),
    'light_compact': (named('Fleshlight2', 8, 15), 'second'),
    'laser': (named('LaserBlock', 0, 7), 'fitted'),
    'can_long': (['Supressor1', 'Supressor1.001'], 'fitted'),
    'can_short': (['Supressor2.002', 'Supressor2.003'], 'short_can'),
    'can_box': (named('Supressor3', 0, 10), 'box_can'),
}
# Which part each attachment moves with (the rest stay with the frame).
CARRIED_BY = {'cover': 'slide', 'can_long': 'barrel', 'can_short': 'barrel'}
# Kept round when the rest is widened.
KEEP_SHAPE = {'can_long', 'can_short'}
# The red dot's reticle: two little squares, kept square.
RETICLE = ('AIM.018', 'AIM.019')
# Lenses, which get their own see-through material.
GLASS = {'AIM.017': 'reddot', 'Fleshlight1': 'light_long', 'Fleshlight2.013': 'light_compact'}

# From where the pieces are in the download (glTF world, metres) to the
# fitted pistol: the second fitted pistol faces the other way; the short
# suppressor lies in front of it, on its bore; the box suppressor stands on
# its end in the row of loose parts. (Measured by fitting the copies.)
TO_FITTED = {
    'fitted': (np.eye(3), (0.0, 0.0, 0.0)),
    'second': (np.diag([-1.0, 1.0, -1.0]), (-0.0000125, 0.0690203, 0.0552132)),
    'short_can': (np.diag([-1.0, 1.0, -1.0]), (-0.0000200, 0.1095860, 0.0707000)),
    'box_can': (np.array([[0.0, 0.0, 1.0], [-1.0, 0.0, 0.0], [0.0, -1.0, 0.0]]), (0.6902, 0.055186, 0.14379)),
}

# The game's names for the materials (download name -> ours).
MATERIALS = {
    'CustomPistol9mm': 'pistol9', 'Magazine9mm': 'pistol9_magazine', 'Bullet9x19': 'pistol9_round',
    'material': 'reddot', 'SPOT': 'reddot_reticle', 'Fleshlight1': 'light_long', 'Fleshlight2': 'light_compact',
    'LaserBlock': 'laser', 'PicatinyBracing1': 'clamp', 'PicatinyBracing2': 'cover',
    'Supressor1': 'can_long', 'Supressor2': 'can_short', 'Supressor3': 'can_box',
}
# Texture size per material.
TEXTURE_SIZE = {'CustomPistol9mm': 2048, 'Magazine9mm': 1024, 'Bullet9x19': 512, 'SPOT': 512}
OTHER_TEXTURE_SIZE = 1024

# --- Markings to rub out --------------------------------------------------------
# (material, maps, box in the download's 4096 px textures (x0, y0, x1, y1),
# how): 'letters' fills just what stands out (letters on a plain surface),
# 'fill' the whole box, 'clone' copies the patch beside it (for stippling).
ALL = ('baseColor', 'metallicRoughness', 'normal')
MAG = ('metallicRoughness', 'normal')
MODEL_NUMBER = (733, 307, 792, 364)  # slide, left side: where "PF-9" goes
RUB_OUT = [
    ('CustomPistol9mm', ALL, MODEL_NUMBER, 'letters'),  # slide left: model number
    ('CustomPistol9mm', ALL, (743, 581, 787, 766), 'letters'),  # slide left: country
    ('CustomPistol9mm', ALL, (568, 559, 591, 682), 'letters'),  # slide right: serial
    ('CustomPistol9mm', ALL, (980, 245, 1032, 562), 'fill'),  # frame plate: maker's lines
    ('CustomPistol9mm', ALL, (575, 1772, 695, 1858), 'clone'),  # grip: serial tag
    ('CustomPistol9mm', ALL, (3080, 63, 3172, 286), 'letters'),  # barrel hood: a word
    ('CustomPistol9mm', ALL, (3090, 2428, 3239, 2463), 'letters'),  # barrel hood: serial
    ('CustomPistol9mm', ALL, (2779, 2487, 2937, 2608), 'fill'),  # slide top: emblem
    ('CustomPistol9mm', ALL, (3286, 539, 3369, 611), 'fill'),  # striker block: emblem
    ('Magazine9mm', MAG, (63, 61, 476, 171), 'letters'),  # back: maker and country
    ('Magazine9mm', MAG, (455, 3250, 825, 3375), 'letters'),  # baseplate: maker and country
    ('Bullet9x19', ('normal',), (3017, 1790, 3971, 2671), 'letters'),  # headstamp
    ('Supressor1', ALL, (1348, 448, 1612, 1072), 'fill'),  # logo
    ('Supressor1', ALL, (1368, 1588, 1652, 2072), 'fill'),  # a real maker's name and model
    ('Fleshlight1', ALL, (1441, 2268, 1672, 2992), 'fill'),  # logo
    ('Fleshlight1', ALL, (1560, 3392, 1877, 3759), 'fill'),  # model and a QR code
    ('material', ALL, (1545, 547, 1866, 868), 'fill'),  # QR code
    ('material', ALL, (1348, 1501, 1454, 1652), 'fill'),  # a real model number
    ('material', ALL, (1291, 1778, 1427, 2392), 'fill'),  # logo
    ('Fleshlight2', ALL, (1238, 188, 1376, 1002), 'fill'),  # a real maker's name
    ('Fleshlight2', ALL, (1938, 248, 2090, 1020), 'fill'),  # the same, other side
    ('Fleshlight2', ALL, (578, 46, 1064, 126), 'letters'),  # model
    ('Fleshlight2', ALL, (2290, 2590, 2960, 3010), 'fill'),  # emblem
    ('LaserBlock', ALL, (1175, 557, 1578, 939), 'fill'),  # QR code
    ('Supressor3', ALL, (100, 28, 202, 372), 'fill'),  # maker's name
    ('Supressor3', ALL, (858, 1298, 932, 2102), 'letters'),  # maker's line
]
# How far a texel must stand out from its surroundings to count as lettering
# (per map; normal maps tilt, colours change).
STANDS_OUT = {'baseColor': 0.06, 'metallicRoughness': 0.06, 'normal': 0.08}

# The made-up marking, engraved where the model number was. The download's
# lettering there reads down the texture with its tops towards -x (mirrored),
# so ours goes in the same way.
MARKING = 'PF-9'


# --- Building ----------------------------------------------------------------

def to_blender_matrix(r, t):
    """A glTF-space transform (3x3, translation) as a Blender matrix (Blender
    is Z up: (x, y, z) in glTF is (x, -z, y))."""
    c = np.array([[1.0, 0, 0], [0, 0, -1.0], [0, 1.0, 0]])
    m = Matrix.Identity(4)
    rb = c @ np.asarray(r) @ c.T
    tb = c @ np.asarray(t)
    for i in range(3):
        for j in range(3):
            m[i][j] = rb[i, j]
        m[i][3] = tb[i]
    return m


def placement(widen):
    offset = (OFFSET[0], -OFFSET[2], OFFSET[1])
    return Matrix.Translation(offset) @ Matrix.Scale(widen, 4, (1.0, 0.0, 0.0))


def verts(obj):
    a = np.empty(len(obj.data.vertices) * 3)
    obj.data.vertices.foreach_get('co', a)
    return a.reshape(-1, 3)


def set_verts(obj, v):
    obj.data.vertices.foreach_set('co', v.reshape(-1))
    obj.data.update()


def gun(v):
    """Blender coordinates to gun space."""
    v = np.asarray(v, dtype=np.float64)
    return np.stack([v[..., 0], v[..., 2], -v[..., 1]], axis=-1)


def blender(v):
    v = np.asarray(v, dtype=np.float64)
    return np.stack([v[..., 0], -v[..., 2], v[..., 1]], axis=-1)


def import_source():
    """Imports the download and keeps only the pieces used, each with its
    transform baked in and placed in gun space. Returns {piece name: object}."""
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=os.path.join(SOURCE, 'scene.gltf'))
    where = {}
    for part, pieces in GUN.items():
        for p in pieces:
            where[p] = ('fitted', WIDEN)
    where[ROUND] = ('fitted', 1.0)
    for att, (pieces, kind) in ATTACHMENTS.items():
        for p in pieces:
            where[p] = (kind, 1.0 if att in KEEP_SHAPE else WIDEN)
    pieces = {}
    for obj in list(bpy.context.scene.objects):
        if obj.type != 'MESH':
            continue
        piece = obj.parent.name if obj.parent else obj.name
        if piece not in where:
            bpy.data.objects.remove(obj)
            continue
        kind, widen = where[piece]
        matrix = placement(widen) @ to_blender_matrix(*TO_FITTED[kind]) @ obj.matrix_world
        obj.parent = None
        obj.data = obj.data.copy()
        obj.data.transform(matrix)
        obj.matrix_world = Matrix.Identity(4)
        obj.name = piece
        pieces[piece] = obj
    for obj in list(bpy.context.scene.objects):
        if obj.type != 'MESH':
            bpy.data.objects.remove(obj)
    missing = sorted(set(where) - set(pieces))
    if missing:
        raise SystemExit(f'pieces not found: {missing}')
    # The reticle stays square.
    for name in RETICLE:
        obj = pieces[name]
        v = verts(obj)
        c = v[:, 0].mean()
        v[:, 0] = c + (v[:, 0] - c) / WIDEN
        set_verts(obj, v)
    return pieces


def axis_of(v):
    """A round's centre and its axis (unit, base to nose), from its vertices."""
    c = v.mean(0)
    _, _, vt = np.linalg.svd(v - c)
    a = vt[0]
    t = (v - c) @ a
    # The nose is the narrow end.
    r = np.linalg.norm((v - c) - np.outer(t, a), axis=1)
    if r[t > 0].mean() > r[t < 0].mean():
        a = -a
    t = (v - c) @ a
    r = np.linalg.norm((v - c) - np.outer(t, a), axis=1)
    return c, a, t.min(), t.max(), r.max()


def make_round(source, name, base_gun):
    """A copy of the cartridge, real size, lying along the bore (nose
    forward) with its base at base_gun (gun space)."""
    obj = source.copy()
    obj.data = source.data.copy()
    link(obj)
    obj.name = obj.data.name = name
    v = verts(obj)
    c, a, t0, _, _ = axis_of(v)
    turn = np.array(Vector(a).rotation_difference(Vector((0, 1, 0))).to_matrix())
    base = c + a * t0
    v = (v - base) @ turn.T * ROUND_SCALE + blender(base_gun)
    set_verts(obj, v)
    return obj


def bore_of(barrel):
    """The bore's height and the muzzle and breech ends (gun space)."""
    v = gun(verts(barrel))
    muzzle = v[v[:, 2] < v[:, 2].min() + 0.004]
    return {
        'y': (muzzle[:, 1].max() + muzzle[:, 1].min()) / 2,
        'muzzle_z': v[:, 2].min(),
        'breech_z': v[:, 2].max(),
    }


def rear_wall(mag, y):
    """How far back and forward (gun z) the magazine's walls are at height y,
    near its middle: where its edges cross that height."""
    v = gun(verts(mag))
    e = np.empty(len(mag.data.edges) * 2, dtype=np.int64)
    mag.data.edges.foreach_get('vertices', e)
    a, b = v[e[0::2]], v[e[1::2]]
    crosses = (a[:, 1] - y) * (b[:, 1] - y) < 0
    a, b = a[crosses], b[crosses]
    t = (y - a[:, 1]) / (b[:, 1] - a[:, 1])
    p = a + (b - a) * t[:, None]
    p = p[np.abs(p[:, 0]) < 0.006]
    return p[:, 2].max(), p[:, 2].min()


def magazine_insides(mag, source_round):
    """The rounds at the top of the magazine (staggered, as in a double stack
    magazine) and a follower, seen when it's empty."""
    v = gun(verts(mag))
    top = v[:, 1].max()
    _, _, t0, t1, radius = axis_of(verts(source_round))
    radius *= ROUND_SCALE
    length = (t1 - t0) * ROUND_SCALE
    out = []
    for k, (name, x) in enumerate((('magazine_round', 0.0023), ('magazine_second_round', -0.0023))):
        y = top - 0.0006 - radius - k * 0.0088
        back, front = rear_wall(mag, y)
        base_z = back - 0.0016
        if base_z - length < front:
            log(f'warning: {name} pokes out of the front of the magazine by {(front - (base_z - length)) * 1000:.1f} mm')
        out.append(make_round(source_round, name, (x, y, base_z)))
    # The follower: a block just under the feed lips.
    lips = v[v[:, 1] > top - 0.003]
    x0, x1 = lips[:, 0].min() + 0.0016, lips[:, 0].max() - 0.0016
    y = top - 0.0045
    back, front = rear_wall(mag, y)
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.scale(bm, vec=(x1 - x0, back - front - 0.004, 0.003), verts=bm.verts)
    bmesh.ops.translate(bm, vec=tuple(blender(((x0 + x1) / 2, y - 0.0015, (back + front) / 2))), verts=bm.verts)
    mesh = bpy.data.meshes.new('magazine_follower')
    bm.to_mesh(mesh)
    bm.free()
    follower = link(bpy.data.objects.new('magazine_follower', mesh))
    plain_material(follower, '#1a1b1e', 0.6, metallic=0.0)
    out.append(follower)
    return out


# --- Textures -----------------------------------------------------------------

def images_of(material):
    """{map: image} for a download material's textures."""
    out = {}
    for m in ('baseColor', 'metallicRoughness', 'normal', 'emissive'):
        try:
            out[m] = load_image(f'{material}_{m}.png')
        except SystemExit:
            pass
    return out


def fix_textures():
    # Shrink them all first (one at a time: the download's are 4096 px).
    textures = {}
    for material in MATERIALS:
        images = images_of(material)
        size = TEXTURE_SIZE.get(material, OTHER_TEXTURE_SIZE)
        for m, image in images.items():
            if m != 'baseColor':
                image.colorspace_settings.name = 'Non-Color'
            if image.size[0] > size:
                image.scale(size, size)
        textures[material] = images
    log('textures shrunk')

    arrays = {}

    def maps_of(material, names):
        out = []
        for m in names:
            key = (material, m)
            if key not in arrays:
                arrays[key] = image_array(textures[material][m])
            out.append(arrays[key])
        return out

    # What the slide's model number looks like (to engrave ours the same way).
    size = TEXTURE_SIZE['CustomPistol9mm']
    k = size / 4096
    box = tuple(int(round(c * k)) for c in MODEL_NUMBER)
    base, rough, normal = maps_of('CustomPistol9mm', ('baseColor', 'metallicRoughness', 'normal'))
    mask = deviation_mask([normal], box, [STANDS_OUT['normal']], grow=0)
    sign = measure_engrave_sign(normal, box, mask)
    x0, y0, x1, y1 = box
    inside = mask
    deltas = []
    for a in (base, rough):
        region = a[y0:y1, x0:x1, :3]
        deltas.append(region[inside].mean(0) - region[~inside].mean(0))
    ys, xs = np.nonzero(mask)
    height = (xs.max() - xs.min() + 1) * 0.85
    log(f'model number: {mask.sum()} px, letters {height:.0f} px tall, slope signs {sign}, '
        f'colour change {np.round(deltas[0], 3)}, roughness/metal change {np.round(deltas[1], 3)}')
    start = (x0 + x1) / 2, y0 + ys.min()

    # Rub out the markings.
    for material, names, box4096, how in RUB_OUT:
        size = TEXTURE_SIZE.get(material, OTHER_TEXTURE_SIZE)
        k = size / 4096
        box = (int(math.floor(box4096[0] * k)), int(math.floor(box4096[1] * k)),
               int(math.ceil(box4096[2] * k)), int(math.ceil(box4096[3] * k)))
        maps = maps_of(material, names)
        normal_at = names.index('normal') if 'normal' in names else None
        if how == 'letters':
            m = deviation_mask(maps, box, [STANDS_OUT[n] for n in names])
            rub_out(maps, box, m, normal=normal_at)
        elif how == 'fill':
            rub_out(maps, box, None, normal=normal_at)
        else:
            clone_over(maps, box, guide=normal_at or 0)
        log(f'rubbed out {material} {box4096} ({how})')

    # Our marking where the model number was, reading the same way.
    img = letters(MARKING, height)
    at = (int(start[0]), int(start[1] + img.shape[1] / 2 + 2))
    m = engrave(normal, img, at, -math.pi / 2, flip_rows=True, sign=sign)
    for a, d in zip((base, rough), deltas):
        a[..., :3] = np.clip(a[..., :3] + m[..., None] * d, 0, 1)
    log(f'engraved {MARKING!r}, {height:.0f} x {img.shape[1]} px at {at}')

    for (material, m), a in arrays.items():
        store(textures[material][m], a)


def rename_materials():
    for mat in bpy.data.materials:
        stem = mat.name.split('.')[0]
        if stem in MATERIALS:
            mat.name = MATERIALS[stem]


# --- Measuring ----------------------------------------------------------------

def fitted_to_gun(p_mm, widen=WIDEN):
    """A point measured on the fitted pistol in the download (mm) in gun space
    (metres)."""
    return [round((p_mm[0] * widen + OFFSET[0] * 1000) / 1000, 5),
            round((p_mm[1] + OFFSET[1] * 1000) / 1000, 5),
            round((p_mm[2] + OFFSET[2] * 1000) / 1000, 5)]


def measure(parts, bore):
    out = {}
    for name in ('slide', 'frame', 'barrel', 'trigger', 'slide_stop', 'mag_release', 'magazine'):
        v = gun(verts(parts[name]))
        out[name] = {'min': np.round(v.min(0), 5).tolist(), 'max': np.round(v.max(0), 5).tolist()}
    out['bore'] = {k: round(float(x), 5) for k, x in bore.items()}
    # The magazine release's left button: its outside face.
    v = gun(verts(parts['mag_release']))
    left = v[v[:, 0] < 0]
    out['magRelease_face'] = np.round([left[:, 0].min(), left[:, 1].mean(), left[:, 2].mean()], 5).tolist()
    # The magazine's top (feed lips) and baseplate bottom.
    v = gun(verts(parts['magazine']))
    out['magazine_top'] = round(float(v[:, 1].max()), 5)
    out['magazine_bottom'] = round(float(v[:, 1].min()), 5)
    # Points measured on the download (fitted pistol, mm).
    out['measured'] = {
        'sights_rear_top_y': fitted_to_gun((0, 130.93, 0))[1],
        'sights_rear_z': fitted_to_gun((0, 0, 248.49))[2],
        'sights_front_z': fitted_to_gun((0, 0, 97.0))[2],
        'reddot_dot': fitted_to_gun((-0.02, 151.64, 149.81)),
        'reddot_back_z': fitted_to_gun((0, 0, 189.1))[2],
        'reddot_on_cover_shift': [0, -0.00115, 0.0331],
        'light_long_lens': fitted_to_gun((0, 62.05, 62.99)),
        'light_compact_lens': fitted_to_gun((0.03, 79.71, 84.71)),
        'laser_emitter': fitted_to_gun((-26.54, 107.85, 96.27)),
        'can_long_muzzle_z': fitted_to_gun((0, 0, -97.45))[2],
        'can_short_muzzle_z': fitted_to_gun((0, 0, -39.95))[2],
        'can_box_muzzle_z': fitted_to_gun((0, 0, -91.21))[2],
    }
    return out


def main():
    started = time.time()
    pieces = import_source()
    log(f'{len(pieces)} pieces')

    # Lenses get their own material.
    for piece, owner in GLASS.items():
        obj = pieces[piece]
        glass = obj.data.materials[0].copy()
        glass.name = f'{owner}_glass'
        obj.data.materials[0] = glass

    parts = {}
    for name, names in GUN.items():
        objs = [pieces[p] for p in names]
        target = join(objs[0], *objs[1:]) if len(objs) > 1 else objs[0]
        target.name = target.data.name = name
        parts[name] = target
    attachments = {}
    for att, (names, _) in ATTACHMENTS.items():
        objs = [pieces[p] for p in names]
        target = join(objs[0], *objs[1:]) if len(objs) > 1 else objs[0]
        target.name = target.data.name = f'att_{att}'
        attachments[att] = target
    log('parts:', ', '.join(parts), '; attachments:', ', '.join(attachments))

    bore = bore_of(parts['barrel'])
    source_round = pieces[ROUND]
    chamber = make_round(source_round, 'chamber_round', (0.0, bore['y'], bore['breech_z']))
    insides = magazine_insides(parts['magazine'], source_round)
    bpy.data.objects.remove(source_round)
    log('added the rounds and the follower')

    fix_textures()
    rename_materials()
    log('textures done')

    root = link(bpy.data.objects.new('pistol', None))
    for name in ('slide', 'barrel', 'frame', 'trigger', 'slide_stop', 'mag_release', 'magazine'):
        parts[name].parent = root
    parts['extractor'].parent = parts['slide']
    parts['safety_blade'].parent = parts['trigger']
    chamber.parent = parts['barrel']
    for obj in insides:
        obj.parent = parts['magazine']
    for att, obj in attachments.items():
        obj.parent = parts[CARRIED_BY[att]] if att in CARRIED_BY else root

    info = measure(parts, bore)
    print('PISTOL9 ' + json.dumps(info))

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
        export_image_format='AUTO',  # PNG; finish_pistol9.mjs makes them WebP
        export_animations=False,
    )
    log('wrote', OUT_GLB, f'{os.path.getsize(OUT_GLB) / 1e6:.1f} MB')
    if BLEND:
        os.makedirs(os.path.dirname(os.path.abspath(BLEND)), exist_ok=True)
        bpy.ops.file.pack_all()
        bpy.ops.wm.save_as_mainfile(filepath=os.path.abspath(BLEND))
        log('saved', BLEND)
    log(f'done in {time.time() - started:.0f} s')


if __name__ == '__main__':
    main()
