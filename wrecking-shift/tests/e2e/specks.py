"""Dev helper: count isolated 1-pixel specks (T-junction cracks, fins, light leaks) in screenshots.
usage: python3 tests/e2e/specks.py out/a.png [out/b.png ...]   (optional: --zoom x,y -> writes a 8x crop next to the file)"""
import sys
import numpy as np
from PIL import Image

args = [a for a in sys.argv[1:] if not a.startswith('--')]
zoom = None
if '--zoom' in sys.argv:
    zoom = tuple(int(v) for v in sys.argv[sys.argv.index('--zoom') + 1].split(','))
    args = [a for a in args if a != sys.argv[sys.argv.index('--zoom') + 1]]
for f in args:
    im = Image.open(f).convert('RGB')
    g = np.asarray(im).astype(int).sum(axis=2)
    c = g[1:-1, 1:-1]
    n = [g[:-2, 1:-1], g[2:, 1:-1], g[1:-1, :-2], g[1:-1, 2:], g[:-2, :-2], g[2:, 2:], g[:-2, 2:], g[2:, :-2]]
    dark = np.all([x - c > 80 for x in n], axis=0)
    bright = np.all([c - x > 80 for x in n], axis=0)
    ys, xs = np.nonzero(dark)
    yb, xb = np.nonzero(bright)
    print(f, 'dark', len(ys), [(int(x) + 1, int(y) + 1) for x, y in zip(xs[:8], ys[:8])], 'bright', len(yb), [(int(x) + 1, int(y) + 1) for x, y in zip(xb[:8], yb[:8])])
    if zoom:
        x, y = zoom
        im.crop((x - 40, y - 22, x + 40, y + 23)).resize((640, 360), Image.NEAREST).save(f.replace('.png', '-zoom.png'))
