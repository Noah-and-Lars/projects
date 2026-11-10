// The cover art of Steelhead: Dead Ground: the soldier, low and close, a rifle across his
// body, a billowing smoke cloud on the left, three jets climbing on the
// right, all in one amber grade, and the title. tools/cover/render_cover.mjs
// opens this page once per layout and saves what it draws (npm run
// build-cover); see tools/cover/README.md.
//
// Everything in the picture is made here or is one of the game's own
// models:
// - the soldier (assets/soldier.glb), dressed by the game's Wardrobe
//   (src/gear.js) in the comms helmet, the sage carrier and the black
//   gloves;
// - his pose: one frame of the `cover` clip in assets/cinematic/
//   soldier_clips.glb (a Mixamo rifle hold retargeted onto him; see
//   tools/cinematic/README.md). Nothing here turns a bone;
// - the rifle: assets/breakdown/ar_slr.glb, held at a fixed grip: its
//   pistol grip in his right fist, its handguard on the line to his left
//   fist;
// - the sky, the cloud, the debris, the jets and their trails: made in this
//   file (lit sprites with noise, and simple low-poly meshes);
// - the title, STEELHEAD over DEAD GROUND: Big Shoulders Display (SIL Open
//   Font License, in fonts/).
//
// The page draws at twice the layout's size, grades it (amber monochrome,
// grain, vignette), writes the title over it, then halves it, and leaves
// the JPEG in window.coverImage (window.coverDone says it's finished).
//
// Query: layout=cover|thumb|og (default cover); scale (default 2); raw=1
// (no grade); notitle=1; quality (JPEG, default 0.88); show=1 (put the
// picture on the page); and the debug views: debug=1 (him and the rifle
// on grey, from cam yaw/dist/height).

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { boneName } from '../../src/soldier.js';
import { Wardrobe } from '../../src/gear.js';

const q = new URLSearchParams(location.search);
const num = (key, fallback) => (q.has(key) ? Number(q.get(key)) : fallback);
const DEG = Math.PI / 180;

// ---------------------------------------------------------------------------
// The layouts. Sizes are the saved picture's; the page draws at `scale` times
// that. Screen positions are in the frame's own units: x and y from -1 to 1
// across its width and height (y up).
// - camera: where it stands round him (yaw in degrees about him, 0 in front;
//   height above the ground and distance from his hips, in metres), the
//   height it looks at, its vertical field of view, `shift`: how far to
//   one side of him it looks (metres, + puts him right of the middle),
//   and its roll (degrees).
// - sun: the glow behind him.
// - cloud: the smoke's middle and size (in frame heights).
// - jets: the lead jet, the line the three fly in, their size.
// - title: the top of STEELHEAD's capitals and their height (fractions of
//   the frame's height), and DEAD GROUND's capitals as a fraction of those.
const LAYOUTS = {
  cover: {
    size: [1200, 1800],
    camera: { yaw: 0, height: 0.45, dist: 1.6, look: 1.02, fov: 44, shift: 0.1, roll: 8 },
    sun: [0.3, 0.32],
    cloud: { at: [-0.78, -0.25], size: 0.62 },
    jets: { at: [0.5, 0.66], step: [0.15, -0.07], size: 0.034 },
    title: { top: 0.052, cap: 0.105, sub: 0.2 },
  },
  thumb: {
    size: [1280, 720],
    camera: { yaw: 0, height: 0.5, dist: 1.45, look: 1.11, fov: 40, shift: -0.08, roll: 6 },
    sun: [0.2, 0.3],
    cloud: { at: [-0.74, -0.42], size: 0.62 },
    jets: { at: [0.5, 0.5], step: [0.11, -0.1], size: 0.04 },
    title: { top: 0.048, cap: 0.112, sub: 0.25 },
  },
  og: {
    size: [1200, 630],
    camera: { yaw: 0, height: 0.5, dist: 1.45, look: 1.11, fov: 40, shift: -0.08, roll: 6 },
    sun: [0.2, 0.3],
    cloud: { at: [-0.74, -0.42], size: 0.62 },
    jets: { at: [0.5, 0.5], step: [0.11, -0.1], size: 0.04 },
    title: { top: 0.046, cap: 0.104, sub: 0.26 },
  },
};

// Which frame of which clip he's in, and how he's turned (degrees about the
// upright; the clip has him facing 42 degrees to his right).
const POSE = { clip: q.get('clip') || 'cover', time: num('t', 0.9), yaw: num('yaw', 40) };

// His outfit: the comms helmet, the sage carrier, the black gloves.
const OUTFIT = { head: 'comms', vest: q.get('vest') || 'olive', gloves: 'black' };

// The rifle in his hands: the point in his right fist the pistol grip's
// middle goes to and the point in his left hand the handguard rests in, each
// in that hand bone's own frame (its units are centimetres: y runs out
// along the fingers, z towards the thumb, and the palm faces -x on the right
// hand, +x on the left), so each sits in the curl of the fingers; where
// along the handguard (0 at its back, 1 at its front) and how far under its
// middle the left hand holds it (metres); and its roll about the line
// between his hands (degrees).
const GRIP = {
  right: new THREE.Vector3(num('rx', -3.2), num('ry', 9.0), num('rz', 1.5)),
  left: new THREE.Vector3(num('lx', 3.0), num('ly', 11.0), num('lz', 1.5)),
  along: num('along', 0.45),
  under: num('under', 0.03),
  roll: num('roll', 0),
};

