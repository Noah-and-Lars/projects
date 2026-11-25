import { MAT, box, bricks, defineMod, pal, place, vox } from '../../src/mods/kit';

/** Gate pillars and a garden wall: anchored brickwork with concrete copings. */
export default defineMod({
  id: 'brick-pillars', name: 'Brick Pillars', category: 'props', author: 'Wrecking Shift',
  description: 'A square gate pillar with a stone ball on top and a short garden wall, both anchored to the ground. Knock the bricks out course by course.',
  props: [
    {
      id: 'gate-pillar', name: 'Gate pillar', group: 'Structures',
      spawn: (sim, pos, yaw) => place(sim, vox(6, 24, 6, (g) => {
        box(g, 0, 0, 0, 6, 1, 6, pal(MAT.concrete, 1));
        box(g, 0, 1, 0, 6, 19, 6, bricks(MAT.brick, 4));
        box(g, 0, 19, 0, 6, 20, 6, pal(MAT.concrete, 3));
        box(g, 1, 20, 1, 5, 21, 5, pal(MAT.concrete, 2));
        box(g, 2, 21, 2, 4, 24, 4, pal(MAT.rock, 3));
        box(g, 1, 22, 2, 5, 23, 4, pal(MAT.rock, 2)); box(g, 2, 22, 1, 4, 23, 5, pal(MAT.rock, 2));
      }), pos, yaw, 'gate pillar', { static: true }),
    },
    {
      id: 'garden-wall', name: 'Garden wall (3 m)', group: 'Structures',
      spawn: (sim, pos, yaw) => place(sim, vox(30, 12, 3, (g) => {
        box(g, 0, 0, 0, 30, 1, 3, pal(MAT.concrete, 1));
        box(g, 0, 1, 0, 30, 11, 3, bricks(MAT.brick, 9));
        box(g, 0, 11, 0, 30, 12, 3, pal(MAT.concrete, 3));
        // a pier every 1.5 m
        for (const x of [0, 14, 27]) box(g, x, 1, 0, x + 3, 11, 3, bricks(MAT.brick, 11));
      }), pos, yaw, 'garden wall', { static: true }),
    },
  ],
});
