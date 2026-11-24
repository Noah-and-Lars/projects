import { Blowtorch } from './blowtorch';
import { Bomb } from './bomb';
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
    new Rifle(), new LeafBlower(),
  ];
}
export function createBelt(): ToolBelt {
  return new ToolBelt(createTools());
}
export * from './tool';
export { Blowtorch, Bomb, Cable, Extinguisher, LeafBlower, Nitro, PipeBomb, Pistol, Plank, Rifle, RocketLauncher, Shotgun, Sledge, Spray };
