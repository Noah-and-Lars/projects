// Onboarding (BUILD_BRIEF 11, M8): first-hour guided contracts. Each step
// has a check against the game state and pays a little money when done.
// The current one shows top-left; B opens the look-up guide with every step
// and short reference notes. Progress lives in economy.state.flags.guide.
import { h } from '../ui/dom.js';
import { MACHINES } from '../defs/machines.js';
import { SHOPS, STARTER_KIT } from '../defs/shops.js';
import { CLAIMS } from '../world/valley.js';
import { BLUEPRINTS } from '../defs/progression.js';
import { MATERIALS } from '../defs/materials.js';

const priceOf = (id) => { for (const S of Object.values(SHOPS)) { const e = S.items.find(i => i.id === id); if (e) return e.price; } return 0; };
const KIT_COST = Math.ceil(STARTER_KIT.reduce((a, id) => a + priceOf(id), 0) / 50) * 50;
export function createGuide({ hud, panels, economy, hands, items, machines, vehicles, audio }) {
  const E = economy.state;
  const G = () => (E.flags.guide ||= { step: 0, seen: {} });
  const has = (pred) => { for (const e of items.ents.values()) if (pred(e)) return true; return false; };
  // Real sales are in the ledger (guide payouts and contract rewards aren't).
  const sold = () => E.ledger.length > 0;
  const machine = (pred) => { for (const m of machines.list.values()) if (!m.run && pred(m)) return m; return null; };
  const STEPS = [
    { title: 'Scoop some gravel', text: 'Hold your pan (Q swaps tools) and click the Gravel Bar to scoop 2 loads into it.', done: () => (hands.digs || 0) > 0 || (hands.washed || 0) > 0, pay: 5 },
    { title: 'Wash it in the river', text: 'Walk to the water and click it with the full pan. Each load washes into a find.', done: () => (hands.washed || 0) > 0, pay: 10 },
    { title: 'Fill the pan with finds', text: 'Finds stay in the pan (up to 20). Keep scooping and washing; E drops a loose find into it too.', done: () => { for (const e of items.ents.values()) if (e.type === 'pan' && e.data.contents?.length >= 3) return true; return (hands.tipped || 0) > 0 || sold(); }, pay: 10 },
    { title: 'Sell at the Assay Office', text: 'Cross the bridge to Millbrook. Click the Assay Office counter with the pan to tip your finds out, then ring the bell (E).', done: sold, pay: 20 },
    { title: 'Load the truck', text: 'Your old hauler is parked by the claim. Click its bed with the pan to tip your finds in (or drop things on it with G), then F to drive to town.', done: () => [...vehicles.list.values()].some(v => v.cargo.length > 0) || G().drove, pay: 20 },
    { title: 'A better shovel', text: 'Buy the Sturdy Shovel at the General Store: it holds 2 loads.', done: () => has(e => e.type === 'shovel' && (e.data?.cap || 1) >= 2), pay: 20 },
    { title: 'Your first contract', text: 'Read the board by the Guild Hall and finish a contract. Contracts pay money.', done: () => E.standing > 0, pay: 40 },
    { title: 'The starter kit', text: `Save up $${KIT_COST.toLocaleString('en-GB')}. At any shop counter buy a Sluice Box, a Drill, a River Intake and copper pipe.`, done: () => has(e => e.type === 'crate' && e.data.def === 'drill1') || !!machine(m => m.def === 'drill1'), pay: 50 },
    { title: 'Set up a line', text: 'Place the drill in your claim with its spout over the sluice hopper, and lock both with the mallet.', done: () => !!machine(m => m.def.startsWith('drill') && machines.linkOf(m.id)), pay: 60 },
    { title: 'Bring the water', text: 'Put the intake in the river and lay copper pipe from it to the drill and the sluice. Watch it run.', done: () => !!machine(m => m.def.startsWith('drill') && m.status === 'running'), pay: 80 },
    { title: 'Dig deeper', text: `Buy the Willow Bend deed at the Guild Hall ($${CLAIMS.find(c => c.id === 'willow').price.toLocaleString('en-GB')}). It goes down to the gravel bed and slate.`, done: () => economy.owns('willow'), pay: 100 },
  ];
  // HUD card.
  const title = h('b'), text = h('span'), count = h('i');
  const card = h('div', { id: 'guide', class: 'hidden' }, h('div', { class: 'g-head' }, h('span', {}, 'Guide'), count), title, text, h('small', {}, 'B: look-up guide'));
  // The card and the toasts share the top-left column, toasts underneath.
  const toasts = hud.el.querySelector('#toasts');
  if (toasts) { const col = h('div', { id: 'hud-left' }); toasts.replaceWith(col); col.append(card, toasts); } else hud.el.append(card);
  let t = 0;
  const api = {
    steps: STEPS,
    update(dt, active = true) {
      const g = G();
      card.classList.toggle('hidden', g.step >= STEPS.length || !!g.hidden || !active);
      if (g.step >= STEPS.length) return;
      const s = STEPS[g.step];
      if (title.textContent !== s.title) { title.textContent = s.title; text.textContent = s.text; count.textContent = `${g.step + 1} / ${STEPS.length}`; }
      if (vehicles.driving && g.step === 4) g.drove = true; // only a drive during "Load the truck" counts
      t -= dt; if (t > 0 || !api.auth) return; t = 0.5;
      if (s.done()) {
        g.step++; E.scrip += s.pay;
        audio.play('contract'); hud.toast(`Guide: ${s.title} · $${s.pay}`, 'gold');
      }
    },
    // B over a hovered thing: its card plus what it's for (shop blurbs,
    // material notes). Returns false when there's nothing to look up.
    lookup(card, ref) {
      if (!card || !ref) return false;
      const desc = [];
      const shopEntry = (pred) => { for (const s of Object.values(SHOPS)) for (const it of s.items) if (pred(it)) return { it, shop: s.name }; return null; };
      let hit = null;
      if (ref.def) hit = shopEntry(it => it.data?.def === ref.def);
      // Same type and the same tier/capacity (a Steel Shovel isn't a Sturdy one;
      // a steel pipe coil isn't a copper one). The starter shovel has no entry.
      else if (ref.type) hit = shopEntry(it => it.spawn === ref.type && (it.data?.tier ?? null) === (ref.tier ?? null) && (it.data?.cap ?? null) === (ref.cap ?? null))
        || (ref.type === 'coil' ? shopEntry(it => it.spawn === 'coil' && it.data?.tier === ref.tier) : null)
        || (ref.type !== 'shovel' && ref.type !== 'coil' && ref.tier == null ? shopEntry(it => it.spawn === ref.type) : null);
      if (!hit && ref.type) { const bp = BLUEPRINTS.find(b => b.spawn === ref.type && (b.data?.tier ?? null) === (ref.tier ?? null) && (b.data?.cap ?? null) === (ref.cap ?? null)); if (bp) hit = { it: bp, shop: 'Machine Shop (blueprint)' }; }
      if (!hit && ref.def) { const bp = BLUEPRINTS.find(b => b.data?.def === ref.def); if (bp) hit = { it: bp, shop: 'Machine Shop (blueprint)' }; }
      if (hit) desc.push(hit.it.desc, `From the ${hit.shop}.`);
      else if (ref.type === 'shovel') desc.push('Your starter shovel: 1 load of topsoil or clay. Better shovels are at the General Store.');
      const m = ref.material && MATERIALS[ref.material];
      if (m) {
        if (m.kind === 'gem') desc.push(ref.stage === 'uncut' ? 'Sell gems at the Assay Office, or cut them first on a grinding wheel (or at the Upper Falls cutter) to roughly double their price.' : 'Cut gems sell at the Assay Office, or set one in a ring, pendant or chalice at a workbench.');
        else if (m.kind === 'fuel') desc.push('Quartz is fuel: kilns, smelters and booster pumps burn it.');
        else if (ref.stage === 'ore') desc.push('Sell it at the Assay Office, or melt 10 kg of one metal in a crucible or kiln into an ingot worth more.');
        else desc.push('Refined metal sells for more at the Assay Office. A hot ingot can be worked at a workbench.');
      }
      if (ref.type === 'clod' || ref.type === 'pile') desc.push('Loose things on the ground can be tidied up from the menu: Settings → Clear loose clods and piles.');
      const body = h('div', {},
        ...(card.lines || []).filter(Boolean).map(l => h('p', { class: 'small' }, l)),
        ...desc.filter(Boolean).map(d => h('p', {}, d)),
        h('button', { class: 'btn', onclick: () => api.open() }, 'Open the full guide'));
      panels.show('lookup', card.name, body, card.badge ? { badge: card.badge } : {});
      return true;
    },
    auth: true, // co-op guests show the host's progress instead of checking
    open() {
      const g = G();
      const body = h('div', {},
        h('p', { class: 'small' }, 'Guided contracts for your first hour. Each pays a little money.'),
        ...STEPS.map((s, i) => h('div', { class: 'entry' + (i < g.step ? ' done' : '') }, h('b', {}, `${i + 1}. ${s.title}`), h('span', { class: 'pill' }, i < g.step ? 'Done' : i === g.step ? 'Now' : `$${s.pay}`), h('span', { class: 'desc' }, s.text))),
        h('h3', {}, 'Good to know'),
        ...[
          ['Depth bands', 'Topsoil and clay (0–6 m) dig with any tool; the gravel bed (6–14 m) needs steel, slate (14–22 m) glimmer, basalt (Ember Seam) ember. Deeper finds weigh more.'],
          ['Water', `Intakes give flow (Mk I ${MACHINES.intake1.flow} L/s); each pipe carries its tier's limit. Machines slow down, but never stop, when the flow can't keep up. Settling tanks take silt out, which saves wear.`],
          ['Selling', 'The Assay Office is the one shop that buys, and it buys everything: ore, ingots, gems and crafted goods. Prices move a little every morning: the board beside it shows today\'s $ per kg for every material.'],
          ['Claims', 'Buy new claims at the Guild Hall with money. Everything else is sold at any shop counter in Millbrook.'],
          ['The Pumphouse', 'The old pumphouse below Millbrook can be restored in five stages: that is the big goal.'],
        ].map(([k, v]) => h('div', { class: 'entry' }, h('b', {}, k), h('span', { class: 'desc' }, v))),
        h('div', { class: 'entry' }, h('b', {}, 'Guide card'), h('button', { class: 'btn', onclick: () => { g.hidden = !g.hidden; api.open(); } }, g.hidden ? 'Show' : 'Hide'), h('span', { class: 'desc' }, 'The card in the top-left corner.')));
      panels.show('guide', 'Guide', body, { badge: `${Math.min(g.step, STEPS.length)} / ${STEPS.length}` });
    },
  };
  return api;
}