const layoutName = LAYOUTS[q.get('layout')] ? q.get('layout') : 'cover';
const L = LAYOUTS[layoutName];
// (Any camera number can be tried from the address: cyaw, ch, cdist, clook,
// cfov, shift, roll.)
for (const [key, name] of [['yaw', 'cyaw'], ['height', 'ch'], ['dist', 'cdist'], ['look', 'clook'], ['fov', 'cfov'], ['shift', 'shift'], ['roll', 'roll']]) {
  if (q.has(name)) L.camera[key] = Number(q.get(name));
}
const SCALE = num('scale', 2);
const [W, H] = L.size;
const RW = Math.round(W * SCALE);
const RH = Math.round(H * SCALE);
const ASPECT = W / H;

const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
const asset = (path) => new URL(`../../assets/${path}`, import.meta.url).href;

// A small seeded random, so every render is the same picture.
function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

async function main() {
  const renderer = new THREE.WebGLRenderer({ antialias: false, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  renderer.setSize(RW, RH, false);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const [soldierGltf, clipsGltf, rifleGltf] = await Promise.all([
    loader.loadAsync(asset('soldier.glb')),
    loader.loadAsync(asset('cinematic/soldier_clips.glb')),
    loader.loadAsync(asset('breakdown/ar_slr.glb')),
    document.fonts.load('900 100px "Cover Title"'),
    document.fonts.load('900 100px "Cover Stencil"'),
  ]);

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

  // --- Him, posed and dressed --------------------------------------------
  const soldier = soldierGltf.scene;
  const bones = {};
  soldier.traverse((o) => {
    if (o.isBone) bones[boneName(o.name)] = o;
  });
  const anim = clipsGltf.animations.find((a) => a.name === POSE.clip);
  if (!anim) throw new Error(`No clip called ${POSE.clip}`);
  const tracks = [];
  for (const track of anim.tracks) {
    const dot = track.name.lastIndexOf('.');
    const bone = bones[boneName(track.name.slice(0, dot))];
    if (!bone) continue;
    const t = track.clone();
    t.name = bone.name + track.name.slice(dot);
    tracks.push(t);
  }
  const mixer = new THREE.AnimationMixer(soldier);
  const action = mixer.clipAction(new THREE.AnimationClip(anim.name, anim.duration, tracks));
  action.play();
  action.time = POSE.time;
  mixer.update(0);
  soldier.rotation.y = POSE.yaw * DEG;

  const wardrobe = new Wardrobe({ get: (slot) => OUTFIT[slot], onChange() {} });
  await wardrobe.dress(soldier);
  soldier.traverse((o) => {
    if (!o.isMesh) return;
    o.frustumCulled = false;
    o.castShadow = o.receiveShadow = true;
    for (const m of [].concat(o.material)) {
      m.envMap = env;
      m.envMapIntensity = num('envI', 0.25);
    }
  });
  scene.add(soldier);
  soldier.updateMatrixWorld(true);

  // --- The rifle in his hands --------------------------------------------
  const rifle = rifleGltf.scene;
  rifle.updateMatrixWorld(true);
  const box = (name) => new THREE.Box3().setFromObject(rifle.getObjectByName(name));
  const gripBox = box('pistol_grip');
  const guardBox = box('handguard');
  const gripPoint = gripBox.getCenter(new THREE.Vector3());
  const restPoint = new THREE.Vector3(0, (guardBox.min.y + guardBox.max.y) / 2 - GRIP.under, THREE.MathUtils.lerp(guardBox.min.z, guardBox.max.z, GRIP.along));
  const inHand = (bone, local) => bone.localToWorld(local.clone());
  const rightFist = inHand(bones.CC_Base_R_Hand, GRIP.right);
  const leftFist = inHand(bones.CC_Base_L_Hand, GRIP.left);
  const along = restPoint.clone().sub(gripPoint).normalize();
  const toLeft = leftFist.clone().sub(rightFist).normalize();
  const turn = new THREE.Quaternion().setFromUnitVectors(along, toLeft);
  // Roll: the rifle's top as near the world's up as the line allows, then
  // GRIP.roll more.
  const top = new THREE.Vector3(0, 1, 0).applyQuaternion(turn).projectOnPlane(toLeft).normalize();
  const want = new THREE.Vector3(0, 1, 0).projectOnPlane(toLeft).normalize();
  let roll = Math.acos(THREE.MathUtils.clamp(top.dot(want), -1, 1));
  if (new THREE.Vector3().crossVectors(top, want).dot(toLeft) < 0) roll = -roll;
  turn.premultiply(new THREE.Quaternion().setFromAxisAngle(toLeft, roll + GRIP.roll * DEG));
  rifle.quaternion.copy(turn);
  rifle.position.copy(rightFist).sub(gripPoint.clone().applyQuaternion(turn));
  rifle.traverse((o) => {
    if (!o.isMesh) return;
    o.castShadow = o.receiveShadow = true;
    for (const m of [].concat(o.material)) {
      m.envMap = env;
      m.envMapIntensity = 0.5;
    }
  });
  scene.add(rifle);

  // Where his hips and head are (the camera works from them).
  const hips = bones.CC_Base_Hip.getWorldPosition(new THREE.Vector3());
  const head = bones.CC_Base_Head.getWorldPosition(new THREE.Vector3());

  // --- The camera ---------------------------------------------------------
  const C = L.camera;
  const camera = new THREE.PerspectiveCamera(C.fov, ASPECT, 0.05, 2000);
  if (q.get('debug')) {
    const yaw = num('cyaw', 0) * DEG;
    const dist = num('cdist', 2.6);
    camera.fov = num('cfov', 35);
    camera.position.set(hips.x + Math.sin(yaw) * dist, num('ch', 0.8), hips.z + Math.cos(yaw) * dist);
    camera.lookAt(hips.x, (hips.y + head.y) / 2 + num('cly', 0), hips.z);
    camera.updateProjectionMatrix();
    scene.background = new THREE.Color(0x777777);
    for (const side of ['L', 'R']) {
      const hand = bones[`CC_Base_${side}_Hand`];
      const out = {};
      for (const f of ['Index1', 'Index3', 'Mid1', 'Mid2', 'Mid3', 'Pinky1', 'Thumb1', 'Thumb3']) {
        const b = bones[`CC_Base_${side}_${f}`];
        if (b) out[f] = hand.worldToLocal(b.getWorldPosition(new THREE.Vector3())).toArray().map((v) => v.toFixed(3)).join(',');
      }
      console.log(side, JSON.stringify(out));
    }
    scene.environment = env;
    for (const [n, p] of [['r', rightFist], ['l', leftFist]]) {
      const dotMesh = new THREE.Mesh(new THREE.SphereGeometry(0.012), new THREE.MeshBasicMaterial({ color: n === 'r' ? 0xff0000 : 0x00ff00, depthTest: false }));
      dotMesh.position.copy(p);
      dotMesh.renderOrder = 10;
      scene.add(dotMesh);
    }
    scene.add(new THREE.HemisphereLight(0xffffff, 0x444444, 1.5));
    const d = new THREE.DirectionalLight(0xffffff, 2);
    d.position.set(1, 3, 2);
    scene.add(d);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.render(scene, camera);
    finish(renderer.domElement, false);
    return;
  }
  const yaw = C.yaw * DEG;
  camera.position.set(hips.x + Math.sin(yaw) * C.dist, C.height, hips.z + Math.cos(yaw) * C.dist);
  // (Shift: the camera looks that far to his left of his hips, in metres,
  // so he sits to the right of the middle; negative: to the left.)
  const across = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
  camera.lookAt(hips.x - across.x * C.shift, C.look, hips.z - across.z * C.shift);
  if (C.roll) camera.rotateZ(C.roll * DEG);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld(true);

  // --- Lights on him ------------------------------------------------------
  // The sun behind him (his rim), the glow of the fire on the left, a dim
  // warm fill from in front and below, and the room's soft light.
  const toCamera = camera.position.clone().sub(hips).setY(0).normalize();
  const lightAt = (dir, strength) => {
    const light = new THREE.DirectionalLight(0xffffff, strength);
    light.position.copy(hips).add(dir);
    light.target.position.copy(hips);
    scene.add(light, light.target);
    return light;
  };
  const frameRight = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion).setY(0).normalize();
  const sun = lightAt(frameRight.clone().multiplyScalar(1.2).addScaledVector(toCamera, -1.4).add(new THREE.Vector3(0, 1.6, 0)), num('sunI', 9));
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -1, right: 1, top: 1, bottom: -1, near: 0.1, far: 6 });
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.01;
  lightAt(frameRight.clone().multiplyScalar(-1.5).addScaledVector(toCamera, -0.8).add(new THREE.Vector3(0, 0.6, 0)), num('fireI', 3.2));
  lightAt(toCamera.clone().multiplyScalar(1.5).add(new THREE.Vector3(0, -0.3, 0)).addScaledVector(frameRight, 0.6), num('fillI', 0.8));
  lightAt(new THREE.Vector3(0, 2, 0).addScaledVector(toCamera, 0.6), num('topI', 1.2));

  // --- The backdrop -------------------------------------------------------
  const frame = new Frame(camera);
  scene.add(makeSky(L));
  scene.add(makeCloud(frame, L.cloud, 60));
  scene.add(makeJets(frame, L.jets, 300));

  // --- Draw, grade, title -------------------------------------------------
  const target = new THREE.WebGLRenderTarget(RW, RH, { type: THREE.HalfFloatType, samples: 4 });
  renderer.setRenderTarget(target);
  renderer.render(scene, camera);
  renderer.setRenderTarget(null);
  grade(renderer, target.texture, L);
  finish(renderer.domElement, !q.get('notitle'));
}

