import type { Game, GameModule } from '../game/game';
import type { Quality, TimeOfDay } from './renderer';

/**
 * Applies graphics settings to the renderer.
 *  - URL parameters (handy for local testing): ?quality=low|medium|high  &tod=day|sunset|overcast|night  &res=0.5..1
 *  - `game.ext.settings` if a settings/UI module publishes one: fields `quality`, `resolutionScale`, and an
 *    optional `onChange(cb)` subscription (cb is called after any change).
 *
 * Diagnostics for "the picture moves while I stand still" (each switch turns one suspect off). Published as
 * `game.ext.diag` (get / set / items) for the in-game page Esc -> Settings -> Diagnostics, remembered in
 * localStorage, applied live. F4 toggles the camera readout. URL parameters override them for local use:
 *   ?camdebug=1   on-screen readout: how much the camera moved / turned in the last frame, how many of the last
 *                 120 frames changed it, raw mouse counts. All zeros while standing still = the camera is perfectly
 *                 still and any remaining motion comes from rendering.
 *   ?taa=0        temporal anti-aliasing off (FXAA / MSAA instead)
 *   ?grain=0      per-voxel colour grain, normal tilt and edge bevel off
 *   ?dynshadow=0  sun shadow map (dynamic objects, camera-following) off
 *   ?near=0.05    camera near plane in metres (default 0.1)
 *   ?inflate=0    no quad overlap (crack hiding) in the meshes
 *   ?bob=0        head bob / roll ignored
 */
export interface DiagState {
  camdebug: boolean; taa: boolean; grain: boolean; dynshadow: boolean; near: number; inflate: boolean; bob: boolean;
}
export const DIAG_DEFAULTS: DiagState = { camdebug: false, taa: true, grain: true, dynshadow: true, near: 0.1, inflate: true, bob: true };
/** menu description of the switches (label, key, options for non-boolean ones) */
export const DIAG_ITEMS: { key: keyof DiagState; label: string; options?: number[] }[] = [
  { key: 'camdebug', label: 'Camera motion readout (F4)' },
  { key: 'taa', label: 'Temporal anti-aliasing (TAA)' },
  { key: 'grain', label: 'Voxel grain / tilt / bevel' },
  { key: 'dynshadow', label: 'Shadows of moving objects' },
  { key: 'near', label: 'Near plane (m)', options: [0.05, 0.1, 0.2] },
  { key: 'inflate', label: 'Crack hiding (quad overlap)' },
  { key: 'bob', label: 'Head bob (also in Settings)' },
];
const STORE = 'wrecking-shift-diag';
const INFLATE_SHADER = 0.0015, INFLATE_MESH = 0.01;

