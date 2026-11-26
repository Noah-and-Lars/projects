import { defineMod } from '../../src/mods/kit';

/** Fisheye-ish wide field of view. */
export default defineMod({
  id: 'wide-lens', name: 'Wide Lens', category: 'visual', author: 'Wrecking Shift', conflicts: 'fov',
  description: 'Widens the field of view to 105 degrees: see more of the collapse, feel faster on foot and behind the wheel.',
  visual: { fov: 120 },
});
