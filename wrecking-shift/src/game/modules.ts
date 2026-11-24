import { fireModule } from './fireModule';
import type { GameModule } from './game';

/**
 * Module registry. Each feature adds ONE import and ONE entry here.
 * Order matters only for frameUpdate/fixedUpdate ordering (earlier first).
 */
export function createModules(): GameModule[] {
  return [
    fireModule(),
  ];
}
