// The Leaderboard page (a full screen, like Saves and Co-op), with two tabs:
// Solo (players by Arcade name) and Multiplayer (worlds, with how many
// players are in each; a world's Scrip is shared by everyone in it). Both
// rank by Scrip, show ores sold, and have a View plot button that shows a
// picture of the plot from above.
import { h } from './dom.js';
import { iconEl, ago } from './saves.js';

export function createLeaderboardPage(root, o) {
  // o: { board, onBack(), status() -> null | string (why you aren't listed) }
  const el = h('section', { id: 'scr-board', class: 'screen page interactive hidden' });
  root.append(el);
  let viewing = null, tab = 'solo'; // viewing: { row, url | null | 'wait' }
  addEventListener('keydown', (e) => { if (e.code === 'Escape' && !el.classList.contains('hidden')) { e.preventDefault(); if (viewing) { viewing = null; render(); } else o.onBack(); } });
  const fmt = (n) => Math.floor(n || 0).toLocaleString('en-GB');
  const kgTxt = (kg) => ` · ${(kg || 0).toFixed((kg || 0) >= 100 ? 0 : 1)} kg`;
  const seen = (r) => (r.online ? `online · day ${r.day}` : r.seenAt ? `seen ${ago(r.seenAt)}` : `day ${r.day}`);
  const plotBtn = (r) => h('button', { class: 'btn small-btn', title: 'See their plot from above', onclick: () => view(r) }, 'View plot');

  function soloTable(rows) {
    if (!rows.length) return h('p', { class: 'small lb-empty' }, o.board.on ? 'Nobody is on the solo board yet. Players appear here while they play with an Arcade account.' : 'Connecting…');
    return h('div', { class: 'lb-table' },
      h('div', { class: 'lb-row lb-head' }, h('span', {}, '#'), h('span', {}, 'Arcade name'), h('span', { class: 'num' }, 'Cash'), h('span', { class: 'num' }, 'Ores sold'), h('span', {}, '')),
      ...rows.map((r, i) => h('div', { class: 'lb-row' + (r.me ? ' me' : '') + (i < 3 ? ' top' + (i + 1) : '') },
        h('span', { class: 'rank' }, String(i + 1)),
        h('span', { class: 'who' }, h('i', { class: 'dot' + (r.online ? ' on' : ''), title: r.online ? 'Online now' : 'Offline' }), h('b', {}, r.name), r.me ? h('span', { class: 'tag' }, 'you') : null, h('small', {}, seen(r))),
        h('span', { class: 'num' }, `§ ${fmt(r.scrip)}`),
        h('span', { class: 'num' }, fmt(r.ores), h('small', {}, kgTxt(r.kg))),
        h('span', {}, plotBtn(r)))));
  }
  function mpTable(rows) {
    if (!rows.length) return h('p', { class: 'small lb-empty' }, 'No multiplayer worlds on the board yet. Start one from Multiplayer on the title screen.');
    return h('div', { class: 'lb-table' },
      h('div', { class: 'lb-row lb-head mp' }, h('span', {}, '#'), h('span', {}, 'World'), h('span', { class: 'num' }, 'Players'), h('span', { class: 'num' }, 'Shared cash'), h('span', { class: 'num' }, 'Ores sold'), h('span', {}, '')),
      ...rows.map((r, i) => h('div', { class: 'lb-row mp' + (r.me ? ' me' : '') + (i < 3 ? ' top' + (i + 1) : '') },
        h('span', { class: 'rank' }, String(i + 1)),
        h('span', { class: 'who' }, h('i', { class: 'dot' + (r.online ? ' on' : ''), title: r.online ? 'Being played now' : 'Nobody in it right now' }), h('b', {}, r.name), r.me ? h('span', { class: 'tag' }, 'yours') : null, h('small', {}, `${r.host ? `by ${r.host} · ` : ''}${seen(r)}`)),
        h('span', { class: 'num', title: (r.members || []).join(', ') }, `${r.players || 1}`, h('small', {}, (r.players || 1) === 1 ? ' player' : ' players')),
        h('span', { class: 'num' }, `§ ${fmt(r.scrip)}`),
        h('span', { class: 'num' }, fmt(r.ores), h('small', {}, kgTxt(r.kg))),
        h('span', {}, plotBtn(r)))));
  }
  function render() {
    if (el.classList.contains('hidden')) return;
    const why = o.status();
    const head = h('header', { class: 'page-head' },
      h('button', { class: 'btn ghost back', onclick: () => o.onBack() }, iconEl('back'), 'Back'),
      h('div', {}, h('h2', {}, 'Leaderboard'), h('p', { class: 'small' }, tab === 'solo' ? 'Solo miners ranked by their cash, with the ores they have sold.' : 'Multiplayer worlds ranked by their shared cash: everyone in a world adds to one pot.')));
    const tabs = h('div', { class: 'lb-tabs' }, ...[['solo', 'Solo'], ['mp', 'Multiplayer']].map(([k, l]) => h('button', { class: 'tab' + (tab === k ? ' on' : ''), 'data-tab': k, onclick: () => { tab = k; render(); } }, l)));
    const note = why ? h('p', { class: 'coop-msg err' }, why) : null;
    const overlay = viewing ? h('div', { class: 'lb-view', onclick: (e) => { if (e.target === e.currentTarget) { viewing = null; render(); } } },
      h('div', { class: 'lb-view-card' },
        h('div', { class: 'lb-view-head' }, h('b', {}, `${viewing.row.name}${viewing.row.name.endsWith('s') ? '’' : '’s'} plot`), h('button', { class: 'btn small-btn', onclick: () => { viewing = null; render(); } }, 'Close')),
        viewing.url === 'wait' ? h('div', { class: 'lb-pic wait' }, 'Fetching a picture of the plot…')
          : viewing.url ? h('img', { class: 'lb-pic', src: viewing.url, alt: `${viewing.row.name}'s plot from above` })
            : h('div', { class: 'lb-pic wait' }, 'No picture yet: they may have just gone offline, or never been online since pictures were kept. Try again later.'),
        h('p', { class: 'small' }, `${viewing.row.world ? `${viewing.row.players || 1} player${(viewing.row.players || 1) === 1 ? '' : 's'} · ` : ''}§ ${fmt(viewing.row.scrip)} · ${fmt(viewing.row.ores)} ores sold · day ${viewing.row.day}`))) : null;
    el.replaceChildren(h('div', { class: 'page-inner narrow lb' }, head, tabs, note, h('div', { class: 'coop-card' },
      tab === 'solo' ? soloTable(o.board.rows) : mpTable(o.board.mpRows),
      h('p', { class: 'small' }, tab === 'solo' ? 'Sandbox games aren’t listed. Players who aren’t online show their last numbers.' : 'A world’s cash is shared by all its players. Worlds nobody is in right now show their last save.'))), overlay);
  }
  async function view(row) {
    viewing = { row, url: 'wait' }; render();
    const url = await o.board.viewPlot(row);
    if (viewing && viewing.row === row) { viewing.url = url || null; render(); }
  }
  o.board.onChange = () => render();
  return {
    el,
    get open() { return !el.classList.contains('hidden'); },
    get tab() { return tab; },
    setTab(t) { tab = t === 'mp' ? 'mp' : 'solo'; render(); },
    show(t) { viewing = null; if (t) tab = t; el.classList.remove('hidden'); o.board.refresh(); render(); },
    hide() { el.classList.add('hidden'); viewing = null; },
    refresh: () => render(),
  };
}
