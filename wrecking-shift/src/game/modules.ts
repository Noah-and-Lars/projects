import type { GameModule } from './game';
import { MissionModule } from './missionModule';
import { UiModule } from './uiModule';

/**
 * Module registry. Each feature adds ONE import and ONE entry here.
 * Order matters only for frameUpdate/fixedUpdate ordering (earlier first).
 */
export function createModules(): GameModule[] {
  return [
    new MissionModule(),
    // keep the UI last: it reads state the other modules produced this frame (camera overrides, prompts)
    new UiModule(),
  ];
}
