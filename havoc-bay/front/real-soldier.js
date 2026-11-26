/* Island Front, Realistic mode: soldiers.
   Human proportions with smooth, tapered limbs, a camouflage uniform, a plate carrier with pouches, a helmet with a cover and
   mounts, gloves, boots and a detailed rifle (M4 for Blue, AK-74M for Red, AKM for the guards). Same joints as the simple
   model (hips, thighs, shins, torso, head, arms), so the animation code drives both. */
'use strict';
const SOLD = { mats: {}, geo: new Map() };
const KIT = [ // per team: camouflage colours, vest, helmet, rifle
  { camo: [[104, 104, 76], [72, 84, 52], [96, 78, 56], [44, 44, 36]], vest: [.17, .2, .13], helm: [.2, .22, .15], rifle: 'm4', boots: [.045, .036, .026] },
  { camo: [[172, 154, 116], [138, 118, 86], [112, 98, 72], [92, 100, 72]], vest: [.36, .3, .2], helm: [.33, .29, .2], rifle: 'ak74', boots: [.12, .11, .1] },
  { camo: [[70, 72, 74], [50, 52, 54], [88, 90, 90], [32, 32, 34]], vest: [.07, .075, .08], helm: [.09, .095, .1], rifle: 'akm', boots: [.07, .07, .07] },
];
function camoTex(team) {
  const S = 256, k = KIT[team], f1 = tfbm(S, 4, 3, 300 + team), f2 = tfbm(S, 5, 3, 310 + team), f3 = tfbm(S, 7, 2, 320 + team), cv = canvasOf(S), g = cv.getContext('2d'), img = g.createImageData(S, S);
  for (let i = 0; i < S * S; i++) {
    let c = k.camo[0];
    if (f1[i] > .12) c = k.camo[1]; if (f2[i] > .18) c = k.camo[2]; if (f3[i] > .26) c = k.camo[3];
    const v = 1 + (hash2(i % S, i / S | 0, 7) - .5) * .08; img.data[i * 4] = c[0] * v; img.data[i * 4 + 1] = c[1] * v; img.data[i * 4 + 2] = c[2] * v; img.data[i * 4 + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  // seams and stitching
  g.strokeStyle = 'rgba(0,0,0,.18)'; g.lineWidth = 1; for (let y = 0; y < S; y += 64) { g.beginPath(); g.moveTo(0, y + .5); g.lineTo(S, y + .5); g.stroke(); }
  return texOf(cv);
}
function soldierMat(team) {
  if (SOLD.mats[team]) return SOLD.mats[team];
  const m = new THREE.MeshStandardMaterial({ map: camoTex(team), vertexColors: true, roughness: .82, metalness: 0, envMapIntensity: .5 });
  m.onBeforeCompile = sh => { // camouflage only where the part asks for it; everything else is its plain vertex colour
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float camo; varying float vCamo;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvCamo = camo;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vCamo;').replace('#include <map_fragment>', 'vec4 texelColor = mapTexelToLinear(texture2D(map, vUv)); diffuseColor.rgb *= mix(vec3(1.0), texelColor.rgb * 1.3, vCamo);');
  };
  m.customProgramCacheKey = () => 'soldierCamo';
  return SOLD.mats[team] = m;
}
/* parts: geometry + transform + colour (+ camo flag), merged per joint */
class SPart {
  constructor() { this.list = []; }
  add(geo, color, o = {}) { this.list.push({ geo, color, p: o.p || [0, 0, 0], r: o.r || [0, 0, 0], s: o.s || [1, 1, 1], camo: o.camo ? 1 : 0, q: o.q }); return this; }
  build() {
    const P = [], N = [], C = [], U = [], K = [], m = new THREE.Matrix4(), nm = new THREE.Matrix3(), v = new V3(), q = new THREE.Quaternion();
    for (const it of this.list) {
      m.compose(new V3(...it.p), it.q || q.setFromEuler(new THREE.Euler(it.r[0], it.r[1], it.r[2])), new V3(...it.s)); nm.getNormalMatrix(m);
      const g = it.geo.index ? it.geo.toNonIndexed() : it.geo, p = g.attributes.position, n = g.attributes.normal;
      for (let i = 0; i < p.count; i++) {
        v.fromBufferAttribute(p, i).applyMatrix4(m); P.push(v.x, v.y, v.z); U.push((v.x + v.z) * 2.6, v.y * 2.6);
        v.fromBufferAttribute(n, i).applyMatrix3(nm).normalize(); N.push(v.x, v.y, v.z); C.push(it.color[0], it.color[1], it.color[2]); K.push(it.camo);
      }
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(C, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2)); g.setAttribute('camo', new THREE.Float32BufferAttribute(K, 1)); g.computeBoundingSphere();
    return g;
  }
}
const SG = {}; // shared shapes
const sgCyl = (rt, rb, seg = 12, open = false) => SG['c' + rt + rb + seg + open] || (SG['c' + rt + rb + seg + open] = new THREE.CylinderGeometry(rt, rb, 1, seg, 1, open));
const sgSph = (seg = 12) => SG['s' + seg] || (SG['s' + seg] = new THREE.SphereGeometry(1, seg, Math.max(6, seg * .66 | 0)));
const sgHemi = () => SG.hemi || (SG.hemi = new THREE.SphereGeometry(1, 16, 8, 0, TAU, 0, Math.PI * .56));
const sgBox = () => SG.box || (SG.box = new THREE.BoxGeometry(1, 1, 1));
const sgRBox = () => { // a box with rounded vertical edges
  if (SG.rbox) return SG.rbox;
  const sh = new THREE.Shape(), r = .18; sh.moveTo(-.5 + r, -.5); sh.lineTo(.5 - r, -.5); sh.quadraticCurveTo(.5, -.5, .5, -.5 + r); sh.lineTo(.5, .5 - r); sh.quadraticCurveTo(.5, .5, .5 - r, .5); sh.lineTo(-.5 + r, .5); sh.quadraticCurveTo(-.5, .5, -.5, .5 - r); sh.lineTo(-.5, -.5 + r); sh.quadraticCurveTo(-.5, -.5, -.5 + r, -.5);
  const g = new THREE.ExtrudeGeometry(sh, { depth: 1, bevelEnabled: false, curveSegments: 3 }); g.translate(0, 0, -.5); g.rotateX(Math.PI / 2); g.computeVertexNormals(); return SG.rbox = g;
};
const sgTorso = () => { // a lathe body from the waist to the neck, squashed front to back
  if (SG.torso) return SG.torso;
  const prof = [[.0, -.02], [.135, -.02], [.15, .06], [.158, .16], [.176, .28], [.186, .36], [.18, .43], [.15, .5], [.09, .545], [.055, .56], [0, .565]].map(p => new THREE.Vector2(p[0], p[1]));
  const g = new THREE.LatheGeometry(prof, 16); g.computeVertexNormals(); return SG.torso = g;
};
const _qa = new THREE.Quaternion(), _y = new V3(0, 1, 0);
function seg(part, a, b, r0, r1, col, camo, n = 10) { // a tapered limb from a to b with a ball at each end
  const A = new V3(...a), B = new V3(...b), d = B.clone().sub(A), L = d.length();
  part.add(sgCyl(r1, r0, n), col, { p: A.clone().add(B).multiplyScalar(.5).toArray(), s: [1, L, 1], q: new THREE.Quaternion().setFromUnitVectors(_y, d.normalize()), camo });
}
function rifleParts(part, kind, x0, y0, z0) {
  const blk = [.035, .035, .035], blk2 = [.055, .055, .05], wood = [.32, .17, .08], plum = [.3, .12, .06], P = (geo, col, p, s, r) => part.add(geo, col, { p: [x0 + p[0], y0 + p[1], z0 + p[2]], s, r });
  const bar = (x, len, r, col) => P(sgCyl(r, r, 8), col, [x + len / 2, 0, 0], [1, len, 1], [0, 0, -Math.PI / 2]);
  if (kind === 'm4') {
    P(sgBox(), blk2, [.06, -.015, 0], [.2, .05, .034]);                 // lower receiver
    P(sgBox(), blk2, [.08, .028, 0], [.24, .042, .03]);                 // upper receiver
    P(sgBox(), blk, [.08, .055, 0], [.24, .012, .022]);                 // top rail
    P(sgBox(), blk2, [.29, .018, 0], [.2, .05, .048]);                  // rail handguard
    P(sgBox(), blk, [.29, .046, 0], [.2, .008, .02]); P(sgBox(), blk, [.29, .018, .026], [.18, .02, .006]); P(sgBox(), blk, [.29, .018, -.026], [.18, .02, .006]); // rails
    bar(.39, .13, .009, blk); P(sgCyl(.014, .014, 8), blk, [.545, .02, 0], [1, .055, 1], [0, 0, -Math.PI / 2]); // barrel, muzzle device
    P(sgBox(), blk2, [-.06, .02, 0], [.12, .03, .026]); P(sgBox(), blk2, [-.19, .0, 0], [.17, .055, .036]); P(sgBox(), blk, [-.275, .0, 0], [.02, .075, .04]); // buffer tube, stock, buttpad
    P(sgBox(), blk, [.0, -.06, 0], [.032, .085, .028], [0, 0, -.32]);   // pistol grip
    P(sgBox(), [.07, .07, .06], [.075, -.085, 0], [.033, .13, .024], [0, 0, .08]); // magazine
    P(sgBox(), [.05, .05, .05], [.08, .078, 0], [.055, .035, .03]); P(sgBox(), [.1, .14, .18], [.054, .08, 0], [.003, .022, .022]); // holographic sight
    P(sgCyl(.012, .012, 8), blk, [.31, -.035, 0], [1, .06, 1]);          // foregrip
  } else {
    const furn = kind === 'akm' ? wood : blk2, magc = kind === 'akm' ? [.08, .08, .07] : plum;
    P(sgBox(), [.06, .06, .055], [.06, .0, 0], [.26, .06, .038]);       // receiver
    P(sgBox(), [.07, .07, .065], [.06, .035, 0], [.24, .02, .034]);     // dust cover
    P(sgBox(), furn, [.28, -.005, 0], [.17, .048, .044]);               // lower handguard
    P(sgBox(), furn, [.28, .03, 0], [.15, .026, .036]);                 // gas tube cover
    bar(.36, .2, .009, blk); P(sgCyl(.013, .013, 8), blk, [.58, .002, 0], [1, .05, 1], [0, 0, -Math.PI / 2]);
    P(sgBox(), blk, [.47, .035, 0], [.012, .04, .012]);                 // front sight post
    P(sgBox(), furn, [-.2, -.02, 0], [.22, .05, .036], [0, 0, .12]); P(sgBox(), furn, [-.3, -.04, 0], [.04, .1, .04], [0, 0, .12]); // stock
    P(sgBox(), furn, [-.02, -.065, 0], [.032, .09, .03], [0, 0, -.3]);
    for (let k = 0; k < 4; k++) P(sgBox(), magc, [.1 + k * .014, -.05 - k * .03, 0], [.04, .036, .024], [0, 0, .12 + k * .12]); // curved magazine
  }
}
function buildRealSoldier(team, npc) {
  const K = KIT[team], skinI = (Math.random() * SKIN.length) | 0, key = team + ':' + (npc ? 1 : 0) + ':' + skinI, matl = soldierMat(team);
  let G = SOLD.geo.get(key);
  if (!G) {
    const sc = new THREE.Color(SKIN[skinI]).convertSRGBToLinear(), skin = [sc.r, sc.g, sc.b], U = [1, 1, 1], V = K.vest, glove = [.06, .06, .055], dark = [.05, .05, .045], strap = [V[0] * .8, V[1] * .8, V[2] * .8];
    G = {};
    { const p = new SPart(); // pelvis, belt and its pouches
      p.add(sgSph(14), U, { p: [0, -.02, 0], s: [.13, .12, .175], camo: true });
      p.add(sgCyl(1, 1, 16), strap, { p: [0, .045, 0], s: [.145, .055, .182] });
      p.add(sgBox(), dark, { p: [.142, .045, 0], s: [.012, .04, .05] });
      for (const z of [-.13, .13]) p.add(sgRBox(), V, { p: [-.02, .03, z], s: [.08, .1, .05] });
      p.add(sgRBox(), V, { p: [-.13, .03, .06], s: [.05, .09, .08] });
      G.hips = p.build(); }
    G.thigh = []; G.shin = [];
    for (const sd of [-1, 1]) {
      const t = new SPart();
      seg(t, [0, .02, 0], [.0, -.44, 0], .098, .068, U, true, 14);
      t.add(sgSph(10), U, { p: [0, -.44, 0], s: [.068, .068, .068], camo: true });
      t.add(sgRBox(), U, { p: [.0, -.22, sd * .085], s: [.11, .14, .04], camo: true });           // cargo pocket
      t.add(sgRBox(), [U[0] * .9, U[1] * .9, U[2] * .9], { p: [.0, -.12, sd * .03], s: [.13, .02, .13], camo: true });
      t.add(sgSph(10), [.08, .08, .07], { p: [.052, -.44, 0], s: [.035, .07, .062] });            // knee pad
      G.thigh.push(t.build());
      const s = new SPart();
      seg(s, [0, 0, 0], [0, -.36, 0], .068, .05, U, true, 14);
      s.add(sgCyl(.058, .052, 12), K.boots, { p: [.005, -.375, 0], s: [1, .13, 1] });               // boot upper
      s.add(sgRBox(), K.boots, { p: [.045, -.455, 0], s: [.26, .065, .1] });                        // boot
      s.add(sgSph(10), K.boots, { p: [.155, -.455, 0], s: [.06, .035, .05] });                      // toe
      s.add(sgRBox(), [.04, .04, .035], { p: [.045, -.488, 0], s: [.28, .02, .108] });              // sole
      G.shin.push(s.build());
    }
    { const p = new SPart(); // body, plate carrier, pouches, pack
      p.add(sgTorso(), U, { p: [0, 0, 0], s: [.9, 1, 1.12], camo: true });
      for (const z of [-1, 1]) p.add(sgSph(12), U, { p: [0, .455, z * .19], s: [.078, .078, .078], camo: true });
      p.add(sgRBox(), V, { p: [.125, .3, 0], s: [.06, .3, .29] });                                  // front plate
      p.add(sgRBox(), V, { p: [-.13, .31, 0], s: [.06, .31, .29] });                                // back plate
      p.add(sgCyl(1, 1, 16, true), V, { p: [0, .2, 0], s: [.168, .13, .2] });                     // cummerbund
      for (const z of [-1, 1]) p.add(sgBox(), V, { p: [0, .47, z * .1], s: [.27, .03, .055] });     // shoulder straps
      for (const z of [-.09, 0, .09]) { p.add(sgRBox(), V, { p: [.17, .22, z], s: [.05, .11, .075] }); p.add(sgBox(), strap, { p: [.197, .27, z], s: [.006, .02, .07] }); } // magazine pouches
      p.add(sgRBox(), V, { p: [.165, .38, .06], s: [.035, .07, .1] });                              // admin pouch
      p.add(sgRBox(), [V[0] * .9, V[1] * .9, V[2] * .9], { p: [.02, .28, -.215], s: [.08, .13, .05] }); // radio
      p.add(sgCyl(.007, .007, 6), dark, { p: [.02, .42, -.21], s: [1, .2, 1] });                     // antenna
      p.add(sgRBox(), [V[0] * .85, V[1] * .85, V[2] * .85], { p: [-.2, .3, 0], s: [.09, .3, .23] }); // hydration pack
      p.add(sgCyl(.06, .066, 14), U, { p: [0, .54, 0], s: [1, .06, 1.1], camo: true });             // collar
      if (team < 2) p.add(sgBox(), new THREE.Color(TEAMS[team].hex).convertSRGBToLinear().toArray(), { p: [0, .38, .262], s: [.12, .06, .012] }); // team patch on the arm
      G.torso = p.build(); }
    { const p = new SPart(); // head, face, helmet
      p.add(sgCyl(.05, .056, 12), skin, { p: [0, .02, 0], s: [1, .1, 1] });
      p.add(sgSph(16), skin, { p: [.008, .125, 0], s: [.094, .116, .086] });
      p.add(sgSph(8), [skin[0] * .9, skin[1] * .9, skin[2] * .9], { p: [.094, .118, 0], s: [.02, .03, .016] }); // nose
      for (const z of [-1, 1]) p.add(sgSph(8), skin, { p: [0, .12, z * .086], s: [.02, .03, .014] });                 // ears
      p.add(sgBox(), [.03, .03, .035], { p: [.1, .142, 0], s: [.014, .026, .12] });                                 // glasses
      p.add(sgHemi(), K.helm, { p: [-.004, .14, 0], s: [.128, .128, .122], r: [0, 0, .12], camo: team === 0 });     // helmet
      p.add(sgCyl(1, 1, 16, true), K.helm, { p: [-.004, .143, 0], s: [.13, .018, .124], r: [0, 0, .12] });          // rim
      if (!npc) { p.add(sgBox(), dark, { p: [.118, .205, 0], s: [.02, .035, .045] }); for (const z of [-1, 1]) p.add(sgBox(), dark, { p: [0, .19, z * .125], s: [.09, .02, .01] }); } // NVG mount, rails
      p.add(sgBox(), dark, { p: [.04, .07, .085], s: [.012, .1, .008], r: [0, 0, -.35] }); p.add(sgBox(), dark, { p: [.04, .07, -.085], s: [.012, .1, .008], r: [0, 0, -.35] }); // chin straps
      G.head = p.build(); }
    { const p = new SPart(); // arms holding the rifle: right hand on the grip, left on the foregrip
      const rx = .2, ry = -.07, rz = .1, grip = [rx + .0, ry - .06, rz], fore = [rx + .31, ry - .045, rz];
      const arm = (sh, el, hd) => { seg(p, sh, el, .066, .052, U, true, 12); p.add(sgSph(10), U, { p: el, s: [.054, .054, .054], camo: true }); seg(p, el, [hd[0] - .03, hd[1] + .005, hd[2]], .051, .038, U, true, 12); p.add(sgRBox(), glove, { p: hd, s: [.09, .05, .045] }); p.add(sgSph(8), glove, { p: [hd[0] + .02, hd[1] - .02, hd[2]], s: [.03, .03, .03] }); };
      arm([0, 0, .2], [.06, -.24, .2], grip);
      arm([0, 0, -.2], [.24, -.21, -.13], fore);
      rifleParts(p, K.rifle, rx, ry, rz);
      G.arms = p.build(); }
    SOLD.geo.set(key, G);
  }
  const mk = (g, parent, x = 0, y = 0, z = 0) => { const m = new THREE.Mesh(g, matl); m.castShadow = m.receiveShadow = true; parent.add(m); m.position.set(x, y, z); return m; };
  const root = new THREE.Group(), hips = new THREE.Group(); hips.position.y = .95; root.add(hips); mk(G.hips, hips);
  const legs = [];
  [-1, 1].forEach((sd, k) => { const thigh = new THREE.Group(); thigh.position.set(0, 0, sd * .1); hips.add(thigh); mk(G.thigh[k], thigh); const shin = new THREE.Group(); shin.position.y = -.45; thigh.add(shin); mk(G.shin[k], shin); legs.push({ thigh, shin }); });
  const torso = new THREE.Group(); torso.position.y = .04; hips.add(torso); mk(G.torso, torso);
  const head = new THREE.Group(); head.position.y = .55; torso.add(head); mk(G.head, head);
  const arms = new THREE.Group(); arms.position.set(0, .45, 0); torso.add(arms); mk(G.arms, arms);
  return { root, hips, torso, legs, head, arms, rifle: arms, real: true };
}
