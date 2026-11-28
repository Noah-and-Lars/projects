// A stand-in for the arcade Worker's /ct/ routes (the public stores' saves),
// for tests only. Pages in the same browser context share it through the real
// localStorage (each test page wraps its own storage under a prefix after this
// runs). window.__ctDown = true makes it unreachable; window.__ctDrop = true
// makes it silently drop saves (like a tab that closed before its save got out).
(function () {
  const LS = window.localStorage;
  const key = (r) => 'ctsrv:' + r;
  window.__ctCount = (room) => { const v = JSON.parse(LS.getItem(key(room)) || 'null'); return v ? v.n : 0; };
  window.__ctServer = {
    async get(room) {
      if (window.__ctDown) throw new Error('offline');
      const v = LS.getItem(key(room));
      return v ? JSON.parse(v).s : null;
    },
    async put(room, s) {
      if (window.__ctDown) return false;
      if (window.__ctDrop) return true;
      const old = JSON.parse(LS.getItem(key(room)) || 'null');
      LS.setItem(key(room), JSON.stringify({ s, at: Date.now(), n: ((old && old.n) || 0) + 1 }));
      return true;
    },
  };
})();
