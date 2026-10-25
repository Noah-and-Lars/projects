# Everyone on the newest version: the game looks at the published page's VERSION a little after it starts and every
# two minutes; when there is a newer one it reloads straight away, even in the middle of a race, so nobody stays
# on an old version.
import sys
p = sys.argv[1]; s = open(p).read()
def rep(old, new, count=1):
    global s
    assert s.count(old) == count, (s.count(old), old[:90])
    s = s.replace(old, new)
rep("""const photo = { on: false,""", """const updater = (() => {
  const newer = (a, b) => { const x = a.split('.').map(Number), y = b.split('.').map(Number); for (let i = 0; i < Math.max(x.length, y.length); i++) { if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0); } return false; };
  const u = { ready: false,
    check() {
      if (/^(localhost|127\\.)/.test(location.hostname) || location.protocol === 'file:') return;
      fetch(location.pathname.replace(/[^/]*$/, '') + 'index.html?u=' + Date.now(), { cache: 'no-store' }).then(r => (r.ok ? r.text() : '')).then(t => {
        const m = /VERSION = '([0-9.]+)'/.exec(t);
        if (m && newer(m[1], VERSION)) { u.ready = true; const q = new URLSearchParams(location.search); q.set('v', m[1]); location.replace(location.pathname + '?' + q + location.hash); }   // the new version in the address, so the reload can't come from the cache
      }).catch(() => {});
    },
    frame() {},
  };
  setTimeout(() => u.check(), 20000); setInterval(() => u.check(), 2 * 60 * 1000);
  return u;
})();
const photo = { on: false,""")
rep("""  if (photo.on) photo.apply();""", """  if (photo.on) photo.apply();
  updater.frame();""")
open(p, 'w').write(s); print('updater patch applied')
