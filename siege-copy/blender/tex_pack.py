"""Pack downloaded CC0 textures into the game's format.
python3 -I tex_pack.py <dl-dir> <out-dir>
For each game key: <key>.jpg (colour, sRGB) and <key>_n.jpg (R,G = OpenGL normal x,y; B = roughness).
Also writes tex.json: key -> {rep (metres per tile), src, id}."""
import sys, os, json
from PIL import Image, ImageOps, ImageEnhance, ImageDraw, ImageChops

DL, OUT = sys.argv[1], sys.argv[2]
os.makedirs(OUT, exist_ok=True)
S = 1024

# key: (asset id, metres per tile, colour fn)
def tint(rgb, amt=1.0):
    def f(im):
        g = ImageOps.grayscale(im)
        g = ImageEnhance.Contrast(g).enhance(1.2)
        t = Image.merge('RGB', [g.point(lambda v, c=c: int(v * c / 255)) for c in rgb])
        return Image.blend(im, t, amt)
    return f
def bright(k, sat=1.0):
    def f(im):
        im = ImageEnhance.Brightness(im).enhance(k)
        return ImageEnhance.Color(im).enhance(sat)
    return f
def stripes(im):  # painted stripes on plaster
    im = tint((88, 104, 92))(im); d = ImageDraw.Draw(im, 'RGBA')
    for x in range(0, S, 128):
        d.rectangle([x + 80, 0, x + 127, S], fill=(30, 44, 36, 70))
        d.rectangle([x + 78, 0, x + 80, S], fill=(200, 180, 120, 40))
    return im
def ceiling_grid(im):  # suspended ceiling tiles, 2 x 2 per texture
    im = bright(1.05, 0.6)(im); d = ImageDraw.Draw(im, 'RGBA')
    for i in range(3):
        p = i * S // 2
        d.rectangle([p - 6, 0, p + 6, S], fill=(150, 150, 146, 255)); d.rectangle([0, p - 6, S, p + 6], fill=(150, 150, 146, 255))
        d.rectangle([p - 7, 0, p - 6, S], fill=(60, 60, 60, 120)); d.rectangle([0, p + 6, S, p + 7], fill=(60, 60, 60, 120))
    return im
def ceiling_grid_n(nrm):  # grooves in the normal map too
    d = ImageDraw.Draw(nrm)
    for i in range(3):
        p = i * S // 2
        d.rectangle([p - 7, 0, p - 5, S], fill=60); d.rectangle([p + 5, 0, p + 7, S], fill=196)
    return nrm
def damask(im):  # burgundy plaster with a woven damask motif (2 x 4 per tile, like the original drawing)
    im = tint((104, 40, 44), 0.92)(im); im = ImageEnhance.Brightness(im).enhance(0.8)
    ov = Image.new('RGBA', (S, S), (0, 0, 0, 0)); d = ImageDraw.Draw(ov)
    for i in range(2):
        for j in range(4):
            cx = (i + .5 + (j % 2) * .5) * S / 2; cy = (j + .5) * S / 4
            for k in (0, S):
                x = (cx + k) % (S + 1) if cx + 0 > S else cx
                for dx in (-S, 0, S):
                    X = cx + dx
                    d.ellipse([X - 44, cy - 88, X + 44, cy + 88], fill=(214, 168, 104, 40))
                    d.ellipse([X - 26, cy - 60, X + 26, cy + 60], fill=(60, 14, 16, 46))
                    d.ellipse([X - 16, cy - 128, X + 16, cy - 72], fill=(214, 168, 104, 40))
                    d.ellipse([X - 16, cy + 72, X + 16, cy + 128], fill=(214, 168, 104, 40))
                break
    for x in range(0, S, 64): d.rectangle([x, 0, x + 3, S], fill=(0, 0, 0, 30))
    return Image.alpha_composite(im.convert('RGBA'), ov).convert('RGB')
def hazard(im):  # reinforcement plate with a hazard band at the bottom
    im = bright(1.15, 0.7)(im); d = ImageDraw.Draw(im, 'RGBA')
    for x in range(-S, S * 2, 96):
        d.polygon([(x, S), (x + 48, S), (x + 48 + 56, S - 56), (x + 56, S - 56)], fill=(205, 165, 20, 200))
    return im

KEYS = {
    'wood':      ('wood_floor_worn', 2.0, bright(0.66, 0.85)),
    'marble':    ('marble_01', 2.4, bright(0.74, 0.8)),
    'carpet':    ('Carpet008', 1.2, tint((150, 40, 44), 0.85)),
    'carpetB':   ('Carpet012', 1.0, bright(0.95)),
    'concrete':  ('concrete_floor_worn_001', 3.0, bright(0.85)),
    'tile':      ('checkered_pavement_tiles', 2.0, bright(1.25, 0.7)),
    'whiteTile': ('long_white_tiles', 1.2, bright(0.95)),
    'plaster':   ('plastered_wall_02', 2.5, bright(0.92, 0.3)),
    'damask':    ('plastered_wall_02', 2.2, damask),
    'stripes':   ('plastered_wall_02', 1.6, stripes),
    'panel':     ('wooden_panels', 2.0, bright(0.72)),
    'brick':     ('red_brick_03', 1.6, bright(0.95)),
    'block':     ('concrete_block_wall', 1.8, lambda im: ImageEnhance.Color(ImageEnhance.Brightness(im).enhance(1.45)).enhance(0.35)),
    'metal':     ('metal_plate_02', 1.5, hazard),
    'plank':     ('weathered_planks', 1.2, bright(0.95)),
    'ceiling':   ('ceiling_interior', 1.2, ceiling_grid),
    'stone':     ('patterned_cobblestone', 2.2, bright(1.05)),
    'grate':     ('metal_grate_rusty', 1.0, bright(1.0)),
    'asphalt':   ('asphalt_02', 4.0, bright(1.0)),
}
index = {}
for key, (aid, rep, fn) in KEYS.items():
    d = os.path.join(DL, aid); meta = json.load(open(os.path.join(d, 'meta.json')))
    col = Image.open(os.path.join(d, 'col.jpg')).convert('RGB').resize((S, S), Image.LANCZOS)
    if os.path.exists(os.path.join(d, 'ao.jpg')):
        ao = Image.open(os.path.join(d, 'ao.jpg')).convert('L').resize((S, S), Image.LANCZOS)
        col = ImageChops.multiply(col, Image.merge('RGB', [ao] * 3).point(lambda v: 90 + v * 165 // 255))
    col = fn(col)
    nrm = Image.open(os.path.join(d, 'nrm.jpg')).convert('RGB').resize((S, S), Image.LANCZOS)
    nr, ng, _ = nrm.split()
    if key == 'ceiling': nr = ceiling_grid_n(nr); ng = ceiling_grid_n(ng.transpose(Image.TRANSPOSE)).transpose(Image.TRANSPOSE)
    rp = os.path.join(d, 'rgh.jpg')
    rg = Image.open(rp).convert('L').resize((S, S), Image.LANCZOS) if os.path.exists(rp) else Image.new('L', (S, S), 200)
    col.save(os.path.join(OUT, key + '.jpg'), quality=84, optimize=True, progressive=True)
    Image.merge('RGB', [nr, ng, rg]).save(os.path.join(OUT, key + '_n.jpg'), quality=86, optimize=True)
    index[key] = {'rep': rep, 'src': meta['src'], 'id': aid}
    print(key, aid)
json.dump(index, open(os.path.join(OUT, 'tex.json'), 'w'), indent=1)
