// Look prototype: ?mode=B|A&w=640&h=360&...  (see MODES below). Exposes window.api for Playwright.
import * as THREE from 'three';
import { VS, buildTestWorld } from './world.js';
import { meshChunk } from './mesher.js';
import { createVolumes, volumeUniforms, updateVolumesRegion } from './volumes.js';
import { makeVoxelMaterial } from './voxelMaterial.js';

const q = new URLSearchParams(location.search);
const W = +(q.get('w') || 640), H = +(q.get('h') || 360);
const preset = q.get('mode') || 'B';

// presets: [pipeline, material opts, renderer opts]
const MODES = {
  B0:       ['B', {}, { shadows: false }],                       // vertex AO only, no shadows
  B:        ['B', {}, { shadows: true, mapSize: 2048, radius: 3 }],// shadow map PCF + vertex AO
  B4k:      ['B', {}, { shadows: true, mapSize: 4096, radius: 3 }],
  A:        ['A', {}, {}],                                       // traced hard sun + face AO + cone AO
  Low:      ['A', { shadow: false, coneAO: false }, { shadows: true, mapSize: 2048, radius: 3 }], // shadow map + volume face AO (fallback tier, same mesh)
  Alite:    ['A', { coneMax: 32 }, {}],                          // shorter cones (3.2 m)
  Anoao:    ['A', { faceAO: false, coneAO: false }, {}],
  Aface:    ['A', { coneAO: false }, {}],
  Anosun:   ['A', { shadow: false }, {}],
  Adyn:     ['A', {}, { dynShadows: true, mapSize: 1024, radius: 2 }], // traced world + shadow map for dynamic debris only
  Bdyn:     ['B', {}, { shadows: true, mapSize: 2048, radius: 3, debris: true }],
  Asoft:    ['A', { sunSpread: 0.06 }, { accumulate: true }],    // jittered sun -> soft (accumulated)
  Aray:     ['A', { faceAO: false, coneAO: false, rayAO: 4, rayAORange: 24 }, { accumulate: true }],
  Aray1:    ['A', { faceAO: false, coneAO: false, rayAO: 1, rayAORange: 24 }, { accumulate: true }],
  Afull:    ['A', { sunSpread: 0.06, faceAO: true, coneAO: false, rayAO: 2, rayAORange: 32 }, { accumulate: true }],
};
const [pipe, mopts0, ropts] = MODES[preset];
const mopts = { ...mopts0, debugAO: q.get('dbg') === 'ao', aoStrength: q.has('aos') ? +q.get('aos') : mopts0.aoStrength };

