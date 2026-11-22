// Unit tests that run in Node without a browser: node tools/unit.mjs
import { mulberry32 } from '../src/js/core/rng.js';
import { rollLoot } from '../src/js/sim/loot.js';
import { LOOT, GEM_SPLIT, itemValue } from '../src/js/defs/materials.js';

let fails = 0;
const check = (ok, msg) => { console.log((ok ? 'ok   ' : 'FAIL ') + msg); if (!ok) fails++; };

// M2: 1,000 simulated band-1 pan rolls match the table within 5 points.
for (const seed of [1, 2, 3]) {
  const r = mulberry32(seed), n = 1000, count = {};
  for (let i = 0; i < n; i++) { const it = rollLoot(r, { band: 1, depth: 2, pan: true }); const k = GEM_SPLIT[it.material] !== undefined ? 'gem' : it.material; count[k] = (count[k] || 0) + 1; }
  let worst = 0, worstK = '';
  for (const k in LOOT[1]) { const got = (count[k] || 0) / n * 100, diff = Math.abs(got - LOOT[1][k]); if (diff > worst) { worst = diff; worstK = `${k} ${got.toFixed(1)}% vs ${LOOT[1][k]}%`; } }
  check(worst <= 5, `seed ${seed}: band-1 loot within ±5 pp over ${n} rolls (worst: ${worstK})`);
}
// Every band sums to 100%.
for (const b in LOOT) { const s = Object.values(LOOT[b]).reduce((a, x) => a + x, 0); check(Math.abs(s - 100) < 0.05, `band ${b} table sums to ${s.toFixed(2)}%`); }
// Weights: median grows with depth and stays in range.
{
  const r = mulberry32(9), med = (d) => { const a = []; for (let i = 0; i < 2001; i++) a.push(rollLoot(r, { band: 1, depth: d }).kg); a.sort((x, y) => x - y); return a[1000]; };
  const m0 = med(0), m6 = med(6), m28 = med(28);
  check(Math.abs(m0 - 0.3) < 0.04 && Math.abs(m6 - 1.5) < 0.15 && Math.abs(m28 - 4) < 0.4, `weight medians ${m0.toFixed(2)} / ${m6.toFixed(2)} / ${m28.toFixed(2)} kg at 0 / 6 / 28 m`);
  let ok = true; for (let i = 0; i < 5000; i++) { const k = rollLoot(r, { band: 4, depth: 28 }).kg; if (k < 0.05 || k > 25) ok = false; }
  check(ok, 'weights clamped to 0.05-25 kg');
}
// Band 1 outside the pan never gives glimmerite; veins give their material a third of the time.
{
  const r = mulberry32(5); let g = 0, v = 0;
  for (let i = 0; i < 20000; i++) if (rollLoot(r, { band: 1 }).material === 'glimmerite') g++;
  for (let i = 0; i < 6000; i++) if (rollLoot(r, { band: 2, vein: { material: 'gold' } }).material === 'gold') v++;
  check(g === 0, 'no band-1 glimmerite outside the pan');
  const share = v / 6000; // 1/3 + 2/3 * 8%
  check(Math.abs(share - (1 / 3 + 2 / 3 * 0.08)) < 0.03, `vein share of gold ${(share * 100).toFixed(1)}%`);
}
// Values: ore x kg, superlinear gems, crafted multiplier.
check(itemValue({ material: 'gold', stage: 'ore', kg: 2 }) === 60, 'gold ore 2 kg = § 60');
check(Math.abs(itemValue({ material: 'garnet', stage: 'cut', kg: 2 }) - 26 * Math.pow(2, 1.15)) < 1e-9, 'cut garnet uses kg^1.15');
check(Math.abs(itemValue({ material: 'silver', stage: 'crafted', craft: 'ring', kg: 1, gem: { material: 'garnet', stage: 'cut', kg: 1 } }) - (23 * 1.15 + 26 * 1.1)) < 1e-9, 'silver ring with garnet');
if (fails) { console.log(fails + ' failed'); process.exit(1); }
