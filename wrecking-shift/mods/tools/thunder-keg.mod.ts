import { defineMod, tools, variant } from '../../src/mods/kit';

/** Bomb variant: long fuse, huge blast, only three on the belt. */
export default defineMod({
  id: 'thunder-keg', name: 'Thunder Keg', category: 'tools', author: 'Wrecking Shift',
  description: 'A heavy sticky charge on a slow six-second timer. Plant it, walk away, and watch a whole storey go.',
  tools: [variant(tools.Bomb, { id: 'thunder-keg', name: 'Thunder Keg', range: 3.5, timer: 6 * 60, size: 2.4, maxAmmo: 3, hint: 'LMB plant (6 s fuse)' })],
});
