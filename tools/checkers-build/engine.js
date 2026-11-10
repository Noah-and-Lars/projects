'use strict';
// =====================================================================
//  Checkers: the rules and the computer player (also run in a Web Worker)
// =====================================================================
// American checkers (English draughts) on the dark squares of an 8x8 board. Red ('w', at the bottom) moves first.
// Men move one square diagonally forward and become kings on the far row; kings move one square diagonally either
// way. Taking is compulsory: a piece that can jump must, and keeps jumping while it can (a man that is crowned
// mid-jump stops there). You lose when you have no pieces or no move. Draws: the same position three times, or
// 40 moves each with no capture and no man moved.
// The board is 64 squares (0 = top left) so the board code can stay the same as Chess. Pieces: P red man, K red king,
// p black man, k black king. A "FEN" here is 'w:<64 squares, . for empty>:<plies without progress>'.
const START_FEN = 'w:' + Array.from({ length: 64 }, (_, s) => { const r = s >> 3, c = s & 7; return (r + c) % 2 === 1 ? (r < 3 ? 'p' : r > 4 ? 'P' : '.') : '.'; }).join('') + ':0';
const isW = p => p !== '' && p === p.toUpperCase();
const isKing = p => p === 'K' || p === 'k';
// squares are named 1-32, the way checkers players write them: row by row from Black's side
const num = s => (s >> 3) * 4 + ((s & 7) >> 1) + 1;
const sqName = num;
const D4 = [[-1, -1], [-1, 1], [1, -1], [1, 1]], FWD_W = [[-1, -1], [-1, 1]], FWD_B = [[1, -1], [1, 1]];

function fromFEN(fen) {
  const [side, bd, h] = String(fen).split(':');
  return { b: bd.split('').map(c => c === '.' ? '' : c), w: side === 'w', h: +h || 0, u: [] };
}
function toFEN(G) { return (G.w ? 'w' : 'b') + ':' + G.b.map(p => p || '.').join('') + ':' + G.h; }
const posKey = G => G.b.map(p => p || '.').join('') + (G.w ? 'w' : 'b');

function mk(from, to, path, caps, p) {
  const crown = !isKing(p) && (isW(p) ? to >> 3 === 0 : to >> 3 === 7);
  return { from, to, path, caps, p, cap: caps.length > 0, pr: crown ? (isW(p) ? 'K' : 'k') : '' };
}
// every way the piece on `origin` can keep jumping from `cur`
function jumps(G, origin, cur, p, dirs, path, caps, out) {
  let any = false;
  for (const [dr, dc] of dirs) {
    const r = (cur >> 3) + dr * 2, c = (cur & 7) + dc * 2;
    if (r < 0 || r > 7 || c < 0 || c > 7) continue;
    const mid = cur + dr * 8 + dc, land = r * 8 + c, q = G.b[mid];
    if (!q || isW(q) === isW(p) || caps.includes(mid)) continue;
    if (G.b[land] && land !== origin) continue;
    any = true;
    const np = path.concat(land), nc = caps.concat(mid);
    if (!isKing(p) && (isW(p) ? r === 0 : r === 7)) out.push(mk(origin, land, np, nc, p)); // crowned: the move ends
    else jumps(G, origin, land, p, dirs, np, nc, out);
  }
  if (!any && caps.length) out.push(mk(origin, cur, path, caps, p));
}
function gen(G) {
  const caps = [], quiet = [];
  for (let s = 0; s < 64; s++) {
    const p = G.b[s]; if (!p || isW(p) !== G.w) continue;
    const dirs = isKing(p) ? D4 : G.w ? FWD_W : FWD_B;
    jumps(G, s, s, p, dirs, [s], [], caps);
    if (!caps.length) for (const [dr, dc] of dirs) {
      const r = (s >> 3) + dr, c = (s & 7) + dc; if (r < 0 || r > 7 || c < 0 || c > 7) continue;
      const t = r * 8 + c; if (!G.b[t]) quiet.push(mk(s, t, [s, t], [], p));
    }
  }
  return caps.length ? caps : quiet;
}
const legal = G => gen(G);
function make(G, m) {
  const taken = m.caps.map(c => G.b[c]);
  G.u.push({ m, taken, h: G.h });
  G.b[m.from] = ''; for (const c of m.caps) G.b[c] = ''; G.b[m.to] = m.pr || m.p;
  G.h = m.cap || !isKing(m.p) ? 0 : G.h + 1; G.w = !G.w;
}
function unmake(G) {
  const { m, taken, h } = G.u.pop();
  G.b[m.to] = ''; m.caps.forEach((c, i) => { G.b[c] = taken[i]; }); G.b[m.from] = m.p;
  G.h = h; G.w = !G.w;
}
// a move written the checkers way: 11-15, or 22x15x8 for jumps; it's also what goes over the network
const uci = m => m.path.map(num).join(m.cap ? 'x' : '-');
const san = (G, m) => uci(m) + (m.pr ? '♛' : '');

