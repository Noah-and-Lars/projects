import type { Game } from '../game';
import type { Mission } from '../../sim/mission';
import { clock, el, esc, money, setHtml, show } from './dom';
import { TOOL_NAMES } from '../progress';
import { TOOL_GROUPS, groupOf, type Tool } from '../../sim/tools/tool';
import { keyOf } from '../keymap';

export type ToastKind = 'info' | 'cash' | 'alarm' | 'good';

/**
 * In-game HUD: objectives, alarm clock, interaction prompt, tool bar, health, speedometer, toasts,
 * debug overlay. Published prompt registry: `game.ext.hud.setPrompt(text | null, priority, source)`.
 */
export class Hud {
  readonly root = el('div', 'ws-hud');
  private obj = el('div', 'ws-obj ws-panel-s');
  private alarm = el('div', 'ws-alarm');
  private tr = el('div', 'ws-tr');
  private debugEl = el('div', 'ws-debug');
  private prompt = el('div', 'ws-prompt');
  private tools = el('div', 'ws-tools');
  private health = el('div', 'ws-health');
  private vignette = el('div', 'ws-vignette');
  private speedo = el('div', 'ws-speedo');
  private toasts: { e: HTMLElement; t: number }[] = [];
  private prompts = new Map<string, { text: string; prio: number }>();
  private hurtFlash = 0;
  debug = false;
  private crosshair: HTMLElement | null = document.getElementById('crosshair');

  constructor() {
    this.root.append(this.vignette, this.obj, this.alarm, this.tr, this.prompt, this.tools, this.health, this.speedo);
    this.tr.append(this.debugEl);
    this.health.innerHTML = '<small>CONDITION</small><div class="ws-bar"><i></i></div>';
  }

  /** prompt registry: highest priority non-null text wins. `source` keeps owners from clobbering each other. */
  setPrompt(text: string | null, priority = 0, source = 'default'): void {
    if (text) this.prompts.set(source, { text, prio: priority });
    else this.prompts.delete(source);
  }
  currentPrompt(): string | null {
    let best: { text: string; prio: number } | null = null;
    for (const p of this.prompts.values()) if (!best || p.prio > best.prio) best = p;
    return best?.text ?? null;
  }

  toast(html: string, kind: ToastKind = 'info', seconds = 3.5): void {
    const e = el('div', 'ws-toast ' + kind, html);
    this.tr.append(e);
    this.toasts.push({ e, t: seconds });
    while (this.toasts.length > 5) this.toasts.shift()!.e.remove();
  }
  /** forget per-level effects (damage flash, prompts) */
  reset(): void { this.hurtFlash = 0; this.prompts.clear(); }
  hurt(amount: number): void { this.hurtFlash = Math.min(1, this.hurtFlash + amount * 2.5 + 0.2); }

  /** per frame. `inGame` = false hides the whole HUD (menus, map) */
  // ---------------------------------------------------------------- tool bar (docs/research/12-inventory.md §9)
  private tbSerial = -1;
  private tbOpenUntil = 0;
  private tbKey = 0;
  private tbKeyUntil = 0;

  /** ammo text + state of a tool: '' for unlimited, custom labels (blowtorch seconds), low / empty flags */
  private ammoOf(game: Game, t: Tool): { text: string; cls: string } {
    if (t.ammo === Infinity || game.infiniteAmmo) return { text: '', cls: '' };
    const text = t.ammoLabel;
    const low = t.ammo <= 1 || (isFinite(t.maxAmmo) && t.ammo <= t.maxAmmo * 0.2);
    return { text, cls: t.ammo <= 0 ? ' empty' : low ? ' low' : '' };
  }

