/* Island Front: models, units, weapons, projectiles, effects and sound. */
'use strict';
const TEAMS = [
  { name: 'Blue', css: '#4d8dff', hex: 0x2f6fd6, camo: 0x55603c, camo2: 0x434c2e, uni: 0x56603f, vest: 0x3c4430 },
  { name: 'Red', css: '#ff5a4a', hex: 0xd23b2b, camo: 0xa58d63, camo2: 0x8a744f, uni: 0xa48c66, vest: 0x7a674a },
  { name: 'Guard', css: '#c9d48a', hex: 0x8a9455, camo: 0x3a3c3e, camo2: 0x2c2e30, uni: 0x34373a, vest: 0x222426 },
];
const SKIN = [0xc8a07e, 0x9c7354, 0xe0b896, 0x7a5a42];

/* ---------------- model helpers ---------------- */
// every group's plain parts are merged into one mesh with vertex colours: a soldier is ~8 draw calls, a tank 3
const VCOL_MAT = new THREE.MeshLambertMaterial({ vertexColors: true });
function mergeModel(node) {
  for (const ch of node.children.slice()) if (!ch.isMesh) mergeModel(ch);
  const parts = node.children.filter(ch => ch.isMesh && ch.material.isMeshLambertMaterial && !ch.material.transparent && !ch.material.vertexColors);
  if (parts.length < 2) return;
  const P = [], N = [], C = [], v = new V3(), nm = new THREE.Matrix3();
  for (const m of parts) {
    m.updateMatrix(); nm.getNormalMatrix(m.matrix);
    const g = m.geometry, p = g.attributes.position, n = g.attributes.normal, col = m.material.color, ix = g.index;
    const cnt = ix ? ix.count : p.count;
    for (let k = 0; k < cnt; k++) { const i = ix ? ix.getX(k) : k; v.fromBufferAttribute(p, i).applyMatrix4(m.matrix); P.push(v.x, v.y, v.z); v.fromBufferAttribute(n, i).applyMatrix3(nm).normalize(); N.push(v.x, v.y, v.z); C.push(col.r, col.g, col.b); }
    node.remove(m);
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(C, 3));
  const mesh = new THREE.Mesh(g, VCOL_MAT); mesh.castShadow = mesh.receiveShadow = true; node.add(mesh);
}
function P(parent, geo, color, x = 0, y = 0, z = 0, o = {}) {
  const m = new THREE.Mesh(geo, o.mat || mat(color)); m.position.set(x, y, z);
  if (o.r) m.rotation.set(o.r[0] || 0, o.r[1] || 0, o.r[2] || 0); if (o.s) m.scale.set(o.s[0], o.s[1], o.s[2]);
  m.castShadow = o.shadow !== false; m.receiveShadow = true; parent.add(m); return m;
}
const G = {}; // cached geometry
const gBox = () => BOX;
const gCyl = (rt, rb, seg = 12) => G['c' + rt + rb + seg] || (G['c' + rt + rb + seg] = new THREE.CylinderGeometry(rt, rb, 1, seg));
const gWheel = (r, w, seg = 14) => { const k = 'w' + r + w; if (!G[k]) { G[k] = new THREE.CylinderGeometry(r, r, w, seg); G[k].rotateX(Math.PI / 2); } return G[k]; };
const gSph = (seg = 10) => G['s' + seg] || (G['s' + seg] = new THREE.SphereGeometry(1, seg, Math.max(6, seg * .7 | 0)));
function sideProfile(pts, width, bevel = 0) { // a hull side outline in (x,y), extruded across z
  const sh = new THREE.Shape(); pts.forEach((p, i) => i ? sh.lineTo(p[0], p[1]) : sh.moveTo(p[0], p[1]));
  const g = new THREE.ExtrudeGeometry(sh, { depth: width, bevelEnabled: bevel > 0, bevelSize: bevel, bevelThickness: bevel, bevelSegments: 1 });
  g.translate(0, 0, -width / 2); g.computeVertexNormals(); return g;
}
function topProfile(pts, height, bevel = 0) { // an outline seen from above in (x,z), extruded up
  const sh = new THREE.Shape(); pts.forEach((p, i) => i ? sh.lineTo(p[0], -p[1]) : sh.moveTo(p[0], -p[1]));
  const g = new THREE.ExtrudeGeometry(sh, { depth: height, bevelEnabled: bevel > 0, bevelSize: bevel, bevelThickness: bevel, bevelSegments: 1 });
  g.rotateX(-Math.PI / 2); g.computeVertexNormals(); return g;
}
const _la = new V3(), _lb = new V3(), _UP0 = new V3(0, 1, 0);
function limb(parent, a, b, t, color) { // a box from point a to point b
  _la.fromArray(a); _lb.fromArray(b); const len = _la.distanceTo(_lb);
  const m = P(parent, BOX, color, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2, { s: [t, len + t * .4, t] });
  m.quaternion.setFromUnitVectors(_UP0, _lb.sub(_la).normalize()); return m;
}
function barrel(parent, len, r0, r1, color, x = 0) { const b = P(parent, gCyl(r1, r0, 10), color, x + len / 2, 0, 0, { r: [0, 0, -Math.PI / 2], s: [1, len, 1] }); return b; }


