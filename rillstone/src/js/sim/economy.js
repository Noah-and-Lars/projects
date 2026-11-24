// The economy, held by the host (BUILD_BRIEF 3.6): an abstract ledger in
// Scrip (§), market buyers that saturate during the day,
// guild contracts and claim deeds. Plain data, so it saves and syncs.
import { MATERIALS, itemValue, itemName } from '../defs/materials.js';
import { CLAIMS } from '../world/valley.js';

// What market buyers want (BUILD_BRIEF 3.6): raw ore of Y, ingots of X, cut
// gems or crafted goods. Millbrook's stalls start with raw goods; the Upper
// Falls buyer (stall 4) always wants something refined.
const RAW_WANTS = [
  { stage: 'ore', material: 'copper' }, { stage: 'ore', material: 'iron' }, { stage: 'ore', material: 'silver' },
  { stage: 'ore', material: 'gold' }, { stage: 'uncut', kind: 'gem' },
];
const REFINED_WANTS = [
  { stage: 'ingot', material: 'copper' }, { stage: 'ingot', material: 'iron' }, { stage: 'ingot', material: 'silver' },
  { stage: 'ingot', material: 'gold' }, { stage: 'cut', kind: 'gem' }, { stage: 'crafted' },
];
const CRAFT_NAMES = { toolhead: 'tool head', ring: 'ring', chain: 'chain', chalice: 'chalice' };
export const wantLabel = (w) => (w.stage === 'crafted' ? (w.material ? `${MATERIALS[w.material].name} ${CRAFT_NAMES[w.craft] || 'piece'}` : 'Crafted goods') : w.kind === 'gem' ? (w.stage === 'cut' ? 'Cut gems' : 'Uncut gems') : `${MATERIALS[w.material].name} ${w.stage === 'ore' ? 'ore' : w.stage + 's'}`);
const matches = (w, it) => it.stage === w.stage && (w.kind ? MATERIALS[it.material]?.kind === w.kind : !w.material || it.material === w.material) && (!w.craft || it.craft === w.craft);

