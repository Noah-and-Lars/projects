// Title screen and pause menu (a sidebar of big buttons over the live
// valley, each with its icon), and the Settings panel docked beside the
// sidebar: Graphics, Controls, Audio and Gameplay tabs, a key table, and
// Restore defaults / Apply and save. Changes are drafted until applied.
// The Saves and New game pages live in saves.js.
import { h } from './dom.js';
import { ACTION_LABELS, DEFAULT_BINDS, DEFAULTS, keyLabel, saveSettings } from '../core/settings.js';

// Our own line icons (24 × 24, stroked).
const ICONS = {
  play: 'M8 5v14l11-7z',
  save: 'M5 3h11l3 3v15H5zM8 3v6h8V3M8 21v-7h8v7',
  saves: 'M4 7h16v13H4zM7 4h10M9 11h6',
  settings: 'M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1',
  coop: 'M9 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM3 20c0-3.3 2.7-6 6-6s6 2.7 6 6M16 11a3 3 0 1 0 0-6M18 14c2 .7 3 2.8 3 6',
  help: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6V14M12 17.5v.5',
  camera: 'M4 8h4l2-3h4l2 3h4v11H4zM12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
  post: 'M12 22v-9M12 13l-6-3 6-7 6 7zM8 22h8',
  truck: 'M2 7h11v9H2zM13 10h5l3 3v3h-8M6 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM17 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4z',
  exit: 'M14 4h5v16h-5M10 8l-4 4 4 4M6 12h10',
  quit: 'M6 6l12 12M18 6L6 18',
  new: 'M12 5v14M5 12h14',
  cont: 'M5 5v14M10 5v14l9-7z',
  trophy: 'M8 4h8v5a4 4 0 0 1-8 0zM8 6H4a3 3 0 0 0 4 4M16 6h4a3 3 0 0 1-4 4M12 13v4M8 20h8M9 17h6',
};
export function menuIcon(name) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('class', 'mico'); svg.setAttribute('aria-hidden', 'true');
  const p = document.createElementNS('http://www.w3.org/2000/svg', 'path'); p.setAttribute('d', ICONS[name] || ICONS.play); svg.append(p);
  return svg;
}
// The emblem at the top of the sidebar: the valley, its river and a nugget.
function emblem() {
  const d = h('div', { class: 'emblem' });
  d.innerHTML = '<svg viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="32" r="30" fill="#f3e9d2"/><path d="M8 44 L22 24 L32 34 L42 18 L56 44 Z" fill="#5b6b78"/><path d="M6 44 Q20 38 32 44 T58 44 V50 Q46 60 32 60 Q18 60 6 50 Z" fill="#1f7a7a"/><circle cx="44" cy="45" r="4.5" fill="#d9a441" stroke="#7a5320" stroke-width="2"/></svg>';
  return d;
}
const clone = (o) => JSON.parse(JSON.stringify(o));