function buildHowitzer(team) {
  const T = TEAMS[team], C = T.camo, D = T.camo2, root = new THREE.Group(), turret = new THREE.Group(); root.add(turret);
  for (const sd of [-1, 1]) { P(root, BOX, D, -2.6, .35, sd * .9, { s: [4.4, .28, .26], r: [0, sd * .32, 0] }); P(root, BOX, 0x333330, -4.6, .2, sd * 1.6, { s: [.5, .4, .7] }); }
  for (const sd of [-1, 1]) P(root, gWheel(.6, .35, 16), 0x1f1f1d, 0, .6, sd * 1.25);
  P(root, BOX, C, 0, .85, 0, { s: [1.6, .5, 2.0] });
  P(turret, BOX, C, .3, 1.5, 0, { s: [.25, 1.3, 2.4], r: [0, 0, -.12] }); // gun shield
  const gun = new THREE.Group(); gun.position.set(0, 1.45, 0); turret.add(gun);
  P(gun, BOX, D, -.3, 0, 0, { s: [2.2, .45, .5] }); // cradle and recoil gear
  barrel(gun, 6.4, .14, .12, D, .5); P(gun, BOX, 0x2c2c28, 7.0, 0, 0, { s: [.5, .3, .42] }); // muzzle brake
  return { root, turret, gun, muzzle: 7.3 };
}

function buildSoldier(team, npc) {
  const T = TEAMS[team], U = T.uni, V = T.vest, root = new THREE.Group(), skin = SKIN[(Math.random() * SKIN.length) | 0];
  const hips = new THREE.Group(); hips.position.y = .95; root.add(hips);
  const legs = [];
  for (const sd of [-1, 1]) {
    const thigh = new THREE.Group(); thigh.position.set(0, 0, sd * .11); hips.add(thigh);
    P(thigh, BOX, U, 0, -.22, 0, { s: [.17, .46, .17] });
    const shin = new THREE.Group(); shin.position.y = -.45; thigh.add(shin);
    P(shin, BOX, U, 0, -.2, 0, { s: [.15, .42, .15] }); P(shin, BOX, 0x2a241e, .05, -.44, 0, { s: [.27, .11, .14] });
    legs.push({ thigh, shin });
  }
  const torso = new THREE.Group(); hips.add(torso);
  P(torso, BOX, U, 0, .28, 0, { s: [.24, .56, .4] }); P(torso, BOX, V, .01, .3, 0, { s: [.29, .44, .44] });
  P(torso, BOX, V, .16, .2, 0, { s: [.06, .16, .32] }); // pouches
  P(torso, BOX, 0x2e2a22, 0, .02, 0, { s: [.27, .07, .42] }); // belt
  if (!npc) P(torso, BOX, T.hex, 0, .42, .23, { s: [.15, .08, .02] }); // armband
  const head = new THREE.Group(); head.position.y = .66; torso.add(head);
  P(head, gSph(10), skin, .01, .08, 0, { s: [.105, .12, .1] });
  P(head, gSph(10), V, 0, .14, 0, { s: [.135, .1, .13] }); // helmet
  P(head, BOX, V, .07, .1, 0, { s: [.06, .025, .25] });
  const arms = new THREE.Group(); arms.position.set(0, .48, 0); torso.add(arms);
  // both hands on the rifle: right hand on the grip, left hand on the handguard
  for (const [sh, el, hd] of [[[0, .02, .19], [.1, -.17, .21], [.3, -.17, .07]], [[0, .02, -.19], [.27, -.11, -.17], [.56, -.09, .03]]]) {
    limb(arms, sh, el, .11, U); limb(arms, el, hd, .095, U); P(arms, BOX, skin, hd[0], hd[1], hd[2], { s: [.08, .08, .07] });
  }
  const rifle = new THREE.Group(); rifle.position.set(.25, -.08, .05); arms.add(rifle);
  P(rifle, BOX, 0x1d1d1b, .15, 0, 0, { s: [.5, .09, .05] }); P(rifle, BOX, 0x1d1d1b, .05, -.09, 0, { s: [.08, .14, .04] }); P(rifle, BOX, 0x2a2622, -.2, -.02, 0, { s: [.24, .1, .05] });
  barrel(rifle, .3, .013, .011, 0x161614, .38);
  return { root, hips, torso, legs, head, arms, rifle };
}

