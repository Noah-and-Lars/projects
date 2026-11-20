// The Terms of Service. Shown once, the first time someone opens the site (on any page: home, play or chat), until they
// tick the box and agree. Agreeing is remembered in this browser under TOS_KEY; change TOS_VERSION to ask everyone
// again after the terms change.
(function () {
  var TOS_VERSION = '2026-11-21', TOS_KEY = 'arcade-tos-agreed';
  // 2026-11-16: window.arcadeShowTerms() reopens the terms any time (the "Terms of Service" link in the home page footer);
  // only the automatic first-visit pop-up is skipped once agreed, on a watch or with ?notos=1
  var agreed = false;
  try { agreed = localStorage.getItem(TOS_KEY) === TOS_VERSION; } catch (e) {}
  // 2026-11-15: no pop-up on an Apple Watch: the button doesn't fit on the screen (window.ARCADE_WATCH, set at the top of each page)
  // its own check too, in case a page didn't set the flag: any watch-sized touch screen (no phone is this small)
  var isWatch = function () {
    try {
      var a = Math.min(screen.width, screen.height), b = Math.max(screen.width, screen.height), w = window.innerWidth || 0, h = window.innerHeight || 0;
      var t = navigator.maxTouchPoints > 0 || 'ontouchstart' in window;
      return !!window.ARCADE_WATCH || /Watch|watchOS/i.test(navigator.userAgent || '') || /[?&]watch=1/.test(location.search) || (a > 0 && a <= 340 && b <= 420) || (t && w > 0 && w <= 340 && h > 0 && h <= 420);
    } catch (e) { return false; }
  };
  var auto = !agreed && !isWatch() && !/[?&]notos=1/.test(location.search);

  // 2026-11-16: no-affiliation notice, shown in capitals above section 1
  var NOTICE = ['IMPORTANT NOTICE: NO AFFILIATION WITH "THE ARC"',
    ['THE ARCADE IS AN INDEPENDENT WEBSITE. IT IS NOT, AND SHOULD NOT BE MISTAKEN FOR, CONFUSED WITH OR TAKEN TO BE PART OF, ANY OTHER GAMES WEBSITE, INCLUDING THE WEBSITE KNOWN AS "THE ARC".',
     'THE ARCADE IS NOT AFFILIATED WITH, ASSOCIATED WITH, ENDORSED BY, SPONSORED BY, PARTNERED WITH OR OTHERWISE CONNECTED TO "THE ARC" OR ANY OF ITS CREATORS, OPERATORS, STAFF OR USERS IN ANY WAY, AND "THE ARC" IS NOT AFFILIATED WITH THE ARCADE.',
     'NO ACCOUNT, MESSAGE, LINK, GAME, ANNOUNCEMENT OR OTHER CONTENT FROM OR ABOUT "THE ARC" REPRESENTS OR SPEAKS FOR THE ARCADE. WE ACCEPT NO RESPONSIBILITY OR LIABILITY FOR "THE ARC", ITS CONTENT, ITS SERVICES OR ANYTHING THAT HAPPENS ON IT.',
     'NO CONFUSION BETWEEN THE TWO WEBSITES SHOULD BE MADE. YOU MUST NOT PRESENT THE ARCADE AS BEING CONNECTED TO "THE ARC", OR "THE ARC" AS BEING CONNECTED TO THE ARCADE.']];

  var TERMS = [
    ['1. Acceptance of Terms',
      ['These Terms of Service (the "Terms") govern your access to and use of The Arcade website, including every game, page and feature made available on it and every online feature of those games, such as the Global chat, in-game chat, private messages, voice chat, video calls and multiplayer lobbies (together, the "Site"). In these Terms, "we", "us" and "our" refer to the creators and operators of the Site, and "you" refers to any person who accesses or uses the Site.',
       'By ticking the box and selecting "Agree and continue", or by accessing or using the Site in any way, you confirm that you have read and understood these Terms and agree to be bound by them. If you do not agree, you must not use the Site.',
       'IF YOU CIRCUMVENT, SKIP, HIDE, CLOSE, BLOCK OR OTHERWISE BYPASS THESE TERMS BY ANY MEANS, SO THAT YOU DO NOT SELECT "AGREE AND CONTINUE", YOU ARE DEEMED TO HAVE ACCEPTED THESE TERMS IN FULL, WITH THE SAME EFFECT AS IF YOU HAD TICKED THE BOX AND SELECTED "AGREE AND CONTINUE".']],
    ['2. User Content and Responsibility',
      ['"User Content" means anything you type, say, send, post or share on the Site, including messages in the Global chat, in-game chat and private messages, anything you say in voice chat, anything you say or show in a video call, player names, lobby names and any other material visible to other users.',
       'You are solely responsible for your User Content and for any consequences arising from it, whether on or off the Site. This includes, without limitation, content that is rude, offensive, abusive, threatening, hateful, sexual, discriminatory, unlawful or false, or that discloses another person\'s personal information.',
       'Any consequence arising from your User Content, including complaints, bans, removal from games or lobbies, disputes with other users, action by a school or parent, or legal proceedings, is your sole responsibility. Neither the Site nor its creators accept any responsibility or liability for such consequences.',
       'We do not write, review, approve or endorse User Content and are not responsible for anything posted by any user. Content filters, such as profanity filters, are provided as a courtesy only; they are not guaranteed to be accurate or complete, and they are not a promise that you will never encounter inappropriate content.',
       'You must not share personal information about yourself or any other person, including real names, addresses, telephone numbers, passwords, school names or photographs.']],
    ['3. Voice Chat, Video Calls and Text Chat',
      ['Some parts of the Site let users talk to each other by text (the Global chat, in-game chat, room chat, private messages and group chats of up to fifteen people, where every member sees every message) and by voice (voice chat in certain games). Voice chat sends audio from your microphone directly to the other players in the same lobby or room while it is switched on. It is not recorded or stored by us, and we are not able to listen to, monitor, review or moderate it.',
       'Players can also video call each other, one-to-one or in groups of up to fifteen, including players who are not their friends (unless one has blocked the other). A video call sends your camera and microphone directly to the browsers of the other people in the call. When a friend calls you, you can see their camera while the call is ringing, before you answer; a call from someone who is not your friend shows only their name until you accept. Nobody sees or hears you until you accept, and the person calling can add others to the call. Video calls are not recorded or stored by us, and we are not able to watch, listen to, monitor, review or moderate them.',
       'WE ARE NOT RESPONSIBLE FOR ANYTHING SAID OR SHOWN IN VOICE CHAT, VIDEO CALLS OR TEXT CHAT. NEITHER THE SITE NOR ITS CREATORS ARE RESPONSIBLE OR LIABLE FOR ANYTHING ANY USER SAYS, TYPES, SHOWS, SENDS OR SHARES, INCLUDING ANYTHING SAID, SHOWN OR WRITTEN TO YOU OR ABOUT YOU, AND ANYTHING YOU HEAR, SEE OR READ.',
       'You are solely responsible for everything you say, type or show, whether by voice, video or text, and for any consequences arising from it, in the same way as for your other User Content. Anything your microphone or camera picks up while voice chat or a video call is sending, including other people, sounds or anything else near you, is treated as said or shown by you.',
       'Other users may be able to record or share what you say, show or type without our knowledge (including by recording their screen during a video call), and we cannot prevent this. Do not say, show or type anything you would not want other people to hear, see, keep or repeat.',
       'You use voice chat, video calls and text chat entirely at your own risk. You can mute voice chat, turn it off or leave a lobby at any time, and in a video call you can turn off your camera or microphone, decline or hang up at any time; if anything makes you uncomfortable, you should do so, and you can block any player.']],
    ['4. Acceptable Use',
      ['You agree not to: harass, bully, threaten or impersonate any person; post hateful, sexual, violent or unlawful content; spam or flood any chat; cheat, hack, deliberately exploit bugs or interfere with other users; attempt to disrupt, overload or attack the Site or the online services it relies on; or use the Site to break any law.',
       'We may, at any time and at our sole discretion, for any reason or no reason and without notice, remove or hide content, mute, remove or block any user, close lobbies, or restrict or terminate any person\'s access to any part of the Site.']],
    ['5. Changes to Games and Content',
      ['We may add to, modify, rebalance, reset, suspend or remove any game on the Site, and any feature, level, map, item, mode, rule, score, save, achievement or setting within it, at any time, without notice and for any reason.',
       'Updates may alter gameplay, reset or remove progress, scores or in-game currency, or cause earlier versions to stop working online. The availability of a game at any time does not guarantee its continued availability.',
       'In-game currency, items, levels and other progress have no real-world value, cannot be exchanged for money or anything else of value, and may be lost at any time.']],
    // 2026-11-21: Game Updates + Discontinued Games
    ['6. Game Updates',
      ['Games on the Site are updated from time to time. Updates may come from requests and suggestions made by users, or from features, changes and fixes chosen by the developers. Making a request or suggestion does not mean that it will be added, and we may decline or ignore any request without giving a reason.',
       'Any game may stop receiving updates at any time, for any reason or no reason, with or without notice. No user is entitled to any update, feature, fix or change to any game, or to any explanation of why a game is or is not being updated.']],
    ['7. Discontinued Games',
      ['A game may be labelled "Discontinued" on the Site. A discontinued game will no longer receive feature updates, will no longer accept or act on update requests, and will no longer receive support.',
       'A discontinued game may still receive critical security patches, critical bug fixes, or server updates needed to keep it and the Site\'s servers working. Receiving such a patch or update does not mean that the game is no longer discontinued, or that any further updates will follow.',
       'A discontinued game may still be changed or removed from the Site at any time, as described in these Terms.']],
    ['8. Termination of Site/Online Service',
      ['We may change, update, redesign, suspend, take down, relocate, discontinue or permanently terminate the Site, or any part of it, at any time, for any reason or no reason, with or without notice.',
       'This includes removing pages, games, the Global chat or any online feature, changing the Site\'s address, or ending the Site entirely. No user is entitled to any notice, explanation, refund or compensation in such an event.',
       'Online features depend on services provided by third parties. Those services may become unavailable, limited or discontinued at any time, and we are not responsible for any such interruption.']],
    ['9. Data and Privacy',
      ['You may create a free Arcade account with a username and password; no email address is required. If you do, your username, a hashed (scrambled) form of your password, and your game saves, scores and settings are stored with a third-party online service (Cloudflare) so that your progress is available on other devices. Your username is public, as it is your name in the games and in chat, so you should not use your real name. You are responsible for keeping your recovery code safe; without it, a forgotten password cannot be reset. Accounts and the progress saved in them may be removed at any time, for example if the Site is shut down.',
       'If you use a local account instead, your names, settings, saves and scores are stored only in your own browser\'s storage. Clearing your browser data, using a different browser or device, or a game update may delete them, and they cannot be recovered.',
       'When you use online features, the information you send (such as your player name, chat messages and in-game actions) is transmitted through an online service so that other users can see it. You should not send anything you would not want other people to see.',
       'To keep the Site safe and to investigate rule-breaking, we keep records about online accounts that only the Site\'s administrators can see: when your account signs in, on which device (a random ID stored in your browser, not a hardware ID), what type of browser and device you use, together with technical details about it (such as screen size, time zone, language, graphics card and how it draws a test image, and where your browser shares them, your connection type and battery level) that we combine into a fingerprint to recognise the same device, how long you play each game, which pages of the Site you open and for how long, the website that first sent you here, who you exchange private messages with and how many (not what they say), the messages you send in the Global chat (kept even after they are removed from the chat), and changes to your account such as renames and bans. In serious situations, such as threats, bullying, scams or someone being at risk, an administrator may read your private messages; each time, the reason is recorded. We do not collect your email address or real name.']],
    ['10. Accounts',
      ['We may change any account name or account status (including roles, badges, ranks, verification, mutes and bans) at any time, for any reason or no reason, without notice and without giving a reason.',
       'We may delete any account and remove it from the Site at any time, for any reason or no reason, without notice and without giving a reason. When an account is deleted, its saves, scores, friends, messages and all other associated data may be permanently lost and cannot be recovered.']],
    ['11. Disclaimer of Warranties',
      ['The Site and all content on it are provided free of charge, for entertainment, on an "as is" and "as available" basis, without warranties of any kind, whether express or implied. We do not warrant that the Site will be safe, secure, error-free or continuously available, or that any defects will be corrected.',
       'Your use of the Site is at your own risk.']],
    ['12. Limitation of Liability',
      ['To the fullest extent permitted by law, we shall not be liable for any loss or damage of any kind arising from your use of, or inability to use, the Site. This includes, without limitation, lost progress or saved data, anything said or done by any user (including you), any change to or removal of the Site or any game, and the suspension or termination of the Site.']],
    ['13. Changes to These Terms',
      ['We may amend these Terms at any time. When the Terms change, the Site may ask you to agree to them again. Your continued use of the Site after any change constitutes your acceptance of the amended Terms.']],
    ['14. General',
      ['If any provision of these Terms is found to be unenforceable, the remaining provisions remain in full force and effect. Our failure to enforce any provision does not waive our right to enforce it later. These Terms constitute the entire agreement between you and us regarding your use of the Site.']],
    // 2026-11-16: shown in capitals in a red box, like the notice at the top (third item = red)
    ['15. USER\'S FAILURE TO READ THE TERMS OF SERVICE',
      ['ANY COMPLAINTS, CLAIMS, DISPUTES, LOSSES OR PROBLEMS OF ANY KIND ARISING FROM, OR IN CONNECTION WITH, A USER\'S FAILURE TO READ THESE TERMS OF SERVICE ARE THE SOLE RESPONSIBILITY AND LIABILITY OF THAT USER. NEITHER THE SITE NOR ITS CREATORS ACCEPT ANY RESPONSIBILITY OR LIABILITY FOR THEM.',
       'IT IS YOUR RESPONSIBILITY TO READ THESE TERMS IN FULL, CAREFULLY AND FROM BEGINNING TO END, BEFORE YOU ACCESS OR USE THE SITE, AND TO MAKE SURE THAT YOU UNDERSTAND THEM. IF ANY PART OF THESE TERMS IS UNCLEAR TO YOU, YOU SHOULD NOT USE THE SITE UNTIL IT IS CLEAR.',
       'BY TICKING THE BOX AND SELECTING "AGREE AND CONTINUE", OR BY ACCESSING OR USING THE SITE IN ANY WAY, YOU CONFIRM THAT YOU HAVE READ AND UNDERSTOOD THESE TERMS IN FULL. YOU AGREE THAT YOU CANNOT RELY ON A FAILURE TO READ, SKIM OR UNDERSTAND ANY PART OF THESE TERMS AS AN EXCUSE, DEFENCE OR GROUND FOR ANY COMPLAINT OR CLAIM, AND THAT THESE TERMS APPLY TO YOU IN FULL WHETHER OR NOT YOU HAVE READ THEM.',
       'THESE TERMS CAN BE READ AGAIN AT ANY TIME USING THE "TERMS OF SERVICE" LINK AT THE BOTTOM OF THE HOME PAGE. IT IS YOUR RESPONSIBILITY TO REREAD THEM FROM TIME TO TIME, AND WHENEVER YOU ARE ASKED TO AGREE TO THEM AGAIN, SO THAT YOU ARE AWARE OF ANY CHANGES.'], true]
  ];

  var css = '#tosPop{position:fixed;top:0;right:0;bottom:0;left:0;z-index:2147483000;display:grid;place-items:center;padding:16px;background:rgba(2,2,3,.78);backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);font-family:inherit;color:var(--text,#f4f4f5)}' +
    '#tosPop *{box-sizing:border-box}' +
    '#tosPop .tbox{width:min(720px,100%);max-height:calc(100vh - 32px);display:flex;flex-direction:column;background:var(--panel,#121215);border:1px solid rgba(255,255,255,.12);border-radius:20px;box-shadow:0 30px 80px rgba(0,0,0,.6);overflow:hidden}' +
    '#tosPop .thead{padding:20px 24px 12px}#tosPop .thead small{display:block;color:var(--accent-2,#3ddc97);font-weight:800;letter-spacing:.12em;text-transform:uppercase;font-size:12px}' +
    '#tosPop h2{margin:6px 0 4px;font-size:26px}#tosPop .thead p{margin:0;color:var(--muted,#a1a1aa);font-size:14px;line-height:1.5}' +
    '#tosPop .tbody{flex:1;overflow:auto;padding:4px 24px 16px;border-top:1px solid rgba(255,255,255,.08);border-bottom:1px solid rgba(255,255,255,.08);background:rgba(0,0,0,.15)}' +
    '#tosPop h3{margin:18px 0 6px;font-size:16px}#tosPop .tbody p{margin:0 0 8px;color:#c9c9cf;font-size:14px;line-height:1.55}' +
    '#tosPop .tnotice{margin:16px 0 4px;padding:12px 14px;border:1px solid rgba(255,90,90,.45);border-left:4px solid #ff5a5a;border-radius:10px;background:rgba(255,60,60,.08)}' +
    '#tosPop .tnotice.tred{margin:10px 0}#tosPop .tnotice.tred p{margin:0}' +
    '#tosPop .tnotice h3{margin:0 0 8px;color:#ff8a8a;letter-spacing:.02em}#tosPop .tnotice p{color:#f4f4f5;font-weight:700;font-size:13px;letter-spacing:.01em}' +
    '#tosPop label.off{opacity:.45;cursor:not-allowed}#tosPop label.off input{cursor:not-allowed}' +
    '#tosPop .tfoot{padding:14px 24px 18px;display:flex;flex-direction:column;gap:12px}' +
    '#tosPop label{display:flex;gap:10px;align-items:flex-start;font-size:14px;line-height:1.45;cursor:pointer}#tosPop input{width:20px;height:20px;margin:1px 0 0;flex:none;accent-color:var(--accent,#ff5a2c);cursor:pointer}' +
    '#tosPop button{align-self:flex-end;border:0;border-radius:10px;padding:12px 22px;font:inherit;font-weight:600;font-size:15px;background:#f4f4f5;color:#08080a;cursor:pointer}' +
    '#tosPop button:disabled{background:#25252c;color:#74747f;cursor:not-allowed}#tosPop .thint{font-size:12px;color:var(--muted,#a1a1aa)}' +
    '@media (max-width:520px){#tosPop h2{font-size:22px}#tosPop .thead,#tosPop .tbody,#tosPop .tfoot{padding-left:16px;padding-right:16px}#tosPop button{align-self:stretch}}' +
    // any very short screen that still gets the pop-up: full screen, so the tick box and button always fit
    '@media (max-height:460px){#tosPop{padding:0}#tosPop .tbox{max-height:none;height:100%;border-radius:0}#tosPop .thead{padding:8px 10px 6px}#tosPop .thead p{display:none}#tosPop h2{font-size:16px}#tosPop .tbody,#tosPop .tfoot{padding:6px 10px}#tosPop .tfoot{gap:6px}#tosPop label,#tosPop .tbody p{font-size:12px}#tosPop button{padding:8px;align-self:stretch}}';

  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function show(again) {
    if (!again && isWatch()) return; // checked again once the page has its real size
    if (document.getElementById('tosPop')) return;
    var st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
    var d = document.createElement('div'); d.id = 'tosPop'; d.setAttribute('role', 'dialog'); d.setAttribute('aria-modal', 'true'); d.setAttribute('aria-labelledby', 'tosTitle');
    var notice = '<div class="tnotice"><h3>' + esc(NOTICE[0]) + '</h3>' + NOTICE[1].map(function (p) { return '<p>' + esc(p) + '</p>'; }).join('') + '</div>';
    var body = notice + TERMS.map(function (s) { if (s[2]) return '<div class="tnotice"><h3>' + esc(s[0]) + '</h3>' + s[1].map(function (p) { return '<p>' + esc(p) + '</p>'; }).join('') + '</div>'; return '<h3>' + esc(s[0]) + '</h3>' + s[1].map(function (p) { return /^IF YOU CIRCUMVENT/.test(p) ? '<div class="tnotice tred"><p>' + esc(p) + '</p></div>' : '<p>' + esc(p) + '</p>'; }).join(''); }).join('');
    d.innerHTML = '<div class="tbox"><div class="thead"><small>The Arcade</small><h2 id="tosTitle">Terms of Service</h2>' +
      '<p>Please read these Terms carefully before using the Site. Last updated 21 November 2026.</p></div>' +
      '<div class="tbody" tabindex="0">' + body + '</div>' +
      '<div class="tfoot"><label id="tosLabel" class="off"><input type="checkbox" id="tosCheck" disabled><span>I have read and agree to the Terms of Service. I acknowledge that I am solely responsible for everything I post on the Site, that games may be changed or removed at any time, and that the Site may be changed, taken down or terminated at any time.</span></label>' +
      '<span class="thint" id="tosHint">Scroll to the bottom of the terms to continue.</span><button id="tosOk" disabled>Agree and continue</button></div></div>';
    document.body.appendChild(d);
    var keep = document.documentElement.style.overflow; document.documentElement.style.overflow = 'hidden';
    var cb = d.querySelector('#tosCheck'), ok = d.querySelector('#tosOk'), hint = d.querySelector('#tosHint');
    var close = function () { d.remove(); st.remove(); document.documentElement.style.overflow = keep; };
    if (again && agreed) { cb.checked = true; ok.disabled = false; hint.style.visibility = 'hidden'; ok.textContent = 'Close'; }
    // the tick box only unlocks once the terms have been scrolled to the very bottom
    var tb = d.querySelector('.tbody'), lab = d.querySelector('#tosLabel'), read = false;
    var unlock = function () { if (read) return; read = true; cb.disabled = false; lab.className = ''; if (!cb.checked) hint.textContent = 'Tick the box to continue.'; };
    var atEnd = function () { if (tb.scrollTop + tb.clientHeight >= tb.scrollHeight - 6) unlock(); };
    tb.addEventListener('scroll', atEnd); setTimeout(atEnd, 300);
    if (again && agreed) unlock();
    cb.addEventListener('change', function () { ok.disabled = !cb.checked; hint.style.visibility = cb.checked ? 'hidden' : 'visible'; });
    ok.addEventListener('click', function () {
      if (!cb.checked) return;
      try { localStorage.setItem(TOS_KEY, TOS_VERSION); } catch (e) {}
      agreed = true; close();
    });
    // nothing else on the page can be used until they agree (once agreed, a reopened copy closes with Escape or a click outside)
    d.addEventListener('keydown', function (e) { if (e.key === 'Escape') { e.preventDefault(); if (agreed) close(); } });
    d.addEventListener('click', function (e) { if (e.target === d && agreed) close(); });
    setTimeout(function () { try { d.querySelector('.tbody').focus(); } catch (e) {} }, 50);
  }
  window.arcadeShowTerms = function () { show(true); };
  if (!auto) return;
  if (document.body) show(); else document.addEventListener('DOMContentLoaded', function () { show(); });
})();
