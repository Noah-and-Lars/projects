// Fits the outfit gloves (the same three downloads build_gear.mjs makes the
// soldier's from) to the arms that come with the animated guns (the Beretta
// 92FS, assets/beretta.glb, the FN 502, assets/fn502.glb, the Browning
// Hi-Power, assets/hipistol.glb, and the Makarov PM, assets/makarov.glb), so
// they can be worn on those arms too:
// assets/gear/gloves_<glove>_<rig>.glb.
//
// From the project-fish folder (after the guns are built):
//
//     node tools/gear/gun_gloves.mjs build/gear-src assets/beretta.glb assets/fn502.glb assets/hipistol.glb assets/makarov.glb assets/gear
//
// (Options: --only <glove id>, e.g. --only gloves_camo; --debug DIR writes
// what it found for each hand as JSON.)
//
// Each glove is rigged to the gun rig's own hand and finger bones with
// tools/gear/glove.mjs, exactly as on the soldier (its joints found from
// its shape, fitted to the rig's knuckles and finger joints, its thumb root
// the rig's, weights per finger shared over the glove's surface, bent part
// of the way into the rig's pose and bound there, the left glove mirrored
// for the right, simplified once rigged), only here the hand it's fitted to
// is the rig's, in the pose its arms were skinned in (their bind pose: a
// T-pose with flat hands for the Beretta's Mixamo arms, arms out in front
// for the FN 502's, the Makarov's and the Hi-Power's). glove.mjs reads a skeleton laid out
// like the soldier's, so it's handed one: the rig's bones under his bone
// names (see rigView), its own hand's skin as "his own glove" (for the
// fingertips' length and the fingers' thickness) and, for the FN 502 and the
// Hi-Power, its sleeve. (The Hi-Power's arms are two meshes, its gloves and
// its sleeves: the gloves are the arm mesh, cut away under the new glove,
// and the sleeves are read beside them, for the cuff to fit inside and take
// its weights from. Its hands, a Rigify rig's, have their finger bones
// under bones in the palm that carry no weight, so RIGS names them.)
//
// Then, for the rig:
// - The cuff takes the skin weights of the rig's own forearm where it is
//   (the nearest points of the arm mesh), so it turns with the rig's
//   forearm twist bones exactly as the rig's skin does, and the palm takes
//   the rig's split between the hand bone and the bones in the palm
//   (the FN 502's index0..little0).
// - On bare arms (the Beretta's) the cuff is widened clear of the
//   forearm's skin, so the skin never shows through it; into a sleeve (the
//   FN 502's) it's narrowed to fit inside it (glove.mjs) and drawn out all
//   the way round to 55 mm up the forearm (drawOut: a slanted cuff, or one
//   with a slit, would otherwise leave a gap under the sleeve's end).
// - Where the rig's own hand must be cut out of its arm mesh to make room
//   (everything past a plane a little way under the cuff's top edge, on
//   bare arms, or at the sleeve's end), it's written into the glove's node
//   extras (gunGlove, below), for the game to drop those triangles at load.
// Joints are the gun file's own bones, found by name: the glove's file has a
// copy of the rig's node tree (no meshes, no animations), and its skin
// lists the bones it's weighted to with its own inverse bind matrices.
//
// The glove node's extras:
//   gear: { id, slot: 'gloves', rig, thickness: { finger, thumb, palm } }
//     (thickness: its fingers', thumb's and palm's to the rig's own hand's)
//   gunGlove: {
//     rig, armMesh: the arm mesh's node name in the gun file,
//     sides: { L: { hand, plane: [nx, ny, nz, d], sideJoints: [...] }, R: ... },
//     cut: { L: metres, R: metres } (where the plane is, along the forearm
//       from the wrist; negative is up the arm: for reading only)
//   }
// To cut the rig's hand away (one pass over the arm mesh at load): a point
// belongs to the side whose sideJoints carry most of its weight (at least
// half); for that side, q = boneInverses[hand] x position (the point in the
// hand bone's bind frame, metres, whatever the file's quantization); if
// nx*qx + ny*qy + nz*qz + d > 0 the point is on the hand. Drop every
// triangle with a point on the hand (one new index buffer).
//
// The downloads aren't trusted: as in build_gear.mjs, each scene.gltf may
// only name files in its own folder.

import fs from 'node:fs';
import path from 'node:path';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { meshopt, prune, textureCompress } from '@gltf-transform/functions';
import { MeshoptDecoder, MeshoptEncoder, MeshoptSimplifier } from 'meshoptimizer';
import sharp from 'sharp';
import { rigGlove } from './glove.mjs';
import { subdivide } from './subdivide.mjs';

const args = process.argv.slice(2);
const option = (name, fallback) => (args.includes(name) ? args[args.indexOf(name) + 1] : fallback);
const positional = args.filter((a, i) => !a.startsWith('--') && !(i > 0 && args[i - 1].startsWith('--')));
const SOURCES = positional[0];
const OUT = positional[positional.length - 1];
const GUNS = positional.slice(1, -1);
if (!SOURCES || !OUT || !GUNS.length) {
  console.error('usage: node tools/gear/gun_gloves.mjs build/gear-src assets/beretta.glb assets/fn502.glb assets/hipistol.glb assets/makarov.glb assets/gear [--only gloves_camo] [--debug DIR]');
  process.exit(1);
}
const ONLY = option('--only', null);
const DEBUG = option('--debug', null);

// The gloves: as ITEMS in build_gear.mjs (the same downloads and the same
// settings for finding their joints; see there and glove.mjs), with 2048 px
// colour textures (the camo's normal map is 1024 px, as the download's is)
// and fewer triangles.
const GLOVES = [
  {
    id: 'gloves_black', short: 'black', source: 'tactical_combat_gloves_-_game_ready',
    title: 'Tactical Combat Gloves - Game Ready', url: 'https://sketchfab.com/3d-models/tactical-combat-gloves-game-ready-5e8f53fcba864163a199fa22baa653cb',
    maxTriangles: 12000, size: 2048, normalSize: 2048, roughness: 0.8,
    glove: { subdivide: { from: -0.3, to: -0.2 }, pick: (c) => c[0] < 0.35, axes: { along: [0, 1, 0], thumb: [1, 0, 0], back: [0, 0, 1] }, webs: [0.17, 0.17, 0.2], web: 0.3, thumb: { tip: [0.19, 0.25, -0.2], toward: [-0.15, 0.2, -0.08] } },
  },
  {
    id: 'gloves_olive', short: 'olive', source: 'tactical_combat_gloves_3d_model',
    title: 'Tactical Combat Gloves 3D Model', url: 'https://sketchfab.com/3d-models/tactical-combat-gloves-3d-model-fda69c63c472449f8ded80a9e6d91562',
    maxTriangles: 12000, size: 2048, roughness: 0.95, calm: { fine: 3, local: 48, keep: 0.55, tint: [0.84, 0.87, 0.76] },
    glove: { pick: (c) => c[2] < 0, axes: { along: [0, -1, 0], thumb: [0, 0, -1], back: [-1, 0, 0] }, webs: [0.18, 0.18, 0.2], web: 0.3, thumb: { tip: [0.27, 0.24, -0.05], toward: [-0.1, 0.15, -0.05] } },
  },
  {
    id: 'gloves_camo', short: 'camo', source: 'military_tactical_gloves_-_multicam_hard_knuckle',
    title: 'Military Tactical Gloves - MultiCam Hard Knuckle', url: 'https://sketchfab.com/3d-models/military-tactical-gloves-multicam-hard-knuckle-72342e418cd743209395bba607d5504e',
    maxTriangles: 12000, size: 2048, normalSize: 1024, roughness: 0.85,
    glove: { palmBlend: 1.5, pick: (c) => c[0] > 0, axes: { along: [0, 1, 0], thumb: [1, 0, 0], back: [0, 0, 1] }, webs: [0.17, 0.17, 0.2], web: 0.3, thumb: { tip: [0.18, 0.26, -0.18], toward: [-0.12, 0.17, -0.08] } },
  },
];
const AUTHOR = 'Exactly (https://sketchfab.com/txyrm70)';

