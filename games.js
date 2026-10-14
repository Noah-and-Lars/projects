// Where bug reports go. Split up so simple spam bots scanning the page don't pick it up.
window.CONTACT_EMAIL = ['jimmyscafe1000', 'gmail.com'].join('@');

// Fills in any "Email us" link on the page, with an optional subject line
window.fillContact = (subject) => {
  for (const a of document.querySelectorAll('.contact')) {
    a.textContent = CONTACT_EMAIL;
    a.href = 'mailto:' + CONTACT_EMAIL + '?subject=' + encodeURIComponent(subject || "Noah and Lars' Arcade");
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
    id: 'free-criminal',
    title: 'Free Criminal',
    category: 'Action',
    tagline: 'Fresh out of prison in San Varro. Steal cars, rob the mall and outrun the cops.',
    description: 'Open-world 3D crime game. Walk out of the penitentiary into a busy San Varro, steal any car, rob stores, the bank and the mall, pick from 10 guns and grenades at the gun stores and stay ahead of the police. Crash hard and you fly out of the car.',
    controls: 'Keyboard + mouse',
    keys: [['W A S D', 'Walk / drive'], ['Mouse', 'Look'], ['Click', 'Fire'], ['Right-click', 'Aim'], ['R', 'Reload'], ['Shift', 'Sprint'],
           ['Space', 'Jump / handbrake'], ['F', 'Steal or enter a car'], ['1', 'Take out / put away gun'], ['Q / Wheel', 'Switch gun'], ['G', 'Throw grenade'], ['E', 'Rob a store or the bank, or shop for guns'],
           ['V', 'First / third person'], ['M', 'Map'], ['H', 'Horn'], ['Esc', 'Pause']],
    path: 'free-criminal/index.html',
    thumb: 'free-criminal/thumb.svg',
    added: '2026-10-13T21:33:00+11:00',
    updated: '2026-10-14T13:25:00+11:00',
    stat() { return null; },
  },
  {
    id: 'cube-assault',
    title: 'Cube Assault',
    category: 'Shooter',
    tagline: 'Hold the line against waves of cubes, or play the story campaign: Russia 1944 and a SWAT raid in Mumbai.',
    description: 'First-person 3D shooter. Defend the village from waves of cubes, earn coins and level up, unlock weapons from a knife to a rocket launcher that blows holes in buildings, and play the campaign: hold the birch road in Russia, 1944, then raid a scam call centre in Mumbai, 2009.',
    controls: 'Keyboard + mouse or touch',
    keys: [['W A S D', 'Move'], ['Mouse', 'Aim'], ['Click', 'Shoot'], ['Right-click', 'Zoom'], ['Space', 'Jump'],
           ['Shift', 'Sprint'], ['R', 'Reload'], ['1–5', 'Guns'], ['6', 'Turret'], ['7', 'Knife'], ['8', 'Rocket launcher'], ['E', 'Claim flag (campaign)'], ['1 / 2', 'Make your choice (campaign)'], ['Esc', 'Pause'], ['Touch', 'Joystick to move, drag to look, on-screen buttons']],
    path: 'cube-assault/index.html',
    thumb: 'cube-assault/thumb.svg?v=3',
    added: '2026-10-13T11:03:05+11:00',
    updated: '2026-10-14T13:57:00+11:00',
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
  {
    id: 'blockcraft',
    title: 'Blockcraft',
    category: 'Sandbox',
    tagline: 'Mine, craft and build in an endless block world.',
    description: 'A block-building sandbox with caves, every ore, crafting, furnaces, mobs and day and night. Survival or creative.',
    controls: 'Keyboard + mouse or touch',
    keys: [['W A S D', 'Walk'], ['Mouse', 'Look'], ['Left click', 'Break / attack'], ['Right click', 'Place / use / eat'], ['Space', 'Jump · double-tap to fly in creative'],
           ['Shift', 'Sneak'], ['Ctrl', 'Sprint'], ['E', 'Inventory and crafting'], ['1–9', 'Hotbar'], ['Q', 'Drop'], ['T', 'Chat and /commands'], ['F3', 'Info']],
    path: 'blockcraft/index.html',
    thumb: 'blockcraft/thumb.svg',
    added: '2026-10-13T21:00:00+11:00',
    updated: '2026-10-14T13:40:06+11:00',
    stat() { const w = readSave('blockcraft-worlds', true); return w && w.length ? w.length + (w.length === 1 ? ' world' : ' worlds') : null; },
  },
];

// What's new on the home page, newest first
window.NEWS = [
  { date: '2026-10-14', game: 'cube-assault', text: 'Cube Assault 2.3: play on your phone or tablet, with a joystick, drag-to-look and buttons for fire, jump, reload and switching guns.' },
  { date: '2026-10-14', game: 'blockcraft', text: 'Blockcraft 1.5: new village houses (cobblestone cottages, plank houses with stair roofs, white plaster houses, a blacksmith) plus stairs, slabs, doors, fences, lanterns and hay bales you can craft.' },
  { date: '2026-10-14', game: 'free-criminal', text: 'Free Criminal 1.1: 3× the traffic and crowds, ragdoll crashes, gun stores with 10 guns and grenades, a mall to rob, a denser city and a new HUD.' },
  { date: '2026-10-14', game: 'blockcraft', text: 'Blockcraft 1.4: villages with villagers and an iron golem (plains, desert, taiga and snowy styles), and new skins for every mob.' },
  { date: '2026-10-14', game: 'blockcraft', text: 'Blockcraft 1.3.2: the first-person hand now sits and punches exactly like Minecraft Java.' },
  { date: '2026-10-14', game: 'blockcraft', text: 'Blockcraft 1.3.1: new grass, dirt, tall grass, oak bark and leaf textures, closer to the classic look.' },
  { date: '2026-10-14', game: 'blockcraft', text: 'Blockcraft 1.3: farming (hoes till farmland, plant seeds, grow wheat), shovel paths, mobs that spawn properly at night and in caves, fixed ice, and the sun no longer shines through blocks.' },
  { date: '2026-10-14', game: 'blockcraft', text: 'Blockcraft 1.2.1: no more "Click to play". The game grabs your mouse as soon as you pick a world.' },
  { date: '2026-10-14', game: 'blockcraft', text: 'Blockcraft 1.2: a Minecraft-style arm, head bobbing at Minecraft speed, sharper tree textures, and far-away chunks now unload for smoother frame rates.' },
  { date: '2026-10-14', game: 'cube-assault', text: 'Cube Assault 2.2: your SWAT team now fights beside you at Tajer Support, and a new ending lets you climb out the window and blow the tower up.' },
  { date: '2026-10-13', game: 'free-criminal', text: 'New game: Free Criminal. Walk out of prison into San Varro, steal cars, rob the bank and outrun the cops.' },
  { date: '2026-10-13', game: 'cube-assault', text: 'Cube Assault 2.0: campaign Level 2, Tajer Support. Lead a SWAT raid on a scam call centre in Mumbai, 2009, and decide the last scammer\'s fate.' },
  { date: '2026-10-13', game: 'blockcraft', text: 'Blockcraft 1.1: textures the right way up, a smoother look, a new hand, faster loading and bug fixes for mining, pickups and furnaces.' },
  { date: '2026-10-13', game: 'blockcraft', text: 'New game: Blockcraft. Mine every ore, craft tools, fight mobs and build in an endless world.' },
  { date: '2026-10-13', game: 'cube-assault', text: 'Cube Assault 1.9.2: a story campaign (Russia, 1944), the Frontier map, destructible buildings, a rocket launcher and menu music.' },
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
