import RAPIER from '@dimforge/rapier3d-compat';
import { VoxelBody, type BodyKind } from './body';
import { findIslands, type Island } from './connectivity';
import { MATERIALS, PAL_DENSITY, PAL_EXPLOSIVE, PAL_HARDNESS, PAL_STRENGTH, VOXEL, matOf, scorch as scorchPal } from './materials';
import { Rng, hash3 } from './rng';
import { QID, qrot, vadd, vcross, vlen, vscale, vsub, type Quat, type V3 } from './vec';
import { VoxelGrid, computeMassProps } from './voxels';

export { RAPIER };

let rapierReady: Promise<void> | null = null;
export function initPhysics(): Promise<void> {
  if (!rapierReady) rapierReady = RAPIER.init();
  return rapierReady;
}

export const DT = 1 / 60;

/** collision groups (membership << 16 | filter) */
export const GROUP_WORLD = 0x0001;
export const GROUP_DEBRIS = 0x0002;
export const GROUP_PLAYER = 0x0004;
export const GROUP_VEHICLE = 0x0008;
export const GROUP_PROP = 0x0010;
export const GROUP_ALL = 0xffff;
export const groups = (member: number, filter: number) => ((member & 0xffff) << 16) | (filter & 0xffff);

export interface RayHit {
  body: VoxelBody;
  /** voxel coords in body grid */
  vx: number; vy: number; vz: number;
  /** world-space hit point and normal */
  point: V3;
  normal: V3;
  dist: number;
  palette: number;
}

export interface CarveOptions {
  /** extra shell (metres) beyond the carve radius that gets scorched */
  scorch?: number;
  /** bodies to ignore */
  ignore?: VoxelBody | null;
  /** only carve bodies passing this test */
  filter?: (b: VoxelBody) => boolean;
  /** roughness of the hole edge 0..1 (default 0.25) */
  rough?: number;
  /** tool / cause label carried on the event */
  cause?: string;
  /** do not emit particles/sound event */
  silent?: boolean;
  /**
   * Fracture: instead of deleting everything, only the inner `1 - fracture` part of each radius is
   * deleted outright; a shell from r*(1-fracture) to r*(1+fracture) is cut along a staggered crack
   * pattern so that it comes loose as chunks. 0 = plain hole (default).
   */
  fracture?: number;
  /** crack cell size in voxels (default from radius) */
  cell?: number;
  /**
   * Break part of the removed material off as small loose voxel chunks (rigid bodies) instead of
   * deleting it: max number of chunks for this carve (0 = none).
   */
  debris?: number;
  /** chunks fly roughly this way (unit vector, e.g. the hammer's swing direction) */
  pushDir?: V3;
  /** chunk launch speed in m/s (default 3) */
  debrisSpeed?: number;
}

export interface CarveResult {
  removed: number;
  /** removed voxel count per material id */
  byMat: Uint32Array;
  bodies: VoxelBody[];
}

export type SimEvent =
  | { type: 'carve'; pos: V3; removed: number; byMat: Uint32Array; samples: { p: V3; pal: number }[]; cause: string }
  | { type: 'split'; parent: VoxelBody; child: VoxelBody }
  | { type: 'crumb'; pos: V3; pal: number; count: number }
  | { type: 'explosion'; pos: V3; size: number }
  | { type: 'impact'; pos: V3; force: number; a: VoxelBody | null; b: VoxelBody | null }
  | { type: 'bodyRemoved'; body: VoxelBody }
  | { type: 'custom'; name: string; data: any };

export interface SimSystem {
  /** called once per fixed step, before physics */
  update(sim: Sim): void;
}

export interface BodyOptions {
  dynamic?: boolean;
  kind?: BodyKind;
  rot?: Quat;
  linvel?: V3;
  angvel?: V3;
  anchorBottom?: boolean;
  name?: string;
  tags?: string[];
  /** force a body id (snapshot restore) */
  id?: number;
  /** see VoxelBody.massScale */
  massScale?: number;
}

export class Sim {
  readonly world: RAPIER.World;
  readonly events = new RAPIER.EventQueue(true);
  readonly bodies = new Map<number, VoxelBody>();
  /** collider handle -> body */
  readonly byCollider = new Map<number, VoxelBody>();
  readonly rng: Rng;
  readonly systems: SimSystem[] = [];
  /** drained by presentation layer every frame */
  out: SimEvent[] = [];
  tick = 0;
  time = 0;
  private nextId = 1;
  private editQueue = new Set<VoxelBody>();
  private pendingExplosions: { pos: V3; size: number; at: number }[] = [];

  /** max new debris bodies per tick (extra small islands turn into particles) */
  maxSplitsPerTick = 40;
  private splitBudget = 40;
  /** budgets */
  maxDebris = 260;
  /** islands smaller than this become particles */
  minBodyVoxels = 4;
  /** voxel removal listeners (fire, missions, ...) */
  onRemoved: ((body: VoxelBody, x: number, y: number, z: number, pal: number) => void)[] = [];
  onBodyAdded: ((body: VoxelBody) => void)[] = [];
  /** called just before a body's rigid body is destroyed (drop references to it) */
  onBodyRemoved: ((body: VoxelBody) => void)[] = [];
  /** impact events of the most recent physics step (systems read these on the next tick; `out` may already be drained) */
  lastImpacts: { pos: V3; force: number; a: VoxelBody | null; b: VoxelBody | null }[] = [];
  /** an island was split off: voxel (x,y,z) of `child` was voxel (x+off[0], y+off[1], z+off[2]) of `parent` */
  onSplit: ((parent: VoxelBody, child: VoxelBody, off: [number, number, number]) => void)[] = [];
  /** explosion listeners (fire ignition, player damage, AI hearing ...) */
  onExplosion: ((pos: V3, size: number) => void)[] = [];
  /** named subsystems created before the level is built (e.g. `drones`), so level generators can use them */
  readonly ext: Record<string, any> = {};
  /** water surface height (set by the level through WaterSystem) or null */
  waterLevel: number | null = null;
  /** the player character, if any (set by Player) */
  player: { eye: V3; pos: V3; damage(amount: number, cause?: string): void; vel: V3 } | null = null;
  /** structural crush check on static bodies (see crushCheck) */
  structural = true;
  /** load / capacity ratio above which a layer fails */
  crushFactor = 1.0;
  /** collisions damage voxels (falling debris breaks, heavy things crush) */
  impactDamage = true;
  /** minimum velocity change (m/s) in one step for a collision to do damage */
  impactMinDv = 2.2;
  /** contact force threshold reporting */
  impactThreshold = 4000;

