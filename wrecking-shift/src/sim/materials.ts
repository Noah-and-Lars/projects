/**
 * Material + palette table.
 *
 * A voxel is one byte: palette index. 0 = empty.
 * index = (materialId << 3) | shade      (materialId 1..31, shade 0..7)
 *   shade 0..4 : normal colour variations
 *   shade 5    : spray-painted
 *   shade 6..7 : scorched (burnt / blast-blackened) variants
 */
export const enum Hardness {
  Soft = 0,
  Medium = 1,
  Hard = 2,
  Unbreakable = 3,
}

export type AudioGroup = 'wood' | 'masonry' | 'metal' | 'glass' | 'dirt' | 'plastic' | 'foliage' | 'ice';

export interface MaterialDef {
  id: number;
  name: string;
  hardness: Hardness;
  /** kg / m^3 (gameplay-tuned, not real) */
  density: number;
  /** 0 = never burns, 1 = ignites instantly */
  flammability: number;
  /** how many fire ticks a voxel of this lasts before being consumed (0 = n/a) */
  burnTime: number;
  audio: AudioGroup;
  /** base colour 0xRRGGBB */
  color: number;
  /** brightness jitter of the shade variants (0..1) */
  variance: number;
  /** emissive strength (lamps, embers) */
  emissive?: number;
  /** translucent-ish look (glass) */
  glass?: boolean;
  /** explodes when broken */
  explosive?: number;
  friction?: number;
  /** compressive strength in MPa for the structural crush check (default by hardness) */
  strength?: number;
}

