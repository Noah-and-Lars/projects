/* Island Front: battlefield chaos and grit.
   - Automatic artillery: every checkpoint a side holds shells enemies within reach of it every few seconds, landing a little off target, so
     the fighting round the posts is under steady fire. The shells are the howitzers' 155 mm rounds (same damage and whistle), dropped from high above.
   - Craters: every big blast leaves a scorched crater mark that stays until the end of the match.
   - Grit: the terrain colours are washed towards a dry, muddy brown (gritColors for the Optimised map, gritShader for Realistic and Ultra). */
'use strict';
const CHAOS = { cool: new Map(), reach: 4500, every: [6, 11], miss: [14, 48], playerBias: .5 };

function chaosStep(dt) {
  if (!GAME.on || GAME.over || !GAME.cps) return;
  for (const c of GAME.cps) {
    if (c.owner !== 0 && c.owner !== 1) continue;
    const t = (CHAOS.cool.get(c) ?? rand(1, CHAOS.every[1])) - dt; CHAOS.cool.set(c, t); if (t > 0) continue;
    CHAOS.cool.set(c, rand(CHAOS.every[0], CHAOS.every[1]));
    const cx = c.p.x * 1000, cz = c.p.y * 1000, near = e => e.alive && e.team === 1 - c.owner && e.kind !== 'air' && !(e.kind === 'soldier' && e.veh) && Math.hypot(e.pos.x - cx, e.pos.z - cz) < CHAOS.reach;
    const me = PLAYER.s && (PLAYER.s.veh || PLAYER.s);
    let tgt = me && near(me) && Math.random() < CHAOS.playerBias ? me : null;
    if (!tgt) { const list = ENTS.filter(near); if (!list.length) continue; tgt = list[Math.floor(Math.random() * list.length)]; }
    const owner = c.guards.find(g => g.alive) || GAME.guns.find(g => g.alive && g.team === c.owner); if (!owner) continue;
    const a = Math.random() * TAU, r = rand(CHAOS.miss[0], CHAOS.miss[1]), x = tgt.pos.x + Math.cos(a) * r, z = tgt.pos.z + Math.sin(a) * r;
    // dropped from 600 m above, falling at 280 m/s with a slight slant, so it lands in about two seconds
    const from = new V3(x - 60, groundY(x, z) + 600, z - 40), p = launch('he155', owner, c.owner, from, new V3(60, -600, 40), 280);
    p.wk = 'howitzer'; p.whistled = false; p.chaos = true;
  }
}