  constructor(seed = 1234) {
    this.world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
    this.world.timestep = DT;
    this.world.numSolverIterations = 4;
    this.rng = new Rng(seed);
  }

  peekNextId(): number { return this.nextId; }
  setNextId(n: number): void { this.nextId = Math.max(this.nextId, n); }

  // ------------------------------------------------------------------ bodies

  addBody(grid: VoxelGrid, pos: V3, opts: BodyOptions = {}): VoxelBody {
    const dynamic = !!opts.dynamic;
    const rot = opts.rot ?? QID;
    const desc = dynamic ? RAPIER.RigidBodyDesc.dynamic() : RAPIER.RigidBodyDesc.fixed();
    desc.setTranslation(pos.x, pos.y, pos.z).setRotation(rot);
    if (dynamic) {
      desc.setLinearDamping(0.03).setAngularDamping(0.25);
      if (opts.linvel) desc.setLinvel(opts.linvel.x, opts.linvel.y, opts.linvel.z);
      if (opts.angvel) desc.setAngvel(opts.angvel);
    }
    const rb = this.world.createRigidBody(desc);
    const kind: BodyKind = opts.kind ?? (dynamic ? 'prop' : 'world');
    const col = this.world.createCollider(this.colliderDesc(grid, kind, dynamic), rb);
    const id = opts.id ?? this.nextId++;
    if (id >= this.nextId) this.nextId = id + 1;
    const body = new VoxelBody(id, grid, rb, col, dynamic, kind);
    body.identityRot = !dynamic && rot.x === 0 && rot.y === 0 && rot.z === 0;
    body.anchorBottom = opts.anchorBottom ?? true;
    body.createdTick = this.tick;
    if (opts.name) body.name = opts.name;
    if (opts.tags) for (const t of opts.tags) body.tags.add(t);
    if (opts.massScale) body.massScale = opts.massScale;
    if (dynamic) this.applyMass(body);
    this.bodies.set(body.id, body);
    this.byCollider.set(col.handle, body);
    for (const f of this.onBodyAdded) f(body);
    return body;
  }

  private colliderDesc(grid: VoxelGrid, kind: BodyKind, dynamic: boolean): RAPIER.ColliderDesc {
    const coords = grid.count > 0 ? grid.solidCoords() : new Int32Array([0, 0, 0]);
    const d = RAPIER.ColliderDesc.voxels(coords, { x: VOXEL, y: VOXEL, z: VOXEL })
      .setDensity(0)
      .setFriction(0.75)
      .setRestitution(0.02);
    const member = kind === 'world' ? GROUP_WORLD : kind === 'debris' ? GROUP_DEBRIS : kind === 'vehicle' ? GROUP_VEHICLE : GROUP_PROP;
    d.setCollisionGroups(groups(member, GROUP_ALL));
    if (dynamic) {
      d.setActiveEvents(RAPIER.ActiveEvents.CONTACT_FORCE_EVENTS);
      d.setContactForceEventThreshold(this.impactThreshold);
    }
    return d;
  }

  private applyMass(body: VoxelBody): void {
    const mp = computeMassProps(body.grid);
    const k = body.massScale;
    body.mass = mp.mass * k;
    body.massDirty = false;
    if (mp.mass <= 0) return;
    body.rb.setAdditionalMassProperties(mp.mass * k, mp.com, { x: mp.inertia.x * k, y: mp.inertia.y * k, z: mp.inertia.z * k }, mp.frame, true);
  }

  removeBody(body: VoxelBody): void {
    if (body.removed) return;
    for (const f of this.onBodyRemoved) f(body);
    body.removed = true;
    this.byCollider.delete(body.col.handle);
    this.world.removeRigidBody(body.rb);
    this.bodies.delete(body.id);
    this.editQueue.delete(body);
    this.out.push({ type: 'bodyRemoved', body });
  }

  /** replace the collider of a body from its grid (after bulk edits) */
  rebuildCollider(body: VoxelBody): void {
    this.byCollider.delete(body.col.handle);
    this.world.removeCollider(body.col, false);
    body.col = this.world.createCollider(this.colliderDesc(body.grid, body.kind, body.dynamic), body.rb);
    this.byCollider.set(body.col.handle, body);
    if (body.dynamic) this.applyMass(body);
  }

  // ------------------------------------------------------------------ voxel edits