// The frame seen from the camera: turns a point given in the frame's units
// (x, y from -1 to 1) at a distance into the world, and gives the size of
// one frame height there.
class Frame {
  constructor(camera) {
    this.camera = camera;
    this.tan = Math.tan((camera.fov * DEG) / 2);
    this.right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
    this.up = new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion);
    this.forward = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
  }
  // Half the frame's height, in metres, at distance d.
  half(d) {
    return d * this.tan;
  }
  at(x, y, d, out = new THREE.Vector3()) {
    const h = this.half(d);
    return out.copy(this.camera.position)
      .addScaledVector(this.forward, d)
      .addScaledVector(this.right, x * h * this.camera.aspect)
      .addScaledVector(this.up, y * h);
  }
}

// ---------------------------------------------------------------------------
// Shared GLSL: value noise and fbm.
const NOISE = /* glsl */ `
  float hash12(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
  }
  float vnoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash12(i), hash12(i + vec2(1.0, 0.0)), u.x), mix(hash12(i + vec2(0.0, 1.0)), hash12(i + vec2(1.0, 1.0)), u.x), u.y);
  }
  float fbm(vec2 p) {
    float v = 0.0;
    float a = 0.5;
    for (int i = 0; i < 5; i++) {
      v += a * vnoise(p);
      p = p * 2.03 + vec2(17.1, 9.2);
      a *= 0.5;
    }
    return v;
  }
`;

