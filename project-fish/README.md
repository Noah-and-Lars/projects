# Project Fish

A fast-paced multiplayer first-person shooter for the browser, built from scratch with [three.js](https://threejs.org).

**Status: phase 1.** A flat grey baseplate where you can look around, walk and jump, with a small house in front of you so you can see yourself moving. You see your gloved hands holding a pistol out in front of you, which sways as you look around and bobs as you walk. Shooting, the map and multiplayer come later.

## Play it locally

The game is split into several files, so the browser has to load it from a web server rather than straight from disk. From the repository root:

```bash
python3 -m http.server 8000
```

Then open <http://localhost:8000/project-fish/> in Chrome, Edge, Firefox or Safari. You need an internet connection, because three.js loads from a CDN.

Click to lock the mouse to the game. Press Esc to get the mouse back.

## Controls

| Key | Action |
|---|---|
| WASD | Move |
| Mouse | Look |
| Space | Jump |
| Esc | Release the mouse |

The top-left corner shows the frame rate, your speed and whether you're on the ground or in the air.

## How the code is laid out

| File | What it does |
|---|---|
| `index.html`, `style.css` | The page, the click-to-play screen and the on-screen readouts |
| `src/main.js` | Sets up rendering and runs the game loop |
| `src/world.js` | The baseplate, sky, lighting and the house |
| `src/input.js` | Keyboard and mouse |
| `src/hud.js` | The top-left readout |
| `src/settings.js` | Mouse sensitivity and field of view |
| `src/shared/config.js` | Movement values: speeds, jump height, gravity, tick rate |
| `src/shared/movement.js` | Player movement, including bumping into walls |
| `src/shared/map.js` | Where the house is, and the solid boxes the player collides with |
| `src/viewmodel/viewmodel.js` | Loads and draws the hands and gun on top of the world; where they're held, lighting, sway and bob |
| `src/viewmodel/pistol.js` | The pistol's side profiles (shared with Blender) and a simple built-in pistol |
| `src/viewmodel/arms.js` | The hand pose around the grip (shared with Blender) and simple built-in hands |
| `src/viewmodel/sdf.js` | Turns blended shapes into smooth meshes (used for the hands and sleeves) |
| `assets/pistol.glb`, `assets/arms.glb` | The detailed pistol, gloves and sleeves, made in Blender |
| `tools/` | The Blender build scripts that make the files in `assets/` (see below) |

Everything in `src/shared/` is plain JavaScript with no three.js or browser code. When multiplayer is added, the server will run the same movement code, so players move identically on the server and in the game.

The game logic runs at a fixed 60 ticks per second, whatever the screen's frame rate. The camera is drawn smoothly between ticks, and mouse look is applied every frame so aiming never lags.

## Tuning movement

All movement values are in `src/shared/config.js`:

| Value | Now | Meaning |
|---|---|---|
| `walkSpeed` | 5 m/s | Top walking speed |
| `groundAccel` | 50 m/s² | How fast you reach full speed or change direction (full speed in 0.1 s) |
| `groundDecel` | 40 m/s² | How fast you stop when you let go (about 0.13 s) |
| `airAccel` | 12 m/s² | How much you can steer in the air |
| `gravity` | 20 m/s² | Stronger than real life, for crisp jumps |
| `jumpHeight` | 1 m | Height of a jump |
| `jumpBuffer` | 0.1 s | A jump pressed this long before landing still happens |

Mouse sensitivity and field of view are in `src/settings.js`.

## Hands and gun

The pistol, gloves and sleeves you see are detailed models made in Blender: `assets/pistol.glb` (about 0.2 MB) and `assets/arms.glb` (about 1.2 MB).

- **Pistol:** rounded machined edges, chamfered slide, real ejection port with the barrel hood inside, cut cocking serrations, recessed crown and bore, notched rear sight and three-dot sights, rail slots, pins, slide stop, takedown levers, magazine release, rounded stippled grip, and bare metal showing through on worn edges.
- **Gloves:** moulded hard knuckle guard, stitched seams down every finger, leather fingertip caps and palm, padded finger knuckles, ribbed flex panel on the back of the hand, elastic cuff, and a velcro wrist strap with a rubber pull tab.
- **Sleeves:** open cuff with a double-stitched hem, uneven folds bunched up at the wrist, ripstop weave, a stitched forearm seam and a velcro cuff tab.

They're drawn in their own layer on top of the world, so the gun never pokes into walls and its size on screen doesn't change with the field of view. That layer has its own sun shadows (the hands shade the gun), sky-and-ground reflections that turn with your view, and film-like tone mapping. Where the gun is held is `HIP_POSITION` and `HIP_ROTATION` in `src/viewmodel/viewmodel.js`.

If the model files can't be loaded, the game falls back to the simpler hands and pistol built into the code, so it always works.

### Rebuilding the models

The models are made by scripts, so they can be changed and rebuilt. You need [Node.js](https://nodejs.org) and [Blender](https://www.blender.org) (tested with 5.2, with `blender` on your PATH). From the `project-fish` folder:

```bash
npm install
```

```bash
npm run build-models
```

This takes a couple of minutes. It exports the hand pose and pistol profiles from the game's code, builds and textures the models in Blender (`tools/blender/build_pistol.py` and `build_arms.py`), compresses them, and writes `assets/pistol.glb` and `assets/arms.glb`. It also saves `build/pistol.blend` and `build/arms.blend`, which you can open in Blender to look at or keep working on the models by hand. `npm run build-pistol` and `npm run build-arms` rebuild one at a time.

If a model made by hand in Blender replaces one of these files, keep the same scale (metres) and orientation (muzzle towards -Z, Y up), and keep the pistol's parts named `slide`, `frame`, `trigger` and `magazine` so they can be animated later.

## Credits

- [three.js](https://threejs.org) r184, MIT License, loaded from the jsDelivr CDN.
- Models and textures made from scratch by the scripts in `tools/`.
