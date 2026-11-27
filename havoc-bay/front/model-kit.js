/* Island Front: the model kit. Turns a downloaded glTF model (packed into models/<key>.js by tools/pack_model.py, so the game still
   opens from disk) into something the game can drive:
   - gltfBuild(key): the model as a tree of named parts, with its materials, skeleton and animations.
   - kitVehicle(key, cfg): a tank or other ground vehicle: hull, a turret that traverses, a gun that elevates, the muzzle.
   - kitHelicopter(key, cfg): a helicopter: damageable parts, rotors that spin, weapon stations.
   - kitSoldier(key, cfg): a rigged figure driven by the game's own walk, crouch and aim poses, or by the model's own animations.
   Which model is used for which unit, and how it is fitted, is listed in models/config.js.
   The game's rules (armour, modules, flight, damage) stay with the unit definitions; a model only changes how the unit looks. */
'use strict';
const MKIT = { cache: {}, use: {} };

/* ---------------- reading the file ---------------- */
function kitData(key) { return window.MODEL_DATA && MODEL_DATA[key]; }
function kitParse(key) { // geometry, materials and animation tracks, read once per model and shared by every copy
  if (MKIT.cache[key]) return MKIT.cache[key];
  const g = kitData(key); if (!g) return null;
  const bufs = g.buffers.map(b => b64Bytes(b.uri)), views = bufs.map(b => new DataView(b.buffer, b.byteOffset, b.byteLength));
  const N = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 }, CT = { 5120: Int8Array, 5121: Uint8Array, 5122: Int16Array, 5123: Uint16Array, 5125: Uint32Array, 5126: Float32Array };
  const RD = { 5120: 'getInt8', 5121: 'getUint8', 5122: 'getInt16', 5123: 'getUint16', 5125: 'getUint32', 5126: 'getFloat32' }, NORM = { 5120: 127, 5121: 255, 5122: 32767, 5123: 65535 };
  const acc = (i, asFloat) => { // an accessor as a typed array (normalised integers become floats when asked)
    const a = g.accessors[i], n = N[a.type], C = CT[a.componentType], bpe = C.BYTES_PER_ELEMENT, out = new (asFloat ? Float32Array : C)(a.count * n);
    if (a.bufferView === undefined) return { array: out, n, count: a.count };
    const bv = g.bufferViews[a.bufferView], dv = views[bv.buffer || 0], stride = bv.byteStride || n * bpe, off = (bv.byteOffset || 0) + (a.byteOffset || 0), rd = RD[a.componentType], k = asFloat && a.normalized ? 1 / NORM[a.componentType] : 1;
    for (let e = 0; e < a.count; e++) for (let c = 0; c < n; c++) { const v = dv[rd](off + e * stride + c * bpe, true); out[e * n + c] = k === 1 ? v : Math.max(-1, v * k); }
    return { array: out, n, count: a.count };
  };
  // materials
  const texCache = {}, tex = (ref, srgb) => { if (!ref) return null; const src = g.textures[ref.index].source, k = src + (srgb ? 's' : 'l'); return texCache[k] || (texCache[k] = gltfTexture(g.images[src].uri, srgb)); };
  const mats = (g.materials || [{}]).map(m => {
    const p = m.pbrMetallicRoughness || {}, f = p.baseColorFactor || [1, 1, 1, 1];
    const o = { color: new THREE.Color(f[0], f[1], f[2]), roughness: p.roughnessFactor ?? 1, metalness: p.metallicFactor ?? 1, side: m.doubleSided ? THREE.DoubleSide : THREE.FrontSide, envMapIntensity: 1 };
    if (p.baseColorTexture) o.map = tex(p.baseColorTexture, true);
    if (p.metallicRoughnessTexture) o.roughnessMap = o.metalnessMap = tex(p.metallicRoughnessTexture, false);
    if (m.normalTexture) { o.normalMap = tex(m.normalTexture, false); o.normalScale = new THREE.Vector2(m.normalTexture.scale ?? 1, -(m.normalTexture.scale ?? 1)); }
    if (m.emissiveTexture) o.emissiveMap = tex(m.emissiveTexture, true);
    if (m.emissiveFactor && (m.emissiveFactor[0] + m.emissiveFactor[1] + m.emissiveFactor[2] > 0)) { o.emissive = new THREE.Color(...m.emissiveFactor); o.emissiveIntensity = (m.extensions && m.extensions.KHR_materials_emissive_strength || {}).emissiveStrength || 1; }
    if (m.alphaMode === 'BLEND') { o.transparent = true; o.opacity = f[3]; o.depthWrite = false; } else if (m.alphaMode === 'MASK') o.alphaTest = m.alphaCutoff ?? .5;
    const mat = new THREE.MeshStandardMaterial(o); mat.name = m.name || ''; return mat;
  });
  // meshes: one geometry per primitive
  const meshes = (g.meshes || []).map(m => m.primitives.map(pr => {
    const geo = new THREE.BufferGeometry(), A = pr.attributes;
    geo.setAttribute('position', new THREE.BufferAttribute(acc(A.POSITION, true).array, 3));
    if (A.NORMAL !== undefined) geo.setAttribute('normal', new THREE.BufferAttribute(acc(A.NORMAL, true).array, 3));
    if (A.TEXCOORD_0 !== undefined) geo.setAttribute('uv', new THREE.BufferAttribute(acc(A.TEXCOORD_0, true).array, 2));
    if (A.COLOR_0 !== undefined) { const c = acc(A.COLOR_0, true); geo.setAttribute('color', new THREE.BufferAttribute(c.array, c.n)); }
    if (A.JOINTS_0 !== undefined) { geo.setAttribute('skinIndex', new THREE.BufferAttribute(new Uint16Array(acc(A.JOINTS_0).array), 4)); geo.setAttribute('skinWeight', new THREE.BufferAttribute(acc(A.WEIGHTS_0, true).array, 4)); }
    if (pr.indices !== undefined) { const ix = acc(pr.indices); geo.setIndex(new THREE.BufferAttribute(ix.array instanceof Uint32Array || ix.array instanceof Uint16Array ? ix.array : new Uint16Array(ix.array), 1)); }
    if (A.NORMAL === undefined) geo.computeVertexNormals();
    geo.computeBoundingSphere(); geo.computeBoundingBox();
    return { geo, mat: pr.material ?? 0, skinned: A.JOINTS_0 !== undefined, vcol: A.COLOR_0 !== undefined };
  }));
  // skins and animations (kept as plain data; each copy of the model gets its own bones and its own player)
  const skins = (g.skins || []).map(s => ({ joints: s.joints, inv: s.inverseBindMatrices !== undefined ? acc(s.inverseBindMatrices, true).array : null }));
  const nodeName = i => 'n' + i + '_' + THREE.PropertyBinding.sanitizeNodeName(g.nodes[i].name || '');
  const clips = (g.animations || []).map((an, ai) => {
    const tracks = [];
    for (const ch of an.channels) {
      const sm = an.samplers[ch.sampler], tn = ch.target.node; if (tn === undefined) continue;
      const times = acc(sm.input, true).array, out = acc(sm.output, true), path = ch.target.path, step = sm.interpolation === 'STEP';
      let vals = out.array; const w = path === 'rotation' ? 4 : path === 'weights' ? 1 : 3;
      if (sm.interpolation === 'CUBICSPLINE') { const v2 = new Float32Array(times.length * w); for (let k = 0; k < times.length; k++) for (let c = 0; c < w; c++) v2[k * w + c] = vals[k * w * 3 + w + c]; vals = v2; } // (keep the key values, drop the tangents)
      const nm = nodeName(tn);
      if (path === 'rotation') tracks.push(new THREE.QuaternionKeyframeTrack(nm + '.quaternion', times, vals, step ? THREE.InterpolateDiscrete : THREE.InterpolateLinear));
      else if (path === 'translation') tracks.push(new THREE.VectorKeyframeTrack(nm + '.position', times, vals, step ? THREE.InterpolateDiscrete : THREE.InterpolateLinear));
      else if (path === 'scale') tracks.push(new THREE.VectorKeyframeTrack(nm + '.scale', times, vals, step ? THREE.InterpolateDiscrete : THREE.InterpolateLinear));
    }
    return new THREE.AnimationClip(an.name || 'clip' + ai, -1, tracks);
  });
  const joints = new Set(); for (const s of skins) for (const j of s.joints) joints.add(j);
  return MKIT.cache[key] = { g, mats, meshes, skins, clips, joints, nodeName };
}
/* A fresh copy of the model: { root, nodes[], named(regex), meshes[], clips, mixer() }. Geometry and materials are shared between copies. */
function gltfBuild(key, opts = {}) {
  const P = kitParse(key); if (!P) return null;
  const g = P.g, nodes = [], meshes = [], pending = [];
  const make = i => {
    const nd = g.nodes[i], o = P.joints.has(i) ? new THREE.Bone() : new THREE.Group(); o.name = P.nodeName(i); o.userData.name = nd.name || ''; nodes[i] = o;
    if (nd.matrix) { new THREE.Matrix4().fromArray(nd.matrix).decompose(o.position, o.quaternion, o.scale); }
    else { if (nd.translation) o.position.fromArray(nd.translation); if (nd.rotation) o.quaternion.fromArray(nd.rotation); if (nd.scale) o.scale.fromArray(nd.scale); }
    if (nd.mesh !== undefined) for (const pr of P.meshes[nd.mesh]) {
      let mat = P.mats[pr.mat]; if (opts.material) mat = opts.material(mat, nd.name || '') || mat;
      if (pr.skinned && nd.skin !== undefined) { if (!mat.skinning) { mat = mat.userData.skinned || (mat.userData.skinned = Object.assign(mat.clone(), { skinning: true })); } }
      if (pr.vcol && !mat.vertexColors) mat = mat.userData.vcol || (mat.userData.vcol = Object.assign(mat.clone(), { vertexColors: true }));
      const m = pr.skinned && nd.skin !== undefined ? new THREE.SkinnedMesh(pr.geo, mat) : new THREE.Mesh(pr.geo, mat);
      m.castShadow = !mat.transparent; m.receiveShadow = true; m.userData.name = nd.name || ''; m.userData.keep = true; o.add(m); meshes.push(m);
      if (m.isSkinnedMesh) { m.frustumCulled = false; pending.push([m, nd.skin]); }
    }
    for (const c of nd.children || []) o.add(make(c));
    return o;
  };
  const root = new THREE.Group(); for (const r of g.scenes[g.scene || 0].nodes) root.add(make(r));
  root.updateMatrixWorld(true);
  for (const [m, si] of pending) { const s = P.skins[si], bones = s.joints.map(j => nodes[j]), inv = s.joints.map((j, k) => s.inv ? new THREE.Matrix4().fromArray(s.inv, k * 16) : new THREE.Matrix4()); m.bind(new THREE.Skeleton(bones, inv), m.matrixWorld); }
  const named = re => nodes.filter(n => n && re.test(n.userData.name));
  let mixer = null;
  return { key, root, nodes, meshes, named, clips: P.clips, mixer: () => mixer || (mixer = new THREE.AnimationMixer(root)) };
}

