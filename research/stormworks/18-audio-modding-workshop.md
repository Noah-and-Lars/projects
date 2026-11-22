# Stormworks: audio, modding and Workshop (genre reference)

Evidence caveat: the Fandom wiki returned HTTP 402 to fetches, and web search gave mostly snippets. Items marked (unverified) are inferred or from a single weak source. Engine-sound internals for Stormworks were NOT found in any source; the audio section is therefore thin and the implementation notes lean on general game-audio practice.

## Summary
- Stormworks shares vehicles, missions, microcontrollers and environment mods through Steam Workshop; sharing is a core reason the game stays alive (it ships "build and share" as a headline feature).
- Vehicles are saved as XML (editable in a text editor by hand or with community tools). Missions/addons are authored in an in-game editor, and since the 1.0-era updates are driven by Lua scripts (callbacks like onTick, a `server.*` API).
- A major physics rework (Space DLC, 2023) broke many Workshop creations and caused player outrage: a lesson in format versioning and compatibility.
- Audio: no authoritative public detail on engine-sound design; community evidence shows sounds are replaceable files on disk, sirens/buzzers are parts whose sound can be customised, and ambience (wind/rain/thunder) is area-aware (indoor spaces muffle outdoor sounds).

## Audio findings
- Engine behaviour that audio would map to: RPS (rotations per second) and load. Community guides say max achievable RPS falls with load on the engine, so a sound model keyed to (RPS, load) is natural. How Stormworks maps these to samples is not documented in what I found.
- Sound mod on Nexus Mods: replacement audio files go into game audio folders (rom/audio with fx subfolders), installed with a tool called Stormloader; one mod restores "original" engine, aircraft engine and large-engine sounds, implying players noticed and cared when engine sounds were changed.
- Thunder: a 2020 forum post offered five replacement thunder sounds, showing players want ambience variety.
- Sirens/horns/buzzers: siren blocks were reused by a Workshop author to build a trumpet-style horn; another thread says custom buzzer/horn sounds are done by editing the part's XML (unverified depth).
- Indoor/outdoor: a Workshop lighthouse note says interiors can be made to muffle wind and rain like existing indoor areas, so the game has an "indoor" attenuation concept.
- General (not Stormworks): load-based engine audio is commonly done with separate on-load/off-load loops crossfaded by RPM (Wwise guide, BeamNG docs).
- Praise/criticism: one Steam thread opens with a player tired of "sound mechanics"; content not retrieved. No reliable review consensus found.

## Modding / Workshop findings
- Workshop categories (wiki): vehicles, environment mods, microcontrollers, mods, missions. Vehicles using DLC/mod parts need those installed. Subscribed microcontrollers appear in the workbench automatically. Upload is from the workbench top bar.
- Vehicle file: XML; the save folder holds a pair of files per vehicle (an .xml and a companion, likely thumbnail). Users edit it in a text editor; community "XML tool" sites exist. Components are linked through logic-node references. An F# parser exists (Rodhern/StormworksVehicleParser), described as unfinished. No official schema found.
- Microcontrollers: sub-networks of logic or Lua, shareable as their own Workshop items; a vehicle embeds them.
- Mission editor: players build/share missions. 1.0 made built-in missions procedural; the editor moved to Lua-driven spawning of vehicles, objects, items. A 2022 update added playlist Lua scripts with custom gamemode support. Callbacks (onTick etc.); warning that onTick over ~16 ms slows physics. API renames in 2021 (spawnVehicle -> spawnAddonVehicle) show breaking-change pain.
- v1.15.0 added component/physics/gameplay modding: a Lua component API and an engine-values text file exposing extra values.
- Playlist folder under AppData holds mission playlists (Japanese FAQ, single source).
- Longevity: Workshop content and a tinkering community underpin it; the 2023 physics change breaking creations is the key moderation/compatibility lesson. Moderation specifics (IP reuse, e.g. republishing with credit requests) appear in comments; Steam handles reports.
- Save/load: separate vehicle saves and world saves; not deeply researched.

