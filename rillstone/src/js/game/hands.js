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
// A pan carries its finds until you tip them out (dry ground or a counter).
export const PAN_FINDS = 20;

export function createHands({ scene, camera, physics, items, claims, water, fx, audio, hud, rng, materials, onFind }) {
  const H = { hand: null, slot: null, aim: null, cooldown: 0, swing: 0, ringOk: false, ringPos: null, lastMsg: 0, dropRot: [0, 0, 0], reach: 3.5, precise: false };
  // ---- Viewmodel ----
  scene.add(camera);
  const holder = new THREE.Group(); holder.position.set(0.34, -0.32, -0.62); camera.add(holder);
  let held3d = null, heldKey = '';
  function heldKeyOf(e) { return e ? `${e.id}:${e.data?.loads?.length || 0}:${e.data?.contents?.length || 0}:${e.item?.stage}:${e.item?.hotUntil > items.clock ? 1 : 0}:${e.data?.m ?? ''}` : ''; }
  function rebuildHeld() {
    const e = H.hand ? items.get(H.hand) : null;
    const k = heldKeyOf(e);
    if (k === heldKey) return;
    heldKey = k;
    if (held3d) { holder.remove(held3d); held3d.geometry.dispose(); held3d = null; }
    if (!e) return;
    let geo, mat = materials.vcolor;
    if (e.type === 'nugget') { const m = items.buildMesh(e); geo = m.geometry; mat = m.material; const s = nuggetSize(e.item.kg, e.item.material, e.item.stage); if (s < 0.1) geo.scale(0.1 / s, 0.1 / s, 0.1 / s); }
    else if (e.type === 'clod') geo = clodGeometry(e.data.band);
    else if (TOOLS[e.type]) geo = toolGeometry(e.type, e.data);
    else { const m = items.buildMesh(e); geo = m.geometry; mat = m.material; if (e.type === 'crate') { geo.scale(0.3, 0.3, 0.3); geo.translate(0.02, -0.06, -0.05); } }
    held3d = new THREE.Mesh(geo, mat);
    if (e.type === 'shovel') { held3d.rotation.set(0.2, 3.56, 0.04); held3d.position.set(0.17, -0.03, 0.2); held3d.scale.setScalar(0.85); } // carried blade-forward, tip up, scoop facing you; shaft runs off bottom-right
    else if (e.type === 'pick') { held3d.rotation.set(0.35, Math.PI + 0.2, 0.25); held3d.position.set(0, 0.1, -0.1); }
    else if (e.type === 'pan') { held3d.position.set(-0.02, -0.06, -0.02); held3d.rotation.set(0.4, 0, 0); held3d.scale.setScalar(0.72); }
    else if (e.type === 'bucket') held3d.position.set(0, -0.08, 0);
    else if (e.type === 'barrow') { held3d.rotation.set(0.05, Math.PI, 0); held3d.position.set(-0.34, -0.72, -0.55); held3d.scale.setScalar(0.85); } // pushed: handles in your hands, the tray out in front
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
      const m = new THREE.Mesh(nuggetGeometry(MATERIALS[it.item.material].kind, 3, '', it.item.material), new THREE.MeshStandardMaterial({ color: MATERIALS[it.item.material].color, metalness: MATERIALS[it.item.material].metal, roughness: 0.4, flatShading: true, vertexColors: true }));
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
    if (e.type === 'nugget' || e.type === 'clod') geo = items.buildMesh(e).geometry;
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
    if (a.id != null && H.machines?.has(a.id)) return { kind: 'machine', id: a.id, m: H.machines.get(a.id), dist: a.t, p: a.p, n: a.n };
    if (a.id != null && H.props?.has(a.id)) return { kind: 'prop', id: a.id, dist: a.t, p: a.p, n: a.n };
    if (a.id != null && H.vehicles?.isVehicle(a.id)) return { kind: 'vehicle', id: a.id, dist: a.t, p: a.p, n: a.n, bed: H.vehicles.bedPoint(a.id, a.p) };
    if (water.contains(x, y, z)) {
      // The ray hit the river bed; reach is measured to the water surface.
      const o = camera.position, d = camDir(), wy = waterY(z);
      const ts = d.y < -0.05 ? (o.y - wy) / -d.y : a.t;
      return { kind: 'water', dist: Math.min(a.t, ts), p: [o.x + d.x * ts, wy, o.z + d.z * ts], n: [0, 1, 0] };
    }
    const vol = claims.volumeAt(x, z, y);
    if (vol && y > vol.origin[1] - 0.5 && y < vol.def.top + 3) return { kind: 'claim', vol, dist: a.t, p: a.p, n: a.n };
    return { kind: 'ground', dist: a.t, p: a.p, n: a.n };
  }

  function dig(info, tool, def) {
    // Dig slightly into the surface along the view ray.
    const d = camDir();
    const c = [info.p[0] + d.x * def.dig * 0.45, info.p[1] + d.y * def.dig * 0.45, info.p[2] + d.z * def.dig * 0.45];
    if (H.owns && !H.owns(info.vol.id)) { audio.play('error'); say(`${info.vol.def.name} isn't yours — buy the deed at the Guild Hall ($${info.vol.def.price.toLocaleString('en-GB')})`, 'err'); return null; }
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
    const load = { band: mainBand, depth: Math.max(0, info.vol.depthAt(c[0], c[1])), claim: info.vol.id };
    // Near-surface topsoil (where fill can go) carries no vein.
    const vein = mainBand === 1 && load.depth <= FILL_DEPTH ? null : info.vol.veinAt(c[0], c[1], c[2]); if (vein) load.vein = vein;
    H.onDig?.(info.vol, c, def.dig);
    return load;
  }
  // RMB with a shovel on your own claim: a loaded shovel packs its load back
  // into the ground near the surface (a fill brush); an empty one cuts bumps
  // down to the height you aim at (a flatten brush). BUILD_BRIEF 4.
  const FILL_DEPTH = 1.5;
  function shovelRmb(info) {
    const e = heldEnt(); if (!e || e.type !== 'shovel' || info.kind !== 'claim' || !(info.dist < REACH)) return false;
    if (H.owns && !H.owns(info.vol.id)) { say(`${info.vol.def.name} isn't yours`, 'err'); audio.play('error'); return true; }
    const def = toolDef(e);
    if (e.data.loads.length) {
      const n = info.n || [0, 1, 0], c = [info.p[0] + n[0] * def.dig * 0.4, info.p[1] + n[1] * def.dig * 0.4, info.p[2] + n[2] * def.dig * 0.4];
      // Fill patches ruts and holes near the surface only: refilling a deep
      // pit with surface dirt and digging it again would turn up deep finds.
      if (info.vol.depthAt(c[0], c[1]) > FILL_DEPTH) { say(`Fill only packs dirt into the top ${FILL_DEPTH} m`, 'err'); return true; }
      const r = brush(info.vol, c, def.dig, 'fill', def.tier);
      if (!r.touched) { say('Nothing to fill there'); return true; } // the load stays on the shovel
      e.data.loads.pop(); items.refresh(e.id);
      audio.play('pour'); H.play('dump'); fx.burst(info.p, BAND_DIRT[1], 8, { speed: 1, size: 0.05, life: 0.4, up: 0.6 });
    } else {
      const r = brush(info.vol, info.p, 0.9, 'flatten', def.tier);
      if (r.blockedBand) say(`Too hard to level: ${BAND_NAMES[r.blockedBand]}`, 'err');
      audio.play('dig', 1); H.play('dig'); fx.burst(info.p, BAND_DIRT[1], 6, { speed: 1.2, size: 0.05, life: 0.4 });
    }
    return true;
  }
  H.shovelRmb = shovelRmb;
  function addLoad(e, load) { e.data.loads.push(load); items.refresh(e.id); }
  function dumpClod(load, p, anim = true) { items.spawn('clod', [p[0], p[1] + 0.2, p[2]], { data: { band: load.band, depth: load.depth, loads: [load], ore: !!load.ore } }); audio.play('pour'); if (anim) H.play('dump'); fx.burst(p, BAND_DIRT[load.band], 8, { speed: 1, size: 0.05, life: 0.4, up: 0.6 }); }
  function containerCanTake(e) { return e && (e.type === 'pan' || e.type === 'bucket' || (e.type === 'barrow' && !e.data.contents?.length)) && e.data.loads.length < toolDef(e).loads && !(e.type === 'pan' && e.data.contents.length >= PAN_FINDS); }

  // Wash one load in the pan: one loot roll per load (BUILD_BRIEF 3.4).
  function wash(pan) {
    const load = pan.data.loads.pop();
    const it = rollLoot(rng, { band: load.band, depth: load.depth, pan: true, vein: load.vein ? { material: load.vein } : null });
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
    H.tipped = (H.tipped || 0) + 1;
    list.forEach((id, i) => { const a = i * 2.4, r = 0.06 + i * 0.015; items.place(id, [p[0] + Math.cos(a) * r, p[1] + 0.12 + i * 0.04, p[2] + Math.sin(a) * r]); });
    items.refresh(pan.id);
    audio.play('drop'); H.play('tip');
    return list.length;
  }

  function use() {
    const e = heldEnt(); const info = aimInfo();
    if (!e) return;
    if (H.useHook?.(e, info, H)) return true;
    const def = toolDef(e);
    const near = info.dist !== undefined && info.dist < REACH;
    // Placing a machine from its crate.
    if (e.type === 'crate' && H.machines) {
      if (!H.ghostState) return;
      if (H.ghostState.why) { say(H.ghostState.why, 'err'); audio.play('error'); return; }
      if (!H.ghostFree) { say('Something is in the way', 'err'); audio.play('error'); return; }
      const g = H.ghostState, d = e.data;
      H.machines.place(d.def, g.pos, g.rot, d.state || {}, { wear: d.wear || 0 });
      items.remove(e.id); H.hand = null; audio.play('drop'); H.play('place');
      hud.toast(`${H.machines.name(d.def)} placed · lock it with the mallet`);
      return true;
    }
    if (e.type === 'coil' && H.machines) {
      if (!H.aim) return;
      const r = H.machines.coilClick(e, H.aim.p, info.kind);
      if (r === 'laid' && e.data.m < 0.3) { items.remove(e.id); H.hand = null; hud.toast('Coil used up'); }
      return true;
    }
    if (info.kind === 'machine' && info.dist < REACH + 0.5 && H.machines.useOn(info.id, e, H)) return true;
    if (e.type === 'sack') {
      if (info.kind === 'vehicle' && near) {
        if (H.vehicles.refuel(info.id)) { items.remove(e.id); H.hand = null; audio.play('pour'); H.play('pour'); hud.toast('Topped up with charcoal'); return true; }
        say('The hopper is already full'); return;
      }
      return;
    }
    // The barrow: dump its loads one at a time, or tip out its finds.
    if (e.type === 'barrow') {
      const loads = e.data.loads;
      if (loads.length && info.kind === 'item' && near && containerCanTake(info.ent) && info.ent.id !== e.id) {
        const t = info.ent;
        while (loads.length && t.data.loads.length < toolDef(t).loads) t.data.loads.push(loads.pop());
        items.refresh(t.id); items.refresh(e.id); audio.play('pour'); return true;
      }
      if (loads.length && near && info.kind !== 'water') { dumpClod(loads.pop(), info.p, false); items.refresh(e.id); return true; }
      if (e.data.contents?.length && near && info.kind !== 'water') return tipOut(e, info.p);
      if (near) say(loads.length || e.data.contents?.length ? 'Not into the river' : 'The barrow is empty: pour loads in with a shovel, or E finds into it');
      return;
    }
    if (e.type === 'shovel' || e.type === 'bucket' || e.type === 'pan') {
      const loads = e.data.loads, cap = def.loads;
      // Scoop a load back out of a dirt pile.
      if (info.kind === 'item' && info.ent?.type === 'dirtpile' && near) {
        if (loads.length >= cap || (e.type === 'pan' && e.data.contents.length >= PAN_FINDS)) { say(`${def.name} is full`); return; }
        const l = items.takeLoad(info.ent.id); if (!l) return;
        addLoad(e, l); audio.play('dig', l.band); H.play(e.type === 'shovel' ? 'dig' : 'scoop');
        fx.burst(info.p, BAND_DIRT[l.band] || BAND_DIRT[1], 8, { speed: 1.4, size: 0.05, life: 0.4 });
        return l;
      }
      if (e.type === 'pan') {
        const finds = e.data.contents.length;
        if (info.kind === 'water' && near && loads.length) { if (finds >= PAN_FINDS) { say(`The pan holds ${PAN_FINDS} finds — tip them out first`, 'err'); return; } return wash(e); }
        if (info.kind === 'claim' && near && loads.length < cap && finds < PAN_FINDS) { const l = dig(info, e, def); if (l) addLoad(e, l); return l; }
        if (finds && !loads.length && info.kind === 'vehicle' && info.bed && info.dist < REACH) {
          // Tip the finds straight into a truck bed, as cargo.
          let n = 0;
          for (const id of e.data.contents.slice()) { const f = items.get(id); if (!f) continue; f.loc = 'held'; if (H.vehicles.addCargo(info.id, f, info.p) !== 'ok') { f.loc = 'contained'; break; } e.data.contents.splice(e.data.contents.indexOf(id), 1); n++; }
          items.refresh(e.id); audio.play('pour'); H.play('tip');
          say(n ? `${n} find${n > 1 ? 's' : ''} into the bed` : 'The bed is full', n ? '' : 'err');
          return n > 0;
        }
        if (finds && !loads.length && near && info.kind !== 'water') return tipOut(e, info.p);
        if (info.kind === 'water' && near && !loads.length) { say(finds ? 'Scoop more gravel, or tip your finds out on dry ground' : 'Scoop some gravel into the pan first'); return; }
        if (info.kind === 'claim' && near && finds >= PAN_FINDS) { say(`The pan holds ${PAN_FINDS} finds — tip them out first`, 'err'); return; }
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
      // The pick breaks out hard ore clods below the topsoil: crush them in a Stamp Mill.
      if (info.kind === 'claim' && near) { const l = dig(info, e, def); if (l) { if (l.band >= 2) l.ore = true; dumpClod(l, info.p, false); } return l; }
      return;
    }
    if (e.type === 'clod') {
      if (info.kind === 'item' && near && containerCanTake(info.ent)) { info.ent.data.loads.push(e.data.loads[0]); items.refresh(info.ent.id); items.remove(e.id); H.hand = null; audio.play('pour'); H.play('place'); return true; }
    }
  }

  function pickup() {
    const info = aimInfo();
    if (info.kind === 'prop' && info.dist < REACH + 0.5) { H.props.interact(info.id); return true; }
    if (info.kind === 'machine' && info.dist < REACH + 0.5) {
      const m = info.m;
      if (m.run) { say('Pick up a machine at either end to remove its pipe'); return false; }
      if (m.locked && H.auto?.interact(m)) return true;
      if (m.locked && m.def === 'lift') { H.onLift?.(m); return true; }
      if (m.locked) { say('Locked — unlock it with the mallet (RMB)', 'err'); audio.play('error'); return false; }
      if (H.hand) { const cur = heldEnt(); if (TOOLS[cur.type] && !H.slot) { H.slot = H.hand; H.hand = null; } else { say('Hands full — G to drop, Q to swap'); return false; } }
      const c = items.spawn('crate', [0, 0, 0], { data: { def: m.def, family: H.machines.family(m.def), state: m.state, wear: m.wear }, loc: 'held' });
      H.machines.remove(m.id); c.data.state = structuredClone(c.data.state); H.hand = c.id; audio.play('pickup'); H.play('equip');
      return true;
    }
    // E on the truck opens its bed inventory.
    if (info.kind === 'vehicle' && info.dist < REACH + 0.8) { H.onVehicle?.(info.id); return true; }
    if (info.kind !== 'item' || info.dist > REACH) return false;
    const target = info.ent;
    if (H.onWear?.(target)) return true;
    if (H.hand) {
      const cur = heldEnt();
      // Tools go to the swap slot to free the hand.
      if (TOOLS[cur.type] && !H.slot) { H.slot = H.hand; H.hand = null; }
      else if (target.type === 'nugget') {
        // A find goes into the pan, held or in the swap slot.
        const pan = [cur, H.slot ? items.get(H.slot) : null].find(p => p && ((p.type === 'pan' && !p.data.loads.length && p.data.contents.length < PAN_FINDS) || (p.type === 'barrow' && !p.data.loads.length && p.data.contents.length < TOOLS.barrow.finds)));
        if (!pan) { say('Hands full — G to drop, Q to swap'); audio.play('error'); return false; }
        items.take(target.id, 'contained', pan.id); pan.data.contents.push(target.id); items.refresh(pan.id); audio.play('pickup'); H.play('grab'); say(`Into the ${pan.type} (${pan.data.contents.length}/${pan.type === 'barrow' ? TOOLS.barrow.finds : PAN_FINDS})`); return true;
      } else { say('Hands full — G to drop, Q to swap'); audio.play('error'); return false; }
    }
    if (target.type === 'pile') { const n = items.takeFromPile(target.id); H.hand = n.id; audio.play('pickup'); H.play('equip'); return true; }
    if (target.type === 'dirtpile') {
      const l = items.takeLoad(target.id); if (!l) return false;
      const c = items.spawn('clod', [0, 0, 0], { data: { band: l.band, depth: l.depth, loads: [l] }, loc: 'held' });
      H.hand = c.id; audio.play('pickup'); H.play('equip'); return true;
    }
    items.take(target.id, 'held');
    H.hand = target.id;
    audio.play('pickup'); H.play('equip');
    return true;
  }
  // Drop orientation: facing the camera, then the player's R/T/Y turns
  // (45° steps on each axis).
  const _dq = new THREE.Quaternion(), _de = new THREE.Euler();
  function dropQuat(yaw, rot = H.dropRot) {
    _dq.setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
    _dq.multiply(new THREE.Quaternion().setFromEuler(_de.set(rot[0] * Math.PI / 4, rot[1] * Math.PI / 4, rot[2] * Math.PI / 4)));
    return [_dq.x, _dq.y, _dq.z, _dq.w];
  }
  function drop() {
    const e = heldEnt(); if (!e) return false;
    const info = aimInfo();
    if (info.kind === 'vehicle' && info.dist < bedReach()) {
      const r = H.vehicles.addCargo(info.id, e, info.p);
      if (r === 'ok') { H.hand = null; audio.play('drop'); H.play('place'); return true; }
      const vd = H.vehicles.list.get(info.id)?.def; say(r === 'full' ? `The bed is full (${vd?.cargoItems ?? 60} items)` : r === 'heavy' ? `Too heavy for the bed (${(vd?.cargoKg ?? 2000).toLocaleString('en-GB')} kg)` : 'Aim at the truck bed', 'err'); return false;
    }
    if (!H.ringPos) { say('Aim at the ground to drop'); return false; }
    if (!H.ringOk) { say('No room there', 'err'); audio.play('error'); return false; }
    const hh = items.halfHeight(e);
    const yaw = Math.atan2(-camDir().x, -camDir().z);
    const rot = e.type === 'crate' ? [0, 0, 0] : H.dropRot;
    items.place(e.id, [H.ringPos[0], H.ringPos[1] + hh + (rot.some(Boolean) ? items.shapeOf(e).hx : 0) + 0.02, H.ringPos[2]], dropQuat(yaw, rot));
    H.hand = null; audio.play('drop'); H.play('equip');
    return true;
  }
  // The drop ring, the hint and loading a bed all use the same reach.
  const bedReach = () => Math.max(REACH, H.reach);
  function swap() { const a = H.hand; H.hand = H.slot; H.slot = a; audio.play('pickup'); H.play('equip'); }

  function hint(info) {
    const e = heldEnt(), k = (x) => `<kbd>${x}</kbd>`;
    const parts = [];
    const near = info.dist !== undefined && info.dist < REACH;
    if (e) {
      const def = toolDef(e);
      if (e.type === 'pan') {
        const finds = e.data.contents.length, loads = e.data.loads.length;
        if (loads && info.kind === 'water' && near) parts.push(`${k('LMB')} wash (${loads} left)`);
        else if (info.kind === 'claim' && near && loads < def.loads && finds < PAN_FINDS) parts.push(`${k('LMB')} scoop gravel${finds ? ` (${finds} finds in the pan)` : ''}`);
        else if (finds && !loads && info.kind === 'vehicle' && info.bed) parts.push(`${k('LMB')} tip ${finds} find${finds > 1 ? 's' : ''} into the bed`);
        else if (finds && !loads && near && info.kind !== 'water') parts.push(`${k('LMB')} tip out ${finds} find${finds > 1 ? 's' : ''}`);
        else if (loads) parts.push('Dip the pan in the river');
        else if (finds) parts.push(`${finds} find${finds > 1 ? 's' : ''} in the pan · tip them out on dry ground or a counter`);
      } else if (e.type === 'barrow') {
        const n = e.data.loads.length, f = e.data.contents?.length || 0;
        if (n && near && info.kind === 'item' && containerCanTake(info.ent)) parts.push(`${k('LMB')} pour into ${TOOLS[info.ent.type].name.toLowerCase()}`);
        else if (n && near) parts.push(`${k('LMB')} dump a load (${n}/${def.loads})`);
        else if (f && near) parts.push(`${k('LMB')} tip out ${f} find${f > 1 ? 's' : ''}`);
        else if (!n && !f) parts.push('Empty barrow: shovel loads in, or E finds into it');
        else parts.push(n ? `${n}/${def.loads} loads` : `${f} find${f > 1 ? 's' : ''}`);
      } else if (def && def.loads) {
        if (info.kind === 'item' && info.ent?.type === 'dirtpile' && near && e.data.loads.length < def.loads) parts.push(`${k('LMB')} scoop a load`);
        else if (info.kind === 'claim' && near && e.data.loads.length < def.loads) parts.push(`${k('LMB')} dig`);
        else if (e.data.loads.length && info.kind === 'item' && containerCanTake(info.ent) && near) parts.push(`${k('LMB')} pour into ${TOOLS[info.ent.type].name.toLowerCase()}`);
        else if (e.data.loads.length && near) parts.push(`${k('LMB')} dump`);
        if (e.type === 'shovel' && info.kind === 'claim' && near && (!H.owns || H.owns(info.vol.id))) parts.push(`${k('RMB')} ${e.data.loads.length ? 'fill' : 'level'}`);
      } else if (e.type === 'pick' && info.kind === 'claim' && near) parts.push(`${k('LMB')} break ground`);
      else if (e.type === 'clod' && info.kind === 'item' && containerCanTake(info.ent) && near) parts.push(`${k('LMB')} put in ${TOOLS[info.ent.type].name.toLowerCase()}`);
      if (H.precise && e.type !== 'crate') return `Release ${k('G')} to drop · ${k('R')}/${k('T')}/${k('Y')} turn (Ctrl reverses) · wheel: reach ${H.reach.toFixed(1)} m`;
      parts.push(`${k('G')} drop (hold to turn)`);
    }
    if (info.kind === 'item' && near) parts.push(`${k('E')} pick up`);
    if (e && e.type === 'crate') parts.unshift(`${k('LMB')} place · ${k('R')} rotate`);
    { const t = e && H.hintHook?.(e, info, H); if (t) parts.unshift(t.replace(/\{(\w+)\}/g, (_, a) => k(a))); }
    if (e && e.type === 'coil') {
      if (!H.machines?.runStart(e)) parts.unshift(`${k('LMB')} start a ${e.data.tier === 'cable' ? 'cable' : 'pipe'} run at a port`);
      else {
        const aimP = H.aim && H.aim.t < 8 ? H.aim.p : null, need = H.machines.runNeed(e, aimP), mounts = e.data.via?.length || 0;
        const port = aimP && H.machines.freePortNear(aimP, 1.0, e.data.tier === 'cable');
        parts.unshift(`${k('LMB')} ${port ? 'finish at this port' : 'mount to the floor'} · ${need.toFixed(1)} / ${e.data.m.toFixed(1)} m · ${k('RMB')} ${mounts ? 'undo mount' : 'cancel'}`);
      }
    }
    if (info.kind === 'machine' && info.dist < REACH + 0.5 && !info.m.run) {
      if (e && e.type === 'mallet') parts.unshift(`${k('LMB')} lock · ${k('RMB')} unlock`);
      else if (e && (e.type === 'wrench' || e.type === 'repairkit')) parts.unshift(`${k('LMB')} repair`);
      else if (e && (e.item || e.data?.loads?.length)) parts.unshift(`${k('LMB')} put in`);
      if (!info.m.locked) parts.push(`${k('E')} pick up`);
      parts.push(`${k('RMB')} panel`);
    }
    if (info.kind === 'prop' && info.dist < REACH + 0.5) { const t = H.props.hint(info.id); if (t) parts.unshift(`${k('E')} ${t}`); }
    if (info.kind === 'vehicle' && info.dist < 4) {
      if (e && e.type === 'sack') parts.unshift(`${k('LMB')} refuel`);
      else if (e && info.bed && info.dist < bedReach()) parts.unshift(`${k('G')} load into bed`);
      const vd = H.vehicles.list.get(info.id)?.def;
      if (vd?.bed) parts.push(`${k('E')} ${vd.kinematic ? 'tub' : 'bed'}`);
      parts.push(`${k('F')} ${vd?.kinematic ? 'send / stop' : 'drive'}`);
    }
    if (H.slot || (e && TOOLS[e.type])) parts.push(`${k('Q')} swap`);
    return parts.join(' · ');
  }

  H.update = function (dt, input, enabled) {
    // Aim ray for next frame.
    const o = camera.getWorldPosition(new THREE.Vector3()), d = camDir();
    if (!H.manualAim) physics.query({ type: 'ray', o: [o.x, o.y, o.z], d: [d.x, d.y, d.z], max: 8 }).then((r) => {
      if (H.manualAim) return;
      // Co-op guests also test item and vehicle meshes (they have no bodies).
      if (H.remotePick) { const q = H.remotePick([o.x, o.y, o.z], [d.x, d.y, d.z]); if (q && (!r || r.t == null || q.t < r.t)) r = q; }
      H.aim = r;
    });
    const info = aimInfo();
    H.cooldown -= dt;
    if (!enabled) H.precise = false; // a panel or lost pointer lock ends precision placement
    if (enabled && H.remote) remoteControls(input, info);
    else if (enabled) {
      if (input.pressed('use') || (input.held('use') && H.cooldown <= -0.15)) {
        const e = heldEnt();
        if (e && H.cooldown <= 0) { H.cooldown = toolDef(e)?.cooldown || 0.3; use(); }
      }
      if (input.pressed('pickup')) pickup();
      if (input.pressed('secondary') && H.machines) {
        const held = heldEnt();
        if (held && held.type === 'coil' && H.machines.runStart(held)) { const r = H.machines.undoRun(held); say(r === 'undone' ? `Took back the last floor mount (${held.data.via?.length || 0} left)` : 'Run cancelled'); }
        else if (H.secHook?.(info, H)) { /* a bedroll: sleep */ }
        else if (held && held.type === 'shovel' && info.kind === 'claim' && shovelRmb(info)) { /* fill or flatten */ }
        else if (info.kind === 'machine' && info.dist < REACH + 0.5 && !info.m.run) {
          if (held && held.type === 'mallet') { info.m.locked = false; audio.play('pickup'); say(`${H.machines.name(info.m.def)} unlocked`); }
          else H.machines.openPanel(info.id);
        }
      }
      dropControls(input, drop);
      if (input.pressed('swap')) swap();
    }
    const e = heldEnt();
    // Placement ghost while holding a machine crate; pipe preview with a coil.
    if (H.machines) {
      if (e && e.type === 'crate') {
        const aimOk = H.aim && H.aim.t < 6 && (info.kind === 'claim' || info.kind === 'ground' || info.kind === 'machine' || info.kind === 'water');
        const g = H.machines.ghost(e.data.def, aimOk ? { p: H.aim.p, n: H.aim.n, machine: info.kind === 'machine' ? info.id : null } : null, enabled ? input : null, dt);
        H.ghostState = g;
        if (g && (H._gq = (H._gq || 0) - dt) < 0) { H._gq = 0.12; const key = g.pos.join(',') + g.rot; H.machines.checkFree(e.data.def, g.pos, g.rot).then(ok => { H.ghostFree = ok; H.machines.setGhostOk(ok && !H.machines._ghostWhy); }); void key; }
        if (g) H.machines.setGhostOk(H.ghostFree && !g.why);
        { H.machines.showGrid(g, e.data.def, H.aim?.p[1]); H.machines.showPorts({ ghost: g ? { def: e.data.def, pos: g.pos, rot: g.rot } : null, near: g ? g.pos : (H.aim ? H.aim.p : null), hover: info.kind === 'machine' ? info.id : null }); }
      } else {
        H.machines.ghost(null); H.ghostState = null;
        {
          H.machines.showGrid(null);
          // A coil shows the ports near where you aim; otherwise only the machine you look at.
          const coil = e && e.type === 'coil';
          H.machines.showPorts(coil || (info.kind === 'machine' && info.dist < 6) ? { near: coil && H.aim ? H.aim.p : null, hover: info.kind === 'machine' && info.dist < 6 ? info.id : null } : null);
        }
      }
      H.machines.previewRun(e && e.type === 'coil' ? e : null, H.aim && H.aim.t < 8 ? H.aim.p : null, info.kind);
    }
    // Drop ring and validity check (a box overlap at the landing spot).
    if (e && H.aim && H.aim.t < H.reach && (info.kind === 'claim' || info.kind === 'ground' || info.kind === 'item' || (info.kind === 'vehicle' && info.bed))) {
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
    let card = hov != null ? items.card(hov) : null, ref = hov != null ? { type: info.ent.type, tier: info.ent.data?.tier, cap: info.ent.data?.cap, def: info.ent.data?.def, material: info.ent.item?.material || info.ent.data?.material, stage: info.ent.item?.stage || info.ent.data?.stage } : null;
    if (!card && info.kind === 'prop' && info.dist < 6) { card = H.props.card(info.id); ref = { prop: info.id }; }
    if (!card && info.kind === 'machine' && info.dist < 6) { card = H.machines.card(info.id); ref = { def: info.m.def }; }
    if (!card && info.kind === 'vehicle' && info.dist < 5) {
      const c = H.vehicles.cargoNear(info.id, info.p, 0.6);
      if (c) card = items.card(c.id);
      else { const v = H.vehicles.list.get(info.id); card = { name: v.def.name, lines: [v.def.fuelMax ? `Fuel ${Math.round(v.fuel / v.def.fuelMax * 100)}%` : 'Rides the rails', `Bed: ${v.cargo.length} items · ${H.vehicles.cargoKg(info.id).toFixed(0)} kg`] }; }
    }
    hud.tooltip(card);
    H.hover = card ? { card, ref } : null;
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
  // ---- Co-op guest: actions go to the host, which runs the real thing ----
  // Panels (shops, the guild board, machine panels, the truck bed) open here;
  // what they change is sent on as UI actions.
  const LOCAL_PROPS = new Set(['shop', 'guild', 'pumpboard', 'prices']);
  function remoteControls(input, info) {
    const e = heldEnt();
    if (input.pressed('use') || (input.held('use') && H.cooldown <= -0.15)) {
      if (e && H.cooldown <= 0) {
        H.cooldown = toolDef(e)?.cooldown || 0.3;
        if (e.type === 'crate' && H.machines) {
          const g = H.ghostState;
          if (!g) {} else if (g.why) { say(g.why, 'err'); audio.play('error'); }
          else if (!H.ghostFree) { say('Something is in the way', 'err'); audio.play('error'); }
          else { H.remote({ k: 'place', def: e.data.def, pos: g.pos, rot: g.rot, ent: e.id }); H.play('place'); }
        } else {
          // Guests mirror the first click of a rail line for their hint
          // (the host keeps the real start point).
          if (e.type === 'railkit' && info.p && info.dist <= 8) H.railStart = H.railStart ? null : info.p.slice();
          H.remote({ k: 'use' }); H.play(e.type === 'shovel' ? 'dig' : e.type === 'pick' ? 'swing' : 'grab'); }
      }
    }
    if (input.pressed('pickup')) {
      const near = info.dist !== undefined && info.dist < REACH + 0.5;
      if (info.kind === 'prop' && near && LOCAL_PROPS.has(H.props.kindOf?.(info.id))) H.props.interact(info.id);
      else if (info.kind === 'vehicle' && info.dist < REACH + 0.8) H.onVehicle?.(info.id);
      else H.remote({ k: 'pick' });
    }
    if (input.pressed('secondary') && H.machines) {
      if (e && e.type === 'coil' && H.machines.runStart(e)) H.remote({ k: 'sec' });
      else if ((info.kind === 'item' && info.ent?.type === 'bedroll' && info.dist < REACH) || (e && e.type === 'shovel' && info.kind === 'claim' && info.dist < REACH)) { H.remote({ k: 'rmb' }); if (e?.type === 'shovel') H.play('dig'); }
      else if (info.kind === 'machine' && info.dist < REACH + 0.5 && !info.m.run) {
        if (e && e.type === 'mallet') H.remote({ k: 'unlock', id: info.id });
        else H.machines.openPanel(info.id);
      }
    }
    if (!e) H.precise = false;
    else dropControls(input, () => {
      if (info.kind === 'vehicle' && info.dist < bedReach()) H.remote({ k: 'drop', reach: H.reach });
      else if (!H.ringPos) say('Aim at the ground to drop');
      else if (!H.ringOk) { say('No room there', 'err'); audio.play('error'); }
      else { const d = camDir(); H.remote({ k: 'drop', ring: H.ringPos, yaw: Math.atan2(-d.x, -d.z), rot: H.dropRot.slice() }); H.play('equip'); }
    });
    if (input.pressed('swap')) H.remote({ k: 'swap' });
  }
  // G drops on release; holding it is precision placement: R/T/Y turn
  // the item (Ctrl reverses) and the wheel sets how far the ring reaches.
  function dropControls(input, doDrop) {
    const e = heldEnt();
    if (input.pressed('drop') && e) H.precise = true;
    if (!e) H.precise = false;
    const w = input.wheel();
    if (w && e && H.precise && e.type !== 'crate') { H.reach = Math.max(1.5, Math.min(6, H.reach - w * 0.5)); say(`Reach ${H.reach.toFixed(1)} m`); }
    if (e && H.precise && e.type !== 'crate' && e.type !== 'coil' && (input.pressed('rotX') || input.pressed('rotY') || input.pressed('rotZ'))) {
      const ax = input.pressed('rotX') ? 0 : input.pressed('rotY') ? 1 : 2;
      H.dropRot[ax] = (H.dropRot[ax] + (input.reverse ? 7 : 1)) % 8;
      say(`Turned ${['pitch', 'yaw', 'roll'][ax]} to ${H.dropRot[ax] * 45}°`);
    }
    if (input.released('drop') && H.precise) { H.precise = false; if (e) doDrop(); H.dropRot = [0, 0, 0]; }
  }
  // Host side: run a guest's drop at the ring they saw.
  H.dropAt = (ring, yaw, rot) => {
    const e = heldEnt(); if (!e) return false;
    const hh = items.halfHeight(e);
    const r = e.type !== 'crate' && Array.isArray(rot) && rot.length === 3 ? rot.map(v => (v | 0) % 8) : [0, 0, 0];
    items.place(e.id, [ring[0], ring[1] + hh + (r.some(Boolean) ? items.shapeOf(e).hx : 0) + 0.02, ring[2]], dropQuat(yaw, r));
    H.hand = null; audio.play('drop');
    return true;
  };
  H.camDir = camDir;
  H.eye = () => camera.position.toArray();

  H.give = (type, data = {}) => {
    const base = TOOLS[type] ? { loads: [], contents: [], ...data } : data;
    const ent = items.spawn(type, [0, 0, 0], { data: base, loc: 'held' });
    if (H.hand) { if (!H.slot && TOOLS[items.get(H.hand).type]) H.slot = H.hand; else { const old = items.get(H.hand); items.place(old.id, camera.position.toArray()); } }
    H.hand = ent.id;
    return ent;
  };
  H.viewmodel = () => held3d;
  H.refreshHeld = () => { heldKey = ''; };
  H.setVisible = (v) => { holder.visible = v; if (!v) ring.visible = false; };
  H.use = use; H.pickup = pickup; H.drop = drop; H.swap = swap; H.aimInfo = aimInfo; H.wash = wash; H.dig = dig;
  return H;
}
