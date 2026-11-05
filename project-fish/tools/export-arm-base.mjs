// Exports the posed hands and the pistol from the game's code, as the
// starting point for the detailed Blender models (tools/blender/build_arms.py).
//
//   cd project-fish && npm install && node tools/export-arm-base.mjs <out-dir>
//
// Writes, in gun space (metres, Y up, muzzle towards -Z):
//   right_glove.obj, left_glove.obj, pistol.obj
//   rig.json: finger joints, wrists, elbows and hand directions.
//   pistol.json: the pistol's side profiles and thicknesses.
//   pistol45.json: the same for the second pistol (pistol45.js).

import fs from 'node:fs';
import path from 'node:path';
import * as THREE from 'three';
import { OBJExporter } from 'three/addons/exporters/OBJExporter.js';

// pistol.js draws its textures on a canvas; give it a stand-in, since only
// its shapes are needed here.
const fakeContext = new Proxy({}, { get: () => () => fakeContext });
globalThis.document = { createElement: () => ({ getContext: () => fakeContext }) };

const { buildArmParts } = await import('../src/viewmodel/arms.js');
const { createPistol, GRIP, PROFILES } = await import('../src/viewmodel/pistol.js');
const pistol45 = await import('../src/viewmodel/pistol45.js');

const out = process.argv[2] || 'arm-base';
fs.mkdirSync(out, { recursive: true });

const exporter = new OBJExporter();
const write = (name, object) => fs.writeFileSync(path.join(out, name), exporter.parse(object));
const mesh = (geometry) => {
  const g = geometry.clone();
  g.deleteAttribute('color');
  return new THREE.Mesh(g);
};
const v = (vec) => vec.toArray().map((n) => +n.toFixed(6));

const rig = { grip: { top: v(GRIP.top), down: v(GRIP.down), front: v(GRIP.front), halfWidth: GRIP.halfWidth, halfDepth: GRIP.halfDepth } };
for (const part of buildArmParts({ plain: true })) {
  write(`${part.side}_glove.obj`, mesh(part.glove));
  const chain = (f) => ({ joints: f.joints.map(v), radii: f.radii });
  rig[part.side] = {
    fingers: part.pose.fingers.map(chain),
    thumb: chain(part.pose.thumb),
    wrist: v(part.pose.wrist),
    elbow: v(part.pose.elbow),
    along: v(part.frame.along),
    across: v(part.frame.across),
    back: v(part.frame.back),
    forearm: v(part.frame.forearm),
    palmCenter: v(part.frame.palmCenter),
  };
}

const pistol = createPistol();
pistol.updateMatrixWorld(true);
write('pistol.obj', pistol);
fs.writeFileSync(path.join(out, 'rig.json'), JSON.stringify(rig, null, 1));
fs.writeFileSync(path.join(out, 'pistol.json'), JSON.stringify(PROFILES, null, 1));
fs.writeFileSync(path.join(out, 'pistol45.json'), JSON.stringify({
  ...pistol45.PROFILES,
  slideInfo: { ...pistol45.SLIDE },
  sights: pistol45.SIGHTS,
  hammerPivot: [0, -pistol45.HAMMER.pivot.z, pistol45.HAMMER.pivot.y],
  slideStopPivot: [0, -pistol45.SLIDE_STOP.pivot.z, pistol45.SLIDE_STOP.pivot.y],
}, null, 1));
console.log('Wrote', fs.readdirSync(out).join(', '), 'to', out);
