// Turns the downloaded gear models into the soldier's swappable gear
// (assets/gear/*.glb, worn through src/gear.js and chosen in the Outfit menu).
//
// The models are by Exactly (CC BY 4.0, see README.md, Credits):
//   tactical_helmet_with_headset_game-ready  -> assets/gear/helmet_comms.glb
//   tactical_headset_-_game_ready            -> assets/gear/headset.glb
//   tactical_plate_carrier_vest_-_game_ready -> assets/gear/vest_black.glb
//   military_armor_3d_model                  -> assets/gear/vest_olive.glb
// Download each one's glTF version from Sketchfab and unzip it into
// build/gear-src/<that folder name> (so it holds scene.gltf, scene.bin and
// textures/). Then, from the project-fish folder:
//
//     python3 -I tools/gear/rub_headset_text.py build/gear-src/tactical_headset_-_game_ready/textures/headset_baseColor.jpeg build/gear-headset.png
//     node tools/gear/build_gear.mjs build/gear-src assets/soldier.glb assets/gear --headset-texture build/gear-headset.png
//
// (npm run build-gear does both. It needs assets/soldier.glb, made first by
// npm run build-soldier.)
//
// Each piece is fitted to the soldier at real size, in his rest pose:
// - Head gear sits where his own helmet sits (or, the headset alone, over
//   his ears), turned to face his way, and moves rigidly with his head bone.
// - A vest is scaled, along each axis, to where his own plate carrier is,
//   pushed out wherever it would cut into his jacket (smoothly, so it keeps
//   its shape), and skinned to his spine and collarbones with the weights of
//   the nearest points of his own plate carrier, so it breathes, leans and
//   bends with him.
// Then each is stored on a copy of his skeleton (same joints, same inverse
// bind matrices), so the game can put it on any copy of him by handing it
// that copy's bones (src/gear.js). Big meshes are simplified to a game
// budget, textures shrunk and stored as WebP, meshes compressed (meshopt),
// and the credit goes in the file (asset.copyright).

import fs from 'node:fs';
import path from 'node:path';
import { Document, NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { meshopt, prune, simplify, textureCompress, weld } from '@gltf-transform/functions';
import { MeshoptDecoder, MeshoptEncoder, MeshoptSimplifier } from 'meshoptimizer';
import sharp from 'sharp';

const args = process.argv.slice(2);
const option = (name, fallback) => (args.includes(name) ? args[args.indexOf(name) + 1] : fallback);
const [SOURCES, SOLDIER, OUT] = args;
if (!SOURCES || !SOLDIER || !OUT) {
  console.error('usage: node tools/gear/build_gear.mjs build/gear-src assets/soldier.glb assets/gear [--headset-texture FIXED.png] [--only id]');
  process.exit(1);
}
const HEADSET_TEXTURE = option('--headset-texture', null);
const ONLY = option('--only', null);

// The pieces. turn: degrees about the vertical to face his way (+Z);
// tilt: degrees about his left-right axis (nose down positive).
// Head gear: `fit` scales it uniformly by `scale` and puts its bounding
// box's centre at `centre` (metres, his rest pose; x his left, y up, z
// ahead). Vests: `fit` maps its bounding box onto `box` ({lo, hi}), each
// axis on its own.
const ITEMS = [
  {
    id: 'helmet_comms', source: 'tactical_helmet_with_headset_game-ready', slot: 'head',
    title: 'Tactical Helmet with Headset (Game-Ready)', url: 'https://sketchfab.com/3d-models/tactical-helmet-with-headset-game-ready-82adf376164f4d99a4e0b2949930e2ad',
    maxTriangles: 12000, size: 2048, roughness: 0.75, turn: -90, tilt: 0,
    fit: { scale: 0.335, centre: [-0.026, 1.672, 0.012] },
    clear: { margin: 0.004 },
  },
  {
    id: 'headset', source: 'tactical_headset_-_game_ready', slot: 'head',
    title: 'Tactical Headset - Game Ready', url: 'https://sketchfab.com/3d-models/tactical-headset-game-ready-c1cee56e73ed47438015a646ad82dfa5',
    maxTriangles: 9500, size: 1024, roughness: 0.7, turn: 0, tilt: 0, texture: HEADSET_TEXTURE,
    fit: { scale: 0.27, centre: [-0.021, 1.67, 0.045] },
    clear: { margin: 0.004 },
  },
  {
    id: 'vest_black', source: 'tactical_plate_carrier_vest_-_game_ready', slot: 'vest',
    title: 'Tactical Plate Carrier Vest - Game Ready', url: 'https://sketchfab.com/3d-models/tactical-plate-carrier-vest-game-ready-3b51e6329dbb4b0aa14e43f12eb6c42a',
    maxTriangles: 12000, size: 1024, roughness: 0.9, turn: -90, tilt: 0,
    fit: { box: { lo: [-0.245, 1.03, -0.245], hi: [0.208, 1.535, 0.185] } },
    clear: { margin: 0.006 },
  },
  {
    id: 'vest_olive', source: 'military_armor_3d_model', slot: 'vest',
    title: 'Military Armor 3D Model', url: 'https://sketchfab.com/3d-models/military-armor-3d-model-7cab57de2b844a60a43af4fd8b61a4a4',
    maxTriangles: 12000, size: 1024, roughness: 0.9, turn: 0, tilt: 0,
    fit: { box: { lo: [-0.25, 1.0, -0.25], hi: [0.213, 1.545, 0.195] } },
    clear: { margin: 0.006 },
  },
];
const AUTHOR = 'Exactly (https://sketchfab.com/txyrm70)';

await MeshoptEncoder.ready;
await MeshoptSimplifier.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
  'meshopt.decoder': MeshoptDecoder,
  'meshopt.encoder': MeshoptEncoder,
});

