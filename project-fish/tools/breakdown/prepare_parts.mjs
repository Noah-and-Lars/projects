// Gets a download ready for build_breakdown.mjs when its parts aren't
// already one mesh each: poses it at a moment of its own animation, leaves
// out what isn't the gun, splits meshes that hold several parts into one
// node per part, tidies its materials and rubs makers' marks off its
// textures. Only the SCAR-L needs it so far.
//
//     node tools/breakdown/prepare_parts.mjs SOURCE_FOLDER CONFIG.json OUT_FOLDER
//
// For the SCAR-L (from the project-fish folder), then the usual build:
//
//     node tools/breakdown/prepare_parts.mjs build/upload-breakdown2 tools/breakdown/scar_l.json build/scar-l-parts
//     node tools/breakdown/build_breakdown.mjs build/scar-l-parts tools/breakdown/scar_l.json assets/breakdown/scar_l.glb
//
// SOURCE_FOLDER (the download's glTF, unzipped) is only read. OUT_FOLDER
// gets a scene.gltf whose every node is one part (a part of several
// materials is several nodes: the part's name for its biggest piece,
// <part>_m2, _m3... for the rest), its points in the download's units where
// the gun sits in the chosen pose. CONFIG.prepare:
//   pose    { time, nodes: { node: time } }: the moment of the download's
//           animation to take each node's place from (seconds; nodes not
//           listed take `time`).
//   drop    node names left out, with everything under them.
//   split   for each mesh's node (or that node's parent), by name: a part's
//           name, or { default, parts: [{ name, box: [[x, y, z], [x, y, z]] }] }:
//           the mesh's pieces (runs of joined triangles) go to the first part
//           whose box holds the piece's middle, or to default (no default:
//           a piece in no box is an error). Boxes are in the download's
//           units, in the pose.
//   rub     for each texture (its file name without extension): rectangles
//           [x0, y0, x1, y1] (fractions of the image) to clean, each with
//           median: N (a median filter N texels wide, counted at 2048 px, so
//           twice as wide on a 4096 px image: it wipes strokes thinner than
//           half that), from: [dx, dy] (fractions: a patch that far away is
//           copied over it) or inpaint: true (filled smoothly from the texels
//           round it), feathered over its outer few texels.
// Materials: every texture reads the first texture coordinates (it stops
// if a map used another set that differs from the first), all-black
// emissive textures go, a specular texture becomes its mean strength (its
// alpha; 0 on the polymer and the scope, which then don't shine), and glass is drawn
// as plain see-through (no transmission pass).
//
// PREP_DEBUG=1 makes every piece its own part, named <mesh>_<n>__<k> (to
// find the pieces when writing `split`); PREP_REPORT=FILE writes each
// piece's part, material, triangles, middle and size.

import fs from 'node:fs';
import path from 'node:path';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { prune } from '@gltf-transform/functions';
import sharp from 'sharp';

const [source, configPath, out] = process.argv.slice(2);
if (!source || !configPath || !out) {
  console.error('usage: node tools/breakdown/prepare_parts.mjs SOURCE_FOLDER CONFIG.json OUT_FOLDER');
  process.exit(1);
}
const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
const prep = config.prepare || {};
const DEBUG = !!process.env.PREP_DEBUG; // every piece its own part, named <mesh>__<n>

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc = await io.read(path.join(source, 'scene.gltf'));
const root = doc.getRoot();
const scene = root.listScenes()[0];

