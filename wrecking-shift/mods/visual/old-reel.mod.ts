import { defineMod } from '../../src/mods/kit';

/** Sepia, heavy vignette: the shift as an old film reel. */
export default defineMod({
  id: 'old-reel', name: 'Old Reel', category: 'visual', author: 'Wrecking Shift', conflicts: 'grade',
  description: 'Warm sepia, washed-out colour and a heavy vignette, like a faded film reel.',
  visual: { saturation: 0.35, vignette: 0.6, contrast: 1.08, cssFilter: 'sepia(0.55)' },
});