/* ---------------- fitting a model to the game's frame: x forward, y up, z right, standing on y = 0 ---------------- */
function kitBox(obj) { obj.updateMatrixWorld(true); return new THREE.Box3().setFromObject(obj); }
/* cfg.fit: { yaw (turn about the vertical, radians), scale (number) or length / height (metres to scale to), offset [x, y, z], ground (false: leave y alone) } */
function kitFit(model, cfg = {}) {
  const f = cfg.fit || {}, holder = new THREE.Group(), fitted = new THREE.Group(); fitted.add(model.root); holder.add(fitted);
  if (f.pitch) model.root.rotation.x = f.pitch; // (a model made z-up needs -90 degrees here)
  fitted.rotation.y = f.yaw || 0;
  let b = kitBox(holder), sz = b.getSize(new V3());
  const s = f.scale ?? (f.length ? f.length / Math.max(sz.x, 1e-6) : f.height ? f.height / Math.max(sz.y, 1e-6) : 1);
  fitted.scale.setScalar(s); b = kitBox(holder); const c = b.getCenter(new V3());
  fitted.position.set(-c.x + (f.offset ? f.offset[0] : 0), (f.ground === false ? 0 : -b.min.y) + (f.offset ? f.offset[1] : 0), -c.z + (f.offset ? f.offset[2] : 0));
  holder.updateMatrixWorld(true); return holder;
}
/* Cut one mesh into named pieces by where each triangle sits (in the fitted frame): which(x, y, z) -> a part name.
   Used when a model's hull, turret and gun (or an aircraft's wings and tail) are one piece of geometry. */
