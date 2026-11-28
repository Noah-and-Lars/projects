/* Island Front: match rules, checkpoints, guards, howitzers, bots, player control, camera, HUD and menus. */
'use strict';
const $ = id => document.getElementById(id);
const HIT_CHANCE = 1 / 6.5;      // howitzer shells that land on target
const HOW_RANGE = 6000, HOW_COOL = [10, 14];
const MATCH_S = 30 * 60;
const DIFF = [{ aim: .03, guard: .55, react: 1.1 }, { aim: .018, guard: .85, react: .75 }, { aim: .01, guard: 1.15, react: .5 }];
const BOT_NAMES = ['Viper', 'Hollis', 'Raptor', 'Kestrel', 'Boone', 'Mako', 'Drift', 'Saber', 'Tundra', 'Lark', 'Rook', 'Hatch', 'Quill', 'Brigg', 'Onyx', 'Fable', 'Cobalt', 'Wren', 'Torque', 'Ash', 'Sully', 'Pike', 'Gale', 'Juno'];
const GAME = { on: false, over: false, paused: false, time: 0, map: 0, team: 0, bots: 8, diff: 1, M: null, cps: [], guns: [], botsList: [], winner: -1, deployT: 0, sel: { cls: 'mbt', where: -1 } };
const PLAYER = { s: null, kills: 0, deaths: 0, caps: 0, dmg: 0, sp: 0 };
/* spawn points: earned on the ground, spent on bigger kit. Only ground units can take checkpoints, so the air can't win alone. */
const SP_START = 150, SP_COST = { inf: 0, jeep: 0, ifv: 50, mbt: 150, heli: 400, jet: 500 };
const SP_AWARD = { soldier: 60, guard: 50, jeep: 80, ifv: 150, mbt: 200, gun: 120, capture: 150 };
function awardSP(by, n, why) {
  if (!by || n <= 0) return;
  if (by.isPlayer) { PLAYER.sp += n; spPop(`+${n} ${why}`); }
  else if (by.bot) by.bot.sp = (by.bot.sp || 0) + n;
}
function spPop(t) { const el = $('vehMsg'); if (!el) return; const d = document.createElement('div'); d.className = 'sppop'; d.textContent = t; $('hud').appendChild(d); setTimeout(() => d.remove(), 1600); }
const CAM = { yaw: 0, pitch: -.05, zoom: false, shake: 0, pos: new V3(), aim: new V3(), aimEnt: null };
const KEYS = {}, MOUSE = { l: false, r: false };
let locked = false;
const _v = new V3(), _w = new V3(), _q = new THREE.Quaternion(), _m4 = new THREE.Matrix4();
const angDiff = (a, b) => { let d = (b - a) % TAU; if (d > Math.PI) d -= TAU; if (d < -Math.PI) d += TAU; return d; };
const turnTo = (a, b, max) => a + clamp(angDiff(a, b), -max, max);

/* ---------------- match setup ---------------- */
function startMatch(mapIdx, team, bots, diff) {
  Object.assign(GAME, { on: true, over: false, paused: false, time: 0, map: mapIdx, team, bots, diff, winner: -1 });
  clearMatch();
  const M = GAME.M = MAPS[mapIdx];
  if (!M.H) buildMap(M);
  // Ultra is the Realistic world under better light: everything that asks "realistic?" says yes for both
  WORLD.gfx = GAME.gfx === 'ultra' ? 'realistic' : GAME.gfx; applyLook(WORLD.gfx === 'realistic', GAME.gfx === 'ultra');
  buildWorld(M); if (typeof ultraWorld === 'function') ultraWorld();
  M.img = M.img || mapImage(M);
  GAME.cps = M._cps.map((p, i) => ({ p, i, owner: -1, val: 0, guards: [], inside: [0, 0] }));
  for (const c of GAME.cps) for (let k = 0; k < c.p.posts.length; k++) {
    let post = c.p.posts[k]; const g = new Soldier(2, { npc: true, name: 'Guard' });
    if (!post.tower) { _v.set(post.x, 0, post.z); if (pushOutCircle(_v, .8, post.y + .3, post.y + 1.7)) post = Object.assign({}, post, { x: _v.x, z: _v.z, y: groundY(_v.x, _v.z) }); } // a post that a building was put on top of: stand beside it instead (nobody could see or shoot a guard inside the wall)
    g.pos.set(post.x, post.y, post.z); g.post = post; g.cp = c.i; g.yaw = c.p.ang + (Math.random() - .5) * 3; g.rpgGuard = c.p.size !== 'S' && k % 5 === 4; g.ai = { t: Math.random(), target: null, burst: 0, shotT: 0, rpgT: 4 + Math.random() * 6 };
    c.guards.push(g);
  }
  GAME.guns = [];
  M.bases.forEach((b, t) => b.gunSpots.forEach(([x, z]) => { const h = new Howitzer(t, x, z, groundY(x, z), b.ang); h.home = [x, z]; GAME.guns.push(h); }));
  GAME.botsList = [];
  let n = 0;
  for (const t of [0, 1]) for (let k = 0; k < bots - (t === team ? 1 : 0); k++) GAME.botsList.push({ team: t, name: BOT_NAMES[n++ % BOT_NAMES.length], unit: null, soldier: null, respawn: 1 + k * 1.5, lane: (k % 5 - 2) * 7, ai: {}, sp: SP_START, skill: botSkill() });
  PLAYER.s = null; PLAYER.kills = PLAYER.deaths = PLAYER.caps = 0; PLAYER.sp = SP_START;
  const b = M.bases[team]; CAM.yaw = b.ang; CAM.pitch = -.1;
  CAM.pos.set(b.x * 1000, b.zone.y0 + 40, b.y * 1000);
  $('hud').classList.remove('hidden');
  renderCpBar();
  openDeploy('start');
}
function clearMatch() {
  for (const e of ENTS.slice()) removeEnt(e);
  if (typeof debrisClear === 'function') debrisClear();
  for (const p of PROJS) if (p.m) scene.remove(p.m); PROJS.length = 0;
  for (const s of FX.sprites) scene.remove(s); FX.sprites.length = 0;
  $('feed').innerHTML = '';
  if (typeof SMOKES !== 'undefined') SMOKES.length = 0; if (typeof THERMAL !== 'undefined') THERMAL.want = false; GAME.deaths = {}; // nothing carries over into the next match
}

/* ---------------- spawning ---------------- */
function spawnSpot(team, where) { // where: -1 = base, else checkpoint index
  const M = GAME.M;
  if (where >= 0) { const c = GAME.cps[where], s = c.p.site, a = Math.random() * TAU; const [x, z] = s.w(Math.cos(a) * 25, Math.sin(a) * 15 + 30 * (Math.random() < .5 ? -1 : 1)); return [x, z]; }
  const [x, z] = M.bases[team].infSpawn; return [x + rand(-20, 20), z + rand(-20, 20)];
}
function vehicleSpot(team) {
  const b = GAME.M.bases[team], [x0, z0] = b.vehicleSpawn;
  for (let k = 0; k < 30; k++) {
    const x = x0 + (k % 6 - 2.5) * 12, z = z0 + Math.floor(k / 6) * 14 * (team ? -1 : 1);
    if (!ENTS.some(e => e.kind === 'vehicle' && e.alive && Math.hypot(e.pos.x - x, e.pos.z - z) < 9)) return [x, z];
  }
  return [x0 + rand(-30, 30), z0 + rand(-30, 30)];
}
function makeVehicle(cls, team) { const v = new Vehicle(TEAM_VEH[team][cls] || cls, team), [x, z] = vehicleSpot(team); v.pos.set(x, groundY(x, z), z); v.yaw = GAME.M.bases[team].ang; placeVehicle(v, 1); updateRunningGear(v, 0, true); return v; }
function canSpawnAt(team, i) { const c = GAME.cps[i]; return c && c.owner === team && c.inside[1 - team] === 0; }
function frontCp(team) { // the owned checkpoint nearest the enemy
  let best = -1;
  if (team === 0) { for (let i = 0; i < 5; i++) if (canSpawnAt(0, i)) best = i; }
  else { for (let i = 4; i >= 0; i--) if (canSpawnAt(1, i)) best = i; }
  return best;
}
function deployPlayer(cls, where) {
  const team = GAME.team;
  const s = new Soldier(team, { player: true, name: 'You' }); PLAYER.s = s;
  const cost = SP_COST[cls] || 0; PLAYER.sp = Math.max(0, PLAYER.sp - cost);
  if (cls === 'inf') {
    const [x, z] = spawnSpot(team, where); s.pos.set(x, groundY(x, z) + .1, z); s.yaw = CAM.yaw = GAME.M.bases[team].ang;
  } else if (cls === 'jet' || cls === 'heli') {
    const a = airSpawn(cls, team); enterVehicle(s, a); CAM.yaw = a.hdg; CAM.pitch = cls === 'jet' ? .02 : -.08;
    showMsg(cls === 'jet' ? 'Take off: full throttle, look up past 250 km/h' : 'Hold Space to raise the collective and lift off', cls === 'jet' ? 'The jet follows your aim. Land on your runway to rearm and refuel.' : 'The nose follows your aim: look down to fly forward. Land at your base to rearm.');
  } else {
    const v = makeVehicle(cls, team); enterVehicle(s, v); CAM.yaw = v.yaw;
  }
  if (!(cls === 'jet' || cls === 'heli')) CAM.pitch = -.05;
  $('deploy').classList.add('hidden'); GAME.deploying = false;
  if (!(cls === 'jet' || cls === 'heli')) showMsg(GAME.time < 2 ? 'Take the checkpoints' : 'Deployed', GAME.time < 2 ? 'Clear each checkpoint\'s guards, then stand inside it. Start with the one nearest your base.' : '');
  requestLock();
}
function enterVehicle(s, v) { s.veh = v; v.driver = s; s.model.root.visible = false; s.pos.copy(v.pos); }
function exitVehicle(s) {
  const v = s.veh; if (!v) return;
  const side = _v.set(-Math.sin(v.yaw), 0, Math.cos(v.yaw));
  for (const sd of [1, -1, 0]) {
    const x = v.pos.x + side.x * sd * (v.def.wid / 2 + 1.2) - (sd ? 0 : Math.cos(v.yaw) * (v.def.len / 2 + 1.5)), z = v.pos.z + side.z * sd * (v.def.wid / 2 + 1.2) - (sd ? 0 : Math.sin(v.yaw) * (v.def.len / 2 + 1.5));
    if (terrainY(x, z) > -.8 || bridgeAt(x, z, v.pos.y + 1) !== null) { s.pos.set(x, groundY(x, z, v.pos.y + 1) + .2, z); break; }
  }
  s.veh = null; v.driver = null; s.model.root.visible = true; s.vel.set(0, 0, 0); s.yaw = s.isPlayer ? CAM.yaw : v.yaw; v.emptyT = 0; v.emptyBy = s.isPlayer ? 'player' : 'bot';
}

/* ---------------- damage and death ---------------- */
function creditOf(src) { return !src ? null : src.kind === 'vehicle' || src.kind === 'air' ? src.driver : src; }
function damage(e, amt, src, wk) {
  if (!e.alive || amt <= 0 || e.kind === 'vehicle' || e.kind === 'air') return; // vehicles take damage through their armour (vehicles.js), aircraft part by part (aircraft.js)
  const srcTeam = src ? src.team : -1;
  if (src && srcTeam === e.team && creditOf(src) !== e) return; // no friendly fire
  if (e === PLAYER.s) flashDamage();
  e.hp -= amt; e.lastHurt = GAME.time; e.lastAttacker = src;
  const by = creditOf(src);
  if (by && by.isPlayer && e.team !== GAME.team) { PLAYER.dmg += amt; hitMarker(e.hp <= 0); }
  if (e.npc) alertGuards(e, src);
  if (e.bot && src) { e.bot.ai.threat = src; e.bot.ai.threatT = GAME.time; }
  if (e.hp <= 0) kill(e, src, wk);
}
function logDeath(e, by, wk) { const key = (e.kind === 'vehicle' ? e.type : e.npc ? 'guard' : e.kind) + '<' + (wk || '?') + (by && by.team === 2 ? '(guard)' : ''); GAME.deaths = GAME.deaths || {}; GAME.deaths[key] = (GAME.deaths[key] || 0) + 1; }
function kill(e, src, wk) {
  e.alive = false; e.dead = 0;
  const by = creditOf(src);
  if (by && by.isPlayer && e.team !== GAME.team && e !== PLAYER.s) PLAYER.kills++;
  if (by && by.team !== e.team && by !== e) awardSP(by, e.kind === 'gun' ? SP_AWARD.gun : e.npc ? SP_AWARD.guard : SP_AWARD.soldier, e.kind === 'gun' ? 'howitzer' : 'kill');
  addFeed(by, e, wk); logDeath(e, by, wk);
  if (e.kind === 'soldier') onSoldierDead(e);
  else if (e.kind === 'gun') { explosion(_v.copy(e.pos).setY(e.pos.y + 1), 6); e.model.root.traverse(o => { if (o.isMesh) o.material = mat(0x262422); }); e.respawnT = 120; }
}
const CHAR = new THREE.MeshStandardMaterial({ color: 0x1e1c1a, roughness: 1, metalness: .1 });
function destroyVehicle(v, src, wk, how, toss) { // called by the damage model (vehicles.js)
  if (!v.alive) return;
  v.alive = false; v.how = how;
  const by = creditOf(src);
  if (by && by.isPlayer && v.team !== GAME.team) { PLAYER.kills++; hitInfo(how === 'ammo detonation' ? 'AMMO DETONATION · TARGET DESTROYED' : 'TARGET DESTROYED', '#ff8a6a'); }
  logDeath(v, by, wk);
  if (by && by.team !== v.team) awardSP(by, SP_AWARD[v.cls] || 100, 'vehicle');
  const big = how === 'ammo detonation';
  explosion(_v.copy(v.pos).setY(v.pos.y + 1.8), big ? 14 : 6); Sound.at(big ? 'bigboom' : 'boom', v.pos);
  v.model.root.traverse(o => { if (o.isMesh && !o.isInstancedMesh) o.material = CHAR; });
  if (toss) v.turretFly = { vel: new V3(rand(-3, 3), rand(14, 20), rand(-3, 3)), spin: new V3(rand(-2, 2), rand(-1, 1), rand(-2, 2)), t: 0 };
  v.burnT = 45; v.fire = 0;
  if (v.driver) { const d = v.driver; d.alive = false; d.hp = 0; addFeed(by, d, wk); onSoldierDead(d); }
  if (v.driver && v.driver.isPlayer) showMsg('Your vehicle was destroyed', how);
}
function onSoldierDead(s) {
  s.dead = 0;
  if (s.isPlayer) { PLAYER.deaths++; GAME.deployT = 6; Sound.engine(false, 0); if (s.veh) { s.veh.driver = null; } s.veh = null; const t0 = GAME.time; // (a wreck still falling is followed down: the deploy screen waits until it has hit the ground and come to rest, or 14 s)
    const go = () => { if (!(GAME.on && !GAME.over && PLAYER.s === s)) return; const w = PLAYER.wreck && PLAYER.wreckT >= t0 - .1 ? PLAYER.wreck.wreck : null; if (w && (!w.landed || GAME.time - (w.restT ?? GAME.time) < 2.5) && GAME.time - t0 < 14) { if (w.landed && w.restT === undefined) w.restT = GAME.time; setTimeout(go, 400); } else openDeploy('dead'); };
    setTimeout(go, 2500); }
  if (s.bot) s.bot.respawn = 8 + Math.random() * 5;
}
function alertGuards(g, src) {
  const by = creditOf(src) || src; if (!by || !by.alive) return;
  const c = GAME.cps[g.cp]; if (!c) return;
  for (const o of c.guards) if (o.alive && !o.ai.target && o.pos.distanceTo(g.pos) < 160) { o.ai.target = by.veh || by; o.ai.t = Math.random() * .5; }
}
// what the player sees when their round lands (and when they get hit)
function hitReport(owner, target, res) {
  const by = creditOf(owner), mine = by && by.isPlayer, me = target.driver && target.driver.isPlayer;
  const mods = [...new Set(res.modules || [])].map(m => MOD_NAME[m] || m), list = mods.length ? ' · ' + mods.slice(0, 3).join(', ') : '';
  if (mine && target.team !== GAME.team) {
    const col = res.pen ? '#ffd27a' : res.rico ? '#9ecbff' : '#c9c9c9';
    if (!res.destroyed && !res.detonate) hitInfo(`${res.text.toUpperCase()}${res.eff && !res.pen ? ` · ${res.eff} mm` : ''}${list}`, col);
    if (res.pen || mods.length) hitMarker(false);
  }
  if (me) { flashDamage(); if (res.pen || mods.length) playerVehMsg(`Hit: ${res.text.toLowerCase()}${list}`); else playerVehMsg(res.rico ? 'A round bounced off' : 'Hit, no penetration'); }
  const tb = target.bot || (target.driver && target.driver.bot); // (a vehicle's bot is its driver's)
  if (tb && tb.ai && owner) { tb.ai.threat = creditOf(owner) ? (creditOf(owner).veh || creditOf(owner)) : owner; tb.ai.threatT = GAME.time; }
}

