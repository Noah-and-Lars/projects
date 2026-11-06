// The baseplate: one large, flat, plain grey surface under a plain sky,
// plus a small house to show movement until the real map arrives, and a
// soldier standing by it.

import * as THREE from 'three';
import { loadSoldier, SOLDIER_MODEL } from './soldier.js';
import { WORLD } from './shared/config.js';
import { COLLIDERS, HOUSE, OBSTACLES, SOLDIER, SOLDIER_BOX } from './shared/map.js';

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

  // The sun casts shadows around the house, the movement course and the
  // spawn (SHADOW_AREA).
  const sun = new THREE.DirectionalLight(0xffffff, 1.6);
  sun.position.set(SHADOW_AREA.x, 0, SHADOW_AREA.z).addScaledVector(SUN_DIRECTION, 40);
  sun.target.position.set(SHADOW_AREA.x, 0, SHADOW_AREA.z);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -SHADOW_AREA.half;
  sun.shadow.camera.right = SHADOW_AREA.half;
  sun.shadow.camera.top = SHADOW_AREA.half;
  sun.shadow.camera.bottom = -SHADOW_AREA.half;
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
  scene.add(createCourse());
  return scene;
}

// Where the sun's shadows are drawn: centre and half size (metres).
const SHADOW_AREA = { x: -3, z: -11, half: 15 };

// The movement course's crates, walls, bar and steps (OBSTACLES in map.js).
function createCourse() {
  const group = new THREE.Group();
  const looks = {
    crate: new THREE.MeshStandardMaterial({ color: 0x8b6b45, roughness: 0.85, metalness: 0 }),
    concrete: new THREE.MeshStandardMaterial({ color: 0x9c9a93, roughness: 0.95, metalness: 0 }),
    metal: new THREE.MeshStandardMaterial({ color: 0x55595e, roughness: 0.5, metalness: 0.6 }),
  };
  for (const b of OBSTACLES) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(b.maxX - b.minX, b.maxY - b.minY, b.maxZ - b.minZ), looks[b.look]);
    mesh.position.set((b.minX + b.maxX) / 2, (b.minY + b.maxY) / 2, (b.minZ + b.maxZ) / 2);
    mesh.castShadow = mesh.receiveShadow = true;
    group.add(mesh);
  }
  return group;
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

// Reflections: an outdoor sky over grey ground with the sun in it, matching the
// world, so metal shows the sky above and the ground below, like outside. The
// gun layer and the soldier use it.
export function outdoorEnvironment(renderer, sunDirection) {
  const scene = new THREE.Scene();
  const dome = new THREE.SphereGeometry(10, 64, 32);
  const sky = new THREE.Color(0x8fadd0);
  const horizon = new THREE.Color(0xdde4ea);
  const ground = new THREE.Color(0x5e5e5e);
  const colors = [];
  const position = dome.attributes.position;
  for (let i = 0; i < position.count; i++) {
    const up = position.getY(i) / 10;
    const c = up > 0 ? horizon.clone().lerp(sky, Math.pow(up, 0.5)) : horizon.clone().lerp(ground, Math.min(1, -up * 8));
    colors.push(c.r, c.g, c.b);
  }
  dome.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  scene.add(new THREE.Mesh(dome, new THREE.MeshBasicMaterial({ side: THREE.BackSide, vertexColors: true })));
  const sun = new THREE.Mesh(new THREE.SphereGeometry(0.5, 16, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(14, 13, 12) }));
  sun.position.copy(sunDirection).multiplyScalar(9);
  scene.add(sun);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const texture = pmrem.fromScene(scene, 0).texture;
  pmrem.dispose();
  return texture;
}

// The soldier (assets/soldier.glb, made from a downloaded model by
// tools/soldier/build_soldier.mjs; see README.md, Credits): the character
// players will be in multiplayer, standing by the house in his idle pose
// until then. It loads in the background; if it can't be loaded the world
// just goes without him. Call update(dt) every frame to play his idle.
// wardrobe (src/gear.js, optional) dresses him in the player's outfit.
export const SOLDIER_SKY = 1; // how strongly the sky lights him

export function addSoldier(scene, renderer, camera, wardrobe = null) {
  const soldier = { mixer: null, update(dt) { if (this.mixer) this.mixer.update(dt); } };
  // Lit by the outdoor sky too, as the gun is (the world's plain lights alone
  // leave his dark olive kit nearly black).
  const sky = outdoorEnvironment(renderer, SUN_DIRECTION);
  loadSoldier().then(({ gltf }) => {
    const model = gltf.scene;
    model.position.set(SOLDIER.x, 0, SOLDIER.z);
    model.rotation.y = SOLDIER.facing;
    model.traverse((o) => {
      if (!o.isMesh) return;
      o.castShadow = o.receiveShadow = true;
      for (const material of [].concat(o.material)) {
        material.envMap = sky;
        material.envMapIntensity = SOLDIER_SKY;
      }
      // Skinned meshes move as he breathes; keep him drawn even when the
      // bind pose's bounds would say he's off screen.
      o.frustumCulled = false;
    });
    // Get his materials and textures ready before he appears, so the frame he
    // turns up in doesn't stall.
    return renderer.compileAsync(model, camera, scene).then(() => {
      model.traverse((o) => {
        if (!o.isMesh) return;
        for (const material of [].concat(o.material)) {
          for (const value of Object.values(material)) if (value && value.isTexture) renderer.initTexture(value);
        }
      });
      scene.add(model);
      // The player's outfit (each new piece lit by the sky like him, its
      // materials made ready before it goes on).
      if (wardrobe) {
        wardrobe.dress(model, {
          prepare: (mesh) => {
            mesh.material = [].concat(mesh.material).map((m) => Object.assign(m.clone(), { envMap: sky, envMapIntensity: SOLDIER_SKY }));
            if (mesh.material.length === 1) mesh.material = mesh.material[0];
            return renderer.compileAsync(mesh, camera, scene);
          },
        });
      }
      if (gltf.animations.length) {
        soldier.mixer = new THREE.AnimationMixer(model);
        soldier.mixer.clipAction(gltf.animations[0]).play();
      }
    });
  }).catch((error) => {
    console.warn(`Couldn't load ${SOLDIER_MODEL.pathname}; the soldier is left out.`, error);
    // Nobody there to bump into or shoot.
    const i = COLLIDERS.indexOf(SOLDIER_BOX);
    if (i >= 0) COLLIDERS.splice(i, 1);
  });
  return soldier;
}