  /** remove one voxel (records connectivity seeds). Returns removed palette or 0. */
  removeVoxel(body: VoxelBody, x: number, y: number, z: number, notify = true): number {
    const g = body.grid;
    if (!g.inside(x, y, z)) return 0;
    const i = g.idx(x, y, z);
    const p = g.data[i];
    if (!p) return 0;
    g.data[i] = 0;
    g.count--;
    body.col.setVoxel(x, y, z, false);
    body.markDirtyVoxel(x, y, z);
    const { sx, sy, sz } = g;
    const sxy = sx * sy;
    const d = g.data, s = body.pendingSeeds;
    if (x > 0 && d[i - 1]) s.push(i - 1);
    if (x < sx - 1 && d[i + 1]) s.push(i + 1);
    if (y > 0 && d[i - sx]) s.push(i - sx);
    if (y < sy - 1 && d[i + sx]) s.push(i + sx);
    if (z > 0 && d[i - sxy]) s.push(i - sxy);
    if (z < sz - 1 && d[i + sxy]) s.push(i + sxy);
    this.editQueue.add(body);
    if (body.dynamic) body.massDirty = true;
    else {
      if (body.editY0 < 0 || y < body.editY0) body.editY0 = y;
      if (y > body.editY1) body.editY1 = y;
      if (body.layerCap) { body.layerCap[y] -= PAL_STRENGTH[p]; body.layerMass![y] -= PAL_DENSITY[p] * 0.001; }
    }
    if (PAL_EXPLOSIVE[p] > 0) this.queueChain(body, x, y, z, PAL_EXPLOSIVE[p]);
    if (notify) for (const f of this.onRemoved) f(body, x, y, z, p);
    return p;
  }

  /** explosive voxels broken this tick are merged into one delayed explosion per body */
  private chain = new Map<number, { body: VoxelBody; x: number; y: number; z: number; n: number; size: number }>();
  private queueChain(body: VoxelBody, x: number, y: number, z: number, size: number): void {
    const w = body.toWorld({ x: x + 0.5, y: y + 0.5, z: z + 0.5 });
    const c = this.chain.get(body.id);
    if (c) { c.x += w.x; c.y += w.y; c.z += w.z; c.n++; }
    else this.chain.set(body.id, { body, x: w.x, y: w.y, z: w.z, n: 1, size });
  }
  private flushChain(): void {
    if (this.chain.size === 0) return;
    for (const c of this.chain.values()) {
      const pos = { x: c.x / c.n, y: c.y / c.n, z: c.z / c.n };
      const container = !c.body.removed && c.body.tags.has('explosive');
      // loose crumbs of explosive material just fizzle; containers and big lumps blow up
      if (!container && c.n < 12) continue;
      if (container) {
        for (const b of [...this.bodies.values()]) if (b.user.fromBody === c.body.id) this.removeBody(b);
        this.removeBody(c.body);
      }
      this.explodeLater(pos, c.size * (container ? 1 : Math.min(1, 0.5 + c.n / 80)), 4 + this.rng.int(5));
    }
    this.chain.clear();
  }

  /** set a voxel to a palette value (adding or recolouring). Does not run connectivity. */
  setVoxel(body: VoxelBody, x: number, y: number, z: number, p: number): void {
    const g = body.grid;
    if (!g.inside(x, y, z)) return;
    if (p === 0) { this.removeVoxel(body, x, y, z); return; }
    const i = g.idx(x, y, z);
    const old = g.data[i];
    if (old === p) return;
    g.data[i] = p;
    if (body.layerCap) {
      body.layerCap[y] += PAL_STRENGTH[p] - (old ? PAL_STRENGTH[old] : 0);
      body.layerMass![y] += (PAL_DENSITY[p] - (old ? PAL_DENSITY[old] : 0)) * 0.001;
    }
    if (!old) {
      g.count++;
      body.col.setVoxel(x, y, z, true);
      if (body.dynamic) body.massDirty = true;
      this.editQueue.add(body);
    }
    body.markDirtyVoxel(x, y, z);
  }

  /** bodies whose bounding sphere intersects the given sphere */
  bodiesNear(c: V3, r: number, out: VoxelBody[] = []): VoxelBody[] {
    for (const b of this.bodies.values()) {
      const bc = b.center();
      const dx = bc.x - c.x, dy = bc.y - c.y, dz = bc.z - c.z;
      const rr = r + b.radius;
      if (dx * dx + dy * dy + dz * dz <= rr * rr) out.push(b);
    }
    return out;
  }

