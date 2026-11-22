# Stormworks: Build and Rescue - Multiplayer and Networking (genre reference)

Research note for designing an ORIGINAL vehicle-building physics sandbox. Mechanics and numbers only; nothing copied. Confidence is flagged where a claim comes from a hosting company (commercial interest) or inference. The official wiki (Fandom) returned HTTP 402 and SteamDB patch-note pages returned 403 on direct fetch, so patch-note facts are via search-result summaries and should be re-verified.

## Summary
- Model: one authoritative simulation host (a player-hosted listen session or a separate dedicated server). Physics runs on the server and results are streamed to clients (patch notes, v1.4-era overhaul). Clients do not run their own authoritative vehicle physics.
- Max players: 32 (dedicated config range 1-32). Hosts advise 8-16 for heavy vehicles, 12 as a ceiling for Workshop-heavy "playground" servers.
- Network: UDP, default port 25564 plus the next two (25565, 25566). Steam-based identity (Steam IDs, peer IDs).
- Scale problem: vehicles contain hundreds of moving physics bodies and hundreds of logic components that must replicate. Devs cut bandwidth 60-80% with a new vehicle replication technique, a proprietary compression algorithm and lower protocol overhead (v1.4.15).
- Biggest practical limiter: vehicle complexity and abandoned vehicles on the server CPU, not bandwidth per se.
- Admin: peer-ID based ?commands (kick, ban, add_admin, add_auth, save), an auth flag gating vehicle spawning, admins list by Steam ID in the config, and Lua addons for everything else (roles, teleport, clear vehicles).

## Detailed findings

### Hosting model
- Player-hosted multiplayer (host in-game, friends join) and a standalone dedicated server executable (Steam-distributed) both exist. Both are authoritative-host designs; the dedicated build removes the host player's own rendering/CPU burden.
- Dedicated servers register with a master list (hosts note a delay after start before appearing in the in-game browser). Direct connect by IP:port also works (e.g. 192.168.1.1:25564).
- Version must match exactly between server and clients; beta-branch players cannot join non-beta servers.

### server_config.xml (as reported by hosting guide low.ms)
| Setting | Default | Notes |
|---|---|---|
| name | "Stormworks" | browser name |
| password | empty | empty = public; case-sensitive |
| max_players | 32 | range 1-32; lowering does not kick connected players |
| seed | random | world generation seed |
| save_name | empty | picks/creates save; wrong name loads a different/empty world |
| base_island | empty | start island data file, new saves only; wrong filename silently falls back to default |
| day_night_length | 60 (minutes) | profiles suggest 30-180 |
| override_weather / override_time / override_wind | unset | 0-1 float etc. |
| physics_timestep | 180 | 60/120/180/0 (auto); higher = more accurate, more CPU |
| port | 25564 UDP | also uses +1, +2 |
| despawn_on_leave | true | removes character on disconnect |
| wildlife_enabled | true | |
| admins | none | `<admins><id value="steamid"/></admins>`; one host rebuilds it from a startup parameter each boot |
| playlists / mods | - | Workshop IDs in config; clients must subscribe to same items |
Older forum posts show an attribute-style `<server_data ... max_players="5">` format, so the schema has changed across versions.

### Physics synchronisation
- Patch history (SteamDB mirrors): an early overhaul made multiplayer stop slowing to the slowest client by computing physics on the server and sending results to clients. v1.4.15: new vehicle replication technique, proprietary vehicle-data compression, reduced protocol overhead, "multiplayer time dilation algorithm overhaul", bandwidth down 60-80%, fixed "vehicles appearing delayed". v1.6.11: heavily optimised client simulation for desync and input delay, enabling more complex vehicles/animals/zombies; servers not changed, so large creations still slow everyone. v1.7.2: fixed client sync issues with dynamic objects (twilight-zone lag/damage).
- Time dilation: when the server cannot keep up the whole world slows (slow-motion) rather than desyncing; devs acknowledged slow-motion complaints and attribute them to detailed physics sim.
- Input lag: clients see their own vehicle responses after a round trip; some sim/network conditions add input delay (dev statement). Vehicles with seats driven by remote players are the hard case.
- Desync causes per host guide: long sessions, 200 ms+ ping, vehicles with many articulating parts or fluid systems, heavy load.

