# Polish batch 1: UI text, settings labels, hints, online pause flow, start-race failure, dead code.
#   python3 -I polish1_patch.py <index.html>
import sys
p = sys.argv[1]; s = open(p).read()
def rep(old, new, count=1):
    global s
    assert s.count(old) == count, (s.count(old), old[:90])
    s = s.replace(old, new)

# the driver aids are named the same on the dial as on the HUD
rep("""pill('ABS', cx - R * 0.42, cy + R * 0.05, car.abs > 0.3); pill('TCR', cx, cy - R * 0.33, car.tcs > 0.3); pill('STM', cx + R * 0.42, cy + R * 0.05, car.esc > 0.3);""",
    """pill('ABS', cx - R * 0.42, cy + R * 0.05, car.abs > 0.3); pill('TCS', cx, cy - R * 0.33, car.tcs > 0.3); pill('ESC', cx + R * 0.42, cy + R * 0.05, car.esc > 0.3);""")
rep("""    // the aids: ABS, TCR (traction), STM (stability)""", """    // the aids: ABS, TCS (traction), ESC (stability)""")
# room codes mix letters and digits
rep("""$('onMsg').textContent = 'Room codes have 5 letters.';""", """$('onMsg').textContent = 'A room code is 5 letters or digits.';""")
# the garage names the real car each one is modelled after, instead of a line left over from the source game
rep("""<span id="gFrom">From Free Criminal</span>""", """<span id="gFrom"></span>""")
rep("""    $('gName').textContent = t.name; $('gClass').textContent = t.cls;""",
    """    $('gName').textContent = t.name; $('gClass').textContent = t.cls;
    { const m = MODEL_OF[t.taxi || t.id === 'police' ? 'sedan' : t.id]; $('gFrom').textContent = m ? 'Modelled after the ' + m : ''; }""")
rep("""const CREDITS = 'Car models from Sketchfab""", """// the real car behind each one, shown in the garage
const MODEL_OF = { sedan: 'Mercedes-AMG E 63 S', hatch: 'Honda Civic Type R (EK9)', suv: 'Range Rover Supercharged', van: 'Mercedes-Benz Sprinter', muscle: 'Chevrolet Camaro ZL1',
  sports: 'Chevrolet Corvette C8 Stingray', pickup: 'Ford F-150', coupe: 'Aston Martin DB11', super: 'Lamborghini Centenario' };
const CREDITS = 'Car models from Sketchfab""")
# the home button's tag is about what is new now
rep("""<span class="k">New: races</span><b>PLAY</b>""", """<span class="k">New: Ultra graphics</span><b>PLAY</b>""")
# the FPS counter is a debugging aid: off unless asked for
rep("""speedo: 'analog', fps: true, line: 'brake',""", """speedo: 'analog', fps: false, line: 'brake',""")
# toasts and labels say what the setting buttons say
rep("""ui.toast('Driving line: ' + settings.line); }""", """ui.toast('Driving line: ' + { off: 'Off', full: 'Full', brake: 'Braking' }[settings.line]); }""")
rep("""<div class="opt"><div><label>Speed</label></div><div class="seg" data-set="units">""", """<div class="opt"><div><label>Speed units</label></div><div class="seg" data-set="units">""")
rep("""<div class="opt"><div><label>Volume</label></div><input type="range" min="0" max="1" step="0.05" id="volume"></div>""",
    """<div class="opt"><div><label>Sound effects</label><small>Engine, tyres, bumps</small></div><input type="range" min="0" max="1" step="0.05" id="volume"></div>""")
rep("""<div class="opt"><div><label>Driving line</label><small>Arrows on the road: when to brake and turn</small></div>""",
    """<div class="opt"><div><label>Driving line</label><small>Arrows on the road in races: when to brake and turn (L while driving)</small></div>""")
# the key hints list every key that does something
rep("""<kbd>Shift</kbd> + gas revs the engine · <kbd>R</kbd> respawn · <kbd>Backspace</kbd> restart · <kbd>C</kbd> camera · <kbd>Esc</kbd> pause</p>""",
    """<kbd>Shift</kbd> + gas revs the engine · <kbd>R</kbd> or <kbd>Enter</kbd> respawn · <kbd>Backspace</kbd> restart · <kbd>C</kbd> or <kbd>V</kbd> camera · <kbd>L</kbd> driving line · <kbd>Esc</kbd> or <kbd>P</kbd> pause</p>""")
