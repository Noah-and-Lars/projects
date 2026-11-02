"""Sleeve texture for the first-person arms: cloth folds as a height field, turned into a normal map and crease
shading, over a tiled canvas weave.
python3 -I tex_sleeve.py <fabric-dl-dir> <out-dir>
The texture wraps once round a sleeve (u) and runs once along it (v), as three.js' CylinderGeometry maps it.
Writes hand_sleeve.jpg (colour with crease shading) and hand_sleeve_nrm.jpg (OpenGL normal)."""
import sys, os
import numpy as np
from PIL import Image, ImageFilter
FAB, OUT = sys.argv[1], sys.argv[2]
N = 1024; R, LEN = 0.045, 0.3
u = (np.arange(N) + 0.5) / N; v = (np.arange(N) + 0.5) / N
U, V = np.meshgrid(u, v)          # rows = v (along), columns = u (round)
a = U * 2 * np.pi
rng = np.random.default_rng(7)
ends = np.exp(-((V - 0.06) / 0.17) ** 2) + 1.4 * np.exp(-((V - 0.94) / 0.2) ** 2)
h = np.zeros_like(U)
for _ in range(11):                                   # rings that wander round the arm: compression folds and wrinkles
    f = rng.uniform(14, 34); ph = rng.uniform(0, 6.28); tilt = rng.uniform(-1.2, 1.2); k = rng.integers(1, 3); amp = rng.uniform(0.5, 1.0)
    h += amp * np.sin(V * f * 2 * np.pi * 0.35 + tilt * np.sin(a * k + ph) + ph) * (0.18 + ends)
h *= 0.0013                                            # metres
h += 0.0018 * np.sin(a * 3 + V * 7) * ends              # broad lobes where the cloth gathers
seam = np.exp(-((U - 0.5) / 0.004) ** 2); h -= 0.0007 * seam
stitch = seam * (0.5 + 0.5 * np.sign(np.sin(V * 2 * np.pi * 60)))  # stitches along the seam
h -= 0.0003 * stitch
# normal map from the slope (u spans the circumference, v the length)
du = 2 * np.pi * R / N; dv = LEN / N
gx = (np.roll(h, -1, 1) - np.roll(h, 1, 1)) / (2 * du)
gy = (np.roll(h, -1, 0) - np.roll(h, 1, 0)) / (2 * dv)
nrm = np.stack([-gx, -gy, np.ones_like(h)], -1); nrm /= np.linalg.norm(nrm, axis=-1, keepdims=True)
# fabric weave normal, tiled 5 x 5, mixed in gently
fn = np.asarray(Image.open(os.path.join(FAB, 'Fabric066', 'nrm.jpg')).convert('RGB').resize((N // 5 + 1, N // 5 + 1)), np.float32) / 127.5 - 1
fn = np.tile(fn, (6, 6, 1))[:N, :N]
nrm = nrm + np.concatenate([fn[..., :2] * 0.35, np.zeros_like(fn[..., :1])], -1); nrm /= np.linalg.norm(nrm, axis=-1, keepdims=True)
# crease shading: lower than the neighbourhood = darker
blur = np.asarray(Image.fromarray(((h - h.min()) / (np.ptp(h) + 1e-9) * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(10)), np.float32) / 255 * np.ptp(h) + h.min()
cav = np.clip(1 + (h - blur) * 420, 0.55, 1.12)
col = np.asarray(Image.open(os.path.join(FAB, 'Fabric066', 'col.jpg')).convert('RGB').resize((N // 5 + 1, N // 5 + 1)), np.float32) / 255
col = np.tile(col, (6, 6, 1))[:N, :N]
g = col.mean(-1, keepdims=True); col = g + (col - g) * 0.6          # calmer colour; the game tints it
col = col * cav[..., None] * (0.92 + 0.08 * (1 - stitch[..., None]))
img = lambda x: Image.fromarray(np.clip(x * 255, 0, 255).astype(np.uint8))
img(col[::-1]).save(os.path.join(OUT, 'hand_sleeve.jpg'), quality=88)              # image row 0 is the top (v = 1)
img((nrm[::-1] + 1) / 2).save(os.path.join(OUT, 'hand_sleeve_nrm.jpg'), quality=92)
print('sleeve textures written')
