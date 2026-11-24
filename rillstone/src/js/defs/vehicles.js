// Vehicle definitions (BUILD_BRIEF 3.7). Chassis space: +z forward, +y up.
import * as THREE from 'three';
import { paint, merge, place, bevelBox } from '../render/geom.js';
import { cheap } from './prices.js';

export const VEHICLES = {
  hauler: {
    name: 'Old Hauler', price: 500,
    hx: 1.0, hy: 0.42, hz: 2.3, bodyY: 0.78, ballastY: 0.12, mass: 1800,
    wheels: [[0.98, 0.42, 1.45], [-0.98, 0.42, 1.45], [0.98, 0.42, -1.4], [-0.98, 0.42, -1.4]],
    wheelR: 0.46, suspRest: 0.42, travel: 0.32, stiffness: 26, compression: 3.4, relaxation: 2.6,
    slip: 2.6, sideStiff: 1.0, engine: 8500, brake: 45, topSpeed: 16, maxSteer: 0.55, steerFalloff: 0.085, antiRoll: 2.2, airControl: 0.7,
    // Cargo bed (local): floor height and extent; capacity.
    bed: { y: 1.24, x: 0.86, z0: -2.15, z1: 0.3 }, cargoKg: 2000, cargoItems: 60,
    seat: [-0.42, 1.55, 0.95], door: [-1.9, 0, 0.9],
    fuelMax: 960, // seconds of driving: two sacks of charcoal
    model: 'hauler',
  },
  // Light, quick and bouncy: soft springs, low mass, no bed.
  buggy: {
    name: 'Trail Buggy', price: 700,
    hx: 0.75, hy: 0.3, hz: 1.35, bodyY: 0.62, ballastY: 0.1, mass: 650,
    wheels: [[0.86, 0.38, 1.0], [-0.86, 0.38, 1.0], [0.86, 0.38, -1.0], [-0.86, 0.38, -1.0]],
    wheelR: 0.42, suspRest: 0.4, travel: 0.36, stiffness: 18, compression: 2.2, relaxation: 1.6,
    slip: 2.3, sideStiff: 0.95, engine: 3600, brake: 18, topSpeed: 22, maxSteer: 0.6, steerFalloff: 0.07, antiRoll: 1.8, airControl: 1.0,
    bed: null, cargoKg: 0, cargoItems: 0, seat: [-0.3, 1.2, 0.1], door: [-1.5, 0, 0.1], fuelMax: 720, model: 'buggy',
  },
  // The Survey Buggy: the Trail Buggy with a vein scanner on a mast.
  survey: {
    name: 'Survey Buggy', price: 3000,
    hx: 0.75, hy: 0.3, hz: 1.35, bodyY: 0.62, ballastY: 0.1, mass: 720,
    wheels: [[0.86, 0.38, 1.0], [-0.86, 0.38, 1.0], [0.86, 0.38, -1.0], [-0.86, 0.38, -1.0]],
    wheelR: 0.42, suspRest: 0.4, travel: 0.34, stiffness: 20, compression: 2.4, relaxation: 1.8,
    slip: 2.4, sideStiff: 0.95, engine: 3800, brake: 20, topSpeed: 19, maxSteer: 0.6, steerFalloff: 0.07, antiRoll: 2.0, airControl: 1.0,
    bed: null, cargoKg: 0, cargoItems: 0, seat: [-0.3, 1.2, 0.1], door: [-1.5, 0, 0.1], fuelMax: 720, model: 'survey', scanner: true,
  },
  // Bigger bed, better handling.
  hauler2: {
    name: 'Hauler Mk II', price: 1800,
    hx: 1.0, hy: 0.42, hz: 2.3, bodyY: 0.78, ballastY: 0.1, mass: 2100,
    wheels: [[0.98, 0.42, 1.45], [-0.98, 0.42, 1.45], [0.98, 0.42, -1.4], [-0.98, 0.42, -1.4]],
    wheelR: 0.48, suspRest: 0.42, travel: 0.32, stiffness: 28, compression: 3.6, relaxation: 2.8,
    slip: 2.9, sideStiff: 1.1, engine: 11000, brake: 55, topSpeed: 18, maxSteer: 0.6, steerFalloff: 0.08, antiRoll: 2.8, airControl: 0.7,
    bed: { y: 1.24, x: 0.86, z0: -2.15, z1: 0.3 }, cargoKg: 3000, cargoItems: 90,
    seat: [-0.42, 1.55, 0.95], door: [-1.9, 0, 0.9], fuelMax: 1200, model: 'hauler2',
  },
  // Tracks (skid steer) and a bucket arm that cuts world-grid cells into a
  // 10-load hopper (BUILD_BRIEF 3.7).
  excavator: {
    name: 'Excavator', price: 6500,
    hx: 1.15, hy: 0.4, hz: 1.6, bodyY: 0.75, ballastY: 0.15, mass: 4200,
    wheels: [[1.05, 0.36, 1.1], [-1.05, 0.36, 1.1], [1.05, 0.36, 0], [-1.05, 0.36, 0], [1.05, 0.36, -1.1], [-1.05, 0.36, -1.1]],
    wheelR: 0.36, suspRest: 0.3, travel: 0.2, stiffness: 40, compression: 4.5, relaxation: 3.5,
    slip: 4.0, sideStiff: 1.4, engine: 16000, brake: 90, topSpeed: 5, maxSteer: 0, steerFalloff: 0, antiRoll: 3.5, airControl: 0.5,
    skid: true, turnRate: 0.9, bed: null, cargoKg: 0, cargoItems: 0, seat: [0.1, 1.9, 0.2], door: [-1.9, 0, 0.2], fuelMax: 1200, model: 'excavator', hopper: 10,
  },
  // The Ore Tram rides rails on a scripted spline: no physics body.
  tram: {
    name: 'Ore Tram', price: 400, kinematic: true,
    hx: 0.7, hy: 0.5, hz: 1.0, bodyY: 0.6, mass: 400, wheels: [], wheelR: 0.25, suspRest: 0,
    bed: { y: 0.48, x: 0.42, z0: -0.6, z1: 0.6 }, cargoKg: 600, cargoItems: 40, seat: [0, 1, 0], door: [-1.4, 0, 0], fuelMax: 0, model: 'tram', speed: 4,
  },
};
// How deep a vehicle can wade (m of water over the bed) before its engine
// starts to drown: past this it sputters along at a fifth of its power.
for (const [k, w] of Object.entries({ hauler: 0.95, hauler2: 1.05, buggy: 0.55, survey: 0.6, excavator: 1.3 })) if (VEHICLES[k]) VEHICLES[k].wade = w;
for (const v of Object.values(VEHICLES)) v.price = cheap(v.price);
export const FUEL_PER_SACK = 480; // about 8 minutes