/* ---------------- entities ---------------- */
const ENTS = [];
let ENT_ID = 1;
class Ent { constructor(kind, team) { this.id = ENT_ID++; this.kind = kind; this.team = team; this.alive = true; this.pos = new V3(); this.vel = new V3(); ENTS.push(this); } }
const SOLDIER_HP = 100;
class Soldier extends Ent {
  constructor(team, o = {}) {
    super('soldier', team);
    this.npc = !!o.npc; this.isPlayer = !!o.player; this.bot = o.bot || null; this.name = o.name || '';
    this.hp = SOLDIER_HP; this.yaw = 0; this.pitch = 0; this.onGround = true; this.veh = null; this.walk = 0; this.crouch = false;
    this.mag = 30; this.ammo = 210; this.reload = 0; this.cool = 0; this.rpg = 3; this.slot = 0; this.dead = 0; this.lastHurt = -99;
    const kitM = typeof kitSoldierFor === 'function' && WORLD.gfx === 'realistic' ? kitSoldierFor(team, this.npc) : null; // a downloaded, rigged figure if one is set up (models/config.js)
    if (kitM) this.model = kitM; else
    if (WORLD.gfx === 'realistic') this.model = buildRealSoldier(team, this.npc); // real-soldier.js
    else { this.model = buildSoldier(team, this.npc); mergeModel(this.model.root); }
    scene.add(this.model.root);
  }
  get eye() { return _eye.set(this.pos.x, this.pos.y + (this.crouch ? 1.15 : 1.6), this.pos.z); }
  get chest() { return _chest.set(this.pos.x, this.pos.y + 1.25, this.pos.z); }
}
const _eye = new V3(), _chest = new V3();
class Howitzer extends Ent {
  constructor(team, x, z, y, yaw) {
    super('gun', team); this.hp = 700; this.pos.set(x, y, z); this.yaw = yaw; this.aimYaw = 0; this.aimPitch = .7; this.cool = 4 + Math.random() * 8; this.wantYaw = 0; this.wantPitch = .7;
    this.model = buildHowitzer(team); mergeModel(this.model.root); this.model.root.position.copy(this.pos); this.model.root.rotation.y = -yaw; scene.add(this.model.root);
  }
}
function removeEnt(e) { const i = ENTS.indexOf(e); if (i >= 0) ENTS.splice(i, 1); if (e.model) scene.remove(e.model.root); }
function hostile(a, b) { return a !== b && (a === 2 || b === 2 || a !== b); } // guards fight everyone

/* ---------------- weapons (the rounds themselves are in AMMO, vehicles.js) ---------------- */
const RIFLE = { rate: .1, spread: .006, mag: 30, reload: 2.2 };
function soldierDmg(A) { return A.kind === 'bullet' ? A.main : A.kind === 'he' ? (A.splashDmg || 80) : 250; }
function gunDmg(A) { return A.kind === 'bullet' ? A.main * .05 : (A.main || 0) + (A.splashDmg || 0) * .5 + (A.kind === 'ap' ? 250 : 0); }

