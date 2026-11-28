/* Island Front: modern aircraft.
   Both sides fly the Mitsubishi F-2A (model in gltf-models.js); Blue has the AH-64D Apache and Red the Ka-52 Alligator.
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
  stinger: { name: 'FIM-92 Stinger (ATAS)', type: 'IR missile', kind: 'he', v: 750, pen: [8, 8], main: 0, splash: 6, splashDmg: 150, fragPen: 8, guided: true, turn: 4, prox: 6, life: 8, look: 'missile', cal: 70, aa: true },
  igla: { name: '9M39 Igla-V', type: 'IR missile', kind: 'he', v: 600, pen: [8, 8], main: 0, splash: 6, splashDmg: 140, fragPen: 8, guided: true, turn: 4, prox: 6, life: 9, look: 'missile', cal: 72, aa: true },
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
    for (let k = 0; k < 2; k++) store(M, 3, missileModel(1.5, .035, 0x7a8068, .06), .85, 1.28 - k * .12, sd * 2.62); // air-to-air Stingers on the wingtips
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
    for (let k = 0; k < 2; k++) store(M, 3, missileModel(1.6, .036, 0x6a7060, .06), .85, 1.22 - k * .12, sd * 2.95); // Igla air-to-air missiles outboard
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
  // The jet's shape comes from a downloaded model (gltf-models.js); these are the real aircraft's figures.
  f2: { name: 'Mitsubishi F-2A', short: 'F-2A', cls: 'jet', model: team => modelF2(team), mass: 13000, S: 34.8, thrust: [76e3, 129e3], CLa: 4.6, aStall: .55, alphaLim: .44, cd0: .022, kInd: .11, rates: [4.0, .62, .3], gmax: 9, mDry: 10200, fuelMax: 3600, fuel0: 2500, gRip: 12.5, mRef: 13000, vne: 417, machMax: 2.05, gear: 2.0, len: 15.5, wid: 11.1, R: 9.5, cam: 22, flares: 30,
    info: 'F-16-based multirole fighter with a bigger wing: M61 cannon, 2 AIM-9X, 2 Maverick, 2 Mk 82. Takes off from your airfield, lands there to rearm.',
    weapons: [{ k: 'm61', n: 510 }, { k: 'aim9x', n: 2 }, { k: 'agm65', n: 2 }, { k: 'mk82', n: 2 }],
    parts: [P_('cockpit', 'cockpit', [4.3, 1.0, 0], .75, 40), P_('nose', 'nose', [6.4, .35, 0], .6, 45), P_('fuseF', 'fuse', [2.0, .4, 0], 1.1, 150), P_('fuseR', 'fuse', [-2.6, .35, 0], 1.05, 150), P_('fuel', 'fuel', [-.2, .35, 0], .85, 60),
      P_('eng1', 'engine', [-5.4, .35, 0], .8, 75), P_('wingLi', 'wing', [-1.3, .25, -1.9], 1.05, 90, { side: -1, seg: 'in' }), P_('wingLo', 'wing', [-2.8, .25, -3.7], .85, 55, { side: -1, seg: 'out' }), P_('wingRi', 'wing', [-1.3, .25, 1.9], 1.05, 90, { side: 1, seg: 'in' }), P_('wingRo', 'wing', [-2.8, .25, 3.7], .85, 55, { side: 1, seg: 'out' }),
      P_('stabL', 'stab', [-6.4, .3, -1.8], .75, 40, { side: -1 }), P_('stabR', 'stab', [-6.4, .3, 1.8], .75, 40, { side: 1 }), P_('fin', 'fin', [-6.0, 2.3, 0], .9, 45)] },
  ah64: { name: 'AH-64D Apache Longbow', short: 'Apache', cls: 'heli', model: modelAH64, mass: 8000, power: 2.1e6, rotorR: 7.3, f: 3.6, tmax: 1.6, pprof: 3.0e5, rotE: 2.3e6, vne: 95, len: 17.7, wid: 5, R: 8.5, cam: 17, flares: 30, tailRotor: true, skid: 0,
    info: 'Armoured attack helicopter: M230 chain gun (follows your aim), 38 Hydra rockets, 8 Hellfire (laser: keep the crosshair on the target), 4 Stinger air-to-air missiles. Two crew: it flies on with one. Rearms at your base.',
    weapons: [{ k: 'm230', n: 1200, turret: [-1.75, 1.75, -1.05, .19] }, { k: 'hydra', n: 38 }, { k: 'hellfire', n: 8 }, { k: 'stinger', n: 4 }], thermal: 2,
    parts: [P_('cockpit', 'cockpit', [2.3, 2.0, 0], .62, 60), P_('gunner', 'cockpit', [3.5, 1.6, 0], .62, 60), P_('nose', 'nose', [4.8, .95, 0], .45, 40), P_('fuse', 'fuse', [.8, 1.45, 0], 1.15, 170), P_('fuel', 'fuel', [.2, 1.1, 0], .75, 70),
      P_('engL', 'engine', [-.3, 2.05, -.95], .55, 60), P_('engR', 'engine', [-.3, 2.05, .95], .55, 60), P_('trans', 'trans', [.6, 2.5, 0], .55, 70), P_('rotor', 'rotor', [.6, 3.95, 0], 1.4, 80),
      P_('boom', 'boom', [-4.6, 1.75, 0], .7, 70), P_('trot', 'trot', [-8.2, 2.9, .35], .8, 35), P_('stubL', 'stub', [.8, 1.35, -1.6], .7, 50), P_('stubR', 'stub', [.8, 1.35, 1.6], .7, 50)] },
  ka52: { name: 'Ka-52 Alligator', short: 'Ka-52', cls: 'heli', model: modelKa52, mass: 10400, power: 2.65e6, rotorR: 7.25, coax: true, f: 4.3, tmax: 1.55, pprof: 3.8e5, rotE: 2.9e6, vne: 92, len: 16, wid: 6, R: 8.5, cam: 17, flares: 30, tailRotor: false, skid: 0,
    info: 'Coaxial-rotor attack helicopter: 2A42 30 mm cannon (narrow arc), 40 S-8 rockets, 12 Vikhr (beam-riding: keep the crosshair on the target), 4 Igla air-to-air missiles. Two crew, no tail rotor to lose. Rearms at your base.',
    weapons: [{ k: 'a42', n: 460, turret: [-.06, .17, -.6, .05] }, { k: 's8', n: 40 }, { k: 'vikhr', n: 12 }, { k: 'igla', n: 4 }], thermal: 2,
    parts: [P_('cockpit', 'cockpit', [3.2, 1.6, -.42], .62, 60), P_('gunner', 'cockpit', [3.2, 1.6, .42], .62, 60), P_('nose', 'nose', [4.4, 2.2, 0], .4, 40), P_('fuse', 'fuse', [.6, 1.45, 0], 1.3, 180), P_('fuel', 'fuel', [.0, 1.1, 0], .8, 70),
      P_('engL', 'engine', [-.2, 2.35, -1.0], .55, 60), P_('engR', 'engine', [-.2, 2.35, 1.0], .55, 60), P_('trans', 'trans', [.6, 2.8, 0], .55, 70), P_('rotor', 'rotor', [.6, 4.7, 0], 1.6, 90),
      P_('boom', 'boom', [-4.4, 1.8, 0], .7, 70), P_('fin', 'fin', [-6.8, 2.2, 0], 1.0, 40), P_('stubL', 'stub', [.8, 1.3, -1.9], .7, 50), P_('stubR', 'stub', [.8, 1.3, 1.9], .7, 50)] },
};
const TEAM_AIR = [{ jet: 'f2', heli: 'ah64' }, { jet: 'f2', heli: 'ka52' }]; // both sides fly the F-2A (Red's in a darker paint) until Red has a model of its own
const AIR_PART_NAME = { cockpit: 'cockpit', nose: 'sensors', fuse: 'fuselage', fuel: 'fuel tank', engine: 'engine', wing: 'wing', stab: 'tailplane', fin: 'fin', rotor: 'main rotor', trans: 'transmission', boom: 'tail boom', trot: 'tail rotor', stub: 'stub wing' };

/* The afterburner: a cone of flame behind each nozzle. Pale blue-white where it leaves the nozzle, orange further back, with the bright
   shock diamonds a supersonic exhaust shows. It grows as the afterburner comes in, flickers, and is see-through at its edges. */
const FLAME_VS = `varying float vU; varying vec3 vN; varying vec3 vV;
  void main() { vU = uv.y; vN = normalize(normalMatrix * normal); vec4 mv = modelViewMatrix * vec4(position, 1.0); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`;
const FLAME_FS = `uniform float uT; uniform float uP; uniform float uCore; varying float vU; varying vec3 vN; varying vec3 vV;
  float hash(float n) { return fract(sin(n) * 43758.5453); }
  void main() {
    float u = 1.0 - vU; // 0 at the nozzle, 1 at the tip
    float edge = pow(abs(dot(normalize(vN), normalize(vV))), mix(1.1, .6, uCore)); // looking through the middle of the cone it is bright, at its rim thin
    float dia = .5 + .5 * pow(abs(sin(u * 5.2 * 3.14159 + .6)), 3.0) * (1.0 - u); // shock diamonds, fading down the plume
    float fl = .82 + .18 * sin(uT * 61.0 + u * 9.0) * sin(uT * 37.0 + 1.3) + .06 * hash(floor(uT * 60.0));
    vec3 hot = vec3(.55, .68, 1.0), mid = vec3(1.0, .52, .16), cool = vec3(.85, .22, .05);
    vec3 col = mix(mix(hot, mid, smoothstep(.0, .35, u)), cool, smoothstep(.45, 1.0, u));
    col = mix(col, vec3(1.0, .9, .72), uCore * (1.0 - u) * .6);
    float a = edge * pow(1.0 - u, mix(1.0, .7, uCore)) * smoothstep(0.0, .03, u) * (.7 + .9 * dia) * fl * uP;
    a = min(a, 1.0); gl_FragColor = vec4(col * a * mix(.95, 1.25, uCore), a * .6); // adds its light and veils what is behind it a little, so it shows against a bright sky too
  }`;
