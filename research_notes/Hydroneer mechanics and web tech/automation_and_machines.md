# Hydroneer: Automation, Machines, Power and Logic (machine-by-machine reference)

Scope and method notes (read first):
- Game: Hydroneer by Foulball Hangover (UE4). Version history that matters: 1.3 Engineering (Jul 2020), 1.4 (Sep 2020), 1.6 Logic & Power (Jan 2021), **2.0 full rewrite (8 May 2022)**, 2.0.x patches, 2.1 Farming (Dec 2022), 2.2 Prospecting/Tier 3 (Apr 2023), **3.0 Journey to Volcalidus DLC + base "Mega Patch" (5 Apr 2024)**, 3.0.1-3.0.9 (last content-ish patch 3.08, Jun 2024; 3.0.9 save fix, Mar 2025), **"Mega-Optimization" update 8 May 2026** (alongside the PS5/Xbox Series launch). The developer says the game was "finished" in April 2024 and only gets optimisation and bug fixes now.
- Primary sources used: (a) the full official Steam announcement feed (pulled via the Steam News API, all 60+ posts 2019-2026); (b) the **Bridgepour.com community wiki database**. Max named it the official fan wiki in 1.4, and the in-game "B" key opens it. I pulled its whole item DB through its public JSON API: 409 items, with descriptions taken from in-game tooltips, store price ("value"), badges and the stores that sell each item. (c) Steam discussions and Steam guides. (d) Press reviews. (e) Low-confidence third-party sites, flagged where used.
- Bridgepour's "value" field is the store purchase price in Hydrocoins. **I checked this:** the Bridgepour T1 automation guide says a starter setup needs "951 or more Hydrocoins". The DB prices give drill 432 + harvester 320 + intake 36 + 5 straight pipes × 22 + T pipe 28 + elbow 25 = 951 exactly.
- The old Fandom wiki was officially abandoned in 1.4 ("We've got rid of the Fandom wiki") and is nearly empty. Do not rely on it.
- Reddit could not be fetched (HTTP 403 to automated clients), and Reddit-restricted searches returned only Steam threads. Community evidence therefore comes mainly from Steam forums and guides. YouTube transcripts were not available.

Citation shorthand used below (all real URLs):
- SN-x.y = official Steam announcement for that patch. Base URL https://store.steampowered.com/news/app/1106840/view/<id>.
- BP-item = Bridgepour DB entry, https://bridgepour.com/database/<slug>. The raw data is at https://api.bridgepour.com/api/items/all/ and store locations are at https://api.bridgepour.com/api/towns/all/.

---

## 1. Power: what actually "powers" machines (water/lava pressure networks; pre-2.0 electricity)

### Takeaway
Hydroneer has **no water wheels, generators, shafts, gearboxes or electricity in the current game**. All automation runs on **pressurised fluid in snapped pipe networks**: water on the main island (Bastion) and lava on the Volcalidus DLC island, where water exists only from melting ice. An intake pipe sets a starting pressure. Each pipe segment loses a fixed share, shard-fuelled pressure tanks restore it, and machines run faster or yield more at higher pressure, capped by tier. Pipes also carry water "quality", which filters raise. Unfiltered water damages drills and harvesters. A separate electrical "Powerline" system (reactor, batteries, power lines) existed only from 1.6 to 1.7 and was **removed in 2.0**; its powered devices were merged into logic items.

