"""Turns the downloaded, animated Makarov PM with its own arms into the
game's ninth gun.

The model is "Makarov PM FPS animations" by Cransh (CC BY 4.0, see
README.md, Credits):
https://sketchfab.com/3d-models/makarov-pm-fps-animations-d02ebd58e3cf44acb7af73e3f156be28
Download its glTF version and unzip it so that the folder holds scene.gltf
and scene.bin, with its textures either in textures/ (as scene.gltf names
them) or loose beside scene.gltf. Then, from the project-fish folder:

    blender --background --python tools/blender/convert_makarov.py -- build/upload-makarov build/makarov-raw.glb

(npm run build-makarov does this and compresses the result into
assets/makarov.glb.)

It's made by the same maker as the FN 502, and the download is the same
kind (cransh_rig.py reads both): one skeleton holds the arms (Cransh's own
gloved hands and sleeves) and the gun (frame, slide, trigger, hammer,
magazine), with its own camera, and five clips: MK_Idle (a loop of the
hands breathing), MK_walk, MK_Shot (one shot), MK_ReloadFast (with rounds
left: the slide doesn't move) and MK_ReloadFull (from empty: after the
fresh magazine goes in, the support hand racks the slide). There are no
draw, put-away, inspect or run clips, and none with the slide locked back.
This script keeps the skeleton, the skinning and the keys, and only:
- Turns and scales everything into gun space (metres, +X right, +Y up, -Z
  forward), with the rig's root at the eye the maker framed it from (the
  download's camera, on its head bone), so putting the rig at the gun
  layer's camera shows the gun as its maker framed it.
- Makes it real size: the download is 1 / SCALE times bigger than a
  Makarov PM (161 mm long), so everything (gun, arms, animation) is scaled
  by SCALE. From the eye this changes nothing.
- Keeps the five clips with every key as made (idle, walk, shoot, reload,
  reloadEmpty). Every clip is given every bone any clip moves (a bone a
  clip leaves alone is held where it rests). Nothing is added, retimed or
  re-posed.
- Leaves out the gun's attachments: the download's second gun mesh is a
  suppressor (on the frame bone, screwed on past the muzzle) and a small
  red dot sight on a side mount (on the slide bone: its body, its glass and
  its glowing dot, which is what the mesh's emissive texture lights, with a
  faint glow on the glass), none of which a Makarov PM has; the gun has its
  own sights. Also left out: the IK pole targets, the head bone the camera
  hangs on (nothing is weighted to it) and the bones' `_end` tips.
- Adds a node on the gun's frame bone, `gun`, turned so that over the idle
  loop it's lined up with gun space on average, moved to the frame bone:
  the game measures the gun's points in it and hangs the muzzle flash on
  it, and its sights then stay on the middle of the screen as the hands
  breathe.
- Textures: kept as made (metal/roughness), at 2048 px (the gun's are
  4096 px on the download, the arms' 2048), stored as WebP. The download's
  normal maps for the gun and the arms (makarov_material_normal.png and
  material_normal.png) are used when they're in the folder (or textures/);
  without them those materials have none, and a rebuild picks them up. The
  textures carry no maker's marks or logos; a faint stamp on the frame is
  rubbed off all the same (RUB_OUT).
- Keeps who made it and its license in the file (asset.copyright).
- Names the parts, bones, materials and animations plainly.

The game's constants for this gun (MODEL_MAKAROV in src/viewmodel/
makarov.js) are printed at the end (MAKAROV ...), measured from the result.
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
from cransh_rig import Gun, convert, measure  # noqa: E402
from rigged_gltf import Writer, find, read_gltf, webp_bytes, write_clips, write_mesh, write_rig  # noqa: E402
from texture_edit import deviation_mask, image_array, rub_out, store  # noqa: E402

ARGS = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else sys.argv[1:]
SOURCE, OUT_GLB = ARGS[0], ARGS[1]

# --- Placing it ---------------------------------------------------------------
# The download's armature is Z up with the muzzle towards -Y, as the FN
# 502's. Its gun is GUN_LENGTH units long along the bore, from the back of
# the hammer to the muzzle; a Makarov PM is 161 mm.
GUN_LENGTH = 0.20403
SCALE = 0.161 / GUN_LENGTH  # download units to metres
# The eye: the download's camera (on its head bone).
CAMERA_NODE = 'Camera'
# Where the ejection port's middle is: this far (metres) in front of the rear
# sight.
PORT_AHEAD = 0.046

# The clips: ours, and the download's animation each is (all of it).
CLIPS = [
    ('idle', 'MK_Idle', None),
    ('walk', 'MK_walk', None),
    ('shoot', 'MK_Shot', None),
    ('reload', 'MK_ReloadFast', None),
    ('reloadEmpty', 'MK_ReloadFull', None),
]
# The idle loop is sampled this often (seconds) for where the gun rests on
# average.
REST_STEP = 1 / 60

# The gun's bones (download names, less their numbered endings) and ours
# (the arms' are cransh_rig.arm_bones). The head bone holds only the camera.
BONES = {'Body': 'frame_j', 'Slide': 'slide_j', 'Trig': 'trigger_j', 'Hammer': 'hammer_j', 'Mag': 'mag_j'}
DROPPED = {'Head_Cam'}

MESHES = {'mesh_Mat_0': 'arms', 'Makarov_base_makarov_material_0': 'gun'}
# The arms' points (and normals, but not their faces' winding) are stored
# mirrored through the origin (every coordinate negated) and 10,000 times
# too big for their skin (an export fault: as
# they stand they'd be drawn tens of metres across). Taken back into the
# skin's space, they lie where the FN 502's arms do on the same skeleton.
ARMS_FIX = np.diag([-1e-4, -1e-4, -1e-4, 1.0])
DROPPED_MESHES = {'Makarov_base_makarov_attachments_material_0'}
MATERIALS = {'material': 'makarov_arms', 'makarov_material': 'makarov_gun'}

# --- Textures -------------------------------------------------------------------
SIZE = 2048
WEBP_QUALITY = 90
# Marks rubbed off the gun's textures: boxes in the download's 4096 px
# textures (x0, y0, x1, y1, rows from the top), where whatever stands out
# from its surroundings is filled from round it.
RUB_OUT = [
    (3040, 3535, 3140, 3572),  # frame: a faint stamp
]
STANDS_OUT = (0.05, 0.08, 0.06)

# Who made it and its license (from its license.txt), in asset.extras as the
# other models keep them.
EXTRAS = {
    'title': 'Makarov PM FPS animations',
    'source': 'https://sketchfab.com/3d-models/makarov-pm-fps-animations-d02ebd58e3cf44acb7af73e3f156be28',
    'author': 'Cransh (https://sketchfab.com/ccransh)',
    'license': 'CC-BY-4.0 (http://creativecommons.org/licenses/by/4.0/)',
}

COPYRIGHT = ('This work is based on "Makarov PM FPS animations" '
             '(https://sketchfab.com/3d-models/makarov-pm-fps-animations-d02ebd58e3cf44acb7af73e3f156be28) '
             'by Cransh (https://sketchfab.com/ccransh) licensed under CC-BY-4.0 '
             '(http://creativecommons.org/licenses/by/4.0/). '
             'Changed for Project Fish: turned, scaled to real size and placed for the game, its arms\' points taken '
             'back into their skin\'s space, its attachments '
             '(a suppressor and a red dot sight) left out, a faint stamp rubbed off, textures shrunk and stored '
             'as WebP, compressed.')


def plain_uv(g, material, uv):
    """The texture coordinates as they are (no texture transforms here), and
    the wrapping of the material's textures."""
    pbr = material.get('pbrMetallicRoughness', {})
    infos = [i for i in (pbr.get('baseColorTexture'), pbr.get('metallicRoughnessTexture'),
                         material.get('normalTexture')) if i]
    assert not any(i.get('extensions') or i.get('texCoord') for i in infos), 'unexpected texture transform'
    samplers = {json.dumps(g['samplers'][g['textures'][i['index']]['sampler']]) for i in infos}
    assert len(samplers) == 1, 'the textures are wrapped differently'
    sampler = json.loads(samplers.pop())
    return uv, (sampler.get('wrapS', 10497), sampler.get('wrapT', 10497))


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
    """Each kept material's textures as WebP bytes (colour, metal_rough and,
    if the download has it, normal), and its factors."""
    tex = lambda info: g['images'][g['textures'][info['index']]['source']]['uri']  # noqa: E731
    mats = {m['name']: m for m in g['materials']}
    out = {}
    for name, key in (('material', 'arms'), ('makarov_material', 'gun')):
        m = mats[name]
        pbr = m['pbrMetallicRoughness']
        assert pbr.get('baseColorFactor', [1, 1, 1, 1]) == [1, 1, 1, 1] and 'emissiveTexture' not in m
        colour = image_array(load(find(SOURCE, tex(pbr['baseColorTexture']), required=True), True))
        mr = image_array(load(find(SOURCE, tex(pbr['metallicRoughnessTexture']), required=True), False))
        normal_uri = tex(m['normalTexture']) if 'normalTexture' in m else None
        normal_path = find(SOURCE, normal_uri) if normal_uri else None
        normal = image_array(load(normal_path, False)) if normal_path else None
        if not normal_path:
            log(f'{key}: no normal map in the download ({normal_uri or "none named"}): left without one')
        if key == 'gun':
            k = SIZE / 4096
            maps = [colour, mr] + ([normal] if normal is not None else [])
            for box4096 in RUB_OUT:
                box = (int(math.floor(box4096[0] * k)), int(math.floor(box4096[1] * k)),
                       int(math.ceil(box4096[2] * k)), int(math.ceil(box4096[3] * k)))
                rub_out(maps, box, deviation_mask(maps, box, STANDS_OUT), normal=2 if normal is not None else None)
            log(f'gun: {len(RUB_OUT)} marks rubbed off')
        log(f'{key}: metalness {mr[..., 2].mean() * pbr.get("metallicFactor", 1):.3f} on average, '
            f'roughness {mr[..., 1].mean() * pbr.get("roughnessFactor", 1):.3f}')
        # (Red is unused: there's no ambient occlusion in it.)
        mr[..., 0] = 1
        mr[..., 3] = 1
        colour[..., 3] = 1
        out[f'{key}_colour'] = webp_bytes(new_image(f'{key}_colour', colour, True), f'{key}_colour', WEBP_QUALITY,
                                          'project-fish-makarov')
        out[f'{key}_metal_rough'] = webp_bytes(new_image(f'{key}_metal_rough', mr), f'{key}_metal_rough',
                                               WEBP_QUALITY, 'project-fish-makarov')
        if normal is not None:
            normal[..., 3] = 1
            out[f'{key}_normal'] = webp_bytes(new_image(f'{key}_normal', normal), f'{key}_normal', WEBP_QUALITY,
                                              'project-fish-makarov')
        out[f'{key}_factors'] = {k: pbr[k] for k in ('metallicFactor', 'roughnessFactor') if k in pbr}
    return out


