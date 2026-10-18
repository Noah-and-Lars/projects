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
//   badge: optional fixed badge (e.g. 'DISCONTINUED') shown instead of NEW / UPDATED
//   keys: shown under the game on its play page
//   stat(): the player's best, read from what the game already saves (the games themselves aren't changed)
window.GAMES = [
  {
    id: 'chess',
    title: 'Chess',
    category: 'Board',
    tagline: 'Classic chess against the computer, on Easy, Medium or Hard.',
    description: 'Play chess against the computer on a classic green board. Pick Easy, Medium or Hard, play as White, Black or a random colour, and drag or click your pieces. Every rule is in: castling, en passant, promotion, checkmate, stalemate and draws. Your game is saved, and your wins, losses and draws are kept for each level.',
    controls: 'Mouse or touch',
    keys: [['Drag or click', 'Move a piece'], ['Undo', 'Take back your last move'], ['Flip', 'Turn the board around']],
    path: 'chess/index.html',
    thumb: 'chess/thumb.svg',
    added: '2026-10-17T17:11:00+11:00',
    updated: '2026-10-17T17:11:00+11:00',
    stat() { const s = readSave('chessSave', true); if (!s || !s.stats) return null; const w = ['easy', 'medium', 'hard'].reduce((n, l) => n + ((s.stats[l] && s.stats[l].w) || 0), 0); return w ? w + (w === 1 ? ' win' : ' wins') : null; },
  },
  {
    id: 'russian-roulette',
    title: 'Russian Roulette',
    category: 'Thriller',
    tagline: 'One revolver, one bullet, six chambers. New: Buckshot mode, with a shotgun, live and blank shells and items.',
    description: 'Sit across a table from a stranger in a dim, dirty room. A coin toss decides who goes first, then the cylinder is spun before every turn: put the revolver to your head and squeeze. Every pull is a 1 in 6 chance. Beat stranger after stranger to build a win streak, but one loaded chamber ends it.',
    controls: 'Mouse, keyboard or touch',
    keys: [['Heads / Tails', 'Call the coin toss'], ['Hold button or Space', 'Squeeze the trigger'], ['Esc', 'Pause']],
    path: 'russian-roulette/index.html',
    thumb: 'russian-roulette/thumb.jpg',
    added: '2026-10-17T12:50:00+11:00',
    updated: '2026-10-17T19:43:00+11:00',
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
    thumb: 'gamble-your-life-away/thumb.svg',
    added: '2026-10-15T10:15:00+11:00',
    updated: '2026-10-15T12:04:00+11:00',
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
    tagline: 'Fresh out of prison and thrown in a dumpster. Steal cars, rob stores and outrun the cops.',
    description: 'Open-world 3D crime game. Walk out of the penitentiary into a busy San Varro, steal any car, rob stores, the bank and the mall, pick from 10 guns and grenades at the gun stores and stay ahead of the police, who only spot you when you are in front of them. Crash hard and you fly out of the car. Every purchase and robbery plays its own cutscene, and your profile tracks your level, stats and outfits.',
    controls: 'Keyboard + mouse or touch',
    keys: [['W A S D', 'Walk / drive'], ['Mouse', 'Look'], ['Click', 'Fire'], ['Right-click', 'Aim'], ['R', 'Reload'], ['Shift', 'Sprint'],
           ['Space', 'Jump / handbrake'], ['F', 'Carjack or enter a car'], ['1', 'Take out / put away gun'], ['Q / Wheel', 'Switch gun'], ['G', 'Throw grenade'], ['E', 'Shop, or rob a store with a gun out'],
           ['V', 'First / third person'], ['M', 'Map'], ['H', 'Horn'], ['Esc', 'Pause']],
    path: 'free-criminal/index.html',
    thumb: 'free-criminal/thumb.svg',
    added: '2026-10-13T21:33:00+11:00',
    updated: '2026-10-18T11:45:00+11:00',
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
    thumb: 'cube-assault/thumb.svg?v=3',
    added: '2026-10-13T11:03:05+11:00',
    updated: '2026-10-18T09:00:00+11:00',
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
  { date: '2026-10-18', game: 'cube-tower-defense', text: 'Cube Tower Defense 1.2.1: your base\'s health now floats right on top of your fort instead of in the corner.' },
  { date: '2026-10-18', game: 'free-criminal', text: "Free Criminal 1.6.2: the lottery is closed (tickets are under construction and can't be bought), and you can no longer lose your wanted stars by standing outside the store you just robbed." },
  { date: '2026-10-18', game: 'cube-assault', text: "Cube Assault 2.8.2: an FPS counter in the top left (turn it off in Settings), and Level 3's first aid kit now heals you twice before it restocks." },
  { date: '2026-10-18', game: 'cube-assault', text: "Cube Assault 2.8.1: a first aid kit back in our trench on Level 3, The Western Front. Walk up to it for +40 HP, then it restocks in 25 seconds." },
  { date: '2026-10-17', game: 'cube-assault', text: "Cube Assault 2.8, the campaign update: Level 3, The Western Front, public lobbies in multiplayer, 34 achievements with badges, keybinds, every barrel explodes, two turrets after wave 15, 45-coin barricades and a rebuilt Tajer Support." },
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
    if (g.badge) return g.badge;
    const last = this.played()[g.id];
    if (!last) return Date.now() - Date.parse(g.added) < 30 * 864e5 ? 'NEW' : null;
    return Date.parse(g.updated) > Date.parse(last) ? 'UPDATED' : null;
  },
  stat(g) { try { return g.stat ? g.stat() : null; } catch (e) { return null; } },
};

// Live "on now" counter, using Supabase Realtime Presence (project noah-and-lars-games).
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
  let counts = null, started = false, timer = 0, client = null;
  const listeners = [];
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
      lib.onerror = () => emit(null);
      lib.onload = () => {
        try {
          client = window.supabase.createClient(URL, KEY, { auth: { persistSession: false, autoRefreshToken: false } });
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
        } catch (e) { emit(null); }
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
  };
})();
