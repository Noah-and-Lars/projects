import { MAT, VoxelGrid, box, defineMod, levelKit, pal, siteMap } from '../../src/mods/kit';
import type { ModContext } from '../../src/mods/api';
import type { VoxelBody } from '../../src/sim/body';
import { PAL_FLAMMABILITY } from '../../src/sim/materials';
import type { V3 } from '../../src/sim/vec';
import { ClockRules, TPS, slab } from '../maps/_util';

const { makeBuilding, placeBuilding, addStatic, addProp, fence, crate, cylinderZ } = levelKit;

/** timber buildings of Ember Lane: [x, z, w, d, door] (metres / voxels) */
const HOUSES: [number, number, number, number, string][] = [[-18, -14, 70, 50, 's'], [-6, -16, 60, 50, 's'], [6, -14, 70, 50, 's'], [-18, 4, 60, 50, 'n'], [8, 4, 70, 50, 'n']];
/** where fires break out (outer wall faces, 1 m up) and when (seconds) */
const OUTBREAKS: { at: number; pos: V3 }[] = [
  { at: 0, pos: { x: -14.5, y: 1, z: -8.95 } },
  { at: 0, pos: { x: 9.5, y: 1, z: -8.95 } },
  { at: 20, pos: { x: -3, y: 1.2, z: -10.95 } },
  { at: 35, pos: { x: -15, y: 1, z: 3.95 } },
  { at: 50, pos: { x: 11.5, y: 1, z: 3.95 } },
];
const LAST = 50, SECONDS = 160, BURN_LIMIT = 2500;

class BlazeRules extends ClockRules {
  burnt = 0;
  lit = new Set<number>();
  private hook = (_b: VoxelBody, _x: number, _y: number, _z: number, p: number) => { if (!this.ended && PAL_FLAMMABILITY[p] > 0.2) this.burnt++; };
  private ctx: ModContext | null = null;
  constructor() { super(SECONDS); }
  start(ctx: ModContext) {
    this.ctx = ctx;
    ctx.sim.onRemoved.push(this.hook);
    // a drill, not an inferno: slower spread and a lower cap than the sandbox fire (fresh FireSystem per level)
    const f = this.tune(ctx);
    if (f) { f.maxFires = 450; f.spreadPerFire = 0; }
    this.text = 'Fire on Ember Lane!';
  }
  protected step(ctx: ModContext) {
    const fire = ctx.fire;
    if (!fire) { this.finish(false, 'No fire system'); return; }
    const t = this.ticks / TPS;
    // spreading may light one new voxel on every third tick only (about 20 per second)
    const f = this.tune(ctx);
    if (f) f.maxNewPerTick = this.ticks % 3 === 0 ? 1 : 0;
    OUTBREAKS.forEach((o, i) => {
      // keep trying for a few ticks in case the first spot is not flammable enough
      if (!this.lit.has(i) && t >= o.at) { if (fire.igniteNear(o.pos, 0.8, 6) > 0 || t > o.at + 2) this.lit.add(i); }
    });
    const n = fire.count();
    this.score = Math.max(0, 1000 - Math.round(this.burnt / 4));
    const next = OUTBREAKS.find((_o, i) => !this.lit.has(i));
    this.text = `Burning ${n} — timber lost ${this.burnt} / ${BURN_LIMIT}${next ? ` — next flare-up in ${Math.ceil(next.at - t)} s` : ''}`;
    if (this.burnt >= BURN_LIMIT) { this.done(false, 'Ember Lane burnt down'); return; }
    if (t > LAST + 1 && !next && n === 0) { this.score += Math.round((this.timeLeft ?? 0) * 5); this.done(true, `All fires out — ${this.burnt} voxels lost`); }
  }
  private tune(ctx: ModContext): { maxFires: number; maxNewPerTick: number; spreadPerFire: number } | null {
    const f = ctx.fire as unknown as { maxFires?: number; maxNewPerTick?: number; spreadPerFire?: number } | undefined;
    return f && typeof f.maxFires === 'number' ? (f as { maxFires: number; maxNewPerTick: number; spreadPerFire: number }) : null;
  }
  protected override timeUp() { this.done(false, `Still burning when time ran out`); }
  private done(won: boolean, text: string) {
    this.finish(won, text);
    const c = this.ctx;
    if (c) { const i = c.sim.onRemoved.indexOf(this.hook); if (i >= 0) c.sim.onRemoved.splice(i, 1); }
  }
}

/** Fires break out one after another along a timber lane; put them all out before the lane burns down. */
export default defineMod({
  id: 'blaze-brigade', name: 'Blaze Brigade', category: 'modes', author: 'Wrecking Shift',
  description: 'Ember Lane is all timber and the fires keep starting. With only an extinguisher, put out five outbreaks before 2500 voxels of the lane go up in smoke.',
  maps: [siteMap({
    id: 'ember-lane', title: 'Ember Lane', blurb: 'timber lane (fire drill)', ground: MAT.dirt, sky: 'sunset', seed: 281,
    spawn: { x: 0, y: 0.05, z: 0 }, spawnYaw: 0,
    build(sim, rng) {
      slab(sim, -25.6, 0, -2.5, 51.2, 5, (x, _y, z) => pal(MAT.sand, (x * 7 + z * 3) % 5), 'lane');
      for (let i = 0; i < HOUSES.length; i++) {
        const [x, z, w, d, door] = HOUSES[i];
        placeBuilding(sim, makeBuilding({ w, d, floors: 1 + (i % 2), wall: MAT.wood, wallT: 2, slab: MAT.wood, roof: 'gable', roofMat: MAT.wood, doors: door, lamps: true, winStep: 20, seed: 70 + i }), x, 0, z, 'timber house');
      }
      // hay store + wood pile between the houses: fuel for the fire to jump along
      for (let i = 0; i < 5; i++) {
        const g = new VoxelGrid(12, 12, 10);
        cylinderZ(g, 6, 6, 6, 0, 10, (xx, yy) => pal(MAT.crate, (xx + yy + i) % 5));
        addProp(sim, g, 1.2 + (i % 3) * 1.3, 0.1 + Math.floor(i / 3) * 1.1, 6, 'hay bale');
      }
      const wp = new VoxelGrid(30, 12, 12);
      for (let y = 0; y < 12; y += 4) for (let z = 0; z < 12; z += 4) box(wp, 0, y, z, 30, y + 4, z + 4, pal(MAT.wood, ((y + z) >> 2) % 5));
      addStatic(sim, wp, -9, -0.1, -9, 'wood pile');
      fence(sim, -25, 0, -20, 50, false, MAT.wood, 12);
      fence(sim, -25, 0, 12, 50, false, MAT.wood, 12);
      for (let i = 0; i < 4; i++) crate(sim, rng.range(16, 22), 0.15, rng.range(-2, 2), 8);
    },
  })],
  modes: [{
    id: 'blaze-brigade', title: 'Blaze Brigade', level: 'ember-lane', tools: ['extinguisher'],
    rules: ['Fires break out along Ember Lane: two now, three more over the next 50 seconds.', `Put every fire out with the extinguisher before ${BURN_LIMIT} timber voxels are lost.`, `${SECONDS} seconds. Smashing timber yourself also counts as lost.`],
    create: () => new BlazeRules(),
  }],
});
