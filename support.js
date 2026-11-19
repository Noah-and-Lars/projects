/* support.js (2026-11-19): the Support page and its sub-pages (release-notes.html, tester.html).
   Loaded after games.js and account.js. Each part only runs when its element is on the page.
   - Status (#spStatus): asks the Worker's public /notice route once (the same check outage.js makes) and follows
     ArcadeOutage, so Support says at the top when the servers are down or paused for the day.
   - Help centre (#spHelp): short searchable answers (ARTICLES below). Keep them true to how the site works.
   - Contact (#spContact): a category picker; each category names who reads it (a role, never a person) and opens
     the right Google Form, pre-filled. The site has no email or other contact details (the owner's rule).
   - Bug report (#spBug): fills in device info by itself (browser, system, screen, layout, account kind, the game's
     version from NEWS in games.js), gives a copyable summary and opens the feedback Google Form pre-filled with it.
   - My reports (#spTix): reports filed from here, kept in localStorage 'arcade-support-reports' (not in account.js's
     NEVER list, so it syncs with the account in 'misc'). Status is Received until the server can store tickets:
     SERVER.tickets below turns on the server part once the Worker has the routes (see the comment there).
   - Feature voting (#spVotes): one vote per idea per device/account ('arcade-support-votes', synced in 'misc').
     Totals from everyone need a server route (SERVER.votes); until then only your own votes show.
   - Known issues (#spIssues): KNOWN below, per game. Only issues we really know about; update it when they change.
   - Release notes (#rnList on release-notes.html): every NEWS entry, newest first, filter by game.
   - Tester quiz (#tqQuiz on tester.html): a short quiz before the game tester Google Form. */
