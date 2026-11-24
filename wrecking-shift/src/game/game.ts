import { Renderer } from '../render/renderer';
import type { LevelDef, LevelInfo } from '../sim/levels/types';
import { testYard } from '../sim/levels/testyard';
import { Player } from '../sim/player';
import { DT, Sim, initPhysics } from '../sim/sim';
import { Input } from './input';

export const LEVELS: Record<string, LevelDef> = { [testYard.id]: testYard };

export class Game {
  sim!: Sim;
  player!: Player;
  level!: LevelInfo;
  readonly renderer: Renderer;
  readonly input: Input;
  private acc = 0;
  private last = 0;
  running = false;
  paused = false;
  frameCount = 0;
  /** ms spent in the last sim step / render (for the debug overlay) */
  perf = { sim: 0, render: 0 };
  tool = 0;
  private cooldown = 0;

  constructor(canvas: HTMLCanvasElement, readonly testMode: boolean) {
    this.renderer = new Renderer(canvas);
    this.input = new Input(canvas);
    window.addEventListener('resize', () => this.renderer.resize());
  }

  async init(): Promise<void> {
    await initPhysics();
  }

  loadLevel(id: string, seed = 1234): void {
    const def = LEVELS[id] ?? testYard;
    this.sim = new Sim(seed);
    this.level = def.build(this.sim);
    this.player = new Player(this.sim, this.level.spawn);
    this.player.yaw = this.level.spawnYaw;
    this.renderer.setLevel(this.level);
    // settle physics queries
    this.sim.step();
    this.renderer.render(this.sim, 0, true);
  }

  /** one fixed 60 Hz simulation tick */
  fixedStep(): void {
    const t0 = performance.now();
    const inp = this.input, p = this.player;
    p.input.moveX = (inp.down('KeyD') ? 1 : 0) - (inp.down('KeyA') ? 1 : 0);
    p.input.moveZ = (inp.down('KeyW') ? 1 : 0) - (inp.down('KeyS') ? 1 : 0);
    p.input.jump = inp.down('Space');
    p.input.crouch = inp.down('ControlLeft') || inp.down('KeyC');
    p.input.sprint = inp.down('ShiftLeft');
    p.update();
    this.updateTool();
    this.sim.step();
    this.renderer.handleEvents(this.sim.drainEvents(), p.eye);
    this.perf.sim = performance.now() - t0;
  }

  private updateTool(): void {
    const inp = this.input, p = this.player;
    if (inp.hit('Digit1')) this.tool = 0;
    if (inp.hit('Digit2')) this.tool = 1;
    if (inp.hit('Digit3')) this.tool = 2;
    if (this.cooldown > 0) { this.cooldown--; return; }
    if (inp.buttons & 1) this.useTool(this.tool);
  }

  /** temporary M2 tools: 0 sledge, 1 gun, 2 bomb */
  useTool(tool: number): void {
    const p = this.player;
    const eye = p.eye, dir = p.forward;
    if (tool === 0) {
      this.cooldown = 22;
      const hit = this.sim.raycast(eye, dir, 2.6);
      if (hit) this.sim.carve({ x: hit.point.x + dir.x * 0.1, y: hit.point.y + dir.y * 0.1, z: hit.point.z + dir.z * 0.1 }, 0.42, 0.26, 0, { cause: 'sledge', fracture: 0.25 });
    } else if (tool === 1) {
      this.cooldown = 8;
      const hit = this.sim.raycast(eye, dir, 120);
      if (hit) this.sim.carve({ x: hit.point.x + dir.x * 0.05, y: hit.point.y + dir.y * 0.05, z: hit.point.z + dir.z * 0.05 }, 0.22, 0.15, 0.08, { cause: 'gun' });
    } else {
      this.cooldown = 40;
      const hit = this.sim.raycast(eye, dir, 60);
      if (hit) this.sim.explode(hit.point, 1.4);
    }
  }

  frame(now: number): void {
    const dt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    if (!this.paused) {
      const inp = this.input, p = this.player;
      p.yaw -= inp.mouseDX * inp.sensitivity;
      p.pitch = Math.max(-1.55, Math.min(1.55, p.pitch - inp.mouseDY * inp.sensitivity));
      this.acc += dt;
      let n = 0;
      while (this.acc >= DT && n < 4) { this.fixedStep(); this.acc -= DT; n++; }
      if (n === 4) this.acc = 0;
    }
    this.input.endFrame();
    this.draw(dt);
  }

  draw(dt: number, full = false): void {
    const t0 = performance.now();
    const p = this.player;
    this.renderer.setCamera(p.eye, p.yaw, p.pitch);
    this.renderer.render(this.sim, dt, full);
    this.perf.render = performance.now() - t0;
    this.frameCount++;
  }

  start(): void {
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
