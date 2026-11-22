# Hydroneer: World, Map, NPCs, Quests, Game Modes, Hazards, Building and Secrets

Scope and version note: These notes reflect the game as of its final content version, 3.0.x (Journey to Volcalidus DLC plus the base-game "Mega Patch", 5 Apr 2024). After that the studio shipped only fixes: 3.0.9 (Mar 2025) and a "Mega-Optimization" patch (8 May 2026) released alongside the console versions. The developer calls Hydroneer "a finished title".

**The brief's premise needs correcting.**
- Hydroneer was never in Early Access. The creator says so directly: "Hydroneer isn't an early access game... It has never been listed as an Early Access game".
- It launched on Steam on 8 May 2020.
- The major content versions were 1.3 (Jul 2020), 1.4 (Sep 2020), 1.5 (Oct 2020), 1.6 (Jan 2021), 1.7 (Nov 2021), 2.0 (8 May 2022, a full rewrite that reset saves), 2.1 (9 Dec 2022), 2.2 (14 Apr 2023) and 3.0/DLC (5 Apr 2024).
- The area names "Bridgeview", "Ironfall", "Firestone Reef" and "Arcania" do not exist. The real names are Bridgepour, Ironil, Bastion Keep, Burnscroft, Grangefield, Icehelm and Snowrune Falls on the island of **Bastion**, plus the DLC island **Volcalidus**.

