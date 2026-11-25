/**
 * Mods menus (plain DOM, see menus.ts):
 *   'mods'       — every mod by category with an on/off switch (remembered), search, all/none, Play for game modes
 *   'modeinfo'   — rules of a mod game mode + Start
 *   'moderesult' — result of a finished mod game mode (retry / mods / title)
 *   'spawn'      — sandbox spawn menu (B): props + vehicles, placed in front of you
 * Click actions: handleModsClick; switches: data-mod checkboxes (handleModsInput).
 */
import './mods.css';
import type { ModsApi } from '../modsModule';
import { CATEGORY_LABEL, MODS } from '../../mods/registry';
import type { ModCategory } from '../../mods/api';
import { esc } from './dom';
import { LEVELS } from '../levels';
import type { MenuHost } from './menus';

const view = { cat: 'all' as ModCategory | 'all', q: '', spawnGroup: 'all' };
const CATS: ModCategory[] = ['props', 'tools', 'vehicles', 'maps', 'modes', 'global', 'visual'];

function win(title: string, body: string, foot: string, opts: { cls?: string; tag?: string; menuCls?: string; right?: string } = {}): string {
  return `<div class="ws-menu ${opts.menuCls ?? ''}"><div class="ws-win ${opts.cls ?? ''}"><header>${opts.tag ? `<span class="tag">${esc(opts.tag)}</span>` : ''}<h2>${title}</h2><span class="sp"></span>${opts.right ?? ''}</header>` +
    `<div class="ws-body">${body}</div>${foot ? `<div class="ws-foot">${foot}</div>` : ''}</div></div>`;
}

const mods = (h: MenuHost): ModsApi | undefined => h.game.ext.mods;

export function modsHtml(h: MenuHost): string {
  const api = mods(h);
  if (!api) return win('Mods', '<p class="ws-note">Not available in this build.</p>', '<button class="ws-btn pri" data-act="back">Back</button>', { cls: 'mid', tag: 'Mods' });
  const st = api.state;
  const q = view.q.trim().toLowerCase();
  const list = MODS.filter((m) => (view.cat === 'all' || m.category === view.cat) && (!q || (m.name + ' ' + m.description + ' ' + m.id).toLowerCase().includes(q)));
  const counts = (c: ModCategory | 'all') => MODS.filter((m) => c === 'all' || m.category === c).length;
  const tabs = (['all', ...CATS] as const).map((c) => `<button data-act="modcat" data-id="${c}" class="${view.cat === c ? 'on' : ''}">${c === 'all' ? 'All' : CATEGORY_LABEL[c]} <small>${counts(c)}</small></button>`).join('');
  const what = (m: (typeof MODS)[number]) => {
    const parts: string[] = [];
    if (m.props?.length) parts.push(`${m.props.length} prop${m.props.length > 1 ? 's' : ''}`);
    if (m.tools?.length) parts.push(`${m.tools.length} tool${m.tools.length > 1 ? 's' : ''}`);
    if (m.vehicles?.length) parts.push(`${m.vehicles.length} vehicle${m.vehicles.length > 1 ? 's' : ''}`);
    if (m.maps?.length) parts.push(`${m.maps.length} map${m.maps.length > 1 ? 's' : ''}`);
    if (m.modes?.length) parts.push(`${m.modes.length} mode${m.modes.length > 1 ? 's' : ''}`);
    if (m.global) parts.push('rule tweak');
    if (m.visual) parts.push('look');
    return parts.join(' · ');
  };
  const rows = list.map((m) => {
    const on = st.isEnabled(m.id);
    const play = on && m.modes?.length ? m.modes.map((d) => `<button class="ws-btn sm" data-act="modeinfo" data-id="${esc(d.id)}">Play ${esc(d.title)}</button>`).join('') : '';
    const sbx = on && m.maps?.length ? m.maps.map((l) => `<button class="ws-btn sm" data-act="sbx" data-id="${esc(l.id)}">Sandbox: ${esc(l.title)}</button>`).join('') : '';
    return `<div class="ws-mod${on ? ' on' : ''}" data-mod-row="${esc(m.id)}"><label class="sw"><input type="checkbox" data-mod="${esc(m.id)}"${on ? ' checked' : ''}><span></span></label>` +
      `<div class="info"><div class="nm">${esc(m.name)} <span class="cat">${CATEGORY_LABEL[m.category]}</span></div><div class="ds">${esc(m.description)}</div>` +
      `<div class="meta">${esc(what(m))}${m.author ? ` · by ${esc(m.author)}` : ''}${m.conflicts ? ` · one ${esc(m.conflicts)} mod at a time` : ''}</div>${play || sbx ? `<div class="acts">${play}${sbx}</div>` : ''}</div></div>`;
  }).join('');
  const note = h.session === 'play' ? '<p class="ws-note ws-modnote">Rule tweaks and looks apply at once; new tools, maps and spawnables appear on the next level load.</p>' : '';
  return win('Mods', `${note}<div class="ws-modbar"><span class="ws-seg ws-modtabs">${tabs}</span><input class="ws-modsearch" type="search" placeholder="Search mods" value="${esc(view.q)}" data-modsearch="1"></div>` +
    `<div class="ws-modlist">${rows || '<p class="ws-note">No mods match.</p>'}</div>`,
    `<span class="ws-modcount">${st.count()} of ${MODS.length} enabled</span><button class="ws-btn" data-act="modall" data-id="1">Enable shown</button><button class="ws-btn" data-act="modall" data-id="0">Disable shown</button><button class="ws-btn" data-act="moddefaults">Defaults</button><button class="ws-btn pri" data-act="back">Done</button>`,
    { cls: 'wide', tag: 'Mods' });
}

