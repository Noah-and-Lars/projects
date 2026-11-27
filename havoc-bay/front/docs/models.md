# Adding downloaded models

Island Front can draw a tank, a helicopter or a soldier with a downloaded glTF model in place of its built-in one. The model only changes how the unit looks. Its armour, modules, weapons and flight stay as defined in `vehicles.js` and `aircraft.js`.

## What to send

- **Format:** glTF. Either a `.glb` file, or the `scene.gltf` with its `scene.bin` and texture images (a Sketchfab "glTF" download has all three).
- **Licence file:** the `license.txt` from the download. The credit goes on the title screen and in the README.
- **Which unit it is for:** for example "this is the Abrams" or "this is the player for both teams".

## What makes a model easier to fit

| Unit | Best case | Still works |
| --- | --- | --- |
| Tank | Turret and gun are separate named parts | One solid piece: it is cut into hull, turret and gun by position |
| Helicopter | Main rotor and tail rotor are separate named parts | Rotors fused to the body: they will not spin until cut apart by position |
| Soldier | Rigged (has a skeleton). Mixamo, Unreal and Rigify bone names are recognised | Its own idle, walk, run and crouch animations, which can be used in place of the game's poses |

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
   | `fit.yaw` | all | Turn the model so it faces forward (radians) |
   | `fit.pitch` | all | Tip a model that was made lying on its back upright |
   | `turret`, `gun` | tank | Name patterns for the parts that traverse and elevate |
   | `split` | tank | For a one-piece model: a rule giving `hull`, `turret` or `gun` for a position |
   | `ring`, `trunnion`, `muzzle` | tank | Pivot points and barrel length, if the automatic ones are off |
   | `rotor`, `rotor2`, `tailRotor` | helicopter | Name patterns for the rotors |
   | `parts` | helicopter | A rule giving the damage part for a position, so parts can be shot off |
   | `stations` | helicopter | Where pods and missiles hang, per weapon slot |
   | `bones` | soldier | Name patterns for bones the automatic matching misses |
   | `clips` | soldier | Name patterns for the model's own animations, to use them |
   | `tint` | all | A colour multiplier per team |

If a model's file is missing, the unit keeps its built-in model.

## How each kind is driven

- **Tank:** the turret group turns about the ring and the gun group pitches about the trunnion. Shells leave from the muzzle point. The model's own tracks and wheels are used as they are; they do not animate yet.
- **Helicopter:** rotors spin with rotor speed and blur into a disc. Parts cut out by the `parts` rule are hidden when shot off, and their hit areas are fitted to their shape.
- **Soldier:** the game turns the thighs, shins and spine about the figure's sideways axis for walking, crouching and leaning. The arms are pointed into a rifle hold that tilts with the aim. This works for any rest pose (T-pose or A-pose). With `clips`, the model's own walk and run cycles drive the legs instead, and the upper body leans into the aim.

## Tested

The kit was tested with four synthetic models: a tank with named parts, a one-piece tank, a rigged figure with a walk animation, and a helicopter. Each was fitted, driven or posed, and fired or flown in the game without errors. It has not yet been tried on a real downloaded tank, helicopter or character, so expect some fitting work per model.