// --- Small maths (column-major 4x4, as glTF) -------------------------------
const mul = (a, b) => {
  const o = new Array(16).fill(0);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++) o[c * 4 + r] += a[k * 4 + r] * b[c * 4 + k];
  return o;
};
const apply = (m, p) => [m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12], m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13], m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14]];
const applyDir = (m, p) => [m[0] * p[0] + m[4] * p[1] + m[8] * p[2], m[1] * p[0] + m[5] * p[1] + m[9] * p[2], m[2] * p[0] + m[6] * p[1] + m[10] * p[2]];
const invert = (m) => {
  // General 4x4 inverse.
  const inv = new Array(16);
  const [a0, a1, a2, a3, a4, a5, a6, a7, a8, a9, a10, a11, a12, a13, a14, a15] = m;
  inv[0] = a5 * a10 * a15 - a5 * a11 * a14 - a9 * a6 * a15 + a9 * a7 * a14 + a13 * a6 * a11 - a13 * a7 * a10;
  inv[4] = -a4 * a10 * a15 + a4 * a11 * a14 + a8 * a6 * a15 - a8 * a7 * a14 - a12 * a6 * a11 + a12 * a7 * a10;
  inv[8] = a4 * a9 * a15 - a4 * a11 * a13 - a8 * a5 * a15 + a8 * a7 * a13 + a12 * a5 * a11 - a12 * a7 * a9;
  inv[12] = -a4 * a9 * a14 + a4 * a10 * a13 + a8 * a5 * a14 - a8 * a6 * a13 - a12 * a5 * a10 + a12 * a6 * a9;
  inv[1] = -a1 * a10 * a15 + a1 * a11 * a14 + a9 * a2 * a15 - a9 * a3 * a14 - a13 * a2 * a11 + a13 * a3 * a10;
  inv[5] = a0 * a10 * a15 - a0 * a11 * a14 - a8 * a2 * a15 + a8 * a3 * a14 + a12 * a2 * a11 - a12 * a3 * a10;
  inv[9] = -a0 * a9 * a15 + a0 * a11 * a13 + a8 * a1 * a15 - a8 * a3 * a13 - a12 * a1 * a11 + a12 * a3 * a9;
  inv[13] = a0 * a9 * a14 - a0 * a10 * a13 - a8 * a1 * a14 + a8 * a2 * a13 + a12 * a1 * a10 - a12 * a2 * a9;
  inv[2] = a1 * a6 * a15 - a1 * a7 * a14 - a5 * a2 * a15 + a5 * a3 * a14 + a13 * a2 * a7 - a13 * a3 * a6;
  inv[6] = -a0 * a6 * a15 + a0 * a7 * a14 + a4 * a2 * a15 - a4 * a3 * a14 - a12 * a2 * a7 + a12 * a3 * a6;
  inv[10] = a0 * a5 * a15 - a0 * a7 * a13 - a4 * a1 * a15 + a4 * a3 * a13 + a12 * a1 * a7 - a12 * a3 * a5;
  inv[14] = -a0 * a5 * a14 + a0 * a6 * a13 + a4 * a1 * a14 - a4 * a2 * a13 - a12 * a1 * a6 + a12 * a2 * a5;
  inv[3] = -a1 * a6 * a11 + a1 * a7 * a10 + a5 * a2 * a11 - a5 * a3 * a10 - a9 * a2 * a7 + a9 * a3 * a6;
  inv[7] = a0 * a6 * a11 - a0 * a7 * a10 - a4 * a2 * a11 + a4 * a3 * a10 + a8 * a2 * a7 - a8 * a3 * a6;
  inv[11] = -a0 * a5 * a11 + a0 * a7 * a9 + a4 * a1 * a11 - a4 * a3 * a9 - a8 * a1 * a7 + a8 * a3 * a5;
  inv[15] = a0 * a5 * a10 - a0 * a6 * a9 - a4 * a1 * a10 + a4 * a2 * a9 + a8 * a1 * a6 - a8 * a2 * a5;
  const det = a0 * inv[0] + a1 * inv[4] + a2 * inv[8] + a3 * inv[12];
  return inv.map((x) => x / det);
};
const rotY = (deg) => { const a = (deg * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a); return [c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, 0, 0, 0, 1]; };
const rotX = (deg) => { const a = (deg * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a); return [1, 0, 0, 0, 0, c, s, 0, 0, -s, c, 0, 0, 0, 0, 1]; };
const bounds = (pos) => {
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < pos.length; i += 3) for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], pos[i + k]); hi[k] = Math.max(hi[k], pos[i + k]); }
  return { lo, hi };
};

