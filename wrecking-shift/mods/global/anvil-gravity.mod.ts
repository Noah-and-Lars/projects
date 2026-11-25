import { defineMod } from '../../src/mods/kit';

let saved: { g: { x: number; y: number; z: number }; gs: number } | null = null;

/** Double gravity: debris slams down, jumps are short, towers crush under their own weight sooner. */
export default defineMod({
  id: 'anvil-gravity', name: 'Anvil Gravity', category: 'global', author: 'Wrecking Shift', conflicts: 'gravity',
  description: 'Gravity at twice the usual pull: rubble drops like lead, jumps barely leave the ground and loose floors come down hard.',
  global: {
    apply: ({ sim, player }) => {
      if (!saved) saved = { g: { ...sim.world.gravity }, gs: player.gravityScale };
      sim.world.gravity = { x: saved.g.x, y: saved.g.y * 2, z: saved.g.z };
      player.gravityScale = saved.gs * 1.6;
    },
    revert: ({ sim, player }) => {
      if (!saved) return;
      sim.world.gravity = { ...saved.g };
      player.gravityScale = saved.gs;
      saved = null;
    },
  },
});
