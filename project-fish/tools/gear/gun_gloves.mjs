// Fits the outfit gloves (the same three downloads build_gear.mjs makes the
// soldier's from) to the arms that come with the animated guns (the Beretta
// 92FS, assets/beretta.glb, and the FN 502, assets/fn502.glb), so they can
// be worn on those arms too: assets/gear/gloves_<glove>_<rig>.glb.
//
// From the project-fish folder (after the guns are built):
//
//     node tools/gear/gun_gloves.mjs build/gear-src assets/beretta.glb assets/fn502.glb assets/gear
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
// for the FN 502's). glove.mjs reads a skeleton laid out like the
// soldier's, so it's handed one: the rig's bones under his bone names
// (see rigView), its own hand's skin as "his own glove" (for the fingertips'
// length and the fingers' thickness) and, for the FN 502, its sleeve.
//
// Then, for the rig:
// - The cuff takes the skin weights of the rig's own forearm where it is
//   (the nearest points of the arm mesh), so it turns with the rig's
//   forearm twist bones exactly as the rig's skin does, and the palm takes
//   the rig's split between the hand bone and the bones in the palm
//   (the FN 502's index0..little0).
// - On bare arms (the Beretta's) the cuff is pushed clear of the forearm's
//   skin, so the skin never shows through it; into a sleeve (the FN 502's)
//   it's narrowed to fit inside it and goes up it far enough to stay hidden.
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
  console.error('usage: node tools/gear/gun_gloves.mjs build/gear-src assets/beretta.glb assets/fn502.glb assets/gear [--only gloves_camo] [--debug DIR]');
  process.exit(1);
}
const ONLY = option('--only', null);
const DEBUG = option('--debug', null);

