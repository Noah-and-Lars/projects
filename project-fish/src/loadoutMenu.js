// The loadout menu (B in the game, Loadout in the main menu): a full screen
// with the player's soldier big in the middle (src/outfitPreview.js: in his
// outfit, in his idle clip, drag to turn him) and two tabs:
// - Loadout: on the left the gun in your hands (its picture, name, calibre;
//   choosing it opens a grid of all seven, and a strip of all seven takes
//   one straight away), then what he wears (headwear, body armour, hands),
//   each opening the Customization tab on that slot. On the right the gun:
//   its picture, what it is, its numbers from src/shared/config.js, and
//   what's fitted to it for good.
// - Customization: the outfit (src/outfitMenu.js).
// The number keys (1 to 7) also put a gun in your hands, and Q
// and E change tab. A Breakdowns button opens a picker of the gun breakdowns
// (src/showcase/breakdowns.js): picking one plays it (onBreakdown: the
// game's, the breakdown's id; the menu closes without taking the mouse
// back), and Esc goes back to the loadout.
// It releases the mouse while it's open; B, Esc or Back closes it and takes
// the mouse again. Opened from the main menu, it has a `home` (the game's):
// closing it goes there instead, and opened on the picker `alone`, Esc
// there closes it. onOpenChange(open) tells the game when it opens and
// closes (the game draws nothing behind it meanwhile).

import { GUNS, LOADOUT } from './shared/config.js';
import { BREAKDOWNS } from './showcase/breakdowns.js';
import { SLOTS as GEAR_SLOTS } from './gear.js';
import { GUN_INFO, gunSpecs, thumbUrl } from './loadoutInfo.js';
import { el, picture, heading, gearThumb } from './outfitMenu.js';

// Each gun's key in the game (LOADOUT's order), as shown and as pressed.
const KEY_NAMES = ['1', '2', '3', '4', '5', '6', '7'];
const KEY_CODES = ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6', 'Digit7'];
// The tabs, and the menu's other two views: the grid of guns, and the
// breakdowns picker.
const TABS = { loadout: 'Loadout', outfit: 'Customization' };
const GUNS_VIEW = 'guns';
const BREAKDOWNS_VIEW = 'breakdowns';
// How the stage frames him on each tab (and each outfit slot).
const FRAMING = { loadout: 'full', guns: 'full' };

const keyOf = (gun) => KEY_NAMES[LOADOUT.indexOf(gun)];
const gunThumb = (gun) => thumbUrl(`gun_${gun}`);

function button(className, key, onClick) {
  const b = el('button', className);
  b.type = 'button';
  if (key) b.dataset.key = key;
  if (onClick) b.addEventListener('click', onClick);
  return b;
}

function kbd(text) {
  return el('kbd', '', text);
}

export class LoadoutMenu {
  // element: the #loadout element. input: the Input, to release and take the mouse. heldGun(): the key of the
  // gun in the hands. outfitMenu: the OutfitMenu for the Customization tab
  // and the stage (optional: without it, the Loadout tab alone).
  constructor(element, input, heldGun, outfitMenu = null) {
    this.outfitMenu = outfitMenu;
    this.element = element;
    this.input = input;
    this.heldGun = heldGun;
    this.open = false;
    this.onPickGun = null; // (key) => puts that gun in the hands
    this.onBreakdown = null; // (id) => plays that breakdown
    this.onOpenChange = null; // (open) => the menu opened or closed
    this.home = null; // () => back to the main menu, when opened from it (else closing takes the mouse)
    this.alone = false; // opened on the picker by itself: Esc there closes the menu
    this.tab = 'loadout'; // the tab last on ('loadout' or 'outfit')
    this.view = 'loadout'; // a tab, GUNS_VIEW or BREAKDOWNS_VIEW
    this.slot = GEAR_SLOTS[0].id; // the outfit slot open on the Customization tab
    this.lastBreakdown = BREAKDOWNS.length ? BREAKDOWNS[0].id : null; // the picker's focus

    // What stays: the backdrop, the stage, the shading over it; the rest is
    // drawn again whenever something changes.
    element.hidden = true;
    element.classList.add('lo');
    element.replaceChildren();
    const backdrop = el('div', 'lo-backdrop');
    this.stage = el('div', 'lo-stage');
    if (outfitMenu) this.stage.append(outfitMenu.preview.canvas);
    const shade = el('div', 'lo-shade');
    const grain = el('div', 'lo-grain');
    this.ui = el('div', 'lo-ui');
    element.append(backdrop, this.stage, shade, grain, this.ui);

    document.addEventListener('keydown', (e) => this.key(e));
    if (outfitMenu) {
      outfitMenu.outfit.onChange(() => {
        if (this.open) this.render();
      });
    }
  }

