// Turns a downloaded gun whose parts move by bones (one skinned mesh, or a
// few) into a gun of separate rigid parts, ready for build_breakdown.mjs:
//
//     node tools/breakdown/bake_rigid.mjs SOURCE_FOLDER CONFIG.json OUT_FOLDER
//     node tools/breakdown/build_breakdown.mjs OUT_FOLDER CONFIG.json OUT.glb
//
// For the Galil ACE (from the project-fish folder):
//
//     node tools/breakdown/bake_rigid.mjs build/upload-breakdown3 tools/breakdown/galil_ace.json build/galil-ace-rigid
//     node tools/breakdown/build_breakdown.mjs build/galil-ace-rigid tools/breakdown/galil_ace.json assets/breakdown/galil_ace.glb
//
// SOURCE_FOLDER is the download's glTF version unzipped (scene.gltf,
// scene.bin, textures/). It is only read. CONFIG.rigid says how:
// - time: the moment of the download's animation to take the pose from (the
//   gun put together), in seconds.
// - frame: the bone the gun's body hangs on. The pose is laid out in that
//   bone's frame as it is when the download is not animated, then turned by
//   axes (three rows: new x, y, z from the old) so that the muzzle points
//   along +Z, up is +Y and the gun's right side faces -X.
// - drop: mesh nodes (by name) to leave out, such as a backdrop, and bones
//   or pieces whose points to leave out (loose rounds lying by the gun).
// - Every point goes with the bone that carries most of its weight, and each
//   bone's points become one part, named bones[bone] (or the bone's name).
//   For the bones listed in split, each separate piece of the mesh (its
//   triangles that touch) is its own part instead, named pieces[name] (a
//   list of piece ids "bone#n", n counting the pieces in the order the mesh
//   first uses them), or else "bone#n". PIECES_JSON=file writes every
//   piece's id, middle, size and triangle count, to name them by.
// - textures: { image file name: { size, rub } } resizes an image (square,
//   pixels) and rubs out boxes of it ([x, y, w, h] in the download's
//   pixels): each box is replaced by a median of itself wide enough to wipe
//   out stamped lettering, blended in at its edges.
// What comes out has no skin, bones or animation: each part is a plain mesh
// on its own node, straight under the scene, with its points where the
// animated gun shows them at `time`.

import fs from 'node:fs';
import path from 'node:path';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { prune } from '@gltf-transform/functions';
import sharp from 'sharp';

const [source, configPath, outDir] = process.argv.slice(2);
if (!source || !configPath || !outDir) {
  console.error('usage: node tools/breakdown/bake_rigid.mjs SOURCE_FOLDER CONFIG.json OUT_FOLDER');
  process.exit(1);
}
const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
const rc = config.rigid;
if (!rc) throw new Error('the config has no "rigid" section');

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc = await io.read(path.join(source, 'scene.gltf'));
const root = doc.getRoot();
const scene = root.listScenes()[0];

