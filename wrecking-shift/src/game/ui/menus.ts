import type { Game } from '../game';
import { LEVELS } from '../levels';
import type { MissionApi } from '../missionModule';
import { RANKS, TOOL_NAMES, UPGRADES, type Progress, type SettingsData } from '../progress';
import { isRequired, maxScore, pointsOf, type MissionDef } from '../../sim/mission';
import { el, esc, money } from './dom';

export type MenuName = 'main' | 'missions' | 'briefing' | 'sandbox' | 'shop' | 'settings' | 'controls' | 'pause' | 'success' | 'fail';

/** what the menus need from the UI module */
export interface MenuHost {
  game: Game;
  progress: Progress;
  api: MissionApi;
  /** 'menu' = at the title screen (backdrop), 'play' = in a mission / sandbox */
  session: 'menu' | 'play';
  open(name: MenuName, arg?: string): void;
  back(): void;
  close(): void;
  startMission(id: string): void;
  startSandbox(levelId: string): void;
  quitToMenu(): void;
}

const CONTROLS: [string, string][] = [
  ['W A S D', 'Move'], ['Mouse', 'Look'], ['Space', 'Jump'], ['Shift', 'Sprint'], ['Ctrl / C', 'Crouch'],
  ['LMB', 'Use tool'], ['RMB', 'Grab / alt fire'], ['1 – 0 / Q / wheel', 'Select tool'], ['E', 'Take / interact / enter'],
  ['Tab', 'Site map'], ['Esc', 'Pause'], ['F3', 'Debug info'],
];

/** Full-screen menus (title, job board, briefing, shop, settings, pause, end screens). Plain DOM. */
export class Menus {
  readonly root = el('div', 'hide');
  name: MenuName | null = null;
  arg = '';
  private selected = '';

  constructor(private host: MenuHost) {
    this.root.addEventListener('click', (e) => this.onClick(e));
    this.root.addEventListener('input', (e) => this.onInput(e));
  }

  render(name: MenuName | null, arg = ''): void {
    this.name = name; this.arg = arg;
    this.root.classList.toggle('hide', !name);
    if (!name) { this.root.innerHTML = ''; return; }
    const html = this.html(name, arg);
    this.root.innerHTML = html;
    const first = this.root.querySelector<HTMLElement>('.ws-btn.pri') ?? this.root.querySelector<HTMLElement>('.ws-btn');
    try { first?.focus({ preventScroll: true }); } catch { /* ignore */ }
  }
  refresh(): void { if (this.name) this.render(this.name, this.arg); }

  // ---------------------------------------------------------------- templates

  private html(name: MenuName, arg: string): string {
    switch (name) {
      case 'main': return this.mainHtml();
      case 'missions': return this.missionsHtml();
      case 'briefing': return this.briefingHtml(arg);
      case 'sandbox': return this.sandboxHtml();
      case 'shop': return this.shopHtml();
      case 'settings': return this.settingsHtml();
      case 'controls': return this.controlsHtml();
      case 'pause': return this.pauseHtml();
      case 'success': return this.successHtml();
      case 'fail': return this.failHtml();
    }
  }

  private win(title: string, body: string, foot: string, opts: { cls?: string; tag?: string; right?: string; menuCls?: string } = {}): string {
    return `<div class="ws-menu ${opts.menuCls ?? ''}"><div class="ws-win ${opts.cls ?? ''}"><header>${opts.tag ? `<span class="tag">${esc(opts.tag)}</span>` : ''}<h2>${title}</h2><span class="sp"></span>${opts.right ?? ''}</header>` +
      `<div class="ws-body">${body}</div>${foot ? `<div class="ws-foot">${foot}</div>` : ''}</div></div>`;
  }

