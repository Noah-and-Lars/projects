# Stormworks: Weather, Environment and Natural Disasters (genre reference)

Research note for an ORIGINAL vehicle-building physics sandbox. Mechanics only; nothing copied. Evidence quality: the Fandom wiki and SteamDB patch-note mirrors were blocked (HTTP 402/403) from this environment, so findings come from search summaries, the community Lua API docs, a patch-note mirror and Workshop pages. Items marked [unverified] need checking in-game.

## Summary
- Weather is a per-location simulation exposed as normalized 0..1 factors: fog, rain, snow, wind, temperature. Waves, storms and wind are "locally simulated" (an earlier update made them more extreme: stronger wind, bigger waves, predictable storm systems).
- v1.4.4 (Feb 2022, free update) added natural disasters: radial tsunamis, meteor strikes, volcanic eruptions, tornadoes, whirlpools (hurricanes were also mentioned in marketing text). They spawn naturally, are rare, and become more frequent over time. They can be spawned from the creative menu or Lua, and disabled by disabling the addon.
- Disasters are implemented as a default Lua ADDON (default_natural_disasters), not hard-coded: the whole scheduler is user-replaceable. This is a strong design pattern.
- Same update reworked weather so it is no longer tied to the host's position (each client sees local weather; getWeather samples at a target position).
- Warning layer: map shows early notice, sirens sound (an Air Raid Siren component was added), disaster relief missions were added.
- Day/night cycle is configurable (server default full cycle 60 min [third-party host guide]); weather/time/wind can be overridden by game settings.

## Detailed findings

### Weather model (as exposed to scripts)
- `server.getWeather(matrix)` returns {fog, rain, snow, wind, temp}, each 0..1, sampled at a world position. Early versions (v1.2.18-19) returned only fog, rain, snow; wind and temp came later.
- `server.setWeather(fog, rain, wind)` overrides (0..1). Snow and temperature are not settable; temperature is read-only.
- `override_weather` game setting (float 0..1) forces weather; `override_time` forces time of day; no single "weather off" switch [third-party host guide].
- Other observed effects: lightning/thunder sounds vary by distance to storm; tornado wind was fixed to not leak into enclosed compartments (implies wind force is applied per exposed block/volume with an interior test).
- Sailing: sails respond mechanically to wind; sailboats reach near-realistic top speeds in moderate wind.
- Arctic biome: weather ranges from light snowfall to blizzard; cold affects characters (not verified for vehicle icing; no evidence found of vehicle icing).
- Volcanic ash blocks engine air intakes (jet intakes affected per v1.4.7 notes) - a disaster-to-component coupling.

### Time
- `server.getTime()`: hour (0-23), minute, daylight_factor (0..1, midday peak), percent (0..1 of day cycle). `getDate()` gives d/m/y; days survived counter exists. Game settings `day_length` and `night_length` exist (separate day and night durations); server config `day_night_length` default 60 min [third-party]. No evidence found of seasons; date exists but seasons [unverified, probably only biome-driven].

### Disasters (Lua spawn API gives the parameter model)
| Disaster | API / parameters | Notes |
|---|---|---|
| Tsunami | spawnTsunami(matrix, magnitude 0..1) | Only ONE tsunami/whirlpool active at once; stronger overrides weaker. cancelGerstner() cancels. Wave event is a Gerstner-wave system. Workshop addon lowers default max magnitude 0.9 to 0.5 (default is brutal); game clamps to 0..1 so no 500 m waves |
| Whirlpool | spawnWhirlpool(matrix, magnitude) | Can fail depending on ocean depth; shares the wave-event slot |
| Meteor / shower | spawnMeteor(matrix, magnitude, spawn_tsunami); spawnMeteorShower(...) | Magnitude scales meteor up to 20x default size; shower magnitude also raises count of secondary meteors; meteor impact can trigger a tsunami (added v1.4.7) |
| Volcano | spawnVolcano(matrix); getVolcanos() | Fixed volcano sites placed in the world (Mount Goldblum became one); activates nearest volcano whose tile is loaded. Ash affects intakes |
| Tornado | spawnTornado(matrix) | Position desync in multiplayer was a bug, fixed v1.4.7 |
- Callbacks onTornado/onTsunami/onMeteor/onVolcano/onWhirlpool let other addons react (e.g. spawn rescue missions).
- Helper: getOceanTransform(matrix, min_range, max_range) picks a random ocean spot; getOceanFloor for depth; both used to place sea events.