// The sky: a full-frame quad behind everything. Bright and warm towards the
// sun, dimmer to the right and at the top, a haze low down, faint rays.
function makeSky(layout) {
  const material = new THREE.ShaderMaterial({
    depthTest: false,
    depthWrite: false,
    uniforms: { uSun: { value: new THREE.Vector2(...layout.sun) }, uAspect: { value: ASPECT } },
    vertexShader: /* glsl */ `
      varying vec2 vXY;
      void main() {
        vXY = position.xy;
        gl_Position = vec4(position.xy, 1.0, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      varying vec2 vXY;
      uniform vec2 uSun;
      uniform float uAspect;
      ${NOISE}
      void main() {
        vec2 p = vec2(vXY.x * uAspect, vXY.y);
        vec2 s = vec2(uSun.x * uAspect, uSun.y);
        float d = length(p - s);
        float sky = 1.15;
        sky -= 0.28 * smoothstep(-0.2, 1.0, vXY.x);        // dimmer to the right
        sky -= 0.18 * smoothstep(0.2, 1.0, vXY.y);         // and at the top
        sky += 0.25 * smoothstep(-0.3, -1.0, vXY.y);       // haze low down
        sky += 1.6 * exp(-d * d * 3.5) + 0.55 * exp(-d * 1.6); // the sun's glow
        float a = atan(p.y - s.y, p.x - s.x);
        sky *= 1.0 + 0.05 * (vnoise(vec2(a * 9.0, 0.0)) - 0.5) * smoothstep(0.1, 0.8, d);
        sky *= 0.96 + 0.08 * fbm(p * 2.5);
        gl_FragColor = vec4(vec3(sky), 1.0);
      }
    `,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
  mesh.frustumCulled = false;
  mesh.renderOrder = -10;
  return mesh;
}

// ---------------------------------------------------------------------------
// Puffs: camera-facing sprites drawn as lit, noisy spheres. One instanced
// mesh per group, its instances drawn back to front.
function puffMaterial() {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: {
      uLight: { value: new THREE.Vector3(-0.5, 0.7, 0.5).normalize() },
    },
    vertexShader: /* glsl */ `
      attribute vec4 aPuff;      // centre (world), radius
      attribute vec4 aShade;     // light reaching it (0..1), albedo, glow, seed
      attribute vec4 aMass;      // its direction from the cloud's middle (world), opacity
      varying vec2 vUv;
      varying vec4 vShade;
      varying vec3 vMass;
      varying float vAlpha;
      void main() {
        vUv = position.xy;
        vShade = aShade;
        vMass = normalize((viewMatrix * vec4(aMass.xyz, 0.0)).xyz);
        vAlpha = aMass.w;
        vec4 mv = viewMatrix * vec4(aPuff.xyz, 1.0);
        float a = aShade.w * 6.2831;
        vec2 xy = mat2(cos(a), sin(a), -sin(a), cos(a)) * position.xy;
        mv.xy += xy * aPuff.w;
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uLight;
      varying vec2 vUv;
      varying vec4 vShade;
      varying vec3 vMass;
      varying float vAlpha;
      ${NOISE}
      void main() {
        vec2 uv = vUv;
        float seed = vShade.w * 91.7;
        float n = fbm(uv * 1.6 + seed);
        float n2 = fbm(uv * 3.2 + seed * 1.7);
        float r2 = dot(uv, uv);
        float edge = 1.0 - r2 + (n - 0.5) * 0.9 + (n2 - 0.5) * 0.35;
        float alpha = smoothstep(0.0, 0.45, edge) * vAlpha;
        if (alpha < 0.004) discard;
        vec3 N = normalize(vec3(uv, sqrt(max(0.02, 1.0 - r2))));
        // Bumps from the noise.
        float e = 0.05;
        float nx = fbm((uv + vec2(e, 0.0)) * 3.2 + seed * 1.7) - n2;
        float ny = fbm((uv + vec2(0.0, e)) * 3.2 + seed * 1.7) - n2;
        N = normalize(N - vec3(nx, ny, 0.0) * 2.0);
        vec3 M = normalize(mix(N, vMass, 0.3));
        vec3 Lv = normalize((viewMatrix * vec4(uLight, 0.0)).xyz);
        float ndl = dot(M, Lv);
        float lit = pow(smoothstep(-0.35, 0.95, ndl), 1.4) * vShade.x;
        float albedo = vShade.y;
        float lum = albedo * (0.1 + 1.9 * lit * lit + 0.05 * (1.0 - r2));
        lum += vShade.z * (0.6 + 0.8 * n2) * smoothstep(0.2, 0.9, edge); // glow inside
        gl_FragColor = vec4(vec3(lum), alpha);
      }
    `,
  });
}

// Builds an instanced mesh from puffs [{ c, r, light, albedo, glow, mass, alpha }],
// sorted far to near from the camera.
function puffMesh(puffs, camera) {
  const eye = camera.position;
  puffs.sort((a, b) => b.c.distanceToSquared(eye) - a.c.distanceToSquared(eye));
  const geometry = new THREE.InstancedBufferGeometry();
  const quad = new THREE.PlaneGeometry(2, 2);
  geometry.index = quad.index;
  geometry.setAttribute('position', quad.attributes.position);
  const P = new Float32Array(puffs.length * 4);
  const S = new Float32Array(puffs.length * 4);
  const M = new Float32Array(puffs.length * 4);
  puffs.forEach((p, i) => {
    P.set([p.c.x, p.c.y, p.c.z, p.r], i * 4);
    S.set([p.light, p.albedo, p.glow || 0, p.seed], i * 4);
    M.set([p.mass.x, p.mass.y, p.mass.z, p.alpha], i * 4);
  });
  geometry.setAttribute('aPuff', new THREE.InstancedBufferAttribute(P, 4));
  geometry.setAttribute('aShade', new THREE.InstancedBufferAttribute(S, 4));
  geometry.setAttribute('aMass', new THREE.InstancedBufferAttribute(M, 4));
  geometry.instanceCount = puffs.length;
  const mesh = new THREE.Mesh(geometry, puffMaterial());
  mesh.frustumCulled = false;
  return mesh;
}