// The rigs, by the gun file's name. sleeve: the arms have sleeves, ending
// `sleeveEnd` (metres along the forearm from the wrist, negative up the
// arm) at their shortest; the cuff then goes up it to `cuffTo` and the
// rig's hand is cut away at the sleeve's end. Bare arms: the cuff keeps its
// own length (at least `cuffTo`), is pushed `clearance` clear of the skin,
// and the hand is cut away `under` below the cuff's top edge.
// Optional, for a rig whose arms aren't one mesh or whose hands can't be
// found from their shape: armMesh (the node name of the mesh with the
// hands, else the mesh most weighted to them), sleeveMesh (a mesh of
// sleeves beside it), hands (a side's bone names, with S for its side:
// hand, fingers index to little, each its three bones, palm, the weighted
// bone in the palm before each finger, and thumb).
const finger = (name) => [1, 2, 3].map((k) => `${name}${k}_S`);
const RIGS = {
  beretta: { name: 'Beretta 92FS', bare: true, cuffTo: -0.03, clearance: 0.0025, under: 0.008 },
  fn502: { name: 'FN 502', sleeve: true, sleeveEnd: -0.03, cuffTo: -0.055, sleeveMargin: 0.004 },
  // (The same maker's arms as the FN 502's: its own gloves end at the wrist
  // and a strip of bare skin shows up to the sleeve's end, 28 mm up the
  // forearm; all of that is cut away.)
  makarov: { name: 'Makarov PM', sleeve: true, sleeveEnd: -0.03, cuffTo: -0.055, sleeveMargin: 0.004 },
  hipistol: {
    name: 'Browning Hi-Power', sleeve: true, sleeveEnd: -0.03, cuffTo: -0.055, sleeveMargin: 0.004,
    armMesh: 'hipistol_gloves', sleeveMesh: 'hipistol_sleeves',
    hands: {
      hand: 'hand_S', fingers: ['index', 'middle', 'ring', 'little'].map(finger),
      palm: [1, 2, 3, 4].map((k) => `palm${k}_S`), thumb: finger('thumb'),
    },
  },
};

await MeshoptEncoder.ready;
await MeshoptSimplifier.ready;
await MeshoptDecoder.ready;
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
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mulS = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const addS = (a, b, s) => [a[0] + b[0] * s, a[1] + b[1] * s, a[2] + b[2] * s];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const len = (a) => Math.hypot(a[0], a[1], a[2]);
const norm = (a) => mulS(a, 1 / (len(a) || 1));
const pointOf3 = (pos, v) => [pos[3 * v], pos[3 * v + 1], pos[3 * v + 2]];
const smoothstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
// (glove.mjs's CUFF: the cuff is wholly on the forearm this far up it from
// the wrist, and none of it this far down the hand.)
const CUFF_FOREARM = -0.024, CUFF_HAND = 0.014;
const translation = (p) => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, p[0], p[1], p[2], 1];
const bounds = (pos) => {
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < pos.length; i += 3) for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], pos[i + k]); hi[k] = Math.max(hi[k], pos[i + k]); }
  return { lo, hi };
};

// A grid of points for nearest-point lookups (as build_gear.mjs's).
class Grid {
  constructor(pos, cell = 0.01) {
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
      if (out.length >= k) {
        out.sort((a, b) => a[1] - b[1]);
        if (out[k - 1][1] <= ring * this.cell) return out.slice(0, k);
      }
    }
    out.sort((a, b) => a[1] - b[1]);
    return out.slice(0, k);
  }
}

