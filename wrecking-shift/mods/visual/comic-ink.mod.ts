import { defineMod } from '../../src/mods/kit';

/** Punchy contrast and loud colour for a comic-panel look. */
export default defineMod({
  id: 'comic-ink', name: 'Comic Ink', category: 'visual', author: 'Wrecking Shift', conflicts: 'grade',
  description: 'Loud colour and hard contrast, so every blast looks like a splash page.',
  visual: { saturation: 1.9, contrast: 1.6, vignette: 0.15, cssFilter: 'contrast(1.1) saturate(1.2)' },
});
