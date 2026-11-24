// More machines, filling the gaps a water-automation sandbox needs (our own
// names and models): a water-driven sorting hopper, a gem press that fuses
// cut gems into one bigger stone, a belt saw, a funnel, a disposal chute and
// a mender that repairs machines on a signal. Same conventions as
// defs/machines.js: origin at the ground in the middle of the footprint, +z
// is the front, water ports at 0.4 m.
import * as THREE from 'three';
import { paint, merge, place, bevelBox } from '../render/geom.js';
import { MACHINES2 } from './machines2.js';

const TEAL = 0x2a8a86, OCHRE = 0xc8902c, BRICK = 0xa84a3a, VIOLET = 0x6e56a8;
const BRASS = 0xc89a48, COPPER = 0xc0704a, STEEL = 0x8a949c, DARK = 0x3a3e44, WOOD = 0xb07a44, WOOD_D = 0x8a5a30, CREAM = 0xf0e4c4, GLASS = 0x8ab8c0;
const P = (g, hex, j = 0.06, seed = 1) => paint(g.index ? g.toNonIndexed() : g, hex, j, seed);
const box = (w, h, d, x, y, z, hex, j = 0.06, s = 1) => P(place(new THREE.BoxGeometry(w, h, d), x, y, z), hex, j, s);
const bbox = (w, h, d, x, y, z, hex, b = 0.03, s = 1) => P(place(bevelBox(w, h, d, b), x, y, z), hex, 0.05, s);
const cyl = (r0, r1, h, x, y, z, hex, rx = 0, rz = 0, seg = 12, s = 1) => P(place(new THREE.CylinderGeometry(r1, r0, h, seg), x, y, z, rx, 0, rz), hex, 0.05, s);
function rod(a, b, r, hex, seg = 8) {
  const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b), d = B.clone().sub(A), len = d.length();
  const g = new THREE.CylinderGeometry(r, r, len, seg);
  g.applyMatrix4(new THREE.Matrix4().compose(A.clone().add(B).multiplyScalar(0.5), new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()), new THREE.Vector3(1, 1, 1)));
  return P(g, hex, 0.05);
}
const PIPE_Y = 0.4, BY = 0.55;
const flange = (x, y, z, axis) => cyl(0.13, 0.13, 0.05, x, y, z, BRASS, axis === 'z' ? Math.PI / 2 : 0, axis === 'x' ? Math.PI / 2 : 0, 10);
const legs = (hw, hd, h, hex = DARK, r = 0.035) => [[-hw, -hd], [hw, -hd], [-hw, hd], [hw, hd]].map(([x, z]) => rod([x, 0, z], [x, h, z], r, hex));
// An open hopper mouth: a four-sided funnel, wide at the top.
const mouth = (rTop, rBot, h, x, y, z, hex, s = 1) => P(place(new THREE.CylinderGeometry(rTop, rBot, h, 4, 1, true), x, y, z, 0, Math.PI / 4, 0), hex, 0.05, s);
const sig = (x, y, z) => cyl(0.035, 0.035, 0.05, x, y, z, BRASS, 0, Math.PI / 2, 8);

