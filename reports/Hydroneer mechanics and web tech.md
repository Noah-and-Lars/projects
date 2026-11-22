# Pressure, Weight and Voxel Dirt Run Hydroneer

Hydroneer works because of three ideas. First, every object is a physical prop with a continuous **weight** that sets its value, and there is no inventory. Second, every machine runs on **fluid pressure** that travels through snapped pipe networks. There are no gears, generators or electricity. Third, **bounded voxel dig sites** are sorted into three depth tiers, and the tier of your tools and machines sets how deep you can work. Drills never change the terrain. They produce dirt chunks forever at a fixed depth. A weighted table of roughly **Iron 50 / Gold 37 / Shards 5 / Gems 5 / Corestone 2 / Cloutium 1** turns each chunk into ore. Value is simply per-weight base value × weight, and each processing step adds a fixed bonus. Under the hood it is a small UE4.26 Blueprint game on PhysX. It stays playable through a few tricks: settled items stop simulating, cargo attaches to vehicle beds, water is scripted rather than simulated, and dig sites are few. The same physics is why the developer cancelled true online multiplayer in December 2021 and shipped Steam Remote Play split-screen instead. For an original browser game with similar mechanics, the best-supported stack is **Three.js r187 (WebGPURenderer with automatic WebGL2 fallback), Rapier 0.21 WASM in a Web Worker, custom chunked surface-nets voxel terrain meshed in workers, IndexedDB chunk-delta saves, and Cloudflare static hosting with R2/D1 cloud saves**. Babylon.js 9 with Havok is the batteries-included alternative. Our game will have host-authoritative online play, so the hard lesson from Hydroneer is to design items as data first and physics second. Belt items, container contents and distant machines should be deterministic simulation, not rigid bodies. Only awake bodies near players get replicated, and terrain syncs as sequenced edit operations.

Everything labelled *reference* describes Hydroneer (final content version 3.0.x, April 2024, plus fix patches to May 2026). Use it to understand the design, and do not copy it. Our game needs its own names, art and look: none of Cloutium, Corestone, Hydrocoins, Bridgepour, Icehelm, Hydro Mole and so on. Sections marked *for our game* are recommendations.

## Corrections the researchers found — do not reintroduce these

