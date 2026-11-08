// The film's set: the game's baseplate (the same grey ground, sky colour,
// haze, sun and sky light as src/world.js), a row of two concrete
// barriers for cover, and a steel target hanging on a stand down range.
// All made in code.
//
// The layout (metres): the barriers run along X at z = 0; he takes cover
// behind them (+Z) and fires towards -Z, at the plate 12 m away.

import * as THREE from 'three';
import { SUN_DIRECTION } from '../../world.js';
import { canvasTexture, seeded, tileNoise } from './util.js';

// The game's colours (src/world.js).
const SKY_COLOR = 0xb8c6d4;
const FLOOR_COLOR = 0x8c8c8c;

// A New Jersey barrier's profile (half of it, [x, y]): 610 mm wide at the
// base, 810 mm tall, 150 mm across the top; a 75 mm upright toe, a 55°
// slope up to 330 mm, then an 84° face to the top. Sections are 3.05 m
// (10 ft) long.
const JERSEY = [[0.305, 0], [0.305, 0.075], [0.126, 0.33], [0.075, 0.81]];
export const BARRIER = { height: 0.81, top: 0.075, base: 0.305, length: 3.05, gap: 0.03 };

// The target: a 12 in (305 mm) round plate of 3/8 in (9.5 mm) steel,
// painted white, hanging on two short chains from the crossbar of a stand.
export const TARGET = {
  at: new THREE.Vector3(0.3, 0, -12),
  radius: 0.1525,
  thick: 0.0095,
  barY: 1.5, // the crossbar's top
  chain: 0.2,
  stand: 0.95, // half the distance between the uprights
};
TARGET.centreY = TARGET.barY - 0.025 - TARGET.chain - 0.03 - TARGET.radius;

export function buildSet(renderer, { shadowCentre = new THREE.Vector3(1.5, 0, 0), sky = null } = {}) {
  const group = new THREE.Group();
  group.name = 'set';
  const rng = seeded(9119);

  // Sky and haze: the game's flat sky colour at the horizon, a touch
  // bluer overhead (a dome, so the camera can look up), and its fog.
  const dome = new THREE.SphereGeometry(400, 48, 24);
  const colors = [];
  const horizon = new THREE.Color(SKY_COLOR), zenith = new THREE.Color(0x9db4cc), ground = new THREE.Color(SKY_COLOR);
  for (let i = 0; i < dome.attributes.position.count; i++) {
    const up = dome.attributes.position.getY(i) / 400;
    const c = up > 0 ? horizon.clone().lerp(zenith, Math.pow(up, 0.7)) : ground;
    colors.push(c.r, c.g, c.b);
  }
  dome.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  const skyMesh = new THREE.Mesh(dome, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false }));
  skyMesh.renderOrder = -1;
  group.add(skyMesh);

  // The game's lights: sky light and the sun (casting shadows over the
  // action).
  group.add(new THREE.HemisphereLight(0xffffff, 0x5a5a5a, 1.2));
  const sun = new THREE.DirectionalLight(0xffffff, 1.6);
  sun.position.copy(shadowCentre).addScaledVector(SUN_DIRECTION, 40);
  sun.target.position.copy(shadowCentre);
  sun.castShadow = true;
  sun.shadow.mapSize.set(4096, 4096);
  const half = 16;
  Object.assign(sun.shadow.camera, { left: -half, right: half, top: half, bottom: -half, near: 5, far: 90 });
  sun.shadow.bias = -0.0003;
  sun.shadow.normalBias = 0.015;
  group.add(sun, sun.target);
  // The baseplate: the game's grey, with a faint grain so movement over it
  // reads in the close, fast shots.
  const floorTex = canvasTexture(1024, 1024, (g, w, h) => {
    const n = tileNoise(w, h, rng, [[6, 0.35], [24, 0.3], [96, 0.2], [384, 0.15]]);
    const img = g.createImageData(w, h);
    for (let i = 0; i < w * h; i++) {
      const v = 128 + (n[i] - 0.5) * 34 + (rng() - 0.5) * 10;
      img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v;
      img.data[i * 4 + 3] = 255;
    }
    g.putImageData(img, 0, 0);
  }, { srgb: false, repeat: true });
  floorTex.repeat.set(1600 / 6, 1600 / 6);
  // (The texture is a grain around mid grey: multiplied in, it keeps the
  // game's floor colour on average.)
  const floorMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(FLOOR_COLOR).multiplyScalar(1.0), roughness: 1, metalness: 0, map: floorTex });
  floorMat.onBeforeCompile = (shader) => {
    // Grain around mid grey, not darkening the floor: 2x the map.
    shader.fragmentShader = shader.fragmentShader.replace('#include <map_fragment>', `
      #ifdef USE_MAP
        vec4 sampledDiffuseColor = texture2D( map, vMapUv );
        diffuseColor.rgb *= sampledDiffuseColor.rgb * 2.0;
      #endif`);
  };
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(1600, 1600), floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  floor.name = 'floor';
  group.add(floor);

  // The barriers.
  const concrete = concreteMaterial(rng);
  const barriers = new THREE.Group();
  barriers.name = 'barriers';
  for (const side of [-1, 1]) {
    const b = jerseyBarrier(concrete, rng);
    b.position.x = side * (BARRIER.length + BARRIER.gap) / 2;
    b.rotation.y = side * 0.012;
    barriers.add(b);
  }
  group.add(barriers);

  const target = buildTarget(rng);
  group.add(target.group);

  return {
    group, sun, floor, barriers, target,
    fog: new THREE.Fog(SKY_COLOR, 60, 900),
    background: new THREE.Color(SKY_COLOR),
  };
}