let GLOW_TEX = null;
function buildFlames(M) {
  if (!GLOW_TEX) { const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,240,215,1)'); gr.addColorStop(.25, 'rgba(255,170,80,.7)'); gr.addColorStop(1, 'rgba(255,90,20,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); GLOW_TEX = new THREE.CanvasTexture(c); }
  return M.nozzles.map(([x, y, z, r, eng]) => {
    const grp = new THREE.Group(); grp.position.set(x, y, z); M.root.add(grp);
    const mk = (len, r0, r1, core) => { const geo = new THREE.CylinderGeometry(r0, r1, len, 20, 10, true); geo.rotateZ(-Math.PI / 2); geo.translate(-len / 2, 0, 0); // base at the nozzle (uv.y = 1), tip behind it
      const mat = new THREE.ShaderMaterial({ vertexShader: FLAME_VS, fragmentShader: FLAME_FS, uniforms: { uT: { value: 0 }, uP: { value: 0 }, uCore: { value: core } }, transparent: true, depthWrite: false, blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor, side: THREE.DoubleSide, toneMapped: false });
      const m = new THREE.Mesh(geo, mat); m.frustumCulled = false; grp.add(m); return m; };
    const outer = mk(r * 15, r * .95, r * .18, 0), inner = mk(r * 8, r * .6, r * .06, 1);
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: GLOW_TEX, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, toneMapped: false })); glow.position.set(-r * .4, 0, 0); grp.add(glow);
    // the nozzle itself glows dull orange whenever the engine is running hard
    const ring = new THREE.Mesh(new THREE.CircleGeometry(r * .9, 20), new THREE.MeshBasicMaterial({ color: 0xff7a28, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false })); ring.rotation.y = -Math.PI / 2; ring.position.x = .06; grp.add(ring);
    grp.visible = false; return { grp, outer, inner, glow, ring, r, eng };
  });
}
function updateFlames(a, dt) {
  if (!a.flames) return;
  const s = a.spool ?? a.throttle, ab = clamp((s - .85) / .15, 0, 1), dry = clamp((s - .3) / .55, 0, 1);
  for (const f of a.flames) {
    const ok = a.alive && pOK(a.part(f.eng)) && (a.fuel === undefined || a.fuel > 0);
    f.p = (f.p ?? 0) + ((ok ? ab : 0) - (f.p ?? 0)) * Math.min(1, dt * 5); // lights and dies away over a fraction of a second
    const show = ok && (f.p > .01 || dry > .05); f.grp.visible = show; if (!show) continue;
    const t = GAME.time, len = .45 + .55 * f.p + Math.sin(t * 43) * .03;
    f.outer.scale.set(len, 1, 1); f.inner.scale.set(len, 1, 1);
    f.outer.material.uniforms.uT.value = t; f.inner.material.uniforms.uT.value = t + 3.7; f.outer.material.uniforms.uP.value = f.p; f.inner.material.uniforms.uP.value = f.p;
    f.outer.visible = f.inner.visible = f.p > .01;
    f.glow.material.opacity = f.p * (.42 + Math.sin(t * 50) * .06); f.glow.scale.setScalar(f.r * (2.2 + 1.6 * f.p)); f.glow.visible = f.p > .01;
    f.ring.material.opacity = Math.max(dry * .35, f.p * .9);
  }
}
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
    if (this.model.nozzles) this.flames = buildFlames(this.model);
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
/* The air: density falls with height (so do lift, drag and thrust), and the speed of sound gives the Mach number. */
function airData(h) { h = Math.max(0, h); return { rho: 1.225 * Math.exp(-h / 8500), sos: 340.3 - .0041 * h }; }
/* Lift curve of a slender fighter wing: a straight line at first, rounding off to its peak at the stall angle
   (vortex lift carries it well past where a straight wing would stall), then falling away towards a flat plate. */
const clCurve = (al, as, cm) => { const x = Math.abs(al) / as, s = Math.sign(al); if (x <= 1) return s * cm * (1.5 * x - .5 * x * x * x); const e = Math.exp(-(Math.abs(al) - as) * 3.5); return s * (cm * e + .95 * Math.sin(2 * Math.abs(al)) * (1 - e)); };
const clInv = (cl, as, cm) => 2 * Math.sin(Math.asin(clamp(cl / cm, -1, 1)) / 3) * as; // the angle of attack that gives a lift coefficient (rising part of the curve)
/* Mouse aim: turn a wanted direction into roll, pitch and yaw commands (-1..1), the way a pilot would.
   It works out the push the aircraft needs across its nose: enough to turn towards the target at a rate that grows with the error,
   plus enough to hold the aircraft up against gravity. It rolls until the wing's lift points along that push, and pulls that much g.
   If the wing can't give that much lift at this speed it keeps the part that holds height and turns more gently. */
function steerToward(a, dir, out) {
  _aq.copy(a.quat).invert(); const d = _av.copy(dir).normalize().applyQuaternion(_aq), ang = Math.acos(clamp(d.x, -1, 1));
  let pitchErr = Math.atan2(d.y, Math.max(d.x, .05)), yawErr = Math.atan2(d.z, Math.max(d.x, .05));
  if (a.onGround) { out.x = 0; out.z = clamp(Math.atan2(d.y, d.x) * 4.5, -.45, 1); out.y = clamp(-Math.atan2(d.z, d.x) * 3, -1, 1); return out; }
  const D = a.def, g = 9.81, V = Math.max(50, a.vel.length()), up = _aw.set(0, 1, 0).applyQuaternion(_aq);
  // The cursor leads the nose (where the guns point), as with War Thunder's instructor. Slow, the nose rides well above the flight path,
  // so aim above where you want to go. Side to side it leads the flight path: banking turns the path and the fin lines the nose up behind it.
  const noseYaw = yawErr, beta = Math.asin(clamp(a.vel.dot(_ay.set(0, 0, 1).applyQuaternion(a.quat)) / V, -1, 1)); yawErr -= beta;
  // turn rates wanted about the pitch and yaw axes (a target behind is a full-rate turn towards its side)
  // Side to side the bank grows with the error: a nudge of the cursor is flown mostly with rudder and a few degrees of bank,
  // about 10 degrees off asks for a 55 degree bank, and only a target well off the nose gets a full-rate turn.
  const ye = Math.abs(yawErr), soft = g / V * Math.tan(Math.min(1.4, ye * 5.5)) * Math.sign(yawErr);
  let qw = pitchErr * (1.9 + .7 * sstep(.08, .3, Math.abs(pitchErr))), rw = lerp(soft, yawErr * 2.6, sstep(.2, .45, ye)); // (gentler on the stick for small corrections up and down too)
  if (d.x < .35) { // far off the nose or behind: a level turn towards its side, climbing or descending with the cursor (not a dive across the shortest path)
    const vh = new V3().copy(a.vel).normalize(), side = new V3(-vh.z, 0, vh.x).normalize(), dn = new V3().copy(dir).normalize();
    const sgn = Math.sign(dn.x * side.x + dn.z * side.z) || 1, el = Math.asin(clamp(dn.y, -1, 1)) - Math.asin(clamp(vh.y, -1, 1));
    const tw = side.multiplyScalar(sgn); tw.y = clamp(el * 1.5, -.7, .7); tw.normalize();
    const by = new V3(0, 1, 0).applyQuaternion(a.quat), bz = new V3(0, 0, 1).applyQuaternion(a.quat), k = sstep(0, .35, d.x);
    qw = lerp(3 * tw.dot(by), qw, k); rw = lerp(3 * tw.dot(bz), rw, k);
  }
  const gCap = Math.min(D.gmax, gAllowed(a) * (a.driver && a.driver.isPlayer ? 1.03 : .9)); // the instructor keeps the pull near what the wings will stand (bot pilots leave a margin)
  const rl = Math.hypot(qw, rw), rmax = Math.min(1.6, gCap * g / V); if (rl > rmax) { qw *= rmax / rl; rw *= rmax / rl; }
  let ay = V * qw + g * up.y, az = V * rw + g * up.z;
  // what the wing can give right now
  const rho = airData(a.pos.y).rho, as = D.aStall, nzAvail = Math.min(gCap, .5 * rho * V * V * D.S * clCurve(D.alphaLim + .02, as, D.CLa * as / 1.5) / (airMass(a) * g) * .85);
  const hold = g * Math.hypot(up.y, up.z), tot = Math.hypot(ay, az);
  if (tot > nzAvail * g) { // not enough lift for all of it: keep holding height first, turn with what is left
    const ty = V * qw, tz = V * rw, tl = Math.hypot(ty, tz) || 1, spare = Math.sqrt(Math.max(0, (nzAvail * g) ** 2 - Math.min(hold, nzAvail * g) ** 2)), k = Math.min(1, spare / tl);
    ay = ty * k + g * up.y; az = tz * k + g * up.z;
  }
  // a small push "downwards" is flown by easing the stick forward, not by rolling upside down
  const small = ay < 0 && up.y > 0 && (ang < .3 || Math.hypot(ay, az) < 1.6 * g);
  const bankErr = small ? Math.atan2(az, .6 * g) : Math.atan2(az, ay), mag = Math.hypot(ay, az);
  out.x = clamp(bankErr * 1.7 - a.omega.x * .3, -1, 1); // roll in smoothly; full aileron only for a big change of bank
  let nz = small ? Math.max(-1.5, ay / g) : mag / g * Math.max(0, Math.cos(bankErr)) ** 1.5; // unload while rolling the lift round
  const trim = a.nzTrim ?? 1; nz = Math.min(nz, gCap);
  out.z = nz >= trim ? clamp((nz - trim) / (D.gmax - trim), 0, 1) : clamp((nz - trim) / (trim + 3), -.6, 0);
  // rudder: skid the nose onto the cursor straight away (up to a few degrees of sideslip) while the bank brings the flight path round behind it
  out.y = clamp((beta - noseYaw) / .1, -1, 1) * (1 - .6 * sstep(.3, .6, ang));
  return out;
}
/* Weight changes in flight: fuel burns off and weapons leave the rails. A lighter jet climbs, turns and accelerates better,
   and its wings stand more g (the load on them is weight times g). */
