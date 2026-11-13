/* "The Arcade app is here" (2026-11-13, the owner's request): a bar above the header on the site's own pages (index,
   play, chat, players, social, support) with a Download button to the app's download page (app/index.html, linked from
   nowhere else). Never inside the app itself (window.ARCADE_APP / html.arcade-app, set by the app), and not on phones
   or tablets (html.mob: the app is for Mac and Windows). Closing it is remembered on this device. */
(function () {
  var html = document.documentElement;
  if (window.ARCADE_APP || html.classList.contains('arcade-app') || html.classList.contains('mob')) return;
  try { if (window.top !== window) return; } catch (e) { return; }
  var KEY = 'arcade-app-banner-closed';
  try { if (localStorage.getItem(KEY) === '1') return; } catch (e) {}
  function show() {
    if (document.getElementById('appBanner') || window.ARCADE_APP || html.classList.contains('arcade-app')) return;
    var b = document.createElement('div'); b.id = 'appBanner'; b.setAttribute('role', 'region'); b.setAttribute('aria-label', 'The Arcade app');
    b.style.cssText = 'position:relative;z-index:30;display:flex;align-items:center;justify-content:center;gap:14px;flex-wrap:wrap;padding:9px 48px 9px 16px;background:linear-gradient(90deg,#6c5ce7,#00a98a);color:#fff;font:700 14px/1.35 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;text-align:center';
    var t = document.createElement('span'); t.textContent = '🎮 The Arcade app is here for Mac and Windows!';
    var a = document.createElement('a'); a.href = 'app/'; a.textContent = 'Download';
    a.style.cssText = 'display:inline-flex;align-items:center;gap:6px;background:#fff;color:#3b2fb8;border-radius:999px;padding:5px 16px;text-decoration:none;font-weight:800;box-shadow:0 2px 8px rgba(0,0,0,.2)';
    var x = document.createElement('button'); x.type = 'button'; x.setAttribute('aria-label', 'Close'); x.textContent = '×';
    x.style.cssText = 'position:absolute;right:8px;top:50%;transform:translateY(-50%);background:none;border:0;color:#fff;font:700 22px/1 system-ui,sans-serif;cursor:pointer;padding:4px 10px;opacity:.85';
    x.onclick = function () { b.remove(); try { localStorage.setItem(KEY, '1'); } catch (e) {} };
    b.appendChild(t); b.appendChild(a); b.appendChild(x);
    document.body.prepend(b);
  }
  if (document.body) show(); else document.addEventListener('DOMContentLoaded', show);
})();
