# Vehicles and Transport in Hydroneer

Scope: how cars, trucks and other transport work and feel in Hydroneer (Foulball Hangover, UE4), to inform vehicle design in an original browser game.

Version context: the game launched on Steam in May 2020. 2.0 (8 May 2022) replaced the whole vehicle system. 2.1 (Dec 2022) added three vehicles and 2.1.2 (21 Dec 2022) overhauled vehicles again. 2.2 (Apr 2023) added digging and prospecting vehicles. 3.0 / the Journey to Volcalidus DLC (5 Apr 2024) added lava vehicles and another handling rework. The last content patch was 3.0.8 (Jun 2024). After that came 3.0.9 (Mar 2025, a save-corruption fix) and a PC "Mega-Optimization" on 8 May 2026, released alongside the PS5 and Xbox Series ports. The developer calls the game "finished" as of April 2024.

Confidence labels:
- **[Official]**: Steam patch notes and dev posts, pulled from the Steam News API for app 1106840 ([API dump](https://api.steampowered.com/ISteamNews/GetNewsForApp/v2/?appid=1106840&count=400&maxlength=0&format=json)).
- **[Wiki]**: the Hydroneer Fandom wiki. It is sparse, some pages are stubs, and at least one page (Onyx) reads as AI-generated and wrong, so treat it as low confidence.
- **[Community]**: Steam discussions and third-party guides.

---

## 1. Which vehicles exist, how they are acquired, and what they do

### Takeaway
Hydroneer has a free starter water-fuelled truck plus a roster of purchasable specialist vehicles:
- haulers: truck variants, a quad and a bike
- a terrain flattener (roller)
- diggers (Mole, Lava Thaw)
- a prospector
- a farming harvester (Cropper)
- in the DLC, a huge crane truck (Lava Hauler) that lifts machines and other vehicles.

The most common items are moved by hand carts, pallets and the cargo zones of vehicles. There are no minecarts or rails. Vehicles cannot be sold or scrapped, and they never transfer between the base island and the DLC island.

### Cited Findings

**Base game (Bastion Island)**
- **Hydro Truck.** Free starting vehicle, type "Vehicle", price "Free". It has a "no clip storage area behind the cabin", and the fuel tank sits above the cabin. [Wiki] — [Hydro Truck (Fandom)](https://hydroneer.fandom.com/wiki/Hydro_Truck)
- **Vehicle shop in Bridgepour.** It sells the Hydro Truck, a more expensive Hydro Truck Mk II, colour variants that are "the same thing", the Roller and the Hydro Quad ("Fast, but limited storage"). The wiki also mentions "new mining vehicles" at the Bridgepour port. [Wiki] — [Bridgepour (Fandom)](https://hydroneer.fandom.com/wiki/Bridgepour)
- **Truck upgrades.** A player says there are two upgraded trucks in a nearby town, neither expensive, with the dearer one "only around 1400 Hc (Hydrocoins)". It is "MUCH more maneuverable and has better acceleration" than the "CRAP" starter truck. [Community] — [Steam: bouncing vehicles](https://steamcommunity.com/app/1106840/discussions/0/3395163747112385470/)
- **Buying new trucks.** TechRaptor's guide says new trucks are bought in Bridgepour, which offers "a variety of different vehicles". [Community] — [TechRaptor refuel guide](https://techraptor.net/gaming/guides/how-to-refuel-trucks-in-hydroneer) (seen via search snippet; the page returned 403 on fetch)
- **2.1 Farming Season (9 Dec 2022) added "Three new vehicles!"** [Official] — [Farming Season patch](https://steamstore-a.akamaihd.net/news/externalpost/steam_community_announcements/4980448574112987724)
  - "Hydro Quad! A small quick vehicle with limited storage space"
  - "Hydro Roller. The perfect vehicle for levelling ground quickly"
  - "Hydro Cropper - Farming utility vehicle used to harvest and replant crops"
- **2.2 Prospecting Update (14 Apr 2023).** [Official] — [Prospecting Update](https://steamstore-a.akamaihd.net/news/externalpost/steam_community_announcements/6539831519489700435)
  - "The Hydro Mole - a utility vehicle which can dig dirt terrain. Can be set to three different angles."
  - The Mole replaces the old Hydro Excavator, "a vehicle capable of storing dirt while it digs holes". The Mole "doesn't store dirt" and has "locked angles".
  - "Hydro Prospector. A utility vehicle which can find nearby ore veins and prospects downwards to find what type of vein is under the ground."
- **Using the Prospector.** "Follow the radar dish till it starts spinning in circles, then hit the RMB to lower the drill", and the ore type "come[s] flowing out the top". [Community] — [Steam: prospector vehicle](https://steamcommunity.com/app/1106840/discussions/0/3821909708347621313/)

**Early versions (pre-2.0)**
- **The Excavator was a vehicle in early builds.** 1.5 "Excavator major overhaul" — [1.5 patch](https://steamstore-a.akamaihd.net/news/externalpost/steam_community_announcements/3854477638701252164). 2.0 "Excavator vehicle removed (For now...)" — [2.0 patch](https://steamstore-a.akamaihd.net/news/externalpost/steam_community_announcements/4348799082201741462). [Official]
- **Pre-2.0 vehicles also included a "tractor".** Players at the time could not sell vehicles. [Community] — [Steam: Truck flies away](https://steamcommunity.com/app/1106840/discussions/0/2254559285375830696/)

**DLC: Journey to Volcalidus (Apr 2024)**
- **Purchase point.** "Vehicles are purchased from Mots Island". [Official] — [DLC announcement](https://steamstore-a.akamaihd.net/news/externalpost/steam_community_announcements/5510783579247049777)
- **Hauler.** "Huge Hauler vehicle with a crane — Picks up heavy items that players can't carry: Machines / Vehicles / Buff Stones". [Official] — [DLC announcement](https://steamstore-a.akamaihd.net/news/externalpost/steam_community_announcements/5510783579247049777)
- **Lava Thaw.** "A flamethrower wielding vehicle that is used to dig terrain! It has slots on the back for upgrade modules that allow it to dig deeper!" [Official] — [Mar 2024 dev vlog post](https://steamstore-a.akamaihd.net/news/externalpost/steam_community_announcements/5686430301729334870)
- **Hauler crane buff.** The crane was buffed "to extend very low to be able to place the huge heavy mining equipment at the bottom of dig sites". [Official] — [Mar 2024 dev vlog post](https://steamstore-a.akamaihd.net/news/externalpost/steam_community_announcements/5686430301729334870)
- **Lava Bike.** It exists, and buying it triggers a Steam achievement. [Official] — [3.0.2](https://steamstore-a.akamaihd.net/news/externalpost/steam_community_announcements/5756237364313246785)
- **Lava Truck and the Mot's Island roster.** The Lava Truck is free from the King's Boat quest at Lumberton Harbor, or can be bought at the Shattered Outpost vehicle store. Lava Hauler, Lava Bike, Lava Thaw and Lava Roller are sold on Mot's Island, which is reached by a t200 boat ticket. The Hauler is used to collect "Forge Marks" (icy giants), and a new one spawns elsewhere when one is taken. No prices are listed. [Community] — [gameplay.tips DLC guide](https://gameplay.tips/guides/hydroneer-volcalidus-dlc-guide.html)
- **Lava Thaw dig tiers.** By default it only digs Tier 1 ice/snow. With one module it digs T1 and T2, and with two modules T1, T2 and T3. [Community] — [Steam: Hydro mole issues](https://steamcommunity.com/app/1106840/discussions/0/766310215831273156/)
- **No transfer between islands.** "You won't be able to take items or vehicles to Volcalidus." The DLC island is reached by a ship from Bridgepour harbour, which is a travel link and not a drivable boat. [Official] — [DLC launch post](https://steamstore-a.akamaihd.net/news/externalpost/steam_community_announcements/5756237364312335693)

**Hand carts and pallets**
- **1.6 (Jan 2021).** "Three variations of Hand Carts used to transport items around your base easily. New players start with one by default." They are sold at "Itchy's Hand Cart store located in Bridgepour". [Official] — [1.6 patch](https://steamstore-a.akamaihd.net/news/externalpost/steam_community_announcements/4483864038806701099)
- **Carrying a pallet.** "Player can no longer sprint and move slower while holding the pallet, to balance carts." [Official] — [1.6 patch](https://steamstore-a.akamaihd.net/news/externalpost/steam_community_announcements/4483864038806701099)
- **Later changes.** 2.0 "Cart movement reworked and improved." — [2.0 patch](https://steamstore-a.akamaihd.net/news/externalpost/steam_community_announcements/4348799082201741462). 3.0 "Carts are now wider to make it easier to store large items." — [MEGA PATCH](https://steamstore-a.akamaihd.net/news/externalpost/steam_community_announcements/5756237364312335366). [Official]

**Disposal**
- **Vehicles cannot be scrapped or sold.** Players "just park them aside" or build garages. The Creative Wand can destroy vehicles but blocks achievement progress. Carts also do not scrap. [Community] — [Steam: Scrapping vehicles](https://steamcommunity.com/app/1106840/discussions/0/4147320536951650582/); [Steam: Scrap Vehicles?](https://steamcommunity.com/app/1106840/discussions/0/4339860450387601579/)
- **Scrapyard burn zone.** It destroys items stored in a truck that is driven into it. A 3.0.4 fix addressed truck items that left the zone. Players report accidentally scrapping coins kept in the truck, including "about 12k" and "800k". [Official] — [3.0.4](https://steamstore-a.akamaihd.net/news/externalpost/steam_community_announcements/5756237364318958392); [Community] — [Steam: Scrap Vehicles?](https://steamcommunity.com/app/1106840/discussions/0/4339860450387601579/)

### Inferences
- The roster follows a "one vehicle, one job" pattern: haul, flatten, dig, prospect, harvest, lift. Each specialist vehicle is bought with soft currency or tokens and adds a single verb.
- The crane-truck-that-lifts-other-vehicles is a key loop in the DLC. It solves "heavy item logistics" without an inventory system.
- Vehicles behave like permanent physical objects, not consumables. There is no way to destroy them (outside creative mode), which causes clutter. An original game could add a sell-back or scrap option.

### Gaps
- No reliable coin prices for most vehicles. The only figure is a community estimate of about 1400 for the upgraded truck. The fandom wiki has no vehicle list page, and the wiki.gg wiki returned "Not authorized".
- No exact cargo-zone dimensions or item limits.
- No exact speed, mass or torque values were found anywhere public.

---

## 2. Handling and physics: speed, steering, suspension, rollover, terrain collision, cargo behaviour, engine implementation, bugs

### Takeaway
Vehicles have been reworked about four times: 1.5, 2.0, 2.1.2 and 3.0. Before 2.0, trucks were notorious for "pinging off into the atmosphere", which players called the "trucknado". The main cause was cargo items colliding with the truck's own wheels or body, plus physics load from many objects. From 2.0 onward, cargo is "stored" in a vehicle storage zone that snaps or attaches items rather than letting them slide freely. Handling has been progressively tuned for more traction and stability, and less rollover. Residual bugs remain: bouncing and floating when overloaded, and the diggers (Mole, Roller) jitter and dig unevenly.

### Cited Findings

**Handling changes by version [Official]**
- **1.5 (Oct 2020).** "Vehicles now have stronger 4 wheel drive strength." — [1.5 patch](https://steamstore-a.akamaihd.net/news/externalpost/steam_community_announcements/3854477638701252164)
- **1.6 (Jan 2021).** "Improved truck technical stability." — [1.6 patch](https://steamstore-a.akamaihd.net/news/externalpost/steam_community_announcements/4483864038806701099)
- **2.0 (May 2022).** — [2.0 patch](https://steamstore-a.akamaihd.net/news/externalpost/steam_community_announcements/4348799082201741462)
  - "Entire new vehicle system, will not ping off into the atmosphere anymore, and are fun to drive!"
  - "Complete vehicle rework - Trucks no longer fly off into the atmosphere and handle much better."
  - "Vehicles now collide with trees."
- **2.0 also improved hill climbing.** "Hydro Truck has more traction when going uphill, making more shortcut route to be made." [Wiki] — [Hydro Truck (Fandom)](https://hydroneer.fandom.com/wiki/Hydro_Truck)
- **2.1.** "Major vehicle optimisation." — [Farming Season patch](https://steamstore-a.akamaihd.net/news/externalpost/steam_community_announcements/4980448574112987724)
- **2.1.2 (21 Dec 2022).** "Overhauled vehicles completely." No detail given. — [2.1.2 patch](https://steamstore-a.akamaihd.net/news/externalpost/steam_community_announcements/5000716037439281378)
- **3.0 (Apr 2024).** "We've reworked the handling for all vehicles in the game to improve their mobility. Less likely to roll over and easier to drive!" — [Mar 2024 dev vlog post](https://steamstore-a.akamaihd.net/news/externalpost/steam_community_announcements/5686430301729334870). Also "Vehicle handling rework, all vehicles now handle better. Hydro Roller torque increased." — [MEGA PATCH](https://steamstore-a.akamaihd.net/news/externalpost/steam_community_announcements/5756237364312335366)
- **NPC collisions.** 3.0.6 fixed an "issue where NPCs could no longer be victims of vehicular collisions". Vehicles can hit and knock NPCs. [Official] — [3.0.6](https://steamstore-a.akamaihd.net/news/externalpost/steam_community_announcements/6474562312195671416)

**Cargo behaviour and the flying-truck bugs**
- **Pre-2.0 "trucknado".** "It seems like the issue is when somthing from the bed clips into the wheel. Reset the truck… check for anything in the bed clipping out of the bed and into the rear wheel, remove that item." Another player "spent a good half hour flipping end over end in the air" and "nearly lost all of my stuff". [Community, May 2020] — [Steam: Truck flies away](https://steamcommunity.com/app/1106840/discussions/0/2254559285375830696/)
- **Post-2.0 overloading.** Loading "more [than] 60 pipes and belts" makes the truck bounce and "float 1 block off the ground", and removing items fixes it (after 2.0.5). Another player loaded a pallet holding "just a dagger and a couple rings" and the truck "spun out of control… If I left it alone, it would settle on its roof, upside down." [Community] — [Steam: flying truck](https://steamcommunity.com/app/1106840/discussions/0/3283699172770909955/)
- **Stray items on the cab.** Two fish stuck to the top of the cab made the truck sink and fly. Removing them made it "popped back up on top of the road". Players attribute this to "bad physics of the storage area… mostly after loading it with conveyors." [Community] — [Steam: Flying Truck?](https://steamcommunity.com/app/1106840/discussions/0/3426690213934650055/)
- **Bouncing even when empty.** "Front tires sink into ground then spring back out. back tires are solid." Players disagree on the cause:
  - one says it is a weight effect from too many items
  - another says "It is amount of objects which lags physics engine and trucks get affected even they are empty".

  [Community] — [Steam: bouncing vehicles](https://steamcommunity.com/app/1106840/discussions/0/3395163747112385470/)
- **Cargo bug fixes [Official]**
  - 2.0.1: "Fixed issues where pallets would cause trucks to bug out… Various issues with the trucks storage are fixed… Wearing a hat that is stored in the truck will no longer make the truck go nuts." — [2.0.1](https://steamstore-a.akamaihd.net/news/externalpost/steam_community_announcements/4288001105332311583)
  - 2.0.8: "Improved palette storage on trucks." — [2.0.8](https://steamstore-a.akamaihd.net/news/externalpost/steam_community_announcements/4539082035566422293)
  - 2.1.1: "Certain items in the truck no longer cause the truck to fly off." — [2.1.1](https://steamstore-a.akamaihd.net/news/externalpost/steam_community_announcements/4980448574127321166)
  - 2.2.2: "Sometimes items stored in the back of truck no longer impact the trucks movement behaviour." — [2.2.2](https://steamstore-a.akamaihd.net/news/externalpost/steam_community_announcements/6539831519503928900)

**How the storage zone works (evidence that cargo is attached, not free physics)**
- **Coins in storage have no collision.** "Previously you were un-able to combine coins/tokens when they were stored in a truck/pan/bucket. This was due to them not having collision". [Official] — [Message from Max, Jan 2024](https://steamstore-a.akamaihd.net/news/externalpost/steam_community_announcements/6300039510120170533)
- **Stored items snap to the vehicle.** "Items placed down in build mode over a storage vehicle will no longer still be snapped to the vehicle after being picked up and dropped." [Official] — [Prospecting Update](https://steamstore-a.akamaihd.net/news/externalpost/steam_community_announcements/6539831519489700435)
- **Entering the zone locks items.** 3.0.7 "Fixed issue with items being locked as they enter the storage zone of the Quad / Bike." [Official] — [3.0.7](https://steamstore-a.akamaihd.net/news/externalpost/steam_community_announcements/5762994032406039149)
- **Removing items.** "Items no longer fly in a random direction when removing them from the Hydro Quad." [Official] — [MEGA PATCH](https://steamstore-a.akamaihd.net/news/externalpost/steam_community_announcements/5756237364312335366)
- **Stacking.** "Coins/Tokens/Seed Bags/Dirt/Cut Veg now stack whilst they're stored by a Truck/Pan/Bucket/etc." [Official] — [MEGA PATCH](https://steamstore-a.akamaihd.net/news/externalpost/steam_community_announcements/5756237364312335366)
- **No-clip area.** The wiki calls the truck bed a "no clip storage area". [Wiki] — [Hydro Truck (Fandom)](https://hydroneer.fandom.com/wiki/Hydro_Truck)
- **Vehicles can't ride in beds.** "I tried to place [the bike] in the back of the LH, but it just floated off when I put the LH in gear." Vehicles must hang from the crane hook instead. "You can stack everything but vehicles in the bed of the Hauler." [Community] — [Steam: Old truck vs hauler](https://steamcommunity.com/app/1106840/discussions/0/4361249459071690572/); [Steam: The Lava Hauler is a pain](https://steamcommunity.com/app/1106840/discussions/0/4361250750314068670/)
- **Bucket in the fuel hold.** Leaving a bucket inside the fuel hold "will stop moving and prevent the truck from moving". [Wiki] — [Hydro Truck (Fandom)](https://hydroneer.fandom.com/wiki/Hydro_Truck)

**Performance with large loads**
- **Wiki warning.** "Adding too much stuff on the back can cause lag when driving". [Wiki] — [Hydro Truck (Fandom)](https://hydroneer.fandom.com/wiki/Hydro_Truck)
- **3.0 fix.** "Moving around with a truck full of thousands of items will no longer lag… the game will no longer drop FPS while moving these in a truck." [Official] — [Mar 2024 dev vlog post](https://steamstore-a.akamaihd.net/news/externalpost/steam_community_announcements/5686430301729334870)

**Diggers**
- **Mole and Roller jitter.** Both "'jitter' and 'bounce' whenever they modify the terrain". The Mole "plummets almost vertically down when attempting to hollow out an area"; "TnT and Nukes are more precise". [Community] — [Steam: Hydro Mole controls are wack](https://steamcommunity.com/app/1106840/discussions/0/3821909708339467406/)
- **Mole cutting area.** "Even angled up it will dig a little bit in front of the moleminer, when you go slow, causing the miner tip forward and dig lower even more." The front of the track sometimes glitched through a ramp. [Community] — [Steam: Hydro Mole Controls](https://steamcommunity.com/app/1106840/discussions/0/6756004820879274611/)

**Lava Hauler crafting platform**
- Do not enter the Hauler on the crafting platform "before the press lifts back up, or it sends you flying across the map". [Community] — [gameplay.tips DLC guide](https://gameplay.tips/guides/hydroneer-volcalidus-dlc-guide.html)
- 3.0.6 fixed "Lava Hauler not storing small items" and "Improved collision in Lava Hauler". [Official] — [3.0.6](https://steamstore-a.akamaihd.net/news/externalpost/steam_community_announcements/6474562312195671416)
- A heavy harvester became stuck on the Hauler's bumper. Unstuck and recall didn't free it, and the only fix offered was a creative-mode wand. [Community] — [Steam: Heavy Lava Harvester stuck](https://steamcommunity.com/app/1106840/discussions/0/4365752839723693913/)

**Engine implementation**
- **Physics engine problems shaped multiplayer.** In 2021 the dev dropped true online multiplayer "due to issues with physics engines" and announced a "Complete rework of the game, and new physics engine" for 2.0. 2.0 shipped multiplayer as Steam Remote Play splitscreen "due to technical limitations of physics engines". [Official] — [Feb 2021 post](https://steamstore-a.akamaihd.net/news/externalpost/steam_community_announcements/4051520458173386771); [2.0 post](https://steamstore-a.akamaihd.net/news/externalpost/steam_community_announcements/4348799082201741462)

### Inferences
- **Engine implementation is unconfirmed.** I found no source saying whether Hydroneer uses UE4's PhysX WheeledVehicle (or ChaosVehicle) or a custom raycast-suspension setup. The "new physics engine" wording and the repeated full overhauls (2.0, 2.1.2, 3.0) suggest custom tuning or a re-implementation rather than stock settings. Treat this as unknown.
- **Design lesson: freely simulated cargo in a moving rigidbody bed is the main source of instability.** Hydroneer's eventual solution was a storage trigger zone that:
  - attaches items to the vehicle
  - disables their collision (coins had no collision when stored)
  - stacks stackables
  - releases them on removal.

  A browser game should parent cargo to the vehicle, or treat it as inventory with visual props, from day one.
- **Feel targets the dev chose:**
  - strong 4WD traction to climb hills and take shortcuts
  - low rollover tendency
  - trees as solid obstacles
  - NPCs knocked by vehicles.
- **Terrain-modifying vehicles need a clean cutting volume.** It should be fixed relative to the chassis, not tilting with the vehicle, or "jitter-dig" feedback loops make flat tunnels impossible.

### Gaps
- No numeric top speeds, accelerations, masses or suspension parameters.
- No documentation of whether vehicles take damage from collisions. None was found, and no source mentions vehicle damage or repair. Machines like harvesters do need repair ([Harvester wiki](https://hydroneer.fandom.com/wiki/Harvester)), but no vehicle repair is mentioned.
- There is no explicit "flip upright" key. The recovery methods are the Unstuck and Recall/Reset vehicle buttons in the Esc menu (see section 3).
- I found no evidence of whether 2026 console-port optimisations changed vehicle physics. The 2026 patch notes mention only general performance and localisation ([Mega-Optimization](https://store.steampowered.com/news/app/1106840)).

---

## 3. Controls, camera and recovery

### Takeaway
Default keys reported by players and sources:
- Q enters and exits a vehicle, and E picks up and drops items.
- WASD drives.
- F switches "Vehicle Mode" (the special function, such as crane mode).
- R, T and Y set the Mole's angle.
- Vehicles have a horn and automatic head, brake and reverse lights.

Gamepad driving moved in Jan to Apr 2024 to triggers for throttle and reverse with the stick for steering. Recovery from flips is menu-based, through "Unstuck" and "Recall nearest vehicle", not a physical unflip.

### Cited Findings
- **Basic keys.** "Press E to pick up and drop items, press q to drive a vehicle". [Wiki] — [Getting started](https://hydroneer.fandom.com/wiki/Getting_started_in_hydroneer)
- **Q also exits.** A player says to "hit Q real quick to get out of the truck". [Community] — [Steam: Truck flies away](https://steamcommunity.com/app/1106840/discussions/0/2254559285375830696/)
- **Tooltip and keybind changes [Official]**
  - 1.4: "Enter vehicle key tool tip now changes with the keybinding." — [1.4 patch](https://steamstore-a.akamaihd.net/news/externalpost/steam_community_announcements/4249665521683159651)
  - 2.0: "Vehicle key tooltip now shows the controller keybinding if using controller." — [2.0 patch](https://steamstore-a.akamaihd.net/news/externalpost/steam_community_announcements/4348799082201741462)
  - 3.0: "Keybind tips now appear when entering vehicles. Some vehicles have multiple actions, these keybind tips appear in the corner of the screen". — [Message from Max](https://steamstore-a.akamaihd.net/news/externalpost/steam_community_announcements/6300039510120170533)
  - 3.0.5: "Added keybind for 'Vehicle Mode' in vehicles. (Default 'F')" — [3.0.5](https://steamstore-a.akamaihd.net/news/externalpost/steam_community_announcements/5762993398268899735)
- **Lava Hauler crane (default keys).** F enters Crane Mode. W and S move the hook pulley out and in, A and D rotate the crane, and E attaches or releases the hook. C and Space lower and raise the load. Objects can stay on the hook while driving, and vehicles must ride on the hook, one at a time. [Community] — [Steam: The Lava Hauler is a pain](https://steamcommunity.com/app/1106840/discussions/0/4361250750314068670/)
- **Hydro Mole angle.** Set with the build rotation keys: "R is down, T is up and Y is horizontal". [Community] — [Steam: Hydro Mole Controls](https://steamcommunity.com/app/1106840/discussions/0/6756004820879274611/)
- **Mods can break vehicle keybinds.** [Community] — [Steam: Hydro mole is not exactly working](https://steamcommunity.com/app/1106840/discussions/0/4361249282377702124/)
- **Prospector.** RMB lowers the drill. [Community] — [Steam: prospector vehicle](https://steamcommunity.com/app/1106840/discussions/0/3821909708347621313/)
- **Gamepad [Official]**
  - "We also reworked vehicle controller input, you drive using left/right triggers for acceleration and the thumbstick to turn now". — [Message from Max](https://steamstore-a.akamaihd.net/news/externalpost/steam_community_announcements/6300039510120170533)
  - 3.0 adds "the ability to move the player camera closer/further away whilst in a vehicle and using a controller". — [MEGA PATCH](https://steamstore-a.akamaihd.net/news/externalpost/steam_community_announcements/5756237364312335366)
  - Partial controller support arrived in 1.6. — [1.6](https://steamstore-a.akamaihd.net/news/externalpost/steam_community_announcements/4483864038806701099)
- **Camera [Official]**
  - 1.6: "Vehicle camera can now pan up and down." — [1.6](https://steamstore-a.akamaihd.net/news/externalpost/steam_community_announcements/4483864038806701099)
  - 2.0.3: "Mouse inversion now works for vehicles." — [2.0.3](https://steamstore-a.akamaihd.net/news/externalpost/steam_community_announcements/5849624375836275751)
  - Players "zoom out and look around" while driving. [Community] — [gameplay.tips](https://gameplay.tips/guides/hydroneer-volcalidus-dlc-guide.html)
- **Horn.** "BEEP BEEP. Vehicles now have horns!" (2.1). [Official] — [Farming Season patch](https://steamstore-a.akamaihd.net/news/externalpost/steam_community_announcements/4980448574112987724)
- **Lights.** Headlights come on when driving forward, brake lights turn red when stopping, and reversing lights are white. A low-fuel warning light blinks on the truck's right side. [Wiki] — [Hydro Truck (Fandom)](https://hydroneer.fandom.com/wiki/Hydro_Truck)
- **Dynamic exit (3.0).** "If you're looking to the right, you'll exit on the right… if you're looking to the rear of the truck, you'll exit in the truck bed." The game also saves whether the player is in a vehicle. [Official] — [Mar 2024 dev vlog post](https://steamstore-a.akamaihd.net/news/externalpost/steam_community_announcements/5686430301729334870); [MEGA PATCH](https://steamstore-a.akamaihd.net/news/externalpost/steam_community_announcements/5756237364312335366)
- **Recovery**
  - 2.0: "Unstuck points now have separate locations for players and vehicles." [Official] — [2.0 patch](https://steamstore-a.akamaihd.net/news/externalpost/steam_community_announcements/4348799082201741462)
  - Unstuck while driving teleports the whole vehicle to a default location. "Recall nearby vehicle" teleports the vehicle to the nearest spawn point. [Wiki] — [Hydro Truck (Fandom)](https://hydroneer.fandom.com/wiki/Hydro_Truck)
  - "Hit esc and click the vehicle button on the bottom right" to reset. [Community] — [Steam: Flying Truck?](https://steamcommunity.com/app/1106840/discussions/0/3426690213934650055/)
  - 3.0.7 "Adjusted New Glade vehicle recall point." [Official] — [3.0.7](https://steamstore-a.akamaihd.net/news/externalpost/steam_community_announcements/5762994032406039149)
  - Recall "doesn't work as well, if you have MORE than one Truck". It recalls only the nearest vehicle, so players asked for a cycle-vehicle button or a garage summon point. [Community] — [Steam: Hydro mole issues](https://steamcommunity.com/app/1106840/discussions/0/766310215831273156/); [Steam: Truck flies away](https://steamcommunity.com/app/1106840/discussions/0/2254559285375830696/)
- **Mounting the truck on foot.** Climbing on top requires patient jumping near the platform, otherwise "you would clipping in and out causing you to fall out". [Wiki] — [Hydro Truck (Fandom)](https://hydroneer.fandom.com/wiki/Hydro_Truck)

### Inferences
- **No explicit handbrake key was documented.** Brake is likely S or reverse, given the brake-light and reverse-light behaviour. This is unverified.
- **Recovery is "teleport to spawn point" rather than an in-place unflip.** Community feedback wants recall-to-player or a garage. An original game could use a "reset upright in place" action plus a "summon to me" option.
- **The pattern is one generic "Vehicle Mode" key with on-screen context hints.** It works well for multi-function vehicles.

### Gaps
- I found no complete official keybinding table. The fandom wiki has no controls page with vehicle keys.

---

## 4. Fuel, damage, upkeep, cargo capacity and loading

### Takeaway
Fuel is a free but physical resource. Base-game vehicles drink water and DLC vehicles drink lava. You carry it in a bucket or pan and pour it into a roof tank: 4 bucket loads for a full refill since 2.0, down from 5. There is an empty-tank sound and a blinking low-fuel light. No source mentions vehicle damage, repair or other upkeep. Cargo is loaded by dropping items into a storage zone, such as the truck bed, quad rack or Hauler flatbed. The Hauler crane handles heavy machines and vehicles. Coins are physical items, so trucks double as wallets.

### Cited Findings
- **Water refuel.** Fill a bucket in a river, carry it to the truck, climb on top and pour it in. DLC trucks run on lava. The guide advises keeping a bucket on the back of every truck. [Community] — [TechRaptor refuel guide](https://techraptor.net/gaming/guides/how-to-refuel-trucks-in-hydroneer) (search snippet)
- **Refill size.** "Vehicles now take 4 water loads to refil instead of 5." (2.0) [Official] — [2.0 patch](https://steamstore-a.akamaihd.net/news/externalpost/steam_community_announcements/4348799082201741462)
- **Empty-tank sound.** "Vehicles now have an 'empty fuel tank' sound when empty." (1.7) [Official] — [1.7 patch](https://steamstore-a.akamaihd.net/news/externalpost/steam_community_announcements/4186652991113411288)
- **Water tank visuals.** "Vehicle lights no longer effect water fuel tanks visually." This implies the water tank is visible. [Official] — [Prospecting Update](https://steamstore-a.akamaihd.net/news/externalpost/steam_community_announcements/6539831519489700435)
- **Fuel is free.** "Either lava or water depending on the vehicle. The fuel is free, use you bucket or pan to collect and add to the fuel tank". [Community] — [Steam: vehicle](https://steamcommunity.com/app/1106840/discussions/0/4328601129275690100/)
- **Players often forget to refuel.** "The amount of times I forget to fuel my truck…" Keep spare pans of water or lava on hand. [Community] — [gameplay.tips](https://gameplay.tips/guides/hydroneer-volcalidus-dlc-guide.html)
- **Fishing from the truck.** The fuel tank is on the roof. Players park the truck backwards near water to fish, and caught fish drop into the truck's back. [Community] — [ShowGamer walkthrough](https://showgamer.com/en/kak-igrat-v-hydroneer)
- **Buying vehicles with physical coins.** Vehicles are bought by putting currency in a "purchasing bucket" on the vehicle display, as in "multiple currency types in a purchasing bucket of a vehicle". 3.0.7 also fixed coins duplicating "while purchasing vehicles". [Official] — [Prospecting Update](https://steamstore-a.akamaihd.net/news/externalpost/steam_community_announcements/6539831519489700435); [3.0.7](https://steamstore-a.akamaihd.net/news/externalpost/steam_community_announcements/5762994032406039149)
- **Capacity by vehicle**
  - The Quad has "limited storage space". [Official] — [Farming Season patch](https://steamstore-a.akamaihd.net/news/externalpost/steam_community_announcements/4980448574112987724)
  - Players use the truck for "medium stuff like basic machines and pipes/cables, and conveyors", the bike for hand tools and small items, and the Hauler for large building items and forge marks. [Community] — [Steam: The Lava Hauler is a pain](https://steamcommunity.com/app/1106840/discussions/0/4361250750314068670/); [Steam: Old truck vs hauler](https://steamcommunity.com/app/1106840/discussions/0/4361249459071690572/)
  - Players carry "500-600 pipes" in a truck. [Community] — [Steam: Scrap Vehicles?](https://steamcommunity.com/app/1106840/discussions/0/4339860450387601579/)
  - The dev references "a truck full of thousands of items". [Official] — [Mar 2024 dev vlog post](https://steamstore-a.akamaihd.net/news/externalpost/steam_community_announcements/5686430301729334870)
- **Hauler size.** The Hauler doesn't fit into some shops ("all but the electronic shop and the big forge"), so players bring the small truck into shops and then hook it onto the Hauler. [Community] — [Steam: Old truck vs hauler](https://steamcommunity.com/app/1106840/discussions/0/4361249459071690572/)
- **Mole.** It does not store dirt, unlike the removed Excavator. [Official] — [Prospecting Update](https://steamstore-a.akamaihd.net/news/externalpost/steam_community_announcements/6539831519489700435)
- **Magnets and stored items.** "Magnets no longer pull items that are stored in a pan/bucket". The patch-note wording also covers "pans/buckets etc." [Official] — [MEGA PATCH](https://steamstore-a.akamaihd.net/news/externalpost/steam_community_announcements/5756237364312335366)
- **No tipping beds.** No source mentions tipping or dumping beds. Unloading is manual pick-up, one item at a time with E, or in stacks. [Gap/inference]

### Inferences
- **Fuel as a physical carried resource** ties vehicles into the core no-inventory "carry everything" loop. It costs nothing but time and makes players plan around water and lava sources. It is a cheap mechanic that adds texture without punishing players.
- **No vehicle damage or upkeep.** This keeps the game cosy, and the only "risk" is physics glitches.
- **Large-volume dirt hauling is not a vehicle job in Hydroneer.** Dirt goes from shovels or buckets onto conveyors and into harvesters. Vehicles haul items, machines and coins.

### Gaps
- No exact fuel consumption rate or distance per tank.
- No confirmed tipping or hopper unloading mechanism for any vehicle.

---

## 5. Rails, minecarts, conveyors as transport, and moving bulk material across the map

### Takeaway
Hydroneer has no minecart or rail system and no drivable boats. I found no patch note or wiki page for either. The only boats are the ship to Volcalidus and the boat to Mot's Island, which are fixed travel links bought with tickets.

Bulk material moves in four ways:
1. **Within a base**, by conveyors: belts, vertical belts, splitters, mergers and centralisers.
2. **Shovelling dirt directly onto belts.**
3. **Through Icehelm "transporter pipes"**, which teleport items through a specific town.
4. **Across the map**, by trucks or haulers carrying items, plus hand carts and pallets for short distances.

### Cited Findings
- **Searches for rail and minecart turned up nothing.** Searches of the Hydroneer wiki for "rail", "trailer", "forklift" and "boat" return no pages, and none of the Hydroneer patch notes found mention minecarts or rails. [Wiki search via API, Nov 2026] — [Hydroneer Fandom API](https://hydroneer.fandom.com/api.php?action=query&list=search&srsearch=rail&format=json); [API dump of patch notes](https://api.steampowered.com/ISteamNews/GetNewsForApp/v2/?appid=1106840&count=400&maxlength=0&format=json)
- **Transporter pipes (2.0).** "Icehelm transporter pipes: send items directly through the abandoned city with ease." [Official] — [2.0 patch](https://steamstore-a.akamaihd.net/news/externalpost/steam_community_announcements/4348799082201741462)
- **Conveyor changes [Official]**
  - 1.3 conveyor rework with corner belts and barriers — [1.3](https://steamstore-a.akamaihd.net/news/externalpost/steam_community_announcements/3659688711190803493)
  - 1.4 "Lowered centre of gravity for resources to reduce rolling on conveyor belts and improve performance" — [1.4](https://steamstore-a.akamaihd.net/news/externalpost/steam_community_announcements/4249665521683159651)
  - 1.5 "Dirt can now be directly placed on a conveyor belt from a shovel" — [1.5](https://steamstore-a.akamaihd.net/news/externalpost/steam_community_announcements/3854477638701252164)
  - 2.0 "Conveyors now hook onto pipes", with hooks such as shredders and gem cutters — [2.0](https://steamstore-a.akamaihd.net/news/externalpost/steam_community_announcements/4348799082201741462)
  - 2.0.5 "Players can now walk up a Vertical Conveyor Belt" — [2.0.5](https://steamstore-a.akamaihd.net/news/externalpost/steam_community_announcements/4292505348839841359)
  - 2.2 "All items can now be magnetised and conveyored" — [Prospecting Update](https://steamstore-a.akamaihd.net/news/externalpost/steam_community_announcements/6539831519489700435)
- **Conveyors are water-powered.** The 1.4 notes say visual speed represents "pressure and physical speed". [Official] — [1.4](https://steamstore-a.akamaihd.net/news/externalpost/steam_community_announcements/4249665521683159651)
- **Bulk dirt refining.** Dirt chunks go into the top of a Harvester, which works with the Drill. [Wiki] — [Harvester (Fandom)](https://hydroneer.fandom.com/wiki/Harvester)
- **Bridgepour river shortcut.** It "makes travel time so much quicker… all veichles can get through it." [Wiki] — [Bridgepour (Fandom)](https://hydroneer.fandom.com/wiki/Bridgepour)
- **Travel links and DLC map size.** The ship from Bridgepour harbour goes to Volcalidus, which is "over 6 times the size of the original island", so vehicles matter more there. [Wiki/Official] — [Journey to Volcalidus (Fandom)](https://hydroneer.fandom.com/wiki/Journey_to_Volcalidus); [DLC launch post](https://steamstore-a.akamaihd.net/news/externalpost/steam_community_announcements/5756237364312335693)
- **Convoy tricks.** Players move several vehicles between claims by convoy, such as hooking the bike on the Hauler, or by jumping off plateaus as shortcuts. [Community] — [Steam: Old truck vs hauler](https://steamcommunity.com/app/1106840/discussions/0/4361249459071690572/)
- **A fixed train was suggested in 2020.** "Have a fixed train that goes to every shop and plot instead". It was never implemented, as far as I can find. [Community] — [Steam: trucks](https://steamcommunity.com/app/1106840/discussions/0/4120176169349450170/)

### Inferences
- **Rails are a gap and a differentiator.** Rails or minecarts (or a water-powered tram, in keeping with the hydro theme) are a clear opportunity for an original game. They also answer the 2020 community request.
- **Hydroneer's logistics split:**
  - conveyors for continuous flow inside a claim
  - trucks for batch moves of finished goods, machines and coins between claims, shops and towns
  - teleport pipes as a rare, location-specific convenience.

### Gaps
- No data on the range or capacity of the Icehelm transporter pipes.
- No reliable info on community mods adding rails.

---

## 6. Community opinions: what feels good and bad about vehicles

### Takeaway
Players value trucks for speed and for carrying "a whole base" at once. Upgraded trucks feel much better than the starter, and the small Lava Bike is liked for errands. The complaints centre on:
- pre-2.0 trucks launching into the sky and losing cargo
- residual bounce or float when overloaded
- the Hydro Mole and Roller being imprecise and jittery
- clumsy recall with multiple vehicles
- no way to scrap vehicles
- the Lava Hauler feeling "shoehorned in" and too big for shops.

A minority feel vehicles don't fit the game's tone.

### Cited Findings
- **Launch-era complaints.** "The dreaded trucknado". "Spent a good half hour flipping end over end in the air". The Recall Vehicle button "really should bring the truck to you". [Community] — [Steam: Truck flies away](https://steamcommunity.com/app/1106840/discussions/0/2254559285375830696/)
- **Vehicles out of place vs. worth it.** One player said vehicles "feel extremely out of place… the floaty ten meter wide truck tractor immersion is just gone". The reply: "Trucks make you go faster though. If you don't mind using unstuck once in a while, it's worth it." [Community, 2020] — [Steam: trucks](https://steamcommunity.com/app/1106840/discussions/0/4120176169349450170/)
- **Atmosphere objection.** Another player likes "the idea of a transportation system like a vehicle. I just do not think it fits well with the medieval atmosphere." [Community] — [Steam discussion](https://steamcommunity.com/app/1106840/discussions/0/2254559285382465726/)
- **Starter vs upgrade.** "The starting truck is CRAP… The more 'expensive' one is MUCH more maneuverable and has better acceleration, and the cost is quickly earned back in time saved." [Community] — [Steam: bouncing vehicles](https://steamcommunity.com/app/1106840/discussions/0/3395163747112385470/)
- **Hydro Mole complaints**
  - "Hydro Mole controls are wack": it is "barely possible to drill straight tunnels" and "so janky to the point of almost being unusable". — [Steam thread](https://steamcommunity.com/app/1106840/discussions/0/3821909708339467406/)
  - "EXTREMELY difficult to use… tends to dig downward even when set to straight… almost useless". Players prefer the Lava Thaw's layer-by-layer control. — [Steam: Hydro mole issues](https://steamcommunity.com/app/1106840/discussions/0/766310215831273156/); [Steam: Horrendous HydroMole](https://steamcommunity.com/app/1106840/discussions/0/595139465034392768/)

  [Community]
- **Mole wishlist.** A player wished the Mole "could store a small amount of dirt as a buffer and extrude it right in front of it's tracks to fill any unwanted holes", like Astroneer's paver. [Community] — [Steam: Hydro Mole Controls](https://steamcommunity.com/app/1106840/discussions/0/6756004820879274611/)
- **Lava Hauler.** "All around, that hulking beast feels shoehorned into the game." [Community] — [Steam: The Lava Hauler is a pain](https://steamcommunity.com/app/1106840/discussions/0/4361250750314068670/). Others call it "my number one vehicle" for large items and forge marks. [Community] — [Steam: Old truck vs hauler](https://steamcommunity.com/app/1106840/discussions/0/4361249459071690572/)
- **Picking up vehicles.** "Not being able to pick up vehicles is a pain in the butt". A Workshop mod reportedly fixes this for most vehicles. A player says of the bike: "I kinda like the bike. I wish there was one on Bastion. Nice for deliveries of the small stuff and cruising cross country". [Community] — [Steam: lava hauler](https://steamcommunity.com/app/1106840/discussions/0/686358202788437342/)
- **"Fun to drive" claim.** The dev's 2.0 pitch was that vehicles "are fun to drive", and the 3.0 handling pass targeted "less likely to roll over and easier to drive". [Official] — [2.0](https://steamstore-a.akamaihd.net/news/externalpost/steam_community_announcements/4348799082201741462); [Mar 2024 dev vlog](https://steamstore-a.akamaihd.net/news/externalpost/steam_community_announcements/5686430301729334870)

### Inferences
- **Good feel = fast traversal, strong hill-climb, forgiving rollover, huge carry capacity, contextual key hints, a horn and lights for charm.**
- **Bad feel = unpredictable physics with cargo, imprecise terrain tools, teleport-only recovery, no vehicle management.** That covers selling, scrapping, a garage and choosing which vehicle to summon.
- **Vehicles should be sized to fit the world's doorways and shops.** The Hauler's size friction is a cautionary example.

### Gaps
- I could not retrieve Reddit (r/Hydroneer) or YouTube transcripts within budget. The dev-vlog videos on vehicles (Sep 2022 "Vehicles we're adding to 2.1", YouTube Vlj3WHCA1YI; Mar 2023 digging vehicle, sW1eIncBTvc; Feb 2022 vehicle overhaul, t6TYdzFdga8) were identified but not transcribed ([Steam posts](https://store.steampowered.com/news/app/1106840)).
