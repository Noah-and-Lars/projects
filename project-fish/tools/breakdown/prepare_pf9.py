"""Gets "Pistol 9mm Custom" ready for build_breakdown.mjs: the PF-9 breakdown.

The model is "Pistol 9mm Custom" by ~D-Try~ (CC BY 4.0, see README.md,
Credits):
https://sketchfab.com/3d-models/pistol-9mm-custom-7bb44ec1d8e14925aeebbfa8374b87cf
(the same download the game's PF-9 is made from: build/pistol9-source).
From the project-fish folder:

    python3 -I tools/breakdown/prepare_pf9.py build/pistol9-source build/pf9-breakdown-src
    node tools/breakdown/build_breakdown.mjs build/pf9-breakdown-src tools/breakdown/pf9.json assets/breakdown/pf9.glb

The download is a showcase scene: four copies of the pistol (two bare, two
fitted with attachments) and a row of loose attachments. This writes a
glTF (scene.gltf, scene.bin, textures/) with only what the breakdown shows,
one node per piece, named as in the download:
- the first fitted pistol's own pieces, with its magazine;
- every attachment in its mounted place: the ones that come only on the
  second fitted pistol or loose are moved onto the first with the transforms
  tools/blender/convert_pistol9.py measured (several of them can't go on
  together, so the breakdown brings those on one at a time);
- all of it turned to the breakdown's axes (muzzle towards +Z, the
  pistol's right side towards -X).
Materials: the lenses get a plain see-through material of their own; the
red dot's reticle keeps its see-through texture (and its glow); every other
material is opaque (the download made whole sights and lights see-through),
and the lights' and laser's all but black glow maps go.
Textures (2048 px, PNG; build_breakdown.mjs sizes them and makes them
WebP): the maker's and model markings, serials and emblems are rubbed off
the pistol and magazine, and the brand names, logos and codes off the
attachments (the places convert_pistol9.py found), and the game's own
"PF-9" is engraved where the model number was.

SOURCE is only read (it is a download: run this with python3 -I). Needs
numpy and Pillow, and tools/blender/texture_edit.py (its image helpers,
loaded without Blender).
"""

import importlib.util
import json
import math
import os
import shutil
import sys
import types

import numpy as np
from PIL import Image, ImageDraw, ImageFont

Image.MAX_IMAGE_PIXELS = None
HERE = os.path.dirname(os.path.abspath(__file__))


def load_texture_edit():
    """tools/blender/texture_edit.py without Blender: only its numpy helpers
    are used, so its Blender imports get empty stand-ins."""
    for name in ('bpy',):
        sys.modules.setdefault(name, types.ModuleType(name))
    shapes = types.ModuleType('shapes')

    def inside_polygon(xs, ys, polygon):
        result = np.zeros(len(xs), bool)
        n = len(polygon)
        for i in range(n):
            (x0, y0), (x1, y1) = polygon[i], polygon[(i + 1) % n]
            crosses = (y0 > ys) != (y1 > ys)
            x_at = x0 + (ys - y0) * (x1 - x0) / ((y1 - y0) or 1e-12)
            result ^= crosses & (xs < x_at)
        return result

    shapes.inside_polygon = inside_polygon
    shapes.link = None
    sys.modules['shapes'] = shapes
    spec = importlib.util.spec_from_file_location('texture_edit', os.path.join(HERE, '..', 'blender', 'texture_edit.py'))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


TE = load_texture_edit()


def named(stem, first, last):
    return [stem if k == 0 else f'{stem}.{k:03d}' for k in range(first, last + 1)]


# The pieces, and where each is in the download (see convert_pistol9.py).
PISTOL = named('CustomPistol9mm', 0, 22) + named('Magazine9mm', 0, 3)
ATTACHMENTS = {
    'fitted': named('AIM', 0, 19) + named('PicatinyBracing1', 0, 6) + named('Fleshlight1', 0, 10)
    + named('LaserBlock', 0, 7) + ['Supressor1', 'Supressor1.001'],
    'second': ['PicatinyBracing2.002'] + named('Fleshlight2', 8, 15),
    'short_can': ['Supressor2.002', 'Supressor2.003'],
    'box_can': named('Supressor3', 0, 10),
}
# From where the pieces are in the download (glTF world, metres) to the
# first fitted pistol (measured in convert_pistol9.py, TO_FITTED).
TO_FITTED = {
    'fitted': (np.eye(3), (0.0, 0.0, 0.0)),
    'second': (np.diag([-1.0, 1.0, -1.0]), (-0.0000125, 0.0690203, 0.0552132)),
    'short_can': (np.diag([-1.0, 1.0, -1.0]), (-0.0000200, 0.1095860, 0.0707000)),
    'box_can': (np.array([[0.0, 0.0, 1.0], [-1.0, 0.0, 0.0], [0.0, -1.0, 0.0]]), (0.6902, 0.055186, 0.14379)),
}
# Then the whole pistol turned half round (the download's muzzle points -Z).
TURN = np.diag([-1.0, 1.0, -1.0, 1.0])

