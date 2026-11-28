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
  const req = g.extensionsRequired || []; // geometry packed in ways this reader does not unpack: say so and leave the built-in model in place
  if (req.some(e => /draco|meshopt/i.test(e))) { if (!MKIT.warned) MKIT.warned = {}; if (!MKIT.warned[key]) { MKIT.warned[key] = 1; console.warn(`Model "${key}" is compressed (${req.join(', ')}). Re-export it as plain glTF (see docs/models.md); the built-in model is used meanwhile.`); } return null; }
  const bufs = g.buffers.map(b => b64Bytes(b.uri)), views = bufs.map(b => new DataView(b.buffer, b.byteOffset, b.byteLength));
  const N = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 }, CT = { 5120: Int8Array, 5121: Uint8Array, 5122: Int16Array, 5123: Uint16Array, 5125: Uint32Array, 5126: Float32Array };
  const RD = { 5120: 'getInt8', 5121: 'getUint8', 5122: 'getInt16', 5123: 'getUint16', 5125: 'getUint32', 5126: 'getFloat32' }, NORM = { 5120: 127, 5121: 255, 5122: 32767, 5123: 65535 };
  const acc = (i, asFloat) => { // an accessor as a typed array (normalised integers become floats when asked)
    const a = g.accessors[i], n = N[a.type], C = CT[a.componentType], bpe = C.BYTES_PER_ELEMENT, out = new (asFloat ? Float32Array : C)(a.count * n);
    const rd = RD[a.componentType], k = asFloat && a.normalized ? 1 / NORM[a.componentType] : 1, put = (ix, v) => { out[ix] = k === 1 ? v : Math.max(-1, v * k); };
    if (a.bufferView !== undefined) { const bv = g.bufferViews[a.bufferView], dv = views[bv.buffer || 0], stride = bv.byteStride || n * bpe, off = (bv.byteOffset || 0) + (a.byteOffset || 0);
      for (let e = 0; e < a.count; e++) for (let c = 0; c < n; c++) put(e * n + c, dv[rd](off + e * stride + c * bpe, true)); }
    if (a.sparse) { const sp = a.sparse, ibv = g.bufferViews[sp.indices.bufferView], vbv = g.bufferViews[sp.values.bufferView], idv = views[ibv.buffer || 0], vdv = views[vbv.buffer || 0]; // a few values replaced on top of the base data
      const io = (ibv.byteOffset || 0) + (sp.indices.byteOffset || 0), vo = (vbv.byteOffset || 0) + (sp.values.byteOffset || 0), ird = RD[sp.indices.componentType], ib = CT[sp.indices.componentType].BYTES_PER_ELEMENT;
      for (let e = 0; e < sp.count; e++) { const ix = idv[ird](io + e * ib, true); for (let c = 0; c < n; c++) put(ix * n + c, vdv[rd](vo + (e * n + c) * bpe, true)); } }
    return { array: out, n, count: a.count };
  };
  // materials
  const texCache = {}, tex = (ref, srgb) => { if (!ref || !g.textures || !g.textures[ref.index]) return null;
    const T = g.textures[ref.index], ex = T.extensions || {}, src = T.source ?? (ex.EXT_texture_webp || ex.EXT_texture_avif || ex.KHR_texture_basisu || {}).source, im = g.images && g.images[src]; if (!im || !im.uri) return null;
    const tr = ref.extensions && ref.extensions.KHR_texture_transform, k = src + (srgb ? 's' : 'l') + (tr ? JSON.stringify(tr) : ''); if (texCache[k]) return texCache[k];
    const t = gltfTexture(im.uri, srgb), sm = g.samplers && g.samplers[T.sampler]; if (sm) { const W = { 33071: THREE.ClampToEdgeWrapping, 33648: THREE.MirroredRepeatWrapping, 10497: THREE.RepeatWrapping }; t.wrapS = W[sm.wrapS] || THREE.RepeatWrapping; t.wrapT = W[sm.wrapT] || THREE.RepeatWrapping; }
    if (tr) { if (tr.offset) t.offset.fromArray(tr.offset); if (tr.scale) t.repeat.fromArray(tr.scale); if (tr.rotation) t.rotation = tr.rotation; } // (three applies the base colour map's transform to the other maps too)
    return texCache[k] = t; };
  const mats = (g.materials || [{}]).map(m => {
    const p = m.pbrMetallicRoughness || {}, f = p.baseColorFactor || [1, 1, 1, 1];
    const o = { color: new THREE.Color(f[0], f[1], f[2]), roughness: p.roughnessFactor ?? 1, metalness: p.metallicFactor ?? 1, side: m.doubleSided ? THREE.DoubleSide : THREE.FrontSide, envMapIntensity: 1 };
    if (p.baseColorTexture) o.map = tex(p.baseColorTexture, true);
    const sg = m.extensions && m.extensions.KHR_materials_pbrSpecularGlossiness; // the older specular-glossiness materials: keep the colour and texture, treat the surface as non-metal
    if (sg) { const d = sg.diffuseFactor || [1, 1, 1, 1]; o.color.setRGB(d[0], d[1], d[2]); f[3] = d[3]; if (sg.diffuseTexture) o.map = tex(sg.diffuseTexture, true); o.metalness = 0; o.roughness = sg.specularGlossinessTexture ? .6 : clamp(1 - (sg.glossinessFactor ?? 1), .15, 1); }
    if (p.metallicRoughnessTexture) o.roughnessMap = o.metalnessMap = tex(p.metallicRoughnessTexture, false);
    if (m.normalTexture) { o.normalMap = tex(m.normalTexture, false); o.normalScale = new THREE.Vector2(m.normalTexture.scale ?? 1, -(m.normalTexture.scale ?? 1)); }
    if (m.emissiveTexture) o.emissiveMap = tex(m.emissiveTexture, true);
    if (m.emissiveFactor && (m.emissiveFactor[0] + m.emissiveFactor[1] + m.emissiveFactor[2] > 0)) { o.emissive = new THREE.Color(...m.emissiveFactor); o.emissiveIntensity = (m.extensions && m.extensions.KHR_materials_emissive_strength || {}).emissiveStrength || 1; }
    if (m.alphaMode === 'BLEND') { o.transparent = true; o.opacity = f[3]; o.depthWrite = false; } else if (m.alphaMode === 'MASK') o.alphaTest = m.alphaCutoff ?? .5;
    const mat = new THREE.MeshStandardMaterial(o); mat.name = m.name || ''; return mat;
  });
  // meshes: one geometry per primitive
  const meshes = (g.meshes || []).map(m => m.primitives.filter(pr => (pr.mode ?? 4) === 4 && pr.attributes && pr.attributes.POSITION !== undefined).map(pr => { // (triangles only: loose lines and points are left out)
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
      if (pr.skinned && nd.skin !== undefined && !mat.skinning) mat = kitVariant(mat, 'skinned', m => Object.assign(m.clone(), { skinning: true }));
      if (pr.vcol && !mat.vertexColors) mat = kitVariant(mat, 'vcol', m => Object.assign(m.clone(), { vertexColors: true }));
      const m = pr.skinned && nd.skin !== undefined ? new THREE.SkinnedMesh(pr.geo, mat) : new THREE.Mesh(pr.geo, mat);
      m.castShadow = !mat.transparent; m.receiveShadow = true; m.userData.name = nd.name || ''; m.userData.keep = true; o.add(m); meshes.push(m);
      if (m.isSkinnedMesh) { m.frustumCulled = false; pending.push([m, nd.skin]); }
    }
    for (const c of nd.children || []) o.add(make(c));
    return o;
  };
  const root = new THREE.Group(); for (const r of g.scenes[g.scene || 0].nodes) root.add(make(r));
  root.updateMatrixWorld(true);
  for (const [m, si] of pending) { const s = P.skins[si], bones = s.joints.map(j => nodes[j]), inv = s.joints.map((j, k) => s.inv ? new THREE.Matrix4().fromArray(s.inv, k * 16) : new THREE.Matrix4()); m.bind(new THREE.Skeleton(bones, inv), new THREE.Matrix4()); } // (glTF: a skinned mesh's own node transform plays no part; its vertices are placed by the joints alone)
  const named = re => nodes.filter(n => n && re.test(n.userData.name));
  let mixer = null;
  return { key, root, nodes, meshes, named, clips: P.clips, mixer: () => mixer || (mixer = new THREE.AnimationMixer(root)) };
}