// Contract templates, scaled by how many contracts you've finished (a
// hidden counter, `standing`; it's never shown or required for anything). kind: 'kg' (deliver kg of a
// material/stage), 'count' (items matching), 'big' (one piece over X kg), 'day' (sell § in a day).
const CRAFT_MIN_KG = 1;
function makeContract(rng, standing, id) {
  const tier = Math.min(4, 1 + Math.floor(standing / 4));
  const t = rng();
  const metal = ['copper', 'iron', 'silver', 'gold'][Math.min(3, Math.floor(rng() * (1.5 + tier)))];
  let c;
  // From tier 2, contracts ask for refined goods too (ingots, cut gems, crafts).
  if (tier >= 2 && rng() < 0.45) {
    const u = rng();
    if (u < 0.5 || tier < 3) { const kg = Math.round((10 + rng() * 15) * tier * (metal === 'gold' ? 0.4 : metal === 'silver' ? 0.6 : 1)); c = { kind: 'kg', want: { stage: 'ingot', material: metal }, target: kg, text: `Deliver ${kg} kg of ${MATERIALS[metal].name.toLowerCase()} ingots` }; }
    else if (u < 0.6) { const kg = Math.round((60 + rng() * 80) * tier * (metal === 'gold' ? 0.4 : metal === 'silver' ? 0.6 : 1) / 10) * 10; c = { kind: 'smelt', want: { material: metal }, target: kg, text: `Smelt ${kg} kg of ${metal} (pour it from a kiln or smelter)` }; }
    else if (u < 0.75) { const n = 2 + Math.floor(rng() * tier); c = { kind: 'count', want: { stage: 'cut', kind: 'gem' }, target: n, text: `Deliver ${n} cut gems` }; }
    else { const craft = ['ring', 'chain', 'chalice'][Math.floor(rng() * 3)]; c = { kind: 'count', want: { stage: 'crafted', material: metal, craft }, target: 1, text: `Deliver ${/^[aeiou]/i.test(metal) ? 'an' : 'a'} ${MATERIALS[metal].name.toLowerCase()} ${CRAFT_NAMES[craft]} (1 kg or more)` }; }
    const reward = Math.round((c.kind === 'smelt' ? c.target * MATERIALS[metal].refined * 0.25 : c.kind === 'kg' ? c.target * MATERIALS[metal].refined * 0.7 : c.want.stage === 'cut' ? c.target * 45 : 150 * tier) / 5) * 5 + 20;
    return { id, ...c, progress: 0, reward, standing: tier, done: false };
  }
  if (t < 0.4) { const kg = Math.round((6 + rng() * 10) * tier * (metal === 'gold' ? 0.4 : metal === 'silver' ? 0.6 : 1)); c = { kind: 'kg', want: { stage: 'ore', material: metal }, target: kg, text: `Deliver ${kg} kg of ${MATERIALS[metal].name.toLowerCase()} ore` }; }
  else if (t < 0.6) { const n = 2 + Math.floor(rng() * 2 * tier); c = { kind: 'count', want: { stage: 'uncut', kind: 'gem' }, target: n, text: `Deliver ${n} uncut gems` }; }
  else if (t < 0.8) { const kg = Math.round((0.8 + rng() * 0.8) * tier * 10) / 10; c = { kind: 'big', want: { stage: 'ore', material: metal }, target: kg, text: `Deliver ${/^[aeiou]/i.test(metal) ? 'an' : 'a'} ${MATERIALS[metal].name.toLowerCase()} nugget over ${kg} kg` }; }
  else { const s = Math.round((150 + rng() * 150) * tier / 10) * 10; c = { kind: 'day', target: s, text: `Sell § ${s} in one day` }; }
  const reward = Math.round((c.kind === 'day' ? c.target * 0.35 : c.kind === 'big' ? 60 * tier : c.kind === 'count' ? c.target * 25 : c.target * MATERIALS[c.want.material].ore * 0.6) / 5) * 5 + 20;
  return { id, ...c, progress: 0, reward, standing: tier, done: false };
}

