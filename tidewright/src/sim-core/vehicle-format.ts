// Versioned vehicle file format. Block types are stored by NAME through a table,
// so adding or reordering parts never breaks old files. Migrations are kept forever.
import { VehicleGrid, type Cell, type Props } from './grid';
import { PART_BY_ID } from './parts';
import { ROTATIONS } from './rotations';
import { PALETTE } from './palette';

export const FORMAT_ID = 'tidewright.vehicle';
export const SCHEMA_VERSION = 1;
export const PHYSICS_VERSION = 1;
export const MAX_BLOCKS = 20000;

export interface VehicleFile {
  format: typeof FORMAT_ID;
  schemaVersion: number;
  physicsVersion: number;
  name: string;
  createdAt: number;
  updatedAt: number;
  partTable: string[];
  /** [typeIndex, x, y, z, rot, color] per part */
  blocks: [number, number, number, number, number, number][];
  /** non-default props, keyed by block index */
  props: Record<string, Props>;
}

type Migration = (f: any) => any;
/** migrations[n] upgrades a file from schemaVersion n to n+1. */
export const MIGRATIONS: Record<number, Migration> = {};

export function serialize(grid: VehicleGrid, name: string, createdAt = Date.now()): VehicleFile {
  const table: string[] = [];
  const tIdx = new Map<string, number>();
  const blocks: VehicleFile['blocks'] = [];
  const props: VehicleFile['props'] = {};
  const sorted = [...grid.parts.values()].sort((a, b) => a.id - b.id);
  for (const p of sorted) {
    let t = tIdx.get(p.type);
    if (t === undefined) { t = table.length; table.push(p.type); tIdx.set(p.type, t); }
    if (p.props && Object.keys(p.props).length) props[String(blocks.length)] = { ...p.props };
    blocks.push([t, p.pos[0], p.pos[1], p.pos[2], p.rot, p.color]);
  }
  return {
    format: FORMAT_ID, schemaVersion: SCHEMA_VERSION, physicsVersion: PHYSICS_VERSION,
    name, createdAt, updatedAt: Date.now(), partTable: table, blocks, props,
  };
}

export class VehicleFileError extends Error {}

/** Upgrade any supported older file to the current schema. */
export function migrate(raw: any, migrations: Record<number, Migration> = MIGRATIONS): VehicleFile {
  if (!raw || typeof raw !== 'object') throw new VehicleFileError('Not a vehicle file');
  if (raw.format !== FORMAT_ID) throw new VehicleFileError('Unknown file format');
  let f = raw;
  let v = Number(f.schemaVersion);
  if (!Number.isInteger(v) || v < 0) throw new VehicleFileError('Bad schema version');
  if (v > SCHEMA_VERSION) throw new VehicleFileError(`File is from a newer game version (schema ${v})`);
  while (v < SCHEMA_VERSION) {
    const m = migrations[v];
    if (!m) throw new VehicleFileError(`No migration from schema ${v}`);
    f = m(f);
    v += 1;
    f.schemaVersion = v;
  }
  return f as VehicleFile;
}

export interface LoadResult {
  grid: VehicleGrid;
  name: string;
  createdAt: number;
  warnings: string[];
}

/** Validate and load a file into a grid. Unknown parts and overlaps are skipped with warnings. */
export function deserialize(raw: unknown): LoadResult {
  const f = migrate(raw);
  const warnings: string[] = [];
  if (!Array.isArray(f.blocks) || !Array.isArray(f.partTable)) throw new VehicleFileError('Malformed vehicle file');
  if (f.blocks.length > MAX_BLOCKS) throw new VehicleFileError(`Too many parts (${f.blocks.length} > ${MAX_BLOCKS})`);
  if (f.physicsVersion !== PHYSICS_VERSION) warnings.push(`Built for physics v${f.physicsVersion}; handling may differ.`);
  const grid = new VehicleGrid();
  const unknown = new Set<string>();
  f.blocks.forEach((b, i) => {
    if (!Array.isArray(b) || b.length < 6 || !b.every((n) => Number.isFinite(n))) { warnings.push(`Skipped corrupt block #${i}`); return; }
    const [t, x, y, z, rot, color] = b.map((n) => Math.trunc(n));
    const type = f.partTable[t];
    if (!type || !PART_BY_ID.has(type)) { unknown.add(String(type)); return; }
    if (rot < 0 || rot >= ROTATIONS.length) { warnings.push(`Bad rotation on block #${i}`); return; }
    const pos: Cell = [x, y, z];
    if (!grid.canPlace(type, pos, rot)) { warnings.push(`Overlapping or out-of-bounds block #${i} skipped`); return; }
    const c = color >= 0 && color < PALETTE.length ? color : 0;
    grid.add(grid.make(type, pos, rot, c, sanitizeProps(f.props?.[String(i)])));
  });
  if (unknown.size) warnings.push(`Unknown parts skipped: ${[...unknown].join(', ')}`);
  return { grid, name: String(f.name ?? 'Untitled').slice(0, 64), createdAt: Number(f.createdAt) || Date.now(), warnings };
}

function sanitizeProps(p: unknown): Props | undefined {
  if (!p || typeof p !== 'object') return undefined;
  const out: Props = {};
  for (const [k, v] of Object.entries(p as Record<string, unknown>)) {
    if (typeof v === 'number' && Number.isFinite(v)) out[k] = v;
    else if (typeof v === 'string') out[k] = v.slice(0, 64);
    else if (typeof v === 'boolean') out[k] = v;
  }
  return out;
}

/** gzip a vehicle file to bytes for export (browser CompressionStream; Node 18+ also has it). */
export async function encodeFile(f: VehicleFile): Promise<Uint8Array> {
  const stream = new Blob([JSON.stringify(f)]).stream().pipeThrough(new CompressionStream('gzip'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

export async function decodeFile(bytes: Uint8Array): Promise<unknown> {
  // Accept plain JSON too (hand-edited files).
  if (bytes[0] === 0x7b) return JSON.parse(new TextDecoder().decode(bytes));
  const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(new DecompressionStream('gzip'));
  return JSON.parse(await new Response(stream).text());
}
