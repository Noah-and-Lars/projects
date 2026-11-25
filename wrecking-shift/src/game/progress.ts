/**
 * Career progression + settings, persisted in localStorage (`wrecking-shift-save-v1`).
 * Tolerates missing / corrupt data and unavailable storage (falls back to memory).
 * No DOM access besides the injected storage, so it is unit-testable in Node.
 *
 * Score -> rank -> tool unlocks (RANKS), cash -> ammo upgrades (UPGRADES). Both tables are plain data:
 * unknown tool ids are ignored when applied to the belt, so tools can land in any order.
 */
import type { MissionDef, MissionResult } from '../sim/mission';
import type { ToolBelt } from '../sim/tools/tool';
import { AMMO_OPTIONS, TOUGHNESS_OPTIONS, isAlarmAssist, pickOption, scaleAmmo, type AlarmAssist } from './assists';
import { sanitizeKeys } from './keymap';
import { POWER_UPGRADES, applyPower, powerDef, type PowerDef } from '../sim/tools/power';

export const SAVE_KEY = 'wrecking-shift-save-v1';

// ------------------------------------------------------------------------------------------ tables

export interface RankDef { name: string; score: number; tools: string[] }
/** career ranks: total score needed and the tools that unlock with it */
export const RANKS: RankDef[] = [
  { name: 'Day Labourer', score: 0, tools: ['sledge', 'spray', 'extinguisher'] },
  { name: 'Hired Hand', score: 100, tools: ['blowtorch', 'leafblower'] },
  { name: 'Night Shifter', score: 200, tools: ['shotgun'] },
  { name: 'Load Bearer', score: 300, tools: ['plank', 'booster'] },
  { name: 'Wall Botherer', score: 400, tools: ['pipebomb'] },
  { name: 'Site Menace', score: 550, tools: ['pistol'] },
  { name: 'Foreman of Ruin', score: 700, tools: ['bomb'] },
  { name: 'Structural Concern', score: 900, tools: ['cable', 'rifle'] },
  { name: 'Harbour Legend', score: 1150, tools: ['rocket'] },
  { name: 'Shift Boss', score: 1400, tools: ['nitro'] },
  { name: 'Gullmouth\'s Problem', score: 2200, tools: [] },
];

/** display names for tools that may not exist yet in the belt (the belt's own `tool.name` wins) */
export const TOOL_NAMES: Record<string, string> = {
  sledge: 'Sledgehammer', spray: 'Spray Can', extinguisher: 'Extinguisher', blowtorch: 'Blowtorch', shotgun: 'Shotgun',
  plank: 'Planks', pipebomb: 'Pipe Bomb', pistol: 'Pistol', bomb: 'Bomb', cable: 'Cable', rocket: 'Rocket Launcher', nitro: 'Nitro',
  booster: 'Booster Can',
};

export interface UpgradeDef {
  tool: string;
  /** what one level adds, e.g. '+6 shells' */
  label: string;
  /** max ammo added per level */
  step: number;
  /** cost of each level (length = max level) */
  costs: number[];
}
/** ammo upgrades (cash). Tools with unlimited ammo are not listed. */
export const UPGRADES: UpgradeDef[] = [
  { tool: 'blowtorch', label: '+10 s fuel', step: 10, costs: [100, 200, 300, 400] },
  { tool: 'shotgun', label: '+6 shells', step: 6, costs: [150, 300, 450, 600] },
  { tool: 'plank', label: '+6 planks', step: 6, costs: [120, 240, 360] },
  { tool: 'pipebomb', label: '+3 pipe bombs', step: 3, costs: [200, 400, 600] },
  { tool: 'pistol', label: '+6 rounds', step: 6, costs: [150, 300, 450] },
  { tool: 'bomb', label: '+2 bombs', step: 2, costs: [300, 500, 700] },
  { tool: 'cable', label: '+3 cables', step: 3, costs: [250, 450] },
  { tool: 'rocket', label: '+2 rockets', step: 2, costs: [400, 650, 900] },
  { tool: 'nitro', label: '+2 nitro', step: 2, costs: [500, 800] },
];