function kitSplit(mesh, which) {
  mesh.updateMatrixWorld(true); const geo = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry, P = geo.attributes.position, Nn = geo.attributes.normal, U = geo.attributes.uv;
  const nm = new THREE.Matrix3().getNormalMatrix(mesh.matrixWorld), v = new V3(), out = {}, q = [new V3(), new V3(), new V3()];
  for (let t = 0; t < P.count; t += 3) {
    for (let k = 0; k < 3; k++) q[k].fromBufferAttribute(P, t + k).applyMatrix4(mesh.matrixWorld);
    const id = which((q[0].x + q[1].x + q[2].x) / 3, (q[0].y + q[1].y + q[2].y) / 3, (q[0].z + q[1].z + q[2].z) / 3), b = out[id] || (out[id] = { p: [], n: [], u: [] });
    for (let k = 0; k < 3; k++) { b.p.push(q[k].x, q[k].y, q[k].z); if (Nn) { v.fromBufferAttribute(Nn, t + k).applyMatrix3(nm).normalize(); b.n.push(v.x, v.y, v.z); } if (U) b.u.push(U.getX(t + k), U.getY(t + k)); }
  }
  const parts = {};
  for (const [id, b] of Object.entries(out)) { const gq = new THREE.BufferGeometry(); gq.setAttribute('position', new THREE.Float32BufferAttribute(b.p, 3)); if (b.n.length) gq.setAttribute('normal', new THREE.Float32BufferAttribute(b.n, 3)); else gq.computeVertexNormals(); if (b.u.length) gq.setAttribute('uv', new THREE.Float32BufferAttribute(b.u, 2)); gq.computeBoundingBox(); gq.computeBoundingSphere();
    const m = new THREE.Mesh(gq, mesh.material); m.castShadow = mesh.castShadow; m.receiveShadow = true; m.userData.keep = true; parts[id] = m; }
  return parts; // meshes in the fitted (world) frame; the original mesh is left for the caller to remove
}
function kitFind(model, re) { return re ? model.named(re) : []; }
function kitTint(mat, rgb) { if (!rgb) return mat; const k = 'tint' + rgb.join(); return mat.userData[k] || (mat.userData[k] = Object.assign(mat.clone(), { color: mat.color.clone().multiply(new THREE.Color(rgb[0], rgb[1], rgb[2])) })); }