// --- Pose: each animated node where the animation has it at its time ---
const timeFor = (node) => (prep.pose && prep.pose.nodes && prep.pose.nodes[node.getName()] != null ? prep.pose.nodes[node.getName()] : prep.pose ? prep.pose.time : null);
for (const animation of root.listAnimations()) {
  for (const channel of animation.listChannels()) {
    const node = channel.getTargetNode();
    const t = timeFor(node);
    if (t == null) continue;
    const sampler = channel.getSampler();
    const input = sampler.getInput().getArray();
    const output = sampler.getOutput();
    const n = output.getElementSize();
    const cubic = sampler.getInterpolation() === 'CUBICSPLINE';
    const value = (i) => output.getElement(cubic ? i * 3 + 1 : i, []);
    let k = 0;
    while (k < input.length && input[k] < t) k++;
    let v;
    if (k === 0) v = value(0);
    else if (k === input.length) v = value(input.length - 1);
    else {
      const a = (t - input[k - 1]) / Math.max(1e-9, input[k] - input[k - 1]);
      const p = value(k - 1), q = value(k);
      if (sampler.getInterpolation() === 'STEP') v = p;
      else {
        // (Rotations the short way round, then normalised.)
        const flip = n === 4 && p.reduce((s, x, i) => s + x * q[i], 0) < 0 ? -1 : 1;
        v = p.map((x, i) => x * (1 - a) + flip * q[i] * a);
        if (n === 4) { const l = Math.hypot(...v); v = v.map((x) => x / l); }
      }
    }
    const pathName = channel.getTargetPath();
    if (pathName === 'translation') node.setTranslation(v);
    else if (pathName === 'rotation') node.setRotation(v);
    else if (pathName === 'scale') node.setScale(v);
  }
}

// --- Drop what isn't the gun ---
const dropNames = new Set(prep.drop || []);
const dropped = new Set();
const markDrop = (node) => { dropped.add(node); for (const c of node.listChildren()) markDrop(c); };
for (const node of root.listNodes()) if (dropNames.has(node.getName())) markDrop(node);
const missingDrops = [...dropNames].filter((n) => !root.listNodes().some((node) => node.getName() === n));
if (missingDrops.length) throw new Error('drop names nodes the download lacks: ' + missingDrops.join(', '));

// --- Texture coordinates: only the first set is kept ---
for (const mesh of root.listMeshes()) for (const prim of mesh.listPrimitives()) {
  const material = prim.getMaterial();
  if (!material) continue;
  const infos = [material.getBaseColorTextureInfo(), material.getMetallicRoughnessTextureInfo(), material.getNormalTextureInfo(), material.getOcclusionTextureInfo(), material.getEmissiveTextureInfo()];
  for (const [k, info] of infos.entries()) {
    const texture = [material.getBaseColorTexture(), material.getMetallicRoughnessTexture(), material.getNormalTexture(), material.getOcclusionTexture(), material.getEmissiveTexture()][k];
    if (!info || !texture || info.getTexCoord() === 0) continue;
    const a = prim.getAttribute('TEXCOORD_0'), b = prim.getAttribute('TEXCOORD_' + info.getTexCoord());
    const x = a && a.getArray(), y = b && b.getArray();
    if (!x || !y || x.length !== y.length || x.some((v, i) => Math.abs(v - y[i]) > 1e-6)) throw new Error(`material ${material.getName()}: a map reads texture coordinates ${info.getTexCoord()}, which differ from the first`);
  }
}

// --- Split ---
const apply = (m, x, y, z) => [m[0] * x + m[4] * y + m[8] * z + m[12], m[1] * x + m[5] * y + m[9] * z + m[13], m[2] * x + m[6] * y + m[10] * z + m[14]];
const rotate = (m, x, y, z) => [m[0] * x + m[4] * y + m[8] * z, m[1] * x + m[5] * y + m[9] * z, m[2] * x + m[6] * y + m[10] * z];
const norm = (v) => { const l = Math.hypot(...v) || 1; return v.map((c) => c / l); };
const inBox = (p, box) => p.every((v, k) => v >= box[0][k] && v <= box[1][k]);

// Runs of triangles joined by shared points (points welded by position).
function pieces(points, index) {
  const key = new Map();
  const id = points.map((p) => {
    const k = p.map((v) => Math.round(v * 1e5)).join(',');
    if (!key.has(k)) key.set(k, key.size);
    return key.get(k);
  });
  const parent = Int32Array.from({ length: key.size }, (_, i) => i);
  const find = (a) => { while (parent[a] !== a) a = parent[a] = parent[parent[a]]; return a; };
  for (let i = 0; i < index.length; i += 3) {
    const a = find(id[index[i]]);
    for (let k = 1; k < 3; k++) { const b = find(id[index[i + k]]); if (b !== a) parent[b] = a; }
  }
  const groups = new Map();
  for (let i = 0; i < index.length; i += 3) {
    const r = find(id[index[i]]);
    if (!groups.has(r)) groups.set(r, []);
    groups.get(r).push(i / 3);
  }
  return [...groups.values()];
}

