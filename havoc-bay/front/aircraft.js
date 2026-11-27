/* Island Front: modern aircraft.
   Blue flies the F-16C Block 50 and the AH-64D Apache; Red flies the Su-30SM and the Ka-52 Alligator.
   Each aircraft is built from separate parts (cockpit, nose sensors, fuselage, fuel, every engine, inner and outer wing on
   each side, tailplanes, fins; on helicopters the rotor, transmission, tail boom and tail rotor). Parts take damage on their
   own and change how the aircraft flies: a shot-up wing rolls it, a dead engine cuts thrust (and yaws a twin), a lost tail
   rotor spins a helicopter. Jets take off from the team airfield and land there to rearm; helicopters rearm at base. */
'use strict';
Object.assign(AMMO, {
  m61: { name: 'M61A1 20 mm', type: 'HEI', kind: 'bullet', v: 1030, pen: [12, 8], main: 40, rico: 70, rate: .012, spread: .0035, range: 1800 },
  gsh301: { name: 'GSh-30-1 30 mm', type: 'HEI', kind: 'bullet', v: 870, pen: [18, 12], main: 60, rico: 70, rate: .033, spread: .0035, range: 1800 },
  m230: { name: 'M230 30 mm', type: 'HEDP', kind: 'he', v: 805, pen: [25, 20], main: 20, op: .5, splash: 4, splashDmg: 90, fragPen: 8, rate: .1, look: 'tracer', cal: 30, life: 4 },
  a42: { name: '2A42 30 mm', type: 'HEI', kind: 'he', v: 960, pen: [20, 14], main: 20, op: .5, splash: 3.5, splashDmg: 85, fragPen: 7, rate: .11, look: 'tracer', cal: 30, life: 4 },
  aim9x: { name: 'AIM-9X', type: 'IR missile', kind: 'he', v: 850, pen: [10, 10], main: 0, splash: 10, splashDmg: 260, fragPen: 10, guided: true, turn: 4.5, prox: 9, life: 14, look: 'missile', cal: 127, aa: true },
  r73: { name: 'R-73', type: 'IR missile', kind: 'he', v: 800, pen: [10, 10], main: 0, splash: 10, splashDmg: 270, fragPen: 10, guided: true, turn: 5, prox: 9, life: 13, look: 'missile', cal: 170, aa: true },
  agm65: { name: 'AGM-65D Maverick', type: 'IR AGM', kind: 'heat', v: 330, pen: [900, 900], main: 250, spall: [14, .2, 3.5, 45], rico: 88, splash: 7, splashDmg: 300, fragPen: 20, guided: true, turn: 1.3, life: 30, look: 'missile', cal: 305, ag: true },
  kh29t: { name: 'Kh-29T', type: 'TV AGM', kind: 'heat', v: 400, pen: [850, 850], main: 260, spall: [14, .2, 3.5, 45], rico: 88, splash: 9, splashDmg: 360, fragPen: 22, guided: true, turn: 1.1, life: 28, look: 'missile', cal: 400, ag: true },
  hellfire: { name: 'AGM-114K Hellfire', type: 'Laser ATGM', kind: 'heat', v: 420, pen: [1000, 1000], tandem: true, main: 230, spall: [14, .2, 3.5, 45], rico: 88, splash: 5, splashDmg: 200, fragPen: 15, guided: true, turn: 1.8, life: 22, look: 'missile', cal: 178, ag: true },
  vikhr: { name: '9K121 Vikhr', type: 'Beam ATGM', kind: 'heat', v: 600, pen: [900, 900], tandem: true, main: 220, spall: [14, .2, 3.5, 45], rico: 88, splash: 5, splashDmg: 190, fragPen: 15, guided: true, turn: 1.5, life: 16, look: 'missile', cal: 130, ag: true },
  hydra: { name: 'Hydra 70 M151', type: 'HE rocket', kind: 'he', v: 700, pen: [20, 20], main: 0, op: 1.2, splash: 9, splashDmg: 220, fragPen: 12, look: 'rocket', life: 8, cal: 70, spread: .011, rate: .08 },
  s8: { name: 'S-8KOM', type: 'HEAT rocket', kind: 'heat', v: 600, pen: [400, 400], main: 150, spall: [8, .18, 2.6, 36], rico: 84, splash: 5, splashDmg: 140, fragPen: 8, look: 'rocket', life: 8, cal: 80, spread: .011, rate: .08 },
  mk82: { name: 'Mk 82', type: 'Bomb', kind: 'he', v: 0, pen: [150, 150], main: 0, op: 6, splash: 28, splashDmg: 900, fragPen: 40, look: 'bomb', life: 60, cal: 273 },
  fab250: { name: 'FAB-250M62', type: 'Bomb', kind: 'he', v: 0, pen: [150, 150], main: 0, op: 6, splash: 26, splashDmg: 850, fragPen: 40, look: 'bomb', life: 60, cal: 325 },
});
PMODEL.bomb = () => { const g = new THREE.Group(); P(g, gSph(10), 0x4a4e3a, 0, 0, 0, { s: [.14, .9, .14] }); scene.add(g); return g; };

/* ---------------- models ---------------- */
const AIR_MAT = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .55, metalness: .22, envMapIntensity: .9 });
const AIR_GLASS = new THREE.MeshStandardMaterial({ color: 0x24282a, roughness: .05, metalness: .85, transparent: true, opacity: .78, envMapIntensity: 1.6 });
const AIR_DISC = new THREE.MeshBasicMaterial({ color: 0x1c1c1a, transparent: true, opacity: .12, depthWrite: false, side: THREE.DoubleSide });
function fuseGeo(st, seg = 16) { // fuselage lofted through stations [x, half width, half height, centre y]
  const P2 = [], I = [];
  for (const [x, w, h, y] of st) for (let k = 0; k < seg; k++) { const a = k / seg * TAU; P2.push(x, y + Math.sin(a) * h, Math.cos(a) * w); }
  for (let s = 0; s < st.length - 1; s++) for (let k = 0; k < seg; k++) { const a = s * seg + k, b = s * seg + (k + 1) % seg, c = a + seg, d = b + seg; I.push(a, b, c, b, d, c); }
  const n = st.length * seg; P2.push(st[0][0] + .01, st[0][3], 0, st[st.length - 1][0] - .01, st[st.length - 1][3], 0);
  for (let k = 0; k < seg; k++) { I.push(n, k, (k + 1) % seg); const o = (st.length - 1) * seg; I.push(n + 1, o + (k + 1) % seg, o + k); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P2, 3)); g.setIndex(I); g.computeVertexNormals(); return g;
}
function wingPart(parent, poly, y, th, color, dihedral = 0) { const m = new THREE.Mesh(loftGeo(poly, y, poly.map(p => [p[0], p[1]]), y + th), mat(color)); m.rotation.x = dihedral; parent.add(m); return m; }
function mesh(parent, geo, color, x, y, z, s, r) { const m = new THREE.Mesh(geo, color === 'glass' ? AIR_GLASS : mat(color)); m.position.set(x, y, z); if (s) m.scale.set(...s); if (r) m.rotation.set(...r); parent.add(m); return m; }
function cylAlongX(parent, x0, x1, r0, r1, y, z, color, seg = 12) { const m = new THREE.Mesh(gCyl(r1, r0, seg), mat(color)); m.rotation.z = -Math.PI / 2; m.scale.set(1, x1 - x0, 1); m.position.set((x0 + x1) / 2, y, z); parent.add(m); return m; }
function missileModel(len, r, body, fins = .12) { // a missile pointing along +x, centred
  const g = new THREE.Group(); cylAlongX(g, -len / 2, len / 2 - r * 2.5, r, r, 0, 0, body, 10); mesh(g, gSph(10), body, len / 2 - r * 2.5, 0, 0, [r * 2.5, r, r]);
  for (let k = 0; k < 4; k++) { const f = mesh(g, BOX, 0x55585c, -len / 2 + .12, 0, 0, [.22, .01, fins * 2]); f.rotation.x = k * Math.PI / 4 * 2; } return g;
}
function bombModel(len, r) { const g = new THREE.Group(); mesh(g, gSph(12), 0x4c5240, 0, 0, 0, [len / 2, r, r]); for (let k = 0; k < 4; k++) { const f = mesh(g, BOX, 0x42463a, -len / 2 + .05, 0, 0, [.3, .01, r * 2.6]); f.rotation.x = k * Math.PI / 2; } return g; }
function podModel(len, r) { const g = new THREE.Group(); cylAlongX(g, -len / 2, len / 2, r, r, 0, 0, 0x4a4e3e, 14); mesh(g, gCyl(r * .92, r * .92, 14), 0x1a1a18, len / 2 + .005, 0, 0, [1, .01, 1], [0, 0, Math.PI / 2]); return g; }
function store(M, slot, g, x, y, z) { g.position.set(x, y, z); M.root.add(g); (M.stores[slot] = M.stores[slot] || []).push(g); return g; }
function part(M, id) { const g = new THREE.Group(); M.root.add(g); M.parts[id] = g; return g; }

