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
  const f = z + 0.0025, d = 0.001;
  if (game) { // a bright little game screen
    g.box(x, y, f, w * 0.96, h * 0.94, d, 0x101428);
    const cols = [0xf1c40f, 0xe74c3c, 0x2ecc71, 0x3498db, 0x9b59b6];
    for (let i = 0; i < 5; i++) for (let j = 0; j < 3; j++) g.box(x - w * 0.36 + i * w * 0.18, y + h * 0.3 - j * h * 0.1, f + 0.0005, w * 0.14, h * 0.07, d, cols[(i + j) % 5]);
    g.box(x, y - h * 0.32, f + 0.0005, w * 0.22, h * 0.06, d, 0xecf0f1); g.box(x + w * 0.1, y - h * 0.12, f + 0.0005, w * 0.05, w * 0.05, d, 0xffffff);
    return;
  }
  g.box(x, y + h * 0.18, f, w * 0.96, h * 0.56, d, 0x6fb3e0); g.box(x, y - h * 0.25, f, w * 0.96, h * 0.42, d, 0x5d9e4a);
  g.box(x + w * 0.28, y + h * 0.28, f + 0.0005, w * 0.1, w * 0.1, d, 0xfff2a8);
  g.box(x - w * 0.2, y - h * 0.02, f + 0.0005, w * 0.3, h * 0.12, d, 0x3f7a3a); g.box(x - w * 0.05, y + h * 0.05, f + 0.0005, w * 0.18, h * 0.08, d, 0xe8f4fb);
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
  safe: { m: 'steel', heavy: 8, name: 'Cast-Iron Safe', w: 0.6, d: 0.6, h: 0.6, hp: 400, cols: [0x2b2e33, 0x3a4a3a, 0x4a3530], build(g, c) {
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
};

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
export const FOOD_KEYS = Object.keys(ITEMS).filter((k) => k !== 'medkit' && !ITEMS[k].hazard);

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
  [GLASS]: SURF.plastic, [CLOTH]: SURF.fabric, [EMBER]: SURF.paint, [SCREEN_OFF]: SURF.plastic, 0x1d3550: SURF.plastic,
  0x101428: SURF.plastic, 0x6fb3e0: SURF.plastic, 0x5d9e4a: SURF.plastic, 0xfff2a8: SURF.plastic, 0xe8f4fb: SURF.plastic,
  [LEAF[0]]: SURF.fabric, [LEAF[1]]: SURF.fabric, [LEAF[2]]: SURF.fabric, 0x4a3420: SURF.card, 0x5b4a2a: SURF.wood,
  0x111111: SURF.plastic, 0xf7f7f2: SURF.plastic, 0xf7f7f5: SURF.plastic, 0x55575c: SURF.steel, 0x6b6f75: SURF.steel,
  0x8a8f96: SURF.steel, 0xd4af37: SURF.metal, 0x8a6440: SURF.wood, 0x1a1c20: SURF.plastic, 0x3a3c40: SURF.steel,
  0x1d1f24: SURF.plastic, 0xfff4d6: SURF.plastic, 0xece8e0: SURF.plastic, 0x2a2420: SURF.concrete,
};

const geoCache = new Map();
// state: a piece's switch (item.s): 1 = a door standing open, a TV or arcade
// machine switched on. Other pieces look the same either way.
export const hasState = (type) => { const u = TYPES[type] && TYPES[type].use; return u === 'door' || u === 'tv'; };
export function furnitureGeometry(type, variant, state = 0) {
  const st = state && hasState(type) ? 1 : 0;
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
