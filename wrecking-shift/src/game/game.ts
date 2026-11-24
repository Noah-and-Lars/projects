import { Renderer } from '../render/renderer';
import { FireSystem } from '../sim/fire';
import type { LevelDef, LevelInfo } from '../sim/levels/types';
import { Player } from '../sim/player';
import { DT, Sim, initPhysics, type SimEvent } from '../sim/sim';
import { ToolBelt, createBelt, emptyToolInput, type ToolContext, type ToolInput } from '../sim/tools';
import { WaterSystem } from '../sim/water';
import { Input } from './input';
import { LEVELS } from './levels';

/**
 * A game module plugs a feature (HUD, audio, vehicles, missions ...) into the main loop without
 * the features knowing about each other. Register modules in `src/game/modules.ts`.
 */
export interface GameModule {
  /** once, after the Game object exists */
  init?(game: Game): void;
  /** after a level was (re)built: sim / player / level are fresh objects */
  onLevelLoaded?(game: Game): void;
  /** fixed 60 Hz tick, before `sim.step()` (deterministic gameplay goes here) */
  fixedUpdate?(game: Game): void;
  /** sim events of the tick that just ran (particles, sounds, mission triggers) */
  onEvents?(game: Game, events: SimEvent[]): void;
  /** once per rendered frame, before drawing (dt in seconds) */
  frameUpdate?(game: Game, dt: number): void;
}

export interface CameraOverride {
  eye: { x: number; y: number; z: number };
  yaw: number;
  pitch: number;
  roll?: number;
}

export class Game {
  sim!: Sim;
  player!: Player;
  level!: LevelInfo;
  levelId = '';
  fire!: FireSystem;
  belt!: ToolBelt;
  readonly renderer: Renderer;
  readonly input: Input;
  readonly modules: GameModule[] = [];
  /** shared, typed loosely on purpose: modules publish their public objects here (game.ext.mission, ...) */
  readonly ext: Record<string, any> = {};
  private acc = 0;
  private last = 0;
  running = false;
  /** true = sim frozen (menus) */
  paused = false;
  /** player has control of the character (false in menus, cutscenes, when dead) */
  controlsEnabled = true;
  /** tools usable (false while driving, on the map screen...) */
  toolsEnabled = true;
  /** sandbox flags */
  infiniteAmmo = false;
  frameCount = 0;
  perf = { sim: 0, render: 0, fps: 0 };
  /** modules may take over the camera for a frame (vehicles, map, cutscene) */
  cameraOverride: CameraOverride | null = null;
  fov = 80;
  private toolInput: ToolInput = emptyToolInput();
  private prevButtons = 0;
  private fpsAcc = 0;
  private fpsFrames = 0;

  constructor(canvas: HTMLCanvasElement, readonly testMode: boolean) {
    this.renderer = new Renderer(canvas);
    this.input = new Input(canvas);
    window.addEventListener('resize', () => this.renderer.resize());
  }

  async init(modules: GameModule[]): Promise<void> {
    await initPhysics();
    for (const m of modules) this.modules.push(m);
    for (const m of this.modules) m.init?.(this);
  }

  get toolCtx(): ToolContext {
    return { sim: this.sim, player: this.player, infiniteAmmo: this.infiniteAmmo };
  }

  loadLevel(id: string, seed = 1234): void {
    const def: LevelDef = LEVELS[id] ?? Object.values(LEVELS)[0];
    this.levelId = def.id;
    this.sim = new Sim(seed);
    this.fire = new FireSystem(this.sim);
    this.sim.systems.push(this.fire);
    this.level = def.build(this.sim);
    if (this.level.waterLevel != null) {
      this.sim.waterLevel = this.level.waterLevel;
      this.sim.systems.push(new WaterSystem(this.level.waterLevel));
    }
    this.player = new Player(this.sim, this.level.spawn);
    this.player.yaw = this.level.spawnYaw;
    const oldBelt = this.belt;
    this.belt = createBelt();
    if (oldBelt) for (const t of this.belt.tools) { const o = oldBelt.byId(t.id); if (o) { t.unlocked = o.unlocked; t.maxAmmo = o.maxAmmo; } }
    this.belt.refillAll();
    this.cameraOverride = null;
    this.renderer.setLevel(this.level);
    this.renderer.reset();
    this.acc = 0;
    for (const m of this.modules) m.onLevelLoaded?.(this);
    this.sim.step();
    this.sim.drainEvents();
    this.renderer.render(this.sim, 0, true);
  }

