# The cinematic's moves

The moves in the dive cinematic (`src/showcase/cinematic/`) are Mixamo clips (Animations from Mixamo, mixamo.com, Adobe), retargeted onto the soldier's own skeleton: his, and the enemy's (a second copy of the soldier). Their bodies move only by these clips. The film chooses, trims, time-scales and cross-fades them, places and turns the whole man, and puts a PF-9 in each right hand at a fixed grip. Nothing poses an arm, a hand or a finger in code.

## Building the clips

The downloads (FBX Binary, without skin, 30 fps) go in `build/mixamo/<Name>/<Name>.fbx`, and the Soccer Game Pack in `build/mixamo/Soccer_Game_Pack/files/`. They're never committed. Then, from the project-fish folder:

```bash
blender --background --python tools/cinematic/retarget_mixamo.py -- tools/cinematic/clips.json assets/cinematic/soldier_clips.glb
```

(The npm script is `build-cinematic-clips`, with that command line.) This writes `assets/cinematic/soldier_clips.glb` (about 0.8 MB). It holds no mesh: just nodes named as his bones, and one animation per clip, each named as in `clips.json` with its source, trim, length, travel and credit in the animation's `extras`. The same downloads always give the same file, byte for byte. Add `--candidates` to also build every other download listed in `clips.json` (for looking at them), and `--report file.json` for per-clip numbers: hip path, sole heights, hand places, and the checks (wrist twist, knees or elbows bending the wrong way, hands inside his body).

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
| `sprint` | Sprint | 4.27 s | One 0.533 s stride, played 8 times over, carrying him 23 m (5.4 m/s) |
| `dive` | goalkeeper diving save | 3.17 s | A dive to his left with both arms out, then landing, rolling over and coming up |
| `cover` | Idle_Crouching | 2.10 s | Kneeling on his right knee, gun low in both hands (loops) |
| `cover_aim` | Pistol_Kneeling_Idle | 3.80 s | Kneeling on his right knee, aiming in both hands (loops). Its first frame is `pop_up`'s first frame. Also the source of his gun hand's grip for the snatch |
| `pop_up` | Pistol_Kneel_To_Stand | 1.37 s | Rising from the knee to standing, aiming all the way |
| `fire` | Shooting | 1.17 s | Standing two-handed: one shot, with the recoil and recovery |
| `spare_dive_roll` | Running_Dive_Roll | 2.07 s | Spare: a forward dive roll from a run, aiming before and after |
| `enemy_aim` | Pistol_Idle | 1.33 s | The enemy before the shot: standing, aiming, still (loops) |
| `enemy_hit_fall` | Shoulder_Hit_And_Fall | 3.10 s | The enemy struck: the blow lands on his left shoulder at about 0.23 s (that shoulder jerks back from 0.23 to 0.6), he twists, staggers back and falls on his back by 1.4, rolls back over his shoulders and lies still by 2.3 |
| `enemy_hit` | Hit_Reaction | 2.73 s | Spare: a standing hit reaction |

## The takes and how they chain

`HERO` in `src/showcase/cinematic/edit.js` is his timeline, and `enemy()` the enemy's; `Actor.setTimeline` in `actor.js` plays them. The story times are seconds from the start of the sprint. "Yaw" is the turn the film gives the whole clip, about the vertical axis, in degrees (positive turns him to his left). Each clip is placed so that its hips meet the previous clip's hips (x, z) where they meet. The whole of his timeline is then turned to run towards -Z and moved so that he kneels behind the barriers (the cover clip's first frame has his hips at (0.35, 0.8), the barrier's middle 0.75 m ahead).