const renderer = new THREE.WebGLRenderer({ antialias: false, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(1);
renderer.setSize(W, H);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
document.body.style.margin = '0';
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const sky = new THREE.Color().setRGB(0.55, 0.68, 0.85, THREE.SRGBColorSpace);
scene.background = sky;
scene.fog = new THREE.Fog(sky, 25, 70);

const camera = new THREE.PerspectiveCamera(55, W / H, 0.05, 200);
camera.position.set(+(q.get('cx') || 18.5), +(q.get('cy') || 6.5), +(q.get('cz') || -6.0));
camera.lookAt(+(q.get('tx') || 9), +(q.get('ty') || 1.5), +(q.get('tz') || 6));

// ---- world + meshing ----
const t0 = performance.now();
const world = buildTestWorld(256, 96, 256);
const tWorld = performance.now() - t0;
const origin = new THREE.Vector3(0, 0, 0);

const t1 = performance.now();
const vol = pipe === 'A' ? createVolumes(world) : null;
const tVol = performance.now() - t1;

const material = makeVoxelMaterial(pipe, {
  ...mopts,
  volumeUniforms: vol ? volumeUniforms(world, vol, VS, origin) : { uVolOrigin: { value: origin }, uVoxelSize: { value: VS } },
});

const CS = 32; const chunks = new Map();
let quads = 0;
function buildChunk(cx, cy, cz) {
  const key = cx + ',' + cy + ',' + cz;
  const old = chunks.get(key);
  if (old) { scene.remove(old); old.geometry.dispose(); chunks.delete(key); }
  const m = meshChunk(world, cx * CS, cy * CS, cz * CS, CS, pipe === 'B', q.has('inflate') ? +q.get('inflate') : 0.01);
  if (!m || m.quads === 0) return 0;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(m.pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(m.nrm, 3));
  g.setAttribute('mat', new THREE.BufferAttribute(m.mat, 1));
  g.setAttribute('aoBake', new THREE.BufferAttribute(m.ao, 1));
  g.setIndex(new THREE.BufferAttribute(m.idx, 1));
  g.boundingBox = new THREE.Box3(new THREE.Vector3(cx * CS, cy * CS, cz * CS), new THREE.Vector3((cx + 1) * CS, (cy + 1) * CS, (cz + 1) * CS));
  g.boundingSphere = g.boundingBox.getBoundingSphere(new THREE.Sphere());
  const mesh = new THREE.Mesh(g, material);
  mesh.scale.setScalar(VS); mesh.position.copy(origin);
  mesh.castShadow = !!ropts.shadows;            // in Adyn the WORLD never casts into the shadow map
  mesh.receiveShadow = !!(ropts.shadows || ropts.dynShadows);
  scene.add(mesh); chunks.set(key, mesh);
  return m.quads;
}
const t2 = performance.now();
for (let cz = 0; cz < world.nz / CS; cz++) for (let cy = 0; cy < world.ny / CS; cy++) for (let cx = 0; cx < world.nx / CS; cx++) quads += buildChunk(cx, cy, cz);
const tMesh = performance.now() - t2;

// ---- lights ----
const sunDir = new THREE.Vector3(+(q.get('sx') || 0.75), +(q.get('sy') || 0.55), +(q.get('sz') || -0.37)).normalize();
const sun = new THREE.DirectionalLight(new THREE.Color().setRGB(1.0, 0.92, 0.80, THREE.SRGBColorSpace), 2.6);
sun.position.copy(sunDir).multiplyScalar(30).add(new THREE.Vector3(12.8, 0, 12.8));
sun.target.position.set(12.8, 0, 12.8);
scene.add(sun, sun.target);
const hemi = new THREE.HemisphereLight(sky.clone(), new THREE.Color().setRGB(0.40, 0.36, 0.30, THREE.SRGBColorSpace), 1.1);
scene.add(hemi);
if (ropts.shadows) {
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap; // r187: PCFSoftShadowMap was removed (falls back to PCF)
  sun.castShadow = true;
  sun.shadow.mapSize.set(ropts.mapSize, ropts.mapSize);
  const s = 19; Object.assign(sun.shadow.camera, { left: -s, right: s, top: s, bottom: -s, near: 1, far: 70 });
  sun.shadow.camera.updateProjectionMatrix();
  sun.shadow.radius = ropts.radius;
  sun.shadow.bias = -0.0005;
  sun.shadow.normalBias = 0.02;
}

// ---- dynamic debris (rotated rigid bodies, not in the occupancy volume) ----
if (ropts.dynShadows || ropts.debris) {
  const dm = new THREE.MeshLambertMaterial({ color: new THREE.Color().setRGB(0.45, 0.30, 0.2, THREE.SRGBColorSpace) });
  for (let i = 0; i < 6; i++) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(0.5 + 0.1 * i, 0.3, 0.4), dm);
    b.position.set(5.0 + i * 0.75, 0.75 + (i % 2) * 0.9, 0.6 + (i % 3) * 0.35);
    b.rotation.set(i * 0.7, i * 1.3, i * 0.4);
    b.castShadow = b.receiveShadow = true;
    scene.add(b);
  }
}
if (ropts.dynShadows) {
  // shadow map only renders castShadow objects = debris; tight frustum around the action/camera
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap;
  sun.castShadow = true; sun.shadow.mapSize.set(ropts.mapSize, ropts.mapSize);
  sun.position.copy(sunDir).multiplyScalar(20).add(new THREE.Vector3(7, 0, 2)); sun.target.position.set(7, 0, 2);
  const s = 6; Object.assign(sun.shadow.camera, { left: -s, right: s, top: s, bottom: -s, near: 1, far: 40 });
  sun.shadow.camera.updateProjectionMatrix(); sun.shadow.radius = ropts.radius;
  sun.shadow.bias = -0.0005; sun.shadow.normalBias = 0.02;
}

