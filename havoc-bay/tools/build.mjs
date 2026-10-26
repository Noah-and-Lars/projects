// Builds ../models/<id>.glb (and <id>-lo.glb) from the Sketchfab downloads in skfb-dl/, plus ../models/models.json
// (what the game reads: files, game settings, credits).   node build.mjs [id ...]   (no ids = all)
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { NodeIO, getBounds } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, flatten, join, weld, simplify, prune, textureCompress, quantize, metalRough, unpartition, resample } from '@gltf-transform/functions';
import { MeshoptSimplifier } from 'meshoptimizer';
import sharp from 'sharp';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = process.env.HB_OUT || path.join(HERE, '..', 'models');   // HB_OUT / HB_CFG: for test builds
const CFG = JSON.parse(fs.readFileSync(process.env.HB_CFG || path.join(HERE, 'models.json'), 'utf8'));
await MeshoptSimplifier.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);

const tris = doc => { let n = 0; for (const m of doc.getRoot().listMeshes()) for (const p of m.listPrimitives()) { const i = p.getIndices(), a = p.getAttribute('POSITION'); n += (i ? i.getCount() : a ? a.getCount() : 0) / 3; } return Math.round(n); };
const named = (o, re) => re && re.test(o.getName() || '');
// a node matches by its own, its mesh's or one of its materials' names
const nodeMatch = (n, re) => named(n, re) || (n.getMesh() && (named(n.getMesh(), re) || n.getMesh().listPrimitives().some(p => p.getMaterial() && named(p.getMaterial(), re))));

// rotation [x, y, z] in degrees as a quaternion (applied x, then y, then z)
function quat([x, y, z]) {
  const r = d => d * Math.PI / 180, q = (ax, a) => { const s = Math.sin(r(a) / 2); return [ax[0] * s, ax[1] * s, ax[2] * s, Math.cos(r(a) / 2)]; };
  const mul = (a, b) => [a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1], a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0], a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3], a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2]];
  return mul(q([0, 0, 1], z), mul(q([0, 1, 0], y), q([1, 0, 0], x)));
}

