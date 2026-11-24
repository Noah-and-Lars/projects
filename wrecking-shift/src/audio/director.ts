/**
 * AudioDirector: maps sim events / game state to engine calls. Depends only on the small structural
 * interfaces below, so it is unit-tested in Node with a recording mock engine.
 */
import { matSoundName } from './bank';
import type { LoopOpts, PlayOpts, V3 } from './engine';
import {
  FootstepTracker, KeyedCooldown, audioGroupOfPal, bodyAudioGroup, classifyCarve, clamp, clamp01, engineParams,
  explosionClass, fireLoudness, forceSize, impactLoudness, indoorScore, sizeClass,
} from './logic';
import type { CueName } from './music';

export interface EngineLike {
  ready: boolean;
  play(name: string, o?: PlayOpts): boolean;
  touchLoop(key: string, name: string, o?: LoopOpts): boolean;
  stopLoop(key: string): void;
  stopAllLoops(): void;
  hasLoop(key: string): boolean;
  setIndoor(v: number): void;
  distanceTo(pos: V3): number;
  listener: { pos: V3 };
  music: { setCue(c: CueName | null): void; setTension(t: number): void; setDuck(v: number): void; currentCue: CueName | null } | null;
}

export interface GameLike {
  sim: { raycast(o: V3, d: V3, max: number): { palette: number; dist: number } | null };
  player: { pos: V3; eye: V3; stride: number; grounded: boolean; landed: number; vel: V3; seated?: boolean; dead?: boolean };
  fire: { count(): number; positions(max?: number): V3[] };
  ext: Record<string, any>;
  paused: boolean;
}

const rand = (a: number, b: number) => a + Math.random() * (b - a);
const HORIZ: V3[] = [0, 1, 2, 3, 4, 5].map((i) => ({ x: Math.cos((i * Math.PI) / 3), y: 0, z: Math.sin((i * Math.PI) / 3) }));

export class AudioDirector {
  readonly impactCooldown = new KeyedCooldown(0.15);
  readonly steps = new FootstepTracker(0.75);
  alarmOn = false;
  heistTime = 0;
  indoor = 0;
  private wasGrounded = true;
  private lastLanded = 0;
  private torchOn = false;
  private probeT = 0;
  private ambT = 6;
  private fireT = 0;
  private fireNearest: V3 | null = null;
  private tNow = 0;
  /** counters for tests */
  readonly counts: Record<string, number> = {};

  constructor(private engine: EngineLike, private clock: () => number = () => performance.now() / 1000) {}

  private count(k: string): void { this.counts[k] = (this.counts[k] ?? 0) + 1; }
  private play(name: string, o?: PlayOpts): boolean { this.count('play'); return this.engine.play(name, o); }

  reset(): void {
    this.alarmOn = false; this.heistTime = 0; this.torchOn = false; this.indoor = 0;
    this.engine.stopAllLoops();
    this.engine.music?.setCue(this.engine.ready ? 'calm' : null);
    this.engine.music?.setTension(0);
  }

  // ------------------------------------------------------------- events

  onEvents(events: readonly any[]): void {
    this.tNow = this.clock();
    let carves: any[] | null = null;
    for (const e of events) {
      switch (e.type) {
        case 'carve': (carves ??= []).push(e); break;
        case 'impact': this.impact(e); break;
        case 'split': this.split(e); break;
        case 'crumb': {
          const group = audioGroupOfPal(e.pal);
          this.play(matSoundName(group, 'break', sizeClass(e.count * 4) as number), { pos: e.pos, gain: 0.35, refDist: 5, category: 'crumb' });
          break;
        }
        case 'explosion': {
          const c = explosionClass(e.size);
          this.play(`explosion.${c}`, { pos: e.pos, refDist: 18 + c * 8, propagate: true, priority: 6, category: 'explosion' });
          break;
        }
        case 'custom': this.custom(e.name, e.data ?? {}); break;
      }
    }
    if (carves) {
      carves.sort((a, b) => b.removed - a.removed);
      for (let i = 0; i < Math.min(3, carves.length); i++) this.carve(carves[i]);
    }
  }

  private carve(e: any): void {
    if (e.removed < 2) return;
    const explosion = e.cause === 'explosion';
    for (const c of classifyCarve(e.byMat, 2)) {
      this.play(matSoundName(c.group, 'break', c.size), {
        pos: e.pos, gain: explosion ? 0.55 : 0.9, refDist: 5 + c.size * 3, category: 'carve', priority: c.size,
      });
    }
  }

  private impact(e: any): void {
    if (!(e.force > 0)) return;
    const body = (e.a && e.a.dynamic ? e.a : e.b && e.b.dynamic ? e.b : e.a ?? e.b) as { id: number; grid: { data: Uint8Array } } | null;
    if (!body) return;
    if (!this.impactCooldown.allow(body.id, this.tNow)) return;
    const group = bodyAudioGroup(body);
    this.play(matSoundName(group, 'hit', forceSize(e.force)), {
      pos: e.pos, gain: 0.3 + 0.7 * impactLoudness(e.force), refDist: 5 + forceSize(e.force) * 3, category: 'mat',
    });
  }