/* ---------------- a ground vehicle ----------------
   cfg: { fit, turret: /name/ (nodes that turn with the turret), gun: /name/ (nodes that elevate with the gun), or split(x, y, z) -> 'hull' | 'turret' | 'gun'
          for a one-piece model; ring [x, y, z] (centre of the turret ring) and trunnion [x, y, z] (where the gun pivots), both optional: found from the parts
          if left out; muzzle (metres from the trunnion to the muzzle, optional); wheels: /name/ (nodes spun with speed); tint: [[r, g, b], [r, g, b]] per team }
   Returns what the game expects of a vehicle model: { root, hull, turret, gun, muzzle }. The tracks and wheels are the model's own, so the game's
   built-in running gear is switched off for it. */
function kitVehicle(key, cfg = {}, team = 0) {
  const tint = cfg.tint && cfg.tint[team], model = gltfBuild(key, tint ? { material: m => kitTint(m, tint) } : {}); if (!model) return null;
  const holder = kitFit(model, cfg), root = new THREE.Group(), hull = new THREE.Group(), turret = new THREE.Group(), gun = new THREE.Group();
  root.add(hull); hull.add(holder); holder.updateMatrixWorld(true);
  let tParts = [], gParts = [];
  if (cfg.split) { // one-piece model: cut it up
    for (const m of model.meshes.slice()) { const parts = kitSplit(m, cfg.split); m.parent.remove(m); for (const [id, pm] of Object.entries(parts)) { (id === 'turret' ? tParts : id === 'gun' ? gParts : null || { push: x => hull.add(x) }).push(pm); } }
  } else { gParts = kitFind(model, cfg.gun); tParts = kitFind(model, cfg.turret).filter(n => !gParts.includes(n)); }
  const boxOf = list => { const b = new THREE.Box3(); for (const o of list) { o.updateMatrixWorld(true); b.expandByObject(o); } return b; };
  const scratch = new THREE.Group(); root.add(scratch); if (cfg.split) for (const o of [...tParts, ...gParts]) scratch.add(o); root.updateMatrixWorld(true);
  const tb = tParts.length ? boxOf(tParts) : null, gb = gParts.length ? boxOf(gParts) : null;
  const ring = cfg.ring || (tb ? [(tb.min.x + tb.max.x) / 2, tb.min.y, (tb.min.z + tb.max.z) / 2] : gb ? [gb.min.x - .5, gb.min.y - .3, 0] : [0, 1.5, 0]);
  const trun = cfg.trunnion || (gb ? [gb.min.x + (tb ? Math.min(.4, (gb.max.x - gb.min.x) * .08) : 0), (gb.min.y + gb.max.y) / 2, (gb.min.z + gb.max.z) / 2] : [ring[0] + 1, ring[1] + .4, 0]);
  turret.position.set(ring[0], ring[1], ring[2]); root.add(turret); gun.position.set(trun[0] - ring[0], trun[1] - ring[1], trun[2] - ring[2]); turret.add(gun); root.updateMatrixWorld(true);
  for (const o of tParts) turret.attach(o); for (const o of gParts) gun.attach(o); root.remove(scratch); // (attach keeps each piece where it is while handing it to its new parent)
  const wheels = kitFind(model, cfg.wheels);
  return { root, hull, turret, gun, muzzle: cfg.muzzle ?? (gb ? gb.max.x - trun[0] : 3), gltf: true, noGear: true, spin: wheels, model };
}
/* ---------------- a helicopter ----------------
   cfg: { fit, rotor: /name/ (main rotor nodes), tailRotor: /name/, rotor2: /name/ (the lower rotor of a coaxial), parts(x, y, z) -> a damage part id
          ('cockpit', 'gunner', 'nose', 'fuse', 'fuel', 'engL', 'engR', 'trans', 'boom', 'trot', 'fin', 'stubL', 'stubR') for the body's triangles,
          stations: { 1: [[x, y, z], ...], 2: [...], 3: [...] } (where pods and missiles hang: weapon slot -> points), gun [x, y, z], cockpit [x, y, z], tint }
   Returns what the game expects of an aircraft model: { root, parts, stores, rotor, rotor2, trotor, gun, cockpit }. */
