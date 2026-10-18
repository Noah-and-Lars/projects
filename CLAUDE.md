# Noah and Lars' Arcade

A small browser-games site made by Lars and Noah, hosted with GitHub Pages at
https://noah-and-lars.github.io/projects/ (repo: Noah-and-Lars/projects, moved
from jimmyscafe/projects).

GitHub Pages currently publishes from the branch
`claude/jimmyscafe-projects-access-9mbcw3`, not `main`. Anything pushed there
goes live in a minute or two. If that branch gets merged into `main`, the Pages
source in Settings → Pages should be switched to `main`.

## Layout

- `index.html`: home page. Intro animation (once per visit), a featured-game
  banner (the most recently added or updated game), "Continue playing", the
  game grid with search and category filters, and "What's new".
- `play.html?game=<id>`: plays a game in an iframe with a loading screen,
  the player's best next to the title, "How to play" keys, Next game,
  fullscreen and a "more games" row. Opening it marks the game as played.
- `games.js`: the list of games and the site's shared helpers. Each game has
  id, title, category, tagline, description, controls, keys, path, thumb,
  added and updated (ISO times; they drive the NEW / UPDATED badges) and
  stat(), which reads the player's best from what the game already saves in
  localStorage. `NEWS` is the What's new list. `Arcade` tracks what this
  browser has played. The site only reads game saves, never changes them.
- `404.html`: "Game over" page GitHub Pages shows for missing addresses. It
  uses /projects/ absolute links because it can appear at any path.
- `logo.svg`, `icon-*.png`, `apple-touch-icon.png`, `manifest.webmanifest`:
  logo and home-screen app icons. `og.png` is the preview image for shared links.
- The home page has an update popup under the header (`#popup` in
  `index.html`). To announce something new, change its text and `POPUP_ID`;
  closing it is remembered per ID in `arcade-popup-closed`.
- The home page also has a notice in the middle of the screen (`#notice` in
  `index.html`, styles at the end of `arcade.css`): right now the Blockcraft
  discontinued notice. It shows once per visit, after the intro, until the
  player presses Okay (`notice-seen` in sessionStorage).
- `arcade.css`: shared styles for the two pages above.
  Both pages load it and `games.js` with `?v=N`. GitHub Pages lets browsers cache
  files for 10 minutes, so bump N in both pages whenever either file changes.
- Live "on now" counter: `ArcadeOnline` in `games.js` joins one Supabase
  Realtime Presence channel (`online:arcade`, project `noah-and-lars-games`)
  and tracks which game each visitor is on (`home` for the home page). The home
  header shows the total; `play.html` joins for the game it's showing, and a
  game in its frame reads the count from `window.parent.ArcadeOnline` instead
  of connecting again. Cube Assault shows its own count on its home menu and
  connects itself when opened on its own. The free plan allows 200 connections,
  so counts show as "200+" when full. If Supabase can't be reached, counters
  stay hidden. Nothing is stored; the publishable key is meant to be public.
- The footer of both pages shows a contact email for bug reports. It's set once
  in `games.js` (`CONTACT_EMAIL`).
- One folder per game, each with a self-contained `index.html` and a `thumb.svg`
  cover (16:9).

## Games

- `cube-assault/`: first-person 3D shooter (Three.js bundled into the file). Since 2.3 it has touch controls (`#touch` layer, `autoTouch` / `touchMode()`, setting `touch`: auto, on or off).
  Since 2.6 it has online multiplayer. Noah's blocks (`mp-ui-css`, `mp-ui`, `mp-stub`, `CS MAP`) are the lobby, HUD, results and Outpost map; Lars's `<script id="mp-net">` block is the netcode and provides `window.CAMP` (the interface `mp-ui` uses) and `window.mpNet` (hooks the game calls from `shoot()`, `slash()`, `fireRocket()`; look for `// mp-net hook`). `gameMode` is `'mp'` during a match. Rooms are Supabase Realtime channels `ca-room-<CODE>` (Presence = player list, host = first to join) plus one `ca-room-<CODE>-<id>` pipe per player to the host. It reuses the arcade's connection (`ArcadeOnline.client()`, or `window.caSupabase` from the game's own counter). The free plan caps the whole project at 100 messages a second, so the host lowers the update rate in bigger rooms (`MAX_HZ`, `ROOM_BUDGET`). Room chat (2.8.3): 'chat' on the room channel, `CAMP.chat()` and the 'chat' event, drawn by the `<script id="mp-chat">` block (Enter opens it).
- `block-drop/`: Blocktris, a falling-block puzzle with keyboard and touch controls.
- `2048/`: sliding-number puzzle with keyboard and swipe controls.
- `poly-racer/`: low-poly 3D time-trial racer in the style of PolyTrack (Three.js
  copied from Cube Assault into the file). Tracks are strings of pieces in the
  `TRACKS` list (S straight, L/R turns, BL/BR banked, HL/HR hairpins, U/D hills,
  O loop, K + G + LAND jump, C checkpoint, F finish). Car physics is a raycast
  vehicle against the track's own triangles. Space, S or Down brakes; braking
  while turning at speed starts a drift (rear grip drops, steering sets the
  rotation, slip is capped near 45 degrees) that lasts while you keep steering.
  Best times, splits and ghosts are saved per track in localStorage.