/* ---------------- vehicles ---------------- */
const _n = new V3(), _f = new V3();
function placeVehicle(v, dt) {
  const D = v.def, c = Math.cos(v.yaw), s = Math.sin(v.yaw), L = D.len * .42, Wd = D.wid * .42;
  const foot = v.pos.y;
  const hF = groundY(v.pos.x + c * L, v.pos.z + s * L, foot), hB = groundY(v.pos.x - c * L, v.pos.z - s * L, foot);
  const hR = groundY(v.pos.x - s * Wd, v.pos.z + c * Wd, foot), hL = groundY(v.pos.x + s * Wd, v.pos.z - c * Wd, foot);
  v.pos.y = Math.max((hF + hB + hR + hL) / 4, groundY(v.pos.x, v.pos.z, foot));
  // suspension: the hull squats when accelerating, dives when braking, leans in turns
  v.kickV = (v.kickV || 0) + ((-(v.accel || 0) * .012 - (v.kick || 0)) * 60 - (v.kickV || 0) * 9) * dt; v.kick = (v.kick || 0) + v.kickV * dt;
  const lean = clamp((v.turnRate || 0) * (v.speed || 0) * .006, -.06, .06);
  const pitch = Math.atan2(hF - hB, 2 * L) - (v.kick || 0), roll = Math.atan2(hR - hL, 2 * Wd) + lean;
  _q.setFromEuler(new THREE.Euler(-roll, -v.yaw, pitch, 'YXZ'));
  v.quat.slerp(_q, clamp(dt * 8, 0, 1));
  v.model.root.position.copy(v.pos); v.model.root.quaternion.copy(v.quat);
  v.model.turret.rotation.y = -v.tYaw; v.model.gun.rotation.z = v.gPitch;
}
function driveVehicle(v, inp, dt) {
  const D = v.def, st = vState(v), c = Math.cos(v.yaw), s = Math.sin(v.yaw), m = D.mass * 1000;
  crewStep(v, dt); if (!v.alive) return;
  // terrain: rolling resistance, slope
  const road = onRoad(v.pos.x, v.pos.z), forest = inForest(v.pos.x, v.pos.z);
  const crr = road === 2 ? .02 : road ? .035 : (D.wheeled ? .085 : .055) + (forest ? .06 : 0);
  const hA = groundY(v.pos.x + c * 4, v.pos.z + s * 4, v.pos.y), hB = groundY(v.pos.x - c * 4, v.pos.z - s * 4, v.pos.y), grade = (hA - hB) / 8;
  const thr = st.drive ? inp.throttle : 0, steer = st.drive ? inp.steer : 0;
  const P = D.kw * 1000 * .42 * st.power, Ft = m * 9.8 * (D.wheeled ? .6 : .72), spd = v.speed;
  let F = 0;
  if (thr > 0) F = spd < -.4 ? m * 6 : Math.min(Ft, thr * P / Math.max(Math.abs(spd), 2.2));
  else if (thr < 0) F = spd > .4 ? -m * 6 : -Math.min(Ft, -thr * P / Math.max(Math.abs(spd), 1.6));
  else F = -Math.sign(spd) * Math.min(m * 1.4, Math.abs(spd) * m * 2); // engine braking
  let a = F / m - 9.8 * grade / Math.sqrt(1 + grade * grade);
  const roll = crr * 9.8 * dt; // rolling resistance never reverses the motion
  let ns = spd + a * dt; ns = Math.abs(ns) <= roll ? 0 : ns - Math.sign(ns) * roll;
  if (!thr && Math.abs(grade) < .5 && Math.abs(ns) < .3) ns = 0; // brakes hold it on a slope
  const top = D.vmax * (road ? 1 : D.wheeled ? .7 : .82) * (forest ? .7 : 1);
  ns = clamp(ns, -D.vrev, top);
  v.accel = (ns - spd) / Math.max(dt, 1e-4); v.speed = ns;
  // turning: tracks can pivot in place; wheels need speed
  if (D.wheeled) { v.steerIn = (v.steerIn || 0) + (steer - (v.steerIn || 0)) * clamp(dt * 5, 0, 1); v.turnRate = v.speed * Math.tan(v.steerIn * D.steer) / (D.len * .62); const grip = 7.5 / Math.max(Math.abs(v.speed), 1); v.turnRate = clamp(v.turnRate, -grip, grip); } // tyres hold about 0.75 g sideways: no hairpins at speed
  else { const want = steer * D.pivot * (1 - .45 * Math.min(Math.abs(v.speed) / D.vmax, 1)) * (st.power > 0 ? 1 : 0); v.turnRate = (v.turnRate || 0) + (want - (v.turnRate || 0)) * clamp(dt * 4, 0, 1); }
  v.yaw += v.turnRate * dt;
  const nx = v.pos.x + Math.cos(v.yaw) * v.speed * dt, nz = v.pos.z + Math.sin(v.yaw) * v.speed * dt;
  const ny = groundY(nx, nz, v.pos.y), steep = (ny - v.pos.y) / Math.max(.01, Math.abs(v.speed * dt)) > 1.0 && ny > v.pos.y + .35;
  const deep = ny < -D.ford && groundY(v.pos.x, v.pos.z, v.pos.y) >= ny - .01;
  if (steep || deep) v.speed *= -.15; else { v.pos.x = nx; v.pos.z = nz; }
  v.pos.x = clamp(v.pos.x, 60, WORLD_W - 60); v.pos.z = clamp(v.pos.z, 60, WORLD_H - 60);
  // walls and buildings: three circles along the hull
  const r = D.wid * .5, off = D.len / 2 - r;
  let bumped = false;
  for (const k of [-1, 0, 1]) {
    _v.set(v.pos.x + Math.cos(v.yaw) * off * k, 0, v.pos.z + Math.sin(v.yaw) * off * k); const ox = _v.x, oz = _v.z;
    if (pushOutCircle(_v, r, v.pos.y + .3, v.pos.y + D.hgt)) { v.pos.x += _v.x - ox; v.pos.z += _v.z - oz; bumped = true; }
  }
  if (bumped) v.speed *= Math.pow(.05, dt);
  for (const e of ENTS) {
    if (e === v || !e.alive && e.kind !== 'vehicle') continue;
    if (e.kind === 'vehicle' || e.kind === 'gun') {
      const R = (D.len + (e.def ? e.def.len : 6)) * .33, dx = e.pos.x - v.pos.x, dz = e.pos.z - v.pos.z, d = Math.hypot(dx, dz);
      if (d < R && d > .01) { const share = e.kind === 'vehicle' && e.alive ? e.def.mass / (e.def.mass + D.mass) : 1, p = (R - d); v.pos.x -= dx / d * p * share; v.pos.z -= dz / d * p * share; if (e.kind === 'vehicle' && e.alive) { e.pos.x += dx / d * p * (1 - share); e.pos.z += dz / d * p * (1 - share); } v.speed *= .9; }
    } else if (e.kind === 'soldier' && !e.veh) {
      const dx = e.pos.x - v.pos.x, dz = e.pos.z - v.pos.z, d = Math.hypot(dx, dz);
      if (d < D.len * .45 && Math.abs(e.pos.y - v.pos.y) < 2.5) {
        if (Math.abs(v.speed) > 4 && hostile(v.team, e.team)) damage(e, 250, v, 'roadkill');
        else if (d > .01) { e.pos.x += dx / d * .5; e.pos.z += dz / d * .5; }
      }
    }
  }
  // turret and gun (no gunner: nobody turns it)
  const trav = st.fire || st.optics ? D.turret * st.traverse : 0;
  v.tYaw = turnTo(v.tYaw, angDiff(v.yaw, inp.aimYaw), (st.crew && v.roles.gunner && v.roles.gunner.hp > 0 ? trav : 0) * dt);
  const sway = !st.fcs && D.cls !== 'jeep' ? Math.min(1, Math.abs(v.speed) / 8) : 0; // no stabiliser: the gun rides the hull's bumps
  v.gPitch += clamp(clamp(inp.aimPitch + Math.sin(GAME.time * 6.3 + v.pos.x) * .012 * sway, D.elev[0], D.elev[1]) - v.gPitch, -.35 * dt, .35 * dt) * st.elevate;
  if (sway > 0) v.tYaw += Math.sin(GAME.time * 4.1 + v.pos.z) * .004 * sway * dt * 8;
  placeVehicle(v, dt);
  const near = Math.abs(v.pos.x - camera.position.x) + Math.abs(v.pos.z - camera.position.z) < 260;
  updateRunningGear(v, near ? dt : 0, false);
  if (v.model.gltf && near) { const d = v.speed * dt; if (v.model.spin) for (const w of v.model.spin) w.pivot.rotation.z -= d / w.r; if (v.model.tracks) for (const t of v.model.tracks) { t.mat.map.offset.x += d * t.du; t.mat.map.offset.y += d * t.dv; if (t.mat.normalMap) t.mat.normalMap.offset.copy(t.mat.map.offset); } } // a downloaded model's own wheels turn and its track texture runs
  if (v.model.gunX === undefined) v.model.gunX = v.model.gun.position.x;
  if (v.recoil > 0) { v.recoil = Math.max(0, v.recoil - dt * 2.5); v.model.gun.position.x = v.model.gunX - Math.sin(v.recoil * Math.PI) * (D.cls === 'mbt' ? .45 : .12); }
  // exhaust: a dark puff when the engine works hard
  if (st.power > 0 && (v.exT = (v.exT || 0) - dt) <= 0) { const hard = Math.abs(thr) > 0 && Math.abs(v.accel) > .3; v.exT = hard ? .12 : .6; const ex = _v.set(v.pos.x - c * D.len * .5, v.pos.y + (D.wheeled ? .6 : 1.3), v.pos.z - s * D.len * .5); sprite(ex, hard ? 1.1 : .6, hard ? 3.5 : 2, hard ? 1.6 : 1.1, D.kw > 1000 ? 0x8a8478 : 0x3a3632, false, 1.2, hard ? .5 : .25); }
  // dust off the tracks
  if (Math.abs(v.speed) > 3.5 && road !== 2 && (v.dustT = (v.dustT || 0) - dt) <= 0) { v.dustT = .09; for (const sd of [-1, 1]) sprite(_v.set(v.pos.x - c * D.len * .45 - s * sd * D.wid * .4, v.pos.y + .4, v.pos.z - s * D.len * .45 + c * sd * D.wid * .4), 1.6 + Math.abs(v.speed) * .08, 4, 2.2, 0xa8977a, false, .8, .45); }
  if (!v.def.wheeled && vState(v).crew > 0 && (v.mod('engine') ? v.mod('engine').hp < v.mod('engine').max * .5 : false) && Math.random() < dt * 3) sprite(_v.copy(v.pos).setY(v.pos.y + D.hgt), 1.4, 4, 2.5, 0x3a3836, false, 3, .7);
  // guns
  v.cool -= dt; v.cool2 -= dt; v.smokeT -= dt;
  if (D.reload && v.loaded === null) {
    if (v.load && v.load[v.sel] <= 0) { const other = D.ammo.find(k => v.load[k] > 0); if (other) { v.sel = other; vMsg(v, `Out of ${AMMO[v.loading || v.sel].name}: loading ${AMMO[other].name}`); } } // out of that type: load what is left
    const have = !v.load || v.load[v.sel] > 0;
    if (have && st.loader) { if (v.loading !== v.sel) { v.loading = v.sel; v.reload = reloadTime(v); v.reloadOf = v.reload; } v.reload -= dt;
      if (v.reload <= 0) { v.loaded = v.sel; v.loading = null; v.reload = 0; if (v.load) v.load[v.sel]--; if (v.rackN > 0) v.rackN--; } }
  }
  if (D.atgm && v.atgmReady < D.atgmN && v.atgmLoad > 0) { v.atgmT -= dt; if (v.atgmT <= 0) { v.atgmReady++; v.atgmLoad--; v.atgmT = D.atgmReload; } }
  if (inp.fire && st.fire) fireMain(v);
  if (inp.fire2 && D.mg && st.fire && v.cool2 <= 0) fireMG(v);
  if (inp.fire3 && D.atgm && st.fire && v.atgmReady > 0 && v.cool <= 0) fireATGM(v, inp.guide);
  if (inp.smoke && v.smoke > 0 && v.smokeT <= 0) popSmoke(v);
  if (inp.ess && D.ess && v.ess > 0 && v.essT <= 0 && st.power > 0) { v.ess--; v.essT = 9; vMsg(v, 'Engine smoke'); }
}
function friendlyPoint(v) { // on a checkpoint this side holds, or at its base: repairs are complete and stores are topped up
  const M = GAME.M, b = M.bases[v.team]; if (b && Math.hypot(v.pos.x - b.x * 1000, v.pos.z - b.y * 1000) < 480) return true;
  return GAME.cps.some(c => c.owner === v.team && inZone(c, v.pos));
}
function essPuff(v, dt) { // engine smoke: fuel sprayed into the exhaust lays a screen behind the vehicle
  if ((v.essP = (v.essP || 0) - dt) > 0) return; v.essP = .35;
  const c = Math.cos(v.yaw), s = Math.sin(v.yaw), x = v.pos.x - c * (v.def.len * .5 + 2), z = v.pos.z - s * (v.def.len * .5 + 2), y = groundY(x, z) + 2.5;
  SMOKES.push({ pos: new V3(x, y, z), r: 7, t: 0, life: 22 });
  for (let i = 0; i < 3; i++) sprite(new V3(x + rand(-2, 2), y + rand(-1, 2.5), z + rand(-2, 2)), 5, 9, 20 + Math.random() * 4, 0xdcdcd6, false, .2, .9);
}
function selectAmmo(v, key) {
  if (!v.def.ammo.includes(key) || v.sel === key) return;
  v.sel = key;
  if (v.def.reload && v.loaded && v.loaded !== key && (!v.load || v.load[key] > 0)) { if (v.load) v.load[v.loaded]++; v.loaded = null; v.loading = null; } // unload (the round goes back in the rack) and load the new type
  else if (v.def.reload && !v.loaded) v.loading = null; // changed our mind mid-load: start again with the new type
}
function muzzleOf(v, out, dir) {
  v.model.root.updateMatrixWorld(true);
  out.set(v.model.muzzle, 0, 0).applyMatrix4(v.model.gun.matrixWorld);
  dir.set(1, 0, 0).transformDirection(v.model.gun.matrixWorld);
}
function fireMain(v) {
  const D = v.def, from = new V3(), dir = new V3(); muzzleOf(v, from, dir);
  let key;
  if (D.reload) { if (!v.loaded || v.cool > 0) return;
    const br = v.mod('breech'), bar = v.mod('barrel');
    if (br && br.hp < br.max * .5 && Math.random() < .25) { v.cool = 1.5; vMsg(v, 'Misfire: the breech is damaged'); Sound.at('pop', v.pos, .5); return; } // a damaged breech does not always fire
    key = v.loaded; v.loaded = null; v.loading = null;
    if (bar && bar.hp < bar.max * .5 && Math.random() < .3) { bar.hp = 0; vMsg(v, 'The damaged barrel burst'); } } // firing through a damaged barrel can finish it
  else { if (v.cool > 0) return; key = v.sel; if (v.load) { if (v.load[key] <= 0) { const other = D.ammo.find(k => v.load[k] > 0); if (!other) return; key = v.sel = other; } v.load[key]--; } v.cool = AMMO[key].rate || .2; }
  const A = AMMO[key];
  if (A.kind === 'bullet') { hitscan(key, v, v.team, from, dir, A.spread); Sound.at('mg', from, .9); sprite(from, .5, .3, .05, 0xffffff, true); return; }
  launch(key, v, v.team, from, dir);
  if (D.reload) { // a tank gun: big flash, a smoke ring and dust thrown off the ground
    v.recoil = 1; Sound.at('cannon', from);
    sprite(from.clone().addScaledVector(dir, 1.2), 3.2, 2, .09, 0xffffff, true); sprite(from.clone().addScaledVector(dir, 3), 2.2, 1.5, .07, 0xffe0a0, true);
    for (let i = 0; i < 7; i++) sprite(from.clone().addScaledVector(dir, i * .9 + rand(-.3, .3)), 1.8 + i * .2, 6, 2 + Math.random(), 0xd6d0c2, false, .5, .65);
    for (let i = 0; i < 10; i++) { const a = i / 10 * TAU; sprite(_v.set(from.x + Math.cos(a) * 3, groundY(from.x, from.z) + .6, from.z + Math.sin(a) * 3), 2.5, 5, 1.8, 0xb09c7c, false, .4, .55); }
    if (v.driver && v.driver.isPlayer) CAM.shake = Math.max(CAM.shake, .45);
  } else { Sound.at('auto', from); sprite(from, .9, .3, .05, 0xffffff, true); }
}
function fireMG(v) {
  const A = AMMO[v.def.mg], from = new V3(), dir = new V3(); muzzleOf(v, from, dir);
  from.addScaledVector(dir, -v.model.muzzle * .6); v.cool2 = A.rate;
  hitscan(v.def.mg, v, v.team, from, dir, A.spread); Sound.at('mg', from, .8);
}
function fireATGM(v, guide) {
  const D = v.def, from = new V3(), dir = new V3(); muzzleOf(v, from, dir);
  const lm = v.model.tow || v.model.atgm; if (lm) { lm.updateMatrixWorld(true); from.set(1.2, 0, 0).applyMatrix4(lm.matrixWorld); }
  v.atgmReady--; if (v.atgmT <= 0) v.atgmT = D.atgmReload; v.cool = 1;
  const p = launch(D.atgm, v, v.team, from, dir, AMMO[D.atgm].v * .6); p.guide = guide; Sound.at('rpg', from);
  for (let i = 0; i < 6; i++) sprite(from.clone().addScaledVector(dir, -i), 2, 5, 2, 0xd6d0c2, false, .4, .6);
}
const SMOKES = [];
function popSmoke(v) { // a smoke screen thrown 30 m ahead of the turret
  v.smoke--; v.smokeT = 25; Sound.at('pop', v.pos);
  const a0 = v.yaw + v.tYaw;
  for (let k = -3; k <= 3; k++) {
    const a = a0 + k * .16, x = v.pos.x + Math.cos(a) * 32, z = v.pos.z + Math.sin(a) * 32, y = groundY(x, z) + 3;
    SMOKES.push({ pos: new V3(x, y, z), r: 8, t: 0, life: 28 });
    for (let i = 0; i < 4; i++) sprite(new V3(x + rand(-3, 3), y + rand(-1, 3), z + rand(-3, 3)), 6, 10, 26 + Math.random() * 4, 0xe2e2dc, false, .15, .92);
  }
}
function smokeStep(dt) { for (let i = SMOKES.length - 1; i >= 0; i--) if ((SMOKES[i].t += dt) > SMOKES[i].life) SMOKES.splice(i, 1); }
function smokeBlocks(a, b) { for (const s of SMOKES) if (segSphere(a, b, s.pos, s.r * Math.min(1, s.t / 2.5 + .3)) !== null) return true; return false; }
function playerVehMsg(text) { const el = $('vehMsg'); el.textContent = text; el.style.opacity = 1; clearTimeout(el._t); el._t = setTimeout(() => el.style.opacity = 0, 3500); }
function hitInfo(text, col) { const el = $('hitInfo'); el.textContent = text; el.style.color = col || '#fff'; el.style.opacity = 1; clearTimeout(el._t); el._t = setTimeout(() => el.style.opacity = 0, 2200); }

/* ---------------- soldiers ---------------- */
function moveSoldier(s, inp, dt) {
  const inWater = terrainY(s.pos.x, s.pos.z) < -1.1 && bridgeAt(s.pos.x, s.pos.z, s.pos.y) === null && standTop(s.pos.x, s.pos.z, s.pos.y) === null;
  s.crouch = !!inp.crouch && !inWater;
  const spd = inWater ? 2.2 : s.crouch ? 2.2 : inp.sprint && inp.fwd > 0 ? 7 : 4.4;
  const c = Math.cos(s.yaw), sn = Math.sin(s.yaw);
  let mx = c * inp.fwd - sn * inp.side, mz = sn * inp.fwd + c * inp.side; const ml = Math.hypot(mx, mz); if (ml > 1) { mx /= ml; mz /= ml; }
  const k = s.onGround || inWater ? clamp(dt * 12, 0, 1) : clamp(dt * 2, 0, 1);
  s.vel.x += (mx * spd - s.vel.x) * k; s.vel.z += (mz * spd - s.vel.z) * k;
  if (inWater) { s.vel.y = 0; s.pos.y += (-1.15 - s.pos.y) * clamp(dt * 4, 0, 1); }
  else { s.vel.y -= 19 * dt; if (inp.jump && s.onGround) { s.vel.y = 5.6; s.onGround = false; } if (s.chute) { s.vel.y = Math.max(s.vel.y, -5.5); s.vel.x *= Math.pow(.6, dt); s.vel.z *= Math.pow(.6, dt); } }
  const ox = s.pos.x, oz = s.pos.z;
  s.pos.x += s.vel.x * dt; s.pos.z += s.vel.z * dt; if (!inWater) s.pos.y += s.vel.y * dt;
  pushOutCircle(s.pos, .35, s.pos.y + .35, s.pos.y + 1.7);
  // steep slopes push you back
  let g = groundY(s.pos.x, s.pos.z, s.pos.y); const top = standTop(s.pos.x, s.pos.z, s.pos.y); if (top !== null && top > g) g = top;
  if (s.chute && s.onGround) s.chute = false;
  const gOld = groundY(ox, oz, s.pos.y), climb = (g - gOld) / Math.max(.001, Math.hypot(s.pos.x - ox, s.pos.z - oz));
  if (climb > 1.4 && g > s.pos.y + .3 && top === null) { s.pos.x = ox; s.pos.z = oz; g = gOld; }
  if (!inWater) { if (s.pos.y <= g) { s.pos.y = g; s.vel.y = 0; s.onGround = true; } else if (s.pos.y > g + .15) s.onGround = false; if (s.onGround && s.vel.y <= 0 && s.pos.y - g < .5) s.pos.y = g; }
  s.pos.x = clamp(s.pos.x, 40, WORLD_W - 40); s.pos.z = clamp(s.pos.z, 40, WORLD_H - 40);
  s.walk += Math.hypot(s.vel.x, s.vel.z) * dt;
  s.swim = inWater;
}
function poseSoldier(s, dt) {
  const m = s.model, sp = Math.hypot(s.vel.x, s.vel.z);
  m.root.position.copy(s.pos); m.root.rotation.y = -s.yaw;
  if (!s.alive) { s.dead += dt; m.root.rotation.z = Math.min(s.dead * 3, 1) * Math.PI / 2 * .98; m.root.position.y = s.pos.y + .1; return; }
  const a = Math.sin(s.walk * 2.2) * Math.min(sp / 4, 1) * .7;
  m.legs[0].thigh.rotation.z = a; m.legs[1].thigh.rotation.z = -a;
  m.legs[0].shin.rotation.z = -Math.max(0, -a) * 1.2; m.legs[1].shin.rotation.z = -Math.max(0, a) * 1.2;
  m.hips.position.y = s.crouch ? .62 : .95; if (s.crouch) { m.legs[0].thigh.rotation.z = 1.2; m.legs[0].shin.rotation.z = -1.9; m.legs[1].thigh.rotation.z = .3; m.legs[1].shin.rotation.z = -1.4; }
  if (s.swim) { m.hips.position.y = .6; m.torso.rotation.z = -.9; } else m.torso.rotation.z = 0;
  m.arms.rotation.z = clamp(s.pitch, -.9, .9);
  if (m.real || m.gltf) poseReal(s, m, sp, dt); // (a downloaded figure takes the same gait: its stand-in joints are the same)
  if (m.gltf) kitPoseSoldier(s, m, dt);
}
function poseReal(s, m, sp, dt) { // the realistic soldier: a proper gait, hip bob, lean, breathing, a level head
  s._t = (s._t || Math.random() * 9) + dt;
  const run = clamp((sp - 2) / 3, 0, 1), amp = Math.min(sp / 3.2, 1) * (.42 + run * .32), ph = s.walk * (2.2 - run * .5);
  if (!s.crouch && !s.swim) {
    for (let k = 0; k < 2; k++) {
      const sg = k ? -1 : 1, a = Math.sin(ph) * amp * sg, swing = Math.max(0, Math.cos(ph) * sg);
      m.legs[k].thigh.rotation.z = a + run * .12;
      m.legs[k].shin.rotation.z = -(swing * amp * 1.7 + Math.max(0, -a) * .5 + .04 + run * .2);
    }
    m.hips.position.y = .95 - amp * .05 - run * .05 + Math.cos(ph * 2) * .022 * amp;
  }
  const lean = -(Math.min(sp / 6, 1) * .14 + run * .08), breathe = Math.sin(s._t * 1.7) * .012 * (1 - amp);
  if (!s.swim) m.torso.rotation.z = lean + breathe + (s.crouch ? -.18 : 0);
  m.torso.rotation.y = Math.sin(ph) * .1 * amp; m.hips.rotation.y = -Math.sin(ph) * .06 * amp;
  m.arms.rotation.z = clamp(s.pitch, -.9, .9) - m.torso.rotation.z;
  m.arms.rotation.x = -Math.sin(ph) * .03 * amp;
  m.head.rotation.z = -m.torso.rotation.z * .7 + clamp(s.pitch, -.6, .6) * .4; m.head.rotation.y = -m.torso.rotation.y;
}
function soldierShoot(s, aimPoint, dt, wantFire, inaccuracy) {
  s.cool -= dt;
  if (s.reload > 0) { s.reload -= dt; if (s.reload <= 0) { const n = Math.min(30 - s.mag, s.ammo); s.mag += n; s.ammo -= n; } return; }
  if (!wantFire || s.cool > 0 || s.swim) return;
  const muzzle = _w.copy(s.eye); muzzle.x += Math.cos(s.yaw) * .5 - Math.sin(s.yaw) * .18; muzzle.z += Math.sin(s.yaw) * .5 + Math.cos(s.yaw) * .18; muzzle.y -= .15;
  if (s.slot === 1 && s.rpg > 0) {
    s.rpg--; s.cool = 1.2; const dir = aimPoint.clone().sub(muzzle).normalize();
    if (inaccuracy) { dir.x += (Math.random() - .5) * inaccuracy; dir.y += (Math.random() - .5) * inaccuracy * .5; dir.z += (Math.random() - .5) * inaccuracy; dir.normalize(); }
    launch('rpg7', s, s.team, muzzle, dir); Sound.at('rpg', muzzle); sprite(muzzle.clone().addScaledVector(dir, -1.2), 1.5, 3, 1, 0xcfcac0, false, .5, .7);
    if (s.rpg === 0 && s.isPlayer) s.slot = 0;
    return;
  }
  if (s.mag <= 0) { if (s.ammo > 0) s.reload = RIFLE.reload; return; }
  s.mag--; s.cool = RIFLE.rate;
  const dir = aimPoint.clone().sub(muzzle).normalize();
  const sp = RIFLE.spread * (s.crouch ? .6 : 1) * (CAM.zoom && s.isPlayer ? .5 : 1) + (Math.hypot(s.vel.x, s.vel.z) > 3 ? .012 : 0) + (inaccuracy || 0);
  hitscan('rifle', s, s.team, muzzle, dir, sp);
  Sound.at('rifle', muzzle, s.isPlayer ? .9 : .7); sprite(muzzle, .35, .2, .04, 0xffffff, true);
  if (s.isPlayer) { CAM.pitch += .0035; CAM.yaw += (Math.random() - .5) * .002; }
}

