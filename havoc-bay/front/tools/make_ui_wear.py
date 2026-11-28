# Makes the interface's wear textures: tileable, drawn from seeded noise, saved as small PNGs (grey + alpha) to embed in ui.css.
import numpy as np, base64, io, sys
from PIL import Image, ImageDraw, ImageFilter
rng = np.random.default_rng(7)

def vnoise(n, cells):  # periodic value noise, n x n, 'cells' lattice cells per side
    g = rng.random((cells, cells))
    idx = np.arange(n) * cells / n
    i0 = np.floor(idx).astype(int); f = idx - i0; f = f * f * (3 - 2 * f); i1 = (i0 + 1) % cells
    a = g[i0][:, i0]; b = g[i0][:, i1]; c = g[i1][:, i0]; d = g[i1][:, i1]
    fx = f[None, :]; fy = f[:, None]
    return (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy

def wrapblur(a, r):  # gaussian blur that wraps round the edges (done in the frequency domain, which is periodic by nature)
    n = a.shape[0]; f = np.fft.fftfreq(n); k = np.exp(-2 * (np.pi * r) ** 2 * (f[:, None] ** 2 + f[None, :] ** 2))
    return np.real(np.fft.ifft2(np.fft.fft2(a) * k))

def marks(n, draw_fn):  # draw on a 3x3 tiling so that marks crossing an edge come back in on the other side
    im = Image.new('F', (3 * n, 3 * n), 0.0); d = ImageDraw.Draw(im)
    def put(fn):
        for ox in (0, n, 2 * n):
            for oy in (0, n, 2 * n): fn(d, ox, oy)
    draw_fn(put)
    return np.asarray(im)[n:2 * n, n:2 * n]

def save_la(name, light, dark, quant=24):
    # light and dark are 0..1 strengths; the pixel is white where light wins, black where dark wins, alpha = strength
    val = np.where(light >= dark, 255, 0).astype(np.uint8)
    a = np.clip(np.maximum(light, dark), 0, 1)
    a = (np.round(a * quant) / quant * 255).astype(np.uint8)
    im = Image.merge('LA', (Image.fromarray(val), Image.fromarray(a)))
    buf = io.BytesIO(); im.save(buf, 'PNG', optimize=True); open(name + '.png', 'wb').write(buf.getvalue())
    open(name + '.b64', 'w').write(base64.b64encode(buf.getvalue()).decode())
    print(name, im.size, len(buf.getvalue()))

# 1. grain: fine paint / film grain, 128 px tile
n = 128
g = rng.normal(0, 1, (n, n)); g = .75 * g + .5 * wrapblur(g, 1.1) * 2.2
g /= g.std()
save_la('grain', np.clip(g, 0, 3) / 3 * .11, np.clip(-g, 0, 3) / 3 * .24, quant=20)

# 2. scuff: blotchy uneven tone, light scratches with a dark edge, chips, faint rub marks. 512 px tile
n = 512
blot = (vnoise(n, 3) - .5) * 1.0 + (vnoise(n, 7) - .5) * .7 + (vnoise(n, 17) - .5) * .4 + (vnoise(n, 41) - .5) * .25
blot = wrapblur(blot, 2.0)
def scratches(put):
    for _ in range(30):
        x, y = rng.random(2) * n; L = rng.uniform(18, 150) * (2.2 if rng.random() < .15 else 1)
        ang = rng.normal(0, .35) + (np.pi / 2 if rng.random() < .2 else 0) + rng.choice([0, np.pi])
        k = rng.uniform(.25, .9); w = 1 if rng.random() < .8 else 2
        # a slightly bent scratch: three segments
        pts = [(x, y)]; a = ang
        for s in range(3): a += rng.normal(0, .06); px, py = pts[-1]; pts.append((px + np.cos(a) * L / 3, py + np.sin(a) * L / 3))
        put(lambda d, ox, oy, pts=pts, k=k, w=w: d.line([(px + ox, py + oy) for px, py in pts], fill=float(k), width=w))
def chips(put):
    for _ in range(95):
        x, y = rng.random(2) * n; r = abs(rng.normal(0, 1.1)) + .5; k = rng.uniform(.35, 1)
        put(lambda d, ox, oy, x=x, y=y, r=r, k=k: d.ellipse([x + ox - r, y + oy - r * rng.uniform(.5, 1), x + ox + r, y + oy + r], fill=float(k)))
def rubs(put):  # short clusters of parallel hairlines, as left by something dragged across
    for _ in range(9):
        x, y = rng.random(2) * n; ang = rng.normal(0, .5); L = rng.uniform(40, 110)
        for j in range(int(rng.uniform(4, 9))):
            off = rng.normal(0, 5); l2 = L * rng.uniform(.4, 1); k = rng.uniform(.12, .4)
            x0 = x - np.sin(ang) * off + rng.normal(0, 8); y0 = y + np.cos(ang) * off
            put(lambda d, ox, oy, x0=x0, y0=y0, l2=l2, k=k, ang=ang: d.line([(x0 + ox, y0 + oy), (x0 + ox + np.cos(ang) * l2, y0 + oy + np.sin(ang) * l2)], fill=float(k), width=1))
sc = marks(n, scratches); sc = np.maximum(sc * .8, wrapblur(sc, .6))
ch = marks(n, chips); ch = wrapblur(ch, .5)
rb = marks(n, rubs)
shadow = np.roll(np.roll(sc, 1, 0), 1, 1)  # the dark lip under each scratch
fine = rng.normal(0, 1, (n, n))
light = np.clip(blot, 0, 1) * .22 + sc * .36 + rb * .42 + np.clip(fine, 0, 3) / 3 * .05
dark = np.clip(-blot, 0, 1) * .55 + ch * .42 + np.clip(shadow - sc, 0, 1) * .45 + np.clip(-fine, 0, 3) / 3 * .07
save_la('scuff', np.clip(light, 0, 1), np.clip(dark, 0, 1), quant=28)

# 3. chip mask: opaque, with small flecks and a few scratches knocked out. Used as a mask so that paint looks chipped. 256 px tile
n = 256
def flecks(put):
    for _ in range(110):
        x, y = rng.random(2) * n; r = abs(rng.normal(0, .8)) + .4
        put(lambda d, ox, oy, x=x, y=y, r=r: d.ellipse([x + ox - r, y + oy - r * rng.uniform(.4, 1), x + ox + r * rng.uniform(.6, 1.6), y + oy + r], fill=1.0))
    for _ in range(5):
        x, y = rng.random(2) * n; L = rng.uniform(10, 40); ang = rng.normal(0, .5)
        put(lambda d, ox, oy, x=x, y=y, L=L, ang=ang: d.line([(x + ox, y + oy), (x + ox + np.cos(ang) * L, y + oy + np.sin(ang) * L)], fill=1.0, width=1))
hole = marks(n, flecks)
worn = np.clip((vnoise(n, 6) - .8) * 7, 0, 1) * (rng.random((n, n)) < .22)  # patches where the paint has gone thin and speckled
hole = np.clip(hole + worn * 0, 0, 1)
alpha = (255 * (1 - hole * .92)).astype(np.uint8)
im = Image.merge('LA', (Image.new('L', (n, n), 255), Image.fromarray(alpha).quantize(8).convert('L')))
buf = io.BytesIO(); im.save(buf, 'PNG', optimize=True); open('chip.png', 'wb').write(buf.getvalue()); open('chip.b64', 'w').write(base64.b64encode(buf.getvalue()).decode())
print('chip', im.size, len(buf.getvalue()))

# a preview on a slate panel and on the red button
def comp(base, tex, rep):
    b = Image.new('RGBA', (rep * tex.size[0], rep * tex.size[1]), base)
    t = tex.convert('RGBA')
    for i in range(rep):
        for j in range(rep): b.alpha_composite(t, (i * tex.size[0], j * tex.size[1]))
    return b
sheet = Image.new('RGBA', (1536, 512), '#000')
sheet.paste(comp('#151d27', Image.open('scuff.png'), 1), (0, 0))
p2 = comp('#38464e', Image.open('scuff.png'), 1); sheet.paste(p2, (512, 0))
p3 = comp('#d2402b', Image.open('scuff.png'), 1); m = Image.open('chip.png').getchannel('A'); mm = Image.new('L', (512, 512)); [mm.paste(m, (i * 256, j * 256)) for i in range(2) for j in range(2)]
bg = Image.new('RGBA', (512, 512), '#151d27'); bg.paste(p3, (0, 0), mm); sheet.paste(bg, (1024, 0))
sheet.convert('RGB').save('preview.png')
