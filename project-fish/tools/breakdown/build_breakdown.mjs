// Turns a downloaded gun made of separate parts into a breakdown model: the
// file src/showcase/breakdown.js takes apart, part by part.
//
//     node tools/breakdown/build_breakdown.mjs SOURCE_FOLDER CONFIG.json OUT.glb
//
// For the AR-15 (npm run build-breakdown does this, from the project-fish folder):
//
//     node tools/breakdown/build_breakdown.mjs build/upload-ar-breakdown tools/breakdown/ar_slr.json assets/breakdown/ar_slr.glb
//
// SOURCE_FOLDER is the download's glTF version unzipped (scene.gltf,
// scene.bin, textures/). It is only read. CONFIG names every mesh of the
// download (by its node's name) and says how to credit it. What it does:
// - Drops the download's camera, lights and animation (the breakdown makes
//   its own moves).
// - Every mesh becomes its own node, named from CONFIG, straight under one
//   root: its points are moved into metres (CONFIG.metresPerUnit), with the
//   whole gun centred on the origin (muzzle towards +Z, up +Y, the gun's
//   right side towards -X), and the node sits at the middle of its part, so a
//   part can be moved or turned about itself.
// - Textures that are one flat colour (or a flat normal map, or a flat
//   roughness and metalness) become plain values on the material. The rest
//   are resized so each part keeps at least CONFIG.texelsPerMm texels a
//   millimetre (never above the download's own size, at most 2048 px), and
//   stored as WebP: colour at quality 92, normal and roughness/metal maps
//   near-lossless (lossy WebP would smear their channels).
// - Simplifies the meshes CONFIG.simplify names to that share of their
//   triangles (the dust cover's coil spring alone was 53,000 triangles).
// - Compresses the meshes (meshopt) and writes who made the model and its
//   license into the file (asset.copyright, asset.extras).

import fs from 'node:fs';
import path from 'node:path';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS, EXTTextureWebP } from '@gltf-transform/extensions';
import { dedup, meshopt, prune, simplifyPrimitive, weld } from '@gltf-transform/functions';
import { MeshoptDecoder, MeshoptEncoder, MeshoptSimplifier } from 'meshoptimizer';
import sharp from 'sharp';

const [source, configPath, out] = process.argv.slice(2);
if (!source || !configPath || !out) {
  console.error('usage: node tools/breakdown/build_breakdown.mjs SOURCE_FOLDER CONFIG.json OUT.glb');
  process.exit(1);
}
const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
const SCALE = config.metresPerUnit;
const MAX_SIZE = 2048;

await Promise.all([MeshoptEncoder.ready, MeshoptDecoder.ready, MeshoptSimplifier.ready]);
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
  'meshopt.decoder': MeshoptDecoder,
  'meshopt.encoder': MeshoptEncoder,
});
const doc = await io.read(path.join(source, 'scene.gltf'));
const root = doc.getRoot();
const scene = root.listScenes()[0];

// --- Matrices (column-major, as glTF) ---
const apply = (m, x, y, z) => [m[0] * x + m[4] * y + m[8] * z + m[12], m[1] * x + m[5] * y + m[9] * z + m[13], m[2] * x + m[6] * y + m[10] * z + m[14]];
const rotate = (m, x, y, z) => [m[0] * x + m[4] * y + m[8] * z, m[1] * x + m[5] * y + m[9] * z, m[2] * x + m[6] * y + m[10] * z];
const norm = (v) => { const l = Math.hypot(...v) || 1; return v.map((c) => c / l); };

// --- The parts: every mesh node, named from the config ---
const parts = [];
const named = new Set();
for (const node of root.listNodes()) {
  const mesh = node.getMesh();
  if (!mesh) continue;
  // Sketchfab puts each mesh on a child node "<name>_<material>_0" of the node CONFIG names.
  const parent = node.getParentNode();
  const key = [parent && parent.getName(), node.getName()].find((n) => n && config.parts[n]);
  if (!key) throw new Error(`no name in the config for the mesh on node "${node.getName()}"`);
  named.add(key);
  parts.push({ name: config.parts[key], mesh, world: node.getWorldMatrix() });
}
const missing = Object.keys(config.parts).filter((k) => !named.has(k));
if (missing.length) throw new Error('config names meshes the download lacks: ' + missing.join(', '));

