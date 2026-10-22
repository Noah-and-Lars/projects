# The Arcade

A small browser-games site called The Arcade, hosted with GitHub Pages at
https://noah-and-lars.github.io/projects/ (repo: Noah-and-Lars/projects, moved
from jimmyscafe/projects). That address comes from the GitHub account name;
apart from it, no personal names appear anywhere on the site (pages, games,
credits, comments, images). Keep it that way.

GitHub Pages currently publishes from the branch
`claude/jimmyscafe-projects-access-9mbcw3`, not `main`. Anything pushed there
goes live in a minute or two. If that branch gets merged into `main`, the Pages
source in Settings → Pages should be switched to `main`.

## Layout

- `index.html`: home page. Intro animation (once per visit), a featured-game
  banner (the most recently added or updated game), "Continue playing", the
  game grid with search and category filters, and "What's new".
- The header of the home page and the chat page has two tabs, Games
  (`index.html`) and Global chat (`chat.html`). On the home page the chat tab
  shows how many people are in the chat (`byGame.chat` from `ArcadeOnline`).
- `chat.html`: the Global chat. One Supabase Realtime channel, `arcade-chat`:
  'msg' broadcasts are messages ({ id, u, n, t, ts }: message id, sender's chat
  id, name, text, time), Presence is the "In the chat" list (key = the
  browser's chat id, with the name and when they arrived). Nothing is stored on
  a server: each browser keeps the newest 200 messages in its own localStorage
  (`arcade-chat-log`; also `-id`, `-name`, `-muted`, `-cleared`). A newcomer
  sends 'hreq' with the time of its newest message, and only the person who has
  been in the chat longest answers with up to 100 newer messages ('hist'), so
  the history carries on as long as someone is around. Messages and names go
  through `tidy()` (whitespace, length, a swear-word filter) and are only ever
  shown with textContent. Sending is limited to 5 messages in 10 seconds, other
  people's floods (more than 8 in 10 seconds) are ignored, and Mute hides a
  person on this device only. Names: 2-20 characters, no swear words, and words
  like admin, mod or staff are reserved. It reuses the arcade's connection
  (`ArcadeOnline.ready()`). `?chatroom=<name>` uses its own test channel and
  storage: test with that, never in the real chat. To be two people in one
  browser, open the test room on http://localhost:8765 and on
  http://127.0.0.1:8765 (two origins, so two separate storages).
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
- The home page has no notice in the middle of the screen any more (the
  Blockcraft discontinued one was removed). Its styles at the end of
  `arcade.css` (`.notice`, `.notice-box`, `.notice-ok`) are still used by the
  chat's name box.
- `arcade.css`: shared styles for the pages above.
- `tos.js`: the Terms of Service pop-up, loaded by `index.html`, `play.html` and
  `chat.html`. It shows until the visitor ticks the box and agrees; agreeing is
  remembered in localStorage (`arcade-tos-agreed`, set to `TOS_VERSION`). Change
  `TOS_VERSION` to ask everyone again after editing the terms. `?notos=1` skips it
  (for screenshots and tests only).
  `index.html`, `play.html` and `chat.html` load it and `games.js` with `?v=N`. GitHub Pages lets browsers cache
  files for 10 minutes, so bump N in all three pages whenever either file changes.
- Live "on now" counter: `ArcadeOnline` in `games.js` joins one Supabase
  Realtime Presence channel (`online:arcade`, project ref `fewocduisjbctoxolkjr`)
  and tracks which game each visitor is on (`home` for the home page). The home
  header shows the total; `play.html` joins for the game it's showing, and a
  game in its frame reads the count from `window.parent.ArcadeOnline` instead
  of connecting again. Cube Assault shows its own count on its home menu and
  connects itself when opened on its own. The free plan allows 200 connections,
  so counts show as "200+" when full. If Supabase can't be reached, counters
  stay hidden. Nothing is stored; the publishable key is meant to be public.
- The site shows no email or contact details anywhere (the owner removed them).
- One folder per game, each with a self-contained `index.html` and a `thumb.svg`
  cover (16:9).

## Games

- `cube-assault/`: first-person 3D shooter (Three.js bundled into the file). Since 2.3 it has touch controls (`#touch` layer, `autoTouch` / `touchMode()`, setting `touch`: auto, on or off).
  Since 2.6 it has online multiplayer. The blocks `mp-ui-css`, `mp-ui`, `mp-stub` and `CS MAP` are the lobby, HUD, results and Outpost map; the `<script id="mp-net">` block is the netcode and provides `window.CAMP` (the interface `mp-ui` uses) and `window.mpNet` (hooks the game calls from `shoot()`, `slash()`, `fireRocket()`; look for `// mp-net hook`). `gameMode` is `'mp'` during a match. Rooms are Supabase Realtime channels `ca-room-<CODE>` (Presence = player list, host = first to join) plus one `ca-room-<CODE>-<id>` pipe per player to the host. It reuses the arcade's connection (`ArcadeOnline.client()`, or `window.caSupabase` from the game's own counter). The free plan caps the whole project at 100 messages a second, so the host lowers the update rate in bigger rooms (`MAX_HZ`, `ROOM_BUDGET`). Room chat (2.8.3): 'chat' on the room channel, `CAMP.chat()` and the 'chat' event, drawn by the `<script id="mp-chat">` block (Enter opens it).
