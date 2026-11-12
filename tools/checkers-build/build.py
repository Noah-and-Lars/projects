# Checkers 1.0: made from the Chess page, with the rules, pieces and names swapped. Run from the repo root: python3 tools/checkers-build/build.py
import re, sys
src = open('chess/index.html').read()
eng = open('tools/checkers-build/engine.js').read()
s = src
def rep(a, b, count=1):
    global s
    n = s.count(a)
    if n != count: sys.exit(f'expected {count} of: {a[:70]!r}, found {n}')
    s = s.replace(a, b)

# the engine
a = s.index('<script id="engine">'); b = s.index('</script>', a)
s = s[:a] + '<script id="engine">\n' + eng + '\n' + s[b:]

# names, saves, channels
rep('<title>Chess</title>', '<title>Checkers</title>')
rep('put("chessSave", ["name"]);', 'put("checkersSave", ["name"]);')
rep("const SAVE_KEY = 'chessSave';", "const SAVE_KEY = 'checkersSave';")
rep("get('chroom')", "get('ckroom')")
rep("const BASE = TEST ? 'ch-test-' + TEST : 'ch';", "const BASE = TEST ? 'ck2-test-' + TEST : 'ck2';")  # 1.0.1: optional jumps, new channels
rep("const KEY = 'chess-lb', TTL = 10 * 60e3;", "const KEY = 'checkers-lb', TTL = 10 * 60e3;")
rep("fetch(base + 'top?g=chess'", "fetch(base + 'top?g=checkers'")
rep("if (p && p.s && p.s.chess) rows.push({ n: String(p.n || n), r: best(p.s.chess) });", "if (p && p.s && p.s.checkers) rows.push({ n: String(p.n || n), r: best(p.s.checkers) });")
rep("'<div class=\"lbmsg\">Nobody has played chess with an account yet. Be the first!</div>'", "'<div class=\"lbmsg\">Nobody has played checkers with an account yet. Be the first!</div>'")
rep('🏆 Chess leaderboard', '🏆 Checkers leaderboard', 3)
rep('Everyone with an Arcade account who has played chess, ranked', 'Everyone with an Arcade account who has played checkers, ranked')
rep("const VERSION = '1.5';", "const VERSION = '1.0';")
rep('//  Chess v1.0: the board, the pieces and playing the computer', '//  Checkers v1.0 (made from Chess 1.5): the board, the pieces and playing the computer')

# the pieces
a = s.index('// ---------- the pieces:'); b = s.index('// ---------- saving ----------')
s = s[:a] + r'''// ---------- the pieces: flat checkers, drawn here so the game needs no image files ----------
function pieceSVG(p) {
  const red = p === p.toUpperCase(), king = p === 'K' || p === 'k';
  const [c1, c2, side, st, ring] = red ? ['#f2685e', '#b8261f', '#7a1410', '#5a0d0a', 'rgba(255,255,255,.35)'] : ['#5b5753', '#232120', '#0c0b0b', '#000', 'rgba(255,255,255,.18)'];
  const crown = king ? '<path d="M31 58 L27 36 L39 46 L50 30 L61 46 L73 36 L69 58 Z" fill="#ffd23f" stroke="#8a6200" stroke-width="2.5" stroke-linejoin="round"/><rect x="31" y="58" width="38" height="6" rx="2" fill="#ffd23f" stroke="#8a6200" stroke-width="2.5"/>' : '';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><defs><radialGradient id="g" cx=".4" cy=".35" r=".75"><stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></radialGradient></defs>`
    + `<circle cx="50" cy="56" r="39" fill="${side}"/><circle cx="50" cy="50" r="39" fill="url(#g)" stroke="${st}" stroke-width="3"/>`
    + `<circle cx="50" cy="50" r="30" fill="none" stroke="${ring}" stroke-width="3"/><circle cx="50" cy="50" r="22" fill="none" stroke="${ring}" stroke-width="2"/>${crown}</svg>`;
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
}
const IMG = {}; for (const p of 'PKpk') IMG[p] = pieceSVG(p);
$('logo').src = IMG.K;
document.head.insertAdjacentHTML('beforeend', `<link rel="icon" href="${IMG.K}">`);

''' + s[b:]