/* ---------------- hit tests against units ---------------- */
function vehLocal(v, p, out) { // world point -> vehicle frame (x forward, z side), ignoring tilt
  const dx = p.x - v.pos.x, dz = p.z - v.pos.z, c = Math.cos(v.yaw), s = Math.sin(v.yaw);
  return out.set(dx * c + dz * s, p.y - v.pos.y, -dx * s + dz * c);
}
const _l0 = new V3(), _l1 = new V3();
function segUnit(a, b, e) { // fraction along a->b where it hits unit e, or null
  if (e.kind === 'soldier') {
    if (e.veh) return null;
    const h = e.crouch ? 1.2 : 1.8; let best = null;
    for (const y of [.45, .95, 1.4, h - .15]) { const t = segSphere(a, b, _l0.set(e.pos.x, e.pos.y + y, e.pos.z), y > 1.5 ? .17 : .3); if (t !== null && (best === null || t < best)) best = t; }
    return best;
  }
  if (e.kind === 'air') return segUnitAir(a, b, e);
  const T = e.kind === 'gun' ? { len: 8, wid: 3, hgt: 2.4 } : e.T;
  vehLocal(e, a, _l0); vehLocal(e, b, _l1);
  let t0 = 0, t1 = 1;
  const slab = (p0, p1, lo, hi) => { const d = p1 - p0; if (Math.abs(d) < 1e-9) return p0 >= lo && p0 <= hi; let u0 = (lo - p0) / d, u1 = (hi - p0) / d; if (u0 > u1) { const t = u0; u0 = u1; u1 = t; } t0 = Math.max(t0, u0); t1 = Math.min(t1, u1); return t0 <= t1; };
  if (!slab(_l0.x, _l1.x, -T.len / 2, T.len / 2) || !slab(_l0.z, _l1.z, -T.wid / 2, T.wid / 2) || !slab(_l0.y, _l1.y, 0, T.hgt)) return null;
  return t0;
}
function segSphere(a, b, c, r) {
  const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z, fx = a.x - c.x, fy = a.y - c.y, fz = a.z - c.z;
  const A = dx * dx + dy * dy + dz * dz, B = 2 * (fx * dx + fy * dy + fz * dz), C = fx * fx + fy * fy + fz * fz - r * r, D = B * B - 4 * A * C;
  if (D < 0 || A < 1e-12) return null; const t = (-B - Math.sqrt(D)) / (2 * A); return t >= 0 && t <= 1 ? t : (C < 0 ? 0 : null);
}
function traceAll(a, b, skip, exclude) { // nearest hit: {t, ent|null, ground|water|box}
  let best = { t: 1.01, ent: null, what: null };
  const tb = segBoxes(a, b); if (tb !== null && tb < best.t) best = { t: tb, ent: null, what: 'box' };
  const tg = segTerrain(a, b, 3); if (tg !== null && tg < best.t) best = { t: tg, ent: null, what: 'ground' };
  if (a.y > 0 !== b.y > 0 || b.y < 0) { const tw = a.y > 0 ? a.y / (a.y - b.y) : 0; if (tw < best.t && terrainY(lerp(a.x, b.x, tw), lerp(a.z, b.z, tw)) < 0) best = { t: tw, ent: null, what: 'water' }; }
  const minx = Math.min(a.x, b.x) - 6, maxx = Math.max(a.x, b.x) + 6, minz = Math.min(a.z, b.z) - 6, maxz = Math.max(a.z, b.z) + 6;
  for (const e of ENTS) {
    const er = e.R || 0;
    if (!e.alive || e === skip || (exclude && exclude.includes(e)) || (skip && skip.veh === e) || (skip && e.veh === skip) || e.pos.x < minx - er || e.pos.x > maxx + er || e.pos.z < minz - er || e.pos.z > maxz + er) continue;
    const t = segUnit(a, b, e); if (t !== null && t < best.t) best = { t, ent: e, what: 'unit' };
  }
  return best.t <= 1 ? best : null;
}

