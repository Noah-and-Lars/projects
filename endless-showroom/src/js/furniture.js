// Every movable thing in the store: furniture you can carry and build with,
// and food / supplies you can pick up and use. All models are original and
// made from boxes and cylinders (geo.js), centred on x/z with y = 0 at the
// bottom. The front of a piece faces +z. w is the size along x, d along z.
import * as THREE from 'three';
import { GeoBuilder } from './geo.js';
import { SURF, furnitureMaterial } from './mats.js';

const WOOD = [0xc89a64, 0x8a5a36, 0xe2c79c, 0x5b3b25, 0xf0ede6, 0x2f2f33];
const FABRIC = [0x5a6f8c, 0x9a4b3f, 0x6f8a5b, 0xd8cdbb, 0x3d3d48, 0xc98c3d, 0x8b6c9e];
const METAL = 0x9aa2aa, DARK = 0x2a2a2e, WHITE = 0xf3f1ec;

function legs4(g, w, d, h, t, col, inset = 0.05) {
  const x = w / 2 - inset - t / 2, z = d / 2 - inset - t / 2;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.box(sx * x, h / 2, sz * z, t, h, t, col);
}

const LEAF = [0x3f7a3a, 0x4f8f45, 0x356a32];
const GLASS = 0xc9d6df, CLOTH = 0x2f7d4a, EMBER = 0xe8742a, SCREEN_OFF = 0x0b1a2a;
// A flat screen facing +z, centred on (x, y, z): dark when off, a picture when on.
function screen(g, x, y, z, w, h, on, game) {
  g.box(x, y, z, w, h, 0.003, SCREEN_OFF);
  if (!on) { g.box(x - w * 0.25, y + h * 0.22, z + 0.002, w * 0.2, h * 0.05, 0.001, 0x1d3550); return; }
  // a lit picture glows, even in the dark
  const prev = g.matOf; g.matOf = () => SURF.glow;
  try { screenPicture(g, x, y, z, w, h, game, on); } finally { g.matOf = prev; }
}
// What's on: twelve channels, picked when a screen is switched on.
export const TV_CHANNELS = 24;
function screenPicture(g, x, y, z, w, h, game, ch = 1) {
  const f = z + 0.0025, d = 0.001, f2 = f + 0.0005;
  const R = (u0, v0, u1, v1, col, k = f2) => g.box(x + w * (u0 + u1) / 2, y + h * (v0 + v1) / 2, k, w * (u1 - u0), h * (v1 - v0), d, col); // u, v in -0.5..0.5
  if (game) { // a bright little game screen
    g.box(x, y, f, w * 0.96, h * 0.94, d, 0x101428);
    const cols = [0xf1c40f, 0xe74c3c, 0x2ecc71, 0x3498db, 0x9b59b6];
    for (let i = 0; i < 5; i++) for (let j = 0; j < 3; j++) g.box(x - w * 0.36 + i * w * 0.18, y + h * 0.3 - j * h * 0.1, f + 0.0005, w * 0.14, h * 0.07, d, cols[(i + j) % 5]);
    g.box(x, y - h * 0.32, f + 0.0005, w * 0.22, h * 0.06, d, 0xecf0f1); g.box(x + w * 0.1, y - h * 0.12, f + 0.0005, w * 0.05, w * 0.05, d, 0xffffff);
    return;
  }
  switch (((ch | 0) - 1 + TV_CHANNELS) % TV_CHANNELS) {
    case 0: // fields under a summer sky
      R(-0.48, -0.04, 0.48, 0.47, 0x6fb3e0, f); R(-0.48, -0.47, 0.48, -0.04, 0x5d9e4a, f); R(0.23, 0.2, 0.33, 0.37, 0xfff2a8); R(-0.35, -0.08, -0.05, 0.04, 0x3f7a3a); R(-0.14, 0.02, 0.04, 0.1, 0xe8f4fb); break;
    case 1: { // colour bars
      const bars = [0xf2f2f2, 0xf1d22a, 0x2ac9d2, 0x2ab84a, 0xc92ac0, 0xd2302a, 0x2a3ad2];
      bars.forEach((c, i) => R(-0.48 + i * 0.137, -0.2, -0.48 + (i + 1) * 0.137, 0.47, c, f)); R(-0.48, -0.47, 0.48, -0.2, 0x1a1a1a, f); R(-0.2, -0.4, 0.2, -0.27, 0xf2f2f2); break; }
    case 2: // the city at night
      R(-0.48, -0.47, 0.48, 0.47, 0x101a3a, f); for (let i = 0; i < 7; i++) { const hh = 0.15 + ((i * 37) % 30) / 60; R(-0.46 + i * 0.135, -0.47, -0.36 + i * 0.135, -0.47 + hh, 0x26304f); R(-0.43 + i * 0.135, -0.4 + hh * 0.5, -0.4 + i * 0.135, -0.37 + hh * 0.5, 0xffe08a, f2 + 0.0004); } R(0.28, 0.25, 0.38, 0.38, 0xf4f1d8); break;
    case 3: // a boat at sea
      R(-0.48, 0.0, 0.48, 0.47, 0x9fd3ef, f); R(-0.48, -0.47, 0.48, 0.0, 0x1f6fa8, f); R(-0.15, -0.08, 0.15, 0.0, 0x8a4b2a); R(-0.01, 0.0, 0.01, 0.3, 0x5a3a2a); R(0.01, 0.05, 0.14, 0.28, 0xf6f6f2); break;
    case 4: // the weather map
      R(-0.48, -0.47, 0.48, 0.47, 0x2d6fb5, f); R(-0.25, -0.35, 0.1, 0.3, 0x4f9a46); R(0.05, -0.1, 0.25, 0.15, 0x4f9a46); R(-0.12, 0.05, 0.0, 0.17, 0xfff07a, f2 + 0.0004); R(0.1, -0.05, 0.24, 0.05, 0xe8eef2, f2 + 0.0004); R(-0.46, -0.47, 0.48, -0.36, 0xd8322a, f2 + 0.0004); break;
    case 5: // the news
      R(-0.48, -0.47, 0.48, 0.47, 0x23365e, f); R(-0.12, -0.2, 0.12, 0.2, 0xd9a07a); R(-0.18, -0.47, 0.18, -0.2, 0x2b2d33); R(-0.48, -0.47, 0.48, -0.32, 0xc0392b, f2 + 0.0004); R(-0.44, -0.43, 0.2, -0.36, 0xf2f2f2, f2 + 0.0008); break;
    case 6: // football
      R(-0.48, -0.47, 0.48, 0.47, 0x2f8f3a, f); R(-0.005, -0.47, 0.005, 0.47, 0xf2f2f2); R(-0.08, -0.08, 0.08, 0.08, 0xf2f2f2); R(-0.06, -0.06, 0.06, 0.06, 0x2f8f3a, f2 + 0.0004); R(0.2, 0.1, 0.24, 0.16, 0xd8322a); R(-0.3, -0.2, -0.26, -0.14, 0x2d6fb5); break;
    case 7: // sunset
      [0x2b1b4a, 0x7a2f6a, 0xd2553a, 0xf09a3a].forEach((c, i) => R(-0.48, 0.47 - (i + 1) * 0.16, 0.48, 0.47 - i * 0.16, c, f)); R(-0.48, -0.47, 0.48, -0.17, 0x1a1428, f); R(-0.12, -0.17, 0.12, 0.0, 0xffd27a); break;
    case 8: // an aquarium
      R(-0.48, -0.47, 0.48, 0.47, 0x1f7fa8, f); R(-0.48, -0.47, 0.48, -0.36, 0xd8c08a); R(-0.3, 0.05, -0.12, 0.15, 0xf39c12); R(0.1, -0.15, 0.3, -0.05, 0xe74c3c); R(-0.4, -0.36, -0.36, -0.05, 0x3f9a46); R(0.36, -0.36, 0.4, 0.0, 0x3f9a46); break;
    case 9: // snowy mountains
      R(-0.48, -0.47, 0.48, 0.47, 0xb9dcf2, f); R(-0.4, -0.47, 0.1, 0.15, 0x6a7f96); R(0.0, -0.47, 0.46, 0.25, 0x5a6f86); R(-0.22, 0.02, -0.08, 0.15, 0xf6f8fa); R(0.15, 0.1, 0.32, 0.25, 0xf6f8fa); R(-0.48, -0.47, 0.48, -0.32, 0xf2f6f8, f2 + 0.0004); break;
    case 10: // space
      R(-0.48, -0.47, 0.48, 0.47, 0x05061a, f); R(-0.05, -0.25, 0.3, 0.1, 0xd68a4a); R(-0.12, -0.12, 0.37, -0.08, 0xe8c08a, f2 + 0.0004); for (let i = 0; i < 9; i++) R(-0.45 + ((i * 53) % 90) / 100, -0.4 + ((i * 29) % 80) / 100, -0.44 + ((i * 53) % 90) / 100, -0.39 + ((i * 29) % 80) / 100, 0xffffff); break;
    case 11: // a cooking show
      R(-0.48, -0.47, 0.48, 0.47, 0xe8dcc8, f); R(-0.48, -0.47, 0.48, -0.15, 0x8a5a36); R(-0.1, -0.15, 0.1, 0.25, 0xf6f6f2); R(-0.06, 0.25, 0.06, 0.38, 0xf6f6f2); R(0.2, -0.15, 0.34, -0.05, 0x9a9590); R(-0.34, -0.15, -0.2, -0.08, 0xd8322a); break;
    case 12: // a cat on a sofa
      R(-0.48, -0.47, 0.48, 0.47, 0xd9c8a8, f); R(-0.48, -0.47, 0.48, -0.1, 0x7a4b8a); R(-0.15, -0.1, 0.15, 0.12, 0xe08a3a); R(-0.1, 0.12, 0.1, 0.28, 0xe08a3a); R(-0.1, 0.28, -0.04, 0.34, 0xe08a3a); R(0.04, 0.28, 0.1, 0.34, 0xe08a3a); R(-0.06, 0.18, -0.03, 0.21, 0x1a1a1a, f2 + 0.0004); R(0.03, 0.18, 0.06, 0.21, 0x1a1a1a, f2 + 0.0004); break;
    case 13: // a quiz show
      R(-0.48, -0.47, 0.48, 0.47, 0x3a1a6a, f); for (let i = 0; i < 4; i++) R(-0.42 + (i % 2) * 0.44, -0.4 + Math.floor(i / 2) * 0.22, -0.02 + (i % 2) * 0.44, -0.22 + Math.floor(i / 2) * 0.22, [0xd8322a, 0x2d6fb5, 0xf1c40f, 0x2ab84a][i]); R(-0.42, 0.12, 0.42, 0.4, 0xf2f2f2); break;
    case 14: // a racing game
      R(-0.48, 0.0, 0.48, 0.47, 0x7fc4ef, f); R(-0.48, -0.47, 0.48, 0.0, 0x4f9a46, f); R(-0.2, -0.47, 0.2, 0.0, 0x55575c); R(-0.01, -0.45, 0.01, -0.02, 0xf2f2f2); R(-0.08, -0.32, 0.08, -0.2, 0xd8322a); break;
    case 15: // a forest
      R(-0.48, -0.47, 0.48, 0.47, 0xa8d8a8, f); for (let i = 0; i < 6; i++) { R(-0.44 + i * 0.16, -0.47, -0.4 + i * 0.16, -0.1, 0x6a4a2a); R(-0.48 + i * 0.16, -0.15 + (i % 2) * 0.08, -0.36 + i * 0.16, 0.25 + (i % 2) * 0.08, 0x2f7a3a); } break;
    case 16: // fireworks
      R(-0.48, -0.47, 0.48, 0.47, 0x0a0a22, f); for (const [u, v, c] of [[-0.25, 0.2, 0xff4d6a], [0.2, 0.25, 0x4dd2ff], [0.0, -0.05, 0xffe14d]]) { R(u - 0.08, v - 0.01, u + 0.08, v + 0.01, c); R(u - 0.01, v - 0.08, u + 0.01, v + 0.08, c); R(u - 0.05, v - 0.05, u + 0.05, v + 0.05, c, f2 + 0.0002); } break;
    case 17: // the store's own advert
      R(-0.48, -0.47, 0.48, 0.47, 0x2b6cb0, f); R(-0.4, 0.05, 0.4, 0.3, 0xf2f2f2); R(-0.3, -0.3, 0.3, -0.05, 0xffd34d); R(-0.36, 0.1, -0.2, 0.25, 0x2b6cb0, f2 + 0.0004); break;
    case 18: // a test pattern
      R(-0.48, -0.47, 0.48, 0.47, 0x9a9a9a, f); R(-0.3, -0.3, 0.3, 0.3, 0x1a1a1a); R(-0.25, -0.25, 0.25, 0.25, 0xf2f2f2, f2 + 0.0004); R(-0.02, -0.25, 0.02, 0.25, 0x1a1a1a, f2 + 0.0008); R(-0.25, -0.02, 0.25, 0.02, 0x1a1a1a, f2 + 0.0008); break;
    case 19: // a rainy street
      R(-0.48, -0.47, 0.48, 0.47, 0x5a6878, f); R(-0.48, -0.47, 0.48, -0.25, 0x3a4450); for (let i = 0; i < 10; i++) R(-0.45 + i * 0.1, -0.2 + (i % 3) * 0.2, -0.44 + i * 0.1, -0.08 + (i % 3) * 0.2, 0xb8c8d8); R(0.2, -0.25, 0.3, 0.1, 0xffd27a); break;
    case 20: // a desert
      R(-0.48, -0.1, 0.48, 0.47, 0xf2c88a, f); R(-0.48, -0.47, 0.48, -0.1, 0xd8a85a, f); R(0.25, 0.2, 0.35, 0.3, 0xfff2c8); R(-0.3, -0.1, -0.26, 0.15, 0x3f7a3a); R(-0.34, 0.0, -0.3, 0.08, 0x3f7a3a); break;
    case 21: // a cartoon
      R(-0.48, -0.47, 0.48, 0.47, 0xf7d64a, f); R(-0.2, -0.3, 0.2, 0.2, 0xff8ac8); R(-0.1, 0.0, -0.04, 0.08, 0x1a1a1a, f2 + 0.0004); R(0.04, 0.0, 0.1, 0.08, 0x1a1a1a, f2 + 0.0004); R(-0.08, -0.15, 0.08, -0.1, 0xd8322a, f2 + 0.0004); break;
    case 22: // a nature show: a bird
      R(-0.48, -0.47, 0.48, 0.47, 0x9fd3ef, f); R(-0.48, -0.47, 0.48, -0.3, 0x5d9e4a); R(-0.08, -0.05, 0.08, 0.05, 0x2d6fb5); R(-0.2, 0.0, -0.08, 0.08, 0x2d6fb5); R(0.08, 0.0, 0.2, 0.08, 0x2d6fb5); R(0.08, -0.02, 0.12, 0.02, 0xf1c40f, f2 + 0.0004); break;
    default: // static
      R(-0.48, -0.47, 0.48, 0.47, 0x5a5a5a, f); for (let i = 0; i < 18; i++) R(-0.46 + ((i * 41) % 92) / 100, -0.45 + ((i * 67) % 90) / 100, -0.4 + ((i * 41) % 92) / 100, -0.42 + ((i * 67) % 90) / 100, i % 2 ? 0xdcdcdc : 0x2a2a2a); break;
  }
}

