// Entry point: boot the GPU, build the street, run the frame loop.

import { GpuUnavailableError, initGpu } from './core/gpu';
import { Input } from './core/input';
import { startLoop } from './core/loop';
import { appendBvh, buildBvh } from './renderer/bvh';
import { buildLightGrid } from './renderer/lightgrid';
import { PathTracer } from './renderer/pathtracer';
import { buildDroneMesh } from './drone/droneModel';
import { DroneFlight, transform } from './drone/droneFlight';
import { mergeScenes } from './world/geometry';
import { PRESETS, type PresetName, presetFromName, type RenderSettings } from './renderer/presets';
import { loadTextureSet } from './renderer/textures';
import { PlayerController } from './player/controller';
import { Hud } from './ui/fpsCounter';
import { SettingsMenu } from './ui/settings';
import { WaterSim } from './weather/water';
import { RainSystem } from './weather/rain';
import { Lightning } from './weather/lightning';
import { STREET, buildStreet } from './world/street';

interface NeonDebug {
  ready: boolean;
  /** Set by the headless script to freeze the last frame before a screenshot. */
  pause: boolean;
  frames: number;
  fps: number;
  gpuMs: number | null;
  renderW: number;
  renderH: number;
  errors: string[];
}

const dbg: NeonDebug = { ready: false, pause: false, frames: 0, fps: 0, gpuMs: null, renderW: 0, renderH: 0, errors: [] };
(window as unknown as { __neon: NeonDebug }).__neon = dbg;

const $ = <T extends HTMLElement>(sel: string): T => {
  const el = document.querySelector<T>(sel);
  if (!el) throw new Error(`missing element ${sel}`);
  return el;
};

function showError(msg: string): void {
  dbg.errors.push(msg);
  console.error(msg);
  $('#errorMsg').textContent = msg;
  $('#error').style.display = 'flex';
  $('#start').style.display = 'none';
}