const STORE_MASS = { aim9x: 85, r73: 105, agm65: 300, kh29t: 680, mk82: 240, fab250: 250 };
function airMass(a) { const D = a.def; if (!D.mDry) return D.mass; let m = D.mDry + (a.fuel ?? D.fuel0); D.weapons.forEach((w, i) => { m += (STORE_MASS[w.k] || 0) * a.ammo[i]; }); return m; }
function gAllowed(a) { return a.def.gRip * a.def.mRef / airMass(a); } // the g at which the wings start to fail, at this weight
function wingLift(a, side) { const i = a.parts.find(p => p.kind === 'wing' && p.side === side && p.seg === 'in'), o = a.parts.find(p => p.kind === 'wing' && p.side === side && p.seg === 'out'); if (!pOK(i)) return 0; return (.62 + .38 * pH(i)) * (pOK(o) ? .55 + .45 * pH(o) : .5); }
/* Engines take time to spool up (about 3 s from idle to full dry power; the afterburner lights in stages after that).
   Thrust falls with air density and gains a little from ram air at speed. */
function jetThrust(a, dt, mach, sig) {
  const D = a.def, engs = a.parts.filter(p => p.kind === 'engine'), ef = engs.reduce((s, p) => s + (pOK(p) ? .45 + .55 * pH(p) : 0), 0) / engs.length;
  const want = ef > 0 && (a.fuel === undefined || a.fuel > 0) ? a.throttle : 0; if (a.spool === undefined) a.spool = want; // (no fuel: the engine winds down)
  const rate = want < a.spool ? .5 : a.spool < .85 ? .3 : .45; a.spool += clamp(want - a.spool, -rate * dt, rate * dt);
  const s = a.spool, t0 = s <= .85 ? D.thrust[0] * (.07 + .93 * Math.pow(s / .85, 1.6)) : lerp(D.thrust[0], D.thrust[1], (s - .85) / .15);
  const T = t0 * ef * Math.pow(sig, .75) * (1 + .2 * mach);
  // fuel: dry thrust is cheap, the afterburner drinks about four times as much for its thrust; a holed tank leaks
  if (a.fuel === undefined) a.fuel = D.fuel0;
  const tank = a.part('fuel'), leak = tank && tank.hp < tank.max * .6 ? (1 - pH(tank)) * 4 : 0;
  a.burn = ef > 0 ? Math.max(.1 * engs.length, T / 1000 * (s <= .85 ? .021 : lerp(.021, .055, (s - .85) / .15))) : 0;
  a.fuel = Math.max(0, a.fuel - (a.burn + leak) * dt); a.leaking = leak > 0;
  return T;
}
function jetPhysics(a, cmd, dt) {
  const D = a.def, m = airMass(a), g = 9.81, W = m * g, as = D.aStall, cm = D.CLa * as / 1.5, i0 = .02;
  const { rho, sos } = airData(a.pos.y), sig = rho / 1.225;
  const wl = wingLift(a, -1), wr = wingLift(a, 1), lf = Math.max(.02, (wl + wr) / 2);
  const stabs = a.parts.filter(p => p.kind === 'stab'), fins = a.parts.filter(p => p.kind === 'fin'), engs = a.parts.filter(p => p.kind === 'engine');
  const pitchEff = stabs.reduce((s, p) => s + (pOK(p) ? .5 * (.5 + .5 * pH(p)) : .1), 0), finEff = fins.reduce((s, p) => s + (pOK(p) ? (.5 + .5 * pH(p)) / fins.length : 0), 0);
  const rollEff = (pOK(a.parts.find(p => p.id.endsWith('Lo'))) ? .5 : .2) + (pOK(a.parts.find(p => p.id.endsWith('Ro'))) ? .5 : .2);
  const brake = a.throttle < .05, ab = a.airbrake ? .05 : 0; // throttle right back on the ground: wheel brakes. The airbrake has its own key.
  a.flap = clamp((a.flap ?? 1) + (a.onGround || a.gearDown ? .5 : -.5) * dt, 0, 1); const fl = a.flap * .28 * lf; // flaps come down with the gear: more lift and more drag for take-off and landing
  if (a.onGround) { // the take-off and landing roll: weight on the wheels until the wing carries it
    const V = a.vel.length(), q = .5 * rho * V * V, thr = jetThrust(a, dt, V / sos, sig), gy = groundY(a.pos.x, a.pos.z) + D.gear;
    const cl = (clCurve(a.pit + i0, as, cm) * lf + fl) * 1.12, L = q * D.S * cl, N = Math.max(0, W - L), mu = brake ? .5 : .02;
    const drag = q * D.S * (D.cd0 + .02 + .025 * a.flap + D.kInd * cl * cl * .55 + ab);
    let nv = V + (thr - drag - (V > .15 ? N * mu : 0)) / m * dt; if (V <= .15 && thr < N * mu) nv = 0; nv = Math.max(0, nv);
    // nose-wheel steering when slow, the rudder when fast (never more than about half a g sideways)
    a.hdg += clamp(-cmd.y * .9 + cmd.x * .3, -1, 1) * Math.min(.55, 5 / Math.max(V, 1)) * (V < 1 ? 0 : 1) * dt;
    // the tail can lift the nose once there is enough air over it: rotate, then fly off when lift beats weight
    const vlo = Math.sqrt(W / (.5 * rho * D.S * Math.max(.3, (clCurve(.24 + i0, as, cm) * lf + fl) * 1.12)));
    a.pit = clamp(a.pit + (V > vlo * .78 ? (cmd.z > 0 ? cmd.z * .13 * Math.min(1, pitchEff) : -.09 + cmd.z * .2) : -.3) * dt, 0, .24); a.rol *= .9; a.vlo = vlo; // (hold the nose up after landing and the wing helps slow you; let it down and the brakes bite)
    a.vel.set(Math.cos(a.hdg) * nv, 0, Math.sin(a.hdg) * nv); a.pos.addScaledVector(a.vel, dt); a.pos.y = gy;
    if (gy - D.gear < -.6) { crashAir(a, 'crashed'); return; } // rolled into the water
    airQuatFromEuler(a); a.omega.set(0, 0, 0); a.alpha = a.pit; a.gload = 1; a.mach = nv / sos; a.ias = nv * Math.sqrt(sig); a.stall = 0; a.gearDown = true; a.nzTrim = 1; a.stress = Math.max(0, (a.stress || 0) - .25 * dt);
    if (L > W) { a.onGround = false; a.vel.y = .4; }
    const sl = Math.abs(groundY(a.pos.x + Math.cos(a.hdg) * 10, a.pos.z + Math.sin(a.hdg) * 10) - groundY(a.pos.x, a.pos.z)) / 10;
    if (nv > 30 && (sl > .12 || terrainY(a.pos.x, a.pos.z) < .5)) crashAir(a, 'ran off the runway');
    return;
  }
  axes(a);
  const V = Math.max(1, a.vel.length()), vh = _aw.copy(a.vel).divideScalar(V), vx = a.vel.dot(_ax), vy = a.vel.dot(_ay), vz = a.vel.dot(_az);
  const alpha = Math.atan2(-vy, vx), beta = Math.asin(clamp(vz / V, -1, 1)), q = .5 * rho * V * V, mach = V / sos, thr = jetThrust(a, dt, mach, sig);
  const gy = Math.max(0, groundY(a.pos.x, a.pos.z)), agl = a.pos.y - gy - D.gear; // (the sea is a surface too)
  const ge = 1 + .12 * Math.max(0, 1 - agl / D.wid) ** 2; // ground effect: the runway cushions the wing within a wingspan of it
  a.gearDown = agl < 70 && V < 110;
  // forces: lift (across the airflow, in the aircraft's own up direction), drag, side force, thrust, weight
  const st = sstep(as * .85, as * 1.25, Math.abs(alpha)), CL = (clCurve(alpha + i0, as, cm) * lf + fl * (1 - st)) * ge;
  const wave = .03 * sstep(.86, 1.06, mach) - .008 * sstep(1.1, 1.7, mach); // the drag rise through the speed of sound
  const broken = a.parts.filter(p => !pOK(p)).length * .004 + a.stores();
  const CD = D.cd0 + wave + broken + D.kInd * CL * CL / ge + 1.1 * Math.sin(alpha) ** 2 * st + .7 * Math.sin(beta) ** 2 + (a.gearDown ? .018 : 0) + .03 * a.flap + ab;
  const lift = _av.copy(_ay).addScaledVector(vh, -_ay.dot(vh)); const ll = lift.length(); if (ll > 1e-4) lift.divideScalar(ll);
  const L = q * D.S * CL, F = new V3().addScaledVector(lift, L).addScaledVector(vh, -q * D.S * CD).addScaledVector(_az, -q * D.S * .9 * beta).addScaledVector(_ax, thr);
  F.y -= W;
  // how fast the flight path is turning: the nose follows it (the tail keeps the aircraft pointing into the airflow)
  const v1 = new V3().copy(a.vel).addScaledVector(F, dt / m), V1 = Math.max(1, v1.length()), wv = new V3().crossVectors(a.vel, v1).multiplyScalar(1 / (V * V1 * dt)), fol = sstep(8, 35, V);
  a.vel.copy(v1);
  const qf = clamp(q / 9000, .12, 1); // control power grows with dynamic pressure: mushy when slow
  // pitch: the flight computer turns the stick into a g demand, finds the angle of attack that gives it, and will not go past its limit.
  // With the nose sensors or both tailplanes shot away it falls back to a direct link: the stick sets angle of attack, and you can stall or overstress.
  const cg = Math.hypot(vh.x, vh.z), ly = lift.y, trim = clamp(Math.abs(ly) >= .5 ? cg * cg / ly : cg * cg * ly * 4, -1.5, 2); a.nzTrim = trim;
  const fbw = pOK(a.part('nose')) && stabs.some(pOK), qSl = q * D.S * lf * ge + 1;
  let aCmd;
  if (fbw) { const nz = cmd.z >= 0 ? trim + cmd.z * (D.gmax - trim) : trim + cmd.z * (trim + 3); aCmd = clamp(clInv((nz * W - thr * Math.sin(alpha)) / qSl - fl / lf, as, cm) - i0, -.3, D.alphaLim); }
  else aCmd = clamp(clInv(trim * W / qSl - fl / lf, as, cm) - i0 + cmd.z * as * 1.2 * Math.min(1, pitchEff * 1.2) + (pitchEff < .3 ? Math.sin(GAME.time * 1.3) * .07 + Math.sin(GAME.time * .47 + 1) * .05 : 0), -as, as * 1.45); // (no tailplanes at all: only a little pitch control is left, and the nose hunts)
  const wz = wv.dot(_az) * fol * Math.max(.3, Math.min(1, pitchEff)) + clamp((aCmd - alpha) * 5 * qf * Math.min(1, pitchEff), -1.5, 1.5);
  // yaw: the fin weathercocks the nose into the airflow; rudder asks for a little sideslip. A dead engine on a twin pushes the nose aside.
  let wy = wv.dot(_ay) * fol * Math.max(.35, finEff) + clamp((cmd.y * .1 * finEff - beta) * 4 * qf * Math.max(.22, finEff), -1, 1); // (the fuselage alone still weathercocks a little)
  if (engs.length === 2) wy += (pOK(engs[1]) - pOK(engs[0])) * .07 * a.spool;
  if (finEff < .9) wy += (Math.sin(GAME.time * 2.3) * .14 + Math.sin(GAME.time * .9 + 2) * .06) * (1 - finEff); // without its fin the jet weaves from side to side
  // roll: ailerons give a roll rate that builds in a fraction of a second; less of it when slow, at high angle of attack, or with a wingtip gone
  const hiA = sstep(D.alphaLim * .8, as * 1.1, Math.abs(alpha));
  const pT = cmd.x * D.rates[0] * Math.min(1.1, qf * 1.1) * rollEff * (1 - .6 * hiA);
  // Damage: a wing that lifts less than the other rolls the jet towards it, harder the more g is pulled (so a damaged jet has to be flown gently);
  // a missing tailplane couples pitch into roll; sideslip rolls the jet away from it.
  const nzNow = q * D.S * CL / W, stabAsym = stabs.length === 2 ? (pOK(stabs[1]) ? 1 : 0) - (pOK(stabs[0]) ? 1 : 0) : 0;
  a.omega.x += (pT - a.omega.x) * Math.min(1, dt * 4.5) + (-(wr - wl) / (wl + wr + .01) * (.35 + Math.abs(nzNow)) * 6.5 - stabAsym * (nzNow - 1) * .5 - beta * 2.5 * qf) * dt;
  if (st > 0) { a.omega.x += (Math.sin(GAME.time * 2.7 + a.pos.x) * 2.4 + Math.sign(beta || 1) * -1.2) * st * dt; wy += Math.sin(GAME.time * 1.9 + a.pos.z) * .25 * st; } // stalled: wing rock, the nose slices
  a.omega.z += (wz - a.omega.z) * Math.min(1, dt * 15); a.omega.y += (wy - a.omega.y) * Math.min(1, dt * 15);
  const w = a.omega.length(); if (w > 1e-6) { _aq2.setFromAxisAngle(_av.copy(a.omega).divideScalar(w), w * dt); a.quat.multiply(_aq2).normalize(); }
  a.pos.addScaledVector(a.vel, dt);
  a.alpha = alpha; a.gload = L / W; a.mach = mach; a.stall = st;
  a.ias = V * Math.sqrt(sig);
  /* Overload: the wings stand a certain load, which is weight times g, so the heavier the jet the less g they take. Past that limit
     (or past the airframe's speed limit) stress builds up; ease off and it fades, hold it and a wing comes off. */
  { const over = Math.max(Math.abs(a.gload) / gAllowed(a) * (a.gload < 0 ? 2 : 1) - 1, a.ias / D.vne - 1, mach / D.machMax - 1);
    a.stress = clamp((a.stress || 0) + (over > 0 ? (over * 4 + .05) : -.25) * dt, 0, 1.01); a.over = over;
    if (a.stress >= 1) { const sd = wl < wr ? -1 : wr < wl ? 1 : (Math.random() < .5 ? -1 : 1); a.stress = 0; a.ripped = true;
      for (const p of a.parts) if (p.kind === 'wing' && p.side === sd && pOK(p)) partDamage(a, p, 99999, a.lastAttacker, null);
      if (a.driver && a.driver.isPlayer) showMsg('Wing ripped off', over === a.ias / D.vne - 1 || over === mach / D.machMax - 1 ? 'Too fast for the airframe' : 'Too much g for this weight');
      if (!a.alive) return; } }
  // touching down: gentle and level on flat ground is a landing, anything else is a crash
  if (a.pos.y - gy < D.gear) {
    axes(a); const roll = Math.asin(clamp(_az.y, -1, 1)), pitch = Math.asin(clamp(_ax.y, -1, 1)), sink = -a.vel.y;
    const sl = Math.abs(groundY(a.pos.x + 12, a.pos.z) - groundY(a.pos.x - 12, a.pos.z)) / 24 + Math.abs(groundY(a.pos.x, a.pos.z + 12) - groundY(a.pos.x, a.pos.z - 12)) / 24;
    if (sink < 5.5 && Math.abs(roll) < .22 && pitch > -.06 && pitch < .3 && V < 115 && sl < .06 && gy > .5 && _ay.y > .9) {
      a.onGround = true; a.hdg = Math.atan2(_ax.z, _ax.x); a.pit = clamp(pitch, 0, .24); a.rol = 0; a.pos.y = gy + D.gear;
      if (sink > 3.6) { const p = a.part('fuseF'); if (p) partDamage(a, p, (sink - 3.6) * 22, null, null); } // a hard landing strains the airframe
    } else crashAir(a, 'crashed');
  }
}
/* Helicopters: the rotor's thrust comes from collective pitch and rotor speed; the engines have to supply the power that costs.
   - Hovering takes the most power. Moving forward the rotor works in cleaner air (translational lift), so there is power to spare
     for climbing at 100-150 km/h; fast, the fuselage's drag eats it again and sets the top speed.
   - Ask for more than the engines can give and the rotor slows, and thrust goes with the square of its speed.
   - Close to the ground the rotor is more efficient (ground effect).
   - Drop straight down too fast and the rotor sinks into its own downwash (vortex ring): fly forward to get out.
   - With no power the rotor is kept turning by the air coming up through it (autorotation): the stored spin cushions one landing.
   Space and C ask for a climb or descent rate; the collective lever is worked for you. */
