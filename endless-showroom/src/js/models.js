// Characters: shoppers (players) and the store staff. Built from boxes with a
// simple limb rig for walking. Both designs are original.
import * as THREE from 'three';
import { GeoBuilder } from './geo.js';
import { TYPES, furnitureGeometry, furnitureMaterial } from './furniture.js';
import { SURF, characterMaterial } from './mats.js';

const mat = characterMaterial;

const SKINS = new Set([0xf1c9a5, 0xd9a47a, 0xa86f4c, 0x6e4630, 0xf5d7bf, 0xd8d2c8]);
function part(build, px, py, pz) {
  const g = new GeoBuilder();
  g.mat = SURF.fabric;
  g.matOf = (hex) => (SKINS.has(hex) ? SURF.skin : hex === 0x222222 || hex === 0x111111 ? SURF.plastic : hex === 0x1a1a1a ? SURF.plastic : null);
  build(g);
  const m = new THREE.Mesh(g.build(), mat);
  const pivot = new THREE.Group(); pivot.position.set(px, py, pz); pivot.add(m);
  return pivot;
}

const SHIRTS = [0xd64545, 0x3f7fd6, 0x3fae5a, 0xe0a43a, 0x8f5bd6, 0x2bb3b3, 0xe0679b, 0x6b7280, 0xf2f2f2, 0x1f2937];
const PANTS = [0x2f3a56, 0x3b3b3b, 0x5b4636, 0x1f4e79, 0x4b5320];
const SKIN = [0xf1c9a5, 0xd9a47a, 0xa86f4c, 0x6e4630, 0xf5d7bf];
const HAIR = [0x2a1d14, 0x5b3a1e, 0xc9a25a, 0x1a1a1a, 0x8a3b1f, 0xd9d0c0];

export function nameHash(s) { let h = 7; for (const ch of String(s)) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return h; }

// A shopper. look = hash of the player's id/name, so everyone sees the same.
export function makeShopper(look) {
  const shirt = SHIRTS[look % SHIRTS.length], pants = PANTS[(look >> 4) % PANTS.length], skin = SKIN[(look >> 8) % SKIN.length], hair = HAIR[(look >> 12) % HAIR.length];
  const root = new THREE.Group();
  const body = new THREE.Group(); root.add(body);
  const legL = part((g) => { g.box(0, -0.4, 0, 0.2, 0.8, 0.22, pants); g.box(0, -0.78, 0.04, 0.22, 0.08, 0.3, 0x222222); }, -0.12, 0.82, 0);
  const legR = part((g) => { g.box(0, -0.4, 0, 0.2, 0.8, 0.22, pants); g.box(0, -0.78, 0.04, 0.22, 0.08, 0.3, 0x222222); }, 0.12, 0.82, 0);
  const torso = part((g) => { g.box(0, 0.3, 0, 0.5, 0.62, 0.26, shirt); }, 0, 0.8, 0);
  const armL = part((g) => { g.box(0, -0.25, 0, 0.15, 0.52, 0.17, shirt); g.box(0, -0.56, 0, 0.13, 0.12, 0.15, skin); }, -0.33, 1.38, 0);
  const armR = part((g) => { g.box(0, -0.25, 0, 0.15, 0.52, 0.17, shirt); g.box(0, -0.56, 0, 0.13, 0.12, 0.15, skin); }, 0.33, 1.38, 0);
  const head = part((g) => {
    g.box(0, 0.16, 0, 0.3, 0.32, 0.3, skin); g.box(0, 0.33, -0.02, 0.32, 0.08, 0.32, hair); g.box(0, 0.22, -0.15, 0.32, 0.22, 0.04, hair);
    g.box(-0.07, 0.18, 0.152, 0.05, 0.05, 0.01, 0x1a1a1a); g.box(0.07, 0.18, 0.152, 0.05, 0.05, 0.01, 0x1a1a1a); g.box(0, 0.08, 0.152, 0.1, 0.025, 0.01, 0x8a4b3a);
  }, 0, 1.42, 0);
  body.add(legL, legR, torso, armL, armR, head);
  const held = new THREE.Group(); held.position.set(0, 0, 0.9); root.add(held);
  return { root, body, legL, legR, armL, armR, head, held, phase: 0, heldKey: '' };
}

