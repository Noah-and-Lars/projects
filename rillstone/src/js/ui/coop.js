// The Co-op page (a full screen, like Saves): your name, Host and Join
// cards, and once in a session the room code, the players and the way out.
import { h } from './dom.js';
import { iconEl } from './saves.js';

const DOTS = ['#2a8a86', '#c8902c', '#a84a3a', '#6e56a8'];

export function createCoopPage(root, o) {
  // o: { coop, net, inGame(), latestSave() -> Promise<meta|null>, hostSave(slot), onBack(), getName(), setName(n) }
  const el = h('section', { id: 'scr-coop', class: 'screen page interactive hidden' });
  root.append(el);
  let msg = '', msgKind = '', busy = false, stopArm = false;
  addEventListener('keydown', (e) => { if (e.code === 'Escape' && !el.classList.contains('hidden') && !(e.target && e.target.tagName === 'INPUT')) { e.preventDefault(); o.onBack(); } });

  const head = (sub) => h('header', { class: 'page-head' },
    h('button', { class: 'btn ghost back', onclick: () => o.onBack() }, iconEl('back'), 'Back'),
    h('div', {}, h('h2', {}, 'Co-op'), h('p', { class: 'small' }, sub)));
  const say = (text, kind = '') => { msg = text; msgKind = kind; render(); };
  const status = () => msg ? h('p', { class: 'coop-msg ' + msgKind }, msg) : null;

  async function host() {
    busy = true; say('Opening a room…');
    try {
      const c = await o.coop.host();
      busy = false;
      if (typeof c === 'string' && c.length === 5) say('');
      else say('Could not open a room. Try again in a moment.', 'err');
    } catch (_) { busy = false; say('Could not reach the online service: you may be offline, or not signed in to the Arcade.', 'err'); }
  }
  async function join(code) {
    code = String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (code.length !== 5) { say('A room code is 5 letters and numbers.', 'err'); return; }
    busy = true; say('Joining…');
    try {
      const r = await o.coop.join(code);
      busy = false;
      say(r === 'ok' ? 'Joined: loading the host’s world…' : r === 'full' ? 'That room is full (4 players).' : r === 'nohost' ? 'Nobody is hosting that room.' : 'Check the code: 5 letters and numbers.', r === 'ok' ? '' : 'err');
    } catch (_) { busy = false; say('Could not reach the online service: you may be offline, or not signed in to the Arcade.', 'err'); }
  }

  async function render() {
    if (el.classList.contains('hidden')) return;
    const role = o.coop.role;
    if (role === 'off') return renderOff();
    const members = o.net.members;
    const players = h('div', { class: 'players' }, ...members.map((m, i) => h('div', { class: 'player' },
      h('i', { class: 'dot', style: { background: DOTS[i % DOTS.length] } }),
      h('b', {}, m.n || 'Miner'),
      m.id === o.net.id ? h('span', { class: 'tag' }, 'you') : null,
      h('span', { class: 'pill' }, m.h ? 'Host' : 'Guest'))),
      ...Array.from({ length: Math.max(0, 4 - members.length) }, () => h('div', { class: 'player empty' }, h('i', { class: 'dot' }), h('span', {}, 'Free seat'))));
    const leaveLabel = role === 'host' ? 'Stop hosting' : 'Leave';
    const leave = h('button', { class: 'btn ' + (stopArm ? 'danger' : ''), onclick: () => {
      if (!stopArm) { stopArm = true; render(); setTimeout(() => { stopArm = false; render(); }, 3500); return; }
      o.coop.leave(); location.reload();
    } }, stopArm ? (role === 'host' ? 'Click again: guests go home' : 'Click again to leave') : leaveLabel);
    const codeBox = role === 'host' ? h('div', { class: 'room-code' },
      h('span', {}, 'Room code'), h('b', {}, o.net.room || '-----'),
      h('button', { class: 'btn small-btn', onclick: async (e) => { try { await navigator.clipboard.writeText(o.net.room); e.currentTarget.textContent = 'Copied'; } catch (_) { e.currentTarget.textContent = 'Copy it by hand'; } } }, 'Copy')) : null;
    el.replaceChildren(h('div', { class: 'page-inner narrow' },
      head(role === 'host' ? 'You are hosting: your browser runs the world, and your save keeps it.' : `You are in ${o.net.host()?.n || 'the host'}’s world.`),
      h('div', { class: 'coop-card' },
        codeBox,
        role === 'host' ? h('p', { class: 'small' }, 'Send the code to up to 3 friends. They pick Co-op → Join and type it in.') : null,
        h('h3', {}, `Players · ${members.length} of 4`), players,
        status(),
        h('div', { class: 'coop-actions' }, h('button', { class: 'btn primary', onclick: () => o.onBack() }, o.inGame() ? 'Back to the game' : 'Back'), leave),
        h('p', { class: 'small' }, role === 'host' ? 'Save before you stop: guests are sent home, and the world stays in your save.' : 'Leaving takes you back to the title; the world stays in the host’s save.'))));
  }

  async function renderOff() {
    const name = h('input', { class: 'name-input', value: o.getName(), maxlength: 16, placeholder: 'Your name', onchange: (e) => { o.setName(e.target.value); e.target.value = o.getName(); }, onkeydown: (e) => e.stopPropagation() });
    const code = h('input', { class: 'code-input', maxlength: 5, placeholder: 'CODE', autocomplete: 'off', spellcheck: 'false', oninput: (e) => { e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''); }, onkeydown: (e) => { e.stopPropagation(); if (e.key === 'Enter') join(code.value); } });
    const inGame = o.inGame();
    const latest = inGame ? null : await o.latestSave();
    const hostCard = h('div', { class: 'coop-option' },
      h('h3', {}, 'Host'),
      h('p', { class: 'small' }, inGame ? 'Open this world to up to 3 friends. Your browser runs it, and your save keeps it.' : 'Pick the world to open to friends. Your browser runs it, and your save keeps it.'),
      inGame ? h('button', { class: 'btn primary', disabled: busy, onclick: () => host() }, 'Host this world')
        : latest ? h('button', { class: 'btn primary', disabled: busy, onclick: () => o.hostSave(latest.slot) }, `Host “${latest.name || `Claim ${latest.slot}`}”`)
          : h('p', { class: 'small' }, 'Start a new game first, then host it from the pause menu.'),
      !inGame && latest ? h('p', { class: 'small' }, 'Or load another save, then host from the pause menu (Esc → Co-op).') : null);
    const joinCard = h('div', { class: 'coop-option' },
      h('h3', {}, 'Join'),
      h('p', { class: 'small' }, inGame ? 'Leave this world and join a friend’s. Save first!' : 'Type the 5-letter code your friend gives you.'),
      h('div', { class: 'join-row' }, code, h('button', { class: 'btn primary', disabled: busy, onclick: () => join(code.value) }, 'Join')));
    el.replaceChildren(h('div', { class: 'page-inner narrow' },
      head('Play together: up to 4 players in one world.'),
      h('div', { class: 'coop-card' },
        h('label', { class: 'field' }, h('span', {}, 'Your name'), name),
        h('div', { class: 'coop-options' }, hostCard, joinCard),
        status(),
        h('p', { class: 'small' }, 'Online play needs an Arcade account. The host’s computer runs the world: the smoother their connection, the better.'))));
  }

  return {
    el,
    get open() { return !el.classList.contains('hidden'); },
    show() { msg = ''; stopArm = false; el.classList.remove('hidden'); return render(); },
    hide() { el.classList.add('hidden'); },
    refresh: () => render(),
  };
}
