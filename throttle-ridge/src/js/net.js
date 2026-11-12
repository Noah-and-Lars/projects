// Online races (1.1): up to 4 players over the arcade's realtime server
// (rt.js, the same Cloudflare Worker every arcade game uses).
//
// Rooms are realtime channels. Presence is the player list: { id, n: name,
// b: bike, t: joined, s: 'lobby' | 'race', k: track (the host's pick) }. The
// host is whoever has been in the room longest. The host sends 'go' with the
// track and the riders; every screen then runs its own countdown.
//
// In a race every screen simulates only its own bike and sends its state 10
// times a second ('s'). The other bikes are puppets: their bodies are switched
// off in the physics world and moved to where the snapshots say, drawn about
// 160 ms behind so they move smoothly between snapshots.
import { Vec2 } from 'planck';
import { throwRider } from './race.js';
import { destroyRagdoll } from './ragdoll.js';

const RT_LIB = 'https://noah-and-lars.github.io/projects/rt.js?v=2';
const MAX = 4;
const SEND_MS = 100;
const DELAY = 160;
const ALPH = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const TEST = (new URLSearchParams(location.search).get('trroom') || '').replace(/[^a-z0-9]/gi, '').slice(0, 12).toLowerCase();
const BASE = TEST ? 'tr11-test-' + TEST : 'tr11';

