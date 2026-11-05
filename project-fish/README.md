# Project Fish

A fast-paced multiplayer first-person shooter for the browser, built from scratch with [three.js](https://threejs.org).

**Status: phase 1.** A flat grey baseplate where you can look around, walk and jump, with a small house in front of you so you can see yourself moving. You see your gloved hands holding a worn pistol out in front of you. The arms have weight: they trail behind turns, lean into strafes, bounce with your steps, dip when you land, and pull the gun back when you walk up to a wall. Shooting, the map and multiplayer come later.

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
| Shift (hold) | Sprint (going forwards) |
| Mouse | Look |
| Space | Jump |
| Left mouse | Fire |
| Right mouse (hold) | Aim down the iron sights |
| Q | Aim: click to toggle, or hold to aim until you let go |
| R | Reload |
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
| `src/viewmodel/viewmodel.js` | Loads and draws the hands and gun on top of the world; where they're held, and lighting |
| `src/viewmodel/motion.js` | Weapon physics: how the hands and gun move, with all the tuning values in `MOTION` |
| `src/viewmodel/pistol.js` | The pistol's side profiles (shared with Blender) and a simple built-in pistol |
| `src/viewmodel/arms.js` | The hand pose around the grip (shared with Blender) and simple built-in hands |
| `src/viewmodel/handRig.js` | Finger joints for the gloves (a skeleton fitted when the game loads) |
| `src/viewmodel/supportHand.js` | The support hand's shapes and how it holds a magazine |
| `src/viewmodel/shootingHand.js` | The shooting hand's thumb pressing the magazine release |
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
| `sprintSpeedFactor` | 1.5 | Sprinting speed (7.5 m/s), as a fraction of walking speed |
| `groundAccel` | 50 m/s² | How fast you reach full speed or change direction (full speed in 0.1 s) |
| `groundDecel` | 40 m/s² | How fast you stop when you let go (about 0.13 s) |
| `airAccel` | 12 m/s² | How much you can steer in the air |
| `gravity` | 20 m/s² | Stronger than real life, for crisp jumps |
| `jumpHeight` | 1 m | Height of a jump |
| `jumpBuffer` | 0.1 s | A jump pressed this long before landing still happens |

Mouse sensitivity and field of view are in `src/settings.js`.

## Hands and gun

The pistol, gloves and sleeves you see are detailed models made in Blender: `assets/pistol.glb` (about 0.2 MB) and `assets/arms.glb` (about 1.2 MB).

- **Pistol:** a modern polymer-frame 9 mm, with a smoothly curved frame (the trigger guard, the front and back straps, and a beavertail sweeping back over the hand), rounded machined edges, a slide chamfered along its top and bottom edges and tapered at the nose, deep flat-bottomed cocking serrations (eight at each end, both sides), a real ejection port with the barrel hood inside, extractor, recessed crown and bore, notched rear sight and three-dot sights, accessory rail with cross slots, three pins, a slide stop with a ridged pad, ridged takedown levers and magazine release, a steel serial plate, trigger with a safety blade, sights in dovetails (anti-glare grooves on the rear one), a seam round the back plate, a relief cut along the bottom front of the slide, thumb-rest scallops above the trigger guard, a rounded grip with coarse stippling all round inside a smooth border, a small fish emblem on each side of the grip (a made-up mark), a flared magazine well, and a baseplate with a lip at the front. The slide has fine machining marks and the polymer a fine grain. It has engraved markings (the model name "PF-9", "9x19" on the barrel and a made-up serial number on the slide and the serial plate) and a well-used finish: bare steel on worn edges and high points, holster wear rubbed along the slide, scratches through the finish, scuffed polymer, and the grip worn smoother where it's held.
- **Gloves:** a natural two-handed grip, with every finger at real bone lengths curled tight round the grip (the support hand over the shooting hand, the trigger finger on the trigger), knuckle bumps on the finger joints, fabric creases where the fingers bend, a moulded hard knuckle guard, stitched seams down every finger, leather fingertip caps and palm, padded finger knuckles, ribbed flex panel on the back of the hand, fabric bunched at the wrist, elastic cuff, and a velcro wrist strap with a rubber pull tab.
- **Sleeves:** open cuff with a double-stitched hem, uneven folds bunched up at the wrist, ripstop weave, a stitched forearm seam and a velcro cuff tab.

They're drawn in their own layer on top of the world, so the gun never pokes into walls and its size on screen doesn't change with the field of view. That layer has its own sun shadows (the hands shade the gun), sky-and-ground reflections that turn with your view, and film-like tone mapping. Where the gun is held is `HIP_POSITION` and `HIP_ROTATION` in `src/viewmodel/viewmodel.js`.

The gloves are modelled holding the gun. When the game loads they get a skeleton (three bones in each finger and the thumb), and every point on a glove follows the bones nearest it, shared across each joint so the knuckles bend smoothly. Joints only bend, never twist (`src/viewmodel/handRig.js`). That's what lets the support hand open, catch and grip magazines and take hold of the gun again during a reload (`src/viewmodel/supportHand.js`), and the shooting hand's thumb reach the magazine release (`src/viewmodel/shootingHand.js`).

If the model files can't be loaded, the game falls back to the simpler hands and pistol built into the code, so it always works.

### Aiming down the sights

Hold the right mouse button (or click Q to toggle, or hold Q) and the pistol comes up in about 0.28 s, with a slight swoop and a small settle at the end, until the line through its three sight dots runs straight through your eye: the front dot sits exactly where the centre dot was. The world zooms in a little, the centre dot fades out, and you walk at 55% speed (`aimSpeedFactor` in `src/shared/config.js`). The arm physics keeps working while you aim, so the sights trail behind turns and swing back, and they sway: slow, uneven drifts from breathing and tired arms that never quite repeat, plus a faint tremor. The sway is about 2.4 times worse just after the sights come up and calms down over a second, and it's worse while you walk. The timing, distance and zoom are `AIM` in `src/viewmodel/viewmodel.js`; the wobble and how much of each movement is kept while aiming are `aiming`, `aimWobble` and `aimSettle` in `MOTION`. The sight positions are `SIGHTS` in `src/viewmodel/pistol.js`.

### Firing

The pistol is semi-automatic: one shot per click, up to 500 a minute (clicks made faster than that wait their turn for a moment instead of being lost). It holds 12 rounds with 60 in reserve; the numbers are `PISTOL` in `src/shared/config.js`, and the rules are in `src/weapon.js`.

- **Where shots go:** through the sights when aiming (so the sway matters), roughly at the centre from the hip, straying more from the hip and while moving. They hit the ground and the house (`raycastWorld` in `src/shared/map.js`) and leave a bullet hole and a puff of dust.
- **Kick:** the gun flips up and shoves back into the hands on the arm springs (`recoil` in `MOTION`), and the view kicks up and springs back with a little lasting climb you pull down against (`RECOIL` in `src/main.js`). Both are gentler while aiming.
- **The gun:** the trigger comes back and resets; the slide cycles on each shot (with a second, smaller jolt as it slams home) and locks back on the last round. The barrel is its own part: it only follows the slide a few millimetres and its back end tips down, like a real pistol's, so with the slide locked back the barrel pokes out of the front. The spent case flies out of the ejection port, spins, bounces and pings on the ground.
- **Muzzle flash:** a brief, irregular fireball of hot gas bursting out round the front of the slide, a short flame plume and a few burning powder sparks, different every shot (now and then barely visible), lighting the hands and surroundings for an instant (`src/effects/muzzleFlash.js`).
- **Smoke:** a wisp from the muzzle on every shot. Each shot also heats the barrel, which cools over a few seconds; after a few quick shots, thin smoke keeps curling off the muzzle and out of the ejection port for a few seconds (about three after a whole magazine; `HEAT` in `src/main.js`).
- **Sound:** a 9mm report built in code sample by sample (pressure spike, bright blast, low punch, ground bounce, slide clack) with outdoor echoes, a click when the gun is empty, and reload sounds, including a dropped magazine clattering on the ground (`src/effects/audio.js`).
- **Reloading (R):** the gun comes up and in, muzzle tipped up a little so the magazine well comes into view, and the shooting hand's thumb comes down onto the magazine release and presses it. From empty, the support hand has already let go and is heading for the belt, and the empty magazine drops free; it carries on falling in the world, clatters on the ground and stays there (the last dozen are kept). With rounds left, the support hand turns palm up under the grip first, the old magazine drops into it, and it pulls it out and puts it away on the way to the belt, so the rounds left in it are kept. Either way it closes round a fresh magazine at the belt and brings it up held the way it's pushed in: palm up, baseplate in the palm, index finger along the front, the other fingers and the thumb closed on it (each closes until it touches the magazine). It lines it up under the well and pushes it straight in: the fingers slide off its front as it goes up into the grip, and the palm pushes it home (the gun jolts as it clicks in). Then the hand drops away, turns back and comes up beside the grip half open, and closes round it again; from empty, the slide is then released forward. 2.1 s with rounds left, or 2.5 s from empty. The hands' movements are `HAND_PATHS` in `src/viewmodel/viewmodel.js`, their hand shapes are in `src/viewmodel/supportHand.js` and `src/viewmodel/shootingHand.js`, and the timings are `RELOAD_STEPS` in `src/weapon.js`. The ammo counter is bottom right.

### Sprinting

Hold Shift while moving forwards (straight or at an angle) to sprint at 7.5 m/s, 1.5 times walking speed (`sprintSpeedFactor` in `src/shared/config.js`). The hands bend down at the wrists, tipping the gun muzzle down (the gloves' cuffs stay with the sleeves), and the crosshair fades. Sprinting needs you to be going forwards and not aiming; it starts on the ground and carries on through a jump. Aiming or firing stops it. A shot fired mid-sprint waits the moment it takes the gun to come back up (about 0.2 s), and sprinting picks up again 0.4 s after the last shot if Shift is still held. You can reload while sprinting; the gun stays in its reload pose. The pose is `sprint` in `MOTION` (`src/viewmodel/motion.js`).

### Weapon physics

The hands and gun hang on springs (`src/viewmodel/motion.js`), so they have weight. Turning makes them trail behind and swing back past centre when you stop; speeding up or stopping shoves them the other way; strafing leans them into the turn; each footstep gives a small bounce; jumping and landing make them dip and nod; breathing keeps them from ever being perfectly still. Close to a wall (a ray straight ahead hits something under 85 cm away) the gun is pulled back and tipped up. Sprinting, the hands bend down at the wrists the other way, tipping the gun muzzle down while the forearms stay put, and the longer strides swing it more. They swing about a point between the wrists, not the eye, so they move like arms. Every value is in `MOTION` at the top of the file, with a comment saying what it does.

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