// ---------- evaluation (from the side to move) ----------
const CENTER = s => { const r = s >> 3, c = s & 7; return (r >= 2 && r <= 5 && c >= 2 && c <= 5) ? 1 : 0; };
function evaluate(G) {
  let sc = 0, rm = 0, bm = 0, rk = 0, bk = 0;
  for (let s = 0; s < 64; s++) {
    const p = G.b[s]; if (!p) continue;
    const r = s >> 3, c = s & 7;
    if (p === 'P') { rm++; sc += 100 + (7 - r) * 3 + CENTER(s) * 4 + (r === 7 ? 6 : 0) + (c === 0 || c === 7 ? 2 : 0); }
    else if (p === 'p') { bm++; sc -= 100 + r * 3 + CENTER(s) * 4 + (r === 0 ? 6 : 0) + (c === 0 || c === 7 ? 2 : 0); }
    else if (p === 'K') { rk++; sc += 155 + CENTER(s) * 8 - (r === 0 || r === 7 || c === 0 || c === 7 ? 4 : 0); }
    else { bk++; sc -= 155 + CENTER(s) * 8 - (r === 0 || r === 7 || c === 0 || c === 7 ? 4 : 0); }
  }
  const red = rm + rk, black = bm + bk, total = red + black;
  // ahead in material: trade pieces off (an even trade helps the side with more)
  if (red !== black && total < 20) sc += (red > black ? 1 : -1) * (24 - total) * 4;
  // the side behind with only kings left can't win: lean towards a draw for it
  if (!rm && !bm && Math.abs(red - black) <= 0) sc = sc / 4;
  // late in the game, kings hunt: the stronger side's kings close in on the other side's pieces
  if (total <= 8 && red !== black) {
    const strong = red > black, mine = [], theirs = [];
    for (let s = 0; s < 64; s++) { const p = G.b[s]; if (!p) continue; (isW(p) === strong ? mine : theirs).push(s); }
    let d = 0; for (const a of mine) if (isKing(G.b[a])) for (const b of theirs) d += Math.max(Math.abs((a >> 3) - (b >> 3)), Math.abs((a & 7) - (b & 7)));
    sc += (strong ? -1 : 1) * d;
  }
  return G.w ? sc : -sc;
}

// ---------- search ----------
const WIN = 100000, INF = 1e9;
function order(ms, S, ply) {
  for (const m of ms) m._o = m.caps.length * 100 + (m.pr ? 50 : 0) + (S.killers[ply] === uci(m) ? 30 : 0) + (S.hist[uci(m)] || 0) / 64;
  return ms.sort((a, b) => b._o - a._o);
}
function search(G, depth, alpha, beta, ply, S) {
  if ((++S.nodes & 1023) === 0 && Date.now() > S.end) S.stop = true;
  if (S.stop) return 0;
  const ms = gen(G);
  if (!ms.length) return -WIN + ply;
  if (G.h >= 80) return 0;
  // forced captures always get looked at, so the search never stops in the middle of an exchange
  if (depth <= 0 && (!ms[0].cap || ply > 48)) return evaluate(G);
  order(ms, S, ply);
  let best = -INF;
  for (const m of ms) {
    make(G, m); const v = -search(G, depth - 1, -beta, -alpha, ply + 1, S); unmake(G);
    if (S.stop) return 0;
    if (v > best) best = v;
    if (v > alpha) alpha = v;
    if (alpha >= beta) { if (!m.cap) { S.killers[ply] = uci(m); S.hist[uci(m)] = (S.hist[uci(m)] || 0) + depth * depth; } break; }
  }
  return best;
}
function rootScores(G, depth, S, first) {
  const out = [], ms = order(gen(G), S, 0);
  if (first) { const i = ms.findIndex(m => uci(m) === first); if (i > 0) ms.unshift(ms.splice(i, 1)[0]); }
  for (const m of ms) {
    make(G, m);
    let v = -search(G, depth - 1, -INF, INF, 1, S);
    if (S.seen.has(posKey(G)) && v > 0) v -= 40; // don't walk into a repetition when ahead
    unmake(G);
    if (S.stop) break; out.push({ m, v });
  }
  return out.sort((a, b) => b.v - a.v);
}
function deepest(G, S, maxD) {
  let best = null;
  for (let d = 1; d <= maxD; d++) {
    const sc = rootScores(G, d, S, best && uci(best.m));
    if (sc.length && (!S.stop || !best)) best = sc[0];
    if (S.stop || (best && Math.abs(best.v) > WIN / 2)) break;
  }
  return best;
}
function pickMove(fen, level, history) {
  const G = fromFEN(fen), moves = legal(G); if (!moves.length) return null;
  if (moves.length === 1) return uci(moves[0]);
  const S = { nodes: 0, stop: false, end: Date.now() + 60000, killers: [], hist: {}, seen: new Set(history || []) };
  const rnd = a => a[Math.floor(Math.random() * a.length)];
  if (level === 'easy') { // a beginner: often just plays something, and only looks at the move itself
    if (Math.random() < 0.35) return uci(rnd(moves));
    const sc = rootScores(G, 1, S), top = sc[0].v;
    return uci(rnd(sc.filter(x => x.v >= top - 60)).m);
  }
  if (level === 'casual') { // sees a reply ahead, now and then plays a loose move
    if (Math.random() < 0.12) return uci(rnd(moves));
    const sc = rootScores(G, 3, S), top = sc[0].v;
    if (top > WIN / 2) return uci(sc[0].m);
    return uci(rnd(sc.filter(x => x.v >= top - 30)).m);
  }
  if (level === 'medium') { // a club player: five moves deep, sometimes a slightly weaker move
    S.end = Date.now() + 2500;
    const sc = rootScores(G, 5, S); if (!sc.length) return uci(moves[0]);
    const top = sc[0].v; if (top > WIN / 2) return uci(sc[0].m);
    return uci(rnd(sc.filter(x => x.v >= top - (Math.random() < 0.15 ? 25 : 8))).m);
  }
  // advanced, hard and master: the best move it finds in 0.8, 1.6 or 4 seconds
  S.end = Date.now() + (level === 'advanced' ? 800 : level === 'master' ? 4000 : 1600);
  const best = deepest(G, S, level === 'advanced' ? 9 : level === 'master' ? 30 : 16);
  return uci(best ? best.m : moves[0]);
}
