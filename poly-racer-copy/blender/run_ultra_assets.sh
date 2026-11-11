#!/bin/bash
S=/tmp/claude-0/-home-user-projects/d0a95e7f-e16f-5986-b679-e7f76acb878a/scratchpad; G=/home/user/projects/poly-racer-copy
mkdir -p $S/ultra/sky $S/ultra/tex $G/ultra/sky $G/ultra/tex
cd $S
: > $S/ultra/sky/manifest.txt
for k in morning:citrus_orchard_puresky noon:sunflowers_puresky afternoon:kloppenheim_05_puresky sunset:table_mountain_1_puresky night:qwantani_night_puresky moon:qwantani_moonrise_puresky cloudy:kloofendal_48d_partly_cloudy_puresky cloudysunset:drackenstein_quarry_puresky overcast:kloofendal_overcast_puresky fog:kloofendal_misty_morning_puresky snow:snow_field_puresky nightcloudy:kloppenheim_07_puresky dusk:qwantani_dusk_2_puresky; do
  n=${k%%:*}; f=${k##*:}
  src=$S/polyhaven/ultra/${f}_2k.hdr; [ -f $src ] || src=$S/polyhaven/${f}_2k.hdr
  timeout 600 ./blender/blender -b --python tools/sky_pack.py -- $src $S/ultra/sky $n 2>&1 | grep '^SKY' | tee -a $S/ultra/sky/manifest.txt
done
python3 -I - $S/ultra/sky/manifest.txt $G/ultra/sky/skies.json <<'PY'
import sys, json
rows = [json.loads(l[4:]) for l in open(sys.argv[1]) if l.startswith('SKY ')]
json.dump({r['name']: r for r in rows}, open(sys.argv[2], 'w'), indent=1); print('manifest', len(rows))
PY
cp $S/ultra/sky/*_sky.jpg $S/ultra/sky/*_env.hdr $G/ultra/sky/
[ -n "$SKIP_TEX" ] || python3 -I - $S/polyhaven/ultra $G/ultra/tex <<'PY'
import sys, os
from PIL import Image
src, dst = sys.argv[1:3]
# key: (poly haven name, size)
T = {'road': ('asphalt_track_2k', 2048), 'tarmac': ('asphalt_pit_lane_1k', 1024), 'grass': ('aerial_grass_rock_2k', 2048), 'gravel': ('gravel_floor_02_1k', 1024),
     'sand': ('coast_sand_04_1k', 1024), 'dirt': ('brown_mud_dry_1k', 1024), 'snow': ('snow_02_1k', 1024), 'concrete': ('concrete_floor_02_1k', 1024), 'leafy': ('leafy_grass_1k', 1024), 'forest': ('forest_floor_1k', 1024)}
for key, (name, size) in T.items():
    for tag in ('diff', 'nor', 'rough'):
        im = Image.open(os.path.join(src, '%s_%s.jpg' % (name, tag))).convert('RGB')
        if im.size[0] != size: im = im.resize((size, size), Image.LANCZOS)
        im.save(os.path.join(dst, '%s_%s.jpg' % (key, tag)), quality=86 if tag == 'diff' else 82, optimize=True)
    print('tex', key)
PY
du -sh $G/ultra; echo ULTRA_ASSETS_DONE