  // view: 'breakdowns' opens it on the breakdowns picker (as a breakdown
  // closing does), with focus on the one with that id; else it opens on the
  // tab last on. options.alone: the picker by itself (left out, it stays as
  // it was).
  show(view = 'loadout', breakdown = null, options = null) {
    if (this.open) return;
    this.open = true;
    if (options) this.alone = Boolean(options.alone);
    this.view = view === BREAKDOWNS_VIEW && this.onBreakdown ? BREAKDOWNS_VIEW : this.tab;
    if (breakdown) this.lastBreakdown = breakdown;
    this.element.hidden = false;
    this.element.classList.add('lo-enter');
    requestAnimationFrame(() => requestAnimationFrame(() => this.element.classList.remove('lo-enter')));
    document.body.classList.add('menu-open');
    this.input.unlock();
    if (this.onOpenChange) this.onOpenChange(true);
    this.render(null);
    if (this.view === BREAKDOWNS_VIEW) this.focusPick();
    else this.focusKey(this.view === 'outfit' ? `slot-${this.slot}` : 'gun-card');
  }

  showView(view) {
    const from = this.view;
    if (TABS[view]) this.tab = view;
    this.view = view;
    this.render(null);
    // Back from the picker: on the button that opened it; back from the
    // grid of guns: on the gun card.
    if (from === BREAKDOWNS_VIEW && TABS[view]) this.focusKey('breakdowns');
    else if (from === GUNS_VIEW && view === 'loadout') this.focusKey('gun-card');
    else if (view === GUNS_VIEW) this.focusKey(`pick-${this.heldGun()}`);
    else if (view === 'outfit') this.focusKey(`slot-${this.slot}`);
    else if (view === BREAKDOWNS_VIEW) this.focusPick();
  }

