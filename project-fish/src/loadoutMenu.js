// A simple, temporary loadout menu: press B in the game to choose each gun's
// attachments, and (its last tab) your outfit (src/outfitMenu.js). Each
// gun's tab can also put that gun in your hands (onPickGun: the game's, the
// gun's key) and goes back to the game. A Breakdowns button by the title
// opens a picker of the gun breakdowns (src/showcase/breakdowns.js), with
// the cinematic first: picking one plays it (onBreakdown: the game's, the
// breakdown's id, or 'cinematic'; the menu closes
// without taking the mouse back), and Esc goes back to the loadout. It
// releases the mouse while it's open; B, Esc or "Back to game" closes it and
// takes the mouse again. Opened from the main menu, it has a `home` (the
// game's): closing it goes there instead, and opened on the picker `alone`,
// Esc there closes it.

import { SLOTS, ATTACHMENTS } from './attachments.js';
import { GUNS, LOADOUT } from './shared/config.js';
import { BREAKDOWNS, CINEMATIC } from './showcase/breakdowns.js';

// The Outfit tab's key (beside the guns').
const OUTFIT = 'outfit';
// Each gun's key in the game (LOADOUT's order), for the menu to show.
const KEY_NAMES = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0', '-', '='];
// The menu's two views: the loadout (the tabs), and the breakdowns picker.
const LOADOUT_VIEW = 'loadout';
const BREAKDOWNS_VIEW = 'breakdowns';

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
    this.onPickGun = null; // (key) => puts that gun in the hands
    this.onBreakdown = null; // (id) => plays that breakdown
    this.home = null; // () => back to the main menu, when opened from it (else closing takes the mouse)
    this.alone = false; // opened on the picker by itself: Esc there closes the menu
    this.view = LOADOUT_VIEW;
    this.lastBreakdown = CINEMATIC.id; // the picker's focus (the cinematic first)
    this.element.hidden = true;
    document.addEventListener('keydown', (e) => {
      if (!this.open) return;
      if (this.view === BREAKDOWNS_VIEW && e.code === 'Escape') {
        e.preventDefault();
        if (this.alone) this.close();
        else this.showView(LOADOUT_VIEW);
      } else if (e.code === 'KeyB' || e.code === 'Escape') {
        e.preventDefault();
        this.close();
      } else if (this.view === BREAKDOWNS_VIEW) {
        this.pickerKey(e);
      }
    });
    this.loadout.onChange(() => {
      if (this.open && this.gun !== OUTFIT) this.render();
    });
  }

  // view: 'breakdowns' opens it on the breakdowns picker (as a breakdown
  // closing does), with focus on the one with that id. options.alone: the
  // picker by itself (left out, it stays as it was).
  show(view = LOADOUT_VIEW, breakdown = null, options = null) {
    if (this.open) return;
    this.open = true;
    if (options) this.alone = Boolean(options.alone);
    this.view = view === BREAKDOWNS_VIEW && this.onBreakdown ? BREAKDOWNS_VIEW : LOADOUT_VIEW;
    if (breakdown) this.lastBreakdown = breakdown;
    // (Back on the Outfit tab if that's where it was left.)
    if (this.gun !== OUTFIT) this.gun = this.heldGun();
    this.render();
    this.element.hidden = false;
    document.body.classList.add('menu-open');
    this.input.unlock();
    if (this.view === BREAKDOWNS_VIEW) this.focusPick(); // (it can't take focus while hidden)
  }

  showView(view) {
    const from = this.view;
    this.view = view;
    this.render();
    // (Back from the picker: on the button that opened it.)
    if (from === BREAKDOWNS_VIEW && view === LOADOUT_VIEW) {
      const open = this.element.querySelector('button.showcase');
      if (open) open.focus();
    }
  }

  // relock: false leaves the mouse free (for something that opens over the
  // game, as the breakdown does).
  close(relock = true) {
    if (!this.open) return;
    this.open = false;
    this.element.hidden = true;
    if (this.outfitMenu) this.outfitMenu.hide();
    document.body.classList.remove('menu-open');
    if (!relock) return;
    if (this.home) {
      this.home();
      return;
    }
    // Back into the game (a key press or click counts as asking for the
    // mouse). If the browser won't give it back yet, onFailedLock is told.
    this.input.lock().then(() => {
      if (!this.input.locked && this.onFailedLock) this.onFailedLock();
    });
  }

  render() {
    const el = this.element;
    el.replaceChildren();
    if (this.view === BREAKDOWNS_VIEW) {
      this.renderPicker();
      return;
    }
    const panel = document.createElement('div');
    panel.className = 'panel';
    // The title, with the breakdowns' button beside it (on every tab).
    const head = document.createElement('div');
    head.className = 'head';
    const title = document.createElement('h2');
    title.textContent = 'Loadout';
    head.append(title);
    if (this.onBreakdown && BREAKDOWNS.length) head.append(this.breakdownsButton());
    panel.append(head);

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

    // The gun in the hands, or a button to take it.
    if (this.onPickGun) {
      const row = document.createElement('div');
      row.className = 'slot';
      const label = document.createElement('span');
      label.className = 'label';
      label.textContent = 'In your hands';
      row.append(label);
      const take = document.createElement('button');
      take.type = 'button';
      const key = KEY_NAMES[LOADOUT.indexOf(this.gun)];
      const holding = this.gun === this.heldGun();
      take.textContent = holding ? `${GUNS[this.gun].name} (in your hands)` : `Take the ${GUNS[this.gun].name}${key ? ` (${key})` : ''}`;
      take.className = holding ? 'option chosen' : 'option';
      take.addEventListener('click', () => {
        if (!holding) this.onPickGun(this.gun);
        this.close();
      });
      row.append(take);
      panel.append(row);
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

  // A button that opens the breakdowns picker.
  breakdownsButton() {
    const open = document.createElement('button');
    open.type = 'button';
    open.className = 'showcase';
    open.textContent = 'Breakdowns';
    open.title = 'Watch a gun taken apart part by part, with what each part does.';
    open.addEventListener('click', () => this.showView(BREAKDOWNS_VIEW));
    return open;
  }

  // The breakdowns picker: the cinematic, then a card for each gun (its
  // picture, name, what the film shows and the model's credit). A click, or
  // Enter on the focused card, plays it; the arrow keys move between the
  // cards; Esc goes back.
  renderPicker() {
    if (this.outfitMenu) this.outfitMenu.hide();
    const panel = document.createElement('div');
    panel.className = 'panel wide';
    const head = document.createElement('div');
    head.className = 'head';
    const title = document.createElement('h2');
    title.textContent = 'Breakdowns';
    const back = document.createElement('button');
    back.type = 'button';
    back.className = 'showcase';
    back.textContent = this.alone ? (this.home ? 'Back to menu (Esc)' : 'Close (Esc)') : 'Back to loadout (Esc)';
    back.addEventListener('click', () => (this.alone ? this.close() : this.showView(LOADOUT_VIEW)));
    head.append(title, back);
    panel.append(head);
    const intro = document.createElement('p');
    intro.className = 'about';
    intro.textContent = 'Watch the cinematic, or pick a gun to watch it taken apart part by part, with what each part does.';
    panel.append(intro);
    const grid = document.createElement('div');
    grid.className = 'picks';
    this.picks = [];
    for (const entry of [CINEMATIC, ...BREAKDOWNS]) {
      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'pick';
      card.dataset.breakdown = entry.id;
      const picture = document.createElement('span');
      picture.className = 'thumb';
      const img = document.createElement('img');
      img.alt = '';
      img.decoding = 'async';
      img.src = String(entry.thumb);
      img.addEventListener('error', () => img.remove()); // (the name is still there)
      picture.append(img);
      const name = document.createElement('span');
      name.className = 'name';
      name.textContent = entry.name;
      const about = document.createElement('span');
      about.className = 'what';
      about.textContent = entry.about;
      const credit = document.createElement('span');
      credit.className = 'credit';
      credit.textContent = entry.credit;
      card.append(picture, name, about, credit);
      card.addEventListener('click', () => this.pick(entry.id));
      card.addEventListener('focus', () => { this.lastBreakdown = entry.id; });
      grid.append(card);
      this.picks.push(card);
    }
    panel.append(grid);
    this.element.append(panel);
    this.focusPick();
  }

  // Focus on the last breakdown watched (or the first), so Enter plays it.
  focusPick() {
    const card = (this.picks || []).find((c) => c.dataset.breakdown === this.lastBreakdown) || (this.picks || [])[0];
    if (card) card.focus();
  }

  pick(id) {
    this.lastBreakdown = id;
    this.close(false);
    this.onBreakdown(id);
  }

  // The arrow keys in the picker: left and right one card, up and down a
  // row (however many cards fit across).
  pickerKey(e) {
    const step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: 'up', ArrowDown: 'down' }[e.code];
    if (!step || !this.picks || !this.picks.length) return;
    e.preventDefault();
    // (From the Back button or nothing: back on the card last on.)
    const at = this.picks.indexOf(document.activeElement);
    if (at < 0) return this.focusPick();
    let to = at;
    if (typeof step === 'number') to = at + step;
    else {
      // The nearest card in the row above or below.
      const box = (c) => c.getBoundingClientRect();
      const here = box(this.picks[at]);
      const others = this.picks
        .map((c, i) => ({ i, b: box(c) }))
        .filter(({ b }) => (step === 'up' ? b.bottom <= here.top + 1 : b.top >= here.bottom - 1));
      if (others.length) {
        const rowY = step === 'up' ? Math.max(...others.map((o) => o.b.top)) : Math.min(...others.map((o) => o.b.top));
        const row = others.filter((o) => Math.abs(o.b.top - rowY) < 2);
        row.sort((a, b) => Math.abs(a.b.left - here.left) - Math.abs(b.b.left - here.left));
        to = row[0].i;
      }
    }
    to = Math.min(this.picks.length - 1, Math.max(0, to));
    this.picks[to].focus();
  }

  backButton() {
    const back = document.createElement('button');
    back.type = 'button';
    back.className = 'back';
    back.textContent = this.home ? 'Back to menu (B)' : 'Back to game (B)';
    back.addEventListener('click', () => this.close());
    return back;
  }
}