  private rankCard(): string {
    const p = this.host.progress;
    const score = p.totalScore();
    const r = p.rank(score);
    const nextTools = r.next ? r.next.tools.map((t) => TOOL_NAMES[t] ?? t).join(', ') : '';
    return `<div class="ws-rankcard"><div class="lbl">Contractor rank</div><div class="rk">${esc(r.name)}</div>` +
      `<div class="row"><span>Career score</span><b>${score}</b></div><div class="row"><span>Cash</span><b>${money(p.cash)}</b></div>` +
      `<div class="ws-bar"><i style="width:${Math.round(r.progress * 100)}%"></i></div>` +
      `<div class="nx">${r.next ? `Next: ${esc(r.next.name)} at ${r.next.score}${nextTools ? ` · unlocks ${esc(nextTools)}` : ''}` : 'Top of the ladder.'}</div></div>`;
  }

  private mainHtml(): string {
    const p = this.host.progress;
    const cont = p.hasProgress();
    return `<div class="ws-menu clear"><div class="ws-main">` +
      `<div class="ws-hazard"></div><h1 class="ws-title">Wrecking<span>Shift</span></h1>` +
      `<div class="ws-tagline">Freelance demolition · odd jobs · no questions · Gullmouth Harbour</div>` +
      `<nav class="ws-nav">` +
      `<button class="ws-btn pri" data-act="play">${cont ? 'Continue' : 'Play'} — job board</button>` +
      `<button class="ws-btn" data-act="open" data-id="sandbox">Sandbox</button>` +
      `<button class="ws-btn" data-act="open" data-id="shop">Tools &amp; upgrades</button>` +
      `<button class="ws-btn" data-act="open" data-id="settings">Settings</button>` +
      `<button class="ws-btn" data-act="open" data-id="controls">Controls</button>` +
      `</nav></div>${this.rankCard()}<div class="ws-version">Wrecking Shift · prototype</div></div>`;
  }

  private missionsHtml(): string {
    const { api, progress } = this.host;
    const list = api.list;
    if (!this.selected || !list.some((m) => m.id === this.selected)) {
      const last = progress.data.lastMission;
      const firstOpen = list.find((m) => progress.isMissionUnlocked(m) && !progress.record(m.id)?.completed);
      this.selected = firstOpen?.id ?? last ?? list[0]?.id ?? '';
    }
    let cards = '';
    for (const m of list) {
      const unlocked = progress.isMissionUnlocked(m);
      const rec = progress.record(m.id);
      cards += `<button class="ws-card${m.id === this.selected ? ' sel' : ''}${unlocked ? '' : ' locked'}" data-act="sel" data-id="${esc(m.id)}">` +
        `<div class="t"><span>${unlocked ? '' : '🔒 '}${esc(m.title)}</span>${rec?.completed ? '<span class="ok">✔ DONE</span>' : ''}</div>` +
        `<div class="s">${esc(m.client)}${rec?.best ? ` · best ${rec.best}` : ''}</div></button>`;
    }
    const d = list.find((m) => m.id === this.selected);
    const detail = d ? this.missionDetail(d, false) : '<p class="ws-note">No jobs on the board.</p>';
    const ok = d && progress.isMissionUnlocked(d);
    return this.win('Job board', `<div class="ws-split"><div class="ws-list">${cards}</div><div class="ws-detail">${detail}</div></div>`,
      `<button class="ws-btn" data-act="back">Back</button><button class="ws-btn pri" data-act="brief" data-id="${esc(d?.id ?? '')}"${ok ? '' : ' disabled'}>Take the job</button>`,
      { tag: 'Gullmouth', right: `<span class="money">${money(progress.cash)}</span>` });
  }

