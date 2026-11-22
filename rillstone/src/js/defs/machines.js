// Machine definitions (BUILD_BRIEF 3.5): footprint, colliders, sockets, flow
// role and a detailed low-poly model. Local frame: origin at the ground in
// the middle of the footprint, +z is the front (where things come out), +y up.
// Sockets: water ports join pipes; 'in'/'out' ports pass gravel loads and items.
import * as THREE from 'three';
import { paint, merge, place, bevelBox } from '../render/geom.js';

const TEAL = 0x2a8a86, OCHRE = 0xc8902c, BRICK = 0xa84a3a, VIOLET = 0x6e56a8;
const BRASS = 0xc89a48, COPPER = 0xc0704a, STEEL = 0x8a949c, DARK = 0x3a3e44, WOOD = 0xb07a44, WOOD_D = 0x8a5a30, STONE = 0x9a948a, CREAM = 0xf0e4c4;
export const FAMILY = { water: TEAL, extraction: OCHRE, heat: BRICK, logic: VIOLET };
const P = (g, hex, j = 0.06, seed = 1) => paint(g.index ? g.toNonIndexed() : g, hex, j, seed);
const box = (w, h, d, x, y, z, hex, j, s) => P(place(new THREE.BoxGeometry(w, h, d), x, y, z), hex, j, s);
const bbox = (w, h, d, x, y, z, hex, b = 0.03, s = 1) => P(place(bevelBox(w, h, d, b), x, y, z), hex, 0.05, s);
const cyl = (r0, r1, h, x, y, z, hex, rx = 0, rz = 0, seg = 12, s = 1) => P(place(new THREE.CylinderGeometry(r1, r0, h, seg), x, y, z, rx, 0, rz), hex, 0.05, s);
function rod(a, b, r, hex, seg = 8) {
  const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b), d = B.clone().sub(A), len = d.length();
  const g = new THREE.CylinderGeometry(r, r, len, seg);
  g.applyMatrix4(new THREE.Matrix4().compose(A.clone().add(B).multiplyScalar(0.5), new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()), new THREE.Vector3(1, 1, 1)));
  return P(g, hex, 0.05);
}
const flange = (x, y, z, axis, hex = BRASS) => cyl(0.13, 0.13, 0.05, x, y, z, hex, axis === 'z' ? Math.PI / 2 : 0, axis === 'x' ? Math.PI / 2 : 0, 10);
const PIPE_Y = 0.4; // every water port sits 0.4 m above the machine's base
// Brass pressure gauge / wear dial face (the needle is a separate animated mesh).
const dial = (x, y, z) => [cyl(0.07, 0.07, 0.03, x, y, z, BRASS, Math.PI / 2, 0, 12), cyl(0.06, 0.06, 0.032, x, y, z + 0.002, CREAM, Math.PI / 2, 0, 12)];