// A grid of points for nearest-point lookups.
class Grid {
  constructor(pos, cell = 0.02) {
    this.pos = pos;
    this.cell = cell;
    this.map = new Map();
    for (let i = 0; i < pos.length / 3; i++) {
      const key = this.key(pos[3 * i], pos[3 * i + 1], pos[3 * i + 2]);
      if (!this.map.has(key)) this.map.set(key, []);
      this.map.get(key).push(i);
    }
  }
  key(x, y, z) { return `${Math.floor(x / this.cell)},${Math.floor(y / this.cell)},${Math.floor(z / this.cell)}`; }
  // The k nearest points within `reach` (metres): [[index, distance]...].
  near(x, y, z, k = 1, reach = 0.08) {
    const out = [];
    const r = Math.ceil(reach / this.cell);
    const cx = Math.floor(x / this.cell), cy = Math.floor(y / this.cell), cz = Math.floor(z / this.cell);
    for (let ring = 0; ring <= r; ring++) {
      for (let i = -ring; i <= ring; i++) for (let j = -ring; j <= ring; j++) for (let l = -ring; l <= ring; l++) {
        if (Math.max(Math.abs(i), Math.abs(j), Math.abs(l)) !== ring) continue;
        const list = this.map.get(`${cx + i},${cy + j},${cz + l}`);
        if (!list) continue;
        for (const n of list) {
          const d = Math.hypot(this.pos[3 * n] - x, this.pos[3 * n + 1] - y, this.pos[3 * n + 2] - z);
          if (d <= reach) out.push([n, d]);
        }
      }
      // Anything in a further ring is at least ring * cell away.
      if (out.length >= k) {
        out.sort((a, b) => a[1] - b[1]);
        if (out[k - 1][1] <= ring * this.cell) return out.slice(0, k);
      }
    }
    out.sort((a, b) => a[1] - b[1]);
    return out.slice(0, k);
  }
}

