# Tidewright (working title)

An original browser game in the vehicle-building physics sandbox genre. You build cars (and later boats, planes and helicopters) from 0.25 m blocks in the **Yard**, then press **Test** to drive them on a hilly island in a stormy ocean.

The design brief is [`../research/stormworks/00-REPORT.md`](../research/stormworks/00-REPORT.md). Progress against its roadmap is tracked in [`PROGRESS.md`](PROGRESS.md).

## Run, build, test

```bash
cd tidewright
npm install
npm run dev        # http://localhost:5173 with hot reload
npm test           # vitest: sim-core unit tests + headless Rapier integration tests
npm run typecheck
npm run build      # static site in dist/ (relative paths, host anywhere)
npm run preview    # serve dist/ locally
npm run bench      # Phase 0 physics benchmarks (see docs/phase0-physics.md)
node tools/e2e.mjs out/   # real-Chromium smoke test + screenshots (needs `npm run build` first)
```

The build is a plain static site: `index.html`, one JS bundle, a CSS file, and a module worker that carries Rapier's wasm inline. It needs no special headers (no SharedArrayBuffer and no COOP/COEP). It has **not** been deployed anywhere.

## Controls

| | Keyboard / mouse | Gamepad | Touch |
|---|---|---|---|
| **Yard** | Left click: use tool · drag: orbit · Shift/middle-drag: pan · wheel: zoom · right click: erase | — | tap: tool · drag: orbit · pinch: zoom/pan |
| Tools | B place · X erase · P paint · K eyedrop (or Alt+click) · V inspect · M mirror · `[` `]` move mirror plane | | toolbox buttons |
| Edit | R / T / Y rotate (Shift reverses) · Ctrl+Z / Ctrl+Y undo/redo · Ctrl+S save · F frame · G centre of mass · Enter test | | |
| **Drive** | W/S throttle and brake (hold S at a stop to reverse) · A/D steer · Space handbrake · Q/E shift (manual gear stack) · R reset · C camera · L lamps · I ignition · Esc back to Yard | RT/LT · left stick · A handbrake · LB/RB shift · Y camera · X reset | steering pad, GAS / BRAKE / HAND pedals |

## Boats and weather

Build a hull from Plates, add a Burner engine, a Fuel tank, a Cell battery, a Helm seat, a **Screw** at the stern below the waterline, and a **Rudder** behind it. You can also open the starter **Skiff** from Fleet or New. The Yard's **Float** meter shows the reserve buoyancy; click it to see sealed air (cobalt) and open-top air (lagoon) inside the hull. Vehicles with screws launch at the nearest open water off the Yard pad.

While driving, the top-left sheet sets the **sea state** (− / + or **Storm**, which builds the sea steadily) and the **time of day** (+3 h, pause). The ocean shader and the buoyancy use the same Gerstner wave function, so the waves you see are the waves the hull feels. An open boat swamps if its gunwale goes under.

## Code map

```
src/
  sim-core/     pure TypeScript, no DOM; unit-tested in vitest
    parts.ts          data-driven part catalogue (original names)
    rotations.ts      the 24 cube rotations
    grid.ts           sparse block grid, multi-cell parts, mirror placement
    history.ts        undo/redo commands
    vehicle-format.ts versioned file format (schemaVersion/physicsVersion, migrations, gzip)
    greedy.ts         greedy box merging for colliders
    assembly.ts       grid -> VehicleModel (mass, CoM, inertia, wheels, drivetrain)
    validator.ts      errors/warnings with the offending part ids ("Show" in the Yard)
    budget.ts         budget bar numbers
    terrain.ts        deterministic island heightmap (shared by worker and renderer)
    tyre.ts, drivetrain.ts, vehicle-sim.ts   raycast wheels, engine/clutch/gears/diff, buoyancy, screws, rudders
    waves.ts          Gerstner ocean shared by CPU and shader
    hydro.ts          hull analysis (sealed/open air), buoyancy points, thrust and plate maths
    presets.ts        starter vehicles
  physics/      PhysicsBackend interface, Rapier backend, SimHost, worker, main-thread client
  render/       toon materials, vehicle mesher (greedy faces + voxel AO + outlines), terrain, Gerstner ocean, sky, scenery
  editor/       Yard editor, orbit camera, voxel picking
  game/         island world + test-drive session (camera, HUD, touch controls)
  input/        keyboard + gamepad + touch -> Controls
  storage/      IndexedDB fleet library
  ui/           DOM helpers and the "Survey sheet" stylesheet
tools/          e2e smoke test, physics benchmark
docs/           design notes (Phase 0 physics decision)
```

## Originality

All names, art and UI are original: procedural geometry, vertex colours, canvas textures and CSS, with no downloaded game assets. The game is a genre piece; it does not copy any existing game's names, look, map or text.

## Third-party libraries

three.js (MIT), Rapier / `@dimforge/rapier3d-compat` (Apache-2.0), Vite, TypeScript, vitest (MIT / Apache-2.0).
