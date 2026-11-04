# Siege

A 5v5 tactical shooter in a single HTML file. Attackers against defenders, one life a round: attackers drone the building, breach in and plant the defuser; defenders reinforce, barricade and set traps. Walls break, and information wins.

Play it at https://noah-and-lars.github.io/projects/siege/ (or from the arcade). Siege started as a mode in Cube Assault 3.0 and became its own game in 1.0. Keyboard and mouse only.

## A round

- **Operator pick (20 s):** choose one of your side's 10 operators (each one once per team). Attackers also choose a spawn.
- **Prep (45 s):** attackers drive their drone (one each; Shift boosts it for 5 seconds, three times a round, and Space hops). The bomb site only shows up for their team once a drone or an attacker has seen it. Click to mark defenders. Defenders reinforce walls and hatches (hold F, 10 for the team), barricade doors and windows (hold F, 5 each), place gadgets, watch the cameras (5) and shoot drones.
- **Action (3 min):** whoever carries the defuser plants it next to a bomb (hold F, 7 s). It drops where its carrier goes down. Attackers win if it runs for 45 s or every defender is out; defenders win when time runs out, every attacker is out, or they disable it (hold F, 7 s).
- First to 4 rounds (3 or 5 in private rooms); sides swap at half time.

## Sound icons

Sounds that tell you something (gunfire, explosions, footsteps, ringing phones, alarms, beeping traps, torches, hammering) show an icon on the exact spot they come from, within the distance you would hear them, so you can play without sound. Settings turns them off. Crouch to move without footsteps.

## When you are out

