/**
 * Softer map edges:
 *  - a far backdrop ring of low-poly hills / far shores outside level.bounds (src/render/backdrop.ts)
 *  - fog distances tuned to the level size (re-applied whenever the time-of-day preset changes them)
 *  - a soft boundary: a "turn back" warning within WARN m of the bounds, and the player (or the
 *    vehicle they drive) is held INSET m inside them (deterministic, in fixedUpdate)
 * Publishes `game.ext.edge` { backdrop (THREE.Mesh | null), warning (bool), inset, warn }.
 */
import type * as THREE from 'three';
import { buildBackdrop, fogForBounds } from '../render/backdrop';
import { SKY_PRESETS } from '../render/sky';
import type { Game, GameModule } from './game';
import { el, show } from './ui/dom';

const INSET = 1.0;
const WARN = 4.0;

export function createEdgeModule(): GameModule {
  let backdrop: THREE.Mesh | null = null;
  let warning = false;
  let warnEl: HTMLElement | null = null;
  const api = { get backdrop() { return backdrop; }, get warning() { return warning; }, inset: INSET, warn: WARN };

  function rebuild(game: Game): void {
    if (backdrop) { game.renderer.scene.remove(backdrop); backdrop.geometry.dispose(); (backdrop.material as THREE.Material).dispose(); backdrop = null; }
    const lv = game.level, sim = game.sim, b = lv.bounds;
    let hasTerrain = false;
    for (const body of sim.bodies.values()) if (body.tags.has('terrain')) { hasTerrain = true; break; }
    const only = hasTerrain ? (x: any) => x.tags.has('terrain') : (x: any) => !x.dynamic;
    const top = b.max.y + 5, span = b.max.y - b.min.y + 20;
    backdrop = buildBackdrop({
      bounds: b, waterLevel: lv.waterLevel, seed: game.levelId.length,
      edgeHeight: (x, z) => sim.raycast({ x, y: top, z }, { x: 0, y: -1, z: 0 }, span, null, only)?.point.y ?? null,
    });
    game.renderer.scene.add(backdrop);
  }

  function inside(v: number, lo: number, hi: number): number { return Math.max(lo, Math.min(hi, v)); }

  return {
    init(game) { game.ext.edge = api; },
    onLevelLoaded(game) { rebuild(game); warning = false; },
    fixedUpdate(game) {
      const b = game.level.bounds, p = game.player;
      const veh = game.ext.vehicles?.current;
      if (veh && p.seated && veh.body && !veh.body.removed) {
        // push the vehicle back: kill outward velocity, nudge inward
        const rb = veh.body.rb, c = veh.body.center(), v = rb.linvel();
        let vx = v.x, vz = v.z, hit = false;
        if (c.x < b.min.x + INSET + 1 && vx < 1) { vx = Math.abs(vx) * 0.3 + 1.5; hit = true; }
        if (c.x > b.max.x - INSET - 1 && vx > -1) { vx = -Math.abs(vx) * 0.3 - 1.5; hit = true; }
        if (c.z < b.min.z + INSET + 1 && vz < 1) { vz = Math.abs(vz) * 0.3 + 1.5; hit = true; }
        if (c.z > b.max.z - INSET - 1 && vz > -1) { vz = -Math.abs(vz) * 0.3 - 1.5; hit = true; }
        if (hit) rb.setLinvel({ x: vx, y: v.y, z: vz }, true);
        warning = c.x < b.min.x + WARN || c.x > b.max.x - WARN || c.z < b.min.z + WARN || c.z > b.max.z - WARN;
        return;
      }
      if (p.seated) { warning = false; return; }
      const q = p.pos;
      const x = inside(q.x, b.min.x + INSET, b.max.x - INSET), z = inside(q.z, b.min.z + INSET, b.max.z - INSET);
      if (x !== q.x || z !== q.z) {
        const vy = p.vel.y;
        p.teleport({ x, y: q.y, z });
        p.vel.y = vy; // keep falling / jumping
      }
      warning = q.x < b.min.x + WARN || q.x > b.max.x - WARN || q.z < b.min.z + WARN || q.z > b.max.z - WARN;
    },
    frameUpdate(game) {
      // fog: keep the preset's look but never let the far fog line sit beyond the backdrop rim
      const fog = game.renderer.scene.fog as THREE.Fog | null;
      const preset = SKY_PRESETS[game.renderer.timeOfDay];
      if (fog && preset && !game.ext.ui?.state?.().mapOpen) {
        const f = fogForBounds(game.level.bounds, preset);
        // performance mode draws less far: the fog must be opaque before the far plane cuts the world off
        if (game.renderer.performanceMode) { f.far = Math.min(f.far, game.renderer.drawDistance * 0.94); f.near = Math.min(f.near, f.far * 0.3); }
        if (fog.far !== f.far || fog.near !== f.near) { fog.far = f.far; fog.near = f.near; }
      }
      const root: HTMLElement | undefined = game.ext.hud?.root;
      if (!warnEl && root) { warnEl = el('div', 'ws-edge', 'Turn back — edge of the site'); root.append(warnEl); }
      if (warnEl) show(warnEl, warning && game.controlsEnabled && !game.ext.photo?.active);
    },
  };
}