// --- 4x4 matrices, column-major as glTF ---
const mul = (a, b) => {
  const o = new Array(16).fill(0);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++) o[c * 4 + r] += a[k * 4 + r] * b[c * 4 + k];
  return o;
};
const invert = (m) => {
  // General 4x4 inverse (cofactors).
  const [a00, a01, a02, a03, a10, a11, a12, a13, a20, a21, a22, a23, a30, a31, a32, a33] = m;
  const b00 = a00 * a11 - a01 * a10, b01 = a00 * a12 - a02 * a10, b02 = a00 * a13 - a03 * a10, b03 = a01 * a12 - a02 * a11;
  const b04 = a01 * a13 - a03 * a11, b05 = a02 * a13 - a03 * a12, b06 = a20 * a31 - a21 * a30, b07 = a20 * a32 - a22 * a30;
  const b08 = a20 * a33 - a23 * a30, b09 = a21 * a32 - a22 * a31, b10 = a21 * a33 - a23 * a31, b11 = a22 * a33 - a23 * a32;
  const det = b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06;
  const d = 1 / det;
  return [
    (a11 * b11 - a12 * b10 + a13 * b09) * d, (a02 * b10 - a01 * b11 - a03 * b09) * d, (a31 * b05 - a32 * b04 + a33 * b03) * d, (a22 * b04 - a21 * b05 - a23 * b03) * d,
    (a12 * b08 - a10 * b11 - a13 * b07) * d, (a00 * b11 - a02 * b08 + a03 * b07) * d, (a32 * b02 - a30 * b05 - a33 * b01) * d, (a20 * b05 - a22 * b02 + a23 * b01) * d,
    (a10 * b10 - a11 * b08 + a13 * b06) * d, (a01 * b08 - a00 * b10 - a03 * b06) * d, (a30 * b04 - a31 * b02 + a33 * b00) * d, (a21 * b02 - a20 * b04 - a23 * b00) * d,
    (a11 * b07 - a10 * b09 - a12 * b06) * d, (a00 * b09 - a01 * b07 + a02 * b06) * d, (a31 * b01 - a30 * b03 - a32 * b00) * d, (a20 * b03 - a21 * b01 + a22 * b00) * d,
  ];
};
const compose = (t, q, s) => {
  const [x, y, z, w] = q;
  return [
    (1 - 2 * (y * y + z * z)) * s[0], 2 * (x * y + z * w) * s[0], 2 * (x * z - y * w) * s[0], 0,
    2 * (x * y - z * w) * s[1], (1 - 2 * (x * x + z * z)) * s[1], 2 * (y * z + x * w) * s[1], 0,
    2 * (x * z + y * w) * s[2], 2 * (y * z - x * w) * s[2], (1 - 2 * (x * x + y * y)) * s[2], 0,
    t[0], t[1], t[2], 1,
  ];
};
const apply = (m, p) => [m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12], m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13], m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14]];
// Normals go through the inverse transpose (bones here can be scaled unevenly).
const normalMatrix = (m) => {
  const i = invert(m);
  return [i[0], i[4], i[8], i[1], i[5], i[9], i[2], i[6], i[10]]; // rows of inverse = columns of its transpose
};
const applyN = (n, v) => {
  const o = [n[0] * v[0] + n[3] * v[1] + n[6] * v[2], n[1] * v[0] + n[4] * v[1] + n[7] * v[2], n[2] * v[0] + n[5] * v[1] + n[8] * v[2]];
  const l = Math.hypot(...o) || 1;
  return o.map((c) => c / l);
};
const applyDir = (m, v) => {
  const o = [m[0] * v[0] + m[4] * v[1] + m[8] * v[2], m[1] * v[0] + m[5] * v[1] + m[9] * v[2], m[2] * v[0] + m[6] * v[1] + m[10] * v[2]];
  const l = Math.hypot(...o) || 1;
  return o.map((c) => c / l);
};

// --- Each node's local matrix at the animation's `time` ---
const animated = new Map(); // node -> { translation, rotation, scale }
const sampleAt = (sampler, t) => {
  const input = sampler.getInput().getArray(), output = sampler.getOutput();
  const n = output.getElementSize();
  if (sampler.getInterpolation() === 'CUBICSPLINE') throw new Error('cubic-spline animation is not handled');
  const at = (i) => output.getElement(i, []);
  if (t <= input[0]) return at(0);
  if (t >= input[input.length - 1]) return at(input.length - 1);
  let i = 0;
  while (input[i + 1] < t) i++;
  if (sampler.getInterpolation() === 'STEP') return at(i);
  const f = (t - input[i]) / (input[i + 1] - input[i]);
  const a = at(i), b = at(i + 1);
  if (n === 4) {
    // Shortest-way blend of two rotations, renormalised (close keys: as good as a slerp).
    const dot = a.reduce((s, v, k) => s + v * b[k], 0);
    const v = a.map((x, k) => x * (1 - f) + (dot < 0 ? -b[k] : b[k]) * f);
    const l = Math.hypot(...v);
    return v.map((x) => x / l);
  }
  return a.map((x, k) => x * (1 - f) + b[k] * f);
};
const animation = root.listAnimations()[0];
if (animation && rc.time != null) {
  for (const channel of animation.listChannels()) {
    const node = channel.getTargetNode();
    if (!animated.has(node)) animated.set(node, {});
    animated.get(node)[channel.getTargetPath()] = sampleAt(channel.getSampler(), rc.time);
  }
}
const localAt = (node, posed) => {
  const a = posed ? animated.get(node) : null;
  if (!a) return node.getMatrix();
  return compose(a.translation || node.getTranslation(), a.rotation || node.getRotation(), a.scale || node.getScale());
};
const worldAt = (node, posed) => {
  let m = localAt(node, posed);
  for (let p = node.getParentNode(); p; p = p.getParentNode()) m = mul(localAt(p, posed), m);
  // (The scene's own roots have no parent node.)
  return m;
};