- `block-drop/`: Blocktris, a falling-block puzzle with keyboard and touch controls.
- `2048/`: sliding-number puzzle with keyboard and swipe controls.
- `poly-racer/`: Poly Racer, a 3D time-trial racer (Three.js r128 copied from Cube Assault into the file). Since 1.1:
  100 tracks in `TRACKS` (s = series 0-9, `par` = gold time; silver x1.12, bronze x1.3, `MEDALS`), ten `SERIES` each
  with a world in `ENVS` (sky, sun, fog, ground colours, hills/mountains, water, tree kinds and density). The first
  six tracks are the 1.0 ones with the same ids, so saves carry over. Tracks are strings of pieces read by
  `buildTrack` (S straight, L/R turn, WL/WR wide turn, QL/QR 45 degrees, XL/XR chicane, BL/BR banked, HL/HR hairpin,
  TL/TR banked bowl, U/D hill with n = height x6 m, O loop, K + G + LAND jump, C checkpoint, F finish). The 94 new ones
  were generated piece by piece, checked never to cross themselves, and driven to the finish by a test bot in the
  Hauler Van, Pico Hatch and Strix GT (par = the Strix GT's time); test any new track the same way (the generator and bot are kept outside the repo, in the workspace's
  `poly-racer-tools/dev-tools.js`: load it into the game on localhost, then `dev.generate` and `dev.botRun`). Car physics is a
  raycast vehicle against the track's triangles (`trackCollision`) and the ground (`terrain`, a warped grid, fine
  near the track; `Collider.ray` hits both, and `hit.ground` says which). Steering asks for about the cornering the
  tyres can give at the current speed, with stability control, anti-roll bars and downforce; S brakes, Space is the
  handbrake (turn while holding it to drift). Off the road (wheels on the ground) you keep driving but checkpoints
  stop counting until you respawn with R (`race.offTrack`, `#warn`); tree trunks are solid (`world.trunks`).
  `CARS` are the 11 drivable Free Criminal cars (sizes and figures from its `CT`, turned into this game's ranges by
  `carSpec`); `buildCarModel` builds each from an extruded side profile with a glass cabin; `buildCockpit` adds the
  first-person interior (C cycles chase, close and cockpit; gauges on `gaugeCanvas`, mirror render on High).
  Graphics: ACES tone mapping, a shader sky (`skyMat`) that also lights everything through PMREM, sun shadows that
  follow the car, instanced trees in 260 m tiles with a far version (`placeInstances`), quality in `QUALITY`
  (low/medium/high). Engine sound (`sfx`) is a harmonic tone driven by a simulated gearbox. Saves `polyracer`
  (best, splits, bestCar, car, colors, cam, settings) and ghosts `polyracer-ghost-<id>`. On localhost `window.__pr`
  exposes the game for tests.

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
  `theirTurnOnline` run the game on each screen, waiting on each other's messages with `Online.next()`. Online Buckshot (1.3, the
  "Party Buckshot" block, `playBuckshotParty`) seats 2 to 6: at a Buckshot table Presence is everyone sitting there, and
  the host (the maker, or whoever comes first in `seated()`) sends 'start' with the seat order (`Online.roster()`); after
  a game it starts the next one when everyone still there has pressed Play again. Buckshot quick match groups up to 6
  on `rr-lobby-party` (`quickParty`, 'go'). Every turn starts with the host's 'turn' (whose turn, who has left, the next
  load; `pbBoundary`), the player whose turn it is sends 'bsact' (items, and shots with the target's id), and every
  screen works out the rest the same way (`pbYourTurn`, `pbTheirTurn`, `pbNpcShoots`). If the host leaves, the next
  player round the table takes over. With 3 or more a round table comes out (`setPartyTable`). Each stranger sits in
  his own seat frame, `n.root` (`makeNPC`; `seatPt`/`seatPose`/`worldPose` convert), which is not moved at all in the
  usual chair, so single player, Russian Roulette and the intro work as before; `pbClear` (called by `bsReset`) puts
  the usual table and stranger back. Presence carries `v: PARTY_V` so copies from before 1.3 stay off Buckshot tables.
  A hidden tab's clock keeps running during an online game (no frames, but the others aren't left waiting). The opening
  cinematic is the `rr-intro` block (`Intro`): it plays on load (`?nointro` skips it) and from Watch the intro. Online wins
  and games are `onWins` / `onGames`, apart from the single-player streak. `?rrroom=<name>` uses separate test
  channels: test with that, never on the real lobby. To be several players at once, put
  a few iframes of the game with the same `?rrroom=` on one page and drive them with `contentWindow.eval(...)`.