function kitHelicopter(key, cfg = {}, team = 0, def = null) {
  const tint = cfg.tint && cfg.tint[team], model = gltfBuild(key, tint ? { material: m => kitTint(m, tint) } : {}); if (!model) return null;
  const holder = kitFit(model, cfg), M = { root: new THREE.Group(), parts: {}, stores: [], gltf: true, model }; M.root.add(holder); M.root.updateMatrixWorld(true);
  const spinner = (nodes, axis) => { // a hub group at the middle of the rotor, with the blades handed to it, plus the blur disc the game fades in with rotor speed
    if (!nodes.length) return null; const b = new THREE.Box3(); for (const o of nodes) b.expandByObject(o); const c = b.getCenter(new V3()), sz = b.getSize(new V3());
    const hub = new THREE.Group(); hub.position.copy(c); M.root.add(hub); const blades = new THREE.Group(); hub.add(blades); M.root.updateMatrixWorld(true); for (const o of nodes) blades.attach(o);
    const r = axis === 'y' ? Math.max(sz.x, sz.z) / 2 : Math.max(sz.x, sz.y) / 2, disc = new THREE.Mesh(new THREE.CircleGeometry(r, 40), AIR_DISC.clone()); if (axis === 'y') disc.rotation.x = -Math.PI / 2; disc.castShadow = false; hub.add(disc);
    if (axis !== 'y') { const tilt = new THREE.Group(); tilt.rotation.x = Math.PI / 2; hub.add(tilt); hub.remove(blades); tilt.attach(blades); return { hub, blades: tilt, disc, r }; } // (the game spins rotors about their local y, so a tail rotor's hub is turned on its side)
    return { hub, blades, disc, r };
  };
  const main = kitFind(model, cfg.rotor), low = kitFind(model, cfg.rotor2), tail = kitFind(model, cfg.tailRotor);
  M.rotor = spinner(main, 'y'); if (low.length) M.rotor2 = spinner(low, 'y'); if (tail.length) M.trotor = spinner(tail, 'z');
  // the body: cut into damage parts so that hits can knock them off and the game can hide them
  if (cfg.parts) {
    const used = new Set(); for (const r of [M.rotor, M.rotor2, M.trotor]) if (r) r.hub.traverse(o => used.add(o));
    for (const m of model.meshes.slice()) { if (used.has(m) || m.material.transparent) continue; const cut = kitSplit(m, cfg.parts); m.parent.remove(m);
      for (const [id, pm] of Object.entries(cut)) { const gp = M.parts[id] || (M.parts[id] = new THREE.Group(), M.root.add(M.parts[id]), M.parts[id]); gp.add(pm); } }
    // hit spheres fitted to each part's real shape
    M.partSpheres = {}; for (const [id, gp] of Object.entries(M.parts)) { const b = new THREE.Box3().setFromObject(gp), c = b.getCenter(new V3()), sz = b.getSize(new V3()); M.partSpheres[id] = { p: [c.x, c.y, c.z], r: Math.max(.3, Math.min(sz.x, sz.y, sz.z) * .5 + Math.max(sz.x, sz.y, sz.z) * .15), sph: [] }; }
  }
  if (def) for (const p of def.parts) if (!M.parts[p.id]) { M.parts[p.id] = new THREE.Group(); M.root.add(M.parts[p.id]); }
  for (const [slot, pts] of Object.entries(cfg.stations || {})) { const W = def && def.weapons[slot], A = W && AMMO[W.k]; for (const pt of pts) { const st = !A ? new THREE.Group() : A.look === 'rocket' ? podModel(1.6, .2) : missileModel(1.6, .08, 0x4a5038, .1); store(M, +slot, st, pt[0], pt[1], pt[2]); } }
  const bb = kitBox(holder); M.gun = cfg.gun || [bb.max.x * .6, bb.min.y + .4, 0]; M.cockpit = cfg.cockpit || [bb.max.x * .45, (bb.min.y + bb.max.y) / 2 + .3, 0];
  return M;
}
/* ---------------- a soldier ----------------
   cfg: { fit: { height: 1.8, yaw }, bones: { hips, spine, head, thighL, thighR, shinL, shinR, armL, armR, foreL, foreR, handR } (regexes; common rigs are recognised
          without any), clips: { idle, walk, run, crouch } (regexes for the model's own animations, if it has them and you want them used), tint, rifle (false: the
          model carries its own) }
   The game poses its soldiers by turning a few joints (thigh, shin, torso, arms) about the sideways axis. A rigged model's bones point every which way, so each
   mapped bone remembers which of its own axes is "sideways" in the rest pose, and the game's angles are applied about that. */
