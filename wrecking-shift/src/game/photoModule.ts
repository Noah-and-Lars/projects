/**
 * Photo mode (P, or the pause-menu button): freezes the sim, hides HUD + view model and gives a free
 * camera through `game.cameraOverride`.
 *   WASD move · mouse look (pointer lock, or drag / arrow keys without it) · Space/E up · Ctrl/Q down
 *   Shift fast · wheel or +/- = FOV 20–110 · Z/X roll (R resets) · H hides the hint · F flashlight
 *   P or Esc leaves and restores camera, pause state, controls, HUD, FOV and graphics settings.
 * While active the renderer runs the 'high' tier at full resolution when it was on 'medium'.
 *
 * Publishes `game.ext.photo` { active, enter(fromPause?), exit(), toggle(), hint (bool), camera }.
 */
import type { CameraOverride, Game, GameModule } from './game';
import type { Quality } from '../render/renderer';
import { el } from './ui/dom';
import './ui/extras.css';

const SPEED = 4, FAST = 14, LOOK = 0.0024, KEY_LOOK = 1.6, ROLL = 0.9;

interface Saved {
  paused: boolean;
  controlsEnabled: boolean;
  toolsEnabled: boolean;
  cameraOverride: CameraOverride | null;
  fov: number;
  quality: Quality;
  resScale: number;
  allowLock: boolean;
  fromPause: boolean;
}

