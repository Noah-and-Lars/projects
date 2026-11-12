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

- `console.js` (2026-11-11, loaded by every site page after account.js): the console version. It detects PlayStation, Xbox,
  Nintendo and smart-TV browsers from the user agent (`?console=on|off|playstation|xbox|tv` overrides, remembered in
  `arcade-console`), adds `html.console` (bigger text and cards, a yellow focus ring), a banner "You're on the console
  version" with a Full website button, and spatial navigation: arrow keys / TV remote (OK, Back = 461 webOS, 10009 Tizen,
  BrowserBack), and controllers (standard mapping, polled on a 40 ms timer: D-pad/left stick, A/✕ choose, B/○ back,
  L1/R1 tabs). The pinned header is its own layer; pop-ups (#acctOv, .ov, dialogs) trap the focus. On play.html it stays
  out of the way while the game frame has focus. A detected device that turned it off gets a small "Console version" button.
- Trailers (2026-11-12): `TRAILERS` in index.html puts a "▶ Play trailer" button above "playing now" on those cards;
  it opens #trailerOv with the game in an iframe at `?trailer=1`, which plays only the game's opening cinematic and posts
  `{arcadeTrailer: 'done'}` when it ends (Play now / Watch again). Gamble Your Life Away (1.1.1) and Russian Roulette
  (1.3.1) no longer play the cinematic on start and lost their Watch the intro buttons.
- `index.html`: home page. Intro animation (once per visit), a featured-game
  banner (the most recently added or updated game), "Continue playing", the
  game grid with search and category filters, and "What's new".
- The header of the home, chat, Players, Social and Support pages has five tabs: Games (`index.html`), Global chat (`chat.html`),
  Players (`players.html`), Social (`social.html`; on phones the bottom bar's 4th icon, 🎬, in arcade.css) and Support
  (`support.html`, 🛟 on phones; added 2026-11-11 at the owner's request). Support holds the bug and feature feedback
  form (a Google Form link), which used to sit at the bottom of the home page. Under it is the "Want to be a game tester?" card,
  a link to the game tester request Google Form, and under that the "Want to help build The Arcade?" card,
  a link to the developer application Google Form. The home page's chat tab shows how many are in the chat (`byGame.chat`); the Players
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
  New recovery code (2026-11-12): the admin panel's "New recovery code" button (op 'newcode', Account 'adminnewcode') gives a
  fresh code for a player who can't get in and clears a wrong-tries lockout; they use Log in > Forgot password with it.
  Codes are only stored hashed, so an old code can never be shown. Admin accounts can't be given one.
  Device bans (2026-11-12, asked for as "hardware bans"; a website can't read hardware ids): account.js keeps a random
  device id (`devId`: localStorage 'arcade-dev-id' + cookie 'arcade_dev') and sends it as `x-arcade-dev`; each account
  remembers its last 12 (`a.devs`). Admin "Device ban" (op 'devban') bans the account and lists its devices in the
  '__devbans__' object; a listed device gets 403 'device_banned' on signup, login, recover and sync (cached 60 s in the
  Worker). "Remove device ban" (op 'devunban') undoes both. Clearing browser data or another browser dodges it.
- Player names: every game with a name (Cube Assault, Cube Tower Defense, Havoc Bay, Rocket Rivals, Football,
  Poly Racer, Chess, Russian Roulette, Free Criminal, Blockcraft's server name) has a `<script id="arcade-name">`
  block at the top of `<head>`: it writes the account's (or local account's) name into the game's save before the
  game reads it and keeps the game's name box on that name, read-only. Cube Assault still lets the
  test names (GAMETESTER, ADMINTEST) be typed, since those ask for their password. Havoc Bay (1.3.1) hides its name
  box in Settings; typing GAMETESTER in the Private room name box asks for the password. The chat uses the account name too.
- Username changes (2026-11-11): the account panel's "Change username" (account.js `openRename`) calls `/acct/rename`;
  `Account.renameTo` copies every stored key to the new name's object (header 'x-arcade-move', `moveIn`, in batches),
  moves the Players list entry and scores, tells everyone it knows ('p-rename': friends, blocks, chat history keys,
  group members), gives this device a new token and leaves 'moved' behind so old devices get 401 (signed out). Once a
  week (`a.renamedAt`). Forced: `RENAME_NAMES`/`RENAME_BEFORE` (the lars account made 2026-11-09, whose name the owner
  gave to a friend) makes sync answer `mustRename`, and account.js shows the rename popup with no way to close it.
- Group chats and bigger calls (2026-11-11): group chats of up to 15 (`GROUP_MAX`) are conversations 'g~<id>' in every
  member's Account 'soc'.c (`{n, g:1, mem, own}`), messages stored by every member with `by`; `Account.group()` serves
  `/acct/group` (GET messages; POST op make/add/rename/leave/say), members are told with peer routes 'p-grp' (the whole
  member list; a member not in it is taken out) and 'p-gmsg'; pushes are `{t:'grp'}` and `{t:'gm'}` (account.js pops
  them up, players.html shows groups in Chats: `#g=<id>`, `#new=group`). Calls go up to 15 (call.js `MAX`): every pair
  is still linked directly, `bitrate()` lowers bitrate and resolution as the call grows, the stage becomes a grid; a
  group's 📹 button calls everyone (`ArcadeCall.start(list, name)`, 'ring' carries `gn`). The Worker's call limits are
  240 messages per 10 s and 6 new calls a minute, each ringing up to 20 people. While you're in a call, links to other
  site pages open in a full-page frame (`#accShell`, `openShell`) over the page the call started on, so the call keeps
  going while you play; the address bar follows the frame. Pages inside it forward calls to the top (`ArcadeCall.inFrame`)
  and share its live socket (account.js `inShell`); `window.ArcadeShellFrame` lets account.js skip pop-ups for a chat
  open in the frame. The ➖ button hides the video. Tested with 6 people (headless Chrome, fake cameras).
- `call.js` (2026-11-10): video calls, one-on-one or groups of up to 4, loaded after `account.js` on `index.html`,
  `play.html`, `chat.html` and `players.html` (the "📹 Video call" / "Add to call" button on a profile and in a DM).
  Anyone can call anyone who hasn't blocked them (the owner asked, 2026-11-10). Set-up rides the account's live socket:
  `POST /acct/call {to, d}` is pushed as `{t:'call', n, d, fr}` (fr = friends; at most 6 new rings a minute per caller).
  The media is WebRTC between every pair (mesh). Relay: Cloudflare TURN, added 2026-11-10 at the owner's request
  (after first saying no); `GET /acct/turn` gives signed-in players 4-hour logins, and it is OFF (direct only) until
  the Worker has the secrets TURN_KEY_ID and TURN_KEY_TOKEN; deleting them turns it off again. A link that isn't up
  is retried with an ICE restart at 6 s and 14 s and the call ends with a message at 24 s (never stuck on
  "Connecting video…"). Messages carry the page id (dev) so a call links to the device that answered.
  Screen sharing (2026-11-10): the call bar's screen button (hidden where getDisplayMedia is missing: phones and
  tablets) puts your screen in place of your camera on every link with replaceTrack (no new offer); a shared tab's
  sound is mixed with the mic (Web Audio); 'scr' {on} tells each person once their link is up, and their tile shows
  it whole (object-fit contain) and big. Gameplay clips were built on 2026-11-10 (see Social below).
  A friend's camera shows on the ringing card before you pick up; a non-friend's doesn't (and their card has Block).
  Protocol in the comment at the top of call.js ('ring', 'ans', 'ok', 'no', 'busy', 'end', 'roster', 'join', 'jans').
  Tests: scratchpad `cdpNv.mjs` with FAKECAM=1 (fake cameras, n browsers) + rt-local accounts Tester, Noah, Lars.
  Global chat (2026-11-12): a 📹 Video call button in the chat header opens `#callBox`, a picker of the signed-in
  players in the chat now (`callable()`: `who` entries with account ids, not guests, up to 14), and each signed-in
  player in "In the chat" has a 📹 button (`callButton`); both call `ArcadeCall.start(names, 'Global chat')`, so the
  ringing card shows "Global chat" as the call's name. Without an online account they open the sign-up popup. Labels
  turn to "Add to call" while you host a call (`callLabels`).
- Admin accounts (2026-11-11, the owner's request; lars and Claude added 2026-11-12): `ADMIN_ACCOUNTS = ['noah', 'lars', 'claude']` in worker.js (and account.js). A signed-in
  admin account uses `/acct/admin` without the password (whoami on its token); others still need the admin password.
  Ops: info, delete, chatdel, clipdel, avatardel, and new ban / unban / rename {name, to}. A ban (`a.banned`) clears every
  session, blocks login/recover/everything (403 'banned'), closes sockets and takes the name off the Players list; posts
  stay until deleted. Admin rename = renameTo() without the weekly limit. Admin accounts can't be banned, renamed or
  deleted. UI: account panel "🛡️ Admin tools" (openAdmin, also ?admin), and Social shows Admin: delete on posts and
  remove picture / rename / unban / ban on profiles for admins.
  Renamed accounts: the password key was stretched with the old name, so the account keeps `kn` (that name), `check`
  returns it, and account.js `keyName()` uses it for login, password change and delete; a new password or a recovery
  re-keys on the current name and drops `kn`. (Before this, a renamed player couldn't log in with a password again.)
- Approval (2026-11-11, the owner's rule): game clips made by the site's recorder (kind 'clip' and a WebM whose header
  says "The Arcade", checked in media-put as `own`) and Claude's posts (`bot`) go live; every other upload (photos,
  videos, a "clip" from anywhere else) gets `pend: 1` and is hidden from feeds, profiles, /one, comments and likes until
  approved. Only an admin ACCOUNT (ADMIN_ACCOUNTS, not the password) can use /acct/admin ops pending / approve / deny
  (the index's 'review' route). social.html: the shield button (#topReview, count badge) and #review panel for admins;
  uploaders see "Sent for approval". Posts from before this stayed live.
- Social words (2026-11-11): captions and group names are stored as written (no server word filter; usernames still are
  filtered). The account panel's Settings has "Filter swear words on Social" (`arcade-swear-filter` = '1', synced in the
  account's misc group); social.html's `fw()` then stars words in captions, comments and messages. Captions starred
  before this stay starred (the server had already replaced them).
- Social (2026-11-10, asked for by the owner: "like Instagram"): `social.html` + `clips.js` + the Worker's `/clips/*`
  routes (the comment block above `clips()` in `realtime-worker/src/worker.js` lists them) and the `Clips` Durable Object
  class (migration v5; deployed 2026-11-10). Posts are kind 'clip' (recorded on play.html, always from a game), 'video'
  and 'photo' (players' own uploads, game optional). One object 'index' holds every post's details, likes, comments
  (with replies and comment likes), views (one per viewer: 'a:<lower>' or a guest's device id 'd:<id>', with the share
  of the video watched, `wf`) and follows ('u:<lower>' = { f: following, fr: followers, lk: liked }); each post's file
  is its own object 'clip:<id>' in 1 MB pieces, served with a year-long cache. Uploading is POST /clips/new (details +
  a small JPEG poster) then PUT /clips/v/<id>?k=<one-time key>; the file's object checks the magic bytes (WebM, MP4/MOV,
  JPEG, PNG, GIF, WebP; a photo post must get a picture) and asks the index to `commit`. Limits: 12 MB a file, 25 posts
  a day and 100 kept per account; past 3.5 GB in all (the free plan has 5 GB) the weakest post older than 3 days is
  deleted (`prune`). Three reports from different accounts hide a post from feeds; `?admin` on social.html shows
  report counts and "Admin: delete" (`/acct/admin` op 'clipdel'). Deleting an account deletes its posts; a rename moves
  them (Account `goodbye` / `renameTo` call the index's 'purge' / 'rename'). Comments and captions shown with
  textContent; captions go through `tidy()`, comments don't (like the chats). `?clipsroom=<name>` on social.html and
  play.html uses a separate index ('index-test-<name>'): test there, never on the real feed.
  social.html (hash routes): #home (stories row: people you follow and friends with posts, else suggestions; posts
  ranked by `rank()`: the server's `hot` score (likes x4, comments x6, shares x5, views x share watched, divided by
  (age in hours + 2)^1.4) times this player's boosts: games they've played, games whose posts they liked, people they
  follow, fresh posts; seen posts x0.12; at most a couple from one player in a row), #reels (snap-scrolling, videos
  only), #explore (player search from /acct/players and a grid), #create, #me / #u=<name> (grid, Reels, Saved: saved
  is per device, `arcade-social-saved`), #c=<id> (one post with comments), #dm and #dm=<name> (an Instagram-style
  inbox over the accounts' DMs: Primary = friends and groups, General = everyone else; groups open on players.html).
  Media is fetched with fetch() (the server only answers the official origin, so <img src> can't be used) and kept as
  blob URLs (`mediaUrl`, 16 kept). A view counts after 2 s of a video (or most of a short one) or 1 s of a photo.
  Profile pictures (2026-11-10): your profile's picture button uploads a square JPEG (at most 256 px, under 40,000
  characters) to /clips/avatar, kept as 'a:<lower>' in the index; every avatar on social.html asks for its picture
  (`fillAvatar`, batched through /clips/avatars, cached 10 minutes in sessionStorage); no picture = the coloured letter.
  `?admin` on a profile has "Admin: remove picture" (`/acct/admin` op 'avatardel'). Only social.html shows them so far.
  Moderators (2026-11-11): the accounts in `CLIP_MODS` (Worker) and `MODS` (social.html), so far only Claude, can
  delete any post or comment ("Delete (moderator)" in a post's ⋯ menu; the server checks the account).
  clips.js on play.html: the 🎬 Clip last 30s button (or F8) saves the last 30 seconds. While a game is on screen and
  the tab is visible, every visible game canvas is captured (captureStream into tiny hidden videos, drawn into one
  1280x720 canvas, 960x540 on phones; HTML overlays aren't in it) and encoded with WebCodecs (VP8, 1.5 Mbit/s, a keyframe
  each second); the game's sound is tapped (its AudioContext constructor is wrapped as soon as the frame's window
  exists, so contexts made before that are missed) and read by an AudioWorklet inside the game's own context, resampled
  to 48 kHz and encoded to Opus. About 36 s of encoded pieces are kept; Clip writes them to a WebM file (`muxWebm`, a
  small EBML writer) at once. Browsers without WebCodecs get start/stop recording with MediaRecorder (up to 60 s).
- Profile tags (2026-11-12): `window.ARCADE_TAGS` at the top of games.js ({ lower name: 'Tester' }; SamLad and CJREY28)
  puts a small label next to the name on the Players and Social profiles (`profileTag(name)`). Bump games.js?v when it changes.
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
  Bump `rt.js?v=N` everywhere when rt.js changes. Saving the free plan (2026-11-09): a tab hidden for 15 minutes quietly
  disconnects every channel (`sleepAll`; the game isn't told) and reconnects them when shown again (`wakeAll`); a channel
  that never got in after 6 tries (a refused page) only retries every 5 minutes. account.js's `/acct/ws` and chat.html do
  the same 15-minute idle disconnect. `window.ARCADE_RT_IDLE_MS` shortens it for tests. Since 2026-11-06 (rt.js v=2) online play needs an online
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

- `throttle-ridge/`: Throttle Ridge, side-scrolling motocross against three computer riders (Three.js + planck.js
  bundled into the file). The file is a build: its source (plain ES modules in `throttle-ridge/src/`), the build script
  (`throttle-ridge/tools/build.mjs`, esbuild) and a headless test (`tools/test.cjs`) live on the `main` branch, not
  here. Edit the source there, run `npm run build` in `throttle-ridge/tools`, and copy the new `index.html` over. Saves
  one key, `throttle-ridge.v1` ({best: {trackId: seconds}, unlocked, skill, muted}). `window.__game` is a test hook.
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

- `checkers/` (2026-11-11): Checkers, made from Chess 1.5 by `tools/checkers-build/build.py` (run from the repo root: the chess page
  with `tools/checkers-build/engine.js` as its `<script id="engine">`, and the pieces, names and a few board functions swapped). American
  checkers on the 64-square board (pieces P/K red, p/k black; red 'w' moves first, at the bottom): forced jumps,
  multi-jumps (a move's `path` and `caps`; `animateMove` hops through them), a man crowned mid-jump stops, kings
  move both ways; lose with no pieces or no move; draws by repetition (3) or 40 moves each with no capture or man
  move (`G.h >= 80`). Squares are numbered 1-32 (`num`), moves read 11-15 / 22x15x8, which is also the 'mv' string
  online. Its own save `checkersSave`, its own channels (`ck-lobby`, `ck-t-<key>`, `?ckroom=` for tests), its own
  Glicko rating and leaderboard (`/acct/top?g=checkers`, games.js checkers `stat()`). Pieces that must jump get a
  gold ring (`.sq.must`). Wooden board (owner's choice): `--light #ecca93`, `--dark #a5652f`, a frame drawn with
  box-shadow round `#board` (resize leaves room for it). Since the page is built from chess/index.html, a fix to
  Chess's shared code can be carried over by re-running build.py (it stops if a replaced line has changed).
  1.0.1 (2026-11-11, the owner's rule): jumping is optional (gen() returns captures and plain moves; a jump once started
  still runs to the end). The search stands pat at depth 0 and only follows captures from there. Gold ring = "can jump".
  Online channels moved to `ck2-*` so 1.0 copies never meet it. Edited in checkers/index.html and engine.js directly:
  build.py still expects Chess 1.5 and would pull Chess 1.5.1's Elo reset and lobby into Checkers, so don't re-run it as is.
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
  1.5.1 (2026-11-11, the owner's rules): everyone starts at 2000 Elo with no level to pick; every saved rating was
  reset once (`save.rv = 2`). Elo has a floor of 0 and no top. games.js stat() says "Elo N"; the leaderboard ranks by
  current Elo, reads any older "Rating ..." line as 2000 (so everyone who played is on it), and players on the same Elo
  share a place. Quick match uses the lobby `ch-lobby2`, so old copies never meet the reset ratings. Every Chess tab with an
  online account that isn't playing online watches that lobby without joining it (`Net.watch`) and shows `#waitPop`
  ("X is waiting for a quick match. Join?") when exactly one person waits there.
  1.5.2 (2026-11-12, quiet: the patch note only says "Bug fixes and improvements", no NEWS line, `updated` unchanged):
  leaving an unfinished online game (Leave the table, refresh or closing the page: `pagehide`) costs the leaver a flat
  100 Elo (`leavePenalty`), and the other player gets no change ('resign' with q: 1 = walked out, over.left). One account
  set by the owner (PEN_SPECIAL, stored as char codes) loses 1000 the first two times (`save.lpn`), then 100.

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

- `havoc-bay/`: Havoc Bay, a Red vs Blue sea battle in the style of Harbor Havoc on Roblox (Three.js r128 copied from Poly Racer into the file). Single player with bots on both teams (`Bot`, `botShip`, `botPlane`). Each harbor is a `HarborEnt` with 25,000 health whose buildings are collider boxes flagged `h`; the five claimable islands (`ISLANDS`, `updateIslands`) give the owner their turrets and a boat pad. The world is built from Roblox-style parts with `Builder`/`Site` and the island shapes come from `landH()`; the second half of the map is the first half turned 180 degrees (`flip`). Balance lives in `WEAP` (damage per weapon, with `vs` multipliers per target kind; harbors take reduced damage), `SHIP_TYPES`, `PLANE_TYPES` and `TURRET_TYPES`. The title screen runs a bot-only demo match (`startMatch(true)`). Losing your ship is not a death: you stay on the slowly sinking wreck (`sinkT` in `Ship.update`) until you press E or the deck goes under, then swim; B (`deployKey`) redeploys from anywhere after 5 seconds. Aircraft carriers (`SHIP_TYPES.carrier`, `carrier: true`) are plane spawn points for their whole team (`teamCarriers`, `launchFromCarrier`); bots build at most one per team at the home harbor and keep it on their own side (`station` mission). When a match ends with a loser (harbor destroyed or time up), `startCine` plays the ending: it opens in the B-52's cockpit (`buildCockpit`, jet pilots from `makePilot`, displays drawn on canvases), then the bay doors open, the camera rides the bomb down, then a wide shot shows the losing harbor flatten (`H.mesh` scaled down and charred, restored in `resetWorld`) while the bomber banks away; click or Space skips (`skipCine`). Saves `havocbay.profile.v1` (matches, wins, kills, best damage) and `havocbay.settings.v1`. To test balance without waiting, call `step(1/30)` in a loop from the console; a hidden preview pane pauses `requestAnimationFrame`. Its title screen plays a separate realistic reel (`<!-- hb-reel:start -->` block before `</body>`, own renderer and scenes, `window.hbReel`): five 7 s shots with fades (pilot's-eye cockpit, camera on the pilot, carrier aerial, catapult launch, desert assault), detailed people (`Person`, arm IK onto rifles, `mergeTree` to keep draw calls low) and a film pass (`makePost`). `frame()` skips drawing the demo battle while `hbReel.covering`. It follows Graphics quality: Low keeps the demo battle, Medium draws it plainly, High adds the film pass. Check a moment with `hbReel.hold = true; hbReel.seek(24)`. 1.3.1's additions live in `<script id="hb-131">` (before the reel): flares (`FLARES`, `dropFlare`, `decoy`), barrel rolls (`barrelRoll`, `rollA`), blacking out (`glocStep`), hold-E bail (`holdToBail`), stances (`PLAYER.stance`, ANIM 5/6), the first-person hands (`VM`, a second render pass), team upgrades (`TUP`, `UPGRADES`, the computer's third app), computer missiles at big ships (`SHIP_TGT + id`), lifeboats (`SHIP_TYPES.lifeboat`, hidden from the shop), parked planes you can get back into (`parkOn`, `boardParked`), the low performance popup (`PERF`). Online it adds `m.x` requests, `S.z` (upgrades) and 'z' events. 1.3.2: houses are hollow (`hollowHouse`: wall pieces cut round a door and windows, each its own collider, a bullet-stopping roof collider, `houseFloor` sets the floor over the highest ground; island ones are `addHut` at quarter turns, the barracks are built in `buildHarbor`), the cockpit cabins are rebuilt in `COCKPIT` (`shell`, `rbox`, `dome`, `skin` cuts the bomber's windows along the skin's grid; parts are shaded with vertex colours), tracers are `tracerMesh` (core) plus `tracerGlow` (additive), the first-person muzzle flash is `VM.shot` (recoil was tried and removed at the owner's request), and `settings.minutes = 0` is an unlimited bot game (`GAME.unlimited`, `matchClock`). Houses are 10x8 / 12x8 on the islands and 15x11 in the harbors, placed by `houseSpot` (flattest free spot) and the ground under each island house is levelled (`I.flat`, `houseFlat` in `isleH`; the island terrain is rebuilt after `detailIsland`). The channels were `hb-world-132b` / `hb-room132b-` (the bigger level houses went out without a version bump or patch note); since 1.4 they are `hb-world-14` / `hb-room14-`.
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
  1.4 (2026-11-11, called 1.4 by the owner; the code comments say 1.4): submarines and helicopters. Subs are `SHIP_TYPES`
  stingray/barracuda/leviathan (shown as Seehund, Seawolf, Typhoon: 11, 32 and 64 m, `S.sub`, models in `subHull` with
  spinning `subProp`s, hulls sit low with `S.deckY`). Space dives (`toggleDive`, `subStep`: `s.dive`, `s.depth` up to `S.depth`,
  air `s.air` of `S.air` seconds, refilled in `SUB_REFILL` on the surface). `subUnder(e)` (depth past `SUB_HIDE`) is the test
  everything uses: dived subs are skipped by `traceEnts` unless the weapon has `W.deep` (torpedo 1, bomb 0.5, dcharge 1;
  `impact`/`splashDamage` multiply by it), by `nearestEnemy`, `autoTarget`, aiming, locks, `shipUnder` and island claims;
  dived deck guns (`Gun.shoot`) and missiles don't fire and speed is x0.75. Seeing them: `updateSubs` sets `e.spot[team]`
  (`subSpotted`: any driven ship, sailor or turret of that team within `SUB_SPOT` 120 m, or `S.quiet` 60 m for the Seehund,
  or a helicopter's `P.sonar`) and hides the model, the name tag and the map marker from teams that haven't (`subSeen`); a
  dived sub you can see gets a dark shape on the water (`e.shade`). Sonar ping (Q, touch PING; `S.ping` {dur, cd, team}):
  `sonarPing`, `pinging(s)`, `teamPing(team)`, `myPing()`; while it lasts the minimap grows (`#mini.sonar`) and `drawMap(cv,
  big, sonar)` shows everything (sailors, dived subs ringed, even at night). The Seawolf's is its captain's only, the
  Typhoon's is the whole team's (counts as spotting) and the other side gets a warning. Helicopters are `PLANE_TYPES`
  hornet/kingfisher/talon (`P.heli`; models `heliModel` + `heliRotors`): `Plane.update` hands them to `heliUpdate` (inputs
  `h.hin` {f, s, v}, `yawWant`, `aimP`; the nose and gun follow the aim; skims the sea at 2.5 m with a pilot aboard; lands
  gently on ground, roofs and decks found by `heliFloor` and sets `h.grounded`; `heliHome` + `landedRepair` service it;
  `h.svcHome` is flag 16 online). They never use `landed`/`tryLand`/the cockpit/barrel rolls. F is `P.bombW`: 'dcharge'
  (sinks, then goes off: `W.sinks`, `p.sank`, `W.splashK`) or 'rocket'. Bots: `botHeli`, sub missions 'hunt' and diving
  in `botShip`, `spottedSub`. Online: ship rows carry depth (16) and ping (17), a client's 's' state at 12 and 13; heli
  puppets carry on with `e.netV`; `releaseProxy` leaves a heli to settle by itself.
  1.3.3: voice chat (`<script id="hb-voice">`, `window.HBVoice`): everyone in an online lobby (Public Battle or private room)
  talks to the whole lobby, push to talk on G. WebRTC mesh; setup over its own channel `<room topic>-voice` (Presence + 'sig',
  'tk'), found through `NET.voiceTopic()` (set once the room accepts you). Settings `voice` 0 leaves the channel (you hear and
  send nothing); the mic is only asked for on the first G press and stopped when you leave.
  1.3: `midairHit` (any two planes, either team, within 62% of their radii) in `Plane.update`: both are killed with
  `midair` + `crashed` (a fireball in `onDeath`, then the wreck falls and blows up on the ground). Each screen checks the
  planes it runs; the host or offline game also kills the other plane. First person: `settings.fp` (C on foot or on a
  ship; planes keep C for the cockpit), the soldier is hidden while you look through his eyes (`fpBody`). The cockpit
  (`COCKPIT`) is now a cabin fixed to the plane (`COCKPIT.orient()` after the camera turns): a tub with floor, walls, seat,
  bulkhead and glass for fighters and the jet, a flight deck with roof, side windows and glazed nose for the bomber.
  1.4.2 (2026-11-11, players' feedback): helicopters turn to the camera yaw and tilt from the camera pitch (look down =
  forward, up = back at 0.6), W/S climb/descend (hi.v), camera pitch for helis limited to -1.0..0.32; PULL UP uses vel.y
  for helis. Planes: yaw and pitch limited separately (PLANE_TURN 0.9, PLANE_PITCH 0.7 of it, both slower with speed,
  PLANE_PMAX 1.2 rad, PLANE_BLEED speed cost). Heli buff: WEAP.hmg (added after every other weapon: WN numbers),
  rockets 200 dmg, more speed/climb/hp/turn, acc 24. Channels hb-world-142 / hb-room142-.
  1.4.1 (2026-11-11): controllers (DualShock 4 layout, standard mapping) and TV remotes. `GP` (pollPad on a 16 ms timer)
  feeds ctl() (x/y, fire R2, alt L2, alt2 R1, jump ✕, sprint L1/L3) and padLook() (right stick); □ E (held for bail), △ B,
  ○ C, R3 V, D-pad ↑ Q ↓ M ←/→ weapons, Options pause, touchpad/Share board. Menus: navMove/navChoose over the open
  overlay (kept by id/text across redraws, `navLast`). TV remote: arrows move (on foot ←/→ turn, `GP.remoteTurn`), Enter
  fires, Back pauses, colour keys 403-406 jump/use/deploy/map, CH+/- 427/428 secondary/missiles; the camera follows the
  vehicle in remote mode.
- `turn-turn-turn/`: Turn! Turn! TURN! (1.0, 2026-11-08), a two-player co-op dirt rally (Three.js r128 copied from Havoc Bay).
  1.3 (2026-11-12): 10 long stages in `STAGES` (`long: 1`, 6.2-8.6 km) with their own hill model in buildStage: `relief`,
  `wave`, `trend` (overall climb/drop), `grade` (max slope), `crests` (gaussian brows, added to `jumps` so they're called
  as JUMP) and `dips`; `parX` scales par (both buildStage and stageParMs) for the time hills cost. Long stages use a 7 m
  ground grid. New biomes snow, canyon, jungle. Quick-match versus picks only regular stages. Solo leaderboard: POST
  /ttt/solo {s, ms} (token) and GET /ttt/sboard?s= (Tally 'ttt-board' keys 'ls:<stage>', best per driver); the
  Leaderboard screen has Crews/Solo tabs (`LB_KIND`). Build with `ci/build.sh ../repo/turn-turn-turn/index.html`
  (the output path is relative to ci/).
  The owner first called it "Right! Right! RIGHT!" and gave reference pictures of an existing game; it was built with
  its own name (renamed by the owner), car, cabin, crew and tablet instead, so don't copy that game's look or title.
  The file is built from parts kept outside the repo (scratchpad `ci/src`, joined by `ci/build.sh`): `20-core` (save
  `turnturnturn.save`, settings, input, gamepad, Web Audio engine and call chimes, speechSynthesis call voice), `30-world`
  (`STAGES` + `dailyStage()`, `BIOMES`, `genPath` (turn plan by severity, self-crossing check), heights with jumps,
  cliffs `PC`, puddles, pace `notes`, `speedProfile` -> `par`; terrain grid from a chamfer nearest-road pass, `groundH`,
  `roadLocal`/`roadSurf`, instanced trees/rocks/grass, colliders), `40-car` (`Car`: bicycle-model tyres on a sprung body,
  walls, tree hits, doors, mud events; `buildCabin` (car-local +X is the LEFT/driver side), `GLASS` mud + crack canvases,
  `GAUGE`, `TABLET` (the driver only ever sees a 48x32 blur of it), `makeCrew` + two-bone `ik` arms), `50-game` (two
  scenes: world, then the cabin drawn sharp on top with speed blur in between; `TAB` tablet physics (held/raised/drop/grab),
  calls `showCall`/`navCall`, `AIC` solo co-driver, `driverFrame`/`navFrame`), `60-net`, `65-vs` (1.2: versus rooms, the other crews' cars `RIVALS`/`makeRivalCar`, car-to-car `rivalPush`, quick match `QM`), `70-ui` (menus, `PATCH_NOTES`).
  1.2 versus: the same crew channel with the host's Presence `md: 'vs'` (up to 6); lobby `{ vs: 1, crews: [[driver, nav|null], ...] }`; crew messages ('s', 'fx', 'call', 'tb', 'shut', 'fin') carry the crew number `c`; the host waits for every 'ready' then sends 'go'; each crew's clock starts at the START banner; versus never saves bests or posts to the leaderboard; the driver holds F to put a hand out of the window (`car.bird`, sent as `bd`). Quick match: channel `ttt-quick` (Presence `{ q: 'crew'|'vs', t }`), the oldest searcher of a group makes a room and broadcasts 'qm' `{ code, ids }`; the quick-room host auto-starts after a 5 s lobby countdown. Voice is addressed to your crewmate (`to`/`from`; the lower id calls). Test with `cdpN.mjs` (scratchpad) and `window.__vsMin` on localhost.
  Online: crew channel `ttt-crew-<6 digits>` (Presence; the maker hosts the lobby: seats, stage). The driver's screen runs
  the car and sends 's' 20 a second plus 'fx' hazards; the navigator sends 'call', 'tb' (tablet) and 'shut'; 'start',
  'ready', 'fin', 'restart', 'tolobby'. Voice chat is WebRTC signalled over the channel ('vo', 'rtc'), so play.html's
  iframe allows the microphone. Leaderboard (1.1): the Worker's `/ttt/board?s=` and `/ttt/run` (driver's account token checked
  with whoami; one entry per pair of players, best kept; Tally object `ttt-board`); only crew runs are sent (`submitRun`).
  `localStorage['ttt-api']` points it at a local server on localhost. `?tttroom=<name>` uses test channels; `window.__ci` on localhost for tests. Medals are
  par x1.25 / x1.5 / x1.85 (`MEDAL`). Add a `PATCH_NOTES` entry and bump `VERSION` with every release.
  1.3.1 (2026-11-11): the scratchpad build sources are gone, so this was edited straight in index.html (keep doing that,
  or rebuild sources first). Steering easier but not easy: maxS 0.63/(1+sp/24), steer rate 3.9, keyboard ramp 5.6/8,
  front grip x1.08, rear x1.1, yaw damping 0.42, a light slide catch even with assist off (0.1). Measured with a scripted
  driver over 4 stages: ~18% faster, about half the time off road. `buildDetail()` adds per-biome detail (`DETAIL`):
  chevrons and fans at sev 1-2 corners, flowers, logs, stumps, fences, hay, cacti, ferns, drifts, cabins/barns, clouds,
  snow caps on far mountains; it uses its own rng so the road and old scenery don't move. Grass tufts had no vertex
  colours and drew black (fixed).
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
  1.0.18: jammers go through `jamReach(j, x, y, z, n)` / `jammedAt(x, y, z, n)`: `JAM_R` (2.5 m, 3D; it was 4 m flat, so a
  jammer downstairs jammed drones upstairs) and a clear `sgClear` line (walls, slabs and barricades block it); a charge on a
  wall (`g.n`) also counts from a point just behind that wall. Barricades are solid green (`BAR_GREEN`, `BAR_DEBRIS`): bullets
  stop at them (no pierce), `barHole` only darkens a dent, `barOpenAt`/`BAR_OPEN` are gone, and they break at `BAR_HP`
  (bullets do `dm * 0.1`, pellets 0.5).

- `krill-dive/` (2026-11-07): Krill Dive, a daily rarity-trivia game (plain canvas 2D and HTML, no libraries; named
  Krill Dive rather than after the existing game the owner described). `KD_DATA` (the first script) holds the
  familiarity lists (`lists`, each ordered from the most familiar answer to the least; "Main/alias/alias") and the
  prompts (`add(q, list, filter)`; word-shape prompts filter a big list). Rarity tier = an answer's place in its
  (filtered) list (`score()`: first 15% Plankton 10, Shallows ~30, Reef 50-65, Abyss ~80, last 12% Trench Find 100);
  1.1: the "% of divers" line is real: `kdPost('vote', { q, a, id: save.id })` to the arcade Worker's `/kd/vote` (the
  `Tally` Durable Object, one 'p:<prompt text>' record of answer counts and each diver's one vote) returns { c, n };
  saved dives send the same vote again (it doesn't move) to read the counts. `window.KD_API` points it at a local Worker. `match()` normalises accents, "the", plurals and allows a
  one- or two-letter typo (Damerau). Daily prompts come from the UTC date (`pickPrompts(rng(hash('krill-dive:' + d)))`,
  never two from one list; prompts with fewer than 6 answers are never picked), Dive #1 is 2026-11-06. 3 s to read
  (`READ_S`), 25 s to answer (`ANSWER_S`); unrecognised answers don't count against you. Each point = 10 m, 700 = 7,000 m.
  The ocean is drawn on `#sea` (`frame()`: depth gradient `STOPS`, zone lines `ZONES`, creatures `CRE`, the krill).
  Save `krilldive` (days, best, played, total, streak, lastDay, mute). `?debug` exposes `window.__kd`.
  When adding prompts: keep every list ordered by familiarity, since that order *is* the scoring.
  1.2 (2026-11-10) grew the 25 lists the dives of 10-17 Nov use (about 5x; capitals now include state, province and
  historical capitals, countries include territories and former states). A grown list has an entry in
  `KD_DATA.cuts` ([end of common, end of uncommon, end of rare]): `score(i, n, cut)` tiers a full-list prompt by
  those bands (the last 30% of the rarest band are Trench Finds), because its long niche tail would otherwise push
  obscure answers into the common tier. Filtered (word-shape) prompts still score by place in the filtered list.
  The Europe-river and Saturn/Uranus-moon prompts filter by named sets (`EUROPE`, `SATURN`, `URANUS`), not
  regexes (the old prefix regex counted the Potomac and Okavango as European). When adding to a grown list, keep
  the cuts in step: new common answers go before the first cut, and so on.
  1.3 (2026-11-10): the daily leaderboard. A finished daily dive POSTs /kd/score {d, s} with the arcade token
  (`postScore`; sent again on load if it hadn't gone, `save.days[d].lb` marks it sent); the Worker checks the
  account, takes only today's UTC day (yesterday's for 20 min after midnight) and keeps each account's first entry.
  `/kd/lb {d}` and `/kd/lb-days` read the boards (Tally 'krill-dive', 'lb:<day>' and 'lbdays', 60 days kept); the
  Worker only passes vote/lb/lb-days/score through, so 'lb-add' can't be called directly. The `#board` screen:
  today (podium, countdown to UTC midnight, everyone else, refreshed every 30 s) then previous days; a day's board
  is cached for good in localStorage `krilldive.boards` once it's final (25 min after the day ends).
  1.4 (2026-11-11): boards list every diver 1st to last (podium plus the full list; past days load theirs
  straight away). The rarest answer is no longer shown after a prompt or on the results. Versus lobbies: channel
  'kd-room-<CODE>' (4-character code), presence keyed by account name carries { n, t, host, g, st, pts, i }, the
  host broadcasts 'start' { g, ids } and everyone dives those prompts at their own pace (`startDive(false, ids)`,
  `RUN.vs`); standings come from presence (the dive strip `#vsStrip`, the results `#vsStand`). Host = the host flag
  or the earliest diver left; 8 divers max. Hosts list open lobbies in 'kd-lobbies' (presence keyed by code).
  Versus dives count like practice (no leaderboard, no daily save). `window.KD_RT_SRC` points rt.js elsewhere for
  tests (with `ARCADE_RT_URL`); two players test as two origins (127.0.0.1 and localhost) with their own accounts.

- `intro.js` (2026-11-08): the "Made by The Arcade" intro, a 2.2 s canvas cinematic drawn inside `#stage` on
  play.html, so it plays where the game goes. The game's iframe only gets its `src` when `ArcadeIntro.load` resolves
  (as the intro fades), because a game booting in the same-origin iframe blocks the thread and froze the animation;
  intro time only advances with drawn frames. Click skips; `?nointro=1` turns it off; hidden tabs skip it. Games
  opened directly (not through play.html) don't get it.

## Adding a game

1. Make a folder with a single self-contained `index.html` (no build step, no
   external servers) and a `thumb.svg`.
2. Add an entry to `games.js` (with added/updated times, keys and a stat()
   reader if the game saves a best), and a line at the top of `NEWS`. Keep the
   `description` to one short paragraph (2 to 3 sentences, about 250 characters at most): what the game is, how you
   play, and whether it has bots or online. No feature lists, counts of items or version news (the owner asked for
   this on 2026-11-08); taglines stay one line.
3. Add a row to the games table in `README.md`.
4. Test it in a browser, including a phone-sized viewport.

## Claude posts every update to Social (the owner's rule, 2026-11-11)

Every game update, new game or new site feature, pushed by anyone, gets a post on Social from the **Claude** account,
shown to everyone. It is automatic: `.github/workflows/claude-post.yml` runs on every push to the Pages branch that
changes `games.js`, and `tools/claude-post/post.mjs` posts:
- each `NEWS` entry that wasn't there before (at most 5 a push), and
- every game whose `updated` time changed (or that is new) with no new NEWS line of its own: the commit message is
  the news, so name the version in it ("Chess 1.5: puzzles and faster bots"). Fixes that should stay silent must not
  change `updated` and get no NEWS line.
Posts look like social media posts, and **show the new feature, not the game's cover**:
- `imgs: ['<game>/news/<version>-<feature>.jpg', ...]` on the NEWS entry: 1 to 4 screenshots of the new things (1080 px
  wide JPEGs kept in the game's `news/` folder; e.g. Havoc Bay 1.4 has a submarine and a helicopter). Take them in a
  real match (render with the game's renderer and save the canvas). Without `imgs` the thumbnail is used.
- `headline: '...'`: the big words on the picture (default: the first phrase after "Game 1.2:").
- `post: '...'`: the caption (up to 700 characters, `\n` line breaks, a hook line, emoji bullets for the features, a
  question or call to play, hashtags; no secret test names). Without it one is written from the NEWS text.
- `repost: N` posts the entry again (with new pictures or caption) and takes the earlier post down.
- **Claude comments and profile (the owner's rule, 2026-11-11):** with every push, Claude may leave ONE funny comment on
  other players' posts: read the feed (`/clips/feed?tab=new` with the official Origin), add `{ id, t }` lines to
  `tools/claude-post/comments.json` for posts that don't have one yet. The server keeps one per post ('bc:<id>') and never
  comments on Claude's own posts. Keep it kind and about the game: no jokes about real people in photos, nothing on posts
  with slurs or mean captions about someone. Claude's profile description is `tools/claude-post/profile.json` (`bio`,
  shown under the name on Social; links clickable).
- One-off Claude posts that aren't NEWS (like the pinned feedback-form post) live in `tools/claude-post/posts.json`
  ({ key, t, imgs, pill, kicker, headline, pin }); every run sends them all and the server posts each key once. `pin: true`
  keeps a post first on Claude's profile (📌 on its tile). https links in Claude's captions are clickable (`capNodes`);
  other players' captions stay plain text.
- Clip videos (2026-11-11): Safari refused WebM files whose size fields are 8 bytes (what muxWebm wrote before). muxWebm
  now writes short sizes and social.html's `fixWebm` rewrites old clips as they load. Videos loop by hand ('ended'), and a
  playing video stuck without data for ~1.2 s is reloaded from its blob (Safari hangs after looping some clips).
The picture is drawn by `tools/claude-post/card.py` (Pillow). Try it locally:
`DRY=1 node tools/claude-post/post.mjs <old games.js> games.js` prints the captions and saves the pictures.
Server: `POST /clips/bot` on the Worker, checked against the `BOT_KEY` Worker secret (the same value is the repo's
`ARCADE_BOT_KEY` Actions secret; to change it, set both). It posts a photo as 'Claude' (`BOT_NAME`); each post's key is
kept ('bk:<key>' = the post id) so it never posts twice. Bot posts (`bot: 1`) aren't pruned for space; past 100 the
oldest Claude post goes. Manual runs need the workflow on `main`; to test, push a throwaway branch with that branch in
the trigger and `ROOM: <name>` (posts go to `?clipsroom=<name>` only), then delete it.

## Conventions

  1.0.16 (after the 2026-11-05 outage, when the Worker hit the free plan's Durable Objects limit): `snSendStates` sends your
  state 8/s only when something changed (else 1/s), bots 5/s and only changed ones; `snInterp` draws people 160 ms and bots
  260 ms behind. Keep Siege's message rate low.
- Games save progress in the player's own browser (`localStorage`, wrapped in try/catch), exactly as before;
  `account.js` copies those saves to the player's Arcade account when they have one (2026-11-01). A game never
  talks to the accounts server itself. When a game adds a save key, make sure `GROUPS` in `account.js` puts it
  with that game (a new game's keys otherwise land in `misc`, which still syncs). The Worker on Cloudflare runs the
  live "on now" counter, the Global chat, the games' online rooms, Blockcraft's public server, the accounts and
  Social; apart from accounts, Social's posts and a few leaderboards it passes messages along and stores nothing. No email or other personal data is collected.
