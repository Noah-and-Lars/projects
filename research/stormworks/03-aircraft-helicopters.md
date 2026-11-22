# Stormworks: Build and Rescue - Aircraft (planes, helicopters, VTOL)

CONFIDENCE NOTE. The official wikis (fandom, wiki.gg) returned HTTP 401/402 and the Japanese wiki 403 to automated fetching, and web search returned mostly Steam forum threads. Items marked [VERIFIED] come from pages I actually read (Steam threads, cited below). Items marked [BACKGROUND] come from my prior general knowledge of the game and are NOT verified in this session; treat as hypotheses to confirm. Items marked [DESIGN] are my own recommendations for an original game. No numbers for the game's lift coefficients or air density were found; do not treat any such number here as Stormworks data.

## Summary
- Stormworks aircraft are player-assembled from voxel-ish blocks plus special "component" parts (wings/control surfaces, rotors, propellers, jet/turbine engines, gyros). Flight is driven by logic: seat inputs -> microcontrollers/PIDs -> engine throttle, rotor blade pitch, flap angle.
- Community consensus [VERIFIED, forum]: air is "thick" compared to e.g. Kerbal Space Program; planes can fly without conventional wings if balanced and controlled, i.e. block drag/lift from the hull matters a lot.
- Helicopters use a built-in rotor component (not blade-element physics parts). Since update 0.31 (2018) every main rotor has a collective input; a "Blade Pitch" setting of neutral lets collective control pitch, while the default "positive" setting pins pitch at +1.00 and ignores collective, for backward compatibility. [VERIFIED, Steam thread; developer Deltars statements]
- Engine/rotor coupling is the main difficulty: rotor load pulls engine RPS down; players wrap engines in PID RPS controllers; jet engines spool freely and rotors reportedly fail above roughly 130 RPS (player reports, unverified as a hard limit).
- Players' standard stabilisation: a gyro/stabiliser block plus PID loops on pitch/roll/yaw and altitude hold.

## Detailed findings

### Lift and aerodynamics
- [VERIFIED, forum] "Air is thicker than KSP": planes fly without wings if balanced. Implies lift/drag are applied from many blocks (hull surfaces), not only dedicated wing parts. A Steam guide also advises needing a "decent number" of wing components or control surfaces because engine power is limited and builds are heavy, and points to a tool for checking per-wing-component lift.
- [BACKGROUND] Wing and flap components expose an angle input (flaps/ailerons/elevators are the same part driven by a logic or seat channel). Lift seems to depend on surface size, airspeed and angle of attack, with a stall at high angle. Exact curve unknown.
- [BACKGROUND] Known exploit-class behaviour: oddly oriented blocks or spoilers/flaps used as control surfaces or air brakes; large flat hull panels giving lift. Not verified.

### Propellers and rotors
- Rotor (Light) is described as ~25% more efficient than Aircraft Propeller (Steam guide, via search summary, unverified). A small 3-cylinder modular engine at ~2100 RPM driving Rotor (Light) as propeller gives >2100 kg thrust (guide claim).
- Thrust depends on torque/power delivered and rotor speed; the Japanese community wiki says power received affects the up/down force produced (search summary only).
- Pitch control on propellers is the dependable way to get consistent thrust; with applied pitch, water/air load drops RPS sharply [VERIFIED, forum summary].
- Helicopter rules of thumb from a Steam thread [VERIFIED]: rotor speed ~60 RPS for a single main rotor, 20-30 RPS for coaxial/dual-rotor designs; ~3:1 reduction gearbox; more blades add lift but also load and heat (6 blades flew well); diesel engines are heavy for their power so jets/turbines are favoured; reducing gear ratio frees power to the rotor; measure RPS with a torque meter on the shaft (RPM = RPS*60).
- Collective vs throttle: developer stance (2018) was that raising collective increases load so effective throttle rises to hold RPM, and he wanted engines and rotors interchangeable without special rotor-engine logic. Community wanted separate collective. Compromise shipped: neutral blade pitch mode with collective input. [VERIFIED]
- Uncontrolled climb on takeoff was fixed by setting pitch to neutral and separating collective from throttle; seat throttle sensitivity set very low (1-2%) [VERIFIED].
- Tail rotor: a dedicated tail rotor component is the one that accepts negative blade angle; yaw is driven from the stabilised yaw output of the gyro; direction can be flipped (select, press O) [VERIFIED].
- After a Feb 2021 update players reported torque direction changes, ground spin-up, co-axial lift loss, and old rotors behaving differently (unverified player claims). Lesson: rotor torque conventions are fragile across patches.
- Off-centre main rotor or center of mass not under the rotor causes wobble; low CoM is more stable [VERIFIED].
- Jets: free-run to 150+ RPS unloaded; reports of rotors self-destructing ~130 RPS and jets failing ~200 RPS; players PID the throttle on RPS and pressure [VERIFIED, forum].

### Engine control with logic (PID)
- Standard recipe [VERIFIED]: setpoint = throttle * max RPS; process variable = engine RPS; output -> engine throttle; start with P=0.1, I=0, D=0.1; needs an enable input. Alternatives: formula throttle/(RPS*k+1) with k~0.05, or Lua microcontroller.
- Collective changes without stabilised engine RPS cause unstable hover [VERIFIED].

### Floatplanes / landing
- Water drag is large; wide skis beat bullet-shaped pontoons; use assist flaps for landing, not takeoff [VERIFIED]. Floats are unreliable for helis due to high CoM.

