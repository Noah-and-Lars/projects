# Ultra trees, broadleaf: photographed leaves fill the leaf half of the foliage atlas.
import sys
p = sys.argv[1]; s = open(p).read()
def rep(old, new, count=1):
    global s
    assert s.count(old) == count, (s.count(old), old[:90])
    s = s.replace(old, new)
rep("""    jobs.push(loadImage('ultra/tex/twig.png' + v).then(im => { ULTRA.img.twig = im; }));""",
    """    jobs.push(loadImage('ultra/tex/twig.png' + v).then(im => { ULTRA.img.twig = im; }));
    jobs.push(loadImage('ultra/tex/leaves.png' + v).then(im => { ULTRA.img.leaves = im; }));""")
rep("""    // top right: solid, for trunks and anything without leaves
    g.fillStyle = '#ffffff'; g.fillRect(256, 0, 256, 52);""",
    """    if (ULTRA.ready && ULTRA.img.leaves) {
      // Ultra: photographed leaves (grey, the tree's colour comes from its vertices) instead of the ellipses
      g.clearRect(256, 56, 256, 456);
      g.save(); g.beginPath(); g.rect(256, 56, 256, 456); g.clip();
      for (let j = 0; j < 3; j++) for (let i = 0; i < 2; i++) {
        g.save(); g.translate(256 + i * 128 + 64, 56 + j * 152 + 76); g.rotate((R() - 0.5) * 1.2); g.drawImage(ULTRA.img.leaves, -100, -100, 200, 200); g.restore();
      }
      g.restore();
    }
    // top right: solid, for trunks and anything without leaves
    g.fillStyle = '#ffffff'; g.fillRect(256, 0, 256, 52);""")
open(p, 'w').write(s); print('ultra leaves patch applied')
