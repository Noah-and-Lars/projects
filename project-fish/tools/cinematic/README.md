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
- Two hands on one gun (`"hands": "together"` in `clips.json`: `cover_aim`, `pop_up`, `fire`, `enemy_aim`). His shoulders and arms aren't Mixamo's in proportion, so copying the turns alone left his hands 20 cm or more apart where Mixamo's hold the pistol together (4 to 5 cm wrist to wrist), his left hand floating in front of the gun. In these clips his wrists are put back where Mixamo's are against each other, every frame: the left wrist's offset from the right (turned as the right hand turned from its rest, and not scaled, since both hands hold the same gun), each hand going half the way, and both drawn in towards his chest (at most 8 cm) where an arm can't reach that far. Each arm gets there by turning its upper arm and forearm in the plane of its own bend, the elbow kept on the side the clip bends it. Both hands' turns and all the fingers stay the clip's own. This is the same thing a retargeting tool's hand contact does: it keeps what the clip shows (two hands on the gun), worked out from the clip's own hands each frame, not a pose made up in code. `--report` gives each such clip's `handsMiss` (how far the left wrist ends from Mixamo's offset: 0 in all four) and `handsDrawnIn`.
- Root motion stays on his hips, scaled by leg length (his legs are 0.873 of Mixamo's).
- His hips are raised or lowered a little each frame so his soles meet the ground where Mixamo's do. This is 1 to 5 cm, faded out while he's in the air.

All the downloads were checked on him (with his outfit), from the side and the front, and close up on both hands: no twisted wrists, no collapsed shoulders, no knees or elbows bending the wrong way, no hands inside his body, and feet on the ground.

## The clips in the file

All times below are the clip's own seconds (the download's, untrimmed), at 30 fps.

| Clip | Download | Length | What it's for |
|---|---|---|---|
| `sprint` | Sprint | 4.27 s | One 0.533 s stride, played 8 times over, carrying him 23 m (5.4 m/s) |
| `dive` | goalkeeper diving save | 3.17 s | A dive to his left with both arms out, then landing, rolling over and coming up |
| `cover` | Idle_Crouching | 2.10 s | Spare (no longer in the film): kneeling on his right knee; a rifle hold, so with a pistol his left hand is out in front holding nothing |
| `cover_aim` | Pistol_Kneeling_Idle | 3.80 s | Kneeling on his right knee, aiming in both hands (loops): him in cover, before and after. Its first frame is `pop_up`'s first frame. Also the source of his gun hand's grip for the snatch |
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
| 3.35 | `dive` | from 0.57 | 0 | **Hard cut**, as the film cuts from the tracking shot to the low angle (6 strides in; his weight down, arms swinging up). His hips go where the sprint's are then |
| 3.68 | right-hand grip layer | `cover_aim` at 0.50, held | | Only his right thumb and finger bones (`CC_Base_R_(Thumb\|Index\|Mid\|Ring\|Pinky)[123]`), fading in over 0.012 s from the catch (as the pistol meets his palm) and gone just before the cut, at weight 20 |
| 4.88 | `cover_aim` | from 2.30 | +12 | **Hard cut** (mid-roll, dive time 2.10). His hips go where the dive's are at its clip time 2.80. It plays 1.5 s to its end, which is its own first frame |
| 6.38 | `pop_up` | from 0.00 | +12 | Cross-fades in over 0.12 s (from nearly the same pose) |
| 7.58 | `fire` | from 0.16 | +25.2 | **Hard cut**, as the film cuts from the rise to the shots (no blend, so his feet don't slide). The first shot at 7.64 (clip 0.22), a little to his left of the enemy: it strikes the house |
| 7.97 | `fire` | from 0.05 | +24.4 | Cross-fades in over 0.15 s as he recovers: the second shot at 8.14, into the house too |
| 8.97 | `fire` | from 0.00 | +22 | Cross-fades in over 0.3 s, settling his aim: the third shot at 9.19, the bullet cam's |
| 11.53 | `cover_aim` | from 0.20 | +12 | **Hard cut** back to him kneeling, gun up, in the same place as before, 2.3 s after the strike (the enemy has fallen and lies still) |

The enemy's: `enemy_aim`, looping, until the strike (about 9.23: the bullet takes 37.7 ms over 12.9 m), then `enemy_hit_fall` from its clip time 0.23, cross-fading in over 0.1 s. It's turned and moved so that, where it comes in, his feet are where they were in his aim (`placeHit` in `film.js`), so they don't slide. He's placed so that his left shoulder is 13 m down the bore of the third shot, turned so his own pistol points at the shooter's head, and the bullet strikes where the line to his left shoulder joint meets his sleeve (found by casting a ray against his posed meshes). He lets go of his pistol 0.12 s after the strike (it flies on with his hand's speed, tumbles and bounces).