export function createMenu(root, { settings, input, onPlay, onSettingsChanged, onCleanup, items = [], titleItems = [], pauseInfo }) {
  // Title: the sidebar over the live valley; its items are set by main.js.
  const title = h('section', { id: 'scr-title', class: 'screen side-screen title-screen interactive' },
    h('div', { class: 'title-side side' },
      h('div', { class: 'brand' }, h('h1', { class: 'logo' }, 'Rillstone'), h('p', { class: 'sub' }, 'Dig, wash and automate a highland claim')),
      h('nav', { class: 'menu-list', id: 'title-menu' },
        h('button', { class: 'menu-btn primary', id: 'btn-play', onclick: () => onPlay() }, h('b', {}, 'New game'))),
      h('p', { class: 'small title-foot' }, 'Click to look around · WASD to move · Esc for the menu')));
  // Pause: the same sidebar, an emblem and where you are, then the buttons.
  const pauseInfoEl = h('p', { class: 'pause-info' });
  const pause = h('section', { id: 'scr-pause', class: 'screen side-screen pause-screen interactive hidden' },
    h('div', { class: 'side pause-side' },
      h('div', { class: 'side-head' }, emblem(), h('div', {}, h('h2', {}, 'Paused'), pauseInfoEl)),
      h('nav', { class: 'menu-list', id: 'pause-items' },
        menuButton({ label: 'Resume', icon: 'play', primary: true, onclick: () => onPlay() }),
        ...items.map(menuButton))));
  function menuButton(it) {
    const label = h('b', {}, it.label);
    const b = h('button', { class: 'menu-btn' + (it.primary ? ' primary' : '') + (it.danger ? ' danger' : '') + (it.secondary ? ' quiet' : ''), onclick: (e) => {
      if (it.confirm && !b.classList.contains('arm')) { b.classList.add('arm'); label.textContent = it.confirm; setTimeout(() => { b.classList.remove('arm'); label.textContent = it.label; }, 3500); return; }
      it.onclick(e);
    } }, h('span', { class: 'mtext' }, label, it.sub ? h('span', {}, it.sub) : null), it.icon ? menuIcon(it.icon) : null);
    return b;
  }

  // ---- Settings (docked beside the sidebar) ----
  const settingsEl = h('section', { id: 'scr-settings', class: 'settings-dock interactive hidden' });
  root.append(title, pause, settingsEl);
  const TABS = [['graphics', 'Graphics'], ['controls', 'Controls'], ['audio', 'Audio'], ['gameplay', 'Gameplay']];
  let tab = 'graphics', draft = null, dirty = false, armBack = false, note = '';
  const set = (fn) => { fn(draft); dirty = true; note = ''; render(); };
  function row(label, control, hint) { return h('label', { class: 'srow' }, h('span', { class: 'slabel' }, label, hint ? h('small', {}, hint) : null), control); }
  function slider(get, put, min, max, step, fmt) {
    const out = h('output', {}, fmt(get()));
    const inp = h('input', { type: 'range', min, max, step, value: get(), oninput: (e) => { put(+e.target.value); dirty = true; note = ''; out.textContent = fmt(+e.target.value); footer(); } });
    return h('span', { class: 'slider' }, inp, out);
  }
  const check = (key) => h('input', { type: 'checkbox', class: 'switch', checked: !!draft[key], onchange: (e) => set(d => { d[key] = e.target.checked; }) });
  // Which settings each tab owns (for Restore defaults).
  const OWNS = { graphics: ['graphics', 'fov', 'headBob'], controls: ['binds'], audio: ['volume'], gameplay: ['sensitivity', 'invertY', 'sprintToggle', 'captions', 'leaderboard'] };
  function body() {
    if (tab === 'graphics') return h('div', { class: 'srows' },
      row('Quality', h('select', { onchange: (e) => set(d => { d.graphics = e.target.value; }) }, ...[['high', 'High'], ['medium', 'Medium'], ['low', 'Low'], ['verylow', 'Very low (fastest)']].map(([q, l]) => h('option', { value: q, selected: draft.graphics === q }, l))), 'Very low draws at reduced resolution with no shadows and a nearer view'),
      row('Field of view', slider(() => draft.fov, v => { draft.fov = v; }, 60, 100, 1, v => v + '°')),
      row('Head-bob', check('headBob')));
    if (tab === 'audio') return h('div', { class: 'srows' }, ...Object.keys(draft.volume).map(k => row(k[0].toUpperCase() + k.slice(1), slider(() => draft.volume[k], v => { draft.volume[k] = v; }, 0, 1, 0.05, v => Math.round(v * 100) + '%'))));
    if (tab === 'gameplay') return h('div', { class: 'srows' },
      row('Mouse sensitivity', slider(() => draft.sensitivity, v => { draft.sensitivity = v; }, 0.2, 3, 0.05, v => v.toFixed(2))),
      row('Invert look', check('invertY')),
      row('Sprint toggles', check('sprintToggle'), 'Shift switches sprint on and off instead of holding it'),
      row('Captions for sounds', check('captions')),
      row('Show me on the online leaderboard', check('leaderboard'), 'Shares your Arcade name, Scrip and ores sold while you play'),
      onCleanup ? row('Tidy up', h('button', { class: 'btn', onclick: (e) => { const n = onCleanup(); e.currentTarget.textContent = `Cleared ${n}`; } }, 'Clear loose clods and piles'), 'Happens straight away') : null);
    // Controls: a table of key chips (two per action) and what they do.
    const keyChip = (a, i) => h('button', {
      class: 'key' + (draft.binds[a][i] ? '' : ' empty'), 'data-act': a, 'data-i': i, title: 'Click, then press a key or mouse button (Backspace clears)',
      onclick: (e) => { const btn = e.currentTarget; btn.textContent = '…'; btn.classList.add('wait'); input.capture((code) => set(d => { const list = d.binds[a].slice(); if (code !== 'Backspace') list[i] = code; else list.splice(i, 1); d.binds[a] = list.filter(Boolean); })); },
    }, draft.binds[a][i] ? keyLabel(draft.binds[a][i]) : '');
    return h('div', { class: 'keytable' },
      h('div', { class: 'khead' }, h('span', {}, 'Key'), h('span', {}, 'Second key'), h('span', {}, 'Action')),
      ...Object.keys(ACTION_LABELS).map(a => h('div', { class: 'krow' }, h('span', {}, keyChip(a, 0)), h('span', {}, keyChip(a, 1)), h('span', { class: 'kact' }, ACTION_LABELS[a]))),
      h('p', { class: 'small' }, 'Click a key, then press the new key or mouse button. Backspace clears it, Esc keeps the old one.'));
  }
  let footEl = null;
  function footer() {
    if (!footEl) return;
    footEl.replaceChildren(
      h('span', { class: 'snote' + (dirty ? ' dirty' : '') }, dirty ? 'Unsaved changes' : note),
      h('button', { class: 'btn', onclick: restore }, 'Restore defaults'),
      h('button', { class: 'btn primary', disabled: !dirty, onclick: apply }, 'Apply and save'));
  }
  function render() {
    if (!draft) return;
    const tabs = h('div', { class: 'stabs' }, ...TABS.map(([k, l]) => h('button', { class: 'tab' + (k === tab ? ' on' : ''), onclick: () => { tab = k; render(); } }, l)));
    footEl = h('div', { class: 'sfoot' });
    const backBtn = h('button', { class: 'btn ghost sback' + (armBack ? ' danger' : ''), onclick: () => closeSettings() }, armBack ? 'Discard changes?' : 'Back');
    settingsEl.replaceChildren(h('div', { class: 'sdock-card' },
      h('div', { class: 'shead' }, h('div', { class: 'sbanner' }, h('h2', {}, 'Settings')), tabs),
      h('h3', { class: 'stitle' }, TABS.find(t => t[0] === tab)[1]),
      h('div', { class: 'sbody' }, body()),
      h('div', { class: 'sbar' }, backBtn, footEl)));
    footer();
  }
  function apply() {
    for (const k of Object.keys(draft)) settings[k] = clone(draft[k]);
    saveSettings(settings); onSettingsChanged();
    dirty = false; armBack = false; note = 'Saved'; render();
  }
  function restore() {
    const d = { ...clone(DEFAULTS), binds: clone(DEFAULT_BINDS) };
    for (const k of OWNS[tab]) draft[k] = clone(d[k]);
    dirty = true; note = ''; render();
  }
  function openSettings() { draft = clone(settings); dirty = false; armBack = false; note = ''; settingsEl.classList.remove('hidden'); render(); }
  // Back: unapplied changes need a second click to throw away.
  function closeSettings(force) {
    if (dirty && !force && !armBack) { armBack = true; render(); setTimeout(() => { if (armBack) { armBack = false; render(); } }, 3500); return false; }
    settingsEl.classList.add('hidden'); draft = null; dirty = false; armBack = false; return true;
  }
  function hideSettings() { closeSettings(true); }
  addEventListener('keydown', (e) => { if (e.code === 'Escape' && draft && !settingsEl.classList.contains('hidden') && !(e.target && e.target.tagName === 'INPUT' && e.target.type !== 'range' && e.target.type !== 'checkbox')) { e.preventDefault(); e.stopPropagation(); closeSettings(); } });

  const titleMenu = title.querySelector('#title-menu');
  function setTitleItems(list) { if (list.length) titleMenu.replaceChildren(...list.map(menuButton)); }
  setTitleItems(titleItems);
  return {
    setTitleItems,
    showTitle(v) { title.classList.toggle('hidden', !v); if (!v && pause.classList.contains('hidden')) hideSettings(); },
    showPause(v) { pause.classList.toggle('hidden', !v); document.body.classList.toggle('paused', !!v); if (v) pauseInfoEl.textContent = pauseInfo?.() || ''; else if (title.classList.contains('hidden')) hideSettings(); },
    get open() { return [title, pause, settingsEl].some(e => !e.classList.contains('hidden')); },
    openSettings, closeSettings, hideSettings, applySettings: () => apply(),
    get titleShown() { return !title.classList.contains('hidden'); },
    get pauseShown() { return !pause.classList.contains('hidden'); },
    settingsOpen: () => !settingsEl.classList.contains('hidden'),
  };
}
