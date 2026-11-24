// The Machine Shop, the Upper Falls gem cutter and the Rillstone Pumphouse
// (BUILD_BRIEF 3.5, 3.6). State lives in economy.state.flags:
//   blueprints: [ids], pump: { stage, got: { needKey: amount } }, finale.
import * as THREE from 'three';
import { BLUEPRINTS, PUMP_STAGES, needKey, needLabel, needMatches } from '../defs/progression.js';
import { MATERIALS, itemValue, itemName } from '../defs/materials.js';
import { PUMPHOUSE } from '../world/valley.js';
import { pumphouseParts, pumpWheel, PUMP_DIMS, WHEEL } from '../render/pumphouse.js';
import { counter, bell, textPlane } from '../render/buildings.js';
import { h } from '../ui/dom.js';
import { previews } from '../ui/preview.js';
import { SHOPS } from '../defs/shops.js';

const ROMAN = ['', 'I', 'II', 'III', 'IV'];
const fmt = (n) => Math.round(n).toLocaleString('en-GB');

export function createWorkshop({ scene, physics, materials, items, economy, town, hud, audio, panels, fx, getStats }) {
  const E = economy.state;
  const s0 = town.statics.length; // colliders added below are sent at the end
  const F = () => (E.flags ||= {});
  const owned = () => { const o = (F().blueprints ||= []); if (F().sandbox && o.length < BLUEPRINTS.length) for (const b of BLUEPRINTS) if (!o.includes(b.id)) o.push(b.id); return o; };
  const pump = () => (F().pump ||= { stage: 0, got: {} });

  // Loose entities resting on a counter (ingots, gems, the relic...).
  onCounter.near = (c, p) => {
    const hw = (c.w || 3.2) / 2 + 0.05, dx = p[0] - c.x, dz = p[2] - c.z, lx = dx * Math.cos(c.yaw) - dz * Math.sin(c.yaw), lz = dx * Math.sin(c.yaw) + dz * Math.cos(c.yaw);
    return Math.abs(lx) < hw + 0.5 && Math.abs(lz) < 1 && p[1] > c.top - 0.5 && p[1] < c.top + 2;
  };
  function onCounter(c, test = () => true) {
    const out = [], hw = (c.w || 3.2) / 2 + 0.05, cos = Math.cos(c.yaw), sin = Math.sin(c.yaw);
    for (const e of items.ents.values()) {
      if (e.loc !== 'loose' || !test(e)) continue;
      const dx = e.pos[0] - c.x, dz = e.pos[2] - c.z, lx = dx * cos - dz * sin, lz = dx * sin + dz * cos;
      if (Math.abs(lx) < hw && Math.abs(lz) < 0.5 && e.pos[1] > c.top - 0.1 && e.pos[1] < c.top + 1.4) out.push(e);
    }
    return out;
  }

  // ---- Machine Shop ----
  const WS = town.workshop.counter;
  const ingotStock = () => {
    const st = {};
    for (const e of onCounter(WS, e => e.item?.stage === 'ingot')) st[e.item.material] = (st[e.item.material] || 0) + e.item.kg;
    return st;
  };
  function buyBlueprint(bp) {
    if (owned().includes(bp.id)) return 'owned';
    if (!economy.spend(bp.bp)) { audio.play('error'); hud.toast(`Not enough money for the ${bp.name} blueprint`, 'err'); return 'poor'; }
    owned().push(bp.id); audio.play('coins'); hud.toast(`Blueprint: ${bp.name}. Put the ingots on the counter to build one.`, 'gold');
    return 'ok';
  }
  // Take the ingots a build needs from the counter. The last ingot of each
  // metal is cut: the leftover goes back on the counter as a smaller ingot.
  function build(bp) {
    if (!owned().includes(bp.id)) return 'no blueprint';
    const st = ingotStock(), free = !!F().sandbox; // sandbox builds need no ingots
    if (!free) for (const [mat, kg] of Object.entries(bp.ingots)) if ((st[mat] || 0) + 1e-6 < kg) { audio.play('error'); hud.toast(`Short of ${MATERIALS[mat].name.toLowerCase()}: ${(st[mat] || 0).toFixed(1)} / ${kg} kg of ingots on the counter`, 'err'); return 'short'; }
    if (!free) for (const [mat, kg] of Object.entries(bp.ingots)) {
      let need = kg;
      const list = onCounter(WS, e => e.item?.stage === 'ingot' && e.item.material === mat).sort((a, b) => a.item.kg - b.item.kg);
      for (const e of list) {
        if (need <= 1e-6) break;
        const take = Math.min(need, e.item.kg), left = Math.round((e.item.kg - take) * 1000) / 1000;
        need -= take;
        const pos = e.pos.slice();
        items.remove(e.id);
        if (left >= 0.05) items.spawn('nugget', [pos[0], pos[1] + 0.1, pos[2]], { item: { material: mat, stage: 'ingot', kg: left } });
      }
    }
    town.deliver('machineshop', { spawn: bp.spawn, data: { ...bp.data }, name: bp.name });
    town.workshop.clerk.busy = 1.5;
    audio.play('coins'); fx?.burst([WS.x, WS.top + 0.3, WS.z], 0xffc070, 16, { speed: 2.4, size: 0.03, life: 0.4 });
    hud.toast(`${bp.name} built · delivered to the pad`, 'gold');
    return 'ok';
  }
  // ---- Scrapping (BUILD_BRIEF 3.3): crates and tools on the counter come
  // back as scrap iron worth 30% of what they cost.
  const SCRAP = 0.3;
  // Anything still holding something (a full bin's crate, a pan of finds)
  // isn't scrapped: what's inside would be lost.
  const holdsThings = (e) => !!(e.data?.contents?.length || e.data?.loads?.length || e.data?.state?.contents?.length || e.data?.state?.molten > 0 || e.data?.state?.ore > 0 || e.data?.state?.loads?.length || e.data?.state?.gems?.length || e.data?.state?.out || e.data?.state?.reheat?.length || e.data?.state?.queue?.length || e.data?.state?.charges > 0);
  function scrapValue(e) {
    if (e.data?.starter) return 0; // the free starter tools
    const same = (d) => (d?.tier ?? null) === (e.data?.tier ?? null) && (d?.cap ?? null) === (e.data?.cap ?? null);
    for (const sh of Object.values(SHOPS)) for (const it of sh.items) {
      if (e.type === 'crate' ? it.data?.def === e.data?.def : it.spawn === e.type && it.spawn !== 'vehicle' && same(it.data)) return it.price;
    }
    const bp = BLUEPRINTS.find(b => e.type === 'crate' ? b.data?.def === e.data?.def : b.spawn === e.type && same(b.data));
    if (bp) return Object.entries(bp.ingots).reduce((a, [m, kg]) => a + kg * MATERIALS[m].refined, 0);
    return 0;
  }
  const scrapList = () => onCounter(WS, e => !e.item && e.type !== 'pile' && !holdsThings(e) && scrapValue(e) > 0);
  function scrap() {
    const list = scrapList();
    if (!list.length) { hud.toast(onCounter(WS, e => !e.item && holdsThings(e)).length ? 'Empty it first: scrapping would lose what is inside' : 'Put crates or tools on the counter to scrap them', 'err'); return 'none'; }
    const value = list.reduce((a, e) => a + scrapValue(e), 0), kg = Math.max(0.05, Math.round(value * SCRAP / MATERIALS.iron.refined * 100) / 100);
    const pos = list[0].pos.slice();
    for (const e of list) items.remove(e.id);
    items.spawn('nugget', [pos[0], pos[1] + 0.15, pos[2]], { item: { material: 'iron', stage: 'ingot', kg } });
    audio.play('drop'); town.workshop.clerk.busy = 1.2;
    hud.toast(`Scrapped ${list.length} thing${list.length > 1 ? 's' : ''}: ${kg.toFixed(2)} kg of scrap iron`, 'gold');
    return 'ok';
  }
  function openWorkshop() {
    const render = () => {
      const st = ingotStock();
      const have = Object.entries(st).map(([m, kg]) => `${kg.toFixed(1)} kg ${MATERIALS[m].name.toLowerCase()}`).join(' · ') || 'no ingots';
      const rows = [];
      for (const tier of [2, 3, 4]) {
        rows.push(h('h3', {}, `Mk ${ROMAN[tier]} · ${['', '', 'gravel bed', 'slate', 'basalt'][tier]}`));
        for (const bp of BLUEPRINTS.filter(b => b.tier === tier)) {
          const own = owned().includes(bp.id);
          const need = Object.entries(bp.ingots).map(([m, kg]) => `${kg} kg ${MATERIALS[m].name.toLowerCase()}`).join(' + ');
          const ok = !!F().sandbox || Object.entries(bp.ingots).every(([m, kg]) => (st[m] || 0) + 1e-6 >= kg);
          const btn = own ? h('button', { class: 'btn primary', disabled: !ok, onclick: () => { WS_API.build(bp); setTimeout(render, 400); } }, 'Build')
              : h('button', { class: 'btn', disabled: E.scrip < bp.bp, onclick: () => { WS_API.buyBlueprint(bp); setTimeout(render, 400); } }, `Blueprint $${fmt(bp.bp)}`);
          btn.classList.add('item-buy');
          rows.push(h('div', { class: 'item' }, previews().entry(bp.spawn, bp.data, 'pv item-pic'),
            h('div', { class: 'item-text' }, h('b', {}, bp.name), h('span', { class: 'desc' }, `${bp.desc} ${F().sandbox ? 'Sandbox: builds are free.' : `Each build takes ingots: ${need}.`}`)), btn));
        }
      }
      const sl = scrapList(), sv = sl.reduce((a, e) => a + scrapValue(e), 0);
      rows.push(h('h3', {}, 'Scrap'), h('div', { class: 'entry' }, h('b', {}, sl.length ? `${sl.length} on the counter` : 'Nothing to scrap'),
        h('button', { class: 'btn', disabled: !sl.length, onclick: () => { WS_API.scrap(); setTimeout(render, 400); } }, sl.length ? `Scrap for ${(sv * SCRAP / MATERIALS.iron.refined).toFixed(1)} kg iron` : 'Scrap'),
        h('span', { class: 'desc' }, 'Machine crates and tools left on the counter come back as scrap iron worth 30% of what they cost.')));
      const body = h('div', {}, h('p', { class: 'small' }, `Buy a blueprint once, then put ingots on the counter and build. Leftover metal comes back as a smaller ingot. On the counter: ${have}.`), ...rows);
      panels.show('shop:machineshop', 'Machine Shop', body, { badge: F().sandbox ? '$∞' : `$${fmt(E.scrip)}` });
    };
    render();
  }
  town.custom.machineshop = openWorkshop;

  // ---- Upper Falls gem cutter: cuts every uncut gem on the counter for a fee ----
  const CUT = town.cutter.counter;
  const cutFee = (it) => Math.max(2, Math.round(itemValue({ ...it, stage: 'cut', kg: it.kg * 0.85 }) * 0.12));
  function ringCutter() {
    const gems = onCounter(CUT, e => e.item && MATERIALS[e.item.material]?.kind === 'gem' && e.item.stage === 'uncut');
    audio.play('pickup');
    if (!gems.length) { hud.toast('Put uncut gems on the counter, then ring: the cutter charges 12% of the cut value'); return; }
    const fee = gems.reduce((a, e) => a + cutFee(e.item), 0);
    if (!economy.spend(fee)) { audio.play('error'); hud.toast(`The cutter wants $${fee} for ${gems.length} gem${gems.length > 1 ? 's' : ''}`, 'err'); return; }
    for (const e of gems) {
      const it = { ...e.item, stage: 'cut', kg: Math.round(e.item.kg * 0.85 * 1000) / 1000 };
      const pos = e.pos.slice(); items.remove(e.id);
      items.spawn('nugget', [pos[0], pos[1] + 0.05, pos[2]], { item: it });
    }
    town.cutter.clerk.busy = 2;
    audio.play('rare'); fx?.burst([CUT.x, CUT.top + 0.2, CUT.z], 0xfff4e0, 18, { speed: 1.6, size: 0.02, life: 0.4 });
    hud.toast(`Gem Cutter: ${gems.length} gem${gems.length > 1 ? 's' : ''} cut and polished · $${fee}`, 'gold');
  }
  town.customProp.cutbell = ringCutter;
  town.customHint.cutbell = () => 'ring for the gem cutter';
  town.customCard.cutbell = () => { const g = onCounter(CUT, e => e.item && MATERIALS[e.item.material]?.kind === 'gem' && e.item.stage === 'uncut'); return { name: 'Gem Cutter', lines: [g.length ? `${g.length} uncut on the counter · fee $${g.reduce((a, e) => a + cutFee(e.item), 0)}` : 'Cuts uncut gems for 12% of the cut value'] }; };

  // ---- The Rillstone Pumphouse ----
  const P = PUMPHOUSE, { W, D, H } = PUMP_DIMS;
  const ph = new THREE.Group(); ph.position.set(P.x, P.y, P.z); scene.add(ph);
  const parts = pumphouseParts(), meshes = {};
  for (const [k, g] of Object.entries(parts)) { const m = new THREE.Mesh(g, materials.vcolor); m.castShadow = m.receiveShadow = true; ph.add(m); meshes[k] = m; }
  const wheel = new THREE.Mesh(pumpWheel(), materials.vcolor); wheel.position.set(WHEEL.x, WHEEL.y, 0); wheel.castShadow = true; ph.add(wheel);
  const glow = new THREE.PointLight(0xff6a2a, 0, 14, 2); glow.position.set(W / 2 - 1.4, H + 4.6, D / 2 - 1.6); ph.add(glow);
  // Delivery counter and bell on the town side, with the project board.
  const cx = P.x + W / 2 + 3.2, cz = P.z, cyaw = Math.PI / 2;
  town.put(new THREE.Mesh(counter(3.2), materials.vcolor), cx, cz, cyaw, P.y);
  town.box('ctr-pump', cx, P.y + 0.53, cz, 1.6, 0.53, 0.45, cyaw);
  town.put(new THREE.Mesh(bell(), materials.vcolor), cx + 0.15, cz - 1.25, cyaw, P.y + 1.05);
  const pumpBell = town.prop('pumpbell', { name: 'Pumphouse delivery' }, cx + 0.15, P.y + 1.13, cz - 1.25, 0.12, 0.1, 0.12, cyaw);
  const PC = { x: cx, z: cz, yaw: cyaw, w: 3.2, top: P.y + 1.05 };
  // No piles on the shop, cutter or Pumphouse counters (they take single items).
  items.noMerge.push((p) => [WS, CUT, PC].some(c => c && onCounter.near(c, p)));
  const sign = textPlane(['RILLSTONE PUMPHOUSE', 'Restoration · E to read'], { w: 3.0, h: 0.8, bg: '#3a4a5a', fg: '#f4ecd8' });
  town.put(sign, P.x + W / 2 + 0.02, P.z, Math.PI / 2, P.y + 3.3);
  const board = town.prop('pumpboard', { name: 'Pumphouse board' }, P.x + W / 2 + 0.1, P.y + 3.3, P.z, 0.1, 0.4, 1.5, 0);
  void board;
  function applyStage() {
    const s = pump().stage;
    meshes.ruin.visible = s < 1; meshes.walls.visible = s >= 1; meshes.roof.visible = s >= 2;
    meshes.frame.visible = s >= 3; wheel.visible = s >= 3; meshes.lining.visible = s >= 4; meshes.heart.visible = s >= 5;
    sign.position.y = P.y + (s >= 1 ? 3.3 : 1.2);
    physics.post({ op: 'setStaticBox', key: 'pumphouse', hx: W / 2, hy: s >= 1 ? H / 2 : 0.9, hz: D / 2, pos: [P.x, P.y + (s >= 1 ? H / 2 : 0.9), P.z] });
  }
  applyStage();
  const remaining = (n) => (n.kind === 'ingot' ? n.kg : n.n) - (pump().got[needKey(n)] || 0);
  function ringPump() {
    audio.play('pickup');
    const st = pump();
    if (st.stage >= PUMP_STAGES.length) { hud.toast('The Pumphouse runs again. Thank you!'); return; }
    const stage = PUMP_STAGES[st.stage];
    const list = onCounter(PC, e => !!e.item || e.type === 'relic');
    if (!list.length) { hud.toast(`Stage ${st.stage + 1}: ${stage.name}. Put ${stage.needs.map(n => needLabel(n, MATERIALS)).join(' and ')} on the counter, then ring.`); return; }
    let used = 0;
    for (const e of list) {
      const n = stage.needs.find(k => remaining(k) > 1e-6 && needMatches(k, e));
      if (!n) continue;
      if (n.kind === 'ingot') {
        // Take only what the stage still needs; the rest comes back as a smaller ingot.
        const take = Math.min(e.item.kg, remaining(n)), left = Math.round((e.item.kg - take) * 1000) / 1000, pos = e.pos.slice(), it = { ...e.item };
        st.got[needKey(n)] = (st.got[needKey(n)] || 0) + take;
        items.remove(e.id);
        if (left >= 0.05) items.spawn('nugget', [pos[0], pos[1] + 0.1, pos[2]], { item: { ...it, kg: left } });
      } else { st.got[needKey(n)] = (st.got[needKey(n)] || 0) + 1; items.remove(e.id); }
      used++;
    }
    if (!used) { audio.play('error'); hud.toast(`Nothing there for stage ${st.stage + 1} (${stage.needs.map(n => needLabel(n, MATERIALS)).join(', ')})`, 'err'); return; }
    audio.play('coins');
    if (stage.needs.every(n => remaining(n) <= 1e-6)) {
      st.stage++; st.got = {};
      E.scrip += stage.reward; E.totalEarned += stage.reward; E.standing += stage.standing;
      applyStage(); audio.play('rare');
      fx?.burst([P.x, P.y + H + 1, P.z], 0xffd27a, 40, { speed: 4, size: 0.06, life: 1 });
      hud.toast(`Pumphouse stage ${st.stage} complete: ${stage.name} · $${fmt(stage.reward)}`, 'gold');
      if (st.stage >= PUMP_STAGES.length) finale();
    } else {
      hud.toast(`Delivered ${used} piece${used > 1 ? 's' : ''} · ${stage.needs.map(n => `${needLabel(n, MATERIALS).replace(/^\d+ (kg )?/, '')}: ${Math.max(0, remaining(n)).toFixed(n.kind === 'ingot' ? 1 : 0)} to go`).join(' · ')}`);
    }
  }
  function openBoard() {
    const st = pump();
    const body = h('div', {}, h('p', { class: 'small' }, 'The valley\'s old pumphouse fed every claim from Millbrook to the falls. Restore it in five stages: put the goods on the counter beside it and ring the bell. Each stage pays the town\'s thanks in money.'),
      ...PUMP_STAGES.map((s, i) => h('div', { class: 'entry' + (i < st.stage ? ' done' : '') }, h('b', {}, `${i + 1}. ${s.name}`), h('span', { class: 'pill' }, i < st.stage ? 'Done' : i === st.stage ? 'Now' : `$${fmt(s.reward)}`),
        h('span', { class: 'desc' }, `${s.text}. ${s.needs.map(n => needLabel(n, MATERIALS) + (i === st.stage ? ` (${Math.max(0, remaining(n)).toFixed(n.kind === 'ingot' ? 1 : 0)} to go)` : '')).join(' · ')}`))));
    panels.show('pumphouse', 'Rillstone Pumphouse', body, { badge: `Stage ${Math.min(st.stage + 1, 5)} of 5` });
  }
  town.customProp.pumpbell = ringPump; town.customProp.pumpboard = openBoard;
  town.customHint.pumpbell = () => 'ring to deliver to the Pumphouse'; town.customHint.pumpboard = () => 'read the restoration board';
  town.customCard.pumpbell = () => { const st = pump(); if (st.stage >= 5) return { name: 'Rillstone Pumphouse', lines: ['Restored'] }; const s = PUMP_STAGES[st.stage]; return { name: `Pumphouse stage ${st.stage + 1}: ${s.name}`, lines: s.needs.map(n => `${needLabel(n, MATERIALS)} · ${Math.max(0, remaining(n)).toFixed(n.kind === 'ingot' ? 1 : 0)} to go`) }; };
  town.customCard.pumpboard = () => ({ name: 'Rillstone Pumphouse', lines: [`Stage ${Math.min(pump().stage + 1, 5)} of 5`, 'E to read the board'] });

  // The end screen and the reward: a gold-plated water wheel.
  function finale(replay = false) {
    if (!replay) { F().finale = { day: E.day, earned: E.totalEarned }; town.deliver('millwright', { spawn: 'crate', data: { def: 'goldwheel', family: 'water' }, name: 'Gold-plated Water Wheel' }); }
    const s = getStats?.() || {};
    const body = h('div', { class: 'finale-body' },
      h('div', { class: 'finale-wheel' }, '✦'),
      h('p', {}, 'Water runs through the old race again, the great wheel turns and the ember boiler glows. From Millbrook to Upper Falls, the valley has its pumphouse back, thanks to you.'),
      h('div', { class: 'finale-stats' },
        ...[['Days', E.day], ['Money earned', '$' + fmt(E.totalEarned)], ['Claims', E.owned.length + ' of 6'], ['Time played', s.playTime ? `${Math.floor(s.playTime / 3600)} h ${Math.floor(s.playTime / 60) % 60} min` : '—']].map(([k, v]) => h('div', {}, h('span', {}, k), h('b', {}, String(v))))),
      h('p', { class: 'small' }, 'A gold-plated water wheel is waiting on the Millwright\'s pad. Keep digging as long as you like.'));
    panels.show('finale', 'The Rillstone Pumphouse runs again', body, { cls: 'finale', closeLabel: 'Keep playing' });
  }

  physics.post({ op: 'batch', ops: town.statics.slice(s0) });
  let t = 0;
  const WS_API = {
    blueprints: BLUEPRINTS, buyBlueprint, build, scrap, scrapValue, openWorkshop, ringCutter, ringPump, openBoard, finale, applyStage, ingotStock,
    counters: { workshop: WS, cutter: CUT, pump: PC }, pumpBell,
    update(dt) {
      const s = pump().stage;
      if (s >= 3) wheel.rotation.x -= dt * 0.9;
      t += dt; glow.intensity = s >= 5 ? 6 + Math.sin(t * 7) * 1.2 + Math.sin(t * 13) * 0.6 : 0;
    },
  };
  return WS_API;
}
