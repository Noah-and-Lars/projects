/**
 * GameModule glue for the challenge modes (rules: src/sim/challenge.ts).
 *
 * Publishes `game.ext.challenge` (ChallengeApi below). Only one of mission / sandbox / challenge is
 * active at a time: a challenge exists only on a level load that this module asked for; every other
 * load (mission start, sandbox, quit to title) drops it. The UI shows the results screen
 * (`ui.openMenu('chresult')`) a moment after the run ends.
 */
import { CHALLENGE_MODES, Challenge, RUBBLE, challengeKey, type ChallengeModeId, type ChallengeResult } from '../sim/challenge';
import type { SimEvent } from '../sim/sim';
import { createTools } from '../sim/tools';
import type { Game, GameModule } from './game';
import type { Progress } from './progress';
import { ChallengeHud } from './ui/challengeUi';

/** maps the challenges can be played on */
export const CHALLENGE_LEVELS = ['harbor', 'ridge', 'works'];
/** fixed ticks between the end of a run and the results screen */
const END_DELAY = 45;

export interface ChallengeApi {
  readonly current: Challenge | null;
  /** a challenge is loaded (running or waiting for its clock) */
  readonly active: boolean;
  readonly modes: typeof CHALLENGE_MODES;
  readonly levels: string[];
  /** load `levelId` and start the challenge on it */
  start(mode: ChallengeModeId, levelId: string): boolean;
  /** same mode + map again */
  restart(): boolean;
  /** last finished run + whether it was a new best */
  readonly lastResult: ChallengeResult | null;
  readonly lastBest: { newBest: boolean; previousBest: number } | null;
  best(mode: ChallengeModeId, levelId: string): { best: number; stars: number; plays: number } | undefined;
  onEnd(cb: (r: ChallengeResult) => void): () => void;
  /** test hook: finish the running challenge now with the clock at 0 (rubble: time, snatch: late) */
  expire(): void;
}

export class ChallengeModule implements GameModule {
  game!: Game;
  current: Challenge | null = null;
  lastResult: ChallengeResult | null = null;
  lastBest: { newBest: boolean; previousBest: number } | null = null;
  private pending: { mode: ChallengeModeId; levelId: string } | null = null;
  private last: { mode: ChallengeModeId; levelId: string } | null = null;
  private reported = false;
  private endTimer = -1;
  private cbs: ((r: ChallengeResult) => void)[] = [];
  private baseAmmo = new Map<string, number>();
  private hud: ChallengeHud | null = null;

  init(game: Game): void {
    this.game = game;
    for (const t of createTools()) this.baseAmmo.set(t.id, t.maxAmmo);
    const self = this;
    const api: ChallengeApi = {
      get current() { return self.current; },
      get active() { return !!self.current; },
      modes: CHALLENGE_MODES,
      levels: CHALLENGE_LEVELS,
      start: (mode, lv) => this.start(mode, lv),
      restart: () => (this.last ? this.start(this.last.mode, this.last.levelId) : false),
      get lastResult() { return self.lastResult; },
      get lastBest() { return self.lastBest; },
      best: (mode, lv) => this.progress?.challengeRecord(challengeKey(mode, lv)),
      onEnd: (cb) => { this.cbs.push(cb); return () => { const i = this.cbs.indexOf(cb); if (i >= 0) this.cbs.splice(i, 1); }; },
      expire: () => this.current?.expireClock(),
    };
    game.ext.challenge = api;
  }

  private get progress(): Progress | undefined { return this.game.ext.progress; }

  start(mode: ChallengeModeId, levelId: string): boolean {
    if (!CHALLENGE_MODES[mode]) return false;
    this.pending = { mode, levelId };
    this.last = { mode, levelId };
    this.game.loadLevel(levelId);
    return !!this.current;
  }

  onLevelLoaded(game: Game): void {
    this.current?.dispose();
    this.current = null;
    this.reported = false;
    this.endTimer = -1;
    game.ext.hud?.setPrompt(null, 0, 'challenge');
    const p = this.pending;
    this.pending = null;
    if (!p) return;
    this.current = new Challenge(p.mode, { sim: game.sim, level: game.level, levelId: game.levelId, player: game.player });
    // every tool, generous fixed ammo
    game.infiniteAmmo = false;
    const f = p.mode === 'rubble' ? RUBBLE.ammoFactor : 2;
    for (const t of game.belt.tools) {
      const b = this.baseAmmo.get(t.id) ?? t.maxAmmo;
      t.maxAmmo = b === Infinity ? Infinity : Math.ceil(b * f);
      t.unlocked = true;
    }
    game.belt.refillAll();
  }

  fixedUpdate(game: Game): void {
    const c = this.current;
    if (!c) return;
    c.update({ interact: game.controlsEnabled && game.pendingKeys.has('KeyE') });
    const hud = game.ext.hud;
    if (hud) {
      const f = c.focus;
      const text = f && game.controlsEnabled ? (f.kind === 'crate' ? 'E — lift the crate' : `E — clock out (${c.cratesTaken} crate${c.cratesTaken === 1 ? '' : 's'})`) : null;
      hud.setPrompt(text, 10, 'challenge');
    }
    if (c.ended && c.result && !this.reported) {
      this.reported = true;
      this.lastResult = c.result;
      this.lastBest = c.result.outcome === 'quit' || !this.progress ? null
        : this.progress.recordChallenge(challengeKey(c.mode, c.levelId), c.result.score, c.result.stars);
      game.controlsEnabled = false;
      game.ext.hud?.setPrompt(null, 0, 'challenge');
      this.endTimer = END_DELAY;
      for (const cb of this.cbs) cb(c.result);
    }
    if (this.endTimer > 0 && --this.endTimer === 0) {
      this.endTimer = -1;
      game.ext.ui?.openMenu?.('chresult');
    }
  }

  frameUpdate(game: Game): void {
    const root: HTMLElement | undefined = game.ext.hud?.root;
    if (!this.hud && root && typeof document !== 'undefined') { this.hud = new ChallengeHud(); root.append(this.hud.root); }
    this.hud?.update(this.current);
  }

  onEvents(game: Game, events: SimEvent[]): void {
    if (!this.current) return;
    const hud = game.ext.hud;
    if (!hud) return;
    for (const e of events) {
      if (e.type !== 'custom') continue;
      const d = e.data ?? {};
      if (e.name === 'challenge:start') hud.toast(`<b>Clock running</b> — ${d.seconds} s`, 'alarm', 3);
      else if (e.name === 'challenge:pickup') hud.toast(`<b>Crate ${d.count}/${d.total}</b> bagged`, 'cash', 2.5);
    }
  }
}
