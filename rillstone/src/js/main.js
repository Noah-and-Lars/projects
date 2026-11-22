// M0 tech spike: three.js scene + Rapier physics worker started from a Blob URL.
import * as THREE from 'three';
import { createPhysics } from './core/physics.js';

const canvas = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x9cc6d8);
const cam = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.1, 200);
cam.position.set(6, 5, 9); cam.lookAt(0, 1, 0);
scene.add(new THREE.HemisphereLight(0xfff4e0, 0x6a7a6a, 1.2));
const sun = new THREE.DirectionalLight(0xffffff, 2.2); sun.position.set(8, 12, 5); sun.castShadow = true; scene.add(sun);
const ground = new THREE.Mesh(new THREE.BoxGeometry(20, 1, 20), new THREE.MeshStandardMaterial({ color: 0xd8c9a3 }));
ground.position.y = -0.5; ground.receiveShadow = true; scene.add(ground);

async function boot() {
const ph = await createPhysics();
await ph.call({ op: 'setStaticBox', key: 'ground', hx: 10, hy: 0.5, hz: 10, pos: [0, -0.5, 0] });
const geo = new THREE.BoxGeometry(0.5, 0.5, 0.5), mat = new THREE.MeshStandardMaterial({ color: 0xc8902c, flatShading: true });
const meshes = new Map();
for (let i = 1; i <= 40; i++) {
  ph.addBody({ id: i, shape: { type: 'box', hx: 0.25, hy: 0.25, hz: 0.25 }, pos: [(i % 5) - 2, 2 + i * 0.6, ((i * 7) % 5) - 2] });
  const m = new THREE.Mesh(geo, mat); m.castShadow = true; scene.add(m); meshes.set(i, m);
}
addEventListener('resize', () => { renderer.setSize(innerWidth, innerHeight); cam.aspect = innerWidth / innerHeight; cam.updateProjectionMatrix(); });
let last = performance.now(), acc = 0;
async function frame(now) {
  acc += Math.min(0.1, (now - last) / 1000); last = now;
  const n = Math.floor(acc * 60); acc -= n / 60;
  if (n && !ph.inFlight) await ph.step(n);
  for (const [id, m] of meshes) { const s = ph.poses.get(id); m.position.fromArray(s.p); m.quaternion.fromArray(s.q); }
  renderer.render(scene, cam);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
window.__rill = { physics: ph, ready: true };
}
boot();