# Lenses: a plain see-through material each (tint, linear RGB, and opacity).
GLASS = {
    'AIM.017': ('reddot_glass', [0.55, 0.75, 0.85], 0.22),
    'Fleshlight1': ('light_glass', [0.85, 0.9, 0.95], 0.3),
    'Fleshlight2.013': ('compact_light_glass', [0.85, 0.9, 0.95], 0.3),
}
RETICLE = 'SPOT'  # keeps its see-through texture and glow
SIZE = 2048

# --- Markings to rub out (convert_pistol9.py, RUB_OUT) ---
# (material, maps, box in the download's 4096 px textures, how): 'letters'
# fills just what stands out, 'fill' the whole box, 'clone' copies the patch
# beside it (for stippling).
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
    ('CustomPistol9mm', ALL, (3286, 539, 3369, 611), 'fill'),  # slide's rear block: emblem
    ('Magazine9mm', MAG, (63, 61, 476, 171), 'letters'),  # back: maker and country
    ('Magazine9mm', MAG, (455, 3250, 825, 3375), 'letters'),  # baseplate: maker and country
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
    # More, which the breakdown's close-ups show (the game sees these parts
    # smaller):
    ('material', ALL, (1340, 630, 1396, 875), 'letters'),  # red dot: country of origin
    ('material', ALL, (866, 1894, 994, 2016), 'letters'),  # red dot: date of make
    ('material', ALL, (3944, 430, 4000, 720), 'letters'),  # red dot: serial
    ('material', ALL, (3876, 2570, 3924, 2786), 'letters'),  # red dot: serial, other side
    ('material', ALL, (240, 540, 560, 860), 'fill'),  # red dot: a printed code
    ('Fleshlight1', ALL, (2950, 1675, 3025, 2175), 'letters'),  # light: serial
    ('LaserBlock', ALL, (2380, 1525, 2800, 1760), 'fill'),  # laser: a printed code
    ('LaserBlock', ALL, (1160, 540, 1600, 960), 'fill'),  # laser: the edge of the QR code
    ('material', ALL, (2605, 3670, 2660, 3815), 'letters'),  # red dot: a model name on the hood
    ('Supressor1', ALL, (1415, 1170, 1565, 1460), 'letters'),  # long suppressor: date and serial
    ('Supressor1', ALL, (1415, 2170, 1565, 2850), 'letters'),  # long suppressor: part number
    ('Supressor3', ALL, (35, 35, 110, 305), 'letters'),  # box suppressor: the rest of the maker's name
    ('Supressor3', ALL, (1575, 600, 1650, 1010), 'letters'),  # box suppressor: date and serial
]
# (Kept: the caliber, the sights' "UP", "R" and click values, the lights'
# battery and warning signs, the magazine's round count: they tell the user
# something.)
STANDS_OUT = {'baseColor': 0.06, 'metallicRoughness': 0.06, 'normal': 0.08}
MARKING = 'PF-9'


def local_matrix(node):
    if 'matrix' in node:
        return np.array(node['matrix'], dtype=np.float64).reshape(4, 4).T
    m = np.eye(4)
    x, y, z, w = node.get('rotation', [0, 0, 0, 1])
    r = np.array([[1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)],
                  [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
                  [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)]])
    m[:3, :3] = r * np.array(node.get('scale', [1, 1, 1]))
    m[:3, 3] = node.get('translation', [0, 0, 0])
    return m


