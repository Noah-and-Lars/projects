// The Leaderboard page (a full screen, like Saves and Co-op): every player
// seen online, ranked by their Scrip, with ores sold beside it and a View
// base button that shows a picture of their base from above.
import { h } from './dom.js';
import { iconEl, ago } from './saves.js';

export function createLeaderboardPage(root, o) {
  // o: { board, onBack(), status() -> null | string (why you aren't listed) }
  const el = h('section', { id: 'scr-board', class: 'screen page interactive hidden' });
  root.append(el);
  let viewing = null; // { row, url | null | 'wait' }
  addEventListener('keydown', (e) => { if (e.code === 'Escape' && !el.classList.contains('hidden')) { e.preventDefault(); if (viewing) { viewing = null; render(); } else o.onBack(); } });
  const fmt = (n) => Math.floor(n || 0).toLocaleString('en-GB');

  function render() {
    if (el.classList.contains('hidden')) return;
    const rows = o.board.rows, why = o.status();
    const head = h('header', { class: 'page-head' },
      h('button', { class: 'btn ghost back', onclick: () => o.onBack() }, iconEl('back'), 'Back'),
      h('div', {}, h('h2', {}, 'Leaderboard'), h('p', { class: 'small' }, 'Miners ranked by their Scrip, with the ores they have sold.')));
    const table = rows.length ? h('div', { class: 'lb-table' },
      h('div', { class: 'lb-row lb-head' }, h('span', {}, '#'), h('span', {}, 'Arcade name'), h('span', { class: 'num' }, 'Scrip'), h('span', { class: 'num' }, 'Ores sold'), h('span', {}, '')),
      ...rows.map((r, i) => h('div', { class: 'lb-row' + (r.me ? ' me' : '') + (i < 3 ? ' top' + (i + 1) : '') },
        h('span', { class: 'rank' }, String(i + 1)),
        h('span', { class: 'who' }, h('i', { class: 'dot' + (r.online ? ' on' : ''), title: r.online ? 'Online now' : 'Offline' }), h('b', {}, r.name), r.me ? h('span', { class: 'tag' }, 'you') : null, h('small', {}, r.online ? `online · day ${r.day}` : `seen ${ago(r.seenAt)}`)),
        h('span', { class: 'num' }, `§ ${fmt(r.scrip)}`),
        h('span', { class: 'num' }, `${fmt(r.ores)}`, h("small", {}, ` · ${(r.kg || 0).toFixed((r.kg || 0) >= 100 ? 0 : 1)} kg`)),
        h('span', {}, h('button', { class: 'btn small-btn' + (r.online ? '' : ' off'), disabled: !r.online && !r.me, title: r.online || r.me ? 'See their base from above' : 'They need to be online', onclick: () => view(r) }, 'View base')))))
      : h('p', { class: 'small lb-empty' }, o.board.on ? 'Nobody else is on the board yet. Players appear here while they play with an Arcade account.' : 'Connecting…');
    const note = why ? h('p', { class: 'coop-msg err' }, why) : null;
    const overlay = viewing ? h('div', { class: 'lb-view', onclick: (e) => { if (e.target === e.currentTarget) { viewing = null; render(); } } },
      h('div', { class: 'lb-view-card' },
        h('div', { class: 'lb-view-head' }, h('b', {}, `${viewing.row.name}${viewing.row.name.endsWith('s') ? '’' : '’s'} base`), h('button', { class: 'btn small-btn', onclick: () => { viewing = null; render(); } }, 'Close')),
        viewing.url === 'wait' ? h('div', { class: 'lb-pic wait' }, 'Asking their game for a picture…')
          : viewing.url ? h('img', { class: 'lb-pic', src: viewing.url, alt: `${viewing.row.name}'s base from above` })
            : h('div', { class: 'lb-pic wait' }, 'No answer: they may have just gone offline. Try again in a moment.'),
        h('p', { class: 'small' }, `§ ${fmt(viewing.row.scrip)} · ${fmt(viewing.row.ores)} ores sold · day ${viewing.row.day}`))) : null;
    el.replaceChildren(h('div', { class: 'page-inner narrow lb' }, head, note, h('div', { class: 'coop-card' }, table,
      h('p', { class: 'small' }, 'Sandbox games and co-op guests aren’t listed. Players who aren’t online show their last-seen numbers.'))), overlay);
  }
  async function view(row) {
    viewing = { row, url: 'wait' }; render();
    const url = await o.board.viewBase(row);
    if (viewing && viewing.row === row) { viewing.url = url || null; render(); }
  }
  o.board.onChange = () => render();
  return {
    el,
    get open() { return !el.classList.contains('hidden'); },
    show() { viewing = null; el.classList.remove('hidden'); o.board.refresh(); render(); },
    hide() { el.classList.add('hidden'); viewing = null; },
    refresh: () => render(),
  };
}
