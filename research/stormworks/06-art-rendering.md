# 06 - Art direction and rendering technology (Stormworks as genre reference)

## Summary

- Public sources on Stormworks' rendering are thin. Nothing found names its engine or graphics API. Treat engine and DirectX/Vulkan version as UNVERIFIED (unconfirmed belief: a proprietary engine).
- Art direction in general terms: simple, low-poly, blocky vehicles and terrain, with the visual weight put on atmosphere (water, weather, day/night lighting) rather than model detail. A 2018 preview said this explicitly.
- Vehicles are voxel-like: cube and wedge components, painted per whole block (no per-face paint found).
- Performance is CPU-bound (physics), not GPU-bound. Minimum spec GPU is an Intel HD 6000 / GeForce 550 class. Vehicle lights, shadows and ocean foam are the settings players turn down for FPS.
- For our game: ship a flat-shaded, vertex-colour block look with a strong lighting/atmosphere identity. Three proposals below are deliberately distinct from Stormworks' muted, realistic-ish low-poly look.

## Findings on the reference game (high level)

Verified from sources:
- Store page lists day-night cycle, dynamic weather, tsunamis, winds that turn ripples into large waves, physics-based hydrodynamics. A ~15,000 km2 ocean/island world. (Steam page)
- Min specs: i5-4440 / Ryzen 3 1200, 4 GB RAM, Intel HD 6000 / GeForce 550 / R7 250. Recommended: i7-6700K, 8 GB, GTX 750 Ti. These GPU targets are very low, confirming a light renderer. (Steam page)
- Voxel-based building with cube and wedge components; Lua for microcontrollers and, since v1.15.0, a modding API. (Wikipedia)
- Steam patch notes: a "physics detail" option can roughly double performance in physics-heavy scenes; the game is described as CPU intensive, single-thread speed matters. (SteamDB patch notes, Steam discussions)
- Graphics options players mention adjusting: lights, wildlife, shadows, general quality, ocean foam. A "motion sickness" mode calms the sea and helps performance. (Steam/itch posts)
- Paint: the whole block takes a colour (a decoration-mod comment says you cannot paint a side). Saved vehicles store per-block colour + position. Colour-chart workshop items exist as references only. No decal/sign placement mod was found in my searches (not proof it does not exist).
- 2018 preview: low-poly terrain and models look simple at first, but water, weather and day/night lighting make the same place feel very different between calm and stormy; reviewer wanted more seabed detail, variable water fog, more stars, more life.

Not verified (do not rely on): engine identity, API/DirectX version, exact shadow technique, volumetric fog implementation, reflection method (planar vs screen-space vs probe), mod support for visuals beyond Lua/vehicle sharing. Player-side statements about night vehicle lights being a major FPS cost come from forum comments only.

## What players like / dislike (limited evidence)

Like: atmosphere and weather mood contrast; readable simple shapes that make building fast and easy to understand; low GPU requirement; Very Positive Steam rating (~90% of 42k reviews).
Dislike / wished-for (from the 2018 preview plus forum threads): sparse seabed and life, limited fog variety, few stars; lag when vehicles carry many lights; shadow/foam settings not fully fixing slowdowns because the bottleneck is physics CPU. Whole-block-only painting limits livery detail. Search did not surface Reddit threads, so this section is low confidence; a follow-up pass over r/stormworks is advised.

## Original art direction proposals

Common rule across all: strict grid-aligned block vehicles, so the look must make blocks feel designed, not just "voxels".

### A. "Blueprint Noon" - flat colour, bold outlines, graphic-design look
- Shading: unlit-ish/hemisphere-lit flat colour with 2-3 step toon ramp, 1px inverted-hull or edge-detect outlines on block silhouettes, hard-edged cast shadows.
- Palette: warm paper off-white sky, saturated primaries per material class (safety orange, cobalt, signal yellow), deep teal water with white contour lines.
- Vehicles: blocks read like toy/industrial design parts; panel seams drawn as dark inset lines; paint chosen from a limited 24-swatch palette designed to always harmonise.
- Water: stylised bands + animated contour lines, no realistic reflection. Cheap and very distinct.

### B. "Dusk Diorama" - tilt-shift miniature, emissive-driven
- Shading: soft baked-like look: hemisphere light + one directional with PCF soft shadow, vertex-colour AO baked at mesh time, bloom on emissives, depth-of-field/vignette for a miniature feel.
- Palette: low-sun magenta/amber/indigo gradient sky, desaturated mid-tones with intensely coloured lights (vehicle lights are the star).
- Vehicles: chunky, slightly bevelled blocks with baked corner AO; lights and screens glow strongly at night, making night play the signature visual.
- Water: dark glossy surface with fake planar sky gradient + sparkle, glow trails from lights.

