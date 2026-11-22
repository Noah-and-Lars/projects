# Stormworks parts catalogue, part 2: electrical, fluid, logic, sensors, displays, input, lights, equipment, DLC

Genre reference only. Mechanics and numbers are summarised in our own words; no assets/text copied.

**Research limitation (read first):** Direct page fetches of the Fandom wiki (stormworks.fandom.com) and the wiki.gg mirror returned HTTP 402/401 from this environment. Content below comes from (a) web-search summaries of those wiki pages (confidence: MEDIUM, tagged [W]) and (b) the author's general knowledge of the game (confidence: LOW-MEDIUM, tagged [K], must be verified). Mass/cost columns are mostly unknown and are marked "?". Do not treat numbers as authoritative.

## 1. Summary (approximate counts)

The wiki groups components as: Vehicle Control, Mechanics, Propulsion, Logic, Displays, Sensors, Fluids, Electricity, Jet Engines, Weapons, Industry, User Input, Person Operations, Blocks [W].

| Category | Approx. distinct parts | Notes |
|---|---|---|
| Electrical | ~15 | batteries x3, generators x3 + alternator, solar, relays/switches, RTG/reactor are Industry DLC |
| Fluid | ~25 | tanks, pipes, pumps x5, valves, heat sink/radiator, steam parts, filters/ports |
| Logic | ~45 | gates, math, memory, timers, PID, composite, microcontroller (user-sized) |
| Sensors | ~25 | altimeter, speed, compass, GPS, tilt, radar x5, sonar x3, camera, etc. |
| Displays/indicators | ~25 | dials, digital, monitors (8 sizes), HUDs, lights |
| Input | ~20 | buttons, switches, levers, keypads, seats |
| Lights/sound | ~15 | headlights, spot, beacon, siren, horn, speaker |
| Equipment/special | ~30 | winch, hose, cannons, stretcher, bed, cargo, fishing, drilling |
| Weapons DLC | ~30 | guns, ammo, turrets, missiles |
| Industry DLC | ~20 | oil rig, ducts, steam engine, reactor |
| Space DLC | unconfirmed | no sources found |

## 2. Category tables

### 2.1 Electrical
Electricity only matters in the "advanced" mode setting (non-advanced mode treats power as unlimited) [W].

| Part | Function | Size | Signals | Notes |
|---|---|---|---|---|
| Battery small/medium/large | Stores energy; outputs charge level 0..1 | 1x1 / 1x2? / larger [K] | electric in/out, number out (charge) | Capacities cited: small 1,600, medium 12,800, large 256,000 in mixed units (wiki inconsistent) [W] |
| Generator small/medium/large, alternator | Converts shaft rotation to electricity; output scales with RPS squared times a constant | various | mechanical in, electric out | alternator comes with modular engines [W] |
| Solar panel | Output follows sun; zero at night | 1x1 up to 5x5 | electric out | 1x1 peak ~0.0027, 5x5 peak ~0.068 power units [W] |
| Wind turbine | Rotor driven by wind | ? | electric out | [K] low confidence |
| Electric relay / switch | Switch a power line via logic | 1x1 | on/off in, electric through | [W]/[K] |
| Electric junction / wiring | Power network joins automatically through adjacent connected blocks [K] | | | |
| Electric motor | (propulsion part, covered in part 1) | | electric in, number in (throttle) | |
| Nuclear reactor, RTG | Heat/power sources | large | fluid (coolant) + electric | Industry DLC [K] |

### 2.2 Fluids
Fluid types seen: water, diesel, jet fuel, oil, steam, coolant, plus air (some) [W]/[K].

