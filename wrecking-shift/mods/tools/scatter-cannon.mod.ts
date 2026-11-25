import { defineMod, tools, variant } from '../../src/mods/kit';

/** A shotgun variant: twice the pellets, wide cone, short range, slow to reload. */
export default defineMod({
  id: 'scatter-cannon', name: 'Scatter Cannon', category: 'tools', author: 'Wrecking Shift',
  description: 'Sixteen pellets in a wide cone. Chews through plaster and wood at close range, useless far away.',
  tools: [variant(tools.Shotgun, { id: 'scatter-cannon', name: 'Scatter Cannon', pellets: 16, spread: 0.16, range: 9, rate: 80, maxAmmo: 10, hint: 'LMB blast' })],
});
