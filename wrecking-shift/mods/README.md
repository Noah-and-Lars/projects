# Wrecking Shift mods

Every file `mods/<category>/<id>.mod.ts` is one mod. It is bundled into the game at build time (no runtime file
loading, so mods also work in the single-file build) and shows up in **Mods** (title screen and pause menu), where
players switch it on or off (remembered in the browser).

```ts
import { defineMod, MAT, place, vox, pal } from '../../src/mods/kit';

export default defineMod({
  id: 'my-mod',               // unique, kebab-case, same as the file name
  name: 'My Mod',
  category: 'props',          // props | tools | vehicles | maps | modes | global | visual
  author: 'Wrecking Shift',
  description: 'One or two sentences shown in the Mods menu.',
  props: [...], tools: [...], vehicles: [...], maps: [...], modes: [...], global: {...}, visual: {...},
});
```

Types: `src/mods/api.ts`. Helpers: `src/mods/kit.ts` (re-exports `src/sim/build.ts`, `MAT`, `pal`, `VoxelGrid`,
`levelKit` = `src/sim/levels/kit`, `tools` = `src/sim/tools`, `carBlueprint`).

| contributes | what the player gets | how |
|---|---|---|
| `props` | entries in the sandbox spawn menu (B) | `spawn(sim, pos, yaw)`: build with `vox(sx, sy, sz, g => ...)` and `place(sim, grid, pos, yaw, name)` (bottom centre at `pos`, dynamic; `{ static: true }` anchors it). Tag `'explosive'` + `MAT.explosive` voxels explode. |
| `tools` | extra tools on the belt in sandbox and in mod game modes | `variant(tools.Shotgun, { id, name, pellets: 16, ... })` tunes a built-in tool, or subclass `Tool` (`src/sim/tools/tool.ts`) and set `look` to a built-in tool id for the view model / sounds. |
| `vehicles` | drivable vehicles in the spawn menu | `blueprint: () => carBlueprint({ id, name, style, length, width, paint, ... })` (`src/mods/vehicleKit.ts`). |
| `maps` | sandbox maps (Sandbox list) | `siteMap({ id, title, ground, hills, sky, water, spawn, build(sim, rng, h) })` builds ground + bounds; place content in `build`. |
| `modes` | playable game modes ("Play" in Mods) | `{ id, title, rules[], level, create: () => rules }`; templates `wreckQuota`, `checkpoints`, `collect`, `survive`, `demolish`, `topple`, or your own `ModeRules`. |
| `global` | rule tweaks applied to every level | `apply` / `tick` / `revert` get `{ sim, player, level, fire, belt, tick }`. Always undo in `revert`. |
| `visual` | look tweaks | `{ saturation, contrast, vignette, timeOfDay, fov, cssFilter }`. |

Rules:
- Sim code is deterministic: randomness from `sim.rng` or the `rng` passed to `siteMap.build`, never `Math.random`.
- Voxel = 0.1 m. Grid coords `g.set(x, y, z, pal(MAT.x, shade 0..4))`; y up. Keep props under ~60k voxels.
- Mods that change the same system set the same `conflicts` key (`'gravity'`, `'grade'`, `'time'`...): only one of
  them can be on.
- `tests/unit/mods.test.ts` builds every map, spawns every prop and vehicle (and drives it), uses every tool,
  runs every mode and applies / reverts every rule tweak. Run it with `npx vitest run tests/unit/mods.test.ts`.
- Everything must be original: own names, designs and content. No real brands, no trademarked vehicles, nothing
  copied from other games or their mods.
