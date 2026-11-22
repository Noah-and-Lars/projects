# Stormworks parts catalogue, part 1: structural, mechanical, propulsion

CONFIDENCE WARNING. The Fandom wiki (stormworks.fandom.com) returned HTTP 402 to every fetch; geometa/wiki.gg mirrors returned 401/404. Only search snippets and two Steam/gameplay.tips guides were readable. Almost no per-part mass/cost/size numbers could be verified. Tables below are from recalled general knowledge of the game and are marked: [V] = seen in a fetched source, [R] = recalled, unverified. Numbers (mass, cost, block size) are deliberately left "?" rather than invented. A follow-up agent with working wiki access (or in-game screenshots) should fill the "?" cells.

## 1. Summary (approximate category counts, [R])
| Category | Approx. item count | Notes |
|---|---|---|
| Blocks (structural) | ~20+ shapes x several materials | cube, half, quarter/slab, wedge, pyramid, corner/inverse corner, slopes, rounded, beams, round pipes |
| Windows/glass | ~6-10 | flat panes, wedge/corner glass, cockpit canopies |
| Doors/hatches | ~8-10 | sliding, hinged, hatches, hangar/garage doors, airlock-style |
| Seats | ~6-8 | pilot, driver, passenger, bench, bunk/bed, jet pilot, etc. |
| Decorative/structural | many | ladders, railings, pipes, lights frames, stairs |
| Wheels | ~10+ | several sizes; rigid & suspension variants; steering variants |
| Pivots/hinges/sliders | ~10-15 | plain, robotic (angle-targeted), velocity (speed-driven), hinges, sliders/pistons |
| Connectors | ~8-12 | rope hooks, winch, magnets, couplings, docking clamps, electric/fluid connectors |
| Drivetrain | ~10 | gearbox, clutch, flywheel, differential-like parts, shafts |
| Engines | ~15-25 | small/large/very large combustion, electric motors, modular engine (cylinders, pistons, intake, exhaust...), steam/coal turbine, nuclear turbine |
| Jet engines | 9 modular + 5 duct parts [V: Steam 2018 update snippet] | intake, compressor, combustion chamber, turbine, exhaust, ducts |
| Propellers/rotors | ~8-12 | props, large/small rotors, helicopter blades |
| Aero | ~10-15 | wings, flaps, rudders, stabilizers |
| Misc | few each | landing gear, tracks, ballast tanks, buoyancy, anchors, parachutes |

## 2. Category tables
Columns: Item | Function | Size (blocks) | Mass | Cost | Key I/O | DLC. "?" = not verified.

### 2.1 Blocks
| Item | Function | Size | Mass | Cost | I/O | DLC |
|---|---|---|---|---|---|---|
| Cube / half / quarter | solid fill; material variants (steel, aluminium, glass-fibre/wood style) change mass, strength, hull rating [R] | 1x1x1 grid (blocks are on a 0.25 m grid) [R] | ? | ? | none | base |
| Wedge, corner wedge, pyramid | slope & aerodynamic fairings | 1x1x1 | ? | ? | none | base |
| Inverse corner/wedge | concave fillets | 1x1x1 | ? | ? | none | base |
| Slopes (long/gentle), rounded, hull panels | hull shaping | multi-block | ? | ? | none | base |
| Beams / girders / round tubes | lightweight structure | ?x1x1 | ? | ? | none | base |
Notes: Block material affects mass and watertight/pressure rating [R]; blocks are the "voxel" substrate that parts attach to.

### 2.2 Windows/glass; doors/hatches; seats
| Item | Function | Size | Mass | Cost | I/O | DLC |
|---|---|---|---|---|---|---|
| Glass panes/wedges/canopies | transparent hull, visibility | 1-n | ? | ? | none | base |
| Sliding/hinged/garage doors, hatches | openable openings, can be driven by button/composite | 1x2 up to large | ? | ? | open/close channel, state | base |
| Pilot/driver seat | player control: provides steering, throttle, buttons, axes to the electrical network | 1x1(x2) | ? | ? | outputs axes (W/S, A/D, up/down), buttons, hotbar | base |
| Passenger seat/bench/bunk | carry characters; bunk for rest/heal | ? | ? | ? | none | base |
| Jet/aircraft pilot seat | seat with flight-oriented inputs | ? | ? | ? | same as pilot | base |
Design takeaway: seats are the sole interface between the player and the control network; everything else is wiring.

