// IndexedDB vehicle library. Every call is wrapped so private windows degrade gracefully.
import type { VehicleFile } from '../sim-core/vehicle-format';

const DB_NAME = 'tidewright';
const DB_VERSION = 1;
const STORE = 'vehicles';
export const AUTOSAVE = '__autosave__';

export interface SavedVehicle { name: string; file: VehicleFile; updatedAt: number; thumb?: string }

let dbp: Promise<IDBDatabase> | null = null;
function open(): Promise<IDBDatabase> {
  if (dbp) return dbp;
  dbp = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') return reject(new Error('IndexedDB unavailable'));
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'name' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  dbp.catch(() => { dbp = null; });
  return dbp;
}

function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return open().then((db) => new Promise<T>((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const r = fn(t.objectStore(STORE));
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  }));
}

export async function saveVehicle(v: SavedVehicle): Promise<void> { await tx('readwrite', (s) => s.put(v)); }
export async function loadVehicle(name: string): Promise<SavedVehicle | undefined> { return tx('readonly', (s) => s.get(name)); }
export async function deleteVehicle(name: string): Promise<void> { await tx('readwrite', (s) => s.delete(name)); }
export async function listVehicles(): Promise<SavedVehicle[]> {
  const all = await tx<SavedVehicle[]>('readonly', (s) => s.getAll());
  return all.filter((v) => v.name !== AUTOSAVE).sort((a, b) => b.updatedAt - a.updatedAt);
}
export async function requestPersist(): Promise<void> {
  try { await navigator.storage?.persist?.(); } catch { /* ignore */ }
}
