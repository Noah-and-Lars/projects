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
    ],
  },
  millwright: {
    name: 'Millwright', blurb: 'Water machines, pipes and intakes',
    items: [
      { id: 'sluice1', name: 'Sluice Box Mk I', price: 300, spawn: 'crate', data: { def: 'sluice1', family: 'water' }, desc: 'Washes gravel loads with water flow (15 L/s).' },
      { id: 'drill1', name: 'Drill Mk I', price: 450, spawn: 'crate', data: { def: 'drill1', family: 'extraction' }, desc: 'Endless gravel from its band (20 L/s).' },
      { id: 'intake1', name: 'River Intake Mk I', price: 40, spawn: 'crate', data: { def: 'intake1', family: 'water' }, desc: 'Draws 40 L/s from the river.' },
      { id: 'pipe', name: 'Copper Pipe', price: 25, spawn: 'crate', data: { def: 'pipe', family: 'water', count: 1 }, desc: 'Carries 60 L/s.' },
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
export const STARTER_KIT = ['sluice1', 'drill1', 'intake1', 'pipe', 'pipe', 'pipe', 'pipe', 'pipe', 'pipe', 'pipe', 'pipe'];
