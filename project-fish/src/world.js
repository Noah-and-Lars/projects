// The baseplate: one large, flat, plain grey surface under a plain sky.

import * as THREE from 'three';
import { WORLD } from './shared/config.js';

const SKY_COLOR = 0xb8c6d4;
const FLOOR_COLOR = 0x8c8c8c;

export function createWorld() {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(SKY_COLOR);
  // Fades the far floor into the sky so the edge of the baseplate isn't visible.
  scene.fog = new THREE.Fog(SKY_COLOR, 200, WORLD.size * 0.45);

  scene.add(new THREE.HemisphereLight(0xffffff, 0x5a5a5a, 1.2));
  const sun = new THREE.DirectionalLight(0xffffff, 1.6);
  sun.position.set(30, 100, 20);
  scene.add(sun);

  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(WORLD.size, WORLD.size),
    new THREE.MeshStandardMaterial({ color: FLOOR_COLOR, roughness: 1, metalness: 0 }),
  );
  floor.rotation.x = -Math.PI / 2;
  scene.add(floor);

  return scene;
}
