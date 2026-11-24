// The economy, held by the host (BUILD_BRIEF 3.6): an abstract ledger in
// money ($), one shop that buys everything (the Assay Office) at prices that
// drift a little each day, guild contracts and claim deeds. Plain data, so it
// saves and syncs.
import { MATERIALS, itemValue, itemName } from '../defs/materials.js';
import { CLAIMS } from '../world/valley.js';

const CRAFT_NAMES = { toolhead: 'tool head', ring: 'ring', chain: 'chain', pendant: 'pendant', chalice: 'chalice', blade: 'blade' };
const matches = (w, it) => it.stage === w.stage && (w.kind ? MATERIALS[it.material]?.kind === w.kind : !w.material || it.material === w.material) && (!w.craft || it.craft === w.craft);

// Contract templates, scaled by how many contracts you've finished (a
// hidden counter, `standing`; it's never shown or required for anything). kind: 'kg' (deliver kg of a
// material/stage), 'count' (items matching), 'big' (one piece over X kg), 'day' (sell $ in a day).
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
  else { const s = Math.round((150 + rng() * 150) * tier / 10) * 10; c = { kind: 'day', target: s, text: `Sell $${s} in one day` }; }
  const reward = Math.round((c.kind === 'day' ? c.target * 0.35 : c.kind === 'big' ? 60 * tier : c.kind === 'count' ? c.target * 25 : c.target * MATERIALS[c.want.material].ore * 0.6) / 5) * 5 + 20;
  return { id, ...c, progress: 0, reward, standing: tier, done: false };
}

export const SANDBOX_SCRIP = 9999999;
export const PRICE_MIN = 0.8, PRICE_MAX = 1.25;
export function createEconomy(rng) {
  const S = {
    scrip: 0, standing: 0, day: 1, soldToday: 0, totalEarned: 0, ledger: [],
    market: [], prices: null, pricesPrev: null, stats: { oresSold: 0, oreKg: 0, itemsSold: 0 }, contracts: [], nextContract: 1, owned: ['gravel'], flags: {},
  };
  const api = { state: S };
  // Today's price of each material at the shop, as a factor of its base
  // value: a gentle random walk each morning between 80% and 125%.
  const SELLABLE = Object.keys(MATERIALS).filter(m => MATERIALS[m].kind !== 'fuel');
  function rollMarket() {
    S.prices ||= {}; S.pricesPrev = { ...S.prices };
    for (const m of SELLABLE) { const f = S.prices[m] ?? 1; S.prices[m] = Math.round(Math.min(PRICE_MAX, Math.max(PRICE_MIN, f * (0.93 + rng() * 0.14) + (1 - f) * 0.15)) * 100) / 100; }
    S.market = [];
  }
  api.priceFactor = (material) => S.prices?.[material] ?? 1;
  function refillContracts() {
    S.contracts = S.contracts.filter(c => !c.done);
    // A day contract that turns up mid-day counts sales from now on.
    while (S.contracts.length < 3) { const c = makeContract(rng, S.standing, S.nextContract++); if (c.kind === 'day') c.base = S.soldToday; S.contracts.push(c); }
  }
  api.init = () => { rollMarket(); refillContracts(); };
  api.newDay = (day) => { S.day = day; S.soldToday = 0; rollMarket(); for (const c of S.contracts) if (c.kind === 'day' && !c.done) { c.progress = 0; c.base = 0; } refillContracts(); };

  // One shop buys everything (ore, ingots, gems cut or uncut, crafted goods)
  // at today's price: its base value times the material's factor. A crafted
  // piece with a gem set in pays the gem at the gem's own factor.
  api.refuseReason = (it) => (MATERIALS[it.material]?.kind === 'fuel' ? 'Quartz is fuel, not for sale' : null);
  api.quote = (it, venue = 'assay') => {
    if (venue !== 'assay' || !MATERIALS[it.material]) return null;
    if (it.gem) { const { gem, ...rest } = it; return itemValue(rest) * api.priceFactor(it.material) + itemValue(gem) * 1.1 * api.priceFactor(gem.material); }
    return itemValue(it) * api.priceFactor(it.material);
  };
  // The board outside the shop: $ per kg for each material and form today,
  // with the change since yesterday.
  api.priceList = () => SELLABLE.map(m => {
    const M = MATERIALS[m], f = api.priceFactor(m), prev = S.pricesPrev?.[m] ?? f;
    const forms = M.kind === 'gem' ? [['uncut', M.ore], ['cut', M.refined]] : [['ore', M.ore], ['ingot', M.refined]];
    return { material: m, name: M.name, kind: M.kind, factor: f, trend: f > prev + 0.005 ? 1 : f < prev - 0.005 ? -1 : 0, forms: forms.map(([stage, base]) => ({ stage, perKg: Math.round(base * f * 10) / 10 })) };
  });
  // Sell a list of items (plain item data) at the Assay Office.
  api.sell = (list, venue) => {
    let total = 0; const sold = [], refused = [];
    for (const it of list) {
      const why = api.refuseReason(it, venue);
      const q = why ? null : api.quote(it, venue);
      if (q == null) { refused.push({ it, why: why || 'Not wanted here' }); continue; }
      total += q; sold.push(it);
      // Lifetime tallies (the leaderboard shows ores sold).
      const st = (S.stats ||= { oresSold: 0, oreKg: 0, itemsSold: 0 });
      st.itemsSold++; if (it.stage === 'ore') { st.oresSold++; st.oreKg = Math.round((st.oreKg + it.kg) * 100) / 100; }
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
  api.spend = (amount) => { if (api.sandbox) { S.scrip = SANDBOX_SCRIP; return true; } if (S.scrip < amount) return false; S.scrip -= amount; return true; };
  // Sandbox games (picked on the New game page): money never runs out and
  // every claim is owned. Blueprints, free builds, fuel and flying are handled
  // where those live (workshop.js, main.js).
  Object.defineProperty(api, 'sandbox', { get: () => !!S.flags?.sandbox });
  api.makeSandbox = () => { (S.flags ||= {}).sandbox = true; api.sandboxTick(); };
  api.sandboxTick = () => {
    if (!api.sandbox) return;
    S.scrip = SANDBOX_SCRIP;
    for (const c of CLAIMS) if (!S.owned.includes(c.id)) S.owned.push(c.id);
  };
  api.owns = (claimId) => S.owned.includes(claimId);
  api.buyClaim = (claimId) => {
    const c = CLAIMS.find(x => x.id === claimId); if (!c || api.owns(claimId)) return 'owned';
    if (!api.spend(c.price)) return 'poor';
    S.owned.push(claimId); return 'ok';
  };
  api.describe = (it) => itemName(it);
  api.serialize = () => JSON.parse(JSON.stringify(S));
  api.restore = (d) => { Object.assign(S, d); S.flags ||= {}; S.stats ||= { oresSold: 0, oreKg: 0, itemsSold: 0 }; if (!S.prices) rollMarket(); };
  return api;
}
