"""Textures for the operator files written by sg_human.py.
python3 -I tex_chars.py <human-dir> <fabric-dl-dir> <out-dir>
Copies each op_<variant>.bin and makes the textures its parts name: skins and boots as they are (smaller), the
uniform and the gear fabric as neutral grey so the game can tint them with each operator's colours."""
import sys, os, json, shutil
from PIL import Image, ImageOps, ImageEnhance, ImageStat, ImageFilter

HUM, FAB, OUT = sys.argv[1], sys.argv[2], sys.argv[3]
os.makedirs(OUT, exist_ok=True)
SIZE = {'skin': 1024, 'cloth': 1024, 'boot': 512, 'glove': 512, 'eye': 256, 'brow': 256, 'vest': 512, 'helmet': 256}
def neutral(im, mean=0.62, contrast=0.75, blur=0):
    g = ImageOps.grayscale(im)
    if blur: g = g.filter(ImageFilter.GaussianBlur(blur))
    g = ImageOps.autocontrast(g, cutoff=1)
    g = ImageEnhance.Contrast(g).enhance(contrast)
    m = ImageStat.Stat(g).mean[0] / 255
    g = g.point(lambda v: max(0, min(255, int(v * mean / max(m, 0.05)))))
    return Image.merge('RGB', [g, g, g])
done = set()
for f in sorted(os.listdir(HUM)):
    if not (f.startswith('op_') and f.endswith('.bin')): continue
    shutil.copy(os.path.join(HUM, f), os.path.join(OUT, f))
    raw = open(os.path.join(HUM, f), 'rb').read(); hl = int.from_bytes(raw[:4], 'little'); H = json.loads(raw[4:4 + hl])
    for p in H['parts']:
        t, src, z = p.get('tex'), p.get('src'), p['zone']
        if not t or not src or t in done: continue
        if src.startswith('FAB:'): src = os.path.join(FAB, src[4:], 'col.jpg')
        im = Image.open(src)
        s = SIZE.get(z, 512)
        if z == 'brow':
            im = im.convert('RGBA').resize((s, s), Image.LANCZOS); im.save(os.path.join(OUT, t), optimize=True)
        else:
            im = im.convert('RGB').resize((s, s), Image.LANCZOS)
            if z == 'cloth': im = neutral(im, 0.62, 0.5, 1.2)
            elif z == 'vest': im = neutral(im, 0.62, 0.7)
            elif z == 'helmet': im = neutral(im, 0.7, 0.18, 3)
            im.save(os.path.join(OUT, t), quality=85, optimize=True, progressive=True)
        done.add(t); print(t, z)
print('total', sum(os.path.getsize(os.path.join(OUT, x)) for x in os.listdir(OUT)) // 1024, 'KB')
