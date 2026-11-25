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
import { createPerfModule } from './perfModule';
import { createModsModule } from './modsModule';
import { createUxModule } from './uxModule';

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
    createPerfModule(), // after missions: reads game.ext.settings (published by the mission module)
    new ChallengeModule(), // after missions: a load without a pending challenge drops it
    createModsModule(), // after missions + challenges: unlocks mod tools, runs mod game modes
    createAtmosModule(), // after mission + challenge: applies the sandbox / challenge time + weather choice
    createEdgeModule(),
    createQuicksaveModule(),
    createUxModule(), // after missions (settings, mission items); key bindings, target highlight, look-at text
    createPhotoModule(), // before the UI: its key handler must see Esc / Tab first while flying
    // keep the UI last: it reads state the other modules produced this frame (camera overrides, prompts)
    new UiModule(),
  ];
}
