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
  // Alloys: poured from a furnace holding two metals (see ALLOYS below).
  // `refined` is the $/kg of a fine pour at the ideal mix; a real ingot's
  // value comes from its own mix and grade (alloyPerKg).
  millbrass:   { name: 'Millbrass',   kind: 'alloy', ore: 0, refined: 0, color: 0xc89a48, ingot: 0xd8b060, metal: 0.8 },
  rosegold:    { name: 'Rose gold',   kind: 'alloy', ore: 0, refined: 0, color: 0xe0907a, ingot: 0xe8a08a, metal: 0.9 },
  electrum:    { name: 'Electrum',    kind: 'alloy', ore: 0, refined: 0, color: 0xe0d090, ingot: 0xece0a0, metal: 0.92 },
  moonsilver:  { name: 'Moonsilver',  kind: 'alloy', ore: 0, refined: 0, color: 0xb0b8f0, ingot: 0xc8ccff, metal: 0.85, glow: 0.12 },
  cindersteel: { name: 'Cindersteel', kind: 'alloy', ore: 0, refined: 0, color: 0x5a3a34, ingot: 0x8a4a3a, metal: 0.6, glow: 0.1 },
};
// Alloy recipes: two metals melted together in one furnace. `a` is the main
// metal and `ideal` its share of the mix. How close the pour is to the ideal
// sets its grade, and the grade sets the premium over the metals' own worth.
export const ALLOYS = {
  millbrass:   { a: 'copper', b: 'iron',       ideal: 0.6 },
  rosegold:    { a: 'gold',   b: 'copper',     ideal: 0.75 },
  electrum:    { a: 'gold',   b: 'silver',     ideal: 0.5 },
  moonsilver:  { a: 'silver', b: 'glimmerite', ideal: 0.7 },
  cindersteel: { a: 'iron',   b: 'emberite',   ideal: 0.7 },
};
// Fine: within 5 points of the ideal share; good: within 15; rough: anything else.
export const ALLOY_GRADES = { fine: { name: 'Fine', mult: 1.25, within: 0.05 }, good: { name: 'Good', mult: 1.12, within: 0.15 }, rough: { name: 'Rough', mult: 1, within: 1 } };
// The alloy two metals make, or null.
export function alloyOf(m1, m2) {
  for (const [id, r] of Object.entries(ALLOYS)) if ((r.a === m1 && r.b === m2) || (r.a === m2 && r.b === m1)) return id;
  return null;
}
// Grade of a mix ({ metal: kg or share }) for an alloy.
export function alloyGrade(alloy, mix) {
  const r = ALLOYS[alloy], tot = (mix?.[r.a] || 0) + (mix?.[r.b] || 0);
  if (!(tot > 0)) return 'rough';
  const off = Math.abs((mix[r.a] || 0) / tot - r.ideal);
  return off <= ALLOY_GRADES.fine.within + 1e-9 ? 'fine' : off <= ALLOY_GRADES.good.within + 1e-9 ? 'good' : 'rough';
}
// $/kg of an alloy ingot from its mix (shares) and grade.
export function alloyPerKg(alloy, mix, grade) {
  const r = ALLOYS[alloy]; if (!r) return 0;
  const sa = mix && (mix[r.a] || mix[r.b]) ? (mix[r.a] || 0) / ((mix[r.a] || 0) + (mix[r.b] || 0)) : r.ideal;
  return (sa * MATERIALS[r.a].refined + (1 - sa) * MATERIALS[r.b].refined) * (ALLOY_GRADES[grade]?.mult || 1);
}
for (const id in ALLOYS) MATERIALS[id].refined = Math.round(alloyPerKg(id, null, 'fine') * 10) / 10;
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
export const CRAFT_MULT = { toolhead: 1.1, ring: 1.15, chain: 1.2, pendant: 1.25, chalice: 1.3, blade: 1.35 };
// Crafts that can have a cut gem set in.
export const GEM_CRAFTS = ['ring', 'pendant', 'chalice'];
export function itemValue(it) {
  const m = MATERIALS[it.material];
  if (!m) return 0;
  const refined = it.stage === 'ingot' || it.stage === 'cut' || it.stage === 'crafted';
  const base = m.kind === 'alloy' ? alloyPerKg(it.material, it.mix, it.grade || 'rough') : refined ? m.refined : m.ore;
  let v = m.kind === 'gem' ? base * Math.pow(it.kg, 1.15) : base * it.kg;
  if (it.stage === 'crafted') v *= CRAFT_MULT[it.craft] || 1;
  if (it.gem) v += itemValue(it.gem) * 1.1;
  return v;
}
export function itemName(it) {
  const m = MATERIALS[it.material];
  if (!m) return it.material;
  if (it.stage === 'crafted') return `${m.kind === 'alloy' ? `${ALLOY_GRADES[it.grade]?.name || 'Rough'} ${m.name.toLowerCase()}` : m.name} ${({ toolhead: 'tool head', ring: 'ring', chain: 'chain', pendant: 'pendant', chalice: 'chalice', blade: 'blade' })[it.craft] || 'piece'}${it.gem ? ' with ' + MATERIALS[it.gem.material].name.toLowerCase() : ''}`;
  if (m.kind === 'gem') return `${it.stage === 'cut' ? 'Cut' : 'Uncut'} ${m.name.toLowerCase()}`;
  if (m.kind === 'fuel') return `${m.name} shard`;
  if (m.kind === 'alloy') return `${it.hotUntil ? 'Hot ' : ''}${ALLOY_GRADES[it.grade]?.name || 'Rough'} ${m.name.toLowerCase()} ingot`;
  if (it.stage === 'ingot') return `${it.hotUntil ? 'Hot ' : ''}${m.name.toLowerCase().replace(/^./, c => c.toUpperCase())} ingot`;
  return `${m.name} nugget`;
}