// ---- progressive accumulation (static camera only; for stochastic modes) ----
let accum = null;
if (ropts.accumulate && !q.has('noacc')) {
  const opt = { type: THREE.HalfFloatType, depthBuffer: true };
  accum = { cur: new THREE.WebGLRenderTarget(W, H, opt), a: new THREE.WebGLRenderTarget(W, H, opt), b: new THREE.WebGLRenderTarget(W, H, opt), n: 0 };
  const blendMat = new THREE.ShaderMaterial({
    uniforms: { tCur: { value: null }, tPrev: { value: null }, uW: { value: 1 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
    fragmentShader: 'uniform sampler2D tCur, tPrev; uniform float uW; varying vec2 vUv; void main(){ gl_FragColor = mix(texture2D(tPrev, vUv), texture2D(tCur, vUv), uW); }',
    depthTest: false, depthWrite: false,
  });
  const outMat = new THREE.ShaderMaterial({
    uniforms: { tSrc: { value: null } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
    fragmentShader: 'uniform sampler2D tSrc; varying vec2 vUv; void main(){ gl_FragColor = texture2D(tSrc, vUv);\n#include <tonemapping_fragment>\n#include <colorspace_fragment>\n}',
    depthTest: false, depthWrite: false, toneMapped: true,
  });
  const fsScene = new THREE.Scene(); const fsQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), blendMat); fsQuad.frustumCulled = false; fsScene.add(fsQuad);
  const fsCam = new THREE.Camera();
  accum.render = () => {
    renderer.setRenderTarget(accum.cur); renderer.render(scene, camera);
    fsQuad.material = blendMat; blendMat.uniforms.tCur.value = accum.cur.texture; blendMat.uniforms.tPrev.value = accum.a.texture;
    blendMat.uniforms.uW.value = 1 / (accum.n + 1);
    renderer.setRenderTarget(accum.b); renderer.render(fsScene, fsCam);
    [accum.a, accum.b] = [accum.b, accum.a]; accum.n++;
    fsQuad.material = outMat; outMat.uniforms.tSrc.value = accum.a.texture;
    renderer.setRenderTarget(null); renderer.render(fsScene, fsCam);
  };
}

let frame = 0;
// optional depth pre-pass (?pre=1): lay down depth with a cheap colorWrite:false material so the
// expensive traced fragment shader only runs once per pixel (early-z, LessEqualDepth).
const prepassMat = new THREE.MeshBasicMaterial({ colorWrite: false });
function renderScene() {
  if (q.get('pre') === '1') {
    scene.overrideMaterial = prepassMat; const bg = scene.background; scene.background = null;
    renderer.render(scene, camera);
    scene.overrideMaterial = null; scene.background = bg;
    const ac = renderer.autoClear; renderer.autoClear = false; renderer.clearColor();
    renderer.render(scene, camera); renderer.autoClear = ac;
  } else renderer.render(scene, camera);
}
function renderOnce() {
  material.userData.uniforms.uFrame.value = frame++ % 64;
  if (accum) accum.render(); else renderScene();
}
const gl = renderer.getContext();
const px = new Uint8Array(4);
function sync() { gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); }

window.api = {
  info: () => ({ preset, pipe, W, H, quads, chunks: chunks.size, tWorld, tVol, tMesh, renderer: gl.getParameter(gl.RENDERER), programs: renderer.info.programs.length, calls: renderer.info.render.calls, tris: renderer.info.render.triangles }),
  render: (n = 1) => { for (let i = 0; i < n; i++) renderOnce(); sync(); },
  // average ms/frame, synced with a 1px readPixels each frame (SwiftShader: relative numbers only)
  bench: (n = 10) => { renderOnce(); sync(); const t = performance.now(); for (let i = 0; i < n; i++) { renderOnce(); sync(); } return (performance.now() - t) / n; },
  resetAccum: () => { if (accum) accum.n = 0; },
  // destruction test: carve a sphere, re-mesh touched chunks, update volumes with texSubImage3D
  blast: (x, y, z, r) => {
    const t = performance.now();
    const bb = world.sphere(x, y, z, r, 0);
    const tA = performance.now();
    if (vol) updateVolumesRegion(renderer, world, vol, bb[0], bb[1], bb[2], bb[3], bb[4], bb[5]);
    sync();
    const tB = performance.now();
    for (let cz = Math.floor((bb[2] - 1) / CS); cz <= Math.floor(bb[5] / CS); cz++)
      for (let cy = Math.floor((bb[1] - 1) / CS); cy <= Math.floor(bb[4] / CS); cy++)
        for (let cx = Math.floor((bb[0] - 1) / CS); cx <= Math.floor(bb[3] / CS); cx++)
          if (cx >= 0 && cy >= 0 && cz >= 0 && cx < world.nx / CS && cy < world.ny / CS && cz < world.nz / CS) buildChunk(cx, cy, cz);
    const tC = performance.now();
    if (accum) accum.n = 0;
    return { carveMs: tA - t, volumeUpdateMs: tB - tA, remeshMs: tC - tB };
  },
  setCamera: (p, t) => { camera.position.set(...p); camera.lookAt(...t); if (accum) accum.n = 0; },
};
window.ready = true;