export const TYPES = {
  // ---- living room ----
  sofa: { m: 'fabric', soft: 'top', name: 'Sofa', w: 2.2, d: 0.9, h: 0.85, hp: 160, cols: FABRIC, build(g, c) {
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.box(sx * 1.02, 0.03, sz * 0.36, 0.06, 0.06, 0.06, DARK);
    g.box(0, 0.16, 0, 2.2, 0.2, 0.86, shade(c, 0.88));
    g.box(0, 0.61, -0.34, 2.2, 0.48, 0.2, c);
    for (const sx of [-1, 1]) { g.box(sx * 1.0, 0.43, 0.02, 0.2, 0.54, 0.86, c); g.box(sx * 1.0, 0.715, 0.02, 0.22, 0.03, 0.88, shade(c, 1.06)); }
    for (const x of [-0.45, 0.45]) { g.box(x, 0.33, 0.07, 0.88, 0.14, 0.72, shade(c, 1.07)); g.box(x, 0.335, 0.432, 0.86, 0.02, 0.005, shade(c, 0.8)); g.box(x, 0.58, -0.2, 0.86, 0.38, 0.14, shade(c, 1.03)); }
    g.box(-0.7, 0.53, -0.1, 0.3, 0.28, 0.1, shade(c, 0.72)); g.box(0.7, 0.53, -0.1, 0.3, 0.28, 0.1, shade(c, 0.72));
  } },
  armchair: { m: 'fabric', soft: 'top', name: 'Armchair', w: 0.9, d: 0.9, h: 0.9, hp: 100, cols: FABRIC, build(g, c) {
    legs4(g, 0.9, 0.9, 0.12, 0.05, 0x6e4a2f, 0.08);
    g.box(0, 0.17, 0.02, 0.9, 0.1, 0.86, shade(c, 0.88));
    g.box(0, 0.3, 0.07, 0.6, 0.16, 0.72, shade(c, 1.07)); g.box(0, 0.305, 0.432, 0.58, 0.02, 0.005, shade(c, 0.8));
    g.box(0, 0.6, -0.35, 0.9, 0.58, 0.2, c); g.box(0, 0.6, -0.22, 0.58, 0.44, 0.1, shade(c, 1.03));
    for (const sx of [-1, 1]) { g.box(sx * 0.37, 0.43, 0, 0.16, 0.42, 0.9, c); g.box(sx * 0.37, 0.65, 0.01, 0.18, 0.03, 0.9, shade(c, 1.06)); }
  } },
  coffeeTable: { m: 'wood', see: true, name: 'Coffee Table', w: 1.2, d: 0.6, h: 0.45, hp: 70, cols: WOOD, build(g, c) {
    legs4(g, 1.2, 0.6, 0.41, 0.06, c);
    g.box(0, 0.43, 0, 1.2, 0.04, 0.6, c); g.box(0, 0.405, 0, 1.12, 0.03, 0.52, shade(c, 0.82));
    g.box(0, 0.12, 0, 1.08, 0.03, 0.5, shade(c, 0.85));
    g.box(-0.25, 0.145, 0.02, 0.3, 0.02, 0.22, 0x3b5ea3); g.box(-0.22, 0.165, 0.0, 0.26, 0.02, 0.2, 0xd8b23b);
  } },
  diningTable: { m: 'wood', name: 'Dining Table', w: 1.6, d: 0.9, h: 0.75, hp: 110, cols: WOOD, build(g, c) {
    legs4(g, 1.6, 0.9, 0.71, 0.07, c);
    g.box(0, 0.73, 0, 1.6, 0.04, 0.9, c);
    g.box(0, 0.65, 0.37, 1.4, 0.1, 0.03, shade(c, 0.85)); g.box(0, 0.65, -0.37, 1.4, 0.1, 0.03, shade(c, 0.85));
    g.box(0.72, 0.65, 0, 0.03, 0.1, 0.72, shade(c, 0.85)); g.box(-0.72, 0.65, 0, 0.03, 0.1, 0.72, shade(c, 0.85));
    g.box(0, 0.751, 0, 0.5, 0.002, 0.9, 0xece8e0);
  } },
  chair: { m: 'wood', name: 'Chair', w: 0.45, d: 0.45, h: 0.9, hp: 40, cols: WOOD, build(g, c) {
    legs4(g, 0.45, 0.45, 0.43, 0.035, c, 0.02);
    g.box(0, 0.45, 0, 0.45, 0.04, 0.45, c); g.box(0, 0.475, 0.02, 0.38, 0.015, 0.36, shade(c, 1.1));
    g.box(0, 0.15, 0.19, 0.38, 0.025, 0.025, shade(c, 0.85)); g.box(0, 0.15, -0.19, 0.38, 0.025, 0.025, shade(c, 0.85));
    g.box(-0.19, 0.67, -0.2, 0.035, 0.44, 0.035, c); g.box(0.19, 0.67, -0.2, 0.035, 0.44, 0.035, c);
    g.box(0, 0.83, -0.2, 0.42, 0.12, 0.03, c); g.box(0, 0.66, -0.2, 0.34, 0.04, 0.025, shade(c, 0.92));
  } },
  stool: { m: 'wood', name: 'Stool', w: 0.4, d: 0.4, h: 0.65, hp: 30, cols: WOOD, build(g, c) {
    legs4(g, 0.4, 0.4, 0.62, 0.035, c, 0.04);
    g.cyl(0, 0.6, 0, 0.2, 0.05, c, 12);
    for (const s of [-1, 1]) { g.box(0, 0.2, s * 0.145, 0.28, 0.025, 0.025, shade(c, 0.85)); g.box(s * 0.145, 0.24, 0, 0.025, 0.025, 0.28, shade(c, 0.85)); }
  } },
  bench: { m: 'wood', name: 'Bench', w: 1.4, d: 0.4, h: 0.45, hp: 70, cols: WOOD, build(g, c) {
    for (const x of [-0.6, 0.6]) { g.box(x, 0.2, 0.14, 0.06, 0.4, 0.06, c); g.box(x, 0.2, -0.14, 0.06, 0.4, 0.06, c); g.box(x, 0.1, 0, 0.05, 0.05, 0.3, shade(c, 0.85)); }
    g.box(0, 0.1, 0, 1.2, 0.05, 0.04, shade(c, 0.85));
    for (const z of [-0.13, 0, 0.13]) g.box(0, 0.43, z, 1.4, 0.04, 0.12, z ? c : shade(c, 1.06));
  } },
  ottoman: { m: 'fabric', soft: 'top', name: 'Ottoman', w: 0.6, d: 0.6, h: 0.42, hp: 40, cols: FABRIC, build(g, c) {
    legs4(g, 0.6, 0.6, 0.05, 0.05, 0x6e4a2f, 0.05);
    g.box(0, 0.22, 0, 0.6, 0.32, 0.6, c); g.box(0, 0.4, 0, 0.56, 0.04, 0.56, shade(c, 1.06));
    g.box(0, 0.06, 0, 0.62, 0.02, 0.62, shade(c, 0.8)); g.box(0, 0.422, 0, 0.04, 0.005, 0.04, shade(c, 0.7));
  } },
  // An L-shaped corner sofa: backs along the back and right, seats in an L.
  cornerSofa: { m: 'fabric', soft: 'top', name: 'Corner Sofa', w: 2.4, d: 1.8, h: 0.85, hp: 220, cols: FABRIC,
    parts: [[-1.2, 0, -0.9, 1.2, 0.85, -0.68], [0.98, 0, -0.68, 1.2, 0.85, 0.9], [-1.2, 0, -0.68, -1.0, 0.68, 0.0], [-1.0, 0, -0.68, 0.98, 0.45, 0.0], [0.18, 0, 0.0, 0.98, 0.45, 0.9]],
    build(g, c) {
      g.box(0, 0.425, -0.79, 2.4, 0.85, 0.22, c); g.box(1.09, 0.425, 0.11, 0.22, 0.85, 1.58, c);
      g.box(-1.1, 0.34, -0.34, 0.2, 0.68, 0.68, c); g.box(-1.1, 0.695, -0.34, 0.22, 0.03, 0.7, shade(c, 1.06));
      g.box(-0.01, 0.15, -0.34, 1.98, 0.3, 0.68, shade(c, 0.88)); g.box(0.58, 0.15, 0.45, 0.8, 0.3, 0.9, shade(c, 0.88));
      for (const x of [-0.66, 0.0]) g.box(x, 0.37, -0.32, 0.64, 0.14, 0.62, shade(c, 1.07));
      g.box(0.58, 0.37, -0.32, 0.78, 0.14, 0.62, shade(c, 1.07)); g.box(0.58, 0.37, 0.44, 0.78, 0.14, 0.88, shade(c, 1.07));
      for (const x of [-0.66, 0.0, 0.55]) g.box(x, 0.6, -0.6, 0.6, 0.36, 0.14, shade(c, 1.03));
      g.box(0.91, 0.6, 0.3, 0.14, 0.36, 0.9, shade(c, 1.03));
      g.box(-0.3, 0.55, -0.5, 0.3, 0.26, 0.1, shade(c, 0.72));
    } },
  tvStand: { m: 'wood', name: 'TV Bench', w: 1.6, d: 0.45, h: 0.5, hp: 90, cols: WOOD, build(g, c) {
    legs4(g, 1.6, 0.45, 0.06, 0.05, DARK);
    g.box(0, 0.28, 0, 1.6, 0.44, 0.45, c); g.box(0, 0.49, 0, 1.6, 0.02, 0.45, shade(c, 1.06));
    g.box(-0.52, 0.28, 0.228, 0.5, 0.38, 0.01, shade(c, 0.88)); g.box(0.52, 0.28, 0.228, 0.5, 0.38, 0.01, shade(c, 0.88));
    g.box(0, 0.28, 0.2, 0.5, 0.38, 0.05, shade(c, 0.55)); g.box(0, 0.16, 0.1, 0.36, 0.06, 0.2, 0x1d1f24);
    g.box(-0.3, 0.42, 0.236, 0.12, 0.015, 0.012, METAL); g.box(0.3, 0.42, 0.236, 0.12, 0.015, 0.012, METAL);
  } },
  tv: { m: 'plastic', use: 'tv', name: 'Television', w: 1.2, d: 0.25, h: 0.75, hp: 60, cols: [0x1d1f24, 0x2a2c33], build(g, c, s) {
    g.box(0, 0.025, 0, 0.42, 0.03, 0.22, c); g.box(0, 0.1, -0.02, 0.07, 0.14, 0.04, c);
    g.box(0, 0.45, -0.01, 1.2, 0.62, 0.05, c); g.box(0, 0.45, -0.05, 0.8, 0.4, 0.04, shade(c, 0.8));
    screen(g, 0, 0.455, 0.0155, 1.12, 0.55, s);
    g.box(0.5, 0.155, 0.017, 0.02, 0.008, 0.002, s ? 0x44ff66 : 0xff4444);
  } },
  rug: { m: 'fabric', name: 'Rug', w: 2.0, d: 1.4, h: 0.02, hp: 20, flat: true, cols: [0xb5523b, 0x5a6f8c, 0xd8cdbb, 0x6f8a5b], build(g, c) {
    g.box(0, 0.006, 0, 2.0, 0.012, 1.4, c); g.box(0, 0.013, 0, 1.7, 0.002, 1.1, shade(c, 1.15));
    g.box(0, 0.0145, 0, 1.4, 0.002, 0.8, shade(c, 0.85)); g.box(0, 0.016, 0, 0.5, 0.002, 0.3, shade(c, 1.2));
  } },
  sideTable: { m: 'wood', see: true, name: 'Side Table', w: 0.5, d: 0.5, h: 0.55, hp: 40, cols: WOOD, build(g, c) {
    legs4(g, 0.5, 0.5, 0.52, 0.04, c, 0.03);
    g.box(0, 0.535, 0, 0.5, 0.03, 0.5, c); g.box(0, 0.47, 0, 0.42, 0.08, 0.42, shade(c, 0.92));
    g.box(0, 0.47, 0.212, 0.1, 0.02, 0.012, METAL); g.box(0, 0.22, 0, 0.44, 0.02, 0.44, shade(c, 0.9));
  } },
  floorLamp: { m: 'fabric', lamp: true, use: 'lamp', name: 'Floor Lamp', w: 0.4, d: 0.4, h: 1.6, hp: 30, cols: [WHITE, 0xe8c87a, 0xd9d0c0], build(g, c) {
    g.cyl(0, 0, 0, 0.18, 0.03, DARK, 12); g.cyl(0, 0.03, 0, 0.12, 0.02, METAL, 12);
    g.cyl(0, 0.05, 0, 0.018, 1.2, DARK, 6); g.cyl(0, 1.2, 0, 0.03, 0.06, METAL, 8);
    g.cyl(0, 1.24, 0, 0.045, 0.08, 0xfff4d6, 8); g.cyl(0, 1.25, 0, 0.2, 0.33, c, 12, 0.13);
  } },
  tableLamp: { m: 'plastic', lamp: true, use: 'lamp', name: 'Table Lamp', w: 0.3, d: 0.3, h: 0.5, hp: 20, cols: [0xf3e2b8, 0xe8d8c4, 0xd9e2ea], build(g, c) {
    g.cyl(0, 0, 0, 0.11, 0.025, DARK, 12); g.cyl(0, 0.025, 0, 0.07, 0.07, shade(c, 0.8), 10, 0.04);
    g.cyl(0, 0.09, 0, 0.016, 0.18, METAL, 6); g.cyl(0, 0.24, 0, 0.035, 0.06, 0xfff4d6, 8);
    g.cyl(0, 0.27, 0, 0.15, 0.23, c, 12, 0.09);
  } },
  plant: { m: 'paint', name: 'Potted Plant', w: 0.5, d: 0.5, h: 1.2, hp: 25, cols: [0xd8d2c4, 0x9a5b3a, 0x3d3d48], build(g, c) {
    g.cyl(0, 0, 0, 0.17, 0.33, c, 12, 0.21); g.cyl(0, 0.33, 0, 0.22, 0.03, shade(c, 0.9), 12); g.cyl(0, 0.33, 0, 0.19, 0.02, 0x4a3420, 12);
    g.cyl(0, 0.34, 0, 0.025, 0.45, 0x5b4a2a, 6);
    for (let i = 0; i < 9; i++) { const a = i * 2.4, r = 0.06 + (i % 3) * 0.06; g.box(Math.cos(a) * r, 0.52 + (i % 5) * 0.13, Math.sin(a) * r, 0.24 - (i % 3) * 0.03, 0.26, 0.24 - (i % 3) * 0.03, LEAF[i % 3]); }
  } },
  beanbag: { m: 'fabric', soft: 'any', name: 'Beanbag', w: 0.8, d: 0.8, h: 0.6, hp: 40, cols: [0xc0392b, 0x2e86c1, 0xf1c40f, 0x27ae60, 0x8e44ad], build(g, c) {
    g.cyl(0, 0, 0, 0.36, 0.06, shade(c, 0.85), 14, 0.4); g.cyl(0, 0.06, 0, 0.4, 0.24, c, 14, 0.38);
    g.cyl(0, 0.3, 0, 0.38, 0.18, shade(c, 1.06), 14, 0.24); g.box(0, 0.42, -0.2, 0.52, 0.18, 0.3, shade(c, 0.94));
    g.box(0, 0.481, 0.05, 0.3, 0.005, 0.02, shade(c, 0.75));
  } },
  // ---- bedroom ----
  bedSingle: { m: 'fabric', soft: 'top', name: 'Single Bed', w: 1.0, d: 2.0, h: 1.0, hp: 130, cols: FABRIC,
    parts: [[-0.5, 0, -0.95, 0.5, 0.55, 1.0], [-0.5, 0, -1.0, 0.5, 1.0, -0.95]], build(g, c) {
    for (const sx of [-1, 1]) g.box(sx * 0.46, 0.04, 0.93, 0.06, 0.08, 0.06, 0x8a6440);
    g.box(0, 0.19, 0, 1.0, 0.22, 2.0, 0xa47c55); g.box(0, 0.4, 0.02, 0.94, 0.2, 1.9, WHITE);
    g.box(0, 0.51, 0.25, 0.97, 0.04, 1.42, c); g.box(0, 0.51, -0.43, 0.97, 0.05, 0.08, shade(c, 1.12));
    g.box(0, 0.4, 0.96, 0.97, 0.2, 0.02, c); g.box(0.485, 0.4, 0.25, 0.02, 0.2, 1.4, c); g.box(-0.485, 0.4, 0.25, 0.02, 0.2, 1.4, c);
    g.box(0, 0.55, -0.74, 0.6, 0.11, 0.32, WHITE);
    g.box(0, 0.5, -0.975, 1.0, 1.0, 0.05, 0xa47c55); g.box(0, 0.75, -0.948, 0.86, 0.36, 0.01, 0x8a6440);
  } },
  bedDouble: { m: 'fabric', soft: 'top', name: 'Double Bed', w: 1.6, d: 2.1, h: 1.2, hp: 170, cols: FABRIC,
    parts: [[-0.8, 0, -0.99, 0.8, 0.55, 1.05], [-0.8, 0, -1.05, 0.8, 1.2, -0.99]], build(g, c) {
    for (const sx of [-1, 1]) g.box(sx * 0.76, 0.04, 0.98, 0.06, 0.08, 0.06, DARK);
    g.box(0, 0.19, 0, 1.6, 0.22, 2.1, 0x6e4a2f); g.box(0, 0.4, 0.02, 1.54, 0.2, 2.0, WHITE);
    g.box(0, 0.51, 0.28, 1.57, 0.04, 1.47, c); g.box(0, 0.51, -0.43, 1.57, 0.05, 0.1, shade(c, 1.12));
    g.box(0, 0.4, 1.01, 1.57, 0.2, 0.02, c); g.box(0.785, 0.4, 0.28, 0.02, 0.2, 1.45, c); g.box(-0.785, 0.4, 0.28, 0.02, 0.2, 1.45, c);
    g.box(0, 0.53, 0.75, 1.58, 0.012, 0.32, shade(c, 0.75));
    g.box(-0.4, 0.55, -0.78, 0.62, 0.11, 0.34, WHITE); g.box(0.4, 0.55, -0.78, 0.62, 0.11, 0.34, WHITE);
    g.box(0, 0.6, -1.02, 1.6, 1.2, 0.06, 0x6e4a2f);
    for (const x of [-0.53, 0, 0.53]) g.box(x, 0.86, -0.985, 0.48, 0.5, 0.02, shade(c, 0.9));
  } },
  bunkBed: { climb: true, soft: 'top', m: 'wood', name: 'Bunk Bed', w: 1.0, d: 2.0, h: 1.7, hp: 160, cols: WOOD, build(g, c) {
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.box(sx * 0.46, 0.85, sz * 0.96, 0.07, 1.7, 0.07, c);
    for (const y of [0.3, 1.25]) {
      g.box(0, y, 0, 1.0, 0.08, 2.0, c); g.box(0, y + 0.1, 0, 0.9, 0.12, 1.88, WHITE);
      g.box(0, y + 0.165, 0.2, 0.9, 0.02, 1.3, y < 1 ? 0x5a6f8c : 0x9a4b3f); g.box(0, y + 0.2, -0.75, 0.5, 0.08, 0.28, WHITE);
    }
    g.box(0, 0.6, -0.96, 0.86, 0.04, 0.03, c); g.box(0, 1.58, -0.96, 0.86, 0.04, 0.03, c); g.box(0, 1.55, 0.96, 0.86, 0.04, 0.03, c);
    g.box(-0.5, 1.5, 0, 0.04, 0.04, 1.9, c); g.box(0.5, 1.5, 0.2, 0.04, 0.2, 1.2, c);
    for (let i = 0; i < 4; i++) g.box(0.5, 0.4 + i * 0.25, 0.9, 0.04, 0.04, 0.12, c);
  } },
  mattress: { m: 'fabric', soft: 'top', name: 'Mattress', w: 0.9, d: 1.9, h: 0.2, hp: 50, cols: [WHITE, 0xdfe6ee, 0xe8dcc8], build(g, c) {
    g.box(0, 0.1, 0, 0.9, 0.2, 1.9, c); g.box(0, 0.2, 0, 0.84, 0.01, 1.84, shade(c, 0.93));
    for (let i = 1; i < 6; i++) g.box(0, 0.206, -0.95 + i * 0.316, 0.84, 0.003, 0.01, shade(c, 0.82));
    g.box(0, 0.1, 0.951, 0.9, 0.02, 0.003, shade(c, 0.8)); g.box(0, 0.1, -0.951, 0.9, 0.02, 0.003, shade(c, 0.8));
  } },
  crib: { m: 'wood', name: 'Cot', w: 0.7, d: 1.3, h: 1.0, hp: 70, cols: [WHITE, 0xe2c79c, 0xc8d9e6], build(g, c) {
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.box(sx * 0.32, 0.5, sz * 0.62, 0.05, 1.0, 0.05, c);
    for (const y of [0.25, 0.95]) for (const sx of [-1, 1]) g.box(sx * 0.32, y, 0, 0.04, 0.04, 1.2, c);
    for (const y of [0.25, 0.95]) for (const sz of [-1, 1]) g.box(0, y, sz * 0.62, 0.6, 0.04, 0.04, c);
    for (let i = 0; i < 8; i++) for (const sx of [-1, 1]) g.box(sx * 0.32, 0.6, -0.5 + i * (1.0 / 7), 0.02, 0.68, 0.025, c);
    for (let i = 0; i < 4; i++) for (const sz of [-1, 1]) g.box(-0.21 + i * 0.14, 0.6, sz * 0.62, 0.025, 0.68, 0.02, c);
    g.box(0, 0.3, 0, 0.6, 0.1, 1.2, 0xece8e0); g.box(0, 0.36, 0.1, 0.58, 0.02, 0.7, 0xf2b8c6);
  } },
  nightstand: { m: 'wood', name: 'Bedside Table', w: 0.45, d: 0.4, h: 0.55, hp: 50, cols: WOOD, build(g, c) {
    legs4(g, 0.45, 0.4, 0.08, 0.035, shade(c, 0.8), 0.03);
    g.box(0, 0.31, 0, 0.45, 0.46, 0.4, c); g.box(0, 0.545, 0, 0.47, 0.02, 0.42, shade(c, 1.06));
    for (const y of [0.2, 0.42]) { g.box(0, y, 0.202, 0.4, 0.18, 0.006, shade(c, 1.08)); g.box(0, y, 0.21, 0.08, 0.018, 0.016, METAL); }
  } },
  dresser: { m: 'wood', name: 'Dresser', w: 1.0, d: 0.5, h: 0.85, hp: 110, cols: WOOD, build(g, c) {
    legs4(g, 1.0, 0.5, 0.06, 0.05, DARK);
    g.box(0, 0.45, 0, 1.0, 0.78, 0.5, c); g.box(0, 0.84, 0, 1.0, 0.02, 0.5, shade(c, 1.06));
    for (let i = 0; i < 3; i++) for (const x of [-0.24, 0.24]) {
      g.box(x, 0.18 + i * 0.25, 0.252, 0.45, 0.21, 0.004, shade(c, 1.07)); g.box(x, 0.18 + i * 0.25, 0.258, 0.1, 0.02, 0.01, METAL);
    }
  } },
  // Walk-in: hollow, with its doors standing open. Step inside and block the
  // front with something to make a hiding place.
  wardrobe: { m: 'wood', heavy: 1.2, name: 'Wardrobe', w: 1.2, d: 0.8, h: 2.1, hp: 220, cols: WOOD,
    parts: [[-0.6, 0, -0.4, 0.6, 2.1, -0.34], [-0.6, 0, -0.4, -0.55, 2.1, 0.4], [0.55, 0, -0.4, 0.6, 2.1, 0.4], [-0.6, 2.03, -0.4, 0.6, 2.1, 0.4], [-0.6, 0, -0.4, 0.6, 0.08, 0.4]],
    build(g, c) {
      g.box(0, 1.05, -0.37, 1.2, 2.1, 0.06, c); g.box(-0.575, 1.05, 0, 0.05, 2.1, 0.8, c); g.box(0.575, 1.05, 0, 0.05, 2.1, 0.8, c);
      g.box(0, 2.065, 0, 1.2, 0.07, 0.8, c); g.box(0, 2.09, 0.0, 1.2, 0.02, 0.8, shade(c, 1.08));
      g.box(0, 0.04, 0, 1.2, 0.08, 0.8, shade(c, 0.7)); g.box(0, 1.85, -0.12, 1.1, 0.02, 0.5, shade(c, 0.9));
      g.box(0, 1.75, -0.1, 1.1, 0.025, 0.025, METAL); // hanging rail
      const cloth = [0x5a6f8c, 0xd8cdbb, 0x9a4b3f, 0x3d3d48, 0x6f8a5b];
      for (let i = 0; i < 5; i++) { g.box(-0.4 + i * 0.2, 1.72, -0.1, 0.02, 0.06, 0.28, METAL); g.box(-0.4 + i * 0.2, 1.4 - (i % 2) * 0.12, -0.1, 0.05, 0.6 + (i % 2) * 0.24, 0.34, cloth[i]); }
      g.box(-0.3, 0.14, -0.15, 0.22, 0.1, 0.3, 0x2a2a2e); g.box(0.25, 0.14, -0.12, 0.22, 0.1, 0.3, 0x8a5a36);
      // open doors, folded back against the sides
      for (const sx of [-1, 1]) {
        g.box(sx * 0.615, 1.05, 0.125, 0.03, 1.95, 0.55, shade(c, 1.05));
        g.box(sx * 0.638, 1.1, -0.08, 0.015, 0.25, 0.03, METAL);
      }
    } },
  // ---- bathroom ----
  bathtub: { m: 'plastic', heavy: 1.5, name: 'Bathtub', w: 1.7, d: 0.8, h: 0.6, hp: 200, cols: [0xf4f4f2, 0xe8eef2, 0xf2ebe0],
    parts: [[-0.85, 0, -0.4, 0.85, 0.12, 0.4], [-0.85, 0, -0.4, 0.85, 0.6, -0.32], [-0.85, 0, 0.32, 0.85, 0.6, 0.4], [-0.85, 0, -0.4, -0.77, 0.6, 0.4], [0.77, 0, -0.4, 0.85, 0.6, 0.4]],
    build(g, c) {
      g.box(0, 0.06, 0, 1.7, 0.12, 0.8, c); g.box(0, 0.3, -0.36, 1.7, 0.6, 0.08, c); g.box(0, 0.3, 0.36, 1.7, 0.6, 0.08, c);
      g.box(-0.81, 0.3, 0, 0.08, 0.6, 0.8, c); g.box(0.81, 0.3, 0, 0.08, 0.6, 0.8, c);
      g.box(0, 0.59, 0, 1.7, 0.02, 0.8, shade(c, 1.02)); g.box(0, 0.125, 0, 1.5, 0.01, 0.6, shade(c, 0.93));
      g.cyl(0.6, 0.13, 0, 0.025, 0.004, METAL, 8);
      g.box(0.7, 0.68, 0, 0.05, 0.16, 0.05, METAL); g.box(0.64, 0.76, 0, 0.14, 0.03, 0.04, METAL);
      g.box(0.72, 0.62, 0.12, 0.04, 0.04, 0.04, METAL); g.box(0.72, 0.62, -0.12, 0.04, 0.04, 0.04, METAL);
      g.box(0, 0.3, 0.401, 1.6, 0.5, 0.004, shade(c, 0.96));
    } },
  toilet: { m: 'plastic', use: 'flush', name: 'Toilet', w: 0.4, d: 0.65, h: 0.8, hp: 60, cols: [0xf4f4f2, 0xe8eef2], build(g, c) {
    g.box(0, 0.06, 0.05, 0.26, 0.12, 0.36, c); g.cyl(0, 0.12, 0.08, 0.17, 0.28, c, 12, 0.19);
    g.box(0, 0.415, 0.07, 0.38, 0.03, 0.44, shade(c, 0.98)); g.box(0, 0.44, 0.07, 0.36, 0.02, 0.42, shade(c, 1.02));
    g.box(0, 0.6, -0.24, 0.4, 0.36, 0.16, c); g.box(0, 0.795, -0.24, 0.42, 0.03, 0.18, shade(c, 0.95));
    g.box(0, 0.815, -0.24, 0.07, 0.01, 0.05, METAL); g.box(0, 0.3, -0.29, 0.05, 0.2, 0.05, METAL);
  } },
  sink: { m: 'paint', name: 'Bathroom Sink', w: 0.8, d: 0.5, h: 0.9, hp: 90, cols: [WHITE, 0x6f8a5b, 0x34404f, 0xc8a882], build(g, c) {
    g.box(0, 0.05, 0, 0.74, 0.1, 0.44, shade(c, 0.6));
    g.box(0, 0.43, -0.01, 0.8, 0.66, 0.48, c);
    g.box(-0.2, 0.42, 0.233, 0.37, 0.58, 0.006, shade(c, 1.06)); g.box(0.2, 0.42, 0.233, 0.37, 0.58, 0.006, shade(c, 1.06));
    g.box(-0.03, 0.6, 0.24, 0.015, 0.12, 0.015, METAL); g.box(0.03, 0.6, 0.24, 0.015, 0.12, 0.015, METAL);
    g.box(0, 0.785, 0, 0.82, 0.07, 0.5, 0xf4f4f2); g.box(0, 0.822, 0.04, 0.5, 0.005, 0.3, 0xd9e2ea);
    g.cyl(0, 0.82, -0.18, 0.025, 0.07, METAL, 8); g.box(0, 0.88, -0.13, 0.03, 0.025, 0.12, METAL);
    g.box(-0.08, 0.84, -0.18, 0.04, 0.02, 0.04, METAL); g.box(0.08, 0.84, -0.18, 0.04, 0.02, 0.04, METAL);
  } },
  standingMirror: { m: 'wood', name: 'Standing Mirror', w: 0.6, d: 0.4, h: 1.7, hp: 50, cols: [0xf0ede6, 0x2f2f33, 0xc89a64, 0xd4af37], build(g, c) {
    g.box(0, 0.88, 0.05, 0.6, 1.62, 0.04, c); g.box(0, 0.88, 0.072, 0.5, 1.5, 0.005, GLASS);
    g.box(0, 0.88, 0.077, 0.12, 1.4, 0.002, shade(GLASS, 1.06));
    g.box(0, 0.8, -0.12, 0.04, 1.4, 0.04, shade(c, 0.85)); g.box(0, 0.02, -0.05, 0.3, 0.04, 0.28, shade(c, 0.85));
    g.box(-0.25, 0.02, 0.05, 0.08, 0.04, 0.3, shade(c, 0.85)); g.box(0.25, 0.02, 0.05, 0.08, 0.04, 0.3, shade(c, 0.85));
  } },
  // ---- kitchen and dining ----
  counter: { m: 'paint', name: 'Kitchen Unit', w: 1.2, d: 0.6, h: 0.9, hp: 140, cols: [WHITE, 0x7d8a6e, 0x34404f, 0xc7b39a], build(g, c) {
    g.box(0, 0.05, 0.02, 1.16, 0.1, 0.54, DARK);
    g.box(0, 0.48, 0, 1.2, 0.76, 0.58, c); g.box(0, 0.88, 0, 1.22, 0.04, 0.62, 0x8f8a82);
    g.box(0, 0.78, 0.295, 1.16, 0.12, 0.006, shade(c, 0.97)); g.box(0, 0.78, 0.303, 0.3, 0.015, 0.015, METAL);
    g.box(-0.3, 0.42, 0.295, 0.56, 0.6, 0.006, shade(c, 0.97)); g.box(0.3, 0.42, 0.295, 0.56, 0.6, 0.006, shade(c, 0.97));
    g.box(-0.05, 0.6, 0.305, 0.015, 0.14, 0.015, METAL); g.box(0.05, 0.6, 0.305, 0.015, 0.14, 0.015, METAL);
  } },
  kitchenIsland: { m: 'paint', name: 'Kitchen Island', w: 1.8, d: 0.9, h: 0.92, hp: 200, cols: [WHITE, 0x7d8a6e, 0x34404f, 0xc7b39a], build(g, c) {
    g.box(0, 0.05, 0, 1.7, 0.1, 0.7, DARK);
    g.box(0, 0.47, 0, 1.76, 0.74, 0.76, c); g.box(0, 0.9, 0, 1.8, 0.04, 0.9, 0x8f8a82);
    for (const x of [-0.6, 0, 0.6]) {
      g.box(x, 0.77, 0.381, 0.56, 0.14, 0.006, shade(c, 0.97)); g.box(x, 0.77, 0.388, 0.22, 0.015, 0.015, METAL);
      g.box(x, 0.4, 0.381, 0.56, 0.5, 0.006, shade(c, 0.97)); g.box(x, 0.58, 0.388, 0.22, 0.015, 0.015, METAL);
    }
    g.box(-0.3, 0.919, -0.15, 0.5, 0.002, 0.34, 0xc89a64);
  } },
  stove: { m: 'steel', name: 'Cooker', w: 0.6, d: 0.6, h: 0.95, hp: 160, cols: [WHITE, 0xbfc4c9, 0x2b2d31], build(g, c) {
    g.box(0, 0.45, 0, 0.6, 0.9, 0.6, c);
    g.box(0, 0.42, 0.302, 0.54, 0.5, 0.006, shade(c, 0.94)); g.box(0, 0.4, 0.307, 0.42, 0.3, 0.004, 0x1a1c20);
    g.box(0, 0.7, 0.312, 0.4, 0.02, 0.016, METAL); g.box(0, 0.09, 0.302, 0.54, 0.1, 0.006, shade(c, 0.85));
    g.box(0, 0.905, 0, 0.6, 0.01, 0.6, 0x1d1f24);
    for (const x of [-0.14, 0.14]) for (const z of [-0.12, 0.14]) { g.cyl(x, 0.91, z, 0.09, 0.008, 0x3a3c40, 12); g.cyl(x, 0.918, z, 0.05, 0.006, 0x55575c, 10); }
    g.box(0, 0.93, -0.28, 0.6, 0.04, 0.04, shade(c, 0.9));
    for (let i = 0; i < 4; i++) g.box(-0.21 + i * 0.14, 0.82, 0.304, 0.04, 0.04, 0.012, 0x2a2a2e);
  } },
  fridge: { m: 'plastic', heavy: 1.5, name: 'Fridge', w: 0.7, d: 0.7, h: 1.85, hp: 200, cols: [WHITE, 0xc0c4c8, 0x2b2d31], build(g, c) {
    g.box(0, 0.94, 0, 0.7, 1.82, 0.7, c); g.box(0, 0.015, 0.02, 0.62, 0.03, 0.6, DARK);
    g.box(0, 1.54, 0.351, 0.68, 0.56, 0.006, shade(c, 1.03)); g.box(0, 0.62, 0.351, 0.68, 1.18, 0.006, shade(c, 1.03));
    g.box(0, 1.25, 0.352, 0.68, 0.012, 0.01, shade(c, 0.7));
    g.box(0.28, 1.45, 0.37, 0.03, 0.26, 0.03, METAL); g.box(0.28, 1.0, 0.37, 0.03, 0.4, 0.03, METAL);
    g.box(0, 0.08, 0.356, 0.5, 0.06, 0.004, shade(c, 0.6));
    g.box(-0.18, 1.62, 0.356, 0.1, 0.12, 0.004, 0xf4d03f); g.box(-0.05, 1.5, 0.356, 0.08, 0.08, 0.004, 0x3498db);
  } },
  barCounter: { m: 'wood', name: 'Bar Counter', w: 2.0, d: 0.6, h: 1.1, hp: 200, cols: WOOD, build(g, c) {
    g.box(0, 0.05, 0, 1.96, 0.1, 0.5, DARK);
    g.box(0, 0.55, -0.02, 2.0, 0.92, 0.5, c); g.box(0, 1.075, 0, 2.0, 0.05, 0.6, shade(c, 0.75));
    for (const x of [-0.75, -0.25, 0.25, 0.75]) g.box(x, 0.55, 0.232, 0.42, 0.72, 0.006, shade(c, 1.1));
    g.box(0, 0.2, 0.275, 1.9, 0.03, 0.03, METAL); for (const x of [-0.9, 0, 0.9]) g.box(x, 0.11, 0.26, 0.03, 0.2, 0.03, METAL);
  } },
  barStool: { m: 'metal', name: 'Bar Stool', w: 0.42, d: 0.42, h: 0.78, hp: 35, cols: [0x2f2f33, 0x9a4b3f, 0x5a6f8c, 0xc98c3d], build(g, c) {
    g.cyl(0, 0, 0, 0.2, 0.025, METAL, 14); g.cyl(0, 0.025, 0, 0.03, 0.68, METAL, 8);
    for (const a of [0, 1, 2, 3]) { const ang = a * Math.PI / 2; g.box(Math.cos(ang) * 0.1, 0.3, Math.sin(ang) * 0.1, a % 2 ? 0.18 : 0.02, 0.02, a % 2 ? 0.02 : 0.18, METAL); }
    g.cyl(0, 0.68, 0, 0.19, 0.06, c, 14); g.cyl(0, 0.74, 0, 0.18, 0.04, shade(c, 1.08), 14, 0.16);
  } },
  // ---- office and study ----
  bookshelf: { climb: true, m: 'wood', name: 'Bookshelf', w: 0.9, d: 0.35, h: 1.9, hp: 120, cols: WOOD, build(g, c) {
    g.box(-0.43, 0.95, 0, 0.04, 1.9, 0.35, c); g.box(0.43, 0.95, 0, 0.04, 1.9, 0.35, c); g.box(0, 0.95, -0.16, 0.86, 1.9, 0.02, shade(c, 0.85));
    g.box(0, 1.885, 0.005, 0.92, 0.03, 0.36, shade(c, 1.06)); g.box(0, 0.04, 0.165, 0.86, 0.08, 0.02, shade(c, 0.8));
    const books = [0xa33b3b, 0x3b5ea3, 0xd8b23b, 0x3b8a5a, 0xe0e0e0, 0x6a3ba3];
    for (let s = 0; s < 5; s++) {
      const y = 0.02 + s * 0.46; g.box(0, y + 0.01, 0, 0.86, 0.03, 0.35, c);
      if (s < 4) { let x = -0.38; let k = s; while (x < 0.36) { const bw = 0.04 + ((k * 7) % 5) * 0.012, bh = 0.24 + ((k * 3) % 4) * 0.04; g.box(x + bw / 2, y + 0.03 + bh / 2, 0.02, bw, bh, 0.24, books[k % books.length]); x += bw + 0.006; k++; } }
    }
  } },
  desk: { m: 'wood', name: 'Desk', w: 1.3, d: 0.65, h: 0.75, hp: 100, cols: WOOD, build(g, c) {
    g.box(0, 0.73, 0, 1.3, 0.04, 0.65, c); g.box(-0.62, 0.36, 0, 0.04, 0.72, 0.6, c); g.box(0.45, 0.36, 0, 0.4, 0.72, 0.6, shade(c, 0.92));
    g.box(-0.1, 0.45, -0.28, 1.0, 0.4, 0.02, shade(c, 0.85));
    for (let i = 0; i < 3; i++) { g.box(0.45, 0.14 + i * 0.22, 0.303, 0.36, 0.19, 0.006, shade(c, 1.05)); g.box(0.45, 0.2 + i * 0.22, 0.31, 0.08, 0.018, 0.016, METAL); }
  } },
  officeChair: { m: 'fabric', name: 'Office Chair', w: 0.6, d: 0.6, h: 1.05, hp: 60, cols: [0x2a2a2e, 0x34495e, 0x8a3b3b, 0x6b7280], build(g, c) {
    for (let a = 0; a < 5; a++) { const ang = a * Math.PI * 2 / 5, x = Math.cos(ang), z = Math.sin(ang); g.box(x * 0.13, 0.05, z * 0.13, Math.abs(x) * 0.24 + 0.04, 0.04, Math.abs(z) * 0.24 + 0.04, DARK); g.cyl(x * 0.26, 0, z * 0.26, 0.03, 0.04, DARK, 6); }
    g.cyl(0, 0.07, 0, 0.03, 0.34, METAL, 8); g.cyl(0, 0.4, 0, 0.05, 0.04, DARK, 8);
    g.box(0, 0.47, 0.02, 0.5, 0.08, 0.48, c); g.box(0, 0.515, 0.03, 0.46, 0.02, 0.42, shade(c, 1.1));
    g.box(0, 0.6, -0.24, 0.04, 0.2, 0.04, DARK); g.box(0, 0.82, -0.25, 0.46, 0.44, 0.07, c); g.box(0, 0.82, -0.215, 0.4, 0.36, 0.01, shade(c, 1.1));
    for (const sx of [-1, 1]) { g.box(sx * 0.26, 0.58, 0.02, 0.03, 0.18, 0.03, DARK); g.box(sx * 0.26, 0.67, 0.04, 0.06, 0.025, 0.26, DARK); }
  } },
  filingCabinet: { m: 'steel', name: 'Filing Cabinet', w: 0.5, d: 0.6, h: 1.3, hp: 150, cols: [0x7f8c8d, 0x34495e, 0xbdc3c7], build(g, c) {
    g.box(0, 0.66, 0, 0.5, 1.28, 0.6, c); g.box(0, 0.01, 0.02, 0.46, 0.02, 0.54, DARK);
    for (let i = 0; i < 4; i++) {
      g.box(0, 0.17 + i * 0.32, 0.302, 0.44, 0.28, 0.01, shade(c, 1.08)); g.box(0, 0.25 + i * 0.32, 0.31, 0.14, 0.025, 0.02, METAL);
      g.box(0, 0.2 + i * 0.32, 0.309, 0.08, 0.035, 0.004, 0xf2f2f2);
    }
  } },
  whiteboard: { m: 'metal', name: 'Whiteboard', w: 1.5, d: 0.5, h: 1.9, hp: 60, cols: [0xbfc4c9, 0x2f2f33], build(g, c) {
    for (const sx of [-1, 1]) { g.box(sx * 0.7, 0.95, 0, 0.04, 1.86, 0.04, c); g.box(sx * 0.7, 0.02, 0, 0.06, 0.04, 0.5, c); g.cyl(sx * 0.7, 0, 0.22, 0.025, 0.02, DARK, 6); g.cyl(sx * 0.7, 0, -0.22, 0.025, 0.02, DARK, 6); }
    g.box(0, 1.25, 0, 1.4, 0.9, 0.03, c); g.box(0, 1.25, 0.016, 1.34, 0.84, 0.004, 0xf7f7f5);
    g.box(0, 0.78, 0.04, 1.2, 0.02, 0.07, c);
    g.box(-0.35, 1.45, 0.019, 0.5, 0.012, 0.002, 0x2e6fd6); g.box(-0.4, 1.38, 0.019, 0.4, 0.012, 0.002, 0x2e6fd6); g.box(0.3, 1.2, 0.019, 0.36, 0.2, 0.002, 0xe0e8f8);
    g.box(0.3, 1.2, 0.0195, 0.3, 0.012, 0.002, 0xd64545); g.box(-0.1, 0.8, 0.06, 0.12, 0.02, 0.02, 0xd64545); g.box(0.1, 0.8, 0.06, 0.12, 0.02, 0.02, 0x2e6fd6);
  } },
  safe: { m: 'steel', heavy: 330, name: 'Cast-Iron Safe', w: 0.6, d: 0.6, h: 0.6, hp: 400, cols: [0x2b2e33, 0x3a4a3a, 0x4a3530], build(g, c) {
    legs4(g, 0.6, 0.56, 0.04, 0.07, DARK, 0.02);
    g.box(0, 0.32, -0.02, 0.6, 0.56, 0.56, c); g.box(0, 0.32, 0.262, 0.5, 0.46, 0.006, shade(c, 1.15));
    g.box(0.05, 0.39, 0.27, 0.11, 0.11, 0.012, 0x8a8f96); g.box(0.05, 0.39, 0.279, 0.07, 0.07, 0.008, 0x55575c); g.box(0.05, 0.43, 0.284, 0.01, 0.02, 0.003, 0xd4af37);
    g.box(0.05, 0.24, 0.28, 0.14, 0.025, 0.03, METAL); g.box(-0.2, 0.32, 0.27, 0.03, 0.36, 0.012, 0x6b6f75);
    g.box(-0.12, 0.52, 0.266, 0.18, 0.03, 0.003, 0xd4af37);
  } },
  lockers: { m: 'steel', heavy: 1.2, name: 'Lockers', w: 0.9, d: 0.5, h: 1.9, hp: 200, cols: [0x5d7a96, 0x8a9a5b, 0xb5523b, 0x777c84], build(g, c) {
    g.box(0, 0.98, 0, 0.9, 1.84, 0.5, c); g.box(0, 0.03, 0.02, 0.86, 0.06, 0.44, DARK);
    for (let i = 0; i < 3; i++) {
      const x = -0.3 + i * 0.3;
      g.box(x, 0.98, 0.252, 0.28, 1.8, 0.006, shade(c, 1.06));
      for (let v = 0; v < 4; v++) g.box(x, 1.6 + v * 0.04, 0.257, 0.18, 0.012, 0.01, shade(c, 0.7));
      g.box(x + 0.09, 1.1, 0.262, 0.03, 0.12, 0.015, METAL); g.box(x, 1.78, 0.257, 0.08, 0.04, 0.004, 0xf2f2f2);
    }
  } },
  // ---- storage ----
  shelfCube: { climb: true, m: 'wood', name: 'Cube Shelf', w: 1.5, d: 0.4, h: 1.5, hp: 140, cols: [WHITE, 0x2f2f33, 0xc89a64], build(g, c) {
    for (let i = 0; i < 4; i++) { g.box(-0.73 + i * (1.46 / 3), 0.75, 0, 0.04, 1.5, 0.4, c); g.box(0, 0.02 + i * (1.46 / 3), 0, 1.5, 0.04, 0.4, c); }
    g.box(0, 0.75, -0.19, 1.46, 1.46, 0.02, shade(c, 0.85));
    g.box(-0.48, 0.27, 0.02, 0.4, 0.4, 0.34, 0x8fa7b8); g.box(-0.48, 0.38, 0.193, 0.1, 0.04, 0.004, shade(0x8fa7b8, 0.7));
    g.box(0.48, 0.76, 0.02, 0.4, 0.4, 0.34, 0xc9a56a); g.box(0, 1.24, 0.02, 0.36, 0.36, 0.3, 0x9a4b3f);
    g.box(0.48, 1.08, 0.0, 0.3, 0.06, 0.24, 0x3b5ea3); g.box(0.48, 1.13, 0.0, 0.26, 0.04, 0.22, 0xd8b23b);
  } },
  wireRack: { climb: true, see: true, m: 'metal', name: 'Wire Shelving', w: 1.2, d: 0.5, h: 1.9, hp: 150, cols: [0xc9ced3, 0x2f2f33], build(g, c) {
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.cyl(sx * 0.58, 0, sz * 0.23, 0.015, 1.9, c, 6);
    for (let s = 0; s < 5; s++) {
      const y = 0.08 + s * 0.44;
      g.box(0, y, 0.235, 1.18, 0.02, 0.015, c); g.box(0, y, -0.235, 1.18, 0.02, 0.015, c);
      for (let k = 0; k < 4; k++) g.box(-0.45 + k * 0.3, y, 0, 0.008, 0.008, 0.46, c);
      for (const z of [-0.08, 0.08]) g.box(0, y - 0.002, z, 1.16, 0.006, 0.006, c);
    }
    g.box(-0.3, 0.6, 0, 0.36, 0.3, 0.36, 0xc8a26e); g.box(0.25, 1.02, 0, 0.4, 0.2, 0.3, 0x5d7a96);
  } },
  crate: { m: 'wood', heavy: 1.2, name: 'Wooden Crate', w: 1.0, d: 1.0, h: 1.0, hp: 120, cols: [0xb68a55, 0xa47746, 0xc49a63], build(g, c) {
    g.box(0, 0.5, 0, 0.96, 0.96, 0.96, c);
    for (let i = 1; i < 4; i++) { g.box(0, i * 0.24, 0.481, 0.94, 0.006, 0.002, shade(c, 0.7)); g.box(0, i * 0.24, -0.481, 0.94, 0.006, 0.002, shade(c, 0.7)); }
    for (const y of [0.04, 0.96]) { g.box(0, y, 0.49, 1.0, 0.08, 0.04, shade(c, 0.8)); g.box(0, y, -0.49, 1.0, 0.08, 0.04, shade(c, 0.8)); g.box(0.49, y, 0, 0.04, 0.08, 1.0, shade(c, 0.8)); g.box(-0.49, y, 0, 0.04, 0.08, 1.0, shade(c, 0.8)); }
    g.box(0, 0.5, 0.49, 0.08, 1.0, 0.04, shade(c, 0.8)); g.box(0, 0.5, -0.49, 0.08, 1.0, 0.04, shade(c, 0.8));
    g.box(0.25, 0.7, 0.492, 0.3, 0.12, 0.002, 0x3d3d48);
  } },
  box: { m: 'card', name: 'Cardboard Box', w: 0.6, d: 0.6, h: 0.5, hp: 35, cols: [0xc8a26e, 0xb8915c, 0xd2b07d], build(g, c) {
    g.box(0, 0.25, 0, 0.6, 0.5, 0.6, c); g.box(0, 0.501, 0, 0.6, 0.004, 0.08, 0xd8cfa8);
    g.box(0, 0.45, 0.301, 0.08, 0.1, 0.003, 0xd8cfa8); g.box(0.15, 0.25, 0.301, 0.2, 0.12, 0.003, 0xf2f2f2);
    g.box(0.15, 0.25, 0.3025, 0.14, 0.01, 0.002, 0x3d3d48);
  } },
  shoeRack: { m: 'wood', name: 'Shoe Rack', w: 0.8, d: 0.32, h: 0.5, hp: 40, cols: WOOD, build(g, c) {
    g.box(-0.38, 0.25, 0, 0.04, 0.5, 0.32, c); g.box(0.38, 0.25, 0, 0.04, 0.5, 0.32, c); g.box(0, 0.49, 0, 0.8, 0.02, 0.32, c);
    for (const y of [0.05, 0.27]) { g.box(0, y, -0.06, 0.72, 0.02, 0.02, c); g.box(0, y + 0.05, 0.1, 0.72, 0.02, 0.02, c); }
    const shoes = [0x2a2a2e, 0x9a4b3f, 0xf2f2f2, 0x3b5ea3];
    for (let i = 0; i < 4; i++) for (const y of [0.1, 0.32]) { const k = (i + (y > 0.2 ? 1 : 0)) % 4; g.box(-0.27 + i * 0.18, y, 0.02, 0.06, 0.07, 0.24, shoes[k]); g.box(-0.2 + i * 0.18, y, 0.02, 0.06, 0.07, 0.24, shoes[k]); }
  } },
  coatRack: { m: 'wood', name: 'Coat Stand', w: 0.5, d: 0.5, h: 1.8, hp: 30, cols: [0x5b3b25, 0x2f2f33, 0xc89a64], build(g, c) {
    g.box(0, 0.03, 0, 0.5, 0.05, 0.06, c); g.box(0, 0.03, 0, 0.06, 0.05, 0.5, c);
    g.cyl(0, 0.05, 0, 0.025, 1.7, c, 8); g.cyl(0, 1.75, 0, 0.04, 0.05, c, 8);
    for (let a = 0; a < 4; a++) { const ang = a * Math.PI / 2 + 0.78; g.box(Math.cos(ang) * 0.1, 1.62, Math.sin(ang) * 0.1, 0.16, 0.03, 0.03, c); }
    g.box(0.13, 1.25, 0.06, 0.26, 0.7, 0.12, 0x5a6f8c); g.box(0.13, 1.58, 0.06, 0.14, 0.06, 0.1, shade(0x5a6f8c, 0.8));
    g.cyl(-0.1, 1.7, -0.08, 0.12, 0.02, 0x9a4b3f, 10); g.cyl(-0.1, 1.72, -0.08, 0.07, 0.08, 0x9a4b3f, 10);
  } },
  toyChest: { m: 'wood', name: 'Toy Chest', w: 0.9, d: 0.5, h: 0.5, hp: 60, cols: [0xe74c3c, 0x3498db, 0xf1c40f, 0x2ecc71], build(g, c) {
    g.box(0, 0.22, 0, 0.9, 0.42, 0.5, c); g.box(0, 0.46, 0, 0.9, 0.06, 0.5, shade(c, 1.1));
    g.box(0, 0.22, 0.252, 0.8, 0.06, 0.004, WHITE); g.box(0, 0.1, 0.252, 0.8, 0.02, 0.004, WHITE);
    for (const sx of [-1, 1]) g.box(sx * 0.452, 0.3, 0, 0.012, 0.04, 0.16, METAL);
    g.box(-0.25, 0.22, 0.255, 0.12, 0.12, 0.004, 0xf1c40f); g.box(0, 0.22, 0.255, 0.12, 0.12, 0.004, 0x3498db); g.box(0.25, 0.22, 0.255, 0.12, 0.12, 0.004, 0x2ecc71);
  } },
  // ---- fun ----
  slide: { m: 'plastic', climb: true, see: true, name: 'Play Slide', w: 0.7, d: 2.2, h: 1.4, hp: 120, cols: [0xe74c3c, 0x3498db, 0xf39c12], build(g, c) {
    for (const x of [-0.3, 0.3]) { g.box(x, 0.7, -0.95, 0.06, 1.4, 0.06, 0xecf0f1); g.box(x, 0.7, -0.65, 0.06, 1.4, 0.06, 0xecf0f1); }
    for (let i = 0; i < 5; i++) g.box(0, 0.25 + i * 0.27, -0.95, 0.6, 0.04, 0.05, 0xecf0f1);
    g.box(0, 1.37, -0.8, 0.7, 0.06, 0.36, c);
    for (let i = 0; i < 8; i++) { const t = i / 8; g.box(0, 1.3 - t * 1.2, -0.55 + t * 1.6, 0.6, 0.06, 0.22, c); }
    g.box(0.31, 0.95, 0.15, 0.04, 0.12, 1.5, shade(c, 0.85)); g.box(-0.31, 0.95, 0.15, 0.04, 0.12, 1.5, shade(c, 0.85));
    g.box(0, 0.06, 1.0, 0.6, 0.12, 0.2, shade(c, 0.85));
  } },
  billiardsTable: { m: 'wood', heavy: 2, name: 'Pool Table', w: 2.2, d: 1.2, h: 0.82, hp: 260, cols: [0x5b3b25, 0x2f2f33, 0x8a5a36], build(g, c) {
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.box(sx * 0.95, 0.3, sz * 0.48, 0.12, 0.6, 0.12, c);
    g.box(0, 0.66, 0, 2.2, 0.16, 1.2, c);
    g.box(0, 0.745, 0, 1.96, 0.01, 0.96, CLOTH);
    g.box(0, 0.78, 0.53, 2.2, 0.06, 0.14, shade(c, 1.1)); g.box(0, 0.78, -0.53, 2.2, 0.06, 0.14, shade(c, 1.1));
    g.box(1.03, 0.78, 0, 0.14, 0.06, 0.92, shade(c, 1.1)); g.box(-1.03, 0.78, 0, 0.14, 0.06, 0.92, shade(c, 1.1));
    for (const sx of [-1, 0, 1]) for (const sz of [-1, 1]) g.box(sx * 0.98, 0.752, sz * 0.47, 0.08, 0.006, 0.08, 0x111111);
    const balls = [0xf2f2f2, 0xd8b23b, 0x3b5ea3, 0xc0392b, 0x6a3ba3, 0x1a1a1a];
    balls.forEach((b, i) => g.box(-0.5 + (i % 3) * 0.06 + (i > 2 ? 0.03 : 0), 0.77, (i > 2 ? 0.05 : 0) - 0.02 + (i === 0 ? 0 : 0), 0.05, 0.05, 0.05, b));
    g.box(0.3, 0.765, 0.3, 1.2, 0.02, 0.02, 0xc89a64);
  } },
  arcadeCabinet: { m: 'paint', use: 'tv', name: 'Arcade Machine', w: 0.7, d: 0.7, h: 1.75, hp: 140, cols: [0x2f2f33, 0x8e44ad, 0xc0392b, 0x1f6f9b], build(g, c, s) {
    g.box(0, 0.5, 0, 0.66, 1.0, 0.66, c);
    g.box(-0.33, 1.1, -0.05, 0.04, 1.3, 0.6, shade(c, 0.85)); g.box(0.33, 1.1, -0.05, 0.04, 1.3, 0.6, shade(c, 0.85));
    g.box(0, 1.25, -0.2, 0.62, 0.9, 0.3, c); g.box(0, 1.66, -0.05, 0.62, 0.18, 0.5, c);
    g.box(0, 1.66, 0.201, 0.58, 0.14, 0.004, s ? 0xf4d03f : 0x7a6a2a);
    screen(g, 0, 1.3, -0.045, 0.52, 0.4, s, true);
    g.box(0, 1.02, 0.15, 0.62, 0.06, 0.32, shade(c, 1.2));
    g.cyl(-0.15, 1.05, 0.18, 0.012, 0.07, METAL, 6); g.box(-0.15, 1.12, 0.18, 0.04, 0.04, 0.04, 0xc0392b);
    for (let i = 0; i < 3; i++) g.cyl(0.05 + i * 0.07, 1.05, 0.2 - (i % 2) * 0.04, 0.022, 0.015, [0xf1c40f, 0x2ecc71, 0x3498db][i], 8);
    g.box(0, 0.4, 0.332, 0.2, 0.08, 0.004, 0x111111); g.box(0, 0.42, 0.334, 0.06, 0.03, 0.002, 0xd4af37);
  } },
  piano: { m: 'wood', name: 'Upright Piano', w: 1.5, d: 0.6, h: 1.25, hp: 220, cols: [0x1a1a1e, 0x5b3b25, 0xf0ede6], build(g, c) {
    g.box(0, 0.75, -0.15, 1.5, 1.0, 0.3, c); g.box(0, 1.24, -0.12, 1.54, 0.03, 0.38, shade(c, 1.15));
    g.box(-0.72, 0.4, 0.05, 0.06, 0.8, 0.5, c); g.box(0.72, 0.4, 0.05, 0.06, 0.8, 0.5, c);
    g.box(0, 0.68, 0.06, 1.38, 0.06, 0.3, c); g.box(0, 0.715, 0.12, 1.32, 0.02, 0.16, 0xf7f7f2);
    for (let i = 0; i < 18; i++) { if (i % 7 === 2 || i % 7 === 6) continue; g.box(-0.62 + i * 0.073, 0.735, 0.08, 0.035, 0.02, 0.09, 0x111111); }
    g.box(0, 0.25, -0.0, 1.38, 0.5, 0.02, shade(c, 0.9)); g.box(0, 0.92, 0.0, 0.6, 0.18, 0.02, shade(c, 1.2));
    for (const x of [-0.1, 0, 0.1]) g.box(x, 0.06, 0.12, 0.04, 0.02, 0.1, 0xd4af37);
  } },
  mannequin: { m: 'plastic', name: 'Mannequin', w: 0.5, d: 0.35, h: 1.85, hp: 40, cols: [0xe8dccb, 0xf2f2f2, 0x2f2f33], build(g, c) {
    g.cyl(0, 0, 0, 0.2, 0.03, METAL, 14); g.cyl(0, 0.03, 0, 0.02, 0.85, METAL, 6);
    g.box(-0.09, 0.62, 0, 0.12, 0.4, 0.14, c); g.box(0.09, 0.62, 0, 0.12, 0.4, 0.14, c);
    g.box(0, 0.92, 0, 0.34, 0.24, 0.2, 0x3d3d48); g.box(0, 1.22, 0, 0.4, 0.38, 0.22, 0xd64545); g.box(0, 1.42, 0, 0.44, 0.06, 0.22, 0xd64545);
    for (const sx of [-1, 1]) { g.box(sx * 0.2, 1.2, 0, 0.09, 0.42, 0.1, 0xd64545); g.box(sx * 0.2, 0.92, 0.01, 0.07, 0.18, 0.08, c); }
    g.cyl(0, 1.45, 0, 0.05, 0.08, c, 8); g.cyl(0, 1.52, 0, 0.11, 0.24, c, 12, 0.1); g.cyl(0, 1.76, 0, 0.1, 0.06, c, 12, 0.05);
  } },
  // ---- outdoors and garden ----
  patioTable: { m: 'metal', name: 'Garden Table', w: 1.0, d: 1.0, h: 0.74, hp: 70, cols: [0xf2f2f2, 0x2f2f33, 0x5f7f5a], build(g, c) {
    g.cyl(0, 0, 0, 0.28, 0.03, c, 14); g.cyl(0, 0.03, 0, 0.035, 0.66, c, 8);
    g.cyl(0, 0.69, 0, 0.5, 0.04, c, 18); g.cyl(0, 0.73, 0, 0.47, 0.01, shade(c, 0.92), 18); g.cyl(0, 0.68, 0, 0.06, 0.06, c, 8);
  } },
  // You can walk under its canopy.
  patioUmbrella: { m: 'fabric', name: 'Parasol', w: 2.2, d: 2.2, h: 2.4, hp: 50, cols: [0xd8cdbb, 0x2e86c1, 0xc0392b, 0x27ae60],
    parts: [[-0.25, 0, -0.25, 0.25, 0.1, 0.25], [-0.03, 0, -0.03, 0.03, 2.05, 0.03], [-1.1, 2.05, -1.1, 1.1, 2.4, 1.1]],
    build(g, c) {
      g.cyl(0, 0, 0, 0.25, 0.1, 0x55575c, 12); g.cyl(0, 0.1, 0, 0.025, 2.2, METAL, 8);
      g.cyl(0, 2.05, 0, 1.1, 0.3, c, 8, 0.06); g.cyl(0, 2.04, 0, 1.08, 0.01, shade(c, 0.85), 8);
      for (let a = 0; a < 8; a++) { const ang = (a + 0.5) * Math.PI / 4; g.box(Math.cos(ang) * 1.0, 2.0, Math.sin(ang) * 1.0, 0.08, 0.1, 0.08, shade(c, 0.9)); }
      g.cyl(0, 2.35, 0, 0.04, 0.05, METAL, 8);
    } },
  firePit: { m: 'concrete', name: 'Fire Pit', w: 0.9, d: 0.9, h: 0.45, hp: 200, cols: [0x8a8580, 0x6f6a64, 0xa89f94], build(g, c) {
    g.cyl(0, 0, 0, 0.44, 0.3, c, 14, 0.42);
    for (let a = 0; a < 12; a++) { const ang = a * Math.PI / 6; g.box(Math.cos(ang) * 0.37, 0.325, Math.sin(ang) * 0.37, 0.14, 0.05, 0.14, a % 2 ? shade(c, 1.1) : shade(c, 0.92)); }
    g.cyl(0, 0.3, 0, 0.31, 0.006, 0x2a2420, 14);
    g.box(0, 0.33, 0, 0.42, 0.06, 0.07, 0x5b3b25); g.box(0, 0.36, 0, 0.07, 0.06, 0.4, 0x6e4a2f); g.box(0.02, 0.39, 0.02, 0.3, 0.05, 0.06, 0x4a3420);
    g.box(0.06, 0.315, 0.1, 0.12, 0.02, 0.1, EMBER); g.box(-0.08, 0.315, -0.07, 0.1, 0.02, 0.12, EMBER); g.box(0.04, 0.42, -0.03, 0.08, 0.03, 0.06, EMBER);
  } },
  planter: { m: 'paint', name: 'Planter Box', w: 1.2, d: 0.4, h: 0.7, hp: 80, cols: [0x6e4a2f, 0x3d3d48, 0xd8d2c4], build(g, c) {
    g.box(0, 0.2, 0, 1.2, 0.4, 0.4, c); g.box(0, 0.4, 0, 1.2, 0.03, 0.4, shade(c, 1.1));
    for (const x of [-0.4, 0, 0.4]) g.box(x, 0.2, 0.201, 0.01, 0.36, 0.004, shade(c, 0.8));
    g.box(0, 0.4, 0, 1.12, 0.02, 0.32, 0x4a3420);
    for (let i = 0; i < 6; i++) g.box(-0.48 + i * 0.19, 0.5 + (i % 2) * 0.04, (i % 2 ? 0.05 : -0.05), 0.2, 0.18 + (i % 2) * 0.08, 0.22, LEAF[i % 3]);
    for (let i = 0; i < 3; i++) g.box(-0.35 + i * 0.35, 0.64, 0.05, 0.06, 0.06, 0.06, [0xe74c3c, 0xf4d03f, 0xf2b8c6][i]);
  } },
  hedge: { m: 'fabric', name: 'Box Hedge', w: 1.5, d: 0.5, h: 1.1, hp: 90, cols: [0x3f7a3a, 0x356a32, 0x4f8f45], build(g, c) {
    g.box(0, 0.12, 0, 1.4, 0.24, 0.42, 0x5b4a2a);
    g.box(0, 0.62, 0, 1.5, 0.96, 0.5, c);
    for (let i = 0; i < 7; i++) g.box(-0.6 + i * 0.2, 0.3 + ((i * 5) % 4) * 0.2, 0.23 * (i % 2 ? 1 : -1), 0.22, 0.2, 0.04, shade(c, 0.85 + (i % 3) * 0.1));
    g.box(0, 1.09, 0, 1.44, 0.02, 0.44, shade(c, 1.08));
  } },
  // An open garden frame with a slatted roof. Walk under it or climb a post.
  pergola: { m: 'wood', climb: true, name: 'Pergola', w: 3.0, d: 3.0, h: 2.5, hp: 300, cols: [0xc89a64, 0x8a5a36, 0xf0ede6],
    parts: [[-1.5, 0, -1.5, -1.36, 2.3, -1.36], [1.36, 0, -1.5, 1.5, 2.3, -1.36], [-1.5, 0, 1.36, -1.36, 2.3, 1.5], [1.36, 0, 1.36, 1.5, 2.3, 1.5], [-1.5, 2.3, -1.5, 1.5, 2.5, 1.5]],
    build(g, c) {
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) { g.box(sx * 1.43, 1.15, sz * 1.43, 0.14, 2.3, 0.14, c); g.box(sx * 1.43, 0.03, sz * 1.43, 0.16, 0.06, 0.16, shade(c, 0.8)); }
      g.box(0, 2.24, 1.43, 3.0, 0.14, 0.1, shade(c, 0.9)); g.box(0, 2.24, -1.43, 3.0, 0.14, 0.1, shade(c, 0.9));
      g.box(1.43, 2.24, 0, 0.1, 0.14, 2.8, shade(c, 0.9)); g.box(-1.43, 2.24, 0, 0.1, 0.14, 2.8, shade(c, 0.9));
      for (let i = 0; i < 9; i++) g.box(-1.36 + i * 0.34, 2.38, 0, 0.07, 0.12, 3.0, c);
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.box(sx * 1.3, 2.05, sz * 1.43, 0.3, 0.06, 0.06, shade(c, 0.9));
      for (let i = 0; i < 5; i++) g.box(-1.43, 0.5 + i * 0.4, 1.2 - i * 0.12, 0.16, 0.18, 0.2, LEAF[i % 3]);
    } },
  // A doorway in a frame. Use it (F) to open or close it.
  door: { m: 'wood', use: 'door', name: 'Door', w: 1.0, d: 0.12, h: 2.1, hp: 160, cols: [WHITE, 0xc89a64, 0x5b3b25, 0x5d7a96],
    parts: [[-0.5, 0, -0.06, -0.42, 2.1, 0.06], [0.42, 0, -0.06, 0.5, 2.1, 0.06], [-0.5, 2.02, -0.06, 0.5, 2.1, 0.06], [-0.42, 0, -0.02, 0.42, 2.02, 0.02]],
    partsOpen: [[-0.5, 0, -0.06, -0.42, 2.1, 0.06], [0.42, 0, -0.06, 0.5, 2.1, 0.06], [-0.5, 2.02, -0.06, 0.5, 2.1, 0.06], [-0.42, 0, -0.06, -0.37, 2.02, 0.06]],
    build(g, c, s) {
      const fr = shade(c, 0.9);
      g.box(-0.46, 1.05, 0, 0.08, 2.1, 0.12, fr); g.box(0.46, 1.05, 0, 0.08, 2.1, 0.12, fr); g.box(0, 2.06, 0, 1.0, 0.08, 0.12, fr);
      g.box(0, 0.005, 0, 0.84, 0.01, 0.12, shade(c, 0.6));
      if (!s) {
        g.box(0, 1.01, 0, 0.84, 2.02, 0.04, c);
        for (const y of [0.55, 1.45]) { g.box(0, y, 0.021, 0.62, 0.7, 0.004, shade(c, 0.94)); g.box(0, y, -0.021, 0.62, 0.7, 0.004, shade(c, 0.94)); }
        for (const z of [0.04, -0.04]) { g.box(0.33, 1.0, z, 0.12, 0.025, 0.025, METAL); g.box(0.36, 1.0, z * 0.7, 0.03, 0.06, 0.02, METAL); }
      } else {
        g.box(-0.4, 1.01, 0.44, 0.04, 2.02, 0.84, c);
        for (const y of [0.55, 1.45]) { g.box(-0.379, y, 0.44, 0.004, 0.7, 0.62, shade(c, 0.94)); g.box(-0.421, y, 0.44, 0.004, 0.7, 0.62, shade(c, 0.94)); }
        for (const x of [-0.36, -0.44]) g.box(x, 1.0, 0.77, 0.025, 0.025, 0.12, METAL);
      }
    } },
  ladder: { m: 'wood', climb: true, see: true, name: 'Ladder', w: 0.5, d: 0.12, h: 2.4, hp: 60, cols: [0xc89a64, 0xbfc4c9, 0xd8b23b], build(g, c) {
    for (const sx of [-1, 1]) { g.box(sx * 0.22, 1.2, 0, 0.05, 2.4, 0.07, c); g.box(sx * 0.22, 0.02, 0, 0.07, 0.04, 0.12, DARK); }
    for (let i = 0; i < 8; i++) g.box(0, 0.25 + i * 0.29, 0, 0.4, 0.035, 0.045, shade(c, 0.92));
  } },
  pallet: { m: 'wood', climb: true, see: true, name: 'Pallet', w: 1.2, d: 1.0, h: 0.15, hp: 90, cols: [0xc9a46c, 0xb8925a, 0xd8b98a], build(g, c) {
    for (let i = 0; i < 7; i++) g.box(-0.6 + 0.05 + i * (1.1 / 6), 0.135, 0, 0.1, 0.025, 1.0, shade(c, 0.95 + (i % 3) * 0.04));
    for (const z of [-0.45, 0, 0.45]) for (const x of [-0.5, 0, 0.5]) g.box(x, 0.075, z, 0.14, 0.1, 0.1, shade(c, 0.85));
    for (const z of [-0.45, 0, 0.45]) g.box(0, 0.105, z, 1.2, 0.035, 0.1, shade(c, 0.9));
    for (let i = 0; i < 5; i++) g.box(-0.55 + i * 0.275, 0.012, 0, 0.1, 0.024, 1.0, c);
  } },

  // ---- more seating ----
  cafeChair: { m: 'wood', name: 'Café Chair', w: 0.45, d: 0.48, h: 0.82, hp: 35, cols: [0x2f2f33, 0xc89a64, 0x5a7a5f, 0xb5523b], build(g, c) {
    for (const sx of [-1, 1]) { g.box(sx * 0.19, 0.22, 0.19, 0.03, 0.44, 0.03, c); g.box(sx * 0.19, 0.41, -0.2, 0.03, 0.82, 0.03, c); }
    g.box(0, 0.45, 0, 0.44, 0.04, 0.44, shade(c, 1.1)); g.box(0, 0.472, 0.02, 0.4, 0.008, 0.38, 0xd8cdbb);
    for (const y of [0.6, 0.72]) g.box(0, y, -0.205, 0.38, 0.05, 0.02, c);
    g.box(0, 0.15, 0, 0.36, 0.02, 0.02, c); g.box(0, 0.15, 0.19, 0.36, 0.02, 0.02, c);
  } },
  loveseat: { m: 'fabric', soft: 'top', name: 'Loveseat', w: 1.4, d: 0.85, h: 0.8, hp: 120, cols: FABRIC, build(g, c) {
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.box(sx * 0.63, 0.04, sz * 0.34, 0.05, 0.08, 0.05, 0x6e4a2f);
    g.box(0, 0.16, 0, 1.4, 0.18, 0.82, shade(c, 0.88)); g.box(0, 0.57, -0.32, 1.4, 0.46, 0.2, c);
    for (const sx of [-1, 1]) { g.box(sx * 0.62, 0.41, 0.02, 0.16, 0.5, 0.82, c); g.box(sx * 0.62, 0.67, 0.02, 0.18, 0.03, 0.84, shade(c, 1.06)); }
    for (const x of [-0.28, 0.28]) { g.box(x, 0.32, 0.07, 0.54, 0.14, 0.68, shade(c, 1.07)); g.box(x, 0.56, -0.19, 0.52, 0.34, 0.12, shade(c, 1.03)); }
  } },
  sofaModule: { m: 'fabric', soft: 'top', name: 'Sofa Seat', w: 0.9, d: 0.9, h: 0.8, hp: 80, cols: FABRIC, build(g, c) {
    g.box(0, 0.06, 0, 0.88, 0.12, 0.86, DARK); g.box(0, 0.22, 0, 0.9, 0.2, 0.9, shade(c, 0.88));
    g.box(0, 0.38, 0.06, 0.86, 0.13, 0.76, shade(c, 1.07)); g.box(0, 0.385, 0.442, 0.84, 0.02, 0.005, shade(c, 0.8));
    g.box(0, 0.58, -0.35, 0.9, 0.44, 0.2, c); g.box(0, 0.58, -0.22, 0.82, 0.32, 0.08, shade(c, 1.03));
  } },
  sofaCornerModule: { m: 'fabric', soft: 'top', name: 'Corner Seat', w: 0.9, d: 0.9, h: 0.8, hp: 90, cols: FABRIC, build(g, c) {
    g.box(0, 0.06, 0, 0.88, 0.12, 0.86, DARK); g.box(0, 0.22, 0, 0.9, 0.2, 0.9, shade(c, 0.88));
    g.box(0.1, 0.38, 0.06, 0.66, 0.13, 0.76, shade(c, 1.07));
    g.box(0, 0.58, -0.35, 0.9, 0.44, 0.2, c); g.box(-0.35, 0.58, 0.1, 0.2, 0.44, 0.7, c);
    g.box(0.05, 0.58, -0.22, 0.66, 0.32, 0.08, shade(c, 1.03)); g.box(-0.22, 0.58, 0.12, 0.08, 0.32, 0.6, shade(c, 1.03));
  } },
  longBench: { m: 'wood', name: 'Long Bench', w: 2.4, d: 0.45, h: 0.45, hp: 90, cols: WOOD, build(g, c) {
    for (const x of [-1.05, 0, 1.05]) { g.box(x, 0.2, 0, 0.08, 0.4, 0.38, shade(c, 0.85)); g.box(x, 0.03, 0, 0.12, 0.06, 0.42, shade(c, 0.75)); }
    for (const z of [-0.15, 0, 0.15]) g.box(0, 0.425, z, 2.4, 0.05, 0.13, shade(c, 0.97 + Math.abs(z)));
  } },
  picnicTable: { m: 'wood', name: 'Picnic Table', w: 1.8, d: 1.5, h: 0.75, hp: 160, cols: [0xb08355, 0x8a5a36, 0x6f8a5b],
    parts: [[-0.9, 0, -0.75, 0.9, 0.45, -0.45], [-0.9, 0, 0.45, 0.9, 0.45, 0.75], [-0.9, 0.7, -0.4, 0.9, 0.75, 0.4]], build(g, c) {
    for (const z of [-0.3, -0.1, 0.1, 0.3]) g.box(0, 0.725, z, 1.8, 0.05, 0.18, shade(c, 1.02 - Math.abs(z) * 0.2));
    for (const sz of [-1, 1]) for (const z of [0.53, 0.67]) g.box(0, 0.425, sz * z, 1.8, 0.05, 0.13, shade(c, 0.95));
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) g.box(sx * 0.65, 0.36, sz * 0.38, 0.08, 0.72, 0.08, shade(c, 0.8));
      g.box(sx * 0.65, 0.38, 0, 0.08, 0.06, 1.5, shade(c, 0.78)); g.box(sx * 0.65, 0.67, 0, 0.08, 0.05, 0.8, shade(c, 0.78));
    }
  } },
  roundTable: { m: 'wood', name: 'Round Table', w: 1.0, d: 1.0, h: 0.75, hp: 80, cols: WOOD, build(g, c) {
    g.cyl(0, 0, 0, 0.26, 0.04, shade(c, 0.8), 16); g.cyl(0, 0.04, 0, 0.05, 0.66, shade(c, 0.85), 10);
    g.cyl(0, 0.7, 0, 0.5, 0.05, c, 20); g.cyl(0, 0.745, 0, 0.48, 0.004, shade(c, 1.06), 20);
  } },
  modernTable: { m: 'paint', name: 'Modern Table', w: 1.4, d: 0.8, h: 0.74, hp: 90, cols: [WHITE, 0x2f2f33, 0xc89a64, 0x8a9e9a], build(g, c) {
    for (const sx of [-1, 1]) { g.box(sx * 0.62, 0.36, 0, 0.05, 0.72, 0.7, DARK); g.box(sx * 0.62, 0.02, 0, 0.07, 0.04, 0.74, DARK); }
    g.box(0, 0.715, 0, 1.4, 0.05, 0.8, c); g.box(0, 0.67, 0, 1.2, 0.03, 0.04, DARK);
  } },
  barTable: { m: 'wood', name: 'High Table', w: 0.7, d: 0.7, h: 1.05, hp: 60, cols: [0x2f2f33, 0xc89a64, WHITE, 0x5b3b25], build(g, c) {
    g.cyl(0, 0, 0, 0.3, 0.03, METAL, 14); g.cyl(0, 0.03, 0, 0.035, 0.98, METAL, 8); g.cyl(0, 0.3, 0, 0.18, 0.02, METAL, 12);
    g.box(0, 1.03, 0, 0.7, 0.04, 0.7, c);
  } },
  standingDesk: { m: 'wood', name: 'Standing Desk', w: 1.4, d: 0.7, h: 1.1, hp: 90, cols: WOOD, build(g, c) {
    for (const sx of [-1, 1]) { g.box(sx * 0.58, 0.02, 0, 0.08, 0.04, 0.66, DARK); g.box(sx * 0.58, 0.32, 0, 0.07, 0.6, 0.07, DARK); g.box(sx * 0.58, 0.8, 0, 0.055, 0.5, 0.055, METAL); }
    g.box(0, 1.08, 0, 1.4, 0.04, 0.7, c); g.box(0, 1.03, -0.05, 1.18, 0.05, 0.08, DARK);
    g.box(0.5, 1.035, 0.33, 0.12, 0.03, 0.03, 0x34495e);
  } },
  playTable: { m: 'plastic', name: 'Kids\' Table', w: 1.0, d: 0.6, h: 0.5, hp: 40, cols: [0x2ecc71, 0xe74c3c, 0x3498db, 0xf1c40f], build(g, c) {
    legs4(g, 1.0, 0.6, 0.46, 0.07, shade(c, 0.8), 0.04); g.box(0, 0.48, 0, 1.0, 0.04, 0.6, c);
    g.box(-0.25, 0.505, 0.05, 0.2, 0.01, 0.14, 0xf2f2f2); g.box(0.2, 0.51, -0.08, 0.06, 0.02, 0.06, 0xe74c3c); g.box(0.3, 0.51, 0.08, 0.06, 0.02, 0.06, 0x3498db);
  } },
  // ---- more shelving and storage ----
  smallBookcase: { climb: true, m: 'wood', name: 'Small Bookcase', w: 0.8, d: 0.3, h: 1.0, hp: 70, cols: WOOD, build(g, c) {
    g.box(0, 0.5, -0.14, 0.8, 1.0, 0.02, shade(c, 0.85));
    for (const sx of [-1, 1]) g.box(sx * 0.385, 0.5, 0, 0.03, 1.0, 0.3, c);
    for (const y of [0.02, 0.5, 0.985]) g.box(0, y, 0, 0.8, 0.03, 0.3, c);
    const books = [0x9a4b3f, 0x34495e, 0x6f8a5b, 0xc98c3d, 0x8b6c9e, 0xd8cdbb];
    for (const y of [0.035, 0.515]) for (let i = 0; i < 9; i++) { const h = 0.3 + ((i * 7) % 5) * 0.03; g.box(-0.33 + i * 0.075, y + h / 2, 0.01, 0.06, h, 0.22, books[(i + (y > 0.3 ? 2 : 0)) % 6]); }
  } },
  wallShelf: { m: 'wood', name: 'Wall Shelf', w: 1.0, d: 0.25, h: 0.3, hp: 30, cols: WOOD, build(g, c) {
    g.box(0, 0.28, 0, 1.0, 0.04, 0.25, c); for (const sx of [-1, 1]) g.box(sx * 0.4, 0.13, -0.08, 0.04, 0.26, 0.08, DARK);
    g.box(-0.3, 0.37, 0, 0.12, 0.14, 0.12, 0xd8cdbb); g.cyl(0.05, 0.3, 0.02, 0.05, 0.12, 0x9a5b3a, 10); g.box(0.3, 0.355, 0, 0.22, 0.11, 0.16, 0x34495e);
  } },
  woodenShelf: { climb: true, m: 'wood', name: 'Open Shelf', w: 1.0, d: 0.35, h: 1.6, hp: 80, cols: WOOD, build(g, c) {
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.box(sx * 0.47, 0.8, sz * 0.15, 0.04, 1.6, 0.04, shade(c, 0.85));
    for (const y of [0.1, 0.55, 1.0, 1.45]) g.box(0, y, 0, 1.0, 0.03, 0.35, c);
    g.box(-0.25, 0.65, 0, 0.3, 0.17, 0.25, 0xc8a26e); g.cyl(0.25, 1.015, 0, 0.08, 0.2, 0xd8d2c4, 10); g.box(0.2, 0.175, 0, 0.4, 0.12, 0.28, 0x8fa7b8);
  } },
  modernShelf: { climb: true, m: 'paint', name: 'Tall White Shelf', w: 0.8, d: 0.4, h: 1.8, hp: 90, cols: [WHITE, 0x2f2f33, 0xd8cdbb], build(g, c) {
    g.box(0, 0.9, -0.19, 0.8, 1.8, 0.02, shade(c, 0.94));
    for (const sx of [-1, 1]) g.box(sx * 0.385, 0.9, 0, 0.03, 1.8, 0.4, c);
    for (let i = 0; i <= 5; i++) g.box(0, 0.02 + i * 0.355, 0, 0.8, 0.03, 0.4, c);
    g.box(-0.18, 0.19, 0.02, 0.28, 0.3, 0.3, 0xc8a26e); g.box(0.18, 0.19, 0.02, 0.28, 0.3, 0.3, 0x8fa7b8);
    g.cyl(0, 0.745, 0, 0.07, 0.22, 0x9a5b3a, 10); g.box(0, 1.19, 0, 0.18, 0.18, 0.18, 0x34495e);
  } },
  fancyShelf: { m: 'wood', name: 'Glass Cabinet', w: 0.9, d: 0.45, h: 1.9, hp: 110, cols: [0x5b3b25, WHITE, 0x2f2f33], build(g, c) {
    g.box(0, 0.08, 0, 0.9, 0.16, 0.45, c); g.box(0, 1.86, 0, 0.9, 0.08, 0.45, c); g.box(0, 0.98, -0.21, 0.86, 1.66, 0.03, shade(c, 0.85));
    for (const sx of [-1, 1]) g.box(sx * 0.43, 0.98, 0, 0.04, 1.7, 0.45, c);
    for (const y of [0.6, 1.05, 1.5]) g.box(0, y, 0, 0.82, 0.015, 0.4, GLASS);
    g.box(0, 0.98, 0.215, 0.82, 1.62, 0.01, GLASS); g.box(0, 0.98, 0.222, 0.03, 1.62, 0.006, c);
    g.cyl(-0.2, 0.61, 0, 0.06, 0.16, 0xd4af37, 10); g.cyl(0.18, 1.06, 0, 0.07, 0.12, 0xd8d2c4, 10); g.box(0, 1.57, 0, 0.3, 0.12, 0.2, 0x8a5a36);
  } },
  metalCart: { m: 'metal', name: 'Utility Trolley', w: 0.9, d: 0.5, h: 1.0, hp: 80, cols: [0xbfc4c9, 0x2f2f33, 0x5d7a96], build(g, c) {
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) { g.box(sx * 0.42, 0.53, sz * 0.22, 0.03, 0.9, 0.03, c); g.cyl(sx * 0.4, 0, sz * 0.2, 0.04, 0.07, DARK, 8); }
    for (const y of [0.15, 0.5, 0.85]) { g.box(0, y, 0, 0.9, 0.025, 0.5, c); g.box(0, y + 0.04, 0.235, 0.9, 0.06, 0.015, shade(c, 0.9)); }
    g.box(0, 0.97, -0.22, 0.86, 0.03, 0.03, DARK); g.box(-0.2, 0.95, 0, 0.3, 0.1, 0.3, 0xc8a26e);
  } },
  metalWardrobe: { m: 'steel', heavy: 1.2, name: 'Steel Wardrobe', w: 0.9, d: 0.55, h: 1.9, hp: 220, cols: [0x7f8c8d, 0x5d7a96, 0x8a9a5b, 0xc9ced3], build(g, c) {
    g.box(0, 0.95, 0, 0.9, 1.9, 0.53, c); g.box(0, 0.03, 0, 0.9, 0.06, 0.55, DARK);
    g.box(0, 1.0, 0.267, 0.006, 1.8, 0.004, shade(c, 0.6));
    for (const sx of [-1, 1]) { g.box(sx * 0.06, 1.05, 0.268, 0.02, 0.2, 0.012, METAL); for (let i = 0; i < 4; i++) g.box(sx * 0.22, 1.65 + i * 0.045, 0.267, 0.2, 0.012, 0.004, shade(c, 0.7)); }
  } },
  closet: { m: 'wood', heavy: 1.2, name: 'Double Closet', w: 1.6, d: 0.6, h: 2.1, hp: 240, cols: WOOD,
    parts: [[-0.8, 0, -0.3, 0.8, 2.1, -0.25], [-0.8, 0, -0.3, -0.75, 2.1, 0.3], [0.75, 0, -0.3, 0.8, 2.1, 0.3], [-0.8, 2.03, -0.3, 0.8, 2.1, 0.3], [-0.8, 0, -0.3, 0.8, 0.08, 0.3]],
    build(g, c) {
      g.box(0, 1.05, -0.275, 1.6, 2.1, 0.05, c); g.box(-0.775, 1.05, 0, 0.05, 2.1, 0.6, c); g.box(0.775, 1.05, 0, 0.05, 2.1, 0.6, c);
      g.box(0, 2.065, 0, 1.6, 0.07, 0.6, c); g.box(0, 0.04, 0, 1.6, 0.08, 0.6, shade(c, 0.7));
      g.box(0, 1.8, -0.05, 1.5, 0.025, 0.025, METAL); g.box(0, 1.95, -0.05, 1.5, 0.02, 0.45, shade(c, 0.9));
      const cloth = [0x9a4b3f, 0xd8cdbb, 0x34495e, 0x6f8a5b, 0xc98c3d, 0x3d3d48, 0x8b6c9e];
      for (let i = 0; i < 7; i++) g.box(-0.6 + i * 0.2, 1.42 - (i % 3) * 0.1, -0.05, 0.05, 0.7 + (i % 3) * 0.2, 0.36, cloth[i]);
      // doors standing open, flat against the sides
      for (const sx of [-1, 1]) { g.box(sx * 0.785, 1.05, 0.28, 0.03, 1.95, 0.04, shade(c, 1.05)); }
    } },
  drawerUnit: { m: 'wood', name: 'Drawer Unit', w: 0.5, d: 0.45, h: 0.7, hp: 60, cols: [WHITE, 0x2f2f33, 0xc89a64, 0x5d7a96], build(g, c) {
    g.box(0, 0.36, 0, 0.5, 0.68, 0.44, c); for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.cyl(sx * 0.2, 0, sz * 0.17, 0.02, 0.02, DARK, 6);
    for (let i = 0; i < 4; i++) { g.box(0, 0.12 + i * 0.165, 0.222, 0.46, 0.15, 0.006, shade(c, 1.05)); g.box(0, 0.12 + i * 0.165, 0.222, 0.14, 0.02, 0.012, METAL); }
  } },
  smallCabinet: { m: 'wood', name: 'Small Cabinet', w: 0.6, d: 0.4, h: 0.8, hp: 60, cols: WOOD, build(g, c) {
    legs4(g, 0.6, 0.4, 0.1, 0.04, DARK, 0.04); g.box(0, 0.45, 0, 0.6, 0.7, 0.39, c); g.box(0, 0.81, 0, 0.6, 0.02, 0.4, shade(c, 1.08));
    g.box(0, 0.45, 0.196, 0.004, 0.62, 0.004, shade(c, 0.6)); for (const sx of [-1, 1]) g.box(sx * 0.04, 0.55, 0.196, 0.015, 0.1, 0.008, METAL);
  } },
  milkCrate: { m: 'plastic', name: 'Plastic Crate', w: 0.45, d: 0.35, h: 0.3, hp: 30, cols: [0xe74c3c, 0x3498db, 0xf1c40f, 0x2ecc71, 0xe67e22, 0x2f2f33], build(g, c) {
    g.box(0, 0.015, 0, 0.45, 0.03, 0.35, c);
    for (const sz of [-1, 1]) { g.box(0, 0.28, sz * 0.165, 0.45, 0.04, 0.02, c); g.box(0, 0.1, sz * 0.165, 0.45, 0.04, 0.02, c); for (let i = 0; i < 5; i++) g.box(-0.2 + i * 0.1, 0.15, sz * 0.165, 0.025, 0.28, 0.02, c); }
    for (const sx of [-1, 1]) { g.box(sx * 0.215, 0.28, 0, 0.02, 0.04, 0.35, c); g.box(sx * 0.215, 0.1, 0, 0.02, 0.04, 0.35, c); for (let i = 0; i < 4; i++) g.box(sx * 0.215, 0.15, -0.12 + i * 0.08, 0.02, 0.28, 0.025, c); g.box(sx * 0.215, 0.24, 0, 0.022, 0.03, 0.12, shade(c, 0.6)); }
  } },
  smallBox: { m: 'card', name: 'Small Box', w: 0.4, d: 0.35, h: 0.3, hp: 20, cols: [0xc8a26e, 0xb8915c, 0xd2b07d], build(g, c) {
    g.box(0, 0.15, 0, 0.4, 0.3, 0.35, c); g.box(0, 0.301, 0, 0.4, 0.004, 0.06, 0xd8cfa8); g.box(0, 0.15, 0.176, 0.12, 0.08, 0.002, 0xe8e2d6);
  } },
  tinyBox: { m: 'card', name: 'Tiny Box', w: 0.25, d: 0.25, h: 0.2, hp: 15, cols: [0xc8a26e, 0xd2b07d, 0xb8915c], build(g, c) {
    g.box(0, 0.1, 0, 0.25, 0.2, 0.25, c); g.box(0, 0.201, 0, 0.25, 0.004, 0.04, 0xd8cfa8); g.box(0, 0.201, 0, 0.04, 0.004, 0.25, 0xd8cfa8);
  } },
  trashCan: { m: 'plastic', name: 'Bin', w: 0.45, d: 0.45, h: 0.75, hp: 40, cols: [0x5f6a72, 0x2f2f33, 0x3d7a4a, 0x2e6da4],
    parts: [[-0.225, 0, -0.225, 0.225, 0.04, 0.225], [-0.225, 0, -0.225, 0.225, 0.75, -0.2], [-0.225, 0, 0.2, 0.225, 0.75, 0.225], [-0.225, 0, -0.225, -0.2, 0.75, 0.225], [0.2, 0, -0.225, 0.225, 0.75, 0.225]],
    build(g, c) {
      g.box(0, 0.02, 0, 0.42, 0.04, 0.42, shade(c, 0.8));
      for (const sz of [-1, 1]) g.box(0, 0.36, sz * 0.21, 0.42, 0.72, 0.025, c);
      for (const sx of [-1, 1]) g.box(sx * 0.21, 0.36, 0, 0.025, 0.72, 0.42, c);
      for (const sz of [-1, 1]) g.box(0, 0.735, sz * 0.21, 0.45, 0.03, 0.03, shade(c, 1.15));
      for (const sx of [-1, 1]) g.box(sx * 0.21, 0.735, 0, 0.03, 0.03, 0.45, shade(c, 1.15));
      g.box(0, 0.06, 0, 0.36, 0.04, 0.36, 0x2a2a2e); g.box(0, 0.4, 0.224, 0.12, 0.12, 0.002, 0xf2f2f2);
    } },
  queenBed: { m: 'fabric', soft: 'top', name: 'Queen Bed', w: 1.8, d: 2.2, h: 1.1, hp: 190, cols: [WHITE, 0xd8cdbb, 0x5a6f8c, 0x9a4b3f, 0x3d3d48],
    parts: [[-0.9, 0, -1.04, 0.9, 0.52, 1.1], [-0.9, 0, -1.1, 0.9, 1.1, -1.04]], build(g, c) {
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.box(sx * 0.84, 0.05, sz * 1.02, 0.07, 0.1, 0.07, 0x55575c);
    g.box(0, 0.2, 0.03, 1.8, 0.22, 2.14, 0xd8d2c4); g.box(0, 0.4, 0.03, 1.74, 0.2, 2.1, WHITE);
    g.box(0, 0.51, 0.32, 1.77, 0.04, 1.5, c); g.box(0, 0.4, 1.07, 1.77, 0.2, 0.02, c); g.box(0.885, 0.4, 0.32, 0.02, 0.2, 1.48, c); g.box(-0.885, 0.4, 0.32, 0.02, 0.2, 1.48, c);
    g.box(0, 0.532, 0.85, 1.78, 0.012, 0.36, shade(c, 0.78));
    for (const x of [-0.45, 0.45]) { g.box(x, 0.55, -0.8, 0.7, 0.12, 0.34, WHITE); g.box(x, 0.6, -0.62, 0.5, 0.18, 0.08, shade(c, 1.1)); }
    g.box(0, 0.6, -1.07, 1.8, 1.0, 0.06, 0xd8d2c4); for (let i = 0; i < 6; i++) g.box(-0.75 + i * 0.3, 0.75, -1.035, 0.26, 0.6, 0.02, shade(0xd8d2c4, 0.92));
  } },
  // ---- more lights ----
  metalLamp: { m: 'metal', lamp: true, use: 'lamp', name: 'Industrial Lamp', w: 0.45, d: 0.45, h: 1.7, hp: 40, cols: [0x2f2f33, 0x5d7a96, 0xb5523b, 0xbfc4c9], build(g, c) {
    g.cyl(0, 0, 0, 0.2, 0.04, c, 14); g.cyl(0, 0.04, 0, 0.018, 1.5, METAL, 8);
    g.box(0.05, 1.53, 0, 0.14, 0.03, 0.03, METAL); g.cyl(0.08, 1.48, 0, 0.14, 0.2, c, 14, 0.05); g.cyl(0.08, 1.48, 0, 0.08, 0.012, 0xfff4d6, 10);
  } },
  arcLamp: { m: 'metal', lamp: true, use: 'lamp', name: 'Arc Lamp', w: 1.2, d: 0.5, h: 2.0, hp: 45, cols: [0xbfc4c9, 0x2f2f33, 0xd4af37], build(g, c) {
    g.box(-0.45, 0.05, 0, 0.3, 0.1, 0.3, 0x8f8a82); g.cyl(-0.45, 0.1, 0, 0.02, 1.0, c, 8);
    // the arm: a quarter circle of short pieces from the pole top over to the shade
    for (let i = 0; i <= 16; i++) { const a = Math.PI - (i / 16) * (Math.PI / 2); g.box(0.42 + Math.cos(a) * 0.87, 1.1 + Math.sin(a) * 0.82, 0, 0.05, 0.05, 0.03, c); }
    g.box(0.42, 1.86, 0, 0.03, 0.1, 0.03, c); g.cyl(0.42, 1.6, 0, 0.22, 0.2, c, 16, 0.07); g.cyl(0.42, 1.6, 0, 0.12, 0.012, 0xfff4d6, 12);
  } },
  deskLamp: { m: 'metal', lamp: true, use: 'lamp', name: 'Desk Lamp', w: 0.25, d: 0.25, h: 0.45, hp: 15, cols: [0x2f2f33, WHITE, 0xc0392b, 0x2e86c1], build(g, c) {
    g.cyl(-0.03, 0, 0, 0.09, 0.025, c, 12); g.box(-0.03, 0.18, 0, 0.02, 0.32, 0.02, METAL); g.box(0.02, 0.35, 0, 0.12, 0.02, 0.02, METAL);
    g.cyl(0.06, 0.28, 0, 0.065, 0.09, c, 12, 0.03); g.cyl(0.06, 0.28, 0, 0.04, 0.008, 0xfff4d6, 10);
  } },
  lantern: { m: 'metal', lamp: true, use: 'lamp', name: 'Lantern', w: 0.25, d: 0.25, h: 0.4, hp: 15, cols: [0x2f2f33, 0x8a5a36, 0xd4af37], build(g, c) {
    g.box(0, 0.02, 0, 0.22, 0.04, 0.22, c); g.box(0, 0.17, 0, 0.17, 0.26, 0.17, 0xfff2c4);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.box(sx * 0.095, 0.17, sz * 0.095, 0.02, 0.28, 0.02, c);
    g.cyl(0, 0.3, 0, 0.12, 0.05, c, 8, 0.04); g.box(0, 0.37, 0, 0.1, 0.02, 0.015, c);
    const prev = g.matOf; g.matOf = () => SURF.glow; g.cyl(0, 0.06, 0, 0.025, 0.1, 0xffc35a, 8); g.matOf = prev;
  } },
  candle: { m: 'paint', lamp: true, use: 'lamp', name: 'Candle', w: 0.12, d: 0.12, h: 0.25, hp: 5, cols: [0xf3eedf, 0xc0392b, 0x8fa7b8], build(g, c) {
    g.cyl(0, 0, 0, 0.06, 0.015, 0xd4af37, 12); g.cyl(0, 0.015, 0, 0.035, 0.17, c, 10); g.box(0, 0.195, 0, 0.006, 0.02, 0.006, DARK);
    const prev = g.matOf; g.matOf = () => SURF.glow; g.cyl(0, 0.2, 0, 0.014, 0.045, 0xffc35a, 6, 0.002); g.matOf = prev;
  } },
  workLight: { m: 'metal', lamp: true, use: 'lamp', name: 'Work Light', w: 0.6, d: 0.6, h: 1.8, hp: 50, cols: [0xf1c40f, 0xe67e22, 0x2f2f33], build(g, c) {
    for (let i = 0; i < 3; i++) { const a = i * 2.094; for (let k = 0; k < 4; k++) { const t = (k + 0.5) / 4; g.box(Math.cos(a) * 0.27 * (1 - t), 0.1 + t * 0.7, Math.sin(a) * 0.27 * (1 - t), 0.035, 0.22, 0.035, DARK); } g.box(Math.cos(a) * 0.26, 0.02, Math.sin(a) * 0.26, 0.05, 0.04, 0.05, DARK); }
    g.cyl(0, 0.75, 0, 0.022, 0.85, DARK, 8); g.box(0, 1.6, 0, 0.52, 0.03, 0.04, DARK);
    for (const sx of [-1, 1]) { g.box(sx * 0.15, 1.69, 0, 0.24, 0.18, 0.12, c); g.box(sx * 0.15, 1.69, 0.062, 0.2, 0.14, 0.005, 0xfff4d6); }
  } },
  gardenLamp: { m: 'metal', lamp: true, use: 'lamp', name: 'Garden Lamp', w: 0.3, d: 0.3, h: 2.2, hp: 60, cols: [0x2f2f33, 0x3d5a40, 0x5b3b25], build(g, c) {
    g.box(0, 0.08, 0, 0.3, 0.16, 0.3, c); g.cyl(0, 0.16, 0, 0.045, 1.64, c, 10);
    g.box(0, 1.94, 0, 0.22, 0.28, 0.22, 0xfff2c4); for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.box(sx * 0.11, 1.94, sz * 0.11, 0.025, 0.3, 0.025, c);
    g.cyl(0, 2.08, 0, 0.15, 0.12, c, 4, 0.02);
  } },
  // ---- more lights ----
  warmTableLamp: { m: 'plastic', lamp: true, use: 'lamp', glowCol: 0xffa94d, glowK: 0.7, name: 'Warm Table Lamp', w: 0.3, d: 0.3, h: 0.45, hp: 20, cols: [0xe8a85a, 0xd88a4a, 0xc9a07a], build(g, c) {
    g.cyl(0, 0, 0, 0.1, 0.03, 0x6e4a2f, 12); g.cyl(0, 0.03, 0, 0.06, 0.12, 0x8a6440, 10, 0.03);
    g.cyl(0, 0.15, 0, 0.03, 0.05, 0xfff4d6, 8); g.cyl(0, 0.2, 0, 0.14, 0.22, c, 12, 0.11);
  } },
  colourLamp: { m: 'plastic', lamp: true, use: 'lamp', glowCol: 'shade', name: 'Coloured Lamp', w: 0.3, d: 0.3, h: 0.5, hp: 20, cols: [0x5ad06a, 0xa45ad8], build(g, c) {
    g.cyl(0, 0, 0, 0.11, 0.025, DARK, 12); g.cyl(0, 0.025, 0, 0.018, 0.2, METAL, 6);
    g.cyl(0, 0.22, 0, 0.035, 0.05, 0xfff4d6, 8); g.cyl(0, 0.25, 0, 0.15, 0.25, c, 12, 0.1);
  } },
  modernLamp: { m: 'metal', lamp: true, use: 'lamp', name: 'Modern Lamp', w: 0.4, d: 0.4, h: 1.5, hp: 30, cols: [0xe8e8e8, 0x2f2f33, 0xd4af37], build(g, c) {
    g.cyl(0, 0, 0, 0.17, 0.025, c, 16); g.cyl(0, 0.025, 0, 0.012, 1.18, c, 6);
    // a glowing globe on a thin stem
    for (let i = 0; i < 6; i++) { const t = (i + 0.5) / 6, r = Math.sin(Math.PI * t) * 0.16; g.cyl(0, 1.2 + i * 0.05, 0, r, 0.05, 0xfff4d6, 14); }
  } },
  tripleLamp: { m: 'metal', lamp: true, use: 'lamp', name: 'Triple Lamp', w: 0.6, d: 0.6, h: 1.7, hp: 35, cols: [DARK, 0xe8e8e8, 0x8a6440], build(g, c) {
    g.cyl(0, 0, 0, 0.2, 0.03, c, 14); g.cyl(0, 0.03, 0, 0.02, 1.2, c, 6);
    for (const [dx, dz, y] of [[0.22, 0, 1.45], [-0.11, 0.19, 1.3], [-0.11, -0.19, 1.55]]) {
      g.box(dx / 2, y - 0.04, dz / 2, Math.abs(dx) + 0.02, 0.015, Math.abs(dz) + 0.02, c);
      g.cyl(dx, y - 0.02, dz, 0.03, 0.05, 0xfff4d6, 8); g.cyl(dx, y, dz, 0.09, 0.14, 0xf2ead8, 10, 0.05);
    }
  } },
  thinLight: { m: 'metal', lamp: true, use: 'lamp', glowCol: 0xe8f0ff, name: 'Thin Light', w: 0.25, d: 0.25, h: 1.6, hp: 25, cols: [0xf2f2f2, 0x2f2f33], build(g, c) {
    g.box(0, 0.015, 0, 0.25, 0.03, 0.25, c); g.box(0, 0.8, -0.03, 0.05, 1.56, 0.03, c);
    const prev = g.matOf; g.matOf = () => SURF.glow; g.box(0, 0.85, -0.01, 0.03, 1.4, 0.012, 0xf6f8ff); g.matOf = prev;
  } },
  ceilingLamp: { m: 'metal', lamp: true, use: 'lamp', glowY: 0.05, name: 'Ceiling Lamp', w: 0.5, d: 0.5, h: 1.2, hp: 25, cols: [0x2f2f33, 0xe8e8e8, 0xb5523b], build(g, c) {
    // hangs from its cord: hold it up against the ceiling and it stays there
    g.cyl(0, 1.17, 0, 0.08, 0.03, c, 10); g.cyl(0, 0.3, 0, 0.006, 0.87, DARK, 4);
    g.cyl(0, 0.0, 0, 0.24, 0.24, c, 16, 0.07); g.cyl(0, 0.02, 0, 0.06, 0.06, 0xfff4d6, 8);
  } },
  wallLight: { m: 'metal', lamp: true, use: 'lamp', glowK: 0.8, name: 'Wall Light', w: 0.25, d: 0.22, h: 0.35, hp: 20, cols: [0xd4af37, 0x2f2f33, 0xe8e8e8], build(g, c) {
    // a sconce: put it against a wall and it stays there
    g.box(0, 0.17, -0.1, 0.12, 0.3, 0.02, c); g.box(0, 0.12, -0.04, 0.02, 0.02, 0.12, c);
    g.cyl(0, 0.13, 0.03, 0.03, 0.04, 0xfff4d6, 8); g.cyl(0, 0.15, 0.03, 0.1, 0.18, 0xf2ead8, 10, 0.06);
  } },
  nightLight: { m: 'plastic', lamp: true, use: 'lamp', glowCol: 0x9ad0ff, glowK: 0.35, name: 'Night Light', w: 0.12, d: 0.08, h: 0.14, hp: 10, cols: [0xf2f2f2, 0xffd0e0, 0xd0f0ff], build(g, c) {
    g.box(0, 0.06, -0.02, 0.1, 0.12, 0.03, c);
    const prev = g.matOf; g.matOf = () => SURF.glow; g.cyl(0, 0.06, 0.005, 0.035, 0.02, 0xbfe4ff, 10); g.matOf = prev;
  } },
  smallWorkLight: { m: 'metal', lamp: true, use: 'lamp', glowCol: 0xf6f8ff, name: 'Small Work Light', w: 0.35, d: 0.3, h: 0.45, hp: 30, cols: [0xf1c40f, 0xe67e22], build(g, c) {
    g.box(0, 0.015, 0, 0.32, 0.03, 0.26, DARK); g.box(-0.13, 0.15, 0, 0.02, 0.26, 0.02, DARK); g.box(0.13, 0.15, 0, 0.02, 0.26, 0.02, DARK);
    g.box(0, 0.3, 0, 0.28, 0.22, 0.12, c); g.box(0, 0.3, 0.065, 0.24, 0.18, 0.01, 0xfff8e0);
  } },
  pencilLamp: { m: 'plastic', lamp: true, use: 'colour', name: 'Pencil Lamp', w: 0.14, d: 0.14, h: 0.7, hp: 15, cols: [0xf2f2f2], build(g, c, s) {
    // a pencil-shaped lamp whose body glows in a colour of your choosing (F)
    g.cyl(0, 0, 0, 0.07, 0.03, DARK, 6);
    const col = s ? STRIP_COLORS[(s - 1) % STRIP_COLORS.length] : 0xd8d8d8;
    const prev = g.matOf; if (s) g.matOf = () => SURF.glow;
    g.cyl(0, 0.03, 0, 0.055, 0.5, col, 6); g.cyl(0, 0.53, 0, 0.055, 0.12, shade(col, 0.95), 6, 0.012);
    g.matOf = prev; g.cyl(0, 0.53, 0, 0.056, 0.02, 0xd4af37, 6);
  } },
  globeLamp: { m: 'plastic', lamp: true, use: 'colour', name: 'Mood Globe', w: 0.3, d: 0.3, h: 0.34, hp: 15, cols: [0xf2f2f2], build(g, c, s) {
    // a round lamp that glows in a colour of your choosing (F)
    g.cyl(0, 0, 0, 0.1, 0.03, DARK, 12);
    const col = s ? STRIP_COLORS[(s - 1) % STRIP_COLORS.length] : 0xe0e0e0;
    const prev = g.matOf; if (s) g.matOf = () => SURF.glow;
    for (let i = 0; i < 6; i++) { const t = (i + 0.5) / 6, r = Math.sin(Math.PI * t) * 0.15; g.cyl(0, 0.03 + i * 0.05, 0, r, 0.05, col, 14); }
    g.matOf = prev;
  } },
  lightStrip: { m: 'plastic', lamp: true, glowK: 0.4, use: 'strip', name: 'Light Strip', w: 1.2, d: 0.05, h: 0.04, hp: 10, cols: [0xe8e8e8, 0x2f2f33], build(g, c, s) {
    g.box(0, 0.012, 0, 1.2, 0.024, 0.05, c);
    if (!s) { g.box(0, 0.028, 0, 1.16, 0.012, 0.03, 0x55575c); return; }
    const prev = g.matOf; g.matOf = () => SURF.glow;
    g.box(0, 0.03, 0, 1.16, 0.016, 0.034, STRIP_COLORS[(s - 1) % STRIP_COLORS.length]);
    g.matOf = prev;
  } },
  // ---- appliances and electronics ----
  boxTV: { m: 'plastic', use: 'tv', name: 'Box TV', w: 0.7, d: 0.55, h: 0.55, hp: 70, cols: [0x5a5550, 0xd8d2c4, 0x2f2f33], build(g, c, s) {
    g.box(0, 0.27, -0.03, 0.7, 0.5, 0.46, c); g.box(0, 0.25, -0.24, 0.5, 0.38, 0.06, shade(c, 0.85));
    g.box(0, 0.3, 0.215, 0.62, 0.44, 0.04, shade(c, 0.8)); screen(g, -0.05, 0.31, 0.236, 0.44, 0.34, s);
    g.cyl(0.25, 0.38, 0.232, 0.025, 0.012, DARK, 8); g.cyl(0.25, 0.32, 0.232, 0.025, 0.012, DARK, 8);
    for (let i = 0; i < 4; i++) g.box(0.25, 0.15 + i * 0.03, 0.236, 0.06, 0.008, 0.004, shade(c, 0.6));
    g.box(0, 0.01, 0, 0.6, 0.02, 0.4, DARK);
  } },
  wallTV: { m: 'plastic', use: 'tv', name: 'Wall TV', w: 1.3, d: 0.08, h: 0.8, hp: 60, cols: [0x1d1f24, 0x2f3238, 0xd8d8d8], build(g, c, s) {
    // a flat panel for hanging: put it against a wall and it stays there
    g.box(0, 0.4, -0.01, 1.3, 0.78, 0.04, c); g.box(0, 0.4, -0.035, 0.5, 0.3, 0.03, shade(c, 0.7));
    screen(g, 0, 0.405, 0.0115, 1.24, 0.71, s);
    g.box(0.58, 0.04, 0.012, 0.03, 0.008, 0.002, s ? 0x44ff66 : 0xff4444);
  } },
  curvedTV: { m: 'plastic', use: 'tv', name: 'Curved TV', w: 1.4, d: 0.14, h: 0.62, hp: 70, cols: [0x1d1f24, 0x3a3c42], build(g, c, s) {
    // a curved panel for the wall: the ends bend towards you
    const seg = 5, sw = 1.4 / seg;
    for (let i = 0; i < seg; i++) {
      const cx = -0.7 + sw * (i + 0.5), off = Math.pow(Math.abs(cx) / 0.7, 2) * 0.06;
      g.box(cx, 0.31, -0.035 + off, sw + 0.004, 0.6, 0.045, c);
    }
    g.box(0, 0.31, -0.065, 0.5, 0.3, 0.02, shade(c, 0.7));
    screen(g, 0, 0.315, 0.035, 1.34, 0.54, s);
  } },
  miniTV: { m: 'plastic', use: 'tv', name: 'Mini TV', w: 0.5, d: 0.2, h: 0.42, hp: 35, cols: [0x1d1f24, 0xd8d8d8, 0x2f2f33], build(g, c, s) {
    // a small screen on a stand, about the size of a computer monitor
    g.box(0, 0.01, 0, 0.22, 0.02, 0.16, c); g.box(0, 0.08, -0.03, 0.04, 0.12, 0.03, c);
    g.box(0, 0.27, -0.01, 0.5, 0.3, 0.035, c); screen(g, 0, 0.275, 0.0085, 0.46, 0.26, s);
    g.box(0.21, 0.13, 0.009, 0.015, 0.006, 0.002, s ? 0x44ff66 : 0xff4444);
  } },
  miniTvStand: { m: 'wood', name: 'Small TV Stand', w: 0.8, d: 0.4, h: 0.45, hp: 60, cols: WOOD, build(g, c) {
    legs4(g, 0.8, 0.4, 0.42, 0.04, c, 0.03); g.box(0, 0.43, 0, 0.8, 0.03, 0.4, c); g.box(0, 0.18, 0, 0.72, 0.02, 0.34, shade(c, 0.88));
    g.box(0, 0.3, -0.18, 0.72, 0.22, 0.015, shade(c, 0.92));
  } },
  microwave: { m: 'plastic', use: 'ding', name: 'Microwave', w: 0.5, d: 0.38, h: 0.3, hp: 40, cols: [WHITE, 0x2f2f33, 0xbfc4c9], build(g, c) {
    g.box(0, 0.155, 0, 0.5, 0.29, 0.37, c); for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.box(sx * 0.21, 0.005, sz * 0.15, 0.04, 0.01, 0.04, DARK);
    g.box(-0.07, 0.155, 0.186, 0.32, 0.22, 0.004, 0x1a1c20); g.box(-0.07, 0.155, 0.189, 0.26, 0.16, 0.002, 0x55575c);
    g.box(0.17, 0.22, 0.187, 0.1, 0.04, 0.004, 0x2a3a2a); for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) g.box(0.145 + j * 0.05, 0.16 - i * 0.035, 0.187, 0.035, 0.022, 0.004, shade(c, 0.85));
  } },
  toaster: { m: 'metal', use: 'ding', name: 'Toaster', w: 0.3, d: 0.18, h: 0.2, hp: 25, cols: [0xbfc4c9, WHITE, 0xc0392b, 0x2f2f33], build(g, c) {
    g.box(0, 0.1, 0, 0.28, 0.19, 0.18, c); g.box(0, 0.006, 0, 0.28, 0.012, 0.16, DARK);
    for (const z of [-0.035, 0.035]) g.box(0, 0.192, z, 0.2, 0.004, 0.025, 0x1a1c20);
    g.box(0.144, 0.14, 0, 0.012, 0.03, 0.05, DARK); g.cyl(0.144, 0.06, 0.05, 0.012, 0.01, DARK, 8);
  } },
  recordPlayer: { m: 'wood', use: 'music', name: 'Record Player', w: 0.45, d: 0.35, h: 0.15, hp: 30, cols: WOOD, build(g, c, s) {
    g.box(0, 0.05, 0, 0.45, 0.1, 0.35, c); g.box(0, 0.101, 0, 0.43, 0.004, 0.33, 0x2a2420);
    g.cyl(-0.05, 0.103, 0, 0.13, 0.012, 0x55575c, 18);
    if (s) { g.cyl(-0.05, 0.115, 0, 0.12, 0.005, 0x111111, 18); g.cyl(-0.05, 0.12, 0, 0.04, 0.003, 0xc0392b, 10); g.box(0.08, 0.125, -0.01, 0.17, 0.008, 0.012, METAL); }
    else g.box(0.15, 0.125, -0.04, 0.012, 0.008, 0.17, METAL);
    g.cyl(0.17, 0.103, -0.11, 0.025, 0.03, METAL, 8); g.box(0.17, 0.106, 0.12, 0.06, 0.012, 0.03, DARK);
    g.box(0, 0.05, 0.176, 0.4, 0.04, 0.004, shade(c, 0.8));
  } },
  // ---- decor (stands on the floor or leans on anything) ----
  painting: { m: 'paint', name: 'Painting', w: 0.9, d: 0.05, h: 0.7, hp: 15, cols: [0x2e86c1, 0xc0392b, 0x27ae60, 0xf39c12, 0x8e44ad, 0x34495e], build(g, c) {
    g.box(0, 0.35, 0, 0.9, 0.7, 0.04, 0x5b3b25); g.box(0, 0.35, 0.021, 0.8, 0.6, 0.004, 0xf2ead8);
    const v = c % 7, f = 0.024;
    g.box(0, 0.16, f, 0.8, 0.22, 0.003, shade(c, 0.75)); g.box(-0.18 + v * 0.03, 0.47, f, 0.2, 0.2, 0.003, c);
    g.box(0.2, 0.42 - v * 0.01, f + 0.001, 0.28, 0.1, 0.003, shade(c, 1.3)); g.box(0.05, 0.28, f + 0.001, 0.5, 0.04, 0.003, 0xf2f2f2);
  } },
  tallPainting: { m: 'paint', name: 'Tall Painting', w: 0.6, d: 0.05, h: 1.0, hp: 15, cols: [0x27ae60, 0xd35400, 0x2e86c1, 0xb7950b], build(g, c) {
    g.box(0, 0.5, 0, 0.6, 1.0, 0.04, 0x2f2f33); g.box(0, 0.5, 0.021, 0.52, 0.92, 0.004, 0xe9e3d3);
    const f = 0.024; g.box(0, 0.25, f, 0.52, 0.42, 0.003, shade(c, 0.7));
    for (let i = 0; i < 5; i++) g.box(0, 0.6 + i * 0.03, f, 0.08 + Math.sin((i + 0.5) / 5 * Math.PI) * 0.18, 0.03, 0.003, c);
    g.box(-0.1, 0.84, f, 0.24, 0.04, 0.003, shade(c, 1.25));
  } },
  wallArt: { m: 'paint', name: 'Wall Art', w: 1.0, d: 0.05, h: 0.6, hp: 15, cols: [0xd8cdbb, 0x2f2f33, 0x8a9e9a], build(g, c) {
    g.box(0, 0.3, 0, 1.0, 0.6, 0.04, c); const f = 0.022;
    g.box(-0.28, 0.32, f, 0.3, 0.42, 0.004, 0xc98c3d); g.box(0.08, 0.22, f, 0.32, 0.22, 0.004, 0x5a6f8c); g.box(0.3, 0.42, f, 0.26, 0.2, 0.004, 0x9a4b3f);
    g.box(0.08, 0.44, f + 0.001, 0.04, 0.28, 0.004, 0xf2f2f2);
  } },
  roundMirror: { m: 'metal', name: 'Round Mirror', w: 0.7, d: 0.06, h: 0.7, hp: 20, cols: [0xd4af37, 0x2f2f33, 0xc89a64], build(g, c) {
    for (let i = 0; i < 16; i++) { const a = i * Math.PI / 8; g.box(Math.cos(a) * 0.3, 0.35 + Math.sin(a) * 0.3, 0, 0.14, 0.14, 0.05, c); }
    for (let i = 0; i < 4; i++) { const k = Math.cos((i + 0.5) / 4 * Math.PI / 2); g.box(0, 0.35, 0.012, 0.56 * k, 0.56 * Math.sqrt(Math.max(0, 1 - k * k)) + 0.02, 0.02, 0xd9e6ee); }
    g.box(0, 0.35, 0.012, 0.4, 0.4, 0.02, 0xd9e6ee); g.box(-0.1, 0.44, 0.024, 0.06, 0.14, 0.002, 0xf2fbff);
  } },
  wideMirror: { m: 'wood', name: 'Wide Mirror', w: 1.4, d: 0.06, h: 0.8, hp: 25, cols: [WHITE, 0x2f2f33, 0x5b3b25, 0xd4af37], build(g, c) {
    g.box(0, 0.4, 0, 1.4, 0.8, 0.05, c); g.box(0, 0.4, 0.026, 1.3, 0.7, 0.004, 0xd9e6ee);
    g.box(-0.4, 0.5, 0.029, 0.12, 0.4, 0.002, 0xf2fbff); g.box(-0.25, 0.45, 0.029, 0.05, 0.3, 0.002, 0xf2fbff);
  } },
  flowerPot: { m: 'paint', name: 'Flower Pot', w: 0.35, d: 0.35, h: 0.5, hp: 15, cols: [0xe88aa8, 0xf4d03f, 0xf3f1ec, 0xc0392b], build(g, c) {
    g.cyl(0, 0, 0, 0.12, 0.22, 0xb7704a, 12, 0.16); g.cyl(0, 0.22, 0, 0.17, 0.03, 0xa0603e, 12); g.cyl(0, 0.24, 0, 0.145, 0.012, 0x4a3420, 12);
    for (let i = 0; i < 7; i++) { const a = i * 0.9, rr = 0.03 + (i % 3) * 0.035, x = Math.cos(a) * rr, z = Math.sin(a) * rr, h = 0.12 + (i % 4) * 0.035;
      g.box(x, 0.25 + h / 2, z, 0.012, h, 0.012, LEAF[i % 3]); g.box(x, 0.25 + h, z, 0.06, 0.04, 0.06, c); g.box(x, 0.257 + h, z, 0.025, 0.045, 0.025, 0xf1c40f); }
    for (let i = 0; i < 4; i++) g.box(Math.cos(i * 1.6) * 0.08, 0.27, Math.sin(i * 1.6) * 0.08, 0.1, 0.03, 0.05, LEAF[i % 3]);
  } },
  welcomeMat: { m: 'fabric', name: 'Doormat', w: 0.8, d: 0.5, h: 0.02, hp: 10, flat: true, cols: [0x8a6a44, 0x3d3d48, 0x9a4b3f], build(g, c) {
    g.box(0, 0.007, 0, 0.8, 0.014, 0.5, c); g.box(0, 0.015, 0, 0.68, 0.003, 0.38, shade(c, 0.75));
    for (let i = 0; i < 5; i++) g.box(-0.2 + i * 0.1, 0.0175, 0, 0.06, 0.002, 0.12, shade(c, 1.3));
  } },
  roundRug: { m: 'fabric', name: 'Round Rug', w: 1.8, d: 1.8, h: 0.02, hp: 20, flat: true, cols: [0xd8cdbb, 0x5a6f8c, 0xb5523b, 0x6f8a5b], build(g, c) {
    g.cyl(0, 0, 0, 0.9, 0.012, c, 24); g.cyl(0, 0.012, 0, 0.72, 0.002, shade(c, 0.82), 24); g.cyl(0, 0.0135, 0, 0.5, 0.002, shade(c, 1.12), 20); g.cyl(0, 0.015, 0, 0.2, 0.002, shade(c, 0.75), 14);
  } },
  longRug: { m: 'fabric', name: 'Runner Rug', w: 3.0, d: 0.8, h: 0.02, hp: 20, flat: true, cols: [0x9a4b3f, 0x34495e, 0xd8cdbb, 0x6f8a5b], build(g, c) {
    g.box(0, 0.006, 0, 2.9, 0.012, 0.8, c); g.box(0, 0.013, 0, 2.7, 0.002, 0.6, shade(c, 1.15));
    for (let i = 0; i < 7; i++) g.box(-1.2 + i * 0.4, 0.0145, 0, 0.18, 0.002, 0.18, shade(c, 0.7));
    for (const sx of [-1, 1]) for (let i = 0; i < 8; i++) g.box(sx * 1.475, 0.004, -0.35 + i * 0.1, 0.05, 0.008, 0.02, 0xf2ead8);
  } },
  showcaseSign: { m: 'metal', name: 'Display Sign', w: 0.6, d: 0.4, h: 1.4, hp: 30, cols: [0x2e6da4, 0xc0392b, 0x27ae60, 0xf39c12], build(g, c) {
    g.box(0, 0.02, 0, 0.5, 0.04, 0.38, DARK); g.box(0, 0.47, 0, 0.04, 0.9, 0.04, METAL);
    g.box(0, 1.15, 0, 0.6, 0.5, 0.03, c); g.box(0, 1.15, 0.016, 0.54, 0.44, 0.003, WHITE);
    g.box(0, 1.3, 0.019, 0.42, 0.06, 0.003, c); for (let i = 0; i < 3; i++) g.box(-0.06, 1.18 - i * 0.07, 0.019, 0.3, 0.025, 0.003, 0x8a8f96);
    g.box(0.16, 1.02, 0.019, 0.14, 0.08, 0.003, 0xf1c40f);
  } },
  // ---- toys ----
  plushBear: { m: 'fabric', soft: 'any', plush: true, name: 'Giant Plush Bear', w: 0.6, d: 0.5, h: 0.75, hp: 30, cols: [0x8a5a36, 0xd8b88c, 0xf3f1ec, 0x5a4a3a], build(g, c) {
    const dk = shade(c, 0.85), lt = shade(c, 1.2);
    g.box(0, 0.25, -0.04, 0.42, 0.38, 0.32, c); g.box(0, 0.26, 0.12, 0.26, 0.26, 0.04, lt);
    for (const sx of [-1, 1]) { g.box(sx * 0.16, 0.07, 0.1, 0.14, 0.14, 0.26, dk); g.box(sx * 0.16, 0.07, 0.235, 0.1, 0.1, 0.01, lt); g.box(sx * 0.255, 0.3, 0, 0.09, 0.24, 0.12, dk); }
    g.box(0, 0.55, -0.02, 0.32, 0.28, 0.28, c); g.box(0, 0.51, 0.14, 0.13, 0.1, 0.06, lt); g.box(0, 0.54, 0.171, 0.05, 0.035, 0.01, 0x1a1a1e);
    for (const sx of [-1, 1]) { g.box(sx * 0.13, 0.7, -0.02, 0.1, 0.1, 0.07, dk); g.box(sx * 0.07, 0.6, 0.122, 0.035, 0.035, 0.01, 0x1a1a1e); }
    g.box(0, 0.4, 0.13, 0.2, 0.04, 0.04, 0xc0392b);
  } },
  toyRobot: { m: 'plastic', name: 'Toy Robot', w: 0.25, d: 0.2, h: 0.35, hp: 10, cols: [0xbfc4c9, 0xc0392b, 0x2e86c1, 0xf1c40f], build(g, c) {
    for (const sx of [-1, 1]) { g.box(sx * 0.05, 0.05, 0, 0.06, 0.1, 0.08, shade(c, 0.8)); g.box(sx * 0.1, 0.17, 0, 0.04, 0.12, 0.05, shade(c, 0.85)); }
    g.box(0, 0.17, 0, 0.16, 0.14, 0.1, c); g.box(0, 0.18, 0.051, 0.08, 0.06, 0.004, 0x1d3550); g.box(0, 0.285, 0, 0.12, 0.09, 0.09, shade(c, 1.1));
    for (const sx of [-1, 1]) g.box(sx * 0.03, 0.295, 0.046, 0.025, 0.02, 0.004, 0xf1c40f);
    g.box(0, 0.33, 0, 0.01, 0.02, 0.01, DARK); g.box(0, 0.34, 0, 0.025, 0.02, 0.025, 0xe74c3c);
  } },
  toyCar: { m: 'plastic', name: 'Toy Car', w: 0.3, d: 0.15, h: 0.15, hp: 10, cols: [0xe74c3c, 0x2e86c1, 0xf1c40f, 0x27ae60], build(g, c) {
    g.box(0, 0.06, 0, 0.3, 0.06, 0.14, c); g.box(-0.02, 0.11, 0, 0.15, 0.05, 0.12, shade(c, 1.1)); g.box(-0.02, 0.11, 0, 0.13, 0.04, 0.124, 0x8fa7b8);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.box(sx * 0.09, 0.03, sz * 0.062, 0.06, 0.06, 0.026, DARK);
    g.box(0.148, 0.065, 0.04, 0.004, 0.015, 0.025, 0xfff4d6); g.box(0.148, 0.065, -0.04, 0.004, 0.015, 0.025, 0xfff4d6);
  } },
  puzzleCube: { m: 'plastic', name: 'Puzzle Cube', w: 0.12, d: 0.12, h: 0.12, hp: 5, cols: [0x111111], build(g) {
    g.box(0, 0.06, 0, 0.12, 0.12, 0.12, 0x111111);
    const C = [0xe74c3c, 0xf1c40f, 0x2ecc71, 0x2e86c1, 0xf39c12, 0xf3f1ec], s = 0.034, o = 0.038;
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
      g.box(i * o, 0.06 + j * o, 0.0605, s, s, 0.002, C[(i + j + 3) % 6]); g.box(0.0605, 0.06 + j * o, i * o, 0.002, s, s, C[(i * 2 + j + 7) % 6]);
      g.box(i * o, 0.1205, j * o, s, 0.002, s, C[(i - j + 9) % 6]);
    }
  } },
  foamDice: { m: 'fabric', use: 'roll', name: 'Foam Dice', w: 0.35, d: 0.35, h: 0.35, hp: 15, cols: [WHITE, 0xe74c3c, 0x2e86c1, 0xf1c40f], build(g, c) {
    g.box(0, 0.175, 0, 0.35, 0.31, 0.31, c); g.box(0, 0.175, 0, 0.31, 0.35, 0.31, c); g.box(0, 0.175, 0, 0.31, 0.31, 0.35, c); g.box(0, 0.175, 0, 0.33, 0.33, 0.33, c);
    const pip = c === WHITE ? 0x1a1a1e : WHITE, p = (x, y, z, sx, sy, sz) => g.box(x, y, z, sx, sy, sz, pip);
    p(0, 0.351, 0, 0.06, 0.004, 0.06); // one on top
    for (const [u, v] of [[-0.08, -0.08], [0.08, 0.08], [-0.08, 0.08], [0.08, -0.08]]) p(u, 0.175 + v, 0.176, 0.05, 0.05, 0.004); // four in front
    for (const k of [-0.09, 0, 0.09]) p(0.176, 0.175 + k, k, 0.004, 0.05, 0.05); // three on the side
  } },
  giftBox: { m: 'card', use: 'gift', name: 'Gift Box', w: 0.4, d: 0.4, h: 0.35, hp: 15, cols: [0xc0392b, 0x2e86c1, 0x8e44ad, 0x27ae60], build(g, c) {
    const rib = c === 0x27ae60 ? 0xc0392b : 0xf1c40f;
    g.box(0, 0.15, 0, 0.38, 0.3, 0.38, c); g.box(0, 0.31, 0, 0.4, 0.06, 0.4, shade(c, 1.1));
    g.box(0, 0.17, 0, 0.06, 0.32, 0.392, rib); g.box(0, 0.17, 0, 0.392, 0.32, 0.06, rib); g.box(0, 0.342, 0, 0.402, 0.004, 0.06, rib); g.box(0, 0.342, 0, 0.06, 0.004, 0.402, rib);
    for (const sx of [-1, 1]) g.box(sx * 0.06, 0.37, 0, 0.1, 0.05, 0.04, rib);
  } },
  bigButton: { m: 'plastic', use: 'button', name: 'Big Red Button', w: 0.25, d: 0.25, h: 0.12, hp: 10, cols: [0x2f2f33, 0xf1c40f], build(g, c) {
    g.cyl(0, 0, 0, 0.12, 0.05, c, 16); g.cyl(0, 0.05, 0, 0.095, 0.015, shade(c, 1.3), 16); g.cyl(0, 0.065, 0, 0.08, 0.05, 0xd62c2c, 16, 0.07);
  } },
  toolbox: { m: 'steel', name: 'Toolbox', w: 0.5, d: 0.25, h: 0.25, hp: 40, cols: [0xc0392b, 0x2e86c1, 0x2f2f33], build(g, c) {
    g.box(0, 0.1, 0, 0.5, 0.2, 0.24, c); g.box(0, 0.21, 0, 0.48, 0.03, 0.22, shade(c, 1.1)); g.box(0, 0.2, 0.121, 0.5, 0.006, 0.004, shade(c, 0.6));
    for (const sx of [-1, 1]) { g.box(sx * 0.12, 0.235, 0, 0.02, 0.03, 0.02, DARK); g.box(sx * 0.18, 0.16, 0.122, 0.04, 0.03, 0.006, METAL); }
    g.box(0, 0.24, 0, 0.26, 0.02, 0.03, DARK);
  } },
  stepLadder: { m: 'metal', climb: true, see: true, name: 'Step Ladder', w: 0.5, d: 0.7, h: 1.5, hp: 50, cols: [0xbfc4c9, 0xf1c40f, 0xe67e22], build(g, c) {
    // an A-frame: each leg is a run of short segments leaning in to the top
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      for (let k = 0; k < 6; k++) { const t = (k + 0.5) / 6; g.box(sx * 0.22, t * 1.45, sz * (0.33 - t * 0.24), 0.04, 0.26, 0.04, c); }
      g.box(sx * 0.22, 0.02, sz * 0.33, 0.06, 0.04, 0.06, DARK);
    }
    for (let i = 0; i < 4; i++) { const y = 0.3 + i * 0.3, z = 0.33 - (y / 1.45) * 0.24; g.box(0, y, z, 0.44, 0.03, 0.1, shade(c, 0.9)); }
    g.box(0, 1.47, 0, 0.48, 0.05, 0.24, shade(c, 0.85)); g.box(0, 0.6, 0, 0.02, 0.02, 0.44, DARK);
  } },
};
// Light strip colours: warm white, red, orange, green, blue, purple.
export const STRIP_COLORS = [0xfff1d6, 0xff3b3b, 0xff9a2e, 0x3dff7a, 0x3d8bff, 0xb04dff];

