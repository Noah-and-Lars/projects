// DOM: menus, HUD, pause, finish, settings, garage and controls.

import { COURSES } from './courses.js';
import { BIKES } from './physics.js';
import { KIT_COLORS } from './models.js';
import { store, save, setting } from './storage.js';
import { sfx, setMuted, setMusic, isMuted } from './audio.js';
import { fmtTime, COIN_RATE } from './game.js';
import { VIEWS, VIEW_NAMES } from './camera.js';
import { Tilt } from './input.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
export const isTouch = () => matchMedia('(pointer: coarse)').matches;

// ------------------------------------------------------------ screens --

let current = 'loading';
let backTo = 'home';
export function show(name) {
  for (const el of $$('.screen')) el.classList.add('hidden');
  if (name) $('#scr-' + name)?.classList.remove('hidden');
  if (name && name !== 'controls' && name !== 'settings') backTo = name === 'pause' ? 'pause' : backTo;
  current = name;
  updateCoins();
  keyNav.reset();
}
export function currentScreen() { return current; }

export function updateCoins() {
  const c = store().coins.toLocaleString();
  $('#coins').textContent = c;
  for (const el of $$('.coins-mirror')) el.textContent = c;
}

// Arrow keys / gamepad over the visible menu buttons.
const keyNav = {
  i: -1,
  reset() { this.i = -1; for (const b of $$('.sel')) b.classList.remove('sel'); },
  items() {
    const scr = $('#scr-' + current);
    if (!scr || scr.classList.contains('hidden')) return [];
    return $$('button:not([disabled]), .card', scr).filter((b) => b.offsetParent !== null && !b.classList.contains('back') && !b.classList.contains('x'));
  },
  move(d) {
    const it = this.items();
    if (!it.length) return;
    for (const b of it) b.classList.remove('sel');
    this.i = this.i < 0 ? (d > 0 ? 0 : it.length - 1) : (this.i + d + it.length) % it.length;
    it[this.i].classList.add('sel');
    it[this.i].scrollIntoView({ block: 'nearest' });
    sfx('tick', 0.4);
  },
  press() { const it = this.items(); if (it[this.i]) it[this.i].click(); },
};
export function menuKey(code) {
  if (['loading', null].includes(current)) return false;
  if (code === 'ArrowDown' || code === 'ArrowRight') { keyNav.move(1); return true; }
  if (code === 'ArrowUp' || code === 'ArrowLeft') { keyNav.move(-1); return true; }
  if ((code === 'Enter' || code === 'Space') && keyNav.i >= 0) { keyNav.press(); return true; }
  if (code === 'Escape' || code === 'Backspace') {
    const back = $('#scr-' + current + ' .back, #scr-' + current + ' .x');
    if (back) { back.click(); return true; }
  }
  return false;
}

// ------------------------------------------------------------- courses

function levelIcon(l) {
  if (l === 'easy') return '<svg viewBox="0 0 12 12" width="12" height="12"><circle cx="6" cy="6" r="5.5" fill="#2fa84f"/></svg>';
  if (l === 'medium') return '<svg viewBox="0 0 12 12" width="12" height="12"><rect x="1" y="1" width="10" height="10" fill="#2f6fd6"/></svg>';
  return '<svg viewBox="0 0 12 12" width="12" height="12"><path d="M6 0 12 6 6 12 0 6z" fill="#111"/></svg>';
}