// The whole gun's bounds (in the download's world units), to centre it.
const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
for (const part of parts) {
  for (const prim of part.mesh.listPrimitives()) {
    const p = prim.getAttribute('POSITION');
    for (let i = 0; i < p.getCount(); i++) {
      const w = apply(part.world, ...p.getElement(i, []));
      for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], w[k]); hi[k] = Math.max(hi[k], w[k]); }
    }
  }
}
const centre = lo.map((v, k) => (v + hi[k]) / 2);
const toMetres = (w) => w.map((v, k) => (v - centre[k]) * SCALE);

// Bake each part into metres about its own middle, on a fresh node.
const top = doc.createNode(config.id);
const used = new Set();
const density = new Map(); // material -> { area (m²), uv (texture fraction), prims, largest part (m) }
for (const part of parts) {
  if (used.has(part.mesh)) throw new Error(`mesh of ${part.name} is shared`);
  used.add(part.mesh);
  const pmin = [Infinity, Infinity, Infinity], pmax = [-Infinity, -Infinity, -Infinity];
  const baked = [];
  for (const prim of part.mesh.listPrimitives()) {
    const pos = prim.getAttribute('POSITION').clone();
    const pts = [];
    for (let i = 0; i < pos.getCount(); i++) {
      const m = toMetres(apply(part.world, ...pos.getElement(i, [])));
      pts.push(m);
      for (let k = 0; k < 3; k++) { pmin[k] = Math.min(pmin[k], m[k]); pmax[k] = Math.max(pmax[k], m[k]); }
    }
    baked.push({ prim, pos, pts });
  }
  const mid = pmin.map((v, k) => (v + pmax[k]) / 2);
  for (const { prim, pos, pts } of baked) {
    pts.forEach((m, i) => pos.setElement(i, [m[0] - mid[0], m[1] - mid[1], m[2] - mid[2]]));
    prim.setAttribute('POSITION', pos);
    const normal = prim.getAttribute('NORMAL');
    if (normal) {
      const n = normal.clone();
      for (let i = 0; i < n.getCount(); i++) n.setElement(i, norm(rotate(part.world, ...n.getElement(i, []))));
      prim.setAttribute('NORMAL', n);
    }
    const tangent = prim.getAttribute('TANGENT');
    if (tangent) {
      const t = tangent.clone();
      for (let i = 0; i < t.getCount(); i++) {
        const e = t.getElement(i, []);
        t.setElement(i, [...norm(rotate(part.world, e[0], e[1], e[2])), e[3]]);
      }
      prim.setAttribute('TANGENT', t);
    }
    // Only the first set of texture coordinates is read.
    for (const semantic of prim.listSemantics()) if (/^TEXCOORD_[1-9]/.test(semantic)) prim.setAttribute(semantic, null);
    // How much texture this material spreads over how much surface.
    const material = prim.getMaterial();
    const uv = prim.getAttribute('TEXCOORD_0');
    const index = prim.getIndices();
    if (material && uv) {
      const d = density.get(material) || { area: 0, uv: 0, prims: [], largest: 0 };
      d.prims.push(prim);
      d.parts = (d.parts || []).concat(part);
      const count = index ? index.getCount() : pts.length;
      const at = (i) => (index ? index.getScalar(i) : i);
      for (let i = 0; i < count; i += 3) {
        const [a, b, c] = [at(i), at(i + 1), at(i + 2)];
        const e1 = pts[b].map((v, k) => v - pts[a][k]), e2 = pts[c].map((v, k) => v - pts[a][k]);
        d.area += Math.hypot(e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]) / 2;
        const ua = uv.getElement(a, []), ub = uv.getElement(b, []), uc = uv.getElement(c, []);
        d.uv += Math.abs((ub[0] - ua[0]) * (uc[1] - ua[1]) - (ub[1] - ua[1]) * (uc[0] - ua[0])) / 2;
      }
      density.set(material, d);
    }
  }
  const node = doc.createNode(part.name).setMesh(part.mesh).setTranslation(mid);
  part.mesh.setName(part.name);
  top.addChild(node);
  part.mid = mid;
  part.size = pmax.map((v, k) => v - pmin[k]);
}
for (const d of density.values()) d.largest = Math.max(...d.parts.map((p) => Math.max(...p.size)));