- `blockcraft/`: Minecraft-style voxel sandbox (Three.js copied in, WebGL 2
  required). 16x128x16 chunks, procedural 16x16 textures in a texture array,
  smooth lighting with sky and block light flood-fill, caves, every overworld
  ore (plus deepslate versions), trees, mobs, crafting, furnaces, chests,
  survival and creative. Worlds save to localStorage (`blockcraft-worlds` and
  `blockcraft-world-<id>`, storing only changed blocks). Block and item ids are
  saved, so only ever add new blocks at the end of the block list and new items
  at the end of the item list (after the tools). Farming: a hoe tills
  farmland, a shovel makes paths (both 15/16-tall `SHAPE.LOW` blocks), seeds
  grow into wheat through random ticks, which run at Minecraft's rate.
  Villages: `Gen.village(rx, rz)` plans at most one per 320x320 region from the
  seed (plains, desert, taiga, snowy styles); each chunk builds its own part in
  `decorate`, and `spawnVillagers` adds villagers and an iron golem when a chunk
  with their home is made. Mob skins are drawn per face from palettes in `MOB_DEFS`.
  `SHAPE.BOXES` blocks (stairs, slabs, doors, fences, lanterns) are drawn and
  collide as a list of boxes; stairs and doors use one block id per facing/state. It's heavy: keep tests
  short, and don't run hundreds of frames in the preview pane.
  Since 2.0: block ids are 16-bit (`BCAP = 4096`), items start at `ITEM_BASE = 4096`,
  and each dimension (Overworld `Gen`, Nether `NetherGen`, End `EndGen`) is its own
  `World`; `changeDimension()` moves between them. The save is format v2 (a section per
  dimension in `dims`, plus `endState` and `genVersion`); `migrateSave()` converts 1.x
  saves and first keeps the original as `blockcraft-world-<id>-backup-1x`. Worlds with
  `genVersion 1` keep the old Overworld (`Gen.v2` is false), so only change 1.x terrain
  behind a `this.v2` check. Structures are `Plan`s built chunk by chunk (`makeCtx`,
  `structuresNear`); mobs are defined in `MOB_DEFS` with movement types in `MOVERS`.
  Since 6.0 (its last update) it has a public multiplayer server: the `MP` block ("Multiplayer: the public
  server"), the Multiplayer button on the title screen and `MultiplayerScreen`. There's no game server. Everyone
  plays one world from a fixed seed (`MP_SEED`), saved in each player's own browser (`blockcraft-world-mp-public`),
  and the shared world remembers when each changed block last changed (`World.stamps`, which only that world has).
  When players meet, their copies merge block by block and the newest change wins, so the world carries on while
  nobody's online. Every block change goes through `World.set`, which reports it to `MP.changed` on the shared
  world; a change that isn't a block change (a chest's contents) is reported with `MP.touch`. It uses the arcade's
  Supabase project (sharing `ArcadeOnline.client()` when on the play page): `bc-public-who` is Presence (the player
  list; the host is whoever joined first), `bc-public` carries block changes, chat, PvP hits and the host's
  position snapshots, and `bc-public-p-<id>` is a pipe from each player to the host for positions and for the
  world swap when someone joins. Mobs, dropped items and the dragon stay on each player's screen. Every command
  works there for everyone (gamemode is kept per player); `/time set` changes the time for the whole server. The player's name and first-join date are in `blockcraft-mp`. For testing, `?mproom=<name>`
  opens a private test server with its own channels and save: never test on the real one.

- `russian-roulette/`: Russian Roulette (and Buckshot Roulette, still work in progress) in a dim room, Three.js
  bundled into the file. Saves `russianRouletteSave`. Since 1.2 it has online play: the `Online` block, the Play
  online button and `m-online` menu. Quick match pairs the two players waiting longest in Presence on `rr-lobby`
  (`rr-lobby-bs` for Buckshot); a private table has a 5-letter code and plays its maker's mode. A table is the channel `rr-t-<key>`. The host's
  browser rolls the coin and every spin, so both screens agree; `playOnline`, `myTurnOnline` and
  `theirTurnOnline` run the game on each screen, waiting on each other's messages with `Online.next()`. Online Buckshot (1.2.1, `playBuckshotOnline`):
  the host rolls every load (`bsRollLoad`, sent as 'bsload'), the shooter sends each item and shot ('bsact'), and
  the other screen plays it as the dealer (`bsTheirTurnOnline`, `dealerUse`, `bsHeShoots`). Online wins
  and games are `onWins` / `onGames`, apart from the single-player streak. `?rrroom=<name>` uses separate test
  channels: test with that, never on the real lobby.

