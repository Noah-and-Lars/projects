// Materials, values and loot tables (BUILD_BRIEF 3.3). Weights in kg.
export const MATERIALS = {
  copper:     { name: 'Copper',     kind: 'metal', ore: 6,   refined: 8,   color: 0xc8703a, ingot: 0xd88a6a, metal: 0.75 },
  iron:       { name: 'Iron',       kind: 'metal', ore: 8,   refined: 11,  color: 0x8a7a70, ingot: 0x4a5058, metal: 0.6 },
  silver:     { name: 'Silver',     kind: 'metal', ore: 18,  refined: 23,  color: 0xb8bcc0, ingot: 0xeef0f2, metal: 0.9 },
  gold:       { name: 'Gold',       kind: 'metal', ore: 30,  refined: 36,  color: 0xe8b830, ingot: 0xd8a020, metal: 0.95 },
  glimmerite: { name: 'Glimmerite', kind: 'metal', ore: 140, refined: 170, color: 0x7a6ae0, ingot: 0x8a60e8, metal: 0.4, glow: 0.35 },
  emberite:   { name: 'Emberite',   kind: 'metal', ore: 200, refined: 240, color: 0x2a1a1a, ingot: 0xff4a20, metal: 0.3, glow: 0.18, cracks: 0xff4020 },
  quartz:     { name: 'Quartz',     kind: 'fuel',  ore: 0,   refined: 0,   color: 0xf0eee8, metal: 0.05 },
  garnet:     { name: 'Garnet',     kind: 'gem',   ore: 14,  refined: 26,  color: 0xb0203a, metal: 0.1 },
  peridot:    { name: 'Peridot',    kind: 'gem',   ore: 16,  refined: 28,  color: 0x7ab830, metal: 0.1 },
  aquamarine: { name: 'Aquamarine', kind: 'gem',   ore: 20,  refined: 32,  color: 0x8ad0e0, metal: 0.1 },
  starstone:  { name: 'Starstone',  kind: 'gem',   ore: 160, refined: 260, color: 0x1a2a6a, metal: 0.2, sparkle: true },
};
export const STAGE_NAMES = { ore: 'Ore', ingot: 'Ingot', uncut: 'Uncut', cut: 'Cut', crafted: 'Crafted' };

// Loot table per band, in percent (BUILD_BRIEF 3.3). 'gem' splits into
// garnet 50 / peridot 35 / aquamarine 15. Band-1 Glimmerite only drops from
// the pan.
export const LOOT = {
  1: { copper: 46, iron: 32, silver: 8, gold: 4, quartz: 6, gem: 3.9, glimmerite: 0.1, emberite: 0, starstone: 0.01 },
  2: { copper: 34, iron: 30, silver: 14, gold: 8, quartz: 6, gem: 5.5, glimmerite: 2.4, emberite: 0, starstone: 0.1 },
  3: { copper: 24, iron: 26, silver: 16, gold: 12, quartz: 8, gem: 7, glimmerite: 5, emberite: 1.9, starstone: 0.1 },
  4: { copper: 18, iron: 22, silver: 14, gold: 14, quartz: 8, gem: 8, glimmerite: 6, emberite: 9.9, starstone: 0.1 },
};
export const GEM_SPLIT = { garnet: 50, peridot: 35, aquamarine: 15 };
// Median nugget weight by depth (m): grows with depth (BUILD_BRIEF 3.3).
export const WEIGHT_MEDIANS = [[0, 0.3], [6, 1.5], [14, 2.5], [22, 3.2], [28, 4]];
export const WEIGHT_SIGMA = 0.5;
export const KG_MIN = 0.05, KG_MAX = 25;

export function medianKg(depth) {
  const W = WEIGHT_MEDIANS;
  if (depth <= W[0][0]) return W[0][1];
  for (let i = 1; i < W.length; i++) if (depth <= W[i][0]) { const [d0, m0] = W[i - 1], [d1, m1] = W[i]; return m0 + (m1 - m0) * (depth - d0) / (d1 - d0); }
  return W[W.length - 1][1];
}

// value = baseValue[material][stage] x kg x craftMultiplier; gems superlinear.
export const CRAFT_MULT = { toolhead: 1.1, ring: 1.15, chain: 1.2, chalice: 1.3 };
export function itemValue(it) {
  const m = MATERIALS[it.material];
  if (!m) return 0;
  const refined = it.stage === 'ingot' || it.stage === 'cut' || it.stage === 'crafted';
  const base = refined ? m.refined : m.ore;
  let v = m.kind === 'gem' ? base * Math.pow(it.kg, 1.15) : base * it.kg;
  if (it.stage === 'crafted') v *= CRAFT_MULT[it.craft] || 1;
  if (it.gem) v += itemValue(it.gem) * 1.1;
  return v;
}
export function itemName(it) {
  const m = MATERIALS[it.material];
  if (!m) return it.material;
  if (m.kind === 'gem') return `${it.stage === 'cut' ? 'Cut' : 'Uncut'} ${m.name.toLowerCase()}`;
  if (m.kind === 'fuel') return `${m.name} shard`;
  if (it.stage === 'ingot') return `${m.name} ingot`;
  return `${m.name} nugget`;
}
