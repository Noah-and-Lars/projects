# Hydroneer visual style and art direction, and how to get a distinct stylized look in Three.js (r187)

Scope note: Hydroneer is by Foulball Hangover (UK), built in UE4. It released on Steam on 8 May 2020; 2.0 shipped on 8 May 2022; 3.0 and the Journey to Volcalidus DLC shipped on 5 Apr 2024; Xbox Series X|S and PS5 followed on 8 May 2026. The Hydroneer findings below come mostly from the official Steam announcements, pulled in full through the Steam News API (`https://api.steampowered.com/ISteamNews/GetNewsForApp/v2/?appid=1106840&count=400&maxlength=0&feeds=steam_community_announcements`, 62 posts from 2020-07 to 2026-05). Each post is cited by its store URL. Confidence labels used throughout:
- **[DEV]**: confirmed in official patch notes or announcements.
- **[PRESS]**: a reviewer's or third party's description.
- **[INF]**: my own inference.

The goal is to understand what makes the look work, not to copy it. Nothing here describes asset files in a way meant for reproduction.

## 1. Art direction: what the look is, and how it changed from 1.x to 2.0 to 3.0

### Takeaway
Hydroneer is chunky, simple, low-detail stylized 3D: exaggerated shapes, a fairly muted and warm palette, and plain textured materials (not flat vertex colour, and not showcase PBR). Reviewers call it functional rather than impressive. The art changed mainly through steady retextures and "visual overhauls" of individual assets, not one restyle:
- **2.0 (May 2022):** new VFX across the game, better lighting, vehicles retextured for resolution.
- **2.0.6 (Jul 2022):** each dirt tier got its own texture.
- **2.1 (Dec 2022):** cave rework; brighter nights and shadows.
- **2.2 (Apr 2023):** full foliage overhaul.
- **3.0 (Apr 2024):** global rework of how shadows and shade work, crisper outline highlight, mass retexture of tools.

The direction was consistently toward readability (brightness in the dark, clearer placement ghosts, clearer outlines, distinct dirt tiers, distinct molten-metal colours). It never moved toward realism.