- `chess/`: Chess against the computer (the engine is the `<script id="engine">` block, shared with a Web Worker).
  Saves `chessSave` (settings, per-level stats, the game in progress). Since 1.1 it plays online too: the `Net`
  block and the Play online box in the side panel. Quick match pairs in Presence on `ch-lobby`; a private table has
  a 5-letter code; a table is the channel `ch-t-<key>`. Moves are 'mv' (move number and UCI), checked for legality
  on the other side. The host is White in the first game and colours swap each rematch. `online.on` is true at a
  table: the computer, undo and saving the game are off then, and the record is `save.online`. Chat (1.2) is 'chat' at the table, in the box under Play online. `?chroom=<name>`
  uses separate test channels.

- `cube-tower-defense/`: Cube Tower Defense, an endless tower defense with the cubes from Cube Assault (Three.js bundled into the file). Saves `cubeTDProfile` (name, level, best wave, stats) and `cubeTDSettings`.

- `free-criminal/`: CLOSED since 2026-10-22 (the owner closed it; it stays listed on the arcade with a "Closed for now"
  tagline). `CLOSED_NOW` before `boot()` shows the `#closed` screen instead of building the city, so nobody can play or
  join online; it stays open on localhost for testing (`?closed` shows the closed screen there). Set `CLOSED_NOW` to
  false to reopen it. Free Criminal, an open-world 3D crime game set in San Varro (Three.js r128 copied from Cube Assault into the file). Version 1.1 adds 3x traffic, ragdoll crashes, gun stores (10 guns, grenades), a mall and a new HUD; 1.2 adds carjack animations, police vision cones and a denser countryside; 1.4 is a much bigger streamed world (countryside built in 400 m chunks around the player), interiors, safehouses, day/night, rain and touch controls. The page has no doctype (quirks mode), so element ids match CSS case-insensitively: never reuse an id that differs only by case. Saves only its settings (`freecriminal.settings.v1`). Since 1.7 it has online free roam: the `NET` block and `playOnline()` (Play online on the menu, no intro). One
  shared city on the arcade's Supabase project: `fc-who` Presence (player list, host = first to join), `fc-pub` for
  the host's position snapshots, hits and kills, and a `fc-p-<id>` pipe from each player to the host. Other players
  are drawn with `makeHuman` / `makeCarModel`, `shootRay` checks them (`NET.ray`), and the victim's own screen takes
  the damage. Chat (1.8): T opens `#fcChat`, messages are 'c' on `fc-pub`. Traffic, peds and police stay local. `?fcroom=<name>` uses separate test channels (and exposes
  `window.__fc` for tests).

- `bull-run/`: Stocks Game (first called Bull Run; the folder, game id and save keys keep that name so saves and links still work), a stock-trading game (plain canvas 2D, no libraries). Twelve made-up companies (plus two crypto coins) with prices from a random walk plus market, sector and company moods and news shocks. The calendar advances a trading day every `DAY_SECS`, but prices and news only move every `TICK` trading days (about 25 seconds); change figures compare with the previous move (`prevTick`, `tickWorth`). Earnings and dividends every `EARN` trading days per company, with rumours one update before; tips and pumps land at least `MIN_LEAD` days out (`leadUpdate`); the back room pauses the market while open; the back room (`buyTip`, `pumpStart`, `borrow`/`repay`, `bribe`) schedules events in `G.pending` and raises `G.heat`, which sets the chance of a fine (`bust`); three convictions (`G.busts`) call `prison()`, which runs a year of days instantly. Shorts live in `G.short` (cash is the collateral; `marginCalls` closes one that rises 50%), the loan in `G.debt`/`G.debtAge` (`loanDay`, `collect`). There is deliberately no fast-forward: the only speeds are pause and 1x. Market randomness goes through `mr`/`mrand`/`mgauss`/`mpick` (seeded with `mulberry32` from the date in the daily challenge, `G.daily`, saved under `bullRunDaily`); player actions use `Math.random`, and each part of a daily market day draws from its own stream (`stream(key)`, earnings fixed in advance by `beatOf`), so a tip or pump only changes the stock it targets. Each day's targets are saved (`G.opened`, `G.targets`) so a reload does not re-roll the day. Reputation (`rep()`, best net worth across both saves) unlocks crypto (`unlock` on a company), half-price deals and options (`G.options`, settled by `settleOptions`). `showReport` is the year-end report and the daily's final score. Saves everything to `bullRunSave` (format `v: 1`, including a year of generated price history); `stat()` on the home page reads `stats.best`.

