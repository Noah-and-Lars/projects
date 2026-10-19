// The Terms of Service. Shown once, the first time someone opens the site (on any page: home, play or chat), until they
// tick the box and agree. Agreeing is remembered in this browser under TOS_KEY; change TOS_VERSION to ask everyone
// again after the terms change.
(function () {
  var TOS_VERSION = '2026-10-20', TOS_KEY = 'arcade-tos-agreed';
  try { if (localStorage.getItem(TOS_KEY) === TOS_VERSION) return; } catch (e) {}
  if (/[?&]notos=1/.test(location.search)) return;

  var TERMS = [
    ['1. Agreeing to these terms',
      ['These Terms of Service ("Terms") apply to The Arcade website, every game, page and feature on it, and every online feature of those games, including the Global chat, in-game chat, private messages, multiplayer lobbies and anything else that lets you talk to or play with other people (together, "the Site").',
       'By ticking the box and pressing "Agree and continue", or by using the Site in any way, you agree to these Terms. If you do not agree, do not use the Site and close this page.',
       'If you are under the age where you can agree to terms like these where you live, a parent or guardian must read and agree to them for you, and they are responsible for how you use the Site.']],
    ['2. Your chat and messages are your responsibility',
      ['Everything you type, send or share on the Site is your own responsibility. This includes messages in the Global chat, chat inside any game, private messages, player names, lobby names and anything else other people can see ("Your Content").',
       'You alone are responsible for Your Content and for any consequences of it, whether on the Site or anywhere else. That includes, but is not limited to, anything you say that is rude, offensive, abusive, threatening, hateful, sexual, discriminatory, illegal, untrue, or that shares someone\'s personal information.',
       'Any consequence of bad chat, including complaints, bans, removal from games or lobbies, disputes with other people, school or parental action, or legal action, is your fault and your responsibility. It is not the fault or responsibility of the Site or its creators.',
       'The creators of the Site do not write, check, approve or endorse what users say, and are not responsible for anything said by any user. Filters (such as swear-word filters) are provided as a courtesy only; they are not perfect and are not a promise that you will never see bad content.',
       'Do not share personal information about yourself or anyone else, such as real names, addresses, phone numbers, passwords, school names or photos.']],
    ['3. How you must behave',
      ['You agree not to: harass, bully, threaten or impersonate anyone; post hateful, sexual, violent or illegal content; spam or flood chats; cheat, hack, exploit bugs on purpose, or interfere with other players; try to break, overload or attack the Site or the online services it uses; or use the Site to break any law.',
       'The creators may, at any time and for any reason or no reason, without warning, remove or hide content, mute, kick or block any player, close lobbies, or stop anyone from using any part of the Site.']],
    ['4. Games can be removed or changed at any time',
      ['Every game on the Site, and every feature, level, map, item, mode, rule, score, save, achievement and setting in those games, can be added to, changed, rebalanced, reset, paused or removed at any time, without notice and for any reason.',
       'Updates may change how a game plays, reset or remove progress, scores or in-game money, or make older versions stop working online. A game being available today is not a promise that it will be available tomorrow.',
       'In-game money, items, levels and other progress have no real-world value, cannot be exchanged for real money or anything else, and can be lost at any time.']],
    ['5. The Site can be changed, taken down or terminated at any time',
      ['The creators may change, update, redesign, suspend, take down, move, shut down or permanently terminate the Site, or any part of it, at any time, for any reason or no reason, with or without notice.',
       'This includes removing pages, games, the Global chat or any online feature, changing the Site\'s address, or ending the Site entirely. Nobody is owed any warning, explanation, refund or compensation if this happens.',
       'Online features depend on services run by other companies. They may stop working, be limited or go offline at any time, and the creators are not responsible when that happens.']],
    ['6. Your data',
      ['The Site does not ask you to make an account. Your names, settings, saves, scores and chat history are kept in your own browser\'s storage. Clearing your browser data, using a different browser or device, or an update to a game can delete them, and they cannot be recovered.',
       'When you use online features, what you send (such as your player name, chat messages and in-game actions) is sent through an online service so other players can see it. Do not send anything you would not want other people to see.']],
    ['7. No warranty',
      ['The Site and everything on it is provided "as is" and "as available", for free and for fun, without any warranty of any kind. The creators do not promise that the Site will be safe, secure, error-free, always available, or that bugs will be fixed.',
       'You use the Site at your own risk.']],
    ['8. Limitation of responsibility',
      ['As far as the law allows, the creators of the Site are not responsible or liable for any loss or harm of any kind that comes from using, or not being able to use, the Site. This includes lost progress or saves, things other users say or do, things you say or do, the Site or any game being changed or removed, or the Site being taken down or terminated.']],
    ['9. Changes to these Terms',
      ['These Terms can be changed at any time. When they change, the Site may ask you to agree again. If you keep using the Site after the Terms change, you agree to the new Terms.']],
    ['10. Everything else',
      ['If any part of these Terms cannot be enforced, the rest still applies. If the creators do not enforce a part of these Terms, they can still enforce it later. These Terms are the whole agreement between you and the Site about using it.']]
  ];

  var css = '#tosPop{position:fixed;inset:0;z-index:2147483000;display:grid;place-items:center;padding:16px;background:rgba(8,6,20,.82);backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);font-family:inherit;color:var(--text,#f1effa)}' +
    '#tosPop *{box-sizing:border-box}' +
    '#tosPop .tbox{width:min(720px,100%);max-height:calc(100vh - 32px);display:flex;flex-direction:column;background:var(--panel,#1b1835);border:1px solid rgba(255,255,255,.12);border-top:4px solid var(--accent,#6c5ce7);border-radius:16px;box-shadow:0 30px 80px rgba(0,0,0,.6);overflow:hidden}' +
    '#tosPop .thead{padding:20px 24px 12px}#tosPop .thead small{display:block;color:var(--accent-2,#00d2a8);font-weight:800;letter-spacing:.12em;text-transform:uppercase;font-size:12px}' +
    '#tosPop h2{margin:6px 0 4px;font-size:26px}#tosPop .thead p{margin:0;color:var(--muted,#a9a3c9);font-size:14px;line-height:1.5}' +
    '#tosPop .tbody{flex:1;overflow:auto;padding:4px 24px 16px;border-top:1px solid rgba(255,255,255,.08);border-bottom:1px solid rgba(255,255,255,.08);background:rgba(0,0,0,.15)}' +
    '#tosPop h3{margin:18px 0 6px;font-size:16px}#tosPop .tbody p{margin:0 0 8px;color:#d8d4ee;font-size:14px;line-height:1.55}' +
    '#tosPop .tfoot{padding:14px 24px 18px;display:flex;flex-direction:column;gap:12px}' +
    '#tosPop label{display:flex;gap:10px;align-items:flex-start;font-size:14px;line-height:1.45;cursor:pointer}#tosPop input{width:20px;height:20px;margin:1px 0 0;flex:none;accent-color:var(--accent,#6c5ce7);cursor:pointer}' +
    '#tosPop button{align-self:flex-end;border:0;border-radius:10px;padding:12px 22px;font:inherit;font-weight:800;font-size:15px;background:var(--accent,#6c5ce7);color:#fff;cursor:pointer}' +
    '#tosPop button:disabled{background:#3a3560;color:#8f89b3;cursor:not-allowed}#tosPop .thint{font-size:12px;color:var(--muted,#a9a3c9)}' +
    '@media (max-width:520px){#tosPop h2{font-size:22px}#tosPop .thead,#tosPop .tbody,#tosPop .tfoot{padding-left:16px;padding-right:16px}#tosPop button{align-self:stretch}}';

  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function show() {
    if (document.getElementById('tosPop')) return;
    var st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
    var d = document.createElement('div'); d.id = 'tosPop'; d.setAttribute('role', 'dialog'); d.setAttribute('aria-modal', 'true'); d.setAttribute('aria-labelledby', 'tosTitle');
    var body = TERMS.map(function (s) { return '<h3>' + esc(s[0]) + '</h3>' + s[1].map(function (p) { return '<p>' + esc(p) + '</p>'; }).join(''); }).join('');
    d.innerHTML = '<div class="tbox"><div class="thead"><small>The Arcade</small><h2 id="tosTitle">Terms of Service</h2>' +
      '<p>Please read these terms before using the site. Last updated 20 October 2026.</p></div>' +
      '<div class="tbody" tabindex="0">' + body + '</div>' +
      '<div class="tfoot"><label><input type="checkbox" id="tosCheck"><span>I have read and I agree to the Terms of Service. I understand that everything I say in chat is my own responsibility, that games can be changed or removed at any time, and that the site can be changed, taken down or terminated at any time.</span></label>' +
      '<span class="thint" id="tosHint">Tick the box to continue.</span><button id="tosOk" disabled>Agree and continue</button></div></div>';
    document.body.appendChild(d);
    var keep = document.documentElement.style.overflow; document.documentElement.style.overflow = 'hidden';
    var cb = d.querySelector('#tosCheck'), ok = d.querySelector('#tosOk'), hint = d.querySelector('#tosHint');
    cb.addEventListener('change', function () { ok.disabled = !cb.checked; hint.style.visibility = cb.checked ? 'hidden' : 'visible'; });
    ok.addEventListener('click', function () {
      if (!cb.checked) return;
      try { localStorage.setItem(TOS_KEY, TOS_VERSION); } catch (e) {}
      d.remove(); st.remove(); document.documentElement.style.overflow = keep;
    });
    // nothing else on the page can be used until they agree
    d.addEventListener('keydown', function (e) { if (e.key === 'Escape') e.preventDefault(); });
    setTimeout(function () { try { d.querySelector('.tbody').focus(); } catch (e) {} }, 50);
  }
  if (document.body) show(); else document.addEventListener('DOMContentLoaded', show);
})();
