# Stormworks: Build and Rescue - Land Vehicles (cars, trucks, tracks)

Genre-reference study for an original vehicle-building sandbox. Mechanics and design patterns only.

**Evidence caveat.** The Fandom wiki returned HTTP 402 to our fetcher and its land-vehicle page is a stub anyway. Steam patch-note pages returned only titles. Findings marked **[V]** come from fetched or search-snippet sources listed below. Findings marked **[B]** come from background knowledge of the game and are not verified here. Treat [B] numbers as approximate and check them in-game before relying on them.

## Summary
- Stormworks land vehicles are not fixed "car" objects. They are assemblies of generic parts: wheel blocks, engines, clutches, gearboxes, and treads. Drive is a rotational network measured in **RPS** (revolutions per second) rather than RPM. [V]
- Wheels are components with a few tunables: radius, tread type, and (on the suspension variants) stiffness and damping. [V]
- The game has no stock differential and no stock steering rack logic. Players fake both with clutch pressure, per-side control, or microcontroller (Lua or logic) steering. [V]
- Engines are load-sensitive. Attached load lowers achievable RPS and can stall the engine. A clutch lets players modulate the load. [V]
- Tracks are modular (three sizes of drive wheels and three of idler wheels). They demand high torque, so builders use several gearboxes facing "away" from the engine. [V]
- Grip is constant across the map. Biome-based grip was removed. Tyre tread types (e.g. dirt) mainly differ on snow. [V]
- Community pain points: tracks stall engines, there is no differential, custom suspensions jitter at rest, steering oversteers at speed, and tuning needs microcontrollers. [V]

## Detailed findings