### Limits and performance
- No official vehicle/component cap. Guidance: an "800-component aircraft carrier" can lag a server; "a dozen abandoned vehicles" noticeably degrades performance; large blueprint spawns freeze the server briefly; RAM grows over long sessions, restart busy servers every 6-12 h.
- Player-count profiles: Engineering 2-8 (max 8-12), Rescue ops 4-16, Community hub 16-32, Workshop playground 4-12.
- No published per-player bandwidth figure found.

### Permissions, admin, anti-grief
- Concepts: admin (full commands), auth (permission to spawn/edit vehicles and use build tools), neither (basic play). Admin/auth flags are exposed to scripts via the player list (peer id, name, Steam ID, admin, auth).
- Commands (all take peer_id, not name): ?kick, ?ban (no vanilla ?unban reportedly), ?add_admin/?remove_admin, ?add_auth/?remove_auth, ?save [name]. Admin list can be preseeded by Steam ID.
- Older patch note: admin must authorise players to spawn vehicles; advice to authorise only trusted users and clean vehicles up before leaving.
- Addon Lua API (server.addAdmin/addAuth/kick/ban, player list, chat commands) enables third-party moderation. Carsa's Commands v2 (archived): 50+ commands (equip, teleport to named locations, heal, battery charge, improved ban, teleport to seat), first joiner on a dedicated server becomes owner (override via OWNER_STEAM_ID), role grants.
- Host guidance on griefing: password for small groups, multiple trusted admins across time zones, enforced vehicle complexity rules, bans, test Workshop content on a separate save.

### PvP vs co-op, economy, saves, mods
- Game is primarily co-op/sandbox; PvP is emergent via custom playlists/addons rather than a first-class mode. Career mode uses a predefined hardcore ruleset; custom mode exposes toggles. I found no source detailing shared-vs-individual career money in MP (open question).
- Saves live on the server (save_name); `?save` forces a save; forced shutdowns skip the final save; hosts offer cloud backups. Corruption and full disks are listed causes of lost worlds.
- Workshop: two content types on servers, playlists (missions/scenarios, can carry scripts) and mods; configured by ID in server_config.xml; clients must have the same subscriptions; mismatched or outdated IDs are the most common startup failure.
- Community servers: popular server-side scripting is mostly roleplay/command suites (e.g. an SCP roleplay community documents its server addon list); specifics not captured.

## Player-facing pain points
- Slow-motion world when server is overloaded; rubber-banding and delayed vehicles at 200 ms+.
- Input delay when driving.
- One heavy vehicle slows everyone; abandoned vehicles accumulate.
- Desync growing over long sessions; need for periodic restarts.
- Workshop subscription mismatches and version mismatches blocking joins.
- Moderation is peer-ID based and clumsy; no vanilla unban.

## Known problems to avoid
1. Whole-world time dilation tied to the slowest-to-simulate entity: one big vehicle degrades all.
2. No per-player or per-vehicle budget at spawn time; enforcement left to admins.
3. Memory/desync accumulation requiring restarts.
4. Config schema drift and silent fallback on bad filenames.
5. Name-free admin commands (peer IDs) and missing unban.
6. Spawning large blueprints blocks the sim thread.
7. Client content must exactly match server (no auto-download or hash handshake described).

