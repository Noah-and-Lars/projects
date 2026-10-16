#!/usr/bin/env python3
"""Pack ambientCG 1K-JPG material zips into public/textures.

Usage: python3 scripts/pack-textures.py <zip dir> <out dir>

Writes <name>.alb.jpg (colour), <name>.nrm.jpg (OpenGL normal),
<name>.rgh.jpg (roughness) and <name>.ao.jpg per material listed below.
All sources are CC0 from https://ambientcg.com.
"""
import io
import os
import sys
import zipfile

from PIL import Image

# name used by the renderer -> ambientCG asset id
MATERIALS = {
    'asphalt': 'Asphalt025C',
    'paving': 'PavingStones128',
    'brick': 'Bricks094',
    'brick2': 'Bricks066',
    'concrete': 'Concrete042A',
    'concrete2': 'Concrete031',
    'corrugated': 'CorrugatedSteel007A',
    'metal': 'MetalPlates006',
}

MAPS = {
    'alb': ('_Color.jpg', 'RGB', 88),
    'nrm': ('_NormalGL.jpg', 'RGB', 94),
    'rgh': ('_Roughness.jpg', 'L', 85),
    'ao': ('_AmbientOcclusion.jpg', 'L', 85),
}

SIZE = 1024


def main(zip_dir: str, out_dir: str) -> None:
    os.makedirs(out_dir, exist_ok=True)
    for name, asset in MATERIALS.items():
        path = os.path.join(zip_dir, asset + '.zip')
        with zipfile.ZipFile(path) as z:
            for key, (suffix, mode, quality) in MAPS.items():
                member = f'{asset}_1K-JPG{suffix}'
                if member not in z.namelist():
                    print(f'  {asset}: missing {suffix}, skipping')
                    continue
                im = Image.open(io.BytesIO(z.read(member))).convert(mode)
                if im.size != (SIZE, SIZE):
                    im = im.resize((SIZE, SIZE), Image.LANCZOS)
                out = os.path.join(out_dir, f'{name}.{key}.jpg')
                im.save(out, 'JPEG', quality=quality, optimize=True)
        print(f'{name} <- {asset}')


if __name__ == '__main__':
    if len(sys.argv) != 3:
        print(__doc__)
        sys.exit(2)
    main(sys.argv[1], sys.argv[2])