// Concrete: pale grey with pores, a few stains and the dirt splashed up
// round its foot.
function concreteMaterial(rng) {
  const W = 1024, H = 512;
  const n = tileNoise(W, H, rng, [[4, 0.3], [16, 0.3], [64, 0.25], [256, 0.15]]);
  const map = canvasTexture(W, H, (g) => {
    const img = g.createImageData(W, H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x;
      let v = 168 + (n[i] - 0.5) * 46 + (rng() - 0.5) * 14;
      // Dirt near the bottom (v is the texture's height on the barrier).
      const fromFoot = y / H;
      v -= 30 * Math.max(0, fromFoot - 0.82) / 0.18 * (0.6 + n[i]);
      img.data[i * 4] = v * 1.0;
      img.data[i * 4 + 1] = v * 0.985;
      img.data[i * 4 + 2] = v * 0.95;
      img.data[i * 4 + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    // Pores and chips.
    for (let k = 0; k < 2600; k++) {
      g.fillStyle = `rgba(60,58,54,${0.15 + rng() * 0.35})`;
      g.beginPath();
      g.arc(rng() * W, rng() * H, 0.4 + rng() * 1.6, 0, Math.PI * 2);
      g.fill();
    }
    // Rain streaks down from the top.
    for (let k = 0; k < 40; k++) {
      const x = rng() * W;
      const grad = g.createLinearGradient(0, 0, 0, H * (0.2 + rng() * 0.5));
      grad.addColorStop(0, 'rgba(70,68,62,0.18)');
      grad.addColorStop(1, 'rgba(70,68,62,0)');
      g.fillStyle = grad;
      g.fillRect(x, 0, 3 + rng() * 10, H);
    }
  }, { repeat: true });
  const bump = canvasTexture(W, H, (g) => {
    const img = g.createImageData(W, H);
    for (let i = 0; i < W * H; i++) {
      const v = 128 + (n[i] - 0.5) * 60 + (rng() - 0.5) * 60;
      img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v;
      img.data[i * 4 + 3] = 255;
    }
    g.putImageData(img, 0, 0);
  }, { srgb: false, repeat: true });
  return new THREE.MeshStandardMaterial({ map, bumpMap: bump, bumpScale: 1.2, roughness: 0.92, metalness: 0 });
}

// One barrier section along X, its foot on the ground, centred.
function jerseyBarrier(material, rng) {
  const shape = new THREE.Shape();
  const pts = [...JERSEY.map(([x, y]) => [x, y]), ...JERSEY.slice().reverse().map(([x, y]) => [-x, y])];
  shape.moveTo(pts[0][0], pts[0][1]);
  for (const [x, y] of pts.slice(1)) shape.lineTo(x, y);
  shape.closePath();
  const L = BARRIER.length;
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: L - 0.04, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.012, bevelSegments: 2, curveSegments: 1,
  });
  // (Extruded along +Z: turned to run along X, centred.)
  geometry.translate(0, 0, -(L - 0.04) / 2);
  geometry.rotateY(Math.PI / 2);
  // Texture coordinates: along the barrier and up it, a metre a repeat.
  const pos = geometry.attributes.position, nor = geometry.attributes.normal;
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const end = Math.abs(nor.getX(i)) > 0.7;
    uv[i * 2] = (end ? z : x) / 1.6 + 0.37 * (rng() * 0); // across
    uv[i * 2 + 1] = 1 - y / 0.81; // (1 at the foot: the dirt)
  }
  geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geometry.computeVertexNormals();
  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = mesh.receiveShadow = true;
  const g = new THREE.Group();
  g.add(mesh);
  // Two lifting loops of rebar on top.
  const steel = new THREE.MeshStandardMaterial({ color: 0x4a3f36, roughness: 0.7, metalness: 0.6 });
  const loop = new THREE.TorusGeometry(0.05, 0.007, 8, 16, Math.PI);
  for (const x of [-0.9, 0.9]) {
    const m = new THREE.Mesh(loop, steel);
    m.position.set(x, BARRIER.height - 0.002, 0);
    m.castShadow = true;
    g.add(m);
  }
  return g;
}

