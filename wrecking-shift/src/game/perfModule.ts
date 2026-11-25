import type { Game, GameModule } from './game';
import { LITE_DRAW_DISTANCE } from '../render/renderer';

/**
 * Performance mode for low-end laptops (Settings -> Graphics -> "Performance mode (low-end laptops)",
 * `settings.perfMode`, remembered with the other settings). Published as `game.ext.perf`.
 *
 * What it changes (why: DECISIONS.md "Performance mode"):
 *  GPU  renderer.setPerformanceMode(true): tuned low tier (no lighting volumes, no bloom / TAA), device pixel
 *       ratio 1, adaptive render resolution 50-85 % with a sharpening upscale, 1024 shadow map refreshed every
 *       second frame, 2 lamp lights, 170 m draw distance with fog in front of it, simpler water shader.
 *  CPU  at most 2 physics ticks per frame (slow motion instead of a death spiral), debris cap 260 -> 110 bodies,
 *       fire cap 1200 -> 450 burning voxels, chip particles 3000 -> 900, chunk meshing 8 -> 4 ms per frame.
 *  Core gameplay (tools, destruction, missions, physics rules) is untouched.
 *
 * When performance mode is off and the frame rate stays low while playing, an unobtrusive banner suggests it
 * (F7 or the button turns it on; "Don't ask again" is remembered).
 */
export interface PerfApi {
  readonly on: boolean;
  set(on: boolean): void;
  /** current adaptive render scale (performance mode) */
  readonly scale: number;
  /** measured frames per second (0.5 s average) */
  readonly fps: number;
  /** test hook: run the slow-frame detector as if `fps` had been measured for `seconds` */
  simulateSlow(fps: number, seconds: number): void;
  /** banner currently shown? */
  readonly hintVisible: boolean;
}

export const PERF_CAPS = {
  normal: { maxDebris: 260, maxFires: 1200, chips: 3000, budgetMs: 8, substeps: 3 },
  lite: { maxDebris: 110, maxFires: 450, chips: 900, budgetMs: 4, substeps: 2 },
};
/** adaptive resolution range and the frame-time band it aims for */
export const LITE_SCALE = { start: 0.75, min: 0.5, max: 0.85, slowMs: 1000 / 28, fastMs: 1000 / 50 };
/** suggest performance mode when the frame rate stays below this for SLOW_WINDOW seconds of play */
const SLOW_FPS = 24, SLOW_WINDOW = 12;

