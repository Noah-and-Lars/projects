# Recolour a material group in a built .fcm without rebuilding it in Blender. The header is rewritten at the same
# length (padded with spaces), so every offset and the 2/4-byte alignment of the data behind it stay valid.
#   python3 -I fcm_recolour.py <model.fcm> <r,g,b of the group to change> <new r,g,b> [roughness] [metalness]
# Used for the Centenario (super.fcm): its yellow-orange trim (0.906,0.688,0.0) became dark carbon (0.05,0.05,0.055).
import json, struct, sys
path, old, new = sys.argv[1], [float(x) for x in sys.argv[2].split(',')], [float(x) for x in sys.argv[3].split(',')]
rough = float(sys.argv[4]) if len(sys.argv) > 4 else None; metal = float(sys.argv[5]) if len(sys.argv) > 5 else None
b = open(path, 'rb').read(); n = struct.unpack('<I', b[4:8])[0]; h = json.loads(b[8:8 + n]); k = 0
for part in h['parts'].values():
    for g in part.get('groups', []):
        if g.get('col') and all(abs(a - c) < 1e-3 for a, c in zip(g['col'], old)):
            g['col'] = new; k += 1
            if rough is not None: g['r'] = rough
            if metal is not None: g['m'] = metal
s = json.dumps(h, separators=(', ', ': '))
if len(s) > n: s = json.dumps(h, separators=(',', ':'))
assert len(s) <= n, 'the new header is longer than the old one'
open(path, 'wb').write(b[:8] + (s + ' ' * (n - len(s))).encode() + b[8 + n:])
print('recoloured %d groups' % k)