const ART = {
  yard: ['#9cc7e8', '#7aa35a', '#8b6440'],
  forest: ['#9fc0d6', '#2f4f2c', '#5c3f28'],
  alpine: ['#7fb2ea', '#b8a24a', '#7a6248'],
  quarry: ['#b9c6d1', '#6f7476', '#5d5b57'],
  desert: ['#8cc0f0', '#c8693a', '#9a4a26'],
};
function courseArt(c) {
  const [sky, hill, dirt] = ART[c.theme] || ART.forest;
  // Little side-on profile of the course's jumps.
  let x = 0, path = 'M0 72 ';
  const jumps = c.layout.filter((p) => !['s', 'b', 't', 'cp', 'rollers'].includes(p[0])).slice(0, 6);
  const w = 300 / (jumps.length + 1);
  for (const j of jumps) {
    x += w;
    const h = 7 + (j[1].h || 1.4) * 7;
    const top = 72 - h;
    if (j[0] === 'drop') path += `L${x - 20} 72 L${x - 12} ${top} L${x + 2} ${top} L${x + 2} 72 `;
    else if (j[0] === 'table' || j[0] === 'stepup') path += `L${x - 18} 72 Q${x - 9} 72 ${x - 7} ${top} L${x + 8} ${top} L${x + 18} 72 `;
    else path += `L${x - 18} 72 Q${x - 10} 72 ${x - 8} ${top} L${x - 5} 72 L${x + 3} 72 L${x + 6} ${top + 2} L${x + 18} 72 `;
  }
  path += 'L300 70 L300 96 L0 96 Z';
  return `<svg viewBox="0 0 300 96" preserveAspectRatio="none"><rect width="300" height="96" fill="${sky}"/>
    <path d="M0 58 Q60 20 120 46 T240 30 T300 40 L300 96 L0 96Z" fill="${hill}" opacity="0.85"/>
    <path d="${path}" fill="${dirt}"/></svg>`;
}

export function buildCourseList(onPick) {
  const st = store();
  const el = $('#course-list');
  el.innerHTML = '';
  for (const c of COURSES) {
    const b = document.createElement('button');
    b.className = 'card';
    const best = st.best[c.id];
    const done = st.tasks[c.id] ? Object.keys(st.tasks[c.id]).length : 0;
    b.innerHTML = `<div class="art">${courseArt(c)}<span class="lvl">${levelIcon(c.level)}<span>${c.level}</span></span>${c.timed ? '' : '<span class="free">FREE RIDE</span>'}</div>
      <div class="txt"><div class="name">${c.name}</div><div class="desc">${c.desc}</div>
      <div class="best">${c.timed ? (best ? `Best ${fmtTime(best.time)} · ★ ${best.style.toLocaleString()}` : 'No time yet') : `Skills ${done}/${c.tasks.length}`}</div></div>`;
    b.onclick = () => { sfx('click'); onPick(c); };
    el.appendChild(b);
  }
}

// -------------------------------------------------------------- garage

export function buildGarage(onChange) {
  const st = store();
  const list = $('#bike-list');
  list.innerHTML = '';
  for (const b of Object.values(BIKES)) {
    const owned = st.bikes.includes(b.id);
    const el = document.createElement('button');
    el.className = 'bike' + (st.bike === b.id ? ' on' : '');
    const s = b.stats;
    el.innerHTML = `<div><div class="bn">${b.name}</div><div class="bt">${b.type}</div></div>
      <div class="price">${owned ? (st.bike === b.id ? 'RIDING' : 'OWNED') : `<span class="coin"></span> ${b.price}`}</div>
      <div class="bd">${b.desc}</div>
      <div class="stats">${['speed', 'air', 'grip', 'tough'].map((k) => `<span>${k}</span><i style="--v:${s[k] * 20}%"></i>`).join('')}</div>`;
    el.onclick = () => {
      if (!owned) {
        if (st.coins < b.price) { sfx('beep', 0.4, 0.6); flashSheet(el); return; }
        st.coins -= b.price;
        st.bikes.push(b.id);
        sfx('good');
      } else sfx('click');
      st.bike = b.id;
      save();
      buildGarage(onChange);
      updateCoins();
      onChange();
    };
    list.appendChild(el);
  }
  const bike = BIKES[st.bike];
  swatches('#frame-colors', ['#e8562a', '#2fb8e6', '#8bc34a', '#f2c230', '#b06ad9', '#f2f2f2', '#2d2f35', '#ff5d8f', '#1f7a6d'],
    st.colors[st.bike] || bike.color, (c) => { st.colors[st.bike] = c; save(); onChange(); });
  swatches('#jersey-colors', KIT_COLORS, st.kit.jersey, (c) => { st.kit.jersey = c; save(); onChange(); });
  swatches('#helmet-colors', KIT_COLORS, st.kit.helmet, (c) => { st.kit.helmet = c; save(); onChange(); });
}
function swatches(sel, colors, cur, pick) {
  const el = $(sel);
  el.innerHTML = '';
  for (const c of colors) {
    const b = document.createElement('button');
    b.className = 'sw' + (c === cur ? ' on' : '');
    b.style.background = c;
    b.setAttribute('aria-label', c);
    b.onclick = () => { sfx('click'); pick(c); for (const x of el.children) x.classList.toggle('on', x === b); };
    el.appendChild(b);
  }
}
function flashSheet(el) { el.animate([{ transform: 'translateX(-6px)' }, { transform: 'translateX(6px)' }, { transform: 'none' }], { duration: 220 }); }