export function createPhotoModule(): GameModule {
  let game: Game;
  let active = false;
  let saved: Saved | null = null;
  let cam: CameraOverride = { eye: { x: 0, y: 0, z: 0 }, yaw: 0, pitch: 0, roll: 0 };
  let hint = true;
  let dragX = 0, dragY = 0, wheel = 0;
  const hintEl = el('div', 'ws-photo-hint');
  hintEl.innerHTML = '<b>PHOTO</b> WASD move · mouse look · Space/Ctrl up/down · Shift fast · wheel FOV · Z/X roll · F light · H hide · P/Esc exit';

  function showHint(): void {
    if (!hintEl.isConnected) (document.querySelector('.ws') ?? document.getElementById('ui') ?? document.body).append(hintEl);
    hintEl.style.display = active && hint ? '' : 'none';
  }

  function uiMenu(): string | null { return game.ext.ui?.state?.().menu ?? null; }

  function enter(fromPause = false): boolean {
    if (active) return true;
    const ui = game.ext.ui;
    const st = ui?.state?.();
    if (st && st.session !== 'play') return false;
    if (st?.mapOpen) ui.toggleMap(false);
    if (fromPause || (st && st.menu)) { ui.closeMenus(); fromPause = true; }
    const r = game.renderer;
    saved = {
      paused: game.paused, controlsEnabled: game.controlsEnabled, toolsEnabled: game.toolsEnabled,
      cameraOverride: game.cameraOverride, fov: game.fov, quality: r.quality, resScale: r.resolutionScale,
      allowLock: game.input.allowLock, fromPause,
    };
    // start where the player is looking from (or the current override, e.g. a vehicle chase camera)
    const src = game.cameraOverride;
    if (src) cam = { eye: { ...src.eye }, yaw: src.yaw, pitch: src.pitch, roll: src.roll ?? 0 };
    else { const p = game.player; cam = { eye: p.eye, yaw: p.yaw, pitch: p.pitch, roll: 0 }; }
    active = true;
    game.paused = true;
    game.controlsEnabled = false;
    game.toolsEnabled = false;
    game.cameraOverride = cam;
    game.input.allowLock = true;
    if (!game.testMode && !document.pointerLockElement) game.input.requestLock();
    if (r.quality === 'medium') r.setQuality('high');
    if (r.resolutionScale < 1) r.setResolutionScale(1);
    document.body.classList.add('ws-photo-on');
    showHint();
    game.sim.out.push({ type: 'custom', name: 'photo:enter', data: {} });
    return true;
  }

  function exit(): void {
    if (!active || !saved) return;
    const s = saved;
    active = false;
    saved = null;
    const r = game.renderer;
    game.paused = s.paused;
    game.controlsEnabled = s.controlsEnabled;
    game.toolsEnabled = s.toolsEnabled;
    game.cameraOverride = s.cameraOverride;
    game.fov = s.fov;
    game.input.allowLock = s.allowLock;
    if (r.quality !== s.quality) r.setQuality(s.quality);
    if (r.resolutionScale !== s.resScale) r.setResolutionScale(s.resScale);
    document.body.classList.remove('ws-photo-on');
    showHint();
    // keys pressed while flying (E, Q, digits, wheel) must not reach the player / tools afterwards
    game.pendingKeys.clear();
    const gi = game as any;
    gi.pendingInteract = false; gi.pendingScroll = 0;
    game.sim.out.push({ type: 'custom', name: 'photo:exit', data: {} });
    if (s.fromPause) game.ext.ui?.openMenu?.('pause');
  }

  function canToggle(): boolean {
    if (game.loading) return false;
    const st = game.ext.ui?.state?.();
    if (!st) return true;
    if (st.session !== 'play') return false;
    const m = st.menu;
    return !m || m === 'pause';
  }

  return {
    init(g) {
      game = g;
      game.ext.photo = {
        get active() { return active; },
        enter, exit,
        toggle: () => (active ? (exit(), false) : enter()),
        get hint() { return hint; },
        set hint(v: boolean) { hint = v; showHint(); },
        get camera() { return cam; },
      };
      // capture phase, registered before the UI module: Esc / Tab must not reach the menus while shooting
      window.addEventListener('keydown', (e) => {
        if (e.repeat) return;
        const code: string = game.ext.keys?.canon(e.code) ?? e.code; // key bindings (src/game/keymap.ts)
        if (active) {
          if (e.code === 'Escape' || code === 'KeyP') { e.preventDefault(); e.stopImmediatePropagation(); exit(); return; }
          if (code === 'Tab' || e.code === 'F3') { e.preventDefault(); e.stopImmediatePropagation(); return; }
          if (e.code === 'KeyH') { game.ext.photo.hint = !hint; return; }
          return;
        }
        if (code === 'KeyP' && canToggle()) { e.preventDefault(); enter(uiMenu() === 'pause'); }
      }, true);
      // without pointer lock: drag with any mouse button to look, wheel for FOV
      window.addEventListener('mousemove', (e) => { if (active && !game.input.locked && e.buttons) { dragX += e.movementX; dragY += e.movementY; } });
      window.addEventListener('wheel', (e) => { if (active && !game.input.locked) wheel += Math.sign(e.deltaY); }, { passive: true });
      // losing the lock (browser Esc) leaves photo mode first; the UI then shows the pause menu as usual
      document.addEventListener('pointerlockchange', () => { if (active && !document.pointerLockElement && game.input.locked === false && !game.testMode) exit(); });
    },
    onLevelLoaded() { if (active) exit(); },
    frameUpdate(g, dt) {
      if (!active) return;
      const inp = g.input;
      const k = (c: string) => inp.down(c);
      // look
      const dx = inp.mouseDX + dragX, dy = inp.mouseDY + (inp.invertY ? -dragY : dragY);
      dragX = dragY = 0;
      const sens = LOOK * (g.fov / 80);
      cam.yaw -= dx * sens;
      cam.pitch -= dy * sens;
      const kl = KEY_LOOK * dt * (g.fov / 80);
      if (k('ArrowLeft')) cam.yaw += kl;
      if (k('ArrowRight')) cam.yaw -= kl;
      if (k('ArrowUp')) cam.pitch += kl;
      if (k('ArrowDown')) cam.pitch -= kl;
      cam.pitch = Math.max(-1.55, Math.min(1.55, cam.pitch));
      if (k('KeyZ')) cam.roll = (cam.roll ?? 0) + ROLL * dt;
      if (k('KeyX')) cam.roll = (cam.roll ?? 0) - ROLL * dt;
      if (inp.hit('KeyR')) cam.roll = 0;
      // fov
      const w = inp.wheel + wheel + (inp.hit('Equal') || inp.hit('NumpadAdd') ? -1 : 0) + (inp.hit('Minus') || inp.hit('NumpadSubtract') ? 1 : 0);
      wheel = 0;
      if (w) g.fov = Math.max(20, Math.min(110, Math.round(g.fov + w * 5)));
      // move (fly along the view direction)
      const sp = (k('ShiftLeft') || k('ShiftRight') ? FAST : SPEED) * dt;
      const fx = -Math.sin(cam.yaw) * Math.cos(cam.pitch), fy = Math.sin(cam.pitch), fz = -Math.cos(cam.yaw) * Math.cos(cam.pitch);
      const rx = Math.cos(cam.yaw), rz = -Math.sin(cam.yaw);
      const mf = (k('KeyW') ? 1 : 0) - (k('KeyS') ? 1 : 0);
      const mr = (k('KeyD') ? 1 : 0) - (k('KeyA') ? 1 : 0);
      const mu = (k('Space') || k('KeyE') ? 1 : 0) - (k('ControlLeft') || k('ControlRight') || k('KeyQ') || k('KeyC') ? 1 : 0);
      cam.eye.x += (fx * mf + rx * mr) * sp;
      cam.eye.y += (fy * mf + mu) * sp;
      cam.eye.z += (fz * mf + rz * mr) * sp;
      // stay near the site
      const b = g.level.bounds;
      const pad = 40;
      cam.eye.x = Math.max(b.min.x - pad, Math.min(b.max.x + pad, cam.eye.x));
      cam.eye.z = Math.max(b.min.z - pad, Math.min(b.max.z + pad, cam.eye.z));
      cam.eye.y = Math.max(b.min.y, Math.min(b.max.y + 60, cam.eye.y));
      g.cameraOverride = cam;
    },
  };
}
