import type { Game, GameModule } from './game';
import { GamepadInput, type PadContext } from './gamepad';

/**
 * Wires src/game/gamepad.ts into the game: polls `navigator.getGamepads()` once per frame, before the game
 * reads its input (Input.poll), and moves the focus between menu buttons. Publishes `game.ext.gamepad`
 * ({ pad: GamepadInput, connected }).
 */
export function createGamepadModule(): GameModule {
  let pad: GamepadInput | null = null;
  const menuButtons = (): HTMLElement[] => {
    if (typeof document === 'undefined') return [];
    const menus = document.querySelectorAll<HTMLElement>('#ui .ws-menu');
    const top = menus[menus.length - 1];
    if (!top) return [];
    return [...top.querySelectorAll<HTMLElement>('button:not([disabled]), input, select')].filter((b) => b.offsetParent !== null || b.getClientRects().length > 0);
  };
  const context = (game: Game): PadContext => {
    if (menuButtons().length && (!game.controlsEnabled || game.paused)) return 'menu';
    return game.ext.vehicles?.current ? 'drive' : 'foot';
  };
  return {
    init(game: Game) {
      if (typeof navigator === 'undefined' || typeof window === 'undefined') return;
      const nav = (dir: 'up' | 'down' | 'left' | 'right') => {
        const list = menuButtons();
        if (!list.length) return;
        const cur = list.indexOf(document.activeElement as HTMLElement);
        // sliders take left / right themselves
        const el = document.activeElement as HTMLInputElement | null;
        if (el && el.tagName === 'INPUT' && el.type === 'range' && (dir === 'left' || dir === 'right')) {
          if (dir === 'left') el.stepDown(); else el.stepUp();
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
          return;
        }
        const step = dir === 'up' || dir === 'left' ? -1 : 1;
        const next = cur < 0 ? (step > 0 ? 0 : list.length - 1) : (cur + step + list.length) % list.length;
        list[next].focus();
      };
      const activate = () => {
        const list = menuButtons();
        const el = document.activeElement as HTMLElement | null;
        if (el && list.includes(el)) el.click();
        else list[0]?.focus();
      };
      const emitKey = (code: string, down: boolean) => {
        window.dispatchEvent(new KeyboardEvent(down ? 'keydown' : 'keyup', { code, key: code, bubbles: true, cancelable: true }));
      };
      pad = new GamepadInput(game.input, () => navigator.getGamepads?.() ?? null, emitKey, nav, activate);
      game.input.pollers.push((dt) => pad?.poll(dt, context(game)));
      window.addEventListener('gamepaddisconnected', () => pad?.releaseAll());
      game.ext.gamepad = { pad, get connected() { return (pad?.active ?? -1) >= 0; } };
    },
  };
}
