// The world: the map (src/shared/map.js, MAP_ID). The parking garage: its
// scanned model in the dark, its light already in its textures. Or the
// baseplate: one large, flat, plain grey surface under a plain sky, plus a
// small house and a movement course. And a soldier standing in it.

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { loadSoldier, SOLDIER_MODEL } from './soldier.js';
import { WORLD } from './shared/config.js';
import { COLLIDERS, GARAGE, garageEdge, HOUSE, MAP_ID, OBSTACLES, SOLDIER, SOLDIER_BOX } from './shared/map.js';

const SKY_COLOR = 0xb8c6d4;
const FLOOR_COLOR = 0x8c8c8c;

// Direction the sunlight comes from (towards the sun). Also used to light the gun.
export const SUN_DIRECTION = new THREE.Vector3(0.45, 0.8, 0.4).normalize();

// The garage: dark all round (where the scan stops, the car park seems to
// go on into the dark), and the far side of it a little hazy. Its own
// lights are in its textures (unlit materials); the lights here are for
// the soldier and the player's body: a cool overhead light, like its
// strip lights.
const GARAGE_DARK = 0x050607;
const GARAGE_MODEL = new URL(`../${GARAGE.model}`, import.meta.url);

export function createWorld() {
  if (MAP_ID === 'garage') return createGarage();
  const scene = new THREE.Scene();
  scene.userData.mapReady = Promise.resolve();
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

function createGarage() {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(GARAGE_DARK);
  scene.fog = new THREE.Fog(GARAGE_DARK, 12, 34);
  scene.add(new THREE.HemisphereLight(0xe4ebf2, 0x3c3c3a, 1.0));
  const overhead = new THREE.DirectionalLight(0xf2f6ff, 0.9);
  overhead.position.set(1, 10, 3);
  overhead.target.position.set(1, 0, 2);
  scene.add(overhead, overhead.target);
  scene.add(garageDarkness());
  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  scene.userData.mapReady = loader.loadAsync(GARAGE_MODEL.href).then((gltf) => {
    gltf.scene.name = 'garage';
    scene.add(gltf.scene);
  }).catch((error) => {
    // Without its model, a plain dark floor (its walls still stand, unseen).
    console.warn(`Couldn't load ${GARAGE_MODEL.pathname}; a plain floor stands in for the garage.`, error);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.MeshStandardMaterial({ color: 0x55575a, roughness: 1 }));
    floor.rotation.x = -Math.PI / 2;
    scene.add(floor);
  });
  return scene;
}

// Where the scan stops (the garage's open edges), darkness thickens over
// the last two metres: see-through black sheets standing one behind
// the other, each a little darker, the last one solid, so the torn edges of
// the scanned floor and ceiling fade out and the car park seems to go on
// into the dark. (Not fogged: they stay black.)
function garageDarkness() {
  const group = new THREE.Group();
  group.name = 'garage-darkness';
  const LAYERS = 6;
  const top = GARAGE.ceiling + 0.4;
  for (const i of GARAGE.open) {
    const e = garageEdge(i);
    for (let k = 0; k < LAYERS; k++) {
      const depth = GARAGE.darkDepth * (1 - k / (LAYERS - 1)); // from the innermost to the edge
      const opacity = k === LAYERS - 1 ? 1 : 0.12 + 0.05 * k;
      const geometry = new THREE.PlaneGeometry(e.len + 1.2, top + 0.6);
      const sheet = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({
        color: GARAGE_DARK, transparent: true, opacity, depthWrite: false, side: THREE.DoubleSide, fog: false,
      }));
      sheet.position.set((e.ax + e.bx) / 2 + e.nx * depth, top / 2 - 0.3, (e.az + e.bz) / 2 + e.nz * depth);
      sheet.rotation.y = Math.atan2(e.nx, e.nz);
      sheet.renderOrder = 10 + k;
      group.add(sheet);
    }
  }
  return group;
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