function modelF16(team) {
  const M = { root: new THREE.Group(), parts: {}, stores: [] }, G1 = 0x8c939b, G2 = 0x767d85, DK = 0x5c6168;
  const fz = part(M, 'fuseF'), fr = part(M, 'fuseR'), ck = part(M, 'cockpit');
  mesh(fz, fuseGeo([[7.6, .02, .02, .3], [6.8, .3, .3, .33], [5.8, .5, .5, .4], [4.8, .58, .62, .5], [3.6, .66, .72, .5], [2.2, .78, .74, .42], [.6, .9, .72, .38], [-.4, .95, .7, .36]]), G1, 0, 0, 0);
  mesh(fz, fuseGeo([[7.62, .02, .02, .3], [7.1, .22, .22, .31], [6.4, .38, .38, .34]]), DK, 0, 0, 0); // radome
  mesh(fr, fuseGeo([[-.4, .95, .7, .36], [-2.4, .94, .66, .36], [-4.4, .82, .62, .36], [-5.9, .66, .56, .36], [-6.6, .56, .52, .36]]), G1, 0, 0, 0);
  mesh(fz, fuseGeo([[3.3, .5, .4, -.28], [2.2, .55, .44, -.3], [.4, .6, .42, -.25], [-1.2, .5, .3, -.1]]), G2, 0, 0, 0); // chin intake
  mesh(fz, BOX, 0x141414, 3.31, -.28, 0, [.02, .7, .9]);
  wingPart(fz, [[4.4, .3], [4.4, -.3], [1.4, -1.25], [1.4, 1.25]], .25, .05, G2); // strakes
  mesh(ck, gSph(16), 'glass', 4.25, 1.0, 0, [1.45, .42, .36]); mesh(ck, BOX, 0x2a2a28, 4.0, .88, 0, [1.8, .14, .7]); // bubble canopy and sill
  for (const sd of [-1, 1]) {
    const wi = part(M, sd < 0 ? 'wingLi' : 'wingRi'), wo = part(M, sd < 0 ? 'wingLo' : 'wingRo');
    wingPart(wi, [[1.5, sd * .8], [-3.4, sd * .8], [-3.75, sd * 2.8], [-.9, sd * 2.8]], .18, .14, G1);
    wingPart(wo, [[-.9, sd * 2.8], [-3.75, sd * 2.8], [-3.95, sd * 4.55], [-2.55, sd * 4.55]], .18, .1, G1);
    mesh(wo, BOX, G2, -3.2, .26, sd * 4.62, [1.9, .06, .1]); // wingtip launch rail
    const st = part(M, sd < 0 ? 'stabL' : 'stabR'); wingPart(st, [[-4.9, sd * .7], [-7.2, sd * .7], [-7.25, sd * 2.75], [-6.2, sd * 2.75]], .28, .06, G2, sd * -.1);
    mesh(fr, BOX, G2, -5.4, -.35, sd * .45, [1.2, .5, .04], [sd * .3, 0, 0]); // ventral fins
    // stores: Sidewinder on the tip, Maverick and a Mk 82 under each wing
    store(M, 1, missileModel(3.0, .065, 0xb8b8b0), -3.0, .26, sd * 4.72);
    mesh(wi, BOX, G2, -1.4, .02, sd * 2.4, [1.4, .22, .08]); store(M, 2, missileModel(2.5, .15, 0x8a9078, .2), -1.1, -.25, sd * 2.4);
    mesh(wo, BOX, G2, -2.2, .02, sd * 3.5, [1.1, .2, .07]); store(M, 3, bombModel(2.2, .14), -2.0, -.25, sd * 3.5);
  }
  const fin = part(M, 'fin'); wingPart(fin, [[-3.9, -.06], [-6.9, -.06], [-7.25, .06], [-4.2, .06]].map(p => [p[0], p[1]]), .9, .01, G1);
  mesh(fin, loftGeo([[-3.9, -.07], [-6.9, -.07], [-6.9, .07], [-3.9, .07]], .9, [[-6.1, -.04], [-7.1, -.04], [-7.1, .04], [-6.1, .04]], 3.75), G1, 0, 0, 0);
  const en = part(M, 'eng1'); cylAlongX(en, -7.6, -6.5, .5, .58, .36, 0, 0x4a4a46, 16); mesh(en, gCyl(.46, .46, 16), 0x1c1a18, -7.62, .36, 0, [1, .02, 1], [0, 0, Math.PI / 2]);
  part(M, 'fuel'); part(M, 'nose');
  mesh(fz, BOX, 0x2a2a28, 5.2, .55, .62, [.3, .06, .02]); // gun port
  return Object.assign(M, { gun: [5.3, .55, .65], cockpit: [4.6, 1.15, 0] });
}
function modelSu30(team) {
  const M = { root: new THREE.Group(), parts: {}, stores: [] }, C1 = 0x8a9cab, C2 = 0x6f8292, DK = 0x5a5f60;
  const fz = part(M, 'fuseF'), fr = part(M, 'fuseR'), ck = part(M, 'cockpit');
  mesh(fz, fuseGeo([[11.0, .02, .02, .55], [10.0, .38, .38, .58], [8.6, .62, .62, .66], [7.0, .72, .82, .8], [5.4, .8, .82, .72], [3.6, 1.0, .7, .66]]), C1, 0, 0, 0);
  mesh(fz, fuseGeo([[11.02, .02, .02, .55], [10.4, .28, .28, .56], [9.6, .45, .45, .6]]), 0xb8c0c4, 0, 0, 0);
  mesh(fr, fuseGeo([[3.6, 1.0, .7, .66], [1.0, 1.25, .6, .62], [-2.0, 1.2, .55, .6], [-5.2, .9, .45, .6], [-7.6, .45, .3, .62]]), C1, 0, 0, 0);
  mesh(ck, gSph(16), 'glass', 6.9, 1.42, 0, [2.3, .48, .46]);
  wingPart(fz, [[5.2, .9], [5.2, -.9], [1.0, -2.6], [1.0, 2.6]], .62, .07, C2); // big wing root extensions
  for (const sd of [-1, 1]) {
    const wi = part(M, sd < 0 ? 'wingLi' : 'wingRi'), wo = part(M, sd < 0 ? 'wingLo' : 'wingRo');
    wingPart(wi, [[1.4, sd * 1.4], [-4.8, sd * 1.4], [-5.2, sd * 4.4], [-1.6, sd * 4.4]], .56, .18, C1);
    wingPart(wo, [[-1.6, sd * 4.4], [-5.2, sd * 4.4], [-5.5, sd * 7.3], [-4.3, sd * 7.3]], .56, .12, C2);
    mesh(wo, BOX, C2, -4.7, .62, sd * 7.38, [1.6, .07, .1]);
    wingPart(fz, [[7.4, sd * .7], [6.6, sd * .7], [6.4, sd * 2.0], [6.9, sd * 2.0]], .7, .05, C2); // canards
    const st = part(M, sd < 0 ? 'stabL' : 'stabR'); wingPart(st, [[-6.6, sd * 1.4], [-9.0, sd * 1.4], [-9.2, sd * 3.9], [-8.3, sd * 3.9]], .55, .07, C2);
    const fn = part(M, sd < 0 ? 'finL' : 'finR'); mesh(fn, loftGeo([[-5.2, sd * 1.95], [-8.4, sd * 1.95], [-8.4, sd * 2.1], [-5.2, sd * 2.1]], .9, [[-7.6, sd * 2.0], [-9.0, sd * 2.0], [-9.0, sd * 2.08], [-7.6, sd * 2.08]], 4.6), C1, 0, 0, 0);
    const en = part(M, sd < 0 ? 'engL' : 'engR'); mesh(en, fuseGeo([[3.6, .6, .55, .1], [0, .66, .62, .2], [-5.0, .62, .6, .3], [-8.4, .55, .55, .4]]), C2, 0, 0, sd * .95);
    cylAlongX(en, -9.6, -8.4, .55, .62, .4, sd * .95, 0x4a4844, 16); mesh(en, BOX, 0x141414, 3.62, .1, sd * .95, [.02, .95, 1.05]);
    store(M, 1, missileModel(2.9, .085, 0xc4c4bc), -4.6, .62, sd * 7.5);
    store(M, 2, missileModel(3.9, .2, 0xa8aca0, .3), 1.0, -.62, sd * .95);
    store(M, 3, bombModel(2.0, .18), -2.6, .3, sd * 3.2); store(M, 3, bombModel(2.0, .18), -3.4, .3, sd * 5.2);
  }
  part(M, 'fuel'); part(M, 'nose');
  return Object.assign(M, { gun: [6.5, .9, .8], cockpit: [7.4, 1.6, 0] });
}
function rotorModel(M, key, y, r, n, chord, color, x = .6, z = 0, side) {
  const rot = new THREE.Group(); rot.position.set(x, y, z); M.root.add(rot);
  const blades = new THREE.Group(); rot.add(blades);
  for (let k = 0; k < n; k++) { const b = new THREE.Group(); b.rotation.y = k / n * TAU; blades.add(b); mesh(b, BOX, color, r / 2 + .25, 0, 0, [r - .3, .05, chord]); }
  mesh(blades, gCyl(.28, .32, 12), 0x2c2c2a, 0, .05, 0, [1, .35, 1]);
  const disc = new THREE.Mesh(new THREE.CircleGeometry(r, 32), AIR_DISC); disc.rotation.x = -Math.PI / 2; rot.add(disc);
  if (side) { rot.rotation.x = Math.PI / 2; }
  M[key] = { group: rot, blades, disc }; return rot;
}
function modelAH64(team) {
  const M = { root: new THREE.Group(), parts: {}, stores: [] }, OD = 0x4b5038, DK = 0x3a3e2c;
  const fu = part(M, 'fuse'), ck = part(M, 'cockpit'), bm = part(M, 'boom');
  mesh(fu, fuseGeo([[4.9, .08, .1, 1.1], [4.4, .42, .45, 1.15], [3.4, .55, .7, 1.35], [2.0, .62, .88, 1.5], [.6, .7, .9, 1.55], [-.8, .62, .8, 1.55], [-2.0, .42, .55, 1.6]]), OD, 0, 0, 0);
  mesh(ck, gSph(14), 'glass', 3.45, 1.95, 0, [1.0, .38, .5]); mesh(ck, gSph(14), 'glass', 2.1, 2.3, 0, [1.0, .42, .55]); // tandem canopies
  mesh(ck, BOX, DK, 2.75, 2.05, 0, [.18, .5, 1.05]);
  mesh(bm, fuseGeo([[-2.0, .42, .55, 1.6], [-5.0, .25, .35, 1.75], [-7.6, .18, .3, 1.9]]), OD, 0, 0, 0);
  mesh(bm, loftGeo([[-7.0, -.06], [-8.2, -.06], [-8.2, .06], [-7.0, .06]], 1.8, [[-7.7, -.05], [-8.5, -.05], [-8.5, .05], [-7.7, .05]], 3.6), OD, 0, 0, 0); // tail fin
  wingPart(bm, [[-7.2, -1.7], [-7.9, -1.7], [-7.9, 1.7], [-7.2, 1.7]], 1.55, .06, OD); // stabilator
  const nose = part(M, 'nose'); mesh(nose, gSph(12), DK, 4.85, .95, 0, [.38, .4, .38]); mesh(nose, BOX, 0x1a1a18, 5.18, .95, 0, [.04, .25, .35]); // TADS/PNVS turret
  for (const sd of [-1, 1]) {
    const en = part(M, sd < 0 ? 'engL' : 'engR'); mesh(en, fuseGeo([[1.2, .3, .32, 0], [-.4, .36, .38, 0], [-1.6, .3, .3, 0]]), OD, 0, 2.05, sd * .92); mesh(en, BOX, DK, -1.65, 2.05, sd * 1.1, [.2, .5, .3]);
    const wg = part(M, sd < 0 ? 'stubL' : 'stubR'); wingPart(wg, [[1.4, sd * .6], [.2, sd * .6], [.3, sd * 2.4], [1.2, sd * 2.4]], 1.3, .14, OD);
    for (const [zz, kind] of [[1.25, 'pod'], [2.15, 'hf']]) { mesh(wg, BOX, DK, .8, 1.1, sd * zz, [.6, .3, .08]); if (kind === 'pod') store(M, 1, podModel(1.6, .2), .8, .82, sd * zz); else for (let k = 0; k < 4; k++) store(M, 2, missileModel(1.6, .09, 0x4a5038, .1), .9, .72 - (k >> 1) * .24, sd * zz + (k % 2 ? .14 : -.14)); }
    mesh(fu, gCyl(.22, .22, 12), 0x1c1c1a, 1.7, .3, sd * 1.15, [1, .14, 1], [Math.PI / 2, 0, 0]); tube(fu, [1.7, .3, sd * 1.15], [1.6, .95, sd * .5], .04, 0x2a2a28); // main wheels
  }
  mesh(fu, gCyl(.13, .13, 10), 0x1c1c1a, -7.3, .2, 0, [1, .1, 1], [Math.PI / 2, 0, 0]);
  // M230 chain gun under the nose on its turret
  const gun = new THREE.Group(); gun.position.set(3.3, .55, 0); M.root.add(gun); mesh(gun, gSph(10), DK, 0, 0, 0, [.22, .2, .22]); cylAlongX(gun, 0, 1.7, .05, .045, -.05, 0, 0x1c1c1a, 8); M.gunPivot = gun;
  part(M, 'trans'); part(M, 'fuel');
  const rt = part(M, 'rotor'); rotorModel(M, 'rotor', 3.95, 7.3, 4, .5, 0x2e3024); M.rotor.group.parent.remove(M.rotor.group); rt.add(M.rotor.group);
  mesh(rt, gCyl(.12, .12, 8), 0x2e2e2a, .6, 3.4, 0, [1, 1.0, 1]); mesh(rt, gSph(12), 0x6a6e5a, .6, 4.5, 0, [.45, .3, .45]); // mast and Longbow radar
  const tr = part(M, 'trot'); rotorModel(M, 'trotor', 2.9, 1.4, 4, .2, 0x2e3024, -8.2, .35, true); M.trotor.group.parent.remove(M.trotor.group); tr.add(M.trotor.group);
  return Object.assign(M, { gun: [4.9, .5, 0], cockpit: [2.6, 2.4, 0] });
}
function modelKa52(team) {
  const M = { root: new THREE.Group(), parts: {}, stores: [] }, GR = 0x5e6b5c, G2 = 0x4c5849, DK = 0x353a33;
  const fu = part(M, 'fuse'), ck = part(M, 'cockpit'), bm = part(M, 'boom');
  mesh(fu, fuseGeo([[5.0, .1, .1, 1.0], [4.4, .62, .55, 1.15], [3.2, .9, .85, 1.4], [1.4, .95, 1.0, 1.5], [-.6, .85, .95, 1.55], [-2.0, .5, .6, 1.6]]), GR, 0, 0, 0);
  mesh(ck, gSph(16), 'glass', 3.3, 1.85, 0, [1.4, .62, .9]); // side-by-side cockpit
  mesh(bm, fuseGeo([[-2.0, .5, .6, 1.6], [-5.2, .3, .4, 1.8], [-7.2, .22, .35, 1.9]]), GR, 0, 0, 0);
  const fin = part(M, 'fin'); wingPart(fin, [[-6.4, -1.5], [-7.2, -1.5], [-7.2, 1.5], [-6.4, 1.5]], 1.85, .06, G2);
  for (const sd of [-1, 1]) mesh(fin, loftGeo([[-6.3, sd * 1.5], [-7.4, sd * 1.5], [-7.4, sd * 1.56], [-6.3, sd * 1.56]], 1.2, [[-6.6, sd * 1.5], [-7.5, sd * 1.5], [-7.5, sd * 1.56], [-6.6, sd * 1.56]], 3.0), G2, 0, 0, 0);
  const nose = part(M, 'nose'); mesh(nose, gSph(12), DK, 4.4, 2.2, 0, [.4, .35, .4]); // GOES sight ball
  for (const sd of [-1, 1]) {
    const en = part(M, sd < 0 ? 'engL' : 'engR'); mesh(en, fuseGeo([[1.4, .34, .36, 0], [-.4, .4, .42, 0], [-1.8, .32, .32, 0]]), G2, 0, 2.35, sd * 1.0);
    const wg = part(M, sd < 0 ? 'stubL' : 'stubR'); wingPart(wg, [[1.4, sd * .9], [.2, sd * .9], [.35, sd * 2.9], [1.15, sd * 2.9]], 1.25, .14, G2);
    mesh(wg, BOX, DK, .8, 1.05, sd * 1.6, [.6, .3, .08]); store(M, 1, podModel(1.7, .23), .8, .76, sd * 1.6);
    mesh(wg, BOX, DK, .8, 1.05, sd * 2.5, [.6, .3, .08]); for (let k = 0; k < 6; k++) store(M, 2, missileModel(2.7, .07, 0x5a6050, .08), .9, .8 - (k % 2) * .16, sd * 2.5 + ((k >> 1) - 1) * .13);
  }
  const gun = new THREE.Group(); gun.position.set(1.6, .95, .95); M.root.add(gun); mesh(gun, BOX, DK, .3, 0, 0, [1.2, .35, .35]); cylAlongX(gun, .8, 2.9, .05, .045, 0, 0, 0x1c1c1a, 8); M.gunPivot = gun;
  part(M, 'trans'); part(M, 'fuel');
  const rt = part(M, 'rotor');
  rotorModel(M, 'rotor', 4.25, 7.25, 3, .55, 0x2c3029); M.rotor.group.parent.remove(M.rotor.group); rt.add(M.rotor.group);
  rotorModel(M, 'rotor2', 5.15, 7.25, 3, .55, 0x2c3029); M.rotor2.group.parent.remove(M.rotor2.group); rt.add(M.rotor2.group);
  mesh(rt, gCyl(.16, .16, 8), 0x2e2e2a, .6, 4.1, 0, [1, 1.4, 1]);
  return Object.assign(M, { gun: [4.0, .95, .95], cockpit: [3.4, 2.2, 0] });
}