// Food, drinks and first aid: picked up into your inventory, then used.
// food = hunger, en = energy, hp = health (negative hurts), use = seconds it
// takes. Medkits are the only thing that takes time.
export const ITEMS = {
  apple: { name: 'Apple', food: 12, en: 6, hp: 5, color: 0xc0392b, w: 0.09, d: 0.09, h: 0.09 },
  banana: { name: 'Banana', food: 14, en: 6, hp: 5, color: 0xf4d03f, w: 0.2, d: 0.05, h: 0.05 },
  orange: { name: 'Orange', food: 10, en: 10, hp: 4, color: 0xe67e22, w: 0.09, d: 0.09, h: 0.09 },
  burger: { name: 'Burger', food: 20, en: 6, color: 0xc68a4a, w: 0.13, d: 0.13, h: 0.09 },
  hotdog: { name: 'Hot Dog', food: 18, en: 3, color: 0xe2b56b, w: 0.2, d: 0.06, h: 0.06 },
  pizza: { name: 'Pizza Slice', food: 5, en: 2, color: 0xe6a23c, w: 0.25, d: 0.18, h: 0.03 },
  stew: { name: 'Bowl of Stew', food: 30, en: 6, color: 0xf2efe8, w: 0.18, d: 0.18, h: 0.08 },
  chips: { name: 'Crisps', food: 10, en: 4, color: 0xd4ac0d, w: 0.18, d: 0.06, h: 0.24 },
  donut: { name: 'Doughnut', food: 9, en: 15, color: 0xd98cb3, w: 0.11, d: 0.11, h: 0.04 },
  pastry: { name: 'Swirl Pastry', food: 14, en: 15, color: 0xc8874a, w: 0.12, d: 0.12, h: 0.05 },
  cookie: { name: 'Cookie', food: 8, en: 8, color: 0xb9874f, w: 0.08, d: 0.08, h: 0.02 },
  chocolate: { name: 'Chocolate Bar', food: 15, en: 18, color: 0x5d3a1a, w: 0.16, d: 0.07, h: 0.015 },
  icecream: { name: 'Ice Cream', food: 6, en: 13, color: 0xf7e1d7, w: 0.07, d: 0.07, h: 0.18 },
  beans: { name: 'Old Beans', food: 18, en: 5, hp: -10, color: 0x8e9a5b, w: 0.08, d: 0.08, h: 0.11 },
  soda: { name: 'Fizz Cola', en: 17, color: 0xc0392b, w: 0.07, d: 0.07, h: 0.13 },
  bigsoda: { name: 'Big Fizz (2 L)', en: 23, hp: -5, color: 0x922b21, w: 0.11, d: 0.11, h: 0.33 },
  water: { name: 'Water', en: 12, hp: 3, color: 0x85c1e9, w: 0.07, d: 0.07, h: 0.24 },
  cinnamon: { name: 'Cinnamon Swirl', food: 14, en: 15, color: 0xb9743f, w: 0.12, d: 0.12, h: 0.06 },
  lemon: { name: 'Lemon', food: 10, en: 10, hp: 4, color: 0xf2d43a, w: 0.09, d: 0.07, h: 0.07 },
  lemonSlice: { name: 'Lemon Slice', food: 5, en: 5, hp: 2, color: 0xf6e27a, w: 0.07, d: 0.07, h: 0.015 },
  crackers: { name: 'Fish-Shaped Crackers', food: 18, en: 2, color: 0x2e86c1, w: 0.14, d: 0.05, h: 0.2 },
  // A hazard, not food: it hurts if you pick it up and use it.
  glass: { name: 'Broken Glass', hp: -33, hazard: true, color: 0xcfe3ea, w: 0.16, d: 0.12, h: 0.02 },
  medkit: { name: 'First Aid Kit', hp: 30, use: 2.5, color: 0xd63031, w: 0.3, d: 0.2, h: 0.14 },
  // A tool, not food: worn, not eaten.
  torch: { name: 'Head Torch', tool: true, color: 0x2f2f33, w: 0.18, d: 0.14, h: 0.06 },
};
// What each kind of place stocks.
export const STOCK = {
  cafeteria: ['pizza', 'pizza', 'pizza', 'burger', 'burger', 'chips', 'chips', 'chips', 'chips', 'stew', 'stew', 'banana', 'banana', 'apple', 'orange', 'pastry', 'hotdog', 'donut', 'beans', 'soda', 'bigsoda', 'water', 'water', 'water', 'cinnamon', 'cinnamon', 'lemon', 'lemon'],
  kitchen: ['hotdog', 'pizza', 'pizza', 'cookie', 'orange', 'water', 'lemon', 'lemonSlice'],
  bedroom: ['crackers', 'crackers', 'pizza', 'cookie'],
  greenhouse: ['glass', 'glass', 'glass', 'glass'],
  snack: ['icecream', 'icecream', 'soda', 'soda', 'chips', 'chocolate'],
  play: ['apple', 'apple', 'cookie'],
  any: ['chips', 'water', 'soda', 'apple', 'cookie', 'pizza', 'beans'],
};
export const FOOD_KEYS = Object.keys(ITEMS).filter((k) => k !== 'medkit' && !ITEMS[k].hazard && !ITEMS[k].tool);

