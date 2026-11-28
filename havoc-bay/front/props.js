/* Island Front: static scenery props made from downloaded models (packed into models/<key>.js like the unit models).
   Each prop is read once with gltfBuild and drawn with one THREE.InstancedMesh per part for every 600 m patch of the map,
   so hundreds of copies cost a handful of draw calls. A patch shows its near copies close up, a lighter copy further out,
   and nothing beyond that. Blocking props get a box collider, so units walk and drive round them.
   If a prop's model file is missing, propPlace() returns false and places nothing: the caller keeps the built-in look.

   To add a prop: pack the model (tools/pack_model.py), add its <script> to index.html above this file, and add a line to
   PROP_DEFS. Then call propPlace('<name>', x, z, ang) where the world is built (world.js), or add it to a layout below. */
'use strict';
const PROP_DEFS = {
  // key: the packed model; part / far: node-name patterns for the close-up and the distant copy; nearR / farR: draw distances (m);
  // collide: give each copy a box collider round its close-up part (false for things you can walk through);
  // plain: a flat colour in place of the colour texture (the barricade download's colour maps are copies of its normal maps);
  // matte: draw it as non-metal whatever its texture says (without an environment map a metal reads almost black, as in Optimised);
  // tint: a colour multiplier (the sandbag texture is a dark grey-olive; this brings it to the dry khaki of the game's other sandbags)
  // fit: scale so the longest side across the ground is this many metres (the piece is also centred and stood on the ground);
  // farSame: draw the close-up geometry again (without shadows) as the distant copy
  sandbagWall: { key: 'sandbags', part: /^sandbags_straight$/, far: /^sandbags_straight_far$/, nearR: 180, farR: 1100, collide: true, matte: true, tint: [3.2, 2.9, 2.3] },
  // "Military Barricades / Walls" by A_W: separate pieces laid out side by side in the file, each centred here
  blastWall: { key: 'barricades', plain: 0x6f6c66, part: /^Barricade 1\.001_Barricade 2_0$/, nearR: 450, farR: 1400, farSame: true, collide: true, matte: true },
  jersey: { key: 'barricades', plain: 0x6f6c66, part: /^Barricade 1\.002_Long Barricade_0$/, nearR: 350, farR: 900, farSame: true, collide: true, matte: true },
  concreteBlock: { key: 'barricades', plain: 0x6f6c66, part: /^Cube_Block Barricade_0$/, nearR: 300, collide: true, matte: true },
  tankTrap: { key: 'barricades', plain: 0x6f6c66, part: /^Cube\.002_Tri Barricade_0$/, nearR: 300, collide: true, matte: true },
  // "midpoly Rocks" by Helindu: seven rocks of about 12,000 triangles each, so they are drawn close up only
  ...Object.fromEntries([0, 1, 2, 3, 4, 5, 6].map(k => ['rock' + k, { key: 'rocks', part: new RegExp('^Cube' + (k ? '\\.00' + k : '') + '_Material'), fit: 3.2, nearR: 420, collide: true, matte: true }])),
  // "Abandoned Farm House With Hay" by Azad Balabanian (about 130,000 triangles: only a few are placed)
  farmhouse: { key: 'farmhouse', part: /_u[12]_v1_0$/, nearR: 1000, collide: true },
  // "Panzer IV Medium Tank" by Joanthan To, darkened as a burnt-out wreck
  wreck: { key: 'panzer4', part: /^Object_\d+$/, fit: 6.6, nearR: 450, farR: 1200, farSame: true, collide: true, matte: true, tint: [.42, .38, .34] },
};
const PROPS = { built: {}, queue: [], patches: [] };
const PATCH = 600;
const _pm = new THREE.Matrix4(), _pq = new THREE.Quaternion(), _pv = new V3(), _ps = new V3(), _pup = new V3(0, 1, 0);