- `chess/`: Chess against the computer (the engine is the `<script id="engine">` block, shared with a Web Worker).
  Saves `chessSave` (settings, per-level stats, the game in progress). Since 1.1 it plays online too: the `Net`
  block and the Play online box in the side panel. Quick match pairs in Presence on `ch-lobby`; a private table has
  a 5-letter code; a table is the channel `ch-t-<key>`. Moves are 'mv' (move number and UCI), checked for legality
  on the other side. The host is White in the first game and colours swap each rematch. `online.on` is true at a
  table: the computer, undo and saving the game are off then, and the record is `save.online`. Chat (1.2) is 'chat' at the table, in the box under Play online. `?chroom=<name>`
  uses separate test channels.

- `cube-tower-defense/`: Cube Tower Defense, an endless tower defense with the cubes from Cube Assault (Three.js bundled into the file). Saves `cubeTDProfile` (name, level, best wave, stats) and `cubeTDSettings`.

- `free-criminal/`: Free Criminal, an open-world 3D crime game set in San Varro (Three.js r128 copied from Cube Assault into the file). Version 1.1 adds 3x traffic, ragdoll crashes, gun stores (10 guns, grenades), a mall and a new HUD; 1.2 adds carjack animations, police vision cones and a denser countryside; 1.4 is a much bigger streamed world (countryside built in 400 m chunks around the player), interiors, safehouses, day/night, rain and touch controls. The page has no doctype (quirks mode), so element ids match CSS case-insensitively: never reuse an id that differs only by case. Saves only its settings (`freecriminal.settings.v1`). Since 1.7 it has online free roam: the `NET` block and `playOnline()` (Play online on the menu, no intro). One
  shared city on the arcade's Supabase project: `fc-who` Presence (player list, host = first to join), `fc-pub` for
  the host's position snapshots, hits and kills, and a `fc-p-<id>` pipe from each player to the host. Other players
  are drawn with `makeHuman` / `makeCarModel`, `shootRay` checks them (`NET.ray`), and the victim's own screen takes
  the damage. Chat (1.8): T opens `#fcChat`, messages are 'c' on `fc-pub`. Traffic, peds and police stay local. `?fcroom=<name>` uses separate test channels (and exposes
  `window.__fc` for tests).

- `bull-run/`: Stocks Game (first called Bull Run; the folder, game id and save keys keep that name so saves and links still work), a stock-trading game (plain canvas 2D, no libraries). Twelve made-up companies (plus two crypto coins) with prices from a random walk plus market, sector and company moods and news shocks. The calendar advances a trading day every `DAY_SECS`, but prices and news only move every `TICK` trading days (about 25 seconds); change figures compare with the previous move (`prevTick`, `tickWorth`). Earnings and dividends every `EARN` trading days per company, with rumours one update before; tips and pumps land at least `MIN_LEAD` days out (`leadUpdate`); the back room pauses the market while open; the back room (`buyTip`, `pumpStart`, `borrow`/`repay`, `bribe`) schedules events in `G.pending` and raises `G.heat`, which sets the chance of a fine (`bust`); three convictions (`G.busts`) call `prison()`, which runs a year of days instantly. Shorts live in `G.short` (cash is the collateral; `marginCalls` closes one that rises 50%), the loan in `G.debt`/`G.debtAge` (`loanDay`, `collect`). There is deliberately no fast-forward: the only speeds are pause and 1x. Market randomness goes through `mr`/`mrand`/`mgauss`/`mpick` (seeded with `mulberry32` from the date in the daily challenge, `G.daily`, saved under `bullRunDaily`); player actions use `Math.random`, and each part of a daily market day draws from its own stream (`stream(key)`, earnings fixed in advance by `beatOf`), so a tip or pump only changes the stock it targets. Each day's targets are saved (`G.opened`, `G.targets`) so a reload does not re-roll the day. Reputation (`rep()`, best net worth across both saves) unlocks crypto (`unlock` on a company), half-price deals and options (`G.options`, settled by `settleOptions`). `showReport` is the year-end report and the daily's final score. Saves everything to `bullRunSave` (format `v: 1`, including a year of generated price history); `stat()` on the home page reads `stats.best`.

## Adding a game

1. Make a folder with a single self-contained `index.html` (no build step, no
   external servers) and a `thumb.svg`.
2. Add an entry to `games.js` (with added/updated times, keys and a stat()
   reader if the game saves a best), and a line at the top of `NEWS`.
3. Add a row to the games table in `README.md`.
4. Test it in a browser, including a phone-sized viewport.

## Conventions

- Games save progress only in the player's own browser (`localStorage`, wrapped
  in try/catch). No accounts or data collection. The only server is Supabase Realtime (the live "on now"
  counter, Cube Assault's rooms and Blockcraft's public server), which passes messages along and stores
  nothing. Blockcraft's shared world is saved in each player's browser.
