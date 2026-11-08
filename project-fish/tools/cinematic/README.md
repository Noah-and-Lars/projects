# The cinematic's moves

The soldier's moves in the dive cinematic (`src/showcase/cinematic/`) are Mixamo clips (Animations from Mixamo, mixamo.com, Adobe), retargeted onto his own skeleton. His body moves only by these clips. The film chooses, trims, time-scales and cross-fades them, places and turns the whole of him, and puts the PF-9 in his right hand at a fixed grip. Nothing poses his arms, hands or fingers in code.

## Building the clips

The downloads (FBX Binary, without skin, 30 fps) go in `build/mixamo/<Name>/<Name>.fbx`, and the Soccer Game Pack in `build/mixamo/Soccer_Game_Pack/files/`. They're never committed. Then, from the project-fish folder:

```bash
blender --background --python tools/cinematic/retarget_mixamo.py -- tools/cinematic/clips.json assets/cinematic/soldier_clips.glb
```

(The npm script is `build-cinematic-clips`, with that command line.) This writes `assets/cinematic/soldier_clips.glb` (about 0.6 MB). It holds no mesh: just nodes named as his bones, and one animation per clip, each named as in `clips.json` with its source, trim, length, travel and credit in the animation's `extras`. The same downloads always give the same file, byte for byte. Add `--candidates` to also build every other download listed in `clips.json` (for looking at them), and `--report file.json` for per-clip numbers: hip path, sole heights, hand places, and the checks (wrist twist, knees or elbows bending the wrong way, hands inside his body).

