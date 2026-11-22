// The truck bed's inventory screen: see everything in the bed, take any item
// into your hands, put what you're holding in, or unload it all behind the
// tailgate. G onto the bed still works too.
import * as THREE from 'three';
import { h } from '../ui/dom.js';
import { MATERIALS, itemValue } from '../defs/materials.js';
import { TOOLS, toolDef } from '../defs/items.js';

export const swatch = (e) => {
  if (!e) return '#ccc';
  if (e.item) return '#' + MATERIALS[e.item.material].color.toString(16).padStart(6, '0');
  return { shovel: '#8a949c', pick: '#5f6870', pan: '#707880', bucket: '#a8743e', clod: '#8c6040', sack: '#b89a6a', crate: '#c8a070' }[e.type] || '#999';
};
export function slotCard(items, id) {
  const e = id != null ? items.get(id) : null;
  if (!e) return null;
  const c = items.card(id) || { name: e.type, lines: [] };
  let sub = '';
  if (e.item) sub = `${e.item.kg.toFixed(2)} kg`;
  else if (TOOLS[e.type]) { const t = toolDef(e); sub = t.loads ? `${e.data.loads.length}/${t.loads} loads` + (e.data.contents?.length ? ` · ${e.data.contents.length} finds` : '') : ''; }
  return { name: c.name, sub, color: swatch(e) };
}

export function createBed({ panels, items, vehicles, hands, hud, audio }) {
  function freeHand() {
    if (!hands.hand) return true;
    const cur = items.get(hands.hand);
    if (TOOLS[cur.type] && !hands.slot) { hands.slot = hands.hand; hands.hand = null; return true; }
    return false;
  }
  function open(vid) {
    const v = vehicles.list.get(vid); if (!v) return;
    const render = () => {
      const held = hands.hand ? items.get(hands.hand) : null;
      const rows = v.cargo.map(id => items.get(id)).filter(Boolean).map(e => {
        const c = items.card(e.id), val = e.item ? itemValue(e.item) : 0;
        return h('div', { class: 'entry' }, h('b', {}, h('span', { class: 'sw', style: { background: swatch(e) } }), ' ', c.name),
          h('button', { class: 'btn primary', onclick: () => {
            if (!freeHand()) { hud.toast('Hands full — put something down first', 'err'); return; }
            vehicles.removeCargo(vid, e.id); e.loc = 'held'; e.container = null; hands.hand = e.id; audio.play('pickup'); hands.play?.('equip'); render();
          } }, 'Take'),
          h('span', { class: 'desc' }, (c.lines || []).join(' · ') + (val ? '' : '')));
      });
      const kg = vehicles.cargoKg(vid);
      const body = h('div', {},
        h('p', { class: 'small' }, `${v.cargo.length} / ${v.def.cargoItems} items · ${kg.toFixed(0)} / ${v.def.cargoKg} kg`),
        held ? h('div', { class: 'entry' }, h('b', {}, h('span', { class: 'sw', style: { background: swatch(held) } }), ' ', items.card(held.id)?.name || held.type),
          h('button', { class: 'btn primary', onclick: () => { const r = putIn(vid, held); if (r === 'ok') render(); } }, 'Put in bed'), h('span', { class: 'desc' }, 'In your hand')) : null,
        rows.length ? h('h3', {}, 'In the bed') : h('p', { class: 'small' }, 'The bed is empty. Drop things onto it with G, or put what you hold in from here.'),
        ...rows,
        rows.length ? h('div', { class: 'entry' }, h('b', {}, 'Unload everything'), h('button', { class: 'btn', onclick: () => { unloadAll(vid); render(); } }, 'Unload'), h('span', { class: 'desc' }, 'Sets it all down behind the tailgate.')) : null);
      panels.show('bed:' + vid, `${v.def.name} · bed`, body, { badge: `${v.cargo.length} items` });
    };
    render();
  }
  // Put an item into the next free spot on the bed floor.
  function putIn(vid, e) {
    const v = vehicles.list.get(vid), b = v.def.bed;
    const n = v.cargo.length, cols = 4;
    const lx = -b.x + 0.2 + (n % cols) * ((2 * b.x - 0.4) / (cols - 1)), lz = b.z1 - 0.25 - Math.floor(n / cols) % 6 * 0.38;
    const wp = new THREE.Vector3(lx, b.y, lz).applyMatrix4(v.group.matrixWorld).toArray();
    const r = vehicles.addCargo(vid, e, wp);
    if (r === 'ok') { if (hands.hand === e.id) hands.hand = null; audio.play('drop'); }
    else hud.toast(r === 'full' ? 'The bed is full' : r === 'heavy' ? 'Too heavy for the bed' : 'No room there', 'err');
    return r;
  }
  function unloadAll(vid) {
    const v = vehicles.list.get(vid);
    const ids = v.cargo.slice();
    ids.forEach((id, i) => {
      const e = items.get(id); if (!e) return;
      vehicles.removeCargo(vid, id);
      const lp = new THREE.Vector3(-0.6 + (i % 4) * 0.4, 1.2 + Math.floor(i / 4) * 0.25, v.def.bed.z0 - 1.0 - Math.floor(i / 12) * 0.4).applyMatrix4(v.group.matrixWorld);
      items.place(id, lp.toArray());
    });
    audio.play('pour');
    hud.toast(`Unloaded ${ids.length} item${ids.length === 1 ? '' : 's'} behind the truck`);
  }
  return { open, putIn, unloadAll };
}
