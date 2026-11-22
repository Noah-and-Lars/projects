// The entity store for carriable things: nuggets, gems, quartz, dirt clods,
// tools and piles (BUILD_BRIEF section 4).
//
// Every entity is plain data: { id, type, pos, quat, loc, item?, data }.
// `loc` is the location state: 'loose' (a rigid body in the physics worker,
// possibly asleep), 'held' (in a hand or the swap slot), 'contained' (an
// entry in a pan, bucket or later a crate) or 'pile' (merged into a Pile).
// Changing loc swaps how the entity is represented. Nuggets are drawn with
// one InstancedMesh per material.
import * as THREE from 'three';
import { MATERIALS, itemValue, itemName } from '../defs/materials.js';
import { TOOLS, TOOL_BOX, nuggetSize, nuggetGeometry, nuggetMaterial, toolGeometry, clodGeometry } from '../defs/items.js';

const CAP = 2048;           // instances per material
const PILE_MIN = 60;        // items of one material/stage resting within 1 m merge
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _v = new THREE.Vector3(), _s = new THREE.Vector3();
const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);

export function createItems({ scene, physics, materials }) {
  const ents = new Map();
  let nextId = 100000; // body ids for items; low ids are reserved
  const inst = {};     // material -> { mesh, free: [], used }
  const meshes = new Map(); // id -> Mesh for non-instanced entities
  const group = new THREE.Group(); scene.add(group);

  function instFor(material) {
    if (inst[material]) return inst[material];
    const kind = MATERIALS[material].kind;
    const mat = nuggetMaterial(material);
    materials.litMaterial(mat);
    const mesh = new THREE.InstancedMesh(nuggetGeometry(kind, material.length * 7), mat, CAP);
    mesh.count = CAP; mesh.castShadow = true; mesh.receiveShadow = true; mesh.frustumCulled = false;
    for (let i = 0; i < CAP; i++) mesh.setMatrixAt(i, ZERO);
    group.add(mesh);
    inst[material] = { mesh, free: Array.from({ length: CAP }, (_, i) => CAP - 1 - i), dirty: true };
    return inst[material];
  }

  const isNugget = (e) => e.type === 'nugget';
  function shapeOf(e) {
    if (isNugget(e)) { const s = nuggetSize(e.item.kg, e.item.material) * 0.5; return { type: 'box', hx: s * 0.95, hy: s * 0.65, hz: s * 0.95 }; }
    if (e.type === 'clod') return { type: 'box', hx: 0.18, hy: 0.12, hz: 0.18 };
    if (e.type === 'pile') { const r = pileRadius(e); return { type: 'box', hx: r * 0.8, hy: r * 0.35, hz: r * 0.8 }; }
    const b = TOOL_BOX[e.type] || [0.15, 0.15, 0.15];
    return { type: 'box', hx: b[0], hy: b[1], hz: b[2] };
  }
  const pileRadius = (e) => 0.35 + Math.cbrt(e.data.kgs.length) * 0.09;
  function massOf(e) { if (e.item) return Math.max(0.2, e.item.kg); if (TOOLS[e.type]) return TOOLS[e.type].kg; return 3; }

  function makeMesh(e) {
    let geo, mat = materials.vcolor;
    if (e.type === 'clod') geo = clodGeometry(e.data.band);
    else if (e.type === 'pile') {
      const r = pileRadius(e);
      geo = new THREE.ConeGeometry(r, r * 0.75, 9, 2).toNonIndexed();
      geo.translate(0, r * 0.2, 0);
      mat = instFor(e.data.material).mesh.material;
    } else geo = toolGeometry(e.type, e.data);
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = m.receiveShadow = true;
    m.userData.ent = e.id;
    return m;
  }
  function show(e) {
    if (isNugget(e)) {
      const I = instFor(e.item.material);
      if (e.slot === undefined) e.slot = I.free.pop();
      const s = nuggetSize(e.item.kg, e.item.material);
      I.mesh.setMatrixAt(e.slot, _m.compose(_v.fromArray(e.pos), _q.fromArray(e.quat), _s.set(s, s, s)));
      I.dirty = true;
    } else if (!meshes.has(e.id)) {
      // Place the new mesh where the entity is: a rebuilt mesh (a bucket
      // that just got a load) must not wait for a physics update to move.
      const m = makeMesh(e); m.position.fromArray(e.pos); m.quaternion.fromArray(e.quat);
      meshes.set(e.id, m); group.add(m);
    }
  }
  function hide(e) {
    if (isNugget(e)) {
      if (e.slot !== undefined) { const I = instFor(e.item.material); I.mesh.setMatrixAt(e.slot, ZERO); I.free.push(e.slot); I.dirty = true; e.slot = undefined; }
    } else { const m = meshes.get(e.id); if (m) { group.remove(m); m.geometry.dispose(); meshes.delete(e.id); } }
  }
  function addBody(e, vel) {
    physics.addBody({ id: e.id, shape: shapeOf(e), pos: e.pos, quat: e.quat, vel, mass: massOf(e), kinematic: e.type === 'pile', friction: 0.8, angDamp: 0.6 });
  }

  const api = {
    ents, group, meshes,
    get(id) { return ents.get(id); },
    // Create a loose entity in the world.
    spawn(type, pos, { item = null, data = {}, quat = [0, 0, 0, 1], vel = null, loc = 'loose' } = {}) {
      const e = { id: nextId++, type, pos: pos.slice(), quat: quat.slice(), loc, item, data };
      ents.set(e.id, e);
      if (loc === 'loose') { addBody(e, vel); show(e); e._synced = false; }
      return e;
    },
    remove(id) {
      const e = ents.get(id); if (!e) return;
      if (e.loc === 'loose') { physics.removeBody(id); hide(e); }
      ents.delete(id);
    },
    // Take an entity out of the world (into a hand or a container).
    take(id, loc = 'held', container = null) {
      const e = ents.get(id); if (!e) return null;
      if (e.loc === 'loose') { physics.removeBody(id); hide(e); }
      e.loc = loc; e.container = container;
      return e;
    },
    // Put an entity back into the world as a loose body.
    place(id, pos, quat = [0, 0, 0, 1], vel = null) {
      const e = ents.get(id); if (!e) return null;
      e.pos = pos.slice(); e.quat = quat.slice(); e.loc = 'loose'; e.container = null;
      addBody(e, vel); show(e); e._synced = false;
      return e;
    },
    // A tool's look depends on its loads: rebuild its mesh.
    refresh(id) { const e = ents.get(id); if (e && meshes.has(id)) { hide(e); show(e); } },
    halfHeight(e) { return shapeOf(e).hy; },
    shapeOf,
    // Sync drawn transforms with the physics worker's latest poses.
    update() {
      for (const e of ents.values()) {
        if (e.loc !== 'loose') continue;
        const pose = physics.poses.get(e.id);
        if (!pose || (pose.asleep && e._synced)) continue;
        e.pos[0] = pose.p[0]; e.pos[1] = pose.p[1]; e.pos[2] = pose.p[2];
        e.quat[0] = pose.q[0]; e.quat[1] = pose.q[1]; e.quat[2] = pose.q[2]; e.quat[3] = pose.q[3];
        e._synced = pose.asleep;
        if (isNugget(e) && e.slot !== undefined) {
          const I = inst[e.item.material]; const s = nuggetSize(e.item.kg, e.item.material);
          I.mesh.setMatrixAt(e.slot, _m.compose(_v.fromArray(e.pos), _q.fromArray(e.quat), _s.set(s, s, s))); I.dirty = true;
        } else { const m = meshes.get(e.id); if (m) { m.position.fromArray(e.pos); m.quaternion.fromArray(e.quat); } }
      }
      for (const k in inst) if (inst[k].dirty) { inst[k].mesh.instanceMatrix.needsUpdate = true; inst[k].dirty = false; inst[k].mesh.computeBoundingSphere(); }
    },
    // Hover card for the tooltip (BUILD_BRIEF 3.1: name, kg, material and stage, value).
    card(id) {
      const e = ents.get(id); if (!e) return null;
      if (e.item) {
        const m = MATERIALS[e.item.material];
        return { name: itemName(e.item), lines: [`${e.item.kg.toFixed(2)} kg · ${m.name} · ${e.item.stage === 'ore' ? (m.kind === 'fuel' ? 'fuel' : 'ore') : e.item.stage}`, m.kind === 'fuel' ? 'Burns in kilns and boosters' : `≈ § ${itemValue(e.item).toFixed(0)}`] };
      }
      if (e.type === 'pile') {
        const kg = e.data.kgs.reduce((a, b) => a + b, 0), m = MATERIALS[e.data.material];
        return { name: `Pile of ${m.name.toLowerCase()} ${e.data.stage === 'ore' ? 'nuggets' : e.data.stage}`, lines: [`${e.data.kgs.length} pieces · ${kg.toFixed(1)} kg`, m.kind === 'fuel' ? 'Fuel' : `≈ § ${(kg * (e.data.stage === 'ore' ? m.ore : m.refined)).toFixed(0)}`, 'E takes one'] };
      }
      if (e.type === 'clod') return { name: 'Dirt clod', lines: ['1 gravel load', 'Wash it in a pan'] };
      if (TOOLS[e.type]) { const t = TOOLS[e.type], n = e.data.loads?.length || 0; return { name: t.name, badge: 'Tier ' + ['', 'I', 'II', 'III', 'IV'][t.tier], lines: [t.loads ? `${n}/${t.loads} loads` : 'Breaks ground fast', e.data.contents?.length ? `${e.data.contents.length} finds inside` : null].filter(Boolean) }; }
      return { name: e.type };
    },
    // Merge resting nuggets into piles when more than PILE_MIN of one
    // material and stage sit within 1 m. Keeps awake bodies under budget.
    mergePiles() {
      // Resting nuggets bucketed into 1 m cells by material and stage.
      const cells = new Map();
      for (const e of ents.values()) {
        if (!isNugget(e) || e.loc !== 'loose') continue;
        const pose = physics.poses.get(e.id); if (!pose || !pose.asleep) continue;
        const k = `${e.item.material}|${e.item.stage}|${Math.floor(e.pos[0])}|${Math.floor(e.pos[1])}|${Math.floor(e.pos[2])}`;
        if (!cells.has(k)) cells.set(k, []);
        cells.get(k).push(e);
      }
      let made = 0;
      const used = new Set();
      for (const [k, list] of cells) {
        const [material, stage, cx, cy, cz] = k.split('|');
        // Gather this cell and its neighbours, then keep those within 1 m of their centroid.
        let near = [];
        for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) {
          const l = cells.get(`${material}|${stage}|${+cx + dx}|${+cy + dy}|${+cz + dz}`); if (l) near.push(...l);
        }
        near = near.filter(e => !used.has(e.id));
        if (near.length <= PILE_MIN || !list.some(e => !used.has(e.id))) continue;
        const c = [0, 0, 0]; for (const e of near) { c[0] += e.pos[0]; c[1] += e.pos[1]; c[2] += e.pos[2]; }
        c[0] /= near.length; c[1] /= near.length; c[2] /= near.length;
        const group = near.filter(e => Math.hypot(e.pos[0] - c[0], e.pos[1] - c[1], e.pos[2] - c[2]) <= 1);
        if (group.length <= PILE_MIN) continue;
        let minY = Infinity; for (const e of group) { minY = Math.min(minY, e.pos[1]); used.add(e.id); }
        const kgs = group.map(e => e.item.kg);
        for (const e of group) api.remove(e.id);
        api.spawn('pile', [c[0], minY, c[2]], { data: { material, stage, kgs } });
        made++;
      }
      return made;
    },
    // Take one nugget out of a pile (the heaviest); the pile shrinks.
    takeFromPile(id) {
      const p = ents.get(id); if (!p || p.type !== 'pile') return null;
      p.data.kgs.sort((a, b) => a - b);
      const kg = p.data.kgs.pop();
      const n = api.spawn('nugget', p.pos, { item: { material: p.data.material, stage: p.data.stage, kg }, loc: 'held' });
      if (p.data.kgs.length === 0) api.remove(id);
      else { physics.removeBody(id); hide(p); addBody(p); show(p); }
      return n;
    },
    counts() { let loose = 0, piles = 0; for (const e of ents.values()) { if (e.loc === 'loose') loose++; if (e.type === 'pile') piles++; } return { total: ents.size, loose, piles }; },
    // Plain-data snapshot for saves (M3) and network (M7).
    serialize() { return [...ents.values()].map(e => ({ id: e.id, type: e.type, pos: e.pos, quat: e.quat, loc: e.loc, container: e.container ?? null, item: e.item, data: e.data })); },
  };
  return api;
}