## Implementation notes for our original browser game
Procedural engine audio (WebAudio)
- Inputs: rpm (normalised), load (0-1), throttle. Build 3-5 looped samples at fixed RPMs (idle, low, mid, high) for on-load and off-load; crossfade neighbours with equal-power gains, set playbackRate = rpm/sampleRpm (clamped 0.7-1.4) to pitch-match.
- Alternative fully procedural: sawtooth/pulse oscillators at firing frequency (rpm*cyl/120) + filtered noise, lowpass cutoff tracks load, waveshaper for grit. Cheap, no assets, good for a v1.
- Use AudioWorklet for granular/loop-with-crossfade if needed; seamless loops via short overlapped crossfade; add random micro-jitter to RPM for realism.
- Ambience: bus per layer (wind, rain, ocean, thunder, radio). Wind gain/lowpass from airspeed; rain via filtered noise with intensity; thunder one-shots delayed by distance (speed of sound) with convolver reverb. Indoor/outdoor: a per-listener "enclosure" factor lowering ambience bus gain and lowpass cutoff.
- Spatial: PannerNode (HRTF or equalpower), inverseDistance model, Doppler by manual playbackRate change; limit active voices (~32); resume AudioContext on first user gesture.
- Parts: speaker/horn/siren as component with a small set of tone presets (oscillator patterns) plus a logic-driven on/off/pitch channel.
Vehicle file format
- JSON with schemaVersion (integer), gameVersion, parts array (type id, grid position, rotation, params), links array (node ids) and a thumbnail field. Write migrate(v_n -> v_n+1) functions and keep migrations forever; refuse unknown future versions with a clear message. Optionally gzip/CBOR for compactness. Stable string part IDs (never reuse). Record the physics-version so broken-by-physics creations can be flagged instead of silently loaded.
Sharing gallery (Cloudflare)
- Workers API; R2 for vehicle JSON + thumbnail (client renders canvas to WebP); D1 tables: items, users, ratings, reports, tags, versions. Upload flow: signed upload, server-side schema validation and size caps, rate limiting, Turnstile on upload. Ratings: one per user, sort by Wilson score; tags and "requires parts" metadata. Moderation: report queue, hide flag, hash-based dedupe, mod roles, takedown without deleting owner copy. Versioning per item so updates keep the same URL.
Scripting/missions (later): sandboxed JS in a Worker/iframe with callback API (onTick budget enforced), mirroring the Lua addon idea.

## Open questions
- Exact engine sound mapping used by Stormworks and its audio middleware (not found).
- Full vehicle XML schema and file pair contents; mission playlist XML structure.
- Real audio criticism/praise from reviews.
- Workshop moderation policy details.

## Sources
- https://stormworks.fandom.com/wiki/Gameplay/Workshop (via search snippet)
- https://en.wikipedia.org/wiki/Stormworks:_Build_and_Rescue
- https://store.steampowered.com/app/573090/_/
- https://identichosting.duckdns.org/Rodhern/StormworksVehicleParser (mirror of vehicle parser)
- https://github.com/Cuh4/StormworksModLuaDocumentation
- https://nexusmods.com/stormworksbuildandrescue/mods/54
- https://steamcommunity.com/app/573090/discussions/0/2146469724200592093
- https://steamcommunity.com/workshop/filedetails/discussion/2616321716/3424439048258743002
- https://steamcommunity.com/sharedfiles/filedetails/comments/2221529464
- https://wikiwiki.jp/sbarjp/FAQ and https://wikiwiki.jp/sbarjp/%E3%82%A2%E3%83%89%E3%82%AA%E3%83%B3Lua/Callbacks
- https://stormworks.fandom.com/wiki/Wiki/Guides/Lua/Special_Advice_for_Lua
- https://steamdb.info/patchnotes/5558270, https://steamdb.info/patchnotes/5761896
- https://audiokinetic.com/loop-based-car-engine-design-with-wwise-part-1
- https://documentation.beamng.com/modding/vehicle/sections/sounds/engine_audio/
