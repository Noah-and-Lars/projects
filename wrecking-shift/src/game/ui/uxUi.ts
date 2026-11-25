/**
 * Menu pieces for the UX features: Settings -> Assists, the Controls page with key rebinding, and the
 * "assisted" tag on results. Used by ui/menus.ts.
 */
import { ALARM_OPTIONS, AMMO_OPTIONS, TOUGHNESS_OPTIONS } from '../assists';
import { ACTIONS, KeyMap, isBindableCode, type ActionId } from '../keymap';
import type { Settings } from '../progress';
import type { MissionResult } from '../../sim/mission';
import { esc } from './dom';
import type { MenuHost } from './menus';

const ALARM_LABEL: Record<string, string> = { off: 'No limit', '+60': '+60 s', '+30': '+30 s', '+15': '+15 s', normal: 'Normal', '-10': '−10 s' };

function seg(key: string, cur: string | number, opts: (string | number)[], label: (v: any) => string): string {
  return `<span class="ws-seg">${opts.map((v) => `<button data-act="seg" data-key="${key}" data-val="${v}" class="${String(cur) === String(v) ? 'on' : ''}">${esc(label(v))}</button>`).join('')}</span><span></span>`;
}

/** Settings -> Assists */
export function assistsHtml(s: Settings): string {
  return `<div class="ws-sec" style="margin-top:.7em">Assists</div>` +
    `<p class="ws-note" style="margin:0 0 .4em">Too tense, or not tense enough? These bend the rules of a shift. Runs with any of them changed are marked <span class="ws-assisted">assisted</span> on the result; they still count for your rank.</p>` +
    `<div class="ws-form">` +
    `<label>Alarm clock</label>${seg('assistAlarm', s.assistAlarm, ALARM_OPTIONS, (v) => ALARM_LABEL[v] ?? v)}` +
    `<label>Ammo</label>${seg('assistAmmo', s.assistAmmo, AMMO_OPTIONS, (v) => '×' + v)}` +
    `<label>Damage taken</label>${seg('assistToughness', s.assistToughness, TOUGHNESS_OPTIONS, (v) => '×' + v)}` +
    `<label for="ws-assistJobs">Unlock all jobs</label><input id="ws-assistJobs" type="checkbox" data-key="assistJobs"${s.assistJobs ? ' checked' : ''}><span></span>` +
    `</div><p class="ws-note" style="margin:.3em 0 0">“No limit”: the alarm still goes off and security still comes, they just never arrive. The time bonus never counts more than the job's normal clock.</p>`;
}

/** small tag for results / job board (empty when the run was not assisted) */
export function assistedTag(r: Pick<MissionResult, 'assists'> | null | undefined): string {
  const a = r?.assists;
  return a?.length ? `<span class="ws-assisted" title="${esc(a.join(', '))}">assisted</span>` : '';
}

const FIXED: [string, string][] = [
  ['Mouse', 'Look'], ['LMB', 'Use tool'], ['RMB', 'Grab / alt fire'], ['1 – 0 / wheel', 'Select tool'], ['Esc', 'Pause'],
  ['F3', 'Debug info'], ['F4', 'Camera readout'], ['F7', 'Performance mode (when suggested)'],
];

/** Controls page: every bindable action with its key (click to change), then the fixed keys */
export function controlsHtml(host: MenuHost, waiting: ActionId | null): string {
  const km: KeyMap = host.game.ext.keys ?? new KeyMap(host.progress.settings.keys);
  const over = km.overrides();
  const rows = ACTIONS.map((a) => {
    const w = waiting === a.id;
    return `<div><span>${esc(a.label)}</span><button data-act="rebind" data-id="${a.id}" class="${w ? 'wait' : over[a.id] ? 'moved' : ''}">${w ? 'press a key…' : esc(km.label(a.id))}</button></div>`;
  }).join('');
  const fixed = FIXED.map(([k, v]) => `<div><span>${esc(v)}</span><kbd>${esc(k)}</kbd></div>`).join('');
  return `<div class="ws-menu"><div class="ws-win mid"><header><span class="tag">Help</span><h2>Controls</h2><span class="sp"></span></header>` +
    `<div class="ws-body"><p class="ws-note" style="margin:0 0 .5em">${waiting ? 'Press the new key (Esc cancels). A key that already has a job swaps with this one.' : 'Click a key to change it.'}</p>` +
    `<div class="ws-bind">${rows}</div><div class="ws-sec" style="margin-top:.6em">Fixed</div><div class="ws-bind">${fixed}</div>` +
    `<p class="ws-note" style="margin-top:.6em">Click the game to capture the mouse. Esc releases it and pauses.</p></div>` +
    `<div class="ws-foot"><button class="ws-btn" data-act="reset-keys">Default keys</button><button class="ws-btn pri" data-act="back">Back</button></div></div></div>`;
}

/**
 * A key press while the Controls page waits for a new key. Returns true when the event was used (the caller
 * stops it reaching the game). Esc cancels; reserved keys are ignored.
 */
export function rebindKey(host: MenuHost, action: ActionId, code: string): 'done' | 'cancel' | 'ignored' {
  if (code === 'Escape') return 'cancel';
  if (!isBindableCode(code)) return 'ignored';
  const km: KeyMap | undefined = host.game.ext.keys;
  const next = (km ?? new KeyMap(host.progress.settings.keys)).bind(action, code);
  if (!next) return 'ignored';
  host.progress.settings.set('keys', next);
  return 'done';
}