Press 5 to switch between watching your teammates and the cameras (defenders: the map cameras and bulletproof cameras; attackers: the team's drones). A / D switch, the mouse looks round, and a click marks the enemy you are looking at. Attacking bots shoot out cameras they see.

## Loadouts and rappelling

On the operator screen, choose one of each operator's two primary guns and one of their two gadgets (kept for next time). Attackers can rappel: Space facing an outside wall, W / S up and down, A / D along the wall, shoot as usual, F at a window to go in (kicking any barricade through), Space to let go. W at the top of a wall climbs onto the roof (since 1.0.12 every roof is walkable, with two hatches into the top floor); Space at a roof's edge takes you back down the outside.

## Down but not out

Since 1.0.5 a lethal hit that isn't a headshot puts you down while a teammate is still standing: crawl, bleed out in 25 s, or get revived by a teammate holding F for 4 s. The last one standing goes straight out. Overtime: at 3 all the match goes to first to 5, with sides swapping every round.

## Moving

There is no jumping (since 1.0.3). Walk into an open window, a counter, a railing or low furniture and you climb over it on your own, so every place in every map is reachable on foot. Nobody can be hurt during the prep phase.

## Destruction

Drywall and hatches are made of pieces that break one by one. Bullets go through drywall (up to two walls, weaker each time) and leave holes on both sides; about five rifle rounds knock a piece out, and a punch (V) knocks out just the piece you hit. A barricade is one solid board (since 1.0.7): every bullet through it leaves a hole you can see and shoot through, two melee hits or a shotgun blast or two bring it down, and it falls apart once about half of it is holes. Explosives open whole sections. Reinforced steel only gives way to the Thermal Lance, the Piston Breacher and the Cutting Torch. Shock rods destroy charges on their wall, jammers block them and kill drones, and an EMP shuts defender electronics down for 12 s.

## Operators

| Attack | Gadget (X) | Defence | Gadget (X) |
|---|---|---|---|
| Torch | Thermal Lance: burns through a whole wall, even steel | Glass | Black Mirror: one-way bulletproof window |
| Static | EMP Grenade | Volt | Shock Rods: electrify a wall or hatch |
| Spike | Piston Breacher: a walk-through hole, even in steel | Shoji | Foam Kunai: bulletproof foam barriers |
| Wisp | Cutting Torch: melts steel and planks piece by piece | Hush | Signal Jammer |
| Tripwire | Gust Mines: blast defenders off their feet | Murk | Toxic Canister: remote poison gas (X sets them off, Shift + X throws another) |
| Oracle | Pulse Scan: shows defenders who move | Warden | Active Defense: shoots down grenades |
| Hex | Signal Hack: phones ring, and Hex can watch the cameras | Bramble | Thorn Bloom: proximity spike mine |
| Breaker | Skeleton Key: under-barrel breaching shotgun | Dread | Dread Mine: blinding black fog |
| Vesper | Sonar Pulse: see defenders through walls | Bulwark | Riot Shield with a taser |
| Mirage | Holo Double: walk a hologram of yourself | Mender | Med Station: heals anyone nearby |

Everyone also has a secondary gadget (G): breach charges, frags, smoke or stun grenades, claymores, barbed wire, deployable shields, impact grenades, nitro cells, bulletproof cameras or proximity alarms.

## Maps

Since 1.0.12 some attackers' yards are open to the sky (hotel: Service Dock, Upper Parking; port: Loading Dock, Customs Yard; manor: Terrace), so their walls can be climbed to the roof.

- **Marlowe Hotel:** grand lobby with a gallery, bar, kitchen, restaurant, ballroom, penthouse office and records room. Two floors.
- **Port Authority:** customs offices, a bonded warehouse and a basement with the vault. Basement and ground floor.
- **Ashgrove Manor:** an old family house with a garage, greenhouse, billiards room, dining room and bedrooms upstairs.
- **Oregons** (1.0.4, daylight; first called Ridgeback Ranch): a survivalist compound on the plains. Chapel hall, mess hall and kitchen, a silo stair tower and a lookout tower, bunk rooms and a nursery upstairs, a wash room, canning store and furnace room in the cellars, and a storm tunnel under the scrap yard.

Each has three pairs of bomb sites, stairs, hatches and five defender cameras.

## Keys

WASD move, Shift sprint, Space rappel (attackers, at an outside wall), C / Ctrl crouch, Q / E lean, mouse to shoot (right-click to aim: a click toggles it, or hold it if you pick Hold in Settings), R reload, 1 / 2 guns, X operator gadget, G secondary gadget, hold F to reinforce / barricade / plant / disable, 5 drones or cameras (Space hops a drone), V melee, Tab scoreboard, Enter or T chat (Y for team only, Tab switches while typing), Esc menu.

## Playing

- **Vs bots:** offline, starts as a full 5v5 (you plus four bots against five). Remove or add bots in the lobby before you start.
- **Online:** quick match, a private room with a 5-letter code, or a room from the open list. Rooms start without bots: the host adds them to either team with Add bot and removes them with the cross. If the host leaves, the next player takes over. Online play only works on the arcade website.
- **Profile:** matches earn experience (300 for a win, 100 for a loss, 40 per kill, 25 per round won; half against bots). Your name comes from your arcade account, and your `siege.*` saves sync with it.

## Code

- One HTML file: three.js r128 (MIT) and the Russo One and Barlow fonts (SIL OFL) embedded, `<script id="sg-base">` (renderer, saves, sound, the online check), `<script id="sg-guns">` (first-person guns and hands, shared with Cube Assault) and `<script id="siege">` (the game, in one closure; its data tables are frozen).
- Maps are cell grids in `SG_MAPS`: rooms as rectangles, walls between rooms appear by themselves, doors and windows are listed per edge. Furniture is placed from a seed so every player gets the same rooms, and the lighting is baked into the walls when a map loads.
- Online: rooms `csiege-lobby` and `csiege-<code>` on the arcade's realtime server (`rt.js`). The host runs the clock, the bots and the round result; every player owns their own movement, shots and health.
- Chat (1.0.2): 'chat' on the room channel, `{ i, m, tm }` (`tm` = team only; the other team's screens drop it). Works in the lobby, operator pick and the round. `sgSay()` sends, `EV.chat` receives, `window.sgChat` draws (textContent only). `sgTidy()` is the Global chat's swear filter; 5 messages per 10 s to send, more than 8 per 10 s from someone is ignored.
- On a local copy (localhost), `window.__sg` is a test handle: `__sg.step(n)` advances the game by n frames.
