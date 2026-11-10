# Throttle Ridge

A side-scrolling motocross racer for the browser. It's built with
[Three.js](https://threejs.org/) for 3D rendering and
[planck.js](https://piqnt.com/planck.js/) (a Box2D port) for 2D physics.
You race three AI riders over five tracks, on laptop, desktop and iOS Safari,
with keyboard or touch.

## Play

`index.html` is the whole game in one self-contained file, the same way Cube
Assault is shipped. Three.js, planck.js, the styles and the icon are all
built in, so it makes no outside requests. Put it on any static host, or just
open it in Chrome, Edge, Firefox or Safari. It works offline.

Don't edit `index.html` by hand. It's generated from `src/` (see below).

## Develop

The source lives in `src/` as plain ES modules. While you work, serve the
`throttle-ridge` folder and open `src/index.html`:

```bash
python3 -m http.server 8765
```

Then open <http://localhost:8765/src/>. In development, three.js and planck
load from jsDelivr through the import map in `src/index.html`, pinned to the
same versions the build bundles.

To rebuild the single-file `index.html` after changing anything in `src/`:

```bash
cd tools && npm install && npm run build
```

`tools/build.mjs` bundles and minifies the code with esbuild, then inlines
it with the CSS and icon. It stops with an error if the import map's library
versions drift from the ones in `tools/package.json`. The web app manifest
is left out of the single file, because its relative paths can't work
inline. Adding the game to the iOS home screen still runs it full screen.

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

| File (in `src/` unless noted) | What it does |
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
| `js/render.js` | Scene building and drawing: sculpted dirt berm, venue, scenery, particles, lights, AO |
| `js/models.js` | Bike and rider models built from Three.js primitives |
| `js/textures.js` | Procedural canvas textures (raked dirt, grass, sand, rock, banners, number plates, dust) |
| `js/camera.js` | Side-on follow camera |
| `js/input.js` | Keyboard and multi-touch |
| `js/audio.js` | Engine and effects synthesised with Web Audio |
| `js/ui.js`, `style.css` | Menus, track select, HUD, results |
| `tools/build.mjs` | Builds the single-file `index.html` (not in `src/`) |
| `tools/test.cjs` | Headless browser test (see below; not in `src/`) |
| `tools/THIRD_PARTY_LICENSES.txt` | three.js and planck.js MIT licence texts |

## Visual style and decisions

The look aims for a warm, hazy, stylised side-scroller: a sculpted dirt berm
seen from slightly above, with the four riders spread across its width. The
art is original: no logos, assets, characters or models from other games.

- **Camera.** A 32° lens, side-on and tilted down about 14°. Bike and rider
  are roughly a sixth of the screen height. That's further out than the
  original "quarter of the screen" brief, to match the reference screenshot,
  and it shows more of the track and the riders' depth lanes. The player sits
  about a third in from the left so you can see what's coming. The camera
  zooms out a little with speed and air time, follows smoothly and shakes on
  hard landings.
- **Lanes.** All four bikes ride the same 2D physics ground but are drawn in
  depth lanes (`LANES` in `race.js`) spread across a 10.8 m wide track. With
  the downward tilt, each rider further back sits clearly higher on screen,
  so the pack doesn't merge into one blob. The player is always in the
  nearest lane. The physics doesn't know about lanes, so riders never
  collide.
- **Track.** The track is one sculpted cross-section swept along the ground
  profile (`render.js`):
  - The berm always stands at least 0.8 m proud of the venue ground. A
    crowned riding surface rolls over rounded shoulders (smoothstep profile)
    down to a foot on both sides. Taller jumps get wider, longer shoulders,
    so every jump, whoop and tabletop reads as a solid mound.
  - A skirt at each foot digs below the ground so no gap can show.
  - The procedural dirt texture spans the whole cross-section in metres, so
    raked grooves run continuously over the top and down both shoulders.
  - On the riding surface the texture adds packed racing lines, a pair of
    ruts per lane with knobby tread marks, wandering tyre tracks and loose
    clods. The ruts line up with the riders' lanes.
  - A bump map and vertex-colour occlusion at the feet give the grooves
    relief.
- **Ground in front of the berm.** It's darker than the ground behind, so the
  eye goes to the track.
- **Venue.** Chain-link fence with sponsor banners (made-up names in
  `themes.js`), tyre stacks and flags at jump lips, marshal tents, crowd
  stands, boulders on the desert and canyon tracks, a start gate with drop
  plates per lane, and a finish gantry cantilevered from the back.
  Everything sits behind the track, so nothing passes between the camera and
  the riders. The stands are set well back (40 m) so the crowd doesn't
  compete with the riders.
- **Themes.** Track 1 Meadow Run is grassland, 2 Dust Bowl is desert, 3 Pine
  Ridge is forest, 4 Red Canyon is canyon, and 5 Thunder Arena is a stadium
  at night under floodlights. Each theme sets the sky, haze, sun, track dirt
  colour, ground texture, background layers and props.
  - The day themes share a warm, slightly muted palette with golden light
    and strong haze.
  - The arena has a closed bowl of stands, sponsor boards on the wall and
    floodlight halos.
- **Scenery scale.** The lens magnifies distant scenery, so background layer
  heights are tuned for it. The far layers skip the scene fog and are
  pre-tinted toward the haze colour instead. Dense bands of trees break up
  the grass on the green tracks.
- **Lighting.** A strong directional sun with soft shadows, a warm
  hemisphere fill light and a room environment map for reflections. Neutral
  tone mapping keeps colours from washing out, linear fog adds haze, and a
  soft warm vignette (CSS) frames the view. On desktop there's screen-space
  ambient occlusion (GTAO), turned off on touch devices for performance; add
  `?noao` to the URL to disable it on desktop.
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
  - The physics wheel joints have no travel limit, so the renderer clamps
    the drawn wheels to realistic suspension travel. A crashed bike no longer
    looks stretched apart.
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

`tools/test.cjs` drives headless Chromium with Playwright. Serve the
`throttle-ridge` folder first, then run it:

```bash
node tools/test.cjs <screenshot-dir>
```

By default it tests the built `index.html`. Add `--src` to test
`src/index.html` instead, and `--shots`, `--touch`, `--complete` or `--fps`
to run one part only. It:

- blocks every outside request when testing the built file, and fails if
  the game tries to make one, which proves the file is self-contained;
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

- The bike and rider are built from primitives, so they're simpler than
  hand-modelled, hand-painted 3D art (no decals on the plastics, capsule
  limbs).
- The scenery is generic geometry (cones and blobs for trees, extruded
  ridges for hills and mesas). It doesn't have the painted, illustrated
  quality of a game with a dedicated art team, and there are no hero
  set-pieces (buildings, landmarks) behind the track.
- The track runs in one straight line along x. It can't curve toward or
  away from the camera.
- Crowd members are simple capsule figures.
- At the start gate all four riders share the same x position, so they
  overlap until the pack spreads out.
