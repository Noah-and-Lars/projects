import { defineMod } from '../../src/mods/kit';

let saved: number | null = null;

/** Super jump: about 3 m straight up from a standing start. */
export default defineMod({
  id: 'spring-heels', name: 'Spring Heels', category: 'global', author: 'Wrecking Shift', conflicts: 'jump',
  description: 'Coiled springs in your boots: jumps reach about three metres, enough to hop onto a single-storey roof.',
  global: {
    apply: ({ player }) => { if (saved == null) saved = player.jumpSpeed; player.jumpSpeed = saved * 1.95; },
    revert: ({ player }) => { if (saved == null) return; player.jumpSpeed = saved; saved = null; },
  },
});
