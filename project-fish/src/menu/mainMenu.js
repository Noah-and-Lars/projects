// The main menu (the #menu element in index.html; its look is
// src/menu/menu.css): the title, the list of what you can do, the Controls
// and Credits panels, and the version in the corner. It is the first thing
// you see (mode 'title', over the live backdrop, src/menu/backdrop.js), and
// it comes back over the game when you pause (mode 'pause': Resume at the
// top instead of Play).
//
// It only shows and lays out; what an item does is the game's (onAction:
// the item's data-action, 'play', 'loadout', 'breakdowns' or 'fullscreen';
// Controls and Credits open their panels here). The mouse over an item, or
// the keyboard (up and down, Home and End, Tab), puts the accent bar on it;
// Enter or a click chooses it; Esc closes a panel.

const ABOUT = {
  play: 'Into the game: the mouse locks to it (Esc pauses).',
  resume: 'Back into the game where you left it.',
  loadout: 'Pick a gun, its attachments, and your outfit.',
  breakdowns: 'Watch a gun taken apart part by part.',
  controls: 'Every key.',
  credits: 'The models, sounds and fonts the game is made with.',
  fullscreen: 'Fill the whole screen with the game.',
};

export class MainMenu {
  constructor(root) {
    this.root = root;
    this.mode = 'title';
    this.visible = false;
    this.covered = false;
    this.ready = false;
    this.panel = null; // the open panel's name
    this.onAction = null;
    this.list = root.querySelector('.menu-list');
    this.bar = root.querySelector('.menu-bar');
    this.about = root.querySelector('.menu-about');
    this.status = root.querySelector('.menu-status');
    this.items = [...root.querySelectorAll('.menu-item')];
    this.play = this.items.find((b) => b.dataset.action === 'play');
    this.playLabel = this.play.querySelector('.label');
    this.current = this.play;

    for (const item of this.items) {
      item.addEventListener('click', () => this.choose(item));
      item.addEventListener('pointerenter', (e) => {
        if (e.pointerType === 'mouse' && !this.panel) item.focus({ preventScroll: true });
      });
      item.addEventListener('focus', () => this.mark(item));
    }
    for (const close of root.querySelectorAll('.menu-panel .panel-close')) close.addEventListener('click', () => this.closePanel());
    document.addEventListener('keydown', (e) => this.key(e));
    window.addEventListener('resize', () => this.mark(this.current, false));
    document.fonts?.ready.then(() => this.mark(this.current, false));

    // Fullscreen, where the browser has it (not an iPhone, say).
    const full = this.items.find((b) => b.dataset.action === 'fullscreen');
    if (full) {
      if (!document.fullscreenEnabled) full.hidden = true;
      const label = () => {
        full.querySelector('.label').textContent = document.fullscreenElement ? 'Exit fullscreen' : 'Fullscreen';
      };
      document.addEventListener('fullscreenchange', label);
      label();
    }
    this.showVersion();
  }

  // Shows it (fading in), as the title screen or the pause menu, with the
  // bar on the first item.
  show(mode = this.mode) {
    this.mode = mode;
    this.root.classList.toggle('title', mode === 'title');
    this.root.classList.toggle('pause', mode === 'pause');
    this.playLabel.textContent = mode === 'pause' ? 'Resume' : 'Play';
    this.play.dataset.about = mode === 'pause' ? 'resume' : 'play';
    this.cover(false);
    if (!this.visible) {
      this.visible = true;
      this.root.classList.remove('gone');
      this.root.classList.add('enter');
      this.root.inert = false;
      document.body.classList.add('menu-visible');
      // (Replayed each time it comes back.)
      void this.root.offsetWidth;
      this.root.classList.remove('enter');
    }
    this.closePanel(false);
    this.play.focus({ preventScroll: true });
    this.mark(this.play, false);
  }

  // Fades it out (into the game).
  hide() {
    if (!this.visible) return;
    this.visible = false;
    this.closePanel(false);
    this.root.classList.add('gone');
    this.root.inert = true;
    document.body.classList.remove('menu-visible');
    if (this.root.contains(document.activeElement)) document.activeElement.blur();
  }

  // Hides the title and list while something opens over it (the loadout
  // menu, a breakdown), keeping what's behind them; false
  // brings them back, on the item last chosen.
  cover(on) {
    if (on === this.covered) return;
    this.covered = on;
    this.root.classList.toggle('covered', on);
    if (!on && this.visible && this.current) {
      this.current.focus({ preventScroll: true });
      this.mark(this.current, false);
    }
  }

