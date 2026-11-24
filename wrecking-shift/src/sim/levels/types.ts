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
  /** free-form extras a level exposes to missions (named positions, bodies...) */
  markers: Record<string, V3>;
}

export interface LevelDef {
  id: string;
  title: string;
  build(sim: Sim): LevelInfo;
}