/* ---------------- definitions: performance, weapons, parts (x forward, y up, z right; spheres) ---------------- */
const P_ = (id, kind, p, r, hp, o = {}) => ({ id, kind, p, r, hp, ...o });
const AIR = {
  f16: { name: 'F-16C Block 50', short: 'F-16C', cls: 'jet', model: modelF16, mass: 12000, S: 27.9, thrust: [76e3, 129e3], CLa: 4.6, CLmax: 1.45, aStall: .36, cd0: .022, kInd: .12, rates: [4.0, .62, .3], gmax: 9, gear: 1.75, len: 15, wid: 9.5, R: 9, cam: 21, flares: 30,
    info: 'Agile multirole fighter: M61 cannon, 2 AIM-9X, 2 Maverick, 2 Mk 82. Takes off from your airfield, lands there to rearm.',
    weapons: [{ k: 'm61', n: 510 }, { k: 'aim9x', n: 2 }, { k: 'agm65', n: 2 }, { k: 'mk82', n: 2 }],
    parts: [P_('cockpit', 'cockpit', [4.3, 1.0, 0], .75, 40), P_('nose', 'nose', [6.4, .35, 0], .6, 45), P_('fuseF', 'fuse', [2.0, .4, 0], 1.1, 150), P_('fuseR', 'fuse', [-2.6, .35, 0], 1.05, 150), P_('fuel', 'fuel', [-.2, .35, 0], .85, 60),
      P_('eng1', 'engine', [-5.4, .35, 0], .8, 75), P_('wingLi', 'wing', [-1.3, .25, -1.9], 1.05, 90, { side: -1, seg: 'in' }), P_('wingLo', 'wing', [-2.8, .25, -3.7], .85, 55, { side: -1, seg: 'out' }), P_('wingRi', 'wing', [-1.3, .25, 1.9], 1.05, 90, { side: 1, seg: 'in' }), P_('wingRo', 'wing', [-2.8, .25, 3.7], .85, 55, { side: 1, seg: 'out' }),
      P_('stabL', 'stab', [-6.4, .3, -1.8], .75, 40, { side: -1 }), P_('stabR', 'stab', [-6.4, .3, 1.8], .75, 40, { side: 1 }), P_('fin', 'fin', [-6.0, 2.3, 0], .9, 45)] },
  su30: { name: 'Su-30SM', short: 'Su-30SM', cls: 'jet', model: modelSu30, mass: 26000, S: 62, thrust: [150e3, 245e3], CLa: 4.4, CLmax: 1.5, aStall: .4, cd0: .023, kInd: .11, rates: [3.4, .6, .32], gmax: 9, gear: 2.1, len: 22, wid: 14.7, R: 12, cam: 26, flares: 32,
    info: 'Heavy twin-engine fighter: GSh-30-1 cannon, 2 R-73, 2 Kh-29T, 4 FAB-250. Keeps flying on one engine.',
    weapons: [{ k: 'gsh301', n: 150 }, { k: 'r73', n: 2 }, { k: 'kh29t', n: 2 }, { k: 'fab250', n: 4 }],
    parts: [P_('cockpit', 'cockpit', [7.0, 1.4, 0], .85, 45), P_('nose', 'nose', [9.8, .6, 0], .7, 50), P_('fuseF', 'fuse', [4.2, .7, 0], 1.3, 170), P_('fuseR', 'fuse', [-1.8, .65, 0], 1.4, 170), P_('fuel', 'fuel', [1.0, .65, 0], 1.0, 70),
      P_('engL', 'engine', [-5.4, .4, -.95], .75, 70), P_('engR', 'engine', [-5.4, .4, .95], .75, 70), P_('wingLi', 'wing', [-2.0, .6, -3.0], 1.5, 100, { side: -1, seg: 'in' }), P_('wingLo', 'wing', [-4.4, .6, -5.8], 1.15, 60, { side: -1, seg: 'out' }), P_('wingRi', 'wing', [-2.0, .6, 3.0], 1.5, 100, { side: 1, seg: 'in' }), P_('wingRo', 'wing', [-4.4, .6, 5.8], 1.15, 60, { side: 1, seg: 'out' }),
      P_('stabL', 'stab', [-8.2, .6, -2.7], 1.0, 45, { side: -1 }), P_('stabR', 'stab', [-8.2, .6, 2.7], 1.0, 45, { side: 1 }), P_('finL', 'fin', [-7.4, 2.8, -2.0], .95, 40), P_('finR', 'fin', [-7.4, 2.8, 2.0], .95, 40)] },
  ah64: { name: 'AH-64D Apache Longbow', short: 'Apache', cls: 'heli', model: modelAH64, mass: 8000, lift: 1.7, cd: 4.6, len: 17.7, wid: 5, R: 8.5, cam: 17, flares: 30, tailRotor: true, skid: 0,
    info: 'Armoured attack helicopter: M230 chain gun (follows your aim), 38 Hydra rockets, 8 Hellfire (laser: keep the crosshair on the target). Rearms at your base.',
    weapons: [{ k: 'm230', n: 1200, turret: [-1.75, 1.75, -1.05, .19] }, { k: 'hydra', n: 38 }, { k: 'hellfire', n: 8 }],
    parts: [P_('cockpit', 'cockpit', [2.9, 1.8, 0], .9, 85), P_('nose', 'nose', [4.8, .95, 0], .45, 40), P_('fuse', 'fuse', [.8, 1.45, 0], 1.15, 170), P_('fuel', 'fuel', [.2, 1.1, 0], .75, 70),
      P_('engL', 'engine', [-.3, 2.05, -.95], .55, 60), P_('engR', 'engine', [-.3, 2.05, .95], .55, 60), P_('trans', 'trans', [.6, 2.5, 0], .55, 70), P_('rotor', 'rotor', [.6, 3.95, 0], 1.4, 80),
      P_('boom', 'boom', [-4.6, 1.75, 0], .7, 70), P_('trot', 'trot', [-8.2, 2.9, .35], .8, 35), P_('stubL', 'stub', [.8, 1.35, -1.6], .7, 50), P_('stubR', 'stub', [.8, 1.35, 1.6], .7, 50)] },
  ka52: { name: 'Ka-52 Alligator', short: 'Ka-52', cls: 'heli', model: modelKa52, mass: 10400, lift: 1.65, cd: 5.6, len: 16, wid: 6, R: 8.5, cam: 17, flares: 30, tailRotor: false, skid: 0,
    info: 'Coaxial-rotor attack helicopter: 2A42 30 mm cannon (narrow arc), 40 S-8 rockets, 12 Vikhr (beam-riding: keep the crosshair on the target). No tail rotor to lose. Rearms at your base.',
    weapons: [{ k: 'a42', n: 460, turret: [-.06, .17, -.6, .05] }, { k: 's8', n: 40 }, { k: 'vikhr', n: 12 }],
    parts: [P_('cockpit', 'cockpit', [3.2, 1.6, 0], 1.1, 90), P_('nose', 'nose', [4.4, 2.2, 0], .4, 40), P_('fuse', 'fuse', [.6, 1.45, 0], 1.3, 180), P_('fuel', 'fuel', [.0, 1.1, 0], .8, 70),
      P_('engL', 'engine', [-.2, 2.35, -1.0], .55, 60), P_('engR', 'engine', [-.2, 2.35, 1.0], .55, 60), P_('trans', 'trans', [.6, 2.8, 0], .55, 70), P_('rotor', 'rotor', [.6, 4.7, 0], 1.6, 90),
      P_('boom', 'boom', [-4.4, 1.8, 0], .7, 70), P_('fin', 'fin', [-6.8, 2.2, 0], 1.0, 40), P_('stubL', 'stub', [.8, 1.3, -1.9], .7, 50), P_('stubR', 'stub', [.8, 1.3, 1.9], .7, 50)] },
};
const TEAM_AIR = [{ jet: 'f16', heli: 'ah64' }, { jet: 'su30', heli: 'ka52' }];
const AIR_PART_NAME = { cockpit: 'cockpit', nose: 'sensors', fuse: 'fuselage', fuel: 'fuel tank', engine: 'engine', wing: 'wing', stab: 'tailplane', fin: 'fin', rotor: 'main rotor', trans: 'transmission', boom: 'tail boom', trot: 'tail rotor', stub: 'stub wing' };