// --- The soldier, in his rest pose ------------------------------------------
const soldierDoc = await io.read(SOLDIER);
const soldier = (() => {
  const root = soldierDoc.getRoot();
  const skin = root.listSkins()[0];
  const joints = skin.listJoints();
  const ibm = skin.getInverseBindMatrices();
  // Each joint's skinning matrix at rest: bind space to the rest pose (metres).
  const M = joints.map((j, i) => mul(j.getWorldMatrix(), ibm.getElement(i, [])));
  const meshes = new Map();
  for (const node of root.listNodes()) {
    const mesh = node.getMesh();
    if (!mesh || !node.getSkin()) continue;
    for (const prim of mesh.listPrimitives()) {
      const P = prim.getAttribute('POSITION'), N = prim.getAttribute('NORMAL'), J = prim.getAttribute('JOINTS_0'), W = prim.getAttribute('WEIGHTS_0');
      const count = P.getCount();
      const pos = new Float32Array(count * 3), nor = new Float32Array(count * 3), jo = new Uint16Array(count * 4), we = new Float32Array(count * 4);
      const p = [], n = [], j = [], w = [];
      for (let v = 0; v < count; v++) {
        P.getElement(v, p); N.getElement(v, n); J.getElement(v, j); W.getElement(v, w);
        const o = [0, 0, 0], on = [0, 0, 0];
        for (let k = 0; k < 4; k++) {
          if (!w[k]) continue;
          const q = apply(M[j[k]], p), qn = applyDir(M[j[k]], n);
          for (let a = 0; a < 3; a++) { o[a] += w[k] * q[a]; on[a] += w[k] * qn[a]; }
        }
        const l = Math.hypot(...on) || 1;
        pos.set(o, 3 * v); nor.set(on.map((x) => x / l), 3 * v); jo.set(j, 4 * v); we.set(w, 4 * v);
      }
      meshes.set(node.getName(), { material: prim.getMaterial().getName(), pos, nor, joints: jo, weights: we });
    }
  }
  return { root, skin, joints, M, meshes, jointNamed: (re) => joints.findIndex((jj) => re.test(jj.getName())) };
})();
const meshOf = (material, test = () => true) => [...soldier.meshes.entries()].filter(([name, m]) => m.material === material && test(name, m)).map(([, m]) => m);
// Joins meshes' points, keeping only those facing outwards from `centre`
// (a point, or with `axis` a vertical line through it): a garment's inside
// faces (in the collar, the cuffs) would say a point is in the body when
// it's outside.
const join = (list, centre, vertical = false) => {
  const pos = [], nor = [];
  for (const m of list) {
    for (let v = 0; v < m.pos.length / 3; v++) {
      const p = m.pos.subarray(3 * v, 3 * v + 3), n = m.nor.subarray(3 * v, 3 * v + 3);
      const out = [p[0] - centre[0], vertical ? 0 : p[1] - centre[1], p[2] - centre[2]];
      if (out[0] * n[0] + out[1] * n[1] + out[2] * n[2] <= 0) continue;
      pos.push(...p);
      nor.push(...n);
    }
  }
  return { pos: new Float32Array(pos), nor: new Float32Array(nor) };
};
// What each kind of gear mustn't cut into: his head, glasses and eyes; his
// jacket's body and collar.
const HEAD_BODY = join([...meshOf('Mark_HeadMasked'), ...meshOf('Mark_SunGlusses_Glus'), ...meshOf('Mark_Eye'),
  ...meshOf('Mark_Pouches_1', (name, m) => bounds(m.pos).lo[1] > 1.55)], [-0.02, 1.62, 0.0]); // (his glasses' frame)
const JACKET = join(meshOf('Mark_Kitel_1', (name) => !/_arms$/.test(name)), [-0.02, 0, -0.03], true);
const PLATE = meshOf('Mark_Plate_1')[0];
const HEAD = soldier.jointNamed(/^CC_Base_Head_/);
console.log(`soldier: head joint ${HEAD}, plate carrier ${PLATE.pos.length / 3} points, jacket ${JACKET.pos.length / 3}, head and glasses ${HEAD_BODY.pos.length / 3}`);

