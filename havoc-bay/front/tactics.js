/* Island Front: each side's bots read what the other side is doing and answer it. Every few seconds a side's "command" looks at
   the enemy: what it fields, what has been killing us, where it is massing, whether it is bombing our base, who its most
   dangerous player is, and how the battle stands. From that it sets a plan: what new units to bring (counter-picks), what jobs
   aircraft take (fighters, ground attack, base strikes), how many bots go back to defend, whether to push, hold or flank, and
   whom to hunt. Bots follow the plan when they spawn, pick targets and choose where to go. Loaded after rules.js. */
'use strict';
const TAC_EVERY = 3;                 // seconds between looks at the enemy
const MEMORY = 75;                   // seconds a loss is remembered when working out what is killing us
const CLASSES_T = ['inf', 'jeep', 'ifv', 'mbt', 'heli', 'jet'];
// what each kind of unit is good against (0-1): used to answer what the enemy fields and what is killing us
const COUNTER = {
  inf:  { inf: .4, jeep: .5, ifv: .3, mbt: .2, heli: 0, jet: 0 },    // rifle and rockets
  jeep: { inf: .7, jeep: .6, ifv: .1, mbt: 0, heli: .2, jet: 0 },    // heavy machine gun
  ifv:  { inf: .9, jeep: .9, ifv: .6, mbt: .5, heli: .7, jet: .3 },  // autocannon (fires at aircraft too) and missile
  mbt:  { inf: .5, jeep: .8, ifv: .9, mbt: .9, heli: .2, jet: 0 },
  heli: { inf: .8, jeep: .9, ifv: .8, mbt: .9, heli: .5, jet: .1 },  // rockets, missiles, guns
  jet:  { inf: .3, jeep: .5, ifv: .6, mbt: .7, heli: .9, jet: 1 },
};
const PLAN_TEXT = { air: 'enemy aircraft overhead: sending fighters and anti-air', armour: 'enemy armour massing: bringing anti-tank', infantry: 'enemy infantry in numbers: bringing IFVs and light vehicles', strike: 'our base is being bombed: fighters up to defend it', hunt: 'hunting', push: 'we are losing ground: everyone push', hold: 'we are ahead: holding what we have', flank: 'the enemy is dug in on the road: going round the flanks', defend: 'the enemy is hitting' };

function unitClassOf(e) { if (!e) return null; const u = e.veh || e; return u.kind === 'air' || u.kind === 'vehicle' ? u.cls : u.kind === 'gun' ? 'gun' : 'inf'; }

function tacticsStart() {
  GAME.tac = [0, 1].map(t => ({ team: t, t: Math.random() * TAC_EVERY, losses: [], enemy: {}, want: {}, roles: {}, defendN: 0, stance: 'normal', flank: false, hunt: null, focus: null, said: {} }));
}
/* unitLost (rules.js) tells us what was lost and to what */
function tacNoteLoss(e, by) { if (!GAME.tac || !(e.team < 2)) return; const k = unitClassOf(by); if (k && by.team !== e.team) GAME.tac[e.team].losses.push({ t: GAME.time, to: k }); }

