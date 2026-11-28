/* Island Front: what makes a match a contest. Each side's front strength (the bar both teams push down), the spawn-point
   economy, kill and streak rewards, the scoreboard and the battle results. Loaded after game.js. */
'use strict';
const STRENGTH = 600;                 // each side starts with this much front strength; the first to 0 loses
const LOSS = { soldier: 6, jeep: 10, ifv: 15, mbt: 22, heli: 22, jet: 26, gun: 15 }; // strength a side loses with each unit
const BLEED = .45;                    // strength a second the other side loses for each checkpoint held above theirs
const INCOME = [.4, .2];              // spawn points a second for everyone, and more for each checkpoint the side holds
const ASSIST = .4;                    // share of the kill reward for helping (a hit in the last 20 seconds)
const UNIT_NAME = { soldier: 'Soldier', guard: 'Guard', gun: 'Howitzer', jeep: 'Light vehicle', ifv: 'IFV', mbt: 'Tank', heli: 'Helicopter', jet: 'Jet' };
const STREAKS = { 3: ['Killing spree', 40], 5: ['Rampage', 80], 8: ['Unstoppable', 120], 12: ['Legendary', 200] };
const MULTI = { 2: 'Double kill', 3: 'Triple kill', 4: 'Multi kill' };

function newStat(name, team, me) { return { name, team, me, score: 0, kills: 0, deaths: 0, assists: 0, caps: 0, streak: 0, best: 0, multi: 0, lastKillT: -99, unit: '' }; }
function statOf(s) { return !s ? null : s.isPlayer ? PLAYER.st : s.bot ? s.bot.st : null; }
function allStats() { return [PLAYER.st, ...GAME.botsList.map(b => b.st)].filter(Boolean); }

function rulesStart() {
  GAME.str = [STRENGTH, STRENGTH]; GAME.baseDmg = [0, 0]; GAME.rulesT = 0; for (const b of GAME.M.bases) b.fires = []; GAME.warned = {}; GAME.baseHitT = [-99, -99];
  setHTML($('board'), ''); $('board').classList.add('hidden'); $('banner').innerHTML = '';
}

/* who has hit what lately: anyone but the killer who hit it in the last 20 s gets an assist */
function noteHit(e, by) { if (!by || !e || by === e) return; const st = statOf(by); if (!st) return; (e.hitBy || (e.hitBy = new Map())).set(st, GAME.time); }

/* a unit is gone: its side loses strength, whoever did it is paid, helpers get assists */
function unitLost(e, by, cls, wk) {
  if (e.team < 2 && LOSS[cls]) hurtStrength(e.team, LOSS[cls]);
  const killer = by && by.team !== e.team && by !== e ? by : null, ks = statOf(killer);
  if (killer) {
    awardSP(killer, SP_AWARD[cls] || 50, `${UNIT_NAME[cls] || 'kill'}${cls === 'guard' ? '' : ' destroyed'}`.toLowerCase(), true);
    if (ks && cls !== 'guard') { ks.kills++; if (ks.me) PLAYER.kills++; streakStep(ks, killer); }
    if (killer.isPlayer) killBanner(cls, SP_AWARD[cls] || 50, e);
  }
  if (e.hitBy) for (const [st, t] of e.hitBy) if (st !== ks && GAME.time - t < 20 && st.team !== e.team) {
    st.assists++; awardSP(st.me ? { isPlayer: true } : { bot: GAME.botsList.find(b => b.st === st) }, Math.round((SP_AWARD[cls] || 50) * ASSIST), 'assist');
  }
  e.hitBy = null;
}
function unitDied(s) { const st = statOf(s); if (!st) return; st.deaths++; st.streak = 0; st.multi = 0; }

function streakStep(st, who) {
  st.streak++; st.best = Math.max(st.best, st.streak);
  st.multi = GAME.time - st.lastKillT < 6 ? st.multi + 1 : 1; st.lastKillT = GAME.time;
  const S = STREAKS[st.streak];
  if (S) { awardSP(who, S[1], S[0].toLowerCase(), true); if (st.me) bigBanner(S[0], `${st.streak} kills without dying · +${S[1]} SP`, 'streak'); else if (st.streak >= 5) feedLine(`<b style="color:${TEAMS[st.team].css}">${st.name}</b> <span class="mut">is on a ${S[0].toLowerCase()}</span>`); }
  else if (st.me && MULTI[Math.min(4, st.multi)]) bigBanner(MULTI[Math.min(4, st.multi)], '', 'multi');
}

function hurtStrength(team, n) {
  if (GAME.over || !GAME.str) return;
  GAME.str[team] = Math.max(0, GAME.str[team] - n);
  if (GAME.str[team] <= 0) endMatch(1 - team, `${TEAMS[team].name}'s front collapsed.`);
}

