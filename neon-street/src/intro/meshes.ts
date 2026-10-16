// Meshes for the wake-up sequence: two suited arms with gloves and the
// helmet. Object spaces: arms point along +z (forearm to fingertips) with
// the palm facing -y; the helmet is centred on the head, +z forward.

import { Face, MatFlag, MatKind, SceneBuilder, type SceneData } from '../world/geometry';

export function buildArmMesh(side: -1 | 1): SceneData {
  const b = new SceneBuilder();
  const mSuit = b.material({ base: [0.07, 0.075, 0.085], roughness: 0.55 });
  const mSuitPlate = b.material({ base: [0.14, 0.15, 0.17], metallic: 0.5, roughness: 0.35 });
  const mStripe = b.material({ emission: [2.2, 0.9, 0.15], kind: MatKind.Emitter });
  const mGlove = b.material({ base: [0.05, 0.05, 0.055], roughness: 0.6 });
  const mKnuckle = b.material({ base: [0.2, 0.2, 0.22], metallic: 0.7, roughness: 0.3 });
  const mLed = b.material({ emission: [0.3, 2.5, 3.0], kind: MatKind.Emitter, flags: MatFlag.Blink, aux: [side, 1, 0, 0] });

  // Forearm sleeve (z from -0.32 at the elbow to 0 at the wrist).
  b.box([-0.05, -0.045, -0.32], [0.05, 0.045, 0.0], mSuit);
  b.box([-0.055, 0.02, -0.3], [0.055, 0.055, -0.08], mSuitPlate);
  b.box([-0.056, 0.03, -0.26], [0.056, 0.045, -0.24], mStripe, Face.All & ~Face.NY);
  b.box([-0.056, 0.03, -0.2], [0.056, 0.045, -0.18], mStripe, Face.All & ~Face.NY);
  b.box([side * 0.045, -0.01, -0.15], [side * 0.058, 0.01, -0.12], mLed);
  // Wrist cuff.
  b.box([-0.056, -0.05, -0.02], [0.056, 0.05, 0.02], mSuitPlate);
  // Palm and back-of-hand plate.
  b.box([-0.045, -0.03, 0.02], [0.045, 0.02, 0.12], mGlove);
  b.box([-0.04, 0.02, 0.03], [0.04, 0.03, 0.1], mKnuckle);
  // Four fingers with two segments each.
  for (let i = 0; i < 4; i++) {
    const x = -0.034 + i * 0.0227;
    b.box([x - 0.0095, -0.025, 0.12], [x + 0.0095, 0.005, 0.17], mGlove);
    b.box([x - 0.009, -0.03, 0.17], [x + 0.009, 0.0, 0.215], mGlove);
    b.box([x - 0.008, 0.005, 0.125], [x + 0.008, 0.012, 0.16], mKnuckle);
  }
  // Thumb on the inner side.
  const tx = side > 0 ? -0.045 : 0.045;
  b.box([Math.min(tx, tx - side * 0.03), -0.02, 0.03], [Math.max(tx, tx - side * 0.03), 0.0, 0.08], mGlove);
  b.box([Math.min(tx - side * 0.03, tx - side * 0.05), -0.02, 0.06], [Math.max(tx - side * 0.03, tx - side * 0.05), 0.0, 0.11], mGlove);
  return finishNoLights(b);
}

export function buildHelmetMesh(): SceneData {
  const b = new SceneBuilder();
  const mShell = b.material({ base: [0.1, 0.105, 0.12], metallic: 0.4, roughness: 0.3 });
  const mShellLight = b.material({ base: [0.6, 0.32, 0.06], metallic: 0.2, roughness: 0.4 });
  const mVisor = b.material({ base: [0, 0, 0], roughness: 0.03 });
  const mSeal = b.material({ base: [0.03, 0.03, 0.035], roughness: 0.7 });
  // HUD glow inside the visor; pattern 5 follows the intro's HUD intensity.
  const mHud = b.material({ emission: [0.4, 2.4, 3.0], kind: MatKind.Emitter, flags: MatFlag.Blink, aux: [0, 5, 0, 0] });

  // Angular shell: top, back, sides, chin bar; open at the face.
  b.box([-0.13, 0.08, -0.14], [0.13, 0.15, 0.1], mShell);              // crown
  b.box([-0.13, -0.12, -0.15], [0.13, 0.08, -0.08], mShell);           // back
  b.box([-0.13, -0.12, -0.08], [-0.1, 0.08, 0.1], mShell);             // left side
  b.box([0.1, -0.12, -0.08], [0.13, 0.08, 0.1], mShell);               // right side
  b.box([-0.1, -0.13, -0.08], [0.1, -0.09, 0.1], mShell);              // chin bar
  b.box([-0.12, 0.1, -0.1], [0.12, 0.16, 0.0], mShellLight);           // accent ridge
  b.box([-0.14, -0.14, -0.16], [0.14, -0.1, -0.08], mSeal);            // neck seal
  // Visor: a slanted look from two glass quads.
  b.quad([-0.1, -0.09, 0.1], [0.1, -0.09, 0.1], [0.1, 0.08, 0.12], [-0.1, 0.08, 0.12], mVisor);
  // HUD strip just behind the visor.
  b.box([-0.08, 0.05, 0.085], [0.08, 0.06, 0.095], mHud, Face.All);
  b.box([-0.08, -0.07, 0.085], [-0.06, 0.04, 0.095], mHud, Face.All);
  // Ear pods and a small antenna.
  for (const x of [-0.145, 0.13]) b.box([x, -0.04, -0.06], [x + 0.015, 0.02, 0.0], mShellLight);
  b.box([0.09, 0.15, -0.1], [0.1, 0.24, -0.09], mSeal);
  return finishNoLights(b);
}

function finishNoLights(b: SceneBuilder): SceneData {
  const scene = b.finish();
  scene.lightCount = 0;
  scene.lightTris = new Uint32Array(0);
  scene.lightCdf = new Float32Array(0);
  return scene;
}