function tacticsStep(dt) {
  if (!GAME.tac || GAME.over) return;
  for (const T of GAME.tac) { if ((T.t -= dt) > 0) continue; T.t = TAC_EVERY; think(T); }
}
function think(T) {
  const me = T.team, foe = 1 - me;
  // 1. what the enemy fields right now
  const E = Object.fromEntries(CLASSES_T.map(k => [k, 0])); const foes = [];
  for (const e of ENTS) { if (!e.alive || e.team !== foe || (e.kind === 'soldier' && e.veh) || (e.kind === 'vehicle' && !e.driver) || (e.kind === 'air' && !e.driver) || e.kind === 'gun') continue; const k = unitClassOf(e); if (k in E) { E[k]++; foes.push(e); } }
  T.enemy = E;
  // 2. what has been killing us lately (recent losses count most)
  T.losses = T.losses.filter(l => GAME.time - l.t < MEMORY);
  const K = Object.fromEntries(CLASSES_T.map(k => [k, 0])); for (const l of T.losses) if (l.to in K) K[l.to] += 1 - (GAME.time - l.t) / MEMORY;
  // threat by enemy type: what it fields plus what is hurting us
  const threat = {}; for (const k of CLASSES_T) threat[k] = E[k] + K[k] * 1.5;
  // 3. the answer: how much we want of each unit = how well it beats the threats, weighted by them
  const want = {}; let sum = 0;
  for (const u of CLASSES_T) { let w = .35; for (const k of CLASSES_T) w += COUNTER[u][k] * threat[k]; want[u] = w; sum += w; }
  for (const u of CLASSES_T) want[u] /= sum || 1;
  T.want = want;
  // 4. aircraft jobs: fighters if the enemy flies, base strikes if we can afford them, ground attack otherwise
  const air = E.heli + E.jet + K.heli + K.jet, struck = GAME.time - GAME.lastBaseHit[me] < 30, armour = E.mbt + E.ifv + K.mbt;
  T.roles = { intercept: clamp((air * .35) + (struck ? .5 : 0), 0, .9), strike: struck || air > 2 ? .1 : .3 };
  // 5. where the enemy is: massing on one of our checkpoints means more of us go back; massed on the road means go round
  const C = GAME.cps; let worst = null, wn = 0;
  for (const c of C) if (c.owner === me) { const n = foes.filter(e => e.kind !== 'air' && Math.hypot(e.pos.x - c.p.zone.x * 1000, e.pos.z - c.p.zone.y * 1000) < 700).length; if (n > wn) { wn = n; worst = c; } }
  T.defendN = worst ? Math.min(GAME.bots - 1, Math.ceil(wn * 1.2)) : 0; T.defendCp = worst ? worst.i : -1;
  const obj = C[targetCpFor(me)], dug = obj && obj.owner === foe ? foes.filter(e => e.kind !== 'air' && Math.hypot(e.pos.x - obj.p.zone.x * 1000, e.pos.z - obj.p.zone.y * 1000) < 900).length : 0;
  T.flank = dug >= 3; // (dug in on the objective we must take: straight up the road is where they are looking)
  // 6. the battle: behind means push everything at the objective, ahead means hold and let them come
  const held = [0, 1].map(t => C.filter(c => c.owner === t).length), lead = (GAME.str[me] - GAME.str[foe]) + (held[me] - held[foe]) * 40;
  T.stance = lead < -60 ? 'push' : lead > 90 ? 'hold' : 'normal';
  // 7. the enemy's most dangerous player (a streak, or kills well above the rest): hunt them
  const stars = allStats().filter(s => s.team === foe && s.unit !== 'dead').sort((a, b) => (b.streak * 2 + b.kills * .5) - (a.streak * 2 + a.kills * .5));
  const star = stars[0] && (stars[0].streak >= 3 || stars[0].kills >= 6) ? stars[0] : null;
  T.hunt = star ? soldierOfStat(star) : null; T.huntName = star ? star.name : '';
  // 8. tell the player's side what its bots are doing (a line in the kill feed, not too often)
  if (me !== GAME.team && T.hunt && T.hunt === PLAYER.s && !T.said.huntYou) { T.said.huntYou = GAME.time; bigBanner('You are being hunted', 'Your kills have the enemy coming for you', 'bad'); Sound.play('alarm'); } else if (!(T.hunt && T.hunt === PLAYER.s)) T.said.huntYou = 0;
  if (me === GAME.team) announce(T, { air: T.roles.intercept >= .5 && !struck, strike: struck, armour: want.mbt + want.heli > .42 && armour >= 3, infantry: E.inf >= 4 && want.ifv > .22, hunt: !!T.hunt, push: T.stance === 'push', hold: T.stance === 'hold', flank: T.flank, defend: T.defendN >= 2 });
}
function soldierOfStat(st) { if (st.me) return PLAYER.s; const b = GAME.botsList.find(x => x.st === st); return b && b.soldier; }
function announce(T, flags) {
  for (const k in flags) {
    if (!flags[k]) { if (T.said[k] && GAME.time - T.said[k] > 20) T.said[k] = 0; continue; }
    if (T.said[k]) continue; T.said[k] = GAME.time;
    const txt = k === 'hunt' ? `${PLAN_TEXT.hunt} ${T.huntName === 'You' ? 'the enemy player who keeps killing us' : T.huntName}` : k === 'defend' ? `${PLAN_TEXT.defend} ${GAME.cps[T.defendCp].p.name}: ${T.defendN} going back` : PLAN_TEXT[k];
    feedLine(`<b style="color:${TEAMS[T.team].css}">${TEAMS[T.team].name} command</b> <span class="mut">${txt}</span>`);
    return; // one line at a time
  }
}
/* what the enemy's command is doing about you: shown when you are the one being hunted */
function tacHunted() { const T = GAME.tac && GAME.tac[1 - GAME.team]; return T && T.hunt && T.hunt === PLAYER.s && PLAYER.s && PLAYER.s.alive; }