  // relock: false leaves the mouse free (for something that opens over the
  // game, as the breakdown does).
  close(relock = true) {
    if (!this.open) return;
    this.open = false;
    this.element.hidden = true;
    if (this.outfitMenu) this.outfitMenu.hide();
    document.body.classList.remove('menu-open');
    if (this.onOpenChange) this.onOpenChange(false);
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

  // ---- Keys ----

  key(e) {
    if (!this.open || e.altKey || e.ctrlKey || e.metaKey) return;
    if (e.code === 'Escape') {
      e.preventDefault();
      if (this.view === BREAKDOWNS_VIEW && !this.alone) this.showView(this.tab);
      else if (this.view === GUNS_VIEW) this.showView('loadout');
      else this.close();
      return;
    }
    if (e.code === 'KeyB') {
      e.preventDefault();
      this.close();
      return;
    }
    if (this.view === BREAKDOWNS_VIEW) {
      this.gridKey(e);
      return;
    }
    const gun = KEY_CODES.indexOf(e.code);
    if (gun >= 0 && LOADOUT[gun]) {
      e.preventDefault();
      this.pickGun(LOADOUT[gun]);
      return;
    }
    if ((e.code === 'KeyQ' || e.code === 'KeyE') && this.outfitMenu) {
      e.preventDefault();
      const to = e.code === 'KeyQ' ? 'loadout' : 'outfit';
      if (this.view !== to) this.showView(to);
      return;
    }
    this.gridKey(e);
  }

  // The arrow keys in a grid (the guns, the tiles, the options, the
  // breakdowns): left and right one, up and down a row (however many fit
  // across).
  gridKey(e) {
    const step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: 'up', ArrowDown: 'down' }[e.code];
    if (!step) return;
    const active = document.activeElement;
    const grid = active && this.ui.contains(active) ? active.closest('.lo-grid') : null;
    if (!grid) {
      // (In the picker, from the Back button or nothing: back on the card
      // last on.)
      if (this.view === BREAKDOWNS_VIEW) {
        e.preventDefault();
        this.focusPick();
      }
      return;
    }
    const items = [...grid.children].filter((c) => c.tagName === 'BUTTON');
    const at = items.indexOf(active);
    if (at < 0) return;
    e.preventDefault();
    let to = at;
    if (typeof step === 'number') to = at + step;
    else {
      // The nearest in the row above or below.
      const box = (c) => c.getBoundingClientRect();
      const here = box(items[at]);
      const others = items
        .map((c, i) => ({ i, b: box(c) }))
        .filter(({ b }) => (step === 'up' ? b.bottom <= here.top + 1 : b.top >= here.bottom - 1));
      if (others.length) {
        const rowY = step === 'up' ? Math.max(...others.map((o) => o.b.top)) : Math.min(...others.map((o) => o.b.top));
        const row = others.filter((o) => Math.abs(o.b.top - rowY) < 2);
        row.sort((a, b) => Math.abs(a.b.left - here.left) - Math.abs(b.b.left - here.left));
        to = row[0].i;
      }
    }
    to = Math.min(items.length - 1, Math.max(0, to));
    items[to].focus();
  }

  focusKey(key) {
    const target = key && this.ui.querySelector(`[data-key="${CSS.escape(key)}"]`);
    if (target) target.focus({ preventScroll: true });
  }

  // ---- Choosing ----

  // Puts a gun in the hands (the menu stays open; from the grid of guns,
  // back to the Loadout tab).
  pickGun(gun) {
    if (gun !== this.heldGun() && this.onPickGun) this.onPickGun(gun);
    if (this.view === GUNS_VIEW || this.view === 'outfit') this.showView('loadout');
    else this.render();
  }

  pickSlot(slot) {
    this.slot = slot;
    if (this.view !== 'outfit') this.showView('outfit');
    else this.render();
  }

  // ---- Drawing ----

  // Draws the current view again (focus and scrolling kept as they were,
  // unless focus is null).
  render(focus = undefined) {
    const active = document.activeElement;
    const keep = focus === undefined && active && this.ui.contains(active) ? active.dataset.key : null;
    const scrolls = {};
    for (const node of this.ui.querySelectorAll('[data-scroll]')) scrolls[node.dataset.scroll] = node.scrollTop;

    this.element.dataset.view = this.view;
    this.ui.replaceChildren();
    if (this.view === BREAKDOWNS_VIEW) this.renderPicker();
    else {
      this.ui.append(this.header());
      if (this.view === GUNS_VIEW) this.ui.append(this.gunGrid());
      else {
        const body = el('div', 'lo-body');
        body.dataset.scroll = 'body';
        const left = el('aside', 'lo-left');
        left.dataset.scroll = 'left';
        const right = el('aside', 'lo-right');
        right.dataset.scroll = 'right';
        if (this.view === 'outfit') {
          left.append(this.outfitTools());
          this.outfitMenu.renderSections(left, this.slot, (slot) => this.pickSlot(slot));
          this.outfitMenu.renderDetail(right, this.slot);
        } else {
          this.renderWeapons(left);
          this.renderGearSummary(left);
          this.renderGun(right);
        }
        body.append(left, right);
        this.ui.append(body);
      }
    }
    this.ui.append(this.footer());

    // The stage: drawn while a tab shows him.
    if (this.outfitMenu) {
      const preview = this.outfitMenu.preview;
      if (TABS[this.view]) {
        preview.setFraming(this.view === 'outfit' ? (this.slot === 'head' || this.slot === 'vest' || this.slot === 'gloves' ? this.slot : 'outfit') : FRAMING[this.view]);
        preview.start();
      } else {
        preview.stop();
      }
    }
    for (const node of this.ui.querySelectorAll('[data-scroll]')) {
      if (scrolls[node.dataset.scroll]) node.scrollTop = scrolls[node.dataset.scroll];
    }
    if (keep) this.focusKey(keep);
  }

