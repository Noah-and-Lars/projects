/* Island Front: a battlefield that looks fought over (every graphics level).
   - Burning wrecks: the roadside wrecks nearest the front burn all match, with flickering flames and tall smoke columns leaning with the wind,
     seen from kilometres away. All the smoke is one instanced mesh and all the fire another (two draw calls), not a sprite per puff.
   - Distant battle: every few seconds a shell lands 1 to 4 km from the camera (flash, smoke, a far-off boom and a crater, no damage), so the
     fighting is heard and seen beyond the players' own.
   - No man's land: a band of shell craters and scorched ground across the middle of the map round the fort, there from the start. */
'use strict';
const BATTLE = { sites: [], wind: new V3(.8, 0, .35).normalize(), puffs: null, fires: null, t: 0, lastT: 0, nextFar: 3, group: null };
const SMOKE_MAX = 1600, FIRE_MAX = 160;

function billboardMat(tex, additive) { // camera-facing quads; per-instance position, size, opacity and shade; fog for the smoke
  const mat = new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { map: { value: tex } }]),
    vertexShader: `attribute vec4 aPS; attribute vec2 aAS; attribute vec3 aCol; varying vec2 vUv; varying float vA; varying vec3 vCol;
      #include <fog_pars_vertex>
      void main() {
        vUv = uv; vA = aAS.x; vCol = aCol;
        vec4 mvPosition = modelViewMatrix * vec4(aPS.xyz, 1.0); mvPosition.xy += position.xy * aPS.w;
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: `uniform sampler2D map; varying vec2 vUv; varying float vA; varying vec3 vCol;
      #include <fog_pars_fragment>
      void main() {
        vec4 t = texture2D(map, vUv); gl_FragColor = vec4(t.rgb * vCol, t.a * vA); if (gl_FragColor.a < .01) discard;
        ${additive ? '' : '#include <fog_fragment>'}
        #include <tonemapping_fragment>
        #include <encodings_fragment>
      }`,
    transparent: true, depthWrite: false, fog: !additive, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
  });
  return mat;
}
function billboardCloud(max, tex, additive) {
  const g = new THREE.InstancedBufferGeometry(); const q = new THREE.PlaneGeometry(1, 1);
  g.index = q.index; g.setAttribute('position', q.attributes.position); g.setAttribute('uv', q.attributes.uv);
  g.setAttribute('aPS', new THREE.InstancedBufferAttribute(new Float32Array(max * 4), 4).setUsage(THREE.DynamicDrawUsage));
  g.setAttribute('aAS', new THREE.InstancedBufferAttribute(new Float32Array(max * 2), 2).setUsage(THREE.DynamicDrawUsage));
  g.setAttribute('aCol', new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3).setUsage(THREE.DynamicDrawUsage));
  g.instanceCount = 0;
  const m = new THREE.Mesh(g, billboardMat(tex, additive)); m.frustumCulled = false; m.renderOrder = additive ? 7 : 6;
  return { mesh: m, list: [], max };
}

/* Called while the world is built (props.js passes each wreck it places). */
function battleReset() { BATTLE.sites = []; BATTLE.cand = []; BATTLE.nextFar = 3; if (BATTLE.puffs) BATTLE.puffs.list = []; if (BATTLE.fires) BATTLE.fires.list = []; if (FXI.smoke) FXI.smoke.list = [], FXI.fire.list = []; }
function battleWreck(x, z, y) { (BATTLE.cand = BATTLE.cand || []).push([x, z, y]); }

function battleBuild(M) {
  if (!WORLD.group) return;
  if (!BATTLE.puffs) { BATTLE.puffs = billboardCloud(SMOKE_MAX, SMOKE_TEX, false); BATTLE.fires = billboardCloud(FIRE_MAX, FIRE_TEX, true); }
  for (const c of [BATTLE.puffs, BATTLE.fires]) { c.list = []; c.mesh.geometry.instanceCount = 0; WORLD.group.add(c.mesh); }
  BATTLE.group = WORLD.group;
  const cps = M._cps, mid = cps[Math.floor(cps.length / 2)], fx = mid.x * 1000, fz = mid.y * 1000, R = rng((M.seed || 1) * 5 + 909);
  // the wrecks nearest the front burn (up to 12), plus a few haystack and field fires in the band round the fort
  const cand = (BATTLE.cand || []).map(w => [w, Math.hypot(w[0] - fx, w[1] - fz)]).sort((a, b) => a[1] - b[1]);
  BATTLE.sites = cand.slice(0, 12).map(([w], i) => ({ x: w[0], y: w[2] + .8, z: w[1], rate: 1.3 + R() * .6, size: 1 + R() * .5, fire: 1.2 + R() * .5, acc: R(), dark: .2 + R() * .1 }));
  // no man's land: craters in a band across the middle, thickest round the fort
  const a = cps[Math.max(0, Math.floor(cps.length / 2) - 1)], b = cps[Math.min(cps.length - 1, Math.floor(cps.length / 2) + 1)];
  const ax = a.x * 1000, az = a.y * 1000, bx = b.x * 1000, bz = b.y * 1000, L = Math.hypot(bx - ax, bz - az), ux = (bx - ax) / L, uz = (bz - az) / L;
  const zones = M.zones, inZone = (x, z, pad) => zones.some(zn => { const dx = x / 1000 - zn.x, dz = z / 1000 - zn.y, c = Math.cos(zn.ang || 0), s = Math.sin(zn.ang || 0); return Math.abs(dx * c + dz * s) < zn.hx + pad && Math.abs(-dx * s + dz * c) < zn.hy + pad; });
  let placed = 0, fires = 0;
  for (let k = 0; k < 4000 && placed < 560; k++) {
    const t = R(), across = (R() - .5) * 2 * (420 + R() * 380) * (1 - Math.abs(t - .5) * .8), x = ax + ux * L * t - uz * across, z = az + uz * L * t + ux * across;
    const near = Math.hypot(x - fx, z - fz); if (R() > 1.15 - near / 1600) continue; // thicker near the fort
    const h = terrainY(x, z); if (h < 3 || inZone(x, z, -.02) || (typeof inAirfield === 'function' && inAirfield(x, z, 30)) || onRoad(x, z) && roadNear(x, z)) continue;
    craterAt(new V3(x, h, z), R() < .05 ? 22 + R() * 14 : R() < .18 ? 9 + R() * 5 : 3 + R() * 4); placed++; // now and then a wide scorched patch
    if (fires < 5 && R() < .03 && !inForest(x, z)) { BATTLE.sites.push({ x, y: h + .3, z, rate: .8 + R() * .4, size: .8 + R() * .3, fire: .9 + R() * .4, acc: R(), dark: .42 }); fires++; } // a field fire
  }
  BATTLE.craters = placed;
}

function battleEmit(c, x, y, z, vx, vy, vz, life, s0, s1, a, shade) { if (c.list.length < c.max) c.list.push({ x, y, z, vx, vy, vz, t: 0, life, s0, s1, a, shade }); }
function battleUpdate(cam, focus) {
  if (!BATTLE.puffs || BATTLE.group !== WORLD.group) return;
  const now = performance.now() / 1000, dt = Math.min(.1, BATTLE.lastT ? now - BATTLE.lastT : .016); BATTLE.lastT = now; BATTLE.t += dt;
  const W = BATTLE.wind, gust = .7 + .3 * Math.sin(BATTLE.t * .3);
  // burning sites: smoke puffs and flames (sites far from the camera emit less: their columns are seen, their puffs barely)
  for (const s of BATTLE.sites) {
    const d = Math.hypot(s.x - cam.x, s.z - cam.z); if (d > 7000) continue;
    s.acc += dt * s.rate * (d > 2500 ? .5 : 1);
    while (s.acc > 1) { s.acc -= 1; const r = () => (Math.random() - .5);
      battleEmit(BATTLE.puffs, s.x + r() * 2, s.y + 1.5, s.z + r() * 2, W.x * 2.6 * gust + r(), 6.5 + Math.random() * 2.5, W.z * 2.6 * gust + r(), 30 + Math.random() * 12, 5 * s.size, 58 * s.size, .82, s.dark + Math.random() * .08); }
    if (d < 3000 && Math.random() < dt * 14 * s.fire) battleEmit(BATTLE.fires, s.x + (Math.random() - .5) * 2.6, s.y + .1, s.z + (Math.random() - .5) * 2.6, 0, 2.6 + Math.random() * 1.8, 0, .6 + Math.random() * .4, 3.2 * s.fire, 5.2 * s.fire, 1, 1);
  }
  // the distant battle
  if (GAME.on && !GAME.over && (BATTLE.nextFar -= dt) <= 0) {
    BATTLE.nextFar = 2 + Math.random() * 4.5;
    const M = WORLD.M, cps = M._cps, c = cps[Math.floor(Math.random() * cps.length)], ang = Math.random() * TAU, r = 200 + Math.random() * 900;
    const x = c.x * 1000 + Math.cos(ang) * r, z = c.y * 1000 + Math.sin(ang) * r, d = Math.hypot(x - cam.x, z - cam.z), h = terrainY(x, z);
    const clear = !ENTS.some(e => e.alive && Math.hypot(e.pos.x - x, e.pos.z - z) < 80);
    if (d > 1000 && d < 4200 && h > 2 && clear) {
      // drawn with the instanced fire and smoke, not the sprite explosion (a sprite is a draw call each, and these are only scenery)
      const p = new V3(x, h, z), sz = 9 + Math.random() * 5; craterAt(p, sz);
      if (typeof Sound !== 'undefined') Sound.at('bigboom', p, .55);
      for (let k = 0; k < 5; k++) battleEmit(BATTLE.fires, x + (Math.random() - .5) * 6, h + 2 + Math.random() * 4, z + (Math.random() - .5) * 6, (Math.random() - .5) * 6, 4 + Math.random() * 6, (Math.random() - .5) * 6, .25 + Math.random() * .25, sz * 1.2, sz * 2.4, 1, 1); // the flash
      for (let k = 0; k < 9; k++) battleEmit(BATTLE.puffs, x + (Math.random() - .5) * 10, h + 2 + Math.random() * 4, z + (Math.random() - .5) * 10, W.x * 1.5 + (Math.random() - .5) * 4, 3 + Math.random() * 4, W.z * 1.5 + (Math.random() - .5) * 4, 10 + Math.random() * 8, 7, 30, .7, k < 3 ? .2 : .42); // earth and smoke thrown up
    }
  }
  // integrate and write the instance buffers (sorted far to near so the smoke blends properly)
  for (const c of [BATTLE.puffs, BATTLE.fires]) {
    const L = c.list; for (let i = L.length - 1; i >= 0; i--) { const p = L[i]; p.t += dt; if (p.t >= p.life) { L[i] = L[L.length - 1]; L.pop(); continue; } p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt; p.vy *= 1 - .05 * dt; p.vx += W.x * .25 * dt; p.vz += W.z * .25 * dt; }
    if (c === BATTLE.puffs) L.sort((a, b) => ((b.x - cam.x) ** 2 + (b.z - cam.z) ** 2) - ((a.x - cam.x) ** 2 + (a.z - cam.z) ** 2));
    const g = c.mesh.geometry, PS = g.attributes.aPS.array, AS = g.attributes.aAS.array, CO = g.attributes.aCol.array;
    for (let i = 0; i < L.length; i++) { const p = L[i], f = p.t / p.life, size = p.s0 + (p.s1 - p.s0) * Math.sqrt(f), alpha = p.a * Math.min(1, f * 6) * Math.pow(1 - f, .65), sh = c === BATTLE.puffs ? p.shade * (1 + f * .9) : 1;
      PS[i * 4] = p.x; PS[i * 4 + 1] = p.y; PS[i * 4 + 2] = p.z; PS[i * 4 + 3] = size; AS[i * 2] = alpha; CO[i * 3] = CO[i * 3 + 1] = CO[i * 3 + 2] = sh; }
    g.instanceCount = L.length; g.attributes.aPS.needsUpdate = true; g.attributes.aAS.needsUpdate = true; g.attributes.aCol.needsUpdate = true;
  }
}

/* ---------------- base dressing ----------------
   A base is 840 m by 720 m; this fills it like a working forward base: a container yard (some stacked two high), barracks tents, parked trucks
   by the motor pool, a fuel depot, camouflage-net shelters, corner watchtowers, a radio mast and loose crates. Laid out in the base's own frame,
   clear of the spawn spots, helipads, gun pits, buildings and the road through the middle. The colours are ones Realistic gives textures to. */
const CONT_C = [0x5a6340, 0x9b8a62, 0x7a4a32, 0x4a5a6a], OLIVE = 0x4f5638, CANVAS = 0x5c6040, RUBBER = 0x4a4a44, CRATE = 0x6b5a46;
function dressBase(site, team, seed) {
  const R = rng(seed), box = (x, z, w, h, d, c, o = {}) => site.box(x, z, w, h, d, c, o);
  // container yard, two blocks of three rows
  for (const [bx, bz] of [[-150, 215], [-150, -215], [-30, 300]]) for (let row = 0; row < 3; row++) for (let k = 0; k < 6; k++) {
    if (R() < .12) continue; const x = bx + k * 13.2 - 33, z = bz + row * 4.2 * Math.sign(bz), c = CONT_C[Math.floor(R() * 4)];
    box(x, z, 12.2, 2.6, 2.45, c); if (R() < .3) box(x + (R() - .5) * .6, z, 12.2, 2.6, 2.45, CONT_C[Math.floor(R() * 4)], { y: site.y0 + 2.6 });
  }
  // barracks tents: two rows of six
  for (let row = 0; row < 3; row++) for (let k = 0; k < 6; k++) site.roofHouse(-250 + k * 17, -100 - row * 22, 12, 7, 1.4, CANVAS, 0x55604f);
  // parked trucks by the motor pool (cab, bed and canvas tilt)
  for (let k = 0; k < 14; k++) { const x = 205 + (k % 7) * 9, z = -290 - Math.floor(k / 7) * 14; box(x, z - 3.2, 2.5, 2.4, 2.2, OLIVE); box(x, z + 1.2, 2.5, 1.2, 5.6, OLIVE, { dy: .5 }); box(x, z + 1.2, 2.4, 1.6, 5.2, CANVAS, { dy: 1.7, collide: false }); }
  // fuel depot: rubber bladders behind a berm, drum stacks
  for (let k = 0; k < 3; k++) box(140 + k * 14, 265, 10, 1.3, 6, RUBBER);
  box(160, 252, 46, 1.4, 1.6, 0x6e6450); box(160, 280, 46, 1.4, 1.6, 0x6e6450);
  for (let k = 0; k < 14; k++) box(118 + (k % 7) * 1.1, 246 + Math.floor(k / 7) * 1.1, .9, 1.1, .9, k % 3 ? 0x7a6440 : 0x5a6340);
  // camouflage-net shelters over vehicle bays
  for (let k = 0; k < 4; k++) { const x = 110 + k * 22, z = -60; for (const [px, pz] of [[-6, -5], [6, -5], [-6, 5], [6, 5]]) box(x + px, z + pz, .2, 3.2, .2, 0x5a4a38, { collide: false }); box(x, z, 14, .25, 12, 0x4d5546, { y: site.y0 + 3.2, collide: false }); }
  // corner watchtowers
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { const x = sx * 405, z = sz * 345; for (const [px, pz] of [[-1.6, -1.6], [1.6, -1.6], [-1.6, 1.6], [1.6, 1.6]]) box(x + px, z + pz, .3, 7, .3, 0x5a4a38, { collide: false }); box(x, z, 4.4, 2.2, 4.4, 0x6b6656, { y: site.y0 + 7 }); box(x, z, 5, .3, 5, 0x55604f, { y: site.y0 + 9.4, collide: false }); }
  // radio mast by the HQ, with its hut
  box(-95, -150, .5, 26, .5, 0x8d9091, { collide: false }); box(-95, -150, 2.4, .3, 2.4, 0x8d9091, { y: site.y0 + 22, collide: false }); box(-88, -150, 4, 2.6, 3, 0x9b9585);
  // loose crates and pallets round the stores
  for (let k = 0; k < 26; k++) { const x = -80 + R() * 70, z = (R() < .5 ? -1 : 1) * (185 + R() * 40), s = .9 + R() * .6; box(x, z, s * 1.2, s, s, R() < .7 ? CRATE : 0x5a6340, { collide: s > 1.2 }); }
}

/* ---------------- the game's own smoke and fire, instanced ----------------
   units.js draws every puff of smoke and every flame as its own THREE.Sprite, a draw call each: one explosion is 20 to 40 of them, and with the
   checkpoint artillery the fighting could reach several hundred draw calls. sprite() is redefined here to put the same particles (same size, growth,
   life, rise, colour and fade) into two instanced meshes, so all of them together cost two draw calls. */
const FXI = { smoke: null, fire: null };
function fxiInit() { if (FXI.smoke) return; FXI.smoke = billboardCloud(5000, SMOKE_TEX, false); FXI.fire = billboardCloud(2500, FIRE_TEX, true); FXI.smoke.mesh.renderOrder = 5; FXI.fire.mesh.renderOrder = 5; scene.add(FXI.smoke.mesh, FXI.fire.mesh); }
sprite = function (pos, size, grow, life, color, fire, vy = 0, opacity = 1) {
  fxiInit(); const c = fire ? FXI.fire : FXI.smoke, col = FXI._c || (FXI._c = new THREE.Color()); col.setHex(color);
  const p = { position: pos.clone(), userData: { t: 0, life, size, grow, vy, op: opacity }, r: col.r, g: col.g, b: col.b };
  if (c.list.length < c.max) c.list.push(p); return p;
};
{ const step = updateFX; updateFX = function (dt) { step(dt); fxiStep(dt); }; }
function fxiStep(dt) {
  if (!FXI.smoke) return; const cam = camera.position;
  for (const c of [FXI.smoke, FXI.fire]) {
    const L = c.list; for (let i = L.length - 1; i >= 0; i--) { const p = L[i], u = p.userData; u.t += dt; if (u.t >= u.life) { L[i] = L[L.length - 1]; L.pop(); continue; } p.position.y += u.vy * dt; }
    if (c === FXI.smoke) L.sort((a, b) => b.position.distanceToSquared(cam) - a.position.distanceToSquared(cam));
    const g = c.mesh.geometry, PS = g.attributes.aPS.array, AS = g.attributes.aAS.array, CO = g.attributes.aCol.array;
    for (let i = 0; i < L.length; i++) { const p = L[i], u = p.userData, f = u.t / u.life;
      PS[i * 4] = p.position.x; PS[i * 4 + 1] = p.position.y; PS[i * 4 + 2] = p.position.z; PS[i * 4 + 3] = u.size + u.grow * f; AS[i * 2] = u.op * (1 - f) * (1 - f * .3); CO[i * 3] = p.r; CO[i * 3 + 1] = p.g; CO[i * 3 + 2] = p.b; }
    g.instanceCount = L.length; g.attributes.aPS.needsUpdate = true; g.attributes.aAS.needsUpdate = true; g.attributes.aCol.needsUpdate = true;
  }
}
