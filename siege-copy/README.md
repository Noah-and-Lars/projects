# Siege

> **Work copy.** This folder is a copy of `siege/` for a realistic look: photo textures, real furniture models and
> lighting baked in Blender (see `blender/README.md`). It plays exactly like Siege: same maps, collision and bots.
> The live game is still `siege/`.

A 5v5 tactical shooter in a single HTML file. Attackers against defenders, one life a round: attackers drone the building, breach in and plant the defuser; defenders reinforce, barricade and set traps. Walls break, and information wins.

Play it at https://noah-and-lars.github.io/projects/siege/ (or from the arcade). Siege started as a mode in Cube Assault 3.0 and became its own game in 1.0. Keyboard and mouse only.

## A round

- **Operator pick (20 s):** choose one of your side's 10 operators (each one once per team). Attackers also choose a spawn.
- **Prep (45 s):** attackers drive drones (press 5 for the next one). The bomb site only shows up for their team once a drone or an attacker has seen it. Click to mark defenders. Defenders reinforce walls and hatches (hold F, 2 each), barricade doors and windows (hold F, 2 each), place gadgets, watch the cameras (5) and shoot drones.
- **Action (3 min):** whoever carries the defuser plants it next to a bomb (hold F, 6 s). It drops where its carrier goes down. Attackers win if it runs for 45 s or every defender is out; defenders win when time runs out, every attacker is out, or they disable it (hold F, 6 s).
- First to 4 rounds (3 or 5 in private rooms); sides swap at half time.

## Destruction

Drywall, barricades and hatches are made of pieces that break one by one, and bullets go through drywall. Explosives open whole sections. Reinforced steel only gives way to the Thermal Lance, the Piston Breacher and the Cutting Torch. Shock rods destroy charges on their wall, jammers block them and kill drones, and an EMP shuts defender electronics down for 12 s.

## Operators

| Attack | Gadget (X) | Defence | Gadget (X) |
|---|---|---|---|
| Torch | Thermal Lance: burns through a whole wall, even steel | Glass | Black Mirror: one-way bulletproof window |
| Static | EMP Grenade | Volt | Shock Rods: electrify a wall or hatch |
| Spike | Piston Breacher: a walk-through hole, even in steel | Shoji | Foam Kunai: bulletproof foam barriers |
| Wisp | Cutting Torch: melts steel and planks piece by piece | Hush | Signal Jammer |
| Tripwire | Gust Mines: blast defenders off their feet | Murk | Toxic Canister: remote poison gas |
| Oracle | Pulse Scan: shows defenders who move | Warden | Active Defense: shoots down grenades |
| Hex | Signal Hack: phones ring, and Hex can watch the cameras | Bramble | Thorn Bloom: proximity spike mine |
| Breaker | Skeleton Key: under-barrel breaching shotgun | Dread | Dread Mine: blinding black fog |
| Vesper | Sonar Pulse: see defenders through walls | Bulwark | Riot Shield with a taser |
| Mirage | Holo Double: walk a hologram of yourself | Mender | Med Station: heals anyone nearby |

Everyone also has a secondary gadget (G): breach charges, frags, smoke or stun grenades, claymores, barbed wire, deployable shields, impact grenades, nitro cells, bulletproof cameras or proximity alarms.

## Maps

- **Marlowe Hotel:** grand lobby with a gallery, bar, kitchen, restaurant, ballroom, penthouse office and records room. Two floors.
- **Port Authority:** customs offices, a bonded warehouse and a basement with the vault. Basement and ground floor.
- **Ashgrove Manor:** an old family house with a garage, greenhouse, billiards room, dining room and bedrooms upstairs.

Each has three pairs of bomb sites, stairs, hatches and five defender cameras.

## Keys

WASD move, Shift sprint, C / Ctrl crouch, Q / E lean, mouse to shoot (right-click to aim), R reload, 1 / 2 guns, X operator gadget, G secondary gadget, hold F to reinforce / barricade / plant / disable, 5 drones or cameras, V melee, Tab scoreboard, Enter chat, Esc menu.

## Playing

- **Vs bots:** offline, starts as a full 5v5 (you plus four bots against five). Remove or add bots in the lobby before you start.
- **Online:** quick match, a private room with a 5-letter code, or a room from the open list. Rooms start without bots: the host adds them to either team with Add bot and removes them with the cross. If the host leaves, the next player takes over. Online play only works on the arcade website.
- **Profile:** matches earn experience (300 for a win, 100 for a loss, 40 per kill, 25 per round won; half against bots). Your name comes from your arcade account, and your `siege.*` saves sync with it.

## Code

- One HTML file: three.js r128 (MIT) and the Russo One and Barlow fonts (SIL OFL) embedded, `<script id="sg-base">` (renderer, saves, sound, the online check), `<script id="sg-guns">` (first-person guns and hands, shared with Cube Assault) and `<script id="siege">` (the game, in one closure; its data tables are frozen).
- Maps are cell grids in `SG_MAPS`: rooms as rectangles, walls between rooms appear by themselves, doors and windows are listed per edge. Furniture is placed from a seed so every player gets the same rooms, and the lighting is baked into the walls when a map loads.
- Online: rooms `csiege-lobby` and `csiege-<code>` on the arcade's realtime server (`rt.js`). The host runs the clock, the bots and the round result; every player owns their own movement, shots and health.
- On a local copy (localhost), `window.__sg` is a test handle: `__sg.step(n)` advances the game by n frames.

## Graphics credits (work copy)

Photo textures from Poly Haven and ambientCG, furniture models from Poly Haven, people from MakeHuman's data (body, skins, clothes, boots, gloves). All CC0 (public domain). The models were reduced and their materials and shadows baked in Blender; the map lighting is baked in Blender Cycles.
