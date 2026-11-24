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

const IDLE: ToolInput = Object.freeze(emptyToolInput());

export class ToolBelt {
  tools: Tool[] = [];
  index = 0;
  /** RMB grab / carry / throw (works with every tool) */
  readonly grab = new Grabber();
  constructor(tools: Tool[]) { this.tools = tools; }
  get current(): Tool { return this.tools[this.index]; }
  byId(id: string): Tool | undefined { return this.tools.find((t) => t.id === id); }

  select(ctx: ToolContext, i: number): void {
    if (i < 0 || i >= this.tools.length || i === this.index || !this.tools[i].unlocked) return;
    this.current.onDeselect(ctx);
    this.current.active = false;
    this.index = i;
    this.current.onSelect(ctx);
    ctx.sim.out.push({ type: 'custom', name: 'tool:select', data: { tool: this.current.id } });
  }
  cycle(ctx: ToolContext, dir: number): void {
    const n = this.tools.length;
    for (let k = 1; k <= n; k++) {
      const i = (((this.index + dir * k) % n) + n) % n;
      if (this.tools[i].unlocked) { this.select(ctx, i); return; }
    }
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
    if (input.scroll && !this.grab.holding) this.cycle(ctx, input.scroll > 0 ? 1 : -1);
    this.current.update(ctx, input);
  }
  refillAll(): void { for (const t of this.tools) t.refill(); }
}
