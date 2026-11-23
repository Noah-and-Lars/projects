/* The Arcade is moving (2026-11-23, the owner's request): the old GitHub address (noah-and-lars.github.io/projects)
   has the owners' real names in it (noah-and-lars), so everyone moves to the new GitHub address https://playthearcade.github.io as soon as
   possible. Both sites run the same files and the same server (accounts, chat, Social, online play), but browser
   storage is kept per address, so only ONLINE accounts carry progress over. Local accounts (and guests) must turn
   their progress into an online account before Wednesday 25 November 2026, or it won't be transferred.
   This file is loaded by every page and game, but it only does anything on the old address: the new site and the
   thearcade.pages.dev copy are built from these same files and never show it. On the old address: a banner that
   stays at the top, and a pop-up when a page opens and again every few minutes. Games shown inside play.html skip it
   (the page around them has it).
   History: 2026-11-13 the first move (to thearcade.pages.dev), switched off 2026-11-18 when GitHub came back. */
(function () {
  if (location.hostname !== 'noah-and-lars.github.io') return;
  try { if (window.top !== window && window.top.location.hostname === location.hostname) return; } catch (e) {}
  if (window.__arcadeMoving) return; window.__arcadeMoving = 1;
  var NEW = 'https://playthearcade.github.io', EVERY = 4 * 60 * 1000;
  var DEADLINE = 'Wednesday 25 November';
  // the same page on the new site (it's served at the root there, not under /projects/)
  function newUrl() { var p = location.pathname.replace(/^\/projects(\/|$)/, '/'); return NEW + (p === '/' ? '/' : p) + location.search + location.hash; }
  // 'online', 'local' or '' (no account yet), from account.js when it's there
  function kind() {
    try { if (window.ArcadeAccount && window.ArcadeAccount.kind) return window.ArcadeAccount.kind() || ''; } catch (e) {}
    try { var a = JSON.parse(localStorage.getItem('arcade-acct') || 'null'); if (a && a.name && a.token) return 'online'; } catch (e) {}
    try { var l = JSON.parse(localStorage.getItem('arcade-local') || 'null'); if (l && l.name) return 'local'; } catch (e) {}
    return '';
  }
  // inside an Arcade app (1.0.1 and older open this address): the app needs updating rather than a new link
  function appInfo() { try { return window.ARCADE_APP || null; } catch (e) { return null; } }
  function el(tag, css, text) { var e = document.createElement(tag); if (css) e.style.cssText = css; if (text) e.textContent = text; return e; }
  var FONT = 'font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;';

  function banner() {
    if (document.getElementById('arcadeMoving')) return;
    var b = el('div', 'position:fixed;left:0;right:0;top:0;z-index:2147483600;display:flex;gap:10px;align-items:center;justify-content:center;flex-wrap:wrap;padding:7px 12px;background:#c8342a;color:#fff;' + FONT + 'font-weight:700;font-size:14px;line-height:1.3;text-align:center;box-shadow:0 2px 10px rgba(0,0,0,.4);pointer-events:auto');
    b.id = 'arcadeMoving'; b.setAttribute('role', 'alert');
    b.appendChild(el('span', '', '🚚 The Arcade has moved to playthearcade.github.io. Please move over as soon as possible. Local accounts: make an online account before ' + DEADLINE + '.'));
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
    var k = kind();
    var o = el('div', 'position:fixed;inset:0;z-index:2147483601;display:grid;place-items:center;background:rgba(0,0,0,.65);padding:16px;overflow:auto;' + FONT);
    o.id = 'arcadeMovingPop';
    var c = el('div', 'max-width:460px;width:100%;box-sizing:border-box;background:#1b1835;color:#f1effa;border:2px solid #c8342a;border-radius:18px;padding:22px 20px;text-align:center;box-shadow:0 18px 50px rgba(0,0,0,.6)');
    c.appendChild(el('div', 'font-size:40px;line-height:1', '🚚'));
    c.appendChild(el('h2', 'margin:10px 0 8px;font-size:22px', 'We’re moving to a new link!'));
    c.appendChild(el('p', 'margin:0 0 10px;font-size:15px;line-height:1.45', 'The old link has the owners’ real names in it, so to keep our own details private The Arcade is moving to a new link. Your account and data are safe: nothing has been leaked or stolen. Everyone must move to the new site as soon as possible.'));
    var link = el('p', 'margin:0 0 12px;font-size:17px;font-weight:800;color:#ffd34d;word-break:break-all', NEW.replace('https://', ''));
    c.appendChild(link);
    var warn = 'margin:0 0 14px;font-size:15px;line-height:1.45;padding:10px 12px;border-radius:12px;background:#c8342a22;border:1px solid #c8342a';
    if (k === 'online') {
      c.appendChild(el('p', 'margin:0 0 14px;font-size:15px;line-height:1.45', '✅ You have an online account, so all your progress comes with you. Just log in on the new site with the same name and password.'));
    } else {
      var w = el('p', warn);
      w.appendChild(el('b', '', '⚠️ Local accounts: '));
      w.appendChild(document.createTextNode(k === 'local'
        ? 'you’re playing with a local account. Turn it into an online account before ' + DEADLINE + ', or its progress will be deleted and won’t be transferred to the new site.'
        : 'progress without an online account isn’t transferred. Make a free online account before ' + DEADLINE + ', or your progress will be deleted and won’t come over to the new site.'));
      c.appendChild(w);
    }
    var A = appInfo();
    if (A) {
      var self = !A.legacy && (A.os === 'macos' || A.os === 'windows'); // the Mac/Windows app updates itself
      c.appendChild(el('p', 'margin:0 0 14px;font-size:15px;line-height:1.45;padding:10px 12px;border-radius:12px;background:#6c5ce722;border:1px solid #6c5ce7', self
        ? '📲 Update The Arcade app: version 1.0.2 opens the new link. Close and reopen the app and choose Install when it offers the update.'
        : '📲 Update The Arcade app: version 1.0.2 opens the new link. Download it from the new site’s app page and install it over this one.'));
    }
    var row = el('div', 'display:flex;gap:8px;justify-content:center;flex-wrap:wrap');
    if (A) {
      var upd = el('a', 'display:inline-block;padding:10px 18px;border-radius:12px;background:#6c5ce7;color:#fff;font-weight:800;text-decoration:none', 'Get the new app');
      upd.href = NEW + '/app/'; upd.target = '_blank'; upd.rel = 'noopener';
      row.appendChild(upd);
    }
    var go = el('a', 'display:inline-block;padding:10px 18px;border-radius:12px;background:#c8342a;color:#fff;font-weight:800;text-decoration:none', 'Go to the new site');
    go.href = newUrl(); go.target = '_top';
    row.appendChild(go);
    if (k !== 'online' && window.ArcadeAccount && (window.ArcadeAccount.welcome || window.ArcadeAccount.open)) {
      var acc = el('button', 'padding:10px 16px;border-radius:12px;border:1px solid #ffffff55;background:#6c5ce7;color:#fff;font:inherit;font-weight:800;cursor:pointer', 'Make an online account');
      acc.type = 'button'; acc.onclick = function () { o.remove(); try { (window.ArcadeAccount.welcome || window.ArcadeAccount.open)(); } catch (e) {} };
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