  private missionDetail(d: MissionDef, full: boolean): string {
    const { progress } = this.host;
    const rec = progress.record(d.id);
    const paras = d.brief.split(/\n\s*\n/).map((s) => `<p>${esc(s.trim())}</p>`);
    const brief = full ? paras.join('') : paras.slice(0, 1).join('') + (paras.length > 1 ? '<p class="ws-note">… full brief on the next screen.</p>' : '');
    const locked = !progress.isMissionUnlocked(d);
    const need = (d.unlockAfter ?? []).filter((id) => !progress.record(id)?.completed).map((id) => this.host.api.byId(id)?.title ?? id);
    return `<h3>${esc(d.title)}</h3><div class="client">Client: ${esc(d.client)}</div>${brief}` +
      `<div class="ws-kv"><span>Site <b>${esc(LEVELS[d.levelId]?.title ?? d.levelId)}</b></span><span>Best <b>${rec?.best ?? '—'}</b> / ${maxScore(d)}</span>` +
      `${d.reward?.cash ? `<span>Fee <b>${money(d.reward.cash)}</b></span>` : ''}</div>` +
      (locked ? `<p class="ws-note">🔒 Finish ${need.map((n) => `“${esc(n)}”`).join(', ')} first.</p>` : '');
  }

  private briefingHtml(id: string): string {
    const d = this.host.api.byId(id);
    if (!d) return this.missionsHtml();
    const objs = d.objectives.map((o) => `<li class="${isRequired(o) ? 'req' : 'opt'}">${esc(o.title)}<span class="p">${isRequired(o) ? '' : 'bonus '}+${pointsOf(o)}</span></li>`).join('');
    const alarms: string[] = [];
    if (d.objectives.some((o) => o.kind === 'collect' || o.kind === 'deliver')) alarms.push(`Alarm boxes: tampering starts a <b>${d.alarmSeconds ?? 60} s</b> countdown`);
    if (d.fireAlarm != null) alarms.push('Fire alarm: big fires call security');
    if (d.demolitionSensor != null) alarms.push('Vibration sensors: heavy demolition trips the alarm');
    const tools = d.tools?.allow ? `<div class="ws-kv"><span>Tools allowed: <b>${esc(d.tools.allow.map((t) => TOOL_NAMES[t] ?? t).join(', '))}</b></span></div>` : '';
    return this.win(esc(d.title), `<div class="ws-grid2"><div class="ws-detail">${this.missionDetail(d, true)}</div>` +
      `<div><div class="ws-sec">Objectives</div><ul class="ws-objlist">${objs}</ul>` +
      `<div class="ws-sec">Security</div><p class="ws-note">${alarms.length ? alarms.join('<br>') : 'None known. Enjoy the quiet.'}</p>${tools}` +
      `<div class="ws-sec">Plan</div><p class="ws-note">No clock until something trips the alarm. Scout with the map (Tab), prepare your route, then grab and run. Collect everything required, then clock out at the van (E).</p></div></div>`,
      `<button class="ws-btn" data-act="back">Back</button><button class="ws-btn pri" data-act="start" data-id="${esc(d.id)}">Start shift</button>`,
      { tag: 'Briefing' });
  }

  private sandboxHtml(): string {
    const cards = Object.values(LEVELS).map((l) => `<button class="ws-card" data-act="sbx" data-id="${esc(l.id)}"><div class="t"><span>${esc(l.title)}</span></div><div class="s">All tools · infinite ammo · no alarms</div></button>`).join('');
    return this.win('Sandbox', `<p class="ws-note">Free demolition. Upgrades you bought apply here too.</p><div class="ws-list">${cards}</div>`,
      '<button class="ws-btn" data-act="back">Back</button>', { cls: 'mid', tag: 'Free shift' });
  }

