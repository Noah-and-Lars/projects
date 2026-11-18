/* assistant.js (2026-11-18): the ✨ Arcade assistant, a side panel on every site page (loaded after account.js).
   The ✨ button sits in the header next to the account button (on play.html beside Clip and Fullscreen, never over the
   game). The panel slides in from the right (full screen on phones; on play.html on a wide screen the page makes room
   so the game isn't covered). It is a [role=dialog], so console.js keeps the focus inside it and Back closes it.
   Online accounts only: guests and local accounts see "Sign in to use the assistant". Each message goes to the Worker's
   POST /ai with the account token, the last few messages and, on play.html, only that game's summary from games.js;
   the reply streams in. Limits are the server's (15 messages a day per account; the whole site rests after its daily
   budget until 11am). History stays on this device: localStorage 'arcade-acct-ai:<lower name>' (account.js's NEVER
   pattern keeps every 'arcade-acct…' key out of the cloud sync). Text is only ever shown with textContent. */
(function () {
  if (window.ArcadeAssistant) return;
  var KEY = 'arcade-acct-ai:', KEEP = 40, SEND = 8, MAX = 500;
  var REFUSED = 'Sorry, I can’t help with that one. Ask me about a game on The Arcade!';
  var file = (location.pathname.match(/([a-z0-9-]+)\.html$/i) || [0, 'index'])[1].toLowerCase();
  var PAGE = file === 'index' ? 'home' : file;
  var panel, log, form, input, sendBtn, guestBox, sub, btn, busy = false, msgs = [], who = '';

  function A() { return window.ArcadeAccount || null; }
  function kind() { var a = A(); try { return a && a.kind ? a.kind() : ''; } catch (e) { return ''; } }
  function name() { var a = A(); try { return a && a.name ? a.name() : ''; } catch (e) { return ''; } }
  function token() { var a = A(); try { return a && a.token ? a.token() : ''; } catch (e) { return ''; } }
  function signedIn() { return kind() === 'online' && !!token(); }
  function store() { return KEY + name().toLowerCase(); }
  function load() {
    who = signedIn() ? name().toLowerCase() : '';
    msgs = [];
    if (!who) return;
    try { var x = JSON.parse(localStorage.getItem(store()) || 'null'); if (x && Array.isArray(x.m)) msgs = x.m.filter(function (m) { return m && (m.r === 'u' || m.r === 'a') && typeof m.t === 'string'; }).slice(-KEEP); } catch (e) {}
  }
  function save() { if (!who) return; try { localStorage.setItem(store(), JSON.stringify({ m: msgs.slice(-KEEP) })); } catch (e) {} }

  // only the current game's summary (play.html?game=<id>), never the whole list
  function gameInfo() {
    if (PAGE !== 'play' || !window.GAMES) return null;
    var id = new URLSearchParams(location.search).get('game'), g = null;
    for (var i = 0; i < GAMES.length; i++) if (GAMES[i].id === id) { g = GAMES[i]; break; }
    if (!g) return null;
    var keys = (g.keys || []).map(function (k) { return k[0] + ': ' + k[1]; }).join('; ');
    var text = [g.tagline, g.description, g.controls ? 'Controls: ' + g.controls + '.' : '', keys ? 'Keys: ' + keys + '.' : ''].filter(Boolean).join(' ');
    return { title: g.title, text: text.slice(0, 700) };
  }

  function css() {
    if (document.getElementById('aiCss')) return;
    var s = document.createElement('style'); s.id = 'aiCss';
    s.textContent =
      '#aiBtn{flex:none;display:inline-grid;place-items:center;width:36px;height:36px;margin-left:8px;border-radius:50%;border:1px solid var(--line,#ffffff22);background:rgba(255,255,255,.04);color:var(--text,#f4f4f5);font:16px/1 var(--font,system-ui);cursor:pointer;transition:border-color .15s,background .15s}' +
      '#aiBtn:hover,#aiBtn[aria-expanded=true]{border-color:var(--line-2,#ffffff33);background:rgba(255,255,255,.08)}' +
      'html:not(.mob-phone) body:not(.player)>.top #aiBtn{order:3;margin:auto 0 6px;width:44px;height:44px;font-size:19px}' +
      'html:not(.mob-phone) body:not(.player)>.top #aiBtn~#acctBtn{margin-top:0}' +
      '.mob-phone .top #aiBtn{order:3;margin-left:0}' +
      '#aiPanel{position:fixed;z-index:60;top:0;right:0;bottom:0;width:380px;max-width:100vw;display:flex;flex-direction:column;background:var(--bg-2,#0b0b0d);border-left:1px solid var(--line-2,#ffffff24);box-shadow:-30px 0 80px -20px rgba(0,0,0,.8);color:var(--text,#f4f4f5);font-family:var(--font,system-ui);transform:translateX(105%);transition:transform .28s var(--ease,ease);padding-top:env(safe-area-inset-top);padding-bottom:env(safe-area-inset-bottom)}' +
      '#aiPanel.open{transform:none}#aiPanel[hidden]{display:none}' +
      '#aiPanel .ai-hd{display:flex;align-items:center;gap:10px;padding:14px 14px 12px 18px;border-bottom:1px solid var(--line,#ffffff14)}' +
      '#aiPanel .ai-ttl{font-weight:800;font-stretch:110%;font-size:16px}#aiPanel .ai-sub{color:var(--dim,#74747f);font:500 11.5px var(--mono,monospace);margin-right:auto}' +
      '#aiPanel .ai-hd button{height:32px;padding:0 10px;border-radius:var(--radius-sm,8px);border:1px solid var(--line,#ffffff14);background:transparent;color:var(--muted,#a1a1aa);font:500 13px var(--font,system-ui);cursor:pointer}' +
      '#aiPanel .ai-hd button:hover{color:var(--text,#fff);border-color:var(--line-2,#ffffff24)}#aiPanel .ai-hd .x{width:32px;padding:0;font-size:20px;line-height:1}' +
      '#aiPanel .ai-log{flex:1;overflow-y:auto;padding:16px;display:flex;flex-direction:column;gap:10px;overscroll-behavior:contain}' +
      '#aiPanel .ai-msg{max-width:88%;padding:9px 12px;border-radius:14px;font-size:14px;line-height:1.45;white-space:pre-wrap;overflow-wrap:break-word;word-break:normal;min-width:0}' +
      '#aiPanel .ai-msg.u{align-self:flex-end;background:var(--accent,#ff5a2c);color:var(--accent-ink,#160500);border-bottom-right-radius:4px}' +
      '#aiPanel .ai-msg.a{align-self:flex-start;background:var(--panel-2,#1a1a1f);border:1px solid var(--line,#ffffff14);border-bottom-left-radius:4px}' +
      '#aiPanel .ai-msg.n{align-self:center;max-width:100%;background:transparent;color:var(--warn,#ffb224);font-size:13px;text-align:center}' +
      '#aiPanel .ai-msg.wait::after{content:"…";animation:aiDots 1s infinite}@keyframes aiDots{50%{opacity:.2}}' +
      '#aiPanel .ai-hi{color:var(--muted,#a1a1aa);font-size:14px;line-height:1.5;margin:auto 0;text-align:center;padding:0 10px}#aiPanel .ai-hi b{display:block;color:var(--text,#fff);font-size:20px;margin-bottom:6px}' +
      '#aiPanel .ai-guest{margin:auto;padding:24px;text-align:center}#aiPanel .ai-guest[hidden]{display:none}#aiPanel .ai-guest p{margin:0 0 14px;color:var(--muted,#a1a1aa);font-size:15px}' +
      '#aiPanel .ai-guest button,#aiPanel .ai-send{height:40px;padding:0 16px;border-radius:var(--radius,12px);border:0;background:var(--accent,#ff5a2c);color:var(--accent-ink,#160500);font:700 14px var(--font,system-ui);cursor:pointer}' +
      '#aiPanel .ai-guest button:hover,#aiPanel .ai-send:hover{background:var(--accent-hi,#ff6d43)}#aiPanel .ai-send:disabled{opacity:.5;cursor:default}' +
      '#aiPanel form{display:flex;gap:8px;align-items:flex-end;padding:12px 14px 6px;border-top:1px solid var(--line,#ffffff14)}#aiPanel form[hidden]{display:none}' +
      '#aiPanel textarea{flex:1;min-height:40px;max-height:120px;resize:none;padding:10px 12px;border-radius:var(--radius,12px);border:1px solid var(--line-2,#ffffff24);background:var(--panel,#121215);color:var(--text,#fff);font:14px/1.35 var(--font,system-ui);outline:none}' +
      '#aiPanel textarea:focus{border-color:var(--accent,#ff5a2c)}' +
      '#aiPanel .ai-foot{padding:4px 16px 12px;color:var(--dim,#74747f);font-size:11.5px}' +
      'html.ai-open body.player{padding-right:380px;box-sizing:border-box}' +
      '@media (max-width:820px){html.ai-open body.player{padding-right:0}}' +
      '@media (max-width:620px){#aiPanel{width:100vw;border-left:0}#aiBtn{width:32px;height:32px;font-size:15px}body.player>.top{gap:8px}body.player>.top #aiBtn{margin-left:0}}' +
      '@media (max-width:340px){body.player>.top .back{font-size:0;gap:0;padding:0 10px}body.player>.top .back::before{content:"←";font-size:16px}}' +
      'html.mob-phone #aiPanel{width:100vw;border-left:0}html.mob body.player>.top #aiBtn{margin-left:0}';
    document.head.appendChild(s);
  }

  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }

  function build() {
    if (panel) return;
    css();
    panel = el('aside'); panel.id = 'aiPanel'; panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-label', 'Arcade assistant'); panel.hidden = true;
    var hd = el('div', 'ai-hd');
    hd.appendChild(el('span', 'ai-ttl', '✨ Assistant'));
    sub = el('span', 'ai-sub', ''); hd.appendChild(sub);
    var clr = el('button', 'ai-clear', 'Clear'); clr.type = 'button'; clr.title = 'Clear this chat'; clr.onclick = function () { if (busy) return; msgs = []; save(); render(); };
    var x = el('button', 'x', '×'); x.type = 'button'; x.setAttribute('aria-label', 'Close'); x.onclick = close;
    hd.appendChild(clr); hd.appendChild(x);
    log = el('div', 'ai-log'); log.setAttribute('aria-live', 'polite');
    guestBox = el('div', 'ai-guest'); guestBox.hidden = true;
    guestBox.appendChild(el('p', '', 'Sign in to use the assistant'));
    var si = el('button', '', 'Sign in'); si.type = 'button';
    si.onclick = function () { close(); var a = A(); if (a && a.welcome) a.welcome(); else if (a && a.open) a.open(); };
    guestBox.appendChild(si);
    form = el('form');
    input = el('textarea'); input.rows = 1; input.maxLength = MAX; input.placeholder = 'Ask about a game or the site…'; input.setAttribute('aria-label', 'Message');
    sendBtn = el('button', 'ai-send', 'Send'); sendBtn.type = 'submit';
    form.appendChild(input); form.appendChild(sendBtn);
    form.onsubmit = function (e) { e.preventDefault(); send(); };
    input.addEventListener('keydown', function (e) { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); send(); } });
    input.addEventListener('input', function () { input.style.height = 'auto'; input.style.height = Math.min(120, input.scrollHeight) + 'px'; });
    var foot = el('div', 'ai-foot', 'The assistant can get things wrong. Never share personal details.');
    panel.appendChild(hd); panel.appendChild(log); panel.appendChild(guestBox); panel.appendChild(form); panel.appendChild(foot);
    document.body.appendChild(panel);
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && isOpen()) { e.stopPropagation(); close(); } }, true);
  }

  function render() {
    var on = signedIn();
    guestBox.hidden = on; form.hidden = !on; log.hidden = !on;
    log.textContent = '';
    if (!on) { sub.textContent = ''; return; }
    if (!msgs.length) {
      var hi = el('div', 'ai-hi'); hi.appendChild(el('b', '', 'Hi! I’m The Arcade’s helper.'));
      hi.appendChild(document.createTextNode(PAGE === 'play' ? 'Ask me how to play this game, its controls, or for a tip.' : 'Ask me about any game here, or how the site works.'));
      log.appendChild(hi);
    }
    msgs.forEach(function (m) { log.appendChild(el('div', 'ai-msg ' + m.r, m.t)); });
    log.scrollTop = log.scrollHeight;
  }
  function note(text) { var n = el('div', 'ai-msg n', text); log.appendChild(n); log.scrollTop = log.scrollHeight; }

  function isOpen() { return !!panel && !panel.hidden; }
  function open() {
    build(); load(); render();
    panel.hidden = false;
    document.documentElement.classList.add('ai-open');
    if (btn) btn.setAttribute('aria-expanded', 'true');
    requestAnimationFrame(function () { panel.classList.add('open'); });
    setTimeout(function () { var f = signedIn() ? input : guestBox.querySelector('button'); try { f.focus({ preventScroll: true }); } catch (e) {} }, 60);
  }
  function close() {
    if (!isOpen()) return;
    panel.classList.remove('open');
    document.documentElement.classList.remove('ai-open');
    if (btn) { btn.setAttribute('aria-expanded', 'false'); }
    setTimeout(function () { if (!panel.classList.contains('open')) panel.hidden = true; }, 280);
    if (btn && document.activeElement && panel.contains(document.activeElement)) try { btn.focus({ preventScroll: true }); } catch (e) {}
  }

  async function send() {
    if (busy) return;
    var text = input.value.replace(/\s+/g, ' ').trim().slice(0, MAX);
    if (!text) return;
    if (!signedIn()) { render(); return; }
    if (name().toLowerCase() !== who) load();
    var hi = log.querySelector('.ai-hi'); if (hi) hi.remove();
    input.value = ''; input.style.height = '';
    msgs.push({ r: 'u', t: text }); save();
    log.appendChild(el('div', 'ai-msg u', text));
    var bubble = el('div', 'ai-msg a wait', ''); log.appendChild(bubble); log.scrollTop = log.scrollHeight;
    busy = true; sendBtn.disabled = true;
    var reply = '', done = null, base = (A() && A().server) || 'https://arcade-realtime.arcade-realtime.workers.dev';
    try {
      var res = await fetch(base + '/ai', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: 'Bearer ' + token() },
        body: JSON.stringify({ p: PAGE, g: gameInfo(), msgs: msgs.slice(-SEND) })
      });
      if (!res.ok || !/event-stream/.test(res.headers.get('content-type') || '')) {
        var j = await res.json().catch(function () { return {}; });
        bubble.remove(); msgs.pop(); save();
        if (j.error === 'auth') { render(); guestBox.hidden = false; form.hidden = true; log.hidden = true; }
        else note(j.t || 'The assistant couldn’t answer just now. Try again in a moment.');
        if (j.error === 'limit') sub.textContent = '0 left today';
        return;
      }
      var rd = res.body.getReader(), dec = new TextDecoder(), buf = '';
      for (;;) {
        var r = await rd.read(); if (r.done) break;
        buf += dec.decode(r.value, { stream: true });
        var i;
        while ((i = buf.indexOf('\n')) >= 0) {
          var line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
          if (line.indexOf('data:') !== 0) continue;
          var x; try { x = JSON.parse(line.slice(5)); } catch (e) { continue; }
          if (typeof x.t === 'string') { reply += x.t; bubble.classList.remove('wait'); bubble.textContent = reply; log.scrollTop = log.scrollHeight; }
          if (x.done) done = x;
        }
      }
    } catch (e) {
      if (!reply) { bubble.remove(); msgs.pop(); save(); note('Couldn’t reach the assistant. Check your connection and try again.'); }
    } finally {
      busy = false; sendBtn.disabled = false;
    }
    if (!bubble.isConnected) return;
    bubble.classList.remove('wait');
    if (done && done.blocked) reply = REFUSED;
    else if (!reply.trim()) reply = 'Hmm, I didn’t get an answer that time. Try asking again!';
    bubble.textContent = reply;
    msgs.push({ r: 'a', t: reply }); save();
    if (done && typeof done.left === 'number') sub.textContent = done.left + ' left today';
    log.scrollTop = log.scrollHeight;
  }

  function addButton() {
    var top = document.querySelector('header.top'); if (!top) return false;
    if (document.getElementById('aiBtn')) return true;
    css();
    btn = el('button', '', '✨'); btn.id = 'aiBtn'; btn.type = 'button';
    btn.title = 'Assistant'; btn.setAttribute('aria-label', 'Open the assistant'); btn.setAttribute('aria-expanded', 'false');
    btn.onclick = function () { if (isOpen()) close(); else open(); };
    var acct = document.getElementById('acctBtn');
    if (acct && acct.parentNode === top) top.insertBefore(btn, acct); else top.appendChild(btn);
    return true;
  }
  function start() {
    if (!addButton()) return;
    // account.js adds its button on start too: keep ✨ just before it whichever comes first
    var tries = 0, t = setInterval(function () {
      var acct = document.getElementById('acctBtn'), top = document.querySelector('header.top');
      if (acct && btn && acct.parentNode === top && btn.nextSibling !== acct) top.insertBefore(btn, acct);
      if (acct || ++tries > 20) clearInterval(t);
    }, 250);
    if (A() && A().onLive) A().onLive(function (m) { if (m && m.t === 'renamed' && isOpen()) { load(); render(); } });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();

  window.ArcadeAssistant = { open: open, close: close, isOpen: isOpen };
})();
