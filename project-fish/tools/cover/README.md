# Cover art

The game's cover pictures, drawn in the browser with the game's own models and three.js, then saved by a headless Chromium:

| File (from the project-fish folder) | Size | What it's for |
|---|---|---|
| `thumb.jpg` | 1280x720 | The arcade's tile (shown cropped to fill and zoomed a little on hover, so the title and his helmet sit in the middle) |
| `cover.jpg` | 1200x1800 | The box art |
| `assets/cover/og.jpg` | 1200x630 | The picture link previews show (`og:image`) |

To make them again: `npm install`, Playwright with its Chromium (`npm install --no-save playwright && npx playwright install chromium`, or `PLAYWRIGHT` pointing at an installed copy's `index.mjs`), then from the project-fish folder:

```bash
npm run build-cover            # all three
node tools/cover/render_cover.mjs thumb   # just one (thumb, cover or og)
```

It takes about a minute. WebGL runs in software, so the same files give the same pictures.

## What's in the picture

- **The soldier** (`assets/soldier.glb`), dressed by the game's Wardrobe (`src/gear.js`) in the comms helmet, the sage carrier and the black gloves.
- **His pose** is one frame (0.9 s) of the `cover` clip in `assets/cinematic/soldier_clips.glb`: Mixamo's Idle_Crouching, a kneeling rifle hold, retargeted onto him (`tools/cinematic/`). Nothing in the cover's code turns a bone; it only places and turns the whole of him. He kneels, and the camera is low and close, so the picture shows him from the belt up.
- **The rifle** is the AR-15 breakdown's (`assets/breakdown/ar_slr.glb`), held at a fixed grip (`GRIP` in `cover.js`): the middle of its pistol grip in the curl of his right hand's fingers, its handguard through the curl of his left hand's.
- **The sky, the smoke, the debris, the jets and their trails** are made in `cover.js`: the sky is a gradient with the sun's glow behind him; the cloud is a few hundred camera-facing sprites, each drawn as a lit sphere with noise on its edge and its bumps, heaped into a cauliflower of billows on billows, each shaded by the big billows between it and the light; the jets are simple low-poly fighters built from a lathe and flat shapes, with trails of soft sprites.
- **The grade**: the picture is drawn in colour, then only its brightness is kept and mapped through amber (deep brown shadows, orange middles, hot pale-yellow highlights), a little warmer to the right, with fine grain and a slight vignette.
- **The title**, "PROJECT FISH", is set in Big Shoulders Display Black (the same family as the main menu's stencil title), white, over the graded picture. It's the only text. The fonts are in `fonts/` with their licence (SIL Open Font License); `?font=stencil` tries the stencil cut.

Each layout (its size, camera, sun, cloud, jets and title) is in `LAYOUTS` at the top of `cover.js`. Each is drawn at twice its size and halved for a clean edge, and saved as JPEG at quality 0.88.

To look at one in a browser, serve the project-fish folder (as for playing) and open `tools/cover/cover.html?layout=thumb` (or `cover`, `og`). Other things you can add to the address: `scale=1` (draw at its own size, quicker), `raw=1` (no grade), `notitle=1`, the camera's numbers (`cyaw`, `ch`, `cdist`, `clook`, `cfov`, `shift`, `roll`), his turn (`yaw`), the clip and its time (`clip`, `t`), the vest (`vest=black`), and `debug=1` (him and the rifle on grey, with his grip points marked).

## Credits

The soldier ("Soldier Full Tactical Gear" by DanlyVostok), the outfit (by Exactly), the rifle ("AR SLR" by luapqq, CC BY 4.0) and the animation (Mixamo) are credited in full in the project's README (Credits). The fonts are Big Shoulders Display and Big Shoulders Stencil Display by Patric King (The Big Shoulders Project Authors), under the SIL Open Font License 1.1 (`fonts/OFL.txt`).