const KIT_BONES = {
  hips: /^(mixamorig:?)?hips$|pelvis|^root$|hip$/i, spine: /spine_?0?1$|^(mixamorig:?)?spine1?$|chest|torso/i, head: /^(mixamorig:?)?head$|head$/i,
  thighL: /left_?up_?leg|thigh[._]?l$|l_?thigh|upperleg[._]?l|leftthigh/i, thighR: /right_?up_?leg|thigh[._]?r$|r_?thigh|upperleg[._]?r|rightthigh/i,
  shinL: /left_?leg$|calf[._]?l$|shin[._]?l$|l_?calf|lowerleg[._]?l|leftshin|leftcalf/i, shinR: /right_?leg$|calf[._]?r$|shin[._]?r$|r_?calf|lowerleg[._]?r|rightshin|rightcalf/i,
  armL: /left_?arm$|upper_?arm[._]?l$|l_?upperarm|leftupperarm/i, armR: /right_?arm$|upper_?arm[._]?r$|r_?upperarm|rightupperarm/i,
  foreL: /left_?fore_?arm|lower_?arm[._]?l$|forearm[._]?l$|l_?forearm/i, foreR: /right_?fore_?arm|lower_?arm[._]?r$|forearm[._]?r$|r_?forearm/i, handR: /right_?hand$|hand[._]?r$|r_?hand$/i,
};
function kitSoldier(key, cfg = {}, team = 0) {
  const tint = cfg.tint && cfg.tint[team], model = gltfBuild(key, tint ? { material: m => kitTint(m, tint) } : {}); if (!model) return null;
  const holder = kitFit(model, Object.assign({}, cfg, { fit: Object.assign({ height: 1.8 }, cfg.fit || {}) })), root = new THREE.Group(); root.add(holder); root.updateMatrixWorld(true);
  const rig = {}, side = new V3(0, 0, 1), up = new V3(0, 1, 0), q = new THREE.Quaternion();
  for (const [id, re0] of Object.entries(KIT_BONES)) { const re = (cfg.bones && cfg.bones[id]) || re0, b = model.nodes.find(n => n && n.isBone && re.test(n.userData.name)) || model.nodes.find(n => n && re.test(n.userData.name)); if (!b) continue;
    b.getWorldQuaternion(q); const inv = q.clone().invert(), kid = b.children.find(c => c.isBone) || b.children[0];
    rig[id] = { bone: b, rest: b.quaternion.clone(), restPos: b.position.clone(), side: side.clone().applyQuaternion(inv).normalize(), up: up.clone().applyQuaternion(inv).normalize(), along: kid && kid.position.lengthSq() > 1e-10 ? kid.position.clone().normalize() : null }; } // (along: the way the bone runs, towards its child, in its own frame)
  // stand-ins for the joints the game turns; kitPoseSoldier copies their angles onto the bones each frame
  const J = () => ({ rotation: new THREE.Euler(), position: new V3() }), m = { root, hips: J(), torso: J(), head: J(), arms: J(), legs: [{ thigh: J(), shin: J() }, { thigh: J(), shin: J() }], rig, gltf: true, real: false, model, holder };
  m.hips.position.y = .95; m.rifle = m.arms;
  // the model's own animations, if wanted
  if (cfg.clips && model.clips.length) { const mx = model.mixer(), find = re => re && model.clips.find(c => re.test(c.name)); m.anim = { mixer: mx, act: {}, cur: null };
    for (const st of ['idle', 'walk', 'run', 'crouch']) { const c = find(cfg.clips[st]); if (c) { m.anim.act[st] = mx.clipAction(c); } } }
  // which way the knees and elbows fold, checked once against the rest pose: a bent knee must bring the foot backwards and up
  m.holderScale = holder.children[0].scale.x;
  return m;
}
const _kq = new THREE.Quaternion(), _kq2 = new THREE.Quaternion(), _kd = new V3();
/* Point a bone along a direction given in the figure's own frame (x forward, y up, z right), whatever pose the rig was built in:
   find where that direction lies in the bone's rest frame and turn the bone's length onto it. Parents must be posed first. */
