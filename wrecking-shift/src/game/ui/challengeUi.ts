/**
 * Challenge screens + HUD (plain DOM, same look as menus.ts):
 *   challengesHtml   — pick mode + map (best score / stars per mode + map), time + weather, start
 *   chResultHtml     — results screen after a run
 *   atmosControls    — time-of-day / weather segmented pickers (also used by Sandbox + pause menus)
 *   handleExtraClick — click actions of the above (`chmode`, `chmap`, `chstart`, `chretry`, `chmenu`, `atmos`, `photo`)
 *   ChallengeHud     — score / crates / clock panel inside the HUD
 */
import './extras.css';
import { CHALLENGE_MODES, starThresholds, type Challenge, type ChallengeModeId } from '../../sim/challenge';
import type { Game } from '../game';
import { LEVELS } from '../levels';
import { clock, el, esc, setHtml, show } from './dom';
import type { MenuHost } from './menus';

const TOD_LABEL: Record<string, string> = { level: 'Map', day: 'Day', sunset: 'Dusk', overcast: 'Grey', night: 'Night' };
const WX_LABEL: Record<string, string> = { level: 'Map', clear: 'Clear', rain: 'Rain', snow: 'Snow' };

const sel = { mode: 'rubble' as ChallengeModeId, level: 'harbor' };

export function stars(n: number): string {
  return `<span class="ws-stars">${'★'.repeat(n)}<span class="off">${'★'.repeat(3 - n)}</span></span>`;
}

function win(title: string, body: string, foot: string, opts: { cls?: string; tag?: string; menuCls?: string } = {}): string {
  return `<div class="ws-menu ${opts.menuCls ?? ''}"><div class="ws-win ${opts.cls ?? ''}"><header>${opts.tag ? `<span class="tag">${esc(opts.tag)}</span>` : ''}<h2>${title}</h2><span class="sp"></span></header>` +
    `<div class="ws-body">${body}</div>${foot ? `<div class="ws-foot">${foot}</div>` : ''}</div></div>`;
}

/** time of day + weather pickers; values come from game.ext.atmos.choice */
export function atmosControls(game: Game): string {
  const a = game.ext.atmos;
  if (!a) return '';
  const seg = (key: string, vals: string[], cur: string, labels: Record<string, string>) =>
    `<span class="ws-seg">${vals.map((v) => `<button data-act="atmos" data-key="${key}" data-val="${v}" class="${cur === v ? 'on' : ''}">${labels[v] ?? v}</button>`).join('')}</span>`;
  return `<div class="ws-atmos"><label>Time</label>${seg('tod', ['level', ...a.times], a.choice.tod, TOD_LABEL)}` +
    `<label>Weather</label>${seg('weather', ['level', ...a.weathers], a.choice.weather, WX_LABEL)}</div>`;
}

export function challengesHtml(host: MenuHost): string {
  const api = host.game.ext.challenge;
  if (!api) return win('Challenges', '<p class="ws-note">Not available in this build.</p>', '<button class="ws-btn" data-act="back">Back</button>');
  if (!api.levels.includes(sel.level)) sel.level = api.levels[0];
  const modes = (Object.keys(CHALLENGE_MODES) as ChallengeModeId[]).map((id) => {
    const m = CHALLENGE_MODES[id];
    return `<button class="ws-card${id === sel.mode ? ' sel' : ''}" data-act="chmode" data-id="${id}"><div class="t"><span>${esc(m.title)}</span><span class="ok">${m.seconds} s</span></div><div class="s">${esc(m.tagline)}</div></button>`;
  }).join('');
  const maps = api.levels.map((lv: string) => {
    const rec = api.best(sel.mode, lv);
    return `<button class="ws-card${lv === sel.level ? ' sel' : ''}" data-act="chmap" data-id="${esc(lv)}"><div class="t"><span>${esc(LEVELS[lv]?.title ?? lv)}</span>${stars(rec?.stars ?? 0)}</div>` +
      `<div class="s">Best ${rec?.best ? rec.best.toLocaleString('en-US') : '—'}${rec?.plays ? ` · ${rec.plays} run${rec.plays === 1 ? '' : 's'}` : ''}</div></button>`;
  }).join('');
  const m = CHALLENGE_MODES[sel.mode];
  const t = starThresholds(sel.mode, sel.level);
  const rules = `<ul class="ws-rules">${m.rules.map((r) => `<li>${esc(r)}</li>`).join('')}</ul>` +
    `<div class="ws-kv"><span>${stars(1)} <b>${t[0].toLocaleString('en-US')}</b></span><span>${stars(2)} <b>${t[1].toLocaleString('en-US')}</b></span><span>${stars(3)} <b>${t[2].toLocaleString('en-US')}</b></span></div>`;
  return win('Challenges', `<div class="ws-chgrid"><div><div class="ws-sec">Mode</div><div class="ws-list">${modes}</div>` +
    `<div class="ws-sec" style="margin-top:.5em">Site</div><div class="ws-list">${maps}</div></div>` +
    `<div><div class="ws-sec">${esc(m.title)} — rules</div>${rules}<div class="ws-sec">Conditions</div>${atmosControls(host.game)}</div></div>`,
    `<button class="ws-btn" data-act="back">Back</button><button class="ws-btn pri" data-act="chstart">Start — ${esc(m.title)}</button>`,
    { tag: 'Score attack' });
}

