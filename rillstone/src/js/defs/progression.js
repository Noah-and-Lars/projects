// Progression data (BUILD_BRIEF 3.5, 3.6): Machine Shop blueprints and the
// Rillstone Pumphouse's five restoration stages.
//
// A blueprint is bought once with Scrip (gated by Guild Standing); each build
// then takes ingots placed on the Machine Shop counter. The brief's ingot
// amounts (e.g. 600 kg iron + 80 kg glimmerite for a Mk II sluice) are scaled
// to a fifth so the first Mk II arrives in the mid game; see NOTES.md.
export const BLUEPRINTS = [
  // Mk II (★ 4): the gravel bed.
  { id: 'steelpick', name: 'Steel Pick', tier: 2, bp: 300, ingots: { iron: 15 }, spawn: 'pick', data: { tier: 2, name: 'Steel Pick' }, desc: 'Breaks the gravel bed (band 2) fast.' },
  { id: 'drill2', name: 'Drill Mk II', tier: 2, bp: 700, ingots: { iron: 150, glimmerite: 10 }, spawn: 'crate', data: { def: 'drill2', family: 'extraction' }, desc: 'Band ≤ 2, a load every 4 s, 30 L/s. Its tip reaches 6.5 m: the gravel bed from the surface.' },
  { id: 'sluice2', name: 'Sluice Box Mk II', tier: 2, bp: 900, ingots: { iron: 120, glimmerite: 15 }, spawn: 'crate', data: { def: 'sluice2', family: 'water' }, desc: 'Washes band ≤ 2 loads every 3 s, 25 L/s.' },
  { id: 'intake2', name: 'River Intake Mk II', tier: 2, bp: 600, ingots: { copper: 60 }, spawn: 'crate', data: { def: 'intake2', family: 'water' }, desc: 'Draws 90 L/s.' },
  // Mk III (★ 12): slate.
  { id: 'glimmerpick', name: 'Glimmer Pick', tier: 3, bp: 900, ingots: { glimmerite: 6 }, spawn: 'pick', data: { tier: 3, name: 'Glimmer Pick' }, desc: 'Breaks slate (band 3).' },
  { id: 'pipe_glimmer', name: 'Glimmer Pipe · 10 m coil', tier: 3, bp: 1000, ingots: { glimmerite: 8 }, spawn: 'coil', data: { tier: 'glimmer', m: 10 }, desc: 'Carries 300 L/s.' },
  { id: 'intake3', name: 'River Intake Mk III', tier: 3, bp: 1400, ingots: { copper: 80, glimmerite: 10 }, spawn: 'crate', data: { def: 'intake3', family: 'water' }, desc: 'Draws 160 L/s.' },
  { id: 'drill3', name: 'Drill Mk III', tier: 3, bp: 2200, ingots: { glimmerite: 40, emberite: 10 }, spawn: 'crate', data: { def: 'drill3', family: 'extraction' }, desc: 'Band ≤ 3, a load every 3.5 s, 45 L/s. Tip 9 m down: stand it in a pit or on a low terrace for slate.' },
  { id: 'sluice3', name: 'Sluice Box Mk III', tier: 3, bp: 2200, ingots: { glimmerite: 100, emberite: 40 }, spawn: 'crate', data: { def: 'sluice3', family: 'water' }, desc: 'Washes band ≤ 3 loads every 2 s, 40 L/s.' },
  // Mk IV (★ 24): basalt, Ember Seam only.
  { id: 'embershovel', name: 'Ember Shovel', tier: 4, bp: 2500, ingots: { emberite: 8 }, spawn: 'shovel', data: { tier: 4, cap: 3, name: 'Ember Shovel' }, desc: 'Cuts basalt (band 4). Holds 3 loads.' },
  { id: 'emberpick', name: 'Ember Pick', tier: 4, bp: 2500, ingots: { emberite: 6 }, spawn: 'pick', data: { tier: 4, name: 'Ember Pick' }, desc: 'Breaks basalt (band 4).' },
  { id: 'drill4', name: 'Drill Mk IV', tier: 4, bp: 4000, ingots: { emberite: 60, glimmerite: 40 }, spawn: 'crate', data: { def: 'drill4', family: 'extraction' }, desc: 'Band ≤ 4, a load every 3 s, 60 L/s. Ember Seam only.' },
  { id: 'sluice4', name: 'Sluice Box Mk IV', tier: 4, bp: 4000, ingots: { emberite: 60 }, spawn: 'crate', data: { def: 'sluice4', family: 'water' }, desc: 'Washes basalt loads every 1.6 s, 55 L/s.' },
];

// Each stage takes its whole list (delivered over as many trips as you
// like) at the Pumphouse counter. Needs: { kind: 'ingot'|'cut'|'crafted'|'relic', material?, kg?, n? }.
export const PUMP_STAGES = [
  { name: 'Foundations', text: 'Re-lay the footings and the wheel race', needs: [{ kind: 'ingot', material: 'iron', kg: 250 }, { kind: 'ingot', material: 'copper', kg: 150 }], reward: 2000, standing: 3 },
  { name: 'The governor', text: 'Refit the brass governor and the gear train', needs: [{ kind: 'relic', n: 1 }, { kind: 'ingot', material: 'silver', kg: 100 }], reward: 4000, standing: 4 },
  { name: 'The great wheel', text: 'Hang the new wheel and gild its bearings', needs: [{ kind: 'ingot', material: 'gold', kg: 80 }, { kind: 'cut', n: 10 }], reward: 6000, standing: 5 },
  { name: 'Glimmer lining', text: 'Line the pump barrels with glimmerite', needs: [{ kind: 'ingot', material: 'glimmerite', kg: 50 }], reward: 9000, standing: 6 },
  { name: 'The ember heart', text: 'Light the ember boiler and set the chalices on the mantel', needs: [{ kind: 'ingot', material: 'emberite', kg: 40 }, { kind: 'crafted', craft: 'chalice', n: 3 }], reward: 15000, standing: 8 },
];
export const needKey = (n) => `${n.kind}:${n.material || n.craft || ''}`;
export const needLabel = (n, MATERIALS) => n.kind === 'relic' ? 'The brass governor (Old Cut relic)'
  : n.kind === 'ingot' ? `${n.kg} kg ${MATERIALS[n.material].name.toLowerCase()} ingots`
  : n.kind === 'cut' ? `${n.n} cut gems` : `${n.n} ${n.craft}s (any metal)`;
// Does an entity count toward a need?
export function needMatches(n, e) {
  if (n.kind === 'relic') return e.type === 'relic';
  const it = e.item; if (!it) return false;
  if (n.kind === 'ingot') return it.stage === 'ingot' && it.material === n.material;
  if (n.kind === 'cut') return it.stage === 'cut';
  if (n.kind === 'crafted') return it.stage === 'crafted' && (!n.craft || it.craft === n.craft);
  return false;
}