  // The title, the tabs and the Breakdowns button.
  header() {
    const head = el('header', 'lo-head');
    const brand = el('div', 'lo-brand');
    const kicker = el('p', 'lo-kicker');
    kicker.append('Steelhead ', el('span', '', '·'), ' Operator');
    brand.append(kicker, el('h1', 'lo-title', this.view === 'outfit' ? 'Customization' : 'Loadout'));
    head.append(brand);
    if (this.outfitMenu) {
      const tabs = el('nav', 'lo-tabs');
      tabs.setAttribute('aria-label', 'Loadout tabs');
      tabs.append(kbd('Q'));
      for (const [id, name] of Object.entries(TABS)) {
        const on = (this.view === GUNS_VIEW ? 'loadout' : this.view) === id;
        const tab = button(`lo-tab${on ? ' on' : ''}`, `tab-${id}`, () => {
          if (this.view !== id) this.showView(id);
        });
        tab.textContent = name;
        tab.setAttribute('aria-pressed', String(on));
        tabs.append(tab);
      }
      tabs.append(kbd('E'));
      head.append(tabs);
    }
    if (this.onBreakdown && BREAKDOWNS.length) {
      const open = button('lo-chip lo-breakdowns', 'breakdowns', () => this.showView(BREAKDOWNS_VIEW));
      open.append(el('span', 'lo-chip-dot'), 'Breakdowns');
      open.title = 'Watch a gun taken apart part by part, with what each part does.';
      head.append(open);
    }
    return head;
  }

  // Back, a hint, and the keys.
  footer() {
    const foot = el('footer', 'lo-foot');
    const inner = this.view === GUNS_VIEW || (this.view === BREAKDOWNS_VIEW && !this.alone);
    const back = button('lo-back', 'back', () => {
      if (this.view === GUNS_VIEW) this.showView('loadout');
      else if (this.view === BREAKDOWNS_VIEW && !this.alone) this.showView(this.tab);
      else this.close();
    });
    back.append(el('span', 'lo-back-mark'), inner ? 'Back' : this.home ? 'Back to menu' : 'Back to game', kbd('Esc'));
    foot.append(back);
    if (TABS[this.view] && this.outfitMenu) foot.append(el('p', 'lo-drag', 'Drag to turn him'));
    const keys = el('div', 'lo-keys');
    keys.setAttribute('aria-hidden', 'true');
    const hint = (k, text) => {
      const s = el('span');
      for (const x of [].concat(k)) s.append(kbd(x));
      s.append(text);
      return s;
    };
    if (this.view !== BREAKDOWNS_VIEW) keys.append(hint(['1', '='], 'Gun'));
    if (TABS[this.view] && this.outfitMenu) keys.append(hint(['Q', 'E'], 'Tab'));
    keys.append(hint(['←', '→'], 'Select'), hint('Enter', 'Choose'), hint('B', 'Close'));
    foot.append(keys);
    return foot;
  }

