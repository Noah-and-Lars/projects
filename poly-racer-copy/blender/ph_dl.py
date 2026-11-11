# Download Poly Haven (CC0) textures and HDRIs through the public API into ../polyhaven/ultra/
#   python3 -I ph_dl.py tex <name> <res>     -> <name>_<res>_{diff,nor_gl,rough}.jpg
#   python3 -I ph_dl.py hdri <name> <res>    -> <name>_<res>.hdr
import sys, os, json, urllib.request, hashlib
OUT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'polyhaven', 'ultra')
kind, name, res = sys.argv[1:4]
UA = {'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) poly-racer-pipeline'}
open_ = lambda url, t: urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=t)
info = json.load(open_('https://api.polyhaven.com/files/' + name, 60))
def get(url, dst, md5=None):
    if os.path.exists(dst): print('have', dst); return
    data = open_(url, 600).read()
    if md5 and hashlib.md5(data).hexdigest() != md5: raise SystemExit('md5 mismatch ' + url)
    open(dst, 'wb').write(data); print('got', dst, len(data) // 1024, 'kB')
if kind == 'hdri':
    f = info['hdri'][res]['hdr']; get(f['url'], os.path.join(OUT, '%s_%s.hdr' % (name, res)), f.get('md5'))
else:
    for key, tag in (('Diffuse', 'diff'), ('nor_gl', 'nor'), ('Rough', 'rough'), ('AO', 'ao')):
        if key not in info: print('no', key, 'for', name); continue
        f = info[key][res]['jpg']; get(f['url'], os.path.join(OUT, '%s_%s_%s.jpg' % (name, res, tag)), f.get('md5'))