  // Play turns from "loading" into a button that works.
  setReady(ready) {
    this.ready = ready;
    this.play.classList.toggle('loading', !ready);
    this.play.setAttribute('aria-disabled', String(!ready));
  }

  // A line under the list (kind 'error' in red), or nothing.
  setStatus(text, kind = '') {
    this.status.textContent = text || '';
    this.status.dataset.kind = kind;
  }

  choose(item) {
    const action = item.dataset.action;
    if (action === 'controls' || action === 'credits') {
      if (this.panel === action) this.closePanel();
      else this.openPanel(action);
      return;
    }
    this.closePanel(false);
    if (this.onAction) this.onAction(action);
  }

  openPanel(name) {
    this.closePanel(false);
    const panel = this.root.querySelector(`.menu-panel[data-panel="${name}"]`);
    if (!panel) return;
    this.panel = name;
    panel.hidden = false;
    panel.scrollTop = 0;
    this.root.classList.add('panel-open');
    const item = this.items.find((b) => b.dataset.action === name);
    if (item) item.classList.add('open');
    // (Focus in the panel, so Tab, the arrows and Esc work in it.)
    panel.focus({ preventScroll: true });
  }

  // refocus: back on the item that opened it.
  closePanel(refocus = true) {
    if (!this.panel) return;
    const name = this.panel;
    this.panel = null;
    for (const p of this.root.querySelectorAll('.menu-panel')) p.hidden = true;
    this.root.classList.remove('panel-open');
    const item = this.items.find((b) => b.dataset.action === name);
    if (item) {
      item.classList.remove('open');
      if (refocus) item.focus({ preventScroll: true });
    }
  }

  // Puts the accent bar on an item (sliding there) and says what it does.
  mark(item, slide = true) {
    if (!item || item.hidden) return;
    this.current = item;
    for (const b of this.items) b.classList.toggle('active', b === item);
    const list = this.list.getBoundingClientRect();
    const box = item.getBoundingClientRect();
    if (!box.height) return;
    this.bar.classList.toggle('instant', !slide);
    this.bar.style.transform = `translateY(${box.top - list.top}px)`;
    this.bar.style.height = `${box.height}px`;
    this.bar.classList.toggle('accent', item.classList.contains('accent'));
    this.bar.classList.add('on');
    if (this.about) this.about.textContent = ABOUT[item.dataset.about || item.dataset.action] || '';
  }

  // The keyboard, while it's showing and nothing's open over it.
  key(e) {
    if (!this.visible || this.covered || e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return;
    if (e.code === 'Escape') {
      if (this.panel) {
        e.preventDefault();
        this.closePanel();
      }
      return;
    }
    if (this.panel) {
      // Up and down scroll the panel (the browser does that); nothing else.
      return;
    }
    const shown = this.items.filter((b) => !b.hidden);
    const at = shown.indexOf(document.activeElement);
    let to = -1;
    if (e.code === 'ArrowDown') to = at < 0 ? shown.indexOf(this.current) : (at + 1) % shown.length;
    else if (e.code === 'ArrowUp') to = at < 0 ? shown.indexOf(this.current) : (at - 1 + shown.length) % shown.length;
    else if (e.code === 'Home') to = 0;
    else if (e.code === 'End') to = shown.length - 1;
    else if ((e.code === 'Enter' || e.code === 'NumpadEnter' || e.code === 'Space') && at < 0) {
      // Enter with nothing focused (after a click on the backdrop): the item the bar is on.
      e.preventDefault();
      if (this.current) this.choose(this.current);
      return;
    }
    if (to < 0) return;
    e.preventDefault();
    shown[Math.max(0, to)].focus({ preventScroll: true });
  }

  // The version in the corner: package.json's, and the day it was last
  // changed (the file's date from the server), e.g. "v0.1.0 · 2026-11-09".
  async showVersion() {
    const el = this.root.querySelector('.menu-build');
    if (!el) return;
    try {
      const response = await fetch(new URL('../../package.json', import.meta.url), { cache: 'no-cache' });
      if (!response.ok) return;
      const { version } = await response.json();
      if (!version) return;
      const modified = new Date(response.headers.get('last-modified') || '');
      const day = Number.isNaN(modified.getTime()) ? '' : ` · ${modified.toISOString().slice(0, 10)}`;
      el.textContent = `v${version}${day}`;
    } catch {
      // No version to show (the page is served without package.json).
    }
  }
}
