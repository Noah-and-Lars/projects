// Tidewright entry: one renderer, two screens (Yard editor and island Test drive).
import './ui/style.css';
import * as THREE from 'three';
import { makeRenderer, QualityGovernor } from './render/world-view';
import { Yard } from './editor/yard';
import { World } from './game/world';
import { DriveSession } from './game/drive';
import { PhysicsClient } from './physics/client';
import { DEFAULT_TERRAIN } from './sim-core/terrain';
import { requestPersist } from './storage/db';
import { toast } from './ui/dom';
import type { VehicleFile } from './sim-core/vehicle-format';

const canvas = document.getElementById('view') as HTMLCanvasElement;
const overlay = document.getElementById('ui')!;
const bootMsg = document.getElementById('boot-msg')!;
const renderer = makeRenderer(canvas);
const governor = new QualityGovernor(renderer);

const yard = new Yard(canvas, overlay);
let world: World | null = null;
let physics: PhysicsClient | null = null;
let drive: DriveSession | null = null;
let mode: 'yard' | 'drive' = 'yard';

yard.thumbRequest = () => {
  renderer.render(yard.scene, yard.camera);
  const c = document.createElement('canvas');
  c.width = 160; c.height = 100;
  c.getContext('2d')!.drawImage(canvas, 0, 0, 160, 100);
  return c.toDataURL('image/png');
};

async function startTest(file: VehicleFile) {
  const boot = document.getElementById('boot')!;
  boot.style.display = '';
  bootMsg.textContent = 'Charting the island…';
  await new Promise((r) => setTimeout(r, 30));
  try {
    if (!world) world = new World();
    if (!physics) {
      physics = new PhysicsClient();
      physics.onError = (m) => { console.error(m); toast('Physics error: ' + m.split('\n')[0], 'error'); };
      physics.send({ type: 'init', terrain: DEFAULT_TERRAIN });
      bootMsg.textContent = 'Starting the physics engine…';
      await physics.ready;
    }
    yard.hide();
    drive = new DriveSession(world, physics, file, canvas, overlay);
    drive.onExit = stopTest;
    resize();
    mode = 'drive';
  } catch (e) {
    console.error(e);
    toast('Could not start the test drive', 'error');
  } finally {
    boot.style.display = 'none';
  }
}

function stopTest() {
  drive?.dispose();
  drive = null;
  mode = 'yard';
  yard.show();
}

yard.onTest = startTest;

function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h, false);
  canvas.style.width = w + 'px';
  canvas.style.height = h + 'px';
  yard.resize(w, h);
  drive?.resize(w, h);
}
window.addEventListener('resize', resize);
resize();

let last = performance.now();
const frameCost: number[] = [];
function frame(now: number) {
  const t0 = performance.now();
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  governor.frame(dt);
  if (mode === 'drive' && drive && world) {
    drive.fps = governor.fps;
    drive.update(dt);
    if (drive) renderer.render(world.scene, drive.camera);
  } else {
    yard.update(dt);
    renderer.render(yard.scene, yard.camera);
  }
  frameCost.push(performance.now() - t0);
  if (frameCost.length > 240) frameCost.shift();
  requestAnimationFrame(frame);
}

(async () => {
  await yard.loadInitial();
  yard.show();
  document.getElementById('boot')!.style.display = 'none';
  requestPersist();
  requestAnimationFrame(frame);
  // Debug hooks for automated browser tests.
  (window as unknown as Record<string, unknown>).__tw = { yard, get drive() { return drive; }, get mode() { return mode; }, governor, THREE,
    perf: () => { const a = [...frameCost].sort((x, y) => x - y); return { frames: a.length, medianMs: a[a.length >> 1], p95Ms: a[Math.floor(a.length * 0.95)], fps: governor.fps, drawCalls: renderer.info.render.calls, triangles: renderer.info.render.triangles }; } };
})();
