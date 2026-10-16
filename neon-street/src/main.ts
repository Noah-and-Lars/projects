// Entry point: boot the GPU, build the street, run the frame loop.

import { GpuUnavailableError, initGpu } from './core/gpu';
import { Input } from './core/input';
import { startLoop } from './core/loop';
import { buildBvh } from './renderer/bvh';
import { PathTracer } from './renderer/pathtracer';
import { PRESETS, type PresetName, presetFromName, type RenderSettings } from './renderer/presets';
import { PlayerController } from './player/controller';
import { Hud } from './ui/fpsCounter';
import { SettingsMenu } from './ui/settings';
import { buildStreet } from './world/street';

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

  statusEl.textContent = 'Building the street…';
  const scene = buildStreet();
  const bvh = buildBvh(scene.tris, scene.triCount);
  const renderer = new PathTracer(gpu, scene, bvh);
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
  override('exposure', 'exposure');

  const input = new Input(canvas);
  const controller = new PlayerController(scene, input);
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
    if (e.code === 'F2') renderer.displayMode = (renderer.displayMode + 1) % 4;
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
    renderer.render(controller.camera(), settings, time);
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