async function boot(): Promise<void> {
  const params = new URLSearchParams(location.search);
  const canvas = $<HTMLCanvasElement>('#gfx');
  const startEl = $('#start');
  const statusEl = $('#startStatus');
  const headless = params.get('headless') === '1' || params.get('autostart') === '1';

  let gpu;
  try {
    gpu = await initGpu(canvas);
  } catch (e) {
    const msg = e instanceof GpuUnavailableError ? e.message : `WebGPU setup failed: ${(e as Error).message}`;
    showError(msg);
    return;
  }
  const { device } = gpu;
  device.lost.then((info) => showError(`The GPU device was lost (${info.reason}): ${info.message}`));
  device.addEventListener('uncapturederror', (ev) => {
    const msg = `WebGPU error: ${(ev as GPUUncapturedErrorEvent).error.message}`;
    if (dbg.errors.length < 20) dbg.errors.push(msg);
    console.error(msg);
  });

  statusEl.textContent = 'Loading textures…';
  const textures = await loadTextureSet(device, 'textures/', (d, t) => { statusEl.textContent = `Loading textures… ${d}/${t}`; });
  statusEl.textContent = 'Building the street…';
  const street = buildStreet();
  const droneMesh = buildDroneMesh();
  // The drone rides along as a second BVH after the street's.
  const { scene, triStart: droneTriStart } = mergeScenes(street, droneMesh.scene);
  const streetBvh = buildBvh(street.tris, street.triCount);
  const droneBvh = buildBvh(droneMesh.scene.tris, droneMesh.scene.triCount);
  const { bvh, root: droneRoot } = appendBvh(streetBvh, droneBvh, droneTriStart);
  const grid = buildLightGrid(scene, STREET.zStart - 30, STREET.zEnd + 30, 6);
  const water = new WaterSim(device);
  const renderer = new PathTracer(gpu, scene, bvh, grid, textures, water, { root: droneRoot, triStart: droneTriStart });
  const droneFlight = new DroneFlight(droneMesh.lamp, params.get('drone') !== '0');
  const droneCorners: [number, number, number][] = [];
  for (const x of [-0.86, 0.86]) for (const y of [-0.3, 0.5]) for (const z of [-0.68, 0.68]) droneCorners.push([x, y, z]);
  // Let it rain for a while before the first frame so the street starts wet.
  const warmSeconds = parseFloat(params.get('warm') ?? '') || 12;
  statusEl.textContent = 'Filling the puddles…';
  water.warm(warmSeconds, 0.0004);
  const lightning = new Lightning(params.get('lightning') !== '0');
  const rainSystem = new RainSystem(device, water.ground, scene.dripEdges, 'rgba16float');
  renderer.rain = rainSystem;
  const displayMode = parseInt(params.get('mode') ?? '0', 10);
  if (Number.isFinite(displayMode)) renderer.displayMode = displayMode;

  // Settings: preset from the URL, with optional per-value overrides.
  const presetName: PresetName = presetFromName(params.get('preset'));
  const settings: RenderSettings = { ...PRESETS[presetName] };
  const override = (key: keyof RenderSettings, param: string) => {
    const v = params.get(param);
    if (v != null && v !== '' && Number.isFinite(parseFloat(v))) settings[key] = parseFloat(v);
  };
  override('renderScale', 'scale');
  override('spp', 'spp');
  override('maxBounces', 'bounces');
  override('lightSamples', 'lights');
  override('fogMode', 'fog');
  override('fogDensity', 'fogDensity');
  override('atrousIterations', 'denoise');
  override('bloom', 'bloom');
  override('exposure', 'exposure');
  override('rain', 'rain');
  override('rainDrops', 'drops');

  const input = new Input(canvas);
  const controller = new PlayerController(scene, input);
  // Optional start pose for captures: ?x=..&z=..&yaw=deg&pitch=deg
  const num = (k: string) => { const v = parseFloat(params.get(k) ?? ''); return Number.isFinite(v) ? v : null; };
  const px = num('x'), pz = num('z'), pyaw = num('yaw'), ppitch = num('pitch');
  if (px != null || pz != null) controller.teleport(px ?? controller.pos[0], pz ?? controller.pos[2]);
  if (pyaw != null) controller.yaw = (pyaw * Math.PI) / 180;
  if (ppitch != null) controller.pitch = (ppitch * Math.PI) / 180;
  const hud = new Hud($('#hud'));
  if (params.get('hud') === '0') hud.setVisible(false);
  const menu = new SettingsMenu($('#menu'), settings, presetName, (_s, structural) => {
    if (structural) renderer.resetHistory();
    resize(true);
  });

  // Fixed canvas size (for headless captures) or follow the window.
  const fixedW = parseInt(params.get('w') ?? '', 10);
  const fixedH = parseInt(params.get('h') ?? '', 10);
  const maxDpr = parseFloat(params.get('dpr') ?? '') || 2;
  function resize(force = false): void {
    let w: number, h: number;
    if (fixedW > 0 && fixedH > 0) {
      w = fixedW;
      h = fixedH;
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
    } else {
      const dpr = Math.min(maxDpr, window.devicePixelRatio || 1);
      w = Math.max(16, Math.floor(canvas.clientWidth * dpr));
      h = Math.max(16, Math.floor(canvas.clientHeight * dpr));
    }
    if (force || canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    renderer.resize(w, h, settings.renderScale);
  }
  window.addEventListener('resize', () => resize());
  resize(true);

  // Overlay / pointer lock plumbing.
  let started = headless;
  const hideStart = () => { startEl.style.display = 'none'; };
  if (headless) hideStart();
  statusEl.textContent = `Ready on ${gpu.adapterName}. Click to start.`;
  startEl.addEventListener('click', () => {
    started = true;
    hideStart();
    menu.close();
    void input.requestLock();
  });
  canvas.addEventListener('click', () => {
    if (started && !input.locked && !menu.isOpen) void input.requestLock();
  });
  input.onUnlock = () => { if (started) menu.open(); };
  input.onLock = () => menu.close();
  $('#menu').addEventListener('click', (e) => {
    // Clicking inside the panel never recaptures the mouse.
    e.stopPropagation();
  });
  window.addEventListener('keydown', (e) => {
    if (e.code === 'KeyH') {
      hud.setVisible(!hud.visible);
      ($('#optHud') as HTMLInputElement).checked = hud.visible;
    }
    if (e.code === 'Escape' && started && !input.locked) {
      // Esc while the menu is open with no pointer lock: close and relock.
      if (menu.isOpen) { menu.close(); void input.requestLock(); }
    }
    if (e.code === 'F2') renderer.displayMode = (renderer.displayMode + 1) % 5;
  });
  ($('#optHud') as HTMLInputElement).addEventListener('change', (e) => hud.setVisible((e.target as HTMLInputElement).checked));

  dbg.ready = true;
  let lastFrameStart = performance.now();
  startLoop(({ dt, time }) => {
    if (dbg.pause) return;
    const frameStart = performance.now();
    const cpuMs = frameStart - lastFrameStart;
    lastFrameStart = frameStart;
    controller.update(dt, input.locked);
    // Weather: water flows every frame, footsteps ripple it, lightning flashes.
    const rain = Math.max(0, settings.rain);
    const impulses = controller.consumeFootsteps().map((p) => ({ x: p[0], z: p[2], radius: 0.32, strength: 0.006 }));
    // Drone: fly, then feed its transform, searchlight and downwash to everything.
    const ds = droneFlight.update(dt, time);
    if (ds.active) {
      const bmin: [number, number, number] = [Infinity, Infinity, Infinity];
      const bmax: [number, number, number] = [-Infinity, -Infinity, -Infinity];
      for (const c of droneCorners) {
        const w = transform(ds.rot, c, ds.pos);
        for (let i = 0; i < 3; i++) { bmin[i] = Math.min(bmin[i], w[i]); bmax[i] = Math.max(bmax[i], w[i]); }
      }
      renderer.drone = {
        pos: ds.pos, rot: ds.rot, boundsMin: bmin, boundsMax: bmax,
        lampPos: ds.lampPos, lampDir: ds.lampDir, lampIntensity: 140,
        cosInner: Math.cos((7 * Math.PI) / 180), cosOuter: Math.cos((13 * Math.PI) / 180), range: 45,
      };
      rainSystem.drone = { pos: ds.pos, strength: ds.downwash };
      // Choppy water under the rotors.
      for (let i = 0; i < 3; i++) {
        const a = Math.random() * Math.PI * 2, r = Math.random() * 1.5;
        impulses.push({ x: ds.ground[0] + Math.cos(a) * r, z: ds.ground[2] + Math.sin(a) * r, radius: 0.35, strength: 0.0025 * ds.downwash });
      }
    } else {
      renderer.drone = null;
      rainSystem.drone = null;
    }
    water.step(dt, time, 0.0004 * rain, impulses);
    const cam = controller.camera();
    rainSystem.update(dt, time, cam.pos, settings.rainDrops * 1000, rain);
    const flash = lightning.update(dt, time);
    renderer.weather = { wetness: Math.min(1, rain), rain, sky: flash.sky, historyBoost: flash.historyBoost };
    renderer.render(cam, settings, time);
    hud.update(dt, cpuMs, {
      stats: renderer.stats,
      settings,
      presetName: menu.presetName,
      canvasW: canvas.width,
      canvasH: canvas.height,
      adapterName: gpu.adapterName,
      pos: [controller.pos[0], controller.pos[1], controller.pos[2]],
    });
    dbg.frames++;
    dbg.fps = hud.fps;
    dbg.gpuMs = renderer.stats.gpuMs;
    dbg.renderW = renderer.stats.renderWidth;
    dbg.renderH = renderer.stats.renderHeight;
  });
}

boot().catch((e) => showError(`Startup failed: ${(e as Error).message}`));
