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
import { ChallengeModule } from './challengeModule';
import { createAtmosModule } from './atmosModule';
import { createEdgeModule } from './edgeModule';
import { createPhotoModule } from './photoModule';
import { createLookModule } from '../render/lookModule';

/**
 * Module registry. Each feature adds ONE import and ONE entry here.
 * Order matters only for frameUpdate/fixedUpdate ordering (earlier first).
 */
export function createModules(): GameModule[] {
  return [
    createLookModule(),
    createWaterModule(),
    createWeatherModule(),
    new ToolsModule(),
    fireModule(),
    createAudioModule(),
    vehicleModule(),
    new MissionModule(),
    new ChallengeModule(), // after missions: a load without a pending challenge drops it
    createAtmosModule(), // after mission + challenge: applies the sandbox / challenge time + weather choice
    createEdgeModule(),
    createQuicksaveModule(),
    createPhotoModule(), // before the UI: its key handler must see Esc / Tab first while flying
    // keep the UI last: it reads state the other modules produced this frame (camera overrides, prompts)
    new UiModule(),
  ];
}
