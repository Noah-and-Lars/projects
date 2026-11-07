"""Turns the downloaded, animated FN 502 Tactical with its own arms into the
game's fourth gun.

The model is "FPS animations FN 502 Tactical" by Cransh (CC BY 4.0, see
README.md, Credits):
https://sketchfab.com/3d-models/fps-animations-fn-502-tactical-dad2ee1250054a63adaa81918887c0fe
Download its glTF version and unzip it so that the folder holds scene.gltf
and scene.bin, with its textures either in textures/ (as scene.gltf names
them) or loose beside scene.gltf. Then, from the project-fish folder:

    blender --background --python tools/blender/convert_fn502.py -- build/fn502-source build/fn502-raw.glb

(npm run build-fn502 does this and compresses the result into
assets/fn502.glb.)

Like the Beretta (convert_beretta.py), it comes with its own arms (gloved
hands and sleeves) and its own animations, and the game plays its maker's
clips as they are. One skeleton holds the arms and the gun (frame, slide,
trigger, hammer, magazine), and there are five clips: FN_Shot (one shot),
FN_Reload (with rounds left: the slide doesn't move), FN_ReloadFull (from
empty: after the fresh magazine goes in, the support hand racks the slide),
FN_Walk and FN_Run (the hands' sway walking and running). Every clip starts
and ends in the same pose, the one the gun rests in. There are no draw, put-
away or inspect clips, and none with the slide locked back. This script
keeps the skeleton, the skinning and the keys, and only:
- Turns and scales everything into gun space (metres, +X right, +Y up, -Z
  forward), with the rig's root at the eye the maker framed it from (the
  download's own camera, CAMERA), so putting the rig at the gun layer's
  camera shows the gun as its maker framed it. The bones' frames are
  turned too.
- Makes it real size: the download is SCALE times bigger than an FN 502
  Tactical (190 mm long), so everything (gun, arms, animation) is scaled by
  it. From the eye this changes nothing: the whole picture shrinks about it.
- Keeps the clips with every key as made (idle, shoot, reload, reloadEmpty,
  walk, run), and takes one more from them: idle, a still of the pose every
  clip starts in (FN_Shot's first frame). Every clip is given every bone
  any clip moves (a bone a clip leaves alone is held where it rests), so
  each sets the whole pose. Nothing is added, retimed or re-posed.
- Leaves out the two IK pole targets (no point is weighted to them) and the
  scale keys (all 1).
- Adds a node on the gun's frame bone, `gun`, turned so that in the idle
  pose its space is gun space moved to the frame bone (the gun is held
  turned a little onto its side): the game measures the gun's points in it
  and hangs the muzzle flash on it.
- Textures: the download's are specular/glossiness (KHR_materials_pbr-
  SpecularGlossiness, which three.js no longer reads), so they're turned
  into metal/roughness, texel by texel (as Khronos's converter does), and
  shrunk from 4096 px (ARMS_SIZE, GUN_SIZE, ORM_SIZE). The gun's are turned half round
  on the model (KHR_texture_transform): that's put into its texture
  coordinates instead. The maker's name and logos, its address, the model
  number, the serial and proof marks are rubbed off the gun's (RUB_OUT; the
  calibre and the magazine's round count stay). The arms' ambient
  occlusion goes in the red of their metal/roughness texture. All are
  stored as WebP.
- Keeps who made it and its license in the file (asset.copyright).
- Names the parts, bones, materials and animations plainly.

The game's constants for this gun (MODEL_FN502 in src/viewmodel/fn502.js)
are printed at the end (FN502 ...), measured from the result.
"""

import json
import math
import os
import sys
import time

import bpy
import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import linear_to_srgb, log  # noqa: E402
from cransh_rig import Gun, convert, measure  # noqa: E402
from rigged_gltf import Writer, inside, read_gltf, webp_bytes, write_clips, write_mesh, write_rig  # noqa: E402
from texture_edit import clone_over, deviation_mask, image_array, rub_out, store, to_linear  # noqa: E402

ARGS = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else sys.argv[1:]
SOURCE, OUT_GLB = ARGS[0], ARGS[1]

# --- Placing it ---------------------------------------------------------------
# The download's armature is Z up with the muzzle towards -Y (so its right is
# -X). Its gun is GUN_LENGTH units long along the bore, from the back of the
# slide to the front of the thread protector; an FN 502 Tactical is 190 mm.
GUN_LENGTH = 0.26853
SCALE = 0.19 / GUN_LENGTH  # download units to metres (0.708)
# The eye: the download's camera (an FBX camera, looking along its own +X,
# which in the armature's space is forward, -Y, with +Z up).
CAMERA_NODE = 'Camera'
# Where the ejection port's middle is: this far (metres) in front of the rear
# sight (from the model: the opening is 70-111 mm from the slide's back).
PORT_AHEAD = 0.075