// --- A gun rig's arms, in their bind pose ----------------------------------
// The arm mesh's bind pose in metres: its points (the file's, which may be
// quantized: scaled back by the size of a bone's unit there) and each bone's
// matrix (the inverse of its inverse bind matrix, scaled the same). It's a
// whole-space scale (and the quantization's shift, which cancels), so the
// rig's bones are rigid in it and the glove bound in it fits the animated
// bones as the arms' skin does.
const HANDISH = /(hand|index|middle|ring|pinky|little|thumb)/i;
const sideOf = (name) => (/(_|\.|\b)(L|Left)$/.test(name) || /^Left|_L_|\.L\./.test(name) ? 'L' : /(_|\.|\b)(R|Right)$/.test(name) || /^Right|_R_|\.R\./.test(name) ? 'R' : null);
async function readRig(file, opts) {
  const doc = await io.read(file);
  const root = doc.getRoot();
  const id = path.basename(file, '.glb');
  // The arm mesh: the skinned mesh most weighted to hands and fingers (or
  // the one named).
  let best = null;
  for (const node of root.listNodes()) {
    if (!node.getMesh() || !node.getSkin()) continue;
    if (opts.armMesh && node.getName() !== opts.armMesh) continue;
    const joints = node.getSkin().listJoints();
    let w = 0;
    for (const prim of node.getMesh().listPrimitives()) {
      const J = prim.getAttribute('JOINTS_0'), W = prim.getAttribute('WEIGHTS_0');
      const j = [], ww = [];
      for (let v = 0; v < J.getCount(); v++) { J.getElement(v, j); W.getElement(v, ww); for (let k = 0; k < 4; k++) if (HANDISH.test(joints[j[k]].getName())) w += ww[k]; }
    }
    if (!best || w > best.w) best = { node, w };
  }
  if (!best) throw new Error(`${id}: no arm mesh ${opts.armMesh || ''}`);
  const node = best.node;
  const prims = node.getMesh().listPrimitives();
  if (prims.length !== 1) throw new Error(`${id}: the arm mesh has ${prims.length} primitives (one expected)`);
  const prim = prims[0];
  const skin = node.getSkin();
  const joints = skin.listJoints();
  const ibm = skin.getInverseBindMatrices();
  // (And its sleeves, if they're a mesh of their own on the same bones:
  // their points after the arm mesh's, from sleeveFrom. Compressing the
  // file gives each mesh a skin of its own, its inverse bind matrices
  // taking in its own quantization: its joints are mapped to the arm
  // mesh's, and its points into the arm mesh's bind space, below.)
  const parts = [prim];
  let sleeve = null;
  if (opts.sleeveMesh) {
    const sleeveNode = root.listNodes().find((n) => n.getName() === opts.sleeveMesh && n.getMesh() && n.getSkin());
    if (!sleeveNode) throw new Error(`${id}: no skinned sleeve mesh ${opts.sleeveMesh}`);
    const sk = sleeveNode.getSkin();
    const map = sk.listJoints().map((j) => joints.indexOf(j));
    if (map.some((i) => i < 0)) throw new Error(`${id}: the sleeve mesh is skinned to bones the arm mesh's skin hasn't`);
    sleeve = { map, ibm: sk.getInverseBindMatrices() };
    parts.push(...sleeveNode.getMesh().listPrimitives());
  }
  const sleeveFrom = prim.getAttribute('POSITION').getCount();
  const count = parts.reduce((n, p) => n + p.getAttribute('POSITION').getCount(), 0);
  const jo = new Uint16Array(count * 4), we = new Float32Array(count * 4);
  const used = new Set();
  for (let v = 0, base = 0, j = [], w = []; base < count; base += parts[v].getAttribute('POSITION').getCount(), v++) {
    const J = parts[v].getAttribute('JOINTS_0'), W = parts[v].getAttribute('WEIGHTS_0');
    for (let i = 0; i < J.getCount(); i++) {
      J.getElement(i, j); W.getElement(i, w);
      if (v > 0) for (let k = 0; k < 4; k++) j[k] = sleeve.map[j[k]];
      jo.set(j, 4 * (base + i)); we.set(w, 4 * (base + i));
      for (let k = 0; k < 4; k++) if (w[k] > 0) used.add(j[k]);
    }
  }
  // (Only the bones the arms are weighted to: the others' inverse bind
  // matrices needn't mean anything.)
  const raw = joints.map((_, i) => invert(ibm.getElement(i, [])));
  const unit = (m) => Math.hypot(m[0], m[1], m[2]);
  const units = [...used].map((i) => unit(raw[i]));
  const u0 = units[0];
  if (units.some((x) => Math.abs(x / u0 - 1) > 1e-3)) throw new Error(`${id}: the arms' bones aren't all the same scale in their bind pose`);
  const s = 1 / u0;
  const bind = raw.map((m, i) => (used.has(i) ? mul([s, 0, 0, 0, 0, s, 0, 0, 0, 0, s, 0, 0, 0, 0, 1], m) : null));
  // (A sleeve point into the arm mesh's bind space: through any bone's
  // bind matrix in its own skin and back out of the arm mesh's.)
  let toArm = null;
  if (sleeve) {
    const k = sleeve.map.findIndex((i) => used.has(i) && i !== undefined);
    const via = (q) => mul(mul([s, 0, 0, 0, 0, s, 0, 0, 0, 0, s, 0, 0, 0, 0, 1], raw[sleeve.map[q]]), sleeve.ibm.getElement(q, []));
    toArm = via(k);
    const other = via(sleeve.map.length - 1 - [...sleeve.map].reverse().findIndex((i) => used.has(i)));
    if (other.some((x, i) => Math.abs(x - toArm[i]) > 1e-4)) throw new Error(`${id}: the sleeve mesh's bones don't agree on where it is`);
  }
  const pos = new Float32Array(count * 3), nor = new Float32Array(count * 3);
  for (let part = 0, base = 0, p = [], n = []; part < parts.length; base += parts[part].getAttribute('POSITION').getCount(), part++) {
    const P = parts[part].getAttribute('POSITION'), N = parts[part].getAttribute('NORMAL');
    for (let v = 0; v < P.getCount(); v++) {
      P.getElement(v, p); N.getElement(v, n);
      pos.set(part === 0 ? p.map((x) => x * s) : apply(toArm, p), 3 * (base + v));
      nor.set(norm(part === 0 ? n : applyDir(toArm, n)), 3 * (base + v));
    }
  }
  const names = joints.map((j) => j.getName());
  const at = (i) => [bind[i][12], bind[i][13], bind[i][14]];
  // The hands: a bone with five chains of bones under it (a finger's three,
  // with or without one in the palm before them; the thumb's three).
  const hands = {};
  const isJoint = new Set(joints);
  if (opts.hands) {
    // (Named in RIGS.)
    for (const S of ['L', 'R']) {
      const at2 = (name) => {
        const i = names.indexOf(name.replace(/S$/, S));
        if (i < 0) throw new Error(`${id}: no bone ${name.replace(/S$/, S)}`);
        return i;
      };
      const H = opts.hands;
      hands[S] = {
        hand: at2(H.hand),
        fingers: H.fingers.map((bones, c) => ({ palm: H.palm ? at2(H.palm[c]) : null, bones: bones.map(at2) })),
        thumb: { palm: null, bones: H.thumb.map(at2) },
      };
    }
  }
  for (const j of opts.hands ? [] : joints) {
    const kids = j.listChildren().filter((c) => isJoint.has(c));
    if (kids.length < 5) continue;
    const chains = kids.map((k) => {
      const chain = [k];
      for (;;) {
        const next = chain[chain.length - 1].listChildren().filter((c) => isJoint.has(c));
        if (next.length !== 1) break;
        chain.push(next[0]);
      }
      return chain.map((c) => joints.indexOf(c));
    });
    if (chains.length !== 5 || chains.some((c) => c.length < 3 || c.length > 4)) continue;
    const side = sideOf(j.getName());
    if (!side) throw new Error(`${id}: can't tell which side ${j.getName()} is`);
    const hand = joints.indexOf(j);
    const wrist = at(hand);
    const digits = chains.map((c) => ({ palm: c.length === 4 ? c[0] : null, bones: c.slice(-3) }));
    // The thumb: its first bone nearest the wrist; the index finger's
    // knuckle nearest the thumb, and the others in turn from it.
    digits.sort((a, b) => len(sub(at(a.bones[0]), wrist)) - len(sub(at(b.bones[0]), wrist)));
    const thumb = digits.shift();
    if (thumb.palm !== null) throw new Error(`${id}: the thumb has four bones`);
    digits.sort((a, b) => len(sub(at(a.bones[0]), at(thumb.bones[1]))) - len(sub(at(b.bones[0]), at(thumb.bones[1]))));
    const index = digits.shift();
    digits.sort((a, b) => len(sub(at(a.bones[0]), at(index.bones[0]))) - len(sub(at(b.bones[0]), at(index.bones[0]))));
    hands[side] = { hand, fingers: [index, ...digits], thumb };
  }
  if (!hands.L || !hands.R) throw new Error(`${id}: didn't find both hands`);
  // For each side: its points, its hand group (the hand, the bones in the
  // palm, the fingers'), and its forearm (the bone most weighted near the
  // wrist that isn't the hand's: the cuff's; and the forearm's line, from
  // the middle of its points 4 to 15 cm from the wrist).
  for (const S of ['L', 'R']) {
    const h = hands[S];
    h.group = new Set([h.hand, ...h.fingers.flatMap((f) => [f.palm, ...f.bones]), ...h.thumb.bones].filter((x) => x !== null));
    h.palmBones = [h.hand, ...h.fingers.map((f) => f.palm).filter((x) => x !== null)];
    h.wrist = at(h.hand);
    h.points = [];
    h.sleeve = []; // (the sleeve mesh's, if it has one)
    const near = new Map();
    let mid = [0, 0, 0], midN = 0;
    for (let v = 0; v < count; v++) {
      let sw = 0;
      for (let k = 0; k < 4; k++) if (sideOf(names[jo[4 * v + k]]) === S) sw += we[4 * v + k];
      if (sw < 0.5) continue;
      (v < sleeveFrom ? h.points : h.sleeve).push(v);
      const d = len(sub(pointOf3(pos, v), h.wrist));
      let handW = 0;
      for (let k = 0; k < 4; k++) if (h.group.has(jo[4 * v + k])) handW += we[4 * v + k];
      if (d < 0.03) for (let k = 0; k < 4; k++) if (!h.group.has(jo[4 * v + k]) && we[4 * v + k] > 0) near.set(jo[4 * v + k], (near.get(jo[4 * v + k]) || 0) + we[4 * v + k]);
      if (d > 0.04 && d < 0.15 && handW < 0.1) { mid = add(mid, pointOf3(pos, v)); midN++; }
    }
    h.twist = [...near.entries()].sort((a, b) => b[1] - a[1])[0][0];
    h.elbowSide = mulS(mid, 1 / midN);
    h.axis = norm(sub(h.wrist, h.elbowSide)); // (towards the hand)
    h.sideJoints = joints.map((_, i) => i).filter((i) => sideOf(names[i]) === S && used.has(i));
  }
  // The gun's credit, for the glove's.
  const copyright = root.getAsset().copyright || '';
  const m = /"([^"]+)" \((https?:[^)]+)\) by ([^(]+?) \(/.exec(copyright);
  const credit = m ? `"${m[1]}" by ${m[3].trim()} (CC BY 4.0)` : 'the gun model';
  return { id, file, doc, node, armMesh: node.getName(), joints, names, bind, used, pos, nor, jo, we, index: prim.getIndices().getArray(), hands, s, credit, sleeveFrom };
}

