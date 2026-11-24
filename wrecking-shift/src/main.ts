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

function fail(title: string, detail: string) {
  const b = document.getElementById('boot') ?? document.body.appendChild(document.createElement('div'));
  b.id = 'boot';
  b.style.cssText = 'position:fixed;inset:0;display:flex;flex-direction:column;gap:12px;align-items:center;justify-content:center;padding:24px;text-align:center;background:#101418;color:#f2f2ee;font:15px system-ui,sans-serif;z-index:99';
  b.innerHTML = '';
  const h = document.createElement('div'); h.style.cssText = 'font-size:20px;font-weight:700;color:#f5c518'; h.textContent = title;
  const d = document.createElement('div'); d.style.cssText = 'max-width:560px;line-height:1.5;opacity:.9'; d.textContent = detail;
  b.append(h, d);
}

function preflight(): string | null {
  const c = document.createElement('canvas');
  if (!c.getContext('webgl2')) return 'This game needs WebGL 2. Use a current desktop Chrome, Edge or Firefox with hardware acceleration enabled.';
  if (typeof WebAssembly !== 'object') return 'This game needs WebAssembly, which this browser or page does not allow.';
  return null;
}

const problem = preflight();
if (problem) fail('Wrecking Shift cannot start here', problem);
else boot().catch((e) => {
  console.error(e);
  const msg = String(e?.message ?? e);
  const wasm = /wasm|WebAssembly|unsafe-eval|Content Security/i.test(msg);
  fail('Wrecking Shift failed to start', (wasm
    ? 'The page hosting the game blocked WebAssembly (needed for physics). '
    : 'Something went wrong while starting. ') +
    'Try a current desktop Chrome/Edge/Firefox, or run it locally: npm install && npm run dev in the wrecking-shift folder. (' + msg.slice(0, 200) + ')');
});