def letters(text, height_px):
    """The marking as a 0..1 image, white letters on black, its ink
    height_px tall with 3 px round it (as texture_edit.letters, drawn with
    Pillow's own font)."""
    font = ImageFont.load_default(size=200)
    img = Image.new('L', (200 * len(text) + 200, 400), 0)
    ImageDraw.Draw(img).text((100, 100), text, fill=255, font=font)
    img = img.crop(img.getbbox())
    w = max(1, round(img.width * height_px / img.height))
    img = img.resize((w, max(1, round(height_px))), Image.LANCZOS)
    out = np.zeros((img.height + 6, img.width + 6))
    out[3:-3, 3:-3] = np.asarray(img, dtype=np.float64) / 255
    return out


def load(path, size, mode='RGB'):
    img = Image.open(path).convert(mode)
    if img.width != size:
        img = img.resize((size, size), Image.LANCZOS)
    return np.asarray(img, dtype=np.float32) / 255


def save(a, path, mode='RGB'):
    Image.fromarray(np.clip(np.round(a * 255), 0, 255).astype(np.uint8), mode).save(path, compress_level=6)


def fix_textures(source, out, materials):
    """Rubs out the markings, engraves ours and writes each used material's
    maps at SIZE into out/textures. Returns {download file name: new name}."""
    os.makedirs(os.path.join(out, 'textures'), exist_ok=True)
    arrays = {}
    for mat in materials:
        for m in ('baseColor', 'metallicRoughness', 'normal'):
            path = os.path.join(source, 'textures', f'{mat}_{m}.png')
            if os.path.exists(path):
                arrays[(mat, m)] = load(path, SIZE, 'RGBA' if (mat == RETICLE and m == 'baseColor') else 'RGB')
    k = SIZE / 4096
    scaled = lambda b: (int(math.floor(b[0] * k)), int(math.floor(b[1] * k)), int(math.ceil(b[2] * k)), int(math.ceil(b[3] * k)))  # noqa: E731

    # What the slide's model number looks like, to engrave ours the same way.
    base, rough, normal = (arrays[('CustomPistol9mm', m)] for m in ALL)
    box = scaled(MODEL_NUMBER)
    mask = TE.deviation_mask([normal], box, [STANDS_OUT['normal']], grow=0)
    sign = TE.measure_engrave_sign(normal, box, mask)
    x0, y0, x1, y1 = box
    deltas = [a[y0:y1, x0:x1, :3][mask].mean(0) - a[y0:y1, x0:x1, :3][~mask].mean(0) for a in (base, rough)]
    ys, xs = np.nonzero(mask)
    height = (xs.max() - xs.min() + 1) * 0.85
    start = (x0 + x1) / 2, y0 + ys.min()

    for mat, names, box4096, how in RUB_OUT:
        if mat not in materials:
            continue
        box = scaled(box4096)
        maps = [arrays[(mat, n)] for n in names]
        normal_at = names.index('normal') if 'normal' in names else None
        if how == 'letters':
            TE.rub_out(maps, box, TE.deviation_mask(maps, box, [STANDS_OUT[n] for n in names]), normal=normal_at)
        elif how == 'fill':
            TE.rub_out(maps, box, None, normal=normal_at)
        else:
            TE.clone_over(maps, box, guide=normal_at or 0)
        print(f'rubbed out {mat} {box4096} ({how})')

    img = letters(MARKING, height)
    at = (int(start[0]), int(start[1] + img.shape[1] / 2 + 2))
    m = TE.engrave(normal, img, at, -math.pi / 2, flip_rows=True, sign=sign)
    for a, d in zip((base, rough), deltas):
        a[..., :3] = np.clip(a[..., :3] + m[..., None] * d, 0, 1)
    print(f'engraved {MARKING!r}, {height:.0f} px tall at {at}')

    renamed = {}
    for (mat, m), a in arrays.items():
        name = f'textures/{mat}_{m}.png'
        save(a, os.path.join(out, name), 'RGBA' if a.shape[2] == 4 else 'RGB')
        renamed[f'textures/{mat}_{m}.png'] = name
    # The reticle's glow (small: it is a soft red shape).
    glow = f'textures/{RETICLE}_emissive.png'
    if RETICLE in materials:
        save(load(os.path.join(source, glow), 256), os.path.join(out, glow))
        renamed[glow] = glow
    return renamed