### Triggering and scheduling
- Natural trigger: default addon timer. Default interval was 5 min at launch; v1.4.7 raised it to 15 min (v1.4.7 also added addon option to disable disasters in default missions). Rare at start, frequency rises with elapsed time/days.
- Manual: creative menu spawn; Lua; chat commands in community addons (`?disaster Tsunami`, `?disastercancel`).
- Community "Natural Disasters Improved": randomized interval 1-5 h (max set at world creation), randomized magnitude (0..1 slider), notification, continuous siren plus warning lights, siren toggle button. It was reported removed/flagged on Workshop; check status.
- Sirens: global disable button (v1.5.2); fixed to account for tsunami travel distance (v1.4.14) - warning lead time scales with distance/speed.
- Mission link: disasters occur "sometimes as part of missions"; disaster-relief missions added. Players reported disasters still occurring with addon disabled until default mission locations' disaster missions were disabled separately (UX/config confusion).

### World settings
Game settings include day/night length, override time, override weather, plus addon toggles for disasters. Multiplayer servers expose the same via config. Custom in-game menu shows per-client local weather sliders when not overridden.

### Performance
- Tsunami/whirlpool being a single global slot (one at a time) is likely a performance/determinism guard. Tile-based activation (volcano only if tile in sim range) bounds cost. Multiplayer desync of tornado positions shows entity-like disasters need authoritative server state.

## Player-facing feel
Warning, then spectacle: sirens and map notice, then a huge radial wave or meteor. Rarity makes them events, not constant. Communities modify scale because defaults can be devastating (reason a workshop addon halves max tsunami). Weather mainly matters through waves (boat stability), wind (sails, helicopters, aircraft), and visibility (fog, rain) forcing instrument navigation.

## Known problems to avoid
- Disasters not fully disableable from one switch (addon vs. mission settings split).
- Desync of moving hazards in multiplayer.
- Wind forces leaking into enclosed interiors (needed a fix).
- Weather tied to host position (fixed by per-location sampling).
- Too-lethal defaults, forcing mods; no magnitude/frequency slider in base game.
- Fixed one-at-a-time limit for wave events surprises scripters (silently overridden).
- Siren timing ignoring wave travel time (fixed later).
- Old saves needing a new save to get new disaster addon (data migration pain).

## Implementation notes for our original game

### Weather state machine
- Global synoptic state per region cell (e.g. 2-4 km grid) with scalar fields: cloud, rain, snow, fog, wind vector, temperature, pressure. Discrete regimes: Clear, Overcast, Rain, Storm, Fog, Snow/Blizzard, with a Markov chain (transition matrix biased by biome/time of day) and dwell time T ~ lognormal (20-90 min game time). Blend parameters with smoothstep over 5-10 min, never snap.
- Expose 0..1 normalized factors plus physical values via one query `sample(pos, t)`; make it deterministic from (world seed, time) so clients compute locally without sync, with an override layer (value, weight) for scripts/missions/admin.
- Temperature: T = base(biome, lat) + diurnal amplitude*sin(2pi(t-15h)/24h) - lapse*altitude - storm cooling. Precip type from T threshold (snow below ~0 C) so rain/snow share the rain factor.

### Wind field
- Mean wind W(x,t) = smooth noise (curl-free 2D simplex, scale ~5 km, period ~30 min) scaled by regime strength, plus gust term g(t)=1+k*noise(t*0.3) with k up to 0.4 in storms; height profile u(z)=u10*(z/10)^0.14.
- Force on exposed block face: F = 0.5*rho*Cd*A_n*|v_rel|*v_rel, v_rel = wind - velocity of block; apply only to faces passing an exposure test (cast ray/voxel flood from outside, cache per vehicle, recompute on structural change). Sails: lift/drag from angle of attack on cloth quads. Tornado/disaster winds use the same pipeline plus an exposure test, avoiding the interior leak bug.

