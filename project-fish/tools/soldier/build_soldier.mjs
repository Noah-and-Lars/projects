// Turns the downloaded soldier into the game's character model.
//
// The model is "Soldier Full Tactical Gear" by DanlyVostok (CC BY 4.0, see
// README.md, Credits):
// https://sketchfab.com/3d-models/soldier-full-tactical-gear-850593a8c7114c188395ba1849a66eb9
// Download its glTF version and unzip it so that the folder holds
// scene.gltf, scene.bin and textures/. Then, from the project-fish folder:
//
//     python3 -I tools/soldier/remove_patch_text.py build/soldier-source/textures/Mark_Helmet1_baseColor.jpeg build/soldier-helmet.jpeg
//     node tools/soldier/build_soldier.mjs build/soldier-source assets/soldier.glb --helmet build/soldier-helmet.jpeg
//
// (npm run build-soldier does both.) What it changes:
// - The helmet texture (which also holds the chest and back patches) is
//   swapped for the copy with the patches' lettering rubbed out.
// - For playing as him in first person: the jacket's sleeves become their
//   own part, the parts are tagged (sleeves and gloves 'arms', what moves
//   with his head 'head'), and the plate carrier no longer bends with the
//   arms. All meshes share one skin.
// - Texture coordinates no material uses are dropped.
// - The textures are shrunk (colour and normal maps to --size, 2048 px by
//   default; the others to half that) and stored as WebP; the meshes are
//   compressed (meshopt), so the file is small enough to load in a browser.
// The model, its skeleton and its idle animation are otherwise as they were.

import fs from 'node:fs';
import path from 'node:path';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, meshopt, prune, textureCompress } from '@gltf-transform/functions';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';
import sharp from 'sharp';

const args = process.argv.slice(2);
const option = (name, fallback) => (args.includes(name) ? args[args.indexOf(name) + 1] : fallback);
const [source, out] = args;
if (!source || !out) {
  console.error('usage: node tools/soldier/build_soldier.mjs SOURCE_FOLDER OUT.glb [--helmet FIXED.jpeg] [--size 2048]');
  process.exit(1);
}
const SIZE = Number(option('--size', 2048));
const HELMET = option('--helmet', null);

await MeshoptEncoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
  'meshopt.decoder': MeshoptDecoder,
  'meshopt.encoder': MeshoptEncoder,
});
const doc = await io.read(path.join(source, 'scene.gltf'));
const root = doc.getRoot();

// The helmet texture, without the lettering on the patches.
if (HELMET) {
  const helmet = root.listTextures().find((t) => /Mark_Helmet1_baseColor/.test(t.getURI() || t.getName()));
  if (!helmet) throw new Error('helmet texture not found');
  helmet.setImage(new Uint8Array(fs.readFileSync(HELMET)));
  console.log('helmet texture: patches without lettering');
}

// Drop texture coordinates no material reads (most meshes carry three sets
// and use one).
let dropped = 0;
for (const mesh of root.listMeshes()) {
  for (const prim of mesh.listPrimitives()) {
    const material = prim.getMaterial();
    let used = 0;
    if (material) {
      for (const info of [material.getBaseColorTextureInfo(), material.getNormalTextureInfo(), material.getMetallicRoughnessTextureInfo(), material.getOcclusionTextureInfo(), material.getEmissiveTextureInfo()]) {
        if (info) used = Math.max(used, info.getTexCoord());
      }
    }
    for (let n = used + 1; n < 8; n++) {
      const attribute = prim.getAttribute(`TEXCOORD_${n}`);
      if (attribute) {
        prim.setAttribute(`TEXCOORD_${n}`, null);
        dropped++;
      }
    }
  }
}
console.log(`dropped ${dropped} unused sets of texture coordinates`);