### Cited Findings
- **[PRESS]** "It looks very simple, with a rather muted colour palette." The same review says the "exaggerated, chunky designs of both the environment and characters" give a cosy feel, and that the game "isn't going to blow you away, either from a visual or audio standpoint" but has "its own charm". (Mike Crewe, Thumb Culture PS5 review, 22 May 2026.) — [Thumb Culture](https://www.thumbculture.co.uk/hydroneer-ps5-review)
- **[PRESS]** The visuals are described as functional rather than flashy. — [SourceForge app page](https://sourceforge.net/app/hydroneer/); [XPN Network Xbox review](https://www.xpnnetwork.com/post/hydroneer-xbox-reviewv)
- **[PRESS]** Off the Shelf Media (May 2026) likes the art style ("not groundbreaking" but with "its own style") while scoring the game low overall. — [Off the Shelf Media](https://offtheshelfmedia.com/2026/05/26/hydroneer-review/)
- **[PRESS]** Gamefabrique calls the visuals rough and lacklustre but praises the physics-driven mud. — [Gamefabrique](https://gamefabrique.com/games/hydroneer/)
- **[PRESS]** A Steam user review praises the lighting and textures as clean and pleasant. — [Steam review](https://steamcommunity.com/id/tho545454/recommended/1106840/)
- **[DEV]** The Steam store description does not name an art style. Visually it mentions only "a state-of-the-art voxel based terrain system" ("cave networks, quarry pits, or even mud mountains") and land parcels with "attractive scenery". — [Steam store](https://store.steampowered.com/app/1106840/Hydroneer/)
- **[DEV] 1.x era, Sep 2020 (1.4):**
  - "Removed dynamic light on Goliath Drill to improve performance."
  - "Increased visual minimum resource size by 25%" (a readability change for small ore pieces).
  - "Conveyor belt visual speeds changed to represent pressure and physical speed better."
  - Source: [Steam 1.4](https://store.steampowered.com/news/app/1106840/view/4249665521683159651)
- **[DEV]** Oct 2020 (1.5): "Excavator and the UI have had an overhaul." — [Steam 1.5](https://store.steampowered.com/news/app/1106840/view/3854477638701252164)
- **[DEV]** In May 2021 the planned 2.0 was announced as including a "Graphical overhaul" alongside a "Total rework of the entire codebase". — [Steam, May 2021](https://store.steampowered.com/news/app/1106840/view/4072920612509569801)
- **[DEV] 2.0, 8 May 2022:**
  - "Brand new visual effects (VFX) throughout the entire game."
  - "Various visual improvements."
  - "Day/Night cycle major optimizations and improvements."
  - "Fixed issues with the cave textures."
  - "Vehicles all retextured to improve issues with resolution."
  - "Red/Blue placement material improved to show more detail in the item."
  - Visual overhauls of the light post, blacksmith hammer and construction hammer; "Pan and Bucket retexture".
  - Two new snowy areas: "Icehelm and Snowrune Falls areas added".
  - Source: [Steam 2.0](https://store.steampowered.com/news/app/1106840/view/4348799082201741462)
- **[DEV]** 2.0.6, 5 Jul 2022:
  - "Dirt Tiers now have distinctive diggable dirt textures."
  - "Dirt Chunks now have different textures depending on the tier they were dug from."
  - Source: [Steam, Jul 2022](https://store.steampowered.com/news/app/1106840/view/4474904295773706248). The version number is corroborated by [UpdateCrazy 2.0.6](https://updatecrazy.com/hydroneer-update-2-0-6-patch-notes-july-5-2022/).
- **[DEV]** 2.1 "Farming Season", 9 Dec 2022:
  - "Retextured lots of buildings throughout the game."
  - "Completely reworked the cave with visual improvements."
  - "Raised the brightness at night time/in shadows."
  - Source: [Steam 2.1](https://store.steampowered.com/news/app/1106840/view/4980448574112987724)
- **[DEV]** 2.1.2, Dec 2022: "Overhauled vehicles completely." — [Steam 2.1.2](https://store.steampowered.com/news/app/1106840/view/5000716037439281378)
- **[DEV]** 2.2 "Prospecting", 14 Apr 2023: "Complete foliage visual overhaul, including all grass, bushes and trees." and "New visual effects for the masterwork forge." — [Steam 2.2](https://store.steampowered.com/news/app/1106840/view/6539831519489700435)
- **[DEV]** 2.2.3: "Fixed GPU issue causing some players to have graphical crashes due to DLSS". This implies DLSS upscaling was offered on PC. — [Steam 2.2.3](https://store.steampowered.com/news/app/1106840/view/5133583642655153166)
- **[DEV] 3.0 "Mega Patch", 5 Apr 2024 (global, base game and DLC):**
  - "Lighting is reworked. Shadows are now brighter, making it easier to see in the dark."
  - "Improved outline highlight when looking at items."
  - "Purchasing platforms have had a visual overhaul."
  - Retextured items: blacksmithing hammer, construction mallet, magnifying glass, all pickaxes, shovels and rakes, saw, smelter, funnel, grinding wheel, planter box, racks and more.
  - "Tables appearing in stores have reworked textures."
  - Source: [Steam Mega Patch](https://store.steampowered.com/news/app/1106840/view/5756237364312335366). The "global changes" wording also appears on [Bridgepour patch notes](https://bridgepour.com/patch-notes) (search snippet) and [Hard Drive](https://hard-drive.net/hydroneer-journey-to-volcalidus-dlc-update-patch-notes/).
- **[DEV]** Max Hayon's pre-3.0 explanation:
  - "Shadows in Hydroneer are quite dark and make it difficult to see when inside caves or at night. We've changed the way shadows/shade works in Hydroneer, which was a technical challenge to work flawlessly with the Day/Night cycle, and to not affect daytime…"
  - "The highlighting effect when looking at items has been reworked and looks crispier."
  - Source: [Steam, "A Message From Max", 11 Jan 2024](https://store.steampowered.com/news/app/1106840/view/6300039510120170533)
- **[DEV]** 3.0.x follow-ups:
  - "Improved graphical performance of trees in Volcalidus."
  - "Removed issue with bones not having a particle effect on LOW settings" (so scalability presets exist). Source: [Steam 3.0.5](https://store.steampowered.com/news/app/1106840/view/5762993398268899735).
  - A later 3.0.x note says foliage shadow quality was raised but is "Still not completely fixed". Source: [Bridgepour patch notes](https://bridgepour.com/patch-notes), via search snippet only.
- **[DEV]** On 8 May 2026 the "Mega-Optimization" update brought PlayEveryWare's console-port optimizations to PC. The console version is "an almost exact copy" of PC, so no visual restyle came with it. — [Steam, May 2026](https://store.steampowered.com/news/app/1106840/view/1832065502815252); [Steam, Mar 2026](https://store.steampowered.com/news/app/1106840/view/1825727806715718)

### Inferences
- **[INF]** "Retextured…to improve issues with resolution" and repeated retexture passes suggest image-texture materials, probably modest resolution with a painted or photo-sourced base. The 2.0 vehicle note implies the earlier textures were visibly low-res. This is not flat vertex colour.
- **[INF]** No source mentions normal maps, PBR, or texture resolution. The "chunky, simple" descriptions point to low-to-mid poly models where silhouette and colour carry the read, not surface detail.
- **[INF]** The main lighting lesson is that Hydroneer's default UE4 lighting was too dark in shade, caves and at night. It took two passes (2.1 and 3.0) to lift the shadow floor without washing out daytime. For our game: design for a high minimum ambient, a "shadow floor", from day one.
- **[INF]** Visual identity sits mostly in object design (chunky machines, pipes, physical buckets and pans), not in rendering technique. That is good news for a browser remake: the look depends on clear shapes and palette more than heavy shading.

### Gaps
- No dev-confirmed statement on texture resolution, normal-map use, texel density, or whether any asset packs were used.
- No direct visual description of Bridgepour vs Ironil vs Icehelm vs Volcalidus beyond what is in section 2. Fandom returned HTTP 402, and bridgepour.com is a JS app that WebFetch could not render.
- No art-direction interview with Josef Riggins (lead artist) or Daniel Bright (3D artist) turned up.

## 2. How specific things look and read (terrain, dirt, ores and bars and gems, water and lava, machines, foliage, sky, night)

### Takeaway
What is confirmed:
- Terrain is voxel-based and fully diggable.
- Since July 2022, each depth tier of dirt has its own texture, and so do the dirt chunks dug from it. This is a clear depth-tier colour code.
- Smelter liquid colours were changed in 3.0.6 so gold and Cloutium read differently.
- Snow areas (Icehelm, Snowrune Falls) arrived in 2.0.
- Volcalidus mixes lava and ice: ice near the top of claims, lava ducts, a town under a blue dome.

Materials are told apart mainly by colour, plus form (ore chunk, then bar, then gem, then compressed gem). Exact shaders are unconfirmed.

### Cited Findings
- **[DEV] Terrain:** a "voxel based terrain system" that lets you make cave networks, quarry pits and "mud mountains". Better rewards come deeper. — [Steam store](https://store.steampowered.com/app/1106840/Hydroneer/)
- **[DEV] Depth-tier look:** "Dirt Tiers now have distinctive diggable dirt textures" and "Dirt Chunks now have different textures depending on the tier they were dug from" (2.0.6). — [Steam, Jul 2022](https://store.steampowered.com/news/app/1106840/view/4474904295773706248)
- **[DEV] Explosive craters:** "Logic explosives and mini nuke slight changes to their voxel destruction, now has a ring around the surface" (3.0). — [Steam Mega Patch](https://store.steampowered.com/news/app/1106840/view/5756237364312335366)
- **[DEV] Molten metal readability:** "Gold / Cloutium melted liquid colour changed to help distinguish each type in smelters" (3.0.6). — [Steam 3.0.6](https://store.steampowered.com/news/app/1106840/view/6474562312195671416)
- **[DEV] Logic Smelter liquid level:** shown as a visible liquid level ("visual liquid level now functions properly", 2.0.5). — [Steam 2.0.5](https://store.steampowered.com/news/app/1106840/view/4292505348839841359)
- **[DEV] Coins:** the coin text display was overhauled with "unique colours for each type" (3.0.6). — [Steam 3.0.6](https://store.steampowered.com/news/app/1106840/view/6474562312195671416)
- **[DEV] Corestone:** "this orangy-purpleish material", found in tier 2 and 3 depths (2.2). — [Steam 2.2](https://store.steampowered.com/news/app/1106840/view/6539831519489700435)
- **[PRESS, low reliability] Cloutium:** a fan-generated page calls it a rare ore with a "dark blue hue". — [shapes.inc fandom mirror](https://shapes.inc/fandom/hydroneer/resources)
- **[PRESS] Metals and gems:** the core metals are iron, gold and Cloutium. Gems (ruby, emerald, sapphire) come out uncut and are ground on a grinding wheel. Shards are a separate machine-buff material. — [TechRaptor mining guide](https://techraptor.net/gaming/guides/hydroneer-mining-guide)
- **[DEV] Gem Compressor:** compresses any gem into a "compressed gem" (1.4). — [Steam 1.4](https://store.steampowered.com/news/app/1106840/view/4249665521683159651)
- **[DEV] Small pieces:** "Increased visual minimum resource size by 25%" (1.4). Small nuggets were being made bigger to stay visible. — [Steam 1.4](https://store.steampowered.com/news/app/1106840/view/4249665521683159651)
- **[DEV] Conveyors:** belt texture scroll speed was tied to pressure and physical speed (1.4); "Conveyor belt visual improvements" (2.0.7). — [Steam 1.4](https://store.steampowered.com/news/app/1106840/view/4249665521683159651); [Steam 2.0.7](https://store.steampowered.com/news/app/1106840/view/4539082035562738288)
- **[DEV] Machines, mechanical motion cues:** "Conveyor Shredder T1 drum now spins the correct direction"; "Hourglass now has a sand effect which shows if time is paused/continuing" (2.0.6). — [Steam, Jul 2022](https://store.steampowered.com/news/app/1106840/view/4474904295773706248)
- **[DEV] Water as a visual on vehicles:** vehicles have water fuel tanks shown visually ("Vehicle lights no longer effect water fuel tanks visually", 2.2). DAVID and pressure tanks show a bar visual (1.5). — [Steam 2.2](https://store.steampowered.com/news/app/1106840/view/6539831519489700435); [Steam 1.5](https://store.steampowered.com/news/app/1106840/view/3854477638701252164)
- **[PRESS] Water's role in the loop:** a river runs at the edge of the first dig site; buckets of dirt are washed in the river and brushed to reveal ores. — [TheXboxHub review, Ryan Taylor, 11 May 2026, 4/5](https://www.thexboxhub.com/hydroneer-review/)
- **[PRESS] Screenshot captions:** "A pipe, running from a river in the background, is connected to a machine placed inside a small hole"; "An automated factory full of pipes and machinery sits inside a deep hole dug from the earth"; a town street with a snowy hill; the player in denim overalls next to a green tractor. These captions describe the typical composition. — [Thumb Culture](https://www.thumbculture.co.uk/hydroneer-ps5-review)
- **[DEV] Foliage:** "Complete foliage visual overhaul, including all grass, bushes and trees" (2.2, Apr 2023). Volcalidus trees later got a performance fix (3.0.5). — [Steam 2.2](https://store.steampowered.com/news/app/1106840/view/6539831519489700435); [Steam 3.0.5](https://store.steampowered.com/news/app/1106840/view/5762993398268899735)
- **[DEV] Night and caves:**
  - Dark shadows were an acknowledged readability problem, fixed in steps: 2.1 raised night and shadow brightness; 3.0 reworked shade globally. — [Steam 2.1](https://store.steampowered.com/news/app/1106840/view/4980448574112987724); [Steam Max message](https://store.steampowered.com/news/app/1106840/view/6300039510120170533)
  - "Windows/poles will no longer block sunlight for growing plants" (1.6), so there is a sun-exposure concept. — [Steam 1.6 via API](https://api.steampowered.com/ISteamNews/GetNewsForApp/v2/?appid=1106840&count=400&maxlength=0&feeds=steam_community_announcements)
- **[DEV] Light sources the player can place:**
  - Firefly Jar (2.0), light post (2.0 overhaul), standing torches (fixed in 2.0.1), Logic Light (made "brighter and covers more area", 2.0.5), Jack-o'-lanterns (1.5), plus lanterns that can be switched on and that extinguish in water (2.2.2).
  - Stores got "Improved lighting" (2.0.1).
  - Sources: [Steam 2.0](https://store.steampowered.com/news/app/1106840/view/4348799082201741462); [2.0.1](https://store.steampowered.com/news/app/1106840/view/4288001105332311583); [2.0.5](https://store.steampowered.com/news/app/1106840/view/4292505348839841359); [2.2.2](https://store.steampowered.com/news/app/1106840/view/6539831519503928900)
- **[DEV] Volcalidus (3.0 DLC):**
  - 6x the map size; a separate island.
  - Lava-powered machines; "Water has to be produced from Ice"; "Ice appears towards the top of a claim".
  - "Large new town covered by a blue dome" (New Glade).
  - Dig sites named Scoria Chamber ("dig down to get to lava"), Shattered Breach ("has a lava-duct running through it") and Waterside.
  - The Lava Thaw is a "flamethrower wielding vehicle that is used to dig terrain".
  - Snowball piles.
  - Sources: [Steam DLC announcement, Jan 2024](https://store.steampowered.com/news/app/1106840/view/5510783579247049777); [Steam dev vlog, Mar 2024 (via API)](https://api.steampowered.com/ISteamNews/GetNewsForApp/v2/?appid=1106840&count=400&maxlength=0&feeds=steam_community_announcements)
  - PC Gamer headline: "a sprawling new expansion of volcanos and glaciers" (Jonathan Bolding). — [PC Gamer](https://pcgamer.com/games/survival-crafting/mining-and-base-building-sandbox-hydroneer-has-a-sprawling-new-expansion-of-volcanos-and-glaciers)
  - Volcalidus is reached by ship from Bridgepour Harbour. — [gameplay.tips Volcalidus guide](https://gameplay.tips/guides/hydroneer-volcalidus-dlc-guide.html)
- **[DEV] Areas named in patch notes:** Bridgepour, Icehelm, Snowrune Falls and Ironil all appear (for example, "Fixed broken bucket textures in Ironil and Icehelm exit store", 3.0.2). — [Steam 3.0.2](https://store.steampowered.com/news/app/1106840/view/5756237364313246785)

### Inferences
- **[INF] Terrain shading.** Voxel-based diggable terrain plus per-tier "diggable dirt textures" strongly suggests world-space (triplanar or similar) texturing chosen by depth band or voxel material ID, because voxel or marching-mesh terrain has no stable UVs. Not dev-confirmed. Treat it as the standard technique, not proof of how Hydroneer does it.
- **[INF] How materials are told apart.** The order of cues is: (1) hue (gold yellow, Cloutium blue, Corestone orange-purple, gem colours), (2) form factor (rough ore chunk, then cast bar, then faceted gem, then compressed gem), (3) a size floor so tiny pieces stay visible. For our game, give every material a unique hue plus a unique silhouette per processing stage, and also vary roughness and metalness: metal bars shiny, ore rough, gems emissive or sparkly.
- **[INF] Molten metal.** It had to be recoloured per metal to stay readable. Plain "orange-hot glow" for every metal loses information. Tint the glow by metal.

### Gaps
- I found no confirmed description of how water and lava are rendered (shader, flow direction, foam), what the sky or fog look like, or how ores sparkle. Screenshots would be needed, and I did not view images.
- Whether pipes and machines use shared trim sheets or atlases is unknown.
- I could not confirm which areas are which colour or mood, beyond snow for Icehelm and Snowrune Falls and lava plus ice plus a blue dome for Volcalidus. Ironil and Bridgepour lack descriptive sources.

## 3. VFX (digging, water, smelting, sparks, explosions)

### Takeaway
VFX were redone game-wide in 2.0, with targeted additions later (masterwork forge in 2.2, vegetable-chopping VFX, a harvester particle fix). Particles are tied to scalability settings: a fix in 3.0.5 restored a missing particle effect on LOW. Exact styles (sprite flipbooks vs meshes, colours) are not documented.

### Cited Findings
- **[DEV]** "Brand new visual effects (VFX) throughout the entire game" (2.0); "Various minor particle fixes" (2.0.2). — [Steam 2.0](https://store.steampowered.com/news/app/1106840/view/4348799082201741462); [Sihmar 2.0.1 mirror](https://sihmar.com/hydroneer-update-2-0-1-patch-notes/)
- **[DEV]** "Harvester particle effect now works as intended" (2.0.5). — [Steam 2.0.5](https://store.steampowered.com/news/app/1106840/view/4292505348839841359)
- **[DEV]** "New visual effects for the masterwork forge" (2.2); "VFX when chopping vegetables with the cooking knife will no longer play twice" (2.2.2). — [Steam 2.2](https://store.steampowered.com/news/app/1106840/view/6539831519489700435); [Steam 2.2.2](https://store.steampowered.com/news/app/1106840/view/6539831519503928900)
- **[DEV]** "Removed issue with bones not having a particle effect on LOW settings" (3.0.5). — [Steam 3.0.5](https://store.steampowered.com/news/app/1106840/view/5762993398268899735)
- **[DEV]** "Players no longer 'splash' when exiting near water" (2.2), so there is a water-splash effect. — [Steam 2.2](https://store.steampowered.com/news/app/1106840/view/6539831519489700435)
- **[DEV]** Mini-nuke and explosives make a crater "ring around the surface" (3.0). The mini-nuke was introduced to "OBLITERATE your parcel of land" (May 2021). — [Steam Mega Patch](https://store.steampowered.com/news/app/1106840/view/5756237364312335366); [Steam May 2021](https://store.steampowered.com/news/app/1106840/view/4072920612509569801)
- **[DEV]** Hourglass sand effect (2.0.6). — [Steam, Jul 2022](https://store.steampowered.com/news/app/1106840/view/4474904295773706248)

### Inferences
- **[INF]** For a browser game, the cheapest readable approach:
  - **Dig puffs:** a few dozen camera-facing quads per hit, tinted with the current dirt-tier colour.
  - **Water spray:** stretched, additive, blue-white streak quads at the pipe outlet.
  - **Smelting:** an emissive liquid surface plus slow rising ember sprites, tinted per metal.
  - **Sparks:** short-lived additive points with gravity.
  - **Explosions:** a dust-cloud shell plus debris voxel chunks.
  - All can be one GPU-instanced particle system with a texture atlas. These are my recommendations, not Hydroneer facts.

### Gaps
- No source describes particle appearance (colours, flipbook vs mesh, density). This needs video or screenshot review.

## 4. UI and HUD look (fonts, tooltips, menus, outlines, placement ghosts)

### Takeaway
Confirmed details:
- Hydroneer has no inventory. Items are physical, picked up and dropped at a centre cursor.
- A drop shadow under held objects shows where they will land.
- World tooltips appear on hover, and resize to fit their content from 3.0.
- A highlight outline marks the looked-at object; it was reworked to look "crispier" in 3.0.
- Build placement uses a red or blue "placement material" (blue = valid, red = invalid), improved in 2.0 to show item detail.

The colour of the hover outline (the brief's "orange outline") and the font family are not confirmed by any source I found.

### Cited Findings
- **[DEV]** "Red/Blue placement material improved to show more detail in the item to make it easier to place" (2.0); "Built items no longer appear as their red/blue placement colour when placed down" (2.2.2). — [Steam 2.0](https://store.steampowered.com/news/app/1106840/view/4348799082201741462); [Steam 2.2.2](https://store.steampowered.com/news/app/1106840/view/6539831519503928900)
- **[DEV]** "Improved outline highlight when looking at items" (3.0); "The highlighting effect when looking at items has been reworked and looks crispier." — [Steam Mega Patch](https://store.steampowered.com/news/app/1106840/view/5756237364312335366); [Steam Max message](https://store.steampowered.com/news/app/1106840/view/6300039510120170533)
- **[DEV]** "Screenshot camera will now remove highlight from highlighted object when entering camera" (1.6). — [Steam API feed](https://api.steampowered.com/ISteamNews/GetNewsForApp/v2/?appid=1106840&count=400&maxlength=0&feeds=steam_community_announcements)
- **[DEV] Tooltips:**
  - "Tooltips dynamically change size depending on its contents to prevent them from going off screen" (3.0).
  - "Store tooltip sizes expanded to allow for languages with lots of words" (2.0.6).
  - "Vehicle key tooltip now shows the controller keybinding" (2.0).
  - "Keybinding tooltip now appears when looking at hats" (1.7.2).
  - Sources: [Steam Mega Patch](https://store.steampowered.com/news/app/1106840/view/5756237364312335366); [Steam, Jul 2022](https://store.steampowered.com/news/app/1106840/view/4474904295773706248); [Steam 2.0](https://store.steampowered.com/news/app/1106840/view/4348799082201741462)
- **[PRESS]** "There is a small shadow below each object to gauge where it will land". Another reviewer notes it can be "hard to see" depending on lighting, and that items drop "slightly offset from the middle of the screen". — [Thumb Culture](https://www.thumbculture.co.uk/hydroneer-ps5-review); [TheXboxHub](https://www.thexboxhub.com/hydroneer-review/)
- **[PRESS]** The game has no inventory system at all; you carry tools and resources physically. — [PC Gamer](https://pcgamer.com/i-cant-decide-if-having-no-inventory-system-in-this-crafting-game-is-brilliant-or-brutal) (headline and search snippet; the article body could not be fetched); [Thumb Culture](https://www.thumbculture.co.uk/hydroneer-ps5-review)
- **[DEV]** The UI was overhauled in 1.5 (Oct 2020). Coin display: "unique colours for each type", grouped digits ("1,420,690"), shown in split-screen (3.0.6). — [Steam 1.5](https://store.steampowered.com/news/app/1106840/view/3854477638701252164); [Steam 3.0.6](https://store.steampowered.com/news/app/1106840/view/6474562312195671416)

### Inferences
- **[INF]** The landing shadow being "hard to see depending on lighting" is a lesson. Our drop indicator should be a high-contrast decal or ring (unlit, always on top or depth-tested with an outline), not a real shadow.
- **[INF]** Use a distinct palette for placement ghosts rather than copying blue/red: for example cyan or teal for valid and magenta or red-orange for invalid, semi-transparent with a fresnel rim so item detail stays visible (the issue 2.0 fixed). Use a different hover-outline colour from the ghost colours.

### Gaps
- Font family, menu layout, the hover outline's colour and width, and HUD art style are not described in any source I could reach. A YouTube or screenshot review is needed to confirm the "orange outline".

## 5. Developer, press and community descriptions; team and asset pipeline

### Takeaway
Hydroneer is made by a tiny UK team: creator and studio director Max "grandmaMax" Hayon, lead artist and programmer Josef "Joe" Riggins, and 3D artist and developer Daniel "ItchyBeard" Bright. It started as a solo devlog project. No art-pipeline talk surfaced:
- Epic's "Inside Unreal: Creating Hydroneer with Max Hayon" stream (5 May 2022) exists, but its announcement has no art details.
- The community modding guide for 2.0 uses Blender to make custom meshes, but that tells us about modders, not the studio.

### Cited Findings
- **[DEV]** Team page credits are as above. — [Foulball Hangover team](https://www.foulballhangover.com/the-team) (via search snippet); [Foulball Hydroneer page](https://www.foulballhangover.com/hydroneer)
- **[DEV]** "Inside Unreal: Creating Hydroneer with Max Hayon" aired on 5 May 2022 on Twitch and YouTube; a reply notes the devlog began about three years earlier. — [Unreal forums](https://forums.unrealengine.com/t/inside-unreal-creating-hydroneer-with-max-hayon/546866)
- **[DEV]** Max's weekly YouTube dev highlights existed in 2020 ("You can follow the development of Hydroneer with my weekly YouTube highlights", 1.3). — [Steam API feed](https://api.steampowered.com/ISteamNews/GetNewsForApp/v2/?appid=1106840&count=400&maxlength=0&feeds=steam_community_announcements)
- **[PRESS]** The community "Hydroneer 2.0 Modding" video shows making custom meshes with Blender. — [YouTube](https://www.youtube.com/watch?v=BrKtqPdAfOw)
- **[PRESS]** The Nexus Hydroneer section includes a ReShade preset (the game exe is "Mining.exe"). Players adjust the post-processing look, though the preset's description could not be fetched (403). — [Nexus Hydroneer mods (search snippet)](https://www.nexusmods.com/hydroneer/mods/top)
- **[DEV]** Development of Hydroneer is "finished" (April 2024). The studio is on "Die Trying"; consoles were ported by PlayEveryWare. — [Steam, Mar 2026](https://store.steampowered.com/news/app/1106840/view/1825727806715718)

### Inferences
- **[INF]** A 2 to 3 person art team, retexturing in passes, points to a pragmatic pipeline (DCC tool plus image textures, likely Blender given UE indie norms). This is not confirmed.

### Gaps
- No interview or devlog transcript on art direction, palette choices, modelling tools, or use of UE Marketplace assets was found. The Inside Unreal VOD itself would be the best primary source.
- No UE4SS or FModel dumps of Hydroneer material or texture names surfaced in search.

## 6. Browser techniques for a comparable-quality, distinct stylized look (Three.js r187)

### Takeaway
r187 (three@0.187.0, published to npm 30 Oct 2026, current "latest") gives everything needed through WebGPURenderer and TSL node materials:
- `triplanarTexture(s)` for voxel terrain;
- an `outline()` post node for selection highlights;
- `bloom()` with per-material MRT masks for emissive molten metal and gems;
- `vertexColor()`, `posterize()`, FXAA and SMAA nodes;
- `BatchedMesh` and `InstancedMesh` for draw-call control;
- `KTX2Loader` for GPU-compressed textures.

Recommended recipe:
- **Materials:** flat-shaded or low-poly models with palette-atlas or vertex-colour materials.
- **Terrain:** world-space triplanar, with a texture or tint chosen by depth band, plus baked per-vertex AO (0fps method).
- **Lighting:** a high ambient or hemisphere floor (Hydroneer's own lesson), a single shadowed sun, distance fog matched to the sky colour, and a mild grade.
- **Effects:** selective bloom only on emissive.
- **Draw calls:** instancing for items, ores and props.

### Cited Findings
- **[DOCS] Version.** three@0.187.0 is npm "latest", published 2026-10-30. 0.186.0 came out 2026-09-08 and 0.185.0 on 2026-06-25. — [npm registry](https://registry.npmjs.org/three)
- **[DOCS] Triplanar.** TSL ships `triplanarTexture(s)` (`material.colorNode = triplanarTexture( texture( diffuseMap ) )`). Its blend weights are `abs(normal)` normalized and divided by the sum, with up to three different textures for X, Y and Z. It defaults to `positionLocal` and `normalLocal`, so pass world-space position and normal for chunked terrain. It references keijiro/StandardTriplanar. — [three.js source, TriplanarTextures.js](https://unpkg.com/three@0.181.0/src/nodes/utils/TriplanarTextures.js)
- **[DOCS]** World space is described as "Essential for … triplanar mapping". — [three.js TSL docs](https://threejs.org/docs/TSL.html); [llms-full.txt](https://threejs.org/docs/llms-full.txt)
- **[FORUM]** A missing normalization made triplanar results too dark. Triplanar coordinates "stick to the object" unless world space is used. — [three.js forum: Triplanar and lighting](https://discourse.threejs.org/t/triplanar-and-lighting/35241); [forum: aligning textures across objects](https://discourse.threejs.org/t/how-to-make-textures-align-across-adjacent-objects/66193)
- **[DOCS] Outlines.** `outline( scene, camera, { selectedObjects, edgeThickness, edgeGlow } )` returns `visibleEdge` and `hiddenEdge` masks that you colour and composite yourself. `downSampleRatio` defaults to 2, and `edgeGlow` can pulse. — [three.js OutlineNode docs](https://threejs.org/docs/pages/OutlineNode.html)
- **[FORUM]** The WebGL `OutlinePass` traverses the scene twice and gets expensive with many objects. Alternatives are stencil or scaled-duplicate (inverted hull) outlines. The `OutlineEffect` toon outline is not recommended for highlighting. — [forum: OutlinePass performance](https://discourse.threejs.org/t/performance-issues-with-three-outlinepass/7363); [forum: OutlinePass vs OutlineEffect](https://discourse.threejs.org/t/outlinepass-with-effectcomposer-or-outlineeffect/19790)
- **[DOCS] Bloom and grading.**
  - `bloom( node, strength, radius, threshold )`.
  - Materials can write `mrtNode` outputs for "selective bloom masks", which suits emissive molten metal and gems only.
  - Colour nodes include `hue`, `saturation`, `vibrance` and `posterize`.
  - FXAA needs sRGB input after `renderOutput()`.
  - Source: [three.js llms-full.txt (TSL post-processing section)](https://threejs.org/docs/llms-full.txt)
- **[DOCS] Other relevant built-ins:**
  - `MeshToonMaterial` (gradient-map banding).
  - `FogExp2`.
  - `GTAONode` and `GTAOPass`, `SSAOPass`.
  - `ToonOutlinePassNode`.
  - `PixelationPassNode` (`pixelationPass( scene, camera, pixelSize, normalEdgeStrength, depthEdgeStrength )` draws geometric edge outlines).
  - `vertexColor()`.
  - `KTX2Loader` and `KTX2Exporter`.
  - Sources: [MeshToonMaterial](https://threejs.org/docs/pages/MeshToonMaterial.html), [FogExp2](https://threejs.org/docs/pages/FogExp2.html), [GTAONode](https://threejs.org/docs/pages/GTAONode.html), [ToonOutlinePassNode](https://threejs.org/docs/pages/ToonOutlinePassNode.html), [PixelationPassNode](https://threejs.org/docs/pages/PixelationPassNode.html), [KTX2Loader](https://threejs.org/docs/pages/KTX2Loader.html)
- **[FORUM] Draw calls.**
  - With one geometry, use `InstancedMesh`. `BatchedMesh` handles many geometries with one material via multiDraw, and culls and sorts per object by default.
  - Some users report CPU overhead with BatchedMesh versus plain meshes.
  - The official `webgl_batch_lod_bvh` example renders 500k instances of 10 geometries with BVH culling.
  - Sources: [forum: InstancedMesh vs BatchedMesh](https://discourse.threejs.org/t/how-to-choose-between-instancedmesh-and-batchedmesh/81221); [forum: BatchedMesh CPU](https://discourse.threejs.org/t/significant-performance-drop-and-high-cpu-usage-with-batchedmesh/67324); [three.js example](https://threejs.org/examples/webgl_batch_lod_bvh.html)
- **[FORUM] KTX2.** KTX2Loader needs a transcoder path. Reuse one loader, because several active loaders can hurt performance. — [unpkg KTX2Loader.js](https://unpkg.com/browse/three@0.166.1/examples/jsm/loaders/KTX2Loader.js) (via search summary)
- **[BLOG] Voxel AO.**
  - Per-vertex AO computed from two side voxels and one corner gives 4 levels. It is view-independent, cheap, and compatible with greedy meshing if you only merge faces with equal AO.
  - Flip the quad diagonal to avoid anisotropy.
  - Pack it as 2 bits per vertex.
  - Sources: [0fps: AO for Minecraft-like worlds](https://0fps.net/2013/07/03/ambient-occlusion-for-minecraft-like-worlds/); [YNL Vozel devlog](https://yunasawa.itch.io/ynl-vozel/devlog/1032006/devlog-14-voxel-style-ambient-occlusion); [stb_voxel_render](https://flutter.googlesource.com/third_party/stb/+/refs/heads/dev/stb_voxel_render.h)

### Inferences (practical recipe; my engineering recommendations, verify by profiling)
- **[INF] Renderer.** Use `WebGPURenderer` with TSL so one shader codebase serves WebGPU and the WebGL2 fallback backend. Keep effects within the shared node set (outline, bloom, FXAA or SMAA).
- **[INF] Terrain (marching-cubes or surface-nets voxel mesh):**
  - Use world-space triplanar (`triplanarTextures(tex, null, null, scale, positionWorld, normalWorld)`, or a hand-rolled TSL version) over a small array of tileable 256 to 512 px albedo tiles, one per depth tier.
  - Pick the tier with `smoothstep` bands on world Y, or with a per-vertex material ID attribute, and blend across tier boundaries with noise so the strata do not look like perfect stripes.
  - Use a different texture or tint for top (Y) and sides (X/Z): grass or snow on top, dirt or rock on the sides.
  - Multiply by baked vertex AO and a little height-based darkening.
  - Skip normal maps; a cheap noise-based value variation is enough at this style.
  - This gives Hydroneer-like tier readability ([DEV] 2.0.6) with our own palette.
- **[INF] Dirt chunks.** Reuse the terrain triplanar material, with the tier index passed per instance through an `InstancedMesh` instance attribute. Each chunk then matches the tier it came from in one draw call.
- **[INF] Ores, bars and gems (readability):**
  - Give each material a unique hue and a unique per-stage silhouette: lumpy low-poly nugget, trapezoid bar with a bevel, faceted gem.
  - Vary roughness and metalness. Bars should be metallic with a low roughness and a cheap env map (a small PMREM of a gradient sky). Ore should be rough with flecks of the metal colour.
  - Gems get a slight emissive plus a fresnel rim, and optionally a sparkle sprite.
  - Set a minimum on-screen size, as in [DEV] 1.4.
  - Put all of them in a single palette texture (for example 16x16 colour swatches) so every prop shares one material and can be batched.
- **[INF] Low-poly props:**
  - Use flat shading (`flatShading: true`, or non-indexed geometry with face normals).
  - Use vertex colours or a palette-atlas UV. This avoids per-asset textures and keeps the look distinct from Hydroneer's textured style.
  - Add a subtle hand-painted feel with a world-space noise overlay or a gradient top-to-bottom tint in the shader.
- **[INF] Lighting and mood:**
  - Use one directional sun with a cascaded or tight-frustum shadow map following the player, plus a `HemisphereLight` with a sky and ground tint as the shadow floor.
  - Raise the hemisphere intensity at night and in caves instead of letting the scene go black. This is Hydroneer's 2.1 and 3.0 lesson.
  - Night should be a blue-shifted, lower-contrast scene, with warm local point lights from lanterns. Limit how many shadow-casting point lights are active; use unlit emissive glow cards for distant lights.
  - Use AgX or ACES tone mapping plus a mild `saturation` or `vibrance` node grade.
  - Use `FogExp2` (or a height fog in TSL) with the colour tied to the sky gradient and changed per biome: warm haze for meadow, cold blue-white for snow, red-orange for lava. Fog hides voxel-chunk pop-in and sets each biome's mood cheaply.
- **[INF] Toon option.** `MeshToonMaterial` with a 3 to 4 step `gradientMap`, or a TSL quantized NdotL, gives a distinct banded look. If used, pair it with an outline only on interactables, not the whole world, to keep it readable and cheap.
- **[INF] Selection and placement:**
  - **Hover:** `outline()` node with `selectedObjects = [hovered]`, a small `edgeThickness`, a unique colour, and an optional `edgeGlow` pulse. For many simultaneous highlights, use an inverted-hull back-face shell instead.
  - **Placement ghost:** a duplicate mesh with a transparent unlit material plus a fresnel rim and a scrolling scanline. Green or teal means valid; magenta or red means blocked. Draw it with `depthTest` on but a second pass of hidden-edge colour so it stays visible inside geometry.
- **[INF] Molten metal and lava:**
  - Use an emissive `colorNode` driven by scrolling 2D noise (two octaves, time offset) mapped through a black-red-orange-yellow ramp. Tint the ramp per metal (gold warm yellow, Cloutium cyan-blue, iron orange-red), as in [DEV] 3.0.6.
  - Put a crust mask on lava from thresholded noise.
  - Write lava and molten metal to a bloom MRT mask so only they glow.
  - Use vertex displacement only on large lava pools.
- **[INF] Stylized water:**
  - Use a flat plane with a depth-based colour ramp (shallow teal to deep blue) from the scene depth texture.
  - Add a foam band where depth difference is small, scrolling normal-free noise for sparkle, and a fresnel to sky colour.
  - Pipe outflow uses an instanced streak-particle stream.
  - No reflections or refraction needed.
- **[INF] Texture budget:**
  - Atlas props into 1 to 2 palette or trim textures.
  - Terrain tiers go into a `DataArrayTexture` or a 2D atlas with padding.
  - Encode everything with KTX2 (UASTC for normals or detail where needed, ETC1S for albedo) through `KTX2Loader`, reusing a single loader.
  - Target under 50 to 100 draw calls by instancing items, ores and particles, and by putting static machines into `BatchedMesh` per material.
- **[INF] Post chain (keep it short):**
  - scene pass, then optional GTAO at half resolution (or rely on vertex AO), then the outline composite, then selective bloom, then `renderOutput()` (tone map and sRGB), then FXAA or SMAA.

### Gaps
- No current (r185 to r187) benchmark comparing `outline()` vs inverted hull vs stencil outlines was found. Profile in-project.
- Whether `WebGPURenderer` performance on the WebGL2 backend matches `WebGLRenderer` for this kind of scene was not verified in this research.

## 7. Recent (2024–2026) examples of good-looking stylized Three.js games

### Takeaway
Messenger by Abeto (25 Sep 2025) is the standout recent proof that a polished, toon-shaded, stylized 3D game runs in the browser on Three.js. It used custom shaders, three-mesh-bvh, and assets made in Houdini, Blender and Substance. It went viral again in June 2026. Its stylized vegetation comes from geometry data combined with shaders.

### Cited Findings
- **[PRESS]** Messenger: a free browser game by Vicente Lucendo and Michael Sungaila, published by Abeto on 25 September 2025. — [Wikipedia](https://en.wikipedia.org/wiki/Messenger_(video_game))
- **[PRESS] Messenger's stack:**
  - Three.js (WebGL) for 3D, with no Unity, Unreal or Godot.
  - three-mesh-bvh for optimization; Houdini, Blender and Substance for visuals.
  - Shaders, controls, camera and networking almost all custom.
  - A toon-shaded look.
  - Sources: [Korben (EN)](https://korben.info/en/abeto-messenger-mail-carrier-mini-planet.html); [80.lv](https://80.lv/articles/deliver-mail-on-tiny-colorful-planet-in-this-relaxing-web-game); [Wikipedia](https://en.wikipedia.org/wiki/Messenger_(video_game))
- **[PRESS]** Its vegetation looks stylized "thanks to a mix of geometry data and shaders". — [Awwwards](https://www.awwwards.com/messenger.html)
- **[PRESS]** It drew renewed attention in June 2026. — [Game*Spark (JP), 16 Jun 2026](https://www.gamespark.jp/article/2026/06/16/168037.html)
- **[PRESS]** The Web Game Dev newsletter (Oct 2025) lists Bruno Simon's portfolio devlog and Maxime Heckel's "Field Guide to TSL and WebGPU" as current learning resources. — [Web Game Dev newsletter #28](https://buttondown.com/webgamedev/archive/issue-028/)

### Inferences
- **[INF]** Messenger shows that comparable quality comes from art-directed shaders (custom toon lighting, vegetation shaders, fog and colour), not from heavy PBR. The same applies to a Hydroneer-like game. Study its colour palette restraint and its use of world-space colour gradients.

### Gaps
- I did not find technical write-ups for other 2024–2026 stylized Three.js games (for example, ones built with voxel terrain). The newsletter archive and the three.js forum "showcase" category would be the next places to look.
