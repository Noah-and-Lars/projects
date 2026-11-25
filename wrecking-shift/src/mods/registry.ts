/**
 * Mod registry: every `mods/** /*.mod.ts` file is bundled at build time (Vite import.meta.glob, eager), so
 * mods work in the single-file build. `MODS` is the validated list; `ModState` remembers which are enabled
 * (localStorage `wrecking-shift-mods`). Content of every mod (maps, vehicles) is registered with the game's
 * registries up front so quickloads and menus can always resolve ids; menus only offer enabled mods.
 */
import { VEHICLE_BLUEPRINTS } from '../sim/prefabs/vehicles';
import type { MapDef, ModCategory, ModeDef, ModManifest, PropDef, ToolDef, VehicleModDef } from './api';

const files = import.meta.glob('../../mods/**/*.mod.ts', { eager: true }) as Record<string, { default?: ModManifest }>;

export const CATEGORY_LABEL: Record<ModCategory, string> = {
  props: 'Props', tools: 'Tools', vehicles: 'Vehicles', maps: 'Maps', modes: 'Game modes', global: 'Rule tweaks', visual: 'Visual',
};

/** load + validate; throws on duplicate ids so a broken mod set fails the tests, not the player */
function loadAll(): ModManifest[] {
  const out: ModManifest[] = [];
  const ids = new Set<string>(), content = new Set<string>();
  const uniq = (kind: string, id: string, mod: string) => {
    const k = kind + ':' + id;
    if (content.has(k)) throw new Error(`mod ${mod}: duplicate ${kind} id '${id}'`);
    content.add(k);
  };
  for (const path of Object.keys(files).sort()) {
    const m = files[path].default;
    if (!m || typeof m !== 'object' || !m.id || !m.name) throw new Error('mod file without a default defineMod export: ' + path);
    if (ids.has(m.id)) throw new Error('duplicate mod id ' + m.id + ' (' + path + ')');
    ids.add(m.id);
    for (const p of m.props ?? []) uniq('prop', p.id, m.id);
    for (const t of m.tools ?? []) uniq('tool', t.id, m.id);
    for (const v of m.vehicles ?? []) uniq('vehicle', v.id, m.id);
    for (const l of m.maps ?? []) uniq('map', l.id, m.id);
    for (const g of m.modes ?? []) uniq('mode', g.id, m.id);
    out.push(m);
  }
  return out;
}

export const MODS: readonly ModManifest[] = loadAll();
// every mod vehicle can be spawned / quickloaded by id (blueprints are built on demand)
for (const m of MODS) for (const v of m.vehicles ?? []) {
  if (VEHICLE_BLUEPRINTS[v.id]) throw new Error(`mod ${m.id}: vehicle id '${v.id}' is taken`);
  VEHICLE_BLUEPRINTS[v.id] = () => v.blueprint();
}

export const modById = (id: string): ModManifest | undefined => MODS.find((m) => m.id === id);

const STORE = 'wrecking-shift-mods';
const defaultOn = (m: ModManifest) => m.defaultEnabled ?? !(m.category === 'global' || m.category === 'visual');

/** which mods are enabled; remembered in localStorage */
export class ModState {
  private on = new Map<string, boolean>();
  private listeners: (() => void)[] = [];
  constructor(private storage: Pick<Storage, 'getItem' | 'setItem'> | null = safeStorage()) {
    let saved: Record<string, boolean> = {};
    try { saved = JSON.parse(this.storage?.getItem(STORE) ?? '{}')?.enabled ?? {}; } catch { saved = {}; }
    for (const m of MODS) this.on.set(m.id, typeof saved[m.id] === 'boolean' ? saved[m.id] : defaultOn(m));
    // stored conflicts (e.g. two gravity mods): keep the first
    const used = new Set<string>();
    for (const m of MODS) if (m.conflicts && this.on.get(m.id)) { if (used.has(m.conflicts)) this.on.set(m.id, false); else used.add(m.conflicts); }
  }
  isEnabled(id: string): boolean { return !!this.on.get(id); }
  /** enable / disable; enabling a mod switches off others with the same conflict key. Returns those switched off. */
  set(id: string, enabled: boolean): string[] {
    const m = modById(id);
    if (!m) return [];
    const off: string[] = [];
    if (enabled && m.conflicts) for (const o of MODS) if (o.id !== id && o.conflicts === m.conflicts && this.on.get(o.id)) { this.on.set(o.id, false); off.push(o.id); }
    this.on.set(id, enabled);
    this.save();
    for (const l of this.listeners) l();
    return off;
  }
  setAll(enabled: boolean, category?: ModCategory): void {
    const used = new Set<string>();
    for (const m of MODS) {
      if (category && m.category !== category) continue;
      let v = enabled;
      if (v && m.conflicts) { if (used.has(m.conflicts)) v = false; else used.add(m.conflicts); }
      this.on.set(m.id, v);
    }
    this.save();
    for (const l of this.listeners) l();
  }
  resetDefaults(): void { for (const m of MODS) this.on.set(m.id, defaultOn(m)); this.save(); for (const l of this.listeners) l(); }
  onChange(cb: () => void): void { this.listeners.push(cb); }
  enabled(): ModManifest[] { return MODS.filter((m) => this.on.get(m.id)); }
  count(): number { return this.enabled().length; }
  private save(): void {
    const enabled: Record<string, boolean> = {};
    for (const [k, v] of this.on) enabled[k] = v;
    try { this.storage?.setItem(STORE, JSON.stringify({ v: 1, enabled })); } catch { /* storage full / blocked */ }
  }
}

function safeStorage(): Pick<Storage, 'getItem' | 'setItem'> | null {
  try { const ls = (globalThis as any).localStorage; return ls && typeof ls.getItem === 'function' ? ls : null; } catch { return null; }
}

// flat views over all mods (with the owning mod id)
export const allProps = (): (PropDef & { mod: string })[] => MODS.flatMap((m) => (m.props ?? []).map((p) => ({ ...p, mod: m.id })));
export const allTools = (): (ToolDef & { mod: string })[] => MODS.flatMap((m) => (m.tools ?? []).map((p) => ({ ...p, mod: m.id })));
export const allVehicles = (): (VehicleModDef & { mod: string })[] => MODS.flatMap((m) => (m.vehicles ?? []).map((p) => ({ ...p, mod: m.id })));
export const allMaps = (): (MapDef & { mod: string })[] => MODS.flatMap((m) => (m.maps ?? []).map((p) => ({ ...p, mod: m.id })));
export const allModes = (): (ModeDef & { mod: string })[] => MODS.flatMap((m) => (m.modes ?? []).map((p) => ({ ...p, mod: m.id })));