### 2.3 Wheels, tracks, suspension, steering, landing gear
| Item | Function | Size | Mass | Cost | I/O | DLC |
|---|---|---|---|---|---|---|
| Wheels (several diameters) | drive/idle wheels; torque in via shaft, ground friction out | ~1 to ~5+ blocks diameter | ? | ? | torque input; steering via pivot | base |
| Suspension wheels | wheel on a spring/damper mount | ? | ? | ? | none | base |
| Steering pivot / wheel | angle-limited pivot driven by seat steering axis | ? | ? | ? | steer axis | base |
| Tracks | continuous tracks, powered | ?x? | ? | ? | torque in | base |
| Landing gear | retractable via pivot/slider | ? | ? | ? | retract signal | base |

### 2.4 Pivots, hinges, sliders, bearings
| Item | Function | I/O |
|---|---|---|
| Pivot (passive) | free rotation joint; bearing | none |
| Robotic pivot | rotates to commanded target; input is scaled, e.g. a 45 degree target needs input 0.5 [V: search snippet of wiki Mechanics page] | target angle in, angle out (composite) |
| Velocity pivot | rotates at commanded speed (drives rotor/turret) | speed in |
| Hinge, robotic hinge | single-axis hinge; tilt rotors/flaps [V partial] | target in |
| Slider / piston (robotic) | linear actuator; extends to commanded position | target in, position out |
| Bearing | mount rotating assembly that passes torque (shaft) | torque pass-through |
Sizes/masses/costs: ?.

### 2.5 Connectors, ropes, winches, magnets, docking
| Item | Function |
|---|---|
| Rope hook/anchor point | rope attachment points (guide suggests >=2 per boat, fore & aft [V]) |
| Winch | reel in/out rope, controllable |
| Electric magnet | attach to metal, switched on/off |
| Docking clamps/connectors | rigid couple two vehicles; may pass electricity/fluid/data (guide notes electric train connector at standard height 4 blocks [V]) |
| Couplings (train) | link rail cars |
Sizes/mass/cost: ?.

### 2.6 Drivetrain
| Item | Function | I/O |
|---|---|---|
| Gearbox | ratio selection; guide uses 3:1 and reverse -1:1 setups on diesel [V] | shaft in/out, ratio control |
| Clutch | engage/disengage torque; modular engine clutch kept open by constant 1 [V] | engage value |
| Flywheel | rotational inertia store | shaft |
| Shafts/couplers/differential | route torque | shaft |
| Alternator/generator | convert shaft RPS to electricity; ratio ~1:7.5 tuning for max output [V] | shaft in, power out |

### 2.7 Engines
| Item | Function | Key figures | DLC |
|---|---|---|---|
| Small / large / very large diesel | combustion engines; fuel use depends on RPS not load [V]; best efficiency near ~7-8 RPS (small ~8) [V]; heat rises past ~15 RPS; keep <20 [V]; modular range cited 0-60 rps, >2 rps needed to self-run [V, unverified forum] | mass/cost ? | base |
| Electric motor | driven from battery; output ~100% at full battery, ~40% at 50%, flat below [V guide] | ? | base |
| Modular engine | build from cylinders, intake/exhaust, coolant manifold, etc.; needs a microcontroller; electric motor starter runs 2-3 s to pass 3 rps [V] | ? | base |
| Coal/steam turbine | large boats/trains; slow start; firebox + steam release valve [V] | ? | base |
| Nuclear turbine | very large builds; slow power-up; needs control unit vs overheating [V] | ? | base/DLC (varies) [R] |
| Jet engine (modular) | intake, compressor, combustion chamber, turbine, exhaust (min. one each) [V]; needs PID/microcontroller [V]; used for jets, boats, helicopters | 9 engine + 5 duct parts | base |
| Rocket parts | Space DLC [R] | ? | Space |