export const cleanName = (n) => String(n || '').replace(/[^A-Za-z0-9_ .'-]/g, '').trim().slice(0, 16);
function myName() {
  try {
    const a = JSON.parse(localStorage.getItem('arcade-acct') || 'null');
    if (a && a.name) return cleanName(a.name);
    const l = JSON.parse(localStorage.getItem('arcade-local') || 'null');
    if (l && l.name) return cleanName(l.name);
  } catch (_) {}
  return 'Rider';
}

export function createNet(h) {
  const myId = (Math.random().toString(36) + '00000000').slice(2, 10);
  let client = null, libLoad = null, ch = null, room = null, joinedAt = 0, me = null;
  let members = [], synced = false, sendT = 0, cdT = 0, cdLeft = 0, race = null, raceIds = [];
  const api = { id: myId, on: false, room: null, isPublic: false, members: () => members, name: myName };

  function getClient() {
    if (client) return Promise.resolve(client);
    try { const A = window.parent !== window && window.parent.ArcadeOnline, c = A && A.client && A.client(); if (c) return Promise.resolve(client = c); } catch (_) {}
    if (!libLoad) libLoad = new Promise((res, rej) => {
      if (window.supabase && window.supabase.createClient) return res();
      const s = document.createElement('script'); s.src = RT_LIB; s.async = true; s.onload = res; s.onerror = () => { libLoad = null; rej(new Error('offline')); };
      document.head.appendChild(s);
    });
    return libLoad.then(() => client || (client = window.supabase.createClient()));
  }
  const listMembers = () => {
    const st = ch ? ch.presenceState() : {}, out = [];
    for (const k in st) { const m = st[k] && st[k][0]; if (m && typeof m.id === 'string') out.push(m); }
    return out.sort((a, b) => (a.t - b.t) || (a.id < b.id ? -1 : 1));
  };
  api.host = () => members[0] || null;
  api.isHost = () => !!members[0] && members[0].id === myId;
  api.me = () => me;
  function send(event, payload) {
    if (!ch || ch.state !== 'joined') return;
    try { const p = ch.send({ type: 'broadcast', event, payload: Object.assign({ f: myId }, payload) }); if (p && p.catch) p.catch(() => {}); } catch (_) {}
  }
  function track() {
    if (!ch || ch.state !== 'joined') return;
    try { const p = ch.track(me); if (p && p.catch) p.catch(() => {}); } catch (_) {}
  }
  api.set = (patch) => { Object.assign(me, patch); track(); };

  function drop() {
    clearInterval(cdT); cdT = 0;
    if (ch) { const c = ch; ch = null; try { c.untrack && c.untrack(); } catch (_) {} try { const p = client.removeChannel(c); if (p && p.catch) p.catch(() => {}); } catch (_) {} }
    members = []; synced = false; race = null;
  }

  // Join a room; resolves 'ok', or 'full' when 4 riders are already in it.
  function enter(name, opts) {
    return new Promise((res, rej) => {
      drop();
      room = name; joinedAt = Date.now();
      me = { id: myId, n: myName(), b: opts.bike || 'stock', t: joinedAt, s: 'lobby', k: opts.track || 0 };
      ch = client.channel(BASE + '-' + name, { config: { broadcast: { self: false, ack: false }, presence: { key: myId } } });
      const c = ch;
      let done = false;
      const to = setTimeout(() => { if (!done) { done = true; rej(new Error('offline')); } }, 10000);
      ch.on('presence', { event: 'sync' }, () => {
        if (c !== ch) return;
        members = listMembers();
        const i = members.findIndex(m => m.id === myId);
        if (i < 0) return;
        if (!done) {
          done = true; clearTimeout(to);
          if (i >= MAX) { drop(); res('full'); return; }
          res('ok');
        }
        synced = true;
        members = members.slice(0, MAX);
        if (race) for (const b of race.bikes) if (b.remote && !members.some(m => m.id === b.remote.id)) b.remote.gone = true;
        h.lobby?.();
        hostTick();
      });
      ch.on('broadcast', { event: 'go' }, (m) => { if (c === ch) onGo(m.payload || {}); });
      ch.on('broadcast', { event: 's' }, (m) => { if (c === ch) onState(m.payload || {}); });
      ch.on('broadcast', { event: 'cd' }, (m) => { const p = m.payload || {}; if (c === ch && api.host() && p.f === api.host().id) { cdLeft = +p.s || 0; h.lobby?.(); } });
      ch.subscribe((st) => {
        if (st === 'SUBSCRIBED') track();
        else if ((st === 'CHANNEL_ERROR' || st === 'TIMED_OUT') && !done) { done = true; clearTimeout(to); rej(new Error('offline')); }
      });
    });
  }

  api.quick = async (opts) => {
    await getClient();
    for (let n = 1; n <= 20; n++) {
      if (await enter('pub' + n, opts) === 'ok') { api.on = true; api.room = 'pub' + n; api.isPublic = true; return 'ok'; }
    }
    return 'full';
  };
  api.create = async (opts) => {
    await getClient();
    let code = '';
    for (let i = 0; i < 4; i++) code += ALPH[Math.floor(Math.random() * ALPH.length)];
    await enter('r-' + code, opts);
    api.on = true; api.room = code; api.isPublic = false;
    return code;
  };
  api.join = async (code, opts) => {
    code = String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
    if (!code) return 'bad';
    await getClient();
    const r = await enter('r-' + code, opts);
    if (r === 'ok') { api.on = true; api.room = code; api.isPublic = false; }
    return r;
  };
  api.leave = () => { drop(); api.on = false; api.room = null; };
  api.countdown = () => cdLeft;

  // ---- Host: start races (by hand, or by itself in public rooms) ----
  const lobbyMembers = () => members.filter(m => m.s === 'lobby');
  api.canStart = () => api.isHost() && lobbyMembers().length >= 2;
  api.start = () => {
    if (!api.canStart()) return false;
    const ids = lobbyMembers().map(m => m.id);
    const p = { k: me.k | 0, ids, p: lobbyMembers().map(m => ({ id: m.id, n: cleanName(m.n) || 'Rider', b: m.b })) };
    send('go', p);
    onGo(Object.assign({ f: myId }, p));
    return true;
  };
  function hostTick() {
    // Public rooms start by themselves 15 s after two riders are waiting.
    const want = api.isPublic && api.isHost() && lobbyMembers().length >= 2 && members.every(m => m.s === 'lobby');
    if (want && !cdT) {
      cdLeft = 15;
      cdT = setInterval(() => {
        if (!(api.isPublic && api.isHost() && lobbyMembers().length >= 2)) { clearInterval(cdT); cdT = 0; cdLeft = 0; send('cd', { s: 0 }); h.lobby?.(); return; }
        cdLeft--;
        send('cd', { s: cdLeft });
        h.lobby?.();
        if (cdLeft <= 0) { clearInterval(cdT); cdT = 0; api.start(); }
      }, 1000);
    } else if (!want && cdT) { clearInterval(cdT); cdT = 0; cdLeft = 0; send('cd', { s: 0 }); }
  }

  function onGo(p) {
    if (!api.host() || p.f !== api.host().id) return;
    if (!Array.isArray(p.ids) || !p.ids.includes(myId) || me.s !== 'lobby') return;
    cdLeft = 0;
    const players = (p.p || []).filter(o => o && o.id !== myId && p.ids.includes(o.id)).slice(0, MAX - 1)
      .map(o => ({ id: String(o.id), name: cleanName(o.n) || 'Rider', kind: o.b === 'mid' ? 'mid' : 'stock' }));
    raceIds = players.map(o => o.id);
    api.set({ s: 'race' });
    h.start?.({ track: Math.max(0, Math.min(4, p.k | 0)), players });
  }

  // ---- In a race ----
  api.attach = (r) => {
    race = r;
    if (!r) return;
    r.remoteStep = remoteStep;
    for (const b of r.bikes) if (b.remote && !members.some(m => m.id === b.remote.id)) b.remote.gone = true;
  };
  api.backToLobby = () => { race = null; api.set({ s: 'lobby' }); };
  const r3 = (v) => Math.round(v * 1000) / 1000;
  const pa = (body) => { const p = body.getPosition(); return [r3(p.x), r3(p.y), r3(body.getAngle())]; };
  // Called every frame while racing: send our bike now and then.
  api.tick = (r) => {
    const now = performance.now();
    if (now - sendT < SEND_MS || !r) return;
    sendT = now;
    const b = r.player;
    const k = (b.crashed ? 1 : 0) | (b.grounded ? 2 : 0) | (b.rearContact ? 4 : 0) | (b.input.throttle > 0 ? 8 : 0) | (b.finished ? 16 : 0);
    send('s', { c: pa(b.chassis), r: pa(b.rear), w: pa(b.front), l: Math.round(b.leanVisual * 100) / 100, k, ft: b.finished ? r3(b.finishTime) : 0, rt: r3(r.time) });
  };
  function onState(p) {
    if (!race || !raceIds.includes(p.f)) return;
    const b = race.bikes.find(x => x.remote && x.remote.id === p.f);
    if (!b) return;
    const ok = (a) => Array.isArray(a) && a.length === 3 && a.every(Number.isFinite);
    if (!ok(p.c) || !ok(p.r) || !ok(p.w)) return;
    const buf = b.remote.buf;
    buf.push({ t: performance.now(), c: p.c, r: p.r, w: p.w, l: +p.l || 0, k: p.k | 0 });
    if (buf.length > 30) buf.splice(0, buf.length - 30);
    b.remote.seen = performance.now();
    if ((p.k & 16) && !b.remote.finished && p.ft > 0) {
      b.remote.finished = true; b.remote.finishTime = +p.ft;
      h.remoteFinish?.(b);
    }
  }
  const lerpA = (a, b, t) => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * t;
  function remoteStep(r, b) {
    const buf = b.remote.buf;
    if (!buf.length) return;
    const at = performance.now() - DELAY;
    let i = buf.length - 1;
    while (i > 0 && buf[i - 1].t > at) i--;
    const s1 = buf[i], s0 = i > 0 ? buf[i - 1] : s1;
    const span = s1.t - s0.t, t = span > 0 ? Math.max(0, Math.min(1, (at - s0.t) / span)) : 1;
    const jump = Math.abs(s1.c[0] - s0.c[0]) > 6; // a respawn: snap, don't slide
    const place = (body, key) => {
      const a = jump ? s1[key] : s0[key], z = s1[key], u = jump ? 1 : t;
      body.setTransform(Vec2(a[0] + (z[0] - a[0]) * u, a[1] + (z[1] - a[1]) * u), lerpA(a[2], z[2], u));
    };
    place(b.chassis, 'c'); place(b.rear, 'r'); place(b.front, 'w');
    const vx = span > 0 && !jump ? (s1.c[0] - s0.c[0]) / (span / 1000) : 0, vy = span > 0 && !jump ? (s1.c[1] - s0.c[1]) / (span / 1000) : 0;
    b.chassis.setLinearVelocity(Vec2(vx, vy));
    b.rear.setAngularVelocity(-vx / 0.36);
    const k = (t > 0.5 ? s1 : s0).k;
    const crashed = !!(k & 1);
    if (crashed && !b.crashed) {
      b.lastVel = Vec2(vx, vy);
      throwRider(r, b);
      const p = b.chassis.getPosition();
      r.events.push({ type: 'crash', bike: b.id, x: p.x, y: p.y });
    } else if (!crashed && b.crashed) {
      if (b.ragdoll) { destroyRagdoll(r.world, b.ragdoll); b.ragdoll = null; }
      r.events.push({ type: 'respawn', bike: b.id });
    }
    b.crashed = crashed;
    b.crashTimer = crashed ? 1 : 0;
    const grounded = !!(k & 2);
    if (grounded && !b.grounded && b.airTime > 0.3) r.events.push({ type: 'land', bike: b.id, quality: 1, impact: Math.min(12, Math.abs(vy) * 0.6), x: b.chassis.getPosition().x, y: b.chassis.getPosition().y });
    b.airTime = grounded ? 0 : b.airTime + 1 / 60;
    b.grounded = grounded;
    b.rearContact = !!(k & 4);
    b.input.throttle = k & 8 ? 1 : 0;
    b.leanVisual += ((s0.l + (s1.l - s0.l) * t) - b.leanVisual) * 0.5;
  }
  return api;
}