function propModel(name) { // the prop's geometry and materials, read once: { near: [{ geo, mat }], far: [...], box }
  if (name in PROPS.built) return PROPS.built[name];
  const d = PROP_DEFS[name]; let out = null;
  if (d && typeof gltfBuild === 'function' && window.MODEL_DATA && MODEL_DATA[d.key]) {
    const m = gltfBuild(d.key, d.matte || d.plain ? { material: mt => kitVariant(mt, 'prop' + (d.plain || ''), x => { const c = Object.assign(x.clone(), { metalness: 0, metalnessMap: null });
      if (d.plain) { c.map = null; c.color.setHex(d.plain); } return c; }) } : {});
    if (m && d.tint) for (const ms of m.meshes) ms.material = kitTint(ms.material, d.tint);
    if (m) {
      const parts = re => { const list = []; if (!re) return list; m.root.updateMatrixWorld(true);
        for (const n of m.named(re)) n.traverse(o => { if (o.isMesh) { const geo = o.geometry.clone(); geo.applyMatrix4(o.matrixWorld); geo.computeBoundingBox(); list.push({ geo, mat: o.material }); } });
        return list; };
      const near = parts(d.part), far = d.farSame ? near : parts(d.far);
      if (near.length) { let box = new THREE.Box3(); for (const p of near) box.union(p.geo.boundingBox);
        if (d.fit || d.farSame || d.center !== false && d.key !== 'sandbags') { // centre the piece over its origin, on the ground, scaled to d.fit metres
          const c = box.getCenter(new V3()), sz = box.getSize(new V3()), k = d.fit ? d.fit / Math.max(sz.x, sz.z, 1e-6) : 1;
          const fix = new THREE.Matrix4().makeScale(k, k, k).multiply(new THREE.Matrix4().makeTranslation(-c.x, -box.min.y, -c.z));
          for (const p of new Set([...near, ...far])) { p.geo.applyMatrix4(fix); p.geo.computeBoundingBox(); p.geo.computeBoundingSphere(); }
          box = new THREE.Box3(); for (const p of near) box.union(p.geo.boundingBox); }
        out = { near, far, box }; }
    }
  }
  return PROPS.built[name] = out;
}
function propAvailable(name) { return !!propModel(name); }
/* Place one copy. ang turns it the way Site.box turns a box (its length runs along (cos ang, sin ang)); o.y: base height (default the ground),
   o.scale: a number or [x, y, z]. Returns false (and places nothing) if the model is missing. */
function propPlace(name, x, z, ang = 0, o = {}) {
  const P = propModel(name); if (!P) return false;
  const d = PROP_DEFS[name], s = o.scale ?? 1, sx = Array.isArray(s) ? s[0] : s, sy = Array.isArray(s) ? s[1] : s, sz = Array.isArray(s) ? s[2] : s;
  const y = o.y ?? groundY(x, z) - .05;
  PROPS.queue.push({ name, x, y, z, ang, sx, sy, sz });
  if (d.collide && o.collide !== false) { const b = P.box, cx = (b.min.x + b.max.x) / 2 * sx, cz = (b.min.z + b.max.z) / 2 * sz, c = Math.cos(ang), sn = Math.sin(ang);
    addCollider(x + cx * c - cz * sn, z + cx * sn + cz * c, (b.max.x - b.min.x) / 2 * sx, (b.max.z - b.min.z) / 2 * sz, ang, y - 1, y + b.max.y * sy); }
  return true;
}
/* A run of wall pieces from local (f0x, f0z) to (f1x, f1z) on a Site, end to end; returns false if the model is missing. */
function propRun(site, name, f0x, f0z, f1x, f1z, o = {}) {
  const P = propModel(name); if (!P) return false;
  const s = o.scale ?? 1, len = (P.box.max.x - P.box.min.x) * (Array.isArray(s) ? s[0] : s) * .97, L = Math.hypot(f1x - f0x, f1z - f0z), n = Math.max(1, Math.round(L / len)), rot = Math.atan2(f1z - f0z, f1x - f0x);
  for (let k = 0; k < n; k++) { const t = (k + .5) / n, [x, z] = site.w(lerp(f0x, f1x, t), lerp(f0z, f1z, t)); propPlace(name, x, z, site.ang + rot, Object.assign({ y: o.y ?? (o.onPad ? site.y0 - .05 : undefined) }, o)); }
  return true;
}
/* Build the instanced meshes for everything placed since the world was started. */
function propsFlush(parent) {
  PROPS.patches = [];
  const groups = new Map();
  for (const q of PROPS.queue) { const k = q.name + '|' + Math.floor(q.x / PATCH) + '|' + Math.floor(q.z / PATCH); let g = groups.get(k); if (!g) groups.set(k, g = []); g.push(q); }
  for (const list of groups.values()) {
    const d = PROP_DEFS[list[0].name], P = propModel(list[0].name), patch = { cx: 0, cz: 0, r: 0, near: [], far: [], nearR: d.nearR, farR: d.farR };
    for (const q of list) { patch.cx += q.x / list.length; patch.cz += q.z / list.length; }
    for (const q of list) patch.r = Math.max(patch.r, Math.hypot(q.x - patch.cx, q.z - patch.cz));
    for (const [lvl, parts] of [['near', P.near], ['far', P.far]]) for (const p of parts) {
      const im = new THREE.InstancedMesh(p.geo, p.mat, list.length);
      list.forEach((q, i) => { _pm.compose(_pv.set(q.x, q.y, q.z), _pq.setFromAxisAngle(_pup, -q.ang), _ps.set(q.sx, q.sy, q.sz)); im.setMatrixAt(i, _pm); });
      im.instanceMatrix.needsUpdate = true; im.castShadow = lvl === 'near'; im.receiveShadow = true; im.userData.shared = true; im.visible = false;
      im.frustumCulled = false; // (the geometry's own bounds are one piece's; the patch is culled by distance below)
      parent.add(im); patch[lvl].push(im);
    }
    PROPS.patches.push(patch);
  }
  PROPS.queue = [];
}
function propsUpdate(cam) { // near copies close up, the light copy further out, nothing beyond
  for (const p of PROPS.patches) {
    const d = Math.max(0, Math.hypot(p.cx - cam.x, p.cz - cam.z) - p.r), near = d < p.nearR, far = !near && d < p.farR;
    for (const m of p.near) m.visible = near || (far && !p.far.length);
    for (const m of p.far) m.visible = far;
  }
}
function propsReset() { PROPS.queue = []; PROPS.patches = []; }

