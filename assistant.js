/* assistant.js (2026-11-18): the Arcade assistant, a side panel on every site page (loaded after account.js).
   Its button (a chat bubble with a spark, `ICON`) sits in the header next to the account button (on play.html beside Clip and Fullscreen, never over the
   game). The panel slides in from the right (full screen on phones; on play.html on a wide screen the page makes room
   so the game isn't covered). It is a [role=dialog], so console.js keeps the focus inside it and Back closes it.
   Online accounts only: guests and local accounts see "Sign in to use the assistant". Each message goes to the Worker's
   POST /ai with the account token, the last few messages and, on play.html, only that game's summary from games.js;
   the reply streams in. Limits are the server's (a usage allowance per 5-hour session and per day, counted in what
   each reply really costs, so lighter models go further; the whole site rests after its daily
   budget until 11am). History stays on this device: localStorage 'arcade-acct-ai:<lower name>' (account.js's NEVER
   pattern keeps every 'arcade-acct…' key out of the cloud sync). Text is only ever shown with textContent.
   2026-11-19 additions, all in this file (the Worker is unchanged; it still gets { p, g: { title, text ≤ 700 }, m, msgs }):
   - Coach mode (play.html, on by default, the Coach button): `g` starts with a coach framing, then the game's controls.
   - Patch notes: a question that names a game (title or id, from GAMES) or asks "what changed / what's new" puts that
     game's newest NEWS entries (or, with no game, the site's newest headlines) into `g`; a named game is sent on every page.
   - Quick prompt chips under the input, per page / game (`chips()`), and a per-game memory: the last few questions about
     each game, 'arcade-acct-ai-mem:<lower name>' (device only, NEVER-pattern), sent as one light line in `g`.
   - "open Rocket Rivals" / "go to chat": matched on this device (`openIntent`), confirmed in the panel, never sent.
   - Voice input (SpeechRecognition) and read-aloud replies (speechSynthesis), each hidden where unsupported; history
     search (the Search button filters and highlights); a kind note under a blocked reply; a "Good for" line per model;
     a tip to switch to a lighter model when it would stretch the allowance; Bigger text and High contrast.
   Per-device panel settings: 'arcade-acct-ai-prefs' { tts, big, hc, coach, mem } (NEVER-pattern, so never synced). */
