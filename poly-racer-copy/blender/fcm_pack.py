# Shrink a built .fcm: positions and uvs go from 32-bit floats to 16-bit steps across each part's own range
# (a 5 m car to 0.08 mm, uvs to 1/65535 of their range), with the range in the part header (pq, uq). Parts whose uvs
# span more than 8 tiles keep float uvs. The game reads both forms. Run it once per file; packed files are skipped.
#   python3 -I fcm_pack.py <file.fcm>...
import json, struct, sys
import numpy as np
def al(b):
    return b + b'\0' * (-len(b) % 4)
for path in sys.argv[1:]:
    b = open(path, 'rb').read(); n = struct.unpack('<I', b[4:8])[0]; h = json.loads(b[8:8 + n]); base = 8 + n
    if any('pq' in p for p in h['parts'].values()): print(path, 'already packed'); continue
    blob = b''; before = len(b)
    for k, p in h['parts'].items():
        v = p['v']
        pos = np.frombuffer(b, np.float32, v * 3, base + p['po']).reshape(v, 3)
        mn, mx = pos.min(0), pos.max(0); sc = np.maximum(mx - mn, 1e-9) / 65535
        q = np.round((pos - mn) / sc).clip(0, 65535).astype(np.uint16)
        err = np.abs(q * sc + mn - pos).max()
        p['pq'] = [float(x) for x in mn] + [float(x) for x in sc]
        blob = al(blob); p['po'] = len(blob); blob += q.tobytes()
        blob = al(blob); o = p['no']; p['no'] = len(blob); blob += b[base + o: base + o + v * 3]
        blob = al(blob); o = p['co']; p['co'] = len(blob); blob += b[base + o: base + o + v * 3]
        if 'ao' in p: blob = al(blob); o = p['ao']; p['ao'] = len(blob); blob += b[base + o: base + o + v]
        if 'uo' in p:
            uv = np.frombuffer(b, np.float32, v * 2, base + p['uo']).reshape(v, 2)
            umn, umx = uv.min(0), uv.max(0)
            blob = al(blob)
            if (umx - umn).max() <= 8:
                us = np.maximum(umx - umn, 1e-9) / 65535
                p['uq'] = [float(x) for x in umn] + [float(x) for x in us]
                p['uo'] = len(blob); blob += np.round((uv - umn) / us).clip(0, 65535).astype(np.uint16).tobytes()
            else:
                p['uo'] = len(blob); blob += uv.astype(np.float32).tobytes()
        blob = al(blob); o = p['io']; sz = p['i'] * (4 if p.get('i32') else 2); p['io'] = len(blob); blob += b[base + o: base + o + sz]
    hj = json.dumps(h, separators=(',', ':')).encode()
    hj += b' ' * (-(8 + len(hj)) % 4)
    out = b'FCM1' + struct.pack('<I', len(hj)) + hj + blob
    open(path, 'wb').write(out)
    print('%s: %.1f -> %.1f MB' % (path, before / 1e6, len(out) / 1e6))
