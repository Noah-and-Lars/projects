# Hydroneer: Player Controls, Movement and Interaction

Scope and version note: Hydroneer (Foulball Hangover, UE4) launched on Steam on 8 May 2020. Version 2.0 (May 2022) rewrote the codebase. The last content patch was 3.0.x (DLC "Journey to Volcalidus", April 2024). The developer says the game was "finished" in April 2024. Later changes are 3.0.9 (March 2025, a save-corruption fix), the Xbox Series X|S and PS5 launch on 8 May 2026, and a PC "Mega-Optimization" patch released the same day. Neither of the 2025–2026 updates changed controls, as far as the patch notes show. So everything below describes the 3.0.x control scheme unless it says otherwise. Sources: [3.0.9](https://store.steampowered.com/news/app/1106840/view/1793384379499131), [Die Trying announcement](https://store.steampowered.com/news/app/1106840/view/1799088287836850), [Consoles announcement](https://store.steampowered.com/news/app/1106840/view/1825727806715718), [Mega-Optimization 2026](https://store.steampowered.com/news/app/1106840/view/1832065502815252).

Source types used: official Steam patch notes and dev posts (primary); Bridgepour.com, the community wiki the dev endorsed (official wiki since 1.4), read through its guide and item-database API; the small Fandom wiki; Steam guides and discussions, including dev and community-manager replies; DefKey; press (PC Gamer 2020, TheXboxHub 2026 Xbox review, Off the Shelf Media 2026 PC review); Steam user reviews. Reddit, YouTube and PCGamingWiki could not be reached (blocked or no relevant results). Notes on confidence are given inline.

## Default keybindings (keyboard/mouse and gamepad)

### Takeaway
The KB/M scheme is small, with no hotbar or inventory keys. WASD moves, Shift sprints, C crouches, Space jumps, and E picks up/drops/interacts (hold E for precision placement). Left click uses the held tool, enters place mode or confirms a placement. R/T/Y rotate on three axes (hold Ctrl to reverse). The scroll wheel sets placement distance, Q enters vehicles or wears hats, B opens the wiki entry for the item under the cursor, and F switches vehicle mode. On a gamepad, X picks up/drops, RT is the use/build button, LT cancels a build, the D-pad rotates and the bumpers set distance. All keys can be rebound.

### Cited Findings
- Official wiki "Default keybinds": "W A S D – Walk forward, strafe left, walk back and strafe right; E – Pickup / drop / interact; C – Crouch; Left Shift – Sprint; SpaceBar – Jump / handbrake (driving); R T Y – Rotate Z, X, Y; Q – Enter / exit vehicle; B – Open Wiki page of object on cursor; Left Click – Place object / interact; Scroll Wheel – Move further / closer when in place mode" — [Bridgepour First Timer guide](https://bridgepour.com/guide-book/guide/first-timer). DefKey's 12-shortcut list (added July 2024) is identical, which cross-checks it — [DefKey](https://defkey.com/hydroneer-shortcuts).
- The R/T/Y axis order is reported inconsistently: Bridgepour and DefKey say "Rotate Z, X, Y", while a 2020 Steam guide says "R T Y to rotate on the X Y Z axis" — [GamePretty (citing Steam guide by humbrol2)](https://gamepretty.com/hydroneer-starting-guide-for-beginners-how-to-play-placing-items/).
- Holding Ctrl reverses the R/T/Y rotation direction (added in 2.0.6, July 2022; also listed in 2.1) — [2.0.6 patch notes](https://store.steampowered.com/news/app/1106840/view/4474904295773706248); [2.1 patch notes](https://store.steampowered.com/news/app/1106840/view/4980448574112987724). Left Ctrl became bindable in 3.0.7 — [3.0.7](https://store.steampowered.com/news/app/1106840/view/5762994032406039149).
- "Vehicle Mode" keybind, default F, added in 3.0.5 (April 2024) — [3.0.5](https://store.steampowered.com/news/app/1106840/view/5762993398268899735).
- Hats and helmets are worn by looking at them on the floor and pressing Q (pressing Q again drops the hat) — [Bridgepour: Mining Helmet](https://bridgepour.com/database/mining-helmet); [Bridgepour: Prospecting Helmet](https://bridgepour.com/database/prospecting-helmet). A tooltip with the keybinding appears when looking at hats (1.7.2) — [1.7.2](https://store.steampowered.com/news/app/1106840/view/4224935490632757895).
- Right mouse button uses: the Construction Hammer unlocks with RMB (locks with LMB) — [2.0.6](https://store.steampowered.com/news/app/1106840/view/4474904295773706248), [Bridgepour: Construction Hammer](https://bridgepour.com/database/construction-hammer); the Creative Wand duplicates with LMB and destroys with RMB — [Bridgepour: Creative Wand](https://bridgepour.com/database/creative-wand); the Gravity Tool lifts with LMB and throws with RMB — [Bridgepour: Gravity Tool](https://bridgepour.com/database/gravity-tool); RMB zooms the World Map (3.0) — [Mega Patch](https://store.steampowered.com/news/app/1106840/view/5756237364312335366).
- Holding LMB repeats strikes for the pickaxe and Construction Hammer (2.0.6) and for the sickle (3.08) — [2.0.6](https://store.steampowered.com/news/app/1106840/view/4474904295773706248); [3.08](https://store.steampowered.com/news/app/1106840/view/5742731639345340037).
- The Flight Cap (creative mode) is worn with Q; Space moves up and C moves down — [Bridgepour: Flight Cap](https://bridgepour.com/database/flight-cap).
- Rebinding: 2.0 brought a "Controller rework/rebind menu major improvements" — [2.0 notes](https://store.steampowered.com/news/app/1106840/view/4348799082201741462). 2.0.3 added a keybind reset button and blocked binding LMB/RMB because that "stops players from interacting with things" — [2.0.3](https://store.steampowered.com/news/app/1106840/view/5849624375836275751). The Esc menu lists every control and lets you remap them — [Steam guide "Call Before You Dig" (v2.0.2–2.2)](https://steamcommunity.com/sharedfiles/filedetails/?id=2809258751).
- Toggle-sprint and toggle-crouch gameplay options added in 2.0.6 — [2.0.6](https://store.steampowered.com/news/app/1106840/view/4474904295773706248).
- Gamepad (Xbox 360 layout, from a guide for v2.0.2–2.2):
  - Left stick walks or steers; right stick looks and also aims the drop reticle.
  - A jumps (ascends in flight); B crouches (descends in flight).
  - X picks up the item highlighted in orange; X while holding drops it, and holding X drops it farther away.
  - Y wears a hat or enters/exits a truck.
  - RT uses a lever, button or handle, or uses the held item (dump bucket, dig, cast rod). With a buildable item, RT starts build mode and pressing RT again confirms.
  - LT cancels build mode; both sticks position the build.
  - D-pad Up/Left/Right rotate on three axes.
  - Start opens the menu and wiki; Select opens the wiki.
  
  — [Steam guide 2809258751](https://steamcommunity.com/sharedfiles/filedetails/?id=2809258751).
- Controller history: "Partial controller support" arrived in 1.6 (Jan 2021) — [1.6](https://store.steampowered.com/news/app/1106840/view/4483864038806701099). The 3.0 Mega Patch made these controller changes:
  - Vehicles drive with the triggers and steer with the thumbstick.
  - The R/L shoulder buttons move build items closer or farther ("Like mouse scroll wheel").
  - Default right-stick X sensitivity was doubled, and the camera can zoom in vehicles.
  
  — [Mega Patch](https://store.steampowered.com/news/app/1106840/view/5756237364312335366); [Message from Max, Jan 2024](https://store.steampowered.com/news/app/1106840/view/6300039510120170533).
- Splitscreen co-op is only available through Steam Remote Play. The keyboard player is always Player 1 — [2.0 notes](https://store.steampowered.com/news/app/1106840/view/4348799082201741462); [Steam discussion on KB/controller multiplayer config](https://steamcommunity.com/app/1106840/discussions/0/3266809889822030572/).
- A dev or team reply confirms Q enters and exits vehicles, and that doing so "may cause items to drop" — [Steam discussion 591765076067781455](https://steamcommunity.com/app/1106840/discussions/0/591765076067781455).

### Inferences
- There are no hotbar, number-key, inventory, backpack or map keys. The map is a physical "World Map" tool item you carry ([Bridgepour Getting Started lists "world-map" among starter items](https://bridgepour.com/guide-book/guide/getting-started)). Context decides what E, LMB and RMB do, based on the held item and the crosshair target.
- On gamepad, RT combines "use" and "place". On KB/M, LMB on a held build item enters place mode first and a second LMB confirms ([Bridgepour: Camp Bed](https://bridgepour.com/database/camp-bed)). So placement is a two-step modal action.

### Gaps
- The console (PS5/Xbox, May 2026) default layout was not found. It may differ from the PC controller layout.
- A separate keyboard "throw" key was not found (see the interaction section). No mouse-sensitivity or FOV defaults were found.

## Movement feel (speeds, jump, stamina, fall damage, swimming, ladders, camera, head-bob, FOV)

### Takeaway
Movement is a plain UE4 first-person controller: walk, sprint (added in 1.4), crouch and jump. I found no evidence of stamina, fall damage, or player death from falls or lava. Recovery is handled by "Unstuck" teleports. The player is first-person; third-person models exist only for others to see in splitscreen. Exact speeds, jump height, FOV and head-bob values were not found.

### Cited Findings
- Sprint did not exist at launch. "Player sprinting ability – a highly requested feature" was added in 1.4 (Sept 2020), along with player jumping sounds — [1.4](https://store.steampowered.com/news/app/1106840/view/4249665521683159651).
- Holding a pallet stops you sprinting and slows you down ("to balance carts", 1.6) — [1.6](https://store.steampowered.com/news/app/1106840/view/4483864038806701099).
- 2.0 reworked the movement code so input "will no longer be locked out on an axis if that button is already held down when holding down the new axis button" — [2.0 notes](https://store.steampowered.com/news/app/1106840/view/4348799082201741462).
- Players can walk up a Vertical Conveyor Belt (2.0.5) — [2.0.5](https://store.steampowered.com/news/app/1106840/view/4292505348839841359).
- The Icehelm forge is reached by "the elevator powered by a pulley". The wiki adds "You can take the stairs down or jump from the railing. (Don't fall, otherwise, it will be a while for you to head back up)". That implies a fall is an inconvenience rather than damage — [Fandom: Drill](https://hydroneer.fandom.com/wiki/Drill).
- NamuWiki says there is no game over: the character never dies from vehicle accidents, high falls, or falling into lava. I saw this only in a search snippet; the page itself returned 403 — [NamuWiki: Hydroneer](https://en.namu.wiki/w/Hydroneer). It is consistent with the Fandom note above and with the lack of any health or death entries across six years of patch notes ([Steam news hub](https://store.steampowered.com/news/app/1106840)).
- Recovery: "Unstuck points now have separate locations for players and vehicles" (2.0) — [2.0 notes](https://store.steampowered.com/news/app/1106840/view/4348799082201741462). The Esc menu has "Unstuck" and "Recall Vehicle" buttons — [Steam guide 2809258751](https://steamcommunity.com/sharedfiles/filedetails/?id=2809258751). A 2026 reviewer notes performance problems often force players to use the "unstuck" option — [Off the Shelf Media, May 2026](https://offtheshelfmedia.com/2026/05/26/hydroneer-review/).
- Water: you fill a pan or bucket by dropping it into a river ("Don't worry about getting a little wet, you'll soon dry off") — [Bridgepour Getting Started](https://bridgepour.com/guide-book/guide/getting-started). 2.2 fixed "Players no longer 'splash' when exiting near water" — [2.2](https://store.steampowered.com/news/app/1106840/view/6539831519489700435).
- Camera: first-person for the local player. 2.0 added "Customisable 3rd person characters which are viewable from the customisation window, and when playing with friends" — [2.0 notes](https://store.steampowered.com/news/app/1106840/view/4348799082201741462). The vehicle camera can pan up and down (1.6) and zoom on controller (3.0) — [1.6](https://store.steampowered.com/news/app/1106840/view/4483864038806701099); [Mega Patch](https://store.steampowered.com/news/app/1106840/view/5756237364312335366). There is also a free-fly "Screenshot camera" in the Esc menu (1.5), made faster in 3.0 — [Mega Patch](https://store.steampowered.com/news/app/1106840/view/5756237364312335366).
- Settings that exist: mouse inversion, including for vehicles (fixed in 2.0.3) — [2.0.3](https://store.steampowered.com/news/app/1106840/view/5849624375836275751); a motion-blur toggle (a user mentions it) — [Steam discussion 591765076067781455](https://steamcommunity.com/app/1106840/discussions/0/591765076067781455); FPS capped at 60 by default since 3.0 — [Mega Patch](https://store.steampowered.com/news/app/1106840/view/5756237364312335366).
- Movement of carried transport: hand carts are pushed with W/S and turned with A/D ("you will not be able to use your mouse" to turn). The Fast cart moves forward faster; the Agile cart turns more tightly — [Bridgepour: Wooden Cart](https://bridgepour.com/database/wooden-cart).
- The DLC adds snowball piles you can throw, including at NPCs — [Dev vlog, Mar 2024](https://store.steampowered.com/news/app/1106840/view/5686430301729334870).
- One negative Steam review (14.8 h) says "Movement game play itself its just hard for 0 reason" — [Steam negative reviews](https://steamcommunity.com/app/1106840/negativereviews/).

### Inferences
- Since no stamina, health or fall damage appear in any patch notes, a faithful "feel" needs only walk/sprint/crouch/jump plus a teleport-to-safe-point recovery. Failure states come from physics accidents (knocked-over items, stuck vehicles), not from harm to the player.
- The game uses UE4 Character Movement defaults, so walk speed is probably near UE4's 600 cm/s default. This is speculation; there is no data.

### Gaps
- No numeric walk/sprint speed, jump height, gravity, FOV range or head-bob setting could be found. PCGamingWiki, which would list the FOV slider, was blocked (403). No datamine was found.
- Swimming: I found no confirmation of whether the player swims, wades, or is blocked by deep water.
- Ladders: I found no source for climbable ladders. Stairs, elevators and vertical conveyors are what the sources describe.

## Object interaction model (pickup, carry, rotate, throw, inventory)

### Takeaway
The game has no inventory by design. The player holds exactly one physical object, which sits to the lower right of the view. Pressing E drops it and it falls under physics to a "drop circle" below the held position, which is offset to the right of the crosshair. Holding E enters precision placement ("freeplacing"): R/T/Y rotate, the scroll wheel sets distance, and the item lands under a drop target. Containers carry many items at once: buckets and pans; pallets (which are slower to carry); carts and truck beds (contents have no collision). Weight affects value and the heaviest machines, not how much the player can carry. There is no general throw, apart from creative-mode and special items.

### Cited Findings
- Developer grandmaMax (Apr 2024): "every item interaction is designed around this object permanence", and having no inventory is "one of the principal pillars of design". If you need an inventory, "Hydroneer probably isn't the game for you" — [Steam discussion 4349988612571529260](https://steamcommunity.com/app/1106840/discussions/0/4349988612571529260/).
- PC Gamer (1 May 2020) described having no inventory at all: "You have to lug everything around in your hands … Every shovel and pickaxe, every nugget of iron ore … even the coin you earn." The writer improvised with "Three little buckets" as an inventory. It also describes physics chaos: "I've knocked my bed into the river at least three times … trying to stack two foundation blocks wound up sending one shooting into the sky" — [PC Gamer](https://www.pcgamer.com/i-cant-decide-if-having-no-inventory-system-in-this-crafting-game-is-brilliant-or-brutal/).
- 2026 reviews confirm the same: "You can hold a single item at a time and must drop it before interacting with anything else" — [TheXboxHub, May 2026](https://www.thexboxhub.com/hydroneer-review/); "you can't store them on your person like every other crafting game" — [Off the Shelf Media](https://offtheshelfmedia.com/2026/05/26/hydroneer-review/).
- Drop mechanics (dev or team reply, Mar 2025): "On the right side, underneath the item you're holding is a circle that shows you where the item will land. You can find an option in the gameplay settings to change the colour"; "All items will be dropped from where they're held, the circle in the center of the screen is for when you're interacting with the held item, or whatever you're looking at using the mouse buttons" — [Steam discussion 591765076067781455](https://steamcommunity.com/app/1106840/discussions/0/591765076067781455). This means there are two reticles: a centre interaction reticle and an offset drop circle.
- Press E once while holding to drop. You need a second E press with an empty hand to pick up what is under the crosshair; one press never swaps items — same thread.
- The 2.0 patch notes add a "New drop circle when carrying resources"; 2.0.6 adds "New options for drop reticule" — [2.0](https://store.steampowered.com/news/app/1106840/view/4348799082201741462); [2.0.6](https://store.steampowered.com/news/app/1106840/view/4474904295773706248).
- Precision placement / freeplacing:
  - Holding E angles items for easier placement ("Precision Place Mode"), according to the community manager in Oct 2020 — [Steam discussion "Handling things!"](https://steamcommunity.com/app/1106840/discussions/0/3014556944181940430/).
  - In 2.0, R/T/Y also rotate during precision placement — [2.0](https://store.steampowered.com/news/app/1106840/view/4348799082201741462).
  - 3.0 (April 2024): "When 'freeplacing' (hold E while carrying items) and using the scroll wheel will now change the distance the item is from the player". Collisions were also "un-janked", so a shard bar can go into a vertical pressure tank — [Mega Patch](https://store.steampowered.com/news/app/1106840/view/5756237364312335366); [Dev vlog Mar 2024](https://store.steampowered.com/news/app/1106840/view/5686430301729334870).
  - 3.0.7 made the drop target appear under the freeplaced item — [3.0.7](https://store.steampowered.com/news/app/1106840/view/5762994032406039149).
- Placing far away still works, but the item "will fall at an angle to the ground". A plain drop makes items fall flat, which helps stack bars neatly. A green dot shows where the held item will fall — [Steam guide "Hydro-Engineering" (2020, v1.x)](https://steamcommunity.com/sharedfiles/filedetails/?id=2099246044).
- Items are held vertically and the physics takes over when dropped, which makes loading trucks, racks and sale tables frustrating (Oct 2020 complaint) — [Steam discussion "Handling things!"](https://steamcommunity.com/app/1106840/discussions/0/3014556944181940430/). Weapons were changed in 1.4 so they don't rotate when dropped and are "held higher to avoid collision issues" — [1.4](https://store.steampowered.com/news/app/1106840/view/4249665521683159651).
- Bug history shows the physics-handle pitfalls:
  - "Picking up items you're standing on no longer flings you into the air" (1.6) — [1.6](https://store.steampowered.com/news/app/1106840/view/4483864038806701099).
  - Dropping a shovel mid-animation sent it into the void (fixed in 2.0.3) — [2.0.3](https://store.steampowered.com/news/app/1106840/view/5849624375836275751).
  - The bucket now "will try and land straight up" (2.2) — [2.2](https://store.steampowered.com/news/app/1106840/view/6539831519489700435).
- Storage by dropping: since 2.0, "Storing items in things like toolracks no longer requires a mouseclick. When dropping the item, if looking at an eligible storage item, will store the item in there" — [2.0](https://store.steampowered.com/news/app/1106840/view/4348799082201741462). Resources dropped into a pan, bucket or crucible "lock" into it — [2.0.7](https://store.steampowered.com/news/app/1106840/view/4539082035562738288).
- Multi-carry containers:
  - Pan: "drop coins or resources … inside the Pan, then you can pick the pan up to carry all those items in one go" — [Bridgepour: Pan](https://bridgepour.com/database/pan).
  - Pallet: "Drop items ontop to lock to pallet" — [Bridgepour: Pallet](https://bridgepour.com/database/pallet).
  - Carts: contents "have no collision with other objects stored inside. This means you can move an entire base … in one cart" — [Bridgepour: Wooden Cart](https://bridgepour.com/database/wooden-cart).
  - A player summary: a pallet on the ground has collision so it holds little; carts and truck beds have no collision; pans have no collision — [Steam discussion 4349988612571529260](https://steamcommunity.com/app/1106840/discussions/0/4349988612571529260/).
- Before 3.0, carrying pans or buckets with thousands of resources caused heavy lag; 3.0 fixed it ("There may still be a tiny hitch when picking up the pan") — [Dev vlog Mar 2024](https://store.steampowered.com/news/app/1106840/view/5686430301729334870). A guide for v2.x advised keeping containers to about 20 items to avoid crashes or FPS loss — [Steam guide 2809258751](https://steamcommunity.com/sharedfiles/filedetails/?id=2809258751).
- Weight: resources have weight, which sets their value. Scales show weight and value labels — [Bridgepour: Scales](https://bridgepour.com/database/scales). A Logic Weight Reader outputs resource weight (1.7.2) — [1.7.2](https://store.steampowered.com/news/app/1106840/view/4224935490632757895). Drill recipes are priced in "weight of iron", e.g. 300 — [Fandom: Drill](https://hydroneer.fandom.com/wiki/Drill). In the DLC, the Lava Hauler crane "Picks up heavy items that players can't carry: Machines / Vehicles / Buff Stones" — [DLC announcement](https://store.steampowered.com/news/app/1106840/view/5510783579247049777).
- Throwing: the creative-mode Gravity Tool picks up any item ("floating just infront of the player, with a random rotation") and throws it with RMB — [Bridgepour: Gravity Tool](https://bridgepour.com/database/gravity-tool); [1.7](https://store.steampowered.com/news/app/1106840/view/4186652991113411288). Other throwables are Throwable TNT (2.0) and DLC snowballs — [2.0](https://store.steampowered.com/news/app/1106840/view/4348799082201741462); [Dev vlog](https://store.steampowered.com/news/app/1106840/view/5686430301729334870). The Magnet on a Stick "attracts resources when activated" and is used to clean up loose ore — [Bridgepour: Magnet on a Stick](https://bridgepour.com/database/magnet-on-a-stick); [Steam guide 2099246044](https://steamcommunity.com/sharedfiles/filedetails/?id=2099246044).
- Currency is physical too: you carry coins in a bucket or pan, drop them into the store's purchase bucket and press a buy button. Coins combine into stacks on contact, and since 3.0 they also stack while stored — [PC Gamer](https://www.pcgamer.com/i-cant-decide-if-having-no-inventory-system-in-this-crafting-game-is-brilliant-or-brutal/); [Message from Max](https://store.steampowered.com/news/app/1106840/view/6300039510120170533).
- Players hook a cart to the truck by backing up until the handles clip, then jumping and letting go. A player calls this a long-standing unintended trick, not a dev-confirmed feature — [Steam discussion 4349988612571529260](https://steamcommunity.com/app/1106840/discussions/0/4349988612571529260/).

### Inferences
- The held object behaves like a kinematic or attached item at a fixed offset to the lower right. On drop it becomes a free physics body that falls straight down from the hand. There is no physics-handle "grab" or swinging; that kind of floating, randomly rotated hold exists only on the creative Gravity Tool. For an original game, the main design levers here are the two-reticle problem (the most common complaint) and container "lock-in" (items stored in containers lose collision).
- Weight limits how much you earn and which tools or machines you need, not how much you can carry. One-item hands plus containers are the throughput limit.

### Gaps
- A general throw key or throw force for ordinary items (outside the Gravity Tool) was not found and probably doesn't exist. The "hold X to drop farther away" gamepad note suggests a stronger drop toss, but the strength is unknown.
- The exact hold offset and the drop-circle distance were not documented.

## Building / placement system

### Takeaway
Build items enter a modal place mode (LMB, or RT on gamepad). The mode shows a subtle green grid and a ghost hologram, blue if valid and red if blocked. R/T/Y rotate in 90° steps on up to three axes depending on the item, and the scroll wheel or bumpers set distance. Since 3.0, the piece snaps against the face of an already-placed item. Placed items are grid-aligned but stay pick-up-able until you nail them down with the Construction Hammer (LMB locks, RMB unlocks; an orange outline means unlocked). Machines connect by placement adjacency, and "hooks" attach onto pipes and conveyors. There is no deconstruct-for-refund action: you just pick the item up again, and scrapping returns 25% as scrap metal.

### Cited Findings
- Build mode shows a green grid. The hologram is "BLUE if it is able to be built there, or RED if you cannot build it there". Pressing X (drop) in build mode drops the item without building it — [Steam guide 2809258751](https://steamcommunity.com/sharedfiles/filedetails/?id=2809258751). The blue/red rule is cross-checked by "Blue shows you where you can place, red is blocked or non placeable" — [GamePretty / humbrol2 (2020)](https://gamepretty.com/hydroneer-starting-guide-for-beginners-how-to-play-placing-items/).
- On KB/M, you pick up a build item with E, press LMB "to enter place mode", then LMB again to set it down — [Bridgepour: Camp Bed](https://bridgepour.com/database/camp-bed).
- 2.0 changes to placement:
  - "Red/Blue placement material improved to show more detail in the item".
  - "Placement types updated for items, this changes if an item can be placed in the sky or has to snap to an object".
  - "Updated building items to have a more consistent rotations".
  
  — [2.0](https://store.steampowered.com/news/app/1106840/view/4348799082201741462).
- 2.0.6: "Placement grid is now more subtle"; "Half walls can now be RTY rotated"; scales aligned to the grid — [2.0.6](https://store.steampowered.com/news/app/1106840/view/4474904295773706248). 1.6: "Added multiple items to be fully rotatable while building" — [1.6](https://store.steampowered.com/news/app/1106840/view/4483864038806701099). Some items rotate on fewer axes — [Steam guide 2809258751](https://steamcommunity.com/sharedfiles/filedetails/?id=2809258751).
- 3.0 build-snapping: "Building items can be pretty annoying in Hydroneer, which is why we have implemented a new snapping system. Whilst placing an item, if you look at another placed item, it'll offset what you're placing to the corresponding side" — [Message from Max, Jan 2024](https://store.steampowered.com/news/app/1106840/view/6300039510120170533); shipped in the [Mega Patch](https://store.steampowered.com/news/app/1106840/view/5756237364312335366).
- Placement validation near terrain: 2.2.4 brought "Major improvements on placing items near diggable dirt. Will not prevent placement as much as before" — [2.2.4](https://store.steampowered.com/news/app/1106840/view/5138087875075946141). 1.6 increased protection against items being placed under undiggable terrain — [1.6](https://store.steampowered.com/news/app/1106840/view/4483864038806701099).
- Locking: "Hit placed down items to lock them down. No more picking them up by accident!"; "If the object has an orange outline, it isn't locked down"; LMB locks and RMB unlocks — [Bridgepour: Construction Hammer](https://bridgepour.com/database/construction-hammer); [2.0.6](https://store.steampowered.com/news/app/1106840/view/4474904295773706248). The 2026 Xbox review agrees that the hammer "locks items in place so they won't be accidentally picked up", and that "Everything needs to be placed on an invisible grid" — [TheXboxHub](https://www.thexboxhub.com/hydroneer-review/). Players lock finished pipes and drills specifically so E doesn't grab them by accident — [Steam discussion 591765076067781455](https://steamcommunity.com/app/1106840/discussions/0/591765076067781455).
- Attachments:
  - 2.0 introduced "Hooks", which "act as attachments onto items". Conveyors hook onto pipes. Conveyor hooks include dirt shredders, gem cutters and logic counters. Pipe functions became separate hooks: filters, valve, pressure reader — [2.0](https://store.steampowered.com/news/app/1106840/view/4348799082201741462).
  - Picking up a pipe brings its attachments with it, while picking up just an attachment leaves the pipe — [Steam guide 2809258751](https://steamcommunity.com/sharedfiles/filedetails/?id=2809258751).
  - Pipe setup works by adjacency. You place the intake at the water's edge ("You'll know if you placed it right, if water is dripping from the front"), then rotate it with R, and position the drill so its intake "is attached to the pipe" — [Bridgepour First Timer / Getting Started guide text](https://bridgepour.com/guide-book/guide/first-timer).
  - Conveyors show directional arrows when placed (1.3) — [1.3](https://store.steampowered.com/news/app/1106840/view/3659688711190803493).
- Building sets (2.0): Wood, Stone and Cottage house parts share the same measurements so they can be mixed. The 2.1 Greenhouse set followed — [2.0](https://store.steampowered.com/news/app/1106840/view/4348799082201741462); [2.1](https://store.steampowered.com/news/app/1106840/view/4980448574112987724). The Rake raises or lowers terrain per grid square to level ground for building — [Bridgepour: Advanced Rake](https://bridgepour.com/database/advanced-rake). The 2.0.6 Rake "will align to the rotation of build items" — [2.0.6](https://store.steampowered.com/news/app/1106840/view/4474904295773706248).
- Deconstruction and refunds: "Scraping items will give you scrap metal that costs 25% of the original value" (2.0) — [2.0](https://store.steampowered.com/news/app/1106840/view/4348799082201741462). Otherwise items are simply unlocked and picked up again — [Bridgepour: Construction Hammer](https://bridgepour.com/database/construction-hammer).
- Creative mode: build anywhere (1.7.2); the Creative Hard Hat duplicates every placed item for quick building (2.0.6) — [1.7.2](https://store.steampowered.com/news/app/1106840/view/4224935490632757895); [2.0.6](https://store.steampowered.com/news/app/1106840/view/4474904295773706248).
- Complaints: a Steam reviewer says placement depends on distance rather than snapping, which makes underground building a chore. Accidental pickups of drills have no "cancel" to return them (summarised from search results; individual reviews not opened) — [Steam negative reviews](https://steamcommunity.com/app/1106840/negativereviews/).

### Inferences
- There are two placement paths. Build items (grid, ghost, snap, then lock) give automation stability. Loose items (drop or freeplace with physics) give the tactile feel. Lock or unlock is the bridge between them.
- Connections are implicit, made by aligning ports, rather than by drawing pipes or belts. Hooks let one grid cell carry stacked functions.

### Gaps
- Grid cell size in world units was not found. Wall versus floor attachment rules beyond "placed in the sky or has to snap to an object" are not documented.

## Tool mechanics (shovel, pickaxe, pan, hammers, spanner, durability)

### Takeaway
Every tool is a held physical item used with LMB on a target. The shovel scoops one dirt load (four fill a bucket). The bucket pours with LMB at the drop circle. The pan is filled by dropping it into water, then scrubbed with the brush. The pickaxe digs terrain fast or splits dirt chunks. Tool tiers (T1–T3) limit dig depth. Durability applies to machines (drills, harvesters, filters), not hand tools. Machines are repaired with a single-use Spanner or a 5-use Tool Bag, and the Magnifying Glass shows durability.

### Cited Findings
- Digging:
  - "Look at the bumpy dirt and Left click to scoop some dirt up. Now, look at your Bucket and Left click again to place the Dirt in the Bucket. Do this four times and you'll have a full Bucket" — [Bridgepour Getting Started](https://bridgepour.com/guide-book/guide/getting-started). Cross-checked: "A bucket takes four loads" — [Steam guide 2809258751](https://steamcommunity.com/sharedfiles/filedetails/?id=2809258751); [Bridgepour: Bucket](https://bridgepour.com/database/bucket).
  - Shoveling dirt onto the ground creates a mound, not loose chunks — [Steam guide 2099246044](https://steamcommunity.com/sharedfiles/filedetails/?id=2099246044).
- Pouring: "pick your Bucket up, look at the floor and you'll see a green circle, line the circle up so it's inside the Pan and Left click to pour" — [Bridgepour Getting Started](https://bridgepour.com/guide-book/guide/getting-started). 2.2 fixed it so that "Bucket/Pan now drops dirt on the correct drop target location when emptied" — [2.2](https://store.steampowered.com/news/app/1106840/view/6539831519489700435).
- Panning steps: get water by dropping the pan in the river, or by filling the bucket in water and pouring it in. Then use the brush on the pan with LMB — [Bridgepour Getting Started](https://bridgepour.com/guide-book/guide/getting-started); [Bridgepour: Pan](https://bridgepour.com/database/pan); [Fandom: Panning](https://hydroneer.fandom.com/wiki/Panning).
  - Scrub count conflicts: Bridgepour's guide says "Left click twice to brush", but 2.0 patch notes say "Pan now takes one scrub instead of two" — [Bridgepour Getting Started](https://bridgepour.com/guide-book/guide/getting-started) vs [2.0](https://store.steampowered.com/news/app/1106840/view/4348799082201741462). The patch note is newer and primary.
  - "You do not need to empty the Pan before tipping the next ball of Dirt in, any resources will stay inside" — [Bridgepour Getting Started](https://bridgepour.com/guide-book/guide/getting-started).
  - Shovels, pans and buckets don't spill if they land upside down — [Steam guide 2809258751](https://steamcommunity.com/sharedfiles/filedetails/?id=2809258751).
- Pickaxe: "Used to dig terrain fast, or split dirt in half"; tiers T1 (Dull), T2 (Common), T3 (Advanced) — [Bridgepour: Dull Pickaxe](https://bridgepour.com/database/dull-pickaxe). Since 2.0, "New Pickaxe and Shovel tools which can dig to a certain depth depending on their tier" — [2.0](https://store.steampowered.com/news/app/1106840/view/4348799082201741462). Holding LMB repeats strikes (2.0.6) — [2.0.6](https://store.steampowered.com/news/app/1106840/view/4474904295773706248). The 1.6 Improved Shovel places smaller amounts of dirt — [1.6](https://store.steampowered.com/news/app/1106840/view/4483864038806701099).
- Blacksmithing Hammer: with a recipe selected and heated bars on the anvil, LMB on the anvil consumes them and creates the item — [Bridgepour: Blacksmithing Hammer](https://bridgepour.com/database/blacksmithing-hammer).
- Durability and repair:
  - "Repairs damaged Drills, Harvesters, and Filters to full health. The Spanner has ONE use"; the Tool Bag "has FIVE use(s)"; check status with a Magnifying Glass ("Displays durability of items which take damage") — [Bridgepour: Spanner](https://bridgepour.com/database/spanner); [Bridgepour: Tool Bag](https://bridgepour.com/database/tool-bag); [Bridgepour: Magnifying Glass](https://bridgepour.com/database/magnifying-glass).
  - Toolbags can be refilled by dropping spanners into them (2.0) — [2.0](https://store.steampowered.com/news/app/1106840/view/4348799082201741462).
  - 1.6: durability items "stop working at 0 durability instead of 25" — [1.6](https://store.steampowered.com/news/app/1106840/view/4483864038806701099).
  - Filters take damage while water flows, and dirty water damages drills and harvesters faster — [Steam guide 2809258751](https://steamcommunity.com/sharedfiles/filedetails/?id=2809258751).
  - Logic "Spanner Hurling Unit" automates repairs (stores 20) — [Bridgepour: Logic Spanner Hurling Unit](https://bridgepour.com/database/logic-spanner-hurling-unit).
- Other tools:
  - Rake: an arrow up raises ground and an arrow down lowers it — [Bridgepour: Advanced Rake](https://bridgepour.com/database/advanced-rake).
  - Fishing rod: LMB casts, then LMB again after three bobs reels in — [Bridgepour item DB: A Reel Dream Fishing Pole](https://bridgepour.com/database/a-reel-dream-fishing-pole).
  - Bed: LMB skips to morning — [Bridgepour: Camp Bed](https://bridgepour.com/database/camp-bed).
  - Mining helmet: lights automatically when worn (1.7) — [1.7](https://store.steampowered.com/news/app/1106840/view/4186652991113411288).
- Negative feedback: "the way you have to use the various tools its incredibly frustrating!" (0.7 h review, Nov 2026) — [Steam negative reviews](https://steamcommunity.com/app/1106840/negativereviews/).

### Inferences
- Tool interaction is "hold tool, look at target, click". The target (dirt, bucket, pan, machine) decides the result, and each verb takes one click with no minigame. Panning is a multi-object chain (shovel, bucket, water, pan, brush) rather than a timing minigame.
- Hand tools appear to have no durability. The sources attach durability only to drills, harvesters and filters.

### Gaps
- Dig volume per scoop, pickaxe swing rate, and exact tier depth thresholds were not collected here; they may be covered by other research notes on mining.

## Player health / survival elements

### Takeaway
There is no health, hunger, stamina, enemies or death penalty. The only risks are economic or physical: losing items to physics, the void, or a crucible mix-up before 3.0. Soup and cooking exist as NPC quest and economy items, not as hunger.

### Cited Findings
- There is no game over, and no death from falls, crashes or lava (NamuWiki, seen in a search snippet only) — [NamuWiki](https://en.namu.wiki/w/Hydroneer). Consistent with this, the Fandom wiki describes a fall from the Icehelm railing only as a long walk back — [Fandom: Drill](https://hydroneer.fandom.com/wiki/Drill).
- NPCs can be run over by vehicles ("NPCs will no longer whistle when being turned into roadkill"), with no consequence noted — [3.0.7](https://store.steampowered.com/news/app/1106840/view/5762994032406039149).
- Soup is made for NPC tasks in exchange for Farming Guild Tokens, or sold to the grocer. It is not eaten by the player — [2.1](https://store.steampowered.com/news/app/1106840/view/4980448574112987724).
- Item-loss risks: a shovel dropped mid-animation could "enter the void" (fixed in 2.0.3) — [2.0.3](https://store.steampowered.com/news/app/1106840/view/5849624375836275751). Before 3.0, a crucible deleted ore of a different type ("No more expensive mistakes!") — [Dev vlog Mar 2024](https://store.steampowered.com/news/app/1106840/view/5686430301729334870). Stores can be "stolen" from, and creative mode allows stealing any item — [1.7](https://store.steampowered.com/news/app/1106840/view/4186652991113411288); [Mega Patch](https://store.steampowered.com/news/app/1106840/view/5756237364312335366).
- Weapons (daggers, axes, swords) are crafted to sell or display, not for combat. The dev's next game, Die Trying, is the one described with "interesting enemies" — [2.2](https://store.steampowered.com/news/app/1106840/view/6539831519489700435); [Die Trying announcement](https://store.steampowered.com/news/app/1106840/view/1799088287836850).

### Inferences
- The tension comes from logistics and physics mishaps, not survival. A browser game in the same spirit can leave out health and HUD bars entirely.

### Gaps
- No primary or official source states "no death" outright. It is inferred from a community wiki plus the absence of any mention in the patch notes. Confidence: medium-high.

## UI / HUD (crosshair, tooltips, prompts)

### Takeaway
The HUD is minimal:
- A centre interaction reticle, plus an offset drop circle (colour configurable) under the held item.
- An orange outline on the item you are looking at.
- Hover tooltips with name, description and badges; B opens the full wiki entry.
- Physical scales and price boards instead of UI numbers for weight and value.
- Keybind tips in the corner when in vehicles.
- A small save icon.
- The map is a physical item.

### Cited Findings
- An orange highlight marks the pickup target — [Steam guide 2809258751](https://steamcommunity.com/sharedfiles/filedetails/?id=2809258751). The outline highlight was improved in 3.0 — [Mega Patch](https://store.steampowered.com/news/app/1106840/view/5756237364312335366).
- Two reticles: the centre circle is for interaction, and the drop circle on the right shows where items land. Its colour can be changed in gameplay settings — [Steam discussion 591765076067781455](https://steamcommunity.com/app/1106840/discussions/0/591765076067781455). The 2026 Xbox review says the landing shadow is "hard to see" depending on lighting, and that items drop "slightly offset from the middle of the screen" — [TheXboxHub](https://www.thexboxhub.com/hydroneer-review/).
- Tooltips:
  - 2.0 added a "Complete redesign of the game UI" and "Item descriptions now contain certain badges to improve understanding of their abilities" — [2.0](https://store.steampowered.com/news/app/1106840/view/4348799082201741462). Item badges look like "(Tool,T1)", "(BuildItem,Logic)" and "(Cart)" — [Bridgepour item DB](https://bridgepour.com/database/dull-shovel).
  - Tooltips resize dynamically (3.0) — [Mega Patch](https://store.steampowered.com/news/app/1106840/view/5756237364312335366).
  - Store tooltips appear in stores, including the vehicle store (2.0.6) — [2.0.6](https://store.steampowered.com/news/app/1106840/view/4474904295773706248).
  - Soup descriptions list their contents (2.1.1) — [2.1.1](https://store.steampowered.com/news/app/1106840/view/4980448574127321166).
- B opens the wiki page of the object under the cursor; Select does the same on gamepad — [Bridgepour First Timer](https://bridgepour.com/guide-book/guide/first-timer); [Steam guide 2809258751](https://steamcommunity.com/sharedfiles/filedetails/?id=2809258751).
- Weight and value are shown by physical Scales (a weight label and a coin-value label) and by the sale price board at the jeweler, which has a physical button — [Bridgepour: Scales](https://bridgepour.com/database/scales); [Bridgepour Getting Started](https://bridgepour.com/guide-book/guide/getting-started).
- Prompts: the enter-vehicle tooltip follows rebinding (1.4) and shows controller glyphs (2.0); keybind tips appear in the screen corner in vehicles (3.0) — [1.4](https://store.steampowered.com/news/app/1106840/view/4249665521683159651); [2.0](https://store.steampowered.com/news/app/1106840/view/4348799082201741462); [Message from Max](https://store.steampowered.com/news/app/1106840/view/6300039510120170533).
- Coin text display overhaul in 3.0.6: unique colours per currency and digit grouping such as "1,420,690" — [3.0.6](https://store.steampowered.com/news/app/1106840/view/6474562312195671416). A save icon appears while auto-saving (1.7.2) — [1.7.2](https://store.steampowered.com/news/app/1106840/view/4224935490632757895).
- The World Map shows player facing (3.0) and zooms with RMB — [Mega Patch](https://store.steampowered.com/news/app/1106840/view/5756237364312335366). Quest markers on the map were made easier to see (2.1.1) — [2.1.1](https://store.steampowered.com/news/app/1106840/view/4980448574127321166).

### Inferences
- The HUD pushes information into the world (scales, boards, a physical map) and keeps the overlay to reticles, outlines and tooltips. That fits the no-inventory pillar.

### Gaps
- No screenshot-level description of the tooltip layout was found, nor whether purity is shown. The game has no "purity" stat as far as found; value appears to be weight-based.

## Community complaints / praise about controls and handling

### Takeaway
The top complaint, unchanged from 2020 to 2026, is the offset drop point combined with physics that "takes over", which makes loading trucks, racks and tables fiddly. Close behind: one shared E key for pickup and drop, accidental pickups, and no inventory. The developer treats this friction as intended and points players to precision placement (hold E), the scroll wheel and Construction Hammer locks. Praise centres on tactility, immersion and the payoff once automation is running.

### Cited Findings
- Complaints:
  - "The offset of always dropping things to my right is literally causing me pain" (Mar 2025). The user asked for unified targeting. The dev reply said "this complaint … is quite rare, with most players adapting to the control scheme … fairly quickly. Hydroneer is also a finished product" — [Steam discussion 591765076067781455](https://steamcommunity.com/app/1106840/discussions/0/591765076067781455).
  - Another user in the same thread: "I always accidentally pick up stuff when I try to drop stuff since it's the same hotkey". A player workaround is locking items with the Construction Hammer — [same thread](https://steamcommunity.com/app/1106840/discussions/0/591765076067781455).
  - "Items are held vertically" and the physics makes stocking trucks, racks and sales tables unreliable (Oct 2020). The community manager pointed to hold-E "Precision Place Mode", and the user replied "Game should make sure player get this in game!" — [Steam discussion "Handling things!"](https://steamcommunity.com/app/1106840/discussions/0/3014556944181940430/).
  - Recent negative reviews (Nov 2026): "the way you have to use the various tools its incredibly frustrating"; the view is "offset … so you cant see what you are doing"; "It's clanky" — [Steam negative reviews](https://steamcommunity.com/app/1106840/negativereviews/).
  - Xbox review (May 2026, 4/5): "frustrating controls", "a bit awkward"; cons list "awkward controls that will be polarizing" — [TheXboxHub](https://www.thexboxhub.com/hydroneer-review/). A PS5 review reportedly calls truck-bed loading "an infuriating tug-of-war between the physics and limited controls" (search snippet only; the page returned 429) — [Thumb Culture PS5 review](https://www.thumbculture.co.uk/hydroneer-ps5-review).
  - PC review (May 2026, 3/10): "a system for moving objects that is flawed, to say the least" — [Off the Shelf Media](https://offtheshelfmedia.com/2026/05/26/hydroneer-review/).
  - Players repeatedly request an inventory or backpack; the dev refuses on principle — [Steam discussion 4349988612571529260](https://steamcommunity.com/app/1106840/discussions/0/4349988612571529260/).
  - The dev admits "Building items can be pretty annoying in Hydroneer", which is why 3.0 added snapping — [Message from Max](https://store.steampowered.com/news/app/1106840/view/6300039510120170533).
- Praise and defence:
  - PC Gamer: "I do like the physicality of lifting and carrying and moving things"; the effort "may ultimately lend a feeling of real accomplishment" — [PC Gamer](https://www.pcgamer.com/i-cant-decide-if-having-no-inventory-system-in-this-crafting-game-is-brilliant-or-brutal/).
  - Players defend it: "games doing things differently are good" — [Steam discussion 4349988612571529260](https://steamcommunity.com/app/1106840/discussions/0/4349988612571529260/).
  - TheXboxHub notes the early frustration is "intended to be part of the experience" and concludes "for the right player, I can't recommend Hydroneer enough" — [TheXboxHub](https://www.thexboxhub.com/hydroneer-review/).
- Fixes the dev made in response:
  - Toggle sprint and crouch, drop-reticle options, and Ctrl reverse-rotate (2.0.6) — [2.0.6](https://store.steampowered.com/news/app/1106840/view/4474904295773706248).
  - Scroll-distance freeplacing, build-snapping, wider carts and controller recalibration (3.0) — [Mega Patch](https://store.steampowered.com/news/app/1106840/view/5756237364312335366).
  - A tutorial accessible from the main menu (2.2) — [2.2](https://store.steampowered.com/news/app/1106840/view/6539831519489700435).

### Inferences
- Lessons for an original game:
  1. Make the drop or landing indicator unmistakable, or align it with the crosshair (or offer an option to).
  2. Split, or make context-safe, the pickup and drop input.
  3. Teach precision placement in the game itself.
  4. Snap to neighbouring faces from day one.
  5. Offer a lock state so built machines can't be grabbed by accident.
  6. Give containers "lock-in" (contents lose collision) so bulk hauling doesn't fight the physics.

### Gaps
- Reddit (r/Hydroneer) and YouTube sources could not be retrieved in this session, so community sentiment comes from Steam, press and the wikis only.

## Verification of specific leads (confirm/debunk)

### Takeaway
Confirmed: shovel (with T1–T3 upgrades), pickaxe, pan, bucket, brush, lantern, mining helmet, emptying buckets at a drop target, a grid build mode with snapping, NPCs, and co-op through splitscreen only.

Debunked or not found:
- No backpack or belt slots.
- No jetpack or grappling hook. The creative-only Flight Cap is the closest thing.
- No hammer that removes buildings. The Construction Hammer locks and unlocks, and the Spanner repairs machines.
- No mouse-driven rotation of held items. Rotation uses the R/T/Y keys.
- No charged throw.
- No enemies, player health or fall damage.

### Cited Findings
- **Shovel and upgrades: CONFIRMED.**
  - Bastion island: Dull (T1), Common (T2) and Advanced (T3) shovels. Volcalidus: Ice shovels at T1 to T3. "The deeper you dig, the better the resources!" — [Bridgepour: Dull Shovel](https://bridgepour.com/database/dull-shovel); [Bridgepour: Advanced Shovel](https://bridgepour.com/database/advanced-shovel); [Bridgepour: Advanced Ice Shovel](https://bridgepour.com/database/advanced-ice-shovel).
  - Tier limits how deep a shovel can dig — [2.0](https://store.steampowered.com/news/app/1106840/view/4348799082201741462).
  - In the DLC, buff stones forged onto tools add random buffs such as pickaxe dig size or speed — [DLC announcement](https://store.steampowered.com/news/app/1106840/view/5510783579247049777).
- **Pickaxe: CONFIRMED.** Tiers T1 to T3. "Used to dig terrain fast, or split dirt in half" — [Bridgepour: Dull Pickaxe](https://bridgepour.com/database/dull-pickaxe).
- **Pan, Bucket and Brush: CONFIRMED.** They are starter items along with the Dull Shovel, Lantern and World Map — [Bridgepour Getting Started](https://bridgepour.com/guide-book/guide/getting-started).
- **"Hammer/Wrench for building/removing": PARTLY DEBUNKED.**
  - The Construction Hammer only locks items (LMB) and unlocks them (RMB) — [Bridgepour: Construction Hammer](https://bridgepour.com/database/construction-hammer).
  - The Blacksmithing Hammer is for anvil crafting — [Bridgepour: Blacksmithing Hammer](https://bridgepour.com/database/blacksmithing-hammer).
  - The "wrench" is the Spanner, and it repairs machines: "Repairs damaged Drills, Harvesters, and Filters", one use — [Bridgepour: Spanner](https://bridgepour.com/database/spanner).
  - Removing something means unlocking it, then picking it up with E. Scrapping returns 25% of the value — [2.0](https://store.steampowered.com/news/app/1106840/view/4348799082201741462).
- **Backpack and belt slots: DEBUNKED.**
  - The developer: no inventory is "one of the principal pillars of design" — [Steam discussion 4349988612571529260](https://steamcommunity.com/app/1106840/discussions/0/4349988612571529260/).
  - No backpack, belt, jetpack or grapple items exist in the 409-item Bridgepour database API (checked by name search) — [Bridgepour database](https://bridgepour.com/database/dull-shovel).
  - The "Tool Bag" is a five-use repair kit, not storage — [Bridgepour: Tool Bag](https://bridgepour.com/database/tool-bag).
- **Lantern and flashlight: CONFIRMED as a lantern, not a flashlight.**
  - The Lantern is a "Handheld lighting device" tool, so holding it takes up your only hand — [Bridgepour: Lantern](https://bridgepour.com/database/lantern).
  - The Mining Helmet is worn with Q and lights up automatically, leaving your hands free — [Bridgepour: Mining Helmet](https://bridgepour.com/database/mining-helmet); [1.7](https://store.steampowered.com/news/app/1106840/view/4186652991113411288).
  - Placeable lights: Wall Lantern, Standing Torch and Firefly Jar — [Bridgepour: Wall Lantern](https://bridgepour.com/database/wall-lantern); [2.0](https://store.steampowered.com/news/app/1106840/view/4348799082201741462).
- **Jetpack or grappling hook: NOT FOUND.**
  - The only flight is the creative-mode Flight Cap (Space to rise, C to descend) — [Bridgepour: Flight Cap](https://bridgepour.com/database/flight-cap).
  - The word "hook" in Hydroneer means pipe and conveyor attachments — [2.0](https://store.steampowered.com/news/app/1106840/view/4348799082201741462).
- **Holding items in front of the camera and rotating them with mouse or keys: PARTLY CONFIRMED.**
  - Held items sit to the lower right of the view, and the landing circle shows beneath them — [Steam discussion 591765076067781455](https://steamcommunity.com/app/1106840/discussions/0/591765076067781455).
  - Rotation uses the R/T/Y keys (Ctrl reverses direction) in build mode or precision placement. The mouse does not rotate items. The scroll wheel sets distance — [2.0](https://store.steampowered.com/news/app/1106840/view/4348799082201741462); [2.0.6](https://store.steampowered.com/news/app/1106840/view/4474904295773706248); [Mega Patch](https://store.steampowered.com/news/app/1106840/view/5756237364312335366).
  - The creative Gravity Tool floats an item in front of the player "with a random rotation" — [Bridgepour: Gravity Tool](https://bridgepour.com/database/gravity-tool).
- **Throwing with charge: NOT FOUND.**
  - Throwing exists only for the creative Gravity Tool (RMB to "YEET"), Throwable TNT and DLC snowballs — [Bridgepour: Gravity Tool](https://bridgepour.com/database/gravity-tool); [Bridgepour: Throwable TNT](https://bridgepour.com/database/throwable-tnt); [Dev vlog Mar 2024](https://store.steampowered.com/news/app/1106840/view/5686430301729334870).
  - On gamepad, holding X drops the item "farther away" — [Steam guide 2809258751](https://steamcommunity.com/sharedfiles/filedetails/?id=2809258751). A charge mechanic is not documented.
- **Build/placement mode and snapping: CONFIRMED.** See the Building section: grid, blue/red hologram, RTY rotation, and the 3.0 face-snapping — [Message from Max](https://store.steampowered.com/news/app/1106840/view/6300039510120170533).
- **Emptying buckets into machines: CONFIRMED.**
  - Holding the bucket, you line up the green drop circle and press LMB to pour into a pan — [Bridgepour Getting Started](https://bridgepour.com/guide-book/guide/getting-started).
  - Dirt can also be shoveled onto a pipe or harvester input ("left click to place a dirt clump on the pipe") — [Bridgepour First Timer / Getting Started guide text](https://bridgepour.com/guide-book/guide/first-timer).
  - Vehicles are refueled by dumping water into the roof hole. Four loads refill one since 2.0 — [Steam guide 2809258751](https://steamcommunity.com/sharedfiles/filedetails/?id=2809258751); [2.0](https://store.steampowered.com/news/app/1106840/view/4348799082201741462).
  - Ores poured into a crucible are smelted — [Dev vlog Mar 2024](https://store.steampowered.com/news/app/1106840/view/5686430301729334870).
- **Player health and fall damage: NOT FOUND, likely absent.** See the Health section — [NamuWiki snippet](https://en.namu.wiki/w/Hydroneer); [Fandom: Drill](https://hydroneer.fandom.com/wiki/Drill).
- **NPCs: CONFIRMED (added in 2.1, Dec 2022).** NPCs hand out soup and crafting tasks, can be hit by vehicles, and take part in snowball fights in the DLC. **Enemies: NOT FOUND** — [2.1](https://store.steampowered.com/news/app/1106840/view/4980448574112987724); [2.2](https://store.steampowered.com/news/app/1106840/view/6539831519489700435); [3.0.7](https://store.steampowered.com/news/app/1106840/view/5762994032406039149).
- **Multiplayer and co-op controls: CONFIRMED as local splitscreen played online through Steam Remote Play.** There is no networked multiplayer.
  - The dev cited "technical limitations of physics engines" — [2.0](https://store.steampowered.com/news/app/1106840/view/4348799082201741462).
  - 2.0.3 added a "New UI menu for remote play to aid players with setting up controllers" — [2.0.3](https://store.steampowered.com/news/app/1106840/view/5849624375836275751).
  - The keyboard player is always Player 1. Controller assignment depends on the "Player 1 gamepad" option — [Steam discussion 3266809889822030572](https://steamcommunity.com/app/1106840/discussions/0/3266809889822030572/).
  - The coin display shows in splitscreen (3.0.6) — [3.0.6](https://store.steampowered.com/news/app/1106840/view/6474562312195671416).

### Inferences
- The lantern and the one-hand rule work together: lighting a cave costs your hand unless you wear the helmet. That is a design nudge worth copying in an original game, using wearable "hat" slots outside the one-item rule.
- Leaving out networked multiplayer was a deliberate choice, made because physics objects are hard to synchronise. That matters for a browser game built on many physics objects.

### Gaps
- Whether console versions (2026) add online multiplayer was not found. The console announcement describes an "almost exact copy" of PC — [Consoles announcement](https://store.steampowered.com/news/app/1106840/view/1825727806715718).