### Ocean tied to wind
- Fully developed-sea heuristics: significant wave height Hs ~ 0.0246*U10^2 (U in m/s, metres) capped by fetch/duration; peak period Tp ~ 0.8*U10 (s) roughly. Drive a spectrum (Pierson-Moskowitz or JONSWAP) from the local wind; sum 8-32 Gerstner components (cheap, analytic, usable for CPU buoyancy sampling) with directions spread around wind (cos^2 spread), amplitudes from spectrum, and the dispersion relation w^2 = g*k. Use the same analytic function on CPU (physics) and GPU (render) so floating matches visuals; add FFT only as a render-only detail layer. Make swell lag wind (low-pass wind history over ~30 min) so storms build and decay.
- Buoyancy: sample N points per hull cell; water height h(x,z,t) from the Gerstner sum (iterate 2-3 times to invert horizontal displacement).

### Disaster event scheduler
- Data: `DisasterDef {id, kind, minMag, maxMag, weight, cooldown, warningLead, placementRule, exclusiveGroup}`; `ActiveDisaster {def, magnitude, origin, startT, phase: Warning|Active|Decay, rng}`.
- Scheduler: Poisson process with rate lambda(t) = lambda0*(1 + days/D) clamped; draw next-event time from exponential; pick def by weight, magnitude via Beta(2,5) scaled to [min,max]; placement rule validates (ocean depth for whirlpool/tsunami, volcano sites, populated area bias for meteor). Expose world sliders: frequency multiplier, max magnitude, per-type toggles, warnings on/off, "disasters in missions" toggle - ONE authoritative config (avoids the split-switch problem).
- Tsunami radial wave: amplitude A(r,t)=A0*sqrt(r0/r) falloff (energy spreading) with a leading crest at r = c*t, c = sqrt(g*d) in open water (~200 m/s deep, slower in shallows); amplify by shoaling A ~ d^-0.25 near coast. Warning lead = (distance to nearest populated area)/c scaled; sirens fire at that lead.
- Exclusive wave-event slot is acceptable but document it and let higher magnitude pre-empt with a visible message.
- Meteor: ballistic entry, impact crater radius ~ magnitude-scaled, optional tsunami if ocean. Volcano: state machine Dormant -> Rumble (warning) -> Erupt (ash plume, bombs) -> Cooling; ash raises intake clog factor within plume volume. Tornado: Rankine vortex wind v_t(r) = Vmax*r/Rc for r<Rc else Vmax*Rc/r, plus inflow and updraft, moving along a noisy path; simulate server-side only and send position+seed (avoid desync).
- Missions: disaster emits events (onDisaster(kind, pos, mag)); mission generator subscribes and spawns rescue/relief jobs, with reward scaling to magnitude.

### Performance
- Evaluate weather lazily per query, cache per tick per region cell; LOD the Gerstner count (more components for nearby/rendering, fewer for far); activate hazards only inside loaded tiles; limit active exclusive events; server authoritative with deterministic client replay.

## Open questions
- Exact real wind speed units, max wind and wave heights in Stormworks (only normalized 0..1 observed).
- Whether seasons or vehicle icing exist (no evidence found).
- Precise disaster rate curve ("more frequent over time" formula) and tsunami max size at magnitude 1.
- Full list of world-creation sliders in the current build.
- Current performance cost of waves/disasters; community reception numbers (no survey data gathered).

## Sources
- Lua API docs (weather, time, disaster functions): https://aviosium.github.io/Stormworks-Documentation/
- Gist of addon Lua definitions: https://gist.github.com/carsakiller/9084e1672678bfeebe1f6f5eaef83dd4
- v1.4.4 patch notes mirror: https://updatecrazy.com/stormworks-game-update-1-4-4-patch-notes-february-3-2022/
- v1.4.4 wiki page (not fetched): https://stormworks.fandom.com/wiki/V1.4.4
- v1.2.18-19 wiki (not fetched): https://stormworks.fandom.com/wiki/V1.2.18-19
- Steam news, Natural Disasters update: https://store.steampowered.com/news/app/573090/view/3129441223327901201
- SteamDB patch notes (not fetched; v1.4.7, 1.5.2, 1.4.14 details from search summaries): https://steamdb.info/patchnotes/8133140
- Workshop, Natural Disasters Improved: https://steamcommunity.com/sharedfiles/filedetails/?id=3562683569
- Third-party server settings: https://low.ms/knowledgebase/stormworks-server-configuration
- Japanese fan wiki Lua docs: https://wikiwiki.jp/sbarjp/%E3%82%A2%E3%83%89%E3%82%AA%E3%83%B3Lua/Game
- Arctic update coverage: https://www.greenmangaming.com/blog/stormworks-build-and-rescue-releases-the-arctic-update/
