import { defineMod } from '../../src/mods/kit';

let saved: { walk: number; sprint: number; crouch: number } | null = null;

/** Faster legs: walk, sprint and crouch speeds up by about 60 %. */
export default defineMod({
  id: 'quickstep', name: 'Quickstep', category: 'global', author: 'Wrecking Shift', conflicts: 'speed',
  description: 'Sprinter legs: walking, sprinting and crouch-walking are all about 60 % faster. Getting away from your own fuse has never been easier.',
  global: {
    apply: ({ player }) => {
      if (!saved) saved = { walk: player.walkSpeed, sprint: player.sprintSpeed, crouch: player.crouchSpeed };
      player.walkSpeed = saved.walk * 1.6;
      player.sprintSpeed = saved.sprint * 1.6;
      player.crouchSpeed = saved.crouch * 1.5;
    },
    revert: ({ player }) => {
      if (!saved) return;
      player.walkSpeed = saved.walk; player.sprintSpeed = saved.sprint; player.crouchSpeed = saved.crouch;
      saved = null;
    },
  },
});
