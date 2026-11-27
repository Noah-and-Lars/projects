# Adding downloaded models

Island Front can draw a tank, a helicopter or a soldier with a downloaded glTF model in place of its built-in one. The model only changes how the unit looks. Its armour, modules, weapons and flight stay as defined in `vehicles.js` and `aircraft.js`.

## What to send

- **Format:** glTF. Either a `.glb` file, or the `scene.gltf` with its `scene.bin` and texture images (a Sketchfab "glTF" download has all three).
- **Not compressed:** geometry packed with Draco or meshopt cannot be read. The packing tool says so and stops; the model then has to be saved again with mesh compression off.
- **Licence file:** the `license.txt` from the download. The credit goes on the title screen and in the README.
- **Which unit it is for:** for example "this is the Abrams" or "this is the player for both teams".

## What makes a model easier to fit

| Unit | Best case | Still works |
| --- | --- | --- |
| Tank | Turret and gun are separate named parts | One solid piece: it is cut into hull, turret and gun by position |
| Helicopter | Main rotor and tail rotor are separate named parts | Rotors fused to the body: they will not spin until cut apart by position |
| Soldier | Rigged (has a skeleton). The bones are found by name (Mixamo, Unreal, 3ds Max Biped, Daz, VRM and Unity names, with or without Sketchfab's number suffixes) or, when the names say nothing, from the skeleton's shape | Its own idle, walk, run and crouch animations, which can be used in place of the game's poses |

A soldier model without a skeleton cannot walk, so that one needs to be rigged.

## Steps

1. Pack the model into one file the game can load from disk:

   ```
   python3 tools/pack_model.py <folder, .gltf or .glb> <key>
   ```

   This writes `models/<key>.js` and prints the model's part names, skeletons and animations.

2. Add `<script src="models/<key>.js"></script>` to `index.html`, above `models/config.js`.

3. Add one line to `models/config.js`. Examples are in that file. The options:

   | Option | Used for | Meaning |
   | --- | --- | --- |
   | `fit.length` / `fit.height` | all | Scale the model to this many metres long or tall |
   | `fit.yaw` | all | Turn the model so it faces forward (radians). Left out, the facing is worked out: a soldier from its skeleton, a vehicle from its long axis and its gun, a helicopter from its rotors (the main rotor is ahead of the tail rotor). Give it if the result is back to front |
   | `fit.pitch` | all | Tip a model that was made lying on its back upright |
   | `turret`, `gun` | tank | Name patterns for the parts that traverse and elevate |
   | `split` | tank | For a one-piece model: a rule giving `hull`, `turret` or `gun` for a position |
   | `ring`, `trunnion`, `muzzle` | tank | Pivot points and barrel length, if the automatic ones are off |
   | `wheels` | tank, truck | Name pattern for the wheels: each turns about its own middle as the vehicle moves |
   | `tracks`, `trackScroll` | tank | Name pattern for the track meshes (or their material), and how far the texture slides per metre `[u, v]` |
   | `rotor`, `rotor2`, `tailRotor` | helicopter | Name patterns for the rotors |
   | `parts` | helicopter | A rule giving the damage part for a position, so parts can be shot off |
   | `stations` | helicopter | Where pods and missiles hang, per weapon slot |
   | `bones` | soldier | Name patterns for bones the automatic matching misses |
   | `rig` | soldier | `'shape'` to ignore the bone names and go by the skeleton's shape |
   | `rifle` | soldier | `false` if the figure carries its own weapon; `'m4'`, `'ak74'` or `'akm'` to choose the game's rifle (default: the team's) |
   | `clips` | soldier | Name patterns for the model's own animations, to use them |
   | `tint` | all | A colour multiplier per team |

If a model's file is missing, the unit keeps its built-in model.

## How each kind is driven

- **Tank:** the turret group turns about the ring and the gun group pitches about the trunnion. Shells leave from the muzzle point. Wheels named with `wheels` turn with the vehicle's speed, and track meshes named with `tracks` have their texture slid along.
- **Helicopter:** rotors spin with rotor speed and blur into a disc. Parts cut out by the `parts` rule are hidden when shot off, and their hit areas are fitted to their shape.
- **Soldier:** the game turns the thighs, shins and spine about the figure's sideways axis for walking, crouching and leaning. The figure is given the game's rifle, held at the shoulder and tilted with the aim, and each arm is bent at the elbow so that the hands sit on the grip and the handguard. This works for any rest pose (T-pose or A-pose) and any bone orientation. With `clips`, the model's own walk and run cycles drive the legs while it moves; standing and crouching fall back to the game's poses unless clips are named for them.

## Tested

The kit was tested with four synthetic models (a tank with named parts, a one-piece tank, a rigged figure with a walk animation, a helicopter) and with published sample models from the Khronos glTF sample set:

| Sample | What it checked | Result |
| --- | --- | --- |
| Cesium Man, Rigged Figure (rigged humans with unhelpful bone names and a z-up root) | Skin binding, skeleton found by shape, facing, poses, rifle hold | Stand, walk, crouch and aim correctly with no settings |
| Cesium Man with its own walk clip | The model's animation driving the legs, arms on the rifle | Works |
| Cesium Milk Truck | Vehicle fitting, automatic facing, wheels turning | Works |
| Damaged Helmet | Colour, roughness, normal and glow textures from a `.glb` | Draws correctly |
| Spec-gloss bottle | Older specular-glossiness materials | Colour and texture kept; shine is approximate |
| Texture transform test | Texture offset, scale and rotation | Applied |
| Interleaved and vertex-coloured boxes | Less common data layouts | Draw correctly |
| Draco box | Compressed geometry | Refused with a clear message |

The sample files are not part of the repository. Bone names were also checked against lists from Mixamo, Unreal, Biped, Rigify, Daz, VRM and Unity rigs; Rigify falls through to the shape method.

Automatic facing was checked by turning the synthetic tank and helicopter through 90, 180 and 270 degrees: each came out fitted the same.

Not yet tried: a real tank or helicopter model (only the truck), so expect some fitting work for those: turret and gun part names and rotor names. Models whose bones are not parented in a normal body layout (animals, robots with extra limbs) are not recognised by shape.