export function modeInfoHtml(_h: MenuHost, id: string): string {
  const d = MODS.flatMap((m) => m.modes ?? []).find((x) => x.id === id);
  if (!d) return win('Game mode', '<p class="ws-note">Unknown mode.</p>', '<button class="ws-btn pri" data-act="back">Back</button>', { cls: 'mid' });
  const rules = d.rules.map((r) => `<li>${esc(r)}</li>`).join('');
  const lv = LEVELS[d.level]?.title ?? d.level;
  return win(esc(d.title), `<ul class="ws-rules">${rules}</ul><p class="ws-note">Map: <b>${esc(lv)}</b>${d.infiniteAmmo ? ' · infinite ammo' : ''}</p>`,
    `<button class="ws-btn" data-act="back">Back</button><button class="ws-btn pri" data-act="modestart" data-id="${esc(d.id)}">Start</button>`, { cls: 'mid', tag: 'Mod game mode' });
}

export function modeResultHtml(h: MenuHost): string {
  const r = mods(h)?.lastResult;
  if (!r) return win('Game mode', '<p class="ws-note">No result.</p>', '<button class="ws-btn pri" data-act="quit">Title</button>', { cls: 'mid' });
  return win(esc(r.def.title), `<div class="ws-moderes ${r.status.won ? 'won' : 'lost'}"><div class="big">${r.status.won ? 'Done!' : 'Not this time'}</div><div>${esc(r.status.text)}</div><div class="sc">Score <b>${r.status.score}</b></div></div>`,
    `<button class="ws-btn" data-act="quit">Title</button><button class="ws-btn" data-act="open" data-id="mods">Mods</button><button class="ws-btn pri" data-act="moderetry">Again</button>`, { cls: 'mid', tag: 'Result' });
}

export function spawnHtml(h: MenuHost): string {
  const api = mods(h);
  if (!api || !api.canSpawn()) return win('Spawn', '<p class="ws-note">The spawn menu works in sandbox mode.</p>', '<button class="ws-btn pri" data-act="resume">Close</button>', { cls: 'mid', tag: 'Sandbox' });
  const all = api.spawnables();
  const groups = [...new Set(all.map((e) => e.group))].sort();
  if (view.spawnGroup !== 'all' && !groups.includes(view.spawnGroup)) view.spawnGroup = 'all';
  const tabs = ['all', ...groups].map((g) => `<button data-act="spgroup" data-id="${esc(g)}" class="${view.spawnGroup === g ? 'on' : ''}">${g === 'all' ? 'All' : esc(g)}</button>`).join('');
  const items = all.filter((e) => view.spawnGroup === 'all' || e.group === view.spawnGroup)
    .map((e) => `<button class="ws-spawn ${e.kind}" data-act="spawn" data-id="${esc(e.id)}"><span class="k">${e.kind === 'vehicle' ? 'Vehicle' : 'Prop'}</span><span class="nm">${esc(e.name)}</span><span class="md">${e.mod ? esc(MODS.find((m) => m.id === e.mod)?.name ?? e.mod) : 'Built-in'}</span></button>`).join('');
  return win('Spawn', `<div class="ws-seg ws-modtabs">${tabs}</div><div class="ws-spawngrid">${items}</div><p class="ws-note">Click to place it in front of you. More in Mods (Esc → Mods). B or Esc closes.</p>`,
    '<button class="ws-btn" data-act="open" data-id="mods">Mods</button><button class="ws-btn pri" data-act="resume">Close</button>', { cls: 'wide', tag: 'Sandbox', menuCls: 'light' });
}

/** click actions; returns true when handled */
export function handleModsClick(h: MenuHost, act: string, t: HTMLElement, refresh: () => void): boolean {
  const api = mods(h);
  const id = t.dataset.id ?? '';
  switch (act) {
    case 'modcat': view.cat = id as ModCategory | 'all'; refresh(); return true;
    case 'modall': {
      if (!api) return true;
      const q = view.q.trim().toLowerCase();
      for (const m of MODS) if ((view.cat === 'all' || m.category === view.cat) && (!q || (m.name + ' ' + m.description).toLowerCase().includes(q))) api.state.set(m.id, id === '1');
      refresh(); return true;
    }
    case 'moddefaults': api?.state.resetDefaults(); refresh(); return true;
    case 'modeinfo': h.open('modeinfo' as any, id); return true;
    case 'modestart': if (api?.startMode(id)) h.close(); return true;
    case 'moderetry': if (api?.restartMode()) h.close(); return true;
    case 'spgroup': view.spawnGroup = id; refresh(); return true;
    case 'spawn': if (api?.spawn(id)) h.close(); return true;
  }
  return false;
}

/** checkbox + search input; returns true when handled */
export function handleModsInput(h: MenuHost, inp: HTMLInputElement, refresh: () => void): boolean {
  if (inp.dataset.mod) {
    mods(h)?.state.set(inp.dataset.mod, inp.checked);
    refresh(); // conflicting mods may have been switched off
    return true;
  }
  if (inp.dataset.modsearch) {
    view.q = inp.value;
    refresh();
    const s = document.querySelector<HTMLInputElement>('.ws-modsearch');
    if (s) { s.focus(); s.setSelectionRange(s.value.length, s.value.length); }
    return true;
  }
  return false;
}