  private shopHtml(): string {
    const p = this.host.progress;
    const belt = this.host.game.belt;
    const score = p.totalScore();
    let rows = '';
    for (const u of UPGRADES) {
      const name = belt?.byId(u.tool)?.name ?? TOOL_NAMES[u.tool] ?? u.tool;
      const lvl = p.upgradeLevel(u.tool);
      const cost = p.nextUpgradeCost(u.tool);
      const unlocked = p.isToolUnlocked(u.tool, score);
      const pips = u.costs.map((_, i) => `<i class="${i < lvl ? 'on' : ''}"></i>`).join('');
      let action: string;
      if (!unlocked) action = `<span class="lk">🔒 ${esc(p.toolRank(u.tool)?.name ?? '')} (${p.toolRank(u.tool)?.score ?? 0})</span>`;
      else if (cost == null) action = '<span class="lk">Maxed</span>';
      else action = `<button class="ws-btn sm${p.cash >= cost ? ' pri' : ''}" data-act="buy" data-id="${esc(u.tool)}"${p.cash >= cost ? '' : ' disabled'}>${money(cost)}</button>`;
      rows += `<tr><td><b>${esc(name)}</b></td><td><span class="ws-pips">${pips}</span></td><td>${esc(u.label)}</td><td class="r">${action}</td></tr>`;
    }
    let ranks = '';
    for (const r of RANKS) {
      const got = score >= r.score;
      ranks += `<tr><td>${got ? '✔' : ''}</td><td><b>${esc(r.name)}</b></td><td class="r">${r.score}</td><td>${esc(r.tools.map((t) => TOOL_NAMES[t] ?? t).join(', ') || '—')}</td></tr>`;
    }
    return this.win('Tools &amp; upgrades',
      `<div class="ws-sec">Ammo upgrades</div><table class="ws-shop"><tr><th>Tool</th><th>Level</th><th>Per level</th><th class="r">Next</th></tr>${rows}</table>` +
      `<div class="ws-sec" style="margin-top:.8em">Ranks &amp; tool unlocks</div><table class="ws-shop"><tr><th></th><th>Rank</th><th class="r">Score</th><th>Unlocks</th></tr>${ranks}</table>`,
      '<button class="ws-btn" data-act="back">Back</button>',
      { tag: 'Workshop', right: `<span class="money">${money(p.cash)}</span>` });
  }

  private settingsHtml(): string {
    const s = this.host.progress.settings;
    const range = (k: keyof SettingsData, label: string, min: number, max: number, step: number, fmt: (v: number) => string) =>
      `<label for="ws-${k}">${label}</label><input id="ws-${k}" type="range" min="${min}" max="${max}" step="${step}" value="${s[k]}" data-key="${k}"><output>${fmt(s[k] as number)}</output>`;
    const check = (k: keyof SettingsData, label: string) => `<label for="ws-${k}">${label}</label><input id="ws-${k}" type="checkbox" data-key="${k}"${s[k] ? ' checked' : ''}><span></span>`;
    const pct = (v: number) => Math.round(v * 100) + '%';
    const q = (['low', 'medium', 'high'] as const).map((v) => `<button data-act="seg" data-key="quality" data-val="${v}" class="${s.quality === v ? 'on' : ''}">${v}</button>`).join('');
    return this.win('Settings', `<div class="ws-form">` +
      range('sensitivity', 'Mouse sensitivity', 0.2, 3, 0.05, (v) => v.toFixed(2) + '×') +
      check('invertY', 'Invert mouse Y') +
      range('fov', 'Field of view', 60, 110, 1, (v) => v + '°') +
      check('headBob', 'Head bob') +
      range('masterVolume', 'Master volume', 0, 1, 0.01, pct) +
      range('musicVolume', 'Music volume', 0, 1, 0.01, pct) +
      range('sfxVolume', 'Effects volume', 0, 1, 0.01, pct) +
      `<label>Graphics quality</label><span class="ws-seg">${q}</span><span></span>` +
      `</div>`,
      '<button class="ws-btn" data-act="reset-settings">Defaults</button><button class="ws-btn pri" data-act="back">Done</button>', { cls: 'mid', tag: 'Options' });
  }

  private controlsHtml(): string {
    const keys = CONTROLS.map(([k, v]) => `<div><span>${esc(v)}</span><kbd>${esc(k)}</kbd></div>`).join('');
    return this.win('Controls', `<div class="ws-keys">${keys}</div><p class="ws-note" style="margin-top:.7em">Click the game to capture the mouse. Esc releases it and pauses.</p>`,
      '<button class="ws-btn pri" data-act="back">Back</button>', { cls: 'mid', tag: 'Help' });
  }

