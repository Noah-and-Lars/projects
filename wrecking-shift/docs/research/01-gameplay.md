# TEARDOWN: Gameplay and Design Research File

Research date: 2026-11-24. Purpose: reference for designing an original voxel-destruction game. This file lists facts, not recommendations.

**Source reliability key**
- **[OFFICIAL]**: Tuxedo Labs sources. These are teardowngame.com, the official FAQ, the modding API docs, Steam announcements pulled from the Steam News API, the Steam store, and Dennis Gustafsson's design-notes blog.
- **[WIKI]**: the community Teardown Fandom wiki (https://teardown.fandom.com). Its wikitext was pulled through the MediaWiki API. The wiki is detailed but community-maintained. Some pages are stubs or date from older versions (0.7–1.5).
- **[PRESS]**: reviews and news outlets.
- **UNCONFIRMED**: no primary or reliable secondary source was found.

---

## 1. Identity and timeline

| Item | Fact | Source |
|---|---|---|
| Developer | Tuxedo Labs, Malmö, Sweden, founded 2019 by Dennis Gustafsson. Gustafsson is credited as director, programmer and writer. Emil Bengtsson is credited as designer/artist, John Kearney as artist and Douglas Holmquist as composer. | https://en.wikipedia.org/wiki/Teardown_(video_game) |
| Engine | Proprietary voxel engine with built-in ray tracing. It began in 2017 after Gustafsson closed his studio Mediocre. Ray tracing "is part of the core voxel renderer and cannot be disabled". | Wikipedia; FAQ https://teardowngame.com/faq.html |
| Reveal | 1 Oct 2019 | Wikipedia |
| Early Access (Steam) | 29 Oct 2020. Launched with Part 1 of the campaign. | Steam store; [WIKI] Updates |
| Part 2 (v0.9) | 2 Dec 2021. Second half of the campaign, robots, tornadoes, new tools and maps. | Steam news "The complete campaign is here!" |
| 1.0 | 21 Apr 2022, "after 18 months in Early Access" | Steam news "Version 1.0 is finally here" |
| Price | $19.99, raised to $29.99 on 23 Mar 2023. At the time Tuxedo Labs cited "more than one million players". | Steam news 2023-03-16 |
| Acquisition | Saber Interactive (Embracer) acquired Tuxedo Labs on 1 Jul 2022, announced Aug 2022. In Mar 2024 Embracer kept Tuxedo Labs as a direct subsidiary when Saber was divested. In May 2025 it was announced that Tuxedo Labs would be spun off into Coffee Stain Group. | Wikipedia |
| Consoles | PS5 and Xbox Series X/S released 15 Nov 2023, published by Saber. Same day as v1.5: DX12, 9 languages, Season Pass, Time Campers DLC. | Steam news 2023-11-15; Wikipedia |
| Console performance | Series X / PS5: Performance mode 1080p at a 120 fps average target, Quality mode 2880×1620 at a 60 fps average target. Series S: 1440×810 at 60 fps. | FAQ |
| Sales | 1.1M copies by Aug 2022; 2.5M players by Dec 2023 | Wikipedia |
| Steam reviews (Nov 2026) | 95% positive of 77,353 English reviews ("Overwhelmingly Positive"); recent 96% | https://store.steampowered.com/app/1167630/Teardown/ |
| Metacritic | PC 80, PS5 78, Xbox Series 85. OpenCritic Top Critic Average 80, 74% recommend. | Wikipedia; https://opencritic.com/game/13035/teardown |
| Awards | IGF 2021 Excellence in Design (also nominated for the Seumas McNally Grand Prize). GDCA 2023 honorable mention, Best Technology. D.I.C.E. 2023 nominee, Outstanding Technical Achievement. Steam Awards nominee, Most Innovative Gameplay. PC Gamer: best sandbox game of 2022. | Wikipedia |
| Store pitch | "Plan and execute the perfect heist in a fully destructible world." The original pitch reads: "The moment you pick up your first target, an alarm goes off, and the heat is on. Run, jump, drive, slingshot, do whatever you need to collect all of the targets, and escape before security arrives." | Steam store; [WIKI] Teardown page |

---

## 2. Premise and story structure

- **Setting.** The fictional Swedish-flavoured **Löckelle Municipality**. The player runs **Löckelle Teardown Services (LTS)**, a demolition firm deep in debt. Legitimate demolition jobs turn into increasingly shady jobs for feuding clients ("a murky soup of revenge, betrayal, and insurance fraud"). [WIKI] Campaign https://teardown.fandom.com/wiki/Campaign
- **Delivery.** The story is told almost entirely through **one-way emails** read on the hub computer. Emails cannot be answered, so the player stays anonymous. Gustafsson says the protagonist intentionally has "no name, age, gender, or personality traits". Re-readable emails let players catch up after breaks. Story is also told through environmental changes between missions, object descriptions, themed valuables and an in-game TV. [OFFICIAL] Design notes, https://blog.voxagon.se/2020/11/05/teardown-design-notes.html
- **Later retcon.** The 2024 Character Update (v1.6) gave the player a name: **Sven Lagom**, son of **Tracy**, who forwards the first job. The LTS crew became selectable avatars: Lisa, Keiko, Maria, Fumiaki and Carlos Lagom. [WIKI] Player, Character menu
- **Main clients.** Gordon Woo (Evertides Mall owner, Villa Gordon), Lawrence Lee Junior (Lee Chemicals heir), Parisa Terdiman (police investigator), Gillian Johnson, Anton Wolfe, and the BlueTide CEO Mr. Amanatides. [WIKI] Missions
- **Part 2 arc.** BlueTide energy drink is laced with addictive drugs, with a drug lab on Isla Estocastica in the Muratori Islands. Amanatides builds the **Truxterminator**, a bomb truck guided by stolen Quilez robot AI and loaded with nitroglycerin, and sends it toward Tracy's house in Cullington. In the finale ("The final diversion") the player must divert the slow-moving truck (4 km/h) into the sea. [WIKI] Part 2, Truxterminator
- **Hub.** The LTS yard/warehouse. A **computer terminal** there has three tabs (see §9). Over Part 1 the hub visibly changes from "a decrepit warehouse into a lovely family home" (PC Gamer review), and the player restores a Castanet 500L GT car. Tool unlocks arrive at the hub **in crates you pick up**. [WIKI] Tools, Player; [PRESS] https://www.pcgamer.com/teardown-review/

---

## 3. Maps / locations

Campaign maps ([WIKI] Maps https://teardown.fandom.com/wiki/Maps). Wikipedia counts "nine levels"; the wiki counts 11 including the hub and Muratori Beach.

| Map | Notes |
|---|---|
| Löckelle Teardown Services | Hub/home. Abandoned train car, rusty cars, bunker, farm, river. The 1.0 update added a shooting range and snowballs. |
| Lee Chemicals | Forested chemical factory: brick buildings, dam, power lines, water. In Part 2 it is converted into "Racing Woonderland". |
| West Point Marina | Docks, boats, a retractable/freezable drawbridge, stilt cabins, yacht. |
| Villa Gordon | Large modern villa compound with a racetrack. Largest Part 1 map; Gustafsson says it is "a bit tedious to walk around". |
| Hollowrock Island | Fishing island turned BlueTide plant: three big houses, lighthouse, few land vehicles. Dense and compact; the designer's preferred style. |
| Evertides Mall | Mall, food court, construction site. Added in 0.7 (May 2021). |
| Frustrum | Small canal town with a river, train and storage units. Part 1 finale chase level, limited to 400 m by an AMD 3D-texture limit (design notes). |
| Muratori Beach | Tropical player base during the island arc. Sandbox map since 1.2. |
| Isla Estocastica | Tropical scrap-metal/concrete drug compound. |
| Quilez Security | Tall, snowy security-firm facility with vaults, laser deflectors and robots. |
| Cullington | Coastal town; finale only. Sandbox map since 1.0. |

Expansion maps: Tilläggaryd (Art Vandals; Villa Gordon used as hub); Western Camp hub, Combustown and Mineral Ravine (Time Campers); Granriket hub, Almondman's Farm, Glennburgh Docks and Möbel Mall (Folkrace); four space maps (Greenwash Gambit); Jaguar's Haven, Eagle's Perch and Serpent's Hollow (Relics of Barkuna). Multiplayer added **Splitfield Estate** and **Cratertown**, a mirrored map for team modes. [WIKI] Maps; Steam store pages; Steam news 2026-03-12.

**Level-design principle.** Because every wall can be broken, "the only real obstacles are elevation, distance, water, and unbreakable objects". Unbreakable objects are limited to rock formations and the ground. Levels are kept small and cluttered. [OFFICIAL] design notes

---

## 4. Campaign structure and mission types

- **Size.** The base campaign has **40 missions** ([OFFICIAL] Steam store) across 9 playable environments. Part 1 has 22 missions, ending with "The Chase"; Part 2 has 17 + 1 finale ([WIKI] Missions https://teardown.fandom.com/wiki/Missions). Side missions are marked light-blue on the terminal.
- **Win condition.** Complete all **required (yellow)** objectives and enter the **escape vehicle**. **Optional** targets raise score. Fail states: death; "alarm timer reaches 0" ("You failed to escape before security arrived. Make sure to plan properly."); a mission timer (Covert Chaos); being "busted" (Covert Chaos). [WIKI] Campaign
- **Mission types** ([WIKI] Missions):
  1. **Heist** (most common). Steal targets (computers, paintings, devices, safes, kegs, robots). Touching a target starts a 60 s alarm.
  2. **Destruction.** E.g. demolish a building or reduce its height ("The Old Building Problem", "The Tower").
  3. **Dump-in-water.** Safes, cars or robots must be pushed into water ("Making Space", "The Car Wash", "A Wet Affair", "Elena's revenge", "Droid dismount").
  4. **Vehicle theft.** Drive cars into a semi trailer ("Classic Cars", "Insurance Fraud").
  5. **Racing.** "The Speed Deal": racetrack in ≤30 s (optional tiers ≤25 s and ≤20 s).
  6. **Chopper-hunted, no timer.** "An Assortment of Dishes" (hack 5+4 devices while a security chopper hunts you), "Havoc in Paradise".
  7. **Chase.** "The Chase": escape the chopper across Frustrum.
  8. **Destruction-percentage.** "Covert Chaos" (Evertides Mall): destroy 50% / 70% / 90% of targets during fireworks, with a 2:00 timer and destruction sensors. Damaging the food court before the fireworks = busted.
  9. **Stealth vs. robots** (Part 2). E.g. "Ornament ordeal" with alarm robots.
  10. **Photo** ("Roborazzi": photograph 5 robots with a camera tool, range up to 70 voxels).
  11. **Escort/finale.** Divert the Truxterminator.
- **Weather and environment variants** add challenge: rain and lightning that starts fires ("Art Return", where fire alarms are the main threat), storm/tornado evacuation (Part 2, per Wikipedia), snow, ice-cold water in Part 2 (hypothermia).
- **Score and replay loop.** Each objective is worth score. Optional targets are deliberately placed to "break up the most efficient path" to required targets. Later tools make earlier missions easier, creating an "outer loop" of replaying old missions for score and rank. The Missions tab is separate from emails so players can see where score is available. [OFFICIAL] design notes. The maximum campaign score is **204**. [WIKI] Ranks

---

## 5. The core heist loop

### 5.1 Two-phase structure (from the designer)
- **Phase 1, planning/preparation.** **No time limit.** The player roams the level freely, cuts holes, builds plank bridges, stages vehicles and moves objects to build the fastest route. "The player decides when to start the action phase." [OFFICIAL] design notes. A hidden achievement, "Meticulous planner", is awarded for mission setup time over one hour. [WIKI] Achievements
- **Phase 2, execution.** Picking up or tampering with the first alarmed target starts the alarm countdown. The player must collect the remaining required targets (plus any optional ones) and reach the escape vehicle before it hits zero.
- **Why a timer and not resource scarcity.** Earlier builds had no timer. Restricting resources was rejected because it "just doesn't make the game fun" in a destruction sandbox. The timer's goal is to "offer a challenge even with a generous amount of tools and resources". [OFFICIAL] design notes
- **Why not a roaming chopper everywhere.** A chopper that chases the player was rejected as a general solution because randomness would undermine "the strategic thinking and careful planning that this game is all about". The chopper became a separate mission type instead. [OFFICIAL] design notes
- **Variant.** Some alarmed targets are attached to heavy objects (e.g. safes), so the player chooses between tinkering and making a run. [OFFICIAL] design notes
- **Saving.** There is **one quicksave slot**, "freely available at any time during preparation" and **disabled once the alarm sounds**. Big plan changes often require a full restart because of spent ammo, damaged vehicles or broken objects. The third mission deliberately forces a test-run → return-to-planning cycle "to communicate that this is the intended way to play". [OFFICIAL] design notes. Patch 0.4.6 added "Quickload available after restarting a level". [OFFICIAL] Steam news. Default quicksave/quickload key bindings are **UNCONFIRMED**.

### 5.2 Alarm timer
- The default is **60 seconds** after the alarm triggers. [WIKI] Security https://teardown.fandom.com/wiki/Security; Wikipedia
- The Options → Game tab (added 0.7.4) lets players adjust the timer: disabled, +15 s, +30 s, +60 s, −10 s or −20 s. Normal missions become 1:15, 1:30, 2:00, 0:50 or 0:40; Covert Chaos runs 2:00 by default. The same tab has ammo (+50%, +100%, no ammo) and health (+50%, +100%, −50%) toggles, **mission skipping**, and sandbox "unlock all levels/tools" options. [WIKI] Game Settings; [OFFICIAL] Steam news 2021-06-28
- **Security chopper (end-of-timer pressure).** In alarm missions the chopper flies onto the map when about **15 s remain**. It heads for the escape vehicle, and the mission fails if it reaches it. It does not fire in these missions. [WIKI] Security Chopper https://teardown.fandom.com/wiki/Security_Chopper

### 5.3 Alarm / security device types ([WIKI] Security, Missions)
- **Alarm boxes.** Grey boxes with red lights, wired to targets. They trigger when the target is tampered with, the box is broken or knocked loose ("becomes dynamic"), or the wire is cut. Most heists use them.
- **Fire alarms.** Invisible. They trigger the 60 s timer when fire "gets out of control". They appear in most missions without a major heist or chopper. Design consequence: blowtorch and fire can be used as a tool, but must be managed with the extinguisher.
- **Moisture sensors** on safes ("A Wet Affair"): the alarm triggers when the safe gets wet from rain or water.
- **Explosion sensors** ("Power Outage", "Motivational Reminder"): the alarm triggers when an attached object is broken.
- **Demolition sensors** (Covert Chaos).
- **Electric sensors** ("Malice in Woonderland").
- **Security terminals / hackable devices** ("The alarm system": hacking 2 terminals + 2 comm stations stops the alarm).
- Patch 0.4.6 "upgraded security for propane tanks, car alarms, and the power accumulator". [OFFICIAL]
- DLC variants: "gunpowder alarm boxes" (Time Campers), explosive traps (Folkrace).

### 5.4 Escape vehicle
- The player always **spawns at the escape vehicle**. It is shown as a green circle on the Tab map, and **can only be entered once all required objectives are done**. Entering it ends the mission; the vehicle then drives off in a straight line by script (it is not drivable). [WIKI] Escape Vehicle https://teardown.fandom.com/wiki/Escape_Vehicle
- Types: LTS **Van** (17 missions), **Cruise Boat** (21, used on water-heavy maps), red **Semi** with trailer (vehicle-theft missions), Small helicopter (Fetch challenge only), plus one-offs (Taskmaster 4WD, Speedboat, Patrol Boat).
- For missions that require bringing objects (safes, kegs, barrels, robots), the objects must be **moved to/into the escape vehicle**. [WIKI] Missions

### 5.5 Enemies

**Security Chopper** ([WIKI] Security Chopper):
- Armed with an autocannon, missiles and a spotlight.
- In chopper missions it arrives after the first objective is touched, or immediately in "Havoc in Paradise". It always knows the player's *general* area but fires only when the player is in its spotlight.
- If the player hides, it may fire missiles that make bomb-sized holes and can start fires. It beeps before firing.
- It reacts to loud noises (explosions, gunshots) by turning toward them. Players exploit this with decoys.
- It cannot be damaged.

**Robots** (Part 2) ([WIKI] Robots https://teardown.fandom.com/wiki/Robots):
- Humanoid Quilez and RoboSec models.
- Types: **Gun** robot (yellow eye light, short inaccurate bursts); **Flamethrower** robot (red light, chases); **Missile** robot (blue light, bursts of 2 missiles per launcher); **Alarm** robot (white camera; scans the player for **2 s**, then triggers the alarm); **Spider** robot (flamethrower + rockets).
- Driven by `robot.lua`. Vision is a 150° field of view at 25 m by default. Modes: investigate (goes to the last sound), chase, alarm, avoid, aggressive (wall-hack), practice.
- A bullet hit **stuns for 0.2 s**. Explosion stun = `clamp(1-(d-2)/6,0,1)*strength*4` seconds if >0.2 (code quoted on the wiki).
- Robots **can only be killed by submerging their body in water**, which is the basis of the "Droid dismount" and "The droid abduction" missions.

**Water and environment hazards:**
- Water slows the player and vehicles. Deep water ejects the player from vehicles.
- The player can drown, and gets hypothermia in Part 2's cold water.
- Wood, foliage and plastic float; heavy materials float only if their shape is buoyant.
- Fire hurts the player; explosions and falling hurt the player.
- Fire is capped at **100 simultaneous fires** by default.

Sources: [WIKI] Water, Fire, Voxels.

---

## 6. Tools (complete list with upgrade data)

General facts:
- 17 campaign tools, unlocked by rank (§8). Tools are grouped in the UI into five categories (added 0.8): **Unlimited, Utility, Firearms, Explosives, Enhancements**.
- Ammo is **per mission**: it refills each mission. In Sandbox all ammo is infinite.
- No tool can destroy the indestructible tier (ground, rock, heavy metal).

Stats below are from the [WIKI] infobox format "base–max (cost per upgrade step)". Units are the game's arbitrary units. Treat these as community-documented data.

| # | Tool | Rank / score | Breaks | Upgrades (base–max, $ per step) | Notes |
|---|---|---|---|---|---|
| 1 | **Sledge** | Start (0) | glass, foliage, dirt, wood, plaster, plastic, snow/grass | none | Unlimited melee. Cannot break brick, concrete or metal. Used as the game's icon. |
| 2 | **Spraycan** | Start | — (paints voxels yellow) | none | Route-marking; spray widens and fades with distance. Marks show on the Tab map. |
| 3 | **Extinguisher** | Start | — | none | Unlimited foam; the only way besides water or destroying voxels to stop fire. Key to avoiding fire alarms. |
| 4 | **Blowtorch** | Amateur (5) | glass, foliage, wood, plastic, **weak metal**, snow | Fuel 20→60 **seconds**, +10 s per $100 | Ammo is measured in seconds, which makes it the most precise cutter. Starts fires. Cannot cut brick or plaster. Typical use: cutting gate hinges. |
| 5 | **Shotgun** | Novice (10) | everything up to brick, concrete and weak metal | Shells 12→96 (+12, $200, ×7); range 20→60 (+20, $300, ×2); damage 3→5 (+1, $400, ×2) | Pellet spread with damage falloff. "Shotgun now behaves more like a shotgun" (0.9.5). Wiki PvP figure: 10 pellets × 8 damage. |
| 6 | **Plank** | Trespasser (15) | — (construction) | Count 8→64 ($150); width 3→5 ($200); max length 40→64 ($300) | Placed by click-drag from point to point. Bridges, supports and fastening objects together. Can't be stretched apart but breaks under tools. |
| 7 | **Pipe Bomb** | Breaker (20) | **all destructible incl. hard masonry and hard metal** | Count 6→36 ($200); blast 2→4 ($500) | The only throwable explosive. Fuse; imprecise; can backfire; may ignite. |
| 8 | **Gun** (pistol) | Crook (30) | up to brick, concrete and weak metal | Rounds 6→36 ($200); range 40→100 ($300); damage 1→3 ($300) | Precise and long-range with low damage. Used to detonate distant nitro. Originally called "Handgun". |
| 9 | **Bomb** | Wrecker (40) | all destructible | Count 6→36 ($400); blast 4→6 ($500) | Placed on a reachable surface; ~2.5–3 s timer; walk-through-sized hole. "The Tower" grants 10 extra (46 max). |
| 10 | **Cable/Wire** | Talented (50) | — | Count 6→24 ($300); stretch 3→5 ($400) | Rope between two points with no collision. It pulls harder when stretched near max length; the preview turns red as it approaches max. Breaks from one bullet. Used to tow safes behind vehicles and to hang objects. |
| 11 | **Rocket launcher** | Ballistic (60) | all destructible | Count 6→24 ($500); blast 3→5 ($750) | Slow projectile with heavy drop; low precision; slightly weaker than a bomb. |
| 12 | **Leaf Blower** | Crackerjack (70) | nothing | Power 20→50 ($200) | Pushes objects and debris, boosts fires, clears snow. The only upgradeable "unlimited" tool. |
| 13 | **Rocket Booster** | Professional (80) | — | Count 6→24 ($500); power 200→400 ($750); duration 4→8 s ($750) | Placeable thruster for any dynamic object; activated with interact (E); burns out. |
| 14 | **Vehicle Thruster** | Midnighter (90) | — | Count 6→24 ($500); power 200→400 (wiki lists $100; possibly a wiki error) | Placeable only on vehicles; tied to throttle/reverse; permanent until destroyed; reduces handling. |
| 15 | **Nitroglycerin** | Expert (100) | all destructible | Count 4→16 ($400); blast 5→8 ($600) | Sticky canister with no fuse; explodes when damaged. Can be chained. Even un-upgraded it is as strong as a maxed bomb. The most destructive vanilla tool. |
| 16 | **Hunting Rifle** | Top Dog (110) | up to brick, concrete and weak metal | Rounds 6→18 ($400) | Scoped; longest range; **penetrates multiple obstacles**; slow fire rate. |
| 17 | **BlueTide** (energy drink) | Hot Shot (120) | — | UNCONFIRMED | Consumable; boosts the player's move speed and jump height. Magnitude and duration are UNCONFIRMED. |

Sources: [WIKI] Tools https://teardown.fandom.com/wiki/Tools and individual pages for Sledge, Blowtorch, Shotgun, Plank, Pipe_Bomb, Gun, Bomb, Wire, Rocket, Leaf_Blower, Rocket_Booster, Vehicle_Thruster, Nitroglycerin and Hunting_Rifle; Ranks (Campaign).

**Fully-upgraded ammo by difficulty setting** ([WIKI] Game Settings):

| Setting | Blowtorch | Shotgun | Plank | Pipe bomb | Gun | Bomb | Rocket |
|---|---|---|---|---|---|---|---|
| Default | 60 s | 96 | 64 | 36 | 36 | 36 | 24 |
| +50% | 90 s | 144 | 96 | 54 | 54 | 54 | 36 |
| +100% | 120 s | 192 | 128 | 72 | 72 | 72 | 48 |

**Temporary and mission tools:**
- Minigun: 500 rounds in Covert Chaos, 75 in Elena's revenge.
- Camera (Roborazzi).
- Snowball: a hub toy after a Part 2 mission.
- A laser used to melt Quilez vault doors (story).

**Built-in example-mod tools:** Laser Gun (60 s of cutting through most materials, starts fires), Smoke Gun, Minigun. Others such as a jetpack, slow-motion and the "Treasure Hunter" valuable finder were official Workshop mods. [WIKI] Mods

**DLC tools:**
- Art Vandals: Jackhammer (unlimited close-range chipper that breaks most materials), cellphone hub, newspaper launcher.
- Time Campers: Old West reskins (Blow Lamp, Rope, Rifle, dual Revolvers, Dynamite, Dynamite Bundle, TNT, "Horse Punch" = BlueTide) plus the new Gunpowder Barrel, which lays an ignitable powder trail. Horses serve as transport.
- Greenwash Gambit: "new tools for traversal and destruction" equipped via a spacesuit. Individual names are UNCONFIRMED.
- Relics of Barkuna: "five new tools". Names are UNCONFIRMED.

[WIKI] Tools; Steam DLC pages.

### 6.1 Material hardness tiers (what breaks what)
Voxels are **10 cm cubes**. There are **13 voxel materials**, and the main gameplay properties are buoyancy, strength and weight ([WIKI] Voxels https://teardown.fandom.com/wiki/Voxels). The community tiering:

1. **Extremely soft**: grass, foliage, glass, wood, plastic, ice, "unphysical" (snow and grass decals). Anything breaks these.
2. **Very soft**: dirt, plaster. Not breakable by the blowtorch.
3. **Soft**: weak metal. Not breakable by the sledge.
4. **Medium**: brick, concrete. Not breakable by the blowtorch or sledge; firearms and explosives work.
5. **Hard**: hard masonry, hard metal. Explosives (and some firearms per the tier text) only.
6. **Very hard**: hard metal. Explosives only.
7. **Indestructible**: heavy metal, rock/bedrock, ground.

The tier 5 and 6 entries partly contradict each other on the wiki; the tool infoboxes list hard masonry and hard metal as breakable only by explosives. The designer's stated intent is "detailed precision work rather than total mayhem". [OFFICIAL] design notes

**Structural note.** Teardown does **not** simulate structural stress. A building can stay up on a single voxel, and only disconnected parts fall. Critics name this as the main realism criticism (PC Gamer; Wikipedia "unrealistic voxel support"). Version 0.7 improved physics so "large buildings fall properly when disconnected". [OFFICIAL] Steam news 2021-05-11

---

## 7. Player controller

| Aspect | Fact | Source |
|---|---|---|
| Perspective | First-person, plus a third-person toggle since v1.6 (Oct 2024). Vehicles use a third-person camera. | Steam news 2024-10-10; Wikipedia |
| Default controls (PC) | WASD move, Space jump, Ctrl crouch, E interact / enter vehicle, LMB use tool, RMB grab (hold), RMB + LMB throw, RMB + mouse wheel adjusts grab distance, F flashlight, Tab map, 1–9 / mouse wheel select tool, Esc pause | Logical inputs from [OFFICIAL] API https://teardowngame.com/modding/api.html; key mapping from press guides (search results: gamerjournalist.com, gameskeys.net) |
| Logical input list | up, down, left, right, interact, flashlight, jump, crouch, usetool, grab, handbrake, map, pause, vehicleraise, vehiclelower, vehicleaction, tool_group_prev/next, photomode, zoom. There is **no sprint input** in the official list. | [OFFICIAL] API |
| Walking speed | Base walking speed is a settable param (`walkingSpeed`). The official API example uses **7.0** (normal) vs 15.0 (modded "sprint"). The real speed is modified by health, crouch, water and grabbed objects. | [OFFICIAL] API (`SetPlayerWalkingSpeed`) |
| Crouch | Separate crouch speed scale (API example values 3.0/5.0); exact default UNCONFIRMED | [OFFICIAL] API |
| Hurt slowdown | Default "hurt speed scale" = **2/7 (~0.29)**: speed is interpolated toward it as health drops | [OFFICIAL] API (`SetPlayerHurtSpeedScale` comment) |
| Jump | `jumpSpeed` param exists; default value UNCONFIRMED | [OFFICIAL] API |
| Health | Normalized 0–1; **regenerates** by default (`healthRegeneration`, `SetPlayerRegenerationState`). Damage sources: explosions, fire, cold water, falling, bullets, drowning. At default health, 2 fully-upgraded bombs kill the player (1 at −50% health, 3 at +100%). | [OFFICIAL] API; [WIKI] Campaign, Game Settings |
| Fall damage | Exists ("falling ... can hurt you"); damage curve UNCONFIRMED | [WIKI] Campaign death message |
| Climbing | No dedicated climb/mantle or ladder mechanic was found. Vertical traversal relies on jumping, stacking objects, planks, cables, vehicles (lifts, cranes) and destruction. UNCONFIRMED whether small steps are auto-climbed. | — |
| Grab / carry / throw | Hold RMB on any non-welded dynamic object to hold it in front of you; LMB while holding throws it. Throw distance depends on size and weight. Heavier objects slow the player. Heavy items such as safes require vehicles or cables ("loads heavier than what the Player can carry"). **The exact mass limit is UNCONFIRMED.** | [WIKI] Vehicles; [OFFICIAL] API note on grabbing affecting speed; press guides |
| Flashlight | Toggle; can be disallowed by scripts | [OFFICIAL] API |
| Friction | Player body friction default 0.8 | [OFFICIAL] API |
| Characters | Default LTS crew plus unlockables (e.g. drown 100 robots, destroy the Hollowrock lighthouse lamp, finish DLCs). Since 1.6 modders can make custom characters (not usable in multiplayer). | [WIKI] Character menu; FAQ |

---

## 8. Economy, progression and ranks

- **Cash** comes mainly from **valuables** hidden around maps. Values range from $1 (a trashed bouquet) up to $800 (a crock of gold) and **$1,500** (a stack of gold bullions, Hollowrock). Most valuables are $15–$400. Many are themed jokes or story hints. Some valuables come in mutually exclusive groups (taking one makes the others unobtainable). Whether collected valuables respawn on replay is UNCONFIRMED. Achievements exist for finding 50, 100 and 200 valuables. [WIKI] Valuables https://teardown.fandom.com/wiki/Valuables; Achievements
- Whether missions also pay cash directly is **UNCONFIRMED**. The wiki describes valuables as "the primary source of money".
- **Spending.** Cash buys tool upgrades at the hub computer's Tools tab (costs in §6). Upgrades **carry into Sandbox**, which gives players a reason to collect valuables. [OFFICIAL] design notes
- **Score → rank → tool unlock** ([WIKI] Ranks (Campaign)):

| Score | Rank | Reward |
|---|---|---|
| 0 | Demolisher | Sledge, Spraycan, Extinguisher |
| 5 | Amateur | Blowtorch |
| 10 | Novice | Shotgun |
| 15 | Trespasser | Plank |
| 20 | Breaker | Pipe bomb |
| 30 | Crook | Gun |
| 40 | Wrecker | Bomb |
| 50 | Talented | Cable |
| 60 | Ballistic | Rocket |
| 70 | Crackerjack | Leaf blower |
| 80 | Professional | Rocket booster |
| 90 | Midnighter | Vehicle thruster |
| 100 | Expert | Nitroglycerin |
| 110 | Top Dog | Hunting rifle |
| 120 | Hot Shot | BlueTide |
| 130 | Genius | $1,000 |
| 140 | Savant | $2,000 |
| 160 | Guru | $3,000 |
| 180 | Mastermind | $4,000 |
| 200 | Virtuoso | $5,000 |

- **Sandbox unlock gating.** Sandbox environments and tools are locked behind campaign progress to avoid spoilers. "The first three environments can be unlocked after completing just five missions." [OFFICIAL] design notes. An option to unlock everything was added in 0.7.4.
- **Achievements** (27, added in 1.1, June 2022) reward play styles, for example:
  - "Bare bones": a mission with no tools
  - "The floor is water": Flooding without getting wet
  - "Liftoff": 2 s of airtime in a car
  - "McFly": over 88 mph
  - "Speedrunner": a mission under 60 s
  - "Whoops", "Wasn't me", "Now what": 1M, 10M and 100M voxels destroyed

  [WIKI] Achievements

---

## 9. HUD / UI / map / photo mode

- **Hub terminal (computer)** ([WIKI] Terminal):
  - **Messages**: emails; side jobs are highlighted.
  - **Missions**: a map of Löckelle where you pick missions, replay them, or skip them if the option is enabled.
  - **Tools**: view and upgrade tools.

  Rank and score are shown on the computer and in the top-left HUD. [WIKI] Ranks
- **Map view (Tab).** A zoomed-out overview that shows the escape vehicle (green circle) and targets. Spraycan marks are visible on it, so players use it for route planning. [WIKI] Spraycan, Escape Vehicle. Exact rendering details (x-ray/top-down) are UNCONFIRMED.
- **Tool selector** reworked in 0.8 into categories, and redesigned again for PC in 1.5.1. [OFFICIAL]/[WIKI] Updates
- **Objective HUD.** Required targets are yellow; optional targets are listed separately (their colour is UNCONFIRMED). Alarm countdown on screen. Health meter. Low-health screen blur is configurable by mods (`SetLowHealthBlurThreshold`). [WIKI] Campaign; [OFFICIAL] API
- **Photo mode** (0.7.2, May 2021; free camera, rotate/tilt and zoom in 0.7.4). Options: depth of field, exposure, bloom, zoom, show/hide tool. Disabled in multiplayer. [OFFICIAL] Steam news; [WIKI] Photo Mode; FAQ
- **Other:**
  - Built-in Screen Recorder mod (0.9.5)
  - Spawn menu (0.9.5), for spawning vehicles and props from mods; redesigned 1.5.1
  - Adjustable weather and time of day in sandbox (0.8)
  - Creative Mode (1.4, Jun 2023): build voxel objects from wood, brick, metal and other materials, then save and spawn them. Available on consoles.

---

## 10. Vehicles

- **Destructibility.** All vehicles are voxel objects and can be damaged, but per [WIKI] Vehicles **frames and wheels are indestructible**. The API exposes vehicle **health 0–1** and a `brokenthreshold` param. A custom-health tag can disable "the common vehicles damage system". [OFFICIAL] API. Folkrace (2024) added "an enhanced vehicle destruction system". [OFFICIAL] Steam news
- **Handling parameters** exposed in the API: spring, damping, topspeed, acceleration, strength, antispin, antiroll, difflock, steerassist, friction, plus a per-wheel drive/steer/travel setting. Controls: throttle, brake/reverse, handbrake, and "vehicleraise/vehiclelower/vehicleaction" for crane booms, excavator arms, forklift forks and dump beds. [OFFICIAL] API
- **Driving rules.** Enter and exit with interact (E). Water deep enough ejects the player. Vehicles are the main way to move heavy loads (safes on forklifts, containers via cranes) and to ram through walls. Construction and military vehicles are the best demolishers. [WIKI] Vehicles, Water
- **Roster (base game):**
  - **Civilian**: Castanet 500L GT, Cayuse 550, Crownzygot XVC, Drab 75, Defender, Eurus IV XXF, Gauss-Seidel B50, Golf Cart, Gordo Pathracer XTRM, Ice Cream Truck, Jacobi SL, Modern Station Wagon, Monster Truck, Microcar, Semi, Single-unit truck, Station Wagon, SUV, Taskmaster 4WD, Van, Food Cart.
  - **Industrial**: Cement Truck, Dump Truck, Excavator, Front Loader, Mini Excavator, Utility Truck, Snow plough.
  - **Military**: Rocket Van, Tank, Military Truck/Trailer/Van.
  - **Utility**: Basket Lift, Forklift, Industrial Forklift, Mobile Crane, Telehandler, Warehouse Forklift, Woodchipper.
  - **Boats**: Big Fishing Boat, Cruise Boat, Race Boat, Small Boat, Speedboat, Yacht, Tour Boat, Patrol Boat.
  - **Misc**: Bumper Car, Tractor.
  - **Non-drivable**: Bus, Police Car, Small Helicopter, Security Chopper, Truxterminator.

  [WIKI] Vehicles https://teardown.fandom.com/wiki/Vehicles
- **Top speeds (km/h)** ([WIKI] Vehicles):
  - Crownzygot / Eurus 120
  - SUV / Drab 75 / Cayuse 90
  - Tank 88
  - Castanet / Station wagons / Microcar 80
  - Monster Truck / Taskmaster 75
  - Van / Ice cream truck 70
  - Semi / Speedboat 69
  - Jacobi SL 60
  - Cruise Boat 33
  - Front Loader 27
  - Dump Truck 25
  - Mobile Crane 19
  - Forklift 16
  - Excavator 11
  - Woodchipper 4
- **Folkrace DLC** adds almost 30 race vehicles in classes Wagon, Off-roader, Sports, Van, Monster truck and Industrial, with Stock/Sport/Pro upgrade tiers (e.g. Midori 80 → 88 → 112 km/h). [WIKI] Folkrace, Vehicles
- **Teardown Rally (free update)** adds 18 new vehicles (12 rally cars and 6 monster trucks). [OFFICIAL] Steam news 2026-09-30
- **Löckelle Motor Park**: an obstacle course with two monster trucks. Originally an Xbox pre-order bonus; made a free built-in mod in Dec 2023. [OFFICIAL] Steam news 2023-12-19

---

## 11. Other modes

- **Sandbox.** No timer, **infinite ammo**, maps unlocked through the campaign (or via the option). Sandbox map variants add special vehicles (Monster Truck on most maps, Yacht, LTS Van/Cement Truck in Cullington). Adjustable weather and time of day; spawn menu. [WIKI] Sandbox
- **Challenges** (added 0.5.2, Dec 2020; played on any unlocked map). [WIKI] Challenges, Mayhem/Hunted/Fetch Challenge pages; [OFFICIAL] Steam news 2020-12-22.
  - **Mayhem** (unlocked after "The Lee Computers"): destroy as many voxels as possible in **60 s**. The **timer only starts after 1,000 voxels are destroyed**, so players can prepare first. Stars come every 200,000 voxels, up to 5★ at 1,000,000. Each map has "A Nobel Explosive" trucks carrying 3 colour-coded cases (2 remote bombs + remote each), 6 small propane canisters, and a propane tanker truck.
  - **Hunted** (unlocked after "An Assortment of Dishes"): chests spawn one at a time at random locations, with **no time limit**, while an aggressive chopper hunts you. 1★ per 5 chests; a 2nd chopper arrives at 15 chests (3★); "hard mode" starts at 25 (5★).
  - **Fetch** (added 0.7.2; unlocked after "The Login Devices"): 15–17 alarmed chests per map. Grab as many as possible and reach the escape vehicle within 60 s. 2/4/6/8/10 chests = 1–5★.
- **Creative Mode** (1.4) and the **level editor** (0.5.5): the editor uses MagicaVoxel `.vox` files, Lua scripts and node types (body, shape, joint, rope, vehicle, wheel, water, trigger, light, screen, voxscript and others). Steam Workshop arrived in 0.6 (Mar 2021) with ~100 mods at launch. Over 6,000 mods existed by Sep 2023. [WIKI] Level Editor; [OFFICIAL] Steam news; Wikipedia

---

## 12. DLCs and major updates

| Date | Content | Key facts | Source |
|---|---|---|---|
| 15 Dec 2022 | **Art Vandals** (free) | 5-mission mini-campaign as Freya Woo in Tilläggaryd. Jackhammer tool. Built entirely as a mod to teach modding. | Steam news 2022-12-05/15; [WIKI] |
| 15 Jun 2023 | **Creative Mode** (v1.4) | Build and save voxel objects | Steam news |
| 15 Nov 2023 | **v1.5 + consoles + Season Pass + Time Campers** | Time Campers: Old West time-travel campaign, 9 missions, horses, gunpowder barrel. $7.99; the Season Pass was $29.99 for 4 DLCs. Console Mod Packs began. | Steam news 2023-09-28, 2023-11-08; FAQ |
| 19 Dec 2023 | Löckelle Motor Park free | Obstacle course plus 2 monster trucks | Steam news |
| 17 Apr 2024 | Modder update | Mod editor accessible from the main menu; new APIs | Steam news |
| 19 Jun 2024 | **Folkrace** | Granriket hub. 9 championship cups (3 events each) plus 6 extras. Race types Banger, Derby, Elimination against AI drivers. ~30 vehicles; 5 hub heists. Enhanced vehicle destruction. | Steam news 2024-06-19; [WIKI] Folkrace |
| 10 Oct 2024 | **v1.6 Character Update** | Third person, playable characters, Merlin ragdoll, animation API, custom characters | Steam news |
| 24 Jun 2025 | **The Greenwash Gambit** | Space campaign: **14 missions, 4 maps**, "aerospatial tools", zero-gravity mechanics, gravity-changing crystals, an artificial black hole. Antagonist E.F.O. Corp. Steam 78% positive. Multiplayer co-op added 18 Aug 2026 (2–4 players recommended, up to 12). | Steam news 2025-06-24, 2026-08-18; Steam page |
| 12 Mar 2026 | **Multiplayer (v2.0)** | See §13 | Steam news |
| 10 Jun 2026 | **Relics of Barkuna** | Explorer James Thorvaldsson. 3 maps (jungle, cliffs, lava). Puzzles, over 240 relics, 5 new tools, "solve puzzles or brute-force". Single-player only. Steam 75% positive. The Ultimate Bundle replaced the Ultimate Edition. | Steam news 2026-06-10; Steam page; Wikipedia |
| 15 Sep 2026 | Console multiplayer + Mod Pack 6 | Free. Includes 30 new MP mods (Battle Royale, Vehicle Sumo, Prop Hunt) and over 40 updated mods from packs 1–4. | https://www.purexbox.com/news/2026/09/teardowns-massive-multiplayer-update-is-out-now-adding-several-new-game-modes-for-free |
| 3 Nov 2026 | DLSS and FSR upscaling (DX12 only) | — | Steam news |
| **8 Dec 2026 (announced)** | **Teardown Rally**, free | Races, tournaments and cups for up to 12 players. Maps include Frozen Lake and Quarry. 12 rally cars + 6 monster trucks. "Hop out, wreck your opponents' vehicles". | Steam news 2026-09-30, 2026-11-23 |

**Editions:**
- Standard
- Deluxe: consoles only; adds Time Campers and Folkrace
- Ultimate: base game + Season Pass covering Time Campers, Folkrace, Greenwash Gambit and Relics of Barkuna
- Steam Ultimate Bundle: $61.95 list

The Quilez R0113R Robot pack is now a built-in mod. [OFFICIAL] FAQ; teardowngame.com

**Consoles:**
- No Steam Workshop. Curated, numbered free "Teardown: Mod Pack" releases instead (6 by Sep 2026).
- No cross-progression and no crossplay.
- No mouse/keyboard support planned.
- No PS4, Xbox One, Switch or VR versions are planned.

[OFFICIAL] FAQ

**Sequel.** As of Nov 2026, **no official sequel has been announced**. A Baidu wiki claim of a "Teardown 2025" sequel is uncorroborated and treated as false or unreliable. The 24 Nov 2026 Steam post ("Six years of Teardown") says "we're not quite done smashing things yet" and points to Rally. Gustafsson's current role is **UNCONFIRMED**.

---

## 13. Multiplayer (v2.0)

- **Timeline.**
  - Announced Mar 2025.
  - Dev diaries Jul–Dec 2025: 8-player deathmatch clips, and a 4-player campaign heist that "requires a lot of teamwork".
  - Open beta on the experimental branch, 17 Dec 2025.
  - PC release 12 Mar 2026.
  - Consoles 15 Sep 2026.

  Steam peaked at a record 15,172 concurrent players after the update. [OFFICIAL] Steam news; Wikipedia
- **Modes:**
  - **Co-op campaign**: the full 40-mission base campaign.
  - **Sandbox.**
  - **Competitive**: Deathmatch, Team Deathmatch, Capture the Flag.
  - **Treasure Thieves**: built-in mode on Splitfield Estate. Its exact rules are UNCONFIRMED.

  New maps: Splitfield Estate and Cratertown (mirrored for team modes). Wikipedia states up to 12 players for co-op and competitive play. Community multiplayer mods at launch included The Floor Is Lava, Battle Royale, Vehicle Sumo and Prop Hunt. [OFFICIAL] Steam news 2026-03-12; https://www.gamespress.com/DROP-THE-BOOM-TEARDOWN-S-ONLINE-MULTIPLAYER-UPDATE-BLASTS-ONTO-STEAM-T
- **Architecture** ([OFFICIAL] API intro, FAQ):
  - **Listen-server**: the host is the server. No dedicated servers. A server list exists. If the host leaves, the session ends.
  - Lua scripts are split into `server`, `client` and `shared` tables. Fixed update runs at 60 Hz.
  - Mods auto-download for joiners and must match the host exactly.
  - Object spawn limits exist.
- **Co-op campaign rules.** Players use the **host's progress**, and only the host's progress advances. Achievements are single-player only. There is no built-in voice or text chat. Photo Mode and Creative Mode are disabled. Friendly fire is "undecided". [OFFICIAL] FAQ
- Online only (no split-screen); no crossplay. Console multiplayer requires PS Plus or Game Pass Core. [OFFICIAL] FAQ
- The tools have PvP damage figures on the wiki, for example: shotgun ~80 per shot, pipe bomb max 90, pistol ~30. [WIKI]

---

## 14. What critics and players say makes it fun

**Praise:**
1. **Tactile, convincing destruction as the core verb.** PC Gamer (Nat Clayton, 90/100, "An endlessly delightful destruction sandbox"): "Metal pipes bend and snap when supports are removed, while plaster walls chip away to expose sturdier brickwork, kicking up clouds of dust". Destruction is "immensely satisfying to watch and feels amazingly tactile". https://www.pcgamer.com/teardown-review/ ; https://www.pcgamer.com/teardown-is-a-chaotic-destruction-sandbox-and-a-great-puzzle-game/
2. **Destruction framed as open-ended puzzles.** "The game's genius is in how it brings method to this madness … a series of destructive heists to pull off with a limited set of tools". "Each level is a puzzle, really, but with no set solution". "It's a game about breaking stuff, yes, but also being clever about it." (PC Gamer). Its unlimited sledge versus limited power tools forces players to "consider your carnage".
3. **Plan-then-execute tension.** Planning with no time limit, followed by a 60 s sprint, produces self-authored speedruns. Fragile physics creates memorable failures: "Snag the bumper on a chunk of voxels during an escape and you're screwed" (PC Gamer early access). The quicksave makes this tolerable.
4. **Lighting and ray tracing sell the voxels.** "Maybe the only convincing argument I've seen for ray tracing in games … collapsing in a burst of volumetric smoke, splintered wood and shattered glass" (PC Gamer).
5. **Escalating twists.** Fire alarms, choppers, car chases, tornadoes, robots; Part 2 is better than Part 1 (PC Gamer, Push Square).
6. **Modding as long-tail lifeblood.** "The most creative sandbox platform since Garry's Mod" (PC Gamer). There are thousands of Workshop mods, and the official DLC was itself built as a mod.
7. **Persistent progression.** Unlocks and upgrades "provide a persistent progression that makes powering through the campaign's low points a little less frustrating" (Push Square 8/10, https://www.pushsquare.com/reviews/ps5/teardown). Shacknews 9/10: "everything that drew me to video games in the first place". God is a Geek: "ridiculously fun".

**Criticism** (Wikipedia summary; OpenCritic; Push Square; GameSpot 7/10):
- Unrealistic structural support: buildings hang on one voxel.
- Repetitive "grab all the things" objectives, especially in Part 1.
- 60 s instant-fail timers mean "more setup than payoff" (Push Square).
- Upgrade pacing.
- Weak challenge modes.
- Controls; no Y-axis invert on console at launch (user complaints).
- Motion sickness and depth-of-field complaints.
- Hardware demands.
- Lack of multiplayer at 1.0, since fixed in 2026.
- Later DLCs are reviewed less well than the base game (Greenwash Gambit 78%, Relics of Barkuna 75% on Steam).

---

## 15. Open questions (UNCONFIRMED)

- The player's maximum grab/carry mass and throw-force formula.
- Default jump speed, crouch speed, fall-damage thresholds and the regeneration rate.
- BlueTide boost magnitude and duration.
- Whether missions pay cash directly in addition to valuables.
- Treasure Thieves rules; Greenwash Gambit and Relics of Barkuna tool names.
- Default quicksave key bindings.
- Exact Tab-map rendering.
- Gustafsson's current role.
- Any sequel.