const shadeHex = (hex, k) => shade(hex, k);
function shade(hex, k) {
  const r = Math.min(255, ((hex >> 16) & 255) * k), g = Math.min(255, ((hex >> 8) & 255) * k), b = Math.min(255, (hex & 255) * k);
  return (r << 16) | (g << 8) | b;
}

// Parts that are a different material from the rest of the piece.
const PART_SURF = {
  [METAL]: SURF.metal, [DARK]: SURF.plastic, 0xa47c55: SURF.wood, 0x6e4a2f: SURF.wood, 0x8f8a82: SURF.concrete,
  0x8fa7b8: SURF.fabric, 0xc9a56a: SURF.card, 0xd8cfa8: SURF.card,
  0xd8d2c4: SURF.plastic, 0x9a5b3a: SURF.plastic, 0x5b3b25: SURF.wood,
  [GLASS]: SURF.plastic, [CLOTH]: SURF.fabric, [EMBER]: SURF.glow, [SCREEN_OFF]: SURF.plastic, 0x1d3550: SURF.plastic,
  0x101428: SURF.plastic, 0x6fb3e0: SURF.plastic, 0x5d9e4a: SURF.plastic, 0xfff2a8: SURF.plastic, 0xe8f4fb: SURF.plastic,
  [LEAF[0]]: SURF.fabric, [LEAF[1]]: SURF.fabric, [LEAF[2]]: SURF.fabric, 0x4a3420: SURF.card, 0x5b4a2a: SURF.wood,
  0x111111: SURF.plastic, 0xf7f7f2: SURF.plastic, 0xf7f7f5: SURF.plastic, 0x55575c: SURF.steel, 0x6b6f75: SURF.steel,
  0x8a8f96: SURF.steel, 0xd4af37: SURF.metal, 0x8a6440: SURF.wood, 0x1a1c20: SURF.plastic, 0x3a3c40: SURF.steel,
  0x1d1f24: SURF.plastic, 0xfff4d6: SURF.plastic, 0xece8e0: SURF.plastic, 0x2a2420: SURF.concrete,
  0xd9e6ee: SURF.metal, 0xf2fbff: SURF.metal, 0xfff2c4: SURF.plastic, 0xf2ead8: SURF.paint, 0xe9e3d3: SURF.paint,
  0xd62c2c: SURF.plastic,
};

