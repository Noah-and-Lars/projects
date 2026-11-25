import { defineMod, tools, variant } from '../../src/mods/kit';

/** Pipe bomb variant: short fuse, fast throw, smaller bang, more of them. */
export default defineMod({
  id: 'flash-pipe', name: 'Flash Pipe', category: 'tools', author: 'Wrecking Shift',
  description: 'A light pipe charge with a sub-second fuse and a hard throw. Small bang, no time to roll away.',
  tools: [variant(tools.PipeBomb, { id: 'flash-pipe', name: 'Flash Pipe', fuse: 50, throwSpeed: 22, size: 0.7, maxAmmo: 10, hint: 'LMB throw (short fuse)' })],
});
