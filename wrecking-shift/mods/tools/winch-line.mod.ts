import { defineMod, tools, variant } from '../../src/mods/kit';

/** Cable variant: long reach steel line for hauling big pieces. */
export default defineMod({
  id: 'winch-line', name: 'Winch Line', category: 'tools', author: 'Wrecking Shift',
  description: 'A twenty-four-metre steel line you can shoot from ten metres away. Tie a loose slab to a vehicle and haul.',
  tools: [variant(tools.Cable, { id: 'winch-line', name: 'Winch Line', maxLen: 24, reach: 10, maxAmmo: 10, hint: 'LMB first point, LMB second point (24 m)' })],
});