const geoCache = new Map();
// state: a piece's switch (item.s): 1 = a door standing open, a TV or arcade
// machine switched on, a record on the turntable; a light strip's colour
// (0 = off, 1..6). Other pieces look the same either way.
export const hasState = (type) => { const u = TYPES[type] && TYPES[type].use; return u === 'door' || u === 'tv' || u === 'strip' || u === 'colour' || u === 'music'; };
export function furnitureGeometry(type, variant, state = 0) {
  // light strips have 7 states (off + 6 colours); everything else is on or off
  const u = TYPES[type] && TYPES[type].use;
  const st = state && hasState(type) ? (u === 'strip' || u === 'colour' ? Math.max(0, Math.min(6, state | 0)) : u === 'tv' && !TYPES[type].game ? Math.max(1, Math.min(TV_CHANNELS, state | 0)) : 1) : 0;
  const key = type + ':' + variant + ':' + st;
  let g = geoCache.get(key);
  if (!g) {
    const t = TYPES[type];
    const b = new GeoBuilder();
    b.mat = SURF[t.m || 'wood'];
    b.matOf = (hex) => PART_SURF[hex] ?? null;
    t.build(b, t.cols[variant % t.cols.length], st);
    g = b.build();
    geoCache.set(key, g);
  }
  return g;
}