/* ---------------- NPC guards ---------------- */
function guardsStep(dt) {
  const D = DIFF[GAME.diff];
  for (const c of GAME.cps) for (const g of c.guards) {
    if (!g.alive) { poseSoldier(g, dt); continue; }
    const ai = g.ai; ai.t -= dt; g.cool -= dt;
    if (ai.t <= 0) {
      ai.t = .35 + Math.random() * .2;
      const range = g.post.tower ? 430 : 300;
      if (ai.target && (!ai.target.alive || ai.target.pos.distanceTo(g.pos) > range * 1.2 || !lineOfSight(g.eye, aimCenter(ai.target, _v)))) ai.target = null;
      if (!ai.target) {
        let best = null, bd = range;
        for (const e of ENTS) {
          if (!e.alive || e.team === 2 || e.kind === 'gun' || (e.kind === 'soldier' && e.veh) || (e.kind === 'vehicle' && !e.driver)) continue;
          const d = e.pos.distanceTo(g.pos); if (d >= bd) continue;
          if (lineOfSight(g.eye, aimCenter(e, _v))) { best = e; bd = d; }
        }
        if (best) { ai.target = best; ai.burst = 0; ai.shotT = D.react * (.6 + Math.random() * .8); }
      }
    }
    const tg = ai.target;
    if (tg) {
      const tp = aimCenter(tg, new V3()), d = tp.distanceTo(g.eye);
      g.yaw = turnTo(g.yaw, Math.atan2(tp.z - g.pos.z, tp.x - g.pos.x), 4 * dt); g.pitch = Math.atan2(tp.y - g.eye.y, Math.hypot(tp.x - g.pos.x, tp.z - g.pos.z));
      g.crouch = !g.post.tower && d > 60;
      ai.shotT -= dt; ai.rpgT -= dt;
      if (g.rpgGuard && tg.kind === 'vehicle' && d < 260 && ai.rpgT <= 0) {
        ai.rpgT = 9 + Math.random() * 5; const lead = tp.clone().addScaledVector(tg.vel || _v.set(0, 0, 0), d / 170);
        lead.x += (Math.random() - .5) * d * .05; lead.z += (Math.random() - .5) * d * .05; lead.y += d * d * .5 * 2 / (170 * 170);
        const from = g.eye.clone(); launch('rpg7', g, 2, from, lead.sub(from).normalize()); Sound.at('rpg', from);
      } else if (ai.shotT <= 0 && g.cool <= 0) {
        // a burst of 3, then a pause; each shot lands with a chance that falls with range
        const p = clamp((.36 - d / 800) * D.guard, .04, .42) * (tg.kind === 'soldier' && tg.crouch ? .7 : 1);
        const aim = tp.clone();
        if (Math.random() > p) { const miss = 1.2 + Math.random() * 2.5, a = Math.random() * TAU; aim.x += Math.cos(a) * miss; aim.z += Math.sin(a) * miss; aim.y += (Math.random() - .3) * 1.5; }
        const from = g.eye.clone(); from.y -= .15;
        hitscan('npcRifle', g, 2, from, aim.sub(from).normalize(), 0); Sound.at('rifle', from, .7); sprite(from, .3, .2, .04, 0xffffff, true);
        g.cool = .13; ai.burst++;
        if (ai.burst >= 3) { ai.burst = 0; ai.shotT = .9 + Math.random() * 1.1; }
      }
    } else {
      g.crouch = false; g.pitch = 0;
      if (c.guardsLeft <= 3 && !g.post.tower) { // the last few do not sit hidden in a corner: they come out to the road through the checkpoint
        const rp = routePoint(c.p.s, 0, _f), dx = rp.x - g.pos.x, dz = rp.z - g.pos.z;
        if (Math.hypot(dx, dz) > 12) { g.yaw = turnTo(g.yaw, Math.atan2(dz, dx), 3 * dt); moveSoldier(g, { fwd: 1, side: 0, sprint: false, crouch: false, jump: false }, dt); poseSoldier(g, dt); continue; } }
      if (Math.random() < dt * .25) g.yaw += (Math.random() - .5) * 1.5;
    }
    g.vel.set(0, 0, 0); poseSoldier(g, dt);
  }
}
function aimCenter(e, out) { return e.kind === 'soldier' ? out.set(e.pos.x, e.pos.y + (e.crouch ? .9 : e.post && e.post.tower ? 1.55 : 1.25), e.pos.z) : out.set(e.pos.x, e.pos.y + (e.T ? e.T.hgt * .55 : 1.2), e.pos.z); }

/* ---------------- howitzers ---------------- */
function howitzersStep(dt) {
  for (const h of GAME.guns) {
    if (!h.alive) { if ((h.respawnT -= dt) <= 0) { const t = h.team, [x, z] = h.home; removeEnt(h); const n = new Howitzer(t, x, z, groundY(x, z), GAME.M.bases[t].ang); n.home = [x, z]; GAME.guns[GAME.guns.indexOf(h)] = n; } continue; }
    h.cool -= dt;
    h.aimYaw = turnTo(h.aimYaw, h.wantYaw, .4 * dt); h.aimPitch += clamp(h.wantPitch - h.aimPitch, -.25 * dt, .25 * dt);
    h.model.turret.rotation.y = -h.aimYaw; h.model.gun.rotation.z = h.aimPitch;
    if (h.recoil) { h.recoil = Math.max(0, h.recoil - dt * 1.5); h.model.gun.position.x = -h.recoil * .9; }
    if (h.pending) {
      if (Math.abs(angDiff(h.aimYaw, h.wantYaw)) < .01 && Math.abs(h.aimPitch - h.wantPitch) < .01) {
        const s = h.pending; h.pending = null;
        h.model.gun.updateMatrixWorld(true); const from = new V3(h.model.muzzle, 0, 0).applyMatrix4(h.model.gun.matrixWorld);
        const p = launch('he155', h, h.team, from, s.dir, s.speed); p.target = s.target; p.whistled = false;
        Sound.at('howitzer', from); h.recoil = 1;
        for (let i = 0; i < 6; i++) sprite(from.clone().addScaledVector(s.dir, i * 1.5), 3, 9, 3, 0xd8d2c4, false, .8, .75); sprite(from, 5, 3, .15, 0xffffff, true);
      }
      continue;
    }
    if (h.cool > 0) continue;
    h.cool = rand(HOW_COOL[0], HOW_COOL[1]);
    const tgt = pickArtyTarget(h); if (!tgt) { h.cool = 4; continue; }
    const shot = artyShot(h, tgt); if (!shot) continue;
    h.pending = shot; h.wantYaw = angDiff(h.yaw, Math.atan2(shot.dir.z, shot.dir.x)); h.wantPitch = Math.asin(clamp(shot.dir.y, -1, 1));
  }
}
function pickArtyTarget(h) {
  const list = [];
  for (const e of ENTS) {
    if (!e.alive || e.team === h.team || e.team === 2 || e.kind === 'air' || (e.kind === 'soldier' && e.veh)) continue;
    const d = Math.hypot(e.pos.x - h.pos.x, e.pos.z - h.pos.z); if (d > HOW_RANGE || d < 300) continue;
    list.push([e, e.kind === 'vehicle' ? 3 : e.kind === 'gun' ? .5 : 1]);
  }
  if (!list.length) return null;
  let r = Math.random() * list.reduce((a, b) => a + b[1], 0); for (const [e, w] of list) if ((r -= w) <= 0) return e; return list[0][0];
}
function artyShot(h, tgt) {
  const g = 9.8, from = _v.set(h.pos.x, h.pos.y + 2.5, h.pos.z), th = .95 + Math.random() * .15; // a high, lobbed shot
  let aim = tgt.pos.clone(), v = 0, t = 0;
  for (let it = 0; it < 3; it++) {
    const R = Math.hypot(aim.x - from.x, aim.z - from.z), dy = aim.y - from.y, den = 2 * Math.cos(th) ** 2 * (R * Math.tan(th) - dy);
    if (den <= 0) return null; v = Math.sqrt(g * R * R / den); t = R / (v * Math.cos(th));
    aim = tgt.pos.clone().addScaledVector(tgt.vel || _w.set(0, 0, 0), t * .8);
  }
  // roughly one shell in six or seven lands on target; the rest scatter 30-140 m away
  const onTarget = Math.random() < HIT_CHANCE;
  if (onTarget) { aim.x += rand(-2, 2); aim.z += rand(-2, 2); }
  else { const a = Math.random() * TAU, r = 30 + Math.random() * 110; aim.x += Math.cos(a) * r; aim.z += Math.sin(a) * r; }
  aim.y = groundY(aim.x, aim.z);
  const R = Math.hypot(aim.x - from.x, aim.z - from.z), dy = aim.y - from.y, den = 2 * Math.cos(th) ** 2 * (R * Math.tan(th) - dy); if (den <= 0) return null;
  v = Math.sqrt(g * R * R / den);
  const dir = new V3((aim.x - from.x) / R * Math.cos(th), Math.sin(th), (aim.z - from.z) / R * Math.cos(th)).normalize();
  return { dir, speed: v, target: tgt, onTarget };
}
function shellWarnings() { // a falling whistle when a shell is about to land near you
  const me = PLAYER.s && PLAYER.s.alive ? (PLAYER.s.veh || PLAYER.s).pos : null; if (!me) return;
  for (const p of PROJS) if (p.wk === 'howitzer' && !p.whistled && p.vel.y < 0) {
    const tLand = (p.pos.y - groundY(p.pos.x, p.pos.z)) / -p.vel.y, lx = p.pos.x + p.vel.x * tLand, lz = p.pos.z + p.vel.z * tLand;
    if (tLand < 2.3 && Math.hypot(lx - me.x, lz - me.z) < 260) { p.whistled = true; Sound.play('whistle', 1 - Math.hypot(lx - me.x, lz - me.z) / 300); }
  }
}

/* ---------------- checkpoints ---------------- */
function canCapture(team, i) { const C = GAME.cps; return team === 0 ? (i === 0 || C[i - 1].owner === 0) : (i === 4 || C[i + 1].owner === 1); }
let cpTimer = 0;
function checkpointsStep(dt) {
  cpTimer -= dt; if (cpTimer > 0) return; const step = .25 - cpTimer; cpTimer = .25;
  for (const c of GAME.cps) {
    const z = c.p.zone, cs = Math.cos(z.ang), sn = Math.sin(z.ang), hx = z.hx * 1000, hz = z.hy * 1000, cx = z.x * 1000, cz = z.y * 1000;
    c.inside = [0, 0]; c.guardsLeft = c.guards.filter(g => g.alive).length;
    for (const e of ENTS) {
      if (!e.alive || e.team > 1 || e.kind === 'gun' || e.kind === 'air' || (e.kind === 'soldier' && e.veh) || (e.kind === 'vehicle' && !e.driver)) continue; // aircraft never count: only troops and ground vehicles take checkpoints
      const dx = e.pos.x - cx, dz = e.pos.z - cz;
      if (Math.abs(dx * cs + dz * sn) < hx && Math.abs(-dx * sn + dz * cs) < hz) c.inside[e.team]++;
    }
    if (c.guardsLeft > 0) continue;
    const [nb, nr] = c.inside;
    let team = -1; if (nb && !nr) team = 0; else if (nr && !nb) team = 1;
    if (team < 0 || !canCapture(team, c.i)) continue;
    const n = c.inside[team], rate = step / CAP_TIME[c.p.size] * Math.min(2, 1 + (n - 1) * .25), dir = team === 0 ? 1 : -1;
    if ((team === 0 && c.val >= 1) || (team === 1 && c.val <= -1)) continue;
    const before = c.owner;
    c.val = clamp(c.val + dir * rate * (c.owner === -1 || c.owner === team ? 1 : 2), -1, 1);
    if (c.owner === 1 - team && (dir > 0 ? c.val >= 0 : c.val <= 0)) c.owner = -1;
    if (c.val >= 1) c.owner = 0; else if (c.val <= -1) c.owner = 1;
    if (c.owner !== before) { onCpChange(c, before); if (c.owner >= 0) for (const e of ENTS) if (e.alive && e.team === c.owner && e.kind !== 'air' && !(e.kind === 'soldier' && e.veh) && inZone(c, e.pos)) awardSP(e.kind === 'vehicle' ? e.driver : e, SP_AWARD.capture, 'capture'); }
  }
  checkWin();
}
function onCpChange(c, before) {
  c.p.flag.material.color.setHex(c.owner === -1 ? 0xdedede : TEAMS[c.owner].hex);
  if (c.owner >= 0) {
    const ours = c.owner === GAME.team;
    showMsg(`${ours ? 'We took' : 'Enemy took'} ${c.p.name}`, ours ? 'You can spawn there now' : '');
    Sound.play(ours ? 'cap' : 'ui');
    if (PLAYER.s && PLAYER.s.alive && c.inside[GAME.team] && c.owner === GAME.team && inZone(c, (PLAYER.s.veh || PLAYER.s).pos)) PLAYER.caps++;
  } else if (before === GAME.team) showMsg(`${c.p.name} is being taken!`, '');
  renderCpBar();
}
function inZone(c, p) { const z = c.p.zone, dx = p.x - z.x * 1000, dz = p.z - z.y * 1000, cs = Math.cos(z.ang), sn = Math.sin(z.ang); return Math.abs(dx * cs + dz * sn) < z.hx * 1000 && Math.abs(-dx * sn + dz * cs) < z.hy * 1000; }
function checkWin() {
  if (GAME.over) return;
  for (const t of [0, 1]) if (GAME.cps.every(c => c.owner === t)) return endMatch(t, `${TEAMS[t].name} holds all five checkpoints.`);
  if (GAME.time >= MATCH_S) {
    const n = [0, 1].map(t => GAME.cps.filter(c => c.owner === t).length);
    endMatch(n[0] === n[1] ? -1 : n[0] > n[1] ? 0 : 1, `Time is up: Blue ${n[0]}, Red ${n[1]} checkpoints.`);
  }
}
function endMatch(winner, why) {
  GAME.over = true; GAME.winner = winner;
  setTimeout(() => {
    document.exitPointerLock && document.exitPointerLock();
    $('endTitle').textContent = winner < 0 ? 'Draw' : winner === GAME.team ? 'Victory' : 'Defeat';
    $('endTitle').style.color = winner < 0 ? '#c5ccd2' : winner === GAME.team ? '#f4f6f7' : '#e8483a';
    $('endWhy').textContent = why;
    $('endStats').innerHTML = `<span>Enemies knocked out</span><b>${PLAYER.kills}</b><span>Times knocked out</span><b>${PLAYER.deaths}</b><span>Checkpoints taken</span><b>${PLAYER.caps}</b><span>Spawn points left</span><b>${PLAYER.sp}</b>`;
    $('end').classList.remove('hidden');
  }, 2500);
}

