// Which attachments are on each gun. Each gun has slots (a sight, the muzzle,
// under the barrel), each with the attachments that fit it; the loadout menu
// (B, src/loadoutMenu.js) chooses one per slot, or none. The choice is
// remembered in the browser. The gun layer shows the chosen parts and the game
// follows what they change (see src/viewmodel/viewmodel.js and src/main.js).

export const SLOTS = [
  { id: 'optic', name: 'Sight' },
  { id: 'muzzle', name: 'Muzzle' },
  { id: 'rail', name: 'Under the barrel' },
];

// For each gun (its key in LOADOUT), the attachments each slot takes:
// { id, name }. A gun with none has no attachments yet.
export const ATTACHMENTS = {
  pistol: {},
  pistol45: {},
};

const STORAGE_KEY = 'project-fish.attachments';

export class Loadout {
  constructor() {
    this.chosen = {}; // gun -> slot -> attachment id
    this.listeners = [];
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
      if (saved && typeof saved === 'object') this.chosen = saved;
    } catch {
      // No saved choice (or storage is off): start bare.
    }
    // Forget anything that no longer exists.
    for (const [gun, slots] of Object.entries(this.chosen)) {
      for (const [slot, id] of Object.entries(slots || {})) {
        if (!this.fits(gun, slot, id)) delete slots[slot];
      }
    }
  }

  // Whether attachment `id` fits `slot` on `gun`.
  fits(gun, slot, id) {
    const options = (ATTACHMENTS[gun] || {})[slot] || [];
    return options.some((a) => a.id === id);
  }

  // The attachment in `slot` on `gun`, or null.
  get(gun, slot) {
    return (this.chosen[gun] || {})[slot] || null;
  }

  // Everything on `gun`: { slot: id }.
  on(gun) {
    return { ...(this.chosen[gun] || {}) };
  }

  // Puts `id` in `slot` on `gun` (null takes it off).
  set(gun, slot, id) {
    if (id !== null && !this.fits(gun, slot, id)) return;
    this.chosen[gun] = this.chosen[gun] || {};
    if (id === null) delete this.chosen[gun][slot];
    else this.chosen[gun][slot] = id;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.chosen));
    } catch {
      // Can't remember it; it still applies until the page is closed.
    }
    for (const fn of this.listeners) fn(gun, slot, id);
  }

  // Calls fn(gun, slot, id) whenever something changes.
  onChange(fn) {
    this.listeners.push(fn);
  }
}