  // The Loadout tab's weapons: the gun in your hands, and all seven.
  renderWeapons(container) {
    const held = this.heldGun();
    const gun = GUNS[held];
    const section = el('section', 'lo-block');
    section.append(heading('Weapons', `${LOADOUT.length} carried`));
    const card = button('lo-gun-card', 'gun-card', () => this.showView(GUNS_VIEW));
    card.title = 'Choose the gun in your hands';
    const top = el('span', 'lo-card-top');
    top.append(el('span', 'lo-mini', 'In your hands'), el('span', 'lo-keycap', keyOf(held)));
    const text = el('span', 'lo-card-text');
    text.append(el('span', 'lo-gun-name', gun.name), el('span', 'lo-gun-sub', `${gun.kind} · ${gun.calibre}`));
    card.append(top, picture(gunThumb(held), 'lo-pic lo-gun-pic'), text, el('span', 'lo-card-more', 'Change'));
    section.append(card);
    // All seven, small: one click takes it.
    const strip = el('div', 'lo-strip lo-grid');
    strip.setAttribute('aria-label', 'Take a gun');
    for (const key of LOADOUT) {
      const b = button(`lo-strip-gun${key === held ? ' chosen' : ''}`, `strip-${key}`, () => this.pickGun(key));
      b.title = `${GUNS[key].name} (${keyOf(key)})`;
      b.setAttribute('aria-label', `${GUNS[key].name}, key ${keyOf(key)}`);
      b.setAttribute('aria-pressed', String(key === held));
      b.append(picture(gunThumb(key), 'lo-pic'), el('span', 'lo-strip-key', keyOf(key)));
      strip.append(b);
    }
    section.append(strip);
    container.append(section);
  }

  // What he wears, a row per slot, each opening it on the Customization tab.
  renderGearSummary(container) {
    if (!this.outfitMenu) return;
    for (const slot of GEAR_SLOTS) {
      const { option } = this.outfitMenu.worn(slot.id);
      const section = el('section', 'lo-block lo-gear-block');
      section.append(heading(slot.title));
      const row = button('lo-gear-row', `gear-${slot.id}`, () => this.pickSlot(slot.id));
      row.title = `Change: ${slot.name.toLowerCase()}`;
      const text = el('span', 'lo-card-text');
      text.append(el('span', 'lo-mini', slot.name), el('span', 'lo-gear-name', option.name));
      row.append(picture(gearThumb(slot.id, option.id), 'lo-pic lo-gear-pic'), text, el('span', 'lo-card-more', 'Customize'));
      section.append(row);
      container.append(section);
    }
  }

  // The gun in the hands, on the right: what it is, its numbers, and what's
  // fitted to it for good.
  renderGun(container) {
    const key = this.heldGun();
    const gun = GUNS[key];
    const info = GUN_INFO[key] || {};
    container.append(el('p', 'lo-cat', `${gun.kind} · Key ${keyOf(key)}`), el('h2', 'lo-name', gun.name));
    const hero = el('div', 'lo-hero');
    hero.append(picture(gunThumb(key), 'lo-layer'));
    container.append(hero);
    if (info.about) container.append(el('p', 'lo-about', info.about));
    const specs = el('dl', 'lo-specs');
    for (const row of gunSpecs(key)) {
      const line = el('div', 'lo-spec');
      line.append(el('dt', '', row.label), el('dd', '', row.value));
      specs.append(line);
    }
    container.append(specs);

    container.append(heading('Fitted', info.fitted ? `${info.fitted.length}` : ''));
    const list = el('div', 'lo-rows');
    for (const f of info.fitted || []) {
      const line = el('div', 'lo-row fixed');
      line.append(el('span', 'lo-row-slot', f.slot), el('span', 'lo-row-value', f.what));
      list.append(line);
    }
    if (!(info.fitted || []).length) list.append(el('p', 'lo-note', 'Nothing fitted. This gun has no attachments yet.'));
    else list.append(el('p', 'lo-note', 'Fitted for good: this gun has no attachments to change yet.'));
    container.append(list);
  }

  // Above the Customization tab's tiles: the kit he starts in.
  outfitTools() {
    const tools = el('div', 'lo-tools');
    const reset = button('lo-chip', 'reset-outfit', () => this.outfitMenu.reset());
    reset.append(el('span', 'lo-chip-dot'), 'Default kit');
    reset.title = 'Put him back in the kit he starts in';
    reset.disabled = this.outfitMenu.isDefault();
    tools.append(reset);
    return tools;
  }