### 2.8 Propellers, rotors, rudders, aero
| Item | Function |
|---|---|
| Propellers (several sizes) | thrust (air or water) from shaft; driven through gearbox+clutch [V] |
| Helicopter rotors (small/large) | lift; recommended single main + tail rotor first; coaxial/tandem/tilt variants possible [V] |
| Rudders, fins | steering surfaces, water/air |
| Wings, flaps, stabilizers, control surfaces | lift/drag by area and angle; flaps via robotic hinge |

### 2.9 Buoyancy, ballast, anchors, parachutes
| Item | Function |
|---|---|
| Ballast tank | flood/blow with pump to change buoyancy (submarines); bilge pump with threshold example 1..10000 [V] |
| Floats / buoyant blocks | displacement |
| Anchor | holds position (winch+anchor) |
| Parachute | drag deployed by signal |

## 3. Notable design patterns
- Everything mechanical is a graph of: seat (inputs) -> logic -> actuators (pivots/clutches/gearboxes) -> torque shaft -> propulsor.
- Engine tuning is an RPS-vs-fuel problem: gear so the engine sits at its efficient RPS while the propulsor sits at its own optimum.
- Torque path is explicit (pipes/shafts color-coded in community convention: orange for torque [V]).
- Robotic pivots take normalized targets (0..1 maps to angle range) so one analog input maps to any joint.
- Jet engine = ordered chain of modules; flow connectivity determines thrust, requiring a controller.
- Electric drive is a hybrid option: generator + battery + motor, with motor output sagging as battery depletes [V].

## 4. Design notes for our original game
Trimmed MVP part list (own names):
- Structure: Plate (cube), Slab (half), Ramp (wedge), Corner, Frame (beam), Pane (glass).
- Hull/Control: Cockpit seat (outputs throttle/steer/aux axes + 4 buttons).
- Motion: Roller wheel (S/M/L), Spring roller (suspension), Joint (passive), Servo joint (target angle), Spinner joint (target speed), Ram (linear actuator).
- Linking: Hook, Winch, Magnet, Dock clamp.
- Power: Burner engine (S/M/L), Cell motor, Dynamo, Cell battery, Fuel tank.
- Drive: Gear stack (ratio), Clutch, Flywheel.
- Thrust: Screw (propeller S/M), Rotor (blade set), Fan-jet (intake+core+nozzle as 3 modules, simplified).
- Control surfaces: Fin, Wing section, Flap, Rudder.
- Float/ballast: Float block, Ballast tank, Anchor, Chute.

Schema sketch:
```json
{
  "id": "burner_engine_m",
  "category": "engine",
  "size": [2,2,3],
  "mass_kg": 0,
  "cost": 0,
  "material_class": "metal",
  "ports": [
    {"name":"shaft_out","type":"torque","pos":[0,0,3]},
    {"name":"fuel_in","type":"fluid","pos":[1,2,0]},
    {"name":"throttle","type":"signal","dir":"in"}
  ],
  "params": {"rps_range":[2,20],"sweet_rps":8,"fuel_per_rps":0.0,"torque_curve":[[0,0],[8,1],[20,0.6]]},
  "joint": null,
  "unlock": "base"
}
```
(All numeric values are placeholders to be tuned; real Stormworks values unverified.)

## 5. Open questions
- Exact mass/cost/size for every part (wiki inaccessible).
- Which parts belong to which DLC (Industrial Frontier, Space, Weapons, Military etc.).
- Wheel size list and suspension parameters; tracks' exact behavior.
- Real engine RPS/torque curves and fuel rates; jet module list.
- Structural strength/joint-break model.

## 6. Sources
- https://stormworks.fandom.com/wiki/Category:Components (blocked, only seen via search snippet)
- https://stormworks.fandom.com/wiki/Gameplay/Workbench/Components/Mechanics (blocked; snippet only)
- https://steamcommunity.com/sharedfiles/filedetails/?id=2375369089 (Steam guide "Stormworks 101", read)
- https://gameplay.tips/guides/6531-stormworks-build-and-rescue.html (engine design guide, read)
- https://steamcommunity.com/sharedfiles/filedetails/?id=1971613976 (original engine guide, snippet)
- https://store.steampowered.com/news/posts/?appids=573090 (jet engine update, snippet)
- https://en.wikipedia.com/wiki/Stormworks:_Build_and_Rescue
