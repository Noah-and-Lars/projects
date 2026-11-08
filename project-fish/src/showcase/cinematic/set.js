// The film's set: the game's baseplate (the same grey ground, sky colour,
// haze, sun and sky light as src/world.js), a row of two concrete
// barriers for cover, a stack of ammunition crates, and the game's house
// down range, where the enemy stands. All made in code.
//
// The layout (metres): the barriers run along X at z = 0; he takes cover
// behind them (+Z) and fires towards -Z, at the enemy 13 m away. The
// crates and the house stand where the edit puts them (LAYOUT in
// edit.js).

import * as THREE from 'three';
import { SUN_DIRECTION, createHouse } from '../../world.js';
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

export function buildSet(renderer, { shadowCentre = new THREE.Vector3(1.5, 0, 0), crateSpot = { x: -6, z: 3, yaw: 0.3 }, houseSpot = { x: 1.5, z: -19 } } = {}) {
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

  // The game's house (src/world.js), its front (+Z, with the door)
  // towards the barriers.
  const house = createHouse();
  house.position.set(houseSpot.x, 0, houseSpot.z);
  house.name = 'house';
  group.add(house);

  // The ammunition crates the pistol is thrown from.
  const crates = buildCrates(rng, crateSpot);
  group.add(crates.group);

  return {
    group, sun, floor, barriers, house, crates,
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
  const sun = new THREE.Mesh(new THREE.SphereGeometry(0.45, 16, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(9, 8.3, 7.4) }));
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

// Wooden ammunition crates (US style: olive-drab plywood on a frame of
// battens, rope handles, yellow stencils, for the 124-grain full metal
// jacket 9 mm Luger the bullet cam's figures are for): two side by side and one on top. Its own
// frame: the stack's foot at the origin, the long sides along X. `top` is
// the top crate's lid's middle (in the stack's frame) and `topYaw` its
// turn, for the pistol lying on it.
export const CRATE = { w: 0.66, d: 0.38, h: 0.34, batten: 0.022 };
function buildCrates(rng, spot) {
  const group = new THREE.Group();
  group.name = 'crates';
  group.position.set(spot.x, 0, spot.z);
  group.rotation.y = spot.yaw;
  const C = CRATE;
  const wood = crateTexture(rng);
  const side = new THREE.MeshStandardMaterial({ map: wood.side, roughness: 0.85, bumpMap: wood.bump, bumpScale: 0.6 });
  const end = new THREE.MeshStandardMaterial({ map: wood.end, roughness: 0.85, bumpMap: wood.bump, bumpScale: 0.6 });
  const plain = new THREE.MeshStandardMaterial({ map: wood.plain, roughness: 0.85, bumpMap: wood.bump, bumpScale: 0.6 });
  const batten = new THREE.MeshStandardMaterial({ map: wood.plain, color: 0xd8d8d0, roughness: 0.8 });
  const rope = new THREE.MeshStandardMaterial({ color: 0x8a7a5c, roughness: 0.95 });
  const box = new THREE.BoxGeometry(C.w, C.h, C.d);
  const make = () => {
    const g = new THREE.Group();
    // (Box faces: +X, -X ends; +Y, -Y top and bottom; +Z, -Z sides.)
    const body = new THREE.Mesh(box, [end, end, plain, plain, side, side]);
    body.position.y = C.h / 2;
    g.add(body);
    // Battens round each face's edges, standing proud of the plywood.
    const b = C.batten;
    const addBar = (sx, sy, sz, x, y, z) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), batten);
      m.position.set(x, y, z);
      g.add(m);
    };
    for (const z of [-1, 1]) {
      const zz = z * (C.d / 2 + b / 4);
      addBar(C.w, b, b / 2, 0, b / 2, zz);
      addBar(C.w, b, b / 2, 0, C.h - b / 2, zz);
      for (const x of [-1, 1]) addBar(b, C.h - 2 * b, b / 2, x * (C.w / 2 - b / 2), C.h / 2, zz);
    }
    for (const x of [-1, 1]) {
      const xx = x * (C.w / 2 + b / 4);
      addBar(b / 2, b, C.d + b, xx, b / 2, 0);
      addBar(b / 2, b, C.d + b, xx, C.h - b / 2, 0);
      // A rope handle on each end, in two wooden cleats.
      const handle = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.008, 6, 16, Math.PI), rope);
      handle.rotation.set(Math.PI, Math.PI / 2, 0);
      handle.position.set(x * (C.w / 2 + 0.012), C.h * 0.62, 0);
      g.add(handle);
      for (const z of [-1, 1]) addBar(0.02, 0.035, 0.03, x * (C.w / 2 + 0.01), C.h * 0.62, z * 0.06);
    }
    // Lid battens across the top.
    for (const x of [-0.28, 0, 0.28]) addBar(0.05, b / 2, C.d, x * C.w, C.h + b / 4, 0);
    g.traverse((o) => { if (o.isMesh) o.castShadow = o.receiveShadow = true; });
    return g;
  };
  const a = make(), b = make(), top = make();
  a.position.set(0, 0, -C.d / 2 - 0.01);
  a.rotation.y = 0.02;
  b.position.set(0.03, 0, C.d / 2 + 0.01);
  b.rotation.y = -0.03;
  top.position.set(0.04, C.h + 0.003, 0.02);
  top.rotation.y = 0.12;
  group.add(a, b, top);
  // The lid's middle (the lid battens stand C.batten / 2 proud of it).
  const lid = new THREE.Vector3(-0.12, C.h + C.h + 0.003 + C.batten / 2, 0.02);
  return { group, top: lid, topYaw: 0.12 };
}

