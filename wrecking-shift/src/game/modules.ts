import { createAudioModule } from './audioModule';
import { fireModule } from './fireModule';
import type { GameModule } from './game';
import { createQuicksaveModule } from './quicksaveModule';
import { ToolsModule } from './toolsModule';
import { createWaterModule } from './waterModule';
import { createWeatherModule } from './weatherModule';
import { MissionModule } from './missionModule';
import { UiModule } from './uiModule';
import { vehicleModule } from './vehicleModule';

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
    vehicleModule(),
    new MissionModule(),
    createQuicksaveModule(),
    // keep the UI last: it reads state the other modules produced this frame (camera overrides, prompts)
    new UiModule(),
  ];
}