export function createEconomy(rng) {
  const S = {
    scrip: 0, standing: 0, day: 1, soldToday: 0, totalEarned: 0, ledger: [],
    market: [], contracts: [], nextContract: 1, owned: ['gravel'], flags: {},
  };
  const api = { state: S };
  function rollMarket() {
    // After a few contracts, Millbrook's stalls mix in refined wants.
    const pool = S.standing >= 4 ? RAW_WANTS.concat(REFINED_WANTS.slice(0, 4)) : RAW_WANTS.slice();
    const refined = REFINED_WANTS.slice();
    const mk = (i, w) => ({ stall: i, want: w, mult: Math.round((1.05 + rng() * 0.25) * 100) / 100, sold: 0 });
    S.market = [0, 1, 2].map((i) => mk(i, pool.splice(Math.floor(rng() * pool.length), 1)[0]));
    S.market.push(mk(3, refined[Math.floor(rng() * refined.length)]));
  }
  function refillContracts() {
    S.contracts = S.contracts.filter(c => !c.done);
    // A day contract that turns up mid-day counts sales from now on.
    while (S.contracts.length < 3) { const c = makeContract(rng, S.standing, S.nextContract++); if (c.kind === 'day') c.base = S.soldToday; S.contracts.push(c); }
  }
  api.init = () => { rollMarket(); refillContracts(); };
  api.newDay = (day) => { S.day = day; S.soldToday = 0; rollMarket(); for (const c of S.contracts) if (c.kind === 'day' && !c.done) { c.progress = 0; c.base = 0; } refillContracts(); };

  // A market stall pays 105-130% of base, falling 1.5% per § 100 sold there
  // today, never below base.
  api.stallMult = (i) => { const m = S.market[i]; return m ? Math.max(1, m.mult * (1 - 0.015 * (m.sold / 100))) : 1; };
  // Who buys what: the Assay Office buys everything (ore, ingots, gems cut or
  // uncut, crafted goods) at base price. The Gem Buyer also takes gems, and
  // the market stalls pay a bonus for their want of the day.
  const isGem = (it) => MATERIALS[it.material]?.kind === 'gem';
  api.refuseReason = (it, venue) => {
    if (MATERIALS[it.material]?.kind === 'fuel') return 'Quartz is fuel, not for sale';
    if (venue === 'gems' && !isGem(it)) return 'The Gem Buyer only takes gems';
    if (typeof venue === 'number' && api.quote(it, venue) == null) return 'Not what this stall wants today';
    return null;
  };
  api.quote = (it, venue) => {
    const base = itemValue(it);
    if (venue === 'assay') return base;
    if (venue === 'gems') return isGem(it) ? base : null;
    const m = S.market[venue]; if (!m || !matches(m.want, it)) return null;
    return base * api.stallMult(venue);
  };
  // Sell a list of items (plain item data) at a venue: 'assay' or a stall index.
  api.sell = (list, venue) => {
    let total = 0; const sold = [], refused = [];
    for (const it of list) {
      const why = api.refuseReason(it, venue);
      const q = why ? null : api.quote(it, venue);
      if (q == null) { refused.push({ it, why: why || 'Not wanted here' }); continue; }
      total += q; sold.push(it);
      if (typeof venue === 'number') S.market[venue].sold += q;
      progressContracts(it, q);
    }
    total = Math.round(total);
    if (total > 0) { S.scrip += total; S.totalEarned += total; S.soldToday += total; S.ledger.unshift({ day: S.day, venue, total, n: sold.length }); S.ledger.length = Math.min(S.ledger.length, 30); }
    for (const c of S.contracts) if (c.kind === 'day' && !c.done) c.progress = S.soldToday - (c.base || 0);
    const completed = checkContracts();
    return { total, sold, refused, completed };
  };
  function progressContracts(it, value) {
    void value;
    for (const c of S.contracts) {
      if (c.done || c.kind === 'day' || c.kind === 'smelt') continue;
      if (!matches(c.want, it)) continue;
      if (c.kind === 'kg') c.progress += it.kg;
      // A crafted good must be a real piece of work (1 kg or more), not a
      // chalice made from a 0.05 kg scrap ingot.
      else if (c.kind === 'count' && !(c.want.stage === 'crafted' && it.kg < CRAFT_MIN_KG) && !it.sawn) c.progress += 1;
      else if (c.kind === 'big' && it.kg >= c.target) c.progress = c.target;
    }
  }
  function checkContracts() {
    const done = [];
    for (const c of S.contracts) if (!c.done && c.progress >= c.target) { c.done = true; S.scrip += c.reward; S.totalEarned += c.reward; S.standing += c.standing; done.push(c); }
    if (done.length) refillContracts();
    return done;
  }
  // Production contracts: metal poured from a kiln or smelter (you keep the
  // ingots, so these pay less than delivering them).
  api.smelted = (material, kg) => {
    for (const c of S.contracts) if (!c.done && c.kind === 'smelt' && c.want.material === material) c.progress += kg;
    return checkContracts();
  };
  api.spend = (amount) => { if (S.scrip < amount) return false; S.scrip -= amount; return true; };
  api.owns = (claimId) => S.owned.includes(claimId);
  api.buyClaim = (claimId) => {
    const c = CLAIMS.find(x => x.id === claimId); if (!c || api.owns(claimId)) return 'owned';
    if (!api.spend(c.price)) return 'poor';
    S.owned.push(claimId); return 'ok';
  };
  api.describe = (it) => itemName(it);
  api.serialize = () => JSON.parse(JSON.stringify(S));
  api.restore = (d) => { Object.assign(S, d); S.flags ||= {}; if (S.market.length < 4) rollMarket(); };
  return api;
}
