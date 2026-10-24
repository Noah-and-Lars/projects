# Ultra grass: the roadside tufts become crossed cards of photographed grass.
import sys
p = sys.argv[1]; s = open(p).read()
def rep(old, new, count=1):
    global s
    assert s.count(old) == count, (s.count(old), old[:90])
    s = s.replace(old, new)
rep("""    jobs.push(loadImage('ultra/tex/leaves.png' + v).then(im => { ULTRA.img.leaves = im; }));""",
    """    jobs.push(loadImage('ultra/tex/leaves.png' + v).then(im => { ULTRA.img.leaves = im; }));
    jobs.push(loadImage('ultra/tex/grasscard.png' + v).then(im => { ULTRA.img.grasscard = im; }));""")
rep("""  T.concreteC = ultraMap(I.concrete_diff);""", """  T.concreteC = ultraMap(I.concrete_diff);
  if (I.grasscard) {
    const gc = ultraMap(I.grasscard); gc.wrapS = gc.wrapT = THREE.ClampToEdgeWrapping;
    MAT.tuftU = lit(new THREE.MeshStandardMaterial({ map: gc, alphaTest: 0.45, side: THREE.DoubleSide, vertexColors: true, roughness: 0.9, metalness: 0 }));
  }""")
rep("""function tuft(hex) {
  const pos = [], R = rng(9);""", """function tuft(hex) {
  if (MAT.tuftU) {
    // Ultra: three crossed cards of photographed grass, lit by the tuft colour from dark roots to bright tips
    const pos = [], uv = [], W = 0.95, H = 0.8;
    for (let k = 0; k < 3; k++) {
      const a = k * Math.PI / 3, dx = Math.cos(a) * W / 2, dz = Math.sin(a) * W / 2;
      pos.push(-dx, 0, -dz, dx, 0, dz, dx, H, dz, -dx, 0, -dz, dx, H, dz, -dx, H, -dz);
      uv.push(0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    const out = mergeG([paint(g, (c, x, y) => c.copy(C(hex)).multiplyScalar(0.5 + y * 1.0))]);
    out.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    return out;
  }
  const pos = [], R = rng(9);""")
rep("""    const mat = t.type === 'rock' ? MAT.rock : MAT.foliage;""", """    const mat = t.type === 'rock' ? MAT.rock : t.type === 'tuft' && MAT.tuftU ? MAT.tuftU : MAT.foliage;""")
open(p, 'w').write(s); print('ultra tufts patch applied')