  /** one fixed 60 Hz simulation tick */
  fixedStep(): void {
    const t0 = performance.now();
    const inp = this.input, p = this.player;
    const ctl = this.controlsEnabled && !p.dead;
    p.input.moveX = ctl ? (inp.down('KeyD') ? 1 : 0) - (inp.down('KeyA') ? 1 : 0) : 0;
    p.input.moveZ = ctl ? (inp.down('KeyW') ? 1 : 0) - (inp.down('KeyS') ? 1 : 0) : 0;
    p.input.jump = ctl && inp.down('Space');
    p.input.crouch = ctl && (inp.down('ControlLeft') || inp.down('KeyC'));
    p.input.sprint = ctl && inp.down('ShiftLeft');
    p.update();

    // tools
    const ti = this.toolInput;
    const b = ctl ? inp.buttons | this.virtualButtons : 0;
    ti.primary = !!(b & 1); ti.secondary = !!(b & 4);
    ti.primaryPressed = !!(b & 1) && !(this.prevButtons & 1);
    ti.primaryReleased = !(b & 1) && !!(this.prevButtons & 1);
    ti.secondaryPressed = !!(b & 4) && !(this.prevButtons & 4);
    ti.scroll = this.pendingScroll; this.pendingScroll = 0;
    ti.interactPressed = this.pendingInteract; this.pendingInteract = false;
    this.prevButtons = b;
    const ctx = this.toolCtx;
    if (ctl && this.toolsEnabled) {
      for (let i = 0; i < 10; i++) if (this.pendingKeys.has('Digit' + ((i + 1) % 10))) this.belt.select(ctx, i);
      if (this.pendingKeys.has('KeyQ')) this.belt.cycle(ctx, -1);
    }
    this.belt.update(ctx, ti, ctl && this.toolsEnabled && !p.seated);

    for (const m of this.modules) m.fixedUpdate?.(this);
    this.pendingKeys.clear();
    this.sim.step();
    const events = this.sim.drainEvents();
    this.renderer.handleEvents(events, p.eye);
    for (const m of this.modules) m.onEvents?.(this, events);
    this.perf.sim = performance.now() - t0;
  }

  /** keys pressed since the last fixed tick (modules read this in fixedUpdate for edge-triggered actions) */
  readonly pendingKeys = new Set<string>();
  private pendingScroll = 0;
  private pendingInteract = false;
  /** bitmask OR-ed into mouse buttons (tests / touch) */
  virtualButtons = 0;

  /** collect per-frame input edges so fixed ticks do not miss them */
  private gatherInput(): void {
    const inp = this.input;
    for (const k of inp.pressed) this.pendingKeys.add(k);
    if (inp.pressed.has('KeyE')) this.pendingInteract = true;
    if (inp.wheel) this.pendingScroll = Math.sign(inp.wheel);
    if (this.controlsEnabled && !this.cameraOverride?.roll) {
      const p = this.player;
      p.yaw -= inp.mouseDX * inp.sensitivity;
      p.pitch = Math.max(-1.55, Math.min(1.55, p.pitch - inp.mouseDY * inp.sensitivity));
    }
  }

  frame(now: number): void {
    const dt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    this.fpsAcc += dt; this.fpsFrames++;
    if (this.fpsAcc >= 0.5) { this.perf.fps = this.fpsFrames / this.fpsAcc; this.fpsAcc = 0; this.fpsFrames = 0; }
    this.gatherInput();
    if (!this.paused) {
      this.acc += dt;
      let n = 0;
      while (this.acc >= DT && n < 3) { this.fixedStep(); this.acc -= DT; n++; }
      if (n === 3) this.acc = 0;
    }
    for (const m of this.modules) m.frameUpdate?.(this, dt);
    this.input.endFrame();
    this.draw(dt);
  }

  draw(dt: number, full = false): void {
    const t0 = performance.now();
    const p = this.player;
    const cam = this.cameraOverride;
    if (this.renderer.camera.fov !== this.fov) { this.renderer.camera.fov = this.fov; this.renderer.camera.updateProjectionMatrix(); }
    if (cam) this.renderer.setCamera(cam.eye, cam.yaw, cam.pitch, cam.roll ?? 0);
    else this.renderer.setCamera(p.eye, p.yaw, p.pitch);
    this.renderer.render(this.sim, dt, full);
    this.perf.render = performance.now() - t0;
    this.frameCount++;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    const loop = (t: number) => {
      if (!this.running) return;
      this.frame(t);
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }
}