### Not found
Airports/runway specifics, instrument details, altitude/air-density limits, airships/balloons, ground effect, and patch-by-patch aerodynamic changes could not be verified. [BACKGROUND, unverified]: the game has airport locations, and gyro/altimeter/airspeed/artificial-horizon style sensors via seat/gyro/GPS/compass components.

## Player-facing feel
Good: direct control over every system (logic-wired control), satisfying hover once PID-tuned, forgiving "thick" air that makes crude planes viable. Bad: collective vs throttle coupling, engine spool/overspeed, torque spin-ups, needing to build controllers before basic flight, and balance sensitivity (CoM).

## Known problems to avoid
1. Rotor lift implicitly tied to engine throttle (developer's default) -> climbs, instability; give a real collective from day one.
2. Unbounded engine RPS (rotor/engine self-destruct, free-running jets); provide governors or gradual limits.
3. Changing torque/handedness conventions in patches breaking saved vehicles; version rotor definitions.
4. Opaque lift model: players needed external tools to see per-wing lift; ship a lift/CoL/CoM overlay.
5. Fragile copy/paste of rotor parts (needs re-merge) - make attachment robust.

## Implementation notes for our original game [DESIGN]
Per-surface aerodynamics (each wing/hull panel has area S, normal n, chord direction c, optional control deflection d):
- Local air velocity v = v_body_at_point - wind. q = 0.5*rho(h)*|v|^2. Angle of attack a = atan2(-v.n, v.c).
- CL(a): linear CL = 2*pi*a (use ~5.5/rad for finite wings) up to stall a_s ~ 15 deg, then blend to flat-plate CL = sin(2a) with a smooth drop (post-stall ~0.6 of peak). Flaps add dCL = k_f * d.
- CD = CD0 + CL^2/(pi*AR*e) below stall; CD = 2*sin^2(a) post-stall. Lift = q*S*CL perpendicular to v in the plane of n; drag opposite v. Apply at the surface's centre of pressure (quarter chord) to get natural pitch stability.
- Non-wing blocks: treat as flat plates with CD ~1.0-1.3 normal to face, small skin friction; this reproduces "thick air" and keeps odd orientations from becoming free lift if you cap CL for non-lifting-surface blocks.
- Air density rho(h) = 1.225*exp(-h/8500) (or clamp); engines scale power with rho.
Propeller/rotor options:
- Simplified: thrust T = Ct(J, pitch) * rho * n^2 * D^4, torque Q = Cq * rho * n^2 * D^5, with advance ratio J = V/(nD); engine RPS solves torque balance (I*dw/dt = Tq_engine - Q). Cheap, stable, good default.
- Blade element: per blade, N radial segments, local inflow from rotation + axial velocity, pitch angle -> same CL/CD curve as wings; integrate forces for thrust, torque, hub moments (gives cyclic, gyroscopic effects, retreating-blade stall). Costly; use 4-6 segments per blade and fixed 120+ Hz sub-stepping. Recommend simplified thrust model plus tilt-of-disc cyclic term: force direction = disc normal tilted by cyclic input; tail rotor same with negative pitch.
- Collective is a separate input from throttle; engine governor (below) holds RPS.
- Safety: rotors have a max rated RPS with visible overspeed warning, not silent explosion.
PID examples (discrete, dt):
- Engine governor: err = target_rps - rps; out = Kp*err + Ki*integral(err, clamped) + Kd*d(err)/dt; Kp 0.1, Kd 0.1 from community; add anti-windup and enable gate.
- Attitude hold: outer loop angle error -> desired rate (P); inner loop rate error -> control surface/cyclic (PD). Altitude hold: alt error -> vertical speed target -> collective via PI.
Data structures: AeroSurface{S, normal, chord, cp_offset, cl_curve_id, flap_channel, flap_gain, max_defl}; CurveTable{angle->CL,CD}; Rotor{radius, blades, pitch_min/max, collective_ch, cyclic_ch, inertia, rated_rps, shaft_port}; Engine{torque_curve(rps), inertia, spool_tau, throttle_ch}; SignalBus of named float channels; a gyro/IMU sensor block outputting attitude, rates, accelerations, altitude, airspeed.
Tools: in-editor CoM/CoL overlay, per-surface lift gizmo, flight test range.

## Open questions
- Actual Stormworks lift/drag coefficients, stall angle, and how non-wing blocks contribute (need wiki.gg or in-game testing).
- Whether rotors use a blade-element or lookup thrust model, and exact torque equations.
- Air density vs altitude, airports, airship/balloon support, ground effect.
- Patch history for aerodynamics (recommend reading the Steam patch-note archive and wiki.gg changelogs directly).

## Sources
- https://steamcommunity.com/app/573090/discussions/0/1699416432421863009 (collective vs throttle, developer comments, neutral blade pitch)
- https://steamcommunity.com/app/573090/discussions/0/3114772813467125649 (rotor torque/jet RPS/CoM threads, 2021)
- https://steamcommunity.com/app/573090/discussions/0/3148519255759709792 (engine RPS PID, thick air, float planes)
- https://steamcommunity.com/app/573090/discussions/0/3187988018481459278 (helicopter rotor RPS, gearing, blades)
- Search-result-only (not read in full): https://wikiwiki.jp/sbarjp/PROPULSION ; https://steamcommunity.com/app/573090/discussions/0/1741100729953548655 ; https://gameplay.tips/guides/3151-stormworks-build-and-rescue.html
- Unreachable (401/402): https://stormworks.fandom.com/wiki/Wings ; https://stormworks.wiki.gg/wiki/Aerodynamics
