// Tiny DOM helpers (no framework).
export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, unknown> = {},
  ...children: (Node | string | null | undefined | false)[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') el.className = String(v);
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v as EventListener);
    else if (k === 'html') el.innerHTML = String(v);
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  for (const c of children) if (c !== null && c !== undefined && c !== false) el.append(c);
  return el;
}

let toastTimer = 0;
export function toast(msg: string, kind: 'info' | 'warn' | 'error' = 'info') {
  let el = document.getElementById('toast');
  if (!el) { el = h('div', { id: 'toast', role: 'status', 'aria-live': 'polite' }); document.body.append(el); }
  el.textContent = msg;
  el.className = 'show ' + kind;
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => { el!.className = ''; }, 2600);
}

export function modal(title: string, body: HTMLElement, actions: { label: string; primary?: boolean; onClick?: () => void | boolean }[] = []): () => void {
  const close = () => wrap.remove();
  const wrap = h('div', { class: 'modal-wrap', onclick: (e: Event) => { if (e.target === wrap) close(); } },
    h('div', { class: 'modal sheet', role: 'dialog', 'aria-label': title },
      h('div', { class: 'sheet-title' }, h('span', {}, title), h('button', { class: 'icon-btn', 'aria-label': 'Close', onclick: close }, '×')),
      body,
      actions.length ? h('div', { class: 'modal-actions' }, ...actions.map((a) => h('button', { class: a.primary ? 'btn primary' : 'btn', onclick: () => { if (a.onClick?.() !== false) close(); } }, a.label))) : null,
    ));
  document.body.append(wrap);
  return close;
}

export const isTouch = () => matchMedia('(pointer: coarse)').matches;