# --- Writing the file -----------------------------------------------------------

def write_glb(rig, meshes, clips, images, gun_turn, path):
    w = Writer('Project Fish convert_makarov.py', COPYRIGHT, EXTRAS)
    g = w.g
    first = write_rig(w, 'makarov', rig, 'frame_j', gun_turn)
    material_index = {}
    for key, name in (('arms', 'makarov_arms'), ('gun', 'makarov_gun')):
        wrap_s, wrap_t = meshes[key]['wraps']
        sampler = {'magFilter': 9729, 'minFilter': 9987, 'wrapS': wrap_s, 'wrapT': wrap_t}
        if sampler not in g['samplers']:
            g['samplers'].append(sampler)
        at = g['samplers'].index(sampler)
        pbr = {'baseColorTexture': w.texture(name, images[f'{key}_colour'], at),
               'metallicRoughnessTexture': w.texture(f'{name}_metal_rough', images[f'{key}_metal_rough'], at),
               **images[f'{key}_factors']}
        m = {'name': name, 'doubleSided': True, 'pbrMetallicRoughness': pbr}
        if f'{key}_normal' in images:
            m['normalTexture'] = w.texture(f'{name}_normal', images[f'{key}_normal'], at)
        g['materials'].append(m)
        material_index[name] = len(g['materials']) - 1
    for name in ('arms', 'gun'):
        # (Named apart from the `gun` node.)
        write_mesh(w, f'makarov_{name}', meshes[name], material_index[meshes[name]['material']])
    write_clips(w, clips, first)
    w.write(path)