Sources: [Steam: A Message From Max](https://steamstore-a.akamaihd.net/news/externalpost/steam_community_announcements/6300039510120170533); [Steam store appdetails](https://store.steampowered.com/api/appdetails?appids=1106840); [Steam: Mega-Optimization](https://steamstore-a.akamaihd.net/news/externalpost/steam_community_announcements/1832065502815252).

Primary data source: **Bridgepour.com** is the community wiki, made by ItchyBeard. The game links to it directly: since 1.5, pressing B "opens the Bridgepour Wiki" on the item you are looking at. The developer replaced the Fandom wiki with it in 1.4. Its JSON API at api.bridgepour.com was used heavily here. See [Steam 1.4 news](https://steamstore-a.akamaihd.net/news/externalpost/steam_community_announcements/4249665521683159651) and [Steam 1.5 news](https://steamstore-a.akamaihd.net/news/externalpost/steam_community_announcements/3854477638701252164).

## Q1. Every area / map / biome: unlock, travel, what is unique, size, caves, water

### Takeaway
The game has two separate island maps:
- **Bastion**, the base game: a temperate river valley with a snowy mountain to the east. It has 6 purchasable dig sites ("claims") and 6 towns or settlements, plus the Icehelm dwarven ruin.
- **Volcalidus**, the $10 DLC: a frozen, volcanic island described as "over 6 times the size" of Bastion. It has 6 dig sites and 6 towns/harbours, and you reach it by ship from Bridgepour Harbour.

There are no randomly generated biomes. Progression comes from buying claims and from digging deeper: each claim has tiered depth layers (T1/T2/T3), and deeper layers give better resources.

### Cited Findings

**General structure**
- Steam store pitch: "Various parcels of land await you in the world of Hydroneer, each with their own advantages. Deeper pits, attractive scenery, and closer stores. You decide where to build your base of operations." The store page also describes a "voxel based terrain system, you can create cave networks, quarry pits, or even mud mountains". — [Steam appdetails](https://store.steampowered.com/api/appdetails?appids=1106840)
- The developer explained why claims are few and bounded: "there's some pretty harsh technical limitations that we have to stick to with the technical side of terrain digging. From our research we have found that players tend to only use a maximum of 3 dig sites, so we feel that 6 is enough... each one currently has their own personality, quirks, and benefits." — [Steam Dev Vlog Mar 2024](https://steamstore-a.akamaihd.net/news/externalpost/steam_community_announcements/5686430301729334870)
- Bastion's terrain varies by claim: "Ember Cradle is flat, and the rest is hilly, so if you want to build, start it out by making it flat". Clearing tools include TNT and the Mini Nuke. — [Hydroneer Fandom: Digsites](https://hydroneer.fandom.com/wiki/Digsites)
- Depth tiers work like this:
  - Tools and machines are tiered: Dull/Forged Iron = T1, Common/Cloutium = T2, Advanced/Corestone = T3.
  - 2.0 added tiered drills that "only work to a certain depth depending on their tier", plus pickaxes and shovels "which can dig to a certain depth depending on their tier".
  - 2.2 added T3 and Corestone, "Found in Tier 2 and Tier 3 depths".
  - Sources: [Steam 2.0 notes](https://steamstore-a.akamaihd.net/news/externalpost/steam_community_announcements/4348799082201741462); [Steam 2.2 notes](https://steamstore-a.akamaihd.net/news/externalpost/steam_community_announcements/6539831519489700435)
- 2.2 added ore veins, "randomised locations where drilling and digging will result in a higher yield of this resource type". They are found with the Prospecting Helmet or the Hydro Prospector vehicle. — [Steam 2.2 notes](https://steamstore-a.akamaihd.net/news/externalpost/steam_community_announcements/6539831519489700435)

**Bastion dig sites.** Name, price in Hydrocoins (c), depth value from the Bridgepour API, nearest town, and relics.

| Dig site | Price | Depth | Nearest town | Relics |
|---|---|---|---|---|
| Ember Cradle (starter) | free | 5 | Burnscroft | sword, spyglass |
| Mildew's Aquifer | 970 | 22 | Ironil | goblet |
| Dreck Quarry | 1,200 | 22 | Bridgepour | skull |
| South Hope | 6,600 | 22 | Bridgepour | arrow, cross |
| Snowrune Falls | 7,000 | 22 | Ironil | none |
| Icehelm | 7,200 | 22 | Bridgepour | none |

Bridgepour's descriptions of each:
- Ember Cradle: "picturesque plot with a stunning riverside view and easy access to a quaint store and a skilled Jeweller... perfect place for new prospectors".
- Mildew's Aquifer: "an underground lake, formed by glacial runoff, that provides a reliable water source".
- Dreck Quarry: "a tricky entrance and a small pond in the corner, but its size and depth more than make up for it".
- South Hope: "vast... right on the ocean's edge... closest plot to Bridgepour".
- Icehelm: "a frozen tundra that conceals a horizontal digsite".
- Snowrune Falls: "Perched on the icy peak of a mountain".

The prices match the Fandom list (0 / 970 / 1200 / 6600 / 7000 / 7200). Sources: [Bridgepour API digsites](https://api.bridgepour.com/api/digsites/all/); [Fandom Digsites](https://hydroneer.fandom.com/wiki/Digsites)

- Icehelm and Snowrune Falls were added in 2.0 ("Icehelm and Snowrune Falls areas added, with a new dig site in each. Icehelm horizontal dig site"). — [Steam 2.0 notes](https://steamstore-a.akamaihd.net/news/externalpost/steam_community_announcements/4348799082201741462)
- 2.2.3 adjusted Dreck Quarry's dirt tiers so that "you can now have working T3 drills on the very bottom of the claim". — [Steam news feed](https://api.steampowered.com/ISteamNews/GetNewsForApp/v2/?appid=1106840&count=100&maxlength=0&format=json)
- Water access matters because machines are hydro-powered. A player thread lists water per site: "South Hope has a beach on the far side... Dreck Quarry has a small pond at the Far Side. Mildew Aquifer has water at the bottom. Icehelm has a small pond just outside the Mining area." Ember Cradle sits on a river/stream. — [Steam discussions (via search)](https://steamcommunity.com/app/1106840/discussions/0/4202490864588929494); [Bridgepour guides](https://api.bridgepour.com/api/guides/)

**Bastion towns and landmarks**
- **Burnscroft** is the start area next to Ember Cradle. It "houses the working people... Fishermen, crafters, cooks, and builders". It has a fish Stock Market, the Repair Store and Fishing Supplies, the Pole Trader (fishing-rod upgrades) and the Fishing Guild Grocer. — [Bridgepour API towns](https://api.bridgepour.com/api/towns/all/)
- **Bastion Keep** is "a magnificent fortification gracefully perched atop a hill" close to Ember Cradle. Its nobility buy jewellery and weapons. It has the Jeweller, the T1 Tools & Equipment store (Dull tools, Forged Iron pipes), the Travelling Merchant (sells your first Forged Iron Drill and Harvester), Crowns Grocer, and a Stock Market for Iron Bars. It is also where the King's main quest happens. — [Bridgepour API towns](https://api.bridgepour.com/api/towns/all/)
- **Bridgepour** is "the largest settlement", on a big river.
  - Shops: Tools & Equipment (T2 / Cloutium), Wooden Housing, Fobrick's Fancy Furniture, Jeweller, Conveyor Nation, Vehicle Store, Hobson's Logicworks (logic and power), Itchy Carts, Cottage Supply Co., Skeleton Grocer and the Scrap Yard.
  - **Bridgepour Harbour**: a jewellery Stock Market, the Prospecting Guild Store (T3 Corestone gear bought with Prospecting Guild Tokens), Prospecting Guild Vehicles, and the ship to Volcalidus.
  - It has "the skeleton of a dragon in the middle of town. Many rumours surround these ancient bones, but no one knows the truth".
  - Sources: [Bridgepour API towns](https://api.bridgepour.com/api/towns/all/); [Fandom Bridgepour](https://hydroneer.fandom.com/wiki/Bridgepour)
- The Fandom page adds a few details: a "shortcut on the river which makes travel time so much quicker"; the logic shop is "on the hill"; and the scrap yard is run by "the Panclang Brothers". The Bridgepour NPC list includes "Panclang 1" and "Panclang 2". — [Fandom Bridgepour](https://hydroneer.fandom.com/wiki/Bridgepour); [Bridgepour API npc](https://api.bridgepour.com/api/npc/)
- **Ironil** is "a small outpost where lumberjacks and stonecutters come to rest and trade", with northern architecture. It has a Stock Market for weapons (Axe, Dagger, Sword). — [Bridgepour API towns](https://api.bridgepour.com/api/towns/all/)
- **Icehelm** is made of "Dwarven ruins in the ice cold, Icehelm mountain... crumbling for many, many years".
  - It has Coldstone Housing (the stone build set), Tools & Equipment (T2 gear plus Masterwork Designs), and Stock Markets for gold bars and cut gems.
  - The Bridgepour guide adds: "In the snowy mountains east of Ember Cradle... Deep under the ground you will find a colossal magma chamber... Monuments to ancient heroes still stand guard over the great Forge". This is the Masterwork Forge, where drills and harvesters are crafted from Designs.
  - 2.0 added "Icehelm transporter pipes: send items directly through the abandoned city". There is a matching achievement, "Where did it go? – Use the Icehelm item chute".
  - Sources: [Bridgepour API towns](https://api.bridgepour.com/api/towns/all/); [Bridgepour guides](https://api.bridgepour.com/api/guides/); [Steam 2.0 notes](https://steamstore-a.akamaihd.net/news/externalpost/steam_community_announcements/4348799082201741462); [Steam achievements](https://steamcommunity.com/stats/1106840/achievements)
- **Grangefield** (added in 2.1) is "the home of the Farming Guild". It has Grangefield Vehicles, Greenhouse Housing, Farming Equipment, the Farmers Guild Store (bought with Farming Guild Tokens) and the Farmers Guild Grocer. NPC locations there include "Grangefield Barn" and "Grangefield Castle". — [Bridgepour API towns](https://api.bridgepour.com/api/towns/all/); [Bridgepour API npc](https://api.bridgepour.com/api/npc/); [Steam 2.1 notes](https://steamstore-a.akamaihd.net/news/externalpost/steam_community_announcements/4980448574112987724)
- **Stock market locations conflict between sources.** The Bridgepour map pins list a "Mildew's Aquifer Stock Market - buys Gold Bars", but the towns endpoint places a gold-bar market at Icehelm. One of them may be outdated. — [Bridgepour API maplocations](https://api.bridgepour.com/api/maplocations/); [Bridgepour API towns](https://api.bridgepour.com/api/towns/all/)
- **The cave of the ancients** is a relic cave on Bastion, separate from the lava-filled Icehelm. See Q6. 2.1 "Completely reworked the cave with visual improvements". — [Bridgepour API items (Arrow Relic)](https://api.bridgepour.com/api/items/all/); [Steam 2.1 notes](https://steamstore-a.akamaihd.net/news/externalpost/steam_community_announcements/4980448574112987724)

**Getting around Bastion**
- On foot, with hand carts (Itchy Carts), or in hydro-powered vehicles refuelled with water:

| Vehicle | Bridgepour API price | Currency |
|---|---|---|
| Hydro Truck | 55,000 | coins |
| Hydro Truck Mk.II | 142,000 | coins |
| Hydro Quad | 68,000 | coins |
| Hydro Roller | 246,000 | coins |
| Hydro Cropper | 268,000 | coins |
| Hydro Mole | 350,000 | Prospecting Guild Tokens |
| Hydro Prospector | 430,000 | Prospecting Guild Tokens |

  The raw API prices may be stored at a different scale than the in-game display. This was not verified. — [Bridgepour API vehicles](https://api.bridgepour.com/api/vehicles/)
- The ESC menu has "Unstuck" and "recall vehicle" options. 2.0: "Unstuck points now have separate locations for players and vehicles." — [Steam 2.0 notes](https://steamstore-a.akamaihd.net/news/externalpost/steam_community_announcements/4348799082201741462); [Fandom Hydro Truck](https://hydroneer.fandom.com/wiki/Hydro_Truck)
- 3.0 reworked the signposts on Bastion so they are "larger and easier to read", and made the World Map item zoomable with an indicator for the player's facing direction. — [Steam: Message from Max](https://steamstore-a.akamaihd.net/news/externalpost/steam_community_announcements/6300039510120170533); [Steam DLC/patch notes](https://steamstore-a.akamaihd.net/news/externalpost/steam_community_announcements/5756237364312335693)

**Volcalidus (DLC "Journey to Volcalidus", 5 Apr 2024, $10)**
- **Access:** "take the ship from Bridgepour harbor. You can either start a new game or use an existing save file... you won't be able to take items or vehicles to Volcalidus." — [Steam DLC launch post](https://steamstore-a.akamaihd.net/news/externalpost/steam_community_announcements/5756237364312335693); [Steam DLC appdetails](https://store.steampowered.com/api/appdetails?appids=2659380)
- **Design:** the announcement promised "6x the map size". It is a separate island with its own progression. "Water has to be produced from Ice"; "Ice appears towards the top of a claim"; "No more tiered drills, tiered stores instead"; "Stores act as the main progression". — [Steam DLC announcement](https://steamstore-a.akamaihd.net/news/externalpost/steam_community_announcements/5510783579247049777)
- **Volcalidus dig sites.** Dawn Rest is free (depth 5, journal relic). The others cost 5,000 each at depth 22: Shattered Breach (axe relic), Cinder Footing (horn), Waterside (bottle), Scoria Chamber (compass) and Lumberton Bluff (tankard). — [Bridgepour API digsites](https://api.bridgepour.com/api/digsites/all/); [Fandom Digsites](https://hydroneer.fandom.com/wiki/Digsites)
- The developer described each Volcalidus site:
  - Dawn Rest: "your Ember Cradle of Volcalidus".
  - Scoria Chamber: "Like Mildews Aquifer. Dig down to get to lava!"
  - Cinder Footing: "Sits proudly at the bottom of the volcano".
  - Shattered Breach: "Right next to Shattered Outpost... very close to the logic store and has a lava-duct running through it".
  - Waterside: "by the water! (not that you can use water in Volcalidus!)... situated in the middle of a few towns".
  - Lumberton Bluff: "sits right next to a town and has great views".
  - Source: [Steam Dev Vlog Mar 2024](https://steamstore-a.akamaihd.net/news/externalpost/steam_community_announcements/5686430301729334870)
- **Volcalidus towns:**
  - **Lumberton Harbour**: arrival town. Has the first Tools & Equipment, the Jeweller (also buys Hardstone, Diamond, Frost Rock and Ice) and a weapons Stock Market.
  - **New Glade**: "Surrounded by a huge Shard powered dome". Has stores you must construct (Jeweller, Ticket Office, Tier 1/2/3 equipment stores), the Travelling Merchant that sells construction crates, the museum, and Stock Markets for iron, gems and jewellery.
  - **Burville**: Conveyor Store, Scrapyard and the Scout Guild store. The Scout Guild sells the Ice build set, Brazier, Fancy Bed, Exquisite Table and the Volcalidus Peak Trophy.
  - **Mot's Island**: vehicle store and a race track.
  - **Shattered Outpost**: "settled on fractured ice... slowly floating apart". Has Hobson's Logicworks, housing, conveyors, a vehicle store and a gold Stock Market.
  - **The Barrens Harbour**: "Be sure to bring your Ship Ticket". The ticket gives one return trip to Mot's Island.
  - Sources: [Bridgepour API towns](https://api.bridgepour.com/api/towns/all/); [Bridgepour API items](https://api.bridgepour.com/api/items/all/)
- An independent guide confirms most of this:
  - Lumberton Harbor has a King's quest that gives a free Lava Truck and map.
  - New Glade has a Museum and five constructible shop spots.
  - Shattered Outpost has the forge and is the "only place to refine Forge Marks".
  - There are three Abandoned Miners (East Shelf, West Shelf, The Barrens).
  - The terrain has ice layers: "Top levels are all ice", and "Perma Frost: Tier 2 and 3 snow and dirt that dripping lava can't melt".
  - Source: [gameplay.tips Volcalidus guide](https://gameplay.tips/guides/hydroneer-volcalidus-dlc-guide.html)
- **Abandoned (Idle) Miners** are repairable passive resource generators:

| Miner | Repair cost | Output choices | Rate and capacity |
|---|---|---|---|
| East Shelf | 800 Hardstone Blocks + 1,200 Iron Bars | iron ore or gold ore | 1 wt per 10 s, full at 300 wt (50 min) |
| West Shelf | 2,300 Hardstone Blocks + 1,400 Iron Bars + 30 Cloutium Bars | hardstone or shard | 15 wt per 10 s, full at 500 wt |
| The Barrens | 9,800 Hardstone Blocks + 900 Corestone Bars + 400 Cloutium Bars | corestone or cloutium ore | 1 wt per 10 s, full at 100 wt |

  Source: [Bridgepour guides](https://api.bridgepour.com/api/guides/)
- **Collectible spawn points on the Bridgepour map:** 64 Hydrosaur Bone spawn locations and 20 Unrefined Forge Mark spawn locations, all on Volcalidus. — [Bridgepour API maplocations](https://api.bridgepour.com/api/maplocations/)

### Inferences
- For an original game, the core world structure to borrow is: one hub world with a few distinct towns that each specialise (different buyers and sellers), plus 5–6 bounded, purchasable claims with layered depth tiers. That works better than procedural infinite terrain. The developer explicitly limited claim count and size because of voxel-terrain performance, which matters even more in a browser.
- Each claim's "personality" comes from one trait: flat versus hilly, an underground lake, being near the ocean or a town, a horizontal mountain dig, or lava access.
- Water access is a meaningful site-selection constraint in the base game. On Volcalidus, lava and ice replace water as the core resource.

### Gaps
- No source gives absolute map dimensions in metres for Bastion. Only the relative "6x" figure for Volcalidus exists. NPC map coordinates in the Bridgepour API range roughly from x −50 to +50 and y −135 to +57, in unknown units.
- The Fandom wiki (402) and hydroneer.wiki.gg (blocked) could not be fetched for cross-checking. TechRaptor's map guide returned 403.
- Snowrune Falls and Icehelm have no relics listed ("0"). It is unclear whether those sites have any unique hazards.

## Q2. NPCs, towns, vendors, quest/request systems, achievements, lore, end-game goals

### Takeaway
- **Shopkeepers:** stores are physical shops where you pick items off tables or pallets. Sellers include Jewellers, Grocers and Stock Markets (each market buys only certain goods, at fluctuating prices).
- **Task-giving villagers (since 2.1):** 25 named NPCs on Bastion hand out quest scrolls asking for soup (rewarding Farming Guild Tokens) or anvil-crafted weapons and jewellery (rewarding Prospecting Guild Tokens, since 2.2).
- **Main story quest (2.2):** "For The King!" at Bastion Keep.
- **DLC:** a second King quest line, Scout Guild Tokens, rebuilding New Glade, a museum with bone collecting, and the Volcalidus Peak Trophy at 99,999 tokens as the final money sink.
- **Achievements:** 78 Steam achievements.
- **Lore:** minimal (a dragon skeleton, dwarven ruins, relics, a King). There is no narrative ending.

### Cited Findings

**Named task-giving NPCs on Bastion, all marked task_giver:**
- Ember Cradle: Thomas
- Burnscroft: Harold, Joan, Kenneth, Norma
- Bridgepour: Betty, Clifford, Desmond, Dolores, Edwin, Flint, Graham, Louise, plus Agnes at Itchy Carts
- Bridgepour Harbor: Lloyd, Mae
- Bastion Keep: Edgar, Herbert, Raymond
- Grangefield: Arthur (Barn), Clyde (Castle), Delbert
- Icehelm Forge: Clayton
- Mildews Aquifer: Roy
- "[REDACTED]" location: Joe (likely a secret)

Source: [Bridgepour API npc](https://api.bridgepour.com/api/npc/)

**Vendor and other NPCs:**
- Bastion Keep: Bastion Keep Broker, Grocer and Jeweller.
- Bridgepour: Conveyor Salesperson, Fobrick (furniture), Bridgepour Grocer and Jeweller, Hobson (logic), Housing Salesperson, Itchy (carts), Merchant, Vehicle Salesperson, Panclang 1 and 2 (scrapyard).
- Burnscroft: Master Fisherman.
- Ember Cradle: Ember Cradle Merchant and Travelling Merchant.
- Grangefield: Grangefield Grocer, Housing Salesperson and Salesperson, plus the Farmers Guild Merchant.
- Icehelm: Icehelm Salesperson.
- A secret NPC, the **Cave Dweller**, location "[REDACTED]".

Source: [Bridgepour API npc](https://api.bridgepour.com/api/npc/)

**What each shop type does** (inventories from [Bridgepour API towns](https://api.bridgepour.com/api/towns/all/)):
- **Jeweller** buys raw ores, bars, cut and uncut gems, weapons (axe, dagger, sword), rings, necklaces and treasure. The Volcalidus Jeweller also buys hardstone, diamond, frost rock and ice.
- **Grocer** buys vegetables, cut vegetables, 13 fish species (Cod, Crab, Flyingfish, Herring, Lobster, Mackerel, Monkfish, Prawn, Pufferfish, Sardine, Shark, Swordfish, Tuna) and Boots.
- **Stock Markets** each buy one category:

| Market | Buys |
|---|---|
| Bastion Keep | iron bars |
| Mildew's Aquifer or Icehelm (sources conflict) | gold bars |
| Icehelm | cut gems |
| Bridgepour Harbour | jewellery |
| Burnscroft | fish |
| Ironil | weapons |

  The stock market was reworked in 1.6 to behave "more realistically", and redesigned in 2.0 to "Now only purchase certain resources". — [Bridgepour maplocations](https://api.bridgepour.com/api/maplocations/); [Steam 1.6 notes](https://steamstore-a.akamaihd.net/news/externalpost/steam_community_announcements/4483864038806701099)
- **Scrap Yard** turns unwanted items into scrap metal.
- **Wishing well:** throwing coins in gives back "a boot of exactly the same value as the stack of coins", which can be sold at a grocer. — [Bridgepour API items (Boot)](https://api.bridgepour.com/api/items/all/)
- **Travelling Merchant** (Bastion Keep / Ember Cradle) has "Limited stock, get used tier 1 machines here!". It sells the Firefly Jar, Forged Iron Drill, Forged Iron Harvester, Spanner and Tool Bag. — [Bridgepour maplocations](https://api.bridgepour.com/api/maplocations/)
- **Pole Trader:** "Master of the Fishing Order - Catch unique fish, upgrade your Fishing Pole!" There are 8 rod ranks. Achievement: "Master Fisherman – Get the maximum level rod". — [Bridgepour API blogposts](https://api.bridgepour.com/api/blogposts/); [Steam achievements](https://steamcommunity.com/stats/1106840/achievements)

**Task and request system**
- 2.1: "NPCs now inhabit the world of Hydroneer. They'll occasionally give out tasks for soup in return for Farming Guild Tokens." Tokens are spent in the Farmers Guild Store, "NOT MICROTRANSACTIONS!!". — [Steam 2.1 notes](https://steamstore-a.akamaihd.net/news/externalpost/steam_community_announcements/4980448574112987724)
- 2.2: "New Currency: Prospecting Guild Tokens – New tasks: Craft items for NPCs using the anvil... New store in the Bridgepour Harbour to spend these new tokens."
  - "Task notes will now display the location that NPC is located to return the item."
  - Since 2.2.3, NPCs "display their name as well as the token type they're rewarding above their head".
  - 2.2.3 added a Task Note Board (holds two notes).
  - Since 2.2.5, NPCs no longer give rewards "if it has not been accepted by collecting the quest scroll".
  - Sources: [Steam 2.2 notes](https://steamstore-a.akamaihd.net/news/externalpost/steam_community_announcements/6539831519489700435); [Steam news feed](https://api.steampowered.com/ISteamNews/GetNewsForApp/v2/?appid=1106840&count=100&maxlength=0&format=json)
- Player-reported token values (anecdotal, Apr 2023): random farming quests pay about 50 tokens, prospector quests average about 2,000, and the King-quest guard's farming quest pays about 4,000. — [Steam discussion: The Questline and Farming](https://steamcommunity.com/app/1106840/discussions/0/3821909708339524140/)
- Achievements tied to tasks: "Chef – Deliver 10 soup requests"; "Quartermaster – Deliver 10 weapon requests"; plus 10,000-token milestones for Farming, Prospect and Scout Guild Tokens. — [Steam achievements](https://steamcommunity.com/stats/1106840/achievements)

**Main quest: "For The King!" (2.2, Bastion)**
- "With increasing difficulty, progress through Bastion Keep, to complete a quest for the king, with a pretty sizable reward". The patch notes list a "secret new item reward for completion". — [Steam 2.2 notes](https://steamstore-a.akamaihd.net/news/externalpost/steam_community_announcements/6539831519489700435)
- Structure, as players describe it: guards on the Keep staircases each require tasks before letting you up. The original poster asked that the "2 staircase guards" be "an either/or check, instead of demanding both things". — [Steam discussion](https://steamcommunity.com/app/1106840/discussions/0/3821909708339524140/)
- The quest step list in the snippet was a dagger, then a sword (400 Corestone, 1,000 Gold, 5,000 Iron), then soup, then a shark, then a ring (2,000 Cloutium, 700 Onyx). This is from a secondary encyclopedia that only surfaced in a search snippet and could not be fetched. Low confidence. — [NamuWiki (search snippet)](https://en.namu.wiki/w/Hydroneer)
- The shark step was originally a lobster: "'For the King!' quest now requires a shark, not a lobster" (3.0 patch). — [Steam DLC patch notes](https://steamstore-a.akamaihd.net/news/externalpost/steam_community_announcements/5756237364312335693)
- **Reward:** a "dirt chunk sceptre" from the King (a dirt-placing "Dirt wand"; 2.2.4 let it "place dirt anywhere in a dig site"). Players called it "beyond disappointing". — [Steam scepter thread](https://steamcommunity.com/app/1106840/discussions/0/4349988819855604086/); [Steam questline thread](https://steamcommunity.com/app/1106840/discussions/0/3821909708339524140/); [Steam news feed](https://api.steampowered.com/ISteamNews/GetNewsForApp/v2/?appid=1106840&count=100&maxlength=0&format=json)

**Volcalidus quests and goals**
- The King meets you on arrival and gives you Dawn Rest ("Your initial land handed to you by the King upon arrival"). A King's quest gives a free Lava Truck and map. There is an achievement for hitting the King with a snowball ("Assassin"). — [Bridgepour API digsites](https://api.bridgepour.com/api/digsites/all/); [gameplay.tips](https://gameplay.tips/guides/hydroneer-volcalidus-dlc-guide.html); [Steam achievements](https://steamcommunity.com/stats/1106840/achievements)
- **Rebuilding New Glade:** buy construction crates from the Travelling Merchant to build the Jeweller, the Ticket Office and the Tier 1, 2 and 3 equipment stores. Achievements: "Franchisee" (build one store) and "Good as New (Glade)" ("Fully Restore New Glade"). — [Bridgepour API towns](https://api.bridgepour.com/api/towns/all/); [Steam achievements](https://steamcommunity.com/stats/1106840/achievements)
- **Museum:** donate Hydrosaur Bones (36 in total). The fossil milestones reportedly pay Scout Guild Tokens: 1 bone = 100, 12 = 1,000, 24 = 3,000, 36 = 5,000. — [gameplay.tips](https://gameplay.tips/guides/hydroneer-volcalidus-dlc-guide.html); [Steam achievements](https://steamcommunity.com/stats/1106840/achievements)
- **End-game sink:** "Testers really wanted an expensive item to work towards when they've finished the main quests, steam achievements... The Volcalidus Trophy... selling for a pricey 99,999 Scout Guild Tokens." The Bridgepour item value is 99999. — [Steam Dev Vlog Mar 2024](https://steamstore-a.akamaihd.net/news/externalpost/steam_community_announcements/5686430301729334870); [Bridgepour API items](https://api.bridgepour.com/api/items/all/)
- **Bastion luxury sinks:** Throne (value 14,500), Golden Head Statue (1,200; necklaces can be placed on it since 1.4), and the Logic Mini Nuke (26,000). — [Bridgepour API items](https://api.bridgepour.com/api/items/all/)

**Achievements.** There are 78 Steam achievements (count confirmed by the Steam API). Over 50 were added in 2.2, and the rest came with the DLC. Selected ones, with global unlock percentages from the Steam page:
- Tutorial Complete! (19.9%); My First Hydrocoin (59.9%)
- Purchase each dig site, e.g. "Where's The Water?" for Mildew's Aquifer (7.9%) and "It'snow Problem." for Snowrune Falls (4.5%)
- "Secrets Of The Cave – Use relics to find the secrets of the cave" (hidden, 1.0%)
- "Wishing Well – Throw coins into a well" (hidden)
- "Booooooiiiingg! – Activate the truck Easter egg" (hidden, 2%)
- "Hot hot hot! – Touch Lava" (hidden)
- "Bonk. – Hit 25 NPCs with vehicles" (hidden)
- "Wolf of Bridgepour" / "Stonks – Make 100,000 HydroCoins on the stock market"
- "Nuclear Miner – Use a logic mini nuke"
- Bone donations: "Archaeology", "Indiana Bones", "Bonafide Bone Finder" (all 36, 0.7%)
- "Oh hi Mark – Refine a Forge Mark"; "Lucky Roll" / "Unlucky Roll" (Forge Mark buffs)
- "My First Lap" / "SPEEEEEEEEEEEEEED" (lap of Mot's Island in under 1:11)
- "Restoration" / "Passive Income" (rebuild the abandoned miners)
- "Frosty The Snowman – Discover the hidden snowman"; "Snowball Fight!"; "Assassin – Throw a snowball at The King"
- "Goodnight – Use a bed"

Sources: [Steam achievements](https://steamcommunity.com/stats/1106840/achievements); [Steam appdetails](https://store.steampowered.com/api/appdetails?appids=1106840)

**Lore**
- Bridgepour's dragon skeleton ("no one knows the truth of the magnificent creature").
- Icehelm's dwarven ruins and "Monuments to ancient heroes".
- Relics "of the past".
- "Hydrosaur" bones on Volcalidus.
- A King who rules both islands.
- There is no story campaign. The NamuWiki snippet (not fetched) is the only source discussing a narrative.
- Sources: [Bridgepour API towns](https://api.bridgepour.com/api/towns/all/); [Bridgepour guides](https://api.bridgepour.com/api/guides/)

### Inferences
- The quest design is light: random fetch/craft requests from named villagers, each paying a guild-specific currency spent in a guild-specific store. A single gated main quest (guards at staircases, each step escalating in material cost) is layered on top. This is cheap to build and gives direction to an open sandbox.
- Separate currencies (coins, Farming, Prospecting and Scout tokens) stop the player from simply buying the best tier with mining money, and force them into side systems such as farming. Players complained this forced them into farming, so consider making guard requirements either/or.

### Gaps
- The exact King quest steps and quantities could not be verified from a primary source (NamuWiki returned 403). Volcalidus King quest steps beyond the free Lava Truck are also unknown.
- The NPC "about" fields are empty in the Bridgepour API. There is no information on NPC personalities or dialogue beyond voice lines.
- Joe's "[REDACTED]" location was not found.

## Q3. Game modes, difficulty, new-game settings

### Takeaway
There are two modes: **normal (survival/career)** and **Creative** (added in 1.7, Nov 2021). There are no difficulty levels in any source. Creative and mods both disable Steam achievements. Co-op is Steam Remote Play split-screen only (2.0), not true online multiplayer.

### Cited Findings
- **1.7 Creative Mode:** "Ability to steal any item. Creative Wand - duplicate or destroy any item. Gravity Tool - Pick up and throw any item. Flight Cap - enable flight with a fancy hat! Hourglass - Change or pause time." — [Steam 1.7 notes](https://steamstore-a.akamaihd.net/news/externalpost/steam_community_announcements/4186652991113411288)
- Creative tools are physical world items, not menus: "All creative functionality is held within actual world objects... players will not be punished for stealing items - Players are free to take items from all stores, without angering the store keepers." — [Bridgepour API blogposts](https://api.bridgepour.com/api/blogposts/)
- **Later creative additions:**
  - "You can now build anywhere in the world in creative mode" (1.7.2).
  - "Crucibles and bars heat up 10x as fast in creative mode" and the "Invincible water filter" (2.0).
  - "Creative Hard Hat item" and "Land claims can now be purchased for free in creative mode" (2.0.7).
  - "Creative Wand can now destroy vehicles" (2.1).
  - "In creative mode, the Masterwork Forge can now be used without any resources" (2.2).
  - Sources: [Steam news feed](https://api.steampowered.com/ISteamNews/GetNewsForApp/v2/?appid=1106840&count=100&maxlength=0&format=json); [Bridgepour API patchnotes](https://api.bridgepour.com/api/patchnotes/)
- The creative items (Creative Wand, Flight Cap, Gravity Tool, Hourglass, Hard Hat, Invincible Water Filter Hook) appear in the normal store inventories. They are presumably only purchasable or usable in creative saves. — [Bridgepour API towns](https://api.bridgepour.com/api/towns/all/)
- **Achievements:** 2.2.3 "Added more UI elements to indicate how mods and creative mode prevent Steam Achievements being awarded". The load menu "Will now display if the save file has Steam Achievements enabled, as well as a message when starting a save with mods or creative mode on". — [Bridgepour API patchnotes](https://api.bridgepour.com/api/patchnotes/)
- **Save and new-game options:**
  - 1.6: "New gameplay option to toggle whether to save raw resources". This is from the pre-2.0 codebase and may be outdated.
  - 2.2.3: "Added 'Remove Resources' when continuing a save file".
  - Sources: [Steam 1.6 notes](https://steamstore-a.akamaihd.net/news/externalpost/steam_community_announcements/4483864038806701099); [Bridgepour API patchnotes](https://api.bridgepour.com/api/patchnotes/)
- **Other options and features:**
  - Toggle sprint/crouch option (2.0.7).
  - "Tutorial accessible from the main menu" (2.2).
  - The DLC can be started as a new game or from an existing save.
  - Mod support via Steam Workshop since 1.4.
  - Sources: [Bridgepour API patchnotes](https://api.bridgepour.com/api/patchnotes/); [Steam 2.2 notes](https://steamstore-a.akamaihd.net/news/externalpost/steam_community_announcements/6539831519489700435); [Steam DLC post](https://steamstore-a.akamaihd.net/news/externalpost/steam_community_announcements/5756237364312335693); [Steam 1.4](https://steamstore-a.akamaihd.net/news/externalpost/steam_community_announcements/4249665521683159651)
- **Multiplayer:** "Due to technical limitations of physics engines... make the multiplayer aspects of the update as Steam Remote Play Splitscreen". 2.0 also added customisable third-person characters. — [Steam 2.0 notes](https://steamstore-a.akamaihd.net/news/externalpost/steam_community_announcements/4348799082201741462)
- **Time:**
  - There is a day/night cycle. Beds let you "skip forward in time to the next morning".
  - "The ESC menu now pauses time" (2.2).
  - The Hourglass changes or pauses time (creative).
  - Sources: [Bridgepour API items (Camp Bed)](https://api.bridgepour.com/api/items/all/); [Steam 2.2 notes](https://steamstore-a.akamaihd.net/news/externalpost/steam_community_announcements/6539831519489700435)
- **Consoles:** Xbox Series X|S and PS5 versions, plus the DLC, launched 8 May 2026 via PlayEveryWare. They are "an almost exact copy" of PC, priced the same ($15 base, $10 DLC). — [Steam: Coming to Consoles](https://steamstore-a.akamaihd.net/news/externalpost/steam_community_announcements/1825727806715718)

### Inferences
- Hydroneer gets by with two modes and no difficulty slider. Its implicit difficulty levers are physics (no inventory; you carry everything), shop theft prevention and currency gating. A browser game could copy the "normal + creative sandbox" split cheaply and keep achievements disabled in creative.

### Gaps
- No source lists the exact new-game screen fields (seed, name, toggles). No procedural seed exists; the maps are hand-made.

## Q4. Hazards: lava, falling, drowning, darkness, enemies, death and respawn

### Takeaway
Hydroneer is essentially non-violent. No source mentions enemies, combat or a player health bar. The hazards that are documented are mostly about inconvenience:
- darkness at night and in caves (hence lanterns and helmets);
- lava in Icehelm and on Volcalidus (with a hidden "Touch Lava" achievement);
- physics mishaps (items or vehicles flung, getting stuck in terrain), handled by an "Unstuck" teleport;
- stores' anti-theft zones;
- machine durability and wear.

A real death/respawn system is not documented anywhere. Confidence is medium.

### Cited Findings
- **Lava contact** exists as a hidden achievement: "Hot hot hot! – Touch Lava". Its API name is IcehelmLavaBurn1, which ties it to Icehelm's magma chamber. — [Steam achievements](https://steamcommunity.com/stats/1106840/achievements); [Bridgepour guides](https://api.bridgepour.com/api/guides/)
- **Volcalidus lava** is a resource as well as an obstacle:
  - Lava flows and pools sit around the claims ("Watch out for the underground lava pools!" at Scoria Chamber; "At the base of the volcano, surrounded by lava" at Cinder Footing).
  - Pans left in lava fill up with lava.
  - "Leaving it [the Hauler] on the crafting platform before the press lifts can launch you across the map".
  - Sources: [Bridgepour API digsites/maplocations](https://api.bridgepour.com/api/maplocations/); [gameplay.tips](https://gameplay.tips/guides/hydroneer-volcalidus-dlc-guide.html)
- **Darkness:**
  - "Shadows in Hydroneer are quite dark and make it difficult to see when inside caves or at night", which led to the 3.0 lighting rework. 2.1 had already "Raised the brightness at night time/in shadows".
  - Light sources: Lantern, Mining Helmet (turns on automatically when worn, since 1.7), Standing Torch, Wall Lantern, Firefly Jar, Brazier and Logic Lamp.
  - Sources: [Steam: Message from Max](https://steamstore-a.akamaihd.net/news/externalpost/steam_community_announcements/6300039510120170533); [Steam 2.1](https://steamstore-a.akamaihd.net/news/externalpost/steam_community_announcements/4980448574112987724); [Bridgepour API items](https://api.bridgepour.com/api/items/all/)
- **Water:** in the tutorial you drop the pan in the river, and "Don't worry about getting a little wet, you'll soon dry off". Being wet has no stated penalty. 2.2 fixed "Players no longer 'splash' when exiting near water". No drowning mechanic appears in any source. — [Bridgepour guides](https://api.bridgepour.com/api/guides/); [Steam 2.2 notes](https://steamstore-a.akamaihd.net/news/externalpost/steam_community_announcements/6539831519489700435)
- **Stuck / out-of-bounds recovery:**
  - The ESC-menu "Unstuck" sends you to the nearest unstuck point, with separate points for players and vehicles since 2.0.
  - "Recall vehicle" teleports the nearest owned vehicle.
  - Players report Unstuck occasionally failing, leaving them "stuck waaay below/above the map", and vehicles with cargo being lost.
  - 2.2.4 fixed "Users will no longer fall through voxel dirt when loading their save files".
  - Sources: [Fandom Hydro Truck](https://hydroneer.fandom.com/wiki/Hydro_Truck); [Steam discussions (search results, anecdotal)](https://steamcommunity.com/app/1106840/discussions/0/2801754975112724928/); [Steam news feed](https://api.steampowered.com/ISteamNews/GetNewsForApp/v2/?appid=1106840&count=100&maxlength=0&format=json)
- **Physics chaos:** PC Gamer: "I've knocked my bed into the river at least three times... trying to stack two foundation blocks wound up sending one shooting into the sky." The Construction Hammer exists to "lock down" placed objects. — [PC Gamer](https://www.pcgamer.com/hydroneer/); [Bridgepour API items](https://api.bridgepour.com/api/items/all/)
- **Explosives:** the Logic Mini Nuke's flavour text reads "May cause extreme annihilation and loss of life". No source confirms that it damages the player. — [Bridgepour API items](https://api.bridgepour.com/api/items/all/)
- **Stores and theft:**
  - Shops have anti-theft "deletion" zones. Exploit fixes recur in patch notes ("Removed exploit for stealing items from the stores"; "When un-successfully stealing an item in the store, it'll no longer still appear in your hand").
  - In normal mode, taking unpaid goods out of a shop fails and the item is removed. Creative mode allows stealing without "angering the store keepers".
  - TV Tropes claims the developers added an in-game "Wanted!" poster for a serial shoplifter. This is unverified.
  - Sources: [Bridgepour API patchnotes](https://api.bridgepour.com/api/patchnotes/); [Steam: shoplifting exploit thread](https://steamcommunity.com/app/1106840/discussions/0/2254560552303794536/); [TV Tropes](https://tvtropes.org/pmwiki/pmwiki.php/Main/KleptomaniacHero)
- **Equipment wear:** "Durability items will now stop working at 0 durability" (1.6). Drills and harvesters "Take damage" and are repaired with spanners or tool bags. — [Steam 1.6](https://steamstore-a.akamaihd.net/news/externalpost/steam_community_announcements/4483864038806701099); [Bridgepour API items](https://api.bridgepour.com/api/items/all/)
- **NPC interaction:** vehicles can hit NPCs ("Bonk. – Hit 25 NPCs with vehicles"). No consequence is documented. — [Steam achievements](https://steamcommunity.com/stats/1106840/achievements)

### Inferences
- For an original browser game, Hydroneer suggests a "cozy" hazard model: no combat, light environmental hazards (darkness, lava as a terrain obstacle or resource, deep water), and a forgiving recovery button (unstuck/teleport) instead of permadeath. The real "danger" is losing resources to physics, theft rules or misplaced items.

### Gaps
- No primary source confirms whether lava, falling or explosions damage or kill the player, or what happens on contact (teleport, burn, nothing). Searches returned nothing Hydroneer-specific. Treat "no death system" as an inference, not a confirmed fact.
- Whether NPCs react to being hit was not found.

## Q5. Decoration and base building

### Takeaway
Building is modular and physics-based. You buy individual build pieces at housing stores, carry them, place them, and lock them with a Construction Hammer. There are five matching build sets: Wood, Stone (Coldstone), Cottage, Greenhouse and Ice. All share the same measurements so they can be mixed. There are also tin sheets, concrete floors, stairs, poles, windows, a large furniture and decor line, lighting, storage racks and trophies.

### Cited Findings
- 2.0: "Three different type of house building parts: Wood, Stone, and Cottage. These all have the same measurements and look great when the styles are mixed. Double wide wooden stairs." 2.1 added the Greenhouse buildset, bought with Farming Guild Tokens. — [Steam 2.0 notes](https://steamstore-a.akamaihd.net/news/externalpost/steam_community_announcements/4348799082201741462); [Steam 2.1 notes](https://steamstore-a.akamaihd.net/news/externalpost/steam_community_announcements/4980448574112987724)
- **Pieces in each set** (from the Wooden Housing store): Doorway, Floor, Floor Small, Pillar, Pillar Foundation, Pillar Half, Roof, Roof Corner, Roof Corner Inverted, Roof Peak, Wall, Wall Angled, Wall Angled Alt, Wall Half, Wall Peak, Wall Window.
  - Wooden Housing additionally sells Wooden Window (plain, Angled, Triangle), Tin Sheet (plain, Corner, Ramp, Long Ramp, Triangle, Long Triangle), Concrete Floor and Concrete Floor Large, Decorative Pole, Wooden Stairs, Double Wooden Stairs, Pallet, Camp Bed, Simple Chair, Wooden Table, Standing Torch, Wall Lantern, Tool Rack and the Construction Hammer.
  - The same piece set exists for Stone (Coldstone Housing, Icehelm), Cottage (Cottage Supply Co., Bridgepour), Greenhouse (Grangefield) and Ice (Scout Guild, Burville, DLC).
  - Source: [Bridgepour API towns](https://api.bridgepour.com/api/towns/all/)
- **Furniture and decor** (Fobrick's Fancy Furniture, Bridgepour): Deer Trophy, Fancy Bed, Fancy Chair, Fancy Rug, Fancy Table, Fish Trophy, Golden Head Statue, Planter Box, Plinth (displays gems and jewellery, and can store relics since 2.0), Safe ("Stores metal bars"), Simple Chair, Throne and Wall Lantern.
  - The DLC adds the Exquisite Table, Brazier, Extended Tool Rack and Volcalidus Peak Trophy.
  - Other decor-like items: weapon racks (Vertical, Angled, Curved), Rod Rack, Task Board and the Jack-o-Lantern (event).
  - Sources: [Bridgepour API towns](https://api.bridgepour.com/api/towns/all/); [Bridgepour API items](https://api.bridgepour.com/api/items/all/); [Steam 2.0](https://steamstore-a.akamaihd.net/news/externalpost/steam_community_announcements/4348799082201741462)
- **Placement mechanics:**
  - Press E to pick up, left click to enter place mode and place. R/T/Y rotate on the Z/X/Y axes. The scroll wheel moves the item closer or further.
  - Holding E gives "freeplacing".
  - 3.0 added build-snapping: "if you look at another placed item, it'll offset what you're placing to the corresponding side".
  - Ctrl reverses rotation while precision placing (2.1).
  - Sources: [Bridgepour guides](https://api.bridgepour.com/api/guides/); [Steam: Message from Max](https://steamstore-a.akamaihd.net/news/externalpost/steam_community_announcements/6300039510120170533); [Steam 2.1](https://steamstore-a.akamaihd.net/news/externalpost/steam_community_announcements/4980448574112987724)
- **Locking:** the Construction Hammer: "Left click on a placed object to lock it down. To unlock an item, simply Right click it. If the object has an orange outline, it isn't locked down." — [Bridgepour API items](https://api.bridgepour.com/api/items/all/)
- **Building restrictions:** in normal mode you can only build on owned claims. That is implied by 1.7.2: "You can now build anywhere in the world in creative mode". The Hard Hat (creative) lets you "infinitely place the item they are holding". — [Bridgepour API patchnotes](https://api.bridgepour.com/api/patchnotes/); [Bridgepour API items](https://api.bridgepour.com/api/items/all/)
- **Terrain shaping:** the Rake ("levelling out dirt, helpful for building"), the Hydro Roller ("flattening ground"), the Hydro Mole (tunnels at locked angles), and TNT, Logic TNT and the Mini Nuke for clearing. — [Steam 2.0](https://steamstore-a.akamaihd.net/news/externalpost/steam_community_announcements/4348799082201741462); [Bridgepour API vehicles](https://api.bridgepour.com/api/vehicles/)
- **Lighting:** Standing Torch, Wall Lantern, Lantern, Mining Helmet, Firefly Jar ("Harnesses the power of enslaved insects"), Brazier and Logic Lamp/Light Hook. — [Bridgepour API items](https://api.bridgepour.com/api/items/all/)

### Inferences
- The "same measurements across styles" rule is a strong pattern to copy: one grid module with several cosmetic skins sold at different towns, plus premium skins bought with side currencies (Greenhouse, Ice). This makes towns worth visiting for aesthetics, not just tools.

### Gaps
- No ladders, signs or fences appear in any store inventory. Vertical access is by stairs (and voxel ramps). Doors are "Doorway" pieces; 2.0.7 added "Sound effects for opening/closing house doors", which implies they open.

## Q6. Secrets, easter eggs, collectibles, "every corner"

### Takeaway
The main secrets and collectibles are:
- **6 Bastion relics** that unlock the hidden "cave of the ancients" (with the secret Cave Dweller NPC);
- **6 Volcalidus relics** (one per claim) for the New Glade museum pedestals, which reward an ice/snow sceptre;
- **36 Hydrosaur bones** across 64 possible spawn points;
- **Forge Marks** (20 spawn points);
- a **hidden snowman**, snowball piles, the **truck "boing" easter egg**, **wishing wells**, the **dragon skeleton**, rare **treasure chests** and **Onyx** (0.1% spawn);
- a seasonal **Hydroween** jack-o-lantern event and a Mot's Island race-track time trial.

### Cited Findings
- **Bastion relics:** sword and spyglass (Ember Cradle), goblet (Mildew's Aquifer), skull (Dreck Quarry), arrow and cross (South Hope), which is 6 in total. Their item text reads: "Found deep underground. Place in the cave with other relics!" — [Bridgepour API digsites](https://api.bridgepour.com/api/digsites/all/); [Bridgepour API items](https://api.bridgepour.com/api/items/all/)
- **Where the relics go:** "If you find enough relics, you must seek the cave of the ancients. No not the one full of lava and dwarven statues.. the other one! Once you're inside, you'll work out what to do." Achievement: "Secrets Of The Cave – Use relics to find the secrets of the cave" (hidden, about 1% of players). — [Bridgepour API items (Arrow Relic)](https://api.bridgepour.com/api/items/all/); [Steam achievements](https://steamcommunity.com/stats/1106840/achievements)
- **Relic details from players:** "6 relics in total and you need 4 of them to complete the achievement". Relics are in the T1 layer. "Bombs and nukes do not destroy relics" in later patches, and the Hydro Mole doesn't either. One player lost an uncollected relic on quitting. 2.0.2 fixed "Relics now spawning properly", and 2.0.3 fixed "Relic cave now works appropriately". — [Steam relic thread (May 2023)](https://steamcommunity.com/app/1106840/discussions/0/6821308966002847802); [Steam news feed](https://api.steampowered.com/ISteamNews/GetNewsForApp/v2/?appid=1106840&count=100&maxlength=0&format=json)
- **Volcalidus relics:** journal, axe, horn, bottle, compass and tankard, one per claim. Their text reads "Place in the museum with other relics!" A scepter is "clamped up there at the ceiling" in the museum. One player obtained it and said it "functions the same as the dirt scepter and creates ice/snow chunks while in a claim". gameplay.tips calls the relic reward the "Ice Wand".
  - The relic count is consistent across sources: a player counted "6 relic pedestals and 6 claims", which matches the 6 relics in the Bridgepour API.
  - The developer said they "didn't want to lock achievements behind *really* hard / time consuming stuff like finding all the relics".
  - Sources: [Bridgepour API items](https://api.bridgepour.com/api/items/all/); [Steam scepter thread (Apr 2024)](https://steamcommunity.com/app/1106840/discussions/0/4349988819855604086/); [gameplay.tips](https://gameplay.tips/guides/hydroneer-volcalidus-dlc-guide.html)
- **Hidden snowman:** the developer said of "Frosty the Snowman" that they "hid a snowman somewhere in the world". **Snowballs:** "Find small piles of snowballs around the world to throw. You can even start snowball fights with NPCs!" — [Steam scepter thread](https://steamcommunity.com/app/1106840/discussions/0/4349988819855604086/); [Steam Dev Vlog Mar 2024](https://steamstore-a.akamaihd.net/news/externalpost/steam_community_announcements/5686430301729334870)
- **Truck easter egg:** the hidden achievement "Booooooiiiingg! – Activate the truck Easter egg. Why did you folks request this feature?!". A user-submitted guide says that on controller you hold the accelerate and jump/handbrake buttons together for about 10 seconds and the truck springs into the air. This is unverified against the developer. — [Steam achievements](https://steamcommunity.com/stats/1106840/achievements); [TrueAchievements](https://www.trueachievements.com/a625113/booooooiiiingg-achievement)
- **Wishing wells:** coins thrown in return a Boot of equal value (hidden achievement "Wishing Well"). — [Bridgepour API items](https://api.bridgepour.com/api/items/all/); [Steam achievements](https://steamcommunity.com/stats/1106840/achievements)
- **Dragon skeleton** in central Bridgepour, with "many rumours" attached. — [Bridgepour API towns](https://api.bridgepour.com/api/towns/all/)
- **Rare finds:**
  - Onyx ("super rare gem that has a 0.1% spawn chance", 1.7).
  - Cloutium (1.3, "super-rare").
  - Treasure chests ("A treasure chest!", sold at the Jeweller).
  - The Boot from fishing.
  - The resource rarity order from common to rare: iron ore, gold ore, emerald, sapphire, ruby, corestone, shard, cloutium, onyx.
  - Sources: [Steam 1.7](https://steamstore-a.akamaihd.net/news/externalpost/steam_community_announcements/4186652991113411288); [Bridgepour guides](https://api.bridgepour.com/api/guides/); [Bridgepour API towns](https://api.bridgepour.com/api/towns/all/)
- **Hydrosaur bones and Forge Marks:** 64 bone spawn locations and 20 Forge Mark spawn locations on Volcalidus. 36 bones are needed for "Bonafide Bone Finder". Forge Marks are refined only at Shattered Outpost and give random buffs, which can be negative ("Unlucky Roll") or 3-star ("Lucky Roll"). — [Bridgepour API maplocations](https://api.bridgepour.com/api/maplocations/); [Steam achievements](https://steamcommunity.com/stats/1106840/achievements); [Steam DLC announcement](https://steamstore-a.akamaihd.net/news/externalpost/steam_community_announcements/5510783579247049777)
- **Seasonal event:** Hydroween. Limited-time Jack-o-Lanterns in stores (1.5, Oct 2020; repeated Oct 2021), and "the jack-o-lantern(s) will remain in your game world" afterwards. — [Steam Hydroween 2021](https://steamstore-a.akamaihd.net/news/externalpost/steam_community_announcements/4103335143113114554)
- **Developer in-jokes:** a task note for "grandmaMax" (the developer's handle) appeared due to a bug in 2.1. The Flight Cap's text reads "Foulball Hangover is not liable for any damages to the user and/or mining equipment". Picking the 'random' option in the character customiser could switch you to the King (a fixed bug). — [Steam news feed](https://api.steampowered.com/ISteamNews/GetNewsForApp/v2/?appid=1106840&count=100&maxlength=0&format=json); [Bridgepour API items](https://api.bridgepour.com/api/items/all/); [Bridgepour API patchnotes](https://api.bridgepour.com/api/patchnotes/)
- **Race track:** Mot's Island time trial (achievement for a lap under 1:11). **Screenshot camera** since 1.5. — [Steam achievements](https://steamcommunity.com/stats/1106840/achievements); [Steam 1.5](https://steamstore-a.akamaihd.net/news/externalpost/steam_community_announcements/3854477638701252164)

### Inferences
- Hydroneer's "every corner" content is a small set of collect-a-thons tied to digging (relics buried in specific claims, so exploring each claim is rewarded), plus whimsical one-off secrets: hidden snowman, well-to-boot, truck bounce, dragon bones. Each costs little to build and gives players reasons to visit every town and claim. An original game could reuse the pattern (buried relic sets that open a hidden area, plus a museum with milestone rewards) with new fiction.

### Gaps
- The exact location and contents of the cave of the ancients and the Cave Dweller's role are deliberately hidden. The Bridgepour site shows them only behind spoiler toggles, and the API does not return relic locations.
- The location of the hidden snowman was not found.
- Whether the Bastion relic-cave reward is an item or just the achievement was not confirmed.