# The clips: ours, and the download's animation each is (all of it), or for
# a still, the animation and the time it's taken at.
CLIPS = [
    ('idle', 'FN_Shot', 0.0),
    ('shoot', 'FN_Shot', None),
    ('reload', 'FN_Reload', None),
    ('reloadEmpty', 'FN_ReloadFull', None),
    ('walk', 'FN_Walk', None),
    ('run', 'FN_Run', None),
]

# The gun's bones (download names, less their numbered endings) and ours
# (the arms' are the same on every Cransh rig: cransh_rig.arm_bones). The
# IK pole targets are left out (the hands hang under their IK controls,
# which are kept: every bone's keys are baked).
BONES = {'Main': 'frame_j', 'Slide': 'slide_j', 'Trigger': 'trigger_j', 'Hammer': 'hammer_j', 'Mag': 'mag_j'}

MESHES = {'arms_arms_0': 'arms', '502_1_low.001_gun_0': 'gun'}
MATERIALS = {'arms': 'fn502_arms', 'material': 'fn502_gun'}

# --- Textures -------------------------------------------------------------------
ARMS_SIZE = 1024
GUN_SIZE = 1024
# (Their metalness, roughness and ambient occlusion are smooth enough at
# half that.)
ORM_SIZE = 512
WEBP_QUALITY = 88
# The specular colour a non-metal reflects (Khronos's converter's 4%).
DIELECTRIC = 0.04

# Markings rubbed off the gun's textures: (box in the download's 4096 px
# textures (x0, y0, x1, y1), how): 'letters' fills just what stands out
# (letters on a plain surface), 'fill' the whole box, 'clone' copies the
# patch beside it (for stippling).
RUB_OUT = [
    ((396, 560, 540, 1020), 'letters'),  # frame, right: the maker's address and the maker's line
    ((1396, 586, 1504, 812), 'letters'),  # slide, right: serial, proof and date marks
    ((1588, 1600, 1774, 1880), 'fill'),  # grip side: the maker's logo (all of its oval)
    ((2092, 866, 2296, 1048), 'letters'),  # slide, left: the maker's logo (the calibre above it stays)
    ((1986, 1296, 2384, 1424), 'letters'),  # frame: model, calibre and serial line
    ((3458, 1886, 3548, 2046), 'letters'),  # frame plate: serial and proof marks
    ((70, 3524, 256, 3706), 'clone'),  # grip back: the maker's logo
    ((888, 3524, 1076, 3706), 'clone'),  # grip back: the maker's logo, other side
    ((3212, 2812, 3348, 3048), 'letters'),  # slide: the model number
    ((2538, 2788, 2592, 2862), 'letters'),  # frame: proof marks
]
STANDS_OUT = (0.06, 0.08, 0.06)

# Who made it and its license (from its license.txt), in asset.extras as the
# other models keep them.
EXTRAS = {
    'title': 'FPS animations FN 502 Tactical',
    'source': 'https://sketchfab.com/3d-models/fps-animations-fn-502-tactical-dad2ee1250054a63adaa81918887c0fe',
    'author': 'Cransh (https://sketchfab.com/ccransh)',
    'license': 'CC-BY-4.0 (http://creativecommons.org/licenses/by/4.0/)',
}  # colour, normal map, specular/glossiness

COPYRIGHT = ('This work is based on "FPS animations FN 502 Tactical" '
             '(https://sketchfab.com/3d-models/fps-animations-fn-502-tactical-dad2ee1250054a63adaa81918887c0fe) '
             'by Cransh (https://sketchfab.com/ccransh) licensed under CC-BY-4.0 '
             '(http://creativecommons.org/licenses/by/4.0/). '
             'Changed for Project Fish: turned, scaled to real size and placed for the game, an idle still taken '
             'from its shot clip, markings rubbed off, materials turned into metal/roughness, textures shrunk and '
             'stored as WebP, compressed.')


# --- Reading the download -------------------------------------------------------

