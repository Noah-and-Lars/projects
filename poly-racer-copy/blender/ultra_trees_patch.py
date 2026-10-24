# Ultra trees: real tree models (Sketchfab, CC Attribution) near the camera; the game's own trees further away.
import sys
p = sys.argv[1]; s = open(p).read()
def rep(old, new, count=1):
    global s
    assert s.count(old) == count, (s.count(old), old[:90])
    s = s.replace(old, new)

# ---- loading: ultra/trees/<file>.fcm + <file>.png, one material each (the atlas, cut-outs for the leaves)
rep("""const ULTRA = { ready: false, img: {}, tex: {}, sky: {}, env: {}, info: {} };""",
    """const ULTRA = { ready: false, img: {}, tex: {}, sky: {}, env: {}, info: {}, trees: {} };
// which real tree stands in for each of the game's tree kinds, and how tall the kind is at scale 1
const ULTRA_TREE_OF = { pine: 'pine', fir: 'fir', snowpine: 'fir', oak: 'oak', maple: 'maple', birch: 'birch', palm: 'palm' };
const ULTRA_TREE_H = { pine: 15, fir: 18, snowpine: 14, oak: 10, maple: 10, birch: 12, palm: 9 };
const ULTRA_CONIFER = new Set(['pine', 'fir', 'snowpine', 'palm']);""")
rep("""    jobs.push(loadImage('ultra/tex/grasscard.png' + v).then(im => { ULTRA.img.grasscard = im; }));""",
    """    jobs.push(loadImage('ultra/tex/grasscard.png' + v).then(im => { ULTRA.img.grasscard = im; }));
    for (const f of new Set(Object.values(ULTRA_TREE_OF))) {
      jobs.push(Promise.all([fetch('ultra/trees/' + f + '.fcm' + v).then(r => r.ok ? r.arrayBuffer() : null), loadImage('ultra/trees/' + f + '.png' + v)]).then(([buf, im]) => {
        if (!buf) return;
        const geo = parseFCM(buf).tree; if (!geo) return;
        geo.clearGroups();   // one material for the whole tree
        const map = new THREE.Texture(im); map.encoding = THREE.sRGBEncoding; map.anisotropy = Math.min(16, MAX_ANISO); map.needsUpdate = true;
        const mat = lit(new THREE.MeshStandardMaterial({ map, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.85, metalness: 0 }));
        const depth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map, alphaTest: 0.5, side: THREE.DoubleSide });
        ULTRA.trees[f] = { geo, mat, depth };
      }).catch(e => console.warn('tree ' + f, e)));
    }""")

# ---- placing: a third, real version of each tree tile, shown near the camera
rep("""    im.userData.tile = { x: cx, z: cz, r: rad, tall: t.type !== 'tuft' && t.type !== 'rock' };
    grp.add(im);
    world.tiles.push(im);""",
    """    im.userData.tile = { x: cx, z: cz, r: rad, tall: t.type !== 'tuft' && t.type !== 'rock' };
    grp.add(im);
    world.tiles.push(im);
    // Ultra: the real tree near the camera (broadleaf kinds only in leaf, the game's own autumn and winter trees stay)
    const hero = ULTRA.ready && ULTRA_TREE_OF[t.type] && ULTRA.trees[ULTRA_TREE_OF[t.type]] && (ULTRA_CONIFER.has(t.type) || E.leaves === 'summer' || E.leaves === 'spring') ? ULTRA.trees[ULTRA_TREE_OF[t.type]] : null;
    if (hero) {
      const g3 = new THREE.BufferGeometry();
      for (const a in hero.geo.attributes) g3.setAttribute(a, hero.geo.attributes[a]);
      g3.setIndex(hero.geo.index); g3.boundingSphere = g.boundingSphere;
      const im3 = new THREE.InstancedMesh(g3, hero.mat, t.items.length), H = ULTRA_TREE_H[t.type] || 12;
      t.items.forEach((it, i) => {
        q.setFromAxisAngle(up, it.ry); const s3 = it.s * H;
        m.compose(_q1.set(it.x, it.y - 0.1, it.z), q, _q2.set(s3, s3, s3)); im3.setMatrixAt(i, m);
        const v = 0.9 + 0.2 * _h3(it.x, it.z, 3); im3.setColorAt(i, col.setRGB(v, v, v));
      });
      im3.instanceMatrix.needsUpdate = true; if (im3.instanceColor) im3.instanceColor.needsUpdate = true;
      im3.customDepthMaterial = hero.depth; im3.castShadow = true; im3.receiveShadow = true; im3.visible = false;
      im3.userData.tile = im.userData.tile; im.userData.hero = im3; grp.add(im3);
    }""")
# the distance switch: real tree within 120 m, the game's full tree to the far line, the light tree beyond
rep("""    const t = im.userData.tile, far = Math.hypot(t.x - cp.x, t.z - cp.z) - t.r > (Q.ultra ? 180 : settings.quality === 'high' ? 130 : 90);
    im.visible = !far; lod.visible = far;""",
    """    const t = im.userData.tile, d = Math.hypot(t.x - cp.x, t.z - cp.z) - t.r, far = d > (Q.ultra ? 180 : settings.quality === 'high' ? 130 : 90);
    const hero = im.userData.hero, near = !!hero && d < 120;
    if (hero) hero.visible = near;
    im.visible = !far && !near; lod.visible = far;""")
# the shadow caster list: the real trees cast shadows when near the focus, like the game's own
rep("""      im.castShadow = t.tall && Math.hypot(t.x - focus.x, t.z - focus.z) < t.r + 50;""",
    """      im.castShadow = t.tall && Math.hypot(t.x - focus.x, t.z - focus.z) < t.r + 50;
      if (im.userData.hero) im.userData.hero.castShadow = im.castShadow;""")
open(p, 'w').write(s); print('ultra trees patch applied')
