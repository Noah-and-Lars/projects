// The baseplate: one large, flat, plain grey surface under a plain sky,
// plus a small house to show movement until the real map arrives.

import * as THREE from 'three';
import { WORLD } from './shared/config.js';
import { HOUSE } from './shared/map.js';

const SKY_COLOR = 0xb8c6d4;
const FLOOR_COLOR = 0x8c8c8c;

// Direction the sunlight comes from (towards the sun). Also used to light the gun.
export const SUN_DIRECTION = new THREE.Vector3(0.45, 0.8, 0.4).normalize();

export function createWorld() {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(SKY_COLOR);
  // Fades the far floor into the sky so the edge of the baseplate isn't visible.
  scene.fog = new THREE.Fog(SKY_COLOR, 200, WORLD.size * 0.45);

  scene.add(new THREE.HemisphereLight(0xffffff, 0x5a5a5a, 1.2));

  // The sun casts shadows around the house only (it's the only thing that casts one).
  const sun = new THREE.DirectionalLight(0xffffff, 1.6);
  sun.position.set(HOUSE.x, 0, HOUSE.z).addScaledVector(SUN_DIRECTION, 40);
  sun.target.position.set(HOUSE.x, 0, HOUSE.z);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -8;
  sun.shadow.camera.right = 8;
  sun.shadow.camera.top = 8;
  sun.shadow.camera.bottom = -8;
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 80;
  sun.shadow.bias = -0.0005;
  sun.shadow.normalBias = 0.02;
  scene.add(sun, sun.target);

  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(WORLD.size, WORLD.size),
    new THREE.MeshStandardMaterial({ color: FLOOR_COLOR, roughness: 1, metalness: 0 }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);

  scene.add(createHouse());
  return scene;
}

function createHouse() {
  const { width: w, depth: d, wallHeight: h, roofHeight: rh } = HOUSE;
  const house = new THREE.Group();
  house.position.set(HOUSE.x, 0, HOUSE.z);

  const mat = (color, roughness = 0.9) => new THREE.MeshStandardMaterial({ color, roughness, metalness: 0 });
  const add = (geometry, material, x, y, z) => {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    house.add(mesh);
    return mesh;
  };

  // Walls
  const walls = mat(0xd9d0c1);
  add(new THREE.BoxGeometry(w, h, d), walls, 0, h / 2, 0);

  // Gable roof with a 30 cm overhang at the front and back, ridge running along X.
  // The triangle at each end is part of the wall, so it gets the wall colour.
  const overhang = 0.3;
  const half = d / 2 + overhang;
  const slope = new THREE.Shape([
    new THREE.Vector2(-half, -0.1),
    new THREE.Vector2(half, -0.1),
    new THREE.Vector2(0, rh),
  ]);
  const roofGeometry = new THREE.ExtrudeGeometry(slope, { depth: w, bevelEnabled: false });
  roofGeometry.translate(0, 0, -w / 2);
  roofGeometry.rotateY(Math.PI / 2);
  add(roofGeometry, [walls, mat(0x6b3a2e)], 0, h, 0); // [ends, slopes]

  // Chimney
  add(new THREE.BoxGeometry(0.6, 1.6, 0.6), mat(0x8a5a48), w * 0.25, h + rh * 0.55, -d * 0.18);

  // Door and windows on the front (+Z), and windows on the sides.
  const trim = mat(0xf2efe8, 0.6);
  const glass = new THREE.MeshStandardMaterial({ color: 0x6f8798, roughness: 0.15, metalness: 0.2 });
  const front = d / 2;
  add(new THREE.BoxGeometry(1.1, 2.2, 0.12), trim, -0.6, 1.1, front);
  add(new THREE.BoxGeometry(0.9, 2.05, 0.14), mat(0x5a3b25, 0.7), -0.6, 1.03, front);
  add(new THREE.SphereGeometry(0.04, 12, 8), new THREE.MeshStandardMaterial({ color: 0xc9a227, metalness: 1, roughness: 0.3 }), -0.3, 1.0, front + 0.08);

  const windowAt = (x, z, rotationY) => {
    const frame = add(new THREE.BoxGeometry(1.2, 1.1, 0.1), trim, x, 1.6, z);
    const pane = add(new THREE.BoxGeometry(1.0, 0.9, 0.12), glass, x, 1.6, z);
    frame.rotation.y = pane.rotation.y = rotationY;
  };
  windowAt(1.6, front, 0);
  windowAt(-w / 2, 0, Math.PI / 2);
  windowAt(w / 2, 0, Math.PI / 2);
  windowAt(-1.2, -d / 2, 0);
  windowAt(1.2, -d / 2, 0);

  // Front step
  add(new THREE.BoxGeometry(1.4, 0.15, 0.6), mat(0x9a948a), -0.6, 0.075, front + 0.3);

  return house;
}