// ------------------------------------------------------------ controls

export function buildControls() {
  const rows = (list) => `<div class="ctl">${list.map(([k, d]) => `<kbd>${k}</kbd><div>${d}</div>`).join('')}</div>`;
  $('#controls-body').innerHTML = `
    <h4>On the ground</h4>${rows([
      ['W', 'Pedal'], ['S', 'Brake; once stopped, reverse'], ['A / D', 'Steer'],
      ['Space', 'Hold to preload, let go to pop. It pops where you let go. Let go in the last moment before a lip (or just after leaving it) for a perfect pop and extra height; on the flat it hops about 45 cm. Holding longer than a second on the flat just stands you up.'],
      ['↓', 'Weight back. A tap is a weighting; keep pulling and the front comes up into a manual, and keeps coming: feather it, or drag the rear brake (S), or you loop out. Press Space in a manual to bunny hop (the rider stands, then pops, up to ~80 cm).'],
      ['↑', 'Weight forward; at speed, lifts the rear wheel (stoppie)'],
      ['S (hard)', 'Past half the lever the rear wheel locks and slides. Steering harder than the tyres can hold drifts the bike; berms give you far more grip when you turn into them.'],
    ])}
    <h4>In the air</h4>${rows([
      ['A / D', 'Whip the rear out; let go to straighten before you land'],
      ['← / →', 'Spin; hold for a 360'], ['↑ / ↓', 'Front flip / backflip; let go and the bike lines up with the flight'],
      ['W (hold)', 'No hander'], ['W (tap)', 'Barspin; tap again mid-spin for a double. Land before the catch and you crash. Not on the dual-crown bike.'],
      ['S', 'Superman'],
    ])}
    <h4>Other</h4>${rows([
      ['R', 'Back before the last feature, at its speed (+3 s)'], ['C', 'Change camera'], ['P', 'Photo mode'],
      ['Esc', 'Pause'], ['M', 'Mute'],
    ])}
    <h4>Controller</h4>${rows([
      ['RT / LT', 'Pedal / brake'], ['Left stick', 'Steer; in the air whip, up = no hander, flick up = barspin, down = superman'],
      ['Right stick', 'Weight on the ground, flips and spins in the air'], ['A', 'Preload and pop'],
      ['Y', 'Respawn'], ['RB', 'Camera'], ['B', 'Photo mode'], ['Start', 'Pause'],
    ])}
    <h4>Touch</h4>${rows([
      ['Left stick', 'Up pedal, down brake, sideways steer. In the air: whip, up no hander, a quick flick up barspin, down superman'],
      ['Right stick', 'Weight on the ground; flips and spins in the air'], ['JUMP', 'Hold to preload, let go to pop'],
    ])}
    <h4>Landings</h4>
    <p class="note">Land on the downslope of the landing. The middle is the <b>sweet spot</b> and keeps all your speed. Short onto the deck is a <b>cased</b> landing and costs speed; short into a gap is a crash. Past the bottom is a <b>flat landing</b>. Let go of the controls and the bike follows its arc and, in the last moments, rights itself toward the landing and rounds a spin to a whole turn; tricks you're still holding are pulled in as the ground comes up. A crossed-up landing turns into a slide. You only crash on a big mismatch: far nose-down or nose-high, landing badly sideways at speed, an unfinished barspin, or a huge impact. Crashing adds 3 seconds and puts you back before the feature.</p>`;
}