// The rig seen as glove.mjs expects the soldier: his hand bones' names on
// the rig's bones (and a stand-in at the forearm's middle, for the line of
// his forearm), the rig's own hand's skin as his own glove, and (with
// sleeves) the rig's sleeve as his.
const FINGER_NAMES = ['Index', 'Mid', 'Ring', 'Pinky'];
function rigView(rig, S, opts) {
  const h = rig.hands[S];
  const list = []; // [name, rig joint or null, world]
  const push = (name, j, world) => { list.push({ name: `CC_Base_${S}_${name}`, rigJoint: j, world }); return list.length - 1; };
  const handI = push('Hand', h.hand, rig.bind[h.hand]);
  push('Forearm', null, translation(h.elbowSide));
  // (The cuff's bone: the rig's forearm bone turned as it is, but at the
  // wrist, so glove.mjs's turns of it, part of the way to the hand's line,
  // are about the wrist however far up the arm the bone itself starts.
  // The cuff takes the rig's own skin weights afterwards.)
  const twistI = push('ForearmTwist02', h.twist, [...rig.bind[h.twist].slice(0, 12), ...h.wrist, 1]);
  const digitI = [];
  h.fingers.forEach((f, c) => digitI.push(f.bones.map((j, k) => push(`${FINGER_NAMES[c]}${k + 1}`, j, rig.bind[j]))));
  digitI.push(h.thumb.bones.map((j, k) => push(`Thumb${k + 1}`, j, rig.bind[j])));
  const toView = new Map(); // rig joint -> view joint (for the own hand's weights)
  toView.set(h.hand, handI);
  h.fingers.forEach((f, c) => { if (f.palm !== null) toView.set(f.palm, handI); f.bones.forEach((j, k) => toView.set(j, digitI[c][k])); });
  h.thumb.bones.forEach((j, k) => toView.set(j, digitI[4][k]));
  // His own glove: the rig's hand (points mostly on the hand group).
  const own = { pos: [], joints: [], weights: [] };
  const sleeve = { pos: [] };
  for (const v of h.points) {
    let hw = 0;
    for (let k = 0; k < 4; k++) if (h.group.has(rig.jo[4 * v + k])) hw += rig.we[4 * v + k];
    const p = pointOf3(rig.pos, v);
    if (hw >= 0.5) {
      own.pos.push(...sub(p, h.wrist));
      for (let k = 0; k < 4; k++) {
        const j = rig.jo[4 * v + k];
        own.joints.push(toView.has(j) ? toView.get(j) : 65535);
        own.weights.push(rig.we[4 * v + k]);
      }
    } else if (opts.sleeve && !opts.sleeveMesh && dot(sub(p, h.wrist), h.axis) < opts.sleeveEnd + 0.002) {
      sleeve.pos.push(...sub(p, h.wrist));
    }
  }
  // (A sleeve mesh of its own: all of it.)
  for (const v of h.sleeve) sleeve.pos.push(...sub(pointOf3(rig.pos, v), h.wrist));
  own.pos = new Float32Array(own.pos); own.joints = new Uint16Array(own.joints); own.weights = new Float32Array(own.weights);
  sleeve.pos = new Float32Array(sleeve.pos);
  const soldier = {
    // (All of it moved so the wrist is at the origin: glove.mjs's weights
    // can fall short of a whole by a percent or so where many fingers share
    // a point, and in its fitting step that pulls the point towards the
    // origin by as much of its distance from it. Here that's a fraction of
    // a millimetre; with the rig's hands 0.76 m out from its middle it
    // would be spikes of 5 to 10 mm. Moved back after.)
    joints: list.map((e) => ({ getName: () => e.name, getWorldMatrix: () => mul(translation(mulS(h.wrist, -1)), e.world) })),
    meshes: new Map([['Object_129', own], ['Mark_Kitel_1_arms', sleeve]]),
  };
  return { soldier, list, handI, twistI, digitI, toView };
}

// --- The glove downloads (as build_gear.mjs) --------------------------------
function checkURIs(folder) {
  const json = JSON.parse(fs.readFileSync(path.join(folder, 'scene.gltf'), 'utf8'));
  const root = path.resolve(folder);
  for (const entry of [...(json.buffers || []), ...(json.images || [])]) {
    const uri = entry.uri;
    if (uri === undefined) continue;
    if (typeof uri !== 'string') throw new Error(`${folder}: a URI that isn't text`);
    if (/^data:/i.test(uri)) continue;
    let file;
    try {
      file = decodeURIComponent(uri);
    } catch {
      throw new Error(`${folder}: a URI that can't be read: ${uri}`);
    }
    const inside = path.resolve(root, file);
    if (/^[a-z][a-z0-9+.-]*:/i.test(uri) || path.isAbsolute(file) || file.includes('\\') || file.includes('\0')
      || !inside.startsWith(root + path.sep)) {
      throw new Error(`${folder}: scene.gltf names a file outside its folder: ${uri}`);
    }
    const real = fs.realpathSync(inside);
    if (!real.startsWith(fs.realpathSync(root) + path.sep)) throw new Error(`${folder}: ${uri} links outside its folder`);
  }
}
async function readSource(item) {
  const folder = path.join(SOURCES, item.source);
  const licence = fs.readFileSync(path.join(folder, 'license.txt'), 'utf8');
  if (!licence.includes('CC-BY-4.0') || !licence.includes(item.url)) throw new Error(`${item.source}: not the CC BY 4.0 model expected (${item.url})`);
  checkURIs(folder);
  const doc = await io.read(path.join(folder, 'scene.gltf'));
  const pos = [], nor = [], uv = [], index = [];
  let image = null, normalImage = null;
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
      const ntex = prim.getMaterial().getNormalTexture();
      if (ntex && !normalImage) normalImage = { data: ntex.getImage(), mime: ntex.getMimeType() };
    }
  }
  return { pos: new Float32Array(pos), nor: new Float32Array(nor), uv: new Float32Array(uv), index: new Uint32Array(index), image, normalImage };
}
async function calmTexture(image, { fine, local, keep, tint = [1, 1, 1] }) {
  const read = () => sharp(Buffer.from(image.data)).removeAlpha();
  const { width, height } = await read().metadata();
  const smooth = await read().blur(fine).raw().toBuffer();
  const mean = await read().blur(local).raw().toBuffer();
  const out = Buffer.alloc(smooth.length);
  for (let i = 0; i < out.length; i++) out[i] = Math.max(0, Math.min(255, Math.round((mean[i] + (smooth[i] - mean[i]) * keep) * tint[i % 3])));
  const png = await sharp(out, { raw: { width, height, channels: 3 } }).png().toBuffer();
  return { data: new Uint8Array(png), mime: 'image/png' };
}
function pick(g, test) {
  const keep = [];
  for (let t = 0; t < g.index.length; t += 3) {
    const c = [0, 1, 2].map((k) => (g.pos[3 * g.index[t] + k] + g.pos[3 * g.index[t + 1] + k] + g.pos[3 * g.index[t + 2] + k]) / 3);
    if (test(c)) keep.push(g.index[t], g.index[t + 1], g.index[t + 2]);
  }
  const remap = new Map();
  const index = new Uint32Array(keep.map((i) => {
    if (!remap.has(i)) remap.set(i, remap.size);
    return remap.get(i);
  }));
  const pos = new Float32Array(remap.size * 3), nor = new Float32Array(remap.size * 3), uv = new Float32Array(remap.size * 2);
  for (const [i, j] of remap) {
    pos.set(g.pos.subarray(3 * i, 3 * i + 3), 3 * j);
    nor.set(g.nor.subarray(3 * i, 3 * i + 3), 3 * j);
    uv.set(g.uv.subarray(2 * i, 2 * i + 2), 2 * j);
  }
  return { ...g, pos, nor, uv, index };
}
// The download's left glove (subdivided first if it's low-poly), as in
// build_gear.mjs's rigBoth.
function leftGlove(item, g) {
  let left = pick(g, item.glove.pick);
  if (item.glove.subdivide) {
    const along = item.glove.axes.along, { lo, hi } = bounds(left.pos);
    const mid = [0, 1, 2].map((k) => (lo[k] + hi[k]) / 2);
    const l = Math.hypot(...along);
    const { from, to } = item.glove.subdivide;
    const u = (p) => ((p[0] - mid[0]) * along[0] + (p[1] - mid[1]) * along[1] + (p[2] - mid[2]) * along[2]) / l;
    left = subdivide(left, (p) => (u(p) - from) / (to - from));
  }
  return left;
}

