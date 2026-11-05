// Finishes the converted PF-9 (tools/blender/convert_pistol9.py) for the game:
//
//     node tools/finish_pistol9.mjs build/pistol9-raw.glb assets/pistol.glb
//
// - Textures get the game's names (not the download's).
// - Only the lenses and the red dot's reticle are see-through: the download
//   made whole materials (the red dot's body, the lights) see-through, which
//   draws them without depth and sorts badly. Everything else is opaque.
// - Textures are stored as WebP.
// - The meshes are compressed (meshopt).

import fs from 'node:fs';
import path from 'node:path';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, meshopt, prune, textureCompress } from '@gltf-transform/functions';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';
import sharp from 'sharp';

const [source, out] = process.argv.slice(2);
if (!source || !out) {
  console.error('usage: node tools/finish_pistol9.mjs RAW.glb OUT.glb');
  process.exit(1);
}

await MeshoptEncoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
  'meshopt.decoder': MeshoptDecoder,
  'meshopt.encoder': MeshoptEncoder,
});
const doc = await io.read(source);
const root = doc.getRoot();

// The game's names for the textures (the download's material names first).
const NAMES = {
  CustomPistol9mm: 'pistol9', Magazine9mm: 'pistol9_magazine', Bullet9x19: 'pistol9_round',
  material: 'reddot', SPOT: 'reddot_reticle', Fleshlight1: 'light_long', Fleshlight2: 'light_compact',
  LaserBlock: 'laser', PicatinyBracing1: 'clamp', PicatinyBracing2: 'cover',
  Supressor1: 'can_long', Supressor2: 'can_short', Supressor3: 'can_box',
};
for (const texture of root.listTextures()) {
  const name = texture.getName() || '';
  const stem = Object.keys(NAMES).find((k) => name.startsWith(k + '_'));
  if (stem) {
    texture.setName(NAMES[stem] + name.slice(stem.length));
    texture.setURI('');
  }
}

const SEE_THROUGH = /(_glass|^reddot_reticle)$/;
for (const material of root.listMaterials()) {
  const name = material.getName();
  if (SEE_THROUGH.test(name)) {
    material.setAlphaMode('BLEND');
  } else {
    material.setAlphaMode('OPAQUE');
  }
}

await doc.transform(
  textureCompress({ encoder: sharp, targetFormat: 'webp', quality: 88 }),
  prune(),
  dedup(),
  meshopt({ encoder: MeshoptEncoder, level: 'high' }),
);
fs.mkdirSync(path.dirname(out), { recursive: true });
await io.write(out, doc);
const triangles = root.listMeshes().reduce((n, m) => n + m.listPrimitives().reduce((k, p) => k + (p.getIndices() ? p.getIndices().getCount() : p.getAttribute('POSITION').getCount()) / 3, 0), 0);
console.log(`wrote ${out}: ${(fs.statSync(out).size / 1e6).toFixed(1)} MB, ${root.listMaterials().length} materials, ${root.listTextures().length} textures, ${root.listMeshes().length} meshes, ${Math.round(triangles)} triangles`);
for (const material of root.listMaterials()) console.log(' ', material.getName(), material.getAlphaMode(), material.getDoubleSided() ? 'double-sided' : '');
