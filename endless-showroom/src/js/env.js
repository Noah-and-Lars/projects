// Store hours, today's event, and the look of the light (renderer side).
import * as THREE from 'three';
import { hashInts } from './rng.js';
import { uniforms } from './mats.js';

export const DAY_LEN = 360, NIGHT_LEN = 180, CYCLE = DAY_LEN + NIGHT_LEN;
export const POWERCUT = [120, 200];

export const EVENTS = {
  fog: { name: 'Fog', desc: 'A thick haze has settled over the store.' },
  powercut: { name: 'Power Cut', desc: 'The power will fail for a while today. Staff get restless in the dark.' },
  overtime: { name: 'Overtime', desc: 'Extra staff are working tonight, and they are faster.' },
  calm: { name: 'Calm Night', desc: 'Fewer staff are working tonight.' },
};

// The same on every screen: decided by the room's seed and the day.
export function eventFor(seed, day) {
  if (day <= 1) return '';
  const h = hashInts(seed, day, 77) % 100;
  if (h < 8) return 'fog';
  if (h < 16) return 'powercut';
  if (h < 25) return 'overtime';
  if (h < 32) return 'calm';
  return '';
}

export const isNight = (t) => t >= DAY_LEN;
export function isHostile(t, ev) { return isNight(t) || (ev === 'powercut' && t >= POWERCUT[0] && t < POWERCUT[1]); }

// Store time shown on the clock: day runs 08:00-22:00, night 22:00-08:00.
export function clockText(t) {
  const mins = t < DAY_LEN ? 8 * 60 + (t / DAY_LEN) * 14 * 60 : 22 * 60 + ((t - DAY_LEN) / NIGHT_LEN) * 10 * 60;
  const m = Math.floor(mins) % (24 * 60);
  return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');
}

// 1 = all lights on, 0.04 = night.
export function lightLevel(t, ev, time) {
  const N = 0.04;
  let L;
  if (t < DAY_LEN - 8) L = 1;
  else if (t < DAY_LEN) L = 1 - (t - (DAY_LEN - 8)) / 8 * (1 - N);
  else if (t > CYCLE - 6) L = N + (t - (CYCLE - 6)) / 6 * (1 - N);
  else L = N;
  if (ev === 'powercut' && t >= POWERCUT[0] && t < POWERCUT[1]) {
    const into = t - POWERCUT[0], left = POWERCUT[1] - t;
    if (into < 3 || left < 3) L = Math.sin(time * 37) > 0.2 ? 1 : 0.05; // flicker
    else L = 0.03;
  }
  return L;
}

const DAY_FOG = new THREE.Color(0xd8d3c8), NIGHT_FOG = new THREE.Color(0x06070a), HAZE = new THREE.Color(0xb9b6b0);
export function applyLight(scene, lights, L, ev, low) {
  const fog = scene.fog;
  fog.color.copy(NIGHT_FOG).lerp(ev === 'fog' ? HAZE : DAY_FOG, L);
  const far = ev === 'fog' ? 10 + 12 * L : (low ? 18 + 32 * L : 22 + 50 * L);
  fog.near = ev === 'fog' ? 1 : 2 + 8 * L;
  fog.far = far;
  scene.background.copy(fog.color);
  // Most of the light comes from the ceiling fittings (mats.js). The
  // hemisphere and environment are the bounce light; colours are linear,
  // so the dark end needs small numbers.
  uniforms.uLevel.value = L;
  uniforms.uEmerg.value = Math.max(0, Math.min(1, (0.6 - L) / 0.4));
  lights.hemi.intensity = 0.03 + 0.8 * L;
  lights.amb.intensity = 0.012 + 0.2 * L;
  scene.environmentIntensity = 0.015 + 0.35 * L;
  lights.ceil.setScalar(0.012 + 0.6 * L * L);
}
