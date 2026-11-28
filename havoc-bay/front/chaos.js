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
const CRATER = { max: 700, mesh: null, group: null, n: 0 };
function craterTex() {
  const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d'), gr = g.createRadialGradient(64, 64, 4, 64, 64, 64);
  gr.addColorStop(0, 'rgba(20,17,14,.95)'); gr.addColorStop(.35, 'rgba(38,32,26,.85)'); gr.addColorStop(.62, 'rgba(70,58,44,.55)'); gr.addColorStop(1, 'rgba(70,58,44,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 60; i++) { const a = Math.random() * TAU, d = 20 + Math.random() * 36; g.fillStyle = `rgba(30,25,20,${.15 + Math.random() * .3})`; g.beginPath(); g.arc(64 + Math.cos(a) * d, 64 + Math.sin(a) * d, 1 + Math.random() * 4, 0, TAU); g.fill(); } // thrown earth
  const t = new THREE.CanvasTexture(c); return t;
}
function craterAt(pos, size) {
  if (!WORLD.group) return;
  if (CRATER.group !== WORLD.group) { // a new world: start again
    const geo = new THREE.PlaneGeometry(1, 1); geo.rotateX(-Math.PI / 2);
    const mat = new THREE.MeshLambertMaterial({ map: CRATER.tex || (CRATER.tex = craterTex()), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
    CRATER.mesh = new THREE.InstancedMesh(geo, mat, CRATER.max); CRATER.mesh.count = 0; CRATER.mesh.frustumCulled = false; CRATER.mesh.receiveShadow = true; CRATER.mesh.renderOrder = 1;
    CRATER.mesh.userData.shared = true; WORLD.group.add(CRATER.mesh); CRATER.group = WORLD.group; CRATER.n = 0;
  }
  const y = groundY(pos.x, pos.z); if (pos.y - y > Math.max(3, size * .6)) return; // (an air burst leaves no mark)
  const s = clamp(size * 1.1, 2.2, 15) * rand(.85, 1.2), m = new THREE.Matrix4().compose(new V3(pos.x, y + .06, pos.z), new THREE.Quaternion().setFromAxisAngle(new V3(0, 1, 0), Math.random() * TAU), new V3(s, 1, s));
  const i = CRATER.n++ % CRATER.max; CRATER.mesh.setMatrixAt(i, m); CRATER.mesh.count = Math.min(CRATER.n, CRATER.max); CRATER.mesh.instanceMatrix.needsUpdate = true;
}
{ const boom = explosion; explosion = function (pos, size, water) { boom(pos, size, water); if (!water && size >= 2.5) craterAt(pos, size); }; }

/* ---------------- grit ---------------- */
function gritColors(col) { // the Optimised terrain's vertex colours, washed towards dry brown and darkened a little
  for (let i = 0; i < col.length; i += 3) { const l = col[i] * .299 + col[i + 1] * .587 + col[i + 2] * .114;
    col[i] = (col[i] + (l * 1.12 - col[i]) * .45) * .9; col[i + 1] = (col[i + 1] + (l * 1.0 - col[i + 1]) * .45) * .9; col[i + 2] = (col[i + 2] + (l * .8 - col[i + 2]) * .45) * .9; }
}
const GRIT_GLSL = '{ float gl_l = dot(gl_FragColor.rgb, vec3(.299, .587, .114)); gl_FragColor.rgb = mix(gl_FragColor.rgb, gl_l * vec3(1.12, 1.0, .8), .42) * .93; }\n';
if (typeof terrainMaterial === 'function') { const tm = terrainMaterial; terrainMaterial = function () { const m = tm.apply(this, arguments), ob = m.onBeforeCompile;
  m.onBeforeCompile = function (sh, r) { if (ob) ob.call(this, sh, r); sh.fragmentShader = sh.fragmentShader.replace('#include <dithering_fragment>', GRIT_GLSL + '#include <dithering_fragment>'); }; return m; }; }
hemi.groundColor.set(0x4a4636); // (the light bounced off the ground: browner)
