# Throttle Ridge

A side-scrolling motocross racer for the browser. It's built with
[Three.js](https://threejs.org/) for 3D rendering and
[planck.js](https://piqnt.com/planck.js/) (a Box2D port) for 2D physics.
You race three AI riders over five tracks, on laptop, desktop and iOS Safari,
with keyboard or touch.

## Run it

It's plain ES modules with no build step. Serve the folder over HTTP and open
`index.html`:

```bash
python3 -m http.server 8765
```

Then open <http://localhost:8765/>. Three.js and planck load from jsDelivr,
pinned through the import map in `index.html`, so the first load needs an
internet connection.

## Controls

| Action | Keyboard | Touch |
| --- | --- | --- |
| Throttle | Up / W | GAS (bottom right) |
| Brake / reverse | Down / S | BRAKE |
| Lean back | Left / A | LEAN BACK (bottom left) |
| Lean forward | Right / D | LEAN FWD |
| Restart at checkpoint | R | |
| Pause | Esc / P | pause button |
| Mute | M | speaker button |

Finish in the top 2 to unlock the next track. Best times, unlocked tracks,
skill level and mute state are saved in `localStorage`.

## Code layout

| File | What it does |
| --- | --- |
| `js/main.js` | Entry point: game states, fixed 60 Hz loop, glue, test hook (`window.__game`) |
| `js/physics.js` | planck world, ground chain, collision categories |
| `js/bike.js` | Bike body: chassis, wheels on spring joints, drive, brakes, lean, landings, crashes |
| `js/rider.js` | Rider skeleton, riding pose and 2D IK (shared by renderer and ragdoll) |
| `js/ragdoll.js` | Crash ragdoll (planck bodies joined with limited revolute joints) |
| `js/race.js` | Race simulation: 4 bikes, checkpoints, respawn, stuck detection, standings, rider colours, lanes |
| `js/ai.js` | AI riders (set throttle/brake/lean only, like a player) |
| `js/tracks.js` | The 5 track layouts (feature lists) and the spline that turns them into ground |
| `js/themes.js` | Per-track visual theme: sky, fog, sun, scenery layers, props; made-up sponsors |
| `js/render.js` | Scene building and drawing: dirt ribbon, cut face, venue, scenery, particles, lights, AO |
| `js/models.js` | Bike and rider models built from Three.js primitives |
| `js/textures.js` | Procedural canvas textures (dirt, strata, grass, sand, banners, number plates, dust) |
| `js/camera.js` | Side-on follow camera |
| `js/input.js` | Keyboard and multi-touch |
| `js/audio.js` | Engine and effects synthesised with Web Audio |
| `js/ui.js`, `style.css` | Menus, track select, HUD, results |
| `tools/test.cjs` | Headless browser test (see below) |

## Visual style and decisions

The style follows common side-scrolling motocross conventions (close side-on
camera, a chunky 3D dirt track, a busy race venue behind it). The art is
original: no logos, assets or models from other games.

- **Camera.** The lens is narrow (24°) and almost side-on, tilted down about
  7.5°. Bike and rider fill about a quarter of the screen height at racing
  speed. The player sits about a third in from the left so you can see what's
  coming. The camera zooms out a little with speed and air time, follows
  smoothly and shakes on hard landings.
- **Lanes.** All four bikes ride the same 2D physics ground but are drawn in
  depth lanes (`LANES` in `race.js`) spread across a 9.2 m wide track. With
  the slight downward tilt, each rider further back sits visibly higher and
  smaller, so the pack doesn't merge into one blob. The player is always in
  the nearest lane. The physics doesn't know about lanes, so riders never
  collide.
- **Track.** The top of the track is a crowned dirt ribbon with a procedural
  texture: packed racing lines, a pair of rut grooves per lane with knobby
  tread marks, loose clods, and lighter loose dirt along the berms. A vertical
  cut face shows soil layers, stones and roots, darkening quickly with depth
  so every jump reads as a solid mound. The back of the mound slopes down to
  the venue ground.
- **Venue.** Chain-link fence with sponsor banners (made-up names in
  `themes.js`), tyre stacks and flags at jump lips, marshal tents, crowd
  stands, a start gate with drop plates per lane, and a finish gantry
  cantilevered from the back. Everything sits behind the far edge of the
  track, so nothing passes between the camera and the riders. The stands are
  set well back (40 m) so the crowd doesn't compete with the riders.
- **Themes.** Track 1 Meadow Run is grassland, 2 Dust Bowl is desert, 3 Pine
  Ridge is forest, 4 Red Canyon is canyon, and 5 Thunder Arena is a stadium
  at night under floodlights. Each theme sets the sky, haze, sun, track dirt
  colour, ground texture, background layers and props.
- **Scenery scale.** The narrow lens magnifies distant scenery, so background
  layer heights are tuned for it. The far layers skip the scene fog and are
  pre-tinted toward the haze colour instead. A dense band of trees on the
  horizon breaks up the grass on the green tracks.
- **Lighting.** A strong directional sun with soft shadows, a hemisphere fill
  light and a room environment map for reflections. Neutral tone mapping
  keeps colours saturated, and linear fog gives atmospheric depth. On desktop
  there's screen-space ambient occlusion (GTAO), turned off on touch devices
  for performance; add `?noao` to the URL to disable it on desktop.
- **Bike and rider.** Built procedurally from primitives:
  - The bike has knobby tyres, 32-spoke wheels, a disc brake, a twin-spar
    frame, gold fork tubes with chrome lower legs that compress with the
    suspension, and a swingarm and shock that follow the rear axle. It also
    has a finned engine, header pipe and silencer, tank and radiator shrouds,
    a flat MX seat, fenders, side and front number plates, and bars with
    grips and levers.
  - The rider wears a helmet with peak, goggles and chin bar, a striped
    jersey, pants, knee-high boots and gloves, and rides standing in the
    attack position.
  - The rider's body shifts with lean, crouches to absorb landings (a damped
    spring driven by impact and suspension compression) and ragdolls off the
    bike on a crash.
- **3D models.** No external models are used. Free CC0 bike models were an
  option, but the procedural ones stay small, need no extra downloads, and
  match the moving suspension exactly. So there are no third-party asset
  licences to record.
- **Rider colours.** Red #1 (you), blue/yellow #27, black/green #44,
  purple/orange #9.

## UI

- **Track select.** All five cards share one row on any landscape screen and
  shrink inside the iPhone safe area (notch and home indicator). On very
  narrow screens the cards become a horizontal snap-scrolling strip.
- **HUD.** Position and time sit top left, a thin progress line with a dot
  per rider runs along the top centre, and small mute and pause buttons sit
  top right. The track name shows at the start and fades out after a few
  seconds.

## Testing

`tools/test.cjs` drives headless Chromium with Playwright. Serve the folder
first, then run it:

```bash
node tools/test.cjs <screenshot-dir>
```

Add `--shots`, `--touch`, `--complete` or `--fps` to run one part only. It:

- loads the game at desktop size (1280×720) and iPhone 14 landscape, with
  notch-sized safe-area insets emulated, and fails on any console error or
  warning;
- screenshots the menu, track select and all five tracks at both sizes, and
  checks the fifth track card fits on screen;
- presses GAS and LEAN BACK together with two touch points and checks both
  register and release;
- drives the player with the AI on every track at two skill levels and
  checks each race finishes;
- measures frame times.

Headless Chromium renders WebGL in software (SwiftShader), so its frame times
are far slower than a real GPU and only useful for comparing changes. Real
60 fps checks need a real device.

## Still different from the target look

- The bike and rider are built from primitives, so they're chunkier and
  simpler than hand-modelled, textured 3D art (no decals on the plastics,
  simple capsule limbs).
- Crowd members are simple capsule figures; up close they read as dolls
  rather than people.
- At the start gate all four riders share the same x position, so they
  overlap until the pack spreads out. Lanes separate them in depth, but not
  completely.
- The cut face uses one tiling soil texture per track. It looks repetitive on
  long flat sections.
