# Download a Poly Haven (CC0) model as glTF with its textures into ../polyhaven/ultra/models/<name>/
#   python3 -I ph_model_dl.py <name> <res: 1k|2k>
import sys, os, json, urllib.request
OUT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'polyhaven', 'ultra', 'models')
name, res = sys.argv[1:3]
UA = {'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) poly-racer-pipeline'}
open_ = lambda url, t: urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=t)
info = json.load(open_('https://api.polyhaven.com/files/' + name, 60))
g = info['gltf'][res]['gltf']; d = os.path.join(OUT, name); os.makedirs(d, exist_ok=True)
def get(url, dst):
    if os.path.exists(dst): return
    os.makedirs(os.path.dirname(dst), exist_ok=True); open(dst, 'wb').write(open_(url, 600).read())
get(g['url'], os.path.join(d, name + '.gltf'))
for rel, f in g.get('include', {}).items(): get(f['url'], os.path.join(d, rel))
json.dump({'name': name, 'lods': info.get('lods')}, open(os.path.join(d, '_meta.json'), 'w'))
print('got', name, len(g.get('include', {})), 'files')
