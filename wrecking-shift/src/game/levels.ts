import type { LevelDef } from '../sim/levels/types';
import { testYard } from '../sim/levels/testyard';

/** All playable levels by id. */
export const LEVELS: Record<string, LevelDef> = {
  [testYard.id]: testYard,
};
