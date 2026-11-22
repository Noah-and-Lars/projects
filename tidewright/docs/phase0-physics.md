# Phase 0 spike: physics engine decision

**Decision: Rapier (`@dimforge/rapier3d-compat` 0.19.3) in a Web Worker, behind `PhysicsBackend`.**
Jolt stays the documented fallback for joint-heavy builds. It has not been benchmarked yet (see "Not done").

## Measurements

Machine: the cloud build container, a 4-core Intel Xeon @ 2.1 GHz, Node 22, single thread.
Browsers run the same wasm, so expect numbers within about 1.5× of these on a 2020+ laptop.

| Scenario | Bodies | Colliders | Joints | Step / tick (median) | p95 |
|---|---|---|---|---|---|
| 20 jointed vehicles, **unmerged** 300 cell colliders each (`tools/physics-bench.mjs 20 300`) | 140 | 6,121 | 120 | 5.20 ms | 7.36 ms |
| 20 jointed vehicles, **greedy-merged** to 15 boxes each (`tools/physics-bench.mjs 20 15`) | 140 | 421 | 120 | 0.51 ms | 0.82 ms |
| 20 Runabout cars, raycast wheels + full drivetrain, island heightfield, 2 substeps/tick (`BENCH=1 vitest run src/physics/bench.test.ts`) | 20 | 281 | 0 | 1.65 ms | 2.82 ms |

Budget from the brief: physics ≤ 4 ms/tick on desktop.

## Findings

1. **Collider count dominates, not joints.** Greedy box merging (`sim-core/greedy.ts`) cut the step time by about 10×. Vehicles must never ship one collider per block.
2. 120 revolute joints with motors were stable at 4 solver iterations and 60 Hz in this spike.
3. Raycast wheels (no wheel bodies) plus our own tyre and drivetrain model are cheap. Twenty cars with 2 substeps each fit comfortably inside the budget.
4. The worker's catch-up cap (4 ticks) plus time dilation keeps the main thread smooth when a spike happens.

## Not done / follow-ups

- The Jolt comparison (`jolt-physics` wasm) is not done. Run it when Phase 3 adds joint-heavy rigs (rotors, servos, rams), as the brief's risk list suggests. `PhysicsBackend` is the swap point.
- These numbers come from a server CPU, not a phone. Phone-class numbers are still to measure; the plan is a 30 Hz simulation tier.
