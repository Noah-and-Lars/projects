/**
 * Mods glue (format: src/mods/api.ts, authoring guide: mods/README.md). Publishes `game.ext.mods` (ModsApi).
 *  - enabled state (Mods menu on the title screen and in the pause menu; remembered in localStorage)
 *  - rule tweaks (`global`) applied on every level load + every tick; visual tweaks every frame
 *  - mod tools join the belt in sandbox and in mod game modes (not in career jobs or challenges)
 *  - sandbox spawn menu (B): props and vehicles from enabled mods + the built-in ones, placed in front of you
 *  - mod game modes: load the mode's map, run its rules, HUD panel, result screen
 * Mod maps appear in the Sandbox list while enabled (src/game/levels.ts registers every mod map).
 */
import type { ModContext, ModeDef, ModeRules, ModeStatus, ModManifest } from '../mods/api';
import { ModState, MODS, allModes, allProps, allVehicles, modById } from '../mods/registry';
import { spawnVehicle } from '../sim/prefabs/vehicles';
import { setExtraTools, type Tool } from '../sim/tools';
import type { V3 } from '../sim/vec';
import { barrel, crate, sofa, table, chair, bookcase, plant, scrap, spool, sculpture } from '../sim/levels/kit';
import type { Sim } from '../sim/sim';
import type { Game, GameModule } from './game';
import { el, esc } from './ui/dom';

export interface SpawnEntry { id: string; name: string; group: string; kind: 'prop' | 'vehicle'; mod: string | null; spawn(sim: Sim, pos: V3, yaw: number): void }

export interface ModsApi {
  readonly state: ModState;
  readonly all: readonly ModManifest[];
  /** mod game mode running (null otherwise) */
  readonly mode: { def: ModeDef; status: ModeStatus } | null;
  readonly lastResult: { def: ModeDef; status: ModeStatus } | null;
  startMode(id: string): boolean;
  restartMode(): boolean;
  /** spawn menu entries (enabled mods + built-ins) */
  spawnables(): SpawnEntry[];
  /** spawn an entry a few metres in front of the player; returns false if unknown */
  spawn(id: string): boolean;
  /** the spawn menu is available (sandbox) */
  canSpawn(): boolean;
  /** enabled mod maps for the sandbox list */
  enabledMaps(): string[];
}

/** built-in spawnables (vehicles + props from the level kit) */
const BUILTIN: SpawnEntry[] = [
  { id: 'hatchback', name: 'Hatchback', group: 'Cars', kind: 'vehicle', mod: null, spawn: (s, p, y) => { spawnVehicle(s, 'hatchback', p.x, p.y, p.z, y); } },
  { id: 'van', name: 'Escape van', group: 'Trucks & vans', kind: 'vehicle', mod: null, spawn: (s, p, y) => { spawnVehicle(s, 'van', p.x, p.y, p.z, y); } },
  { id: 'loader', name: 'Wheel loader', group: 'Heavy', kind: 'vehicle', mod: null, spawn: (s, p, y) => { spawnVehicle(s, 'loader', p.x, p.y, p.z, y); } },
  { id: 'crate', name: 'Wooden crate', group: 'Basics', kind: 'prop', mod: null, spawn: (s, p, y) => { crate(s, p.x - 0.4, p.y, p.z - 0.4, 8, y); } },
  { id: 'barrel', name: 'Fuel barrel', group: 'Explosive', kind: 'prop', mod: null, spawn: (s, p) => { barrel(s, p.x - 0.3, p.y, p.z - 0.3, true); } },
  { id: 'sofa', name: 'Sofa', group: 'Furniture', kind: 'prop', mod: null, spawn: (s, p, y) => { sofa(s, p.x, p.y, p.z, y); } },
  { id: 'table', name: 'Table', group: 'Furniture', kind: 'prop', mod: null, spawn: (s, p) => { table(s, p.x - 0.7, p.y, p.z - 0.4); } },
  { id: 'chair', name: 'Chair', group: 'Furniture', kind: 'prop', mod: null, spawn: (s, p, y) => { chair(s, p.x, p.y, p.z, y); } },
  { id: 'bookcase', name: 'Bookcase', group: 'Furniture', kind: 'prop', mod: null, spawn: (s, p, y) => { bookcase(s, p.x, p.y, p.z, y); } },
  { id: 'plant', name: 'Pot plant', group: 'Furniture', kind: 'prop', mod: null, spawn: (s, p) => { plant(s, p.x, p.y, p.z); } },
  { id: 'scrap', name: 'Scrap heap', group: 'Basics', kind: 'prop', mod: null, spawn: (s, p) => { scrap(s, p.x, p.y, p.z); } },
  { id: 'spool', name: 'Cable spool', group: 'Basics', kind: 'prop', mod: null, spawn: (s, p) => { spool(s, p.x, p.y, p.z); } },
  { id: 'sculpture', name: 'Sculpture', group: 'Art', kind: 'prop', mod: null, spawn: (s, p) => { sculpture(s, p.x, p.y, p.z, 0); } },
];