/* ---------------- effects ---------------- */
const FX = { sprites: [], tracers: [], lights: [] };
for (let i = 0; i < 4; i++) { const l = new THREE.PointLight(0xffa860, 0, 1, 2); l.userData = { t: 1, life: 0 }; scene.add(l); FX.lights.push(l); } // made up front so adding one never recompiles shaders mid-fight
function blobTex(inner, outer) {
  const cv = document.createElement('canvas'); cv.width = cv.height = 64; const g = cv.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, inner); gr.addColorStop(.45, outer); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(cv);
}
const FIRE_TEX = blobTex('rgba(255,250,220,1)', 'rgba(255,140,40,.7)'), SMOKE_TEX = blobTex('rgba(255,255,255,.9)', 'rgba(255,255,255,.35)');
const spritePool = [];
function sprite(pos, size, grow, life, color, fire, vy = 0, opacity = 1) {
  let s = spritePool.pop();
  if (!s) s = new THREE.Sprite(new THREE.SpriteMaterial({ depthWrite: false }));
  const m = s.material; m.map = fire ? FIRE_TEX : SMOKE_TEX; m.blending = fire ? THREE.AdditiveBlending : THREE.NormalBlending; m.color.setHex(color); m.opacity = opacity; m.needsUpdate = true; m.fog = !fire;
  s.position.copy(pos); s.scale.setScalar(size); s.renderOrder = 5;
  s.userData = { t: 0, life, size, grow, vy, op: opacity }; scene.add(s); FX.sprites.push(s); return s;
}
function explosion(pos, size, water) {
  const p = pos.clone();
  if (water) { for (let i = 0; i < 6; i++) sprite(p.clone().add(new V3(rand(-1, 1) * size * .3, size * .2, rand(-1, 1) * size * .3)), size * .8, size * 1.4, 1.4 + Math.random(), 0xe6f0f2, false, size * rand(1.2, 2.6), .85); return; }
  for (let i = 0; i < 4 + size; i++) sprite(p.clone().add(new V3(rand(-1, 1) * size * .35, rand(0, size * .4), rand(-1, 1) * size * .35)), size * rand(.6, 1.1), size * 1.2, .35 + Math.random() * .3, 0xffffff, true, rand(0, 3));
  for (let i = 0; i < 5 + size * 1.5; i++) sprite(p.clone().add(new V3(rand(-1, 1) * size * .5, rand(0, size * .5), rand(-1, 1) * size * .5)), size * rand(.7, 1.3), size * rand(1.5, 3), 2.5 + Math.random() * 3, Math.random() < .5 ? 0x5a5650 : 0x8a8274, false, rand(1, 4), .8);
  const L = FX.lights.find(l => l.userData.t >= l.userData.life) || FX.lights[0];
  L.position.copy(p).y += 2; L.intensity = 3 + size; L.distance = size * 12; L.userData = { t: 0, life: .25, i: 3 + size };
}
function dust(pos, size) { for (let i = 0; i < 3; i++) sprite(pos.clone().add(new V3(rand(-1, 1) * size, rand(0, size), rand(-1, 1) * size)), size * 1.2, size * 2.5, 1 + Math.random(), 0x9c8f78, false, 1.2, .7); }
const tracerGeo = (() => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 0, 0, 1], 3)); return g; })();
function tracer(a, b, color = 0xffd27a, life = .06) {
  const l = new THREE.Line(tracerGeo, new THREE.LineBasicMaterial({ color, transparent: true, opacity: .9 }));
  l.position.copy(a); l.lookAt(b); l.scale.set(1, 1, a.distanceTo(b)); l.userData = { t: 0, life }; scene.add(l); FX.tracers.push(l);
}
function updateFX(dt) {
  for (let i = FX.sprites.length - 1; i >= 0; i--) {
    const s = FX.sprites[i], u = s.userData; u.t += dt; const f = u.t / u.life;
    if (f >= 1) { scene.remove(s); FX.sprites.splice(i, 1); spritePool.push(s); continue; }
    s.scale.setScalar(u.size + u.grow * f); s.position.y += u.vy * dt; s.material.opacity = u.op * (1 - f) * (1 - f * .3);
  }
  for (let i = FX.tracers.length - 1; i >= 0; i--) { const l = FX.tracers[i], u = l.userData; u.t += dt; if (u.t >= u.life) { scene.remove(l); l.material.dispose(); FX.tracers.splice(i, 1); } else l.material.opacity = .9 * (1 - u.t / u.life); }
  for (const l of FX.lights) { const u = l.userData; if (!u || u.t >= u.life) { l.intensity = 0; continue; } u.t += dt; l.intensity = u.i * (1 - u.t / u.life); }
}

