// The GitHub Arcade has closed. Every page shows this screen first.
(function () {
  var KEY = 'ghClosedPass';
  try { if (localStorage.getItem(KEY) === '1') return; } catch (e) {}
  var root = document.documentElement;
  root.classList.add('ghc');
  var css = document.createElement('style');
  css.textContent =
    'html.ghc,html.ghc body{background:#000!important;overflow:hidden!important}' +
    'html.ghc body>*:not(#ghc){display:none!important}' +
    '#ghc{position:fixed;inset:0;z-index:2147483647;background:#000;color:#fff;display:grid;place-items:center;text-align:center;padding:24px;box-sizing:border-box;font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}' +
    '#ghc h1{margin:0 0 18px;font-size:clamp(30px,7vw,72px);font-weight:900;letter-spacing:.04em;text-transform:uppercase;color:#fff;animation:ghcf 1.1s steps(1) infinite}' +
    '#ghc p{margin:0 0 26px;font-size:clamp(16px,2.6vw,22px);color:#fff;opacity:.85}' +
    '#ghc a{display:inline-block;color:#000;background:#fff;text-decoration:none;font-weight:800;font-size:clamp(18px,3vw,26px);padding:14px 28px;border-radius:10px}' +
    '@keyframes ghcf{50%{opacity:0}}@media (prefers-reduced-motion:reduce){#ghc h1{animation:none}}';
  root.appendChild(css);
  var box = document.createElement('div');
  box.id = 'ghc';
  box.innerHTML = '<main><h1>The GitHub Arcade has closed</h1><p>The Arcade has moved. All your games and your account are at the new site:</p>' +
    '<a href="https://thearcade.pages.dev/" target="_top">thearcade.pages.dev</a></main>';
  function place() { if (document.body && !box.parentNode) document.body.appendChild(box); }
  place();
  document.addEventListener('DOMContentLoaded', place);
  var keep = setInterval(place, 300);
  var zeros = 0;
  function open() {
    clearInterval(keep);
    try { localStorage.setItem(KEY, '1'); } catch (e) {}
    root.classList.remove('ghc');
    if (box.parentNode) box.parentNode.removeChild(box);
    css.remove();
    window.removeEventListener('keydown', onKey, true);
    window.removeEventListener('keyup', eat, true);
    window.removeEventListener('keypress', eat, true);
  }
  function eat(e) { e.stopImmediatePropagation(); e.preventDefault(); }
  function onKey(e) {
    eat(e);
    if (e.repeat) return;
    if (e.key === '0') { if (++zeros >= 6) open(); } else zeros = 0;
  }
  window.addEventListener('keydown', onKey, true);
  window.addEventListener('keyup', eat, true);
  window.addEventListener('keypress', eat, true);
  // unlocked in another tab or frame: open here too
  window.addEventListener('storage', function (e) { if (e.key === KEY && e.newValue === '1') open(); });
})();
