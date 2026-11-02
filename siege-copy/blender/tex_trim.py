"""Game textures from the trims baked by sg_trim.py.
python3 -I tex_trim.py <trim-dir> <paint-dl-dir> <out-dir>
<name>.jpg = white satin paint x ambient occlusion (with a faint brush grain); <name>_n.jpg = normal (R, G) + roughness (B)."""
import sys, os
import numpy as np
from PIL import Image, ImageOps, ImageFilter
T, P, OUT = sys.argv[1], sys.argv[2], sys.argv[3]
grain = ImageOps.grayscale(Image.open(os.path.join(P, 'PaintedPlaster017', 'col.jpg'))).resize((512, 512), Image.LANCZOS)
g = np.asarray(grain, np.float32) / 255; g = 1 + (g - g.mean()) * 0.35
for name, (w, h) in (('wainscot', (512, 512)), ('crown', (512, 128))):
    ao = np.asarray(ImageOps.grayscale(Image.open(os.path.join(T, name + '_ao.png'))).resize((w, h), Image.LANCZOS), np.float32) / 255
    ao = np.clip(ao, 0.6, 1.0) ** 1.3                         # the corner specks of the bake stay light
    paint = np.array([0.93, 0.925, 0.9], np.float32)
    col = paint[None, None, :] * ao[..., None] * g[:h, :w, None]
    Image.fromarray(np.clip(col * 255, 0, 255).astype(np.uint8)).save(os.path.join(OUT, name + '.jpg'), quality=88)
    n = Image.open(os.path.join(T, name + '_nrm.png')).convert('RGB').resize((w, h), Image.LANCZOS)
    r, gg, _ = n.split()
    rough = Image.new('L', (w, h), int(0.42 * 255))
    Image.merge('RGB', [r, gg, rough]).save(os.path.join(OUT, name + '_n.jpg'), quality=92)
    print(name)