// The gun's frame: its body bone as the download lies when not animated,
// turned by `axes`.
const byName = (name) => {
  const found = root.listNodes().filter((n) => n.getName() === name);
  if (found.length !== 1) throw new Error(`${found.length} nodes named "${name}"`);
  return found[0];
};
const body = byName(rc.frame);
const A = rc.axes || [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
const axes = [A[0][0], A[1][0], A[2][0], 0, A[0][1], A[1][1], A[2][1], 0, A[0][2], A[1][2], A[2][2], 0, 0, 0, 0, 1];
// A skinned point at `time`, moved into the gun's frame.
const toGun = mul(axes, mul(worldAt(body, false), invert(worldAt(body, true))));

// --- The pieces ---
const drop = new Set(rc.drop || []);
const split = new Set(rc.split || []);
const pieceName = new Map();
for (const [name, ids] of Object.entries(rc.pieces || {})) for (const id of ids) {
  if (pieceName.has(id)) throw new Error(`piece ${id} is named twice`);
  pieceName.set(id, name);
}
const usedIds = new Set();
const parts = new Map(); // part name -> [{ material, positions, normals, tangents, uvs, indices }]
const report = [];
for (const node of root.listNodes()) {
  const mesh = node.getMesh();
  if (!mesh) continue;
  if (drop.has(node.getName()) || (node.getParentNode() && drop.has(node.getParentNode().getName()))) continue;
  const skin = node.getSkin();
  const joints = skin ? skin.listJoints() : [];
  const jointMatrices = [];
  if (skin) {
    const ibm = skin.getInverseBindMatrices();
    joints.forEach((j, k) => jointMatrices.push(mul(toGun, mul(worldAt(j, true), ibm.getElement(k, [])))));
  }
  const plain = mul(toGun, worldAt(node, true));
  for (const prim of mesh.listPrimitives()) {
    const pos = prim.getAttribute('POSITION'), nor = prim.getAttribute('NORMAL'), tan = prim.getAttribute('TANGENT'), uv = prim.getAttribute('TEXCOORD_0');
    const J = prim.getAttribute('JOINTS_0'), W = prim.getAttribute('WEIGHTS_0');
    const n = pos.getCount();
    const owner = new Array(n); // bone name per point
    const P = [], N = [], T = [];
    const index = prim.getIndices();
    const count = index ? index.getCount() : n;
    const at = (i) => (index ? index.getScalar(i) : i);
    // A point whose weights are broken (negative, or not adding up to one:
    // the Galil has two) goes rigidly with the bone most of the points it
    // shares triangles with go with.
    const fixed = new Map();
    if (skin && J) {
      const broken = (v) => { const w = W.getElement(v, []); return w.some((x) => x < 0) || Math.abs(w.reduce((a, b) => a + b, 0) - 1) > 0.01; };
      const bad = new Set();
      for (let v = 0; v < n; v++) if (broken(v)) bad.add(v);
      for (const v of bad) {
        const votes = new Map();
        for (let i = 0; i < count; i += 3) {
          const tri = [at(i), at(i + 1), at(i + 2)];
          if (!tri.includes(v)) continue;
          for (const u of tri) {
            if (bad.has(u)) continue;
            const w = W.getElement(u, []), j = J.getElement(u, []);
            const k = j[w.indexOf(Math.max(...w))];
            votes.set(k, (votes.get(k) || 0) + 1);
          }
        }
        const best = [...votes].sort((a, b) => b[1] - a[1])[0];
        fixed.set(v, best ? best[0] : J.getElement(v, [])[0]);
      }
      if (bad.size) console.log(`${mesh.getName()}: ${bad.size} points with broken weights made rigid`);
    }
    for (let v = 0; v < n; v++) {
      let m;
      if (skin && J && fixed.has(v)) {
        m = jointMatrices[fixed.get(v)];
        owner[v] = joints[fixed.get(v)].getName();
      } else if (skin && J) {
        const j = J.getElement(v, []), w = W.getElement(v, []);
        m = new Array(16).fill(0);
        let best = 0;
        for (let k = 0; k < 4; k++) {
          if (!w[k]) continue;
          const jm = jointMatrices[j[k]];
          for (let e = 0; e < 16; e++) m[e] += w[k] * jm[e];
          if (w[k] > w[best]) best = k;
        }
        owner[v] = joints[j[best]].getName();
      } else {
        m = plain;
        owner[v] = node.getName();
      }
      P.push(apply(m, pos.getElement(v, [])));
      if (nor) N.push(applyN(normalMatrix(m), nor.getElement(v, [])));
      if (tan) { const e = tan.getElement(v, []); T.push([...applyDir(m, e), e[3]]); }
    }
    // Triangles to bones (by their first point's bone: a part's triangles
    // don't straddle bones), then, where asked, into touching pieces (points
    // at the same place count as one, across seams in the texture).
    const key = new Map();
    const same = new Int32Array(n);
    for (let v = 0; v < n; v++) {
      const k = P[v].map((c) => Math.round(c * 1e5)).join(',');
      if (!key.has(k)) key.set(k, v);
      same[v] = key.get(k);
    }
    const parent = Int32Array.from({ length: n }, (_, i) => i);
    const find = (a) => { while (parent[a] !== a) a = parent[a] = parent[parent[a]]; return a; };
    for (let i = 0; i < count; i += 3) {
      const a = find(same[at(i)]);
      for (let k = 1; k < 3; k++) { const b = find(same[at(i + k)]); if (a !== b) parent[b] = a; }
    }
    const groups = new Map(); // id -> triangle starts
    const order = new Map(); // bone -> piece roots in order of first use
    for (let i = 0; i < count; i += 3) {
      const bone = owner[at(i)];
      let id = bone;
      if (split.has(bone)) {
        const r = find(same[at(i)]);
        if (!order.has(bone)) order.set(bone, new Map());
        const o = order.get(bone);
        if (!o.has(r)) o.set(r, o.size);
        id = `${bone}#${o.get(r)}`;
      }
      if (!groups.has(id)) groups.set(id, []);
      groups.get(id).push(i);
    }
    for (const [id, tris] of groups) {
      const bone = id.replace(/#\d+$/, '');
      if (drop.has(bone) || drop.has(id)) continue;
      const name = pieceName.get(id) || (id === bone ? (rc.bones || {})[bone] : null) || id;
      if (pieceName.has(id)) usedIds.add(id);
      const remap = new Map();
      const out = { material: prim.getMaterial(), positions: [], normals: [], tangents: [], uvs: [], indices: [] };
      for (const i of tris) for (let k = 0; k < 3; k++) {
        const v = at(i + k);
        if (!remap.has(v)) {
          remap.set(v, remap.size);
          out.positions.push(...P[v]);
          if (nor) out.normals.push(...N[v]);
          if (tan) out.tangents.push(...T[v]);
          if (uv) out.uvs.push(...uv.getElement(v, []));
        }
        out.indices.push(remap.get(v));
      }
      // Triangles wound against their own normals (a mirrored copy, as the
      // Galil's right handguard panel is) are turned round: three.js lights
      // a double-sided material's back faces from behind.
      let against = 0;
      for (let i = 0; i < out.indices.length; i += 3) {
        const [a, b, c] = [0, 1, 2].map((k) => out.indices[i + k] * 3);
        const e1 = [0, 1, 2].map((k) => out.positions[b + k] - out.positions[a + k]), e2 = [0, 1, 2].map((k) => out.positions[c + k] - out.positions[a + k]);
        const f = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
        if (out.normals.length) against += [a, b, c].reduce((s, v) => s + f[0] * out.normals[v] + f[1] * out.normals[v + 1] + f[2] * out.normals[v + 2], 0) < 0 ? 1 : 0;
      }
      if (against > out.indices.length / 6) {
        for (let i = 0; i < out.indices.length; i += 3) [out.indices[i + 1], out.indices[i + 2]] = [out.indices[i + 2], out.indices[i + 1]];
        console.log(`${id}: triangles turned round (wound against their normals)`);
      }
      if (!parts.has(name)) parts.set(name, []);
      parts.get(name).push(out);
      const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
      for (let v = 0; v < out.positions.length; v += 3) for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], out.positions[v + k]); hi[k] = Math.max(hi[k], out.positions[v + k]); }
      report.push({ id, name, tris: tris.length, mid: lo.map((v, k) => +((v + hi[k]) / 2).toFixed(4)), size: lo.map((v, k) => +(hi[k] - v).toFixed(4)) });
    }
  }
}
const unused = [...pieceName.keys()].filter((id) => !usedIds.has(id));
if (unused.length) throw new Error('config names pieces the download lacks: ' + unused.join(', '));
if (process.env.PIECES_JSON) fs.writeFileSync(process.env.PIECES_JSON, JSON.stringify(report, null, 1));

