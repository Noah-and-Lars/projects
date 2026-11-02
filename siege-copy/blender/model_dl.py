"""Download Poly Haven models (CC0) as glTF with 1k textures.
python3 -I model_dl.py <out-dir> <id> ...  ->  <out-dir>/<id>/<id>.gltf + bin + textures/, meta.json"""
import sys, os, json, urllib.request

def get(url):
    req = urllib.request.Request(url, headers={'User-Agent': 'arcade-siege-asset-tool'})
    with urllib.request.urlopen(req, timeout=180) as r:
        return r.read()

out = sys.argv[1]
for aid in sys.argv[2:]:
    d = os.path.join(out, aid)
    if os.path.exists(os.path.join(d, 'meta.json')): continue
    try:
        files = json.loads(get(f'https://api.polyhaven.com/files/{aid}'))
        g = files['gltf']['1k']['gltf']
        os.makedirs(d, exist_ok=True)
        open(os.path.join(d, os.path.basename(g['url'])), 'wb').write(get(g['url']))
        for rel, inc in g.get('include', {}).items():
            p = os.path.join(d, rel); os.makedirs(os.path.dirname(p), exist_ok=True)
            open(p, 'wb').write(get(inc['url']))
        info = json.loads(get(f'https://api.polyhaven.com/info/{aid}'))
        json.dump({'src': 'polyhaven', 'id': aid, 'name': info.get('name'), 'license': 'CC0', 'dims_mm': info.get('dimensions'), }, open(os.path.join(d, 'meta.json'), 'w'))
        print('ok', aid)
    except Exception as e:
        print('FAIL', aid, e)
