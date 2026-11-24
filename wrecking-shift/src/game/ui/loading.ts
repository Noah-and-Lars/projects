/** Full-screen loading overlay with a progress bar (shown while a level is built and meshed). */
export class LoadingScreen {
  private el: HTMLDivElement | null = null;
  private title!: HTMLElement;
  private bar!: HTMLElement;
  private note!: HTMLElement;

  private ensure(): HTMLDivElement {
    if (this.el) return this.el;
    const el = (this.el = document.createElement('div'));
    el.id = 'loading';
    el.style.cssText =
      'position:fixed;inset:0;z-index:50;background:#101418;color:#f2f2ee;display:flex;flex-direction:column;align-items:center;' +
      'justify-content:center;gap:14px;font:600 15px system-ui,sans-serif;letter-spacing:.12em;text-transform:uppercase';
    el.innerHTML =
      '<div id="loading-title"></div>' +
      '<div style="width:min(60vw,420px);height:8px;background:#2a3038;border-radius:4px;overflow:hidden">' +
      '<div id="loading-bar" style="height:100%;width:0;background:#f5c518;transition:width .15s"></div></div>' +
      '<div id="loading-note" style="font-weight:400;font-size:12px;opacity:.7;text-transform:none;letter-spacing:.02em"></div>';
    document.body.appendChild(el);
    this.title = el.querySelector('#loading-title') as HTMLElement;
    this.bar = el.querySelector('#loading-bar') as HTMLElement;
    this.note = el.querySelector('#loading-note') as HTMLElement;
    return el;
  }

  /** `frac` in 0..1 */
  show(title: string, frac: number, note: string): void {
    this.ensure().style.display = 'flex';
    this.title.textContent = title;
    this.bar.style.width = Math.round(Math.max(0, Math.min(1, frac)) * 100) + '%';
    this.note.textContent = note;
  }
  hide(): void { if (this.el) this.el.style.display = 'none'; }
}
