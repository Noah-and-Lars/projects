// M5 machine definitions: belts, power, processing and logic (BUILD_BRIEF 3.5).
// Same conventions as defs/machines.js. Belts carry items in data lanes; a
// lane is a local polyline from an entry to one or more exits.
import * as THREE from 'three';
import { paint, merge, place, bevelBox } from '../render/geom.js';

const TEAL = 0x2a8a86, OCHRE = 0xc8902c, BRICK = 0xa84a3a, VIOLET = 0x6e56a8;
const BRASS = 0xc89a48, COPPER = 0xc0704a, STEEL = 0x8a949c, DARK = 0x3a3e44, RUBBER = 0x2a2c30, WOOD = 0xb07a44, WOOD_D = 0x8a5a30, STONE = 0x9a948a, CREAM = 0xf0e4c4;
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
const BY = 0.55; // belt surface height
const PIPE_Y = 0.4;
const flange = (x, y, z, axis) => cyl(0.13, 0.13, 0.05, x, y, z, BRASS, axis === 'z' ? Math.PI / 2 : 0, axis === 'x' ? Math.PI / 2 : 0, 10);

// Belt frame along a lane (array of [x,y,z] points): side rails, legs, rollers.
function beltFrame(pts, extra = []) {
  const parts = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const a = new THREE.Vector3(...pts[i]), b = new THREE.Vector3(...pts[i + 1]);
    const d = b.clone().sub(a), len = d.length(), side = new THREE.Vector3(-d.z, 0, d.x).normalize().multiplyScalar(0.27);
    for (const s of [-1, 1]) parts.push(rod(a.clone().addScaledVector(side, s).add(new THREE.Vector3(0, 0.02, 0)).toArray(), b.clone().addScaledVector(side, s).add(new THREE.Vector3(0, 0.02, 0)).toArray(), 0.03, STEEL));
    const n = Math.max(1, Math.round(len / 0.25));
    for (let k = 0; k <= n; k++) { const p = a.clone().lerp(b, k / n); parts.push(rod(p.clone().addScaledVector(side, -0.95).add(new THREE.Vector3(0, -0.04, 0)).toArray(), p.clone().addScaledVector(side, 0.95).add(new THREE.Vector3(0, -0.04, 0)).toArray(), 0.022, DARK)); }
    for (const t of [0, 1]) if (i === 0 || t === 1) { const p = t ? b : a; for (const s of [-1, 1]) parts.push(rod([p.x + side.x * s, 0, p.z + side.z * s], [p.x + side.x * s, p.y - 0.05, p.z + side.z * s], 0.025, DARK)); }
  }
  return merge([...parts, ...extra]);
}
// The moving belt surface as its own mesh (its texture scrolls with speed).
export function beltSurface(pts) {
  const pos = [], uv = [], idx = [];
  let acc = 0;
  pts.forEach((p, i) => {
    const a = new THREE.Vector3(...p), nb = pts[Math.min(pts.length - 1, i + 1)], pb = pts[Math.max(0, i - 1)];
    const d = new THREE.Vector3(...nb).sub(new THREE.Vector3(...pb)); d.y = 0; d.normalize();
    const side = new THREE.Vector3(-d.z, 0, d.x).multiplyScalar(0.24);
    if (i) acc += a.distanceTo(new THREE.Vector3(...pts[i - 1]));
    pos.push(...a.clone().add(side).add(new THREE.Vector3(0, 0.005, 0)).toArray(), ...a.clone().sub(side).add(new THREE.Vector3(0, 0.005, 0)).toArray());
    uv.push(0, acc * 2, 1, acc * 2);
    if (i) { const k = i * 2; idx.push(k - 2, k - 1, k, k - 1, k + 1, k); }
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
  return g;
}
const arc = (cx, cz, r, a0, a1, n = 6, y = BY) => [...Array(n + 1)].map((_, i) => { const a = a0 + (a1 - a0) * i / n; return [cx + Math.cos(a) * r, y, cz + Math.sin(a) * r]; });
const line = (a, b) => [a, b];

// Lanes: paths[] is a list of polylines; each belt has one entry (path 0
// start) and exits per path end. Outs are matched to sockets by index.
const BELT = (name, price, lanes, sockets, extra = {}) => ({ name, family: 'extraction', role: 'belt', cell: extra.cell || [2, 2], lanes, sockets,
  boxes: extra.boxes || [[0, BY / 2, 0, 0.3, BY / 2, 0.5]], build: () => beltFrame(lanes.flat().length ? lanes[0] : [], (extra.parts ? extra.parts() : []).concat(lanes.slice(1).map(l => beltFrame(l)))), ...extra });

export const MACHINES2 = {
  belt: BELT('Belt (straight)', 200, [line([0, BY, -0.5], [0, BY, 0.5])], [{ kind: 'in', p: [0, BY, -0.5], d: [0, 0, -1] }, { kind: 'out', p: [0, BY, 0.5], d: [0, 0, 1] }]),
  belt_corner: BELT('Belt (corner)', 220, [arc(0.5, -0.5, 0.5, Math.PI, Math.PI / 2, 6)], [{ kind: 'in', p: [0, BY, -0.5], d: [0, 0, -1] }, { kind: 'out', p: [0.5, BY, 0], d: [1, 0, 0] }], { boxes: [[0.1, BY / 2, -0.1, 0.4, BY / 2, 0.4]] }),
  belt_incline: BELT('Belt (incline)', 260, [line([0, BY, -1], [0, BY + 1, 1])], [{ kind: 'in', p: [0, BY, -1], d: [0, 0, -1] }, { kind: 'out', p: [0, BY + 1, 1], d: [0, 0, 1] }], { cell: [2, 4], boxes: [[0, 0.5, 0, 0.3, 0.5, 1]] }),
  belt_splitter: BELT('Belt Splitter', 480, [line([0, BY, -0.5], [0, BY, 0.5]), [[0, BY, 0], [0.5, BY, 0]]], [{ kind: 'in', p: [0, BY, -0.5], d: [0, 0, -1] }, { kind: 'out', p: [0, BY, 0.5], d: [0, 0, 1] }, { kind: 'out', p: [0.5, BY, 0], d: [1, 0, 0] }], { split: 'alternate', parts: () => [bbox(0.3, 0.2, 0.3, 0, BY + 0.2, 0, OCHRE, 0.03, 7)] }),
  belt_merger: BELT('Belt Merger', 440, [line([0, BY, -0.5], [0, BY, 0.5]), [[-0.5, BY, 0], [0, BY, 0]]], [{ kind: 'in', p: [0, BY, -0.5], d: [0, 0, -1] }, { kind: 'out', p: [0, BY, 0.5], d: [0, 0, 1] }, { kind: 'in', p: [-0.5, BY, 0], d: [-1, 0, 0] }], { merge: true, parts: () => [box(0.08, 0.25, 0.4, -0.25, BY + 0.1, 0.15, OCHRE, 0.05, 7)] }),
  belt_sorter: BELT('Belt Sorter', 520, [line([0, BY, -0.5], [0, BY, 0.5]), [[0, BY, 0], [0.5, BY, 0]]], [{ kind: 'in', p: [0, BY, -0.5], d: [0, 0, -1] }, { kind: 'out', p: [0, BY, 0.5], d: [0, 0, 1] }, { kind: 'out', p: [0.5, BY, 0], d: [1, 0, 0] }], { split: 'filter', parts: () => [bbox(0.5, 0.45, 0.16, 0, BY + 0.35, 0, OCHRE, 0.03, 7), box(0.3, 0.16, 0.02, 0, BY + 0.4, -0.085, CREAM, 0.02, 8)] }),
  belt_drive: BELT('Belt Drive', 350, [line([0, BY, -0.5], [0, BY, 0.5])], [{ kind: 'in', p: [0, BY, -0.5], d: [0, 0, -1] }, { kind: 'out', p: [0, BY, 0.5], d: [0, 0, 1] }, { kind: 'water', p: [-0.7, PIPE_Y, 0], d: [-1, 0, 0] }], { drive: true, demand: 10, parts: () => [bbox(0.36, 0.42, 0.42, -0.45, 0.35, 0, TEAL, 0.04, 7), cyl(0.12, 0.12, 0.08, -0.25, 0.48, 0, BRASS, 0, Math.PI / 2), rod([-0.7, PIPE_Y, 0], [-0.55, PIPE_Y, 0], 0.07, COPPER), flange(-0.67, PIPE_Y, 0, 'x')] }),
  belt_gemcutter: BELT('Gem Cutter Hook', 500, [line([0, BY, -0.5], [0, BY, 0.5])], [{ kind: 'in', p: [0, BY, -0.5], d: [0, 0, -1] }, { kind: 'out', p: [0, BY, 0.5], d: [0, 0, 1] }], { gemcut: true, parts: () => [rod([0.3, 0, 0], [0.3, 1.1, 0], 0.03, DARK), rod([0.3, 1.1, 0], [0, 1.1, 0], 0.03, DARK), cyl(0.12, 0.12, 0.05, 0, 0.82, 0, 0xb8b0a0, 0, Math.PI / 2, 14), bbox(0.16, 0.2, 0.16, 0, 1.0, 0, OCHRE, 0.03, 9)] }),

  // ---- Containers ----
  orebin: { name: 'Ore Bin', family: 'extraction', role: 'container', capKg: 400, cell: [2, 2], boxes: [[0, 0.55, 0, 0.5, 0.55, 0.5]],
    sockets: [{ kind: 'in', p: [0, 1.15, 0], d: [0, 1, 0] }, { kind: 'out', p: [0, 0.3, 0.6], d: [0, 0, 1] }],
    build: () => merge([bbox(1.0, 0.9, 1.0, 0, 0.6, 0, WOOD, 0.04, 1), ...[0.25, 0.6, 0.95].map((y, i) => box(1.04, 0.06, 1.04, 0, y, 0, DARK, 0.04, 2 + i)), ...[[-0.45, -0.45], [0.45, -0.45], [-0.45, 0.45], [0.45, 0.45]].map(([x, z]) => box(0.1, 0.15, 0.1, x, 0.075, z, DARK)), box(0.3, 0.12, 0.06, 0, 0.3, 0.52, BRASS, 0.04, 6)]) },
  cratebox: { name: 'Storage Crate', family: 'extraction', role: 'container', capItems: 40, cell: [2, 2], boxes: [[0, 0.4, 0, 0.45, 0.4, 0.45]],
    sockets: [{ kind: 'in', p: [0, 0.85, 0], d: [0, 1, 0] }, { kind: 'out', p: [0, 0.3, 0.55], d: [0, 0, 1] }],
    build: () => merge([bbox(0.9, 0.75, 0.9, 0, 0.4, 0, 0xc8a070, 0.03, 1), ...[-0.4, 0.4].map(x => box(0.08, 0.78, 0.94, x, 0.4, 0, WOOD_D, 0.05, 2)), box(0.94, 0.08, 0.94, 0, 0.75, 0, WOOD_D, 0.05, 4)]) },

  // ---- Shaft power ----
  waterwheel: { name: 'Water Wheel', family: 'water', role: 'source', flow: 20, shaft: 3, cell: [4, 4], needsWater: [0, 0.2, 0], boxes: [[0, 1.2, -0.9, 0.2, 1.2, 0.2]],
    sockets: [{ kind: 'water', p: [0.8, PIPE_Y, -0.9], d: [1, 0, 0] }],
    build: () => merge([...[-1.4, -0.4].map(z => [rod([-0.15, 0, z], [-0.15, 1.6, -0.9], 0.05, WOOD_D), rod([0.15, 0, z], [0.15, 1.6, -0.9], 0.05, WOOD_D)]).flat(), rod([0, 1.6, -0.9], [0, 1.6, -0.2], 0.06, DARK), bbox(0.4, 0.4, 0.4, 0, 1.6, -0.9, OCHRE, 0.03, 3), rod([0.2, PIPE_Y, -0.9], [0.8, PIPE_Y, -0.9], 0.07, COPPER), flange(0.77, PIPE_Y, -0.9, 'x')]),
    spin: { at: [0, 1.6, 0.2], axis: 'z', r: 1.3, wheel: true } },
  turbine: { name: 'Turbine', family: 'water', role: 'consumer', demand: 30, shaft: 3, cell: [2, 2], boxes: [[0, 0.5, 0, 0.45, 0.5, 0.45]],
    sockets: [{ kind: 'water', p: [0, PIPE_Y, -0.8], d: [0, 0, -1] }],
    build: () => merge([cyl(0.42, 0.42, 0.7, 0, 0.45, 0, TEAL, 0, 0, 16, 1), cyl(0.44, 0.44, 0.05, 0, 0.8, 0, BRASS, 0, 0, 16), cyl(0.1, 0.1, 0.4, 0, 1.0, 0, DARK), rod([0, PIPE_Y, -0.8], [0, PIPE_Y, -0.35], 0.07, COPPER), flange(0, PIPE_Y, -0.77, 'z')]),
    spin: { at: [0, 1.22, 0], axis: 'y', r: 0.25 } },
  stampmill: { name: 'Stamp Mill', family: 'extraction', role: 'shaftuser', period: 6, cell: [3, 3], boxes: [[0, 1.1, 0, 0.7, 1.1, 0.6]],
    sockets: [{ kind: 'in', p: [0, 1.9, -0.6], d: [0, 1, 0] }, { kind: 'out', p: [0, 0.4, 0.95], d: [0, 0, 1] }],
    build: () => merge([bbox(1.4, 0.4, 1.2, 0, 0.2, 0, STONE, 0.04, 1), ...[-0.6, 0.6].map(x => [rod([x, 0.4, -0.4], [x, 2.4, -0.4], 0.07, WOOD_D), rod([x, 0.4, 0.4], [x, 2.4, -0.4], 0.06, WOOD_D)]).flat(), rod([-0.65, 2.3, -0.4], [0.65, 2.3, -0.4], 0.07, DARK), bbox(1.0, 0.4, 0.5, 0, 1.75, -0.6, OCHRE, 0.03, 4), P(place(new THREE.BoxGeometry(0.5, 0.06, 0.5), 0, 0.5, 0.75, 0.4), STEEL)]),
    stamps: true },
  trommel: { name: 'Trommel', family: 'extraction', role: 'shaftuser', period: 3, cell: [2, 4], boxes: [[0, 0.7, 0, 0.5, 0.7, 1.0]],
    sockets: [{ kind: 'in', p: [0, 1.25, -1.1], d: [0, 1, 0] }, { kind: 'out', p: [0, 0.5, 1.2], d: [0, 0, 1] }],
    build: () => merge([...[[-0.4, -0.8], [0.4, -0.8], [-0.4, 0.8], [0.4, 0.8]].map(([x, z]) => rod([x, 0, z], [x * 0.7, z < 0 ? 1.0 : 0.8, z], 0.04, DARK)), P(place(new THREE.CylinderGeometry(0.4, 0.3, 0.5, 4, 1, true), 0, 1.1, -1.0, 0, Math.PI / 4, 0), OCHRE)]),
    spin: { at: [0, 0.9, 0], axis: 'z', r: 0.42, drum: true, tilt: -0.1 } },
  lift: { name: 'Lift', family: 'extraction', role: 'shaftuser', period: 2, cell: [2, 2], boxes: [[0, 2, 0, 0.45, 2, 0.45]],
    sockets: [{ kind: 'in', p: [0, 0.6, -0.55], d: [0, 0, -1] }, { kind: 'out', p: [0, 3.6, 0.55], d: [0, 0, 1] }],
    build: () => merge([...[[-0.4, -0.4], [0.4, -0.4], [-0.4, 0.4], [0.4, 0.4]].map(([x, z]) => rod([x, 0, z], [x, 4, z], 0.04, DARK)), ...[1, 2, 3, 4].map(y => box(0.9, 0.05, 0.9, 0, y, 0, STEEL, 0.04, y)), bbox(0.5, 0.3, 0.5, 0, 4.1, 0, OCHRE, 0.03, 9), box(0.86, 0.06, 0.86, 0, 0.3, 0, WOOD, 0.06, 10)]) },

  // ---- Smelter (belt-fed) ----
  smelter: { name: 'Smelter', family: 'heat', role: 'consumer', demand: 30, cell: [3, 3], meltRate: 10 / 4, capKg: 100, fuelPerSec: 1 / 60, pourOnPulse: true, boxes: [[0, 1.0, 0, 0.75, 1.0, 0.75]],
    sockets: [{ kind: 'in', p: [0, 1.5, -0.9], d: [0, 0, -1] }, { kind: 'out', p: [0, 0.45, 1.05], d: [0, 0, 1] }, { kind: 'water', p: [1.1, PIPE_Y, 0], d: [1, 0, 0] }],
    build: () => merge([bbox(1.5, 0.3, 1.5, 0, 0.15, 0, STONE, 0.04, 1), bbox(1.3, 1.3, 1.3, 0, 0.95, 0, BRICK, 0.06, 2), ...[0.55, 1.05, 1.55].map((y, i) => box(1.34, 0.07, 1.34, 0, y, 0, DARK, 0.04, 3 + i)), cyl(0.25, 0.2, 1.1, 0.3, 2.1, -0.3, STONE, 0, 0, 10), bbox(0.6, 0.3, 0.3, 0, 1.45, -0.75, DARK, 0.03, 7), P(place(new THREE.BoxGeometry(0.14, 0.07, 0.5), 0, 0.62, 0.85, 0.35), DARK), rod([1.1, PIPE_Y, 0], [0.65, PIPE_Y, 0], 0.07, COPPER), flange(1.07, PIPE_Y, 0, 'x')]),
    glow: { at: [0, 0.8, 0.66], w: 0.45, h: 0.35 } },
};

// ---- Logic (violet): a block with a label and brass terminals ----
const LOGIC = {
  button: ['Button', 60, 'BTN', 0, 1], lever: ['Lever', 60, 'LEVER', 0, 1], dial: ['Dial', 80, 'DIAL', 0, 1], clock: ['Clock', 120, 'CLOCK', 0, 1],
  and: ['AND Gate', 80, 'AND', 2, 1], or: ['OR Gate', 80, 'OR', 2, 1], not: ['NOT Gate', 60, 'NOT', 1, 1], compare: ['Compare', 100, '>', 2, 1],
  add: ['Add', 80, '+', 2, 1], sub: ['Subtract', 80, '−', 2, 1], latch: ['Latch', 100, 'LATCH', 2, 1], pulse: ['Pulse', 80, 'PULSE', 1, 1], delay: ['Delay', 100, 'DELAY', 1, 1],
  scale: ['Scale Plate', 240, 'KG', 0, 1], counter: ['Counter', 160, 'COUNT', 1, 1], wearsensor: ['Wear Sensor', 160, 'WEAR', 0, 1], fillsensor: ['Fill Sensor', 160, 'FILL', 0, 1],
  valve: ['Valve', 200, 'VALVE', 1, 0], beltgate: ['Belt Gate', 180, 'GATE', 1, 0], pourer: ['Pour Trigger', 160, 'POUR', 1, 0], lamp: ['Lamp', 60, 'LAMP', 1, 0], siren: ['Siren', 120, 'SIREN', 1, 0],
  charge: ['Logic Charge', 300, 'BOOM', 1, 0], ejector: ['Item Ejector', 260, 'EJECT', 1, 0], display: ['Display Panel', 140, '0', 1, 0],
  mul: ['Multiply', 90, '×', 2, 1], div: ['Divide', 90, '÷', 2, 1], toggle: ['Toggle', 80, 'TOGGLE', 1, 1], pass: ['Pass Gate', 70, '≥1', 1, 1],
  gauge: ['Pressure Gauge', 140, 'PRESS', 0, 1], mixsensor: ['Mix Sensor', 160, 'MIX', 0, 1], switch: ['Machine Switch', 180, 'SWITCH', 1, 0], magnet: ['Magnet', 650, 'MAGNET', 1, 0],
};
export const LOGIC_PRICES = Object.fromEntries(Object.entries(LOGIC).map(([k, v]) => [k, v[1]]));
const labelCache = new Map();
export function logicLabel(text, bg = '#3f3068', fg = '#f6eedb') {
  const key = text + bg; if (labelCache.has(key)) return labelCache.get(key);
  const c = document.createElement('canvas'); c.width = 128; c.height = 64; const g = c.getContext('2d');
  g.fillStyle = bg; g.fillRect(0, 0, 128, 64); g.fillStyle = fg; g.textAlign = 'center'; g.textBaseline = 'middle';
  let size = 40; g.font = `bold ${size}px ui-rounded, "Nunito", sans-serif`; while (g.measureText(text).width > 116 && size > 12) { size -= 2; g.font = `bold ${size}px ui-rounded, "Nunito", sans-serif`; }
  g.fillText(text, 64, 34);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; labelCache.set(key, t); return t;
}
for (const [id, [name, , label, nin, nout]] of Object.entries(LOGIC)) {
  const big = id === 'scale', tall = id === 'lever' || id === 'lamp' || id === 'siren' || id === 'display';
  const sockets = [];
  for (let i = 0; i < nin; i++) sockets.push({ kind: 'sig-in', p: [-0.22, 0.12, nin === 1 ? 0 : -0.08 + i * 0.16], d: [-1, 0, 0], port: i });
  for (let i = 0; i < nout; i++) sockets.push({ kind: 'sig-out', p: [0.22, 0.12, 0], d: [1, 0, 0], port: 0 });
  MACHINES2[id] = {
    name, family: 'logic', role: 'logic', logic: id, label, cell: big ? [3, 3] : [1, 1], sockets,
    boxes: big ? [[0, 0.04, 0, 0.6, 0.04, 0.6]] : id === 'display' ? [[0, 0.45, 0, 0.3, 0.45, 0.1]] : [[0, 0.1, 0, 0.2, 0.1, 0.2]],
    build: () => {
      const parts = [];
      if (big) { parts.push(bbox(1.2, 0.06, 1.2, 0, 0.03, 0, STEEL, 0.02, 1), box(1.24, 0.03, 1.24, 0, 0.005, 0, DARK, 0.03, 2), bbox(0.32, 0.14, 0.24, 0.5, 0.1, 0.5, VIOLET, 0.03, 3)); }
      else if (id === 'display') { parts.push(bbox(0.6, 0.5, 0.12, 0, 0.6, 0, VIOLET, 0.03, 1), rod([0, 0, 0], [0, 0.35, 0], 0.035, DARK), box(0.2, 0.04, 0.2, 0, 0.02, 0, DARK, 0.04, 2)); }
      else { parts.push(bbox(0.4, 0.2, 0.4, 0, 0.1, 0, VIOLET, 0.04, 1), box(0.42, 0.03, 0.42, 0, 0.015, 0, DARK, 0.04, 2)); }
      if (id === 'lever') parts.push(rod([0, 0.2, 0], [0, 0.5, 0.12], 0.02, DARK), P(place(new THREE.SphereGeometry(0.04, 8, 6), 0, 0.52, 0.13), BRICK));
      if (id === 'button') parts.push(cyl(0.08, 0.08, 0.06, 0, 0.23, 0, BRICK, 0, 0, 12));
      if (id === 'lamp') parts.push(rod([0, 0.2, 0], [0, 0.45, 0], 0.03, DARK));
      if (id === 'siren') parts.push(P(place(new THREE.ConeGeometry(0.12, 0.2, 10, 1, true), 0, 0.32, 0, Math.PI), BRASS));
      if (id === 'magnet') parts.push(P(place(new THREE.TorusGeometry(0.11, 0.035, 8, 16, Math.PI), 0, 0.22, 0, Math.PI / 2, 0, 0), BRICK), ...[-0.11, 0.11].map(x => cyl(0.04, 0.04, 0.06, x, 0.22, 0, STEEL, Math.PI / 2, 0, 8)));
      if (id === 'gauge') parts.push(cyl(0.1, 0.1, 0.04, 0, 0.3, 0, BRASS, Math.PI / 2, 0, 14), cyl(0.085, 0.085, 0.045, 0, 0.3, 0.003, CREAM, Math.PI / 2, 0, 14), rod([0, 0.2, 0], [0, 0.26, 0], 0.02, DARK));
      if (id === 'charge') parts.push(...[0, 1, 2].map(i => cyl(0.05, 0.05, 0.3, -0.08 + i * 0.08, 0.32, 0, BRICK, 0, 0, 8, i)));
      for (const s of sockets) parts.push(cyl(0.035, 0.035, 0.05, s.p[0], s.p[1], s.p[2], BRASS, 0, Math.PI / 2, 8));
      return merge(parts);
    },
    labelAt: big ? [0.5, 0.18, 0.5] : id === 'display' ? [0, 0.6, 0.065] : [0, 0.205, 0], labelUp: id !== 'display',
  };
}
export const BY_HEIGHT = BY;
void WOOD;