| Part | Function | Signals / ports | Notes |
|---|---|---|---|
| Fuel/water tanks | Store a fluid; large tank ~703 L cited [W] | fluid ports, number out (level) via sensor | many sizes |
| Pipes (straight, bend, T, cross, diag) | Carry fluid between ports | fluid | adjacent-port auto connect [K] |
| Pumps (5 types) | Move fluid; max pressure ~11 atm (small) to ~60 atm (large) [W] | fluid in/out, number in (speed) | |
| Valves | Gate flow | fluid, on/off or number in | [K] |
| Heat sink / heat radiator | Cool fluids (coolant) | fluid | [W] |
| Heat exchanger | Transfer heat between loops | fluid x2 | [K] |
| Steam boiler | Water to steam; heated by coal, electric furnace, diesel, reactor | fluid | [W] |
| Steam turbine, condenser, firebox, steam piston | Steam power loop; unlocked in Steam Power research [W] | | Industry content |
| Filters / ports / nozzles | Fluid in/out of vehicle, sprays | fluid | [K] |

### 2.3 Logic
Logic evaluates each game tick (1/60 s) [W]. Microcontroller user-defined width x length sets the footprint and node count [W].

| Group | Parts | Signals |
|---|---|---|
| Boolean gates | AND, OR, XOR, NOT, NAND, NOR, XNOR | on/off in -> on/off out |
| Flip-flops/latches | SR latch, JK-ish, toggle [K] | on/off |
| Math | Add, Subtract, Multiply, Divide, Modulo, Abs, Clamp, Function (formula in x,y,z), Constant number, Equal, Greater/Less (comparators) | number -> number / on/off |
| Memory/time | Memory register (number in, write on/off), Timers (on-delay, off-delay, pulse, TON/TOF), Counter, Up/Down counter, Capacitor [K] | mixed |
| Control | PID controller: inputs target (num), measured (num), active (on/off); output control value (num) [W]. Also PID-tuned "PID Basic" [K] | |
| Switchbox | Select between inputs by on/off | |
| Composite | Composite read (on/off or number from channel N), composite write, 32-channel composite write (patch 0.6.14) [W] | composite |
| Video | Video-capable composite via camera/monitor wiring [K] | video |
| Microcontroller | Custom grid of nodes with in-game logic or Lua scripting; only way to read/write composite channels in Lua [W]. Lua exposes input.*, output.*, property.* [W] | all |
| Property inputs | Properties: toggle, number (text), slider, dropdown, color [K] | set in editor, read in logic |

### 2.4 Sensors
| Part | Output | Notes |
|---|---|---|
| Altimeter | number: height above sea level, m [W] | Navigation research |
| Speed sensor | number | [K] |
| Compass | number 0..1 turn fraction [K] | |
| GPS | X/Y number [K] | |
| Tilt / gyro | number | [K] |
| Depth | number | [K] |
| Temperature | number | [K] |
| Fluid level | number | [K] |
| Laser distance | number | [K] |
| Radar: Missile, Basic, Phalanx, Dish, AWACS | target range/bearing; basic range 240 km at 0.36 power/s, AWACS 2,000 km at 3.00 [W] | composite out |
| Sonar small/medium/large | radii ~60/100/200 km [W] | |
| Camera | video | [K] |
| Transponder/locator, radio | [K] | |
| Torquemeter | number [W] | |

### 2.5 Displays and indicators
| Part | Notes |
|---|---|
| Monitors | sizes 1x1, 1x2, 1x3, 2x2, 2x3, 3x3, 5x3, 9x5; HUD small and large [W]. Inputs: composite (video), touch output |
| Dials, digital displays, gauges, artificial horizon | number in [W] |
| Instrument panel | combined 4-slot panel [W] |
| Indicator lights, RGB indicator and RGB light | on/off or number in; RGB uses color channels [W] |

### 2.6 User input
Small and large keypads (output typed number), throttle levers, several button types, switches, pilot seat (HOTAS), seat controls with composite out [W]. Typical outputs: on/off, number axis, composite from seat.

### 2.7 Lights and sound
Headlights, spotlights, beacons, sirens, horns, speakers (sound by number/on-off) [K].

### 2.8 Special equipment
Winch/crane, hose, water cannon/fire monitor, stretcher, medical bed, defibrillator, welder, flares, transponder, cargo containers, fishing, drilling/mining [K]; Person Operations covers beds, stretchers, harnesses, outfits [W].

