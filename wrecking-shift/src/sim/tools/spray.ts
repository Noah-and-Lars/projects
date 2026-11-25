import { painted, shadeOf, SHADE_PAINT } from '../materials';
import { Tool, type ToolContext, type ToolInput } from './tool';
import { emit } from './util';

/** Spray can: paints surface voxels near the aimed point (route marking). Unlimited, recolouring only. */
export class Spray extends Tool {
  readonly id: string = 'spray';
  readonly name: string = 'Spray Can';
  override hint = 'LMB paint';
  range = 3;
  /** paint radius at point-blank (m); widens a little with distance */
  radius = 0.22;

  update(ctx: ToolContext, input: ToolInput): void {
    this.active = input.primary;
    if (!input.primary) return;
    this.anim = Math.max(this.anim, 0.3);
    const { sim, player } = ctx;
    const eye = player.eye, dir = player.forward;
    const hit = sim.raycast(eye, dir, this.range);
    if (sim.tick % 4 === 0) emit(sim, 'tool:spray', { pos: hit ? hit.point : { x: eye.x + dir.x, y: eye.y + dir.y, z: eye.z + dir.z }, dir, hit: !!hit });
    if (!hit) return;
    const body = hit.body;
    const g = body.grid;
    const r = (this.radius + hit.dist * 0.03) / 0.1;
    const l = body.toLocal(hit.point);
    const r2 = r * r;
    const x0 = Math.floor(l.x - r), x1 = Math.ceil(l.x + r);
    const y0 = Math.floor(l.y - r), y1 = Math.ceil(l.y + r);
    const z0 = Math.floor(l.z - r), z1 = Math.ceil(l.z + r);
    for (let z = z0; z <= z1; z++) for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const p = g.get(x, y, z);
      if (!p || shadeOf(p) === SHADE_PAINT) continue;
      const dx = x + 0.5 - l.x, dy = y + 0.5 - l.y, dz = z + 0.5 - l.z;
      if (dx * dx + dy * dy + dz * dz > r2) continue;
      // only visible surface voxels
      if (g.get(x + 1, y, z) && g.get(x - 1, y, z) && g.get(x, y + 1, z) && g.get(x, y - 1, z) && g.get(x, y, z + 1) && g.get(x, y, z - 1)) continue;
      sim.setVoxel(body, x, y, z, painted(p));
    }
  }
}