// Only the new root stays in the scene; the download's nodes, camera, lights
// and animations go.
for (const child of scene.listChildren()) scene.removeChild(child);
for (const animation of root.listAnimations()) animation.dispose();
for (const node of root.listNodes()) if (node !== top && !top.listChildren().includes(node)) node.dispose();
for (const camera of root.listCameras()) camera.dispose();
scene.addChild(top);

// --- Simplify the over-dense meshes ---
await doc.transform(weld());
for (const [name, ratio] of Object.entries(config.simplify || {})) {
  const node = top.listChildren().find((n) => n.getName() === name);
  if (!node) throw new Error(`simplify: no part ${name}`);
  for (const prim of node.getMesh().listPrimitives()) {
    const before = prim.getIndices().getCount() / 3;
    simplifyPrimitive(prim, { simplifier: MeshoptSimplifier, ratio, error: 0.002 });
    console.log(`simplified ${name}: ${before} -> ${prim.getIndices().getCount() / 3} triangles`);
  }
}

// --- Textures ---
// Each part is seen at most about PX_ACROSS pixels across its longest side
// (filling most of a 2x screen), so its textures need that many texels over
// it: TEXELS_A_MM (a range) for colour and normal maps, half that for the
// roughness/metal map, whose detail is softer. A texture that only uses part
// of its square is first cropped to what its mesh uses.
const PX_ACROSS = config.pxAcross || 1000;
const TEXELS_A_MM = config.texelsPerMm || [4, 16];
const srgbToLinear = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
// Mean, spread and lowest value of each of red, green and blue (grey and
// palette images too).
const statsOf = async (texture) => {
  const { data, info } = await sharp(Buffer.from(texture.getImage())).removeAlpha().toColourspace('srgb').raw().toBuffer({ resolveWithObject: true });
  const n = info.channels;
  return [0, 1, 2].map((k) => {
    let sum = 0, sq = 0, min = 255;
    for (let i = k % n; i < data.length; i += n) { const v = data[i]; sum += v; sq += v * v; if (v < min) min = v; }
    const count = data.length / n, mean = sum / count;
    return { mean, stdev: Math.sqrt(Math.max(0, sq / count - mean * mean)), min };
  });
};
const flat = (channels, which, limit) => which.every((k) => channels[k].stdev < limit);
let flattened = 0;
const jobs = []; // { texture, kind, material }
for (const material of root.listMaterials()) {
  const base = material.getBaseColorTexture();
  if (base) {
    const c = await statsOf(base);
    // (Near-black ones too: a little noise on black can't be seen.)
    const dark = c.every((ch) => ch.mean < 25);
    // (A see-through material's colour texture stays: its alpha matters.)
    if (flat(c, [0, 1, 2], dark ? 3 : 1.5) && material.getAlphaMode() === 'OPAQUE') {
      const f = material.getBaseColorFactor();
      material.setBaseColorFactor([0, 1, 2].map((k) => srgbToLinear(c[k].mean / 255) * f[k]).concat(f[3]));
      material.setBaseColorTexture(null);
      flattened++;
    } else jobs.push({ texture: base, kind: 'colour', material });
  }
  const mr = material.getMetallicRoughnessTexture();
  if (mr) {
    const c = await statsOf(mr);
    // Its red channel would be ambient occlusion: white throughout here.
    if (material.getOcclusionTexture() === mr && c[0].min >= 250) material.setOcclusionTexture(null);
    if (flat(c, [1, 2], 1.5) && !material.getOcclusionTexture()) {
      material.setRoughnessFactor(material.getRoughnessFactor() * (c[1].mean / 255));
      material.setMetallicFactor(material.getMetallicFactor() * (c[2].mean / 255));
      material.setMetallicRoughnessTexture(null);
      flattened++;
    } else jobs.push({ texture: mr, kind: 'data', material, half: true });
  }
  if (material.getOcclusionTexture() && material.getOcclusionTexture() !== mr) throw new Error('separate occlusion maps are not handled');
  const normal = material.getNormalTexture();
  if (normal) {
    const c = await statsOf(normal);
    if (flat(c, [0, 1], 0.8)) { material.setNormalTexture(null); flattened++; } else jobs.push({ texture: normal, kind: 'data', material });
  }
}
for (const job of jobs) {
  if (job.texture.listParents().filter((p) => p.propertyType === 'Material').length > 1) throw new Error('a texture shared between materials is not handled');
}