export function itemGeometry(kind) {
  const key = 'item:' + kind;
  let g = geoCache.get(key);
  if (!g) {
    const it = ITEMS[kind], b = new GeoBuilder();
    b.mat = kind === 'glass' ? SURF.plastic : ['chips', 'chocolate', 'cookie', 'pastry', 'donut', 'burger', 'hotdog', 'pizza', 'cinnamon', 'crackers'].includes(kind) ? SURF.paint : SURF.plastic;
    const c = it.color;
    switch (kind) {
      case 'medkit': b.box(0, 0.07, 0, 0.3, 0.14, 0.2, c); b.box(0, 0.141, 0, 0.1, 0.004, 0.03, 0xf5f5f5); b.box(0, 0.141, 0, 0.03, 0.004, 0.1, 0xf5f5f5); b.box(0, 0.16, 0, 0.12, 0.02, 0.03, 0x555555); break;
      case 'apple': case 'orange': b.cyl(0, 0, 0, 0.045, 0.085, c, 8, 0.035); b.box(0, 0.095, 0, 0.01, 0.025, 0.01, 0x5b3b25); break;
      case 'banana': b.box(-0.05, 0.025, 0.01, 0.1, 0.045, 0.045, c); b.box(0.05, 0.03, -0.005, 0.1, 0.045, 0.045, c); b.box(0.105, 0.04, -0.012, 0.02, 0.02, 0.02, 0x5b4a1e); break;
      case 'burger': b.cyl(0, 0, 0, 0.065, 0.025, 0xd9a35e, 10); b.cyl(0, 0.025, 0, 0.068, 0.02, 0x5a3420, 10); b.cyl(0, 0.045, 0, 0.069, 0.008, 0x6aa84f, 10); b.cyl(0, 0.053, 0, 0.065, 0.035, 0xd9a35e, 10, 0.05); break;
      case 'hotdog': b.box(0, 0.025, 0, 0.2, 0.04, 0.06, 0xe9c48a); b.box(0, 0.04, 0, 0.22, 0.03, 0.03, 0xa9442f); b.box(0, 0.056, 0, 0.16, 0.006, 0.01, 0xe8c547); break;
      case 'pizza': b.box(0, 0.012, 0, 0.25, 0.024, 0.16, 0xe8b45a); b.box(0, 0.026, 0, 0.22, 0.006, 0.13, 0xc0392b); for (let i = 0; i < 4; i++) b.box(-0.08 + i * 0.05, 0.031, (i % 2) * 0.04 - 0.02, 0.025, 0.004, 0.025, 0x8e2b1f); break;
      case 'stew': b.cyl(0, 0, 0, 0.06, 0.07, c, 12, 0.09); b.cyl(0, 0.07, 0, 0.082, 0.004, 0x8a4b2a, 12); break;
      case 'chips': b.box(0, 0.12, 0, 0.18, 0.24, 0.06, c); b.box(0, 0.12, 0.031, 0.1, 0.08, 0.002, 0xc0392b); break;
      case 'donut': b.cyl(0, 0, 0, 0.055, 0.03, 0xd9a35e, 12); b.cyl(0, 0.03, 0, 0.053, 0.012, c, 12); b.cyl(0, 0.03, 0, 0.018, 0.014, 0x8a5a2b, 8); break;
      case 'pastry': b.cyl(0, 0, 0, 0.06, 0.045, c, 12, 0.055); b.cyl(0, 0.045, 0, 0.04, 0.006, 0xf2e6d0, 10); break;
      case 'cookie': b.cyl(0, 0, 0, 0.04, 0.015, c, 10); for (let i = 0; i < 4; i++) b.box(Math.cos(i * 1.6) * 0.02, 0.016, Math.sin(i * 1.6) * 0.02, 0.01, 0.004, 0.01, 0x3d2412); break;
      case 'chocolate': b.box(0, 0.0075, 0, 0.16, 0.015, 0.07, c); b.box(-0.03, 0.0076, 0, 0.1, 0.0155, 0.072, 0x8e44ad); break;
      case 'icecream': b.cyl(0, 0, 0, 0.008, 0.12, 0xd4a35e, 8, 0.035); b.cyl(0, 0.115, 0, 0.038, 0.05, c, 10, 0.02); break;
      case 'beans': b.cyl(0, 0, 0, 0.04, 0.11, 0xb7bcc2, 10); b.cyl(0, 0.02, 0, 0.041, 0.07, c, 10); break;
      case 'soda': b.cyl(0, 0, 0, 0.035, 0.13, c, 10); b.cyl(0, 0.13, 0, 0.026, 0.012, 0xcccccc, 8); break;
      case 'bigsoda': b.cyl(0, 0, 0, 0.055, 0.26, c, 10); b.cyl(0, 0.26, 0, 0.055, 0.05, c, 10, 0.02); b.cyl(0, 0.31, 0, 0.018, 0.02, 0xeeeeee, 8); b.cyl(0, 0.09, 0, 0.056, 0.08, 0xf2f2f2, 10); break;
      case 'water': b.cyl(0, 0, 0, 0.035, 0.19, c, 10); b.cyl(0, 0.19, 0, 0.035, 0.04, c, 10, 0.014); b.cyl(0, 0.23, 0, 0.015, 0.015, 0x2e86c1, 8); break;
      case 'cinnamon': b.cyl(0, 0, 0, 0.06, 0.045, c, 12, 0.055); b.cyl(0, 0.045, 0, 0.045, 0.006, 0x8a4f25, 10); b.cyl(0, 0.05, 0, 0.022, 0.006, 0xf6ead2, 8); break;
      case 'lemon': b.cyl(0, 0, 0, 0.022, 0.035, c, 10, 0.036); b.cyl(0, 0.035, 0, 0.036, 0.035, c, 10, 0.022); b.cyl(0, 0.07, 0, 0.008, 0.008, shadeHex(c, 0.8), 6); break;
      case 'lemonSlice': b.cyl(0, 0, 0, 0.035, 0.012, c, 12); b.cyl(0, 0.012, 0, 0.028, 0.002, 0xfdf3c0, 12); break;
      case 'crackers': b.box(0, 0.1, 0, 0.14, 0.2, 0.05, c); b.box(0, 0.12, 0.026, 0.09, 0.06, 0.002, 0xf39c12); b.box(0, 0.18, 0.026, 0.1, 0.02, 0.002, 0xf2f2f2); break;
      case 'torch': // an elastic headband with a little lamp on the front
        for (const sx of [-1, 1]) b.box(sx * 0.075, 0.012, 0, 0.02, 0.024, 0.12, 0x34495e);
        b.box(0, 0.012, -0.06, 0.15, 0.024, 0.02, 0x34495e); b.box(0, 0.012, 0.06, 0.15, 0.024, 0.02, 0x34495e);
        b.box(0, 0.03, 0.07, 0.07, 0.05, 0.04, c); b.cyl(0, 0.03, 0.09, 0.022, 0.006, 0xfff4d6, 10); b.box(0.03, 0.058, 0.07, 0.012, 0.008, 0.012, 0xc0392b); break;
      case 'glass': b.box(0, 0.004, 0, 0.12, 0.008, 0.06, c); b.box(0.04, 0.005, 0.03, 0.06, 0.01, 0.05, shadeHex(c, 1.08)); b.box(-0.05, 0.004, -0.03, 0.05, 0.008, 0.04, shadeHex(c, 0.95)); b.box(0.01, 0.012, -0.01, 0.03, 0.016, 0.02, 0xf2fbff); break;
      default: b.box(0, it.h / 2, 0, it.w, it.h, it.d, c);
    }
    g = b.build();
    geoCache.set(key, g);
  }
  return g;
}