  // The grid of guns: choosing one puts it in your hands.
  gunGrid() {
    const held = this.heldGun();
    const sheet = el('section', 'lo-sheet');
    sheet.dataset.scroll = 'guns';
    const head = el('div', 'lo-sheet-head');
    head.append(el('p', 'lo-cat', 'Weapons'), el('h2', 'lo-name', 'Choose the gun in your hands'), el('p', 'lo-about', 'Every gun is carried; its key (1 to 7) takes it out in the game.'));
    sheet.append(head);
    const grid = el('div', 'lo-gun-grid lo-grid');
    for (const key of LOADOUT) {
      const gun = GUNS[key];
      const tile = button(`lo-gun-tile${key === held ? ' chosen' : ''}`, `pick-${key}`, () => this.pickGun(key));
      tile.setAttribute('aria-pressed', String(key === held));
      const top = el('span', 'lo-card-top');
      top.append(el('span', 'lo-mini', gun.kind), el('span', 'lo-keycap', keyOf(key)));
      const text = el('span', 'lo-card-text');
      text.append(el('span', 'lo-gun-name', gun.name), el('span', 'lo-gun-sub', `${gun.calibre} · ${gun.magazine} ${gun.pellets ? 'shells' : 'rounds'} · ${gun.fireMode === 'auto' ? 'Auto' : 'Semi'}`));
      tile.append(top, picture(gunThumb(key), 'lo-pic lo-gun-pic'), text);
      if (key === held) tile.append(el('span', 'lo-badge', 'In hands'));
      grid.append(tile);
    }
    sheet.append(grid);
    return sheet;
  }

  // The breakdowns picker: a card for each gun (its
  // picture, name, what the film shows and the model's credit). A click, or
  // Enter on the focused card, plays it; the arrow keys move between the
  // cards; Esc goes back.
  renderPicker() {
    const head = el('header', 'lo-head');
    const brand = el('div', 'lo-brand');
    const kicker = el('p', 'lo-kicker');
    kicker.append('Steelhead ', el('span', '', '·'), ' Films');
    brand.append(kicker, el('h1', 'lo-title', 'Breakdowns'));
    head.append(brand);
    this.ui.append(head);
    const sheet = el('section', 'lo-sheet');
    sheet.dataset.scroll = 'picker';
    const intro = el('div', 'lo-sheet-head');
    intro.append(el('p', 'lo-cat', 'Gun breakdowns'), el('p', 'lo-about', 'Pick a gun to watch it taken apart part by part, with what each part does.'));
    sheet.append(intro);
    const grid = el('div', 'lo-picks lo-grid');
    this.picks = [];
    for (const entry of BREAKDOWNS) {
      const card = button('lo-pick', `breakdown-${entry.id}`, () => this.pick(entry.id));
      card.dataset.breakdown = entry.id;
      const text = el('span', 'lo-card-text');
      text.append(el('span', 'lo-mini', 'Breakdown'), el('span', 'lo-gun-name', entry.name), el('span', 'lo-pick-what', entry.about), el('span', 'lo-pick-credit', entry.credit));
      card.append(picture(String(entry.thumb), 'lo-pic lo-pick-pic'), text);
      card.addEventListener('focus', () => { this.lastBreakdown = entry.id; });
      grid.append(card);
      this.picks.push(card);
    }
    sheet.append(grid);
    this.ui.append(sheet);
  }

  // Focus on the last breakdown watched (or the first), so Enter plays it.
  focusPick() {
    const card = (this.picks || []).find((c) => c.dataset.breakdown === this.lastBreakdown) || (this.picks || [])[0];
    if (card) card.focus({ preventScroll: false });
  }

  pick(id) {
    this.lastBreakdown = id;
    this.close(false);
    this.onBreakdown(id);
  }
}
