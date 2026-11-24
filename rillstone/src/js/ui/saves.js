// The Saves page and the New game page (full screens, not panels).
//
// Saves: one card per slot with a picture, the save's name, day, Scrip,
// claims, play time and when it was saved. Cards have Load,
// Save here (in a game), Rename, Export, Import and Delete (which asks
// first). "Show backups" reveals each slot's older copy (the other half of
// its A/B pair), which can be loaded too.
// New game: name the save and pick a slot (an empty one by default; taking
// a used one says what it replaces).
import { h } from './dom.js';

const ICON = {
  load: 'M8 5v14l11-7z',
  save: 'M5 3h11l3 3v15H5zM8 3v6h8V3M8 21v-7h8v7',
  rename: 'M4 20h4L19 9l-4-4L4 16zM14 6l4 4',
  export: 'M12 3v12M7 10l5 5 5-5M5 21h14',
  import: 'M12 15V3M7 8l5-5 5 5M5 21h14',
  trash: 'M5 7h14M10 7V4h4v3M7 7l1 14h8l1-14',
  back: 'M15 5l-7 7 7 7',
  plus: 'M12 5v14M5 12h14',
};
const icon = (name) => {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('class', 'ico'); svg.setAttribute('aria-hidden', 'true');
  const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  p.setAttribute('d', ICON[name]); svg.append(p);
  return svg;
};
export const iconEl = icon;
export function ago(t) {
  const s = Math.max(0, (Date.now() - t) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  const d = Math.floor(s / 86400);
  return d === 1 ? 'yesterday' : d < 30 ? `${d} days ago` : new Date(t).toLocaleDateString();
}
const when = (t) => new Date(t).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: new Date(t).getFullYear() === new Date().getFullYear() ? undefined : 'numeric', hour: '2-digit', minute: '2-digit' });
export const playTime = (sec) => { const m = Math.floor((sec || 0) / 60); return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${m % 60} min`; };
const fmt = (n) => Math.floor(n || 0).toLocaleString('en-GB');

export function createSavesPage(root, o) {
  // o: { saves, inGame(), canSave(), current(), onLoad(slot, half), onSave(slot), onNew(slot, name),
  //      onExport(slot), onImport(slot, file), onDeleted(slot), onRenamed(slot, name), onBack() }
  const el = h('section', { id: 'scr-saves', class: 'screen page interactive hidden' });
  root.append(el);
  let showBackups = false, confirmDel = null, renaming = null, busy = false, armLoad = null, newFromSaves = false;
  const fileIn = h('input', { type: 'file', accept: '.rillsave', style: { display: 'none' } });
  let importSlot = null;
  fileIn.onchange = async (e) => { const f = e.target.files[0]; fileIn.value = ''; if (f && importSlot != null) { await o.onImport(importSlot, f); render(); } };
  el.append(fileIn);
  // Esc goes back (a rename in progress handles its own Esc).
  // New game opened from the Saves page goes back there; otherwise out.
  const goBack = () => { if (mode === 'new' && newFromSaves) { newFromSaves = false; api.show('saves'); } else o.onBack(); };
  addEventListener('keydown', (e) => { if (e.code === 'Escape' && !el.classList.contains('hidden') && renaming == null) { e.preventDefault(); goBack(); } });

  const head = (title, sub) => h('header', { class: 'page-head' },
    h('button', { class: 'btn ghost back', onclick: () => goBack() }, icon('back'), 'Back'),
    h('div', {}, h('h2', {}, title), sub ? h('p', { class: 'small' }, sub) : null));

  function stats(m) {
    return h('div', { class: 'slot-stats' },
      h('span', { title: 'Day' }, h('b', {}, `Day ${m.day ?? 1}`)),
      h('span', { title: 'Scrip' }, `§ ${fmt(m.scrip)}`),
      m.claims ? h('span', { title: 'Claims owned' }, `${m.claims} claim${m.claims > 1 ? 's' : ''}`) : null,
      h('span', { title: 'Time played' }, playTime(m.playTime)));
  }
  const tool = (name, label, onclick, extra = {}) => h('button', { class: 'btn icon-btn' + (extra.danger ? ' danger' : ''), title: label, 'aria-label': label, onclick, disabled: !!extra.disabled }, icon(name), h('span', {}, label));

  function card(m) {
    const cur = o.current() === m.slot, inGame = o.inGame(), canSave = o.canSave();
    const pic = m.empty ? h('div', { class: 'slot-pic empty' }, h('span', {}, 'Empty slot'))
      : h('div', { class: 'slot-pic', style: m.thumb ? { backgroundImage: `url(${m.thumb})` } : {} }, m.thumb ? null : h('span', {}, 'No picture yet'));
    pic.append(h('span', { class: 'slot-no' }, `Slot ${m.slot}`));
    if (cur && inGame) pic.append(h('span', { class: 'slot-cur' }, 'Playing'));
    const body = h('div', { class: 'slot-body' });
    if (m.empty) {
      body.append(h('b', { class: 'slot-name muted' }, 'Free'), h('p', { class: 'small' }, inGame ? 'Save your game here to keep a copy.' : 'Start a new claim here, or import a .rillsave file.'));
      const actions = h('div', { class: 'slot-actions' });
      if (inGame) actions.append(h('button', { class: 'btn primary', disabled: !canSave || busy, onclick: () => act(() => o.onSave(m.slot)) }, icon('save'), 'Save here'));
      else actions.append(h('button', { class: 'btn primary', onclick: () => { newFromSaves = true; api.show('new', m.slot, true); } }, icon('plus'), 'New game here'));
      actions.append(tool('import', 'Import', () => { importSlot = m.slot; fileIn.click(); }));
      body.append(actions);
    } else {
      if (renaming === m.slot) {
        const inp = h('input', { class: 'name-input', value: m.name || `Claim ${m.slot}`, maxlength: 40, onkeydown: (e) => { if (e.key === 'Enter') done(); if (e.key === 'Escape') { renaming = null; render(); } e.stopPropagation(); } });
        const done = async () => { const n = await o.saves.rename(m.slot, inp.value); o.onRenamed(m.slot, n); renaming = null; render(); };
        body.append(h('div', { class: 'rename' }, inp, h('button', { class: 'btn primary', onclick: done }, 'OK')));
        setTimeout(() => { inp.focus(); inp.select(); }, 0);
      } else body.append(h('b', { class: 'slot-name' }, m.name || `Claim ${m.slot}`));
      body.append(stats(m), h('p', { class: 'small when' }, `Saved ${ago(m.savedAt)} · ${when(m.savedAt)}`));
      if (confirmDel === m.slot) {
        body.append(h('div', { class: 'confirm' }, h('span', {}, `Delete “${m.name || `Claim ${m.slot}`}” and its backup for good?`),
          h('button', { class: 'btn danger', onclick: () => act(async () => { await o.saves.remove(m.slot); o.onDeleted(m.slot); confirmDel = null; }) }, 'Delete'),
          h('button', { class: 'btn', onclick: () => { confirmDel = null; render(); } }, 'Keep it')));
      } else {
        const actions = h('div', { class: 'slot-actions' },
          h('button', { class: 'btn primary' + (armLoad === m.slot ? ' danger' : ''), disabled: busy, onclick: () => {
            // In a game, loading drops what isn't saved: ask once.
            if (inGame && armLoad !== m.slot) { armLoad = m.slot; render(); setTimeout(() => { if (armLoad === m.slot) { armLoad = null; render(); } }, 4000); return; }
            o.onLoad(m.slot);
          } }, icon('load'), armLoad === m.slot ? 'Unsaved progress is lost: load?' : cur && inGame ? 'Reload' : 'Load'));
        if (inGame) actions.append(h('button', { class: 'btn', disabled: !canSave || busy, onclick: () => act(() => o.onSave(m.slot)) }, icon('save'), cur ? 'Save' : 'Save here'));
        actions.append(
          tool('rename', 'Rename', () => { renaming = m.slot; render(); }),
          tool('export', 'Export', () => o.onExport(m.slot)),
          tool('import', 'Import', () => { importSlot = m.slot; fileIn.click(); }),
          tool('trash', 'Delete', () => { confirmDel = m.slot; render(); }, { danger: true }));
        body.append(actions);
      }
      if (showBackups) {
        body.append(m.backup
          ? h('div', { class: 'backup' }, h('span', {}, `Backup: day ${m.backup.day ?? 1} · § ${fmt(m.backup.scrip)} · ${ago(m.backup.savedAt)}`), h('button', { class: 'btn small-btn', onclick: () => o.onLoad(m.slot, 'backup') }, 'Load backup'))
          : h('div', { class: 'backup muted' }, 'No backup yet: it appears after the next save.'));
      }
    }
    return h('article', { class: 'slot' + (m.empty ? ' is-empty' : '') + (cur && inGame ? ' is-current' : '') }, pic, body);
  }
  async function act(fn) { busy = true; render(); try { await fn(); } finally { busy = false; render(); } }

  async function render() {
    if (mode === 'new') return renderNew();
    const list = await o.saves.list();
    const inGame = o.inGame();
    el.replaceChildren(h('div', { class: 'page-inner' },
      head('Saves', inGame ? (o.canSave() ? 'Your game autosaves every 3 minutes to the slot you are playing.' : 'In a co-op game the host’s save keeps the world.') : 'Pick up where you left off, or manage your saved claims.'),
      h('div', { class: 'slot-grid' }, ...list.map(card)),
      h('footer', { class: 'page-foot' },
        h('label', { class: 'toggle' }, h('input', { type: 'checkbox', checked: showBackups, onchange: (e) => { showBackups = e.target.checked; render(); } }), h('span', {}, 'Show backups')),
        h('span', { class: 'small' }, 'Each slot keeps the save before last as a backup. Export copies a slot to a .rillsave file; Import puts one into a slot.'))));
  }

  // ---- New game: a name and a slot ----
  let mode = 'saves', pick = null, nameVal = '';
  async function renderNew() {
    const list = await o.saves.list();
    if (pick == null) pick = (list.find(m => m.empty) || list.slice().sort((a, b) => a.savedAt - b.savedAt)[0]).slot;
    if (!nameVal) nameVal = `Claim ${pick}`;
    const chosen = list.find(m => m.slot === pick);
    const inp = h('input', { class: 'name-input big', value: nameVal, maxlength: 40, placeholder: 'Name your claim', oninput: (e) => { nameVal = e.target.value; }, onkeydown: (e) => { e.stopPropagation(); if (e.key === 'Enter') start(); } });
    const start = () => o.onNew(pick, (nameVal || '').trim() || `Claim ${pick}`);
    el.replaceChildren(h('div', { class: 'page-inner narrow' },
      head('New game', 'A fresh valley: a starter claim on the Gravel Bar, a pan, a shovel and an old hauler.'),
      h('div', { class: 'new-form' },
        h('label', { class: 'field' }, h('span', {}, 'Name'), inp),
        h('div', { class: 'field' }, h('span', {}, 'Save slot'),
          h('div', { class: 'slot-pick' }, ...list.map(m => h('button', {
            class: 'pick' + (m.slot === pick ? ' on' : '') + (m.empty ? '' : ' used'),
            onclick: () => { if (nameVal === `Claim ${pick}`) nameVal = `Claim ${m.slot}`; pick = m.slot; renderNew(); },
          }, h('b', {}, `Slot ${m.slot}`), h('span', {}, m.empty ? 'Free' : `${m.name || 'Claim'} · day ${m.day}`))))),
        chosen && !chosen.empty ? h('p', { class: 'warn' }, `Starting here replaces “${chosen.name || `Claim ${chosen.slot}`}” (day ${chosen.day}) once the game first saves. Its backup goes too.`) : null,
        h('button', { class: 'btn primary big', onclick: start }, 'Start')),
    ));
    setTimeout(() => inp.focus(), 0);
  }

  const api = {
    el,
    get open() { return !el.classList.contains('hidden'); },
    show(m = 'saves', slot = null, keepFrom = false) {
      mode = m === 'new' ? 'new' : 'saves'; pick = slot; nameVal = ''; confirmDel = null; renaming = null; armLoad = null;
      if (!keepFrom) newFromSaves = false;
      // Something to see at once: reading saves can take a moment.
      el.replaceChildren(h('div', { class: 'page-inner' + (mode === 'new' ? ' narrow' : '') }, head(mode === 'new' ? 'New game' : 'Saves', 'Reading your saves…')));
      el.classList.remove('hidden'); return render();
    },
    hide() { el.classList.add('hidden'); },
    refresh: () => render(),
  };
  return api;
}