function kitPoint(r, root, dx, dy, dz) {
  if (!r || !r.along) return; const b = r.bone;
  b.parent.updateWorldMatrix(true, false); b.parent.getWorldQuaternion(_kq).multiply(r.rest); root.getWorldQuaternion(_kq2);
  _kd.set(dx, dy, dz).normalize().applyQuaternion(_kq2).applyQuaternion(_kq.invert()); // the wanted direction, seen from the bone at rest
  b.quaternion.copy(r.rest).multiply(_kq.setFromUnitVectors(r.along, _kd));
}
function kitTurn(r, angle, about = 'side') { if (!r) return; _kq.setFromAxisAngle(r[about], angle); r.bone.quaternion.copy(r.rest).multiply(_kq); }
function kitPoseSoldier(s, m, dt) { // called after the game has set its joint angles: copy them onto the skeleton
  const R = m.rig, A = m.anim, sp = Math.hypot(s.vel.x, s.vel.z);
  if (A && s.alive) { // the model's own walk and run cycles drive the legs
    const want = s.crouch && A.act.crouch ? 'crouch' : sp > 4.2 && A.act.run ? 'run' : sp > .4 && A.act.walk ? 'walk' : 'idle', act = A.act[want] || A.act.idle || A.act.walk;
    if (act && A.cur !== act) { act.reset().play(); if (A.cur) A.cur.crossFadeTo(act, .25, false); A.cur = act; }
    if (A.cur) A.cur.timeScale = want === 'walk' ? clamp(sp / 1.6, .5, 2) : want === 'run' ? clamp(sp / 5, .7, 1.6) : 1;
    A.mixer.update(dt || 0);
    if (R.spine) { _kq.setFromAxisAngle(R.spine.side, clamp(s.pitch, -.9, .9) * .5); R.spine.bone.quaternion.multiply(_kq); } // lean the upper body into the aim on top of the animation
    return;
  }
  // The game's angles are about its own sideways axis (z), positive swinging the limb forward.
  for (let k = 0; k < 2; k++) { kitTurn(k ? R.thighR : R.thighL, m.legs[k].thigh.rotation.z); kitTurn(k ? R.shinR : R.shinL, m.legs[k].shin.rotation.z); }
  if (R.hips) { R.hips.bone.position.copy(R.hips.restPos); R.hips.bone.position.addScaledVector(R.hips.up, (m.hips.position.y - .95) / (m.holderScale || 1)); }
  kitTurn(R.spine, m.torso.rotation.z);
  // arms: a rifle held at the shoulder, the whole hold tilted up or down with the aim. Right hand back at the grip, left hand forward on the handguard.
  const aim = m.arms.rotation.z, ca = Math.cos(aim), sa = Math.sin(aim), P = (r, x, y, z) => kitPoint(r, m.root, x * ca - y * sa, x * sa + y * ca, z);
  P(R.armR, .35, -.85, .12); P(R.foreR, .78, .3, -.5); P(R.armL, .8, -.5, -.05); P(R.foreL, .8, .22, .5);
  if (R.head) kitTurn(R.head, aim * .4);
}

