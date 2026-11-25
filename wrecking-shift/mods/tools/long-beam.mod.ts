import { defineMod, tools, variant } from '../../src/mods/kit';

/** Plank variant: twice the span, fewer beams, sturdier glue. */
export default defineMod({
  id: 'long-beam', name: 'Long Timber Beam', category: 'tools', author: 'Wrecking Shift',
  description: 'Eight-metre timber beams for bridging gaps and propping up sagging floors. Glued ends hold under more strain.',
  tools: [variant(tools.Plank, { id: 'long-beam', name: 'Long Timber Beam', maxLen: 8, reach: 8, tearDist: 0.5, maxAmmo: 5, hint: 'LMB first point, LMB second point (8 m)' })],
});