(function () {
  if (window.ArcadeAssistant) return;
  var KEY = 'arcade-acct-ai:', KEEP = 40, SEND = 8, MAX = 500;
  var REFUSED = 'Sorry, I can’t help with that one. Ask me something else!';
  var file = (location.pathname.match(/([a-z0-9-]+)\.html$/i) || [0, 'index'])[1].toLowerCase();
  var PAGE = file === 'index' ? 'home' : file;
  // the models players can pick (2026-11-18): the keys match AI_MODELS in the Worker, which picks the real model; e = its
  // est there (the average neurons a message really costs). Usage is counted in those neurons (a lighter model uses less):
  // `use` from the server { s, sl, sr, d, dl, dr } = this session's and today's use, limit and refill time. The menu shows
  // about how many messages each model has left. The choice is kept on this device ('arcade-ai-model').
  // g = what each one is good for (one line, shown in the Model menu and under it)
  var MODELS = [
    { k: 'oss120', n: 'GPT-OSS 120B', d: 'Smartest', e: 65, g: 'homework help, tricky questions, long explanations' },
    { k: 'qwen27', n: 'Qwen 3.8 27B', d: 'Smart', e: 69, g: 'step-by-step maths and science' },
    { k: 'llama70', n: 'Llama 3.3 70B', d: 'Smart', e: 44, g: 'clear explanations and writing help' },
    { k: 'mistral', n: 'Mistral Small 3.1', d: 'All-rounder', e: 38, g: 'everyday questions and game tips' },
    { k: 'scout', n: 'Llama 4 Scout', d: 'All-rounder', e: 38, g: 'facts, summaries and everyday questions' },
    { k: 'oss20', n: 'GPT-OSS 20B', d: 'Quick', e: 31, g: 'quick answers that need a bit of thinking' },
    { k: 'gemma4', n: 'Gemma 4 26B', d: 'Quick, light', e: 23, g: 'game tips, quick facts and fun chat' },
    { k: 'llama8', n: 'Llama 3.1 8B', d: 'Fastest, lightest', e: 20, g: 'jokes and short, simple questions' },
    { k: 'qwen30', n: 'Qwen 3 30B', d: 'Fastest, lightest', e: 19, g: 'short answers and quick game tips' },
    { k: 'glm', n: 'GLM 4.7 Flash', d: 'Fastest, lightest', e: 18, g: 'fast replies, jokes and quick facts' }
  ], MKEY = 'arcade-ai-model';
  function modelOf(k) { for (var i = 0; i < MODELS.length; i++) if (MODELS[i].k === k) return MODELS[i]; return null; }
  function getModel() { var k = ''; try { k = localStorage.getItem(MKEY) || ''; } catch (e) {} return modelOf(k) ? k : MODELS[0].k; }
  function setModel(k) { try { localStorage.setItem(MKEY, k); } catch (e) {} }
  var panel, log, form, input, sendBtn, guestBox, sub, btn, msel, mrow, urow, use = null, useAt = 0, busy = false, msgs = [], who = '';
  var goodFor, tools, coachBtn, searchBtn, setBtn, searchRow, searchIn, setBox, chipRow, micBtn, rec = null, searchQ = '', tipped = {};

  // per-device panel settings (the arcade-acct prefix keeps them out of the cloud sync)
  var PKEY = 'arcade-acct-ai-prefs', prefs = { tts: false, big: false, hc: false, coach: true, mem: true };
  try { var px = JSON.parse(localStorage.getItem(PKEY) || 'null'); if (px && typeof px === 'object') for (var pk in prefs) if (typeof px[pk] === 'boolean') prefs[pk] = px[pk]; } catch (e) {}
  function savePrefs() { try { localStorage.setItem(PKEY, JSON.stringify(prefs)); } catch (e) {} }
  var SR = window.SpeechRecognition || window.webkitSpeechRecognition || null;
  var TTS = ('speechSynthesis' in window) && typeof window.SpeechSynthesisUtterance === 'function';

  // the games and pages the assistant knows by name (from games.js), matched on whole words
  function norm(s) { return String(s || '').toLowerCase().replace(/[’']/g, '').replace(/[^a-z0-9]+/g, ' ').trim(); }
  function games() { return Array.isArray(window.GAMES) ? window.GAMES : []; }
  function gameKeys(g) { var a = [norm(g.title), norm(String(g.id).replace(/-/g, ' '))]; return a[0] === a[1] ? [a[0]] : a; }
  function gameById(id) { var l = games(); for (var i = 0; i < l.length; i++) if (l[i].id === id) return l[i]; return null; }
  function curGame() { return PAGE === 'play' ? gameById(new URLSearchParams(location.search).get('game')) : null; }
  function findGame(text) { // the game a message names (the longest name wins: "cube assault" over "cube")
    var t = ' ' + norm(text) + ' ', best = null, len = 0;
    games().forEach(function (g) { gameKeys(g).forEach(function (k) { if (k && k.length > len && t.indexOf(' ' + k + ' ') >= 0) { best = g; len = k.length; } }); });
    return best;
  }
  var PAGES = [
    { n: 'the home page', h: 'index.html', k: ['home', 'home page', 'homepage', 'the arcade', 'arcade', 'games'] },
    { n: 'the Global chat', h: 'chat.html', k: ['chat', 'global chat', 'the chat'] },
    { n: 'Players', h: 'players.html', k: ['players', 'player list', 'friends'] },
    { n: 'Social', h: 'social.html', k: ['social', 'feed'] },
    { n: 'Support', h: 'support.html', k: ['support', 'help', 'help page', 'support page'] },
    { n: 'Tournaments', h: 'tourney.html', k: ['tournaments', 'tournament', 'tourney', 'tourneys'] },
    { n: 'the app download page', h: 'app/', k: ['app', 'the app', 'download', 'downloads', 'app download'] }
  ];
  // "open Rocket Rivals", "play chess", "take me to the chat": only an exact name counts, anything else goes to the model
  function openIntent(text) {
    var m = norm(text).match(/^(?:hey |hi )?(?:can you |could you |please |pls )?(open|launch|start|play|go to|take me to|show me|bring up|load)(?: up)? (?:the )?(.+?)(?: (?:please|pls|for me|now|game|page))*$/);
    if (!m) return null;
    var t = m[2], l = games(), i;
    for (i = 0; i < l.length; i++) if (gameKeys(l[i]).indexOf(t) >= 0) return { n: l[i].title, h: 'play.html?game=' + encodeURIComponent(l[i].id), g: l[i].id };
    if (m[1] === 'play') return null;
    for (i = 0; i < PAGES.length; i++) if (PAGES[i].k.indexOf(t) >= 0) return { n: PAGES[i].n, h: PAGES[i].h };
    return null;
  }
  function isChangeQ(t) { t = String(t).replace(/[’‘]/g, "'"); return /\b(what'?s new|whats new|what is new|what changed|what has changed|changes?|changed|updates?|updated|patch|patches|patch notes|new version|latest version|news)\b/i.test(t); }
  function notesFor(id, n) { return (Array.isArray(window.NEWS) ? window.NEWS : []).filter(function (x) { return x && x.game === id; }).slice(0, n); }
  function clip(s, n) { s = String(s || '').replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n - 1).replace(/\s+\S*$/, '') + '…' : s; }

  // per-game memory: what this player asked about each game, on this device only
  var MEMKEY = 'arcade-acct-ai-mem:';
  function memAll() { if (!who) return {}; try { var x = JSON.parse(localStorage.getItem(MEMKEY + who) || 'null'); return x && typeof x === 'object' ? x : {}; } catch (e) { return {}; } }
  function remember(id, q) {
    if (!who || !prefs.mem || !id) return;
    var all = memAll(), l = Array.isArray(all[id]) ? all[id] : [], s = clip(q, 90);
    l = l.filter(function (x) { return norm(x) !== norm(s); }); l.push(s); all[id] = l.slice(-5);
    try { localStorage.setItem(MEMKEY + who, JSON.stringify(all)); } catch (e) {}
  }
  function forget() { if (!who) return; try { localStorage.removeItem(MEMKEY + who); } catch (e) {} }

  // what goes with a message as `g` (the Worker takes up to 700 characters): coach framing, patch notes, controls and memory
  // for the game the message names (or the one being played), or the site's newest news for "what's new?" with no game.
  // On play.html it is never empty, as before.
  function context(text) {
    var cur = curGame(), named = findGame(text), g = named || cur, change = isChangeQ(text);
    if (!g) {
      if (!change || !Array.isArray(window.NEWS)) return null;
      var news = window.NEWS.slice(0, 5).map(function (x) { var gg = x.game && gameById(x.game); return x.date + ': ' + clip(x.headline || x.text, 110) + (gg && !x.headline ? ' (' + gg.title + ')' : ''); });
      return { title: 'What’s new on The Arcade', text: clip('Recent news on The Arcade, newest first: ' + news.join(' | '), 700) };
    }
    var coach = PAGE === 'play' && prefs.coach && g === cur;
    var keys = (g.keys || []).map(function (k) { return k[0] + ': ' + k[1]; }).join('; ');
    var notes = notesFor(g.id, change ? 3 : 1).map(function (x) { return x.date + ': ' + clip(x.text || x.headline, change ? 230 : 140); });
    var past = prefs.mem ? (memAll()[g.id] || []).filter(function (q) { return norm(q) !== norm(clip(text, 90)); }).slice(-3) : [];
    var parts = []; // [text, its share], in order of priority
    if (coach) parts.push(['Coach mode: the player wants tips to get better at ' + g.title + '. Answer like a friendly coach: a few short, practical tips that use the controls below.', 200]);
    if (change && notes.length) parts.push(['Patch notes, newest first: ' + notes.join(' | '), 480]);
    else if (change) parts.push(['The site has no patch notes for this game yet.', 60]);
    if (!coach) parts.push([g.tagline || '', 140]);
    if (g.controls) parts.push(['Controls: ' + g.controls + '.', 60]);
    if (keys) parts.push(['Keys: ' + keys + '.', 260]);
    if (past.length) parts.push(['Earlier this player asked about this game: ' + past.map(function (q) { return q.replace(/[.?!…]+$/, ''); }).join('; ') + '.', 140]);
    if (coach) parts.push([g.tagline || '', 140]);
    if (!change && notes.length) parts.push(['Latest update: ' + notes[0], 150]);
    parts.push([g.description || '', 400]);
    var out = [], room = 700;
    parts.forEach(function (p) { if (!p[0] || room < 30) return; var s = clip(p[0], Math.min(p[1], room)); out.push(s); room -= s.length + 1; });
    return { title: g.title, text: out.join(' ').slice(0, 700) };
  }

  // quick prompt chips under the input, for this page or game
  var GAME_CHIPS = {
    chess: ['Best opening in chess', 'How does castling work?'], checkers: ['How do kings work?', 'Can I jump backwards?'],
    '2048': ['How do I reach 2048?'], uno: ['What does a +4 do?'], blocktris: ['How do I clear lines faster?'],
    'card-royale': ['Which cards are best?'], 'stocks-game': ['What is a stock?'], football: ['How do I score more?'],
    'storm-drop': ['How do I build?', 'Tips to win a match'], siege: ['Best way to defend?'], 'cube-tower-defense': ['Where should I put towers?']
  };
  var PAGE_CHIPS = {
    home: ['What’s new?', 'Pick a game for me', 'Tell me a joke'],
    chat: ['How do I use the chat?', 'Give me a fun question to ask', 'Tell me a joke'],
    players: ['How do I add a friend?', 'Pick a game to play with friends'],
    social: ['Ideas for a post', 'How do voice notes work?'],
    support: ['My game won’t load', 'How do I sign in?', 'How do cloud saves work?'],
    tourney: ['How do tournaments work?', 'Tips to win a tournament']
  };
  function chips() {
    var g = curGame();
    if (g) return ['Explain the rules', 'Give me a tip'].concat(GAME_CHIPS[g.id] || [], ['What changed in ' + g.title + '?']).slice(0, 5);
    return PAGE_CHIPS[PAGE] || ['What’s new?', 'Tell me a joke'];
  }

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
      '#aiPanel .ai-mrow{display:flex;align-items:center;gap:8px;padding:8px 14px 8px 18px;border-bottom:1px solid var(--line,#ffffff14);color:var(--dim,#74747f);font:500 12px var(--font,system-ui)}#aiPanel .ai-mrow[hidden]{display:none}' +
      '#aiPanel .ai-mrow select{flex:1;min-width:0;height:32px;padding:0 8px;border-radius:var(--radius-sm,8px);border:1px solid var(--line-2,#ffffff24);background:var(--panel,#121215);color:var(--text,#fff);font:500 13px var(--font,system-ui);cursor:pointer}' +
      '#aiPanel .ai-mrow select:focus{outline:none;border-color:var(--accent,#ff5a2c)}#aiPanel .ai-mrow select option{background:var(--panel,#121215);color:var(--text,#fff)}' +
      '.ai-ic{display:inline-grid;place-items:center;line-height:0}.ai-ic svg{display:block}.ai-ic .ai-spark{fill:var(--accent,#ff5a2c);stroke:var(--accent,#ff5a2c)}' +
      '#aiBtn .ai-ic{font-size:21px}html:not(.mob-phone) body:not(.player)>.top #aiBtn .ai-ic{font-size:25px}#aiPanel .ai-ttl{display:flex;align-items:center;gap:7px}#aiPanel .ai-ttl .ai-ic{font-size:20px}' +
      '#aiPanel .ai-use{display:grid;grid-template-columns:auto 1fr auto;align-items:center;gap:5px 10px;padding:8px 14px 10px 18px;border-bottom:1px solid var(--line,#ffffff14);color:var(--dim,#74747f);font:500 11.5px var(--font,system-ui)}#aiPanel .ai-use[hidden]{display:none}' +
      '#aiPanel .ai-bar{height:6px;border-radius:3px;background:var(--line,#ffffff14);overflow:hidden}#aiPanel .ai-bar i{display:block;height:100%;width:0;border-radius:3px;background:var(--accent,#ff5a2c);transition:width .4s}#aiPanel .ai-bar.full i{background:var(--warn,#ffb224)}' +
      '#aiPanel .ai-use em{font-style:normal;font-family:var(--mono,monospace);font-size:10.5px;white-space:nowrap}' +
      '#aiPanel .ai-by{align-self:flex-start;margin:-6px 0 0 4px;color:var(--dim,#74747f);font:500 10.5px var(--mono,monospace)}' +
      '#aiPanel .ai-foot{padding:4px 16px 12px;color:var(--dim,#74747f);font-size:11.5px}' +
      '#aiPanel .ai-mrow:not([hidden])+.ai-good{margin-top:-3px}#aiPanel .ai-mrow{border-bottom:0!important}#aiPanel .ai-good{padding:0 14px 8px 18px;border-bottom:1px solid var(--line,#ffffff14);color:var(--dim,#74747f);font:500 11.5px var(--font,system-ui)}#aiPanel .ai-good[hidden]{display:none}' +
      '#aiPanel .ai-tools{display:flex;flex-wrap:wrap;gap:6px;padding:8px 14px 8px 18px;border-bottom:1px solid var(--line,#ffffff14)}#aiPanel .ai-tools[hidden],#aiPanel .ai-srch[hidden],#aiPanel .ai-set[hidden],#aiPanel .ai-chips[hidden],#aiPanel [hidden]{display:none}' +
      '#aiPanel .ai-tb,#aiPanel .ai-chip,#aiPanel .ai-mini{height:30px;padding:0 11px;border-radius:999px;border:1px solid var(--line-2,#ffffff24);background:transparent;color:var(--muted,#a1a1aa);font:600 12.5px var(--font,system-ui);cursor:pointer;white-space:nowrap}' +
      '#aiPanel .ai-tb:hover,#aiPanel .ai-chip:hover,#aiPanel .ai-mini:hover{color:var(--text,#fff);border-color:var(--text,#fff)}' +
      '#aiPanel .ai-tb[aria-pressed=true],#aiPanel .ai-tb[aria-expanded=true]{color:var(--accent-ink,#160500);background:var(--accent,#ff5a2c);border-color:var(--accent,#ff5a2c)}' +
      '#aiPanel .ai-srch{display:flex;gap:8px;align-items:center;padding:8px 14px 8px 18px;border-bottom:1px solid var(--line,#ffffff14)}' +
      '#aiPanel .ai-srch input{flex:1;min-width:0;height:32px;padding:0 10px;border-radius:var(--radius-sm,8px);border:1px solid var(--line-2,#ffffff24);background:var(--panel,#121215);color:var(--text,#fff);font:14px var(--font,system-ui);outline:none}#aiPanel .ai-srch input:focus{border-color:var(--accent,#ff5a2c)}' +
      '#aiPanel .ai-srch span{color:var(--dim,#74747f);font:500 11.5px var(--mono,monospace);white-space:nowrap}' +
      '#aiPanel mark{background:var(--warn,#ffb224);color:#160500;border-radius:3px;padding:0 1px}' +
      '#aiPanel .ai-set{display:flex;flex-direction:column;gap:8px;padding:10px 14px 12px 18px;border-bottom:1px solid var(--line,#ffffff14);font-size:13.5px}' +
      '#aiPanel .ai-set label{display:flex;align-items:center;gap:9px;cursor:pointer}#aiPanel .ai-set input{width:18px;height:18px;accent-color:var(--accent,#ff5a2c);margin:0}#aiPanel .ai-set .ai-mini{align-self:flex-start}' +
      '#aiPanel .ai-safe{align-self:flex-start;max-width:88%;margin:-4px 0 0;padding:8px 11px;border-radius:10px;border:1px dashed var(--line-2,#ffffff33);color:var(--muted,#a1a1aa);font-size:12.5px;line-height:1.45}' +
      '#aiPanel .ai-card{align-self:stretch;display:flex;flex-wrap:wrap;align-items:center;gap:8px;padding:10px 12px;border-radius:12px;border:1px solid var(--line-2,#ffffff24);background:var(--panel,#121215);font-size:13.5px}#aiPanel .ai-card p{margin:0 auto 0 0;flex:1 1 100%}' +
      '#aiPanel .ai-card .go{background:var(--accent,#ff5a2c);border-color:var(--accent,#ff5a2c);color:var(--accent-ink,#160500)}' +
      '#aiPanel .ai-chips{display:flex;gap:6px;overflow-x:auto;padding:2px 14px 4px;scrollbar-width:none}#aiPanel .ai-chips::-webkit-scrollbar{display:none}' +
      '#aiPanel .ai-mic{flex:none;width:40px;height:40px;border-radius:50%;border:1px solid var(--line-2,#ffffff24);background:transparent;color:var(--muted,#a1a1aa);cursor:pointer;display:grid;place-items:center}#aiPanel .ai-mic:hover{color:var(--text,#fff)}' +
      '#aiPanel .ai-mic.on{background:var(--danger,#ff4d4d);border-color:var(--danger,#ff4d4d);color:#fff;animation:aiDots 1.2s infinite}' +
      '#aiPanel .ai-none{color:var(--dim,#74747f);text-align:center;font-size:13px;margin:auto}' +
      /* Bigger text and High contrast (per device) */
      '#aiPanel.ai-big .ai-msg{font-size:18px;line-height:1.5}#aiPanel.ai-big textarea,#aiPanel.ai-big .ai-srch input{font-size:17px}#aiPanel.ai-big .ai-chip,#aiPanel.ai-big .ai-tb,#aiPanel.ai-big .ai-mini{height:36px;font-size:15px}' +
      '#aiPanel.ai-big .ai-safe,#aiPanel.ai-big .ai-card,#aiPanel.ai-big .ai-set,#aiPanel.ai-big .ai-hi{font-size:16px}#aiPanel.ai-big .ai-foot,#aiPanel.ai-big .ai-good,#aiPanel.ai-big .ai-use,#aiPanel.ai-big .ai-mrow,#aiPanel.ai-big .ai-by{font-size:14px}' +
      '#aiPanel.ai-hc{background:#000;color:#fff;border-left-color:#fff;--dim:#e6e6e6;--muted:#ffffff;--line:#ffffff;--line-2:#ffffff;--panel:#000;--panel-2:#000;--accent:#ffe14d;--accent-hi:#fff07a;--accent-ink:#000;--warn:#ffe14d}' +
      '#aiPanel.ai-hc .ai-msg.a,#aiPanel.ai-hc .ai-msg.u{border:2px solid #fff}#aiPanel.ai-hc .ai-msg.u{background:#ffe14d;color:#000}#aiPanel.ai-hc .ai-safe{border:2px solid #fff;color:#fff}' +
      '#aiPanel.ai-hc button:focus-visible,#aiPanel.ai-hc select:focus-visible,#aiPanel.ai-hc input:focus-visible,#aiPanel.ai-hc textarea:focus-visible{outline:3px solid #ffe14d;outline-offset:2px}' +
      'html.ai-open body.player{padding-right:380px;box-sizing:border-box}' +
      '@media (max-width:820px){html.ai-open body.player{padding-right:0}}' +
      '@media (max-width:620px){#aiPanel{width:100vw;border-left:0}#aiBtn{width:32px;height:32px;font-size:15px}body.player>.top{gap:8px}body.player>.top #aiBtn{margin-left:0}}' +
      '@media (max-width:340px){body.player>.top .back{font-size:0;gap:0;padding:0 10px}body.player>.top .back::before{content:"←";font-size:16px}}' +
      'html.mob-phone #aiPanel{width:100vw;border-left:0}html.mob body.player>.top #aiBtn{margin-left:0}';
    document.head.appendChild(s);
  }

  // the model is told to write plain text; this drops any markdown that slips through (**bold**, # headings, * bullets)
  function plainMd(t) { return String(t).replace(/\*\*|__/g, '').replace(/^#{1,6}\s+/gm, '').replace(/^(\s*)\*\s+/gm, '$1- '); }
  // the assistant's icon (2026-11-18): a chat bubble with a spark in it, drawn like the site's other line icons
  var ICON = '<svg viewBox="0 0 24 24" width="1em" height="1em" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z"/><path class="ai-spark" d="M12 7.6c.35 2.3 1.6 3.55 3.9 3.9-2.3.35-3.55 1.6-3.9 3.9-.35-2.3-1.6-3.55-3.9-3.9 2.3-.35 3.55-1.6 3.9-3.9z" stroke-width="1.2"/></svg>';
  function icon() { var i = document.createElement('span'); i.className = 'ai-ic'; i.innerHTML = ICON; return i; }
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }

  function build() {
    if (panel) return;
    css();
    panel = el('aside'); panel.id = 'aiPanel'; panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-label', 'Arcade assistant'); panel.hidden = true;
    var hd = el('div', 'ai-hd');
    var ttl = el('span', 'ai-ttl'); ttl.appendChild(icon()); ttl.appendChild(document.createTextNode('Assistant')); hd.appendChild(ttl);
    sub = el('span', 'ai-sub', ''); hd.appendChild(sub);
    var clr = el('button', 'ai-clear', 'Clear'); clr.type = 'button'; clr.title = 'Clear this chat'; clr.onclick = function () { if (busy) return; hush(); msgs = []; save(); render(); };
    var x = el('button', 'x', '×'); x.type = 'button'; x.setAttribute('aria-label', 'Close'); x.onclick = close;
    hd.appendChild(clr); hd.appendChild(x);
    mrow = el('label', 'ai-mrow'); mrow.appendChild(document.createTextNode('Model'));
    msel = el('select'); msel.setAttribute('aria-label', 'AI model');
    MODELS.forEach(function (m) { var o = el('option', '', m.n + ' · ' + m.d + ' · good for ' + m.g); o.value = m.k; o.title = 'Good for ' + m.g; msel.appendChild(o); });
    msel.value = getModel(); msel.onchange = function () { setModel(msel.value); showUse(); };
    mrow.appendChild(msel);
    goodFor = el('div', 'ai-good');
    urow = el('div', 'ai-use'); urow.hidden = true;
    // tools: Coach (play.html), Search, Settings
    tools = el('div', 'ai-tools');
    function tb(text, title) { var b = el('button', 'ai-tb', text); b.type = 'button'; b.title = title; tools.appendChild(b); return b; }
    if (curGame()) {
      coachBtn = tb('Coach', 'Coach mode: tips for ' + curGame().title + ' using its controls and patch notes');
      coachBtn.onclick = function () { prefs.coach = !prefs.coach; savePrefs(); render(); };
    }
    searchBtn = tb('Search', 'Search this chat'); searchBtn.setAttribute('aria-expanded', 'false');
    searchBtn.onclick = function () { var on = searchRow.hidden; searchRow.hidden = !on; searchBtn.setAttribute('aria-expanded', String(on)); if (on) searchIn.focus(); else { searchIn.value = ''; searchQ = ''; render(); } };
    setBtn = tb('Settings', 'Voice, text size and contrast'); setBtn.setAttribute('aria-expanded', 'false');
    setBtn.onclick = function () { var on = setBox.hidden; setBox.hidden = !on; setBtn.setAttribute('aria-expanded', String(on)); if (on) { var f = setBox.querySelector('input'); if (f) f.focus(); } };
    searchRow = el('div', 'ai-srch'); searchRow.hidden = true;
    searchIn = el('input'); searchIn.type = 'search'; searchIn.placeholder = 'Search your messages'; searchIn.setAttribute('aria-label', 'Search your messages'); searchIn.maxLength = 60;
    searchIn.oninput = function () { searchQ = searchIn.value.trim(); render(); };
    searchIn.onkeydown = function (e) { if (e.key === 'Escape' && searchIn.value) { e.stopPropagation(); searchIn.value = ''; searchQ = ''; render(); } };
    var scount = el('span', 'ai-scount'); searchRow.appendChild(searchIn); searchRow.appendChild(scount);
    setBox = el('div', 'ai-set'); setBox.hidden = true;
    function opt(label, key, show, after) {
      if (!show) return;
      var l = el('label'), c = el('input'); c.type = 'checkbox'; c.checked = prefs[key];
      c.onchange = function () { prefs[key] = c.checked; savePrefs(); look(); if (after) after(); };
      l.appendChild(c); l.appendChild(document.createTextNode(label)); setBox.appendChild(l);
    }
    opt('Read replies aloud', 'tts', TTS, function () { if (!prefs.tts) hush(); });
    opt('Bigger text', 'big', true);
    opt('High contrast', 'hc', true);
    opt('Remember what I ask about each game (this device only)', 'mem', true);
    var fg = el('button', 'ai-mini', 'Forget what I asked about games'); fg.type = 'button';
    fg.onclick = function () { forget(); fg.textContent = 'Forgotten'; setTimeout(function () { fg.textContent = 'Forget what I asked about games'; }, 1600); };
    setBox.appendChild(fg);
    log = el('div', 'ai-log'); log.setAttribute('aria-live', 'polite');
    guestBox = el('div', 'ai-guest'); guestBox.hidden = true;
    guestBox.appendChild(el('p', '', 'Sign in to use the assistant'));
    var si = el('button', '', 'Sign in'); si.type = 'button';
    si.onclick = function () { close(); var a = A(); if (a && a.welcome) a.welcome(); else if (a && a.open) a.open(); };
    guestBox.appendChild(si);
    form = el('form');
    input = el('textarea'); input.rows = 1; input.maxLength = MAX; input.placeholder = 'Ask me anything…'; input.setAttribute('aria-label', 'Message');
    sendBtn = el('button', 'ai-send', 'Send'); sendBtn.type = 'submit';
    form.appendChild(input);
    if (SR) { // voice input where the browser has it
      micBtn = el('button', 'ai-mic'); micBtn.type = 'button'; micBtn.setAttribute('aria-label', 'Speak your message'); micBtn.title = 'Speak your message'; micBtn.setAttribute('aria-pressed', 'false');
      micBtn.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg>';
      micBtn.onclick = listen; form.appendChild(micBtn);
    }
    form.appendChild(sendBtn);
    chipRow = el('div', 'ai-chips'); chipRow.setAttribute('role', 'group'); chipRow.setAttribute('aria-label', 'Quick questions');
    form.onsubmit = function (e) { e.preventDefault(); send(); };
    input.addEventListener('keydown', function (e) { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); send(); } });
    input.addEventListener('input', function () { input.style.height = 'auto'; input.style.height = Math.min(120, input.scrollHeight) + 'px'; });
    var foot = el('div', 'ai-foot', 'The assistant can get things wrong. Never share personal details.');
    [hd, mrow, goodFor, urow, tools, searchRow, setBox, log, guestBox, form, chipRow, foot].forEach(function (x) { panel.appendChild(x); });
    look();
    document.body.appendChild(panel);
    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape' || !isOpen()) return;
      if (e.target === searchIn && searchIn.value) return; // the search box clears itself first
      e.stopPropagation(); close();
    }, true);
  }

  // the panel's per-device look and the toggles' states
  function look() {
    if (!panel) return;
    panel.classList.toggle('ai-big', prefs.big); panel.classList.toggle('ai-hc', prefs.hc);
    if (coachBtn) coachBtn.setAttribute('aria-pressed', String(!!prefs.coach));
  }
  function coaching() { return !!(coachBtn && prefs.coach && curGame()); }
  // text with the search words marked (text nodes only)
  function fill(e, text, q) {
    if (!q) { e.textContent = text; return e; }
    var lo = text.toLowerCase(), ql = q.toLowerCase(), i = 0, j;
    while ((j = lo.indexOf(ql, i)) >= 0) {
      if (j > i) e.appendChild(document.createTextNode(text.slice(i, j)));
      e.appendChild(el('mark', '', text.slice(j, j + q.length))); i = j + q.length;
    }
    if (i < text.length) e.appendChild(document.createTextNode(text.slice(i)));
    return e;
  }
  var SAFE_NOTE = 'That topic was declined by the Assistant’s safety check. It skips things that aren’t right for a kids’ games site, like scary or violent details, grown-up topics, personal information or anything that could be risky. You’re not in trouble. Try asking in a different way, or ask about something else.';
  function addMsg(m, q) {
    log.appendChild(fill(el('div', 'ai-msg ' + m.r), m.t, q));
    if (m.r === 'a' && modelOf(m.m)) log.appendChild(el('div', 'ai-by', modelOf(m.m).n));
    if (m.b) log.appendChild(el('div', 'ai-safe', SAFE_NOTE));
  }
  function renderChips() {
    chipRow.textContent = '';
    chips().forEach(function (c) {
      var b = el('button', 'ai-chip', c); b.type = 'button';
      b.onclick = function () { if (busy) return; input.value = c; send(); };
      chipRow.appendChild(b);
    });
  }
  function render() {
    var on = signedIn();
    guestBox.hidden = on; form.hidden = !on; log.hidden = !on; mrow.hidden = !on; goodFor.hidden = !on; tools.hidden = !on; chipRow.hidden = !on;
    if (!on) { searchRow.hidden = true; setBox.hidden = true; }
    urow.hidden = !on || !use; msel.value = getModel(); look();
    var gm = modelOf(getModel()); goodFor.textContent = 'Good for: ' + gm.g;
    var cg = coaching() ? curGame() : null;
    input.placeholder = cg ? 'Ask for a tip about ' + cg.title + '…' : 'Ask me anything…';
    log.textContent = '';
    if (!on) { sub.textContent = ''; return; }
    renderChips();
    var q = searchRow.hidden ? '' : searchQ, cnt = searchRow.querySelector('.ai-scount');
    if (q) {
      var ql = q.toLowerCase(), hits = msgs.filter(function (m) { return m.t.toLowerCase().indexOf(ql) >= 0; });
      cnt.textContent = hits.length + (hits.length === 1 ? ' match' : ' matches');
      if (!hits.length) log.appendChild(el('div', 'ai-none', 'Nothing in this chat matches “' + q + '”.'));
      hits.forEach(function (m) { addMsg(m, q); });
      return;
    }
    cnt.textContent = '';
    if (!msgs.length) {
      var hi = el('div', 'ai-hi');
      if (cg) {
        hi.appendChild(el('b', '', 'Coach mode: ' + cg.title));
        hi.appendChild(document.createTextNode('Ask me for tips, the rules or what changed in the latest update. I know this game’s controls and patch notes. You can still ask me anything else too.'));
      } else {
        hi.appendChild(el('b', '', 'Hi! I’m the Arcade Assistant.'));
        hi.appendChild(document.createTextNode(PAGE === 'play' ? 'Ask me how to play this game or for a tip, or anything else: homework, fun facts, jokes…' : 'Ask me about the games and the site, or anything else: homework, fun facts, jokes… I can open a game for you too: try “open Chess”.'));
      }
      log.appendChild(hi);
    }
    msgs.forEach(function (m) { addMsg(m, ''); });
    log.scrollTop = log.scrollHeight;
  }
  function note(text) { var n = el('div', 'ai-msg n', text); log.appendChild(n); log.scrollTop = log.scrollHeight; }

  // usage: what's left this session and today, in each model's messages
  function clock(t) { try { return new Date(t).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }); } catch (e) { return ''; } }
  function fresh(u) { // a session or day that has refilled since the server last said
    if (!u) return null; u = Object.assign({}, u); var now = Date.now();
    if (u.sr && now >= u.sr) { u.s = 0; u.sr = 0; }
    if (u.dr && now >= u.dr) { u.d = 0; u.dr += 864e5; }
    return u;
  }
  function room(u) { return Math.max(0, Math.min(u.sl - u.s, u.dl - u.d)); }
  function leftFor(m, u) { return Math.floor(room(u) / m.e); }
  function bar(label, used, lim, tail) {
    var pc = Math.min(100, Math.round(used / lim * 100)), b = el('div', 'ai-bar' + (pc >= 90 ? ' full' : '')), i = el('i');
    i.style.width = pc + '%'; b.appendChild(i); b.title = pc + '% used';
    urow.appendChild(el('span', '', label)); urow.appendChild(b); urow.appendChild(el('em', '', pc + '% · ' + tail));
  }
  function showUse() {
    var u = fresh(use); if (!urow) return;
    urow.textContent = ''; urow.hidden = !u || !signedIn();
    [].forEach.call(msel.options, function (o) { var m = modelOf(o.value); o.textContent = m.n + ' · ' + m.d + (u ? ' · ~' + leftFor(m, u) + ' left' : '') + ' · good for ' + m.g; o.title = 'Good for ' + m.g; });
    if (goodFor) goodFor.textContent = 'Good for: ' + modelOf(getModel()).g;
    if (!u) { sub.textContent = ''; return; }
    bar('Session', u.s, u.sl, u.sr ? 'refills ' + clock(u.sr) : 'starts with your next message');
    bar('Today', u.d, u.dl, 'refills ' + clock(u.dr));
    var m = modelOf(getModel()), n = leftFor(m, u);
    sub.textContent = '~' + n + ' left';
  }
  function setUse(u) { if (u && typeof u.sl === 'number') { use = u; useAt = Date.now(); showUse(); } }
  async function loadUse() {
    if (!signedIn() || Date.now() - useAt < 60000) { showUse(); return; }
    useAt = Date.now();
    try {
      var r = await fetch(((A() && A().server) || 'https://arcade-realtime.arcade-realtime.workers.dev') + '/ai', { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + token() }, body: '{"usage":1}' });
      var j = await r.json(); if (j && j.use) setUse(j.use);
    } catch (e) {}
  }
  function limitText(j) {
    var u = fresh(j.use), m = modelOf(getModel());
    if (!u) return j.t || 'You’ve used your allowance for now.';
    var lighter = MODELS.filter(function (x) { return x.e < m.e && leftFor(x, u) > 0; }).pop();
    if (j.which === 'day') return 'You’ve used today’s allowance. It refills at ' + clock(u.dr) + '.' + (lighter ? ' ' + lighter.n + ' still has a little room.' : '');
    return 'You’ve used this session’s allowance for ' + m.n + '. It refills at ' + clock(u.sr || Date.now()) + '.' + (lighter ? ' A lighter model like ' + lighter.n + ' can still answer (~' + leftFor(lighter, u) + ' left).' : '');
  }

  // a lighter model would stretch the allowance: suggest it (once per model per page visit), with a Switch button
  function simpleQ(t) { return t.length < 60 && !/\b(why|how|explain|homework|maths?|science|essay|story|code|rules|help)\b/i.test(t); }
  function maybeTip(q) {
    var u = fresh(use), m = modelOf(getModel()); if (!u || !m || tipped[m.k]) return;
    var n = leftFor(m, u), low = n <= 5, cheap = m.e >= 40 && simpleQ(q);
    if (!low && !cheap) return;
    var alt = MODELS.filter(function (x) { return x.e <= m.e * 0.7 && leftFor(x, u) >= n + 2; }).sort(function (a, b) { return b.e - a.e; })[0];
    if (!alt) return;
    tipped[m.k] = 1;
    var card = el('div', 'ai-card'), times = Math.round(m.e / alt.e * 10) / 10;
    card.appendChild(el('p', '', (low ? (n ? 'Tip: you have about ' + n + ' ' + m.n + ' message' + (n === 1 ? '' : 's') + ' left. ' : 'Tip: you’re nearly out of allowance for ' + m.n + '. ') :'Tip: for quick questions like that, a lighter model saves your allowance. ') +
      alt.n + ' uses about ' + times + '× less per message (~' + leftFor(alt, u) + ' left) and is good for ' + alt.g + '.'));
    var sw = el('button', 'ai-mini go', 'Switch to ' + alt.n), no = el('button', 'ai-mini', 'Keep ' + m.n); sw.type = no.type = 'button';
    sw.onclick = function () { setModel(alt.k); msel.value = alt.k; showUse(); card.remove(); note('Switched to ' + alt.n + '.'); input.focus(); };
    no.onclick = function () { card.remove(); input.focus(); };
    card.appendChild(sw); card.appendChild(no); log.appendChild(card); log.scrollTop = log.scrollHeight;
  }

  // read-aloud replies and voice input
  function speak(t) {
    if (!TTS || !prefs.tts || !t) return;
    try { speechSynthesis.cancel(); var s = new SpeechSynthesisUtterance(String(t).slice(0, 1800)); s.lang = document.documentElement.lang || navigator.language || 'en'; speechSynthesis.speak(s); } catch (e) {}
  }
  function hush() { try { if (TTS) speechSynthesis.cancel(); } catch (e) {} stopMic(); }
  function stopMic() { if (rec) { try { rec.stop(); } catch (e) {} } }
  function micState(on) { if (!micBtn) return; micBtn.classList.toggle('on', on); micBtn.setAttribute('aria-pressed', String(on)); micBtn.setAttribute('aria-label', on ? 'Stop listening' : 'Speak your message'); micBtn.title = on ? 'Stop listening' : 'Speak your message'; }
  function listen() {
    if (rec) { stopMic(); return; }
    var r; try { r = new SR(); } catch (e) { return; }
    var base = input.value ? input.value.replace(/\s+$/, '') + ' ' : '';
    r.lang = navigator.language || 'en-US';
    r.interimResults = true; r.continuous = false; r.maxAlternatives = 1;
    r.onresult = function (e) { var t = ''; for (var i = 0; i < e.results.length; i++) t += e.results[i][0].transcript; input.value = (base + t).slice(0, MAX); input.dispatchEvent(new Event('input')); };
    r.onerror = function (e) {
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') note('The microphone is blocked. Allow it for this site in your browser to talk to the Assistant.');
      else if (e.error === 'no-speech') note('I didn’t hear anything. Tap the microphone and try again.');
      else if (e.error !== 'aborted') note('Voice input stopped. Try again, or type your message.');
    };
    r.onend = function () { rec = null; micState(false); try { input.focus(); } catch (e) {} };
    try { if (TTS) speechSynthesis.cancel(); r.start(); rec = r; micState(true); } catch (e) { rec = null; micState(false); }
  }

  // "open Rocket Rivals": a confirm card in the panel; nothing goes to the server
  function offerOpen(text, o) {
    var hi = log.querySelector('.ai-hi'); if (hi) hi.remove();
    input.value = ''; input.style.height = '';
    msgs.push({ r: 'u', t: text, l: 1 }); save(); addMsg(msgs[msgs.length - 1], '');
    function done(t) { card.remove(); msgs.push({ r: 'a', t: t, l: 1 }); save(); addMsg(msgs[msgs.length - 1], ''); log.scrollTop = log.scrollHeight; }
    var card = el('div', 'ai-card'), cur = curGame(), page = location.pathname.split('/').pop() || 'index.html';
    if (o.g ? (cur && cur.id === o.g) : (!o.h.indexOf(page) && PAGE !== 'play')) { done('You’re already on ' + o.n + '.'); return; }
    card.appendChild(el('p', '', 'Open ' + o.n + '?' + (cur ? ' This leaves the game you’re playing.' : '')));
    var go = el('button', 'ai-mini go', 'Open'), no = el('button', 'ai-mini', 'Cancel'); go.type = no.type = 'button';
    go.onclick = function () { done('Opening ' + o.n + '…'); location.href = o.h; };
    no.onclick = function () { done('Okay, I won’t open it.'); try { input.focus(); } catch (e) {} };
    card.appendChild(go); card.appendChild(no);
    log.appendChild(card); log.scrollTop = log.scrollHeight;
    setTimeout(function () { try { go.focus({ preventScroll: true }); } catch (e) {} }, 30);
  }

  function isOpen() { return !!panel && !panel.hidden; }
  function open() {
    build(); load(); render(); loadUse();
    panel.hidden = false;
    document.documentElement.classList.add('ai-open');
    if (btn) btn.setAttribute('aria-expanded', 'true');
    requestAnimationFrame(function () { panel.classList.add('open'); });
    setTimeout(function () { var f = signedIn() ? input : guestBox.querySelector('button'); try { f.focus({ preventScroll: true }); } catch (e) {} }, 60);
  }
  function close() {
    if (!isOpen()) return;
    hush();
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
    stopMic();
    if (searchQ && !searchRow.hidden) { searchRow.hidden = true; searchBtn.setAttribute('aria-expanded', 'false'); searchIn.value = ''; searchQ = ''; render(); }
    var o = openIntent(text); if (o) { offerOpen(text, o); return; }
    var ctx = context(text), about = findGame(text) || curGame();
    var hi = log.querySelector('.ai-hi'); if (hi) hi.remove();
    input.value = ''; input.style.height = '';
    msgs.push({ r: 'u', t: text }); save();
    var mine = el('div', 'ai-msg u', text); log.appendChild(mine);
    var bubble = el('div', 'ai-msg a wait', ''); log.appendChild(bubble); log.scrollTop = log.scrollHeight;
    busy = true; sendBtn.disabled = true;
    var reply = '', done = null, base = (A() && A().server) || 'https://arcade-realtime.arcade-realtime.workers.dev';
    try {
      var res = await fetch(base + '/ai', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: 'Bearer ' + token() },
        body: JSON.stringify({ p: PAGE, g: ctx, m: getModel(), msgs: msgs.filter(function (m) { return !m.l; }).slice(-SEND).map(function (m) { return { r: m.r, t: m.t }; }) })
      });
      if (!res.ok || !/event-stream/.test(res.headers.get('content-type') || '')) {
        var j = await res.json().catch(function () { return {}; });
        bubble.remove(); msgs.pop(); save(); mine.remove(); if (!input.value) input.value = text; // not sent: give the text back
        if (j.error === 'auth') { render(); guestBox.hidden = false; form.hidden = true; log.hidden = true; }
        else if (j.error === 'limit') { setUse(j.use); note(limitText(j)); }
        else note(j.t || 'The assistant couldn’t answer just now. Try again in a moment.');
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
          if (typeof x.t === 'string') { reply += x.t; bubble.classList.remove('wait'); bubble.textContent = plainMd(reply); log.scrollTop = log.scrollHeight; }
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
    var blocked = !!(done && done.blocked);
    if (blocked) reply = REFUSED;
    else if (!reply.trim()) reply = 'Hmm, I didn’t get an answer that time. Try asking again!';
    reply = plainMd(reply); bubble.textContent = reply;
    var mk = done && modelOf(done.m) ? done.m : '', rec2 = { r: 'a', t: reply };
    if (mk) rec2.m = mk; if (blocked) rec2.b = 1;
    msgs.push(rec2); save();
    var after = bubble;
    if (mk) { var by = el('div', 'ai-by', modelOf(mk).n); after.after(by); after = by; }
    if (blocked) after.after(el('div', 'ai-safe', SAFE_NOTE));
    else if (about) remember(about.id, text);
    if (done && done.use) setUse(done.use);
    speak(blocked ? REFUSED : reply);
    log.scrollTop = log.scrollHeight;
    if (!blocked) maybeTip(text);
  }

  function addButton() {
    var top = document.querySelector('header.top'); if (!top) return false;
    if (document.getElementById('aiBtn')) return true;
    css();
    btn = el('button'); btn.appendChild(icon()); btn.id = 'aiBtn'; btn.type = 'button';
    btn.title = 'Assistant'; btn.setAttribute('aria-label', 'Open the assistant'); btn.setAttribute('aria-expanded', 'false');
    btn.onclick = function () { if (isOpen()) close(); else open(); };
    var acct = document.getElementById('acctBtn');
    if (acct && acct.parentNode === top) top.insertBefore(btn, acct); else top.appendChild(btn);
    return true;
  }
  function start() {
    if (!addButton()) return;
    // account.js adds its button on start too: keep our button just before it whichever comes first
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