// The crates' faces: olive-drab paint over plywood grain, worn at the
// edges, with the yellow stencilled markings on the long sides and ends.
function crateTexture(rng) {
  const W = 1024, H = 512;
  const n = tileNoise(W, H, rng, [[3, 0.3], [12, 0.3], [48, 0.25], [192, 0.15]]);
  const paint = (g, stencil) => {
    const img = g.createImageData(W, H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x;
      // Grain: long bands along X, wobbling.
      const grain = 0.5 + 0.5 * Math.sin(y * 0.09 + n[i] * 9 + Math.sin(x * 0.004) * 2);
      const wear = Math.max(0, n[i] - 0.68) * 3;
      const v = 0.82 + grain * 0.1 + (rng() - 0.5) * 0.05;
      const drab = [92 * v, 96 * v, 64 * v];
      const bare = [168 * v, 140 * v, 98 * v];
      for (let c = 0; c < 3; c++) img.data[i * 4 + c] = drab[c] + (bare[c] - drab[c]) * Math.min(1, wear);
      img.data[i * 4 + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    if (!stencil) return;
    g.fillStyle = 'rgba(214,190,92,0.92)';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    for (const [text, y, size] of stencil) {
      g.font = `bold ${size}px "Courier New", Courier, monospace`;
      g.fillText(text, W / 2, y * H);
    }
  };
  const side = canvasTexture(W, H, (g) => paint(g, [
    ['1000 CARTRIDGES', 0.26, 54], ['9MM LUGER 124 GR FMJ', 0.46, 58], ['LOT 0128', 0.66, 40], ['2 CANS', 0.8, 34],
  ]));
  const end = canvasTexture(W, H, (g) => paint(g, [['9MM', 0.4, 120], ['124 GR FMJ', 0.66, 64]]));
  const plain = canvasTexture(W, H, (g) => paint(g, null));
  const bump = canvasTexture(W, H, (g) => {
    const img = g.createImageData(W, H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x;
      const v = 128 + 50 * Math.sin(y * 0.09 + n[i] * 9) * 0.5 + (rng() - 0.5) * 20;
      img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v;
      img.data[i * 4 + 3] = 255;
    }
    g.putImageData(img, 0, 0);
  }, { srgb: false });
  return { side, end, plain, bump };
}
