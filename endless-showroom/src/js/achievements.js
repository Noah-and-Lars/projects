// Achievements: small goals, saved on this device, with a toast when one
// unlocks and a list on the menu.
export const ACH = [
  { id: 'night1', name: 'Closing Time', desc: 'Survive your first night.' },
  { id: 'week', name: 'Regular Customer', desc: 'Survive 7 nights in a row.' },
  { id: 'month', name: 'Part of the Furniture', desc: 'Survive 30 nights in a row.' },
  { id: 'build50', name: 'Interior Designer', desc: 'Place 50 pieces of furniture.' },
  { id: 'build500', name: 'Architect', desc: 'Place 500 pieces of furniture.' },
  { id: 'shove20', name: 'Excuse Me', desc: 'Shove 20 members of staff.' },
  { id: 'eat50', name: 'Snacker', desc: 'Eat or drink 50 things.' },
  { id: 'full', name: 'Hoarder', desc: 'Fill all 16 inventory slots.' },
  { id: 'cafe', name: 'Lunch Break', desc: 'Find a cafeteria.' },
  { id: 'fort', name: 'Somebody Was Here', desc: 'Find an abandoned fort.' },
  { id: 'hide', name: 'Wardrobe Malfunction', desc: 'Hide inside a wardrobe at night.' },
  { id: 'high', name: 'Top Shelf', desc: 'Stand as high as the top of a warehouse rack (4.3 m).' },
  { id: 'far', name: 'Lost in the Aisles', desc: 'Walk 1 km from where you started.' },
  { id: 'whistle', name: 'Over Here!', desc: 'Whistle 10 times.' },
  { id: 'cushion', name: 'Soft Landing', desc: 'Have a bed, sofa or beanbag save you from a fall that would have killed you.' },
  { id: 'slide', name: 'Wet Floor', desc: 'Slide 10 times.' },
  { id: 'patience', name: 'Worth the Wait', desc: 'Pick up the store safe. It takes a while.' },
  { id: 'landmark', name: 'Rare Find', desc: 'Find the rarest pillar in the store.' },
  { id: 'lights', name: 'Lights Out', desc: 'Switch off 10 lamps.' },
  { id: 'bear', name: 'Bear Hug', desc: 'Have a giant plush bear save you from a fall that would have killed you.' },
  { id: 'gift', name: 'For Me?', desc: 'Open a gift box.' },
];

let state = { got: {}, n: {} };
try { state = Object.assign(state, JSON.parse(localStorage.getItem('es-ach') || '{}')); } catch (_) {}
const save = () => { try { localStorage.setItem('es-ach', JSON.stringify(state)); } catch (_) {} };
let notify = () => {};
export function onUnlock(fn) { notify = fn; }
export function has(id) { return !!state.got[id]; }
export function unlock(id) {
  if (state.got[id]) return;
  const a = ACH.find((x) => x.id === id); if (!a) return;
  state.got[id] = Date.now(); save(); notify(a);
}
// Count something towards a goal; unlock when the count reaches `at`.
export function count(key, id, at, by = 1) {
  state.n[key] = (state.n[key] || 0) + by; save();
  if (state.n[key] >= at) unlock(id);
}
export function list() { return ACH.map((a) => ({ ...a, got: !!state.got[a.id] })); }