// A texture's islands (the pieces of the square its meshes' triangles are
// laid out on), as rectangles in the download's texels, padded and merged
// where they overlap; null if any texture coordinate leaves the square (the
// texture repeats, so it stays whole).
const PAD = 6; // texels of margin round each island, in the new texture
const islandsOf = (material, size) => {
  const d = density.get(material);
  if (!d) return null;
  const rects = [];
  const members = []; // per rect: [{ prim, vertices }]
  for (const prim of d.prims) {
    const uv = prim.getAttribute('TEXCOORD_0');
    const n = uv.getCount();
    const parent = Int32Array.from({ length: n }, (_, i) => i);
    const find = (a) => { while (parent[a] !== a) a = parent[a] = parent[parent[a]]; return a; };
    const index = prim.getIndices();
    const count = index ? index.getCount() : n;
    for (let i = 0; i < count; i += 3) {
      const a = find(index ? index.getScalar(i) : i);
      for (let k = 1; k < 3; k++) { const b = find(index ? index.getScalar(i + k) : i + k); if (a !== b) parent[b] = a; }
    }
    const groups = new Map();
    for (let v = 0; v < n; v++) {
      const [u, w] = uv.getElement(v, []);
      if (u < -1e-4 || w < -1e-4 || u > 1 + 1e-4 || w > 1 + 1e-4) return null;
      const r = find(v);
      const g = groups.get(r) || { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity, vertices: [] };
      g.x0 = Math.min(g.x0, u * size); g.y0 = Math.min(g.y0, w * size); g.x1 = Math.max(g.x1, u * size); g.y1 = Math.max(g.y1, w * size);
      g.vertices.push(v);
      groups.set(r, g);
    }
    for (const g of groups.values()) { rects.push({ x0: g.x0, y0: g.y0, x1: g.x1, y1: g.y1 }); members.push([{ prim, vertices: g.vertices }]); }
  }
  // Merge rectangles that overlap (with a margin), until none do.
  const m = 4;
  for (let changed = true; changed;) {
    changed = false;
    for (let a = 0; a < rects.length && !changed; a++) {
      for (let b = a + 1; b < rects.length; b++) {
        const A = rects[a], B = rects[b];
        if (A.x0 - m < B.x1 && B.x0 - m < A.x1 && A.y0 - m < B.y1 && B.y0 - m < A.y1) {
          rects[a] = { x0: Math.min(A.x0, B.x0), y0: Math.min(A.y0, B.y0), x1: Math.max(A.x1, B.x1), y1: Math.max(A.y1, B.y1) };
          members[a] = members[a].concat(members[b]);
          rects.splice(b, 1); members.splice(b, 1);
          changed = true;
          break;
        }
      }
    }
  }
  return rects.map((r, k) => {
    const x0 = Math.max(0, Math.floor(r.x0) - 1), y0 = Math.max(0, Math.floor(r.y0) - 1);
    const x1 = Math.min(size, Math.ceil(r.x1) + 1), y1 = Math.min(size, Math.ceil(r.y1) + 1);
    return { x0, y0, w: Math.max(1, x1 - x0), h: Math.max(1, y1 - y0), members: members[k] };
  });
};

