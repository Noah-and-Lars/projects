import { defineMod } from '../../src/mods/kit';

/** Forces the overcast preset for flat, shadowless light. */
export default defineMod({
  id: 'grey-skies', name: 'Grey Skies', category: 'visual', author: 'Wrecking Shift', conflicts: 'time',
  description: 'A permanent low cloud ceiling: soft, flat light with no hard shadows, on every map.',
  visual: { timeOfDay: 'overcast' },
});
