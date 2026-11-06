// The Outfit tab of the loadout menu (B): a picture of your soldier in what
// he's wearing (src/outfitPreview.js) beside the slots (head, vest, gloves)
// and their options (SLOTS in src/gear.js). Choosing one puts it on him at
// once, in the picture and in the game, and it's remembered.

import { SLOTS, optionOf } from './gear.js';
import { OutfitPreview, VIEWS } from './outfitPreview.js';

// The hint over the picture, for each framing. (The picture is always the
// soldier; in the Gloves view it says the guns with their own arms wear
// the gloves too.)
const hintFor = (view) => (view === 'hands'
  ? 'Drag to turn him. The Beretta, the FN 502 and the Hi-Power wear these gloves on their own hands too.'
  : 'Drag to turn him.');

export class OutfitMenu {
  // outfit: the Outfit; wardrobe: the Wardrobe that dresses every copy of
  // him (the picture's too).
  constructor(outfit, wardrobe) {
    this.outfit = outfit;
    this.preview = new OutfitPreview(wardrobe);
    this.slotsElement = null;
    outfit.onChange(() => this.renderSlots());
  }

  // Fills `container` (the menu's panel, below its tabs) and starts the
  // picture.
  render(container) {
    const wrap = document.createElement('div');
    wrap.className = 'outfit';
    const stage = document.createElement('div');
    stage.className = 'stage';
    stage.append(this.preview.canvas);
    const views = document.createElement('div');
    views.className = 'views';
    const hint = document.createElement('p');
    hint.className = 'hint';
    for (const [id, view] of Object.entries(VIEWS)) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = view.name;
      button.className = id === this.preview.view ? 'view chosen' : 'view';
      button.addEventListener('click', () => {
        this.preview.setView(id);
        for (const b of views.children) b.classList.toggle('chosen', b === button);
        hint.textContent = hintFor(this.preview.view);
      });
      views.append(button);
    }
    hint.textContent = hintFor(this.preview.view);
    stage.append(views, hint);
    this.slotsElement = document.createElement('div');
    this.slotsElement.className = 'slots';
    wrap.append(stage, this.slotsElement);
    container.append(wrap);
    this.renderSlots(true);
    this.preview.start();
  }

  // The slots and their options (again whenever a choice changes).
  // (fresh: just made, not on the page yet.)
  renderSlots(fresh = false) {
    const el = this.slotsElement;
    if (!el || (!fresh && !el.isConnected)) return;
    el.replaceChildren();
    for (const slot of SLOTS) {
      const row = document.createElement('div');
      row.className = 'slot';
      const label = document.createElement('span');
      label.className = 'label';
      label.textContent = slot.name;
      const options = document.createElement('div');
      options.className = 'options';
      const current = this.outfit.get(slot.id);
      for (const option of slot.options) {
        const button = document.createElement('button');
        button.type = 'button';
        button.textContent = option.name;
        button.title = option.about || '';
        button.className = option.id === current ? 'option chosen' : 'option';
        button.addEventListener('click', () => this.outfit.set(slot.id, option.id));
        options.append(button);
      }
      row.append(label, options);
      const chosen = optionOf(slot.id, current);
      if (chosen && chosen.about) {
        const about = document.createElement('p');
        about.className = 'about';
        about.textContent = chosen.about;
        row.append(about);
      }
      el.append(row);
    }
  }

  // The menu closed or went to another tab.
  hide() {
    this.preview.stop();
  }
}
