// Deterministic heightmap island shared by the physics worker and the renderer.
import { clamp } from './math';

export interface TerrainSpec { size: number; res: number; seed: number }
export interface Terrain extends TerrainSpec {
  step: number;
  heights: Float32Array; // row-major: index = iz * res + ix
  pad: { x: number; z: number; y: number; r: number };
}

export const DEFAULT_TERRAIN: TerrainSpec = { size: 1536, res: 385, seed: 7 };

function hash2(ix: number, iz: number, seed: number): number {
  let h = Math.imul(ix, 374761393) ^ Math.imul(iz, 668265263) ^ Math.imul(seed, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function smooth(t: number) { return t * t * (3 - 2 * t); }

/** 2D value noise in [0,1]. */
export function vnoise(x: number, z: number, seed: number): number {
  const ix = Math.floor(x), iz = Math.floor(z);
  const fx = smooth(x - ix), fz = smooth(z - iz);
  const a = hash2(ix, iz, seed), b = hash2(ix + 1, iz, seed);
  const c = hash2(ix, iz + 1, seed), d = hash2(ix + 1, iz + 1, seed);
  return a + (b - a) * fx + (c - a) * fz + (a - b - c + d) * fx * fz;
}

export function fbm(x: number, z: number, seed: number, oct = 5): number {
  let s = 0, amp = 0.5, f = 1, norm = 0;
  for (let i = 0; i < oct; i++) {
    s += amp * vnoise(x * f, z * f, seed + i * 31);
    norm += amp; amp *= 0.5; f *= 2.03;
  }
  return s / norm;
}

const smoothstep = (a: number, b: number, x: number) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

/** The raw analytic height function (metres above sea level). */
export function islandHeight(x: number, z: number, seed: number, pad: Terrain['pad']): number {
  const R = 560;
  const warp = (fbm(x / 420, z / 420, seed + 100, 3) - 0.5) * 0.55;
  const r = Math.hypot(x * 1.0, z * 1.25) / R + warp;
  const land = 1 - smoothstep(0.62, 1.0, r);
  const ridges = fbm(x / 260, z / 260, seed, 5);
  const hills = Math.pow(ridges, 1.6) * 95 * smoothstep(0.15, 0.75, 1 - r);
  const rolling = (fbm(x / 70, z / 70, seed + 7, 3) - 0.5) * 6;
  let h = land * (3 + hills + rolling * land) - (1 - land) * 28;
  // Beach shelf: soften the coastline.
  if (h > -2 && h < 3) h = h * 0.7 + 0.3;
  // Flatten the Yard pad and a gentle apron around it.
  const d = Math.hypot(x - pad.x, z - pad.z);
  const t = smoothstep(pad.r, pad.r * 2.2, d);
  return pad.y * (1 - t) + h * t;
}

export function buildTerrain(spec: TerrainSpec = DEFAULT_TERRAIN): Terrain {
  const { size, res, seed } = spec;
  const step = size / (res - 1);
  const pad = { x: 0, z: 330, y: 3, r: 38 };
  const heights = new Float32Array(res * res);
  for (let iz = 0; iz < res; iz++)
    for (let ix = 0; ix < res; ix++) heights[iz * res + ix] = islandHeight(-size / 2 + ix * step, -size / 2 + iz * step, seed, pad);
  return { ...spec, step, heights, pad };
}

/** Height at a world point, bilinear between grid samples. */
export function heightAt(t: Terrain, x: number, z: number): number {
  const fx = clamp((x + t.size / 2) / t.step, 0, t.res - 1.0001);
  const fz = clamp((z + t.size / 2) / t.step, 0, t.res - 1.0001);
  const ix = Math.floor(fx), iz = Math.floor(fz);
  const ux = fx - ix, uz = fz - iz;
  const h = t.heights, n = t.res;
  const a = h[iz * n + ix], b = h[iz * n + ix + 1], c = h[(iz + 1) * n + ix], d = h[(iz + 1) * n + ix + 1];
  return a * (1 - ux) * (1 - uz) + b * ux * (1 - uz) + c * (1 - ux) * uz + d * ux * uz;
}
