// DOM user interface: menus, track select, HUD, countdown, results.
import { TRACKS } from './tracks.js';
import { RIDERS } from './race.js';
import { formatTime } from './storage.js';

const $ = (id) => document.getElementById(id);
const SCREENS = ['menu', 'how', 'select', 'pause', 'results'];
const hex = (c) => '#' + c.toString(16).padStart(6, '0');
export const ordinal = (n) => n + (['th', 'st', 'nd', 'rd'][n] || 'th');

export function createUI(handlers) {
  const stack = [];
  function show(name) {
    for (const s of SCREENS) $('scr-' + s).classList.toggle('hidden', s !== name);
    if (name) stack.push(name);
  }
  document.querySelectorAll('[data-back]').forEach(b => b.addEventListener('click', () => {
    handlers.click(); stack.pop(); show(stack.pop() || 'menu');
  }));

  const on = (id, fn) => $(id).addEventListener('click', (e) => { handlers.click(); fn(e); });
  on('btn-play', () => { renderTracks(); show('select'); });
  on('btn-how', () => show('how'));
  on('btn-menu-mute', () => handlers.toggleMute());
  on('btn-pause-mute', () => handlers.toggleMute());
  on('btn-mute', () => handlers.toggleMute());
  on('btn-pause', () => handlers.pause());
  on('btn-resume', () => handlers.resume());
  on('btn-restart', () => handlers.restart());
  on('btn-quit', () => handlers.quit());
  on('btn-res-menu', () => { renderTracks(); stack.length = 0; stack.push('menu'); show('select'); handlers.toMenu(); });
  on('btn-res-retry', () => handlers.restart());
  on('btn-res-next', () => handlers.next());

  document.querySelectorAll('#skill button').forEach(b => b.addEventListener('click', () => {
    handlers.click(); handlers.setSkill(b.dataset.skill); renderSkill();
  }));
  function renderSkill() {
    const s = handlers.save().skill;
    document.querySelectorAll('#skill button').forEach(b => b.classList.toggle('on', b.dataset.skill === s));
  }

  function trackArt(def, i) {
    // A tiny profile drawing of the track for its card.
    const w = 200, h = 70;
    const sample = def.__profile;
    let path = '';
    if (sample) {
      const { xs, ys, minY, maxY } = sample;
      const x0 = xs[0], x1 = xs[xs.length - 1];
      const sy = (y) => h - 10 - ((y - minY) / Math.max(1, maxY - minY)) * (h - 30);
      const step = Math.max(1, Math.floor(xs.length / 160));
      for (let k = 0; k < xs.length; k += step) path += `${k ? 'L' : 'M'}${((xs[k] - x0) / (x1 - x0) * w).toFixed(1)},${sy(ys[k]).toFixed(1)}`;
      path += `L${w},${h}L0,${h}Z`;
    }
    return `<svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none"><defs><linearGradient id="g${i}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${def.sky[0]}"/><stop offset="1" stop-color="${def.sky[1]}"/></linearGradient></defs><rect width="${w}" height="${h}" fill="url(#g${i})"/><path d="${path}" fill="#b27a45" stroke="${def.ground}" stroke-width="3"/></svg>`;
  }

  function renderTracks() {
    renderSkill();
    const data = handlers.save();
    const el = $('tracks');
    el.innerHTML = '';
    TRACKS.forEach((def, i) => {
      const locked = i >= data.unlocked;
      const b = document.createElement('button');
      b.className = 'card' + (locked ? ' locked' : '');
      b.dataset.track = i;
      const best = data.best[def.id];
      b.innerHTML = `<div class="art">${trackArt(def, i)}</div><div class="body">
        <div class="num">TRACK ${i + 1} <span class="diff">${'&#9679;'.repeat(i + 1)}${'&#9675;'.repeat(4 - i)}</span></div>
        <div class="name">${def.name}</div><div class="tag">${def.tagline}</div>
        <div class="best">${best ? 'BEST ' + formatTime(best) : 'NO TIME YET'}</div></div>`;
      b.addEventListener('click', () => {
        handlers.click();
        if (locked) { toast('Finish top 2 on the previous track to unlock'); return; }
        handlers.startTrack(i);
      });
      el.appendChild(b);
    });
  }

  // HUD
  const dots = RIDERS.map((r, i) => {
    const d = document.createElement('div');
    d.className = 'dot' + (i === 0 ? ' me' : '');
    d.style.background = hex(r.color);
    $('progress-dots').appendChild(d);
    return d;
  });
  let lastTime = '', lastPos = 0;
  function hud(race, pos) {
    const t = formatTime(race.time);
    if (t !== lastTime) { $('hud-time').textContent = t; lastTime = t; }
    if (pos !== lastPos) { $('hud-pos').innerHTML = `${pos}<sup>${ordinal(pos).slice(-2)}</sup><span>/4</span>`; lastPos = pos; }
    race.bikes.forEach((b, i) => { dots[i].style.left = (b.progress * 100).toFixed(2) + '%'; });
  }
  function showHUD(visible, trackName) {
    $('hud').classList.toggle('hidden', !visible);
    if (trackName) {
      // The track label shows at the start, then fades out of the way.
      const el = $('hud-track');
      el.textContent = trackName;
      el.classList.remove('fade'); void el.offsetWidth; el.classList.add('fade');
    }
    lastPos = 0; lastTime = '';
  }

  let cdTimer = 0;
  function countdown(text) {
    const el = $('countdown');
    el.textContent = text;
    el.classList.remove('hidden', 'pop');
    void el.offsetWidth;
    el.classList.add('pop');
    clearTimeout(cdTimer);
    cdTimer = setTimeout(() => el.classList.add('hidden'), 900);
  }
  let toastTimer = 0;
  function toast(text, ms = 1600) {
    const el = $('toast');
    el.textContent = text; el.classList.remove('hidden');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.add('hidden'), ms);
  }

  function results({ race, position, time, best, newBest, unlockedNext, hasNext, nextLocked }) {
    $('res-title').textContent = position === 1 ? 'You win!' : position === 2 ? 'Great ride!' : 'Finished';
    $('res-pos').textContent = ordinal(position);
    $('res-time').textContent = formatTime(time);
    $('res-best').textContent = formatTime(best);
    const order = [...race.bikes].sort((a, b) => (a.finished ? a.finishTime : 1e9 - a.progress) - (b.finished ? b.finishTime : 1e9 - b.progress));
    $('res-table').innerHTML = order.map((b, i) => `<li><b>${i + 1}</b><i style="background:${hex(RIDERS[b.id].color)}"></i>${RIDERS[b.id].name}<span>${b.finished ? formatTime(b.finishTime) : '--'}</span></li>`).join('');
    const notes = [];
    if (newBest) notes.push('New best time!');
    if (unlockedNext) notes.push('Next track unlocked!');
    if (!hasNext && position <= 2) notes.push('You beat the hardest track!');
    if (hasNext && nextLocked) notes.push('Finish top 2 to unlock the next track');
    $('res-note').textContent = notes.join(' ');
    $('btn-res-next').disabled = !hasNext || nextLocked;
    $('btn-res-next').classList.toggle('hidden', !hasNext);
    show('results');
  }

  function setMuted(m) {
    $('btn-mute').innerHTML = m ? '&#128263;' : '&#128266;';
    $('btn-menu-mute').textContent = $('btn-pause-mute').textContent = m ? 'SOUND: OFF' : 'SOUND: ON';
  }

  return { show, hud, showHUD, countdown, toast, results, setMuted, renderTracks, stack };
}
