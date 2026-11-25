import type { Game } from '../game';
import type { Mission } from '../../sim/mission';
import { clock, el, esc, money, setHtml, show } from './dom';
import { TOOL_NAMES } from '../progress';
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
    if (toolsOn) {
      let html = '';
      // many tools (mods): show a window of 15 slots around the selected one
      const shown = game.belt.tools.map((t, i) => (t.unlocked ? i : -1)).filter((i) => i >= 0);
      const MAXS = Math.max(6, Math.min(15, Math.floor(((typeof innerWidth === "number" ? innerWidth : 1280) - 16) / 44)));
      let win = shown;
      if (shown.length > MAXS) {
        const k = Math.max(0, shown.indexOf(game.belt.index));
        const a = Math.min(Math.max(0, k - (MAXS >> 1)), shown.length - MAXS);
        win = shown.slice(a, a + MAXS);
      }
      game.belt.tools.forEach((t, i) => {
        if (!t.unlocked || !win.includes(i)) return;
        const inf = t.ammo === Infinity || game.infiniteAmmo;
        const am = inf ? '∞' : String(Math.max(0, Math.floor(t.ammo)));
        const cls = 'ws-slot' + (i === game.belt.index ? ' sel' : '') + (!inf && t.ammo <= 0 ? ' empty' : '');
        html += `<div class="${cls}"><span class="n">${i < 10 ? (i + 1) % 10 : '·'}</span><span class="nm">${esc(t.name || TOOL_NAMES[t.id] || t.id)}</span><span class="am">${am}</span></div>`;
      });
      setHtml(this.tools, html);
    }

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
