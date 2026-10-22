# Brief for the game-code session (index.html) on branch `models-copy`

Rules: work only on branch `models-copy`. NEVER push to `main` or to `claude/jimmyscafe-projects-access-9mbcw3`
(GitHub Pages serves that one — it is the live site). Nothing here is live. Another session (on the user's PC, driving
Blender + Sketchfab) commits model files (`free-criminal-copy/models/*.fcm`, `models/tex/*`, `models/credits.json`) and
Blender scripts to the same branch; it does NOT edit `index.html`, so this session owns `index.html`. Pull before each
commit; commit small and often, with the line `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`. Never add
the user's name or contact details to the site. Read `NOTES.md` in this folder first.

Context: `free-criminal-copy/index.html` is a copy of Free Criminal (single-file three.js r128 game). It already has
`parseFCM`, `loadModels` (awaited in `boot()` before `buildWorld`), `makeCarModelM` (cars from models; paint = magenta
vertex-colour marker swapped in the shader via the `FC_PAINT` define + `fcPaint` uniform in `fcCompile`,
`carPaint(color)` materials; LOD parts `body`/`mid`/`lo` swapped in `syncCar`; `lamp` part doubles as the night mesh;
shared `wheel.fcm` scaled per car via `wheelM(r, side)`), and the old code-built cars as fallback. Guns are code-built
geometries from `gunGeo(k)` assigned to `WPN[k].geo` (vertex colours, shared `GUN_MAT`), used by `setGunModel()` (third-
person `P.rifle`, first-person `vm`, muzzles at `w.len`); NPC cops hold `PISTOL_GEO`; `HOLD` positions the first-person
hands per gun. The .fcm format: 'FCM1', uint32 header length, JSON header `{parts:{name:{v,i,po,no,co,io,i32,uo?,tex?}},
meta?}`, then per part float32 positions, int8 normals (/127), uint8 colours (/255), optional float32 uv at `uo`,
uint16 (or uint32 if `i32`) indices. There is no browser in the cloud: keep the game parseable at every commit
(`node --check` on the extracted script or equivalent) and keep every fallback.

Tasks:
1. Texture support: `tex` = file name under `models/tex/`; load with `THREE.TextureLoader` (default flipY; match the
   renderer's output encoding; anisotropy like `canvasTex`), store as `geo.userData.tex`; pass `meta` through as
   `out.meta`; `loadModels` tolerates late textures.
2. Guns: add `'guns'` to `MODEL_NAMES` (`models/guns.fcm`, one part per key: rifle, pistol, revolver, smg, pump,
   carbine, dmr, auto, sniper, lmg, gl, knife; missing keys keep the code-built gun). After loading, set `WPN[k].geo`,
   apply `meta.guns[k].len` to `WPN[k].len` and merge `meta.guns[k].hold` into `HOLD[k]`. Add `gunMesh(w)`: a per-gun
   cached `lit(new THREE.MeshPhongMaterial({map: w.geo.userData.tex, vertexColors: true, shininess: 30,
   specular: 0x222222}))` when textured, else `GUN_MAT`; use it in `setGunModel()` for both meshes. NPC pistol: helper
   `npcPistol()` using `WPN.pistol.geo` when loaded (rotation.x = PI/2 so the muzzle points down the arm, position
   (0, -0.72, 0.03)); `PISTOL_GEO` as fallback.
3. Cars with their own wheels: in `makeCarModelM`, when the model has a `wheel` part and `meta.wheels` (four [x,y,z]
   wheel centres, x right / y up / z forward) place the pivots there, use the model's wheel geometry (right-hand wheel;
   mirror for x<0 like `wheelM`: scale x by -1 and flip triangle winding), skip the caliper, set `wg.near/nearL` so
   `syncCar` keeps working; `blur`/`far` may stay the code-built ones scaled to `meta.wr`.
4. Credits: `CREDITS` array near `VERSION`, shown as a small "Credits" section from the main menu (styled like the
   existing panels); prefer loading `models/credits.json` when present. Entries `{what, title, author, url, licence}`;
   the current list (all Sketchfab, "CC Attribution") is at the end of NOTES.md. Use
   `https://sketchfab.com/3d-models/<slug>-<uid>` or a Sketchfab search URL, never a guessed slug.
5. Bump `VERSION`/`NEWS_VERSION` to `2.2.0` with a What's-new line "New car and gun models"; keep the `?debug` hooks.
Done = parses, handles `tex`/`meta`, model paths work when files exist and fallbacks when they don't, credits in the
menu, all pushed to `models-copy` only, no PR.