  /**
   * Spherical carve with one radius per hardness class (soft >= medium >= hard, metres).
   * Unbreakable voxels are never removed.
   */
  carve(center: V3, rSoft: number, rMed: number, rHard: number, opts: CarveOptions = {}): CarveResult {
    const rad = [rSoft, rMed, rHard, 0];
    const rMax = Math.max(rSoft, rMed, rHard);
    const sc = opts.scorch ?? 0;
    const rough = opts.rough ?? 0.25;
    const byMat = new Uint32Array(MATERIALS.length);
    const res: CarveResult = { removed: 0, byMat, bodies: [] };
    const samples: { p: V3; pal: number }[] = [];
    const cand = this.bodiesNear(center, rMax + sc);
    const seedBase = this.tick * 7919;
    let debrisLeft = opts.debris ?? 0;
    for (const body of cand) {
      if (body === opts.ignore || body.indestructible || (opts.filter && !opts.filter(body))) continue;
      const g = body.grid;
      const lc = body.toLocal(center);
      const rv = (rMax + sc) / VOXEL + 1;
      const x0 = Math.max(0, Math.floor(lc.x - rv)), x1 = Math.min(g.sx - 1, Math.ceil(lc.x + rv));
      const y0 = Math.max(0, Math.floor(lc.y - rv)), y1 = Math.min(g.sy - 1, Math.ceil(lc.y + rv));
      const z0 = Math.max(0, Math.floor(lc.z - rv)), z1 = Math.min(g.sz - 1, Math.ceil(lc.z + rv));
      if (x0 > x1 || y0 > y1 || z0 > z1) continue;
      let removedHere = 0;
      const r2 = [0, 0, 0, 0];
      for (let h = 0; h < 3; h++) r2[h] = (rad[h] / VOXEL) ** 2;
      const scV = sc / VOXEL;
      const fr = body.noFracture ? 0 : opts.fracture ?? 0;
      const inner2 = (1 - fr) * (1 - fr), outer2 = (1 + fr) * (1 + fr);
      const cell = opts.cell ?? Math.max(3, Math.min(7, Math.round((rMax / VOXEL) * 0.35)));
      const cseed = body.id * 31 + this.tick;
      const chunkCells: Map<number, number[]> | null = (opts.debris ?? 0) > 0 && body.kind !== 'vehicle' ? new Map() : null;
      const chunkCell = 2 + ((this.tick + body.id) % 2);
      for (let z = z0; z <= z1; z++) {
        const dz = z + 0.5 - lc.z;
        for (let y = y0; y <= y1; y++) {
          const dy = y + 0.5 - lc.y;
          let i = g.idx(x0, y, z);
          for (let x = x0; x <= x1; x++, i++) {
            const p = g.data[i];
            if (!p) continue;
            const dx = x + 0.5 - lc.x;
            let d2 = dx * dx + dy * dy + dz * dz;
            const h = PAL_HARDNESS[p];
            const rr = r2[h];
            // ragged edge: coarse lumps (2-voxel blocks) plus per-voxel grain
            if (rough > 0 && rr > 0) d2 *= 1 + rough * (0.65 * hash3(x >> 1, y >> 1, z >> 1, seedBase) + 0.35 * hash3(x, y, z, seedBase) - 0.5) * 1.6;
            if (d2 < rr * inner2 || (fr > 0 && d2 < rr * outer2 && isCrack(x, y, z, cell, cseed))) {
              if (chunkCells && d2 > rr * 0.2 && PAL_HARDNESS[p] < 3) {
                const ck = cellId(x, y, z, chunkCell, cseed + 7);
                if (hash3(ck & 1023, (ck >> 10) & 1023, ck >> 20, cseed) < 0.55) {
                  let list = chunkCells.get(ck);
                  if (!list) chunkCells.set(ck, (list = []));
                  list.push(x, y, z, p);
                }
              }
              this.removeVoxel(body, x, y, z);
              byMat[p >> 3]++;
              removedHere++;
              if (samples.length < 40 && ((res.removed + removedHere) % 3 === 0 || removedHere < 6)) {
                samples.push({ p: body.toWorld({ x: x + 0.5, y: y + 0.5, z: z + 0.5 }), pal: p });
              }
            } else if (sc > 0 && h < 3) {
              const rs = Math.sqrt(rr) + scV;
              if (d2 < rs * rs && (p & 7) < 6 && hash3(x, y, z, 17) > (Math.sqrt(d2) - Math.sqrt(rr)) / scV * 0.8) {
                g.data[i] = scorchPal(p, x + y + z);
                body.markDirtyVoxel(x, y, z);
              }
            }
          }
        }
      }
      if (removedHere) { res.removed += removedHere; res.bodies.push(body); }
      if (chunkCells && chunkCells.size) debrisLeft = this.spawnChunks(body, chunkCells, center, opts, debrisLeft);
    }
    if (res.removed) this.wakeNear(center, rMax + 1.5);
    if (res.removed && !opts.silent) {
      this.out.push({ type: 'carve', pos: center, removed: res.removed, byMat, samples, cause: opts.cause ?? '' });
    }
    return res;
  }

  /** turn groups of just-removed voxels into small loose chunk bodies flying away from the hit */
  private spawnChunks(body: VoxelBody, cells: Map<number, number[]>, center: V3, opts: CarveOptions, left: number): number {
    const speed = opts.debrisSpeed ?? 3;
    const push = opts.pushDir;
    const rot = body.rb.rotation();
    const base = body.dynamic ? body.rb.linvel() : { x: 0, y: 0, z: 0 };
    for (const list of cells.values()) {
      if (left <= 0 || this.splitBudget <= 0) break;
      const n = list.length / 4;
      if (n < 3) continue;
      let x0 = 1e9, y0 = 1e9, z0 = 1e9, x1 = -1, y1 = -1, z1 = -1;
      for (let i = 0; i < list.length; i += 4) {
        const x = list[i], y = list[i + 1], z = list[i + 2];
        if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; if (z < z0) z0 = z; if (z > z1) z1 = z;
      }
      const g = new VoxelGrid(x1 - x0 + 1, y1 - y0 + 1, z1 - z0 + 1);
      for (let i = 0; i < list.length; i += 4) g.data[g.idx(list[i] - x0, list[i + 1] - y0, list[i + 2] - z0)] = list[i + 3];
      g.count = n;
      const wpos = body.toWorld({ x: x0, y: y0, z: z0 });
      const c = body.toWorld({ x: (x0 + x1 + 1) / 2, y: (y0 + y1 + 1) / 2, z: (z0 + z1 + 1) / 2 });
      let dx = c.x - center.x, dy = c.y - center.y, dz = c.z - center.z;
      const dl = Math.hypot(dx, dy, dz) || 1;
      dx /= dl; dy /= dl; dz /= dl;
      if (push) { dx = dx * 0.45 + push.x; dy = dy * 0.45 + push.y; dz = dz * 0.45 + push.z; }
      const sp = speed * (0.5 + this.rng.next());
      const r = this.rng;
      const nb = this.addBody(g, wpos, {
        dynamic: true, kind: 'debris', rot,
        linvel: { x: base.x + dx * sp + (r.next() - 0.5), y: base.y + dy * sp + 0.8 + r.next(), z: base.z + dz * sp + (r.next() - 0.5) },
        angvel: { x: (r.next() - 0.5) * 9, y: (r.next() - 0.5) * 9, z: (r.next() - 0.5) * 9 },
      });
      nb.user.chip = true;
      nb.user.fromBody = body.id;
      this.splitBudget--;
      left--;
    }
    return left;
  }

