import type { FireApi } from '../fire';
import { Grabber } from '../grab';
import type { Player } from '../player';
import type { Sim } from '../sim';

/** Per-tick tool input (already edge-detected). */
export interface ToolInput {
  primary: boolean;
  primaryPressed: boolean;
  primaryReleased: boolean;
  secondary: boolean;
  secondaryPressed: boolean;
  /** -1 / 0 / +1 mouse wheel this tick */
  scroll: number;
  /** interact key (E) pressed this tick */
  interactPressed: boolean;
}

export const emptyToolInput = (): ToolInput => ({
  primary: false, primaryPressed: false, primaryReleased: false, secondary: false, secondaryPressed: false, scroll: 0, interactPressed: false,
});

export interface ToolContext {
  sim: Sim;
  player: Player;
  /** sandbox: never consume ammo */
  infiniteAmmo: boolean;
  /** fire system (blowtorch ignites, extinguisher puts out). Optional: tools work without it. */
  fire?: FireApi;
}

/**
 * Base class for player tools. Tools live in the deterministic sim: all randomness through
 * `ctx.sim.rng`, time in ticks. Presentation (view model, sounds, particles) reacts to
 * `sim.out` events — emit `{ type: 'custom', name: 'tool:<something>', data }` for anything the
 * core events (carve / explosion / ...) do not already cover.
 */
export abstract class Tool {
  abstract readonly id: string;
  abstract readonly name: string;
  /** Infinity = unlimited */
  ammo = Infinity;
  maxAmmo = Infinity;
  unlocked = true;
  /** ticks until the tool can fire again */
  cooldown = 0;
  /** 0..1 use animation phase for the view model (1 right after use, decays) */
  anim = 0;
  /** continuous tools (spray, foam, torch): true while working this tick */
  active = false;
  /** built-in tool id whose view model / sounds / effects this tool uses (mod tools) */
  look?: string;
  /** tool group 1..6 = number key (1 Hands, 2 Rigging, 3 Guns, 4 Charges, 5 Job kit, 6 Extras); default by id */
  group?: number;
  /** order inside the group (lower first); default: belt order */
  order?: number;
  /** short HUD hint, e.g. "LMB swing" */
  hint = '';
  /** ammo shown by the HUD ('' = unlimited). Blowtorch overrides (seconds of fuel). */
  get ammoLabel(): string { return this.ammo === Infinity ? '' : String(Math.max(0, Math.ceil(this.ammo))); }

  /** called every tick while selected */
  abstract update(ctx: ToolContext, input: ToolInput): void;
  /** called every tick even when not selected (fuses, projectiles owned by the tool...) */
  tick(_ctx: ToolContext): void {}
  onSelect(_ctx: ToolContext): void {}
  onDeselect(_ctx: ToolContext): void {}
  /** quicksave: extra state beyond ammo (JSON-able), restored with `load` into a fresh tool on a restored sim */
  save(): any { return undefined; }
  load(_ctx: ToolContext, _data: any): void {}
  /** refill at mission start */
  refill(): void { this.ammo = this.maxAmmo; }

  protected useAmmo(ctx: ToolContext, n = 1): boolean {
    if (this.ammo === Infinity || ctx.infiniteAmmo) return true;
    if (this.ammo < n) return false;
    this.ammo -= n;
    return true;
  }
  /** has ammo (does not consume) */
  protected hasAmmo(ctx: ToolContext, n = 1): boolean {
    return this.ammo === Infinity || ctx.infiniteAmmo || this.ammo >= n;
  }
  /** emit tool:empty (rate limited by cooldown) */
  protected empty(ctx: ToolContext): void {
    if (this.cooldown > 0) return;
    this.cooldown = 20;
    ctx.sim.out.push({ type: 'custom', name: 'tool:empty', data: { tool: this.id } });
  }
}

/**
 * Mod tools reuse a built-in tool's presentation (view model, sounds, muzzle flash, previews): `look` names it.
 * `lookOf(id)` maps any tool id to the built-in id to present it as (registered when a belt is created).
 */
const LOOKS = new Map<string, string>();
export function registerLook(id: string, look: string): void { LOOKS.set(id, look); }
export const lookOf = (id: string): string => LOOKS.get(id) ?? id;

const IDLE: ToolInput = Object.freeze(emptyToolInput());

/** tool groups (number keys 1-6) — see docs/research/12-inventory.md */
export const TOOL_GROUPS: { n: number; name: string }[] = [
  { n: 1, name: 'Hands' }, { n: 2, name: 'Rigging' }, { n: 3, name: 'Guns' },
  { n: 4, name: 'Charges' }, { n: 5, name: 'Job kit' }, { n: 6, name: 'Extras' },
];
const DEFAULT_GROUP: Record<string, number> = {
  sledge: 1, spray: 1, extinguisher: 1, leafblower: 1,
  blowtorch: 2, plank: 2, cable: 2, booster: 2,
  pistol: 3, shotgun: 3, rifle: 3, rocket: 3,
  pipebomb: 4, bomb: 4, nitro: 4,
};
/** group of a tool: its own `group`, else the built-in table, else 6 (mods / extras) */
export function groupOf(t: Tool): number {
  const g = t.group ?? DEFAULT_GROUP[t.id] ?? 6;
  return g >= 1 && g <= 6 ? Math.floor(g) : 6;
}

