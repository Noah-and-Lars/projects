// Lists a downloaded model's node tree (with triangle counts and bounds), materials and textures.
//   node inspect.mjs <model.gltf|.glb> [maxDepth]
import { NodeIO, getBounds } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
const [file, depth = '6'] = process.argv.slice(2);
const doc = await new NodeIO().registerExtensions(ALL_EXTENSIONS).read(file);
const root = doc.getRoot(), scene = root.getDefaultScene() || root.listScenes()[0];
const tri = m => m ? m.listPrimitives().reduce((a, p) => a + ((p.getIndices() ? p.getIndices().getCount() : p.getAttribute('POSITION').getCount()) / 3), 0) : 0;
const sub = n => { let t = tri(n.getMesh()); for (const c of n.listChildren()) t += sub(c); return t; };
const f = v => v.map(x => x.toFixed(2)).join(',');
let lines = 0;
function walk(n, d) {
  if (d > +depth || lines > 400) return;
  const b = getBounds(n), mats = n.getMesh() ? [...new Set(n.getMesh().listPrimitives().map(p => p.getMaterial() && p.getMaterial().getName()))].join('|') : '';
  console.log('  '.repeat(d) + (n.getName() || '·') + `  ${Math.round(sub(n))}t  [${f(b.min)} .. ${f(b.max)}]` + (mats ? '  mat:' + mats : ''));
  lines++;
  for (const c of n.listChildren()) walk(c, d + 1);
}
const b = getBounds(scene);
console.log('scene bounds', f(b.min), '..', f(b.max), 'size', f(b.max.map((v, i) => v - b.min[i])));
for (const c of scene.listChildren()) walk(c, 0);
console.log('materials:', root.listMaterials().map(m => m.getName()).join(' | '));
console.log('textures:', root.listTextures().length, 'extensions:', root.listExtensionsUsed().map(e => e.extensionName).join(' '));