/* ---------------- bots ---------------- */
// every bot is a different person: how well it aims, how fast it reacts, how much it notices, how it holds up under fire, how it drives
function botSkill() { const r = () => Math.random(); return { aim: .7 + r() * .9, react: .7 + r() * .9, aware: .55 + r() * .4, nerve: .25 + r() * .75, drive: .4 + r() * .6 }; }
function targetCpFor(team) { // the checkpoint this team should push next
  const C = GAME.cps;
  if (team === 0) { for (let i = 0; i < 5; i++) if (C[i].owner !== 0) return i; return 4; }
  for (let i = 4; i >= 0; i--) if (C[i].owner !== 1) return i; return 0;
}
function spawnBot(b) {
  const roll = Math.random(), team = b.team;
  const vehCount = ENTS.filter(e => e.kind === 'vehicle' && e.alive && e.team === team && e.driver).length;
  let type = vehCount >= Math.ceil(GAME.bots * .6) ? 'inf' : roll < .35 ? 'mbt' : roll < .57 ? 'ifv' : roll < .72 ? 'jeep' : 'inf';
  // a bot with points to spend sometimes takes an aircraft (no limit on how many), otherwise the ground kit it can afford
  const r2 = Math.random();
  if (b.sp >= SP_COST.jet && r2 < .35) type = 'jet'; else if (b.sp >= SP_COST.heli && r2 < .6) type = 'heli';
  if ((SP_COST[type] || 0) > b.sp) type = b.sp >= SP_COST.ifv && Math.random() < .5 ? 'ifv' : Math.random() < .3 ? 'jeep' : 'inf';
  b.sp -= SP_COST[type] || 0;
  const s = new Soldier(team, { bot: b, name: b.name }); b.soldier = s; s.bot = b;
  if (type === 'inf') {
    const where = Math.random() < .8 ? frontCp(team) : -1; const [x, z] = spawnSpot(team, where);
    s.pos.set(x, groundY(x, z) + .1, z); s.yaw = GAME.M.bases[team].ang; b.unit = s;
  } else if (type === 'jet' || type === 'heli') { const a = airSpawn(type, team); enterVehicle(s, a); b.unit = a; }
  else { const v = makeVehicle(type, team); enterVehicle(s, v); b.unit = v; }
  b.ai = { t: Math.random(), target: null, stuck: 0, rev: 0, goal: null, think: 0, lastS: 0, holdT: 0 };
}
function routePoint(s, lane, out) { // point on the route at distance s, shifted sideways by lane
  const M = GAME.M, R = M.route, L = M.routeLen; s = clamp(s, 0, L[L.length - 1]);
  let k = 0; while (k < L.length - 2 && L[k + 1] < s) k++;
  const t = (s - L[k]) / Math.max(1e-6, L[k + 1] - L[k]), a = R[k], b = R[k + 1], dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz) || 1;
  const cx = lerp(a[0], b[0], t), cz = lerp(a[1], b[1], t);
  for (const br of WORLD.bridges) if (Math.hypot(cx - br.x, cz - br.z) < Math.max(-br.aL, br.aR) + 70) { lane = 0; break; } // single file over bridges
  return out.set(cx - dz / l * lane, 0, cz + dx / l * lane);
}
function botsStep(dt) {
  for (const b of GAME.botsList) {
    if (!b.soldier || !b.soldier.alive) {
      if (b.soldier && b.soldier.dead > 12) { removeEnt(b.soldier); b.soldier = null; }
      if ((b.respawn -= dt) <= 0 && !GAME.over) spawnBot(b);
      if (b.soldier && !b.soldier.alive) poseSoldier(b.soldier, dt);
      continue;
    }
    const u = b.unit = b.soldier.veh || b.soldier;
    if (u.kind === 'air') { if (u.alive) airBotThink(b, u, dt); } else botThink(b, u, dt);
  }
}
function botThink(b, u, dt) {
  const ai = b.ai, D = DIFF[GAME.diff], M = GAME.M, team = b.team, isV = u.kind === 'vehicle', sk = b.skill || (b.skill = botSkill());
  ai.t -= dt; ai.settle = Math.max(1, (ai.settle || 1) - dt * .9);
  const range = isV ? (u.cls === 'mbt' ? 1600 : u.cls === 'ifv' ? 1100 : 650) : 380;
  const from = isV ? _w.set(u.pos.x, u.pos.y + u.def.hgt, u.pos.z) : u.eye;
  if (ai.t <= 0) {
    ai.t = .4 + Math.random() * .3;
    if (ai.target && (!ai.target.alive || ai.target.pos.distanceTo(u.pos) > range * 1.15 || !lineOfSight(from, aimCenter(ai.target, _v)))) ai.target = null;
    const cNow = GAME.cps[targetCpFor(team)], mopUp = ai.atCp && cNow.guardsLeft > 0 && cNow.guardsLeft <= 6; // the last few guards hold up the capture: finish them rather than trade shots for ever
    if (mopUp && ai.target && ai.target.team !== 2 && GAME.time - (ai.tgtT || 0) > 20 && GAME.time - (ai.threatT ?? -99) > 5) ai.target = null;
    if (!ai.target && ai.threat && ai.threat.alive && GAME.time - ai.threatT < 4 && hostile(team, ai.threat.team) && ai.threat.team !== team && !(ai.threat.kind === 'soldier' && ai.threat.veh) && ai.threat.pos.distanceTo(u.pos) < range * 1.1 && Math.random() < .5 + .5 * sk.aware) { ai.target = ai.threat; ai.react = D.react * sk.react + .5; ai.settle = 2.6; } // just been hit: look for who did it
    if (!ai.target) {
      let best = null, bs = 1e9;
      for (const e of ENTS) {
        if (!e.alive || !hostile(team, e.team) || e.team === team || (e.kind === 'soldier' && e.veh) || (e.kind === 'vehicle' && !e.driver && e.team !== 2) || (e.kind === 'air' && !e.driver)) continue;
        const d = e.pos.distanceTo(u.pos); if (d > range) continue;
        // people miss things: far, still or hidden targets often go unnoticed for a while
        const moving = e.vel && e.vel.lengthSq() > 4, notice = sk.aware * (1 - d / range * .55) * (moving ? 1.15 : .75) * (e.kind === 'soldier' && e.crouch ? .7 : 1) * (e.kind === 'air' ? 1.2 : 1);
        if (Math.random() > notice) continue;
        let score = (e.kind === 'air' ? (e.cls === 'heli' ? 1.6 : 5) : 1) * d * (e.kind === 'vehicle' && isV && u.cls !== 'jeep' ? .55 : 1) * (e.kind === 'vehicle' && u.cls === 'jeep' && e.cls !== 'jeep' ? 4 : 1) * (e.team === 2 ? (mopUp ? .2 : 1.2) : 1);
        if (score < bs && lineOfSight(from, aimCenter(e, _v))) { best = e; bs = score; }
      }
      if (best) { ai.target = best; ai.tgtT = GAME.time; ai.react = D.react * sk.react + (Math.random() < .08 ? 1 + Math.random() * 1.2 : 0); ai.settle = 2.6; ai.wrongAmmo = Math.random() < .07; } // some freeze for a moment; first shots go wide
    }
    const flinch = GAME.time - (u.lastHurt ?? (b.soldier.lastHurt ?? -99)) < 1.8 || (ai.threat && ai.threatT > GAME.time - 1.8) ? 1 + 2.2 * (1 - sk.nerve) : 1;
    ai.aimErr = new V3((Math.random() - .5), (Math.random() - .5) * .5, (Math.random() - .5)).multiplyScalar(D.aim * 2 * sk.aim * (ai.settle || 1) * flinch); // a new wobble every think: worse just after spotting you and when under fire
    if (Math.random() < .015 * (1.4 - sk.drive)) b.lane = (Math.random() - .5) * 28; // drifting out of formation
    // objective
    const ti = targetCpFor(team), c = GAME.cps[ti];
    ai.cp = ti;
    const sNow = M.routeAt(u.pos.x, u.pos.z), sGoal = c.p.s, dir = Math.sign(sGoal - sNow) || 1;
    ai.atCp = inZone(c, u.pos) || Math.abs(sGoal - sNow) < 140;
    let hunt = null; // guards still alive here: go and find them
    if (ai.atCp && c.guardsLeft > 0 && !ai.target) { let bd = 1e9; for (const g of c.guards) if (g.alive) { const d = g.pos.distanceTo(u.pos); if (d < bd) { bd = d; hunt = g; } } }
    if (hunt) { const r = isV ? (hunt.post && hunt.post.tower ? 65 : 40) : 7, a = GAME.time * (isV ? .12 : .3) + b.lane; ai.goal = new V3(hunt.pos.x + Math.cos(a) * r, 0, hunt.pos.z + Math.sin(a) * r); ai.hold = null; } // circle round it until it's in sight
    else if (ai.atCp) { if (!ai.hold || ai.holdCp !== ti) { const [dx, dz] = CP_DIM[c.p.size]; ai.hold = new V3(...(([x, z]) => [x, 0, z])(c.p.site.w((Math.random() - .5) * dx * 600, (Math.random() - .5) * dz * 500))); ai.holdCp = ti; } ai.goal = ai.hold; }
    else { ai.hold = null; ai.goal = routePoint(sNow + dir * (isV ? Math.max(45, Math.abs(u.speed) * 2.6) : 25), b.lane, new V3()); }
    // out of shells: back down the road to the nearest checkpoint the side holds (or the base), stand there until restocked, then return to the fight
    ai.resting = false;
    if (isV && u.load) { const total = u.def.ammo.reduce((n, k) => n + (u.load[k] || 0), 0) + (u.def.reload && u.loaded ? 1 : 0), cap = u.def.ammo.reduce((n, k) => n + (u.def.load[k] || 0), 0);
      if (!ai.resupply && (total <= 1 || (total < cap * .12 && !ai.target))) ai.resupply = true; else if (ai.resupply && total >= cap * .9) ai.resupply = false;
      if (ai.resupply) { let sHome = team === 0 ? 0 : M.routeLen[M.routeLen.length - 1]; for (const cc of GAME.cps) if (cc.owner === team && Math.abs(cc.p.s - sNow) < Math.abs(sHome - sNow)) sHome = cc.p.s;
        ai.resting = !!friendlyPoint(u); ai.atCp = false; ai.hold = null; ai.goal = ai.resting ? null : routePoint(sNow + (Math.sign(sHome - sNow) || 1) * Math.max(45, Math.abs(u.speed) * 2.6), b.lane, new V3()); } }
    ai.bridge = false; if (isV) for (const br of WORLD.bridges) if (Math.hypot(u.pos.x - br.x, u.pos.z - br.z) < Math.max(-br.aL, br.aR) + 130) { ai.bridge = true; break; } // slow down and line up for a bridge
    if (ai.bridge) ai.detourT = 0; // (a bridge is narrow and straight: keep to the road, no looking for ways round)
    if (isV && ai.goal && !ai.bridge && !(ai.detourT > GAME.time)) { // a building or wall in the way: look for the clear heading nearest the one wanted and drive that for a moment
      const gd = Math.atan2(ai.goal.z - u.pos.z, ai.goal.x - u.pos.x), gl = Math.min(26, Math.hypot(ai.goal.x - u.pos.x, ai.goal.z - u.pos.z));
      if (!driveClear(u, gd, gl)) { const sd = ai.detourSide || (ai.detourSide = Math.random() < .5 ? 1 : -1);
        for (const off of [.5, -.5, 1, -1, 1.5, -1.5, 2.2, -2.2]) if (driveClear(u, gd + off * sd, 22)) { ai.detour = new V3(u.pos.x + Math.cos(gd + off * sd) * 22, 0, u.pos.z + Math.sin(gd + off * sd) * 22); ai.detourT = GAME.time + 2.4; ai.detourSide = Math.sign(off * sd); break; } }
      else ai.detourSide = 0;
    }
    // stuck?
    const moved = ai.lastP ? Math.hypot(u.pos.x - ai.lastP[0], u.pos.z - ai.lastP[1]) : 9; ai.lastP = [u.pos.x, u.pos.z]; ai.lastS = sNow; // (real distance covered, not progress along the road: a vehicle crossing the route is not stuck)
    if (!ai.progP || Math.hypot(u.pos.x - ai.progP[0], u.pos.z - ai.progP[1]) > 25 || ai.atCp || (ai.target && !ai.resupply) || ai.resting) { ai.progP = [u.pos.x, u.pos.z]; ai.progT = GAME.time; }
    if (isV && GAME.time - ai.progT > 70) { ai.progT = GAME.time; b.bails = (b.bails || 0) + 1; b.bailAt = [Math.round(u.pos.x), Math.round(u.pos.z), u.type]; exitVehicle(b.soldier); return; } // bogged down for over a minute (a ravine, a wreck in the way): the crew gets out and walks
    if (isV && !ai.atCp && moved < 1.2 && ai.rev <= 0) { if ((ai.stuck += .5) > 3) { ai.rev = 2.2; ai.stuck = 0; ai.revSteer = Math.random() < .5 ? -1 : 1; } } else ai.stuck = 0;
  }
  const tg = ai.target; let aimP = null;
  if (tg) {
    ai.react -= dt;
    aimP = aimCenter(tg, new V3());
    const d = aimP.distanceTo(from);
    if (isV) { ai.key = botWeapon(u, tg, d); if (ai.wrongAmmo && u.def.ammo.length > 1 && ai.key !== 'mg' && ai.key !== 'atgm') ai.key = u.def.ammo.find(k => k !== ai.key) || ai.key; } // the wrong shell loaded in a hurry
    if (tg.vel) { const sp = isV ? AMMO[ai.key === 'atgm' ? u.def.atgm : ai.key === 'mg' ? u.def.mg : ai.key].v : 0; if (sp && ai.key !== 'atgm') aimP.addScaledVector(tg.vel, d / sp); }
    aimP.addScaledVector(ai.aimErr, d);
  }
  if (isV) {
    const inp = { throttle: 0, steer: 0, aimYaw: u.yaw + u.tYaw, aimPitch: u.gPitch, fire: false, fire2: false, fire3: false };
    if (ai.goal) {
      const G = ai.detourT > GAME.time ? ai.detour : ai.goal, dx = G.x - u.pos.x, dz = G.z - u.pos.z, dist = Math.hypot(dx, dz), want = Math.atan2(dz, dx), da = angDiff(u.yaw, want);
      if (ai.rev > 0) { ai.rev -= dt; inp.throttle = -1; inp.steer = ai.revSteer; }
      else if (!(ai.atCp && dist < 12)) { const sp = Math.abs(u.speed), calm = 1 / (1 + sp * sp / 90); // wheels at speed: ask for a yaw rate the tyres can give, not full lock
        const want = (u.def.wheeled && sp > 3 ? clamp(Math.atan(clamp(da * 1.4, -7 / sp, 7 / sp) * u.def.len * .62 / sp) / u.def.steer, -1, 1) : clamp(da * 2, -1, 1)) + Math.sin(GAME.time * .8 + b.lane) * .2 * (1 - sk.drive) * (ai.bridge ? .15 : calm); ai.steerS = (ai.steerS || 0) + (want - (ai.steerS || 0)) * Math.min(1, dt * (1.5 + 3 * sk.drive)); inp.steer = clamp(ai.steerS, -1, 1); /* late, sloppy steering overshoots turns */ inp.throttle = Math.abs(da) > 1.2 ? .25 : Math.abs(da) > .5 ? .6 : 1; if (tg && u.cls === 'mbt' && aimP.distanceTo(u.pos) < 1100) inp.throttle *= .4;
        if (ai.bridge && !ai.atCp) inp.throttle = u.speed > 15 ? -1 : u.speed > 11 ? 0 : inp.throttle; }
    }
    if (aimP) {
      const key = ai.key, A = AMMO[key === 'atgm' ? u.def.atgm : key === 'mg' ? u.def.mg : key];
      const sol = aimSolution(u, aimP, A); inp.aimYaw = sol.yaw; inp.aimPitch = sol.pitch;
      const aligned = Math.abs(angDiff(u.yaw + u.tYaw, inp.aimYaw)) < .025 && Math.abs(u.gPitch - clamp(inp.aimPitch, u.def.elev[0], u.def.elev[1])) < .02;
      if (ai.react <= 0 && aligned) {
        if (key === 'mg') inp.fire2 = true;
        else if (key === 'atgm') { inp.fire3 = true; const t = tg; inp.guide = () => t.alive ? aimCenter(t, new V3()) : null; }
        else { selectAmmo(u, key); inp.fire = !u.def.reload || u.loaded === key; if (!u.def.reload) inp.fire = Math.random() < .85; }
      }
    }
    if (u.smoke > 0 && u.smokeT <= 0 && ai.threat && ai.threat.alive && ai.threat.kind === 'vehicle' && vState(u).crew < u.def.crew.length) { inp.smoke = true; ai.threat = null; }
    if (u.fire > 0 && u.fpe > 0 && Math.random() < dt * (.25 + .5 * sk.nerve)) { u.fpe--; u.fire = 0; } // the crew gets to the extinguisher (a rattled crew takes longer)
    { const need = u.mods.some(m => m.hp <= 0 && (m.kind === 'engine' || m.kind === 'trans' || m.kind === 'breech' || m.kind === 'barrel' || m.id === 'hdrive' || m.id === 'vdrive' || m.id === 'radiator' || m.id === 'autoloader'));
      if (u.repairT > 0) { inp.throttle = 0; inp.steer = 0; ai.progT = GAME.time; } // sitting still while the crew works
      else if (need && (!tg || !vState(u).drive || ai.resupply) && u.fire <= 0 && vState(u).crew >= 2 && GAME.time - (ai.threatT ?? -99) > 6) { u.repairT = 12 * (vState(u).crew < u.def.crew.length ? 1.5 : 1) * (friendlyPoint(u) ? .5 : 1); inp.throttle = 0; inp.steer = 0; u.speed = 0; } } // knocked-out parts and nobody shooting: stop and fix them
    if (u.lwsT && GAME.time - u.lwsT < 1.5 && u.smoke > 0 && u.smokeT <= 0 && Math.random() < sk.aware) { inp.smoke = true; u.lwsT = 0; } // laser warning: someone is ranging us
    driveVehicle(u, inp, dt);
  } else {
    const s = u, inp = { fwd: 0, side: 0, sprint: false, crouch: false, jump: false };
    if (ai.goal) {
      const dx = ai.goal.x - s.pos.x, dz = ai.goal.z - s.pos.z, dist = Math.hypot(dx, dz);
      if (!tg || dist > 40) { s.yaw = turnTo(s.yaw, Math.atan2(dz, dx), 3 * dt); inp.fwd = dist > 3 ? 1 : 0; inp.sprint = !tg && dist > 60; }
    }
    if (tg) {
      const d = aimP.distanceTo(s.eye);
      s.yaw = turnTo(s.yaw, Math.atan2(aimP.z - s.pos.z, aimP.x - s.pos.x), 5 * dt); s.pitch = Math.atan2(aimP.y - s.eye.y, Math.hypot(aimP.x - s.pos.x, aimP.z - s.pos.z));
      if (d > 50 && (!ai.goal || ai.atCp)) { inp.fwd = 0; inp.crouch = sk.nerve > .4 || Math.random() < .5; } // the nervous ones forget to get down
      if (s.slot === 0 && s.mag < 20 && s.reload <= 0 && Math.random() < dt * .25 * (1.3 - sk.nerve)) s.reload = RIFLE.reload; // reloading at a bad moment
      s.slot = tg.kind === 'vehicle' && s.rpg > 0 && d < 230 ? 1 : 0;
      if (s.slot === 1) aimP.y += d * d * .5 * AMMO.rpg7.g / (AMMO.rpg7.v ** 2);
      ai.burstT = (ai.burstT ?? .3) - dt; if (ai.burstT < -(.5 + Math.random() * .5)) ai.burstT = .2 + Math.random() * .3;
      soldierShoot(s, aimP, dt, ai.react <= 0 && (s.slot === 1 || ai.burstT > 0), D.aim);
    } else { s.cool -= dt; if (s.reload > 0) soldierShoot(s, _v, dt, false); else if (s.mag < 15 && s.ammo > 0) s.reload = RIFLE.reload; }
    moveSoldier(s, inp, dt); poseSoldier(s, dt);
  }
}
function driveClear(v, ang, L) { // is a straight run of L metres on this heading free of walls and buildings?
  const r = v.def.wid * .5 + .5, c = Math.cos(ang), s = Math.sin(ang);
  for (let d = Math.min(4, L); d <= L; d += 3.2) { _f.set(v.pos.x + c * d, 0, v.pos.z + s * d); const gy = groundY(_f.x, _f.z, v.pos.y + 1); if (gy < -v.def.ford || pushOutCircle(_f, r, gy + .3, gy + v.def.hgt)) return false; }
  return true;
}
function hullTilt(v) { // how far the turret's forward line is tipped up by the slope the hull sits on
  return Math.asin(clamp(_n.set(Math.cos(v.tYaw), 0, Math.sin(v.tYaw)).applyQuaternion(v.quat).y, -1, 1));
}
function aimSolution(v, p, A, sightR) { // turret yaw and gun pitch (hull-relative) to put the round on p. With sightR, the gun is laid for that range along the line of sight instead.
  const mz = new V3(), d = new V3(); muzzleOf(v, mz, d);
  const R = Math.hypot(p.x - mz.x, p.z - mz.z), yaw = Math.atan2(p.z - mz.z, p.x - mz.x);
  const pitch = A.kind === 'bullet' || A.guided ? Math.atan2(p.y - mz.y, R) : sightR ? Math.atan2(p.y - mz.y, R) + ballisticPitch(sightR, 0, A.v, A.g ?? 9.8) : ballisticPitch(R, p.y - mz.y, A.v, A.g ?? 9.8);
  return { yaw, pitch: pitch - hullTilt(v), range: Math.hypot(R, p.y - mz.y) };
}
function botWeapon(v, tg, d) { // what to shoot with
  const D = v.def, armoured = tg.kind === 'vehicle' && tg.cls !== 'jeep';
  if (tg.kind === 'air') return D.cls === 'ifv' ? D.ammo.find(k => AMMO[k].kind === 'he') || D.ammo[0] : D.mg || D.ammo.find(k => AMMO[k].kind === 'he') || D.ammo[0]; // autocannon or machine gun at aircraft
  if (armoured) {
    if (D.atgm && v.atgmReady > 0 && d > 350 && (tg.cls === 'mbt' || D.cls === 'ifv')) return 'atgm';
    return D.ammo.find(k => AMMO[k].kind === 'ap') || D.ammo[0];
  }
  if (tg.kind === 'soldier' && D.cls === 'mbt' && d < 700) return 'mg';
  return D.ammo.find(k => AMMO[k].kind === 'he') || D.ammo[0];
}
function ballisticPitch(R, dy, v, g) { const v2 = v * v, d = v2 * v2 - g * (g * R * R + 2 * dy * v2); if (d < 0) return .6; return Math.atan((v2 - Math.sqrt(d)) / (g * R)); }

