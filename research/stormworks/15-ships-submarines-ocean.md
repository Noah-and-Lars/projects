# Stormworks: Ships, Submarines, Buoyancy and the Ocean (genre reference)

Evidence caveat: the official wiki (fandom, wiki.gg) returned HTTP 401/402 to our fetcher, so most findings come from
Steam discussion threads, SteamDB patch-note mirrors and search summaries. Items marked [UNVERIFIED] come from
background knowledge or single anecdotal posts. Hard numbers are scarce; the game publishes almost none.

## Summary
- Stormworks models "physics-based hydrodynamics and displacement-buoyancy". Vessels float because enclosed/sealed volume displaces water; sealed volume also seems to drive buoyant mass accounting.
- Interiors are fluid-simulated: compartments can flood, pumps and hatches move water and air, and air pressure in tanks matters. Submarine depth control is done by player-built ballast tanks, pumps (PID-controlled via microcontrollers), hatches and high-pressure air blowing.
- The ocean has wave height tied to a weather/wind setting (waves can be set to 0%), plus hazards (whirlpools, hurricanes), fauna (fish, whales, sharks, kraken, turtle) and a seabed with trenches, wrecks and cables.
- Drag appears depth-dependent: players measure submarines much faster submerged (about 8 m/s surfaced vs about 40 m/s at depth at same throttle in one report).
- Community consensus: simulated seawater is "less dense than it should be", so hulls ride low and need lots of displacement; boats feel bouncy.
- No official pressure/crush-depth hull damage was confirmed (a player asked for it as a feature request; another reports an airlock showing ~15 atm and killing a character, so pressure affects fluid ports/characters but hull crush is unconfirmed).

## Detailed findings
### Buoyancy and flooding
- Buoyancy is displacement-based on enclosed volume; a thread suggests mass/buoyancy uses sealed volume, not simple per-block displacement (single-source speculation).
- Flooding: interior fluid is simulated per compartment; hatches/doors/pipes connect compartments. A Jan 2024 thread reports "ships no longer flood or sink" (a regression or setting; unconfirmed).
- Ballast tanks: official wiki says tanks can be flooded to roll a capsized ship upright; tanks fill slowly; advises multiple pumps and pumping air in as water goes out and vice versa.
- Pump-based depth hold: players use a PID controller on pumps; pumps move water in/out at unequal rates; one PID driving all pumps works poorly. Deeper pump intakes get better water/air pressure.
- Air blow: store compressed air (large pumps while on surface, high-pressure tank), open valve into ballast tank so internal air pressure exceeds ambient water pressure, then open a discharge hatch. Hatch size sets fill rate; intake hatch must reach tank top so air can vent.
- Bug anecdote: with Space DLC, seawater in a ballast tank turned into crude oil (unconfirmed).

### Propulsion and drag
- Propellers only give thrust in water; their drag is mostly body drag opposing rotation. Engines needing air intakes lose power submerged; electric motors favoured for subs.
- Drag appears to fall with depth (players think a depth-based drag function plus fading wave forces, 10-20 m depth noticeably faster). Persisted with waves at 0%, pointing at a drag term not waves.
- Rudder/thruster specifics: nothing authoritative found.

### Ocean, creatures, seabed (patch notes via SteamDB)
- v1.4.4: active volcanoes, meteor impacts, ocean whirlpools, hurricanes, physics-based fish that flee vehicles.
- v1.5.0: trench, seafloor cabling, ruins, wrecks, underwater tunnels; new sonar (omnidirectional, active or passive; passive hears propellers/engines).
- Later: whales (toggleable), giant turtle, physics-based kraken, sharks, crabs/lobsters (v1.12.0), commercial fishing with biome/depth/longitude based spawns.
- Tides/currents: not confirmed. [UNVERIFIED] ocean currents exist in some form.

### Not found
Per-block buoyancy constants, water density value, crush depth, wave model equations, block-count performance limits for carriers/tankers, anchors/mooring details. [UNVERIFIED background: carriers and tankers are built by players with tens of thousands of blocks and run slowly; heavy physics cost.]

