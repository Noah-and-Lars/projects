# Project Fish

A fast-paced multiplayer first-person shooter for the browser, built from scratch with [three.js](https://threejs.org).

**Status: phase 1.** A flat grey baseplate where you can look around, walk and jump, with a small house in front of you so you can see yourself moving. You see your gloved hands holding a pistol, which sways as you look around and bobs as you walk. Shooting, the map and multiplayer come later.

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
| `src/viewmodel/viewmodel.js` | Draws the hands and gun on top of the world; where they're held, sway and bob |
| `src/viewmodel/pistol.js` | The pistol, built to real dimensions |
| `src/viewmodel/arms.js` | The gloved hands and sleeves, posed around the pistol's grip |
| `src/viewmodel/sdf.js` | Turns blended shapes into smooth meshes (used for the hands and sleeves) |

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

The hands, sleeves and pistol are built in code when the game loads, so there are no model files yet. The hands are shaped from rounded bones blended together like clay and turned into a smooth mesh; that takes about half a second while the page says "Loading…".

They're drawn in their own layer on top of the world, so the gun never pokes into walls, and its size on screen doesn't change with the field of view. Where the gun is held is `HIP_POSITION` and `HIP_ROTATION` in `src/viewmodel/viewmodel.js`.

When models are made in Blender, export them as `.glb` files and they can replace `createPistol()` and `createArms()`. Keep the pistol's scale (metres) and orientation (muzzle towards -Z) so the hands still fit.

## Credits

- [three.js](https://threejs.org) r184, MIT License, loaded from the jsDelivr CDN.