# the board: square numbers on the dark squares instead of a-h / 1-8
rep("""    if (col === 0) d.insertAdjacentHTML('beforeend', `<span class="coord r">${8 - (sq >> 3)}</span>`);
    if (row === 7) d.insertAdjacentHTML('beforeend', `<span class="coord f">${FILES[sq & 7]}</span>`);""",
"""    if ((row + col) % 2) d.insertAdjacentHTML('beforeend', `<span class="coord r">${num(sq)}</span>`);""")

# a move: slide along every jump, taking the jumped pieces as it passes them
a = s.index('// slide the pieces for one move'); b = s.index('// highlights: last move')
s = s[:a] + r'''// slide the piece along its jumps (the board state has already been updated), taking each jumped piece as it passes
let animMs = 0;
function animateMove(m, dropped) {
  const el = pieceEls[m.from], capEls = m.caps.map(c => { const e = pieceEls[c]; pieceEls[c] = null; return e; });
  pieceEls[m.from] = null; pieceEls[m.to] = el;
  const hops = m.path.slice(1), step = 190; animMs = dropped || hops.length < 2 ? 160 : hops.length * step;
  const crown = () => { if (el && m.pr) el.style.backgroundImage = `url("${IMG[m.pr]}")`; };
  if (!el) { capEls.forEach(removeEl); return; }
  el.classList.remove('drag');
  if (dropped || hops.length < 2) { placeEl(el, m.to, !dropped); capEls.forEach(removeEl); crown(); return; }
  hops.forEach((sq, i) => setTimeout(() => { placeEl(el, sq, true); setTimeout(() => removeEl(capEls[i]), 110); if (i === hops.length - 1) crown(); }, i * step));
}
''' + s[b:]
rep("""    d.classList.toggle('check', !!G.b[sq] && G.b[sq].toUpperCase() === 'K' && isW(G.b[sq]) === G.w && inCheck(G, G.w));""",
"""    d.classList.toggle('must', !over && !!legalNow.length && legalNow.some(m => m.cap && m.from === sq) && (localGame || (G.w ? 'w' : 'b') === player));""")
rep("""  if (selected >= 0 && save.hints) for (const m of legalNow) if (m.from === selected && !(m.pr && m.pr.toUpperCase() !== 'Q')) {""",
"""  if (selected >= 0 && save.hints) for (const m of legalNow) if (m.from === selected) {""")

# playing a move
rep("""  if (s.endsWith('#') || s.endsWith('+')) Sound.check(); else if (m.pr) Sound.promote(); else if (m.fl === 'c') Sound.castle(); else if (m.cap) Sound.capture(); else Sound.move();""",
"""  if (m.pr) Sound.promote(); else if (m.cap) { for (let i = 0; i < m.caps.length; i++) setTimeout(Sound.capture, i * 190); } else Sound.move();""")
rep("""function passTurn() { const id = ++localT; setTimeout(() => {""", """function passTurn() { const id = ++localT; setTimeout(() => {""")
rep("""player = G.w ? 'w' : 'b'; selected = -1; buildSquares(); renderAll(); renderSide(); }, 450); }""",
"""player = G.w ? 'w' : 'b'; selected = -1; buildSquares(); renderAll(); renderSide(); }, Math.max(450, animMs + 250)); }""")
rep("const SIDE = c => c === 'w' ? 'White' : 'Black';", "const SIDE = c => c === 'w' ? 'Red' : 'Black';")
rep("""  if (!legalNow.length) over = inCheck(G, G.w) ? { winner: side === 'w' ? 'b' : 'w', why: 'by checkmate' } : { winner: null, why: 'by stalemate' };
  else if (G.h >= 100) over = { winner: null, why: 'by the 50-move rule' };
  else if (keys.filter(k => k === keys[keys.length - 1]).length >= 3) over = { winner: null, why: 'by repetition' };
  else if (insufficient(G)) over = { winner: null, why: 'not enough pieces to checkmate' };""",
"""  if (!legalNow.length) over = { winner: side === 'w' ? 'b' : 'w', why: G.b.some(p => p && isW(p) === G.w) ? 'by blocking every piece' : 'by taking every piece' };
  else if (G.h >= 80) over = { winner: null, why: 'by the 40-move rule' };
  else if (keys.filter(k => k === keys[keys.length - 1]).length >= 3) over = { winner: null, why: 'by repetition' };""")