  private pauseHtml(): string {
    const { api, game } = this.host;
    const m = api.current;
    const qs = game.ext.quicksave;
    const canSave = !!qs?.save && !!m && m.canQuicksave();
    const canLoad = !!qs?.load && (typeof qs.has === 'function' ? !!qs.has() : true) && (!m || m.canQuicksave() || m.ended || m.phase === 'alarm');
    const title = m ? esc(m.def.title) : api.sandbox ? 'Sandbox' : 'Paused';
    const note = !m ? '' : !qs ? 'Quicksave is not available in this build.' : m.canQuicksave() ? 'Planning phase: quicksave available.' : 'Alarm tripped: quicksave locked until you restart.';
    return this.win(title, `<nav class="ws-nav" style="width:100%">` +
      `<button class="ws-btn pri" data-act="resume">Resume</button>` +
      `<button class="ws-btn" data-act="restart">${m ? 'Restart job' : 'Restart'}</button>` +
      `<button class="ws-btn" data-act="qsave"${canSave ? '' : ' disabled'}>Quicksave</button>` +
      `<button class="ws-btn" data-act="qload"${canLoad && qs ? '' : ' disabled'}>Quickload</button>` +
      `<button class="ws-btn" data-act="open" data-id="settings">Settings</button>` +
      `<button class="ws-btn" data-act="open" data-id="controls">Controls</button>` +
      `<button class="ws-btn" data-act="quit">Quit to title</button></nav>` +
      (note ? `<p class="ws-note" style="margin:.6em 0 0">${note}</p>` : ''),
      '', { cls: 'narrow', tag: 'Paused', menuCls: 'light' });
  }

  private nextMission(): MissionDef | null {
    const { api, progress } = this.host;
    const cur = api.lastResult?.missionId;
    const i = api.list.findIndex((m) => m.id === cur);
    for (let k = 1; k <= api.list.length; k++) {
      const m = api.list[(i + k) % api.list.length];
      if (m.id !== cur && progress.isMissionUnlocked(m) && !progress.record(m.id)?.completed) return m;
    }
    return null;
  }

  private successHtml(): string {
    const { api, progress } = this.host;
    const r = api.lastResult, o = api.lastOutcome;
    if (!r) return this.mainHtml();
    const def = api.byId(r.missionId);
    let rows = r.breakdown.map((b) => `<tr><td>${esc(b.label)}</td><td>+${b.points}</td></tr>`).join('');
    rows += `<tr class="total"><td>Score</td><td>${r.score}</td></tr>`;
    let cash = r.valuables.map((v) => `<tr class="money"><td>${esc(v.name)}</td><td>${money(v.amount)}</td></tr>`).join('');
    if (def?.reward?.cash) cash += `<tr class="money"><td>Client fee</td><td>${money(def.reward.cash)}</td></tr>`;
    cash += `<tr class="total money"><td>Cash</td><td>${money(r.cash)}</td></tr>`;
    const rank = progress.rank();
    const ranked = o && o.rankAfter > o.rankBefore;
    const tools = o?.newTools.length ? `<div class="ws-sec">New tools unlocked</div><div class="ws-chips">${o.newTools.map((t) => `<span class="ws-chip">${esc(this.host.game.belt?.byId(t)?.name ?? TOOL_NAMES[t] ?? t)}</span>`).join('')}</div>` : '';
    const best = o?.newBest ? (o.previousBest ? `New best! (was ${o.previousBest})` : 'First clear!') : `Best: ${progress.record(r.missionId)?.best ?? r.score}`;
    const next = this.nextMission();
    return this.win('Shift complete', `<div class="ws-grid2"><div><div class="ws-sec">${esc(def?.title ?? '')} · ${best}</div><table class="ws-table">${rows}</table></div>` +
      `<div><div class="ws-sec">Payout</div><table class="ws-table">${cash}</table>` +
      `<div class="ws-sec" style="margin-top:.6em">${ranked ? 'Promoted!' : 'Rank'} · ${esc(rank.name)}</div><div class="ws-bar"><i style="width:${Math.round(rank.progress * 100)}%"></i></div>` +
      `<div class="ws-note" style="margin-top:.2em">Career ${o?.scoreAfter ?? progress.totalScore()}${rank.next ? ` / ${rank.next.score} for ${esc(rank.next.name)}` : ''}</div>${tools}</div></div>`,
      `<button class="ws-btn" data-act="menu">Title</button><button class="ws-btn" data-act="retry">Retry</button>` +
      (next ? `<button class="ws-btn pri" data-act="brief" data-id="${esc(next.id)}">Next: ${esc(next.title)}</button>` : `<button class="ws-btn pri" data-act="board">Job board</button>`),
      { cls: 'ws-end win', tag: 'Paid' });
  }