/* ---------------- player ---------------- */
function playerStep(dt) {
  const s = PLAYER.s; if (!s || !s.alive) return;
  updateAim();
  if (s.veh && s.veh.kind === 'air') { if (s.veh.alive) { airPlayer(s.veh, dt); s.pos.copy(s.veh.pos); } return; }
  if (s.veh) {
    const v = s.veh;
    if (!v.alive) return;
    const inp = { throttle: (KEYS.KeyW ? 1 : 0) - (KEYS.KeyS ? 1 : 0), steer: (KEYS.KeyD ? 1 : 0) - (KEYS.KeyA ? 1 : 0), fire: MOUSE.l && locked, fire2: !!KEYS.KeyF && locked, fire3: !!KEYS.KeyT && locked, smoke: !!KEYS.KeyG, guide: () => CAM.aim.clone() };
    const A = AMMO[v.def.reload ? (v.loaded || v.sel) : v.sel], lased = v.def.lrf && vState(v).fcs && v.sightR > 0 && GAME.time - v.lrfT < 45, sol = aimSolution(v, CAM.aim, A, v.cls === 'jeep' ? 0 : lased ? v.sightR : 400); inp.aimYaw = sol.yaw; inp.aimPitch = sol.pitch; CAM.range = sol.range; CAM.lased = lased;
    inp.ess = !!KEYS.KeyH;
    driveVehicle(v, inp, dt);
    s.pos.copy(v.pos);
    Sound.engine(vState(v).power > 0, Math.abs(v.speed) / v.def.vmax + (inp.throttle ? .15 : 0), !v.def.wheeled, v.def.kw > 1000);
  } else {
    Sound.engine(false, 0);
    const inp = { fwd: (KEYS.KeyW ? 1 : 0) - (KEYS.KeyS ? 1 : 0), side: (KEYS.KeyD ? 1 : 0) - (KEYS.KeyA ? 1 : 0), sprint: KEYS.ShiftLeft || KEYS.ShiftRight, crouch: KEYS.KeyC, jump: KEYS.Space };
    s.yaw = CAM.yaw; s.pitch = CAM.pitch;
    moveSoldier(s, inp, dt); poseSoldier(s, dt);
    soldierShoot(s, CAM.aim, dt, MOUSE.l && locked, 0);
  }
}
function updateAim() { // what the middle of the screen points at
  const s = PLAYER.s; if (!s) return;
  const from = camera.position, dir = _v.set(0, 0, -1).applyQuaternion(camera.quaternion), end = _w.copy(from).addScaledVector(dir, 2500);
  const hit = traceAll(from, end, s.veh || s);
  CAM.aim.copy(from).lerp(end, hit ? hit.t : 1); CAM.aimEnt = hit && hit.ent;
  if (CAM.aim.distanceTo(from) < 8) CAM.aim.copy(from).addScaledVector(dir, 8);
}
function interact(bail) {
  const s = PLAYER.s; if (!s || !s.alive) return;
  if (s.veh && s.veh.kind === 'air') { const a = s.veh, slow = a.onGround && a.vel.length() < (a.cls === 'jet' ? 1 : 4); if (!slow && !bail) { if (a.cls !== 'jet') playerVehMsg('J: bail out'); return; } // (in a jet E is the right rudder and the nose-wheel steering, so it only lets you out once stopped)
    s.veh = null; a.driver = null; s.model.root.visible = true; s.pos.copy(a.pos); s.pos.y += slow ? 0 : -1.5; if (slow) { s.pos.x += Math.cos(a.hdg + Math.PI / 2) * 3; s.pos.z += Math.sin(a.hdg + Math.PI / 2) * 3; s.pos.y = groundY(s.pos.x, s.pos.z) + .1; s.vel.set(0, 0, 0); a.throttle = 0; a.vel.set(0, 0, 0); a.parked = true; } else { s.vel.copy(a.vel).multiplyScalar(.3); s.vel.y = 8; s.chute = true; a.pilotDead = true; a.lastAttacker = a.lastAttacker || null; showMsg('Bailed out', 'Your parachute opens'); } Sound.engine(false, 0); return; }
  if (s.veh) { exitVehicle(s); return; }
  const v = nearbyVehicle(s); if (!v) return;
  enterVehicle(s, v); if (v.kind === 'air') { v.parked = false; CAM.yaw = v.hdg; CAM.pitch = v.cls === 'jet' ? .02 : -.08; playerVehMsg(v.cls === 'jet' ? 'Back in the cockpit' : 'Back in the cockpit: hold Space to lift off'); }
}
function nearbyVehicle(s) { let best = null, bd = 7.5; for (const e of ENTS) if ((e.kind === 'vehicle' || (e.kind === 'air' && e.parked && e.onGround && !e.pilotDead)) && e.alive && !e.driver && e.team === s.team) { const d = Math.hypot(e.pos.x - s.pos.x, e.pos.z - s.pos.z) - (e.T || e.def).len / 2; /* (a parked aircraft of yours can be boarded again) */ if (d < bd) { bd = d; best = e; } } return best; }
function resupply(s, dt) { // at your base or a checkpoint you hold: ammo and health come back
  if (!s || !s.alive) return;
  const p = (s.veh || s).pos, M = GAME.M, b = M.bases[s.team];
  const home = Math.hypot(p.x - b.x * 1000, p.z - b.y * 1000) < 480 || GAME.cps.some(c => c.owner === s.team && inZone(c, p));
  if (!home) return;
  if (s.veh) return; // (vehicles restock through crewStep: ammunition, smoke, extinguishers, and full repairs)
  { s.hp = Math.min(SOLDIER_HP, s.hp + 8 * dt); if ((s.resT = (s.resT || 0) + dt) > 4) { s.resT = 0; s.ammo = Math.min(210, s.ammo + 30); s.rpg = Math.min(3, s.rpg + 1); } }
}

/* ---------------- thermal sight (gunner's sight only, as in War Thunder) ----------------
   The picture goes grey, the sky goes dark, and anything warm shows white: running vehicles, people, aircraft, fires. A first-generation sight is blurrier. */
const THERMAL = { want: false, on: false, t: 0, swapped: new Map() };
const HOT_MAT = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.6, 2.6, 2.6), toneMapped: false, fog: false }), WARM_MAT = new THREE.MeshBasicMaterial({ color: new THREE.Color(.55, .55, .55), toneMapped: false, fog: false });
function thermalUpdate(dt) {
  const s = PLAYER.s, v = s && s.alive && s.veh && (s.veh.kind === 'vehicle' || s.veh.cls === 'heli') ? s.veh : null;
  const on = !!(THERMAL.want && v && v.alive && CAM.zoom && v.def.thermal && (v.kind === 'air' ? pOK(v.part('nose')) : vState(v).fcs)); // (a helicopter's sight sits in its nose)
  if (on !== THERMAL.on) {
    THERMAL.on = on; const c = renderer.domElement;
    if (on) { c.style.filter = `grayscale(1) contrast(1.35) brightness(.8) blur(${v.def.thermal >= 2 ? .3 : 1.1}px)`; THERMAL.sky = [SKY.visible, REAL.sky ? REAL.sky.visible : false]; SKY.visible = false; if (REAL.sky) REAL.sky.visible = false; THERMAL.bg = scene.background; scene.background = new THREE.Color(0x0b0b0b); THERMAL.t = 0; }
    else { c.style.filter = ''; SKY.visible = THERMAL.sky[0]; if (REAL.sky) REAL.sky.visible = THERMAL.sky[1]; scene.background = THERMAL.bg; for (const [o, m] of THERMAL.swapped) o.material = m; THERMAL.swapped.clear(); }
  }
  if (!on || (THERMAL.t -= dt) > 0) return; THERMAL.t = .5;
  for (const e of ENTS) {
    const root = e.model && e.model.root; if (!root) continue;
    const hot = e.alive ? (e.kind === 'soldier' ? !e.veh : e.kind === 'vehicle' || e.kind === 'air') : (e.fire > 0 || e.burnT > 0); if (!hot) continue;
    const m = e.kind === 'vehicle' && e.alive && !e.driver ? WARM_MAT : HOT_MAT; // a parked vehicle has cooled
    root.traverse(o => { if (o.isMesh && !THERMAL.swapped.has(o) && o.material && !o.material.transparent) { THERMAL.swapped.set(o, o.material); o.material = m; } });
  }
}

/* ---------------- camera ---------------- */
function updateCamera(dt) {
  const s = PLAYER.s;
  CAM.zoom = MOUSE.r && locked;
  thermalUpdate(dt);
  let fov = 65;
  pilotG(s && s.alive && s.veh && s.veh.alive && s.veh.kind === 'air' ? s.veh : null, dt);
  if (s && s.veh && s.veh.alive && s.veh.kind === 'air') fov = airCamera(s.veh, dt);
  else if (s && !s.alive && PLAYER.wreck && PLAYER.wreck.model && GAME.time - PLAYER.wreckT < 16) fov = wreckCamera(PLAYER.wreck, dt); // your aircraft was destroyed: watch it go down
  else if (s && s.veh && s.veh.alive) {
    const v = s.veh, piv = _v.set(v.pos.x, v.pos.y + v.T.eye, v.pos.z);
    const dir = _w.set(Math.cos(CAM.yaw) * Math.cos(CAM.pitch), Math.sin(CAM.pitch), Math.sin(CAM.yaw) * Math.cos(CAM.pitch));
    if (CAM.zoom) { // gunner's sight
      v.model.root.updateMatrixWorld(true); camera.position.set(1.0, v.def.wheeled ? .75 : .95, v.def.wheeled ? 0 : .5).applyMatrix4(v.model.turret.matrixWorld); fov = !vState(v).optics ? 50 : v.cls === 'mbt' ? (KEYS.ShiftLeft ? 5 : 11) : v.cls === 'ifv' ? 16 : 34;
    } else {
      camera.position.copy(piv).addScaledVector(dir, -v.T.cam); camera.position.y += 1.6;
    }
    camera.lookAt(_n.copy(camera.position).addScaledVector(dir, 100));
  } else if (s) {
    const piv = _v.set(s.pos.x, s.pos.y + (s.crouch ? 1.2 : s.swim ? .4 : 1.6), s.pos.z);
    const dir = _w.set(Math.cos(CAM.yaw) * Math.cos(CAM.pitch), Math.sin(CAM.pitch), Math.sin(CAM.yaw) * Math.cos(CAM.pitch));
    const right = _n.set(-Math.sin(CAM.yaw), 0, Math.cos(CAM.yaw));
    const back = CAM.zoom ? 1.3 : 3.1, side = CAM.zoom ? .5 : .65;
    camera.position.copy(piv).addScaledVector(dir, -back).addScaledVector(right, side); camera.position.y += .15;
    if (!s.alive) { camera.position.copy(piv).addScaledVector(dir, -9); camera.position.y += 4; }
    pushOutCircle(camera.position, .25, camera.position.y - .2, camera.position.y + .2);
    camera.lookAt(_f.copy(camera.position).addScaledVector(dir, 100));
    if (CAM.zoom) fov = s.slot === 1 ? 45 : 38;
  } else { // deploy screen: a slow pan over your base
    camera.position.lerp(CAM.pos, .05); CAM.yaw += dt * .05;
    camera.lookAt(_v.set(CAM.pos.x + Math.cos(CAM.yaw) * 100, CAM.pos.y - 30, CAM.pos.z + Math.sin(CAM.yaw) * 100));
  }
  const gy = groundY(camera.position.x, camera.position.z) + .6; if (camera.position.y < gy) camera.position.y = gy;
  if (camera.position.y < .6 && terrainY(camera.position.x, camera.position.z) < 0) camera.position.y = .6;
  if (CAM.shake > 0) { CAM.shake = Math.max(0, CAM.shake - dt * 1.5); camera.position.x += (Math.random() - .5) * CAM.shake; camera.position.y += (Math.random() - .5) * CAM.shake; }
  if (Math.abs(camera.fov - fov) > .1) { camera.fov += (fov - camera.fov) * clamp(dt * 14, 0, 1); camera.updateProjectionMatrix(); }
  Sound.listener.copy(camera.position);
}
function shake(pt, k) { const d = pt.distanceTo(camera.position); if (d < 300) CAM.shake = Math.max(CAM.shake, k * (1 - d / 300)); }

