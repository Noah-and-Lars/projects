# Free Criminal copy — model work notes (for continuing on another device)

On 2026-10-22 the user asked for "a copy of the game in case you make a mistake" and, in that copy, all car models fixed
and all gun models realistic. The copy is `free-criminal-copy/index.html` in the workspace root (outside the git repo);
`free-criminal-copy/original-2.0.1.html` is the untouched live 2.0.1 (bf31feb) it started from. Served by the `fc-copy`
launch config (port 8773). Nothing from it is live.

Cars: the user rejected the first parametric shapes as "too goofy"/"don't look like the photo". What worked: CSTY outlines
traced as fractions of length/height (saloon traced from a modern mid-size saloon side-on photo the user sent), extruded
with rounded edges (carExtrude + insetPoly), real wheel arches, glass cabin with roof band, black seal, black A/B pillars,
ten-spoke wheels, CT.*.ht overall heights. Police = white with blue/white checks, orange panel, POLICE, light bar, aerials
and the spawn city's name (cityNear) on the orange panel; taxi = yellow, "<CITY> TAXI" on the door, fare box, orange roof
sign — per the user's reference photos (no real logos copied). Rule learned: the body top must stay above the wheel-arch
tops or the outline folds. The bus was not reshaped (only new wheels).

Guns: gunGeo rebuilt (pistol, revolver, SMG, pump, AK-style carbine, scoped DMR, AA-12-style auto, bolt sniper, LMG,
6-shot GL, clip-point knife); the 2.0 Service Rifle kept. Same frame/len/grip positions.

Debug-only hooks added (?debug): __fc.view(pos,target,w), CT, Car, makeCarModel, WPN, GUN_MAT, setGun(k), vm.

**How to apply:** to ship it, port these changes into the repo's free-criminal/index.html on a clean checkout and push
only when the user says. Related: [[free-criminal-2-0]].

**Polish pass (2026-10-22):** the user said "the cars vibrate as they move" and asked to heavily polish the models.
Cause of the shaking: syncCar set the body pitch from each frame's raw change of speed (AI speed hunting flipped it every
few frames); now low-pass filtered (c.accS/c.pitch/c.roll), jitter ~12x lower. Wheels switch geometry: near (spokes per
face, brake disc, caliper on the pivot), blur when spinning fast (no strobing), far (plain) beyond 50 m; m.detail (grille
slats, badges, fog lights, handles, fuel flap, wipers, fin aerial, interior) also only within 50 m. Outlines are
Catmull-Rom smoothed (crSmooth, glass indices via S.gi) and normals creased (creaseNormals). ~6.7k tris near, ~3.6k far.
The muzzle flash was NOT changed (user asked about it).

**First person + carjack (2026-10-22, copy only):** the user asked to polish "how the hands hold the gun and what position
on the screen", then said "no i mean not actual hands just the positioning" and "revert back to the old hands". So: the
ORIGINAL box hands (mkHands1/mkHands2 shapes) are kept, only moved per gun (vmHands + HOLD table: grip, handguard or
front grip, sight height, screen pos). Each gun has its own hip position, angled in slightly; aiming lines its sight up
with the screen centre; the rifle's red dot is now an open frame with the dot; the DMR uses the scope view (zoom>=30).
Don't make new hand models unless asked. Carjack: jackDoor/setDoor (driver's door on its front hinge with a dark opening),
updateJack 0-1.95 s (walk, open, pull, step in), updPulled with q.d delay (dragged out, thrown down), door closes in syncCar.
Buses keep the old quick jack. Debug hooks: __fc.aim(v), __fc.jack(car).

**Blender models (2026-10-22, copy only, "make them look way better"):** the cars are now built in the user's Blender
(5.2.2, MCP on port 9876) by scripts in the session scratchpad `blender/` (fc_cars.py = loft body from the traced CSTY
outlines + creases + subsurf + boolean arches; fc_details.py = shrinkwrapped lamps/grille/plates/panel lines, mirrors,
interior, police bar, livery decals with UVs, the shared wheel, and the exporter; cardata.json = CT/CSTY dumped from the
game). Exported as `free-criminal-copy/models/<key>.fcm` (own binary: FCM1 + JSON header + float32 pos, int8 normals,
uint8 colours, optional uv, uint16/32 indices) — sedan, police, hatch, suv, sports, coupe, super, muscle, pickup, van,
wheel (~1.1 MB each, ~11.5 MB total). Game side (patch script scratchpad/models/blendercars.py): parseFCM/loadModels
(awaited in boot before buildWorld, "Loading the cars…"), makeCarModelM; paint = magenta marker swapped in the shader
(FC_PAINT define + fcPaint uniform in fcCompile, carPaint(color) one material per colour) so meshes are SHARED, not
cloned; LOD parts body/mid/lo swapped in syncCar at 50/140 m; lamp part doubles as the night mesh (CARLAMP_MAT); left
wheels mirrored (wg.nearL); wheels at w/2-0.1. Old code-built cars remain as the fallback when a model is missing. Taxi
uses the sedan model + the game's roof sign. Bus unchanged. Also fixed in the copy: explodeCar's comment swallowed the
burnt-material line (same bug is LIVE in 2.0.1). Blender MCP gotchas: shrinkwrap project_limit kills every hit (leave
0), faces made by hand need recalc_face_normals or an explicit outward winding, browser caches .fcm unless reloaded.

