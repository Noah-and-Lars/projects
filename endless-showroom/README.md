# Endless Showroom

A multiplayer survival game set in an endless furniture store. It's for the
browser and built with [Three.js](https://threejs.org/). The store has no
exits. By day the staff wander about and leave you alone. At night the lights
go down and they hunt shoppers. Gather food, carry furniture around to build
towers and forts, and see how many nights you can last, alone or with up to
7 friends.

It's an original game in the "infinite store" survival genre. The name,
store layout, characters, furniture models, sounds and UI were all made for
this game. No assets come from other games.

## Play

`index.html` is the whole game in one file. Solo play works offline. Online
play loads the arcade's realtime client (`rt.js`, the same Cloudflare Worker
the other arcade games use) when you choose an online mode, and like the
other games it needs an online Arcade account.

- **Play Online**: joins the first public store with room (`pub1` to `pub20`,
  8 players each).
- **Create Private Room**: makes a 4-letter code to give to friends.
- **Join**: type a friend's code.
- **Play Solo**: your own store, no connection needed.

Don't edit `index.html` by hand. It's generated from `src/`.

## Rules

| | |
| --- | --- |
| Day | 6 minutes (08:00 to 22:00 on the clock). Staff are harmless. |
| Night | 3 minutes (22:00 to 08:00). Staff hunt the nearest shopper within 40 m and hit for 15. |
| Staff limits | They can't climb, jump or step up more than 36 cm. A shopper standing 1.3 m or more above them can't be hit. |
| Forts | A staff member who can't find a path to you starts breaking the furniture in the way (6 hp a second each). |
| Health | 100. Comes back slowly while your hunger is above 45 and you haven't been hit for 6 s. |
| Hunger | Empties in about 10 minutes (faster when sprinting). At zero you lose health. |
| Stamina | For sprinting. Energy bars and soda refill it. |
| Food | Picked up into a 5-slot hotbar. Food restocks every morning. First aid kits heal 60. |
| Falling | Landing faster than 13 m/s (about a 4 m drop) hurts. |
| Death | You lose what you carry, wake up 30 to 70 m away, and your night count resets. |

You can jump about 1.2 m. That's enough to climb onto a crate, bed or table,
but not straight onto a wardrobe, so build steps.

### Events

From day 2, some days bring an event. It's decided by the room's seed and
the day, so every screen agrees:

- **Fog**: very short view distance all day.
- **Power Cut**: the lights fail for 80 seconds in the afternoon, and the staff
  hunt in the dark.
- **Overtime**: 9 staff per shopper instead of 6 tonight. They're faster and
  hit for 20.
- **Calm Night**: 3 staff per shopper tonight.

## Controls

| Action | Keyboard / mouse | Touch |
| --- | --- | --- |
| Move | WASD / arrows | left stick |
| Look | mouse | drag on the right |
| Sprint | Shift | Run |
| Jump | Space | Jump |
| Pick up furniture / take food / place | E | Grab |
| Place / eat the selected item | left click | Use |
| Rotate carried piece | R / right click | Turn |
| Drop carried piece in front of you | Q | |
| Hotbar slot | 1 to 5 / wheel | tap a slot (tap again to use) |
| Torch | F | Torch |
| First / third person | V | |
| Chat (online) | T / Enter | |
| Players | hold Tab | |
| Controls | H | |
| Pause | Esc | II |

## The store

The floor is split into 24 m chunks, each generated from the room's seed.
Every chunk has pillars on a 12 m grid, a hanging aisle sign (like
`AISLE E3 · S2`, so you can tell friends where you are) and one of these
sections:

| Section | What's there |
| --- | --- |
| Showroom | Room displays with three walls: living rooms, bedrooms, kitchens, workspaces and kids' rooms |
| Warehouse | 4.4 m pallet racks with stock on them, plus loose crates and boxes |
| Furniture | Rows of one kind of furniture |
| Market Hall | Low tables with food on them |
| Food Court | A serving counter with lots of food, and tables and chairs |
| Stock Room | Crates and boxes, sometimes lockers |

About a third of chunk edges have full-height walls with doorways. The
chunks around the spawn have none.

There are 26 kinds of furniture, from rugs (20 hp) to wardrobes and fridges
(200 to 220 hp), and 10 kinds of food and supplies.

## Multiplayer design

There's no game server. The realtime service only relays messages and
tracks who is in each room. So one screen, the **host** (whoever has been in
the room longest), runs:

- the clock (day, time; events follow from the seed);
- all the staff: path finding, attacks, breaking furniture;
- every change to furniture and food. Other players send requests ("take
  this", "put it here"). The host applies them, settles anything that lost
  its support, and broadcasts the result.

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
| `furniture.js` | Furniture and food definitions and models |
| `staff.js` | Staff AI (host only): spawning, grid path finding, attacks, breaking furniture |
| `physics.js` | Standing-body movement against boxes: step-up, gravity, ceilings |
| `net.js` | Rooms, presence, host election, messages |
| `env.js` | Day/night timing, events, store clock, lighting levels |
| `models.js` | Shopper and staff models, walk cycle, name tags, carried furniture |
| `geo.js` | Merged vertex-coloured geometry from boxes and cylinders |
| `input.js` | Keyboard, mouse (pointer lock) and touch controls |
| `audio.js` | All sound, synthesised with Web Audio |
| `rng.js` | Seeded hashing and random numbers |
| `tools/build.mjs` | Builds the single-file `index.html` |
| `tools/test.cjs` | Solo smoke test (see below) |
| `tools/test-mp.cjs`, `tools/mock-rt.js` | Two-player test with a stand-in realtime server |

### Testing

Serve the folder on port 8790 first. Add `--src` to test `src/` instead of
the built file.

```bash
node tools/test.cjs <screenshot-dir>
node tools/test-mp.cjs <screenshot-dir>
```

`test.cjs` starts solo play, walks, picks up and places furniture, checks
third person, skips to night, eats, and checks that the staff can't reach you
on a wardrobe but can on the floor. It fails on any console error.

`test-mp.cjs` opens two pages that share `mock-rt.js` (BroadcastChannel in
place of the realtime server). It checks:

- joining by code, the same seed on both screens, and late joiners getting
  earlier changes;
- carrying and placing furniture on the host and the guest;
- the host's staff, clock and hits reaching the guest;
- the guest taking over as host, with the store's changes kept, when the
  host leaves.

## Not done yet

- Not on the arcade site yet. It isn't linked from the site's game list.
- No persistent bases between sessions: a room's store lasts as long as
  someone is in it.
- Only furniture is breakable. Walls, racks and counters are not.
- Touch controls work, but they've only been checked in an emulated iPhone,
  not on real devices.
