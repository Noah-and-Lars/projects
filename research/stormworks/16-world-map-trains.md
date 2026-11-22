# Stormworks: world, map, infrastructure, rail (genre reference)

Research caveat: the wiki (fandom) and several blog/patch-note pages returned 402/403 to the fetcher, so this rests on search summaries, Steam guides and patch-note excerpts. Items marked (UNVERIFIED) need a second source.

## Summary
- World = a grid of hand-authored "tiles" (island pieces, each an XML + mesh/heightmap asset), stitched into islands/biomes. Larger landmasses (Sawyer "mega island") span many tiles; small islands fit one tile. Tiles are generated at save start and are static afterwards.
- Biomes/regions (verified by search): Sawyer Islands (central, 6 islands, temperate), Isle of Donkk (west, island chain linked by road/rail bridges), Arctic (far north, ~100 km from spawn; rain becomes snow past ~60 km north), Arid Islands / Meier Islands and a large arid mainland (south; Industrial Frontier added a ~30 km, ~400 km2 arid mainland), Space DLC moon (>1,000 km2 of lunar surface, "largest land location").
- Scale: community claim of a 256x256 km play area with a ~16 km central zone holding the main islands (UNVERIFIED, forum post). 64-bit physics precision (v0.5.21) allowed islands hundreds of km away without instability. The Space update added world-border wrapping.
- A procedural ~100 km train line links Isle of Donkk to the Arctic mainland (v0.6.1, Feb 2019). Players complain it is too sharply curved for realistic speeds on islands.
- Trains are player-built (no built-in train entity): wheels on rails with fixed orientation since a 2024 patch (excess twist derails); gauge fit, rail-joint snagging and traction slip are common pain points; switches/points are hard to control or read state.

## Detailed findings
**Tile structure.** Community guides list tile files by region: main island `island_15`, Sawyer `mega_island_X_Y`, Arid `arid_island_X_Y`, Arctic `arctic_tile_N`. The in-game map is composed of ~248x248 px tile screenshots on a ~35x18 layout (rough estimate from a guide). Names embed grid coordinates (likely). Tile XML can be edited/replaced by modders; community tools exist (3D world editor project on GitLab for tiles/playlists/vehicles; GitHub island edit files). Missions/playlists attach to tiles via the in-game mission editor, where objects (whales, penguins, seals, ice) can be placed.
**Biome rules.** Weather/precip varies by latitude (rain->snow north), arctic adds ice, wildlife (whales, penguins, seals). Exact terrain physical properties (friction per surface) not found - OPEN.
**Infrastructure.** Cities/airports/oil platforms/outposts/train terminals are hand-placed inside tiles; Arctic update added research outpost, train terminals, oil platform. Roads and runways are baked in tile meshes (UNVERIFIED detail).
**Expansion history.** v0.5.21 64-bit physics; v0.6.1 Arctic (Feb 2019); v8 Mainland Wildfires (Oct 2019); Industrial Frontier (arid mainland); Sawyer Islands DLC update; v1.9 Space (moon, world wrap).
**Streaming.** Tiles load around the player/vehicle; sparse islands in ocean mean most of world is water. Details of LOD not found.
**Trains.** Wheels/bogies built by players; track is a world asset (procedural long-haul line + hand-placed local tracks); switches exist but state is not readable (modder complaint); one-way loops used so locomotives can run around consists; builders use weight/lower throttle to avoid slip.

## What players like / dislike
Like: huge explorable scale, mission variety, long rail trip as a goal, wildlife/weather ambience. Dislike: procedural track curvature, switch control opacity, rail-joint snagging, limited tile-edit official tooling, empty ocean travel time, tile edits breaking on updates.

## Implementation notes for our original browser game
- **World concept (original):** an archipelago of ~20-40 hand-authored "cells" (e.g. 1x1 km or 2x2 km) in a sparse grid, themed by latitude bands: temperate, cold, arid, volcanic. Keep a central starter zone with hangar/harbour/airstrip and a long rail line as a progression goal.
- **Chunk streaming:** fixed-size cell grid; load cell data (heightmap PNG 257x257 + object JSON) on demand in a worker; 3x3 neighbourhood around the player, LOD ring beyond (low-res mesh/impostors). Ocean is one shared plane with depth read from heightmap.
- **Heightmap vs hand-authored:** hybrid. Author islands as heightmaps (sculpted or noise + hand masks) with splat maps for surface type (friction/density tables); place infrastructure as objects. Procedural generation for filler/ocean-floor/rocks only. Provide an in-game tile editor later (JSON export = modding).
- **Rail:** spline-based tracks (Catmull-Rom/Bezier with min-radius check at authoring time) sampled into rigid colliders as short straight segments (or a flanged-wheel constraint model rather than true wheel-on-rail physics, which is jittery). Bogies: 2-4 wheels with constraint to nearest spline point; switches as graph nodes with a readable state flag and exposed to logic. Fix the Stormworks flaws: enforce curve radius vs. speed, expose switch/signal state.
- **Large world:** floating origin (rebase every ~2-4 km, shifting all dynamic bodies), physics in local float32 space, world positions in float64 on CPU; wrap world edges like Stormworks if finite. Logarithmic depth buffer or tight near/far split; fog/sky to hide LOD.
- **Ambient life:** cheap boid-style fish/whales as non-physics visuals, simple AI traffic on spline roads/rails only near player.

## Open questions
Actual tile dimensions in meters; surface friction values; real world size; LOD/streaming radii; track gauge value; signalling model; how tile heightmaps are stored. Needs wiki or datamined XML verification.

## Sources
- https://www.greenmangaming.com/blog/stormworks-build-and-rescue-releases-the-arctic-update/
- https://stormworks.fandom.com/wiki/V1.6.2 and https://stormworks.fandom.com/wiki/Wiki/World (not fetched; 402)
- https://steamcommunity.com/sharedfiles/filedetails/?id=2901363555 (Sawyer tile map guide)
- https://steamcommunity.com/sharedfiles/filedetails/?id=2877007551 (island file names)
- https://steamcommunity.com/app/573090/discussions/0/1835685838080139925/ (map size thread)
- https://steamdb.info/patchnotes/12356266 (Space patch notes, via search summary)
- https://steamdb.info/patchnotes/4293122/
- https://gitlab.com/CodeLeopard/StormworksEditor ; https://github.com/AeroSouls/StormWorks_Islands_TP_Benches
- https://steamcommunity.com/app/573090/discussions/0/3417684796199849553 and workshop comment threads (train mechanics)
