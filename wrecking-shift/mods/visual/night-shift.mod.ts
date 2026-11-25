import { defineMod } from '../../src/mods/kit';

/** Forces the night preset: work by floodlight, lamp voxels and muzzle flash. */
export default defineMod({
  id: 'night-shift', name: 'Night Shift', category: 'visual', author: 'Wrecking Shift', conflicts: 'time',
  description: 'Every site is worked after dark. Lamps, fires and explosions light the way.',
  visual: { timeOfDay: 'night', vignette: 0.35 },
});
