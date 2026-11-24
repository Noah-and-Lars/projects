import { Game } from './game/game';

const params = new URLSearchParams(location.search);
const testMode = params.has('test');

async function boot() {
  const canvas = document.getElementById('view') as HTMLCanvasElement;
  const game = new Game(canvas, testMode);
  await game.init();
  game.loadLevel(params.get('level') ?? 'testyard', Number(params.get('seed') ?? 1234));
  document.getElementById('boot')?.remove();

  // test / debug hooks
  (window as any).__game = {
    game,
    get sim() { return game.sim; },
    get player() { return game.player; },
    ready: true,
    /** advance n fixed ticks (no rendering) */
    step(n = 1) { for (let i = 0; i < n; i++) game.fixedStep(); game.input.endFrame(); },
    /** draw one frame, remeshing everything that is dirty */
    render() { game.draw(1 / 60, true); },
    setView(x: number, y: number, z: number, yaw: number, pitch: number) {
      game.player.teleport({ x, y, z }); game.player.yaw = yaw; game.player.pitch = pitch;
    },
    key(code: string, down: boolean) { if (down) { game.input.keys.add(code); game.input.pressed.add(code); } else game.input.keys.delete(code); },
    useTool(t: number) { game.useTool(t); },
    stats() {
      const s = game.sim;
      let dyn = 0, vox = 0;
      for (const b of s.bodies.values()) { if (b.dynamic) dyn++; vox += b.grid.count; }
      return { tick: s.tick, bodies: s.bodies.size, dynamic: dyn, voxels: vox, pos: game.player.pos, grounded: game.player.grounded, perf: game.perf };
    },
  };
  if (!testMode) game.start();
  else game.draw(0, true);
}

boot().catch((e) => {
  console.error(e);
  const b = document.getElementById('boot');
  if (b) b.textContent = 'Failed to start: ' + e;
});
