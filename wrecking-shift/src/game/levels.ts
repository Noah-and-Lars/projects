import type { LevelDef } from '../sim/levels/types';
import { harbor } from '../sim/levels/harbor';
import { ridge } from '../sim/levels/ridge';
import { testYard } from '../sim/levels/testyard';

/** All playable levels by id. */
export const LEVELS: Record<string, LevelDef> = {
  [testYard.id]: testYard,
  [harbor.id]: harbor,
  [ridge.id]: ridge,
};