// --- One glove on one of the rig's hands ------------------------------------
function gloveOnRig(item, left, rig, S, opts, log) {
  const view = rigView(rig, S, opts);
  const h = rig.hands[S];
  const cfg = { ...item.glove, cuffTo: opts.cuffTo, sleeveMargin: opts.sleeveMargin };
  {
    const mcp = h.fingers.map((f) => rig.bind[f.bones[0]]).map((m) => [m[12], m[13], m[14]]);
    const mm = mulS(mcp.reduce(add, [0, 0, 0]), 0.25);
    log(`  ${S}: the hand is at ${(Math.acos(dot(norm(sub(mm, h.wrist)), h.axis)) * 180 / Math.PI).toFixed(0)} degrees to the forearm in the bind pose`);
  }
  const out = rigGlove({ ...item, glove: cfg }, left, view.soldier, S, (m) => log(m));
  for (const key of ['pos', 'aligned']) for (let i = 0; i < out[key].length; i += 3) for (let k = 0; k < 3; k++) out[key][i + k] += h.wrist[k];
  for (const [vi, m] of out.pose) out.pose.set(vi, mul(translation(h.wrist), m));
  const n = out.pos.length / 3;
  const B = out.bones;
  // The view's joints in the glove's weights (B: 0 hand, 1 forearm, 2 + 3c
  // + k digit c's bone k) and each one's bind (glove.mjs's pose) and rest
  // (the rig's bind pose) matrices.
  const viewOf = [view.handI, view.twistI, ...view.digitI.flat()];
  const restOfView = (vi) => view.list[vi].world;
  const poseOf = (vi) => out.pose.get(vi);
  // Each point where glove.mjs's skinning puts it in the rig's bind pose.
  const M = viewOf.map((vi) => mul(restOfView(vi), invert(poseOf(vi))));
  const P = new Float32Array(n * 3), PN = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const A = new Array(16).fill(0);
    // (glove.mjs's weights can fall a little short of a whole: as shares.)
    let sw = 0;
    for (let b = 0; b < B; b++) sw += out.wts[i * B + b];
    for (let b = 0; b < B; b++) { const w = out.wts[i * B + b] / sw; if (w) for (let k = 0; k < 16; k++) A[k] += w * M[b][k]; }
    P.set(apply(A, pointOf3(out.pos, i)), 3 * i);
    PN.set(norm(applyDir(A, pointOf3(out.nor, i))), 3 * i);
  }
  // Into a sleeve: the cuff drawn out all the way round to `cuffTo`.
  if (opts.sleeve) {
    const before = P.slice();
    drawOut(P, h, opts.cuffTo, S, log);
    // (What it drew up the arm keeps the weights it had where it was, part
    // on the hand: 50 mm up the forearm, that swung it out through the
    // sleeve when the wrist bent (the support hand in the shot and the
    // reloads). Those points go over to the forearm as glove.mjs's own cuff
    // does, by how far up the arm they now are: wholly from 24 mm up.)
    let moved = 0;
    for (let i = 0; i < n; i++) {
      if (P[3 * i] === before[3 * i] && P[3 * i + 1] === before[3 * i + 1] && P[3 * i + 2] === before[3 * i + 2]) continue;
      const a = dot(sub(pointOf3(P, i), h.wrist), h.axis);
      let sw = 0;
      for (let b = 0; b < B; b++) sw += out.wts[i * B + b];
      const fore = out.wts[i * B + 1] / sw;
      const want = 1 - smoothstep(CUFF_FOREARM, CUFF_HAND, a);
      if (want <= fore) continue;
      const k = (1 - want) / (1 - fore);
      for (let b = 0; b < B; b++) out.wts[i * B + b] = b === 1 ? want * sw : out.wts[i * B + b] * k;
      moved++;
    }
    log(`  ${S}: ${moved} points drawn up the sleeve moved over to the forearm`);
  }
  // The rig's own skin, its points on this side: for the cuff's weights
  // (all of them) and the palm's (those on the hand group).
  const sidePos = new Float32Array(h.points.length * 3);
  h.points.forEach((v, k) => sidePos.set(pointOf3(rig.pos, v), 3 * k));
  const grid = new Grid(sidePos, 0.01);
  const palmSet = new Set(h.palmBones);
  const round = roundArm(h);
  const cyl = (p) => { const [a, ang] = round(p); return [a, 0.03 * Math.cos(ang), 0.03 * Math.sin(ang)]; };
  const cylPoints = [...h.points, ...h.sleeve].filter((v) => round(pointOf3(rig.pos, v))[0] < 0.03);
  const cylPos = new Float32Array(cylPoints.length * 3);
  cylPoints.forEach((v, k) => cylPos.set(cyl(pointOf3(rig.pos, v)), 3 * k));
  const cylGrid = new Grid(cylPos, 0.01);
  // Where its cuff reaches: up the forearm from the wrist, the shortest
  // way round (the least reach of 24 strips round the arm).
  const reach = reachRound(P, h, 24);
  const cuffTop = Math.max(...reach.filter(Number.isFinite));
  const cut = opts.sleeve ? opts.sleeveEnd : cuffTop + opts.under;
  // (Widening the cuff, below, only moves it out from the forearm's line,
  // so it doesn't change these.)
  const weights = []; // per point: Map rig joint -> weight
  for (let i = 0; i < n; i++) {
    const wmap = new Map();
    const addW = (j, w) => { if (w > 0) wmap.set(j, (wmap.get(j) || 0) + w); };
    const p = pointOf3(P, i);
    let hand = out.wts[i * B], fore = out.wts[i * B + 1], rest = 1;
    {
      // Over the rig's skin that's kept (up to the cut, and 4 mm past it)
      // the cuff takes the skin's own weights wholly, eased over to
      // glove.mjs's by 16 mm past the cut: so where they overlap the two
      // bend the same and the skin can't come through the cuff on the
      // inside of a bent wrist (glove.mjs's cuff is part on the hand from
      // 24 mm up the forearm, which the skin there mostly isn't).
      let sw = 0;
      for (let b = 0; b < B; b++) sw += out.wts[i * B + b];
      const want = (1 - smoothstep(cut + 0.004, cut + 0.016, dot(sub(p, h.wrist), h.axis))) * sw;
      if (want > fore) { rest = (sw - want) / (sw - fore); hand *= rest; fore = want; }
    }
    const near = hand > 0 ? grid.near(p[0], p[1], p[2], 8, 0.08) : [];
    if (fore > 0) {
      // The rig's skin weights here: of its nearest points round the
      // forearm's line (by how far along it and which way round, not how
      // far out: so the cuff's layers, and its inside and outside, all
      // take the same and move together).
      const sum = new Map();
      let total = 0;
      const c = cyl(p);
      for (const [k, d] of cylGrid.near(c[0], c[1], c[2], 8, 0.08)) {
        const v = cylPoints[k];
        const w = 1 / (d + 0.004) ** 2;
        total += w;
        for (let q = 0; q < 4; q++) { const j = rig.jo[4 * v + q], wj = rig.we[4 * v + q]; if (wj) sum.set(j, (sum.get(j) || 0) + w * wj); }
      }
      if (!total) addW(h.twist, fore);
      else for (const [j, w] of sum) addW(j, fore * w / total);
    }
    if (hand > 0) {
      // The rig's split of the palm between its hand bone and the bones
      // in its palm, here.
      const sum = new Map();
      let total = 0;
      for (const [k, d] of near) {
        const v = h.points[k];
        const w = 1 / (d + 0.004) ** 2;
        for (let q = 0; q < 4; q++) { const j = rig.jo[4 * v + q], wj = rig.we[4 * v + q]; if (wj && palmSet.has(j)) { sum.set(j, (sum.get(j) || 0) + w * wj); total += w * wj; } }
      }
      if (!total) addW(h.hand, hand);
      else for (const [j, w] of sum) addW(j, hand * w / total);
    }
    for (let b = 2; b < B; b++) addW(view.list[viewOf[b]].rigJoint, out.wts[i * B + b] * rest);
    weights.push(wmap);
  }
  // Up to four bones a point.
  const joints = new Uint16Array(n * 4), wts4 = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) {
    const top = [...weights[i].entries()].filter(([, w]) => w > 1e-3).sort((a, b) => b[1] - a[1]).slice(0, 4);
    const t = top.reduce((x, [, w]) => x + w, 0);
    top.forEach(([j, w], k) => { joints[4 * i + k] = j; wts4[4 * i + k] = w / t; });
  }
  // Bare arms: the cuff pushed clear of the forearm's skin.
  if (opts.bare) clearCuff(P, joints, wts4, rig, h, opts, log);
  if (opts.sleeve && cuffTop > cut - 0.01) log(`  ${S}: WARNING the cuff reaches only ${(cuffTop * 1000).toFixed(0)} mm, not 10 mm past the sleeve's end`);
  log(`  ${S}: cuff reaches ${(cuffTop * 1000).toFixed(0)} mm up the forearm; the rig's hand is cut away from ${(cut * 1000).toFixed(0)} mm`);
  // The plane, in the hand bone's bind frame (metres).
  const Bh = rig.bind[h.hand];
  const R = [[Bh[0], Bh[4], Bh[8]], [Bh[1], Bh[5], Bh[9]], [Bh[2], Bh[6], Bh[10]]];
  const nl = [0, 1, 2].map((c) => R[0][c] * h.axis[0] + R[1][c] * h.axis[1] + R[2][c] * h.axis[2]);
  const t = [Bh[12], Bh[13], Bh[14]];
  const P0 = addS(h.wrist, h.axis, cut);
  const plane = [...nl, dot(h.axis, sub(t, P0))];
  // Into bind space: the rig's bind pose for every bone but the fingers',
  // which keep glove.mjs's.
  const ibmOf = new Map();
  for (const [vi, m] of out.pose) {
    const j = view.list[vi].rigJoint;
    if (j !== null && j !== h.hand && j !== h.twist) ibmOf.set(j, invert(m));
  }
  const ibm = (j) => ibmOf.get(j) || invert(rig.bind[j]);
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const A = new Array(16).fill(0);
    for (let k = 0; k < 4; k++) {
      const w = wts4[4 * i + k];
      if (!w) continue;
      const Mj = mul(rig.bind[joints[4 * i + k]], ibm(joints[4 * i + k]));
      for (let q = 0; q < 16; q++) A[q] += w * Mj[q];
    }
    pos.set(apply(invert(A), pointOf3(P, i)), 3 * i);
    const nn = pointOf3(PN, i);
    nor.set(norm([A[0] * nn[0] + A[1] * nn[1] + A[2] * nn[2], A[4] * nn[0] + A[5] * nn[1] + A[6] * nn[2], A[8] * nn[0] + A[9] * nn[1] + A[10] * nn[2]]), 3 * i);
  }
  const usedJoints = new Set();
  for (let i = 0; i < n * 4; i++) if (wts4[i]) usedJoints.add(joints[i]);
  for (const g of h.group) usedJoints.add(g);
  return {
    pos, nor, uv: out.uv, index: out.index, joints, weights: wts4, wts: out.wts, bones: B, aligned: out.aligned,
    ibm, usedJoints, thickness: out.thickness, plane, cut, cuffTop, P,
  };
}

