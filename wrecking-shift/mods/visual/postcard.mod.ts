import { defineMod } from '../../src/mods/kit';

/** Warm, rich colour like a holiday postcard. */
export default defineMod({
  id: 'postcard', name: 'Postcard', category: 'visual', author: 'Wrecking Shift', conflicts: 'grade',
  description: 'Sun-warmed, saturated colour with a soft vignette, as if every demolition were a holiday snap.',
  visual: { saturation: 1.45, contrast: 1.08, vignette: 0.3, cssFilter: 'sepia(0.18) saturate(1.15)' },
});