class Aircraft extends Ent {
  constructor(type, team) {
    super('air', team); this.type = type; this.def = AIR[type]; this.cls = this.def.cls;
    this.T = { len: this.def.len, wid: this.def.wid, hgt: 2.2, name: this.def.name, short: this.def.short, eye: 2, cam: this.def.cam };
    this.R = this.def.R; this.quat = new THREE.Quaternion(); this.omega = new V3(); this.throttle = .8; this.onGround = true;
    this.parts = this.def.parts.map(p => ({ ...p, max: p.hp })); this.ammo = this.def.weapons.map(w => w.n); this.cool = this.def.weapons.map(() => 0);
    this.sel = 0; this.flares = this.def.flares; this.flareT = 0; this.fire = 0; this.extT = 0; this.rpm = 1; this.hdg = 0; this.pit = 0; this.rol = 0; this.spin = 0; this.driver = null; this.hp = 1;
    this.model = this.def.model(team); mergeModel(this.model.root);
    const PS = this.model.partSpheres; if (PS) for (const p of this.parts) { const q = PS[p.id]; if (q) { p.p = q.p; p.r = q.r; if (q.sph && q.sph.length) p.sph = q.sph; } } // a model with its own shape brings its own hit spheres
    this.model.root.traverse(o => { if (o.isMesh && o.material === VCOL_MAT) o.material = AIR_MAT; if (o.isMesh) o.castShadow = o.material !== AIR_DISC && o.material !== AIR_GLASS; });
    scene.add(this.model.root);
  }
  part(id) { return this.parts.find(p => p.id === id); }
}
const pOK = p => p && p.hp > 0, pH = p => p ? clamp(p.hp / p.max, 0, 1) : 1;
function airSpawn(cls, team) {
  const a = new Aircraft(TEAM_AIR[team][cls], team), M = GAME.M;
  if (a.cls === 'jet') { // the start of the runway, pointing down it
    const af = M.airfields[team], ca = Math.cos(af.ang), sa = Math.sin(af.ang), x = af.x * 1000 - ca * af.len * 420, z = af.y * 1000 - sa * af.len * 420;
    a.pos.set(x, groundY(x, z) + a.def.gear, z); a.hdg = af.ang; a.pit = 0; a.throttle = 1; a.onGround = true; a.vel.set(ca, 0, sa).multiplyScalar(25);
  } else { // a pad at the base
    const b = M.bases[team], [x0, z0] = b.vehicleSpawn; let x = x0, z = z0;
    for (let k = 0; k < 20; k++) { x = x0 + (k % 4 - 1.5) * 26 - Math.cos(b.ang) * 70; z = z0 + Math.floor(k / 4) * 26 - Math.sin(b.ang) * 70; if (!ENTS.some(e => e.kind === 'air' && e.alive && e.pos.distanceTo(_av.set(x, e.pos.y, z)) < 20)) break; }
    a.pos.set(x, groundY(x, z) + a.def.skid, z); a.hdg = b.ang; a.onGround = true;
  }
  airQuatFromEuler(a); placeAir(a); return a;
}
const _av = new V3(), _aw = new V3(), _ax = new V3(), _ay = new V3(), _az = new V3(), _aq = new THREE.Quaternion(), _ae = new THREE.Euler(), _aq2 = new THREE.Quaternion();
function airQuatFromEuler(a) { a.quat.setFromEuler(_ae.set(a.rol, -a.hdg, a.pit, 'YZX')); }
function placeAir(a) { a.model.root.position.copy(a.pos); a.model.root.quaternion.copy(a.quat); }
function axes(a) { _ax.set(1, 0, 0).applyQuaternion(a.quat); _ay.set(0, 1, 0).applyQuaternion(a.quat); _az.set(0, 0, 1).applyQuaternion(a.quat); }