| Story | Clip | Clip time | Yaw | How it joins |
|---|---|---|---|---|
| 0.00 | `sprint` | 0.00 on | 0 | |
| 3.20 | `dive` | from 0.42 | 0 | Cross-fades in over 0.2 s as he plants his feet (6 strides in); the film cuts on his last stride, at 3.35 (dive time 0.57), to a low angle as he launches |
| 3.65 | right-hand grip layer | `cover_aim` at 0.50, held | | Only his right thumb and finger bones (`CC_Base_R_(Thumb\|Index\|Mid\|Ring\|Pinky)[123]`), fading in over 0.06 s at the catch and staying until the cut, at weight 20 |
| 5.23 | `cover` | from 0.00 | +12 | **Hard cut**. His hips go where the dive's are at its clip time 2.80 |
| 6.48 | `pop_up` | from 0.00 | +12 | Cross-fades in over 0.35 s |
| 7.53 | `fire` | from 0.00 | +25.2 | Cross-fades in over 0.25 s. The first shot at 7.75 (clip 0.22), a little to his left of the enemy: it strikes the house |
| 8.08 | `fire` | from 0.05 | +24.4 | Cross-fades in over 0.15 s as he recovers: the second shot at 8.25, into the house too |
| 9.08 | `fire` | from 0.00 | +22 | Cross-fades in over 0.3 s, settling his aim: the third shot at 9.30, the bullet cam's |
| 10.99 | `cover` | from 0.40 | +12 | **Hard cut** back to him kneeling, gun low, in the same place as before, 1.65 s after the strike |

The enemy's: `enemy_aim`, looping, until the strike (about 9.34: the bullet takes 37.7 ms over 12.9 m), then `enemy_hit_fall` from its clip time 0.23, cross-fading in over 0.14 s, turned 20° to his right of the aim (so the twist from his bladed aiming stance into the clip's square stance turns his left shoulder back, the way the blow pushes it). He's placed so that his left shoulder is 13 m down the bore of the third shot, turned so his own pistol points at the shooter's head, and the bullet strikes where the line to his left shoulder joint meets his sleeve (found by casting a ray against his posed meshes). He lets go of his pistol 0.12 s after the strike (it flies on with his hand's speed, tumbles and bounces).

The dive's own moments (clip time, then story time):
- 0.42 (3.20): start, feet planted
- 0.75 to 0.85 (3.53 to 3.63): takeoff. His last foot leaves the ground at 0.85
- **0.90 (3.68): the catch.** His hand is still rising and he's just left the ground. This is the slowest beat
- 1.27 (4.05): his hands reach the ground
- 1.40 (4.18): his body lands
- 1.45 to 2.30 (4.23 to 5.08): he rolls over onto his back and over again, the pistol clear of the ground
- 2.45 (5.23): the cut

**Speed ramps** (`ramp` in the shots: story seconds a film second, eased in proportion):
- Takeoff: real speed down to 0.09 as he leaves the ground (dive time 0.57 to 0.83)
- Grab: 0.09 down to 0.028 (a 36th), held while the camera swings round him, snapping back to real speed over 0.3 s as his hand closes on the gun
- Landing: 0.32 as he hits the ground, brief
- The aimed shot: real speed down to 1/2,500 as the trigger breaks; the bullet cam runs at about 1/4,000 to 1/14,000
- The strike: 1/2,500 as the bullet comes in, easing up to 1/14 while he twists, then real speed as he drops

### What doesn't chain well, and how to hide it

- **Sprint into dive.** The dive starts from a goalkeeper's set stance, not a run, and goes off at about 45° to his left at 2.6 m/s, after a 5.4 m/s sprint. The cross-fade over 0.2 s from 3.20 is hidden by cutting on his last stride, at 3.35 (dive time 0.57: his weight is down, his arms swinging up), to a low angle as he launches. The slow motion starts there.
- **Landing into cover.** The dive comes up on his *left* knee, but every kneeling clip kneels on the *right*, so they can't cross-fade. The film cuts at 5.23 (dive time 2.45, as he starts to rise after the roll) to him already kneeling behind the barrier, close, in profile.
- **Fire after pop-up.** `fire` stands square and `pop_up` ends bladed, so his legs shift during the 0.25 s cross-fade. His arms are nearly the same. The film watches it from the enemy's side, low, where the barrier hides his legs.
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

This is `GRIP` in `src/showcase/cinematic/actor.js`. The same offset works in all of them, since the knuckles never move against the hand bone; the enemy holds his PF-9 the same way in `enemy_aim`. For the `fire` clip the film turns it by a degree or two (worked out each time it's opened) so the third shot's bore points exactly at the strike, fading it in with the clip. In the dive, before the catch, the gun is a prop in flight: thrown from the top of the crates by the barriers' end, to his right, it flies 1.05 s, turning over once, and arrives in his hand at the catch.