  private split(e: any): void {
    const child = e.child;
    if (!child || child.grid.count < 30) return;
    const group = bodyAudioGroup(e.parent && e.parent.grid.count ? e.parent : child);
    const size = sizeClass(child.grid.count);
    const pos = child.center();
    const o: PlayOpts = { pos, refDist: 8 + size * 4, category: 'struct' };
    if (group === 'wood') this.play('struct.creak', { ...o, gain: 0.6 + size * 0.2 });
    else if (group === 'masonry') this.play('struct.rumble', { ...o, gain: 0.5 + size * 0.25 });
    else if (group === 'metal') this.play(matSoundName('metal', 'slide', size), { ...o, gain: 0.8 });
    else this.play(matSoundName(group, 'break', size), { ...o, gain: 0.6 });
  }

  private custom(name: string, d: any): void {
    const e = this.engine;
    switch (name) {
      case 'tool:swing': this.play(d.hit ? 'tool.swing.hit' : 'tool.swing', { gain: 0.8 }); break;
      case 'tool:impact': this.play('tool.swing.hit', { pos: d.pos, refDist: 6, gain: d.broke ? 1 : 0.7 }); break;
      case 'tool:clang': this.play('tool.clang', { pos: d.pos, refDist: 8, gain: 0.9 }); break;
      case 'tool:shot': {
        const t = ['shotgun', 'pistol', 'rifle', 'rocket'].includes(d.tool) ? d.tool : 'pistol';
        this.play('tool.shot.' + t, { pos: d.pos, refDist: 22, priority: 4, gain: 0.9, category: 'shot' });
        break;
      }
      case 'tool:empty': this.play('tool.empty'); break;
      case 'tool:throw': this.play('tool.throw', { pos: d.pos, gain: 0.8 }); break;
      case 'tool:place': this.play('tool.place', { pos: d.pos, gain: 0.9 }); break;
      case 'tool:beep': this.play('tool.beep', { pos: d.pos, refDist: 10, category: 'beep' }); break;
      case 'tool:spray': this.play('tool.spray', { gain: 0.8, category: 'spray' }); break;
      case 'tool:foam': this.play('tool.foam', { gain: 0.8, category: 'spray' }); break;
      case 'tool:select': this.play('tool.select'); break;
      case 'tool:torch': this.torchOn = !!d.on; this.play(d.on ? 'tool.torch.on' : 'tool.torch.off', { gain: 0.8 }); if (!d.on) e.stopLoop('torch'); break;
      case 'player:hurt': this.play('player.hurt', { gain: 0.6 + clamp01(d.amount ?? 0.2), category: 'hurt' }); break;
      case 'player:dead': this.play('player.dead', { priority: 8 }); break;
      case 'fire:ignite': this.play('fire.ignite', { pos: d.pos, refDist: 6, gain: 0.8, category: 'fire' }); break;
      case 'vehicle:enter': this.play('vehicle.door'); this.play('vehicle.ignition', { delay: 0.35, gain: 0.9 }); break;
      case 'vehicle:exit': this.play('vehicle.door'); this.play('vehicle.shutoff', { delay: 0.05, gain: 0.7 }); e.stopLoop('engine'); break;
      case 'vehicle:crash': this.play('vehicle.crash', { pos: d.pos, gain: 0.4 + 0.6 * impactLoudness(d.force ?? 20000), refDist: 15, priority: 4, category: 'crash' }); break;
      case 'vehicle:skid': this.play('vehicle.skid', { pos: d.pos, amount: d.amount, refDist: 10, category: 'skid' }); break;
      case 'mission:alarm': this.startAlarm(); break;
      case 'mission:second': this.second(d.left); break;
      case 'mission:target': this.play('mission.target'); break;
      case 'mission:pickup': this.play('mission.pickup'); break;
      case 'mission:objective': this.play('mission.objective'); break;
      case 'mission:escapeOpen': this.play('mission.escapeOpen', { priority: 3 }); break;
      case 'mission:success': this.endAlarm(); this.play('mission.success', { priority: 9 }); break;
      case 'mission:fail': this.endAlarm(); this.play('mission.fail', { priority: 9 }); break;
      case 'mission:heli': if (d.pos) e.touchLoop('heli', 'heli', { pos: d.pos, level: 1, ttl: 0.7, refDist: 30 }); this.count('heli'); break;
      case 'mission:reset': case 'mission:start': case 'mission:alarmOff': this.endAlarm(); break;
    }
  }

  private startAlarm(): void {
    this.alarmOn = true; this.heistTime = 0;
    this.engine.touchLoop('alarm', 'alarm', { level: 1, bus: 'sfx' });
    this.engine.music?.setCue('heist');
    this.engine.music?.setTension(0.1);
    this.count('alarm');
  }
  private endAlarm(): void {
    this.alarmOn = false;
    this.engine.stopLoop('alarm');
    this.engine.stopLoop('heli');
    this.engine.music?.setCue(this.engine.ready ? 'calm' : null);
    this.engine.music?.setTension(0);
  }
  private second(left: number): void {
    if (typeof left !== 'number') return;
    if (left <= 10 && left >= 0) {
      this.play('mission.urgent', { pitch: 1 + (10 - left) * 0.03, gain: 0.9, category: 'tick' });
      this.engine.music?.setTension(Math.max(0.9, this.alarmOn ? clamp01(this.heistTime / 60) : 0));
    } else if (this.alarmOn) this.play('mission.tick', { category: 'tick' });
  }