/* ---------------- flying ---------------- */
// mouse aim: turn a wanted direction into roll, pitch and yaw commands (-1..1), the way a pilot would (roll toward it, then pull)
function steerToward(a, dir, out) {
  _aq.copy(a.quat).invert(); const d = _av.copy(dir).normalize().applyQuaternion(_aq), ang = Math.acos(clamp(d.x, -1, 1));
  const pitchErr = Math.atan2(d.y, d.x), yawErr = Math.atan2(d.z, d.x), bankErr = Math.atan2(d.z, d.y + 1e-4);
  axes(a); const level = Math.atan2(_az.y, _ay.y); // how far the wings are from level (positive: right wing high)
  const w = sstep(.05, .25, ang);
  out.x = clamp(lerp(level * 2.2, bankErr * 2.6, w), -1, 1);
  out.z = clamp(pitchErr * 4.5, -.45, 1) * (w > .5 ? Math.max(.1, Math.cos(bankErr)) : 1);
  out.y = clamp(-yawErr * 3, -1, 1);
  return out;
}
function wingLift(a, side) { const i = a.parts.find(p => p.kind === 'wing' && p.side === side && p.seg === 'in'), o = a.parts.find(p => p.kind === 'wing' && p.side === side && p.seg === 'out'); if (!pOK(i)) return 0; return (.62 + .38 * pH(i)) * (pOK(o) ? .55 + .45 * pH(o) : .5); }
function jetPhysics(a, cmd, dt) {
  const D = a.def, m = D.mass, g = 9.81;
  const engs = a.parts.filter(p => p.kind === 'engine'), ef = engs.reduce((s, p) => s + (pOK(p) ? .45 + .55 * pH(p) : 0), 0) / engs.length;
  let thr = a.throttle <= .85 ? a.throttle / .85 * D.thrust[0] : D.thrust[0] + (a.throttle - .85) / .15 * (D.thrust[1] - D.thrust[0]); thr *= ef;
  if (a.onGround) { // take-off roll and landing roll: wheels on the ground, nose wheel steering, rotate at speed
    const V = a.vel.length(), gy = groundY(a.pos.x, a.pos.z) + D.gear;
    a.hdg += (cmd.y * -.6 + cmd.x * .25) * clamp(V / 25, .1, 1) * dt * (V < 2 ? 0 : 1);
    const qd = .6 * V * V, lift = qd * D.S * D.CLa * Math.max(0, a.pit + .04) * (wingLift(a, -1) + wingLift(a, 1)) / 2;
    const brake = a.throttle < .05 ? 6 : .25, acc = (thr - qd * D.S * (D.cd0 + .02)) / m - brake * Math.sign(V) * (V > .3 ? 1 : 0);
    const nv = Math.max(0, V + acc * dt);
    a.pit = clamp(a.pit + (V > 62 ? cmd.z * .35 : -.4) * dt, 0, .24); a.rol *= .9;
    a.vel.set(Math.cos(a.hdg) * nv, 0, Math.sin(a.hdg) * nv); a.pos.addScaledVector(a.vel, dt); a.pos.y = gy;
    airQuatFromEuler(a); a.omega.set(0, 0, 0);
    if (lift > m * g * 1.02) { a.onGround = false; a.vel.y = 1.5; }
    const sl = Math.abs(groundY(a.pos.x + Math.cos(a.hdg) * 10, a.pos.z + Math.sin(a.hdg) * 10) - groundY(a.pos.x, a.pos.z)) / 10;
    if (nv > 30 && (sl > .12 || terrainY(a.pos.x, a.pos.z) < .5)) crashAir(a, 'ran off the runway');
    return;
  }
  axes(a);
  const V = Math.max(1, a.vel.length()), vh = _aw.copy(a.vel).divideScalar(V), vx = a.vel.dot(_ax), vy = a.vel.dot(_ay), vz = a.vel.dot(_az);
  const alpha = Math.atan2(-vy, vx), beta = Math.atan2(vz, Math.max(1, vx)), qd = .6 * V * V;
  const wl = wingLift(a, -1), wr = wingLift(a, 1), lf = (wl + wr) / 2;
  let CL = Math.abs(alpha) < D.aStall ? D.CLa * alpha : Math.sign(alpha) * D.CLmax * Math.max(.3, 1 - (Math.abs(alpha) - D.aStall) * 2.2); CL *= lf;
  const lift = _av.copy(_ay).addScaledVector(vh, -_ay.dot(vh)); const ll = lift.length(); if (ll > 1e-4) lift.divideScalar(ll);
  const wave = V > 300 ? .06 * ((V - 300) / 100) ** 2 : 0, broken = a.parts.filter(p => !pOK(p)).length * .004 + a.stores();
  const F = new V3().addScaledVector(lift, qd * D.S * CL).addScaledVector(vh, -qd * D.S * (D.cd0 + wave + broken + D.kInd * CL * CL)).addScaledVector(_az, -qd * D.S * .5 * beta).addScaledVector(_ax, thr);
  F.y -= m * g;
  a.vel.addScaledVector(F, dt / m);
  // control surfaces lose authority at low speed and when shot up
  const eff = clamp(qd / (.6 * 140 * 140), .12, 1.25), stabs = a.parts.filter(p => p.kind === 'stab'), fins = a.parts.filter(p => p.kind === 'fin');
  const pitchEff = stabs.reduce((s, p) => s + (pOK(p) ? .5 * (.5 + .5 * pH(p)) : .1), 0) * (D.CLa > 0 ? 1 : 1), rollEff = (pOK(a.parts.find(p => p.id.endsWith('Lo'))) ? .5 : .2) + (pOK(a.parts.find(p => p.id.endsWith('Ro'))) ? .5 : .2), finEff = fins.reduce((s, p) => s + (pOK(p) ? 1 / fins.length : 0), 0);
  const maxP = Math.min(D.rates[1], D.gmax * g / V);
  let pc = cmd.z; if (alpha > D.aStall * .92 && pc > 0) pc *= .15; // the flight computer won't pull into a stall
  const k = Math.min(1, dt * 5);
  a.omega.x += (cmd.x * D.rates[0] * eff * rollEff - a.omega.x) * k;
  a.omega.z += (pc * maxP * Math.min(1, eff * 1.4) * pitchEff - a.omega.z) * Math.min(1, dt * 4);
  a.omega.y += (cmd.y * D.rates[2] * eff * Math.max(.15, finEff) - a.omega.y) * Math.min(1, dt * 3);
  // what damage does on its own: an uneven wing rolls the jet, one engine out yaws a twin, no fin and it weaves
  a.omega.x += -(wr - wl) * 8 * eff * dt;
  if (engs.length === 2) a.omega.y += (pOK(engs[1]) - pOK(engs[0])) * .25 * dt * a.throttle;
  a.omega.y += -beta * 2.2 * finEff * eff * dt + (finEff < .5 ? Math.sin(GAME.time * 2.3) * .2 * dt : 0);
  a.omega.z += -alpha * .25 * dt;
  const w = a.omega.length(); if (w > 1e-6) { _aq2.setFromAxisAngle(_av.copy(a.omega).divideScalar(w), w * dt); a.quat.multiply(_aq2).normalize(); }
  a.pos.addScaledVector(a.vel, dt);
  a.alpha = alpha; a.gload = (qd * D.S * CL) / (m * g);
  // touching down: gentle and level on flat ground is a landing, anything else is a crash
  const gy = groundY(a.pos.x, a.pos.z);
  if (a.pos.y - gy < D.gear) {
    axes(a); const roll = Math.asin(clamp(_az.y, -1, 1)), pitch = Math.asin(clamp(_ax.y, -1, 1));
    const sl = Math.abs(groundY(a.pos.x + 12, a.pos.z) - groundY(a.pos.x - 12, a.pos.z)) / 24 + Math.abs(groundY(a.pos.x, a.pos.z + 12) - groundY(a.pos.x, a.pos.z - 12)) / 24;
    if (a.vel.y > -5 && Math.abs(roll) < .25 && pitch > -.06 && pitch < .3 && V < 115 && sl < .06 && gy > .5 && _ay.y > .9) { a.onGround = true; a.hdg = Math.atan2(_ax.z, _ax.x); a.pit = Math.max(0, pitch); a.rol = 0; a.pos.y = gy + D.gear; }
    else crashAir(a, 'crashed');
  }
}
function heliPhysics(a, inp, dt) {
  const D = a.def, m = D.mass, g = 9.81;
  const engs = a.parts.filter(p => p.kind === 'engine'), ef = engs.reduce((s, p) => s + (pOK(p) ? .4 + .6 * pH(p) : 0), 0) / engs.length;
  if (!pOK(a.part('trans'))) a.rpm = Math.max(0, a.rpm - dt * .08); // the gearbox seizes: the rotor slowly winds down
  const rotor = pOK(a.part('rotor')) ? a.rpm : 0, power = ef > 0 ? Math.min(1, .55 + ef * .5) : .7; // no engines: autorotation, a controlled fall
  const maxLift = D.lift * m * g * rotor * (ef > 0 ? 1 : .85);
  const ctl = rotor > .3 ? 1 : .2;
  a.pit += ((-inp.fwd * .34) - a.pit) * Math.min(1, dt * 2.4) * ctl; a.rol += ((inp.side * .3) - a.rol) * Math.min(1, dt * 2.4) * ctl;
  // yaw: the tail rotor fights the main rotor's torque; lose it (or the boom) and the helicopter spins
  const tr = D.tailRotor ? pOK(a.part('trot')) && pOK(a.part('boom')) : pOK(a.part('boom'));
  if (tr) { a.spin *= Math.pow(.2, dt); a.hdg += clamp(angDiffA(a.hdg, inp.hdg) * 2, -1.3, 1.3) * dt * ctl; }
  else if (D.tailRotor) { a.spin = Math.min(3.2, a.spin + dt * 1.1 * rotor); a.hdg -= a.spin * dt; }
  else { a.hdg += clamp(angDiffA(a.hdg, inp.hdg) * 2, -1.3, 1.3) * dt * .5 + Math.sin(GAME.time * 1.7) * .4 * dt; } // a coaxial with no tail fin wanders but doesn't spin
  const tilt = Math.cos(a.pit) * Math.cos(a.rol), need = m * g / Math.max(.4, tilt), vyWant = inp.up * 9;
  const col = clamp(need + (vyWant - a.vel.y) * m * 1.4, 0, maxLift * power);
  airQuatFromEuler(a); axes(a);
  const F = new V3().addScaledVector(_ay, col); F.y -= m * g;
  const V = a.vel.length(); F.addScaledVector(a.vel, -(D.cd * V + 30) * (m / 8000));
  a.vel.addScaledVector(F, dt / m);
  a.pos.addScaledVector(a.vel, dt);
  const gy = groundY(a.pos.x, a.pos.z) + D.skid;
  if (a.pos.y <= gy) {
    if (a.vel.y < -7.5 || Math.abs(a.rol) > .55 || Math.abs(a.pit) > .55 || V > 25) { crashAir(a, 'crashed'); return; }
    a.pos.y = gy; a.vel.y = Math.max(0, a.vel.y); a.vel.x *= Math.pow(.02, dt); a.vel.z *= Math.pow(.02, dt); a.onGround = inp.up <= 0; a.pit *= .8; a.rol *= .8;
  } else if (a.pos.y > gy + .6) a.onGround = false;
}
const angDiffA = (a, b) => { let d = (b - a) % TAU; if (d > Math.PI) d -= TAU; if (d < -Math.PI) d += TAU; return d; };
Aircraft.prototype.stores = function () { let n = 0; for (const list of this.model.stores) if (list) for (const g of list) if (g.visible) n++; return n * .0012; };

/* ---------------- weapons ---------------- */
function airGunWorld(a, out) { a.model.root.updateMatrixWorld(true); return out.set(...a.model.gun).applyMatrix4(a.model.root.matrixWorld); }
function lockAir(a, dir, maxAng = .5, range = 5000) { // an enemy aircraft in front of the seeker
  let best = null, bs = 1e9;
  for (const e of ENTS) { if (e.kind !== 'air' || !e.alive || e.team === a.team || e.team === 2) continue; const d = _av.copy(e.pos).sub(a.pos), L = d.length(); if (L > range) continue; const an = d.angleTo(dir); if (an > maxAng) continue; const sc = an * 3000 + L; if (sc < bs && lineOfSight(a.pos, e.pos)) { bs = sc; best = e; } }
  return best;
}
function lockGround(a, dir, aimPt, aimEnt) { // the ground target a missile seeker would pick: the one under the crosshair, or the nearest to it
  if (aimEnt && aimEnt.alive && aimEnt.team !== a.team && aimEnt.kind !== 'air') return aimEnt;
  let best = null, bs = 1e9;
  for (const e of ENTS) { if (!e.alive || e.team === a.team || e.kind === 'air' || (e.kind === 'soldier' && e.veh) || (e.kind === 'vehicle' && !e.driver && e.team !== 2)) continue; const d = _av.copy(e.pos).sub(a.pos), L = d.length(); if (L > 7000 || L < 100) continue; const an = d.angleTo(dir); if (an > .09) continue; const sc = an * 4000 + L * .2 + (e.kind === 'vehicle' ? 0 : 400); if (sc < bs) { bs = sc; best = e; } }
  return best;
}
function fireAir(a, slot, o) { // o: { dir (aim direction), aimPt, aimEnt, target }
  const W = a.def.weapons[slot], A = AMMO[W.k]; if (!W || a.ammo[slot] <= 0 || a.cool[slot] > 0) return false;
  const from = airGunWorld(a, new V3()); axes(a);
  if (slot === 0) { // the gun
    let dir = _ax.clone();
    if (W.turret) { // a turret under the nose: points where the gunner looks, within its limits
      _aq.copy(a.quat).invert(); const d = o.dir.clone().applyQuaternion(_aq); let yaw = Math.atan2(d.z, d.x), pit = Math.atan2(d.y, Math.hypot(d.x, d.z)); yaw = clamp(yaw, W.turret[0], W.turret[1]); pit = clamp(pit, W.turret[2], W.turret[3]);
      dir.set(Math.cos(pit) * Math.cos(yaw), Math.sin(pit), Math.cos(pit) * Math.sin(yaw)).applyQuaternion(a.quat);
      if (a.model.gunPivot) { a.model.gunPivot.rotation.set(0, -yaw, pit); }
    } else dir.addScaledVector(_ay, .012).normalize();
    if (A.kind === 'bullet') hitscan(W.k, a, a.team, from, dir, A.spread); else { const p = launch(W.k, a, a.team, from, dir); p.vel.add(a.vel); }
    a.cool[slot] = A.rate; a.ammo[slot]--; Sound.at(A.kind === 'bullet' ? 'mg' : 'auto', from, A.kind === 'bullet' ? .55 : .8); if (Math.random() < .5) sprite(from, .5, .3, .04, 0xffd890, true);
    return true;
  }
  const hideStore = () => { const list = a.model.stores[slot]; if (list) { const g = list.find(s => s.visible); if (g && !(A.look === 'rocket')) g.visible = false; } };
  if (A.aa) {
    const tg = o.target || lockAir(a, o.dir); if (!tg) return 'nolock';
    const st = (a.model.stores[slot] || []).find(s => s.visible), sp = st ? st.getWorldPosition(new V3()) : from;
    const p = launch(W.k, a, a.team, sp, _ax.clone(), A.v * .7); p.vel.add(a.vel); p.target = tg; p.guide = () => tg.alive ? tg.pos.clone().addScaledVector(tg.vel, clamp(tg.pos.distanceTo(p.pos) / A.v, 0, 2.5)) : null;
    a.cool[slot] = .8; a.ammo[slot]--; hideStore(); Sound.at('rpg', sp, 1.2); return true;
  }
  if (A.guided) { // air-to-ground missile: locks a target, or rides the laser / beam to the crosshair
    const tg = o.target || lockGround(a, o.dir, o.aimPt, o.aimEnt), pt = o.aimPt ? o.aimPt.clone() : null;
    if (!tg && !pt) return 'nolock';
    const st = (a.model.stores[slot] || []).find(s => s.visible), sp = st ? st.getWorldPosition(new V3()) : from;
    const p = launch(W.k, a, a.team, sp, _ax.clone().addScaledVector(_ay, -.03), A.v * .8); p.vel.add(a.vel);
    const laser = a.cls === 'heli' && a.driver && a.driver.isPlayer;
    p.guide = laser ? () => CAM.aim.clone() : tg ? () => tg.alive ? aimCenter(tg, new V3()) : (pt || null) : () => pt;
    a.cool[slot] = 1.0; a.ammo[slot]--; hideStore(); Sound.at('rpg', sp, 1); return true;
  }
  if (A.look === 'bomb') { const st = (a.model.stores[slot] || []).find(s => s.visible), sp = st ? st.getWorldPosition(new V3()) : from; const p = launch(W.k, a, a.team, sp, _ax.clone(), 1); p.vel.copy(a.vel); a.cool[slot] = .35; a.ammo[slot]--; hideStore(); return true; }
  // rockets: along the nose (a helicopter can nudge them a little toward the crosshair)
  let dir = _ax.clone(); if (a.cls === 'heli' && o.dir) { const an = dir.angleTo(o.dir); dir.lerp(o.dir, Math.min(1, .07 / Math.max(an, .07))).normalize(); }
  const st = (a.model.stores[slot] || []).find(s => s.visible), sp = st ? st.getWorldPosition(new V3()) : from, side = (a.ammo[slot] % 2 ? 1 : -1);
  const p = launch(W.k, a, a.team, sp.clone().addScaledVector(_az, side * .05), dir.clone().add(new V3((Math.random() - .5) * A.spread * 2, (Math.random() - .5) * A.spread * 2, (Math.random() - .5) * A.spread * 2)).normalize()); p.vel.add(a.vel);
  a.cool[slot] = A.rate; a.ammo[slot]--; Sound.at('rpg', sp, .6); return true;
}
function popFlares(a) {
  if (a.flares <= 0 || a.flareT > 0) return; a.flares -= 2; a.flareT = 1.2;
  axes(a); for (let k = 0; k < 6; k++) { const s = sprite(a.pos.clone().addScaledVector(_ax, -a.def.len * .3), 1.6, .6, 1.6, 0xfff0c0, true, -3, 1); s.userData.vel = a.vel.clone().multiplyScalar(.6).add(new V3(rand(-15, 15), rand(-12, 2), rand(-15, 15))); }
  for (const p of PROJS) if (p.target === a && Math.random() < .72) { p.guide = null; p.target = null; } // the seekers go for the flares
}
function incoming(a) { return PROJS.some(p => p.target === a && p.guide); }