// ------------------------------------------------------------------------------------------ settings

export type Quality = 'low' | 'medium' | 'high';
export interface SettingsData {
  /** mouse sensitivity multiplier 0.2..3 (1 = default) */
  sensitivity: number;
  invertY: boolean;
  /** vertical field of view, degrees 60..110 */
  fov: number;
  headBob: boolean;
  /** 0..1 */
  masterVolume: number;
  musicVolume: number;
  sfxVolume: number;
  quality: Quality;
  /** performance mode for low-end laptops (src/game/perfModule.ts) */
  perfMode: boolean;
  /** "don't suggest performance mode again" */
  perfHintOff: boolean;
  // --- assists (src/game/assists.ts) ---
  assistAlarm: AlarmAssist;
  /** max ammo multiplier in missions: 1 | 1.5 | 2 */
  assistAmmo: number;
  /** damage the player takes: 0.5 | 1 | 1.5 */
  assistToughness: number;
  /** every job on the board can be taken */
  assistJobs: boolean;
  // --- comfort ---
  /** exposure multiplier 0.6..1.6 */
  brightness: number;
  /** head bob amount 0..1 (`headBob` = amount > 0, kept for older readers) */
  headBobAmount: number;
  /** key binding overrides: action id -> KeyboardEvent.code (src/game/keymap.ts) */
  keys: Record<string, string>;
}
export const DEFAULT_SETTINGS: SettingsData = {
  sensitivity: 1, invertY: false, fov: 80, headBob: true, masterVolume: 0.8, musicVolume: 0.6, sfxVolume: 0.9, quality: 'medium',
  perfMode: false, perfHintOff: false,
  assistAlarm: 'normal', assistAmmo: 1, assistToughness: 1, assistJobs: false, brightness: 1, headBobAmount: 1, keys: {},
};

function sanitizeSettings(raw: any): SettingsData {
  const s = { ...DEFAULT_SETTINGS };
  if (!raw || typeof raw !== 'object') return s;
  const num = (v: any, lo: number, hi: number, d: number) => (typeof v === 'number' && isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d);
  s.sensitivity = num(raw.sensitivity, 0.2, 3, s.sensitivity);
  s.fov = Math.round(num(raw.fov, 60, 110, s.fov));
  s.masterVolume = num(raw.masterVolume, 0, 1, s.masterVolume);
  s.musicVolume = num(raw.musicVolume, 0, 1, s.musicVolume);
  s.sfxVolume = num(raw.sfxVolume, 0, 1, s.sfxVolume);
  if (typeof raw.invertY === 'boolean') s.invertY = raw.invertY;
  if (typeof raw.headBob === 'boolean') s.headBob = raw.headBob;
  if (typeof raw.perfMode === 'boolean') s.perfMode = raw.perfMode;
  if (typeof raw.perfHintOff === 'boolean') s.perfHintOff = raw.perfHintOff;
  if (raw.quality === 'low' || raw.quality === 'medium' || raw.quality === 'high') s.quality = raw.quality;
  if (isAlarmAssist(raw.assistAlarm)) s.assistAlarm = raw.assistAlarm;
  s.assistAmmo = pickOption(raw.assistAmmo, AMMO_OPTIONS, 1);
  s.assistToughness = pickOption(raw.assistToughness, TOUGHNESS_OPTIONS, 1);
  if (typeof raw.assistJobs === 'boolean') s.assistJobs = raw.assistJobs;
  s.brightness = num(raw.brightness, 0.6, 1.6, 1);
  // older saves only have the headBob switch
  s.headBobAmount = num(raw.headBobAmount, 0, 1, raw.headBob === false ? 0 : 1);
  s.headBob = s.headBobAmount > 0;
  s.keys = sanitizeKeys(raw.keys);
  return s;
}

/**
 * Live settings object published as `game.ext.settings`. Read fields directly
 * (`settings.masterVolume`), change with `set(key, value)`, subscribe with `onChange(cb)`.
 */
