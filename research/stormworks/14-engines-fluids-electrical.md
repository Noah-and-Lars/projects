# Stormworks: engines, drivetrain, fluids, heat, electricity (genre reference)

Confidence note: the web tools here returned thin results (official wiki is a stub or paywalled; several fetches failed with 402/404/526). Items marked [V] were seen in fetched/search sources; items marked [M] are from general knowledge of the game and unverified. All numbers should be treated as approximate and re-tested before use. Nothing here is copied text; all is paraphrase.

## Summary
Stormworks models power as three loosely coupled networks plus heat:
1. Rotational (RPS) network: engines, motors, gearboxes, clutches, props/wheels share angular speed; torque is shared/limited by load.
2. Fluid network: pipes, pumps, valves, tanks carry fuel, air, water, coolant, exhaust, etc. with per-port flow and pressure-like behavior.
3. Electric network: producers (generators, alternators, solar/wind, batteries) and consumers; batteries have charge; motors and many parts need power.
4. Heat: engines heat with RPS; coolant circulation and radiators remove it.
The "modular engine" (cylinders on a crankshaft, with intake, fuel injector, exhaust, coolant) is the signature system; its depth comes from the player tuning air/fuel ratio, gearing, cooling, and optionally an ECU in microcontroller logic.

## Detailed findings
### Modular engine [V unless marked]
- Output RPS range roughly 0-60; about 2 RPS needed to sustain itself without the starter; torque rises with RPS (one player says peak near 42 RPS, unconfirmed).
- Max achievable RPS falls as load rises. Partially slipping a clutch reduces load and lets engine rev higher.
- Fuel consumption is driven by RPS (explosions per second), not by load. Higher RPS = more fuel, more heat, more fire risk, more noise. Lower RPS at full throttle gives better economy per unit of work in player testing; each engine has a best-efficiency RPS band set by gearing.
- Efficiency measurement trick from players: fuel consumption delta divided by RPS gives per-explosion efficiency.
- Air/fuel ratio (AFR) = air volume / fuel volume per cylinder, readable from the cylinder tooltip or composite logic output (air volume, injected fuel volume, temperature). A player reports ~14:1 at max RPS. Ideal ratio is a tuning target; ECUs in logic adjust throttle/injector to hold it.
- Exhaust: matters little provided gas can leave; insufficient exhaust visible as thicker smoke; add pipes.
- Air: more RPS needs more air intake flow; intake must actually receive air. Turbo/supercharger setups make airflow unpredictable and often stall naive ECUs.
- Heat rises with RPS; pumping coolant (water preferred) through engine lowers it; more flow, more cooling. Radiators (3x3 / 5x5) on the loop; coolant manifold per cylinder. Players report ~105 C on calm water with no cooling upgrades, trouble above ~15 RPS; with scoop+pump+reservoir stable below ~30 C. Typical stabilized engine temps in helicopters ~91-93 C.
- Small-engine sweet spot reported ~8 RPS. Capping RPS to 15 is the simple overheating fix; going to ~28 needs electronic stabilization.
- Common gearing figures: boat 5:2, outboard 5:9, generator gearing ~1:7 to 1:9 to charge battery.
- Engine-type fuel efficiency ranking (guide): pure combustion highest draw; hybrid very low but heavy; diesel-electric generators use very little fuel but batteries are heavy.
- Electric-assist/starter: an electric motor drives the crank to starting RPS (needs battery power).

### Older fixed engines [M]
Pre-modular engines are single parts (small/medium/large/ diesel/ jet/ turbine variants) with fixed max RPS and torque, a fuel/air/coolant port set, and a temperature. Simple throttle in, RPS out; they remain as easy defaults.

### Electric [V/M]
- Battery charge level drives motor performance: reported ~100% output at full charge falling to ~40% at 50%, flat below that (player estimate); keep above ~90%.
- Generators/alternators convert RPS to power; clutch-controlled to prevent drag on engine. Fluid generators burn fuel directly. Solar and wind exist [M]. Electric motors scale power with supplied electricity and RPS [M].
- Gearbox, control surfaces, and many parts need electric power to function [V].

### Fluids [V/M]
- Pipes, ports, pumps, valves, tanks; fluid settles by gravity through pipes even without pumps [V].
- Pump throughput is player-measured around ~100-115 units/s per closed system for large pump setups [V, anecdotal]; small impeller+motor is weak, gearing barely helps.
- Fluid types [M]: diesel, jet fuel, water, oil, coolant, air, exhaust, steam, oil, etc., each with density/ buoyancy effects; compartments are sealed volumes that can flood.
- Common bug cause: pipe inside wall not connecting to port [V].

