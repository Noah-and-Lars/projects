# Draws a post picture, social-media style: the feature screenshots full-bleed, a label + "Game 1.4" at the top and the
# feature headline at the bottom. Reads JSON on stdin: {imgs: [paths], pill, kicker, headline}. Prints {img, poster, w, h}.
import base64, io, json, sys
from PIL import Image, ImageDraw, ImageFont

a = json.load(sys.stdin)
W, H = 1080, 1350


def font(size, bold=True):
    names = ['DejaVuSans-Bold.ttf', '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', '/System/Library/Fonts/Supplemental/Arial Bold.ttf'] if bold \
        else ['DejaVuSans.ttf', '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', '/System/Library/Fonts/Supplemental/Arial.ttf']
    for f in names:
        try:
            return ImageFont.truetype(f, size)
        except OSError:
            pass
    return ImageFont.load_default(size)


def cover(im, w, h):
    s = max(w / im.width, h / im.height)
    im = im.resize((max(w, round(im.width * s)), max(h, round(im.height * s))), Image.LANCZOS)
    x, y = (im.width - w) // 2, (im.height - h) // 2
    return im.crop((x, y, x + w, y + h))


ims = [Image.open(p).convert('RGB') for p in a['imgs'][:4]]
card = Image.new('RGB', (W, H), (10, 12, 24))
G = 6  # the gap between screenshots
if len(ims) == 1:
    card.paste(cover(ims[0], W, H), (0, 0))
elif len(ims) == 2:
    h = (H - G) // 2
    card.paste(cover(ims[0], W, h), (0, 0)); card.paste(cover(ims[1], W, H - h - G), (0, h + G))
else:
    h = (H - G) // 2
    card.paste(cover(ims[0], W, h), (0, 0))
    rest = ims[1:]
    w = (W - G * (len(rest) - 1)) // len(rest)
    for i, im in enumerate(rest):
        card.paste(cover(im, w, H - h - G), (i * (w + G), h + G))

# dark fades top and bottom so the words read on any picture
shade = Image.new('L', (1, H))
for y in range(H):
    t = 0.0
    if y < 260: t = 0.62 * (1 - y / 260)
    if y > H - 560: t = max(t, 0.9 * ((y - (H - 560)) / 560) ** 1.3)
    shade.putpixel((0, y), round(255 * t))
card = Image.composite(Image.new('RGB', (W, H), (6, 8, 18)), card, shade.resize((W, H)))

d = ImageDraw.Draw(card)
colours = {'NEW GAME': (46, 204, 113), 'UPDATE': (79, 140, 255), 'NEW FEATURE': (255, 165, 50)}
pf = font(36)
pill = a['pill']
pw = d.textlength(pill, font=pf)
d.rounded_rectangle((48, 48, 48 + pw + 48, 108), 30, fill=colours.get(pill, (79, 140, 255)))
d.text((72, 78), pill, font=pf, fill='white', anchor='lm')
if a.get('kicker'):
    d.text((48 + pw + 72, 78), a['kicker'].upper(), font=font(36), fill='white', anchor='lm', stroke_width=2, stroke_fill=(0, 0, 0))


def wrap(text, f, width):
    lines, cur = [], ''
    for word in text.split():
        t = (cur + ' ' + word).strip()
        if d.textlength(t, font=f) <= width or not cur: cur = t
        else: lines.append(cur); cur = word
    return lines + [cur] if cur else lines


head = a.get('headline') or ''
size = 104
while size > 52:
    lines = wrap(head, font(size), W - 96)
    if len(lines) <= 3: break
    size -= 6
lines = wrap(head, font(size), W - 96)[:3]
y = H - 110 - len(lines) * (size + 10)
for ln in lines:
    d.text((48, y), ln, font=font(size), fill='white', stroke_width=2, stroke_fill=(0, 0, 0))
    y += size + 10
d.text((48, H - 72), '@Claude  ·  The Arcade', font=font(32, False), fill=(205, 212, 232))


def jpg(im, q):
    b = io.BytesIO()
    im.save(b, 'JPEG', quality=q, optimize=True)
    return base64.b64encode(b.getvalue()).decode()


print(json.dumps({'img': jpg(card, 86), 'poster': 'data:image/jpeg;base64,' + jpg(card.resize((288, 360), Image.LANCZOS), 70), 'w': W, 'h': H}))