// leave out triangles whose middle lies outside box [[x, y, z], [x, y, z]] (download coordinates, world space)
function cropTo(root, [lo, hi]) {
  for (const n of root.listNodes()) {
    const m = n.getMesh(); if (!m) continue;
    const w = n.getWorldMatrix();
    for (const p of m.listPrimitives()) {
      const pos = p.getAttribute('POSITION'), idx = p.getIndices(); if (!pos || !idx) continue;
      const keep = [], v = [0, 0, 0], c = [0, 0, 0];
      for (let i = 0; i < idx.getCount(); i += 3) {
        c[0] = c[1] = c[2] = 0;
        for (let k = 0; k < 3; k++) { pos.getElement(idx.getScalar(i + k), v); for (let j = 0; j < 3; j++) c[j] += (w[j] * v[0] + w[4 + j] * v[1] + w[8 + j] * v[2] + w[12 + j]) / 3; }
        if (c.every((x, j) => x >= lo[j] && x <= hi[j])) keep.push(idx.getScalar(i), idx.getScalar(i + 1), idx.getScalar(i + 2));
      }
      if (!keep.length) { m.removePrimitive(p); continue; }
      idx.setArray(pos.getCount() > 65535 ? new Uint32Array(keep) : new Uint16Array(keep));
    }
  }
}
function cutBox(root, lo, hi, keepInside = false) {
  for (const n of root.listNodes()) {
    const m = n.getMesh(); if (!m) continue;
    const w = n.getWorldMatrix();
    for (const p of m.listPrimitives()) {
      const pos = p.getAttribute('POSITION'), idx = p.getIndices(); if (!pos || !idx) continue;
      const keep = [], v = [0, 0, 0], c = [0, 0, 0];
      for (let i = 0; i < idx.getCount(); i += 3) {
        c[0] = c[1] = c[2] = 0;
        for (let k = 0; k < 3; k++) { pos.getElement(idx.getScalar(i + k), v); for (let j = 0; j < 3; j++) c[j] += (w[j] * v[0] + w[4 + j] * v[1] + w[8 + j] * v[2] + w[12 + j]) / 3; }
        if (c.every((x, j) => x >= lo[j] && x <= hi[j]) === keepInside) keep.push(idx.getScalar(i), idx.getScalar(i + 1), idx.getScalar(i + 2));
      }
      if (!keep.length) { m.removePrimitive(p); continue; }
      idx.setArray(pos.getCount() > 65535 ? new Uint32Array(keep) : new Uint16Array(keep));
    }
  }
}
// move the triangles inside a box (game units) to new nodes named <name>, beside the nodes they came from
function splitBox(doc, scene, lo, hi, name) {
  const made = [], buf = doc.getRoot().listBuffers()[0];
  for (const n of doc.getRoot().listNodes()) {
    const m = n.getMesh(); if (!m) continue;
    const w = n.getWorldMatrix(); let mesh = null;
    for (const p of m.listPrimitives()) {
      const pos = p.getAttribute('POSITION'), idx = p.getIndices(); if (!pos || !idx) continue;
      const inside = [], rest = [], v = [0, 0, 0], c = [0, 0, 0];
      for (let i = 0; i < idx.getCount(); i += 3) {
        c[0] = c[1] = c[2] = 0;
        for (let k = 0; k < 3; k++) { pos.getElement(idx.getScalar(i + k), v); for (let j = 0; j < 3; j++) c[j] += (w[j] * v[0] + w[4 + j] * v[1] + w[8 + j] * v[2] + w[12 + j]) / 3; }
        (c.every((x, j) => x >= lo[j] && x <= hi[j]) ? inside : rest).push(idx.getScalar(i), idx.getScalar(i + 1), idx.getScalar(i + 2));
      }
      if (!inside.length) continue;
      const A = a => pos.getCount() > 65535 ? new Uint32Array(a) : new Uint16Array(a);
      const np = doc.createPrimitive().setMaterial(p.getMaterial()).setMode(p.getMode())
        .setIndices(doc.createAccessor().setType('SCALAR').setArray(A(inside)).setBuffer(buf));
      for (const sem of p.listSemantics()) np.setAttribute(sem, p.getAttribute(sem));
      if (!mesh) mesh = doc.createMesh();
      mesh.addPrimitive(np);
      if (rest.length) idx.setArray(A(rest)); else m.removePrimitive(p);
    }
    if (!mesh) continue;
    const nn = doc.createNode(name).setMesh(mesh).setTranslation(n.getTranslation()).setRotation(n.getRotation()).setScale(n.getScale());
    (n.getParentNode() || scene).addChild(nn); made.push(nn);
  }
  return made;
}
const worldPoint = (n, q = [0, 0, 0]) => { const w = n.getWorldMatrix(); return [0, 1, 2].map(j => w[j] * q[0] + w[4 + j] * q[1] + w[8 + j] * q[2] + w[12 + j]); };
const r3 = v => v.map(x => Math.round(x * 1000) / 1000);

// far versions: simplify on vertices merged by position alone, so texture seams and split normals can't stop it,
// then point the kept triangles back at one original vertex each (slight texture smearing, fine far away)
function sloppy(doc, ratio) {
  for (const m of doc.getRoot().listMeshes()) for (const p of m.listPrimitives()) {
    const pos = p.getAttribute('POSITION'), idx = p.getIndices(); if (!pos || !idx || p.getMode() !== 4) continue;
    const I = idx.getArray(), want = Math.max(3, Math.floor(I.length * ratio / 3) * 3);
    if (want >= I.length) continue;
    const n = pos.getCount(), v = [0, 0, 0], key = new Map(), rep = new Uint32Array(n), first = [];
    for (let i = 0; i < n; i++) {
      pos.getElement(i, v); const k = v.map(x => Math.round(x * 2e4)).join(',');
      let r = key.get(k); if (r === undefined) { r = first.length; key.set(k, r); first.push(i); }
      rep[i] = r;
    }
    const Pw = new Float32Array(first.length * 3);
    first.forEach((o, j) => { pos.getElement(o, v); Pw[j * 3] = v[0]; Pw[j * 3 + 1] = v[1]; Pw[j * 3 + 2] = v[2]; });
    const Iw = Uint32Array.from(I, i => rep[i]);
    const [out] = MeshoptSimplifier.simplify(Iw, Pw, 3, want, 1);
    if (out.length < 3) { m.removePrimitive(p); continue; }
    const back = Uint32Array.from(out, j => first[j]);
    idx.setArray(n > 65535 ? back : new Uint16Array(back));
  }
}