const buckets = new Map(); // part -> material -> { semantics, tris: [{ prim, world, tri }] }
const report = [];
const used = new Set();
for (const node of root.listNodes()) {
  const mesh = node.getMesh();
  if (!mesh || dropped.has(node)) continue;
  const parentNode = node.getParentNode();
  const key = [node.getName(), parentNode && parentNode.getName()].find((n) => n && prep.split && prep.split[n] != null);
  if (!key && !DEBUG) throw new Error(`no split entry for the mesh on node "${node.getName()}" (parent "${parentNode && parentNode.getName()}")`);
  const rule = key ? prep.split[key] : null;
  if (key) used.add(key);
  const world = node.getWorldMatrix();
  mesh.listPrimitives().forEach((prim, pi) => {
    const pos = prim.getAttribute('POSITION');
    const points = [];
    for (let i = 0; i < pos.getCount(); i++) points.push(apply(world, ...pos.getElement(i, [])));
    const index = prim.getIndices() ? Array.from(prim.getIndices().getArray()) : points.map((_, i) => i);
    const material = prim.getMaterial();
    for (const [n, tris] of pieces(points, index).entries()) {
      const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
      for (const t of tris) for (let k = 0; k < 3; k++) { const p = points[index[t * 3 + k]]; for (let c = 0; c < 3; c++) { lo[c] = Math.min(lo[c], p[c]); hi[c] = Math.max(hi[c], p[c]); } }
      const mid = lo.map((v, c) => (v + hi[c]) / 2);
      let part;
      if (DEBUG) part = `${(key || node.getName()).replace(/[^\w.]/g, '_')}_${pi}__${n}`;
      else if (typeof rule === 'string') part = rule;
      else {
        const hit = (rule.parts || []).find((p) => inBox(mid, p.box));
        part = hit ? hit.name : rule.default;
        if (!part) throw new Error(`a piece of "${key}" in no box: middle ${mid.map((v) => v.toFixed(3))}, size ${hi.map((v, c) => (v - lo[c]).toFixed(3))}`);
      }
      report.push({ part, mesh: key || node.getName(), material: material && material.getName(), triangles: tris.length, mid: mid.map((v) => +v.toFixed(4)), size: hi.map((v, c) => +(v - lo[c]).toFixed(4)) });
      if (!buckets.has(part)) buckets.set(part, new Map());
      const semantics = prim.listSemantics().filter((s) => s === 'POSITION' || s === 'NORMAL' || s === 'TANGENT' || s === 'TEXCOORD_0').sort().join(',');
      const mkey = `${material ? material.getName() : ''}|${semantics}`;
      if (!buckets.get(part).has(mkey)) buckets.get(part).set(mkey, { material, semantics: semantics.split(','), tris: [] });
      buckets.get(part).get(mkey).tris.push({ prim, world, index, list: tris });
    }
  });
}
if (prep.split && !DEBUG) {
  const unused = Object.keys(prep.split).filter((k) => !used.has(k));
  if (unused.length) throw new Error('split names meshes the download lacks (or that were dropped): ' + unused.join(', '));
  for (const [k, rule] of Object.entries(prep.split)) {
    if (typeof rule === 'string') continue;
    for (const p of rule.parts || []) if (!report.some((r) => r.mesh === k && r.part === p.name)) throw new Error(`split: no piece of "${k}" falls in the box of ${p.name}`);
  }
}

