import { createAudioModule } from './audioModule';
import { fireModule } from './fireModule';
import type { GameModule } from './game';
import { ToolsModule } from './toolsModule';
import { createWaterModule } from './waterModule';
import { createWeatherModule } from './weatherModule';

/**
 * Module registry. Each feature adds ONE import and ONE entry here.
 * Order matters only for frameUpdate/fixedUpdate ordering (earlier first).
 */
export function createModules(): GameModule[] {
  return [
    createWaterModule(),
    createWeatherModule(),
    new ToolsModule(),
    fireModule(),
    createAudioModule(),
  ];
}