export class Settings implements SettingsData {
  sensitivity = DEFAULT_SETTINGS.sensitivity;
  invertY = DEFAULT_SETTINGS.invertY;
  fov = DEFAULT_SETTINGS.fov;
  headBob = DEFAULT_SETTINGS.headBob;
  masterVolume = DEFAULT_SETTINGS.masterVolume;
  musicVolume = DEFAULT_SETTINGS.musicVolume;
  sfxVolume = DEFAULT_SETTINGS.sfxVolume;
  quality: Quality = DEFAULT_SETTINGS.quality;
  perfMode = DEFAULT_SETTINGS.perfMode;
  perfHintOff = DEFAULT_SETTINGS.perfHintOff;
  assistAlarm: AlarmAssist = DEFAULT_SETTINGS.assistAlarm;
  assistAmmo = DEFAULT_SETTINGS.assistAmmo;
  assistToughness = DEFAULT_SETTINGS.assistToughness;
  assistJobs = DEFAULT_SETTINGS.assistJobs;
  brightness = DEFAULT_SETTINGS.brightness;
  headBobAmount = DEFAULT_SETTINGS.headBobAmount;
  keys: Record<string, string> = {};
  private listeners: ((s: Settings, key: keyof SettingsData | null) => void)[] = [];
  constructor(data: SettingsData, private persist: () => void) { Object.assign(this, data); }

  /** subscribe; returns an unsubscribe function. The callback also receives which key changed (null = all). */
  onChange(cb: (s: Settings, key: keyof SettingsData | null) => void): () => void {
    this.listeners.push(cb);
    return () => { const i = this.listeners.indexOf(cb); if (i >= 0) this.listeners.splice(i, 1); };
  }
  set<K extends keyof SettingsData>(key: K, value: SettingsData[K]): void {
    const cur: any = this.toJSON();
    // the head-bob switch and the amount slider stay in step
    if (key === 'headBob') cur.headBobAmount = value ? (this.headBobAmount || 1) : 0;
    const next = sanitizeSettings({ ...cur, [key]: value, ...(key === 'headBob' ? { headBobAmount: cur.headBobAmount } : {}) });
    (this as any)[key] = next[key];
    this.headBob = next.headBob; this.headBobAmount = next.headBobAmount;
    this.persist();
    for (const l of this.listeners) l(this, key);
  }
  reset(): void {
    Object.assign(this, DEFAULT_SETTINGS, { keys: {} });
    this.persist();
    for (const l of this.listeners) l(this, null);
  }
  toJSON(): SettingsData {
    const { sensitivity, invertY, fov, headBob, masterVolume, musicVolume, sfxVolume, quality, perfMode, perfHintOff } = this;
    const { assistAlarm, assistAmmo, assistToughness, assistJobs, brightness, headBobAmount } = this;
    return {
      sensitivity, invertY, fov, headBob, masterVolume, musicVolume, sfxVolume, quality, perfMode, perfHintOff,
      assistAlarm, assistAmmo, assistToughness, assistJobs, brightness, headBobAmount, keys: { ...this.keys },
    };
  }
}

// ------------------------------------------------------------------------------------------ save data

export interface MissionRecord {
  best: number; completed: boolean; plays: number; bestTime?: number;
  /** the best score was set with assists on (Settings -> Assists) */
  assisted?: boolean;
}
export interface SaveData {
  v: 1;
  missions: Record<string, MissionRecord>;
  cash: number;
  /** tool id -> upgrade level */
  upgrades: Record<string, number>;
  settings: SettingsData;
  lastMission?: string;
  /** challenge best scores by `<mode>@<levelId>` (optional: older saves have none) */
  challenges?: Record<string, ChallengeRecord>;
  /** one-time hints already shown (e.g. 'quicksave') */
  hints?: string[];
}
export interface ChallengeRecord { best: number; stars: number; plays: number }
export interface StorageLike { getItem(k: string): string | null; setItem(k: string, v: string): void }