  /** remove voxels inside an oriented box given in body-local voxel coords (blowtorch lines, cutters...) */
  wakeNear(c: V3, r: number): void {
    for (const b of this.bodies.values()) {
      if (!b.dynamic || !b.rb.isSleeping()) continue;
      const bc = b.center();
      const rr = r + b.radius;
      const dx = bc.x - c.x, dy = bc.y - c.y, dz = bc.z - c.z;
      if (dx * dx + dy * dy + dz * dz <= rr * rr) b.rb.wakeUp();
    }
  }

  /** Run pending connectivity searches and split islands off. Called automatically each step. */
  processEdits(): void {
    for (let pass = 0; pass < 3 && this.editQueue.size > 0; pass++) this.processEditsOnce();
  }

  private processEditsOnce(): void {
    const queue = [...this.editQueue];
    this.editQueue.clear();
    for (const body of queue) {
      if (body.removed) continue;
      if (body.grid.count === 0) { this.removeBody(body); continue; }
      const seeds = body.pendingSeeds;
      body.pendingSeeds = [];
      if (seeds.length && !body.noSplit && (body.dynamic || body.anchorBottom)) {
        const islands = findIslands(body.grid, seeds, body.dynamic ? -1 : 0, body.dynamic ? body.keepIndex : -1);
        if (islands.length) this.splitIslands(body, islands);
      }
      if (!body.removed && !body.dynamic && body.anchorBottom && body.editY0 >= 0 && this.structural) this.crushCheck(body);
      body.editY0 = body.editY1 = -1;
      if (body.removed) continue;
      if (body.grid.count === 0) { this.removeBody(body); continue; }
      if (body.dynamic && body.massDirty) { this.applyMass(body); body.rb.wakeUp(); }
    }
  }

  /**
   * Structural crush check (our improvement over pure connectivity): for the y layers touched by
   * an edit, compare the weight resting above the layer with what the layer's remaining voxels
   * can carry. An overloaded layer is pulverised (a band around it), so a building can no longer
   * stand on a couple of voxels — it drops, and impact damage breaks it up.
   */
  private crushCheck(body: VoxelBody): void {
    const g = body.grid;
    const { sx, sy, sz } = g;
    if (!body.layerCap) {
      const cap = (body.layerCap = new Float64Array(sy));
      const mass = (body.layerMass = new Float64Array(sy));
      const d = g.data;
      let i = 0;
      for (let z = 0; z < sz; z++)
        for (let y = 0; y < sy; y++)
          for (let x = 0; x < sx; x++, i++) {
            const p = d[i];
            if (p) { cap[y] += PAL_STRENGTH[p]; mass[y] += PAL_DENSITY[p] * 0.001; }
          }
    }
    const cap = body.layerCap!, mass = body.layerMass!;
    const y0 = Math.max(1, body.editY0 - 1), y1 = Math.min(sy - 2, body.editY1 + 1);
    if (y0 > y1) return;
    let above = 0;
    for (let y = sy - 1; y > y1; y--) above += mass[y];
    let worst = -1, worstRatio = this.crushFactor;
    for (let y = y1; y >= y0; y--) {
      if (cap[y] > 0 && above > 50) {
        const ratio = (above * 9.81) / cap[y];
        if (ratio > worstRatio) { worstRatio = ratio; worst = y; }
      }
      above += mass[y];
    }
    if (worst < 0) return;
    // pulverise a band around the failed layer
    const b0 = Math.max(1, worst - 2), b1 = Math.min(sy - 1, worst + 3);
    let n = 0, cx = 0, cz = 0;
    const byMat = new Uint32Array(MATERIALS.length);
    const samples: { p: V3; pal: number }[] = [];
    for (let z = 0; z < sz; z++)
      for (let y = b0; y <= b1; y++) {
        let i = g.idx(0, y, z);
        for (let x = 0; x < sx; x++, i++) {
          const p = g.data[i];
          if (!p || PAL_HARDNESS[p] === 3) continue;
          this.removeVoxel(body, x, y, z);
          byMat[p >> 3]++; n++; cx += x; cz += z;
          if (samples.length < 40 && n % 5 === 0) samples.push({ p: body.toWorld({ x: x + 0.5, y: y + 0.5, z: z + 0.5 }), pal: p });
        }
      }
    if (n) {
      const pos = body.toWorld({ x: cx / n, y: worst, z: cz / n });
      this.out.push({ type: 'carve', pos, removed: n, byMat, samples, cause: 'crush' });
      // the removals queued this body again; islands split on the next processEdits pass
    }
  }