// How a piece is turned. Old saves and the generated store use rot (a quarter
// turn, 0..3) and tilt (1 on its back, 2 on its side); anything a player has
// held carries o, a free rotation [x, y, z, w] (R turns it about any axis).
const _q = new THREE.Quaternion(), _qt = new THREE.Quaternion(), _up = new THREE.Vector3(0, 1, 0), _ax = new THREE.Vector3(1, 0, 0), _az = new THREE.Vector3(0, 0, 1), _p = new THREE.Vector3(), _one = new THREE.Vector3(1, 1, 1), _v = new THREE.Vector3(), _m3 = new THREE.Matrix4();
export function itemQuat(rot, tilt, o, out = new THREE.Quaternion()) {
  if (o) return out.set(o[0], o[1], o[2], o[3]).normalize();
  out.setFromAxisAngle(_up, (rot | 0) * Math.PI / 2);
  if (tilt === 1) out.multiply(_qt.setFromAxisAngle(_ax, -Math.PI / 2));
  else if (tilt === 2) out.multiply(_qt.setFromAxisAngle(_az, Math.PI / 2));
  return out;
}
// A valid o from anything (network, saves): four finite numbers, normalised.
export function cleanQuat(o) {
  if (!Array.isArray(o) || o.length !== 4) return null;
  const v = o.map((n) => +n);
  if (!v.every(Number.isFinite)) return null;
  const l = Math.hypot(v[0], v[1], v[2], v[3]);
  if (l < 0.5 || l > 2) return null;
  return v.map((n) => +(n / l).toFixed(4));
}
// The rotated corners of a local box, as [minX, minY, minZ, maxX, maxY, maxZ].
function rotBounds(q, x0, y0, z0, x1, y1, z1) {
  const r = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
  for (let i = 0; i < 8; i++) {
    _v.set(i & 1 ? x1 : x0, i & 2 ? y1 : y0, i & 4 ? z1 : z0).applyQuaternion(q);
    if (_v.x < r[0]) r[0] = _v.x; if (_v.y < r[1]) r[1] = _v.y; if (_v.z < r[2]) r[2] = _v.z;
    if (_v.x > r[3]) r[3] = _v.x; if (_v.y > r[4]) r[4] = _v.y; if (_v.z > r[5]) r[5] = _v.z;
  }
  return r;
}
const _qo = new THREE.Quaternion();
// Size of a piece as placed: [x size, height, z size] of the box around it.
export function itemDims(type, rot, tilt, o) {
  const t = TYPES[type];
  if (o) { const b = rotBounds(itemQuat(0, 0, o, _qo), -t.w / 2, 0, -t.d / 2, t.w / 2, t.h, t.d / 2); return [b[3] - b[0], b[4] - b[1], b[5] - b[2]]; }
  let sx = t.w, sy = t.h, sz = t.d;
  if (tilt === 1) { sy = t.d; sz = t.h; } else if (tilt === 2) { sx = t.h; sy = t.w; }
  if (rot & 1) { const q = sx; sx = sz; sz = q; }
  return [sx, sy, sz];
}