/* ---------------- projectiles ---------------- */
const PROJS = [];
const glow = c => new THREE.MeshBasicMaterial({ color: c });
const PMODEL = {
  dart: () => P(scene, gCyl(.05, .05, 6), 0, 0, 0, 0, { s: [1, 2.2, 1], mat: glow(0xffe8b0), shadow: false }),
  shell: () => P(scene, gCyl(.07, .07, 6), 0, 0, 0, 0, { s: [1, 1.4, 1], mat: glow(0xffd090), shadow: false }),
  tracer: () => P(scene, gCyl(.035, .035, 5), 0, 0, 0, 0, { s: [1, 2.4, 1], mat: glow(0xffb060), shadow: false }),
  rocket: () => { const g = new THREE.Group(); P(g, gCyl(.05, .05, 8), 0x3d4a2e, 0, 0, 0, { s: [1, .9, 1] }); P(g, gSph(6), 0, 0, -.5, 0, { s: [.09, .14, .09], mat: glow(0xffb040), shadow: false }); scene.add(g); return g; },
  missile: () => { const g = new THREE.Group(); P(g, gCyl(.07, .07, 8), 0x3a4232, 0, 0, 0, { s: [1, 1.1, 1] }); P(g, gSph(6), 0, 0, -.6, 0, { s: [.12, .18, .12], mat: glow(0xfff0c0), shadow: false }); scene.add(g); return g; },
  bigshell: () => P(scene, gCyl(.08, .08, 8), 0x55534a, 0, 0, 0, { s: [1.4, 1.2, 1.4] }),
};
const _UP = new V3(0, 1, 0);
function launch(key, owner, team, from, dir, speedOverride) {
  const A = AMMO[key], v = dir.clone().normalize().multiplyScalar(speedOverride || A.v);
  const p = { key, A, owner, team, pos: from.clone(), vel: v, t: 0, dist: 0, m: A.look ? PMODEL[A.look]() : null, prev: from.clone(), trail: 0, g: A.g ?? 9.8, life: A.life ?? 6, skip: [] };
  PROJS.push(p); return p;
}
function sparks(pt, n = 4) { for (let i = 0; i < n; i++) sprite(pt.clone().add(new V3(rand(-.4, .4), rand(0, .5), rand(-.4, .4))), .5, .3, .12, 0xffd890, true, rand(1, 4)); }
// a round meets a unit; returns false if it slipped past (the vehicle's armour boxes weren't touched)
function hitUnit(e, key, owner, a, b, range) {
  const A = AMMO[key];
  if (e.kind === 'air') return airShot(e, A, owner, a, b);
  if (e.kind === 'vehicle') {
    const res = shotVehicle(e, a, b, key, owner, range); if (!res) return false;
    if (typeof hitReport === 'function') hitReport(owner, e, res);
    if (res.rico || (!res.pen && A.kind !== 'he')) sparks(res.pt || b, A.kind === 'bullet' ? 2 : 7);
    return res;
  }
  if (e.kind === 'soldier') damage(e, soldierDmg(A), owner, key);
  else damage(e, gunDmg(A), owner, key);
  return true;
}
function hitscan(key, owner, team, from, dir, spread) {
  const A = AMMO[key], d = dir.clone();
  if (spread) { d.x += (Math.random() - .5) * 2 * spread; d.y += (Math.random() - .5) * 2 * spread; d.z += (Math.random() - .5) * 2 * spread; d.normalize(); }
  const end = from.clone().addScaledVector(d, A.range || 800), ex = [];
  let hit = null;
  for (let k = 0; k < 4; k++) {
    hit = traceAll(from, end, owner, ex); if (!hit || !hit.ent) break;
    const pt = from.clone().lerp(end, hit.t);
    if (hitUnit(hit.ent, key, owner, from.clone().lerp(end, Math.max(0, hit.t - .002)), from.clone().lerp(end, Math.min(1, hit.t + 6 / (A.range || 800))), pt.distanceTo(from)) !== false) break;
    ex.push(hit.ent); hit = null;
  }
  const pt = hit ? from.clone().lerp(end, hit.t) : end;
  if (Math.random() < .5 || owner.isPlayer || (owner.driver && owner.driver.isPlayer)) tracer(from.clone().addScaledVector(d, 2), pt, 0xffdc8a, .05);
  if (hit && !hit.ent) {
    if (hit.what === 'ground' && Math.random() < .35) dust(pt, .5);
    else if (hit.what === 'water' && Math.random() < .4) sprite(pt, .6, 1, .5, 0xe6f0f2, false, 2, .7);
    else if (hit.what === 'box' && Math.random() < .3) sparks(pt, 2);
  }
  return hit;
}
function updateProjectiles(dt) {
  for (let i = PROJS.length - 1; i >= 0; i--) {
    const p = PROJS[i], A = p.A; p.t += dt;
    if (A.guided && p.guide) { // wire-guided: steer toward where the gunner is aiming
      const tgt = p.guide(); if (tgt && A.saclos && typeof shtoraJam === 'function') shtoraJam(p, tgt, dt); // a dazzler in the target's turret can blind the launcher's tracker
      if (A.glide) p.vel.y -= p.g * dt; // a guided bomb still falls: its fins only bend the fall towards the target
      if (tgt) { const want = tgt.clone().sub(p.pos).normalize(), cur = p.vel.clone().normalize(), ang = cur.angleTo(want), k = Math.min(1, (A.turn || 1.6) * dt / Math.max(ang, 1e-3)); p.vel.copy(cur.lerp(want, k).normalize().multiplyScalar(A.glide ? p.vel.length() : Math.max(A.v, p.vel.length() * (1 - dt * .05)))); }
    } else p.vel.y -= p.g * dt;
    p.prev.copy(p.pos); p.pos.addScaledVector(p.vel, dt); p.dist += p.vel.length() * dt;
    if ((A.look === 'rocket' || A.look === 'missile') && (p.trail -= dt) <= 0) { p.trail = .03; sprite(p.prev, .7, 1.6, .8, 0xcfcac0, false, .3, .6); }
    if (p.key === 'he155' && (p.trail -= dt) <= 0) { p.trail = .12; sprite(p.prev, 1.2, 2.5, 1.6, 0xb8b2a6, false, 0, .35); }
    if (p.m) { p.m.position.copy(p.pos); p.m.quaternion.setFromUnitVectors(_UP, _l0.copy(p.vel).normalize()); }
    let hit = traceAll(p.prev, p.pos, p.owner, p.skip), res = true;
    if (!hit && A.prox && p.target && p.target.alive && segSphere(p.prev, p.pos, p.target.pos, A.prox) !== null) hit = { t: 1, ent: null, what: 'prox' }; // proximity fuse
    while (hit && hit.ent) { // a vehicle's outline was touched: check its armour, or fly on past
      res = hitUnit(hit.ent, p.key, p.owner, p.prev.clone().lerp(p.pos, Math.max(0, hit.t - .01)), p.pos.clone().addScaledVector(p.vel, .006), p.dist);
      if (res !== false) break;
      p.skip.push(hit.ent); hit = traceAll(p.prev, p.pos, p.owner, p.skip);
    }
    if (hit || p.t > p.life || p.pos.y < -50) {
      const pt = hit ? (res && res.pt ? res.pt.clone() : p.prev.clone().lerp(p.pos, hit.t)) : p.pos.clone(), water = hit && hit.what === 'water';
      if (A.splash) splash(pt, A, p.owner, hit && hit.ent);
      const sz = p.key === 'he155' ? 14 : A.kind === 'he' ? (A.cal || 30) / 26 : A.kind === 'heat' ? 3 : A.kind === 'ap' ? 1.6 : 1;
      if (!(res && res.rico)) explosion(pt, sz, water);
      Sound.at(p.key === 'he155' ? 'bigboom' : sz > 2 ? 'boom' : 'pop', pt);
      if (p.key === 'he155') shake(pt, 1.2); else if (sz > 2) shake(pt, .35);
      if (p.m) scene.remove(p.m);
      PROJS.splice(i, 1);
    }
  }
}
function splash(pt, A, owner, skip) {
  for (const e of ENTS) {
    if (!e.alive || e === skip || (e.kind === 'soldier' && e.veh)) continue;
    if (e.kind === 'vehicle') { if (e.pos.distanceTo(pt) < A.splash + 6) blastNearVehicle(e, pt, A, owner); continue; }
    if (e.kind === 'air') { if (e.pos.distanceTo(pt) < A.splash + e.R) airSplash(e, pt, A, owner); continue; }
    const c = e.kind === 'soldier' ? e.chest : _l0.copy(e.pos).setY(e.pos.y + 1.2), d = c.distanceTo(pt);
    if (d > A.splash) continue;
    const f = 1 - d / A.splash; damage(e, A.splashDmg * f * f * (e.kind === 'soldier' ? 1 : .6), owner, 'splash');
  }
}

