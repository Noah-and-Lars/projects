#!/usr/bin/env python3 -I
# The credits list for the game from cars_final.json + each model's Sketchfab metadata.
import json, os, sys
HERE = os.path.dirname(os.path.abspath(__file__)); S = os.path.dirname(HERE)
cars = json.load(open(os.path.join(HERE, 'cars_final.json')))
NAMES = {'sedan': 'Saloon', 'hatch': 'Hatchback', 'suv': 'SUV', 'van': 'Van', 'pickup': 'Pickup', 'muscle': 'Muscle car', 'sports': 'Sports car', 'coupe': 'Coupe', 'super': 'Hypercar', 'police': 'Police cruiser'}
rows = []
for cid, spec in cars.items():
    m = json.load(open(os.path.join(S, 'skfb-dl', spec['uid'], '_meta.json')))
    rows.append(dict(what=NAMES.get(cid, cid), title=m['name'], author=m['user'], url=m['url'], licence=m['license']))
json.dump(rows, open(os.path.join(S, 'out-final', 'credits.json'), 'w'), indent=1)
# the one-line JS string the game shows in Settings
parts = ['"%s" by %s' % (r['title'].replace('"', "'"), r['author']) for r in rows]
print("const CREDITS = 'Car models (Sketchfab, CC Attribution): " + ', '.join(parts).replace("'", "\\'") + ". Sky and road textures: Poly Haven (CC0).';")
