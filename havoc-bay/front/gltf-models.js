/* Island Front: aircraft built from downloaded glTF models (packed into models/*.js so the game still opens from disk).
   The Mitsubishi F-2 model's airframe comes as one piece; here it is cut into the same damageable parts the
   code-built aircraft have (nose, front and rear fuselage, engine, inner and outer wing on each side, tailplanes, fin),
   with hit spheres fitted to the real shape. Stores hang on the model's own pylons and wingtip rails; the landing
   gear comes up after take-off.
   Credit: "Mitsubishi F-2 - Fighter Jet - Free" (https://sketchfab.com/3d-models/mitsubishi-f-2-fighter-jet-free-d3d7244554974f499b106e6c11fe3aaf)
   by bohmerang (https://sketchfab.com/bohmerang), licensed under CC-BY-NC-SA-4.0 (http://creativecommons.org/licenses/by-nc-sa/4.0/). */
'use strict';
const GLTF = {};
function b64Bytes(uri) { const s = atob(uri.slice(uri.indexOf(',') + 1)), out = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i); return out; }
function gltfParse(g) { // -> [{ name, node, geo, mat (material index) }] with every node's transform applied
  if (g._parsed) return g._parsed;
  const bin = b64Bytes(g.buffers[0].uri), dv = new DataView(bin.buffer);
  const acc = i => {
    const a = g.accessors[i], bv = g.bufferViews[a.bufferView], n = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 }[a.type];
    const C = a.componentType === 5126 ? Float32Array : a.componentType === 5125 ? Uint32Array : a.componentType === 5123 ? Uint16Array : Uint8Array, bpe = C.BYTES_PER_ELEMENT;
    const stride = bv.byteStride || n * bpe, off = (bv.byteOffset || 0) + (a.byteOffset || 0), out = new C(a.count * n);
    const rd = C === Float32Array ? (o => dv.getFloat32(o, true)) : C === Uint32Array ? (o => dv.getUint32(o, true)) : C === Uint16Array ? (o => dv.getUint16(o, true)) : (o => dv.getUint8(o));
    for (let k = 0; k < a.count; k++) for (let c = 0; c < n; c++) out[k * n + c] = rd(off + k * stride + c * bpe);
    return { array: out, n };
  };
  const out = [];
  const walk = (ni, parent) => {
    const nd = g.nodes[ni], m = new THREE.Matrix4();
    if (nd.matrix) m.fromArray(nd.matrix); else m.compose(new V3(...(nd.translation || [0, 0, 0])), new THREE.Quaternion(...(nd.rotation || [0, 0, 0, 1])), new V3(...(nd.scale || [1, 1, 1])));
    const wm = parent.clone().multiply(m);
    if (nd.mesh !== undefined) for (const pr of g.meshes[nd.mesh].primitives) {
      const geo = new THREE.BufferGeometry(), A = pr.attributes;
      const pos = acc(A.POSITION); geo.setAttribute('position', new THREE.BufferAttribute(pos.array, 3));
      if (A.NORMAL !== undefined) geo.setAttribute('normal', new THREE.BufferAttribute(acc(A.NORMAL).array, 3));
      if (A.TEXCOORD_0 !== undefined) geo.setAttribute('uv', new THREE.BufferAttribute(acc(A.TEXCOORD_0).array, 2));
      if (pr.indices !== undefined) geo.setIndex(new THREE.BufferAttribute(acc(pr.indices).array, 1));
      geo.applyMatrix4(wm); out.push({ node: nd, geo, mat: pr.material });
    }
    for (const c of nd.children || []) walk(c, wm);
  };
  for (const r of g.scenes[g.scene || 0].nodes) walk(r, new THREE.Matrix4());
  return g._parsed = out;
}
function gltfTexture(uri, srgb) { const im = new Image(), t = new THREE.Texture(im); im.onload = () => { t.needsUpdate = true; }; im.src = uri; t.flipY = false; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8; if (srgb) t.encoding = THREE.sRGBEncoding; return t; }
function gltfMaterials(g) {
  if (g._mats) return g._mats;
  const tex = (g.textures || []).map(t => gltfTexture(g.images[t.source].uri, false));
  return g._mats = g.materials.map(m => {
    const p = m.pbrMetallicRoughness || {}, f = p.baseColorFactor || [1, 1, 1, 1];
    if (m.alphaMode === 'BLEND') return /glass/i.test(m.name) ? AIR_GLASS : null; // canopy glass; the HUD glow is left out
    const o = { color: new THREE.Color(f[0], f[1], f[2]), roughness: p.roughnessFactor ?? 1, metalness: p.metallicFactor ?? 1, side: m.doubleSided ? THREE.DoubleSide : THREE.FrontSide, envMapIntensity: 1 };
    if (p.baseColorTexture) o.map = gltfTexture(g.images[g.textures[p.baseColorTexture.index].source].uri, true);
    if (p.metallicRoughnessTexture) { o.roughnessMap = o.metalnessMap = tex[p.metallicRoughnessTexture.index]; }
    if (m.normalTexture) { o.normalMap = tex[m.normalTexture.index]; o.normalScale = new THREE.Vector2(1, -1); }
    if (m.emissiveFactor) { o.emissive = new THREE.Color(...m.emissiveFactor); o.emissiveIntensity = (m.extensions && m.extensions.KHR_materials_emissive_strength || {}).emissiveStrength || 1; }
    return new THREE.MeshStandardMaterial(o);
  });
}