/* ---------------- sound: made with Web Audio, no files ---------------- */
const Sound = (() => {
  let ctx = null, master = null, noise = null, eng = null, listener = new V3();
  function init() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
    try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return; }
    master = ctx.createGain(); master.gain.value = .55; master.connect(ctx.destination);
    noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate); const d = noise.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  function burst(vol, dur, freq, q, type = 'lowpass', pitchDrop = 0) {
    if (!ctx || vol < .005) return; const t = ctx.currentTime, s = ctx.createBufferSource(); s.buffer = noise; s.playbackRate.value = .6 + Math.random() * .3;
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.setValueAtTime(freq, t); if (pitchDrop) f.frequency.exponentialRampToValueAtTime(Math.max(40, freq * pitchDrop), t + dur); f.Q.value = q;
    const g = ctx.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(.001, t + dur);
    s.connect(f); f.connect(g); g.connect(master); s.start(t, Math.random()); s.stop(t + dur + .05);
  }
  function thump(vol, dur, f0) { if (!ctx || vol < .005) return; const t = ctx.currentTime, o = ctx.createOscillator(), g = ctx.createGain(); o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(30, t + dur); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(.001, t + dur); o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + .05); }
  const DEF = {
    rifle: v => { burst(.5 * v, .12, 2400, .7); burst(.25 * v, .3, 600, .5); },
    mg: v => { burst(.45 * v, .1, 1800, .8); thump(.2 * v, .08, 160); },
    auto: v => { burst(.5 * v, .16, 1200, .8); thump(.4 * v, .12, 120); },
    cannon: v => { burst(.9 * v, .9, 900, .6, 'lowpass', .2); thump(1 * v, .7, 90); },
    rpg: v => { burst(.5 * v, .7, 1500, .4, 'bandpass', .4); },
    howitzer: v => { burst(1 * v, 1.6, 600, .5, 'lowpass', .15); thump(1 * v, 1.2, 70); },
    pop: v => { burst(.4 * v, .3, 900, .6); },
    boom: v => { burst(.9 * v, 1.2, 700, .5, 'lowpass', .2); thump(.8 * v, .9, 80); },
    bigboom: v => { burst(1.2 * v, 2.6, 500, .4, 'lowpass', .12); thump(1.2 * v, 1.8, 60); },
    whistle: v => { if (!ctx) return; const t = ctx.currentTime, o = ctx.createOscillator(), g = ctx.createGain(); o.type = 'sine'; o.frequency.setValueAtTime(1500, t); o.frequency.exponentialRampToValueAtTime(380, t + 2.2); g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(.18 * v, t + 1.6); g.gain.exponentialRampToValueAtTime(.001, t + 2.3); o.connect(g); g.connect(master); o.start(t); o.stop(t + 2.4); },
    hit: v => { thump(.25 * v, .07, 900); },
    ui: v => { thump(.2 * v, .06, 600); },
    cap: v => { if (!ctx) return; [523, 659, 784].forEach((f, i) => { const t = ctx.currentTime + i * .12, o = ctx.createOscillator(), g = ctx.createGain(); o.frequency.value = f; g.gain.setValueAtTime(.15 * v, t); g.gain.exponentialRampToValueAtTime(.001, t + .4); o.connect(g); g.connect(master); o.start(t); o.stop(t + .45); }); },
  };
  function play(name, vol = 1) { if (ctx && DEF[name]) DEF[name](vol); }
  function at(name, pos, vol = 1) { const d = pos.distanceTo(listener), range = name === 'bigboom' || name === 'howitzer' ? 9000 : name === 'boom' || name === 'cannon' ? 4000 : 1200; if (d < range) play(name, vol * Math.pow(1 - d / range, 2) * (d < 30 ? 1 : 30 / Math.max(30, d * .35) * 2 + .1)); }
  function engine(on, rpm, heavy, turbine, rotor = 0) { // engine and running-gear noise: rumble, firing pulses or turbine air, track clatter, rotor blade slap; no pure tones
    if (!ctx) return;
    if (!eng) {
      const src = ctx.createBufferSource(); src.buffer = noise; src.loop = true;
      const rumbleF = ctx.createBiquadFilter(); rumbleF.type = 'lowpass'; rumbleF.frequency.value = 180; rumbleF.Q.value = .7;
      const rumble = ctx.createGain(); rumble.gain.value = 0;
      const airF = ctx.createBiquadFilter(); airF.type = 'bandpass'; airF.frequency.value = 420; airF.Q.value = .45;
      const airLP = ctx.createBiquadFilter(); airLP.type = 'lowpass'; airLP.frequency.value = 1100;
      const air = ctx.createGain(); air.gain.value = 0;
      const o = ctx.createOscillator(); o.type = 'sawtooth'; const oF = ctx.createBiquadFilter(); oF.type = 'lowpass'; oF.frequency.value = 150; oF.Q.value = .5;
      const pulse = ctx.createGain(); pulse.gain.value = 0; const lfo = ctx.createOscillator(); lfo.type = 'sine'; const lfoG = ctx.createGain(); lfoG.gain.value = 0;
      src.connect(rumbleF); rumbleF.connect(rumble); rumble.connect(master);
      src.connect(airF); airF.connect(airLP); airLP.connect(air); air.connect(master);
      o.connect(oF); oF.connect(pulse); pulse.connect(master); lfo.connect(lfoG); lfoG.connect(pulse.gain);
      src.start(); o.start(); lfo.start();
      eng = { rumble, rumbleF, air, airF, o, oF, pulse, lfo, lfoG, nextClank: 0 };
    }
    const t = ctx.currentTime, r = clamp(rpm, 0, 1.3);
    eng.rumble.gain.setTargetAtTime(on ? (heavy ? .22 : .12) * (.45 + r * .55) : 0, t, .25);
    eng.rumbleF.frequency.setTargetAtTime(110 + r * (heavy ? 160 : 260), t, .3);
    // a gas turbine is a smooth roar of air; a diesel thumps
    eng.air.gain.setTargetAtTime(on && turbine ? .05 + r * .06 : 0, t, .4); eng.airF.frequency.setTargetAtTime(300 + r * 260, t, .5);
    const firing = (heavy ? 22 : 34) + r * (heavy ? 34 : 70);
    eng.o.frequency.setTargetAtTime(firing, t, .2); eng.lfo.frequency.setTargetAtTime(firing / 4, t, .2);
    const pv = on && !turbine ? (heavy ? .07 : .05) * (.5 + r * .5) : on ? .015 : 0;
    eng.pulse.gain.setTargetAtTime(pv, t, .25); eng.lfoG.gain.setTargetAtTime(pv * .7, t, .25);
    if (on && rotor > .2 && t >= (eng.nextSlap || 0)) { thump(.12 * rotor, .09, 95); burst(.05 * rotor, .07, 500, .8); eng.nextSlap = t + 1 / (4.6 * rotor); } // rotor blades slapping the air
    if (on && heavy && rotor === 0 && r > .08 && t >= eng.nextClank) { // track links slapping over the wheels
      burst(.06 + r * .05, .05, 700 + Math.random() * 300, 1.2, 'bandpass'); thump(.05 * r, .05, 70);
      eng.nextClank = t + clamp(.16 / r, .05, .5) * (.8 + Math.random() * .4);
    }
  }

  return { init, play, at, engine, listener, get ok() { return !!ctx; } };
})();
