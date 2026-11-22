// Progression and world state (BUILD_BRIEF 3.2, 3.3, 3.6): the Old Cut
// relic, the Ember Seam door, the Prospector's Lamp and its vein signal.
// Flags live in the economy state (economy.state.flags) so they save and sync.
import * as THREE from 'three';
import * as M from '../defs/models.js';
import { EXTRA_MESH, EXTRA_BOX, EXTRA_CARD, EXTRA_MASS } from './items.js';
import { relicSpot, VEINS } from '../world/claims.js';
import { CLAIMS } from '../world/valley.js';
import { MATERIALS } from '../defs/materials.js';
import { h } from '../ui/dom.js';

EXTRA_MESH.relic = () => M.governor();
EXTRA_BOX.relic = () => [0.17, 0.25, 0.08];
EXTRA_MASS.relic = () => 6;
EXTRA_CARD.relic = () => ({ name: 'Brass governor', lines: ['A relic left in the Old Cut', 'The Pumphouse needs it (stage 2)'] });
EXTRA_MESH.lamp = () => M.prospectorLamp();
EXTRA_BOX.lamp = () => [0.08, 0.12, 0.08];
EXTRA_MASS.lamp = () => 1.2;
EXTRA_CARD.lamp = () => ({ name: "Prospector's Lamp", lines: ['E to wear it', 'Hums and glows near a vein'] });

export function createProgress({ items, hands, economy, hud, audio, adit, physics, lantern, claims }) {
  const F = () => (economy.state.flags ||= {});
  const relic = relicSpot();
  const api = { signal: 0, nearVein: null };

  // Digging near the relic in the Old Cut turns it up (once per world).
  hands.onDig = (vol, c, r) => {
    if (vol.id !== 'oldcut' || F().relicFound) return;
    if (Math.hypot(c[0] - relic[0], c[1] - relic[1], c[2] - relic[2]) < r + 0.75) {
      F().relicFound = true;
      items.spawn('relic', [c[0], c[1] + 0.35, c[2]], { vel: [0, 1.5, 0] });
      audio.play('rare'); hud.toast('Something old in the pit: a brass governor from the Pumphouse', 'gold');
    }
  };
  api.onDig = hands.onDig;
  // E on the lamp wears it.
  hands.onWear = (e) => {
    if (e.type !== 'lamp') return false;
    items.remove(e.id); F().lamp = true;
    audio.play('pickup'); hud.toast("Wearing the Prospector's Lamp: it glows violet near a vein");
    return true;
  };

  // Vein meter (only with the lamp worn, or in the Survey Buggy).
  const fill = h('i');
  const meter = h('div', { id: 'veinmeter', class: 'pill hidden', title: 'Vein signal' }, h('span', {}, '⟡'), h('span', { class: 'bar' }, fill), h('span', { class: 'lbl' }, ''));
  hud.el.querySelector('.hud-tr').append(meter);
  // Signal 0..1 from the distance to the nearest vein's surface.
  api.veinSignal = (p, range = 14) => {
    let best = 0, which = null;
    for (const v of Object.values(VEINS)) {
      const d = Math.max(0, Math.hypot(p[0] - v.x, p[1] - v.y, p[2] - v.z) - v.r);
      const s = Math.max(0, 1 - d / range);
      if (s > best) { best = s; which = v; }
    }
    return { s: best, vein: which };
  };
  let tickT = 0, doorT = 0;
  api.update = (dt, pos, opts = {}) => {
    // The Ember Seam door opens for the deed holder.
    doorT -= dt;
    if (doorT <= 0) {
      doorT = 0.5;
      // However the ground around the relic went (any tool, a charge, the
      // excavator), once it's open to the air the relic turns up.
      if (!F().relicFound && economy.owns('oldcut') && !opts.guest) {
        const vol = claims?.volumes.get('oldcut');
        if (vol && vol.bandAt(relic[0], relic[1], relic[2]) === 0) hands.onDig(vol, relic, 0);
      }
      const own = economy.owns('ember');
      if (own !== adit.doorOpen) physics.post(adit.setDoor(own));
    }
    const worn = !!F().lamp;
    meter.classList.toggle('hidden', !worn && !opts.scanner);
    if (!worn && !opts.scanner) { api.signal = 0; return; }
    const { s, vein } = api.veinSignal(pos);
    api.signal += (s - api.signal) * Math.min(1, dt * 4); api.nearVein = vein;
    fill.style.width = Math.round(api.signal * 100) + '%';
    meter.lastChild.textContent = api.signal > 0.85 && vein ? MATERIALS[vein.material].name : api.signal > 0.05 ? `${Math.round(api.signal * 100)}%` : '—';
    // The lamp's light shifts to violet and it ticks faster as the signal grows.
    if (lantern && worn) lantern.color.setRGB(1 - api.signal * 0.45, 0.76 - api.signal * 0.3, 0.48 + api.signal * 0.5);
    tickT -= dt;
    if (api.signal > 0.08 && tickT <= 0) { audio.play('tick', api.signal); tickT = 1.2 - api.signal; }
  };
  api.claimOfVein = (v) => CLAIMS.find(c => c.id === v.claim);
  return api;
}