// Packs the islands, scaled by `scale`, into as small a texture as shelves
// allow: returns its size and where each island goes (or null if packing
// would not save at least a quarter of the texels).
const pack = (islands, size, scale) => {
  const boxes = islands.map((r, k) => ({ k, w: Math.max(2, Math.round(r.w * scale)) + 2 * PAD, h: Math.max(2, Math.round(r.h * scale)) + 2 * PAD }));
  const area = boxes.reduce((s, b) => s + b.w * b.h, 0);
  let width = Math.max(Math.max(...boxes.map((b) => b.w)), Math.ceil(Math.sqrt(area * 1.15)));
  boxes.sort((a, b) => b.h - a.h);
  const place = (wd) => {
    let x = 0, y = 0, shelf = 0;
    const at = [];
    for (const b of boxes) {
      if (x + b.w > wd) { x = 0; y += shelf; shelf = 0; }
      at[b.k] = { x, y, w: b.w, h: b.h };
      x += b.w; shelf = Math.max(shelf, b.h);
    }
    return { at, width: wd, height: y + shelf };
  };
  let best = place(width);
  // Prefer a squarer texture.
  for (let tries = 0; tries < 8 && best.height > best.width * 1.3; tries++) best = place((width = Math.ceil(width * 1.12)));
  const whole = Math.round(size * scale) ** 2;
  if (best.width * best.height > 0.75 * whole || best.width > MAX_SIZE || best.height > MAX_SIZE) return null;
  return best;
};