const defs: Omit<MaterialDef, 'id'>[] = [
  /* 0 */ { name: 'air', hardness: Hardness.Soft, density: 0, flammability: 0, burnTime: 0, audio: 'dirt', color: 0, variance: 0 },
  /* 1 */ { name: 'grass', hardness: Hardness.Soft, density: 900, flammability: 0.25, burnTime: 40, audio: 'foliage', color: 0x5d9440, variance: 0.14 },
  /* 2 */ { name: 'dirt', hardness: Hardness.Medium, density: 1300, flammability: 0, burnTime: 0, audio: 'dirt', color: 0x7a5a3c, variance: 0.1 },
  /* 3 */ { name: 'wood', hardness: Hardness.Soft, density: 550, flammability: 0.6, burnTime: 90, audio: 'wood', color: 0xa9783f, variance: 0.12 },
  /* 4 */ { name: 'plaster', hardness: Hardness.Soft, density: 700, flammability: 0.05, burnTime: 60, audio: 'masonry', color: 0xe6dfd0, variance: 0.05 },
  /* 5 */ { name: 'glass', hardness: Hardness.Soft, density: 500, flammability: 0, burnTime: 0, audio: 'glass', color: 0x9fd4e0, variance: 0.04, glass: true, strength: 0.25 },
  /* 6 */ { name: 'plastic', hardness: Hardness.Soft, density: 350, flammability: 0.45, burnTime: 50, audio: 'plastic', color: 0xd8483a, variance: 0.05 },
  /* 7 */ { name: 'brick', hardness: Hardness.Medium, density: 1500, flammability: 0, burnTime: 0, audio: 'masonry', color: 0xa9503a, variance: 0.13 },
  /* 8 */ { name: 'concrete', hardness: Hardness.Hard, density: 2000, flammability: 0, burnTime: 0, audio: 'masonry', color: 0x9a9a96, variance: 0.06 },
  /* 9 */ { name: 'sheetmetal', hardness: Hardness.Medium, density: 1100, flammability: 0, burnTime: 0, audio: 'metal', color: 0x8d99a3, variance: 0.06 },
  /* 10 */ { name: 'steel', hardness: Hardness.Hard, density: 3000, flammability: 0, burnTime: 0, audio: 'metal', color: 0x4d555e, variance: 0.05, strength: 30 },
  /* 11 */ { name: 'rock', hardness: Hardness.Hard, density: 2300, flammability: 0, burnTime: 0, audio: 'masonry', color: 0x77736c, variance: 0.12 },
  /* 12 */ { name: 'bedrock', hardness: Hardness.Unbreakable, density: 3000, flammability: 0, burnTime: 0, audio: 'masonry', color: 0x4a4744, variance: 0.08 },
  /* 13 */ { name: 'asphalt', hardness: Hardness.Hard, density: 2000, flammability: 0, burnTime: 0, audio: 'masonry', color: 0x3c3d41, variance: 0.06 },
  /* 14 */ { name: 'leaves', hardness: Hardness.Soft, density: 150, flammability: 0.8, burnTime: 25, audio: 'foliage', color: 0x3f7d3a, variance: 0.2, strength: 0.05 },
  /* 15 */ { name: 'fabric', hardness: Hardness.Soft, density: 200, flammability: 0.8, burnTime: 35, audio: 'foliage', color: 0x3d6fb0, variance: 0.06 },
  /* 16 */ { name: 'gold', hardness: Hardness.Medium, density: 2500, flammability: 0, burnTime: 0, audio: 'metal', color: 0xf2c230, variance: 0.08, emissive: 0.15 },
  /* 17 */ { name: 'explosive', hardness: Hardness.Soft, density: 600, flammability: 1, burnTime: 6, audio: 'metal', color: 0xd22a1e, variance: 0.03, explosive: 1.6 },
  /* 18 */ { name: 'lamp', hardness: Hardness.Soft, density: 400, flammability: 0, burnTime: 0, audio: 'glass', color: 0xfff1c0, variance: 0.0, emissive: 1 },
  /* 19 */ { name: 'tile', hardness: Hardness.Medium, density: 1400, flammability: 0, burnTime: 0, audio: 'masonry', color: 0xb5553c, variance: 0.1 },
  /* 20 */ { name: 'sand', hardness: Hardness.Soft, density: 1400, flammability: 0, burnTime: 0, audio: 'dirt', color: 0xd9c38a, variance: 0.07 },
  /* 21 */ { name: 'snow', hardness: Hardness.Soft, density: 300, flammability: 0, burnTime: 0, audio: 'dirt', color: 0xf2f5f8, variance: 0.03 },
  /* 22 */ { name: 'ice', hardness: Hardness.Soft, density: 900, flammability: 0, burnTime: 0, audio: 'ice', color: 0xbfe6f2, variance: 0.04, glass: true, friction: 0.05 },
  /* 23 */ { name: 'rubber', hardness: Hardness.Soft, density: 900, flammability: 0.3, burnTime: 80, audio: 'plastic', color: 0x1f1f22, variance: 0.04 },
  /* 24 */ { name: 'paintedmetal', hardness: Hardness.Medium, density: 1100, flammability: 0, burnTime: 0, audio: 'metal', color: 0xe0a020, variance: 0.04 },
  /* 25 */ { name: 'electronics', hardness: Hardness.Soft, density: 800, flammability: 0.2, burnTime: 40, audio: 'plastic', color: 0x2c3a35, variance: 0.1, emissive: 0.1 },
  /* 26 */ { name: 'char', hardness: Hardness.Soft, density: 250, flammability: 0, burnTime: 0, audio: 'wood', color: 0x1c1917, variance: 0.25 },
  /* 27 */ { name: 'alarmbox', hardness: Hardness.Soft, density: 800, flammability: 0, burnTime: 0, audio: 'metal', color: 0xf04a2a, variance: 0.02, emissive: 0.5 },
  /* 28 */ { name: 'wire', hardness: Hardness.Soft, density: 400, flammability: 0.1, burnTime: 20, audio: 'plastic', color: 0xe8d020, variance: 0.02 },
  /* 29 */ { name: 'whitepaint', hardness: Hardness.Hard, density: 2000, flammability: 0, burnTime: 0, audio: 'masonry', color: 0xe8e8e2, variance: 0.03 },
  /* 30 */ { name: 'marble', hardness: Hardness.Medium, density: 1800, flammability: 0, burnTime: 0, audio: 'masonry', color: 0xd9d4cc, variance: 0.07 },
  /* 31 */ { name: 'crate', hardness: Hardness.Soft, density: 300, flammability: 0.7, burnTime: 70, audio: 'wood', color: 0xc79a55, variance: 0.1 },
];

export const MATERIALS: MaterialDef[] = defs.map((d, id) => ({ ...d, id }));