// A member of staff: tall, faceless, in a teal work vest with a blank badge.
// Eyes glow when they're hunting.
let glowTex = null;
export function makeStaff() {
  const root = new THREE.Group();
  const body = new THREE.Group(); root.add(body);
  const skin = 0xd8d2c8, vest = 0x1f6f6b, shirt = 0xece8e0, trousers = 0x2a2a30;
  const leg = (x) => part((g) => { g.box(0, -0.48, 0, 0.18, 0.96, 0.2, trousers); g.box(0, -0.94, 0.05, 0.2, 0.08, 0.3, 0x111111); }, x, 0.98, 0);
  const legL = leg(-0.11), legR = leg(0.11);
  const torso = part((g) => {
    g.box(0, 0.36, 0, 0.46, 0.74, 0.24, shirt);
    g.box(0, 0.33, 0.005, 0.48, 0.66, 0.26, vest);
    g.box(-0.12, 0.5, 0.135, 0.12, 0.08, 0.01, 0xf5f5f5); // blank name badge
    g.box(0, 0.68, 0.13, 0.02, 0.22, 0.01, 0x9b2c2c);
  }, 0, 0.96, 0);
  const arm = (x) => part((g) => { g.box(0, -0.34, 0, 0.13, 0.7, 0.15, shirt); g.box(0, -0.76, 0, 0.12, 0.16, 0.13, skin); }, x, 1.66, 0);
  const armL = arm(-0.31), armR = arm(0.31);
  const head = part((g) => { g.box(0, 0.08, 0, 0.1, 0.12, 0.1, skin); g.cyl(0, 0.12, 0, 0.15, 0.32, skin, 10, 0.13); g.cyl(0, 0.44, 0, 0.13, 0.04, skin, 10, 0.08); }, 0, 1.7, 0);
  const eyeMat = new THREE.MeshBasicMaterial({ color: 0xff2a2a, fog: false });
  const eyes = new THREE.Group();
  for (const x of [-0.06, 0.06]) { const e = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.025, 0.01), eyeMat); e.position.set(x, 0.32, 0.148); eyes.add(e); }
  // a faint glow around the eyes, so you can spot them in the dark
  const gc = document.createElement('canvas'); gc.width = gc.height = 64;
  const gx = gc.getContext('2d'), gr = gx.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,60,40,0.9)'); gr.addColorStop(0.35, 'rgba(255,30,20,0.35)'); gr.addColorStop(1, 'rgba(255,0,0,0)');
  gx.fillStyle = gr; gx.fillRect(0, 0, 64, 64);
  glowTex = glowTex || new THREE.CanvasTexture(gc);
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, fog: false, toneMapped: false }));
  glow.scale.set(0.45, 0.25, 1); glow.position.set(0, 0.32, 0.17);
  eyes.add(glow);
  head.add(eyes);
  body.add(legL, legR, torso, armL, armR, head);
  return { root, body, legL, legR, armL, armR, head, eyes, phase: 0, attackT: 0 };
}

// Walk cycle; speed in m/s.
export function animate(m, speed, dt, opts = {}) {
  const amp = Math.min(1, speed / 5);
  if (speed > 0.2) m.phase += dt * (4 + speed * 1.3);
  else m.phase *= 0.9;
  const s = Math.sin(m.phase) * 0.8 * amp;
  m.legL.rotation.x = s; m.legR.rotation.x = -s;
  if (opts.carrying) { m.armL.rotation.x = m.armR.rotation.x = -1.35; }
  else if (opts.reach) { m.armL.rotation.x = -1.5; m.armR.rotation.x = -1.5 + Math.sin(opts.reach * 20) * 0.4; }
  else { m.armL.rotation.x = -s * 0.8; m.armR.rotation.x = s * 0.8; }
  m.body.position.y = Math.abs(Math.cos(m.phase)) * 0.05 * amp;
}

// Show the furniture a shopper is carrying (or nothing).
export function setHeld(m, type, variant) {
  const key = type ? type + ':' + variant : '';
  if (m.heldKey === key) return;
  m.heldKey = key;
  while (m.held.children.length) m.held.remove(m.held.children[0]);
  if (!type || !TYPES[type]) return;
  const t = TYPES[type];
  const mesh = new THREE.Mesh(furnitureGeometry(type, variant), furnitureMaterial);
  const s = Math.min(1, 1.1 / Math.max(t.w, t.d, t.h));
  mesh.scale.setScalar(s);
  mesh.position.set(0, 1.0 - t.h * s / 2, Math.max(t.d, t.w) * s * 0.3);
  m.held.add(mesh);
}

// A floating name above a shopper.
export function nameTag(text, color = '#ffffff') {
  const c = document.createElement('canvas'); c.width = 256; c.height = 64;
  const x = c.getContext('2d');
  x.font = 'bold 34px system-ui, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
  const w = Math.min(250, x.measureText(text).width + 24);
  x.fillStyle = 'rgba(0,0,0,0.45)'; x.beginPath(); x.roundRect(128 - w / 2, 8, w, 48, 14); x.fill();
  x.fillStyle = color; x.fillText(text, 128, 33, 240);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: false, transparent: true, fog: false }));
  s.scale.set(1.2, 0.3, 1); s.renderOrder = 10;
  return s;
}
