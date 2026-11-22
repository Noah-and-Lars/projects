// In-game HUD: crosshair, action hint, clock, balance, toasts, debug overlay.
import { h } from './dom.js';

export function createHUD(root) {
  const cross = h('div', { id: 'crosshair' });
  const hint = h('div', { id: 'hint' });
  const clock = h('div', { id: 'clock', class: 'pill' });
  const wallet = h('div', { id: 'wallet', class: 'pill' });
  const toasts = h('div', { id: 'toasts' });
  const debug = h('pre', { id: 'debug', class: 'hidden' });
  const caption = h('div', { id: 'captions' });
  const tip = h('div', { id: 'tooltip', class: 'hidden' });
  const hotbar = h('div', { id: 'hotbar' });
  const el = h('div', { id: 'hud', class: 'hidden' }, cross, hint, h('div', { class: 'hud-tr' }, wallet, clock), toasts, debug, caption, tip, hotbar);
  root.append(el);
  let lastHint = '';
  return {
    el, debug,
    show(v) { el.classList.toggle('hidden', !v); },
    hint(text) { if (text !== lastHint) { hint.innerHTML = text; lastHint = text; } },
    clock(dayFrac, day) {
      const mins = Math.floor(dayFrac * 24 * 60), hh = Math.floor(mins / 60), mm = mins % 60;
      const s = `Day ${day} · ${String(hh).padStart(2, '0')}:${String(mm - (mm % 5)).padStart(2, '0')}`;
      if (clock.textContent !== s) clock.textContent = s;
    },
    wallet(scrip, standing) { const s = `§ ${Math.floor(scrip).toLocaleString('en-GB')}` + (standing != null ? ` · ★ ${standing}` : ''); if (wallet.textContent !== s) wallet.textContent = s; },
    toast(text, kind = '') {
      const t = h('div', { class: 'toast ' + kind }, text);
      toasts.append(t);
      setTimeout(() => t.classList.add('out'), 3200);
      setTimeout(() => t.remove(), 3800);
      while (toasts.children.length > 5) toasts.firstChild.remove();
    },
    caption(text) {
      const c = h('div', { class: 'cap' }, `[${text}]`);
      caption.append(c); setTimeout(() => c.remove(), 2200);
      while (caption.children.length > 3) caption.firstChild.remove();
    },
    tooltip(card) {
      if (!card) { tip.classList.add('hidden'); return; }
      tip.classList.remove('hidden');
      const html = `<b>${card.name}</b>${card.badge ? `<span class="badge">${card.badge}</span>` : ''}` + (card.lines || []).map(l => `<div>${l}</div>`).join('');
      if (tip.innerHTML !== html) tip.innerHTML = html;
    },
    // Two inventory slots: the hand and the quick-swap slot.
    hotbar(slots) {
      const html = slots.map((sl, i) => `<div class="slot${i === 0 ? ' active' : ''}${sl ? '' : ' empty'}"><span class="key">${i === 0 ? 'Hand' : 'Q'}</span>${sl ? `<i style="background:${sl.color}"></i><b>${sl.name}</b>${sl.sub ? `<small>${sl.sub}</small>` : ''}` : '<b>Empty</b>'}</div>`).join('');
      if (hotbar.innerHTML !== html) hotbar.innerHTML = html;
    },
    toggleDebug() { debug.classList.toggle('hidden'); },
    debugOn: () => !debug.classList.contains('hidden'),
  };
}
