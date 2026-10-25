# Pack a Poly Haven sky for the game's Ultra setting: a 2048x1024 sRGB JPG of the sky (what the player sees) from
# the 2k HDR, and a small 512x256 .hdr (what lights and reflects in the cars). The JPG is exposed so the sky reads
# naturally; the sun disc clips to white.
#   blender -b --python sky_pack.py -- <in.hdr> <out-dir> <name> <exposure-ev>
import bpy, sys, os
import numpy as np
src, out, name = sys.argv[sys.argv.index('--') + 1:][:3]
bpy.ops.wm.read_factory_settings(use_empty=True)
img = bpy.data.images.load(src); W, H = img.size
px = np.array(img.pixels[:], dtype=np.float32).reshape(H, W, 4)[:, :, :3]
# small HDR for lighting: box-filter down to 512x256
f = W // 512
small = px.reshape(H // f, f, W // f, f, 3).mean(axis=(1, 3))
def write_hdr(path, rgb):
    h, w = rgb.shape[:2]
    m = rgb.max(axis=2); e = np.zeros(m.shape, np.int32); mant = np.zeros(m.shape, np.float32)
    nz = m > 1e-32; mant[nz], e[nz] = np.frexp(m[nz])
    scale = np.where(nz, mant / m * 256.0, 0)  # value * scale -> 0..256 mantissa
    rgbe = np.zeros((h, w, 4), np.uint8)
    for c in range(3): rgbe[:, :, c] = np.clip(rgb[:, :, c] * scale, 0, 255).astype(np.uint8)
    rgbe[:, :, 3] = np.where(nz, e + 128, 0).astype(np.uint8)
    with open(path, 'wb') as fp:
        fp.write(b'#?RADIANCE\nFORMAT=32-bit_rle_rgbe\n\n'); fp.write(('-Y %d +X %d\n' % (h, w)).encode())
        fp.write(rgbe[::-1].tobytes())   # Blender's pixel rows start at the bottom; Radiance's at the top
write_hdr(os.path.join(out, name + '_env.hdr'), np.minimum(small, 16.0))   # the sun clipped: the game's own sun light does the shadows
lum = px.max(axis=2); yy, xx = np.unravel_index(int(np.argmax(lum)), lum.shape)
sun_u = xx / W; sun_el = (yy / H - 0.5) * 180.0   # rows start at the bottom
# auto exposure for the visible sky: the bright 99.5th percentile of the sky (sun aside) lands at 0.85
sky = lum[H // 2:]   # the upper half: the sky, not the ground half of the sphere
med = float(np.median(sky)); p = float(np.percentile(sky[sky < 50], 99.5))
ev = float(min(np.log2(0.26 / max(med, 1e-5)), np.log2(0.92 / max(p, 1e-4)), 7.0)); scale = 2.0 ** ev
# the visible sky: exposure, then a soft shoulder so bright clouds keep detail; sRGB encode
v = px * scale
v = v / (1.0 + v * 0.12)   # gentle compression of the highlights (keeps the mid-tones nearly linear)
v = np.clip(v, 0, 1); srgb = np.where(v <= 0.0031308, v * 12.92, 1.055 * np.power(v, 1 / 2.4) - 0.055)
out_img = bpy.data.images.new('sky', W, H, alpha=False, float_buffer=False)
pix = np.ones((H, W, 4), np.float32); pix[:, :, :3] = srgb
out_img.pixels = pix.ravel().tolist()
out_img.file_format = 'JPEG'; bpy.context.scene.render.image_settings.file_format = 'JPEG'; bpy.context.scene.render.image_settings.quality = 88
out_img.filepath_raw = os.path.join(out, name + '_sky.jpg'); out_img.save()
import json; print('SKY', json.dumps({'name': name, 'sunU': round(float(sun_u), 4), 'sunEl': round(float(sun_el), 1), 'ev': round(ev, 2), 'mean': round(float(px.mean()), 4)}))