rep("""setTimeout(() => { if (over) { $('result').hidden = false; Sound.end(won); } }, 450);""", """setTimeout(() => { if (over) { $('result').hidden = false; Sound.end(won); } }, Math.max(450, animMs + 250));""")

# your moves: a jump with two routes to the same square takes the one that captures most
rep("""  if (cands.length > 1) { // a pawn reaching the last rank: choose the new piece
    if (dropped && pieceEls[from]) { const el = pieceEls[from]; el.classList.remove('drag'); placeEl(el, to); }
    askPromotion(from, to, cands); return true;
  }
  playMove(cands[0], dropped); return true;""",
"""  cands.sort((a, b) => b.caps.length - a.caps.length); // two jump routes to one square: the longer one
  playMove(cands[0], dropped); return true;""")
a = s.index('function askPromotion('); b = s.index("boardEl.addEventListener('pointerdown'")
s = s[:a] + s[b:]

# the side panel
a = s.index('function captured(forWhite)'); b = s.index('function capsHTML(white)')
s = s[:a] + r'''function captured(forWhite) { // the other colour's pieces this side has taken, and how many pieces it's ahead
  const have = { w: 0, b: 0 }; for (const p of G.b) if (p) have[isW(p) ? 'w' : 'b']++;
  const opp = forWhite ? 'b' : 'w', out = [];
  for (let i = 0; i < Math.max(0, 12 - have[opp]); i++) out.push(forWhite ? 'p' : 'P');
  return { out, lead: have[forWhite ? 'w' : 'b'] - have[opp] };
}
''' + s[b:]
rep("""  else if (online.on && (G.w ? 'w' : 'b') !== player) st = (inCheck(G, G.w) ? 'Check! ' : '') + `${oppName()}’s move.`;
  else st = (inCheck(G, G.w) ? 'Check! ' : '') + 'Your move.' + (online.on && !hist.length ? ` You’re ${player === 'w' ? 'White' : 'Black'}.` : '');""",
"""  else if (online.on && (G.w ? 'w' : 'b') !== player) st = `${oppName()}’s move.`;
  else st = (legalNow.length && legalNow[0].cap ? 'You can jump! ' : '') + 'Your move.' + (online.on && !hist.length ? ` You’re ${SIDE(player)}.` : '');""")
rep("""    const nm = c => c === 'w' ? 'White<small>Player 1</small>' : 'Black<small>Player 2</small>';""", """    const nm = c => c === 'w' ? 'Red<small>Player 1</small>' : 'Black<small>Player 2</small>';""")
rep("""a.textContent = c === 'w' ? '\\u2654' : '\\u265A';""", """a.textContent = c === 'w' ? '🔴' : '⚫';""")
rep(""": (inCheck(G, G.w) ? 'Check! ' : '') + SIDE(side) + ' to move.';""", """: (legalNow.length && legalNow[0].cap ? 'Can jump! ' : '') + SIDE(side) + ' to move.';""")

