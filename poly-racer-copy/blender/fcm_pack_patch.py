# The loader reads packed models (16-bit positions and uvs over each part's range; see blender/fcm_pack.py).
import sys
p = sys.argv[1]; s = open(p).read()
def rep(old, new, count=1):
    global s
    assert s.count(old) == count, (s.count(old), old[:90])
    s = s.replace(old, new)
rep("""    const pos = new Float32Array(buf.slice(base + p.po, base + p.po + n * 12)), ni""",
    """    // packed models keep positions and uvs as 16-bit steps across the part's range (pq, uq: the minimum, then the step)
    const deq = (off, cnt, c, q) => { const u = new Uint16Array(buf.slice(off, off + cnt * c * 2)), f = new Float32Array(cnt * c); for (let i = 0; i < cnt * c; i++) { const a = i % c; f[i] = q[a] + u[i] * q[c + a]; } return f; };
    const pos = p.pq ? deq(base + p.po, n, 3, p.pq) : new Float32Array(buf.slice(base + p.po, base + p.po + n * 12)), ni""")
rep("""    if (p.uo !== undefined) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(buf.slice(base + p.uo, base + p.uo + n * 8)), 2));""",
    """    if (p.uo !== undefined) g.setAttribute('uv', new THREE.BufferAttribute(p.uq ? deq(base + p.uo, n, 2, p.uq) : new Float32Array(buf.slice(base + p.uo, base + p.uo + n * 8)), 2));""")
open(p, 'w').write(s); print('fcm pack patch applied')
