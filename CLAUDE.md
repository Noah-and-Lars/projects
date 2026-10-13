# Noah's and Lars's Arcade

A small browser-games site made by Lars and Noah, hosted with GitHub Pages at
https://noah-and-lars.github.io/projects/ (repo: Noah-and-Lars/projects, moved
from jimmyscafe/projects).

GitHub Pages currently publishes from the branch
`claude/jimmyscafe-projects-access-9mbcw3`, not `main`. Anything pushed there
goes live in a minute or two. If that branch gets merged into `main`, the Pages
source in Settings → Pages should be switched to `main`.

## Layout

- `index.html`: home page with a game tile grid, search and category filters.
- `play.html?game=<id>`: plays a game in an iframe with fullscreen and a
  "more games" row.
- `games.js`: the list of games. One entry per game (id, title, category,
  description, controls, path, thumb, isNew).
- `arcade.css`: shared styles for the two pages above.
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

## Adding a game

1. Make a folder with a single self-contained `index.html` (no build step, no
   external servers) and a `thumb.svg`.
2. Add an entry to `games.js`.
3. Add a row to the games table in `README.md`.
4. Test it in a browser, including a phone-sized viewport.

## Conventions

- Games save progress only in the player's own browser (`localStorage`, wrapped
  in try/catch). No accounts, servers or data collection.
- Only original games: no copies of other people's games.
- The owner works mostly from a phone, so explain GitHub steps for the mobile
  app or Safari.