/* ---------------- damage, by part ---------------- */
function airDmg(A) { return A.kind === 'bullet' ? A.main * .45 : A.kind === 'he' ? (A.splashDmg || 80) * .6 + 20 : A.kind === 'heat' ? 150 + (A.main || 0) * .5 : (A.main || 60) * .9; }
function segUnitAir(a, b, e) { // segment a->b against the aircraft's part spheres (in its own frame); remembers which parts it crossed
  _aq.copy(e.quat).invert(); const la = _av.copy(a).sub(e.pos).applyQuaternion(_aq).clone(), lb = _aw.copy(b).sub(e.pos).applyQuaternion(_aq).clone();
  const hits = []; for (const p of e.parts) { if (p.gone) continue; let t = null; if (p.sph) { for (const q of p.sph) { const u = segSphere(la, lb, _ax.set(q[0], q[1], q[2]), q[3]); if (u !== null && (t === null || u < t)) t = u; } } else t = segSphere(la, lb, _ax.set(...p.p), p.r); if (t !== null) hits.push([t, p]); }
  if (e.kind === 'air' && e.cls === 'heli' && pOK(e.part('rotor'))) { // the rotor disc: a round crossing it can hit a blade
    const ry = e.part('rotor').p[1]; if ((la.y - ry) * (lb.y - ry) < 0) { const t = (ry - la.y) / (lb.y - la.y), x = lerp(la.x, lb.x, t) - .6, z = lerp(la.z, lb.z, t); if (Math.hypot(x, z) < 7.2 && Math.random() < .14) hits.push([t, e.part('rotor')]); }
  }
  if (!hits.length) return null;
  hits.sort((p, q) => p[0] - q[0]); e._hits = hits; return hits[0][0];
}
function airShot(e, A, owner, a, b) {
  const hits = e._hits; if (!hits || !hits.length) return false;
  const dmg = airDmg(A), deep = A.kind === 'bullet' ? 2 : 4;
  hits.slice(0, deep).forEach(([t, p], k) => partDamage(e, p, dmg * (k ? .45 : 1), owner, A));
  const pt = a.clone().lerp(b, hits[0][0]); sparks(pt, A.kind === 'bullet' ? 2 : 5);
  const by = creditOf(owner);
  if (by && by.isPlayer && e.team !== GAME.team) { hitMarker(!e.alive); hitInfo(`HIT · ${[...new Set(hits.slice(0, deep).map(h => AIR_PART_NAME[h[1].kind]))].join(', ').toUpperCase()}`, '#ffd27a'); }
  if (e.driver && e.driver.isPlayer) flashDamage();
  return { pt, pen: true };
}
function airSplash(e, pt, A, owner) {
  _aq.copy(e.quat).invert(); const lp = _av.copy(pt).sub(e.pos).applyQuaternion(_aq).clone();
  for (const p of e.parts) { if (p.gone) continue; const d = Math.max(0, lp.distanceTo(_ax.set(...p.p)) - p.r); if (d > A.splash) continue; const f = 1 - d / A.splash; partDamage(e, p, A.splashDmg * f * f * .9, owner, A); }
}
function partDamage(a, p, dmg, owner, A) {
  if (!a.alive || p.hp <= 0 || dmg <= 0) return;
  p.hp -= dmg; a.lastAttacker = owner; a.lastHitT = GAME.time;
  if (a.driver && a.driver.bot) { a.driver.bot.ai.threat = creditOf(owner) ? (creditOf(owner).veh || creditOf(owner)) : owner; a.driver.bot.ai.threatT = GAME.time; }
  if ((p.kind === 'engine' || p.kind === 'fuel') && A && A.kind !== 'bullet' && Math.random() < .3) a.fire = Math.max(a.fire, 18);
  if (p.hp > 0) return;
  const me = a.driver && a.driver.isPlayer, say = t => { if (me) playerVehMsg(t); };
  const hide = id => { const g = a.model.parts[id]; if (g) g.visible = false; };
  switch (p.kind) {
    case 'cockpit': if (a.driver) { const d = a.driver; kill(d, owner, 'cockpit'); } a.pilotDead = true; break;
    case 'fuse': breakUp(a, owner); break;
    case 'fuel': a.fire = Math.max(a.fire, 30); a.leak = true; say('Fuel tank hit: on fire'); break;
    case 'engine': say(`${p.id.endsWith('L') ? 'Left' : p.id.endsWith('R') ? 'Right' : ''} engine destroyed`.trim()); if (Math.random() < .5) a.fire = Math.max(a.fire, 15); break;
    case 'wing': { hide(p.id); p.gone = true; if (p.seg === 'in') { const o = a.parts.find(q => q.kind === 'wing' && q.side === p.side && q.seg === 'out'); o.hp = 0; o.gone = true; hide(o.id); say(`${p.side < 0 ? 'Left' : 'Right'} wing torn off`); } else say(`${p.side < 0 ? 'Left' : 'Right'} wingtip shot off`); for (const s of a.model.stores) if (s) for (const g of s) { const z = g.position.z; if (Math.sign(z) === p.side && Math.abs(z) > (p.seg === 'in' ? 1 : 3)) g.visible = false; } break; }
    case 'stab': hide(p.id); p.gone = true; say('Tailplane shot off'); break;
    case 'fin': hide(p.id); p.gone = true; say('Fin shot off'); break;
    case 'rotor': hide('rotor'); p.gone = true; say('Main rotor destroyed'); break;
    case 'trans': say('Transmission hit: the rotor is winding down'); break;
    case 'boom': { hide('boom'); hide('trot'); hide('fin'); p.gone = true; const t = a.part('trot') || a.part('fin'); if (t) { t.hp = 0; t.gone = true; } say('Tail boom shot off'); break; }
    case 'trot': hide('trot'); p.gone = true; say('Tail rotor destroyed: spinning'); break;
    case 'stub': hide(p.id); p.gone = true; for (const s of a.model.stores) if (s) for (const g of s) if (Math.sign(g.position.z) === (p.id.endsWith('L') ? -1 : 1)) g.visible = false; break;
    case 'nose': say('Sensors destroyed: no missile lock'); break;
  }
  explosion(a.model.root.localToWorld(new V3(...p.p)), 1.5);
}
function breakUp(a, src) { if (!a.alive) return; explosion(a.pos.clone(), 9); Sound.at('boom', a.pos); destroyAir(a, src, 'broke up in the air'); }
function crashAir(a, how) { const src = a.lastAttacker && GAME.time - (a.lastHitT || -99) < 40 ? a.lastAttacker : null; explosion(a.pos.clone(), 10); Sound.at('bigboom', a.pos, .8); destroyAir(a, src, how); a.wreck = { landed: true }; a.vel.set(0, 0, 0); }
function destroyAir(a, src, how) {
  if (!a.alive) return;
  a.alive = false; a.how = how; a.burnT = 40;
  const by = creditOf(src);
  if (by && by.isPlayer && a.team !== GAME.team) { PLAYER.kills++; hitInfo('AIRCRAFT DESTROYED', '#ff8a6a'); }
  if (by && a.team !== by.team && typeof awardSP === 'function') awardSP(by, 250, 'aircraft');
  logDeath(a, by, how);
  a.model.root.traverse(o => { if (o.isMesh && (o.material === AIR_MAT || (o.material.map && o.material !== AIR_GLASS))) o.material = CHAR; });
  if (a.driver) { const d = a.driver; if (d.alive) { d.alive = false; d.hp = 0; addFeed(by, d, how === 'crashed' && !by ? 'crash' : 'aircraft'); onSoldierDead(d); } if (d.isPlayer) showMsg('Your aircraft was destroyed', how); }
  if (!a.wreck) a.wreck = { landed: false, spin: new V3(rand(-1, 1), rand(-2, 2), rand(-1.5, 1.5)) };
}

