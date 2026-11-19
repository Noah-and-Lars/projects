/* ============================================================
   CARD ROYALE 1.2: deck slots and stats, card mastery, daily quests, the season road, challenges (Triple Mana,
   Mirror, Draft), training camp, 2v2, friendly battles, battle replays, TV Royale, clans and clan wars, emotes,
   tower skins, arena previews, a richer card info page, balance notes, the Mana graph and tips after a battle.
   Loaded after index.html's main script: it uses that script's globals (SAVE, save, DEF, CARDS, BT, NET, modal...),
   replaces a few of its menu functions, and the battle code calls back into window.CRX at a handful of points
   (start, every event, the end, leaving).
   Everything is saved in 'cardroyale.save' (so the arcade account syncs it) except replays ('cardroyale.replays').
   ============================================================ */
(() => {
'use strict';
const CRX = window.CRX = {};
const css = `
.modeGrid{display:grid;grid-template-columns:repeat(3,1fr);gap:7px;margin:10px 0 4px}
.modeGrid button{position:relative;border-radius:10px;padding:7px 2px 6px;background:linear-gradient(#3a86d0,#1d5aa0);border:2px solid #062a50;box-shadow:0 3px 0 #062a50;font-size:13px;line-height:1.1}
.modeGrid button i{display:block;font-style:normal;font-size:22px;margin-bottom:2px}
.modeGrid button .dot{position:absolute;right:-4px;top:-5px;min-width:18px;height:18px;border-radius:9px;background:#e8442a;border:1.5px solid #fff;font-size:11px;display:grid;place-items:center;padding:0 3px}
.modeGrid button:active{transform:translateY(2px);box-shadow:none}
.dtabs{display:flex;gap:5px;margin-bottom:6px}
.dtabs button{flex:1;padding:5px 0;border-radius:8px;background:#2a1a0c;border:2px solid #120a04;font-size:15px;color:#e8c8a0}
.dtabs button.on{background:linear-gradient(#ffe36a,#f09a10);border-color:#6b3a00;color:#fff}
.dstats{display:grid;grid-template-columns:repeat(4,1fr);gap:5px;margin-top:8px}
.dstats div{background:rgba(0,0,0,.28);border-radius:7px;padding:4px 3px;text-align:center;font-size:11px;color:#e8c8a0;font-family:system-ui,sans-serif;font-weight:700}
.dstats div b{display:block;font-family:"Lilita One","Arial Black",sans-serif;font-weight:400;font-size:17px;color:#fff}
.dnote{font-size:12px;color:#f4dcc0;font-family:system-ui,sans-serif;font-weight:600;margin-top:6px;line-height:1.35}
.curve{display:flex;align-items:flex-end;gap:3px;height:34px;margin-top:6px}
.curve span{flex:1;background:linear-gradient(#ff9cf8,#a020c0);border-radius:3px 3px 0 0;min-height:2px;position:relative}
.curve span em{position:absolute;bottom:-14px;left:0;right:0;text-align:center;font-style:normal;font-size:9px;color:#e8c8a0}
.cbtns{display:flex;gap:6px;flex-wrap:wrap;justify-content:center;margin:2px 0 10px}
.cbtns .btn{font-size:14px;padding:6px 10px}
.tabs2{display:flex;gap:4px;margin:6px 0 8px}
.tabs2 button{flex:1;padding:5px 0;border-radius:7px;background:rgba(5,25,45,.5);border:2px solid #061c34;font-size:13px}
.tabs2 button.on{background:linear-gradient(#6fc0ff,#2a7ad8);border-color:#0a3a7a}
.lvtbl{width:100%;border-collapse:collapse;font-size:13px}
.lvtbl th{font-weight:400;color:#bfe0ff;font-size:11px;padding:2px}
.lvtbl td{text-align:center;padding:3px 2px;border-top:1px solid rgba(255,255,255,.1)}
.lvtbl tr.me td{background:rgba(255,226,122,.18);color:#ffe27a}
.ctr{display:flex;align-items:center;gap:8px;background:rgba(5,25,45,.45);border-radius:8px;padding:5px;margin-bottom:5px}
.ctr .card{width:46px;flex:none}.ctr div.t{flex:1;font-size:14px}.ctr div.t small{display:block;font-size:11px;color:#bfe0ff;font-family:system-ui,sans-serif;font-weight:600}
.mq{display:flex;align-items:center;gap:8px;background:rgba(5,25,45,.45);border-radius:8px;padding:6px 8px;margin-bottom:5px;font-size:13px}
.mq .t{flex:1}.mq .t small{display:block;font-size:11px;color:#bfe0ff}.mq.done{opacity:.55}
.mq .bar{width:70px;flex:none}
.mq .btn{font-size:13px;padding:4px 8px}
.qhead{font-size:12px;color:#bfe0ff;text-align:center;font-family:system-ui,sans-serif;font-weight:600;margin-bottom:6px}
.emoGrid{display:grid;grid-template-columns:repeat(4,1fr);gap:6px}
.emoGrid button{aspect-ratio:1;border-radius:10px;background:rgba(5,25,45,.5);border:2px solid #061c34;font-size:30px;position:relative}
.emoGrid button.on{border-color:#ffe27a;background:rgba(255,226,122,.2)}
.emoGrid button.lock{filter:grayscale(1);opacity:.45;font-size:26px}
.emoGrid button small{position:absolute;right:3px;bottom:1px;font-size:11px}
.skinGrid{display:grid;grid-template-columns:repeat(2,1fr);gap:7px}
.skinGrid button{border-radius:10px;background:rgba(5,25,45,.5);border:2px solid #061c34;padding:5px;font-size:13px;line-height:1.15}
.skinGrid button.on{border-color:#ffe27a;background:rgba(255,226,122,.18)}
.skinGrid button.lock canvas{filter:grayscale(.9) brightness(.6)}
.skinGrid canvas{width:100%;height:76px;display:block}
.skinGrid small{display:block;font-size:10px;color:#bfe0ff;font-family:system-ui,sans-serif;font-weight:600}
.chal{display:flex;gap:8px;align-items:center;background:rgba(5,25,45,.45);border-radius:10px;padding:8px;margin-bottom:7px}
.chal .ic{font-size:30px;width:42px;text-align:center}
.chal .t{flex:1;font-size:16px}.chal .t small{display:block;font-size:11px;color:#bfe0ff;font-family:system-ui,sans-serif;font-weight:600;line-height:1.3}
.pips{display:flex;gap:3px;justify-content:center;margin:6px 0}
.pips i{width:16px;height:16px;border-radius:50%;background:rgba(255,255,255,.15);border:2px solid #061c34}
.pips i.w{background:linear-gradient(#8ef06a,#3cae2a)}.pips i.l{background:linear-gradient(#ff8a7a,#d8302a)}
.draftRow{display:flex;gap:10px;justify-content:center;margin:8px 0}
.draftRow .card{width:42%;max-width:130px;transition:transform .15s}
.draftRow .card:hover{transform:translateY(-4px)}
.minideck{display:flex;gap:2px;flex-wrap:wrap;justify-content:center;min-height:30px;margin:3px 0}
.minideck img{width:26px;border-radius:3px;border:1px solid #0a1a2a}
.pickGrid{display:grid;grid-template-columns:repeat(5,1fr);gap:4px;max-height:46vh;overflow-y:auto;padding:2px}
.pickGrid .card{padding:2px}.pickGrid .card.sel{outline:3px solid #8ef06a}
.txt{width:100%;padding:8px 10px;border-radius:8px;border:2px solid #061c34;background:#0a2038;color:#fff;font:16px system-ui,sans-serif;font-weight:700;user-select:text;-webkit-user-select:text}
.code{letter-spacing:4px;text-transform:uppercase;text-align:center;font-family:"Lilita One",monospace}
.bigcode{font-size:34px;letter-spacing:6px;text-align:center;background:#0a2038;border:2px dashed #ffe27a;border-radius:10px;padding:6px;margin:6px 0;user-select:text;-webkit-user-select:text}
.tvrow,.reprow{display:flex;align-items:center;gap:8px;background:rgba(5,25,45,.45);border-radius:8px;padding:6px 8px;margin-bottom:5px;font-size:14px}
.tvrow .t,.reprow .t{flex:1;min-width:0}.tvrow small,.reprow small{display:block;font-size:11px;color:#bfe0ff;font-family:system-ui,sans-serif;font-weight:600}
.tvrow .btn,.reprow .btn{font-size:13px;padding:4px 9px}
.reprow.w{box-shadow:inset 4px 0 0 #3a9aff}.reprow.l{box-shadow:inset 4px 0 0 #ff5a4a}
.lbrow{display:flex;align-items:center;gap:8px;padding:5px 6px;border-radius:7px;font-size:14px}
.lbrow:nth-child(odd){background:rgba(5,25,45,.4)}.lbrow.me{outline:2px solid #ffe27a}
.lbrow .n{width:28px;text-align:center;color:#ffe27a}.lbrow .nm{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.bal h4{font-weight:400;font-size:16px;margin:8px 0 4px;color:#ffe27a}
.bal .bl{display:flex;gap:8px;align-items:center;background:rgba(5,25,45,.45);border-radius:8px;padding:5px;margin-bottom:4px}
.bal .bl .card{width:40px;flex:none}.bal .bl div.t{font-size:13px;font-family:system-ui,sans-serif;font-weight:600;color:#e0f0ff}.bal .bl b{font-family:"Lilita One",sans-serif;font-weight:400;font-size:15px;color:#fff}
.up{color:#8ef06a}.dn{color:#ff9a8a}
#clanOv,#seasonOv{position:absolute;inset:0;z-index:45;display:flex;flex-direction:column}
.ovHead{display:flex;align-items:center;justify-content:center;position:relative;padding:8px;flex:none}
.ovHead .x{position:absolute;right:8px;top:8px;width:32px;height:32px;border-radius:8px;background:linear-gradient(#ff8a7a,#d8302a);border:2px solid #6a1010;font-size:18px}
.ovBody{flex:1;overflow-y:auto;padding:0 10px 12px;touch-action:pan-y}
.clanTop{display:flex;align-items:center;gap:10px;background:linear-gradient(#0e4a7a,#0c3d66);border:2px solid #06223d;border-radius:10px;padding:8px;margin-bottom:8px}
.clanTop .badge{font-size:34px;width:48px;height:48px;display:grid;place-items:center;background:rgba(0,0,0,.25);border-radius:10px}
.clanTop .t{flex:1}.clanTop .t small{display:block;font-size:12px;color:#9cc8f0}
.chatlog{height:180px;overflow-y:auto;background:rgba(5,20,40,.5);border-radius:8px;padding:6px;font:600 13px/1.35 system-ui,sans-serif;margin-bottom:6px;user-select:text;-webkit-user-select:text}
.chatlog p{margin-bottom:3px;word-wrap:break-word}.chatlog b{color:#ffe27a}.chatlog .sys{color:#9cc8f0;font-style:italic}
.chatrow{display:flex;gap:6px}
.req{display:flex;align-items:center;gap:8px;background:rgba(5,25,45,.45);border-radius:8px;padding:5px;margin-bottom:5px;font-size:13px}
.req .card{width:40px;flex:none}.req .t{flex:1}.req .t small{display:block;color:#bfe0ff;font-size:11px}
.mem{display:flex;align-items:center;gap:6px;font-size:13px;padding:4px 6px;border-radius:6px}
.mem:nth-child(odd){background:rgba(5,25,45,.35)}.mem .on{width:9px;height:9px;border-radius:50%;background:#666;flex:none}.mem .on.y{background:#5fe05a}
.mem .nm{flex:1}
.road2{position:relative;padding-left:46px}
.road2 .ms{position:relative;display:flex;align-items:center;gap:8px;background:rgba(5,25,45,.45);border-radius:9px;padding:7px 8px;margin-bottom:6px;font-size:14px}
.road2 .ms:before{content:attr(data-n);position:absolute;left:-40px;width:30px;height:30px;border-radius:50%;background:#0a2a48;border:2px solid #051a2e;display:grid;place-items:center;font-size:12px}
.road2 .ms.got:before{background:linear-gradient(#ffe36a,#f09a10);border-color:#6b3a00}
.road2 .ms .t{flex:1}.road2 .ms .t small{display:block;font-size:11px;color:#bfe0ff}
.road2 .ms .ic{font-size:24px;width:40px;text-align:center}.road2 .ms .ic canvas{width:40px}
.road2 .ms .btn{font-size:13px;padding:4px 9px}
.gwrap{background:rgba(5,20,40,.6);border-radius:10px;padding:6px 8px;margin:6px 0 4px;width:min(320px,100%)}
.gwrap canvas{width:100%;height:96px;display:block}
.gkey{display:flex;gap:10px;justify-content:center;font:700 11px system-ui,sans-serif;color:#cfe6ff;margin-top:3px}
.gkey i{display:inline-block;width:10px;height:3px;vertical-align:middle;margin-right:4px}
.tip{background:rgba(255,226,122,.16);border:2px solid rgba(255,226,122,.5);border-radius:10px;padding:6px 10px;font:600 13px/1.35 system-ui,sans-serif;color:#fff3c8;margin:4px 0;max-width:320px;text-align:left}
.qprog{font:700 12px system-ui,sans-serif;color:#bfe0ff;margin:2px 0 6px}
.result{overflow-y:auto;justify-content:safe center}
#watchBar{position:absolute;left:8px;top:58px;z-index:25;display:flex;gap:6px}
#watchBar .btn{font-size:13px;padding:4px 10px}
#mateTag{position:absolute;left:6px;top:58px;z-index:15;background:rgba(10,40,80,.75);border:2px solid #06223d;border-radius:8px;padding:3px 6px;font-size:12px;display:flex;align-items:center;gap:4px}
#mateTag img{width:20px;border-radius:2px;border:1px solid #0a1a2a}
.reveal.isnew .rays{position:absolute;left:50%;top:45%;width:520px;height:520px;margin:-260px 0 0 -260px;background:repeating-conic-gradient(rgba(255,240,170,.35) 0 10deg,rgba(255,240,170,0) 10deg 22deg);border-radius:50%;animation:crxSpin 6s linear infinite;-webkit-mask:radial-gradient(circle,#000 30%,transparent 68%);mask:radial-gradient(circle,#000 30%,transparent 68%);z-index:-1}
#chestOpen .reveal.isnew .card{animation:crxFlip .9s cubic-bezier(.2,1.3,.4,1) both;box-shadow:0 0 40px 10px rgba(255,230,120,.65)}
.spark{position:absolute;width:8px;height:8px;border-radius:50%;background:#fff6c0;box-shadow:0 0 10px 3px #ffd86a;animation:crxSpark 1.2s ease-out both}
#chestOpen .reveal.isnew .newbig{animation:crxBounce .7s .5s both}
@keyframes crxSpin{to{transform:rotate(360deg)}}
@keyframes crxFlip{0%{transform:perspective(600px) rotateY(180deg) scale(.3);opacity:0}55%{transform:perspective(600px) rotateY(-12deg) scale(1.15);opacity:1}100%{transform:none}}
@keyframes crxSpark{0%{transform:translate(0,0) scale(1);opacity:1}100%{transform:translate(var(--dx),var(--dy)) scale(.2);opacity:0}}
@keyframes crxBounce{0%{transform:scale(0)}60%{transform:scale(1.25)}100%{transform:scale(1)}}
#modal{z-index:58}
.prevArena{width:100%;border-radius:10px;border:2px solid #061c34;display:block;margin:4px 0 8px}
`;
const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);

/* ---------- small helpers ---------- */
const g$ = (root, s) => root.querySelector(s);
const coinI = '<span class="coin" style="display:inline-block;vertical-align:-3px;width:14px;height:14px"></span>';
const gemI = '<span class="gem" style="display:inline-block;vertical-align:-3px;width:13px;height:15px"></span>';
const trI = '<span class="troph" style="display:inline-block;vertical-align:-3px;width:15px;height:15px"></span>';
const RMULT = { C: 1, R: 1.5, E: 2, L: 3 };
const realCards = () => CARDS.filter(c => !c.token);
const monthKey = (d) => { d = d || new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'); };
const longT = s => s >= 2 * 86400 ? Math.floor(s / 86400) + ' days' : fmtT(s);
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
function isTokenFree(id) { return DEF[id] && !DEF[id].token; }
function canHitAir(d) { if (d.type === 'spell') return !d.sp.ground; const u = d.tok ? DEF[d.tok] : d; return u.tgt === 'ag'; }
function dps(d) { const u = d.tok ? DEF[d.tok] : d; return u.dmg && u.hs ? u.dmg / u.hs * (d.count || 1) : 0; }
function splashy(d) { if (d.type === 'spell') return !!(d.sp.dmg || d.sp.dot) && (d.sp.r || 0) >= 2; return !!(d.splash || (d.heal && 0)); }
function isSwarm(d) { return d.type === 'troop' && (d.count || 1) >= 3; }
function isTank(d) { const u = d.tok ? DEF[d.tok] : d; return d.type === 'troop' && (u.hp || 0) * (d.count || 1) >= 1500; }
function winCon(d) { const u = d.tok ? DEF[d.tok] : d; return u.tgt === 'b' || !!d.anywhere || (d.type === 'building' && (u.rng || 0) >= 9); }
function claimBox(text) { return '<p style="text-align:center">' + text + '</p>'; }
function share(text) {
  try { if (navigator.clipboard && navigator.clipboard.writeText) { navigator.clipboard.writeText(text).then(() => toast('Copied!'), () => prompt('Copy this:', text)); return; } } catch (e) {}
  prompt('Copy this:', text);
}

/* ---------- the save: new fields (old saves get them filled in) ---------- */
function fix() {
  const S = SAVE;
  if (!Array.isArray(S.decks) || S.decks.length !== 5) S.decks = [S.deck.slice(), S.deck.slice(), S.deck.slice(), S.deck.slice(), S.deck.slice()];
  S.decks = S.decks.map(d => { const ok = (Array.isArray(d) ? d : []).filter(c => isTokenFree(c) && S.cards[c]); const u = [...new Set(ok)].slice(0, 8); for (const c of S.deck) if (u.length < 8 && !u.includes(c)) u.push(c); return u; });
  if (!(S.dk >= 0 && S.dk < 5)) S.dk = 0;
  if (!Array.isArray(S.drec) || S.drec.length !== 5) S.drec = [0, 1, 2, 3, 4].map(() => ({ w: 0, l: 0, d: 0 }));
  if (!S.mast || typeof S.mast !== 'object') S.mast = {};
  if (!S.emo || typeof S.emo !== 'object') S.emo = { own: ['laugh', 'cry', 'angry', 'thumb', 'cool', 'clap'], pick: ['laugh', 'thumb', 'cry', 'angry'] };
  if (!S.skins || !Array.isArray(S.skins)) S.skins = ['stone'];
  if (!SKIN_PAL[S.skin] || !S.skins.includes(S.skin)) S.skin = 'stone';
  if (!S.stats2 || typeof S.stats2 !== 'object') S.stats2 = { quests: 0, don: 0, replays: 0, duoWins: 0, chal: 0, chalBest: 0 };
  if (!S.chal || typeof S.chal !== 'object') S.chal = null;
  if (!S.chalFree) S.chalFree = '';
  if (!Array.isArray(S.tdeck) || S.tdeck.length !== 8) S.tdeck = S.deck.slice();
  if (S.clan && (typeof S.clan !== 'object' || !/^[A-Z0-9]{6}$/.test(S.clan.tag || ''))) S.clan = null;
  if (!S.war || typeof S.war !== 'object') S.war = { id: '', pts: 0, claimed: [] };
  seasonCheck(true);
  questsCheck();
}
// keep the open deck slot in step with SAVE.deck (the battle and profile code only know SAVE.deck)
const baseSave = window.save;
window.save = function () { try { if (SAVE && SAVE.decks && SAVE.deck) SAVE.decks[SAVE.dk || 0] = SAVE.deck.slice(); } catch (e) {} baseSave(); };

/* ============================================================
   891 / 892: deck slots and deck stats
   ============================================================ */
function deckStats(deck, rec) {
  const ds = deck.map(c => DEF[c]).filter(Boolean);
  const avg = ds.reduce((a, d) => a + d.cost, 0) / Math.max(1, ds.length);
  const cyc = ds.map(d => d.cost).sort((a, b) => a - b).slice(0, 4).reduce((a, b) => a + b, 0);
  const tr = ds.filter(d => d.type === 'troop').length, bu = ds.filter(d => d.type === 'building').length, sp = ds.filter(d => d.type === 'spell').length;
  const air = ds.filter(canHitAir).length, wins = ds.filter(winCon);
  const played = rec ? rec.w + rec.l + rec.d : 0;
  return { avg, cyc, tr, bu, sp, air, wins, played, rate: played ? Math.round(rec.w / played * 100) : null };
}
function deckAdvice(s) {
  const tips = [];
  if (!s.wins.length) tips.push('No card that goes for towers. Add one that targets buildings (like the Hill Giant or Boar Rider) to win games.');
  if (s.air < 2) tips.push('Only ' + s.air + ' card' + (s.air === 1 ? '' : 's') + ' can hit flyers. Add archers, a mage or a spell for air.');
  if (!s.sp) tips.push('No spells. One or two spells help finish towers and clear swarms.');
  if (s.avg > 4.3) tips.push('This deck is heavy (' + s.avg.toFixed(1) + ' Mana). You will often wait for Mana.');
  if (s.avg < 2.6) tips.push('A very cheap deck: fast, but it may struggle against big tanks.');
  return tips;
}
function pickDeck(i) {
  if (i === SAVE.dk) return;
  SAVE.decks[SAVE.dk] = SAVE.deck.slice();
  SAVE.dk = i; SAVE.deck = SAVE.decks[i].slice(); baseSave();
  sfx('click'); renderCards(); toast('Deck ' + (i + 1));
}
window.renderCards = function () {
  const p = $('#pg-cards'), s = deckStats(SAVE.deck, SAVE.drec[SAVE.dk]);
  const cnt = [1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => SAVE.deck.filter(c => DEF[c].cost === n).length), mx = Math.max(1, ...cnt);
  const tips = deckAdvice(s);
  p.innerHTML = (swapCard ? '<div class="swapbar o">Tap a card in your deck to swap in ' + esc(DEF[swapCard].name) + ' <button class="btn grey" id="swX" style="padding:2px 10px;font-size:13px;margin-left:6px">Cancel</button></div>' : '') +
    '<div class="wood"><div class="dtabs o1">' + [0, 1, 2, 3, 4].map(i => '<button data-d="' + i + '" class="' + (i === SAVE.dk ? 'on' : '') + '" aria-label="Deck ' + (i + 1) + '">' + (i + 1) + '</button>').join('') + '</div>' +
    '<div class="whead o"><span>Battle Deck ' + (SAVE.dk + 1) + '</span><small>' + (s.played ? s.played + (s.played === 1 ? ' battle' : ' battles') : 'Not played yet') + '</small></div><div class="cgrid" id="deckG"></div>' +
    '<div class="dstats o1"><div>Average<b>' + s.avg.toFixed(1) + '</b>Mana</div><div>4-card cycle<b>' + s.cyc + '</b>Mana</div><div>Win rate<b>' + (s.rate == null ? '—' : s.rate + '%') + '</b>' + (s.played ? SAVE.drec[SAVE.dk].w + '-' + SAVE.drec[SAVE.dk].l + (SAVE.drec[SAVE.dk].d ? '-' + SAVE.drec[SAVE.dk].d : '') : 'W-L') + '</div><div>Hits air<b>' + s.air + '</b>of 8</div></div>' +
    '<div class="curve" aria-label="Mana curve">' + cnt.map((n, i) => '<span style="height:' + (n / mx * 100) + '%" title="' + n + ' card(s) costing ' + (i + 1) + '"><em>' + (i + 1) + '</em></span>').join('') + '</div>' +
    '<div class="dnote" style="margin-top:16px">' + s.tr + ' troops · ' + s.bu + ' buildings · ' + s.sp + ' spells' + (s.wins.length ? ' · Win condition: ' + s.wins.map(d => esc(d.name)).join(', ') : '') + '</div>' +
    (tips.length ? '<div class="dnote">💡 ' + esc(tips[0]) + '</div>' : '') +
    '</div>' +
    '<div class="cbtns"><button class="btn blue" id="cMast">🎖️ Mastery' + (masteryClaimable() ? ' (' + masteryClaimable() + ')' : '') + '</button><button class="btn" id="cEmo">😀 Emotes</button><button class="btn" id="cSkin">🏰 Tower skins</button><button class="btn grey" id="cCopy">📋 Share deck</button></div>' +
    '<div class="coll"><div class="whead o"><span>Card Collection</span><small style="color:#ffe27a">Found: ' + Object.keys(SAVE.cards).length + '/' + CARDS.length + '</small></div><div class="cgrid" id="collG"></div></div>';
  p.querySelectorAll('.dtabs button').forEach(b => b.onclick = () => pickDeck(+b.dataset.d));
  if (swapCard) $('#swX').onclick = () => { swapCard = null; renderCards(); };
  $('#cMast').onclick = openMastery; $('#cEmo').onclick = openEmotes; $('#cSkin').onclick = openSkins;
  $('#cCopy').onclick = () => share('My Card Royale deck: ' + SAVE.deck.map(c => DEF[c].name).join(', ') + ' (' + s.avg.toFixed(1) + ' Mana)');
  SAVE.deck.forEach((id, i) => {
    const t = cardTile(id); if (swapCard) t.firstChild.classList.add('sel');
    t.onclick = () => { sfx('click'); if (swapCard) { if (!SAVE.deck.includes(swapCard)) SAVE.deck[i] = swapCard; swapCard = null; save(); renderCards(); toast('Deck updated'); } else cardInfo(id); };
    $('#deckG').appendChild(t);
  });
  const rest = CARDS.filter(c => !SAVE.deck.includes(c.id)).sort((a, b) => (SAVE.cards[b.id] ? 1 : 0) - (SAVE.cards[a.id] ? 1 : 0) || a.arena - b.arena || RAR_ORDER[a.rar] - RAR_ORDER[b.rar] || a.cost - b.cost);
  rest.forEach(c => { const t = cardTile(c.id); t.onclick = () => { sfx('click'); cardInfo(c.id); }; $('#collG').appendChild(t); });
};

/* ============================================================
   906: the card info page: stats, every level, counters and mastery
   ============================================================ */
function levelRows(id) {
  const d = DEF[id], u = d.type === 'spell' ? null : d.tok ? DEF[d.tok] : d, out = [];
  for (let lv = 1; lv <= MAX_LV; lv++) {
    const m = LV_MULT(lv);
    if (d.type === 'spell') out.push([lv, d.sp.dmg ? Math.round(d.sp.dmg * m) : d.sp.dot ? Math.round(d.sp.dot * m) + '/s' : d.sp.heal ? Math.round(d.sp.heal * m) + '/s' : '—', d.sp.dmg && d.sp.tower ? Math.round(d.sp.dmg * m * d.sp.tower) : '—']);
    else out.push([lv, Math.round((u.hp || 0) * m), u.dmg ? Math.round(u.dmg * m) : '—', u.dmg && !d.ramp ? Math.round(u.dmg * m / u.hs * (d.count || 1)) : '—']);
  }
  return out;
}
function counters(id) {
  const d = DEF[id], out = [];
  if (d.type === 'spell') return out;
  const u = d.tok ? DEF[d.tok] : d;
  const backline = d.type === 'troop' && (u.rng || 0) >= 4 && (u.hp || 0) * (d.count || 1) < 900;
  for (const c of realCards()) {
    if (c.id === id) continue;
    const cu = c.tok ? DEF[c.tok] : c;
    let sc = 0, why = '';
    const add = (n, w) => { if (n > 0) { sc += n; if (!why || n >= 2.5) why = w; } };
    if (d.air && !canHitAir(c)) continue;
    if (c.type === 'building' && cu.tgt === 'none') continue;
    if (d.air) add(1.5 + dps(c) / 150, 'Hits flyers');
    if (isSwarm(d) || d.spawn) add(splashy(c) ? 3.2 : 0, 'Splash damage clears the whole group');
    if (isTank(d)) { add(c.ramp ? 4.5 : 0, 'Its beam ramps up and melts big tanks'); add(isSwarm(c) && !c.air ? 2.4 : 0, 'Many small hitters surround a slow tank'); add(dps(c) / 140, 'High damage per second'); }
    if (u.tgt === 'b') add(c.type === 'building' && cu.tgt !== 'none' ? 3 : 0, 'A building pulls it away from your towers');
    if (d.type === 'building') { add(cu.tgt === 'b' && c.type === 'troop' ? 2.6 : 0, 'Goes straight for buildings'); add(c.type === 'spell' && (c.sp.dmg || 0) >= 400 ? 2.4 : 0, 'A big spell knocks it down from afar'); }
    if (backline) { add(c.type === 'spell' && (c.sp.dmg || 0) >= 150 ? 2.8 : 0, 'A spell hits it behind the front line'); add(c.anywhere ? 2.4 : 0, 'Pops up right next to it'); }
    if (d.count >= 2 && !isSwarm(d)) add(splashy(c) ? 1.8 : 0, 'Splash damage hits all of them');
    if (d.type === 'troop' && !d.air) { // every ground troop: cheaper, harder hitters, ranged troops for melee ones, swarms around single targets
      if (c.type === 'troop' && c.cost <= d.cost && dps(c) > dps(d) * 1.25) add(1.6, 'Out-damages it for the same Mana or less');
      if ((u.rng || 0) < 2 && c.type !== 'spell' && (cu.rng || 0) >= 4 && cu.tgt !== 'b') add(1.1, 'Hits it from range before it reaches you');
      if ((d.count || 1) === 1 && isSwarm(c) && !c.air) add(1.4, 'A crowd surrounds a single fighter');
      if (u.tgt !== 'b' && c.type === 'building' && cu.tgt !== 'none') add(0.9, 'A building to distract it near your towers');
    }
    if (c.type === 'spell' && !(isSwarm(d) || backline || d.type === 'building' || d.spawn)) sc *= 0.3;
    if (sc > 1.2) out.push({ id: c.id, sc: sc + (SAVE.cards[c.id] ? 0.4 : 0), why });
  }
  return out.sort((a, b) => b.sc - a.sc).slice(0, 4);
}
const MAST = [
  { k: 'p', n: 10, t: 'Play it 10 times', gold: 50 },
  { k: 'w', n: 5, t: 'Win 5 battles with it in your deck', gold: 100 },
  { k: 'p', n: 60, t: 'Play it 60 times', gold: 200, gems: 5 },
  { k: 't', n: 3, t: 'Win 3 battles with three crowns with it in your deck', gold: 300 },
  { k: 'w', n: 30, t: 'Win 30 battles with it in your deck', gold: 600, gems: 20 }
];
function mastOf(id) { const m = SAVE.mast[id] || (SAVE.mast[id] = { w: 0, t: 0, c: 0 }); m.w = m.w | 0; m.t = m.t | 0; m.c = Math.min(MAST.length, m.c | 0); return m; }
function mastHave(id, k) { const m = mastOf(id); return k === 'p' ? (SAVE.used[id] || 0) : k === 'w' ? m.w : m.t; }
function mastReward(id, T) { const mul = RMULT[DEF[id].rar] || 1; return { gold: Math.round(T.gold * mul), gems: T.gems || 0 }; }
function masteryClaimable() { let n = 0; for (const id in SAVE.cards) { const m = mastOf(id), T = MAST[m.c]; if (T && mastHave(id, T.k) >= T.n) n++; } return n; }
function claimMastery(id, then) {
  const m = mastOf(id), T = MAST[m.c]; if (!T || mastHave(id, T.k) < T.n) return;
  const r = mastReward(id, T); m.c++; SAVE.gold += r.gold; SAVE.gems += r.gems; save(); sfx('chest');
  toast(DEF[id].name + ' mastery ' + m.c + ': +' + r.gold + ' gold' + (r.gems ? ', +' + r.gems + ' gems' : ''));
  checkUnlocks(); renderTop(); renderNavDots(); if (then) then();
}
function mastHTML(id) {
  const m = mastOf(id);
  return '<p style="font-size:12px;text-align:center">Mastery levels for ' + esc(DEF[id].name) + ': ' + m.c + '/' + MAST.length + '. Battles count when the card is in your deck (not in Training Camp).</p>' +
    MAST.map((T, i) => {
      const have = Math.min(T.n, mastHave(id, T.k)), done = i < m.c, cur = i === m.c, r = mastReward(id, T);
      return '<div class="mq o1' + (done ? ' done' : '') + '"><div class="t">' + (i + 1) + '. ' + esc(T.t) + '<small>' + coinI + ' ' + r.gold + (r.gems ? ' ' + gemI + ' ' + r.gems : '') + '</small></div>' +
        (done ? '✔' : cur && have >= T.n ? '<button class="btn green" data-mc="' + id + '">Claim</button>' : '<div class="bar"><i style="width:' + (have / T.n * 100) + '%"></i><span>' + have + '/' + T.n + '</span></div>') + '</div>';
    }).join('');
}
window.cardInfo = function (id, tab) {
  const d = DEF[id], have = SAVE.cards[id];
  if (have && !SAVE.seen[id]) { SAVE.seen[id] = true; save(); renderNavDots(); }
  const lv = have ? have.lv : 1, need = have && lv < MAX_LV ? UP_COPIES[d.rar][lv - 1] : 0, gold = have && lv < MAX_LV ? UP_GOLD[lv - 1] * UP_GOLD_MULT[d.rar] : 0, inDeck = SAVE.deck.includes(id);
  tab = tab || 'stats';
  const kind = d.type === 'troop' ? 'Troop' : d.type === 'building' ? 'Building' : 'Spell';
  let body = '';
  if (tab === 'stats') body = '<div class="stats">' + statRows(id, lv) + '</div>';
  else if (tab === 'levels') {
    const R = levelRows(id), sp = d.type === 'spell';
    body = '<table class="lvtbl o1"><tr><th>Level</th>' + (sp ? '<th>Damage</th><th>To towers</th>' : '<th>Hitpoints</th><th>Damage</th><th>DPS</th>') + '</tr>' +
      R.map(r => '<tr class="' + (have && r[0] === lv ? 'me' : '') + '">' + r.map(v => '<td>' + v + '</td>').join('') + '</tr>').join('') + '</table>' +
      '<p style="font-size:12px;text-align:center;margin-top:6px">Every level adds 10%.' + (have ? ' Yours is level ' + lv + '.' : '') + '</p>';
  } else if (tab === 'counters') {
    const C = counters(id);
    body = d.type === 'spell' ? '<p>Spells can’t be blocked. To lose less to ' + esc(d.name) + ', spread your troops out' + (d.sp.r ? ' (it covers a radius of ' + d.sp.r + ' tiles)' : '') + ' and don’t bunch them in front of your towers.</p>'
      : C.length ? '<p style="font-size:12px;text-align:center">Good cards to play against ' + esc(d.name) + ':</p>' + C.map(c => '<div class="ctr"><div class="slotK" data-k="' + c.id + '"></div><div class="t o1">' + esc(DEF[c.id].name) + '<small>' + esc(c.why) + (SAVE.cards[c.id] ? '' : ' · not found yet') + '</small></div></div>').join('')
      : '<p>Hard to counter with one card: defend with a mix of troops near your towers.</p>';
    if (d.type !== 'spell') body += '<p style="font-size:12px;text-align:center">' + (d.air ? 'It flies: only cards that hit air can touch it.' : isTank(d) ? 'A tank: let your towers help and hit it with lots of damage.' : isSwarm(d) ? 'A swarm: one splash card or spell beats it cheaply.' : '') + '</p>';
  } else body = have ? mastHTML(id) : '<p style="text-align:center">Find this card to start its mastery.</p>';
  const b = modal('<h2>' + esc(d.name) + '</h2><div class="cinfo"><div class="slotC"></div><div class="meta"><div style="font-size:15px;color:' + ({ C: '#dfe8f4', R: '#ffb070', E: '#e0a0ff', L: '#a0fff0' })[d.rar] + '">' + RAR[d.rar] + ' ' + kind + ' · ' + d.cost + ' Mana</div>' +
    (have ? '<div style="font-size:20px">Level ' + lv + '</div><div class="prog o1' + (canUpgrade(id) ? ' up' : '') + '" style="margin:4px 0"><i style="width:' + (need ? Math.min(100, have.n / need * 100) : 100) + '%"></i><span>' + (need ? have.n + '/' + need : 'MAX') + '</span></div>'
      : '<div style="font-size:15px;color:#ffe27a">' + (d.arena > arena() ? '🔒 Unlocks in Arena ' + (d.arena + 1) + ' (' + ARENAS[d.arena].tr + ' trophies)' : '🔒 Find it in chests') + '</div>') +
    '<p style="font-size:12px">' + esc(d.desc) + '</p></div></div>' +
    '<div class="tabs2 o1">' + [['stats', 'Stats'], ['levels', 'Levels'], ['counters', 'Counters'], ['mastery', 'Mastery']].map(([k, t]) => '<button data-t="' + k + '" class="' + (k === tab ? 'on' : '') + '">' + t + '</button>').join('') + '</div>' + body +
    (have ? '<div class="mrow">' + (inDeck ? '' : '<button class="btn blue" id="mUse">Use</button>') +
      (lv < MAX_LV ? '<button class="btn green" id="mUp"' + (canUpgrade(id) ? '' : ' disabled') + '>Upgrade<br><small style="font-size:12px">' + coinI + ' ' + gold + '</small></button>' : '') + '</div>' +
      (lv < MAX_LV && have.n < need ? '<p style="text-align:center;font-size:12px;margin-top:6px">Collect ' + (need - have.n) + ' more to upgrade.</p>' : '') : ''));
  b.querySelector('.slotC').replaceWith(cardEl(id));
  b.querySelectorAll('.slotK').forEach(s => { const c = cardEl(s.dataset.k); c.onclick = () => cardInfo(s.dataset.k); s.replaceWith(c); });
  b.querySelectorAll('.tabs2 button').forEach(t => t.onclick = () => { sfx('click'); cardInfo(id, t.dataset.t); });
  b.querySelectorAll('[data-mc]').forEach(x => x.onclick = () => claimMastery(id, () => cardInfo(id, 'mastery')));
  const u = b.querySelector('#mUse'); if (u) u.onclick = () => { swapCard = id; closeModal(); goPage('cards'); };
  const up = b.querySelector('#mUp'); if (up) up.onclick = () => {
    if (!canUpgrade(id)) return;
    have.n -= need; SAVE.gold -= gold; have.lv++;
    const xp = UP_XP[lv - 1] * UP_XP_MULT[d.rar];
    sfx('chest'); save(); closeModal(); upgradeFx(id, have.lv); toast(d.name + ' is now level ' + have.lv + '! +' + xp + ' XP');
    addXP(xp); renderAll();
  };
};
function openMastery() {
  sfx('click');
  const ids = Object.keys(SAVE.cards).filter(isTokenFree).sort((a, b) => { const ca = MAST[mastOf(a).c], cb = MAST[mastOf(b).c]; const ra = ca && mastHave(a, ca.k) >= ca.n ? 1 : 0, rb = cb && mastHave(b, cb.k) >= cb.n ? 1 : 0; return rb - ra || mastOf(b).c - mastOf(a).c || (SAVE.used[b] || 0) - (SAVE.used[a] || 0); });
  const b = modal('<h2>Card Mastery</h2><p style="text-align:center;font-size:12px">Every card has 5 mastery levels. Play it and win with it to earn gold and gems.</p><div id="mList"></div>');
  const L = b.querySelector('#mList');
  for (const id of ids) {
    const m = mastOf(id), T = MAST[m.c], have = T ? Math.min(T.n, mastHave(id, T.k)) : 0, ready = T && have >= T.n;
    const row = el('div', 'mq o1'); row.innerHTML = '<div class="slotM"></div><div class="t">' + esc(DEF[id].name) + '<small>' + (T ? 'Level ' + (m.c + 1) + ': ' + esc(T.t) : 'Mastered! ⭐') + '</small></div>' + (ready ? '<button class="btn green">Claim</button>' : T ? '<div class="bar"><i style="width:' + (have / T.n * 100) + '%"></i><span>' + have + '/' + T.n + '</span></div>' : '');
    const c = cardEl(id); c.style.width = '40px'; c.style.flex = 'none'; row.querySelector('.slotM').replaceWith(c);
    const btn = row.querySelector('.btn'); if (btn) btn.onclick = e => { e.stopPropagation(); claimMastery(id, openMastery); };
    row.onclick = () => cardInfo(id, 'mastery'); row.style.cursor = 'pointer';
    L.appendChild(row);
  }
}

/* ============================================================
   912: card unlock animation (and a little burst when a card levels up)
   ============================================================ */
function burst(host) {
  for (let i = 0; i < 18; i++) { const s = el('i', 'spark'); const a = i / 18 * Math.PI * 2; s.style.left = '50%'; s.style.top = '42%'; s.style.setProperty('--dx', Math.cos(a) * (90 + Math.random() * 70) + 'px'); s.style.setProperty('--dy', Math.sin(a) * (90 + Math.random() * 70) + 'px'); s.style.animationDelay = (0.35 + Math.random() * 0.25) + 's'; host.appendChild(s); }
}
// openChest's card step (index.html) tags a new card's reveal with .isnew; this adds the rays and sparks
new MutationObserver(ms => { for (const m of ms) for (const n of m.addedNodes) if (n.nodeType === 1 && n.classList && n.classList.contains('reveal') && n.classList.contains('isnew') && !n._fx) { n._fx = 1; n.prepend(el('div', 'rays')); burst(n); try { sfx('win'); } catch (e) {} } })
  .observe($('#chestOpen'), { childList: true });
function upgradeFx(id, lv) {
  const ov = el('div'); ov.style.cssText = 'position:absolute;inset:0;z-index:70;display:flex;flex-direction:column;align-items:center;justify-content:center;background:radial-gradient(ellipse at 50% 45%,rgba(60,140,230,.9),rgba(10,30,60,.92) 75%);cursor:pointer';
  const r = el('div', 'reveal isnew o'); r.style.cssText = 'position:relative;display:flex;flex-direction:column;align-items:center';
  const c = cardEl(id); c.style.width = '150px'; r.appendChild(c);
  r.insertAdjacentHTML('beforeend', '<div style="font-size:26px;margin-top:10px">' + esc(DEF[id].name) + '</div><div style="font-size:34px;color:#ffe27a">Level ' + lv + '!</div>');
  ov.appendChild(r); $('#app').appendChild(ov);
  const rays = el('div'); rays.style.cssText = 'position:absolute;left:50%;top:45%;width:460px;height:460px;margin:-230px 0 0 -230px;background:repeating-conic-gradient(rgba(255,240,170,.3) 0 10deg,rgba(255,240,170,0) 10deg 22deg);border-radius:50%;animation:crxSpin 6s linear infinite;-webkit-mask:radial-gradient(circle,#000 30%,transparent 68%);mask:radial-gradient(circle,#000 30%,transparent 68%)';
  ov.prepend(rays); c.style.animation = 'crxFlip .8s cubic-bezier(.2,1.3,.4,1) both';
  burst(ov);
  const go = () => ov.remove(); ov.onclick = go; setTimeout(go, 2200);
}

/* ============================================================
   903 / 904: emotes and tower skins (collect them, pick them)
   ============================================================ */
const QUICK = ['gl', 'wp', 'wow', 'ty', 'oops', 'gg', 'close'];
const EMOTE_INFO = {
  laugh: 'Starter emote', cry: 'Starter emote', angry: 'Starter emote', thumb: 'Starter emote', cool: 'Starter emote', clap: 'Starter emote',
  fire: 'Win 10 battles', think: 'Play a challenge', sleep: 'Reach King Level 5', party: 'Season road reward', shock: 'Win with three crowns',
  crown: 'Reach 1000 trophies', heart: 'Donate 5 cards to your clan', muscle: 'Finish 10 daily quests', ghost: 'Watch a replay or a TV Royale battle',
  dragon: 'Finish every mastery level of one card', star: 'Reach Starfall Summit (4000 trophies)', shield: 'Win a 2v2 battle', sword: 'Win 6 battles in one challenge run'
};
const SKIN_INFO = { stone: 'Starter skin', sand: 'Reach Sunbaked Bowl (Arena 4)', forest: 'Win 25 battles', frost: 'Reach Frostspire (Arena 8)', dusk: 'Season road reward', marble: 'Reach Starfall Summit', candy: 'Shop: 300 gems' };
function earned() {
  const S = SAVE, s2 = S.stats2, out = [];
  const anyMastered = Object.keys(S.cards).some(id => mastOf(id).c >= MAST.length);
  const E = { fire: S.wins >= 10, think: s2.chal >= 1, sleep: S.kl >= 5, shock: S.three >= 1, crown: S.best >= 1000, heart: s2.don >= 5, muscle: s2.quests >= 10, ghost: s2.replays >= 1, dragon: anyMastered, star: S.best >= 4000, shield: s2.duoWins >= 1, sword: s2.chalBest >= 6 };
  for (const k in E) if (E[k] && !S.emo.own.includes(k)) { S.emo.own.push(k); out.push({ k, emo: 1 }); }
  const K = { sand: S.best >= 1000, forest: S.wins >= 25, frost: S.best >= 2300, marble: S.best >= 4000 };
  for (const k in K) if (K[k] && !S.skins.includes(k)) { S.skins.push(k); out.push({ k, skin: 1 }); }
  return out;
}
function checkUnlocks() {
  const got = earned(); if (!got.length) return;
  save();
  got.forEach((x, i) => setTimeout(() => toast(x.emo ? 'New emote: ' + (EMOTES.find(e => e.k === x.k) || {}).f + ' ' + EMOTE_INFO[x.k] : 'New tower skin: ' + SKIN_PAL[x.k].n + '!', 2400), 600 + i * 2500));
}
CRX.battleEmotes = () => {
  const pick = (SAVE.emo.pick || []).filter(k => SAVE.emo.own.includes(k)).slice(0, 4);
  return QUICK.map(k => EMOTES.find(e => e.k === k)).filter(Boolean).concat(pick.map(k => EMOTES.find(e => e.k === k)).filter(Boolean));
};
function openEmotes() {
  sfx('click'); checkUnlocks();
  const faces = EMOTES.filter(e => e.f), pick = SAVE.emo.pick;
  const b = modal('<h2>Emotes</h2><p style="text-align:center;font-size:12px">Pick the four emotes you take into battle (quick chats like Good luck! are always there). Tap a locked one to see how to get it.</p><div class="emoGrid">' +
    faces.map(e => { const own = SAVE.emo.own.includes(e.k), i = pick.indexOf(e.k); return '<button data-k="' + e.k + '" class="' + (!own ? 'lock' : i >= 0 ? 'on' : '') + '" aria-label="' + esc(EMOTE_INFO[e.k] || '') + '">' + e.f + (i >= 0 ? '<small class="o1">' + (i + 1) + '</small>' : !own ? '<small>🔒</small>' : '') + '</button>'; }).join('') +
    '</div><p style="text-align:center;font-size:12px;margin-top:8px">Collected ' + faces.filter(e => SAVE.emo.own.includes(e.k)).length + '/' + faces.length + '</p>');
  b.querySelectorAll('.emoGrid button').forEach(x => x.onclick = () => {
    const k = x.dataset.k;
    if (!SAVE.emo.own.includes(k)) { toast('🔒 ' + (EMOTE_INFO[k] || 'Locked'), 2200); return; }
    const i = pick.indexOf(k);
    if (i >= 0) { if (pick.length <= 1) { toast('Keep at least one'); return; } pick.splice(i, 1); }
    else { if (pick.length >= 4) pick.shift(); pick.push(k); }
    save(); sfx('emote'); openEmotes();
  });
}
function skinCanvas(k, w, h) {
  const c = document.createElement('canvas'), dpr = Math.min(2, devicePixelRatio || 1); c.width = w * dpr; c.height = h * dpr;
  const g2 = c.getContext('2d'); g2.scale(dpr, dpr);
  const old = TOWER_SKIN[0]; TOWER_SKIN[0] = k;
  try {
    const s = h / 4.6, P = towerLayer('princess', 0, s, 'live'), K = towerLayer('king', 0, s * 1.05, 'live');
    g2.drawImage(P.c, w * 0.22 - P.ox, h * 0.78 - P.oy, P.w, P.h); g2.drawImage(K.c, w * 0.66 - K.ox, h * 0.8 - K.oy, K.w, K.h);
  } catch (e) {}
  TOWER_SKIN[0] = old;
  return c;
}
function openSkins() {
  sfx('click'); checkUnlocks();
  const b = modal('<h2>Tower Skins</h2><p style="text-align:center;font-size:12px">Your skin is used on your King and Guard Towers, and your opponent sees it online too.</p><div class="skinGrid"></div>');
  const G = b.querySelector('.skinGrid');
  for (const k in SKIN_PAL) {
    const own = SAVE.skins.includes(k), on = SAVE.skin === k;
    const bt = el('button', 'o1' + (on ? ' on' : '') + (own ? '' : ' lock'));
    bt.appendChild(skinCanvas(k, 150, 76));
    bt.insertAdjacentHTML('beforeend', '<div>' + esc(SKIN_PAL[k].n) + (on ? ' ✔' : '') + '</div><small>' + (own ? (on ? 'In use' : 'Tap to use') : '🔒 ' + esc(SKIN_INFO[k] || '')) + '</small>');
    bt.onclick = () => {
      if (!own) { if (k === 'candy') { openShopSkin(); return; } toast('🔒 ' + SKIN_INFO[k], 2200); return; }
      SAVE.skin = k; save(); sfx('click'); openSkins();
    };
    G.appendChild(bt);
  }
}
function openShopSkin() {
  const own = SAVE.skins.includes('candy');
  const b = modal('<h2>' + esc(SKIN_PAL.candy.n) + '</h2><div id="sk1" style="text-align:center"></div><p style="text-align:center">A sweet pink tower skin for your King and Guard Towers.</p><div class="mrow">' + (own ? '<p>You have it!</p>' : '<button class="btn green" id="skBuy">Buy ' + gemI + ' 300</button>') + '</div>');
  b.querySelector('#sk1').appendChild(skinCanvas('candy', 220, 110));
  const bb = b.querySelector('#skBuy'); if (bb) bb.onclick = () => { if (SAVE.gems < 300) { toast('Not enough gems'); return; } SAVE.gems -= 300; SAVE.skins.push('candy'); SAVE.skin = 'candy'; save(); sfx('chest'); closeModal(); renderAll(); toast('Candy Castle is yours!'); };
}

/* ============================================================
   914: daily quests for gold
   ============================================================ */
const QUESTS = [
  { k: 'win', t: n => 'Win ' + n + ' battles', n: [2, 3], g: 1 },
  { k: 'cards', t: n => 'Play ' + n + ' cards', n: [25, 40], g: 0.8 },
  { k: 'crowns', t: n => 'Knock down ' + n + ' towers', n: [3, 6], g: 1 },
  { k: 'spells', t: n => 'Cast ' + n + ' spells', n: [6, 10], g: 0.8 },
  { k: 'mana', t: n => 'Spend ' + n + ' Mana', n: [120, 200], g: 0.9 },
  { k: 'three', t: () => 'Win a battle with three crowns', n: [1, 1], g: 1.4 },
  { k: 'duo', t: () => 'Play a 2v2 battle', n: [1, 1], g: 0.8 },
  { k: 'chal', t: () => 'Play a challenge battle', n: [1, 1], g: 0.8 },
  { k: 'battles', t: n => 'Play ' + n + ' battles', n: [3, 4], g: 0.9 }
];
function questsCheck() {
  const day = dayKey();
  if (SAVE.quests && SAVE.quests.day === day && Array.isArray(SAVE.quests.list)) return;
  const rnd = mkRng(+day.split('-').join('') * 13 + 7 + (SAVE.tag || '').charCodeAt(2));
  const pool = shuffle(QUESTS.slice(), rnd).slice(0, 3);
  SAVE.quests = { day, bonus: false, list: pool.map(q => { const n = q.n[0] + Math.floor(rnd() * (q.n[1] - q.n[0] + 1)); return { k: q.k, n, have: 0, gold: Math.round((40 + arena() * 12) * q.g / 5) * 5, done: false }; }) };
  if (typeof baseSave === 'function') baseSave();
}
function questText(q) { const Q = QUESTS.find(x => x.k === q.k); return Q ? Q.t(q.n) : q.k; }
function questsReady() { questsCheck(); return SAVE.quests.list.filter(q => !q.done && q.have >= q.n).length + (!SAVE.quests.bonus && SAVE.quests.list.every(q => q.done) ? 1 : 0); }
function questAdd(k, n) { questsCheck(); let hit = false; for (const q of SAVE.quests.list) if (q.k === k && !q.done && q.have < q.n) { q.have = Math.min(q.n, q.have + n); hit = true; } return hit; }
function openQuests() {
  sfx('click'); questsCheck();
  const Q = SAVE.quests, all = Q.list.every(q => q.done);
  const b = modal('<h2>Daily Quests</h2><p class="qhead">New quests in ' + fmtT(msToMidnight() / 1000) + '. Quests count in every battle except Training Camp.</p>' +
    Q.list.map((q, i) => '<div class="mq o1' + (q.done ? ' done' : '') + '"><div class="t">' + esc(questText(q)) + '<small>' + coinI + ' ' + q.gold + ' gold</small></div>' +
      (q.done ? '✔' : q.have >= q.n ? '<button class="btn green" data-q="' + i + '">Claim</button>' : '<div class="bar"><i style="width:' + (q.have / q.n * 100) + '%"></i><span>' + q.have + '/' + q.n + '</span></div>') + '</div>').join('') +
    '<div class="mq o1' + (Q.bonus ? ' done' : '') + '"><div class="t">Finish all three<small>' + gemI + ' 10 gems</small></div>' + (Q.bonus ? '✔' : all ? '<button class="btn green" id="qB">Claim</button>' : '') + '</div>');
  b.querySelectorAll('[data-q]').forEach(x => x.onclick = () => { const q = Q.list[+x.dataset.q]; if (q.done || q.have < q.n) return; q.done = true; SAVE.gold += q.gold; SAVE.stats2.quests++; save(); sfx('chest'); toast('+' + q.gold + ' gold'); checkUnlocks(); renderTop(); openQuests(); refreshDots(); });
  const bb = b.querySelector('#qB'); if (bb) bb.onclick = () => { Q.bonus = true; SAVE.gems += 10; save(); sfx('chest'); toast('+10 gems'); renderTop(); openQuests(); refreshDots(); };
}

/* ============================================================
   900: the season road (resets every month) and the Legend arena reset
   ============================================================ */
const SEASON = [
  { at: 20, r: { gold: 100 } }, { at: 60, r: { chest: 'silver' } }, { at: 120, r: { gems: 10 } }, { at: 200, r: { emote: 'party' } },
  { at: 300, r: { chest: 'gold' } }, { at: 420, r: { gold: 400 } }, { at: 560, r: { gems: 25 } }, { at: 720, r: { chest: 'magic' } },
  { at: 900, r: { skin: 'dusk' } }, { at: 1100, r: { gold: 1000 } }, { at: 1350, r: { chest: 'giant' } }, { at: 1600, r: { chest: 'legend' } }
];
const LEGEND_TR = 4000;
function seasonCheck(quiet) {
  const id = monthKey(), S = SAVE;
  if (!S.season || typeof S.season !== 'object') S.season = { id, pts: 0, hi: S.tr, claimed: [] };
  if (S.season.id === id) { S.season.hi = Math.max(S.season.hi || 0, S.tr); return null; }
  // a new season: give out what was reached but not claimed (gold and gems only), and the Legend arena resets half way
  const old = S.season, missed = SEASON.filter((m, i) => old.pts >= m.at && !old.claimed.includes(i));
  let gold = 0, gems = 0; for (const m of missed) { gold += m.r.gold || 0; gems += m.r.gems || 0; }
  S.gold += gold; S.gems += gems;
  const before = S.tr; if (S.tr > LEGEND_TR) S.tr = LEGEND_TR + Math.floor((S.tr - LEGEND_TR) / 2);
  const info = { last: old, gold, gems, before, after: S.tr };
  S.season = { id, pts: 0, hi: S.tr, claimed: [], prev: { id: old.id, pts: old.pts, hi: old.hi } };
  if (!quiet) { save(); showNewSeason(info); } else setTimeout(() => showNewSeason(info), 1200);
  return info;
}
function showNewSeason(info) {
  if (BT) return;
  const [y, m] = monthKey().split('-');
  modal('<h2>New season!</h2><p style="text-align:center">The ' + MONTHS[+m - 1] + ' ' + y + ' season has started. The season road starts again from 0, with new rewards to win.</p>' +
    (info.before !== info.after ? '<p style="text-align:center">Your trophies above ' + LEGEND_TR + ' were halved: ' + trI + ' ' + info.before + ' → ' + info.after + '.</p>' : '') +
    (info.gold || info.gems ? '<p style="text-align:center">Rewards you reached last season but didn’t claim: ' + (info.gold ? coinI + ' ' + info.gold + ' ' : '') + (info.gems ? gemI + ' ' + info.gems : '') + '</p>' : '') +
    '<p style="text-align:center">Last season you earned ' + (info.last.pts || 0) + ' season trophies and peaked at ' + trI + ' ' + (info.last.hi || 0) + '.</p>');
}
function seasonEnds() { const n = new Date(), e = new Date(n.getFullYear(), n.getMonth() + 1, 1); return (e - n) / 1000; }
function rewardHTML(r, small) {
  if (r.gold) return coinI + ' ' + r.gold + ' gold';
  if (r.gems) return gemI + ' ' + r.gems + ' gems';
  if (r.chest) return esc(CHESTS[r.chest].n);
  if (r.emote) return (EMOTES.find(e => e.k === r.emote) || {}).f + ' Emote';
  if (r.skin) return esc(SKIN_PAL[r.skin].n) + ' skin';
  return '';
}
function giveReward(r, then) {
  if (r.gold) SAVE.gold += r.gold; if (r.gems) SAVE.gems += r.gems;
  if (r.emote && !SAVE.emo.own.includes(r.emote)) SAVE.emo.own.push(r.emote);
  if (r.skin && !SAVE.skins.includes(r.skin)) SAVE.skins.push(r.skin);
  save(); renderTop();
  if (r.chest) openChest(r.chest, arena(), then); else { sfx('chest'); toast('+' + rewardHTML(r).replace(/<[^>]+>/g, '').trim()); if (then) then(); }
}
function seasonReady() { const S = SAVE.season; return SEASON.filter((m, i) => S.pts >= m.at && !S.claimed.includes(i)).length; }
function openSeason() {
  sfx('click'); seasonCheck();
  let ov = $('#seasonOv'); if (!ov) { ov = el('div', 'blue'); ov.id = 'seasonOv'; $('#app').appendChild(ov); }
  ov.classList.remove('hide');
  const S = SAVE.season, [y, m] = monthKey().split('-');
  ov.innerHTML = '<div class="ovHead"><span class="ribbon o">Season Road</span><button class="x o" aria-label="Close">✕</button></div><div class="ovBody">' +
    '<div class="panel o"><div style="display:flex;justify-content:space-between;align-items:center"><span>' + MONTHS[+m - 1] + ' ' + y + '</span><span style="font-size:13px;color:#bfe0ff">Ends in ' + longT(seasonEnds()) + '</span></div>' +
    '<div style="font-size:26px;text-align:center;margin:4px 0">' + trI + ' ' + S.pts + ' <small style="font-size:13px">season trophies</small></div>' +
    '<p style="font-size:12px;font-family:system-ui;font-weight:600;color:#cfe6ff;text-shadow:none">Every trophy you win in ranked battles this month counts (losses don’t take any away), and each 2v2 or challenge win adds 10. The road starts again on the 1st. Above ' + LEGEND_TR + ' trophies, half of what is over ' + LEGEND_TR + ' goes when a season ends.</p>' +
    '<p style="font-size:12px;font-family:system-ui;font-weight:600;color:#cfe6ff;text-shadow:none">This season’s best: ' + trI + ' ' + (S.hi || SAVE.tr) + (S.prev ? ' · Last season: ' + (S.prev.pts || 0) + ' season trophies' : '') + '</p></div>' +
    '<div class="road2 o1">' + SEASON.map((M, i) => { const got = S.pts >= M.at, cl = S.claimed.includes(i); return '<div class="ms' + (got ? ' got' : '') + '" data-n="' + M.at + '"><div class="ic">' + (M.r.chest ? '<span data-ch="' + M.r.chest + '"></span>' : M.r.gold ? '💰' : M.r.gems ? '💎' : M.r.emote ? (EMOTES.find(e => e.k === M.r.emote) || {}).f : '🏰') + '</div><div class="t">' + rewardHTML(M.r) + '<small>' + (cl ? 'Claimed' : got ? 'Ready!' : (M.at - S.pts) + ' to go') + '</small></div>' + (got && !cl ? '<button class="btn green" data-s="' + i + '">Claim</button>' : cl ? '✔' : '') + '</div>'; }).join('') + '</div>' +
    '<div class="mrow"><button class="btn blue" id="sLb">🏆 Season leaderboard</button></div></div>';
  ov.querySelectorAll('[data-ch]').forEach(x => x.replaceWith(chestCanvas(x.dataset.ch, 40)));
  ov.querySelector('.x').onclick = () => { sfx('click'); ov.classList.add('hide'); ov.innerHTML = ''; renderAll(); };
  ov.querySelectorAll('[data-s]').forEach(x => x.onclick = () => { const i = +x.dataset.s; if (S.claimed.includes(i) || S.pts < SEASON[i].at) return; S.claimed.push(i); save(); giveReward(SEASON[i].r, () => { if ($('#seasonOv') && !$('#seasonOv').classList.contains('hide')) openSeason(); }); if (!SEASON[i].r.chest) openSeason(); });
  ov.querySelector('#sLb').onclick = openLeaderboard;
}

/* ============================================================
   910: season leaderboard (every player's Card Royale line from the arcade's player list: games.js stat())
   ============================================================ */
const ACC = () => { try { return (window.parent !== window && window.parent.ArcadeAccount) || window.ArcadeAccount || null; } catch (e) { return window.ArcadeAccount || null; } };
const SERVER = () => { const A = ACC(); return (A && A.server) || 'https://arcade-realtime.arcade-realtime.workers.dev'; };
async function loadBoard(force) {
  const KEY = 'cr-lb', TTL = 5 * 60e3;
  try { const c = JSON.parse(sessionStorage.getItem(KEY) || 'null'); if (!force && c && Date.now() - c.at < TTL) return c.rows; } catch (e) {}
  const r = await fetch(SERVER() + '/acct/top?g=card-royale', { cache: 'no-store' });
  if (!r.ok) throw new Error('bad');
  const j = await r.json(); if (!Array.isArray(j.top)) throw new Error('bad');
  const [y, m] = monthKey().split('-'), tag = 'Season ' + m + '/' + y.slice(2);
  const rows = j.top.map(x => { const s = String(x.s || ''), t = /(\d+) trophies/.exec(s), se = new RegExp(tag.replace('/', '\\/') + ': (\\d+)').exec(s); return { n: String(x.n), tr: t ? +t[1] : 0, se: se ? +se[1] : null }; });
  try { sessionStorage.setItem(KEY, JSON.stringify({ at: Date.now(), rows })); } catch (e) {}
  return rows;
}
async function openLeaderboard(tab) {
  sfx('click'); tab = tab === 'all' ? 'all' : 'season';
  const b = modal('<h2>🏆 Leaderboard</h2><div class="tabs2 o1"><button data-t="season" class="' + (tab === 'season' ? 'on' : '') + '">This season</button><button data-t="all" class="' + (tab === 'all' ? 'on' : '') + '">Trophies</button></div><div id="lbL"><p style="text-align:center">Loading…</p></div>' +
    '<p style="font-size:11px;text-align:center;margin-top:6px">Players with an Arcade account. "This season" ranks the best trophies reached this month.</p>');
  b.querySelectorAll('.tabs2 button').forEach(t => t.onclick = () => openLeaderboard(t.dataset.t));
  const L = b.querySelector('#lbL');
  try {
    const rows = (await loadBoard()).filter(r => tab === 'all' ? r.tr > 0 : r.se != null).sort((a, c) => tab === 'all' ? c.tr - a.tr : c.se - a.se).slice(0, 100);
    if (!L.isConnected) return;
    const me = myName().toLowerCase();
    L.innerHTML = rows.length ? rows.map((r, i) => '<div class="lbrow o1' + (r.n.toLowerCase() === me ? ' me' : '') + '"><span class="n">' + (i + 1) + '</span><span class="nm">' + esc(r.n) + '</span>' + trI + ' ' + (tab === 'all' ? r.tr : r.se) + '</div>').join('')
      : '<p style="text-align:center">Nobody on the board yet this season. Win some battles with an Arcade account to be first!</p>';
  } catch (e) { if (L.isConnected) L.innerHTML = '<p style="text-align:center">The leaderboard couldn’t load. Check your connection and try again.</p>'; }
}

/* ============================================================
   Battles: helpers shared by challenges, training, 2v2 and friendly battles
   ============================================================ */
function avgLevel(deck, lv) { return deck.reduce((a, c) => a + ((lv && lv[c]) || cardLv(c)), 0) / deck.length; }
function botProfile(deck, lv, extra) {
  const tr = Math.max(0, SAVE.tr + rint(-25, 25)), kl = Math.max(1, Math.min(MAX_KL, SAVE.kl + rint(-1, 1)));
  const p = Object.assign({ name: botName(), tr, kl, deck, lv, bot: true }, extra || {});
  p.st = botStats(p.tr, p.kl, p.deck); p.sk = Object.keys(SKIN_PAL)[rint(0, 3)];
  return p;
}
function randomBot(avgLv) { const bd = botDeck(Math.random, arena(), avgLv); return botProfile(bd.deck, bd.lv); }
function lvMap(deck, lv) { const o = {}; deck.forEach(c => { o[c] = lv; }); return o; }
// a battle against bots that doesn't change trophies; onEnd(out, myCrowns, theirCrowns) gives the result screen's rewards
function customBattle(o) {
  const me = o.me || profile();
  startBattle(Object.assign({ mode: 'bot', side: 0, seed: (Math.random() * 2 ** 31) | 0, me, arena: arena(), botLvl: arena() + 1, botSlow: 0 }, o, { me }));
}

/* ============================================================
   895 / 907: challenges with special rules (Triple Mana, Mirror, Draft) and the draft itself
   ============================================================ */
const CHALS = {
  triple: { n: 'Triple Mana', ic: '⚡', d: 'Mana fills three times as fast. Your own deck against a bot deck. Fast and wild!', rules: { elx: 3 } },
  mirror: { n: 'Mirror Battle', ic: '🪞', d: 'Your opponent plays your exact deck, at your levels. Who uses it better?' },
  draft: { n: 'Draft Challenge', ic: '🎴', d: 'Before each battle you and your opponent pick cards one by one from pairs. Every card is level 9.' }
};
const CHAL_WINS = 8, CHAL_LOSSES = 3, CHAL_COST = 10, DRAFT_LV = 9;
function chalChest(w) { return w >= 8 ? 'giant' : w >= 6 ? 'magic' : w >= 4 ? 'gold' : w >= 2 ? 'silver' : null; }
function openChallenges() {
  sfx('click');
  const C = SAVE.chal, free = SAVE.chalFree !== dayKey();
  if (C && CHALS[C.type]) {
    const T = CHALS[C.type];
    const b = modal('<h2>' + T.ic + ' ' + esc(T.n) + '</h2><p style="text-align:center">' + esc(T.d) + '</p><div class="pips">' + Array.from({ length: CHAL_WINS }, (_, i) => '<i class="' + (i < C.w ? 'w' : '') + '"></i>').join('') + '</div>' +
      '<p style="text-align:center">Wins: ' + C.w + '/' + CHAL_WINS + ' · Losses: ' + C.l + '/' + CHAL_LOSSES + '</p><p style="text-align:center;font-size:12px">Each win: ' + coinI + ' 20. At the end: ' + coinI + ' 40 a win' + (chalChest(Math.max(2, C.w)) ? ', and a chest from 2 wins (better the more you win)' : '') + '.</p>' +
      '<div class="mrow"><button class="btn green" id="chGo" style="font-size:20px">Battle!</button><button class="btn grey" id="chEnd">Collect and end</button></div>');
    b.querySelector('#chGo').onclick = () => { closeModal(); chalBattle(); };
    b.querySelector('#chEnd').onclick = () => { if (confirm('End this challenge now and collect your rewards?')) { closeModal(); chalFinish(); } };
    return;
  }
  const b = modal('<h2>Challenges</h2><p style="text-align:center;font-size:12px">Battle bots under special rules until you win ' + CHAL_WINS + ' times or lose ' + CHAL_LOSSES + '. The more you win, the better the rewards. No trophies are won or lost.</p>' +
    Object.keys(CHALS).map(k => '<div class="chal o1"><div class="ic">' + CHALS[k].ic + '</div><div class="t">' + esc(CHALS[k].n) + '<small>' + esc(CHALS[k].d) + '</small></div><button class="btn green" data-c="' + k + '">' + (free ? 'Free' : gemI + ' ' + CHAL_COST) + '</button></div>').join('') +
    '<p style="text-align:center;font-size:12px">Your first challenge each day is free.' + (SAVE.stats2.chalBest ? ' Best run: ' + SAVE.stats2.chalBest + ' wins.' : '') + '</p>');
  b.querySelectorAll('[data-c]').forEach(x => x.onclick = () => {
    if (!free) { if (SAVE.gems < CHAL_COST) { toast('Not enough gems'); return; } SAVE.gems -= CHAL_COST; } else SAVE.chalFree = dayKey();
    SAVE.chal = { type: x.dataset.c, w: 0, l: 0, at: Date.now() }; save(); renderTop(); closeModal(); chalBattle();
  });
}
function chalBattle() {
  const C = SAVE.chal; if (!C) return;
  if (SAVE.deck.length !== 8) { toast('Your deck needs 8 cards'); return; }
  const slow = Math.max(0, 0.9 - C.w * 0.13) + Math.max(0, 0.5 - SAVE.tr / 3000);
  const onEnd = (out, mc) => chalResult(out, mc);
  if (C.type === 'draft') {
    runDraft((mine, theirs) => {
      const me = Object.assign(profile(), { deck: mine, lv: lvMap(mine, DRAFT_LV) });
      customBattle({ kind: 'challenge', me, opp: botProfile(theirs, lvMap(theirs, DRAFT_LV)), botSlow: slow, onEnd });
    });
    return;
  }
  const me = profile(), al = avgLevel(me.deck, me.lv);
  const opp = C.type === 'mirror' ? botProfile(me.deck.slice(), Object.assign({}, me.lv)) : randomBot(al);
  customBattle({ kind: 'challenge', me, opp, rules: CHALS[C.type].rules || null, botSlow: slow, onEnd });
}
function chalResult(out) {
  const C = SAVE.chal, r = { xp: 10 };
  SAVE.stats2.chal++;
  if (!C) return r;
  if (out === 'win') { C.w++; r.gold = 20; SAVE.gold += 20; r.xp = 20; } else if (out === 'loss') C.l++;
  SAVE.stats2.chalBest = Math.max(SAVE.stats2.chalBest || 0, C.w);
  r.note = CHALS[C.type].n + ': ' + C.w + ' wins, ' + C.l + (C.l === 1 ? ' loss' : ' losses');
  if (C.w >= CHAL_WINS || C.l >= CHAL_LOSSES) { r.note += ' · Challenge over!'; r.chalDone = 1; }
  save();
  return r;
}
function chalFinish() {
  const C = SAVE.chal; if (!C) return;
  SAVE.chal = null; const gold = C.w * 40, chest = chalChest(C.w);
  SAVE.gold += gold; save(); renderTop();
  const b = modal('<h2>Challenge complete</h2><p style="text-align:center">' + esc(CHALS[C.type].n) + ': ' + C.w + ' wins.</p><p style="text-align:center">' + coinI + ' +' + gold + (chest ? ' and a ' + esc(CHESTS[chest].n) : '') + '</p><div class="mrow"><button class="btn green" id="chOk">' + (chest ? 'Open!' : 'OK') + '</button></div>', { noX: true });
  b.querySelector('#chOk').onclick = () => { closeModal(); if (chest) openChest(chest, arena()); else renderAll(); };
}
// the draft: eight rounds of two cards. On your rounds you take one and the opponent gets the other; on theirs it's the other way round.
function botTake(a, b, mine) {
  const need = d => { const ds = mine.map(c => DEF[c]); let s = 1 + RAR_ORDER[d.rar] * 0.3 - Math.abs(d.cost - 3.6) * 0.15 + Math.random() * 0.6; if (d.type === 'spell' && !ds.some(x => x.type === 'spell')) s += 1.2; if (canHitAir(d) && ds.filter(canHitAir).length < 2) s += 1; if (winCon(d) && !ds.some(winCon)) s += 1.3; return s; };
  return need(DEF[a]) >= need(DEF[b]) ? a : b;
}
function runDraft(done) {
  const pool = shuffle(realCards().map(c => c.id), Math.random), mine = [], theirs = [];
  let round = 0;
  const next = () => {
    if (mine.length >= 8) { closeModal(); done(mine, theirs); return; }
    const a = pool.pop(), b2 = pool.pop(), yours = round % 2 === 0; round++;
    const decks = '<p style="font-size:12px;text-align:center;margin:6px 0 0">Your deck (' + mine.length + '/8)</p><div class="minideck">' + mine.map(c => '<img alt="' + esc(DEF[c].name) + '" src="' + portraitURL(c) + '">').join('') + '</div>' +
      '<p style="font-size:12px;text-align:center;margin:4px 0 0">Opponent (' + theirs.length + '/8)</p><div class="minideck">' + theirs.map(c => '<img alt="' + esc(DEF[c].name) + '" src="' + portraitURL(c) + '">').join('') + '</div>';
    if (yours) {
      const m = modal('<h2>Draft · pick ' + (mine.length + 1) + '/8</h2><p style="text-align:center">Pick one. Your opponent gets the other.</p><div class="draftRow"><div data-c="' + a + '"></div><div data-c="' + b2 + '"></div></div><div class="draftNames"></div>' + decks, { noX: true });
      m.querySelectorAll('.draftRow [data-c]').forEach(s => { const id = s.dataset.c, c = cardEl(id, { name: 1 }); c.setAttribute('role', 'button'); c.tabIndex = 0; c.setAttribute('aria-label', DEF[id].name); const pick = () => { sfx('card'); mine.push(id); theirs.push(id === a ? b2 : a); next(); }; c.onclick = pick; c.onkeydown = e => { if (e.key === 'Enter') pick(); }; s.replaceWith(c); });
      m.querySelector('.draftNames').innerHTML = '<p style="text-align:center;font-size:12px">' + esc(DEF[a].name) + ' (' + RAR[DEF[a].rar] + ', ' + DEF[a].cost + ') or ' + esc(DEF[b2].name) + ' (' + RAR[DEF[b2].rar] + ', ' + DEF[b2].cost + ')</p>';
    } else {
      const t = botTake(a, b2, theirs), y = t === a ? b2 : a;
      theirs.push(t); mine.push(y);
      modal('<h2>Draft · pick ' + mine.length + '/8</h2><p style="text-align:center">Your opponent took <b>' + esc(DEF[t].name) + '</b>, so you get <b>' + esc(DEF[y].name) + '</b>.</p><div class="draftRow"><div data-c="' + y + '"></div></div>' + decks, { noX: true })
        .querySelectorAll('[data-c]').forEach(s => s.replaceWith(cardEl(s.dataset.c, { name: 1 })));
      setTimeout(next, 1300);
    }
  };
  next();
}
function openDraftPractice() { closeModal(); runDraft((mine, theirs) => customBattle({ kind: 'draft', me: Object.assign(profile(), { deck: mine, lv: lvMap(mine, DRAFT_LV) }), opp: botProfile(theirs, lvMap(theirs, DRAFT_LV)), botSlow: 0.3, onEnd: () => ({ xp: 5, note: 'Draft practice: no trophies' }) })); }

/* ============================================================
   902: Training Camp: every card unlocked, level 9, against a practice bot
   ============================================================ */
const TRAIN_LV = 9;
function openTraining() {
  sfx('click');
  const b = modal('<h2>🎯 Training Camp</h2><p style="text-align:center;font-size:12px">Try any card, even ones you haven’t found. Every card is level ' + TRAIN_LV + ', and nothing you win or lose counts.</p>' +
    '<div class="minideck" id="tDeck"></div><div class="mrow"><button class="btn" id="tEdit">✏️ Training deck</button><button class="btn blue" id="tMine">Use my deck</button></div>' +
    '<p style="text-align:center;margin-top:8px">Bot:</p><div class="mrow"><button class="btn green" data-l="easy">Easy</button><button class="btn" data-l="normal">Normal</button><button class="btn red" data-l="hard">Hard</button></div>' +
    '<div class="mrow"><button class="btn grey" id="tDraft">🎴 Draft practice</button></div>');
  b.querySelector('#tDeck').innerHTML = SAVE.tdeck.map(c => '<img style="width:34px" alt="' + esc(DEF[c].name) + '" src="' + portraitURL(c) + '">').join('');
  b.querySelector('#tEdit').onclick = editTrainDeck;
  b.querySelector('#tMine').onclick = () => { SAVE.tdeck = SAVE.deck.slice(); save(); openTraining(); };
  b.querySelector('#tDraft').onclick = openDraftPractice;
  b.querySelectorAll('[data-l]').forEach(x => x.onclick = () => {
    closeModal();
    const deck = SAVE.tdeck.slice(), me = Object.assign(profile(), { deck, lv: lvMap(deck, TRAIN_LV) });
    const bd = botDeck(Math.random, 9, TRAIN_LV), lvl = x.dataset.l;
    customBattle({ kind: 'training', me, opp: Object.assign(botProfile(bd.deck, lvMap(bd.deck, TRAIN_LV)), { name: 'Practice Bot (' + lvl + ')', tr: SAVE.tr }), botSlow: lvl === 'easy' ? 1.4 : lvl === 'normal' ? 0.5 : 0, onEnd: () => { SAVE.training++; return { note: 'Training Camp: nothing counts' }; } });
  });
}
function editTrainDeck() {
  let sel = SAVE.tdeck.slice();
  const draw = () => {
    const b = modal('<h2>Training deck</h2><p style="text-align:center;font-size:12px">Tap cards to add or remove them (' + sel.length + '/8).</p><div class="pickGrid"></div><div class="mrow"><button class="btn green" id="tOk"' + (sel.length === 8 ? '' : ' disabled') + '>Done</button></div>');
    const G = b.querySelector('.pickGrid');
    realCards().slice().sort((a, c) => a.cost - c.cost || a.name.localeCompare(c.name)).forEach(c => {
      const ce = cardEl(c.id); if (sel.includes(c.id)) ce.classList.add('sel'); ce.title = c.name; ce.setAttribute('aria-label', c.name);
      ce.onclick = () => { const i = sel.indexOf(c.id); if (i >= 0) sel.splice(i, 1); else if (sel.length < 8) sel.push(c.id); else { toast('8 cards already: remove one first'); return; } sfx('click'); const sc = G.scrollTop; draw(); $('#modal .pickGrid').scrollTop = sc; };
      G.appendChild(ce);
    });
    b.querySelector('#tOk').onclick = () => { if (sel.length !== 8) return; SAVE.tdeck = sel.slice(); save(); openTraining(); };
  };
  draw();
}

/* ============================================================
   894 / 908 / 909: 2v2 (with a friend, a random partner or a bot partner) and friendly battles (with a code)
   Both use the arcade's realtime server like ranked battles do (NET), on their own queue channels.
   ============================================================ */
const mkCode = () => { const A = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; let s = ''; for (let i = 0; i < 5; i++) s += A[Math.floor(Math.random() * A.length)]; return s; };
const cleanCode = s => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5);
let waitRun = 0;
function waitBox(title, sub, code, onCancel, timeout, onTimeout) {
  const run = ++waitRun, t0 = Date.now();
  const b = modal('<h2>' + esc(title) + '</h2>' + (code ? '<p style="text-align:center">Your code:</p><div class="bigcode o">' + code + '</div>' : '') + '<p style="text-align:center" id="wSub">' + sub + '</p><p style="text-align:center;font-size:30px" class="o" id="wT">0s</p><div class="mrow">' + (code ? '<button class="btn blue" id="wCopy">📋 Copy code</button>' : '') + '<button class="btn red" id="wX">Cancel</button></div>', { noX: true });
  const iv = setInterval(() => {
    if (run !== waitRun || !b.isConnected) { clearInterval(iv); return; }
    const s = Math.floor((Date.now() - t0) / 1000); const t = b.querySelector('#wT'); if (t) t.textContent = s + 's';
    if (timeout && s >= timeout) { clearInterval(iv); waitRun++; onTimeout(); }
  }, 250);
  const cp = b.querySelector('#wCopy'); if (cp) cp.onclick = () => share(code);
  b.querySelector('#wX').onclick = () => { clearInterval(iv); waitRun++; NET.cancel(); closeModal(); if (onCancel) onCancel(); };
  return { set: (txt) => { const e = b.querySelector('#wSub'); if (e) e.innerHTML = txt; }, done: () => { clearInterval(iv); waitRun++; } };
}
function online(q, kind, title, sub, code, extra, timeout, onTimeout) {
  if (SAVE.deck.length !== 8) { toast('Your deck needs 8 cards'); return; }
  const w = waitBox(title, sub, code, null, timeout, () => { NET.cancel(); closeModal(); onTimeout && onTimeout(); });
  NET.search(profile(), s => {
    if (s.s === 'start') { w.done(); closeModal(); }
    else if (s.s === 'searching') w.set(s.n > 1 ? 'Found someone! Getting ready…' : sub);
    else if (s.s === 'error') w.set('Can’t reach the server right now.');
  }, { q, kind, extra }).catch(() => w.set('Can’t reach the server right now. Check your connection.' + (onTimeout ? ' A bot will join soon.' : '')));
}
function openFriendly() {
  sfx('click');
  const b = modal('<h2>🤝 Friendly Battle</h2><p style="text-align:center;font-size:12px">Battle a friend online. Nobody wins or loses trophies. Make a code and send it to your friend, or type the code they sent you.</p>' +
    '<div class="mrow"><button class="btn green" id="fMake">Make a code</button></div><p style="text-align:center;margin-top:10px">Got a code?</p>' +
    '<div class="chatrow"><input class="txt code" id="fCode" maxlength="5" placeholder="CODE" autocomplete="off" aria-label="Friend’s code"><button class="btn blue" id="fJoin">Join</button></div>');
  b.querySelector('#fMake').onclick = () => { const c = mkCode(); friendly(c, true); };
  const join = () => { const c = cleanCode(b.querySelector('#fCode').value); if (c.length !== 5) { toast('Codes have 5 letters'); return; } friendly(c, false); };
  b.querySelector('#fJoin').onclick = join;
  b.querySelector('#fCode').addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter') join(); });
}
function friendly(code, made) { online('cr-fr-' + code, 'friendly', 'Friendly Battle', made ? 'Send this code to your friend. The battle starts when they join.' : 'Joining your friend…', made ? code : '', null); }
function makeBotTeam() { const al = avgLevel(SAVE.deck); return [randomBot(al), randomBot(al)]; }
function open2v2() {
  sfx('click');
  const b = modal('<h2>👥 2v2 Battle</h2><p style="text-align:center;font-size:12px">You and a partner share one side of the arena: the same towers, your own hand and Mana. You face a bot team. No trophies, but wins count for quests, the season road and clan wars.</p>' +
    '<div class="mrow"><button class="btn green" id="dRnd">Random partner</button><button class="btn" id="dBot">Bot partner</button></div>' +
    '<p style="text-align:center;margin-top:10px">Play with a friend:</p><div class="mrow"><button class="btn blue" id="dMake">Make a code</button></div>' +
    '<div class="chatrow" style="margin-top:6px"><input class="txt code" id="dCode" maxlength="5" placeholder="CODE" autocomplete="off" aria-label="Friend’s 2v2 code"><button class="btn blue" id="dJoin">Join</button></div>');
  const extra = () => ({ bots: makeBotTeam().map(p => ({ name: p.name, tr: p.tr, kl: p.kl, deck: p.deck, lv: p.lv, st: p.st, sk: p.sk })) });
  b.querySelector('#dRnd').onclick = () => online('cr-duo', 'duo', '2v2: finding a partner', 'Looking for a partner. After 15 seconds a bot partner joins you instead.', '', extra, 15, duoWithBot);
  b.querySelector('#dBot').onclick = () => { closeModal(); duoWithBot(); };
  b.querySelector('#dMake').onclick = () => { const c = mkCode(); online('cr-duo-' + c, 'duo', '2v2 with a friend', 'Send this code to your friend. You start when they join.', c, extra); };
  const join = () => { const c = cleanCode(b.querySelector('#dCode').value); if (c.length !== 5) { toast('Codes have 5 letters'); return; } online('cr-duo-' + c, 'duo', '2v2 with a friend', 'Joining your friend…', '', extra); };
  b.querySelector('#dJoin').onclick = join;
  b.querySelector('#dCode').addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter') join(); });
}
function duoEnd(out, mc) {
  const r = { xp: out === 'win' ? 15 : 8 };
  if (out === 'win') { r.gold = 25; SAVE.gold += 25; SAVE.stats2.duoWins = (SAVE.stats2.duoWins || 0) + 1; }
  r.note = '2v2: no trophies'; save(); return r;
}
function duoWithBot() {
  const al = avgLevel(SAVE.deck), team = makeBotTeam(), mate = Object.assign(randomBot(al), { name: botName() + ' (bot)' });
  customBattle({ kind: 'duo', mate, opp: team[0], opp2: team[1], botSlow: Math.max(0, 0.8 - SAVE.tr / 2500), onEnd: duoEnd });
}
// NET calls this for friendly and 2v2 battles (index.html startOnline)
CRX.startOnlineKind = (mode, side, me, opp, seed, x) => {
  if (x.kind === 'friendly') {
    startBattle({ mode, side, seed, me, opp, kind: 'friendly', arena: arenaOf(Math.max(me.tr, opp.tr)), onEnd: (out, mc, oc) => friendlyEnd(out, mc, oc, opp) });
    return;
  }
  const bots = (Array.isArray(x.bots) ? x.bots : []).map(p => { const c = NET.clean(Object.assign({ id: 'bot' }, p)); return c ? Object.assign(c, { bot: true, st: c.st }) : null; }).filter(Boolean);
  while (bots.length < 2) bots.push(randomBot(avgLevel(me.deck, me.lv)));
  const common = { seed, side: 0, kind: 'duo', opp: bots[0], opp2: bots[1], arena: arenaOf(Math.min(me.tr, opp.tr)), botLvl: arenaOf(Math.min(me.tr, opp.tr)) + 1, botSlow: 0.2, onEnd: duoEnd };
  if (mode === 'host') startBattle(Object.assign({ mode: 'host', me, mate: opp, vsBots: true }, common));
  else startBattle(Object.assign({ mode: 'guest', me, mate: opp, seat: 1 }, common));
};
function friendlyEnd(out, mc, oc, opp) {
  const st = opp.st || {};
  SAVE.log.unshift({ r: out, c: [mc, oc], o: opp.name, t: 0, at: Date.now(), b: 0, f: 1, p: { tag: st.tag || '', tr: opp.tr || 0, kl: opp.kl || 1, best: st.best || 0, wins: st.wins || 0, losses: st.losses || 0, draws: st.draws || 0, three: st.three || 0, found: st.found || 0, fav: st.fav || '', deck: (opp.deck || []).slice(0, 8), lv: opp.lv || {} } });
  SAVE.log = SAVE.log.slice(0, 25); save();
  if (window.__tmatch) { // 909: a tournament match reports how it ended to the tournament page (through play.html)
    const res = BT && BT.oppLeft ? 'left' : out === 'win' ? 'w' : out === 'loss' ? 'l' : 'd';
    try { parent.postMessage({ arcadeMatch: { code: window.__tmatch.code, res, opp: opp.name } }, location.origin); } catch (e) {}
  }
  return { xp: 5, note: window.__tmatch ? 'Tournament match: result sent' : 'Friendly battle: no trophies' };
}

/* ============================================================
   During a battle: replay recording, the Mana graph samples, quest counts, skins, the partner tag and the watch bar
   ============================================================ */
let REC = null, GR = null, TRK = null, sampIv = 0, mateIv = 0;
const kindOf = () => BT ? (BT.kind || (BT.mode === 'bot' || BT.mode === 'host' || BT.mode === 'guest' ? 'ranked' : '')) : '';
function profShort(p) { if (!p) return null; return { n: p.name, kl: p.kl || 1, tr: p.tr || 0, d: p.deck.slice(), l: p.deck.map(c => (p.lv && p.lv[c]) || 1), sk: p.sk || 'stone' }; }
function lineup(o) {
  if (o.seat === 1) return { p: [o.mate, o.opp], m: [o.me, o.opp2] }; // 2v2 guest: the host is seat 0 on side 0
  const p = o.side === 0 ? [o.me, o.opp] : [o.opp, o.me];
  const m = o.mate ? (o.side === 0 ? [o.mate, o.opp2] : [o.opp2, o.mate]) : null;
  return { p, m };
}
CRX.start = (o) => {
  // tower skins: yours (team 0) and theirs (team 1), as each side sees it
  const L = lineup(o), mySide = o.side;
  TOWER_SKIN[0] = o.watch ? ((L.p[mySide] && L.p[mySide].sk) || 'stone') : (SAVE.skin || 'stone');
  TOWER_SKIN[1] = (L.p[1 - mySide] && L.p[1 - mySide].sk) || 'stone';
  if (o.opp2) $('#oppName').textContent = o.opp.name + ' & ' + o.opp2.name;
  GR = { t: [], me: [], op: [], leak: 0, spentMe: 0, spentOp: 0, last: 0 };
  TRK = { cards: 0, spells: 0, mana: 0 };
  REC = null;
  if (!o.watch && !o.feed) {
    try { REC = { v: 1, at: Date.now(), seed: o.seed, side: o.side, seat: o.seat || 0, arena: o.arena || 0, rules: o.rules || null, kind: o.kind || 'ranked', p: L.p.map(profShort), m: L.m ? L.m.map(profShort) : null, plays: [], me: myName() }; } catch (e) { REC = null; }
  }
  clearInterval(sampIv); sampIv = setInterval(sample, 500);
  // the watch bar: leave (and the replay speed)
  const old = $('#watchBar'); if (old) old.remove(); const om = $('#mateTag'); if (om) om.remove();
  if (o.watch) {
    const wb = el('div'); wb.id = 'watchBar';
    wb.innerHTML = '<button class="btn red" id="wLeave">✕ Leave</button>' + (o.feed ? '<button class="btn blue" id="wSpeed">1x</button>' : '<span class="btn grey" style="pointer-events:none">📺 Watching</span>');
    $('#battle').appendChild(wb);
    $('#wLeave').onclick = () => { sfx('click'); NET.unspectate(); leaveBattle(); renderAll(); };
    const sp = $('#wSpeed'); if (sp) sp.onclick = () => { if (!BT) return; BT.speed = BT.speed === 2 ? 4 : BT.speed === 4 ? 1 : 2; sp.textContent = (BT.speed || 1) + 'x'; };
    $('#hand').style.visibility = 'hidden'; $('#emoBtn').style.visibility = 'hidden';
  } else { $('#hand').style.visibility = ''; $('#emoBtn').style.visibility = ''; }
  if (o.mate) {
    const mt = el('div', 'o1'); mt.id = 'mateTag'; $('#battle').appendChild(mt);
    clearInterval(mateIv); mateIv = setInterval(() => {
      if (!BT) { clearInterval(mateIv); return; }
      let hand = [];
      if (BT.mode === 'guest') hand = BT.latest ? (BT.seat ? BT.latest.h : BT.latest.h2 || [[], []])[BT.side] || [] : [];
      else if (BT.B && BT.B.P2) hand = BT.B.P2[BT.side].hand;
      mt.innerHTML = '🤝 ' + esc(o.mate.name) + ' ' + hand.map(c => DEF[c] ? '<img alt="" src="' + portraitURL(c) + '">' : '').join('');
    }, 400);
  }
};
function sample() {
  if (!BT || BT.ended || !GR) return;
  let t, me, op;
  if (BT.mode === 'guest') { const s = BT.latest; if (!s || s.ph !== 'play') return; t = s.t; me = BT.watch ? s.x[BT.side] : myElx(); op = (s.x || [])[1 - BT.side]; }
  else { const B = BT.B; if (!B || B.phase !== 'play' || B.t < 0.01) return; t = B.t; me = B.elx[BT.side]; op = B.elx[1 - BT.side]; if (BT.seat && B.elx2) me = B.elx2[BT.side]; }
  if (t - GR.last < 0.45) return;
  if (me >= 9.95 && GR.me.length && GR.me[GR.me.length - 1] >= 9.95) GR.leak += t - GR.last;
  GR.last = t; GR.t.push(+t.toFixed(1)); GR.me.push(+(me || 0).toFixed(2)); GR.op.push(+(op || 0).toFixed(2));
}
CRX.ev = (ev) => {
  if (ev.e !== 'play' || !BT) return;
  if (REC && ev.k != null && DEF[ev.c]) REC.plays.push([ev.k, ev.s, DEF[ev.c].ix, Math.round(ev.x * 100), Math.round(ev.y * 100), ev.q ? 1 : 0]);
  const mine = ev.s === BT.side && (!BT.mate || (ev.q || 0) === (BT.seat || 0)), d = DEF[ev.c]; if (!d) return;
  if (GR) { if (mine) GR.spentMe += d.cost; else if (ev.s !== BT.side) GR.spentOp += d.cost; }
  if (mine && TRK && !BT.watch) { TRK.cards++; TRK.mana += d.cost; if (d.type === 'spell') TRK.spells++; }
};
CRX.leave = () => {
  clearInterval(sampIv); clearInterval(mateIv); NET.unspectate();
  const wb = $('#watchBar'); if (wb) wb.remove(); const mt = $('#mateTag'); if (mt) mt.remove();
  $('#hand').style.visibility = ''; $('#emoBtn').style.visibility = '';
  TOWER_SKIN[0] = TOWER_SKIN[1] = 'stone';
};

/* ============================================================
   The end of a battle: progress for quests, mastery, deck records, the season road and clan wars;
   the Mana graph (911) and a tip after a loss (913)
   ============================================================ */
CRX.end = (res, out, r) => {
  sample(); CRX._res = res;
  const kind = kindOf(), counts = !BT.watch && !BT.feed && kind !== 'training';
  let html = '', notes = [];
  if (REC && !BT.watch) { REC.res = { w: res.winner, cr: res.crowns }; REC.out = out; saveReplay(REC); REC = null; }
  if (counts && !res.left) {
    const myCr = res.crowns[BT.side], won = out === 'win';
    // daily quests
    const before = questsReady();
    questAdd('battles', 1); if (won) questAdd('win', 1); questAdd('cards', TRK.cards); questAdd('spells', TRK.spells); questAdd('mana', TRK.mana); questAdd('crowns', myCr);
    if (won && myCr === 3) questAdd('three', 1); if (kind === 'duo') questAdd('duo', 1); if (kind === 'challenge') questAdd('chal', 1);
    if (questsReady() > before) notes.push('📅 Daily quest ready to claim!');
    // mastery and the deck's record (only with your own cards: not draft battles)
    if (kind !== 'draft' && !(kind === 'challenge' && SAVE.chal && SAVE.chal.type === 'draft') && !(kind === '' && 0)) {
      const used = BT.me && BT.me.deck ? BT.me.deck : SAVE.deck;
      for (const id of used) if (SAVE.cards[id]) { const m = mastOf(id); if (won) m.w++; if (won && myCr === 3) m.t++; }
      if (['ranked', 'friendly', 'duo'].includes(kind) && used.join() === SAVE.deck.join()) { const R = SAVE.drec[SAVE.dk]; if (won) R.w++; else if (out === 'loss') R.l++; else R.d++; }
    }
    // the season road
    seasonCheck();
    let sp = 0; if (kind === 'ranked' && r.tr > 0) sp = r.tr; else if ((kind === 'duo' || kind === 'challenge') && won) sp = 10;
    if (sp) { SAVE.season.pts += sp; notes.push('🛣️ +' + sp + ' season trophies'); }
    SAVE.season.hi = Math.max(SAVE.season.hi || 0, SAVE.tr);
    // clan wars (weekends)
    if (SAVE.clan && warOn() && ['ranked', 'duo', 'challenge'].includes(kind)) { warSync(); const wp = won ? (myCr === 3 ? 150 : 100) : 25; SAVE.war.pts += wp; notes.push('🛡️ +' + wp + ' clan war points'); }
    save();
    if (masteryClaimable()) notes.push('🎖️ Card mastery reward ready!');
  }
  // the Mana graph
  if (GR && GR.t.length > 4) html += '<div class="gwrap"><canvas id="crxGraph" aria-label="Mana during the battle"></canvas><div class="gkey"><span><i style="background:#ff8cf4"></i>' + (BT.watch ? 'Bottom' : 'You') + ' (spent ' + GR.spentMe + ')</span><span><i style="background:#ffb36a"></i>' + (BT.watch ? 'Top' : 'Opponent') + ' (spent ' + GR.spentOp + ')</span></div>' +
    (!BT.watch ? '<div class="gkey">' + (GR.leak >= 1 ? 'Full Mana for ' + Math.round(GR.leak) + 's (wasted)' : 'No Mana wasted. Nice!') + '</div>' : '') + '</div>';
  if (counts && out === 'loss') { const tip = lossTip(); if (tip) html += '<div class="tip">💡 ' + esc(tip) + '</div>'; }
  if (notes.length) html += '<div class="qprog">' + notes.map(esc).join('<br>') + '</div>';
  return html;
};
CRX.endShown = (d) => {
  if (BT && BT.watch) { const w = d.querySelector('.win'), res = CRX._res; if (w && res) w.textContent = res.winner === -1 ? 'Draw' : (res.winner === BT.side ? BT.me.name : BT.opp.name) + ' wins!'; }
  const c = d.querySelector('#crxGraph'); if (!c || !GR) return;
  const W2 = c.clientWidth || 300, H2 = c.clientHeight || 96, dpr = Math.min(2, devicePixelRatio || 1); c.width = W2 * dpr; c.height = H2 * dpr;
  const g2 = c.getContext('2d'); g2.scale(dpr, dpr);
  const tMax = Math.max(180, GR.t[GR.t.length - 1] || 1), X = t => 4 + (W2 - 8) * t / tMax, Y = v => H2 - 12 - (H2 - 18) * v / 10;
  g2.font = '600 9px system-ui'; g2.fillStyle = 'rgba(200,225,255,.7)';
  for (const v of [0, 5, 10]) { g2.strokeStyle = 'rgba(255,255,255,.12)'; g2.beginPath(); g2.moveTo(4, Y(v)); g2.lineTo(W2 - 4, Y(v)); g2.stroke(); g2.fillText(v, W2 - 14, Y(v) - 2); }
  for (const t of [60, 120, 180, 240]) if (t < tMax) { g2.strokeStyle = 'rgba(255,255,255,.08)'; g2.beginPath(); g2.moveTo(X(t), 4); g2.lineTo(X(t), H2 - 12); g2.stroke(); g2.fillText(t / 60 + ':00', X(t) - 9, H2 - 2); }
  if (tMax > 120) { g2.fillStyle = 'rgba(255,140,244,.08)'; g2.fillRect(X(120), 4, X(Math.min(tMax, 180)) - X(120), H2 - 16); }
  const lineOf = (arr, col) => { g2.strokeStyle = col; g2.lineWidth = 2; g2.beginPath(); arr.forEach((v, i) => { const x = X(GR.t[i]), y = Y(v); i ? g2.lineTo(x, y) : g2.moveTo(x, y); }); g2.stroke(); };
  lineOf(GR.op, '#ffb36a'); lineOf(GR.me, '#ff8cf4');
};
function lossTip() {
  const s = deckStats(BT.me && BT.me.deck ? BT.me.deck : SAVE.deck);
  if (SAVE.tr >= 2000 && Math.random() < 0.6) return '';
  const tips = [];
  if (GR && GR.leak >= 8) tips.push('You sat on full Mana for ' + Math.round(GR.leak) + ' seconds. When the bar is full, play a card: even a cheap one at the back.');
  if (GR && GR.spentOp - GR.spentMe >= 10) tips.push('Your opponent spent ' + (GR.spentOp - GR.spentMe) + ' more Mana than you. Keep cards coming so you never fall behind.');
  deckAdvice(s).forEach(t => tips.push(t));
  tips.push('Defend first. Let the enemy cross the river, then stop them near your towers, which shoot too. Then counter-attack with what survives.',
    'Don’t put all your troops in one lane at the start. Wait and see what your opponent plays first.',
    'Put tanks in front and the archers and mages behind them, so the tank soaks up the hits.',
    'Swarms of small troops lose to splash cards. Save Arrow Volley or Fire Orb for when they bunch up.',
    'In the last minute Mana comes twice as fast: a good time to push with everything.',
    'Upgrade the cards in your deck first. Each level adds 10% to them.');
  return tips[0] && (tips.length <= 6 || Math.random() < 0.7) ? tips[0] : tips[rint(0, tips.length - 1)];
}
CRX.after = (r) => {
  checkUnlocks(); refreshDots();
  if (r && r.chalDone) setTimeout(chalFinish, 400);
};

/* ============================================================
   898: battle replays (watch, keep and share them). The battle is a deterministic simulation, so a replay is just
   the seed, both decks and when each card was played; watching runs the battle again.
   ============================================================ */
const RKEY = 'cardroyale.replays', RMAX = 12;
function loadReplays() { try { const a = JSON.parse(localStorage.getItem(RKEY) || '[]'); return Array.isArray(a) ? a.filter(x => x && x.v === 1 && x.p) : []; } catch (e) { return []; } }
function storeReplays(a) { try { localStorage.setItem(RKEY, JSON.stringify(a)); } catch (e) { try { localStorage.setItem(RKEY, JSON.stringify(a.slice(0, 4))); } catch (e2) {} } }
function saveReplay(rec) {
  if (!rec.plays.length) return;
  const a = loadReplays(), kept = a.filter(x => x.star), rest = a.filter(x => !x.star);
  rest.unshift(rec); storeReplays(kept.concat(rest.slice(0, Math.max(2, RMAX - kept.length))).sort((x, y) => y.at - x.at));
}
const b64 = s => btoa(unescape(encodeURIComponent(s))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64 = s => decodeURIComponent(escape(atob(s.replace(/-/g, '+').replace(/_/g, '/'))));
function replayCode(rec) { const c = Object.assign({}, rec); delete c.star; return 'CR1.' + b64(JSON.stringify(c)); }
function parseCode(code) {
  code = String(code || '').trim(); const m = /CR1\.([A-Za-z0-9_-]+)/.exec(code); if (!m) return null;
  try { const r = JSON.parse(unb64(m[1])); return r && r.v === 1 && Array.isArray(r.p) && r.p.length === 2 && Array.isArray(r.plays) ? r : null; } catch (e) { return null; }
}
function fromShort(s) {
  if (!s || !Array.isArray(s.d) || s.d.length !== 8 || s.d.some(c => !isTokenFree(c))) return null;
  const lv = {}; s.d.forEach((c, i) => { lv[c] = Math.max(1, Math.min(MAX_LV, (s.l && s.l[i]) | 0 || 1)); });
  return { name: tidy(String(s.n || 'Player')).slice(0, 16) || 'Player', kl: Math.max(1, Math.min(MAX_KL, s.kl | 0 || 1)), tr: Math.max(0, s.tr | 0), deck: s.d.slice(), lv, sk: SKIN_PAL[s.sk] ? s.sk : 'stone' };
}
function watchReplay(rec) {
  const P = rec.p.map(fromShort), M = rec.m ? rec.m.map(fromShort) : null;
  if (P.some(x => !x) || (M && M.some(x => !x))) { toast('That replay can’t be played'); return; }
  const side = rec.side === 1 ? 1 : 0, plays = rec.plays.filter(p => Array.isArray(p) && BY_IX[p[2]]).sort((a, b) => a[0] - b[0]);
  let i = 0;
  const feed = B => { while (i < plays.length && plays[i][0] <= B.k) { const [, s, ix, x, y, q] = plays[i++]; play(B, s ? 1 : 0, BY_IX[ix].id, x / 100, y / 100, q ? 1 : 0); } };
  closeModal(); $('#roadOv') && $('#roadOv').classList.add('hide');
  startBattle({ mode: 'bot', side, seed: rec.seed, me: P[side], opp: P[1 - side], mate: M ? M[side] : null, opp2: M ? M[1 - side] : null, arena: Math.max(0, Math.min(ARENAS.length - 1, rec.arena | 0)), rules: rec.rules && rec.rules.elx ? { elx: Math.min(3, +rec.rules.elx || 1) } : null, feed, watch: true, kind: 'replay' });
  SAVE.stats2.replays++; save();
}
function repTitle(r) { const P = r.p, mine = r.side === 1 ? 1 : 0; return esc((P[mine] && P[mine].n) || '?') + (r.m ? ' & ' + esc(r.m[mine].n) : '') + ' vs ' + esc((P[1 - mine] && P[1 - mine].n) || '?') + (r.m ? ' & ' + esc(r.m[1 - mine].n) : ''); }
const KIND_N = { ranked: 'Ranked', friendly: 'Friendly', duo: '2v2', challenge: 'Challenge', training: 'Training', draft: 'Draft' };
function openReplays() {
  sfx('click');
  const a = loadReplays();
  const b = modal('<h2>🎬 Replays</h2><p style="text-align:center;font-size:12px">Your last ' + RMAX + ' battles are kept (⭐ star one to keep it for good). Share a replay as a code, or paste a code from a friend.</p><div id="rL"></div>' +
    '<p style="text-align:center;margin-top:8px">Watch a code:</p><div class="chatrow"><input class="txt" id="rCode" placeholder="CR1.…" autocomplete="off" aria-label="Replay code"><button class="btn blue" id="rGo">Watch</button></div>');
  const L = b.querySelector('#rL');
  if (!a.length) L.innerHTML = '<p style="text-align:center">No replays yet. Battles you play from now on are saved here.</p>';
  a.forEach((r, i) => {
    const row = el('div', 'reprow o1 ' + (r.out === 'win' ? 'w' : r.out === 'loss' ? 'l' : ''));
    const cr = r.res && r.res.cr ? (r.side === 1 ? r.res.cr[1] + '-' + r.res.cr[0] : r.res.cr[0] + '-' + r.res.cr[1]) : '';
    row.innerHTML = '<div class="t">' + repTitle(r) + '<small>' + (KIND_N[r.kind] || 'Battle') + ' · ' + (r.out === 'win' ? 'Win' : r.out === 'loss' ? 'Loss' : 'Draw') + ' ' + cr + ' · ' + ago(r.at) + '</small></div>' +
      '<button class="btn grey" data-st aria-label="Star">' + (r.star ? '⭐' : '☆') + '</button><button class="btn" data-sh aria-label="Share">📋</button><button class="btn green" data-w>▶</button>';
    row.querySelector('[data-w]').onclick = () => watchReplay(r);
    row.querySelector('[data-sh]').onclick = () => share(replayCode(r));
    row.querySelector('[data-st]').onclick = () => { const all = loadReplays(), x = all.find(y => y.at === r.at); if (x) { x.star = !x.star; storeReplays(all); } openReplays(); };
    L.appendChild(row);
  });
  const go = () => { const r = parseCode(b.querySelector('#rCode').value); if (!r) { toast('That isn’t a replay code'); return; } watchReplay(r); };
  b.querySelector('#rGo').onclick = go;
  b.querySelector('#rCode').addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter') go(); });
}

/* ============================================================
   899: TV Royale: live ranked battles right now (and your best replays of the day)
   ============================================================ */
async function openTV() {
  sfx('click');
  const b = modal('<h2>📺 TV Royale</h2><p style="text-align:center;font-size:12px">Ranked battles being played right now, highest trophies first. Watching never changes anything for the players.</p><div id="tvL"><p style="text-align:center">Tuning in…</p></div><div class="mrow"><button class="btn blue" id="tvR">Refresh</button><button class="btn" id="tvRep">🎬 Replays</button></div>' +
    '<div id="tvBest"></div>');
  b.querySelector('#tvR').onclick = openTV; b.querySelector('#tvRep').onclick = openReplays;
  const today = loadReplays().filter(r => Date.now() - r.at < 864e5 && r.kind === 'ranked').sort((x, y) => Math.max(...y.p.map(p => p.tr || 0)) - Math.max(...x.p.map(p => p.tr || 0))).slice(0, 3);
  if (today.length) {
    const B2 = b.querySelector('#tvBest'); B2.innerHTML = '<p style="text-align:center;margin-top:8px">Your top battles today</p>';
    today.forEach(r => { const row = el('div', 'tvrow o1'); row.innerHTML = '<div class="t">' + repTitle(r) + '<small>' + trI + ' ' + Math.max(...r.p.map(p => p.tr || 0)) + ' · ' + ago(r.at) + '</small></div><button class="btn green">▶ Watch</button>'; row.querySelector('.btn').onclick = () => watchReplay(r); B2.appendChild(row); });
  }
  const L = b.querySelector('#tvL');
  try {
    const list = (await NET.tvList()).sort((x, y) => Math.max(y.at || 0, y.bt || 0) - Math.max(x.at || 0, x.bt || 0)).slice(0, 12);
    if (!L.isConnected) return;
    if (!list.length) { L.innerHTML = '<p style="text-align:center">No ranked battles online right now. Try again in a minute!</p>'; return; }
    L.innerHTML = '';
    list.forEach(m => {
      const row = el('div', 'tvrow o1');
      row.innerHTML = '<div class="t">' + esc(tidy(String(m.a || '?')).slice(0, 16)) + ' vs ' + esc(tidy(String(m.b || '?')).slice(0, 16)) + '<small>' + trI + ' ' + (m.at | 0) + ' / ' + (m.bt | 0) + ' · ' + esc((ARENAS[m.ar | 0] || ARENAS[0]).n) + ' · ' + ago(+m.t || Date.now()) + '</small></div><button class="btn green">▶ Watch</button>';
      row.querySelector('.btn').onclick = () => spectate(m);
      L.appendChild(row);
    });
  } catch (e) { if (L.isConnected) L.innerHTML = '<p style="text-align:center">Can’t reach the server right now.</p>'; }
}
async function spectate(m) {
  closeModal();
  const mk = (n, tr) => ({ name: tidy(String(n || '?')).slice(0, 16), tr: tr | 0, kl: 1, deck: [], lv: {} });
  startBattle({ mode: 'guest', side: 0, watch: true, kind: 'tv', me: mk(m.a, m.at), opp: mk(m.b, m.bt), arena: Math.max(0, Math.min(ARENAS.length - 1, m.ar | 0)) });
  try { await NET.spectate(String(m.code).replace(/[^A-Z0-9]/g, '').slice(0, 8), s => guestSnap(s), d => { if (BT && !BT.ended) { BT.endMsg = { winner: d.w, crowns: d.cr }; battleOver(BT.endMsg); } }); SAVE.stats2.replays++; save(); }
  catch (e) { toast('Couldn’t tune in to that battle'); leaveBattle(); renderAll(); }
  setTimeout(() => { if (BT && BT.watch && BT.kind === 'tv' && !BT.latest) { toast('That battle has finished'); NET.unspectate(); leaveBattle(); renderAll(); } }, 8000);
}

/* ============================================================
   896 / 897: clans (chat, card requests and donations) and clan wars on weekends.
   A clan lives on the realtime server as a live channel 'cr-clan-<TAG>': whoever has the clan page open is in its
   Presence, and messages, requests and donations go round as broadcasts. The server keeps nothing, so each player keeps
   the clan's name, the members they have seen and the recent chat in their own save; members who are online send newer
   chat to whoever joins.
   ============================================================ */
const BADGES = ['🛡️', '🐉', '🦁', '🦅', '🐺', '⚡', '🔥', '❄️', '🌟', '👑', '🍀', '🏰'];
let clanCh = null, clanRun = 0, clanSeenIds = new Set();
const warOn = (d) => { d = d || new Date(); const w = d.getDay(); return w === 5 || w === 6 || w === 0; };
function warId(d) { d = new Date(d || Date.now()); const w = d.getDay(), back = w === 0 ? 2 : w === 6 ? 1 : w === 5 ? 0 : (w + 2); d.setDate(d.getDate() - back); return dayKey(d); } // the Friday of this (or the last) war weekend
function warEnds() { const d = new Date(), w = d.getDay(), e = new Date(d); e.setHours(24, 0, 0, 0); e.setDate(e.getDate() + (w === 5 ? 2 : w === 6 ? 1 : 0)); return (e - d) / 1000; }
function warSync() { const id = warId(); if (SAVE.war.id !== id) SAVE.war = { id, pts: 0, claimed: [] }; }
const WAR_TIERS = [{ at: 1000, chest: 'silver' }, { at: 2500, chest: 'gold' }, { at: 5000, chest: 'giant' }, { at: 9000, chest: 'magic' }, { at: 14000, chest: 'smagic' }];
function clanTotal() {
  const C = SAVE.clan, id = warId(); let t = SAVE.war.id === id ? SAVE.war.pts : 0;
  for (const n in (C && C.seen) || {}) { const m = C.seen[n]; if (n !== myName() && m.wid === id) t += m.wp | 0; }
  return t;
}
function clanSend(ev, payload) { if (clanCh) try { clanCh.send({ type: 'broadcast', event: ev, payload }); } catch (e) {} }
function clanTrack() { if (!clanCh) return; warSync(); try { clanCh.track({ n: myName(), tr: SAVE.tr, wp: SAVE.war.pts, wid: SAVE.war.id, d: SAVE.stats2.don | 0, t: Date.now(), v: GAME_VER }); } catch (e) {} }
function clanLine(m) { const C = SAVE.clan; if (!C) return; C.chat = (C.chat || []).concat([m]).slice(-60); }
async function clanConnect() {
  const C = SAVE.clan; if (!C) return; clanLeaveCh();
  const run = ++clanRun;
  try {
    const cl = await NET.getClient(); if (run !== clanRun) return;
    const c = clanCh = cl.channel('cr-clan-' + C.tag + NET.SUF, { config: { broadcast: { self: false }, presence: { key: SESSION_ID } } });
    c.on('presence', { event: 'sync' }, () => { if (clanCh !== c) return; const st = c.presenceState(); for (const k in st) { const m = st[k] && st[k][0]; if (m && m.n) { const n = tidy(String(m.n)).slice(0, 16); C.seen[n] = { tr: +m.tr | 0, at: Date.now(), wp: Math.min(99999, +m.wp | 0), wid: String(m.wid || ''), d: +m.d | 0 }; } } save(); paintClan(); });
    c.on('broadcast', { event: '*' }, m => { if (clanCh === c) onClan(m.event, m.payload || {}); });
    await NET.sub(c); if (run !== clanRun) return;
    clanTrack();
    clanSend('hi', { n: myName(), last: (C.chat && C.chat.length ? C.chat[C.chat.length - 1].at : 0) });
    if (C.req && Date.now() - C.req.at < 8 * 3600e3) clanSend('req', C.req);
    paintClan();
  } catch (e) { const s = $('#clStatus'); if (s) s.textContent = 'Can’t reach the clan right now.'; }
}
function clanLeaveCh() { clanRun++; if (clanCh) { const c = clanCh; clanCh = null; try { c.untrack(); } catch (e) {} setTimeout(() => { NET.getClient().then(cl => cl.removeChannel(c)).catch(() => {}); }, 200); } }
function onClan(ev, d) {
  const C = SAVE.clan; if (!C) return;
  const nm = tidy(String(d.n || '')).slice(0, 16);
  if (ev === 'msg') { const t = tidyWS(String(d.t || '')).slice(0, 120); if (!t || !nm) return; const id = String(d.id || ''); if (clanSeenIds.has(id)) return; clanSeenIds.add(id); clanLine({ n: nm, t, at: Math.min(Date.now(), +d.at || Date.now()), id }); save(); paintClan(); sfxT('emote', 400); }
  else if (ev === 'hi') { // someone joined: send them the chat they missed (only lines newer than theirs), and your open request
    const lines = (C.chat || []).filter(l => l.at > (+d.last || 0) && l.n).slice(-25);
    if (lines.length) setTimeout(() => clanSend('hist', { lines }), 300 + Math.random() * 700);
    if (C.req && Date.now() - C.req.at < 8 * 3600e3) setTimeout(() => clanSend('req', C.req), 500);
  } else if (ev === 'hist' && Array.isArray(d.lines)) {
    let added = 0;
    for (const l of d.lines.slice(-25)) { const id = String(l.id || ''); if (!id || clanSeenIds.has(id) || (C.chat || []).some(x => x.id === id)) continue; clanSeenIds.add(id); const t = tidyWS(String(l.t || '')).slice(0, 120), n = tidy(String(l.n || '')).slice(0, 16); if (t && n) { clanLine({ n, t, at: Math.min(Date.now(), +l.at || 0), id }); added++; } }
    if (added) { C.chat.sort((a, b) => a.at - b.at); save(); paintClan(); }
  } else if (ev === 'req') {
    const c = String(d.c || ''); if (!DEF[c] || !['C', 'R'].includes(DEF[c].rar) || !nm || nm === myName()) return;
    C.reqs = (C.reqs || []).filter(r => r.n !== nm && Date.now() - r.at < 8 * 3600e3);
    C.reqs.push({ id: String(d.id || '').slice(0, 20), n: nm, c, need: DEF[c].rar === 'C' ? 10 : 2, got: Math.max(0, +d.got | 0), at: Math.min(Date.now(), +d.at || Date.now()) });
    save(); paintClan();
  } else if (ev === 'don') {
    const k = Math.max(1, Math.min(2, +d.k | 0)), id = String(d.did || '');
    if (clanSeenIds.has(id)) return; clanSeenIds.add(id);
    if (C.req && d.to === C.req.id && DEF[C.req.c] && C.req.got < C.req.need) { // a donation to you
      const take = Math.min(k, C.req.need - C.req.got); C.req.got += take;
      if (!SAVE.cards[C.req.c]) { SAVE.cards[C.req.c] = { lv: 1, n: take - 1 }; SAVE.seen[C.req.c] = false; } else SAVE.cards[C.req.c].n += take;
      clanLine({ n: '', t: nm + ' gave you ' + take + ' ' + DEF[C.req.c].name, at: Date.now(), id: 'd' + id, sys: 1 });
      save(); toast(nm + ' donated ' + take + ' ' + DEF[C.req.c].name + '!'); sfx('card'); renderNavDots();
    }
    const r = (C.reqs || []).find(x => x.id === d.to); if (r) { r.got = Math.min(r.need, r.got + k); save(); }
    paintClan();
  }
}
function openClan() {
  sfx('click');
  if (!SAVE.clan) {
    const b = modal('<h2>🛡️ Clans</h2><p style="text-align:center;font-size:12px">Team up! Clan members chat, ask each other for cards, donate cards for gold and play Clan Wars together on weekends. Make a clan and share its tag, or join one with a tag.</p>' +
      '<p style="margin-top:6px">Make a clan:</p><input class="txt" id="clName" maxlength="20" placeholder="Clan name" autocomplete="off" aria-label="Clan name"><div class="emoGrid" style="grid-template-columns:repeat(6,1fr);margin:6px 0" id="clBadges"></div><div class="mrow"><button class="btn green" id="clMake">Make clan</button></div>' +
      '<p style="margin-top:10px">Join with a tag:</p><div class="chatrow"><input class="txt code" id="clTag" maxlength="7" placeholder="#TAG" autocomplete="off" aria-label="Clan tag"><button class="btn blue" id="clJoin">Join</button></div>');
    let badge = BADGES[0];
    const bg = b.querySelector('#clBadges'); BADGES.forEach(x => { const bt = el('button', x === badge ? 'on' : '', x); bt.style.fontSize = '22px'; bt.onclick = () => { badge = x; bg.querySelectorAll('button').forEach(y => y.classList.toggle('on', y === bt)); }; bg.appendChild(bt); });
    ['#clName', '#clTag'].forEach(s => b.querySelector(s).addEventListener('keydown', e => e.stopPropagation()));
    b.querySelector('#clMake').onclick = () => {
      const name = tidy(b.querySelector('#clName').value).slice(0, 20); if (name.length < 3) { toast('Give your clan a name (3+ letters)'); return; }
      const A = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; let tag = ''; for (let i = 0; i < 6; i++) tag += A[rint(0, A.length - 1)];
      SAVE.clan = { tag, name, badge, made: Date.now(), seen: {}, chat: [{ n: '', t: 'You made ' + name + '. Share the tag #' + tag + ' so friends can join!', at: Date.now(), id: 's0', sys: 1 }], reqs: [], req: null };
      save(); closeModal(); openClanPage();
    };
    b.querySelector('#clJoin').onclick = () => {
      const tag = String(b.querySelector('#clTag').value || '').toUpperCase().replace(/[^A-Z0-9]/g, ''); if (tag.length !== 6) { toast('Clan tags have 6 letters and numbers'); return; }
      SAVE.clan = { tag, name: 'Clan #' + tag, badge: '🛡️', made: 0, seen: {}, chat: [{ n: '', t: 'You joined clan #' + tag + '. Say hi!', at: Date.now(), id: 's0', sys: 1 }], reqs: [], req: null };
      save(); closeModal(); openClanPage();
    };
    return;
  }
  openClanPage();
}
function openClanPage(tab) {
  let ov = $('#clanOv'); if (!ov) { ov = el('div', 'blue'); ov.id = 'clanOv'; $('#app').appendChild(ov); }
  ov.classList.remove('hide'); ov.dataset.tab = tab || ov.dataset.tab || 'chat';
  const C = SAVE.clan;
  ov.innerHTML = '<div class="ovHead"><span class="ribbon o">Clan</span><button class="x o" aria-label="Close">✕</button></div><div class="ovBody"><div class="clanTop o1"><div class="badge">' + C.badge + '</div><div class="t"><b style="font-weight:400;font-size:19px">' + esc(C.name) + '</b><small>#' + C.tag + ' · <span id="clStatus">Connecting…</span></small></div><button class="btn grey" id="clShare" style="font-size:13px;padding:4px 8px">📋 Tag</button></div>' +
    '<div class="tabs2 o1"><button data-t="chat">💬 Chat</button><button data-t="cards">🃏 Donate</button><button data-t="war">⚔️ War</button><button data-t="mem">👥 Members</button></div><div id="clBody"></div></div>';
  ov.querySelector('.x').onclick = () => { sfx('click'); clanLeaveCh(); ov.classList.add('hide'); ov.innerHTML = ''; renderAll(); };
  ov.querySelector('#clShare').onclick = () => share('Join my Card Royale clan ' + C.name + ': tag #' + C.tag);
  ov.querySelectorAll('.tabs2 button').forEach(b => b.onclick = () => { sfx('click'); ov.dataset.tab = b.dataset.t; paintClan(true); });
  if (!clanCh) clanConnect();
  paintClan(true);
}
function paintClan(full) {
  const ov = $('#clanOv'); if (!ov || ov.classList.contains('hide') || !SAVE.clan) return;
  const C = SAVE.clan, tab = ov.dataset.tab, B = ov.querySelector('#clBody'); if (!B) return;
  ov.querySelectorAll('.tabs2 button').forEach(b => b.classList.toggle('on', b.dataset.t === tab));
  const online = clanCh ? Object.values(clanCh.presenceState()).map(x => x && x[0] && tidy(String(x[0].n || ''))).filter(Boolean) : [];
  const stt = ov.querySelector('#clStatus'); if (stt) stt.textContent = clanCh ? online.length + ' online now' : 'Offline';
  if (tab === 'chat') {
    const keep = B.querySelector('#clIn'), draft = keep ? keep.value : '';
    if (!full && keep && document.activeElement === keep) { const log = B.querySelector('.chatlog'); if (log) { log.innerHTML = chatHTML(C); log.scrollTop = log.scrollHeight; } return; }
    B.innerHTML = '<div class="chatlog" aria-live="polite">' + chatHTML(C) + '</div><div class="chatrow"><input class="txt" id="clIn" maxlength="120" placeholder="Say something to your clan…" autocomplete="off" aria-label="Clan chat message"><button class="btn blue" id="clSend">Send</button></div>' +
      '<p style="font-size:11px;text-align:center;margin-top:6px;font-family:system-ui;font-weight:600;color:#cfe6ff;text-shadow:none">Clan chat is live: members online now see it, and they pass on what you missed when you come back. Be kind.' + (SAVE.censor ? '' : ' Turn on Chat filter in Settings to hide swear words.') + '</p>' +
      '<div class="mrow"><button class="btn" id="clFr">🤝 Friendly battle code</button></div>';
    const log = B.querySelector('.chatlog'); log.scrollTop = log.scrollHeight;
    const inp = B.querySelector('#clIn'); inp.value = draft;
    const send = () => { const t = tidyWS(inp.value).slice(0, 120); if (!t) return; if (!clanCh) { toast('Not connected'); return; } inp.value = ''; const m = { n: myName(), t, at: Date.now(), id: SESSION_ID + Date.now().toString(36) }; clanSeenIds.add(m.id); clanLine(m); clanSend('msg', m); save(); paintClan(); };
    B.querySelector('#clSend').onclick = send; inp.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter') send(); });
    B.querySelector('#clFr').onclick = () => { const code = mkCode(); if (clanCh) { const m = { n: myName(), t: 'Friendly battle? Join my code ' + code + ' (Battle tab → Friendly)', at: Date.now(), id: SESSION_ID + 'f' + Date.now().toString(36) }; clanSeenIds.add(m.id); clanLine(m); clanSend('msg', m); save(); } $('#clanOv').classList.add('hide'); clanLeaveCh(); friendly(code, true); };
  } else if (tab === 'cards') {
    const mine = C.req && Date.now() - C.req.at < 8 * 3600e3 ? C.req : null, wait = C.reqAt && Date.now() - C.reqAt < 4 * 3600e3;
    let h = '<div class="panel o1" style="font-size:14px">' + (mine ? 'Your request: ' + esc(DEF[mine.c].name) + ' · ' + mine.got + '/' + mine.need + ' received<br><small style="font-size:11px;color:#bfe0ff">It stays open for 8 hours. Clanmates who are online can donate.</small>' : wait ? 'You can ask for cards again in ' + fmtT((4 * 3600e3 - (Date.now() - C.reqAt)) / 1000) + '.' : 'Ask your clan for a card: up to 10 Commons or 2 Rares, every 4 hours.') + (!mine && !wait ? '<div class="mrow"><button class="btn green" id="clAsk">Request a card</button></div>' : '') + '</div>';
    const reqs = (C.reqs || []).filter(r => Date.now() - r.at < 8 * 3600e3 && r.got < r.need && online.includes(r.n));
    h += '<p style="text-align:center;font-size:13px">Requests from clanmates online now (donate for gold and XP):</p>' + (reqs.length ? '' : '<p style="text-align:center;font-size:12px">No open requests right now.</p>');
    B.innerHTML = h;
    for (const r of reqs) {
      const have = SAVE.cards[r.c], can = have && have.n >= 1, k = DEF[r.c].rar === 'C' ? Math.min(2, have ? have.n : 0) : 1;
      const row = el('div', 'req o1'); row.innerHTML = '<div class="slotR"></div><div class="t">' + esc(r.n) + ' wants ' + esc(DEF[r.c].name) + '<small>' + r.got + '/' + r.need + ' · you have ' + (have ? have.n : 0) + ' spare</small></div><button class="btn green"' + (can ? '' : ' disabled') + '>Donate' + (k > 1 ? ' ' + k : '') + '</button>';
      const ce = cardEl(r.c); ce.style.width = '40px'; row.querySelector('.slotR').replaceWith(ce);
      row.querySelector('.btn').onclick = () => {
        const hv = SAVE.cards[r.c]; if (!hv || hv.n < 1) return; const kk = Math.min(k, hv.n, r.need - r.got); if (kk < 1) return;
        hv.n -= kk; r.got += kk; const gold = (DEF[r.c].rar === 'C' ? 5 : 50) * kk; SAVE.gold += gold; SAVE.stats2.don = (SAVE.stats2.don | 0) + kk;
        const did = SESSION_ID + Date.now().toString(36) + rint(0, 999); clanSeenIds.add(did);
        clanSend('don', { to: r.id, n: myName(), c: r.c, k: kk, did }); clanTrack();
        save(); sfx('chest'); toast('Donated ' + kk + ' ' + DEF[r.c].name + ': +' + gold + ' gold'); addXP(kk * (DEF[r.c].rar === 'C' ? 1 : 10)); checkUnlocks(); paintClan(true);
      };
      B.appendChild(row);
    }
    const ask = B.querySelector('#clAsk'); if (ask) ask.onclick = () => {
      const b = modal('<h2>Request a card</h2><p style="text-align:center;font-size:12px">Commons and Rares you have found.</p><div class="pickGrid"></div>');
      const G = b.querySelector('.pickGrid');
      Object.keys(SAVE.cards).filter(id => isTokenFree(id) && ['C', 'R'].includes(DEF[id].rar)).forEach(id => {
        const ce = cardEl(id); ce.title = DEF[id].name; ce.onclick = () => {
          C.req = { id: SESSION_ID.slice(0, 8) + Date.now().toString(36), n: myName(), c: id, need: DEF[id].rar === 'C' ? 10 : 2, got: 0, at: Date.now() }; C.reqAt = Date.now();
          clanSend('req', C.req); clanLine({ n: '', t: 'You asked for ' + DEF[id].name + '.', at: Date.now(), id: 'r' + C.req.id, sys: 1 }); save(); closeModal(); paintClan(true);
        };
        G.appendChild(ce);
      });
    };
  } else if (tab === 'war') {
    warSync(); const total = clanTotal(), on = warOn(), id = warId();
    const lastWar = SAVE.war.id === id;
    B.innerHTML = '<div class="panel o1"><div style="font-size:18px;text-align:center">⚔️ Clan War ' + (on ? 'is on!' : 'is between weekends') + '</div>' +
      '<p style="font-size:12px;font-family:system-ui;font-weight:600;color:#cfe6ff;text-shadow:none;margin-top:4px">Every Friday to Sunday, your ranked, 2v2 and challenge battles earn war points for the clan: 100 a win, 150 a three-crown win, 25 a loss. When the clan’s total passes a goal, everyone can claim that chest. ' + (on ? 'Ends in ' + longT(warEnds()) + '.' : 'Next war starts on Friday.') + '</p>' +
      '<div style="font-size:24px;text-align:center;margin:6px 0">' + total + ' <small style="font-size:13px">clan war points</small></div><div style="text-align:center;font-size:13px">You: ' + (lastWar ? SAVE.war.pts : 0) + '</div>' +
      '<p style="font-size:11px;text-align:center;font-family:system-ui;font-weight:600;color:#9cc8f0;text-shadow:none">The total counts members you have seen online during this war (Clan page open).</p></div>' +
      '<div class="road2 o1">' + WAR_TIERS.map((T, i) => { const got = total >= T.at, cl = lastWar && SAVE.war.claimed.includes(i); return '<div class="ms' + (got ? ' got' : '') + '" data-n="' + (T.at >= 1000 ? T.at / 1000 + 'k' : T.at) + '"><div class="ic"><span data-ch="' + T.chest + '"></span></div><div class="t">' + esc(CHESTS[T.chest].n) + '<small>' + (cl ? 'Claimed' : got ? 'Ready!' : (T.at - total) + ' points to go') + '</small></div>' + (got && !cl && lastWar ? '<button class="btn green" data-w="' + i + '">Claim</button>' : cl ? '✔' : '') + '</div>'; }).join('') + '</div>';
    B.querySelectorAll('[data-ch]').forEach(x => x.replaceWith(chestCanvas(x.dataset.ch, 40)));
    B.querySelectorAll('[data-w]').forEach(x => x.onclick = () => { const i = +x.dataset.w; if (SAVE.war.claimed.includes(i)) return; SAVE.war.claimed.push(i); save(); openChest(WAR_TIERS[i].chest, arena(), () => paintClan(true)); });
  } else {
    const names = Object.keys(C.seen || {}).filter(n => n !== myName()).sort((a, b) => (online.includes(b) ? 1 : 0) - (online.includes(a) ? 1 : 0) || (C.seen[b].tr - C.seen[a].tr));
    B.innerHTML = '<div class="mem o1"><span class="on y"></span><span class="nm">' + esc(myName()) + ' (you)</span>' + trI + ' ' + SAVE.tr + '</div>' +
      names.map(n => '<div class="mem o1"><span class="on' + (online.includes(n) ? ' y' : '') + '"></span><span class="nm">' + esc(n) + '<small style="display:block;font-size:10px;color:#9cc8f0">' + (online.includes(n) ? 'Online now' : 'Seen ' + ago(C.seen[n].at)) + (C.seen[n].d ? ' · ' + C.seen[n].d + ' cards donated' : '') + '</small></span>' + trI + ' ' + C.seen[n].tr + '</div>').join('') +
      (names.length ? '' : '<p style="text-align:center;font-size:12px;margin-top:6px">Members show here once you’ve seen them online. Share the tag #' + C.tag + ' with friends!</p>') +
      '<div class="mrow"><button class="btn red" id="clLeave">Leave clan</button></div>';
    B.querySelector('#clLeave').onclick = () => { if (!confirm('Leave ' + C.name + '?')) return; clanLeaveCh(); SAVE.clan = null; save(); $('#clanOv').classList.add('hide'); renderAll(); toast('You left the clan'); };
  }
}
function chatHTML(C) {
  const lines = (C.chat || []).slice(-60);
  return lines.length ? lines.map(l => l.sys ? '<p class="sys">' + esc(l.t) + '</p>' : '<p><b>' + esc(l.n) + ':</b> ' + esc(chatText(l.t)) + '</p>').join('') : '<p class="sys">No messages yet.</p>';
}

/* ============================================================
   905: arena previews (Trophy Road: tap any arena)
   ============================================================ */
function arenaPreview(i) {
  sfx('click');
  const A = ARENAS[i], got = SAVE.best >= A.tr, cv2 = document.createElement('canvas'), w = 300, h = 420, dpr = Math.min(2, devicePixelRatio || 1);
  cv2.width = w * dpr; cv2.height = h * dpr; cv2.className = 'prevArena';
  const T = Math.min(w / 19.2, h / 31.6) * dpr;
  drawArenaBG(cv2.getContext('2d'), T, (w * dpr - W * T) / 2, (h * dpr - H * T) / 2, cv2.width, cv2.height, i);
  const cards = CARDS.filter(c => c.arena === i);
  const b = modal('<h2>Arena ' + (i + 1) + ': ' + esc(A.n) + '</h2><p style="text-align:center">' + trI + ' ' + A.tr + ' trophies · ' + (SAVE.tr >= A.tr ? 'You are here or past it' : got ? 'You have been here' : (A.tr - SAVE.tr) + ' trophies to go') + '</p><div id="pvA"></div>' +
    (A.legend ? '<p style="text-align:center">✨ The Legend arena: a night sky full of stars, a river of starlight and golden bridges. When a season ends, trophies above ' + LEGEND_TR + ' are halved.</p>' : '') +
    (cards.length ? '<p style="text-align:center;font-size:12px">New cards here:</p><div class="minideck">' + cards.map(c => '<img style="width:34px" title="' + esc(c.name) + '" alt="' + esc(c.name) + '" src="' + portraitURL(c.id) + '">').join('') + '</div>' : '<p style="text-align:center;font-size:12px">No new cards, just glory.</p>'));
  b.querySelector('#pvA').appendChild(cv2);
  b.querySelectorAll('.minideck img').forEach((im, k) => { im.style.cursor = 'pointer'; im.onclick = () => cardInfo(cards[k].id); });
}
const baseRoad = window.openRoad;
window.openRoad = function () {
  baseRoad();
  const ov = $('#roadOv'); if (!ov) return;
  ov.querySelectorAll('.rNode').forEach(n => { const i = +n.dataset.i; const c = n.querySelector('.rCard'); if (!c) return; c.style.cursor = 'pointer'; c.title = 'Preview'; c.onclick = () => arenaPreview(i); const away = n.querySelector('.rAway'); if (away) away.insertAdjacentHTML('beforeend', ' · 👁 Preview'); });
  const f = ov.querySelector('.roadFoot'); if (f) { f.innerHTML += ' <button class="btn blue" id="rdSeason" style="font-size:13px;padding:3px 9px;margin-left:4px">Season Road</button>'; f.querySelector('#rdSeason').onclick = () => { ov.classList.add('hide'); ov.innerHTML = ''; openSeason(); }; }
};

/* ============================================================
   901: balance notes (what changed in each update), shown from the Stats tab and the update notes
   ============================================================ */
const BALANCE = [
  { v: '1.2', notes: [
    { c: 'zap_cart', t: 'Hitpoints 1200 → 1100, damage 1100 → 860. It won 77% of the test battles it was in.', d: 'dn' },
    { c: 'mega_knight', t: 'Hitpoints 3300 → 2900, landing damage 444 → 380. It won 73% of its test battles.', d: 'dn' },
    { c: 'iron_titan', t: 'Hitpoints 2600 → 2450. It won 68% of its test battles.', d: 'dn' },
    { c: 'mimic', t: 'Hitpoints 1150 → 1060. It won 67% of its test battles.', d: 'dn' },
    { c: 'baby_dragon', t: 'Hitpoints 800 → 740. It won 66% of its test battles.', d: 'dn' },
    { c: 'boar_rider', t: 'Hitpoints 800 → 880. It won only 41% of its test battles.', d: 'up' },
    { c: 'mortar', t: 'Hit speed 5s → 4.5s. It won only 41% of its test battles.', d: 'up' },
    { c: 'frost_pylon', t: 'Damage 48 → 54. It won only 41% of its test battles.', d: 'up' },
    { c: 'healing_shrine', t: 'Healing 55 → 65 a second. It won only 38% of its test battles.', d: 'up' }
  ] }
];
function openBalance() {
  sfx('click');
  const b = modal('<h2>📜 Balance notes</h2><p style="text-align:center;font-size:12px">Card changes in each update. For 1.2 we ran 4,000 battles between bots with random decks (every card level 9) and changed the cards that won far more, or far less, than half of them.</p><div class="bal" id="balL"></div>');
  const L = b.querySelector('#balL');
  for (const B2 of BALANCE) {
    L.insertAdjacentHTML('beforeend', '<h4 class="o1">Update ' + B2.v + '</h4>');
    for (const n of B2.notes) { if (!DEF[n.c]) continue; const row = el('div', 'bl'); row.innerHTML = '<div class="slotB"></div><div class="t"><b class="o1">' + esc(DEF[n.c].name) + ' <span class="' + n.d + '">' + (n.d === 'up' ? '▲ buff' : '▼ nerf') + '</span></b><br>' + esc(n.t) + '</div>'; row.querySelector('.slotB').replaceWith(cardEl(n.c)); row.style.cursor = 'pointer'; row.onclick = () => cardInfo(n.c); L.appendChild(row); }
  }
}

/* ============================================================
   Menus: the new buttons on the Battle, Stats and Shop tabs, and the red dots
   ============================================================ */
const baseBattle = window.renderBattle;
window.renderBattle = function () {
  baseBattle();
  const p = $('#pg-battle'), slots = $('#bSlots'); if (!p || !slots) return;
  const g2 = el('div', 'modeGrid o1');
  const items = [['duo', '👥', '2v2'], ['chal', '🏅', SAVE.chal ? 'Challenge ' + SAVE.chal.w + '-' + SAVE.chal.l : 'Challenges'], ['fr', '🤝', 'Friendly'], ['train', '🎯', 'Training'], ['tv', '📺', 'TV Royale'], ['clan', '🛡️', SAVE.clan ? 'Clan' : 'Clans'], ['quest', '📅', 'Quests'], ['season', '🛣️', 'Season'], ['rep', '🎬', 'Replays']];
  g2.innerHTML = items.map(([k, i, t]) => '<button data-m="' + k + '"><i>' + i + '</i>' + esc(t) + '</button>').join('');
  slots.insertAdjacentElement('afterend', g2);
  const act = { duo: open2v2, chal: openChallenges, fr: openFriendly, train: openTraining, tv: openTV, clan: openClan, quest: openQuests, season: openSeason, rep: openReplays };
  g2.querySelectorAll('button').forEach(b => b.onclick = () => act[b.dataset.m]());
  refreshDots();
};
function refreshDots() {
  const set = (k, n) => { const b = document.querySelector('.modeGrid button[data-m="' + k + '"]'); if (!b) return; let d = b.querySelector('.dot'); if (!n) { if (d) d.remove(); return; } if (!d) { d = el('span', 'dot o1'); b.appendChild(d); } d.textContent = n; };
  try { set('quest', questsReady()); set('season', seasonReady()); set('clan', SAVE.clan && warOn() ? '⚔' : 0); } catch (e) {}
}
const baseInfo = window.renderInfo;
window.renderInfo = function () {
  baseInfo();
  const p = $('#pg-info'), first = p.querySelector('.panel'); if (!first) return;
  const s2 = SAVE.stats2, extra = el('div', 'panel o');
  extra.innerHTML = '<h3>More</h3>' + [['Season trophies', SAVE.season.pts], ['Best challenge run', (s2.chalBest || 0) + ' wins'], ['2v2 wins', s2.duoWins || 0], ['Daily quests done', s2.quests || 0], ['Cards donated', s2.don || 0], ['Emotes', SAVE.emo.own.length + '/' + EMOTES.filter(e => e.f).length], ['Tower skins', SAVE.skins.length + '/' + Object.keys(SKIN_PAL).length]].map(r => '<div class="stat"><span>' + r[0] + '</span>' + r[1] + '</div>').join('') +
    '<div class="mrow"><button class="btn blue" id="iLb">🏆 Leaderboard</button><button class="btn" id="iBal">📜 Balance notes</button><button class="btn" id="iRep">🎬 Replays</button><button class="btn grey" id="iNotes">🆕 Update notes</button></div>';
  first.insertAdjacentElement('afterend', extra);
  $('#iLb').onclick = () => openLeaderboard(); $('#iBal').onclick = openBalance; $('#iRep').onclick = openReplays; $('#iNotes').onclick = () => openPatch();
};
const baseShop = window.renderShop;
window.renderShop = function () {
  baseShop();
  const p = $('#pg-shop'), own = SAVE.skins.includes('candy');
  const pn = el('div', 'panel o'); pn.innerHTML = '<h3>Tower Skins</h3><div class="offers"><div class="offer' + (own ? ' sold' : '') + '" id="sSkin"><div class="on">' + esc(SKIN_PAL.candy.n) + '</div><div class="skc"></div><div class="price">' + (own ? 'Owned' : '<span class="gem"></span>300') + '</div></div><div style="grid-column:span 2;font-size:13px;color:#cfe6ff;align-self:center;font-family:system-ui;font-weight:600;text-shadow:none">More skins come from arenas, wins and the Season Road. Pick yours on the Cards tab.</div></div>';
  pn.querySelector('.skc').appendChild(skinCanvas('candy', 90, 50));
  pn.querySelector('#sSkin').onclick = openShopSkin;
  p.appendChild(pn);
};

/* ============================================================
   909: tournament matches (tourney.js opens play.html?tmatch=CODE&tside=host|guest&tname=NAME): a friendly battle on
   that code, and friendlyEnd() reports the result to the tournament page.
   ============================================================ */
function tournamentStart() {
  const q = new URLSearchParams(location.search), code = cleanCode(q.get('tmatch'));
  if (code.length !== 5) return;
  window.__tmatch = { code };
  setTimeout(() => online('cr-fr-T' + code, 'friendly', 'Tournament match', 'Waiting for your tournament opponent…', '', null), 900);
}

/* ---------- 1.2 update notes ---------- */
window.openPatch = function () {
  modal('<h2>Update ' + GAME_VER + '</h2>' +
    '<p>👥 2v2: team up with a friend, a random partner or a bot against a bot team. 🤝 Friendly battles with a code, 🎯 Training Camp with every card at level 9, and 🏅 Challenges: Triple Mana, Mirror and Draft (pick cards one by one).</p>' +
    '<p>🃏 Five deck slots with deck stats: average Mana, 4-card cycle, a Mana curve and the win rate of each deck. Tap any card (even locked ones) for its stats at every level, the cards that counter it, and 🎖️ Mastery rewards.</p>' +
    '<p>📅 Daily quests for gold, 🛣️ a Season Road that starts again every month, and a new Legend arena at 4000 trophies: ✨ Starfall Summit.</p>' +
    '<p>🎬 Replays of your battles (share them with a code), 📺 TV Royale to watch live ranked battles, and a Mana graph after every battle (with tips if you lose).</p>' +
    '<p>🛡️ Clans: chat, ask for cards and donate them for gold, and Clan Wars on weekends. 😀 Collect emotes and pick your four, and 🏰 tower skins.</p>' +
    '<p>🏷️ Every card, arena and chest has a new, original name. 📜 Balance changes: see Balance notes on the Stats tab.</p>' +
    '<div class="mrow"><button class="btn blue" id="pBal">📜 Balance notes</button></div>');
  const b = $('#pBal'); if (b) b.onclick = openBalance;
};

/* ---------- start ---------- */
fix(); save();
checkUnlocks();
renderAll();
tournamentStart();
{ const r = parseCode(new URLSearchParams(location.search).get('replay')); if (r) setTimeout(() => watchReplay(r), 700); }
// tests on localhost
if (/^(localhost|127\.0\.0\.1|arcade\.test)$/.test(location.hostname)) window.__crx = { deckStats, counters, runDraft, watchReplay, loadReplays, replayCode, parseCode, questsCheck, seasonCheck, openClan, openSeason, openQuests, open2v2, openChallenges, openTraining, openTV, openReplays, openLeaderboard, arenaPreview, openBalance, openEmotes, openSkins, openMastery, duoWithBot, customBattle, randomBot, botProfile };
})();