// The gloves: as ITEMS in build_gear.mjs (the same downloads and the same
// settings for finding their joints; see there and glove.mjs), with smaller
// textures (these are only seen in the gun layer, close up but small) and
// fewer triangles.
const GLOVES = [
  {
    id: 'gloves_black', short: 'black', source: 'tactical_combat_gloves_-_game_ready',
    title: 'Tactical Combat Gloves - Game Ready', url: 'https://sketchfab.com/3d-models/tactical-combat-gloves-game-ready-5e8f53fcba864163a199fa22baa653cb',
    maxTriangles: 12000, size: 1024, normalSize: 512, roughness: 0.8,
    glove: { subdivide: { from: -0.3, to: -0.2 }, pick: (c) => c[0] < 0.35, axes: { along: [0, 1, 0], thumb: [1, 0, 0], back: [0, 0, 1] }, webs: [0.17, 0.17, 0.2], web: 0.3, thumb: { tip: [0.19, 0.25, -0.2], toward: [-0.15, 0.2, -0.08] } },
  },
  {
    id: 'gloves_olive', short: 'olive', source: 'tactical_combat_gloves_3d_model',
    title: 'Tactical Combat Gloves 3D Model', url: 'https://sketchfab.com/3d-models/tactical-combat-gloves-3d-model-fda69c63c472449f8ded80a9e6d91562',
    maxTriangles: 12000, size: 1024, roughness: 0.95, calm: { fine: 3, local: 48, keep: 0.55, tint: [0.84, 0.87, 0.76] },
    glove: { pick: (c) => c[2] < 0, axes: { along: [0, -1, 0], thumb: [0, 0, -1], back: [-1, 0, 0] }, webs: [0.18, 0.18, 0.2], web: 0.3, thumb: { tip: [0.27, 0.24, -0.05], toward: [-0.1, 0.15, -0.05] } },
  },
  {
    id: 'gloves_camo', short: 'camo', source: 'military_tactical_gloves_-_multicam_hard_knuckle',
    title: 'Military Tactical Gloves - MultiCam Hard Knuckle', url: 'https://sketchfab.com/3d-models/military-tactical-gloves-multicam-hard-knuckle-72342e418cd743209395bba607d5504e',
    maxTriangles: 12000, size: 1024, normalSize: 512, roughness: 0.85,
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
const RIGS = {
  beretta: { name: 'Beretta 92FS', bare: true, cuffTo: -0.03, clearance: 0.0025, under: 0.008 },
  fn502: { name: 'FN 502', sleeve: true, sleeveEnd: -0.03, cuffTo: -0.055, sleeveMargin: 0.004 },
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
async function readRig(file) {
  const doc = await io.read(file);
  const root = doc.getRoot();
  const id = path.basename(file, '.glb');
  // The arm mesh: the skinned mesh most weighted to hands and fingers.
  let best = null;
  for (const node of root.listNodes()) {
    if (!node.getMesh() || !node.getSkin()) continue;
    const joints = node.getSkin().listJoints();
    let w = 0;
    for (const prim of node.getMesh().listPrimitives()) {
      const J = prim.getAttribute('JOINTS_0'), W = prim.getAttribute('WEIGHTS_0');
      const j = [], ww = [];
      for (let v = 0; v < J.getCount(); v++) { J.getElement(v, j); W.getElement(v, ww); for (let k = 0; k < 4; k++) if (HANDISH.test(joints[j[k]].getName())) w += ww[k]; }
    }
    if (!best || w > best.w) best = { node, w };
  }
  const node = best.node;
  const prims = node.getMesh().listPrimitives();
  if (prims.length !== 1) throw new Error(`${id}: the arm mesh has ${prims.length} primitives (one expected)`);
  const prim = prims[0];
  const skin = node.getSkin();
  const joints = skin.listJoints();
  const ibm = skin.getInverseBindMatrices();
  const P = prim.getAttribute('POSITION'), N = prim.getAttribute('NORMAL'), J = prim.getAttribute('JOINTS_0'), W = prim.getAttribute('WEIGHTS_0');
  const count = P.getCount();
  const jo = new Uint16Array(count * 4), we = new Float32Array(count * 4);
  const used = new Set();
  for (let v = 0, j = [], w = []; v < count; v++) {
    J.getElement(v, j); W.getElement(v, w);
    jo.set(j, 4 * v); we.set(w, 4 * v);
    for (let k = 0; k < 4; k++) if (w[k] > 0) used.add(j[k]);
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
  const pos = new Float32Array(count * 3), nor = new Float32Array(count * 3);
  for (let v = 0, p = [], n = []; v < count; v++) {
    P.getElement(v, p); N.getElement(v, n);
    pos.set(p.map((x) => x * s), 3 * v);
    nor.set(norm(n), 3 * v);
  }
  const names = joints.map((j) => j.getName());
  const at = (i) => [bind[i][12], bind[i][13], bind[i][14]];
  // The hands: a bone with five chains of bones under it (a finger's three,
  // with or without one in the palm before them; the thumb's three).
  const hands = {};
  const isJoint = new Set(joints);
  for (const j of joints) {
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
    const near = new Map();
    let mid = [0, 0, 0], midN = 0;
    for (let v = 0; v < count; v++) {
      let sw = 0;
      for (let k = 0; k < 4; k++) if (sideOf(names[jo[4 * v + k]]) === S) sw += we[4 * v + k];
      if (sw < 0.5) continue;
      h.points.push(v);
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
  return { id, file, doc, node, armMesh: node.getName(), joints, names, bind, used, pos, nor, jo, we, index: prim.getIndices().getArray(), hands, s, credit };
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
  const twistI = push('ForearmTwist02', h.twist, rig.bind[h.twist]);
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
      own.pos.push(...p);
      for (let k = 0; k < 4; k++) {
        const j = rig.jo[4 * v + k];
        own.joints.push(toView.has(j) ? toView.get(j) : 65535);
        own.weights.push(rig.we[4 * v + k]);
      }
    } else if (opts.sleeve && dot(sub(p, h.wrist), h.axis) < opts.sleeveEnd + 0.002) {
      sleeve.pos.push(...p);
    }
  }
  own.pos = new Float32Array(own.pos); own.joints = new Uint16Array(own.joints); own.weights = new Float32Array(own.weights);
  sleeve.pos = new Float32Array(sleeve.pos);
  const soldier = {
    joints: list.map((e) => ({ getName: () => e.name, getWorldMatrix: () => e.world })),
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
  const out = rigGlove({ ...item, glove: cfg }, left, view.soldier, S, (m) => log(m));
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
    for (let b = 0; b < B; b++) { const w = out.wts[i * B + b]; if (w) for (let k = 0; k < 16; k++) A[k] += w * M[b][k]; }
    P.set(apply(A, pointOf3(out.pos, i)), 3 * i);
    PN.set(norm(applyDir(A, pointOf3(out.nor, i))), 3 * i);
  }
  if (process.env.DBG) { let worst = 0, wi = -1; for (let i = 0; i < n; i++) { const d = len(sub(pointOf3(P, i), pointOf3(out.pos, i))); if (d > worst) { worst = d; wi = i; } } console.log('DBG worst move', worst, 'at', wi, [...out.wts.subarray(wi * B, wi * B + B)].map((x) => x.toFixed(2)).join(' ')); for (const [vi, m] of out.pose) console.log('DBG pose', view.list[vi].name, m.map((x) => x.toFixed(3)).join(' '), 'rest', restOfView(vi).map((x) => x.toFixed(3)).join(' ')); }
  // The rig's own skin, its points on this side: for the cuff's weights
  // (all of them) and the palm's (those on the hand group).
  const sidePos = new Float32Array(h.points.length * 3);
  h.points.forEach((v, k) => sidePos.set(pointOf3(rig.pos, v), 3 * k));
  const grid = new Grid(sidePos, 0.01);
  const palmSet = new Set(h.palmBones);
  const weights = []; // per point: Map rig joint -> weight
  for (let i = 0; i < n; i++) {
    const wmap = new Map();
    const addW = (j, w) => { if (w > 0) wmap.set(j, (wmap.get(j) || 0) + w); };
    const p = pointOf3(P, i);
    const hand = out.wts[i * B], fore = out.wts[i * B + 1];
    const near = (hand > 0 || fore > 0) ? grid.near(p[0], p[1], p[2], 8, 0.08) : [];
    if (fore > 0) {
      // The rig's skin weights here.
      const sum = new Map();
      let total = 0;
      for (const [k, d] of near) {
        const v = h.points[k];
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
    for (let b = 2; b < B; b++) addW(view.list[viewOf[b]].rigJoint, out.wts[i * B + b]);
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
  // Where its cuff reaches: up the forearm from the wrist, the shortest
  // way round (the least reach of 24 strips round the arm).
  const e1 = norm(addS(cross(h.axis, [0, 1, 0]), h.axis, 0));
  const e2 = cross(h.axis, e1);
  const reach = new Array(24).fill(Infinity);
  for (let i = 0; i < n; i++) {
    const d = sub(pointOf3(P, i), h.wrist);
    const a = dot(d, h.axis);
    if (a > 0.02) continue;
    const s2 = ((Math.round(Math.atan2(dot(d, e2), dot(d, e1)) / (2 * Math.PI) * 24) % 24) + 24) % 24;
    reach[s2] = Math.min(reach[s2], a);
  }
  console.log("reach", reach.map((x) => (x * 1000).toFixed(0)).join(" "));
  const cuffTop = Math.max(...reach.filter(Number.isFinite));
  const cut = opts.sleeve ? opts.sleeveEnd : cuffTop + opts.under;
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

// Pushes the cuff out wherever it's within `clearance` of (or inside) the
// rig's forearm skin, where that's left showing (up the arm from the wrist
// to where its hand is cut away, and a little further), in the bind pose.
// As build_gear.mjs's clear: each point's need is the deepest of its nearest
// skin points' (by their normals), spread smoothly over the cuff so it keeps
// its shape, a few times over.
function clearCuff(P, joints, wts4, rig, h, opts, log) {
  const skin = [];
  for (const v of h.points) {
    const p = pointOf3(rig.pos, v);
    const a = dot(sub(p, h.wrist), h.axis);
    if (a < -0.12 || a > 0.01) continue;
    skin.push(v);
  }
  const sp = new Float32Array(skin.length * 3), sn = new Float32Array(skin.length * 3);
  skin.forEach((v, k) => { sp.set(pointOf3(rig.pos, v), 3 * k); sn.set(pointOf3(rig.nor, v), 3 * k); });
  const grid = new Grid(sp, 0.01);
  const n = P.length / 3;
  const cuff = [];
  for (let i = 0; i < n; i++) if (dot(sub(pointOf3(P, i), h.wrist), h.axis) < 0.015) cuff.push(i);
  const margin = opts.clearance;
  const need = () => {
    const out = new Map();
    let worst = 0;
    for (const i of cuff) {
      const [x, y, z] = pointOf3(P, i);
      let push = 0, dir = null;
      for (const [b] of grid.near(x, y, z, 3, 0.03)) {
        const nb = pointOf3(sn, b);
        const d = (x - sp[3 * b]) * nb[0] + (y - sp[3 * b + 1]) * nb[1] + (z - sp[3 * b + 2]) * nb[2];
        if (margin - d > push) { push = margin - d; dir = nb; }
      }
      if (push > 0 && push < 0.02) { out.set(i, mulS(dir, push)); worst = Math.max(worst, push); }
    }
    return { out, worst };
  };
  const cp = new Float32Array(cuff.length * 3);
  cuff.forEach((i, k) => cp.set(pointOf3(P, i), 3 * k));
  const cgrid = new Grid(cp, 0.01);
  const nbrs = cuff.map((i) => cgrid.near(P[3 * i], P[3 * i + 1], P[3 * i + 2], 300, 0.02).map(([k, d]) => [cuff[k], d]));
  let state = need();
  log(`  ${h === rig.hands.L ? 'L' : 'R'}: cuff into the forearm's skin: ${state.out.size} points, deepest ${(state.worst * 1000).toFixed(1)} mm`);
  for (let pass = 0; pass < 6 && state.out.size; pass++) {
    const move = new Map();
    cuff.forEach((i, k) => {
      let best = 0, m = null;
      for (const [u, d] of nbrs[k]) {
        const nd = state.out.get(u);
        if (!nd) continue;
        const w = Math.exp(-((d / 0.008) ** 2));
        if (w * len(nd) > best) { best = w * len(nd); m = mulS(nd, w); }
      }
      if (m) move.set(i, m);
    });
    for (const [i, m] of move) P.set(addS(pointOf3(P, i), m, 1.05), 3 * i);
    state = need();
  }
  log(`    after: ${state.out.size} points still within ${margin * 1000} mm, deepest ${(state.worst * 1000).toFixed(1)} mm`);
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
  const th = g.hands[0].thickness;
  const sides = {};
  const cut = {};
  ['L', 'R'].forEach((S, k) => {
    const h = rig.hands[S];
    sides[S] = { hand: rig.names[h.hand], plane: g.hands[k].plane.map((x) => +x.toFixed(5)), sideJoints: h.sideJoints.map((j) => rig.names[j]) };
    cut[S] = +g.hands[k].cut.toFixed(4);
  });
  node.setExtras({
    gear: { id: item.id, slot: 'gloves', rig: rig.id, thickness: { finger: th.finger, thumb: th.thumb, palm: th.palm } },
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
  const rig = await readRig(file);
  const opts = RIGS[rig.id];
  if (!opts) throw new Error(`${file}: no settings for the rig "${rig.id}" (RIGS)`);
  for (const S of ['L', 'R']) {
    const h = rig.hands[S];
    console.log(`${rig.id} ${S}: hand ${rig.names[h.hand]}, fingers ${h.fingers.map((f) => f.bones.map((j) => rig.names[j]).join('/')).join(' ')}, thumb ${h.thumb.bones.map((j) => rig.names[j]).join('/')}, palm bones ${h.palmBones.map((j) => rig.names[j]).join(' ')}, cuff bone ${rig.names[h.twist]}, ${h.points.length} points`);
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
