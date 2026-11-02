import sys
from PIL import Image
a_dir, b_dir, out = sys.argv[1], sys.argv[2], sys.argv[3]
names = sys.argv[4:]
rows = []
for n in names:
    a = Image.open(f'{a_dir}/{n}.png').convert('RGB').resize((640, 360)); b = Image.open(f'{b_dir}/{n}.png').convert('RGB').resize((640, 360))
    c = Image.new('RGB', (1280, 360)); c.paste(a, (0, 0)); c.paste(b, (640, 0)); rows.append(c)
sheet = Image.new('RGB', (1280, 360 * len(rows)))
for i, r in enumerate(rows): sheet.paste(r, (0, 360 * i))
sheet.save(out, quality=82)
