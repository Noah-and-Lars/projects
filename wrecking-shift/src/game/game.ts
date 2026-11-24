import { Renderer } from '../render/renderer';
import { DroneSystem } from '../sim/drones';
import { FireSystem } from '../sim/fire';
import type { LevelDef, LevelInfo } from '../sim/levels/types';
import { Player } from '../sim/player';
import { DT, Sim, initPhysics, type SimEvent } from '../sim/sim';
import { restoreSim, snapshotSim } from '../sim/snapshot';
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
  /** quicksave: JSON-able module state; `load` runs after the world was restored and `onLevelLoaded` was called */
  save?(game: Game): any;
  load?(game: Game, data: any): void;
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
  drones!: DroneSystem;
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
  /** additive first-person camera sway (head-bob, set by the UI module); ignored while cameraOverride is set */
  viewBob = { y: 0, roll: 0 };
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
    return { sim: this.sim, player: this.player, infiniteAmmo: this.infiniteAmmo, fire: this.fire };
  }

  /**
   * Load a level. While the real-time loop is running the load is deferred by a moment so a loading
   * screen can be painted first, and meshing is spread over the following frames behind a progress bar.
   * In test mode (or before `start()`) it is fully synchronous.
   */
  loadLevel(id: string, seed = 1234): void {
    const def: LevelDef = LEVELS[id] ?? Object.values(LEVELS)[0];
    const run = (deferMesh: boolean) => {
      this.levelId = def.id;
      this.seed = seed;
      this.deferMesh = deferMesh;
      this.setupWorld((sim) => { this.level = def.build(sim); });
      this.deferMesh = false;
    };
    if (this.testMode || !this.running) { run(false); return; }
    const token = ++this.loadToken;
    this.loading = { title: def.title, phase: 'build', total: 0 };
    this.showLoading(0);
    setTimeout(() => {
      if (token !== this.loadToken) return;
      try { run(true); } catch (e) { this.loading = null; this.hideLoading(); throw e; }
      this.loading = { title: def.title, phase: 'mesh', total: Math.max(1, this.renderer.pendingChunks()) };
    }, 60);
  }

  /** non-null while a level is being built / meshed (sim is frozen, loading screen is up) */
  loading: { title: string; phase: 'build' | 'mesh'; total: number } | null = null;
  private loadToken = 0;
  private deferMesh = false;
  private loadEl: HTMLDivElement | null = null;
  private showLoading(frac: number): void {
    if (!this.loadEl) {
      const el = (this.loadEl = document.createElement('div'));
      el.id = 'loading';
      el.style.cssText = 'position:fixed;inset:0;z-index:50;background:#101418;color:#f2f2ee;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;font:600 15px system-ui,sans-serif;letter-spacing:.12em;text-transform:uppercase';
      el.innerHTML = '<div id="loading-title"></div><div style="width:min(60vw,420px);height:8px;background:#2a3038;border-radius:4px;overflow:hidden"><div id="loading-bar" style="height:100%;width:0;background:#f5c518;transition:width .15s"></div></div><div id="loading-note" style="font-weight:400;font-size:12px;opacity:.7;text-transform:none;letter-spacing:.02em"></div>';
      document.body.appendChild(el);
    }
    const l = this.loading;
    this.loadEl.style.display = 'flex';
    (this.loadEl.querySelector('#loading-title') as HTMLElement).textContent = l ? l.title : 'Loading';
    (this.loadEl.querySelector('#loading-bar') as HTMLElement).style.width = Math.round(frac * 100) + '%';
    (this.loadEl.querySelector('#loading-note') as HTMLElement).textContent = l?.phase === 'mesh' ? 'Laying bricks…' : 'Surveying the site…';
  }
  private hideLoading(): void { if (this.loadEl) this.loadEl.style.display = 'none'; }

  private seed = 1234;

  /** create a fresh Sim + systems + player; `fill` builds the level or restores a snapshot */
  private setupWorld(fill: (sim: Sim) => void, after?: () => void): void {
    this.sim = new Sim(this.seed);
    this.fire = new FireSystem(this.sim);
    this.sim.systems.push(this.fire);
    this.drones = new DroneSystem(this.sim);
    this.sim.ext.drones = this.drones;
    this.sim.systems.push(this.drones);
    fill(this.sim);
    if (this.level.waterLevel != null) {
      this.sim.waterLevel = this.level.waterLevel;
      this.sim.systems.push(new WaterSystem(this.level.waterLevel));
    }
    this.player = new Player(this.sim, this.level.spawn);
    this.player.yaw = this.level.spawnYaw;
    this.player.pitch = 0;
    const oldBelt = this.belt;
    this.belt = createBelt();
    if (oldBelt) for (const t of this.belt.tools) { const o = oldBelt.byId(t.id); if (o) { t.unlocked = o.unlocked; t.maxAmmo = o.maxAmmo; } }
    this.belt.refillAll();
    this.cameraOverride = null;
    this.toolsEnabled = true;
    this.renderer.setLevel(this.level);
    this.renderer.reset();
    this.acc = 0;
    for (const m of this.modules) m.onLevelLoaded?.(this);
    after?.();
    this.sim.step();
    this.sim.drainEvents();
    this.renderer.render(this.sim, 0, !this.deferMesh);
  }

  /** single-slot quicksave (in memory). Returns false when nothing was saved. */
  private slot: any = null;
  hasQuicksave(): boolean { return !!this.slot && this.slot.levelId === this.levelId; }
  quicksave(): boolean {
    const p = this.player;
    if (p.dead) return false;
    this.slot = {
      levelId: this.levelId, seed: this.seed, sky: this.level.sky,
      sim: snapshotSim(this.sim),
      player: { pos: p.pos, yaw: p.yaw, pitch: p.pitch, health: p.health, seated: p.seated },
      belt: { index: this.belt.index, tools: this.belt.tools.map((t) => ({ id: t.id, ammo: t.ammo === Infinity ? -1 : t.ammo, state: t.save() })) },
      drones: this.drones.save(),
      fire: this.fire.save(),
      modules: this.modules.map((m) => (m.save ? m.save(this) : undefined)),
    };
    this.sim.out.push({ type: 'custom', name: 'game:quicksave', data: {} });
    return true;
  }
  quickload(): boolean {
    const s = this.slot;
    if (!s || s.levelId !== this.levelId) return false;
    const oldBelt = this.belt;
    this.setupWorld((sim) => restoreSim(s.sim, sim), () => {
      const p = this.player;
      p.teleport(s.player.pos); p.yaw = s.player.yaw; p.pitch = s.player.pitch; p.health = s.player.health;
      const ctx = this.toolCtx;
      for (const ts of s.belt.tools) {
        const t = this.belt.byId(ts.id);
        if (!t) continue;
        const o = oldBelt.byId(ts.id);
        if (o) { t.unlocked = o.unlocked; t.maxAmmo = o.maxAmmo; }
        t.ammo = ts.ammo < 0 ? Infinity : ts.ammo;
        t.load(ctx, ts.state);
      }
      this.belt.index = Math.min(s.belt.index, this.belt.tools.length - 1);
      this.drones.load(s.drones);
      this.fire.load(s.fire);
      this.modules.forEach((m, i) => { if (m.load && s.modules[i] !== undefined) m.load(this, s.modules[i]); });
    });
    this.sim.out.push({ type: 'custom', name: 'game:quickload', data: {} });
    return true;
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
    if (this.loading) {
      // level is being meshed: keep the sim frozen, show progress (20% for the build, 80% for meshing)
      this.input.endFrame();
      if (this.loading.phase === 'mesh') {
        // mesh in big slices without drawing (the loading screen covers the view)
        const b = this.renderer.bodies;
        const keep = b.budgetMs;
        b.budgetMs = 40;
        b.sync(this.sim, false, this.renderer.camera.position);
        b.budgetMs = keep;
        const left = this.renderer.pendingChunks();
        this.showLoading(0.2 + 0.8 * (1 - left / this.loading.total));
        if (left === 0) { this.loading = null; this.draw(0); this.hideLoading(); this.last = performance.now(); this.acc = 0; }
      }
      return;
    }
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
    else { const e = p.eye; e.y += this.viewBob.y; this.renderer.setCamera(e, p.yaw, p.pitch, this.viewBob.roll); }
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