export const MAT = {
  air: 0, grass: 1, dirt: 2, wood: 3, plaster: 4, glass: 5, plastic: 6, brick: 7, concrete: 8,
  sheetmetal: 9, steel: 10, rock: 11, bedrock: 12, asphalt: 13, leaves: 14, fabric: 15, gold: 16,
  explosive: 17, lamp: 18, tile: 19, sand: 20, snow: 21, ice: 22, rubber: 23, paintedmetal: 24,
  electronics: 25, char: 26, alarmbox: 27, wire: 28, whitepaint: 29, marble: 30, crate: 31,
} as const;

export const SHADE_PAINT = 5;
export const SHADE_SCORCH = 6;

/** palette index for material + shade */
export const pal = (mat: number, shade = 0): number => (mat << 3) | (shade & 7);
export const matOf = (p: number): number => p >> 3;
export const shadeOf = (p: number): number => p & 7;
export const isScorched = (p: number): boolean => (p & 7) >= SHADE_SCORCH;

/** Precomputed per-palette-index lookup tables (hot paths). */
export const PAL_HARDNESS = new Uint8Array(256);
export const PAL_DENSITY = new Float32Array(256);
export const PAL_FLAMMABILITY = new Float32Array(256);
/** linear-ish RGB 0..1, 3 floats per palette index */
export const PAL_RGB = new Float32Array(256 * 3);
export const PAL_EMISSIVE = new Float32Array(256);
export const PAL_GLASS = new Uint8Array(256);
/** explosion size when a voxel of this palette index is broken (0 = inert) */
export const PAL_EXPLOSIVE = new Float32Array(256);
/** load (newtons) one voxel of this palette index can carry before it is crushed */
export const PAL_STRENGTH = new Float64Array(256);

export let SPRAY_COLOR = 0xf2e530;

function buildPalette() {
  for (let p = 0; p < 256; p++) {
    const m = MATERIALS[p >> 3];
    const s = p & 7;
    PAL_HARDNESS[p] = m.hardness;
    PAL_DENSITY[p] = m.density;
    PAL_FLAMMABILITY[p] = s >= SHADE_SCORCH ? m.flammability * 0.5 : m.flammability;
    PAL_EMISSIVE[p] = s >= SHADE_SCORCH ? 0 : m.emissive ?? 0;
    PAL_GLASS[p] = m.glass ? 1 : 0;
    PAL_EXPLOSIVE[p] = m.explosive ?? 0;
    const mpa = m.strength ?? [1.2, 4, 12, 1e9][m.hardness];
    PAL_STRENGTH[p] = mpa * 1e6 * 0.01;
    let r = ((m.color >> 16) & 255) / 255;
    let g = ((m.color >> 8) & 255) / 255;
    let b = (m.color & 255) / 255;
    if (s <= 4) {
      // shade 0..4 -> brightness offsets -1..1 * variance, slight hue wobble
      const k = 1 + ((s - 2) / 2) * m.variance;
      r *= k; g *= k * (1 + (s % 2 ? 0.02 : -0.02) * (m.variance > 0.08 ? 1 : 0)); b *= k;
    } else if (s === SHADE_PAINT) {
      r = ((SPRAY_COLOR >> 16) & 255) / 255;
      g = ((SPRAY_COLOR >> 8) & 255) / 255;
      b = (SPRAY_COLOR & 255) / 255;
    } else {
      // soot in two steps (6 = light, 7 = heavy). It used to be 22 % / 14 % of the colour: blast marks read as
      // black holes. The genre reference soots in gradual tint steps; the surface stays recognisable.
      const k = s === 6 ? 0.5 : 0.27;
      const grey = (r + g + b) / 3;
      r = (r * 0.5 + grey * 0.5) * k; g = (g * 0.5 + grey * 0.5) * k; b = (b * 0.5 + grey * 0.5) * k;
    }
    PAL_RGB[p * 3] = Math.min(1, r);
    PAL_RGB[p * 3 + 1] = Math.min(1, g);
    PAL_RGB[p * 3 + 2] = Math.min(1, b);
  }
}
buildPalette();

/** scorched version of a palette index (keeps the material). */
export function scorch(p: number, alt = 0): number {
  if (p === 0) return 0;
  return (p & ~7) | (SHADE_SCORCH + (alt & 1));
}
export function painted(p: number): number {
  if (p === 0) return 0;
  return (p & ~7) | SHADE_PAINT;
}

export const VOXEL = 0.1;
