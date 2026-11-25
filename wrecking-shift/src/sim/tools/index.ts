import { Blowtorch } from './blowtorch';
import { Bomb } from './bomb';
import { Booster } from './booster';
import { Cable } from './cable';
import { Extinguisher } from './extinguisher';
import { LeafBlower } from './leafblower';
import { Nitro } from './nitro';
import { PipeBomb } from './pipebomb';
import { Pistol } from './pistol';
import { Plank } from './plank';
import { Rifle } from './rifle';
import { RocketLauncher } from './rocket';
import { Shotgun } from './shotgun';
import { Sledge } from './sledge';
import { Spray } from './spray';
import { ToolBelt, type Tool } from './tool';

/** Full tool set in HUD order. New tools: add the class file and list it here. */
export function createTools(): Tool[] {
  return [
    new Sledge(), new Spray(), new Extinguisher(), new Blowtorch(),
    new Pistol(), new Shotgun(), new Plank(), new Cable(),
    new PipeBomb(), new Bomb(), new RocketLauncher(), new Nitro(),
    new Rifle(), new LeafBlower(), new Booster(),
  ];
}
/** extra tools from enabled mods (set by src/game/modsModule.ts); appended after the built-in set */
let extraTools: (() => Tool)[] = [];
export function setExtraTools(makers: (() => Tool)[]): void { extraTools = makers.slice(); }
export function createBelt(): ToolBelt {
  const tools = createTools();
  for (const make of extraTools) {
    try { const t = make(); if (!tools.some((o) => o.id === t.id)) tools.push(t); } catch (e) { console.warn('[mods] tool', e); }
  }
  return new ToolBelt(tools);
}
export * from './tool';
export { Blowtorch, Bomb, Booster, Cable, Extinguisher, LeafBlower, Nitro, PipeBomb, Pistol, Plank, Rifle, RocketLauncher, Shotgun, Sledge, Spray };
