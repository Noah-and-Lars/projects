# Polish batch 2: a real optimal lap from best sectors, live cockpit gauges, full-storage handling, missing-model warning.
#   python3 -I polish2_patch.py <index.html>
import sys
p = sys.argv[1]; s = open(p).read()
def rep(old, new, count=1):
    global s
    assert s.count(old) == count, (s.count(old), old[:90])
    s = s.replace(old, new)

# ---- the optimal lap: the best time through each of the three sectors, added up
rep("""this.ghostT = 0; this.wrongT = 0; this.mistakeT = 0; this.lastSector = 0; this.sectorT = [0, 0, 0];""",
    """this.ghostT = 0; this.wrongT = 0; this.mistakeT = 0; this.lastSector = 0; this.sectorT = [0, 0, 0]; this.bestSec = [null, null, null];""")
rep("""r.lapStart = 0; r.lapTimes = []; r.best = null; r.finished = false; r.finishT = 0;""",
    """r.lapStart = 0; r.lapTimes = []; r.best = null; r.finished = false; r.finishT = 0; r.sectorT = [0, 0, 0]; r.lastSector = 0; r.bestSec = [null, null, null];""")
rep("""    if (sec !== r.lastSector && (sec === r.lastSector + 1) && r.lap > 0) { r.sectorT[r.lastSector] = this.t - r.lapStart - (r.lastSector ? r.sectorT.slice(0, r.lastSector).reduce((a, b) => a + b, 0) : 0); }""",
    """    if (sec !== r.lastSector && (sec === r.lastSector + 1) && r.lap > 0) {
      const k = r.lastSector; r.sectorT[k] = this.t - r.lapStart - (k ? r.sectorT.slice(0, k).reduce((a, b) => a + b, 0) : 0);
      if (r.bestSec && r.sectorT[k] > 0 && (r.bestSec[k] == null || r.sectorT[k] < r.bestSec[k])) r.bestSec[k] = r.sectorT[k];
    }""")
rep("""          const lt = this.t - r.lapStart;
          r.lapTimes.push(lt);
          if (r.best == null || lt < r.best) r.best = lt;
          if (r.isPlayer) { hud.lapDone(lt, r.best, r.lap); stats.lap(this.def.id, lt); }""",
    """          const lt = this.t - r.lapStart;
          r.lapTimes.push(lt);
          if (r.best == null || lt < r.best) r.best = lt;
          // the last sector ends at the line
          if (r.bestSec && r.lastSector === 2) { r.sectorT[2] = lt - r.sectorT[0] - r.sectorT[1]; if (r.sectorT[2] > 0 && (r.bestSec[2] == null || r.sectorT[2] < r.bestSec[2])) r.bestSec[2] = r.sectorT[2]; }
          if (r.isPlayer) { hud.lapDone(lt, r.best, r.lap, r.bestSec); stats.lap(this.def.id, lt); }""")
rep("""    lapDone(lt, best, lap) {
      $('lbLast').textContent = fmt(lt); $('lbBest').textContent = fmt(best);""",
    """    lapDone(lt, best, lap, bestSec) {
      $('lbLast').textContent = fmt(lt); $('lbBest').textContent = fmt(best);""")
rep("""      // the optimal lap: best sectors added up (here: the best lap until sectors are kept)
      $('lbOpt').textContent = fmt(best);""",
    """      // the optimal lap: the best time through each sector, added up
      const opt = bestSec && bestSec.every(x => x != null) ? Math.min(best, bestSec[0] + bestSec[1] + bestSec[2]) : best;
      $('lbOpt').textContent = fmt(opt);""")

# ---- the cockpit's small gauges move: the engine warms up, fuel goes down, oil pressure follows the revs
rep("""  small(210, 120, 78, 0.55, 'TEMP'); small(210, 285, 78, 0.8, 'FUEL'); small(70, 200, 58, 0.45, 'OIL');""",
    """  { const L = gaugeLive, k = Math.max(0, Math.min(1, rpm / Math.max(1, red)));
    L.temp += ((0.5 + k * 0.22) - L.temp) * 0.004; L.fuel = Math.max(0.06, L.fuel - k * 0.000012); L.oil += ((0.3 + k * 0.5) - L.oil) * 0.08;
    small(210, 120, 78, L.temp, 'TEMP'); small(210, 285, 78, L.fuel, 'FUEL'); small(70, 200, 58, L.oil, 'OIL'); }""")
rep("""function drawGauges(kmh, rpm, red, gear, units) {""", """const gaugeLive = { temp: 0.3, fuel: 0.93, oil: 0.3 };
function drawGauges(kmh, rpm, red, gear, units) {""")

# ---- a full browser storage no longer loses progress silently: old ghosts make room, and the player hears about it
rep("""const store = () => { try { localStorage.setItem(SAVE, JSON.stringify(saved)); } catch (e) {} };""",
    """const store = () => { try { localStorage.setItem(SAVE, JSON.stringify(saved)); } catch (e) { storageFull(); try { localStorage.setItem(SAVE, JSON.stringify(saved)); } catch (e2) {} } };
// browser storage is full (ghost laps take most of it): clear the oldest quarter of the ghosts and say so, at most once a minute
function storageFull() {
  if (storageFull.t && performance.now() - storageFull.t < 60000) return;
  storageFull.t = performance.now();
  try {
    const keys = []; for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k && k.startsWith(SAVE + '-ghost-')) keys.push(k); }
    for (const k of keys.slice(0, Math.ceil(keys.length / 4))) localStorage.removeItem(k);
  } catch (e) {}
  try { ui.toast('Browser storage was full: some old ghost laps were cleared'); } catch (e) {}
}""")
rep("""function saveGhost(id, g) { try { localStorage.setItem(SAVE + '-ghost-' + id, JSON.stringify(g)); } catch (e) {} }""",
    """function saveGhost(id, g) {
  try { localStorage.setItem(SAVE + '-ghost-' + id, JSON.stringify(g)); }
  catch (e) { storageFull(); try { localStorage.setItem(SAVE + '-ghost-' + id, JSON.stringify(g)); } catch (e2) {} }
}""")

# ---- a car model that fails to load is reported, not just skipped
rep("""    try { const r = await fetch('models/' + k + '.fcm?v=' + VERSION); if (!r.ok) return; MODELS[k] = parseFCM(await r.arrayBuffer()); }
    catch (e) { console.warn('model ' + k, e); }""",
    """    try { const r = await fetch('models/' + k + '.fcm?v=' + VERSION); if (!r.ok) { console.warn('model ' + k + ': ' + r.status); return; } MODELS[k] = parseFCM(await r.arrayBuffer()); }
    catch (e) { console.warn('model ' + k, e); }""")
rep("""  if (!MODELS.police && MODELS.sedan) MODELS.police = MODELS.sedan;""",
    """  if (!MODELS.police && MODELS.sedan) MODELS.police = MODELS.sedan;
  { const missing = MODEL_IDS.filter(k => !MODELS[k]); if (missing.length) setTimeout(() => { try { ui.toast('Some car models did not load (' + missing.join(', ') + '): simpler cars stand in'); } catch (e) {} }, 2500); }""")
rep("""tyres: 'tyBack', avatar: 'profile', results: 'home' }[s];""", """tyres: 'tyBack', avatar: 'profile', results: 'home', lobby: 'leaveRoom', finish: 'home' }[s];""")
open(p, 'w').write(s); print('polish batch 2 applied')