/* ---------- hooks the bots call ---------- */
// what to bring this time: the side's wanted mix, less what it already has out, within what the bot can afford
function tacPickUnit(b, fallback, walk) {
  const T = GAME.tac && GAME.tac[b.team]; if (!T || !T.want.inf) return fallback;
  const have = Object.fromEntries(CLASSES_T.map(k => [k, 0])); let n = 0;
  for (const o of GAME.botsList) if (o !== b && o.team === b.team && o.soldier && o.soldier.alive) { const k = unitClassOf(o.soldier); if (k in have) { have[k]++; n++; } }
  const airN = have.heli + have.jet, airCap = Math.max(1, Math.round(GAME.bots * (T.roles.intercept > .5 ? .38 : .25))); // (more may fly when the enemy owns the sky)
  let best = fallback, bs = -1;
  for (const k of CLASSES_T) {
    if ((SP_COST[k] || 0) > b.sp) continue;
    if ((k === 'jet' || k === 'heli') && airN >= airCap) continue;
    if (k === 'inf' && walk > 1200) continue; // (too far to walk)
    const gap = T.want[k] - have[k] / Math.max(1, n + 1); // most wanted and least supplied first, with some chance in it
    const sc = gap + Math.random() * .12 + (k === 'jeep' && walk > 1200 ? .03 : 0);
    if (sc > bs) { bs = sc; best = k; }
  }
  return best;
}
// a job for an aircraft just taken: fighter, base strike or ground attack
function tacAirRole(b, a) {
  const T = GAME.tac && GAME.tac[b.team], r = Math.random(); if (!T) return 'cas';
  const canBomb = a.def.weapons.some(w => AMMO[w.k].look === 'bomb'), hasAA = a.def.weapons.some(w => AMMO[w.k].aa);
  if (a.cls === 'jet' && hasAA && r < T.roles.intercept) return 'intercept';
  if (a.cls === 'jet' && canBomb && r < T.roles.intercept + T.roles.strike) return 'strike';
  if (a.cls === 'heli' && hasAA && r < T.roles.intercept * .5) return 'intercept';
  return 'cas';
}
// how much a ground bot wants this target (lower is better): the hunted enemy player and what is killing us come first
function tacTargetBias(b, e) {
  const T = GAME.tac && GAME.tac[b.team]; if (!T || e.team > 1) return 1;
  let k = 1; if (T.hunt && (e === T.hunt || e === T.hunt.veh)) k *= .35;
  const cls = unitClassOf(e.kind === 'vehicle' || e.kind === 'air' ? e.driver || e : e), u = b.soldier && unitClassOf(b.soldier);
  if (u && cls && COUNTER[u] && COUNTER[u][cls] !== undefined) k *= 1.3 - COUNTER[u][cls] * .6; // pick fights this unit wins
  return k;
}
// where this bot goes: defend the checkpoint the enemy is massing on, or the objective
function tacObjective(b, ti) {
  const T = GAME.tac && GAME.tac[b.team]; if (!T) return ti;
  if (T.defendN > 0 && T.defendCp >= 0) { // the bots nearest the threatened checkpoint go back for it
    const c = GAME.cps[T.defendCp], d = o => o.soldier && o.soldier.alive && o.unit && o.unit.kind !== 'air' ? Math.hypot(o.unit.pos.x - c.p.zone.x * 1000, o.unit.pos.z - c.p.zone.y * 1000) : 1e9;
    const near = GAME.botsList.filter(o => o.team === b.team && d(o) < 4000).sort((x, y) => d(x) - d(y)).slice(0, T.defendN);
    if (near.includes(b)) return T.defendCp;
  }
  if (T.hunt && T.hunt.alive && b.huntPick === undefined) b.huntPick = Math.random() < .3; // a few go looking for the enemy's star
  return ti;
}
function tacHuntGoal(b, u) { // a hunter heads for the hunted player if they are on the ground within 1.5 km
  const T = GAME.tac && GAME.tac[b.team]; if (!T || !T.hunt || !T.hunt.alive || !b.huntPick) return null;
  const h = T.hunt.veh || T.hunt; if (h.kind === 'air') return null;
  return h.pos.distanceTo(u.pos) < 1500 ? new V3(h.pos.x, 0, h.pos.z) : null;
}
function tacStance(team) { return GAME.tac ? GAME.tac[team].stance : 'normal'; }
function tacFlank(team) { return GAME.tac ? GAME.tac[team].flank : false; }