// The cloud: a billowing cauliflower of smoke, rising and leaning out of
// the left of the frame, with debris thrown out of it.
function makeCloud(frame, spec, distance) {
  const group = new THREE.Group();
  const random = rng(7);
  const h = frame.half(distance) * spec.size; // one cloud unit, in metres
  const middle = frame.at(spec.at[0], spec.at[1], distance);
  const R = frame.right;
  const U = frame.up;
  const F = frame.forward.clone().negate(); // towards the camera
  const place = (x, y, z) => middle.clone().addScaledVector(R, x * h).addScaledVector(U, y * h).addScaledVector(F, z * h);
  const light = new THREE.Vector3().addScaledVector(R, -0.55).addScaledVector(U, 0.75).addScaledVector(F, 0.45).normalize();

  // The big masses: a broad billowing body and a column rising out of it.
  const big = [];
  const lumps = [
    [0.0, -0.55, 0, 0.62], [0.42, -0.62, 0.1, 0.5], [-0.45, -0.5, 0, 0.55],
    [0.15, -0.05, 0.05, 0.5], [-0.25, 0.05, -0.1, 0.48], [0.4, 0.15, 0.0, 0.38],
    [0.05, 0.48, 0.0, 0.42], [-0.3, 0.55, 0.05, 0.36], [0.28, 0.62, -0.05, 0.32],
    [-0.05, 0.92, 0.0, 0.33], [0.22, 1.05, 0.05, 0.25], [-0.28, 1.0, 0.0, 0.26],
    [0.65, -0.25, 0.1, 0.36], [-0.7, -0.15, 0.0, 0.4], [0.7, -0.75, 0.15, 0.4],
  ];
  for (const [x, y, z, r] of lumps) big.push({ x, y, z, r });
  const centre = new THREE.Vector3(0, 0.0, 0);
  const all = [];
  const add = (x, y, z, r, depth) => all.push({ x, y, z, r, depth });
  for (const b of big) add(b.x, b.y, b.z, b.r, 0);
  // Smaller billows on the surface of each, two levels down.
  let level = big.map((b) => ({ ...b }));
  for (let depth = 1; depth <= 2; depth++) {
    const next = [];
    for (const p of level) {
      const count = depth === 1 ? 8 : 6;
      for (let i = 0; i < count; i++) {
        // Mostly on the side facing the camera and upwards.
        let dx = random() * 2 - 1;
        let dy = random() * 2 - 1 + 0.25;
        let dz = random() * 1.2 - 0.2;
        const len = Math.hypot(dx, dy, dz) || 1;
        dx /= len; dy /= len; dz /= len;
        const r = p.r * (0.42 + random() * 0.22);
        const x = p.x + dx * p.r * 0.85;
        const y = p.y + dy * p.r * 0.85;
        const z = p.z + dz * p.r * 0.85;
        add(x, y, z, r, depth);
        next.push({ x, y, z, r });
      }
    }
    level = next;
  }
  // Light reaching each puff: blocked by the big masses between it and the
  // light (soft).
  const lightLocal = new THREE.Vector3(-0.55, 0.75, 0.45).normalize();
  const puffs = [];
  for (const p of all) {
    const pos = new THREE.Vector3(p.x, p.y, p.z);
    let reach = 1;
    for (const b of big) {
      const toB = new THREE.Vector3(b.x, b.y, b.z).sub(pos);
      const t = toB.dot(lightLocal);
      if (t <= 0) continue;
      const miss = toB.clone().addScaledVector(lightLocal, -t).length();
      const cover = THREE.MathUtils.smoothstep(b.r * 1.05 - miss, -b.r * 0.15, b.r * 0.6);
      reach *= 1 - 0.6 * cover;
    }
    const mass = pos.clone().sub(centre);
    mass.y *= 0.7;
    mass.normalize();
    const massW = new THREE.Vector3().addScaledVector(R, mass.x).addScaledVector(U, mass.y).addScaledVector(F, mass.z);
    // Fire glow low in the body, deep inside.
    const glow = p.y < -0.2 && p.depth >= 1 ? Math.max(0, 0.45 - reach) * 1.4 * random() : 0;
    puffs.push({
      c: place(p.x, p.y, p.z),
      r: p.r * h * (p.depth === 0 ? 1.0 : 1.08),
      light: reach,
      albedo: 0.48 + random() * 0.16,
      glow,
      seed: random(),
      mass: massW,
      alpha: p.depth === 0 ? 0.95 : 0.92,
    });
  }
  // The dark spires of thrown earth rising out of the top and side.
  const spires = [[-0.35, 1.05, -0.3, 0.45], [0.32, 1.0, 0.35, 0.35], [-0.75, 0.35, -0.5, 0.3], [0.7, 0.2, 0.5, 0.3]];
  for (const [x0, y0, dx, len] of spires) {
    const steps = 22;
    for (let i = 0; i < steps; i++) {
      const t = i / steps;
      const r = (0.07 * (1 - t) + 0.01) * (0.7 + random() * 0.6);
      const x = x0 + dx * t * len + (random() - 0.5) * 0.05;
      const y = y0 + t * len;
      puffs.push({ c: place(x, y, -0.3), r: r * h, light: 0.25, albedo: 0.25, glow: 0, seed: random(), mass: U.clone(), alpha: 0.9 * (1 - t * 0.5) });
    }
  }
  const material = puffMesh(puffs, frame.camera);
  material.material.uniforms.uLight.value.copy(light);
  group.add(material);

  // Debris: dark shards flung out of the cloud, with a few streaks.
  const shards = new THREE.Group();
  const shardGeometry = new THREE.TetrahedronGeometry(1, 0);
  const shardMaterial = new THREE.MeshBasicMaterial({ color: 0x1c1712 });
  for (let i = 0; i < 170; i++) {
    const a = (random() * 1.1 - 0.05) * Math.PI; // upwards mostly
    const d = 0.7 + random() * random() * 0.7;
    const x = Math.cos(a) * d * 1.1 - 0.1;
    const y = Math.sin(a) * d * 0.9 + 0.1;
    const s = h * (0.005 + random() * random() * 0.026);
    const m = new THREE.Mesh(shardGeometry, shardMaterial);
    m.position.copy(place(x, y, 0.2 + random() * 0.3));
    m.scale.set(s * (0.6 + random()), s * (0.4 + random()), s);
    m.rotation.set(random() * 6, random() * 6, random() * 6);
    shards.add(m);
  }
  group.add(shards);
  return group;
}

