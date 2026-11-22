# Rillstone — build notes

Measurements and decisions made while building, milestone by milestone. The
benchmarks are the go/no-go checks from `BUILD_BRIEF.md` section 10.

All numbers come from this cloud container: headless Chromium, 4 CPU
cores, and SwiftShader standing in for the GPU (both WebGL and WebGPU). Absolute
times are slower than a real laptop, so use them to compare options, not to
predict real frame rates.

## Benchmark 4: renderer (M0)

`tools/bench/render.html`, run with `node tools/bench.cjs render`. It draws 500
"machines" (4 parts each, shared materials by machine family) with a shadowed
sun at 960×540, and times the CPU side of `renderer.render()` over 200 frames
after a 60-frame warm-up.

| Renderer | 500 machines as separate meshes (2,000 meshes) | Same, as 5 `BatchedMesh`es |
|---|---|---|
| `WebGLRenderer` | **8.3 ms** median (p90 14.0) | **1.6 ms** (p90 3.1) |
| `WebGPURenderer`, WebGPU backend | 14.5 ms (p90 18.6) | 2.4 ms (p90 2.8) |
| `WebGPURenderer`, forced WebGL2 backend | 21.7 ms (p90 29.5) | 2.2 ms (p90 4.5) |

**Decision: ship `WebGLRenderer` for now.** WebGPU costs about 1.7× the CPU per
mesh, and its WebGL2 fallback (which Firefox Android and older devices would
get) about 2.6×. Batching matters far more than the backend, so machines are
drawn as `BatchedMesh`/`InstancedMesh` per material family. Without TSL,
custom shading (terrain triplanar, water) uses `onBeforeCompile` patches on
standard materials and `ShaderMaterial`. Revisit WebGPU when its per-draw
overhead drops.

## Benchmark 2: body count (M0)

`tools/bench/bodies.html`, run with `node tools/bench.cjs bodies` (the query
string goes in `Q=`, e.g. `Q='?shape=box&n=300'`). It pours nuggets into a
10 × 10 × 4 m trimesh pit, 40 per physics step from 5–8 m up, and steps the
Rapier worker until every body sleeps. "Step" is the worker's time per 60 Hz
step while bodies are moving.

| Nuggets | Shape | Asleep after | Step median | Step p95 | Escaped the pit | Step when all asleep |
|---|---|---|---|---|---|---|
| 2,000 | convex hull (8 pts) | 3.9 s | 15.1 ms | 33.9 ms | 12 | 0.48 ms |
| 2,000 | box | 3.1 s | 19.0 ms | 29.6 ms | 0 | 0.46 ms |
| 2,000 | ball | 8.7 s | 9.6 ms | 16.4 ms | 0 | 0.47 ms |
| 2,000, 4 per step | box | 10.4 s | 7.3 ms | 21.0 ms | 0 | 0.48 ms |
| 600 | box | 2.7 s | 2.0 ms | 8.2 ms | 0 | 0.15 ms |
| 300 | box | 2.2 s | 1.3 ms | 7.8 ms | 0 | 0.11 ms |
| 300 | convex hull | 3.3 s | 1.5 ms | 8.6 ms | 4 | 0.14 ms |

(Max step time is 80–110 ms in every run. That's the first step, when the WASM
JIT warms up, not a steady cost.)

**Result: partly a no-go as specified.** 2,000 nuggets do settle and sleep in
3–4 s, and 2,000 *sleeping* bodies cost under 0.5 ms a step. But while all
2,000 are awake at once, the step is 15–19 ms, about 3× the 6 ms budget. With
the brief's own cap of ≤ 300 awake bodies, the step stays around 1.3 ms
(p95 under 8 ms in software).

**Decisions:**
- **Nuggets are boxes, not convex hulls.** Boxes never escaped the pit, and
  hulls let 0.6% through when bodies spawned overlapping. The rendered nugget
  mesh stays lumpy; only the collider is a box.
- **Keep awake bodies ≤ 300** with the pile merge in section 4: more than
  60 items of one material and stage resting within 1 m become one Pile
  entity. A big dump (a bucket or a bin emptied) spawns its contents straight
  into a Pile instead of as hundreds of bodies.
- **No forced freeze.** The brief asks for a forced sleep after 1.5 s at rest.
  Calling `rb.sleep()` ourselves made about a third of the pile sink through
  the floor: a body frozen while its neighbours were still moving lost its
  contacts. Rapier's own sleeping put all 2,000 to sleep within 4 s, so we
  rely on that.
- **Kill floor.** Any body that falls below y = −60 m is frozen and reported to
  the main thread, which puts it back at the nearest claim post.
- CCD made no difference to escapes here and costs a little, so it's off for
  nuggets. It's on only for fast, thin things later (thrown tools, vehicles).

## Physics worker design (M0)

- The worker is started from a Blob URL (`src/js/core/workers.js`). In the
  build, esbuild bundles each worker into a string. In dev, the loader fetches
  the worker module and rewrites its imports: bare names through the page's
  import map (module workers can't read import maps), relative paths into
  Blob URLs of their own rewritten source.
- The main thread drives the clock. Each frame it sends one `step` message
  with the number of fixed 60 Hz steps owed, the player's movement intent and
  any ray/overlap queries. The reply carries the transforms of awake bodies
  (plus a final pose when a body falls asleep) as a transferable
  `Float32Array` of `[id, x, y, z, qx, qy, qz, qw, asleep]`. Only one step is
  in flight at a time, so the player sees at most one frame of latency.
- Request ids travel as `rq` and replies as `re`, so they never clash with
  entity ids (an early bug).
