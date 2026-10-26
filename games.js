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
    id: 'rocket-rivals',
    title: 'Rocket Rivals',
    category: 'Sports',
    tagline: 'Rocket-powered car football. Boost, jump, flip and fly to score in 1v1, 2v2 and 3v3.',
    description: 'Drive rocket cars around a walled arena and knock a giant ball into the other goal. Boost, double jump, flip, drive up the walls and onto the ceiling, fly for aerials and demolish opponents at supersonic speed. Play 1v1 to 4v4 against bots, ranked playlists, a season and tournaments, Snow Day, Rumble and Heatseeker, and training packs. Customise ten cars with decals, paints, wheels, boosts, toppers and fifteen goal explosions, and work through the Rivals Pass. Online play against real people comes later.',
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
    tagline: 'Realistic 11 v 11 football with broadcast cameras, replays, Ultimate Team and skill games.',
    description: 'A full 3D football game. Play a Kick Off match between national teams in the morning, afternoon or evening, with broadcast cameras, goal and foul replays, celebrations, fouls, cards, offside and penalties. Build a club in Ultimate Team with packs and a squad, and train in 9 skill games with bronze, silver and gold targets. Keyboard and DualShock 4 controllers are supported, with controls you can change in Settings. Version 1.0 is a work in progress.',
    controls: 'Keyboard or controller',
    keys: [['Arrow keys', 'Move'], ['Shift', 'Sprint'], ['S', 'Pass'], ['W', 'Through ball'], ['A', 'Cross or lob'], ['D', 'Shoot'], ['Q', 'Switch player'], ['Space', 'Skip intro or replay'], ['Esc', 'Pause'], ['Controller', 'DualShock 4 layout (change it in Settings)']],
    path: 'football/index.html',
    thumb: 'football/thumb.jpg?v=1',
    added: '2026-10-25T18:00:00+11:00',
    updated: '2026-10-26T12:00:00+11:00',
    stat() { const p = readSave('soccer.profile', true); return p && p.played ? p.played + ' matches played' : null; },
  },
  {
    id: 'havoc-bay',
    title: 'Havoc Bay',
    category: 'Action',
    tagline: 'Red vs Blue sea battle. Command warships, fly planes and destroy the enemy harbor, online or against bots.',
    description: 'A Roblox-style naval battle. Blue and Red each have a harbor with 25,000 health. Sail jet skis, turret boats, destroyers, battleships and aircraft carriers, fly fighters, jets and bombers, man the harbor guns, and claim five islands for turrets, forward spawns and gold. Play on the shared online server, where you take a bot\'s place, in a private room with friends, or offline against bots. The losing harbor gets a visit from a B-52.',
    controls: 'Keyboard + mouse or touch',
    keys: [['W A S D', 'Walk, or throttle and steer'], ['Mouse', 'Look and aim (planes fly where you aim)'], ['Click', 'Fire'], ['Right-click', 'Zoom'], ['F', 'Torpedo or drop a bomb'], ['R', 'Missile (jet, battleship)'],
           ['E', 'Use pads and turrets, get in and out'], ['Space', 'Jump, or level out a plane'], ['Shift', 'Sprint'], ['B', 'Deploy menu, or launch a plane from your carrier'], ['M', 'Map'], ['Tab', 'Scoreboard'], ['Esc', 'Pause']],
    path: 'havoc-bay/index.html',
    thumb: 'havoc-bay/thumb.svg',
    added: '2026-10-18T20:55:00+11:00',
    updated: '2026-10-19T17:29:00+11:00',
    stat() { const p = readSave('havocbay.profile.v1', true); return p && p.matches ? p.wins + (p.wins === 1 ? ' win' : ' wins') : null; },
  },
  {
    id: 'bull-run',
    title: 'Stocks Game',
    category: 'Strategy',
    tagline: 'Turn $10,000 into a fortune on a market that never sleeps.',
    description: 'A stock-trading game. Twelve companies, live prices, earnings, dividends, booms and the odd crash. Read the news, short the losers, and if you dare visit the back room: insider tips, pump-and-dump schemes, a loan shark and a regulator who takes bribes. Three convictions and you go to prison. Your portfolio is saved in your browser.',
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
    description: 'Play chess against the computer on a classic green board. Pick Easy, Medium or Hard, play as White, Black or a random colour, and drag or click your pieces. Every rule is in: castling, en passant, promotion, checkmate, stalemate and draws. Your game is saved, and your wins, losses and draws are kept for each level.',
    controls: 'Mouse or touch',
    keys: [['Drag or click', 'Move a piece'], ['Undo', 'Take back your last move'], ['Flip', 'Turn the board around'], ['Play online', 'Quick match or a private table']],
    path: 'chess/index.html',
    thumb: 'chess/thumb.svg',
    added: '2026-10-17T17:11:00+11:00',
    updated: '2026-10-18T18:23:51+11:00',
    stat() { const s = readSave('chessSave', true); if (!s || !s.stats) return null; const w = ['easy', 'medium', 'hard'].reduce((n, l) => n + ((s.stats[l] && s.stats[l].w) || 0), 0); return w ? w + (w === 1 ? ' win' : ' wins') : null; },
  },
  {
    id: 'russian-roulette',
    title: 'Russian Roulette',
    category: 'Thriller',
    tagline: 'One revolver, one bullet, six chambers. New: online Buckshot for 2 to 6 players at one table.',
    description: 'Sit across a table from a stranger in a dim, dirty room. A coin toss decides who goes first, then the cylinder is spun before every turn: put the revolver to your head and squeeze. Every pull is a 1 in 6 chance. Beat stranger after stranger to build a win streak, but one loaded chamber ends it.',
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
    tagline: 'A 3D casino with 24 games and $80,000. Just do not end up in debt.',
    description: 'Walk into a 3D casino with $80,000 and try 24 games: slots, roulette, blackjack, baccarat, craps, video poker, plinko, crash, mines, horse racing, keno, scratch cards and more. The house lends you a little credit, but end a round in debt and the casino kills you.',
    controls: 'Mouse or touch',
    keys: [['Drag', 'Look around the casino'], ['Click a game', 'Sit down and play'], ['Chips', 'Pick your bet'], ['Esc', 'Back to the casino floor']],
    path: 'gamble-your-life-away/index.html',
    thumb: 'gamble-your-life-away/thumb.jpg',
    added: '2026-10-15T10:15:00+11:00',
    updated: '2026-10-20T16:40:00+11:00',
    stat() { const s = readSave('gambleLifeSave', true); return s && s.rounds ? 'Richest ' + '$' + Math.round(s.peak).toLocaleString('en-US') : null; },
  },
  {
    id: 'cube-tower-defense',
    title: 'Cube Tower Defense',
    category: 'Strategy',
    tagline: 'Cubes march down the road to your fort. Place your squad and stop them.',
    description: 'Tower defense with the cubes from Cube Assault. Place Gunners, Archers, Bombers, Snipers, Freezers, Rocketeers and Flamethrowers along the winding road, send out mini tanks, and hold your fort through endless waves.',
    controls: 'Mouse or touch',
    keys: [['Click a unit', 'Pick it in the shop'], ['Click the grass', 'Place it'], ['1–8', 'Pick a unit'], ['Space', 'Start the next wave'], ['Right-click / Esc', 'Cancel'], ['Esc', 'Pause']],
    path: 'cube-tower-defense/index.html',
    thumb: 'cube-tower-defense/thumb.svg',
    added: '2026-10-14T21:26:00+11:00',
    updated: '2026-10-18T12:15:00+11:00',
    stat() { const p = readSave('cubeTDProfile', true); return p && p.best ? 'Best wave ' + p.best : null; },
  },
  {
    id: 'free-criminal',
    title: 'Free Criminal',
    category: 'Action',
    tagline: 'Fresh out of prison and thrown in a dumpster. Steal cars, rob stores and outrun the cops. New in 2.0: real lighting, a car dealership and group chats.',
    description: 'Open-world 3D crime game. Walk out of the penitentiary into a busy San Varro, steal any car, rob stores, the bank and the mall, pick from 10 guns and grenades at the gun stores and stay ahead of the police, who only spot you when you are in front of them. Crash hard and you fly out of the car. Every purchase and robbery plays its own cutscene, and your profile tracks your level, stats and outfits.',
    controls: 'Keyboard + mouse or touch',
    keys: [['W A S D', 'Walk / drive'], ['Mouse', 'Look'], ['Click', 'Fire'], ['Right-click', 'Aim'], ['R', 'Reload'], ['Shift', 'Sprint'],
           ['Space', 'Jump / handbrake'], ['F', 'Carjack or enter a car'], ['1', 'Take out / put away gun'], ['Q / Wheel', 'Switch gun'], ['G', 'Throw grenade'], ['E', 'Shop, or rob a store with a gun out'],
           ['V', 'First / third person'], ['M', 'Map (zoom and set a route)'], ['Tab', 'See who is playing online'], ['T', 'Chat (online)'], ['H', 'Horn'], ['Esc', 'Pause']],
    path: 'free-criminal/index.html',
    thumb: 'free-criminal/thumb.jpg?v=2',
    added: '2026-10-13T21:33:00+11:00',
    updated: '2026-10-22T12:00:00+11:00',
    stat() { const p = readSave('freecriminal.profile.v1', true); return p && p.xp ? 'Level ' + (1 + Math.floor(Math.sqrt(p.xp / 150))) : null; },
  },
  {
    id: 'cube-assault',
    title: 'Cube Assault',
    category: 'Shooter',
    tagline: 'Hold the line against waves of cubes, play the story campaign, or play online with up to 6 friends.',
    description: 'First-person 3D shooter. Defend the village from waves of cubes, earn coins and level up, unlock weapons from a knife to a rocket launcher that blows holes in buildings, and play the campaign: hold the birch road in Russia, 1944, then raid a scam call centre in Mumbai, 2009, then go over the top on the Western Front, 1916. Earn achievements and badges, and find public lobbies online.',
    controls: 'Keyboard + mouse or touch',
    keys: [['W A S D', 'Move'], ['Mouse', 'Aim'], ['Click', 'Shoot'], ['Right-click', 'Zoom'], ['Space', 'Jump'],
           ['Shift', 'Sprint'], ['R', 'Reload'], ['1–5', 'Guns (all keys can be changed in Settings)'], ['6', 'Turret'], ['J', 'Barricade a door'], ['7', 'Knife'], ['8', 'Rocket launcher'], ['E', 'Claim flag (campaign), plant or defuse the bomb (C:S Mode)'], ['1 / 2', 'Make your choice (campaign)'], ['Esc', 'Pause'], ['Tab', 'Scoreboard (multiplayer)'], ['Touch', 'Joystick to move, drag to look, on-screen buttons']],
    path: 'cube-assault/index.html',
    thumb: 'cube-assault/thumb.jpg?v=4',
    added: '2026-10-13T11:03:05+11:00',
    updated: '2026-10-25T12:00:00+11:00',
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
    tagline: 'New in 2.4: real cars inside and out, Ultra graphics, rain and reflections, headlights and photo mode.',
    description: 'Race 15 computer drivers on 30 full-length circuits and street races, from grand prix tracks and city streets to forest trails, beaches and mountain passes, or race up to 10 friends online. Pick the laps, time of day, season and weather (and the right tyres), or chase gold in the 100 time trials. Eight real cars modelled inside and out, a cockpit with your gloved hands on the wheel, damage you can see, a photo mode, and an Ultra graphics setting with photographed skies, real trees, reflections and rain. A driver of your own with 50 helmets and 50 suits.',
    controls: 'Keyboard, gamepad or touch',
    keys: [['↑ ↓ ← →', 'Drive'], ['W A S D', 'Drive'], ['S / ↓', 'Brake and reverse'], ['Space', 'Handbrake · turn while you hold it to drift'],
           ['Shift + W', 'Rev the engine'], ['R', 'Respawn'], ['Backspace', 'Restart'], ['C', 'Camera: chase, close or cockpit'], ['L', 'Driving line'], ['F9', 'Photo mode (also in the pause menu)'], ['Esc', 'Pause']],
    path: 'poly-racer/index.html?v=2.4',   // the version in the address: nobody gets an old copy from their browser's cache
    thumb: 'poly-racer/thumb.jpg',
    added: '2026-10-13T16:49:58+11:00',
    updated: '2026-10-26T10:08:00+11:00',
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
    description: 'A block-building sandbox with caves, every ore, crafting, villages, every Minecraft mob, the Nether, the End and the Ender Dragon. Survival or creative, on your own or on the public multiplayer server.',
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
// Nothing is saved: Supabase only sees who's connected right now. If it can't be reached (offline,
// blocked network, project paused after a quiet week) the counter just stays hidden.
// play.html shares its connection with the game in its frame through window.ArcadeOnline,
// so a player is only counted once. The publishable key is meant to be public.
// Each browser keeps one id (arcade-online-id), so moving between pages or having two tabs open
// counts as one person, and changes only show once they've held for a couple of seconds.
window.ArcadeOnline = (() => {
  const URL = 'https://fewocduisjbctoxolkjr.supabase.co';
  const KEY = 'sb_publishable_ZRKsVTWRQ_XyH3K6VxeZ0g_g2fky-8d';
  const LIB = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.js';
  const CAP = 200; // the free plan's limit on simultaneous connections
  const SETTLE = 2500; // ms a new count has to hold before it's shown, so quick page changes don't flicker
  let counts = null, started = false, timer = 0, client = null, settled = false;
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
          opened(window.supabase.createClient(URL, KEY, { auth: { persistSession: false, autoRefreshToken: false } }));
          const ch = client.channel('online:arcade', { config: { presence: { key: browserId() } } });
          ch.on('presence', { event: 'sync' }, () => {
            // one entry per browser; if it has several pages open, count it on a game over the home page
            const state = ch.presenceState(), byGame = {};
            for (const k in state) {
              const gs = state[k].map(m => m.game || 'home'), g = gs.find(x => x !== 'home') || 'home';
              byGame[g] = (byGame[g] || 0) + 1;
            }
            emit({ total: Object.keys(state).length, byGame, full: Object.keys(state).length >= CAP });
          }).subscribe(status => {
            if (status === 'SUBSCRIBED') ch.track({ game: where }).catch(() => emit(null));
            else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') emit(null);
          });
        } catch (e) { emit(null); if (!settled) opened(null); }
      };
      document.head.appendChild(lib);
    },
    // Called with { total, byGame, full } on every change, or null when the counter can't connect.
    subscribe(f) { listeners.push(f); if (counts) f(counts); },
    // "12", or "200+" once the free plan is full
    label(n, c) { return c && c.full ? n + '+' : String(n); },
    // The Supabase connection, once it's open (null until then). Cube Assault's multiplayer shares it,
    // so a player in a match still uses just one connection.
    client() { return client; },
    // Calls f with the connection as soon as it's open, or with null if it can't be reached
    // (the global chat opens its own channel on it). Call start() first.
    ready(f) { if (settled) f(client); else waiting.push(f); },
  };
})();
