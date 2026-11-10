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
//   badge: optional fixed badge (e.g. 'DISCONTINUED') shown instead of NEW / UPDATED
//   keys: shown under the game on its play page
//   stat(): the player's best, read from what the game already saves (the games themselves aren't changed)
window.GAMES = [
  {
    id: 'turn-turn-turn',
    title: 'Turn! Turn! TURN!',
    category: 'Racing',
    tagline: 'Co-op dirt rally: one of you drives blind, the other reads the map and shouts the turns. Now with quick match and 4-6 player versus.',
    description: 'A two-player co-op rally. The driver has the wheel but no map; the navigator holds the tablet with the route and calls every turn. Beat the stage clock through mud, cracked glass, flying doors and a dropped tablet, or drive solo with an AI co-driver.',
    controls: 'Keyboard, mouse or Xbox controller',
    keys: [['W A S D', 'Drive (driver)'], ['Space', 'Handbrake (driver) / Jump call (navigator)'], ['E', 'Wipers (driver) / Sharp right (navigator)'], ['Q A W D E S', 'Calls (navigator)'], ['F / click', 'Grab the dropped tablet'], ['C', 'Look at your partner'], ['F (hold)', 'Hand out of the window (versus driver)']],
    path: 'turn-turn-turn/index.html',
    thumb: 'turn-turn-turn/thumb.jpg',
    added: '2026-11-08T22:00:00+11:00',
    updated: '2026-11-12T12:00:00+11:00',
    stat() { const s = readSave('turnturnturn.save', true); if (!s || !s.best) return null; const n = Object.keys(s.best).filter(k => s.best[k].solo || s.best[k].crew).length; return n ? n + (n === 1 ? ' stage' : ' stages') + ' finished' : null; },
  },
  {
    id: 'krill-dive',
    title: 'Krill Dive',
    category: 'Puzzle',
    tagline: 'Daily trivia where the obvious answer scores least: name something rare and your krill sinks deeper. Now with versus lobbies.',
    description: 'A daily trivia game where rare answers score more. Answer seven prompts with 25 seconds each, and every point sinks your krill deeper toward the trench floor at 7,000 m. Practice dives give you a new set any time.',
    controls: 'Keyboard or touch',
    keys: [['Type', 'Your answer'], ['Enter', 'Lock it in'], ['Practice dive', 'A new random set of prompts']],
    path: 'krill-dive/index.html',
    thumb: 'krill-dive/thumb.svg',
    added: '2026-11-07T08:00:00+11:00',
    updated: '2026-11-11T12:00:00+11:00',
    stat() { const s = readSave('krilldive', true); return s && s.played ? 'Best ' + ((s.best || 0) * 10).toLocaleString() + ' m' : null; },
  },
  {
    id: 'card-royale',
    title: 'Card Royale',
    category: 'Strategy',
    tagline: 'Real-time card battles, 1v1 online: drop troops, cast spells and knock down the enemy towers.',
    description: 'A real-time 1v1 card battle. Spend Elixir to drop troops, buildings and spells from your 8-card deck, and knock down more towers than your opponent in three minutes. Battle players online, or a bot if nobody is found.',
    controls: 'Mouse or touch',
    keys: [['Drag a card', 'Place it on your side of the arena'], ['Tap card, then arena', 'Same as dragging'], ['Speech bubble', 'Emotes and chat'], ['Battle', 'Quick match (a bot after 10 seconds if nobody is online)'], ['Tap the arena', 'Trophy Road'], ['Tap a battle in the log', 'That player\u2019s profile']],
    path: 'card-royale/index.html',
    thumb: 'card-royale/thumb.jpg',
    added: '2026-11-03T12:00:00+11:00',
    updated: '2026-11-05T08:45:00+11:00',
    stat() { const s = readSave('cardroyale.save', true); return s && (s.wins || s.losses || s.draws) ? (s.tr || 0) + ' trophies' : null; },
  },
  {
    id: 'siege',
    title: 'Siege',
    category: 'Shooter',
    tagline: '5v5 tactical shooter: drone, breach and defuse, or reinforce, barricade and hold. One life a round.',
    description: 'A 5v5 tactical shooter with one life per round. Attackers scout with drones, breach and plant the defuser, while defenders reinforce walls, barricade doors and hold the site. Play online with up to 10 players, with bots filling empty seats.',
    controls: 'Keyboard + mouse',
    keys: [['W A S D', 'Move'], ['Mouse', 'Aim and shoot (right-click to aim down sights)'], ['Shift', 'Sprint'], ['C / Ctrl', 'Crouch'], ['Z', 'Prone'], ['Q / E', 'Lean'], ['R', 'Reload'], ['1 / 2', 'Primary / secondary gun'], ['X', 'Operator gadget'], ['G', 'Secondary gadget'], ['F (hold)', 'Reinforce, barricade, plant or disable the defuser'], ['5', 'Drones (attack) or cameras (defence)'], ['V', 'Melee'], ['Tab', 'Scoreboard'], ['Enter / T', 'Chat (online)'], ['Y', 'Team chat (online)'], ['Esc', 'Menu']],
    path: 'siege/index.html',
    thumb: 'siege/thumb.jpg',
    added: '2026-11-02T21:00:00+11:00',
    updated: '2026-11-12T13:00:00+11:00',
    stat() { const p = readSave('siege.profile', true); return p && p.matches ? 'Level ' + (1 + Math.floor(Math.sqrt((p.xp || 0) / 120))) + ' · ' + (p.wins || 0) + (p.wins === 1 ? ' win' : ' wins') : null; },
  },
  {
    id: 'uno',
    title: 'UNO!',
    category: 'Card',
    tagline: 'The classic card game for 2 to 10, against bots or online. Classic, No Mercy and Flip.',
    description: 'The classic card game for 2 to 10 players. Match the pile by colour, number or symbol, play action cards, and call UNO on your last card. Play Classic, No Mercy or Flip against bots or online with friends.',
    controls: 'Mouse or touch',
    keys: [['Click a card', 'Play it, if it matches'], ['Draw pile', 'Draw when you can’t play'], ['UNO button', 'Call UNO on your last card'], ['Colour wheel', 'Pick a colour for a Wild'], ['Challenge', 'Call a Wild Draw Four bluff']],
    path: 'uno/index.html',
    thumb: 'uno/thumb.jpg',
    added: '2026-11-01T22:00:00+11:00',
    updated: '2026-11-07T08:00:00+11:00',
    stat() { const s = readSave('uno.stats', true); return s && s.wins ? s.wins + (s.wins === 1 ? ' win' : ' wins') : null; },
  },
  {
    id: 'rocket-rivals',
    title: 'Rocket Rivals',
    category: 'Sports',
    tagline: 'Rocket-powered car football. Boost, jump, flip and fly to score in 1v1, 2v2 and 3v3.',
    description: 'Rocket-powered car football. Boost, jump, flip and fly to knock a giant ball into the goal, in matches from 1v1 to 4v4 against bots.',
    controls: 'Keyboard + mouse or controller',
    keys: [['W / S', 'Drive and reverse (pitch in the air)'], ['A / D', 'Steer'], ['Right click', 'Jump (twice to flip)'], ['Left click', 'Boost'], ['Left Shift', 'Powerslide / air roll'], ['Q / E', 'Air roll'], ['Space', 'Ball cam'], ['Tab', 'Scoreboard'], ['Esc', 'Pause'], ['Controller', 'DualShock 4 layout (change it in Settings)']],
    path: 'rocket-rivals/index.html',
    thumb: 'rocket-rivals/thumb.jpg?v=1',
    added: '2026-10-26T14:00:00+11:00',
    updated: '2026-10-26T14:00:00+11:00',
    stat() { const p = readSave('rivals.profile', true); return p && p.stats && p.stats.matches ? 'Level ' + p.level + ' · ' + p.stats.wins + ' wins' : null; },
  },
  {
    id: 'football',
    title: 'Football',
    category: 'Sports',
    tagline: 'Realistic 11 v 11 football: a 48-team World Cup, online matches against a friend, Ultimate Team and skill games.',
    description: 'A full 3D 11 v 11 football game. Win the 48-team World Cup, play a friend online, build a club in Ultimate Team or practise in skill games. Works with a keyboard or a controller.',
    controls: 'Keyboard or controller',
    keys: [['Arrow keys', 'Move'], ['Shift', 'Sprint'], ['S', 'Pass'], ['W', 'Through ball'], ['A', 'Cross or lob'], ['D', 'Shoot'], ['Q', 'Switch player'], ['Space', 'Skip intro or replay'], ['Esc', 'Pause'], ['Controller', 'DualShock 4 layout (change it in Settings)']],
    path: 'football/index.html',
    thumb: 'football/thumb.jpg?v=2',
    added: '2026-10-25T18:00:00+11:00',
    updated: '2026-11-07T08:00:00+11:00',
    stat() { const p = readSave('soccer.profile', true); return p && p.played ? p.played + ' matches played' : null; },
  },
  {
    id: 'havoc-bay',
    title: 'Havoc Bay',
    category: 'Action',
    tagline: 'Red vs Blue sea battle. Command warships, fly planes and destroy the enemy harbor, online or against bots.',
    description: 'A Red vs Blue sea battle. Sail warships, fly planes and fight on foot to claim islands and destroy the enemy harbor. Join the public online battle, play a private room with friends, or play offline against bots.',
    controls: 'Keyboard + mouse or touch',
    keys: [['W A S D', 'Walk, or throttle and steer'], ['Mouse', 'Look and aim (planes fly where you aim)'], ['Click', 'Fire'], ['Right-click', 'Zoom'], ['1 to 5', 'Switch guns on foot'], ['C', 'Cockpit or chase view in a plane'], ['F', 'Torpedo or drop a bomb'], ['R', 'Missile (jet, battleship)'], ['X', 'Flare (planes, battleship, carrier)'], ['Shift + A / D', 'Barrel roll'], ['Ctrl', 'Crouch, then lie down'], ['Enter', 'Deploy again (in the deploy menu)'],
           ['E', 'Use pads and turrets, get in and out (hold to bail out of a plane)'], ['Space', 'Jump, or level out a plane'], ['Shift', 'Sprint'], ['B', 'Deploy menu, or launch a plane from your carrier'], ['M', 'Map'], ['Tab', 'Scoreboard'], ['Enter / T', 'Chat (online)'], ['Y', 'Team chat (online)'], ['Esc', 'Pause'], ['G (hold)', 'Push to talk (online)']],
    path: 'havoc-bay/index.html',
    thumb: 'havoc-bay/thumb.jpg?v=2',
    added: '2026-10-18T20:55:00+11:00',
    updated: '2026-11-09T00:30:00+11:00',
    stat() { const p = readSave('havocbay.profile.v1', true); return p && p.matches ? p.wins + (p.wins === 1 ? ' win' : ' wins') : null; },
  },
  {
    id: 'bull-run',
    title: 'Stocks Game',
    category: 'Strategy',
    tagline: 'Turn $10,000 into a fortune on a market that never sleeps.',
    description: 'A stock-trading game. Start with $10,000, trade twelve companies on live prices and news, and decide whether to risk the shady back room. Your portfolio is saved in your browser.',
    controls: 'Mouse, keyboard or touch',
    keys: [['Click a stock', 'Open its chart'], ['B / S', 'Buy or sell'], ['H / C', 'Short or cover'], ['Enter', 'Place the trade'], ['M', 'Max shares'], ['I', 'The back room'], ['↑ ↓', 'Change stock'], ['Space', 'Pause']],
    path: 'bull-run/index.html',
    thumb: 'bull-run/thumb.svg',
    added: '2026-10-18T19:38:00+11:00',
    updated: '2026-10-18T19:38:00+11:00',
    stat() { const s = readSave('bullRunSave', true); if (!s || !s.stats) return null; const w = s.stats.best || 0; return w > 10000 ? 'Best $' + Math.round(w).toLocaleString() : null; },
  },
  {
    id: 'chess',
    title: 'Chess',
    category: 'Board',
    tagline: 'Classic chess against the computer, or online against a real person.',
    description: 'Classic chess against the computer on Easy, Medium or Hard, or online against a real person for a rating. Every rule is included and your game is saved.',
    controls: 'Mouse or touch',
    keys: [['Local 2-player', 'Two players on one screen: the board turns round after every move'], ['🏆 Leaderboard', 'Everyone\u2019s highest online rating'], ['Drag or click', 'Move a piece'], ['Undo', 'Take back your last move'], ['Flip', 'Turn the board around'], ['Play online', 'Quick match or a private table']],
    path: 'chess/index.html',
    thumb: 'chess/thumb.svg',
    added: '2026-10-17T17:11:00+11:00',
    updated: '2026-11-07T08:00:00+11:00',
    stat() { const s = readSave('chessSave', true); if (!s || !s.stats) return null; const w = Object.values(s.stats).reduce((n, l) => n + ((l && l.w) || 0), 0) + ((s.online && s.online.w) || 0); const R = s.rating && s.rating.n > 0 && isFinite(s.rating.r) ? 'Rating ' + Math.round(s.rating.r) + (Math.round(s.rating.peak || 0) > Math.round(s.rating.r) ? ' (best ' + Math.round(s.rating.peak) + ')' : '') : ''; return R || w ? [R, w ? w + (w === 1 ? ' win' : ' wins') : ''].filter(Boolean).join(' · ') : null; },
  },
  {
    id: 'checkers',
    title: 'Checkers',
    category: 'Board',
    tagline: 'Classic checkers against the computer, or online against a real person.',
    description: 'American checkers with forced jumps, multi-jumps and kings: against the computer on six levels, two players on one screen, or online against a real person for a rating of its own and its own leaderboard.',
    controls: 'Mouse or touch',
    keys: [['Local 2-player', 'Two players on one screen: the board turns round after every move'], ['🏆 Leaderboard', 'Everyone\u2019s highest online rating'], ['Drag or click', 'Move a piece'], ['Undo', 'Take back your last move'], ['Flip', 'Turn the board around'], ['Play online', 'Quick match or a private table']],
    path: 'checkers/index.html',
    thumb: 'checkers/thumb.svg',
    added: '2026-11-11T13:00:00+11:00',
    updated: '2026-11-11T13:00:00+11:00',
    stat() { const s = readSave('checkersSave', true); if (!s || !s.stats) return null; const w = Object.values(s.stats).reduce((n, l) => n + ((l && l.w) || 0), 0) + ((s.online && s.online.w) || 0); const R = s.rating && s.rating.n > 0 && isFinite(s.rating.r) ? 'Rating ' + Math.round(s.rating.r) + (Math.round(s.rating.peak || 0) > Math.round(s.rating.r) ? ' (best ' + Math.round(s.rating.peak) + ')' : '') : ''; return R || w ? [R, w ? w + (w === 1 ? ' win' : ' wins') : ''].filter(Boolean).join(' · ') : null; },
  },
  {
    id: 'russian-roulette',
    title: 'Russian Roulette',
    category: 'Thriller',
    tagline: 'One revolver, one bullet, six chambers. Plus Buckshot online for 2 to 6 players.',
    description: 'A tense game of chance. Take turns with the revolver against strangers to build a win streak, or play Buckshot online with 2 to 6 players at one table.',
    controls: 'Mouse, keyboard or touch',
    keys: [['Heads / Tails', 'Call the coin toss'], ['Hold button or Space', 'Squeeze the trigger'], ['Play online', 'Quick match or a private table'], ['Esc', 'Pause']],
    path: 'russian-roulette/index.html',
    thumb: 'russian-roulette/thumb.jpg',
    added: '2026-10-17T12:50:00+11:00',
    updated: '2026-10-20T11:03:29+11:00',
    stat() { const s = readSave('russianRouletteSave', true); return s && s.best ? 'Best streak ' + s.best : null; },
  },
  {
    id: 'gamble-your-life-away',
    title: 'Gamble Your Life Away',
    category: 'Casino',
    tagline: 'A 3D casino with 44 games, Texas Hold’em included, and $80,000. Just do not end up in debt.',
    description: 'Walk into a 3D casino with $80,000 and play 44 games, from slots and blackjack to Texas Hold’em. End a round in debt and it is game over.',
    controls: 'Mouse or touch',
    keys: [['Drag', 'Look around the casino'], ['Click a game', 'Sit down and play'], ['Chips', 'Pick your bet'], ['Esc', 'Back to the casino floor']],
    path: 'gamble-your-life-away/index.html',
    thumb: 'gamble-your-life-away/thumb.jpg',
    added: '2026-10-15T10:15:00+11:00',
    updated: '2026-11-01T01:30:00+11:00',
    stat() { const s = readSave('gambleLifeSave', true); return s && s.rounds ? 'Richest ' + '$' + Math.round(s.peak).toLocaleString('en-US') : null; },
  },
  {
    id: 'cube-tower-defense',
    title: 'Cube Tower Defense',
    category: 'Strategy',
    tagline: 'Cubes march down the road to your fort. Place your squad and stop them.',
    description: 'Tower defense with the cubes from Cube Assault. Place your squad along the road and hold your fort through endless waves.',
    controls: 'Mouse or touch',
    keys: [['Click a unit', 'Pick it in the shop'], ['Click the grass', 'Place it'], ['1–8', 'Pick a unit'], ['Space', 'Start the next wave'], ['Right-click / Esc', 'Cancel'], ['Esc', 'Pause']],
    path: 'cube-tower-defense/index.html',
    thumb: 'cube-tower-defense/thumb.svg',
    added: '2026-10-14T21:26:00+11:00',
    updated: '2026-11-07T08:00:00+11:00',
    stat() { const p = readSave('cubeTDProfile', true); return p && p.best ? 'Best wave ' + p.best : null; },
  },
  {
    id: 'free-criminal',
    title: 'Free Criminal',
    category: 'Action',
    tagline: 'Fresh out of prison and thrown in a dumpster. Steal cars, rob stores and outrun the cops, alone or online with everyone in one shared city.',
    description: 'An open-world 3D crime game. Steal cars, rob stores and the bank, buy guns and outrun the police in one big city, alone or online with everyone.',
    controls: 'Keyboard + mouse or touch',
    keys: [['W A S D', 'Walk / drive'], ['Mouse', 'Look'], ['Click', 'Fire'], ['Right-click', 'Aim'], ['R', 'Reload'], ['Shift', 'Sprint'],
           ['Space', 'Jump / handbrake'], ['F', 'Carjack or enter a car'], ['1', 'Take out / put away gun'], ['Q / Wheel', 'Switch gun'], ['G', 'Throw grenade'], ['E', 'Shop, or rob a store with a gun out'],
           ['V', 'First / third person'], ['M', 'Map (zoom and set a route)'], ['Tab', 'See who is playing online'], ['T', 'Messages and Everyone chat (online)'], ['H', 'Horn'], ['Esc', 'Pause']],
    path: 'free-criminal/index.html',
    thumb: 'free-criminal/thumb.jpg?v=2',
    added: '2026-10-13T21:33:00+11:00',
    updated: '2026-10-31T23:30:00+11:00',
    stat() { const p = readSave('freecriminal.profile.v1', true); return p && p.xp ? 'Level ' + (1 + Math.floor(Math.sqrt(p.xp / 150))) : null; },
  },
  {
    id: 'cube-assault',
    title: 'Cube Assault',
    category: 'Shooter',
    tagline: 'Hold the line against waves of cubes, play the story campaign, or play online with up to 10 friends.',
    description: 'A first-person shooter. Defend the village from waves of cubes, unlock weapons, play the story campaign, or play online with up to 10 friends.',
    controls: 'Keyboard + mouse or touch',
    keys: [['W A S D', 'Move'], ['Mouse', 'Aim'], ['Click', 'Shoot'], ['Right-click', 'Zoom'], ['Space', 'Jump'],
           ['Shift', 'Sprint'], ['R', 'Reload'], ['1–5', 'Guns (all keys can be changed in Settings)'], ['6', 'Turret'], ['J', 'Barricade a door'], ['7', 'Knife'], ['8', 'Rocket launcher'], ['=', 'Pumpkin Launcher'], ['E', 'Claim flag (campaign), plant or defuse the bomb (C:S Mode)'], ['1 / 2', 'Make your choice (campaign)'], ['Esc', 'Pause'], ['Tab', 'Scoreboard (multiplayer)'], ['Touch', 'Joystick to move, drag to look, on-screen buttons']],
    path: 'cube-assault/index.html',
    thumb: 'cube-assault/thumb.jpg?v=4',
    added: '2026-10-13T11:03:05+11:00',
    updated: '2026-11-07T08:00:00+11:00',
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
    thumb: 'block-drop/thumb.jpg',
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
    thumb: '2048/thumb.jpg',
    added: '2026-10-13T16:21:17+11:00',
    updated: '2026-10-13T16:21:17+11:00',
    stat() { const n = +readSave('2048-best'); return n ? 'Best ' + n.toLocaleString() : null; },
  },
  {
    id: 'poly-racer',
    title: 'Poly Racer',
    category: 'Racing',
    tagline: 'Race on 30 tracks against computer drivers or friends online.',
    description: 'A racing game with 30 tracks and 15 computer drivers, or race up to 10 friends online. Choose the laps, weather and time of day, and drive from behind the car or the cockpit.',
    controls: 'Keyboard, gamepad or touch',
    keys: [['↑ ↓ ← →', 'Drive'], ['W A S D', 'Drive'], ['S / ↓', 'Brake and reverse'], ['Space', 'Handbrake · turn while you hold it to drift'],
           ['Shift + W', 'Rev the engine'], ['R', 'Respawn'], ['Backspace', 'Restart'], ['C', 'Camera: chase, close or cockpit'], ['L', 'Driving line'], ['F9', 'Photo mode (also in the pause menu)'], ['Esc', 'Pause']],
    path: 'poly-racer/index.html?v=1.4',   // the version in the address: nobody gets an old copy from their browser's cache
    thumb: 'poly-racer/thumb.jpg',
    added: '2026-10-13T16:49:58+11:00',
    updated: '2026-11-04T08:27:00+11:00',
    stat() {
      const s = readSave('polyracer', true), n = s && s.best ? Object.keys(s.best).length : 0;
      const won = s && s.stats && s.stats.results ? Object.values(s.stats.results).filter(p => p === 1).length : 0;
      return won ? won + '/30 races won' : n ? n + '/100 tracks finished' : null;
    },
  },
  {
    id: 'blockcraft',
    title: 'Blockcraft',
    category: 'Sandbox',
    tagline: 'Mine, craft and build in an endless block world.',
    description: 'A block-building sandbox. Mine, craft and build in survival or creative, explore caves, the Nether and the End, alone or on the multiplayer server.',
    controls: 'Keyboard + mouse or touch',
    keys: [['W A S D', 'Walk'], ['Mouse', 'Look'], ['Left click', 'Break / attack'], ['Right click', 'Place / use / eat'], ['Space', 'Jump · double-tap to fly in creative'],
           ['Shift', 'Sneak'], ['Ctrl', 'Sprint'], ['E', 'Inventory and crafting'], ['1–9', 'Hotbar'], ['Q', 'Drop'], ['T', 'Chat and /commands'], ['Tab', 'Who\'s on (multiplayer)'], ['F3', 'Info']],
    path: 'blockcraft/index.html',
    thumb: 'blockcraft/thumb.svg',
    added: '2026-10-13T21:00:00+11:00',
    updated: '2026-10-17T23:25:59+11:00',
    badge: 'DISCONTINUED',
    stat() { const w = readSave('blockcraft-worlds', true); return w && w.length ? w.length + (w.length === 1 ? ' world' : ' worlds') : null; },
  },
];