/* ---------------- HUD ---------------- */
let msgT = 0;
function showMsg(big, small) { $('msg').innerHTML = big + (small ? `<small>${small}</small>` : ''); $('msg').style.opacity = 1; msgT = 4; }
function hitMarker(kill) { const h = $('hitm'); h.classList.toggle('kill', kill); h.style.opacity = 1; clearTimeout(h._t); h._t = setTimeout(() => h.style.opacity = 0, kill ? 350 : 120); Sound.play('hit', kill ? 1.4 : .8); }
function flashDamage() { const d = $('dmgFlash'); d.style.opacity = .8; clearTimeout(d._t); d._t = setTimeout(() => d.style.opacity = 0, 200); }
const WNAME = { m829a2: '120 mm APFSDS', m830a1: '120 mm HEAT', bm42: '125 mm APFSDS', bk29: '125 mm HEAT', of26: '125 mm HE', m791: '25 mm', m792: '25 mm HE', ubr6: '30 mm', uof8: '30 mm HE', tow2a: 'TOW', konkurs: 'Konkurs', cal50: '.50 cal', kord: 'Kord', m240: 'MG', pkt: 'MG', rpg7: 'RPG', he155: 'artillery', crew: 'crew knocked out', ap: 'APFSDS', heat: 'HEAT', he: 'HE', bullet: 'MG', fire: 'fire', ammo: 'ammo detonation',  rifle: 'rifle', npcRifle: 'rifle', rpg: 'rocket', cannon: '120 mm', coax: 'MG', auto30: '30 mm', hmg: 'HMG', howitzer: 'artillery', splash: 'blast', roadkill: 'run over' , m61: '20 mm cannon', gsh301: '30 mm cannon', m230: '30 mm chain gun', a42: '30 mm cannon', aim9x: 'AIM-9X', r73: 'R-73', agm65: 'Maverick', kh29t: 'Kh-29T', hellfire: 'Hellfire', vikhr: 'Vikhr', hydra: 'Hydra rockets', s8: 'S-8 rockets', mk82: 'Mk 82 bomb', fab250: 'FAB-250 bomb', crash: 'crash', aircraft: 'aircraft', cockpit: 'cockpit hit'};
function nameOf(e) { if (!e) return 'Something'; if (e.kind === 'gun') return `${TEAMS[e.team].name} howitzer`; if (e.kind === 'vehicle' || e.kind === 'air') return e.driver ? e.driver.name : e.def.short; return e.isPlayer ? 'You' : e.name || 'Guard'; }
function addFeed(by, victim, wk) {
  if (victim.kind === 'vehicle' || victim.kind === 'air') return;
  const d = document.createElement('div'), col = e => e ? TEAMS[e.team].css : '#ccc';
  d.innerHTML = `<b style="color:${col(by)}">${nameOf(by)}</b> <span class="mut">[${WNAME[wk] || wk || '?'}]</span> <b style="color:${col(victim)}">${nameOf(victim)}</b>`;
  $('feed').prepend(d); while ($('feed').children.length > 6) $('feed').lastChild.remove();
  setTimeout(() => d.remove(), 7000);
}
/* --- HUD drawing: small pictures for the action bar, plan views for the damage panel, side views for the line-up cards (all drawn here) --- */
const svg = (vb, body) => `<svg viewBox="0 0 ${vb}" aria-hidden="true">${body}</svg>`;
const GLYPH = {
  dart: svg('40 40', '<path d="M20 2l2.2 9v15l5 6v3l-5.6-2.2-.6 5h-2l-.6-5L12.8 35v-3l5-6V11z"/>'),
  heat: svg('40 40', '<path d="M19 3h2v7l3 5v19h-8V15l3-5z"/><path d="M15 35h10v2.5H15z"/>'),
  he: svg('40 40', '<path d="M20 4c4 4 5.5 9 5.5 14v16h-11V18c0-5 1.5-10 5.5-14z"/><path d="M14 35.500h12V38H14z"/>'),
  bullets: svg('40 40', '<path d="M11.500 8c1.800 2 2.500 4.500 2.500 7v17h-5V15c0-2.500.7-5 2.500-7zM20 8c1.800 2 2.500 4.500 2.500 7v17h-5V15c0-2.500.7-5 2.500-7zM28.500 8c1.800 2 2.500 4.500 2.500 7v17h-5V15c0-2.500.7-5 2.500-7z"/>'),
  missile: svg('40 40', '<path d="M20 2c2 2.500 2.600 5 2.600 8v6l5 5v3l-5-2v8l4 4v3l-5.400-2h-2.400L13.400 37v-3l4-4v-8l-5 2v-3l5-5v-6c0-3 .6-5.500 2.600-8z"/>'),
  rocket: svg('40 40', '<path d="M20 3c1.800 2.200 2.400 4.400 2.400 7v20l3.600 4.500V38l-4.600-2h-2.800L14 38v-3.500l3.600-4.500V10c0-2.600.6-4.800 2.400-7z"/>'),
  bomb: svg('40 40', '<path d="M20 4c5 4 7 9 7 14 0 5-2 9-4.500 12l2.500 3v5H15v-5l2.500-3C15 27 13 23 13 18c0-5 2-10 7-14z"/>'),
  smoke: svg('40 40', '<circle cx="14" cy="22" r="7"/><circle cx="24" cy="17" r="8.500"/><circle cx="27" cy="26" r="6.500"/><circle cx="18" cy="28" r="5.500"/>'),
  ext: svg('40 40', '<path d="M17 5h6v4h3l4 3-1.500 1.500-2.500-1.500h-2v3c2 1 3 3 3 5v15c0 1.100-.9 2-2 2h-8c-1.100 0-2-.9-2-2V20c0-2 1-4 3-5v-2.500h-1z"/>'),
  repair: svg('40 40', '<path d="M27.500 4a8 8 0 0 0-7.600 10.600L5.500 29a3.900 3.900 0 0 0 5.500 5.500l14.400-14.400A8 8 0 0 0 35.600 12l-4.800 4.800-4.600-1-1-4.600L30 6.400A8 8 0 0 0 27.500 4z"/>'),
  range: svg('40 40', '<path d="M19 3h2v9h-2zM19 28h2v9h-2zM3 19h9v2H3zM28 19h9v2h-9z"/><circle cx="20" cy="20" r="2.600"/><path fill-rule="evenodd" d="M20 8a12 12 0 1 0 0 24 12 12 0 0 0 0-24zm0 2.500a9.500 9.500 0 1 1 0 19 9.500 9.500 0 0 1 0-19z"/>'),
  thermal: svg('40 40', '<path fill-rule="evenodd" d="M20 10c8 0 14 6 17 10-3 4-9 10-17 10S6 24 3 20c3-4 9-10 17-10zm0 3.500a6.500 6.500 0 1 0 0 13 6.500 6.500 0 0 0 0-13z"/><circle cx="20" cy="20" r="3.200"/>'),
  flare: svg('40 40', '<path d="M20 3l2.600 10.500L31 7l-5 9.500 11 1.500-10.500 3.500L33 30l-9.500-4.200L20 37l-3.500-11.200L7 30l6.500-8.500L3 18l11-1.500L9 7l8.400 6.500z"/>'),
  rifle: svg('40 40', '<path d="M2 17h22v-2h3v2h11v3H27l-2 3h-6l-1.500-3H13l-4 8H4l3-8H2z"/>'),
  rpg: svg('40 40', '<path d="M2 18.500h21l5-5h3l-2 5h9v3h-9l2 5h-3l-5-5H2z"/>'),
  crew: svg('40 40', '<circle cx="20" cy="11" r="7"/><path d="M6 37c0-9 6-15 14-15s14 6 14 15z"/>'),
};
const ammoGlyph = A => A.look === 'dart' ? 'dart' : A.look === 'missile' ? 'missile' : A.look === 'rocket' ? 'rocket' : A.look === 'bomb' ? 'bomb' : A.kind === 'bullet' || A.look === 'tracer' ? 'bullets' : A.kind === 'heat' ? 'heat' : 'he';
const SIDE = { // side views for the line-up cards
  inf: svg('78 40', '<circle cx="39" cy="6.500" r="4"/><path d="M33.500 12h11l2 12h-3l-1 15h-3.200l-.8-12-.8 12h-3.200l-1-15h-3z"/><path d="M25 17.500h23v-1.500h2.500v1.500H54v2.200H44l-1.500 2.500h-4l-1-2.500H25z"/>'),
  mbt: svg('78 40', '<path d="M5 27h60l-4 9H10z"/><path d="M9 20h52l4 6H6z"/><path d="M22 10h23l5 9H19z"/><path d="M46 12.600h30V15H46z"/>'),
  ifv: svg('78 40', '<path d="M5 27h62l-4 9H10z"/><path d="M7 16h44l15 10H7z"/><path d="M27 8.500h14l2.500 7H25.500z"/><path d="M41 10.500h22v1.900H41z"/>'),
  jeep: svg('78 40', '<circle cx="20" cy="31" r="6.500"/><circle cx="58" cy="31" r="6.500"/><path d="M7 19h9l4-9h27l9 9h14v10h-3.500a8.500 8.500 0 0 0-17 0h-21a8.500 8.500 0 0 0-17 0H7z"/>'),
  heli: svg('78 40', '<path d="M12 7h64v1.700H12z"/><path d="M43 8h2v5h-2z"/><path d="M28 13h22c9 0 16 5 17 13v2H42c-8 0-14-6-14-15z"/><path d="M4 15.500h26v4H4z"/><path d="M2 8h2.600v15H2z"/><path d="M38 31h28v1.700H38zM46 28h2v3.500h-2zM58 28h2v3.500h-2z"/>'),
  jet: svg('78 40', '<path d="M3 25l9-2 15-6 18-2 30 8.500v2.500L46 29H14L3 27z"/><path d="M9 23L5 8h6l11 12.500z"/><path d="M40 15c4-4.500 11-4.500 15-.5z"/><path d="M24 27h18l-14 6h-6z"/>'),
};
const DCOL = { ok: '#57b84a', dmg: '#ecc63a', dead: '#dc3a2c', vac: '#0d131a' }; // green: working, yellow: damaged, red: knocked out
/* the damage panel: a plan view of what you are in on a round plate. st maps each part to ok, dmg, dead or vac (an empty seat) */
function dmgPanel(kind, st, title, lN, rN, rGlyph) {
  const P = (k, shape) => { const s = st[k]; if (!s) return ''; return shape.replace('/>', ` fill="${DCOL[s]}" stroke="${s === 'vac' ? '#8f9aa3' : '#eef2f5'}" stroke-width=".7"/>`); };
  const base = shape => shape.replace('/>', ' fill="#26323b" stroke="#dfe6ec" stroke-width=".8"/>');
  const crewAt = { driver: [50, 28.500], gunner: [55, 45.500], commander: [55, 52.500], loader: [45, 47] };
  let b = '<circle cx="50" cy="50" r="49" fill="rgba(20,30,46,.62)" stroke="rgba(200,212,224,.34)" stroke-width="1"/><circle cx="50" cy="50" r="33" fill="none" stroke="rgba(200,212,224,.2)" stroke-width="1"/>';
  if (kind === 'tank' || kind === 'car') {
    b += '<g transform="translate(50 51) scale(1.1) translate(-50 -48)">';
    if (kind === 'tank') b += (P('TRK L', '<rect x="30.500" y="23" width="7" height="58" rx="1.500"/>') + P('TRK R', '<rect x="62.500" y="23" width="7" height="58" rx="1.500"/>'));
    else b += ['31 27', '62.500 27', '31 64', '62.500 64'].map(p => base(`<rect x="${p.split(' ')[0]}" y="${p.split(' ')[1]}" width="6.500" height="13" rx="1.500"/>`)).join('');
    b += base('<rect x="38" y="21" width="24" height="62" rx="2.500"/>');
    b += P('RAD', '<rect x="41" y="60.500" width="18" height="3"/>') + P('ENG', '<rect x="41" y="64.500" width="18" height="11"/>') + P('TRN', '<rect x="41" y="76.500" width="18" height="4.500"/>');
    b += P('TRV', '<circle cx="50" cy="47" r="13.500"/>').replace(/fill="[^"]+"/, m => m.replace('#57b84a', 'rgba(87,184,74,.3)'));
    b += base('<rect x="40.500" y="36" width="19" height="22" rx="5"/>');
    b += P('BRL', '<rect x="48.600" y="8" width="2.800" height="28"/>') + P('BRC', '<rect x="47" y="37" width="6" height="8"/>') + P('ELV', '<rect x="54" y="38" width="3" height="4.500"/>') + P('FCS', '<rect x="42.500" y="38" width="3.500" height="3.500"/>') + P('SGT', '<rect x="56" y="32.500" width="3.500" height="3.500"/>') + P('ALD', '<rect x="44" y="52" width="12" height="4.500"/>');
    for (const role in crewAt) b += P(role, `<circle cx="${crewAt[role][0]}" cy="${crewAt[role][1]}" r="2.700"/>`);
    b += '</g>';
  } else if (kind === 'jet') {
    b += P('WING L', '<path d="M45 42L14 64v7l31-5z"/>') + P('WING R', '<path d="M55 42l31 22v7l-31-5z"/>') + P('TAIL', '<path d="M45 76L31 87v4l14-3zM55 76l14 11v4l-14-3z"/>');
    b += P('FUS', '<path d="M50 8c4 6 6 18 6 36v40H44V44c0-18 2-30 6-36z"/>');
    b += P('CKPT', '<ellipse cx="50" cy="27" rx="3" ry="6.500"/>') + P('FUEL', '<rect x="46.500" y="42" width="7" height="20"/>');
    b += P('ENG', '<rect x="46" y="68" width="8" height="15"/>') + P('ENG L', '<rect x="45" y="68" width="4.500" height="15"/>') + P('ENG R', '<rect x="50.500" y="68" width="4.500" height="15"/>');
  } else {
    const rs = st.ROTOR || 'ok';
    b += `<circle cx="50" cy="45" r="37" fill="none" stroke="${rs === 'ok' ? 'rgba(238,242,245,.55)' : DCOL[rs]}" stroke-width="1.200" stroke-dasharray="3 2.500"/><path d="M50 8v74M13 45h74" stroke="${rs === 'ok' ? 'rgba(238,242,245,.5)' : DCOL[rs]}" stroke-width="1.600"/>`;
    b += P('TAIL', '<path d="M48.500 58h3v32h5v2.500H43.500V90h5z"/>');
    b += P('FUS', '<path d="M50 14c6 4 8 16 7 36l-4 10h-6l-4-10c-1-20 1-32 7-36z"/>');
    b += P('ENG L', '<rect x="39" y="39" width="4.500" height="13"/>') + P('ENG R', '<rect x="56.500" y="39" width="4.500" height="13"/>');
    b += P('FUEL', '<rect x="46.500" y="50" width="7" height="7"/>') + P('XMSN', '<circle cx="50" cy="45" r="3.800"/>') + P('GUNNER', '<circle cx="50" cy="23" r="2.700"/>') + P('PILOT', '<circle cx="50" cy="32" r="2.700"/>');
  }
  return `<div class="dmgp">${svg('100 100', b)}<span class="nm">${title}</span>${lN != null ? `<span class="cl">${GLYPH.crew}${lN}</span>` : ''}${rN != null ? `<span class="cr">${GLYPH[rGlyph || 'he']}${rN}</span>` : ''}</div>`;
}
const stOf = (m, vacant) => vacant ? 'vac' : !m ? 'ok' : m.hp <= 0 ? 'dead' : m.hp < m.max * .6 ? 'dmg' : 'ok';
const ro = rows => `<div class="ro">${rows.map(r => r === 0 ? '<span class="gap"></span>' : typeof r === 'string' ? `<span class="dimm">${r}</span>` : `<i${r[4] ? ' class="sel"' : ''}>${r[0]}</i><b${r[3] ? ` class="${r[3]}"` : ''}>${r[1]}${r[2] ? `<small>${r[2]}</small>` : ''}</b>`).join('')}</div>`; // a bare read-out: label, value, unit, colour, selected
const HUDX = { alerts: [] };
const noteLines = notes => { // warnings go to the middle of the screen, the rest stays by the read-out
  HUDX.alerts = notes.filter(n => n.includes('class="warn"'));
  const rest = notes.filter(n => !n.includes('class="warn"'));
  return rest.length ? `<div class="notes">${rest.map(n => `<div>${n}</div>`).join('')}</div>` : '';
};
const slot = (key, glyph, label, count, o = {}) => `<div class="slot${o.sel ? ' sel' : ''}${o.out ? ' out' : ''}"><u>${key}</u><div>${o.rl != null ? `<i class="rl" style="height:${Math.round(o.rl * 100)}%"></i>` : ''}<em>${label}</em>${GLYPH[glyph]}${count === '' || count == null ? '' : `<b>${count}</b>`}${o.dot ? '<i class="dot"></i>' : ''}</div></div>`;
function vehStatusHTML(v) {
  const D = v.def, st = vState(v), r = v.roles, S = {};
  for (const role of D.crew) S[role] = stOf(r[role], !r[role] || r[role].hp <= 0);
  for (const [l, m] of [['ENG', v.mods.find(m => m.kind === 'engine')], ['TRN', v.mods.find(m => m.kind === 'trans')], ...(D.wheeled ? [] : [['TRK L', v.mod('trackL')], ['TRK R', v.mod('trackR')]]), ['BRL', v.mod('barrel')], ['BRC', v.mod('breech')], ['TRV', v.mod('hdrive')], ['ELV', v.mod('vdrive')], ['SGT', v.mod('optics')], ['FCS', v.mod('fcs')], ['RAD', v.mod('radiator')], ['ALD', v.mod('autoloader')]]) if (m) S[l] = stOf(m);
  const notes = [];
  if (v.fire > 0) notes.push(`<span class="warn">FIRE</span> ${v.fpe > 0 ? 'X: extinguisher' : 'no extinguishers left'}`);
  if (v.def.lws && PROJS.some(p => p.team !== v.team && p.A.guided && !p.A.saclos && p.guide && (() => { const t = p.guide(); return t && t.distanceToSquared(v.pos) < 30 * 30; })())) notes.push('<span class="warn">LASER WARNING</span> G: smoke');
  if (v.heat > 1) notes.push('<span class="warn">ENGINE OVERHEATING</span> stop and repair');
  if (!st.drive) notes.push('<span class="warn">IMMOBILISED</span>');
  if (v.atHome) notes.push('On a friendly point: full repair and resupply'); if (v.trackT > 0) notes.push(`Track back on in ${Math.ceil(8 - v.trackT)} s`);
  if (v.repairT > 0) notes.push(`Repairing: ${Math.ceil(v.repairT)} s`);
  else if (v.mods.some(m => m.kind !== 'crew' && m.kind !== 'ammo' && m.hp < m.max * .6)) notes.push('R: repair (stand still)');
  if (v.swapT > 0) notes.push('Crew changing seats');
  const lased = D.lrf && st.fcs && v.sightR > 0 && GAME.time - v.lrfT < 45, crewN = D.crew.filter(role => r[role] && r[role].hp > 0).length, rounds = v.load ? D.ammo.reduce((n, k) => n + (v.load[k] || 0), 0) : null;
  const rows = [['SPD', Math.round(Math.abs(v.speed) * 3.6), 'km/h']]; if (D.cls !== 'jeep') rows.push(['RNG', lased ? Math.round(v.sightR) : 400, 'm']);
  return dmgPanel(D.wheeled ? 'car' : 'tank', S, (D.short || D.name).toUpperCase(), crewN, rounds, ammoGlyph(AMMO[D.ammo[0]])) + ro(rows) + noteLines(notes);
}
function vehAmmoHTML(v) {
  const D = v.def, vs = vState(v);
  let state, bar = '', f = null;
  if (!vs.fire) state = '<span class="warn">GUN OUT</span>';
  else if (D.reload) { if (v.loaded) state = 'READY'; else if (!vs.loader) state = '<span class="warn">CANNOT LOAD</span>'; else if (v.load && D.ammo.every(k => v.load[k] <= 0)) state = '<span class="warn">NO AMMO</span>';
    else { f = clamp(1 - v.reload / (v.reloadOf || D.reload), 0, 1); state = `LOADING <small>${D.rack && v.rackN <= 0 ? 'ready rack empty: slow' : Math.ceil(v.reload) + ' s'}</small>`; bar = `<div class="load"><i style="width:${Math.round(f * 100)}%"></i></div>`; } }
  else state = 'READY';
  const s = D.ammo.map((k, i) => slot(i + 1, ammoGlyph(AMMO[k]), AMMO[k].type, v.load ? v.load[k] : '', { sel: v.sel === k, out: v.load && v.load[k] <= 0, dot: D.reload && v.loaded === k, rl: v.sel === k && f != null ? f : null }));
  if (D.mg) s.push(slot('F', 'bullets', 'MG', ''));
  if (D.atgm) s.push(slot('T', 'missile', AMMO[D.atgm].type, v.atgmReady + v.atgmLoad, { out: v.atgmReady + v.atgmLoad <= 0 }));
  if (D.smoke) s.push(slot('G', 'smoke', 'SMOKE', v.smoke, { out: v.smoke <= 0 }));
  if (D.ess) s.push(slot('H', 'smoke', 'ENGINE', v.ess, { out: v.ess <= 0 }));
  s.push(slot('X', 'ext', 'EXT', v.fpe, { out: v.fpe <= 0, sel: v.fire > 0 && v.fpe > 0 }));
  s.push(slot('R', 'repair', 'REPAIR', '', { sel: v.repairT > 0 }));
  if (D.lrf) s.push(slot('V', 'range', 'RANGE', ''));
  if (D.thermal) s.push(slot('N', 'thermal', 'THERMAL', ''));
  return `<div class="gunst">${state}${bar}${D.rack ? `<small>Ready rack ${v.rackN}/${D.rack}</small>` : ''}</div><div class="slots2">${s.join('')}</div>`;
}
function renderCpBar() {
  const C = GAME.cps, me = GAME.team, s = PLAYER.s, pos = s && s.alive ? (s.veh || s).pos : null;
  let h = '';
  for (const c of C) {
    const cls = c.owner === 0 ? ' blue' : c.owner === 1 ? ' red' : '', lock = !canCapture(me, c.i) && c.owner !== me ? ' lock' : '', pct = Math.round(Math.abs(c.val) * 100), col = c.val > 0 ? 'var(--blue)' : 'var(--red)';
    const fill = c.owner === -1 ? (pct > 0 ? `--fill:${col};--p:${pct}%` : '') : pct < 100 ? `--fill:#59646c;--p:${100 - pct}%` : ''; // a neutral diamond fills with the taker's colour; a held one drains as it is taken off you
    h += `<div class="cp${cls}${lock}${c.p.size === 'L' ? ' big' : ''}${pos && inZone(c, pos) ? ' here' : ''}" title="${c.p.name}" style="${fill}"><em>${c.i + 1}</em>${c.guardsLeft ? `<small>${c.guardsLeft}</small>` : ''}</div>`;
  }
  setHTML($('cpbar'), h);
  const n = [0, 1].map(t => C.filter(c => c.owner === t).length);
  for (const [id, v] of [['scB', n[0]], ['scR', n[1]], ['dScB', n[0]], ['dScR', n[1]]]) if ($(id)._t !== v) { $(id).textContent = v; $(id)._t = v; }
}
const HELP = { // the key reminder for whatever you are in (F1 shows and hides it)
  foot: [['W A S D', 'Move'], ['Shift', 'Sprint'], ['C', 'Crouch'], ['Space', 'Jump'], ['1 / 2', 'Rifle / rockets'], ['R', 'Reload'], ['E', 'Get in a vehicle'], ['M', 'Map']],
  veh: [['W A S D', 'Drive'], ['Right click', 'Gun sight (Shift: zoom)'], ['1 2 3', 'Shell'], ['F / T', 'Machine gun / missile'], ['V', 'Rangefinder'], ['N', 'Thermal sight'], ['G / H', 'Smoke / engine smoke'], ['R', 'Repair (stand still)'], ['X', 'Extinguisher'], ['E', 'Get out'], ['M', 'Map']],
  jet: [['Mouse', 'The jet follows your aim'], ['W / S', 'Throttle'], ['A / D', 'Roll'], ['Q / E', 'Rudder'], ['B', 'Airbrake'], ['Left click', 'Fire the chosen weapon'], ['1 - 4', 'Weapon'], ['F', 'Gun'], ['G', 'Flares'], ['X', 'Fire handle'], ['Right click', 'Cockpit view'], ['J', 'Bail out'], ['M', 'Map']],
  heli: [['Mouse', 'The nose follows your aim'], ['W / S', 'Nose down / up'], ['A / D', 'Roll'], ['Space / C', 'Collective up / down'], ['H', 'Hover mode'], ['Left click', 'Fire the chosen weapon'], ['1 - 4', 'Weapon'], ['F', 'Gun'], ['N', 'Thermal (zoomed)'], ['G', 'Flares'], ['Right click', 'Zoom'], ['E', 'Get out (landed)'], ['J', 'Bail out'], ['M', 'Map']],
};
const setHTML = (el, h) => { if (el._h !== h) { el.innerHTML = h; el._h = h; } }; // (only touch the page when something changed)
const COMP_PX = 3.4; // compass tape: pixels per degree
addEventListener('resize', () => { const cs = document.getElementById('compStrip'); if (cs) cs._w = 0; });
let hudT = 0, miniT = 0;
const tagEls = [];
function updateHUD(dt) {
  if ((msgT -= dt) <= 0) $('msg').style.opacity = 0;
  hudT -= dt; if (hudT <= 0) { hudT = .2; renderCpBar(); }
  const left = Math.max(0, MATCH_S - GAME.time), clk = `${String(Math.floor(left / 60)).padStart(2, '0')}:${String(Math.floor(left % 60)).padStart(2, '0')}`; if ($('clock')._t !== clk) { $('clock').textContent = clk; $('clock')._t = clk; }
  { const cs = $('compStrip'); // the compass tape: which way you are looking (north is up the map)
    if (!cs._b) { cs._b = 1; const N = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']; let h = ''; for (let d = -360; d < 720; d += 5) { const x = (d + 360) * COMP_PX, m = ((d % 360) + 360) % 360; h += `<u class="${m % 15 ? '' : 'm'}" style="left:${x}px"></u>`; if (m % 15 === 0) h += `<b class="${m % 45 ? '' : 'c'}" style="left:${x}px">${m % 45 ? String(m).padStart(3, '0') : N[m / 45]}</b>`; } cs.innerHTML = h; }
    const brg = ((CAM.yaw * 180 / Math.PI + 90) % 360 + 360) % 360; if (!cs._w) cs._w = cs.parentNode.clientWidth / 2; cs.style.transform = `translateX(${((cs._w || 170) - (brg + 360) * COMP_PX).toFixed(1)}px)`; }
  const s = PLAYER.s, alive = s && s.alive;
  const inAir = alive && s.veh && s.veh.kind === 'air';
  $('cross').style.display = alive && (inAir || !(s.veh && CAM.zoom)) ? '' : 'none';
  $('scope').style.display = alive && s.veh && !inAir && CAM.zoom ? 'block' : 'none';
  // where the gun points right now (the turret lags behind your aim)
  let gm = false;
  if (inAir && s.veh.alive) { // jets: the gun pipper, or where a bomb would land
    const a = s.veh, W = a.def.weapons[a.sel], A = AMMO[W.k];
    let p = null; if (A.look === 'bomb') p = ccipPoint(a, new V3()); else if (A.look === 'rocket') p = rocketPoint(a, A, new V3()); else if (a.cls === 'jet' && W.k === a.def.weapons[0].k) { axes(a); p = a.pos.clone().addScaledVector(_ax, 700).addScaledVector(_ay, 8); }
    if (p) { _v.copy(p).project(camera); if (_v.z < 1) { gm = true; const el = $('gunMark'); el.style.left = ((_v.x + 1) / 2 * innerWidth) + 'px'; el.style.top = ((1 - _v.y) / 2 * innerHeight) + 'px'; } }
  } else if (alive && s.veh && s.veh.alive) {
    const v = s.veh, mz = new V3(), dir = new V3(); muzzleOf(v, mz, dir);
    const Wp = AMMO[v.def.reload ? (v.loaded || v.sel) : v.sel], Dh = Math.max(60, Math.hypot(CAM.aim.x - mz.x, CAM.aim.z - mz.z)), hz = Math.max(.05, Math.hypot(dir.x, dir.z));
    if (Wp.kind !== 'bullet') { const t = Dh / (Wp.v * hz); _v.copy(mz).addScaledVector(dir, Wp.v * t); _v.y -= .5 * (Wp.g ?? 9.8) * t * t; } // where the shell would come down
    else _v.copy(mz).addScaledVector(dir, Dh / hz);
    _v.project(camera);
    if (_v.z < 1) { gm = true; const el = $('gunMark'); el.style.left = ((_v.x + 1) / 2 * innerWidth) + 'px'; el.style.top = ((1 - _v.y) / 2 * innerHeight) + 'px'; }
  }
  $('gunMark').style.display = gm ? 'block' : 'none';
  const si = $('sightInfo'), showSi = alive && s.veh && !inAir && CAM.zoom;
  si.style.display = showSi ? 'block' : 'none';
  if (showSi) { const v = s.veh, k = v.def.reload ? (v.loaded || v.sel) : v.sel; si.textContent = `${v.cls === 'jeep' ? '' : CAM.lased ? `RNG ${Math.round(v.sightR)} m (lased)` : v.def.lrf ? 'RNG 400 m (battle sight) · V: lase' : 'RNG 400 m (battle sight)'} · ${AMMO[k].type} ${AMMO[k].name}${v.def.reload ? (v.loaded ? ' · LOADED' : ' · LOADING') : ''}`; }
  // the read-out, the damage panel and the action bar
  HUDX.alerts = [];
  if (alive) {
    $('status').classList.toggle('air', !!inAir);
    if (s.veh) {
      const v = s.veh; if (v.kind === 'air') { setHTML($('status'), airStatusHTML(v)); setHTML($('bar'), airAmmoHTML(v)); } else { setHTML($('status'), vehStatusHTML(v)); setHTML($('bar'), vehAmmoHTML(v)); }
    } else {
      const seg = Math.ceil(clamp(s.hp, 0, 100) / 10);
      setHTML($('status'), `<div class="hpbar${s.hp < 35 ? ' low' : ''}">${'<i class="f"></i>'.repeat(seg)}${'<i></i>'.repeat(10 - seg)}</div>${ro([['HP', Math.max(0, Math.round(s.hp))], ...(s.swim ? ['Swimming'] : s.crouch ? ['Crouched'] : [])])}`);
      setHTML($('bar'), `<div class="gunst">${s.slot === 1 ? `ROCKETS <small>${s.rpg} left</small>` : s.reload > 0 ? 'RELOADING' : `RIFLE <small>${s.mag} in the magazine</small>`}</div><div class="slots2">${slot(1, 'rifle', 'RIFLE', s.ammo, { sel: s.slot === 0 })}${slot(2, 'rpg', 'ROCKETS', s.rpg, { sel: s.slot === 1, out: s.rpg <= 0 })}</div>`);
    }
  } else { setHTML($('status'), ''); setHTML($('bar'), ''); }
  setHTML($('alerts'), HUDX.alerts.map(n => `<div>${n}</div>`).join(''));
  // the capture message
  let cm = '';
  if (alive) {
    const p = (s.veh || s).pos, c = GAME.cps.find(c => inZone(c, p));
    if (c) {
      const my = GAME.team, ownedByMe = c.owner === my;
      if (c.guardsLeft > 0) cm = `${c.p.name}<br><span style="color:var(--guard)">Clear the guards first: ${c.guardsLeft} left</span>`;
      else if (ownedByMe && Math.abs(c.val) >= 1) cm = `${c.p.name}<br><span>Held</span>`;
      else if (!canCapture(my, c.i)) cm = `${c.p.name}<br><span>Not open yet: take ${GAME.cps[my === 0 ? c.i - 1 : c.i + 1].p.name} first</span>`;
      else { const toward = my === 0 ? c.val : -c.val, contested = c.inside[1 - my] > 0; cm = `${contested ? 'Contested:' : toward >= 0 ? 'Capturing' : 'Neutralising'} ${c.p.name}<div class="bar"><i style="width:${(toward >= 0 ? toward : 1 + toward) * 100}%"></i></div>`; }
    }
  }
  if ($('capMsg')._v !== cm) { $('capMsg').innerHTML = cm; $('capMsg')._v = cm; }
  // prompt
  let pr = '';
  if (alive && !s.veh) { const v = nearbyVehicle(s); if (v) pr = `<kbd>E</kbd>Get in the ${(v.T || v.def).short || (v.T || v.def).name}`; }
  else if (alive && s.veh) pr = '';
  setHTML($('prompt'), pr); $('prompt').classList.toggle('hidden', !pr);
  { const mode = !alive ? '' : inAir ? (s.veh.cls === 'jet' ? 'jet' : 'heli') : s.veh ? 'veh' : 'foot'; if (mode !== GAME.helpMode) { GAME.helpMode = mode; GAME.helpT = performance.now(); }
    const show = GAME.helpOn || performance.now() - (GAME.helpT || 0) < 20000;
    $('help2').classList.toggle('air', !!inAir);
    setHTML($('help2'), !alive ? '' : `<div class="spnow">SPAWN POINTS<b>${PLAYER.sp}</b></div>` + (show ? `<div class="keys2"><h5>Controls</h5>${HELP[mode].map(([k, t]) => `<span>${t}</span><i>${k}</i>`).join('')}<em>F1 hides this</em></div>` : '<div class="f1">F1: controls</div>')); }
  // ally tags
  let n = 0;
  if (alive) for (const e of ENTS) {
    if (!e.alive || e.team !== GAME.team || e === s || e === s.veh || (e.kind === 'soldier' && e.veh) || e.kind === 'gun') continue;
    const d = e.pos.distanceTo(camera.position); if (d > (e.kind === 'air' ? 4000 : 700)) continue;
    _v.set(e.pos.x, e.pos.y + (e.kind === 'vehicle' || e.kind === 'air' ? e.T.hgt + 1.2 : 2.1), e.pos.z).project(camera);
    if (_v.z > 1 || Math.abs(_v.x) > 1 || Math.abs(_v.y) > 1) continue;
    let el = tagEls[n]; if (!el) { el = document.createElement('div'); el.className = 'tag'; $('tags').appendChild(el); tagEls[n] = el; }
    el.style.display = ''; el.style.left = ((_v.x + 1) / 2 * innerWidth) + 'px'; el.style.top = ((1 - _v.y) / 2 * innerHeight) + 'px'; el.style.color = TEAMS[GAME.team].css;
    const nm = e.kind === 'vehicle' || e.kind === 'air' ? (e.driver ? e.driver.name : '') : e.name; if (el._n !== nm) { el.textContent = nm; el._n = nm; }
    if (++n >= 30) break;
  }
  for (let i = n; i < tagEls.length; i++) tagEls[i].style.display = 'none';
  if ((miniT -= dt) <= 0) { miniT = .1; drawMini(); }
}
function drawMapLayer(g, x0, z0, scale, W2, H2, big, o = {}) { // world (x0,z0) at canvas (0,0), px per metre = scale. o.u: how much to enlarge marks and lettering; o.spawns, o.sel: the deploy screen's spawn points
  const M = GAME.M, P = (x, z) => [(x - x0) * scale, (z - z0) * scale], u = o.u || 1, DISP = "'Barlow Condensed', sans-serif", TXT = "'Barlow Semi Condensed', sans-serif";
  const OWN = c => c.owner === 0 ? '#3f7df2' : c.owner === 1 ? '#e8483a' : '#59646c';
  g.drawImage(M.img, -x0 * scale, -z0 * scale, WORLD_W * scale, WORLD_H * scale);
  // the grid: 2 km squares, numbered across and lettered down
  g.lineWidth = Math.max(1, u * .8); g.strokeStyle = 'rgba(16,22,28,.42)'; g.beginPath();
  for (let x = 2000; x < WORLD_W; x += 2000) { const px = Math.round((x - x0) * scale) + .5; if (px > 0 && px < W2) { g.moveTo(px, 0); g.lineTo(px, H2); } }
  for (let z = 2000; z < WORLD_H; z += 2000) { const py = Math.round((z - z0) * scale) + .5; if (py > 0 && py < H2) { g.moveTo(0, py); g.lineTo(W2, py); } }
  g.stroke();
  g.textAlign = 'center'; g.textBaseline = 'middle';
  if (big) {
    g.font = `600 ${15 * u}px ${DISP}`; g.fillStyle = 'rgba(232,236,239,.8)'; g.strokeStyle = 'rgba(10,14,18,.75)'; g.lineWidth = 3 * u;
    for (let k = 0; k * 2000 < WORLD_W; k++) { const [x] = P(k * 2000 + 1000, 0); g.strokeText(String(k + 1), x, 11 * u); g.fillText(String(k + 1), x, 11 * u); }
    for (let k = 0; k * 2000 < WORLD_H; k++) { const [, y] = P(0, Math.min(k * 2000 + 1000, WORLD_H - 350)); g.strokeText('ABCDEFGH'[k], 10 * u, y); g.fillText('ABCDEFGH'[k], 10 * u, y); }
    g.font = `italic 500 ${13 * u}px ${TXT}`; g.lineWidth = 3 * u; g.strokeStyle = 'rgba(214,208,180,.7)'; g.fillStyle = '#23282a';
    const taken = GAME.cps.map(c => { const [x, y] = P(c.p.x * 1000, c.p.y * 1000), r = (c.p.size === 'L' ? 13 : 11) * u; return [x, c.i % 2 === 1 ? y - (r + 28 * u) : y + (r + 28 * u)]; }); // where the checkpoint name plates will go
    for (const t of M.towns) { let [x, y] = P(t.x * 1000, t.y * 1000 - t.r * 1000 - 130); const hit = () => taken.some(([px, py]) => Math.abs(px - x) < 82 * u && Math.abs(py - y) < 30 * u);
      if (hit()) { y = P(0, t.y * 1000 + t.r * 1000 + 130)[1]; if (hit()) continue; } // a town's name moves below the town, or is left out, rather than hide under a plate
      g.strokeText(t.n, x, y); g.fillText(t.n, x, y); }
  }
  const plate = (lines, x, y) => { // a name on a dark plate, like the rest of the interface
    g.font = `600 ${14 * u}px ${TXT}`; let w = g.measureText(lines[0][0]).width; if (lines[1]) { g.font = `500 ${12 * u}px ${TXT}`; w = Math.max(w, g.measureText(lines[1][0]).width); }
    const h = (lines[1] ? 31 : 19) * u, pw = w + 14 * u;
    g.fillStyle = 'rgba(16,23,31,.86)'; g.fillRect(x - pw / 2, y - h / 2, pw, h); g.strokeStyle = 'rgba(0,0,0,.7)'; g.lineWidth = 1; g.strokeRect(Math.round(x - pw / 2) + .5, Math.round(y - h / 2) + .5, Math.round(pw), Math.round(h));
    g.font = `600 ${14 * u}px ${TXT}`; g.fillStyle = lines[0][1] || '#e8ecef'; g.fillText(lines[0][0], x, y - (lines[1] ? 6.5 * u : -1 * u));
    if (lines[1]) { g.font = `500 ${12 * u}px ${TXT}`; g.fillStyle = lines[1][1] || '#cfd6c0'; g.fillText(lines[1][0], x, y + 8 * u); }
  };
  const brackets = (x, y, r) => { g.strokeStyle = '#fff'; g.lineWidth = 2 * u; const k = r * .45; g.beginPath(); for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) { g.moveTo(x + sx * r, y + sy * (r - k)); g.lineTo(x + sx * r, y + sy * r); g.lineTo(x + sx * (r - k), y + sy * r); } g.stroke(); };
  for (const c of GAME.cps) {
    const [x, y] = P(c.p.x * 1000, c.p.y * 1000), r = (big ? (c.p.size === 'L' ? 13 : 11) : 9) * u, z = c.p.zone;
    if (z) { g.save(); g.translate(x, y); g.rotate(z.ang || 0); g.setLineDash([5 * u, 4 * u]); g.strokeStyle = c.owner === -1 ? 'rgba(20,26,32,.8)' : OWN(c); g.lineWidth = 1.5 * u; g.strokeRect(-z.hx * 1000 * scale, -z.hy * 1000 * scale, z.hx * 2000 * scale, z.hy * 2000 * scale); g.setLineDash([]); g.restore(); }
    if (o.spawns && o.spawns.includes(c.i)) { g.strokeStyle = '#e3ad3c'; g.lineWidth = 2 * u; g.beginPath(); g.arc(x, y, r + 9 * u, 0, TAU); g.stroke(); }
    g.beginPath(); g.moveTo(x, y - r * 1.25); g.lineTo(x + r * 1.25, y); g.lineTo(x, y + r * 1.25); g.lineTo(x - r * 1.25, y); g.closePath();
    g.fillStyle = OWN(c); g.fill(); g.strokeStyle = 'rgba(0,0,0,.8)'; g.lineWidth = 4 * u; g.stroke(); g.strokeStyle = '#f2f4f5'; g.lineWidth = 2 * u; g.stroke();
    g.fillStyle = '#fff'; g.font = `700 ${(big ? 16 : 13) * u}px ${DISP}`; g.fillText(String(c.i + 1), x, y + 1 * u);
    if (o.sel === c.i) brackets(x, y, r + 13 * u);
    if (big) { const up = c.i % 2 === 1; plate([[c.p.name], c.guardsLeft ? [`${c.guardsLeft} guards`] : null], x, up ? y - (r + 28 * u) : y + (r + 28 * u)); } // (names alternate above and below the road so that neighbours never run into each other)
  }
  for (const [t, b] of M.bases.entries()) {
    const [x, y] = P(b.x * 1000, b.y * 1000), r = (big ? 9 : 7) * u;
    if (o.spawns && t === GAME.team) { g.strokeStyle = '#e3ad3c'; g.lineWidth = 2 * u; g.beginPath(); g.arc(x, y, r + 11 * u, 0, TAU); g.stroke(); }
    g.fillStyle = t === 0 ? '#3f7df2' : '#e8483a'; g.fillRect(x - r, y - r, r * 2, r * 2); g.strokeStyle = 'rgba(0,0,0,.8)'; g.lineWidth = 4 * u; g.strokeRect(x - r, y - r, r * 2, r * 2); g.strokeStyle = '#f2f4f5'; g.lineWidth = 2 * u; g.strokeRect(x - r, y - r, r * 2, r * 2);
    if (o.spawns && o.sel === -1 && t === GAME.team) brackets(x, y, r + 15 * u);
    if (big) plate([[`${TEAMS[t].name} base`, t === 0 ? '#8fb4ff' : '#ff9084']], x, y + r + 20 * u);
  }
  const me = PLAYER.s && PLAYER.s.alive ? (PLAYER.s.veh || PLAYER.s) : null, k = u;
  for (const e of ENTS) {
    if (!e.alive || (e.kind === 'soldier' && e.veh) || e === me) continue;
    const ally = e.team === GAME.team; if (e.team === 2) continue;
    if (!ally && !(me && e.pos.distanceTo(me.pos) < (e.kind === 'air' ? 2500 : 350))) continue;
    const [x, y] = P(e.pos.x, e.pos.z);
    g.fillStyle = e.team === 0 ? '#3f7df2' : '#e8483a'; g.strokeStyle = 'rgba(0,0,0,.75)'; g.lineWidth = 1;
    if (e.kind === 'air') { const h = Math.atan2(e.vel.z, e.vel.x) || e.hdg; g.save(); g.translate(x, y); g.rotate(h); g.scale(k, k); g.beginPath(); g.moveTo(7, 0); g.lineTo(-5, 5); g.lineTo(-3, 0); g.lineTo(-5, -5); g.closePath(); g.fill(); g.stroke(); g.restore(); }
    else if (e.kind === 'vehicle') { g.save(); g.translate(x, y); g.rotate(e.yaw); g.scale(k, k); g.fillRect(-5, -3, 10, 6); g.strokeRect(-5, -3, 10, 6); g.restore(); } else if (e.kind === 'gun') { g.fillRect(x - 2 * k, y - 2 * k, 4 * k, 4 * k); } else { g.beginPath(); g.arc(x, y, 2.6 * k, 0, TAU); g.fill(); g.stroke(); }
  }
  if (me) { const [x, y] = P(me.pos.x, me.pos.z); g.save(); g.translate(x, y); g.rotate(CAM.yaw); g.scale(k, k); g.fillStyle = '#fff'; g.strokeStyle = '#000'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(8, 0); g.lineTo(-5, 5); g.lineTo(-2, 0); g.lineTo(-5, -5); g.closePath(); g.fill(); g.stroke(); g.restore(); }
}
function drawMini() {
  const cv = $('mini'), g = cv.getContext('2d'), S = cv.width, me = PLAYER.s ? (PLAYER.s.veh || PLAYER.s).pos : CAM.pos, view = 2400, scale = S / view;
  g.fillStyle = '#17222c'; g.fillRect(0, 0, S, S);
  drawMapLayer(g, me.x - view / 2, me.z - view / 2, scale, S, S, false, { u: 1.5 });
  g.textAlign = 'center'; g.textBaseline = 'alphabetic'; g.font = "700 22px 'Barlow Condensed', sans-serif"; g.lineWidth = 4; g.strokeStyle = 'rgba(10,14,18,.8)'; g.strokeText('N', S / 2, 21); g.fillStyle = '#e8ecef'; g.fillText('N', S / 2, 21);
}
function drawBig() { const cv = $('bigCv'), g = cv.getContext('2d'); g.fillStyle = '#17222c'; g.fillRect(0, 0, cv.width, cv.height); drawMapLayer(g, 0, 0, cv.width / WORLD_W, cv.width, cv.height, true, { u: 1.25 }); }