const TEAL = 0x2a8a86, TEAL_DARK = 0x1f6a68, CREAM = 0xf0e4c4, IRON = 0x3a3e44, WOOD = 0xb07a44, WOOD_DARK = 0x8a5a30, BRASS = 0xc89a48, GLASS = 0x22343e, RUBBER = 0x24262a;
const P = (g, hex, j = 0.06, seed = 1) => paint(g.index ? g.toNonIndexed() : g, hex, j, seed);

// Swap one painted colour for another (keeps each face's jitter).
function recolor(g, fromHex, toHex) {
  const col = g.attributes.color, a = new THREE.Color(fromHex), b = new THREE.Color(toHex);
  for (let i = 0; i < col.count; i++) { const r = col.getX(i) / a.r; if (Math.abs(r - col.getY(i) / a.g) < 0.06 && Math.abs(r - col.getZ(i) / a.b) < 0.06 && r > 0.85 && r < 1.15) col.setXYZ(i, b.r * r, b.g * r, b.b * r); }
  return g;
}
function rod(a, b, r, hex, seg = 8) {
  const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b), d = B.clone().sub(A), len = d.length();
  const g = new THREE.CylinderGeometry(r, r, len, seg);
  g.applyMatrix4(new THREE.Matrix4().compose(A.clone().add(B).multiplyScalar(0.5), new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()), new THREE.Vector3(1, 1, 1)));
  return P(g, hex, 0.05);
}
export function vehicleBody(model) {
  if (model === 'hauler2') {
    // Brick-red Mk II with taller stake sides on the bed.
    const g = recolor(recolor(haulerBody(), TEAL, 0xa84a3a), TEAL_DARK, 0x86382c);
    const extra = [];
    for (const s of [-1, 1]) for (const z of [-2.1, -1.5, -0.9, -0.3, 0.25]) extra.push(P(place(new THREE.BoxGeometry(0.08, 0.5, 0.08), s * 0.97, 1.95, z), IRON, 0.04));
    for (const s of [-1, 1]) extra.push(P(place(new THREE.BoxGeometry(0.06, 0.08, 2.45), s * 0.97, 2.18, -0.93), WOOD, 0.08));
    extra.push(P(place(new THREE.BoxGeometry(1.95, 0.08, 0.06), 0, 2.18, -2.18), WOOD, 0.08));
    return merge([g, ...extra]);
  }
  if (model === 'buggy' || model === 'survey') return buggyBody(model === 'survey');
  if (model === 'excavator') return excavatorBody();
  if (model === 'tram') return tramBody();
  return haulerBody();
}