def texture_turn(g, material, uv):
    """A material's texture coordinates with its KHR_texture_transform (the
    same on all its textures: here a half turn about the origin) put into
    them, and the wrapping its textures need (wrapS, wrapT: repeated or
    mirrored, as the download's sampler has them)."""
    spec = material.get('extensions', {}).get('KHR_materials_pbrSpecularGlossiness', {})
    infos = [i for i in (spec.get('diffuseTexture'), spec.get('specularGlossinessTexture'),
                         material.get('normalTexture'), material.get('occlusionTexture')) if i]
    transforms = {json.dumps(i.get('extensions', {}).get('KHR_texture_transform')) for i in infos}
    samplers = {json.dumps(g['samplers'][g['textures'][i['index']]['sampler']]) for i in infos}
    assert len(transforms) == 1 and len(samplers) == 1, 'the textures are moved or wrapped differently'
    tt, sampler = json.loads(transforms.pop()), json.loads(samplers.pop())
    wraps = (sampler.get('wrapS', 10497), sampler.get('wrapT', 10497))
    if not tt:
        return uv, wraps
    assert set(tt) == {'rotation'} and abs(math.cos(tt['rotation']) + 1) < 1e-9, f'unexpected texture transform {tt}'
    # A half turn: (u, v) to (-u, -v). Mirrored, -x reads the same texel as
    # x; repeated, as 1 - x (for 0..1).
    out = uv.copy()
    for axis, wrap in enumerate(wraps):
        if wrap == 10497:
            assert uv[:, axis].min() > -1e-6 and uv[:, axis].max() < 1 + 1e-6
            out[:, axis] = 1 - uv[:, axis]
        else:
            assert wrap == 33648, wrap
    return out, wraps


# --- Textures -------------------------------------------------------------------

def load(path, colour, size):
    image = bpy.data.images.load(os.path.abspath(path))
    image.colorspace_settings.name = 'sRGB' if colour else 'Non-Color'
    image.scale(size, size)
    return image


def new_image(name, a, colour=False):
    h, w = a.shape[:2]
    image = bpy.data.images.new(name, w, h, alpha=True)
    image.colorspace_settings.name = 'sRGB' if colour else 'Non-Color'
    store(image, a.astype(np.float32))
    return image


def brightness(c):
    return np.sqrt(0.299 * c[..., 0] ** 2 + 0.587 * c[..., 1] ** 2 + 0.114 * c[..., 2] ** 2)


def metal_rough(diffuse, spec_gloss, spec_factor, gloss_factor):
    """Specular/glossiness texels (sRGB colour and specular, glossiness in
    the specular's alpha) as metal/roughness: base colour (sRGB), metalness
    and roughness, as Khronos's converter works them out."""
    d = to_linear(diffuse[..., :3])
    s = to_linear(spec_gloss[..., :3]) * np.asarray(spec_factor)
    strength = s.max(-1)
    one_minus = 1 - strength
    db, sb = brightness(d), brightness(s)
    a = DIELECTRIC
    b = db * one_minus / (1 - a) + sb - 2 * a
    c = a - sb
    metal = np.clip((-b + np.sqrt(np.maximum(b * b - 4 * a * c, 0))) / (2 * a), 0, 1)
    metal[sb < a] = 0
    from_diffuse = d * (one_minus / (1 - a) / np.maximum(1 - metal, 1e-6))[..., None]
    from_spec = (s - a * (1 - metal)[..., None]) / np.maximum(metal, 1e-6)[..., None]
    base = np.clip(from_diffuse + (from_spec - from_diffuse) * (metal * metal)[..., None], 0, 1)
    rough = 1 - spec_gloss[..., 3] * gloss_factor
    return linear_to_srgb(base), metal, rough