// Parts the pose leaves out of place (the Galil's rounds sit behind the
// magazine, not in it) are moved by CONFIG.rigid.move: { name: [x, y, z] }
// in the download's units, in the gun's frame.
for (const [name, by] of Object.entries(rc.move || {})) {
  if (!parts.has(name)) throw new Error(`move: no part ${name}`);
  for (const piece of parts.get(name)) for (let v = 0; v < piece.positions.length; v += 3) for (let k = 0; k < 3; k++) piece.positions[v + k] += by[k];
}

// --- A new scene: one node a part ---
const buffer = root.listBuffers()[0];
const accessor = (array, type) => doc.createAccessor().setType(type).setArray(array).setBuffer(buffer);
for (const child of scene.listChildren()) scene.removeChild(child);
for (const [name, list] of parts) {
  const mesh = doc.createMesh(name);
  // (A part made of pieces with the same material becomes one primitive.)
  const byMaterial = new Map();
  for (const piece of list) {
    if (!byMaterial.has(piece.material)) byMaterial.set(piece.material, []);
    byMaterial.get(piece.material).push(piece);
  }
  for (const [material, pieces] of byMaterial) {
    const all = { positions: [], normals: [], tangents: [], uvs: [], indices: [] };
    for (const p of pieces) {
      const base = all.positions.length / 3;
      for (const k of ['positions', 'normals', 'tangents', 'uvs']) all[k].push(...p[k]);
      all.indices.push(...p.indices.map((i) => i + base));
    }
    const prim = doc.createPrimitive().setMaterial(material);
    prim.setAttribute('POSITION', accessor(new Float32Array(all.positions), 'VEC3'));
    if (all.normals.length) prim.setAttribute('NORMAL', accessor(new Float32Array(all.normals), 'VEC3'));
    if (all.tangents.length) prim.setAttribute('TANGENT', accessor(new Float32Array(all.tangents), 'VEC4'));
    if (all.uvs.length) prim.setAttribute('TEXCOORD_0', accessor(new Float32Array(all.uvs), 'VEC2'));
    const big = all.positions.length / 3 > 65535;
    prim.setIndices(accessor(big ? new Uint32Array(all.indices) : new Uint16Array(all.indices), 'SCALAR'));
    mesh.addPrimitive(prim);
  }
  scene.addChild(doc.createNode(name).setMesh(mesh));
}
for (const a of root.listAnimations()) a.dispose();
for (const s of root.listSkins()) s.dispose();
for (const node of root.listNodes()) if (!scene.listChildren().includes(node)) node.dispose();
for (const camera of root.listCameras()) camera.dispose();
await doc.transform(prune({ keepLeaves: false }));
// Materials that share a texture and otherwise differ by no more than a
// shade (the Galil's rounds have one each) become one: build_breakdown.mjs
// sizes each texture for the one material it belongs to.
{
  const textures = (m) => [m.getBaseColorTexture(), m.getNormalTexture(), m.getMetallicRoughnessTexture(), m.getOcclusionTexture(), m.getEmissiveTexture()];
  const close = (a, b) => a.length === b.length && a.every((v, k) => Math.abs(v - b[k]) < 0.01);
  const same = (a, b) => textures(a).every((t, k) => t === textures(b)[k]) && close(a.getBaseColorFactor(), b.getBaseColorFactor())
    && close([a.getMetallicFactor(), a.getRoughnessFactor(), a.getNormalScale()], [b.getMetallicFactor(), b.getRoughnessFactor(), b.getNormalScale()])
    && a.getAlphaMode() === b.getAlphaMode() && a.getDoubleSided() === b.getDoubleSided();
  const kept = [];
  for (const m of root.listMaterials()) {
    const twin = kept.find((k) => same(k, m));
    if (!twin) { kept.push(m); continue; }
    for (const prim of root.listMeshes().flatMap((mesh) => mesh.listPrimitives())) if (prim.getMaterial() === m) prim.setMaterial(twin);
    m.dispose();
  }
}