/* shells, bombs and rockets that burst inside a base wear the defenders down (called from splash() in units.js) */
function baseBlast(pt, A, owner) {
  if (!GAME.on || GAME.over || !owner) return;
  for (const t of [0, 1]) {
    if (owner.team === t) continue;
    const b = GAME.M.bases[t]; if (!inZone({ p: { zone: b.zone } }, pt)) continue;
    const n = Math.pow(A.splashDmg || 0, 1.5) / 1000; if (n < .05) return;
    hurtStrength(t, n); GAME.baseDmg[t] += n;
    const by = creditOf(owner); if (by) awardSP(by, n * 3, 'base hit', n < 3);
    if (by && by.isPlayer && n >= 3) bigBanner('Base hit', `${TEAMS[t].name} strength −${Math.round(n)}`, 'base');
    if (t === GAME.team && GAME.time - GAME.baseHitT[t] > 20) { GAME.baseHitT[t] = GAME.time; showMsg('Our base is under attack!', 'Enemy fire is landing in the base and draining our strength.'); Sound.play('alarm'); }
    return;
  }
}

/* every second: income, the bleed from holding fewer checkpoints, the warnings, the clock */
function rulesStep(dt) {
  if (GAME.over || !GAME.str) return;
  if ((GAME.rulesT += dt) < 1) return; const k = GAME.rulesT; GAME.rulesT = 0;
  const held = [0, 1].map(t => GAME.cps.filter(c => c.owner === t).length);
  for (const t of [0, 1]) {
    const inc = (INCOME[0] + INCOME[1] * held[t]) * k;
    if (t === GAME.team) { PLAYER.sp += inc; PLAYER.st.score += inc; }
    for (const b of GAME.botsList) if (b.team === t) { b.sp += inc; b.st.score += inc; }
  }
  const d = held[0] - held[1]; if (d) hurtStrength(d > 0 ? 1 : 0, Math.abs(d) * BLEED * k);
  const me = GAME.team, W = GAME.warned;
  if (!W.low && GAME.str[me] < STRENGTH * .25) { W.low = 1; bigBanner('Our front is collapsing', 'Take checkpoints back and stop the losses', 'bad'); Sound.play('alarm'); }
  if (!W.elow && GAME.str[1 - me] < STRENGTH * .25) { W.elow = 1; bigBanner('The enemy front is breaking', 'Keep pushing', 'good'); }
  if (!W.all && held[1 - me] === 5) { W.all = 1; showMsg('The enemy holds every checkpoint', 'Our strength is draining fast: retake one.'); Sound.play('alarm'); } else if (held[1 - me] < 5) W.all = 0;
  if (!W.min5 && MATCH_S - GAME.time < 300) { W.min5 = 1; showMsg('Five minutes left', 'When the time is up, the stronger side wins.'); }
  for (const st of allStats()) st.unit = unitOfStat(st);
  if (!$('board').classList.contains('hidden')) renderBoard();
}
function unitOfStat(st) {
  const s = st.me ? PLAYER.s : (GAME.botsList.find(b => b.st === st) || {}).soldier;
  if (!s || !s.alive) return 'dead';
  const v = s.veh; return v ? (v.kind === 'air' ? v.cls : v.cls) : 'inf';
}

/* ---------- feedback ---------- */
function killBanner(cls, sp, e) {
  const el = document.createElement('div'); el.className = 'kb' + (cls === 'guard' ? ' small' : '');
  el.innerHTML = `<b>${cls === 'guard' ? 'Guard down' : cls === 'soldier' ? 'Enemy killed' : `${UNIT_NAME[cls]} destroyed`}</b><i>+${sp} SP</i>`;
  const box = $('kills'); box.prepend(el); while (box.children.length > 4) box.lastChild.remove();
  setTimeout(() => el.remove(), 2600);
  Sound.play(cls === 'soldier' || cls === 'guard' ? 'kill' : 'killbig');
}
function bigBanner(big, small, kind) {
  const el = $('banner'); el.className = kind || ''; el.innerHTML = `<b>${big}</b>${small ? `<small>${small}</small>` : ''}`;
  el.style.animation = 'none'; void el.offsetWidth; el.style.animation = '';
  if (kind === 'streak' || kind === 'multi') Sound.play('streak');
}
function feedLine(html) { const d = document.createElement('div'); d.innerHTML = html; $('feed').prepend(d); while ($('feed').children.length > 6) $('feed').lastChild.remove(); setTimeout(() => d.remove(), 7000); }