### Cited Findings
**Current fluid-power model (2.0+)**
- Intake pipes pump water in at fixed pressure by tier. Forged Iron (T1) "Pumps water into pipe system at 100% pressure", price 36 — [BP forged-iron-intake-water-pipe](https://bridgepour.com/database/forged-iron-intake-water-pipe). Cloutium (T2) "at 250% pressure", price 632 — [BP cloutium-intake-water-pipe](https://bridgepour.com/database/cloutium-intake-water-pipe). Corestone (T3) "at 350% pressure", price 632 — [BP corestone-intake-water-pipe](https://bridgepour.com/database/corestone-intake-water-pipe). Lava Intake Pipe (DLC) "Pumps lava into pipe system at 250% pressure", price 36 — [BP lava-intake-pipe](https://bridgepour.com/database/lava-intake-pipe).
- Placement: the intake must sit at the water's edge. "You'll know if you placed it right, if water is dripping from the front" — [Bridgepour guide "How to get started with Automation"](https://api.bridgepour.com/api/guides/).
- Per-segment pipe loss. T1 Forged Iron straight, elbow and T pipes each "Decreases water pressure by 3%" (prices 22/25/28). T2 Cloutium pipes 2.5% (210/286/295). T3 Corestone pipes 2% (210/286/295). DLC Frost (water) pipes and Lava pipes 2.5% (22/25/28) — [BP forged-iron-hydro-pipe](https://bridgepour.com/database/forged-iron-hydro-pipe), [BP cloutium-hydro-pipe](https://bridgepour.com/database/cloutium-hydro-pipe), [BP corestone-hydro-pipe](https://bridgepour.com/database/corestone-hydro-pipe), [BP frost-hydro-pipe](https://bridgepour.com/database/frost-hydro-pipe), [BP lava-pipe](https://bridgepour.com/database/lava-pipe).
  - Cross-check: a player in June 2022 measured "Cloutium pipes lose 2.5 pressure per pipe, and Iron pipes lose 3.0". Another reported "every 40 [Cloutium] pipes loses 100 pressure" — [Steam: Pressure tank advice, 2 Jun 2022](https://steamcommunity.com/app/1106840/discussions/0/3426689579751992110). Both match the tooltips and suggest the loss is a **flat number of points per segment, not a compounding percentage**.
- Intake Booster Hooks clip onto the intake pipe. Forged Iron +20%, Cloutium +30%, Corestone +40%, Lava +30% — [BP forged-iron-intake-booster-hook](https://bridgepour.com/database/forged-iron-intake-booster-hook), [BP cloutium-intake-booster-hook](https://bridgepour.com/database/cloutium-intake-booster-hook), [BP corestone-intake-booster-hook](https://bridgepour.com/database/corestone-intake-booster-hook), [BP lava-intake-booster-hook](https://bridgepour.com/database/lava-intake-booster-hook).
  - Boosters cannot be bought. They are forged at the Icehelm Masterwork Forge: the Forged Iron design needs 60 Iron by weight, the Cloutium design 60 Cloutium — [BP forged-iron-intake-booster-design](https://bridgepour.com/database/forged-iron-intake-booster-design), [BP cloutium-intake-booster-design](https://bridgepour.com/database/cloutium-intake-booster-design). They "can only go on the intake pipe" and boost "the pressure coming out of the Intake Pipe" — [Steam: Intake Boosters, Nov 2023](https://steamcommunity.com/app/1106840/discussions/0/3971673333118226394/).
- Pressure Tanks: "Place a shard or shard bar inside to increase water pressure up to the same % value as the intake pipe". T1 costs 142, T2/T3 853, Frost/Lava 142 — [BP forged-iron-pressure-tank](https://bridgepour.com/database/forged-iron-pressure-tank), [BP cloutium-pressure-tank](https://bridgepour.com/database/cloutium-pressure-tank). Players confirm a tank restores pressure only to the intake level, never higher, and "having multiple pressure tanks next to each other won't do anything" — [Steam: Pressure tank advice](https://steamcommunity.com/app/1106840/discussions/0/3426689579751992110). Without a shard the tank acts as a blockage (search snippet of Steam threads; not independently fetched).
  - Shard is the consumable fuel: "Mysterious crystal shard. Used to power mining machines" — [BP shard](https://bridgepour.com/database/shard). A forum answer says consumption scales with how much pressure is restored ("a 10 lbs bar lasts 10 times longer") — Steam search snippet, unverified.
- Tier caps. 2.0.6: "Drills and Harvesters will now limit the amount of pressure they can take to their corresponding tier max pressures" — [SN-2.0.6](https://store.steampowered.com/news/app/1106840/view/4474904295773706248). 2.2: "Pipe Pressure can no longer be bypassed by using a lower tier of pipe and then using a booster back up… It'll now be capped by the maximum pressure of the weakest pipe in the line" — [SN-2.2](https://store.steampowered.com/news/app/1106840/view/6539831519489700435). A player confirms that an Iron pipe after a Cloutium intake caps pressure at the Iron maximum — [Steam: Pressure tank advice](https://steamcommunity.com/app/1106840/discussions/0/3426689579751992110).
- Measured readings from gauges: about 370 "PSI" with T2 gear and a tank — [Steam, Jun 2022](https://steamcommunity.com/app/1106840/discussions/0/3426689579751992110). A reading of 129 at a gem sorter with 4 Iron intake boosters — [Steam: How to split to logic gem compressor, Aug 2022](https://steamcommunity.com/app/1106840/discussions/0/3458220484829395536).
- Water Pressure Gauge Hook (74): "Attaches to straight and T pipes, reads pressure in pipe". 2.2 fix: "Pressure gauge reverts back to 0 when picked up or water is no longer passing through" — [BP water-pressure-gauge-hook](https://bridgepour.com/database/water-pressure-gauge-hook), [SN-2.2](https://store.steampowered.com/news/app/1106840/view/6539831519489700435).
- Flow control. Valve Hook (85) "Stops the passing of water or logic". Logic Valve Hook (85) is the same but logic-controlled. Cork (15) "Placed at the end of a pipe to stop water flow" — [BP valve-hook](https://bridgepour.com/database/valve-hook), [BP logic-valve-hook](https://bridgepour.com/database/logic-valve-hook), [BP cork](https://bridgepour.com/database/cork).
- Water quality and damage. Water Filter Hook (174): "Increases water quality by 2 (max. 10)"; "Water filters clean the water by 20%, so having 5 in a row will provide fully clean water". The filter itself takes damage — [BP water-filter-hook](https://bridgepour.com/database/water-filter-hook). Every drill and harvester page repeats: "Poor water quality causes drills to take damage and eventually break down… Make sure you have FIVE Water Filter Hooks" — [BP forged-iron-drill](https://bridgepour.com/database/forged-iron-drill). The creative-only Invincible Water Filter Hook filters to top quality and never takes damage — [BP invincible-water-filter-hook](https://bridgepour.com/database/invincible-water-filter-hook).
- What pressure does:
  - Drills: "Works faster with better water pressure" — [BP cloutium-drill](https://bridgepour.com/database/cloutium-drill). Measured with T2 gear: 17 dirt chunks/min at 370 PSI (tank adjacent) vs 13/min at 90 PSI (no tank). "Pressure has no effect on ore weight. Only drilling depth matters." A T1 cycle went from about 6 s to 5 s with a tank — [Steam: Pressure tank advice](https://steamcommunity.com/app/1106840/discussions/0/3426689579751992110).
  - Harvesters: "Bigger yield with better water pressure" — [BP cloutium-harvester](https://bridgepour.com/database/cloutium-harvester). 2.0.6: "Harvesters are now effected by pressure to produce better resources" — [SN-2.0.6](https://store.steampowered.com/news/app/1106840/view/4474904295773706248).
  - Conveyors: "Higher water pressure increases belt speed" — [BP straight-conveyor](https://bridgepour.com/database/straight-conveyor).
  - Sprinkler: "Higher water pressure increases radius" — [BP sprinkler hook entry via API](https://api.bridgepour.com/api/items/all/).
- Pipes as an actual flow graph. 2.0: "Conveyors now hook onto pipes to allow for custom pipe networks… Pipe items are now split into hooks, filters, valve, pressure reader" — [SN-2.0](https://store.steampowered.com/news/app/1106840/view/4348799082201741462). The 2.0.3 fix "infinite water loop" — [SN-2.0.3](https://store.steampowered.com/news/app/1106840/view/5849624375836275751) — and 2.0.6 "Pipes occasionally locking up and working intermittedly no longer happens" — [SN-2.0.6](https://store.steampowered.com/news/app/1106840/view/4474904295773706248) — show the network is simulated, not just checked for adjacency. 2.2.5: "Pipes will no longer be able to pass water when they're in their placing mode" — [SN-2.2.5](https://store.steampowered.com/news/app/1106840/view/5124584686246033158). 3.0: "Water Pipe and Logic Cable optimizations" — [SN-Mega Patch](https://store.steampowered.com/news/app/1106840/view/5756237364312335366).

**Volcalidus DLC (3.0, Apr 2024): lava drives the drills, water comes from ice**
- Dev announcement: "Lava Powered Machines. Water has to be produced from Ice. Ice appears towards the top of a claim, so strategy is involved to keep belts moving" — [SN DLC announcement, Jan 2024](https://store.steampowered.com/news/app/1106840/view/5510783579247049777).
- Ice Melter (380): "Melts ice to produce water. Essential for powering conveyor belt systems in Volcalidus. Water output is disabled when a logic value of 0 is passed in" — [BP ice-melter](https://bridgepour.com/database/ice-melter). Frost Pressure Tank raises pressure "up to the same % value as the ice melter" — [BP frost-pressure-tank](https://bridgepour.com/database/frost-pressure-tank).
- Heavy Lava Harvester: "Harvesting Ice will produce water at 350 pressure. Water can be toggled by logic" — [BP heavy-lava-harvester](https://bridgepour.com/database/heavy-lava-harvester). This creates a self-feeding loop: mining ice produces the water that runs the belts.

**Pre-2.0 electricity (OUTDATED, 1.6 to 1.7.x only)**
- 1.6 (15 Jan 2021): "Major game systems: Powerline and Logic system… Hobson's Powerworks, the new Logic and Power store" — [SN-1.6](https://store.steampowered.com/news/app/1106840/view/4483864038806701099). Press coverage of the same update: [PC Gamer, 18 Jan 2021](https://www.pcgamer.com/hydroneers-new-power-and-logic-update-adds-complex-customization-options).
- 2.0 removal: "Power items removed and merged into logic items. Things like the magnet and destroyer no longer require and drain power to operate" — [SN-2.0](https://store.steampowered.com/news/app/1106840/view/4348799082201741462). The store is now named "Hobson's Logicworks" — [BP towns API](https://api.bridgepour.com/api/towns/all/).
- 1.6-era parts, from a Steam guide self-marked [OUTDATED] (posted 23 Jan 2021, updated 12 May 2022) — [Steam guide "Hydroneer Logic [OUTDATED]"](https://steamcommunity.com/sharedfiles/filedetails/?id=2370798448):
  - Reactor, 25,500: footprint 1×2.5. Needs water in, a shard or shard bar, and a power line out. Stacked shards act "similarly to Pressure Pipes".
  - Powered Battery, 630: charged only by a running reactor. A charged battery left on the lines keeps powering the system, and batteries can charge other batteries.
  - Power Lines, 84 each (straight/elbow/T). Open ends "leak power as lightning bolts". Variants: Light Power Line 120, Pilot Light Power Line 84, Straight Power Valve 102 (logic-switched).
  - Powered devices: Powered Magnet 3,570 (pulls from a 1×1×2 column in front), Powered Destroyer 2,340, Powered Intake Pipe 670 (gives 100% pressure), Powered D.A.V.I.D. 2,340, Powered Filter 17,500 (filters to 100% for a constant drain), Pressure Booster 12,600 (raises pressure to 100% for a constant drain).
  - Only the Logic Smelter needed power. No numeric draw or capacity figures were ever published.
  - Corroborated independently by a Game N Guides power-parts guide (search snippet: reactor needs "water pumping into the pipe connection, a shard or shard bar, and a power line"; a charged battery powers the system even with the reactor off) — [gamenguides.com](https://www.gamenguides.com/hydroneer-all-power-parts-and-pricing-guide). The page itself could not be fetched (HTTP 526).

### Inferences
- Gauge readings fit **additive boosters**. A T2 intake at 250 plus four Cloutium boosters at +30 each gives 370, matching the measured "370 PSI". Four Iron boosters at +20 give 180 at the intake; after about 17 Iron segments at -3 each (assuming roughly 3 points per segment) you get about 129, matching the gem-sorter reading. The "%" numbers in tooltips therefore behave like flat pressure points (100 = 1×). This is my inference and not officially confirmed. One forum poster contradicts it ("Intakes add 50% no more and no less").
- For a browser game, the model reduces cleanly to a graph. Source nodes have a pressure P0 and a quality Q. Each edge or segment subtracts a fixed loss. Tank nodes reset pressure to P0 while they consume fuel. Hook nodes modify the pipe they sit on (filter: Q += 2; valve: cut the flow; booster: P0 += k). Machine nodes read clamp(P, 0, tierMax) for speed or yield and take damage at a rate tied to (10 - Q). Pressure here works like electrical voltage, and nothing like rotational power.

### Gaps
- No official per-tier machine maximum pressure (for example a T1 drill cap) was found.
- No official shard burn rate for tanks; the only figures are anecdotal.
- No exact formula linking pressure to drill cycle time, harvester yield or belt speed. Only the PattyC and MertM player measurements above.
- The legacy power system's numbers (draw per device, battery capacity) were never documented.

---

## 2. Processing machines (inputs, outputs, rates, tiers, costs)

### Takeaway
The processing chain is: dig (shovel, pickaxe or drill) → **dirt chunks** → wash/harvest (pan + brush by hand, or a **harvester**) → raw nuggets and uncut gems → sort (hand sorter or splitter belts) → **smelt** (crucible + small furnace + casting mold, then Smelter, then Logic Smelter) to bars → **cut/polish gems** (grinding wheel, Gem Polisher hook) → optionally **compress gems** → **craft** at an anvil (weapons, jewellery) or the Masterwork Forge (machines) → sell. Machines tier T1/T2/T3 by **dirt depth**, not by speed. A drill or harvester of tier N works only on dirt of tier ≤ N, and deeper placement gives better ore.

### Cited Findings
- **Pan** (12): fill with dirt and water, scrub with the Brush (2). Since 2.0 one scrub instead of two — [BP pan](https://bridgepour.com/database/pan), [SN-2.0](https://store.steampowered.com/news/app/1106840/view/4348799082201741462). The pan doubles as the main portable container. **Bucket** (4): four shovel loads fill it; it also carries water — [BP bucket](https://bridgepour.com/database/bucket).
- **Drills** (2.0 tiered system): "These drills do not remove the dirt under them, instead only work to a certain depth depending on their tier" — [SN-2.0](https://store.steampowered.com/news/app/1106840/view/4348799082201741462).
  - Forged Iron Drill T1, 432, from the Travelling Merchant at Bastion Keep. On the surface it produces "tiny nuggets" and no Cloutium. At least 2 blocks deep it can produce Cloutium — [BP forged-iron-drill](https://bridgepour.com/database/forged-iron-drill).
  - Cloutium Drill T2: forged from 1000 Iron + 300 Cloutium (weight). Corestone Drill T3: forged — [BP cloutium-drill-masterwork-design](https://bridgepour.com/database/cloutium-drill-masterwork-design), [BP corestone-drill](https://bridgepour.com/database/corestone-drill).
  - Drills have a red on/off lever — [Bridgepour automation guide](https://api.bridgepour.com/api/guides/). Placing a drill in an Ore Vein biases its output toward that ore (2.2) — [SN-2.2](https://store.steampowered.com/news/app/1106840/view/6539831519489700435).
  - DLC drills: Lava Drill (430) and Heavy Lava Drill (forged; "Heavy", needs the Lava Hauler crane to move) — [BP lava-drill](https://bridgepour.com/database/lava-drill), [BP heavy-lava-drill](https://bridgepour.com/database/heavy-lava-drill), [SN DLC announcement](https://store.steampowered.com/news/app/1106840/view/5510783579247049777). 3.0.7: "Boosted output of Heavy Drills"; fixed "drills with speed buffs would actually output less" — [SN-3.0.7](https://store.steampowered.com/news/app/1106840/view/5762994032406039149). 3.0.5: "Removed ability to spam-click drills to produce more resources" — [SN-3.0.5](https://store.steampowered.com/news/app/1106840/view/5762993398268899735).
- **Harvesters** turn dirt chunks into resources and take damage from unfiltered water. Forged Iron T1 costs 320 (Travelling Merchant). T2 is forged from 300 Iron + 100 Cloutium; T3 forged — [BP forged-iron-harvester](https://bridgepour.com/database/forged-iron-harvester), [BP cloutium-harvester-masterwork-design](https://bridgepour.com/database/cloutium-harvester-masterwork-design). Clog fixes appear in 2.0.1, 2.0.3, 2.0.5 and 2.0.6 ("Harvester improvements to prevent dirt chunks getting stuck") — [SN-2.0.6](https://store.steampowered.com/news/app/1106840/view/4474904295773706248). DLC Lava and Heavy Lava Harvesters break Ice and Frost Rock into resources — [BP lava-harvester](https://bridgepour.com/database/lava-harvester).
- **Hand Sorter** (165): "Pour resources into the sorter to split out the resource type that is on the tray". The match exits under the tray and everything else goes out the big front chute. "Requires water input" — [BP hand-sorter](https://bridgepour.com/database/hand-sorter), [SN-2.0](https://store.steampowered.com/news/app/1106840/view/4348799082201741462).
- **Smelting chain**:
  - Crucible (18) + Small Furnace (86) + Casting Mold (42). The Bridgepour guide says the set costs 146. Bars come out not hot enough for smithing; reheat them in the furnace for about 30 s — [BP crucible](https://bridgepour.com/database/crucible), [BP anvil](https://bridgepour.com/database/anvil).
  - Mixing ores: before 3.0, adding a second ore type deleted it. Since 3.0, "Crucible now no longer destroys resources that are entered into it if its already smelting a different type" — [SN-Mega Patch](https://store.steampowered.com/news/app/1106840/view/5756237364312335366).
  - **Smelter** (1320) "combines… Small Furnace, Crucible and the Casting Mold". Ores can be fed by conveyor into the pot; left-click tips it to cast — [BP smelter](https://bridgepour.com/database/smelter). Since 2.1 both smelters reject ore that differs from what is already molten — [SN-2.1](https://store.steampowered.com/news/app/1106840/view/4980448574112987724).
  - **Logic Smelter** (17,300): "Requires logic input to create bar". Casting takes about 4 s, during which it accepts nothing and items fall past — [BP logic-smelter](https://bridgepour.com/database/logic-smelter), [Steam guide: Automatic Smelter (2.0)](https://steamcommunity.com/sharedfiles/filedetails/?id=2811672582). Bars cannot be cast at a chosen weight; the smelter "spits out whatever is in the holding tank" — [Steam thread, Jul 2023](https://steamcommunity.com/app/1106840/discussions/0/3812910932503260932/). Since 2.2 it no longer takes damage and its doors close automatically — [SN-2.2](https://store.steampowered.com/news/app/1106840/view/6539831519489700435).
- **Bars and heat**: 1.6 "Iron, Gold, and Cloutium bar now smelt in a semi-hot state"; 2.2.2 "Rate of crucible/bars heating up increased"; creative mode heats 10× faster — [SN-1.6](https://store.steampowered.com/news/app/1106840/view/4483864038806701099), [SN-2.2.2](https://store.steampowered.com/news/app/1106840/view/6539831519503928900), [SN-2.0](https://store.steampowered.com/news/app/1106840/view/4348799082201741462).
- **Gems**: Grinding Wheel (84) turns uncut into cut by hand. Gem Polisher Hook (462) is a conveyor hook that "Polishes gems that pass through" and auto-centres them (2.0.2) — [BP grinding-wheel](https://bridgepour.com/database/grinding-wheel), [BP gem-polisher-hook](https://bridgepour.com/database/gem-polisher-hook), [SN-2.0.2](https://store.steampowered.com/news/app/1106840/view/5849624375818888970).
- **Gem Compressor**: 1.4 added a "water powered machine which can compress any gem". In 2.0 it became the Logic Gem Compressor (930): cut gems only, "one type at a time", logic turns it on. The 2.1 rework: "compresses gems as they enter the machine if its turned on" — [SN-1.4](https://store.steampowered.com/news/app/1106840/view/4249665521683159651), [BP logic-compressor](https://bridgepour.com/database/logic-compressor), [SN-2.1](https://store.steampowered.com/news/app/1106840/view/4980448574112987724).
- **Cutting to size**: Saw (143) cuts bars in half; Gem Chisel (430) splits gems; Pickaxe splits dirt. Logic Saw Hook (320, 2.2) sits on straight conveyors and cuts items to a logic-set size. It works only when its conveyor's pipe has water (2.2.4) and times items out so they are not cut twice — [BP saw](https://bridgepour.com/database/saw), [BP gem-chisel](https://bridgepour.com/database/gem-chisel), [BP logic-saw-hook](https://bridgepour.com/database/logic-saw-hook), [SN-2.2.4](https://store.steampowered.com/news/app/1106840/view/5138087875075946141).
- **Anvil** (86) + Blacksmithing Hammer (105): pick a chalk recipe, place hot bars or gems in numbered slots 1-3, then strike. 2.2 lets weapons and jewellery be made from any bar or gem except shard; the anvil is doubled in size — [BP anvil](https://bridgepour.com/database/anvil), [SN-2.2](https://store.steampowered.com/news/app/1106840/view/6539831519489700435).
- **Masterwork Forge** (fixed world structure in Icehelm, introduced in 2.0 as the "crafting system deep in the Icehelm mountain"): put the design on the pedestal, drop the required bar weight into the crucible, pull the lever. The crucible runs along a track, a big hammer strikes, the item appears and excess bars are returned. Designs are not consumed. Recipes: T1 drill 300 Iron; T1 harvester 100 Iron; T2 drill 1000 Iron + 300 Cloutium; T2 harvester 300 Iron + 100 Cloutium — [Bridgepour Masterwork guide](https://api.bridgepour.com/api/guides/), [BP forged-iron-drill-masterwork-design](https://bridgepour.com/database/forged-iron-drill-masterwork-design). The DLC Volcalidus Peak forge also accepts Forge Marks, which apply random buffs or debuffs (dig size or speed, drill output) — [SN DLC announcement](https://store.steampowered.com/news/app/1106840/view/5510783579247049777), [BP forge-mark](https://bridgepour.com/database/forge-mark).
- **Hardstone Refiner** (340, DLC): "Refines Hardstone into usable blocks. Fills with hardstone until the logic value is met" — [BP hardstone-refiner](https://bridgepour.com/database/hardstone-refiner).
- **Idle mines** (DLC "Abandoned Miners"; you rebuild them with materials, after which they produce passively):
  - East Shelf: 1 weight per 10 s, capped at 300 (50 min to fill).
  - West Shelf: 15 weight per 10 s, capped at 500 (5.5 min).
  - The Barrens: 1 weight per 10 s, capped at 100.
  - Each stops when full until emptied — [Bridgepour "Idle Mines" guide](https://api.bridgepour.com/api/guides/).
- **Scrap**: scrapping an item gives scrap metal worth 25% of its value; Scrap Bars double scrap value (2.0) — [SN-2.0](https://store.steampowered.com/news/app/1106840/view/4348799082201741462).
- **Legacy machines (OUTDATED)**:
  - D.A.V.I.D. (1.3): "a shard powered machine which duplicates dirt" for the Goliath drill — [SN-1.3](https://store.steampowered.com/news/app/1106840/view/3659688711190803493).
  - Conveyor Shredders (pre-2.0, then hooks in 2.0) were "Temporarily removed… as they do not currently have any use" in 2.1 — [SN-2.1](https://store.steampowered.com/news/app/1106840/view/4980448574112987724). They are absent from the current DB.

### Inferences
- Tiering works as **depth-gated capability plus material cost**, not a speed ladder. Speed comes from pressure. This splits upgrades into two axes, which a browser game can copy: unlock deeper ore by tier, and gain throughput by investing in the fluid network.
- The pattern "smelter rejects mixed ore" combined with "sorter by example item" forces players to build sort-before-smelt topologies. That makes it a core puzzle element.

### Gaps
- No official numeric drill cycle time, harvester throughput or smelter melt time; only anecdotes (about 4 s cast; 13-17 chunks/min per T2 drill).
- Corestone (T3) masterwork recipe weights are not in the Bridgepour DB fields.
- DLC idle mine build costs appear only in the Bridgepour guide; not cross-checked.

---

## 3. Logistics: conveyors, splitters, mergers, funnels, carts

### Takeaway
Conveyors are **hooks that snap onto water pipes**. Water in the pipe drives the belt, and pressure sets belt speed. Items on belts are **fully physics-simulated rigid bodies**, not scripted slots. That causes rolling, edge-sticking, jams at corners and funnels, items falling off, and frame-rate-dependent clogs. Routing pieces: straight, left/right corner and vertical belts; left/right Splitter belts that filter by an example item on a tray; Merger hooks for T-junctions; Centraliser hooks; funnels; tin sheets as chutes; walls and barriers. There are no hoppers or chutes as machines; tin sheets and funnels play that role.

### Cited Findings
- Belt pieces (all "Hooks on to pipes. Moves resources. Higher water pressure increases belt speed"): Straight Conveyor 220, Left/Right Conveyor 240, Vertical Conveyor 323, Splitter Conveyor Left/Right 532 ("Place resources on tray to split") — [BP straight-conveyor](https://bridgepour.com/database/straight-conveyor), [BP vertical-conveyor](https://bridgepour.com/database/vertical-conveyor), [BP splitter-conveyor](https://bridgepour.com/database/splitter-conveyor). Sold at Bridgepour "Conveyor Nation", Icehelm, and the DLC Burville and Shattered Outpost conveyor stores — [BP towns API](https://api.bridgepour.com/api/towns/all/).
- Conveyor hooks: Merger Hook 480 ("creation of T junctions between belts", 2.0.6), Centraliser Hook 462 ("Centers resources passed through", 2.0.2), Gem Polisher Hook 462, Logic Saw Hook 320, Veg Dicer Hook 480 (farming), Logic Counter 560 (counts items crossing it) — [BP merger-hook](https://bridgepour.com/database/merger-hook), [BP conveyor-centraliser](https://bridgepour.com/database/conveyor-centraliser), [SN-2.0.6](https://store.steampowered.com/news/app/1106840/view/4474904295773706248).
- History of belt physics:
  - 1.3 "The Conveyor system has had a total rework, as well as new corner belts, barriers" — [SN-1.3](https://store.steampowered.com/news/app/1106840/view/3659688711190803493).
  - 1.4 "Conveyor belt visual speeds changed to represent pressure and physical speed better"; "Lowered centre of gravity for resources to reduce rolling on conveyor belts"; "Shard has a better collision box to improve movement on conveyor belts" — [SN-1.4](https://store.steampowered.com/news/app/1106840/view/4249665521683159651).
  - 1.5: dirt can be shovelled directly onto belts — [SN-1.5](https://store.steampowered.com/news/app/1106840/view/3854477638701252164).
  - 2.0.5: players can walk up vertical belts — [SN-2.0.5](https://store.steampowered.com/news/app/1106840/view/4292505348839841359).
  - 2.0.6 "Big conveyor optimisations" — [SN-2.0.6](https://store.steampowered.com/news/app/1106840/view/4474904295773706248).
  - 2.1.1 "Emeralds will now move along conveyor belts easier and will not be stuck on the edge of the gem compressor" — [SN-2.1.1](https://store.steampowered.com/news/app/1106840/view/4980448574127321166).
  - 2.2 "All items can now be magnetised and conveyored" — [SN-2.2](https://store.steampowered.com/news/app/1106840/view/6539831519489700435).
  - 2.2.3 "vertical conveyor belt pushing items below it in long climbs" fixed — [SN-2.2.3](https://store.steampowered.com/news/app/1106840/view/5133583642655153166).
  - 3.0 shard model reworked because "Shard models are sometimes problematic on conveyor belts" — [SN Message from Max, Jan 2024](https://store.steampowered.com/news/app/1106840/view/6300039510120170533).
- Splitter behaviour (community): it matches **by form**, so a raw-nugget tray catches only raw nuggets; put both a nugget and a bar on the tray to catch both. Moving the splitter requires re-placing the tray item. Saving while belts run causes misses on reload — [Steam: splitter thread, May 2023](https://steamcommunity.com/app/1106840/discussions/0/3821910883992658317). 2.2.4: "Conveyor Splitters can now split all items"; 2.2.5: splitters no longer "forget" their item when moved — [SN-2.2.4](https://store.steampowered.com/news/app/1106840/view/5138087875075946141), [SN-2.2.5](https://store.steampowered.com/news/app/1106840/view/5124584686246033158). Splitters move items more slowly than plain belts; adding a straight belt after a splitter fixed jams — [Steam: gem compressor thread, Aug 2022](https://steamcommunity.com/app/1106840/discussions/0/3458220484829395536).
- Funnel (110, "Funnels things"): repeated anti-stuck fixes (2.0.1, 2.0.5), yet community experts still say "avoid funnels" — [SN-2.0.5](https://store.steampowered.com/news/app/1106840/view/4292505348839841359), [Steam: resources sticking, Jan 2025](https://steamcommunity.com/app/1106840/discussions/0/595139465034345395). Tin Sheet (3) and its corner/ramp/triangle variants are "used by miners to channel resources" — [BP tin-sheet](https://bridgepour.com/database/tin-sheet).
- Jams and clogs (current, 2025): resources stop at device edges (sorters, gem compressors, harvesters) "every couple of seconds under heavy flow". It is linked to low FPS: the problem vanished at 150 FPS and appeared around 18-24 FPS. Objects outside render distance also clog. Low pressure contributes; the advice is a tank every 8-12 pipes and no mixed pipe tiers — [Steam: resources sticking, Jan 2025](https://steamcommunity.com/app/1106840/discussions/0/595139465034345395). 2.0.6: "Moving far away from a dig site will no longer fudge collisions while machinery is running" — [SN-2.0.6](https://store.steampowered.com/news/app/1106840/view/4474904295773706248).
- Out-of-bounds safety: "Items that leave the bounds of the worlds will now return to their last dropped location" (2.1.3) — [SN-2.1.3](https://store.steampowered.com/news/app/1106840/view/5035622743880239340).
- Manual logistics:
  - Wooden Cart 350, Fast and Agile Carts 740. Items stored in carts "have no collision with other objects stored inside".
  - Pallet 450: items lock onto it; used to buy multiple items.
  - Pan and Bucket as containers. Truck, Pan and Bucket lag with thousands of items was fixed in 3.0 — [BP wooden-cart](https://bridgepour.com/database/wooden-cart), [BP pallet](https://bridgepour.com/database/pallet), [SN-Mega Patch](https://store.steampowered.com/news/app/1106840/view/5756237364312335366).
- Fixed world logistics: "Icehelm transporter pipes: send items directly through the abandoned city" (2.0) — [SN-2.0](https://store.steampowered.com/news/app/1106840/view/4348799082201741462).

### Inferences
- The physical-belt design is the source of both the charm (piles of ore, satisfying flow) and most of the bugs. For a browser game, a hybrid is safer: simulate items as discrete entities on belt lanes with deterministic speed (pressure × base), and render "physics-y" jitter cosmetically. Model jams as an explicit mechanic, for example a capacity per tile or an input-rate limit per machine, rather than as emergent physics.
- "Splitter by example item" is a cheap, intuitive filter UI to borrow.

### Gaps
- No numeric belt speed (m/s or items/s) at any pressure was found in official or community sources.
- No official maximum belt length per tank; the community heuristic is a tank every 8-12 pipes.

---

## 4. Logic / automation system

### Takeaway
Logic arrived in 1.6 (Jan 2021) and was rebuilt in 2.0 into **cables plus hooks**. Signals are **discrete numeric events** (integers; colours as 9-digit RGB) that travel both ways along cables unless a diode is used. Sources include buttons, levers, keypads, a 1-second repeater, and sensors (weight, item count, durability, smelter or tank contents). There are arithmetic and comparison gates, delays, flip and flip-flop toggles, and validators. Actuators include valves (water or logic), the Logic Smelter, gem compressor, magnet, destroyer, spanner hurler, saw, lamps, Ice Melter and Hardstone Refiner, plus TNT and the Mini-Nuke. This allows end-to-end mining → harvest → sort → smelt → cut → compress → auto-repair. Selling cannot be automated (it needs manual drop-off and a button at shops), and drills still need placement and dirt depth.

### Cited Findings
- Release history:
  - 1.6 introduced logic — [SN-1.6](https://store.steampowered.com/news/app/1106840/view/4483864038806701099).
  - 1.7.2 added the Logic Weight Reader — [SN-1.7.2](https://store.steampowered.com/news/app/1106840/view/4224935490632757895).
  - 2.0 "Some logic items are also split into hooks… Additional logic hooks such as a 10 second delay, logic repeater, and flipflop"; "Compressor now has a logic input"; "Leg-X tool and logic supports removed as literally nobody used them" — [SN-2.0](https://store.steampowered.com/news/app/1106840/view/4348799082201741462).
  - 2.0.5 Validator Hook; "Removed issue with loops in logic systems"; "Logic hooks do a better job connecting to the correct cable" — [SN-2.0.5](https://store.steampowered.com/news/app/1106840/view/4292505348839841359).
  - 2.0.6 Logic Lamp, Multiply, Divide — [SN-2.0.6](https://store.steampowered.com/news/app/1106840/view/4474904295773706248).
  - 2.2 Logic Saw Hook — [SN-2.2](https://store.steampowered.com/news/app/1106840/view/6539831519489700435).
  - 3.0 Logic Content Reader (liquid in a Smelter or Ice Melter) — [SN-Mega Patch](https://store.steampowered.com/news/app/1106840/view/5756237364312335366). 3.08 extended it to Spanner Hurler uses and shard-bar weight in a pressure tank — [SN-3.08](https://store.steampowered.com/news/app/1106840/view/5742731639345340037).
- Signal semantics:
  - 1.6 guide: "Logic is sent as single events, usually a 1 or 0… no sustained pulse"; "Logic flows in either direction through cables, except Diode" — [Steam guide [OUTDATED]](https://steamcommunity.com/sharedfiles/filedetails/?id=2370798448).
  - 2.0 guide: Logic Add outputs a 9-digit value, and "000000000" was not equal to "0" — [Steam auto-smelter guide](https://steamcommunity.com/sharedfiles/filedetails/?id=2811672582). Fixed in 3.0: "Logic Flip Hook now reads '000000000' as '0'" — [SN-Mega Patch](https://store.steampowered.com/news/app/1106840/view/5756237364312335366).
  - The 2.0.6 weight reader output a comma above 999 — [SN-2.0.6](https://store.steampowered.com/news/app/1106840/view/4474904295773706248).
  - A third-party wiki states "a logic signal is always a pulse", with the lever as an exception — [hydroneer.wiki (low confidence, undated, likely AI-written)](https://hydroneer.wiki/en/automation/hydroneer-logic).
- Component behaviours (tooltips, prices) — see the catalog in section 7. Key ones:
  - Repeater "outputs a logic value of 1 every second".
  - Flip: 0 becomes 1, and ≥1 becomes 0.
  - Flip-Flop alternates 1/0.
  - Validator passes only ≥1.
  - Equals and Greater Than (A ≥ B) output 1/0.
  - Add/Subtract/Multiply/Divide "when either value is passed in".
  - Weight Reader is cumulative and can be reset from the top.
  - Counter counts items, with a target set from the top.
  - Durability Reader reads every second.
  - Spanner Hurling Unit fires on any value > 0 and stores 20 — [BP logic-repeater](https://bridgepour.com/database/logic-repeater), [BP logic-flip-hook](https://bridgepour.com/database/logic-flip-hook), [BP logic-weight-reader](https://bridgepour.com/database/logic-weight-reader), [BP logic-counter](https://bridgepour.com/database/logic-counter), [BP logic-spanner-hurling-unit](https://bridgepour.com/database/logic-spanner-hurling-unit).
- End-to-end automation examples:
  - **Auto Logic Smelter** (2.0). Parts: Weight Reader opposite the smelter, Keypad (target weight), Greater Than, Validator, three 1 s delays, Flip, two diodes. The reader resets after each cast. Add-ons: a Logic Valve stops the feed belt during the 4 s cast. With multiple smelters, sum their signals with Logic Add and compare to 0 using Equals. A Logic Magnet holds ore during the cast — [Steam guide: Automatic Smelter](https://steamcommunity.com/sharedfiles/filedetails/?id=2811672582).
  - **Auto gem compressor**: a repeater is delayed 10 s, then the sorter line stops for about 3 s so the compressor lid doesn't trap gems, the compressor runs, and the line restarts. Reported working with 66 T2 drills — [Steam thread, Aug 2022](https://steamcommunity.com/app/1106840/discussions/0/3458220484829395536). An alternative counts items with a Logic Counter before the compressor — [Steam guide comments](https://steamcommunity.com/sharedfiles/filedetails/?id=2811672582).
  - **Auto-repair**: Durability Reader → compare to a threshold → Spanner Hurling Unit aimed at filters or machines. Bridgepour references "a simple auto-repair setup" for filters — [BP water-filter-hook](https://bridgepour.com/database/water-filter-hook). A 2.1 fix mentions "logic repair circuits" breaking on -0 durability — [SN-2.1](https://store.steampowered.com/news/app/1106840/view/4980448574112987724).
  - **Exact-weight bars**: Keypad plus per-ore levers driving a Logic Saw Hook cuts bars to size downstream (one player runs about 90 T3 drills) — [Steam thread, Jul 2023](https://steamcommunity.com/app/1106840/discussions/0/3812910932503260932/).
  - **Master switches**: separate pipes for miners and belts, each with a logic valve — [Steam gem compressor thread](https://steamcommunity.com/app/1106840/discussions/0/3458220484829395536).

### Inferences
- The logic layer is effectively a tiny **event-driven dataflow language** (number messages, no clocked state except the repeater, delays and flip-flops). It is well suited to a browser game. Implement it as message passing on a graph with a per-tick queue and loop protection, which Hydroneer itself had to patch in 2.0.5.
- The most valuable sensor-actuator pairs to copy: weight or count threshold → valve on feed belt; durability → repair; contents → batch processor trigger.

### Gaps
- No official spec for value ranges (maximum digits; the 1.6 keypad accepted 10 digits), negative numbers, or propagation timing per cable segment.
- No official full list of which machines accept logic input beyond the tooltips.

---

## 5. Connections, placement rules and failure modes

### Takeaway
Everything snaps to a **world grid**. Build items have placement types: some must snap to a host object and some can float. Since 3.0 there is face-snapping. "Hooks" are attachments that clamp onto a host pipe, belt or cable: filters, valves, gauges and boosters on pipes; all belts on pipes; polishers, saws and mergers on belts; delays, diodes and lights on cables. Machines connect by aligning their pipe inlet with a pipe end. Failure modes are physical and durability-based: damage from dirty water (the machine breaks and sparks), filters wearing out, the wrong dirt tier, pressure capped by the weakest pipe, open pipe ends, items jamming or falling off, and placement-mode pipes passing no water.

### Cited Findings
- Grid and hooks: "Building items now have 'Hooks'. These act as attachments onto items" (2.0); "Placement types updated for items, this changes if an item can be placed in the sky or has to snap to an object" — [SN-2.0](https://store.steampowered.com/news/app/1106840/view/4348799082201741462). Reviewers note "everything snaps to an invisible grid, pipes can be run in a clean, organized way" — [The Xbox Hub review, 11 May 2026](https://www.thexboxhub.com/hydroneer-review/).
- Snapping and rotation:
  - 3.0: "New build-snapping… if you look at another placed item, it'll offset what you're placing to the corresponding side" — [SN Message from Max](https://store.steampowered.com/news/app/1106840/view/6300039510120170533).
  - R/T/Y rotate on three axes, and Ctrl reverses (2.0.6) — [SN-2.0.6](https://store.steampowered.com/news/app/1106840/view/4474904295773706248).
  - The drill must be rotated "so the intake on the drill is attached to the pipe"; the harvester attaches to a straight pipe; put a pan in front of the harvester "otherwise it'll make a mess" — [Bridgepour automation guide](https://api.bridgepour.com/api/guides/).
  - 2.2: "Pipes and conveyors no longer rotate off grid in rare occasions" — [SN-2.2](https://store.steampowered.com/news/app/1106840/view/6539831519489700435).
  - 2.2.4: "Major improvements on placing items near diggable dirt" — [SN-2.2.4](https://store.steampowered.com/news/app/1106840/view/5138087875075946141).
  - T1 drills can be placed side by side on both sides (2.0.3); T2 drills can point at belts without clipping (2.0.6) — [SN-2.0.3](https://store.steampowered.com/news/app/1106840/view/5849624375836275751).
- Locking: the Construction Hammer (42) locks items so they can't be picked up by accident — [BP construction-hammer](https://bridgepour.com/database/construction-hammer).
- Durability and repair:
  - 1.6: "Durability items will now stop working at 0 durability instead of 25" — [SN-1.6](https://store.steampowered.com/news/app/1106840/view/4483864038806701099).
  - Spanner (53) repairs drills, harvesters and filters to full; Tool Bag (220) has multiple uses and is refilled by dropping spanners in (2.0); Magnifying Glass (440) shows durability — [BP spanner](https://bridgepour.com/database/spanner), [BP tool-bag](https://bridgepour.com/database/tool-bag), [BP magnifying-glass](https://bridgepour.com/database/magnifying-glass).
  - A broken drill "will stop working and begin to emit sparks"; 2.2.3 added a broken sound — [BP corestone-drill](https://bridgepour.com/database/corestone-drill), [SN-2.2.3](https://store.steampowered.com/news/app/1106840/view/5133583642655153166).
- Tier mismatch: "Tier 2 machines and equipment cannot work on Tier 3 soil" — [BP cloutium-drill](https://bridgepour.com/database/cloutium-drill). Feeding T1 machines from T2 pipes is reported to make them less efficient — Steam search snippet (unverified).
- Leaks and open ends: pre-2.0 power lines leaked visibly at open ends. Corks seal pipe, power and logic ends — [Steam guide [OUTDATED]](https://steamcommunity.com/sharedfiles/filedetails/?id=2370798448). Mixing pipe tiers "can leak at the interface" (community claim) — [Steam: resources sticking, 2025](https://steamcommunity.com/app/1106840/discussions/0/595139465034345395).
- Simulation-distance and save issues:
  - Shut mines down before saving or leaving; items get stuck on reload because of a physics bug — [Steam gem compressor thread](https://steamcommunity.com/app/1106840/discussions/0/3458220484829395536), [Steam splitter thread](https://steamcommunity.com/app/1106840/discussions/0/3821910883992658317).
  - Option toggles "Save Dirt Chunks / Save Raw Resources" exist for FPS — [SN-1.6.11](https://store.steampowered.com/news/app/1106840/view/5418383147738990807).
  - Explosives destroy terrain, not stores (2.0.1) — [SN-2.0.1](https://store.steampowered.com/news/app/1106840/view/4288001105332311583).
- Performance as a design constraint: repeated optimisation passes for "large drill sites" (2.0.5, 2.0.6, 3.0, 2026). 2026: "upgrades with large mining setups… significant increase in performance" — [SN-Mega-Optimization, 8 May 2026](https://store.steampowered.com/news/app/1106840/view/1832065502815252). Physics was also why true online multiplayer was abandoned: "Due to technical limitations of physics engines… Steam Remote Play Splitscreen" — [SN-2.0](https://store.steampowered.com/news/app/1106840/view/4348799082201741462).

### Inferences
- In a browser game, the "hook" concept maps neatly onto **host tiles with attachment slots**. A pipe tile has N hook slots (filter, valve, gauge, belt), a belt tile has M slots (polisher, saw, counter), and a cable tile has slots (delay, diode, validator). This gives a compact, readable data model.
- Physics-driven failure modes should mostly become deterministic rules (durability decay tied to water quality, explicit tier checks, pressure caps), keeping only light randomness.

### Gaps
- No footprint or dimension data per machine. Bridgepour has none, and the only known figure is the legacy Reactor's 1×2.5. The magnet range of "two block distance" is the only range figure.

---

## 6. Community "fully automated base" layouts and typical progression

### Takeaway
Typical progression:
1. Hand panning.
2. Hand sorter.
3. First T1 drill and harvester fed by a 100% iron intake (about 951 coins).
4. More drills on a shared pipe trunk with 5 filters.
5. Belts into splitters → smelters and polisher.
6. Gem compressor and auto-repair circuits.
7. Masterwork-forged T2 and T3 drills on deeper claims with Cloutium or Corestone pipes, boosters and tanks.

At that point bases run dozens to roughly 90 drills. Shared community practices: separate pipe networks for drills and belts, logic master valves, sort-before-smelt, pressure tanks near consumers, and a shutdown routine before saving.

### Cited Findings
- First automation steps:
  - Bridgepour T1 guide: intake at the stream, 4 straight pipes, a T pipe (short side down), an elbow, a straight pipe. The drill goes on the T and the harvester on the last pipe, with a dirt clump placed on that pipe. Pull the drill lever, and put a pan in front of the harvester — [Bridgepour automation guide](https://api.bridgepour.com/api/guides/).
  - Reviewer path: fish to earn coins, buy a drill and harvester; placing the drill to drop directly into the harvester "significantly cut down" handling; later automatic sorting, smelters, polishing, compression — [The Xbox Hub review](https://www.thexboxhub.com/hydroneer-review/).
- Scale reports:
  - One tank for 28 T2 drills; drills equidistant from a tank produce equally; 60 drills fed one harvester without clogging; drills, belts and harvesters kept on separate pipe systems — [Steam: Pressure tank advice, Jun 2022](https://steamcommunity.com/app/1106840/discussions/0/3426689579751992110).
  - 66 T2 drills with a timed compressor circuit — [Steam, Aug 2022](https://steamcommunity.com/app/1106840/discussions/0/3458220484829395536).
  - About 90 T3 drills feeding gold and iron smelters, with saw-cut bars — [Steam, Jul 2023](https://steamcommunity.com/app/1106840/discussions/0/3812910932503260932/).
  - Unverified search snippet: 10 T3 drills ≈ 1,500 nuggets/min.
- Recommended layout rules from a long-time helper:
  - Intake boosters → T pipe → vertical belt → straight belt → pressure booster → compressor.
  - Do not drop dirt or nuggets off vertical belts.
  - Sort raw ore onto straight belts before smelters or polishers.
  - Avoid funnels.
  - Shutdown order: miners off → let items clear → run the compressor → master switch off — [Steam gem compressor thread](https://steamcommunity.com/app/1106840/discussions/0/3458220484829395536).
- Gravity tricks: T3 drills can be placed in the air so gravity feeds instead of riser belts (Steam search snippet, unverified).
- Long-session problems persist: 2025 players report clogs that depend on FPS and pressure — [Steam, Jan 2025](https://steamcommunity.com/app/1106840/discussions/0/595139465034345395).

### Inferences
- The progression loop is **manual → semi-auto → bottleneck-driven expansion**. Each new automation piece removes the most tedious manual step: scrubbing, then sorting, then smelting, then repairing. A browser game can structure unlocks the same way.
- Scale (tens of drills) is where physics-based games struggle. A browser implementation should aggregate: treat a drill bank as a rate rather than individual items until items reach the player's view.

### Gaps
- No Reddit or YouTube base layouts could be retrieved. No quantitative throughput benchmarks beyond the forum anecdotes.

---

## 7. Exhaustive machine and equipment catalog (current game 3.x/2026 unless marked)

### Takeaway
The current game has roughly 130 functional items: machines, pipes, belts, hooks, logic, crafting and storage stations, and tools. The rest of the 409-item DB is house-building sets, decoration, seeds, fish and resources. The table below lists every functional item with price, inputs/outputs, fluid needs, connection type, tier and behaviour. Prices are store prices in Hydrocoins ("0" = forged or earned, not sold). Source for every row unless noted: Bridgepour DB tooltips, prices and stores — [api.bridgepour.com/api/items/all](https://api.bridgepour.com/api/items/all/), [towns/shops](https://api.bridgepour.com/api/towns/all/) — with patch-note details from the SN links given above.

### Cited Findings

**A. Fluid sources, pipes and pipe hooks (water on Bastion; water and lava on Volcalidus)**

| Item | Price | Function / numbers | Connects | Tier / notes |
|---|---|---|---|---|
| Forged Iron Intake Water Pipe | 36 | Pumps water at 100% | placed at water's edge; pipe end | T1 |
| Cloutium Intake Water Pipe | 632 | 250% | same | T2 |
| Corestone Intake Water Pipe | 632 | 350% | same | T3 |
| Lava Intake Pipe | 36 | Pumps lava at 250% | at lava | DLC |
| Ice Melter | 380 | Melts ice to water for belts; logic 0 disables output | pipe out, logic in | DLC water source |
| Forged Iron Hydro Pipe / Elbow / T | 22/25/28 | -3% per segment | snap end-to-end | T1 |
| Cloutium Hydro Pipe / Elbow / T | 210/286/295 | -2.5% | same | T2 |
| Corestone Hydro Pipe / Elbow / T | 210/286/295 | -2% | same | T3 |
| Frost Hydro Pipe / Elbow / T | 22/25/28 | -2.5% (water) | same | DLC |
| Lava Pipe / Elbow / T | 22/25/28 | -2.5% (lava) | same | DLC |
| Forged Iron / Cloutium / Corestone / Lava Intake Booster Hook | forged (designs 82/454/747/1400) | +20 / +30 / +40 / +30% at intake | hook on intake pipe | forge recipes 60 Iron / 60 Cloutium |
| Forged Iron Pressure Tank | 142 | Restores pressure up to intake value; burns Shard or Shard Bar | inline | T1 |
| Cloutium / Corestone Pressure Tank | 853 | same | inline | T2/T3 |
| Frost / Lava Pressure Tank | 142 | same (relative to ice melter or lava intake) | inline | DLC |
| Water Filter Hook | 174 | +2 quality (max 10); 5 = clean; takes damage | hook on straight or T pipe | repair with spanner |
| Invincible Water Filter Hook | 174 | Full quality, no damage | hook | creative only |
| Water Pressure Gauge Hook | 74 | Shows pipe pressure | hook on straight or T pipe | |
| Valve Hook | 85 | Stops water or logic | hook | manual |
| Logic Valve Hook | 85 | Stops water or logic, logic-controlled | hook | the automation master switch |
| Cork | 15 | Caps a pipe end | pipe end | |
| Sprinkler Hook | 2100 | Waters crops; radius scales with pressure | hook on pipe | farming |

**B. Extraction and primary processing**

| Item | Price | In → Out | Needs | Notes / behaviour |
|---|---|---|---|---|
| Dull / Common / Advanced Shovel | 22 / 694 / 2350 | terrain → dirt clump (bucket or belt) | – | T1/T2/T3 depth-limited; dirt can go straight onto belts (1.5) |
| Dull / Common / Advanced Pickaxe | 122 / 742 / 1240 | digs fast, splits dirt | – | T1-T3; hold LMB to repeat (2.0.6) |
| Rakes (Dull/Common/Advanced) | 124 / 245 / 280 | flatten terrain | – | T1-T3 |
| DLC Ice Shovels / Icepicks / Ice Rakes | same prices | ice and frost rock | – | T1-T3 |
| Bucket | 4 | holds 4 shovel loads, or water | – | container |
| Pan + Brush | 12 + 2 | dirt + water → nuggets and uncut gems | water poured in | 1 scrub (2.0); also the main carry container |
| Forged Iron Drill | 432 | dirt in place → dirt chunks (stays at its depth) | water, filtered | T1; needs ≥2 blocks deep for Cloutium; lever on/off; takes damage |
| Cloutium Drill | forged (1000 Fe + 300 Cl) | same | water | T2 |
| Corestone Drill | forged (design 2460) | same | water | T3 |
| Lava Drill / Heavy Lava Drill | 430 / forged (design 2100) | ice and frost rock chunks | lava | DLC; Heavy must be moved by Lava Hauler crane; speed buffs via Forge Marks |
| Forged Iron Harvester | 320 | dirt chunks → ores and gems | water, filtered | T1; yield scales with pressure |
| Cloutium Harvester | forged (300 Fe + 100 Cl) | same | water | T2 |
| Corestone Harvester | forged (design 1130) | same | water | T3 |
| Lava / Heavy Lava Harvester | 320 / forged (design 2020) | ice and frost rock → resources; Heavy also outputs water at 350 (logic toggle) | lava | DLC |
| Hardstone Refiner | 340 | hardstone → blocks once the logic-set amount is filled | lava; logic | DLC |
| Abandoned (Idle) Miners | built from materials | passive ore, 1-15 weight / 10 s, capped at 100-500 | none | DLC world structures |
| D.A.V.I.D. (OUTDATED 1.3-1.7) | (powered version 2340) | duplicates dirt for the Goliath drill | shards (later power) | removed in 2.0 |
| Goliath Drill, Excavator (OUTDATED) | – | pre-2.0 drill; dirt-digging vehicle | – | Excavator removed in 2.0, succeeded by Hydro Mole (2.2) |

**C. Sorting, logistics and belt hooks**

| Item | Price | Function | Connects | Notes |
|---|---|---|---|---|
| Hand Sorter | 165 | pour mixed items in; tray item's type goes out the lower chute, rest out the front | needs water input | clogging fixes 2.0.1, 3.0.6 |
| Straight Conveyor | 220 | moves items; speed ∝ pressure | hook on pipe | walkable when on |
| Left / Right Conveyor | 240 | 90° corner | hook on pipe | |
| Vertical Conveyor | 323 | lifts items | hook on pipe | long climbs once pushed items down (fixed 2.2.3) |
| Splitter Conveyor Left / Right | 532 | diverts items matching the tray item | hook on pipe | matches form (nugget vs bar); slower than belts |
| Merger Hook | 480 | T-junction between belts | hook on belt | 2.0.6 |
| Centraliser Hook | 462 | centres items on belt | hook on belt | 2.0.2 |
| Gem Polisher Hook | 462 | uncut → polished gem in transit | hook on belt | auto-centres output |
| Logic Saw Hook | 320 | cuts items to a logic-set size | hook on straight belt; needs water | times items out (no double cut) |
| Veg Dicer Hook | 480 | chops vegetables | hook on belt | farming |
| Logic Counter | 560 | counts items through its gate; target set from top; reading out the side | belt gate + logic | |
| Funnel | 110 | narrows a drop | free | community advises avoiding it (sticking) |
| Tin Sheet (+ Corner, Ramp, Long Ramp, Triangle, Long Triangle) | 2-6 | chutes and guides | building piece | the "chute" role |
| Wooden / Fast / Agile Cart; Sled Cart (DLC) | 350 / 740 / 740 / 350 | push-cart storage; contents have no internal collision | carried | fast = speed, agile = turning |
| Pallet | 450 | items dropped on it lock to it; multi-buy | carried | |
| Magnet on a Stick | 428 | handheld item attractor | tool | no longer pulls items out of pans (3.0) |
| Icehelm transporter pipes | world | send items through Icehelm city | fixed | 2.0 |
| Conveyor Shredder hooks (OUTDATED) | – | dirt shredding on belts | belt hook | pulled from stores in 2.1; absent now |

**D. Smelting, crafting and refining stations**

| Item | Price | In → Out | Timing / behaviour |
|---|---|---|---|
| Small Furnace | 86 | heats crucible or bars | lights on placement; bars need about 30 s to get hot for the anvil; also cooks fish (1.7) |
| Crucible | 18 | ore → molten (one type) | carried to a furnace, poured into a mold |
| Casting Mold | 42 | molten → bar | |
| Smelter | 1320 | ore via top (belt-fed) → bar on click | single ore type; bubbling sound when melted |
| Logic Smelter | 17,300 | belt-fed; logic pulse casts a bar | about 4 s cast, rejects input meanwhile; bar weight = all contents; no damage since 2.2 |
| Logic Content Reader | 620 | reads smelter or ice melter liquid, spanner-hurler uses, shard weight in a tank | logic out |
| Grinding Wheel | 84 | uncut → cut gem (manual) | |
| Logic Gem Compressor | 930 | cut gems (one type) → compressed or larger gem | water + logic on; lid can trap gems |
| Saw / Gem Chisel | 143 / 430 | halves bars / gems | manual |
| Anvil + Blacksmithing Hammer | 86 + 105 | hot bars and gems → dagger, axe, sword, ring, necklace | recipes chosen by clicking; slot order matters |
| Masterwork Forge (Icehelm; Volcalidus Peak) | world | design + bar weight → drills, harvesters, boosters, tools | lever-driven crucible track + hammer animation; excess bars returned |
| Scales | 146 | weight and value readout | |
| Cooking Pot / Stove / Seed Mill / Cut Veg Stacker | 39 / 86 / 235 / 156 | farming chain (soup, seed bags, compressing cut veg; stacker needs water) | farming |

**E. Logic components (all price-listed; mostly from Hobson's Logicworks)**

| Item | Price | Behaviour |
|---|---|---|
| Logic Straight / Elbow / T Cable | 84 / 84 / 86 | carry values (bidirectional) |
| Logic Button | 84 | outputs 1 (click to change) |
| Logic Lever | 84 | outputs 1 or 0 |
| Logic Keypad | 98 | sends a custom number |
| Logic Repeater | 84 | outputs 1 every second |
| Logic Delay 1s / 10s (hook) | 84 / 84 | delays the signal |
| Logic Diode Hook | 74 | one-way |
| Logic Flip Hook | 74 | 0 → 1; ≥1 → 0 |
| Logic Flip-Flop Hook | 74 | alternates 1, 0, 1… |
| Logic Validator Hook | 74 | passes only ≥1 |
| Logic Add / Subtract / Multiply / Divide | 102 each | arithmetic on A and B, fires when either arrives |
| Logic Equals / Greater Than | 102 each | output 1/0 (A = B; A ≥ B) |
| Logic Reader Display (hook) | 74 | shows the value in a cable |
| Logic Weight Reader | 620 | cumulative weight of items arriving in front; reset input on top |
| Logic Durability Reader | 360 | durability every second when facing a damageable item |
| Logic Light Hook / Logic Lamp | 285 / 342 | light; 9-digit RGB colour (e.g. 255255000) |
| Logic Magnet | 1052 | when on, pulls objects within 2 blocks |
| Logic Destroyer | 863 | deletes items when on |
| Logic Spanner Hurling Unit | 1200 | on >0, throws a spanner forward (repairs); stores 20; refill with spanners or tool bags |
| Logic TNT / Logic Mini Nuke | 360 / 26,000 | terrain destruction on signal; nuke clears a claim (1-year anniversary item) |
| (also logic-capable) Logic Valve Hook, Logic Saw Hook, Logic Counter, Logic Gem Compressor, Logic Smelter, Logic Content Reader, Ice Melter, Hardstone Refiner, Heavy Lava Harvester | see above | |
| OUTDATED 1.6: Custom Logic Number, Diode Logic Cable, Leg-X / logic supports, powered devices | – | replaced or removed in 2.0 |

**F. Storage, maintenance, lighting and utility**
- Storage:
  - Safe (450): stores bars.
  - Tool Rack (78) / Extended Tool Rack (280): store tools.
  - Rod Rack (102).
  - Weapon racks (70): Angled, Curved, Vertical.
  - Plinth (185): gems, jewellery, relics, coins, tokens.
  - Seed Box (340), Vegetable Basket (28), Fish Bucket (28), Task Board (25).
  - Pan, Bucket, Carts and trucks as bulk containers. Coins, dirt etc. stack while stored (3.0) — [BP safe](https://bridgepour.com/database/safe), [SN-Mega Patch](https://store.steampowered.com/news/app/1106840/view/5756237364312335366).
- Maintenance: Spanner (53), Tool Bag (220), Magnifying Glass (440), Construction Hammer (42).
- Lighting:
  - Lantern (48) and Torch (52) handheld; Mining Helmet (361), which auto-lights when worn.
  - Standing Torch (160), Wall Lantern (160), Brazier (120, DLC), Firefly Jar (48), Jack-o-Lantern (160, seasonal), Logic Lamp and Logic Light Hook.
- Prospecting: Prospecting Helmet (430) detects ore veins — [BP prospecting-helmet](https://bridgepour.com/database/prospecting-helmet).
- Creative only: Creative Wand (duplicate or delete), Gravity Tool, Flight Cap, Hard Hat (auto-duplicates placed items), Hourglass (time control), Invincible Filter — [SN-1.7](https://store.steampowered.com/news/app/1106840/view/4186652991113411288).
- Selling: drop items on the jeweller's or store table and press the price-board button. Sale signs show the price. Stock markets buy specific goods. The Scrap Yard turns items into scrap (25% value) — [Bridgepour "How to Play" guide](https://api.bridgepour.com/api/guides/), [SN-2.0](https://store.steampowered.com/news/app/1106840/view/4348799082201741462).
- DLC store-building: Construction Crates (Tier 1 50 / Tier 2 760 / Tier 3 2400 / Jeweller 210 / Ticket Office 320) rebuild New Glade stores, which act as the DLC tech tree — [BP towns API](https://api.bridgepour.com/api/towns/all/), [SN DLC announcement](https://store.steampowered.com/news/app/1106840/view/5510783579247049777).
- Vehicles that interact with machines (detail left to the vehicle researcher):
  - Hydro Mole digs terrain at 3 angles (2.2).
  - Lava Hauler crane lifts "Machines / Vehicles / Buff Stones" too heavy to carry, and was extended to reach dig-site bottoms.
  - Lava Thaw digs with flame; boosters raise its depth tier.
  - Hydro Cropper harvests crops — [SN-2.2](https://store.steampowered.com/news/app/1106840/view/6539831519489700435), [SN Dev Vlog Mar 2024](https://store.steampowered.com/news/app/1106840/view/5686430301729334870), [BP lava-thaw-booster](https://bridgepour.com/database/lava-thaw-booster).

**Physical behaviour notes (cross-machine)**
- No inventory. Every object is a physics prop picked up one at a time with E; a drop-shadow shows the landing spot — [The Xbox Hub review](https://www.thexboxhub.com/hydroneer-review/). PC Gamer ran a column on the no-inventory design — [PC Gamer](https://pcgamer.com/i-cant-decide-if-having-no-inventory-system-in-this-crafting-game-is-brilliant-or-brutal).
- Resources are physical nuggets with weight-based value. Ores roll and stick; magnets once broke pan, bucket and crucible locking (fixed 2.0.7) — [SN-2.0.7](https://store.steampowered.com/news/app/1106840/view/4539082035562738288).
- Engine structure: a community modkit author reports Hydroneer has "only a small handful of C++ classes, with the rest in Blueprints", and that permission to distribute a modkit was denied (search snippet) — [UE modding dev guide: Community Modkits](https://buckminsterfullerene02.github.io/dev-guide/ModSupport/ModKits/CommunityModkits.html). Mods load via HML and Steam Workshop (1.4+). Mods such as "Logic Extended" and "Pipe Extended" existed in 1.6 — [SN-1.6.11](https://store.steampowered.com/news/app/1106840/view/5418383147738990807).

### Inferences
- The machine set is small and orthogonal: about 10 machine roles (source, pipe, tank, filter, drill, harvester, belt, sorter, smelter, gem processor) plus a logic toolkit. A browser game can reach similar depth with a comparable count by keeping the **hook/attachment** structure and **tier-by-depth** gating.

### Gaps
- No machine footprints or exact dimensions in any source found.
- Corestone design recipe weights, Heavy Lava machine recipes, and Lava Thaw numbers were not found.
- The DLC Abandoned Miner build costs come from a single source (Bridgepour).

---

## 8. Verification of the coordinator's suspected machine list

### Takeaway
Many suspected items **do not exist in Hydroneer**. They are not in the 409-item Bridgepour DB, and none of the search terms appear anywhere in 60+ official patch notes from 2019 to 2026. They likely come from other mining games such as Gold Rush, Hydroneer-likes, or Minecraft mods. The real equivalents are listed below.

### Cited Findings
Method: case-insensitive search of the full Steam announcement corpus and of all 409 Bridgepour item records, both from [Steam News API / announcements](https://store.steampowered.com/news/app/1106840/view/4348799082201741462) and [api.bridgepour.com/api/items/all](https://api.bridgepour.com/api/items/all/). Zero hits for: sluice, water wheel, power wheel, generator, gearbox, shaft, crusher, washer, hopper, coin press, bulk processor, packer, barrel, mega drill, proximity sensor, timer.

| Suspected item | Verdict | Real Hydroneer equivalent |
|---|---|---|
| Pan | **Exists** | Pan (12) + Brush (2); 1 scrub since 2.0 |
| Sluice / Large / Bulk Sluice | **Does not exist** | Harvester (T1-T3) washes dirt chunks into ore; Hand Sorter |
| Water Pump | **Partly**: no standalone pump | Intake Water Pipe (100/250/350%) + Intake Booster Hooks; 1.6-only "Powered Intake Pipe" (OUTDATED) |
| Water pipes and valves | **Exists** | 3 pipe tiers + Frost/Lava; Valve, Logic Valve, Cork |
| Water Wheel / Power Wheel / Generator | **Does not exist** | None. 1.6-1.7 had a shard-fuelled **Reactor** + batteries + power lines, removed in 2.0 |
| Shafts and Gearboxes | **Does not exist** | Not applicable (no rotational power) |
| Basic Drill / Mega Drill / rigs | **Partly** | Forged Iron/Cloutium/Corestone Drills; Lava and Heavy Lava Drills; pre-2.0 "Goliath Drill" (OUTDATED) |
| Crusher | **Does not exist** | Harvester; pickaxe or saw for splitting; Seed Mill crushes vegetables |
| Ore Washer | **Does not exist** | Harvester / Pan |
| Sorter / Filter | **Exists** | Hand Sorter; Splitter Conveyor L/R. "Filter" in Hydroneer means the water-quality filter hook |
| Hopper | **Does not exist** | Funnel; smelter pot accepts belt drops |
| Conveyor belts (straight/curved/inclined) | **Mostly** | Straight, Left/Right corner, Vertical. No inclined belt; tin ramps used instead |
| Chutes | **Not a machine** | Tin Sheet pieces; hand sorter has chutes |
| Magnets | **Exists** | Logic Magnet (2-block pull); Magnet on a Stick |
| Smelter / Furnace (small and large) | **Exists** | Small Furnace + Crucible + Casting Mold; Smelter; Logic Smelter |
| Forge | **Exists** | Masterwork Forge (fixed world site, Icehelm; Volcalidus Peak) |
| Casts (bar, nugget, ring, necklace) | **Only bar** | Casting Mold makes bars. Rings and necklaces are crafted on the Anvil, not cast |
| Jewelry crafting table | **Not separate** | Anvil + Blacksmithing Hammer |
| Gem polisher / cutter | **Exists** | Grinding Wheel (manual), Gem Polisher Hook (belt), Gem Chisel (split), Logic Gem Compressor |
| Coin press | **Does not exist** | Coins are physical currency stacks; wells convert coins to a "Boot" of equal value |
| Bulk processor | **Does not exist** | Logic Gem Compressor / Logic Smelter batch via logic |
| Packer / crates | **Does not exist** | Pallet; DLC Construction Crates build stores |
| Storage barrels / racks | **Racks yes, barrels no** | Tool, rod and weapon racks; Safe; Plinth; Seed Box; carts |
| Sell pads / sell points | **Exists (as shops)** | Jeweller and store tables + price-board button; Stock Markets; Scrap Yard; Grocers |
| Logic gates | **Exists** | Add/Sub/Mul/Div, Equals, Greater Than, Flip, Flip-Flop, Validator, Diode |
| Sensors (proximity, weight/item) | **Weight and item yes; proximity no** | Weight Reader, Counter, Durability Reader, Content Reader |
| Switches / buttons / timers | **Exists** | Button, Lever, Keypad; "timers" = Repeater (1/s) + Delay 1s/10s |
| Lights / lanterns | **Exists** | Lantern, Torch, Mining Helmet, Standing Torch, Wall Lantern, Brazier, Logic Lamp/Light Hook |
| Cranes | **Vehicle only** | Lava Hauler crane (DLC) |
| Excavators | **Removed** | Excavator removed in 2.0; Hydro Mole (2.2) and Lava Thaw dig terrain |

- Sources for the removals: "Excavator vehicle removed (For now...)" — [SN-2.0](https://store.steampowered.com/news/app/1106840/view/4348799082201741462); the Hydro Mole as its successor — [SN-2.2](https://store.steampowered.com/news/app/1106840/view/6539831519489700435); the Lava Hauler crane — [SN DLC announcement](https://store.steampowered.com/news/app/1106840/view/5510783579247049777).
- Low-confidence site warning: shapes.inc "Hydroneer Deep Dives" pages describe a "Hydro-Electric Generator", "Shard Crusher" and an "Electricity system". No official or community source corroborates them, so they are likely fabricated — [shapes.inc](https://shapes.inc/fandom/hydroneer/deep-dive).

### Inferences
- If the original game is meant to *resemble* Hydroneer, the defining traits are: fluid pressure instead of mechanical power, tiers gated by depth, physical items with weight-based value, hook attachments, and event-based numeric logic. Sluices, water wheels and gearboxes would be original additions; they are fine to add, but they are not Hydroneer mechanics.

### Gaps
- I could not rule out mods that add some of these items: the 1.6-era "Logic Extended" and "Pipe Extended" mods, and the 12 mods on Nexus. They are not part of the base game.
