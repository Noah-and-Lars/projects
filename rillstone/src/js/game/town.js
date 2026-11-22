// Millbrook: buildings, counters, bells, clerks, market stalls, the guild
// board, delivery pads and the bridge to the Gravel Bar. Selling is
// physical (BUILD_BRIEF 3.6): put goods on a counter and ring the bell; the
// clerk weighs and stamps them and the ledger pays out.
import * as THREE from 'three';
import { TOWN, HAMLET, riverX, waterY, height, CLAIMS } from '../world/valley.js';
import { building, counter, bell, stall, chalkboardFrame, textPlane, clerk, pad, bridge } from '../render/buildings.js';
import { paint, merge, place } from '../render/geom.js';
import { SHOPS } from '../defs/shops.js';
import { MACHINES } from '../defs/machines.js';
import { wantLabel } from '../sim/economy.js';
import { MATERIALS, itemName } from '../defs/materials.js';
import { EXTRA_MESH, EXTRA_BOX, EXTRA_CARD, EXTRA_MASS } from './items.js';
import { h } from '../ui/dom.js';

// Machine crates bought before machines can be placed (M4).
const FAMILY = { water: 0x2a8a86, extraction: 0xc8902c, heat: 0xa84a3a, logic: 0x6e56a8 };
EXTRA_MESH.crate = (e) => {
  const c = FAMILY[e.data.family] || 0x888888, P = (g, hex, j = 0.08, s = 1) => paint(g.index ? g.toNonIndexed() : g, hex, j, s);
  const parts = [P(new THREE.BoxGeometry(0.86, 0.86, 0.86), 0xc8a070, 0.1, 1)];
  for (const s of [-1, 1]) for (const a of [0, 1, 2]) { const g = new THREE.BoxGeometry(a === 0 ? 0.9 : 0.1, a === 1 ? 0.9 : 0.1, a === 2 ? 0.9 : 0.1); place(g, a === 0 ? 0 : s * 0.42, a === 1 ? 0 : s * 0.42, a === 2 ? 0 : s * 0.42); parts.push(P(g, 0x8a6440, 0.08, a + 3)); }
  parts.push(P(place(new THREE.BoxGeometry(0.88, 0.18, 0.88), 0, 0.1, 0), c, 0.04, 8));
  return merge(parts);
};
EXTRA_BOX.crate = () => [0.44, 0.44, 0.44];
EXTRA_MASS.crate = () => 40;
const crateName = (e) => MACHINES[e.data.def]?.name || 'Machine';
EXTRA_CARD.crate = (e) => ({ name: `${crateName(e)} (crate)`, lines: ['Machine crate', 'Hold it and LMB to place · R rotates'] });