/* ---------------- each frame ---------------- */
function airsStep(dt) {
  for (const a of ENTS) {
    if (a.kind !== 'air') continue;
    if (!a.alive) { // a wreck: falls, hits the ground, burns
      if (a.wreck && !a.wreck.landed) { a.vel.y -= 9.8 * dt; a.vel.multiplyScalar(Math.pow(.92, dt)); a.pos.addScaledVector(a.vel, dt); const w = a.wreck.spin; _aq2.setFromEuler(_ae.set(w.x * dt, w.y * dt, w.z * dt)); a.quat.multiply(_aq2); if (a.pos.y < groundY(a.pos.x, a.pos.z) + 1) { a.pos.y = groundY(a.pos.x, a.pos.z) + .8; a.wreck.landed = true; explosion(a.pos.clone(), 10); Sound.at('bigboom', a.pos, .8); } if (Math.random() < dt * 25) sprite(a.pos.clone(), 3, 6, 3, 0x2a2826, false, 2, .8); placeAir(a); }
      else if ((a.burnT -= dt) > 0) { if (Math.random() < dt * 8) sprite(_av.copy(a.pos).setY(a.pos.y + 2), 2.5, 9, 3.5, 0x2a2826, false, 4, .7); } else removeEnt(a);
      continue;
    }
    for (let k = 0; k < a.cool.length; k++) a.cool[k] -= dt; a.flareT -= dt; a.extT -= dt;
    const inp = a.inp || (a.cls === 'jet' ? { cmd: new V3(), throttle: a.throttle } : { fwd: 0, side: 0, up: a.onGround ? 0 : -.6, hdg: a.hdg });
    if (a.pilotDead || !a.driver) { if (a.cls === 'jet') { inp.cmd = new V3(.15, 0, -.2); } else { inp.fwd = 0; inp.side = .4; inp.up = -1; } } // nobody at the controls
    const n = Math.ceil(dt / (1 / 60)), h = dt / n;
    for (let s = 0; s < n && a.alive; s++) { if (a.cls === 'jet') jetPhysics(a, inp.cmd, h); else heliPhysics(a, inp, h); }
    if (!a.alive) continue;
    // buildings and bridges are solid
    if (!a.onGround && segBoxes(_av.copy(a.pos).addScaledVector(a.vel, -dt), a.pos) !== null) { crashAir(a, 'flew into a building'); continue; }
    // fire spreads through the airframe until it goes out (or the pilot pulls the fire handle: X)
    if (a.fire > 0) { a.fire -= dt; for (const p of a.parts) if ((p.kind === 'engine' || p.kind === 'fuel' || p.kind === 'fuse') && Math.random() < dt * .6) partDamage(a, p, 7 * dt * 2, a.lastAttacker, null); if (Math.random() < dt * 30) { axes(a); sprite(a.pos.clone().addScaledVector(_ax, -a.def.len * .3), 1.5, 4, 1.5, Math.random() < .5 ? 0x2a2826 : 0xff8a30, Math.random() < .3, 0, .8); } }
    const smoking = a.parts.some(p => (p.kind === 'engine' || p.kind === 'fuel') && p.hp < p.max * .5); if (smoking && Math.random() < dt * 14) { axes(a); sprite(a.pos.clone().addScaledVector(_ax, -a.def.len * .35), 1.2, 3, 1.8, 0x5a5650, false, 0, .55); }
    // rotors turn, rearming when parked at home
    if (a.model.rotor) { const sp = a.rpm * (a.onGround && !a.driver ? .3 : 1) * 28; a.model.rotor.blades.rotation.y += sp * dt; a.model.rotor.disc.material.opacity = .12 * a.rpm; if (a.model.rotor2) a.model.rotor2.blades.rotation.y -= sp * dt; if (a.model.trotor) a.model.trotor.blades.rotation.y += sp * 4 * dt; }
    if (a.model.gearDown) { const down = a.onGround || (a.pos.y - groundY(a.pos.x, a.pos.z) < 60 && a.vel.length() < 95); a.model.gearDown.visible = down; a.model.gearUp.visible = !down; }
    if (a.onGround && a.vel.length() < 3) rearmAir(a, dt); else a.rearmT = 0;
    placeAir(a);
  }
}
function rearmAir(a, dt) {
  const M = GAME.M, home = a.cls === 'jet' ? (() => { const af = M.airfields[a.team]; return Math.hypot(a.pos.x - af.x * 1000, a.pos.z - af.y * 1000) < af.len * 600; })() : Math.hypot(a.pos.x - M.bases[a.team].x * 1000, a.pos.z - M.bases[a.team].y * 1000) < 650 || Math.hypot(a.pos.x - M.airfields[a.team].x * 1000, a.pos.z - M.airfields[a.team].y * 1000) < 900;
  if (!home) return;
  const need = a.ammo.some((n, i) => n < a.def.weapons[i].n) || a.parts.some(p => p.hp < p.max) || a.flares < a.def.flares;
  if (!need) return;
  a.rearmT = (a.rearmT || 0) + dt;
  if (a.driver && a.driver.isPlayer && Math.floor(a.rearmT) !== Math.floor(a.rearmT - dt)) playerVehMsg(`Rearming and repairing: ${Math.max(0, Math.ceil(15 - a.rearmT))} s`);
  if (a.rearmT >= 15) {
    a.ammo = a.def.weapons.map(w => w.n); a.flares = a.def.flares; a.fire = 0; a.rpm = 1; a.spin = 0; a.leak = false;
    for (const p of a.parts) { p.hp = p.max; p.gone = false; } for (const g of Object.values(a.model.parts)) g.visible = true; for (const s of a.model.stores) if (s) for (const g of s) g.visible = true;
    a.rearmT = 0; if (a.driver && a.driver.isPlayer) playerVehMsg('Rearmed and repaired');
  }
}

/* ---------------- the player at the controls ---------------- */
function airPlayer(a, dt) {
  const dir = new V3(Math.cos(CAM.yaw) * Math.cos(CAM.pitch), Math.sin(CAM.pitch), Math.sin(CAM.yaw) * Math.cos(CAM.pitch));
  if (a.cls === 'jet') {
    a.throttle = clamp(a.throttle + ((KEYS.KeyW ? 1 : 0) - (KEYS.KeyS ? 1 : 0)) * dt * .6, 0, 1);
    const cmd = steerToward(a, dir, a.inp && a.inp.cmd || new V3()); cmd.x = clamp(cmd.x + ((KEYS.KeyD ? 1 : 0) - (KEYS.KeyA ? 1 : 0)) * 1.2, -1, 1);
    a.inp = { cmd, throttle: a.throttle };
  } else a.inp = { fwd: (KEYS.KeyW ? 1 : 0) - (KEYS.KeyS ? 1 : 0), side: (KEYS.KeyD ? 1 : 0) - (KEYS.KeyA ? 1 : 0), up: (KEYS.Space ? 1 : 0) - (KEYS.KeyC || KEYS.ControlLeft ? 1 : 0), hdg: CAM.yaw };
  const o = { dir: CAM.aim.clone().sub(airGunWorld(a, new V3())).normalize(), aimPt: CAM.aim.clone(), aimEnt: CAM.aimEnt };
  if (MOUSE.l && locked) { const r = fireAir(a, a.sel, o); if (r === 'nolock' && (a._nl = (a._nl || 0) - dt) <= 0) { a._nl = 1; playerVehMsg(AMMO[a.def.weapons[a.sel].k].aa ? 'No lock: put an enemy aircraft in front of you' : 'No target: aim at a vehicle'); } }
  if (KEYS.KeyF && locked && a.sel !== 0) fireAir(a, 0, o);
  if (KEYS.KeyG) popFlares(a);
  Sound.engine(true, a.cls === 'jet' ? a.throttle : .55 + Math.abs(a.inp.up) * .25, true, a.cls === 'jet', a.cls === 'heli' ? a.rpm : -1); // (-1: an aircraft, no track clatter)
}
function airCamera(a, dt) {
  const dir = _av.set(Math.cos(CAM.yaw) * Math.cos(CAM.pitch), Math.sin(CAM.pitch), Math.sin(CAM.yaw) * Math.cos(CAM.pitch));
  let fov = 65;
  if (CAM.zoom) { a.model.root.updateMatrixWorld(true); camera.position.set(...a.model.cockpit).applyMatrix4(a.model.root.matrixWorld); fov = 34; }
  else { camera.position.copy(a.pos).addScaledVector(dir, -a.def.cam); camera.position.y += a.def.cam * .2; }
  camera.lookAt(_aw.copy(camera.position).addScaledVector(dir, 100));
  return fov;
}
function airStatusHTML(a) {
  const D = a.def, V = a.vel.length(), alt = a.pos.y - Math.max(0, groundY(a.pos.x, a.pos.z));
  const groups = D.cls === 'jet' ? [['CKPT', 'cockpit'], ['FUS', 'fuseF', 'fuseR'], ['FUEL', 'fuel'], ...a.parts.filter(p => p.kind === 'engine').map(p => [p.id === 'eng1' ? 'ENG' : p.id === 'engL' ? 'ENG L' : 'ENG R', p.id]), ['WING L', 'wingLi', 'wingLo'], ['WING R', 'wingRi', 'wingRo'], ['TAIL', ...a.parts.filter(p => p.kind === 'stab' || p.kind === 'fin').map(p => p.id)]]
    : [['CKPT', 'cockpit'], ['FUS', 'fuse'], ['FUEL', 'fuel'], ['ENG L', 'engL'], ['ENG R', 'engR'], ['XMSN', 'trans'], ['ROTOR', 'rotor'], ['TAIL', 'boom', ...(D.tailRotor ? ['trot'] : ['fin'])]];
  const chips = groups.map(([l, ...ids]) => { const ps = ids.map(i => a.part(i)).filter(Boolean), worst = Math.min(...ps.map(p => p.hp / p.max)); return `<span class="chip ${worst <= 0 ? 'dead' : worst < .6 ? 'dmg' : 'ok'}">${l}</span>`; }).join('');
  const notes = []; if (a.fire > 0) notes.push(`<span class="warn">FIRE${a.extT > 0 ? '' : ' · X: fire handle'}</span>`); if (incoming(a)) notes.push('<span class="warn">MISSILE · G: flares</span>');
  if (a.cls === 'heli' && a.spin > .5) notes.push('<span class="warn">SPINNING</span>'); if (a.onGround && a.rearmT > 0) notes.push('rearming');
  const thr = D.cls === 'jet' ? ` · THR ${Math.round(a.throttle * 100)}%${a.throttle > .85 ? ' AB' : ''}` : '';
  return `<div class="who">${D.name} <small>${Math.round(V * 3.6)} km/h · ${Math.round(alt)} m${thr}${D.cls === 'jet' && !a.onGround ? ` · ${(a.gload || 1).toFixed(1)} g` : ''}</small></div><div class="chips">${chips}</div>${notes.length ? `<div class="vnote">${notes.join(' · ')}</div>` : ''}`;
}
function airAmmoHTML(a) {
  const list = a.def.weapons.map((w, i) => `<div class="am${a.sel === i ? ' sel' : ''}">${i + 1} · ${AMMO[w.k].type} <small>${AMMO[w.k].name} ×${a.ammo[i]}</small></div>`).join('');
  return `${list}<small>F: gun · G: flares ×${a.flares}</small>`;
}
function ccipPoint(a, out) { // where a bomb released now would land
  const p = a.pos.clone(), v = a.vel.clone(), dt = .1;
  for (let k = 0; k < 400; k++) { v.y -= 9.8 * dt; p.addScaledVector(v, dt); if (p.y < groundY(p.x, p.z)) return out.copy(p); }
  return null;
}

