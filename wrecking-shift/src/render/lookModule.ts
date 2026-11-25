import type { Game, GameModule } from '../game/game';
import type { Quality, TimeOfDay } from './renderer';

/**
 * Applies graphics settings to the renderer.
 *  - URL parameters (handy for testing): ?quality=low|medium|high  &tod=day|sunset|overcast|night  &res=0.5..1  &taa=0|1
 *  - `game.ext.settings` if a settings/UI module publishes one: fields `quality`, `resolutionScale`, and an
 *    optional `onChange(cb)` subscription (cb is called after any change).
 *
 * Debug switches for "the picture moves while I stand still" (each turns one suspect off):
 *   ?taa=0        temporal anti-aliasing off (FXAA / MSAA instead)
 *   ?grain=0      per-voxel colour grain, normal tilt and edge bevel off
 *   ?dynshadow=0  sun shadow map (dynamic objects, camera-following) off
 *   ?near=0.05    camera near plane in metres (default 0.1)
 *   ?inflate=0    no quad overlap (crack hiding) in the meshes
 *   ?bob=0        head bob / roll ignored
 *   ?camdebug=1   on-screen readout: how much the camera moved / turned in the last frame and how many of the
 *                 last 120 frames changed it, plus raw mouse counts. All zeros while standing still = the camera
 *                 is perfectly still and any remaining motion comes from rendering.
 */
export function createLookModule(): GameModule {
  const params = typeof location !== 'undefined' ? new URLSearchParams(location.search) : new URLSearchParams();
  const urlQuality = params.get('quality') as Quality | null;
  const urlTod = params.get('tod') as TimeOfDay | null;
  const urlRes = params.get('res');
  const urlTaa = params.get('taa');
  const num = (k: string) => (params.has(k) ? Number(params.get(k)) : null);
  const off = (k: string) => params.get(k) === '0';
  let subscribed = false;
  const apply = (game: Game) => {
    const s = game.ext.settings;
    const q = urlQuality ?? s?.quality;
    if (q && q !== game.renderer.quality) game.renderer.setQuality(q);
    const r = Number(urlRes ?? s?.resolutionScale);
    if (r > 0 && r !== game.renderer.resolutionScale) game.renderer.setResolutionScale(r);
    const taa = urlTaa !== null ? urlTaa !== '0' : s?.taa;
    if (typeof taa === 'boolean' && taa !== game.renderer.taa) game.renderer.setTAA(taa);
    if (s && !subscribed && typeof s.onChange === 'function') { subscribed = true; s.onChange(() => apply(game)); }
  };
  const applyDebug = (game: Game) => {
    const R = game.renderer;
    if (off('grain')) R.look.uGrain.value = 0;
    if (off('dynshadow')) R.sun.castShadow = false;
    const near = num('near');
    if (near && near > 0 && R.camera.near !== near) { R.camera.near = near; R.camera.updateProjectionMatrix(); }
    if (off('inflate')) { R.look.uInflate.value = 0; R.setMeshInflate(0); }
    if (off('bob')) game.noViewBob = true;
  };

  // ?camdebug=1 overlay
  let box: HTMLDivElement | null = null;
  const last = new Float64Array(5);
  let have = false, frames = 0, mouseX = 0, mouseY = 0;
  const changed: number[] = [];
  const camDebug = params.get('camdebug') === '1' && typeof document !== 'undefined';
  if (camDebug) addEventListener('mousemove', (e) => { mouseX += Math.abs(e.movementX); mouseY += Math.abs(e.movementY); });

  return {
    init(game) { apply(game); applyDebug(game); },
    onLevelLoaded(game) {
      apply(game);
      applyDebug(game);
      if (urlTod) game.renderer.setTimeOfDay(urlTod);
    },
    frameUpdate(game) {
      if (!camDebug) return;
      if (!box) {
        box = document.createElement('div');
        box.style.cssText = 'position:fixed;left:8px;top:40%;z-index:50;pointer-events:none;background:#000a;color:#9f9;font:12px/1.4 ui-monospace,monospace;padding:6px 8px;white-space:pre;border-radius:3px';
        document.body.appendChild(box);
      }
      // the camera of the previous drawn frame (game.draw runs after frameUpdate)
      const c = game.renderer.camera;
      const cur = [c.position.x, c.position.y, c.position.z, c.rotation.x, c.rotation.y];
      let dp = 0, dr = 0;
      if (have) { dp = Math.hypot(cur[0] - last[0], cur[1] - last[1], cur[2] - last[2]); dr = Math.hypot(cur[3] - last[3], cur[4] - last[4]); }
      last.set(cur); have = true;
      changed.push(dp > 0 || dr > 0 ? 1 : 0); if (changed.length > 120) changed.shift();
      if (++frames % 6 === 0) {
        const n = changed.reduce((a, b) => a + b, 0);
        box.textContent = `camera move  ${(dp * 1e6).toFixed(1).padStart(9)} um\ncamera turn  ${(dr * 1e6).toFixed(1).padStart(9)} urad\nframes moved ${String(n).padStart(4)} / ${changed.length}\nmouse counts ${mouseX} x ${mouseY}\n` +
          `taa ${game.renderer.taa ? 'on' : 'off'}  grain ${game.renderer.look.uGrain.value ? 'on' : 'off'}  near ${c.near}  q ${game.renderer.effectiveQuality}`;
        mouseX = 0; mouseY = 0;
      }
    },
  };
}