function heliPhysics(a, inp, dt) {
  const D = a.def, m = D.mass, g = 9.81, W = m * g, rho = airData(a.pos.y).rho;
  const engs = a.parts.filter(p => p.kind === 'engine'), ef = engs.reduce((s, p) => s + (pOK(p) ? .4 + .6 * pH(p) : 0), 0) / engs.length;
  const rotorOK = pOK(a.part('rotor')), Pav = pOK(a.part('trans')) ? D.power * Math.min(1, ef * 1.15) : 0; // (one engine out: the other is allowed its emergency rating)
  if (a.col === undefined) { a.col = .1; a.colLim = 1; }
  if (!rotorOK) a.rpm = Math.max(0, a.rpm - dt * .5);
  airQuatFromEuler(a); axes(a);
  const V = a.vel.length(), vax = a.vel.dot(_ay), vfw = a.vel.dot(_ax), vsd = a.vel.dot(_az), Vh = Math.hypot(a.vel.x, a.vel.z), inpl = Math.hypot(vfw, vsd);
  const gyT = groundY(a.pos.x, a.pos.z), gy = Math.max(gyT, -.4) + D.skid, agl = a.pos.y - gy, ge = 1 + .16 * Math.max(0, 1 - agl / (D.rotorR * 1.5)) ** 2;
  const A = Math.PI * D.rotorR * D.rotorR * (D.coax ? 1.25 : 1), rh = rotorOK ? .25 + .75 * pH(a.part('rotor')) : 0, vhov = Math.sqrt(W / (2 * rho * A));
  // Thrust depends on the blades' angle to the air they meet: the collective sets their pitch, and air flowing down through the disc
  // (the rotor's own downwash, or a climb) takes some away, while air coming up through it (a descent, a flare) adds to it.
  const lam = (vax + (a.vi ?? vhov)) / (220 * Math.max(.3, a.rpm));
  const tOf = col => clamp(8.4 * (.052 + .257 * col - 1.5 * lam), 0, 1.9) * W * a.rpm * a.rpm * rh;
  // vortex ring: sinking fast into the rotor's own downwash with little forward speed
  const ds = -vax / vhov, vrs = Pav > 0 ? sstep(.3, .65, ds) * (1 - sstep(1.5, 2, ds)) * (1 - sstep(.5, 1, inpl / vhov)) : 0; a.vrs = vrs;
  const eff = ge * (1 - .55 * vrs);
  // the collective: powered, it holds the climb rate asked for; unpowered, it holds rotor speed unless told otherwise
  if (inp.manual) { // the lever stays where it is put (as in War Thunder: the collective is always yours to work)
    a.lever = clamp((a.lever ?? a.col) + inp.col * .6 * dt, 0, 1); let colT = a.lever;
    if (Pav > 0) { a.colLim = clamp(a.colLim + (a.rpm - .94) * 2.5 * dt, .15, 1); colT = Math.min(colT, a.colLim); }
    a.col += clamp(colT - a.col, -1.2 * dt, 1.2 * dt);
  } else if (Pav > 0) {
    let vyWant = a.onGround && inp.up <= 0 ? -3 : inp.up > 0 ? inp.up * 11 : inp.up * lerp(2.6, 12, sstep(16, 32, Vh)); // (slow and sinking fast is how a rotor falls into its own downwash: the instructor holds the descent well short of that)
    if (!a.onGround && agl < 12) vyWant = Math.max(vyWant, -1.2 - agl * .4); // close to the ground the descent is held to a soft landing
    const Tneed = (W + m * (vyWant - a.vel.y) * 1.5) / Math.max(.45, _ay.y);
    let colT = (Tneed / Math.max(1, 8.4 * W * a.rpm * a.rpm * rh * eff) - .052 + 1.5 * lam) / .257;
    a.colLim = clamp(a.colLim + (a.rpm - .94) * 2.5 * dt, .15, 1); colT = Math.min(colT, a.colLim); // a drooping rotor: ease the collective down
    if (a.onGround && inp.up <= 0) colT = 0;
    a.col += clamp(colT - a.col, -1.2 * dt, 1.2 * dt); a.lever = a.col;
  } else a.col += (inp.up > 0 ? 1.6 : inp.up < 0 ? -1 : clamp((a.rpm < 1 ? a.rpm - 1 : a.rpm > 1.08 ? a.rpm - 1.08 : 0) * 3 + (a.rpm < 1 || a.rpm > 1.08 ? (a.rpmRate || 0) * 2.5 : 0), -1, 1)) * dt; // (in a flare the rotor is left to speed up: that spin is what cushions the landing)
  a.col = clamp(a.col, 0, 1);
  const T = tOf(a.col) * eff, vh0 = Math.sqrt(Math.max(1, T) / (2 * rho * A));
  // power: lifting (induced), climbing or pushing the fuselage through the air (thrust times the airflow down through the disc), and turning the blades
  const vi = Math.sqrt(Math.max(0, -V * V / 2 + Math.sqrt(V ** 4 / 4 + vh0 ** 4))), mu = inpl / 220; a.vi = vi;
  const Preq = T * (vax + 1.15 * vi / (ge * ge)) + D.pprof * a.rpm ** 3 * (1 + 4.6 * mu * mu) * (rotorOK ? 1 : 0);
  const Peng = clamp(Preq + (1 - a.rpm) * D.power * 3, 0, Pav); // the governor holds 100 % if it can
  a.rpmRate = (Peng - Preq) / (2 * D.rotE * Math.max(.3, a.rpm)); a.rpm = clamp(a.rpm + a.rpmRate * dt, 0, 1.12); a.tq = Peng / D.power;
  if (rotorOK && Pav <= 0 && agl < .2 && V < 1) a.rpm = Math.max(0, a.rpm - dt * .1);
  // attitude: the stick tilts the disc; at speed the helicopter banks into its turns like an aeroplane
  const ctl = rotorOK ? sstep(.35, .8, a.rpm) : .05, sp = sstep(8, 25, Math.abs(vfw));
  const tr = D.tailRotor ? pOK(a.part('trot')) && pOK(a.part('boom')) : pOK(a.part('boom'));
  const yawMax = lerp(1.2, Math.min(1.2, g * Math.tan(.5) / Math.max(1, Math.abs(vfw))), sstep(10, 30, Math.abs(vfw))); // (at speed a turn is flown at up to about 30 degrees of bank)
  let hr = clamp(angDiffA(a.hdg, inp.hdg) * 2, -yawMax, yawMax) * ctl;
  if (tr) a.spin *= Math.pow(.2, dt);
  else if (D.tailRotor) { // nothing to counter the rotor's torque: it spins, harder the more power is pulled; at speed the fin holds it nearly straight
    const spinT = 3.2 * clamp(a.tq * 1.4, 0, 1) * (1 - .85 * sstep(22, 45, vfw)); a.spin += (spinT - a.spin) * Math.min(1, dt * .7); hr = hr * .25 * sstep(22, 45, vfw) - a.spin;
  } else hr = hr * .5 + Math.sin(GAME.time * 1.7) * .4; // a coaxial with no tail fin wanders but doesn't spin
  const hrC = hr; // the turn asked for (what the bank is set by)
  if (vfw > 15) hr += clamp(angDiffA(a.hdg, Math.atan2(a.vel.z, a.vel.x)) * 1.6, -.7, .7) * sstep(15, 38, vfw) * ctl; // at speed the tail fin weathercocks the nose into the airflow: no flying along half sideways
  a.hdg += hr * dt; a.hdgRate = hr;
  // full forward stick asks for more nose-down than the engines can hold level: ease it off as the torque reaches its limit (unless diving on purpose)
  if (a.tiltLim === undefined) a.tiltLim = .38;
  const pw = Pav > 0 ? Peng / Pav : 0; a.tiltLim = clamp(a.tiltLim + (inp.up < 0 ? .2 : !inp.manual && a.vel.y < -3 && agl < 150 ? -.4 : pw > .97 && vfw > 45 ? -.12 : pw < .9 || vfw < 40 ? .1 : 0) * dt, .06, .38); // (sinking when it should not be: raise the nose and trade speed for lift)
  let pitT = inp.manual ? clamp(inp.pit, -.6, .45) : -clamp(inp.fwd, -1, a.tiltLim / .38) * .38, rolT = inp.side * (inp.manual ? .42 : .32) + clamp(Math.atan(vfw * hrC / g), -.52, .52) * sp * (tr ? 1 : 0) * (inp.manual ? 1 : 1 - .6 * sstep(.92, 1, pw));
  if (!inp.manual && vrs > .15 && agl > 12) pitT = Math.min(pitT, -.24 * Math.min(1, vrs * 2)); // caught in vortex ring: nose down and fly out of it
  if (vfw > D.vne) pitT += (vfw - D.vne) * .03; // past its limit speed the retreating blade stalls and the nose rises
  if (vrs > .2) { pitT += Math.sin(GAME.time * 9) * .04 * vrs; rolT += Math.sin(GAME.time * 7.3) * .05 * vrs; }
  a.pit += clamp((pitT - a.pit) * 3.2, -1, 1) * dt * ctl; a.rol += clamp((rolT - a.rol) * 3.2, -1.3, 1.3) * dt * ctl;
  if (ctl < .5 && !a.onGround) { a.pit += Math.sin(GAME.time * 1.1 + a.pos.x) * .5 * (1 - ctl) * dt; a.rol += Math.cos(GAME.time * .9 + a.pos.z) * .6 * (1 - ctl) * dt; }
  airQuatFromEuler(a); axes(a);
  const F = new V3().addScaledVector(_ay, T); F.y -= W;
  const hq = .5 * rho; F.addScaledVector(_ax, -hq * D.f * Math.abs(vfw) * vfw).addScaledVector(_ay, -hq * 12 * Math.abs(vax) * vax).addScaledVector(_az, -hq * 10 * Math.abs(vsd) * vsd);
  a.vel.addScaledVector(F, dt / m);
  a.pos.addScaledVector(a.vel, dt);
  if (a.pos.y <= gy) {
    const sink = -a.vel.y;
    if (gyT < -.6 || sink > 6.5 || Math.abs(a.rol) > .5 || Math.abs(a.pit) > .5 || Vh > 30 || (Vh > 8 && Math.abs(vsd) > 6)) { crashAir(a, 'crashed'); return; }
    if (sink > 3.5) { const p = a.part('fuse'); if (p) partDamage(a, p, (sink - 3.5) * 28, null, null); if (!a.alive) return; } // a hard landing
    a.pos.y = gy; a.vel.y = Math.max(0, a.vel.y); const hs = Math.hypot(a.vel.x, a.vel.z), ns = Math.max(0, hs - 5 * dt) / (hs || 1); a.vel.x *= ns; a.vel.z *= ns; // rolls out on its wheels
    a.onGround = (inp.manual ? a.lever < .5 : inp.up <= 0) || Pav <= 0; a.pit *= Math.pow(.02, dt); a.rol *= Math.pow(.02, dt);
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
    case 'cockpit': { // a helicopter has two crew and either can fly it (as in War Thunder); both gone and nobody is flying
      const seats = a.parts.filter(q => q.kind === 'cockpit');
      if (seats.some(q => q.hp > 0)) { say(p.id === 'gunner' ? 'Gunner hit: you are on your own' : 'Pilot hit: the gunner has the controls'); break; }
      if (a.driver) { const d = a.driver; kill(d, owner, 'cockpit'); } a.pilotDead = true; break; }
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
  if (a.flames) for (const f of a.flames) f.grp.visible = false;
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
    if (a.parked && a.onGround && !a.driver) { a.throttle = 0; if (a.cls === 'jet') inp.cmd = new V3(); else { inp.manual = false; inp.fwd = 0; inp.side = 0; inp.up = 0; inp.hdg = a.hdg; } } // shut down by its pilot: it sits there
    else if (a.pilotDead || !a.driver) { if (a.cls === 'jet') { inp.cmd = new V3(.15, 0, -.2); } else { inp.fwd = .5; inp.side = .4; inp.up = -1; } } // nobody at the controls
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
    if (a.model.gearDown) { const down = a.onGround || a.gearDown; a.model.gearDown.visible = down; a.model.gearUp.visible = !down; }
    if (a.onGround && a.vel.length() < 3) rearmAir(a, dt); else a.rearmT = 0;
    updateFlames(a, dt);
    placeAir(a);
  }
}
function rearmAir(a, dt) {
  const M = GAME.M, home = a.cls === 'jet' ? (() => { const af = M.airfields[a.team]; return Math.hypot(a.pos.x - af.x * 1000, a.pos.z - af.y * 1000) < af.len * 600; })() : Math.hypot(a.pos.x - M.bases[a.team].x * 1000, a.pos.z - M.bases[a.team].y * 1000) < 650 || Math.hypot(a.pos.x - M.airfields[a.team].x * 1000, a.pos.z - M.airfields[a.team].y * 1000) < 900;
  if (!home) return;
  const need = a.ammo.some((n, i) => n < a.def.weapons[i].n) || a.parts.some(p => p.hp < p.max) || a.flares < a.def.flares || (a.def.fuel0 && a.fuel < a.def.fuel0 * .95);
  if (!need) return;
  a.rearmT = (a.rearmT || 0) + dt;
  if (a.driver && a.driver.isPlayer && Math.floor(a.rearmT) !== Math.floor(a.rearmT - dt)) playerVehMsg(`Rearming, refuelling and repairing: ${Math.max(0, Math.ceil(15 - a.rearmT))} s`);
  if (a.rearmT >= 15) {
    a.ammo = a.def.weapons.map(w => w.n); a.flares = a.def.flares; a.fire = 0; a.rpm = 1; a.spin = 0; a.leak = false; a.stress = 0; if (a.def.fuel0) a.fuel = a.def.fuel0;
    for (const p of a.parts) { p.hp = p.max; p.gone = false; } for (const g of Object.values(a.model.parts)) g.visible = true; for (const s of a.model.stores) if (s) for (const g of s) g.visible = true;
    a.rearmT = 0; if (a.driver && a.driver.isPlayer) playerVehMsg('Rearmed, refuelled and repaired');
  }
}