// --- A downloaded piece ------------------------------------------------------
async function readSource(item) {
  const folder = path.join(SOURCES, item.source);
  const licence = fs.readFileSync(path.join(folder, 'license.txt'), 'utf8');
  if (!licence.includes('CC-BY-4.0') || !licence.includes(item.url)) throw new Error(`${item.source}: not the CC BY 4.0 model expected (${item.url})`);
  const doc = await io.read(path.join(folder, 'scene.gltf'));
  const triangles = () => doc.getRoot().listMeshes().reduce((n, m) => n + m.listPrimitives().reduce((k, p) => k + p.getIndices().getCount() / 3, 0), 0);
  const before = triangles();
  if (before > item.maxTriangles) {
    await doc.transform(weld(), simplify({ simplifier: MeshoptSimplifier, ratio: item.maxTriangles / before, error: 0.01 }));
  }
  item.simplified = before > item.maxTriangles;
  console.log(`${item.id}: ${before} triangles${item.simplified ? ` simplified to ${triangles()}` : ''}`);
  const pos = [], nor = [], uv = [], index = [];
  let image = null;
  for (const node of doc.getRoot().listNodes()) {
    const mesh = node.getMesh();
    if (!mesh) continue;
    const W = node.getWorldMatrix();
    for (const prim of mesh.listPrimitives()) {
      const base = pos.length / 3;
      const P = prim.getAttribute('POSITION'), N = prim.getAttribute('NORMAL'), T = prim.getAttribute('TEXCOORD_0');
      const p = [], n = [], t = [];
      for (let v = 0; v < P.getCount(); v++) {
        pos.push(...apply(W, P.getElement(v, p)));
        const d = applyDir(W, N.getElement(v, n)), l = Math.hypot(...d) || 1;
        nor.push(d[0] / l, d[1] / l, d[2] / l);
        uv.push(...T.getElement(v, t));
      }
      for (const i of prim.getIndices().getArray()) index.push(base + i);
      const tex = prim.getMaterial().getBaseColorTexture();
      if (tex && !image) image = { data: tex.getImage(), mime: tex.getMimeType() };
    }
  }
  if (item.texture) image = { data: new Uint8Array(fs.readFileSync(item.texture)), mime: item.texture.endsWith('.png') ? 'image/png' : 'image/jpeg' };
  return { pos: new Float32Array(pos), nor: new Float32Array(nor), uv: new Float32Array(uv), index: new Uint32Array(index), image };
}

// Turns, scales and places it on him.
function place(item, g) {
  const R = mul(rotX(item.tilt || 0), rotY(item.turn || 0));
  for (let v = 0; v < g.pos.length / 3; v++) {
    g.pos.set(apply(R, g.pos.subarray(3 * v, 3 * v + 3)), 3 * v);
    g.nor.set(applyDir(R, g.nor.subarray(3 * v, 3 * v + 3)), 3 * v);
  }
  const { lo, hi } = bounds(g.pos);
  let scale, offset;
  if (item.fit.box) {
    const b = item.fit.box;
    scale = [0, 1, 2].map((k) => (b.hi[k] - b.lo[k]) / (hi[k] - lo[k]));
    offset = [0, 1, 2].map((k) => (b.lo[k] + b.hi[k]) / 2 - ((lo[k] + hi[k]) / 2) * scale[k]);
  } else {
    scale = [item.fit.scale, item.fit.scale, item.fit.scale];
    offset = [0, 1, 2].map((k) => item.fit.centre[k] - ((lo[k] + hi[k]) / 2) * scale[k]);
  }
  for (let v = 0; v < g.pos.length / 3; v++) {
    for (let k = 0; k < 3; k++) g.pos[3 * v + k] = g.pos[3 * v + k] * scale[k] + offset[k];
    // (Normals under a per-axis scale: divide by it.)
    const n = [0, 1, 2].map((k) => g.nor[3 * v + k] / scale[k]);
    const l = Math.hypot(...n) || 1;
    for (let k = 0; k < 3; k++) g.nor[3 * v + k] = n[k] / l;
  }
  const after = bounds(g.pos);
  console.log(`  placed: x ${after.lo[0].toFixed(3)}..${after.hi[0].toFixed(3)} y ${after.lo[1].toFixed(3)}..${after.hi[1].toFixed(3)} z ${after.lo[2].toFixed(3)}..${after.hi[2].toFixed(3)} (scale ${scale.map((s) => s.toFixed(3)).join(' ')})`);
}