doc.createExtension(EXTTextureWebP).setRequired(true);
const layouts = new Map(); // material -> { islands, packed, scale, size } | { scale, size }
let gpuBytes = 0;
for (const job of jobs) {
  const { texture, material } = job;
  const [size] = texture.getSize();
  const d = density.get(material);
  // Texels a millimetre now, and wanted (colour and normal maps; the
  // roughness/metal map gets half as many each way).
  const now = d && d.area ? (size * Math.sqrt(d.uv / d.area)) / 1000 : 0;
  const want = Math.min(TEXELS_A_MM[1], Math.max(TEXELS_A_MM[0], PX_ACROSS / (1000 * (d ? d.largest : 0.05))));
  if (!layouts.has(material)) {
    const scale = Math.min(1, now ? want / now : 0.25, MAX_SIZE / size);
    const islands = islandsOf(material, size);
    const packed = islands && pack(islands, size, scale);
    layouts.set(material, packed ? { islands, packed, scale, size } : { scale, size });
  }
  const layout = layouts.get(material);
  if (layout.size !== size) throw new Error(`a material's textures differ in size (${texture.getURI()})`);
  // A see-through material's colour keeps its alpha (a red dot's reticle).
  const alpha = job.kind === 'colour' && material.getAlphaMode() !== 'OPAQUE';
  const src = (alpha ? sharp(Buffer.from(texture.getImage())).ensureAlpha() : sharp(Buffer.from(texture.getImage())).removeAlpha()).toColourspace('srgb');
  let img, w, h;
  const half = job.half ? 0.5 : 1;
  if (layout.packed) {
    // Each island cut out with its margin, scaled, and placed; half size for
    // the roughness/metal map (the same layout, scaled).
    const raw = await src.raw().toBuffer({ resolveWithObject: true });
    const full = sharp(raw.data, { raw: raw.info });
    const { packed, islands } = layout;
    w = packed.width; h = packed.height;
    const pieces = [];
    for (let k = 0; k < islands.length; k++) {
      const r = islands[k], at = packed.at[k];
      const inner = { w: at.w - 2 * PAD, h: at.h - 2 * PAD };
      const padSrc = { x: (PAD * r.w) / inner.w, y: (PAD * r.h) / inner.h };
      const left = Math.max(0, Math.round(r.x0 - padSrc.x)), top = Math.max(0, Math.round(r.y0 - padSrc.y));
      const right = Math.min(size, Math.round(r.x0 + r.w + padSrc.x)), bottom = Math.min(size, Math.round(r.y0 + r.h + padSrc.y));
      // Where the cut-out lands so that the island itself fills the inner box.
      const sx = inner.w / r.w, sy = inner.h / r.h;
      const dx = Math.round(at.x + PAD - (r.x0 - left) * sx), dy = Math.round(at.y + PAD - (r.y0 - top) * sy);
      const cw = Math.max(1, Math.round((right - left) * sx)), ch = Math.max(1, Math.round((bottom - top) * sy));
      const piece = await full.clone().extract({ left, top, width: right - left, height: bottom - top }).resize(cw, ch, { kernel: 'lanczos3', fit: 'fill' }).png().toBuffer();
      pieces.push({ input: piece, left: Math.max(0, dx), top: Math.max(0, dy) });
    }
    img = sharp({ create: { width: w, height: h, channels: alpha ? 4 : 3, background: { r: 0, g: 0, b: 0, ...(alpha ? { alpha: 0 } : {}) } } }).composite(pieces);
    if (half < 1) {
      const flatImg = await img.png().toBuffer();
      w = Math.max(16, Math.round(w * half)); h = Math.max(16, Math.round(h * half));
      img = sharp(flatImg).resize(w, h, { kernel: 'lanczos3', fit: 'fill' });
    }
  } else {
    w = h = Math.max(64, Math.round(size * layout.scale * half));
    img = src.resize(w, h, { kernel: 'lanczos3', fit: 'fill' });
  }
  const webp = job.kind === 'colour'
    ? await img.webp({ quality: 92, smartSubsample: true, effort: 6 }).toBuffer()
    : await img.webp({ nearLossless: true, quality: 80, effort: 6 }).toBuffer();
  const base = (texture.getURI() || texture.getName() || 'texture').replace(/^.*\//, '').replace(/\.\w+$/, '');
  texture.setImage(new Uint8Array(webp)).setMimeType('image/webp').setURI(base + '.webp');
  gpuBytes += w * h * 4 * 1.33;
  console.log(`texture ${base}: ${w}x${h}${layout.packed ? ` (${layout.islands.length} islands repacked)` : ''}, ${(now * layout.scale * half).toFixed(1)} texels/mm, ${(webp.length / 1024).toFixed(0)} KB`);
}
// Texture coordinates follow the islands to their new places.
for (const layout of layouts.values()) {
  if (!layout.packed) continue;
  const { islands, packed, size } = layout;
  const done = new Map(); // prim -> its new coordinates
  islands.forEach((r, k) => {
    const at = packed.at[k];
    const sx = (at.w - 2 * PAD) / r.w, sy = (at.h - 2 * PAD) / r.h;
    for (const { prim, vertices } of r.members) {
      if (!done.has(prim)) done.set(prim, prim.getAttribute('TEXCOORD_0').clone());
      const uv = done.get(prim);
      for (const v of vertices) {
        const [u, t] = uv.getElement(v, []);
        uv.setElement(v, [(at.x + PAD + (u * size - r.x0) * sx) / packed.width, (at.y + PAD + (t * size - r.y0) * sy) / packed.height]);
      }
    }
  });
  for (const [prim, uv] of done) prim.setAttribute('TEXCOORD_0', uv);
}
console.log(`${flattened} flat textures became plain values; ${jobs.length} textures kept, about ${(gpuBytes / 2 ** 20).toFixed(0)} MB of graphics memory with mipmaps`);

// --- Credit, tidy, compress ---
const asset = root.getAsset();
asset.generator = 'Project Fish tools/breakdown/build_breakdown.mjs';
asset.copyright = config.copyright;
asset.extras = { ...config.extras };
await doc.transform(prune({ keepLeaves: false }), dedup(), meshopt({ encoder: MeshoptEncoder, level: 'high' }));
fs.mkdirSync(path.dirname(out), { recursive: true });
await io.write(out, doc);

let triangles = 0;
for (const mesh of root.listMeshes()) for (const prim of mesh.listPrimitives()) triangles += (prim.getIndices() ? prim.getIndices().getCount() : prim.getAttribute('POSITION').getCount()) / 3;
console.log(`${out}: ${parts.length} parts, ${triangles} triangles, ${(fs.statSync(out).size / 2 ** 20).toFixed(1)} MB`);
if (process.env.PARTS_JSON) {
  const list = Object.fromEntries(parts.map((p) => [p.name, { mid: p.mid.map((v) => +v.toFixed(4)), size: p.size.map((v) => +v.toFixed(4)) }]));
  fs.writeFileSync(process.env.PARTS_JSON, JSON.stringify(list, null, 1));
}