  private splitIslands(parent: VoxelBody, islands: Island[]): void {
    const g = parent.grid;
    const { sx, sy } = g;
    const sxy = sx * sy;
    let total = 0;
    for (const isl of islands) total += isl.indices.length;
    // biggest first so the split budget goes to the pieces that matter
    islands.sort((a, b) => b.indices.length - a.indices.length);
    const bulk = total > 15000;
    const lin = parent.dynamic ? parent.rb.linvel() : { x: 0, y: 0, z: 0 };
    const ang = parent.dynamic ? parent.rb.angvel() : { x: 0, y: 0, z: 0 };
    const pcom = parent.dynamic ? parent.rb.worldCom() : { x: 0, y: 0, z: 0 };
    for (const isl of islands) {
      const [x0, y0, z0] = isl.min;
      const nx = isl.max[0] - x0 + 1, ny = isl.max[1] - y0 + 1, nz = isl.max[2] - z0 + 1;
      const n = isl.indices.length;
      const small = n < this.minBodyVoxels || (parent.kind !== 'vehicle' && this.splitBudget <= 0 && n < 400);
      if (!small) this.splitBudget--;
      const child = small ? null : new VoxelGrid(nx, ny, nz);
      let firstPal = 0;
      for (let k = 0; k < n; k++) {
        const i = isl.indices[k];
        const x = i % sx, y = ((i / sx) | 0) % sy, z = (i / sxy) | 0;
        const p = g.data[i];
        if (!firstPal) firstPal = p;
        if (child) child.data[x - x0 + nx * (y - y0 + ny * (z - z0))] = p;
        g.data[i] = 0;
        if (!bulk) parent.col.setVoxel(x, y, z, false);
        parent.markDirtyVoxel(x, y, z);
      }
      g.count -= n;
      const wpos = parent.toWorld({ x: x0, y: y0, z: z0 });
      if (!child) {
        this.out.push({ type: 'crumb', pos: parent.toWorld({ x: x0 + nx / 2, y: y0 + ny / 2, z: z0 + nz / 2 }), pal: firstPal, count: n });
        continue;
      }
      child.count = n;
      // velocity of the parent at the child's centre
      const cc = parent.toWorld({ x: x0 + nx / 2, y: y0 + ny / 2, z: z0 + nz / 2 });
      const v = vadd(lin, vcross(ang, vsub(cc, pcom)));
      const nb = this.addBody(child, wpos, {
        dynamic: true,
        kind: 'debris',
        rot: parent.rb.rotation(),
        linvel: v,
        angvel: ang,
      });
      nb.user.fromBody = parent.id;
      for (const t of parent.tags) if (t.startsWith('inherit:')) nb.tags.add(t);
      for (const f of this.onSplit) f(parent, nb, [x0, y0, z0]);
      this.out.push({ type: 'split', parent, child: nb });
    }
    parent.layerCap = parent.layerMass = null;
    if (g.count === 0) { this.removeBody(parent); return; }
    if (bulk) this.rebuildCollider(parent);
    if (parent.dynamic) parent.massDirty = true;
    this.wakeNear(parent.center(), parent.radius * 0.5);
  }

  // ------------------------------------------------------------------ queries

  /** DDA voxel raycast against all voxel bodies. dir must be normalised. */
  raycast(origin: V3, dir: V3, maxDist: number, ignore?: VoxelBody | null, filter?: (b: VoxelBody) => boolean): RayHit | null {
    let best: RayHit | null = null;
    let bestD = maxDist;
    for (const body of this.bodies.values()) {
      if (body === ignore || (filter && !filter(body))) continue;
      // bounding sphere reject
      const c = body.center();
      const ox = c.x - origin.x, oy = c.y - origin.y, oz = c.z - origin.z;
      const t = ox * dir.x + oy * dir.y + oz * dir.z;
      const d2 = ox * ox + oy * oy + oz * oz - t * t;
      const r = body.radius;
      if (d2 > r * r || t < -r || t - r > bestD) continue;
      const h = rayGrid(body, origin, dir, bestD);
      if (h && h.dist < bestD) { best = h; bestD = h.dist; }
    }
    return best;
  }

  /** is there solid voxel matter at a world position? returns palette index */
  sample(p: V3): { body: VoxelBody; x: number; y: number; z: number; pal: number } | null {
    for (const b of this.bodies.values()) {
      const c = b.center();
      const dx = c.x - p.x, dy = c.y - p.y, dz = c.z - p.z;
      if (dx * dx + dy * dy + dz * dz > b.radius * b.radius) continue;
      const l = b.toLocal(p);
      const x = Math.floor(l.x), y = Math.floor(l.y), z = Math.floor(l.z);
      const pal = b.grid.get(x, y, z);
      if (pal) return { body: b, x, y, z, pal };
    }
    return null;
  }

  // ------------------------------------------------------------------ explosions

