// The Multiplayer page: six slots for shared worlds. Anyone who has joined a
// world can reopen it from here, even when the one who made it is offline:
// if someone is already in it you join them, otherwise you open the last
// save and others can join you. The world's owner can delete it for
// everyone; anyone else can only take it out of their own slots.
import { h } from './dom.js';
import { iconEl, ago } from './saves.js';

export function createMpPage(root, o) {
  // o: { mp, onBack(), onOpen(id), onNew(slot, name), onJoinCode(code), status() -> string|null, myName() }
  const el = h('section', { id: 'scr-mp', class: 'screen page interactive hidden' });
  root.append(el);
  let metas = {}, loading = false, msg = '', msgKind = '', confirm = null, naming = null, nameVal = '', busy = false;
  addEventListener('keydown', (e) => { if (e.code === 'Escape' && !el.classList.contains('hidden') && !(e.target && e.target.tagName === 'INPUT')) { e.preventDefault(); if (naming != null) { naming = null; render(); } else o.onBack(); } });
  const fmt = (n) => Math.floor(n || 0).toLocaleString('en-GB');
  const say = (t, k = '') => { msg = t; msgKind = k; render(); };

  async function refresh() {
    const ids = o.mp.slots().filter(Boolean);
    if (!ids.length || !o.mp.available() || !o.mp.signedIn()) { metas = {}; render(); return; }
    loading = true; render();
    try { metas = (await o.mp.metas(ids)).worlds || {}; } catch (_) { say('Could not reach the Rillstone server: you may be offline.', 'err'); }
    loading = false; render();
  }
  async function act(fn) { if (busy) return; busy = true; render(); try { await fn(); } catch (e) { say(e.code === 'owner' ? 'Only the world’s owner can do that.' : 'That didn’t work: the server may be unreachable. Try again.', 'err'); } busy = false; confirm = null; await refresh(); }

  function card(i, id) {
    const m = id ? metas[id] : null;
    const body = h('div', { class: 'slot-body' });
    const pic = h('div', { class: 'slot-pic mp-pic' + (id ? '' : ' empty') }, h('span', { class: 'slot-no' }, `Slot ${i + 1}`));
    if (!id) {
      pic.append(h('span', {}, 'Empty slot'));
      if (naming === i) {
        const inp = h('input', { class: 'name-input', value: nameVal, maxlength: 40, placeholder: 'Name your world', oninput: (e) => { nameVal = e.target.value; }, onkeydown: (e) => { e.stopPropagation(); if (e.key === 'Enter') start(); } });
        const start = () => { const n = (nameVal || '').trim() || `${o.myName()}'s claim`; naming = null; o.onNew(i, n); };
        body.append(h('b', { class: 'slot-name' }, 'New multiplayer world'), h('div', { class: 'rename' }, inp, h('button', { class: 'btn primary', onclick: start }, 'Start')), h('p', { class: 'small' }, 'A fresh valley. You own it; friends join with its room code, and can reopen it any time after.'));
        setTimeout(() => inp.focus(), 0);
      } else body.append(h('b', { class: 'slot-name muted' }, 'Free'), h('p', { class: 'small' }, 'Start a new multiplayer world here, or join a friend’s with their room code below.'),
        h('div', { class: 'slot-actions' }, h('button', { class: 'btn primary', disabled: !o.mp.available() || !o.mp.signedIn() || busy, onclick: () => { naming = i; nameVal = ''; render(); } }, iconEl('plus'), 'New multiplayer world')));
      return h('div', { class: 'slot is-empty' }, pic, body);
    }
    if (!m) { body.append(h('b', { class: 'slot-name' }, loading ? 'Loading…' : 'Multiplayer world'), h('p', { class: 'small' }, loading ? '' : 'Details show once the Rillstone server answers.'), h('div', { class: 'slot-actions' }, h('button', { class: 'btn', onclick: () => { o.mp.setSlot(i, null); render(); } }, iconEl('trash'), 'Remove from my slots'))); return h('div', { class: 'slot' }, pic, body); }
    if (m.gone || m.removed) {
      pic.append(h('span', {}, m.gone ? 'Deleted' : 'Not in it'));
      body.append(h('b', { class: 'slot-name muted' }, m.gone ? 'Deleted by its owner' : 'You’re no longer in this world'), h('p', { class: 'small' }, m.gone ? 'The world’s owner deleted it for everyone.' : 'You left it (perhaps on another device).'),
        h('div', { class: 'slot-actions' }, h('button', { class: 'btn', onclick: () => { o.mp.setSlot(i, null); render(); } }, iconEl('trash'), 'Clear this slot')));
      return h('div', { class: 'slot' }, pic, body);
    }
    pic.append(h('span', { class: 'mp-code' }, h('small', {}, 'Room code'), h('b', {}, o.mp.roomCode(id))));
    if (m.isOwner) pic.append(h('span', { class: 'slot-cur' }, 'Your world'));
    body.append(h('b', { class: 'slot-name' }, m.name),
      h('div', { class: 'slot-stats' },
        h('span', { title: 'Day' }, h('b', {}, `Day ${m.day || 1}`)),
        h('span', { title: 'Shared cash: everyone in the world adds to one pot' }, `§ ${fmt(m.scrip)} shared`),
        h('span', { title: 'Ores sold' }, `${fmt(m.ores)} ores sold`),
        h('span', { title: m.members.join(', ') }, `${m.members.length} player${m.members.length > 1 ? 's' : ''}`)),
      h('p', { class: 'small when' }, `${m.isOwner ? 'You made it' : `Made by ${m.owner}`} · ${m.members.join(', ')} · saved ${ago(m.savedAt)}`));
    if (confirm === i) {
      body.append(h('div', { class: 'confirm' }, h('span', {}, m.isOwner ? `Delete “${m.name}” for everyone? Nobody will be able to open it again.` : `Take “${m.name}” out of your slots? You’d need its room code (and someone in it) to join again.`),
        h('button', { class: 'btn danger', onclick: () => act(async () => { if (m.isOwner) await o.mp.remove(id); else await o.mp.leave(id); o.mp.setSlot(i, null); say(m.isOwner ? `Deleted “${m.name}”.` : `Removed you from “${m.name}”.`); }) }, m.isOwner ? 'Delete for everyone' : 'Remove me'),
        h('button', { class: 'btn', onclick: () => { confirm = null; render(); } }, 'Keep it')));
    } else body.append(h('div', { class: 'slot-actions' },
      h('button', { class: 'btn primary', disabled: busy || !o.mp.available(), onclick: () => o.onOpen(id) }, iconEl('load'), 'Play'),
      m.isOwner ? h('button', { class: 'btn icon-btn danger', onclick: () => { confirm = i; render(); } }, iconEl('trash'), h('span', {}, 'Delete game'))
        : h('button', { class: 'btn icon-btn', onclick: () => { confirm = i; render(); } }, iconEl('trash'), h('span', {}, 'Remove me'))));
    return h('div', { class: 'slot' }, pic, body);
  }
  function render() {
    if (el.classList.contains('hidden')) return;
    const why = o.status();
    const code = h('input', { class: 'code-input', maxlength: 5, placeholder: 'CODE', autocomplete: 'off', spellcheck: 'false', oninput: (e) => { e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''); }, onkeydown: (e) => { e.stopPropagation(); if (e.key === 'Enter') o.onJoinCode(code.value); } });
    el.replaceChildren(h('div', { class: 'page-inner' },
      h('header', { class: 'page-head' }, h('button', { class: 'btn ghost back', onclick: () => o.onBack() }, iconEl('back'), 'Back'),
        h('div', {}, h('h2', {}, 'Multiplayer'), h('p', { class: 'small' }, 'Shared worlds for up to 4 players. Anyone who has joined can reopen one, even when its owner is offline; cash is shared by everyone in it.'))),
      why ? h('p', { class: 'coop-msg err' }, why) : null,
      msg ? h('p', { class: 'coop-msg ' + msgKind }, msg) : null,
      h('div', { class: 'slot-grid' }, ...o.mp.slots().map((id, i) => card(i, id))),
      h('div', { class: 'coop-card mp-join' }, h('h3', {}, 'Join a friend’s world'), h('p', { class: 'small' }, 'Type the room code shown on their slot. Once you’ve joined, the world is saved to one of your slots and you can reopen it any time.'),
        h('div', { class: 'join-row' }, code, h('button', { class: 'btn primary', disabled: !o.mp.signedIn(), onclick: () => o.onJoinCode(code.value) }, 'Join')))));
  }
  return {
    el,
    get open() { return !el.classList.contains('hidden'); },
    show() { msg = ''; confirm = null; naming = null; el.classList.remove('hidden'); render(); return refresh(); },
    hide() { el.classList.add('hidden'); },
    refresh, say,
  };
}
