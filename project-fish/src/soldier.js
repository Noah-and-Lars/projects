// The soldier model (assets/soldier.glb, see tools/soldier/build_soldier.mjs),
// loaded once for everyone who uses it: the soldier standing in the world
// (world.js), the player's own body (player/body.js) and the Outfit menu's
// preview (outfitPreview.js).
//
// The player's copy is made as soon as the file arrives, before the standing
// soldier's idle animation starts moving his bones, so it starts from the
// model's own rest pose.

import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { clone } from 'three/addons/utils/SkeletonUtils.js';

export const SOLDIER_MODEL = new URL('../assets/soldier.glb', import.meta.url);

let loading = null;

// Resolves to { gltf, player, arms, preview }: the loaded file, a copy of
// the model for the player's body, one more for the player's arms holding
// the gun (src/player/fpArms.js), and one for the Outfit menu's preview
// (src/outfitPreview.js). Each copy has its own bones; they share the
// geometry and textures. (Copies are made before anything is put on or
// taken off him, src/gear.js.)
export function loadSoldier() {
  if (!loading) {
    loading = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).loadAsync(SOLDIER_MODEL.href)
      .then((gltf) => ({ gltf, player: clone(gltf.scene), arms: clone(gltf.scene), preview: clone(gltf.scene) }));
  }
  return loading;
}

// A bone's name without the number the model's skeleton adds to each
// ('CC_Base_Spine02_035' -> 'CC_Base_Spine02').
export const boneName = (name) => name.replace(/_\d+$/, '');

// The model's bones by name (see boneName).
export function bonesOf(model) {
  const out = {};
  model.traverse((o) => {
    if (o.isBone) out[boneName(o.name)] = o;
  });
  return out;
}

// What a mesh is for in first person (the build tags them): 'arms', 'head'
// or undefined (the rest of him).
export function firstPersonTag(mesh) {
  for (let o = mesh; o; o = o.parent) if (o.userData && o.userData.firstPerson) return o.userData.firstPerson;
  return undefined;
}
