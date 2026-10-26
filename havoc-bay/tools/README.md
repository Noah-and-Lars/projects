# Havoc Bay model tools

The realistic aircraft, ships, naval guns and the soldiers' rifle in `../models/` are Sketchfab models
(all CC Attribution). These scripts download them and turn them into small game-ready `.glb` files.
The game loads them on Medium and High graphics; Low keeps the original block models.

## Setup

```
cd havoc-bay/tools
npm install
```

Put your Sketchfab API token (sketchfab.com → Settings → Password & API) in `tools/.skfb_token`
or `$SKFB_TOKEN`. It is git-ignored: never commit it.

## Building

1. `python3 -I skfb_dl.py <uid> ...` downloads models into `skfb-dl/<uid>/` (git-ignored).
2. `models.json` lists every game model: Sketchfab `uid`, the rotation that points it +z (nose, bow or
   barrel) with +y up, its size in game units, triangle and texture budgets, parts to leave out (`drop`),
   and parts the game moves (`spin` for propellers, `pitch` for a gun's elevating part). Its `game`
   object is copied into `../models/models.json` for the game: team tint strength, materials to leave
   untinted (`keep`), afterburner positions (`flames`), a ship's gun spots (`guns`), a gun's elevation
   pivot and muzzles (`pivot`, `muzzles`, model space), the rifle's place in the hand (`hold`).
3. `node build.mjs [id ...]` builds `../models/<id>.glb` and the far version `<id>-lo.glb`
   (simplified with meshoptimizer, WebP textures, quantized meshes that three.js r128 reads without a
   decoder) and rewrites `../models/models.json`, including each model's credit.
4. `node view.mjs <file.glb> <out.png>` renders any model from four sides and lists its nodes and
   materials, for setting `rot`, `drop`, `spin` and `pitch`.
5. `node shot.mjs <out-prefix> <test.js> [quality]` opens the game in headless Chromium and saves the
   pictures a test script draws (it can call the game's own functions, such as `new Plane(...)`).
   `HB_MODELS=<dir>` serves another folder as `models/` for test builds.
6. `node jscheck.mjs ../index.html` syntax-checks the page's inline scripts after an edit.

## How the game uses them

`REAL` in `index.html` loads `models/models.json` and every model in it. `buildPlaneModel`,
`buildShipModel`, `buildTurretModel` and `makeAvatar` build the block models first and call
`REAL.onReady`, which swaps the real one in as soon as it has loaded (`useRealPlane`, `useRealShip`,
`useRealGun`). The game's own hit boxes, gun yaw and pitch groups and muzzles stay, so gameplay does
not change. The credits show in Settings.