// ------------------------------------------------------------ settings

const ASSIST_NAMES = ['Off', 'Weak', 'Strong'];
const QUAL = ['auto', 'high', 'medium', 'low'];
const WEATHERS = ['random', 'day', 'dusk', 'night', 'fog'];

export function buildSettings(container, { inRun = false, onChange } = {}) {
  const el = typeof container === 'string' ? $(container) : container;
  el.innerHTML = '';
  const opt = (label, val, onClick, cls = '') => {
    const b = document.createElement('button');
    b.className = 'opt ' + cls;
    b.innerHTML = `<span>${label}</span><span class="val">${val}</span>`;
    b.onclick = () => { sfx('click'); onClick(); buildSettings(el, { inRun, onChange }); onChange && onChange(); };
    el.appendChild(b);
    return b;
  };
  const note = (t) => { const p = document.createElement('p'); p.className = 'note'; p.innerHTML = t; el.appendChild(p); };
  const a = setting('assist');
  opt('Riding assist', ASSIST_NAMES[a] + (inRun ? ' · locked' : ''), () => setting('assist', (a + 1) % 3), inRun ? 'locked' : '');
  if (!inRun) note(`<b>Weak:</b> the bike helps round corners and straightens a little in the air. <b>Strong:</b> it follows the trail, left/right picks your line, it holds the speed each jump needs and lines up for the landing. Coins per finished run: Off ${COIN_RATE[0]} · Weak ${COIN_RATE[1]} · Strong ${COIN_RATE[2]} on a medium trail (×0.5 easy, ×1.5 hard), plus style. It can't be changed during a run.`);
  const cam = setting('camera');
  opt('Camera', VIEW_NAMES[cam] || cam, () => setting('camera', VIEWS[(VIEWS.indexOf(cam) + 1) % VIEWS.length]));
  const w = setting('weather');
  opt('Weather', w, () => setting('weather', WEATHERS[(WEATHERS.indexOf(w) + 1) % WEATHERS.length]));
  if (!inRun) {
    const q = setting('quality');
    opt('Graphics', q, () => setting('quality', QUAL[(QUAL.indexOf(q) + 1) % QUAL.length]));
  }
  const sens = setting('steerSens');
  const row = document.createElement('label');
  row.className = 'opt';
  row.innerHTML = `<span>Steering sensitivity</span><input type="range" min="0.2" max="1" step="0.05" value="${sens}"><span class="val">${Math.round(sens * 100)}%</span>`;
  row.querySelector('input').oninput = (e) => { setting('steerSens', +e.target.value); row.querySelector('.val').textContent = Math.round(e.target.value * 100) + '%'; };
  el.appendChild(row);
  if (isTouch() && Tilt.available()) {
    opt('Tilt steering', setting('tilt') ? 'On' : 'Off', () => setting('tilt', !setting('tilt')));
  }
  opt('Sound', setting('sound') ? 'On' : 'Off', () => { setting('sound', !setting('sound')); setMuted(!setting('sound')); });
  opt('Music', setting('music') ? 'On' : 'Off', () => { setting('music', !setting('music')); setMusic(setting('music')); });
  if (!inRun) note('Weather applies to every trail; Random picks a new one each time you drop in. Night lights the trail with a lamp on the bike. Graphics changes apply next time you load a trail.');
}

// ---------------------------------------------------------------- HUD --