# html and css
rep('<button data-v="w">White</button><button data-v="r">Random</button><button data-v="b">Black</button>', '<button data-v="w">Red (first)</button><button data-v="r">Random</button><button data-v="b">Black</button>')
rep('<p>Online games are rated, like on chess.com. How well do you play? This sets your starting rating.</p>', '<p>Online games are rated (the Glicko system chess.com uses). How well do you play checkers? This sets your starting rating.</p>')
rep('<button data-lv="new">New to chess<small>400</small></button>', '<button data-lv="new">New to checkers<small>400</small></button>')
rep("""  .sq.check::after { content: ""; position: absolute; top: 0; right: 0; bottom: 0; left: 0; background: radial-gradient(circle, rgba(255, 0, 0, .9) 0%, rgba(231, 0, 0, .55) 35%, rgba(169, 0, 0, 0) 75%); }""",
"""  .sq.must::after { content: ""; position: absolute; top: 0; right: 0; bottom: 0; left: 0; box-shadow: inset 0 0 0 calc(var(--size) / 110) rgba(255, 210, 63, .85); pointer-events: none; }""")
rep(".coord.r { top: 5%; left: 5%; } .coord.f { bottom: 5%; right: 6%; }", ".coord.r { top: 5%; left: 6%; opacity: .7; }")
a = s.index('<div id="notes">'); b = s.index('</div>', s.index('</details>', a)) + len('</div>')
s = s[:a] + '''<div id="notes">
  <details>
    <summary>Patch notes <span>v1.0</span></summary>
    <h3>v1.0 <small>First release</small></h3>
    <ul>
      <li>Checkers, made from the arcade's Chess: the same board, buttons and online play, with checker pieces and checkers rules.</li>
      <li>American checkers: men move diagonally forward, and become kings (with a gold crown) on the far row; kings move both ways. Jumping is up to you (1.0.1): take a piece or make any other move. Once you jump, you keep jumping while you can. A man crowned in the middle of a jump stops there.</li>
      <li>Pieces that can jump are ringed in gold. Drag a piece or click it and then where it should go; legal moves show as dots, and a multi-jump slides through every hop.</li>
      <li>You win by taking every piece or leaving your opponent with no move. Draws: the same position three times, or 40 moves each with no capture and no man moved.</li>
      <li>Six computer levels, Easy to Master, plus Local 2-player on one screen.</li>
      <li>Play online: Quick match, private tables with a 5-letter code, chat, and rematches with colours swapped.</li>
      <li>Online games are rated (Glicko), with a checkers rating of its own and a separate <b>🏆 Checkers leaderboard</b>.</li>
      <li>Squares are numbered 1 to 32 the way checkers players write moves, so the move list reads like 11-15 or 22x15x8.</li>
    </ul>
  </details>
</div>''' + s[b:]

for bad in ['inCheck(', 'insufficient(', 'askPromotion', "m.fl", 'FILES', 'chessSave', "'ch-", 'chess.com does it', 'Chess leaderboard']:
    if bad in s: print('still there:', bad, [m.start() for m in re.finditer(re.escape(bad), s)][:5])
# 1.0: a wooden board, light and dark wood squares in a wooden frame (the colours the owner picked)
rep("--light: #ebecd0; --dark: #739552;", "--light: #ecca93; --dark: #a5652f;")
rep("  .sq.l { background: var(--light); } .sq.d { background: var(--dark); }",
"""  .sq.l { background: var(--light) repeating-linear-gradient(100deg, rgba(150, 90, 30, .07) 0 2px, transparent 2px 9px); }
  .sq.d { background: var(--dark) repeating-linear-gradient(100deg, rgba(60, 25, 5, .12) 0 2px, transparent 2px 10px); }
  #board { margin: 9px; box-shadow: 0 0 0 9px #d7a868, 0 0 0 11px #8a5524, 0 8px 22px 11px rgba(0, 0, 0, .35); }""")
rep("const size = W > 860 ? Math.min(H - 32 - 100, W - 340 - 52, 760) : Math.min(W - 16, 640);", "const size = W > 860 ? Math.min(H - 32 - 120, W - 340 - 72, 760) : Math.min(W - 36, 640); // room for the wooden frame")
open('checkers/index.html', 'w').write(s)
print('ok', len(s))