async function build(id, C0, lo) {
  // loFrom: the far version comes from another model (or other settings), e.g. a lighter sister ship
  const C = lo && C0.loFrom ? Object.assign({}, C0, C0.loFrom) : C0;
  const meta = JSON.parse(fs.readFileSync(path.join(HERE, 'skfb-dl', C.uid, '_meta.json'), 'utf8'));
  const doc = await io.read(meta.file);
  const root = doc.getRoot(), scene = root.getDefaultScene() || root.listScenes()[0];
  const re = r => r ? new RegExp(r, 'i') : null;
  const drop = re(C.drop), found = {};
  const before = tris(doc);
  // leave out unwanted parts (stands, ground planes, pilots...) by node, mesh or material name
  if (drop) for (const n of root.listNodes()) {
    const m = n.getMesh();
    if (named(n, drop) || (m && named(m, drop))) { n.setMesh(null); continue; }
    if (m) for (const p of m.listPrimitives()) if (p.getMaterial() && named(p.getMaterial(), drop)) m.removePrimitive(p);
  }
  if (C.crop) cropTo(root, C.crop);
  // orient and size: wrap the scene in one node
  const wrap = doc.createNode('model');
  for (const c of scene.listChildren()) { scene.removeChild(c); wrap.addChild(c); }
  scene.addChild(wrap);
  wrap.setRotation(quat(C.rot));
  let b = getBounds(scene);
  const ax = { x: 0, y: 1, z: 2 }[C.size[0]], s = C.size[1] / (b.max[ax] - b.min[ax]);
  wrap.setScale([s, s, s]);
  b = getBounds(scene);
  // x and z centred; y centred, standing on y = 0 (align 'bottom') or left where the model has it (align 'keep':
  // a ship modelled with its waterline at 0); then moved by origin (game units)
  const off = C.origin || [0, 0, 0], y0 = C.align === 'bottom' ? b.min[1] : C.align === 'keep' ? 0 : (b.min[1] + b.max[1]) / 2;
  const t = wrap.getTranslation();
  wrap.setTranslation([t[0] - (b.min[0] + b.max[0]) / 2 + off[0], t[1] - y0 + off[1], t[2] - (b.min[2] + b.max[2]) / 2 + off[2]]);
  // cut: leave out triangles inside boxes given in game units (after orienting and sizing), e.g. a ship's own
  // guns where the game puts its turning ones
  if (C.cut) for (const [lo3, hi3] of C.cut) cutBox(root, lo3, hi3);
  // keepBox: only what is inside (game units), e.g. one turret taken out of a whole ship
  if (C.keepBox) cutBox(root, C.keepBox[0], C.keepBox[1], true);
  // parts the game moves keep their own nodes: SPIN (propellers, spun about z) and PITCH (a gun's elevating part).
  // The top-most matching node owns the part; every node in it is named <TAG>_<n> (join leaves named nodes alone
  // and the game regroups them by name); every other name goes so join() can merge freely.
  const keepRe = lo ? [] : [['SPIN', C.spin], ['PITCH', C.pitch]].filter(k => k[1]).map(([t, r]) => [t, re(r)]);
  const tagName = new Map();
  // pitchBox: the triangles inside (game units) become the gun's elevating part, when it has no part of its own
  if (C.pitchBox && !lo) for (const n of splitBox(doc, scene, C.pitchBox[0], C.pitchBox[1], 'PITCH_0')) tagName.set(n, 'PITCH_0');
  for (const [tag, rx] of keepRe) {
    let k = 0;
    for (const n of root.listNodes()) {
      if (tagName.has(n) || !nodeMatch(n, rx)) continue;
      const nm = tag + '_' + (k++); n.traverse(c => tagName.set(c, nm));
      // a gun's pitch pivot: the elevating node's own origin, unless the config gives one
      if (tag === 'PITCH' && !found.pivot) found.pivot = r3(worldPoint(n));
    }
  }
  // muzzles: the front middle (largest z) of each node matching muzzle
  const mz = re(C.muzzle);
  if (mz && !lo) for (const n of root.listNodes()) if (n.getMesh() && nodeMatch(n, mz)) {
    const nb = getBounds(n); (found.muzzles = found.muzzles || []).push(r3([(nb.min[0] + nb.max[0]) / 2, (nb.min[1] + nb.max[1]) / 2, nb.max[2]]));
  }
  for (const n of root.listNodes()) n.setName(tagName.get(n) || '');
  for (const m of root.listMeshes()) m.setName('');
  await doc.transform(
    metalRough(), dedup(), flatten(), unpartition(),
    join({ keepNamed: true }), weld(),
  );
  const target = lo ? C.lo : C.tris;
  // simplify toward the target, letting the allowed error grow until it gets within 15%
  for (let err = lo ? 0.01 : 0.002; tris(doc) > target * 1.15 && err < 0.2; err *= 1.8)
    await doc.transform(simplify({ simplifier: MeshoptSimplifier, ratio: Math.min(1, target / tris(doc)), error: err, lockBorder: false }));
  // still far over (many small separate parts and texture seams stop the careful simplifier): cut every part by the
  // same share with meshoptimizer's sloppy simplifier, which ignores seams
  if (tris(doc) > target * (lo ? 1.3 : 2)) sloppy(doc, target / tris(doc));
  await doc.transform(
    resample(), prune({ keepLeaves: false }),
    textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [lo ? C.loTex : C.tex, lo ? C.loTex : C.tex], quality: 82 }),
    quantize(),   // KHR_mesh_quantization: three.js r128 reads it without a decoder
  );
  const file = id + (lo ? '-lo' : '') + '.glb';
  await io.write(path.join(OUT, file), doc);
  const kb = Math.round(fs.statSync(path.join(OUT, file)).size / 1024);
  b = getBounds(doc.getRoot().getDefaultScene() || doc.getRoot().listScenes()[0]);
  console.log(`${file}: ${before} -> ${tris(doc)} tris, ${kb} KB, ${doc.getRoot().listMeshes().reduce((a, m) => a + m.listPrimitives().length, 0)} draws, ` +
    `kept ${[...new Set(tagName.values())].join(' ') || 'none'}${found.pivot ? ' pivot ' + found.pivot : ''}${found.muzzles ? ' muzzles ' + JSON.stringify(found.muzzles) : ''}, bounds ${b.min.map(v => v.toFixed(2))} .. ${b.max.map(v => v.toFixed(2))}`);
  return { file, meta, found };
}

const ids = process.argv.slice(2).filter(a => !a.startsWith('-'));
const out = fs.existsSync(path.join(OUT, 'models.json')) ? JSON.parse(fs.readFileSync(path.join(OUT, 'models.json'), 'utf8')) : {};
for (const [id, C] of Object.entries(CFG)) {
  if (id.startsWith('_') || (ids.length && !ids.includes(id))) continue;
  const hi = await build(id, C, false);
  const lo = C.lo ? await build(id, C, true) : null;
  out[id] = Object.assign({ file: hi.file, lo: lo && lo.file }, hi.found, C.game, {
    credit: { what: C.what, title: hi.meta.name, author: hi.meta.user, url: hi.meta.url, licence: hi.meta.license },
  });
}
fs.writeFileSync(path.join(OUT, 'models.json'), JSON.stringify(out, null, 1) + '\n');
console.log('wrote models.json');
