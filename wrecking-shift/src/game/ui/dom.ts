/** tiny DOM helpers (no framework) */
export function esc(s: unknown): string {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}
export function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', html = ''): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html) e.innerHTML = html;
  return e;
}
/** set innerHTML only when it changed (avoids layout churn every frame) */
export function setHtml(e: HTMLElement, html: string): void {
  if ((e as any)._html !== html) { (e as any)._html = html; e.innerHTML = html; }
}
export function show(e: HTMLElement, on: boolean): void {
  e.classList.toggle('hide', !on);
}
/** 75 -> "1:15" */
export function clock(sec: number): string {
  const s = Math.max(0, Math.ceil(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
export function money(n: number): string {
  return '$' + Math.round(n).toLocaleString('en-US');
}