export class Hud {
  constructor() {
    this.el = $('#hud');
    this.timeEl = $('#hud-time');
    this.penEl = $('#hud-pen');
    this.speedEl = $('#hud-speed');
    this.tricks = $('#tricks');
    this.flashEl = $('#flash');
    this.splitEl = $('#hud-split');
    this.targetEl = $('#hud-target');
    this.paused = false;
    for (const b of $$('#hud [data-act]')) b.addEventListener('click', () => this.onAct && this.onAct(b.dataset.act));
  }
  show(on) {
    this.el.classList.toggle('hidden', !on);
    $('#touch').classList.toggle('hidden', !on || !isTouch());
  }
  reset(game) {
    this.game = game;
    this.tricks.innerHTML = '';
    this.flashEl.innerHTML = '';
    this.splitEl.classList.add('hidden');
    $('#hud-course').textContent = game.course.name;
    const timed = game.course.timed;
    $('.pill.time').classList.toggle('hidden', !timed);
    const tasks = $('#hud-tasks');
    if (game.course.tasks && setting('tips') !== false) {
      tasks.classList.remove('hidden');
      this.renderTasks(game);
    } else tasks.classList.add('hidden');
    const r = $('#ready');
    if (timed) {
      r.classList.remove('hidden');
      r.innerHTML = isTouch() ? 'Push the left stick up to drop in<small>Pedal hard, pop at the lips</small>' : 'Press W to drop in<small>Controller: RT · pop with Space / A</small>';
    } else r.classList.add('hidden');
    $('#countdown').innerHTML = '';
  }
  renderTasks(game) {
    const el = $('#hud-tasks');
    const t = game.course.tasks;
    const done = t.filter((x) => game.tasks[x.id]).length;
    // Unfinished first, so a compact list (short screens) shows what's next.
    const order = [...t.filter((x) => !game.tasks[x.id]), ...t.filter((x) => game.tasks[x.id])];
    el.innerHTML = `<b>Skills ${done}/${t.length}</b>` + order.map((x) => `<span class="t${game.tasks[x.id] ? ' done' : ''}">${x.label}</span>`).join('');
  }
  update(game, dt) {
    const t = game.time + game.penalty;
    this.timeEl.textContent = fmtTime(game.started ? t : 0);
    this.penEl.textContent = game.penalty ? `+${game.penalty}s` : '';
    const sim = game.sim;
    const v = Math.abs(sim.grounded ? sim.speed : sim.hSpeed());
    this.speedEl.textContent = Math.round(v * 3.6);
    const tr = game.track;
    const p = tr.project(sim.pos.x, sim.pos.z, game.hintState.hint, {});
    $('#hud-progress i').style.width = `${Math.min(100, (p.s / tr.finishS) * 100)}%`;
    // Target speed for the next jump.
    const j = tr.nextJump(p.s, 70);
    if (j && j.lipS - p.s > 2 && !game.crash) {
      this.targetEl.classList.remove('hidden');
      const lo = j.speed * 0.94, hi = j.speed * 1.06;
      const scale = (x) => Math.min(100, Math.max(0, (x * 3.6) / 70 * 100));
      const band = $('#hud-target-band');
      band.style.left = scale(lo) + '%';
      band.style.width = (scale(hi) - scale(lo)) + '%';
      $('#hud-target-needle').style.left = scale(v) + '%';
      $('#hud-target-text').textContent = `${j.name || j.kind} · ${Math.round(lo * 3.6)}–${Math.round(hi * 3.6)} km/h`;
    } else this.targetEl.classList.add('hidden');
    if (game.phase !== 'ready') $('#ready').classList.add('hidden');
  }
  count(n) {
    const el = $('#countdown');
    el.innerHTML = `<div class="c${n ? '' : ' go'}">${n || 'GO!'}</div>`;
    if (!n) setTimeout(() => { if (el.firstChild && el.firstChild.classList.contains('go')) el.innerHTML = ''; }, 900);
  }
  trickLine(label) {
    const d = document.createElement('div');
    d.className = 'tl';
    d.textContent = label;
    this.tricks.appendChild(d);
    setTimeout(() => d.remove(), 1700);
    while (this.tricks.children.length > 6) this.tricks.firstChild.remove();
  }
  trickTotal(pts, combo) {
    const d = document.createElement('div');
    d.className = 'tt';
    d.innerHTML = `+${pts.toLocaleString()}${combo ? `<small>${combo}</small>` : ''}`;
    this.tricks.appendChild(d);
    setTimeout(() => d.remove(), 2100);
  }
  flash(text, kind = 'info', dur = 1.8) {
    const d = document.createElement('div');
    d.className = 'f ' + kind;
    d.textContent = text;
    d.style.animationDuration = dur + 's';
    this.flashEl.appendChild(d);
    setTimeout(() => d.remove(), dur * 1000 + 100);
    while (this.flashEl.children.length > 3) this.flashEl.firstChild.remove();
  }
  split(n, t, ref) {
    const el = this.splitEl;
    el.classList.remove('hidden');
    let diff = '';
    if (ref !== null && ref !== undefined) {
      const d = t - ref;
      diff = ` <span class="d ${d <= 0 ? 'good' : 'bad'}">${d <= 0 ? '−' : '+'}${Math.abs(d).toFixed(2)}</span>`;
    }
    el.innerHTML = `Split ${n} ${fmtTime(t)}${diff}`;
    el.style.animation = 'none'; void el.offsetWidth; el.style.animation = '';
    clearTimeout(this.splitT);
    this.splitT = setTimeout(() => el.classList.add('hidden'), 3500);
  }
  taskDone(label) {
    this.flash('✓ ' + label + '  +20', 'good', 2.2);
    if (this.game) this.renderTasks(this.game);
  }
  toastView(v) {
    const t = $('#toast');
    t.textContent = 'Camera: ' + (VIEW_NAMES[v] || v);
    t.classList.add('on');
    clearTimeout(this.toastT);
    this.toastT = setTimeout(() => t.classList.remove('on'), 1200);
  }
  toggleMute() {
    const m = !isMuted();
    setMuted(m); setting('sound', !m);
    const t = $('#toast');
    t.textContent = m ? 'Sound off' : 'Sound on';
    t.classList.add('on');
    clearTimeout(this.toastT);
    this.toastT = setTimeout(() => t.classList.remove('on'), 1000);
  }
  togglePause(game) { if (this.onPause) this.onPause(game); }
  togglePhoto(game) { if (this.onPhoto) this.onPhoto(game); }
  finish(game, d) { if (this.onFinish) this.onFinish(game, d); }
}