### 2.9 Weapons DLC / Industry DLC / Space DLC
- Weapons: guns, ammo belts, turrets, armor, missiles with composite aiming [K, unverified].
- Industry: ducts, oil rig parts, steam engine parts, reactors [W/K].
- Space: not confirmed by any source found; treat as unknown.

## 3. Logic signal types
- **On/off**: boolean.
- **Number**: float. Display range often normalized -1..1 or arbitrary.
- **Composite**: bundle of 32 channels, each channel either number or bool. Written/read through composite blocks or microcontrollers.
- **Video**: image stream from camera to monitor.
- **Electric**: power line, separate from logic wires.
- **Fluid**: pipe connection with type and pressure.
Wires connect typed nodes; mismatched types are rejected (number to on/off needs a comparator).

## 4. Design notes for our original game

### 4.1 Trimmed MVP part list (our naming)
| Our part | Replaces | Signals |
|---|---|---|
| Cell (S/M/L) | battery | power, number out charge |
| Spinner-dynamo | generator | torque in, power out |
| Sun-plate | solar | power out |
| Power gate | relay | bool in |
| Flow tank / duct / pump / gate | fluid set (1 fuel type + water) | fluid |
| Logic chip: AND/OR/NOT, Compare, Add/Mul/Clamp, Hold (memory), Delay, Pulse, Governor (PID) | logic set | bool, number |
| Bundle (composite) in/out | composite | bundle |
| Brain block (resizable user chip, optional JS script) | microcontroller | all |
| Probes: height, speed, heading, tilt, position, depth, tank level, range-finder | sensors | number |
| Panel (small/large, bundle in), dial, lamp | displays | number, bool |
| Switch, lever, stick, keypad | input | bool, number |
| Floodlight, beacon, horn | lights | bool |
| Hook line (winch) | winch | number, bool |

### 4.2 Signal-type system
Enum SignalType = Bool | Number | Bundle | Video | Power | Fluid. Logic evaluated at fixed 60 Hz tick, one-tick delay per block to avoid loops. Bundle = 32 slots of {bool|number}.

### 4.3 Part-definition schema (JSON)
```json
{
  "id": "logic.compare",
  "category": "logic",
  "size": [1,1,1],
  "mass": 5,
  "cost": 20,
  "dlc": null,
  "ports": [
    {"name":"a","dir":"in","type":"Number","pos":[0,0,0]},
    {"name":"out","dir":"out","type":"Bool","pos":[0,0,1]}
  ],
  "props": [{"name":"mode","kind":"dropdown","options":["gt","lt","eq"],"default":"gt"}],
  "sim": {"kind":"logic","fn":"compare"}
}
```

## 5. Open questions
- Exact masses, costs, sizes of nearly every part (fetch blocked).
- Microcontroller min/max grid size and node limits.
- Full list and fluid types of space/industry DLC.
- Whether wind turbines and reactors exist as listed.
- Exact composite channel count semantics for video.

## 6. Sources
- https://stormworks.fandom.com/wiki/Gameplay/Workbench/Components
- https://stormworks.fandom.com/wiki/Gameplay/Workbench/Components/Logic
- https://stormworks.fandom.com/wiki/Gameplay/Workbench/Components/Fluids
- https://stormworks.fandom.com/wiki/Gameplay/Workbench/Components/Sensors
- https://stormworks.fandom.com/wiki/Gameplay/Workbench/Components/Electricity
- https://stormworks.fandom.com/wiki/Gameplay/Workbench/Components/Displays
- https://stormworks.fandom.com/wiki/Gameplay/Workbench/Components/User_Input
- https://stormworks.fandom.com/wiki/Gameplay/Workbench/Microcontrollers
- https://stormworks.fandom.com/wiki/Video_Equipment_Research
- https://stormworks.fandom.com/wiki/Radar
- https://stormworks.fandom.com/wiki/Pumps
- https://stormworks.fandom.com/wiki/Steam_boiler
- https://stormworks.fandom.com/wiki/V0.6.14
