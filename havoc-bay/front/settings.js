/* Island Front: the settings window, opened from the pause menu (Esc) or the title screen. Most settings take effect at once,
   in the middle of a battle: mouse sensitivity, field of view, volume, gunnery, jet speed, difficulty and the number of bots.
   Graphics apply from the next battle, because the world is built for them. Everything is remembered for next time. */
'use strict';
const SET_ROWS = [
  { key: 'sens', label: 'Mouse sensitivity', range: [.3, 3, .05], fmt: v => `${v.toFixed(2)}×` },
  { key: 'fov', label: 'Field of view', range: [55, 90, 1], fmt: v => `${v}°` },
  { key: 'vol', label: 'Volume', range: [0, 100, 1], fmt: v => `${v} %` },
  { key: 'gunnery', label: 'Gunnery', seg: [['assisted', 'Assisted'], ['realistic', 'Realistic']], note: 'Assisted lays the tank gun for the range of whatever the crosshair is on.' },
  { key: 'jetSpeed', label: 'Jet speed', seg: [['arcade', 'Arcade'], ['realistic', 'Realistic']], note: 'Arcade holds jets near 760 km/h; Realistic gives real top speeds, past Mach 1.' },
  { key: 'diff', label: 'Bot difficulty', seg: [[0, 'Easy'], [1, 'Normal'], [2, 'Hard']] },
  { key: 'bots', label: 'Bots per team', seg: [[4, '4'], [8, '8'], [12, '12']], note: 'In a battle, bots join or leave at once.' },
  { key: 'gfx', label: 'Graphics', seg: [['optimised', 'Optimised'], ['realistic', 'Realistic'], ['ultra', 'Ultra']], note: 'Graphics change from the next battle.' },
];
function renderSettings() {
  const row = r => {
    const v = GAME[r.key];
    if (r.range) return `<div class="srow"><span>${r.label}</span><div class="rng"><input type="range" min="${r.range[0]}" max="${r.range[1]}" step="${r.range[2]}" value="${v}" data-k="${r.key}"><b>${r.fmt(+v)}</b></div></div>`;
    return `<div class="srow"><span>${r.label}</span><div><div class="seg">${r.seg.map(([val, t]) => `<button class="btn${val === v ? ' on' : ''}" data-k="${r.key}" data-v="${val}">${t}</button>`).join('')}</div>${r.note ? `<small class="snote">${r.note}</small>` : ''}</div></div>`;
  };
  setHTML($('setRows'), SET_ROWS.map(row).join(''));
}
function applySetting(key, val) {
  GAME[key] = val;
  if (key === 'vol') Sound.volume(val / 100);
  if (key === 'bots' && GAME.on && !GAME.over) setBotCount(val);
  savePref(); renderSettings(); if (!GAME.on) renderTitle();
}
$('setRows').addEventListener('input', e => { const i = e.target.closest('input[data-k]'); if (!i) return; const r = SET_ROWS.find(r => r.key === i.dataset.k); GAME[r.key] = +i.value; i.nextElementSibling.textContent = r.fmt(+i.value); if (r.key === 'vol') Sound.volume(+i.value / 100); });
$('setRows').addEventListener('change', e => { const i = e.target.closest('input[data-k]'); if (i) applySetting(i.dataset.k, +i.value); });
$('setRows').addEventListener('click', e => { const b = e.target.closest('button[data-k]'); if (!b) return; const r = SET_ROWS.find(r => r.key === b.dataset.k); Sound.init(); Sound.play('ui'); applySetting(r.key, typeof r.seg[0][0] === 'number' ? +b.dataset.v : b.dataset.v); });
function openSettings() { renderSettings(); $('settings').classList.remove('hidden'); $('pause').classList.add('hidden'); }
function closeSettings() { $('settings').classList.add('hidden'); if (GAME.on && !GAME.over && !GAME.deploying) $('pause').classList.remove('hidden'); }
$('pSettings').onclick = openSettings; $('tSettings').onclick = openSettings; $('setDone').onclick = closeSettings;
addEventListener('keydown', e => { if (e.code === 'Escape' && !$('settings').classList.contains('hidden')) closeSettings(); });

/* bots joining or leaving a battle in progress */
function setBotCount(n) {
  GAME.bots = n;
  for (const t of [0, 1]) {
    const want = n - (t === GAME.team ? 1 : 0), mine = GAME.botsList.filter(b => b.team === t);
    for (let k = mine.length; k < want; k++) { // join: a fresh bot comes in a few seconds later with starting spawn points
      const used = new Set(GAME.botsList.map(b => b.name)), name = BOT_NAMES.find(x => !used.has(x)) || `${BOT_NAMES[k % BOT_NAMES.length]} ${k}`;
      const b = { team: t, name, unit: null, soldier: null, respawn: 1 + (k - mine.length) * 1.2, lane: (k % 5 - 2) * 7, ai: {}, sp: SP_START, skill: botSkill() }; b.st = newStat(name, t, false); GAME.botsList.push(b);
    }
    for (const b of mine.slice(want)) { // leave: the bot goes, and whatever it was in is left behind (an aircraft is taken away with it)
      const s = b.soldier;
      if (s && s.alive && s.veh) { if (s.veh.kind === 'air') { despawnAirBot(b, s.veh); } else { exitVehicle(s); s.veh && (s.veh = null); } }
      if (b.soldier) removeEnt(b.soldier);
      GAME.botsList.splice(GAME.botsList.indexOf(b), 1);
    }
  }
  feedLine(`<span class="mut">Bots per team: ${n}</span>`);
}