export function renderFinish(game, d) {
  const prev = d.prev;
  let sub = '';
  if (prev && !d.isBest) sub = `<div class="fin-sub bad">+${(d.time - prev.time).toFixed(2)} vs your best</div>`;
  else if (prev && d.isBest) sub = `<div class="fin-sub good">−${(prev.time - d.time).toFixed(2)} vs your best</div>`;
  const best = store().best[game.course.id];
  const splits = d.splits.map((t, i) => {
    const ref = prev && prev.splits ? prev.splits[i] : null;
    const df = ref !== null && ref !== undefined ? ` <span style="color:${t <= ref ? '#4c8c00' : '#c0262f'}">${t <= ref ? '−' : '+'}${Math.abs(t - ref).toFixed(2)}</span>` : '';
    return `<div><span>Split ${i + 1}</span><span>${fmtTime(t)}${df}</span></div>`;
  }).join('');
  $('#fin-title').textContent = d.isBest ? (prev ? 'New record!' : 'First time in the books!') : 'Finished!';
  $('#fin-body').innerHTML = `
    <div class="fin-time">${fmtTime(d.time)}${d.isBest ? '<span class="fin-badge">Best</span>' : ''}</div>${sub}
    <div class="fin-grid">
      <div><small>Style</small><b>★ ${d.style.toLocaleString()}</b></div>
      <div><small>Coins</small><b><span class="coin"></span> +${d.coins}</b></div>
      <div><small>Jumps cleared</small><b>${d.jumps}/${d.jumpTotal}</b></div>
      <div><small>Crashes</small><b>${d.crashes}${d.penalty ? ` <span style="font-size:0.7em;color:#c0262f">+${d.penalty}s</span>` : ''}</b></div>
    </div>
    <div class="fin-splits">${splits}<div><span>Personal best</span><span>${fmtTime(best ? best.time : null)}</span></div></div>`;
}

export { $, $$ };
