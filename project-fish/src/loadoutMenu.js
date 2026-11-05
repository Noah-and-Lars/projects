// A simple, temporary loadout menu: press B in the game to choose each gun's
// attachments. It releases the mouse while it's open; B, Esc or "Back to
// game" closes it and takes the mouse again.

import { SLOTS, ATTACHMENTS } from './attachments.js';
import { GUNS, LOADOUT } from './shared/config.js';

export class LoadoutMenu {
  // element: the #loadout panel. loadout: the Loadout (src/attachments.js).
  // input: the Input, to release and take the mouse. heldGun(): the key of the
  // gun in the hands (the menu opens on it).
  constructor(element, loadout, input, heldGun) {
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
    this.loadout.onChange(() => this.render());
  }

  show() {
    if (this.open) return;
    this.open = true;
    this.gun = this.heldGun();
    this.render();
    this.element.hidden = false;
    document.body.classList.add('menu-open');
    this.input.unlock();
  }

  close() {
    if (!this.open) return;
    this.open = false;
    this.element.hidden = true;
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
    for (const key of LOADOUT) {
      const tab = document.createElement('button');
      tab.type = 'button';
      tab.textContent = GUNS[key].name;
      tab.className = key === this.gun ? 'tab chosen' : 'tab';
      tab.addEventListener('click', () => {
        this.gun = key;
        this.render();
      });
      tabs.append(tab);
    }
    panel.append(tabs);

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
        button.addEventListener('click', () => this.loadout.set(this.gun, slot.id, option.id));
        row.append(button);
      }
      panel.append(row);
    }

    const back = document.createElement('button');
    back.type = 'button';
    back.className = 'back';
    back.textContent = 'Back to game (B)';
    back.addEventListener('click', () => this.close());
    panel.append(back);
    el.append(panel);
  }
}
