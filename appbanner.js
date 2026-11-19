/* "The Arcade app is here" (2026-11-13, the owner's request): a bar above the header on the site's own pages (index,
   play, chat, players, social, support) with a Download button to the app's download page (app/index.html, linked from
   nowhere else). Never inside the apps themselves: the Mac/Windows app sets window.ARCADE_APP / html.arcade-app, and the
   Android app (2026-11-15) also says "TheArcadeApp/" in its browser name, which is there before any script runs.
   2026-11-15 (the owner's request): Android phones, tablets and TVs see it too, for the Android app; other phones and
   tablets (iPhone, iPad) and consoles (PlayStation, Xbox) still don't, as there's no app for them. Closing it is
   remembered on this device (a new key that day, so everyone who had closed it sees it once more). */
(function () {
  var html = document.documentElement, ua = navigator.userAgent || '';
  var inApp = function () { return !!window.ARCADE_APP || html.classList.contains('arcade-app') || /TheArcadeApp\//.test(ua); };
  // 2026-11-18: also not in the site installed as an app from Chrome (a standalone window)
  try { if (matchMedia('(display-mode: standalone)').matches || matchMedia('(display-mode: window-controls-overlay)').matches) return; } catch (e) {}
  if (inApp()) { if (/TheArcadeApp\//.test(ua)) html.classList.add("arcade-app"); return; } // the Android app: hides the Software tab too
  try { if (window.top !== window) return; } catch (e) { return; }
  var android = /Android/i.test(ua), cros = /\bCrOS\b/.test(ua); // 2026-11-18: Chromebooks get their own app
  if (!android && (html.classList.contains('mob') || html.classList.contains('console'))) return;
  var KEY = 'arcade-app-banner-closed-3'; // 2026-11-18: new look, shown once more
  try { if (localStorage.getItem(KEY) === '1') return; } catch (e) {}
  function show() {
    if (document.getElementById('appBanner') || inApp()) return;
    var b = document.createElement('div'); b.id = 'appBanner'; b.setAttribute('role', 'region'); b.setAttribute('aria-label', 'The Arcade app');
    // 2026-11-18: the site's own look (dark bar, orange accent) instead of the old purple/teal gradient
    b.style.cssText = 'position:relative;z-index:30;display:flex;align-items:center;justify-content:center;gap:12px;flex-wrap:wrap;padding:8px 48px 8px 16px;background:radial-gradient(120% 220% at 50% 0%,rgba(255,90,44,.16),rgba(255,90,44,0) 60%),#0b0b0d;border-bottom:1px solid rgba(255,255,255,.08);color:#f4f4f5;font:500 14px/1.35 "Archivo",system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;text-align:center';
    var tag = document.createElement('span'); tag.textContent = 'NEW';
    tag.style.cssText = 'display:inline-flex;align-items:center;height:20px;padding:0 7px;border-radius:6px;background:#ff5a2c;color:#160500;font:700 10.5px/1 "JetBrains Mono",ui-monospace,monospace;letter-spacing:.1em';
    var t = document.createElement('span'); t.textContent = cros ? 'Get The Arcade app for your Chromebook' : android ? 'Get The Arcade app for Android phones and Android TV' : 'The Arcade app is here for Mac, Windows, Chromebook and Android';
    var a = document.createElement('a'); a.href = cros ? 'app/#chromebook' : android ? 'app/#android' : 'app/'; a.textContent = 'Download';
    a.style.cssText = 'display:inline-flex;align-items:center;gap:6px;background:#ff5a2c;color:#160500;border-radius:999px;padding:5px 16px;text-decoration:none;font-weight:700;font-size:13.5px;transition:background .15s';
    a.onmouseenter = function () { a.style.background = '#ff6d43'; }; a.onmouseleave = function () { a.style.background = '#ff5a2c'; };
    var x = document.createElement('button'); x.type = 'button'; x.setAttribute('aria-label', 'Close'); x.textContent = '×';
    x.style.cssText = 'position:absolute;right:8px;top:50%;transform:translateY(-50%);background:none;border:0;color:#a1a1aa;font:400 22px/1 system-ui,sans-serif;cursor:pointer;padding:4px 10px';
    x.onclick = function () { b.remove(); try { localStorage.setItem(KEY, '1'); } catch (e) {} };
    b.appendChild(tag);
    b.appendChild(t); b.appendChild(a); b.appendChild(x);
    document.body.prepend(b);
  }
  if (document.body) show(); else document.addEventListener('DOMContentLoaded', show);
})();