/* ---------------- deploy screen ---------------- */
const CLASSES = [
  { id: 'inf', name: 'Rifleman', info: 'Rifle and 3 rockets. Can spawn at checkpoints you hold.' },
  { id: 'mbt', veh: true }, { id: 'ifv', veh: true }, { id: 'jeep', veh: true },
  { id: 'heli', air: true }, { id: 'jet', air: true }, { id: 'boat', name: 'Patrol boat', info: 'Next update', off: true },
];
function openDeploy(why) {
  GAME.deploying = true; document.exitPointerLock && document.exitPointerLock();
  if (PLAYER.s && !PLAYER.s.alive) { const s = PLAYER.s; setTimeout(() => { if (PLAYER.s !== s) removeEnt(s); }, 8000); PLAYER.s = null; }
  if (why === 'redeploy' && PLAYER.s) { const s = PLAYER.s, v = s.veh; if (v) { exitVehicle(s); v.emptyBy = 'redeploy'; } removeEnt(s); PLAYER.s = null; } // (the vehicle left behind is cleared away like any other abandoned one)
  $('dEye').textContent = `[Checkpoints] ${GAME.M.name}`; $('dFlag').style.background = TEAMS[GAME.team].css; GAME.deployWhy = why;
  renderDeploy(); $('deploy').classList.remove('hidden');
}
function renderDeploy() {
  const sel = GAME.sel;
  if (sel.cls !== 'inf') sel.where = -1;
  if (sel.where >= 0 && !canSpawnAt(GAME.team, sel.where)) sel.where = -1;
  if ((SP_COST[sel.cls] || 0) > PLAYER.sp) sel.cls = 'inf';
  const defOf = c => c.veh ? VEH[TEAM_VEH[GAME.team][c.id]] : c.air ? AIR[TEAM_AIR[GAME.team][c.id]] : null, list = CLASSES.filter(c => !c.off);
  $('dClasses').innerHTML = list.map(c => { const d = defOf(c), cost = SP_COST[c.id] || 0, poor = cost > PLAYER.sp;
    const sub = poor ? `Needs ${cost - PLAYER.sp} more spawn points` : c.veh ? `${{ mbt: 'Tank', ifv: 'Infantry fighting vehicle', jeep: 'Light vehicle' }[d.cls]}` : c.air ? (d.cls === 'jet' ? 'Jet fighter' : 'Attack helicopter') : 'Infantry';
    return `<button class="card${sel.cls === c.id ? ' on' : ''}" data-c="${c.id}" ${poor ? 'disabled' : ''}><div class="face">${SIDE[c.id]}<b>${d ? d.short || d.name : c.name}</b><em>${cost || 'Free'}${cost ? '<small>SP</small>' : ''}</em></div><div class="sub">${sub}</div></button>`; }).join('');
  { const c = list.find(c => c.id === sel.cls) || list[0], d = defOf(c);
    const tile = (t, n) => `<div><b>${t}</b><span>${n}</span></div>`;
    $('dTabs').innerHTML = `<span>${c.air ? 'Weapons' : c.veh ? 'Ammunition' : 'Kit'}</span>`;
    $('dLoad').innerHTML = c.veh ? d.ammo.map(k => tile(`${AMMO[k].type} × ${d.load ? d.load[k] : ''}`, AMMO[k].name)).join('') + (d.atgm ? tile(`${AMMO[d.atgm].type} × ${1 + (d.atgmLoad || 0)}`, AMMO[d.atgm].name) : '') + (d.mg ? tile('Machine gun', AMMO[d.mg].name) : '')
      : c.air ? d.weapons.map(w => tile(`${AMMO[w.k].type} × ${w.n}`, AMMO[w.k].name)).join('') : tile('Rifle', '30-round magazines') + tile('Rockets × 3', 'RPG');
    const F = c.veh ? [['Vehicle', d.name], ['Top speed', `${Math.round(d.vmax * 3.6)} km/h`], ['Weight', `${d.mass} t`], ['Crew', d.crew.length]] : c.air ? [['Aircraft', d.name], ['Type', d.cls === 'jet' ? 'Jet fighter' : 'Attack helicopter'], ['Weight', `${(d.mass / 1000).toFixed(1)} t`], ['Starts', d.cls === 'jet' ? 'On your runway' : 'On your helipad']] : [['Soldier', 'Rifleman'], ['Starts', 'Base or a checkpoint you hold']];
    $('dFields').innerHTML = F.map(([l, v]) => `<label>${l}<b>${v}</b></label>`).join('');
    $('dInfo').textContent = (d ? d.info : c.info) + (c.id === 'inf' ? '' : ' Vehicles and aircraft start at your base.'); }
  { const me = GAME.team, order = me === 0 ? GAME.cps : [...GAME.cps].reverse(), next = order.find(c => c.owner !== me && canCapture(me, c.i)), held = GAME.cps.filter(c => c.owner === me).length;
    $('dObj').innerHTML = [next ? `Capture ${next.p.name}${next.guardsLeft ? `: clear its ${next.guardsLeft} guards, then stand inside` : ''}` : 'Hold every checkpoint', `Hold what you have: ${held} of ${GAME.cps.length}`, 'Hold all five to win, or the most when the time runs out'].map(t => `<li>${t}</li>`).join(''); }
  $('dSp').textContent = PLAYER.sp;
  const spots = [{ i: -1, n: `${TEAMS[GAME.team].name} base` }, ...GAME.cps.filter(c => canSpawnAt(GAME.team, c.i)).map(c => ({ i: c.i, n: `${c.i + 1} · ${c.p.name}` }))];
  $('dWhere').innerHTML = spots.map(s => `<button class="btn${sel.where === s.i ? ' on' : ''}" data-w="${s.i}" ${s.i >= 0 && sel.cls !== 'inf' ? 'disabled title="Vehicles start at your base"' : ''}>${s.n}</button>`).join('');
  $('dWhere')._key = spots.map(s => s.i).join() + '|' + PLAYER.sp;
  refreshDeploy();
}
function refreshDeploy() { // the parts that change while you look at it (rebuilding the buttons would eat clicks)
  const key = [-1, ...GAME.cps.filter(c => canSpawnAt(GAME.team, c.i)).map(c => c.i)].join() + '|' + PLAYER.sp;
  if (key !== $('dWhere')._key) return renderDeploy();
  const dm = $('dMap'), g = dm.getContext('2d'); g.fillStyle = '#17222c'; g.fillRect(0, 0, dm.width, dm.height);
  drawMapLayer(g, 0, 0, dm.width / WORLD_W, dm.width, dm.height, true, { u: dm.width / 751, spawns: [...GAME.cps.filter(c => canSpawnAt(GAME.team, c.i)).map(c => c.i)], sel: GAME.sel.where });
  const wait = Math.max(0, GAME.deployT); $('dGo').disabled = wait > 0; $('dWait').textContent = wait > 0 ? `${GAME.deployWhy === 'dead' ? 'You were killed. ' : ''}Ready in ${Math.ceil(wait)} s` : 'Click a checkpoint you hold on the map to start there on foot';
  const left = Math.max(0, MATCH_S - GAME.time), clk = `${String(Math.floor(left / 60)).padStart(2, '0')}:${String(Math.floor(left % 60)).padStart(2, '0')}`; $('dTime').textContent = `Time left: ${clk}`; $('dClock').textContent = clk; renderCpBar();
}
$('dClasses').onclick = e => { const b = e.target.closest('[data-c]'); if (!b || b.disabled) return; GAME.sel.cls = b.dataset.c; Sound.init(); Sound.play('ui'); renderDeploy(); };
$('dWhere').onclick = e => { const b = e.target.closest('[data-w]'); if (!b || b.disabled) return; GAME.sel.where = +b.dataset.w; renderDeploy(); };
$('dMap').onclick = e => { const r = $('dMap').getBoundingClientRect(), x = (e.clientX - r.left) / r.width * WORLD_W, z = (e.clientY - r.top) / r.height * WORLD_H; const c = GAME.cps.find(c => Math.hypot(c.p.x * 1000 - x, c.p.y * 1000 - z) < 500 && canSpawnAt(GAME.team, c.i)); if (c) { GAME.sel.cls = 'inf'; GAME.sel.where = c.i; renderDeploy(); } };
$('dGo').onclick = () => { if (GAME.deployT > 0) return; Sound.init(); deployPlayer(GAME.sel.cls, GAME.sel.where); };

