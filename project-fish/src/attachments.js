// Which attachments are on each gun. Each gun has slots (a sight, a mount,
// the muzzle, under the barrel, the side), each with the attachments that fit
// it; the loadout menu (B, src/loadoutMenu.js) chooses one per slot, or none.
// The choice is remembered in the browser. The gun layer shows the chosen
// parts and works out what they change (src/viewmodel/viewmodel.js,
// setAttachments; the PF-9's are modelled in its file, see pistol9.js), and
// the game follows (src/main.js).

export const SLOTS = [
  { id: 'optic', name: 'Sight' },
  { id: 'mount', name: 'Mount' },
  { id: 'muzzle', name: 'Muzzle' },
  { id: 'rail', name: 'Under the barrel' },
  { id: 'side', name: 'Side' },
];

// For each gun (its key in LOADOUT), the attachments each slot takes:
// { id, name, about, needs, clashes }.
// - needs: { slot: [ids] }: it only fits on one of these (choosing it brings
//   the first that fits along).
// - clashes: { slot: [ids] }: it can't be on with these (choosing it takes
//   them off).
// A gun with none has no attachments yet.
export const ATTACHMENTS = {
  pistol: {
    optic: [
      { id: 'reddot', name: 'Red dot', about: 'Aim through a red dot instead of the iron sights. Needs a mount.', needs: { mount: ['clamp', 'cover'] } },
    ],
    mount: [
      { id: 'clamp', name: 'Clamp mount', about: 'Clamps to the frame and bridges over the slide, with rails on top, both sides and underneath.' },
      { id: 'cover', name: 'Rail cover', about: 'A cover over the front of the slide with a rail on top. Moves with the slide.' },
    ],
    muzzle: [
      { id: 'can_short', name: 'Short suppressor', about: 'Quieter, with a much smaller flash.' },
      { id: 'can_long', name: 'Long suppressor', about: 'Quieter, with a much smaller flash.' },
      { id: 'can_box', name: 'Box suppressor', about: 'Quieter, with a much smaller flash. Clamps to the frame\'s rail, with a rail of its own underneath.', clashes: { mount: ['clamp'] } },
    ],
    rail: [
      { id: 'light_long', name: 'Light', about: 'A light under the barrel (T switches it on and off).' },
      { id: 'light_compact', name: 'Compact light', about: 'A smaller light under the barrel (T switches it on and off).' },
    ],
    side: [
      { id: 'laser', name: 'Laser', about: 'A red laser dot where the gun points (T switches it on and off). Needs the clamp mount.', needs: { mount: ['clamp'] } },
    ],
  },
  pistol45: {},
};

const STORAGE_KEY = 'project-fish.attachments';

// The attachment `id` in `slot` on `gun`, or undefined.
function option(gun, slot, id) {
  return ((ATTACHMENTS[gun] || {})[slot] || []).find((a) => a.id === id);
}

// Whether two attachments (slot, id) can't be on together.
function clash(gun, slotA, idA, slotB, idB) {
  const a = option(gun, slotA, idA) || {};
  const b = option(gun, slotB, idB) || {};
  return ((a.clashes || {})[slotB] || []).includes(idB) || ((b.clashes || {})[slotA] || []).includes(idA);
}

// Whether what `id` (in `slot`) needs is on, among `on` ({ slot: id }).
function needsMet(gun, slot, id, on) {
  const needs = (option(gun, slot, id) || {}).needs || {};
  return Object.entries(needs).every(([s, ids]) => ids.includes(on[s]));
}

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
    // Forget anything that no longer exists or no longer fits.
    for (const [gun, slots] of Object.entries(this.chosen)) {
      if (!slots || typeof slots !== 'object') {
        delete this.chosen[gun];
        continue;
      }
      for (const [slot, id] of Object.entries(slots)) {
        if (!this.fits(gun, slot, id)) delete slots[slot];
      }
      for (const [slot, id] of Object.entries(slots)) {
        if (!needsMet(gun, slot, id, slots)) delete slots[slot];
      }
    }
  }

  // Whether attachment `id` fits `slot` on `gun`.
  fits(gun, slot, id) {
    return Boolean(option(gun, slot, id));
  }

  // The attachment in `slot` on `gun`, or null.
  get(gun, slot) {
    return (this.chosen[gun] || {})[slot] || null;
  }

  // Everything on `gun`: { slot: id }.
  on(gun) {
    return { ...(this.chosen[gun] || {}) };
  }

  // What putting `id` in `slot` on `gun` would take off (other slots' ids).
  wouldTakeOff(gun, slot, id) {
    const after = this.resolve(gun, slot, id);
    const now = this.on(gun);
    return Object.entries(now).filter(([s, other]) => s !== slot && after[s] !== other).map(([, other]) => other);
  }

  // Puts `id` in `slot` on `gun` (null takes it off), along with what it
  // needs, taking off whatever it clashes with and whatever no longer fits.
  set(gun, slot, id) {
    if (id !== null && !this.fits(gun, slot, id)) return;
    this.chosen[gun] = this.resolve(gun, slot, id);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.chosen));
    } catch {
      // Can't remember it; it still applies until the page is closed.
    }
    for (const fn of this.listeners) fn(gun, slot, id);
  }

  // The attachments on `gun` after putting `id` in `slot`.
  resolve(gun, slot, id) {
    const on = this.on(gun);
    const chosen = new Set([slot]); // slots just chosen: they stay as they are
    if (id === null) delete on[slot];
    else on[slot] = id;
    // What it needs comes along.
    if (id !== null) {
      for (const [need, ids] of Object.entries(option(gun, slot, id).needs || {})) {
        if (ids.includes(on[need])) continue;
        // (The first that fits with everything on, if one does.)
        const pick = ids.find((other) => Object.entries(on).every(([s2, id2]) => s2 === need || !clash(gun, need, other, s2, id2)))
          || ids.find((other) => !clash(gun, slot, id, need, other));
        if (pick) {
          on[need] = pick;
          chosen.add(need);
        }
      }
    }
    // Whatever clashes with what was just chosen comes off.
    for (const s of Object.keys(on)) {
      if (chosen.has(s)) continue;
      if ([...chosen].some((c) => on[c] && clash(gun, c, on[c], s, on[s]))) delete on[s];
    }
    // And whatever no longer has what it needs: unless another option it
    // needs fits (a red dot whose mount came off moves to the other one).
    for (let changed = true; changed;) {
      changed = false;
      for (const [s, other] of Object.entries(on)) {
        if (needsMet(gun, s, other, on)) continue;
        const needs = option(gun, s, other).needs || {};
        let fixed = true;
        for (const [need, ids] of Object.entries(needs)) {
          if (ids.includes(on[need])) continue;
          const pick = !chosen.has(need) && ids.find((o) => Object.entries(on).every(([s2, id2]) => s2 === need || !clash(gun, need, o, s2, id2)));
          if (pick) on[need] = pick;
          else fixed = false;
        }
        if (!fixed) {
          delete on[s];
          changed = true;
        }
      }
    }
    return on;
  }

  // Calls fn(gun, slot, id) whenever something changes.
  onChange(fn) {
    this.listeners.push(fn);
  }
}