// The Trail Buggy: a tube frame with a roll cage, two bucket seats and a rear engine.
export function buggyBody(scanner = false) {
  const OCH = scanner ? 0x2a6a8a : 0xc8902c, parts = [];
  parts.push(P(place(new THREE.BoxGeometry(1.3, 0.08, 2.5), 0, 0.5, 0), IRON, 0.04));
  parts.push(P(place(bevelBox(1.2, 0.3, 0.8, 0.08), 0, 0.72, 1.05), OCH, 0.05, 2));
  parts.push(P(place(bevelBox(1.0, 0.45, 0.6, 0.06), 0, 0.8, -1.0), IRON, 0.06, 3));
  for (let i = 0; i < 4; i++) parts.push(P(place(new THREE.BoxGeometry(0.9, 0.04, 0.04), 0, 0.95 + i * 0.06, -1.32), 0x6a6e74, 0.04, 4 + i));
  for (const s of [-1, 1]) {
    parts.push(P(place(bevelBox(0.42, 0.12, 0.45, 0.04), s * 0.3, 0.62, 0.1), 0x5a3a24, 0.06, 10), P(place(bevelBox(0.42, 0.5, 0.1, 0.04), s * 0.3, 0.88, -0.14), 0x5a3a24, 0.06, 11));
    // Roll cage hoops and side bars.
    parts.push(rod([s * 0.62, 0.5, 0.55], [s * 0.55, 1.55, 0.2], 0.035, OCH), rod([s * 0.62, 0.5, -0.5], [s * 0.55, 1.55, -0.35], 0.035, OCH), rod([s * 0.55, 1.55, 0.2], [s * 0.55, 1.55, -0.35], 0.035, OCH));
    parts.push(rod([s * 0.65, 0.55, 1.4], [s * 0.65, 0.55, -1.25], 0.03, IRON));
    parts.push(P(place(new THREE.CylinderGeometry(0.48, 0.48, 0.3, 10, 1, true, -Math.PI / 2, Math.PI), s * 0.88, 0.72, 1.0, 0, 0, Math.PI / 2), OCH, 0.05, 12));
    parts.push(P(place(new THREE.CylinderGeometry(0.48, 0.48, 0.3, 10, 1, true, -Math.PI / 2, Math.PI), s * 0.88, 0.72, -1.0, 0, 0, Math.PI / 2), OCH, 0.05, 13));
    parts.push(P(place(new THREE.CylinderGeometry(0.09, 0.08, 0.1, 8), s * 0.4, 0.82, 1.48, Math.PI / 2), BRASS, 0.04));
  }
  parts.push(rod([-0.55, 1.55, 0.2], [0.55, 1.55, 0.2], 0.035, OCH), rod([-0.55, 1.55, -0.35], [0.55, 1.55, -0.35], 0.035, OCH));
  parts.push(rod([0, 0.75, 0.6], [0, 1.0, 0.35], 0.02, IRON), P(place(new THREE.TorusGeometry(0.15, 0.025, 6, 14), 0, 1.02, 0.33, -0.9), IRON, 0.04));
  parts.push(P(place(new THREE.BoxGeometry(1.3, 0.12, 0.12), 0, 0.6, 1.5), BRASS, 0.04));
  if (scanner) {
    parts.push(rod([0.45, 0.9, -0.9], [0.45, 2.1, -0.9], 0.03, IRON));
    parts.push(P(place(bevelBox(0.4, 0.3, 0.3, 0.04), -0.45, 1.0, -0.95), BRASS, 0.05, 30));
    parts.push(P(place(new THREE.BoxGeometry(0.3, 0.2, 0.02), 0, 1.05, 0.55, -0.5), 0x203a30, 0.02, 31));
  }
  return merge(parts);
}
// The scanner dish (spins on its mast).
export function scannerDish() {
  return merge([P(new THREE.SphereGeometry(0.28, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2.6).rotateX(Math.PI / 2), 0xd8d0b8, 0.05), P(place(new THREE.CylinderGeometry(0.02, 0.02, 0.3, 6), 0, 0, 0.12, Math.PI / 2), BRASS, 0.04)]);
}
// The Excavator: track frames, an ochre house with a cab, and a counterweight.
export function excavatorBody() {
  const OCH = 0xd8a030, parts = [];
  for (const s of [-1, 1]) {
    parts.push(P(place(bevelBox(0.5, 0.62, 3.3, 0.12), s * 1.05, 0.38, 0), 0x2a2c30, 0.06, 1 + s));
    for (let i = 0; i < 16; i++) parts.push(P(place(new THREE.BoxGeometry(0.54, 0.06, 0.1), s * 1.05, 0.7, -1.55 + i * 0.207), 0x1c1e22, 0.05, i));
    for (const z of [-1.4, 1.4]) parts.push(P(place(new THREE.CylinderGeometry(0.28, 0.28, 0.52, 10), s * 1.05, 0.38, z, 0, 0, Math.PI / 2), IRON, 0.05));
  }
  parts.push(P(place(new THREE.BoxGeometry(1.7, 0.3, 2.4), 0, 0.72, 0), IRON, 0.04));
  parts.push(P(place(new THREE.CylinderGeometry(0.75, 0.75, 0.2, 16), 0, 0.95, 0), 0x3a3e44, 0.04));
  parts.push(P(place(bevelBox(2.1, 0.8, 2.6, 0.1), 0, 1.45, -0.2), OCH, 0.05, 3));
  parts.push(P(place(bevelBox(2.0, 0.55, 0.5, 0.1), 0, 1.4, -1.55), 0x3a3e44, 0.05, 4));   // counterweight
  parts.push(P(place(bevelBox(0.95, 1.05, 1.1, 0.08), -0.5, 2.35, 0.45), OCH, 0.05, 5));   // cab
  parts.push(P(place(new THREE.BoxGeometry(0.85, 0.6, 0.03), -0.5, 2.45, 1.01), GLASS, 0.03, 6));
  parts.push(P(place(new THREE.BoxGeometry(0.03, 0.55, 0.85), -0.98, 2.45, 0.45), GLASS, 0.03, 7));
  parts.push(P(place(new THREE.CylinderGeometry(0.07, 0.08, 0.7, 8), 0.7, 2.15, -0.9), IRON, 0.05));
  parts.push(P(place(bevelBox(0.6, 0.5, 0.6, 0.05), 0.6, 2.1, -0.2), 0x6a6e74, 0.05, 8));   // hopper housing
  return merge(parts);
}
// The arm in three jointed parts (boom, stick, bucket), each built along +z
// from its pivot so game/vehicles.js can bend them.
export function excavatorArm() {
  const OCH = 0xd8a030;
  const boom = merge([P(place(bevelBox(0.3, 0.32, 2.4, 0.06), 0, 0, 1.2), OCH, 0.05, 1), P(place(new THREE.CylinderGeometry(0.08, 0.08, 1.4, 8), 0, -0.3, 0.8, 1.3), 0x9aa0a6, 0.04)]);
  const stick = merge([P(place(bevelBox(0.24, 0.26, 1.7, 0.05), 0, 0, 0.85), OCH, 0.05, 2)]);
  const bucket = merge([
    P(place(new THREE.CylinderGeometry(0.42, 0.42, 0.75, 10, 1, true, 0, Math.PI), 0, -0.2, 0.25, 0, 0, Math.PI / 2), 0x3a3e44, 0.06, 3),
    ...[-0.3, -0.1, 0.1, 0.3].map((x, i) => P(place(new THREE.ConeGeometry(0.05, 0.16, 4), x, -0.62, 0.3, Math.PI), 0x8a949c, 0.04, 4 + i)),
    P(place(new THREE.BoxGeometry(0.78, 0.42, 0.04), 0, -0.2, -0.17), 0x3a3e44, 0.06, 9),
  ]);
  return { boom, stick, bucket };
}
// The Ore Tram: a riveted steel tub on a four-wheel bogie.
export function tramBody() {
  const parts = [];
  parts.push(P(place(new THREE.BoxGeometry(1.1, 0.12, 1.6), 0, 0.3, 0), IRON, 0.04));
  for (const s of [-1, 1]) for (const z of [-0.55, 0.55]) parts.push(P(place(new THREE.CylinderGeometry(0.22, 0.22, 0.08, 12), s * 0.52, 0.22, z, 0, 0, Math.PI / 2), 0x6a6e74, 0.05));
  parts.push(P(place(new THREE.CylinderGeometry(0.75, 0.6, 1.5, 4, 1, true, Math.PI / 4), 0, 0.78, 0, 0, 0, 0, 1, 0.55, 1), 0x7a5a3a, 0.08, 2));
  parts.push(P(place(new THREE.BoxGeometry(1.0, 0.06, 1.42), 0, 0.42, 0), 0x6a4a2a, 0.06, 3));
  for (const s of [-1, 1]) parts.push(P(place(new THREE.BoxGeometry(1.08, 0.06, 0.06), 0, 1.18, s * 0.74), BRASS, 0.04), P(place(new THREE.BoxGeometry(0.06, 0.06, 1.5), s * 0.54, 1.18, 0), BRASS, 0.04));
  for (const s of [-1, 1]) parts.push(P(place(new THREE.BoxGeometry(0.2, 0.08, 0.12), 0, 0.3, s * 0.86), IRON, 0.04));
  return merge(parts);
}