/* cut an airframe mesh into the damageable parts by where each triangle sits (which(x, y, z) names the part), with hit spheres:
   one per occupied 1.6 m cell, sized to the triangles in it */
function airframeCut(air, which) {
  const P = air.attributes.position, N = air.attributes.normal, U = air.attributes.uv;
  const buckets = {};
  for (let t = 0; t < P.count; t += 3) {
    const cx = (P.getX(t) + P.getX(t + 1) + P.getX(t + 2)) / 3, cy = (P.getY(t) + P.getY(t + 1) + P.getY(t + 2)) / 3, cz = (P.getZ(t) + P.getZ(t + 1) + P.getZ(t + 2)) / 3, id = which(cx, cy, cz);
    const b = buckets[id] || (buckets[id] = { p: [], n: [], u: [], c: [] });
    for (let k = 0; k < 3; k++) { b.p.push(P.getX(t + k), P.getY(t + k), P.getZ(t + k)); b.n.push(N.getX(t + k), N.getY(t + k), N.getZ(t + k)); b.u.push(U.getX(t + k), U.getY(t + k)); }
    b.c.push([cx, cy, cz]);
  }
  const parts = {}, spheres = {};
  for (const [id, b] of Object.entries(buckets)) {
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(b.p, 3)); geo.setAttribute('normal', new THREE.Float32BufferAttribute(b.n, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(b.u, 2)); geo.computeBoundingSphere();
    parts[id] = geo;
    // hit spheres: one per occupied 1.6 m cell, sized to the triangles in it
    const cells = new Map(); for (const c of b.c) { const k = Math.floor(c[0] / 1.6) + ',' + Math.floor(c[1] / 1.6) + ',' + Math.floor(c[2] / 1.6); let a = cells.get(k); if (!a) cells.set(k, a = []); a.push(c); }
    const sph = []; for (const a of cells.values()) { if (a.length < 3) continue; const m = a.reduce((s, c) => [s[0] + c[0], s[1] + c[1], s[2] + c[2]], [0, 0, 0]).map(v => v / a.length); let r = 0; for (const c of a) r = Math.max(r, Math.hypot(c[0] - m[0], c[1] - m[1], c[2] - m[2])); sph.push([m[0], m[1], m[2], Math.max(.35, r + .15)]); }
    const bs = geo.boundingSphere; spheres[id] = { p: [bs.center.x, bs.center.y, bs.center.z], r: bs.radius * .7, sph };
  }
  return { parts, spheres };
}
/* the F-2: the source model in the game's frame (x forward, y up, z right), scaled to the real aircraft */
const F2_FIT = { s: 1.1, dx: -2.8, dy: 0 };
function f2Prepared() {
  if (GLTF.f2) return GLTF.f2;
  const g = MODEL_DATA.f2, list = gltfParse(g), mats = gltfMaterials(g), fit = new THREE.Matrix4().makeTranslation(F2_FIT.dx, F2_FIT.dy, 0).multiply(new THREE.Matrix4().makeScale(F2_FIT.s, F2_FIT.s, F2_FIT.s));
  const named = {}; for (const o of list) { const name = g.nodes.find(n => n.children && n.children.includes(g.nodes.indexOf(o.node))).name; const geo = o.geo.clone().applyMatrix4(fit); named[name] = { geo, mat: mats[o.mat] }; }
  // cut the airframe into parts by where each triangle sits
  const air = named['F-2-airframe_0'].geo.toNonIndexed(), P = air.attributes.position, N = air.attributes.normal, U = air.attributes.uv;
  const which = (x, y, z) => { const az = Math.abs(z);
    if (x > 6.1) return 'nose';
    if (y > 1.25 && x < -1.6) return 'fin';
    if (x < -3.7 && az > 1.3 && y < 1.25) return z < 0 ? 'stabL' : 'stabR';
    if (az > 1.45 && x > -4.6 && x < 4.2) return az < 3.4 ? (z < 0 ? 'wingLi' : 'wingRi') : (z < 0 ? 'wingLo' : 'wingRo');
    if (x < -5.7) return 'eng1';
    return x > .3 ? 'fuseF' : 'fuseR'; };
  const { parts, spheres } = airframeCut(air, which);
  // pylons (from the rails mesh) and the wingtip launchers
  const R = named['F-2-rails_8'].geo, RP = R.attributes.position, groups = [];
  for (let i = 0; i < RP.count; i++) { const x = RP.getX(i), y = RP.getY(i), z = RP.getZ(i); let gr = groups.find(gq => Math.abs(gq.z / gq.n - z) < .5); if (!gr) groups.push(gr = { x: 0, y: 0, z: 0, n: 0, miny: 9 }); gr.x += x; gr.y += y; gr.z += z; gr.n++; gr.miny = Math.min(gr.miny, y); }
  const pylons = groups.filter(gq => gq.n > 20).map(gq => ({ x: gq.x / gq.n, y: gq.miny, z: gq.z / gq.n })).sort((a, b) => Math.abs(a.z) - Math.abs(b.z));
  let tipX = 0, tipY = 0, tipN = 0, tipZ = 0; for (let i = 0; i < P.count; i++) tipZ = Math.max(tipZ, Math.abs(P.getZ(i)));
  for (let i = 0; i < P.count; i++) if (Math.abs(P.getZ(i)) > tipZ - .25) { tipX += P.getX(i); tipY += P.getY(i); tipN++; }
  { const c = named['F-2-cockpit_2'].geo; c.computeBoundingSphere(); const bs = c.boundingSphere; spheres.cockpit = { p: [bs.center.x, bs.center.y, bs.center.z], r: Math.min(.9, bs.radius * .6), sph: [] }; }
  // the engine nozzle: the rearmost ring of the airframe
  let nx = 1e9; { const q = parts.eng1.attributes.position; for (let i = 0; i < q.count; i++) if (Math.abs(q.getZ(i)) < .7 && q.getY(i) < .6) nx = Math.min(nx, q.getX(i)); /* (below the drag-chute housing, which sticks out further back) */ let y0 = 1e9, y1 = -1e9, z0 = 1e9, z1 = -1e9; for (let i = 0; i < q.count; i++) if (q.getX(i) < nx + .12 && Math.abs(q.getZ(i)) < .9 && q.getY(i) < .75) { y0 = Math.min(y0, q.getY(i)); y1 = Math.max(y1, q.getY(i)); z0 = Math.min(z0, q.getZ(i)); z1 = Math.max(z1, q.getZ(i)); } GLTF.f2nozzle = [nx + .1, (y0 + y1) / 2, (z0 + z1) / 2, clamp(Math.min(y1 - y0, z1 - z0) / 2 * .9, .3, .6), 'eng1']; }
  const gearDown = named['F-2-landingOn_6'].geo; gearDown.computeBoundingBox();
  return GLTF.f2 = { canopy: named['F-2-canopy_1'].geo, named, parts, spheres, pylons, tip: [tipX / tipN, tipY / tipN, tipZ], gearH: -gearDown.boundingBox.min.y, mats };
}
/* plan views of the F-2's parts for the damage panel: each part's own triangles, seen from above, as a small picture used as a mask.
   So the panel shows the real aircraft's shape, and each part can be coloured by the state it is in. */
