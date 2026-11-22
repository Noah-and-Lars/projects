// Shop catalogues (BUILD_BRIEF 3.6 cost curve). Each entry spawns an entity
// on the shop's delivery pad: a tool, a sack, or a machine crate.
export const SHOPS = {
  store: {
    name: 'General Store', blurb: 'Tools and starter gear',
    items: [
      { id: 'shovel2', name: 'Sturdy Shovel', price: 25, spawn: 'shovel', data: { cap: 2 }, desc: 'Holds 2 loads. Topsoil and clay.' },
      { id: 'steelshovel', name: 'Steel Shovel', price: 600, spawn: 'shovel', data: { cap: 2, tier: 2 }, desc: 'Cuts the gravel bed (band 2). Holds 2 loads.' },
      { id: 'glimmershovel', name: 'Glimmer Shovel', price: 2000, spawn: 'shovel', data: { cap: 3, tier: 3 }, desc: 'Cuts slate (band 3). Holds 3 loads.' },
      { id: 'pick', name: 'Pick', price: 120, spawn: 'pick', desc: 'Breaks ground fast; drops clods.' },
      { id: 'bucket', name: 'Bucket', price: 5, spawn: 'bucket', desc: 'Holds 4 loads.' },
      { id: 'pan', name: 'Pan', price: 12, spawn: 'pan', desc: 'Wash 2 loads at a time in the river.' },
      { id: 'crucible', name: 'Crucible & Campfire', price: 140, spawn: 'crate', data: { def: 'crucible', family: 'heat' }, desc: 'Melts up to 10 kg of one ore into an ingot. Slow but needs no fuel.' },
      { id: 'grinder', name: 'Grinding Wheel', price: 90, spawn: 'crate', data: { def: 'grinder', family: 'heat' }, desc: 'Three clicks turn an uncut gem into a cut one.' },
      { id: 'wrench', name: 'Wrench', price: 60, spawn: 'wrench', desc: 'Takes 10% wear off a machine per click.' },
      { id: 'repairkit', name: 'Repair Kit', price: 150, spawn: 'repairkit', data: { uses: 5 }, desc: 'Fully repairs a machine. 5 uses.' },
    ],
  },
  millwright: {
    name: 'Millwright', blurb: 'Water machines, pipe and intakes',
    items: [
      { id: 'sluice1', name: 'Sluice Box Mk I', price: 300, spawn: 'crate', data: { def: 'sluice1', family: 'water' }, desc: 'Washes gravel loads with water flow (15 L/s). Hopper on top.' },
      { id: 'drill1', name: 'Drill Mk I', price: 450, spawn: 'crate', data: { def: 'drill1', family: 'extraction' }, desc: 'Endless gravel from band 1 (20 L/s). Place it in a claim you own.' },
      { id: 'intake1', name: 'River Intake Mk I', price: 40, spawn: 'crate', data: { def: 'intake1', family: 'water' }, desc: 'Draws 40 L/s. Its mouth must sit in the river.' },
      { id: 'pipe_copper', name: 'Copper Pipe · 2 m', price: 25, spawn: 'coil', data: { tier: 'copper', m: 2 }, desc: 'Carries 60 L/s. Click a port, then another, to lay a run.' },
      { id: 'pipe_copper10', name: 'Copper Pipe · 10 m coil', price: 120, spawn: 'coil', data: { tier: 'copper', m: 10 }, desc: 'A longer coil for longer runs.' },
      { id: 'junction', name: 'Pipe Junction', price: 30, spawn: 'crate', data: { def: 'junction', family: 'water' }, desc: 'Joins up to four pipe runs: split one supply to several machines.' },
      { id: 'pipe_steel', name: 'Steel Pipe · 2 m', price: 180, spawn: 'coil', data: { tier: 'steel', m: 2 }, desc: 'Carries 140 L/s.' },
      { id: 'headtank', name: 'Header Tank', price: 350, spawn: 'crate', data: { def: 'headtank', family: 'water' }, desc: 'Stores 2,000 L; gives up to 60 L/s while above 10%.' },
      { id: 'settle', name: 'Settling Tank', price: 250, spawn: 'crate', data: { def: 'settle', family: 'water' }, desc: 'Takes 3 silt out of the water: less wear downstream.' },
      { id: 'booster', name: 'Booster Pump', price: 600, spawn: 'crate', data: { def: 'booster', family: 'water' }, desc: '+50% of the network\'s intake flow. Burns 1 kg quartz a minute.' },
      { id: 'mallet', name: 'Mallet', price: 40, spawn: 'mallet', desc: 'LMB locks a placed machine, RMB unlocks it.' },
    ],
  },
  foundry: {
    name: 'Foundry Yard', blurb: 'Heat machines and the workbench',
    items: [
      { id: 'kiln', name: 'Kiln', price: 1200, spawn: 'crate', data: { def: 'kiln', family: 'heat' }, desc: 'Melts 10 kg of one ore every 8 s. Burns quartz. Reheats ingots.' },
      { id: 'workbench', name: 'Workbench', price: 120, spawn: 'crate', data: { def: 'workbench', family: 'heat' }, desc: 'Hot ingot (+ cut gem) into tool heads, rings, chains, chalices.' },
      { id: 'crucible', name: 'Crucible & Campfire', price: 140, spawn: 'crate', data: { def: 'crucible', family: 'heat' }, desc: 'A small, slow, fuel-free furnace.' },
      { id: 'grinder', name: 'Grinding Wheel', price: 90, spawn: 'crate', data: { def: 'grinder', family: 'heat' }, desc: 'Cuts uncut gems.' },
    ],
  },
  wagons: {
    name: 'Wagon Shed', blurb: 'Fuel and vehicles',
    items: [
      { id: 'charcoal', name: 'Sack of Charcoal', price: 15, spawn: 'sack', desc: 'About 8 minutes of driving.' },
      { id: 'hauler', name: 'Old Hauler (replacement)', price: 500, spawn: 'vehicle', data: { type: 'hauler' }, desc: 'A second hauler, delivered to the yard.' },
    ],
    callVehicle: true,
  },
};
// The starter automation kit (BUILD_BRIEF 3.6): sluice, drill, intake, 8 pipes.
export const STARTER_KIT = ['sluice1', 'drill1', 'intake1', 'junction', 'pipe_copper', 'pipe_copper', 'pipe_copper', 'pipe_copper', 'pipe_copper', 'pipe_copper', 'pipe_copper', 'pipe_copper'];
