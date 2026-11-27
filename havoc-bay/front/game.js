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
  WORLD.gfx = GAME.gfx; applyLook(GAME.gfx === 'realistic');
  buildWorld(M);
  M.img = M.img || mapImage(M);
  GAME.cps = M._cps.map((p, i) => ({ p, i, owner: -1, val: 0, guards: [], inside: [0, 0] }));
  for (const c of GAME.cps) for (let k = 0; k < c.p.posts.length; k++) {
    const post = c.p.posts[k], g = new Soldier(2, { npc: true, name: 'Guard' });
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
  for (const p of PROJS) if (p.m) scene.remove(p.m); PROJS.length = 0;
  for (const s of FX.sprites) scene.remove(s); FX.sprites.length = 0;
  $('feed').innerHTML = '';
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
    showMsg(cls === 'jet' ? 'Take off: full throttle, look up past 250 km/h' : 'Space: climb · C: descend', cls === 'jet' ? 'Mouse flies the jet · W/S throttle (S right back: airbrake, wheel brakes) · A/D roll · 1-4 weapons · F gun · G flares. Land on your runway to rearm.' : 'Mouse turns and aims · W/S forward/back · A/D sideways · 1-3 weapons · G flares. Land at base to rearm.');
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
    if (terrainY(x, z) > -.8 || bridgeAt(x, z) !== null) { s.pos.set(x, groundY(x, z) + .2, z); break; }
  }
  s.veh = null; v.driver = null; s.model.root.visible = true; s.vel.set(0, 0, 0); s.yaw = CAM.yaw;
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
  if (s.isPlayer) { PLAYER.deaths++; GAME.deployT = 6; Sound.engine(false, 0); if (s.veh) { s.veh.driver = null; } s.veh = null; setTimeout(() => { if (GAME.on && !GAME.over && PLAYER.s === s) openDeploy('dead'); }, 2500); }
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
  if (target.bot && owner) { target.bot.ai.threat = creditOf(owner) ? (creditOf(owner).veh || creditOf(owner)) : owner; target.bot.ai.threatT = GAME.time; }
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
  if (D.wheeled) { v.steerIn = (v.steerIn || 0) + (steer - (v.steerIn || 0)) * clamp(dt * 5, 0, 1); v.turnRate = v.speed * Math.tan(v.steerIn * D.steer) / (D.len * .62); }
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
  v.gPitch += clamp(clamp(inp.aimPitch, D.elev[0], D.elev[1]) - v.gPitch, -.35 * dt, .35 * dt);
  placeVehicle(v, dt);
  const near = Math.abs(v.pos.x - camera.position.x) + Math.abs(v.pos.z - camera.position.z) < 260;
  updateRunningGear(v, near ? dt : 0, false);
  if (v.model.gunX === undefined) v.model.gunX = v.model.gun.position.x;
  if (v.recoil > 0) { v.recoil = Math.max(0, v.recoil - dt * 2.5); v.model.gun.position.x = v.model.gunX - Math.sin(v.recoil * Math.PI) * (D.cls === 'mbt' ? .45 : .12); }
  // exhaust: a dark puff when the engine works hard
  if (st.power > 0 && (v.exT = (v.exT || 0) - dt) <= 0) { const hard = Math.abs(thr) > 0 && Math.abs(v.accel) > .3; v.exT = hard ? .12 : .6; const ex = _v.set(v.pos.x - c * D.len * .5, v.pos.y + (D.wheeled ? .6 : 1.3), v.pos.z - s * D.len * .5); sprite(ex, hard ? 1.1 : .6, hard ? 3.5 : 2, hard ? 1.6 : 1.1, D.kw > 1000 ? 0x8a8478 : 0x3a3632, false, 1.2, hard ? .5 : .25); }
  // dust off the tracks
  if (Math.abs(v.speed) > 3.5 && road !== 2 && (v.dustT = (v.dustT || 0) - dt) <= 0) { v.dustT = .09; for (const sd of [-1, 1]) sprite(_v.set(v.pos.x - c * D.len * .45 - s * sd * D.wid * .4, v.pos.y + .4, v.pos.z - s * D.len * .45 + c * sd * D.wid * .4), 1.6 + Math.abs(v.speed) * .08, 4, 2.2, 0xa8977a, false, .8, .45); }
  if (!v.def.wheeled && vState(v).crew > 0 && (v.mod('engine') ? v.mod('engine').hp < v.mod('engine').max * .5 : false) && Math.random() < dt * 3) sprite(_v.copy(v.pos).setY(v.pos.y + D.hgt), 1.4, 4, 2.5, 0x3a3836, false, 3, .7);
  // guns
  v.cool -= dt; v.cool2 -= dt; v.smokeT -= dt;
  if (D.reload && v.loaded === null) { v.reload -= dt; if (v.reload <= 0) { v.loaded = v.sel; v.reload = 0; } }
  if (D.atgm && v.atgmReady < D.atgmN) { v.atgmT -= dt; if (v.atgmT <= 0) { v.atgmReady++; v.atgmT = D.atgmReload; } }
  if (inp.fire && st.fire) fireMain(v);
  if (inp.fire2 && D.mg && st.fire && v.cool2 <= 0) fireMG(v);
  if (inp.fire3 && D.atgm && st.fire && v.atgmReady > 0 && v.cool <= 0) fireATGM(v, inp.guide);
  if (inp.smoke && v.smoke > 0 && v.smokeT <= 0) popSmoke(v);
}
function selectAmmo(v, key) {
  if (!v.def.ammo.includes(key) || v.sel === key) return;
  v.sel = key;
  if (v.def.reload && v.loaded && v.loaded !== key) { v.loaded = null; v.reload = v.def.reload * (vState(v).loader ? 1 : 1.8); } // unload and load the new round
}
function muzzleOf(v, out, dir) {
  v.model.root.updateMatrixWorld(true);
  out.set(v.model.muzzle, 0, 0).applyMatrix4(v.model.gun.matrixWorld);
  dir.set(1, 0, 0).transformDirection(v.model.gun.matrixWorld);
}
function fireMain(v) {
  const D = v.def, from = new V3(), dir = new V3(); muzzleOf(v, from, dir);
  let key;
  if (D.reload) { if (!v.loaded) return; key = v.loaded; v.loaded = null; v.reload = D.reload * (vState(v).loader ? 1 : 1.8) * (vState(v).crew < D.crew.length ? 1.15 : 1); }
  else { if (v.cool > 0) return; key = v.sel; v.cool = AMMO[key].rate || .2; }
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
  if (m.real) poseReal(s, m, sp, dt);
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
    $('endTitle').textContent = winner < 0 ? 'DRAW' : winner === GAME.team ? 'VICTORY' : 'DEFEAT';
    $('endTitle').style.color = winner < 0 ? '#fff' : winner === GAME.team ? '#f2b23a' : '#ff8a80';
    $('endWhy').textContent = why;
    $('endStats').innerHTML = `<span class="mut">Kills</span><span class="mut">Deaths</span><span class="mut">Checkpoints</span><b>${PLAYER.kills}</b><b>${PLAYER.deaths}</b><b>${PLAYER.caps}</b>`;
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
    if (!ai.target) {
      let best = null, bs = 1e9;
      for (const e of ENTS) {
        if (!e.alive || !hostile(team, e.team) || e.team === team || (e.kind === 'soldier' && e.veh) || (e.kind === 'vehicle' && !e.driver && e.team !== 2) || (e.kind === 'air' && !e.driver)) continue;
        const d = e.pos.distanceTo(u.pos); if (d > range) continue;
        // people miss things: far, still or hidden targets often go unnoticed for a while
        const moving = e.vel && e.vel.lengthSq() > 4, notice = sk.aware * (1 - d / range * .55) * (moving ? 1.15 : .75) * (e.kind === 'soldier' && e.crouch ? .7 : 1) * (e.kind === 'air' ? 1.2 : 1);
        if (Math.random() > notice) continue;
        let score = (e.kind === 'air' ? (e.cls === 'heli' ? 1.6 : 5) : 1) * d * (e.kind === 'vehicle' && isV && u.cls !== 'jeep' ? .55 : 1) * (e.kind === 'vehicle' && u.cls === 'jeep' && e.cls !== 'jeep' ? 4 : 1) * (e.team === 2 ? 1.2 : 1);
        if (score < bs && lineOfSight(from, aimCenter(e, _v))) { best = e; bs = score; }
      }
      if (best) { ai.target = best; ai.react = D.react * sk.react + (Math.random() < .08 ? 1 + Math.random() * 1.2 : 0); ai.settle = 2.6; ai.wrongAmmo = Math.random() < .07; } // some freeze for a moment; first shots go wide
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
    else { ai.hold = null; ai.goal = routePoint(sNow + dir * (isV ? 45 : 25), b.lane, new V3()); }
    // stuck?
    const moved = Math.abs(sNow - ai.lastS); ai.lastS = sNow;
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
      const dx = ai.goal.x - u.pos.x, dz = ai.goal.z - u.pos.z, dist = Math.hypot(dx, dz), want = Math.atan2(dz, dx), da = angDiff(u.yaw, want);
      if (ai.rev > 0) { ai.rev -= dt; inp.throttle = -1; inp.steer = ai.revSteer; }
      else if (!(ai.atCp && dist < 12)) { const want = clamp(da * 2, -1, 1) + Math.sin(GAME.time * .8 + b.lane) * .2 * (1 - sk.drive); ai.steerS = (ai.steerS || 0) + (want - (ai.steerS || 0)) * Math.min(1, dt * (1.5 + 3 * sk.drive)); inp.steer = clamp(ai.steerS, -1, 1); /* late, sloppy steering overshoots turns */ inp.throttle = Math.abs(da) > 1.2 ? .25 : Math.abs(da) > .5 ? .6 : 1; if (tg && u.cls === 'mbt' && aimP.distanceTo(u.pos) < 1100) inp.throttle *= .4; }
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
function hullTilt(v) { // how far the turret's forward line is tipped up by the slope the hull sits on
  return Math.asin(clamp(_n.set(Math.cos(v.tYaw), 0, Math.sin(v.tYaw)).applyQuaternion(v.quat).y, -1, 1));
}
function aimSolution(v, p, A) { // turret yaw and gun pitch (hull-relative) to put the round on p
  const mz = new V3(), d = new V3(); muzzleOf(v, mz, d);
  const R = Math.hypot(p.x - mz.x, p.z - mz.z), yaw = Math.atan2(p.z - mz.z, p.x - mz.x);
  const pitch = A.kind === 'bullet' || A.guided ? Math.atan2(p.y - mz.y, R) : ballisticPitch(R, p.y - mz.y, A.v, A.g ?? 9.8);
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
    const A = AMMO[v.def.reload ? (v.loaded || v.sel) : v.sel], sol = aimSolution(v, CAM.aim, A); inp.aimYaw = sol.yaw; inp.aimPitch = sol.pitch; CAM.range = sol.range;
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
function interact() {
  const s = PLAYER.s; if (!s || !s.alive) return;
  if (s.veh && s.veh.kind === 'air') { const a = s.veh, slow = a.onGround && a.vel.length() < 4; s.veh = null; a.driver = null; s.model.root.visible = true; s.pos.copy(a.pos); s.pos.y += slow ? 0 : -1.5; if (slow) { s.pos.x += Math.cos(a.hdg + Math.PI / 2) * 3; s.pos.z += Math.sin(a.hdg + Math.PI / 2) * 3; s.pos.y = groundY(s.pos.x, s.pos.z) + .1; s.vel.set(0, 0, 0); } else { s.vel.copy(a.vel).multiplyScalar(.3); s.vel.y = 8; s.chute = true; a.pilotDead = true; a.lastAttacker = a.lastAttacker || null; showMsg('Bailed out', 'Your parachute opens'); } Sound.engine(false, 0); return; }
  if (s.veh) { exitVehicle(s); return; }
  const v = nearbyVehicle(s); if (v) enterVehicle(s, v);
}
function nearbyVehicle(s) { let best = null, bd = 7.5; for (const e of ENTS) if (e.kind === 'vehicle' && e.alive && !e.driver && e.team === s.team) { const d = Math.hypot(e.pos.x - s.pos.x, e.pos.z - s.pos.z) - e.T.len / 2; if (d < bd) { bd = d; best = e; } } return best; }
function resupply(s, dt) { // at your base or a checkpoint you hold: ammo and health come back
  if (!s || !s.alive) return;
  const p = (s.veh || s).pos, M = GAME.M, b = M.bases[s.team];
  const home = Math.hypot(p.x - b.x * 1000, p.z - b.y * 1000) < 480 || GAME.cps.some(c => c.owner === s.team && inZone(c, p));
  if (!home) return;
  if (s.veh) { const v = s.veh; if (v.def.reload && v.loaded === null && v.reload > 0) v.reload -= dt * .25; if ((v.resT = (v.resT || 0) + dt) > 3) { v.resT = 0; v.smoke = Math.min(v.def.smoke || 0, v.smoke + 1); } }
  else { s.hp = Math.min(SOLDIER_HP, s.hp + 8 * dt); if ((s.resT = (s.resT || 0) + dt) > 4) { s.resT = 0; s.ammo = Math.min(210, s.ammo + 30); s.rpg = Math.min(3, s.rpg + 1); } }
}

/* ---------------- camera ---------------- */
function updateCamera(dt) {
  const s = PLAYER.s;
  CAM.zoom = MOUSE.r && locked;
  let fov = 65;
  pilotG(s && s.alive && s.veh && s.veh.alive && s.veh.kind === 'air' ? s.veh : null, dt);
  if (s && s.veh && s.veh.alive && s.veh.kind === 'air') fov = airCamera(s.veh, dt);
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
function chip(label, m, vacant) {
  const st = vacant ? 'vac' : !m ? 'ok' : m.hp <= 0 ? 'dead' : m.hp < m.max * .6 ? 'dmg' : 'ok';
  return `<span class="chip ${st}">${label}</span>`;
}
function vehStatusHTML(v) {
  const D = v.def, st = vState(v), r = v.roles;
  const crew = D.crew.map(role => chip(role[0].toUpperCase(), r[role], !r[role] || r[role].hp <= 0)).join('');
  const mods = [['ENG', v.mods.find(m => m.kind === 'engine')], ['TRN', v.mods.find(m => m.kind === 'trans')], ...(D.wheeled ? [] : [['TRK L', v.mod('trackL')], ['TRK R', v.mod('trackR')]]), ['BRL', v.mod('barrel')], ['BRC', v.mod('breech')], ['TUR', v.mods.find(m => m.kind === 'drive')], ['SGT', v.mod('optics')]].filter(([, m]) => m).map(([l, m]) => chip(l, m)).join('');
  const notes = [];
  if (v.fire > 0) notes.push(`<span class="warn">FIRE${v.extT > 0 ? '' : ' · X to put it out'}</span>`);
  if (v.repairT > 0) notes.push(`repairing ${Math.ceil(v.repairT)} s`);
  else if (v.mods.some(m => m.kind !== 'crew' && m.kind !== 'ammo' && m.hp < m.max * .6)) notes.push('R: repair (stand still)');
  if (!st.drive) notes.push('<span class="warn">immobilised</span>');
  if (v.swapT > 0) notes.push('crew changing seats');
  return `<div class="who">${D.name} <small>${Math.round(Math.abs(v.speed) * 3.6)} km/h</small></div><div class="chips">${crew}</div><div class="chips">${mods}</div>${notes.length ? `<div class="vnote">${notes.join(' · ')}</div>` : ''}`;
}
function vehAmmoHTML(v) {
  const D = v.def;
  const list = D.ammo.map((k, i) => `<div class="am${v.sel === k ? ' sel' : ''}">${i + 1} · ${AMMO[k].type} <small>${AMMO[k].name}${D.reload && v.loaded === k ? ' · loaded' : ''}</small></div>`).join('');
  let state;
  if (!vState(v).fire) state = '<b class="warn">GUN OUT</b>';
  else if (D.reload) state = v.loaded ? '<b>READY</b>' : `<b>${Math.round((1 - v.reload / D.reload) * 100)}%</b> <small>loading</small>`;
  else state = '<b>READY</b>';
  const extra = [D.mg ? `F: ${AMMO[D.mg].name}` : '', D.atgm ? `T: ${AMMO[D.atgm].name} ×${v.atgmReady}` : '', D.smoke ? `G: smoke ×${v.smoke}` : ''].filter(Boolean).join('<br>');
  return `${list}${state}<br><small>${extra}</small>`;
}
function renderCpBar() {
  const C = GAME.cps, me = GAME.team;
  let h = `<span class="hq" style="color:var(--blue)">BLUE</span>`;
  for (const c of C) {
    const cls = c.owner === 0 ? 'blue' : c.owner === 1 ? 'red' : '', lock = !canCapture(me, c.i) && c.owner !== me ? ' lock' : '', pct = Math.abs(c.val) * 100, col = c.val > 0 ? 'var(--blue)' : 'var(--red)';
    h += `<div class="cp ${cls}${lock}${c.p.size === 'L' ? ' big' : ''}" title="${c.p.name}">${c.i + 1}${c.guardsLeft ? `<small>☠${c.guardsLeft}</small>` : ''}<em>${c.p.size === 'L' ? 'MAIN' : c.p.size === 'M' ? 'MED' : 'SM'}</em><i style="width:${c.owner === -1 ? pct : 100}%;background:${c.owner === -1 ? col : 'rgba(255,255,255,.8)'}"></i></div>`;
  }
  h += `<span class="hq" style="color:var(--red)">RED</span>`;
  $('cpbar').innerHTML = h;
}
let hudT = 0, miniT = 0;
const tagEls = [];
function updateHUD(dt) {
  if ((msgT -= dt) <= 0) $('msg').style.opacity = 0;
  hudT -= dt; if (hudT <= 0) { hudT = .2; renderCpBar(); }
  const left = Math.max(0, MATCH_S - GAME.time); $('clock').textContent = `${String(Math.floor(left / 60)).padStart(2, '0')}:${String(Math.floor(left % 60)).padStart(2, '0')}`;
  const s = PLAYER.s, alive = s && s.alive;
  const inAir = alive && s.veh && s.veh.kind === 'air';
  $('cross').style.display = alive && (inAir || !(s.veh && CAM.zoom)) ? '' : 'none';
  $('scope').style.display = alive && s.veh && !inAir && CAM.zoom ? 'block' : 'none';
  // where the gun points right now (the turret lags behind your aim)
  let gm = false;
  if (inAir && s.veh.alive) { // jets: the gun pipper, or where a bomb would land
    const a = s.veh, W = a.def.weapons[a.sel], A = AMMO[W.k];
    let p = null; if (A.look === 'bomb') p = ccipPoint(a, new V3()); else if (a.cls === 'jet' && W.k === a.def.weapons[0].k) { axes(a); p = a.pos.clone().addScaledVector(_ax, 700).addScaledVector(_ay, 8); }
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
  if (showSi) { const v = s.veh, k = v.def.reload ? (v.loaded || v.sel) : v.sel; si.textContent = `RNG ${Math.round(CAM.range || 0)} m · ${AMMO[k].type} ${AMMO[k].name}${v.def.reload ? (v.loaded ? ' · LOADED' : ' · LOADING') : ''}`; }
  // status and ammo
  if (alive) {
    if (s.veh) {
      const v = s.veh; if (v.kind === 'air') { $('status').innerHTML = airStatusHTML(v); $('ammo').innerHTML = airAmmoHTML(v); } else { $('status').innerHTML = vehStatusHTML(v); $('ammo').innerHTML = vehAmmoHTML(v); }
    } else {
      $('status').innerHTML = `<div class="who">Rifleman <small>${s.swim ? 'swimming' : s.crouch ? 'crouched' : ''}</small></div><div class="bar2"><i style="transform:scaleX(${s.hp / 100});background:${s.hp < 35 ? '#e0583a' : '#7fd27a'}"></i></div>`;
      $('ammo').innerHTML = s.slot === 1 ? `<small>Rocket launcher</small><br><b>${s.rpg}</b> <small>rockets</small>` : `<small>Rifle${s.reload > 0 ? ' · reloading' : ''}</small><br><b>${s.mag}</b> <small>/ ${s.ammo}</small><br><small>2: rockets (${s.rpg})</small>`;
    }
  }
  // the capture message
  let cm = '';
  if (alive) {
    const p = (s.veh || s).pos, c = GAME.cps.find(c => inZone(c, p));
    if (c) {
      const my = GAME.team, ownedByMe = c.owner === my;
      if (c.guardsLeft > 0) cm = `${c.p.name.toUpperCase()}<br><span style="color:var(--guard)">Clear the guards first: ${c.guardsLeft} left</span>`;
      else if (ownedByMe && Math.abs(c.val) >= 1) cm = `${c.p.name.toUpperCase()} <span class="mut">· held</span>`;
      else if (!canCapture(my, c.i)) cm = `${c.p.name.toUpperCase()}<br><span class="mut">Locked: take ${GAME.cps[my === 0 ? c.i - 1 : c.i + 1].p.name} first</span>`;
      else { const toward = my === 0 ? c.val : -c.val, contested = c.inside[1 - my] > 0; cm = `${contested ? 'CONTESTED' : toward >= 0 ? 'CAPTURING' : 'NEUTRALIZING'} ${c.p.name.toUpperCase()}<div class="bar"><i style="width:${(toward >= 0 ? toward : 1 + toward) * 100}%"></i></div>`; }
    }
  }
  if ($('capMsg')._v !== cm) { $('capMsg').innerHTML = cm; $('capMsg')._v = cm; }
  // prompt
  let pr = '';
  if (alive && !s.veh) { const v = nearbyVehicle(s); if (v) pr = `E: drive the ${v.T.name}`; }
  else if (alive && s.veh) pr = '';
  $('prompt').textContent = pr; $('prompt').classList.toggle('hidden', !pr);
  $('help2').innerHTML = alive ? (inAir ? (s.veh.cls === 'jet' ? 'Mouse flies · W/S throttle · A/D roll · left click: fire weapon · 1-4 weapons · F gun · G flares · X fire handle · right click: cockpit view · E: eject · M: map' : 'Mouse turns and aims · W/S forward/back · A/D sideways · Space/C up/down · left click: fire · 1-3 weapons · F gun · G flares · right click: zoom · E: get out (landed) or bail out · M: map') + `<br>${PLAYER.sp} SP` : s.veh ? 'W/S drive · A/D steer · mouse aims · right click: gun sight (Shift: more zoom) · 1-3 ammo · F MG · T missile · G smoke · R repair · X extinguish · E: get out · M: map' : 'WASD move · Shift sprint · C crouch · 1/2 weapons · R reload · E: get in · M: map') : '';
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
function drawMapLayer(g, x0, z0, scale, W2, H2, big) { // world (x0,z0) at canvas (0,0), px per metre = scale
  const M = GAME.M, P = (x, z) => [(x - x0) * scale, (z - z0) * scale];
  g.drawImage(M.img, -x0 * scale, -z0 * scale, WORLD_W * scale, WORLD_H * scale);
  for (const c of GAME.cps) {
    const [x, y] = P(c.p.x * 1000, c.p.y * 1000), r = Math.max(big ? 9 : 7, c.p.zone.hx * 1000 * scale);
    g.fillStyle = c.owner === 0 ? '#3b78e6' : c.owner === 1 ? '#e04a3a' : '#e8e4d0'; g.strokeStyle = '#111'; g.lineWidth = 2;
    g.beginPath(); g.arc(x, y, Math.min(r, big ? 18 : 12), 0, TAU); g.fill(); g.stroke();
    g.fillStyle = c.owner === -1 ? '#111' : '#fff'; g.font = `bold ${big ? 14 : 11}px sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(String(c.i + 1), x, y + 1);
    if (big) { g.font = '600 12px sans-serif'; g.fillStyle = '#fff'; g.strokeStyle = 'rgba(0,0,0,.8)'; g.lineWidth = 3; const t = c.p.name + (c.guardsLeft ? ` · ${c.guardsLeft} guards` : ''); g.strokeText(t, x, y + 26); g.fillText(t, x, y + 26); }
  }
  for (const [t, b] of M.bases.entries()) { const [x, y] = P(b.x * 1000, b.y * 1000); g.fillStyle = TEAMS[t].css; g.fillRect(x - 7, y - 7, 14, 14); g.strokeStyle = '#111'; g.strokeRect(x - 7, y - 7, 14, 14); }
  const me = PLAYER.s && PLAYER.s.alive ? (PLAYER.s.veh || PLAYER.s) : null;
  for (const e of ENTS) {
    if (!e.alive || (e.kind === 'soldier' && e.veh) || e === me) continue;
    const ally = e.team === GAME.team; if (e.team === 2) continue;
    if (!ally && !(me && e.pos.distanceTo(me.pos) < (e.kind === 'air' ? 2500 : 350))) continue;
    const [x, y] = P(e.pos.x, e.pos.z);
    g.fillStyle = ally ? TEAMS[GAME.team].css : TEAMS[e.team].css;
    if (e.kind === 'air') { const h = Math.atan2(e.vel.z, e.vel.x) || e.hdg; g.save(); g.translate(x, y); g.rotate(h); g.beginPath(); g.moveTo(7, 0); g.lineTo(-5, 5); g.lineTo(-3, 0); g.lineTo(-5, -5); g.closePath(); g.fill(); g.restore(); }
    else if (e.kind === 'vehicle') { g.save(); g.translate(x, y); g.rotate(e.yaw); g.fillRect(-5, -3, 10, 6); g.restore(); } else if (e.kind === 'gun') { g.fillRect(x - 2, y - 2, 4, 4); } else { g.beginPath(); g.arc(x, y, 2.6, 0, TAU); g.fill(); }
  }
  if (me) { const [x, y] = P(me.pos.x, me.pos.z); g.save(); g.translate(x, y); g.rotate(CAM.yaw); g.fillStyle = '#fff'; g.strokeStyle = '#000'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(8, 0); g.lineTo(-5, 5); g.lineTo(-2, 0); g.lineTo(-5, -5); g.closePath(); g.fill(); g.stroke(); g.restore(); }
}
function drawMini() {
  const cv = $('mini'), g = cv.getContext('2d'), S = cv.width, me = PLAYER.s ? (PLAYER.s.veh || PLAYER.s).pos : CAM.pos, view = 2400, scale = S / view;
  g.fillStyle = '#1f4f6e'; g.fillRect(0, 0, S, S);
  g.save(); g.scale(1, 1); drawMapLayer(g, me.x - view / 2, me.z - view / 2, scale, S, S, false); g.restore();
  g.fillStyle = 'rgba(255,255,255,.75)'; g.font = 'bold 18px sans-serif'; g.textAlign = 'center'; g.fillText('N', S / 2, 18);
}
function drawBig() { const cv = $('bigCv'), g = cv.getContext('2d'); drawMapLayer(g, 0, 0, cv.width / WORLD_W, cv.width, cv.height, true); }

/* ---------------- deploy screen ---------------- */
const CLASSES = [
  { id: 'inf', name: 'Rifleman', info: 'Rifle and 3 rockets. Can spawn at checkpoints you hold.' },
  { id: 'mbt', veh: true }, { id: 'ifv', veh: true }, { id: 'jeep', veh: true },
  { id: 'heli', air: true }, { id: 'jet', air: true }, { id: 'boat', name: 'Patrol boat', info: 'Next update', off: true },
];
function openDeploy(why) {
  GAME.deploying = true; document.exitPointerLock && document.exitPointerLock();
  if (PLAYER.s && !PLAYER.s.alive) { const s = PLAYER.s; setTimeout(() => { if (PLAYER.s !== s) removeEnt(s); }, 8000); PLAYER.s = null; }
  if (why === 'redeploy' && PLAYER.s) { const s = PLAYER.s; if (s.veh) { exitVehicle(s); } removeEnt(s); PLAYER.s = null; }
  $('dEye').textContent = why === 'dead' ? 'You were killed' : why === 'start' ? `${GAME.M.name} · you are ${TEAMS[GAME.team].name}` : 'Redeploy';
  renderDeploy(); $('deploy').classList.remove('hidden');
}
function renderDeploy() {
  const sel = GAME.sel;
  if (sel.cls !== 'inf') sel.where = -1;
  if (sel.where >= 0 && !canSpawnAt(GAME.team, sel.where)) sel.where = -1;
  if ((SP_COST[sel.cls] || 0) > PLAYER.sp) sel.cls = 'inf';
  $('dClasses').innerHTML = CLASSES.map(c => { const d = c.veh ? VEH[TEAM_VEH[GAME.team][c.id]] : c.air ? AIR[TEAM_AIR[GAME.team][c.id]] : null, name = d ? d.name : c.name, cost = SP_COST[c.id] || 0, poor = cost > PLAYER.sp;
    const info = c.veh ? `${Math.round(d.vmax * 3.6)} km/h · ${d.mass} t · ${d.ammo.map(k => AMMO[k].type).join(' / ')}${d.atgm ? ' · ' + AMMO[d.atgm].name : ''}. ${d.info}` : c.air ? d.info : c.info;
    return `<button class="cls${sel.cls === c.id ? ' on' : ''}" data-c="${c.id}" ${c.off || poor ? 'disabled' : ''}><b>${name}</b><span>${c.off ? '' : `<em class="spc">${cost ? cost + ' SP' : 'free'}</em> `}${info}</span></button>`; }).join('');
  $('dTitle').innerHTML = `Choose how to go in <small class="mut" style="font-size:14px;font-weight:600">· ${PLAYER.sp} spawn points</small>`;
  const spots = [{ i: -1, n: `${TEAMS[GAME.team].name} base` }, ...GAME.cps.filter(c => canSpawnAt(GAME.team, c.i)).map(c => ({ i: c.i, n: `${c.i + 1} · ${c.p.name}` }))];
  $('dWhere').innerHTML = spots.map(s => `<button class="btn${sel.where === s.i ? ' on' : ''}" data-w="${s.i}" ${s.i >= 0 && sel.cls !== 'inf' ? 'disabled title="Vehicles start at your base"' : ''}>${s.n}</button>`).join('');
  $('dWhere')._key = spots.map(s => s.i).join() + '|' + PLAYER.sp;
  refreshDeploy();
}
function refreshDeploy() { // the parts that change while you look at it (rebuilding the buttons would eat clicks)
  const key = [-1, ...GAME.cps.filter(c => canSpawnAt(GAME.team, c.i)).map(c => c.i)].join() + '|' + PLAYER.sp;
  if (key !== $('dWhere')._key) return renderDeploy();
  const g = $('dMap').getContext('2d'); drawMapLayer(g, 0, 0, $('dMap').width / WORLD_W, 751, 496, true);
  const wait = Math.max(0, GAME.deployT); $('dGo').disabled = wait > 0; $('dWait').textContent = wait > 0 ? `Ready in ${Math.ceil(wait)} s` : '';
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
  if (e.repeat) return; KEYS[e.code] = true;
  if (!GAME.on) return;
  // test cheat: press 0 six times in a row for 10,000 spawn points
  if (e.code === 'Digit0' || e.code === 'Numpad0') { const t = performance.now(); GAME.zeroN = t - (GAME.zeroT || 0) < 1500 ? (GAME.zeroN || 0) + 1 : 1; GAME.zeroT = t; if (GAME.zeroN >= 6) { GAME.zeroN = 0; PLAYER.sp += 10000; spPop('+10000 SP · test'); if (!$('deploy').classList.contains('hidden')) refreshDeploy(); } } else GAME.zeroN = 0;
  if (e.code === 'KeyE') interact();
  if (e.code === 'KeyR' && !pv && PLAYER.s && PLAYER.s.mag < 30 && PLAYER.s.ammo > 0 && PLAYER.s.reload <= 0) PLAYER.s.reload = RIFLE.reload;
  const pv = PLAYER.s && PLAYER.s.alive && PLAYER.s.veh;
  if (pv && pv.kind === 'air') {
    const n = +e.code.replace('Digit', ''); if (n >= 1 && n <= pv.def.weapons.length) { pv.sel = n - 1; Sound.play('ui'); }
    if (e.code === 'KeyX' && pv.fire > 0 && pv.extT <= 0) { pv.fire = 0; pv.extT = 60; playerVehMsg('Fire handle pulled: fire out'); }
  } else if (pv) {
    const n = +e.code.replace('Digit', ''); if (n >= 1 && n <= pv.def.ammo.length) selectAmmo(pv, pv.def.ammo[n - 1]);
    if (e.code === 'KeyR') { if (Math.abs(pv.speed) < .5 && vState(pv).crew >= 2 && pv.repairT <= 0) { pv.repairT = 12 * (vState(pv).crew < pv.def.crew.length ? 1.5 : 1); playerVehMsg('Repairing: stay still'); } }
    if (e.code === 'KeyX' && pv.fire > 0 && pv.extT <= 0) { pv.fire = 0; pv.extT = 40; playerVehMsg('Fire put out'); }
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
  $('mapPick').innerHTML = MAPS.map((m, i) => `<button class="mapcard${GAME.map === i ? ' on' : ''}" data-v="${i}"><b>${m.name}</b><span>${m.pitch}</span></button>`).join('');
  for (const [id, key] of [['teamPick', 'team'], ['botPick', 'bots'], ['diffPick', 'diff']]) [...$(id).children].forEach(b => b.classList.toggle('on', +b.dataset.v === GAME[key]));
  [...$('gfxPick').children].forEach(b => b.classList.toggle('on', b.dataset.v === GAME.gfx));
}
for (const [id, key] of [['mapPick', 'map'], ['teamPick', 'team'], ['botPick', 'bots'], ['diffPick', 'diff'], ['gfxPick', 'gfx']]) $(id).onclick = e => { const b = e.target.closest('[data-v]'); if (!b) return; GAME[key] = key === 'gfx' ? b.dataset.v : +b.dataset.v; try { localStorage.setItem('islandfront.v1', JSON.stringify({ map: GAME.map, team: GAME.team, bots: GAME.bots, diff: GAME.diff, gfx: GAME.gfx })); } catch (err) {} renderTitle(); };
function begin() {
  Sound.init();
  $('title').classList.add('hidden'); $('loadText').textContent = `Building ${MAPS[GAME.map].name}${GAME.gfx === 'realistic' ? ' (realistic)' : ''}…`; $('loading').classList.remove('hidden');
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
    if (e.kind === 'vehicle' && e.alive) { const nx = e.pos.x, nz = e.pos.z; e.vel.set((nx - (e._px ?? nx)) / dt, 0, (nz - (e._pz ?? nz)) / dt); e._px = nx; e._pz = nz; if (!e.driver) { e.speed *= Math.pow(.2, dt); driveVehicle(e, { throttle: 0, steer: 0, aimYaw: e.yaw + e.tYaw, aimPitch: e.gPitch }, dt); } }
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
  if (!window.IF_NORENDER) renderer.render(scene, camera);
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
  look(x, y, z, tx, ty, tz) { PLAYER.s = null; CAM.pos.set(x, y, z); camera.position.set(x, y, z); camera.lookAt(tx, ty, tz); updateWorldView(new V3(tx, ty, tz)); renderer.render(scene, camera); },
  cam(yaw, pitch) { CAM.yaw = yaw; CAM.pitch = pitch; updateCamera(0); updateWorldView((PLAYER.s.veh || PLAYER.s).pos); renderer.render(scene, camera); },
  render() { renderer.render(scene, camera); },
  GAME, PLAYER, CAM, ENTS, info: () => ({ prog: renderer.info.programs.length, geo: renderer.info.memory.geometries, tex: renderer.info.memory.textures, calls: renderer.info.render.calls, tris: renderer.info.render.triangles }),
};
