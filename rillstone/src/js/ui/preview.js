// Turning 3D previews for shop and Machine Shop entries: each entry gets a
// small canvas showing the real model (machine, tool or vehicle) spinning
// slowly. One small renderer of its own draws the visible ones in turn and
// copies each frame into that entry's canvas, so a long catalogue costs a
// handful of tiny draws a frame and nothing while the panel is shut.
import * as THREE from 'three';
import { loadSettings } from '../core/settings.js';
import { MACHINES } from '../defs/machines.js';
import { beltSurface } from '../defs/machines2.js';
import { VEHICLES, vehicleBody, wheel } from '../defs/vehicles.js';
import { toolGeometry } from '../defs/items.js';
import { EXTRA_MESH } from '../game/items.js';
import { paint, merge } from '../render/geom.js';

const SIZE = 192;      // pixels the renderer draws (the canvases show it at half size, crisp on high-DPI)
const TURN = 0.55;     // radians a second

// The model for a catalogue entry: { spawn, data } as in defs/shops.js and
// defs/progression.js. Returns a geometry (vertex-coloured) or null.
export function entryGeometry(spawn, data = {}) {
  try {
    if (spawn === 'crate' && data.def && Object.hasOwn(MACHINES, data.def)) {
      const def = MACHINES[data.def], g = def.build({});
      // Belts draw their moving surface separately in the world: add it here.
      if (def.role === 'belt' && def.lanes) return merge([g, ...def.lanes.map(l => paint(beltSurface(l).toNonIndexed(), 0x2c2e33, 0.04))]);
      return g;
    }
    if (spawn === 'vehicle' && data.type && Object.hasOwn(VEHICLES, data.type)) {
      const def = VEHICLES[data.type], parts = [vehicleBody(def.model)];
      if (!def.skid) for (const [x, y, z] of def.wheels || []) parts.push(wheel(def.wheelR).clone().translate(x, y - (def.suspRest || 0), z));
      return merge(parts.map(p => (p.index ? p.toNonIndexed() : p)));
    }
    const e = { id: 1, type: spawn, data: { ...data }, pos: [0, 0, 0] };
    if (EXTRA_MESH[spawn]) return EXTRA_MESH[spawn](e);
    return toolGeometry(spawn, data);
  } catch (_) { return null; }
}

export function createPreviews({ settings } = {}) {
  let renderer = null, failed = false, running = false, last = 0;
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xfff4e0, 0x55606a, 1.6));
  const sun = new THREE.DirectionalLight(0xffffff, 2.2); sun.position.set(3, 5, 4); scene.add(sun);
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.7, metalness: 0.05 });
  const pivot = new THREE.Group(), mesh = new THREE.Mesh(new THREE.BufferGeometry(), mat); pivot.add(mesh); scene.add(pivot);
  const cam = new THREE.PerspectiveCamera(28, 1, 0.01, 500);
  const cache = new Map(), live = new Set();
  const io = typeof IntersectionObserver !== 'undefined' ? new IntersectionObserver((list) => { for (const e of list) if (e.target._pv) e.target._pv.visible = e.isIntersecting; }) : null;

  function geometry(key, make) {
    if (cache.has(key)) return cache.get(key);
    const g = make(); if (g) { g.computeBoundingSphere(); g.computeBoundingBox(); }
    cache.set(key, g); return g;
  }
  function ensureRenderer() {
    if (renderer || failed) return !!renderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true, powerPreference: 'low-power' });
      renderer.setPixelRatio(1); renderer.setSize(SIZE, SIZE, false); renderer.setClearColor(0x000000, 0);
      renderer.outputColorSpace = THREE.SRGBColorSpace;
    } catch (_) { failed = true; renderer = null; }
    return !!renderer;
  }
  function draw(v, t) {
    const g = geometry(v.key, v.make); if (!g) return false;
    mesh.geometry = g;
    const bb = g.boundingBox, c = bb.getCenter(new THREE.Vector3()), r = Math.max(0.05, g.boundingSphere.radius);
    mesh.position.copy(c).negate();
    pivot.rotation.y = v.phase + t * TURN;
    const dist = r / Math.sin(THREE.MathUtils.degToRad(cam.fov / 2)) * 1.02;
    cam.position.set(0, dist * 0.42, dist * 0.91); cam.lookAt(0, 0, 0);
    renderer.render(scene, cam);
    const ctx = v.canvas.getContext('2d'); ctx.clearRect(0, 0, v.canvas.width, v.canvas.height);
    ctx.drawImage(renderer.domElement, 0, 0, v.canvas.width, v.canvas.height);
    return true;
  }
  function loop(now) {
    for (const v of [...live]) if (!v.canvas.isConnected) { live.delete(v); io?.unobserve(v.canvas); }
    if (!live.size) { running = false; return; }
    requestAnimationFrame(loop);
    // Very low graphics: fewer preview frames.
    const fps = settings?.graphics === 'verylow' ? 10 : 30;
    if (now - last < 1000 / fps) return; last = now;
    if (!ensureRenderer()) return;
    const t = now / 1000;
    for (const v of live) if (v.visible !== false) draw(v, t);
  }
  return {
    // A canvas showing `make()`'s model turning (key caches the geometry).
    canvas(key, make, cls = 'pv') {
      const c = document.createElement('canvas'); c.width = SIZE; c.height = SIZE; c.className = cls;
      const v = { canvas: c, key, make, phase: (key.length * 1.7) % 6.28, visible: true };
      c._pv = v; live.add(v); io?.observe(c);
      // Draw once straight away so it never shows empty.
      if (ensureRenderer()) draw(v, performance.now() / 1000);
      if (!running) { running = true; requestAnimationFrame(loop); }
      return c;
    },
    entry(spawn, data, cls) { return this.canvas(`${spawn}:${JSON.stringify(data || {})}`, () => entryGeometry(spawn, data), cls); },
    get ok() { return !failed; },
  };
}

// One shared set of previews for every shop panel.
let shared = null;
export const previews = () => (shared ||= createPreviews({ settings: loadSettings() }));
