/* The Arcade is moving (2026-11-13, the owner's request): the GitHub Pages address (noah-and-lars.github.io) shuts
   down on November 17 and everyone moves to https://thearcade.pages.dev. This file is loaded by every page and game,
   but it only does anything on the GitHub address: the Cloudflare copy is built from these same files and must never
   show it. On the old address: a banner that stays at the top, and a pop-up when a page opens and again every few
   minutes. Progress moves with the Arcade account (cloud saves), so someone who isn't signed in to an online account
   is told to make one or sign in here first. Games shown inside play.html skip it (the page around them has it). */
(function () {
  if (location.hostname !== 'noah-and-lars.github.io') return;
  try { if (window.top !== window && window.top.location.hostname === location.hostname) return; } catch (e) {}
  if (window.__arcadeMoving) return; window.__arcadeMoving = 1;
  var NEW = 'https://thearcade.pages.dev', EVERY = 4 * 60 * 1000;
  // the same page on the new site (it's served at the root there, not under /projects/)
  function newUrl() { var p = location.pathname.replace(/^\/projects(\/|$)/, '/'); return NEW + (p === '/' ? '/' : p) + location.search + location.hash; }
  function signedIn() { try { var a = JSON.parse(localStorage.getItem('arcade-acct') || 'null'); return !!(a && a.name && a.token); } catch (e) { return false; } }
  function el(tag, css, text) { var e = document.createElement(tag); if (css) e.style.cssText = css; if (text) e.textContent = text; return e; }
  var FONT = 'font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;';

  function banner() {
    if (document.getElementById('arcadeMoving')) return;
    var b = el('div', 'position:fixed;left:0;right:0;top:0;z-index:2147483600;display:flex;gap:10px;align-items:center;justify-content:center;flex-wrap:wrap;padding:7px 12px;background:#c8342a;color:#fff;' + FONT + 'font-weight:700;font-size:14px;line-height:1.3;text-align:center;box-shadow:0 2px 10px rgba(0,0,0,.4);pointer-events:auto');
    b.id = 'arcadeMoving'; b.setAttribute('role', 'alert');
    b.appendChild(el('span', '', '🚚 The Arcade is moving to thearcade.pages.dev. This site shuts down on November 17. All your progress migrates over.'));
    var a = el('a', 'color:#c8342a;background:#fff;border-radius:999px;padding:4px 12px;text-decoration:none;white-space:nowrap', 'Go to the new site →');
    a.href = newUrl(); a.target = '_top'; a.onclick = function () { a.href = newUrl(); };
    b.appendChild(a);
    document.body.appendChild(b);
    // site pages (with the sticky header) move down under it; games keep it on top of the game
    var fit = function () { var hd = document.querySelector('header.top'), h = b.offsetHeight; if (!hd) return; document.body.style.paddingTop = h + 'px'; hd.style.top = h + 'px'; };
    fit(); addEventListener('resize', fit);
  }

  function popup() {
    if (document.getElementById('arcadeMovingPop')) return;
    var o = el('div', 'position:fixed;inset:0;z-index:2147483601;display:grid;place-items:center;background:rgba(0,0,0,.65);padding:16px;' + FONT);
    o.id = 'arcadeMovingPop';
    var c = el('div', 'max-width:440px;width:100%;box-sizing:border-box;background:#1b1835;color:#f1effa;border:2px solid #c8342a;border-radius:18px;padding:22px 20px;text-align:center;box-shadow:0 18px 50px rgba(0,0,0,.6)');
    c.appendChild(el('div', 'font-size:40px;line-height:1', '🚚'));
    c.appendChild(el('h2', 'margin:10px 0 8px;font-size:22px', 'We’re moving to a new site!'));
    c.appendChild(el('p', 'margin:0 0 10px;font-size:15px;line-height:1.45', 'The Arcade is moving to thearcade.pages.dev. This site shuts down on November 17, so everyone needs to move to the new site.'));
    var link = el('p', 'margin:0 0 10px;font-size:16px;font-weight:800;color:#ffd34d;word-break:break-all', NEW);
    c.appendChild(link);
    c.appendChild(el('p', 'margin:0 0 14px;font-size:15px;line-height:1.45', signedIn()
      ? 'All your progress will migrate over. Just log in on the new site with the same Arcade account.'
      : 'All your progress will migrate over with your Arcade account. You’re not signed in to an online account on this site yet, so make one (or sign in) here first, then log in with it on the new site.'));
    var row = el('div', 'display:flex;gap:8px;justify-content:center;flex-wrap:wrap');
    var go = el('a', 'display:inline-block;padding:10px 18px;border-radius:12px;background:#c8342a;color:#fff;font-weight:800;text-decoration:none', 'Go to the new site');
    go.href = newUrl(); go.target = '_top';
    row.appendChild(go);
    if (!signedIn() && window.ArcadeAccount && window.ArcadeAccount.open) {
      var acc = el('button', 'padding:10px 16px;border-radius:12px;border:1px solid #ffffff55;background:#6c5ce7;color:#fff;font:inherit;font-weight:800;cursor:pointer', 'Sign in / make an account');
      acc.type = 'button'; acc.onclick = function () { o.remove(); try { window.ArcadeAccount.open(); } catch (e) {} };
      row.appendChild(acc);
    }
    var x = el('button', 'padding:10px 16px;border-radius:12px;border:1px solid #ffffff44;background:none;color:#f1effa;font:inherit;font-weight:700;cursor:pointer', 'Not now');
    x.type = 'button'; x.onclick = function () { o.remove(); };
    row.appendChild(x);
    c.appendChild(row);
    o.appendChild(c);
    o.addEventListener('click', function (e) { if (e.target === o) o.remove(); });
    document.body.appendChild(o);
  }

  function start() {
    banner(); popup();
    setInterval(function () { banner(); if (!document.hidden) popup(); }, EVERY);
  }
  if (document.body) start(); else document.addEventListener('DOMContentLoaded', start);
})();
