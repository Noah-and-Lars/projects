// Entry point: boot the GPU, build the street, run the frame loop.

import { GpuUnavailableError, initGpu } from './core/gpu';
import { Input } from './core/input';
import { startLoop } from './core/loop';
import { appendBvh, buildBvh } from './renderer/bvh';
import { buildLightGrid } from './renderer/lightgrid';
import { PathTracer } from './renderer/pathtracer';
import { buildDroneMesh } from './drone/droneModel';
import { DroneFlight, transform } from './drone/droneFlight';
import { mergeScenes, type SceneData } from './world/geometry';
import { buildArmMesh, buildHelmetMesh } from './intro/meshes';
import { IntroSequence } from './intro/intro';
import { PRESETS, type PresetName, presetFromName, type RenderSettings } from './renderer/presets';
import { loadTextureSet } from './renderer/textures';
import { PlayerController } from './player/controller';
import { Hud } from './ui/fpsCounter';
import { SettingsMenu } from './ui/settings';
import { WaterSim } from './weather/water';
import { RainSystem } from './weather/rain';
import { Lightning } from './weather/lightning';
import { AudioEngine } from './audio/audio';
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
  // Dynamic objects ride along as extra BVHs after the street's:
  // slot 0 drone, 1 left arm, 2 right arm, 3 helmet.
  const dynamic: SceneData[] = [droneMesh.scene, buildArmMesh(-1), buildArmMesh(1), buildHelmetMesh()];
  let scene = street;
  let bvh = buildBvh(street.tris, street.triCount);
  const objects: { root: number; triStart: number }[] = [];
  for (const d of dynamic) {
    const merged = mergeScenes(scene, d);
    const appended = appendBvh(bvh, buildBvh(d.tris, d.triCount), merged.triStart);
    scene = merged.scene;
    bvh = appended.bvh;
    objects.push({ root: appended.root, triStart: merged.triStart });
  }
  const droneRoot = objects[0].root, droneTriStart = objects[0].triStart;
  const grid = buildLightGrid(scene, STREET.zStart - 30, STREET.zEnd + 30, 6);
  const water = new WaterSim(device);
  const renderer = new PathTracer(gpu, scene, bvh, grid, textures, water, objects);
  const droneFlight = new DroneFlight(droneMesh.lamp, params.get('drone') !== '0');
  if (params.get('drone') === 'pin') droneFlight.pinned = [0.5, 4.5, 8];
  const droneCorners: [number, number, number][] = [];
  for (const x of [-0.86, 0.86]) for (const y of [-0.3, 0.5]) for (const z of [-0.68, 0.68]) droneCorners.push([x, y, z]);
  // Let it rain for a while before the first frame so the street starts wet.
  const warmSeconds = parseFloat(params.get('warm') ?? '') || 12;
  statusEl.textContent = 'Filling the puddles…';
  water.warm(warmSeconds, 0.0004);
  const lightning = new Lightning(params.get('lightning') !== '0');
  const rainSystem = new RainSystem(device, water.ground, scene.dripEdges, 'rgba16float');
  renderer.rain = rainSystem;
  const audio = new AudioEngine(scene.soundSpots, scene.dripEdges, scene.covers);
  const volumeEl = document.querySelector<HTMLInputElement>('#optVolume');
  if (volumeEl) {
    audio.volume = parseFloat(volumeEl.value);
    volumeEl.addEventListener('input', () => audio.setVolume(parseFloat(volumeEl.value)));
  }
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
  // Wake-up sequence: on by default for real sessions, off for headless captures unless asked.
  const introWanted = params.get('intro') === '1' || (params.get('intro') !== '0' && !headless);
  const intro = new IntroSequence([controller.pos[0], controller.pos[1], controller.pos[2]], controller.yaw, controller.groundHeight(controller.pos[0], controller.pos[2]));
  intro.active = introWanted;
  if (introWanted && headless) intro.begin();
  const introSkip = parseFloat(params.get('introAt') ?? '');
  if (Number.isFinite(introSkip) && introWanted) { intro.begin(); intro.update(introSkip); }
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
    audio.start();
    intro.begin();
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
    if (intro.active && (e.code === 'Space' || e.code === 'Enter')) intro.skip();
  });
  canvas.addEventListener('mousedown', () => { if (intro.active && started) intro.skip(); });
  ($('#optHud') as HTMLInputElement).addEventListener('change', (e) => hud.setVisible((e.target as HTMLInputElement).checked));
  document.querySelector<HTMLButtonElement>('#optReplay')?.addEventListener('click', () => {
    controller.teleport(STREET.spawn[0], STREET.spawn[2]);
    intro.restart();
    menu.close();
    void input.requestLock();
  });

  dbg.ready = true;
  // Debug hook for the headless script: dump renderer state.
  (dbg as unknown as { inspect: () => unknown }).inspect = () => ({
    poses: renderer.poses,
    spot: renderer.spot,
    objects: [{ root: droneRoot, triStart: droneTriStart }],
    triCount: scene.triCount,
    bvhNodes: bvh.nodeCount,
    uniforms: Array.from((renderer as unknown as { uniformData: Float32Array }).uniformData),
  });
  let lastFrameStart = performance.now();
  startLoop(({ dt, time }) => {
    if (dbg.pause) return;
    const frameStart = performance.now();
    const cpuMs = frameStart - lastFrameStart;
    lastFrameStart = frameStart;
    const introPlaying = intro.active;
    controller.update(dt, input.locked && !introPlaying);
    // Weather: water flows every frame, footsteps ripple it, lightning flashes.
    const rain = Math.max(0, settings.rain);
    const steps = controller.consumeFootsteps();
    const impulses = steps.map((p) => ({ x: p[0], z: p[2], radius: 0.32, strength: 0.006 }));
    // Intro: drives the camera, the arms and the helmet until it hands over.
    let introCam: typeof renderer.poses extends unknown ? ReturnType<typeof controller.camera> | null : never = null;
    if (introPlaying) {
      // introFreeze=1 holds the sequence at its current point for captures.
      const f = intro.update(params.get('introFreeze') === '1' ? 0 : dt);
      introCam = f.camera;
      renderer.poses[1] = f.armL;
      renderer.poses[2] = f.armR;
      renderer.poses[3] = f.helmet;
      renderer.intro = f.overlay;
      renderer.hudGlow = f.hud;
      audio.setMuffle(f.muffle);
      for (const ev of f.events) audio.cue(ev);
      impulses.push(...f.impulses);
      if (f.done) {
        renderer.intro = null;
        renderer.poses[1] = null;
        renderer.poses[2] = null;
        controller.yaw = intro['yaw' as keyof IntroSequence] as unknown as number;
        controller.pitch = 0;
        audio.setMuffle(0);
      }
    } else {
      // The discarded helmet stays where it landed.
      renderer.poses[3] = intro.helmetRestingPose;
    }
    // Drone: fly, then feed its transform, searchlight and downwash to everything.
    const ds = droneFlight.update(dt, time);
    if (ds.active) {
      const bmin: [number, number, number] = [Infinity, Infinity, Infinity];
      const bmax: [number, number, number] = [-Infinity, -Infinity, -Infinity];
      for (const c of droneCorners) {
        const w = transform(ds.rot, c, ds.pos);
        for (let i = 0; i < 3; i++) { bmin[i] = Math.min(bmin[i], w[i]); bmax[i] = Math.max(bmax[i], w[i]); }
      }
      renderer.poses[0] = { pos: ds.pos, rot: ds.rot, boundsMin: bmin, boundsMax: bmax };
      renderer.spot = {
        pos: ds.lampPos, dir: ds.lampDir, intensity: 1000,
        cosInner: Math.cos((7 * Math.PI) / 180), cosOuter: Math.cos((13 * Math.PI) / 180), range: 45,
      };
      rainSystem.drone = { pos: ds.pos, strength: ds.downwash };
      // Choppy water under the rotors.
      for (let i = 0; i < 3; i++) {
        const a = Math.random() * Math.PI * 2, r = Math.random() * 1.5;
        impulses.push({ x: ds.ground[0] + Math.cos(a) * r, z: ds.ground[2] + Math.sin(a) * r, radius: 0.35, strength: 0.0025 * ds.downwash });
      }
    } else {
      renderer.poses[0] = null;
      renderer.spot = null;
      rainSystem.drone = null;
    }
    water.step(dt, time, 0.0004 * rain, impulses);
    const cam = introCam ?? controller.camera();
    rainSystem.update(dt, time, cam.pos, settings.rainDrops * 1000, rain);
    const flash = lightning.update(dt, time);
    renderer.weather = { wetness: Math.min(1, rain), rain, sky: flash.sky, historyBoost: flash.historyBoost };
    audio.update({
      camPos: cam.pos, fwd: cam.fwd, up: cam.up, rain, footsteps: steps,
      drone: ds.active ? { pos: ds.pos, rotorSpeed: ds.rotorSpeed } : null,
      lightningStarted: flash.started, time, dt,
    });
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