/* ---------------- registering models for units ---------------- */
/* kitUse('m1a2', 'abrams', { ...vehicle cfg }) : every M1A2 is drawn with models/abrams.js from then on (if that file is loaded; otherwise nothing changes). */
function kitUse(unit, key, cfg = {}) {
  MKIT.use[unit] = { key, cfg };
  if (typeof VMODEL !== 'undefined' && VMODEL[unit]) { const old = VMODEL[unit]; VMODEL[unit] = team => (kitData(key) && kitVehicle(key, cfg, team)) || old(team); }
  else if (typeof AIR !== 'undefined' && AIR[unit] && AIR[unit].cls === 'heli') { const old = AIR[unit].model; AIR[unit].model = team => (kitData(key) && kitHelicopter(key, cfg, team, AIR[unit])) || old(team); }
  else if (unit === 'soldier' || unit === 'soldier0' || unit === 'soldier1') MKIT.soldier = MKIT.soldier || {}, (unit === 'soldier' ? [0, 1] : [+unit.slice(-1)]).forEach(t => MKIT.soldier[t] = { key, cfg });
}
function kitSoldierFor(team, npc) { const u = MKIT.soldier && MKIT.soldier[team]; return u && !npc && kitData(u.key) ? kitSoldier(u.key, u.cfg, team) : null; }