// New nodes, one per part and material (the breakdown moves meshes of one
// material each), holding its triangles in world units: the part's name
// for its biggest, <part>_m2, _m3... for the rest.
const buffer = root.listBuffers()[0];
const fresh = [];
for (const [part, byMaterial] of buckets) {
  const sorted = [...byMaterial.values()].sort((a, b) => b.tris.reduce((s, t) => s + t.list.length, 0) - a.tris.reduce((s, t) => s + t.list.length, 0));
  sorted.forEach(({ material, semantics, tris }, k) => {
    const name = k ? `${part}_m${k + 1}` : part;
    const mesh = doc.createMesh(name);
    const data = Object.fromEntries(semantics.map((s) => [s, []]));
    const indices = [];
    for (const { prim, world, index, list } of tris) {
      const remap = new Map();
      const attr = Object.fromEntries(semantics.map((s) => [s, prim.getAttribute(s)]));
      for (const t of list) {
        for (let k = 0; k < 3; k++) {
          const v = index[t * 3 + k];
          if (!remap.has(v)) {
            remap.set(v, data.POSITION.length);
            for (const s of semantics) {
              const e = attr[s].getElement(v, []);
              if (s === 'POSITION') data[s].push(apply(world, ...e));
              else if (s === 'NORMAL') data[s].push(norm(rotate(world, ...e)));
              else if (s === 'TANGENT') data[s].push([...norm(rotate(world, e[0], e[1], e[2])), e[3]]);
              else data[s].push(e);
            }
          }
          indices.push(remap.get(v));
        }
      }
    }
    const prim = doc.createPrimitive().setMaterial(material);
    for (const s of semantics) {
      const size = data[s][0].length;
      prim.setAttribute(s, doc.createAccessor().setType(size === 2 ? 'VEC2' : size === 3 ? 'VEC3' : 'VEC4').setArray(new Float32Array(data[s].flat())).setBuffer(buffer));
    }
    const count = data.POSITION.length;
    prim.setIndices(doc.createAccessor().setType('SCALAR').setArray(count > 65535 ? new Uint32Array(indices) : new Uint16Array(indices)).setBuffer(buffer));
    mesh.addPrimitive(prim);
    fresh.push(doc.createNode(name).setMesh(mesh));
  });
}
for (const child of scene.listChildren()) scene.removeChild(child);
for (const animation of root.listAnimations()) animation.dispose();
for (const node of root.listNodes()) if (!fresh.includes(node)) node.dispose();
for (const camera of root.listCameras()) camera.dispose();
for (const node of fresh) scene.addChild(node);

// --- Materials ---
for (const material of root.listMaterials()) {
  for (const info of [material.getBaseColorTextureInfo(), material.getMetallicRoughnessTextureInfo(), material.getNormalTextureInfo(), material.getOcclusionTextureInfo(), material.getEmissiveTextureInfo()]) if (info) info.setTexCoord(0);
  const emissive = material.getEmissiveTexture();
  if (emissive) {
    const { data } = await sharp(Buffer.from(emissive.getImage())).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    if (data.every((v) => v === 0)) material.setEmissiveTexture(null);
  }
  // Specular: its texture's alpha is the strength (glTF's KHR_materials_
  // specular). The download's are flat or nearly (0 on the polymer and the
  // scope, so they don't shine), so each becomes a plain factor: the mean.
  const specular = material.getExtension('KHR_materials_specular');
  if (specular) {
    if (specular.getSpecularColorTexture() || specular.getSpecularColorFactor().some((v) => v !== 1)) throw new Error(`material ${material.getName()}: a specular colour is not handled`);
    const tex = specular.getSpecularTexture();
    let strength = specular.getSpecularFactor();
    if (tex) {
      const { data, info } = await sharp(Buffer.from(tex.getImage())).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      let sum = 0;
      for (let i = info.channels - 1; i < data.length; i += info.channels) sum += data[i];
      strength *= sum / (data.length / info.channels) / 255;
      specular.setSpecularTexture(null);
    }
    strength = Math.round(strength * 1000) / 1000;
    if (strength >= 0.999) material.setExtension('KHR_materials_specular', null);
    else specular.setSpecularFactor(strength);
  }
  if (material.getExtension('KHR_materials_transmission')) material.setExtension('KHR_materials_transmission', null);
}
await doc.transform(prune({ keepLeaves: false }));
for (const name of ['KHR_materials_transmission']) {
  const ext = root.listExtensionsUsed().find((e) => e.extensionName === name);
  if (ext) ext.dispose();
}

