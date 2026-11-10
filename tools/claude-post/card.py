# Draws the post's picture: the game's thumbnail with a label and title. Prints {img, poster, w, h} (base64 JPEGs).
# python3 card.py <thumb> <pill> <title> <subtitle>
import base64, io, json, sys
from PIL import Image, ImageDraw, ImageFilter, ImageFont

thumb, pill, title, sub = sys.argv[1:5]
W, H = 1080, 1350


def font(size, bold=True):
    for f in (['DejaVuSans-Bold.ttf', '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', '/System/Library/Fonts/Supplemental/Arial Bold.ttf'] if bold
              else ['DejaVuSans.ttf', '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', '/System/Library/Fonts/Supplemental/Arial.ttf']):
        try:
            return ImageFont.truetype(f, size)
        except OSError:
            pass
    return ImageFont.load_default(size)


def cover(im, w, h):
    s = max(w / im.width, h / im.height)
    im = im.resize((round(im.width * s), round(im.height * s)), Image.LANCZOS)
    x, y = (im.width - w) // 2, (im.height - h) // 2
    return im.crop((x, y, x + w, y + h))


src = Image.open(thumb).convert('RGB')
card = cover(src, W, H).filter(ImageFilter.GaussianBlur(28))
card = Image.blend(card, Image.new('RGB', (W, H), (10, 12, 24)), 0.45)
if src.width / src.height > 1.5:  # wide pictures (the site's og.png) are shown whole
    shot = src.resize((W - 120, round((W - 120) * src.height / src.width)), Image.LANCZOS)
else:
    shot = cover(src, W - 120, 760)
mask = Image.new('L', shot.size, 0)
ImageDraw.Draw(mask).rounded_rectangle((0, 0, *shot.size), 36, fill=255)
card.paste(shot, (60, 90 + (760 - shot.height) // 2), mask)

d = ImageDraw.Draw(card)
colours = {'NEW GAME': (46, 204, 113), 'UPDATE': (79, 140, 255), 'NEW FEATURE': (255, 165, 50)}
pf = font(40)
pw = d.textlength(pill, font=pf)
d.rounded_rectangle((60, 900, 60 + pw + 56, 968), 34, fill=colours.get(pill, (79, 140, 255)))
d.text((88, 934), pill, font=pf, fill='white', anchor='lm')

size = 96
while size > 40 and d.textlength(title, font=font(size)) > W - 120:
    size -= 4
d.text((60, 1000), title, font=font(size), fill='white')
if sub:
    d.text((60, 1010 + size + 14), sub, font=font(48, False), fill=(200, 208, 230))
d.text((60, H - 70), 'The Arcade  ·  posted by Claude', font=font(32, False), fill=(160, 168, 190))


def jpg(im, q):
    b = io.BytesIO()
    im.save(b, 'JPEG', quality=q, optimize=True)
    return base64.b64encode(b.getvalue()).decode()


small = card.resize((288, 360), Image.LANCZOS)
print(json.dumps({'img': jpg(card, 86), 'poster': 'data:image/jpeg;base64,' + jpg(small, 70), 'w': W, 'h': H}))
