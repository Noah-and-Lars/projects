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
| Shift (hold) | Sprint (going forwards); double-tap for a tactical sprint (faster, while stamina lasts) |
| Mouse | Look |
| Space | Jump; at a ledge, climb onto it (or vault over it if it's low and thin); stand up |
| C | Crouch (toggle); while sprinting, slide (double-tap: a longer slide onto your back) |
| Z | Go prone (toggle); while sprinting, dive |
| Left mouse | Fire |
| Right mouse (hold) | Aim down the iron sights |
| Q | Aim: click to toggle, or hold to aim until you let go |
| R | Reload |
| F | Inspect the gun |
| 1 / 2, mouse wheel | Switch guns: the PF-9 and the PF-45 |
| B | Loadout menu: choose each gun's attachments (B or Esc closes it) |
| T | Switch the gun's light and laser on and off (when it has them) |
| Esc | Release the mouse |

The top-left corner shows the frame rate, your speed, whether you're on the ground or in the air, your stance or move, and your stamina.

## How the code is laid out

| File | What it does |
|---|---|
| `index.html`, `style.css` | The page, the click-to-play screen and the on-screen readouts |
| `src/main.js` | Sets up rendering and runs the game loop |
| `src/world.js` | The baseplate, sky, lighting, the house and the soldier standing by it |
| `src/input.js` | Keyboard and mouse |
| `src/hud.js` | The top-left readout |
| `src/settings.js` | Mouse sensitivity and field of view |
| `src/shared/config.js` | Movement values (speeds, jump height, gravity, tick rate) and each gun's rules |
| `src/weapon.js` | A gun's rules in play: firing, the magazine, reloading, inspecting |
| `src/shared/movement.js` | Player movement, including bumping into walls |
| `src/shared/map.js` | Where the house is, and the solid boxes the player collides with |
| `src/viewmodel/viewmodel.js` | Loads and draws the hands and gun on top of the world; where they're held, and lighting |
| `src/viewmodel/motion.js` | Weapon physics: how the hands and gun move, with all the tuning values in `MOTION` |
| `src/viewmodel/pistol9.js` | Points on the PF-9 (muzzle, sights, pivots, magazine release) and what each of its attachments changes |
| `src/viewmodel/pistol.js` | The grip and magazine the hands are posed round, the first PF-9's side profiles (shared with Blender) and a simple built-in pistol |
| `src/viewmodel/pistol45.js` | The PF-45: where its parts are on the model, and a simple built-in one |
| `src/viewmodel/arms.js` | The hand pose around the grip (shared with Blender) and simple built-in hands |
| `src/viewmodel/handRig.js` | Finger joints for the gloves (a skeleton fitted when the game loads) |
| `src/viewmodel/supportHand.js` | The support hand's shapes and how it holds a magazine |
| `src/viewmodel/shootingHand.js` | The shooting hand's thumb pressing each gun's magazine release |
| `src/soldier.js`, `src/player/body.js`, `src/player/fpArms.js`, `src/player/ik.js` | The soldier model, loaded once; the player's own body; his arms holding the gun; limb IK |
| `src/attachments.js`, `src/loadoutMenu.js` | Which attachments each gun has on, and the loadout menu (B) to choose them |
| `src/effects/audio.js` | The sounds: made in code, and the PF-45's recordings in `assets/sounds/` |
| `src/viewmodel/sdf.js` | Turns blended shapes into smooth meshes (used for the hands and sleeves) |
| `assets/pistol.glb`, `assets/pistol45.glb`, `assets/arms.glb` | The detailed pistols, gloves and sleeves, made in Blender |
| `assets/soldier.glb` | The soldier: the character model for multiplayer |
| `tools/` | The Blender build scripts that make the files in `assets/` (see below) |

Everything in `src/shared/` is plain JavaScript with no three.js or browser code. When multiplayer is added, the server will run the same movement code, so players move identically on the server and in the game.

The game logic runs at a fixed 60 ticks per second, whatever the screen's frame rate. The camera is drawn smoothly between ticks, and mouse look is applied every frame so aiming never lags.

## The soldier

A soldier in full tactical gear stands beside the house door, facing where you start, in his idle pose (breathing, shifting his weight). He's the character players will be when multiplayer arrives; until then he's there to look at. You can't walk through him, and shots stop on him. His model is `assets/soldier.glb` (3.2 MB), made from "Soldier Full Tactical Gear" by DanlyVostok (see Credits): 84,000 triangles with a full skeleton (fingers, face and twist bones) and its idle animation. Where he stands is `SOLDIER` in `src/shared/map.js`. The world lights him with the same outdoor sky reflections the gun uses, so his dark olive kit reads in daylight.

`tools/soldier/build_soldier.mjs` makes the file from the download: it rubs the lettering off his chest and back patches and blanks the round badge on his helmet (`tools/soldier/remove_patch_text.py`), drops texture coordinates no material uses, shrinks the textures from 4096 px to 1024 (the colour and normal maps; the rest to 512) as WebP, and compresses the meshes. At 1024 px he looks nearly the same as with the full 4K textures at any distance you'd see him from, and takes a quarter of the graphics memory of 2048 px. To rebuild it, download the model's glTF version from Sketchfab, unzip it into `build/soldier-source` (so the folder holds `scene.gltf`, `scene.bin` and `textures/`) and run `npm run build-soldier` (it needs Python 3 with numpy and Pillow).

## Your own body

You are the soldier too: look down and you see his legs, boots and kit, and the sun casts his whole shadow (`src/player/body.js`, a copy of the same model). The camera sits just behind his eyes, so his head, helmet, glasses and eyes are left out of the picture (they still cast their shadow).

His own arms hold the gun (`src/player/fpArms.js`): his sleeves and gloves are drawn in the gun layer with the body's own bones and vertex data, nothing copied. The hands are still animated by the gun layer's hand rigs (every grip, reload and inspect), and each frame his hand is put where the rig's is (his middle knuckle on its middle knuckle), each finger bone turned as the rig's, and his upper arm and forearm reach it from his shoulder by two-bone IK, the elbow hanging down and out, with the lower forearm taking half the wrist's twist. If his arms can't reach (looking up, mostly), the whole gun is drawn in towards his shoulders so the hands never leave it. To reach, the gun is held 0.4 m from the camera with a wider view of the gun layer (62°), so it's the size on screen it was further out. `settings.soldierArms` (in `src/settings.js`) switches back to the separate gloves model, which is also used if the soldier model can't be loaded. He faces where you look, leans a little with the view, and his neck and head take the rest of it. His hips move so his eyes stay just in front of the camera, sliding back as you look down so you look down past his chest, and his feet stay planted (two-bone leg IK, `src/player/ik.js`). Walking and running, his feet take turns: each is planted and goes back under him at his speed (so it stays put on the ground), then swings forward, lifted, as many steps a metre as the gun's bob so they land with its footstep jolts; his hips dip at each step, and in the air his feet tuck up. Crouching lowers his hips and bends his knees. Sliding, he sits back low with his lead leg out ahead and the other bent, his body a little further back so you look down at his legs. Prone, diving and climbing aren't posed yet, so his body is left out then (his arms still hold the gun).

## Moving

The movement is in `src/shared/movement.js` (shared with the future server), with its numbers in `MOVEMENT` and `PLAYER` in `src/shared/config.js`. They're modelled on how modern military shooters move:

- **Walking** at 5 m/s, a little slower backwards (0.75) and sideways (0.9). Aiming 0.6, crouched 0.5 (0.35 aiming), prone 0.9 m/s.
- **Sprinting** (hold Shift going forwards) at 6.8 m/s, as long as you like. **Tactical sprint** (double-tap Shift) at 8.4 m/s for up to 4 s of stamina: it slows towards a plain sprint as stamina runs low, and stamina comes back over 3 s after a short pause. The view widens a little while it lasts, and the pistol comes up close in front of the chest, muzzle up, swinging harder with the longer strides.
- **Crouching** (C, a toggle) and **going prone** (Z). Space stands up. You can't stand up where there's no room overhead.
- **Sliding** (C while sprinting): a burst of speed (1.2 times your sprint) that slows over 0.75 s, low enough to go under a 1 m bar. You can steer it a little, and jump out of it after 0.15 s to keep sprint speed (a slide cancel). The view rolls into it and widens, and the gun drops and cants over with a fine judder from the ground. It ends crouched. **Double-tap C** while sprinting for a longer, lower slide onto your back; getting up takes half a second.
- **Diving** (Z while sprinting): a low leap forward that lands you prone and slides you to a stop. Not straight after a jump.
- **Jumping** 1 m high. You land on top of things and walk up anything 35 cm or lower. You can still jump just after walking off an edge, and a jump pressed just before landing still happens.
- **Mantling**: Space at a ledge up to 2.1 m above your feet (or moving towards one in the air, so a jump reaches higher ledges) climbs onto it. Something up to 1.15 m high and 0.8 m thick you vault over instead. You keep your speed coming out (Mantle momentum), and C during a vault goes straight into a slide. The gun dips and rolls while you climb and can only fire if you're aiming.
- **Landing** from 1.5 m or more slows you for a moment (more from 3.5 m), less if you were sprinting.
- Shots stray less crouched (0.8) or prone (0.65) and more sliding, diving or in the air (1.5).

A small course to the left of the spawn has something for each: crates 0.5, 1 and 1.5 m high, a low wall to vault, a 2 m wall and a 2.6 m ledge to climb (jump first for the ledge), a bar to slide under, and three steps (`OBSTACLES` in `src/shared/map.js`).

## Tuning movement

All movement values are in `src/shared/config.js`:

| Value | Now | Meaning |
|---|---|---|
| `walkSpeed` | 5 m/s | Top walking speed |
| `sprintSpeedFactor` | 1.36 | Sprinting speed (6.8 m/s), as a fraction of walking speed |
| `tacSprintSpeedFactor` | 1.68 | Tactical sprint (8.4 m/s); `tacSprintTime` 4 s of stamina, back over `staminaRegenTime` 3 s |
| `slideBoost`, `slideFriction`, `slideTime` | 1.2, 7 m/s², 0.75 s | A slide's burst, how fast it slows and how long it lasts at most |
| `mantleReach`, `vaultMaxHeight` | 2.1 m, 1.15 m | How high a ledge you can climb, and how high a wall you vault |
| `groundAccel` | 50 m/s² | How fast you reach full speed or change direction (full speed in 0.1 s) |
| `groundDecel` | 40 m/s² | How fast you stop when you let go (about 0.13 s) |
| `airAccel` | 12 m/s² | How much you can steer in the air |
| `gravity` | 20 m/s² | Stronger than real life, for crisp jumps |
| `jumpHeight` | 1 m | Height of a jump |
| `jumpBuffer` | 0.1 s | A jump pressed this long before landing still happens |

Mouse sensitivity and field of view are in `src/settings.js`.

## Hands and gun

The gloves and sleeves you see are a detailed model made in Blender (`assets/arms.glb`, about 1.2 MB).

The first pistol, the PF-9, is a compact polymer-frame 9 mm holding 15 rounds (`assets/pistol.glb`, about 4.8 MB with its attachments). It's made from "Pistol 9mm Custom" by ~D-Try~ (see Credits), a detailed model that comes with a set of attachments, by `tools/blender/convert_pistol9.py` and `tools/finish_pistol9.mjs`. The download is a showcase scene with four copies of the pistol and a row of loose attachments; the script takes the fitted copy with its magazine in and places it so its grip sits where the game's hands hold a pistol, 14% wider than the model (the model is real size in length and height but thinner than the real thing). It groups its pieces into the parts the game moves (`slide` with its `extractor`, `barrel` with a `chamber_round`, `frame`, `trigger` with its `safety_blade`, `slide_stop`, `mag_release`, and `magazine` with a `magazine_round`, `magazine_second_round` and `magazine_follower`, which it adds), and keeps each attachment as a hidden part named `att_<id>` in its mounted place. On the textures it rubs out the maker's and model markings, serials and emblems, engraves a made-up "PF-9" on the slide, and rubs the brand names, logos and codes off the attachments; it also shrinks them (2048 px for the pistol, 1024 px or less for the rest). Its magazine slides out along its own axis, a little steeper than the grip line the hands are posed round (`magDown`). To rebuild it, download that model's glTF version from Sketchfab, unzip it into `build/pistol9-source` (so the folder holds `scene.gltf`, `scene.bin` and `textures/`) and run `npm run build-pistol`. The earlier PF-9, made entirely from scripts (`tools/blender/build_pistol.py`, from the profiles in `src/viewmodel/pistol.js`), is described below; `npm run build-pistol-own` builds it into `build/`, and a simple built-in pistol stands in if the model can't be loaded.

The second pistol, the PF-45, is a full-size .45 in the style of the 1911 (`assets/pistol45.glb`, about 1.5 MB). It's made from "Colt m1911" by neyr (see Credits), a detailed model with textures, by `tools/blender/convert_pistol45.py`. The script turns and scales it into gun space (216 mm long) and places it so its grip sits where the game's hands hold a pistol. It groups its pieces into the parts the game moves (`slide`, `barrel`, `frame`, `hammer`, `trigger`, `slide_stop`, `thumb_safety`, `mag_release`, `magazine` with its `magazine_round` and `magazine_follower`, and a `chamber_round` in the barrel), and makes the walnut grip panels thicker so the fingers wrap them. It also adds the middle of the barrel, seen when the slide locks back. On the textures it rubs out the maker's name, engraves a made-up "PF-45 CAL .45" in its place, and darkens the steel a little, keeping the wear on the edges. To rebuild it, download that model's glTF version from Sketchfab, unzip it into `build/m1911-source` (so the folder holds `scene.gltf`, `scene.bin` and `textures/`) and run `npm run build-pistol45`. To try other sizes or holds, the script also takes `--grow K` (K times bigger, about the middle of the grip) and `--raise D` (D metres higher in the hand). An earlier 1911-style pistol made entirely from scripts (`tools/blender/build_pistol45.py`, from the profiles in `src/viewmodel/pistol45.js`) is kept as a fallback; `npm run build-pistol45-own` builds it into `build/`.

The models made from scratch:

- **The earlier PF-9** (kept as `npm run build-pistol-own`): a modern polymer-frame 9 mm, with a smoothly curved frame (the trigger guard, the front and back straps, and a beavertail sweeping back over the hand), rounded machined edges, a slide chamfered along its top and bottom edges and tapered at the nose, a matted top (fine lengthwise grooves between the sights so it doesn't catch the light), a dark gap line where the slide sits on the frame, deep flat-bottomed cocking serrations (eight at each end, both sides), a real ejection port with chamfered edges and the barrel hood inside (hollow underneath, with a chamber and the round in it, so you can see in with the slide back), an extractor between the port and the rear serrations, recessed crown and bore, notched rear sight and three-dot sights, accessory rail with cross slots, three pins, a slide stop with a ridged pad, ridged takedown levers and magazine release, a steel serial plate, trigger with a safety blade, sights in dovetails (anti-glare grooves on the rear one), a seam round the back plate, a relief cut along the bottom front of the slide, thumb-rest scallops above the trigger guard, a rounded grip with coarse stippling all round inside a smooth border, a small fish emblem on each side of the grip (a made-up mark), a flared magazine well, and a baseplate with a lip at the front. The slide has fine machining marks and the polymer a fine grain. The magazine has feed lips, a follower, and a second round staggered under the top one (it's a double stack). It has engraved markings (the model name "PF-9", "9x19" on the barrel and a made-up serial number on the slide and the serial plate) and a well-used finish: bare steel on worn edges and high points, holster wear rubbed along the slide, scratches through the finish, scuffed polymer, and the grip worn smoother where it's held.
- **Gloves:** a natural two-handed grip, with every finger at real bone lengths curled tight round the grip (the support hand over the shooting hand, the trigger finger on the trigger), knuckle bumps on the finger joints, fabric creases where the fingers bend, a moulded hard knuckle guard, stitched seams down every finger, leather fingertip caps and palm, padded finger knuckles, ribbed flex panel on the back of the hand, fabric bunched at the wrist, elastic cuff, and a velcro wrist strap with a rubber pull tab.
- **Sleeves:** open cuff with a double-stitched hem, uneven folds bunched up at the wrist, ripstop weave, a stitched forearm seam and a velcro cuff tab.

They're drawn in their own layer on top of the world, so the gun never pokes into walls and its size on screen doesn't change with the field of view. That layer has its own sun shadows (the hands shade the gun), sky-and-ground reflections that turn with your view, and film-like tone mapping. Where the gun is held is `HIP_POSITION` and `HIP_ROTATION` in `src/viewmodel/viewmodel.js`.

The gloves are modelled holding the gun. When the game loads they get a skeleton (three bones in each finger and the thumb), and every point on a glove follows the bones nearest it, shared across each joint so the knuckles bend smoothly. Joints only bend, never twist (`src/viewmodel/handRig.js`). That's what lets the support hand open, catch and grip magazines and take hold of the gun again during a reload (`src/viewmodel/supportHand.js`), and the shooting hand's thumb reach the magazine release (`src/viewmodel/shootingHand.js`).

If the model files can't be loaded, the game falls back to the simpler hands and pistol built into the code, so it always works.

### Aiming down the sights

Hold the right mouse button (or click Q to toggle, or hold Q) and the pistol comes up in about 0.28 s, with a slight swoop and a small settle at the end, until the line through its three sight dots runs straight through your eye: the front dot sits exactly where the centre dot was. The world zooms in a little, the centre dot fades out, and you walk at 55% speed (`aimSpeedFactor` in `src/shared/config.js`). The arm physics keeps working while you aim, so the sights trail behind turns and swing back, and they sway: slow, uneven drifts from breathing and tired arms that never quite repeat, plus a faint tremor. The sway is about 2.4 times worse just after the sights come up and calms down over a second, and it's worse while you walk. The timing, distance and zoom are `AIM` in `src/viewmodel/viewmodel.js`; the wobble and how much of each movement is kept while aiming are `aiming`, `aimWobble` and `aimSettle` in `MOTION`. The sight positions are `SIGHTS` in `src/viewmodel/pistol.js`.

### Firing

The pistol is semi-automatic: one shot per click, up to 500 a minute (clicks made faster than that wait their turn for a moment instead of being lost). It holds 15 rounds with 60 in reserve; the numbers are `PISTOL` in `src/shared/config.js`, and the rules are in `src/weapon.js`.

- **Where shots go:** through the sights when aiming (so the sway matters), roughly at the centre from the hip, straying more from the hip and while moving. They hit the ground and the house (`raycastWorld` in `src/shared/map.js`) and leave a bullet hole and a puff of dust.
- **Kick:** the gun flips up and shoves back into the hands on the arm springs (`recoil` in `MOTION`), and the view kicks up and springs back with a little lasting climb you pull down against (`RECOIL` in `src/main.js`). Both are gentler while aiming.
- **The gun:** the trigger comes back and resets; the slide cycles on each shot (with a second, smaller jolt as it slams home) and locks back on the last round. The barrel is its own part: it only follows the slide a few millimetres and its back end tips down, like a real pistol's, so with the slide locked back the barrel pokes out of the front. The spent case flies out of the ejection port, spins, bounces and pings on the ground.
- **Small moving parts** (so you can see the gun's state up close): the slide stop turns up into a notch in the slide when the slide locks back on an empty magazine; the extractor stands out a little with a round in the chamber (the loaded-chamber indicator) and sits flush when the chamber is empty; the safety blade in the trigger's face presses in as the trigger is pulled; and the magazine shows what's in it: brass behind the witness holes down to the level the rounds reach, the top round and the one under it while there are rounds, and the follower when it's empty. The amounts are `SLIDE_STOP`, `INDICATOR_TRAVEL` and `BLADE_TRAVEL` in `src/viewmodel/viewmodel.js`.
- **Muzzle flash:** a brief, irregular fireball of hot gas bursting out round the front of the slide, a short flame plume and a few burning powder sparks, different every shot (now and then barely visible), lighting the hands and surroundings for an instant (`src/effects/muzzleFlash.js`).
- **Smoke:** a wisp from the muzzle on every shot. Each shot also heats the barrel, which cools over a few seconds; after a few quick shots, thin smoke keeps curling off the muzzle and out of the ejection port for a few seconds (about three after a whole magazine; `HEAT` in `src/main.js`).
- **Sound:** a 9mm report built in code sample by sample (pressure spike, bright blast, low punch, ground bounce, slide clack) with outdoor echoes, a click when the gun is empty, and reload sounds, including a dropped magazine clattering on the ground (`src/effects/audio.js`).
- **Reloading (R):** the gun comes up and in, muzzle tipped up a little so the magazine well comes into view, and the shooting hand's thumb comes down onto the magazine release and presses it. From empty, the support hand has already let go and is heading for the belt, and the empty magazine drops free; it carries on falling in the world, clatters on the ground and stays there (the last dozen are kept). With rounds left, the support hand turns palm up under the grip first, the old magazine drops into it, and it pulls it out and puts it away on the way to the belt, so the rounds left in it are kept. Either way it closes round a fresh magazine at the belt and brings it up held the way it's pushed in: palm up, baseplate in the palm, index finger along the front, the other fingers and the thumb closed on it (each closes until it touches the magazine). It lines it up under the well and pushes it straight in: the fingers slide off its front as it goes up into the grip, and the palm pushes it home (the gun jolts as it clicks in). Then the hand drops away, turns back and comes up beside the grip half open, and closes round it again; from empty, the slide is then released forward. 2.1 s with rounds left, or 2.5 s from empty. The hands' movements are `HAND_PATHS` in `src/viewmodel/viewmodel.js`, their hand shapes are in `src/viewmodel/supportHand.js` and `src/viewmodel/shootingHand.js`, and the timings are `RELOAD_STEPS` in `src/weapon.js`. The ammo counter is bottom right.

### Two guns

You carry two pistols: the PF-9 (15 rounds, quick) and the PF-45 (7 rounds, slower to fire and kicking harder, with a deeper shot). Press 1 or 2, or turn the mouse wheel, to switch: the gun in your hands drops down out of view (0.2 s) and the other comes up (0.3 s). Each keeps its own ammo. Switching puts an inspect away, and a reload too, unless the fresh magazine is already in (then it counts). A shot, reload or inspect asked for while switching happens as soon as the gun is up. The rules for each gun are `PISTOL` and `PISTOL45` in `src/shared/config.js`.

Both use the same hands and inspect. The PF-45 reloads its own way: it comes up turned further over towards the support hand, and from empty, after the magazine goes in, the support hand goes up and over the back of the slide, takes hold of it (palm on top, fingers over the right side), pulls it back the last bit and lets go so it slingshots home, rather than the thumb dropping the slide stop (2.9 s; its `reloadSteps` in `src/shared/config.js`, the hand's keys in `rackFromBehind` in `src/viewmodel/viewmodel.js`). The PF-9's thumb presses its slide stop. What's different on each gun, and where it is, is in `MODEL9` in `src/viewmodel/pistol9.js` and `MODEL45` in `src/viewmodel/pistol45.js` (and `POINTS9` and `FALLBACK45` for the built-in stand-ins): the muzzle and ejection port, the sight line, the slide's travel, the barrel and slide stop's pivots, the PF-45's hammer and its magazine release (the shooting hand's thumb goes to whichever gun's it's holding). The PF-45's hammer is cocked; it falls as the trigger breaks, the slide pushes it back, and it settles back on the sear. Its slide, magazine release and magazine sounds are recordings (`assets/sounds/`, see Credits): the slide pulled back and snapping forward, an empty magazine and one with rounds in it coming out, and a magazine pushed home.

### Attachments

Press B for the loadout menu, where you choose each gun's attachments (the PF-45 has none yet). It lets go of the mouse while it's open; B, Esc or "Back to game" closes it. Your choice is remembered in the browser. The PF-9's come with its model:

| Slot | Choices | What they do |
|---|---|---|
| Sight | Red dot | You aim through the red dot instead of the iron sights. It needs a mount: the clamp mount (it sits over the slide and stays still) or the rail cover (it moves with the slide). |
| Mount | Clamp mount, rail cover | The clamp mount clamps to the frame's rail and bridges over the slide, with rails on top, both sides and underneath. The rail cover covers the front of the slide, with a rail on top. Only one at a time. |
| Muzzle | Short, long or box suppressor | Quieter shots that barely echo, and a much smaller flash, from the front of the suppressor. The box suppressor clamps to the frame's rail, so it can't go on with the clamp mount, and has a rail of its own underneath. |
| Under the barrel | Light, compact light | A light that shines where the gun points. It goes on the clamp mount's bottom rail, the box suppressor's rail, or the frame's own rail. |
| Side | Laser | A red dot where the gun points. It needs the clamp mount (it sits on its left rail). |

T switches the light and laser on and off: the support hand's index finger reaches forward and presses the switch (the laser's at its back corner, or the light's at its back). Choosing something that needs a mount brings one along, and choosing something that can't go on with what's on takes that off (the menu says what it would take off when you point at a choice). With the clamp mount or the box suppressor on, the inspect leaves out the chamber check, because they're where the hand takes hold of the slide; with the rail cover on, the hand takes hold of the cover. The choices and their rules are in `src/attachments.js`, what each one changes (the aim line, the muzzle, where the light and laser shine from) is in `src/viewmodel/pistol9.js`, and the viewmodel's `setAttachments` puts them on. In daylight the light only shows up close and in shade.

### Inspecting

Press F to look the gun over (7.2 s). The support hand lets go and drops out of the way, and the shooting hand brings the gun up and rolls it over to show its right side (the ejection port and the loaded-chamber indicator), then turns it the other way, muzzle to the left, to show its left side (the slide stop, which is up if the slide is locked back, and the markings). It turns the gun the way a real arm does: as much as it can by twisting the forearm about its own length, so the sleeve stays where it is, and the rest by bending the wrist and turning the forearm at the elbow. Then the gun comes upright and up, as for a reload, for a magazine check: the thumb presses the release, the magazine drops into the support hand waiting palm up under the grip, and the hand pulls it out and holds it up so you can see the top round and how full it is (or the follower if it's empty). It lines it back up and pushes it home. Then it checks the chamber: the gun turns muzzle right so the top and right side of the slide face you, and the support hand takes hold of the slide over the top in front of the ejection port (palm against its left side, index and middle fingers over onto its right side, thumb along its left) and eases it back half way. The extractor draws the round in the chamber back with it, so its brass shows in the ejection port. The hand lets go and the slide snaps forward, and the hand takes hold of the gun again. With the slide locked back on an empty gun the chamber is plain to see, so that part is left out (5.8 s). The PF-45's inspect lingers longer on each of the four things it shows (its right side, its left side, the magazine held up and the slide held back), so it takes 10.4 s (8.4 s without the chamber check); the moves between are as quick as the PF-9's. Each gun's extra time per hold is `inspectHolds` in `src/shared/config.js`, and the holds are `INSPECT_HOLDS` in `src/weapon.js`.

Firing, aiming, reloading or sprinting cuts it short: the gun goes back to the hold in a quarter of a second, and then does what you asked (a shot isn't lost). If the magazine is out or the slide is held back at that moment, that's finished first, four times faster. You can't start an inspect while reloading, aiming or sprinting. The gun's and arms' keyframes are `INSPECT_POSES` and the support hand's path is `HAND_PATHS.inspect`, both in `src/viewmodel/viewmodel.js`; the hand's hold on the slide is `OVER_TURN` and `OVER_SLIDE` in `src/viewmodel/supportHand.js`; the timings are `INSPECT` in `src/weapon.js`.

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

This takes a few minutes. It converts the two pistols from their downloads (`assets/pistol.glb` and `assets/pistol45.glb`, which need their sources in `build/pistol9-source` and `build/m1911-source`, see Hands and gun) and the soldier (see The soldier). It exports the hand pose and pistol profiles from the game's code, builds and textures the arms in Blender (`tools/blender/build_arms.py`), compresses them, and writes `assets/arms.glb`. It also saves `build/pistol9.blend`, `build/pistol45.blend` and `build/arms.blend`, which you can open in Blender to look at or keep working on the models by hand. `npm run build-pistol`, `npm run build-pistol45`, `npm run build-arms` and `npm run build-soldier` rebuild one at a time.

If a model made by hand in Blender replaces one of these files, keep the same scale (metres) and orientation (muzzle towards -Z, Y up), and keep the pistol's parts named as they are (`slide`, `barrel`, `frame`, `trigger`, `safety_blade`, `slide_stop`, `extractor`, `magazine` and the magazine's `magazine_round`, `magazine_second_round`, `magazine_follower` and `magazine_rounds_1` to `_6`) so they animate. The slide stop and the barrel turn about fixed points (`SLIDE_STOP` and `BARREL` in `src/viewmodel/viewmodel.js`), not about their own origins, because compressing the file moves those.

## Credits

- [three.js](https://threejs.org) r184, MIT License, loaded from the jsDelivr CDN.
- The hands and arms: models and textures made from scratch by the scripts in `tools/`.
- The first pistol and its attachments are based on ["Pistol 9mm Custom"](https://sketchfab.com/3d-models/pistol-9mm-custom-7bb44ec1d8e14925aeebbfa8374b87cf) by [~D-Try~](https://sketchfab.com/DTry), licensed under [CC BY 4.0](http://creativecommons.org/licenses/by/4.0/). Changes made: the fitted pistol and its attachments taken from the showcase scene, the loose attachments moved onto it; placed for the game's hands and made 14% wider (the round suppressors keep their shape); pieces grouped into moving parts and each attachment into one part; added rounds in the chamber and magazine (from the model's cartridge, made real size) and a magazine follower; the maker's and model markings, serials, emblems, brand names, logos and codes rubbed out, and a made-up "PF-9" engraved on the slide; only the lenses and the red dot's reticle left see-through; textures shrunk and stored as WebP; meshes compressed.
- The PF-45's slide sound is cut from "1911 Pistol Cocking" by freesound_community on [Pixabay](https://pixabay.com), under the [Pixabay Content License](https://pixabay.com/service/license-summary/). Its magazine sounds (`weapon_gun_1911_A_3`, `_4` and `_5`) were supplied for the project.
- The soldier is based on ["Soldier Full Tactical Gear"](https://sketchfab.com/3d-models/soldier-full-tactical-gear-850593a8c7114c188395ba1849a66eb9) by [DanlyVostok](https://sketchfab.com/1799danly), licensed under [CC BY 4.0](http://creativecommons.org/licenses/by/4.0/). Changes made: the lettering on the chest and back patches removed and the round helmet badge blanked; the jacket's sleeves split off into their own part and the parts tagged for first person; the plate carrier's sides no longer bend with the arms; unused texture coordinates dropped; textures shrunk to 1024 px and stored as WebP; meshes compressed.
- The second pistol is based on ["Colt m1911"](https://sketchfab.com/3d-models/colt-m1911-2cfbca3cd37a426c8dbf6474504703e8) by [neyr](https://sketchfab.com/neyr), licensed under [CC BY 4.0](http://creativecommons.org/licenses/by/4.0/). Changes made: turned, scaled and placed for the game's hands; pieces grouped into moving parts; thicker grip panels; added the middle of the barrel, a round in the chamber and a magazine follower; the maker's name replaced by a made-up marking; the steel darkened a little; textures halved to 2048 px.
