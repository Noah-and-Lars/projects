// Where bug reports go. Split up so simple spam bots scanning the page don't pick it up.
window.CONTACT_EMAIL = ['jimmyscafe1000', 'gmail.com'].join('@');

// Fills in any "Email us" link on the page, with an optional subject line
window.fillContact = (subject) => {
  for (const a of document.querySelectorAll('.contact')) {
    a.textContent = CONTACT_EMAIL;
    a.href = 'mailto:' + CONTACT_EMAIL + '?subject=' + encodeURIComponent(subject || "Noah's and Lars's Arcade");
  }
};

// Reads something a game saved in this browser. Returns null if it isn't there or storage is blocked.
function readSave(key, json) {
  try {
    const v = localStorage.getItem(key);
    return v == null ? null : json ? JSON.parse(v) : v;
  } catch (e) { return null; }
}

// The list of games on the arcade. To add a game, put its folder next to this
// file (with an index.html and a thumb.svg) and add one entry below.
//   added / updated: when the game arrived and last changed (drives the NEW and UPDATED badges)
//   keys: shown under the game on its play page
//   stat(): the player's best, read from what the game already saves (the games themselves aren't changed)
window.GAMES = [
  {
    id: 'cube-assault',
    title: 'Cube Assault',
    category: 'Shooter',
    tagline: 'Hold the village against endless waves of cubes.',
    description: 'First-person 3D shooter. Defend the village from waves of cubes, earn coins and unlock new weapons.',
    controls: 'Keyboard + mouse',
    keys: [['W A S D', 'Move'], ['Mouse', 'Aim'], ['Click', 'Shoot'], ['Right-click', 'Zoom'], ['Space', 'Jump'],
           ['Shift', 'Sprint'], ['R', 'Reload'], ['1–5', 'Weapons'], ['Esc', 'Pause']],
    path: 'cube-assault/index.html',
    thumb: 'cube-assault/thumb.svg',
    added: '2026-10-13T11:03:05+11:00',
    updated: '2026-10-13T14:17:53+11:00',
    stat() { const p = readSave('cubeAssaultProfile', true); return p && p.best ? 'Best wave ' + p.best : null; },
  },
  {
    id: 'block-drop',
    title: 'Blocktris',
    category: 'Puzzle',
    tagline: 'Stack, clear lines, and keep up as the blocks speed up.',
    description: 'Stack falling blocks, clear lines and survive as the speed climbs.',
    controls: 'Keyboard or touch',
    keys: [['← →', 'Move'], ['↑ / X', 'Rotate'], ['Z', 'Rotate back'], ['↓', 'Soft drop'], ['Space', 'Hard drop'],
           ['C / Shift', 'Hold'], ['P / Esc', 'Pause']],
    path: 'block-drop/index.html',
    thumb: 'block-drop/thumb.svg',
    added: '2026-10-13T15:23:24+11:00',
    updated: '2026-10-13T16:29:34+11:00',
    stat() { const n = +readSave('blockdrop-best'); return n ? 'Best ' + n.toLocaleString() : null; },
  },
  {
    id: '2048',
    title: '2048',
    category: 'Puzzle',
    tagline: 'Slide, merge, and chase the 2048 tile.',
    description: 'Slide the tiles, join matching numbers and try to build a 2048 tile.',
    controls: 'Keyboard or swipe',
    keys: [['← ↑ → ↓', 'Slide'], ['W A S D', 'Slide'], ['N', 'New game'], ['Swipe', 'Slide on touch screens']],
    path: '2048/index.html',
    thumb: '2048/thumb.svg',
    added: '2026-10-13T16:21:17+11:00',
    updated: '2026-10-13T16:21:17+11:00',
    stat() { const n = +readSave('2048-best'); return n ? 'Best ' + n.toLocaleString() : null; },
  },
  {
    id: 'poly-racer',
    title: 'Poly Racer',
    category: 'Racing',
    tagline: 'Drift, loop and jump your way to a new best time.',
    description: 'Low-poly time-trial racing. Drift through corners, fly through loops and jumps, and beat your own ghost.',
    controls: 'Keyboard or touch',
    keys: [['↑ ↓ ← →', 'Drive'], ['W A S D', 'Drive'], ['Space', 'Brake · turn while braking to drift'],
           ['R', 'Restart'], ['Enter', 'Back to checkpoint'], ['Esc', 'Pause']],
    path: 'poly-racer/index.html',
    thumb: 'poly-racer/thumb.svg',
    added: '2026-10-13T16:49:58+11:00',
    updated: '2026-10-13T17:26:10+11:00',
    stat() {
      const s = readSave('polyracer', true), n = s && s.best ? Object.keys(s.best).length : 0;
      return n ? n + '/6 tracks finished' : null;
    },
  },
];

// What's new on the home page, newest first
window.NEWS = [
  { date: '2026-10-13', game: 'poly-racer', text: 'Poly Racer now has drifting. Brake while turning to slide through corners.' },
  { date: '2026-10-13', game: 'poly-racer', text: 'New game: Poly Racer. Six low-poly tracks with loops, jumps and a ghost of your best run.' },
  { date: '2026-10-13', game: 'block-drop', text: 'Block Drop is now called Blocktris, with new cover art.' },
  { date: '2026-10-13', game: '2048', text: 'New game: 2048. Slide and merge your way to the big tile.' },
  { date: '2026-10-13', game: 'cube-assault', text: 'Cube Assault 1.7.2: the Extreme Gun, a turret and a combat knife in the shop.' },
];

// What this browser has played, for "Continue playing" and the NEW / UPDATED badges
window.Arcade = {
  played() { return readSave('arcade-played', true) || {}; },
  markPlayed(id) {
    const p = this.played();
    p[id] = new Date().toISOString();
    try { localStorage.setItem('arcade-played', JSON.stringify(p)); } catch (e) {}
  },
  recent(n) {
    const p = this.played();
    return GAMES.filter(g => p[g.id]).sort((a, b) => Date.parse(p[b.id]) - Date.parse(p[a.id])).slice(0, n);
  },
  // NEW until you've played it (for its first month); UPDATED if it changed since you last played
  badge(g) {
    const last = this.played()[g.id];
    if (!last) return Date.now() - Date.parse(g.added) < 30 * 864e5 ? 'NEW' : null;
    return Date.parse(g.updated) > Date.parse(last) ? 'UPDATED' : null;
  },
  stat(g) { try { return g.stat ? g.stat() : null; } catch (e) { return null; } },
};