  /**
   * Explosion: carve (three radii), scorch, radial impulses on dynamic bodies.
   * `size` ~ carve radius of soft material in metres (0.5 small .. 4 huge).
   */
  explode(pos: V3, size: number): void {
    this.carve(pos, size, size * 0.72, size * 0.42, { scorch: Math.min(0.6, size * 0.3), cause: 'explosion', rough: 0.35, fracture: 0.3 });
    // islands must exist as bodies before we push them
    this.processEdits();
    const R = size * 3.2;
    for (const b of this.bodies.values()) {
      if (!b.dynamic) continue;
      const com = b.rb.worldCom();
      const d = vsub(com, pos);
      const dist = vlen(d);
      if (dist > R + b.radius) continue;
      const fall = Math.max(0, 1 - dist / (R + b.radius * 0.5));
      if (fall <= 0) continue;
      const dirn = dist > 1e-3 ? vscale(d, 1 / dist) : { x: 0, y: 1, z: 0 };
      // impulse: capped delta-v so small debris flies and heavy things get shoved
      const m = b.mass;
      const dv = Math.min(22, (size * 900 * fall) / Math.max(m, 8)) * (0.5 + 0.5 * fall) + 3 * fall;
      const up = 0.35;
      b.rb.wakeUp();
      b.rb.applyImpulse({ x: dirn.x * dv * m, y: (dirn.y + up) * dv * m, z: dirn.z * dv * m }, true);
      const spin = dv * 0.25;
      const I = m * b.radius * b.radius * 0.15;
      b.rb.applyTorqueImpulse({ x: (this.rng.next() - 0.5) * spin * I, y: (this.rng.next() - 0.5) * spin * I, z: (this.rng.next() - 0.5) * spin * I }, true);
    }
    // player: damage + knockback (line of sight halves nothing yet; distance based)
    const pl = this.player;
    if (pl) {
      const d = vsub(pl.eye, pos);
      const dist = vlen(d);
      const R2 = size * 3.0;
      if (dist < R2) {
        const f = 1 - dist / R2;
        const blocked = this.raycast(pos, vscale(d, 1 / Math.max(dist, 1e-3)), Math.max(0, dist - 0.4));
        const k = blocked ? 0.35 : 1;
        pl.damage(f * f * 1.1 * k * Math.min(1.5, size), 'explosion');
        const push = f * 9 * k;
        pl.vel.x += (d.x / Math.max(dist, 0.3)) * push; pl.vel.y += 2.5 * f * k + (d.y / Math.max(dist, 0.3)) * push * 0.5; pl.vel.z += (d.z / Math.max(dist, 0.3)) * push;
      }
    }
    for (const f of this.onExplosion) f(pos, size);
    this.out.push({ type: 'explosion', pos, size });
  }

  /** schedule an explosion `delay` ticks from now */
  explodeLater(pos: V3, size: number, delay: number): void {
    this.pendingExplosions.push({ pos, size, at: this.tick + delay });
  }

  // ------------------------------------------------------------------ stepping

  step(): void {
    this.splitBudget = this.maxSplitsPerTick;
    if (this.pendingExplosions.length) {
      const due = this.pendingExplosions.filter((e) => e.at <= this.tick);
      if (due.length) {
        this.pendingExplosions = this.pendingExplosions.filter((e) => e.at > this.tick);
        for (const e of due) this.explode(e.pos, e.size);
      }
    }
    for (const s of this.systems) s.update(this);
    this.flushChain();
    this.processEdits();
    this.world.step(this.events);
    this.lastImpacts.length = 0;
    let impacts: { pos: V3; J: number; dv: number }[] | null = null;
    this.events.drainContactForceEvents((ev) => {
      const a = this.byCollider.get(ev.collider1()) ?? null;
      const b = this.byCollider.get(ev.collider2()) ?? null;
      const f = ev.maxForceMagnitude();
      const src = a?.dynamic ? a : b;
      if (!src) return;
      let pos: V3 = src.rb.worldCom();
      if (a && b && this.impactDamage && a.kind !== 'vehicle' && b.kind !== 'vehicle') {
        const ma = a.dynamic ? a.mass : Infinity, mb = b.dynamic ? b.mass : Infinity;
        const J = f * DT;
        const dv = J / Math.max(Math.min(ma, mb), 1);
        if (dv > this.impactMinDv) {
          // contact point estimate: from the lighter body's centre of mass along the force direction onto the other body
          const light = ma <= mb ? a : b, other = light === a ? b : a;
          const d = ev.maxForceDirection();
          const o = light.rb.worldCom();
          const only = (x: VoxelBody) => x === other;
          const h1 = this.raycast(o, d, light.radius * 2 + 0.5, null, only);
          const h2 = this.raycast(o, { x: -d.x, y: -d.y, z: -d.z }, light.radius * 2 + 0.5, null, only);
          const h = h1 && h2 ? (h1.dist < h2.dist ? h1 : h2) : h1 ?? h2;
          if (h) { pos = h.point; (impacts ??= []).push({ pos, J, dv }); }
        }
      }
      this.out.push({ type: 'impact', pos, force: f, a, b });
      this.lastImpacts.push({ pos, force: f, a, b });
    });
    if (impacts) this.applyImpacts(impacts);
    this.events.drainCollisionEvents(() => {});
    this.tick++;
    this.time = this.tick * DT;
    if (this.tick % 30 === 0) this.housekeeping();
  }

  /** hard landings / collisions chip and crack what they hit */
  private applyImpacts(impacts: { pos: V3; J: number; dv: number }[]): void {
    impacts.sort((p, q) => q.J * q.dv - p.J * p.dv);
    const n = Math.min(impacts.length, 5);
    for (let i = 0; i < n; i++) {
      const im = impacts[i];
      const E = 0.5 * im.J * im.dv; // joules-ish
      const rSoft = Math.min(0.7, Math.max(0.08, 0.1 * Math.cbrt(E / 500)));
      const rMed = E > 3000 ? rSoft * 0.55 : 0;
      const rHard = E > 60000 ? rSoft * 0.25 : 0;
      this.carve(im.pos, rSoft, rMed, rHard, { cause: 'impact', fracture: 0.3, filter: notImpactProof });
    }
  }