export function chResultHtml(host: MenuHost): string {
  const api = host.game.ext.challenge;
  const r = api?.lastResult;
  if (!r) return win('Challenge', '<p class="ws-note">No result.</p>', '<button class="ws-btn pri" data-act="menu">Title</button>');
  const m = CHALLENGE_MODES[r.mode as ChallengeModeId];
  const b = api.lastBest;
  const best = api.best(r.mode, r.levelId);
  const rows = r.breakdown.map((x: any) => `<tr><td>${esc(x.label)}</td><td>${x.points.toLocaleString('en-US')}</td></tr>`).join('') +
    `<tr class="total"><td>Score</td><td>${r.score.toLocaleString('en-US')}</td></tr>`;
  const bestLine = b?.newBest ? (b.previousBest ? `New best! (was ${b.previousBest.toLocaleString('en-US')})` : 'First score on the board!') : `Best: ${(best?.best ?? r.score).toLocaleString('en-US')}`;
  const t = starThresholds(r.mode, r.levelId);
  const next = r.stars < 3 ? `${((t as number[])[r.stars] - r.score).toLocaleString('en-US')} more for ${stars(r.stars + 1)}` : 'Maximum stars.';
  const good = r.success || r.outcome === 'dead' && r.score > 0;
  return win(r.success ? 'Time sheet' : r.outcome === 'late' ? 'Clocked out late' : r.outcome === 'dead' ? 'Run over' : 'Run ended',
    `<div class="ws-grid2"><div><div class="ws-sec">${esc(m.title)} · ${esc(LEVELS[r.levelId]?.title ?? r.levelId)}</div>` +
    `<div class="ws-bigscore">${r.score.toLocaleString('en-US')}</div>${stars(r.stars)}<p class="ws-reason" style="margin-top:.4em">${esc(r.reason)}</p>` +
    `<div class="ws-note">${bestLine} · ${next}</div></div><div><div class="ws-sec">Breakdown</div><table class="ws-table">${rows}</table></div></div>`,
    `<button class="ws-btn" data-act="menu">Title</button><button class="ws-btn" data-act="chmenu">Challenges</button><button class="ws-btn pri" data-act="chretry">Again</button>`,
    { cls: `ws-end ${good ? 'win' : 'lose'}`, tag: m.title });
}

/** click actions of the extra screens; returns true when handled */
export function handleExtraClick(host: MenuHost, act: string, t: HTMLElement, refresh: () => void): boolean {
  const g = host.game;
  const id = t.dataset.id ?? '';
  switch (act) {
    case 'chmode': sel.mode = id as ChallengeModeId; refresh(); return true;
    case 'chmap': sel.level = id; refresh(); return true;
    case 'chstart': g.ext.challenge?.start(sel.mode, sel.level); host.close(); return true;
    case 'chretry': {
      const r = g.ext.challenge?.lastResult;
      if (r) { sel.mode = r.mode; sel.level = r.levelId; }
      g.ext.challenge?.start(sel.mode, sel.level); host.close(); return true;
    }
    case 'chmenu': host.quitToMenu(); host.open('challenges'); return true;
    case 'atmos': g.ext.atmos?.choose(t.dataset.key, t.dataset.val); refresh(); return true;
    case 'photo': g.ext.photo?.enter(true); return true;
  }
  return false;
}

/** HUD panel while a challenge runs (lives inside the HUD root, so it hides with it) */
export class ChallengeHud {
  readonly root = el('div');
  private panel = el('div', 'ws-chal ws-panel-s');
  private clockEl = el('div', 'ws-chclock');

  constructor() { this.root.append(this.panel, this.clockEl); }

  update(c: Challenge | null): void {
    show(this.root, !!c);
    if (!c) return;
    const m = c.def;
    const t = starThresholds(c.mode, c.levelId);
    const score = c.score;
    const n = score >= t[2] ? 3 : score >= t[1] ? 2 : score >= t[0] ? 1 : 0;
    let html = `<h4>${esc(m.title)}</h4>`;
    if (c.mode === 'rubble') {
      html += `<div class="big">${score.toLocaleString('en-US')}<small>VOXELS</small></div>`;
      html += `<div class="row"><span class="stars">${'★'.repeat(n)}<span class="off">${'★'.repeat(3 - n)}</span></span><span>${n < 3 ? `next <b>${(t as number[])[n].toLocaleString('en-US')}</b>` : '<b>max</b>'}</span></div>`;
      if (c.warmupLeft > 0) html += `<div class="warm">Clock starts in <b>${c.warmupLeft}</b> voxels</div>`;
    } else {
      html += `<div class="big">${c.cratesTaken}<small>/ ${c.cratesTotal} CRATES</small></div>`;
      html += `<div class="row"><span>Bagged</span><b>${score.toLocaleString('en-US')}</b></div>`;
      if (c.running && c.cratesTaken > 0) html += '<div class="go">▶ Clock out at the escape point (E)</div>';
      else if (!c.running && !c.ended) html += '<div class="warm">Find a red-lidded crate — lifting it starts the clock</div>';
    }
    setHtml(this.panel, html);
    let ch = '';
    if (c.running || c.ended) ch = `<div class="clock"><small>${c.mode === 'rubble' ? 'TIME' : 'CLOCK OUT IN'}</small><span>${clock(c.timeLeft)}</span></div>`;
    else ch = `<div class="chip">Clock <b>${m.seconds} s</b> · waiting</div>`;
    this.clockEl.classList.toggle('urgent', c.running && c.timeLeft <= 10);
    setHtml(this.clockEl, ch);
  }
}
