// Store hours and the week.
//
// A day is 6 minutes; the first night is 5 and every night after it runs 4
// seconds longer than the one before, so an old store has long nights. Days
// run Monday to Sunday; the food and first aid kits are restocked at the start
// of every Monday and Friday. Everything here follows from the day number, so
// every screen agrees without being told.
import * as THREE from 'three';
import { uniforms } from './mats.js';

// Day length can be shortened per store (the host picks); these update live.
export let DAY_LEN = 360, DAY_SCALE = 1;
export function setDayScale(k) {
  k = k === 0.5 ? 0.5 : 1;
  if (k === DAY_SCALE) return false;
  DAY_SCALE = k; DAY_LEN = 360 * k;
  return true;
}
// Night d is 300 s + 4 s for every day before it (capped at an hour).
export const nightLen = (day) => Math.min(3600, 300 + 4 * (Math.max(1, day) - 1)) * DAY_SCALE;
export const cycleLen = (day) => DAY_LEN + nightLen(day);
export const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
export const weekday = (day) => WEEKDAYS[(day - 1) % 7];

// How many restocks have happened by this day (one each Monday and Friday).
export function restockEpoch(day) {
  const w = Math.floor((day - 1) / 7), r = (day - 1) % 7;
  return w * 2 + (r >= 4 ? 2 : 1);
}
export const isRestockDay = (day) => { const r = (day - 1) % 7; return r === 0 || r === 4; };

export const isNight = (t) => t >= DAY_LEN;
export const isHostile = (t) => isNight(t);

// Store time shown on the clock: day runs 08:00-22:00, night 22:00-08:00.
export function clockText(t, day) {
  const mins = t < DAY_LEN ? 8 * 60 + (t / DAY_LEN) * 14 * 60 : 22 * 60 + ((t - DAY_LEN) / nightLen(day)) * 10 * 60;
  const m = Math.floor(mins) % (24 * 60);
  return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');
}

// 1 = all the overhead lights on. At night they go off with a clunk (only the
// emergency fittings stay lit) and come back on in the morning.
export const NIGHT_L = 0.035, CASCADE = 1.8;
// The ripple of lights going out (or on): { r, inside, outside } or null.
export function cascade(t, day) {
  const C = cycleLen(day);
  if (t >= DAY_LEN && t < DAY_LEN + CASCADE) return { r: (t - DAY_LEN) / CASCADE * 75, inside: NIGHT_L, outside: 1, k: (t - DAY_LEN) / CASCADE };
  if (t >= C - CASCADE) return { r: (t - (C - CASCADE)) / CASCADE * 75, inside: 1, outside: NIGHT_L, k: 1 - (t - (C - CASCADE)) / CASCADE };
  return null;
}
export function lightLevel(t, day) {
  const N = NIGHT_L, C = cycleLen(day);
  if (t < DAY_LEN) return 1;
  if (t > C - CASCADE) return N + (t - (C - CASCADE)) / CASCADE * (1 - N);
  if (t < DAY_LEN + CASCADE) return 1 - (t - DAY_LEN) / CASCADE * (1 - N);
  return N;
}

// A cool grey haze by day that swallows the distance (and the tops of the
// pillars), near-black murk at night.
const DAY_FOG = new THREE.Color(0xbfc3c6), NIGHT_FOG = new THREE.Color(0x030405);
// the fog overhead: a little lighter than at eye level, so the pillars thin into haze rather than void
const DAY_SKY = new THREE.Color(0xd2d5d7), NIGHT_SKY = new THREE.Color(0x0e1217);
export function applyLight(scene, lights, L, low) {
  const fog = scene.fog;
  fog.color.copy(NIGHT_FOG).lerp(DAY_FOG, L);
  fog.near = 1 + 5 * L;
  fog.far = low ? 16 + 30 * L : 18 + 44 * L;
  scene.background.copy(fog.color);
  uniforms.uSkyFog.value.copy(NIGHT_SKY).lerp(DAY_SKY, L);
  // Most of the light comes from the ceiling fittings (mats.js). The
  // hemisphere and environment are the bounce light; colours are linear,
  // so the dark end needs small numbers.
  uniforms.uLevel.value = L;
  const cs = lights.cascade;
  if (cs) { uniforms.uLevel.value = cs.outside; uniforms.uCutIn.value = cs.inside; uniforms.uCutR.value = cs.r; uniforms.uCutC.value.set(lights.cx, lights.cz); }
  else uniforms.uCutR.value = 0;
  uniforms.uEmerg.value = Math.max(0, Math.min(1, (0.6 - L) / 0.4));
  uniforms.uRed.value = 0;
  lights.hemi.intensity = 0.02 + 0.8 * L;
  lights.hemi.color.setRGB(1, 0.96, 0.9);
  lights.amb.intensity = 0.008 + 0.2 * L;
  scene.environmentIntensity = 0.01 + 0.35 * L;
  lights.ceil.setScalar(0.01 + 0.6 * L * L);
}