/* ---------------- layouts ---------------- */
/* Sandbag fighting positions inside a compound (checkpoint or base): short L-shaped walls on free ground,
   clear of the road through the middle (|fz| < 14), the middle itself and the infantry spawn ring. */
function propsCompound(site, hx, hz, count, seed, avoid = []) { // avoid: [[fx, fz, r], ...] more local spots to keep clear
  if (!propAvailable('sandbagWall')) return;
  const R = rng(seed), clear = (fx, fz) => Math.abs(fz) < 14 || Math.hypot(fx, fz) < 24 || (Math.abs(fx) < 34 && Math.abs(fz) > 8 && Math.abs(fz) < 54) || avoid.some(([ax, az, r]) => Math.hypot(fx - ax, fz - az) < r);
  for (let k = 0, placed = 0; k < count * 30 && placed < count; k++) {
    const fx = (R() - .5) * 2 * (hx - 12), fz = (R() - .5) * 2 * (hz - 12), rot = Math.floor(R() * 4) * Math.PI / 2, c = Math.cos(rot), s = Math.sin(rot);
    // an L: one arm of three pieces, one of two, meeting at (fx, fz)
    const a = [fx + c * 9.6, fz + s * 9.6], b = [fx - s * 6.4, fz + c * 6.4];
    if ([[fx, fz], a, b, [(fx + a[0]) / 2, (fz + a[1]) / 2]].some(([u, v]) => clear(u, v) || Math.abs(u) > hx - 6 || Math.abs(v) > hz - 6)) continue;
    let blocked = false;
    for (const [u, v] of [[fx, fz], a, b, [(fx + a[0]) / 2, (fz + a[1]) / 2], [(fx + b[0]) / 2, (fz + b[1]) / 2]]) { const [x, z] = site.w(u, v); if (pushOutCircle(new V3(x, 0, z), 2.2, site.y0, site.y0 + 2) || terrainY(x, z) < .5) { blocked = true; break; } }
    if (blocked) continue;
    propRun(site, 'sandbagWall', fx, fz, a[0], a[1], { onPad: true }); propRun(site, 'sandbagWall', fx - s * .5, fz + c * .5, b[0], b[1], { onPad: true });
    placed++;
  }
}
/* Roadside positions in open country: a short wall a little way off a road, facing it, every so often. Kept off the road and its spawn lanes,
   out of bases, checkpoints, airfields and towns, off bridges and out of the woods. */