  private housekeeping(): void {
    let debris: VoxelBody[] | null = null;
    for (const b of this.bodies.values()) {
      if (!b.dynamic) continue;
      if (b.rb.translation().y < -60) { this.removeBody(b); continue; }
      // small hit chunks settle, then crumble away after a while
      if (b.user.chip) {
        const age = this.tick - b.createdTick;
        if ((age > 900 && b.rb.isSleeping()) || age > 2400) {
          this.out.push({ type: 'crumb', pos: b.rb.worldCom(), pal: firstPal(b.grid), count: Math.min(b.grid.count, 6) });
          this.removeBody(b);
          continue;
        }
      }
      if (b.kind === 'debris') (debris ??= []).push(b);
    }
    if (debris && debris.length > this.maxDebris) {
      // drop the smallest / oldest pieces first
      debris.sort((p, q) => p.grid.count - q.grid.count || p.createdTick - q.createdTick);
      const extra = debris.length - this.maxDebris;
      for (let i = 0; i < extra; i++) {
        const b = debris[i];
        this.out.push({ type: 'crumb', pos: b.rb.worldCom(), pal: firstPal(b.grid), count: Math.min(b.grid.count, 12) });
        this.removeBody(b);
      }
    }
  }

  drainEvents(): SimEvent[] {
    const e = this.out;
    this.out = [];
    return e;
  }

  dynamicCount(): number {
    let n = 0;
    for (const b of this.bodies.values()) if (b.dynamic) n++;
    return n;
  }
}

function cellId(x: number, y: number, z: number, c: number, s: number): number {
  const jx = (hash3((y / c) | 0, (z / c) | 0, 0, s) * c) | 0;
  const cx = ((x + jx) / c) | 0;
  const jy = (hash3(cx, (z / c) | 0, 1, s) * c) | 0;
  const cy = ((y + jy) / c) | 0;
  const jz = (hash3(cx, cy, 2, s) * c) | 0;
  return cx + 1024 * cy + 1048576 * (((z + jz) / c) | 0);
}
/** staggered-block crack pattern: true on the 1-voxel seams between pseudo-random blocks */
export function isCrack(x: number, y: number, z: number, c: number, s: number): boolean {
  const id = cellId(x, y, z, c, s);
  return id !== cellId(x + 1, y, z, c, s) || id !== cellId(x, y + 1, z, c, s) || id !== cellId(x, y, z + 1, c, s);
}

const notImpactProof = (b: VoxelBody) => !b.impactProof;

function firstPal(g: VoxelGrid): number {
  for (let i = 0; i < g.data.length; i++) if (g.data[i]) return g.data[i];
  return 0;
}

/** Amanatides–Woo traversal of one body's grid. */
function rayGrid(body: VoxelBody, origin: V3, dir: V3, maxDist: number): RayHit | null {
  const g = body.grid;
  const o = body.toLocal(origin);
  const d = body.dirToLocal(dir);
  // clip against grid box (voxel units); t in voxel units
  let t0 = 0, t1 = maxDist / VOXEL;
  const size = [g.sx, g.sy, g.sz];
  const oo = [o.x, o.y, o.z], dd = [d.x, d.y, d.z];
  let enterAxis = -1;
  for (let a = 0; a < 3; a++) {
    if (Math.abs(dd[a]) < 1e-12) {
      if (oo[a] < 0 || oo[a] >= size[a]) return null;
    } else {
      let ta = (0 - oo[a]) / dd[a], tb = (size[a] - oo[a]) / dd[a];
      if (ta > tb) { const s = ta; ta = tb; tb = s; }
      if (ta > t0) { t0 = ta; enterAxis = a; }
      if (tb < t1) t1 = tb;
      if (t0 > t1) return null;
    }
  }
  const eps = 1e-5;
  let px = oo[0] + dd[0] * (t0 + eps), py = oo[1] + dd[1] * (t0 + eps), pz = oo[2] + dd[2] * (t0 + eps);
  let x = Math.min(g.sx - 1, Math.max(0, Math.floor(px)));
  let y = Math.min(g.sy - 1, Math.max(0, Math.floor(py)));
  let z = Math.min(g.sz - 1, Math.max(0, Math.floor(pz)));
  const stx = dd[0] > 0 ? 1 : -1, sty = dd[1] > 0 ? 1 : -1, stz = dd[2] > 0 ? 1 : -1;
  const idx = Math.abs(1 / (dd[0] || 1e-12)), idy = Math.abs(1 / (dd[1] || 1e-12)), idz = Math.abs(1 / (dd[2] || 1e-12));
  let tmx = t0 + (dd[0] > 0 ? x + 1 - px : px - x) * idx;
  let tmy = t0 + (dd[1] > 0 ? y + 1 - py : py - y) * idy;
  let tmz = t0 + (dd[2] > 0 ? z + 1 - pz : pz - z) * idz;
  let axis = enterAxis;
  let t = t0;
  const data = g.data, sx = g.sx, sy = g.sy;
  for (;;) {
    const p = data[x + sx * (y + sy * z)];
    if (p) {
      const n = { x: 0, y: 0, z: 0 };
      if (axis === 0) n.x = -stx; else if (axis === 1) n.y = -sty; else if (axis === 2) n.z = -stz;
      else { n.x = -dd[0]; n.y = -dd[1]; n.z = -dd[2]; }
      const dist = t * VOXEL;
      return {
        body, vx: x, vy: y, vz: z,
        point: { x: origin.x + dir.x * dist, y: origin.y + dir.y * dist, z: origin.z + dir.z * dist },
        normal: body.dirToWorld(n),
        dist, palette: p,
      };
    }
    if (tmx < tmy && tmx < tmz) { x += stx; t = tmx; tmx += idx; axis = 0; if (x < 0 || x >= g.sx) return null; }
    else if (tmy < tmz) { y += sty; t = tmy; tmy += idy; axis = 1; if (y < 0 || y >= g.sy) return null; }
    else { z += stz; t = tmz; tmz += idz; axis = 2; if (z < 0 || z >= g.sz) return null; }
    if (t > t1) return null;
  }
}

export { qrot, matOf };