function f2Masks() { return airMasks('f2'); }
function airMasks(key) {
  const F = GLTF[key] || (key === 'f2' ? f2Prepared() : typhoonPrepared()); if (F.masks) return F.masks;
  const S = 176, k = S / 17.4, cx = S / 2, cy = S / 2; // 17.4 m across the picture, nose up
  const draw = (geos, lw) => { const cv = document.createElement('canvas'); cv.width = cv.height = S; const g = cv.getContext('2d'); g.fillStyle = g.strokeStyle = '#fff'; g.lineWidth = lw; g.lineJoin = 'round';
    for (const geo of geos) { const P = geo.attributes.position, I = geo.index, n = I ? I.count : P.count, at = i => I ? I.getX(i) : i; g.beginPath();
      for (let t = 0; t < n; t += 3) { const i0 = at(t), i1 = at(t + 1), i2 = at(t + 2), x0 = cx + P.getZ(i0) * k, y0 = cy - P.getX(i0) * k, x1 = cx + P.getZ(i1) * k, y1 = cy - P.getX(i1) * k, x2 = cx + P.getZ(i2) * k, y2 = cy - P.getX(i2) * k;
        g.moveTo(x0, y0); if ((x1 - x0) * (y2 - y0) - (x2 - x0) * (y1 - y0) > 0) { g.lineTo(x1, y1); g.lineTo(x2, y2); } else { g.lineTo(x2, y2); g.lineTo(x1, y1); } g.closePath(); } // (all wound the same way, or the top and bottom skins would cancel each other out)
      g.fill(); if (lw) g.stroke(); }
    return cv.toDataURL(); };
  const m = {}; for (const [id, geo] of Object.entries(F.parts)) m[id] = draw([geo], id === 'fin' ? 1.8 : .5);
  m.cockpit = draw([F.canopy], .4);
  m.all = draw(Object.values(F.parts), 3); // the whole aircraft a little fat: a dark edge behind the parts
  for (const [id, url] of Object.entries(m)) document.documentElement.style.setProperty(`--${key}-` + id, `url(${url})`);
  return F.masks = m;
}
function modelF2(team) {
  const F = f2Prepared(), M = { root: new THREE.Group(), parts: {}, stores: [], partSpheres: F.spheres };
  // Red's aircraft wear the same camouflage darkened towards grey-brown, so the two sides can be told apart
  let skin = F.named['F-2-airframe_0'].mat; if (team === 1) { skin = F.redSkin || (F.redSkin = skin.clone()); skin.color.setRGB(.74, .6, .5); }
  const mk = (parent, geo, mat) => { const m = new THREE.Mesh(geo, mat); m.castShadow = mat !== AIR_GLASS; m.receiveShadow = true; m.userData.keep = true; parent.add(m); return m; };
  for (const [id, geo] of Object.entries(F.parts)) { const g = part(M, id); mk(g, geo, skin); }
  for (const id of ['fuel', 'cockpit']) if (!M.parts[id]) part(M, id);
  mk(M.parts.cockpit, F.named['F-2-cockpit_2'].geo, F.named['F-2-cockpit_2'].mat);
  mk(M.parts.cockpit, F.named['F-2-canopy_1'].geo, AIR_GLASS);
  // the pylons belong to the wing they hang from
  const rails = F.named['F-2-rails_8'];
  for (const sd of [-1, 1]) { const g = M.parts[sd < 0 ? 'wingLi' : 'wingRi']; if (g) { const geo = rails.geo.clone(); const pos = geo.attributes.position; for (let i = 0; i < pos.count; i++) if (Math.sign(pos.getZ(i)) !== sd) pos.setXYZ(i, 0, 0, 0); mk(g, geo, rails.mat); } }
  M.gearUp = new THREE.Group(); M.root.add(M.gearUp); mk(M.gearUp, F.named['F-2-landingOff_5'].geo, F.named['F-2-landingOff_5'].mat);
  M.gearDown = new THREE.Group(); M.root.add(M.gearDown); mk(M.gearDown, F.named['F-2-landingOn_6'].geo, F.named['F-2-landingOn_6'].mat); if (F.named['F-2-landingOnLight_7'].mat) mk(M.gearDown, F.named['F-2-landingOnLight_7'].geo, F.named['F-2-landingOnLight_7'].mat);
  // stores: AIM-9 on the wingtips, a Maverick on each inner pylon, a Mk 82 on each outer one
  const [tx, ty, tz] = F.tip;
  for (const sd of [-1, 1]) {
    store(M, 1, missileModel(3.0, .065, 0xb8b8b0), tx - .2, ty - .12, sd * (tz + .08));
    const side = F.pylons.filter(p => Math.sign(p.z) === sd);
    const inner = side[0], outer = side[side.length - 1];
    if (inner) store(M, 2, missileModel(2.5, .15, 0x8a9078, .2), inner.x, inner.y - .22, inner.z);
    if (outer && outer !== inner) store(M, 3, bombModel(2.2, .14), outer.x, outer.y - .2, outer.z);
  }
  M.nozzles = [GLTF.f2nozzle];
  return Object.assign(M, { gun: [3.4, .55, -1.0], cockpit: [4.9 * F2_FIT.s + F2_FIT.dx + .3, 1.35, 0] });
}