/* ---------- the scoreboard (hold Tab) ---------- */
const UNIT_ICON = { inf: 'Rifleman', jeep: 'Light vehicle', ifv: 'IFV', mbt: 'Tank', heli: 'Helicopter', jet: 'Jet', dead: '—' };
function renderBoard() {
  const col = t => { const L = allStats().filter(s => s.team === t).sort((a, b) => b.score - a.score || b.kills - a.kills);
    return `<div class="bcol t${t}"><h3><span>${TEAMS[t].name}</span><b>${Math.ceil(GAME.str[t])}</b></h3><div class="brow head"><span>Player</span><span>Unit</span><span>Score</span><span>K</span><span>A</span><span>D</span><span>Caps</span></div>${L.map(s => `<div class="brow${s.me ? ' me' : ''}${s.unit === 'dead' ? ' dead' : ''}"><span>${s.name}</span><span>${UNIT_ICON[s.unit] || ''}</span><span>${Math.floor(s.score)}</span><span>${s.kills}</span><span>${s.assists}</span><span>${s.deaths}</span><span>${s.caps}</span></div>`).join('')}</div>`; };
  const mine = GAME.team; setHTML($('board'), `<div class="win"><div class="wbar">Scoreboard · ${GAME.M.name}</div><div class="wbody bcols">${col(mine)}${col(1 - mine)}</div></div>`);
}
addEventListener('keydown', e => { if (e.code === 'Tab' && GAME.on && !GAME.over) { e.preventDefault(); renderBoard(); $('board').classList.remove('hidden'); } });
addEventListener('keyup', e => { if (e.code === 'Tab') $('board').classList.add('hidden'); });

/* ---------- battle results ---------- */
function resultsHTML(winner) {
  const me = PLAYER.st, L = allStats(), top = [...L].sort((a, b) => b.score - a.score).slice(0, 3);
  const best = (f, min = 1) => { const s = [...L].sort((a, b) => f(b) - f(a))[0]; return s && f(s) >= min ? s : null; };
  const awards = [['Top score', best(s => s.score)], ['Most kills', best(s => s.kills)], ['Most captures', best(s => s.caps)], ['Best streak', best(s => s.best, 3)], ['Best helper', best(s => s.assists, 2)]].filter(a => a[1]);
  const rank = [...L].sort((a, b) => b.score - a.score).indexOf(me) + 1;
  const nm = s => `<b style="color:${TEAMS[s.team].css}">${s.name}</b>`;
  return `<div class="rstr"><span class="bl">${TEAMS[0].name}<b>${Math.ceil(GAME.str[0])}</b></span><span class="rd">${TEAMS[1].name}<b>${Math.ceil(GAME.str[1])}</b></span></div>
  <div class="rcols"><div><h4>Your battle</h4><div class="endstats">${[['Score', Math.floor(me.score)], ['Place', `${rank} of ${L.length}`], ['Kills', me.kills], ['Assists', me.assists], ['Deaths', me.deaths], ['Checkpoints taken', me.caps], ['Best streak', me.best]].map(([a, b]) => `<span>${a}</span><b>${b}</b>`).join('')}</div></div>
  <div><h4>Top players</h4><ol class="top3">${top.map(s => `<li>${nm(s)}<i>${Math.floor(s.score)}</i></li>`).join('')}</ol><h4>Awards</h4><ul class="awards">${awards.map(([t, s]) => `<li><span>${t}</span>${nm(s)}</li>`).join('')}</ul></div></div>`;
}