def main():
    started = time.time()
    g, accessor = read_gltf(SOURCE)
    log('bones', sum(len(s['joints']) for s in g['skins']), 'meshes', [m['name'] for m in g['meshes']],
        'animations', [a['name'] for a in g['animations']])
    duration = max(float(accessor(s['input'])[-1, 0]) for a in g['animations'] if a['name'].endswith('MK_Idle')
                   for s in a['samplers'])
    rest_times = np.arange(0, duration, REST_STEP)
    gun = Gun(BONES, MESHES, MATERIALS, SCALE, CLIPS, plain_uv, PORT_AHEAD, camera_node=CAMERA_NODE,
              dropped=DROPPED, dropped_meshes=DROPPED_MESHES, rest_times=rest_times,
              mesh_fix={'mesh_Mat_0': ARMS_FIX}, own_frame='slide')
    rig, meshes, clips = convert(g, accessor, gun)
    info, gun_turn = measure(rig, meshes, clips, gun, event_clips=('shoot', 'reload', 'reloadEmpty', 'walk', 'idle'),
                             parts=True)
    assert abs(info['gun_length'] - 0.161) < 0.001, f'the gun is {info["gun_length"]} m long'
    bpy.ops.wm.read_factory_settings(use_empty=True)
    images = textures(g)
    log('textures', {k: f'{len(v) / 1e3:.0f} kB' for k, v in images.items() if isinstance(v, bytes)})
    write_glb(rig, meshes, clips, images, gun_turn, OUT_GLB)
    log('wrote', OUT_GLB, f'{os.path.getsize(OUT_GLB) / 1e6:.2f} MB')
    info['clips'] = {k: round(c['duration'], 4) for k, c in clips.items()}
    print('MAKAROV ' + json.dumps(info))
    log(f'done in {time.time() - started:.0f} s')


main()
