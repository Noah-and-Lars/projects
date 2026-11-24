/** Shared helpers for mission definitions (pure sim code: runs in Node tests too). */
import type { VoxelBody } from '../../sim/body';
import type { LevelInfo } from '../../sim/levels/types';
import { alarmBox } from '../../sim/missionProps';
import { van } from '../../sim/prefabs/vehicles';
import type { Sim } from '../../sim/sim';
import type { V3 } from '../../sim/vec';

/** a level marker's position plus an offset (falls back to the spawn point) */
export const at = (lv: LevelInfo, name: string, dx = 0, dy = 0.12, dz = 0): V3 => {
  const m = lv.markers[name] ?? lv.spawn;
  return { x: m.x + dx, y: m.y + dy, z: m.z + dz };
};

/** nearest body with a given name to a point (for tagging level geometry in MissionDef.setup) */
export function nearestNamed(sim: Sim, name: string, x: number, z: number): VoxelBody | null {
  let best: VoxelBody | null = null, bd = Infinity;
  for (const b of sim.bodies.values()) {
    if (b.name !== name) continue;
    const c = b.center();
    const d = (c.x - x) ** 2 + (c.z - z) ** 2;
    if (d < bd) { bd = d; best = b; }
  }
  return best;
}

/** alarm box stuck to the nearest wall around a marker (searches the four horizontal directions) */
export function wallAlarm(sim: Sim, lv: LevelInfo, marker: string, id: string, h = 1.3, range = 12): void {
  const o = at(lv, marker, 0, h, 0);
  let best: { p: V3; axis: 'x' | 'z'; d: number } | null = null;
  for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
    const h = sim.raycast(o, { x: dx, y: 0, z: dz }, range, null, (b) => !b.dynamic);
    if (!h || (best && h.dist >= best.d)) continue;
    // box min corner: flush against the wall face, protruding into the room
    const axis = dx ? 'x' : 'z';
    const p = { x: h.point.x - (dx > 0 ? 0.2 : 0) - (dz ? 0.2 : 0), y: o.y, z: h.point.z - (dz > 0 ? 0.2 : 0) - (dx ? 0.2 : 0) };
    best = { p, axis, d: h.dist };
  }
  if (best) alarmBox(sim, best.p, id, best.axis);
}
/** the escape van beside the escape marker (levels without their own) */
export function escapeVan(sim: Sim, lv: LevelInfo, yaw: number): void {
  const e = at(lv, 'escape', 0, 0, 0);
  const v = van(sim, e.x, e.y, e.z, yaw);
  v.body.tags.add('escape');
}