// The house (also stands behind the enemy in the cinematic, src/showcase/
// cinematic/set.js).
export function createHouse() {
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

// His hit points: a hit takes off the gun's `damage` (src/shared/config.js),
// twice that to the head. Where a shot hits him (his box split by height
// and, seen from his front, by side: HIT_PARTS) picks how he reacts: his
// head snaps back, he doubles over a stomach hit, an arm is knocked back...
// and the hit that takes the last of them, how he falls (a headshot its own
// fall, when there's a clip for it). He lies where he lands for DOWN
// seconds, then gets up there (his get-up clip, from where the fall left
// him) and stays there: his box and his bar go with him.
// The clips are Mixamo's, retargeted onto him (assets/cinematic/
// soldier_clips.glb: see tools/cinematic/clips.json). Each part names the
// clips it would like, in order; the first that's in the file plays
// (enemy_hit and enemy_hit_fall, the cinematic's own, are always there).
// While he's down, shots and the player go through him.
export const SOLDIER_HP = { max: 100, head: 2, down: 4.5 };
const HIT_PARTS = {
  head: { hit: ['hit_head', 'enemy_hit'], fall: ['death_head', 'death_back', 'enemy_hit_fall'] },
  chest: { hit: ['hit_chest', 'enemy_hit'], fall: ['death_back', 'enemy_hit_fall'] },
  stomach: { hit: ['hit_stomach', 'hit_chest', 'enemy_hit'], fall: ['death_forward', 'death_back', 'enemy_hit_fall'] },
  left: { hit: ['hit_shoulder_left', 'hit_shoulder', 'enemy_hit'], fall: ['death_back', 'enemy_hit_fall'] },
  right: { hit: ['hit_shoulder_right', 'hit_shoulder', 'enemy_hit'], fall: ['enemy_hit_fall', 'death_back'] },
  legs: { hit: ['hit_leg', 'enemy_hit'], fall: ['death_forward', 'death_back', 'enemy_hit_fall'] },
};
const GET_UP = ['get_up', 'get_up_front'];
const SOLDIER_CLIPS = new URL('../assets/cinematic/soldier_clips.glb', import.meta.url);
const HIPS = 'CC_Base_Hip';
const HEAD_BONE = 'CC_Base_Head';

// Which part of him a shot at (x, y, z) hit: by height up his box, and for
// the chest, by how far to his left or right of his middle it is.
function hitPart(x, y, z) {
  const top = SOLDIER_BOX.maxY;
  if (y >= top - 0.3) return 'head';
  if (y < 0.85) return 'legs';
  // Seen from his front: his own left (+X in his frame) or right.
  const dx = x - SOLDIER.x;
  const dz = z - SOLDIER.z;
  const side = dx * Math.cos(SOLDIER.facing) - dz * Math.sin(SOLDIER.facing);
  if (Math.abs(side) > 0.17 && y > 1.05) return side > 0 ? 'left' : 'right';
  return y >= 1.15 ? 'chest' : 'stomach';
}

// One of his bones by its name (the file numbers each node: CC_Base_Hip_01).
function boneOf(model, name) {
  let found = null;
  model.traverse((o) => {
    if (!found && o.isBone && o.name.replace(/_\d+$/, '') === name) found = o;
  });
  return found;
}

// Puts his box round where he stands (SOLDIER.x, z).
function placeSoldierBox() {
  SOLDIER_BOX.minX = SOLDIER.x - 0.32;
  SOLDIER_BOX.maxX = SOLDIER.x + 0.32;
  SOLDIER_BOX.minZ = SOLDIER.z - 0.22;
  SOLDIER_BOX.maxZ = SOLDIER.z + 0.22;
}

export function addSoldier(scene, renderer, camera, wardrobe = null) {
  const v = new THREE.Vector3();
  const soldier = {
    mixer: null,
    hp: SOLDIER_HP.max,
    state: 'standing', // 'standing', 'down' (lying), 'rising' (getting up)
    downFor: 0, // seconds left lying down
    model: null,
    bones: { hip: null, head: null }, // his own (taken before his outfit goes on, which brings bones named the same)
    clips: {}, // name: its action (played once, held on its last frame)
    playing: null, // the action playing over his idle, if any
    // How a shot that hit his box at (x, y, z) hurts him: the hit points it
    // took off, whether it was to the head, where it hit and whether it put
    // him down. (Nothing while he's down or getting up.)
    hit(damage, x, y, z) {
      if (this.state !== 'standing') return null;
      const part = hitPart(x, y, z);
      const head = part === 'head';
      const taken = Math.min(this.hp, Math.round(damage * (head ? SOLDIER_HP.head : 1)));
      this.hp -= taken;
      const killed = this.hp <= 0;
      if (killed) this.fall(part); else this.react(part);
      return { taken, head, part, killed, hp: this.hp };
    },
    first(names) {
      for (const name of names) if (this.clips[name]) return this.clips[name];
      return null;
    },
    // Plays `action` over everything else (fading in), or back to idle.
    play(action, fade) {
      if (!this.actions) return;
      const idle = this.actions.idle;
      if (this.playing && this.playing !== action) this.playing.fadeOut(fade);
      if (action) {
        action.reset().setEffectiveWeight(1).fadeIn(fade).play();
        if (idle.getEffectiveWeight() > 0) idle.fadeOut(fade);
      } else {
        idle.reset().setEffectiveWeight(1).fadeIn(fade).play();
      }
      this.playing = action;
    },
    react(part) {
      this.play(this.first(HIT_PARTS[part].hit), 0.08);
    },
    fall(part) {
      this.state = 'down';
      this.downFor = SOLDIER_HP.down;
      const i = COLLIDERS.indexOf(SOLDIER_BOX);
      if (i >= 0) COLLIDERS.splice(i, 1);
      this.play(this.first(HIT_PARTS[part].fall), 0.1);
    },
    // Gets up where he fell (all his hit points back): his get-up clip
    // starts with him lying as the falls leave him, on his back, so it's put
    // where his hips are now. With no get-up clip, he's back on his feet at
    // once, there.
    getUp() {
      this.hp = SOLDIER_HP.max;
      if (!this.model || !this.actions) {
        this.state = 'standing';
        if (!COLLIDERS.includes(SOLDIER_BOX)) COLLIDERS.push(SOLDIER_BOX);
        return;
      }
      const at = this.hips();
      const rise = this.first(GET_UP);
      // His new pose straight away (lined up by its own first frame: each
      // clip carries his hips from its own start), then put where he lay.
      this.mixer.stopAllAction();
      if (rise) {
        this.state = 'rising';
        rise.reset().setEffectiveWeight(1).play();
        this.playing = rise;
      } else {
        // (No get-up clip: back on his feet where he fell.)
        this.state = 'standing';
        this.actions.idle.reset().setEffectiveWeight(1).play();
        this.playing = null;
        if (!COLLIDERS.includes(SOLDIER_BOX)) COLLIDERS.push(SOLDIER_BOX);
      }
      this.mixer.update(0);
      this.moveTo(at);
    },
    // Where his hips are now (the ground under them, and the way his body
    // faces), in the world.
    hips() {
      const hip = this.bones.hip;
      if (!hip) return { x: SOLDIER.x, z: SOLDIER.z, facing: SOLDIER.facing };
      this.model.updateMatrixWorld(true);
      hip.getWorldPosition(v);
      return { x: v.x, z: v.z, facing: this.model.rotation.y };
    },
    // Moves him (his model, his box, where his bar goes) so his hips stand
    // where `to` says. (Each clip carries him from over his model's origin.)
    moveTo(to) {
      SOLDIER.x = to.x;
      SOLDIER.z = to.z;
      SOLDIER.facing = to.facing;
      placeSoldierBox();
      if (!this.model) return;
      const hip = this.bones.hip;
      this.model.updateMatrixWorld(true);
      const off = hip ? hip.getWorldPosition(v).sub(this.model.position) : v.set(0, 0, 0);
      this.model.position.set(to.x - off.x, 0, to.z - off.z);
      this.model.rotation.y = to.facing;
    },
    // Where his health bar goes: over his head (world space), or null.
    barPoint(into) {
      if (!this.model) return null;
      const head = this.bones.head;
      if (!head) return into.set(SOLDIER.x, SOLDIER_BOX.maxY + 0.32, SOLDIER.z);
      head.getWorldPosition(into);
      into.y += 0.38;
      return into;
    },
    update(dt) {
      if (this.state === 'down') {
        this.downFor -= dt;
        if (this.downFor <= 0) {
          this.downFor = 0;
          this.getUp();
        }
      }
      if (this.mixer) this.mixer.update(dt);
    },
    // A clip that played to its end: after a hit reaction, back to his idle;
    // after getting up, he's standing where the clip left him.
    finished(action) {
      if (this.state === 'standing' && action === this.playing) this.play(null, 0.25);
      else if (this.state === 'rising' && action === this.playing) {
        const at = this.hips();
        this.mixer.stopAllAction();
        this.actions.idle.reset().setEffectiveWeight(1).play();
        this.playing = null;
        this.mixer.update(0);
        this.moveTo(at);
        this.state = 'standing';
        if (!COLLIDERS.includes(SOLDIER_BOX)) COLLIDERS.push(SOLDIER_BOX);
      }
    },
  };
  // Lit by the outdoor sky too, as the gun is (the world's plain lights alone
  // leave his dark olive kit nearly black).
  const sky = outdoorEnvironment(renderer, SUN_DIRECTION);
  const clips = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).loadAsync(SOLDIER_CLIPS.href).then((g) => g.animations).catch((error) => {
    console.warn(`Couldn't load ${SOLDIER_CLIPS.pathname}; the soldier won't react to hits.`, error);
    return [];
  });
  Promise.all([loadSoldier(), clips]).then(([{ gltf }, reactions]) => {
    const model = gltf.scene;
    soldier.model = model;
    soldier.bones = { hip: boneOf(model, HIPS), head: boneOf(model, HEAD_BONE) };
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
        const idle = soldier.mixer.clipAction(gltf.animations[0]);
        idle.play();
        const once = (name) => {
          const clip = reactions.find((c) => c.name === name);
          if (!clip) return null;
          const action = soldier.mixer.clipAction(clip);
          action.setLoop(THREE.LoopOnce, 1);
          action.clampWhenFinished = true;
          return action;
        };
        soldier.actions = { idle };
        for (const clip of reactions) soldier.clips[clip.name] = once(clip.name);
        soldier.mixer.addEventListener('finished', (e) => soldier.finished(e.action));
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
