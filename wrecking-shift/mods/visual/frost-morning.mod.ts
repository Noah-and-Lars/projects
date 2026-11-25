import { defineMod } from '../../src/mods/kit';

/** A cold blue early-shift grade. */
export default defineMod({
  id: 'frost-morning', name: 'Frost Morning', category: 'visual', author: 'Wrecking Shift', conflicts: 'grade',
  description: 'A chilly blue cast and muted colour, like clocking in at dawn with frost on the scaffolding.',
  visual: { saturation: 0.75, contrast: 1.05, vignette: 0.25, cssFilter: 'hue-rotate(-12deg) saturate(0.85) brightness(1.04)' },
});