### Wheels and suspension
- v0.3.4 "Suspension and Carrying Update" reworked suspension physics and added a suspension part. [V, title and snippet; https://steamcommunity.com/games/573090/announcements/detail/1700558821174948141]
- v0.6.15 "Advanced Wheels Update" added 8 wheel components: 4 with built-in suspension, 4 without. Players can tune suspension stiffness and damping, tyre radius, and tread type. Dirt tyres grip poorly on snow, and the other tyre types give more friction. [V, search snippet]
- v0.6.16-17 fixes: suspension-variant wheels were made heavier to account for the built-in suspension. Biome-based grip was removed so grip is constant across the map. [V, snippet]
- Wheels have a direction arrow that must match the build-area floor arrow, or they spin the wrong way. [V: steamah guide]
- Typical sizes used in guides are 3x3 and 5x5 (block units), with 7x7 mentioned. A 7x7 vehicle bottoms out unless stiffness and damping are maxed, but max stiffness raises ride height. [V]
- Sliding is usually a weight-versus-grip problem. The usual fix is more and bigger wheels. [V]
- Steering is a wheel-axis input. The convention is negative toe for positive steering values. In symmetric builds the left and right wheels need an inverted input. A numerical inverter feeds the second side. [V]
- Wheel-vs-object force: a fix removed unnecessarily large forces tyres applied to dynamic objects driven over. [V, snippet of v0.6.21 notes]

### Steering
- No Ackermann in the stock parts that we could verify. Players use a "Dynamic Steering" microcontroller: seat A/D input plus a linear speed sensor, with output to the left wheel and an inverted copy to the right. Steering authority is reduced as speed rises to avoid spin-outs. No specific values were published. [V: steamah guide]
- Seat input sensitivity is set to about 30% for most controls and 100% for gears. [V]
- Skid-steer (A/D gating of drive torque per side) is used for wheeled land trains and fixes oversteer of normal steering. [V]

### Differential substitutes
- A forum thread reported that no true differential exists without Lua or very large mechanical builds. Without one, the inside wheel must slip on curves. [V]
- Clutch-pressure "differential": one builder set inside-wheel clutch pressure to 0.75 versus 1.0 outside at full steering. Larger gaps gave sharp, hard-to-control turns. [V: https://steamcommunity.com/app/573090/discussions/0/2666627027757526072]
- Anti-slip: detect wheel slip from the positive change in engine RPS, compare against thresholds, and cut throttle. A prototype pulsed a reverse-driven motor to bleed RPS. [V]
- Half-track variant: cut power to the inside track on turns. [V]
- Mod parts exist for limited-slip differentials (configurable slip ratio) and variable gearboxes (ratio 0.1 to 10), which shows the stock game lacks them. [V, mod catalogue snippet]

### Engines, clutch, gearbox
- Engines have a maximum RPS that falls as load rises. Letting the clutch only partly engage lowers the load and permits higher RPS. [V: gameplay.tips guide snippet]
- A selectable max RPS (8 to 40) appears on one community truck's engine config. [V: discussion thread]
- Gearboxes have two ratio settings (e.g. 3:1 and 1:1). Each gearbox loses some power, so long chains cost efficiency. A common 4 to 5 box setup alternates facing directions: boxes facing away from the engine for torque, boxes facing the engine for speed. [V]
- Typical manual build: one clutch and four gearboxes, the last feeding all four wheels, shifted by a microcontroller via buttons or up/down. [V]
- Automatic clutch recipe: an up/down counter stepping 0.01 per tick, clamped 0 to 1, raising when engine RPS is above about 6 and lowering below about 5. It is quicker than a PID but can surge. [V]
- Typical failure: upshifting stalls the engine and stoichiometric ratio drops to -1. [V]
- Engine sizing from a guide: 3x3 wheels use one small diesel; 5x5 wheels use two small diesels or one medium at 80% power. [V]

### Tracks
- v0.6.21 "Modular Tank Tracks Update": three sizes of caterpillar tracks built from modular track wheels, with 3 drive-wheel sizes and 3 regular-wheel sizes. [V]
- Tracks have very high torque demand: a single small powered track piece can stop a diesel from running unless the player holds input. Players say a variable clutch is "mandatory". [V]
- Tracks need gearboxes facing away from the engine, otherwise they won't start moving. [V]
- Tank turning uses clutches and gearboxes; a bad steering setup locks them so the tank cannot move. A dedicated steering controller fixed one build. Turning on the spot is the hard case for hand-written steering logic. [V]

### Speeds and builds
- Race cars reach about 80 m/s peak (land race average about 72 m/s), using speed-adjusted downforce flaps. One builder claimed downforce around 7x vehicle mass. Race limit 1500 mass, fuel about 2 L/s. [V]
- A universal truck carried a container, a powered fifth wheel, and a trailer hook. Trailers are an income source in career mode. [V]
- Custom suspensions (linear-track or piston based, power through the arms) are unstable at rest and jitter or slide. [V]

### Terrain
- Grip is constant across biomes after v0.6.16-17. Snow punishes dirt tyres only. No verified mud/sand model. [V for the statements above; absence of mud/sand data otherwise]

## Player-facing feel
- Good: a freeform kit where every ratio, clutch, and steering curve is the player's own. Wheel size and suspension choices visibly change behaviour. Engines that stall under load teach the player to build gearing.
- Bad: cars feel fragile and twitchy until the player adds microcontroller steering; tracks seem inert until gearing is solved; there is a steep learning curve with little feedback besides stalls.

## Known problems to avoid
1. No differential: forces hacks (clutch pressure, per-wheel brakes).
2. Tracks that stall engines because the drivetrain has no torque-converter or slip behavior.
3. Steering with no speed-dependent authority, so cars spin out at speed.
4. Custom physical suspensions jitter at rest because of constraint solving on stacked joints.
5. Drive power through suspension travel needs special builds (driveshaft problem).
6. Input handling (seat sensitivity) buried in menus.
7. Wheel parameters being lost if the player edits XML (reported for trains).

## Implementation notes for our original game
**Wheel model.** Use raycast or spherecast wheels rather than rigid rolling bodies. Per wheel per physics step:
- Suspension: `F_s = k*(rest - compression) - c*v_compress`, clamped at 0; apply at the contact point along the hit normal. Substep at 120 to 240 Hz to avoid jitter.
- Tyre: compute slip ratio `s = (w*r - v_long)/max(|v_long|, eps)` and slip angle `a = atan2(v_lat, |v_long|)`. Use a Pacejka-lite curve `F = mu*N*sin(C*atan(B*x - E*(B*x - atan(B*x))))` with B about 8-12, C about 1.4-1.9, E about 0.1-0.9 (tune). Combine long and lat with a friction ellipse or by normalising force vectors.
- Surface table: `mu` per material and per tread type (dirt, road, snow) so tread choice matters, as in the reference.
- Keep a per-wheel low-speed damping or "stick" mode to stop creep at rest.

**Drivetrain.** Model it as a graph of rotating nodes with inertia and speed:
- Engine node: torque curve `T(w)` limited by a load-dependent max speed, plus throttle; stall below a minimum speed.
- Clutch: torque transfer `min(clutch_pressure*T_max, k*(w_in - w_out))`, which gives slip-based engagement instead of a hard lock.
- Gearbox: ratio edge, `w_out = w_in/ratio`, `T_out = T_in*ratio*eff`, with efficiency about 0.95 per stage (reference loses power per box).
- Differential (a part the reference lacks, so adding it is a differentiator): open, locked, and limited-slip with `T_left = T/2 + lock*(w_r - w_l)`.
- Brakes: friction torque opposing wheel speed.
- Solve with an implicit/iterative constraint step so wheels, engine, and clutches stay stable at big inertia ratios.

**Tracks.** Simple route: treat a track run as a set of contact patches along the bottom run with one shared belt speed `v_belt = w_sprocket*r`. Apply longitudinal friction toward the belt speed and lateral friction opposing sideways slip. Skid-steer arises naturally with separate left and right sprockets. Provide a built-in steering mixer (throttle plus yaw to per-side torque) so players need no microcontroller for the basic case.

**Steering.** Offer an Ackermann option on steering parts, plus speed-sensitive lock, a hint that the reference leaves to players.

**Trailers/couplers.** Use a ball joint with a limited cone and a lock flag, breakable by force; connect brake and hydraulic signals through the coupler if needed.

**Rollover.** Raycast wheels plus a low centre of mass from heavy engines gives reasonable rollover; add an optional anti-roll bar part.

**Data structures.** `Wheel{radius,k,c,tread,mu_table}`, `RotNode{inertia,omega,torque_in}`, `Link{type:{gear,clutch,diff,brake},ratio,pressure}`.

## Open questions
- Exact wheel mass, friction coefficients, and stiffness ranges (in-game XML or Workshop data would answer this).
- Whether stock steering parts include Ackermann or any speed limiting.
- Terrain deformation (mud/sand) in the current version.
- Stock coupler and trailer-hitch behaviour and force limits.
- Contents of the v0.6.15, v0.6.21, and v0.3.4 patch notes beyond the snippets.

## Sources
- https://stormworks.fandom.com/wiki/Wiki/Vehicles/Land/Wheeled_vehicles (stub; content via search snippet)
- https://steamah.com/stormworks-build-and-rescue-how-to-build-a-car/
- https://steamcommunity.com/app/573090/discussions/0/4036976402233534854 (tank torque, gearbox, auto clutch)
- https://steamcommunity.com/app/573090/discussions/0/2666627027757526072 (clutch differential, anti-slip)
- https://steamcommunity.com/app/573090/discussions/0/3088898048366268480 (suspension designs, race and truck numbers)
- https://store.steampowered.com/news/app/573090/view/3929910003151815981 (v0.6.15 title only)
- https://store.steampowered.com/news/app/573090/view/3929910003151815741 (v0.6.21 title only)
- https://steamcommunity.com/games/573090/announcements/detail/1700558821174948141 (v0.3.4 title only)
- https://steamcommunity.com/games/573090/announcements/detail/1769260276860606659 (v0.6.16-17)
- https://gameplay.tips/guides/3151-stormworks-build-and-rescue.html (engine load, via snippet)
- https://catalogue.smods.ru/archives/431057 (Mechanical Parts Expanded mod, via snippet)
