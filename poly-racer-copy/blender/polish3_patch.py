# Polish batch 3: the profile screen reads right (level, totals from the real track lists, no overlapping stats).
#   python3 -I polish3_patch.py <index.html>
import sys
p = sys.argv[1]; s = open(p).read()
def rep(old, new, count=1):
    global s
    assert s.count(old) == count, (s.count(old), old[:90])
    s = s.replace(old, new)

rep("""    $('prLevel').textContent = ` · ${ST.onWins} online wins`;""", """    $('prLevel').textContent = ` · Level ${L.lv}`;""")
rep("""    $('prTag').textContent = '(' + (profile.name || 'driver').toLowerCase().replace(/\\s+/g, '') + ')';""",
    """    $('prTag').textContent = '@' + (profile.name || 'driver').toLowerCase().replace(/\\s+/g, '');""")
rep("""${kv('Collection', Math.round(Object.keys(saved.colors).length / CARS.length * 100) + ' %')}""",
    """${kv('Cars you have painted', Object.keys(saved.colors).length + ' / ' + CARS.length)}""")
rep("""      `<div class="sec"><b>Circuits</b><div>${kv('Time trials finished', finishedCount() + ' / 100')}${kv('Races won', won + ' / 30')}${kv('Podiums', pods + ' / 30')}${kv('Laps', ST.laps.toLocaleString())}</div></div>` +
      `<div class="sec"><b>Gameplay</b><div>${kv('Races', ST.races)}${kv('Wins', ST.wins)}${kv('Online races', ST.onRaces + ' · ' + ST.onWins + ' won')}${kv('Airtime', ST.air.toFixed(1) + ' s')}${kv('Drifts', ST.drifts)}</div></div>`;""",
    """      `<div class="sec"><b>Progress</b><div>${kv('Time trials finished', finishedCount() + ' / ' + TRACKS.length)}${kv('Circuits won', won + ' / ' + CIRCUITS.length)}${kv('Circuits with a podium', pods + ' / ' + CIRCUITS.length)}${kv('Laps', ST.laps.toLocaleString())}</div></div>` +
      `<div class="sec"><b>Racing</b><div>${kv('Races driven', ST.races)}${kv('Race wins', ST.wins)}${kv('Online races', ST.onRaces + ' · ' + ST.onWins + ' won')}${kv('Airtime', ST.air.toFixed(1) + ' s')}${kv('Drifts', ST.drifts)}</div></div>`;""")
rep("""    $('pcTTtag').textContent = `${finishedCount()} / 100 finished`;""", """    $('pcTTtag').textContent = `${finishedCount()} / ${TRACKS.length} finished`;""")
rep("""    $('pcRCtag').textContent = `${won} / 30 won`;""", """    $('pcRCtag').textContent = `${won} / ${CIRCUITS.length} won`;""")
# both ratings start the same way
rep("""sr() { const km = ST.dist / 1000; if (km < 5) return 'B';""", """sr() { const km = ST.dist / 1000; if (km < 5) return '-';""")
# the daily goal says what it is
rep("""<small id="prGoal">Goal: 42.2 km</small>""", """<small id="prGoal">Daily goal: a marathon, 42.2 km</small>""")
open(p, 'w').write(s); print('polish batch 3 applied')