// ---------------------------------------------------------------------------
// The jets: three simple fighters (made here, low poly), climbing in a line,
// each with a smoke trail behind.
function jetGeometry() {
  const parts = [];
  // Fuselage: a lathe along +Y (nose up), then laid along +Z.
  const profile = [
    [0, 1.0], [0.05, 0.86], [0.09, 0.7], [0.11, 0.5], [0.12, 0.1], [0.12, -0.6], [0.105, -0.85], [0.08, -0.9], [0, -0.9],
  ].map(([r, y]) => new THREE.Vector2(r, y));
  const body = new THREE.LatheGeometry(profile, 10);
  body.rotateX(Math.PI / 2); // nose to +Z
  parts.push(body);
  // Canopy bump.
  const canopy = new THREE.SphereGeometry(0.075, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2);
  canopy.scale(1, 0.9, 2.6);
  canopy.translate(0, 0.08, 0.52);
  parts.push(canopy);
  // Wings: a cropped delta.
  const wing = new THREE.Shape();
  wing.moveTo(0.1, 0.25);
  wing.lineTo(0.95, -0.3);
  wing.lineTo(0.95, -0.42);
  wing.lineTo(0.1, -0.5);
  wing.lineTo(-0.1, -0.5);
  wing.lineTo(-0.95, -0.42);
  wing.lineTo(-0.95, -0.3);
  wing.lineTo(-0.1, 0.25);
  const wings = new THREE.ExtrudeGeometry(wing, { depth: 0.02, bevelEnabled: false });
  wings.rotateX(-Math.PI / 2); // flat, shape y -> -z... fix below
  wings.scale(1, 1, -1);
  wings.translate(0, -0.01, 0);
  parts.push(wings);
  // Tailplanes.
  const tail = new THREE.Shape();
  tail.moveTo(0.08, -0.62);
  tail.lineTo(0.42, -0.86);
  tail.lineTo(0.42, -0.94);
  tail.lineTo(0.08, -0.92);
  tail.lineTo(-0.08, -0.92);
  tail.lineTo(-0.42, -0.94);
  tail.lineTo(-0.42, -0.86);
  tail.lineTo(-0.08, -0.62);
  const tails = new THREE.ExtrudeGeometry(tail, { depth: 0.015, bevelEnabled: false });
  tails.rotateX(-Math.PI / 2);
  tails.scale(1, 1, -1);
  parts.push(tails);
  // The fin.
  const fin = new THREE.Shape();
  fin.moveTo(-0.45, 0.0);
  fin.lineTo(-0.9, 0.42);
  fin.lineTo(-0.98, 0.42);
  fin.lineTo(-0.9, 0.0);
  const fins = new THREE.ExtrudeGeometry(fin, { depth: 0.015, bevelEnabled: false });
  fins.rotateY(-Math.PI / 2); // shape x -> z
  fins.translate(0.0075, 0.08, 0);
  parts.push(fins);
  return mergeGeometries(parts);
}

