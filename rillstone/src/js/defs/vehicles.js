// Vehicle definitions (BUILD_BRIEF 3.7). Chassis space: +z forward, +y up.
import * as THREE from 'three';
import { paint, merge, place, bevelBox } from '../render/geom.js';

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
  },
};
export const FUEL_PER_SACK = 480; // about 8 minutes

const TEAL = 0x2a8a86, TEAL_DARK = 0x1f6a68, CREAM = 0xf0e4c4, IRON = 0x3a3e44, WOOD = 0xb07a44, WOOD_DARK = 0x8a5a30, BRASS = 0xc89a48, GLASS = 0x22343e, RUBBER = 0x24262a;
const P = (g, hex, j = 0.06, seed = 1) => paint(g.index ? g.toNonIndexed() : g, hex, j, seed);

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