(function () {
  if (window.ArcadeSupport) return;
  var $ = function (id) { return document.getElementById(id); };
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
  var ls = {
    get: function (k, d) { try { var v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set: function (k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  };
  var GAMES = window.GAMES || [], NEWS = window.NEWS || [];
  var gameById = function (id) { for (var i = 0; i < GAMES.length; i++) if (GAMES[i].id === id) return GAMES[i]; return null; };

  /* ---------- server parts that don't exist yet ----------
     Switch these on once the private Worker (Noah-and-Lars/arcade-realtime) has the routes. Until then nothing here
     calls the server for them, so they cost nothing.
     tickets: POST /support/report {id, g, v, s} (optional Bearer token) stores a ticket {st:'received', at, by};
              POST /support/tickets {ids:[...]} -> {list:[{id, st, note, at}]}; admin op 'ticketset' {id, st, note}
              (st = received | looking | fixed) for the team to update it.
     votes:   GET /support/votes (optional Bearer) -> {list:[{id, n}], mine:[ids]};
              POST /support/vote {id, on} (Bearer token required: one vote per account per idea). One Tally object
              'support-votes': 'v:<idea id>' = { voters: { lower name: 1 } }, ids checked against /^[a-z0-9-]{2,32}$/. */
  var SERVER = { tickets: false, votes: false };
  var api = function (path, opt) {
    var A = window.ArcadeAccount; if (!A || !A.server) return Promise.reject(new Error('no server'));
    opt = opt || {};
    var h = { 'content-type': 'application/json' }, t = A.token && A.token(); if (t) h.authorization = 'Bearer ' + t;
    return fetch(A.server + path, { method: opt.method || 'GET', headers: h, body: opt.body ? JSON.stringify(opt.body) : undefined }).then(function (r) { return r.json(); });
  };

  /* ---------- the Google Forms (entry ids read from each form) ---------- */
  var FORMS = {
    feedback: { url: 'https://docs.google.com/forms/d/e/1FAIpQLSeOQOSz6bS6-2aBxjDZSSdxpBYECQlmbnOWhmeAk34R3wU-7g/viewform',
      type: 'entry.86989797', bug: 'entry.1636958107', update: 'entry.705112754', newGame: 'entry.308483926' },
    tester: { url: 'https://docs.google.com/forms/d/e/1FAIpQLScRRLtCvERDPKOwirvIU6wiKfjw2f6LrIRz43iTdZ9hRYqnCg/viewform',
      user: 'entry.1949565669', why: 'entry.722374714' },
    dev: { url: 'https://docs.google.com/forms/d/e/1FAIpQLSeb-tJoOAOTlLPfvIURxqCWMsid596ekZ1O1DCfpFkJEWJmeg/viewform',
      user: 'entry.560464614' }
  };
  function formUrl(base, fields) {
    var q = [], keys = Object.keys(fields || {});
    keys.forEach(function (k) { if (fields[k]) q.push(k + '=' + encodeURIComponent(fields[k])); });
    return q.length ? base + '?usp=pp_url&' + q.join('&') : base;
  }
  // a pre-filled form link must stay short enough for every browser
  function clip(s, n) { s = String(s || ''); return s.length > n ? s.slice(0, n - 1) + '…' : s; }

  /* ---------- account ---------- */
  function who() {
    var A = window.ArcadeAccount, k = '', n = '';
    try { k = A && A.kind ? A.kind() : ''; n = A && A.name ? A.name() : ''; } catch (e) {}
    return { kind: k || 'guest', name: k === 'online' ? n : '' };
  }

  /* ---------- a game's version, from its newest NEWS entry ---------- */
  function reEsc(s) { return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
  function gameVersion(id) {
    var g = gameById(id); if (!g) return '';
    var re = new RegExp(reEsc(g.title) + '(?:\\s+Beta)?\\s+v?(\\d+(?:\\.\\d+)+)');
    for (var i = 0; i < NEWS.length; i++) {
      var n = NEWS[i]; if (n.game !== id) continue;
      var m = re.exec(n.headline || '') || re.exec(n.text || '');
      if (m) return m[1];
    }
    return '';
  }
  function gameLabel(id) {
    var g = gameById(id); if (!g) return '';
    var v = gameVersion(id);
    return g.title + (v ? ' ' + v : '') + (g.badge ? ' (' + g.badge.toLowerCase() + ')' : '');
  }

  /* ---------- device info ---------- */
  function browser(ua) {
    var m;
    if ((m = /Edg(?:e|A|iOS)?\/(\d+)/.exec(ua))) return 'Edge ' + m[1];
    if ((m = /OPR\/(\d+)/.exec(ua))) return 'Opera ' + m[1];
    if ((m = /SamsungBrowser\/(\d+)/.exec(ua))) return 'Samsung Internet ' + m[1];
    if ((m = /(?:Firefox|FxiOS)\/(\d+)/.exec(ua))) return 'Firefox ' + m[1];
    if ((m = /CriOS\/(\d+)/.exec(ua))) return 'Chrome ' + m[1] + ' (iOS)';
    if ((m = /Electron\/([\d.]+)/.exec(ua))) return 'Electron ' + m[1];
    if ((m = /Chrome\/(\d+)/.exec(ua))) return 'Chrome ' + m[1];
    if ((m = /Version\/([\d.]+).*Safari/.exec(ua))) return 'Safari ' + m[1];
    if (/Safari/.test(ua)) return 'Safari';
    return 'Unknown browser';
  }
  function system(ua) {
    var m;
    if (/PlayStation/.test(ua)) return 'PlayStation';
    if (/Xbox/.test(ua)) return 'Xbox';
    if (/Nintendo/.test(ua)) return 'Nintendo';
    if (/Tizen|Web0S|webOS|SmartTV|SMART-TV/i.test(ua)) return 'Smart TV';
    if ((m = /(iPhone|iPad|iPod).*?OS (\d+(?:_\d+)*)/.exec(ua))) return (m[1] === 'iPad' ? 'iPadOS ' : 'iOS ') + m[2].replace(/_/g, '.');
    if (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1) return 'iPadOS';
    if ((m = /Android (\d+(?:\.\d+)?)/.exec(ua))) return 'Android ' + m[1];
    if (/CrOS/.test(ua)) return 'ChromeOS';
    if ((m = /Windows NT (\d+\.\d+)/.exec(ua))) return 'Windows ' + ({ '10.0': '10 or 11', '6.3': '8.1', '6.2': '8', '6.1': '7' }[m[1]] || 'NT ' + m[1]);
    if ((m = /Mac OS X (\d+[._]\d+(?:[._]\d+)?)/.exec(ua))) return 'macOS ' + m[1].replace(/_/g, '.');
    if (/Linux/.test(ua)) return 'Linux';
    return 'Unknown system';
  }
  function layout() {
    var c = document.documentElement.classList, out = [];
    if (c.contains('watch')) out.push('watch');
    else if (c.contains('console')) out.push('console/TV');
    else if (c.contains('mob-phone')) out.push('phone');
    else if (c.contains('mob-tab')) out.push('tablet');
    else out.push('computer');
    if (window.ARCADE_APP) out.push('Arcade app ' + (window.ARCADE_APP.version || '') + (window.ARCADE_APP.os ? ' (' + window.ARCADE_APP.os + ')' : ''));
    return out.join(', ');
  }
  function siteVersion() {
    var s = document.querySelector('script[src*="games.js"]'), m = s && /[?&]v=(\d+)/.exec(s.getAttribute('src') || '');
    return m ? 'games.js v' + m[1] : '';
  }
  function serverState() {
    var O = window.ArcadeOutage;
    if (O && O.down && O.down()) return 'down';
    return status.state === 'ok' ? 'up' : status.state === 'down' ? 'down' : 'not checked';
  }
  function deviceInfo(gameId) {
    var ua = navigator.userAgent || '', w = who(), lines = [];
    if (gameId) lines.push('Game: ' + (gameLabel(gameId) || gameId) + ' [' + gameId + ']');
    lines.push('Browser: ' + browser(ua));
    lines.push('System: ' + system(ua));
    try { lines.push('Screen: ' + screen.width + 'x' + screen.height + ' @' + (Math.round((window.devicePixelRatio || 1) * 100) / 100) + 'x, window ' + window.innerWidth + 'x' + window.innerHeight); } catch (e) {}
    lines.push('Touch: ' + (navigator.maxTouchPoints > 0 || 'ontouchstart' in window ? 'yes' : 'no') + ', layout: ' + layout());
    lines.push('Account: ' + (w.kind === 'online' ? 'online (' + w.name + ')' : w.kind === 'local' ? 'local account' : 'no account'));
    lines.push('Site: ' + location.host + (siteVersion() ? ', ' + siteVersion() : '') + ', servers ' + serverState());
    try { lines.push('Language: ' + (navigator.language || '?') + ', time: ' + new Date().toISOString().slice(0, 16).replace('T', ' ') + ' UTC'); } catch (e) {}
    lines.push('User agent: ' + ua);
    return lines.join('\n');
  }

  function toast(t) {
    var d = document.createElement('div'); d.className = 'sp-toast'; d.setAttribute('role', 'status'); d.textContent = t;
    document.body.appendChild(d); setTimeout(function () { d.remove(); }, 2600);
  }
  function copy(text) {
    var done = function () { toast('Copied'); };
    if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(text).then(done, function () { fallback(); });
    fallback();
    function fallback() {
      var t = document.createElement('textarea'); t.value = text; t.style.position = 'fixed'; t.style.opacity = '0'; document.body.appendChild(t); t.select();
      try { document.execCommand('copy'); done(); } catch (e) { toast('Select the text and copy it'); }
      t.remove();
    }
  }
  function gameOptions(sel, first) {
    var list = GAMES.slice().sort(function (a, b) { return a.title.localeCompare(b.title); });
    sel.innerHTML = (first ? '<option value="">' + esc(first) + '</option>' : '') + list.map(function (g) { return '<option value="' + esc(g.id) + '">' + esc(g.title) + '</option>'; }).join('');
  }

  /* =================================================================================================== */
  /* Status                                                                                              */
  /* =================================================================================================== */
  var status = { state: 'checking', limit: false };
  var WORKER_NOTICE = 'https://arcade-realtime.arcade-realtime.workers.dev/notice';
  function resetAt() { var d = new Date(); d.setUTCHours(24, 0, 0, 0); try { return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }); } catch (e) { return 'midnight UTC'; } }
  function drawStatus() {
    var el = $('spStatus'); if (!el) return;
    var O = window.ArcadeOutage, down = (O && O.down && O.down()) || status.state === 'down', cls, b, s;
    if (down) {
      cls = 'down';
      b = status.limit ? 'The servers are paused for the day' : 'The Arcade’s servers are down right now';
      s = (status.limit ? 'They hit their daily limit and come back at about ' + resetAt() + '. ' : 'We know, and it isn’t your internet. ') +
        'Online play, chat, Social and signing in won’t work until they’re back. Offline games still work, and your progress is saved on this device and syncs later. Please don’t log out or clear your browser until then.';
    } else if (status.state === 'ok') {
      cls = 'ok'; b = 'Everything is working'; s = 'Online play, chat, Social and accounts are up.';
    } else if (status.state === 'checking') {
      cls = 'unk'; b = 'Checking the servers…'; s = '';
    } else {
      cls = 'unk'; b = 'We couldn’t check the servers from here';
      s = 'If online games won’t connect, check your internet first. If the servers themselves are down, a red banner shows at the top of every page.';
    }
    el.className = 'sp-status ' + cls;
    el.innerHTML = '<i class="dot" aria-hidden="true"></i><div><b>' + esc(b) + '</b>' + (s ? '<span>' + esc(s) + '</span>' : '') + '</div>';
  }
  function initStatus() {
    if (!$('spStatus')) return;
    drawStatus();
    var t = setTimeout(function () { if (status.state === 'checking') { status.state = 'unknown'; drawStatus(); } }, 9000);
    fetch(WORKER_NOTICE + '?t=' + Date.now(), { cache: 'no-store' }).then(function (r) {
      if (r.status >= 500) { status.state = 'unknown'; return; }
      return r.json().then(function (j) {
        status.limit = !!(j && j.de === 2);
        status.state = j && j.de ? 'down' : 'ok';
      }, function () { status.state = 'ok'; });
    }, function () { status.state = 'unknown'; }).then(function () { clearTimeout(t); drawStatus(); if (status.state === 'down' && window.ArcadeOutage) window.ArcadeOutage.hint(); });
    if (window.ArcadeOutage && window.ArcadeOutage.onChange) window.ArcadeOutage.onChange(function (v) { if (!v && status.state === 'down') status.state = 'ok'; drawStatus(); });
  }

  /* =================================================================================================== */
  /* Help centre                                                                                         */
  /* =================================================================================================== */
  var CATS = [['all', 'All'], ['accounts', 'Accounts'], ['saves', 'Saves'], ['online', 'Online play'], ['controls', 'Controls'], ['app', 'The app'], ['social', 'Chat & friends']];
  var ARTICLES = [
    { id: 'make-account', cat: 'accounts', q: 'How do I make an account?', tags: 'sign up register create username password',
      a: '<p>Press the account button (top right on a phone, at the bottom of the left rail on a computer) and choose <b>Create account</b>. Pick a username and a password. You don’t need an email address.</p>' +
        '<ul><li>Usernames are 3 to 16 letters, numbers or <b>_</b>. Capital letters don’t count, so <i>Sam</i> and <i>sam</i> are the same name.</li><li>Your username is public, so don’t use your real name.</li><li>Rude and reserved names are refused.</li></ul>' +
        '<p>Right after, you get a <b>recovery code</b>. Write it down or screenshot it: it’s the only way back in if you forget your password.</p>' },
    { id: 'forgot-password', cat: 'accounts', q: 'I forgot my password', tags: 'reset recovery code login locked out can\'t sign in',
      a: '<p>Open the account button, choose <b>Log in</b>, then <b>Forgot your password?</b>. Type your username and your recovery code, then pick a new password. You get a <b>new</b> recovery code after that, so save the new one.</p>' +
        '<p>Lost the recovery code too? The admins can make you a new one. Use <a href="#spContact" data-cat="account">Contact → Account help</a> and give your username. Never send your password to anyone, us included.</p>' +
        '<p>Too many wrong passwords locks the account for a little while. Wait and try again.</p>' },
    { id: 'recovery-code', cat: 'accounts', q: 'What is a recovery code?', tags: 'recovery code lost show again',
      a: '<p>It’s a one-time code shown when you make your account (and again after each password reset). With it you can set a new password if you forget yours.</p>' +
        '<p>We only keep a scrambled copy of it, so nobody, not even the admins, can show you your old code again. If you lose it, an admin can make a new one for you.</p>' },
    { id: 'change-name', cat: 'accounts', q: 'Can I change my username or password?', tags: 'rename username change password delete account',
      a: '<p>Yes. Open the account button: <b>Change username</b> works once a week, and <b>Change password</b> asks for your current password. Changing your name keeps your progress, friends and messages.</p>' +
        '<p><b>Delete my account</b> is in the same panel. It asks for your password and can’t be undone; this device keeps a local copy of your progress.</p>' },
    { id: 'local-account', cat: 'accounts', q: 'What is a local account?', tags: 'local account offline no account guest',
      a: '<p>A local account is just a name saved in this browser. Nothing goes to our servers, but:</p>' +
        '<ul><li>You can’t play online, add friends or send private messages.</li><li>Your progress lives only in this browser. Clearing your browser data or switching device loses it for good.</li></ul>' +
        '<p>You can turn it into an online account any time from the account button; your progress on this device comes with you.</p>' },
    { id: 'cloud-saves', cat: 'saves', q: 'How do cloud saves work?', tags: 'sync progress save another device lost progress',
      a: '<p>Games save in your browser. When you’re signed in to an online account, The Arcade copies those saves to your account: when a page opens, about every 45 seconds while something changed, and when you leave a page. <b>Sync now</b> in the account panel does it straight away.</p>' +
        '<p>Sign in on another device and your progress is there. If a game changed on both devices, the copy with more progress wins.</p>' +
        '<p>Logging out clears this device’s copy; it stays safe in your account.</p>' },
    { id: 'lost-progress', cat: 'saves', q: 'My progress is gone', tags: 'lost progress missing save reset',
      a: '<ol><li>Check you’re signed in to the same account (the account button shows the name).</li><li>Open the account panel and press <b>Sync now</b>, then reload the game.</li>' +
        '<li>The Arcade is on two addresses, thearcade.pages.dev and noah-and-lars.github.io. Your browser keeps them apart, so sign in on each one.</li>' +
        '<li>With a local account, progress only lives in that browser. If its data was cleared, it can’t be brought back.</li></ol>' +
        '<p>Still missing? <a href="#spBug">Send a bug report</a> and say which game.</p>' },
    { id: 'online-cant-connect', cat: 'online', q: 'Online play won’t connect', tags: 'multiplayer offline connect error room join',
      a: '<ol><li>Online play needs an <b>online account</b>. Guests and local accounts play offline, and the game asks you to sign in.</li>' +
        '<li>Look at the status at the top of this page. When the servers are down or have hit their daily limit, online play stops for everyone until they’re back (the daily limit resets at midnight UTC).</li>' +
        '<li>School and work networks sometimes block online games. Try another network if you can.</li>' +
        '<li>Reload the game. Some games only let the newest version play online.</li></ol>' },
    { id: 'online-disconnect', cat: 'online', q: 'Why did I get disconnected?', tags: 'disconnect kicked idle hidden tab',
      a: '<p>To keep the servers free, a tab that has been hidden for 15 minutes quietly disconnects from online play, chat and messages. It reconnects by itself when you come back to it.</p>' +
        '<p>In games where one player hosts the match, the match can slow down or pause if the host switches tabs or leaves; another player takes over in most games.</p>' },
    { id: 'controllers', cat: 'controls', q: 'Can I use a controller?', tags: 'gamepad controller xbox playstation joystick',
      a: '<p>Yes, in games that read a controller: Football, Havoc Bay, Poly Racer, Rocket Rivals, Sproutling, Storm Drop and Turn! Turn! TURN!. Plug it in or pair it, then press a button so the browser notices it.</p>' +
        '<p>Every game’s play page shows its keys under <b>How to play</b>.</p>' +
        '<p>No controller? On a computer, the <b>Phone</b> button on a game’s play page shows a QR code: scan it and your phone becomes a controller (up to 4 phones).</p>' },
    { id: 'console-mode', cat: 'controls', q: 'Playing on a TV or games console', tags: 'console tv playstation xbox nintendo remote big screen',
      a: '<p>Open the site in the browser on a PlayStation, Xbox, Nintendo console or smart TV and it switches to the console version by itself (a banner at the top says so). It has bigger cards and buttons.</p>' +
        '<ul><li>D-pad, stick or arrow keys to move around</li><li>A / ✕ / OK to choose, B / ○ / Back to go back</li><li>L1 / R1 to switch tabs</li></ul>' +
        '<p>Want the normal site? Press <b>Full website</b> at the top. You can turn the console version on anywhere by adding <b>?console=on</b> to the address.</p>' },
    { id: 'phone-tablet', cat: 'controls', q: 'Playing on a phone or tablet', tags: 'touch mobile ipad iphone android',
      a: '<p>The site has its own phone and tablet layout. Many games have touch controls; the bigger 3D games play best on a computer. If a game shows keyboard keys only under <b>How to play</b>, it needs a keyboard.</p>' },
    { id: 'app-install', cat: 'app', q: 'How do I get The Arcade app?', tags: 'app download mac windows chromebook install',
      a: '<p>Open the <b>Software</b> tab. There are apps for Mac (Apple chip and Intel), Windows, Chromebook, and older versions for Windows 7/8/8.1 and macOS 10.9 to 10.12 in the Legacy section. Sign in with your Arcade account and your progress is there.</p>' },
    { id: 'app-warning', cat: 'app', q: 'My computer warns me about the app', tags: 'smartscreen gatekeeper unverified damaged open anyway',
      a: '<p>The apps aren’t signed with a paid certificate yet, so your computer warns you the first time.</p>' +
        '<ul><li><b>Windows:</b> when SmartScreen says “Windows protected your PC”, click <b>More info</b>, then <b>Run anyway</b>.</li>' +
        '<li><b>Mac:</b> if it says Apple “could not verify” the app, click <b>Done</b>, open <b>System Settings → Privacy &amp; Security</b> and click <b>Open Anyway</b>. On older macOS you can right-click the app and choose <b>Open</b>.</li></ul>' +
        '<p>A Mac app downloaded before 18 November that said it was “damaged” was a broken copy: download it again.</p>' },
    { id: 'chat-rules', cat: 'social', q: 'How does the Global chat work?', tags: 'chat global guest mute rules swear',
      a: '<p>Anyone can chat, even without an account (guests are marked “guest”). Signed-in players chat under their account name.</p>' +
        '<ul><li>You can send 5 messages every 10 seconds.</li><li>Messages are <b>not</b> swear-filtered; usernames are.</li><li><b>Mute</b> hides someone’s messages on your device. You can also hide the chat history.</li><li>Admins can delete messages.</li></ul>' +
        '<p>Someone breaking the rules? <a href="#spContact" data-cat="player">Report them</a>.</p>' },
    { id: 'friends-dms', cat: 'social', q: 'Friends, messages and blocking', tags: 'friend request dm private message block group chat call',
      a: '<p>On the <b>Players</b> tab, open someone’s profile to add them as a friend, message them, or video call them. Group chats can have up to 15 people.</p>' +
        '<p><b>Block</b> on their profile stops them messaging you, calling you or sending friend requests. They aren’t told. Local accounts can’t use friends or messages.</p>' },
    { id: 'clips', cat: 'social', q: 'How do I record a clip?', tags: 'clip record video social post f8',
      a: '<p>While playing, press <b>🎬 Clip</b> on the play page (or F8) to save the last 30 seconds. You can post it to Social; game clips go up straight away. Other photos and videos you upload wait for an admin to approve them.</p>' +
        '<p>Older browsers record with start and stop instead, up to 60 seconds.</p>' },
    { id: 'servers-down', cat: 'online', q: 'What happens when the servers are down?', tags: 'outage down banner red limit',
      a: '<p>A red banner shows at the top of every page. Offline games keep working, and everything you do is saved on your device and synced to your account when the servers are back.</p>' +
        '<p>Please don’t log out or clear your browser during an outage. If the banner says the servers hit their daily limit, they come back at midnight UTC (it shows the time where you are).</p>' },
    { id: 'assistant', cat: 'accounts', q: 'What is the Assistant?', tags: 'ai assistant chat bot help',
      a: '<p>The chat bubble button opens the Assistant, an AI helper for questions about the games and anything else. It needs an online account, and there’s a limit on how much you can use it each session and each day. Replies are checked by a safety filter.</p>' }
  ];
  function norm(s) { return String(s || '').toLowerCase().replace(/<[^>]+>/g, ' ').replace(/[’']/g, '').replace(/[^a-z0-9 ]+/g, ' '); }
  ARTICLES.forEach(function (a) { a._t = norm(a.q + ' ' + a.tags + ' ' + a.a); });
  function initHelp() {
    var box = $('spHelp'); if (!box) return;
    var input = $('spHelpQ'), chips = $('spHelpCats'), list = $('spHelpList'), cat = 'all', all = false, FIRST = 6;
    chips.innerHTML = CATS.map(function (c) { return '<button type="button" class="sp-chip" data-c="' + c[0] + '" aria-pressed="' + (c[0] === 'all') + '">' + esc(c[1]) + '</button>'; }).join('');
    chips.addEventListener('click', function (e) {
      var b = e.target.closest('button[data-c]'); if (!b) return;
      cat = b.getAttribute('data-c');
      [].forEach.call(chips.children, function (x) { x.setAttribute('aria-pressed', String(x === b)); });
      draw();
    });
    function draw() {
      var words = norm(input.value).split(' ').filter(Boolean), shown = 0;
      var html = ARTICLES.filter(function (a) {
        if (cat !== 'all' && a.cat !== cat) return false;
        return words.every(function (w) { return a._t.indexOf(w) >= 0; });
      }).map(function (a) {
        shown++;
        var c = CATS.filter(function (x) { return x[0] === a.cat; })[0];
        return '<details class="sp-art" id="help-' + a.id + '"' + (words.length && shown <= 2 ? ' open' : '') + '><summary>' + esc(a.q) + '<small>' + esc(c ? c[1] : '') + '</small></summary><div class="body">' + a.a + '</div></details>';
      }).join('');
      var more = !all && cat === 'all' && !words.length && shown > FIRST;
      if (more) html = html.split('</details>').slice(0, FIRST).join('</details>') + '</details><button type="button" class="sp-btn ghost small" id="spHelpMore" style="align-self:flex-start">Show all ' + shown + ' answers</button>';
      list.innerHTML = html || '<p class="sp-empty">No answers match that. Try fewer words, or <a href="#spContact">ask us</a>.</p>';
      if (more) $('spHelpMore').onclick = function () { all = true; draw(); var d = list.children[FIRST]; if (d) d.querySelector('summary').focus(); };
      $('spHelpN').textContent = shown + (shown === 1 ? ' answer' : ' answers');
    }
    input.addEventListener('input', draw);
    draw();
    var m = /^#help-([\w-]+)$/.exec(location.hash);
    if (m) { all = true; draw(); var d = $('help-' + m[1]); if (d) { d.open = true; setTimeout(function () { d.scrollIntoView({ block: 'center' }); }, 100); } }
  }

  /* =================================================================================================== */
  /* My reports (ticket tracker)                                                                         */
  /* =================================================================================================== */
  var TKEY = 'arcade-support-reports', STEPS = [['received', 'Received'], ['looking', 'Looking'], ['fixed', 'Fixed']];
  function tickets() { var t = ls.get(TKEY, []); return Array.isArray(t) ? t : []; }
  function saveTickets(t) { ls.set(TKEY, t.slice(0, 40)); }
  function newId() {
    var A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789', s = 'R-', r = new Uint8Array(6);
    try { crypto.getRandomValues(r); } catch (e) { for (var i = 0; i < 6; i++) r[i] = Math.random() * 256; }
    for (var j = 0; j < 6; j++) s += A[r[j] % A.length];
    return s;
  }
  function addTicket(t) {
    var list = tickets(); list.unshift(t); saveTickets(list); drawTickets();
    if (SERVER.tickets) api('/support/report', { method: 'POST', body: { id: t.id, g: t.g, v: t.v, s: t.s } }).catch(function () {});
  }
  function drawTickets() {
    var box = $('spTixList'); if (!box) return;
    var list = tickets();
    if (!list.length) { box.innerHTML = '<p class="sp-empty">No reports from this device or account yet. Reports you send with the form above show up here.</p>'; return; }
    box.innerHTML = list.map(function (t, i) {
      var at = STEPS.findIndex(function (s) { return s[0] === t.st; }); if (at < 0) at = 0;
      var g = t.g ? (gameById(t.g) || {}).title || t.g : (t.cat || 'Report');
      return '<div class="sp-tic"><div class="top"><span class="t">' + esc(g + (t.s ? ': ' + t.s : '')) + '</span><span class="id">' + esc(t.id) + '</span></div>' +
        '<div class="sp-steps" role="img" aria-label="Status: ' + esc(STEPS[at][1]) + '">' + STEPS.map(function (s, k) { return '<span class="' + (k <= at ? 'on' : '') + '">' + esc(s[1]) + '</span>'; }).join('') + '</div>' +
        '<div class="meta"><span>Sent ' + esc(new Date(t.at).toLocaleDateString()) + '</span>' + (t.note ? '<span>' + esc(t.note) + '</span>' : '') +
        '<button type="button" data-copy="' + i + '">Copy ID</button><button type="button" data-del="' + i + '">Remove</button></div></div>';
    }).join('');
  }
  function initTickets() {
    var box = $('spTixList'); if (!box) return;
    drawTickets();
    box.addEventListener('click', function (e) {
      var b = e.target.closest('button'); if (!b) return;
      var list = tickets();
      if (b.hasAttribute('data-copy')) copy(list[+b.getAttribute('data-copy')].id);
      if (b.hasAttribute('data-del') && confirm('Remove this report from your list? It doesn’t take it back from us.')) { list.splice(+b.getAttribute('data-del'), 1); saveTickets(list); drawTickets(); }
    });
    // the account's copy arrives with a sync (it's in the 'misc' group)
    if (window.ArcadeAccount && ArcadeAccount.onPulled) ArcadeAccount.onPulled(drawTickets);
    if (SERVER.tickets && tickets().length) {
      api('/support/tickets', { method: 'POST', body: { ids: tickets().map(function (t) { return t.id; }) } }).then(function (r) {
        if (!r || !r.list) return;
        var list = tickets();
        r.list.forEach(function (s) { list.forEach(function (t) { if (t.id === s.id) { t.st = s.st; t.note = s.note || ''; } }); });
        saveTickets(list); drawTickets();
      }).catch(function () {});
    }
  }

  /* =================================================================================================== */
  /* Bug report                                                                                          */
  /* =================================================================================================== */
  function initBug() {
    var form = $('spBugForm'); if (!form) return;
    var g = $('spBugGame'), what = $('spBugWhat'), steps = $('spBugSteps'), often = $('spBugOften'), id = newId();
    gameOptions(g, 'The site itself (not a game)');
    var pre = (/[?&]game=([\w-]+)/.exec(location.search) || [])[1];
    if (pre && gameById(pre)) g.value = pre;
    function text() {
      return 'Report ID: ' + id + '\n' +
        'Game: ' + (g.value ? gameLabel(g.value) : 'The site') + '\n' +
        'What happened: ' + (what.value.trim() || '(not filled in)') + '\n' +
        (steps.value.trim() ? 'Steps: ' + steps.value.trim() + '\n' : '') +
        'How often: ' + often.value + '\n';
    }
    function draw() { $('spBugVer').textContent = g.value ? (gameVersion(g.value) ? 'Version ' + gameVersion(g.value) + ', from the latest patch notes.' : 'This game’s version number isn’t in its patch notes; the date it last updated is ' + new Date((gameById(g.value) || {}).updated || Date.now()).toLocaleDateString() + '.') : ''; }
    [g, what, steps, often].forEach(function (x) { x.addEventListener('input', draw); x.addEventListener('change', draw); });
    draw();
    if (window.ArcadeOutage && ArcadeOutage.onChange) ArcadeOutage.onChange(draw);
    $('spBugCopy').onclick = function () { copy(text()); };
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (!what.value.trim()) { what.focus(); $('spBugErr').textContent = 'Say what went wrong first.'; return; }
      $('spBugErr').textContent = '';
      var body = text();
      // long reports: the form gets the first part; the copy button has it all
      var url = formUrl(FORMS.feedback.url, (function () { var f = {}; f[FORMS.feedback.type] = 'Bug Report'; f[FORMS.feedback.bug] = clip(body, 1500); return f; })());
      window.open(url, '_blank', 'noopener');
      addTicket({ id: id, at: Date.now(), g: g.value, v: g.value ? gameVersion(g.value) : '', s: clip(what.value.trim(), 80), st: 'received', cat: 'Bug' });
      $('spBugDone').hidden = false;
      $('spBugDone').querySelector('b').textContent = id;
      what.value = ''; steps.value = ''; id = newId(); draw();
    });
  }

  /* =================================================================================================== */
  /* Contact categories                                                                                  */
  /* =================================================================================================== */
  var CONTACT = [
    { id: 'bug', t: 'Something’s broken', s: 'A bug in a game or the site', to: 'The developers',
      p: 'Use the bug report form: it fills in your device and the game version for us, and you can follow it under My reports.', go: 'bug' },
    { id: 'idea', t: 'An idea for a game', s: 'Something to add or change', to: 'The developers',
      p: 'Tell us the game and what you’d add. Bigger ideas for the whole site can go on the voting board too.', form: function (w) { var f = {}; f[FORMS.feedback.type] = 'Game Update Suggestion'; f[FORMS.feedback.update] = 'Game: \nIdea: '; return formUrl(FORMS.feedback.url, f); } },
    { id: 'newgame', t: 'A new game idea', s: 'A game you want on The Arcade', to: 'The developers',
      p: 'Describe the game: how you play it, and whether it’s single player or online.', form: function () { var f = {}; f[FORMS.feedback.type] = 'New Game Suggestion'; return formUrl(FORMS.feedback.url, f); } },
    { id: 'account', t: 'Account help', s: 'Can’t log in, lost recovery code', to: 'The site admins',
      p: 'First try Log in → Forgot your password? with your recovery code. If you lost the code, the admins can make you a new one: give your username and a way to reach you on The Arcade (like a friend’s account). Never send your password.',
      form: function (w) { var f = {}; f[FORMS.feedback.type] = 'Bug Report'; f[FORMS.feedback.bug] = '[Account help]\nUsername: ' + (w.name || '') + '\nWhat’s wrong: \nHow we can reach you on The Arcade: '; return formUrl(FORMS.feedback.url, f); } },
    { id: 'player', t: 'Report a player', s: 'Bullying, threats, scams, rude names', to: 'The site admins',
      p: 'Say who (their username), where (Global chat, private messages, Social, or which game), when, and what happened. If someone is in danger, tell a trusted adult straight away. On Social you can also use Report on a post, and on the Players tab you can Block someone.',
      form: function (w) { var f = {}; f[FORMS.feedback.type] = 'Bug Report'; f[FORMS.feedback.bug] = '[Player report]\nTheir username: \nWhere: \nWhen: \nWhat happened: \nReported by: ' + (w.name || ''); return formUrl(FORMS.feedback.url, f); } },
    { id: 'tester', t: 'Become a game tester', s: 'Play updates early', to: 'The testing team',
      p: 'Take the short tester quiz first, then send the request.', href: 'tester.html' },
    { id: 'dev', t: 'Help build The Arcade', s: 'Apply to be a developer', to: 'The developers',
      p: 'Tell us what you can do. We’ll message you on your Arcade account if you’re a good fit.', form: function (w) { var f = {}; f[FORMS.dev.user] = w.name; return formUrl(FORMS.dev.url, f); } },
    { id: 'other', t: 'Something else', s: 'Anything that doesn’t fit', to: 'The developers',
      p: 'Write it in the bug report box on the feedback form and we’ll pass it to the right people.', form: function (w) { var f = {}; f[FORMS.feedback.type] = 'Bug Report'; f[FORMS.feedback.bug] = '[Other]\n'; return formUrl(FORMS.feedback.url, f); } }
  ];
  function initContact() {
    var box = $('spCats'); if (!box) return;
    var dest = $('spDest');
    box.innerHTML = CONTACT.map(function (c) { return '<button type="button" class="sp-cat" data-cat="' + c.id + '" aria-pressed="false"><b>' + esc(c.t) + '</b><small>' + esc(c.s) + '</small></button>'; }).join('');
    function pick(id, focus) {
      var c = CONTACT.filter(function (x) { return x.id === id; })[0]; if (!c) return;
      [].forEach.call(box.children, function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-cat') === id)); });
      var w = who(), btn;
      if (c.go === 'bug') btn = '<a class="sp-btn" href="#spBug" id="spDestGo">Open the bug report form</a>';
      else if (c.href) btn = '<a class="sp-btn" href="' + c.href + '" id="spDestGo">Go to the tester quiz</a>';
      else btn = '<a class="sp-btn" href="' + esc(c.form(w)) + '" target="_blank" rel="noopener noreferrer" id="spDestGo">Open the form ↗</a>';
      dest.hidden = false;
      dest.innerHTML = '<p>' + esc(c.p) + '</p><div class="sp-row">' + btn + '</div><p class="to" style="margin:10px 0 0">Read by: <b>' + esc(c.to) + '</b>' +
        (c.go || c.href ? '' : ' · It opens a Google Form in a new tab. Nothing is sent until you press Submit there.') + '</p>';
      if (c.go === 'bug') $('spDestGo').onclick = function (e) { e.preventDefault(); var b = $('spBug'); if (b) { b.scrollIntoView({ behavior: 'smooth', block: 'start' }); setTimeout(function () { $('spBugWhat').focus({ preventScroll: true }); }, 400); } };
      if (focus) $('spDestGo').focus();
    }
    box.addEventListener('click', function (e) { var b = e.target.closest('button[data-cat]'); if (b) pick(b.getAttribute('data-cat'), false); });
    // links in help articles ("Contact → Account help")
    document.addEventListener('click', function (e) {
      var a = e.target.closest && e.target.closest('a[data-cat]'); if (!a) return;
      e.preventDefault(); $('spContact').scrollIntoView({ behavior: 'smooth' }); pick(a.getAttribute('data-cat'), true);
    });
  }

  /* =================================================================================================== */
  /* Feature voting                                                                                      */
  /* =================================================================================================== */
  // Starter ideas for the board. Add new ones at the end (the id is what votes are kept under; never reuse one).
  var IDEAS = [
    { id: 'chat-report', t: 'A Report button in the Global chat', s: 'Report a message right where you see it.' },
    { id: 'achievements', t: 'Achievements across every game', s: 'Badges for your profile, earned in any game.' },
    { id: 'more-controllers', t: 'Controller support in more games', s: 'Play more games with a gamepad.' },
    { id: 'avatars-everywhere', t: 'Profile pictures everywhere', s: 'Show your Social picture on Players and in the chat too.' },
    { id: 'party', t: 'Parties with friends', s: 'Join a friend’s game in one tap.' },
    { id: 'daily-challenges', t: 'Daily challenges', s: 'A new goal every day in a different game.' },
    { id: 'light-theme', t: 'A light theme', s: 'A bright version of the site.' },
    { id: 'game-reviews', t: 'Ratings for games', s: 'Give games a thumbs up and see the favourites.' }
  ];
  var VKEY = 'arcade-support-votes', totals = null;
  function myVotes() { var v = ls.get(VKEY, null); return v && Array.isArray(v.ids) ? v.ids : []; }
  function drawVotes() {
    var box = $('spVoteList'); if (!box) return;
    var mine = myVotes(), list = IDEAS.slice();
    if (totals) list.sort(function (a, b) { return (totals[b.id] || 0) - (totals[a.id] || 0); });
    box.innerHTML = list.map(function (i) {
      var on = mine.indexOf(i.id) >= 0;
      return '<div class="sp-vote"><div class="tx"><b>' + esc(i.t) + '</b><small>' + esc(i.s) + '</small></div>' +
        (totals ? '<span class="n" aria-label="votes">' + (totals[i.id] || 0) + '</span>' : '') +
        '<button type="button" data-v="' + i.id + '" aria-pressed="' + on + '" aria-label="' + (on ? 'Remove my vote for ' : 'Vote for ') + esc(i.t) + '">' + (on ? '✓ Voted' : 'Vote') + '</button></div>';
    }).join('');
    $('spVoteN').textContent = mine.length ? 'You voted for ' + mine.length + (mine.length === 1 ? ' idea.' : ' ideas.') : '';
  }
  function initVotes() {
    var box = $('spVoteList'); if (!box) return;
    drawVotes();
    box.addEventListener('click', function (e) {
      var b = e.target.closest('button[data-v]'); if (!b) return;
      var id = b.getAttribute('data-v'), mine = myVotes(), i = mine.indexOf(id), on = i < 0;
      if (on) mine.push(id); else mine.splice(i, 1);
      ls.set(VKEY, { ids: mine, at: Date.now() });
      if (totals) totals[id] = Math.max(0, (totals[id] || 0) + (on ? 1 : -1));
      drawVotes();
      var nb = box.querySelector('button[data-v="' + id + '"]'); if (nb) nb.focus();
      if (SERVER.votes && who().kind === 'online') api('/support/vote', { method: 'POST', body: { id: id, on: on } }).catch(function () {});
    });
    if (window.ArcadeAccount && ArcadeAccount.onPulled) ArcadeAccount.onPulled(drawVotes);
    if (SERVER.votes) {
      api('/support/votes').then(function (r) {
        if (!r || !r.list) return;
        totals = {}; r.list.forEach(function (x) { totals[x.id] = x.n; });
        if (Array.isArray(r.mine) && r.mine.length) ls.set(VKEY, { ids: r.mine, at: Date.now() });
        $('spVoteNote').textContent = 'Totals from everyone. One vote per account for each idea.';
        drawVotes();
      }).catch(function () {});
    }
    var s = $('spVoteIdea');
    if (s) s.href = formUrl(FORMS.feedback.url, (function () { var f = {}; f[FORMS.feedback.type] = 'Game Update Suggestion'; f[FORMS.feedback.update] = '[Idea for the voting board]\n'; return f; })());
  }

  /* =================================================================================================== */
  /* Known issues                                                                                        */
  /* =================================================================================================== */
  // Only issues we really know about, checked 2026-11-19. Remove an entry when it's fixed (and say so in NEWS).
  var KNOWN_CHECKED = '19 November 2026';
  var KNOWN = {
    _site: [
      ['Online stops when the servers hit their daily limit', 'The Arcade runs on Cloudflare’s free plan. On a very busy day the servers pause until midnight UTC; a red banner shows the time where you are.'],
      ['Progress is separate on each address', 'thearcade.pages.dev and noah-and-lars.github.io keep their own browser storage. Sign in to your account on both to share progress.'],
      ['Hidden tabs disconnect after 15 minutes', 'This keeps the servers free. Coming back to the tab reconnects by itself.'],
      ['Video calls may not connect on some networks', 'School and work networks can block the direct link a call needs. The call ends with a message after about 24 seconds.'],
      ['No screen sharing on phones and tablets', 'Their browsers don’t allow it, so the button is hidden there.'],
      ['Clips in older browsers', 'Browsers without the newer video tools record with start and stop (up to 60 seconds) instead of saving the last 30 seconds.']
    ],
    _app: [
      ['Security warning on first open', 'The apps aren’t signed with a paid certificate yet. See “My computer warns me about the app” in the help above.'],
      ['Older Macs', 'On macOS 10.13 and 10.14 a few pages may look a bit off, and the 3D games run best on macOS 12 or newer. In the legacy app on macOS 10.9 and 10.10, the first visit to each game takes a few extra seconds.']
    ],
    'havoc-bay': [['A hidden host tab slows online matches', 'The host’s screen runs the match. If the host switches to another tab, the match slows to about one update a second for everyone until they come back.']],
    'storm-drop': [['It’s a beta', 'Storm Drop is still being built, so expect bugs and big changes between updates.']],
    'blockcraft': [['No more updates', 'Blockcraft is discontinued: it stays playable, but bugs in it won’t be fixed.']],
    'free-criminal': [['Online needs the newest version', 'Only the latest version can play online. If Play online won’t join, reload the page.']]
  };
  function initIssues() {
    var sel = $('spIssueGame'); if (!sel) return;
    gameOptions(sel, '');
    sel.insertAdjacentHTML('afterbegin', '<option value="_site">The whole site</option><option value="_app">The Arcade app</option>');
    sel.value = '_site';
    var pre = (/[?&]game=([\w-]+)/.exec(location.search) || [])[1]; if (pre && gameById(pre)) sel.value = pre;
    function draw() {
      var k = sel.value, list = KNOWN[k] || [];
      $('spIssueList').innerHTML = list.length ? list.map(function (x) { return '<li><b>' + esc(x[0]) + '</b><small>' + esc(x[1]) + '</small></li>'; }).join('')
        : '<li style="border-left-color:var(--accent-2)"><b>No known issues</b><small>Found one? <a href="#spBug" data-bug="' + esc(k) + '">Report it</a>.</small></li>';
      var a = $('spIssueList').querySelector('a[data-bug]');
      if (a) a.onclick = function (e) { var g = $('spBugGame'); if (g && gameById(k)) { g.value = k; g.dispatchEvent(new Event('change')); } };
    }
    sel.addEventListener('change', draw);
    $('spIssueDate').textContent = 'Last checked ' + KNOWN_CHECKED + '.';
    draw();
  }

  /* =================================================================================================== */
  /* Release notes (release-notes.html)                                                                  */
  /* =================================================================================================== */
  function initReleaseNotes() {
    var box = $('rnList'); if (!box) return;
    var sel = $('rnGame'), q = $('rnQ');
    var withNews = {}; NEWS.forEach(function (n) { if (n.game) withNews[n.game] = (withNews[n.game] || 0) + 1; });
    gameOptions(sel, 'Every game and the site');
    [].slice.call(sel.options).forEach(function (o) { if (o.value && !withNews[o.value]) o.remove(); else if (o.value) o.textContent += ' (' + withNews[o.value] + ')'; });
    sel.insertAdjacentHTML('beforeend', '<option value="_site">Site and app updates</option>');
    var pre = (/[?&]game=([\w-]+)/.exec(location.search) || [])[1];
    if (pre && (withNews[pre] || pre === '_site')) sel.value = pre;
    var all = NEWS.map(function (n, i) { return { n: n, i: i }; }).sort(function (a, b) { return a.n.date < b.n.date ? 1 : a.n.date > b.n.date ? -1 : a.i - b.i; });
    function draw() {
      var g = sel.value, words = norm(q.value).split(' ').filter(Boolean), month = '', out = [], count = 0;
      all.forEach(function (x) {
        var n = x.n;
        if (g === '_site' ? n.game : g && n.game !== g) return;
        if (words.length) { var t = norm((n.headline || '') + ' ' + n.text + ' ' + ((gameById(n.game) || {}).title || '')); if (!words.every(function (w) { return t.indexOf(w) >= 0; })) return; }
        count++;
        var d = new Date(n.date + 'T12:00:00'), m = d.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
        if (m !== month) { month = m; out.push('<h2 class="sp-month">' + esc(m) + '</h2>'); }
        var game = gameById(n.game), img = n.imgs && n.imgs[0] ? n.imgs[0] : '';
        var link = game ? 'play.html?game=' + encodeURIComponent(game.id) : n.href || '';
        out.push('<article class="sp-rn' + (img ? ' has-img' : '') + '">' + (img ? '<img src="' + esc(img) + '" alt="" loading="lazy" decoding="async">' : '') +
          '<div><div class="when"><time datetime="' + esc(n.date) + '">' + esc(d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })) + '</time>' +
          (game ? '<a class="tag" href="' + esc(link) + '">' + esc(game.title) + '</a>' : '<span class="tag">The Arcade</span>') + '</div>' +
          (n.headline ? '<h3>' + esc(n.headline) + '</h3>' : '') + '<p>' + esc(n.text) + '</p></div></article>');
      });
      box.innerHTML = out.join('') || '<p class="sp-empty">No updates match.</p>';
      $('rnN').textContent = count + (count === 1 ? ' update' : ' updates');
      try { var u = new URL(location.href); if (g) u.searchParams.set('game', g); else u.searchParams.delete('game'); history.replaceState(null, '', u); } catch (e) {}
    }
    sel.addEventListener('change', draw); q.addEventListener('input', draw);
    draw();
  }

  /* =================================================================================================== */
  /* Tester quiz (tester.html)                                                                           */
  /* =================================================================================================== */
  var QUIZ = [
    { q: 'You find a bug. What is the most useful thing to put in your report?', a: ['“It’s broken, fix it”', 'The exact steps that make it happen, and what you expected instead', 'A video of you winning'], c: 1,
      why: 'If we can follow your steps and see the bug ourselves, we can fix it. Say what you expected too, so we know what “right” looks like.' },
    { q: 'You saw a bug once but can’t make it happen again. What do you do?', a: ['Report it anyway: say what you were doing and how often it happens', 'Forget about it', 'Keep restarting the game until it happens'], c: 0,
      why: 'Bugs that happen “sometimes” are real too. What you were doing, which device, and roughly when all help us find it.' },
    { q: 'Which is the best title for a bug report?', a: ['“HELP!!!”', '“Bug”', '“Havoc Bay: my plane falls through the carrier deck when I land fast”'], c: 2,
      why: 'A good title names the game, what went wrong and when. Someone should know the bug from the title alone.' },
    { q: 'You’re testing an update that isn’t out yet. A friend asks for screenshots. What do you do?', a: ['Send them, it’s only one friend', 'Keep it secret until it’s released', 'Post them on Social'], c: 1,
      why: 'Testers see things before everyone else, so they keep them to themselves until the update is out.' },
    { q: 'You find a way to get unlimited coins. What do you do?', a: ['Use it online before it’s fixed', 'Tell everyone in the Global chat', 'Report it and don’t use it'], c: 2,
      why: 'Exploits are bugs too. Reporting them (and not using them) is exactly what a tester is for.' },
    { q: 'Before reporting a bug, what should you check?', a: ['That it’s not already in the known issues, and that you’re on the newest version', 'Nothing, just send it', 'That nobody else is online'], c: 0,
      why: 'Reloading gets you the newest version, and the known issues list on Support saves you reporting something we already know about.' }
  ];
  var PASS = 5, QKEY = 'arcade-tester-quiz';
  function initQuiz() {
    var box = $('tqQuiz'); if (!box) return;
    box.innerHTML = QUIZ.map(function (x, i) {
      return '<div class="sp-q"><fieldset><legend>' + (i + 1) + '. ' + esc(x.q) + '</legend>' + x.a.map(function (a, j) {
        return '<label><input type="radio" name="tq' + i + '" value="' + j + '"><span>' + esc(a) + '</span></label>';
      }).join('') + '<p class="why" hidden></p></fieldset></div>';
    }).join('');
    var res = $('tqResult'), btn = $('tqCheck');
    function show(score, passed) {
      res.hidden = false; res.className = 'sp-result' + (passed ? ' pass' : '');
      var w = who();
      if (passed) {
        var f = {}; f[FORMS.tester.user] = w.name; f[FORMS.tester.why] = 'Skills quiz on the Support page: ' + score + '/' + QUIZ.length + '.\n\n';
        res.innerHTML = '<h2 class="sp-h">You passed: ' + score + ' out of ' + QUIZ.length + '</h2><p class="sp-note">Nice. Now send your request. The form asks for your Arcade username and why you want to test' +
          (w.name ? ' (your username and quiz score are filled in for you)' : '') + '. The testing team reads every request and replies on your Arcade account.</p>' +
          (w.kind !== 'online' ? '<p class="sp-note">You’ll need an online Arcade account so we can message you.</p>' : '') +
          '<a class="sp-btn green" id="tqApply" href="' + esc(formUrl(FORMS.tester.url, f)) + '" target="_blank" rel="noopener noreferrer">Send my tester request ↗</a>';
      } else {
        res.innerHTML = '<h2 class="sp-h">' + score + ' out of ' + QUIZ.length + '</h2><p class="sp-note">You need ' + PASS + ' to pass. Read the notes under each question and try again.</p><button type="button" class="sp-btn ghost" id="tqAgain">Try again</button>';
        $('tqAgain').onclick = reset;
      }
    }
    function reset() {
      [].forEach.call(box.querySelectorAll('input'), function (x) { x.checked = false; x.disabled = false; });
      [].forEach.call(box.querySelectorAll('label'), function (l) { l.className = ''; });
      [].forEach.call(box.querySelectorAll('.why'), function (p) { p.hidden = true; });
      res.hidden = true; btn.hidden = false; btn.disabled = true; box.querySelector('input').focus();
    }
    function answered() { return QUIZ.every(function (x, i) { return box.querySelector('input[name=tq' + i + ']:checked'); }); }
    box.addEventListener('change', function () { btn.disabled = !answered(); });
    btn.disabled = true;
    btn.onclick = function () {
      if (!answered()) return;
      var score = 0;
      QUIZ.forEach(function (x, i) {
        var pick = +box.querySelector('input[name=tq' + i + ']:checked').value;
        if (pick === x.c) score++;
        [].forEach.call(box.querySelectorAll('input[name=tq' + i + ']'), function (inp) {
          inp.disabled = true; var v = +inp.value;
          if (v === x.c) inp.parentNode.className = 'right'; else if (v === pick) inp.parentNode.className = 'wrong';
        });
        var why = box.querySelectorAll('.why')[i]; why.textContent = (pick === x.c ? 'Right. ' : 'Not quite. ') + x.why; why.hidden = false;
      });
      var passed = score >= PASS;
      if (passed) ls.set(QKEY, { s: score, at: Date.now() });
      btn.hidden = true; show(score, passed);
      res.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setTimeout(function () { var f = $('tqApply') || $('tqAgain'); if (f) f.focus({ preventScroll: true }); }, 350);
    };
    var prev = ls.get(QKEY, null);
    if (prev && prev.s >= PASS) { $('tqPrev').hidden = false; $('tqPrevGo').onclick = function () { btn.hidden = true; show(prev.s, true); }; }
  }

  function start() {
    initStatus(); initHelp(); initContact(); initBug(); initTickets(); initVotes(); initIssues(); initReleaseNotes(); initQuiz();
  }
  window.ArcadeSupport = { deviceInfo: deviceInfo, gameVersion: gameVersion, forms: FORMS, formUrl: formUrl, tickets: tickets, SERVER: SERVER };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