/* ---------------- input ---------------- */
function requestLock() { if (!GAME.on || GAME.deploying || GAME.over) return; const c = renderer.domElement; if (c.requestPointerLock) { try { const p = c.requestPointerLock(); if (p && p.catch) p.catch(() => {}); } catch (e) {} } }
document.addEventListener('pointerlockchange', () => {
  locked = document.pointerLockElement === renderer.domElement;
  if (!locked && GAME.on && !GAME.deploying && !GAME.over) { $('pause').classList.remove('hidden'); GAME.paused = true; }
  if (locked) { $('pause').classList.add('hidden'); GAME.paused = false; }
});
renderer.domElement.addEventListener('mousedown', e => { if (!locked) { requestLock(); return; } if (e.button === 0) MOUSE.l = true; if (e.button === 2) MOUSE.r = true; });
addEventListener('mouseup', e => { if (e.button === 0) MOUSE.l = false; if (e.button === 2) MOUSE.r = false; });
addEventListener('contextmenu', e => e.preventDefault());
addEventListener('mousemove', e => {
  if (!locked) return; const k = .0022 * (CAM.zoom ? camera.fov / 65 : 1);
  CAM.yaw += e.movementX * k; CAM.pitch = clamp(CAM.pitch - e.movementY * k, -1.35, 1.2);
});
addEventListener('keydown', e => {
  if (e.code === 'F1') e.preventDefault();
  if (e.repeat) return; KEYS[e.code] = true;
  if (!GAME.on) return;
  if (e.code === 'F1') GAME.helpOn = !GAME.helpOn, GAME.helpT = 0;
  // test cheat: press 0 six times in a row for 10,000 spawn points
  if (e.code === 'Digit0' || e.code === 'Numpad0') { const t = performance.now(); GAME.zeroN = t - (GAME.zeroT || 0) < 1500 ? (GAME.zeroN || 0) + 1 : 1; GAME.zeroT = t; if (GAME.zeroN >= 6) { GAME.zeroN = 0; PLAYER.sp += 10000; spPop('+10000 SP · test'); if (!$('deploy').classList.contains('hidden')) refreshDeploy(); } } else GAME.zeroN = 0;
  if (e.code === 'KeyE') interact();
  const pv = PLAYER.s && PLAYER.s.alive && PLAYER.s.veh;
  if (e.code === 'KeyR' && !pv && PLAYER.s && PLAYER.s.mag < 30 && PLAYER.s.ammo > 0 && PLAYER.s.reload <= 0) PLAYER.s.reload = RIFLE.reload;
  if (pv && pv.kind === 'air') {
    if (e.code === 'KeyJ') { interact(true); return; }
    if (e.code === 'KeyB' && pv.cls === 'jet') { pv.airbrake = !pv.airbrake; playerVehMsg(pv.airbrake ? 'Airbrake out' : 'Airbrake in'); }
    if (e.code === 'KeyN' && pv.cls === 'heli') { THERMAL.want = !THERMAL.want; playerVehMsg(!pOK(pv.part('nose')) ? 'Sight destroyed: no thermal view' : THERMAL.want ? 'Thermal sight on (in the zoomed view)' : 'Thermal sight off'); }
    if (e.code === 'KeyH' && pv.cls === 'heli') { pv.hover = !pv.hover; playerVehMsg(pv.hover ? 'Hover mode on: it holds its place and height' : 'Hover mode off: you have the collective'); }
    const n = +e.code.replace('Digit', ''); if (n >= 1 && n <= pv.def.weapons.length) { pv.sel = n - 1; Sound.play('ui'); }
    if (e.code === 'KeyX' && pv.fire > 0 && pv.extT <= 0) { pv.fire = 0; pv.extT = 60; playerVehMsg('Fire handle pulled: fire out'); }
  } else if (pv) {
    const n = +e.code.replace('Digit', ''); if (n >= 1 && n <= pv.def.ammo.length) selectAmmo(pv, pv.def.ammo[n - 1]);
    if (e.code === 'KeyR') { if (Math.abs(pv.speed) < .5 && vState(pv).crew >= 2 && pv.repairT <= 0) { pv.repairT = 12 * (vState(pv).crew < pv.def.crew.length ? 1.5 : 1) * (friendlyPoint(pv) ? .5 : 1); playerVehMsg(friendlyPoint(pv) ? 'Full repair: stay still' : 'Field repair: stay still'); } }
    if (e.code === 'KeyX' && pv.fire > 0) { if (pv.fpe > 0) { pv.fpe--; pv.fire = 0; playerVehMsg(`Fire put out · ${pv.fpe} extinguisher${pv.fpe === 1 ? '' : 's'} left`); } else playerVehMsg('No extinguishers left'); }
    if (e.code === 'KeyV') { // laser rangefinder: sets the sight to the range of what the crosshair is on
      const st = vState(pv);
      if (!pv.def.lrf) playerVehMsg('No rangefinder: use the impact marker');
      else if (!st.fcs) playerVehMsg('Fire control damaged: no rangefinder');
      else if (CAM.range > 5000 || CAM.range < 20) playerVehMsg('No range');
      else { pv.sightR = Math.max(200, CAM.range); pv.lrfT = GAME.time; Sound.play('ui'); playerVehMsg(`Range ${Math.round(pv.sightR)} m`);
        const t = CAM.aimEnt; if (t && t.kind === 'vehicle' && t.alive && t.def.lws && t.team !== pv.team) t.lwsT = GAME.time; } // a tank with a laser warning receiver knows it has been ranged
    }
    if (e.code === 'KeyN') { const st = vState(pv); if (!pv.def.thermal) playerVehMsg('No thermal sight'); else if (!st.fcs) playerVehMsg('Fire control damaged: no thermal sight'); else { THERMAL.want = !THERMAL.want; playerVehMsg(THERMAL.want ? 'Thermal sight on (in the gun sight)' : 'Thermal sight off'); } }
  } else {
    if (e.code === 'Digit1' && PLAYER.s) PLAYER.s.slot = 0;
    if (e.code === 'Digit2' && PLAYER.s && PLAYER.s.rpg > 0) PLAYER.s.slot = 1;
  }
  if (e.code === 'KeyM') { const bm = $('bigmap'); if (bm.classList.contains('hidden')) { drawBig(); bm.classList.remove('hidden'); } else bm.classList.add('hidden'); }
  if (e.code === 'Tab') e.preventDefault();
});
addEventListener('keyup', e => { KEYS[e.code] = false; });
addEventListener('blur', () => { for (const k in KEYS) KEYS[k] = false; MOUSE.l = MOUSE.r = false; });
$('pResume').onclick = () => { $('pause').classList.add('hidden'); GAME.paused = false; requestLock(); };
$('pRedeploy').onclick = () => { $('pause').classList.add('hidden'); GAME.paused = false; GAME.deployT = 0; openDeploy('redeploy'); };
$('pQuit').onclick = () => { $('pause').classList.add('hidden'); toTitle(); };
$('eAgain').onclick = () => { $('end').classList.add('hidden'); begin(); };
$('eMenu').onclick = () => { $('end').classList.add('hidden'); toTitle(); };

/* ---------------- title ---------------- */
const PREF = (() => { try { return JSON.parse(localStorage.getItem('islandfront.v1') || '{}'); } catch (e) { return {}; } })();
Object.assign(GAME, { map: PREF.map ?? 0, team: PREF.team ?? 0, bots: PREF.bots ?? 8, diff: PREF.diff ?? 1, gfx: PREF.gfx || 'optimised' });
function renderTitle() {
  $('mapPick').innerHTML = MAPS.map((m, i) => `<button class="mrow${GAME.map === i ? ' on' : ''}" data-v="${i}">${m.name}<small>${m.pitch}</small></button>`).join('');
  $('tbMode').textContent = `Checkpoints · ${MAPS[GAME.map].name}`;
  for (const [id, key] of [['teamPick', 'team'], ['botPick', 'bots'], ['diffPick', 'diff']]) [...$(id).children].forEach(b => b.classList.toggle('on', +b.dataset.v === GAME[key]));
  [...$('gfxPick').children].forEach(b => b.classList.toggle('on', b.dataset.v === GAME.gfx));
  const gb = [...$('gfxPick').children].find(b => b.dataset.v === GAME.gfx); $('gfxNote').textContent = gb ? gb.title : '';
}
$('tTabs').onclick = e => { const b = e.target.closest('[data-tab]'); if (!b) return; for (const x of $('tTabs').children) x.classList.toggle('on', x === b); for (const pn of document.querySelectorAll('#title [data-pane]')) pn.hidden = pn.dataset.pane !== b.dataset.tab; };
for (const [id, key] of [['mapPick', 'map'], ['teamPick', 'team'], ['botPick', 'bots'], ['diffPick', 'diff'], ['gfxPick', 'gfx']]) $(id).onclick = e => { const b = e.target.closest('[data-v]'); if (!b) return; GAME[key] = key === 'gfx' ? b.dataset.v : +b.dataset.v; try { localStorage.setItem('islandfront.v1', JSON.stringify({ map: GAME.map, team: GAME.team, bots: GAME.bots, diff: GAME.diff, gfx: GAME.gfx })); } catch (err) {} renderTitle(); };
function begin() {
  Sound.init();
  $('title').classList.add('hidden'); $('loadText').innerHTML = `${MAPS[GAME.map].name}<small>Checkpoints. ${GAME.gfx === 'optimised' ? 'Optimised graphics.' : GAME.gfx === 'ultra' ? 'Ultra graphics: this takes several seconds.' : 'Realistic graphics: this takes several seconds.'}</small>`; $('loading').classList.remove('hidden');
  setTimeout(() => { startMatch(GAME.map, GAME.team, GAME.bots, GAME.diff); $('loading').classList.add('hidden'); }, 40);
}
function toTitle() { GAME.on = false; clearMatch(); $('hud').classList.add('hidden'); $('deploy').classList.add('hidden'); $('title').classList.remove('hidden'); document.exitPointerLock && document.exitPointerLock(); Sound.engine(false, 0); renderTitle(); }
$('startBtn').onclick = begin;
renderTitle();

/* ---------------- main loop ---------------- */
let last = performance.now();
function step(dt) {
  GAME.time += dt; GAME.deployT -= dt;
  playerStep(dt);
  botsStep(dt);
  guardsStep(dt);
  howitzersStep(dt);
  for (const e of ENTS) {
    if (e.kind === 'vehicle' && e.alive) { const nx = e.pos.x, nz = e.pos.z; e.vel.set((nx - (e._px ?? nx)) / dt, 0, (nz - (e._pz ?? nz)) / dt); e._px = nx; e._pz = nz; if (!e.driver) { e.speed *= Math.pow(.2, dt); if ((e.emptyT = (e.emptyT || 0) + dt) > 150 && e.team < 2 && e.emptyBy !== 'player' && (!PLAYER.s || PLAYER.s.pos.distanceTo(e.pos) > 250)) { removeEnt(e); continue; } driveVehicle(e, { throttle: 0, steer: 0, aimYaw: e.yaw + e.tYaw, aimPitch: e.gPitch }, dt); } }
    else if (e.kind === 'soldier' && !e.veh && !e.npc) { /* soldiers' vel is set by moveSoldier */ }
    if (e.kind === 'vehicle' && !e.alive && e.turretFly && e.turretFly.t < 6) { const f = e.turretFly, tr = e.model.turret; f.t += dt; f.vel.y -= 9.8 * dt; tr.position.addScaledVector(f.vel, dt); tr.rotation.x += f.spin.x * dt; tr.rotation.z += f.spin.z * dt; const w = tr.getWorldPosition(new V3()); if (w.y < groundY(w.x, w.z) + .5 && f.vel.y < 0) { f.vel.set(0, 0, 0); f.spin.set(0, 0, 0); f.t = 99; } }
    if (e.kind === 'vehicle' && !e.alive) { if ((e.burnT -= dt) > 0) { if (Math.random() < dt * 10) sprite(_v.copy(e.pos).setY(e.pos.y + 2), 2, 8, 3, 0x2a2826, false, 4, .7); if (Math.random() < dt * 6) sprite(_v.copy(e.pos).setY(e.pos.y + 1.5), 1.5, 1, .4, 0xffffff, true, 2); } else removeEnt(e); }
  }
  airsStep(dt);
  updateProjectiles(dt); shellWarnings(); smokeStep(dt);
  checkpointsStep(dt);
  resupply(PLAYER.s, dt);
  if (GAME.deploying && Math.floor(GAME.time * 4) !== Math.floor((GAME.time - dt) * 4)) refreshDeploy();
}
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min((now - last) / 1000, .05); last = now;
  if (GAME.on && !GAME.paused) step(dt);
  updateFX(dt);
  if (GAME.on) { updateCamera(dt); updateHUD(dt); updateWorldView(PLAYER.s ? (PLAYER.s.veh || PLAYER.s).pos : camera.position); }
  if (!window.IF_NORENDER) renderFrame();
}
requestAnimationFrame(frame);

/* ---------------- test hook (headless checks) ---------------- */
window.IF_TEST = {
  start(map = 0, team = 0, bots = 8, gfx) { $('title').classList.add('hidden'); if (gfx) GAME.gfx = gfx; GAME.map = map; GAME.team = team; GAME.bots = bots; startMatch(map, team, bots, 1); return true; },
  deploy(cls = 'mbt', where = -1) { GAME.deployT = 0; deployPlayer(cls, where); return true; },
  sim(seconds, dt = 1 / 30) { const n = Math.round(seconds / dt); for (let i = 0; i < n; i++) { step(dt); updateFX(dt); } updateCamera(dt); updateHUD(dt); updateWorldView(PLAYER.s ? (PLAYER.s.veh || PLAYER.s).pos : camera.position); return this.state(); },
  state() {
    const C = GAME.cps.map(c => ({ n: c.p.name, owner: c.owner, val: +c.val.toFixed(2), guards: c.guards.filter(g => g.alive).length, inside: c.inside }));
    const units = ENTS.filter(e => e.alive && e.team < 2 && !(e.kind === 'soldier' && e.veh));
    return { t: +GAME.time.toFixed(1), over: GAME.over, winner: GAME.winner, cps: C, alive: units.length, vehicles: units.filter(u => u.kind === 'vehicle').length, projs: PROJS.length, fx: FX.sprites.length, player: PLAYER.s ? { alive: PLAYER.s.alive, hp: Math.round(PLAYER.s.veh ? PLAYER.s.veh.hp : PLAYER.s.hp), pos: (PLAYER.s.veh || PLAYER.s).pos.toArray().map(Math.round) } : null };
  },
  look(x, y, z, tx, ty, tz) { PLAYER.s = null; CAM.pos.set(x, y, z); camera.position.set(x, y, z); camera.lookAt(tx, ty, tz); camera.updateMatrixWorld(); updateWorldView(new V3(tx, ty, tz)); renderFrame(); },
  cam(yaw, pitch) { CAM.yaw = yaw; CAM.pitch = pitch; updateCamera(0); updateWorldView((PLAYER.s.veh || PLAYER.s).pos); renderFrame(); },
  render() { renderFrame(); },
  GAME, PLAYER, CAM, ENTS, info: () => ({ prog: renderer.info.programs.length, geo: renderer.info.memory.geometries, tex: renderer.info.memory.textures, calls: renderer.info.render.calls, tris: renderer.info.render.triangles }),
};
