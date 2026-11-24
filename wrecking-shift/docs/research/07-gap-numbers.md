# 07 — Gap numbers: tools, explosions, player, fire, debris, robots, heist logic, vehicles

Compiled 2026-11-24. This file fills numeric gaps left by files 01–06. Each value carries a source tag and a provenance note.

**Source tags**
- **[VANILLA-DUMP]**: a public GitHub copy of the shipped game's `data/script/*.lua`. Two copies were used:
  - https://github.com/ForCesCustom/Teardown-data (commit 9dc2aca, 2021-10-23, about game v0.8–0.9; README: "For friend").
  - https://github.com/bingleboy/TD-Redux (2023-11-03; a modified copy of the newer `script/heist.lua` and `ui/`).

  These are proprietary Tuxedo Labs files redistributed by third parties. They are quoted here only in short snippets, as reference for an original reimplementation.
- **[VANILLA-DERIVED]**: community mods that copy the vanilla `robot.lua` with edits. Two copies were used:
  - `legacy_source/trex.lua.txt` and `atst.lua.txt` in https://github.com/calumroy/DinosaurMPJumpingEdition
  - `others scripts/alien_original.lua` in https://github.com/deffcolony/TD-ALIEN

  A value is marked "likely vanilla" only when **both independent copies agree**. Even then it is UNCONFIRMED.
- **[OFFICIAL-API]**: https://teardowngame.com/modding/api.html. The text was checked against the local copy of the 2.2.0 API (`scratchpad/dl/api.txt`).
- **[MPLIB]**: the official Tuxedo Labs multiplayer library, https://github.com/tuxedolabsorg/mplib (commit f217db4, 2026-03-13).
- **[TDMP]**: https://github.com/TDMP-Team/TDMP-Lua (2023-06-15). This is an unofficial multiplayer mod that **re-implements** all base tools in Lua. Its numbers are the modders' approximations of vanilla feel, **not** vanilla values.
- **[WIKI]**: teardown.fandom.com wikitext (local copies in `scratchpad/raw/wiki_*.txt`).
- **[COMM]**: Steam, Nexus or mod-description claims.

---

## 0. Headline findings (what is new vs. files 01–06)

1. **The chopper does not fail the mission itself.** It is cosmetic. Failure comes only from the alarm timer reaching 0 (`fail_alarmtimer`).
   - `alarmchopper.lua` lerps the chopper from location `start` to `end` over the last `starttime` seconds of the alarm. The default is 15 s, with sqrt easing.
   - It looks at the escape vehicle when one exists, otherwise at the player.
   - This corrects the wiki claim in 01 that the "mission fails if it reaches it".
2. **Picking up a target does not itself trigger the alarm.** The alarm (`level.alarm = true`) is raised by separate scripts:
   - alarm boxes wired or jointed to the target or its support (`alarmbox.lua`);
   - alarm robots;
   - fire, when `GetFireCount() >= 100` while `level.firealarm` is true;
   - gas tubes, Tesla coils, transformer targets and water safes.
3. **Alarm timer**: 60 s plus `options.game.campaign.time` (a difficulty option), for campaign missions only [VANILLA-DUMP, both versions].
4. **`explosion.lua` is visual-only.** The engine performs the destruction and writes `game.explosion.{strength,x,y,z}`. The script picks one of three FX tiers: strength ≥ 2 is "large", ≥ 1 is "medium", otherwise "small".
5. **Robot AI formulas** are now known (seen-timer integration, hearing attenuation, weapon state machine, explosion stun and push). They are "likely vanilla", consistent across two derived copies.
6. **Official player numbers**:
   - hurt speed scale default **2/7 ≈ 0.29**;
   - player friction default **0.8**;
   - `defaultEyeY = 1.7` (API example);
   - spawn health is a 0–1 value.
   - Walking speed 7.0 and jump speed 5 appear only in API examples, so they are likely but UNCONFIRMED defaults.
7. **Vanilla tool hole radii and explosion internals live in the C++ engine.** No public copy was found, so they stay UNCONFIRMED.
   - The best proxy is TDMP's reimplementation, given in §1.3.
   - Teardown 2.x exposes upgrade registry keys `game.tool.<id>.damage/.range/.spread/.falloffDamage/.ammo`.

---

## 1. Per-tool destruction parameters

