// Title screen, pause menu and the settings panel (FOV, sensitivity,
// rebinding, graphics, volume buses).
import { h, $ } from './dom.js';
import { ACTION_LABELS, DEFAULT_BINDS, keyLabel, saveSettings } from '../core/settings.js';

export function createMenu(root, { settings, input, onPlay, onSettingsChanged, onCleanup, items = [], titleItems = [] }) {
  const title = h('section', { id: 'scr-title', class: 'screen interactive' },
    h('div', { class: 'panel title' },
      h('h1', { class: 'logo' }, 'Rillstone'),
      h('p', { class: 'sub' }, 'Dig, wash and automate a highland claim'),
      h('div', { class: 'col' },
        h('div', { class: 'col', id: 'title-extra', style: { marginTop: 0 } }),
        h('button', { class: 'btn primary', id: 'btn-play', onclick: () => onPlay() }, 'New game'),
        h('button', { class: 'btn', onclick: () => openSettings() }, 'Settings')),
      h('p', { class: 'small' }, 'Click to look around · WASD to move · Esc for the menu')));
  const pause = h('section', { id: 'scr-pause', class: 'screen interactive hidden' },
    h('div', { class: 'panel' },
      h('h2', {}, 'Paused'),
      h('div', { class: 'col', id: 'pause-items' },
        h('button', { class: 'btn primary', onclick: () => onPlay() }, 'Resume'),
        ...items.map(it => h('button', { class: 'btn', onclick: it.onclick }, it.label)),
        h('button', { class: 'btn', onclick: () => openSettings() }, 'Settings'))));
  const settingsEl = h('section', { id: 'scr-settings', class: 'screen interactive hidden' });
  root.append(title, pause, settingsEl);

  let tab = 'general', back = null;
  function row(label, control) { return h('label', { class: 'row' }, h('span', {}, label), control); }
  function slider(key, min, max, step, fmt, obj = settings) {
    const out = h('output', {}, fmt(obj[key]));
    const inp = h('input', { type: 'range', min, max, step, value: obj[key], oninput: (e) => { obj[key] = +e.target.value; out.textContent = fmt(obj[key]); changed(); } });
    return h('span', { class: 'slider' }, inp, out);
  }
  function check(key) { return h('input', { type: 'checkbox', checked: !!settings[key], onchange: (e) => { settings[key] = e.target.checked; changed(); } }); }
  function changed() { saveSettings(settings); onSettingsChanged(); }
  function renderSettings() {
    const tabs = h('div', { class: 'tabs' }, ...['general', 'keys', 'audio'].map(t => h('button', { class: 'tab' + (t === tab ? ' on' : ''), onclick: () => { tab = t; renderSettings(); } }, t[0].toUpperCase() + t.slice(1))));
    let body;
    if (tab === 'general') body = h('div', { class: 'rows' },
      row('Field of view', slider('fov', 60, 100, 1, v => v + '°')),
      row('Mouse sensitivity', slider('sensitivity', 0.2, 3, 0.05, v => v.toFixed(2))),
      row('Invert look', check('invertY')),
      row('Sprint toggles', check('sprintToggle')),
      row('Head-bob', check('headBob')),
      row('Captions for sounds', check('captions')),
      onCleanup ? row('Tidy up', h('button', { class: 'btn', onclick: (e) => { const n = onCleanup(); e.currentTarget.textContent = `Cleared ${n}`; } }, 'Clear loose clods and piles')) : null,
      row('Graphics', h('select', { onchange: (e) => { settings.graphics = e.target.value; changed(); } }, ...['low', 'medium', 'high'].map(q => h('option', { value: q, selected: settings.graphics === q }, q[0].toUpperCase() + q.slice(1))))));
    else if (tab === 'keys') body = h('div', { class: 'rows keys' },
      ...Object.keys(ACTION_LABELS).map(a => row(ACTION_LABELS[a], h('span', { class: 'binds' }, ...[0, 1].map(i => h('button', {
        class: 'key', 'data-act': a, 'data-i': i,
        onclick: (e) => { const btn = e.currentTarget; btn.textContent = '…'; btn.classList.add('wait'); input.capture((code) => { const list = settings.binds[a].slice(); if (code !== 'Backspace') list[i] = code; else list.splice(i, 1); settings.binds[a] = list.filter(Boolean); changed(); renderSettings(); }); },
      }, keyLabel(settings.binds[a][i])))))),
      h('div', { class: 'col' }, h('p', { class: 'small' }, 'Click a key, then press the new key or mouse button. Backspace clears it.'),
        h('button', { class: 'btn', onclick: () => { settings.binds = JSON.parse(JSON.stringify(DEFAULT_BINDS)); changed(); renderSettings(); } }, 'Reset to defaults')));
    else body = h('div', { class: 'rows' }, ...Object.keys(settings.volume).map(k => row(k[0].toUpperCase() + k.slice(1), slider(k, 0, 1, 0.05, v => Math.round(v * 100) + '%', settings.volume))));
    settingsEl.replaceChildren(h('div', { class: 'panel wide' }, h('h2', {}, 'Settings'), tabs, body, h('div', { class: 'col' }, h('button', { class: 'btn primary', onclick: closeSettings }, 'Done'))));
  }
  function openSettings() { back = !title.classList.contains('hidden') ? title : pause; title.classList.add('hidden'); pause.classList.add('hidden'); settingsEl.classList.remove('hidden'); renderSettings(); }
  function closeSettings() { settingsEl.classList.add('hidden'); (back || pause).classList.remove('hidden'); }
  const extra = title.querySelector('#title-extra');
  function setTitleItems(list) { extra.replaceChildren(...list.map(it => h('button', { class: 'btn primary', onclick: it.onclick }, it.label))); title.querySelector('#btn-play').className = list.length ? 'btn' : 'btn primary'; }
  setTitleItems(titleItems);
  return {
    setTitleItems,
    showTitle(v) { title.classList.toggle('hidden', !v); },
    showPause(v) { pause.classList.toggle('hidden', !v); if (v) settingsEl.classList.add('hidden'); },
    get open() { return [title, pause, settingsEl].some(e => !e.classList.contains('hidden')); },
    openSettings, closeSettings,
    settingsOpen: () => !settingsEl.classList.contains('hidden'),
  };
}
