// Millbrook: buildings, counters, bells, clerks, the price board, the guild
// board, delivery pads and the bridge to the Gravel Bar. Selling is
// physical (BUILD_BRIEF 3.6): put goods on a counter and ring the bell; the
// clerk weighs and stamps them and the ledger pays out.
import * as THREE from 'three';
import { TOWN, HAMLET, riverX, waterY, height, CLAIMS } from '../world/valley.js';
import { building, counter, bell, textPlane, clerk, pad, bridge } from '../render/buildings.js';
import { paint, merge, place } from '../render/geom.js';
import { SHOPS } from '../defs/shops.js';
import { MACHINES } from '../defs/machines.js';
import { MATERIALS, itemName, CRAFT_MULT, ALLOYS, ALLOY_GRADES } from '../defs/materials.js';
import { EXTRA_MESH, EXTRA_BOX, EXTRA_CARD, EXTRA_MASS } from './items.js';
import { h } from '../ui/dom.js';
import { previews } from '../ui/preview.js';

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
  // The one place that buys: the Assay Office takes everything, at today's prices.
  const assay = shop({ key: 'assay', name: 'Assay Office', sign: 'Assay Office · We buy everything', x: T.x - 2, z: T.z - 22, w: 9, trim: 0x2a8a86, sells: 'assay' });
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
  // Today's prices: a big board beside the Assay Office (E opens the full list).
  {
    const x0 = T.x - 2, z0 = T.z - 22, yaw = assay.yaw;
    const [x, z] = local(x0, z0, yaw, -6.4, 4.4), by = yaw + 0.25;
    put(new THREE.Mesh(merge([paint(place(new THREE.BoxGeometry(2.9, 2.5, 0.12), 0, 1.95, 0), 0x6e4c2e, 0.06), paint(place(new THREE.BoxGeometry(0.14, 3.3, 0.14), -1.35, 1.65, -0.06), 0x5a3c22, 0.06), paint(place(new THREE.BoxGeometry(0.14, 3.3, 0.14), 1.35, 1.65, -0.06), 0x5a3c22, 0.06), paint(place(new THREE.BoxGeometry(3.1, 0.16, 0.3), 0, 3.28, 0), 0x2a8a86, 0.05)]), materials.vcolor), x, z, by);
    const face = new THREE.Mesh(new THREE.PlaneGeometry(2.7, 2.3), new THREE.MeshBasicMaterial({ toneMapped: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
    const [fx, fz] = local(x, z, by, 0, 0.07); face.position.set(fx, gy + 1.95, fz); face.rotation.y = by; group.add(face);
    boards.push({ face });
    prop('prices', { name: "Today's prices" }, x, gy + 1.95, z, 1.45, 1.25, 0.12, by);
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

  // Performance (BUILD_BRIEF 8): bake every static vertex-coloured town mesh
  // into one geometry, so buildings, counters, stalls and the bridge cost a
  // single draw call (plus its shadow passes) instead of a hundred.
  function mergeStatic() {
    const moving = new Set(clerks.map(c => c.mesh));
    const list = group.children.filter(m => m.isMesh && m.material === materials.vcolor && !moving.has(m) && !m.children.length);
    if (list.length < 2) return;
    const geos = list.map(m => { m.updateMatrixWorld(true); const g = (m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone()); g.applyMatrix4(m.matrixWorld); return g; });
    const merged = new THREE.Mesh(merge(geos), materials.vcolor);
    merged.castShadow = merged.receiveShadow = true; merged.name = 'town-static';
    for (const m of list) { group.remove(m); m.geometry.dispose(); }
    group.add(merged);
  }

  // ---- Interaction ----
  const onCounterTop = (c, p) => {
    const hw = (c.w || 3.2) / 2 + 0.05, dx = p[0] - c.x, dz = p[2] - c.z, lx = dx * Math.cos(c.yaw) - dz * Math.sin(c.yaw), lz = dx * Math.sin(c.yaw) + dz * Math.cos(c.yaw);
    return Math.abs(lx) < hw + 0.5 && Math.abs(lz) < 1 && p[1] > c.top - 0.5 && p[1] < c.top + 2;
  };
  items.noMerge.push((p) => counters.some(c => onCounterTop(c, p)));
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
    if (!list.length) { hud.toast('Put ore and goods on the counter, then ring the bell'); return { total: 0 }; }
    const r = economy.sell(list.map(e => e.item), c.venue);
    const soldSet = new Set(r.sold);
    for (const e of list) if (soldSet.has(e.item)) items.remove(e.id);
    c.clerk.busy = 1.2;
    if (r.total > 0) { audio.play('coins'); hud.toast(`${p.name}: ${r.sold.length} item${r.sold.length > 1 ? 's' : ''} weighed and stamped · $${r.total.toLocaleString('en-GB')}`, 'gold'); }
    if (r.refused.length) hud.toast(`${r.refused.length} left on the counter · ${r.refused[0].why}`, 'err');
    for (const k of r.completed) { audio.play('contract'); hud.toast(`Contract done: ${k.text} · $${k.reward}`, 'gold'); }
    return r;
  }
  // The price board's face: every material, its two forms in $ per kg, and
  // whether it went up or down this morning.
  let drawnDay = -1;
  function redrawBoards() {
    const list = economy.priceList(); drawnDay = economy.state.day;
    const c = document.createElement('canvas'); c.width = 1024; c.height = 872; const g = c.getContext('2d');
    g.fillStyle = '#26302c'; g.fillRect(0, 0, c.width, c.height);
    g.strokeStyle = 'rgba(244, 240, 224, 0.35)'; g.lineWidth = 6; g.strokeRect(14, 14, c.width - 28, c.height - 28);
    const font = (px, w = 'bold') => `${w} ${px}px ui-rounded, "Nunito", "Segoe UI", sans-serif`;
    g.fillStyle = '#f4f0e0'; g.textBaseline = 'middle'; g.textAlign = 'center'; g.font = font(58); g.fillText("TODAY'S PRICES", c.width / 2, 70);
    g.font = font(28, '600'); g.fillStyle = '#c8d8c8'; g.fillText(`$ per kg · day ${economy.state.day}`, c.width / 2, 118);
    g.font = font(24, '700'); g.textAlign = 'right'; g.fillText('RAW', 640, 160); g.fillText('REFINED', 870, 160); g.textAlign = 'center'; g.fillText('TODAY', 950, 160);
    g.font = font(20, '600'); g.textAlign = 'left'; g.fillText('raw: ore or uncut · refined: ingot or cut', 52, c.height - 34);
    const top = 182, rowH = (c.height - top - 62) / list.length;
    list.forEach((r, i) => {
      const y = top + rowH * (i + 0.5);
      if (i % 2 === 0) { g.fillStyle = 'rgba(255,255,255,0.05)'; g.fillRect(30, y - rowH / 2, c.width - 60, rowH); }
      g.textAlign = 'left'; g.fillStyle = '#f4f0e0'; g.font = font(Math.min(44, rowH * 0.62)); g.fillText(r.name, 52, y);
      g.textAlign = 'right'; g.font = font(Math.min(38, rowH * 0.55), '600');
      r.forms.forEach((f, k) => { g.fillStyle = '#f4f0e0'; g.font = font(Math.min(40, rowH * 0.62)); g.fillText(`$${f.perKg % 1 ? f.perKg.toFixed(2) : f.perKg}`, 640 + (r.forms.length === 1 ? 1 : k) * 230, y); });
      if (r.forms.length === 1) { g.fillStyle = '#a8b0a8'; g.fillText('alloy', 640, y); } // alloys only come as ingots
      g.textAlign = 'center'; g.font = font(Math.min(42, rowH * 0.6)); g.fillStyle = r.trend > 0 ? '#8ce08c' : r.trend < 0 ? '#f08a7a' : '#a8b0a8'; g.fillText(r.trend > 0 ? '▲' : r.trend < 0 ? '▼' : '–', 950, y);
    });
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
    for (const b of boards) { b.face.material.map?.dispose(); b.face.material.map = tex; b.face.material.needsUpdate = true; }
  }
  // The full list, with what crafted goods and gem sizes do to the price.
  function openPrices() {
    const list = economy.priceList();
    const body = h('div', {},
      h('p', { class: 'small' }, `Day ${economy.state.day}. The Assay Office buys everything at these prices; they move a little every morning (▲ up, ▼ down since yesterday).`),
      h('div', { class: 'price-table' },
        h('div', { class: 'ph' }, h('span', {}, 'Material'), h('span', {}, 'Raw'), h('span', {}, 'Refined'), h('span', {}, 'Today')),
        ...list.map(r => h('div', { class: 'pr' }, h('b', {}, r.name), ...(r.forms.length === 1 ? [h('span', {}, h('small', {}, 'alloy'))] : []), ...r.forms.map(f => h('span', {}, `$${f.perKg % 1 ? f.perKg.toFixed(2) : f.perKg} /kg`, h('small', {}, ` ${f.stage}`))), h('span', { class: r.trend > 0 ? 'up' : r.trend < 0 ? 'down' : '' }, `${r.trend > 0 ? '▲' : r.trend < 0 ? '▼' : '–'} ${Math.round(r.factor * 100)}%`)))),
      h('p', { class: 'small' }, `Gems: bigger stones pay more per kilo. Crafted goods pay their metal's ingot price × ${Object.entries(CRAFT_MULT).map(([k, v]) => `${k === 'toolhead' ? 'tool head' : k} ${v}`).join(', ')}, plus any gem set in. Quartz is fuel and isn't bought.`),
      h('p', { class: 'small' }, `Alloys: melt two metals together in one kiln, crucible or smelter. ${Object.entries(ALLOYS).map(([k, a]) => `${MATERIALS[k].name} ${Math.round(a.ideal * 100)}% ${a.a} + ${a.b}`).join(' · ')}. The refined price is a fine pour (within 5 points of the mix: ×${ALLOY_GRADES.fine.mult} the metals' ingot worth); good pours (within 15) pay ×${ALLOY_GRADES.good.mult}, rough ones ×1.`));
    panels.show('prices', "Today's prices", body, { badge: `day ${economy.state.day}` });
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
  // One catalogue (every shop's stock) at every counter: buy anything
  // anywhere; it's delivered to the pad of the shop you're standing at.
  const CATEGORY = { store: 'Tools and gear', millwright: 'Water, belts and machines', foundry: 'Furnaces and crafting', signal: 'Logic and signals', wagons: 'Vehicles and fuel' };
  const findEntry = (itemId) => { for (const S of Object.values(SHOPS)) { const e = S.items.find(i => i.id === itemId); if (e) return e; } return null; };
  function buy(shopId, itemId) {
    const entry = findEntry(itemId); if (!entry || !pads[shopId]) return false;
    if (!economy.spend(entry.price)) { audio.play('error'); hud.toast(`Not enough money for ${entry.name}`, 'err'); return false; }
    deliver(shopId, entry); audio.play('coins');
    hud.toast(`${entry.name} · ${entry.spawn === 'vehicle' ? 'waiting in the yard' : 'delivered to the pad'}`, 'gold');
    return true;
  }
  function openShop(shopId) {
    const S = SHOPS[shopId];
    const render = () => {
      const seen = new Set(), sections = [];
      for (const [key, shop] of Object.entries(SHOPS)) {
        const list = shop.items.filter(it => !seen.has(it.id) && seen.add(it.id));
        if (!list.length) continue;
        // Each thing for sale: its model turning slowly beside the name, the
        // description under the name, and the price.
        sections.push(h('h3', {}, CATEGORY[key] || shop.name), ...list.map(it => h('div', { class: 'item' },
          previews().entry(it.spawn, it.data, 'pv item-pic'),
          h('div', { class: 'item-text' }, h('b', {}, it.name), h('span', { class: 'desc' }, it.desc)),
          h('button', { class: 'btn primary item-buy', disabled: economy.state.scrip < it.price, onclick: () => { api.buy(shopId, it.id); render(); } }, `$${it.price.toLocaleString('en-GB')}`))));
      }
      const own = [...vehicles.list.values()].filter(v => !v.def.kinematic);
      const body = h('div', {}, h('p', { class: 'small' }, 'Everything in Millbrook is sold here. Things you buy go on the pad beside this counter; vehicles wait in the yard.'),
        ...sections,
        ...(own.length ? [h('h3', {}, 'Your vehicles'), ...own.map(v => h('div', { class: 'entry' }, h('b', {}, v.def.name),
          h('span', { class: 'row' }, h('button', { class: 'btn', onclick: () => { api.callVehicle(v.id); panels.close(); } }, 'Call'), ' ', h('button', { class: 'btn', onclick: async () => { await api.sellVehicle(v.id); render(); } }, `Sell $${vehicles.refund(v)}`)),
          h('span', { class: 'desc' }, `Fuel ${v.def.fuelMax ? Math.round(v.fuel / v.def.fuelMax * 100) + '%' : '—'}${v.cargo.length ? ` · ${v.cargo.length} in the bed` : ''} · Call brings it to the yard.`)))] : []));
      panels.show('shop:' + shopId, S.name, body, { badge: economy.sandbox ? '$∞' : `$${economy.state.scrip.toLocaleString('en-GB')}` });
    };
    render();
  }
  // Sell a vehicle back for half its price (bed and hopper must be empty;
  // the starter hauler was free, so it fetches nothing).
  async function sellVehicle(id) {
    const v = vehicles.list.get(id); if (!v || v.selling) return false;
    if (v.cargo.length || v.hopper?.length) { audio.play('error'); hud.toast('Empty it first', 'err'); return false; }
    if (vehicles.driving === v.id || vehicles.remoteDrivers?.has(v.id)) { hud.toast('Someone is driving it', 'err'); return false; }
    const back = vehicles.refund(v);
    v.selling = true; // a second click while the worker removes it pays nothing
    await vehicles.remove(v.id); economy.state.scrip += back; audio.play('coins'); hud.toast(`Sold the ${v.def.name} back for $${back}`, 'gold');
    return true;
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
        ...E.contracts.map(c => h('div', { class: 'entry' + (c.done ? ' done' : '') }, h('b', {}, c.text), h('span', { class: 'pill' }, `$${c.reward}`), h('span', { class: 'bar' }, h('i', { style: { width: Math.min(100, c.progress / c.target * 100) + '%' } })))),
        h('p', { class: 'small' }, 'Contracts fill as you sell matching goods at the Assay Office (smelting contracts fill as you pour). New ones arrive as you finish them.'),
        h('h3', {}, 'Claim deeds'),
        ...CLAIMS.filter(c => c.voxel).map(c => h('div', { class: 'entry' }, h('b', {}, c.name), economy.owns(c.id) ? h('span', { class: 'pill' }, 'Owned') : (h('button', { class: 'btn primary', disabled: E.scrip < c.price, onclick: () => { const r = economy.buyClaim(c.id); if (r === 'ok') { audio.play('coins'); hud.toast(`${c.name} is yours${c.tunnel ? ' — the adit door is open' : ''}`, 'gold'); } render(); } }, `$${c.price.toLocaleString('en-GB')}`)), h('span', { class: 'desc' }, `${c.blurb || ''} · ${c.w} × ${c.d} m · ${c.depth} m deep`))),
      );
      panels.show('guild', 'Guild Hall', body, { badge: `$${E.scrip.toLocaleString('en-GB')}` });
    };
    render();
  }

  const api = {
    shops: SHOPS,
    group, props, counters, pads, statics, custom: {}, customProp: {}, customHint: {}, customCard: {},
    async build() { await physics.call({ op: 'batch', ops: statics }); redrawBoards(); mergeStatic(); },
    has: (id) => props.has(id),
    kindOf: (id) => props.get(id)?.kind,
    interact(id) {
      const p = props.get(id); if (!p) return;
      if (p.kind === 'bell') return ringBell(id);
      if (p.kind === 'shop' && api.custom[p.shop]) return api.custom[p.shop]();
      if (p.kind === 'cutbell' || api.customProp[p.kind]) return (api.customProp[p.kind] || api.customProp.cutbell)?.(p, id);
      if (p.kind === 'shop') return openShop(p.shop);
      if (p.kind === 'guild') return openGuild();
      if (p.kind === 'prices') return openPrices();
    },
    hint(id) { const p = props.get(id); if (!p) return ''; if (api.customHint[p.kind]) return api.customHint[p.kind](p); return p.kind === 'bell' ? 'ring the bell to sell' : p.kind === 'shop' ? `browse the ${p.name}` : p.kind === 'guild' ? 'read the contracts' : p.kind === 'prices' ? "read today's prices" : ''; },
    card(id) {
      const p = props.get(id); if (!p) return null;
      if (api.customCard[p.kind]) return api.customCard[p.kind](p, id);
      if (p.kind === 'prices') { if (drawnDay !== economy.state.day) redrawBoards(); const l = economy.priceList().slice().sort((a, b) => b.factor - a.factor); return { name: "Today's prices", lines: [`Best today: ${l[0].name} (${Math.round(l[0].factor * 100)}%)`, 'E for the full list'] }; }
      if (p.kind === 'bell') { const c = counters.find(k => k.bell === id), list = counterItems(c); const q = list.reduce((a, e) => a + (economy.quote(e.item, c.venue) ?? 0), 0); return { name: p.name, lines: [list.length ? `${list.length} on the counter · ≈ $${Math.round(q)}` : 'Counter is empty'] }; }
      return { name: p.name };
    },
    newDay() { redrawBoards(); },
    update(dt) {
      for (const c of clerks) { c.phase += dt; c.busy = Math.max(0, c.busy - dt); c.mesh.position.y = c.base + Math.sin(c.phase * 1.6) * 0.012 + (c.busy > 0 ? Math.abs(Math.sin(c.busy * 9)) * 0.05 : 0); c.mesh.rotation.z = Math.sin(c.phase * 0.7) * 0.02; }
    },
    ringBell, buy, deliver, callVehicle, sellVehicle, counterItems, openGuild, openShop, workshop, cutter, faceYaw, local, put, box, prop,
  };
  void MATERIALS; void itemName;
  return api;
}