function emptySave(): SaveData { return { v: 1, missions: {}, cash: 0, upgrades: {}, settings: { ...DEFAULT_SETTINGS } }; }

function sanitizeSave(raw: any): SaveData {
  const s = emptySave();
  if (!raw || typeof raw !== 'object') return s;
  if (raw.missions && typeof raw.missions === 'object') {
    for (const [id, r] of Object.entries<any>(raw.missions)) {
      if (!r || typeof r !== 'object') continue;
      s.missions[id] = {
        best: Math.max(0, Math.floor(Number(r.best) || 0)), completed: !!r.completed, plays: Math.max(0, Math.floor(Number(r.plays) || 0)),
        ...(typeof r.bestTime === 'number' && isFinite(r.bestTime) ? { bestTime: r.bestTime } : {}),
        ...(r.assisted === true ? { assisted: true } : {}),
      };
    }
  }
  s.cash = Math.max(0, Math.floor(Number(raw.cash) || 0));
  if (raw.upgrades && typeof raw.upgrades === 'object') {
    for (const [id, n] of Object.entries<any>(raw.upgrades)) { const v = Math.max(0, Math.floor(Number(n) || 0)); if (v) s.upgrades[id] = v; }
  }
  s.settings = sanitizeSettings(raw.settings);
  if (typeof raw.lastMission === 'string') s.lastMission = raw.lastMission;
  if (Array.isArray(raw.hints)) s.hints = raw.hints.filter((h: any) => typeof h === 'string').slice(0, 50);
  if (raw.challenges && typeof raw.challenges === 'object') {
    s.challenges = {};
    for (const [id, r] of Object.entries<any>(raw.challenges)) {
      if (!r || typeof r !== 'object') continue;
      s.challenges[id] = {
        best: Math.max(0, Math.floor(Number(r.best) || 0)), stars: Math.max(0, Math.min(3, Math.floor(Number(r.stars) || 0))),
        plays: Math.max(0, Math.floor(Number(r.plays) || 0)),
      };
    }
  }
  return s;
}

function defaultStorage(): StorageLike | null {
  try {
    const ls = (globalThis as any).localStorage as StorageLike | undefined;
    if (!ls) return null;
    const k = SAVE_KEY + '-probe';
    ls.setItem(k, '1');
    return ls;
  } catch { return null; }
}

export interface RecordOutcome {
  scoreBefore: number;
  scoreAfter: number;
  rankBefore: number;
  rankAfter: number;
  /** tool ids unlocked by this result */
  newTools: string[];
  newBest: boolean;
  previousBest: number;
  cashEarned: number;
}

export class Progress {
  data: SaveData;
  readonly settings: Settings;
  private storage: StorageLike | null;

  /** storage: omit = window.localStorage (if usable), null = memory only */
  constructor(storage?: StorageLike | null) {
    this.storage = storage === undefined ? defaultStorage() : storage;
    let raw: any = null;
    try { const txt = this.storage?.getItem(SAVE_KEY); raw = txt ? JSON.parse(txt) : null; } catch { raw = null; }
    this.data = sanitizeSave(raw);
    this.settings = new Settings(this.data.settings, () => this.save());
  }

  save(): void {
    this.data.settings = this.settings ? this.settings.toJSON() : this.data.settings;
    try { this.storage?.setItem(SAVE_KEY, JSON.stringify(this.data)); } catch { /* full / blocked: keep in memory */ }
  }

  /** wipe career (keeps settings) */
  resetCareer(): void {
    const settings = this.settings.toJSON();
    this.data = emptySave();
    this.data.settings = settings;
    this.save();
  }

  // ---------------------------------------------------------------- score / rank

