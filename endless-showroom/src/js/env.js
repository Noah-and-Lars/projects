// Store hours, the week, today's event, and the look of the light.
//
// A day is 6 minutes and a night 5. Days run Monday to Sunday; the food and
// first aid kits are restocked at the start of every Monday and Friday.
// Every 10th night is a Crimson Night (and any other night has a 1 in 20
// chance); every 15th day is a Fog Day (any other day: 1 in 100). Power cuts
// are rare. Everything here follows from the room's seed and the day, so
// every screen agrees without being told.
import * as THREE from 'three';
import { hashInts } from './rng.js';
import { uniforms } from './mats.js';

export const DAY_LEN = 360, NIGHT_LEN = 300, CYCLE = DAY_LEN + NIGHT_LEN;
export const POWERCUT = [150, 240];
export const HAIL = [120, 300];
export const hailing = (t, ev) => ev === 'hail' && t >= HAIL[0] && t < HAIL[1];
export const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
export const weekday = (day) => WEEKDAYS[(day - 1) % 7];

// How many restocks have happened by this day (one each Monday and Friday).
export function restockEpoch(day) {
  const w = Math.floor((day - 1) / 7), r = (day - 1) % 7;
  return w * 2 + (r >= 4 ? 2 : 1);
}
export const isRestockDay = (day) => { const r = (day - 1) % 7; return r === 0 || r === 4; };

export const EVENTS = {
  fog: { name: 'Fog Day', desc: 'Thick fog fills the store. The staff are hunting, slowly, and they hit very hard. You can\'t shove them.' },
  powercut: { name: 'Power Cut', desc: 'The power will fail for a while this afternoon. Staff hunt in the dark.' },
  hail: { name: 'Hailstorm', desc: 'Hail will fall through the garden centre skylights this afternoon. Stay under cover there.' },
  crimson: { name: 'Crimson Night', desc: 'More staff, twice as fast, and they climb and jump higher. Build walls high.' },
};

export function dayEvent(seed, day) {
  if (day <= 1) return '';
  if (day % 15 === 0) return 'fog';
  const h = hashInts(seed, day, 77) % 1000;
  if (h < 10) return 'fog';
  if (h < 40) return 'powercut';
  if (h < 80) return 'hail';
  return '';
}
export function nightEvent(seed, day) {
  if (day % 10 === 0) return 'crimson';
  if (day > 1 && hashInts(seed, day, 78) % 100 < 5) return 'crimson';
  return '';
}
export const isNight = (t) => t >= DAY_LEN;
export const eventAt = (seed, day, t) => (isNight(t) ? nightEvent(seed, day) : dayEvent(seed, day));
export const powerOut = (t, ev) => ev === 'powercut' && t >= POWERCUT[0] && t < POWERCUT[1];
export function isHostile(t, ev) { return isNight(t) || ev === 'fog' || powerOut(t, ev); }

// Store time shown on the clock: day runs 08:00-22:00, night 22:00-08:00.
export function clockText(t) {
  const mins = t < DAY_LEN ? 8 * 60 + (t / DAY_LEN) * 14 * 60 : 22 * 60 + ((t - DAY_LEN) / NIGHT_LEN) * 10 * 60;
  const m = Math.floor(mins) % (24 * 60);
  return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');
}

// 1 = all the overhead lights on. At night they go off at once with a clunk
// (only the emergency fittings stay lit) and come back on in the morning.
export const NIGHT_L = 0.035, CASCADE = 1.8;
// The ripple of lights going out (or on): { r, inside, outside } or null.
export function cascade(t, ev) {
  if (t >= DAY_LEN && t < DAY_LEN + CASCADE) return { r: (t - DAY_LEN) / CASCADE * 75, inside: NIGHT_L, outside: 1, k: (t - DAY_LEN) / CASCADE };
  if (t >= CYCLE - CASCADE) return { r: (t - (CYCLE - CASCADE)) / CASCADE * 75, inside: 1, outside: NIGHT_L, k: 1 - (t - (CYCLE - CASCADE)) / CASCADE };
  return null;
}
export function lightLevel(t, ev, time) {
  const N = NIGHT_L;
  let L;
  if (t < DAY_LEN) L = 1;
  else if (t > CYCLE - CASCADE) L = N + (t - (CYCLE - CASCADE)) / CASCADE * (1 - N);
  else if (t < DAY_LEN + CASCADE) L = 1 - (t - DAY_LEN) / CASCADE * (1 - N);
  else L = N;
  if (powerOut(t, ev)) {
    const into = t - POWERCUT[0], left = POWERCUT[1] - t;
    if (into < 3 || left < 2) L = Math.sin(time * 37) > 0.2 ? 1 : 0.05; // flicker
    else L = 0.025;
  }
  if (ev === 'fog' && L > 0.5) L = 0.7;
  return L;
}

const DAY_FOG = new THREE.Color(0xd8d3c8), NIGHT_FOG = new THREE.Color(0x050608), HAZE = new THREE.Color(0xc9c6c0), RED_FOG = new THREE.Color(0x1a0303);
export function applyLight(scene, lights, L, ev, low) {
  const fog = scene.fog;
  const crimson = ev === 'crimson';
  fog.color.copy(crimson ? RED_FOG : NIGHT_FOG).lerp(ev === 'fog' ? HAZE : DAY_FOG, L);
  fog.near = ev === 'fog' ? 0.5 : 2 + 8 * L;
  fog.far = ev === 'fog' ? 14 : (low ? 18 + 32 * L : 22 + 50 * L) + (crimson ? 6 : 0);
  scene.background.copy(fog.color);
  // Most of the light comes from the ceiling fittings (mats.js). The
  // hemisphere and environment are the bounce light; colours are linear,
  // so the dark end needs small numbers.
  uniforms.uLevel.value = L;
  const cs = lights.cascade;
  if (cs) { uniforms.uLevel.value = cs.outside; uniforms.uCutIn.value = cs.inside; uniforms.uCutR.value = cs.r; uniforms.uCutC.value.set(lights.cx, lights.cz); }
  else uniforms.uCutR.value = 0;
  uniforms.uEmerg.value = Math.max(0, Math.min(1, (0.6 - L) / 0.4));
  uniforms.uRed.value = crimson ? 1 : 0;
  lights.hemi.intensity = 0.02 + 0.8 * L + (crimson ? 0.05 : 0);
  lights.hemi.color.setRGB(1, crimson ? 0.35 : 0.96, crimson ? 0.3 : 0.9);
  lights.amb.intensity = 0.008 + 0.2 * L;
  scene.environmentIntensity = 0.01 + 0.35 * L;
  lights.ceil.setScalar(0.01 + 0.6 * L * L);
}
