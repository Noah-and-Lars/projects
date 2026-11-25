import { defineMod } from '../../src/mods/kit';

/** False-colour "heat camera" look: hues rotated, contrast up. */
export default defineMod({
  id: 'heat-scope', name: 'Heat Scope', category: 'visual', author: 'Wrecking Shift', conflicts: 'grade',
  description: 'A false-colour inspection-camera look: rotated hues, inverted tones and harsh contrast. Not a real thermal view, just a fun one.',
  visual: { saturation: 2.2, contrast: 1.5, vignette: 0.5, cssFilter: 'invert(1) hue-rotate(180deg) saturate(1.6)' },
});
