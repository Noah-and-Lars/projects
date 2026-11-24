# Wrecking Shift — progress log

Branch: `teardown-voxel-game`, folder: `wrecking-shift/`. Research files: `docs/research/` (all 10 received via the
research session's artifact; lighting prototype source in `docs/research/lookproto/`).

## Status by milestone
- M0 Scaffold — done.
- M1 Voxel world — done (materials/palette, greedy mesher + AO, levels, first-person controller).
- M2 Carving — done (hardness radii, fracture pattern, chips).
- M3 Connectivity & debris — done (island search, split to dynamic voxel bodies, budgets, impact damage,
  structural crush check = overloaded supports fail).
- M4 Tools — in progress (agent).
- M5 Fire & smoke — in progress (agent).
- M6 Vehicles — in progress (agent).
- M7 Heist loop / HUD / menus — in progress (agent).
- M8 Audio — merged (procedural WebAudio bank, music cues; balanced by numbers only, not by ear).
- M9 Look upgrade — in progress (agent).
- M10 Content — harbour map geometry done; two more maps in progress (agent); missions pending the mission framework.
- M11 Extras — water buoyancy + swimming/drowning done; security drones pending.

## Known issues
- `tests/unit/mesher.test.ts > is fast enough` is timing-based and can fail when the machine is busy.
- M0 Scaffold — done (Vite + TS + three + Rapier, Vitest, Playwright smoke harness, `window.__game`).
- M1 Voxel world — basic version done (materials/palette, greedy mesher + AO, test level, first-person controller).
- M2 Carving — basic version done (sledge / gun / bomb placeholders, hardness radii, chips).
- M3 Connectivity & debris — core done (island search, split to dynamic voxel bodies, budgets).
- Heist framework (missions, alarms, escape, score), progression (ranks / unlocks / upgrades / settings), HUD, menus,
  map view - done (demo heist "Housewarming" + "Shed Happens" on the test yard).
- M4+ — not started.

## Notes for the morning
- Nothing was blocked by approval prompts so far.

## Timeline notes
- ~13:10–16:20 UTC: the account's 5-hour usage limit was hit; the vehicles, lighting and extra-maps agents were
  interrupted mid-work (their worktrees were kept) and resumed at 16:22 UTC. Nothing was lost, ~3 h of wall time were.
- Merged so far: audio, fire & smoke, 14 tools + grab, heist missions/HUD/menus/progression, 5 harbour missions.
