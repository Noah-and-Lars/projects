# Endless Showroom

A multiplayer survival game set in an endless furniture store, for the browser,
built with [Three.js](https://threejs.org/). There are no exits. By day the
staff wander about and leave you alone. At night the overhead lights go out
and they hunt anyone they see or hear. Gather food, carry furniture around to
build towers and forts, and see how many days you can last, alone or with up
to 7 friends.

It plays in the style of the "infinite store" survival genre (the gameplay
loop players know from 3008 on Roblox) but it is its own game. The name,
store layout, staff, characters, furniture and food, music, sounds and UI
were all made for this game. Nothing was taken from another game.

## Play

`index.html` is the whole game in one file. Solo play works offline. Online
play loads the arcade's realtime client (`rt.js`, the same Cloudflare Worker
the other arcade games use) when you choose an online mode, and like the
other games it needs an online Arcade account.

- **Play Online**: joins the first public store with room (`pub1` to `pub20`,
  8 players each).
- **Create Private Room**: makes a 4-letter code to give to friends.
- **Join**: type a friend's code.
- **New Solo Store**: your own store, no connection needed. It's saved
  every 20 seconds and when you leave, and **Continue Solo** picks it up again
  (the day, every piece you moved, your stats, inventory and waypoints).

Under **Days** on the menu you can pick **Normal** (6 minute days, 5 minute
nights) or **Short** (3 and 2.5 minutes) for any store you start, solo or a
room you create. Everyone in the room plays to the host's choice.

Everyone starts somewhere random in the store. Whistle (H) to find each
other, and read the aisle signs (`AISLE E3 · S2`) to say where you are. Pick a
shirt colour on the menu so friends can tell you apart.

Don't edit `index.html` by hand. It's generated from `src/`.

## The week

| | |
| --- | --- |
| Day | 6 minutes, 08:00 to 22:00 on the clock. The staff are harmless. The last 5 seconds tick down. |
| Night | 5 minutes, 22:00 to 08:00. The overhead lights cut out with a clunk, and only the emergency fittings (orange) and lamps stay lit. |
| Week | Days run Monday to Sunday. **Food and first aid restock at the start of every Monday and Friday**, not daily. |

Each weekday has its own gentle tune. Night has a low drone, a Crimson
Night a pulsing beat, and a Fog Day a slow, sad theme. The music, like
everything else, is generated as it plays. Twice a day the PA chimes and
reads out a (not very reassuring) announcement. On your very first day, tips
explain the basics.

### Events

They're decided by the room's seed and the day, so every screen agrees.

| Event | When | What happens |
| --- | --- | --- |
| **Crimson Night** | Every 10th night, and a 1 in 20 chance on any other | Red emergency lighting and a shriek as the lights go. More staff, twice as fast, climbing about 2.2 m at a time. They hit faster but softer, and stay down for less time when shoved. |
| **Fog Day** | Every 15th day, and a 1 in 100 chance on any other | Very short view. The staff hunt in daylight, slowly, but they hit for about 40 and can't be shoved (trying hurts you). |
| **Power Cut** | 3% of days | The lights fail for 90 seconds in the afternoon, and the staff hunt in the dark. |
| **Hailstorm** | 4% of days | From 12:40 to 19:40, hail falls through the open skylights over the garden centres. It hurts every 3 seconds if nothing is over your head. |

## The staff

- **By day** they wander slowly and ignore you.
- **At closing time** they give you about 5 seconds after the lights go out.
- **At night** they wander until they **see you** (line of sight, up to
  32 m) or **hear you** (sprinting within 14 m, or a whistle within 45 m).
  Then they chase at just under sprinting speed, saying things like
  *"Closing time. Closing time."* in a flat voice (spoken by the browser if
  it can, always subtitled).
- **When one spots you, it calls out**: staff within 16 m that aren't busy
  come to look where you were seen.
- **Break their line of sight** and they lose you after 5 seconds. They go
  and look where they last saw you, then give up.
- **They climb** about 1.15 m at a time (Crimson Night: 2.2 m). They also
  scale climbable furniture: shelving racks, bookcases, cube shelves, bunk
  beds and pallets. Their paths go over and around anything you build, so a
  staircase of furniture leads them right up to you. Build high, then take
  your last step away.
- **They punch** when they're within 1.2 m of you and your feet are less
  than 1.6 m above theirs: 7 to 13 damage a punch, about once a second, at
  night. So a wardrobe on open floor is safe, but not one with a dresser
  next to it that they can stand on.
