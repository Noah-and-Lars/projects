/**
 * Wrecking Shift mod format (authoring guide: mods/README.md).
 *
 * A mod is one TypeScript file `mods/<category>/<id>.mod.ts` whose default export is `defineMod({...})`.
 * Every such file is bundled at build time (import.meta.glob in src/mods/registry.ts): no runtime file loading,
 * so mods work in the single-file build. A mod can contribute any mix of:
 *   props     spawnable voxel objects (sandbox spawn menu, B)        -> PropDef
 *   tools     extra belt tools (sandbox; Tool subclasses)            -> ToolDef
 *   vehicles  drivable voxel vehicles (spawn menu)                   -> VehicleModDef
 *   maps      sandbox maps (level generators)                        -> MapDef
 *   modes     game modes with their own rules, clock and score       -> ModeDef
 *   global    rule tweaks applied to every level while enabled       -> GlobalHooks
 *   visual    look tweaks (grade, time of day, fog)                  -> VisualDef
 *
 * Everything except `visual` is deterministic sim code (runs in Node; tests/unit/mods.test.ts loads, builds,
 * spawns, uses and plays every mod). Use `ctx.sim.rng` for randomness, never Math.random.
 */
import type { VoxelBody } from '../sim/body';
import type { FireApi } from '../sim/fire';
import type { LevelDef, LevelInfo } from '../sim/levels/types';
import type { Player } from '../sim/player';
import type { Sim } from '../sim/sim';
import type { Tool, ToolBelt } from '../sim/tools/tool';
import type { V3 } from '../sim/vec';
import type { VehicleBlueprint } from '../sim/vehicle';

export type ModCategory = 'props' | 'tools' | 'vehicles' | 'maps' | 'modes' | 'global' | 'visual';

/** what sim-side mod code gets to work with */
export interface ModContext {
  sim: Sim;
  player: Player;
  level: LevelInfo;
  belt?: ToolBelt;
  fire?: FireApi;
  /** ticks since the level / mode started */
  tick: number;
}

export interface PropDef {
  id: string;
  name: string;
  /** spawn menu group, e.g. 'Furniture', 'Explosive', 'Structure' */
  group?: string;
  /**
   * Build the prop with its lowest centre at `pos`, facing `yaw` (player convention: 0 = -Z). Return the
   * created bodies (static or dynamic). Use the helpers in src/mods/kit.ts or src/sim/levels/kit.
   */
  spawn(sim: Sim, pos: V3, yaw: number): VoxelBody | VoxelBody[];
}

/**
 * Tools set `look` to a built-in tool id for their view model, sounds and effects. Some looks expect fields the
 * presentation reads (src/game/toolsModule.ts): 'rocket' -> `projectiles: {pos, vel}[]`, 'pipebomb' ->
 * `live: {pos}[]`, 'blowtorch' -> `range`, 'cable' -> `ends()` + `preview`, 'plank' -> `preview`. Subclass the
 * built-in tool (or use `variant`) to get them for free.
 */
export interface ToolDef {
  /** global tool id (prefix it with the mod id to stay unique) */
  id: string;
  /** tool group / number key 1..6 (1 Hands, 2 Rigging, 3 Guns, 4 Charges, 5 Job kit, 6 Extras; default 6) */
  group?: number;
  create(): Tool;
}

export interface VehicleModDef {
  /** vehicle id (unique among all vehicles) */
  id: string;
  name: string;
  group?: string;
  blueprint(): VehicleBlueprint;
}

export interface MapDef extends LevelDef {
  /** one line for the sandbox card */
  blurb?: string;
}

/** state a running mode shows on the HUD */
export interface ModeStatus {
  /** objective / status line */
  text: string;
  score: number;
  /** seconds left, or null for no clock */
  timeLeft: number | null;
  ended: boolean;
  won: boolean;
}

export interface ModeRules {
  /** after the level was built and the player placed */
  start(ctx: ModContext): void;
  /** every fixed tick while running (before sim.step) */
  tick(ctx: ModContext): void;
  status(): ModeStatus;
}

export interface ModeDef {
  id: string;
  title: string;
  /** rules shown before starting */
  rules: string[];
  /** map id (built-in or from a mod) the mode is played on */
  level: string;
  /** infinite ammo (default false: belt is refilled at start) */
  infiniteAmmo?: boolean;
  /** tool ids allowed (default: every tool) */
  tools?: string[];
  create(): ModeRules;
}

export interface GlobalHooks {
  /** after every level load (and when the mod is switched on mid-level) */
  apply?(ctx: ModContext): void;
  /** every fixed tick, before sim.step */
  tick?(ctx: ModContext): void;
  /** when the mod is switched off mid-level: undo what apply did */
  revert?(ctx: ModContext): void;
}

/** presentation-only look tweaks (applied by src/game/modsModule.ts) */
export interface VisualDef {
  saturation?: number;
  contrast?: number;
  vignette?: number;
  bloom?: number;
  /** force a time-of-day preset */
  timeOfDay?: 'day' | 'sunset' | 'overcast' | 'night';
  /** field of view override (degrees) */
  fov?: number;
  /** CSS filter laid over the canvas (cheap stylisation: 'sepia(.6)', 'hue-rotate(90deg)') */
  cssFilter?: string;
}

export interface ModManifest {
  id: string;
  name: string;
  author?: string;
  version?: string;
  category: ModCategory;
  description: string;
  /** enabled when first seen (default: true for content, false for global / visual tweaks) */
  defaultEnabled?: boolean;
  /** mods with the same conflict key cannot be enabled together (e.g. 'gravity') */
  conflicts?: string;
  props?: PropDef[];
  tools?: ToolDef[];
  vehicles?: VehicleModDef[];
  maps?: MapDef[];
  modes?: ModeDef[];
  global?: GlobalHooks;
  visual?: VisualDef;
}

/** identity helper that type-checks a mod */
export function defineMod(m: ModManifest): ModManifest { return m; }