  // ------------------------------------------------------------- per frame

  frame(game: GameLike, dt: number): void {
    this.tNow = this.clock();
    const e = this.engine;
    if (!e.ready) return;
    const pl = game.player;
    if (!e.music?.currentCue) e.music?.setCue(this.alarmOn ? 'heist' : 'calm');
    e.music?.setDuck(game.paused ? 0.25 : 1);
    if (this.alarmOn && !game.paused) {
      this.heistTime += dt;
      e.music?.setTension(clamp01(this.heistTime / 70));
    }
    if (game.paused) return;

    // footsteps / jump / land
    const n = this.steps.update(pl.stride, pl.grounded && !pl.seated);
    if (n) {
      const o: V3 = { x: pl.pos.x, y: pl.pos.y + 0.3, z: pl.pos.z };
      const hit = game.sim.raycast(o, { x: 0, y: -1, z: 0 }, 1.2);
      const group = hit ? audioGroupOfPal(hit.palette) : 'dirt';
      this.play(`step.${group}`, { gain: 0.55, category: 'step' });
    }
    if (pl.grounded && !this.wasGrounded && pl.landed > 0 && pl.landed !== this.lastLanded) {
      this.lastLanded = pl.landed;
      const hit = game.sim.raycast({ x: pl.pos.x, y: pl.pos.y + 0.3, z: pl.pos.z }, { x: 0, y: -1, z: 0 }, 1.2);
      this.play('player.land', { amount: clamp01(pl.landed / 14), gain: 0.7, category: 'land' });
      if (hit) this.play(`step.${audioGroupOfPal(hit.palette)}`, { gain: 0.5 + clamp01(pl.landed / 14) * 0.5, pitch: 0.8, category: 'step' });
    } else if (!pl.grounded && this.wasGrounded && pl.vel.y > 2) {
      this.play('player.jump', { category: 'land' });
    }
    this.wasGrounded = pl.grounded;

    // indoor probe
    this.probeT -= dt;
    if (this.probeT <= 0) {
      this.probeT = 0.5;
      const eye = pl.eye;
      const up = game.sim.raycast(eye, { x: 0, y: 1, z: 0 }, 6);
      const side = HORIZ.map((d) => game.sim.raycast(eye, d, 6)?.dist ?? null);
      const target = indoorScore(up ? up.dist : null, side);
      this.indoor += (target - this.indoor) * 0.5;
      e.setIndoor(this.indoor);
    }

    // fire
    const fc = game.fire.count();
    this.fireT -= dt;
    if (fc > 0 && this.fireT <= 0) {
      this.fireT = 0.1;
      const ps = game.fire.positions(8);
      let best = Infinity; this.fireNearest = null;
      for (const p of ps) { const d = e.distanceTo(p); if (d < best) { best = d; this.fireNearest = p; } }
      if (this.fireNearest) {
        e.touchLoop('fire', 'fire', { level: fireLoudness(fc, best), pos: this.fireNearest, refDist: 5, ttl: 0.6 });
        if (Math.random() < Math.min(0.9, 0.15 + fc * 0.02)) {
          const p = ps[(Math.random() * ps.length) | 0];
          this.play('fire.pop', { pos: p, refDist: 4, category: 'fire', gain: 0.8 });
        }
      }
    }

    // vehicle
    const v = game.ext.vehicles?.current;
    if (v && v.engineOn) {
      const p = engineParams(v.speedKmh ?? 0, v.throttle ?? 0, true, v.health ?? 1);
      e.touchLoop('engine', 'engine', { freq: p.freq, cutoff: p.cutoff, level: p.gain, ttl: 0.4 });
    }

    // torch
    if (this.torchOn) e.touchLoop('torch', 'torch', { level: 1, ttl: 0.5 });

    // ambient bed + occasional details (subtle, ducked indoors)
    e.touchLoop('ambient', 'ambient', { level: 0.5 * (1 - 0.65 * this.indoor), bus: 'ambient' });
    this.ambT -= dt;
    if (this.ambT <= 0) {
      this.ambT = rand(7, 16);
      const kind = ['amb.bird', 'amb.gust', 'amb.distant', 'amb.bird'][(Math.random() * 4) | 0];
      const a = Math.random() * Math.PI * 2, r = rand(25, 60);
      const lp = e.listener.pos;
      this.play(kind, { pos: { x: lp.x + Math.cos(a) * r, y: lp.y + rand(0, 8), z: lp.z + Math.sin(a) * r }, gain: (1 - this.indoor * 0.7), refDist: 10, bus: 'ambient', category: 'amb' });
    }
  }
}

export { clamp };
