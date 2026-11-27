#!/usr/bin/env python3
"""Pack a glTF model into one JavaScript file the game can load straight from disk.

    python3 tools/pack_model.py <scene.gltf | model.glb | folder> <key> [--max 2048] [--images a.png b.png ...]

Writes models/<key>.js, which sets MODEL_DATA['<key>'] to the glTF with its buffers and textures inlined.
- A .glb is unpacked first. A folder is searched for the .gltf (or .glb) inside it.
- Textures are found from the glTF's own image list, next to the .gltf. If they were delivered separately (as with a
  Sketchfab download that names them differently), pass them in the glTF's image order with --images.
- Textures are shrunk to at most --max pixels a side and stored as JPEG, or PNG when they have transparency.
- The licence and author recorded in the file are copied into a comment at the top. Keep the model's licence text beside it.
"""
import sys, os, json, base64, io, struct, glob
from PIL import Image

def read_glb(path):
    d = open(path, 'rb').read(); magic, ver, length = struct.unpack_from('<4sII', d, 0); assert magic == b'glTF', 'not a .glb file'
    off, g, binc = 12, None, None
    while off < length:
        n, t = struct.unpack_from('<I4s', d, off); chunk = d[off + 8: off + 8 + n]; off += 8 + n
        if t == b'JSON': g = json.loads(chunk.decode('utf-8'))
        elif t[:3] == b'BIN': binc = chunk
    return g, binc

def data_uri(b, mime): return 'data:%s;base64,%s' % (mime, base64.b64encode(b).decode())

def encode_image(im, maxpx):
    alpha = im.mode in ('RGBA', 'LA', 'P') and im.convert('RGBA').getextrema()[3][0] < 255
    im = im.convert('RGBA' if alpha else 'RGB')
    if max(im.size) > maxpx: s = maxpx / max(im.size); im = im.resize((max(1, round(im.size[0] * s)), max(1, round(im.size[1] * s))), Image.LANCZOS)
    bio = io.BytesIO()
    if alpha: im.save(bio, 'PNG', optimize=True); return data_uri(bio.getvalue(), 'image/png')
    im.save(bio, 'JPEG', quality=88); return data_uri(bio.getvalue(), 'image/jpeg')

def main():
    args = sys.argv[1:]
    if len(args) < 2: print(__doc__); sys.exit(1)
    src, key = args[0], args[1]; maxpx = 2048; extra = []
    if '--max' in args: maxpx = int(args[args.index('--max') + 1])
    if '--images' in args: i = args.index('--images'); extra = [a for a in args[i + 1:] if not a.startswith('--')]
    if os.path.isdir(src):
        found = glob.glob(os.path.join(src, '**', '*.gltf'), recursive=True) + glob.glob(os.path.join(src, '**', '*.glb'), recursive=True)
        assert found, 'no .gltf or .glb in ' + src; src = found[0]
    base = os.path.dirname(os.path.abspath(src)); glb_bin = None
    if src.lower().endswith('.glb'): g, glb_bin = read_glb(src)
    else: g = json.load(open(src, encoding='utf-8'))
    # buffers
    blobs = []
    for b in g.get('buffers', []):
        uri = b.get('uri')
        if uri is None: data = glb_bin
        elif uri.startswith('data:'): data = base64.b64decode(uri.split(',', 1)[1])
        else: data = open(os.path.join(base, uri.replace('%20', ' ')), 'rb').read()
        assert data is not None and len(data) >= b['byteLength'], 'buffer is shorter than the glTF says'
        blobs.append(data); b['uri'] = data_uri(data[:b['byteLength']], 'application/octet-stream')
    # images
    for i, im in enumerate(g.get('images', [])):
        if i < len(extra): pil = Image.open(extra[i])
        elif 'uri' in im and im['uri'].startswith('data:'): pil = Image.open(io.BytesIO(base64.b64decode(im['uri'].split(',', 1)[1])))
        elif 'uri' in im: pil = Image.open(os.path.join(base, im['uri'].replace('%20', ' ')))
        else: bv = g['bufferViews'][im['bufferView']]; o = bv.get('byteOffset', 0); pil = Image.open(io.BytesIO(blobs[bv['buffer']][o:o + bv['byteLength']]))
        im.pop('bufferView', None); im.pop('mimeType', None); im['uri'] = encode_image(pil, maxpx)
    ex = g.get('asset', {}).get('extras', {})
    out = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'models', key + '.js'); os.makedirs(os.path.dirname(out), exist_ok=True)
    with open(out, 'w', encoding='utf-8') as f:
        f.write('/* %s: %s by %s, %s. Packed for Island Front (geometry and textures inlined). */\n' % (key, ex.get('title', 'model'), ex.get('author', 'unknown author'), ex.get('license', 'licence not recorded: check the source')))
        f.write("(window.MODEL_DATA = window.MODEL_DATA || {})['%s'] = " % key); json.dump(g, f, separators=(',', ':')); f.write(';\n')
    names = [n.get('name', '') for n in g.get('nodes', [])]
    print('wrote %s (%.1f MB)' % (out, os.path.getsize(out) / 1e6))
    print('nodes: %d, meshes: %d, materials: %d, skins: %d, animations: %s' % (len(names), len(g.get('meshes', [])), len(g.get('materials', [])), len(g.get('skins', [])), [a.get('name', '') for a in g.get('animations', [])]))
    print('node names:', ', '.join(n for n in names if n)[:1500])

if __name__ == '__main__': main()
