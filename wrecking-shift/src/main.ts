import { Game } from './game/game';
import { createModules } from './game/modules';

const params = new URLSearchParams(location.search);
const testMode = params.has('test');

async function boot() {
  const canvas = document.getElementById('view') as HTMLCanvasElement;
  const game = new Game(canvas, testMode);
  await game.init(createModules());
  game.loadLevel(params.get('level') ?? 'testyard', Number(params.get('seed') ?? 1234));
  document.getElementById('boot')?.remove();
  // menus / ?mission= / ?sandbox= (UI module, see src/game/uiModule.ts)
  game.ext.ui?.boot(params);

  // test / debug hooks (also handy in the browser console)
  (window as any).__game = {
    game,
    get sim() { return game.sim; },
    get player() { return game.player; },
    ready: true,
    /** UI / mission helpers: startMission(id), openMenu(name), closeMenus(), state() ... */
    get ui() { return game.ext.ui; },
    /** advance n fixed ticks (no rendering) */
    step(n = 1) { for (let i = 0; i < n; i++) game.fixedStep(); },
    /** draw one frame, remeshing everything that is dirty */
    render() { for (const m of game.modules) m.frameUpdate?.(game, 1 / 60); game.draw(1 / 60, true); },
    load(level: string, seed = 1234) { game.loadLevel(level, seed); },
    setView(x: number, y: number, z: number, yaw: number, pitch: number) {
      game.player.teleport({ x, y, z }); game.player.yaw = yaw; game.player.pitch = pitch;
    },
    key(code: string, down: boolean) {
      if (down) { game.input.keys.add(code); game.pendingKeys.add(code); } else game.input.keys.delete(code);
    },
    /** hold / release virtual mouse buttons: bit 0 = LMB, bit 2 = RMB */
    buttons(mask: number) { game.virtualButtons = mask; },
    selectTool(id: string) { const i = game.belt.tools.findIndex((t) => t.id === id); if (i >= 0) { game.belt.tools[i].unlocked = true; game.belt.select(game.toolCtx, i); } return i; },
    explode(x: number, y: number, z: number, size: number) { game.sim.explode({ x, y, z }, size); },
    stats() {
      const s = game.sim;
      let dyn = 0, vox = 0;
      for (const b of s.bodies.values()) { if (b.dynamic) dyn++; vox += b.grid.count; }
      return {
        tick: s.tick, bodies: s.bodies.size, dynamic: dyn, voxels: vox, pos: game.player.pos, grounded: game.player.grounded,
        health: game.player.health, tool: game.belt.current.id, ammo: game.belt.current.ammo, fires: game.fire.count(), perf: game.perf,
      };
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