// What's new on the home page, newest first
window.NEWS = [
  { date: '2026-11-10', href: 'social.html', text: 'New: Social, the arcade’s own Instagram. Clip the last 30 seconds of any game with the 🎬 button (or F8), post your own photos and videos, scroll Reels, like and comment, follow players and message them from the new inbox. Find it in the Social tab.' },
  { date: '2026-11-12', game: 'siege', text: 'Siege 1.0.18: jammers reach 2.5 m and no longer work through walls, floors or ceilings, so one downstairs can\'t jam your drone upstairs. Barricades are solid green blocks again: bullets can\'t go through them or leave holes to see through.' },
  { date: '2026-11-12', game: 'turn-turn-turn', text: 'Turn! Turn! TURN! 1.3: 10 new long stages, about three times longer, with real hills (long climbs, big descents, blind crests and dips), three new places (snow, a red canyon and a jungle), and solo leaderboards for runs with the AI co-driver.' },
  { date: '2026-11-11', game: 'checkers', text: 'New game: Checkers. The same board and buttons as Chess, with checker pieces and checkers rules (forced jumps, multi-jumps, kings). Play the computer on six levels, a friend on one screen, or real people online for a checkers rating with its own leaderboard.' },
  { date: '2026-11-11', game: 'krill-dive', text: 'Krill Dive 1.4: versus lobbies. Make a lobby and share the code (or join an open one), and everyone dives the same seven prompts with live standings. The leaderboard now lists every diver from first to last, and the game no longer tells you the rarest answer after a prompt.' },
  { date: '2026-11-10', game: 'krill-dive', text: 'Krill Dive 1.3: a daily leaderboard. Every signed-in diver\'s daily dive is ranked by depth, with today\'s 1st, 2nd and 3rd and the time left at the top, and every finished day kept below as its own board.' },
  { date: '2026-11-10', game: 'krill-dive', text: 'Krill Dive 1.2: about five times as many accepted answers on the prompts coming up this week (16,700 across the week, up from 3,400), from everyday answers that were missing to real deep cuts, and niche answers now score as the rare finds they are.' },
  { date: '2026-11-10', game: 'turn-turn-turn', text: 'Turn! Turn! TURN! 1.2.1: fixed versus calls showing "undefined" on the driver\'s screen instead of the navigator\'s call.' },
  { date: '2026-11-09', game: 'turn-turn-turn', text: 'Turn! Turn! TURN! 1.2: quick match finds you a crew partner or a whole race, and the new versus mode puts 4 to 6 players in crews of two on the same stage at once (just for fun, not on the leaderboard). Versus drivers can wind the window down and show the car behind what they think of it.' },
  { date: '2026-11-09', game: 'turn-turn-turn', text: 'Turn! Turn! TURN! 1.1.1: fixed the main menu popping up over a running stage for the player who joined the crew, plus a few smaller crew fixes.' },
  { date: '2026-11-09', game: 'havoc-bay', text: 'Havoc Bay 1.3.3: voice chat. In the Public Battle and in private rooms, hold G to talk to everyone in the lobby. Settings > Voice chat > Off mutes it all, you included.' },
  { date: '2026-11-08', game: 'turn-turn-turn', text: 'Turn! Turn! TURN! 1.1: a crew leaderboard for every stage (online crews only), a stopwatch, neutral revs and launches on Shift, smoother gauges, a new engine sound, a calmer co-driver voice, steadier handling and less road for the driver to see.' },
  { date: '2026-11-08', game: 'turn-turn-turn', text: 'New game: Turn! Turn! TURN!, a co-op dirt rally. One of you drives with no map, the other reads the route off a tablet and calls the turns. Make a crew with a 6-digit code, or drive solo with an AI co-driver.' },
  { date: '2026-11-07', game: 'havoc-bay', text: 'Havoc Bay 1.3.2: walk into the island houses and barracks for cover (doors, windows, floors, furniture; walls stop bullets). Rebuilt cockpits with clear windscreens, glowing tracers, gun recoil in first person, and an unlimited match time for bot games.' },
  { date: '2026-11-07', game: 'krill-dive', text: 'Krill Dive 1.1: the share under each answer is now real. Every diver answer is counted, so you see how many divers actually said the same thing (one vote per diver per prompt).' },
  { date: '2026-11-07', game: 'havoc-bay', text: 'Havoc Bay 1.3.1: flares (X) pull homing missiles off your plane or big ship, with a MISSILE INCOMING warning. Barrel rolls, blacking out when you climb straight up, runways on every island, team upgrades on the computer, crouching and lying down, lifeboats off sinking carriers, auto-balance in the public battle and a cheaper shop.' },
  { date: '2026-11-07', game: 'krill-dive', text: 'New game: Krill Dive. Seven daily prompts, 25 seconds each, and the rarer your answer the deeper your krill sinks. Reach the trench floor at 7,000 m for a perfect dive.' },
  { date: '2026-11-07', game: 'havoc-bay', text: 'Havoc Bay 1.3: planes can crash into each other (teammates too), blowing up everyone on board. Press C for first person on foot and on ships, and cockpits now have floors, walls, seats and glass windows to look out of.' },
  { date: '2026-11-07', game: 'cube-tower-defense', text: 'Cube Tower Defense 1.3: online Co-op (defend one base together) and Versus (same map and waves, last base standing wins), plus 25 new specialists from the 15-coin Scout to the Heavy Gunner.' },
  { date: '2026-11-07', game: 'chess', text: 'Chess 1.5: Local 2-player, where the board turns round after every move so two people can play on one computer (not rated), and a leaderboard of everyone\'s highest rating.' },
  { date: '2026-11-07', game: 'football', text: 'Football 1.1.1: fairer penalties (keepers now save some), and VAR checks and penalty shootouts no longer carry on while the game is paused.' },
  { date: '2026-11-07', game: 'siege', text: 'Siege 1.0.17: drone fixes. Jammed drones fall instead of freezing, thrown drones can\'t pass through walls, lost drones come back, and bots\' drones move smoothly online.' },
  { date: '2026-11-07', game: 'uno', text: 'UNO! 1.1: big hands wrap onto rows so you can always see every card, a Sort button, a turn bar, a log of the last moves, scores on every seat and a new main menu with your stats and patch notes.' },
  { date: '2026-11-07', game: 'cube-assault', text: 'Cube Assault 3.0.3: the Battle Pass button is gone now the Halloween event is over (you keep everything you got from it). New in Settings: legacy map skins, with Halloween 2026 to bring back the decorations.' },
  { date: '2026-11-05', game: 'card-royale', text: 'Card Royale 1.1: 25 new cards (troops, towers and spells, from the Wolf Pack and the Ballista to Meteor and the Mimic), and troops now take 1.5 seconds to arrive, showing their outline until they land. Card names on every card, in your hand and in your collection. Tap a battle in your Battle Log to see that player\u2019s profile, and tap the arena for the Trophy Road. A bot takes over after 10 seconds of searching. Battle chat is unfiltered unless you turn the filter on in Settings. Plus a cleaner look, and fixes for Zap and The Log.' },
  { date: '2026-11-05', game: 'siege', text: 'Siege 1.0.16: lighter online traffic. Online play went down for a morning when the arcade\u2019s realtime server ran out of its daily allowance, and Siege matches were the biggest users; Siege now sends far fewer messages, and other players and bots still move smoothly.' },
  { date: '2026-11-05', game: 'siege', text: 'Siege 1.0.15: a reinforced wall shows its bolts on the other side, so attackers can tell it\'s reinforced. Breaches also show up properly for whoever set them off.' },
  { date: '2026-11-05', game: 'chess', text: 'Chess 1.4: ratings. Online games are now rated the way chess.com does it (Glicko): pick how well you play to get your starting rating, then win, lose or draw against real people to move it. Games against the computer stay unrated. Your rating shows under Play online and on your Arcade profile.' },
  { date: '2026-11-05', game: 'havoc-bay', text: 'Havoc Bay 1.2.7: the harbors are 35% further apart on bigger islands with six more guns each, and a claimed island\'s burnt ground and fires are cleared.' },
  { date: '2026-11-05', game: 'havoc-bay', text: 'Havoc Bay 1.2.6: spawn as an anti-aircraft gunner on any teammate\'s Destroyer, Battleship or Carrier and shoot down planes for them. Watch out for kamikazes.' },
  { date: '2026-11-05', game: 'havoc-bay', text: 'Havoc Bay 1.2.5: planes need fuel now. Land on a runway or your carrier and sit 8 seconds to refuel, rearm and repair. Planes only take off from runways, the Jet costs 800 with a one-minute wait, the Bomber 700 with a sharper tail gunner, and the cockpit has real gauges.' },
  { date: '2026-11-04', game: 'havoc-bay', text: 'Havoc Bay 1.2.4: day and night. The sun crosses the sky during a battle, with a sunset, a moonlit night and a sunrise, and the time shows in the corner. Guns are held the right way up now.' },
  { date: '2026-11-04', game: 'siege', text: 'Siege 1.0.14: smarter bots. Defenders hold angles on the ways into the site and peek, bots only know where you are if they see or hear you, they spray through drywall at noises and use their operators\' gadgets. And you can go prone with Z.' },
  { date: '2026-11-04', game: 'siege', text: 'Siege 1.0.13: wallbangs. Bullets go through drywall and hurt whoever is behind it, leaving bullet holes on both sides; walls wear down instead of losing a piece to every bullet, and a punch knocks out a small hole to see through. Reinforced walls stop everything.' },
  { date: '2026-11-04', game: 'siege', text: 'Siege 1.0.12: roofs! Rappel up an outside wall and climb onto the roof, then come in from above through one of the two roof hatches on every map. Some yards are open to the sky now, and grenades look like real grenades.' },
  { date: '2026-11-04', game: 'siege', text: 'Siege 1.0.11: loadouts and rappelling. Choose between two guns and two gadgets for every operator, defenders can take claymores and deployable shields, and attackers can rappel up outside walls (Space), shoot on the rope and go in through windows (F).' },
  { date: '2026-11-04', game: 'siege', text: 'Siege 1.0.10: see sounds as well as hear them. Gunfire, footsteps, ringing phones, alarms and traps show an icon on the exact spot they come from, so you can play without sound. Plus operator fixes: Pulse Scan and Signal Hack now find bots, Murk\u2019s canisters go off with X, and traps on furniture work.' },
  { date: '2026-11-04', game: 'siege', text: 'Siege 1.0.9: once you are out, press 5 to watch the cameras (defenders) or your team\u2019s drones (attackers) and click to mark enemies for your team. Attacking bots now shoot out cameras they see.' },
  { date: '2026-11-04', game: 'siege', text: 'Siege 1.0.8: drones. They can no longer drive or hop through walls and barricades, every attacker has one drone, and Shift gives it a 5 second boost three times a round.' },
  { date: '2026-11-04', game: 'siege', text: 'Siege 1.0.7: solid barricades. A barricade is now one board with no gaps, and every bullet that goes through it leaves a hole you can see and shoot through. Two melee hits or a shotgun blast bring it down, and attacking bots now break through barricades instead of walking round them.' },
  { date: '2026-11-04', game: 'havoc-bay', text: 'Havoc Bay 1.2.3: the water is freezing! A freeze meter shows over your head while you swim, and after 30 seconds in the water you freeze to death. The computer in your harbor\u2019s keep has a new Map app that shows every ship, plane and soldier in the battle live.' },
  { date: '2026-11-04', game: 'poly-racer', text: 'Poly Racer 1.4: the wheels no longer wobble when you drive (the brake calipers stay still and stray parts that swung round the axles are gone), and the cockpit view is fixed: you sit where a driver\u2019s eyes are, and dashboards, pillars and seats are no longer see-through.' },
  { date: '2026-11-04', game: 'card-royale', text: 'Card Royale 1.0.2: bots give trophies! If nobody else is online, a bot takes your battle after a few seconds and it counts like any battle: trophies, gold, crowns and chests. Tap the arena picture for a Bot Battle straight away (ranked or practice). Plus a new look: a checkered field with dirt paths, a river that runs off both edges, fences, blocky trees and rocks, a wooden card tray, a floating island on the Battle tab, and every arena in its own colors, from snow with a frozen river to stone with a river of lava.' },
  { date: '2026-11-04', game: 'siege', text: 'Siege 1.0.6: melee (V) now really hits: it hurts enemies and smashes barricades, which now break all at once after a few hits. Drones can drive under door barricades but can no longer slip through walls, and leaning is smooth and can\u2019t poke through barricades any more.' },
  { date: '2026-11-04', game: 'siege', text: 'Siege 1.0.5: down but not out! A lethal hit that isn\u2019t a headshot puts you on the floor while a teammate is still up, and they can revive you before you bleed out. Defenders share 10 reinforcements, 3-3 goes to overtime (first to 5), planting takes 7 seconds, a raised riot shield means no gun, and the new map is now called Oregons.' },
  { date: '2026-11-03', game: 'siege', text: 'Siege 1.0.4: a new map, Ridgeback Ranch! A survivalist compound on the plains in broad daylight, with a chapel hall, two towers, bunk rooms and cellars. Every map is brighter, there is a new top bar (your team\u2019s health, the enemy hidden until spotted), a big 3-2-1 before each round, drones can hop again, and losing your drones in prep lets you watch your team\u2019s.' },
  { date: '2026-11-03', game: 'siege', text: 'Siege 1.0.3: fixes and no jumping. Bots only see and shoot you with a real line of sight and aim like people (a moment to react, shaky aim that settles, recoil). Right click now toggles aiming (Hold is in Settings), nobody can be hurt in the prep phase, defenders get 5 barricades and 3 reinforcements, and walls and floors no longer turn black or patchy. There is no jump any more: you climb over windows, counters and low furniture by walking into them.' },
  { date: '2026-11-03', game: 'siege', text: 'Siege 1.0.2: chat! In an online room, press Enter or T to talk to everyone, or Y to talk to your own team only (Tab switches while you type). It works in the lobby and while you pick your operator too, and swear words are starred out.' },
  { date: '2026-11-03', game: 'havoc-bay', text: 'Havoc Bay 1.2.2: chat! In the Public Battle and in private rooms, press Enter or T to talk to everyone, or Y to talk to your own team only (Tab switches while you type). On a touch screen, tap the 💬 button. It works in the lobby too, and swear words are starred out.' },
  { date: '2026-11-06', game: 'card-royale', text: 'The Global chat is fixed: everyone now sees the same messages, kept on the server. New Players tab: search every player, see their best scores, add friends and send private messages.' },
  { date: '2026-11-03', game: 'card-royale', text: 'Card Royale 1.0.1: a new look. More detailed towers (stone bricks, banners, arrow slits, the King\u2019s gate and crest), shadows on everything, a more detailed arena with cobbled paths, flowers, lily pads, sparkling water, sturdier bridges and rope fences, and chunkier buttons that press down when you tap them.' },
  { date: '2026-11-03', game: 'card-royale', text: 'New game: Card Royale 1.0! Real-time 1v1 card battles online. Press Battle to find an opponent, drop troops and spells with Elixir, and knock down more towers than them in three minutes (or the King Tower for an instant win). 50 cards to collect from chests, 3 free chests every day, a shop, King levels that give you chests, trophies and arenas, plus emotes and chat during battles.' },
  { date: '2026-11-02', game: 'siege', text: 'Siege 1.0.1: map fixes. The ends of every staircase are open (no more jumping on and off), drones can drive upstairs and downstairs, you can jump through open windows again, bots stop getting stuck on furniture, and every map is a little brighter.' },
  { date: '2026-11-02', game: 'siege', text: 'New game: Siege 1.0. The 5v5 tactical mode from Cube Assault 3.0 is now a game of its own, with a cleaner menu, its own profile and levels, settings and patch notes. Rooms no longer fill up with bots by themselves: the host adds bots to either team, one at a time, or leaves the slots open for friends. Vs bots still starts as a full 5v5.' },
  { date: '2026-11-02', game: 'cube-assault', text: 'Cube Assault 3.0: Siege! A brand-new 5v5 tactical mode. Attackers drone the building, breach in and plant the defuser; defenders reinforce walls, barricade doors and set traps. One life a round, walls you can shoot through and blow open, 20 operators with their own guns and gadgets, and three new dark indoor maps: Marlowe Hotel, Port Authority and Ashgrove Manor. Play against bots or online with up to 10 players.' },
  { date: '2026-11-01', game: 'uno', text: 'New game: UNO! 1.0. The classic card game for 2 to 10 players, against bots or online with friends. Match by colour, number or symbol, play Skips, Reverses, Draw Twos and Wilds, and call UNO on your last card. Three modes: Classic (first to 500), No Mercy (stack the +2/+4/+6/+10, 0s pass hands, 7s swap and 25 cards knocks you out) and Flip, where a Flip card turns the whole deck over to the dark side. Make a room, share the code, and fill the empty seats with bots.' },
  { date: '2026-11-01', game: 'football', text: 'Football 1.1.1: much smoother online play for the player who joins a room. The match now updates 30 times a second instead of 15 and plays back smoothly between updates, legs and kicks animate properly, and your own player reacts to your controls straight away instead of a moment later. Your inputs also reach the host faster.' },
  { date: '2026-11-01', game: 'cube-assault', text: 'Arcade accounts are here! Make a free account (just a username and a password) and your progress in every game is saved online, so you can play on any device. Your username is your name in every game, and nobody else can ever take it. Everything you already have moves into your account when you make one.' },
  { date: '2026-11-01', game: 'havoc-bay', text: 'Havoc Bay 1.2.1: a missile computer in the command room of each harbor. Log on, pick an island and the strike wipes it out (one missile every 2.5 minutes). Planes can now land on carriers and runways to repair, teammates can ride as gunners in a Dual Gunner, Crown Isle has runways, the islands are livelier and plane crashes hit twice as hard. Plus bug fixes for the Public Battle.' },
  { date: '2026-11-01', game: 'havoc-bay', text: 'Havoc Bay 1.2: a cleaner menu with its own sea-battle theme, a settings button and full patch notes. Pick a side to join the public battle (no more bots online). Ships are 10% faster, islands are full of trees, and there are four new guns on foot plus a dual gunner plane. Press C for a cockpit view. Shot-down planes now glide down with you so you can bail out or kamikaze, and crashes hit hard.' },
  { date: '2026-11-01', game: 'chess', text: 'Chess 1.3: three new computer levels on top of the old ones. Casual sits between Easy and Medium, Advanced between Medium and Hard, and Master is harder than Hard.' },
  { date: '2026-11-01', game: 'football', text: 'Football 1.1: the World Cup is here, with all 48 teams, 12 groups, a Round of 32, extra time and penalties. And online play: Friendlies and Ultimate Team against a friend, with the host setting the rules.' },
  { date: '2026-11-01', game: 'cube-assault', text: 'Cube Assault 2.9.17: Seaside is back in single-player and multiplayer, and every map now has anti-cheat laws. Get out of bounds and your shots are blocked, the cubes come straight through the walls for you, and after 5 seconds you are put back. The pier on Seaside is no longer a safe spot.' },
  { date: '2026-11-01', game: 'havoc-bay', text: 'Havoc Bay 1.1: a new, more realistic look (real shading, weathered surfaces, a deeper sea and a hazy sky), working nose guns on the bomber, a lead marker for dogfights, a PULL UP warning, Deploy again, a field of view setting and a marker showing how far the enemy harbor is.' },
  { date: '2026-11-01', game: 'gamble-your-life-away', text: 'Gamble Your Life Away 1.1: 20 new games on a bigger casino floor, including Texas Hold’em, Three Card Poker, three new slot machines, Balloon Pop, Bowling and Darts, plus a balance pass and bug fixes for the original 24.' },
  { date: '2026-10-31', game: 'free-criminal', text: 'Free Criminal 2.0.3: online play is back for everyone. The shutdown is cancelled, there is a new Everyone chat pinned at the top of Messages on your phone, and a warning before joining that online chat is not moderated.' },
  { date: '2026-10-31', text: 'All online play on the arcade (multiplayer, the on now counters and Global chat) moved to new servers with much more room, so online games should stay up and feel smoother. Your saves are not affected.' },
  { date: '2026-10-30', game: 'cube-assault', text: 'Cube Assault 2.9.15, critical update: the Seaside map is down and under construction for now. It cannot be played in single-player or multiplayer until it returns in a future update.' },
  { date: '2026-10-28', game: 'cube-assault', text: 'Cube Assault 2.9.14: four new cubes. The Bomber (explodes), the Medic (heals other cubes), the Shield (bullets bounce off) and Swarm packs of eight tiny fast cubes. Frontier and Seaside now have buildings you can go into, with stairs up to the roof, and they collapse if too many cubes crowd round them. The Forest is much bigger, the Mall is busier and livelier, and the Rocket and Pumpkin Launchers can rocket jump.' },
  { date: '2026-10-27', game: 'cube-assault', text: 'Cube Assault 2.9.13 Halloween update: three new maps. Seaside (a beach town with a long pier), Forest (dark, dense woods, hard) and Mall (a huge three floor shopping mall with escalators, 45 shops, a carpark and shoppers running from the cubes, very hard). Every map but Classic is decorated for Halloween while the event is on, every map shows its difficulty and your best wave, and Classic has moved to a Legacy section. The Battle Pass now gives Jacks Grin at level 10, Reapers Lantern at level 25 and a new Limited Edition gun at level 50: the Pumpkin Launcher. The three new maps work in multiplayer too (every mode but C:S Mode).' },
  { date: '2026-10-27', game: 'cube-assault', text: 'Cube Assault 2.9.12: show off a knife you own on your profile, and other players see it when they open your profile. When the Halloween 2026 Event ends, its Battle Pass locks and its two knives become Limited Edition, with their own section in My knives.' },
  { date: '2026-10-27', game: 'gamble-your-life-away', text: 'Gamble Your Life Away 1.0.8: bug fixes, improvements and an enhanced user experience.' },
  { date: '2026-10-27', game: 'free-criminal', text: 'Free Criminal 2.0.2: Play (offline) is the main mode again. Online play shuts down on October 29, 2026: until then it still works, and after the countdown all online play is terminated. Offline play remains fully functional.' },
  { date: '2026-10-26', game: 'cube-assault', text: 'Cube Assault 2.9.11: the Halloween 2026 Event! The first Battle Pass (the button in the bottom right of the home screen) has 50 levels of coins and knife crates, with two Halloween knives you can only get this week: Jacks Grin at level 25 and Reapers Lantern at level 50. The event ends at the same time for everyone. Team Deathmatch and C:S Mode rooms now grow to fit up to 5v5.' },
  { date: '2026-10-26', game: 'football', text: 'Football 1.0.2: the Laws of the Game. Assistant referees flag offsides, the fourth official shows added time, VAR checks goals and penalties, handballs, indirect free kicks, dropped balls, penalty shootouts (turn on Penalties for draws), and players keep their distance at free kicks, goal kicks and kick-offs. Hold a pass button for a harder pass, your passes always reach your player, keepers are better and the computer makes mistakes too.' },
  { date: '2026-10-26', game: 'rocket-rivals', text: 'New game: Rocket Rivals 1.0! Rocket-powered car football with boost, flips, wall driving and aerials. Ten cars to customise, fifteen goal explosions, six arenas, ranked playlists, Snow Day, Rumble and Heatseeker, a season, tournaments, training and the Rivals Pass. Online opponents are bots for now.' },
  { date: '2026-10-26', game: 'football', text: 'Football 1.0.1: change any key you like. Open Customise and pick Keyboard Keys, click an action and press the new key (two actions swap if the key is taken). Works with both the FIFA and Classic layouts, and the hints in matches show your own keys.' },
  { date: '2026-10-26', game: 'poly-racer', text: 'Poly Racer 2.4: eight real cars modelled inside and out, with proper paint, chrome, glass and their own dashboards, and your gloved hands on the wheel in the cockpit. A new Ultra graphics setting adds photographed skies and road surfaces, real trees, reflections in the water and on wet roads, puddles and spray in the rain, soft shadows and motion blur. Headlights that light the road at night, scrapes and cracked glass after a crash, and a photo mode (F9 or the pause menu, touch too). The van has left the garage.' },
  { date: '2026-10-25', game: 'football', text: 'New game: Football 1.0! Realistic 11 v 11 matches with broadcast cameras, replays and celebrations, fouls, cards and penalties, morning, afternoon and evening kick offs, Ultimate Team with packs and a squad, 9 skill games, menu music, profiles and controller support. It is a work in progress and will keep improving.' },
  { date: '2026-10-25', game: 'cube-assault', text: 'Cube Assault 2.9.10: a friends list with friend requests (accept or decline), player profiles and invites, a new Bombs section in the Shop with the grenade and the landmine, a bomb slot in the multiplayer loadout, a scope on the Extreme Gun, knife crates for 50 coins or 10 for 400, and fixes for public lobbies, door frames, the Outpost floor and Frontier spawns.' },
  { date: '2026-10-24', game: 'cube-assault', text: 'Cube Assault 2.9.9: a Radio in the Shop with 10 upbeat tracks that everyone in a match hears in sync, flashbangs and barricades you buy once, barricades in multiplayer, Co-op with no time limit that freezes when the host pauses, the Extreme Gun now 2500 coins, the FPS counter on by default and the patch notes on first load.' },
  { date: '2026-10-24', game: 'cube-assault', text: 'Cube Assault 2.9.8: the new 1v5 boss mode for 6 players, rooms for up to 10 players (5v5 C:S Mode), loadouts with 2 small and 3 big guns on your hotbar, a 20 second prep before fighting, match modifiers, spectating, flashbangs, smoke, medkits and a defuse kit in the Shop, shared Co-op waves, a bigger Outpost and a sniper balance change. This version prepares the game for 3.0.' },
  { date: '2026-10-23', game: 'poly-racer', text: 'Poly Racer 1.2: races! 30 full-length circuits and street races (grand prix tracks, city streets, forest trails, beaches and mountain passes) against 15 computer drivers, and online races for up to 10 in public or private rooms. Choose the laps, time of day, season and weather, and the right tyres. Plus detailed car models with damage, a new cockpit with working mirrors, profiles with 50 helmets and 50 race suits, music, a new speedometer and better engine sounds.' },
  { date: '2026-10-22', game: 'poly-racer', text: 'Poly Racer 1.1: 94 new tracks in nine new worlds (100 in all) with gold, silver and bronze times, a garage of 11 cars from Free Criminal, a first-person cockpit view, all-new realistic graphics with dense forests, smoother steering and a steadier car, new engine sounds, and a new menu. Fall off the track and you can keep driving; press R to respawn.' },
  { date: '2026-10-22', game: 'free-criminal', text: 'Free Criminal 2.0: chat moves to your phone with group chats (invites have to be accepted), real street lights and headlights, textures on every surface, a car dealership with nine cars you keep in your garage, a high school with students and school buses, a new rifle and a pile of fixes.' },
  { date: '2026-10-21', game: 'cube-assault', text: 'Cube Assault 2.9.7 update: 25 more knife skins (125 in all), 10-crate openings spin one by one, practice against cubes in a multiplayer lobby while you wait, and later waves pay fewer coins.' },
  { date: '2026-10-21', game: 'cube-assault', text: 'Cube Assault 2.9.7: 50 more knife skins (100 in all), knife crates for 60 coins or 10 for 500, a new knife grip, and other players now hold their real guns and knife skins online.' },
  { date: '2026-10-21', game: 'cube-assault', text: 'Cube Assault 2.9.6: knife crates in the Shop for 75 coins. Spin for one of 50 knife skins, from Common (50%) to Legendary (0.1%), plus a new Counter-Strike style knife held sideways, and bug fixes.' },
  { date: '2026-10-21', game: 'cube-assault', text: 'Cube Assault 2.9.5: a brand new Shop with Guns and Utilities, the Revolver, the AK-47 and the Minigun, every gun except the pistol now in the Shop, your own guns in multiplayer, death replays online, 45 coins per online win and 20 new achievements.' },
  { date: '2026-10-20', game: 'gamble-your-life-away', text: 'Gamble Your Life Away 1.0.7: a new opening cinematic plays as you walk in, from the roulette wheel and the craps table to a 7-7-7 jackpot, Plinko, a photo finish at the horses and the house shoving every chip it has across the blackjack table. Watch it again from the main menu.' },
  { date: '2026-10-20', game: 'free-criminal', text: 'Free Criminal 1.9.4: the train to Isla Verde now crosses the bay outside, on its own track beside the bridge, with passengers you can see from the road. Subway stations are now train stations, with new departure boards. Dying or getting busted costs just $250, and 1.9.3 and older can no longer play online.' },
  { date: '2026-10-20', game: 'russian-roulette', text: 'Russian Roulette 1.3: online Buckshot for 2 to 6 players. Make a private table and send friends the code, or let Quick match fill a table. With three or more you sit round a round table, pick who to shoot each turn, and the last one standing wins.' },
  { date: '2026-10-20', game: 'free-criminal', text: 'Free Criminal 1.9.3: two new phone apps, Train Times (every station and the next train) and PAYTransfer (send other players up to $6,000 every 10 minutes), plus online subway fixes.' },
  { date: '2026-10-20', game: 'free-criminal', text: 'Free Criminal 1.9.2: start with $10,000, online only on the latest version, walk across the subway tracks (watch for trains), next-stop screens on the trains, your map follows the train, and more shops in every town.' },
  { date: '2026-10-20', game: 'free-criminal', text: 'Free Criminal 1.9.1: the subway. Every city has an underground station with two platforms and a train every minute; ride it to the next city in 20 seconds.' },
  { date: '2026-10-20', game: 'cube-assault', text: 'Cube Assault 2.9.4: the campaign begins. Press Campaign to watch the opening cinematic: the helicopter briefing, the missile, the crash and the fall over the island. The full campaign arrives in 3.0.' },
  { date: '2026-10-20', game: 'cube-assault', text: 'Cube Assault 2.9.3: new multiplayer map Dust II, for Team Deathmatch, Free-for-all and C:S Mode, with long, mid, short, catwalk, the B tunnels and both bomb sites.' },
  { date: '2026-10-19', game: 'cube-assault', text: 'Cube Assault 2.9.2: a new look and a new sound. New menus with a cinematic helicopter background, a Play screen (Campaign, Singleplayer, Multiplayer, Missions), a heavy war soundtrack, iPad mode, a one-screen shop and a scope key.' },
  { date: '2026-10-19', game: 'havoc-bay', text: 'Havoc Bay has a new title screen: a cinematic reel of a fighter cockpit over the clouds, a carrier deck and catapult launch, and soldiers advancing under Black Hawks. Set Graphics to Low in Settings to get the old battle view back.' },
  { date: '2026-10-19', game: 'cube-assault', text: 'Cube Assault 2.8.4: bug fixes, and the Campaign is now called Missions. Cube Assault 3.0 is coming with a brand-new campaign and a new UI.' },
  { date: '2026-10-19', href: 'chat.html', text: 'New: Global chat. Press Chat at the top of the arcade to talk with everyone who\'s on. Messages are kept only in your own browser.' },
  { date: '2026-10-19', game: 'free-criminal', text: 'Free Criminal 1.9, the big one: a phone with private messages and myBANK, your game saves, buses you can rob, ride in other players\u2019 cars, car fights online, chat settings and busier cities.' },
  { date: '2026-10-19', game: 'free-criminal', text: 'Free Criminal 1.8.5: press T to chat online (now also while respawning), with a hint on screen and a Chat button on phones.' },
  { date: '2026-10-19', game: 'free-criminal', text: 'Free Criminal 1.8.4: hold Tab to see everyone playing online, and M opens the full map screen.' },
  { date: '2026-10-19', game: 'free-criminal', text: 'Free Criminal 1.8.3: online players no longer disappear for each other, and everyone shows on the big map with their name.' },
  { date: '2026-10-19', game: 'free-criminal', text: 'Free Criminal 1.8.2: online, everyone now has the same time of day (to the minute) and the same weather.' },
  { date: '2026-10-18', game: 'free-criminal', text: 'Free Criminal online: drive into another player and they go ragdoll flying, and 10 seconds of spawn protection when you join or respawn.' },
  { date: '2026-10-18', game: 'free-criminal', text: 'Free Criminal 1.8.1: Play online is now the top, recommended way to play; Play offline checks with you first, and the update splash shows the newest version.' },
  { date: '2026-10-18', game: 'havoc-bay', text: 'New game: Havoc Bay. A Red vs Blue sea battle: command warships and aircraft carriers, fly planes, man the harbor guns, claim islands and destroy the enemy harbor. Play online on the shared server, in a private room, or against bots.' },
  { date: '2026-10-18', game: 'bull-run', text: 'New game: Stocks Game. A stock-trading game with twelve companies, live prices, earnings, dividends, rumours, news that moves the market and the odd crash. Short sell, buy insider tips, run a pump and dump, borrow from a loan shark or bribe the regulator, all at your own risk: three convictions means prison. Your best net worth unlocks crypto, cheaper deals and options. Every year you get a report card against the market, and the daily challenge gives everyone the same market for one year and one score to share.' },
  { date: '2026-10-18', game: 'cube-assault', text: 'Chat in multiplayer: Cube Assault (press Enter in a lobby or a match), Free Criminal online (press T) and online Chess (the box under Play online).' },
  { date: '2026-10-18', game: 'free-criminal', text: 'Free Criminal 1.7: play online. Press Play online on the menu to share San Varro with everyone else who does. See each other drive and run around, find each other on the minimap, and shoot it out.' },
  { date: '2026-10-18', game: 'chess', text: 'Chess 1.1: play online. Type your name under Play online and press Quick match to play another person, or make a private table and send a friend the code. Colours swap every rematch.' },
  { date: '2026-10-18', game: 'russian-roulette', text: 'Russian Roulette 1.2.1: Buckshot online. Pick Buckshot, press Play online, and play the shotgun game against a real person, items and all. Quick match now says when you\'re the only one waiting.' },
  { date: '2026-10-18', game: 'russian-roulette', text: 'Russian Roulette 1.2: play online. Press Play online on the main menu to play a real person: Quick match finds whoever is waiting, or make a private table and send a friend the 5-letter code.' },
  { date: '2026-10-18', game: 'cube-tower-defense', text: 'Cube Tower Defense 1.2.1: your base\'s health now floats right on top of your fort instead of in the corner.' },
  { date: '2026-10-18', game: 'free-criminal', text: "Free Criminal 1.6.2: the lottery is closed (tickets are under construction and can't be bought), and you can no longer lose your wanted stars by standing outside the store you just robbed." },
  { date: '2026-10-18', game: 'cube-assault', text: "Cube Assault 2.8.2: an FPS counter in the top left (turn it off in Settings), and Level 3's first aid kit now heals you twice before it restocks." },
  { date: '2026-10-18', game: 'cube-assault', text: "Cube Assault 2.8.1: a first aid kit back in our trench on Level 3, The Western Front. Walk up to it for +40 HP, then it restocks in 25 seconds." },
  { date: '2026-10-17', game: 'cube-assault', text: "Cube Assault 2.8, the campaign update: Level 3, The Western Front, public lobbies in multiplayer, 34 achievements with badges, keybinds, every barrel explodes, two turrets after wave 15, 45-coin barricades and a rebuilt Apex Support." },
  { date: '2026-10-17', game: 'blockcraft', text: 'Blockcraft 6.0, the final update: multiplayer. Press Multiplayer on the title screen to join the public server, one survival world everyone shares that\'s open all the time. See other players, build together, chat with T, fight with PvP, and hold Tab to see who\'s on.' },
  { date: '2026-10-17', game: 'russian-roulette', text: 'Russian Roulette 1.1.3: a more scared stranger, with darting eyes, worried brows, swallowing and a trembling jaw, and new ways to hesitate before he pulls the trigger.' },
  { date: '2026-10-17', game: 'russian-roulette', text: 'Russian Roulette 1.1.2, new game mode: Buckshot. A shotgun with live and blank shells, health charges, three rounds and items (magnifying glass, handcuffs, handsaw, beer, cigarettes). Pick it with Change gamemode under Sit down.' },
  { date: '2026-10-17', game: 'chess', text: 'New game: Chess. Play the computer on Easy, Medium or Hard on a classic green board, with every rule of chess and your games saved.' },
  { date: '2026-10-17', game: 'russian-roulette', text: 'Russian Roulette 1.0.3: a more human stranger. His eyes dart and widen, he swallows, his jaw trembles, his shoulders hunch, he holds his breath before he pulls and flinches at every click. He hesitates in his own way (staring you down, shutting his eyes, muttering, tightening his finger and easing off), but always pulls within a few seconds. His hands open and close round the gun, which he now picks up properly. When the bullet is yours the screen just goes black, with nothing red after it.' },
  { date: '2026-10-17', game: 'cube-tower-defense', text: 'Cube Tower Defense 1.2, Upgrades: click any unit to upgrade it. Every unit has two upgrade paths with three levels each. The Freezer now costs 95 and the Flamethrower 110.' },
  { date: '2026-10-17', game: 'russian-roulette', text: 'Russian Roulette 1.0.2: fair 1 in 6 odds on every pull, a new stranger every game with a different shirt colour, hair colour and hairstyle (8 styles, including a mohawk and a flat cap), and bug fixes.' },
  { date: '2026-10-17', game: 'russian-roulette', text: 'Russian Roulette 1.0.1: the stranger no longer loses an eye, the screen just goes black when the bullet is yours, and when it is his it is far bloodier and darker, with his blood spattered across the top of your screen.' },
  { date: '2026-10-17', game: 'russian-roulette', text: 'New game: Russian Roulette. A first-person standoff in a dim room: call the coin toss, spin the cylinder and pull the trigger against a stranger. Every pull is a 1 in 6 chance. Build the longest win streak you can.' },
  { date: '2026-10-16', game: 'gamble-your-life-away', text: 'Gamble Your Life Away 1.0.6, urgent update: Limbo tops out at 2x and never pays out, and the Big Six Wheel is heavily nerfed (lower payouts, your symbol comes up about 1 spin in 5).' },
  { date: '2026-10-16', game: 'gamble-your-life-away', text: 'Gamble Your Life Away 1.0.5, critical bug fixes: every button now works every time (they no longer jump around or get covered by the stress meter), and the rope in the $0 scene goes all the way round your wrists.' },
  { date: '2026-10-16', game: 'blockcraft', text: 'Blockcraft 5.1: boats, a fishing line, real fireworks and Minecraft textures for the ores, deepslate, woods, stone, TNT and more, classic-style tool icons, stairs, slabs and fences for every wood, lily pads on water, and fixes for ghasts, lava and memory.' },
  { date: '2026-10-16', game: 'cube-assault', text: 'Cube Assault 2.7.2: red barrels leak fuel then explode, barricades in the Shop to board up house doors (press J), and a scope lock setting for trackpads and iPads.' },
  { date: '2026-10-16', game: 'cube-assault', text: 'Cube Assault 2.7.1: the Angry Cube smashes through walls, trees and buildings from wave 20, cubes jump fences and crates, you can climb crates, and the Brute Cube has twice the health.' },
  { date: '2026-10-16', game: 'cube-assault', text: 'Cube Assault 2.7: new hands in tactical gloves holding every gun, a scope on the rifle (right-click to aim), a new-look pistol and a knife that pokes forward.' },
  { date: '2026-10-15', game: 'cube-assault', text: 'Cube Assault 2.6.2, C:S Mode: other players are now low-poly people with 6 different looks and red dots over enemies, a victory scene plays at the end of every online match, winners get 50 coins, and the rifle joins the C:S Mode gun choice.' },
  { date: '2026-10-15', game: 'cube-assault', text: 'Cube Assault 2.6.1: C:S Mode in multiplayer. Terrorists plant a bomb at site A or B and guard it for 60 seconds, Counter-Terrorists stop them or defuse it in 12 seconds. Plus a starting gun choice in C:S Mode and Free-for-all.' },
  { date: '2026-10-15', game: 'cube-assault', text: 'Cube Assault 2.6: real online multiplayer. Create a match, share the code and play Team Deathmatch, Free-for-all or Co-op with up to 6 friends, on any device and on school networks too.' },
  { date: '2026-10-15', game: 'cube-assault', text: 'Cube Assault 2.5: a multiplayer preview with room codes, Red and Blue teams, Team Deathmatch, Free-for-all and Co-op (practice bots for now, real online play is coming), plus Outpost, a new map with A and B sites.' },
  { date: '2026-10-15', game: 'free-criminal', text: 'Free Criminal 1.6, a major update: every cafe, sushi bar, bakery and bookshop is open. Press B to buy or E to rob, food gives a speed boost, and drivers heads no longer poke through car roofs.' },
  { date: '2026-10-15', game: 'free-criminal', text: 'Free Criminal 1.6: every cafe, sushi bar, bakery and bookshop is open. Press B to buy or E to rob, food gives a speed boost, and drivers heads no longer poke through car roofs.' },
  { date: '2026-10-15', game: 'gamble-your-life-away', text: 'Gamble Your Life Away 1.0.4: every game now wins 40% of the time, you start with $80,000, and the stress meter moved to the top right.' },
  { date: '2026-10-15', game: 'gamble-your-life-away', text: 'Gamble Your Life Away 1.0.3: the house now wins 3 rounds in 4, debt gets you shot by the casino worker, and a new stress meter: buy a pack of cigarettes to calm down.' },
  { date: '2026-10-15', game: 'gamble-your-life-away', text: 'Gamble Your Life Away 1.0.2: hit exactly $0 and the casino gives you one last 50/50 spin at the roulette wheel. Plus a rebuilt roulette wheel.' },
  { date: '2026-10-15', game: 'blockcraft', text: 'Blockcraft 2.0: the Nether and the End. Nether portals, fortresses, bastions, strongholds, the Ender Dragon and elytra, every Minecraft mob, new biomes (cherry grove, pale garden, swamp, jungle, badlands and more), the deep dark with ancient cities and the warden, witch huts, desert pyramids, igloos, and the new sulfur caves. Old worlds keep working.' },
  { date: '2026-10-15', game: 'gamble-your-life-away', text: 'Gamble Your Life Away 1.0.1: fairer odds in every game, no more overlapping or flickering textures, a fixed neon sign and lots of bug fixes.' },
  { date: '2026-10-15', game: 'gamble-your-life-away', text: 'New game: Gamble Your Life Away. A 3D casino with 24 games and $50,000 to spend. End a round in debt and the casino gets you.' },
  { date: '2026-10-15', game: 'cube-tower-defense', text: 'Cube Tower Defense 1.1.3: wave coins cut in half, a new Shotgunner with huge short-range spread damage, and bug fixes.' },
  { date: '2026-10-14', game: 'cube-tower-defense', text: 'Cube Tower Defense 1.1.2: tighter money, Farms that pay 20 coins a wave, the minigun Commando, and the King Cube boss from wave 15.' },
  { date: '2026-10-14', game: 'free-criminal', text: 'Free Criminal 1.5, the cutscene update: a new opening where the guards throw you in a dumpster, cutscenes when you buy or rob at stores, grocery stores, a profile with your name, levels and outfits, speed cameras, and past patch notes.' },
  { date: '2026-10-14', game: 'cube-tower-defense', text: 'New game: Cube Tower Defense. Place your squad along the road and stop the cubes from Cube Assault reaching your fort.' },
  { date: '2026-10-14', game: 'cube-assault', text: 'Cube Assault 2.4: Hard mode for endless (tougher cubes and more of them) and the giant orange Splitter Cube from wave 20.' },
  { date: '2026-10-14', game: 'free-criminal', text: 'Free Criminal 1.4: a world 7 times bigger with forests, farms and new towns, a giant bridge to an island, enterable buildings, safehouses, day and night, rain, touch controls and much more.' },
  { date: '2026-10-14', game: 'free-criminal', text: 'Free Criminal 1.2: drag drivers out when you carjack, police with vision cones (shown on the minimap), many more homes and trees, and the hospital bill now shows on your cash.' },
  { date: '2026-10-14', game: 'cube-assault', text: 'Cube Assault 2.3: play on your phone or tablet, with a joystick, drag-to-look and buttons for fire, jump, reload and switching guns.' },
  { date: '2026-10-14', game: 'blockcraft', text: 'Blockcraft 1.5: new village houses (cobblestone cottages, plank houses with stair roofs, white plaster houses, a blacksmith) plus stairs, slabs, doors, fences, lanterns and hay bales you can craft.' },
  { date: '2026-10-14', game: 'free-criminal', text: 'Free Criminal 1.1: 3× the traffic and crowds, ragdoll crashes, gun stores with 10 guns and grenades, a mall to rob, a denser city and a new HUD.' },
  { date: '2026-10-14', game: 'blockcraft', text: 'Blockcraft 1.4: villages with villagers and an iron golem (plains, desert, taiga and snowy styles), and new skins for every mob.' },
  { date: '2026-10-14', game: 'blockcraft', text: 'Blockcraft 1.3.2: the first-person hand now sits and punches exactly like Minecraft Java.' },
  { date: '2026-10-14', game: 'blockcraft', text: 'Blockcraft 1.3.1: new grass, dirt, tall grass, oak bark and leaf textures, closer to the classic look.' },
  { date: '2026-10-14', game: 'blockcraft', text: 'Blockcraft 1.3: farming (hoes till farmland, plant seeds, grow wheat), shovel paths, mobs that spawn properly at night and in caves, fixed ice, and the sun no longer shines through blocks.' },
  { date: '2026-10-14', game: 'blockcraft', text: 'Blockcraft 1.2.1: no more "Click to play". The game grabs your mouse as soon as you pick a world.' },
  { date: '2026-10-14', game: 'blockcraft', text: 'Blockcraft 1.2: a Minecraft-style arm, head bobbing at Minecraft speed, sharper tree textures, and far-away chunks now unload for smoother frame rates.' },
  { date: '2026-10-14', game: 'cube-assault', text: 'Cube Assault 2.2: your SWAT team now fights beside you at Apex Support, and a new ending lets you climb out the window and blow the tower up.' },
  { date: '2026-10-13', game: 'free-criminal', text: 'New game: Free Criminal. Walk out of prison into San Varro, steal cars, rob the bank and outrun the cops.' },
  { date: '2026-10-13', game: 'cube-assault', text: 'Cube Assault 2.0: campaign Level 2, Apex Support. Lead a SWAT raid on a scam call centre in Mumbai, 2009, and decide the last scammer\'s fate.' },
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
    if (g.badge) return g.badge;
    const last = this.played()[g.id];
    if (!last) return Date.now() - Date.parse(g.added) < 30 * 864e5 ? 'NEW' : null;
    return Date.parse(g.updated) > Date.parse(last) ? 'UPDATED' : null;
  },
  stat(g) { try { return g.stat ? g.stat() : null; } catch (e) { return null; } },
};