  /**
   * Compact bar (current tool name + ammo, always on) and the expanded group view: one column per non-empty
   * group (number key underneath, up to 5 tools, scrolled to keep the selection visible). The expanded view opens on
   * every switch and fades out 1.5 s after the last one (Settings: "Tool bar always expanded" keeps it open).
   */
  private toolbarHtml(game: Game): string {
    const belt = game.belt;
    const now = performance.now();
    if (belt.switchSerial !== this.tbSerial) {
      if (this.tbSerial >= 0) { this.tbOpenUntil = now + 1500; this.tbKey = belt.lastGroupKey; this.tbKeyUntil = now + 400; }
      this.tbSerial = belt.switchSerial;
    }
    const always = !!game.ext.settings?.toolbarExpanded;
    const open = always || now < this.tbOpenUntil;
    const cur = belt.current;
    const name = (t: Tool) => t.name || TOOL_NAMES[t.id] || t.id;
    const a = cur.unlocked ? this.ammoOf(game, cur) : { text: '', cls: '' };
    const compact = cur.unlocked
      ? `<div class="ws-tcur${a.cls}"><span class="gk">${groupOf(cur)}</span><span class="nm">${esc(name(cur))}</span>${a.text ? `<span class="am">${esc(a.text)}</span>` : ''}</div>`
      : '<div class="ws-tcur"><span class="nm">Hands</span></div>';
    let cols = '';
    if (open) {
      const order = belt.ordered();
      for (const G of TOOL_GROUPS) {
        const list = order.filter((i) => groupOf(belt.tools[i]) === G.n);
        const flash = this.tbKey === G.n && now < this.tbKeyUntil;
        if (list.length === 0 && !flash) continue;
        let win = list;
        if (list.length > 5) {
          const k = Math.max(0, list.indexOf(belt.index));
          const s0 = Math.min(Math.max(0, k - 2), list.length - 5);
          win = list.slice(s0, s0 + 5);
        }
        const rows = win.map((i) => {
          const t = belt.tools[i];
          const am = this.ammoOf(game, t);
          return `<div class="row${i === belt.index ? ' sel' : ''}${am.cls}"><span class="nm">${esc(name(t))}</span>${am.text ? `<span class="am">${esc(am.text)}</span>` : ''}</div>`;
        }).join('') || '<div class="row none">empty</div>';
        const more = list.length > 5 ? `<div class="more">${list.length} tools</div>` : '';
        cols += `<div class="col${list.includes(belt.index) ? ' cur' : ''}"><div class="gh">${esc(G.name)}</div>${more}${rows}<div class="key${flash ? ' hit' : ''}">${G.n}</div></div>`;
      }
    }
    return `<div class="ws-tgroups${open ? ' open' : ''}">${cols}</div>${compact}`;
  }

