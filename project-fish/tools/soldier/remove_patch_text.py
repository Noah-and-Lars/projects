"""Rubs the lettering off the soldier model's patches.

For "Soldier Full Tactical Gear" by DanlyVostok (CC BY 4.0, see README.md
Credits): its helmet texture atlas (Mark_Helmet1_baseColor.jpeg, 4096 px) holds
the chest and back patches, each with a word above three stripes, and a round
badge on the helmet (a skull in a ring of words). This takes the words away,
leaving the patches' plain woven fabric above the stripes, and blanks the
badge inside its stitched rim:

    python3 -I tools/soldier/remove_patch_text.py IN.jpeg OUT.jpeg
"""
import sys
import numpy as np
from PIL import Image
src, dst = sys.argv[1], sys.argv[2]
im = np.asarray(Image.open(src).convert('RGB')).astype(np.float64)
rng = np.random.default_rng(7)
# (x0, y0, x1, y1) of each patch's text band, full-size texture pixels.
BOXES = [(3708, 2598, 4072, 2665), (314, 3478, 380, 3882)]
def blur(a, r):
    k = np.ones(2 * r + 1) / (2 * r + 1)
    a = np.apply_along_axis(lambda v: np.convolve(v, k, mode='same'), 0, a)
    return np.apply_along_axis(lambda v: np.convolve(v, k, mode='same'), 1, a)
for x0, y0, x1, y1 in BOXES:
    box = im[y0:y1, x0:x1]
    lum = box @ [0.299, 0.587, 0.114]
    fabric = lum > np.percentile(lum, 70) * 0.72  # the light weave between the letters
    letters = ~fabric
    grown = blur(letters.astype(float), 2) > 0.05
    ys, xs = np.nonzero(~grown)
    out = box.copy()
    ty, tx = np.nonzero(grown)
    # For each lettered pixel, a fabric pixel from nearby along the band (keeps the weave's shading).
    along = (x1 - x0) > (y1 - y0)
    for y, x in zip(ty, tx):
        for _ in range(12):
            j = rng.integers(len(ys))
            if (abs(xs[j] - x) < 40) if along else (abs(ys[j] - y) < 40):
                break
        out[y, x] = box[ys[j], xs[j]]
    # Soften the seams a touch.
    edge = np.clip(blur(grown.astype(float), 1), 0, 1)[..., None]
    smooth = np.stack([blur(out[..., c], 1) for c in range(3)], -1)
    out = out * (1 - 0.35 * edge * (1 - edge) * 4) + smooth * (0.35 * edge * (1 - edge) * 4)
    im[y0:y1, x0:x1] = out
    print('patch', (x0, y0, x1, y1), 'replaced', len(ty), 'px')
# The round badge: (centre x, centre y, radius filled, (radii the fabric is taken from)).
BADGES = [(133.8, 3103.1, 80.0, (62.0, 78.0))]
for cx, cy, fill_r, (src0, src1) in BADGES:
    x0, y0, x1, y1 = int(cx - fill_r - 4), int(cy - fill_r - 4), int(cx + fill_r + 5), int(cy + fill_r + 5)
    box = im[y0:y1, x0:x1].copy()
    yy, xx = np.mgrid[y0:y1, x0:x1]
    d = np.hypot(xx - cx, yy - cy)
    lum = box @ [0.299, 0.587, 0.114]
    source = (d >= src0) & (d < src1) & (lum > 55)  # the light fabric between the letters
    sy, sx = np.nonzero(source)
    ty, tx = np.nonzero(d < fill_r)
    pick = rng.integers(len(sy), size=len(ty))
    out = box.copy()
    out[ty, tx] = box[sy[pick], sx[pick]]
    # A touch of blur so it reads as one weave, and a soft edge into the rim.
    smooth = np.stack([blur(out[..., c], 1) for c in range(3)], -1)
    inner = (d < fill_r - 1.5)[..., None]
    edge = np.clip((fill_r + 1 - d) / 2.5, 0, 1)[..., None]
    out = np.where(inner, smooth, out)
    im[y0:y1, x0:x1] = box * (1 - edge) + out * edge
    print('badge', (cx, cy), 'blanked', len(ty), 'px')
Image.fromarray(np.clip(im, 0, 255).astype(np.uint8)).save(dst, quality=95)