### C. "Salvage Pastel" - hand-painted noise textures, worn plastic/metal
- Shading: lit PBR-lite (Lambert + spec) with procedural triplanar noise (scratches, grime, rust) modulated by a per-block wear value; pastel base colours.
- Palette: chalky teals, rust orange, bone white, muted mustard; weather darkens/desaturates the whole scene.
- Vehicles: look like weathered, patched-together machines; per-block wear and decal stickers (numbers, hazard stripes) generated in a small procedural atlas.
- Water: murky green-grey with foam textures by depth.

Recommendation: A for cheapest and most unmistakably original, B for best payoff from lighting systems, C if players value livery/wear customisation.

## Rendering and material pipeline (three.js, small team)

Reference: /home/user/projects/throttle-ridge already uses three.js with MeshStandardMaterial, vertexColors on merged geometry, PCF soft shadows, fog, a theme table, quality tiers (phone/touch/desktop shadow map sizes) and a textures.js for canvas textures. Reuse that approach.

1. Block meshes: one shared geometry per block type; colour via per-instance colour (InstancedMesh.instanceColor) or vertex colours when merged per vehicle. Merge static vehicle blocks into one BufferGeometry per material to keep draw calls low; rebuild on edit (dirty chunks).
2. Paint system: store a palette index (0-255) per block, not RGB; palette lookup in a small DataTexture or uniform array so repaint and theme changes are free. Optional per-face index later via 6 vertex-colour sets.
3. Decals/signs: canvas-generated atlas (text, numbers, stripes) sampled via UV attributes on flagged faces; avoid projected decals at first. Use three's DecalGeometry only for a few hero cases.
4. Shading: start with MeshLambert/Standard + hemisphere + one sun; add toon ramp via gradientMap (proposal A) or onBeforeCompile for outlines/AO.
5. Baked AO: per-vertex AO computed from neighbour occupancy when meshing (classic voxel AO). Cheap, big visual win, no textures.
6. Terrain: heightfield chunks with vertex colours by slope/height; triplanar noise via onBeforeCompile for detail; no UV unwrap.
7. Water: single large plane (or ring of LOD tiles following camera) with vertex-shader sum-of-sines waves, depth-free fake foam from a noise texture; sky-gradient fake reflection. CPU wave function must match shader so buoyancy samples the same height.
8. Night lights: do not use many real PointLights (cost grows per light in forward rendering). Use emissive materials + bloom, a few real SpotLights capped by budget, and fake light cones as additive transparent meshes.
9. Fog: scene.fog exponential, themed per weather; height fog via a shader chunk if wanted. Skip true volumetrics.
10. Quality tiers: shadow map size, pixel ratio cap, light budget, bloom on/off, water detail; auto-reduce on frame-time drops. Physics is the likely bottleneck as in the reference, so keep render cost low and budget CPU for sim.
11. Mod hooks: keep palette, decal atlas and theme as JSON data so players can share looks without code.

## Open questions

- Which engine/API does Stormworks use, and how is water rendered? (Search found nothing; try dev blog, Geometa forums, interviews.)
- Is per-face paint or decals available in current versions? Check the official wiki / patch notes directly (fandom wiki returned HTTP 402 to our fetcher).
- Real player sentiment: Reddit and Steam review text were not retrieved.
- Do we want night/lights to be a gameplay feature (affects proposal B and light budgets)?
- Target platform floor: mid phone in browser or desktop only?

## Sources

- https://store.steampowered.com/app/573090/Stormworks_Build_and_Rescue/ (features, system requirements)
- https://en.wikipedia.org/wiki/Stormworks:_Build_and_Rescue (voxel building, Lua, DLC timeline)
- https://saveorquit.com/2018/03/06/preview-stormworks-build-and-rescue/ (visual impressions)
- https://steamdb.info/patchnotes/6630071 (physics detail / CPU notes)
- https://steamcommunity.com/app/573090/discussions/0/3810660763576881016 (FPS settings discussion)
- https://itch.io/post/4866107 (motion sickness mode, performance)
- https://steamcommunity.com/sharedfiles/filedetails/comments/2519256549 (whole-block painting comment)
- https://nexusmods.com/stormworksbuildandrescue/mods/29 (colour workflow mod)