// --- For playing as him in first person -----------------------------------
// The player is drawn with this same model: his sleeves and gloves in the gun
// layer (holding the gun), the rest of him in the world, without his head.
// So: the jacket is split into its sleeves (from partway down the upper arm)
// and the rest, and the pieces are tagged (node extras, userData in the
// game): firstPerson 'arms' (sleeves and gloves) or 'head' (meshes that
// move with his head). The plate carrier no longer bends with his arms (a
// little of its sides followed them, which warps it when his arms come up to
// hold a gun).
const skinOf = root.listNodes().find((n) => n.getSkin()).getSkin();
const joints = skinOf.listJoints();
const jointIndex = new Map(joints.map((j, i) => [j, i]));
const named = (re) => joints.filter((j) => re.test(j.getName()));
const ibm = skinOf.getInverseBindMatrices();
const inverse = (m) => {
  // 4x4 column-major inverse (affine).
  const [a, b, c, , d, e, f, , g, h, i, , x, y, z] = m;
  const A = e * i - f * h, B = -(d * i - f * g), C = d * h - e * g;
  const det = a * A + b * B + c * C;
  const r = [A / det, -(b * i - c * h) / det, (b * f - c * e) / det, 0, B / det, (a * i - c * g) / det, -(a * f - c * d) / det, 0, C / det, -(a * h - b * g) / det, (a * e - b * d) / det, 0, 0, 0, 0, 1];
  r[12] = -(r[0] * x + r[4] * y + r[8] * z);
  r[13] = -(r[1] * x + r[5] * y + r[9] * z);
  r[14] = -(r[2] * x + r[6] * y + r[10] * z);
  return r;
};
// A joint's place in the meshes' bind space (raw vertex units).
const bindPos = (j) => {
  const m = inverse(ibm.getElement(jointIndex.get(j), []));
  return [m[12], m[13], m[14]];
};
// Raw vertex units to metres: a weighted joint's world matrix times its
// inverse bind matrix is a plain scale.
const spine02 = named(/Spine02/)[0];
const K = (() => {
  const w = spine02.getWorldMatrix();
  const m = ibm.getElement(jointIndex.get(spine02), []);
  return Math.hypot(w[0] * m[0] + w[4] * m[1] + w[8] * m[2], w[1] * m[0] + w[5] * m[1] + w[9] * m[2], w[2] * m[0] + w[6] * m[1] + w[10] * m[2]);
})();
console.log(`bind units to metres: ${K.toExponential(3)}`);
const ARM_BONES = (s) => new Set(named(new RegExp(`_${s}_(UpperarmTwist0[12]|ForearmTwist0[12]|Hand|(Thumb|Index|Mid|Ring|Pinky)[123])_`)).map((j) => jointIndex.get(j)));
const HEAD_BONES = (() => {
  const out = new Set();
  const add = (j) => { out.add(jointIndex.get(j)); for (const c of j.listChildren()) if (jointIndex.has(c)) add(c); };
  for (const j of named(/NeckTwist0[12]|_Head_|FacialBone/)) add(j);
  return out;
})();
const primOf = (material) => root.listMeshes().flatMap((m) => m.listPrimitives()).find((p) => p.getMaterial() && p.getMaterial().getName() === material && p.getIndices().getCount() > 3000);
const nodeOf = (prim) => root.listNodes().find((n) => n.getMesh() && n.getMesh().listPrimitives().includes(prim));
const weightOn = (prim, bones) => {
  const J = prim.getAttribute('JOINTS_0'), W = prim.getAttribute('WEIGHTS_0');
  const out = new Float32Array(J.getCount());
  const j = [], w = [];
  for (let v = 0; v < out.length; v++) {
    J.getElement(v, j); W.getElement(v, w);
    for (let k = 0; k < 4; k++) if (bones.has(j[k])) out[v] += w[k];
  }
  return out;
};

