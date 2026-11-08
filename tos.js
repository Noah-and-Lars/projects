// The Terms of Service. Shown once, the first time someone opens the site (on any page: home, play or chat), until they
// tick the box and agree. Agreeing is remembered in this browser under TOS_KEY; change TOS_VERSION to ask everyone
// again after the terms change.
(function () {
  var TOS_VERSION = '2026-11-09', TOS_KEY = 'arcade-tos-agreed';
  try { if (localStorage.getItem(TOS_KEY) === TOS_VERSION) return; } catch (e) {}
  if (/[?&]notos=1/.test(location.search)) return;

  var TERMS = [
    ['1. Acceptance of Terms',
      ['These Terms of Service (the "Terms") govern your access to and use of The Arcade website, including every game, page and feature made available on it and every online feature of those games, such as the Global chat, in-game chat, private messages, voice chat and multiplayer lobbies (together, the "Site"). In these Terms, "we", "us" and "our" refer to the creators and operators of the Site, and "you" refers to any person who accesses or uses the Site.',
       'By ticking the box and selecting "Agree and continue", or by accessing or using the Site in any way, you confirm that you have read and understood these Terms and agree to be bound by them. If you do not agree, you must not use the Site.',
       'IF YOU CIRCUMVENT, SKIP, HIDE, CLOSE, BLOCK OR OTHERWISE BYPASS THESE TERMS BY ANY MEANS, SO THAT YOU DO NOT SELECT "AGREE AND CONTINUE", YOU ARE DEEMED TO HAVE ACCEPTED THESE TERMS IN FULL, WITH THE SAME EFFECT AS IF YOU HAD TICKED THE BOX AND SELECTED "AGREE AND CONTINUE".']],
    ['2. User Content and Responsibility',
      ['"User Content" means anything you type, say, send, post or share on the Site, including messages in the Global chat, in-game chat and private messages, anything you say in voice chat, player names, lobby names and any other material visible to other users.',
       'You are solely responsible for your User Content and for any consequences arising from it, whether on or off the Site. This includes, without limitation, content that is rude, offensive, abusive, threatening, hateful, sexual, discriminatory, unlawful or false, or that discloses another person\'s personal information.',
       'Any consequence arising from your User Content, including complaints, bans, removal from games or lobbies, disputes with other users, action by a school or parent, or legal proceedings, is your sole responsibility. Neither the Site nor its creators accept any responsibility or liability for such consequences.',
       'We do not write, review, approve or endorse User Content and are not responsible for anything posted by any user. Content filters, such as profanity filters, are provided as a courtesy only; they are not guaranteed to be accurate or complete, and they are not a promise that you will never encounter inappropriate content.',
       'You must not share personal information about yourself or any other person, including real names, addresses, telephone numbers, passwords, school names or photographs.']],
    ['3. Voice Chat and Text Chat',
      ['Some parts of the Site let users talk to each other by text (the Global chat, in-game chat, room chat and private messages) and by voice (voice chat in certain games). Voice chat sends audio from your microphone directly to the other players in the same lobby or room while it is switched on. It is not recorded or stored by us, and we are not able to listen to, monitor, review or moderate it.',
       'WE ARE NOT RESPONSIBLE FOR ANYTHING SAID IN VOICE CHAT OR TEXT CHAT. NEITHER THE SITE NOR ITS CREATORS ARE RESPONSIBLE OR LIABLE FOR ANYTHING ANY USER SAYS, TYPES, SENDS OR SHARES, INCLUDING ANYTHING SAID OR WRITTEN TO YOU OR ABOUT YOU, AND ANYTHING YOU HEAR OR READ.',
       'You are solely responsible for everything you say or type, whether by voice or text, and for any consequences arising from it, in the same way as for your other User Content. Anything your microphone picks up while voice chat is sending, including other people or sounds near you, is treated as said by you.',
       'Other users may be able to record or share what you say or type without our knowledge, and we cannot prevent this. Do not say or type anything you would not want other people to hear, keep or repeat.',
       'You use voice chat and text chat entirely at your own risk. You can mute voice chat, turn it off or leave a lobby at any time; if anything makes you uncomfortable, you should do so.']],
    ['4. Acceptable Use',
      ['You agree not to: harass, bully, threaten or impersonate any person; post hateful, sexual, violent or unlawful content; spam or flood any chat; cheat, hack, deliberately exploit bugs or interfere with other users; attempt to disrupt, overload or attack the Site or the online services it relies on; or use the Site to break any law.',
       'We may, at any time and at our sole discretion, for any reason or no reason and without notice, remove or hide content, mute, remove or block any user, close lobbies, or restrict or terminate any person\'s access to any part of the Site.']],
    ['5. Changes to Games and Content',
      ['We may add to, modify, rebalance, reset, suspend or remove any game on the Site, and any feature, level, map, item, mode, rule, score, save, achievement or setting within it, at any time, without notice and for any reason.',
       'Updates may alter gameplay, reset or remove progress, scores or in-game currency, or cause earlier versions to stop working online. The availability of a game at any time does not guarantee its continued availability.',
       'In-game currency, items, levels and other progress have no real-world value, cannot be exchanged for money or anything else of value, and may be lost at any time.']],
    ['6. Termination of Site/Online Service',
      ['We may change, update, redesign, suspend, take down, relocate, discontinue or permanently terminate the Site, or any part of it, at any time, for any reason or no reason, with or without notice.',
       'This includes removing pages, games, the Global chat or any online feature, changing the Site\'s address, or ending the Site entirely. No user is entitled to any notice, explanation, refund or compensation in such an event.',
       'Online features depend on services provided by third parties. Those services may become unavailable, limited or discontinued at any time, and we are not responsible for any such interruption.']],
    ['7. Data and Privacy',
      ['You may create a free Arcade account with a username and password; no email address is required. If you do, your username, a hashed (scrambled) form of your password, and your game saves, scores and settings are stored with a third-party online service (Cloudflare) so that your progress is available on other devices. Your username is public, as it is your name in the games and in chat, so you should not use your real name. You are responsible for keeping your recovery code safe; without it, a forgotten password cannot be reset. Accounts and the progress saved in them may be removed at any time, for example if the Site is shut down.',
       'If you use a local account instead, your names, settings, saves and scores are stored only in your own browser\'s storage. Clearing your browser data, using a different browser or device, or a game update may delete them, and they cannot be recovered. Chat history is stored only in your own browser.',
       'When you use online features, the information you send (such as your player name, chat messages and in-game actions) is transmitted through an online service so that other users can see it. You should not send anything you would not want other people to see.']],
    ['8. Accounts',
      ['We may change any account name or account status (including roles, badges, ranks, verification, mutes and bans) at any time, for any reason or no reason, without notice and without giving a reason.',
       'We may delete any account and remove it from the Site at any time, for any reason or no reason, without notice and without giving a reason. When an account is deleted, its saves, scores, friends, messages and all other associated data may be permanently lost and cannot be recovered.']],
    ['9. Disclaimer of Warranties',
      ['The Site and all content on it are provided free of charge, for entertainment, on an "as is" and "as available" basis, without warranties of any kind, whether express or implied. We do not warrant that the Site will be safe, secure, error-free or continuously available, or that any defects will be corrected.',
       'Your use of the Site is at your own risk.']],
    ['10. Limitation of Liability',
      ['To the fullest extent permitted by law, we shall not be liable for any loss or damage of any kind arising from your use of, or inability to use, the Site. This includes, without limitation, lost progress or saved data, anything said or done by any user (including you), any change to or removal of the Site or any game, and the suspension or termination of the Site.']],
    ['11. Changes to These Terms',
      ['We may amend these Terms at any time. When the Terms change, the Site may ask you to agree to them again. Your continued use of the Site after any change constitutes your acceptance of the amended Terms.']],
    ['12. General',
      ['If any provision of these Terms is found to be unenforceable, the remaining provisions remain in full force and effect. Our failure to enforce any provision does not waive our right to enforce it later. These Terms constitute the entire agreement between you and us regarding your use of the Site.']]
  ];

  var css = '#tosPop{position:fixed;top:0;right:0;bottom:0;left:0;z-index:2147483000;display:grid;place-items:center;padding:16px;background:rgba(8,6,20,.82);backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);font-family:inherit;color:var(--text,#f1effa)}' +
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
      '<p>Please read these Terms carefully before using the Site. Last updated 9 November 2026.</p></div>' +
      '<div class="tbody" tabindex="0">' + body + '</div>' +
      '<div class="tfoot"><label><input type="checkbox" id="tosCheck"><span>I have read and agree to the Terms of Service. I acknowledge that I am solely responsible for everything I post on the Site, that games may be changed or removed at any time, and that the Site may be changed, taken down or terminated at any time.</span></label>' +
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
