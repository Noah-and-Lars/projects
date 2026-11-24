import { VOXEL } from './materials';
import { DT, type Sim, type SimSystem } from './sim';

/**
 * Water = a horizontal plane at `level` (y) covering the map wherever the terrain is lower.
 * Dynamic bodies get buoyancy + drag by submerged fraction; light materials float, heavy sink.
 */
export class WaterSystem implements SimSystem {
  /** kg/m^3 */
  density = 1000;
  constructor(public level: number) {}

  update(sim: Sim): void {
    const L = this.level;
    for (const b of sim.bodies.values()) {
      if (!b.dynamic || b.rb.isSleeping()) continue;
      const com = b.rb.worldCom();
      const r = b.radius;
      if (com.y - r > L) continue;
      // vertical extent of the body: approximate with an equivalent box height from its bounding sphere,
      // refined by the grid's shortest side (flat things submerge quickly)
      const g = b.grid;
      const minSide = Math.min(g.sx, g.sy, g.sz) * VOXEL;
      const h = Math.max(minSide, Math.min(2 * r, Math.cbrt(g.count) * VOXEL * 1.2));
      const bottom = com.y - h / 2;
      const frac = Math.max(0, Math.min(1, (L - bottom) / h));
      if (frac <= 0) continue;
      const wasDry = !b.user.wet;
      b.user.wet = true;
      const vol = g.count * VOXEL * VOXEL * VOXEL;
      const m = b.mass || b.rb.mass();
      const F = this.density * vol * frac * 9.81;
      const v = b.rb.linvel();
      if (wasDry && v.y < -2) sim.out.push({ type: 'custom', name: 'water:splash', data: { pos: { x: com.x, y: L, z: com.z }, size: Math.min(3, Math.cbrt(vol) * 2), speed: -v.y } });
      // buoyancy impulse + drag (quadratic-ish, capped so it never reverses velocity)
      const drag = Math.min(0.9, (2.2 * frac * DT) * (1 + Math.hypot(v.x, v.y, v.z) * 0.3));
      b.rb.applyImpulse({ x: -v.x * drag * m, y: F * DT - v.y * drag * m, z: -v.z * drag * m }, true);
      const w = b.rb.angvel();
      const ad = Math.min(0.9, 2.5 * frac * DT);
      b.rb.setAngvel({ x: w.x * (1 - ad), y: w.y * (1 - ad), z: w.z * (1 - ad) }, true);
    }
    // bodies that left the water
    if (sim.tick % 30 === 0) for (const b of sim.bodies.values()) if (b.user.wet && b.dynamic && b.rb.worldCom().y - b.radius > L) b.user.wet = false;
    // player
    const p = sim.player as any;
    if (p && 'inWater' in p) {
      const feet = p.pos.y;
      p.inWater = L - feet > 1.0;
      p.headUnderWater = p.eye.y < L - 0.05;
    }
  }

  /** is the body's centre of mass below the surface? (mission "dump in water" checks) */
  submerged(b: { rb: { worldCom(): { y: number } } }): boolean {
    return b.rb.worldCom().y < this.level;
  }
}