/* ---------------- craters ---------------- */
const CRATER = { max: 1200, mesh: null, group: null, n: 0 };
function craterTex() { // a shell crater from above: a dark scorched pit, a ring of thrown-up earth, splashes of soil beyond
  const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d'), R = rng(77);
  const gr = g.createRadialGradient(128, 128, 6, 128, 128, 128);
  gr.addColorStop(0, 'rgba(8,7,6,.97)'); gr.addColorStop(.28, 'rgba(18,15,12,.95)'); gr.addColorStop(.42, 'rgba(62,48,34,.92)'); gr.addColorStop(.55, 'rgba(78,62,44,.8)'); gr.addColorStop(.72, 'rgba(40,33,26,.45)'); gr.addColorStop(1, 'rgba(40,33,26,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 140; i++) { const a = R() * TAU, d = 50 + R() * 70, r = 2 + R() * 9; g.fillStyle = `rgba(${45 + R() * 40 | 0},${36 + R() * 30 | 0},${26 + R() * 20 | 0},${.35 + R() * .45})`; g.beginPath(); g.arc(128 + Math.cos(a) * d, 128 + Math.sin(a) * d, r, 0, TAU); g.fill(); } // thrown earth
  for (let i = 0; i < 18; i++) { const a = R() * TAU; g.strokeStyle = `rgba(14,12,10,${.3 + R() * .3})`; g.lineWidth = 2 + R() * 4; g.beginPath(); g.moveTo(128 + Math.cos(a) * 30, 128 + Math.sin(a) * 30); g.lineTo(128 + Math.cos(a) * (70 + R() * 50), 128 + Math.sin(a) * (70 + R() * 50)); g.stroke(); } // scorch streaks
  return new THREE.CanvasTexture(c);
}
/* Each crater is a small 6 x 6 grid laid on the ground point by point (a flat disc would sink out of sight on any slope), all of them in one
   merged mesh: one draw call. On Optimised the heights follow the terrain mesh's own triangles exactly; on Realistic, the fine terrain. */
const CR_N = 6, CR_V = CR_N * CR_N, CR_T = (CR_N - 1) * (CR_N - 1) * 2;
function terrainMeshY(x, z) { // the height of the Optimised terrain mesh itself (its triangles), not the smooth height used by the physics
  if (WORLD.HF) return terrainY(x, z);
  const H = WORLD.M.H, fx = clamp(x / CELL, 0, GW - 1.001), fz = clamp(z / CELL, 0, GH - 1.001), i = fx | 0, j = fz | 0, tx = fx - i, tz = fz - j;
  const a = H[j * GW + i], b = H[j * GW + i + 1], d = H[(j + 1) * GW + i], e = H[(j + 1) * GW + i + 1];
  return tx + tz <= 1 ? a + (b - a) * tx + (d - a) * tz : e + (d - e) * (1 - tx) + (b - e) * (1 - tz);
}
function craterMesh() {
  const max = CRATER.max, g = new THREE.BufferGeometry(), pos = new Float32Array(max * CR_V * 3), uv = new Float32Array(max * CR_V * 2), idx = new Uint32Array(max * CR_T * 3);
  for (let c = 0; c < max; c++) for (let j = 0; j < CR_N - 1; j++) for (let i = 0; i < CR_N - 1; i++) { const o = c * CR_V, a = o + j * CR_N + i, k = (c * CR_T + (j * (CR_N - 1) + i) * 2) * 3; idx.set([a, a + CR_N, a + 1, a + 1, a + CR_N, a + CR_N + 1], k); }
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage)); g.setAttribute('uv', new THREE.BufferAttribute(uv, 2).setUsage(THREE.DynamicDrawUsage));
  g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(max * CR_V * 3).fill(0).map((v, i) => i % 3 === 1 ? 1 : 0), 3));
  g.setIndex(new THREE.BufferAttribute(idx, 1)); g.setDrawRange(0, 0);
  const mat = new THREE.MeshLambertMaterial({ map: CRATER.tex || (CRATER.tex = craterTex()), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -6 });
  const m = new THREE.Mesh(g, mat); m.frustumCulled = false; m.receiveShadow = true; m.renderOrder = 1; m.userData.shared = true; return m;
}
function craterAt(pos, size) {
  if (!WORLD.group) return;
  if (CRATER.group !== WORLD.group) { CRATER.mesh = craterMesh(); WORLD.group.add(CRATER.mesh); CRATER.group = WORLD.group; CRATER.n = 0; } // a new world: start again
  const y = groundY(pos.x, pos.z); if (pos.y - y > Math.max(3, size * .6)) return; // (an air burst leaves no mark)
  const s = clamp(size * 1.6, 3, 60) * rand(.85, 1.2) / 2, rot = Math.random() * TAU, c = Math.cos(rot), sn = Math.sin(rot), i0 = CRATER.n++ % CRATER.max;
  const g = CRATER.mesh.geometry, P = g.attributes.position, U = g.attributes.uv, o = i0 * CR_V;
  for (let j = 0; j < CR_N; j++) for (let i = 0; i < CR_N; i++) {
    const u = i / (CR_N - 1), v = j / (CR_N - 1), lx = (u * 2 - 1) * s, lz = (v * 2 - 1) * s, x = pos.x + lx * c - lz * sn, z = pos.z + lx * sn + lz * c;
    P.setXYZ(o + j * CR_N + i, x, terrainMeshY(x, z) + .07, z); U.setXY(o + j * CR_N + i, u, v);
  }
  P.updateRange = { offset: 0, count: -1 }; U.updateRange = { offset: 0, count: -1 }; P.needsUpdate = true; U.needsUpdate = true;
  g.setDrawRange(0, Math.min(CRATER.n, CRATER.max) * CR_T * 3);
}
{ const boom = explosion; explosion = function (pos, size, water) { boom(pos, size, water); if (!water && size >= 2.5) craterAt(pos, size); }; }

/* ---------------- grit ---------------- */
function gritColors(col) { // the Optimised terrain's vertex colours, washed towards dry brown and darkened a little
  for (let i = 0; i < col.length; i += 3) { const l = col[i] * .299 + col[i + 1] * .587 + col[i + 2] * .114;
    col[i] = (col[i] + (l * 1.1 - col[i]) * .28) * .88; col[i + 1] = (col[i + 1] + (l * 1.0 - col[i + 1]) * .28) * .9; col[i + 2] = (col[i + 2] + (l * .8 - col[i + 2]) * .28) * .86; }
}
const GRIT_GLSL = '{ float gritL = dot(gl_FragColor.rgb, vec3(.299, .587, .114)); gl_FragColor.rgb = mix(gl_FragColor.rgb, gritL * vec3(1.12, 1.0, .8), .42) * .93; }\n';
if (typeof terrainMaterial === 'function') { const tm = terrainMaterial; terrainMaterial = function () { const m = tm.apply(this, arguments), ob = m.onBeforeCompile;
  m.onBeforeCompile = function (sh, r) { if (ob) ob.call(this, sh, r); sh.fragmentShader = sh.fragmentShader.replace('#include <dithering_fragment>', GRIT_GLSL + '#include <dithering_fragment>'); }; return m; }; }
hemi.groundColor.set(0x4a4636); // (the light bounced off the ground: browner)