// Live "on now" counter, using Supabase Realtime Presence (the arcade's Supabase project).
// Every open arcade page joins one presence channel and says which game it's on ('home' for the home page).
// Nothing is saved: the realtime server (our Cloudflare Worker, see rt.js) only sees who's connected right now.
// If it can't be reached (offline, blocked network) the counter just stays hidden.
// play.html shares its connection with the game in its frame through window.ArcadeOnline,
// so a player is only counted once. The publishable key is meant to be public.
// Each browser keeps one id (arcade-online-id), so moving between pages or having two tabs open
// counts as one person, and changes only show once they've held for a couple of seconds.
window.ArcadeOnline = (() => {
  const LIB = 'rt.js?v=2'; // the arcade's realtime client (Cloudflare), a drop-in for supabase-js
  const CAP = 200; // counts show as "200+" from here
  const SETTLE = 2500; // ms a new count has to hold before it's shown, so quick page changes don't flicker
  let counts = null, started = false, timer = 0, client = null, settled = false, names = {};
  const nameListeners = [];
  // the online account's name goes with the presence, so the Players page can show who's online
  const acctName = () => { const a = readSave('arcade-acct', true); return a && a.token && typeof a.name === 'string' ? a.name : ''; };
  const listeners = [], waiting = [];
  // the connection is open (or failed, with null): hand it to whoever asked through ready()
  const opened = c => { client = c; settled = true; for (const f of waiting.splice(0)) try { f(c); } catch (e) {} };
  const send = c => { counts = c; for (const f of listeners) try { f(c); } catch (e) {} };
  // first result and failures show straight away; changes after that wait until they settle
  const emit = c => {
    clearTimeout(timer);
    if (!c || !counts) send(c);
    else if (c.total !== counts.total || JSON.stringify(c.byGame) !== JSON.stringify(counts.byGame)) timer = setTimeout(() => send(c), SETTLE);
  };
  const browserId = () => {
    let id = readSave('arcade-online-id');
    if (!id) {
      id = (crypto.randomUUID && crypto.randomUUID()) || Math.random().toString(36).slice(2) + Date.now().toString(36);
      try { localStorage.setItem('arcade-online-id', id); } catch (e) {}
    }
    return id;
  };
  return {
    CAP,
    // Join as someone on `where` (a game id, or 'home'). Safe to call once per page.
    start(where) {
      if (started) return; started = true;
      const lib = document.createElement('script');
      lib.src = LIB; lib.async = true;
      lib.onerror = () => { emit(null); opened(null); };
      lib.onload = () => {
        try {
          opened(window.supabase.createClient());
          const ch = client.channel('online:arcade', { config: { presence: { key: browserId() } } });
          ch.on('presence', { event: 'sync' }, () => {
            // one entry per browser; if it has several pages open, count it on a game over the home page
            const state = ch.presenceState(), byGame = {};
            names = {}; // signed-in players online now: lower-case name -> the game they're on (for the Players page)
            for (const k in state) for (const m of state[k]) if (typeof m.n === 'string' && /^[A-Za-z0-9_]{3,16}$/.test(m.n)) { const l = m.n.toLowerCase(); if (!names[l] || names[l] === 'home') names[l] = m.game || 'home'; }
            for (const f of nameListeners) try { f(names); } catch (e) {}
            for (const k in state) {
              const gs = state[k].map(m => m.game || 'home'), g = gs.find(x => x !== 'home') || 'home';
              byGame[g] = (byGame[g] || 0) + 1;
            }
            emit({ total: Object.keys(state).length, byGame, full: Object.keys(state).length >= CAP });
          }).subscribe(status => {
            if (status === 'SUBSCRIBED') ch.track(acctName() ? { game: where, n: acctName() } : { game: where }).catch(() => emit(null));
            else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') emit(null);
          });
        } catch (e) { emit(null); if (!settled) opened(null); }
      };
      document.head.appendChild(lib);
    },
    // Called with { total, byGame, full } on every change, or null when the counter can't connect.
    subscribe(f) { listeners.push(f); if (counts) f(counts); },
    // "12", or "200+" once there are that many
    label(n, c) { return c && c.full ? n + '+' : String(n); },
    // The realtime connection, once it's open (null until then). Cube Assault's multiplayer shares it,
    // so a player in a match still uses just one connection.
    client() { return client; },
    // Calls f with the connection as soon as it's open, or with null if it can't be reached
    // (the global chat opens its own channel on it). Call start() first.
    ready(f) { if (settled) f(client); else waiting.push(f); },
    // Calls f({ lowerName: game }) for the signed-in players online now, on every change
    onNames(f) { nameListeners.push(f); f(names); },
  };
})();

