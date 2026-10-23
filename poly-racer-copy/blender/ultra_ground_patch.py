# Ultra ground, second pass: the photographs keep their own colour (lawn grass by the track, grass and rock on the
# hills, real gravel, sand, mud and snow); the track's land colours only tint them.
import sys
p = sys.argv[1]; s = open(p).read()
def rep(old, new, count=1):
    global s
    assert s.count(old) == count, (s.count(old), old[:90])
    s = s.replace(old, new)
rep("""const ULTRA_TEX = ['road', 'tarmac', 'grass', 'gravel', 'sand', 'dirt', 'snow', 'concrete'];""",
    """const ULTRA_TEX = ['road', 'tarmac', 'grass', 'leafy', 'gravel', 'sand', 'dirt', 'snow', 'concrete'];
const ULTRA_W = new THREE.Color(1, 1, 1);""")
rep("""function ultraDetail(im, size, mean = 0.86) {
  const c = document.createElement('canvas'); c.width = c.height = size; const g = c.getContext('2d'); g.drawImage(im, 0, 0, size, size);
  const id = g.getImageData(0, 0, size, size), d = id.data; let sum = 0;
  for (let i = 0; i < d.length; i += 4) { const l = d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114; d[i] = l; sum += l; }
  const k = mean * 255 / (sum / (d.length / 4));
  for (let i = 0; i < d.length; i += 4) { const l = Math.min(255, d[i] * k); d[i] = d[i + 1] = d[i + 2] = l; }""",
    """function ultraDetail(im, size, mean = 0.86, colour = false) {
  const c = document.createElement('canvas'); c.width = c.height = size; const g = c.getContext('2d'); g.drawImage(im, 0, 0, size, size);
  const id = g.getImageData(0, 0, size, size), d = id.data; let sum = 0;
  for (let i = 0; i < d.length; i += 4) sum += d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114;
  const k = mean * 255 / (sum / (d.length / 4));
  if (colour) for (let i = 0; i < d.length; i += 4) { d[i] = Math.min(255, d[i] * k); d[i + 1] = Math.min(255, d[i + 1] * k); d[i + 2] = Math.min(255, d[i + 2] * k); }
  else for (let i = 0; i < d.length; i += 4) { const l = Math.min(255, (d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114) * k); d[i] = d[i + 1] = d[i + 2] = l; }""")
rep("""  for (const k of ['grass', 'gravel', 'sand', 'dirt', 'snow', 'tarmac', 'concrete']) {
    T[k] = ultraDetail(I[k + '_diff'], 1024, k === 'snow' ? 0.92 : 0.86); T[k].nmap = ultraMap(I[k + '_nor'], true);
  }""",
    """  // the ground keeps the photographs' own colours; walls and pit tarmac stay grey detail under their colours
  const MEAN = { grass: 0.6, leafy: 0.62, gravel: 0.7, sand: 0.76, dirt: 0.62, snow: 0.92 };
  for (const k of ['grass', 'leafy', 'gravel', 'sand', 'dirt', 'snow', 'tarmac', 'concrete']) {
    T[k] = ultraDetail(I[k + '_diff'], 1024, MEAN[k] || 0.86, k in MEAN); T[k].nmap = ultraMap(I[k + '_nor'], true);
  }
  T.grassFar = T.grass; T.grass = T.leafy;   // lawn by the track, grass and rock on the hills""")
rep("""  if (MAT.ground) { const gf = T.grass.clone(); gf.repeat.set(2.5, 2.5); gf.needsUpdate = true; MAT.ground.map = gf; MAT.ground.normalMap = T.grass.nmap; MAT.ground.normalScale = new THREE.Vector2(0.8, 0.8); MAT.ground.needsUpdate = true; }""",
    """  if (MAT.ground) { const gf = T.grassFar.clone(); gf.repeat.set(2.5, 2.5); gf.needsUpdate = true; MAT.ground.map = gf; MAT.ground.normalMap = T.grassFar.nmap; MAT.ground.normalScale = new THREE.Vector2(0.8, 0.8); MAT.ground.needsUpdate = true; }""")
# the land colours only tint the photographs
rep("""const col = colAt(rs, s.p.x, s.p.z).clone();""", """const col = colAt(rs, s.p.x, s.p.z).clone().lerp(ULTRA_W, ULTRA.ready ? 0.62 : 0);""")
rep("""const col = colAt(kind, A.x, A.z).clone();""", """const col = colAt(kind, A.x, A.z).clone().lerp(ULTRA_W, ULTRA.ready ? 0.62 : 0);""")
rep("""colE = colAt(kindE, e1.x, e1.z).clone();""", """colE = colAt(kindE, e1.x, e1.z).clone().lerp(ULTRA_W, ULTRA.ready ? 0.62 : 0);""")
rep("""    const sh = 0.9 + 0.2 * N2((x + sx) / 23, (z + sz) / 23);
    colr[o * 3] = c.r * sh; colr[o * 3 + 1] = c.g * sh; colr[o * 3 + 2] = c.b * sh;""",
    """    const sh = 0.9 + 0.2 * N2((x + sx) / 23, (z + sz) / 23);
    if (ULTRA.ready) c.lerp(ULTRA_W, 0.55);   // Ultra: the photographed ground shows its own colour, this only tints it
    colr[o * 3] = c.r * sh; colr[o * 3 + 1] = c.g * sh; colr[o * 3 + 2] = c.b * sh;""")
rep("""normalMap: nm || null, normalScale: new THREE.Vector2(0.7, 0.7), roughness: rough,""", """normalMap: nm || null, normalScale: new THREE.Vector2(1.0, 1.0), roughness: rough,""")
open(p, 'w').write(s); print('ultra ground patch applied')
