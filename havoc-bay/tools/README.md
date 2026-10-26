# Havoc Bay model tools

The realistic aircraft, ships, naval guns and the soldiers' rifle in `../models/` are Sketchfab models
(all CC Attribution, credited in Settings). These scripts download them and turn them into game-ready
`.glb` files. The game uses them on Medium and High graphics; Low keeps the original block models.

## The models

| Game id | In the game | Model |
|---|---|---|
| `fighter` | Fighter | F-16E/F Fighting Falcon |
| `jet` | Jet | F/A-18E/F Super Hornet |
| `bomber` | Bomber | B-2 Spirit |
| `ship_jetski` | Jet Ski | Kawasaki Ultra 310X |
| `ship_gunboat` | Turret Boat | M21 patrol boat |
| `ship_destroyer` | Destroyer | Arleigh Burke class (DDG-51) |
| `ship_battleship` | Battleship | USS Missouri, 1991 (full 1.5 million triangles; far version from the USS New Jersey) |
| `ship_carrier` | Aircraft Carrier | USS Gerald R. Ford |
| `gun_aa` | Anti-air guns (ships, harbors, islands) | Phalanx CIWS |
| `gun_main` | Ship cannons | 5-inch Mk 45, cut out of the destroyer model |
| `gun_big` | Battleship turrets, coastal cannons | 16-inch turret, cut out of the Missouri model |
| `gun_mg` | Machine guns | M2 Browning |
| `rifle` | Soldiers' rifle | HK416 A7 |

No personal names may appear on the site, credits included, so pick models whose Sketchfab username is a
handle, not a real name.

## Setup

```
cd havoc-bay/tools
npm install
```

Put your Sketchfab API token (sketchfab.com → Settings → Password & API) in `tools/.skfb_token`
or `$SKFB_TOKEN`. It is git-ignored: never commit it.

## Building

1. `python3 -I skfb_dl.py <uid> ...` downloads models into `skfb-dl/<uid>/` (git-ignored).
2. `models.json` describes every game model (see its `_doc`):
   - `uid`, `rot` (degrees that point the nose, bow or barrel to +z with +y up), `size` (axis and length in
     game units), `align` (`center`, `bottom`, or `keep` for a ship modelled with its waterline at 0) and
     `origin` (a final move, e.g. down to the waterline);
   - `tris` / `lo` triangle targets and `tex` / `loTex` texture sizes for the near and far versions;
     `loFrom` builds the far version from another model (the battleship's comes from the New Jersey);
   - `drop` (regex on node, mesh or material names), `crop` (keep a box, download coordinates), `cut`
     (remove boxes, game units: a ship's own guns where the game puts its turning ones) and `keepBox`
     (keep only a box, game units: one turret taken out of a whole ship);
   - `spin` (propellers), `pitch` (a gun's elevating part, by name, matching materials too) or `pitchBox`
     (the same by box), and `muzzle` (barrel tips, by name);
   - `game`, copied into `../models/models.json`: `tint` (0: models keep their own colours), `keep`,
     `flames` and `flameSize` (afterburners), `sound`, a ship's `guns` (`{ at, scale }` per gun mount, or
     `"hide"`), `missile`, `deck` (the carrier's real flight deck height), a gun's `pivot` and `muzzles`, the
     rifle's `hold`. A gun's pivot and muzzles found by `pitch` / `muzzle` are written automatically.
3. `node build.mjs [id ...]` builds `../models/<id>.glb` and the far version `<id>-lo.glb` (meshoptimizer
   simplification, with a rougher position-merged pass when seams stop it; WebP textures; quantized meshes
   that three.js r128 reads without a decoder) and rewrites `../models/models.json` with each credit.
   The full battleship needs `node --max-old-space-size=8192 build.mjs ship_battleship gun_big`.

## Looking at models

- `node inspect.mjs <file>` lists a download's node tree, triangle counts, bounds and materials.
- `node view.mjs <file> <out.png>` renders a model from four sides.
- `node plan.mjs <file.glb> <out.png> [width]` draws a measured side and top view (game units, bow to the
  right) for placing gun mounts and cut boxes.
- `node shot.mjs <out-prefix> <test.js> [quality]` opens the game in headless Chromium and saves the
  pictures a test script returns (it can call the game's own functions, such as `new Plane(...)` or
  `step(1/30)`). `HB_MODELS=<dir>` serves another folder as `models/`; `HB_PRE` runs setup code first.
- `node jscheck.mjs ../index.html` syntax-checks the page's inline scripts after an edit.

## How the game uses them

`REAL` in `index.html` reads `models/models.json` and downloads each model the first time something asks
for it, so the big battleship only loads when one is built. `buildPlaneModel`, `buildShipModel`,
`buildTurretModel` and `makeAvatar` build the block models first and call `REAL.onReady`, which swaps the
real one in as soon as it has loaded (`useRealPlane`, `useRealShip`, `useRealGun`). Far away, ships and
planes switch to their light versions (`THREE.LOD`). Hit boxes, gun yaw and pitch groups and muzzles stay,
so gameplay does not change. Reflections come from a grey version of the game's sky (`env()`), and metal is
capped so nothing turns into a sky-blue mirror.