// --- Textures: resized, stamped lettering rubbed out ---
for (const texture of root.listTextures()) {
  const file = (texture.getURI() || '').replace(/^.*\//, '');
  const job = (rc.textures || {})[file];
  if (!job) continue;
  let img = sharp(Buffer.from(texture.getImage())).removeAlpha().toColourspace('srgb');
  const { data, info } = await img.raw().toBuffer({ resolveWithObject: true });
  const pixels = Buffer.from(data);
  for (const [x, y, w, h] of job.rub || []) {
    // A margin round the box feeds the median and the blend.
    const m = 8, x0 = Math.max(0, x - m), y0 = Math.max(0, y - m);
    const x1 = Math.min(info.width, x + w + m), y1 = Math.min(info.height, y + h + m);
    const radius = job.median || 15;
    const filtered = await sharp(data, { raw: info }).extract({ left: x0, top: y0, width: x1 - x0, height: y1 - y0 }).median(radius).raw().toBuffer();
    for (let py = y0; py < y1; py++) for (let px = x0; px < x1; px++) {
      // 1 inside the box, falling to 0 across the margin.
      const d = Math.max(x - px, px - (x + w - 1), y - py, py - (y + h - 1), 0);
      const k = Math.max(0, 1 - d / m);
      if (!k) continue;
      for (let c = 0; c < info.channels; c++) {
        const o = (py * info.width + px) * info.channels + c;
        const f = ((py - y0) * (x1 - x0) + (px - x0)) * info.channels + c;
        pixels[o] = Math.round(pixels[o] * (1 - k) + filtered[f] * k);
      }
    }
  }
  img = sharp(pixels, { raw: info });
  if (job.size && job.size !== info.width) img = img.resize(job.size, job.size, { kernel: 'lanczos3', fit: 'fill' });
  texture.setImage(new Uint8Array(await img.png({ compressionLevel: 6 }).toBuffer())).setMimeType('image/png');
  console.log(`texture ${file}: ${(job.rub || []).length} boxes rubbed${job.size ? `, ${job.size} px` : ''}`);
}

fs.mkdirSync(outDir, { recursive: true });
await io.write(path.join(outDir, 'scene.gltf'), doc);
console.log(`${outDir}: ${parts.size} parts from ${report.length} pieces`);