/* ---------------- the player at the controls ---------------- */
function airPlayer(a, dt) {
  const dir = new V3(Math.cos(CAM.yaw) * Math.cos(CAM.pitch), Math.sin(CAM.pitch), Math.sin(CAM.yaw) * Math.cos(CAM.pitch));
  const out = a.gloc > 0; // blacked out: nobody is flying
  if ((a.pos.x < -2500 || a.pos.x > WORLD_W + 2500 || a.pos.z < -2500 || a.pos.z > WORLD_H + 2500) && GAME.time - (a.edgeT ?? -99) > 6) { a.edgeT = GAME.time; playerVehMsg('You are leaving the battle area: turn back'); }
  if (a.cls === 'jet') {
    a.throttle = clamp(a.throttle + ((KEYS.KeyW ? 1 : 0) - (KEYS.KeyS ? 1 : 0)) * dt * .6, 0, 1);
    const cmd = steerToward(a, dir, a.inp && a.inp.cmd || new V3());
    cmd.x = clamp(cmd.x + ((KEYS.KeyD ? 1 : 0) - (KEYS.KeyA ? 1 : 0)) * 1.2, -1, 1); // A/D add roll on top of the instructor
    cmd.y = clamp(cmd.y + ((KEYS.KeyQ ? 1 : 0) - (KEYS.KeyE ? 1 : 0)) * 1.2, -1, 1); // Q/E: rudder
    if (out) cmd.set(0, 0, 0);
    a.inp = { cmd, throttle: a.throttle };
  } else {
    const kf = (KEYS.KeyW ? 1 : 0) - (KEYS.KeyS ? 1 : 0), ks = (KEYS.KeyD ? 1 : 0) - (KEYS.KeyA ? 1 : 0), ku = (KEYS.Space || KEYS.ShiftLeft ? 1 : 0) - (KEYS.KeyC || KEYS.ControlLeft ? 1 : 0);
    if (a.hover) { // hover mode: it holds its place and height; the keys move it about gently
      const ch = Math.cos(a.hdg), sh = Math.sin(a.hdg), vf = a.vel.x * ch + a.vel.z * sh, vs = -a.vel.x * sh + a.vel.z * ch;
      a.inp = { fwd: clamp((kf * 14 - vf) * .09, -1, 1), side: clamp((ks * 10 - vs) * .09, -1, 1), up: ku, hdg: CAM.yaw };
    } else a.inp = { manual: true, col: ku, pit: clamp(CAM.pitch, -.5, .35) - kf * .28, side: ks, hdg: CAM.yaw }; // the instructor points the nose where you look; W/S push it further, Space/C work the collective
  }
  const o = { dir: CAM.aim.clone().sub(airGunWorld(a, new V3())).normalize(), aimPt: CAM.aim.clone(), aimEnt: CAM.aimEnt };
  if (MOUSE.l && locked && !out) { const r = fireAir(a, a.sel, o); if (r === 'nolock' && (a._nl = (a._nl || 0) - dt) <= 0) { a._nl = 1; playerVehMsg(AMMO[a.def.weapons[a.sel].k].aa ? 'No lock: put an enemy aircraft in front of you' : 'No target: aim at a vehicle'); } }
  if (KEYS.KeyF && locked && a.sel !== 0 && !out) fireAir(a, 0, o);
  if (KEYS.KeyG) popFlares(a);
  Sound.engine(true, a.cls === 'jet' ? (a.spool ?? a.throttle) : .3 + (a.tq ?? .5) * .5, true, a.cls === 'jet', a.cls === 'heli' ? a.rpm : -1); // (-1: an aircraft, no track clatter)
}
/* The pilot: sustained high g drains blood from the head. The view greys in from the edges, and if the g is held the pilot
   blacks out (G-LOC): for a few seconds nobody is flying. A short hard pull is fine. Strong negative g reddens the view. */