// The steel target on its stand.
function buildTarget(rng) {
  const T = TARGET;
  const group = new THREE.Group();
  group.name = 'target';
  group.position.copy(T.at);
  const tube = new THREE.MeshStandardMaterial({ color: 0x2c3034, roughness: 0.55, metalness: 0.7 });
  const add = (geo, mat, x, y, z) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.castShadow = m.receiveShadow = true;
    group.add(m);
    return m;
  };
  // Two uprights of 50 mm square tube on wide feet, a crossbar over them.
  const s = 0.05;
  for (const x of [-T.stand, T.stand]) {
    add(new THREE.BoxGeometry(s, T.barY, s), tube, x, T.barY / 2, 0);
    add(new THREE.BoxGeometry(s * 1.1, s * 0.8, 0.9), tube, x, s * 0.4, 0);
    // Braces from the foot up the upright.
    for (const dz of [-1, 1]) {
      const brace = add(new THREE.BoxGeometry(0.03, 0.42, 0.03), tube, x, 0.17, dz * 0.14);
      brace.rotation.x = dz * 0.78;
    }
  }
  add(new THREE.BoxGeometry(T.stand * 2 + 0.12, s, s), tube, 0, T.barY - s / 2, 0);

  // The swinging part: chains and plate turn together about the crossbar.
  const pivot = new THREE.Group();
  pivot.name = 'plate-pivot';
  pivot.position.set(0, T.barY - s / 2, 0);
  group.add(pivot);
  const chainMat = new THREE.MeshStandardMaterial({ color: 0x8d8f91, roughness: 0.35, metalness: 1 });
  const link = new THREE.TorusGeometry(0.009, 0.0028, 6, 14);
  link.scale(1, 1.55, 1);
  const linkCount = Math.round(T.chain / 0.02);
  const chainX = T.radius * 0.62;
  for (const x of [-chainX, chainX]) {
    // A bolt-on hanger round the bar, then the chain.
    const hook = new THREE.Mesh(new THREE.TorusGeometry(0.035, 0.005, 8, 18), chainMat);
    hook.position.set(x, 0, 0);
    hook.rotation.y = Math.PI / 2;
    hook.castShadow = true;
    pivot.add(hook);
    for (let i = 0; i < linkCount; i++) {
      const m = new THREE.Mesh(link, chainMat);
      m.position.set(x, -0.035 - 0.012 - i * 0.02, 0);
      m.rotation.y = i % 2 ? Math.PI / 2 : 0;
      m.castShadow = true;
      pivot.add(m);
    }
  }
  // The plate (its face towards +Z, the shooter), painted white, worn,
  // with the grey splashes of earlier hits; the edge and back bare steel.
  const paint = plateTexture(rng);
  const face = new THREE.MeshStandardMaterial({ map: paint.map, roughness: 0.62, metalness: 0.05, roughnessMap: paint.rough });
  const steel = new THREE.MeshStandardMaterial({ color: 0x3a3c3e, roughness: 0.5, metalness: 0.85 });
  const plateGeo = new THREE.CylinderGeometry(T.radius, T.radius, T.thick, 72, 1);
  plateGeo.rotateX(Math.PI / 2);
  const plate = new THREE.Mesh(plateGeo, [steel, face, steel]);
  // (Cylinder groups: 0 the side, 1 the +Y cap, 2 the -Y cap; turned, the
  // +Y cap faces +Z.)
  const plateY = -(T.barY - s / 2) + T.centreY;
  plate.position.set(0, plateY, 0);
  plate.castShadow = plate.receiveShadow = true;
  plate.name = 'plate';
  pivot.add(plate);
  // Two tabs at the top where the chains are bolted.
  for (const x of [-chainX, chainX]) {
    const tab = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.05, T.thick), steel);
    tab.position.set(x, plateY + T.radius * Math.sqrt(1 - 0.62 * 0.62) + 0.012, 0);
    tab.castShadow = true;
    pivot.add(tab);
  }
  return { group, pivot, plate, faceZ: T.thick / 2, plateY, centre: new THREE.Vector3(T.at.x, T.centreY, T.at.z + T.thick / 2) };
}