/* ---------------- the Eurofighter Typhoon ----------------
   Credit: "Eurofighter Typhoon - Fighter Jet - Free" (https://sketchfab.com/3d-models/eurofighter-typhoon-fighter-jet-free-992bcc8987964ca09d55410330aa8579)
   by bohmerang (https://sketchfab.com/bohmerang), licensed under CC-BY-NC-SA-4.0 (http://creativecommons.org/licenses/by-nc-sa/4.0/).
   A canard delta: instead of the F-2's tailplanes it has two canards (foreplanes) beside the cockpit, the delta wing carries the
   elevons, and there are two EJ200 engines side by side. The model comes at ten times size; it is scaled to the real 15.96 m and
   set so the centre of mass sits about a quarter of the way along the wing's mean chord. */
const TY_FIT = { s: .1, dx: -2.2, dy: 0 };
function typhoonPrepared() {
  if (GLTF.typhoon) return GLTF.typhoon;
  const g = MODEL_DATA.typhoon, list = gltfParse(g), mats = gltfMaterials(g), fit = new THREE.Matrix4().makeTranslation(TY_FIT.dx, TY_FIT.dy, 0).multiply(new THREE.Matrix4().makeScale(TY_FIT.s, TY_FIT.s, TY_FIT.s));
  const named = {}; for (const o of list) { const name = g.nodes.find(n => n.children && n.children.includes(g.nodes.indexOf(o.node))).name; named[name] = { geo: o.geo.clone().applyMatrix4(fit), mat: mats[o.mat] }; }
  const air = named['Airframe_0'].geo.toNonIndexed(), P = air.attributes.position;
  const which = (x, y, z) => { const az = Math.abs(z);
    if (x > 6.3) return 'nose';
    if (x > 4.0 && x < 6.3 && az > .85 && y > -.4) return z < 0 ? 'canL' : 'canR';
    if (y > 1.1 && x < -3.0) return 'fin';
    if (az > 1.05 && x < 3.0) return az < 3.2 ? (z < 0 ? 'wingLi' : 'wingRi') : (z < 0 ? 'wingLo' : 'wingRo');
    if (x < -5.2) return z < 0 ? 'engL' : 'engR';
    return x > .5 ? 'fuseF' : 'fuseR'; };
  const { parts, spheres } = airframeCut(air, which);
  { const c = named['Cockpit_2'].geo; c.computeBoundingSphere(); const bs = c.boundingSphere; spheres.cockpit = { p: [bs.center.x, bs.center.y, bs.center.z], r: Math.min(.9, bs.radius * .6), sph: [] }; }
  // the two nozzles: the rearmost ring of each engine
  const nozzles = ['engL', 'engR'].map(id => { const q = parts[id].attributes.position, ok = i => q.getY(i) < .42 && Math.abs(q.getZ(i)) > .12; let nx = 1e9; for (let i = 0; i < q.count; i++) if (ok(i)) nx = Math.min(nx, q.getX(i)); // (below and beside the brake-chute housing that sits between them)
    let y0 = 1e9, y1 = -1e9, z0 = 1e9, z1 = -1e9; for (let i = 0; i < q.count; i++) if (q.getX(i) < nx + .15 && ok(i)) { y0 = Math.min(y0, q.getY(i)); y1 = Math.max(y1, q.getY(i)); z0 = Math.min(z0, q.getZ(i)); z1 = Math.max(z1, q.getZ(i)); }
    return [nx + .1, (y0 + y1) / 2, (z0 + z1) / 2, clamp(Math.min(y1 - y0, z1 - z0) / 2 * .9, .3, .5), id]; });
  // where the stores hang: the underside of the skin at a given point
  const under = (x, z, r = .25) => { let m = 1e9; for (let i = 0; i < P.count; i++) if (Math.abs(P.getX(i) - x) < r && Math.abs(P.getZ(i) - z) < r && P.getY(i) < .6) m = Math.min(m, P.getY(i)); return m < 1e8 ? m : 0; };
  const R = named['WeaponRails_8'].geo, RP = R.attributes.position, groups = [];
  for (let i = 0; i < RP.count; i++) { const x = RP.getX(i), y = RP.getY(i), z = RP.getZ(i); let gr = groups.find(gq => Math.abs(gq.z / gq.n - z) < .5); if (!gr) groups.push(gr = { x: 0, y: 0, z: 0, n: 0, miny: 9 }); gr.x += x; gr.y += y; gr.z += z; gr.n++; gr.miny = Math.min(gr.miny, y); }
  const pylons = groups.filter(gq => gq.n > 20).map(gq => ({ x: gq.x / gq.n, y: gq.miny, z: gq.z / gq.n })).sort((a, b) => Math.abs(a.z) - Math.abs(b.z));
  const gearDown = named['LandingOn_6'].geo; gearDown.computeBoundingBox();
  return GLTF.typhoon = { canopy: named['Canopy_1'].geo, named, parts, spheres, pylons, nozzles, under, gearH: -gearDown.boundingBox.min.y, mats };
}
function modelTyphoon(team) {
  const F = typhoonPrepared(), M = { root: new THREE.Group(), parts: {}, stores: [], partSpheres: F.spheres, maskKey: 'typhoon' };
  const skin = F.named['Airframe_0'].mat;
  const mk = (parent, geo, mat) => { if (!mat) return null; const m = new THREE.Mesh(geo, mat); m.castShadow = mat !== AIR_GLASS; m.receiveShadow = true; m.userData.keep = true; parent.add(m); return m; };
  for (const [id, geo] of Object.entries(F.parts)) mk(part(M, id), geo, skin);
  for (const id of ['fuel', 'cockpit']) if (!M.parts[id]) part(M, id);
  mk(M.parts.cockpit, F.named['Cockpit_2'].geo, F.named['Cockpit_2'].mat);
  mk(M.parts.cockpit, F.named['Canopy_1'].geo, AIR_GLASS);
  mk(M.parts.fuseF, F.named['InstrGlass_4'].geo, AIR_GLASS);
  const rails = F.named['WeaponRails_8'];
  for (const sd of [-1, 1]) { const g = M.parts[sd < 0 ? 'wingLi' : 'wingRi']; if (g) { const geo = rails.geo.clone(); const pos = geo.attributes.position; for (let i = 0; i < pos.count; i++) if (Math.sign(pos.getZ(i)) !== sd) pos.setXYZ(i, 0, 0, 0); mk(g, geo, rails.mat); } }
  M.gearUp = new THREE.Group(); M.root.add(M.gearUp); mk(M.gearUp, F.named['LandingOff_5'].geo, F.named['LandingOff_5'].mat);
  M.gearDown = new THREE.Group(); M.root.add(M.gearDown); mk(M.gearDown, F.named['LandingOn_6'].geo, F.named['LandingOn_6'].mat); mk(M.gearDown, F.named['LandingLight_7'].geo, F.named['LandingLight_7'].mat);
  /* a Luftwaffe swing-role load: IRIS-T on the outboard wing stations, four Meteor half sunk into the fuselage underside,
     six Brimstone 3 on two triple launchers and two GBU-48 on the inboard pylons */
  const white = 0xd8dad6, grey = 0xa6aaa4;
  for (const sd of [-1, 1]) {
    const zA = sd * 4.35, xA = -3.5; store(M, 1, missileModel(2.94, .064, white, .06), xA, F.under(xA, zA, .4) - .2, zA).userData.drag = .5;
    for (const x of [2.1, -2.2]) { const z = sd * .6; store(M, 2, missileModel(3.65, .09, grey, .1), x, F.under(x, z) - .02, z).userData.drag = .3; } // (half sunk into the fuselage: little drag)
    const side = F.pylons.filter(p => Math.sign(p.z) === sd), inner = side[0], outer = side[side.length - 1];
    if (outer) { const y = outer.y - .28; for (const [dy, dz] of [[-.2, 0], [0, -.19], [0, .19]]) store(M, 3, missileModel(1.8, .09, 0x8f9488, .09), outer.x + .1, y + dy, outer.z + dz).userData.drag = .4; }
    if (inner) store(M, 4, bombModel(3.7, .18), inner.x, inner.y - .3, inner.z).userData.drag = 1.4;
  }
  // the brake chute, streamed from its housing at the base of the fin on the landing roll
  M.chute = new THREE.Group(); M.chute.visible = false; M.root.add(M.chute);
  { const cm = new THREE.MeshStandardMaterial({ color: 0xd9d4c8, roughness: .9, side: THREE.DoubleSide }), canopy = new THREE.Mesh(new THREE.SphereGeometry(2.3, 16, 8, 0, TAU, 0, Math.PI * .45), cm);
    canopy.rotation.z = Math.PI / 2; canopy.position.set(-16.5, .9, 0); M.chute.add(canopy);
    const lm = new THREE.LineBasicMaterial({ color: 0x9a968c }), pts = []; for (let k = 0; k < 8; k++) { const an = k / 8 * TAU; pts.push(new V3(-6.6, .6, 0), new V3(-16.5 + .6, .9 + Math.sin(an) * 2.1, Math.cos(an) * 2.1)); }
    M.chute.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(pts), lm)); }
  M.nozzles = F.nozzles;
  return Object.assign(M, { gun: [3.0, .05, .85], cockpit: [4.3, 1.3, 0] }); // (the BK-27 sits in the right wing root)
}
