/**
 * Mission registry. One file per level; MISSIONS order = order in the job list.
 * Authoring contract (tags, markers, MissionDef fields): see the header of src/sim/mission.ts.
 * Pure data + deterministic setup code (no DOM) so unit tests can load it in Node.
 */
import type { MissionDef } from '../../sim/mission';
import { HARBOR_MISSIONS } from './harbor';
import { RIDGE_MISSIONS } from './ridge';
import { TESTYARD_MISSIONS } from './testyard';
import { WORKS_MISSIONS } from './works';

export * from './harbor';
export * from './ridge';
export * from './testyard';
export * from './works';
export { nearestNamed } from './helpers';

export const MISSIONS: MissionDef[] = [...TESTYARD_MISSIONS, ...HARBOR_MISSIONS, ...RIDGE_MISSIONS, ...WORKS_MISSIONS];

export function missionById(id: string): MissionDef | undefined {
  return MISSIONS.find((m) => m.id === id);
}