Several premises in the original brief, and several claims on low-quality sites, are wrong. **Hydroneer was never Early Access and had no "1.0 in 2021".** It launched on Steam as a full release on **8 May 2020**. The developer wrote: "It has never been listed as an Early Access game and has always primarily been sold as a $15 open-ended mining sandbox game" ([A Message From Max, Jan 2024](https://store.steampowered.com/news/app/1106840/view/6300039510120170533); [Steam store](https://store.steampowered.com/app/1106840/Hydroneer/)). Paid alpha builds were sold on itch.io before that. **"Multiplayer added in 2.0" is only half true.** 2.0 added local split-screen streamed through Steam Remote Play. True online co-op was announced and then cancelled ([2.0 notes](https://store.steampowered.com/news/app/1106840/view/4348799082201741462)).

| Claim to avoid | Reality (reference) | Evidence |
|---|---|---|
| Early Access 2019, 1.0 in 2021 | Full Steam release 8 May 2020; versions run 1.3 → 2.0 (May 2022) → 3.0 (Apr 2024); declared "finished" April 2024 | [Max, Jan 2024](https://store.steampowered.com/news/app/1106840/view/6300039510120170533) |
| Ores: cobalt, arcanite, infernum, bismuth, chromium, copper, silver, platinum, tin, titanium | **Do not exist.** Zero hits across 64 official announcements | [Steam News API](https://api.steampowered.com/ISteamNews/GetNewsForApp/v2/?appid=1106840&count=300&maxlength=0&format=json) |
| Gems: topaz, amethyst, jade | **Do not exist.** Gems are Emerald, Sapphire, Ruby, Onyx, plus Diamond in the DLC | same |
| Paydirt, sluices, ingots, crushed ore | **Do not exist.** Processing uses dirt chunks, pans and harvesters; metal comes as "bars", not "ingots". A "sluice" description attributed to a PC Gamer Hydroneer article actually describes *Gold Rush* (2017) | [PC Gamer (Gold Rush)](https://www.pcgamer.com/dig-for-gold-in-this-early-access-mining-sim-and-then-keep-digging-and-then-dig-some-more) |
| Places: Bridgeview, Ironfall, Firestone Reef, Arcania | **Do not exist.** Real names: Bridgepour, Ironil, Bastion Keep, Burnscroft, Grangefield, Icehelm, Snowrune Falls, The Crossroads on the island of Bastion; Volcalidus (DLC) | [Bridgepour towns API](https://api.bridgepour.com/api/towns/all/) |
| Water wheels, generators, shafts, gearboxes, crushers, ore washers, hoppers, coin press, bulk processor, packer, barrels, proximity sensors, timers as machines | **Do not exist** in the 409-item database or the patch notes. A shard-fuelled Reactor/battery "Powerline" system existed only from 1.6 to 1.7 and was **removed in 2.0** | [Bridgepour items API](https://api.bridgepour.com/api/items/all/); [2.0 notes](https://store.steampowered.com/news/app/1106840/view/4348799082201741462) |
| Backpack, belt slots, jetpack, grappling hook, charged throw, enemies, health, fall damage | **Not found.** No inventory "is one of the principal pillars of design" | [dev reply, Apr 2024](https://steamcommunity.com/app/1106840/discussions/0/4349988612571529260/) |
| Trailers, forklifts, minecarts, rails, drivable boats, tractor (post-2.0) | **Not found.** Carts can be clipped behind trucks as a player trick; ships are fixed ticketed links | [Steam: Idea: Trailers](https://steamcommunity.com/app/1106840/discussions/0/601891224286150167/) |
| A purity or quality stat on ore | **Does not exist.** Weight alone is the quality variable | [Item Price Guide thread](https://steamcommunity.com/app/1106840/discussions/0/2451595458576914137/) |
| Supply-and-demand pricing, a "Vibrating Jig", an excavator in current versions (Fandom "Onyx" page) | That page looks fabricated. The Excavator was removed in 2.0 | [Fandom](https://hydroneer.fandom.com/wiki/Cloutium) (site), [2.0 notes](https://store.steampowered.com/news/app/1106840/view/4348799082201741462) |
| "Hydro-Electric Generator", "Shard Crusher", an "electricity system" (shapes.inc deep dives) | Uncorroborated; likely fabricated | [shapes.inc](https://shapes.inc/fandom/hydroneer/deep-dive) |
| Held items dangle on a physics spring or joint "Hydroneer-style" | Wrong. Datamine shows the held item is lerped to a hand socket, given a "Held" collision profile and drawn as a proxy mesh. Only the creative Gravity Tool floats items | [RFC SDK dump](https://github.com/RFC-MiningCompany/HydroneerTemplate) |
| A PC Gamer 2.0 article dated "2025" | The 2.0 update was May 2022 | [PC Gamer](https://pcgamer.com/mining-sandbox-hydroneer-now-has-multiplayer-vehicles-and-an-optimized-code-rework) |
| Pan needs two scrubs (older Bridgepour guide) | One scrub since 2.0 | [2.0 notes](https://store.steampowered.com/news/app/1106840/view/4348799082201741462) |
| A Hydroneer 2 sequel | None. The studio's next game is *Die Trying*, a co-op extraction shooter | [Die Trying announcement](https://store.steampowered.com/news/app/1106840/view/1799088287836850) |

Names like cobalt, topaz, sluices or water wheels are fine as *original* design ideas for our game. They just must not be cited as Hydroneer reference. "Not found" means absent from every official announcement and every community source reviewed. No datamined loot table was available to prove a negative from inside the game files.

## Seven ground resources, one weighted roll per dirt chunk (reference)

### The roster and where it comes from

The base game since 2.2 (April 2023) has seven ground resources. **Iron and Gold** are common bulk ores. **Shards** are unsellable fuel for pressure tanks. **Cloutium** is the rare ore that gates Tier 2. **Corestone** is the rare ore that gates Tier 3 and appears only at T2/T3 depths. **Gems** come out uncut: Emerald, Sapphire, Ruby, and the super-rare Onyx, which has an official **0.1% spawn chance** ([1.7 notes](https://store.steampowered.com/news/app/1106840/view/4186652991113411288); [2.2 notes](https://store.steampowered.com/news/app/1106840/view/6539831519489700435)). The official rarity order is "Onyx is still expensive and rare, then Rubies, Sapphires, then Emeralds" ([2.0.6 notes](https://store.steampowered.com/news/app/1106840/view/4474904295773706248)). The Volcalidus DLC (2024) replaces dirt with snow and ice. It adds **Ice** (shallow, shovel or drill), **Frost Rock** (deeper, drill only), **Hardstone** (must be refined into blocks, which serve as a building currency) and **Diamond**, a gem less rare than Onyx ([DLC Mega Guide](https://steamcommunity.com/sharedfiles/filedetails/?id=3216588622); [gameplay.tips](https://gameplay.tips/guides/hydroneer-volcalidus-dlc-guide.html)).

There are **no rock nodes**. You dig smooth voxel dirt with a shovel, pickaxe, TNT, a mini nuke or a digging vehicle, or a drill produces it. Either way you get **dirt chunks**, which are physics objects. These are then processed into ore, either by hand-panning (pan + water + brush) or in a water-powered **Harvester**. Drills "do not remove the dirt under them, instead only work to a certain depth depending on their tier", so a drill is an infinite extractor at a fixed depth ([2.0 notes](https://store.steampowered.com/news/app/1106840/view/4348799082201741462)).

### Measured drop tables

No datamine exists. All percentages come from player test rigs, but two sources agree closely.

| Resource (regular dirt, v2.2+) | Ore Veins Data thread (Apr 2023) | Rainrune Price Guide (Jun 2024) |
|---|---|---|
| Iron | 50% | 50% |
| Gold | 37% | 37.3% |
| Shards ("Crystal") | 5% | 4.7% |
| Gems (all) | 5% | 4.9% |
| Corestone | 2% | 2% |
| Cloutium | 1% | 1.1% |
| Onyx (subset of gems) | ~0.1% official; 0.125% measured pre-2.2 | — |

Sources: [Ore Veins Data](https://steamcommunity.com/app/1106840/discussions/0/3821909708353152671); [Rainrune guide](https://steamcommunity.com/sharedfiles/filedetails/?id=3265890693); [Call Before You Dig](https://steamcommunity.com/sharedfiles/filedetails/?id=2809258751). The Rainrune guide may not be independent of the thread. The split between Emerald, Sapphire and Ruby is unknown.

**Ore veins** (2.2) are roughly spherical zones in small, medium and large sizes. They are generated with the map at new game, sit at any depth, and are found with a Prospecting Helmet or the Hydro Prospector vehicle. A drill whose tip is inside a vein gets about **one-third of its drops as the vein's resource**. The other two-thirds come from the normal table. That is roughly a 33× boost to Cloutium ([2.2 notes](https://store.steampowered.com/news/app/1106840/view/6539831519489700435); [Ore Veins Data](https://steamcommunity.com/app/1106840/discussions/0/3821909708353152671)).

| Vein test | Main | Iron | Gold | Gems | Corestone | Other |
|---|---|---|---|---|---|---|
| Cloutium vein (10,000+ cycles) | Cloutium 33.3% | 33.9% | 25% | 3.6% | 1.2% | Crystal 3% |
| Small Crystal vein (~1,000 cycles) | Crystal 36.6% | 33% | 25% | 3.3% | 1.1% | Cloutium 1% |

Depth changes **nugget weight, not odds**. A guide author "verified for gems, iron, gold, and cloutium" that average weight rises with depth: **about 0.5 at the surface, about 3.4 at the bottom of T1 (8 blocks), and about 4.3 at the bottom of T2 (14 blocks)** ([Call Before You Dig](https://steamcommunity.com/sharedfiles/filedetails/?id=2809258751)). A Fandom page claims a T1 maximum of 2.53, flagged as needing verification. Higher harvester pressure adds a chance of extra nuggets, but the size of that bonus is unquantified ([2.0.6 notes](https://store.steampowered.com/news/app/1106840/view/4474904295773706248)). Hand panning had a looser rule: since 2.0.6 Cloutium comes "only... using drills" underground but "will still spawn for pans at any level".

### Depth tiers and tool gating

| Tier | Depth (blocks) | Gated by | Notes |
|---|---|---|---|
| T1 | 0–8 | Dull tools, Forged Iron drill/harvester | Cloutium needs at least 1–2 blocks depth for drills |
| T2 | 9–14 | Common tools, Cloutium machines | Corestone starts one block below the T2 boundary |
| T3 | 15–22 | Advanced tools, Corestone machines (2.2) | Before 2.2, reachable only by explosives |
| Bedrock | 23 | — | undiggable |

T1 0–8 and T2 to 14 are confirmed by three sources. **T3 15–22 and bedrock at 23 rest on a single guide** ([Call Before You Dig](https://steamcommunity.com/sharedfiles/filedetails/?id=2809258751); [GamesFuze](https://gamesfuze.com/guides/hydroneer-2-0-tier-dirt-explained/)). The Bridgepour API gives every paid site a depth value of 22 and the starter site 5 ([digsites API](https://api.bridgepour.com/api/digsites/all/)). A tool of tier N works on dirt of tier N or lower. Hitting the next tier makes a "Ting" sound or sparks. Each tier has its own dirt texture, and chunks keep their tier's texture after they are dug ([2.0.6 notes](https://store.steampowered.com/news/app/1106840/view/4474904295773706248)).

### Value per weight and the processing chain

**Price = base value per weight × weight.** The developer confirmed the formula in 2020, and 2.0 re-based the values. There is no purity stat ([Item Price Guide thread](https://steamcommunity.com/app/1106840/discussions/0/2451595458576914137/)).

| Material | Raw / uncut (coins per wt) | Bar / cut (coins per wt) | Step bonus |
|---|---|---|---|
| Iron | 9 / 9.5 / 10 (sources differ) | 12 | ~+33% |
| Gold | 16 / 16.7 / 17 | 20 | ~+18–20% |
| Cloutium | **170** (official) | **200** (official) | ~+18% |
| Corestone | 22 | 26 | ~+18% (single source) |
| Emerald / Sapphire / Ruby | 12–18 | 22–28 | ~+55–83% |
| Onyx | 150 | 250 | +67% |
| Diamond (DLC) | 150 | 250 | — |
| Hardstone (DLC) | 8 | n/a | — |
| Ice / Frost Rock (DLC) | 1 | n/a | — |
| Scrap metal / scrap bar | 1 | 2 | ×2 |

Sources: [2.0 notes](https://store.steampowered.com/news/app/1106840/view/4348799082201741462) (Cloutium went from 35→170 for ore and 40→200 for bars); [Felwyn PPW guide](https://steamcommunity.com/sharedfiles/filedetails/?id=2550881493); [Item Price Guide](https://steamcommunity.com/app/1106840/discussions/0/2451595458576914137/); [Rainrune](https://steamcommunity.com/sharedfiles/filedetails/?id=3265890693). Gem values differ between sources because the July 2022 rebalance changed them. Rainrune's 2024 ordering (Sapphire 26 above Ruby 25) contradicts the official ordering.

Anvil crafting multiplies the component value: **Dagger and Ring ×1.1, Axe and Necklace ×1.2, Sword ×1.3**. Fandom's worked example uses a 400-weight iron bar: the bar is worth 4,800, a dagger 5,280, an axe 5,760 and a sword 6,240 ([Fandom Iron Bar](https://hydroneer.fandom.com/wiki/Iron_Bar)). Weight is conserved at every step. A recipe needing 300 iron accepts a 305-weight bar and returns 5. Scrapping pays 25% of value as scrap metal ([2.0 notes](https://store.steampowered.com/news/app/1106840/view/4348799082201741462)).

The chain runs like this. Ore is melted in a Crucible over a Small Furnace and poured into a Casting Mold, or fed to a Smelter (1,320) or a Logic Smelter (17,300). That makes a bar, and bars must be reheated for about 30 s before smithing. Bars become weapons or jewellery at the Anvil. Since 2.2 any material except shards works there. Bar weight becomes machines at the fixed-location **Masterwork Forge**. Gems go from uncut to cut (Grinding Wheel or belt Polisher Hook) and can then be merged in a Gem Compressor. **There are no alloys.** Smelters reject a second ore type. Before 3.0, a crucible *deleted* mismatched ore; that was fixed with the note "No more expensive mistakes!" ([2.1.1 notes](https://store.steampowered.com/news/app/1106840/view/4980448574127321166); [dev vlog Mar 2024](https://store.steampowered.com/news/app/1106840/view/5686430301729334870)). Pieces are physics objects that roll and pile. Bars and gems can be split with a saw or chisel, or cut to size with the Logic Saw Hook. Nuggets cannot be merged.

The **design pattern** is easy to port. Use one weighted table roll per processed chunk, then a weight roll from a depth-dependent distribution. Veins re-weight the table locally, and pressure adds a bonus-item chance. Rare ores double as the material cost of the next machine tier: iron → Cloutium for T2 → Corestone for T3. That builds a loop where deeper digging needs better machines, and better machines need materials only found deeper.

## Fluid pressure, not power, drives every machine (reference)

### The pressure model

Current Hydroneer has **no electricity, generators, water wheels or shafts**. Every automated device runs on pressurised fluid in snapped pipes: water on Bastion, lava on Volcalidus. An **intake pipe placed at the water's edge** sets the starting pressure. Each pipe segment subtracts a fixed loss. Up to four **Intake Booster Hooks** add pressure at the intake. **Pressure Tanks** fuelled by a shard restore the line to the intake value, never higher. Since 2.2, a line is capped by "the maximum pressure of the weakest pipe in the line" ([2.2 notes](https://store.steampowered.com/news/app/1106840/view/6539831519489700435); [Bridgepour items API](https://api.bridgepour.com/api/items/all/)).

| Part | Price | Effect |
|---|---|---|
| Forged Iron (T1) intake | 36 | 100% |
| Cloutium (T2) intake | 632 | 250% |
| Corestone (T3) intake | 632 | 350% |
| Lava intake (DLC) | 36 | 250% |
| T1 pipe / elbow / T | 22 / 25 / 28 | −3% per segment |
| T2 pipe / elbow / T | 210 / 286 / 295 | −2.5% per segment |
| T3 pipe / elbow / T | 210 / 286 / 295 | −2% per segment |
| Frost / lava pipes (DLC) | 22 / 25 / 28 | −2.5% per segment |
| Intake booster hook T1 / T2 / T3 | forged (60 Iron / 60 Cloutium design) | +20 / +30 / +40%, max 4 per intake |
| Pressure tank T1 / T2–T3 / DLC | 142 / 853 / 142 | Burns a shard or shard bar; restores pressure to the intake value |
| Water filter hook | 174 | +2 quality (max 10); 5 filters = clean water; filter wears out |
| Pressure gauge hook | 74 | Reads line pressure |
| Valve / Logic Valve hook | 85 / 85 | Stops water or logic flow |
| Cork | 15 | Caps a pipe end |

Sources: [Bridgepour items API](https://api.bridgepour.com/api/items/all/); [Steam: Pressure tank advice](https://steamcommunity.com/app/1106840/discussions/0/3426689579751992110). The booster recipe weight is 60 in Bridgepour and 50 in the Map & Store guide. The 2.2 recipe rebalance may explain the gap.

**The "%" values behave like flat pressure points**, and the numbers line up. A guide lists maximum water pressure as **T1 180, T2 370, T3 510** ([Call Before You Dig](https://steamcommunity.com/sharedfiles/filedetails/?id=2809258751)). That is exactly intake plus four boosters: 100 + 4×20, 250 + 4×30, 350 + 4×40. Players also measured 370 "PSI" on T2 gear and a loss of 2.5 points per Cloutium pipe (about 100 per 40 pipes). This reading is an inference. The developer never documented it, and one forum poster disagrees. Drills and harvesters cap the pressure they accept at their tier's maximum ([2.0.6 notes](https://store.steampowered.com/news/app/1106840/view/4474904295773706248)).

Pressure buys **speed or yield, never ore weight**. A T2 drill made 17 chunks/min at 370 PSI and 13/min at 90 PSI, and "Pressure has no effect on ore weight. Only drilling depth matters" ([Pressure tank advice](https://steamcommunity.com/app/1106840/discussions/0/3426689579751992110)). A T1 drill cycles about every 5 s, and still runs at least 89% speed at 0 pressure. Harvester yield, conveyor belt speed and sprinkler radius all scale with pressure. **Water quality** is a second scalar carried by the pipe. Unfiltered water damages drills and harvesters until they break and spark, and they are repaired with a Spanner (53, one use) or Tool Bag (220, five uses) ([Bridgepour items API](https://api.bridgepour.com/api/items/all/)). The datamine confirms the pipe class holds `Pressure`, `MaximumPressure`, `PressureDecrement` and `Quality`, and propagates pressure recursively through the graph with a `StackOverflowPrevention` guard ([RFC SDK](https://github.com/RFC-MiningCompany/HydroneerTemplate)).

On Volcalidus, **lava drives the machines and water must be made from ice**. The Ice Melter turns 1 wt of ice into water that gives 2 s of pressure at 250. The Heavy Lava Harvester outputs water at 350 when it processes ice, which creates a self-feeding loop ([DLC announcement](https://store.steampowered.com/news/app/1106840/view/5510783579247049777); [DLC Mega Guide](https://steamcommunity.com/sharedfiles/filedetails/?id=3216588622)).

### Machine catalogue

Tiers are a **depth gate plus a material cost, not a speed ladder**. Speed comes from investing in the pipe network. The first T1 drill and harvester are bought once from a travelling merchant. Every further copy is forged at the Masterwork Forge from a blueprint bought once, plus metal by weight for each unit.

| Machine | Price / recipe | In → out | Notes |
|---|---|---|---|
| Pan + Brush + Bucket | 12 + 2 + 4 | dirt + water → nuggets, uncut gems | 4 shovel loads fill a bucket; 1 scrub; the pan is also the main carry container |
| Forged Iron Drill (T1) | 432 merchant; forge blueprint 184 + 300 iron | dirt in place → dirt chunks, about every 5 s | lever on/off; needs filtered water |
| Cloutium Drill (T2) | blueprint 1,320 + **1,000 iron + 150 Cloutium (Fandom) or + 300 Cloutium (Bridgepour)** | same | sources conflict |
| Corestone Drill (T3) | blueprint 2,460 + 800 Corestone + 500 Cloutium | same | |
| Forged Iron Harvester (T1) | 320 merchant; blueprint 122 + 100 iron | dirt chunks → ore and gems | yield scales with pressure; clog fixes in four patches |
| Cloutium Harvester (T2) | blueprint 980 + **500 iron + 50 Cloutium (Fandom) or 300 iron + 100 Cloutium (Bridgepour)** | same | sources conflict |
| Corestone Harvester (T3) | blueprint 1,130 + 600 Corestone + 200 Cloutium | same | |
| Hand Sorter | 165 | poured mix → matching type out a lower chute, rest out the front | needs water; filters by example item on a tray |
| Crucible + Small Furnace + Casting Mold | 18 + 86 + 42 | ore → bar | one ore type at a time |
| Smelter | 1,320 | belt-fed ore → bar on click | rejects other ore types since 2.1 |
| Logic Smelter | 17,300 | belt-fed; a logic pulse casts | ~4 s cast during which it rejects input; bar weight = all contents |
| Grinding Wheel / Gem Polisher Hook | 84 / 462 | uncut → cut | hand vs belt hook |
| Logic Gem Compressor | 930 | cut gems of one type → one bigger gem | lid can trap gems |
| Saw / Gem Chisel / Logic Saw Hook | 143 / 430 / 320 | halve bars / split gems / cut to a logic-set size | |
| Anvil + Blacksmithing Hammer | 86 + 105 | hot bars ± gems → dagger, axe, sword, ring, necklace | |
| Masterwork Forge | world structure | design + bar weight → machines, boosters | crucible on a track, hammer animation; excess returned |
| Abandoned Miners (DLC) | rebuilt with materials | passive ore, 1–15 wt per 10 s, capped at 100–500 wt | see the world section |

Sources: [Fandom Drill](https://hydroneer.fandom.com/wiki/Drill); [Fandom Harvester](https://hydroneer.fandom.com/wiki/Harvester); [Bridgepour items API](https://api.bridgepour.com/api/items/all/); [Steam: auto-smelter guide](https://steamcommunity.com/sharedfiles/filedetails/?id=2811672582). The starter automation kit (drill, harvester, intake, five straight pipes, a T pipe and an elbow) costs **exactly 951 coins**. That matches Bridgepour's own guide.

### Logistics: belts are hooks on pipes

Conveyors are **hooks that clamp onto water pipes**. Water drives the belt and pressure sets its speed. The pieces are Straight (220), Left/Right corner (240), Vertical (323), and Splitter Left/Right (532), which diverts items matching an example item on its tray. Belt hooks include Merger (480), Centraliser (462), Polisher (462), Logic Saw (320) and Logic Counter (560). There are also Funnels (110), tin-sheet chutes and ramps (2–6), hand carts (Wooden 350, Fast/Agile 740) and the Pallet (450) ([Map & Store Guide](https://steamcommunity.com/sharedfiles/filedetails/?id=2807322513)). Items on belts are **real rigid bodies**. That causes rolling, edge-sticking, corner and funnel jams, and clogs that depend on frame rate: one 2025 report saw clogs vanish at 150 FPS and appear at 18–24 FPS ([Steam: resources sticking, 2025](https://steamcommunity.com/app/1106840/discussions/0/595139465034345395)). Splitters match by **form** (nugget vs bar) and move items more slowly than plain belts. The community advice is a tank every 8–12 pipes, separate pipe networks for drills and for belts, sort before smelting, avoid funnels, and shut miners down before saving.

### Logic: an event-driven dataflow toolkit

Logic arrived in 1.6 (January 2021) and was rebuilt in 2.0 as **cables plus hooks**. Signals are **discrete numeric events**, not sustained levels. They travel both ways along cables unless a diode is fitted, and colours are 9-digit RGB values such as 255255000 ([Steam guide, outdated 1.6](https://steamcommunity.com/sharedfiles/filedetails/?id=2370798448); [auto-smelter guide](https://steamcommunity.com/sharedfiles/filedetails/?id=2811672582)).

| Part | Price | Behaviour |
|---|---|---|
| Cables (straight / elbow / T) | 84 / 84 / 86 | carry values in both directions |
| Button / Lever / Keypad | 84 / 84 / 98 | emit 1; emit 1 or 0; emit a custom number |
| Repeater | 84 | emits 1 every second |
| Delay 1 s / 10 s | 84 / 84 | delays a signal |
| Diode / Flip / Flip-Flop / Validator | 74 each | one-way; 0→1 and ≥1→0; alternates; passes only ≥1 |
| Add / Subtract / Multiply / Divide | 102 each | fire when either input arrives |
| Equals / Greater Than (A ≥ B) | 102 each | output 1 or 0 |
| Reader Display / Lamp / Light Hook | 74 / 342 / 285 | show a value; light in RGB |
| Weight Reader / Counter / Durability Reader / Content Reader | 620 / 560 / 360 / 620 | cumulative weight; item count; durability every second; smelter or tank contents |
| Logic Magnet / Destroyer / Spanner Hurling Unit | 1,052 / 863 / 1,200 | pull within 2 blocks; delete items; throw a repair spanner (stores 20) |
| Logic TNT / Logic Mini Nuke | 360 / 26,000 (Bridgepour) or 2,600 (Map guide) | terrain destruction on signal; sources conflict on the nuke price |

Sources: [Bridgepour items API](https://api.bridgepour.com/api/items/all/); [Map & Store Guide](https://steamcommunity.com/sharedfiles/filedetails/?id=2807322513). Players build full chains: weight threshold → valve the feed belt → cast at the smelter; a timed gem-compressor cycle that has run 66 T2 drills; durability → spanner-hurl auto-repair; keypad → exact-weight saw cuts with about 90 T3 drills ([gem compressor thread](https://steamcommunity.com/app/1106840/discussions/0/3458220484829395536)). **Selling cannot be automated.** Goods must be carried to a shop counter.

Everything snaps to an invisible grid. "Hooks" are attachments that clamp onto a host pipe, belt or cable. Picking up a pipe brings its hooks with it. Machines connect when their inlet aligns with a pipe end. For our game this maps directly onto **tiles with attachment slots**: a pipe tile has hook slots for filter, valve, gauge and belt, and a belt tile has slots for polisher, saw and counter.

## Coins are physical and the jeweller sets the floor (reference)

### Currency and selling

The currency is physical **Hydrocoins**. They are 3D objects that stack, split with a saw, and ride in buckets and trucks. There is no wallet, bank, loan, debt, tax or rent ([2.2 notes](https://store.steampowered.com/news/app/1106840/view/6539831519489700435); [Steam: wallet question](https://steamcommunity.com/app/1106840/discussions/0/2953755177909014869)). To sell, you set a pan or bucket on a shop counter and press its button, and coins drop into your container. To buy, you put coins in a store tray and take the item off a buy platform. The **Jeweller** buys at a fixed per-weight price that is the same in every town. **Grocers** buy crops, soup, 13 fish species and Boots. The **Scrapyard** pays 25%. Six **stock markets** each buy one category at a price that changes daily and drops after each sale, up to about 110% of the jeweller's base ([Call Before You Dig](https://steamcommunity.com/sharedfiles/filedetails/?id=2809258751); [Fandom Iron Bar](https://hydroneer.fandom.com/wiki/Iron_Bar)).

| Town | Stock market buys |
|---|---|
| Bastion Keep | iron bars |
| Burnscroft | fish |
| Ironil | weapons |
| The Crossroads (Map guide) **or** Icehelm / Mildew's Aquifer (Bridgepour API) | gold bars — sources conflict |
| Bridgepour Harbour | jewellery |
| Icehelm | cut gems |

Sources: [Map & Store Guide](https://steamcommunity.com/sharedfiles/filedetails/?id=2807322513); [Bridgepour towns API](https://api.bridgepour.com/api/towns/all/). A wishing well turns coins into a Boot of equal value. Three quest-only token currencies came later: **Farming Guild Tokens** (2.1), **Prospecting Guild Tokens** (2.2) and **Scout Guild Tokens** (DLC). They pay for top-tier gear, so mining money alone cannot buy full progression ([2.1 notes](https://store.steampowered.com/news/app/1106840/view/4980448574112987724)).

### Cost curve and plots

| Stage | Example purchases | Price (coins unless noted) |
|---|---|---|
| Starter | Pan 12, Bucket 4, Brush 2, Dull Shovel 22, Dull Pickaxe 122, Crucible 18, Mold 42, Furnace 86, Anvil 86, Hammer 105, Hand Sorter 165, Fishing Pole 52, TNT 48, Mining Helmet 361 | 2–361 |
| First automation | Iron Drill 432 + Harvester 320 + pipes | ~951 kit |
| Mid | Belts 220–532, Smelter 1,320, T2 pipes 210–853, Common Shovel/Pickaxe 694/742 | 200–1,400 |
| Vehicles | Quad 680, Truck Mk II 1,420, Roller 2,460 | 680–2,460 |
| Plots | see below | 970–7,200 |
| Late | Logic Smelter 17,300; Throne 14,500 | — |
| Token gear | Advanced Shovel 2,350 t, Hydro Mole 3,500 t, Hydro Prospector 4,300 t | tokens |
| Endgame sink | Volcalidus Trophy | 99,999 Scout tokens |

Sources: [Map & Store Guide](https://steamcommunity.com/sharedfiles/filedetails/?id=2807322513); [dev vlog Mar 2024](https://store.steampowered.com/news/app/1106840/view/5686430301729334870).

| Dig site (Bastion) | Price | Depth (Bridgepour) | Personality |
|---|---|---|---|
| Ember Cradle | free | 5 | flat riverside starter |
| Mildew's Aquifer | 970 | 22 | underground lake; staged depth left→right |
| Dreck Quarry | 1,200 | 22 | tricky entrance, pond, big and deep |
| South Hope | 6,600 | 22 | vast, ocean edge, near the main town |
| Snowrune Falls | 7,000 | 22 | icy mountain peak (2.0) |
| Icehelm | 7,200 | 22 | **horizontal** dig site in a mountain (2.0) |

All six cost **22,970 in total**. DLC sites: Dawn Rest is free, and Waterside, Lumberton Bluff, Scoria Chamber, Cinder Footing and Shattered Breach cost **5,000 each** ([Fandom Digsites](https://hydroneer.fandom.com/wiki/Digsites); [Bridgepour digsites API](https://api.bridgepour.com/api/digsites/all/)). Four sources agree on the Bastion prices.

### Early loop and exploits

New worlds start with **no coins**, only a pan, bucket, brush, shovel, lantern, map and the free plot. The first nuggets are worth about 10 coins each. Fishing out-earns mining at first: a fish trap (about 41) pays for itself after 3–4 catches. Fish burn to a value of 1 if cooked for about 15 s ([Call Before You Dig](https://steamcommunity.com/sharedfiles/filedetails/?id=2809258751)). One test ran four T1 drills for two hours and made **almost 140,000 coins, about 35,000 per drill**, roughly 290 coins per minute per drill. That is a jump of two orders of magnitude over hand panning, and it makes all plots affordable within hours. The developers kept patching exploits that came from physics objects: resource duplication (2.2.2), one bar balanced across two anvil slots crafting twice (2.2.4), quest pay without the scroll (2.2.5), coin duplication while buying vehicles (3.0.7), and a cooking-boots exploit (3.0.8) ([2.2 notes](https://store.steampowered.com/news/app/1106840/view/6539831519489700435); [3.0.7 notes](https://store.steampowered.com/news/app/1106840/view/5762994032406039149)). The economy has no recurring costs, so coins lose meaning late in the game. That is why the tokens and the 99,999 trophy exist.

## One hand, no inventory: controls, building and interaction (reference)

### Keybindings

| Action | Keyboard / mouse | Gamepad (PC, v2.x) |
|---|---|---|
| Move / look | WASD / mouse | left stick / right stick |
| Sprint (added 1.4) / crouch / jump | Shift / C / Space (Space is also handbrake) | — / B / A |
| Pick up / drop / interact; **hold** = precision "freeplace" | E | X (hold = drop farther) |
| Use tool; enter place mode; confirm placement | LMB (twice for build items) | RT |
| Cancel build | drop | LT |
| Rotate on three axes (Ctrl reverses, 2.0.6) | R / T / Y | D-pad |
| Placement distance | scroll wheel | bumpers (3.0) |
| Enter or exit vehicle; wear a hat | Q | Y |
| Vehicle mode (crane etc., 3.0.5) | F | — |
| Open wiki page for the item under the cursor | B | Select |
| Unlock (Construction Hammer); throw (Gravity Tool) | RMB | — |

Sources: [Bridgepour First Timer](https://bridgepour.com/guide-book/guide/first-timer); [Call Before You Dig](https://steamcommunity.com/sharedfiles/filedetails/?id=2809258751); [2.0.6 notes](https://store.steampowered.com/news/app/1106840/view/4474904295773706248). Sources disagree on the R/T/Y axis order (Z/X/Y vs X/Y/Z). Every key can be rebound, but LMB and RMB cannot be, so that interaction always works.

### Interaction model

The player holds **exactly one physical object**, shown at the lower right of the view. Pressing E drops it straight down onto a "drop circle" below it. The circle is offset from the centre crosshair, which is for interacting. Holding E enters precision placement: R/T/Y rotate, the scroll wheel sets distance, and a drop target shows below the item ([dev reply, Mar 2025](https://steamcommunity.com/app/1106840/discussions/0/591765076067781455); [Mega Patch](https://store.steampowered.com/news/app/1106840/view/5756237364312335366)). Dropping an item while looking at a rack stores it there. Resources dropped into a pan, bucket or crucible "lock" into it. Items in carts and truck beds **lose collision**, so "you can move an entire base... in one cart" ([Bridgepour Wooden Cart](https://bridgepour.com/database/wooden-cart)). Carrying a pallet stops you sprinting. Weight sets value and which machines you need. It does not limit how much you can carry. There is no general throw key.

The player model is first person with walk, sprint, crouch and jump. There is **no stamina, health, hunger, fall damage, enemies or death**: a fall from the Icehelm railing is described only as a long walk back. Recovery is an Esc-menu "Unstuck" teleport with separate points for players and vehicles ([Fandom Drill](https://hydroneer.fandom.com/wiki/Drill); [2.0 notes](https://store.steampowered.com/news/app/1106840/view/4348799082201741462)). The "no death" conclusion is an inference, with medium-high confidence: no primary source says it outright, and nothing in six years of patch notes mentions health. Exact walk speed, jump height and FOV were never published.

### Building

Build items enter a modal place mode. A subtle green grid appears, with a ghost that is **blue when valid and red when blocked**. Items rotate in 90° steps. Since 3.0, a piece "offset[s]... to the corresponding side" of the placed item you look at ([Message From Max](https://store.steampowered.com/news/app/1106840/view/6300039510120170533)). Placed items stay pick-up-able (shown with an orange outline) until you **lock them with the Construction Hammer** (LMB locks, RMB unlocks). There is no deconstruct-for-refund: you unlock the item and carry it away, or scrap it for 25%. Five house sets — Wood, Stone, Cottage, Greenhouse and Ice — share the same measurements so they mix freely. The rake raises or lowers terrain one grid square at a time for levelling ([2.0 notes](https://store.steampowered.com/news/app/1106840/view/4348799082201741462)). In normal mode you can build only on claims you own.

### Tools

Tools are held props used with LMB on a target, and the target decides the result. One verb takes one click; there are no minigames. The shovel scoops one load, and four loads fill a bucket. The bucket pours at the drop circle. The pan fills when dropped in a river and is scrubbed with the brush. The pickaxe digs fast or splits chunks, and holding LMB repeats the swing. **Hand tools have no durability.** Only drills, harvesters and filters wear, and the Magnifying Glass (440) shows their durability. Lighting costs your only hand: the Lantern is a held item, while the Mining Helmet (361) is worn with Q and lights itself.

### HUD

The HUD is minimal and puts information into the world. It shows a centre reticle, the offset drop circle (colour configurable), an outline on the item you look at, hover tooltips with "badges" such as "(Tool, T1)", B-key wiki lookups, keybind tips in vehicles and a save icon. Weight and value appear on physical **Scales** and shop price boards. The map is a physical item you hold ([2.0 notes](https://store.steampowered.com/news/app/1106840/view/4348799082201741462); [3.0.6 notes](https://store.steampowered.com/news/app/1106840/view/6474562312195671416)).

## Vehicles: hydro trucks, attached cargo, menu recovery (reference)

### Roster

| Vehicle | Price | Acc | Top | Hand | Brake | Storage | Weight | Role |
|---|---|---|---|---|---|---|---|---|
| Hydro Truck (starter) | free; 550 to re-buy | 5 | 6 | 5 | 5 | 10 | 7 | haul |
| Hydro Truck Mk II (3 colours, cosmetic) | 1,420 | 8 | 8 | 6 | 6 | 10 | 6 | haul, better handling |
| Hydro Quad | 680 | 10 | 10 | 7 | 6 | 2 | 2 | fast errands |
| Hydro Roller | 2,460 | 2 | 3 | 4 | 6 | 0 | 10 | flatten ground |
| Hydro Cropper | 2,680 Farm tokens | 3 | 4 | 3 | 6 | 7 | 8 | harvest crops |
| Hydro Mole | 3,500 Prospect tokens | 3 | 3 | 8 | 4 | 0 | 8 | tunnel at 3 locked angles |
| Hydro Prospector | 4,300 Prospect tokens | 4 | 5 | 3 | 4 | 0 | 8 | find veins |
| Lava Truck (DLC) | free via quest; 550 | 8 | 8 | 6 | 6 | 10 | 6 | haul |
| Lava Bike (DLC) | 640 Scout tokens | 10 | 10 | 7 | 6 | 2 | 2 | errands |
| Lava Roller (DLC) | 2,460 | 2 | 3 | 4 | 6 | 0 | 10 | flatten |
| Lava Hauler (DLC) | 4,200 Scout tokens | 8 | 10 | 4 | 6 | 10 | 10 | crane lifts machines and vehicles |
| Lava Thaw (DLC) | 6,800 Scout tokens | 6 | 6 | 8 | 7 | 0 | 8 | flame digger; boosters unlock T2/T3 |

Sources: [Bridgepour vehicles API](https://api.bridgepour.com/api/vehicles/) (prices are stored ×100 and shown ÷100; the 1–10 stats are community ratings of unknown origin); cross-checked against [Map & Store Guide](https://steamcommunity.com/sharedfiles/filedetails/?id=2807322513). Raw API values such as "55,000" are the ×100 storage format, **not** in-game prices. DLC prices have only the one source. Vehicles cannot be sold or scrapped, and they never travel between islands. Pre-2.0 builds had an Excavator ("Hydro Miner", 1,050) that stored dirt as it dug. It was removed in 2.0 and replaced by the Mole, which "doesn't store dirt" ([2.2 notes](https://store.steampowered.com/news/app/1106840/view/6539831519489700435)).

### Handling and cargo

Vehicles were reworked four times: 1.5, 2.0, 2.1.2 and 3.0. Before 2.0, trucks would "ping off into the atmosphere" (the "trucknado"). The usual cause was cargo clipping into the truck's own wheels ([Steam: Truck flies away](https://steamcommunity.com/app/1106840/discussions/0/2254559285375830696/)). From 2.0 on, items dropped in the bed enter a **storage zone that locks and attaches them with collision disabled**. Coins in storage "did not have collision", and since 3.0 stackables merge there ([Message From Max](https://store.steampowered.com/news/app/1106840/view/6300039510120170533); [3.0.7 notes](https://store.steampowered.com/news/app/1106840/view/5762994032406039149)). Some failures remained. Trucks bounce or float with 60+ pipes aboard. Twelve pallets merged in one bed cut the frame rate to 5–8 FPS and set the truck bucking, while ten were fine ([Steam: flying truck](https://steamcommunity.com/app/1106840/discussions/0/3283699172770909955/); [Steam: Idea: Trailers](https://steamcommunity.com/app/1106840/discussions/0/601891224286150167/)). Vehicles cannot ride in beds and must hang from the Hauler's hook. The developer tuned for **strong 4WD hill traction, low rollover ("Less likely to roll over and easier to drive!"), solid trees and NPCs who get knocked over** ([dev vlog Mar 2024](https://store.steampowered.com/news/app/1106840/view/5686430301729334870)). The datamine shows UE4's PhysXVehicles module and suspension/wheel data structs ([RFC SDK](https://github.com/RFC-MiningCompany/HydroneerTemplate)). No speeds, masses or torques were ever published.

**Fuel** is free but physical. Base-game vehicles take water and DLC vehicles take lava, poured into a roof tank: **4 bucket loads per refill since 2.0** (5 before). There is a blinking low-fuel light and an empty-tank sound. Players build drive-through drip stations under pipes ([2.0 notes](https://store.steampowered.com/news/app/1106840/view/4348799082201741462)). Vehicles take no damage and need no repairs. The controls are Q to enter or exit, WASD to drive and F for vehicle mode. The Hauler crane uses W/S to move the pulley, A/D to rotate, E to hook and C/Space to lower and raise. The Mole's angle uses R (down), T (up) and Y (level). On gamepad, the triggers drive and the stick steers (3.0). Since 3.0 you exit on the side you are looking at. Recovery is **teleport only**: "Unstuck" or "Recall nearest vehicle", which handles multiple vehicles badly. Diggers are the weak point. The Mole is front-heavy and its cutting volume tilts with the chassis, so it "plummets almost vertically down" and straight tunnels are "barely possible" ([Steam: Hydro Mole controls](https://steamcommunity.com/app/1106840/discussions/0/3821909708339467406/)). Bulk dirt never travels by vehicle. Conveyors move material within a claim, trucks carry finished goods, machines and coins between towns, and fixed Icehelm transporter pipes teleport items.

## Under the hood: UE4.26 Blueprints, PhysX, Voxel Plugin Pro (reference)

### Engine and physics tricks

A binary string scan of the May 2026 build finds **UE 4.26 (CL-15973114) and PhysX**. The game never moved to UE5 or Chaos. It is almost all Blueprint, with a handful of C++ classes, and uses the plugins **VoxelPro, EasyMultiSave, SteamCore, AutoSettings, DLSS and PivotTool** ([Mp_hydroneer research](https://github.com/ericksouza95/Mp_hydroneer/blob/main/docs/01-pesquisa.md); [RFC SDK](https://github.com/RFC-MiningCompany/HydroneerTemplate)). Physics substeps at 120 Hz (`MaxSubstepDeltaTime=0.008333`, up to 6 substeps) under standard gravity. Custom collision channels — `Held`, `StoredNoClip`, `Placing`, `Conveyored`, `Magnet` and others — show that an item's **collision profile is swapped by state** (moderate confidence: the config comes from a modkit). The base item class exposes `LockPhysics`, `PhysicsLockTimer` and `Scan_for_Items_on_Top`. A 2026 runtime measurement found **zero bodies simulating at rest in a world of 557 items and about 8,000 mesh components**: "The game already turns off physics for everything that is stopped" ([Mp_hydroneer spike](https://github.com/ericksouza95/Mp_hydroneer/blob/main/docs/07-spike.md)). The 2.0 notes say the same in player terms: "Picking up ores from a large pile will no longer wake up all ores around itself." Conveyors move items **kinematically** (`ConveyActors(..., DeltaLocation, DeltaTime)`), with speed derived from belt pressure. Carrying is not a physics drag. The item is lerped to a socket and attached, and a drop is checked with a collision scan first.

### Terrain, dirt and water

Terrain uses **Voxel Plugin Pro**: smooth marching-cubes-style volumes, one voxel-world actor per dig site, and edits saved as a compressed voxel blob. Edits use sphere brushes (`AddSphere`, `RemoveSphere`, `RemoveSphereWithDurability`), plus `LevelTerrain` for the rake. Collision is generated only near "invokers", which the player and **every drill** carry ([RFC SDK](https://github.com/RFC-MiningCompany/HydroneerTemplate); [Voxel Plugin docs](https://docs.voxelplugin.com/1.2/core-systems/voxelworld/collisions-and-navmesh)). That is why moving far away once "fudge[d] collisions while machinery is running" (fixed in 2.0.6). Dirt quality is computed from position (`GetDirtDepth`). Dig sites are few on purpose: "there's some pretty harsh technical limitations... with the technical side of terrain digging. From our research... players tend to only use a maximum of 3 dig sites, so we feel that 6 is enough" ([dev vlog Mar 2024](https://store.steampowered.com/news/app/1106840/view/5686430301729334870)).

Dug dirt exists in three forms: voxel volume in the terrain, an **abstract load counter** with an average quality on a shovel, bucket or pan (`DirtLoads`, `DirtQualityAverage`), and physics **dirt-chunk actors** that carry quality and weight. Containers absorb chunks they overlap and turn them into loads. Panning is a scripted roll on loads × quality that spawns ore with an impulse. Dirt does not flow or avalanche. **Water is entirely scripted.** Rivers are a plane plus a box trigger, pipes propagate a scalar through a graph, and visible water at outlets is spawned projectile meshes ([RFC SDK](https://github.com/RFC-MiningCompany/HydroneerTemplate)). Explosives remove voxels. TNT clears about 1 block and a mini nuke about a 3-block radius. Buried relics survive explosions.

### Lighting

The game uses UE4's deferred renderer. One directional "Sun" is driven by a Blueprint day/night cycle with curves for light and fog colour, plus a SkyLight, height fog, sky sphere and clouds. Lanterns and torches are point lights, and lanterns go out in water. Auto-exposure is off. **Caves and nights were too dark.** The developers raised night brightness in 2.1, then reworked shading in 3.0 because "Shadows in Hydroneer are quite dark and make it difficult to see when inside caves or at night", while keeping daytime unchanged ([Message From Max](https://store.steampowered.com/news/app/1106840/view/6300039510120170533)). Performance passes removed a dynamic light from a drill. The game added DLSS in 2.0 and capped FPS at 60 by default in 3.0.

### Saves and mods

Saves use **EasyMultiSave**: per-actor serialisation (name, transform, SaveGame properties) plus the voxel blobs, written to `Level.sav`, `Player.sav` and `SaveData.sav` under `%LOCALAPPDATA%\Mining\` with rolling backups. A **fresh world totals about 21 MB** ([Mp_hydroneer save sync](https://github.com/ericksouza95/Mp_hydroneer/blob/main/docs/10-savesync.md)). The 2.0 save rewrite broke every 1.x save. Options to skip saving loose dirt chunks and raw resources, and to clear them, exist for performance. Backup-on-corruption arrived in 2.2.3. In 3.0.9 (March 2025) the game was changed to crash instead of writing a corrupt file, after anti-virus software was found blocking saves ([3.0.9 notes](https://store.steampowered.com/news/app/1106840/view/1793384379499131)). Mods load as .pak files from Steam Workshop (since 1.4). Mods or creative mode disable achievements.

## World, NPCs, quests and modes: a hub island with bounded claims (reference)

There are two hand-made islands and no procedural generation. **Bastion** is a temperate river valley with a snowy mountain, six claims and settlements specialised by trade. Burnscroft is the fishing start town. Bastion Keep has the King, the jeweller, T1 tools and the travelling merchant. Bridgepour is the largest town, with belts, logic, vehicles, scrap and a harbour. Ironil has a weapons market. Grangefield is the farming town. Icehelm is a dwarven ruin with the Masterwork Forge in a magma chamber. **Volcalidus** (DLC, $10, "over 6 times the size") is volcanic and icy. You reach it by ship, nothing carries over, and stores you rebuild act as the tech tree ([DLC launch post](https://steamstore-a.akamaihd.net/news/externalpost/steam_community_announcements/5756237364312335693); [Bridgepour towns API](https://api.bridgepour.com/api/towns/all/)). The DLC adds three **Abandoned Miners** that work as idle generators:

| Miner | Repair cost | Output | Rate / cap |
|---|---|---|---|
| East Shelf | 800 Hardstone Blocks + 1,200 Iron Bars | iron or gold | 1 wt / 10 s, cap 300 (50 min) |
| West Shelf | 2,300 HB + 1,400 Iron + 30 Cloutium | hardstone or shard | 15 wt / 10 s, cap 500 |
| The Barrens | 9,800 HB + 900 Corestone + 400 Cloutium | corestone or cloutium | 1 wt / 10 s, cap 100 |

Source: [Bridgepour guides](https://api.bridgepour.com/api/guides/); costs cross-checked by [gameplay.tips](https://gameplay.tips/guides/hydroneer-volcalidus-dlc-guide.html). In the base game, abandoned mines grow a bigger nugget the longer you wait. Sources conflict on whether each mine's ore pair is fixed or random.

**NPCs arrived only in 2.1** (December 2022). On Bastion, 25 named villagers hand out quest scrolls: soup for Farming tokens, and anvil-crafted weapons or jewellery for Prospecting tokens. NPCs show their name and token type overhead, and players report rewards growing with progress, from about 50 tokens for random farming tasks to about 2,000 for prospector tasks ([Bridgepour npc API](https://api.bridgepour.com/api/npc/); [Steam: questline thread](https://steamcommunity.com/app/1106840/discussions/0/3821909708339524140/)). The main quest "For The King!" (2.2) was added because "a common request from players is a reason to progress". Guards on the Keep's staircases each demand an escalating delivery. The reward, a dirt-placing sceptre, was called "beyond disappointing" ([2.2 notes](https://store.steampowered.com/news/app/1106840/view/6539831519489700435); [Steam: scepter thread](https://steamcommunity.com/app/1106840/discussions/0/4349988819855604086/)). The DLC adds a museum (36 Hydrosaur bones across 64 spawn points, with token milestones at 1/12/24/36 bones paying 100/1,000/3,000/5,000), Forge Marks that roll random buffs or debuffs of up to 3 stars or 3 skulls, a race-track time trial (under 1:11), and the 99,999-token trophy. Secrets include six buried relics that open a hidden cave, a hidden snowman, the truck "Booooooiiiingg!" easter egg and a dragon skeleton. There are **78 Steam achievements** ([Steam achievements](https://steamcommunity.com/stats/1106840/achievements)).

There are two modes, **Normal and Creative** (1.7). Creative tools are physical items: the Creative Wand duplicates or deletes, plus the Gravity Tool, Flight Cap, Hourglass and Hard Hat. There are no difficulty levels. Time follows a day/night cycle, beds skip to morning, and the Esc menu pauses time. The hazards are **cosy**. Darkness calls for lights. Lava is terrain and fuel. Physics mishaps send you to Unstuck. Shops delete stolen goods. Machines wear out.

## Online multiplayer died on physics sync, and how ours should work

### Why Hydroneer dropped it (reference)

In February 2021 the developer announced "Online multiplayer to support 1-4 players" for summer 2021, with a "Complete rework of the game, and new physics engine". That post was later edited: "we are no longer developing true multiplayer, instead we're taking a splitscreen approach due to issues with physics engines" ([Multiplayer is Coming, edited](https://store.steampowered.com/news/app/1106840/view/4051520458173386771)). The 2.0 launch post gives the full story: "we had to essentially start again in December 2021, throwing out a lot of work... Due to technical limitations of physics engines, and our dedication to staying indie and not taking on outside investors, I decided the best move forward was to make the multiplayer aspects of the update as Steam Remote Play Splitscreen" ([2.0 notes](https://store.steampowered.com/news/app/1106840/view/4348799082201741462)). The official FAQ names the root cause. "UE4's physics engine is non-deterministic, meaning every physics interaction could have a different outcome", and the hard part is "having potentially thousands of moving objects all simulating at the same speed". It contrasts this with Satisfactory, whose belt items are "graphical shaders, not physical objects" ([Steam FAQ](https://steamcommunity.com/app/1106840/discussions/0/3203748171375176286/)). In April 2023 the developer was blunter: "Due to the intensity of Hydroneer's physics, conventional multiplayer is not possible" ([Steam thread](https://steamcommunity.com/app/1106840/discussions/0/6756004301608937453)). The datamine fits this: items, terrain, day/night and shops all have `bReplicates=false`, and only GameState, controllers and characters replicate.

Remote Play runs a single instance on the host for 2–4 players. Remote players must use gamepads, and only the host needs to own the game. So there is no desync at all. The bugs instead came from per-viewport HUD, held-item display, two players sleeping at once, and controller assignment. Players still complained: "Remote Play sucks please add real multiplayer" ([Steam reviews](https://steamcommunity.com/app/1106840/reviews/?browsefilter=toprated&filterLanguage=english)). A 2026 community mod, **hydroneer-coopnet**, shows the host-authoritative path is workable for part of the game. It drives the hidden split-screen player on the host, **replays the host's exact terrain sphere edits on the friend's side**, and syncs carrying, throwing, digging, dumping and container contents. It does not sync shops, machines or vehicles, and it ships the roughly 21 MB save on join ([hydroneer-coopnet](https://github.com/Zane11332/hydroneer-coopnet)).

### What this means for our host-authoritative web design (for our game)

Hydroneer failed because physics *was* its simulation. Every ore, coin and belt item was a rigid body whose outcome could not be reproduced or cheaply streamed. Our game should flip that. **Gameplay state lives in deterministic data, and rigid bodies are a local, short-lived presentation layer.** The authority (one host) runs the only real simulation. Belts become lane entities that move at pressure × base speed. Containers, truck beds and carts become item lists with visual props. Pipe pressure, logic and machine production become a fixed-tick graph simulation. The economy stays an abstract balance on the authority, which also removes most of Hydroneer's duplication exploits, since every one of them came from simulated coins or bars. Only items that are actually loose and moving — a dropped nugget, a dirt chunk mid-fall, a truck chassis — are rigid bodies. Hydroneer's measurement of zero simulating bodies at rest suggests the awake set is small at any moment, so the host replicates only **awake bodies near each client** as compact snapshots (id, position, quaternion), and clients interpolate. Sleeping bodies cost no bandwidth until they wake. Terrain syncs as **sequenced edit operations** (brush centre, radius, op, sequence number), exactly as coopnet does, never as voxel data. Late joiners receive the world seed, compressed modified-chunk deltas and the entity table, not a 21 MB dump. Vehicles are owned by the host, with client input sent up. Our cargo-attached-to-bed design means a moving truck replicates one transform, not hundreds.

On hosting, the research supports **one Cloudflare Durable Object per world as the room** that holds WebSocket connections and authoritative or relayed state. The Durable Objects free tier includes 100k requests per day and 5 GB of SQL storage ([Durable Objects limits](https://developers.cloudflare.com/durable-objects/platform/limits); [Cloudflare plans](https://www.cloudflare.com/plans.md)). Two placements are possible: authority in the hosting player's browser with the Durable Object relaying messages, or authority inside the Durable Object. The notes did **not** verify whether Rapier WASM runs well inside a Durable Object, and they did **not** compare transports (WebSocket vs WebRTC data channels vs WebTransport). A later session should benchmark both before committing. Rapier's cross-platform determinism is a bonus for replays and desync checks, but host authority does not depend on it ([PlayCanvas: ammo alternatives](https://developer.playcanvas.com/user-manual/physics/ammo-alternatives/)). One browser multiplayer voxel engine retrospective found that **garbage-collection pressure forced object pooling and a costly rewrite of game-state management**. That argues for planning the networked state model on day one, which is the same lesson Hydroneer's 16-month 2.0 rewrite teaches ([Kev Zettler](https://hn.jakechampion.name/reader/https://kevzettler.com/2023/04/25/multiplayer-voxel-game-engine)).

## Audio, art direction, history and reception (reference)

**Audio** has a calm "high fantasy" soundtrack (composer unknown) and is otherwise sparse: ambient world sounds (overhauled for 2.0), NPC one-liners and physical impacts ([Thumb Culture](https://www.thumbculture.co.uk/hydroneer-ps5-review)). State-change sounds do real work as feedback: broken drills and harvesters (2.2.3), an empty fuel tank (1.7), machines that go quiet when switched off. Most audio patches fought **scale**. Patches lowered the sound of many ores hitting the ground, reduced crucible noise under heavy ore flow, limited gem-compressor sounds, fixed one-shots that played globally instead of spatially, and fixed a soundtrack restart "when hundreds of items are dropped at once causing memory issues" ([2.2.5 notes](https://store.steampowered.com/news/app/1106840/view/5124584686246033158)). There are per-category sliders, including machines and water.

**Art** is chunky, simple, low-detail stylized 3D with a muted, warm palette and plain image textures. It is neither flat vertex colour nor showcase PBR, and reviewers call it functional and cosy ([Thumb Culture](https://www.thumbculture.co.uk/hydroneer-ps5-review)). The art changed through retexture passes, and every change pushed toward **readability**. Minimum ore size went up 25% (1.4). Each dirt tier got its own texture (2.0.6). Nights got brighter (2.1). Shading was reworked (3.0). Outlines got crisper. Gold and Cloutium got distinct molten colours (3.0.6) ([1.4 notes](https://store.steampowered.com/news/app/1106840/view/4249665521683159651); [3.0.6 notes](https://store.steampowered.com/news/app/1106840/view/6474562312195671416)). The game's identity sits in object design — pipes, pans, buckets, chunky machines — more than in rendering technique.

| Date | Version | Highlights |
|---|---|---|
| 2019 | itch.io alpha | solo project begins |
| 8 May 2020 | Steam launch | full release, $15 |
| Jul 2020 | 1.3 Engineering | Cloutium, D.A.V.I.D. dirt duplicator, conveyor rework |
| Sep 2020 | 1.4 Gem Crisis | gem compressor, sprint, Workshop mods, Bridgepour wiki |
| Oct 2020 | 1.5 Hydroween | shovel onto belts, Steam Cloud, B-key wiki |
| Jan 2021 | 1.6 Logic & Power | logic, power lines (later removed), carts, controller |
| Nov 2021 | 1.7 Creative | creative mode, Onyx, fishing expansion |
| 8 May 2022 | 2.0 | full rewrite; Remote Play split-screen; tiers; hooks; new saves; Icehelm |
| Jul 2022 | 2.0.6 | dirt-tier textures, pressure caps, merger, gem rebalance |
| Dec 2022 | 2.1 Farming | NPCs, Farming tokens, Quad, Roller, Cropper |
| Apr 2023 | 2.2 Prospecting | T3, Corestone, veins, Mole, main quest, 50+ achievements |
| 5 Apr 2024 | 3.0 + DLC | Volcalidus ($10), snapping, brighter shadows; declared finished |
| Mar 2025 | 3.0.9 | save-corruption fix |
| 8 May 2026 | Consoles + Mega-Optimization | PS5/Xbox via PlayEveryWare; PC performance |

Sources: [Steam News feed](https://api.steampowered.com/ISteamNews/GetNewsForApp/v2/?appid=1106840&count=300&maxlength=0&format=json); [Mega-Optimization](https://store.steampowered.com/news/app/1106840/view/1832065502815252).

**Reception.** Steam shows **Very Positive, 86% of 19,939 English reviews**. Recent reviews are **Mostly Positive, 72% of 121** (fetched 2026-11-22). The game passed **500k players in June 2022 and 1M in June 2025** ([Steam store](https://store.steampowered.com/app/1106840/Hydroneer/); [1M post](https://steamstore-a.akamaihd.net/news/externalpost/steam_community_announcements/1802893906702139)). Press: The Xbox Hub 4/5 ("for the right player, I can't recommend Hydroneer enough"), Virus.hr 3/5, Thumb Culture a Bronze Award, Off the Shelf Media 3/10 ([The Xbox Hub](https://www.thexboxhub.com/hydroneer-review/); [Off the Shelf Media](https://offtheshelfmedia.com/2026/05/26/hydroneer-review/)). The paid DLC drew enough backlash that the developer apologised ("looks like I've missed the mark with expectations"). He explained that sales were slowing and that he had turned down publishers ([Message From Max](https://store.steampowered.com/news/app/1106840/view/6300039510120170533)). Minimum spec is a quad-core at 2.4 GHz, 8 GB RAM and a 1 GB DX11 GPU. In practice performance is **CPU and physics bound as item count grows**: one RTX 3090 owner saw the GPU at about 40% and 15–30 FPS in a big base.

## Browser stack: Three.js, Rapier in a worker, surface-nets voxels (for our game)

### Versions as of 2026-11-22

| Package | Version (date) | Shipped size | Status |
|---|---|---|---|
| three | 0.187.0 (2026-10-30) | ~195 KB gz WebGL build; ~228 KB gz WebGPU+TSL | recommended |
| @babylonjs/core | 9.37.1 (2026-11-18) | 1 MB+ tree-shaken (unverified) | strong alternative |
| @babylonjs/havok | 1.3.14 (2026-07-29) | ~658 KB gz wasm | only sensible with Babylon |
| playcanvas | 2.24.2 (2026-11-18) | — | physics still ammo.js; Rapier/Jolt seam is alpha |
| @dimforge/rapier3d (non-compat) | 0.21.0 (2026-09-25) | ~1.17 MB gz separate .wasm | recommended physics |
| @dimforge/rapier3d-compat | 0.21.0 | ~1.65 MB gz (base64-inlined wasm) | avoid for production |
| jolt-physics | 1.1.2 (2026-11-21) | ~747 KB gz wasm | pick if vehicles are central |
| cannon-es / ammo.js | 0.20.0 (2022) / 0.0.10 (2016) | — | stale; avoid |
| fflate / idb-keyval | 0.8.3 / 6.3.0 | small | chunk compression / IndexedDB |

Sources: [npm registry](https://registry.npmjs.org/three) and the measurements in the notes; [PlayCanvas: ammo alternatives](https://developer.playcanvas.com/user-manual/physics/ammo-alternatives/).

**Rendering.** Use **Three.js r187 with WebGPURenderer and TSL**. It falls back to WebGL2 automatically, which is still needed for Firefox on Android and older devices. Pin the exact version, because the API still changes (r183 renamed `PostProcessing` to `RenderPipeline`). Sources disagree on whether it is "production-ready", and one community report found it slower than WebGLRenderer on CPU time in scenes with many meshes. Profile both ([web.dev WebGPU support](https://web.dev/blog/webgpu-supported-major-browsers); [caniuse](https://caniuse.com/webgpu); [three.js forum](https://discourse.threejs.org/tag/webgpu-renderer/1686)). For readable materials, TSL provides `triplanarTexture` for voxel terrain, an `outline()` node for hover highlights, selective `bloom()` through MRT masks for molten metal and gems, and `BatchedMesh`/`InstancedMesh` to keep draw calls down ([three.js OutlineNode](https://threejs.org/docs/pages/OutlineNode.html)). Messenger (2025) shows that a polished toon-shaded Three.js game is possible in the browser ([Wikipedia](https://en.wikipedia.org/wiki/Messenger_(video_game))). **Babylon.js 9** is the engine choice if we want built-in Havok, clustered lighting for "hundreds or thousands of dynamic lights", an inspector and a floating origin ([Babylon.js 9.0](https://blogs.windows.com/windowsdeveloper/2026/03/26/announcing-babylon-js-9-0)).

**Physics.** Use **Rapier in a dedicated Web Worker** at a fixed 60 Hz step. Transforms go back to the main thread as a transferable `Float32Array` and are interpolated there. Rapier has a kinematic character controller with autostep, slope limits, snap-to-ground (fixed in 2026 so `grounded` no longer flickers) and pushing of dynamic bodies. It has a raycast vehicle controller ported from Bullet's `btRaycastVehicle`, which is arcade-grade and thinly documented. It has experimental **voxel colliders with `setVoxel`**, a 2026 CCD rewrite and cross-platform determinism ([rapier.rs character controller](https://rapier.rs/docs/user_guides/javascript/character_controller); [Rapier CHANGELOG](https://github.com/dimforge/rapier/blob/master/CHANGELOG.md)). **Jolt** is better if trucks or tracked diggers are central. It offers wheeled and tracked `VehicleConstraint`, `CharacterVirtual` and an official multithreaded build. The cost is manual `destroy()` memory management, and the multithreaded build needs COOP/COEP headers. Prebuilt Jolt packages are not cross-platform deterministic ([Jolt docs](https://jrouwe.github.io/JoltPhysics/)). No apples-to-apples WASM benchmark exists. The week-one prototype must measure four things: 1–2k mostly sleeping ore bodies, trimesh rebuild cost on dig, truck handling on dug terrain, and WebGPU vs WebGL CPU overhead.

**Terrain.** Use chunked density fields (32³ chunks of `Int8Array` density plus a `Uint8Array` material, 0.25–0.5 m voxels) edited with spherical SDF brushes. Remesh only dirty chunks and their neighbours with **naive surface nets** in a worker pool. One forum report says switching from dual marching cubes "dramatically improved the performance" ([three.js forum](https://discourse.threejs.org/t/how-to-make-a-ultra-optimized-voxel-terrain-like-this-in-a-html-file/83315.md)). Use a per-chunk Rapier trimesh collider, throttled to N rebuilds per frame, and fall back to voxel colliders if rebuilds become the bottleneck. Heightfields cannot do caves or overhangs. No maintained library does all of this for three.js, so expect about 500–1,500 lines of custom code. The voxel.js retrospective names remeshing and uploads as the main bottleneck ([Six Months of voxel.js](https://medium.com/p/494be64dd1cc)). Bake per-vertex AO into the mesh at meshing time using the 0fps method, adapted to sample density for smooth terrain ([0fps](https://0fps.net/2013/07/03/ambient-occlusion-for-minecraft-like-worlds/)).

**Dirt, water and lighting.** No browser demo simulates granular dirt at game scale. The proven hybrid works like this: digging yields a scalar amount, at most a few pooled "clump" bodies appear, and clumps that settle get stamped back into terrain or absorbed by a container. Belts and machines carry abstract quantities. Water is a **shader** (depth-based colour, intersection foam, flow-map scrolling) over a **scripted graph**, which matches Hydroneer exactly ([Alexander Ameye](https://alexanderameye.github.io/notes/stylized-water-shader)). Light the scene with one sun using cascaded shadows (`CSMShadowNode`), a hemisphere "shadow floor" that rises at night and underground (Hydroneer's 2.1/3.0 lesson), and lanterns through `ClusteredLighting` on WebGPU, with a pooled set of 8–16 real point lights on WebGL2 and at most 1–2 shadow-casting ([three.js ClusteredLighting](https://threejs.org/docs/pages/ClusteredLighting.html); [TiledLighting](https://threejs.org/docs/pages/TiledLighting.html)).

**Controls.** Call `requestPointerLock({ unadjustedMovement: true })` from a click handler, with a fallback and `pointerlockchange` listeners. Pointer Lock is not Baseline, needs `allow-pointer-lock` in iframes, and is absent on iOS Safari. Poll the Gamepad API each frame. Mobile is a secondary target ([MDN Pointer Lock](https://developer.mozilla.org/en-US/docs/Web/API/Element/requestPointerLock)).

**Saving and hosting.** Save to **IndexedDB**, which allows about 60% of disk in Chrome and Safari and 10 GiB best-effort in Firefox. Store one compressed record per modified chunk, an entity table, and a meta record with a rotating autosave. Request `navigator.storage.persist()`, and offer export/import because **Safari deletes script-written data after 7 days without interaction** ([MDN storage quotas](https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria)). For cloud saves, a Worker writes blobs to **R2** and metadata to **D1**. Avoid KV, whose free tier allows 1,000 writes a day, and note that D1 free-tier daily limits are enforced from 2026-09-01 ([KV limits](https://developers.cloudflare.com/kv/platform/limits); [D1 changelog](https://developers.cloudflare.com/changelog/post/2026-09-01-d1-free-tier-limit-enforcement/)). Serve the game as **Workers static assets**, which are "free and unlimited", with a 25 MiB per-file limit. Ship WASM as a separate `.wasm` file so it can stream-compile. Add COOP/COEP via `_headers` only if SharedArrayBuffer is needed ([Cloudflare static assets billing](https://developers.cloudflare.com/workers/static-assets/billing-and-limitations/)). Engineering budgets for 60 FPS on mid-range laptops: physics worker ≤ ~6 ms, ≤ 300 awake bodies with 1–3k sleeping, ≤ 300 draw calls, about 3–5 MB compressed initial download. Auto-merge loose piles past N items into a pile entity. These are estimates, not measurements.

## Lessons for our game: what players loved, hated, and the tricks to port

What players praise is the **arc from hand labour to automation**: "From simple hand mining, you can move on to automation". They praise the physical, every-ore-is-an-object feel ("I do like the physicality of lifting and carrying and moving things"), problem-solving with pressure and logic ("a game that makes you think"), hydropower that is "much less stressful" than Satisfactory's power balancing, and a developer who stays in touch ([Steam reviews](https://steamcommunity.com/app/1106840/reviews/?browsefilter=toprated&filterLanguage=english); [PC Gamer](https://www.pcgamer.com/i-cant-decide-if-having-no-inventory-system-in-this-crafting-game-is-brilliant-or-brutal/); [Thumb Culture](https://www.thumbculture.co.uk/hydroneer-ps5-review)). The complaints from 2020 to 2026 are equally consistent. Top is the **offset drop point with physics "taking over"** ("literally causing me pain"), which makes loading trucks, racks and tables fiddly. Close behind: the same E key for pickup and drop, which causes accidental pickups. Then the lack of an inventory, a slow, grindy start, physics flinging items, lag in big bases, save wipes, Remote-Play-only multiplayer, a jittery Mole, teleport-only vehicle recovery, no way to scrap vehicles, a late game with "no 'you win!'", and a disappointing final quest reward ([dev reply thread](https://steamcommunity.com/app/1106840/discussions/0/591765076067781455); [The Xbox Hub](https://www.thexboxhub.com/hydroneer-review/)). Many fixes arrived years late. Snapping came in 3.0, readable dark scenes took two passes, quests and goals were added in 2.1–2.2, and corruption-safe saves came in 3.0.9. **Design all of these in from the start.**

| Hydroneer trick (reference) | Why it worked | Browser equivalent (for our game) |
|---|---|---|
| **Scripted water and pressure**: pipes propagate a scalar with a per-segment decrement; intakes, boosters and tanks; quality as a second scalar; no fluid sim | Cheap, legible, deterministic | Pipe graph rebuilt on edit; pressure solved per tick in a worker; hooks as node modifiers; water drawn with a shader and UV scroll ∝ pressure; replicate graph state, never fluid |
| **Sleeping settled items**: bodies lock after a settle timer; picking from a pile doesn't wake neighbours; zero bodies simulating at rest | Thousands of props cost nothing at rest | Rapier sleeping plus forced freeze after ~1–2 s at rest; wake only supports and items on top; pool bodies; auto-merge big piles into a pile entity; replicate only awake bodies |
| **Cargo attached to vehicle beds**: storage zone locks items and disables collision; stackables merge | Ended the "trucknado" | Parent cargo to the chassis as a data list with instanced visual props; the vehicle body's mass changes, its collision does not; one transform to replicate |
| **Limited, bounded dig sites**: six claims, "players tend to only use a maximum of 3" | Bounds voxel memory, remeshing and save size | 5–6 bounded claims of fixed chunk extents; procedural base from a seed; save and sync only edited chunks as compressed deltas |
| **Drills don't modify terrain**: infinite yield at a fixed depth tier | Bounds voxel edits to hand tools, vehicles and explosives | Drills are tick-based producers that read their tier from depth; no remeshing; aggregate distant drill banks as a rate |
| Collision profile swapped by state (held, stored, placing, conveyored) | Removes most jitter and "explosions" | Held items are kinematic children of the camera with a validated drop raycast; stored items are data |
| Kinematic belts | Avoids friction-driven belt bugs | Lane-based belt entities at deterministic speed; spawn real bodies only at belt ends or on player interaction; model jams as explicit capacity rules, not emergent physics |
| Collision only near "invokers" (player and drills) | Voxel collision on demand | Build colliders only for chunks near players, vehicles and active machines |
| Save toggles and "clear loose items" | Kept saves and FPS sane | Schema-driven compact saves covering every machine setting (Hydroneer lost splitter and keypad settings on reload); atomic writes with rolling backups; optional loose-item cleanup |
| Readability passes (minimum ore size, tier textures, per-metal molten colour, brighter shade) | Players could finally read the world | Unique hue plus silhouette per material and stage; triplanar texture tinted by depth band; high hemisphere floor; unlit, high-contrast drop ring instead of a real shadow |
| State-change sounds; per-category buses | Failures audible across a base | Voice limits, distance attenuation, aggregated loops per machine cluster from day one |
| Weight as the only quality stat; value = base × weight × stage bonus | Profit is exactly calculable | Keep the model; vary hue, name and fiction; consider superlinear value for big gems, which players asked for |
| Hybrid gates (coins + mined metal + quest tokens) | Stops coin-grinding past progression | Contracts and milestones from launch; either/or quest requirements; a real final goal |

For interaction, keep the tactile one-hand fantasy but fix its friction. Align or clearly mark the drop point. Split pickup and drop, or make them context-safe. Teach precision placement in the game. Snap to neighbouring faces from day one. Give placed machines a lock state. Consider a small quick-carry slot for tools, plus wearable lights outside the one-hand rule. For vehicles, keep the "one vehicle, one verb" roster, physical fuel and forgiving rollover. Add in-place unflip, summon-to-me and sell-back. Give digging vehicles a cutting volume fixed to the world rather than the tilting chassis, so tunnels come out straight. Size big vehicles to fit doorways. Rails or a hydro tram are an obvious original addition that Hydroneer never had and players asked for in 2020.

## Conclusion

Hydroneer's real innovation is cheap rather than complex. A handful of scalar fields — pressure, quality, weight, depth tier — sit behind physical props, and most of the "physics" a player sees is a scripted rule wearing a rigid-body costume. Its problems came where that costume became the actual simulation: rolling belt items, coins in truck beds, thousands of loose nuggets. Those are the same problems that blocked online play, inflated saves and caused the duplication exploits. A browser game should therefore treat Hydroneer as proof that the *feel* of physicality is what players love. The *fact* of physicality is what they pay for in lag, bugs and lost co-op.

For our game, the consequences point one way. Choosing host-authoritative multiplayer is not risky if items are data first. Rapier sleeping, lane-based belts, attached cargo, edit-op terrain sync and bounded claims together make online co-op cheaper than Hydroneer's split-screen workaround. The open questions are concrete and testable in week one: trimesh vs voxel colliders under digging, the awake-body budget, raycast-vehicle feel on dug ground, WebGPU vs WebGL overhead, and where the authority lives (player browser or Durable Object) over which transport. The researchers did not settle the last two, so a later session should benchmark them before writing netcode.
