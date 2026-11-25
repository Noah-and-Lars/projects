/**
 * Look-at descriptions: what the line under the crosshair says about a body. Keys are the internal body names
 * the level kit uses (`body.name`, lower case). Mission items keep their own (capitalised) names; anything
 * not listed here shows its name with the first letter capitalised and no joke.
 */
export interface LookInfo { name: string; line?: string }

export const LOOK_NAMES: Record<string, LookInfo> = {
  crate: { name: 'Wooden crate', line: 'Contents: more crate, probably' },
  'fuel barrel': { name: 'Fuel barrel', line: 'Says FLAMMABLE in three languages' },
  barrel: { name: 'Rain barrel', line: 'Mostly rain, some regrets' },
  shelf: { name: 'Steel shelf', line: 'Holding up nothing in particular' },
  table: { name: 'Table', line: 'Wobbles on purpose' },
  chair: { name: 'Chair', line: 'Somebody was sitting there five minutes ago' },
  sofa: { name: 'Sofa', line: 'Coins down the back, surely' },
  bookcase: { name: 'Bookcase', line: 'Mostly unread' },
  bed: { name: 'Bed', line: 'Not on the clock, contractor' },
  plant: { name: 'Pot plant', line: 'Watered by a timer and a prayer' },
  boat: { name: 'Dinghy', line: 'Seaworthy-ish' },
  scrap: { name: 'Scrap metal', line: 'Worth less than the tetanus jab' },
  spool: { name: 'Cable spool', line: 'Heavy and very round' },
  bust: { name: 'Marble bust', line: 'Judging your technique' },
  statuette: { name: 'Statuette', line: 'Small, smug, expensive' },
  vase: { name: 'Vase', line: 'Allegedly ancient' },
  sculpture: { name: 'Sculpture', line: 'The plaque says "Untitled No. 9"' },
  van: { name: 'Works van', line: 'Your ride home' },
  hatchback: { name: 'Hatchback', line: 'Three previous owners, all nervous' },
  loader: { name: 'Wheel loader', line: 'The bucket solves most problems' },
  'alarm box': { name: 'Alarm box', line: 'Do not jiggle' },
  house: { name: 'House' }, shed: { name: 'Garden shed', line: 'Held together by spiders' },
  warehouse: { name: 'Warehouse' }, office: { name: 'Site office', line: 'Kettle still warm' }, cottage: { name: 'Cottage' },
  'pump house': { name: 'Pump house' }, lighthouse: { name: 'Lighthouse', line: 'Keeps ships away, mostly' },
  container: { name: 'Shipping container', line: 'Smells of bananas and secrets' }, 'fuel tank': { name: 'Fuel tank', line: 'Please do not' },
  tank: { name: 'Storage tank' }, fence: { name: 'Fence' }, pier: { name: 'Pier' }, lamppost: { name: 'Lamp post' },
  mansion: { name: 'Mansion', line: 'Eleven bathrooms, zero taste' }, garage: { name: 'Garage' }, gazebo: { name: 'Gazebo' },
  hedge: { name: 'Hedge', line: 'Clipped by a professional' }, wall: { name: 'Wall' }, gallery: { name: 'Gallery' },
  pool: { name: 'Swimming pool' }, greenhouse: { name: 'Greenhouse', line: 'Glass. Lots of glass.' }, footbridge: { name: 'Footbridge' },
  watchtower: { name: 'Watchtower' }, boathouse: { name: 'Boathouse' }, 'factory west': { name: 'Factory (west hall)' },
  'factory east': { name: 'Factory (east hall)' }, chimney: { name: 'Chimney', line: 'Tall, proud, temporary' },
  'boiler house': { name: 'Boiler house' }, silos: { name: 'Silos' }, piperack: { name: 'Pipe rack' }, 'road bridge': { name: 'Road bridge' },
  'loading dock': { name: 'Loading dock' }, heap: { name: 'Gravel heap' }, 'weighbridge hut': { name: 'Weighbridge hut' },
  track: { name: 'Rail track' }, 'wagon box': { name: 'Box wagon' }, 'wagon gondola': { name: 'Open wagon' }, 'wagon tank': { name: 'Tank wagon' },
  'gantry crane': { name: 'Gantry crane', line: 'Do not stand under the hook' }, kiln: { name: 'Brick kiln' }, stack: { name: 'Brick stack' },
  tree: { name: 'Tree' }, pine: { name: 'Pine tree' }, rock: { name: 'Rock', line: 'A rock. Solid work.' },
};

/** names that never get a look-at line (the ground you stand on, loose rubble) */
const SILENT = new Set(['ground', 'terrain', '']);

/** display info for a body name (null = say nothing) */
export function lookInfo(name: string): LookInfo | null {
  const key = name.trim().toLowerCase();
  if (SILENT.has(key)) return null;
  return LOOK_NAMES[key] ?? { name: name.charAt(0).toUpperCase() + name.slice(1) };
}