/* ---------- clarity: where to go, and who is shooting at you ---------- */
function objectiveFor(team) { // a checkpoint of ours being taken comes first; otherwise the next one along to take
  for (const c of GAME.cps) if (c.owner === team && c.inside[1 - team] > 0 && c.inside[team] === 0) return { c, kind: 'defend' };
  const c = GAME.cps[targetCpFor(team)]; return c && c.owner !== team ? { c, kind: 'attack' } : null;
}
let spotT = 0; const foeEls = [];
function hudRules(dt) {
  const s = PLAYER.s, alive = s && s.alive, me = GAME.team, pos = alive ? (s.veh || s).pos : null;
  const o = alive ? objectiveFor(me) : null, el = $('objMark'), line = $('objLine');
  let txt = '';
  if (o) {
    const z = o.c.p.zone, x = z.x * 1000, zz = z.y * 1000, y = groundY(x, zz) + 30, d = Math.hypot(x - pos.x, zz - pos.z);
    txt = `${o.kind === 'defend' ? 'Defend' : o.c.guardsLeft ? `Clear ${o.c.guardsLeft} guards at` : 'Capture'} ${o.c.p.name} · ${d > 950 ? (d / 1000).toFixed(1) + ' km' : Math.round(d / 10) * 10 + ' m'}`;
    _v.set(x, y, zz).project(camera);
    const inside = inZone(o.c, pos);
    if (_v.z < 1 && Math.abs(_v.x) < 1.1 && Math.abs(_v.y) < 1.1 && !inside) { el.style.display = 'block'; el.style.left = ((_v.x + 1) / 2 * innerWidth) + 'px'; el.style.top = ((1 - _v.y) / 2 * innerHeight) + 'px'; el.className = o.kind; const t = `${o.c.p.name} · ${d > 950 ? (d / 1000).toFixed(1) + ' km' : Math.round(d) + ' m'}`; if (el._t !== t) { el.lastChild.textContent = t; el._t = t; } }
    else el.style.display = 'none';
  } else el.style.display = 'none';
  if (line._t !== txt) { line.textContent = txt; line._t = txt; }
  // spotting: enemies near any of your side's units that you can see get a red marker (as War Thunder's arcade battles do)
  if ((spotT -= dt) <= 0) { spotT = .25; GAME.spotted = [];
    if (alive) { const friends = ENTS.filter(e => e.alive && e.team === me && !(e.kind === 'soldier' && e.veh));
      for (const e of ENTS) { if (!e.alive || e.team !== 1 - me || (e.kind === 'soldier' && e.veh) || e.kind === 'gun' || (e.kind === 'vehicle' && !e.driver)) continue;
        const d = e.pos.distanceTo(camera.position), R = e.kind === 'air' ? 5000 : e.kind === 'vehicle' ? 1500 : 450; if (d > R) continue;
        if (e.kind !== 'air' && !friends.some(f => f.pos.distanceTo(e.pos) < (e.kind === 'vehicle' ? 900 : 300))) continue;
        if (e.kind === 'air' || lineOfSight(camera.position, aimCenter(e, _w))) GAME.spotted.push(e);
        if (GAME.spotted.length >= 24) break; } } }
  let n = 0;
  if (alive) for (const e of GAME.spotted || []) {
    if (!e.alive) continue;
    _v.set(e.pos.x, e.pos.y + (e.kind === 'vehicle' || e.kind === 'air' ? e.T.hgt + 1.2 : 2.1), e.pos.z).project(camera);
    if (_v.z > 1 || Math.abs(_v.x) > 1 || Math.abs(_v.y) > 1) continue;
    let t = foeEls[n]; if (!t) { t = document.createElement('div'); t.className = 'tag foe'; $('tags').appendChild(t); foeEls[n] = t; }
    t.style.display = ''; t.style.left = ((_v.x + 1) / 2 * innerWidth) + 'px'; t.style.top = ((1 - _v.y) / 2 * innerHeight) + 'px';
    const d = e.pos.distanceTo(camera.position), nm = `${e.kind === 'soldier' ? '' : (e.T || e.def).short || ''} ${d > 950 ? (d / 1000).toFixed(1) + ' km' : Math.round(d) + ' m'}`.trim(); if (t._n !== nm) { t.textContent = nm; t._n = nm; }
    n++;
  }
  for (let i = n; i < foeEls.length; i++) foeEls[i].style.display = 'none';
}

/* ---------- a base visibly burns as its side's strength falls (as Havoc Bay's harbours do) ---------- */
function baseFires(dt) {
  if (!GAME.str || !GAME.M) return;
  for (const t of [0, 1]) {
    const b = GAME.M.bases[t], F = b.fires || (b.fires = []), want = Math.min(8, Math.floor((1 - GAME.str[t] / STRENGTH) * 10));
    while (F.length < want) { // a new fire somewhere in the base, with a bang to start it
      const [x, z] = b.site.w(rand(-300, 300), rand(-250, 250)), p = new V3(x, groundY(x, z) + 1, z);
      F.push(p); explosion(p.clone(), 8); Sound.at('boom', p);
    }
    for (const p of F) {
      if (Math.random() < dt * 3) sprite(_w.set(p.x + rand(-4, 4), p.y + 4, p.z + rand(-4, 4)), 10, 40, 7, 0x2b2927, false, 7, .7); // a tall column of black smoke, readable from far off
      if (Math.random() < dt * 8) sprite(_w.set(p.x + rand(-3, 3), p.y + 1.5, p.z + rand(-3, 3)), 5, 3, .6, 0xffffff, true, 3);
    }
  }
}
/* first battles: a few tips, a few seconds apart, after the first deploy on the ground */
function firstTips() {
  let n = 0; try { n = +(localStorage.getItem('islandfront.tips') || 0); localStorage.setItem('islandfront.tips', n + 1); } catch (e) { return; }
  if (n >= 2) return;
  const tips = [['Head for the gold diamond', 'It marks the objective: the next checkpoint to take, or one of ours to defend.'], ['Red markers are enemies your side can see', 'Right click for the gun sight, left click to fire. The gun is laid for the range automatically.'], ['Every enemy you knock out drains their strength', 'Hold Tab for the scoreboard. Spawn points buy tanks, helicopters and jets on the deploy screen.']];
  tips.forEach(([a, b], i) => setTimeout(() => { if (GAME.on && !GAME.over && PLAYER.s && PLAYER.s.alive) showMsg(a, b); }, 5000 + i * 9000));
}