// Pushes it out wherever it's within `margin` of (or inside) the body:
// for each of its points, the nearest point of the body and that point's
// outward normal say how far in it is. The pushes are spread smoothly over
// the piece (a weighted average over 3 cm), and it's done a few times over.
function clear(item, g, body) {
  const grid = new Grid(body.pos, 0.02);
  const n = g.pos.length / 3;
  const inside = () => {
    const need = new Float32Array(n * 3);
    let count = 0, worst = 0;
    for (let v = 0; v < n; v++) {
      const [x, y, z] = g.pos.subarray(3 * v, 3 * v + 3);
      const near = grid.near(x, y, z, 1, 0.06);
      if (!near.length) continue;
      // The deepest of the nearest few (a point can sit between two).
      let push = 0, dir = null;
      for (const [b] of near) {
        const nb = body.nor.subarray(3 * b, 3 * b + 3);
        const d = (x - body.pos[3 * b]) * nb[0] + (y - body.pos[3 * b + 1]) * nb[1] + (z - body.pos[3 * b + 2]) * nb[2];
        if (item.clear.margin - d > push) { push = item.clear.margin - d; dir = nb; }
      }
      if (push > 0 && push < 0.04) {
        need.set([dir[0] * push, dir[1] * push, dir[2] * push], 3 * v);
        count++;
        worst = Math.max(worst, push);
      }
    }
    return { need, count, worst };
  };
  const grid2 = new Grid(g.pos, 0.015);
  const neighbours = [];
  for (let v = 0; v < n; v++) neighbours.push(grid2.near(g.pos[3 * v], g.pos[3 * v + 1], g.pos[3 * v + 2], 400, 0.045));
  let state = inside();
  console.log(`  into the body: ${state.count} of ${n} points, deepest ${(state.worst * 1000).toFixed(1)} mm`);
  for (let pass = 0; pass < 6 && state.count; pass++) {
    const move = new Float32Array(n * 3);
    for (let v = 0; v < n; v++) {
      // (The point among its neighbours that needs the biggest push, eased
      // off with distance: so a whole neighbourhood moves together, both
      // faces of a strap or panel, and the piece keeps its shape.)
      let best = 0;
      for (const [u, d] of neighbours[v]) {
        const w = Math.exp(-((d / 0.02) ** 2));
        const size = w * Math.hypot(state.need[3 * u], state.need[3 * u + 1], state.need[3 * u + 2]);
        if (size > best) {
          best = size;
          for (let k = 0; k < 3; k++) move[3 * v + k] = w * state.need[3 * u + k];
        }
      }
    }
    for (let i = 0; i < g.pos.length; i++) g.pos[i] += move[i] * 1.05;
    state = inside();
    console.log(`  pass ${pass + 1}: ${state.count} points still within ${item.clear.margin * 1000} mm, deepest ${(state.worst * 1000).toFixed(1)} mm`);
  }
}

// Skin weights: head gear all on his head; a vest the blend of the nearest
// points of his plate carrier.
function weigh(item, g) {
  const n = g.pos.length / 3;
  g.joints = new Uint16Array(n * 4);
  g.weights = new Float32Array(n * 4);
  if (item.slot === 'head') {
    for (let v = 0; v < n; v++) { g.joints[4 * v] = HEAD; g.weights[4 * v] = 1; }
    return;
  }
  const grid = new Grid(PLATE.pos, 0.02);
  for (let v = 0; v < n; v++) {
    const near = grid.near(g.pos[3 * v], g.pos[3 * v + 1], g.pos[3 * v + 2], 6, 0.5);
    const sum = new Map();
    let total = 0;
    for (const [b, d] of near) {
      const w = 1 / (d + 0.01) ** 2;
      total += w;
      for (let k = 0; k < 4; k++) {
        const wk = PLATE.weights[4 * b + k];
        if (wk) sum.set(PLATE.joints[4 * b + k], (sum.get(PLATE.joints[4 * b + k]) || 0) + w * wk);
      }
    }
    const top = [...sum.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4);
    const t = top.reduce((s, [, w]) => s + w, 0);
    top.forEach(([j, w], k) => { g.joints[4 * v + k] = j; g.weights[4 * v + k] = w / t; });
  }
}