### 1.1 What is confirmed (official API)
- `MakeHole(pos, r0, [r1], [r2], [silent])` takes radii in **meters**, with the constraint r0 ≥ r1 ≥ r2.
  - Soft (r0): glass, foliage, dirt, wood, plaster, plastic.
  - Medium (r1): concrete, brick, weak metal.
  - Hard (r2): hard metal, hard masonry.
  - It returns the number of voxels removed [OFFICIAL-API].
- `Shoot(origin, dir, [type="bullet"], [strength=1.0], [maxDist=100.0], [playerId])`.
  - Types: `"bullet"`, `"rocket"`, `"gun"`, `"shotgun"`. A legacy number 1 also means rocket.
  - It spawns the projectile only, with no sound [OFFICIAL-API]. Robots and choppers use `Shoot(p, d)` for bullets and `Shoot(p, d, 1)` for rockets [VANILLA-DUMP].
- `Explosion(pos, size 0.5–4.0, [instigatingPlayerId])` [OFFICIAL-API]. Its internals are not documented. See §2.
- Teardown 2.x tool upgrade registry keys, read and written by an MP mod:
  - `game.tool.shotgun.damage`, `.range`, `.spread`, `.falloffDamage`. The mod sets damage 2, range 10, falloffDamage 0.02 for its "hunter" shotgun (https://github.com/DimasVoxel/Prop-Hunt `gamelogic/server/server.lua` L161–168).
  - Ammo is `game.tool.<id>.ammo` [VANILLA-DUMP ammo.lua].
  - `GetToolAmmoPickupAmount(toolId)` is official. mplib falls back to 20 if it returns ≤ 0 [MPLIB tools.lua].

### 1.2 Upgrade levels (arbitrary units, [WIKI] infoboxes)

| Tool | Ammo (base–max, cost per step) | Range | Damage / blast |
|---|---|---|---|
| Gun | 6–36 ($200) | 40–100 ($300) | damage 1–3 ($300) |
| Shotgun | 12–96 (+12, ×7, $200) | 20–60 (+20, ×2, $300) | damage 3–5 (+1, ×2, $400) |
| Hunting rifle | 6–18 ($400) | — | — |
| Pipe bomb | 6–36 ($200) | — | blast 2–4 ($500) |
| Bomb | 6–36 ($400) | — | blast 4–6 ($500); fuse "2.5 second timer" (wiki prose) |
| Rocket launcher | 6–24 ($500) | — | blast 3–5 ($750); "projectile drop is present" |
| Nitroglycerin | 4–16 ($400) | — | blast 5–8 ($600) |
| Blowtorch | fuel 20–60 s (+10 s/step, $100) | — | — |

How the "blast" units map to `Explosion(size)` is **UNCONFIRMED**. A plausible guess is size = blast/2, which would give pipe 1–2, rocket 1.5–2.5, bomb 2–3, nitro 2.5–4, inside the API's 0.5–4 range. That guess is NOT sourced.

### 1.3 Community reimplementation numbers ([TDMP], NOT vanilla)
Source: https://github.com/TDMP-Team/TDMP-Lua `data/tdmp/TDMP/tools/*.lua`. `d` is the tool's upgrade value `game.tool.<id>.damage`.

| Tool | MakeHole soft / med / hard (m) | Rate | Projectile | Explosion / other |
|---|---|---|---|---|
| Sledge | 1 / 0 / 0, melee ray ≤ 3 m | swing resolves at 0.4 s after click | — | impulse 50; player damage 0.40 |
| Gun | med = clamp((d−1)·0.5, 0, 1)·0.2 + 0.35 → **0.35–0.55**; soft = med + 0.1 → **0.45–0.65**; hard 0 | 0.25 s cooldown | 250 m/s | player dmg 0.5; damage drops beyond 1250 (units) |
| Shotgun | m = clamp((d−3)·0.5, 0, 1); md = (2m+3)·0.2 → 0.6–1.0; soft = (md+0.3)/2 → **0.45–0.65**, med = md/2 → **0.30–0.50**, hard 0 | 0.7 s cooldown | **8 pellets**, each rotated by random Euler ±4° per axis, 250 m/s | player dmg 0.2 per pellet |
| Rifle | 0.3 / 0.3 / 0 | 1.5 s cooldown | 200 m/s, penetrating ("Laser" type, life 12) | player dmg 0.85 |
| Rocket | — | 1.1 s cooldown | **20.1 m/s, gravity −2 m/s²** | `Explosion(1.2 + (d+1)/10)` → 1.6–1.8 for d = 3–5 |
| Bomb | — | — | placed; engine tag `bomb="3"` (fuse s) | tag `bombstrength = 1.2 + d/10` |
| Pipe bomb | — | — | thrown, initial local velocity (0, 4, −20) m/s | tag `bomb="1.5"`, `bombstrength = 1 + d/50` |
| Nitro ("explosive") | — | — | placed | tag `explosive = 1.2 + d/10` (impact-detonated) |
| Blowtorch | **0.15 / 0.15 / 0**, silent, plus `SpawnFire(hit)` | per tick | — | — |
| Leaf blower | — | — | — | impulse = 50 − mass·0.1 − dist·2 (if > 0) |

Two points about this table:
- TDMP drives explosives through **engine-recognized shape tags**: `bomb=<fuse seconds>`, `bombstrength=<size>` and `explosive=<size>`. That the engine reacts to these tags is a strong hint, but it is UNCONFIRMED in the official docs.
- Snippet (TDMP `tools/bomb.lua` L26–30, https://github.com/TDMP-Team/TDMP-Lua):

```lua
local ents = Spawn([[<vox tags="unbreakable exp nocull" ... density="4" file="bomb.vox"></vox>]], data[1], false, true)
local shape = ents[2]
SetTag(shape, "owner", steamid or data[5])
SetTag(shape, "bomb", "3")
SetTag(shape, "bombstrength", 1.2 + data[2]/10)
```

### 1.4 Still UNCONFIRMED (vanilla)
- Sledge, gun, shotgun and rifle hole radii.
- Fire rates and projectile speed or gravity.
- Pellet count and spread.
- Blowtorch heat rate. The API example uses `AddHeat(shape, pos, 2*dt)`, which shows the scale of the parameter but is not the tool's value.

---

## 2. Explosion internals

**Engine side (UNCONFIRMED).** `Explosion(pos, size)` carves holes, applies impulse, damages the player, may ignite fire and paints soot. The radii-vs-size, impulse and player-damage-radius formulas are not public.

Indirect evidence, from the robot script copies [VANILLA-DERIVED]:
- Robots get a `hitByExplosion(strength, pos)` callback, where strength equals the explosion size.
- Explosions with `strength ≤ 0.99` are ignored by robots.
- Effect falloff is `f = clamp(1 − (d − 2)/6, 0, 1) · strength`. It is full within 2 m and zero at 8 m.
- If `f > 0.2` the robot is stunned. The wiki quotes vanilla as `f·4` seconds; the mod copies edited this.
- Robots get an "unphysical but more fun" push:
  - velocity add = `min(7, f · scale · 3)`, where `scale = clamp(1 − |v|/7, 0, 1)`;
  - direction = away from the blast, tilted up (`dir.y += 1`).

**Script side, `data/script/explosion.lua` [VANILLA-DUMP], FX only.** Snippet (https://github.com/ForCesCustom/Teardown-data/blob/main/script/explosion.lua L285–296):

```lua
function tick(dt)
	if HasKey("game.explosion") then
		local strength = GetFloat("game.explosion.strength")
		local pos = Vec(GetFloat("game.explosion.x"), GetFloat("game.explosion.y"), GetFloat("game.explosion.z"))
		if strength >= 2 then
			explosionLarge(pos)
		elseif strength >= 1 then
			explosionMedium(pos)
		else
			explosionSmall(pos)
		end
		ClearKey("game.explosion")
	end
```

FX tier parameters (counts, velocities in m/s and lifetimes in s, as written in the file):

| Tier | Sparks (count, vel) | Debris particles (count, vel) | Smoke trails (n, vel, life, size, damp) | Flash (life, intensity) | Light (life, intensity) | Fireball (life, size) | Smoke (life, size, vel, gravity, amount) |
|---|---|---|---|---|---|---|---|
| small (<1) | 10, 2 | 25, 6 | 8, 5, 0.4, 0.1, 0.99 | 0.1, 200 | 0.8, 15 | 0.5, 0.2 | 1, 0.5, 1, 3, 2 |
| medium (1–2) | 30, 3 | 50, 7 | 16, 12, 0.4, 0.15, 0.97 | 0.2, 500 | 1.0, 30 | 0.6, 0.5 | 1.5, 0.7, 1, 2, 2 |
| large (≥2) | 50, 5 | 100, 10 | 8, 12, 0.5, 0.2, 0.97 | 0.4, 1000 | 1.2, 50 | 0.7, 0.8 | 3, 1.0, 8, −1, 6, plus a ring of sideways dust at 8–12 m/s |

Further FX details:
- Trail gravity is −10. Debris particles use gravity −10, radius 0.03–0.05 and sticky 0.2.
- Flash light colour is (1, 0.5, 0.2), and the light falls off as q².

---

## 3. Player defaults

| Quantity | Value | Source |
|---|---|---|
| Health range | 0–1 float. Death when `game.player.health == 0`. `SetPlayerSpawnHealth(0..1)` | [OFFICIAL-API]; [VANILLA-DUMP] heist.lua L119 |
| Hurt speed scale | **default 2/7 ≈ 0.29**, the walk speed the player interpolates toward as health drops | [OFFICIAL-API] `SetPlayerHurtSpeedScale` example comment |
| Base walking speed | 7.0 in the official example (`SetPlayerWalkingSpeed(7.0)` vs 15 when sprinting). Prop-Hunt also uses `7*(1−dist/4)` as its base. The ratio 2/7 above supports 7. **Likely default, UNCONFIRMED** | [OFFICIAL-API]; Prop-Hunt serverHider.lua L185 |
| Crouch speed | `SetPlayerCrouchSpeedScale` example values 3.0 and 5.0. The API calls it a "speed ... while crouched", not a ratio. Default UNCONFIRMED | [OFFICIAL-API] |
| Jump speed | `jumpSpeed` example values 5 (normal) vs 10 (shift). "Height depends non-linearly on jump speed." Must be re-set every tick. **Default UNCONFIRMED (5 likely)** | [OFFICIAL-API] SetPlayerParam example |
| Friction | **0.8** (official default), with modes average/minimum/multiply/maximum | [OFFICIAL-API] |
| Eye height | `local defaultEyeY = 1.7` in the official `SetToolOffset` example ("Offset the tool depending on character height") | [OFFICIAL-API] |
| Player height | TDMP uses `playerHeight = Vec(0, 1.8)` for driver offset (community) | [TDMP] players.lua L49 |
| Collider radius | UNCONFIRMED | — |
| Damage sources | Vanilla HUD death text: "Explosions, fire, ice cold water, falling and bullets can hurt you." | [VANILLA-DUMP] TD-Redux ui/hud.lua L596 |
| Fall damage | Formula and thresholds UNCONFIRMED. A Steam player reports that water landings hurt the same as ground landings from the same height [COMM] | — |
| Regeneration | Exists, toggled with `SetPlayerRegenerationState`. Rate and delay UNCONFIRMED. A "Health config" mod exposes only multipliers (regen 0–625 %, delay 0–60 s, default 0 s) | [OFFICIAL-API]; top-mods.com "Health config" |
| Low-health blur | `SetLowHealthBlurThreshold(h)` exists. Its example says "Don't show the blurry vision until the player's health drops below 0.4". The vanilla default threshold is UNCONFIRMED | [OFFICIAL-API] |
| Robot fire damage | `SetPlayerHealth(GetPlayerHealth() − 0.02·strength)` **per tick**, while within 2 m in a 0.2 dot-cone. That is about 1.2 health/s at 60 Hz, a kill in under 1 s | [VANILLA-DERIVED], both copies agree |
| Carry mass limit, throw strength | UNCONFIRMED | — |

mplib match defaults [MPLIB]:
- respawn delay 3 s (`spawn.lua`);
- pre-match countdown 3 s (`countdown.lua`), which locks players with `SetPlayerWalkingSpeed(0)` and `DisablePlayerDamage`;
- loot respawn 10 s, despawn 30 s if no player within 30 m (`tools.lua`);
- dropped tools fly out with a random impulse of magnitude 100.

---

## 4. Fire defaults

**Confirmed**
- Registry keys `game.fire.maxcount` and `game.fire.spread` were added in 0.8.0 (changelog).
- `GetFireCount()`, `QueryClosestFire`, `QueryAabbFireCount` and `RemoveAabbFires` exist [OFFICIAL-API].
- `AddHeat`: "As soon as the heat of the voxel reaches a critical value, it destroys and can ignite the surrounding voxels" [OFFICIAL-API].

**Heist fire alarm** [VANILLA-DUMP, heist.lua, both versions]:
- The fire alarm triggers at **`GetFireCount() >= 100`** when `firealarm` (default true) is set and the alarm is not already on.
- The HUD fire meter clamps the count to 0–100 and appears when the count exceeds 10. Snippet (ForCesCustom heist.lua L143–147):

```lua
		--Set off alarm if a lot of fires
		if pFireAlarm and GetFireCount() >= 100 then
			SetBool("level.alarm", true)
			SetString("hud.notification", "Alarm triggered by fire")
		end
```

**Default values of maxcount and spread: UNCONFIRMED.** The candidates disagree:

| Claim | Source |
|---|---|
| "hard coded limit of 100 fires" (likely conflated with the alarm threshold above) | [WIKI] Fire |
| Players saw the count plateau near 200, with old fires culled | [COMM] Steam threads |
| Engine caps natural spread at 4096 and allows only 4 new fires per update; Lua cannot override this | [COMM] Workshop "No Fire Limit [Multiplayer]" id 3625893976 |
| A mod's own defaults: `teardown_max_fires = 500`, `teardown_fire_spread = 2` | ThiccSmoke-ThiccFire firedetector.lua (mod setting, not vanilla) |
| A mod's own defaults: `fireLimit = 200`, `fireSpread = 1` | TeardownPerformanceMod variable.lua (mod setting) |
| A mod sets maxcount = 200 during an alarm | inthecatsdreams/teardown-mods "No countdown(alarms)" |

**What burns**
- Wiki tool pages: the blowtorch affects glass, foliage, wood, plastic and weak metal, and is "the only vanilla tool consistently capable of starting fires". Explosions "sometimes" start fires [WIKI].
- ThiccFire's allow-list (wood, foliage, plaster, plastic, masonry) is a mod choice.
- The vanilla flammability table and the fire lifetime are UNCONFIRMED.

---

## 5. Debris rules

**Engine.** Query layers include `large` ("above debris threshold") and `small` ("below debris threshold") [OFFICIAL-API]. The threshold value is UNCONFIRMED. Community claims disagree:
- "<25 voxels when camera looks away" (Small Debris Retainer, already in 03);
- "stop deleting debris under 50 voxels" (Nexus mod 385 description, search snippet).

**Level script `debriscleanup.lua`** [VANILLA-DUMP]. Used inside a `debriscleanup` trigger. Each tick it scans one tenth of the trigger AABB (round-robin over 10 frames) and deletes a body when **all** of these hold:
- the body is dynamic and large;
- it is more than `dist` = 20 m from the camera;
- its speed is below 1 m/s;
- `IsBodyBroken`;
- it has exactly one shape;
- each shape dimension is below `size` = 10 voxels;
- its voxel count is below `count` = 200.

Snippet (L26–33):

```lua
		if VecLength(VecSub(bodyPos, camPos)) > dist then
			local v = GetBodyVelocity(b)
			if VecLength(v) < 1.0 and IsBodyBroken(b) then
				local shapes = GetBodyShapes(b)
				if #shapes == 1 then
					local shape = shapes[1]
					local sx, sy, sz = GetShapeSize(shape)
					if sx < size and sy < size and sz < size and GetShapeVoxelCount(shape) < count then
```

---

## 6. Robot AI (vanilla `robot.lua` logic, via two derived copies)

These come from the 2-copy agreement in [VANILLA-DERIVED] (trex.lua.txt and alien_original.lua) and the header doc embedded in both. Values where the copies differ are flagged.

**Documented defaults** (header comment, both copies):
- eye `viewdist` 25 m, `viewfov` 150°;
- head `heardist` 100 m;
- weapon `maxdist` 100;
- the `alarm` type triggers when the player is "seen and lit by light for 2.0 seconds" (eye tag `alarm`, default 2.0).

The config variable defaults in the copies were edited (for example viewDistance 150 or 300), so take the header values above.

**Config agreeing in both copies (likely vanilla):**
- `visibilityTimer = 0.3`
- `lostVisibilityTimer = 5.0`
- `huntSpeedScale = 1.6`
- `aimTime = 5`
- `sensorDist = 5.0`
- `outline = 13` m (proximity outline distance)
- `huntlost` search timer 6 s
- roam navigation timeout 5 s, generic navigate timeout 30 s
- obstacle sensor smoothing `blocked = 0.9·old + 0.1·new`
- obstacle rays at the forward, ±0.5 and lateral directions, with 0.3 random jitter

The default `speed` param is 3.5 in the dino copies, 9.9 in the alien copy and 3 in `dl/alien.lua`, so it is UNCONFIRMED (likely 3.5).

**Vision** (snippet, trex.lua.txt L1178–1186, https://github.com/calumroy/DinosaurMPJumpingEdition):

```lua
	if playerVisible then
		local distanceScale = clamp(1.0 - distToPlayer/config.viewDistance, 0.5, 1.0)
		local angleScale = clamp(VecDot(toPlayer, fwd), 0.5, 1.0)
		local delta = (dt * distanceScale * angleScale) / (config.visibilityTimer / 0.5)
		head.seenTimer = math.min(1.0, head.seenTimer + delta)
	else
		head.seenTimer = math.max(0.0, head.seenTimer - dt / config.lostVisibilityTimer)
	end
	head.canSeePlayer = (head.seenTimer > 0.5)
```

- The player counts as visible when distance < viewDistance, the dot product is above cos(fov/2), and a raycast is unblocked (the player's vehicle is ignored).
- With ideal conditions the player is spotted after **0.3 s**. At worst (far away, at the edge of view) it takes 1.2 s. The robot keeps "seeing" for up to 5 s after losing sight.
- `aim` ramps 0→1 over 5 s while the player is seen. Extra bullet spread is `(1 − aim) · min(0.5, 2/dist)`, so "the first bullets never (well, rarely) hit player".
- **Alarm robots**: the alarm timer accumulates while the player is visible **and** `IsPointAffectedByLight(eye, playerPos)`. It decays at 1×dt otherwise. When the timer exceeds `alarmTime` (2.0 s) the script sets `level.alarm` and shows "Detected by robot. Alarm triggered." The eye blinks red at 0.5 s period during an alarm.

**Hearing:**
- A sound counts only if `vol > 0.1`, `4 m < dist < maxSoundDist`, and the sound is inside the robot's investigate trigger (if it has one).
- It must also come more than 2 s after the last sound, or be louder than 2× the last volume.
- Attenuation: `heard = vol · (5 / max(5, dist))²`. The robot reacts if `heard > 0.05`. A new sound pushes `investigate` with an alert sound.
- Sleeping robots wake on `vol > 0.2`, or when their body is activated.

**State machine** (a stack):
- States: none → patrol / roam → navigate / search / investigate / move / unblock / hunt / huntlost / avoid / getup.
- Roam picks a random point 6 m away.
- In hunt the robot navigates to `lastSeenPos` with a timeout of `1 + clamp(timeSinceLastSeen, 0, 4)` s at speed ×1.6. It sweeps its head ±0.5–1.0 rad every 1 s when it cannot see the player.
- After 2 s unseen, 3 s in the state and speed below 1 m/s:
  - if lastSeenPos is more than 3 m away, it switches to investigate;
  - otherwise it switches to huntlost.
- Hunt stop distance differs between copies (4 m vs 9 m), so it is UNCONFIRMED.
- Avoid triggers on sight or when the player is within 2 m.
- Water kills a robot: `IsPointInWater(bodyCenter)` disables it.
- Planks and wires attached to robots are auto-removed after 10 s.

**Weapons** (defaults when tags are absent; both copies agree except `count`):
- idle 1 s, charge 1.2 s, cooldown 0.15 s, spread 0.01, strength 1.0, maxdist 100;
- shots per round 1 or 2 (the copies differ: UNCONFIRMED).
- State cycle: idle → charge (charge-loop sound) → fire → chargesilent / idle.
- Firing requires `canSeePlayer`, `dot(fwd, toPlayer) > 0.9` (or the player within 1 m), and a clear ray. The round aborts if the dot product drops below 0.3.
- Shots spawn 1.6 m ahead of the muzzle. Gun = `Shoot(pos, dir, 0, strength)`, rocket = `Shoot(pos, dir, 1, strength)`.
- Flamethrower: active when the player is seen within 8 m. It ramps +0.1 per frame and decays 0.5/s. At amount > 0.5 it spawns fire on a ray hit within 3 m, at most once per second, and hurts the player as in §3.

**Bullets:** `hitByShot`: a hit within 3 m of the body centre on a robot shape adds 0.2 s of stun (agrees with the wiki's 0.2 s).

---

## 7. Alarm, heist and chopper mission logic ([VANILLA-DUMP])

### 7.1 `heist.lua` (2021 and 2023 copies agree on the numbers below)
- **Init**:
  - `alarmTime = 60`, plus `options.game.campaign.time` for campaign missions.
  - Params: `timelimit` (default 0 = none), `required` (default 0 = all primary targets, or all secondary if there are no primaries), `firealarm` (default true).
  - Targets are bodies tagged `target`, with an optional `optional` tag. The target type comes from the tag value: `""` (pick up), `heavy`, `destroy`, `cleared` or `custom`.
- **Tick**:
  - The player dying (health == 0) gives `fail_dead`.
  - While `level.alarm` is on, `level.alarmtimer -= dt`. At 0 the state becomes `fail_alarmtimer`, and the heist music plus the alarm loop play.
  - When the alarm is off, the fire check from §4 runs.
  - When `timelimit` > 0, the mission time is checked against it (`fail_missiontimer`).
  - `level.timeleft` = the minimum of the alarm timer and the mission time left, or −1 if neither applies.
  - Target outlines are drawn within 8 m, at alpha `0.6·(1 − d/8)`, or 1.0 when the target is the interact body.
  - Target clearing by type:
    - plain: interact + `InputPressed("interact")` → clear and delete;
    - `heavy`: the body enters the `goal` trigger;
    - `destroy`: `isTargetBroken` (shape count dropped or any shape broken);
    - `cleared`: set by another script.
  - `level.complete` = cleared ≥ required **and** all primaries cleared. The actual win is handled by the escape-vehicle script (`escape.lua`, params acceleration 6, maxspeed 20).
- **HUD timer**: shows tenths when ≤ 60 s, otherwise m:ss.
- **Score**: score = primary + secondary. Ties break on more time left, or on lower mission time when there was no timer.

### 7.2 Alarm triggers
- **`alarmbox.lua`**. The box blinks at 0.5 emissive for 0.1 s per 1 s; during an alarm it blinks 0.5 s on / 0.5 s off. It triggers when:
  - any rope on it breaks, or its far end changes vehicle;
  - the box breaks;
  - FIXED_STATIC: the box becomes dynamic;
  - FIXED_DYNAMIC: its body mass drops below **0.5× initial**;
  - JOINTED_STATIC: the joint breaks or the other side becomes dynamic;
  - JOINTED_DYNAMIC: the joint breaks or the other body's mass drops below 0.5× initial.
- Other alarm sources:
  - `destroyalarm.lua` (box broken, becomes dynamic, or a joint detached);
  - `gastubealarm.lua`, `teslacoil.lua`, `transformertarget.lua`, `watersafe.lua`;
  - robots of type `alarm` (2 s lit sighting);
  - fire (100 fires).
- `hacktarget.lua`: hacking duration default 2.0 s. It also uses the 0.5× mass rule.

### 7.3 Choppers
- **`alarmchopper.lua`** (escape pressure; snippet L19–25):

```lua
	if GetBool("level.alarm") then
		local timer = GetFloat("level.alarmtimer")
		if timer < pStartTime then
			local t = (pStartTime-timer)/pStartTime
			t = math.sqrt(t)
			local pos = VecLerp(startPos, endPos, t)
```
  - `pStartTime = GetFloatParam("starttime", 15)`. Its comment says "last ten seconds", but the default is 15.
  - It is purely animated (rotors spin at angle += 36·dt). There is no gameplay effect beyond the visual and audio.
- **`huntedchopper.lua` / `chasechopper.lua`** (hunting chopper):
  - Movement: speed param default 7 m/s (horizontal follow), base height 15 m above the surrounding terrain.
  - Detection time before "seen" is 0 if the player is in the spotlight (`IsPointAffectedByLight`). Otherwise it is `nominal · (0.5 + 0.5·standingStill) · (1 − visibility)`, where:
    - nominal = 8 s (5 in hard mode); 6 s in a vehicle (3 in hard mode);
    - standingStill = 1 − clamp(speed/6, 0, 1), so running halves the time;
    - visibility = distanceFactor · orientationFactor;
    - distanceFactor runs 1→0 over 20–100 m;
    - orientationFactor = clamp(dot·0.7 + 0.3, 0, 1);
    - visibility is ×0.5 when the camera is underwater.
  - Fire cycle (when seen and within 60 m): 1 s charge with a beep, then a burst of **3–6 shots** (5–8 in hard mode) 0.2 s apart, then 1 s to recharge or return to search.
  - Spread is ±0.03 per axis, or ±0.1 when the player is in a vehicle. Shots spawn 5 m ahead of the chopper.
  - Rockets: after more than 10 shots fired, a 40 % chance per sighting to arm a rocket 1–3 s later, fired when the player is not seen (hiding).

---

## 8. Vehicle parameters (from XML prefabs in mod repos)

The official settable params are spring, damping, topspeed, acceleration, strength, antispin, antiroll, difflock, steerassist and friction, plus `brokenthreshold` and `smokeintensity` via `GetProperty` [OFFICIAL-API]. Their units and defaults are UNCONFIRMED.

The prefabs below appear to be copies or edits of vanilla vehicles (by their sound names). They are [COMM] values, not confirmed vanilla.

| Prefab (repo/path) | sound | spring | damping | topspeed | accel | strength | antispin | antiroll | difflock | steerassist | friction |
|---|---|---|---|---|---|---|---|---|---|---|---|
| saloon car (nathangur/TeardownAI AI/salooncar.xml) | small1 0.8 | 1.0 | 1.5 | 30 | 3 | 4 | — | 0.2 | 0.5 | 0.0 | — |
| station wagon (…/stationwagon.xml) | stationwagon1 | 0.6 | 0.7 | 30 | 3 | 3 | 0 | 0.2 | — | 0.0 | — |
| van (…/van.xml) | van | 0.5 | 0.7 | 31 | 3 | 2 | 0 | 0.1 | 0.5 | 0.0 | — |
| SUV 2 (…/suv2.xml) | suv2 | 0.8 | 0.8 | 34 | 2 | 5 | 0 | 0.2 | 0.5 | 0.0 | — |
| pickup / technical | pickup | 0.8 | 0.8 | 35 | 3 | 5 | 0 | 0.2 | 0.5 | 0.0 | — |
| SUV 3 | suv3 0.9 | 0.8 | 2 | 36 | 3 | 4 | 1 | 0.1 | — | 0.0 | — |
| muscle car | musclecar | 0.6 | 0.7 | 40 | 4 | 8 | — | 0.2 | 0.3 | 0.0 | — (braking 0.6) |
| chase car (racingcar sound) | racingcar | 0.4 | — | 80 | 6 | 6 | 0 | 0.6 | 0.1 | 0.4 | 1.5 |
| chase car (pickup sound) | pickup 1.1 | 1.2 | 0.9 | 80 | 8 | 8 | 0 | 0.2 | 1 | 0.15 | 1.5 |
| dock handler (NLferdiNL/Teardown-Chaos-Mod spawn/dock_handler.xml) | frontloader | 0.8 | 0.8 | 30 | 1 | 2 | 0 | 0.2 | 0.5 | 0.0 | 2 |
| crane truck (…/crane_truck.xml) | dumptruck 0.9 | 1.2 | — | 20 | 0.5 | 4 | — | 0.1 | 1 | — | 1.5 |
| tank (…/mil-tank.xml) | tank2 | 0.6 | 0.6 | 90 | 0.5 | 30 | 1 | 0.5 | 1 | 0.3 | 3 |
| wood boat (hltdev8642/newtrain assets/boat/woodboat.xml) | woodboat | 0.2 | — | 60 | — | 2.5 | — | — | — | 0.1 | — |

Wheel and body details for a typical car:
- Wheels: `<wheel drive="1|0" steer="1" travel="-0.1 0.1">`. Other travel values seen are (−0.1, 0.2) and (−0.2, 0.1), in metres.
- The saloon body voxel has `density="1.2" strength="2"`.
- A typical small car has its wheel track at ±0.65 m and its axles at −1.15 / +1.45 m.

Design takeaway: "topspeed" values of 20–90 look like km/h-ish arbitrary units; this is UNCONFIRMED. For an original game, treat them as relative tuning: a city car is about 30, a sports or chase car about 80, a tank 90 with strength 30.

---

## 9. Remaining UNCONFIRMED list
- Vanilla hole radii, rates and projectile speeds for sledge, gun, shotgun and rifle; the blowtorch heat rate.
- The Explosion size→radius, impulse and player-damage formulas; the mapping from wiki "blast" units to size.
- Defaults for jumpSpeed, crouch speed and walkingSpeed (7 is likely); fall-damage formula; regeneration rate and delay; grab mass limit; throw impulse; collider radius and height.
- Defaults for `game.fire.maxcount` and `game.fire.spread`; fire lifetime; the material flammability table.
- The engine's small/large debris threshold (25 or 50 voxels are community claims).
- Robot default `speed`, shots per round, and hunt stop distance (copies disagree).
- Vehicle parameter units and the exact vanilla values per car (the table uses mod copies).