  get cash(): number { return this.data.cash; }
  totalScore(): number { return Object.values(this.data.missions).reduce((s, r) => s + r.best, 0); }
  rankIndex(score = this.totalScore()): number {
    let r = 0;
    for (let i = 0; i < RANKS.length; i++) if (score >= RANKS[i].score) r = i;
    return r;
  }
  rank(score = this.totalScore()): RankDef & { index: number; next: RankDef | null; progress: number } {
    const i = this.rankIndex(score);
    const next = RANKS[i + 1] ?? null;
    const progress = next ? (score - RANKS[i].score) / (next.score - RANKS[i].score) : 1;
    return { ...RANKS[i], index: i, next, progress: Math.max(0, Math.min(1, progress)) };
  }
  unlockedTools(score = this.totalScore()): string[] {
    const out: string[] = [];
    for (const r of RANKS) if (score >= r.score) out.push(...r.tools);
    return out;
  }
  /** rank that unlocks a tool (null = not in the table: treated as always unlocked) */
  toolRank(id: string): RankDef | null { return RANKS.find((r) => r.tools.includes(id)) ?? null; }
  isToolUnlocked(id: string, score = this.totalScore()): boolean {
    const r = this.toolRank(id);
    return !r || score >= r.score;
  }

  // ---------------------------------------------------------------- missions

  record(id: string): MissionRecord | undefined { return this.data.missions[id]; }
  isMissionUnlocked(def: MissionDef): boolean {
    return this.settings.assistJobs || this.isMissionEarned(def);
  }
  /** unlocked by finishing the jobs it needs (ignores the "unlock all jobs" assist) */
  isMissionEarned(def: MissionDef): boolean {
    return (def.unlockAfter ?? []).every((id) => this.data.missions[id]?.completed);
  }
  /** one-time hints: true the first time a hint id is asked for (and remembers it) */
  takeHint(id: string): boolean {
    const h = (this.data.hints ??= []);
    if (h.includes(id)) return false;
    h.push(id);
    this.save();
    return true;
  }
  hasProgress(): boolean { return Object.keys(this.data.missions).length > 0 || this.data.cash > 0; }

  /** store a finished mission; cash only counts on success */
  recordResult(r: MissionResult): RecordOutcome {
    const scoreBefore = this.totalScore();
    const rankBefore = this.rankIndex(scoreBefore);
    const toolsBefore = new Set(this.unlockedTools(scoreBefore));
    const rec = this.data.missions[r.missionId] ?? { best: 0, completed: false, plays: 0 };
    const previousBest = rec.best;
    rec.plays++;
    let newBest = false;
    if (r.success) {
      rec.completed = true;
      if (r.score > rec.best) {
        rec.best = r.score; newBest = true;
        if (r.assists?.length) rec.assisted = true; else delete rec.assisted;
      }
      if (rec.bestTime == null || r.time < rec.bestTime) rec.bestTime = r.time;
      this.data.cash += Math.max(0, Math.floor(r.cash));
    }
    this.data.missions[r.missionId] = rec;
    this.data.lastMission = r.missionId;
    this.save();
    const scoreAfter = this.totalScore();
    return {
      scoreBefore, scoreAfter, rankBefore, rankAfter: this.rankIndex(scoreAfter),
      newTools: this.unlockedTools(scoreAfter).filter((t) => !toolsBefore.has(t)),
      newBest, previousBest, cashEarned: r.success ? Math.floor(r.cash) : 0,
    };
  }

  // ---------------------------------------------------------------- challenges (best score per mode + map)

  challengeRecord(key: string): ChallengeRecord | undefined { return this.data.challenges?.[key]; }
  /** store a challenge run; returns whether it beat the previous best */
  recordChallenge(key: string, score: number, stars: number): { newBest: boolean; previousBest: number } {
    const all = (this.data.challenges ??= {});
    const rec = all[key] ?? { best: 0, stars: 0, plays: 0 };
    const previousBest = rec.best;
    rec.plays++;
    const newBest = score > rec.best;
    if (newBest) rec.best = Math.floor(score);
    rec.stars = Math.max(rec.stars, Math.max(0, Math.min(3, stars)));
    all[key] = rec;
    this.save();
    return { newBest, previousBest };
  }

  // ---------------------------------------------------------------- upgrades