- `havoc-bay/`: Havoc Bay, a Red vs Blue sea battle in the style of Harbor Havoc on Roblox (Three.js r128 copied from Poly Racer into the file). Single player with bots on both teams (`Bot`, `botShip`, `botPlane`). Each harbor is a `HarborEnt` with 25,000 health whose buildings are collider boxes flagged `h`; the five claimable islands (`ISLANDS`, `updateIslands`) give the owner their turrets and a boat pad. The world is built from Roblox-style parts with `Builder`/`Site` and the island shapes come from `landH()`; the second half of the map is the first half turned 180 degrees (`flip`). Balance lives in `WEAP` (damage per weapon, with `vs` multipliers per target kind; harbors take reduced damage), `SHIP_TYPES`, `PLANE_TYPES` and `TURRET_TYPES`. The title screen runs a bot-only demo match (`startMatch(true)`). Losing your ship is not a death: you stay on the slowly sinking wreck (`sinkT` in `Ship.update`) until you press E or the deck goes under, then swim; B (`deployKey`) redeploys from anywhere after 5 seconds. Aircraft carriers (`SHIP_TYPES.carrier`, `carrier: true`) are plane spawn points for their whole team (`teamCarriers`, `launchFromCarrier`); bots build at most one per team at the home harbor and keep it on their own side (`station` mission). When a match ends with a loser (harbor destroyed or time up), `startCine` plays the ending: it opens in the B-52's cockpit (`buildCockpit`, jet pilots from `makePilot`, displays drawn on canvases), then the bay doors open, the camera rides the bomb down, then a wide shot shows the losing harbor flatten (`H.mesh` scaled down and charred, restored in `resetWorld`) while the bomber banks away; click or Space skips (`skipCine`). Saves `havocbay.profile.v1` (matches, wins, kills, best damage) and `havocbay.settings.v1`. To test balance without waiting, call `step(1/30)` in a loop from the console; a hidden preview pane pauses `requestAnimationFrame`. Its title screen plays a separate realistic reel (`<!-- hb-reel:start -->` block before `</body>`, own renderer and scenes, `window.hbReel`): five 7 s shots with fades (pilot's-eye cockpit, camera on the pilot, carrier aerial, catapult launch, desert assault), detailed people (`Person`, arm IK onto rifles, `mergeTree` to keep draw calls low) and a film pass (`makePost`). `frame()` skips drawing the demo battle while `hbReel.covering`. It follows Graphics quality: Low keeps the demo battle, Medium draws it plainly, High adds the film pass. Check a moment with `hbReel.hold = true; hbReel.seek(24)`.
  Online play works like Cube Assault's. ▶ PLAY joins the one shared server, the Supabase Realtime channel `hb-world` (up to 8 players, fixed settings in `WORLD`): a match always full of bots where each real player takes a bot's place on the side with fewer real players, and the next match starts by itself `NEXT_MS` after a result. 🔒 Private room makes a `hb-room-<CODE>` room with a lobby (up to 6); 🤖 Practice is the offline game. Presence is the player list and the host is whoever has been there longest; each player has a `<channel>-<id>` pipe to the host. The connection is `ArcadeOnline.client()` inside play.html. If the host leaves, the next player takes over (`takeOver`): their screen turns its copies back into real bots and stand-ins under the same ids and the match carries on; the others follow (`hostMoved`). The netcode is the `<script id="hb-net">` block at the end; the main script only calls hooks behind `NET.on` / `NET.host` / `NET.client` (look for `NET.`). The host's screen runs the whole match (bots, damage, islands, harbors, clock). Every other player drives their own vehicle locally and sends its state, gun angles, "fired" bits for machine guns and each heavy shot; the host keeps a stand-in for it (`e.peer`). Other screens draw the host's world ~230 ms behind as puppets (`Track`, `driveKind`) and replay its events (shells, kills) on the same clock. Bots fill the empty places (`fillBots`, `NET.humans`); a bot that makes way finishes its current life first. Rate: `MAX_HZ` 6, `ROOM_BUDGET` 60 messages a second (3n - 2 per update; 2 a second at 8 players). A hidden host tab slows the shared match to about one update a second (browsers throttle timers in background tabs). F3 shows the network overlay; `?mplag=150&mploss=0.05` simulates a bad connection; `window.HBNet` has helpers for console testing (two iframes of the game on one page both get frames).

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
  counter, the Global chat, the games' online rooms and Blockcraft's public server), which passes messages along and stores
  nothing. Blockcraft's shared world is saved in each player's browser.