function propsRoadside(M, seed) {
  if (!propAvailable('sandbagWall')) return;
  const R = rng(seed), keepOut = M.zones.map(zn => ({ x: zn.x * 1000, z: zn.y * 1000, r: Math.hypot(zn.hx, zn.hy) * 1000 + 60 }));
  for (const t of M.towns) keepOut.push({ x: t.x * 1000, z: t.y * 1000, r: t.r * 1000 + 80 });
  for (const b of WORLD.bridges) keepOut.push({ x: b.x * 1000, z: b.y * 1000, r: 160 });
  for (const r of M._roads) {
    let carry = R() * 500;
    for (let k = 0; k < r.P.length - 1; k++) {
      const [x0, z0] = kmToM(r.P[k]), [x1, z1] = kmToM(r.P[k + 1]), L = Math.hypot(x1 - x0, z1 - z0), ux = (x1 - x0) / L, uz = (z1 - z0) / L;
      for (let t = carry; t < L; t += 650 + R() * 500) {
        carry = 0; const side = R() < .5 ? -1 : 1, off = 22 + R() * 8, x = x0 + ux * t - uz * off * side, z = z0 + uz * t + ux * off * side;
        if (keepOut.some(o => Math.hypot(o.x - x, o.z - z) < o.r) || terrainY(x, z) < 1.5 || inForest(x, z)) continue;
        let ok = true; for (const e of [-6, 0, 6]) { const px = x + ux * e, pz = z + uz * e; if (onRoad(px, pz) || onRoad(px - uz * 5 * side, pz + ux * 5 * side) || Math.abs(terrainY(px, pz) - terrainY(x, z)) > 1.6) ok = false; }
        if (!ok || pushOutCircle(new V3(x, 0, z), 6, terrainY(x, z), terrainY(x, z) + 2)) continue;
        const ang = Math.atan2(uz, ux), c = Math.cos(ang), s = Math.sin(ang);
        for (const e of [-3.2, 0, 3.2]) propPlace('sandbagWall', x + c * e, z + s * e, ang);
        propPlace('sandbagWall', x + c * 5 + s * side * 1.6, z + s * 5 - c * side * 1.6, ang + Math.PI / 2 * side); // a short return at one end
      }
    }
  }
}

/* Concrete dressing for a compound: a blast-wall screen inside each base corner and jersey barriers either side of the road at each gate.
   Kept off the road (|fz| < 14), the middle and the spawn ring, as for the sandbags. */