// Joins geometries (non-indexed) into one.
function mergeGeometries(list) {
  const positions = [];
  for (const g of list) {
    const ng = g.index ? g.toNonIndexed() : g;
    positions.push(...ng.attributes.position.array);
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  out.computeVertexNormals();
  return out;
}

function makeJets(frame, spec, distance) {
  const group = new THREE.Group();
  const random = rng(11);
  const geometry = jetGeometry();
  const material = new THREE.MeshStandardMaterial({ color: 0x3a3a3a, roughness: 0.55, metalness: 0.3, flatShading: true });
  const h = frame.half(distance);
  const size = spec.size * h; // a jet's half length, in metres
  const trail = [];
  // Their heading in the frame: climbing up and to the right.
  const heading = new THREE.Vector3().addScaledVector(frame.right, 0.62).addScaledVector(frame.up, 0.78).addScaledVector(frame.forward, 0.12).normalize();
  for (let i = 0; i < 3; i++) {
    const at = frame.at(spec.at[0] + spec.step[0] * i, spec.at[1] + spec.step[1] * i, distance);
    const jet = new THREE.Mesh(geometry, material);
    jet.position.copy(at);
    jet.scale.setScalar(size);
    // Nose along the heading, belly a little towards the camera (seen from
    // below), banked a touch.
    const look = new THREE.Matrix4().lookAt(new THREE.Vector3(), heading.clone().negate(), frame.forward.clone().negate().add(frame.right.clone().multiplyScalar(-0.3)));
    jet.quaternion.setFromRotationMatrix(look);
    jet.rotateZ((-20 + i * 8) * DEG);
    group.add(jet);
    // The trail: soft puffs back along the way it came, thickening and
    // fading.
    const tailEnd = at.clone().addScaledVector(heading, -size * 0.95);
    const len = h * 1.6;
    const steps = 150;
    for (let k = 0; k < steps; k++) {
      const t = k / steps;
      const p = tailEnd.clone().addScaledVector(heading, -len * t * t * 0.6 - len * t * 0.4);
      p.addScaledVector(frame.right, (random() - 0.5) * size * 0.25 * t).addScaledVector(frame.up, (random() - 0.5) * size * 0.25 * t);
      const gap = random() < 0.08 * t ? 0 : 1;
      trail.push({
        c: p,
        r: size * (0.12 + 0.55 * t) * (0.7 + random() * 0.6),
        light: 0.75,
        albedo: 0.42,
        glow: 0,
        seed: random(),
        mass: frame.forward.clone().negate(),
        alpha: gap * 0.42 * (1 - t) * (1 - Math.exp(-k * 0.6)),
      });
    }
  }
  const trails = puffMesh(trail, frame.camera);
  trails.material.uniforms.uLight.value.set(-0.5, 0.7, 0.5).normalize();
  group.add(trails);
  // Their own light: the sun behind and above.
  const sunLight = new THREE.DirectionalLight(0xffffff, 2.0);
  sunLight.position.copy(frame.camera.position).addScaledVector(frame.forward, 600).addScaledVector(frame.up, 300);
  sunLight.target.position.copy(frame.camera.position);
  group.add(sunLight, sunLight.target);
  // (Only the jets are near enough to this light for it to matter; it also
  // adds a little to him, from behind.)
  return group;
}

// ---------------------------------------------------------------------------
// The grade: brightness only, mapped through amber (deep brown shadows,
// orange middles, hot yellow-white highlights), a little warmer to the
// right, with grain and a slight vignette.
function grade(renderer, texture, layout) {
  const raw = !!q.get('raw');
  const material = new THREE.ShaderMaterial({
    depthTest: false,
    depthWrite: false,
    uniforms: {
      tScene: { value: texture },
      uExposure: { value: num('exposure', 1.0) },
      uRaw: { value: raw ? 1 : 0 },
      uSun: { value: new THREE.Vector2(...layout.sun) },
      uSeed: { value: 3.7 },
      uRes: { value: new THREE.Vector2(RW, RH) },
      uGrain: { value: num('grain', 0.05) },
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = vec4(position.xy, 0.0, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform sampler2D tScene;
      uniform float uExposure;
      uniform int uRaw;
      uniform vec2 uSun;
      uniform float uSeed;
      uniform vec2 uRes;
      uniform float uGrain;
      varying vec2 vUv;
      float hash(vec2 p) {
        vec3 p3 = fract(vec3(p.xyx) * 0.1031);
        p3 += dot(p3, p3.yzx + 33.33);
        return fract((p3.x + p3.y) * p3.z);
      }
      vec3 ramp(float t) {
        // sRGB stops, from black-brown to hot pale yellow.
        vec3 c0 = vec3(0.045, 0.022, 0.008);
        vec3 c1 = vec3(0.16, 0.08, 0.025);
        vec3 c2 = vec3(0.37, 0.205, 0.06);
        vec3 c3 = vec3(0.66, 0.40, 0.09);
        vec3 c4 = vec3(0.90, 0.64, 0.12);
        vec3 c5 = vec3(0.97, 0.80, 0.18);
        vec3 c6 = vec3(1.0, 0.95, 0.72);
        if (t < 0.15) return mix(c0, c1, t / 0.15);
        if (t < 0.32) return mix(c1, c2, (t - 0.15) / 0.17);
        if (t < 0.52) return mix(c2, c3, (t - 0.32) / 0.20);
        if (t < 0.72) return mix(c3, c4, (t - 0.52) / 0.20);
        if (t < 0.88) return mix(c4, c5, (t - 0.72) / 0.16);
        return mix(c5, c6, clamp((t - 0.88) / 0.12, 0.0, 1.0));
      }
      void main() {
        vec3 hdr = texture2D(tScene, vUv).rgb * uExposure;
        if (uRaw == 1) {
          vec3 m = hdr / (1.0 + hdr);
          gl_FragColor = vec4(pow(m, vec3(1.0 / 2.2)), 1.0);
          return;
        }
        float lum = dot(hdr, vec3(0.2126, 0.7152, 0.0722));
        // Filmic shoulder, then to a perceptual scale.
        float t = 1.0 - exp(-lum * 1.35);
        t = pow(t, 1.0 / 1.9);
        // Vignette.
        vec2 c = vUv - 0.5;
        float v = 1.0 - 0.35 * smoothstep(0.35, 0.95, length(c * vec2(1.0, 1.0)) * 1.25);
        t *= v;
        vec3 col = ramp(clamp(t, 0.0, 1.0));
        // A little more orange to the right and at the top right, a little
        // more lemon to the left.
        float warm = smoothstep(-0.1, 0.5, c.x) * 0.5 + smoothstep(0.1, 0.5, c.y) * 0.2;
        col = mix(col, col * vec3(1.02, 0.84, 0.72), warm * smoothstep(0.35, 0.8, t));
        col = mix(col, col * vec3(1.0, 1.04, 0.9), smoothstep(0.0, -0.45, c.x) * 0.5 * smoothstep(0.5, 0.9, t));
        // Grain.
        float g = hash(gl_FragCoord.xy + uSeed * 100.0) + hash(gl_FragCoord.xy * 1.37 + 11.0) - 1.0;
        col += g * uGrain * (0.4 + 0.6 * (1.0 - abs(t - 0.5) * 2.0));
        gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
      }
    `,
  });
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
  quad.frustumCulled = false;
  const scene = new THREE.Scene();
  scene.add(quad);
  const camera = new THREE.Camera();
  const tm = renderer.toneMapping;
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.outputColorSpace = THREE.LinearSRGBColorSpace; // the shader writes sRGB itself
  renderer.render(scene, camera);
  renderer.toneMapping = tm;
}

// ---------------------------------------------------------------------------
// The title, then halve it and save.
function finish(glCanvas, withTitle) {
  const big = document.createElement('canvas');
  big.width = RW;
  big.height = RH;
  const ctx = big.getContext('2d');
  ctx.drawImage(glCanvas, 0, 0);
  if (withTitle) drawTitle(ctx);
  // Halve (or whatever the scale was) in steps of two for a clean result.
  let src = big;
  while (src.width > W * 1.01) {
    const half = document.createElement('canvas');
    half.width = Math.max(W, Math.round(src.width / 2));
    half.height = Math.max(H, Math.round(src.height / 2));
    const hctx = half.getContext('2d');
    hctx.imageSmoothingEnabled = true;
    hctx.imageSmoothingQuality = 'high';
    hctx.drawImage(src, 0, 0, half.width, half.height);
    src = half;
  }
  window.coverImage = src.toDataURL('image/jpeg', num('quality', 0.88));
  if (q.get('show') || !navigator.webdriver) document.body.appendChild(src);
  window.coverDone = true;
}

// The title: STEELHEAD (the series) big and white, and under it DEAD GROUND
// (this game), smaller, widely spaced, on a dark rough-edged band, the two
// centred. The layout gives the top of STEELHEAD's capitals and their height
// (fractions of the picture's height); the rest follows from those.
function drawTitle(ctx) {
  const T = L.title;
  const font = q.get('font') === 'stencil' ? 'Cover Stencil' : 'Cover Title';
  const cx = RW / 2;

  // STEELHEAD: its size set by the height of its capitals.
  const name = 'STEELHEAD';
  const nameSpacing = 0.015;
  ctx.font = `900 100px "${font}"`;
  const capPer100 = ctx.measureText('H').actualBoundingBoxAscent;
  const size = (RH * T.cap) / (capPer100 / 100);
  ctx.font = `900 ${size}px "${font}"`;
  ctx.letterSpacing = `${(size * nameSpacing).toFixed(1)}px`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  const nameWidth = ctx.measureText(name).width - size * nameSpacing;
  const baseline = RH * (T.top + T.cap);
  // (letterSpacing also follows the last letter: shift by half of it.)
  const nameX = cx + (size * nameSpacing) / 2;
  ctx.save();
  ctx.shadowColor = 'rgba(60, 25, 0, 0.45)';
  ctx.shadowBlur = size * 0.12;
  ctx.shadowOffsetY = size * 0.02;
  ctx.fillStyle = '#ffffff';
  ctx.fillText(name, nameX, baseline);
  ctx.restore();
  ctx.fillStyle = '#ffffff';
  ctx.fillText(name, nameX, baseline);

  // DEAD GROUND: capitals a fraction of STEELHEAD's, spaced wide, on a band
  // as wide as STEELHEAD with torn ends and edges.
  const sub = 'DEAD GROUND';
  const subCap = RH * T.cap * T.sub;
  const subSize = (subCap / capPer100) * 100;
  const subSpacing = 0.42;
  ctx.font = `900 ${subSize}px "${font}"`;
  ctx.letterSpacing = `${(subSize * subSpacing).toFixed(1)}px`;
  const subWidth = ctx.measureText(sub).width - subSize * subSpacing;
  const bandH = subCap * 2.05;
  const bandTop = baseline + RH * T.cap * 0.13;
  const bandW = Math.max(nameWidth * 1.04, subWidth + subCap * 3.2);
  roughBand(ctx, cx - bandW / 2, bandTop, bandW, bandH);
  ctx.fillStyle = '#fff4e2';
  ctx.fillText(sub, cx + (subSize * subSpacing) / 2, bandTop + bandH / 2 + subCap / 2);
}

// A dark band like a quick stroke of a wide brush: its long edges wander a
// little and are nicked here and there, its ends are torn, and a few dry
// streaks trail off them. Seeded, so it's the same every time.
function roughBand(ctx, x, y, w, h) {
  let seed = 7;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const step = h * 0.09;
  const edge = (from, to, yAt, sign) => {
    const pts = [];
    const n = Math.max(2, Math.round(Math.abs(to - from) / step));
    for (let i = 0; i <= n; i++) {
      const px = from + ((to - from) * i) / n;
      let dy = (rand() - 0.5) * h * 0.05 + Math.sin(px / (h * 1.7)) * h * 0.025;
      if (rand() < 0.06) dy += sign * h * (0.06 + rand() * 0.07);
      pts.push([px, yAt + dy]);
    }
    return pts;
  };
  const end = (xAt, fromY, toY, sign) => {
    const pts = [];
    const n = 9;
    for (let i = 1; i < n; i++) {
      const py = fromY + ((toY - fromY) * i) / n;
      pts.push([xAt + sign * (rand() * h * 0.32 - h * 0.08), py]);
    }
    return pts;
  };
  const top = edge(x + h * 0.1, x + w - h * 0.1, y, 1);
  const bottom = edge(x + w - h * 0.06, x + h * 0.06, y + h, -1);
  const pts = [...top, ...end(x + w, y, y + h, 1), ...bottom, ...end(x, y + h, y, -1)];
  ctx.save();
  ctx.shadowColor = 'rgba(40, 16, 0, 0.35)';
  ctx.shadowBlur = h * 0.35;
  ctx.fillStyle = 'rgba(22, 11, 3, 0.9)';
  ctx.beginPath();
  pts.forEach(([px, py], i) => (i ? ctx.lineTo(px, py) : ctx.moveTo(px, py)));
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  // Dry streaks off each end.
  ctx.fillStyle = 'rgba(22, 11, 3, 0.75)';
  for (const side of [-1, 1]) {
    const ex = side < 0 ? x : x + w;
    for (let i = 0; i < 7; i++) {
      const sy = y + h * (0.08 + rand() * 0.84);
      const len = h * (0.25 + rand() * 0.9);
      const th = h * (0.03 + rand() * 0.06);
      const start = ex - side * h * 0.2;
      ctx.beginPath();
      ctx.moveTo(start, sy - th / 2);
      ctx.lineTo(start + side * len, sy - th * 0.1);
      ctx.lineTo(start + side * len * 0.97, sy + th * 0.15);
      ctx.lineTo(start, sy + th / 2);
      ctx.closePath();
      ctx.fill();
    }
  }
}

main().catch((error) => {
  console.error(error);
  window.coverError = String(error && error.stack || error);
  window.coverDone = true;
});
