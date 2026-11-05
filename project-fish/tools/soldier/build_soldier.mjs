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

// Smaller textures: colour and normal maps at SIZE, the rest at half.
await doc.transform(
  textureCompress({ encoder: sharp, targetFormat: 'webp', quality: 88, slots: /^(baseColorTexture|normalTexture)$/, resize: [SIZE, SIZE] }),
  textureCompress({ encoder: sharp, targetFormat: 'webp', quality: 88, slots: /^(metallicRoughnessTexture|occlusionTexture)$/, resize: [SIZE / 2, SIZE / 2] }),
  prune(),
  dedup(),
  meshopt({ encoder: MeshoptEncoder, level: 'high' }),
);
fs.mkdirSync(path.dirname(out), { recursive: true });
await io.write(out, doc);
const triangles = root.listMeshes().reduce((n, m) => n + m.listPrimitives().reduce((k, p) => k + (p.getIndices() ? p.getIndices().getCount() : p.getAttribute('POSITION').getCount()) / 3, 0), 0);
console.log(`wrote ${out}: ${(fs.statSync(out).size / 1e6).toFixed(1)} MB, ${root.listTextures().length} textures, ${Math.round(triangles)} triangles, ${root.listAnimations().length} animation(s)`);
