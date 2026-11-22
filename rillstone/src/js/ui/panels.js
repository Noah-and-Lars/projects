// Modal panels (shops, contracts, saves): cream cards over the game. Opening
// one releases the mouse; closing hands control back.
import { h } from './dom.js';

export function createPanels(root, { onOpen, onClose }) {
  const el = h('section', { id: 'scr-panel', class: 'screen interactive hidden' });
  root.append(el);
  let current = null;
  const api = {
    get open() { return !!current; },
    get current() { return current; },
    show(id, title, body, opts = {}) {
      current = id;
      const close = h('button', { class: 'btn', onclick: () => api.close() }, opts.closeLabel || 'Close');
      el.replaceChildren(h('div', { class: 'panel wide shop' }, h('div', { class: 'panel-head' }, h('h2', {}, title), opts.badge ? h('span', { class: 'pill' }, opts.badge) : null), body, h('div', { class: 'col' }, close)));
      el.classList.remove('hidden');
      onOpen?.(id);
    },
    close() { if (!current) return; current = null; el.classList.add('hidden'); onClose?.(); },
    el,
  };
  addEventListener('keydown', (e) => { if (current && e.code === 'Escape') { e.preventDefault(); api.close(); } });
  return api;
}