export const MACHINES4 = {
  // Pour mixed finds in the top: whatever matches the sample on the tray
  // drops out of the side chute, everything else out of the front. Needs
  // a little water to run its shaker.
  sorthopper: { name: 'Sorting Hopper', family: 'extraction', role: 'consumer', demand: 5, period: 0.5, cell: [2, 2], sorter: true, noWear: true,
    boxes: [[0, 0.55, 0, 0.42, 0.55, 0.42]],
    sockets: [{ kind: 'water', p: [-0.75, PIPE_Y, 0], d: [-1, 0, 0] }, { kind: 'in', p: [0, 1.35, 0], d: [0, 1, 0] }, { kind: 'out', p: [0, 0.45, 0.72], d: [0, 0, 1] }, { kind: 'out', p: [0.72, 0.3, 0], d: [1, 0, 0] }],
    build: () => merge([
      ...legs(0.36, 0.36, 0.4, WOOD_D, 0.04),
      bbox(0.84, 0.55, 0.84, 0, 0.67, 0, OCHRE, 0.04, 1),
      mouth(0.55, 0.36, 0.38, 0, 1.13, 0, STEEL, 2), box(0.8, 0.04, 0.8, 0, 0.95, 0, DARK, 0.04, 3),
      // Front chute (the rest) and side chute (the matches).
      P(place(new THREE.BoxGeometry(0.34, 0.04, 0.4), 0, 0.5, 0.6, 0.45, 0, 0), STEEL), box(0.03, 0.12, 0.4, 0.17, 0.55, 0.6, STEEL, 0.03, 4), box(0.03, 0.12, 0.4, -0.17, 0.55, 0.6, STEEL, 0.03, 5),
      P(place(new THREE.BoxGeometry(0.4, 0.04, 0.34), 0.6, 0.36, 0, 0, 0, -0.45), BRASS), box(0.4, 0.12, 0.03, 0.6, 0.4, 0.17, BRASS, 0.03, 6), box(0.4, 0.12, 0.03, 0.6, 0.4, -0.17, BRASS, 0.03, 7),
      // The sample tray on the front face.
      box(0.32, 0.03, 0.18, 0, 0.88, 0.48, CREAM, 0.03, 8), box(0.34, 0.06, 0.02, 0, 0.9, 0.57, BRASS, 0.03, 9),
      rod([-0.75, PIPE_Y, 0], [-0.42, PIPE_Y, 0], 0.07, COPPER), flange(-0.72, PIPE_Y, 0, 'x'),
    ]) },

  // Cut gems of one kind go in; when the press runs it fuses them into one
  // bigger stone (bigger gems are worth more per kilo).
  gempress: { name: 'Gem Press', family: 'extraction', role: 'consumer', demand: 15, period: 6, cell: [2, 2], press: true, capGems: 12, noWear: true,
    boxes: [[0, 0.75, 0, 0.42, 0.75, 0.42]],
    sockets: [{ kind: 'water', p: [-0.75, PIPE_Y, 0], d: [-1, 0, 0] }, { kind: 'in', p: [0, 1.25, -0.45], d: [0, 1, 0] }, { kind: 'out', p: [0, 0.35, 0.65], d: [0, 0, 1] }],
    build: () => merge([
      bbox(0.86, 0.3, 0.86, 0, 0.15, 0, DARK, 0.04, 1),
      ...[[-0.36, -0.36], [0.36, -0.36], [-0.36, 0.36], [0.36, 0.36]].map(([x, z]) => rod([x, 0.3, z], [x, 1.55, z], 0.045, STEEL)),
      bbox(0.86, 0.2, 0.86, 0, 1.6, 0, OCHRE, 0.04, 2), cyl(0.2, 0.2, 0.5, 0, 1.3, 0, TEAL, 0, 0, 14, 3), cyl(0.28, 0.28, 0.08, 0, 1.0, 0, STEEL, 0, 0, 16, 4),
      box(0.6, 0.06, 0.6, 0, 0.36, 0, BRASS, 0.03, 5), P(place(new THREE.BoxGeometry(0.5, 0.35, 0.02), 0, 0.6, 0.43), GLASS, 0.03, 6),
      mouth(0.22, 0.1, 0.25, 0, 1.12, -0.45, STEEL, 7),
      P(place(new THREE.BoxGeometry(0.28, 0.04, 0.32), 0, 0.33, 0.55, 0.35, 0, 0), STEEL),
      rod([-0.75, PIPE_Y, 0], [-0.43, PIPE_Y, 0], 0.07, COPPER), flange(-0.72, PIPE_Y, 0, 'x'),
    ]) },

  // A straight belt with a saw over it: ingots and gems riding under it are
  // cut to the size set on its panel, or to the number on its signal input.
  // The offcut follows on behind.
  belt_saw: { ...MACHINES2.belt, name: 'Belt Saw', saw: true,
    sockets: [...MACHINES2.belt.sockets, { kind: 'sig-in', p: [0.42, 0.95, 0], d: [1, 0, 0], port: 0 }],
    build: () => merge([MACHINES2.belt.build(),
      rod([0.32, 0, 0], [0.32, 1.15, 0], 0.035, DARK), rod([-0.32, 0, 0], [-0.32, 1.15, 0], 0.035, DARK), rod([-0.34, 1.15, 0], [0.34, 1.15, 0], 0.04, DARK),
      bbox(0.3, 0.22, 0.26, 0, 1.0, 0, BRICK, 0.03, 9), cyl(0.17, 0.17, 0.03, 0, 0.8, 0, 0xd8d8d0, 0, Math.PI / 2, 18, 10), box(0.2, 0.12, 0.2, 0.36, 0.95, 0, VIOLET, 0.04, 11), sig(0.42, 0.95, 0)]) },

  // Things dropped into the mouth (or fed from a belt) slide out of the
  // spout into whatever stands in front of it.
  funnel: { name: 'Funnel', family: 'extraction', role: 'funnel', cell: [2, 2], catchR: 0.5, catchY: [0.7, 1.5],
    boxes: [[0, 0.3, 0, 0.12, 0.3, 0.12], [0, 0.8, 0, 0.3, 0.03, 0.3]],
    sockets: [{ kind: 'in', p: [0, 1.2, 0], d: [0, 1, 0] }, { kind: 'out', p: [0, 0.75, 0.55], d: [0, 0, 1] }],
    build: () => merge([
      rod([0, 0, -0.1], [0, 0.85, -0.1], 0.05, DARK), box(0.4, 0.05, 0.4, 0, 0.025, 0, DARK, 0.04, 1),
      mouth(0.62, 0.16, 0.45, 0, 1.0, 0, STEEL, 2), cyl(0.12, 0.12, 0.08, 0, 0.75, 0, BRASS, 0, 0, 10, 3),
      P(place(new THREE.BoxGeometry(0.2, 0.03, 0.5), 0, 0.72, 0.3, 0.3, 0, 0), STEEL),
    ]) },

  // Disposal chute: while its signal is above 0 (or with nothing wired to
  // it), whatever drops in or arrives by belt is ground up and gone.
  shredder: { name: 'Disposal Chute', family: 'logic', role: 'logic', logic: 'shredder', label: 'SHRED', cell: [2, 2], catchR: 0.45, catchY: [0.3, 1.4],
    boxes: [[0, 0.35, 0, 0.4, 0.35, 0.4]], labelAt: [0, 0.45, 0.43], labelUp: false,
    sockets: [{ kind: 'in', p: [0, 0.95, 0], d: [0, 1, 0] }, { kind: 'sig-in', p: [-0.45, 0.3, 0], d: [-1, 0, 0], port: 0 }],
    build: () => merge([bbox(0.8, 0.7, 0.8, 0, 0.35, 0, VIOLET, 0.04, 1), mouth(0.5, 0.35, 0.25, 0, 0.82, 0, STEEL, 2), ...[-0.12, 0.12].map((x, i) => cyl(0.1, 0.1, 0.6, x, 0.68, 0, DARK, 0, Math.PI / 2, 10, 3 + i)), sig(-0.45, 0.3, 0)]) },

  // Mender: holds repair charges (load it with wrenches or repair kits); on
  // a rising signal it fixes the most worn machine within 4 m by 25%.
  mender: { name: 'Mender', family: 'logic', role: 'logic', logic: 'mender', label: 'MEND', cell: [2, 2],
    boxes: [[0, 0.3, 0, 0.3, 0.3, 0.3]], labelAt: [0, 0.62, 0], labelUp: true,
    sockets: [{ kind: 'sig-in', p: [-0.35, 0.2, 0], d: [-1, 0, 0], port: 0 }],
    build: () => merge([bbox(0.6, 0.6, 0.6, 0, 0.3, 0, VIOLET, 0.04, 1), cyl(0.12, 0.12, 0.3, 0, 0.75, 0, BRASS, 0, 0, 12, 2), rod([0, 0.85, 0], [0, 1.0, 0.35], 0.03, DARK), box(0.12, 0.08, 0.18, 0, 1.0, 0.42, STEEL, 0.04, 3), sig(-0.35, 0.2, 0)]) },
};

// Handheld tool model: the magnet rod (a horseshoe on a wooden handle).
export function magnetRod() {
  const parts = [rod([0, -0.35, 0], [0, 0.15, 0], 0.025, WOOD), P(place(new THREE.TorusGeometry(0.09, 0.03, 8, 14, Math.PI), 0, 0.24, 0, 0, 0, Math.PI), BRICK, 0.04, 2)];
  for (const x of [-0.09, 0.09]) parts.push(cyl(0.032, 0.032, 0.05, x, 0.22, 0, STEEL, 0, 0, 8));
  return merge(parts);
}
