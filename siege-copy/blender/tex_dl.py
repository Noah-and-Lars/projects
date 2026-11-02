"""Download CC0 PBR textures (1k JPG) from Poly Haven (ph:<id>) or ambientCG (acg:<id>).
python3 -I tex_dl.py <out-dir> ph:wood_floor_worn acg:Carpet005 ...
Each lands in <out-dir>/<id>/ as col.jpg, nrm.jpg (OpenGL), rgh.jpg, plus meta.json."""
import sys, os, json, urllib.request, zipfile, io

def get(url):
    req = urllib.request.Request(url, headers={'User-Agent': 'arcade-siege-asset-tool'})
    with urllib.request.urlopen(req, timeout=120) as r:
        return r.read()

def ph(out, aid, res):
    files = json.loads(get(f'https://api.polyhaven.com/files/{aid}'))
    want = {'col': ['Diffuse', 'diff'], 'nrm': ['nor_gl'], 'rgh': ['Rough', 'rough'], 'ao': ['AO', 'ao']}
    got = {}
    for k, names in want.items():
        for n in names:
            if n in files and res in files[n] and 'jpg' in files[n][res]:
                open(os.path.join(out, k + '.jpg'), 'wb').write(get(files[n][res]['jpg']['url'])); got[k] = n; break
    info = json.loads(get(f'https://api.polyhaven.com/info/{aid}'))
    json.dump({'src': 'polyhaven', 'id': aid, 'name': info.get('name'), 'license': 'CC0', 'dims_mm': info.get('dimensions'), 'got': got}, open(os.path.join(out, 'meta.json'), 'w'))

def acg(out, aid, res):
    z = zipfile.ZipFile(io.BytesIO(get(f'https://ambientcg.com/get?file={aid}_{res.upper()}-JPG.zip')))
    got = {}
    for n in z.namelist():
        low = n.lower()
        k = 'col' if '_color' in low else 'nrm' if '_normalgl' in low else 'rgh' if '_roughness' in low else 'ao' if '_ambientocclusion' in low else None
        if k and low.endswith('.jpg'):
            open(os.path.join(out, k + '.jpg'), 'wb').write(z.read(n)); got[k] = n
    json.dump({'src': 'ambientcg', 'id': aid, 'license': 'CC0', 'got': got}, open(os.path.join(out, 'meta.json'), 'w'))

out = sys.argv[1]
for spec in sys.argv[2:]:
    src, aid = spec.split(':', 1)
    d = os.path.join(out, aid); os.makedirs(d, exist_ok=True)
    if os.path.exists(os.path.join(d, 'meta.json')): continue
    try:
        (ph if src == 'ph' else acg)(d, aid, '1k')
        print('ok', aid)
    except Exception as e:
        print('FAIL', aid, e)