// ---- Pipes ----
// Pipes are laid as runs between two water ports (see game/machines.js); a
// junction joins up to four runs. Capacity per tier (BUILD_BRIEF 3.5).
function pipeRun(ax, az, bx, bz, r, hex) { return rod([ax, PIPE_Y, az], [bx, PIPE_Y, bz], r, hex, 10); }
export const PIPE_TIERS = { copper: { name: 'Copper', cap: 60, hex: COPPER, r: 0.07 }, steel: { name: 'Steel', cap: 140, hex: 0x7a848c, r: 0.08 }, glimmer: { name: 'Glimmer', cap: 300, hex: 0x7a6ae0, r: 0.09 } };
export const MACHINES = {
  junction: { name: 'Pipe Junction', family: 'water', role: 'pipe', cap: 300, cell: [2, 2],
    boxes: [[0, PIPE_Y, 0, 0.2, 0.2, 0.2]],
    sockets: [[0, 1], [1, 0], [0, -1], [-1, 0]].map(([x, z]) => ({ kind: 'water', p: [x * 0.35, PIPE_Y, z * 0.35], d: [x, 0, z] })),
    build: () => merge([
      P(place(new THREE.SphereGeometry(0.15, 12, 8), 0, PIPE_Y, 0), BRASS), ...[[0, 1], [1, 0], [0, -1], [-1, 0]].map(([x, z]) => [pipeRun(0, 0, x * 0.32, z * 0.32, 0.08, COPPER), flange(x * 0.32, PIPE_Y, z * 0.32, x ? 'x' : 'z')]).flat(),
      rod([0, 0, 0], [0, PIPE_Y - 0.1, 0], 0.04, DARK), box(0.25, 0.05, 0.25, 0, 0.025, 0, DARK, 0.04, 2)
    ]) },
  // ---- Water sources and conditioning ----
  intake1: { name: 'River Intake Mk I', family: 'water', role: 'source', flow: 40, tier: 1, cell: [2, 2],
    needsWater: [0, 0.2, -0.7], // the mouth must be in the river
    boxes: [[0, 0.55, 0, 0.45, 0.55, 0.6]], sockets: [{ kind: 'water', p: [0, PIPE_Y, 1.0], d: [0, 0, 1] }],
    build: () => merge([
      bbox(0.9, 1.0, 1.1, 0, 0.55, 0.05, TEAL, 0.05, 1), bbox(0.96, 0.08, 1.16, 0, 1.08, 0.05, BRASS, 0.02, 2),
      box(0.7, 0.5, 0.06, 0, 0.35, -0.53, DARK, 0.04, 3), ...[0, 1, 2, 3, 4].map(i => box(0.04, 0.5, 0.08, -0.28 + i * 0.14, 0.35, -0.55, BRASS, 0.03, 4 + i)),
      cyl(0.08, 0.08, 0.25, 0, 1.25, 0.05, DARK), P(place(new THREE.TorusGeometry(0.16, 0.025, 6, 16), 0, 1.38, 0.05, Math.PI / 2), BRASS),
      ...[0, 1, 2].map(i => rod([0, 1.38, 0.05], [Math.cos(i * 2.09) * 0.16, 1.38, 0.05 + Math.sin(i * 2.09) * 0.16], 0.012, BRASS)),
      pipeRun(0, 0.55, 0, 1.0, 0.075, COPPER), flange(0, PIPE_Y, 0.97, 'z'), ...dial(0.3, 0.8, 0.61),
    ]) },
  headtank: { name: 'Header Tank', family: 'water', role: 'tank', tankCap: 2000, cell: [2, 2],
    boxes: [[0, 1.2, 0, 0.6, 1.2, 0.6]], sockets: [{ kind: 'water', p: [0, PIPE_Y, 0.9], d: [0, 0, 1] }, { kind: 'water', p: [0, PIPE_Y, -0.9], d: [0, 0, -1] }],
    build: () => merge([
      ...[[-0.45, -0.45], [0.45, -0.45], [-0.45, 0.45], [0.45, 0.45]].map(([x, z]) => rod([x, 0, z], [x * 0.9, 1.0, z * 0.9], 0.04, DARK)),
      cyl(0.62, 0.62, 1.3, 0, 1.6, 0, TEAL, 0, 0, 16), ...[1.05, 1.6, 2.15].map((y, i) => cyl(0.64, 0.64, 0.05, 0, y, 0, BRASS, 0, 0, 16, i)),
      P(place(new THREE.ConeGeometry(0.64, 0.3, 16), 0, 2.4, 0), DARK), rod([0, 1.0, 0], [0, PIPE_Y, 0.0], 0.07, COPPER),
      pipeRun(0, -0.9, 0, 0.9, 0.075, COPPER), flange(0, PIPE_Y, 0.87, 'z'), flange(0, PIPE_Y, -0.87, 'z'), box(0.06, 1.1, 0.06, 0.63, 1.6, 0, CREAM, 0.02),
    ]) },
  settle: { name: 'Settling Tank', family: 'water', role: 'settle', cell: [2, 4],
    boxes: [[0, 0.45, 0, 0.55, 0.45, 1.0]], sockets: [{ kind: 'water', p: [0, PIPE_Y, -1.3], d: [0, 0, -1] }, { kind: 'water', p: [0, PIPE_Y, 1.3], d: [0, 0, 1] }],
    build: () => merge([
      bbox(1.1, 0.8, 2.0, 0, 0.42, 0, TEAL, 0.05, 1), box(0.96, 0.05, 1.86, 0, 0.8, 0, 0x2f6f74, 0.1, 2),
      ...[-0.5, 0, 0.5].map((z, i) => box(1.0, 0.12, 0.05, 0, 0.82, z, BRASS, 0.03, 3 + i)),
      pipeRun(0, -1.3, 0, -1.0, 0.075, COPPER), pipeRun(0, 1.0, 0, 1.3, 0.075, COPPER), flange(0, PIPE_Y, -1.27, 'z'), flange(0, PIPE_Y, 1.27, 'z'),
      cyl(0.06, 0.06, 0.2, 0.45, 0.15, 0.9, BRASS, 0, Math.PI / 2),
    ]) },
  booster: { name: 'Booster Pump', family: 'water', role: 'booster', fuelPerSec: 1 / 60, cell: [2, 2],
    boxes: [[0, 0.5, 0, 0.5, 0.5, 0.5]], sockets: [{ kind: 'water', p: [0, PIPE_Y, -0.9], d: [0, 0, -1] }, { kind: 'water', p: [0, PIPE_Y, 0.9], d: [0, 0, 1] }], accepts: 'quartz',
    build: () => merge([
      bbox(0.8, 0.7, 0.8, 0, 0.4, 0, TEAL, 0.05, 1), cyl(0.3, 0.3, 0.5, 0, 0.55, 0, BRASS, 0, Math.PI / 2, 14, 2),
      bbox(0.36, 0.36, 0.36, -0.2, 0.95, -0.1, DARK, 0.03, 3), box(0.4, 0.04, 0.4, -0.2, 1.15, -0.1, BRASS, 0.03, 4),
      pipeRun(0, -0.9, 0, 0.9, 0.08, COPPER), flange(0, PIPE_Y, -0.87, 'z'), flange(0, PIPE_Y, 0.87, 'z'), ...dial(0.3, 0.75, 0.41),
    ]), spin: { at: [0.42, 0.55, 0], axis: 'x', r: 0.28 } },
  // ---- Extraction and washing ----
  drill1: { name: 'Drill Mk I', family: 'extraction', role: 'consumer', demand: 20, tier: 1, period: 5, cell: [2, 2], needsClaim: true, tipDepth: 3.6,
    boxes: [[0, 1.1, 0, 0.45, 1.1, 0.45]], sockets: [{ kind: 'water', p: [-0.9, PIPE_Y, 0], d: [-1, 0, 0] }, { kind: 'out', p: [0.95, 0.75, 0], d: [1, 0, 0] }],
    build: () => merge([
      ...[[-0.42, -0.42], [0.42, -0.42], [-0.42, 0.42], [0.42, 0.42]].map(([x, z]) => rod([x, 0, z], [x * 0.35, 2.1, z * 0.35], 0.035, DARK)),
      ...[0.7, 1.4].map(y => { const k = 1 - y / 2.1 * 0.65; return [rod([-0.42 * k, y, -0.42 * k], [0.42 * k, y, -0.42 * k], 0.02, DARK), rod([-0.42 * k, y, 0.42 * k], [0.42 * k, y, 0.42 * k], 0.02, DARK), rod([-0.42 * k, y, -0.42 * k], [-0.42 * k, y, 0.42 * k], 0.02, DARK), rod([0.42 * k, y, -0.42 * k], [0.42 * k, y, 0.42 * k], 0.02, DARK)]; }).flat(),
      bbox(0.5, 0.55, 0.5, 0, 1.75, 0, OCHRE, 0.05, 2), box(0.54, 0.06, 0.54, 0, 2.05, 0, BRASS, 0.03, 3), cyl(0.09, 0.09, 0.25, 0, 2.2, 0, DARK),
      bbox(0.6, 0.18, 0.6, 0, 0.09, 0, DARK, 0.03, 4),
      // Spout: a chute out to the side that drops gravel loads.
      P(place(new THREE.BoxGeometry(0.62, 0.06, 0.3), 0.62, 0.92, 0, 0, 0, -0.35), STEEL), box(0.62, 0.15, 0.03, 0.62, 0.98, 0.14, STEEL, 0.03, 5), box(0.62, 0.15, 0.03, 0.62, 0.98, -0.14, STEEL, 0.03, 6),
      pipeRun(-0.9, 0, -0.3, 0, 0.075, COPPER), flange(-0.87, PIPE_Y, 0, 'x'), ...dial(0, 1.75, 0.26),
    ]), spin: { at: [0, 0.6, 0], axis: 'y', r: 0.1, len: 1.2, rod: true } },
  sluice1: { name: 'Sluice Box Mk I', family: 'water', role: 'consumer', demand: 15, tier: 1, period: 4, hopper: 10, cell: [2, 6],
    boxes: [[0, 0.6, 0, 0.45, 0.6, 1.5]], sockets: [{ kind: 'water', p: [0.9, PIPE_Y, -1.0], d: [1, 0, 0] }, { kind: 'in', p: [0, 1.25, -1.2], d: [0, 1, 0] }, { kind: 'out', p: [0, 0.35, 1.65], d: [0, 0, 1] }],
    build: () => {
      const parts = [];
      // Trough sloping down toward +z on four legs.
      const tilt = 0.12;
      const trough = (g, hex, s) => { g.applyMatrix4(new THREE.Matrix4().makeRotationX(tilt)); g.translate(0, 0.7, 0.05); parts.push(P(g, hex, 0.08, s)); };
      trough(new THREE.BoxGeometry(0.8, 0.05, 2.9), WOOD, 1);
      for (const s of [-1, 1]) trough(new THREE.BoxGeometry(0.05, 0.25, 2.9).translate(s * 0.4, 0.12, 0), WOOD_D, 2 + s);
      for (let i = 0; i < 9; i++) trough(new THREE.BoxGeometry(0.74, 0.04, 0.04).translate(0, 0.045, -1.2 + i * 0.3), BRASS, 5 + i);
      for (const [x, z, h] of [[-0.38, -1.3, 1.0], [0.38, -1.3, 1.0], [-0.38, 1.3, 0.55], [0.38, 1.3, 0.55]]) parts.push(rod([x, 0, z], [x, h, z], 0.035, WOOD_D));
      // Hopper on top of the head, water header pipe across it.
      parts.push(P(place(new THREE.CylinderGeometry(0.42, 0.18, 0.45, 4, 1, true), 0, 1.12, -1.2, 0, Math.PI / 4, 0), TEAL, 0.05, 20));
      parts.push(bbox(0.86, 0.1, 0.5, 0, 0.86, -1.2, TEAL, 0.02, 21));
      parts.push(pipeRun(0.9, -1.0, -0.35, -1.0, 0.07, COPPER), flange(0.87, PIPE_Y, -1.0, 'x'), rod([-0.35, PIPE_Y, -1.0], [-0.35, 0.95, -1.0], 0.06, COPPER));
      parts.push(...dial(0.44, 1.0, -0.95));
      return merge(parts);
    }, sheet: { y: 0.78, z0: -1.25, z1: 1.4, w: 0.72, tilt: 0.12 } },
  // ---- Heat ----
  kiln: { name: 'Kiln', family: 'heat', role: 'none', cell: [3, 3], meltRate: 10 / 8, capKg: 50, fuelPerSec: 1 / 60, accepts: 'ore+quartz',
    boxes: [[0, 0.8, 0, 0.7, 0.8, 0.7]], sockets: [{ kind: 'out', p: [0, 0.55, 1.0], d: [0, 0, 1] }],
    build: () => merge([
      bbox(1.4, 0.3, 1.4, 0, 0.15, 0, STONE, 0.04, 1),
      P(place(new THREE.SphereGeometry(0.72, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), 0, 0.3, 0, 0, 0, 0, 1, 1.4, 1), BRICK, 0.15, 2),
      ...[0, 1, 2, 3, 4, 5].map(i => box(0.16, 0.08, 0.1, Math.cos(i * 1.05) * 0.7, 0.32 + (i % 2) * 0.08, Math.sin(i * 1.05) * 0.7, 0x8a3a2a, 0.1, 10 + i)),
      bbox(0.5, 0.5, 0.08, 0, 0.6, 0.66, DARK, 0.03, 3), box(0.18, 0.06, 0.06, 0, 0.62, 0.72, BRASS, 0.03, 4),
      cyl(0.16, 0.12, 0.7, 0, 1.55, -0.2, STONE, 0, 0, 10, 5), cyl(0.18, 0.18, 0.06, 0, 1.92, -0.2, DARK),
      // Pour spout and a mould tray in front.
      P(place(new THREE.BoxGeometry(0.12, 0.06, 0.4), 0, 0.62, 0.88, 0.3), DARK), bbox(0.5, 0.12, 0.3, 0, 0.36, 1.05, DARK, 0.02, 6),
      rod([0.55, 0.3, 0.6], [0.55, 0.95, 0.75], 0.025, DARK), P(place(new THREE.SphereGeometry(0.05, 8, 6), 0.55, 0.98, 0.76), BRASS),
    ]), glow: { at: [0, 0.6, 0.71], w: 0.4, h: 0.4 } },
  crucible: { name: 'Crucible & Campfire', family: 'heat', role: 'none', cell: [2, 2], meltRate: 10 / 16, capKg: 10, accepts: 'ore',
    boxes: [[0, 0.4, 0, 0.45, 0.4, 0.45]], sockets: [{ kind: 'out', p: [0, 0.3, 0.7], d: [0, 0, 1] }],
    build: () => merge([
      ...[...Array(8)].map((_, i) => P(place(new THREE.DodecahedronGeometry(0.1, 0), Math.cos(i * 0.785) * 0.35, 0.06, Math.sin(i * 0.785) * 0.35), STONE, 0.15, i)),
      ...[0, 1, 2].map(i => rod([Math.cos(i * 2.09) * 0.45, 0, Math.sin(i * 2.09) * 0.45], [0, 0.95, 0], 0.02, DARK)),
      rod([0, 0.95, 0], [0, 0.6, 0], 0.008, DARK),
      P(place(new THREE.CylinderGeometry(0.16, 0.12, 0.22, 10), 0, 0.5, 0), 0x6a5a50, 0.1, 9),
      ...[0, 1, 2].map(i => P(place(new THREE.CylinderGeometry(0.03, 0.03, 0.4, 5), Math.cos(i) * 0.1, 0.08, Math.sin(i) * 0.1, Math.PI / 2, i, 0), WOOD_D, 0.1, i)),
      bbox(0.36, 0.08, 0.2, 0, 0.04, 0.6, DARK, 0.02, 12),
    ]), glow: { at: [0, 0.12, 0], w: 0.3, h: 0.2, fire: true } },
  workbench: { name: 'Workbench', family: 'heat', role: 'none', cell: [4, 2], accepts: 'ingot+gem',
    boxes: [[0, 0.5, 0, 0.95, 0.5, 0.45]], sockets: [],
    build: () => merge([
      bbox(1.9, 0.1, 0.9, 0, 0.92, 0, WOOD, 0.02, 1), ...[[-0.85, -0.38], [0.85, -0.38], [-0.85, 0.38], [0.85, 0.38]].map(([x, z]) => box(0.1, 0.88, 0.1, x, 0.44, z, WOOD_D, 0.05, 2)),
      box(1.7, 0.06, 0.7, 0, 0.25, 0, WOOD_D, 0.05, 3),
      bbox(0.36, 0.14, 0.18, -0.5, 1.04, 0, DARK, 0.03, 4), P(place(new THREE.ConeGeometry(0.07, 0.2, 6), -0.25, 1.06, 0, 0, 0, -Math.PI / 2), DARK), box(0.2, 0.14, 0.14, -0.5, 1.13, 0, 0x4a4e54, 0.03, 5),
      bbox(0.2, 0.18, 0.12, 0.6, 1.06, 0.3, STEEL, 0.02, 6), rod([0.5, 1.12, 0.38], [0.7, 1.12, 0.38], 0.012, STEEL),
      box(0.3, 0.02, 0.2, 0.2, 0.98, -0.2, 0x5a4a3a, 0.05, 7),
    ]) },
  grinder: { name: 'Grinding Wheel', family: 'heat', role: 'none', cell: [2, 2], accepts: 'gem',
    boxes: [[0, 0.5, 0, 0.35, 0.5, 0.35]], sockets: [],
    build: () => merge([
      ...[-0.25, 0.25].map(x => [rod([x, 0, -0.25], [x, 0.85, 0], 0.03, WOOD_D), rod([x, 0, 0.25], [x, 0.85, 0], 0.03, WOOD_D)]).flat(),
      rod([-0.32, 0.85, 0], [0.32, 0.85, 0], 0.02, DARK), box(0.6, 0.04, 0.3, 0, 0.12, 0.25, WOOD_D, 0.05, 2),
      box(0.16, 0.04, 0.3, 0, 0.6, 0.38, WOOD, 0.05, 3),
    ]), spin: { at: [0, 0.85, 0], axis: 'x', r: 0.3, stone: true } },
};