export function createTown({ scene, physics, materials, items, vehicles, economy, hud, audio, panels }) {
  const T = TOWN, gy = T.y;
  const group = new THREE.Group(); scene.add(group);
  const props = new Map(); // physics owner id -> interactable
  let nextProp = 800;
  const statics = [];
  const counters = [];
  const clerks = [];
  const boards = [];
  const pads = {};

  // Place a model at (x, z) facing toward (fx, fz).
  function put(mesh, x, z, yaw, y = gy) { mesh.position.set(x, y, z); mesh.rotation.y = yaw; mesh.castShadow = mesh.receiveShadow = true; group.add(mesh); mesh.updateMatrixWorld(true); return mesh; }
  const faceYaw = (x, z) => Math.atan2(T.x - x, T.z - z);
  const local = (x, z, yaw, lx, lz) => [x + lx * Math.cos(yaw) + lz * Math.sin(yaw), z - lx * Math.sin(yaw) + lz * Math.cos(yaw)];
  function box(key, x, y, z, hx, hy, hz, yaw = 0, owner) { statics.push({ op: 'setStaticBox', key, hx, hy, hz, pos: [x, y, z], quat: [0, Math.sin(yaw / 2), 0, Math.cos(yaw / 2)], owner }); }
  function prop(kind, data, x, y, z, hx, hy, hz, yaw = 0) { const id = nextProp++; props.set(id, { id, kind, ...data, pos: [x, y, z] }); box('prop' + id, x, y, z, hx, hy, hz, yaw, id); return id; }

  // A shop: building + counter + clerk (+ bell for selling, + pad for deliveries).
  // `c` is the settlement it faces (Millbrook by default, or Upper Falls).
  function shop({ key, name, x, z, w = 8, d = 6, trim, sells = null, shopId = null, bay = false, sign, c = T, bellKind = 'bell' }) {
    const y0 = c.y ?? gy;
    const yaw = Math.atan2(c.x - x, c.z - z);
    put(new THREE.Mesh(building({ w, d, trim, bay }), materials.vcolor), x, z, yaw, y0);
    box('bld-' + key, x, y0 + 2.2, z, w / 2, 2.2, d / 2, yaw);
    // The sign sits on the wall between the awning (top ~2.9 m) and the eaves (3.7 m).
    const s = textPlane([sign || name], { w: Math.min(4.6, w * 0.62), h: 0.5, bg: '#' + trim.toString(16).padStart(6, '0'), px: 768 });
    const [sx, sz] = local(x, z, yaw, 0, d / 2 + 0.1); put(s, sx, sz, yaw, y0 + 3.28);
    if (bay) return { yaw };
    const cz = d / 2 + 1.3;
    const [cx, czz] = local(x, z, yaw, 0, cz);
    put(new THREE.Mesh(counter(3.2), materials.vcolor), cx, czz, yaw, y0);
    box('ctr-' + key, cx, y0 + 0.53, czz, 1.6, 0.53, 0.45, yaw);
    const [kx, kz] = local(x, z, yaw, 0, d / 2 + 0.55);
    const ck = put(new THREE.Mesh(clerk(trim), materials.vcolor), kx, kz, yaw, y0);
    clerks.push({ mesh: ck, base: ck.position.y, phase: clerks.length * 1.7, busy: 0 });
    const out = { yaw, counter: { x: cx, z: czz, yaw, w: 3.2, top: y0 + 1.05 }, clerk: clerks[clerks.length - 1] };
    if (sells != null) {
      const [bx, bz] = local(x, z, yaw, 1.25, cz + 0.15);
      put(new THREE.Mesh(bell(), materials.vcolor), bx, bz, yaw, y0 + 1.05);
      const id = prop(bellKind, { venue: sells, name, counter: { x: cx, z: czz, yaw, w: 3.2, d: 0.9, top: y0 + 1.05 } }, bx, y0 + 1.13, bz, 0.12, 0.1, 0.12, yaw);
      counters.push({ venue: sells, bell: id, x: cx, z: czz, yaw, top: y0 + 1.05, clerk: clerks[clerks.length - 1] });
      out.bell = id;
    }
    if (shopId) {
      prop('shop', { shop: shopId, name }, kx, y0 + 1.1, kz, 0.3, 0.9, 0.3, yaw);
      const [px, pz] = local(x, z, yaw, w / 2 + 2.4, d / 2 + 1.0);
      put(new THREE.Mesh(pad(), materials.vcolor), px, pz, yaw, y0 + 0.01);
      pads[shopId] = [px, y0 + 0.2, pz];
      box('pad-' + key, px, y0 + 0.05, pz, 1.3, 0.06, 1.3, yaw);
    }
    return out;
  }

  // Layout round the square (BUILD_BRIEF 3.2).
  shop({ key: 'assay', name: 'Assay Office', x: T.x - 2, z: T.z - 22, w: 9, trim: 0x2a8a86, sells: 'assay' });
  shop({ key: 'gems', name: 'Gem Buyer', x: T.x - 21, z: T.z - 25, w: 7, trim: 0x9a2a4a, sells: 'gems' });
  shop({ key: 'store', name: 'General Store', x: T.x + 22, z: T.z - 8, trim: 0xc8902c, shopId: 'store' });
  shop({ key: 'mill', name: 'Millwright', x: T.x + 23, z: T.z + 12, trim: 0x2a8a86, shopId: 'millwright' });
  const wag = shop({ key: 'wagons', name: 'Wagon Shed', x: T.x + 6, z: T.z + 26, w: 11, d: 7, trim: 0x56616e, bay: true });
  // The Wagon Shed's clerk stands at a desk by the bay.
  {
    const x = T.x + 6, z = T.z + 26, yaw = wag.yaw;
    const [kx, kz] = local(x, z, yaw, -6.6, 2.5);
    const ck = put(new THREE.Mesh(clerk(0x56616e), materials.vcolor), kx, kz, yaw);
    clerks.push({ mesh: ck, base: ck.position.y, phase: 4, busy: 0 });
    prop('shop', { shop: 'wagons', name: 'Wagon Shed' }, kx, gy + 1.1, kz, 0.3, 0.9, 0.3, yaw);
    const [dx, dz] = local(x, z, yaw, -6.6, 3.4); put(new THREE.Mesh(counter(1.6), materials.vcolor), dx, dz, yaw); box('ctr-wag', dx, gy + 0.53, dz, 0.8, 0.53, 0.45, yaw);
    const [px, pz] = local(x, z, yaw, 0, 7.5); pads.wagons = [px, gy + 0.3, pz]; pads.yard = [px, gy + 1.2, pz, yaw + Math.PI];
  }
  shop({ key: 'guild', name: 'Guild Hall', x: T.x - 22, z: T.z - 6, w: 10, d: 7, trim: 0x6e56a8 });
  shop({ key: 'foundry', name: 'Foundry Yard', x: T.x - 18, z: T.z + 18, trim: 0xa84a3a, shopId: 'foundry' });
  shop({ key: 'signal', name: 'Signal House', x: T.x + 16, z: T.z - 26, w: 7, trim: 0x6e56a8, shopId: 'signal' });
  // The Machine Shop: blueprints plus ingots on its counter make Mk II-IV machines.
  const workshop = shop({ key: 'machineshop', name: 'Machine Shop', x: T.x - 12, z: T.z + 31, w: 9, d: 6, trim: 0x4f7396, shopId: 'machineshop' });
  // Upper Falls (BUILD_BRIEF 3.2): a gem cutter and a fourth market buyer.
  const H = HAMLET;
  const cutter = shop({ key: 'cutter', name: 'Gem Cutter', x: H.x - 8, z: H.z - 9, w: 7, trim: 0x9a2a4a, sells: 'cutter', c: H, bellKind: 'cutbell' });
  shop({ key: 'hamlet-inn', name: 'The Falls Inn', x: H.x + 10, z: H.z - 7, w: 9, d: 6, trim: 0x56616e, bay: true, c: H });
  for (const [dx, dz, w, trim] of [[-14, 6, 6, 0x6e4c2e], [12, 9, 6, 0xa84a3a]]) { const x = H.x + dx, z = H.z + dz, yaw = Math.atan2(H.x - x, H.z - z); put(new THREE.Mesh(building({ w, d: 5, trim, bay: true }), materials.vcolor), x, z, yaw, H.y); box('ham' + dx, x, H.y + 2.2, z, w / 2, 2.2, 2.5, yaw); }
  // Guild board (contracts + claim deeds) in front of the Guild Hall.
  {
    const x = T.x - 15.5, z = T.z - 6, yaw = faceYaw(x, z);
    const frame = put(new THREE.Mesh(merge([paint(place(new THREE.BoxGeometry(2.4, 1.6, 0.1), 0, 1.6, 0), 0x6e4c2e, 0.06), paint(place(new THREE.BoxGeometry(0.12, 2.4, 0.12), -1.1, 1.2, -0.05), 0x6e4c2e, 0.06), paint(place(new THREE.BoxGeometry(0.12, 2.4, 0.12), 1.1, 1.2, -0.05), 0x6e4c2e, 0.06)]), materials.vcolor), x, z, yaw);
    void frame;
    const face = textPlane(['GUILD CONTRACTS', 'Press E to read'], { w: 2.2, h: 1.4, bg: '#efe4cc', fg: '#2b3440', font: 'bold 52px' });
    const [fx, fz] = local(x, z, yaw, 0, 0.075); put(face, fx, fz, yaw, gy + 1.6);
    prop('guild', { name: 'Guild board' }, x, gy + 1.6, z, 1.2, 0.8, 0.15, yaw);
  }
  // Market square: three stalls with chalkboards, and a fourth at Upper Falls.
  const STALL_TRIM = [0xa84a3a, 0x2a8a86, 0xc8902c, 0x6e56a8];
  for (let i = 0; i < 4; i++) {
    const hamlet = i === 3, gy = hamlet ? H.y : T.y;
    const x = hamlet ? H.x + 1 : T.x - 7 + i * 7, z = hamlet ? H.z + 8 : T.z + 6, yaw = Math.PI; // facing north
    put(new THREE.Mesh(stall(STALL_TRIM[i]), materials.vcolor), x, z, yaw, gy);
    put(new THREE.Mesh(counter(2.6), materials.vcolor), x, z - 0.7, yaw, gy);
    box('stall' + i, x, gy + 0.53, z - 0.7, 1.3, 0.53, 0.45, yaw);
    for (const [px, pz] of [[-1.3, -0.6], [1.3, -0.6], [-1.3, 0.6], [1.3, 0.6]]) box(`stallpost${i}${px}${pz}`, x - px, gy + 1.3, z - pz, 0.07, 1.3, 0.07);
    const ck = put(new THREE.Mesh(clerk(STALL_TRIM[i]), materials.vcolor), x, z + 0.1, yaw, gy);
    clerks.push({ mesh: ck, base: ck.position.y, phase: i * 2.3 + 1, busy: 0 });
    put(new THREE.Mesh(bell(), materials.vcolor), x + 1.0, z - 0.75, yaw, gy + 1.05);
    const id = prop('bell', { venue: i, name: hamlet ? 'Upper Falls stall' : `Market stall ${i + 1}` }, x + 1.0, gy + 1.13, z - 0.75, 0.12, 0.1, 0.12);
    counters.push({ venue: i, bell: id, x, z: z - 0.7, yaw, top: gy + 1.05, w: 2.6, clerk: clerks[clerks.length - 1] });
    put(new THREE.Mesh(chalkboardFrame(), materials.vcolor), x - 2.1, z - 1.4, yaw + 0.3, gy);
    const face = textPlane(['…'], { w: 0.9, h: 1.1, bg: '#2a3330', fg: '#f4f0e0', font: 'bold 70px', px: 256, chalk: true });
    // Match the frame's backward lean (-0.12 about x) and sit just in front of it.
    const by = yaw + 0.3, off = 0.04;
    face.position.set(x - 2.1 + Math.sin(by) * off, gy + 1.0 + Math.sin(0.12) * off, z - 1.4 + Math.cos(by) * off);
    face.rotation.set(-0.12, by, 0, 'YXZ'); group.add(face);
    boards.push({ stall: i, face });
    prop('chalk', { stall: i, name: 'Chalkboard' }, x - 2.1, gy + 1.0, z - 1.4, 0.5, 0.65, 0.12, yaw + 0.3);
  }
  // Bridge to the Gravel Bar.
  {
    const zb = 52, rx = riverX(zb), len = 30, w = 4.2;
    const ends = [height(rx - len / 2, zb), height(rx + len / 2, zb)];
    const y = Math.max(ends[0], ends[1], waterY(zb) + 1.0) + 0.1;
    const m = new THREE.Mesh(bridge(len, w), materials.vcolor); put(m, rx, zb, Math.PI / 2, y);
    box('bridge', rx, y - 0.06, zb, len / 2, 0.08, w / 2);
    for (const s of [-1, 1]) {
      box('bridgerail' + s, rx, y + 0.5, zb + s * (w / 2 - 0.07), len / 2, 0.5, 0.07);
      // Ramps down to the bank at each end.
      const ex = rx + s * len / 2, gyEnd = height(ex + s * 3, zb), dy = y - gyEnd, rl = Math.hypot(3.2, dy);
      if (dy > 0.05) box('bridgeramp' + s, ex + s * 1.6, (y + gyEnd) / 2 - 0.08, zb, rl / 2, 0.08, w / 2, 0);
      if (dy > 0.05) statics[statics.length - 1].quat = [0, 0, Math.sin(s * Math.atan2(-dy, 3.2) / 2), Math.cos(Math.atan2(-dy, 3.2) / 2)];
      if (dy > 0.05) { const r = new THREE.Mesh(merge([paint(new THREE.BoxGeometry(rl, 0.14, w), 0x946234, 0.1, 9)]), materials.vcolor); r.position.set(ex + s * 1.6, (y + gyEnd) / 2 - 0.08, zb); r.rotation.z = s * Math.atan2(-dy, 3.2); r.castShadow = r.receiveShadow = true; group.add(r); }
    }
  }

  // ---- Interaction ----
  const counterItems = (c) => {
    const out = [], hw = (c.w || 3.2) / 2 + 0.05, cos = Math.cos(c.yaw), sin = Math.sin(c.yaw);
    for (const e of items.ents.values()) {
      if (e.loc !== 'loose' || !e.item) continue;
      const dx = e.pos[0] - c.x, dz = e.pos[2] - c.z, lx = dx * cos - dz * sin, lz = dx * sin + dz * cos;
      if (Math.abs(lx) < hw && Math.abs(lz) < 0.5 && e.pos[1] > c.top - 0.1 && e.pos[1] < c.top + 1.4) out.push(e);
    }
    return out;
  };
  function ringBell(id) {
    const p = props.get(id), c = counters.find(k => k.bell === id);
    audio.play('pickup');
    const list = counterItems(c);
    if (!list.length) { hud.toast(c.venue === 'gems' ? 'Put uncut gems on the counter, then ring the bell' : c.venue === 'assay' ? 'Put ore and goods on the counter, then ring the bell' : 'Put goods on the stall counter, then ring'); return { total: 0 }; }
    const r = economy.sell(list.map(e => e.item), c.venue);
    const soldSet = new Set(r.sold);
    for (const e of list) if (soldSet.has(e.item)) items.remove(e.id);
    c.clerk.busy = 1.2;
    if (r.total > 0) { audio.play('coins'); hud.toast(`${p.name}: ${r.sold.length} item${r.sold.length > 1 ? 's' : ''} weighed and stamped · § ${r.total.toLocaleString('en-GB')}`, 'gold'); }
    if (r.refused.length) hud.toast(`${r.refused.length} left on the counter · ${r.refused[0].why}`, 'err');
    for (const k of r.completed) { audio.play('contract'); hud.toast(`Contract done: ${k.text} · § ${k.reward} · ★ +${k.standing}`, 'gold'); }
    if (c.venue !== 'assay') redrawBoards();
    return r;
  }
  function redrawBoards() {
    for (const b of boards) {
      const m = economy.state.market[b.stall]; if (!m) continue;
      const pct = Math.round(economy.stallMult(b.stall) * 100);
      b.face.userData.redraw(['TODAY', wantLabel(m.want), `${pct}% ${pct > 100 ? '↑' : '='}`]);
    }
  }
  function deliver(shopId, entry) {
    const base = pads[shopId], r = () => (Math.random() - 0.5) * 1.2;
    if (entry.spawn === 'vehicle') { const y = pads.yard; vehicles.spawn(entry.data.type, [y[0] + 4, y[1], y[2]], y[3]); return; }
    const pos = [base[0] + r(), base[1] + 0.6, base[2] + r()];
    if (entry.spawn === 'crate') items.spawn('crate', pos, { data: { ...entry.data } });
    else if (entry.spawn === 'sack') items.spawn('sack', pos, { data: {} });
    else if (entry.spawn === 'coil') items.spawn('coil', pos, { data: { ...entry.data } });
    else items.spawn(entry.spawn, pos, { data: { loads: [], contents: [], ...(entry.data || {}), ...(entry.data ? { name: entry.name } : {}) } });
  }
  function buy(shopId, itemId) {
    const entry = SHOPS[shopId].items.find(i => i.id === itemId);
    if (entry.standing && economy.state.standing < entry.standing) { audio.play('error'); hud.toast(`${entry.name} needs ★ ${entry.standing} Guild Standing`, 'err'); return false; }
    if (!economy.spend(entry.price)) { audio.play('error'); hud.toast(`Not enough Scrip for ${entry.name}`, 'err'); return false; }
    deliver(shopId, entry); audio.play('coins');
    hud.toast(`${entry.name} · delivered to the pad`, 'gold');
    return true;
  }
  function openShop(shopId) {
    const S = SHOPS[shopId];
    const render = () => {
      const body = h('div', {}, h('p', { class: 'small' }, S.blurb + ' · deliveries go to the pad beside the counter'),
        ...S.items.map(it => h('div', { class: 'entry' }, h('b', {}, it.name), it.standing && economy.state.standing < it.standing ? h('span', { class: 'pill' }, `Needs ★ ${it.standing}`) : h('button', { class: 'btn primary', disabled: economy.state.scrip < it.price, onclick: () => { api.buy(shopId, it.id); render(); } }, `§ ${it.price.toLocaleString('en-GB')}`), h('span', { class: 'desc' }, it.desc))),
        ...(S.callVehicle ? [h('h3', {}, 'Your vehicles'), ...[...vehicles.list.values()].filter(v => !v.def.kinematic).map(v => h('div', { class: 'entry' }, h('b', {}, v.def.name),
          h('span', { class: 'row' }, h('button', { class: 'btn', onclick: () => { api.callVehicle(v.id); panels.close(); } }, 'Call'), ' ', h('button', { class: 'btn', onclick: async () => { if (v.cargo.length) { audio.play('error'); hud.toast('Empty its bed first', 'err'); return; } if (vehicles.driving === v.id) return; const back = Math.round((v.def.price || 0) * 0.5); await vehicles.remove(v.id); economy.state.scrip += back; audio.play('coins'); hud.toast(`Sold the ${v.def.name} back for § ${back}`, 'gold'); render(); } }, `Sell § ${Math.round((v.def.price || 0) * 0.5)}`)),
          h('span', { class: 'desc' }, `Fuel ${v.def.fuelMax ? Math.round(v.fuel / v.def.fuelMax * 100) + '%' : '—'}${v.cargo.length ? ` · ${v.cargo.length} in the bed` : ''} · Call brings it to the yard.`)))] : []));
      panels.show('shop:' + shopId, S.name, body, { badge: `§ ${economy.state.scrip.toLocaleString('en-GB')}` });
    };
    render();
  }
  function callVehicle(id) {
    const v = id != null ? vehicles.list.get(id) : [...vehicles.list.values()].find(k => !k.def.kinematic); if (!v) return;
    const y = pads.yard; vehicles.teleport(v.id, [y[0], y[1], y[2]], y[3]); hud.toast(`Your ${v.def.name} is waiting in the yard`);
  }
  function openGuild() {
    const E = economy.state;
    const render = () => {
      const body = h('div', {},
        h('h3', {}, 'Contracts'),
        ...E.contracts.map(c => h('div', { class: 'entry' + (c.done ? ' done' : '') }, h('b', {}, c.text), h('span', { class: 'pill' }, `§ ${c.reward} · ★ ${c.standing}`), h('span', { class: 'bar' }, h('i', { style: { width: Math.min(100, c.progress / c.target * 100) + '%' } })))),
        h('p', { class: 'small' }, 'Contracts fill as you sell matching goods anywhere in town. New ones arrive as you finish them.'),
        h('h3', {}, 'Claim deeds'),
        ...CLAIMS.filter(c => c.voxel).map(c => h('div', { class: 'entry' }, h('b', {}, c.name), economy.owns(c.id) ? h('span', { class: 'pill' }, 'Owned') : (E.standing < (c.standing || 0) ? h('span', { class: 'pill' }, `Needs ★ ${c.standing}`) : h('button', { class: 'btn primary', disabled: E.scrip < c.price, onclick: () => { const r = economy.buyClaim(c.id); if (r === 'ok') { audio.play('coins'); hud.toast(`${c.name} is yours${c.tunnel ? ' — the adit door is open' : ''}`, 'gold'); } render(); } }, `§ ${c.price.toLocaleString('en-GB')}`)), h('span', { class: 'desc' }, `${c.blurb || ''} · ${c.w} × ${c.d} m · ${c.depth} m deep${c.standing ? ` · ★ ${c.standing}` : ''}`))),
      );
      panels.show('guild', 'Guild Hall', body, { badge: `§ ${E.scrip.toLocaleString('en-GB')} · ★ ${E.standing}` });
    };
    render();
  }

  const api = {
    group, props, counters, pads, statics, custom: {}, customProp: {}, customHint: {}, customCard: {},
    async build() { await physics.call({ op: 'batch', ops: statics }); redrawBoards(); },
    has: (id) => props.has(id),
    kindOf: (id) => props.get(id)?.kind,
    interact(id) {
      const p = props.get(id); if (!p) return;
      if (p.kind === 'bell') return ringBell(id);
      if (p.kind === 'shop' && api.custom[p.shop]) return api.custom[p.shop]();
      if (p.kind === 'cutbell' || api.customProp[p.kind]) return (api.customProp[p.kind] || api.customProp.cutbell)?.(p, id);
      if (p.kind === 'shop') return openShop(p.shop);
      if (p.kind === 'guild') return openGuild();
    },
    hint(id) { const p = props.get(id); if (!p) return ''; if (api.customHint[p.kind]) return api.customHint[p.kind](p); return p.kind === 'bell' ? 'ring the bell to sell' : p.kind === 'shop' ? `browse the ${p.name}` : p.kind === 'guild' ? 'read the contracts' : ''; },
    card(id) {
      const p = props.get(id); if (!p) return null;
      if (api.customCard[p.kind]) return api.customCard[p.kind](p, id);
      if (p.kind === 'chalk') { const m = economy.state.market[p.stall]; return { name: `Stall ${p.stall + 1} wants`, lines: [wantLabel(m.want), `Pays ${Math.round(economy.stallMult(p.stall) * 100)}% of base today`] }; }
      if (p.kind === 'bell') { const c = counters.find(k => k.bell === id), list = counterItems(c); const q = list.reduce((a, e) => a + (economy.quote(e.item, c.venue) ?? 0), 0); return { name: p.name, lines: [list.length ? `${list.length} on the counter · ≈ § ${Math.round(q)}` : 'Counter is empty'] }; }
      return { name: p.name };
    },
    newDay() { redrawBoards(); },
    update(dt) {
      for (const c of clerks) { c.phase += dt; c.busy = Math.max(0, c.busy - dt); c.mesh.position.y = c.base + Math.sin(c.phase * 1.6) * 0.012 + (c.busy > 0 ? Math.abs(Math.sin(c.busy * 9)) * 0.05 : 0); c.mesh.rotation.z = Math.sin(c.phase * 0.7) * 0.02; }
    },
    ringBell, buy, deliver, callVehicle, counterItems, openGuild, openShop, workshop, cutter, faceYaw, local, put, box, prop,
  };
  void MATERIALS; void itemName;
  return api;
}