## Implementation notes for our original game
Architecture (physics vehicles, browser + native):
- Authority per vehicle: server owns the world step. Optionally give the driver authority over their own vehicle's input only (never state) to cut latency perception; AI/unoccupied vehicles server-only.
- Fixed tick (e.g. 60 Hz sim, 20-30 Hz snapshots). Input forwarding: client sends timestamped input frames (throttle, steering, buttons, logic-bus inputs) each tick, redundantly (last 3-5) over unreliable channel; server applies at tick N.
- Snapshots: per-vehicle root body (pos, quat, lin/ang vel) at 20-30 Hz; child/articulated bodies (hinges, pistons, wheels) as joint-space values (angle/extension) instead of full transforms; reconstruct locally. Quantise (positions 16-bit relative to chunk, quats smallest-three 32-bit, velocities half-float). Delta-compress against last acked snapshot with per-field dirty bits; interest management by distance/priority bucket (far vehicles 5-10 Hz).
- Client: render ~100 ms behind with snapshot interpolation; short extrapolation cap (~200 ms); own vehicle: predict locally with the same deterministic-ish solver and reconcile by smoothing error (blend corrections over several frames; hard snap above threshold). Avoid rolling back complex constraint solves; correct visually instead.
- Logic/microcontroller state: run on server only, replicate only outputs visible to others (lights, gauges for the seated player); drastically reduces the "hundreds of components" cost seen in Stormworks.
- Time dilation: prefer per-island/per-vehicle sub-stepping budgets and a hard vehicle complexity budget (cost points per part) enforced at spawn, with queued/async spawning to avoid hitches; slow-mo as last resort.
- Spawning/blueprints: stream vehicle definitions as compact part-graph, content-hash cached, deduplicated across clients.
- Transports: native dedicated server over UDP (ENet/Steam Sockets/QUIC-style with own reliability layers: unreliable snapshots, reliable ordered events). Browser: WebSocket (TCP, head-of-line blocking, simplest, acceptable for small lobbies) or WebRTC DataChannels with `ordered:false, maxRetransmits:0` (UDP-like; needs signalling and a relay/TURN; use a server-as-peer topology, not mesh). WebTransport is a future/native-quality option where supported. Run the same server logic compiled headless (Node/Rust/WASM) so listen-server = in-process server.
- Data structures: `Snapshot{tick, ackTick, vehicles[{id, flags, rootState, jointStates[], dirtyMask}]}`, ring buffer of last 64 snapshots per client for delta baselines, `InputFrame{tick, seq, axes[], buttons}`, entity id allocator with generation counters, per-client relevance sets.
- Admin: stable account IDs and display names (commands accept names and ids), roles with permission bitsets (build, spawn, drive, moderate), unban, audit log, per-player vehicle quota, owner-tagged vehicles with auto-despawn timer after owner leaves, vote-kick, whitelist, rollback/auto-save intervals, content-hash handshake and automatic mod download.
- Server config as versioned, validated schema with explicit errors (no silent fallbacks).

## Open questions
- Exact replication technique and rates in Stormworks (proprietary; not documented publicly).
- Whether career MP money is shared per server (not found).
- Per-player bandwidth numbers and server CPU scaling.
- Official dedicated-server wiki details (blocked in this session).
- Which community servers are most popular and their rule sets.

## Sources
- https://low.ms/knowledgebase/stormworks-server-configuration (config table, ports, commands)
- https://low.ms/knowledgebase/stormworks-troubleshooting (desync/lag causes, 200 ms)
- https://low.ms/blog/best-stormworks-server-settings (player profiles, restart cadence, vehicle guidance)
- https://xgamingserver.com/docs/stormworks/max-players and https://xgamingserver.com/docs/stormworks/configure-your-server
- https://steamdb.info/patchnotes/8523593 and https://steamdb.info/patchnotes/10270058 (v1.4.15 / v1.6.11 multiplayer notes, via search summaries)
- https://steamdb.info/patchnotes/5827478 (addon API player list, admin/auth flags)
- https://wikiwiki.jp/sbarjp/%E3%82%A2%E3%83%89%E3%82%AA%E3%83%B3Lua/Misc (addon Lua admin functions)
- https://github.com/carsakiller/Carsas-CommandsV2
- https://scproleplay.com/docs/server-addons/
- https://steamcommunity.com/app/573090/discussions/0/2266942917219275560 (config format thread)