// The jacket: a triangle is a sleeve's if it's mostly on that arm's bones
// and, on average, at least 12.4 cm down from the shoulder.
{
  const jacket = primOf('Mark_Kitel_1');
  const node = nodeOf(jacket);
  const P = jacket.getAttribute('POSITION');
  const index = jacket.getIndices().getArray();
  const sideOf = new Int8Array(index.length / 3);
  for (const [n, s] of [[1, 'R'], [2, 'L']]) {
    const S = bindPos(named(new RegExp(`_${s}_UpperarmTwist01_`))[0]);
    const E = bindPos(named(new RegExp(`_${s}_ForearmTwist01_`))[0]);
    const len = Math.hypot(E[0] - S[0], E[1] - S[1], E[2] - S[2]);
    const dir = [(E[0] - S[0]) / len, (E[1] - S[1]) / len, (E[2] - S[2]) / len];
    const arm = weightOn(jacket, ARM_BONES(s));
    const p = [];
    const down = new Float32Array(P.getCount());
    for (let v = 0; v < down.length; v++) {
      P.getElement(v, p);
      down[v] = ((p[0] - S[0]) * dir[0] + (p[1] - S[1]) * dir[1] + (p[2] - S[2]) * dir[2]) * K;
    }
    for (let t = 0; t < sideOf.length; t++) {
      const [a, b, c] = [index[3 * t], index[3 * t + 1], index[3 * t + 2]];
      if ((down[a] + down[b] + down[c]) / 3 >= 0.124 && (arm[a] + arm[b] + arm[c]) / 3 >= 0.5) sideOf[t] = n;
    }
  }
  const armTris = [], bodyTris = [];
  for (let t = 0; t < sideOf.length; t++) (sideOf[t] ? armTris : bodyTris).push(index[3 * t], index[3 * t + 1], index[3 * t + 2]);
  const counts = [1, 2].map((n) => sideOf.filter((x) => x === n).length);
  console.log(`jacket: right sleeve ${counts[0]}, left sleeve ${counts[1]}, body ${bodyTris.length / 3} triangles`);
  const indexType = index.constructor;
  const arms = jacket.clone();
  arms.setIndices(doc.createAccessor().setType('SCALAR').setArray(new indexType(armTris)).setBuffer(jacket.getIndices().getBuffer()));
  jacket.setIndices(doc.createAccessor().setType('SCALAR').setArray(new indexType(bodyTris)).setBuffer(jacket.getIndices().getBuffer()));
  const armsNode = doc.createNode('Mark_Kitel_1_arms').setMesh(doc.createMesh('Mark_Kitel_1_arms').addPrimitive(arms)).setSkin(node.getSkin()).setMatrix(node.getMatrix());
  armsNode.setExtras({ firstPerson: 'arms' });
  (node.getParentNode() || root.listScenes()[0]).addChild(armsNode);
}
// The gloves.
nodeOf(primOf('Mark_Gloves_1')).setExtras({ firstPerson: 'arms' });
// Whatever moves with his head.
for (const node of root.listNodes()) {
  const mesh = node.getMesh();
  if (!mesh || !node.getSkin()) continue;
  let head = 0, all = 0;
  for (const prim of mesh.listPrimitives()) {
    const w = weightOn(prim, HEAD_BONES);
    all += w.length;
    for (const x of w) if (x >= 0.5) head++;
  }
  if (all && head / all >= 0.8) {
    node.setExtras({ firstPerson: 'head' });
    console.log(`head: ${node.getName()} (${mesh.listPrimitives().map((p) => p.getMaterial().getName()).join(', ')}, ${Math.round((100 * head) / all)}%)`);
  }
}
// The plate carrier: its weights on the arms move to the upper spine.
{
  const plate = primOf('Mark_Plate_1');
  const arms = new Set([...ARM_BONES('R'), ...ARM_BONES('L')]);
  const spine = jointIndex.get(spine02);
  const J = plate.getAttribute('JOINTS_0'), W = plate.getAttribute('WEIGHTS_0');
  const j = [], w = [];
  let moved = 0;
  for (let v = 0; v < J.getCount(); v++) {
    J.getElement(v, j); W.getElement(v, w);
    let extra = 0;
    for (let k = 0; k < 4; k++) if (arms.has(j[k]) && w[k] > 0) { extra += w[k]; w[k] = 0; }
    if (!extra) continue;
    moved++;
    let slot = j.indexOf(spine);
    if (slot < 0 || w[slot] === 0 && j[slot] !== spine) slot = w.indexOf(0);
    if (slot < 0) slot = w.indexOf(Math.min(...w));
    j[slot] = spine; w[slot] += extra;
    J.setElement(v, j); W.setElement(v, w);
  }
  console.log(`plate carrier: ${moved} vertices no longer follow the arms`);
}

// Smaller textures: colour and normal maps at SIZE, the rest at half.
await doc.transform(
  textureCompress({ encoder: sharp, targetFormat: 'webp', quality: 88, slots: /^(baseColorTexture|normalTexture)$/, resize: [SIZE, SIZE] }),
  textureCompress({ encoder: sharp, targetFormat: 'webp', quality: 88, slots: /^(metallicRoughnessTexture|occlusionTexture)$/, resize: [SIZE / 2, SIZE / 2] }),
  prune(),
  dedup(),
  // One quantization for the whole model, so all its meshes share one skin
  // (per-mesh quantization gives each mesh its own copy of the skeleton).
  meshopt({ encoder: MeshoptEncoder, level: 'high', quantizationVolume: 'scene' }),
);
fs.mkdirSync(path.dirname(out), { recursive: true });
await io.write(out, doc);
const triangles = root.listMeshes().reduce((n, m) => n + m.listPrimitives().reduce((k, p) => k + (p.getIndices() ? p.getIndices().getCount() : p.getAttribute('POSITION').getCount()) / 3, 0), 0);
console.log(`wrote ${out}: ${(fs.statSync(out).size / 1e6).toFixed(1)} MB, ${root.listTextures().length} textures, ${Math.round(triangles)} triangles, ${root.listAnimations().length} animation(s), ${root.listSkins().length} skin(s)`);