rep("""<div id="keysHint"><kbd>Space</kbd> drift · <kbd>Shift</kbd> rev · <kbd>R</kbd> respawn · <kbd>Backspace</kbd> restart · <kbd>C</kbd> camera · <kbd>Esc</kbd> pause</div>""",
    """<div id="keysHint"><kbd>Space</kbd> drift · <kbd>Shift</kbd> rev · <kbd>R</kbd> respawn · <kbd>Backspace</kbd> restart · <kbd>C</kbd> camera · <kbd>L</kbd> line · <kbd>Esc</kbd> pause</div>""")
# the lobby's race summary reads like words
rep("""O.querySelector('span').textContent = `${room.settings.laps} laps · ${room.settings.time} · ${room.settings.season} · ${room.settings.season === 'winter' && room.settings.weather === 'rain' ? 'snow' : room.settings.weather} · ${room.settings.bots} bots`;""",
    """{ const cap = w => w ? w[0].toUpperCase() + w.slice(1) : ''; O.querySelector('span').textContent = `${room.settings.laps} laps · ${cap(room.settings.time)} · ${cap(room.settings.season)} · ${cap(room.settings.season === 'winter' && room.settings.weather === 'rain' ? 'snow' : room.settings.weather)} · ${room.settings.bots} bots`; }""")
# the track cards show all three medal times
rep("""if (t.par) b.querySelector('.p').textContent = `Gold ${fmt(t.par)} · Silver ${fmt(t.par * 1.12)}`;""",
    """if (t.par) b.querySelector('.p').textContent = `Gold ${fmt(t.par)} · Silver ${fmt(t.par * 1.12)} · Bronze ${fmt(t.par * 1.3)}`;""")
# the pause screen in an online race: no Restart (the race carries on), and Races leaves the room properly
rep("""    if (race.mode === 'circuit' && RM.online) { show('pause'); $('pauseTrack').textContent = 'Online race: the race carries on'; pausedFrom = null; return; }""",
    """    $('pause').querySelector('[data-act="restart"]').hidden = race.mode === 'circuit' && RM.online;
    if (race.mode === 'circuit' && RM.online) { show('pause'); $('pauseTrack').textContent = 'Online race: the race carries on while you are here'; $('pauseTracks').textContent = 'Leave race'; pausedFrom = null; return; }""")
rep("""        if (race.mode === 'circuit') { pausedFrom = null; RM.clear(); race.state = 'menu'; hud0.hidden = true; document.body.classList.remove('race-hud'); withLoading(continueIdx(), () => raceUI.list()); break; }""",
    """        if (race.mode === 'circuit' && RM.online && typeof net !== 'undefined') { pausedFrom = null; net.leave(); break; }
        if (race.mode === 'circuit') { pausedFrom = null; RM.clear(); race.state = 'menu'; hud0.hidden = true; document.body.classList.remove('race-hud'); withLoading(continueIdx(), () => raceUI.list()); break; }""")
rep("""      case 'restart': if (RM.online) break; music.duck(false); restart(); snapCamera(); break;""",
    """      case 'restart': if (RM.online) { ui.toast('No restarts in an online race'); break; } music.duck(false); restart(); snapCamera(); break;""")
# a race that fails to build says so instead of leaving the player on the tyre screen
rep("""      try { startNow(def, o); } catch (e) { console.error(e); }
      ui.loading(false);""", """      try { startNow(def, o); } catch (e) { console.error(e); ui.toast('Could not build that circuit. Try another one.'); }
      ui.loading(false);""")
# small leftovers
rep("""r.isBest ? 'FINISHED' : 'FINISHED';""", """'FINISHED';""")
rep("""if (this.saveT > 6) { this.saveT = 0; ST.xp += 0; store(); }""", """if (this.saveT > 6) { this.saveT = 0; store(); }""")
open(p, 'w').write(s); print('polish batch 1 applied')
