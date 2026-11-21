// Makes the parking garage map (assets/map/garage.glb) from its download,
// "parking garage" by SPLEEN VISION (CC BY 4.0, see README.md, Credits): a
// photo scan of one floor of an underground car park, its light baked into
// two 8192 px colour textures (unlit materials).
//
// From the project-fish folder, with the download unzipped into
// build/upload-garage (scene.gltf, scene.bin and the two
// material*_baseColor.jpeg, flat or in textures/):
//
//     npm run build-map-garage
//
// It levels the scanned floor (it leans about 0.25° and sits 0.53 m below
// the scan's middle) so it lies at height 0, the game's ground, keeps the
// download's own scale (its ceiling is about 3 m above the floor), shrinks
// the textures to 4096 px WebP (two 8192 px ones would take about 700 MB of
// graphics memory; these about 180 MB), compresses the meshes (meshopt)
// and writes the credit into the file's asset.copyright.
//
// The floor plane was fitted to the scan's upward-facing triangles near the
// floor (y = 0.0043 x + 0.0034 z - 0.5313 in the download's own scene,
// spread 3 cm): see FLOOR. The walls, pillars and ceiling the player
// bumps into are in src/shared/map.js (GARAGE), traced from the same scan.

import fs from 'node:fs';
import path from 'node:path';
import * as THREE from 'three';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS, EXTTextureWebP } from '@gltf-transform/extensions';
import { meshopt, textureCompress, prune, dedup } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptDecoder } from 'meshoptimizer';
import sharp from 'sharp';

const [SRC, OUT] = process.argv.slice(2);
if (!SRC || !OUT) {
  console.error('usage: node tools/map/build_garage.mjs build/upload-garage assets/map/garage.glb');
  process.exit(1);
}

const FLOOR = { a: 0.0043, b: 0.0034, c: -0.5313 }; // y = a x + b z + c, in the scene (after the download's root matrix)
const TEXTURE_SIZE = 4096;
const COPYRIGHT = 'This work is based on "parking garage" (https://sketchfab.com/3d-models/parking-garage-98f7bc75350f4fb7ad36830f58fc99be) by SPLEEN VISION (https://sketchfab.com/spleen.vision) licensed under CC-BY-4.0 (http://creativecommons.org/licenses/by/4.0/). Changes: floor levelled and placed at height 0, textures shrunk to 4096 px and stored as WebP, meshes compressed.';

// The download's scene.gltf points at textures/...; it may have come with
// them beside it instead. Staged in a folder of its own either way.
const stageDir = path.resolve('build/garage-stage');
fs.rmSync(stageDir, { recursive: true, force: true });
fs.mkdirSync(path.join(stageDir, 'textures'), { recursive: true });
for (const name of ['scene.gltf', 'scene.bin']) fs.copyFileSync(path.join(SRC, name), path.join(stageDir, name));
for (const name of ['material_baseColor.jpeg', 'material_1_baseColor.jpeg']) {
  const flat = path.join(SRC, name);
  const nested = path.join(SRC, 'textures', name);
  fs.copyFileSync(fs.existsSync(flat) ? flat : nested, path.join(stageDir, 'textures', name));
}

await MeshoptEncoder.ready;
await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
  'meshopt.encoder': MeshoptEncoder,
  'meshopt.decoder': MeshoptDecoder,
});
const doc = await io.read(path.join(stageDir, 'scene.gltf'));
const root = doc.getRoot();

// Level the floor and put it at 0: turn the scene so the floor's up
// direction is straight up, then lower it by the floor's height.
const top = root.listScenes()[0].listChildren()[0];
const original = new THREE.Matrix4().fromArray(top.getMatrix());
const up = new THREE.Vector3(-FLOOR.a, 1, -FLOOR.b).normalize();
const level = new THREE.Matrix4().makeRotationFromQuaternion(new THREE.Quaternion().setFromUnitVectors(up, new THREE.Vector3(0, 1, 0)));
const onFloor = new THREE.Vector3(0, FLOOR.c, 0).applyMatrix4(level);
const lower = new THREE.Matrix4().makeTranslation(0, -onFloor.y, 0);
top.setMatrix(lower.multiply(level).multiply(original).toArray());
top.setName('garage');

doc.getRoot().getAsset().copyright = COPYRIGHT;
doc.getRoot().getAsset().generator = 'Project Fish tools/map/build_garage.mjs';

doc.createExtension(EXTTextureWebP).setRequired(true);
await doc.transform(
  dedup(),
  prune(),
  textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [TEXTURE_SIZE, TEXTURE_SIZE], quality: 90 }),
  meshopt({ encoder: MeshoptEncoder, level: 'high' }),
);

fs.mkdirSync(path.dirname(OUT), { recursive: true });
await io.write(OUT, doc);
console.log(`Wrote ${OUT} (${(fs.statSync(OUT).size / 1e6).toFixed(1)} MB)`);