def textures(g):
    images = [inside(SOURCE, im['uri']) for im in g['images']]
    tex = lambda info: images[g['textures'][info['index']]['source']]  # noqa: E731
    mats = {m['name']: m for m in g['materials']}
    out = {}
    for name, size in (('arms', ARMS_SIZE), ('material', GUN_SIZE)):
        m = mats[name]
        sg = m['extensions']['KHR_materials_pbrSpecularGlossiness']
        assert sg.get('diffuseFactor', [1, 1, 1, 1]) == [1.0, 1.0, 1.0, 1.0]
        diffuse = image_array(load(tex(sg['diffuseTexture']), True, size))
        normal = image_array(load(tex(m['normalTexture']), False, size))
        spec = image_array(load(tex(sg['specularGlossinessTexture']), True, size))
        if name == 'material':
            k = size / 4096
            maps = [diffuse, normal, spec]
            for box4096, how in RUB_OUT:
                box = (int(math.floor(box4096[0] * k)), int(math.floor(box4096[1] * k)),
                       int(math.ceil(box4096[2] * k)), int(math.ceil(box4096[3] * k)))
                if how == 'letters':
                    rub_out(maps, box, deviation_mask(maps, box, STANDS_OUT), normal=1)
                elif how == 'fill':
                    rub_out(maps, box, None, normal=1)
                else:
                    clone_over(maps, box, guide=1)
            log(f'gun: {len(RUB_OUT)} markings rubbed off')
        # (Blender gives the glossiness of a grey-and-alpha image in alpha.)
        base, metal, rough = metal_rough(diffuse, spec, sg.get('specularFactor', [1, 1, 1]), sg.get('glossinessFactor', 1))
        log(f'{name}: metalness {metal.mean():.3f} on average ({(metal > 0.5).mean() * 100:.0f}% metal), '
            f'roughness {rough.mean():.3f}')
        colour = np.concatenate([base, np.ones(base.shape[:2] + (1,))], -1)
        orm = np.ones(base.shape[:2] + (4,))
        orm[..., 1], orm[..., 2] = rough, metal
        if 'occlusionTexture' in m:
            orm[..., 0] = image_array(load(tex(m['occlusionTexture']), False, size))[..., 0]
        key = 'arms' if name == 'arms' else 'gun'
        image = new_image(f'{key}_colour', colour, True)
        out[f'{key}_colour'] = webp_bytes(image, f'{key}_colour', WEBP_QUALITY, 'project-fish-fn502')
        image = new_image(f'{key}_orm', orm)
        image.scale(ORM_SIZE, ORM_SIZE)
        out[f'{key}_orm'] = webp_bytes(image, f'{key}_orm', WEBP_QUALITY, 'project-fish-fn502')
        out[f'{key}_normal'] = webp_bytes(new_image(f'{key}_normal', normal), f'{key}_normal', WEBP_QUALITY,
                                          'project-fish-fn502')
        out[f'{key}_occlusion'] = 'occlusionTexture' in m
    return out


# --- Writing the file -----------------------------------------------------------

def write_glb(rig, meshes, clips, images, gun_turn, path):
    w = Writer('Project Fish convert_fn502.py', COPYRIGHT, EXTRAS)
    g = w.g
    first = write_rig(w, 'fn502', rig, 'frame_j', gun_turn)
    material_index = {}
    for key, name in (('arms', 'fn502_arms'), ('gun', 'fn502_gun')):
        # (Its textures wrap as the download's did: the gun's are mirrored
        # across, its left side using its right side's texture.)
        wrap_s, wrap_t = meshes[key]['wraps']
        sampler = {'magFilter': 9729, 'minFilter': 9987, 'wrapS': wrap_s, 'wrapT': wrap_t}
        if sampler not in g['samplers']:
            g['samplers'].append(sampler)
        at = g['samplers'].index(sampler)
        orm = w.texture(f'{name}_metal_rough', images[f'{key}_orm'], at)
        m = {'name': name, 'doubleSided': True,
             'pbrMetallicRoughness': {'baseColorTexture': w.texture(name, images[f'{key}_colour'], at),
                                      'metallicRoughnessTexture': orm},
             'normalTexture': w.texture(f'{name}_normal', images[f'{key}_normal'], at)}
        if images[f'{key}_occlusion']:
            m['occlusionTexture'] = dict(orm)
        g['materials'].append(m)
        material_index[name] = len(g['materials']) - 1
    for name in ('arms', 'gun'):
        # (Named apart from the `gun` node.)
        write_mesh(w, f'fn502_{name}', meshes[name], material_index[meshes[name]['material']])
    write_clips(w, clips, first)
    w.write(path)


def main():
    started = time.time()
    g, accessor = read_gltf(SOURCE)
    log('bones', sum(len(s['joints']) for s in g['skins']), 'meshes', [m['name'] for m in g['meshes']],
        'animations', [a['name'] for a in g['animations']])
    gun = Gun(BONES, MESHES, MATERIALS, SCALE, CLIPS, texture_turn, PORT_AHEAD, camera_node=CAMERA_NODE)
    rig, meshes, clips = convert(g, accessor, gun)
    info, gun_turn = measure(rig, meshes, clips, gun)
    assert abs(info['gun_length'] - 0.19) < 0.001, f'the gun is {info["gun_length"]} m long'
    bpy.ops.wm.read_factory_settings(use_empty=True)
    images = textures(g)
    log('textures', {k: f'{len(v) / 1e3:.0f} kB' for k, v in images.items() if isinstance(v, bytes)})
    write_glb(rig, meshes, clips, images, gun_turn, OUT_GLB)
    log('wrote', OUT_GLB, f'{os.path.getsize(OUT_GLB) / 1e6:.2f} MB')
    info['clips'] = {k: round(c['duration'], 4) for k, c in clips.items()}
    print('FN502 ' + json.dumps(info))
    log(f'done in {time.time() - started:.0f} s')


main()