def main():
    source, out = sys.argv[1], sys.argv[2]
    with open(os.path.join(source, 'scene.gltf')) as f:
        g = json.load(f)
    nodes = g['nodes']
    where = {p: 'fitted' for p in PISTOL}
    for kind, pieces in ATTACHMENTS.items():
        for p in pieces:
            where[p] = kind

    # Every mesh node's world matrix; a piece is the node a mesh hangs under.
    found = {}

    def walk(i, parent_matrix, parent_name):
        node = nodes[i]
        world = parent_matrix @ local_matrix(node)
        if 'mesh' in node:
            piece = parent_name if parent_name in where else node.get('name')
            if piece in where:
                if piece in found:
                    raise SystemExit(f'two meshes for {piece}')
                found[piece] = (node['mesh'], world)
        for c in node.get('children', []):
            walk(c, world, node.get('name'))

    for r in g['scenes'][g.get('scene', 0)]['nodes']:
        walk(r, np.eye(4), None)
    missing = sorted(set(where) - set(found))
    if missing:
        raise SystemExit(f'pieces not in the download: {missing}')

    out_g = {'asset': {'version': '2.0', 'generator': 'Project Fish tools/breakdown/prepare_pf9.py',
                       'extras': g['asset'].get('extras', {})},
             'buffers': g['buffers'], 'bufferViews': g['bufferViews'], 'accessors': g['accessors'],
             'samplers': g.get('samplers', []), 'scene': 0}
    meshes, materials, mat_index, new_nodes = [], [], {}, []

    def material_for(i):
        if i not in mat_index:
            mat = json.loads(json.dumps(g['materials'][i]))
            if mat['name'] == RETICLE:
                mat['alphaMode'] = 'BLEND'
            else:
                mat.pop('alphaMode', None)
                # (The lights' and laser's glow maps are all but black.)
                for key in ('emissiveTexture', 'emissiveFactor', 'extensions'):
                    mat.pop(key, None)
            mat_index[i] = len(materials)
            materials.append(mat)
        return mat_index[i]

    glass_index = {}
    for piece in PISTOL + [p for pieces in ATTACHMENTS.values() for p in pieces]:
        mesh_i, world = found[piece]
        r, t = TO_FITTED[where[piece]]
        fit = np.eye(4)
        fit[:3, :3] = r
        fit[:3, 3] = t
        matrix = TURN @ fit @ world
        mesh = json.loads(json.dumps(g['meshes'][mesh_i]))
        for prim in mesh['primitives']:
            if piece in GLASS:
                name, tint, alpha = GLASS[piece]
                if name not in glass_index:
                    glass_index[name] = len(materials)
                    materials.append({'name': name, 'alphaMode': 'BLEND', 'doubleSided': True,
                                      'pbrMetallicRoughness': {'baseColorFactor': tint + [alpha], 'metallicFactor': 0.0,
                                                               'roughnessFactor': 0.05}})
                prim['material'] = glass_index[name]
            else:
                prim['material'] = material_for(prim['material'])
        mesh['name'] = piece
        new_nodes.append({'name': piece, 'mesh': len(meshes), 'matrix': matrix.T.reshape(-1).tolist()})
        meshes.append(mesh)

    # Textures: only the used ones, renumbered.
    used = sorted({m['name'] for m in materials if not m['name'].endswith('_glass')})
    renamed = fix_textures(source, out, used)
    images, textures, tex_index = [], [], {}

    def texture_for(info):
        old = g['images'][g['textures'][info['index']]['source']]['uri']
        if old not in tex_index:
            tex_index[old] = len(textures)
            textures.append({'sampler': 0, 'source': len(images)})
            images.append({'uri': renamed[old]})
        info['index'] = tex_index[old]

    for mat in materials:
        pbr = mat.get('pbrMetallicRoughness', {})
        for holder, key in ((pbr, 'baseColorTexture'), (pbr, 'metallicRoughnessTexture'), (mat, 'normalTexture'),
                            (mat, 'occlusionTexture'), (mat, 'emissiveTexture')):
            if key in holder:
                texture_for(holder[key])

    out_g.update({'nodes': new_nodes, 'meshes': meshes, 'materials': materials, 'textures': textures, 'images': images,
                  'scenes': [{'name': 'pf9', 'nodes': list(range(len(new_nodes)))}]})
    os.makedirs(out, exist_ok=True)
    shutil.copyfile(os.path.join(source, g['buffers'][0]['uri']), os.path.join(out, g['buffers'][0]['uri']))
    with open(os.path.join(out, 'scene.gltf'), 'w') as f:
        json.dump(out_g, f)
    print(f'{out}: {len(new_nodes)} pieces, {len(materials)} materials, {len(images)} textures')


if __name__ == '__main__':
    main()