// From his rest pose into the skin's bind space (the inverse of each
// point's blend of joint matrices), so at rest it's exactly where it was put.
function toBind(g) {
  const n = g.pos.length / 3;
  for (let v = 0; v < n; v++) {
    const B = new Array(16).fill(0);
    for (let k = 0; k < 4; k++) {
      const w = g.weights[4 * v + k];
      if (!w) continue;
      const M = soldier.M[g.joints[4 * v + k]];
      for (let i = 0; i < 16; i++) B[i] += w * M[i];
    }
    const inv = invert(B);
    g.pos.set(apply(inv, g.pos.subarray(3 * v, 3 * v + 3)), 3 * v);
    // Normals by the inverse transpose of inv, i.e. B transposed.
    const nn = g.nor.subarray(3 * v, 3 * v + 3);
    const d = [B[0] * nn[0] + B[1] * nn[1] + B[2] * nn[2], B[4] * nn[0] + B[5] * nn[1] + B[6] * nn[2], B[8] * nn[0] + B[9] * nn[1] + B[10] * nn[2]];
    const l = Math.hypot(...d) || 1;
    g.nor.set([d[0] / l, d[1] / l, d[2] / l], 3 * v);
  }
}

// The file: a copy of his skeleton, and the piece on it.
async function write(item, g) {
  const doc = await io.read(SOLDIER);
  const root = doc.getRoot();
  const skin = root.listSkins()[0];
  let parent = null;
  for (const node of root.listNodes()) {
    if (node.getMesh()) {
      parent = parent || node.getParentNode();
      node.dispose();
    }
  }
  for (const a of root.listAnimations()) a.dispose();
  const buffer = root.listBuffers()[0];
  const acc = (type, array) => doc.createAccessor().setType(type).setArray(array).setBuffer(buffer);
  const texture = doc.createTexture(`${item.id}_color`).setImage(g.image.data).setMimeType(g.image.mime);
  const material = doc.createMaterial(item.id)
    .setBaseColorTexture(texture)
    .setMetallicFactor(0)
    .setRoughnessFactor(item.roughness)
    .setDoubleSided(true);
  const prim = doc.createPrimitive()
    .setIndices(acc('SCALAR', g.index.length / 3 > 21845 ? g.index : new Uint16Array(g.index)))
    .setAttribute('POSITION', acc('VEC3', g.pos))
    .setAttribute('NORMAL', acc('VEC3', g.nor))
    .setAttribute('TEXCOORD_0', acc('VEC2', g.uv))
    .setAttribute('JOINTS_0', acc('VEC4', new Uint8Array(g.joints)))
    .setAttribute('WEIGHTS_0', acc('VEC4', g.weights))
    .setMaterial(material);
  const node = doc.createNode(`gear_${item.id}`).setMesh(doc.createMesh(`gear_${item.id}`).addPrimitive(prim)).setSkin(skin);
  // (Head gear is left out of the first-person camera like his head.)
  node.setExtras({ gear: { id: item.id, slot: item.slot }, ...(item.slot === 'head' ? { firstPerson: 'head' } : {}) });
  parent.addChild(node);
  const asset = doc.getRoot().getAsset();
  asset.copyright = `"${item.title}" (${item.url}) by ${AUTHOR}, licensed under CC BY 4.0 (http://creativecommons.org/licenses/by/4.0/). Changed for Project Fish: fitted to the game's soldier and skinned to his skeleton${item.id === 'headset' ? ', the print on the ear cups rubbed off' : ''}${item.simplified ? ', simplified' : ''}, textures shrunk and stored as WebP, meshes compressed. The skeleton is the soldier's, from "Soldier Full Tactical Gear" by DanlyVostok (CC BY 4.0).`;
  asset.extras = { title: item.title, source: item.url, author: AUTHOR, license: 'CC-BY-4.0 (http://creativecommons.org/licenses/by/4.0/)' };
  doc.getRoot().getAsset().generator = 'Project Fish tools/gear/build_gear.mjs';
  await doc.transform(
    prune({ keepLeaves: false }),
    textureCompress({ encoder: sharp, targetFormat: 'webp', quality: 88, resize: [item.size, item.size] }),
    meshopt({ encoder: MeshoptEncoder, level: 'high' }),
  );
  const file = path.join(OUT, `${item.id}.glb`);
  fs.mkdirSync(OUT, { recursive: true });
  await io.write(file, doc);
  console.log(`  wrote ${file}: ${(fs.statSync(file).size / 1e6).toFixed(2)} MB, ${g.index.length / 3} triangles`);
}

for (const item of ITEMS) {
  if (ONLY && item.id !== ONLY) continue;
  const g = await readSource(item);
  place(item, g);
  clear(item, g, item.slot === 'head' ? HEAD_BODY : JACKET);
  weigh(item, g);
  toBind(g);
  await write(item, g);
}
