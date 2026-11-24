import type { Game, GameModule } from '../game/game';
import type { Quality, TimeOfDay } from './renderer';

/**
 * Applies graphics settings to the renderer.
 *  - URL parameters (handy for testing): ?quality=low|medium|high  &tod=day|sunset|overcast|night  &res=0.5..1
 *  - `game.ext.settings` if a settings/UI module publishes one: fields `quality`, `resolutionScale`, and an
 *    optional `onChange(cb)` subscription (cb is called after any change).
 */
export function createLookModule(): GameModule {
  const params = typeof location !== 'undefined' ? new URLSearchParams(location.search) : new URLSearchParams();
  const urlQuality = params.get('quality') as Quality | null;
  const urlTod = params.get('tod') as TimeOfDay | null;
  const urlRes = params.get('res');
  let subscribed = false;
  const apply = (game: Game) => {
    const s = game.ext.settings;
    const q = urlQuality ?? s?.quality;
    if (q && q !== game.renderer.quality) game.renderer.setQuality(q);
    const r = Number(urlRes ?? s?.resolutionScale);
    if (r > 0 && r !== game.renderer.resolutionScale) game.renderer.setResolutionScale(r);
    if (s && !subscribed && typeof s.onChange === 'function') { subscribed = true; s.onChange(() => apply(game)); }
  };
  return {
    init: apply,
    onLevelLoaded(game) {
      apply(game);
      if (urlTod) game.renderer.setTimeOfDay(urlTod);
    },
  };
}
