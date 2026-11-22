// Loot rolls (BUILD_BRIEF 3.3): one weighted roll on the band's table per
// processed gravel load, then a lognormal weight roll whose median grows with
// depth. Inside a vein, a third of rolls give the vein's material.
import { LOOT, GEM_SPLIT, WEIGHT_SIGMA, KG_MIN, KG_MAX, medianKg, MATERIALS } from '../defs/materials.js';

function weighted(table, r) {
  let total = 0;
  for (const k in table) total += table[k];
  let x = r() * total;
  for (const k in table) { x -= table[k]; if (x < 0) return k; }
  return Object.keys(table)[0];
}

// rng: a seeded generator with .normal() (core/rng.js).
// opts: { band, depth, pan, vein: { material } | null }
export function rollLoot(rng, { band = 1, depth = 0, pan = false, vein = null } = {}) {
  let mat;
  if (vein && rng() < 1 / 3) mat = vein.material;
  else {
    const table = { ...LOOT[Math.max(1, Math.min(4, band))] };
    if (band === 1 && !pan) table.glimmerite = 0;
    mat = weighted(table, rng);
    if (mat === 'gem') mat = weighted(GEM_SPLIT, rng);
  }
  const kg = Math.min(KG_MAX, Math.max(KG_MIN, medianKg(depth) * Math.exp(WEIGHT_SIGMA * rng.normal())));
  const kind = MATERIALS[mat].kind;
  return { material: mat, stage: kind === 'gem' ? 'uncut' : 'ore', kg: Math.round(kg * 1000) / 1000 };
}