export function createLookModule(): GameModule {
  const params = typeof location !== 'undefined' ? new URLSearchParams(location.search) : new URLSearchParams();
  const urlQuality = params.get('quality') as Quality | null;
  const urlTod = params.get('tod') as TimeOfDay | null;
  const urlRes = params.get('res');
  let subscribed = false;
  let game: Game | null = null;

  // diagnostics state: defaults <- localStorage <- URL
  const diag: DiagState = { ...DIAG_DEFAULTS };
  try { Object.assign(diag, sanitize(JSON.parse(localStorage.getItem(STORE) ?? '{}'))); } catch { /* no storage */ }
  const url: Partial<DiagState> = {};
  for (const k of ['camdebug', 'taa', 'grain', 'dynshadow', 'inflate', 'bob'] as const) if (params.has(k)) url[k] = params.get(k) !== '0';
  if (params.has('near')) url.near = Number(params.get('near'));
  Object.assign(diag, sanitize(url));

  const apply = (g: Game) => {
    const s = g.ext.settings;
    const q = urlQuality ?? s?.quality;
    if (q && q !== g.renderer.quality) g.renderer.setQuality(q);
    const r = Number(urlRes ?? s?.resolutionScale);
    if (r > 0 && r !== g.renderer.resolutionScale) g.renderer.setResolutionScale(r);
    if (s && !subscribed && typeof s.onChange === 'function') { subscribed = true; s.onChange(() => apply(g)); }
  };
  const applyDiag = (g: Game) => {
    const R = g.renderer;
    if (R.taa !== diag.taa) R.setTAA(diag.taa);
    R.look.uGrain.value = diag.grain ? 1 : 0;
    R.sun.castShadow = diag.dynshadow;
    if (R.camera.near !== diag.near) { R.camera.near = diag.near; R.camera.updateProjectionMatrix(); }
    const inf = diag.inflate ? INFLATE_SHADER : 0;
    if (R.look.uInflate.value !== inf) { R.look.uInflate.value = inf; R.setMeshInflate(diag.inflate ? INFLATE_MESH : 0); }
    g.noViewBob = !diag.bob;
    if (box && !diag.camdebug) { box.remove(); box = null; }
  };
  const set = <K extends keyof DiagState>(k: K, v: DiagState[K]) => {
    Object.assign(diag, sanitize({ [k]: v }));
    try { localStorage.setItem(STORE, JSON.stringify(diag)); } catch { /* no storage */ }
    if (game) applyDiag(game);
  };

  // camera readout
  let box: HTMLDivElement | null = null;
  const last = new Float64Array(6), lastM = new Float64Array(16);
  let have = false, frames = 0, mouseX = 0, mouseY = 0;
  const changed: number[] = [];
  if (typeof addEventListener === 'function') {
    addEventListener('mousemove', (e) => { mouseX += Math.abs(e.movementX); mouseY += Math.abs(e.movementY); });
    addEventListener('keydown', (e) => { if (e.code === 'F4') { e.preventDefault(); set('camdebug', !diag.camdebug); } });
  }

  return {
    init(g) {
      game = g;
      g.ext.diag = { get: () => ({ ...diag }), set, items: DIAG_ITEMS, reset: () => { for (const k of Object.keys(DIAG_DEFAULTS) as (keyof DiagState)[]) set(k, DIAG_DEFAULTS[k]); } };
      apply(g); applyDiag(g);
    },
    onLevelLoaded(g) {
      apply(g);
      applyDiag(g);
      if (urlTod) g.renderer.setTimeOfDay(urlTod);
    },
    frameUpdate(g) {
      if (!diag.camdebug || typeof document === 'undefined') { have = false; return; }
      if (!box) {
        box = document.createElement('div');
        box.style.cssText = 'position:fixed;right:8px;top:30%;z-index:50;pointer-events:none;background:#000a;color:#9f9;font:12px/1.4 ui-monospace,monospace;padding:6px 8px;white-space:pre;border-radius:3px';
        document.body.appendChild(box);
      }
      box.style.display = g.ext.ui?.state?.().menu ? 'none' : ''; // not over menus
      // the camera of the previous drawn frame (game.draw runs after frameUpdate)
      // the final camera transform (after head bob, punch and shake): position + all three rotation axes, and an
      // exact compare of the whole world matrix for "frames moved"
      const c = g.renderer.camera;
      c.updateMatrixWorld();
      const cur = [c.position.x, c.position.y, c.position.z, c.rotation.x, c.rotation.y, c.rotation.z];
      const m = c.matrixWorld.elements;
      let dp = 0, dr = 0, same = have;
      if (have) {
        dp = Math.hypot(cur[0] - last[0], cur[1] - last[1], cur[2] - last[2]);
        dr = Math.hypot(cur[3] - last[3], cur[4] - last[4], cur[5] - last[5]);
        for (let i = 0; i < 16; i++) if (m[i] !== lastM[i]) same = false;
      }
      last.set(cur); lastM.set(m); have = true;
      changed.push(same ? 0 : 1); if (changed.length > 120) changed.shift();
      if (++frames % 6 === 1) {
        const n = changed.reduce((a, b) => a + b, 0);
        box.textContent = `camera move  ${(dp * 1e6).toFixed(1).padStart(9)} um\ncamera turn  ${(dr * 1e6).toFixed(1).padStart(9)} urad\nframes moved ${String(n).padStart(4)} / ${changed.length}\nmouse counts ${mouseX} x ${mouseY}\n` +
          `taa ${diag.taa ? 'on' : 'off'}  grain ${diag.grain ? 'on' : 'off'}  dynshadow ${diag.dynshadow ? 'on' : 'off'}\nnear ${c.near}  inflate ${diag.inflate ? 'on' : 'off'}  bob ${diag.bob ? 'on' : 'off'}  q ${g.renderer.effectiveQuality}  (F4 hides)`;
        mouseX = 0; mouseY = 0;
      }
    },
  };
}

function sanitize(raw: any): Partial<DiagState> {
  const out: Partial<DiagState> = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const k of ['camdebug', 'taa', 'grain', 'dynshadow', 'inflate', 'bob'] as const) if (typeof raw[k] === 'boolean') out[k] = raw[k];
  if (typeof raw.near === 'number' && isFinite(raw.near)) out.near = Math.min(0.5, Math.max(0.02, raw.near));
  return out;
}