  update(game: Game, dt: number, opts: { visible: boolean; mapOpen: boolean }): void {
    show(this.root, opts.visible);
    for (const t of this.toasts) {
      t.t -= dt;
      if (t.t < 0.4) t.e.classList.add('out');
    }
    while (this.toasts.length && this.toasts[0].t <= 0) this.toasts.shift()!.e.remove();
    const pr = opts.visible && !opts.mapOpen ? this.currentPrompt() : null;
    if (this.crosshair) {
      this.crosshair.classList.toggle('ws-hot', !!pr);
      this.crosshair.classList.toggle('ws-hidden', opts.mapOpen || !game.controlsEnabled);
    }
    if (!opts.visible) return;
    const mission: Mission | null = game.ext.mission?.current ?? null;
    const sandbox = !!game.ext.mission?.sandbox;
    this.updateObjectives(mission, keyOf(game, 'interact'));
    this.updateAlarm(mission, sandbox);

    // interaction prompt under the crosshair
    show(this.prompt, !!pr);
    if (pr) setHtml(this.prompt, esc(pr));

    // tool bar
    const p = game.player;
    const veh = game.ext.vehicles?.current;
    const toolsOn = game.toolsEnabled && !p.seated && !veh && !opts.mapOpen;
    show(this.tools, toolsOn);
    if (toolsOn) setHtml(this.tools, this.toolbarHtml(game));

    // health
    const hp = p.health;
    show(this.health, hp < 0.995);
    (this.health.querySelector('i') as HTMLElement).style.width = `${Math.round(hp * 100)}%`;
    this.hurtFlash = Math.max(0, this.hurtFlash - dt * 1.6);
    this.vignette.style.opacity = String(Math.min(0.95, Math.max(this.hurtFlash, hp < 0.6 ? (0.6 - hp) * 1.4 : 0)));

    // speedometer
    show(this.speedo, !!veh);
    if (veh) {
      const kmh = Math.abs(Number(veh.speedKmh) || 0);
      const vh = typeof veh.health === 'number' ? Math.max(0, Math.min(1, veh.health)) : null;
      setHtml(this.speedo, `<div class="nm">${esc(veh.name ?? 'Vehicle')}</div><div><span class="v">${Math.round(kmh)}</span><span class="u">KM/H</span></div>` +
        (vh != null ? `<div class="ws-bar"><i style="width:${Math.round(vh * 100)}%"></i></div>` : ''));
    }

    // debug
    show(this.debugEl, this.debug);
    if (this.debug) {
      let dyn = 0;
      for (const b of game.sim.bodies.values()) if (b.dynamic) dyn++;
      const pos = p.pos;
      this.debugEl.textContent =
        `fps ${game.perf.fps.toFixed(0)}  sim ${game.perf.sim.toFixed(2)} ms  draw ${game.perf.render.toFixed(1)} ms\n` +
        `bodies ${game.sim.bodies.size} (dyn ${dyn})  fires ${game.fire?.count?.() ?? 0}\n` +
        `tick ${game.sim.tick}  pos ${pos.x.toFixed(1)} ${pos.y.toFixed(1)} ${pos.z.toFixed(1)}` +
        (mission ? `\nmission ${mission.def.id} ${mission.phase}` : '');
    }
  }

  private updateObjectives(m: Mission | null, interactKey = 'E'): void {
    show(this.obj, !!m);
    if (!m) return;
    let html = `<h4>${esc(m.def.title)}</h4><ul>`;
    for (const o of m.objectives()) {
      html += `<li class="${o.required ? 'req' : 'opt'}${o.done ? ' done' : ''}"><span class="bx"></span><span class="t">${o.required ? '' : '<span class="tag">BONUS</span>'}${esc(o.title)}</span>${o.detail && !o.done ? `<span class="d">${esc(o.detail)}</span>` : ''}</li>`;
    }
    html += '</ul>';
    if (m.cash > 0) html += `<div class="cash">Pocketed <b>${money(m.cash)}</b></div>`;
    if (m.escapeOpen && !m.ended) html += `<div class="esc">▶ Get to the van and clock out (${esc(interactKey)})</div>`;
    setHtml(this.obj, html);
  }

  private updateAlarm(m: Mission | null, sandbox: boolean): void {
    let html = '';
    let urgent = false;
    if (sandbox) html = '<div class="chip"><b>Sandbox</b> · all tools · infinite ammo</div>';
    else if (m && m.phase === 'alarm' && m.alarmUnlimited) {
      html = '<div class="clock"><small>SECURITY ALERTED</small><span>no limit</span></div>';
    } else if (m && m.phase === 'alarm') {
      urgent = m.timeLeft <= 10;
      html = `<div class="clock"><small>SECURITY ETA</small><span>${clock(m.timeLeft)}</span></div>`;
    } else if (m && m.phase === 'planning') {
      html = m.hasAlarm ? `<div class="chip">Planning · alarm <b>${m.alarmUnlimited ? 'no limit' : m.alarmSecondsTotal + ' s'}</b></div>` : '<div class="chip">No alarm · <b>take your time</b></div>';
    }
    this.alarm.classList.toggle('urgent', urgent);
    setHtml(this.alarm, html);
  }
}