Lying on the ground (his roll; the enemy once he's down), each man is raised as a whole so that no part of him or his outfit goes below the ground: the film poses him every 30th of a second there, finds the lowest point of his skinned meshes, and lifts him by that, smoothed (`lifts` in `film.js`; up to about 15 cm, for the pouches on the back of the vest). This is "root height so the body meets the ground"; no bone is moved.

The dive's own moments (clip time, then story time):
- 0.57 (3.35): the cut in, his weight down
- 0.75 to 0.85 (3.53 to 3.63): takeoff. His last foot leaves the ground at 0.85
- **0.90 (3.68): the catch.** His hand is still rising and he's just left the ground. This is the slowest beat
- 1.27 (4.05): his hands reach the ground
- 1.40 (4.18): his body lands
- 1.45 to 2.30 (4.23 to 5.08): he rolls over onto his back and over again, the pistol clear of the ground
- 2.10 (4.88): the cut

**Speed ramps** (`ramp` in the shots: story seconds a film second, eased in proportion; a `{ hold: story time }` key holds a speed until the story gets there):
- Takeoff: real speed down to 0.09 as he leaves the ground (dive time 0.57 to 0.83)
- Grab: 0.09 down to 1/36 in 0.35 s, held while the pistol comes in across its last foot (its turning done by then, so it comes in steady) and slides into his palm, and the camera swings round, then back to real speed in 0.12 s from the moment it meets his palm, and a hard cut
- Landing: from dive time 1.12, down to 0.32 as his hands and then his body hit the ground, held to 1.45, then the roll at 1.1×
- The aimed shot: real speed down to 1/2,500 as the trigger breaks; the bullet cam runs at about 1/4,000 to 1/14,000, the bullet out of the muzzle 1.15 s in
- The strike: 1/2,500 as the bullet comes in, easing up to 1/14 while he twists, then back to real speed in 0.12 s and a hard cut to a wide shot as he falls

### What doesn't chain well, and how it's hidden

- **Sprint into dive.** The dive starts from a goalkeeper's set stance, not a run, and goes off at about 45° to his left at 2.6 m/s, after a 5.4 m/s sprint. It comes in on a hard cut from the tracking shot (on his left) to a low angle (on the same side), at dive time 0.57.
- **Landing into cover.** The dive comes up on his *left* knee, but every kneeling clip kneels on the *right*, so they can't cross-fade. The film cuts mid-roll (dive time 2.10) to him already kneeling behind the barrier.
- **Fire after pop-up.** `fire` stands square and `pop_up` ends bladed, so a cross-fade slid his feet 20 to 35 cm. It's a hard cut on the camera's cut instead.
- **The snatch.** The goalkeeper's hands are open claws, so his right fingers come from `cover_aim` from the catch on, a cross-fade between Mixamo clips on those bones only. Without that layer the pistol sits in an open hand.

## The pistol in his hand

In every take the PF-9 is in his **right** hand, from the catch on. In `cover_aim`, `pop_up` and `fire` his left hand wraps round his right and the gun (see "Two hands on one gun" above).

It sits at one fixed offset in his right hand bone's frame (`CC_Base_R_Hand`). The position is in metres. The turn is a three.js Euler, XYZ order, of the gun's own frame (+X its right, +Y up, −Z out of the muzzle):

```
position (-0.0222, 0.1146, 0.1055)
rotation (1.727, -0.0071, 0.0012)
```

It was fitted from close-ups of his hand, from the gun's right, left, top and underneath, in every pistol clip: the grip runs through his fist, his fingers wrap its front strap under the trigger guard, the base of the magazine shows below his little finger, the web of his hand is just under the back of the slide, his index finger lies along the frame over the trigger guard, and the slide and the ejection port are clear above his hand. (The first grip, 1.8 cm lower and 4.5 cm further back along the gun, had the back of his hand over the slide: the chamber was hidden in the close shot.) The bore is turned 12° down from the knuckles' line, which levels his aim in every pistol take:

| Take | Bore pitch | Bore yaw |
|---|---|---|
| `cover_aim` | +4° | −6.5° in its own frame |
| `pop_up` end | −1° | −11° |
| `fire` before the shot | −2° | −22° (so it gets yaw +22 to match `pop_up` at +12) |

This is `GRIP` in `src/showcase/cinematic/actor.js`. The same offset works in all of them, since the knuckles never move against the hand bone; the enemy holds his PF-9 the same way in `enemy_aim`. For the `fire` clip the film turns it by a degree or two (worked out each time it's opened) so the third shot's bore points exactly at the strike, fading it in with the clip. In the dive, before the catch, the gun is a prop in flight: thrown from the top of the crates by the barriers' end, to his right, it flies 1.05 s, turning over once (done by 85% of the way), to 9 cm off his open palm, then slides straight into his palm along its normal over the last 0.025 s, arriving at the catch.