## Player-facing feel
Boats feel bouncy and ride low; subs are fiddly (slow ballast, PID tuning), rewarding when depth-hold works; subs get dramatically faster underwater which feels odd but fun; big flooding disasters and self-righting hulls are a core drama; sonar and sea monsters add tension.

## Known problems
- Slow ballast fill/drain; pump rate asymmetry; PID instability.
- Questionable water density and bouncy boats.
- Submerged-faster-than-surfaced drag oddity.
- Flooding reportedly disabled/regressed at times; fluid-type glitches (water becoming oil).
- Airlock pressure readouts (15 atm) killing characters.
- No confirmed hull crush depth.

## Implementation notes for our original browser game
- Buoyancy: voxelise the hull; each tick sample N voxel centres (cap e.g. 500-2000 per vehicle, subsample large ones) in world space; submerged fraction = clamp((h(x,z,t) - y_bottom)/voxelSize, 0, 1); force = rho*g*V*fraction applied at the voxel (gives torque for pitch/roll for free). Use rho 1025 as physical, but expose a tunable multiplier (players complained about low density).
- Wave function: sum of 4-8 Gerstner waves, h(x,z,t) written once in JS for physics and mirrored in the vertex shader (same params uniform) so CPU and GPU agree; wave amplitude scaled by a wind slider. Use horizontal Gerstner displacement for correctness only in rendering; physics can use the vertical term with an inverse-displacement iteration or ignore it.
- Flooding: flood-fill compartments over hull voxels with air-tight faces; each compartment holds air volume, water volume, and openings (hatch/breach with area). Flow through opening: Q = Cd*A*sqrt(2*dP/rho), with dP from head difference and compartment air pressure (Boyle). Compartment water mass adds to vehicle mass and centre of mass (free surface effect optional: approximate as water level plane per compartment). Breach when hull block destroyed re-runs flood-fill merge/split lazily.
- Ballast: tank is a compartment with intake hatch, vent and compressed-air valve; model air as ideal gas so blowing at depth is harder naturally; make pump rates symmetric and documented to avoid the community frustrations.
- Drag: per-voxel-face quadratic drag F = 0.5*rho*Cd*A*v^2 using submerged-face fraction and relative water velocity (include wave orbital velocity optionally); add linear damping for stability; do NOT drop drag with depth unless intended (avoid the fast-submerged oddity, or replace with explicit wave-making drag that fades with depth, which is physically justified).
- Propellers: thrust ~ k*rho*n^2*D^4, only if submerged fraction > threshold; torque load back on engine; rudders as lift surfaces from flow over area.
- Pressure: ambient P = P0 + rho*g*depth; offer optional crush-depth per hull material (dP threshold damages blocks) as a differentiator.
- Rendering in three.js: large subdivided plane or clipmap with ShaderMaterial (Gerstner vertex, normal from analytic derivatives, Fresnel + depth-based colour, sky cubemap reflection, foam at crests), underwater fog and a screen-space tint when camera below h; seabed as heightmap with fog darkening by depth.
- Performance: run buoyancy in a fixed 60 Hz step; flooding at 10-20 Hz; cap compartments solved per frame; large ships use coarser voxel sampling.

## Open questions
- Actual water density, buoyancy per block, wave model, crush depth in Stormworks.
- Whether hull collapse from pressure exists.
- How mooring/anchors work; performance limits on huge hulls.
- Currents and tides.

## Sources
- https://steamcommunity.com/app/573090/discussions/0/4757578278661666146 (submarine speed/drag thread)
- https://steamcommunity.com/app/573090/discussions/0/800065387638058447/ (ballast tanks methods)
- https://steamcommunity.com/app/573090/discussions/0/3001052356449277257/ (depth hold PID)
- https://steamcommunity.com/app/573090/discussions/0/1741103267314178302 (pressure damage request)
- https://stormworks.fandom.com/wiki/Wiki/Vehicles/Water/Boat (official wiki, not fetchable; seen via search summary)
- https://steamdb.info/patchnotes/ (Stormworks patch notes mirror, e.g. /8852501, /8133140)
- https://en.wikipedia.org/wiki/Stormworks:_Build_and_Rescue
- https://en.wikipedia.org/wiki/Submarine_depth_ratings
