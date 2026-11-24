/**
 * GameModule glue for the heist framework: owns the running Mission, the career Progress and the
 * Settings, applies unlocks/upgrades to the tool belt and settings to the game.
 *
 * Publishes:
 *   game.ext.mission   MissionApi (below)
 *   game.ext.progress  Progress (src/game/progress.ts)
 *   game.ext.settings  Settings (fields + set(key, v) + onChange(cb))
 */
import { Mission, type MissionDef, type MissionJSON, type MissionResult } from '../sim/mission';
import { createTools } from '../sim/tools';
import type { Game, GameModule } from './game';
import { LEVELS } from './levels';
import { MISSIONS, missionById } from './missions';
import { Progress, type RecordOutcome } from './progress';

export interface MissionApi {
  /** running mission (null in sandbox / free play) */
  readonly current: Mission | null;
  readonly def: MissionDef | null;
  /** true in sandbox mode (all tools, infinite ammo, no mission) */
  readonly sandbox: boolean;
  readonly list: MissionDef[];
  byId(id: string): MissionDef | undefined;
  /** load the mission's level and start it */
  start(id: string): boolean;
  startSandbox(levelId: string): void;
  /** restart the current mission / sandbox level */
  restart(): void;
  /** drop the mission and load a plain level (menu backdrop) */
  quit(levelId?: string): void;
  /** mission state for quicksave (null without a mission) */
  serialize(): MissionJSON | null;
  /** restore after the sim was restored to the matching state */
  restore(json: MissionJSON): void;
  /** result + progress outcome of the last finished mission */
  readonly lastResult: MissionResult | null;
  readonly lastOutcome: RecordOutcome | null;
  /** called once when a mission ends (success or fail) */
  onEnd(cb: (r: MissionResult, o: RecordOutcome) => void): () => void;
}

const BASE_SENSITIVITY = 0.0023;

export class MissionModule implements GameModule {
  game!: Game;
  mission: Mission | null = null;
  def: MissionDef | null = null;
  sandbox = false;
  sandboxLevel = '';
  progress!: Progress;
  lastResult: MissionResult | null = null;
  lastOutcome: RecordOutcome | null = null;
  private pending: { mission?: MissionDef; sandbox?: string } | null = null;
  private endCbs: ((r: MissionResult, o: RecordOutcome) => void)[] = [];
  private baseAmmo = new Map<string, number>();
  private reported = false;

  init(game: Game): void {
    this.game = game;
    this.progress = game.ext.progress ?? new Progress();
    game.ext.progress = this.progress;
    game.ext.settings = this.progress.settings;
    for (const t of createTools()) this.baseAmmo.set(t.id, t.maxAmmo);
    const apply = () => {
      const s = this.progress.settings;
      game.fov = s.fov;
      game.input.sensitivity = BASE_SENSITIVITY * s.sensitivity;
      game.input.invertY = s.invertY;
    };
    apply();
    this.progress.settings.onChange(apply);
    game.ext.mission = this.api();
  }

  private api(): MissionApi {
    const self = this;
    return {
      get current() { return self.mission; },
      get def() { return self.def; },
      get sandbox() { return self.sandbox; },
      list: MISSIONS,
      byId: missionById,
      start: (id) => this.start(id),
      startSandbox: (lv) => this.startSandbox(lv),
      restart: () => this.restart(),
      quit: (lv) => this.quit(lv),
      serialize: () => this.mission?.toJSON() ?? null,
      restore: (json) => this.restore(json),
      get lastResult() { return self.lastResult; },
      get lastOutcome() { return self.lastOutcome; },
      onEnd: (cb) => { this.endCbs.push(cb); return () => { const i = this.endCbs.indexOf(cb); if (i >= 0) this.endCbs.splice(i, 1); }; },
    };
  }

  start(id: string): boolean {
    const def = missionById(id);
    if (!def) return false;
    this.pending = { mission: def };
    this.game.loadLevel(def.levelId, def.seed ?? 1234);
    return true;
  }
  startSandbox(levelId: string): void {
    const id = LEVELS[levelId] ? levelId : Object.keys(LEVELS)[0];
    this.pending = { sandbox: id };
    this.game.loadLevel(id);
  }
  restart(): void {
    if (this.def) this.start(this.def.id);
    else if (this.sandbox) this.startSandbox(this.sandboxLevel);
    else this.game.loadLevel(this.game.levelId);
  }
  quit(levelId = 'testyard'): void {
    this.pending = null;
    this.game.loadLevel(LEVELS[levelId] ? levelId : Object.keys(LEVELS)[0]);
  }
  restore(json: MissionJSON): void {
    const def = missionById(json.id);
    if (!def) return;
    this.mission?.dispose();
    const g = this.game;
    this.mission = Mission.fromJSON(def, json, { sim: g.sim, level: g.level, player: g.player, fireCount: () => g.fire.count() });
    this.def = def;
    this.reported = this.mission.ended;
  }

  onLevelLoaded(game: Game): void {
    this.mission?.dispose();
    this.mission = null;
    this.def = null;
    this.sandbox = false;
    this.reported = false;
    const p = this.pending;
    this.pending = null;
    if (p?.mission) {
      const def = p.mission;
      def.setup?.(game.sim, game.level);
      if (def.timeOfDay) game.level.sky = def.timeOfDay;
      this.def = def;
      this.mission = new Mission(def, { sim: game.sim, level: game.level, player: game.player, fireCount: () => game.fire.count() });
      game.infiniteAmmo = false;
      this.progress.applyToBelt(game.belt, this.baseAmmo, { mission: def });
    } else if (p?.sandbox) {
      this.sandbox = true;
      this.sandboxLevel = p.sandbox;
      game.infiniteAmmo = true;
      this.progress.applyToBelt(game.belt, this.baseAmmo, { sandbox: true });
    }
    // free play (?level= / tests): belt left as the game built it
    game.ext.hud?.setPrompt(null, 0, 'mission');
  }

  fixedUpdate(game: Game): void {
    const m = this.mission;
    if (!m) return;
    m.update({ interact: game.controlsEnabled && game.pendingKeys.has('KeyE') });
    this.updatePrompt(game);
    if (m.ended && !this.reported && m.result) {
      this.reported = true;
      this.lastResult = m.result;
      this.lastOutcome = this.progress.recordResult(m.result);
      for (const cb of this.endCbs) cb(m.result, this.lastOutcome);
    }
  }

  /** crosshair prompt for whatever the mission focus is (shown by the HUD) */
  private updatePrompt(game: Game): void {
    const hud = game.ext.hud;
    if (!hud) return;
    const f = this.mission?.focus;
    let text: string | null = null;
    if (f && game.controlsEnabled) {
      if (f.kind === 'target') text = `E — take ${f.name}`;
      else if (f.kind === 'valuable') text = `E — pocket ${f.name} ($${f.amount})`;
      else text = 'E — clock out (finish the job)';
    }
    hud.setPrompt(text, 10, 'mission');
  }
}