function plateTexture(rng) {
  const N = 1024;
  const n = tileNoise(N, N, rng, [[6, 0.4], [24, 0.35], [96, 0.25]]);
  const splashes = [];
  for (let k = 0; k < 6; k++) {
    const a = rng() * Math.PI * 2, r = Math.sqrt(rng()) * 0.62;
    splashes.push([0.5 + Math.cos(a) * r * 0.5, 0.5 + Math.sin(a) * r * 0.5, 0.025 + rng() * 0.03]);
  }
  const map = canvasTexture(N, N, (g) => {
    const img = g.createImageData(N, N);
    for (let i = 0; i < N * N; i++) {
      const v = 226 + (n[i] - 0.5) * 30;
      img.data[i * 4] = v;
      img.data[i * 4 + 1] = v * 0.99;
      img.data[i * 4 + 2] = v * 0.96;
      img.data[i * 4 + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    for (const [x, y, r] of splashes) drawSplash(g, x * N, y * N, r * N * 0.8, rng, 0.32);
  });
  const rough = canvasTexture(N, N, (g) => {
    g.fillStyle = '#a0a0a0';
    g.fillRect(0, 0, N, N);
    for (const [x, y, r] of splashes) {
      g.fillStyle = '#505050';
      g.beginPath();
      g.arc(x * N, y * N, r * N * 0.6, 0, Math.PI * 2);
      g.fill();
    }
  }, { srgb: false });
  return { map, rough };
}

// A bullet's splash on painted steel: the lead smeared out from a dark
// centre in a star of rays, the paint knocked off round it.
export function drawSplash(g, x, y, r, rng, strength = 1) {
  g.save();
  g.translate(x, y);
  g.globalAlpha = strength;
  // Bare steel where the paint flaked off.
  g.fillStyle = 'rgba(120,122,124,0.9)';
  g.beginPath();
  for (let i = 0; i <= 40; i++) {
    const a = (i / 40) * Math.PI * 2;
    const rr = r * (0.75 + rng() * 0.35);
    g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
  }
  g.fill();
  // Rays of lead.
  for (let i = 0; i < 30; i++) {
    const a = rng() * Math.PI * 2;
    const len = r * (0.7 + rng() * 0.9);
    g.strokeStyle = `rgba(92,95,100,${0.3 + rng() * 0.45})`;
    g.lineWidth = r * (0.02 + rng() * 0.05);
    g.beginPath();
    g.moveTo(Math.cos(a) * r * 0.15, Math.sin(a) * r * 0.15);
    g.lineTo(Math.cos(a) * len, Math.sin(a) * len);
    g.stroke();
  }
  const core = g.createRadialGradient(0, 0, 0, 0, 0, r * 0.55);
  core.addColorStop(0, 'rgba(70,72,76,1)');
  core.addColorStop(0.6, 'rgba(105,108,112,0.9)');
  core.addColorStop(1, 'rgba(90,92,96,0)');
  g.fillStyle = core;
  g.beginPath();
  g.arc(0, 0, r * 0.55, 0, Math.PI * 2);
  g.fill();
  g.restore();
}

// The sky the film's metal reflects: the game's outdoor reflections
// (src/world.js outdoorEnvironment) with more contrast for the close-ups,
// a bright horizon, a darker ground and a hot sun, so polished copper and
// brass show crisp highlights and dark edges as they do outside.
export function filmEnvironment(renderer, sunDirection) {
  const scene = new THREE.Scene();
  const dome = new THREE.SphereGeometry(10, 96, 48);
  const sky = new THREE.Color(0.22, 0.34, 0.6);
  const horizon = new THREE.Color(0.95, 0.97, 1.0);
  const ground = new THREE.Color(0.07, 0.07, 0.075);
  const colors = [];
  const position = dome.attributes.position;
  for (let i = 0; i < position.count; i++) {
    const up = position.getY(i) / 10;
    const c = up > 0 ? horizon.clone().lerp(sky, Math.pow(up, 0.3)) : horizon.clone().lerp(ground, Math.min(1, -up * 22));
    colors.push(c.r, c.g, c.b);
  }
  dome.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  scene.add(new THREE.Mesh(dome, new THREE.MeshBasicMaterial({ side: THREE.BackSide, vertexColors: true })));
  const sun = new THREE.Mesh(new THREE.SphereGeometry(0.45, 16, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(20, 18.5, 16.5) }));
  sun.position.copy(sunDirection).multiplyScalar(9);
  scene.add(sun);
  // A pale wall low on the far side, for a second, softer highlight.
  const card = new THREE.Mesh(new THREE.PlaneGeometry(6, 1.6), new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 2.2, 2.2), side: THREE.DoubleSide }));
  card.position.copy(sunDirection).multiplyScalar(-8.5).setY(1.2);
  card.lookAt(0, 0, 0);
  scene.add(card);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const texture = pmrem.fromScene(scene, 0).texture;
  pmrem.dispose();
  dome.dispose();
  return texture;
}