export function createPerfModule(): GameModule {
  let game: Game | null = null;
  let on = false;
  let scale = LITE_SCALE.start;
  // adaptive resolution: frame time average over ~1 s windows
  let accMs = 0, accFrames = 0, fastFor = 0;
  // slow-frame detector (performance mode off)
  let slowSecs = 0, sinceLoad = 0, hinted = false;
  let banner: HTMLElement | null = null;

  const settings = () => game?.ext.settings as { perfMode: boolean; perfHintOff: boolean; set(k: string, v: unknown): void; onChange(cb: () => void): void } | undefined;

  const applyCaps = (g: Game) => {
    const c = on ? PERF_CAPS.lite : PERF_CAPS.normal;
    if (g.sim) g.sim.maxDebris = c.maxDebris;
    if (g.fire) g.fire.maxFires = c.maxFires;
    g.renderer.chips.limit = c.chips;
    g.renderer.bodies.budgetMs = c.budgetMs;
    g.maxSubsteps = c.substeps;
  };
  const apply = (g: Game) => {
    const want = !!settings()?.perfMode;
    if (want !== on || g.renderer.performanceMode !== want) {
      on = want;
      g.renderer.setPerformanceMode(on);
      if (on) { scale = LITE_SCALE.start; g.renderer.setResolutionScale(scale); }
      else g.renderer.setResolutionScale(Number(g.ext.settings?.resolutionScale) || 1);
      if (on) hideBanner();
    }
    applyCaps(g);
  };

  const hideBanner = () => { banner?.remove(); banner = null; };
  const showBanner = (fps: number) => {
    if (banner || !game) return;
    const root = document.getElementById('ui');
    if (!root) return;
    banner = document.createElement('div');
    banner.className = 'ws-perfhint';
    banner.setAttribute('style', 'position:absolute;left:50%;top:12px;transform:translateX(-50%);z-index:30;pointer-events:auto;' +
      'background:rgba(20,22,26,.86);color:#f1ead8;border:1px solid rgba(255,200,90,.55);border-radius:8px;padding:8px 12px;' +
      'font:13px/1.35 system-ui,sans-serif;max-width:min(560px,calc(100vw - 32px));display:flex;gap:10px;align-items:center;flex-wrap:wrap');
    banner.innerHTML = `<span>Running slowly (${Math.round(fps)} fps). <b>Performance mode</b> makes the game smoother on laptops — press <kbd>F7</kbd> or</span>` +
      '<button data-p="on" style="cursor:pointer;background:#ffc85a;color:#1b1b1b;border:0;border-radius:5px;padding:3px 9px;font:inherit;font-weight:600">Turn on</button>' +
      '<button data-p="later" style="cursor:pointer;background:none;color:#ddd;border:1px solid #777;border-radius:5px;padding:3px 9px;font:inherit">Not now</button>' +
      '<button data-p="never" style="cursor:pointer;background:none;color:#aaa;border:0;padding:3px 4px;font:inherit;text-decoration:underline">Don\'t ask again</button>';
    banner.addEventListener('click', (e) => {
      const act = (e.target as HTMLElement).closest<HTMLElement>('[data-p]')?.dataset.p;
      if (act === 'on') api.set(true);
      else if (act === 'never') settings()?.set('perfHintOff', true);
      if (act) hideBanner();
    });
    root.append(banner);
    // it goes away by itself after a while: the setting is always in Settings -> Graphics
    const b = banner;
    setTimeout(() => { if (banner === b) hideBanner(); }, 20000);
  };

  const playing = (g: Game) => !g.paused && !g.loading && !g.ext.photo?.active && !!g.sim;
  const detectSlow = (g: Game, fps: number, dt: number) => {
    if (on || hinted || settings()?.perfHintOff || !playing(g)) { slowSecs = 0; return; }
    if (sinceLoad < 6) return; // level just loaded: shader compiles / meshing make the first seconds slow
    slowSecs = fps > 0 && fps < SLOW_FPS ? slowSecs + dt : Math.max(0, slowSecs - dt * 2);
    if (slowSecs >= SLOW_WINDOW) { hinted = true; showBanner(fps); }
  };

  const api: PerfApi = {
    get on() { return on; },
    set(v: boolean) { settings()?.set('perfMode', v); if (game) apply(game); },
    get scale() { return scale; },
    get fps() { return game?.perf.fps ?? 0; },
    simulateSlow(fps: number, seconds: number) {
      if (!game) return;
      sinceLoad = Math.max(sinceLoad, 6);
      for (let t = 0; t < seconds; t += 0.25) detectSlow(game, fps, 0.25);
    },
    get hintVisible() { return !!banner; },
  };

  return {
    init(g) {
      game = g;
      g.ext.perf = api;
      settings()?.onChange(() => apply(g));
      apply(g);
      window.addEventListener('keydown', (e) => {
        if (e.code === 'F7' && banner) { e.preventDefault(); api.set(true); hideBanner(); }
      });
    },
    onLevelLoaded(g) { sinceLoad = 0; slowSecs = 0; apply(g); },
    frameUpdate(g, dt) {
      if (dt <= 0) return;
      sinceLoad += dt;
      const R = g.renderer;
      if (on) {
        // the overhead map and photo mode need the full far plane; play uses the short draw distance
        const far = g.ext.ui?.state?.().mapOpen || g.ext.photo?.active ? 600 : LITE_DRAW_DISTANCE;
        if (R.camera.far !== far) { R.camera.far = far; R.camera.updateProjectionMatrix(); }
        // adaptive resolution: hold ~28-50 fps by trading pixels (the scale changes at most once a second)
        if (playing(g) && !g.testMode) {
          accMs += dt * 1000; accFrames++;
          if (accMs >= 1000) {
            const avg = accMs / accFrames;
            accMs = 0; accFrames = 0;
            let next = scale;
            if (avg > LITE_SCALE.slowMs) { next = scale - 0.1; fastFor = 0; }
            else if (avg < LITE_SCALE.fastMs) { if (++fastFor >= 3) { next = scale + 0.05; fastFor = 0; } }
            else fastFor = 0;
            next = Math.round(Math.min(LITE_SCALE.max, Math.max(LITE_SCALE.min, next)) * 100) / 100;
            if (next !== scale) { scale = next; R.setResolutionScale(scale); }
          }
        }
      } else detectSlow(g, g.perf.fps, dt);
    },
  };
}