/* ---------------- bot pilots (they make mistakes like people do) ---------------- */
function airBotThink(b, a, dt) {
  const ai = b.ai, sk = b.skill, D = a.def, M = GAME.M, team = b.team;
  ai.t = (ai.t ?? 0) - dt;
  const alt = a.pos.y - Math.max(0, groundY(a.pos.x, a.pos.z)), empty = a.ammo.every((n, i) => i === 0 ? n < a.def.weapons[0].n * .1 : n <= 0);
  if (ai.t <= 0) {
    ai.t = .5 + Math.random() * .4;
    // enemy aircraft close by come first; then ground targets near the fight
    if (ai.target && (!ai.target.alive || ai.target.pos.distanceTo(a.pos) > 6500)) ai.target = null;
    const air = lockAir(a, a.vel.clone().normalize(), Math.PI, 3500);
    if (air && Math.random() < sk.aware) ai.target = air;
    else if (!ai.target || ai.target.kind === 'air' || Math.random() < .05) {
      const c = GAME.cps[targetCpFor(team)], cx = c.p.x * 1000, cz = c.p.y * 1000; let best = null, bs = 1e9;
      for (const e of ENTS) { if (!e.alive || !hostile(team, e.team) || e.team === team || e.kind === 'air' || e.kind === 'gun' || (e.kind === 'soldier' && e.veh) || (e.kind === 'vehicle' && !e.driver && e.team !== 2)) continue; const d = Math.hypot(e.pos.x - cx, e.pos.z - cz); if (d > 1800) continue; const sc = d * (e.kind === 'vehicle' ? .5 : 1) * (e.team === 2 ? 1.6 : 1) + Math.random() * 300; if (sc < bs) { bs = sc; best = e; } }
      if (best && Math.random() < sk.aware) { ai.target = best; ai.settle = 2.5; }
    }
    ai.goHome = empty || a.parts.some(p => p.kind === 'fuse' && p.hp < p.max * .3);
    // incoming missile: a good pilot flares at once, a nervous one late or not at all
    if (incoming(a) && Math.random() < sk.nerve * .9) { ai.flareDelay = (1 - sk.nerve) * 1.5 + Math.random() * .4; }
    ai.aimErr = new V3(Math.random() - .5, (Math.random() - .5) * .6, Math.random() - .5).multiplyScalar(.02 * sk.aim * (ai.settle || 1) * (1 + (GAME.time - (a.lastHitT || -99) < 2 ? 2 * (1 - sk.nerve) : 0)));
  }
  if (ai.flareDelay !== undefined && (ai.flareDelay -= dt) <= 0) { popFlares(a); ai.flareDelay = undefined; }
  ai.settle = Math.max(1, (ai.settle || 1) - dt * .8);
  const home = a.cls === 'jet' ? M.airfields[team] : M.bases[team], hx = home.x * 1000, hz = home.y * 1000;
  let want = null, fire = -1, fo = {};
  const tg = ai.target;
  if (a.cls === 'jet') {
    if (a.onGround) { a.inp = { cmd: new V3(0, 0, a.vel.length() > 70 ? .6 : 0), throttle: 1 }; a.throttle = 1; return; }
    const cruise = 700 + sk.aim * 100;
    if (ai.goHome) { want = new V3(hx - a.pos.x, 0, hz - a.pos.z); const d = want.length(); want.normalize(); want.y = clamp((cruise - alt) / 800, -.3, .4); if (d < 1500) { despawnAirBot(b, a); return; } }
    else if (tg && tg.kind === 'air') { // dogfight: lead the target, missile when it's in the seeker, guns up close
      const d = tg.pos.distanceTo(a.pos), lead = tg.pos.clone().addScaledVector(tg.vel, d / 900).add(ai.aimErr.clone().multiplyScalar(d));
      want = lead.sub(a.pos).normalize(); const an = want.angleTo(_ax.set(1, 0, 0).applyQuaternion(a.quat));
      if (d < 3200 && an < .35 && a.ammo[1] > 0 && Math.random() < dt * (1.2 + sk.aware)) { fire = 1; fo.target = tg; }
      else if (d < 900 && an < .07) fire = 0;
    } else if (tg) { // a ground attack run: line up from a few km, dive, release, pull out
      const tp = aimCenter(tg, new V3()), d = tp.distanceTo(a.pos), hd = Math.hypot(tp.x - a.pos.x, tp.z - a.pos.z);
      if (!ai.run) ai.run = { phase: 'in' };
      const R = ai.run;
      if (R.phase === 'in') { want = tp.clone().add(ai.aimErr.clone().multiplyScalar(d)).sub(a.pos).normalize(); if (hd > 2500) want.y = clamp((cruise - alt) / 600, -.2, .3); const an = want.angleTo(_ax.set(1, 0, 0).applyQuaternion(a.quat));
        if (an < .08 && d < 4200 + sk.aim * 600 && a.ammo[2] > 0 && Math.random() < dt * 2) { fire = 2; fo.target = tg; } // (some fire from too far out)
        else if (an < .05 && d < 1100 && a.ammo[0] > 0) fire = 0;
        if (a.ammo[3] > 0 && tg.kind === 'vehicle') { const cp = ccipPoint(a, new V3()); if (cp && cp.distanceTo(tp) < 20 + sk.aim * 25) fire = 3; }
        const pull = 260 + 120 * (1 - sk.nerve) * (Math.random() < .03 ? -2 : 1); // now and then one fixates and pulls out too late
        if (alt < pull || d < 450) { R.phase = 'out'; R.t = 7 + Math.random() * 4; }
      } else { want = a.vel.clone().normalize(); want.y = .35; if ((R.t -= dt) <= 0) { R.phase = 'in'; ai.target = null; } }
    } else { const c = GAME.cps[targetCpFor(team)]; want = new V3(c.p.x * 1000 - a.pos.x + Math.sin(GAME.time * .1 + b.lane) * 1500, 0, c.p.y * 1000 - a.pos.z + Math.cos(GAME.time * .1 + b.lane) * 1500).normalize(); want.y = clamp((cruise - alt) / 600, -.25, .3); }
    // don't fly into hills: look ahead along the velocity
    const ahead = a.pos.clone().addScaledVector(a.vel, 3.5), clear = ahead.y - Math.max(0, groundY(ahead.x, ahead.z));
    if (clear < 120 && !(ai.run && ai.run.phase === 'in' && clear > 60)) { want = want ? want.clone() : new V3(1, 0, 0); want.y = Math.max(want.y, .5 + (120 - clear) / 100); }
    const cmd = steerToward(a, want.normalize(), new V3());
    a.throttle = tg && tg.kind === 'air' ? 1 : ai.run && ai.run.phase === 'in' ? .75 : .85; a.inp = { cmd, throttle: a.throttle };
  } else {
    // helicopter: hang back 1.5-2.5 km from the fight, low; missiles at vehicles, rockets and gun at the rest; rearm when empty
    if (ai.goHome) { const d = Math.hypot(hx - a.pos.x, hz - a.pos.z); if (d < 400) { despawnAirBot(b, a); return; } want = new V3(hx - a.pos.x, 0, hz - a.pos.z); }
    const c = GAME.cps[targetCpFor(team)], cx = c.p.x * 1000, cz = c.p.y * 1000, bx = M.bases[team].x * 1000, bz = M.bases[team].y * 1000, bd = Math.hypot(bx - cx, bz - cz) || 1;
    if (!ai.goHome) { if (!ai.post || (ai.postT -= dt) <= 0) { const r = 1500 + Math.random() * 900, a0 = Math.atan2(bz - cz, bx - cx) + (Math.random() - .5) * 1.2; ai.post = new V3(cx + Math.cos(a0) * r, 0, cz + Math.sin(a0) * r); ai.postT = 18 + Math.random() * 14; } want = ai.post.clone().sub(a.pos); }
    const hd = Math.hypot(want.x, want.z), wantAlt = 45 + sk.aim * 15, hdgWant = tg && hd < 400 ? Math.atan2(tg.pos.z - a.pos.z, tg.pos.x - a.pos.x) : Math.atan2(want.z, want.x);
    const fwdC = hd > 60 ? clamp(hd / 300, .2, 1) * Math.cos(angDiffA(a.hdg, Math.atan2(want.z, want.x))) : 0;
    a.inp = { fwd: clamp(fwdC, -.4, 1), side: clamp(Math.sin(angDiffA(a.hdg, Math.atan2(want.z, want.x))) * (hd > 60 ? .6 : 0), -.5, .5), up: clamp((wantAlt - alt) / 15, -1, 1), hdg: hdgWant + (Math.sin(GAME.time * .6 + b.lane) * .05) };
    if (tg && tg.kind !== 'air' && hd < 400) {
      const tp = aimCenter(tg, new V3()), d = tp.distanceTo(a.pos);
      if (d < 4500 && lineOfSight(a.pos, tp)) {
        const aim = tp.clone().add(ai.aimErr.clone().multiplyScalar(d)), dir = aim.clone().sub(airGunWorld(a, new V3())).normalize(), an = dir.angleTo(_ax.set(1, 0, 0).applyQuaternion(a.quat));
        fo.dir = dir; fo.aimPt = aim; fo.target = tg;
        if (tg.kind === 'vehicle' && a.ammo[2] > 0 && an < .4 && Math.random() < dt * .6) fire = 2;
        else if (d < 1700 && a.ammo[1] > 0 && an < .05 && Math.random() < dt * 3) fire = 1;
        else if (d < 1500 && a.ammo[0] > 0) fire = 0;
      }
    }
  }
  if (fire >= 0) { if (!fo.dir) fo.dir = _ax.set(1, 0, 0).applyQuaternion(a.quat).clone(); fireAir(a, fire, fo); }
}
function despawnAirBot(b, a) { // a bot that's out of weapons flies home and lands off-screen; it comes back after a short wait
  const s = a.driver; a.driver = null; if (s) { s.veh = null; removeEnt(s); } removeEnt(a); b.soldier = null; b.unit = null; b.respawn = 4 + Math.random() * 4;
}
