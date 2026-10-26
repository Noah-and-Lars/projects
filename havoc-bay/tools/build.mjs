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

// rotation [x, y, z] in degrees as a quaternion (applied x, then y, then z)
function quat([x, y, z]) {
  const r = d => d * Math.PI / 180, q = (ax, a) => { const s = Math.sin(r(a) / 2); return [ax[0] * s, ax[1] * s, ax[2] * s, Math.cos(r(a) / 2)]; };
  const mul = (a, b) => [a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1], a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0], a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3], a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2]];
  return mul(q([0, 0, 1], z), mul(q([0, 1, 0], y), q([1, 0, 0], x)));
}

async function build(id, C, lo) {
  const meta = JSON.parse(fs.readFileSync(path.join(HERE, 'skfb-dl', C.uid, '_meta.json'), 'utf8'));
  const doc = await io.read(meta.file);
  const root = doc.getRoot(), scene = root.getDefaultScene() || root.listScenes()[0];
  const drop = C.drop ? new RegExp(C.drop, 'i') : null;
  // parts the game moves keep their own nodes: SPIN (propellers, spun about z) and PITCH (a gun's elevating part)
  const keepRe = lo ? [] : [['SPIN', C.spin], ['PITCH', C.pitch]].filter(k => k[1]).map(([t, r]) => [t, new RegExp(r, 'i')]);
  const before = tris(doc);
  // leave out unwanted parts (stands, ground planes, pilots...) by node, mesh or material name
  if (drop) for (const n of root.listNodes()) {
    const m = n.getMesh();
    if (named(n, drop) || (m && named(m, drop))) { n.setMesh(null); continue; }
    if (m) for (const p of m.listPrimitives()) if (p.getMaterial() && named(p.getMaterial(), drop)) m.removePrimitive(p);
  }
  // the top-most matching node owns the part; every node in it is named <TAG>_<n> (join leaves named nodes alone
  // and the game regroups them by name); every other name goes so join() can merge freely
  const tagName = new Map(), spinNodes = [];
  for (const [tag, re] of keepRe) {
    let k = 0;
    for (const n of root.listNodes()) {
      if (tagName.has(n) || !(named(n, re) || (n.getMesh() && named(n.getMesh(), re)))) continue;
      const nm = tag + '_' + (k++); n.traverse(c => tagName.set(c, nm)); if (tag === 'SPIN') spinNodes.push(n);
    }
  }
  for (const n of root.listNodes()) n.setName(tagName.get(n) || '');
  for (const m of root.listMeshes()) m.setName('');
  // orient and size: wrap the scene in one node
  const wrap = doc.createNode('model');
  for (const c of scene.listChildren()) { scene.removeChild(c); wrap.addChild(c); }
  scene.addChild(wrap);
  wrap.setRotation(quat(C.rot));
  let b = getBounds(scene);
  const ax = { x: 0, y: 1, z: 2 }[C.size[0]], s = C.size[1] / (b.max[ax] - b.min[ax]);
  wrap.setScale([s, s, s]);
  b = getBounds(scene);
  // centred, or (align: 'bottom') standing on y = 0; then moved by origin (game units)
  const off = C.origin || [0, 0, 0], y0 = C.align === 'bottom' ? b.min[1] : (b.min[1] + b.max[1]) / 2;
  const t = wrap.getTranslation();
  wrap.setTranslation([t[0] - (b.min[0] + b.max[0]) / 2 + off[0], t[1] - y0 + off[1], t[2] - (b.min[2] + b.max[2]) / 2 + off[2]]);
  await doc.transform(
    metalRough(), dedup(), flatten(), unpartition(),
    join({ keepNamed: true }), weld(),
  );
  const target = lo ? C.lo : C.tris;
  // simplify toward the target, letting the allowed error grow until it gets within 15%
  for (let err = lo ? 0.01 : 0.002; tris(doc) > target * 1.15 && err < 0.2; err *= 1.8)
    await doc.transform(simplify({ simplifier: MeshoptSimplifier, ratio: Math.min(1, target / tris(doc)), error: err, lockBorder: false }));
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
    `kept ${[...new Set(tagName.values())].join(' ') || 'none'}, bounds ${b.min.map(v => v.toFixed(2))} .. ${b.max.map(v => v.toFixed(2))}`);
  return { file, meta };
}

const ids = process.argv.slice(2).filter(a => !a.startsWith('-'));
const out = fs.existsSync(path.join(OUT, 'models.json')) ? JSON.parse(fs.readFileSync(path.join(OUT, 'models.json'), 'utf8')) : {};
for (const [id, C] of Object.entries(CFG)) {
  if (id.startsWith('_') || (ids.length && !ids.includes(id))) continue;
  const hi = await build(id, C, false);
  const lo = C.lo ? await build(id, C, true) : null;
  out[id] = Object.assign({ file: hi.file, lo: lo && lo.file }, C.game, {
    credit: { what: C.what, title: hi.meta.name, author: hi.meta.user, url: hi.meta.url, licence: hi.meta.license },
  });
}
fs.writeFileSync(path.join(OUT, 'models.json'), JSON.stringify(out, null, 1) + '\n');
console.log('wrote models.json');
