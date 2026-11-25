// Tool groups (number keys 1-6), wheel order, Q swap-back, locked tools hidden, mod tools in group 6.
import { beforeAll, describe, expect, it } from 'vitest';
import { Sim, initPhysics } from '../../src/sim/sim';
import { Player } from '../../src/sim/player';
import { createBelt, setExtraTools } from '../../src/sim/tools';
import { groupOf, emptyToolInput, Tool, type ToolContext } from '../../src/sim/tools/tool';

beforeAll(async () => { await initPhysics(); });

class Dummy extends Tool {
  readonly id: string; readonly name: string;
  constructor(id: string, group?: number) { super(); this.id = id; this.name = id; this.group = group; }
  update(): void {}
}

function setup() {
  const sim = new Sim(1);
  const player = new Player(sim, { x: 0, y: 1, z: 0 });
  const belt = createBelt();
  const ctx: ToolContext = { sim, player, infiniteAmmo: true };
  return { sim, belt, ctx };
}
const cur = (b: ReturnType<typeof createBelt>) => b.current.id;

describe('tool groups', () => {
  it('built-in tools sit in their groups; display order follows the groups', () => {
    const { belt } = setup();
    const groups = belt.ordered().map((i) => groupOf(belt.tools[i]));
    expect([...groups].sort((a, b) => a - b)).toEqual(groups);
    expect(belt.inGroup(1).map((i) => belt.tools[i].id)).toEqual(['sledge', 'spray', 'extinguisher', 'leafblower']);
    expect(belt.inGroup(3).map((i) => belt.tools[i].id)).toEqual(['pistol', 'shotgun', 'rocket', 'rifle']);
    expect(belt.inGroup(4).map((i) => belt.tools[i].id)).toEqual(['pipebomb', 'bomb', 'nitro']);
  });

  it('a number key picks its group, pressing it again cycles inside it, other groups remember their last tool', () => {
    const { belt, ctx } = setup();
    belt.selectGroup(ctx, 3); expect(cur(belt)).toBe('pistol');
    belt.selectGroup(ctx, 3); expect(cur(belt)).toBe('shotgun');
    belt.selectGroup(ctx, 4); expect(cur(belt)).toBe('pipebomb');
    belt.selectGroup(ctx, 4); expect(cur(belt)).toBe('bomb');
    belt.selectGroup(ctx, 3); expect(cur(belt)).toBe('shotgun'); // remembered
    for (let i = 0; i < 4; i++) belt.selectGroup(ctx, 3);
    expect(cur(belt)).toBe('shotgun'); // wrapped round the 4 guns
    expect(belt.selectGroup(ctx, 5)).toBe(false); // empty group: nothing happens
    expect(cur(belt)).toBe('shotgun');
  });

  it('Q swaps back to the previous tool; the wheel steps through all tools in display order with a rate limit', () => {
    const { belt, ctx } = setup();
    belt.selectGroup(ctx, 4); belt.selectGroup(ctx, 1);
    belt.swapBack(ctx); expect(cur(belt)).toBe('pipebomb');
    belt.swapBack(ctx); expect(cur(belt)).toBe('sledge');
    const order = belt.ordered().map((i) => belt.tools[i].id);
    const inp = emptyToolInput();
    const seen: string[] = [];
    for (let t = 0; t < 4 * order.length; t++) { inp.scroll = 1; belt.update(ctx, inp); if (seen[seen.length - 1] !== cur(belt)) seen.push(cur(belt)); }
    expect(seen.slice(0, order.length)).toEqual([...order.slice(1), order[0]]);
    // a burst of wheel ticks only moves one step per 3 ticks
    const before = order.indexOf(cur(belt));
    for (let t = 0; t < 3; t++) { inp.scroll = 1; belt.update(ctx, inp); }
    expect((order.indexOf(cur(belt)) - before + order.length) % order.length).toBe(1);
  });

  it('locked tools are skipped by keys and wheel', () => {
    const { belt, ctx } = setup();
    for (const t of belt.tools) t.unlocked = ['sledge', 'bomb', 'rifle'].includes(t.id);
    belt.selectGroup(ctx, 4); expect(cur(belt)).toBe('bomb');
    belt.selectGroup(ctx, 4); expect(cur(belt)).toBe('bomb');
    expect(belt.selectGroup(ctx, 2)).toBe(false);
    belt.cycle(ctx, 1); expect(cur(belt)).toBe('sledge'); // display order sledge, rifle, bomb: wraps
    belt.cycle(ctx, 1); expect(cur(belt)).toBe('rifle');
  });

  it('extra (mod) tools default to group 6 and can choose a group', () => {
    setExtraTools([() => new Dummy('mod-a'), () => new Dummy('mod-b', 3)]);
    try {
      const { belt, ctx } = setup();
      expect(belt.inGroup(6).map((i) => belt.tools[i].id)).toEqual(['mod-a']);
      expect(belt.inGroup(3).map((i) => belt.tools[i].id)).toContain('mod-b');
      belt.selectGroup(ctx, 6); expect(cur(belt)).toBe('mod-a');
    } finally { setExtraTools([]); }
  });
});
