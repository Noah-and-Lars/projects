// The Customization tab of the loadout menu (src/loadoutMenu.js): what the
// soldier wears, from SLOTS in src/gear.js. On the left, a section for each
// slot group (Tactical gear: head and vest; Hands: gloves), with a tile per
// slot showing what's on it; on the right, the chosen slot: its option's
// name, what it is and whether it's on, over a grid of every option, each
// drawn in its own tile (assets/loadout/thumbs/gear_<slot>_<id>.webp).
// Choosing one puts it on him at once, on the stage (src/outfitPreview.js)
// and in the game, and it's remembered.

import { SLOTS, optionOf } from './gear.js';
import { OutfitPreview } from './outfitPreview.js';
import { thumbUrl } from './loadoutInfo.js';

export const gearThumb = (slot, id) => thumbUrl(`gear_${slot}_${id}`);

// An element, with a class and text.
export function el(tag, className = '', text = '') {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (text) e.textContent = text;
  return e;
}

// A picture in a dark square (or the name alone if it can't load).
export function picture(src, className = 'lo-pic') {
  const box = el('span', className);
  const img = el('img');
  img.alt = '';
  img.draggable = false;
  img.src = src;
  img.addEventListener('error', () => img.remove());
  box.append(img);
  return box;
}

// A section heading with its rule (and something small at its right).
export function heading(text, aside = '') {
  const h = el('h3', 'lo-section');
  h.append(el('span', 'lo-section-name', text), el('span', 'lo-section-rule'));
  if (aside) h.append(el('span', 'lo-section-aside', aside));
  return h;
}

export class OutfitMenu {
  // outfit: the Outfit; wardrobe: the Wardrobe that dresses every copy of
  // him (the stage's too).
  constructor(outfit, wardrobe) {
    this.outfit = outfit;
    this.preview = new OutfitPreview(wardrobe);
  }

  // The option on `slot` now: { slot, option }.
  worn(slotId) {
    const slot = SLOTS.find((s) => s.id === slotId);
    return { slot, option: optionOf(slotId, this.outfit.get(slotId)) };
  }

  // The left column: a section per group, a tile per slot. pick(slotId)
  // opens that slot; `chosen` is the one open.
  renderSections(container, chosen, pick) {
    const groups = [...new Set(SLOTS.map((s) => s.group))];
    for (const group of groups) {
      const section = el('section', 'lo-block');
      section.append(heading(group));
      const tiles = el('div', 'lo-tiles lo-grid');
      for (const slot of SLOTS.filter((s) => s.group === group)) {
        const { option } = this.worn(slot.id);
        const tile = el('button', `lo-tile${slot.id === chosen ? ' chosen' : ''}`);
        tile.type = 'button';
        tile.dataset.key = `slot-${slot.id}`;
        tile.setAttribute('aria-pressed', String(slot.id === chosen));
        tile.append(picture(gearThumb(slot.id, option.id)), el('span', 'lo-tile-label', slot.name), el('span', 'lo-tile-name', option.name));
        tile.addEventListener('click', () => pick(slot.id));
        tiles.append(tile);
      }
      section.append(tiles);
      container.append(section);
    }
  }

  // The right panel for `slotId`: the option on it (or the one under the
  // mouse or focus), then every option to choose from.
  renderDetail(container, slotId) {
    const { slot, option: worn } = this.worn(slotId);
    const cat = el('p', 'lo-cat', `${slot.group} · ${slot.name}`);
    const name = el('h2', 'lo-name');
    const about = el('p', 'lo-about');
    const state = el('p', 'lo-state');
    const show = (option) => {
      name.textContent = option.name;
      about.textContent = option.about || '';
      const on = option.id === this.outfit.get(slotId);
      state.textContent = on ? 'Equipped' : 'Not equipped · choose to wear';
      state.classList.toggle('off', !on);
    };
    show(worn);
    container.append(cat, name, about, state, heading(slot.name, `${slot.options.length} options`));
    const grid = el('div', 'lo-options lo-grid');
    for (const option of slot.options) {
      const on = option.id === worn.id;
      const tile = el('button', `lo-option${on ? ' chosen' : ''}`);
      tile.type = 'button';
      tile.dataset.key = `option-${slotId}-${option.id}`;
      tile.setAttribute('aria-pressed', String(on));
      tile.append(picture(gearThumb(slotId, option.id)), el('span', 'lo-option-name', option.name));
      if (on) tile.append(el('span', 'lo-badge', 'On'));
      tile.addEventListener('click', () => this.outfit.set(slotId, option.id));
      tile.addEventListener('pointerenter', () => show(option));
      tile.addEventListener('focus', () => show(option));
      tile.addEventListener('pointerleave', () => show(document.activeElement === tile ? option : this.worn(slotId).option));
      tile.addEventListener('blur', () => show(this.worn(slotId).option));
      grid.append(tile);
    }
    container.append(grid);
  }

  // Puts every slot back as he starts (each slot's default, or its first).
  reset() {
    for (const slot of SLOTS) this.outfit.set(slot.id, slot.default || slot.options[0].id);
  }

  // Whether he's in what he starts in.
  isDefault() {
    return SLOTS.every((slot) => this.outfit.get(slot.id) === (slot.default || slot.options[0].id));
  }

  // The menu closed, or something covers the stage.
  hide() {
    this.preview.stop();
  }
}
