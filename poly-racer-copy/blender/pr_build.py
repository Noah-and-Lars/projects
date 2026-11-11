# Build one car (or all) from cars.json with pr_export, in headless Blender:
#   blender -b --python pr_build.py -- <out-models-dir> <car-id|all>
import bpy, sys, os, json
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE)
import pr_export
S = os.path.dirname(HERE)
argv = sys.argv[sys.argv.index('--') + 1:]
out_dir, which = argv[0], argv[1]
CARS = json.load(open(os.path.join(HERE, 'cars.json')))
os.makedirs(os.path.join(out_dir, 'tex'), exist_ok=True)
report = {}
for cid, spec in CARS.items():
    if which != 'all' and cid != which: continue
    meta = json.load(open(os.path.join(S, 'skfb-dl', spec['uid'], '_meta.json')))
    spec = dict(spec, id=cid, gltf=meta['file'])
    hdr, m, log = pr_export.build_car(spec, os.path.join(out_dir, cid + '.fcm'), os.path.join(out_dir, 'tex'), cid)
    report[cid] = dict(meta=m, parts={k: dict(v=v['v'], tris=v['i'] // 3, groups=[(g['k'], g.get('tex'), g.get('ntex'), g.get('rtex')) for g in v['groups']]) for k, v in hdr['parts'].items()}, log=log,
                       credit=dict(title=meta['name'], author=meta['user'], url=meta['url'], licence=meta['license']))
    json.dump(report[cid], open(os.path.join(out_dir, cid + '.report.json'), 'w'), indent=1)
print('BUILT', list(report))
