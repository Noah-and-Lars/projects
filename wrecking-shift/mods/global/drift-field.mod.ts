import { defineMod } from '../../src/mods/kit';

let saved: { g: { x: number; y: number; z: number }; gs: number } | null = null;

/** Near-zero gravity: everything drifts, the player floats in long slow arcs. */
export default defineMod({
  id: 'drift-field', name: 'Drift Field', category: 'global', author: 'Wrecking Shift', conflicts: 'gravity',
  description: 'Gravity almost switched off: blasted walls tumble away in slow motion and every jump becomes a long, floaty glide.',
  global: {
    apply: ({ sim, player }) => {
      if (!saved) saved = { g: { ...sim.world.gravity }, gs: player.gravityScale };
      sim.world.gravity = { x: 0, y: saved.g.y * 0.06, z: 0 };
      player.gravityScale = saved.gs * 0.12;
    },
    revert: ({ sim, player }) => {
      if (!saved) return;
      sim.world.gravity = { ...saved.g };
      player.gravityScale = saved.gs;
      saved = null;
    },
  },
});