// --- Rub off makers' marks ---
for (const [name, rects] of Object.entries(prep.rub || {})) {
  const texture = root.listTextures().find((t) => (t.getURI() || '').replace(/^.*\//, '').replace(/\.\w+$/, '') === name);
  if (!texture) throw new Error(`rub: no texture ${name}`);
  const img = sharp(Buffer.from(texture.getImage())).removeAlpha().toColourspace('srgb');
  const { data, info } = await img.raw().toBuffer({ resolveWithObject: true });
  const W = info.width, H = info.height, C = info.channels;
  for (const r of rects) {
    const [x0, y0, x1, y1] = [Math.round(r.rect[0] * W), Math.round(r.rect[1] * H), Math.round(r.rect[2] * W), Math.round(r.rect[3] * H)];
    const w = x1 - x0, h = y1 - y0;
    let patch;
    if (r.inpaint) {
      // Smoothly across from the texels just outside each edge (for small
      // marks on plain ground).
      const src = Buffer.from(data);
      const at = (x, y) => { const cx = Math.min(W - 1, Math.max(0, x)), cy = Math.min(H - 1, Math.max(0, y)); return src.slice((cy * W + cx) * C, (cy * W + cx) * C + C); };
      patch = (x, y) => {
        const sides = [[at(x0 - 1, y), x - x0 + 1], [at(x1, y), x1 - x], [at(x, y0 - 1), y - y0 + 1], [at(x, y1), y1 - y]];
        const out = new Array(C).fill(0); let total = 0;
        for (const [p, d] of sides) { const wgt = 1 / (d * d); total += wgt; for (let c = 0; c < C; c++) out[c] += p[c] * wgt; }
        return out.map((v) => v / total);
      };
    } else if (r.median) {
      // (Filtered with a margin round it, so its edge texels see their
      // neighbours.)
      const m = Math.ceil(r.median * (W / 2048));
      const size = Math.max(3, m | 1);
      const ex = { left: Math.max(0, x0 - size), top: Math.max(0, y0 - size) };
      ex.width = Math.min(W, x1 + size) - ex.left; ex.height = Math.min(H, y1 + size) - ex.top;
      const big = await sharp(data, { raw: info }).extract(ex).median(size).raw().toBuffer();
      patch = (x, y) => (big.slice(((y - ex.top) * ex.width + (x - ex.left)) * C, ((y - ex.top) * ex.width + (x - ex.left)) * C + C));
    } else {
      const dx = Math.round(r.from[0] * W), dy = Math.round(r.from[1] * H);
      const src = Buffer.from(data);
      patch = (x, y) => src.slice(((y + dy) * W + (x + dx)) * C, ((y + dy) * W + (x + dx)) * C + C);
    }
    // Feathered: full inside, fading over the outer `edge` texels.
    const edge = Math.max(2, Math.min(Math.round(4 * W / 2048), Math.round(Math.min(w, h) * 0.15)));
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
      const d = Math.min(x - x0, x1 - 1 - x, y - y0, y1 - 1 - y);
      const a = Math.min(1, (d + 1) / edge);
      const p = patch(x, y), o = (y * W + x) * C;
      for (let c = 0; c < C; c++) data[o + c] = Math.round(data[o + c] * (1 - a) + p[c] * a);
    }
  }
  const png = await sharp(data, { raw: info }).png({ compressionLevel: 6 }).toBuffer();
  texture.setImage(new Uint8Array(png)).setMimeType('image/png');
  console.log(`rubbed ${rects.length} marks off ${name}`);
}

fs.mkdirSync(out, { recursive: true });
await io.write(path.join(out, 'scene.gltf'), doc);
console.log(`${out}: ${fresh.length} parts`);
if (process.env.PREP_REPORT) fs.writeFileSync(process.env.PREP_REPORT, JSON.stringify(report, null, 1));
