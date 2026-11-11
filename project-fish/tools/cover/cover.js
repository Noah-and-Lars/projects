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
//   the frame's height), DEAD GROUND's capitals as a fraction of those,
//   and its band's width as a fraction of STEELHEAD's (0: just round the
//   words, as on the box art, where it would otherwise cover a jet).
const LAYOUTS = {
  cover: {
    size: [1200, 1800],
    camera: { yaw: 0, height: 0.45, dist: 1.6, look: 1.02, fov: 44, shift: 0.1, roll: 8 },
    sun: [0.3, 0.32],
    cloud: { at: [-0.78, -0.25], size: 0.62 },
    jets: { at: [0.5, 0.66], step: [0.15, -0.07], size: 0.034 },
    title: { top: 0.05, cap: 0.095, sub: 0.18, band: 0 },
  },
  thumb: {
    size: [1280, 720],
    camera: { yaw: 0, height: 0.5, dist: 1.45, look: 1.11, fov: 40, shift: -0.08, roll: 6 },
    sun: [0.2, 0.3],
    cloud: { at: [-0.74, -0.42], size: 0.62 },
    jets: { at: [0.5, 0.5], step: [0.11, -0.1], size: 0.04 },
    title: { top: 0.06, cap: 0.098, sub: 0.3, band: 1.04 },
  },
  og: {
    size: [1200, 630],
    camera: { yaw: 0, height: 0.5, dist: 1.45, look: 1.11, fov: 40, shift: -0.08, roll: 6 },
    sun: [0.2, 0.3],
    cloud: { at: [-0.74, -0.42], size: 0.62 },
    jets: { at: [0.5, 0.5], step: [0.11, -0.1], size: 0.04 },
    title: { top: 0.044, cap: 0.1, sub: 0.29, band: 1.04 },
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
  scene.add(makeSmoke(renderer, frame, L, 60));
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

// The sky's brightness at a point of the frame (x, y from -1 to 1): bright
// and warm towards the sun, dimmer to the right and at the top, a haze low
// down, faint rays. The sky draws it; the smoke fades into it.
const SKY = /* glsl */ `
  float skyLum(vec2 xy, vec2 sun, float aspect) {
    vec2 p = vec2(xy.x * aspect, xy.y);
    vec2 s = vec2(sun.x * aspect, sun.y);
    float d = length(p - s);
    float sky = 1.15;
    sky -= 0.28 * smoothstep(-0.2, 1.0, xy.x);        // dimmer to the right
    sky -= 0.18 * smoothstep(0.2, 1.0, xy.y);         // and at the top
    sky += 0.25 * smoothstep(-0.3, -1.0, xy.y);       // haze low down
    sky += 1.6 * exp(-d * d * 3.5) + 0.55 * exp(-d * 1.6); // the sun's glow
    float a = atan(p.y - s.y, p.x - s.x);
    sky *= 1.0 + 0.05 * (vnoise(vec2(a * 9.0, 0.0)) - 0.5) * smoothstep(0.1, 0.8, d);
    sky *= 0.96 + 0.08 * fbm(p * 2.5);
    return sky;
  }
`;

// The sky: a full-frame quad behind everything.
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
      ${SKY}
      void main() {
        gl_FragColor = vec4(vec3(skyLum(vXY, uSun, uAspect)), 1.0);
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

// The smoke: a column of billowing smoke rising out of the left of the
// frame, with earth and debris thrown out of it, drawn as a volume.
// - Its shape: a heap of round masses, billows heaped on them two levels
//   down, softly joined, baked into a 3D texture (SMOKE_MASSES, smokeSpheres).
// - Its billows and wisps: the heap's edges eaten by billowy cell noise (a
//   tiling 3D texture made here, smokeNoise) at two scales, the finer
//   eating most where the smoke is thin, all rolled by a warp.
// - Its light: marched through, front to back, at the saved picture's size.
//   At each step: the sun's light reaching it through the smoke between
//   (a few steps towards the sun), scattered mostly forwards, so thin smoke
//   with the sun behind it glows and the dense middle is dark; and the sky's
//   light from above, dimmer the more smoke is over it.
// - Streamers of thrown earth rising out of the top, dust along the ground
//   at its foot, and the haze over it, thicker low down.
// It's drawn on a plane behind him; the debris flung out of it is real
// geometry, some in front of the smoke and some behind.

// The big masses, in cloud units (the cloud's middle at 0, 0; one unit is
// the layout's cloud size in half frame heights; z towards the camera):
// x, y, z, radius.
const SMOKE_MASSES = [
  [0.0, -0.55, 0.0, 0.62], [0.42, -0.62, 0.1, 0.5], [-0.45, -0.5, 0.0, 0.55],
  [0.15, -0.05, 0.05, 0.5], [-0.25, 0.05, -0.1, 0.48], [0.4, 0.15, 0.0, 0.38],
  [0.05, 0.48, 0.0, 0.42], [-0.3, 0.55, 0.05, 0.36], [0.28, 0.62, -0.05, 0.32],
  [-0.05, 0.92, 0.0, 0.33], [0.22, 1.05, 0.05, 0.25], [-0.28, 1.0, 0.0, 0.26],
  [0.65, -0.25, 0.1, 0.36], [-0.7, -0.15, 0.0, 0.4], [0.7, -0.75, 0.15, 0.4],
];
// Streamers of thrown earth: from, through, to (cloud units), width.
const SMOKE_STREAMERS = [
  [-0.32, 0.95, -0.5, 1.25, -0.7, 1.5, 0.05],
  [-0.1, 1.05, -0.16, 1.35, -0.26, 1.62, 0.04],
  [0.2, 1.0, 0.32, 1.25, 0.46, 1.46, 0.045],
  [-0.62, 0.35, -0.85, 0.6, -1.05, 0.78, 0.04],
  [0.55, 0.25, 0.78, 0.42, 0.98, 0.52, 0.035],
  [0.05, 1.1, 0.1, 1.3, 0.12, 1.45, 0.03],
];
// The box the smoke fills (cloud units): its low and high corners, and how
// many texels to a unit its shape is baked at.
const SMOKE_BOX = { min: [-1.75, -1.7, -1.2], max: [1.75, 1.9, 1.2], res: 44 };

// The masses and the billows heaped on them, two levels down.
function smokeSpheres() {
  const random = rng(7);
  const spheres = SMOKE_MASSES.map(([x, y, z, r]) => ({ x, y, z, r }));
  let parents = spheres.slice();
  for (const [count, shrink] of [[num('k_kids', 4), num('k_shrink', 0.5)]]) {
    const next = [];
    for (const p of parents) {
      for (let i = 0; i < count; i++) {
        // Mostly towards the camera, upwards and outwards.
        let dx = random() * 2 - 1;
        let dy = random() * 2 - 1 + 0.3;
        let dz = random() * 1.4 - 0.3;
        const len = Math.hypot(dx, dy, dz) || 1;
        dx /= len; dy /= len; dz /= len;
        const r = p.r * shrink * (0.7 + random() * 0.6);
        const d = p.r * (0.75 + random() * 0.2);
        next.push({ x: p.x + dx * d, y: p.y + dy * d, z: p.z + dz * d, r });
      }
    }
    spheres.push(...next);
    parents = next;
  }
  return spheres;
}

// The heap baked into a 3D texture: at each texel, how far inside the
// spheres it is (0 at their surface, 1 at a middle), softly joined.
function smokeShape() {
  const { min, max, res } = SMOKE_BOX;
  const n = [0, 1, 2].map((k) => Math.round((max[k] - min[k]) * res));
  const field = new Float32Array(n[0] * n[1] * n[2]);
  const k = 0.12; // the softness of the joins
  for (const s of smokeSpheres()) {
    const lo = [s.x - s.r, s.y - s.r, s.z - s.r].map((v, a) => Math.max(0, Math.floor((v - min[a]) * res)));
    const hi = [s.x + s.r, s.y + s.r, s.z + s.r].map((v, a) => Math.min(n[a] - 1, Math.ceil((v - min[a]) * res)));
    for (let zi = lo[2]; zi <= hi[2]; zi++) {
      const z = min[2] + (zi + 0.5) / res - s.z;
      for (let yi = lo[1]; yi <= hi[1]; yi++) {
        const y = min[1] + (yi + 0.5) / res - s.y;
        let at = (zi * n[1] + yi) * n[0];
        for (let xi = lo[0]; xi <= hi[0]; xi++) {
          const x = min[0] + (xi + 0.5) / res - s.x;
          const f = 1 - Math.sqrt(x * x + y * y + z * z) / s.r;
          if (f > -k) {
            const v = field[at + xi];
            // Soft max of the two.
            const h = Math.min(1, Math.max(0, 0.5 + (0.5 * (f - v)) / k));
            field[at + xi] = v + (f - v) * h + k * h * (1 - h);
          }
        }
      }
    }
  }
  const data = new Uint8Array(field.length);
  for (let i = 0; i < field.length; i++) data[i] = Math.round(Math.min(1, Math.max(0, field[i] * num('k_mgain', 1.0))) * 255);
  const texture = new THREE.Data3DTexture(data, n[0], n[1], n[2]);
  texture.format = THREE.RedFormat;
  texture.minFilter = texture.magFilter = THREE.LinearFilter;
  texture.unpackAlignment = 1;
  texture.needsUpdate = true;
  return texture;
}

// A tiling 3D noise texture (N texels a side): R and G billowy cell noise
// (one minus the distance to the nearest of scattered points, at three
// scales), coarse and fine; B and A smooth value noise, for the warp.
function smokeNoise(N = 64) {
  const random = rng(23);
  const cellNoise = (cells) => {
    const pts = new Float32Array(cells * cells * cells * 3);
    for (let i = 0; i < pts.length; i++) pts[i] = random();
    return (x, y, z) => {
      const fx = x * cells, fy = y * cells, fz = z * cells;
      const cx = Math.floor(fx), cy = Math.floor(fy), cz = Math.floor(fz);
      let best = 9;
      for (let k = -1; k <= 1; k++) for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
        const ix = cx + i, iy = cy + j, iz = cz + k;
        const w = ((((iz % cells) + cells) % cells) * cells + (((iy % cells) + cells) % cells)) * cells + (((ix % cells) + cells) % cells);
        const dx = ix + pts[w * 3] - fx, dy = iy + pts[w * 3 + 1] - fy, dz = iz + pts[w * 3 + 2] - fz;
        const d = dx * dx + dy * dy + dz * dz;
        if (d < best) best = d;
      }
      return 1 - Math.min(1, Math.sqrt(best));
    };
  };
  const valueNoise = (cells) => {
    const v = new Float32Array(cells * cells * cells);
    for (let i = 0; i < v.length; i++) v[i] = random();
    const at = (i, j, k) => v[((((k % cells) + cells) % cells) * cells + (((j % cells) + cells) % cells)) * cells + (((i % cells) + cells) % cells)];
    const s = (t) => t * t * (3 - 2 * t);
    return (x, y, z) => {
      const fx = x * cells, fy = y * cells, fz = z * cells;
      const i = Math.floor(fx), j = Math.floor(fy), k = Math.floor(fz);
      const u = s(fx - i), w = s(fy - j), t = s(fz - k);
      const l = (a, b, f) => a + (b - a) * f;
      return l(
        l(l(at(i, j, k), at(i + 1, j, k), u), l(at(i, j + 1, k), at(i + 1, j + 1, k), u), w),
        l(l(at(i, j, k + 1), at(i + 1, j, k + 1), u), l(at(i, j + 1, k + 1), at(i + 1, j + 1, k + 1), u), w),
        t,
      );
    };
  };
  const c = [cellNoise(4), cellNoise(8), cellNoise(16), cellNoise(32)];
  const v = [valueNoise(4), valueNoise(8), valueNoise(16), valueNoise(4), valueNoise(8), valueNoise(16)];
  const data = new Uint8Array(N * N * N * 4);
  let o = 0;
  for (let z = 0; z < N; z++) for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const px = x / N, py = y / N, pz = z / N;
    const c4 = c[0](px, py, pz), c8 = c[1](px, py, pz), c16 = c[2](px, py, pz), c32 = c[3](px, py, pz);
    // (Coarse: the cell noise lifted by smooth noise, so its billows join.)
    const cells = c4 * 0.625 + c8 * 0.25 + c16 * 0.125;
    const smooth = v[0](px, py, pz) * 0.5 + v[1](px, py, pz) * 0.3 + v[2](px, py, pz) * 0.2;
    data[o++] = Math.round(Math.min(1, Math.max(0, (smooth - (cells - 1)) / (2 - cells))) * 255);
    data[o++] = Math.round((c8 * 0.625 + c16 * 0.25 + c32 * 0.125) * 255);
    data[o++] = Math.round((v[0](px, py, pz) * 0.57 + v[1](px, py, pz) * 0.29 + v[2](px, py, pz) * 0.14) * 255);
    data[o++] = Math.round((v[3](px, py, pz) * 0.57 + v[4](px, py, pz) * 0.29 + v[5](px, py, pz) * 0.14) * 255);
  }
  const texture = new THREE.Data3DTexture(data, N, N, N);
  texture.format = THREE.RGBAFormat;
  texture.minFilter = texture.magFilter = THREE.LinearFilter;
  texture.wrapS = texture.wrapT = texture.wrapR = THREE.RepeatWrapping;
  texture.unpackAlignment = 1;
  texture.needsUpdate = true;
  return texture;
}

function makeSmoke(renderer, frame, layout, distance) {
  const spec = layout.cloud;
  const group = new THREE.Group();
  const K = (name, v) => num('k_' + name, v).toFixed(4); // (tuning)

  // --- The smoke, marched through, into a picture of its own ----------------
  const DW = Math.round(RW / 2);
  const DH = Math.round(RH / 2);
  const picture = new THREE.WebGLRenderTarget(DW, DH, { type: THREE.HalfFloatType, depthBuffer: false });
  // Where the sun is, seen from the cloud (cloud units): its place in the
  // frame, and behind.
  const sunU = ((layout.sun[0] - spec.at[0]) * ASPECT) / spec.size;
  const sunV = (layout.sun[1] - spec.at[1]) / spec.size;
  const toSun = new THREE.Vector3(sunU * num('k_sx', 0.25), sunV * num('k_sy', 0.4), -num('k_sz', 0.8)).normalize();
  const marchMaterial = new THREE.ShaderMaterial({
    depthTest: false,
    depthWrite: false,
    uniforms: {
      tShape: { value: smokeShape() },
      tNoise: { value: smokeNoise() },
      uRes: { value: new THREE.Vector2(DW, DH) },
      uAspect: { value: ASPECT },
      uAt: { value: new THREE.Vector2(...spec.at) },
      uSize: { value: spec.size },
      uBoxMin: { value: new THREE.Vector3(...SMOKE_BOX.min) },
      uBoxMax: { value: new THREE.Vector3(...SMOKE_BOX.max) },
      uToSun: { value: toSun },
      uStreamA: { value: SMOKE_STREAMERS.map((s) => new THREE.Vector4(s[0], s[1], s[2], s[3])) },
      uStreamB: { value: SMOKE_STREAMERS.map((s, k) => new THREE.Vector4(s[4], s[5], s[6], k * 7.31)) },
      uSun: { value: new THREE.Vector2(...layout.sun) },
    },
    vertexShader: /* glsl */ `
      void main() {
        gl_Position = vec4(position.xy, 0.0, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      precision highp sampler3D;
      #define NS ${SMOKE_STREAMERS.length}
      uniform sampler3D tShape;
      uniform sampler3D tNoise;
      uniform vec2 uRes;
      uniform float uAspect;
      uniform vec2 uAt;
      uniform float uSize;
      uniform vec3 uBoxMin;
      uniform vec3 uBoxMax;
      uniform vec3 uToSun;
      uniform vec4 uStreamA[NS];
      uniform vec4 uStreamB[NS];
      uniform vec2 uSun;
      ${NOISE}
      ${SKY}
      float remap(float v, float lo, float hi) {
        return clamp((v - lo) / max(hi - lo, 1e-4), 0.0, 1.0);
      }
      float shapeAt(vec3 p) {
        return texture(tShape, (p - uBoxMin) / (uBoxMax - uBoxMin)).r;
      }
      // The smoke's density at p (0 to 1); cheap: without the fine wisps.
      float densityAt(vec3 p, bool cheap) {
        float m = shapeAt(p);
        if (m < 0.004) return 0.0;
        vec4 w = texture(tNoise, p * ${K('wf', 0.22)} + vec3(0.13, 0.31, 0.71));
        // Rising: the warp stretched upwards a little.
        vec3 pw = p + vec3(w.b - 0.5, (w.a - 0.5) * 0.7, w.b - w.a) * ${K('warp', 0.55)};
        float billows = texture(tNoise, pw * ${K('f1', 0.42)}).r;
        // (Eaten most at the edges, where the heap is thin.)
        float d = remap(m, (1.0 - billows) * ${K('e1', 0.85)} * (1.0 - m * ${K('ek', 1.0)}), 1.0);
        if (cheap) return d;
        float fine = texture(tNoise, pw * ${K('f2', 1.1)} + vec3(0.5, 0.2, 0.9)).g;
        d = remap(d, fine * ${K('e2', 0.5)} * (1.0 - d * ${K('e2k', 1.0)}), 1.0);
        return d;
      }
      float hg(float c, float g) {
        float g2 = g * g;
        return (1.0 - g2) / pow(1.0 + g2 - 2.0 * g * c, 1.5);
      }
      vec2 curve(vec2 p, vec2 a, vec2 b, vec2 c) {
        float best = 1e9;
        float along = 0.0;
        vec2 prev = a;
        for (int i = 1; i <= 8; i++) {
          float t = float(i) / 8.0;
          vec2 next = mix(mix(a, b, t), mix(b, c, t), t);
          vec2 ab = next - prev;
          float h = clamp(dot(p - prev, ab) / dot(ab, ab), 0.0, 1.0);
          float d = length(p - prev - ab * h);
          if (d < best) {
            best = d;
            along = (float(i - 1) + h) / 8.0;
          }
          prev = next;
        }
        return vec2(best, along);
      }
      float fbm3(vec2 p) {
        float v = 0.0;
        float a = 0.5;
        for (int i = 0; i < 3; i++) {
          v += a * vnoise(p);
          p = p * 2.03 + vec2(17.1, 9.2);
          a *= 0.5;
        }
        return v / 0.875;
      }
      void main() {
        vec2 xy = gl_FragCoord.xy / uRes * 2.0 - 1.0;
        vec2 p2 = vec2((xy.x - uAt.x) * uAspect, xy.y - uAt.y) / uSize;
        float lum = 0.0;
        float trans = 1.0;
        if (p2.x > uBoxMin.x && p2.x < uBoxMax.x && p2.y > uBoxMin.y && p2.y < uBoxMax.y) {
          // Front to back.
          const int STEPS = 72;
          float span = uBoxMax.z - uBoxMin.z;
          float ds = span / float(STEPS);
          float jitter = hash12(gl_FragCoord.xy);
          float sigma = ${K('sigma', 22.0)};
          float cosView = dot(-uToSun, vec3(0.0, 0.0, 1.0));
          float phase0 = mix(hg(cosView, ${K('g', 0.55)}), hg(cosView, -0.25), 0.3);
          float phase1 = mix(hg(cosView, ${K('g', 0.55)} * 0.5), hg(cosView, -0.12), 0.3);
          for (int i = 0; i < STEPS; i++) {
            vec3 p = vec3(p2, uBoxMax.z - (float(i) + jitter) * ds);
            float d = densityAt(p, false);
            if (d <= 0.0) continue;
            // The smoke between here and the sun.
            float toward = 0.0;
            float step = 0.03;
            vec3 q = p;
            for (int j = 0; j < 6; j++) {
              q += uToSun * step;
              toward += densityAt(q, j > ${num('k_fullj', 1)}) * step;
              step *= 1.7;
            }
            // And above (the sky's light).
            float above = 0.0;
            for (int j = 1; j <= 3; j++) {
              above += shapeAt(p + vec3(0.0, float(j * j) * 0.08, 0.0)) * 0.08 * float(2 * j - 1);
            }
            float tl = toward * sigma;
            float sun = exp(-tl) * phase0 + ${K('ms1', 0.5)} * exp(-tl * 0.35) * phase1 + ${K('ms2', 0.1)} * exp(-tl * 0.12);
            float sky = exp(-above * ${K('skyk', 4.0)});
            float light = ${K('isun', 0.9)} * sun + ${K('isky', 0.5)} * sky + ${K('ifloor', 0.04)};
            float absorb = 1.0 - exp(-d * sigma * ds);
            lum += trans * absorb * light;
            trans *= 1.0 - absorb;
            if (trans < 0.01) break;
          }
        }
        // Streamers of thrown earth, in front.
        if (p2.y > 0.2 && p2.y < 1.8 && p2.x > -1.2 && p2.x < 1.1) {
          for (int i = 0; i < NS; i++) {
            vec4 A = uStreamA[i];
            vec4 B = uStreamB[i];
            vec2 sp = p2 + (vec2(fbm3(p2 * 4.0 + B.w), fbm3(p2 * 4.0 + B.w + 5.0)) - 0.5) * 0.08;
            vec2 c = curve(sp, A.xy, A.zw, B.xy);
            float width = B.z * 0.6 * mix(1.0, 0.3, c.y) * (0.5 + 1.0 * fbm3(vec2(c.y * 7.0, B.w)));
            float s = exp(-pow(c.x / width, 2.0)) * smoothstep(1.0, 0.6, c.y);
            s *= smoothstep(0.25, 0.65, fbm(vec2(c.y * 11.0 + B.w, c.x * 25.0 + B.w)));
            float a = 1.0 - exp(-s * 5.0);
            lum = lum * (1.0 - a) + a * 0.12;
            trans *= 1.0 - a;
          }
        }
        // Dust along the ground, behind.
        float dustZone = smoothstep(-0.5, -0.98, xy.y) * (1.0 - smoothstep(0.6, 1.7, p2.x));
        if (dustZone > 0.001) {
          float dust = dustZone * smoothstep(0.35, 0.8, fbm(vec2(p2.x * 1.4, p2.y * 4.0) + vec2(0.0, 3.0)));
          float a = 1.0 - exp(-dust * ${K('dust', 0.5)});
          float sky = skyLum(xy, uSun, uAspect);
          lum += trans * a * sky * 0.8;
          trans *= 1.0 - a;
        }
        gl_FragColor = vec4(lum, 1.0 - trans, 0.0, 1.0);
      }
    `,
  });
  const quadScene = new THREE.Scene();
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), marchMaterial);
  quad.frustumCulled = false;
  quadScene.add(quad);
  renderer.setRenderTarget(picture);
  // (In strips, so no one draw runs long.)
  const strips = 8;
  for (let i = 0; i < strips; i++) {
    const y0 = Math.floor((DH * i) / strips);
    const y1 = Math.floor((DH * (i + 1)) / strips);
    picture.scissor.set(0, y0, DW, y1 - y0);
    picture.scissorTest = true;
    renderer.render(quadScene, new THREE.Camera());
  }
  picture.scissorTest = false;
  renderer.setRenderTarget(null);

  // --- That picture on a plane behind him, with the haze over it ------------
  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    premultipliedAlpha: true,
    uniforms: {
      tSmoke: { value: picture.texture },
      uRes: { value: new THREE.Vector2(RW, RH) },
      uSun: { value: new THREE.Vector2(...layout.sun) },
      uAspect: { value: ASPECT },
    },
    vertexShader: /* glsl */ `
      void main() {
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform sampler2D tSmoke;
      uniform vec2 uRes;
      uniform vec2 uSun;
      uniform float uAspect;
      ${NOISE}
      ${SKY}
      void main() {
        vec2 uv = gl_FragCoord.xy / uRes;
        vec4 s = texture2D(tSmoke, uv);
        float alpha = s.g;
        if (alpha < 0.002) discard;
        vec2 xy = uv * 2.0 - 1.0;
        float haze = ${K('haze0', 0.06)} + ${K('haze1', 0.22)} * smoothstep(-0.2, -1.0, xy.y);
        float lum = mix(s.r, skyLum(xy, uSun, uAspect) * alpha, haze);
        gl_FragColor = vec4(vec3(lum), alpha);
      }
    `,
  });
  const h = frame.half(distance);
  const plane = new THREE.Mesh(new THREE.PlaneGeometry(2 * h * ASPECT * 1.05, 2 * h * 1.05), material);
  plane.position.copy(frame.at(0, 0, distance));
  plane.quaternion.copy(frame.camera.quaternion);
  plane.renderOrder = 2;
  plane.frustumCulled = false;
  group.add(plane);

  // --- Debris flung out of it ---------------------------------------------
  const random = rng(19);
  const shardGeometry = new THREE.TetrahedronGeometry(1, 0);
  const shardMaterial = new THREE.MeshBasicMaterial({ color: 0x1c1712 });
  const yAxis = new THREE.Vector3(0, 1, 0);
  for (let i = 0; i < 190; i++) {
    const a = (random() * 1.1 - 0.05) * Math.PI; // upwards mostly
    const d = 0.65 + random() * random() * 0.8;
    const x = Math.cos(a) * d * 1.1 - 0.1;
    const y = Math.sin(a) * d * 0.9 + 0.15;
    // Some in front of the smoke, some behind it.
    const dd = distance * (random() < 0.5 ? 0.85 : 1.15);
    const unit = frame.half(dd) * spec.size;
    const s = unit * (0.004 + random() * random() * 0.024);
    const m = new THREE.Mesh(shardGeometry, shardMaterial);
    m.position.copy(frame.at(spec.at[0] + (x * spec.size) / ASPECT, spec.at[1] + y * spec.size, dd));
    if (random() < 0.35) {
      // Streaking outwards.
      const out = new THREE.Vector3().addScaledVector(frame.right, Math.cos(a)).addScaledVector(frame.up, Math.sin(a)).normalize();
      m.quaternion.setFromUnitVectors(yAxis, out);
      m.scale.set(s * 0.5, s * (2.5 + random() * 3), s * 0.5);
    } else {
      m.scale.set(s * (0.6 + random()), s * (0.4 + random()), s);
      m.rotation.set(random() * 6, random() * 6, random() * 6);
    }
    group.add(m);
  }
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

  // DEAD GROUND: capitals a fraction of STEELHEAD's, spaced wide, on a dark
  // band with torn ends and edges.
  const sub = 'DEAD GROUND';
  const subCap = RH * T.cap * T.sub;
  const subSize = (subCap / capPer100) * 100;
  const subSpacing = 0.42;
  ctx.font = `900 ${subSize}px "${font}"`;
  ctx.letterSpacing = `${(subSize * subSpacing).toFixed(1)}px`;
  const subWidth = ctx.measureText(sub).width - subSize * subSpacing;
  const bandH = subCap * 1.85;
  const bandTop = baseline + RH * T.cap * 0.13;
  const bandW = Math.max(nameWidth * T.band, subWidth + subCap * 2.6);
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
    for (let i = 0; i < 5; i++) {
      const sy = y + h * (0.1 + rand() * 0.8);
      const len = h * (0.15 + rand() * 0.35);
      const th = h * (0.06 + rand() * 0.08);
      const start = ex - side * h * 0.1;
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