function propsConcrete(site, hx, hz, seed, base) {
  const R = rng(seed);
  if (propAvailable('jersey')) for (const gx of [-1, 1]) for (const sd of [-1, 1]) { // a short staggered line beside the road at each gate
    const fx = gx * (hx - 9), fz = sd * 17;
    for (let k = 0; k < 2; k++) { const [x, z] = site.w(fx - gx * k * 3.4, fz + sd * k * .6); if (!pushOutCircle(new V3(x, 0, z), 1.2, site.y0, site.y0 + 1)) propPlace('jersey', x, z, site.ang, { y: site.y0 - .05 }); }
  }
  if (base && propAvailable('blastWall')) for (const [cx, cz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) { // an L of blast walls in each corner
    const fx = cx * (hx - 16), fz = cz * (hz - 16);
    for (let k = 0; k < 5; k++) for (const [u, v, rot] of [[fx - cx * k * 1.95, fz, 0], [fx, fz - cz * (k + 1) * 1.95, Math.PI / 2]]) {
      const [x, z] = site.w(u, v); if (pushOutCircle(new V3(x, 0, z), 1.2, site.y0, site.y0 + 3)) continue; propPlace('blastWall', x, z, site.ang + rot, { y: site.y0 - .05 }); }
  }
  if (!base && propAvailable('concreteBlock')) for (let k = 0; k < 3; k++) { // a few loose blocks
    const fx = (R() - .5) * 2 * (hx - 8), fz = (R() < .5 ? -1 : 1) * (20 + R() * (hz - 28)); const [x, z] = site.w(fx, fz);
    if (!pushOutCircle(new V3(x, 0, z), 1.5, site.y0, site.y0 + 1)) propPlace('concreteBlock', x, z, site.ang + R() * Math.PI, { y: site.y0 - .05 });
  }
}
/* Open country: rocks in small clusters, burnt-out wrecks a little off the roads and a few abandoned farmhouses.
   Kept off roads and their spawn lanes, out of bases, checkpoints, airfields, towns and woods, off bridges and out of the water. */
function propsCountry(M, seed) {
  const R = rng(seed), keepOut = M.zones.map(zn => ({ x: zn.x * 1000, z: zn.y * 1000, r: Math.hypot(zn.hx, zn.hy) * 1000 + 60 }));
  for (const t of M.towns) keepOut.push({ x: t.x * 1000, z: t.y * 1000, r: t.r * 1000 + 80 });
  for (const b of WORLD.bridges) keepOut.push({ x: b.x * 1000, z: b.y * 1000, r: 160 });
  // (the road grid marks whole 27 m cells, too coarse here: measure the distance to the road centre lines instead)
  const segs = []; for (const r of M._roads) for (let k = 0; k < r.P.length - 1; k++) segs.push([...kmToM(r.P[k]), ...kmToM(r.P[k + 1])]);
  const roadDist = (x, z) => { let m = 1e9; for (const [ax, az, bx, bz] of segs) { const dx = bx - ax, dz = bz - az, t = clamp(((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1), 0, 1); m = Math.min(m, Math.hypot(x - ax - dx * t, z - az - dz * t)); } return m; };
  const free = (x, z, r, road) => !keepOut.some(o => Math.hypot(o.x - x, o.z - z) < o.r + r) && terrainY(x, z) > 1.5 && !inForest(x, z) && roadDist(x, z) > road + r && !pushOutCircle(new V3(x, 0, z), r, terrainY(x, z), terrainY(x, z) + 2);
  const WX = GW * CELL, WZ = GH * CELL; // (world x and z run from 0 to these)
  if (propAvailable('rock0')) for (let c = 0; c < 70; c++) { // clusters of two to four rocks
    const x0 = WX * (.04 + R() * .92), z0 = WZ * (.04 + R() * .92); if (!free(x0, z0, 8, 22)) continue;
    for (let k = 0, n = 2 + Math.floor(R() * 3); k < n; k++) { const x = x0 + (R() - .5) * 14, z = z0 + (R() - .5) * 14, s = .5 + R() * .9; if (!free(x, z, 2 * s, 20)) continue;
      propPlace('rock' + Math.floor(R() * 7), x, z, R() * 6.28, { scale: [s, s * (.6 + R() * .5), s], y: terrainY(x, z) - .35 * s }); }
  }
  for (const r of M._roads) { // wrecks and farmhouses along the roads
    let carry = R() * 900;
    for (let k = 0; k < r.P.length - 1; k++) {
      const [x0, z0] = kmToM(r.P[k]), [x1, z1] = kmToM(r.P[k + 1]), L = Math.hypot(x1 - x0, z1 - z0), ux = (x1 - x0) / L, uz = (z1 - z0) / L;
      for (let t = carry; t < L; t += 900 + R() * 700) {
        carry = 0; const side = R() < .5 ? -1 : 1, house = R() < .3, off = house ? 48 + R() * 14 : 26 + R() * 8, x = x0 + ux * t - uz * off * side, z = z0 + uz * t + ux * off * side;
        const ang = Math.atan2(uz, ux) + (house ? 0 : (R() - .5) * 1.2);
        if (x < 40 || z < 40 || x > WX - 40 || z > WZ - 40) continue;
        if (house) { if (propAvailable('farmhouse') && free(x, z, 17, 24) && Math.abs(terrainY(x + 10, z) - terrainY(x - 10, z)) < 2.5 && Math.abs(terrainY(x, z + 10) - terrainY(x, z - 10)) < 2.5) propPlace('farmhouse', x, z, ang, { y: Math.min(terrainY(x + 10, z), terrainY(x - 10, z), terrainY(x, z + 10), terrainY(x, z - 10)) - .1 }); }
        else if (propAvailable('wreck') && free(x, z, 4, 16)) propPlace('wreck', x, z, ang, { y: terrainY(x, z) - .15 });
      }
    }
  }
}
