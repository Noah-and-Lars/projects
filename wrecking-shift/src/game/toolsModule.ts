import * as THREE from 'three';
import { FlashLight, Puffs, Rockets, Segments } from '../render/toolFx';
import { ViewModels } from '../render/viewModel';
import { SPRAY_COLOR } from '../sim/materials';
import type { SimEvent } from '../sim/sim';
import type { Blowtorch, Cable, PipeBomb, Plank, RocketLauncher } from '../sim/tools';
import type { Preview } from '../sim/tools/twopoint';
import type { V3 } from '../sim/vec';
import { lookOf } from '../sim/tools/tool';
import type { Game, GameModule } from './game';

/**
 * Presentation for the player tools: first-person view models, rope lines, placement previews,
 * rockets, muzzle flashes and foam / spray / spark particles. Reads sim state (tools on
 * `game.belt`) and `tool:*` events; never changes the sim. Published as `game.ext.tools`.
 */
export class ToolsModule implements GameModule {
  vm!: ViewModels;
  puffs = new Puffs();
  sparks = new Puffs(true);
  ropes = new Segments(new THREE.MeshLambertMaterial({ color: 0xffffff }));
  previews = new Segments(new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.45, depthWrite: false }));
  rockets = new Rockets();
  muzzle = new FlashLight(0xffc070, 9, 14);
  beep = new FlashLight(0xff2a1a, 5, 6);
  torch = new FlashLight(0x8fc4ff, 4, 8);
  private flashMesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: 0xffd890, toneMapped: false, transparent: true, opacity: 0.9, depthWrite: false }));
  /** muzzle flash shown until this sim time (sim time so rare test frames do not leave it on) */
  private flashUntil = -1;
  private game!: Game;
  private tmp = new THREE.Vector3();

  init(game: Game): void {
    this.game = game;
    const r = game.renderer;
    if (!r.camera.parent) r.scene.add(r.camera);
    this.vm = new ViewModels(r.camera);
    this.flashMesh.visible = false;
    this.flashMesh.renderOrder = 11;
    r.scene.add(this.puffs.mesh, this.sparks.mesh, this.ropes.mesh, this.previews.mesh, this.rockets.root, this.muzzle.light, this.beep.light, this.torch.light, this.flashMesh);
    game.ext.tools = this;
  }

  onLevelLoaded(): void {
    this.flashUntil = -1;
    this.puffs.clear();
    this.sparks.clear();
  }

  /** put the camera where this tick's draw will put it (muzzle positions must not lag a frame) */
  private syncCamera(): void {
    const g = this.game, p = g.player;
    if (!p || g.cameraOverride) return;
    const cam = g.renderer.camera, e = p.eye;
    cam.position.set(e.x, e.y, e.z);
    cam.rotation.set(p.pitch, p.yaw, 0, 'YXZ');
    cam.updateMatrixWorld();
  }

  /** world position of the current tool's muzzle */
  muzzleWorld(): V3 {
    this.syncCamera();
    const v = this.vm.muzzleWorld(this.tmp);
    return { x: v.x, y: v.y, z: v.z };
  }

  onEvents(game: Game, events: SimEvent[]): void {
    for (const e of events) {
      if (e.type !== 'custom' || !e.name.startsWith('tool:') && !e.name.endsWith(':break')) continue;
      const d = e.data ?? {};
      switch (e.name) {
        case 'tool:select':
          this.vm.noteSwitch(game.sim.time);
          break;
        case 'tool:shot': {
          if (!d.dir || d.source) break; // not the player's own tool (drones, tests)
          const m = this.muzzleWorld();
          const dt0 = lookOf(d.tool);
          const big = dt0 === 'shotgun' || dt0 === 'rifle' ? 1.6 : dt0 === 'rocket' ? 2 : 1;
          this.muzzle.flash(m, 6 * big);
          this.flashUntil = game.sim.time + (dt0 === 'rocket' ? 0.08 : 0.04);
          this.flashMesh.scale.setScalar(0.05 * big);
          const n = dt0 === 'rocket' ? 18 : 5 * big;
          for (let i = 0; i < n; i++) {
            const s = 0.6 + Math.random();
            this.puffs.spawn(m, { x: d.dir.x * s + rnd(0.4), y: d.dir.y * s + rnd(0.4) + 0.2, z: d.dir.z * s + rnd(0.4) }, 0xb8b4ac, 0.03, 0.5 + Math.random() * 0.5, 0.25, -0.2, 1.5);
          }
          if (dt0 === 'rocket') for (let i = 0; i < 14; i++) {
            // back-blast
            this.puffs.spawn(m, { x: -d.dir.x * 3 + rnd(1), y: -d.dir.y * 3 + rnd(1), z: -d.dir.z * 3 + rnd(1) }, 0x9a958c, 0.08, 0.8 + Math.random() * 0.6, 0.6, -0.3, 2);
          }
          break;
        }
        case 'tool:foam': {
          const m = this.muzzleWorld();
          for (let i = 0; i < 10; i++) {
            const s = 5 + Math.random() * 3;
            this.puffs.spawn(m, { x: d.dir.x * s + rnd(1.2), y: d.dir.y * s + rnd(1.2), z: d.dir.z * s + rnd(1.2) }, 0xf4f6f8, 0.04, 0.6 + Math.random() * 0.5, 0.35, 3, 2.2);
          }
          break;
        }
        case 'tool:blow': {
          const m = this.muzzleWorld();
          for (let i = 0; i < 5; i++) {
            const sp = 7 + Math.random() * 4;
            this.puffs.spawn(m, { x: d.dir.x * sp + rnd(1.5), y: d.dir.y * sp + rnd(1.5), z: d.dir.z * sp + rnd(1.5) }, 0xc8bfa8, 0.02, 0.35, 0.3, 0, 3);
          }
          break;
        }
        case 'tool:spray': {
          const m = this.muzzleWorld();
          const to = d.pos as V3;
          const dx = to.x - m.x, dy = to.y - m.y, dz = to.z - m.z;
          for (let i = 0; i < 4; i++) {
            const s = 2.5 + Math.random();
            this.puffs.spawn(m, { x: dx * s + rnd(0.3), y: dy * s + rnd(0.3), z: dz * s + rnd(0.3) }, SPRAY_COLOR, 0.015, 0.3, 0.12, 0, 3);
          }
          break;
        }
        case 'tool:clang': {
          const p = d.pos as V3;
          for (let i = 0; i < 10; i++) this.sparks.spawn(p, { x: rnd(4), y: Math.random() * 3, z: rnd(4) }, 0xffd070, 0.015, 0.2 + Math.random() * 0.25, -0.03, 9);
          this.muzzle.flash(p, 1.5);
          break;
        }
        case 'tool:beep':
          this.beep.flash(d.pos, 3);
          break;
        case 'tool:place':
          if (!d.first) for (let i = 0; i < 6; i++) this.puffs.spawn(d.pos, { x: rnd(0.8), y: Math.random() * 0.8, z: rnd(0.8) }, 0xa09a90, 0.03, 0.4, 0.1, 0, 3);
          break;
        case 'plank:break':
        case 'cable:break':
          for (let i = 0; i < 8; i++) this.sparks.spawn(d.pos, { x: rnd(2), y: Math.random() * 2, z: rnd(2) }, 0xffc060, 0.012, 0.25, 0, 8);
          break;
      }
    }
  }

  frameUpdate(game: Game, dt: number): void {
    const belt = game.belt, p = game.player, sim = game.sim;
    if (!belt || !p || !sim) return;
    const tool = belt.current;
    const visible = !game.cameraOverride && !p.seated && !p.dead && game.toolsEnabled && game.controlsEnabled;
    this.vm.update({
      toolId: lookOf(tool.id), anim: tool.anim, active: tool.active, ammo: game.infiniteAmmo ? Infinity : tool.ammo,
      speed: Math.hypot(p.vel.x, p.vel.z), stride: p.stride, yaw: p.yaw, pitch: p.pitch,
      visible, grabbing: belt.grab.holding, grounded: p.grounded, simTime: sim.time,
    }, dt);

    // ropes
    this.ropes.begin();
    const ofLook = <T>(id: string) => belt.tools.filter((t) => lookOf(t.id) === id) as unknown as T[];
    for (const cable of ofLook<Cable>('cable')) for (const r of cable.ends()) this.ropes.rope(r.a, r.b, r.length, 0.035, r.taut ? 0x2c2118 : 0x4a3520);
    this.ropes.end();

    // placement previews (only for the selected tool)
    this.previews.begin();
    if (visible && (lookOf(tool.id) === 'plank' || lookOf(tool.id) === 'cable')) {
      const pv = (tool as Plank | Cable).preview as Preview | null;
      if (pv) {
        const col = pv.valid ? 0x5cff7a : 0xff4a3a;
        if (lookOf(tool.id) === 'plank') this.previews.add(pv.a, pv.b, 0.3, 0.1, col, { x: 0, y: 1, z: 0 });
        else this.previews.add(pv.a, pv.b, 0.03, 0.03, col);
      }
    }
    this.previews.end();

    // rockets + smoke trails
    const proj = ofLook<RocketLauncher>('rocket').flatMap((rl) => rl.projectiles);
    this.rockets.sync(proj);
    for (const r of proj) {
      const sp = Math.hypot(r.vel.x, r.vel.y, r.vel.z) || 1;
      const back = { x: r.pos.x - (r.vel.x / sp) * 0.35, y: r.pos.y - (r.vel.y / sp) * 0.35, z: r.pos.z - (r.vel.z / sp) * 0.35 };
      for (let i = 0; i < 2; i++) this.puffs.spawn(back, { x: rnd(0.3), y: rnd(0.3) + 0.2, z: rnd(0.3) }, 0xc9c4ba, 0.07, 1.2 + Math.random(), 0.5, -0.15, 1);
      this.sparks.spawn(back, { x: -r.vel.x * 0.1 + rnd(0.5), y: -r.vel.y * 0.1 + rnd(0.5), z: -r.vel.z * 0.1 + rnd(0.5) }, 0xffb040, 0.03, 0.12, 0, 0, 2);
      this.torch.hold(back, 4);
    }

    // pipe bomb fuses fizzle
    for (const pb of ofLook<PipeBomb>('pipebomb')) for (const c of pb.live) if (Math.random() < 0.7) this.sparks.spawn(c.pos, { x: rnd(1.5), y: 0.5 + Math.random() * 1.5, z: rnd(1.5) }, 0xffc040, 0.012, 0.25, 0, 6);

    // blowtorch flame on the surface
    if (lookOf(tool.id) === 'blowtorch' && tool.active && visible) {
      const bt = tool as Blowtorch;
      const hit = sim.raycast(p.eye, p.forward, bt.range);
      const at = hit ? hit.point : null;
      const m = this.muzzleWorld();
      this.torch.hold(at ?? m, at ? 2.5 : 1.2);
      if (at) for (let i = 0; i < 3; i++) this.sparks.spawn(at, { x: rnd(2.5), y: Math.random() * 2.5, z: rnd(2.5) }, Math.random() < 0.5 ? 0xffa040 : 0xfff0b0, 0.012, 0.2 + Math.random() * 0.2, 0, 8);
      this.sparks.spawn(m, { x: p.forward.x * 1.5 + rnd(0.2), y: p.forward.y * 1.5 + rnd(0.2), z: p.forward.z * 1.5 + rnd(0.2) }, 0x7fb0ff, 0.02, 0.06, 0.1, 0, 0);
    }

    // muzzle flash billboard
    if (sim.time <= this.flashUntil) {
      this.flashMesh.visible = visible;
      const mw = this.muzzleWorld();
      this.flashMesh.position.set(mw.x, mw.y, mw.z);
      this.flashMesh.rotation.set(Math.random() * 3, Math.random() * 3, 0);
    } else this.flashMesh.visible = false;

    this.puffs.update(dt);
    this.sparks.update(dt);
    this.muzzle.update(dt);
    this.beep.update(dt);
    this.torch.update(dt);
  }
}

const rnd = (s: number) => (Math.random() - 0.5) * s;