// Site-wide notice (2026-11-05): a popup on the home, game and chat pages. Closing it is remembered per id in
// localStorage ('arcade-notice-closed'). To take it down, set SITE_NOTICE to null; to show a new one, change the id.
const SITE_NOTICE = { // 2026-11-10: Social launch (popup only, no banner; not shown on social.html itself)
  id: 'social-launch-2026-11-10',
  tag: 'New',
  title: 'Social is here! 🎬',
  text: 'The Arcade now has its own social app, like Instagram, in the new Social tab. Share your best moments and see everyone else’s.',
  items: [
    '<b>Clip the last 30 seconds.</b> Did something amazing just happen? Press <b>🎬 Clip last 30s</b> (or <b>F8</b>) in any game and it saves what you just played, sound and all.',
    '<b>Post photos and videos.</b> Tap <b>+</b> to share your own pictures and videos too.',
    '<b>Scroll Reels.</b> Swipe through clips one at a time. Double-tap to like, comment, share and save your favourites.',
    '<b>Follow players.</b> Follow people to see their posts first, watch their stories and see your views go up on your profile.',
    '<b>Messages.</b> A new inbox for your private chats, with a video call button for each one.'
  ],
  go: { text: 'Open Social', href: 'social.html' },
  skip: /social\.html$/,
};
const SITE_NOTICE_CHAT = { // 2026-11-06: the rebuilt Global chat and the new Players tab (popup only, no banner)
  id: 'chat-fixed-2026-11-06',
  tag: 'Fixed',
  title: 'The Global chat is fixed!',
  text: 'Messages now go through the arcade’s server, so everyone sees the same chat, even if they arrive later. The newest 150 messages stay there for everyone.',
  items: ['<b>New: Players tab.</b> Find any player, see their best score in every game, add friends and send private messages.', '<b>Chat names:</b> with an account you chat under your username; without one you show as a guest.'],
};
// The last notice, kept for reuse:
const SITE_NOTICE_OLD = {
  id: 'cf-outage-2026-11-05',
  tag: 'Server issue',
  banner: 'Online play is down right now because of a server issue. It should be back up soon. Offline and vs bots still work.',
  title: 'Online play is down for now',
  text: 'The cloud servers our online games run on (Cloudflare) are having issues, so online matches, the global chat, the player counter and account sign-in and cloud saves aren’t working at the moment.',
  items: ['<b>Still working:</b> every game offline and against bots. Your progress on this device is safe.', '<b>Online:</b> should be back to normal shortly. No need to do anything; just come back a bit later.'],
};
(() => {
  if (!SITE_NOTICE) return;
  // a strip across the top of the page that stays for as long as the notice is up
  const bar = () => {
    if (!SITE_NOTICE.banner || document.getElementById('siteNoticeBar')) return;
    const b = document.createElement('div'); b.id = 'siteNoticeBar'; b.setAttribute('role', 'status');
    b.style.cssText = 'position:relative;z-index:40;background:#f2b134;color:#1a1408;font:700 14px/1.35 system-ui,-apple-system,sans-serif;text-align:center;padding:8px 14px';
    b.textContent = '\u26a0\ufe0f ' + SITE_NOTICE.banner;
    document.body.prepend(b);
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bar); else bar();
  let closed = ''; try { closed = localStorage.getItem('arcade-notice-closed') || ''; } catch (e) {}
  if (closed === SITE_NOTICE.id) return;
  if (SITE_NOTICE.skip && SITE_NOTICE.skip.test(location.pathname)) return;
  const show = () => {
    const d = document.createElement('div'); d.className = 'notice'; d.style.zIndex = 2147483600; d.setAttribute('role', 'dialog'); // above the account popup (#acctOv) d.setAttribute('aria-modal', 'true');
    const box = document.createElement('div'); box.className = 'notice-box'; d.appendChild(box);
    const tag = document.createElement('div'); tag.className = 'notice-tag'; tag.textContent = SITE_NOTICE.tag; box.appendChild(tag);
    const h = document.createElement('h2'); h.textContent = SITE_NOTICE.title; box.appendChild(h);
    const p = document.createElement('p'); p.textContent = SITE_NOTICE.text; box.appendChild(p);
    const ul = document.createElement('ul'); for (const it of SITE_NOTICE.items) { const li = document.createElement('li'); li.innerHTML = it; ul.appendChild(li); } box.appendChild(ul);
    const done = () => { d.remove(); try { localStorage.setItem('arcade-notice-closed', SITE_NOTICE.id); } catch (e) {} };
    if (SITE_NOTICE.go) { // an optional button that goes somewhere (inside a game's frame, the whole page goes)
      const go = document.createElement('a'); go.className = 'notice-ok'; go.style.cssText = 'display:inline-block;text-decoration:none;margin-right:8px'; go.textContent = SITE_NOTICE.go.text;
      go.href = SITE_NOTICE.go.href; go.target = '_top'; go.onclick = done; box.appendChild(go);
    }
    const ok = document.createElement('button'); ok.className = 'notice-ok'; ok.textContent = SITE_NOTICE.go ? 'Later' : 'OK'; box.appendChild(ok);
    if (SITE_NOTICE.go) { ok.style.background = 'transparent'; ok.style.border = '1px solid #ffffff33'; }
    ok.onclick = done;
    document.body.appendChild(d);
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', show); else show();
})();
