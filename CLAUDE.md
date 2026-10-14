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
- `arcade.css`: shared styles for the two pages above.
  Both pages load it and `games.js` with `?v=N`. GitHub Pages lets browsers cache
  files for 10 minutes, so bump N in both pages whenever either file changes.
- The footer of both pages shows a contact email for bug reports. It's set once
  in `games.js` (`CONTACT_EMAIL`).
- One folder per game, each with a self-contained `index.html` and a `thumb.svg`
  cover (16:9).

## Games

- `cube-assault/`: first-person 3D shooter (Three.js bundled into the file).
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

- `free-criminal/`: Free Criminal, an open-world 3D crime game set in San Varro (Three.js r128 copied from Cube Assault into the file). Version 1.1 adds 3x traffic, ragdoll crashes, gun stores (10 guns, grenades), a mall and a new HUD. Saves only its settings (`freecriminal.settings.v1`).

## Adding a game

1. Make a folder with a single self-contained `index.html` (no build step, no
   external servers) and a `thumb.svg`.
2. Add an entry to `games.js` (with added/updated times, keys and a stat()
   reader if the game saves a best), and a line at the top of `NEWS`.
3. Add a row to the games table in `README.md`.
4. Test it in a browser, including a phone-sized viewport.

## Conventions

- Games save progress only in the player's own browser (`localStorage`, wrapped
  in try/catch). No accounts, servers or data collection.
- Only original games: no copies of other people's games.
- The owner works mostly from a phone, so explain GitHub steps for the mobile
  app or Safari.