How the retarget works is at the top of `retarget_mixamo.py`. In short:
- Bones are matched by `bone_map.json`.
- The two rest poses (the X Bot's T-pose bind pose and his idle rest) are lined up bone by bone by a whole frame: the way each bone points, plus a second direction for its roll (`roll` in the map).
  - The arm, hand and fingers use the palm's width, so palms face the same way and his forearm turns with his hand.
  - His feet keep their own rest.
- Each frame, every Mixamo bone's turn in the world is given to his bone.
- His forearm twist bones share the hand's twist (25% and 60%).
- Root motion stays on his hips, scaled by leg length (his legs are 0.873 of Mixamo's).
- His hips are raised or lowered a little each frame so his soles meet the ground where Mixamo's do. This is 1 to 5 cm, faded out while he's in the air.

All the downloads were checked on him (with his outfit), from the side and the front, and close up on both hands: no twisted wrists, no collapsed shoulders, no knees or elbows bending the wrong way, no hands inside his body, and feet on the ground.

## The clips in the file

All times below are the clip's own seconds (the download's, untrimmed), at 30 fps.

| Clip | Download | Length | What it's for |
|---|---|---|---|
| `sprint` | Sprint | 2.67 s | One 0.533 s stride, played 5 times over, carrying him 14.4 m (5.4 m/s) |
| `dive` | goalkeeper diving save | 3.17 s | A dive to his left with both arms out, then landing, rolling over and coming up |
| `cover` | Idle_Crouching | 2.10 s | Kneeling on his right knee, gun low in both hands (loops) |
| `cover_aim` | Pistol_Kneeling_Idle | 3.80 s | Kneeling on his right knee, aiming in both hands (loops). Its first frame is `pop_up`'s first frame. Also the source of his gun hand's grip for the snatch |
| `pop_up` | Pistol_Kneel_To_Stand | 1.37 s | Rising from the knee to standing, aiming all the way |
| `fire` | Shooting | 1.17 s | Standing two-handed: one shot, with the recoil and recovery |
| `spare_dive_roll` | Running_Dive_Roll | 2.07 s | Spare: a forward dive roll from a run, aiming before and after |
| `spare_aim` | Pistol_Idle | 1.33 s | Spare: standing, aiming, still |

## The takes and how they chain

The story times are seconds from the start of the sprint. He starts at the origin facing +Z. "Yaw" is the turn the film gives the whole clip, about the vertical axis, in degrees (positive turns him to his left). Each clip is placed so that its hips meet the previous clip's hips (x, z) where they meet.

| Story | Clip | Clip time | Yaw | How it joins |
|---|---|---|---|---|
| 0.00 to 1.80 | `sprint` | 0.00 on | 0 | |
| 1.60 | `dive` | from 0.42 | 0 | Cross-fades in over 0.2 s as he plants his feet. Best hidden by a hard cut at about 1.75 (see below) |
| 2.08 | right-hand grip layer | `cover_aim` at 0.50, held | | Only his right thumb and finger bones (`CC_Base_R_(Thumb\|Index\|Mid\|Ring\|Pinky)[123]`), fading in over 0.06 s at the catch and staying until the cut. Use weight 20, as the actor's layers do |
| 3.63 | `cover` | from 0.00 | +12 | **Hard cut**. His hips go where the dive's are at its clip time 2.80 |
| 4.83 | `pop_up` | from 0.00 | +12 | Cross-fades in over 0.35 s. Both clips kneel on the same right knee, so only his arms move as the gun comes up |
| 5.88 | `fire` | from 0.00 | +22 | Cross-fades in over 0.25 s, near the end of `pop_up` (its clip time 1.05) |
| 6.10 | shot | `fire` at 0.22 | | The frame before the muzzle starts to climb (it's up 17° by 0.40, and settles by 1.0) |
| about 7.2 | `cover` | from 0.40 | +12 | **Hard cut** back to him in cover, in the same place as before |

The dive's own moments (clip time, then story time):
- 0.42 (1.60): start, feet planted
- 0.75 to 0.85 (1.93 to 2.03): takeoff. His last foot leaves the ground at 0.85
- 0.83 to 0.90 (2.01 to 2.08): his right hand at full reach, 1.2 m up, 0.6 m to his left and 0.7 m ahead of his hips
- **0.90 (2.08): the catch.** His hand is still rising and he's just left the ground. This is the slowest beat
- 1.27 (2.45): his hands reach the ground
- 1.40 (2.58): his body lands
- 1.45 to 2.30 (2.63 to 3.48): he rolls over onto his back and over again. The pistol stays clear of the ground the whole time (its lowest point is 8 cm up)
- 2.45 (3.63): the cut
- 2.70 to 2.80: on his left knee, coming up

**Speed ramps** fit these clip times:
- Takeoff: 0.75 to 0.85
- Grab: 0.85 to 0.95, the slowest, orbiting. Snap back to full speed at 0.90
- Landing: 1.27 to 1.45, brief
- Shot and bullet flight: `fire` from 0.15

**Where things are** at those moments, in the chain above (metres, the sprint starting at the origin facing +Z):

| Moment | Story | His hips | His right hand | The muzzle |
|---|---|---|---|---|
| Catch | 2.08 | (0.70, 0.98, 9.27) | (1.27, 1.26, 9.99) | |
| Landing | 2.58 | (1.94, 0.26, 9.85) | | |
| In cover | 3.63 | (1.79, 0.46, 10.00) | | |
| The shot | 6.11 | | | (1.88, 1.33, 10.80), bore level, along +Z |

He dives about 2 m to his left of his run line. The barrier (0.81 m high) belongs about 0.75 m ahead of his kneeling place, square to +Z: that's where he lands and rolls, behind it. Kneeling, his head is 1.05 m up and the gun 0.9 m up, just over the barrier. Standing to fire, the muzzle is 1.33 to 1.48 m up.

### What doesn't chain well, and how to hide it

- **Sprint into dive.** The dive starts from a goalkeeper's set stance, not a run, and goes off at about 45° to his left at 2.6 m/s, after a 5.4 m/s sprint. Cross-fading over 0.2 s from 1.60 holds up in a wide shot, but it's better hidden by cutting on his last stride, at about 1.75 (dive time 0.57: his weight is down, his arms swinging up), to a low angle as he launches. The slow motion starts there anyway.
- **Landing into cover.** The dive comes up on his *left* knee, but every kneeling clip kneels on the *right*, so they can't cross-fade. Cut at 3.63 (dive time 2.45, as he starts to rise after the roll) to him already kneeling behind the barrier, from a different angle.
- **Fire after pop-up.** `fire` stands square and `pop_up` ends bladed, so his legs shift during the 0.25 s cross-fade. His arms are nearly the same. Frame it above the waist, or cut to the muzzle close-up for the shot.
- **The snatch.** The goalkeeper's hands are open claws, so his right fingers come from `cover_aim` from the catch on, a cross-fade between Mixamo clips. Without that layer the pistol sits in an open hand.

## The pistol in his hand

In every take the PF-9 is in his **right** hand, from the catch on. In `cover`, `cover_aim`, `pop_up` and `fire` his left hand wraps round his right.

It sits at one fixed offset in his right hand bone's frame (`CC_Base_R_Hand`). The position is in metres. The turn is a three.js Euler, XYZ order, of the gun's own frame (+X its right, +Y up, −Z out of the muzzle):

```
position (-0.0225, 0.0729, 0.0807)
rotation (1.727, -0.0071, 0.0012)
```

How it was worked out from his hand bones: the grip's line runs along the palm's width (index knuckle at the top), the grip's middle is 2.2 cm off the palm, and the bore is turned 12° down from the knuckles' line. With it, his aim is level in every pistol take:

| Take | Bore pitch | Bore yaw |
|---|---|---|
| `cover_aim` | +4° | −6.5° in its own frame |
| `pop_up` end | −1° | −11° |
| `fire` before the shot | −2° | −22° (so it gets yaw +22 to match `pop_up` at +12) |

It's within about a centimetre and half a degree of `GRIP` in `src/showcase/cinematic/actor.js`. The same offset works in all of them, since the knuckles never move against the hand bone. In the dive, before the catch, the gun is a prop in flight. The test toss came from 3.5 m to his right and 2.5 m ahead of the catch point, over 1.0 s, with 1.25 turns.
