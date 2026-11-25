import { defineMod, tools, variant } from '../../src/mods/kit';

/** Rifle variant: very slow bolt, but each slug punches through many walls in a row. */
export default defineMod({
  id: 'bore-rifle', name: 'Bore Rifle', category: 'tools', author: 'Wrecking Shift',
  description: 'A slow-bolt slug rifle whose round keeps going through up to ten soft or medium surfaces. Line up a row of rooms.',
  tools: [variant(tools.Rifle, { id: 'bore-rifle', name: 'Bore Rifle', penetrate: 10, range: 160, rate: 110, maxAmmo: 5, hint: 'LMB shoot (deep penetration)' })],
});
