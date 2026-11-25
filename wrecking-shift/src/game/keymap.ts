/**
 * Key bindings: logical actions -> `KeyboardEvent.code`, stored as overrides in `settings.keys`.
 *
 * How the game reads keys through the map: every action has a CANONICAL code (its first default, e.g.
 * 'KeyW' for forward). `Input` passes each physical key through `KeyMap.canon(code)` before it records it, so
 * a key bound to an action arrives as that action's canonical code and all existing readers
 * (`input.down('KeyW')`, `pendingKeys.has('KeyE')`, the vehicle and photo modules ...) follow the bindings
 * without knowing about them. A default key whose action was moved elsewhere is swallowed (`'Unbound:KeyW'`),
 * keys that belong to no action pass through unchanged. Pure TS (no DOM), unit-tested in tests/unit/ux.test.ts.
 */

export type ActionId =
  | 'forward' | 'back' | 'left' | 'right' | 'jump' | 'sprint' | 'crouch' | 'interact' | 'toolCycle'
  | 'map' | 'flashlight' | 'photo' | 'spawnMenu' | 'vehicleCam' | 'flip' | 'quicksave' | 'quickload';

export interface ActionDef {
  id: ActionId;
  label: string;
  /** default codes; the first one is the canonical code the game reads */
  defaults: string[];
}

export const ACTIONS: ActionDef[] = [
  { id: 'forward', label: 'Move forward', defaults: ['KeyW'] },
  { id: 'back', label: 'Move back', defaults: ['KeyS'] },
  { id: 'left', label: 'Strafe left', defaults: ['KeyA'] },
  { id: 'right', label: 'Strafe right', defaults: ['KeyD'] },
  { id: 'jump', label: 'Jump / handbrake', defaults: ['Space'] },
  { id: 'sprint', label: 'Sprint', defaults: ['ShiftLeft'] },
  { id: 'crouch', label: 'Crouch', defaults: ['ControlLeft', 'KeyC'] },
  { id: 'interact', label: 'Take / use / drive', defaults: ['KeyE'] },
  { id: 'toolCycle', label: 'Swap back to last tool', defaults: ['KeyQ'] },
  { id: 'map', label: 'Site map', defaults: ['Tab'] },
  { id: 'flashlight', label: 'Flashlight', defaults: ['KeyF'] },
  { id: 'photo', label: 'Photo mode', defaults: ['KeyP'] },
  { id: 'spawnMenu', label: 'Spawn menu (sandbox)', defaults: ['KeyB'] },
  { id: 'vehicleCam', label: 'Vehicle camera', defaults: ['KeyV'] },
  { id: 'flip', label: 'Flip vehicle', defaults: ['KeyR'] },
  { id: 'quicksave', label: 'Quicksave', defaults: ['F5'] },
  { id: 'quickload', label: 'Quickload', defaults: ['F9'] },
];

const BY_ID = new Map(ACTIONS.map((a) => [a.id, a]));
/** keys that can never be bound (they open/close menus or belong to the browser / debug overlays) */
export const RESERVED_CODES = new Set(['Escape', 'F3', 'F4', 'F7', 'F11', 'F12', 'MetaLeft', 'MetaRight']);
const CODE_RE = /^[A-Za-z0-9]{1,24}$/;

export function isBindableCode(code: string): boolean {
  return CODE_RE.test(code) && !RESERVED_CODES.has(code) && !code.startsWith('Digit');
}

/** keep only known actions with plausible codes (settings sanitiser) */
export function sanitizeKeys(raw: any): Record<string, string> {
  const out: Record<string, string> = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const a of ACTIONS) {
    const c = raw[a.id];
    if (typeof c === 'string' && isBindableCode(c) && !(a.defaults.length === 1 && a.defaults[0] === c)) out[a.id] = c;
  }
  return out;
}

/** short human label for a key code: 'KeyE' -> 'E', 'ShiftLeft' -> 'L-Shift', 'ArrowUp' -> '↑' */
export function keyLabel(code: string): string {
  if (/^Key[A-Z]$/.test(code)) return code.slice(3);
  if (/^Digit\d$/.test(code)) return code.slice(5);
  if (/^Numpad\d$/.test(code)) return 'Num ' + code.slice(6);
  const named: Record<string, string> = {
    Space: 'Space', ShiftLeft: 'L-Shift', ShiftRight: 'R-Shift', ControlLeft: 'L-Ctrl', ControlRight: 'R-Ctrl',
    AltLeft: 'L-Alt', AltRight: 'R-Alt', ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→', Tab: 'Tab',
    Enter: 'Enter', Backspace: 'Backspace', CapsLock: 'Caps', Backquote: '`', Minus: '-', Equal: '=', BracketLeft: '[',
    BracketRight: ']', Backslash: '\\', Semicolon: ';', Quote: "'", Comma: ',', Period: '.', Slash: '/',
  };
  return named[code] ?? code;
}

export class KeyMap {
  /** action -> override code (only actions moved away from their defaults) */
  private over: Record<string, string> = {};
  private table = new Map<string, string>();

  constructor(overrides: Record<string, string> = {}) { this.set(overrides); }

  /** replace all overrides (e.g. from settings.keys) */
  set(overrides: Record<string, string>): void {
    this.over = sanitizeKeys(overrides);
    this.table.clear();
    // 1) bound keys -> canonical code of their action
    for (const a of ACTIONS) for (const c of this.codes(a.id)) if (!this.table.has(c)) this.table.set(c, a.defaults[0]);
    // 2) default keys of actions that moved away are swallowed (unless step 1 gave them a new job)
    for (const a of ACTIONS) for (const c of a.defaults) if (!this.table.has(c)) this.table.set(c, 'Unbound:' + c);
  }
  overrides(): Record<string, string> { return { ...this.over }; }

  /** physical codes that trigger an action */
  codes(id: ActionId): string[] {
    const o = this.over[id];
    return o ? [o] : (BY_ID.get(id)?.defaults ?? []);
  }
  /** the code the game reads for an action */
  canonical(id: ActionId): string { return BY_ID.get(id)?.defaults[0] ?? ''; }
  /** translate a physical key code into what the game should see */
  canon(code: string): string { return this.table.get(code) ?? code; }
  /** label of the (first) key bound to an action, e.g. 'E' */
  label(id: ActionId): string { return this.codes(id).map(keyLabel).join(' / '); }

  /**
   * Bind `code` to `id`. If another action used that key, the two swap keys (so nothing is left unbound).
   * Returns the new overrides (store them in settings.keys) or null when the code cannot be bound.
   */
  bind(id: ActionId, code: string): Record<string, string> | null {
    if (!BY_ID.has(id) || !isBindableCode(code)) return null;
    const next: Record<string, string> = { ...this.over };
    const mine = this.codes(id)[0];
    for (const a of ACTIONS) {
      if (a.id === id) continue;
      if (this.codes(a.id).includes(code)) next[a.id] = mine;
    }
    next[id] = code;
    // an override equal to the single default is the same as no override
    for (const a of ACTIONS) if (next[a.id] && a.defaults.length === 1 && a.defaults[0] === next[a.id]) delete next[a.id];
    this.set(next);
    return this.overrides();
  }
}

/** label of the key bound to an action, for HUD / menu text (falls back to the default key) */
export function keyOf(game: { ext: Record<string, any> } | null | undefined, id: ActionId): string {
  const km: KeyMap | undefined = game?.ext.keys;
  return km ? km.label(id) : keyLabel(BY_ID.get(id)?.defaults[0] ?? '');
}
