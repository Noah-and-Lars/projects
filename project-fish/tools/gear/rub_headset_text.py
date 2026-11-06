"""Rubs the lettering and emblems off the headset's ear cups.

For "Tactical Headset - Game Ready" by Exactly (CC BY 4.0, see README.md
Credits): its colour texture (headset_baseColor.jpeg, 4096 px) has a unit
name, a line of smaller words and a bird emblem printed on each ear cup's
outer panel, and a small unit number on the headband slider. This takes them
away, leaving the panels' plain grained plastic:

    python3 -I tools/gear/rub_headset_text.py IN.jpeg OUT.png

How: in each box, the print is what's clearly lighter than the plastic
around it (the plastic's colour is a wide median of the box). Those pixels,
grown a little, get the plastic's smooth colour (filled in from the edges
inwards) plus the fine grain of plastic from elsewhere on the same panel, so
the panel reads as one surface.
"""
import sys
import numpy as np
from PIL import Image

src, dst = sys.argv[1], sys.argv[2]
im = np.asarray(Image.open(src).convert('RGB')).astype(np.float32)
H, W, _ = im.shape
S = W / 4096  # the boxes are in 4096 px texture pixels
rng = np.random.default_rng(11)

# (x0, y0, x1, y1): the two ear cups' print, and the slider's number.
BOXES = [(1590, 620, 2205, 1025), (2835, 710, 3270, 1310), (2745, 285, 2895, 600)]


def box_blur(a, r):
    """Mean over a (2r+1) square, edges clamped (separable, by cumulative sums)."""
    out = a
    for axis in (0, 1):
        pad = [(0, 0)] * a.ndim
        pad[axis] = (r + 1, r)
        p = np.pad(out, pad, mode='edge')
        c = np.cumsum(p, axis=axis, dtype=np.float64)
        n = out.shape[axis]
        hi = np.take(c, np.arange(2 * r + 1, 2 * r + 1 + n), axis=axis)
        lo = np.take(c, np.arange(0, n), axis=axis)
        out = ((hi - lo) / (2 * r + 1)).astype(np.float32)
    return out


def fill_smooth(colour, hole, steps=400):
    """Fills the hole with a smooth membrane from its edges (repeated averaging)."""
    out = colour.copy()
    known = ~hole
    # Start from the box's mean colour of known pixels.
    out[hole] = colour[known].mean(axis=0)
    for i in range(steps):
        r = 8 if i < steps // 2 else 2
        avg = box_blur(out, r)
        out[hole] = avg[hole]
    return out


total = 0
for bx0, by0, bx1, by1 in BOXES:
    x0, y0, x1, y1 = (int(round(v * S)) for v in (bx0, by0, bx1, by1))
    m = int(40 * S)  # margin of plain plastic around the print
    X0, Y0, X1, Y1 = max(0, x0 - m), max(0, y0 - m), min(W, x1 + m), min(H, y1 + m)
    box = im[Y0:Y1, X0:X1]
    lum = box @ np.array([0.299, 0.587, 0.114], np.float32)
    # The plastic around the print: its local level (a wide blur) and how
    # bright it is. The print is well above it.
    base = np.median(lum)
    inner = np.zeros(lum.shape, bool)
    inner[y0 - Y0:y1 - Y0, x0 - X0:x1 - X0] = True
    printed = inner & (lum > base + 22)
    # Grown a little, to take the soft edge and the print's dark outline with
    # it; and anything else in the box that isn't the plain plastic's colour
    # (the outline, the print's shading).
    grown = box_blur(printed.astype(np.float32), max(2, int(5 * S))) > 0.02
    grown |= inner & (box_blur((np.abs(lum - base) > 9).astype(np.float32), 2) > 0.3) & (box_blur(printed.astype(np.float32), int(30 * S)) > 0)
    grown = (box_blur(grown.astype(np.float32), 2) > 0) & (inner | (box_blur(inner.astype(np.float32), 3) > 0))
    # The plain plastic: no print near it, and the plastic's colour (not a
    # different part of the atlas).
    plastic = (~grown) & (np.abs(lum - base) < 12) & (box_blur(grown.astype(np.float32), 3) == 0)
    # Its smooth colour, and its fine grain (the box minus that).
    weight = box_blur(plastic.astype(np.float32), 6)[..., None]
    smooth_known = box_blur(np.where(plastic[..., None], box, 0), 6) / np.maximum(weight, 1e-3)
    grain = box - smooth_known
    hole = grown
    smooth = fill_smooth(np.where(plastic[..., None], smooth_known, box), hole)
    ty, tx = np.nonzero(hole)
    sy, sx = np.nonzero(plastic)
    # Grain copied in small patches (so it keeps its texture rather than
    # becoming noise): each 24 px block of the hole takes one random offset.
    blk = max(8, int(24 * S))
    out = box.copy()
    keys = (ty // blk) * 100000 + (tx // blk)
    for key in np.unique(keys):
        sel = keys == key
        yy, xx = ty[sel], tx[sel]
        for _ in range(40):
            j = rng.integers(len(sy))
            dy, dx = sy[j] - yy[0], sx[j] - xx[0]
            qy, qx = yy + dy, xx + dx
            ok = (qy >= 0) & (qy < box.shape[0]) & (qx >= 0) & (qx < box.shape[1])
            if ok.all() and plastic[qy, qx].mean() > 0.97:
                break
        qy = np.clip(qy, 0, box.shape[0] - 1)
        qx = np.clip(qx, 0, box.shape[1] - 1)
        out[yy, xx] = smooth[yy, xx] + grain[qy, qx] * plastic[qy, qx][:, None]
    # Soften the seam between filled and kept pixels a touch.
    edge = box_blur(hole.astype(np.float32), 1)
    edge = (edge * (1 - edge) * 4)[..., None]
    out = out * (1 - 0.5 * edge) + box_blur(out, 1) * (0.5 * edge)
    im[Y0:Y1, X0:X1] = out
    total += len(ty)
    print(f'box {(bx0, by0, bx1, by1)}: replaced {len(ty)} px')

Image.fromarray(np.clip(im, 0, 255).astype(np.uint8)).save(dst)
print(f'wrote {dst} ({total} px rubbed out)')
