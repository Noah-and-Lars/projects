// Camp gear (BUILD_BRIEF 3.6, 3.7 and 4): a bedroll to sleep through the
// night, brass lanterns that light the ground they stand on, a hand scale,
// and firewood the kiln turns into charcoal (see machines.js).
//
// Sleeping: RMB on a bedroll after 19:00 (or before 05:00). In single player
// it skips to 06:00; in co-op it waits until every player is in a bed (each
// "in bed" lasts 20 s), then skips for everyone.
import * as THREE from 'three';
import * as M from '../defs/models.js';
import { EXTRA_MESH, EXTRA_BOX, EXTRA_CARD, EXTRA_MASS } from './items.js';
import { MATERIALS, itemValue } from '../defs/materials.js';

EXTRA_MESH.bedroll = () => M.bedroll();
EXTRA_BOX.bedroll = () => [0.31, 0.13, 0.13];
EXTRA_MASS.bedroll = () => 3;
EXTRA_CARD.bedroll = () => ({ name: 'Bedroll', lines: ['RMB to sleep (after 19:00)', 'In co-op, everyone must be in a bed'] });
EXTRA_MESH.lantern = () => M.lantern();
EXTRA_BOX.lantern = () => [0.075, 0.12, 0.075];
EXTRA_MASS.lantern = () => 1.5;
EXTRA_CARD.lantern = () => ({ name: 'Brass lantern', lines: ['Set it down: it lights up at dusk', 'Good for a base or the adit'] });
EXTRA_MESH.scale = () => M.handScale();
EXTRA_BOX.scale = () => [0.1, 0.17, 0.1];
EXTRA_MASS.scale = () => 1;
EXTRA_CARD.scale = () => ({ name: 'Hand scale', lines: ['LMB on a pile, bin, truck bed or find', 'Weighs it and tallies its value'] });
EXTRA_MESH.firewood = () => M.firewood();
EXTRA_BOX.firewood = () => [0.15, 0.1, 0.21];
EXTRA_MASS.firewood = () => 6;
EXTRA_CARD.firewood = () => ({ name: 'Firewood', lines: ['Put it in a lit kiln:', 'it chars into a sack of charcoal'] });

export const SLEEP_FROM = 19 / 24, SLEEP_UNTIL = 5 / 24, WAKE_AT = 6 / 24;
const LIGHTS = 4; // pooled point lights for placed lanterns

export function createCamp({ scene, camera, items, hands, economy, town, hud, audio, state, view, ui, h }) {
  const api = { coop: null, sleepers: new Map() };
  const canSleep = () => state.time >= SLEEP_FROM || state.time < SLEEP_UNTIL;
  const fade = h('div', { id: 'sleep-fade' });
  ui.append(fade);

  // Skip to morning (the host's clock; guests follow it in snapshots).
  api.skipNight = () => {
    if (state.time >= SLEEP_FROM) { state.day++; economy.newDay(state.day); town.newDay(); }
    state.time = WAKE_AT;
    api.sleepers.clear();
    api.wake();
    audio.play('contract');
    hud.toast(`Morning, day ${state.day}. Rested and ready.`, 'gold');
  };
  // Darken and lift the screen (also run on guests when the host says so).
  api.wake = () => { fade.classList.add('on'); setTimeout(() => fade.classList.remove('on'), 900); };
  // A player gets into a bed: 'host' or a guest's id.
  api.sleep = (who, say) => {
    if (!canSleep()) { say("You can only sleep at night (after 19:00)", 'err'); return false; }
    const now = performance.now();
    api.sleepers.set(who, now + 20000);
    const all = ['host', ...(api.coop?.role === 'host' ? [...api.coop.guests.keys()] : [])];
    const asleep = all.filter(k => (api.sleepers.get(k) || 0) > now).length;
    if (asleep < all.length) { hud.toast(`${asleep} of ${all.length} in bed: waiting for everyone to sleep`, 'gold'); return true; }
    api.skipNight();
    return true;
  };

  // RMB on a bedroll sleeps (host hands and guests' headless hands alike).
  hands.secHook = (info, H) => {
    if (info.kind !== 'item' || info.dist > 3.2 || info.ent?.type !== 'bedroll') return false;
    const who = H === hands ? 'host' : (api.coop?.acting?.id ?? 'host');
    api.sleep(who, (t, k) => (H.hud || hud).toast(t, k));
    return true;
  };
  // LMB with the hand scale weighs what it's aimed at.
  const prevUse = hands.useHook, prevHint = hands.hintHook;
  hands.useHook = (e, info, H = hands) => {
    if (e.type !== 'scale') return prevUse?.(e, info, H) || false;
    const say = (t) => (H.hud || hud).toast(t);
    const list = [];
    if (info.kind === 'item' && info.ent) {
      const t = info.ent;
      if (t.item) list.push(t.item);
      else if (t.type === 'pile') for (const kg of t.data.kgs) list.push({ material: t.data.material, stage: t.data.stage, kg });
      else if (t.data?.contents) for (const id of t.data.contents) { const c = items.get(id); if (c?.item) list.push(c.item); }
    } else if (info.kind === 'machine' && info.m?.state?.contents) list.push(...info.m.state.contents);
    else if (info.kind === 'vehicle') { const v = H.vehicles?.list.get(info.id); for (const id of v?.cargo || []) { const c = items.get(id); if (c?.item) list.push(c.item); } }
    if (!list.length) { say('Nothing to weigh there'); return true; }
    const kg = list.reduce((a, it) => a + it.kg, 0), val = list.reduce((a, it) => a + (MATERIALS[it.material]?.kind === 'fuel' ? 0 : itemValue(it)), 0);
    audio.play('tick'); say(`${list.length} item${list.length > 1 ? 's' : ''} · ${kg.toFixed(2)} kg · ≈ § ${Math.round(val).toLocaleString('en-GB')}`);
    return true;
  };
  hands.hintHook = (e, info, H = hands) => {
    if (e.type === 'scale') return '{LMB} weigh';
    return prevHint?.(e, info, H) || '';
  };

  // Placed lanterns: the nearest few get a real point light after dusk.
  const pool = [];
  for (let i = 0; i < LIGHTS; i++) { const l = new THREE.PointLight(0xffc27a, 0, 14, 1.8); l.castShadow = false; scene.add(l); pool.push(l); }
  let t = 0;
  api.update = (dt) => {
    t -= dt; if (t > 0) return; t = 0.25;
    const night = view.env?.night ?? 0, cam = camera.position, lit = [];
    for (const e of items.ents.values()) if (e.type === 'lantern' && e.loc === 'loose') lit.push([e, (e.pos[0] - cam.x) ** 2 + (e.pos[2] - cam.z) ** 2]);
    lit.sort((a, b) => a[1] - b[1]);
    pool.forEach((l, i) => {
      const e = lit[i]?.[0];
      if (!e || lit[i][1] > 70 * 70) { l.intensity = 0; return; }
      l.position.set(e.pos[0], e.pos[1] + 0.3, e.pos[2]);
      l.intensity = 4 * Math.max(0.15, night);
    });
  };
  return api;
}