### Steam, turbines, jet, nuclear [M, unverified]
Jet engines/turbines take air+fuel and output thrust or shaft RPS. Steam/boilers/nuclear exist in later content with heat->steam->turbine chains; I could not verify numbers.

## Player-facing feel
- Satisfying: tweaking AFR and gearing until an engine hums at a sweet spot; hearing and seeing smoke/heat; building a cooling loop that visibly works.
- Frustrating: stalls from unbalanced air/fuel, overheating at high RPS, ECU tuning for turbos, invisible pipe misconnections.
- Efficiency culture: low-RPS high-gear engines, diesel-electric hybrids, generator on a clutch.

## Known problems
- Overheating of big engines (coolant washing back, pump placement); coolant manifold scaling oddities.
- Turbo/supercharged engines destabilize ECUs.
- Engines trembling/rolling at high RPS; small electric pump performance.
- Documentation sparse; players reverse-engineer by tooltip.

## Implementation notes for our original game
- Rotational network: rebuild components graph per vehicle edit (not per tick). Treat each connected shaft group (clutches/gearboxes as edges with ratio and engagement) as one "rigid body" with an effective inertia; per tick: sum driving torques(rpm), subtract load torques, integrate omega += (T_net / I_eff) * dt, then propagate omega through ratios. Gearbox = edge with ratio r (omega_out = r * omega_in; torque_in = torque_out * r). Clutch = torque-limited friction edge: transfer = clamp(k*(w_a - w_b), +-engagement*Tmax). Differentials/splitters = equal-split of torque.
- Simplified engine model: torque(w) = Tpeak * curve(w/wmax) * throttle * mixQuality; mixQuality = bell-shaped function of AFR around ideal ~14; fuel_rate = k * cylinders * w * throttle (RPS-driven, as Stormworks); air demand = same*AFR; heat_gen = a*w + b*torque; stall if w<w_min and no starter. Pre-baked torque curve as a 8-point table. Size scaling: torque ~ displacement, inertia ~ displacement.
- Fluid network: nodes = tanks/ports, edges = pipes with conductance. Per tick, solve flow with simple relaxation: flow = conductance * (pressure_a - pressure_b), pressure = volume/capacity (+ height*density*g). Pumps add a pressure head. Do 2-4 relaxation iterations per tick; use per-fluid scalar tanks (single fluid type per tank, with a mixing rule: mixed tank becomes "contaminated" fluid). Keep air/exhaust as simple scalar flows rather than full gas physics.
- Electric network: group connected conductors into islands (union-find at edit time). Per tick per island: supply = sum producers, demand = sum consumers; satisfaction = min(1, (supply+battery_discharge)/demand); batteries charge from surplus. Apply satisfaction as a multiplier to consumers. No Kirchhoff solving needed.
- Heat: one scalar per engine and per coolant tank; dT = (heat_gen - coolant_flow * cp * (T - T_coolant_in)) * dt; radiator edge exchanges heat with ambient/water proportional to area and airspeed.
- Tick order: input/logic -> electric islands -> engines (torque) -> rotational solve -> fluid flow -> heat -> consumption/damage -> physics forces. Fixed 60 Hz sub-step, rotational/fluid/electric updates can run at 30 Hz.
- Browser cost: all graphs are small (hundreds of nodes); use typed arrays, rebuild topology on edit only, sleep inactive islands.
- Design ideas: expose AFR and cooling as player-tunable with a visible gauge; ship an auto-ECU part for beginners; keep sweet-spot efficiency curves so gearing choices matter.

## Open questions
- Exact torque curve, cylinder displacement scaling, AFR ideal and tolerance bands.
- Exact heat constants, radiator exchange rates, fluid densities, pump head/flow numbers.
- Steam/nuclear/jet details in current versions; battery capacity per size; solar/wind outputs.
- How rotational torque is split among multiple loads.

## Sources
- https://gameplay.tips/guides/6531-stormworks-build-and-rescue.html (engine guide, fetched)
- https://gameplay.tips/guides/3151-stormworks-build-and-rescue.html (designing engines guide, not fetchable)
- https://www.gamenguides.com/stormworks-build-and-rescue-beginners-engine-guide
- https://steamcommunity.com/app/573090/discussions/0/4411921213486560574 (AFR/RPS discussion)
- https://wikiwiki.jp/sbarjp/MODULAR%20ENGINES (fan wiki, modular parts)
- https://stormworks.gamepedia.com/Fluids_guide (stub)
- https://www.instructables.com/Stormworks-Basic-Engines
- https://steamcommunity.com/app/573090/discussions/0/3110270484055550873 (fluid/pump threads)
