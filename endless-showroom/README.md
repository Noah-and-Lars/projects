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
  8 players each). A public store is **this week's store**: the same store
  for everyone from the start of Sunday to the end of Saturday (Sydney time),
  and what's built in it stays when everyone leaves. It's only reset at the
  start of Sunday, when everyone in it moves into the new week's fresh store.
  Public stores always run normal-length days.
- **Create Private Room**: makes a 4-letter code to give to friends.
- **Join**: type a friend's code.
- **New Solo Store**: your own store, no connection needed. It's saved
  every 20 seconds and when you leave, and **Continue Solo** picks it up again
  (the day, every piece you moved, your stats, inventory and waypoints).

Under **Days** on the menu you can pick **Normal** (6 minute days, 5 minute
nights) or **Short** (3 and 2.5 minutes) for any store you start, solo or a
room you create. Everyone in the room plays to the host's choice.

Everyone starts somewhere random in the store. Whistle (H) to find each
other (see [Whistling](#whistling)), and read the aisle signs (`AISLE E3 · S2`) to say where you are. Pick a
shirt colour on the menu so friends can tell you apart.

Don't edit `index.html` by hand. It's generated from `src/`.

## Whistling

Every shopper can whistle; it isn't an item.

- **Tap H** for a short two-note whistle ("over here"). **Hold H** for a long
  one ("help!"): a rising call, a held note and a fall.
- Everyone within **400 m** sees a **!** marker with your name where you
  whistled, with the distance, for 5 seconds (8 for a long whistle, which
  shows as **!! name needs help** and pulses red). If the spot is off the
  screen or behind them, the marker sits at the edge of the screen with an
  arrow pointing the way. The chat log also says who whistled, how far away
  and which way ("64 m behind you to the left").
- They **hear** it if they're within 140 m (200 m for a long whistle),
  panned to the side it came from and more muffled the further away it is.
  A speech bubble pops up over the whistler.
- **At night the staff hear it too** and come to look where you whistled:
  within 45 m, or 70 m for a long whistle. By day it's safe. You can use it to
  pull them somewhere, or give yourself away.
- **25 seconds** between whistles. A whistle costs 2 energy, a long one 4.
- Friends' names also show faintly through the shelves when they're within
  about 90 m.

On a phone or tablet the whistle is a button (hold it for a long whistle); on
a controller it's Y.

## The week

| | |
| --- | --- |
| Day | 6 minutes, 08:00 to 22:00 on the clock. The staff are harmless. The last 5 seconds tick down. |
| Night | 5 minutes on the first night, and **4 seconds longer every night after** (day 10: 5 min 36 s; day 60: about 9 minutes). 22:00 to 08:00 on the clock. The overhead lights cut out with a clunk, and only the emergency lights (orange) and lamps stay lit. |
| Week | Days run Monday to Sunday. **Food and first aid restock at the start of every Monday and Friday**, not daily. Food is plentiful: wherever the store stocks something, there are usually four of it together. |

There are no special days: just day and night, every day.

Each weekday has its own gentle tune, and the odd Friday plays a livelier
take on it. Night has a low drone; being hunted brings in a pulsing chase
beat; when you're badly hurt everything goes slow and muffled. The music,
like everything else, is generated as it plays. Twice a day the PA chimes and
reads out a (not very reassuring) announcement. On your very first day, tips
explain the basics, and now and then a tip shows in the chat (Settings can
turn that off).

## The staff

- **By day** they wander slowly and ignore you.
- **At closing time** they give you about 5 seconds after the lights go out.
- **At night** they wander until they **see you** (line of sight, up to
  32 m) or **hear you** (sprinting within 14 m, a whistle within 45 m, a long
  whistle within 70 m, or a noisy toy).
  Then they chase about as fast as you can sprint (the small ones faster, the
  big ones a little slower), so running alone rarely loses them, saying things like
  *"Closing time. Closing time."* in a flat voice (spoken by the browser if
  it can, always subtitled).
- **When one spots you, it calls out**: staff within 16 m that aren't busy
  come to look where you were seen.
- **Break their line of sight** and they lose you after 5 seconds. They go
  and look where they last saw you, then give up.
- **They climb** about 1.15 m at a time. Like you, they
  can't scale shelving, only ladders. Their paths go over and around anything you build, so a
  staircase of furniture leads them right up to you. Build high, then take
  your last step away.
- **They punch** when they're within 1.2 m of you and your feet are less
  than 1.6 m above theirs: 7 to 13 damage a punch, about once a second, at
  night. So a wardrobe on open floor is safe, but not one with a dresser
  next to it that they can stand on.
- **Shove** one (click when it's in front of you) to knock it down for about
  2.5 seconds. That's your chance to run. Each shove costs 4 to 8 energy,
  and with less than 4 you're too tired to shove at all.
- **They see through gaps**: pallets, coffee tables, side tables, ladders,
  wire racks and slides don't hide you. Build with solid pieces.
- **They can't open doors.** A closed door is a wall to them.
- **They come in four heights and four builds.** Smaller ones are faster and
  fit through lower gaps. A crouching player fits through gaps none of them
  can.
- **More come as the days go on**: 3 per player at first, growing to 12.
- You can hear them coming: heavy footsteps, louder as they get closer.

## Survival

| | |
| --- | --- |
| Health | 100. **It only comes back from food and first aid.** No regenerating. |
| Energy | **Sprinting burns it** (faster the more hurt you are); jumping, sliding, whistling, throwing and shoving cost extra. **It comes back by itself** a moment after you stop sprinting: quickly standing still (about 2 a second), slowly walking, more slowly carrying something, and more slowly still the hungrier or more hurt you are. Starving, it doesn't come back at all. Food and drink give it back at once. With none you can't sprint, slide or shove, throws fall short, and you get hungry twice as fast. |
| Hunger | Runs down more slowly than energy, faster the less energy you have. At zero you lose health quickly, and your stomach growls below 10. |
| Badly hurt | At 10 health or less you hear your heartbeat, your vision clouds over and the music goes quiet. |
| Inventory | 16 slots (G). Slots 1 to 8 are the hotbar. Click to use, and right-click (or Q) to put an item down, to stock your base. **Drop all** (the button in the inventory, or Shift+Q) puts everything down in a little pile at your feet. |
| First aid | +30 health, takes 2.5 seconds to use. |
| Sitting | Press **F** on a chair, stool, bench, sofa, armchair, ottoman, beanbag, bed or mattress to sit on it, where you aim along it. You get your breath back half again as fast sitting (3 energy a second). Move, jump or crouch to stand up; you step off the front, or wherever there's room. You can't sit on something lying on its side or with something just above the seat. |
| Falling | Landing faster than 13 m/s (about a 4 m drop) hurts. Landing **on top of** a bed, sofa, armchair, ottoman or mattress softens it a lot; a **beanbag** or an **exercise ball** softens it from any side, even more, and a **giant plush bear** takes the whole fall. A long drop onto a bed bounces you. |
| Death | You lose your inventory and what you carry. The screen shows what you did that life (furniture placed, staff shoved, things eaten, your favourite food, distance walked, your highest point); press **Wake up** (or Space) to wake 40 to 100 m away. A red marker shows where you were caught. |

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
| Vintage Fizz (a rarer can, the same as Fizz Cola) | | +17 | |
| Slice of Cake (cafeterias) | +20 | +15 | |
| Big Fizz (2 L) | | +23 | −5 |
| Water | | +12 | +3 |
| Cinnamon Swirl | +14 | +15 | |
| Lemon | +10 | +10 | +4 |
| Lemon Slice | +5 | +5 | +2 |
| Fish-Shaped Crackers | +18 | +2 | |
| Broken Glass | | | −33 (don't) |
| First Aid Kit | | | +30 (2.5 s) |

## Building

- **Grab** any piece of furniture by **holding E** for half a second (heavy
  pieces like crates, fridges, bathtubs and the billiards table take longer;
  the store safe takes about five and a half minutes). It floats in front of you where you
  aim, swinging after your view with a little lag, and everyone online sees
  it there. It passes through things while you hold it, so you can push it
  into a wall or into another piece.
- **Rotate** it with **R**, about the axis you pick with **1**, **2** or
  **3** (or **T** to cycle): 1 tips it toward you, 2 spins it upright, 3
  rolls it side to side. A press turns it 45°; hold **Ctrl** (or **Alt**) for 15° or
  **Shift** for 90°. **Ctrl+Shift+R** squares it back up. Any angle works, so
  you can lean a bookcase into a ramp or stand a pallet on end as a wall.
- **Let go** with E, a click or Q. If the piece is **touching anything** (the
  floor, a wall, a pillar or other furniture) it stays exactly
  there, fixed, with a thunk. That's how you build floating floors and
  stairs you can take away: hold the next piece so it touches the last one.
  Let go **in mid-air** and it falls with its own physics: it keeps the way
  your hands were moving it, tumbles, bounces and slides, and knocks against
  the floor, walls, pillars, racks and other furniture. A chair dropped on one
  corner tips over, a wardrobe let go leaning too far falls flat on its back,
  a box hanging mostly over a table edge stays on the table and one hanging
  mostly off it doesn't. Wherever it comes to rest, in whatever pose, is where
  it stays (unanchored), and anything that fell drops again if you take away
  what holds it up. The outline is
  green when it'll stay put, white when it'll drop, and red when it's
  overlapping someone (you, a friend or a member of staff): you can't let go of
  it there.
- The **mouse wheel** moves it closer or farther (1.5 to 4.5 m from you). **Hold F** to wind up a
  throw and let go of F to throw it: the longer you hold, the further it
  goes. It leaves your hands turning end over end and lands, bounces and
  tumbles by the same physics. Settings can snap held pieces to a 25 cm, 50 cm or 1 m grid.
- **Get lifted**: a friend can put a piece they're holding under your feet
  and raise it, and you go up with it. You can't ride a piece you're holding
  yourself (you walk through it), and while you're carrying something, other
  people's held pieces don't hold you up either, so nobody can fly.
- **Walk-in wardrobes** are hollow. Step in and block the front for a
  last-minute hiding place. Bathtubs are hollow too.
- **Shelving can't be climbed.** Racks, bookcases, cube shelves and bunk
  beds are just walls to you: the only way up is to build. Stack furniture
  into steps you can jump (about 1.2 m at a time), get a friend to lift you, or carry
  a ladder over and walk into it to climb it.
- **Lamps** (floor and table) light up the dark and glow like beacons.
  Carry one at night to see where you're going, or press **F** on one to
  switch it off so it doesn't give you away.
- **Doors** open and close with **F**. The staff can't open them.
- **Screens**: five kinds of TV (flat-screen on a foot, wall-mounted, curved
  wall-mounted, box, and a monitor-sized mini TV) and arcade cabinets switch on
  with F, and a screen that's on gives off a soft blue light in the dark. A TV comes on to one of 24 channels (a summer field, colour bars, the
  city at night, a boat at sea, the weather, the news, football, a sunset, an
  aquarium, mountains, space, a cooking show, a cat, a quiz show, a racing
  game, a forest, fireworks, the store's own advert, a test pattern, a rainy
  street, a desert, a cartoon, a bird, static), and about one in five is
  already on when you find it. A lit screen glows in the dark. Wall TVs stay up
  when you put them against a wall.
- **Lights**: floor lamps, table lamps, warm table lamps, green and purple
  lamps, industrial, modern, triple and arc lamps, a thin LED light, desk lamps,
  lanterns, candles, night lights, small and tall work lights, garden lamps,
  ceiling lamps (they hang from a high fitting in the rooms) and wall
  lights (put one against a wall). Every light switches on and off with F and
  lights the dark around it. **Colour lights** (the pencil lamp, the mood globe
  and light strips) step through six colours and then a slow fade through all
  of them; their light takes their colour. Toilets flush, microwaves and toasters ding.
- **Light strips** dropped touching each other link up: change one and they
  all change.
- **Record players** play a little tune you can hear nearby.
- **Gift boxes** open (F) into something: usually food, sometimes a first aid
  kit or a head torch. **Foam dice** roll (and tell everyone the number), and
  the big red button does... something.
- **Head torch**: an inventory item. Select it and click to switch it on; it
  lights the way while it's in your hand, and friends see its light.
- **Balls** bounce and roll as spheres, each with its own bounciness: a
  small **bouncy ball** (it keeps bouncing for ages), a **play ball**, a
  striped **beach ball** and a big soft **exercise ball** (land on it and it
  breaks your fall from any side). **Walk into one to kick it**, harder when
  you're sprinting. Drop or throw one and it bounces off the floor, walls and
  furniture, rolls, slows and stops. They're in toy shops and play areas.
- **Noisy toys**: a **rubber duck** squeaks, a **toy drum** bangs and a
  **toy xylophone** plays a little tune (F). Anyone nearby hears it, and at
  night so do the staff: the duck carries 12 m, the xylophone 20 m and the
  drum 35 m. Bang a drum somewhere else to draw them off, then run.
- **Toy blocks** and a **game console** (F starts it up) for the toy shop.
- **Sitting**: F on any chair, sofa, stool, bench or bed (see Survival).
- **Slide**: crouch while sprinting to slide along the floor.
- Browsers don't let a page stop **Ctrl+W** closing the tab, so while you're
  in a store the browser asks before leaving (and a solo store is saved).

## Controls

| Action | Keyboard / mouse | Touch |
| --- | --- | --- |
| Move / look | WASD or arrows / mouse | left stick / drag on the right |
| Sprint / jump / crouch | Shift / Space / C (or Ctrl when not holding anything) | Run / Jump / Crouch |
| Grab furniture, take food, let go | E | Grab |
| Let go, use selected item, shove | left click | Use |
| Rotate held piece (45°, Ctrl or Alt 15°, Shift 90°) | R or right click | Rotate |
| Rotation axis while holding | 1 / 2 / 3, or T to cycle | Axis |
| Square the held piece up | Ctrl+Shift+R | |
| Held piece closer or farther | mouse wheel | |
| Let go / throw | Q / F | Drop / Throw |
| Hotbar / inventory | 1 to 8, wheel / G | tap a slot (tap again to use) / Bag |
| Whistle (hold for a long one) | H | Whistle |
| Sit on a seat | F | |
| Drop all | Shift+Q | |
| Waypoint / clear waypoints | Z / Shift+Z | |
| First / third person | V | |
| Chat (online) / players | Enter / hold Tab | |
| Controls / pause | F1 / Esc | II |

A game controller works too: the sticks move and look, A jumps, B crouches,
X grabs and lets go, Y whistles, RT uses or shoves, LT rotates, RB changes
the axis, LB throws, the d-pad picks hotbar slots (or moves a held piece
closer and farther) (up drops, down sets a waypoint), Back
opens the inventory, Start pauses, and clicking the left stick sprints.

In online rooms, chat appears over the speaker's head as well as in the log.

## The store

The floor is split into 24 m chunks, each generated from the room's seed.
Each chunk has pillars on a 12 m grid, a hanging aisle sign, one section, and
four 12 m plots (some layouts take the whole chunk).

**Grid pillars.** Every fourth chunk in each direction has a big 2.4 m
structural pillar in the middle, with a screen on every face showing its grid
reference (`E2 · S5`). About one screen in seven shows static instead. Most
pillars are plain; about 13% are being worked on (a ladder, a tool rack,
pallets and crates round them), 6% are cracked (a chunk knocked out, steel
showing, the screen usually broken), under 2% are overgrown, and one in a few
hundred is the store's **lost-property pillar**, with a little food and a
first aid kit left on it (and an achievement for finding it).

| Section | What's there |
| --- | --- |
| Showroom | Room displays with three walls and a coloured back wall, picked by weight from 36 room types (pictures, lamps, appliances and toys dressing each one): living rooms (classic, modern with a corner sofa, TV lounge, study), dining room, three kinds of kitchen, bedrooms (master, guest, kids', teen, nursery, a bunk bed showcase, a walk-in wardrobe), bathroom, home office (sometimes with the heavy safe), library, bar, games room (billiards and arcade cabinets), music room, entrance hall and a door display (doors you can open and close), lighting display, rug gallery, a TV showcase (every kind of TV), a picture gallery, a toy shop (plush bears, toys, dice, sometimes a gift box), a café, a storage display, kitchen appliances, a party room (light strips, a record player, gift boxes), and the rare mannequin showcase and information desk |
| Warehouse | **Streets** of 2 to 5 chunks in a row, their 4.4 m racks (which nobody can climb) running the whole length, with pallets, crates, boxes and ladders in the aisles |
| Furniture | Rows of one kind of furniture (lamps and bunk beds included) |
| Market Hall | Low tables of lamps, plants and boxes, the odd snack, and sometimes a snack bar (ice cream, fizzy drinks, crisps) |
| Cafeteria | Rare (about 5% of chunks) and worth finding: a hall filling the whole chunk, with a long serving counter heaped with about fifty things to eat and drink, a first aid kit, and 16 tables |
| Garden Centre | Under open skylights, picked from 7 layouts: a garden with a tree, a picnic area, a patio with a parasol, a backyard round a fire pit, a pergola lounge, a hedge garden, and a greenhouse with broken glass on the floor |
| Stock Room | Crates, boxes and lockers, and sometimes an office floor of desks and filing cabinets |

Some furniture and market plots have a **mezzanine**: a deck 3 m up on four
posts, with railings and a staircase. It's a ready-made high point, if you can
keep the stairs clear.

Any plot can instead be a **first aid station** (a kiosk with four kits, 2.5%)
or an **abandoned fort** (a ring of upturned pallets round a lamp, a platform,
and maybe some food left behind, 1.5%). About a third of chunk edges have
full-height walls with doorways. The chunks around the centre have none.

There are over 115 kinds of furniture and things to pick up (seating,
tables, shelving, storage, beds, a dozen kinds of lamp and light strips,
appliances, pictures and mirrors, rugs and mats, toys, plush bears, dice,
gift boxes, tools and ladders) and 23 kinds of food, drink and first aid,
plus a head torch and broken glass. By day, some of the staff carry boxes of stock about.

## Achievements

21 achievements are saved on your device, with a toast when one unlocks and
a list on the menu. Some examples: survive your first night, or 7 or 30
nights in a row; place 50 or 500 pieces; shove 20 staff; find a cafeteria, an
abandoned fort or the lost-property pillar; hide in a wardrobe at night; have
a bed, sofa or beanbag save you from a fatal fall; pick up the store safe;
switch off 10 lamps; open a gift box; slide 10 times; walk 1 km.

## Look

Everything is generated in code. There are no image or model files.

- **Surfaces.** Every model is vertex-coloured, and each vertex also says what
  it's made of: paint, wood, fabric, metal, cardboard, plastic, concrete,
  floor, skin or painted steel. One shared material (`mats.js`) uses that to
  pick a procedural detail texture: wood grain, fabric weave, card fibre or
  plaster, generated at start-up. It's projected from world space on all
  three axes, so models need no UVs. The surface type also sets roughness
  and metalness.
- **No roof.** The walls stop at 6.5 m and above them there's nothing but
  fog. The grid pillars carry on upwards forever and fade into it, signs hang
  on cables from somewhere out of sight, and layers of drifting fog move
  across the sky. The higher anything is, the more the fog takes it, and the
  sky shades from the fog at eye level to a slightly paler haze overhead, so
  the pillars thin out into it rather than ending. By day it's a pale grey
  haze; at night it's near black.
- **The grid pillars** show the joints of the shuttering they were cast in
  all the way up, a heavier band where the walls give out, a conduit and a
  cable climbing one face into the fog, hazard-striped corner guards at the
  bottom and a caged lamp on every face that stays on all night. The main
  menu looks up one of them at night while its lamps wash it in orange.
- **Overhead light.** There's an invisible light every 6 m, forever. They
  aren't real lights. The shader lights each pixel from the nine nearest
  fittings, with a diffuse term and a glossy highlight. That gives pools of
  light on the floor and their reflections in its polish, at a fixed cost
  however far you walk.
- **Night.** The lights go out, except one in nine emergency lights that
  cast orange pools, and the edges of the screen darken. Staff eyes glow red. Your
  torch (F) is a real spotlight.
- **Interface.** The whole interface is styled as the store's own printed
  matter, so it reads as part of the place rather than a web page: signage
  lettering (Barlow Condensed), square solid blocks with no glass or glow, and
  one amber colour kept for the main action and the selected slot. The clock
  is an OPEN / CLOSED shop sign, the bars are thin stocktake gauges,
  announcements come over the store PA, and death is an incident report slip.
  The main menu sits over the store at night, looking up a pillar into the fog.
- **Contact shadows.** A soft shadow sits under every piece of furniture
  (one instanced mesh) and around the base of every pillar, wall, rack and
  counter (merged per chunk). Surfaces also darken slightly where they meet
  the floor.
- **Everything else.** Speckled vinyl floor tiles with scuffs, feature-coloured back walls in the showrooms, a generic
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
  broadcasts the result. A piece let go touching something stays exactly where
  it was put; one let go in mid-air falls on the screen of whoever let go of it,
  which then tells the host where it came to rest.

Everyone simulates their own shopper and sends its position 10 times a
second. Staff positions go out 8 times a second, and the clock once a
second. Other players and staff are drawn about 130 ms behind, smoothly
interpolated.

The store itself is never sent: every screen generates the same chunks from
the room's seed. Only *changes* travel, and every screen keeps the full list.
A newcomer asks the host for that list when they join. When the host leaves,
the next-oldest player already has everything and takes over the clock and
the staff.

**Public stores keep their builds all week**, with no server storage:

- The seed comes from the room and the week (the Sunday it started on, in
  Sydney time), so a public store that empties comes back as the same store.
- Every player's browser keeps a copy of the week's store (every change, and
  the day and time) every 20 seconds and when they leave. The first person
  back into an empty store brings their copy back.
- The host stamps every change with the time it was made. Someone joining
  offers their copy to the host, which takes whatever it doesn't have, or
  only has an older version of from a saved copy. A change made live while
  the host has been there is never overridden by an offered copy. So builds
  come back as long as anyone who saw them comes back during the week.
- At the start of Sunday the host sends everyone the new week's seed (`rs`),
  and everyone moves into the fresh store and throws away last week's copy.

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
| `wh` | anyone | I whistled here, short or long (the host lets the staff hear it) |
| `nz` | anyone | I made a noise with a toy here (the host lets the staff hear it) |
| `of` | a newcomer to a public store | my saved copy of this week's store, to the host (in parts) |
| `rs` | host | a new week: here's the fresh public store's seed |
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
| `furniture.js` | Furniture (with hollow collision parts, free rotation cut into collision strips) and food definitions and models; what each place stocks |
| `staff.js` | Staff AI (host only): spawning, senses, path finding over standing surfaces with climbing, attacks, shoves, sizes |
| `physics.js` | Standing-body movement against boxes: step-up, climbing, gravity, ceilings |
| `fall.js` | Pieces falling or thrown on their own: a rigid box with gravity, tumbling, bounces and friction against the world's boxes; balls as bouncing, rolling spheres |
| `net.js` | Rooms, presence, host election, messages |
| `env.js` | Day/night timing, the week and restocks, events, store clock, lighting levels |
| `models.js` | Shopper and staff models, walk cycle, name tags, carried furniture |
| `mats.js` | Surface types, detail texture, the store material (shader patch with ceiling lighting), contact shadows, light fittings, dust |
| `geo.js` | Merged vertex-coloured geometry from boxes, cylinders and spheres |
| `input.js` | Keyboard, mouse (pointer lock) and touch controls |
| `audio.js` | All sound and music, synthesised with Web Audio |
| `rng.js` | Seeded hashing and random numbers |
| `achievements.js` | The achievements, their counters, and saving them |
| `tools/build.mjs` | Builds the single-file `index.html` |
| `tools/test.cjs` | Solo smoke test (see below) |
| `tools/test-items.cjs` | Whistling, sitting, TV light, kicking a ball, noisy toys, no flying on a held piece, drop all |
| `tools/test-pub.cjs` | Public stores: this week's seed, builds surviving an empty store and merging back, the Sunday reset |
| `tools/test-mp.cjs`, `tools/mock-rt.js` | Two-player test with a stand-in realtime server |
| `tools/shots.cjs` | Screenshots of the look: day, close-up, night, lamps, staff, third person, a grid pillar, a cafeteria hall, a warehouse street |
| `tools/soak.cjs` | Runs through every day and night transition, including an old store's long nights, checking for errors |

### Testing

Serve the folder on port 8790 first. Add `--src` to test `src/` instead of
the built file.

```bash
node tools/test.cjs <screenshot-dir>
node tools/test-mp.cjs <screenshot-dir>
node tools/test-items.cjs
node tools/test-pub.cjs
```

`test.cjs` starts solo play and checks:

- picking up, carrying and placing; third person; night arriving;
- eating, rotating a held piece, letting go in mid-air (it drops) and
  touching something (it stays), shoving staff down, standing room inside a
  wardrobe, throwing, dropping food, crouching, a beanbag softening a fall,
  a tap of E not picking things up but holding it doing so, the grid pillar
  at the centre and nights growing longer, and the Monday and Friday restock
  days;
- that the staff can't reach you on a wardrobe, or on two stacked crates,
  but can on the floor, and climb up to you once there's a step beside the
  crates;
- that there are no console errors.

The test machine has no GPU, so the game runs slowly there. The checks wait
on game time rather than wall-clock time.

`soak.cjs` jumps the clock through every kind of transition (dawn, closing
time, a whole week, and day 60's nine-minute night) and fails on any page
error.

`test-mp.cjs` opens two pages that share `mock-rt.js` (BroadcastChannel in
place of the realtime server). It checks:

- joining by code, the same seed on both screens, and late joiners getting
  earlier changes;
- carrying and placing furniture on the host and the guest, the other player
  seeing a held piece float where you aim, and its rotation matching;
- a lamp switched off by the guest being off on both screens;
- the host's staff, clock and hits reaching the guest;
- chat arriving with a bubble over the speaker;
- the guest's long whistle reaching the host as a "needs help" marker with
  their name, and the guest sitting down showing as sitting;
- the guest taking over as host, with the store's changes kept and anything
  the old host was carrying let go, when the host leaves.

## Not done yet

- Not on the arcade site yet. It isn't linked from the site's game list.
- No persistent bases between sessions: a room's store lasts as long as
  someone is in it.
- Staff don't pile on top of each other, and there are no special staff.
- Dropped furniture falls straight down; nothing topples, slides or rolls.
- Lit screens glow, but lamps don't cast shadows.
- Touch controls have only been checked in an emulated iPhone.
- If frames run slow for a few seconds, the game draws at a lower resolution
  until they're quick again.