// The Old Hauler: rounded teal cab, cream roof, slatted wooden bed, brass
// lamps and bumpers, a charcoal hopper on the side and a stubby stack.
export function haulerBody() {
  const parts = [];
  // Frame rails and floor pan.
  for (const s of [-1, 1]) parts.push(P(place(new THREE.BoxGeometry(0.14, 0.16, 4.5), s * 0.62, 0.62, -0.05), IRON));
  parts.push(P(place(new THREE.BoxGeometry(1.95, 0.08, 4.4), 0, 0.72, -0.05), IRON, 0.04));
  // Hood with a rounded nose (lathe-ish via scaled cylinder) and grille.
  parts.push(P(place(bevelBox(1.5, 0.62, 1.1, 0.12), 0, 1.06, 1.72), TEAL, 0.05, 2));
  parts.push(P(place(new THREE.CylinderGeometry(0.31, 0.31, 1.5, 12, 1, false, 0, Math.PI), 0, 1.06, 2.27, 0, 0, Math.PI / 2), TEAL, 0.05, 3));
  for (let i = 0; i < 7; i++) parts.push(P(place(new THREE.BoxGeometry(0.05, 0.42, 0.04), -0.3 + i * 0.1, 1.02, 2.58), BRASS, 0.04, i + 4));
  // Cab with cream roof and dark glass.
  parts.push(P(place(bevelBox(1.78, 1.05, 1.15, 0.1), 0, 1.38, 0.62), TEAL_DARK, 0.05, 5));
  parts.push(P(place(bevelBox(1.86, 0.12, 1.3, 0.05), 0, 1.96, 0.6), CREAM, 0.04, 6));
  parts.push(P(place(new THREE.BoxGeometry(1.5, 0.48, 0.04), 0, 1.6, 1.2), GLASS, 0.03, 7));            // windscreen
  for (const s of [-1, 1]) parts.push(P(place(new THREE.BoxGeometry(0.04, 0.42, 0.7), s * 0.9, 1.6, 0.62), GLASS, 0.03, 8)); // side windows
  parts.push(P(place(new THREE.BoxGeometry(1.4, 0.36, 0.04), 0, 1.6, 0.04), GLASS, 0.03, 9));            // back window
  // Fenders over the wheels.
  for (const [x, z] of [[0.98, 1.45], [-0.98, 1.45], [0.98, -1.4], [-0.98, -1.4]]) parts.push(P(place(new THREE.CylinderGeometry(0.58, 0.58, 0.32, 12, 1, true, -Math.PI / 2, Math.PI), x * 1.02, 0.9, z, 0, 0, Math.PI / 2), TEAL, 0.05, 10));
  // Running boards.
  for (const s of [-1, 1]) parts.push(P(place(new THREE.BoxGeometry(0.22, 0.05, 1.2), s * 1.05, 0.62, 0.05), IRON, 0.04));
  // Bed: slatted floor and plank sides with brass corner caps.
  for (let i = 0; i < 9; i++) parts.push(P(place(new THREE.BoxGeometry(0.2, 0.06, 2.45), -0.84 + i * 0.21, 1.2, -0.93), i % 2 ? WOOD : WOOD_DARK, 0.1, i + 20));
  for (const s of [-1, 1]) for (let k = 0; k < 3; k++) parts.push(P(place(new THREE.BoxGeometry(0.06, 0.13, 2.5), s * 0.95, 1.32 + k * 0.15, -0.93), k % 2 ? WOOD_DARK : WOOD, 0.1, k + 30 + s));
  for (let k = 0; k < 3; k++) parts.push(P(place(new THREE.BoxGeometry(1.96, 0.13, 0.06), 0, 1.32 + k * 0.15, -2.18), k % 2 ? WOOD_DARK : WOOD, 0.1, k + 40));
  for (const [x, z] of [[0.95, -2.18], [-0.95, -2.18], [0.95, 0.3], [-0.95, 0.3]]) parts.push(P(place(new THREE.BoxGeometry(0.1, 0.5, 0.1), x, 1.45, z), BRASS, 0.04));
  // Bumpers, lamps, hopper, stack.
  parts.push(P(place(new THREE.BoxGeometry(2.0, 0.14, 0.14), 0, 0.76, 2.62), BRASS, 0.04));
  parts.push(P(place(new THREE.BoxGeometry(2.0, 0.14, 0.14), 0, 0.76, -2.28), BRASS, 0.04));
  for (const s of [-1, 1]) {
    parts.push(P(place(new THREE.CylinderGeometry(0.13, 0.11, 0.16, 10), s * 0.62, 1.42, 2.25, Math.PI / 2), BRASS, 0.04));
    parts.push(P(place(new THREE.CircleGeometry(0.1, 10), s * 0.62, 1.42, 2.335), 0xfff2c0, 0.02));
  }
  parts.push(P(place(bevelBox(0.34, 0.5, 0.5, 0.04), 1.12, 1.15, -0.05), IRON, 0.05, 50));            // charcoal hopper
  parts.push(P(place(new THREE.BoxGeometry(0.38, 0.05, 0.54), 1.12, 1.42, -0.05), BRASS, 0.04));
  parts.push(P(place(new THREE.CylinderGeometry(0.06, 0.07, 0.9, 8), -0.82, 2.2, 0.15), IRON, 0.05));     // stack
  parts.push(P(place(new THREE.CylinderGeometry(0.085, 0.06, 0.08, 8), -0.82, 2.67, 0.15), BRASS, 0.04));
  return merge(parts);
}
// A wheel: polygonal tyre with tread blocks, cream hub and lug nuts. Axle along x.
export function wheel(r = 0.46) {
  const w = 0.3, parts = [];
  const prof = [[r * 0.62, -w / 2], [r * 0.92, -w / 2], [r, -w * 0.35], [r, w * 0.35], [r * 0.92, w / 2], [r * 0.62, w / 2]];
  parts.push(P(new THREE.LatheGeometry(prof.map(([a, b]) => new THREE.Vector2(a, b)), 14).rotateZ(Math.PI / 2), RUBBER, 0.08));
  for (let i = 0; i < 14; i++) { const a = (i / 14) * Math.PI * 2; parts.push(P(place(new THREE.BoxGeometry(w * 0.8, 0.05, 0.1), 0, Math.cos(a) * r, Math.sin(a) * r, a), 0x1c1e22, 0.05, i)); }
  parts.push(P(new THREE.CylinderGeometry(r * 0.62, r * 0.62, w * 0.82, 12).rotateZ(Math.PI / 2), CREAM, 0.05, 3));
  parts.push(P(new THREE.CylinderGeometry(r * 0.2, r * 0.24, w * 0.95, 8).rotateZ(Math.PI / 2), BRASS, 0.04, 4));
  for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 2; parts.push(P(place(new THREE.CylinderGeometry(0.025, 0.025, w * 0.9, 6), 0, Math.cos(a) * r * 0.38, Math.sin(a) * r * 0.38, 0, 0, Math.PI / 2), IRON, 0.04)); }
  return merge(parts);
}
// A sack of charcoal (fuel).
export function sack() {
  const g = new THREE.CylinderGeometry(0.2, 0.24, 0.5, 9, 3);
  const p = g.attributes.position; for (let i = 0; i < p.count; i++) { const y = p.getY(i); const f = 1 + Math.sin(i * 1.7) * 0.04 - Math.max(0, y - 0.15) * 1.2; p.setX(i, p.getX(i) * f); p.setZ(i, p.getZ(i) * f); }
  return merge([P(g, 0xb89a6a, 0.12, 2), P(place(new THREE.TorusGeometry(0.09, 0.02, 4, 10), 0, 0.26, 0, Math.PI / 2), 0x8a6a3a, 0.08)]);
}