// The collision boxes of a piece, as placed (relative to its x/z centre and its
// base). null means one solid box (from itemDims). A piece turned to an odd
// angle is cut into thin upright strips (and layers, if it leans) so standing,
// climbing and staff paths still work with plain boxes: a leaning bookcase is
// a rough staircase.
const partsCache = new Map();
const STRIP = 0.2;
function isSquare(q) {
  _m3.makeRotationFromQuaternion(q);
  return _m3.elements.every((e, i) => (i % 4 === 3 || i >= 12) || Math.abs(e) < 1e-3 || Math.abs(Math.abs(e) - 1) < 1e-3);
}
function cutBox(q, off, x0, y0, z0, x1, y1, z1, upright, out) {
  const s = 0.07, nx = Math.max(2, Math.ceil((x1 - x0) / s) + 1), ny = Math.max(2, Math.ceil((y1 - y0) / s) + 1), nz = Math.max(2, Math.ceil((z1 - z0) / s) + 1);
  const bins = new Map();
  for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) for (let k = 0; k < nz; k++) {
    _v.set(x0 + (x1 - x0) * i / (nx - 1), y0 + (y1 - y0) * j / (ny - 1), z0 + (z1 - z0) * k / (nz - 1)).applyQuaternion(q).add(off);
    const key = Math.floor(_v.x / STRIP) * 4096 + (upright ? 0 : Math.floor(_v.y / STRIP));
    let b = bins.get(key);
    if (!b) bins.set(key, b = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity, Math.floor(_v.x / STRIP)]);
    if (_v.x < b[0]) b[0] = _v.x; if (_v.y < b[1]) b[1] = _v.y; if (_v.z < b[2]) b[2] = _v.z;
    if (_v.x > b[3]) b[3] = _v.x; if (_v.y > b[4]) b[4] = _v.y; if (_v.z > b[5]) b[5] = _v.z;
  }
  // join layers of one strip that cover the same ground
  const strips = new Map();
  for (const b of bins.values()) { let l = strips.get(b[6]); if (!l) strips.set(b[6], l = []); l.push(b); }
  const p = 0.015;
  for (const l of strips.values()) {
    l.sort((a, b) => a[1] - b[1]);
    let cur = null;
    for (const b of l) {
      if (cur && Math.abs(cur[2] - b[2]) < 0.06 && Math.abs(cur[5] - b[5]) < 0.06 && b[1] <= cur[4] + 0.1) {
        cur[0] = Math.min(cur[0], b[0]); cur[3] = Math.max(cur[3], b[3]); cur[2] = Math.min(cur[2], b[2]); cur[5] = Math.max(cur[5], b[5]); cur[4] = Math.max(cur[4], b[4]);
        continue;
      }
      if (cur) out.push(cur);
      cur = b.slice(0, 6);
    }
    if (cur) out.push(cur);
  }
  for (const b of out) if (b.length === 6 && !b.done) { b[0] -= p; b[2] -= p; b[3] += p; b[5] += p; b[1] = Math.max(0, b[1] - p); b[4] += p; b.done = true; }
}
// state: a door standing open uses its partsOpen (the doorway clear).
export function itemParts(type, rot, tilt, o, state = 0) {
  const t = TYPES[type];
  const src = state && t.partsOpen ? t.partsOpen : t.parts;
  if (!o) {
    if (!src) return null;
    return src.map(([x0, y0, z0, x1, y1, z1]) => {
      if (tilt === 1) [x0, y0, z0, x1, y1, z1] = [x0, z0 + t.d / 2, t.h / 2 - y1, x1, z1 + t.d / 2, t.h / 2 - y0];
      else if (tilt === 2) [x0, y0, z0, x1, y1, z1] = [t.h / 2 - y1, x0 + t.w / 2, z0, t.h / 2 - y0, x1 + t.w / 2, z1];
      for (let i = 0; i < (rot & 3); i++) { const nx0 = z0, nx1 = z1, nz0 = -x1, nz1 = -x0; x0 = nx0; x1 = nx1; z0 = nz0; z1 = nz1; }
      return [x0, y0, z0, x1, y1, z1];
    });
  }
  const key = type + '|' + (src === t.parts ? 0 : 1) + '|' + o.map((n) => n.toFixed(3)).join(',');
  let res = partsCache.get(key);
  if (res !== undefined) return res;
  const q = itemQuat(0, 0, o, new THREE.Quaternion());
  const whole = rotBounds(q, -t.w / 2, 0, -t.d / 2, t.w / 2, t.h, t.d / 2);
  const off = new THREE.Vector3(-(whole[0] + whole[3]) / 2, -whole[1], -(whole[2] + whole[5]) / 2);
  const local = src ? src.map((p) => [p[0], p[1], p[2], p[3], p[4], p[5]]) : null;
  // parts are stored relative to the x/z centre and base, like the mesh
  if (isSquare(q)) {
    res = local ? local.map((p) => { const b = rotBounds(q, ...p); return [b[0] + off.x, b[1] + off.y, b[2] + off.z, b[3] + off.x, b[4] + off.y, b[5] + off.z]; }) : null;
  } else {
    const upright = Math.abs(_v.set(0, 1, 0).applyQuaternion(q).y) > 0.999;
    res = [];
    for (const p of local || [[-t.w / 2, 0, -t.d / 2, t.w / 2, t.h, t.d / 2]]) {
      const out = []; cutBox(q, off, ...p, upright, out);
      for (const b of out) res.push([b[0], b[1], b[2], b[3], b[4], b[5]]);
    }
  }
  if (partsCache.size > 4000) partsCache.clear();
  partsCache.set(key, res);
  return res;
}
export function footprint(type, rot, tilt, o) { const d = itemDims(type, rot, tilt, o); return [d[0], d[2]]; }

// The model matrix for a piece standing at (x, y, z): (x, z) is the centre of
// the box around it and y its bottom.
export function itemMatrix(m4, type, x, y, z, rot, tilt, scale = 1, o = null) {
  const t = TYPES[type];
  if (!t || (!o && !tilt)) return m4.compose(_p.set(x, y, z), _q.setFromAxisAngle(_up, (rot | 0) * Math.PI / 2), _one.setScalar(scale));
  itemQuat(rot, tilt, o, _q);
  const b = rotBounds(_q, -t.w / 2, 0, -t.d / 2, t.w / 2, t.h, t.d / 2);
  return m4.compose(_p.set(x - (b[0] + b[3]) / 2 * scale, y - b[1] * scale, z - (b[2] + b[5]) / 2 * scale), _q, _one.setScalar(scale));
}

export { furnitureMaterial };
