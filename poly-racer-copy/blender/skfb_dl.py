#!/usr/bin/env python3 -I
# Download a Sketchfab model (glTF zip) into its own directory and unzip it. Prints the path of the .gltf/.glb.
#   python3 -I skfb_dl.py <uid> [<uid> ...]
import json, os, sys, urllib.request, zipfile, io

HERE = os.path.dirname(os.path.abspath(__file__))
S = os.path.dirname(HERE)
TOKEN = open(os.path.join(S, '.skfb_token')).read().strip()
OUT = os.path.join(S, 'skfb-dl')

def api(url):
    req = urllib.request.Request(url, headers={'Authorization': 'Token ' + TOKEN})
    with urllib.request.urlopen(req, timeout=60) as r: return json.load(r)

def download(uid):
    d = os.path.join(OUT, uid)
    meta_p = os.path.join(d, '_meta.json')
    if os.path.exists(meta_p):
        m = json.load(open(meta_p))
        return m['file']
    os.makedirs(d, exist_ok=True)
    info = api('https://api.sketchfab.com/v3/models/' + uid)
    dl = api('https://api.sketchfab.com/v3/models/%s/download' % uid)
    fmt = dl.get('gltf') or dl.get('glb')
    with urllib.request.urlopen(fmt['url'], timeout=600) as r: data = r.read()
    z = zipfile.ZipFile(io.BytesIO(data))
    for n in z.namelist():   # refuse paths outside the folder
        if n.startswith('/') or '..' in n.split('/'): raise SystemExit('bad zip path ' + n)
    z.extractall(d)
    files = [os.path.join(dp, f) for dp, _, fs in os.walk(d) for f in fs if f.lower().endswith(('.gltf', '.glb'))]
    m = dict(uid=uid, name=info['name'], user=info['user']['username'], url=info['viewerUrl'], license=info.get('license', {}).get('label'),
             faces=info.get('faceCount'), verts=info.get('vertexCount'), size=fmt.get('size'), file=files[0] if files else None,
             thumb=max(info['thumbnails']['images'], key=lambda t: t['width'])['url'] if info.get('thumbnails') else None)
    json.dump(m, open(meta_p, 'w'), indent=1)
    return m['file']

if __name__ == '__main__':
    for uid in sys.argv[1:]:
        try: print(uid, download(uid))
        except Exception as e: print(uid, 'ERROR', e)