- **Shove** one (click when it's in front of you) to knock it down for about
  2.5 seconds. That's your chance to run.
- **They come in four heights and four builds.** Smaller ones are faster and
  fit through lower gaps. A crouching player fits through gaps none of them
  can.
- **More come as the days go on**: 3 per player at first, growing to 12.
- **The Floor Manager** walks the aisles on Crimson Nights only: one near
  each shopper. Taller, in a dark suit with a clipboard. It's slower, but it
  sees 60 m, hits for 22 to 28, and can't be shoved.
- You can hear them coming: heavy footsteps, louder as they get closer.

## Survival

| | |
| --- | --- |
| Health | 100. **It only comes back from food and first aid.** No regenerating. |
| Hunger | Empties in about 15 minutes, faster while sprinting, twice as fast with no energy. At zero you lose health. |
| Energy | Sprinting, jumping, carrying and whistling use it, and standing still slowly gets it back (lying on a bed or a sofa gets it back nearly four times as fast). With none you can't sprint, throws fall short, and you get hungry faster. |
| Inventory | 16 slots (G). Slots 1 to 8 are the hotbar. Click to use, and right-click (or Q) to put an item down, to stock your base. |
| First aid | +30 health, takes 2.5 seconds to use. |
| Falling | Landing faster than 13 m/s (about a 4 m drop) hurts. |
| Death | You lose your inventory and what you carry, and wake up 40 to 100 m away. A red marker shows where you were caught. |

| Food | Hunger | Energy | Health |
| --- | --- | --- | --- |
| Apple | +12 | +6 | +5 |
| Banana | +14 | +6 | +5 |
| Orange | +10 | +10 | +4 |
| Burger | +20 | +6 | |
| Hot Dog | +18 | +3 | |
| Pizza Slice | +5 | +2 | |
| Bowl of Stew | +30 | +6 | |
| Crisps | +10 | +4 | |
| Doughnut | +9 | +15 | |
| Swirl Pastry | +14 | +15 | |
| Cookie | +8 | +8 | |
| Chocolate Bar | +15 | +18 | |
| Ice Cream | +6 | +13 | |
| Old Beans | +18 | +5 | −10 |
| Fizz Cola | | +17 | |
| Big Fizz (2 L) | | +23 | −5 |
| Water | | +12 | +3 |
| First Aid Kit | | | +30 (2.5 s) |

## Building

- **Pick up** any piece of furniture (E) and carry it. Your view shows a
  green or red ghost where it would go.
- **Furniture stays exactly where you put it**, even in mid-air. Nothing
  falls. That's how you build floating floors and stairs you can take away.
  Hold **Shift** while placing to drop the piece onto whatever is below it
  instead.
- **R** turns it, **T** tilts it: upright, on its back (a pallet becomes a
  wall) or on its side, the
  **mouse wheel** moves it nearer or further, **Q** puts it down at your feet,
  and **F** throws it.
- **Walk-in wardrobes** are hollow. Step in and block the front for a
  last-minute hiding place. Bathtubs are hollow too.
- **Climb** shelving, bookcases, cube shelves, bunk beds and pallets by
  walking into them.
- **Lamps** (floor and table) light up the dark and glow like beacons.
  Carry one at night to see where you're going.

## Controls

| Action | Keyboard / mouse | Touch |
| --- | --- | --- |
| Move / look | WASD or arrows / mouse | left stick / drag on the right |
| Sprint / jump / crouch | Shift / Space / C or Ctrl | Run / Jump / Crouch |
| Pick up, take food, place | E | Grab |
| Place, use selected item, shove | left click | Use |
| Turn / tilt carried piece | R or right click / T | Turn / Tilt |
| Carry nearer or further | mouse wheel | |
| Put down / throw | Q / F | Drop / Throw |
| Hotbar / inventory | 1 to 8, wheel / G | tap a slot (tap again to use) / Bag |
| Whistle | H | Whistle |
| Waypoint / clear waypoints | Z / Shift+Z | |
| First / third person | V | |
| Chat (online) / players | Enter / hold Tab | |
| Controls / pause | F1 / Esc | II |

A game controller works too: the sticks move and look, A jumps, B crouches,
X grabs and places, Y whistles, RT uses or shoves, LT turns, RB tilts, LB
throws, the d-pad picks hotbar slots (up drops, down sets a waypoint), Back
opens the inventory, Start pauses, and clicking the left stick sprints.

In online rooms, chat appears over the speaker's head as well as in the log.

## The store

The floor is split into 24 m chunks, each generated from the room's seed.
Each chunk has pillars on a 12 m grid, a hanging aisle sign, one section, and
four 12 m plots:

| Section | What's there |
| --- | --- |
| Showroom | Room displays with three walls and a coloured back wall: living rooms (TVs), bedrooms (walk-in wardrobes, table lamps), kitchens (a little food), workspaces, kids' rooms (apples, beanbags), bathrooms (bathtubs). Some plots are kids' play areas with climbable slides. |
| Warehouse | 4.4 m climbable pallet racks, and lots of loose pallets, crates and boxes |
| Furniture | Rows of one kind of furniture (lamps and bunk beds included) |
| Market Hall | Low tables of lamps, plants and boxes, the odd snack, and sometimes a snack bar (ice cream, fizzy drinks, crisps) |
| Cafeteria | Rare (4%) and worth finding: long counters piled with food, seating, sometimes a first aid kit |
| Garden Centre | Grass, planters, a tree, patio sets, all under open skylights |
| Stock Room | Crates, boxes and lockers, and sometimes an office floor of desks and filing cabinets |

Some furniture, market and warehouse plots have a **mezzanine**: a deck 3 m
up on four posts, with railings and a staircase. It's a ready-made high
point, if you can keep the stairs clear.

Any plot can instead be a **first aid station** (a kiosk with four kits, 2.5%)
or an **abandoned fort** (a ring of upturned pallets round a lamp, a platform,
and maybe some food left behind, 1.5%). About a third of chunk edges have
full-height walls with doorways. The chunks around the centre have none.

There are 35 kinds of furniture and 18 kinds of food, drink and first aid.
By day, some of the staff carry boxes of stock about.

## Achievements

18 achievements are saved on your device, with a toast when one unlocks and
a list on the menu. Some examples: survive your first night, 7 or 30 nights
in a row, a Crimson Night, a Fog Day, or a Hailstorm without being hit; place
50 or 500 pieces; shove 20 staff; find a cafeteria or an abandoned fort; hide
in a wardrobe at night; walk 1 km.

## Look

Everything is generated in code. There are no image or model files.

- **Surfaces.** Every model is vertex-coloured, and each vertex also says what
  it's made of: paint, wood, fabric, metal, cardboard, plastic, concrete,
  floor, skin or painted steel. One shared material (`mats.js`) uses that to
  pick a procedural detail texture: wood grain, fabric weave, card fibre or
  plaster, generated at start-up. It's projected from world space on all
  three axes, so models need no UVs. The surface type also sets roughness
  and metalness.
- **Ceiling light.** There's a fluorescent fitting every 6 m, forever. They
  aren't real lights. The shader lights each pixel from the nine nearest
  fittings, with a diffuse term and a glossy highlight. That gives pools of
  light on the floor and their reflections in its polish, at a fixed cost
  however far you walk.
- **Night.** The fittings go out, except one in nine emergency fittings that
  glow orange, and the edges of the screen darken. Staff eyes glow red. Your
  torch (F) is a real spotlight.
- **Contact shadows.** A soft shadow sits under every piece of furniture
  (one instanced mesh) and around the base of every pillar, wall, rack and
  counter (merged per chunk). Surfaces also darken slightly where they meet
  the floor.
- **Everything else.** Speckled vinyl floor tiles with scuffs, acoustic
  ceiling tiles, feature-coloured back walls in the showrooms, a generic
  room environment map for reflections on metal, ACES tone mapping, and
  dust drifting in the light. The camera bobs when you walk, widens when you
  sprint, dips when you land and shakes when you're hit. Hotbar icons are
  rendered from the item models.

## Multiplayer design

There's no game server. The realtime service only relays messages and
tracks who is in each room. So one screen, the **host** (whoever has been in
the room longest), runs:

- the clock (day, time; events follow from the seed);
- all the staff: path finding, attacks, breaking furniture;
- every change to furniture and food. Other players send requests ("take
  this", "put it here", "drop this food"). The host applies them and
  broadcasts the result. Nothing falls, so a piece stays wherever it was put.

Everyone simulates their own shopper and sends its position 10 times a
second. Staff positions go out 8 times a second, and the clock once a
second. Other players and staff are drawn about 130 ms behind, smoothly
interpolated.

The store itself is never sent: every screen generates the same chunks from
the room's seed. Only *changes* travel, and every screen keeps the full list.
A newcomer asks the host for that list when they join. When the host leaves,
the next-oldest player already has everything and takes over the clock and
the staff.

| Message | From | What |
| --- | --- | --- |
| `p` | everyone | own position, facing, carried piece, health, nights |
| `q` | guests | request to the host: `take` / `place` |
| `w` | host | furniture and food changes |
| `s` | host | staff snapshot |
| `g` | host | clock |
| `h` | host | a member of staff hit a player |
| `c` | everyone | chat (120 characters, plain text) |
| `x` | everyone | "I was caught" |
| `pu` | anyone | shove a member of staff (to the host) |
| `wh` | anyone | I whistled here (the host lets the staff hear it) |
| `need` / `full` | newcomer / host | the list of changes, in parts |

Furniture and staff are cheap to draw: each furniture model (type and
colour) is one `InstancedMesh`, and each chunk's static shelving, walls and
pillars are merged into one mesh. A view of 25 chunks (over 1,000 pieces) is
about 130 draw calls.

## Develop

The source lives in `src/` as plain ES modules. Serve the folder and open
`src/index.html`:

```bash
python3 -m http.server 8790
```

Then open <http://localhost:8790/src/>. Three.js loads from jsDelivr through
the import map, pinned to the version the build bundles.

To build the single-file `index.html`:

```bash
cd tools && npm install && npm run build
```

### Code layout

| File (in `src/js/` unless noted) | What it does |
| --- | --- |
| `main.js` | Entry point: menus, game loop, player, interaction, host logic, HUD, test hook (`window.__game`) |
| `world.js` | Chunk generation, sections, collision boxes, items, spatial hash, instanced drawing, shared state |
| `furniture.js` | Furniture (with hollow collision parts, tilting) and food definitions and models; what each place stocks |
| `staff.js` | Staff AI (host only): spawning, senses, path finding over standing surfaces with climbing, attacks, shoves, sizes |
| `physics.js` | Standing-body movement against boxes: step-up, climbing, gravity, ceilings |
| `net.js` | Rooms, presence, host election, messages |
| `env.js` | Day/night timing, the week and restocks, events, store clock, lighting levels |
| `models.js` | Shopper and staff models, walk cycle, name tags, carried furniture |
| `mats.js` | Surface types, detail texture, the store material (shader patch with ceiling lighting), contact shadows, light fittings, dust |
| `geo.js` | Merged vertex-coloured geometry from boxes and cylinders |
| `input.js` | Keyboard, mouse (pointer lock) and touch controls |
| `audio.js` | All sound and music, synthesised with Web Audio |
| `rng.js` | Seeded hashing and random numbers |
| `achievements.js` | The achievements, their counters, and saving them |
| `tools/build.mjs` | Builds the single-file `index.html` |
| `tools/test.cjs` | Solo smoke test (see below) |
| `tools/test-mp.cjs`, `tools/mock-rt.js` | Two-player test with a stand-in realtime server |
| `tools/shots.cjs` | Screenshots of the look: day, close-up, night, lamps, staff, Crimson Night, Fog Day, Floor Manager, hail, third person |
| `tools/soak.cjs` | Runs through every day and night transition and event, checking for errors |

### Testing

Serve the folder on port 8790 first. Add `--src` to test `src/` instead of
the built file.

```bash
node tools/test.cjs <screenshot-dir>
node tools/test-mp.cjs <screenshot-dir>
```

`test.cjs` starts solo play and checks:

- picking up, carrying and placing; third person; night arriving;
- eating, placing a tilted piece in mid-air (it stays), shoving staff down,
  standing room inside a wardrobe, throwing, dropping food, crouching, hail
  hurting you under a skylight, and the Monday and Friday restock days;
- that the staff can't reach you on a wardrobe, or on two stacked crates,
  but can on the floor, and climb up to you once there's a step beside the
  crates;
- that there are no console errors.

The test machine has no GPU, so the game runs slowly there. The checks wait
on game time rather than wall-clock time.

`soak.cjs` jumps the clock through every kind of transition (dawn, closing
time, Crimson Night, Fog Day, power cut, hailstorm, a whole week) and fails
on any page error.

`test-mp.cjs` opens two pages that share `mock-rt.js` (BroadcastChannel in
place of the realtime server). It checks:

- joining by code, the same seed on both screens, and late joiners getting
  earlier changes;
- carrying and placing furniture on the host and the guest;
- the host's staff, clock and hits reaching the guest;
- chat arriving with a bubble over the speaker;
- the guest taking over as host, with the store's changes kept and anything
  the old host was carrying let go, when the host leaves.

## Not done yet

- Not on the arcade site yet. It isn't linked from the site's game list.
- No persistent bases between sessions: a room's store lasts as long as
  someone is in it.
- Staff don't pile on top of each other, and there are no special staff.
- Furniture snaps to quarter turns (no diagonal ramps).
- Touch controls have only been checked in an emulated iPhone.
- If frames run slow for a few seconds, the game draws at a lower resolution
  until they're quick again.