// Angles round the forearm (radians), from a fixed direction across it.
function roundArm(h) {
  const e1 = norm(cross(h.axis, Math.abs(h.axis[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0]));
  const e2 = cross(h.axis, e1);
  return (p) => { const d = sub(p, h.wrist); return [dot(d, h.axis), Math.atan2(dot(d, e2), dot(d, e1))]; };
}
// How far up the forearm the cuff reaches (metres from the wrist, negative
// up the arm) in each of `bins` strips round it.
function reachRound(P, h, bins) {
  const at = roundArm(h);
  const reach = new Array(bins).fill(Infinity);
  for (let i = 0; i < P.length / 3; i++) {
    const [a, ang] = at(pointOf3(P, i));
    if (a > 0.02) continue;
    const s2 = ((Math.round(ang / (2 * Math.PI) * bins) % bins) + bins) % bins;
    reach[s2] = Math.min(reach[s2], a);
  }
  return reach;
}
// A cuff going up a sleeve, drawn out all the way round to `to`: glove.mjs
// draws it out only by its longest reach, and a cuff cut on a slant, or with
// a slit or a notch, would stop short of the sleeve's end somewhere round it
// and leave a gap there. Strip by strip round the arm (smoothly from one to
// the next), the cuff from 12 mm above where it stops in that strip is
// stretched along the forearm until it reaches `to`.
function drawOut(P, h, to, S, log) {
  const BINS = 36;
  const raw = reachRound(P, h, BINS);
  // (Each strip the shortest of it and its neighbours: an empty strip
  // between two flaps takes theirs.)
  const reach = raw.map((_, b) => Math.max(...[-1, 0, 1].map((d) => raw[(b + d + BINS) % BINS]).filter(Number.isFinite)));
  const at = roundArm(h);
  const gauss = (ang, f) => {
    let sw = 0, sk = 0;
    for (let b = 0; b < BINS; b++) {
      let d = ang - (b / BINS) * 2 * Math.PI;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      const w = Math.exp(-((d / (1.2 * 2 * Math.PI / BINS)) ** 2));
      sw += w; sk += w * f(b);
    }
    return sk / sw;
  };
  const smoothReach = (ang) => gauss(ang, (b) => reach[b]);
  const factor = (ang) => {
    // (A Gaussian over the strips round the arm.)
    let sw = 0, sk = 0;
    for (let b = 0; b < BINS; b++) {
      let d = ang - (b / BINS) * 2 * Math.PI;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      const w = Math.exp(-((d / (1.2 * 2 * Math.PI / BINS)) ** 2));
      const from = reach[b] + 0.012;
      const k = reach[b] > to ? (to - from) / (reach[b] - from) : 1;
      sw += w; sk += w * k;
    }
    return sk / sw;
  };
  let most = 1;
  for (let i = 0; i < P.length / 3; i++) {
    const p = pointOf3(P, i);
    const [a, ang] = at(p);
    if (a > 0.02) continue;
    const k = factor(ang);
    if (k <= 1) continue;
    // (Stretched from 12 mm above where it stops near here, smoothly round.)
    const from = smoothReach(ang) + 0.012;
    if (a >= from) continue;
    P.set(addS(p, h.axis, (a - from) * (k - 1)), 3 * i);
    most = Math.max(most, k);
  }
  log(`  ${S}: cuff drawn out to ${(to * 1000).toFixed(0)} mm all round (it reached ${(Math.max(...raw.filter(Number.isFinite)) * 1000).toFixed(0)} mm at its shortest; stretched up to ${most.toFixed(2)} times)`);
}

// Widens the cuff wherever it's within `clearance` of (or inside) the rig's
// bare forearm, in the bind pose, so the skin never shows through it: round
// the forearm's line, strip by strip (4 mm along it, 24 round it), every
// point of the cuff in a strip is moved out by the same share, what its
// outermost point there needs (so its layers, a strap over the cuff, its
// lining inside it, stay as they are), smoothed over the strips near it and eased
// off from the wrist to 2 cm into the hand.
function clearCuff(P, joints, wts4, rig, h, opts, log) {
  const at = roundArm(h);
  const STEP = 0.004, ANG = 24;
  const ai = (a) => Math.round(a / STEP), si = (ang) => ((Math.round(ang / (2 * Math.PI) * ANG) % ANG) + ANG) % ANG;
  const radius = (p, a) => len(sub(sub(p, h.wrist), mulS(h.axis, a)));
  // The skin's outer radius in each strip (up the arm from the wrist).
  const skinR = new Map();
  for (const v of h.points) {
    const p = pointOf3(rig.pos, v);
    const [a, ang] = at(p);
    if (a < -0.15 || a > 0.004) continue;
    const k = `${ai(a)},${si(ang)}`;
    skinR.set(k, Math.max(skinR.get(k) ?? 0, radius(p, a)));
  }
  const skinAt = (a, ang) => {
    const A = Math.min(ai(a), ai(0.004)), S2 = si(ang);
    let r = 0;
    for (let da = -1; da <= 1; da++) r = Math.max(r, skinR.get(`${A + da},${S2}`) ?? 0);
    return r;
  };
  // The share each strip of the cuff needs: its outermost layer pushed
  // clear of the skin there. (Only the outermost: what's under it, the
  // cuff's lining or a layer under a strap, is hidden whether or not the
  // skin goes through it, and pushing the whole cuff out to clear its
  // lining made it stand off the arm by 2 cm.)
  const n = P.length / 3;
  const outer = new Map();
  for (let i = 0; i < n; i++) {
    const p = pointOf3(P, i);
    const [a, ang] = at(p);
    if (a > 0.02 || a < -0.15) continue;
    const k = `${ai(a)},${si(ang)}`;
    const r = radius(p, a);
    if (r > (outer.get(k)?.r ?? 0)) outer.set(k, { r, a, ang });
  }
  const need = new Map();
  let count = 0;
  for (const [k, { r, a, ang }] of outer) {
    const want = skinAt(a, ang) + opts.clearance;
    if (!want || r >= want) continue;
    count++;
    need.set(k, want / r);
  }
  // (Smoothed: each strip takes the most of those near it, eased off over
  // 8 mm along the arm and two strips round it.)
  const shareAt = (a, ang) => {
    const A = ai(a), S2 = si(ang);
    let k = 1;
    for (let da = -4; da <= 4; da++) for (let ds = -3; ds <= 3; ds++) {
      const b = (S2 + ds + ANG) % ANG;
      const x = need.get(`${A + da},${b}`);
      if (!x) continue;
      // (By the point's own distance from the strip's middle, so the share
      // changes smoothly from point to point.)
      let dAng = ang - (b / ANG) * 2 * Math.PI;
      dAng = Math.atan2(Math.sin(dAng), Math.cos(dAng)) / (2 * Math.PI / ANG);
      const w = Math.exp(-(((a - (A + da) * STEP) / 0.008) ** 2) - (dAng / 1.5) ** 2);
      k = Math.max(k, 1 + (x - 1) * w);
    }
    return k;
  };
  let most = 0;
  for (let i = 0; i < n; i++) {
    const p = pointOf3(P, i);
    const [a, ang] = at(p);
    if (a > 0.02 || a < -0.16) continue;
    const k = 1 + (shareAt(a, ang) - 1) * (1 - Math.min(1, Math.max(0, a / 0.02)) ** 2);
    if (k <= 1) continue;
    const c = addS(h.wrist, h.axis, a);
    const q = add(c, mulS(sub(p, c), k));
    most = Math.max(most, len(sub(q, p)));
    P.set(q, 3 * i);
  }
  log(`  ${h === rig.hands.L ? 'L' : 'R'}: cuff widened over the bare forearm: in ${count} of its strips its outside was within ${opts.clearance * 1000} mm of the skin; moved out by up to ${(most * 1000).toFixed(1)} mm`);
}

// --- Both hands, simplified, and the file -----------------------------------
function bothHands(item, left, rig, opts) {
  const log = (m) => console.log(m);
  const hands = ['L', 'R'].map((S) => gloveOnRig(item, left, rig, S, opts, log));
  // Simplified once rigged, both hands alike (build_gear.mjs's rigBoth).
  const keep = item.maxTriangles / 2;
  let count = left.pos.length / 3;
  let simplified = false;
  if (left.index.length / 3 > keep) {
    const h = hands[0];
    const [index] = MeshoptSimplifier.simplifyWithAttributes(Uint32Array.from(left.index), h.aligned, 3, new Float32Array(h.wts), h.bones,
      new Array(h.bones).fill(1), null, Math.floor(keep) * 3, 0.05, []);
    const used = new Map();
    for (const i of index) if (!used.has(i)) used.set(i, used.size);
    const pickArr = (a, per) => { const o = new a.constructor(used.size * per); for (const [i, j] of used) o.set(a.subarray(i * per, i * per + per), j * per); return o; };
    for (const hand of hands) {
      const flip = hand === hands[1];
      hand.pos = pickArr(hand.pos, 3); hand.nor = pickArr(hand.nor, 3); hand.uv = pickArr(hand.uv, 2);
      hand.joints = pickArr(hand.joints, 4); hand.weights = pickArr(hand.weights, 4);
      hand.index = Uint32Array.from(index, (i) => used.get(i));
      if (flip) for (let t = 0; t < hand.index.length; t += 3) { const x = hand.index[t + 1]; hand.index[t + 1] = hand.index[t + 2]; hand.index[t + 2] = x; }
    }
    console.log(`  simplified from ${count} points, ${left.index.length / 3} triangles a hand to ${used.size} points, ${index.length / 3}`);
    count = used.size;
    simplified = true;
  }
  const out = { hands, simplified };
  const cat = (key, Type) => { const a = new Type(hands[0][key].length * 2); a.set(hands[0][key], 0); a.set(hands[1][key], hands[0][key].length); out[key] = a; };
  cat('pos', Float32Array); cat('nor', Float32Array); cat('uv', Float32Array); cat('joints', Uint16Array); cat('weights', Float32Array);
  out.index = new Uint32Array(hands[0].index.length * 2);
  out.index.set(hands[0].index, 0);
  out.index.set(hands[1].index.map((i) => i + count), hands[0].index.length);
  return out;
}

async function write(item, g, rig, opts, source) {
  const doc = await io.read(rig.file);
  const root = doc.getRoot();
  let parent = null;
  for (const node of root.listNodes()) {
    if (node.getMesh()) {
      parent = parent || node.getParentNode();
      node.dispose();
    }
  }
  for (const a of root.listAnimations()) a.dispose();
  for (const s of root.listSkins()) s.dispose();
  const byName = new Map(root.listNodes().map((nd) => [nd.getName(), nd]));
  const buffer = root.listBuffers()[0];
  const acc = (type, array) => doc.createAccessor().setType(type).setArray(array).setBuffer(buffer);
  // Its skin: the rig's bones it's weighted to (and the rest of each hand's,
  // so the hand's whole chain is kept), by name.
  const used = new Set();
  for (const hnd of g.hands) for (const j of hnd.usedJoints) used.add(j);
  const list = [...used].sort((a, b) => a - b);
  const slot = new Map(list.map((j, k) => [j, k]));
  const ibm = new Float32Array(list.length * 16);
  list.forEach((j, k) => {
    const side = sideOf(rig.names[j]) === 'R' ? 1 : 0;
    ibm.set(g.hands[side].ibm(j), 16 * k);
  });
  const skin = doc.createSkin(`gear_${item.id}_${rig.id}_skin`).setInverseBindMatrices(acc('MAT4', ibm));
  for (const j of list) skin.addJoint(byName.get(rig.names[j]));
  const joints = new Uint8Array(g.joints.length);
  for (let i = 0; i < g.joints.length; i++) joints[i] = g.weights[i] ? slot.get(g.joints[i]) : 0;
  const texture = doc.createTexture(`${item.id}_color`).setImage(source.image.data).setMimeType(source.image.mime);
  const material = doc.createMaterial(`${item.id}_${rig.id}`).setBaseColorTexture(texture).setMetallicFactor(0).setRoughnessFactor(item.roughness).setDoubleSided(true);
  if (item.normalSize && source.normalImage) material.setNormalTexture(doc.createTexture(`${item.id}_normal`).setImage(source.normalImage.data).setMimeType(source.normalImage.mime));
  const prim = doc.createPrimitive()
    .setIndices(acc('SCALAR', g.index.length / 3 > 21845 ? g.index : new Uint16Array(g.index)))
    .setAttribute('POSITION', acc('VEC3', g.pos))
    .setAttribute('NORMAL', acc('VEC3', g.nor))
    .setAttribute('TEXCOORD_0', acc('VEC2', g.uv))
    .setAttribute('JOINTS_0', acc('VEC4', joints))
    .setAttribute('WEIGHTS_0', acc('VEC4', g.weights))
    .setMaterial(material);
  const node = doc.createNode(`gear_${item.id}_${rig.id}`).setMesh(doc.createMesh(`gear_${item.id}_${rig.id}`).addPrimitive(prim)).setSkin(skin);
  // (A segment none of whose points could be measured, as the Makarov's
  // thumb's middle one, is taken as its own hand's thickness: 1, as the palm.)
  const known = (xs) => xs.map((x) => (Number.isFinite(x) ? x : 1));
  const th = g.hands[0].thickness;
  const sides = {};
  const cut = {};
  ['L', 'R'].forEach((S, k) => {
    const h = rig.hands[S];
    sides[S] = { hand: rig.names[h.hand], plane: g.hands[k].plane.map((x) => +x.toFixed(5)), sideJoints: h.sideJoints.map((j) => rig.names[j]) };
    cut[S] = +g.hands[k].cut.toFixed(4);
  });
  node.setExtras({
    gear: { id: item.id, slot: 'gloves', rig: rig.id, thickness: { finger: known(th.finger), thumb: known(th.thumb), palm: th.palm } },
    gunGlove: { rig: rig.id, armMesh: rig.armMesh, sides, cut },
  });
  parent.addChild(node);
  const asset = root.getAsset();
  asset.copyright = `"${item.title}" (${item.url}) by ${AUTHOR}, licensed under CC BY 4.0 (http://creativecommons.org/licenses/by/4.0/). Changed for Project Fish: the left glove rigged to the hand bones of the ${opts.name}'s arms and fitted to them, and mirrored for the right hand${item.glove.subdivide ? ', subdivided' : ''}${g.simplified ? ', simplified' : ''}${item.calm ? ', its colour texture softened and tinted' : ''}, textures shrunk and stored as WebP, meshes compressed. The skeleton is the ${opts.name}'s, from ${rig.credit}.`;
  asset.extras = { title: item.title, source: item.url, author: AUTHOR, license: 'CC-BY-4.0 (http://creativecommons.org/licenses/by/4.0/)' };
  asset.generator = 'Project Fish tools/gear/gun_gloves.mjs';
  await doc.transform(
    prune({ keepLeaves: true }),
    textureCompress({ encoder: sharp, targetFormat: 'webp', quality: 88, resize: [item.size, item.size], slots: /baseColor/ }),
    ...(item.normalSize ? [textureCompress({ encoder: sharp, targetFormat: 'webp', quality: 90, resize: [item.normalSize, item.normalSize], slots: /normal/ })] : []),
    meshopt({ encoder: MeshoptEncoder, level: 'high' }),
  );
  const file = path.join(OUT, `gloves_${item.short}_${rig.id}.glb`);
  fs.mkdirSync(OUT, { recursive: true });
  await io.write(file, doc);
  console.log(`  wrote ${file}: ${(fs.statSync(file).size / 1e6).toFixed(2)} MB, ${g.index.length / 3} triangles, ${list.length} joints`);
}

const rigs = [];
for (const file of GUNS) {
  const opts = RIGS[path.basename(file, '.glb')];
  if (!opts) throw new Error(`${file}: no settings for the rig "${path.basename(file, '.glb')}" (RIGS)`);
  const rig = await readRig(file, opts);
  for (const S of ['L', 'R']) {
    const h = rig.hands[S];
    console.log(`${rig.id} ${S}: hand ${rig.names[h.hand]}, fingers ${h.fingers.map((f) => f.bones.map((j) => rig.names[j]).join('/')).join(' ')}, thumb ${h.thumb.bones.map((j) => rig.names[j]).join('/')}, palm bones ${h.palmBones.map((j) => rig.names[j]).join(' ')}, cuff bone ${rig.names[h.twist]}, ${h.points.length} points${h.sleeve.length ? ` (and ${h.sleeve.length} of the sleeve)` : ''}`);
    if (opts.sleeveMesh) {
      // (Where its own glove and its sleeve end, along the forearm from the
      // wrist: for choosing sleeveEnd and cuffTo.)
      const along = (vs) => vs.map((v) => dot(sub(pointOf3(rig.pos, v), h.wrist), h.axis));
      const reach = (vs, f) => vs.length ? (f(...along(vs)) * 1000).toFixed(0) : '-';
      const round = roundArm(h);
      const ends = new Array(24).fill(-Infinity);
      for (const v of h.sleeve) {
        const [a, ang] = round(pointOf3(rig.pos, v));
        const b = ((Math.round(ang / (2 * Math.PI) * 24) % 24) + 24) % 24;
        ends[b] = Math.max(ends[b], a);
      }
      console.log(`  its own glove reaches ${reach(h.points, Math.min)} mm up the forearm; its sleeve comes down to ${(Math.min(...ends) * 1000).toFixed(0)} to ${reach(h.sleeve, Math.max)} mm`);
    }
  }
  rigs.push({ rig, opts });
}
for (const item of GLOVES) {
  if (ONLY && item.id !== ONLY && item.short !== ONLY) continue;
  const source = await readSource(item);
  if (item.calm) source.image = await calmTexture(source.image, item.calm);
  const left = leftGlove(item, source);
  console.log(`${item.id}: left glove ${left.index.length / 3} triangles`);
  for (const { rig, opts } of rigs) {
    console.log(` on the ${rig.id}:`);
    const g = bothHands(item, left, rig, opts);
    console.log(`  thickness to the rig's own hand: fingers ${g.hands[0].thickness.finger.join(' ')}, thumb ${g.hands[0].thickness.thumb.join(' ')}, palm ${g.hands[0].thickness.palm}`);
    if (DEBUG) {
      fs.mkdirSync(DEBUG, { recursive: true });
      fs.writeFileSync(path.join(DEBUG, `${item.short}_${rig.id}.json`), JSON.stringify({ thickness: g.hands.map((h) => h.thickness), cut: g.hands.map((h) => [h.cut, h.cuffTop]) }));
    }
    await write(item, g, rig, opts, source);
  }
}
