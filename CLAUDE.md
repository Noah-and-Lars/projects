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
- The header of the home, chat and Players pages has three tabs: Games (`index.html`), Global chat (`chat.html`)
  and Players (`players.html`). The home page's chat tab shows how many are in the chat (`byGame.chat`); the Players
  tab's `#plN` count (friend requests + unread messages) is set by account.js from the `soc` field of the sync answer.
- `chat.html`: the Global chat (rebuilt 2026-11-06; before, messages lived only in browsers and history passed peer
  to peer, so people not online together never saw each other's messages). One WebSocket to the Worker's `/chat/ws`
  (`Chat` Durable Object `chat:global`), which keeps the newest 150 messages (one stored value, `log`) and sends
  'hello' {you, log, who}, then 'msg', 'who' ([id, name, isAccount, since]), 'del', 'slow'. Signed-in players send
  their token as the second WebSocket subprotocol (`['arcade', token]`) and chat under their checked account name
  (id `a:<lower>`, links to their profile); others are guests (`g:<chat id>`, tagged "guest"). Message text in the
  chat and in DMs is NOT swear-filtered (the owner asked for uncensored chats, 2026-11-06); names still are, and all
  text is shown with textContent only. 5 messages in 10 s per connection (server-checked). Mute and "Hide the chat
  history" are per device. `?admin` adds Delete (admin password; `/acct/admin` op `chatdel`). A local copy for
  offline display is `arcade-chat-srv-log`. `?chatroom=<name>` is a test room (`chat:test-<name>`): test there.
- `players.html` (2026-11-06): every account (`/acct/players`, the `Directory` object: [[name, created, hasScores]]),
  search, and All / Friends / Requests / Chats. A profile (`#p=<name>`, `/acct/player`) shows the best in every game:
  each signed-in browser sends its own `stat()` results after a sync, only when changed (`/acct/profile`, last sent
  in `arcade-acct-prof`). Friends `/acct/friend` {op: add | remove} (add accepts an incoming request), `/acct/block`.
  Private messages (`#dm=<name>`): `/acct/dm` GET ?with=&before=<seq>, POST {to, text}; anyone can message anyone
  unless blocked (the sender isn't told). Stored in each Account object (`soc`, `m:<friend>:<seq>`, last 300 per chat,
  both sides keep a copy). While open, the page holds a hibernating WebSocket to the player's own Account object
  (`/acct/ws`) for live 'dm', 'friend', 'read', 'social' pushes. Accounts made before 2026-11-06 join the list when
  next used (`a.listed`). Local accounts aren't listed and can't use friends or DMs. Keep all of this cheap (the free
  plan's Durable Objects limit took online down on 2026-11-05): no polling, hibernating sockets only.
  `~/Downloads/arcade-realtime/tools/social-test.mjs` tests these routes against a local `wrangler dev`.
  Pop-ups (2026-11-06): account.js holds that `/acct/ws` socket on every site page (index, play, chat, players;
  `liveConnect`), and a private message or friend request shows a toast in the top right (`toast()`, `#acctToasts`),
  except for the chat open on the Players page (`window.ArcadeDmOpen`). The Players page listens via `onLive()`.
  The Global chat gives no pop-ups. Last online: the Account object tells the Directory when a socket opens (at most
  every 5 minutes, `a.seenAt`), stored as the 4th field of each list entry; offline players show "Last online ...".
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
- `account.js` (since 2026-11-01): Arcade accounts and cloud saves, loaded by `index.html`, `play.html` and
  `chat.html` (bump `account.js?v=N` in all three when it changes). It adds the account button to the header
  (`#acctBtn`, the panel shows each game's `stat()`), and on a first visit (after the Terms) a popup that asks
  everyone to make an account; "Use a local account instead" takes three "are you sure" popups, then a name kept
  in `arcade-local`. An online account is a unique username (3-16 letters, numbers, `_`; case doesn't count;
  reserved and rude names are refused by the server) and a password. The browser stretches the password with
  PBKDF2 (150k rounds, salted with the lower-case name) and sends only that key. A recovery code shown once at
  sign-up resets a forgotten password (`recover`). The account is `arcade-acct` ({name, token}); the last synced
  state is `arcade-acct-sync`. Sync: every game's localStorage entries are grouped by `GROUPS` (a regex per
  game; anything unknown goes to `misc`, and `NEVER` lists this device's own keys). On load, every 45 s when a
  group changed, and when the page is hidden, groups move to or from the account; a group changed on both sides
  keeps the copy with more progress (`score()`). Signing up uploads everything already on the device; logging
  in on a device with its own progress merges game by game; logging out clears this device's copy. `play.html`
  waits up to 4 s for the first sync before loading the game, and reloads the game if its saves change.
  On localhost, `localStorage['arcade-acct-api']` points it at a local copy of the server (tests only).
  Players can delete their own account in the panel (password again; this device keeps a local copy). The owner's
  tools: open the site with `?admin` to look up or delete any account with the Cube Assault ADMINTEST password
  (checked on the server against its SHA-256; 5 wrong tries lock it for 15 minutes). A deleted name is free again.
- Player names: every game with a name (Cube Assault, Cube Tower Defense, Havoc Bay, Rocket Rivals, Football,
  Poly Racer, Chess, Russian Roulette, Free Criminal, Blockcraft's server name) has a `<script id="arcade-name">`
  block at the top of `<head>`: it writes the account's (or local account's) name into the game's save before the
  game reads it and keeps the game's name box on that name, read-only. Cube Assault and Havoc Bay still let the
  test names (GAMETESTER, ADMINTEST) be typed, since those ask for their password. The chat uses the account name too.
- `tos.js`: the Terms of Service pop-up, loaded by `index.html`, `play.html` and
  `chat.html`. It shows until the visitor ticks the box and agrees; agreeing is
  remembered in localStorage (`arcade-tos-agreed`, set to `TOS_VERSION`). Change
  `TOS_VERSION` to ask everyone again after editing the terms. `?notos=1` skips it
  (for screenshots and tests only).
  `index.html`, `play.html` and `chat.html` load it and `games.js` with `?v=N`. GitHub Pages lets browsers cache
  files for 10 minutes, so bump N in all three pages whenever either file changes.
- Accounts server: the same Worker answers `/acct/*` (see the comment block in `realtime-worker/src/worker.js`):
  one `Account` Durable Object per lower-case username (so a name can only be registered once), holding the
  password check, the recovery code hash, signed-in devices (hashed tokens) and each game's saves in 40,000-char
  chunks (5 MB a game, 20 MB an account). Only the official origin may call it. Deployed with the Worker.
- Realtime server (since 2026-10-31; it used to be Supabase Realtime): a Cloudflare Worker,
  `arcade-realtime` at `wss://arcade-realtime.arcade-realtime.workers.dev/ws`, source in
  `realtime-worker/`. Each channel topic is one Durable Object, each browser channel is one
  WebSocket to it; it only does broadcast and presence and stores nothing. `rt.js` is the
  browser side: a drop-in for the bits of supabase-js the arcade uses (it sets
  `window.supabase.createClient`), so every game's online code still reads like Supabase code.
  The games load it from `https://noah-and-lars.github.io/projects/rt.js?v=N` (so downloaded
  copies work too) where they used to load supabase-js; the old `SB_URL`/`SB_KEY` lines are
  unused. Cube Assault loads it with a plain script tag before the counter, so `mp-net` finds
  `window.supabase` already there and never loads supabase-js (mp-net itself was not changed).
  Bump `rt.js?v=N` everywhere when rt.js changes. Since 2026-11-06 (rt.js v=2) online play needs an online
  account: without `arcade-acct` (no account or a local account) every channel except `online:arcade` (the on-now
  counter) reports CHANNEL_ERROR without connecting and `askForAccount()` opens the account popup (the top window's
  `ArcadeAccount.welcome`, or its own box when a game runs on its own). Games then act as if offline. It's a
  client-side check, not enforced on the server. Deploy the Worker with `npx wrangler deploy`
  in `realtime-worker/` (owner's Cloudflare account). Free plan: 100,000 Durable Object requests
  a day (incoming WebSocket messages count 20 to 1, outgoing are free), reset at 00:00 UTC.
- Live "on now" counter: `ArcadeOnline` in `games.js` joins one realtime
  Presence channel (`online:arcade`)
  and tracks which game each visitor is on (`home` for the home page). The home
  header shows the total; `play.html` joins for the game it's showing, and a
  game in its frame reads the count from `window.parent.ArcadeOnline` instead
  of connecting again. Cube Assault shows its own count on its home menu and
  connects itself when opened on its own. Counts show as "200+" from 200. If the
  realtime server can't be reached, counters stay hidden. Nothing is stored.
- The site shows no email or contact details anywhere (the owner removed them).
- One folder per game, each with a self-contained `index.html` and a `thumb.svg`
  cover (16:9).

## Games

- `cube-assault/`: first-person 3D shooter (Three.js bundled into the file). Since 2.3 it has touch controls (`#touch` layer, `autoTouch` / `touchMode()`, setting `touch`: auto, on or off).
  Since 2.6 it has online multiplayer. The blocks `mp-ui-css`, `mp-ui`, `mp-stub` and `CS MAP` are the lobby, HUD, results and Outpost map; the `<script id="mp-net">` block is the netcode and provides `window.CAMP` (the interface `mp-ui` uses) and `window.mpNet` (hooks the game calls from `shoot()`, `slash()`, `fireRocket()`; look for `// mp-net hook`). `gameMode` is `'mp'` during a match. Rooms are realtime channels `ca-room-<CODE>` (Presence = player list, host = first to join) plus one `ca-room-<CODE>-<id>` pipe per player to the host. It reuses the arcade's connection (`ArcadeOnline.client()`, or `window.caSupabase` from the game's own counter). Supabase's free plan capped the whole project at 100 messages a second, so the host lowers the update rate in bigger rooms (`MAX_HZ`, `ROOM_BUDGET`); the Cloudflare server doesn't need that cap, so it can be raised (an mp-net change: ask first). Room chat (2.8.3): 'chat' on the room channel, `CAMP.chat()` and the 'chat' event, drawn by the `<script id="mp-chat">` block (Enter opens it).
- `block-drop/`: Blocktris, a falling-block puzzle with keyboard and touch controls.
- `2048/`: sliding-number puzzle with keyboard and swipe controls.
- `poly-racer/`: Poly Racer, a 3D racing game (Three.js r128 copied from Cube Assault into the file). Two modes from
  PLAY: the 100 time trials (1.1) and, since 1.2, races on 30 circuits.
  Time trials: 100 tracks in `TRACKS` (s = series 0-9, `par` = gold time; silver x1.12, bronze x1.3, `MEDALS`), ten `SERIES`
  each with a world in `ENVS`. The first six tracks are the 1.0 ones with the same ids, so saves carry over. Tracks are
  strings of pieces read by `buildTrack` (S straight, L/R turn, WL/WR wide turn, QL/QR 45 degrees, XL/XR chicane, BL/BR
  banked, HL/HR hairpin, TL/TR banked bowl, U/D hill with n = height x6 m, O loop, K + G + LAND jump, C checkpoint, F finish).
  New tracks must be driven to the finish by the test bot (`poly-racer-tools/dev-tools.js` in the workspace, outside the repo).
  Races (1.2): `CIRCUITS` (15 `kind: 'track'`, 15 `'street'`; biome, diff 1-5, road width `w`, laps). A circuit is a polygon
  of corners (`pts`: [x, z, radius, height, extras] in units of 10 m) or grown from a seed (`gen`, `circuitShape`: gp/road
  shapes with features cut into the sides, `grid` = city blocks, `touge` = hairpins up a hill), rounded off by `filletLoop`
  and built into path frames by `buildCircuit` (heights eased round the loop, banking from the curvature, `surf` ranges of
  sand/dirt/gravel road, start line, two sector lines, the grid). The world (`buildCircuitWorld`): `roadField` (nearest road
  point on a 3 m grid; bridge points left out), `planSides` (per path point and side: kerb, run-off surface and width,
  barrier type, how far the "ribbon" may reach before another part of the road), the terrain shaped from the road
  (level with it, hills further out), `circuitGeometry` (road, ribbon either side out to the terrain, barriers; all of it
  goes into the `Collider` with a surface id per triangle: `SURF`, `SURF_GRIP`, `SURF_DRAG`), `circuitDecor` (start
  gantry and lights, grid boxes, pit building, grandstands with a crowd, light towers, brake boards, marshal posts, town
  buildings with shops and lit windows, lamps, chevrons, fences and walls, houses, beach huts, bridges, the tunnel).
  Seasons, time of day and weather come from `makeEnv(biome, time, season, weather)`; `ENV.road` 0/1/2 (dry, wet, snow)
  sets tyre grip through `TYRES` (sport/rain/winter: the wrong ones spin you out, `Vehicle.loose`).
  Every car is a `Vehicle` (`physics(c, dt, drive)`, `carContacts` between cars); the player's is `car`. `RM` runs a race
  (grid, start lights, laps from sector flags, positions, finish, `resetOnTrack`); `aiDrive` follows `racingLine(track)` at
  `speedProfile` speeds times the driver's skill (`DIFF_SKILL`), passing on the side with room. `CarView` draws a car,
  `carEffects` smoke, dust, flying clods (`emitChunk`), spray and exhaust in the cold, `applyHits` dents and scratches
  (`damageCar`, the body gets its own mesh copy). Car models: `models/<id>.fcm` from the Free Criminal copy (FCM1 format,
  `parseFCM`, turned round so the front is -z; paint is a magenta marker swapped in `modelCompile`; credits in `CREDITS`,
  shown in Settings: the Sketchfab models are CC Attribution). The cockpit (`buildCockpit`) cuts the model's own interior
  out of the body (`cabinCut`) and adds a dash with five gauges, a wheel with gloved hands (two-bone arms), mirrors.
  Night uses the Free Criminal light system (`lit()`, `FCU` uniforms, `updLights`); bloom on High (`post`). The race HUD is
  `hud` (laid out like the user's GT reference); the dial speedometer is `drawDial` (Settings: dial or digital).
  Profiles: `profile` (name, country, helmet and suit out of 50 each: `HELMETS`, `SUITS`, `makeDriverFigure`,
  `studio` renders portraits on a second renderer), driving stats `ST` (`stats`), the skill chain `skill` (AIRBORNE xN).
  Sound: the engine is an AudioWorklet (`ENGINE_WORKLET`: firing pulses through an exhaust model); `music` plays a menu
  song and 10 race songs (`SONGS`) from a small synth in the page. Online (`net`, the `g13` block): rooms `pr-room-<CODE>`
  (Presence = players, host = first in), public rooms listed on `pr-lobby`, a pipe per player to the host, the host's
  snapshot to everyone, the rate from the room size (`hzFor`), finishing times to the host ('fin', 'res'). Another
  player's car is moved along the circuit between updates (`net.drive`). `?prroom=<name>` uses separate test channels.
  Saves `polyracer` (best, splits, bestCar, car, colors, cam, settings, raceOpts, profile, stats) and ghosts
  `polyracer-ghost-<id>`. The file is built from split sources kept outside the repo in the workspace's
  `poly-racer-tools/src-1.2/` (`build.py`); edit those and rebuild, or edit `index.html` directly. On localhost
  `window.__pr` exposes the game for tests (`__pr.step(n)` runs frames without the browser's frame loop).
  Since 2.4 (built in the work branch `claude/fervent-keller-pjhnvh`, folder `poly-racer-copy/`, where
  `HANDOVER.md` and the `blender/` tools live): eight real Sketchfab cars (CC Attribution, credits in `CREDITS` and
  `models/credits.json`) with interiors, baked ambient occlusion and the model's own steering wheel; the van is gone.
  The cockpit hands are a posed glove model (`models/glove.fcm`, `cockpitHands`, `rimFit`) with skinned sleeves
  (`makeSleeve`) and photographed leather, suede and suit fabric (`gearMat`, `models/tex/gear-*`). The Ultra setting
  loads `ultra/` (skies, ground textures, trees; about 37 MB, only on Ultra): screen-space reflections (`SSR_U`), water
  (`makeWater`), rain puddles, soft shadows, motion blur (setting `mblur`), a lens look. Headlights (`HEAD`, `BEAM`),
  damage scratches and cracked glass (`crackGlass`), photo mode (`photo`, F9 or the pause menu, a touch bar).
  Every open copy looks at the published `VERSION` 20 s after it starts and then every 2 minutes (`updater`) and,
  when it is different (since 1.4; before, only a higher number counted), reloads straight away (even mid-race) with
  the version in its address so the cache can't serve the old page: change `VERSION` with every release. The home
  page's entry opens `poly-racer/index.html?v=<version>`.
  1.4 (named by the owner; it follows 2.4, and copies still open on 2.4 only pick it up when reopened): steady wheels.
  `wheelSplit` squares each model's wheel on its axle (the Nyx's was modelled turned 25°) and sorts the wheel part's
  pieces: tyre, rim, disc and nuts turn; the caliper and what sits on it and anything reaching in past the tyre steer
  but don't turn (the `fixed` mesh on the pivot); pieces outside the tyre are dropped. Each wheel is scaled to its own
  radius (`parts.r` is the template tyre's). `rimBits` moves rim pieces that some models keep in `det`/`interior`
  (the sedan's spokes) onto their wheels. The cockpit eye is checked against the cabin (`seatEye`: seat back, cushion,
  roof lining), and interior materials are double-sided (the Ultra depth pass has `depthM2` for them).
  Models are packed (16-bit positions and uvs, `pq`/`uq` in the part header). `poly-racer-copy/` on this branch only
  redirects here (it held the 2.4 preview for a day).

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
  realtime server (sharing `ArcadeOnline.client()` when on the play page): `bc-public-who` is Presence (the player
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
  Ratings (1.4): Glicko like chess.com (`glicko`, `rdNow`, `RATE`): `save.rating` {r, rd, at, n, peak}, started once from
  the level picker (`#rateLevel`: 400/800/1200/1600/2000, RD 350); RD grows while inactive (`RATE.c` per day, back to
  350 in about a year), floor 30, rating floor 100, '?' while RD > 110. Each screen rates itself: presence on the
  table carries `r`/`rd` (`Net.myRating`, `Net.retrack()` after a game, `Net.opp.rate`, the 'rate' event), the
  game is played for `online.oppRate` taken at its start. Only online games where both sides moved count (fewer is
  "aborted": no record, no rating); leaving mid-game is a loss; an opponent without a rating (an older copy) is unrated.
  `stat()` in games.js shows the rating, and account.js `score()` counts online games.
  Local 2-player (1.5): `save.opp` 'local' (Opponent picker `#oppSeg`), `localGame`: `player` follows the side to move,
  so the board turns round (`passTurn`, after the move slides); no records or rating (`finishLocal`), not saved, Undo
  takes back one move. Leaderboard (1.5, `LB`): `/acct/top?g=chess` if the server has it (added to the Worker source
  on 2026-11-07, not yet deployed), otherwise `/acct/players` then `/acct/player` for each player with scores, 6 at a
  time, cached 10 minutes in sessionStorage. It reads games.js chess `stat()`, which now adds "(best N)" from `rating.peak`.
  The 1.4 patch notes were missing (the ratings update still said v1.3): fixed in 1.5.

- `cube-tower-defense/`: Cube Tower Defense, an endless tower defense with the cubes from Cube Assault (Three.js bundled into the file). Saves `cubeTDProfile` (name, level, best wave, stats) and `cubeTDSettings`.

  1.3: 25 new units in `NEW_T` (each has `base`, one of the first nine, which sets its model (`personModel` via `BASE_OF`,
  colours from `look`), its behaviour in `updateTowers` (`t.B`) and its sound; upgrades from `newUpg`). Online (`window.TDN`,
  the end of the main script; Online on the main menu, `#menu-online`): rooms on the realtime server (`ctd-lobby-<mode>`
  for quick match, `ctd-t-<key>` tables, 5-letter private codes, `?tdroom=<name>` test channels). Co-op: the host runs
  the cubes and waves; the guest's `damage()` and base hits are switched off (`TDG()`), it sends 'pl'/'sl'/'up'/'wv'
  requests, the host answers with 'u'/'sd'/'ua' and a snapshot 's' twice a second in a wave (every 2 s otherwise);
  wallets are separate (`TDN.gc` is the guest's on the host), units have an owner `t.o` ('h'/'g'), 3 farms each,
  cubes x1.5 health. Versus: each screen plays its own game, waves from a shared seed (`TDN.waveRand`), auto-start
  (wave 1 after 15 s, 8 s between), no speed-up; 'st' once a second (units only when they change) drawn on `#oppCv`;
  'lost' ends it. Both modes need an online account (rt.js).

- `free-criminal/`: CLOSED since 2026-10-22 (the owner closed it; it stays listed on the arcade with a "Closed for now"
  tagline). `CLOSED_NOW` before `boot()` shows the `#closed` screen instead of building the city, so nobody can play or
  join online; it stays open on localhost for testing (`?closed` shows the closed screen there). Set `CLOSED_NOW` to
  false to reopen it. Free Criminal, an open-world 3D crime game set in San Varro (Three.js r128 copied from Cube Assault into the file). Version 1.1 adds 3x traffic, ragdoll crashes, gun stores (10 guns, grenades), a mall and a new HUD; 1.2 adds carjack animations, police vision cones and a denser countryside; 1.4 is a much bigger streamed world (countryside built in 400 m chunks around the player), interiors, safehouses, day/night, rain and touch controls. The page has no doctype (quirks mode), so element ids match CSS case-insensitively: never reuse an id that differs only by case. Saves only its settings (`freecriminal.settings.v1`). Since 1.7 it has online free roam: the `NET` block and `playOnline()` (Play online on the menu, no intro). One
  shared city on the arcade's realtime server: `fc-who` Presence (player list, host = first to join), `fc-pub` for
  the host's position snapshots, hits and kills, and a `fc-p-<id>` pipe from each player to the host. Other players
  are drawn with `makeHuman` / `makeCarModel`, `shootRay` checks them (`NET.ray`), and the victim's own screen takes
  the damage. Chat (1.8): T opens `#fcChat`, messages are 'c' on `fc-pub`. Traffic, peds and police stay local. `?fcroom=<name>` uses separate test channels (and exposes
  `window.__fc` for tests).

- `bull-run/`: Stocks Game (first called Bull Run; the folder, game id and save keys keep that name so saves and links still work), a stock-trading game (plain canvas 2D, no libraries). Twelve made-up companies (plus two crypto coins) with prices from a random walk plus market, sector and company moods and news shocks. The calendar advances a trading day every `DAY_SECS`, but prices and news only move every `TICK` trading days (about 25 seconds); change figures compare with the previous move (`prevTick`, `tickWorth`). Earnings and dividends every `EARN` trading days per company, with rumours one update before; tips and pumps land at least `MIN_LEAD` days out (`leadUpdate`); the back room pauses the market while open; the back room (`buyTip`, `pumpStart`, `borrow`/`repay`, `bribe`) schedules events in `G.pending` and raises `G.heat`, which sets the chance of a fine (`bust`); three convictions (`G.busts`) call `prison()`, which runs a year of days instantly. Shorts live in `G.short` (cash is the collateral; `marginCalls` closes one that rises 50%), the loan in `G.debt`/`G.debtAge` (`loanDay`, `collect`). There is deliberately no fast-forward: the only speeds are pause and 1x. Market randomness goes through `mr`/`mrand`/`mgauss`/`mpick` (seeded with `mulberry32` from the date in the daily challenge, `G.daily`, saved under `bullRunDaily`); player actions use `Math.random`, and each part of a daily market day draws from its own stream (`stream(key)`, earnings fixed in advance by `beatOf`), so a tip or pump only changes the stock it targets. Each day's targets are saved (`G.opened`, `G.targets`) so a reload does not re-roll the day. Reputation (`rep()`, best net worth across both saves) unlocks crypto (`unlock` on a company), half-price deals and options (`G.options`, settled by `settleOptions`). `showReport` is the year-end report and the daily's final score. Saves everything to `bullRunSave` (format `v: 1`, including a year of generated price history); `stat()` on the home page reads `stats.best`.

- `havoc-bay/`: Havoc Bay, a Red vs Blue sea battle in the style of Harbor Havoc on Roblox (Three.js r128 copied from Poly Racer into the file). Single player with bots on both teams (`Bot`, `botShip`, `botPlane`). Each harbor is a `HarborEnt` with 25,000 health whose buildings are collider boxes flagged `h`; the five claimable islands (`ISLANDS`, `updateIslands`) give the owner their turrets and a boat pad. The world is built from Roblox-style parts with `Builder`/`Site` and the island shapes come from `landH()`; the second half of the map is the first half turned 180 degrees (`flip`). Balance lives in `WEAP` (damage per weapon, with `vs` multipliers per target kind; harbors take reduced damage), `SHIP_TYPES`, `PLANE_TYPES` and `TURRET_TYPES`. The title screen runs a bot-only demo match (`startMatch(true)`). Losing your ship is not a death: you stay on the slowly sinking wreck (`sinkT` in `Ship.update`) until you press E or the deck goes under, then swim; B (`deployKey`) redeploys from anywhere after 5 seconds. Aircraft carriers (`SHIP_TYPES.carrier`, `carrier: true`) are plane spawn points for their whole team (`teamCarriers`, `launchFromCarrier`); bots build at most one per team at the home harbor and keep it on their own side (`station` mission). When a match ends with a loser (harbor destroyed or time up), `startCine` plays the ending: it opens in the B-52's cockpit (`buildCockpit`, jet pilots from `makePilot`, displays drawn on canvases), then the bay doors open, the camera rides the bomb down, then a wide shot shows the losing harbor flatten (`H.mesh` scaled down and charred, restored in `resetWorld`) while the bomber banks away; click or Space skips (`skipCine`). Saves `havocbay.profile.v1` (matches, wins, kills, best damage) and `havocbay.settings.v1`. To test balance without waiting, call `step(1/30)` in a loop from the console; a hidden preview pane pauses `requestAnimationFrame`. Its title screen plays a separate realistic reel (`<!-- hb-reel:start -->` block before `</body>`, own renderer and scenes, `window.hbReel`): five 7 s shots with fades (pilot's-eye cockpit, camera on the pilot, carrier aerial, catapult launch, desert assault), detailed people (`Person`, arm IK onto rifles, `mergeTree` to keep draw calls low) and a film pass (`makePost`). `frame()` skips drawing the demo battle while `hbReel.covering`. It follows Graphics quality: Low keeps the demo battle, Medium draws it plainly, High adds the film pass. Check a moment with `hbReel.hold = true; hbReel.seek(24)`.
  Online play works like Cube Assault's. ▶ PLAY joins the one shared server, the realtime channel `hb-world` (up to 8 players, fixed settings in `WORLD`): a match always full of bots where each real player takes a bot's place on the side with fewer real players, and the next match starts by itself `NEXT_MS` after a result. 🔒 Private room makes a `hb-room-<CODE>` room with a lobby (up to 6); 🤖 Practice is the offline game. Presence is the player list and the host is whoever has been there longest; each player has a `<channel>-<id>` pipe to the host. The connection is `ArcadeOnline.client()` inside play.html. If the host leaves, the next player takes over (`takeOver`): their screen turns its copies back into real bots and stand-ins under the same ids and the match carries on; the others follow (`hostMoved`). The netcode is the `<script id="hb-net">` block at the end; the main script only calls hooks behind `NET.on` / `NET.host` / `NET.client` (look for `NET.`). The host's screen runs the whole match (bots, damage, islands, harbors, clock). Every other player drives their own vehicle locally and sends its state, gun angles, "fired" bits for machine guns and each heavy shot; the host keeps a stand-in for it (`e.peer`). Other screens draw the host's world ~230 ms behind as puppets (`Track`, `driveKind`) and replay its events (shells, kills) on the same clock. Bots fill the empty places (`fillBots`, `NET.humans`); a bot that makes way finishes its current life first. Rate: `MAX_HZ` 6, `ROOM_BUDGET` 60 messages a second (3n - 2 per update; 2 a second at 8 players). A hidden host tab slows the shared match to about one update a second (browsers throttle timers in background tabs). Chat (1.2.2): Enter or T to everyone, Y to your team (Tab switches, 💬 on touch), in the lobby and in a match; 'chat' on the room channel `{ id, m, tm, t }`, team messages dropped by the other team's screens, the Global chat's `tidy()` filter, 5 messages per 10 s; it's the chat part of `hb-net`. F3 shows the network overlay; `?mplag=150&mploss=0.05` simulates a bad connection; `window.HBNet` has helpers for console testing (two iframes of the game on one page both get frames).
  1.2.3: cold water. `s.cold` counts seconds swimming (down three times as fast out of the water); at `FREEZE_S` (30) you die (a `team: -2` hit, sent to the host like a fall); `updateFreeze` puts the `#freeze` meter over your head. The keep's computer (`PC`, `drawPC`) has a desktop with two apps (`appTile`): Missiles (`BTN_SEND`, as before) and Map (`BTN_MAP`, state `'radar'`, `drawRadar`: every ship with a crew, plane and soldier, real players named, you ringed).
  1.2.4: day and night (`updateDayNight`, called from `frame()`): `dayClock()` is match seconds into the day from
  `GAME.clock0 - GAME.clock` (so every screen agrees; the demo stays at 09:40), DAY_S 180 of light (06:00-18:00),
  NIGHT_S 90 of night, DAY_START 15 (a match starts at 07:00). The sun moves on an arc topped by the old fixed sun
  (`NOON_DIR`), slowed near the horizon at night; at night the moon takes over the one `sun` light and `SUN_DIR`.
  Colours blend between `DN.day/dusk/night` (fog, sky, hemi, water, clouds), the sky shader draws stars (`night`),
  exposure drops to 1.0 at night. `#tod` (top right) shows the time. Foot guns: `FOOT_GUN_HOLD` (scale and grip point
  per model) and the mount rotation (pi/2, pi, 0), so they are upright with the grip in the hand.
  1.2.5: planes. `PLANE_FUEL` (seconds at full throttle, burning 35% at idle) in `Plane.update`; empty, `thr` is 0 and the
  nose can't rise above a glide. `landedRepair` is now a service: parked (speed < 6) for `SERVICE_S` (8) seconds gives a
  full tank, full bombs/missiles and `SERVICE_HEAL` (half) health, once per landing (`svcT`, `svcDone`; the host runs it
  for a landed player's stand-in, flag 16). `planeSpotOk`: planes deploy only at the airfield, a plane pad, Crown Isle
  (the island with `I.rw`) or a carrier. Jet 800 with `JET_WAIT` (`PLAYER.jetAt`, match seconds from `matchEl()`),
  bomber 700; the bomber's tail gunner (`REAR_RANGE`, `REAR_HIT` 0.75) leads with the bomber's own speed. Bots: half
  are 'air' (`i % 2`), and `botLand` brings a bot home when fuel runs low (`bot.rtb`; tryLand works for it). The cockpit
  (`COCKPIT`) draws its panel on a canvas at 10 Hz (`drawPanel`), the jet's HUD (`drawHUD`), and moves `stick`/`yoke`/`thr`.
  1.2.6: ship gunners. `Seat` also works on a ship (`seat.ship`; `.plane` is then the ship and `k` the index of one of its
  `auto` AA guns). `seatPlanes()` lists teammates' crewed ships with a free AA gun (one deploy card per ship). The local
  gunner turns the gun with `g.track` and fires `g.shoot(1, seat)` (shots belong to the gunner); `shipGuns` skips a
  manned gun, and the host runs `peerShipSeat` for a gunner on another screen (also for a stand-in ship, whose manned
  guns it no longer takes from the driver). Ship rows carry seat keys at index 15 (`e.seatKeys` on puppets and on the
  driver's own ship). A blast of size >= 6 within `size * 0.9` of your gun kills you (`explode`); a sunk ship drops
  you in the water (`bailOut`).
  1.2.7: `HARBOR_X` 2126 (was 1575) and harbor islands `r` 290 (was 225); `MAP`, `BOUND` (x 2950), `DEPTH_W`, `MINI` and
  the PC map's `MAPV.s` grew to match. Each harbor has six more turret spots on the new land (4 AA, 2 cannons).
  `restoreIsland` (called by `setIslandOwner` when a team claims it) removes `SCORCHES` and `EMITTERS` on that island.
  1.3: `midairHit` (any two planes, either team, within 62% of their radii) in `Plane.update`: both are killed with
  `midair` + `crashed` (a fireball in `onDeath`, then the wreck falls and blows up on the ground). Each screen checks the
  planes it runs; the host or offline game also kills the other plane. First person: `settings.fp` (C on foot or on a
  ship; planes keep C for the cockpit), the soldier is hidden while you look through his eyes (`fpBody`). The cockpit
  (`COCKPIT`) is now a cabin fixed to the plane (`COCKPIT.orient()` after the camera turns): a tub with floor, walls, seat,
  bulkhead and glass for fighters and the jet, a flight deck with roof, side windows and glazed nose for the bomber.
- `card-royale/`: Card Royale (1.1), a real-time 1v1 card battler (towers, lanes, Elixir, 75 cards in `CARDS`, plus `TOKENS`
  for troops other cards spawn). The file is built from parts kept outside the repo (`~/Downloads/card-royale/src`, joined by
  `build.sh`): data, `20-sim.js` (the battle: `newBattle`, `step` at 20 ticks a second, `play`, `canDeploy`, the bot in
  `botThink`, `snapshot`), art (everything drawn with canvas paths, card portraits cached by `portrait()`), the battle screen,
  the netcode and the menus. Save: `cardroyale.save` (in account.js GROUPS and `score()`). Online is quick match only:
  Presence on `cr-queue` is everyone searching, the first two pair up (smaller id invites with 'inv', the other answers 'acc'),
  then both move to `cr-m-<code>`. The host runs the sim and sends a snapshot ('s', with the sim's events) ten times a second;
  the guest draws them ~140 ms behind and sends 'play'. Emotes 'emo', chat 'chat' (through the swear filter). A player who
  leaves ('bye' or gone from Presence for 9 s) forfeits. `?crroom=<name>` uses test channels; to test online on localhost run
  a copy of the Worker with localhost in ALLOWED_ORIGINS and set `localStorage['arcade-rt-url']`. Bots (1.0.2): Battle searches
  for `BOT_WAIT` (10 since 1.1) seconds, or 2 s if it can't connect, and then a bot takes the battle (`startSearch` -> `startBotBattle(true)`);
  ranked bot battles go through `applyResult` like online ones (trophies, gold, crowns, chest; the log entry gets `b: 1`, shown as
  🤖). Tapping the arena picture opens Bot Battle: Ranked or Practice (no trophies or chests). Ranked bots get made-up names
  (`botName`), trophies near yours and a reaction delay `mkBot(..., slow)` of 1.2 s at 0 trophies down to 0 at 1500. `NET.search`
  has a generation counter so a search cancelled mid-connect never joins the queue. Arena look (1.0.2): `THEMES` and
  `ARENA_THEME` (one theme per arena: grass, bone, dry, magic, snow, jungle, lava) drive `drawArenaBG`, `drawWater` (via
  `CUR_THEME`) and the floating-island `arenaCanvas` on the Battle tab; the card tray is wood (CSS block marked 1.0.2).
  1.0.2 was edited directly in `card-royale/index.html`: copy the changes into the parts in `src` before the next `build.sh`.
  1.1 (also edited directly in `index.html`; copy into `src` before the next `build.sh`): 25 new cards at the end of `CARDS`
  (a card's place in `CARDS` is its id online, so only ever add at the end; new tokens `wolf`, `hornet` at the end of `TOKENS`;
  cards with `tok` copy that token's stats). New card fields: `heal` {r, amt, every} (an aura on a troop or building, `healAround`),
  `stunHit` (its shots stun), `sp.heal` (a healing spell over `sp.dur`), `sp.push` (Gust: a strong knockback), `sp.slow`, `sp.ground`
  (misses flyers), `sp.wait` (lands after that long; Meteor and Rockslide show a ring to both players), `sp.noSlow`, `art.barH`.
  Fixed in `updSpell`: instant spells (Zap) never went off, and The Log's start hit every enemy on the map. Troops and buildings
  take `DEPLOY_T` (1.5 s) to arrive and are drawn as an outline (`outlineSprite`, cached) with a ring that fills; card names show
  on hand cards (`cardEl(id, { name: 1 })`, `nameFit`), over the drag ghost and over each play (`nameTag`, fx 'tag'), and under
  collection tiles. Chat is sent as typed and filtered on the viewer's screen only when Settings > Chat filter is on (`SAVE.censor`,
  `chatText`); names still go through `tidy`. Music: `MUSIC` plays `card-royale/music/menu.mp3` in the menus and `battle1.mp3`
  in a battle (streamed, looped, faded; nothing loads before the first tap; a missing file is just silent; `SAVE.music`).
  Profiles: `SAVE.tag`, `SAVE.used` (plays per card, for the favourite), `myStats()` goes with the profile as `st` (checked in
  `clean`), bots get `botStats`; each log entry keeps the opponent's profile in `p` (log holds 25); `openProfile`, `openLog`,
  `logRow`. Tapping the arena opens `openRoad` (the Trophy Road overlay `#roadOv`); the Bot Battle modal and practice mode are gone
  and `BOT_WAIT` is 10. Queue presence carries `v: GAME_VER`, so 1.0.2 and 1.1 players never meet.

- `siege/`: Siege, a 5v5 tactical shooter split out of Cube Assault 3.0 (see `siege/README.md`). Online rooms `csiege-<code>` on the
  realtime server; room chat (1.0.2): Enter or T to everyone, Y to your team, in the lobby, operator pick and the round.
  1.0.3: no jumping (walking into a sill, counter, rail or low furniture vaults over it: `sgVaultCheck`, `VAULT_H`), bots
  need a real line of sight (`botSees`/`botLine`, checked again before each shot), right-click aim toggles (setting `ads`:
  toggle or hold), no damage outside the action phase, textures are `stableTex` DataTextures (canvases can be wiped by
  the browser), old maps/gadgets/bodies are freed with `sgDispose`, and furniture that would box off part of a room is
  taken out again (`placeChecked`). On localhost `__sg` exposes `botSees`, `sgVaultCheck`, `sgLightAt` for tests.
  1.0.4: fourth map `ranch` (Ridgeback Ranch, original layout, daylight): map flags `day`, `fog`, `ground`, `ext` (outside wall
  material) and room flag `sky` (no ceiling over that yard: `M.underSky`); top bar = your team (health bars) left, enemy as ?
  until spotted right; 3-2-1 countdown `#sgCd`; drones hop with Space; out of drones in prep = mode `dspec` (watch team drones).
  1.0.5: map `ranch` is named Oregons; down-but-not-out (`P.down`, events 'dn'/'rev', `sgDownTick` bleed, DOWN_HP 25,
  REVIVE_S 4; the downed don't count in `sgAlive`), team reinforcement pool `G.reinfLeft` (REINF_TEAM 10, in the 'ph'
  snapshot as `rf`), overtime `sgGoal()` (sides swap every OT round), plant/disable 7 s, `sgFire` refuses while the riot
  shield is up. Sky/ground materials are cached (`skyMat`). Long test runs: step in chunks with pauses (one huge blocking
  loop makes headless Chrome's GPU fall over and look like shader errors). Home page: Siege, Cube Assault, Havoc Bay,
  Gamble first in `FIRST`, Siege pinned in the banner (`renderFeature`).
  1.0.6: barricades have one pool of hit points (`BAR_HP`, event 'bhit', `sgBreakBar`) and door ones start 28 cm up so drones
  fit under; `sgCollide(pos, r, h, dyn, step)` only steps over 'step'/'prop'/'top' obstacles; `sgRayEnts` uses its own
  eye object (it used to overwrite the shared `_e`, so melee and the Skeleton Key missed); lean eases via `P.leanV`.
  1.0.7: a barricade is one board (`barBuild`, `barDraw`, `barPlanks`: two faces with the panel's own RGBA DataTexture,
  `BAR_PX` px a metre, alphaTest). Bullets punch holes (`barHole`; 'bhit' carries u, v and r so every screen stamps the
  same ones) and `sgRay` lets rays through where the texture is clear (`barOpenAt`), unless `opts.solidBar` (melee,
  the Cutting Torch and `aimSurface`: a swing or a charge isn't stopped by a hole). It breaks at `BAR_HP` or when
  `BAR_OPEN` of it is holes. Attackers' path cost through a barricade is lower, and a bot breaking one keeps at it
  (`A.breakBar`, `A.breakT`). The chunks are still there for collisions. `__sg` also has snPractice, sgStartMatch.
  1.0.8: `sgMoveDrone` moves in 4 cm steps (a whole 50 ms frame took a drone through a 16 cm wall) and a hop under a
  barricade stops at its planks; one drone per attacker; Shift boosts it (`DRONE_SP`, `DRONE_BOOST_SP`, `D.boosts`,
  `D.boostT`, `DRONE_BOOSTS` a round of `DRONE_BOOST_S` seconds).
  1.0.9: out of the round, 5 toggles `specCams` (`deadCams`/`deadCam`: defenders' cameras and bulletproof cameras, or
  the attackers' deployed drones), A / D cycle `specIdx`, the mouse turns `specLook`, a click spots (`sgTrySpot`).
  Attacking bots out of a fight shoot cameras they can see (`A.camI`, `A.camScanT` in `botThink`).
  1.0.10: sound icons: `snd(name, pos, vol, src)` also calls `sndIcon`, which keeps `SVIS` entries for the sounds in
  `SND_ICON` ([icon, metres, seconds]; the source's own team is skipped) and `sgMarkers` draws them (`.mk.snd`); setting
  `sndIcons`. `sgStepSounds` plays everyone else's footsteps (not crouched). `sgGiveAway` (in `sgFrame`) does being
  outside, Pulse Scan and Signal Hack for every player this screen has `auth` over (it was the local player only, so
  bots were never found); bots hang up after 2-4 s. Murk: X with canisters out sets them off, Shift + X throws another.
  Traps check their line from just off the surface they sit on (`ge` in `sgGadgetsUpdate`). `__sg` has more handles.
  1.0.11: loadouts: `P.ld` (bit 1 = second gun, bit 2 = second gadget), in the 'op' event and the roster (7th field),
  chosen on the pick screen (`.ldB`, kept per operator in `settings.ld`), bots random in `sgFreeOp`; `sgArm` uses it.
  Claymore is `side: 'both'` and several defenders' gadget pairs have claymores or shields. Rappelling: `P.rope`
  (`sgRopeStart` on Space facing an outside wall in the action phase, attackers only; `sgRopeStep` from `sgMove`;
  `ropeWallAt`; `sgRopeWindow` on F kicks a barricade in and vaults inside). The maps have few tall outside walls under
  open sky (covered yards stop the climb at their ceiling), so roofs are the next step.
  1.0.12: roofs. `M.roofAt(L, x, z)` (the slab over a room that isn't a sky yard, with nothing on floor L there: the top
  of the building or a lower wing) gets a concrete top face and a 0.55 m parapet (obstacle `k: 'parapet'`, vaulted)
  where it drops away; `sgGround` stands on it, `M.onRoof` / `M.roofRoom` make `sgRoomAt` call it outside (and
  `sgLightAt` lights it as open sky: sun, or moonlight at night, never the lamps below). `M.roofHatches`: two per map
  over the top floor's biggest rooms (same hatch panels as `D.hatches`). The rope climbs onto a roof at the top of a wall
  (vault in `sgRopeStep`) and starts down the outside from a parapet (`sgRopeStart`). Yards made `sky: 1`: hotel K and
  g, port D and Y, manor T (renamed Terrace, spawn too). Grenades have models (`gmesh` frag/smoke/flash/emp/impact).
  1.0.13: wallbangs. In `sgTrace` a drywall chunk takes `dm * 0.15` (0.3 for pellets; hp0 34) and the shot always goes on
  (two walls, `dm *= 0.6` each). `holeShot` puts marks on both faces (an InstancedMesh per map, `holeBuild`, `HOLE_MAX`,
  owned per chunk and cleared in `sgPanelDraw` when the chunk goes); remote shots stamp them with `holeTrace` along the
  line from `snRemoteShot`. A punch removes just the chunk it hits. Ray hits on a panel are at its middle plane.
  1.0.14: smarter bots and prone. `P.prone` (Z; eye 0.42, speed 0.9, a low hit box like `P.down`, `pr` in the snapshot);
  Murk's canisters are X only. Bots: `botHoldSpot(R)` (a cell 2.5-8 m back from one of `roomEntrances(R)` with a view of it,
  not on furniture, a shield or a teammate's spot; `A.hold` with yaw/crouch/prone, re-pathed up to 4 times), peeking
  (`A.peekS`/`peekT`/`peekEnd` set `P.lean`), hearing (run < 7 m, walk < 4 m, shots < 18 m; crouched/prone are quiet),
  wallbang bursts (`A.bang`, a guess near the sound, only if `botWallOnly` finds just drywall; chance `DIFF[].bang`, x3
  for shots), and `botGadgets` (attackers: hack, scan, sonar, EMP near the site, frag/flash where they lost you; defenders:
  gas/kunai/claymores on the site's doorways, Volt rods on reinforced walls, Murk sets gas off). Test-clock caveat: `now()`
  is real time + `SG_TOFF`, so a slow headless step can expire hold/bang timers early.
  1.0.17: drones. A jammed drone loses control but still falls (`sgMoveDrone` swaps the input for nothing instead of
  returning), a thrown drone is carried out from your feet in 4 cm steps (`sgEnterDrone`, it could land through a thin
  wall), `D.safe` brings back a drone that drops below -20 m, and the bot snapshot key includes `o.d` and `o.m` so bots'
  drones are sent as they move (they were sent once a second).
  1.0.15: the half of a reinforced wall that wasn't reinforced (`3 - p.reinf`) shows bolt marks: `W.stars` (one
  InstancedMesh per map, a slot per wall chunk at `p.star`), set by `starMarks(p)` from `sgPanelDraw` (every other
  chunk, jittered, `starMat()` canvas star, lit like the chunk). `sgBoom` marks the panels it hit `dirtyDraw` (it zeroes
  `alive` itself, so `EV.boom` used to skip the redraw on the screen that set the charge off); a punched hatch redraws too.

- `krill-dive/` (2026-11-07): Krill Dive, a daily rarity-trivia game (plain canvas 2D and HTML, no libraries; named
  Krill Dive rather than after the existing game the owner described). `KD_DATA` (the first script) holds the
  familiarity lists (`lists`, each ordered from the most familiar answer to the least; "Main/alias/alias") and the
  prompts (`add(q, list, filter)`; word-shape prompts filter a big list). Rarity tier = an answer's place in its
  (filtered) list (`score()`: first 15% Plankton 10, Shallows ~30, Reef 50-65, Abyss ~80, last 12% Trench Find 100);
  `share()` is a rough Zipf estimate, not real player data. `match()` normalises accents, "the", plurals and allows a
  one- or two-letter typo (Damerau). Daily prompts come from the UTC date (`pickPrompts(rng(hash('krill-dive:' + d)))`,
  never two from one list; prompts with fewer than 6 answers are never picked), Dive #1 is 2026-11-06. 3 s to read
  (`READ_S`), 25 s to answer (`ANSWER_S`); unrecognised answers don't count against you. Each point = 10 m, 700 = 7,000 m.
  The ocean is drawn on `#sea` (`frame()`: depth gradient `STOPS`, zone lines `ZONES`, creatures `CRE`, the krill).
  Save `krilldive` (days, best, played, total, streak, lastDay, mute). `?debug` exposes `window.__kd`.
  When adding prompts: keep every list ordered by familiarity, since that order *is* the scoring.

## Adding a game

1. Make a folder with a single self-contained `index.html` (no build step, no
   external servers) and a `thumb.svg`.
2. Add an entry to `games.js` (with added/updated times, keys and a stat()
   reader if the game saves a best), and a line at the top of `NEWS`.
3. Add a row to the games table in `README.md`.
4. Test it in a browser, including a phone-sized viewport.

## Conventions

  1.0.16 (after the 2026-11-05 outage, when the Worker hit the free plan's Durable Objects limit): `snSendStates` sends your
  state 8/s only when something changed (else 1/s), bots 5/s and only changed ones; `snInterp` draws people 160 ms and bots
  260 ms behind. Keep Siege's message rate low.
- Games save progress in the player's own browser (`localStorage`, wrapped in try/catch), exactly as before;
  `account.js` copies those saves to the player's Arcade account when they have one (2026-11-01). A game never
  talks to the accounts server itself. When a game adds a save key, make sure `GROUPS` in `account.js` puts it
  with that game (a new game's keys otherwise land in `misc`, which still syncs). The Worker on Cloudflare runs the
  live "on now" counter, the Global chat, the games' online rooms, Blockcraft's public server and the accounts;
  apart from accounts it passes messages along and stores nothing. No email or other personal data is collected.
