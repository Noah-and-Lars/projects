import { LOOPS, SOUNDS, createMasterChain } from '../audio/bank';
import { AudioDirector } from '../audio/director';
import { AudioEngine, type Bus, type PlayOpts } from '../audio/engine';
import type { Game, GameModule } from './game';

/**
 * Procedural audio. Publishes game.ext.audio = { engine, play, uiClick, uiHover, setVolume, ensure }.
 * The AudioContext is created lazily on the first user gesture (or `audio.ensure()` in tests).
 */
export function createAudioModule(): GameModule {
  const engine = new AudioEngine();
  const director = new AudioDirector(engine as any);
  let settingsHooked: unknown = null;

  const syncSettings = (game: Game): void => {
    const s = game.ext.settings;
    if (!s) return;
    if (typeof s.masterVolume === 'number' && s.masterVolume !== engine.getVolume('master')) engine.setVolume('master', s.masterVolume);
    if (typeof s.musicVolume === 'number' && s.musicVolume !== engine.getVolume('music')) engine.setVolume('music', s.musicVolume);
    if (typeof s.sfxVolume === 'number' && s.sfxVolume !== engine.getVolume('sfx')) { engine.setVolume('sfx', s.sfxVolume); engine.setVolume('ambient', s.sfxVolume * 0.8); }
  };

  const api = {
    engine,
    director,
    play: (name: string, opts?: PlayOpts) => engine.play(name, opts),
    uiClick: () => engine.play('ui.click', { category: 'ui' }),
    uiHover: () => engine.play('ui.hover', { category: 'uih', gain: 0.8 }),
    setVolume: (bus: Bus, v: number) => engine.setVolume(bus, v),
    /** raw bank access (offline rendering in tests, sound-design tooling) */
    bank: { SOUNDS, LOOPS, createMasterChain },
    /** create the AudioContext now (tests / explicit "enable sound" buttons) */
    ensure: () => { const ok = engine.ensure(); engine.resume(); return ok; },
  };

  return {
    init(game) {
      game.ext.audio = api;
      engine.installGestureHooks(window);
      syncSettings(game);
    },
    onLevelLoaded(game) {
      director.reset();
      syncSettings(game);
    },
    onEvents(_game, events) {
      if (engine.ready) director.onEvents(events);
    },
    frameUpdate(game, dt) {
      const s = game.ext.settings;
      if (s && settingsHooked !== s && typeof s.onChange === 'function') {
        settingsHooked = s;
        try { s.onChange(() => syncSettings(game)); } catch { /* ignore */ }
      }
      syncSettings(game);
      if (!engine.ready) return;
      // listener from the camera
      const cam = game.renderer.camera;
      cam.updateMatrixWorld();
      const m = cam.matrixWorld.elements;
      engine.setListener(
        { x: m[12], y: m[13], z: m[14] },
        { x: -m[8], y: -m[9], z: -m[10] },
        { x: m[4], y: m[5], z: m[6] },
      );
      director.frame(game as any, dt);
      engine.update(dt);
    },
  };
}
