import type * as THREE from 'three';
import { FireFx, type FxQuality } from '../render/fireFx';
import { DT, type SimEvent } from '../sim/sim';
import type { Game, GameModule } from './game';

const QUALITY_KEY = 'wrecking-shift:fireQuality';

/**
 * Fire presentation glue: owns the FireFx (flames, embers, smoke, fire lights), feeds it from `game.fire` every
 * frame, turns explosion / big carve events into smoke and dust, and tells the fire sim where the water is.
 * Published as `game.ext.fireFx` (call `game.ext.fireFx.setQuality('low' | 'medium' | 'high')`).
 */
export class FireModule implements GameModule {
  fx!: FireFx;
  private lastTick = -1;

  init(game: Game): void {
    let q: FxQuality = 'medium';
    try {
      const s = localStorage.getItem(QUALITY_KEY);
      if (s === 'low' || s === 'medium' || s === 'high') q = s;
    } catch { /* storage unavailable */ }
    const fx = (this.fx = new FireFx(q));
    const setQuality = fx.setQuality.bind(fx);
    fx.setQuality = (level: FxQuality) => {
      setQuality(level);
      try { localStorage.setItem(QUALITY_KEY, level); } catch { /* ignore */ }
    };
    game.renderer.scene.add(fx.root);
    game.ext.fireFx = fx;
  }

  onLevelLoaded(game: Game): void {
    game.fire.waterLevel = game.level.waterLevel;
    this.fx.reset();
    const sky = game.level.sky ?? 'day';
    this.fx.lightIntensity = sky === 'night' ? 10 : 14;
    this.lastTick = game.sim.tick;
    this.frames = 0;
  }

  private frames = 0;
  /**
   * Smoke sprites are unlit: estimate how bright the scene is from its (non-fire) lights so smoke is not glowing
   * grey at night. Works with any light rig built from standard three.js lights (renderer is being reworked).
   */
  private estimateAmbient(game: Game): void {
    const fxRoot = this.fx.root;
    const sum = { r: 0, g: 0, b: 0 };
    game.renderer.scene.traverseVisible((o) => {
      const l = o as THREE.Light;
      if (!l.isLight || o.parent === fxRoot) return;
      let k = 0;
      if ((l as THREE.HemisphereLight).isHemisphereLight || (l as THREE.AmbientLight).isAmbientLight) k = 0.6;
      else if ((l as THREE.DirectionalLight).isDirectionalLight) k = 0.25;
      else return;
      sum.r += l.color.r * l.intensity * k; sum.g += l.color.g * l.intensity * k; sum.b += l.color.b * l.intensity * k;
    });
    // default daylight rig (hemi 1.1 + sun 2.6) maps to ~1
    const ref = 1.1 * 0.6 + 2.6 * 0.25;
    const c = (v: number) => Math.max(0.04, Math.min(1.3, v / ref));
    const lum = (sum.r + sum.g + sum.b) / 3;
    // keep smoke neutral grey: use the luminance, tinted only slightly by the light colour
    const r = c(lum * 0.8 + sum.r * 0.2), g = c(lum * 0.8 + sum.g * 0.2), b = c(lum * 0.8 + sum.b * 0.2);
    this.fx.ambient.setRGB(r, g, b);
  }

  onEvents(_game: Game, events: SimEvent[]): void {
    for (const e of events) {
      if (e.type === 'explosion') this.fx.explosion(e.pos, e.size);
      else if (e.type === 'carve' && e.removed > 150 && e.cause !== 'explosion') this.fx.dust(e.pos, e.removed);
    }
  }

  frameUpdate(game: Game, dt: number): void {
    const tick = game.sim.tick;
    const cam = game.renderer.camera;
    // the sim jumped ahead without frames (tests, loading hitches): settle the particles first
    if (this.frames++ % 30 === 0 || game.testMode) this.estimateAmbient(game);
    const ticks = tick - this.lastTick;
    if (ticks > 30 && game.fire.count() > 0) this.fx.prewarm(game.fire, cam, 1.5);
    this.lastTick = tick;
    if (game.paused) return;
    // test hooks step the sim several ticks per drawn frame: keep the particles in step with sim time
    if (game.testMode && ticks > 0 && ticks <= 30) dt = Math.max(dt, ticks * DT);
    this.fx.update(dt, game.fire, cam);
  }
}

export function fireModule(): FireModule {
  return new FireModule();
}
