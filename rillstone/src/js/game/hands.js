// What the player holds and does with it: one item in the hand plus one
// quick-swap tool slot (BUILD_BRIEF section 5). Tools dig claims, carry
// gravel loads and wash them in the river; E picks up, G drops at the ring.
import * as THREE from 'three';
import { TOOLS, toolDef, TIER_NAMES, BAND_NAMES, BAND_DIRT, nuggetSize, nuggetGeometry, toolGeometry, clodGeometry } from '../defs/items.js';
import { MATERIALS, itemName } from '../defs/materials.js';
import { brush, BEDROCK } from '../world/claims.js';
import { rollLoot } from '../sim/loot.js';
import { waterY } from '../world/valley.js';

const REACH = 3.2;

export function createHands({ scene, camera, physics, items, claims, water, fx, audio, hud, rng, materials, onFind }) {
  const H = { hand: null, slot: null, aim: null, cooldown: 0, swing: 0, ringOk: false, ringPos: null, lastMsg: 0 };
  // ---- Viewmodel ----
  scene.add(camera);
  const holder = new THREE.Group(); holder.position.set(0.34, -0.32, -0.62); camera.add(holder);
  let held3d = null, heldKey = '';
  function heldKeyOf(e) { return e ? `${e.id}:${e.data?.loads?.length || 0}:${e.data?.contents?.length || 0}` : ''; }
  function rebuildHeld() {
    const e = H.hand ? items.get(H.hand) : null;
    const k = heldKeyOf(e);
    if (k === heldKey) return;
    heldKey = k;
    if (held3d) { holder.remove(held3d); held3d.geometry.dispose(); held3d = null; }
    if (!e) return;
    let geo, mat = materials.vcolor;
    if (e.type === 'nugget') { geo = nuggetGeometry(MATERIALS[e.item.material].kind, e.item.material.length * 7); const s = Math.max(0.1, nuggetSize(e.item.kg, e.item.material)); geo.scale(s, s, s); mat = new THREE.MeshStandardMaterial({ color: MATERIALS[e.item.material].color, metalness: MATERIALS[e.item.material].metal, roughness: 0.4, flatShading: true, vertexColors: true }); }
    else if (e.type === 'clod') geo = clodGeometry(e.data.band);
    else geo = toolGeometry(e.type, e.data);
    held3d = new THREE.Mesh(geo, mat);
    if (e.type === 'shovel') { held3d.rotation.set(0.2, 3.56, 0.04); held3d.position.set(0.17, -0.03, 0.2); held3d.scale.setScalar(0.85); } // carried blade-forward, tip up, scoop facing you; shaft runs off bottom-right
    else if (e.type === 'pick') { held3d.rotation.set(0.35, Math.PI + 0.2, 0.25); held3d.position.set(0, 0.1, -0.1); }
    else if (e.type === 'pan') { held3d.position.set(-0.02, -0.06, -0.02); held3d.rotation.set(0.4, 0, 0); held3d.scale.setScalar(0.72); }
    else if (e.type === 'bucket') held3d.position.set(0, -0.08, 0);
    holder.add(held3d);
  }
  // Pan contents drawn as tiny nuggets in the pan.
  const panBits = new THREE.Group(); holder.add(panBits);
  let panKey = '';
  function rebuildPanBits() {
    const e = H.hand ? items.get(H.hand) : null;
    const list = e && e.type === 'pan' && !e.data.loads.length ? e.data.contents : [];
    const k = list.join(',');
    if (k === panKey) return; panKey = k;
    panBits.clear();
    list.forEach((id, i) => {
      const it = items.get(id); if (!it) return;
      const m = new THREE.Mesh(nuggetGeometry(MATERIALS[it.item.material].kind, 3), new THREE.MeshStandardMaterial({ color: MATERIALS[it.item.material].color, metalness: MATERIALS[it.item.material].metal, roughness: 0.4, flatShading: true, vertexColors: true }));
      const s = 0.035 + Math.min(0.03, Math.cbrt(it.item.kg) * 0.015); m.scale.setScalar(s);
      const a = i * 2.4; m.position.set(-0.02 + Math.cos(a) * 0.05, -0.05, -0.02 + Math.sin(a) * 0.05);
      panBits.add(m);
    });
  }

  // ---- Drop ring: unlit, high-contrast, exactly under the crosshair ----
  const ring = new THREE.Group();
  const ringMatA = new THREE.MeshBasicMaterial({ color: 0xffffff, depthTest: false, transparent: true, opacity: 0.95, toneMapped: false });
  const ringMatB = new THREE.MeshBasicMaterial({ color: 0x14181c, depthTest: false, transparent: true, opacity: 0.8, toneMapped: false });
  const r1 = new THREE.Mesh(new THREE.RingGeometry(0.15, 0.19, 32), ringMatA), r2 = new THREE.Mesh(new THREE.RingGeometry(0.19, 0.215, 32), ringMatB);
  const dot = new THREE.Mesh(new THREE.CircleGeometry(0.025, 12), ringMatA);
  for (const m of [r2, r1, dot]) { m.rotation.x = -Math.PI / 2; m.renderOrder = 20; ring.add(m); }
  ring.visible = false; scene.add(ring);

  // ---- Hover outline: a thin white shell around the hovered thing ----
  const outlineMat = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.BackSide, toneMapped: false });
  let outline = null, outlineId = null;
  function setOutline(id) {
    if (id === outlineId) { if (outline) { const e = items.get(id); if (e) { outline.position.fromArray(e.pos); outline.quaternion.fromArray(e.quat); } } return; }
    outlineId = id;
    if (outline) { scene.remove(outline); outline.geometry.dispose(); outline = null; }
    const e = id != null ? items.get(id) : null; if (!e) return;
    let geo;
    if (e.type === 'nugget') { const s = nuggetSize(e.item.kg, e.item.material); geo = nuggetGeometry(MATERIALS[e.item.material].kind, e.item.material.length * 7).scale(s, s, s); }
    else { const m = items.meshes.get(id); if (!m) return; geo = m.geometry.clone(); }
    geo.computeBoundingSphere();
    const grow = 1 + Math.min(0.08, 0.008 / Math.max(0.02, geo.boundingSphere.radius)); // thin, roughly constant width
    geo.scale(grow, grow, grow);
    outline = new THREE.Mesh(geo, outlineMat);
    outline.position.fromArray(e.pos); outline.quaternion.fromArray(e.quat);
    scene.add(outline);
  }

  // ---- Viewmodel animations ----
  // Keyframes: [t, px, py, pz, rx, ry, rz] offsets from the rest pose.
  const ANIMS = {
    dig:   { dur: 0.42, k: [[0, 0, 0, 0, 0, 0, 0], [0.35, -0.04, -0.14, -0.26, -0.55, 0, 0.05], [0.62, 0, 0.03, -0.06, 0.28, 0, 0], [1, 0, 0, 0, 0, 0, 0]] },
    scoop: { dur: 0.45, k: [[0, 0, 0, 0, 0, 0, 0], [0.4, 0, -0.2, -0.16, -0.62, 0, 0], [0.7, 0, 0.02, -0.04, 0.18, 0, 0], [1, 0, 0, 0, 0, 0, 0]] },
    swing: { dur: 0.32, k: [[0, 0, 0, 0, 0, 0, 0], [0.3, 0.02, 0.16, 0.05, 0.95, 0, -0.1], [0.55, -0.03, -0.16, -0.22, -0.9, 0, 0.12], [1, 0, 0, 0, 0, 0, 0]] },
    pour:  { dur: 0.55, k: [[0, 0, 0, 0, 0, 0, 0], [0.35, -0.08, 0.04, -0.12, -0.35, 0, 0.95], [0.7, -0.08, 0.04, -0.12, -0.35, 0, 0.95], [1, 0, 0, 0, 0, 0, 0]] },
    dump:  { dur: 0.45, k: [[0, 0, 0, 0, 0, 0, 0], [0.4, 0, 0.02, -0.18, -1.0, 0, 0.2], [0.65, 0, 0.0, -0.15, -0.9, 0, 0.2], [1, 0, 0, 0, 0, 0, 0]] },
    tip:   { dur: 0.5, k: [[0, 0, 0, 0, 0, 0, 0], [0.4, 0, -0.04, -0.12, -1.15, 0, 0], [0.7, 0, -0.04, -0.12, -1.1, 0, 0], [1, 0, 0, 0, 0, 0, 0]] },
    clink: { dur: 0.28, k: [[0, 0, 0, 0, 0, 0, 0], [0.25, 0, -0.1, -0.2, -0.5, 0, 0], [0.45, 0.02, 0.06, 0.03, 0.35, 0, -0.08], [1, 0, 0, 0, 0, 0, 0]] },
    grab:  { dur: 0.3, k: [[0, 0, 0, 0, 0, 0, 0], [0.45, 0, -0.26, -0.12, -0.3, 0, 0], [1, 0, 0, 0, 0, 0, 0]] },
    place: { dur: 0.32, k: [[0, 0, 0, 0, 0, 0, 0], [0.5, 0, -0.22, -0.22, -0.35, 0, 0], [1, 0, 0, 0, 0, 0, 0]] },
    equip: { dur: 0.35, k: [[0, 0, -0.45, 0.05, -0.7, 0, 0.2], [1, 0, 0, 0, 0, 0, 0]] },
  };
  const anim = { name: null, t: 0 };
  H.play = (name) => { anim.name = name; anim.t = 0; };
  const sm = (x) => x * x * (3 - 2 * x);
  function animPose(out, dt) {
    out.fill(0);
    if (!anim.name) return;
    if (anim.name === 'wash') {
      // Dip into the river, swirl the pan in circles, lift out.
      const dur = 0.8; anim.t += dt / dur;
      const t = Math.min(1, anim.t), dip = sm(Math.min(1, t / 0.15)) * sm(Math.min(1, (1 - t) / 0.15));
      const a = t * Math.PI * 6;
      out[0] = Math.cos(a) * 0.035 * dip; out[1] = -0.17 * dip; out[2] = -0.1 * dip + Math.sin(a) * 0.035 * dip;
      out[3] = -0.25 * dip + Math.sin(a) * 0.08 * dip; out[5] = Math.cos(a) * 0.12 * dip;
      if (anim.t >= 1) anim.name = null;
      return;
    }
    const A = ANIMS[anim.name]; anim.t += dt / A.dur;
    const t = Math.min(1, anim.t);
    let i = 0; while (i < A.k.length - 2 && t > A.k[i + 1][0]) i++;
    const a = A.k[i], b = A.k[i + 1], u = sm(Math.min(1, Math.max(0, (t - a[0]) / (b[0] - a[0]))));
    for (let j = 0; j < 6; j++) out[j] = a[j + 1] + (b[j + 1] - a[j + 1]) * u;
    if (anim.name === 'clink') { const sh = Math.max(0, 1 - t * 2); out[0] += Math.sin(t * 90) * 0.012 * sh; }
    if (anim.t >= 1) anim.name = null;
  }
  const pose = new Float32Array(6);
  let swayT = 0;
  H.moveSpeed = 0;

  const say = (text, kind) => { const now = performance.now(); if (now - H.lastMsg < 400) return; H.lastMsg = now; hud.toast(text, kind); };
  const heldEnt = () => (H.hand ? items.get(H.hand) : null);
  const camDir = () => new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);

  // What is the aim ray pointing at?
  function aimInfo() {
    const a = H.aim; if (!a || a.t > 6) return { kind: 'none' };
    const [x, y, z] = a.p;
    if (a.id != null && items.get(a.id)) return { kind: 'item', ent: items.get(a.id), dist: a.t, p: a.p, n: a.n };
    if (a.id != null && H.props?.has(a.id)) return { kind: 'prop', id: a.id, dist: a.t, p: a.p, n: a.n };
    if (a.id != null && H.vehicles?.isVehicle(a.id)) return { kind: 'vehicle', id: a.id, dist: a.t, p: a.p, n: a.n, bed: H.vehicles.bedPoint(a.id, a.p) };
    if (water.contains(x, y, z)) {
      // The ray hit the river bed; reach is measured to the water surface.
      const o = camera.position, d = camDir(), wy = waterY(z);
      const ts = d.y < -0.05 ? (o.y - wy) / -d.y : a.t;
      return { kind: 'water', dist: Math.min(a.t, ts), p: [o.x + d.x * ts, wy, o.z + d.z * ts], n: [0, 1, 0] };
    }
    const vol = claims.volumeAt(x, z);
    if (vol && y > vol.origin[1] - 0.5 && y < vol.def.top + 3) return { kind: 'claim', vol, dist: a.t, p: a.p, n: a.n };
    return { kind: 'ground', dist: a.t, p: a.p, n: a.n };
  }

  function dig(info, tool, def) {
    // Dig slightly into the surface along the view ray.
    const d = camDir();
    const c = [info.p[0] + d.x * def.dig * 0.45, info.p[1] + d.y * def.dig * 0.45, info.p[2] + d.z * def.dig * 0.45];
    if (H.owns && !H.owns(info.vol.id)) { audio.play('error'); say(`${info.vol.def.name} isn't yours — buy the deed at the Guild Hall (§ ${info.vol.def.price.toLocaleString('en-GB')})`, 'err'); return null; }
    const band = info.vol.bandAt(info.p[0], info.p[1], info.p[2]);
    if (band > def.tier || band === BEDROCK) {
      audio.play('clink'); H.play('clink');
      fx.burst(info.p, 0xffd27a, 14, { speed: 3, size: 0.03, life: 0.35, gravity: 6, up: 1 });
      say(band === BEDROCK ? 'Bedrock — nothing digs this' : `Too hard: ${BAND_NAMES[band]} needs a ${TIER_NAMES[band]} tool`, 'err');
      return null;
    }
    const r = brush(info.vol, c, def.dig, 'dig', def.tier);
    if (r.removed < 0.004) {
      if (r.blockedBand) { audio.play('clink'); H.play('clink'); fx.burst(info.p, 0xffd27a, 10, { speed: 3, size: 0.03, life: 0.3 }); say(`Too hard: ${BAND_NAMES[r.blockedBand]} needs a ${TIER_NAMES[r.blockedBand]} tool`, 'err'); }
      return null;
    }
    // The load remembers its band and depth: that decides loot and weight.
    const mainBand = +Object.entries(r.bands).sort((a, b) => b[1] - a[1])[0][0];
    audio.play('dig', mainBand);
    H.play(tool && tool.type === 'pick' ? 'swing' : tool && tool.type === 'shovel' ? 'dig' : 'scoop');
    fx.burst(info.p, BAND_DIRT[mainBand], 10, { speed: 1.6, size: 0.06, life: 0.5 });
    H.digs = (H.digs || 0) + 1;
    return { band: mainBand, depth: Math.max(0, info.vol.def.top - c[1]), claim: info.vol.id };
  }
  function addLoad(e, load) { e.data.loads.push(load); items.refresh(e.id); }
  function dumpClod(load, p, anim = true) { items.spawn('clod', [p[0], p[1] + 0.2, p[2]], { data: { band: load.band, depth: load.depth, loads: [load] } }); audio.play('pour'); if (anim) H.play('dump'); fx.burst(p, BAND_DIRT[load.band], 8, { speed: 1, size: 0.05, life: 0.4, up: 0.6 }); }
  function containerCanTake(e) { return e && (e.type === 'pan' || e.type === 'bucket') && e.data.loads.length < toolDef(e).loads && !(e.type === 'pan' && e.data.contents.length); }

  // Wash one load in the pan: one loot roll per load (BUILD_BRIEF 3.4).
  function wash(pan) {
    const load = pan.data.loads.pop();
    const it = rollLoot(rng, { band: load.band, depth: load.depth, pan: true });
    const n = items.spawn('nugget', [0, 0, 0], { item: it, loc: 'contained' });
    n.container = pan.id;
    pan.data.contents.push(n.id);
    items.refresh(pan.id);
    audio.play('swish'); H.play('wash');
    fx.burst(aimInfo().p, 0xdff4f4, 10, { speed: 1.4, size: 0.04, life: 0.5, up: 1.2 });
    const m = MATERIALS[it.material];
    const rare = ['glimmerite', 'emberite', 'starstone'].includes(it.material) || m.kind === 'gem';
    setTimeout(() => audio.play(rare ? 'rare' : 'find'), 260);
    hud.toast(`${itemName(it)} · ${it.kg.toFixed(2)} kg`, rare ? 'gold' : '');
    H.washed = (H.washed || 0) + 1;
    onFind?.(it);
    return it;
  }
  // Tip the pan's finds out at the drop ring as loose nuggets.
  function tipOut(pan, p) {
    const list = pan.data.contents.splice(0);
    list.forEach((id, i) => { const a = i * 2.4, r = 0.06 + i * 0.015; items.place(id, [p[0] + Math.cos(a) * r, p[1] + 0.12 + i * 0.04, p[2] + Math.sin(a) * r]); });
    items.refresh(pan.id);
    audio.play('drop'); H.play('tip');
    return list.length;
  }

  function use() {
    const e = heldEnt(); const info = aimInfo();
    if (!e) return;
    const def = toolDef(e);
    const near = info.dist !== undefined && info.dist < REACH;
    if (e.type === 'sack') {
      if (info.kind === 'vehicle' && near) {
        if (H.vehicles.refuel(info.id)) { items.remove(e.id); H.hand = null; audio.play('pour'); H.play('pour'); hud.toast('Topped up with charcoal'); return true; }
        say('The hopper is already full'); return;
      }
      return;
    }
    if (e.type === 'shovel' || e.type === 'bucket' || e.type === 'pan') {
      const loads = e.data.loads, cap = def.loads;
      if (e.type === 'pan' && info.kind === 'water' && near && loads.length) return wash(e);
      if (e.type === 'pan' && e.data.contents.length && !loads.length) {
        if (info.kind === 'water') { say('Pan is full of finds — tip them out on dry ground first'); return; }
        if (near) return tipOut(e, info.p);
        return;
      }
      if (info.kind === 'claim' && near && loads.length < cap) { const l = dig(info, e, def); if (l) addLoad(e, l); return l; }
      if (loads.length && info.kind === 'item' && near && containerCanTake(info.ent)) {
        const t = info.ent;
        while (e.data.loads.length && t.data.loads.length < toolDef(t).loads) t.data.loads.push(e.data.loads.shift());
        items.refresh(t.id); items.refresh(e.id); audio.play('pour'); H.play('pour');
        fx.burst([t.pos[0], t.pos[1] + 0.3, t.pos[2]], BAND_DIRT[t.data.loads[t.data.loads.length - 1].band], 10, { speed: 0.8, size: 0.04, life: 0.45, up: 0.4 }); return true;
      }
      if (loads.length && near && info.kind !== 'water') { dumpClod(loads.pop(), info.p); items.refresh(e.id); return true; }
      if (info.kind === 'claim' && near && loads.length >= cap) say(`${def.name} is full (${cap} load${cap > 1 ? 's' : ''})`);
      else if (info.kind === 'water' && e.type === 'pan') say('Scoop some gravel first');
      return;
    }
    if (e.type === 'pick') {
      if (info.kind === 'claim' && near) { const l = dig(info, e, def); if (l) dumpClod(l, info.p, false); return l; }
      return;
    }
    if (e.type === 'clod') {
      if (info.kind === 'item' && near && containerCanTake(info.ent)) { info.ent.data.loads.push(e.data.loads[0]); items.refresh(info.ent.id); items.remove(e.id); H.hand = null; audio.play('pour'); H.play('place'); return true; }
    }
  }

  function pickup() {
    const info = aimInfo();
    if (info.kind === 'prop' && info.dist < REACH + 0.5) { H.props.interact(info.id); return true; }
    // E on the truck opens its bed inventory.
    if (info.kind === 'vehicle' && info.dist < REACH + 0.8) { H.onVehicle?.(info.id); return true; }
    if (info.kind !== 'item' || info.dist > REACH) return false;
    const target = info.ent;
    if (H.hand) {
      const cur = heldEnt();
      // Tools go to the swap slot to free the hand.
      if (TOOLS[cur.type] && !H.slot) { H.slot = H.hand; H.hand = null; }
      else if (target.type !== 'pile' && cur.type === 'pan' && target.type === 'nugget' && !cur.data.loads.length) { // scoop a nugget into the pan
        items.take(target.id, 'contained', cur.id); cur.data.contents.push(target.id); items.refresh(cur.id); audio.play('pickup'); H.play('grab'); return true;
      } else { say('Hands full — G to drop, Q to swap'); audio.play('error'); return false; }
    }
    if (target.type === 'pile') { const n = items.takeFromPile(target.id); H.hand = n.id; audio.play('pickup'); H.play('equip'); return true; }
    items.take(target.id, 'held');
    H.hand = target.id;
    audio.play('pickup'); H.play('equip');
    return true;
  }
  function drop() {
    const e = heldEnt(); if (!e) return false;
    const info = aimInfo();
    if (info.kind === 'vehicle' && info.dist < REACH) {
      const r = H.vehicles.addCargo(info.id, e, info.p);
      if (r === 'ok') { H.hand = null; audio.play('drop'); H.play('place'); return true; }
      say(r === 'full' ? 'The bed is full (60 items)' : r === 'heavy' ? 'Too heavy for the bed (2,000 kg)' : 'Aim at the truck bed', 'err'); return false;
    }
    if (!H.ringPos) { say('Aim at the ground to drop'); return false; }
    if (!H.ringOk) { say('No room there', 'err'); audio.play('error'); return false; }
    const hh = items.halfHeight(e);
    const yaw = Math.atan2(-camDir().x, -camDir().z);
    items.place(e.id, [H.ringPos[0], H.ringPos[1] + hh + 0.02, H.ringPos[2]], [0, Math.sin(yaw / 2), 0, Math.cos(yaw / 2)]);
    H.hand = null; audio.play('drop'); H.play('equip');
    return true;
  }
  function swap() { const a = H.hand; H.hand = H.slot; H.slot = a; audio.play('pickup'); H.play('equip'); }

  function hint(info) {
    const e = heldEnt(), k = (x) => `<kbd>${x}</kbd>`;
    const parts = [];
    const near = info.dist !== undefined && info.dist < REACH;
    if (e) {
      const def = toolDef(e);
      if (e.type === 'pan') {
        if (e.data.loads.length && info.kind === 'water' && near) parts.push(`${k('LMB')} wash (${e.data.loads.length} left)`);
        else if (e.data.contents.length && !e.data.loads.length) parts.push(`${k('LMB')} tip out finds`);
        else if (info.kind === 'claim' && near && e.data.loads.length < def.loads) parts.push(`${k('LMB')} scoop gravel`);
        else if (e.data.loads.length) parts.push('Dip the pan in the river');
      } else if (def && def.loads) {
        if (info.kind === 'claim' && near && e.data.loads.length < def.loads) parts.push(`${k('LMB')} dig`);
        else if (e.data.loads.length && info.kind === 'item' && containerCanTake(info.ent) && near) parts.push(`${k('LMB')} pour into ${TOOLS[info.ent.type].name.toLowerCase()}`);
        else if (e.data.loads.length && near) parts.push(`${k('LMB')} dump`);
      } else if (e.type === 'pick' && info.kind === 'claim' && near) parts.push(`${k('LMB')} break ground`);
      else if (e.type === 'clod' && info.kind === 'item' && containerCanTake(info.ent) && near) parts.push(`${k('LMB')} put in ${TOOLS[info.ent.type].name.toLowerCase()}`);
      parts.push(`${k('G')} drop`);
    }
    if (info.kind === 'item' && near) parts.push(`${k('E')} pick up`);
    if (info.kind === 'prop' && info.dist < REACH + 0.5) { const t = H.props.hint(info.id); if (t) parts.unshift(`${k('E')} ${t}`); }
    if (info.kind === 'vehicle' && info.dist < 4) {
      if (e && e.type === 'sack') parts.unshift(`${k('LMB')} refuel`);
      else if (e && info.bed) parts.unshift(`${k('G')} load into bed`);
      parts.push(`${k('E')} bed`);
      parts.push(`${k('F')} drive`);
    }
    if (H.slot || (e && TOOLS[e.type])) parts.push(`${k('Q')} swap`);
    return parts.join(' · ');
  }

  H.update = function (dt, input, enabled) {
    // Aim ray for next frame.
    const o = camera.getWorldPosition(new THREE.Vector3()), d = camDir();
    if (!H.manualAim) physics.query({ type: 'ray', o: [o.x, o.y, o.z], d: [d.x, d.y, d.z], max: 8 }).then((r) => { if (!H.manualAim) H.aim = r; });
    const info = aimInfo();
    H.cooldown -= dt;
    if (enabled) {
      if (input.pressed('use') || (input.held('use') && H.cooldown <= -0.15)) {
        const e = heldEnt();
        if (e && H.cooldown <= 0) { H.cooldown = toolDef(e)?.cooldown || 0.3; use(); }
      }
      if (input.pressed('pickup')) pickup();
      if (input.pressed('drop')) drop();
      if (input.pressed('swap')) swap();
    }
    // Drop ring and validity check (a box overlap at the landing spot).
    const e = heldEnt();
    if (e && H.aim && H.aim.t < 3.5 && (info.kind === 'claim' || info.kind === 'ground' || info.kind === 'item' || (info.kind === 'vehicle' && info.bed))) {
      H.ringPos = H.aim.p.slice();
      ring.visible = true;
      ring.position.fromArray(H.ringPos).addScaledVector(new THREE.Vector3().fromArray(H.aim.n), 0.02);
      ring.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3().fromArray(H.aim.n));
      const s = items.shapeOf(e);
      physics.query({ type: 'overlap', pos: [H.ringPos[0], H.ringPos[1] + s.hy + 0.05, H.ringPos[2]], hx: s.hx * 0.9, hy: s.hy * 0.9, hz: s.hz * 0.9 }).then((q) => { H.ringOk = q && !q.blocked; });
      if (info.kind === 'vehicle') H.ringOk = true;
      const col = H.ringOk ? 0xffffff : 0xff3df0;
      ringMatA.color.setHex(col);
    } else { ring.visible = false; H.ringPos = null; }
    // Hover: outline and tooltip.
    const hov = info.kind === 'item' && info.dist < REACH ? info.ent.id : null;
    setOutline(hov);
    let card = hov != null ? items.card(hov) : null;
    if (!card && info.kind === 'prop' && info.dist < 6) card = H.props.card(info.id);
    if (!card && info.kind === 'vehicle' && info.dist < 5) {
      const c = H.vehicles.cargoNear(info.id, info.p, 0.6);
      if (c) card = items.card(c.id);
      else { const v = H.vehicles.list.get(info.id); card = { name: v.def.name, lines: [`Fuel ${Math.round(v.fuel / v.def.fuelMax * 100)}%`, `Bed: ${v.cargo.length} items · ${H.vehicles.cargoKg(info.id).toFixed(0)} kg`] }; }
    }
    hud.tooltip(card);
    hud.hint(enabled ? hint(info) : '');
    // Viewmodel: swing on use.
    rebuildHeld(); rebuildPanBits();
    animPose(pose, dt);
    // Walking sway.
    const spd = Math.min(1, H.moveSpeed / 6.8);
    swayT += dt * (4 + spd * 6);
    const bx = Math.sin(swayT) * 0.012 * spd, by = -Math.abs(Math.cos(swayT)) * 0.012 * spd;
    holder.position.set(0.34 + pose[0] + bx, -0.32 + pose[1] + by, -0.62 + pose[2]);
    holder.rotation.set(pose[3], pose[4] + bx * 0.6, pose[5]);
  };
  H.give = (type, data = {}) => {
    const base = TOOLS[type] ? { loads: [], contents: [], ...data } : data;
    const ent = items.spawn(type, [0, 0, 0], { data: base, loc: 'held' });
    if (H.hand) { if (!H.slot && TOOLS[items.get(H.hand).type]) H.slot = H.hand; else { const old = items.get(H.hand); items.place(old.id, camera.position.toArray()); } }
    H.hand = ent.id;
    return ent;
  };
  H.viewmodel = () => held3d;
  H.setVisible = (v) => { holder.visible = v; if (!v) ring.visible = false; };
  H.use = use; H.pickup = pickup; H.drop = drop; H.swap = swap; H.aimInfo = aimInfo; H.wash = wash; H.dig = dig;
  return H;
}
