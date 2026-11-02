# Siege graphics copy: asset pipeline

`siege-copy/` is a work copy of `siege/` for a realistic look: photo textures, real furniture models and lighting baked
in Blender. Collision, layouts, bomb sites, bot navigation and lights are unchanged (`same_obs.js` checks that against
`siege/`), so the copy plays exactly like the live game and stays compatible online.

Everything here runs headless. Blender 5.2 (`blender -b`), Python 3 with Pillow, Node with Playwright, and a local
web server at the repo root: `python3 -m http.server 8123 --bind 127.0.0.1`.

## What the game loads (`../assets/`)

- `tex/<key>.jpg` (colour) and `tex/<key>_n.jpg` (R, G = OpenGL normal, B = roughness) for every surface key in
  `sgTextures()`, plus `tex/tex.json` (metres per tile). `sgxLoadTextures()` swaps them in over the drawn textures,
  and `worldUV()` uses the normal and roughness for relief and sheen. If the files are missing, the drawn textures stay.
- `models/<name>.glb`: furniture, one baked texture each (colour times ambient occlusion). `models/models.json` lists
  them. `SGX_SWAP` says which furniture items become which models. The item still registers every collision box it
  always had; only the boxes it replaces aren't drawn. Chandeliers are hung by `sgxHangModels()` in `sgBuildDecor()`.
- `light/<map>.bin`: the Cycles bake. Per static mesh (`st:<material>`) and per model mesh (`md:<name>`), RGB per
  vertex, plus one value per wall chunk face (`pr`). `sgxBaked()` uses a segment only when its size matches what the
  game built; otherwise the old `sgLightAt()` formula lights it. People and drones are still lit by `sgLightAt()`.

## Rebuilding

1. Textures (CC0, Poly Haven and ambientCG):
   `python3 -I tex_dl.py <dl> ph:<id> acg:<id> ...`, then `python3 -I tex_pack.py <dl> ../assets/tex`.
   The key to asset choice, scale and colour grading is the `KEYS` table in `tex_pack.py`.
2. Models (CC0, Poly Haven): `python3 -I model_dl.py <models> <id> ...`, then for each line of `models.txt`
   (`name id max_tris tex_px`): `blender -b --python sg_model.py -- <models>/<id>/<id>_1k.gltf <glb>/<name>.glb <tris> <px> [preview.png]`.
   It joins and decimates the model and bakes its materials and AO onto one atlas. Copy the ones in use to
   `../assets/models/` and list them in `models.json`.
3. Light: `node dump_map.js siege-copy/index.html <bake> hotel,port,manor` exports each map built with models.
   Then for each map: `blender -b --python sg_bake.py -- <bake> <map> ../assets/light/<map>.bin 96`.
   Ceiling fixtures are downward spot lights and wall lamps are point lights. Corners at the same place are welded,
   wall chunks are smoothed across their wall, and brightness is matched to the game's own (median) so dark corners
   stay about as dark as before. **Re-run the dump and the bake whenever map geometry, furniture or `SGX_SWAP` changes.**
4. Check: `node same_obs.js` must print SAME for every map. `node shot.js <page> <out> hotel,port,manor` renders
   fixed views, and `python3 -I cmp.py <a> <b> <out.jpg> <names...>` puts two sets side by side.

All downloaded assets are CC0, so no attribution is required. They're credited to the sites (Poly Haven, ambientCG)
without personal names, as the arcade's rules ask.

## Operators, hands and animation

- `assets/chars/op_<cauc|afr|asian>.bin` + textures: realistic operators. `sg_human.py` (Blender) reads MakeHuman's CC0
  data directly (base mesh, shape targets, the `male1591` body proxy, skins, eyes, eyebrows, the casual suit recoloured
  as a uniform, `shoes03` boots, the short gloves of the gloves pack; no MakeHuman code is run), adds our own plate carrier,
  helmet, ear protection, knee pads and carbine, poses the arms on the carbine with IK and curls the fingers, makes
  heat weights and maps them to the game's parts (torso, head, thighs, shins, arms), bakes AO, and writes one file per
  build. `tex_chars.py` makes the textures (uniform and gear neutral grey so each operator's colours tint them).
  Inputs: the system asset pack and gloves pack from static.makehumancommunity.org (both CC0) and `base.obj` plus the
  `macrodetails` targets from the makehuman repository.
  In the game, `sgxPerson()` builds the same groups `sgPerson()` always had (positioned at the model's joints), with a
  bone in each, and one SkinnedMesh per material zone; `sgxVariant()` picks a build per operator. Hit boxes don't change.
- `sgAnimPerson()` (third person): walk/run cycle with knee bend and hip sway, strafing, crouch walk, recoil, reload,
  sprint carry, a knees-first death fall. It takes the player as an optional last argument.
- `sgxViewAnim()` (first person): springs for sway, recoil (`sgxKick`) and landing; bob, sprint pose, idle breathing,
  draw; reloads move the magazine (`rig.mag`/`magDir`) and the free hand (`rig.arms.left`), shotguns load shells at the
  port, slides/pumps/bolts cycle after shots. Gloves and sleeves use `assets/tex/hand_*` (leather, canvas, normal maps).
- Checks: `charshot.js` (operators line-up), `vmtest.js` (the held gun through a reload, no match needed), `smoke.js`.
