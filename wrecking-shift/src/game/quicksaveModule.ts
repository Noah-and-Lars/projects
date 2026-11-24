import type { Game, GameModule } from './game';

/** Quicksave / quickload (F5 / F9). One slot, only while planning (never once the alarm is running). */
export function createQuicksaveModule(): GameModule {
  const allowed = (game: Game) => {
    const m = game.ext.mission?.current;
    return !game.player.dead && (!m || m.canQuicksave());
  };
  return {
    init(game) {
      game.ext.quicksave = {
        has: () => game.hasQuicksave(),
        canSave: () => allowed(game),
        save: () => {
          if (!allowed(game)) { game.ext.hud?.toast?.('Quicksave locked — alarm is running', 'warn'); return false; }
          const ok = game.quicksave();
          if (ok) game.ext.hud?.toast?.('Quicksaved', 'info');
          return ok;
        },
        load: () => {
          const ok = game.quickload();
          game.ext.hud?.toast?.(ok ? 'Quickloaded' : 'No quicksave yet', ok ? 'info' : 'warn');
          return ok;
        },
      };
    },
    frameUpdate(game) {
      if (game.paused) return;
      if (game.input.hit('F5')) game.ext.quicksave.save();
      if (game.input.hit('F9')) game.ext.quicksave.load();
    },
  };
}