/* ---------------- fitting a model to the game's frame: x forward, y up, z right, standing on y = 0 ---------------- */
function kitBox(obj) { // the box round an object as drawn: a skinned mesh is measured where its skeleton puts it, not where its raw vertices lie
  obj.updateMatrixWorld(true); const b = new THREE.Box3(), v = new V3(), t = new V3(), sum = new V3(), bb = new THREE.Box3();
  obj.traverse(o => { if (!o.isMesh) return; const pos = o.geometry.attributes.position; if (!pos) return;
    if (!o.isSkinnedMesh || !o.skeleton) { if (!o.geometry.boundingBox) o.geometry.computeBoundingBox(); b.union(bb.copy(o.geometry.boundingBox).applyMatrix4(o.matrixWorld)); return; }
    const sk = o.skeleton, si = o.geometry.attributes.skinIndex.array, sw = o.geometry.attributes.skinWeight.array, mats = sk.bones.map((bn, i) => new THREE.Matrix4().multiplyMatrices(bn.matrixWorld, sk.boneInverses[i]));
    for (let i = 0, step = Math.max(1, Math.floor(pos.count / 6000)); i < pos.count; i += step) { v.fromBufferAttribute(pos, i).applyMatrix4(o.bindMatrix); sum.set(0, 0, 0); let w = 0;
      for (let k = 0; k < 4; k++) { const wk = sw[i * 4 + k]; if (wk > 0 && mats[si[i * 4 + k]]) { sum.addScaledVector(t.copy(v).applyMatrix4(mats[si[i * 4 + k]]), wk); w += wk; } }
      if (w > 0) b.expandByPoint(sum.multiplyScalar(1 / w)); } });
  return b;
}
/* cfg.fit: { yaw (turn about the vertical, radians), scale (number) or length / height (metres to scale to), offset [x, y, z], ground (false: leave y alone) } */
function kitFit(model, cfg = {}) {
  const f = cfg.fit || {}, holder = new THREE.Group(), fitted = new THREE.Group(); fitted.add(model.root); holder.add(fitted);
  if (f.pitch) model.root.rotation.x = f.pitch; // (a model made z-up needs -90 degrees here)
  fitted.rotation.y = f.yaw || 0;
  let b = kitBox(holder), sz = b.getSize(new V3());
  if (f.yaw === undefined && cfg.autoYaw && sz.z > sz.x * 1.12) { fitted.rotation.y = Math.PI / 2; b = kitBox(holder); sz = b.getSize(new V3()); } // no facing given: a vehicle's length runs fore and aft (glTF's own forward is +z)
  holder.userData.yaw = fitted.rotation.y;
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
/* variants of a material (skinned, vertex-coloured, tinted), made once each. Kept beside the material, not in its userData: clone() copies userData through JSON. */
const KIT_VARIANTS = new WeakMap();
function kitVariant(mat, key, make) { let v = KIT_VARIANTS.get(mat); if (!v) KIT_VARIANTS.set(mat, v = {}); return v[key] || (v[key] = make(mat)); }
function kitTint(mat, rgb) { return rgb ? kitVariant(mat, 'tint' + rgb.join(), m => Object.assign(m.clone(), { color: m.color.clone().multiply(new THREE.Color(rgb[0], rgb[1], rgb[2])) })) : mat; }

/* ---------------- a ground vehicle ----------------
   cfg: { fit, turret: /name/ (nodes that turn with the turret), gun: /name/ (nodes that elevate with the gun), or split(x, y, z) -> 'hull' | 'turret' | 'gun'
          for a one-piece model; ring [x, y, z] (centre of the turret ring) and trunnion [x, y, z] (where the gun pivots), both optional: found from the parts
          if left out; muzzle (metres from the trunnion to the muzzle, optional); wheels: /name/ (nodes spun with speed); tracks: /name/ and trackScroll [u, v]
          (track meshes whose texture slides with speed); tint: [[r, g, b], [r, g, b]] per team }
   Returns what the game expects of a vehicle model: { root, hull, turret, gun, muzzle }. The tracks and wheels are the model's own, so the game's
   built-in running gear is switched off for it. */
function kitVehicle(key, cfg = {}, team = 0) {
  const tint = cfg.tint && cfg.tint[team], model = gltfBuild(key, tint ? { material: m => kitTint(m, tint) } : {}); if (!model) return null;
  const facing = (cfg.fit && cfg.fit.yaw) ?? cfg._yaw, cfgF = facing === undefined ? Object.assign({ autoYaw: true }, cfg) : Object.assign({}, cfg, { fit: Object.assign({}, cfg.fit, { yaw: facing }) });
  const holder = kitFit(model, cfgF), root = new THREE.Group(), hull = new THREE.Group(), turret = new THREE.Group(), gun = new THREE.Group();
  root.add(hull); hull.add(holder); holder.updateMatrixWorld(true);
  let tParts = [], gParts = [];
  if (cfg.split) { // one-piece model: cut it up
    for (const m of model.meshes.slice()) { if (cfg.tracks && (cfg.tracks.test(m.userData.name) || cfg.tracks.test(m.material.name))) continue; /* (the tracks stay whole, so their texture can slide) */ const parts = kitSplit(m, cfg.split); m.parent.remove(m); for (const [id, pm] of Object.entries(parts)) { (id === 'turret' ? tParts : id === 'gun' ? gParts : null || { push: x => hull.add(x) }).push(pm); } }
  } else { gParts = kitFind(model, cfg.gun); tParts = kitFind(model, cfg.turret).filter(n => !gParts.includes(n)); }
  const boxOf = list => { const b = new THREE.Box3(); for (const o of list) { o.updateMatrixWorld(true); b.expandByObject(o); } return b; };
  const scratch = new THREE.Group(); root.add(scratch); if (cfg.split) for (const o of [...tParts, ...gParts]) scratch.add(o); root.updateMatrixWorld(true);
  const tb = tParts.length ? boxOf(tParts) : null, gb = gParts.length ? boxOf(gParts) : null;
  if (facing === undefined) { // the facing was worked out, not given: the gun end is the front. Remember the answer for every later copy
    const all = kitBox(holder), back = gb && !cfg.split && (gb.min.x + gb.max.x) / 2 < (all.min.x + all.max.x) / 2 - .02 * (all.max.x - all.min.x);
    cfg._yaw = holder.userData.yaw + (back ? Math.PI : 0); if (back) return kitVehicle(key, cfg, team); }
  const ring = cfg.ring || (tb ? [(tb.min.x + tb.max.x) / 2, tb.min.y, (tb.min.z + tb.max.z) / 2] : gb ? [gb.min.x - .5, gb.min.y - .3, 0] : [0, 1.5, 0]);
  const trun = cfg.trunnion || (gb ? [gb.min.x + (tb ? Math.min(.4, (gb.max.x - gb.min.x) * .08) : 0), (gb.min.y + gb.max.y) / 2, (gb.min.z + gb.max.z) / 2] : [ring[0] + 1, ring[1] + .4, 0]);
  turret.position.set(ring[0], ring[1], ring[2]); root.add(turret); gun.position.set(trun[0] - ring[0], trun[1] - ring[1], trun[2] - ring[2]); turret.add(gun); root.updateMatrixWorld(true);
  for (const o of tParts) turret.attach(o); for (const o of gParts) gun.attach(o); root.remove(scratch); // (attach keeps each piece where it is while handing it to its new parent)
  // wheels: each named wheel (or pair on one axle) is hung from a pivot at its own middle, so it turns about its axle wherever the model's origin for it lies
  const named = kitFind(model, cfg.wheels), spin = []; root.updateMatrixWorld(true);
  for (const o of named) { let nested = false; for (let q = o.parent; q; q = q.parent) if (named.includes(q)) nested = true; if (nested) continue;
    const b = boxOf([o]); if (b.isEmpty()) continue; const sz = b.getSize(new V3()), pivot = new THREE.Group(); b.getCenter(pivot.position); hull.add(pivot); hull.updateMatrixWorld(true); pivot.attach(o); spin.push({ pivot, r: Math.max(.05, sz.y / 2) }); }
  // tracks: the texture is slid along the track as the vehicle moves (cfg.tracks: /name/ of the track meshes or their material; cfg.trackScroll: [u, v] turns of the texture per metre)
  const tracks = []; if (cfg.tracks) { const sc = cfg.trackScroll || [0, .5];
    for (const m of model.meshes) if (m.material.map && (cfg.tracks.test(m.userData.name) || cfg.tracks.test(m.material.name))) { const mat = m.material.clone(); mat.map = m.material.map.clone(); mat.map.needsUpdate = true; if (mat.normalMap) { mat.normalMap = mat.normalMap.clone(); mat.normalMap.needsUpdate = true; } m.material = mat; tracks.push({ mat, du: sc[0], dv: sc[1] }); } }
  return { root, hull, turret, gun, muzzle: cfg.muzzle ?? (gb ? gb.max.x - trun[0] : 3), gltf: true, noGear: true, spin, tracks, model };
}
/* ---------------- a helicopter ----------------
   cfg: { fit, rotor: /name/ (main rotor nodes), tailRotor: /name/, rotor2: /name/ (the lower rotor of a coaxial), parts(x, y, z) -> a damage part id
          ('cockpit', 'gunner', 'nose', 'fuse', 'fuel', 'engL', 'engR', 'trans', 'boom', 'trot', 'fin', 'stubL', 'stubR') for the body's triangles,
          stations: { 1: [[x, y, z], ...], 2: [...], 3: [...] } (where pods and missiles hang: weapon slot -> points), gun [x, y, z], cockpit [x, y, z], tint }
   Returns what the game expects of an aircraft model: { root, parts, stores, rotor, rotor2, trotor, gun, cockpit }. */
function kitHelicopter(key, cfg = {}, team = 0, def = null) {
  const tint = cfg.tint && cfg.tint[team], model = gltfBuild(key, tint ? { material: m => kitTint(m, tint) } : {}); if (!model) return null;
  let facing = (cfg.fit && cfg.fit.yaw) ?? cfg._yaw;
  if (facing === undefined) { // no facing given: the main rotor sits ahead of the tail rotor; with no tail rotor, ahead of the middle of the airframe (the tail boom is the long end)
    const h0 = kitFit(model, Object.assign({}, cfg, { fit: Object.assign({}, cfg.fit, { yaw: 0 }) })), mid = o => { const b = new THREE.Box3(); for (const n of o) b.expandByObject(n); return b.isEmpty() ? null : b.getCenter(new V3()); };
    const mr = mid(kitFind(model, cfg.rotor)), tr = mid(kitFind(model, cfg.tailRotor)), body = kitBox(h0).getCenter(new V3()), f = mr && tr ? mr.clone().sub(tr) : mr ? mr.clone().sub(body) : null; if (f) f.y = 0;
    facing = f && f.length() > .2 ? Math.atan2(f.z, f.x) : 0; const q = Math.round(facing / (Math.PI / 2)) * Math.PI / 2; if (Math.abs(facing - q) < .25) facing = q; // (models are nearly always built square to their axes: the tail rotor's sideways offset should not skew it)
    cfg._yaw = facing; h0.remove(h0.children[0]); }
  const holder = kitFit(model, Object.assign({}, cfg, { fit: Object.assign({}, cfg.fit, { yaw: facing }) })), M = { root: new THREE.Group(), parts: {}, stores: [], gltf: true, model }; M.root.add(holder); M.root.updateMatrixWorld(true);
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
/* Which bone is which. Rigs name their bones in many ways (Mixamo "LeftUpLeg", Unreal "thigh_l", 3ds Max "Bip01 L Thigh", Blender "thigh.L",
   Daz "lThigh", VRM "J_Bip_L_UpperLeg", and Sketchfab adds "_012" on the end), so names are first reduced to lower-case words joined by "_". */
function kitNorm(name) { return (name || '').replace(/([a-z0-9])([A-Z])/g, '$1_$2').replace(/([A-Z])([A-Z][a-z])/g, '$1_$2').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/_\d+$/, '').replace(/^_+|_+$/g, ''); }
function kitGuess(name) { // a bone's name -> the joint it is ('thighL', 'foreR', 'hips', ...) or null
  const t = '_' + kitNorm(name) + '_';
  if (/_(twist\w*|roll|ik|fk|pole|target|ctrl|control|helper|end|nub|socket|toe\w*|finger\w*|thumb\w*|index\w*|middle\w*|ring\w*|pinky\w*|little\w*|eye\w*|jaw|hair\w*|weapon|gun|prop)_/.test(t)) return null;
  const L = /_(l|left)_/.test(t), R = /_(r|right)_/.test(t), sd = L && !R ? 'L' : R && !L ? 'R' : '';
  if (sd) {
    if (/_(up_leg|upleg|upper_leg|upperleg|thigh\w*)_/.test(t)) return 'thigh' + sd;
    if (/_(leg|calf|shin|lower_leg|lowerleg)_/.test(t)) return 'shin' + sd;
    if (/_(foot|ankle)_/.test(t)) return 'foot' + sd;
    if (/_(fore_arm|forearm\w*|lower_arm|lowerarm|elbow)_/.test(t)) return 'fore' + sd;
    if (/_(upper_arm|upperarm|uparm|shldr\w*|arm)_/.test(t) && !/_(shoulder|clavicle|collar)_/.test(t)) return 'arm' + sd;
    if (/_(hand|wrist)_/.test(t)) return 'hand' + sd;
    return null;
  }
  if (/_(hips?|pelvis)_/.test(t)) return 'hips';
  if (/_(spine\d*|chest|torso|abdomen\w*)_/.test(t)) return 'spine';
  if (/_head_/.test(t)) return 'head';
  return null;
}
function kitRigByName(model, over) { // { id: bone } from the bones' names; cfg.bones regexes (tested against the raw names) take precedence
  const map = {}, bones = model.nodes.filter(n => n && n.isBone), all = model.nodes.filter(Boolean);
  for (const b of bones) { const id = kitGuess(b.userData.name); if (id && !map[id]) map[id] = b; }
  for (const [id, re] of Object.entries(over || {})) { const b = bones.find(n => re.test(n.userData.name)) || all.find(n => re.test(n.userData.name)); if (b) map[id] = b; }
  return map;
}
/* The same from the skeleton's shape alone, for rigs whose names say nothing: the hips are where two chains run down to the ground (legs), the chest is
   where two chains run out sideways (arms), and in each limb the two long bones in a row are the upper and lower part. Which way it faces comes from the feet. */
function kitRigByShape(model) {
  const bones = model.nodes.filter(n => n && n.isBone); if (bones.length < 9) return null;
  const P = new Map(); for (const b of bones) P.set(b, b.getWorldPosition(new V3()));
  let lo = 1e9, hi = -1e9; for (const q of P.values()) { lo = Math.min(lo, q.y); hi = Math.max(hi, q.y); } const H = Math.max(hi - lo, 1e-6);
  const kids = b => b.children.filter(c => c.isBone), E = new Map();
  const walk = b => { const q = P.get(b), e = { lo: q.y, hi: q.y, n: 1 }; for (const c of kids(b)) { const ce = walk(c); e.lo = Math.min(e.lo, ce.lo); e.hi = Math.max(e.hi, ce.hi); e.n += ce.n; } E.set(b, e); return e; };
  for (const b of bones) if (!b.parent || !b.parent.isBone) walk(b);
  const isLeg = (c, par) => E.get(c).lo < lo + .22 * H && E.get(c).hi < P.get(par).y + .12 * H && E.get(c).n >= 2;
  let hips = null, depth = -1; const dep = b => { let d = 0; for (let q = b; q.parent && q.parent.isBone; q = q.parent) d++; return d; };
  for (const b of bones) { if (kids(b).filter(c => isLeg(c, b)).length >= 2 && P.get(b).y > lo + .3 * H && dep(b) > depth) { hips = b; depth = dep(b); } }
  if (!hips) return null;
  const dist = (a, b) => P.get(a).distanceTo(P.get(b));
  const limb = (first, next) => { // follow a chain; the upper and lower bones are the two long ones in a row
    const ch = [first]; for (let q = first, k = 0; k < 8; k++) { const nx = next(q); if (!nx) break; ch.push(nx); q = nx; }
    if (ch.length < 3) return null; const len = k => k + 1 < ch.length ? dist(ch[k], ch[k + 1]) : 0; let best = 0; if (ch.length >= 4 && len(1) + len(2) > len(0) + len(1)) best = 1;
    return { up: ch[best], low: ch[best + 1], end: ch[best + 2] || null, tip: ch[ch.length - 1] };
  };
  const lowest = b => kids(b).sort((x, y) => E.get(x).lo - E.get(y).lo)[0], biggest = b => kids(b).sort((x, y) => E.get(y).n - E.get(x).n)[0], highest = b => kids(b).sort((x, y) => E.get(y).hi - E.get(x).hi)[0];
  const legs = kids(hips).filter(c => isLeg(c, hips)).sort((x, y) => E.get(y).n - E.get(x).n).slice(0, 2).map(c => limb(c, lowest)); if (legs.some(l => !l)) return null;
  // up the spine to the bone the arms hang from
  const hp = P.get(hips), reach = c => { let r = 0; c.traverse(o => { if (o.isBone && P.has(o)) r = Math.max(r, Math.hypot(P.get(o).x - hp.x, P.get(o).z - hp.z)); }); return r; };
  const spineKids = kids(hips).filter(c => !isLeg(c, hips)); if (!spineKids.length) return null;
  const chain = [spineKids.sort((x, y) => E.get(y).hi - E.get(x).hi)[0]]; let chest = null, arms = null;
  for (let q = chain[0], k = 0; k < 12 && q; k++) { const up = highest(q), side = kids(q).filter(c => c !== up && E.get(c).n >= 3 && reach(c) > .16 * H); if (side.length >= 2 && !chest) { chest = q; arms = side.sort((x, y) => reach(y) - reach(x)).slice(0, 2); } if (!up) break; chain.push(up); q = up; }
  if (!chest) return null; const A = arms.map(c => limb(c, biggest)); if (A.some(l => !l)) return null;
  const above = chain.slice(chain.indexOf(chest) + 1), head = above.length >= 2 ? above[1] : above[0] || chest;
  // facing: the feet point forwards. Without toe bones, take the usual glTF convention (the figure faces +z)
  const f = new V3(); for (const l of legs) if (l.end && l.tip !== l.end) f.add(P.get(l.tip)).sub(P.get(l.end)); f.y = 0;
  const fwd = f.length() > .04 * H ? f.normalize() : new V3(0, 0, 1), right = new V3(-fwd.z, 0, fwd.x);
  const sideOf = l => P.get(l.up).clone().sub(hp).dot(right), lr = pair => sideOf(pair[0]) < sideOf(pair[1]) ? pair : [pair[1], pair[0]], [lL, lR] = lr(legs), [aL, aR] = lr(A);
  return { hips, spine: chain[0], head, thighL: lL.up, shinL: lL.low, footL: lL.end, thighR: lR.up, shinR: lR.low, footR: lR.end, armL: aL.up, foreL: aL.low, handL: aL.end, armR: aR.up, foreR: aR.low, handR: aR.end, _fwd: fwd };
}
function kitSoldier(key, cfg = {}, team = 0) {
  const tint = cfg.tint && cfg.tint[team], model = gltfBuild(key, tint ? { material: m => kitTint(m, tint) } : {}); if (!model) return null;
  const fit0 = Object.assign({ height: 1.8 }, cfg.fit || {}), root = new THREE.Group();
  let holder = kitFit(model, { fit: Object.assign({}, fit0, { yaw: 0 }) }); root.add(holder); root.updateMatrixWorld(true);
  // which bone is which: by name if the names make sense, otherwise by the skeleton's shape
  const need = ['hips', 'thighL', 'thighR', 'shinL', 'shinR', 'armL', 'armR', 'foreL', 'foreR']; let map = kitRigByName(model, cfg.bones), how = 'names';
  if (cfg.rig === 'shape' || need.some(k => !map[k])) { const g = kitRigByShape(model); if (g) { map = Object.assign(g, cfg.bones ? kitRigByName({ nodes: model.nodes.filter(n => n && Object.values(cfg.bones).some(re => re.test(n.userData.name))) }, cfg.bones) : {}); how = 'shape'; } else how = 'names (incomplete)'; }
  // which way it faces, so that it can be turned to the game's forward (+x)
  let yaw = fit0.yaw;
  if (yaw === undefined) { const wp = b => b.getWorldPosition(new V3()); let fwd = map._fwd;
    if (!fwd && map.thighL && map.thighR) { const r = wp(map.thighR).sub(wp(map.thighL)); fwd = new V3(r.z, 0, -r.x); }
    yaw = fwd && fwd.lengthSq() > 1e-8 ? Math.atan2(fwd.z, fwd.x) : Math.PI / 2; }
  root.remove(holder); holder = kitFit(model, { fit: Object.assign({}, fit0, { yaw }) }); root.add(holder); root.updateMatrixWorld(true);
  const rig = {}, side = new V3(0, 0, 1), up = new V3(0, 1, 0), q = new THREE.Quaternion(), NEXT = { armL: 'foreL', armR: 'foreR', foreL: 'handL', foreR: 'handR', thighL: 'shinL', thighR: 'shinR', shinL: 'footL', shinR: 'footR' };
  for (const [id, b] of Object.entries(map)) { if (!b || !b.isObject3D) continue;
    b.getWorldQuaternion(q); const inv = q.clone().invert(), nx = map[NEXT[id]] || b.children.find(c => c.isBone) || b.children[0], al = nx ? b.worldToLocal(nx.getWorldPosition(new V3())) : null;
    let along = al && al.lengthSq() > 1e-10 ? al.normalize() : null, len = nx ? b.getWorldPosition(new V3()).distanceTo(nx.getWorldPosition(new V3())) : 0;
    if (!along && b.parent && b.position.lengthSq() > 1e-10) { along = b.position.clone().normalize().applyQuaternion(b.quaternion.clone().invert()); len = b.getWorldPosition(new V3()).distanceTo(b.parent.getWorldPosition(new V3())) * .9; } // an end bone with nothing after it (no hand, no foot): take it to carry straight on from the one before
    rig[id] = { bone: b, rest: b.quaternion.clone(), restPos: b.position.clone(), side: side.clone().applyQuaternion(inv).normalize(), up: up.clone().applyQuaternion(inv).normalize(), along, len }; } // (along: the way the bone runs, towards the next joint, in its own frame)
  // stand-ins for the joints the game turns; kitPoseSoldier copies their angles onto the bones each frame
  const J = () => ({ rotation: new THREE.Euler(), position: new V3() }), m = { root, hips: J(), torso: J(), head: J(), arms: J(), legs: [{ thigh: J(), shin: J() }, { thigh: J(), shin: J() }], rig, rigHow: how, gltf: true, real: false, model, holder };
  m.hips.position.y = .95; m.rifle = m.arms;
  // a rifle of the game's own, held at the shoulder (cfg.rifle: false if the figure carries one)
  if (cfg.rifle !== false && typeof rifleParts === 'function' && rig.armL && rig.armR) {
    MKIT.rifleGeo = MKIT.rifleGeo || {}; const kind = typeof cfg.rifle === 'string' ? cfg.rifle : KIT[team].rifle, geo = MKIT.rifleGeo[kind] || (MKIT.rifleGeo[kind] = (() => { const sp = new SPart(); rifleParts(sp, kind, .2, -.07, .1); return sp.build(); })());
    m.gun = new THREE.Group(); const gm = new THREE.Mesh(geo, soldierMat(team)); gm.castShadow = true; m.gun.add(gm); root.add(m.gun);
  }
  // the model's own animations, if wanted
  if (cfg.clips && model.clips.length) { const mx = model.mixer(), find = re => re && model.clips.find(c => re.test(c.name)); m.anim = { mixer: mx, act: {}, cur: null };
    for (const st of ['idle', 'walk', 'run', 'crouch']) { const c = find(cfg.clips[st]); if (c) { m.anim.act[st] = mx.clipAction(c); } } }
  m.holderScale = holder.children[0].scale.x;
  return m;
}
const _kq = new THREE.Quaternion(), _kq2 = new THREE.Quaternion(), _kd = new V3(), _ks = new V3(), _kt = new V3(), _kp = new V3(), _ke = new V3(), _kc = new V3();
/* Point a bone along a direction given in the figure's own frame (x forward, y up, z right), whatever pose the rig was built in:
   find where that direction lies in the bone's rest frame and turn the bone's length onto it. Parents must be posed first. */
function kitPoint(r, root, dx, dy, dz) {
  if (!r || !r.along) return; const b = r.bone;
  b.parent.updateWorldMatrix(true, false); b.parent.getWorldQuaternion(_kq).multiply(r.rest); root.getWorldQuaternion(_kq2);
  _kd.set(dx, dy, dz).normalize().applyQuaternion(_kq2).applyQuaternion(_kq.invert()); // the wanted direction, seen from the bone at rest
  b.quaternion.copy(r.rest).multiply(_kq.setFromUnitVectors(r.along, _kd));
}
function kitTurn(r, angle, about = 'side') { if (!r) return; _kq.setFromAxisAngle(r[about], angle); r.bone.quaternion.copy(r.rest).multiply(_kq); }
/* Put a hand on a point (given in the figure's frame): the shoulder, elbow and hand make a triangle whose sides are known, so the elbow's place follows.
   The elbow is kept low and a little out to the side. */
function kitReach(m, upper, lower, tx, ty, tz, out) {
  if (!upper || !lower || !upper.along || !lower.along) return;
  upper.bone.parent.updateWorldMatrix(true, false); upper.bone.updateWorldMatrix(false, false); upper.bone.getWorldPosition(_ks); m.root.worldToLocal(_ks);
  const a = upper.len, b = lower.len; _kt.set(tx, ty, tz).sub(_ks); const d0 = _kt.length() || 1e-6, d = clamp(d0, Math.abs(a - b) + .01, (a + b) * .998); _kt.multiplyScalar(1 / d0);
  const x = (a * a - b * b + d * d) / (2 * d), h = Math.sqrt(Math.max(0, a * a - x * x));
  _kp.set(0, -1, out); _kp.addScaledVector(_kt, -_kp.dot(_kt)); if (_kp.lengthSq() < 1e-6) _kp.set(0, 0, out || 1); _kp.normalize();
  _ke.copy(_kt).multiplyScalar(x).addScaledVector(_kp, h); // shoulder -> elbow
  kitPoint(upper, m.root, _ke.x, _ke.y, _ke.z);
  _kd.copy(_kt).multiplyScalar(d).sub(_ke); const fx = _kd.x, fy = _kd.y, fz = _kd.z; // elbow -> hand
  kitPoint(lower, m.root, fx, fy, fz);
}
function kitPoseSoldier(s, m, dt) { // called after the game has set its joint angles: copy them onto the skeleton
  const R = m.rig, A = m.anim, sp = Math.hypot(s.vel.x, s.vel.z), aim = clamp(s.pitch, -.9, .9), ca = Math.cos(aim), sa = Math.sin(aim); // (the rifle is held in the figure's own frame, so the aim is the plain pitch)
  const want = !A ? '' : s.crouch ? 'crouch' : sp > 4.2 && A.act.run ? 'run' : sp > .4 ? 'walk' : 'idle', act = A && A.act[want];
  if (A && !act && A.cur) { A.cur.stop(); A.cur = null; } // no clip for this (standing, say): back to the rest pose and the game's own posing
  if (act && s.alive) { // the model's own walk and run cycles drive the legs
    for (const k in R) { const r = R[k]; if (r && r.bone) { r.bone.quaternion.copy(r.rest); r.bone.position.copy(r.restPos); } } // joints the clip does not move go back to rest (they may have been left crouched)
    if (A.cur !== act) { act.reset().play(); if (A.cur) A.cur.crossFadeTo(act, .25, false); A.cur = act; }
    A.cur.timeScale = want === 'walk' ? clamp(sp / 1.6, .5, 2) : want === 'run' ? clamp(sp / 5, .7, 1.6) : 1;
    A.mixer.update(dt || 0);
    if (R.spine) { _kq.setFromAxisAngle(R.spine.side, clamp(s.pitch, -.9, .9) * .5); R.spine.bone.quaternion.multiply(_kq); } // lean the upper body into the aim on top of the animation
  } else {
    // The game's angles are about its own sideways axis (z), positive swinging the limb forward.
    for (let k = 0; k < 2; k++) { kitTurn(k ? R.thighR : R.thighL, m.legs[k].thigh.rotation.z); kitTurn(k ? R.shinR : R.shinL, m.legs[k].shin.rotation.z); }
    if (R.hips) { R.hips.bone.position.copy(R.hips.restPos); R.hips.bone.position.addScaledVector(R.hips.up, (m.hips.position.y - .95) / (m.holderScale || 1)); }
    kitTurn(R.spine, m.torso.rotation.z);
    if (R.head) kitTurn(R.head, aim * .4);
  }
  // arms: a rifle held at the shoulder, the whole hold tilted up or down with the aim. Right hand back at the grip, left hand forward on the handguard.
  if (!R.armL || !R.armR) return;
  m.root.updateMatrixWorld(true);
  R.armL.bone.getWorldPosition(_kc); R.armR.bone.getWorldPosition(_ks); _kc.add(_ks).multiplyScalar(.5); m.root.worldToLocal(_kc); // the middle of the shoulders, in the figure's frame
  const cx = _kc.x, cy = _kc.y, cz = _kc.z, at = (x, y, z) => [cx + x * ca - y * sa, cy + x * sa + y * ca, cz + z];
  if (m.gun) { m.gun.position.set(cx, cy, cz); m.gun.rotation.z = aim; }
  if (act && s.alive && !m.gun) return; // (an animated figure with its own weapon keeps its own arm movement)
  const g = at(.2, -.13, .1), f = at(.5, -.115, .1);
  kitReach(m, R.armR, R.foreR, g[0], g[1], g[2], .55); kitReach(m, R.armL, R.foreL, f[0], f[1], f[2], -.45);
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

/* ---------------- a jet, for the title screen's jet choice ----------------
   Draws a downloaded jet in place of a side's built-in one. Only the look changes: the flight model, weapons and damage stay those of the slot
   (def is the slot's entry in AIR). The model is scaled to the slot's length, turned nose forward (+x: the tail fins are the highest part, so the
   nose is the other end) and lowered so its wheels sit def.gear below the origin, as the flight model expects. It is cut into the slot's damage parts
   by nearest part centre (the part positions stretched to this model's span), so a lost wing or fin disappears. Gear nodes named like
   "Landing On/Open" and "Landing Off/Closed" become the extended and stowed gear.
   cfg.hide: /node names/ of parts to leave out (a model's own missiles and bombs); cfg.flip: turn it round where the nose-finder guesses wrong;
   cfg.nozzles: [[x, y, z, radius], ...] in metres with the wheels at y = 0 (where the engine flames start); own: the slot's own model, whose
   stores (missiles and bombs) are moved across, spread to this wing and hung under it at the same clearance. */
function kitJet(key, team, def, cfg = {}, own = null) {
  const model = kitData(key) && gltfBuild(key, {}); if (!model) return null;
  const fitAt = yaw => kitFit(model, { fit: Object.assign({ length: def.len, yaw, offset: [0, -def.gear, 0] }, cfg.fit) });
  let holder = fitAt(undefined);
  if (holder.userData.yaw === 0 && kitBox(holder).getSize(new V3()).z > kitBox(holder).getSize(new V3()).x * 1.12) holder = fitAt(Math.PI / 2); // (length fore and aft)
  { const b = kitBox(holder), top = b.min.y + .8 * (b.max.y - b.min.y), v = new V3(); let sx = 0, n = 0;
    holder.updateMatrixWorld(true);
    holder.traverse(o => { if (!o.isMesh) return; const P = o.geometry.attributes.position; for (let i = 0; i < P.count; i += 3) { v.fromBufferAttribute(P, i).applyMatrix4(o.matrixWorld); if (v.y > top) { sx += v.x; n++; } } });
    if (n && sx / n > 0) holder = fitAt(holder.userData.yaw + Math.PI); }
  if (cfg.flip) holder = fitAt(holder.userData.yaw + Math.PI); // (where the guess is wrong: the A-10's canopy and engine pods stand higher than most of its fins)
  holder.updateMatrixWorld(true);
  const span = kitBox(holder).getSize(new V3()).z / 2, zk = def.wid ? span / (def.wid / 2) : 1;
  const M = { root: new THREE.Group(), parts: {}, stores: [], kitJet: key }, ids = def.parts.filter(p => p.kind !== 'fuel');
  const nearest = (x, y, z) => { let best = ids[0].id, bd = 1e9; for (const p of ids) { const d = (x - p.p[0]) ** 2 + (y - p.p[1]) ** 2 * 2 + (z - p.p[2] * zk) ** 2; if (d < bd) { bd = d; best = p.id; } } return best; };
  const down = cfg.gearDown || /landing.?(on|open)/i, up = cfg.gearUp || /landing.?(off|closed)/i, named = o => { for (let q = o; q; q = q.parent) if (q.name) { if (down.test(q.name)) return 'down'; if (up.test(q.name)) return 'up'; } return null; };
  M.gearDown = new THREE.Group(); M.gearUp = new THREE.Group(); M.root.add(M.gearDown, M.gearUp);
  const hidden = o => { if (!cfg.hide) return false; for (let q = o; q; q = q.parent) if ((q.userData && q.userData.name && cfg.hide.test(q.userData.name)) || (q.name && cfg.hide.test(q.name))) return true; return false; }; // (the model's own missiles: the game hangs its own, which drop when fired)
  for (const m of model.meshes.slice()) { if (hidden(m)) { m.parent && m.parent.remove(m); continue; } const g = named(m), pieces = kitSplit(m, g ? () => g : nearest);
    for (const [id, pm] of Object.entries(pieces)) { pm.castShadow = true; pm.receiveShadow = true; pm.userData.keep = true; (id === 'down' ? M.gearDown : id === 'up' ? M.gearUp : M.parts[id] || part(M, id)).add(pm); } }
  for (const p of def.parts) if (!M.parts[p.id]) part(M, p.id);
  const b = kitBox(M.root), eng = def.parts.filter(p => p.kind === 'engine');
  const nz = cfg.nozzles || [[b.min.x + .25, def.gear + .1, 0, .5]]; // (fallback: one flame at the tail)
  M.nozzles = nz.map((q, i) => [q[0], q[1] - def.gear, q[2], q[3], (eng[Math.min(i, eng.length - 1)] || {}).id]);
  if (cfg.stores !== 'own') kitStoreLayout(M, def, kitUnderside(Object.values(M.parts)), span, def.len); // the jet's own weapons, on stations worked out from its wing
  else if (own && own.stores) { // the slot's missiles and bombs, moved across
    const under = kitUnderside(Object.values(M.parts)), ownUnder = kitUnderside(Object.values(own.parts)), ownSpan = def.wid ? def.wid / 2 : span;
    const near = (x, z) => { for (let r = 0; r <= 2.01; r += .4) for (let a = 0; a < TAU; a += r ? .6 / r : TAU) { const px = x + Math.cos(a) * r, pz = z + Math.sin(a) * r, u = under(px, pz); if (u !== null) return [px, pz, u]; } return null; }; // (the nearest bit of this airframe's underside)
    own.stores.forEach((list, slot) => { if (!list) return; for (const g of list) {
      const z0 = g.position.z * Math.min(span / ownSpan, 1.6), u0 = ownUnder(g.position.x, g.position.z), hit = near(g.position.x, z0);
      if (!hit) { g.visible = false; continue; } // nowhere to hang it on this airframe: leave it off rather than float it (the weapon still fires, from the airframe)
      const gap = clamp(u0 !== null ? u0 - g.position.y : .35, .12, .7);
      g.position.set(hit[0], hit[2] - gap, hit[1]); M.root.add(g); (M.stores[slot] = M.stores[slot] || []).push(g); } });
  }
  const ck = def.parts.find(p => p.id === 'cockpit');
  return Object.assign(M, { gun: [def.len * .2, 0, .7], cockpit: ck ? ck.p.slice() : [def.len * .27, 1.2, 0] });
}
/* The underside of an airframe as a lookup: (x, z) -> the lowest point within 0.4 m (or null), from the meshes in groups (in the model's own frame). */
function kitUnderside(groups) {
  const cell = .4, map = new Map(), v = new V3(), root = groups[0] && groups[0].parent; if (!root) return () => null;
  root.updateMatrixWorld(true); const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
  for (const g of groups) g.traverse(o => { if (!o.isMesh) return; const P = o.geometry.attributes.position, mw = new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld);
    for (let i = 0; i < P.count; i++) { v.fromBufferAttribute(P, i).applyMatrix4(mw); const k = Math.round(v.x / cell) + ',' + Math.round(v.z / cell), h = map.get(k); if (h === undefined || v.y < h) map.set(k, v.y); } });
  return (x, z) => { const h = map.get(Math.round(x / cell) + ',' + Math.round(z / cell)); return h === undefined ? null : h; };
}

/* ---------------- weapons on the pylons ----------------
   storeMesh(key): the weapon's model from the downloaded collection ("Missile & Bomb Collection - Fighter Jets - Free", models/weapons.js), real size,
   nose along +x and centred; or null when the collection has no model of it. kitStoreLayout: hangs a jet's weapons on stations worked out from its
   own wing (air-to-air missiles outboard, air-to-ground missiles in the middle, bombs inboard), clear of the underside. */
const STORE_OF = { aim9x: 'AIM-9 Sidewinder', aim7: 'AIM-7 Sparrow', agm65: 'AGM-65 Maverick', gbu12: 'GBU-12 Paveway II', jdam: 'JDAM (2)', r77: 'R-77', kh29t: 'Kh-29', kab500: 'KAB-500L' };
const STORE_CACHE = {};
function storeMesh(key) {
  const pre = STORE_OF[key]; if (!pre || !kitData('weapons')) return null;
  let c = STORE_CACHE[pre];
  if (c === undefined) {
    c = STORE_CACHE[pre] = null;
    const m = gltfBuild('weapons', {}); m.root.updateMatrixWorld(true); let node = null;
    m.root.traverse(o => { if (!node && o.userData && typeof o.userData.name === 'string' && o.userData.name.startsWith(pre + '_')) node = o; });
    if (node) { const parts = [], box = new THREE.Box3(); node.traverse(o => { if (o.isMesh) { const g = o.geometry.clone(); g.applyMatrix4(o.matrixWorld); g.computeBoundingBox(); box.union(g.boundingBox); parts.push({ g, mat: o.material }); } });
      const ctr = box.getCenter(new V3()), fix = new THREE.Matrix4().makeRotationY(-Math.PI / 2).multiply(new THREE.Matrix4().makeTranslation(-ctr.x, -ctr.y, -ctr.z)); // (the collection's noses point down -z)
      for (const p of parts) { p.g.applyMatrix4(fix); p.g.computeBoundingSphere(); }
      const sz = box.getSize(new V3()); c = STORE_CACHE[pre] = { parts, len: sz.z, r: Math.max(sz.x, sz.y) / 2 }; }
  }
  if (!c) return null;
  const g = new THREE.Group(); for (const p of c.parts) { const mesh = new THREE.Mesh(p.g, p.mat); mesh.castShadow = true; mesh.userData.keep = true; g.add(mesh); }
  g.userData.len = c.len; g.userData.r = c.r; return g;
}
function storeFallback(A) { // the game's own simple shapes, for weapons the collection does not have
  if (A.look === 'bomb') { const g = bombModel(A.cal > 300 ? 3.7 : 2.2, A.cal > 300 ? .2 : .14); g.userData.len = 3; g.userData.r = .2; return g; }
  const g = missileModel(A.aa ? 2.9 : 2.5, A.aa ? .065 : .15, A.aa ? 0xd8dad6 : 0x8f9488, A.aa ? .07 : .12); g.userData.len = 2.9; g.userData.r = A.aa ? .12 : .2; return g;
}
function kitStoreLayout(M, def, under, span, len) {
  // stations: spanwise spots where the wing is, each at the middle of its chord
  const stations = [];
  for (const f of [.9, .78, .66, .54, .43, .33, .25]) {
    const z = f * span; let best = null, run = null;
    // a wing chord: a stretch of underside on both sides that stays roughly level (an engine pod, a gear pod or the tail is not wing)
    const done = () => { if (run) { const L = run.x0 - run.x1; if (L >= 1 && L <= len * .4 && run.hi - run.lo < .7 && (!best || L > best.x0 - best.x1)) best = run; run = null; } };
    for (let x = len / 2; x >= -len / 2; x -= .25) { const u = under(x, z), u2 = under(x, -z);
      if (u !== null && u2 !== null && (!run || Math.abs(u - run.u) < .35)) { if (!run) run = { x0: x, x1: x, u, lo: u, hi: u }; run.x1 = x; run.u = u; run.lo = Math.min(run.lo, u); run.hi = Math.max(run.hi, u); }
      else { done(); if (u !== null && u2 !== null) run = { x0: x, x1: x, u, lo: u, hi: u }; } }
    done();
    if (best) stations.push({ z, x: (best.x0 + best.x1) / 2 + .2, u: (best.lo + best.hi) / 2 });
  }
  if (!stations.length) return;
  const rank = A => A.aa ? 0 : A.look === 'bomb' ? 2 : 1, slots = def.weapons.map((w, i) => ({ i, w, A: AMMO[w.k] })).filter(s => s.i > 0 && s.A && s.A.look).sort((a, b) => rank(a.A) - rank(b.A));
  let next = 0;
  for (const s of slots) {
    const perSide = Math.ceil(s.w.n / 2); let placed = 0;
    for (let k = 0; k < perSide; k++) {
      const st = stations[Math.min(next, stations.length - 1)], tandem = next >= stations.length ? next - stations.length + 1 : 0; next++;
      for (const sd of [1, -1]) { if (placed >= s.w.n) break;
        const g = storeMesh(s.w.k) || storeFallback(s.A), L = g.userData.len, r = g.userData.r, x = st.x - tandem * (L + .3), z = st.z * sd;
        let u = st.u; for (const dx of [-L / 2, 0, L / 2]) { const q = under(x + dx, z); if (q !== null && q < u && q > st.u - .45) u = q; } // (clear of the wing along the store's whole length, but not dropped below a gear pod)
        if (u === null) continue;
        g.position.set(x, u - r - .16, z); M.root.add(g); (M.stores[s.i] = M.stores[s.i] || []).push(g); g.userData.drag = s.A.look === 'bomb' ? 1.2 : s.A.aa ? .4 : .6; placed++; }
    }
  }
}
