// A simple, temporary loadout menu: press B in the game to choose each gun's
// attachments, and (its last tab) your outfit (src/outfitMenu.js). It
// releases the mouse while it's open; B, Esc or "Back to game" closes it and
// takes the mouse again.

import { SLOTS, ATTACHMENTS } from './attachments.js';
import { GUNS, LOADOUT } from './shared/config.js';

// The Outfit tab's key (beside the guns').
const OUTFIT = 'outfit';

// An attachment's name, from its id.
function nameOf(gun, id) {
  for (const options of Object.values(ATTACHMENTS[gun] || {})) {
    const found = options.find((o) => o.id === id);
    if (found) return found.name;
  }
  return id;
}

export class LoadoutMenu {
  // element: the #loadout panel. loadout: the Loadout (src/attachments.js).
  // input: the Input, to release and take the mouse. heldGun(): the key of the
  // gun in the hands (the menu opens on it). outfitMenu: the OutfitMenu
  // shown on the Outfit tab (optional).
  constructor(element, loadout, input, heldGun, outfitMenu = null) {
    this.outfitMenu = outfitMenu;
    this.element = element;
    this.loadout = loadout;
    this.input = input;
    this.heldGun = heldGun;
    this.gun = LOADOUT[0];
    this.open = false;
    this.element.hidden = true;
    document.addEventListener('keydown', (e) => {
      if (!this.open) return;
      if (e.code === 'KeyB' || e.code === 'Escape') {
        e.preventDefault();
        this.close();
      }
    });
    this.loadout.onChange(() => {
      if (this.open && this.gun !== OUTFIT) this.render();
    });
  }

  show() {
    if (this.open) return;
    this.open = true;
    // (Back on the Outfit tab if that's where it was left.)
    if (this.gun !== OUTFIT) this.gun = this.heldGun();
    this.render();
    this.element.hidden = false;
    document.body.classList.add('menu-open');
    this.input.unlock();
  }

  close() {
    if (!this.open) return;
    this.open = false;
    this.element.hidden = true;
    if (this.outfitMenu) this.outfitMenu.hide();
    document.body.classList.remove('menu-open');
    // Back into the game (a key press or click counts as asking for the
    // mouse). If the browser won't give it back yet, onFailedLock is told.
    this.input.lock().then(() => {
      if (!this.input.locked && this.onFailedLock) this.onFailedLock();
    });
  }

  render() {
    const el = this.element;
    el.replaceChildren();
    const panel = document.createElement('div');
    panel.className = 'panel';
    const title = document.createElement('h2');
    title.textContent = 'Loadout';
    panel.append(title);

    // A tab for each gun.
    const tabs = document.createElement('div');
    tabs.className = 'tabs';
    const keys = this.outfitMenu ? [...LOADOUT, OUTFIT] : LOADOUT;
    for (const key of keys) {
      const tab = document.createElement('button');
      tab.type = 'button';
      tab.textContent = key === OUTFIT ? 'Outfit' : GUNS[key].name;
      tab.className = key === this.gun ? 'tab chosen' : 'tab';
      tab.addEventListener('click', () => {
        this.gun = key;
        this.render();
      });
      tabs.append(tab);
    }
    panel.append(tabs);
    if (this.outfitMenu && this.gun !== OUTFIT) this.outfitMenu.hide();
    if (this.gun === OUTFIT) {
      panel.classList.add('wide');
      this.outfitMenu.render(panel);
      panel.append(this.backButton());
      el.append(panel);
      return;
    }

    // A row for each slot that gun has, with a button per attachment and one
    // for none.
    const slots = ATTACHMENTS[this.gun] || {};
    const rows = SLOTS.filter((slot) => (slots[slot.id] || []).length);
    if (!rows.length) {
      const none = document.createElement('p');
      none.className = 'none';
      none.textContent = 'No attachments for this gun yet.';
      panel.append(none);
    }
    for (const slot of rows) {
      const row = document.createElement('div');
      row.className = 'slot';
      const label = document.createElement('span');
      label.className = 'label';
      label.textContent = slot.name;
      row.append(label);
      const current = this.loadout.get(this.gun, slot.id);
      for (const option of [{ id: null, name: 'None' }, ...slots[slot.id]]) {
        const button = document.createElement('button');
        button.type = 'button';
        button.textContent = option.name;
        button.className = option.id === current ? 'option chosen' : 'option';
        // What it does, and what choosing it would take off.
        const off = option.id === current ? [] : this.loadout.wouldTakeOff(this.gun, slot.id, option.id).map((id) => nameOf(this.gun, id));
        button.title = [option.about, off.length ? `Takes off: ${off.join(', ')}` : ''].filter(Boolean).join(' ');
        button.addEventListener('click', () => this.loadout.set(this.gun, slot.id, option.id));
        row.append(button);
      }
      const chosen = slots[slot.id].find((o) => o.id === current);
      if (chosen && chosen.about) {
        const about = document.createElement('p');
        about.className = 'about';
        about.textContent = chosen.about;
        row.append(about);
      }
      panel.append(row);
    }

    panel.append(this.backButton());
    el.append(panel);
  }

  backButton() {
    const back = document.createElement('button');
    back.type = 'button';
    back.className = 'back';
    back.textContent = 'Back to game (B)';
    back.addEventListener('click', () => this.close());
    return back;
  }
}