  upgradeLevel(tool: string): number { return this.data.upgrades[tool] ?? 0; }
  upgradeDef(tool: string): UpgradeDef | undefined { return UPGRADES.find((u) => u.tool === tool); }
  /** cost of the next level, or null when maxed / not upgradeable */
  nextUpgradeCost(tool: string): number | null {
    const u = this.upgradeDef(tool);
    if (!u) return null;
    return u.costs[this.upgradeLevel(tool)] ?? null;
  }
  canBuy(tool: string): boolean {
    const c = this.nextUpgradeCost(tool);
    return c != null && this.data.cash >= c && this.isToolUnlocked(tool);
  }
  buyUpgrade(tool: string): boolean {
    if (!this.canBuy(tool)) return false;
    this.data.cash -= this.nextUpgradeCost(tool)!;
    this.data.upgrades[tool] = this.upgradeLevel(tool) + 1;
    this.save();
    return true;
  }
  /** extra max ammo from upgrades */
  ammoBonus(tool: string): number {
    const u = this.upgradeDef(tool);
    return u ? u.step * Math.min(this.upgradeLevel(tool), u.costs.length) : 0;
  }

  // ---------------------------------------------------------------- power upgrades (src/sim/tools/power.ts)
  // Stored in the same `upgrades` map under dotted ids ('bomb.blast'): old saves simply have level 0.

  powerLevel(id: string): number {
    const d = powerDef(id);
    return d ? Math.min(this.data.upgrades[id] ?? 0, d.costs.length) : 0;
  }
  nextPowerCost(id: string): number | null {
    const d = powerDef(id);
    return d ? d.costs[this.powerLevel(id)] ?? null : null;
  }
  canBuyPower(id: string): boolean {
    const d = powerDef(id), c = this.nextPowerCost(id);
    return !!d && c != null && this.data.cash >= c && this.isToolUnlocked(d.tool);
  }
  buyPower(id: string): boolean {
    if (!this.canBuyPower(id)) return false;
    this.data.cash -= this.nextPowerCost(id)!;
    this.data.upgrades[id] = this.powerLevel(id) + 1;
    this.save();
    return true;
  }
  powerDefs(): PowerDef[] { return POWER_UPGRADES; }
  /** set every tool's power stats to the bought levels (level 0 resets to stock) */
  applyPower(belt: ToolBelt): void {
    for (const d of POWER_UPGRADES) { const t = belt.byId(d.tool); if (t) applyPower(t, d, this.powerLevel(d.id)); }
  }

  /**
   * Apply career state to a fresh belt. `base` = the tools' default maxAmmo by id (read from a
   * pristine createTools()), because Game.loadLevel carries maxAmmo over between levels.
   * - mission: unlocks by rank, upgrades, mission tool restrictions/ammo overrides, finite ammo
   * - sandbox: everything unlocked (ammo is infinite through game.infiniteAmmo)
   */
  applyToBelt(belt: ToolBelt, base: Map<string, number>, opts: { sandbox?: boolean; mission?: MissionDef | null }): void {
    const score = this.totalScore();
    const allow = opts.mission?.tools?.allow;
    const over = opts.mission?.tools?.ammo ?? {};
    for (const t of belt.tools) {
      const b = base.get(t.id) ?? t.maxAmmo;
      t.maxAmmo = b === Infinity ? Infinity : b + this.ammoBonus(t.id);
      if (over[t.id] != null && isFinite(over[t.id])) t.maxAmmo = Math.max(0, over[t.id]);
      if (!opts.sandbox) t.maxAmmo = scaleAmmo(t.maxAmmo, this.settings.assistAmmo); // ammo assist
      t.unlocked = opts.sandbox ? true : this.isToolUnlocked(t.id, score) && (!allow || allow.includes(t.id));
    }
    // always keep one usable tool selected
    if (!belt.current.unlocked) {
      const i = belt.tools.findIndex((t) => t.unlocked);
      if (i >= 0) belt.index = i;
    }
    this.applyPower(belt);
    belt.refillAll();
  }
}
