import type { LevelDef } from '../sim/levels/types';
import { harbor } from '../sim/levels/harbor';
import { ridge } from '../sim/levels/ridge';
import { works } from '../sim/levels/works';
import { testYard } from '../sim/levels/testyard';

/** All playable levels by id. */
export const LEVELS: Record<string, LevelDef> = {
  [testYard.id]: testYard,
  [harbor.id]: harbor,
  [ridge.id]: ridge,
  [works.id]: works,
};

// maps from mods (src/mods/registry.ts): always registered so any id resolves; the Sandbox menu lists the enabled ones
import { allMaps } from '../mods/registry';
for (const m of allMaps()) {
  if (LEVELS[m.id]) throw new Error(`mod ${m.mod}: map id '${m.id}' is taken`);
  LEVELS[m.id] = m;
}
