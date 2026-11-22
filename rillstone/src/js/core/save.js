// Saves in IndexedDB (BUILD_BRIEF section 9): 3 slots, each written to a
// rolling A/B pair. All four stores (meta, entities, chunks, economy) are
// written in one transaction, so a save either lands whole or not at all,
// and the other half of the pair is always a complete older save.
import { deflateSync, inflateSync, strToU8, strFromU8 } from 'fflate';

export const SAVE_VERSION = 2;
const DB = 'rillstone', STORES = ['meta', 'entities', 'chunks', 'economy'];
// One migration per version bump: MIGRATIONS[n] turns a version-n save into n+1.
const MIGRATIONS = {
  // 1 -> 2 (M6/M7): rails, economy flags (blueprints, Pumphouse, guide, lamp)
  // and vehicle hoppers/trams arrived; older saves get empty ones.
  1: (s) => ({ ...s, saveVersion: 2, rails: s.rails || { lines: [], nextLine: 1 }, economy: { ...(s.economy || {}), flags: s.economy?.flags || {} }, vehicles: (s.vehicles || []).map(v => ({ hopper: [], tram: null, ...v })) }),
};

function openDB() {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => { for (const s of STORES) if (!r.result.objectStoreNames.contains(s)) r.result.createObjectStore(s); };
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  });
}
const pack = (obj) => deflateSync(strToU8(JSON.stringify(obj)), { level: 6 });
const unpack = (u8) => JSON.parse(strFromU8(inflateSync(u8)));
const b64 = (u8) => { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); };
const unb64 = (s) => { const b = atob(s), u = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return u; };

export function migrate(snap) {
  let s = snap;
  if ((s.saveVersion || 0) > SAVE_VERSION) throw new Error(`This save is from a newer version of Rillstone (save version ${s.saveVersion})`);
  while ((s.saveVersion || 0) < SAVE_VERSION) { const f = MIGRATIONS[s.saveVersion || 0]; if (!f) throw new Error('No migration from save version ' + s.saveVersion); s = f(s); }
  return s;
}

export function createSaves() {
  let db = null;
  const ready = openDB().then(d => (db = d)).catch(() => null);
  try { navigator.storage?.persist?.(); } catch (_) {}
  const get = (tx, store, key) => new Promise((res, rej) => { const r = tx.objectStore(store).get(key); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });

  const api = {
    get available() { return !!db; },
    ready,
    // List the newest complete save in each slot.
    async list() {
      await ready; if (!db) return [];
      const tx = db.transaction('meta', 'readonly'), out = [];
      for (const slot of [1, 2, 3]) {
        const metas = (await Promise.all(['A', 'B'].map(ab => get(tx, 'meta', `${slot}:${ab}`)))).filter(Boolean);
        metas.sort((a, b) => b.savedAt - a.savedAt);
        out.push(metas[0] ? { slot, ...metas[0] } : { slot, empty: true });
      }
      return out;
    },
    // Write a snapshot (plain object) to a slot's older A/B half.
    async save(slot, snap) {
      await ready; if (!db) throw new Error('Saving is not available in this browser');
      const list = await api.list();
      const cur = list.find(x => x.slot === slot);
      const ab = cur && !cur.empty && cur.ab === 'A' ? 'B' : 'A';
      const key = `${slot}:${ab}`;
      const meta = { slot, ab, saveVersion: SAVE_VERSION, savedAt: Date.now(), playTime: snap.playTime || 0, day: snap.day, scrip: snap.economy?.scrip ?? 0, standing: snap.economy?.standing ?? 0, thumb: typeof snap.thumb === 'string' && snap.thumb.length < 40000 ? snap.thumb : null };
      const { chunks = [], economy = {}, thumb, ...rest } = snap; void thumb;
      await new Promise((res, rej) => {
        const tx = db.transaction(STORES, 'readwrite');
        tx.objectStore('entities').put(pack(rest), key);
        tx.objectStore('chunks').put(chunks.map(c => ({ claim: c.claim, key: c.key, dens: deflateSync(new Uint8Array(c.dens.buffer, c.dens.byteOffset, c.dens.byteLength)), band: deflateSync(c.band) })), key);
        tx.objectStore('economy').put(pack(economy), key);
        tx.objectStore('meta').put(meta, key); // last, in the same transaction
        tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error); tx.onabort = () => rej(tx.error || new Error('save aborted'));
      });
      return meta;
    },
    // Newest half first; if it won't read (a damaged write, a bad
    // migration), fall back to the older complete half of the pair.
    async load(slot) {
      await ready; if (!db) return null;
      const mtx = db.transaction('meta', 'readonly');
      const metas = (await Promise.all(['A', 'B'].map(ab => get(mtx, 'meta', `${slot}:${ab}`)))).filter(Boolean).sort((a, b) => b.savedAt - a.savedAt);
      if (!metas.length) return null;
      let err = null;
      for (const m of metas) {
        try {
          const key = `${slot}:${m.ab}`, tx = db.transaction(STORES, 'readonly');
          const [ent, ch, eco] = await Promise.all([get(tx, 'entities', key), get(tx, 'chunks', key), get(tx, 'economy', key)]);
          const snap = { ...unpack(ent), economy: unpack(eco), chunks: (ch || []).map(c => ({ claim: c.claim, key: c.key, dens: new Int8Array(inflateSync(c.dens).buffer), band: inflateSync(c.band) })) };
          return migrate(snap);
        } catch (e) { err = e; console.warn(`Save ${slot}:${m.ab} would not load, trying the older half`, e); }
      }
      throw err;
    },
    // .rillsave files: a deflated JSON document (Safari clears site data after 7 days unused).
    exportBlob(snap) {
      const doc = { ...snap, chunks: (snap.chunks || []).map(c => ({ claim: c.claim, key: c.key, dens: b64(new Uint8Array(c.dens.buffer, c.dens.byteOffset, c.dens.byteLength)), band: b64(c.band) })) };
      return new Blob([deflateSync(strToU8(JSON.stringify({ rillsave: 1, ...doc })))], { type: 'application/octet-stream' });
    },
    async importFile(file) {
      const u8 = new Uint8Array(await file.arrayBuffer());
      const doc = JSON.parse(strFromU8(inflateSync(u8)));
      if (!doc.rillsave) throw new Error('Not a Rillstone save');
      delete doc.rillsave;
      doc.chunks = (doc.chunks || []).map(c => ({ claim: c.claim, key: c.key, dens: new Int8Array(unb64(c.dens).buffer), band: unb64(c.band) }));
      return migrate(doc);
    },
  };
  return api;
}
