/**
 * Time of day + weather presets for Sandbox and Challenges, and the player flashlight (F).
 *
 * Publishes `game.ext.atmos`:
 *   choice                 { tod: 'level' | TimeOfDay, weather: 'level' | 'clear' | 'rain' | 'snow' }
 *   choose(key, value)     store a choice (applied on the next sandbox / challenge start, and live
 *                          right away while a sandbox or challenge is being played)
 *   apply(tod?, weather?)  switch live (renderer.setTimeOfDay + game.ext.weather.set)
 *   tod / weather          what is showing now
 *   flashlight             { on, toggle(on?) }  — SpotLight on the camera, no shadow map
 * Missions keep their own look (MissionDef.timeOfDay / weather, applied by the mission module).
 */
import * as THREE from 'three';
import type { TimeOfDay } from '../render/renderer';
import type { Game, GameModule } from './game';

export type WeatherChoice = 'clear' | 'rain' | 'snow';
export const TIMES: TimeOfDay[] = ['day', 'sunset', 'overcast', 'night'];
export const WEATHERS: WeatherChoice[] = ['clear', 'rain', 'snow'];

export interface AtmosChoice { tod: 'level' | TimeOfDay; weather: 'level' | WeatherChoice }

/** flashlight look: warm white, modest reach, soft edge */
const FLASH = { color: 0xfff1dc, intensity: 22, distance: 26, angle: 0.44, penumbra: 0.6, decay: 1.6 };

export function createAtmosModule(): GameModule {
  let game: Game;
  const choice: AtmosChoice = { tod: 'level', weather: 'level' };
  let spot: THREE.SpotLight | null = null;
  let flashOn = false;

  const freePlay = () => !!game.ext.mission?.sandbox || !!game.ext.challenge?.active;

  function apply(tod?: TimeOfDay | null, weather?: WeatherChoice | null, keepLevelSun = false): void {
    if (tod && TIMES.includes(tod)) {
      game.level.sky = tod;
      game.renderer.setTimeOfDay(tod, keepLevelSun);
    }
    if (weather && WEATHERS.includes(weather)) {
      const w = weather === 'clear' ? null : weather;
      game.level.weather = w;
      game.ext.weather?.set(w);
    }
  }
  function applyChoice(): void {
    apply(choice.tod === 'level' ? null : choice.tod, choice.weather === 'level' ? null : choice.weather);
  }

  function ensureSpot(): THREE.SpotLight {
    if (spot) return spot;
    const r = game.renderer, cam = r.camera;
    if (!cam.parent) r.scene.add(cam);
    // stays in the scene once created (intensity 0 when off): changing the light count recompiles every shader
    spot = new THREE.SpotLight(FLASH.color, 0, FLASH.distance, FLASH.angle, FLASH.penumbra, FLASH.decay);
    spot.castShadow = false;
    // just above the eye, outside the cone of the view model (hand at ~43° off-axis) so it does not blow out
    spot.position.set(0, 0.05, 0);
    spot.target.position.set(0, -0.04, -1);
    cam.add(spot, spot.target);
    return spot;
  }
  function toggle(on = !flashOn): boolean {
    flashOn = on;
    if (on || spot) ensureSpot().intensity = on ? FLASH.intensity : 0;
    game.sim?.out.push({ type: 'custom', name: 'player:flashlight', data: { on } });
    return flashOn;
  }

  return {
    init(g) {
      game = g;
      game.ext.atmos = {
        choice,
        times: TIMES,
        weathers: WEATHERS,
        choose(key: 'tod' | 'weather', value: string) {
          if (key === 'tod' && (value === 'level' || TIMES.includes(value as TimeOfDay))) choice.tod = value as AtmosChoice['tod'];
          else if (key === 'weather' && (value === 'level' || WEATHERS.includes(value as WeatherChoice))) choice.weather = value as AtmosChoice['weather'];
          else return;
          if (freePlay()) {
            // live: 'level' goes back to what the map itself wants
            if (key === 'tod') apply(value === 'level' ? (game.ext.levelSky ?? 'sunset') : (value as TimeOfDay), null, value === 'level' && !!game.ext.levelSkyExplicit);
            else apply(null, value === 'level' ? ((game.ext.levelWeather as WeatherChoice | undefined) ?? 'clear') : (value as WeatherChoice));
          }
        },
        apply,
        get tod() { return game.renderer.timeOfDay; },
        get weather() { return (game.ext.weather?.get?.() as WeatherChoice | null) ?? 'clear'; },
        flashlight: { get on() { return flashOn; }, toggle },
      };
    },
    onLevelLoaded(g) {
      // remember the map's own look so 'Map default' can return to it live
      g.ext.levelSky = g.level.sky ?? 'sunset';
      g.ext.levelSkyExplicit = !!g.level.sky;
      g.ext.levelWeather = g.level.weather ?? 'clear';
      if (freePlay()) applyChoice();
      if (flashOn) toggle(false);
    },
    frameUpdate(g) {
      const photo = !!g.ext.photo?.active;
      if (g.input.hit('KeyF') && (photo || (!g.paused && g.controlsEnabled))) toggle();
    },
  };
}