// The model for a machine's spinning part (drill rod, flywheel, grinding stone).
export function spinPart(def) {
  const s = def.spin; if (!s) return null;
  if (s.wheel) { // a wooden water wheel with paddles; axle along x
    // The Pumphouse's reward wheel is gold-plated (s.gold).
    const RIM = s.gold ? 0xd8a420 : WOOD_D, PADDLE = s.gold ? 0xf0c040 : WOOD;
    const parts = [P(new THREE.TorusGeometry(s.r, 0.06, 6, 20).rotateY(Math.PI / 2).translate(0.2, 0, 0), RIM, 0.08), P(new THREE.TorusGeometry(s.r, 0.06, 6, 20).rotateY(Math.PI / 2).translate(-0.2, 0, 0), RIM, 0.08)];
    for (let i = 0; i < 12; i++) { const a = i * Math.PI / 6; parts.push(P(place(new THREE.BoxGeometry(0.5, 0.04, 0.36), 0, Math.cos(a) * s.r, Math.sin(a) * s.r, a), PADDLE, 0.1, i)); parts.push(rod([0, 0, 0], [0, Math.cos(a) * s.r, Math.sin(a) * s.r], 0.03, RIM)); }
    parts.push(P(new THREE.CylinderGeometry(0.12, 0.12, 0.5, 10).rotateZ(Math.PI / 2), DARK, 0.05));
    const g = merge(parts); g.rotateY(Math.PI / 2); return g;
  }
  if (s.drum) { const g = merge([P(new THREE.CylinderGeometry(s.r, s.r, 1.8, 12, 1, true).rotateX(Math.PI / 2), 0x7a848c, 0.1), ...[-0.8, 0, 0.8].map((z, i) => P(new THREE.TorusGeometry(s.r, 0.03, 4, 14).translate(0, 0, z), BRASS, 0.04, i))]); g.rotateX(s.tilt || 0); return g; }
  if (s.rod) return merge([P(new THREE.CylinderGeometry(0.06, 0.06, s.len, 8), STEEL, 0.06), ...[0, 1, 2].map(i => P(place(new THREE.BoxGeometry(0.16, 0.03, 0.03), 0, -s.len / 2 + 0.2 + i * 0.35, 0, 0, i, 0.4), BRASS, 0.04, i))]);
  const g = new THREE.CylinderGeometry(s.r, s.r, s.stone ? 0.1 : 0.06, 18).rotateZ(Math.PI / 2);
  const parts = [P(g, s.stone ? 0xb8b0a0 : BRASS, 0.08)];
  if (!s.stone) for (let i = 0; i < 6; i++) parts.push(P(place(new THREE.BoxGeometry(0.07, s.r * 1.8, 0.03), 0, 0, 0, i * 0.52, 0, 0), DARK, 0.04, i));
  return merge(parts);
}
// The wear dial's needle.
export function needle() { return merge([P(new THREE.BoxGeometry(0.008, 0.05, 0.006).translate(0, 0.022, 0), BRICK, 0.02)]); }
export const machineName = (id) => MACHINES[id]?.name || id;
