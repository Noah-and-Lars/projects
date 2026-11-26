# Loamline

A 3D freeride mountain-bike game for the browser. Drop in, pump the
rollers, carve the berms and pop off the lips: land in the sweet spot,
throw whips, spins, flips, no handers, supermans and barspins, and race
your own ghost down five original trails. Built with
[three.js](https://threejs.org/). Every model, track and sound is
generated in code. Nothing is loaded from files.

## Play

`index.html` is the whole game in one self-contained file, the same way
Cube Assault and Throttle Ridge ship. three.js, the styles, the fonts and
the icon are all built in, so it makes no outside requests. Open it in
Chrome, Edge, Firefox or Safari, or put it on any static host. It works
offline, with a keyboard, a controller or touch.

Don't edit `index.html` by hand. It's generated from `src/` (see below).

### Trails

| Trail | Level | |
| --- | --- | --- |
| Practice Yard | Easy | Free ride with a skills checklist: perfect pop, sweet spot, manual, bunny hop, whip, 360, barspin, backflip… |
| Fernhollow Flow | Easy | Pine forest flow line: tables, rollers, deep berms |
| Larchline | Medium | Alpine ridge: step-ups, step-downs, long doubles, a creek gap |
| Slate Quarry | Medium | Quarry terraces: bench step-downs and a blast-pit gap |
| Copper Mesa | Hard | Red-rock desert: cliff drops, canyon gaps, a final step-down |

Timed trails have splits, a +3 s penalty per crash (you're put back
before the feature, at its speed), your best time with a ghost to race,
and coins at the finish. Coins unlock three more bikes in the garage:
a dirt jumper, an enduro bike and a dual-crown downhill bike, each with
its own speed, rotation, grip and toughness.

### Controls

| | Keyboard | Controller | Touch |
| --- | --- | --- | --- |
| Pedal / brake | W / S | RT / LT | Left stick up / down |
| Steer | A / D | Left stick | Left stick |
| Preload & pop | Space (hold, release) | A | JUMP |
| Manual / stoppie | ↓ / ↑ | Right stick | Right stick |
| Whip (air) | A / D | Left stick | Left stick |
| Flips (air) | ↑ / ↓ | Right stick | Right stick |
| Spin (air) | ← / → | Right stick | Right stick |
| No hander / barspin | Hold / tap W | Stick up / flick up | Stick up / flick up |
| Superman | S | Stick down | Stick down |
| Respawn | R | Y | ↺ |
| Camera · photo · pause | C · P · Esc | RB · B · Start | buttons |

Let go of Space in the last moment before a lip for a **perfect pop**. On
the flat it hops about 45 cm; pull up into a manual and press Space to
bunny hop. Manuals have to be balanced (feather ↓ or drag the rear brake,
or you loop out). Over-steering drifts the bike and hard braking locks
the rear. In the air, let go and the bike follows its arc and lines itself
up for the landing in the last moments; a crossed-up landing turns into a
slide rather than a crash.

**Riding assist** (Settings): *Weak* helps you round corners and
straightens you a little in the air. *Strong* follows the trail
(left/right picks your line), holds each jump's speed and lines you up
for the landing. Less assist earns more coins. The speedometer shows the
speed window for the next jump.

Settings also cover weather (day, dusk, night with a bike lamp, fog or
random), graphics quality, camera view, steering sensitivity, tilt
steering on phones, sound and music. Everything is saved in your browser.

## Develop

Serve the `loamline` folder and open `src/index.html`:

```bash
python3 -m http.server 8765
```

In development three.js loads from jsDelivr through the import map in
`src/index.html`, pinned to the version the build bundles. To rebuild
`index.html`:

```bash
cd tools && npm install && npm run build
```

`tools/test.mjs` builds every trail and has a bot ride each one top to
bottom with the real physics. It reports crashes and where each landing
fell:

```bash
node tools/test.mjs
```

## Code layout

| File (`src/js/`) | What it does |
| --- | --- |
| `physics.js` | Bike physics: banked-curve grip with drift and rear-wheel lock, manual balance, lip and rear-wheel takeoff with suspension soak, pops and bunny hops, flips, spins, whips with landing-aware limits, a landing predictor with auto-align, barspins, crash rules. Pure math, so node can run it. |
| `track.js` | Builds a trail from pieces, the world height function, and the **jump designer**: each kicker is ridden with the real physics, with and without a pop, and the landing is placed and shaped to catch both. |
| `courses.js` | Trail layouts and visual themes. |
| `world.js` | Terrain, trail ribbon, start hut, arches, tape, signs, trees, rocks, grass, sky shader, weather and dust. |
| `models.js` | Procedural bikes (working fork slider and swingarm) and the rider, pinned to bar and pedals with two-bone IK (helmet, goggles and pack included). |
| `animate.js` | Procedural animation: eased / sprung pose channels added together (crouch, weight shift, manual, arm give, turn and spin lean, whip twist and lay with an unwind, no-hander and superman arcs, barspin hand release and catch wobble, bunny-hop pull and push, head tracking the landing), a small fork / shock / rider-legs simulation, crank levelling, and rotation about the rider's centre of mass in the air. |
| `game.js` | A run: fixed-step physics, assist, tricks and scoring, landing grades, crashes and respawns, splits, ghost. |
| `camera.js` | Behind, far, rear-side, front, side, helmet, chest and photo views. |
| `input.js` | Keyboard, gamepad, touch sticks and tilt steering. |
| `audio.js` | Synthesised tyre, wind, freehub and impact sounds, UI sounds and a generative music loop. |
| `ui.js`, `main.js` | Menus, garage, settings, HUD, finish screen, photo mode, render loop. |

Barlow Condensed (SIL Open Font License) is embedded for the display
type; licences are in `tools/THIRD_PARTY_LICENSES.txt`.
