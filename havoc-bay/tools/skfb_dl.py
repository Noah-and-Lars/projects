#!/usr/bin/env python3 -I
# Download Sketchfab models (glTF zip) into skfb-dl/<uid>/ and unzip them. Prints the path of each .gltf/.glb.
#   python3 -I skfb_dl.py <uid> [<uid> ...]
# The API token comes from $SKFB_TOKEN or tools/.skfb_token (git-ignored). Never commit it.
import json, os, sys, urllib.request, zipfile, io

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, 'skfb-dl')

def token():
    t = os.environ.get('SKFB_TOKEN')
    if t: return t.strip()
    p = os.path.join(HERE, '.skfb_token')
    if not os.path.exists(p): raise SystemExit('No Sketchfab token: set SKFB_TOKEN or put it in tools/.skfb_token')
    return open(p).read().strip()

def api(url, tok):
    req = urllib.request.Request(url, headers={'Authorization': 'Token ' + tok, 'User-Agent': 'Mozilla/5.0'})
    with urllib.request.urlopen(req, timeout=60) as r: return json.load(r)

def download(uid, tok):
    d = os.path.join(OUT, uid)
    meta_p = os.path.join(d, '_meta.json')
    if os.path.exists(meta_p): return json.load(open(meta_p))['file']
    os.makedirs(d, exist_ok=True)
    info = api('https://api.sketchfab.com/v3/models/' + uid, tok)
    dl = api('https://api.sketchfab.com/v3/models/%s/download' % uid, tok)
    fmt = dl.get('gltf') or dl.get('glb')
    with urllib.request.urlopen(urllib.request.Request(fmt['url'], headers={'User-Agent': 'Mozilla/5.0'}), timeout=900) as r: data = r.read()
    if data[:4] == b'glTF':   # a bare .glb
        open(os.path.join(d, 'scene.glb'), 'wb').write(data)
    else:
        z = zipfile.ZipFile(io.BytesIO(data))
        for n in z.namelist():   # refuse paths outside the folder
            if n.startswith('/') or '..' in n.replace('\\', '/').split('/'): raise SystemExit('bad zip path ' + n)
        z.extractall(d)
    files = sorted(os.path.join(dp, f) for dp, _, fs in os.walk(d) for f in fs if f.lower().endswith(('.gltf', '.glb')))
    m = dict(uid=uid, name=info['name'], user=info['user']['username'], url=info['viewerUrl'],
             license=(info.get('license') or {}).get('label'), faces=info.get('faceCount'), file=files[0] if files else None)
    json.dump(m, open(meta_p, 'w'), indent=1)
    return m['file']

if __name__ == '__main__':
    tok = token()
    for uid in sys.argv[1:]:
        try: print(uid, download(uid, tok))
        except Exception as e: print(uid, 'ERROR', e)
