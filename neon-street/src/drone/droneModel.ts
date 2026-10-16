// The patrol drone: an H-frame quadcopter built from boxes and quads in its
// own object space (origin at the body centre, +z forward, +y up). It gets a
// small BVH of its own and is traced as a rigidly transformed second level.

import type { Vec3 } from '../core/math';
import { Face, MatFlag, MatKind, SceneBuilder, type SceneData } from '../world/geometry';

export interface DroneMesh {
  scene: SceneData;
  /** Rotor centres in object space (for the downwash and prop effects). */
  rotors: Vec3[];
  /** Searchlight lens position in object space. */
  lamp: Vec3;
  radius: number;
}

export function buildDroneMesh(): DroneMesh {
  const b = new SceneBuilder();
  const mBody = b.material({ base: [0.16, 0.17, 0.19], metallic: 0.6, roughness: 0.35 });
  const mBodyLight = b.material({ base: [0.85, 0.45, 0.08], metallic: 0.2, roughness: 0.45 });
  const mRail = b.material({ base: [0.05, 0.05, 0.055], metallic: 0.8, roughness: 0.3 });
  const mPod = b.material({ base: [0.12, 0.12, 0.13], metallic: 0.9, roughness: 0.25 });
  const mLens = b.material({ emission: [45, 44, 40], kind: MatKind.Emitter });
  const mStatus = b.material({ emission: [0.6, 7.0, 2.0], kind: MatKind.Emitter, flags: MatFlag.Blink, aux: [0, 1, 0, 0] });
  const mNavRed = b.material({ emission: [14.0, 0.6, 0.4], kind: MatKind.Emitter });
  const mNavGreen = b.material({ emission: [0.6, 14.0, 1.0], kind: MatKind.Emitter });
  const mRailLed = b.material({ emission: [1.6, 1.9, 2.4], kind: MatKind.Emitter });
  const mStrobe = b.material({ emission: [30, 30, 32], kind: MatKind.Emitter, flags: MatFlag.Blink, aux: [0, 2, 0, 0] });
  const mCamLed = b.material({ emission: [3.0, 0.2, 0.2], kind: MatKind.Emitter, flags: MatFlag.Blink, aux: [0.3, 3, 0, 0] });
  const mGlass = b.material({ base: [0, 0, 0], roughness: 0.05 });

  // Fuselage.
  b.box([-0.24, -0.07, -0.34], [0.24, 0.07, 0.36], mBody);
  b.box([-0.15, 0.07, -0.18], [0.15, 0.14, 0.2], mBodyLight);
  b.box([-0.1, 0.14, -0.06], [0.1, 0.17, 0.06], mBody);
  // Status LEDs on the canopy.
  b.box([-0.03, 0.17, -0.02], [0.03, 0.19, 0.02], mStatus, Face.All & ~Face.NY);
  b.box([0.08, 0.14, 0.12], [0.12, 0.155, 0.16], mStatus, Face.All & ~Face.NY);
  // Rails (H frame) and cross bar.
  for (const x of [-0.5, 0.5]) {
    b.box([x - 0.035, -0.03, -0.62], [x + 0.035, 0.03, 0.62], mRail);
    // Thin LED strip along the outside of each rail so the silhouette reads at night.
    const lx0 = x < 0 ? x - 0.04 : x + 0.035, lx1 = x < 0 ? x - 0.035 : x + 0.04;
    b.box([lx0, -0.008, -0.4], [lx1, 0.008, 0.4], mRailLed, x < 0 ? Face.NX : Face.PX);
  }
  b.box([-0.5, -0.03, -0.04], [0.5, 0.03, 0.04], mRail);
  // Motor pods and props.
  const rotors: Vec3[] = [];
  for (const x of [-0.5, 0.5]) {
    for (const z of [-0.55, 0.55]) {
      b.box([x - 0.06, -0.04, z - 0.06], [x + 0.06, 0.1, z + 0.06], mPod);
      b.box([x - 0.012, 0.1, z - 0.012], [x + 0.012, 0.13, z + 0.012], mRail);
      // Prop disc: a horizontal quad; the shader turns it into a spinning disc.
      const r = 0.34;
      const mDisc = b.material({ base: [0.22, 0.22, 0.24], kind: MatKind.Translucent, aux: [x, z, r, 0] });
      b.quad([x - r, 0.13, z - r], [x - r, 0.13, z + r], [x + r, 0.13, z + r], [x + r, 0.13, z - r], mDisc);
      rotors.push([x, 0.13, z]);
    }
  }
  // Navigation lights on the rail ends and a tail strobe.
  b.box([-0.54, -0.02, -0.64], [-0.46, 0.02, -0.6], mNavRed);
  b.box([0.46, -0.02, -0.64], [0.54, 0.02, -0.6], mNavGreen);
  b.box([-0.54, -0.02, 0.6], [-0.46, 0.02, 0.64], mNavRed);
  b.box([0.46, -0.02, 0.6], [0.54, 0.02, 0.64], mNavGreen);
  b.box([-0.03, 0.03, -0.37], [0.03, 0.08, -0.34], mStrobe);
  // Landing skids.
  for (const x of [-0.3, 0.3]) {
    b.box([x - 0.015, -0.26, -0.3], [x + 0.015, -0.07, -0.27], mRail);
    b.box([x - 0.015, -0.26, 0.27], [x + 0.015, -0.07, 0.3], mRail);
    b.box([x - 0.02, -0.28, -0.36], [x + 0.02, -0.25, 0.36], mPod);
  }
  // Camera gimbal at the nose with a blinking recording LED.
  b.box([-0.07, -0.2, 0.3], [0.07, -0.07, 0.42], mBody);
  b.box([-0.05, -0.17, 0.42], [0.05, -0.1, 0.43], mGlass);
  b.box([0.05, -0.1, 0.405], [0.065, -0.085, 0.42], mCamLed);
  // Searchlight: housing under the belly, lens facing down.
  b.box([-0.12, -0.22, -0.12], [0.12, -0.07, 0.1], mPod);
  b.box([-0.09, -0.225, -0.09], [0.09, -0.22, 0.07], mLens, Face.NY);

  const scene = b.finish();
  // Drone lights are not in the global light list; the searchlight is an
  // analytic spot and the LEDs only glow when seen.
  scene.lightCount = 0;
  scene.lightTris = new Uint32Array(0);
  scene.lightCdf = new Float32Array(0);
  return { scene, rotors, lamp: [0, -0.225, -0.01], radius: 0.95 };
}