**Sketchfab switch (2026-10-22 evening):** the user turned Sketchfab on in the Blender MCP add-on and said "use that and
make the models way better" — so the Blender-built cars/guns above are to be REPLACED by Sketchfab models (CC Attribution
only; avoid Free Standard / NonCommercial; the game needs a credits list naming the Sketchfab authors). State saved for
moving devices: `free-criminal-copy/blender/free-criminal-models.blend` (491 MB, textures packed) with everything imported,
and the scripts copied to `free-criminal-copy/blender/scripts/`. Imported and laid out (cars at y=-40, guns at y=-60):
MaG80 "Medium sized sedan" (cb8fdecbc30d…, flat colours, CarPaint material = recolourable, Glass/LightW/LightR/LightO/
wheels as separate meshes — the ideal structure) and MaG80 "Traffic Car Pack" (11 generic cars: CarBody.001-.010,
CarBody2; .008 small hatch, .002 SUV, .010 small van, CarBody2 2-door), vmek3d delivery truck (van), Lexyc16 Classic
Muscle car, donnichols Low-Poly Sports Car (textured), farooq.smurf Low Poly Pickup, polyone Free Pack - Car; guns:
HK 416 (rifle), AK-103 (carbine), Pistol 9mm (Hitansh), Revolver 45 (rashad-brahimli), UMP-45 (Voidren), Pump-Action
Shotgun (brahmjots), AA-12 (SKeLLeR), GM6 Lynx (sniper), M60 (lmg), Combat Knife (San.Dro). Still missing: supercar,
DMR, grenade launcher (M32 is Free Standard — find another). All guns are textured (base colour 2-4k) → the .fcm format
and game loader need texture support (uv + per-part texture file, downscale to 1024) and gun meshes a textured
material; HOLD positions must be re-tuned per gun. Cars: paint via the marker colour on the CarPaint material; export
the model's own wheels + wheel positions/radius in the header; decals shrinkwrapped onto the CarPaint mesh. The `look`
tool times out when many are requested at once — do a few at a time.

## Re-downloading the Sketchfab models on another machine (instead of copying the 491 MB .blend)
Use the Blender MCP `import_asset` tool with source `sketchfab`, these ids and target sizes (metres):
- sedan: Medium sized sedan — MaG80 — `cb8fdecbc30d4618a6109d1de0e30a9e` — 4.6
- traffic pack (hatch = CarBody.008, SUV = CarBody.002, small van = CarBody.010, 2-door = CarBody2): Traffic Car Pack — MaG80 — `5e795b0adcda455d9f64cb02b83f8f90` — 30 (the whole lot is 30 m across)
- van: Free Delivery Truck Vehicle | Low Poly — vmek3d — `50cdb3c674c84224b6ebfe471ca404fe` — 5.2
- muscle: Classic Muscle car — Lexyc16 — `641efc889e5f4543bae51d0922e6f4b3` — 4.95
- sports: Low-Poly Sports Car Free — donnichols — `2b23201839fb43049454f431752073bb` — 4.45 (textured, not recolourable)
- pickup: Low Poly Pickup — farooq.smurf — `cea623973cf34aeab44e2c694fcece69` — 5.1
- spare: Free Pack - Car — polyone — `4211a47e766d4c71b3a9fd94295f4d08` — 4.5
- rifle: HK 416 Assault Rifle - Low Poly — derek_flanagan — `fbdf159836224d67b193ca527d4f4333` — 0.9
- carbine: AK-103 - Game Ready Assault Rifle Weapon — bogdanzloy20280 — `21b2e86d257246639ce187b904d124c8` — 0.95
- pistol: Pistol 9mm - semi auto — Hitansh_3DArtist — `7d363c3cf2f74a9a9fb0cab9874898eb` — 0.2
- revolver: Low Poly Revolver 45 - Game Ready — rashad-brahimli — `36fb84e52a9344a199ed97254cdaa813` — 0.27
- smg: UMP-45mm Low Poly Game Ready — Voidren- — `2f60f6d4e3664601a1e07fd5b9d5067c` — 0.7
- pump: Pump-Action Shotgun — brahmjots — `5f9cccbbdb5c436aa8af2bf40de5d8ad` — 1.0
- auto: AA-12 — SKeLLeR — `ad2ff33173bd43e49133585a93d6ee5c` — 0.97
- sniper: GM6 Lynx - Game Ready Low-poly — xivxiy — `3a362a957326476797882dd9fbb113a5` — 1.26
- lmg: M60 Light Machine Gun — Badboy17Aiden — `cbf408387dc94a30abe11afb3698ac13` — 1.1
- knife: Combat Knife — San.Dro — `48e00da7aeb94530a5d0e0c3d58ca274` — 0.32
Still to find (CC Attribution only): supercar, DMR/marksman rifle, grenade launcher.
All of the above are CC Attribution — the game must credit the authors (the cloud session is adding a credits list).
