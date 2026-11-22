// "Chart & Signal" materials: flat toon ramp, ink outlines, emissive lamps.
import * as THREE from 'three';

let ramp: THREE.DataTexture | null = null;
export function toonRamp(): THREE.DataTexture {
  if (ramp) return ramp;
  const data = new Uint8Array([90, 90, 90, 255, 170, 170, 170, 255, 255, 255, 255, 255]);
  ramp = new THREE.DataTexture(data, 3, 1, THREE.RGBAFormat);
  ramp.minFilter = ramp.magFilter = THREE.NearestFilter;
  ramp.needsUpdate = true;
  return ramp;
}

export const INK = new THREE.Color('#1b2a4a');

export function bodyMaterial(): THREE.MeshToonMaterial {
  return new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: toonRamp() });
}
export function glassMaterial(): THREE.MeshToonMaterial {
  return new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: toonRamp(), transparent: true, opacity: 0.45, depthWrite: false });
}
export function lampMaterial(): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false });
}
export function inkMaterial(opacity = 0.85): THREE.LineBasicMaterial {
  return new THREE.LineBasicMaterial({ color: INK, transparent: opacity < 1, opacity });
}
