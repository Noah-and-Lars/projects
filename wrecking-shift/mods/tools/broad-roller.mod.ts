import { defineMod, tools, variant } from '../../src/mods/kit';

/** Spray variant: a short-reach roller that paints a broad patch at once. */
export default defineMod({
  id: 'broad-roller', name: 'Broad Roller', category: 'tools', author: 'Wrecking Shift',
  description: 'A wide paint roller on a pole. Short reach, but it marks whole walls in a couple of passes.',
  tools: [variant(tools.Spray, { id: 'broad-roller', name: 'Broad Roller', radius: 0.6, range: 2.4, hint: 'LMB roll paint' })],
});
