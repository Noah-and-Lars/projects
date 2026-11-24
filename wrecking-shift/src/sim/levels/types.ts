import type { Sim } from '../sim';
import type { V3 } from '../vec';

export interface LevelInfo {
  name: string;
  spawn: V3;
  spawnYaw: number;
  /** world-space bounds of the playable area (for map / fog / kill plane) */
  bounds: { min: V3; max: V3 };
  /** water surface height or null */
  waterLevel: number | null;
  /** sun direction (pointing from the sun toward the scene), time-of-day look */
  sunDir: V3;
  sky?: 'day' | 'sunset' | 'night' | 'overcast';
  /** free-form extras a level exposes to missions (named positions, bodies...)
   *  Mission conventions (see src/sim/mission.ts): `escape` = escape point, `heli_start` = helicopter start. */
  markers: Record<string, V3>;
  /** optional named mission zones (spheres or axis-aligned boxes), referenced by MissionDef zones `{ zone: name }` */
  zones?: Record<string, { center: V3; radius: number } | { min: V3; max: V3 }>;
}

export interface LevelDef {
  id: string;
  title: string;
  build(sim: Sim): LevelInfo;
}