  private failHtml(): string {
    const r = this.host.api.lastResult;
    const def = r ? this.host.api.byId(r.missionId) : null;
    return this.win('Shift failed', `<div class="ws-sec">${esc(def?.title ?? '')}</div><p class="ws-reason">${esc(r?.reason ?? 'The job went sideways.')}</p>` +
      `<p class="ws-note">Tip: plan the route before you touch anything alarmed — the clock only starts when you do.</p>`,
      `<button class="ws-btn" data-act="menu">Title</button><button class="ws-btn" data-act="board">Job board</button><button class="ws-btn pri" data-act="retry">Retry</button>`,
      { cls: 'ws-end lose narrow', tag: 'Busted' });
  }

  // ---------------------------------------------------------------- events

  private onClick(e: Event): void {
    const t = (e.target as HTMLElement).closest<HTMLElement>('[data-act]');
    if (!t || (t as HTMLButtonElement).disabled) return;
    const act = t.dataset.act!, id = t.dataset.id ?? '';
    const h = this.host;
    switch (act) {
      case 'play': h.open('missions'); break;
      case 'open': h.open(id as MenuName); break;
      case 'back': h.back(); break;
      case 'sel': this.selected = id; this.refresh(); break;
      case 'brief': if (id) h.open('briefing', id); break;
      case 'board': h.quitToMenu(); h.open('missions'); break;
      case 'start': h.startMission(id); break;
      case 'sbx': h.startSandbox(id); break;
      case 'buy': if (h.progress.buyUpgrade(id)) this.refresh(); break;
      case 'resume': h.close(); break;
      case 'restart': case 'retry': {
        const id = h.api.def?.id ?? (act === 'retry' ? h.api.lastResult?.missionId : undefined);
        if (id) h.startMission(id);
        else { h.api.restart(); h.close(); }
        break;
      }
      case 'qsave': h.game.ext.quicksave?.save?.(); h.close(); break;
      case 'qload': h.game.ext.quicksave?.load?.(); h.close(); break;
      case 'quit': case 'menu': h.quitToMenu(); break;
      case 'reset-settings': h.progress.settings.reset(); this.refresh(); break;
      case 'seg': h.progress.settings.set(t.dataset.key as any, t.dataset.val as any); this.refresh(); break;
    }
  }

  private onInput(e: Event): void {
    const inp = e.target as HTMLInputElement;
    const key = inp.dataset.key as keyof SettingsData | undefined;
    if (!key) return;
    const s = this.host.progress.settings;
    if (inp.type === 'checkbox') s.set(key, inp.checked as any);
    else {
      s.set(key, Number(inp.value) as any);
      const out = inp.nextElementSibling as HTMLOutputElement | null;
      if (out) {
        const v = s[key] as number;
        out.textContent = key === 'fov' ? v + '°' : key === 'sensitivity' ? v.toFixed(2) + '×' : Math.round(v * 100) + '%';
      }
    }
  }
}