/** fixed ticks between a mode ending and its result screen */
const END_DELAY = 60;

export function createModsModule(): GameModule {
  const state = new ModState();
  let game: Game | null = null;
  let applied: ModManifest[] = []; // global mods applied to the current level
  let tick = 0;
  let pendingMode: ModeDef | null = null;
  let mode: { def: ModeDef; rules: ModeRules } | null = null;
  let lastMode: ModeDef | null = null;
  let lastResult: { def: ModeDef; status: ModeStatus } | null = null;
  let endTimer = -1;
  let panel: HTMLElement | null = null;
  let filterApplied = '';
  let fovForced = false, todForced = false;

  const ctx = (g: Game): ModContext => ({ sim: g.sim, player: g.player, level: g.level, belt: g.belt, fire: g.fire, tick });

  // mod tools: created fresh for every belt (Game.setupWorld -> createBelt)
  const syncTools = () => {
    const makers: (() => Tool)[] = [];
    for (const m of state.enabled()) for (const t of m.tools ?? []) makers.push(() => t.create());
    setExtraTools(makers);
  };
  syncTools();

  const modToolIds = () => new Set(MODS.flatMap((m) => (m.tools ?? []).map((t) => t.id)));

  const applyGlobals = (g: Game) => {
    const want = state.enabled().filter((m) => m.global);
    for (const m of applied) if (!want.includes(m)) { try { m.global!.revert?.(ctx(g)); } catch (e) { console.warn('[mods] revert', m.id, e); } }
    // apply only mods not applied to this level yet (re-applying would compound multipliers)
    for (const m of want) if (!applied.includes(m)) { try { m.global!.apply?.(ctx(g)); } catch (e) { console.warn('[mods] apply', m.id, e); } }
    applied = want;
  };

  const sandbox = (g: Game) => !!g.ext.mission?.sandbox && !g.ext.mission?.current;

  const unlockTools = (g: Game) => {
    const ids = modToolIds();
    const allowMod = sandbox(g) || !!mode;
    for (const t of g.belt.tools) {
      if (ids.has(t.id)) t.unlocked = allowMod && (!mode?.def.tools || mode.def.tools.includes(t.id));
      else if (mode) t.unlocked = !mode.def.tools || mode.def.tools.includes(t.id);
    }
    if (!g.belt.current.unlocked) { const i = g.belt.tools.findIndex((t) => t.unlocked); if (i >= 0) g.belt.index = i; }
  };

  const showPanel = (g: Game) => {
    const root: HTMLElement | undefined = g.ext.hud?.root;
    if (!root) return;
    if (!panel) { panel = el('div', 'ws-modepanel'); root.append(panel); }
    if (!mode) { panel.style.display = 'none'; return; }
    const s = mode.rules.status();
    panel.style.display = '';
    const t = s.timeLeft == null ? '' : `<span class="clk">${Math.floor(s.timeLeft / 60)}:${String(Math.floor(s.timeLeft % 60)).padStart(2, '0')}</span>`;
    const html = `<div class="ttl">${esc(mode.def.title)}</div><div class="row"><span>${esc(s.text)}</span>${t}</div><div class="sc">Score <b>${s.score}</b></div>`;
    if (panel.innerHTML !== html) panel.innerHTML = html;
  };

  const forward = (g: Game, dist: number): { pos: V3; yaw: number } => {
    const p = g.player, f = p.forward;
    const l = Math.hypot(f.x, f.z) || 1;
    const fx = f.x / l, fz = f.z / l;
    const eye = p.eye;
    // stop short of walls in front, then find the ground below the spot
    const hit = g.sim.raycast(eye, { x: fx, y: 0, z: fz }, dist + 1);
    const d = hit ? Math.max(1.2, hit.dist - 1) : dist;
    const x = eye.x + fx * d, z = eye.z + fz * d;
    const down = g.sim.raycast({ x, y: eye.y + 2, z }, { x: 0, y: -1, z: 0 }, 30);
    const y = down ? down.point.y + 0.05 : p.pos.y;
    return { pos: { x, y, z }, yaw: p.yaw };
  };

  const api: ModsApi = {
    state,
    all: MODS,
    get mode() { return mode ? { def: mode.def, status: mode.rules.status() } : null; },
    get lastResult() { return lastResult; },
    startMode(id: string) {
      const def = allModes().find((m) => m.id === id);
      if (!def || !game) return false;
      pendingMode = def;
      game.ext.mission?.quit(def.level);
      return true;
    },
    restartMode() { return lastMode ? api.startMode(lastMode.id) : false; },
    spawnables() {
      const out: SpawnEntry[] = [...BUILTIN];
      for (const m of state.enabled()) {
        for (const p of m.props ?? []) out.push({ id: p.id, name: p.name, group: p.group ?? 'Mod props', kind: 'prop', mod: m.id, spawn: (s, pos, y) => { p.spawn(s, pos, y); } });
        for (const v of m.vehicles ?? []) out.push({ id: v.id, name: v.name, group: v.group ?? 'Mod vehicles', kind: 'vehicle', mod: m.id, spawn: (s, pos, y) => { spawnVehicle(s, v.id, pos.x, pos.y, pos.z, y); } });
      }
      return out;
    },
    spawn(id: string) {
      if (!game) return false;
      const e = api.spawnables().find((x) => x.id === id);
      if (!e) return false;
      const { pos, yaw } = forward(game, e.kind === 'vehicle' ? 5 : 2.5);
      e.spawn(game.sim, pos, e.kind === 'vehicle' ? yaw + Math.PI / 2 : yaw);
      game.sim.out.push({ type: 'custom', name: 'mods:spawn', data: { id, kind: e.kind } });
      return true;
    },
    canSpawn() { return !!game && sandbox(game); },
    enabledMaps() { return state.enabled().flatMap((m) => (m.maps ?? []).map((l) => l.id)); },
  };

  state.onChange(() => {
    syncTools();
    const g = game;
    if (!g || !g.sim) return;
    applyGlobals(g);
    // tools change with the next level load; visual tweaks apply next frame
  });

  return {
    init(g) {
      game = g;
      g.ext.mods = api;
    },
    onLevelLoaded(g) {
      tick = 0;
      endTimer = -1;
      if (mode && !pendingMode) mode = null; // any other load ends a running mode
      if (pendingMode) {
        const def = pendingMode;
        pendingMode = null;
        mode = { def, rules: def.create() };
        lastMode = def;
        lastResult = null;
        g.infiniteAmmo = !!def.infiniteAmmo;
        for (const t of g.belt.tools) t.unlocked = true;
        g.belt.refillAll();
      }
      unlockTools(g);
      applied = []; // a fresh level: every enabled rule tweak applies again
      applyGlobals(g);
      if (mode) {
        try { mode.rules.start(ctx(g)); } catch (e) { console.warn('[mods] mode start', mode.def.id, e); mode = null; }
      }
      showPanel(g);
    },
    fixedUpdate(g) {
      tick++;
      for (const m of applied) { try { m.global!.tick?.(ctx(g)); } catch (e) { console.warn('[mods] tick', m.id, e); } }
      if (mode) {
        const s0 = mode.rules.status();
        if (!s0.ended) mode.rules.tick(ctx(g));
        const s = mode.rules.status();
        if (s.ended && endTimer < 0 && !lastResult) {
          lastResult = { def: mode.def, status: s };
          g.ext.hud?.toast?.(`<b>${esc(mode.def.title)}</b> — ${esc(s.text)}`, s.won ? 'good' : 'warn', 4);
          g.sim.out.push({ type: 'custom', name: 'mods:modeEnd', data: { id: mode.def.id, won: s.won, score: s.score } });
          endTimer = END_DELAY;
        }
        if (endTimer > 0 && --endTimer === 0) { endTimer = -1; g.ext.ui?.openMenu?.('moderesult'); }
      }
    },
    frameUpdate(g) {
      showPanel(g);
      // visual tweaks (the last enabled mod wins per field)
      const R = g.renderer;
      const v: Required<Pick<import('../mods/api').VisualDef, 'saturation' | 'contrast' | 'vignette'>> & { cssFilter: string; fov?: number; tod?: string; bloom?: number } =
        { saturation: 1, contrast: 1.02, vignette: 0.28, cssFilter: '' };
      for (const m of state.enabled()) {
        const d = m.visual;
        if (!d) continue;
        if (d.saturation != null) v.saturation = d.saturation;
        if (d.contrast != null) v.contrast = d.contrast;
        if (d.vignette != null) v.vignette = d.vignette;
        if (d.cssFilter) v.cssFilter = d.cssFilter;
        if (d.fov) v.fov = d.fov;
        if (d.timeOfDay) v.tod = d.timeOfDay;
        if (d.bloom != null) v.bloom = d.bloom;
      }
      R.post.saturation = v.saturation; R.post.contrast = v.contrast; R.post.vignette = v.vignette;
      if (v.bloom != null) R.post.bloomStrength = v.bloom;
      if (v.tod) { if (R.timeOfDay !== v.tod) R.setTimeOfDay(v.tod as any); todForced = true; }
      else if (todForced) { todForced = false; R.setTimeOfDay(g.level.sky ?? 'sunset', !!g.level.sky); }
      if (v.fov) { g.fov = v.fov; fovForced = true; }
      else if (fovForced) { fovForced = false; g.fov = Number(g.ext.settings?.fov) || 80; }
      if (v.cssFilter !== filterApplied) { R.canvas.style.filter = v.cssFilter; filterApplied = v.cssFilter; }
    },
  };
}

/** test hook: names of all mods by category */
export function modSummary(): Record<string, number> {
  const out: Record<string, number> = {};
  for (const m of MODS) out[m.category] = (out[m.category] ?? 0) + 1;
  return out;
}
export { modById, allProps, allVehicles };
