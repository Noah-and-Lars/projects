import { defineMod, tools, variant } from '../../src/mods/kit';

/** Rocket variant: slow, drooping heavy warhead. */
export default defineMod({
  id: 'bunker-lobber', name: 'Bunker Lobber', category: 'tools', author: 'Wrecking Shift',
  description: 'A sluggish rocket with an oversized warhead. It droops in flight, so aim high, but it leaves a crater.',
  tools: [variant(tools.RocketLauncher, { id: 'bunker-lobber', name: 'Bunker Lobber', speed: 13, gravity: 6, size: 2.1, rate: 120, maxAmmo: 3, hint: 'LMB fire (aim high)' })],
});