export class ToolBelt {
  tools: Tool[] = [];
  index = 0;
  /** RMB grab / carry / throw (works with every tool) */
  readonly grab = new Grabber();
  constructor(tools: Tool[]) { this.tools = tools; for (const t of tools) if (t.look) registerLook(t.id, t.look); }
  get current(): Tool { return this.tools[this.index]; }
  byId(id: string): Tool | undefined { return this.tools.find((t) => t.id === id); }

  /** previously selected tool (Q swaps back) */
  previous = -1;
  /** last tool used in each group (pressing a group key returns to it) */
  private lastInGroup = new Map<number, number>();
  /** ticks until the wheel may switch again (trackpads send bursts) */
  private wheelWait = 0;
  /** bumped on every switch attempt (the HUD opens the expanded view); `lastGroupKey` = group key pressed (0 = none) */
  switchSerial = 0;
  lastGroupKey = 0;

  select(ctx: ToolContext, i: number): void {
    if (i < 0 || i >= this.tools.length || i === this.index || !this.tools[i].unlocked) return;
    this.current.onDeselect(ctx);
    this.current.active = false;
    this.previous = this.index;
    this.index = i;
    this.lastInGroup.set(groupOf(this.current), i);
    this.current.onSelect(ctx);
    this.switchSerial++;
    ctx.sim.out.push({ type: 'custom', name: 'tool:select', data: { tool: this.current.id } });
  }

  /** unlocked tools in display order: by group, then `order`, then belt order */
  ordered(): number[] {
    const idx: number[] = [];
    this.tools.forEach((t, i) => { if (t.unlocked) idx.push(i); });
    return idx.sort((a, b) => groupOf(this.tools[a]) - groupOf(this.tools[b]) || (this.tools[a].order ?? a) - (this.tools[b].order ?? b) || a - b);
  }
  /** unlocked tools of group g in display order */
  inGroup(g: number): number[] { return this.ordered().filter((i) => groupOf(this.tools[i]) === g); }

  /**
   * Number key: a group other than the current tool's selects the tool last used there (else its first); the
   * current tool's group steps to the next tool in it (wrapping). Empty group: nothing (the HUD flashes it).
   */
  selectGroup(ctx: ToolContext, g: number): boolean {
    this.lastGroupKey = g;
    this.switchSerial++;
    const list = this.inGroup(g);
    if (list.length === 0) return false;
    if (this.current.unlocked && groupOf(this.current) === g) {
      const k = list.indexOf(this.index);
      this.select(ctx, list[(k + 1) % list.length]);
    } else {
      const last = this.lastInGroup.get(g);
      this.select(ctx, last != null && list.includes(last) ? last : list[0]);
    }
    return true;
  }

  /** wheel: step through every unlocked tool in display order (wrapping) */
  cycle(ctx: ToolContext, dir: number): void {
    const list = this.ordered();
    if (list.length === 0) return;
    const k = list.indexOf(this.index);
    const next = k < 0 ? list[0] : list[(((k + (dir > 0 ? 1 : -1)) % list.length) + list.length) % list.length];
    this.lastGroupKey = 0;
    this.select(ctx, next);
  }

  /** Q: back to the previously selected tool */
  swapBack(ctx: ToolContext): void {
    if (this.previous >= 0 && this.previous < this.tools.length && this.tools[this.previous].unlocked) { this.lastGroupKey = 0; this.select(ctx, this.previous); }
    else this.cycle(ctx, -1);
  }

  update(ctx: ToolContext, input: ToolInput, active = true): void {
    for (const t of this.tools) {
      if (t.cooldown > 0) t.cooldown--;
      if (t.anim > 0) t.anim = Math.max(0, t.anim - 1 / 18);
      t.tick(ctx);
    }
    if (!active) {
      this.grab.release();
      // let continuous tools (torch, spray) see "button up" so they stop cleanly
      if (this.current.active) this.current.update(ctx, IDLE);
      return;
    }
    // grabbing swallows LMB (throw) so the selected tool does not fire at the same time
    const swallowed = this.grab.update(ctx, input);
    if (swallowed) {
      const t = this.current;
      const pass = { ...input, primary: false, primaryPressed: false, primaryReleased: input.primaryReleased, scroll: 0 };
      t.update(ctx, pass);
      return;
    }
    // mouse wheel cycles tools when not holding anything
    if (this.wheelWait > 0) this.wheelWait--;
    if (input.scroll && !this.grab.holding && this.wheelWait === 0) { this.cycle(ctx, input.scroll > 0 ? 1 : -1); this.wheelWait = 3; }
    // no usable tool (e.g. a game mode that allows none): hands only (grab still works)
    if (!this.current.unlocked) return;
    this.current.update(ctx, input);
  }
  refillAll(): void { for (const t of this.tools) t.refill(); }
}
