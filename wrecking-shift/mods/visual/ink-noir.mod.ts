import { defineMod } from '../../src/mods/kit';

/** Black and white, crushed shadows: a detective-film grade. */
export default defineMod({
  id: 'ink-noir', name: 'Ink Noir', category: 'visual', author: 'Wrecking Shift', conflicts: 'grade',
  description: 'Hard black-and-white with deep shadows and a dark frame, like a rain-soaked detective film.',
  visual: { saturation: 0, contrast: 1.35, vignette: 0.7, cssFilter: 'grayscale(1) brightness(0.95)' },
});