function pilotG(a, dt) {
  let el = document.getElementById('gDim'); if (!el) { el = document.createElement('div'); el.id = 'gDim'; el.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:6;opacity:0'; document.body.appendChild(el); }
  const g = a && a.cls === 'jet' && a.alive && !a.onGround ? a.gload || 1 : 1;
  if (a) {
    a.gz = (a.gz ?? 1) + (g - (a.gz ?? 1)) * Math.min(1, dt / (g > (a.gz ?? 1) ? 2.4 : 1.4));
    if (a.gloc > 0) { a.gloc -= dt; if (a.gloc <= 0) { a.gz = Math.min(a.gz, 4.5); playerVehMsg('You come round'); } }
    else if (a.gz > 7.6) { a.gloc = 4.5; showMsg('Blacked out', 'Too much g for too long'); }
  }
  const gz = a ? a.gz : 1, grey = a && a.gloc > 0 ? 1 : clamp((gz - 6) / 2, 0, 1), red = clamp((-gz - 1.2) / 1.5, 0, 1);
  if (grey < .01 && red < .01) { if (el.style.opacity !== '0') el.style.opacity = '0'; return; }
  el.style.opacity = '1';
  el.style.background = a && a.gloc > 0 ? 'rgba(2,2,3,.985)' : red > 0 ? `radial-gradient(ellipse at center, rgba(150,10,10,${(red * .25).toFixed(2)}) 20%, rgba(120,0,0,${(red * .8).toFixed(2)}) 90%)` : `radial-gradient(ellipse at center, rgba(8,8,10,${(grey * grey * .75).toFixed(2)}) ${Math.round(60 - grey * 55)}%, rgba(4,4,6,${Math.min(.97, grey * 1.5).toFixed(2)}) ${Math.round(95 - grey * 45)}%)`;
}
function airCamera(a, dt) {
  const dir = _av.set(Math.cos(CAM.yaw) * Math.cos(CAM.pitch), Math.sin(CAM.pitch), Math.sin(CAM.yaw) * Math.cos(CAM.pitch));
  let fov = 65;
  if (CAM.zoom) { a.model.root.updateMatrixWorld(true); camera.position.set(...a.model.cockpit).applyMatrix4(a.model.root.matrixWorld); fov = 34; }
  else { camera.position.copy(a.pos).addScaledVector(dir, -a.def.cam); camera.position.y += a.def.cam * .2; }
  // buffet: the airframe shakes near the stall and at the edge of the lift it can give
  const buf = a.cls === 'jet' && !a.onGround ? Math.max(a.stall || 0, sstep(.85, 1, (a.alpha || 0) / a.def.alphaLim) * .45) : a.cls === 'heli' ? (a.vrs || 0) * .8 + sstep(a.def.vne * .92, a.def.vne * 1.05, a.vel.length()) * .5 : 0;
  if (buf > .02) { const k = buf * (CAM.zoom ? .03 : .12); camera.position.x += (Math.random() - .5) * k; camera.position.y += (Math.random() - .5) * k; camera.position.z += (Math.random() - .5) * k; }
  camera.lookAt(_aw.copy(camera.position).addScaledVector(dir, 100));
  return fov;
}
function airStatusHTML(a) {
  const D = a.def, V = a.vel.length(), alt = a.pos.y - Math.max(0, groundY(a.pos.x, a.pos.z));
  const groups = D.cls === 'jet' ? [['CKPT', 'cockpit'], ['FUS', 'fuseF', 'fuseR'], ['FUEL', 'fuel'], ...a.parts.filter(p => p.kind === 'engine').map(p => [p.id === 'eng1' ? 'ENG' : p.id === 'engL' ? 'ENG L' : 'ENG R', p.id]), ['WING L', 'wingLi', 'wingLo'], ['WING R', 'wingRi', 'wingRo'], ['TAIL', ...a.parts.filter(p => p.kind === 'stab' || p.kind === 'fin').map(p => p.id)]]
    : [['PILOT', 'cockpit'], ['GUNNER', 'gunner'], ['FUS', 'fuse'], ['FUEL', 'fuel'], ['ENG L', 'engL'], ['ENG R', 'engR'], ['XMSN', 'trans'], ['ROTOR', 'rotor'], ['TAIL', 'boom', ...(D.tailRotor ? ['trot'] : ['fin'])]];
  const S = {}; for (const [l, ...ids] of groups) { const ps = ids.map(i => a.part(i)).filter(Boolean); if (!ps.length) continue; const worst = Math.min(...ps.map(p => p.hp / p.max)); S[l] = worst <= 0 ? 'dead' : worst < .6 ? 'dmg' : 'ok'; }
  const code = A => A.look === 'bomb' ? 'BMB' : A.look === 'rocket' ? 'RKT' : A.look === 'missile' ? (A.aa ? 'AAM' : 'AGM') : 'GUN';
  const wpn = D.weapons.map((w, i) => [code(AMMO[w.k]), a.ammo[i], '', a.ammo[i] <= 0 ? 'red' : '', a.sel === i]);
  const notes = []; if (a.fire > 0) notes.push(`<span class="warn">FIRE${a.extT > 0 ? '' : ' · X: fire handle'}</span>`); if (incoming(a)) notes.push('<span class="warn">MISSILE · G: flares</span>');
  if (a.cls === 'heli' && a.spin > .5) notes.push('<span class="warn">SPINNING</span>'); if (a.onGround && a.rearmT > 0) notes.push('rearming');
  let extra, spd = V;
  if (D.cls === 'jet') {
    spd = a.ias ?? V; // indicated airspeed: what the wings feel
    const thr = a.throttle <= .85 ? Math.round(a.throttle / .85 * 100) + '%' : 'WEP', left = a.burn > 0 ? a.fuel / a.burn : 1e9, ft = left > 5940 ? '99:00' : `${String(Math.floor(left / 60)).padStart(2, '0')}:${String(Math.floor(left % 60)).padStart(2, '0')}`;
    extra = [['THR', thr, '', thr === 'WEP' ? 'red' : ''], ['IAS', Math.round(spd * 3.6), 'km/h'], ['ALT', Math.round(alt), 'm'], 0, ...wpn, ['FLR', a.flares], ['FUEL', ft, '', left < 90 ? 'red' : ''], 0, ['MACH', (a.mach || 0).toFixed(2)], ['G', (a.gload || 1).toFixed(1)], ['AOA', Math.round((a.alpha || 0) * 57.3) + '°'], ['GEAR', a.gearDown || a.onGround ? 'DOWN' : 'UP']]; if (a.onGround && a.throttle < .05) notes.push('Wheel brakes on');
    if (a.fuel <= 0) notes.push('<span class="warn">NO FUEL</span>'); else if (left < 90) notes.push('<span class="warn">FUEL LOW</span>'); if (a.leaking) notes.push('<span class="warn">FUEL LEAK</span>');
    if (!a.onGround) {
      if (a.gloc > 0) notes.push('<span class="warn">BLACKED OUT</span>');
      if (a.over > -.06 || a.stress > .05) notes.push(`<span class="warn">OVERLOAD${a.stress > .05 ? ' ' + Math.round(a.stress * 100) + '%' : ''} · ease off</span>`);
      if (a.stall > .3) notes.push('<span class="warn">STALL · ease off and let the nose drop</span>'); else if (!(pOK(a.part('nose')) && a.parts.some(p => p.kind === 'stab' && pOK(p)))) notes.push('<span class="warn">FLIGHT COMPUTER OUT · pull gently</span>');
      if (a.gearDown) notes.push('gear and flaps down');
    } else if (a.vlo && V > a.vlo * .78 && a.throttle > .5) notes.push('rotate: look up');
    if (a.airbrake) notes.push('airbrake');
  } else {
    extra = [['COLL', Math.round((a.lever ?? a.col ?? 0) * 100) + ' %'], ['SPD', Math.round(spd * 3.6), 'km/h'], ['ALT', Math.round(alt), 'm'], ['V/S', (a.vel.y >= 0 ? '+' : '') + a.vel.y.toFixed(1), 'm/s'], 0, ...wpn, ['FLR', a.flares], 0, ['RPM', Math.round(a.rpm * 100) + ' %', '', a.rpm < .9 ? 'red' : ''], ['TQ', Math.round((a.tq || 0) * 100) + ' %']];
    const dead = a.parts.filter(p => p.kind === 'engine').every(p => !pOK(p)) || !pOK(a.part('trans'));
    for (const pr of PROJS) if (pr.owner === a && pr.A.guided && pr.guide) { const g = pr.guide(); if (g) { notes.push(`missile: ${Math.max(0, g.distanceTo(pr.pos) / Math.max(50, pr.vel.length())).toFixed(0)} s to impact · keep the crosshair on the target`); break; } }
    if (dead && !a.onGround) notes.push('<span class="warn">NO POWER · autorotate: lower the collective (C), keep 120+ km/h, flare, then raise it (Space) at the bottom</span>');
    else if (a.rpm < .9 && !a.onGround) notes.push('<span class="warn">LOW ROTOR RPM · lower the collective</span>');
    if (a.vrs > .3) notes.push('<span class="warn">SINKING IN OWN DOWNWASH · fly forward</span>');
  }
  if (a.hover) extra.push('HOVER MODE');
  return ro(extra) + noteLines(notes) + dmgPanel(D.cls === 'jet' ? 'jet' : 'heli', S, (D.short || D.name).toUpperCase());
}
function airAmmoHTML(a) {
  const s = a.def.weapons.map((w, i) => slot(i + 1, ammoGlyph(AMMO[w.k]), AMMO[w.k].type.toUpperCase(), a.ammo[i], { sel: a.sel === i, out: a.ammo[i] <= 0 }));
  s.push(slot('F', 'bullets', 'GUN', '')); s.push(slot('G', 'flare', 'FLARES', a.flares, { out: a.flares <= 0 }));
  return `<div class="gunst">${AMMO[a.def.weapons[a.sel].k].name}</div><div class="slots2">${s.join('')}</div>`;
}
function rocketPoint(a, A, out) { // the ballistic computer: where a rocket fired now would land (rockets leave along the nose)
  axes(a); const p = airGunWorld(a, new V3()), v = _ax.clone().multiplyScalar(A.v).add(a.vel), dt = .05, g = A.g ?? 9.8;
  for (let k = 0; k < 160; k++) { v.y -= g * dt; p.addScaledVector(v, dt); if (p.y < groundY(p.x, p.z)) return out.copy(p); }
  return out.copy(p);
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
    ai.goHome = empty || a.parts.some(p => p.kind === 'fuse' && p.hp < p.max * .3) || (a.def.fuel0 && a.fuel < a.def.fuel0 * .2);
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
    const cruise = 700 + sk.aim * 100; if (ai.run && (ai.goHome || !tg || tg.kind === 'air')) ai.run = null; // an attack run belongs to its ground target
    if (ai.goHome) { want = new V3(hx - a.pos.x, 0, hz - a.pos.z); const d = want.length(); want.normalize(); want.y = clamp((cruise - alt) / 800, -.3, .4); if (d < 1500) { despawnAirBot(b, a); return; } }
    else if (tg && tg.kind === 'air') { // dogfight: lead the target, missile when it's in the seeker, guns up close
      const d = tg.pos.distanceTo(a.pos), lead = tg.pos.clone().addScaledVector(tg.vel, d / 900).add(ai.aimErr.clone().multiplyScalar(d));
      want = lead.sub(a.pos).normalize(); const an = want.angleTo(_ax.set(1, 0, 0).applyQuaternion(a.quat));
      if (d < 3200 && an < .35 && a.ammo[1] > 0 && Math.random() < dt * (1.2 + sk.aware)) { fire = 1; fo.target = tg; }
      else if (d < 900 && an < .07) fire = 0;
    } else if (tg) { // a ground attack run: line up from a few km, dive, release, pull out
      const tp = aimCenter(tg, new V3()), d = tp.distanceTo(a.pos), hd = Math.hypot(tp.x - a.pos.x, tp.z - a.pos.z);
      if (!ai.run) ai.run = { phase: 'in', fix: Math.random() < .05 * (1 - sk.nerve) }; // (a few nervous ones fixate on the target and pull out late)
      const R = ai.run;
      if (R.phase === 'in') { want = tp.clone().add(ai.aimErr.clone().multiplyScalar(d)).sub(a.pos).normalize(); if (hd > 2500) want.y = clamp((cruise - alt) / 600, -.2, .3); const an = want.angleTo(_ax.set(1, 0, 0).applyQuaternion(a.quat));
        if (an < .08 && d < 4200 + sk.aim * 600 && a.ammo[2] > 0 && Math.random() < dt * 2) { fire = 2; fo.target = tg; } // (some fire from too far out)
        else if (an < .05 && d < 1100 && a.ammo[0] > 0) fire = 0;
        if (a.ammo[3] > 0 && tg.kind === 'vehicle') { const cp = ccipPoint(a, new V3()); if (cp && cp.distanceTo(tp) < 20 + sk.aim * 25) fire = 3; }
        const Vd = a.vel.length(), sinkR = Math.max(0, -a.vel.y), need = sinkR * 1.1 + Vd * Vd / 39 * (1 - Math.sqrt(Math.max(0, 1 - (sinkR / Math.max(Vd, 1)) ** 2))) + 150; // height the pull-out takes: the delay, then a 5 g arc
        const pull = Math.max(need, 330 + 120 * (1 - sk.nerve)) * (R.fix ? .62 : 1);
        if (alt < pull || d < 450) { R.phase = 'out'; R.t = 7 + Math.random() * 4; }
        else if (alt > 260 && hd < (a.pos.y - tp.y) * 2.1) { R.phase = 'out'; R.t = 5 + Math.random() * 3; R.again = true; } // nearly overhead: too steep. Go round and come in shallower
      } else { want = a.vel.clone().normalize(); want.y = .35; if ((R.t -= dt) <= 0) { R.phase = 'in'; if (!R.again) ai.target = null; R.again = false; } }
    } else { const c = GAME.cps[targetCpFor(team)]; want = new V3(c.p.x * 1000 - a.pos.x + Math.sin(GAME.time * .1 + b.lane) * 1500, 0, c.p.y * 1000 - a.pos.z + Math.cos(GAME.time * .1 + b.lane) * 1500).normalize(); want.y = clamp((cruise - alt) / 600, -.25, .3); }
    // a fight that has drifted well off the map: break off and come back
    if (a.pos.x < -3000 || a.pos.x > WORLD_W + 3000 || a.pos.z < -3000 || a.pos.z > WORLD_H + 3000) { want = new V3(WORLD_W / 2 - a.pos.x, 0, WORLD_H / 2 - a.pos.z).normalize(); want.y = clamp((cruise - alt) / 600, -.25, .3); fire = -1; if (tg && tg.kind === 'air') ai.target = null; }
    // don't fly into hills: look ahead along the velocity; and never dive past the height it takes to pull out (the delay, then a 5 g arc)
    const ahead = a.pos.clone().addScaledVector(a.vel, 3.5), clear = ahead.y - Math.max(0, groundY(ahead.x, ahead.z));
    const Vn = a.vel.length(), sinkJ = Math.max(0, -a.vel.y), low = sinkJ > 25 && alt < sinkJ * 1.2 + Vn * Vn / 39 * (1 - Math.sqrt(Math.max(0, 1 - (sinkJ / Math.max(Vn, 1)) ** 2))) + 120;
    if (low || (clear < 120 && !(ai.run && ai.run.phase === 'in' && clear > 60))) { want = want ? want.clone() : new V3(1, 0, 0); want.y = Math.max(want.y, low ? .6 : .5 + (120 - clear) / 100); }
    const cmd = steerToward(a, want.normalize(), new V3());
    // throttle: hold a speed that suits the job (fast for a fight, slower to aim at the ground); afterburner to get out of trouble
    const vWant = tg && tg.kind === 'air' ? 270 : ai.run && ai.run.phase === 'in' ? 205 : ai.run ? 250 : 225;
    a.airbrake = low && Vn > 230; // a fast dive that has to end now: throttle back and brakes out, to tighten the pull-out
    a.throttle = a.airbrake ? .1 : Vn < 150 || clear < 120 ? 1 : clamp(.5 + (vWant - Vn) * .02, .1, tg && tg.kind === 'air' ? 1 : .85); a.inp = { cmd, throttle: a.throttle };
  } else {
    // helicopter: hang back 1.5-2.5 km from the fight, low; missiles at vehicles, rockets and gun at the rest; rearm when empty
    if (ai.goHome) { const d = Math.hypot(hx - a.pos.x, hz - a.pos.z); if (d < 400) { despawnAirBot(b, a); return; } want = new V3(hx - a.pos.x, 0, hz - a.pos.z); }
    const c = GAME.cps[targetCpFor(team)], cx = c.p.x * 1000, cz = c.p.y * 1000, bx = M.bases[team].x * 1000, bz = M.bases[team].y * 1000, bd = Math.hypot(bx - cx, bz - cz) || 1;
    if (!ai.goHome) { if (!ai.post || (ai.postT -= dt) <= 0) { const r = 1500 + Math.random() * 900, a0 = Math.atan2(bz - cz, bx - cx) + (Math.random() - .5) * 1.2; ai.post = new V3(cx + Math.cos(a0) * r, 0, cz + Math.sin(a0) * r); ai.postT = 18 + Math.random() * 14; } want = ai.post.clone().sub(a.pos); }
    const hd = Math.hypot(want.x, want.z), wantAlt = 45 + sk.aim * 15, hdgWant = tg && hd < 400 ? Math.atan2(tg.pos.z - a.pos.z, tg.pos.x - a.pos.x) : Math.atan2(want.z, want.x);
    const fwdC = hd > 60 ? clamp(hd / 300, .2, 1) * Math.cos(angDiffA(a.hdg, Math.atan2(want.z, want.x))) : 0;
    // flying low: watch the ground coming up ahead. "need" is the climb rate it takes to clear every point on the next 14 seconds of track
    let yWant = Math.max(0, groundY(a.pos.x, a.pos.z)) + wantAlt, need = -99;
    const trk = Math.atan2(a.vel.z, a.vel.x), Vt = Math.hypot(a.vel.x, a.vel.z), w = Vt > 12 ? clamp(angDiffA(ai.trk0 ?? trk, trk) / Math.max(dt, 1e-3), -.25, .25) : 0; ai.trk0 = trk; ai.trkW = (ai.trkW || 0) + (w - (ai.trkW || 0)) * Math.min(1, dt * 2); // how fast the track is turning
    for (const t of [1.5, 3, 5, 7, 10, 14]) for (const tw of ai.trkW * ai.trkW > 1e-4 ? [0, ai.trkW] : [0]) { // (straight on, and round the turn it is in)
      const px = tw ? a.pos.x + Vt / tw * (Math.sin(trk + tw * t) - Math.sin(trk)) : a.pos.x + a.vel.x * t, pz = tw ? a.pos.z - Vt / tw * (Math.cos(trk + tw * t) - Math.cos(trk)) : a.pos.z + a.vel.z * t;
      const gh = Math.max(0, groundY(px, pz)) + wantAlt * .6; yWant = Math.max(yWant, gh); need = Math.max(need, (gh - a.pos.y) / t); }
    const vfwB = a.vel.x * Math.cos(a.hdg) + a.vel.z * Math.sin(a.hdg); let fwdB = clamp(fwdC, -.4, .72);
    if (need > 8) fwdB = vfwB > 8 ? -1 : vfwB < -8 ? .6 : 0; else if (need > 5) fwdB = Math.min(fwdB, vfwB > 20 ? -.2 : .1); // more than it can climb: kill the speed (whichever way it is going) and go up
    if (vfwB < -8) fwdB = Math.max(fwdB, .3); // never backs up fast
    a.inp = { fwd: fwdB, side: clamp(Math.sin(angDiffA(a.hdg, Math.atan2(want.z, want.x))) * (hd > 60 ? .6 : 0), -.5, .5) * (1 - sstep(12, 28, Math.abs(vfwB))), up: need > 8 ? 1.6 : need > 4 ? 1 : clamp((yWant - a.pos.y) / 15, -.5, 1), hdg: hdgWant + (Math.sin(GAME.time * .6 + b.lane) * .05) };
    if (tg && tg.kind === 'air' && a.ammo[3] > 0) { const d = tg.pos.distanceTo(a.pos), an = _ax.set(1, 0, 0).applyQuaternion(a.quat).angleTo(tg.pos.clone().sub(a.pos)); if (d < 4200 && an < .5 && Math.random() < dt * (.5 + sk.aware)) { fire = 3; fo.target = tg; } }
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
