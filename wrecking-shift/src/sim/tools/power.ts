import type { Tool } from './tool';

/**
 * Power upgrades: cash buys strength, not just ammo. Plain data shared by the shop (src/game/progress.ts,
 * src/game/ui/powerShop.ts) and the belt. Each upgrade sets one or more numeric properties of a built-in tool:
 * `stats[prop][0]` is the tool's default (tests check it matches the class), `stats[prop][level]` the value
 * after buying `level` levels. `costs.length` = number of levels. Ids contain a dot so they never collide with
 * the ammo upgrades, which are keyed by bare tool id in the same save map.
 */
export interface PowerDef {
  /** save key, e.g. 'bomb.blast' */
  id: string;
  /** tool id it improves */
  tool: string;
  /** short shop title */
  title: string;
  /** shop line per level, index = level after buying (0 = stock) */
  steps: string[];
  stats: Record<string, number[]>;
  /** cost of each level */
  costs: number[];
}

export const POWER_UPGRADES: PowerDef[] = [
  {
    id: 'sledge.head', tool: 'sledge', title: 'Weighted head',
    steps: ['stock head', 'bigger bite, +0.3 m reach', 'huge bite, +0.6 m reach'],
    stats: { bite: [0.55, 0.68, 0.82], reach: [2.6, 2.9, 3.2] }, costs: [180, 380],
  },
  {
    id: 'blowtorch.nozzle', tool: 'blowtorch', title: 'Wide nozzle',
    steps: ['0.15 m flame', '0.21 m flame', '0.27 m flame'],
    stats: { radius: [0.15, 0.21, 0.27] }, costs: [160, 340],
  },
  {
    id: 'shotgun.load', tool: 'shotgun', title: 'Heavy load',
    steps: ['8 pellets', '11 pellets', '14 pellets, tighter'],
    stats: { pellets: [8, 11, 14], spread: [0.07, 0.07, 0.06] }, costs: [200, 420],
  },
  {
    id: 'plank.length', tool: 'plank', title: 'Long boards',
    steps: ['4 m planks', '5.5 m planks', '7 m planks'],
    stats: { maxLen: [4, 5.5, 7] }, costs: [150, 320],
  },
  {
    id: 'cable.length', tool: 'cable', title: 'Spool extension',
    steps: ['12 m cable', '16 m cable', '21 m cable'],
    stats: { maxLen: [12, 16, 21] }, costs: [200, 380],
  },
  {
    id: 'pipebomb.blast', tool: 'pipebomb', title: 'Packed pipe',
    steps: ['blast 1.0', 'blast 1.2', 'blast 1.4'],
    stats: { size: [1.0, 1.2, 1.4] }, costs: [260, 520],
  },
  {
    id: 'bomb.blast', tool: 'bomb', title: 'Bigger charge',
    steps: ['blast 1.6', 'blast 1.85', 'blast 2.1', 'blast 2.35'],
    stats: { size: [1.6, 1.85, 2.1, 2.35] }, costs: [320, 560, 820],
  },
  {
    id: 'rifle.core', tool: 'rifle', title: 'Steel-core rounds',
    steps: ['through 4 surfaces', 'through 6 surfaces', 'through 9 surfaces'],
    stats: { penetrate: [4, 6, 9] }, costs: [300, 560],
  },
  {
    id: 'booster.fuel', tool: 'booster', title: 'Long-burn fuel',
    steps: ['3.5 s burn', '5 s burn', '5 s burn, +40 % thrust'],
    stats: { burn: [210, 300, 300], thrust: [9000, 9000, 12600] }, costs: [250, 480],
  },
];

export const powerDef = (id: string): PowerDef | undefined => POWER_UPGRADES.find((p) => p.id === id);

/** set a tool's stats to the given level of one upgrade (level 0 = stock). Unknown props are ignored. */
export function applyPower(tool: Tool, def: PowerDef, level: number): void {
  for (const [prop, vals] of Object.entries(def.stats)) {
    if (typeof (tool as any)[prop] !== 'number') continue;
    (tool as any)[prop] = vals[Math.max(0, Math.min(vals.length - 1, Math.floor(level)))];
  }
}

/** a new belt is built on every level load / quickload: carry the upgraded stats over from the old tool */
export function carryPower(from: Tool, to: Tool): void {
  for (const def of POWER_UPGRADES) {
    if (def.tool !== to.id || from.id !== to.id) continue;
    for (const prop of Object.keys(def.stats)) if (typeof (from as any)[prop] === 'number') (to as any)[prop] = (from as any)[prop];
  }
}
