// Replays: a run is recorded as compact frames (20 per second, 16-bit
// quantised) plus a timeline of events (landings, pops, trick and HUD text),
// stored in this browser. Kept: the best run on each trail plus the 10 most
// recent. Playback drives the same animator and cameras as live riding.

import { wrapAngle } from './noise.js';

export const REC_DT = 0.05;
const KEY = 'loamline:v1:replays';
const KEEP_RECENT = 10;

// Field layout: [name, scale] — stored value = round(v * scale) in int16.
const FIELDS = [
  ['x', 40], ['y', 40], ['z', 40], ['yaw', 10000], ['pitch', 10000], ['roll', 30000], ['whip', 18000],
  ['speed', 1000], ['lift', 30000], ['preload', 30000], ['noHand', 30000], ['superman', 30000],
  ['barAngle', 4000], ['barspin', 2000], ['steerVis', 30000], ['brakeVis', 30000], ['landIn', 8000],
  ['spinVel', 3000], ['sliding', 30000], ['skid', 30000], ['clock', 100], ['flags', 1],
];
const NF = FIELDS.length;
const FLAG = { grounded: 1, pedaling: 2, crash: 4, bunny: 8, standing: 16 };

export class Recorder {
  constructor(origin) {
    this.origin = origin;          // keeps positions small for int16
    this.frames = [];
    this.events = [];
    this.t = 0;
    this.acc = 0;
  }
  // Called every frame with the elapsed time and a state snapshot.
  tick(dt, s) {
    this.t += dt;
    this.acc += dt;
    while (this.acc >= REC_DT) {
      this.acc -= REC_DT;
      this.frames.push(this.pack(s));
    }
  }
  pack(s) {
    const v = new Array(NF);
    const src = {
      ...s, x: s.x - this.origin.x, y: s.y - this.origin.y, z: s.z - this.origin.z,
      yaw: wrapAngle(s.yaw), pitch: wrapAngle(s.pitch), barAngle: s.barAngle % (Math.PI * 2), roll: Math.max(-1.09, Math.min(1.09, s.roll || 0)),
      landIn: Math.min(4, s.landIn), clock: Math.min(320, s.clock),
    };
    for (let i = 0; i < NF; i++) {
      const [k, sc] = FIELDS[i];
      v[i] = Math.max(-32767, Math.min(32767, Math.round((src[k] || 0) * sc)));
    }
    return v;
  }
  event(type, ...args) { this.events.push([+(this.t).toFixed(3), type, ...args]); }

  encode(meta) {
    const n = this.frames.length;
    const buf = new Int16Array(n * NF);
    for (let f = 0; f < n; f++) buf.set(this.frames[f], f * NF);
    return { v: 1, meta: { ...meta, frames: n, origin: this.origin }, events: this.events, data: b64(new Uint8Array(buf.buffer)) };
  }
}

export function decode(rec) {
  const bytes = unb64(rec.data);
  const raw = new Int16Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 2);
  const n = rec.meta.frames;
  const out = new Float32Array(n * NF);
  for (let f = 0; f < n; f++) for (let i = 0; i < NF; i++) out[f * NF + i] = raw[f * NF + i] / FIELDS[i][1];
  const o = rec.meta.origin;
  return {
    n, meta: rec.meta, events: rec.events, duration: n * REC_DT,
    // Interpolated state at time t.
    sample(t, into = {}) {
      const ft = Math.max(0, Math.min(n - 1.001, t / REC_DT));
      const a = Math.floor(ft), k = ft - a, b = Math.min(n - 1, a + 1);
      for (let i = 0; i < NF; i++) {
        const [key] = FIELDS[i];
        const va = out[a * NF + i], vb = out[b * NF + i];
        if (key === 'yaw' || key === 'pitch') into[key] = va + wrapAngle(vb - va) * k;
        else if (key === 'barAngle') { let d = vb - va; if (d < -3) d += Math.PI * 2; into[key] = va + d * k; }
        else if (key === 'flags') into[key] = out[a * NF + i];
        else into[key] = va + (vb - va) * k;
      }
      into.x += o.x; into.y += o.y; into.z += o.z;
      const fl = into.flags | 0;
      into.grounded = !!(fl & FLAG.grounded); into.pedaling = !!(fl & FLAG.pedaling);
      into.crash = !!(fl & FLAG.crash); into.bunny = !!(fl & FLAG.bunny); into.standing = !!(fl & FLAG.standing);
      return into;
    },
  };
}

export function flagsOf(s) {
  return (s.grounded ? FLAG.grounded : 0) | (s.pedaling ? FLAG.pedaling : 0) | (s.crash ? FLAG.crash : 0)
    | (s.bunny ? FLAG.bunny : 0) | (s.standing ? FLAG.standing : 0);
}

// ------------------------------------------------------------- storage --

function readList() {
  try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch { return []; }
}
function writeList(l) { try { localStorage.setItem(KEY, JSON.stringify(l)); } catch { /* full */ } }

export function listReplays() {
  return readList().sort((a, b) => b.date - a.date);
}

export function loadReplay(id) {
  try {
    const raw = localStorage.getItem(`${KEY}:${id}`);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

// Save a finished run. Returns its id (or null if storage is full).
export function saveReplay(rec) {
  const id = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e4).toString(36)}`;
  const m = rec.meta;
  let list = readList();
  const best = list.find((r) => r.course === m.course && r.best);
  const isBest = !best || m.time < best.time;
  if (isBest && best) best.best = false;
  list.push({ id, course: m.course, courseName: m.courseName, bike: m.bike, time: m.time, style: m.style, crashes: m.crashes, date: Date.now(), best: isBest });
  // Keep every course's best plus the most recent few.
  const recent = list.filter((r) => !r.best).sort((a, b) => b.date - a.date);
  const drop = new Set(recent.slice(KEEP_RECENT).map((r) => r.id));
  for (const r of list) if (drop.has(r.id)) { try { localStorage.removeItem(`${KEY}:${r.id}`); } catch { /* ignore */ } }
  list = list.filter((r) => !drop.has(r.id));
  try {
    localStorage.setItem(`${KEY}:${id}`, JSON.stringify(rec));
  } catch {
    // Out of space: drop the oldest non-best replays until it fits.
    const old = list.filter((r) => !r.best && r.id !== id).sort((a, b) => a.date - b.date);
    let saved = false;
    for (const r of old) {
      try { localStorage.removeItem(`${KEY}:${r.id}`); } catch { /* ignore */ }
      list = list.filter((x) => x.id !== r.id);
      try { localStorage.setItem(`${KEY}:${id}`, JSON.stringify(rec)); saved = true; break; } catch { /* keep trying */ }
    }
    if (!saved) { writeList(list.filter((x) => x.id !== id)); return null; }
  }
  writeList(list);
  return id;
}

export function deleteReplay(id) {
  try { localStorage.removeItem(`${KEY}:${id}`); } catch { /* ignore */ }
  writeList(readList().filter((r) => r.id !== id));
}

// ---------------------------------------------------------------- b64 --
function b64(u8) {
  let s = '';
  for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
  return btoa(s);
}
function unb64(str) {
  const s = atob(str);
  const u8 = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) u8[i] = s.charCodeAt(i);
  return u8;
}
