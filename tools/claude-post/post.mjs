// Posts to Social as the Claude account, for every push: each NEWS entry that is new, and every game whose `updated`
// time changed (or that is new) without a new NEWS entry of its own (then the commit message is the news).
// node tools/claude-post/post.mjs <old games.js> <new games.js>   env: BOT_KEY, ROOM (test room), COMMIT_MSG, DRY=1
// NEWS entry fields: post (the caption), imgs (feature screenshots, 1-4 paths in the repo), headline (the picture's big
// words), repost: N (post it again and remove the earlier post).
import fs from 'node:fs';
import vm from 'node:vm';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';

const API = 'https://arcade-realtime.arcade-realtime.workers.dev/clips/bot';
const read = file => {
  const window = {}, noop = () => {}, node = () => ({ style: {}, classList: { add: noop }, append: noop, setAttribute: noop });
  const ctx = vm.createContext({ window, self: window, localStorage: { getItem: () => null, setItem: noop }, sessionStorage: { getItem: () => null, setItem: noop },
    document: { addEventListener: noop, querySelector: () => null, getElementById: () => null, createElement: node, head: node(), body: node() }, navigator: {}, location: { search: '', hash: '' }, setTimeout: noop, addEventListener: noop });
  try { vm.runInContext(fs.readFileSync(file, 'utf8'), ctx); } catch (e) { /* the page-only parts at the end fail here; NEWS and GAMES are set first */ }
  return { news: window.NEWS || [], games: window.GAMES || [] };
};
const hash = s => crypto.createHash('sha1').update(s).digest('hex');
const baseKey = n => n.auto ? 'upd:' + n.game + ':' + n.updated : hash([n.date, n.game || '', n.href || '', String(n.text).slice(0, 60)].join('|'));
const keyOf = n => baseKey(n) + (n.repost ? ':' + n.repost : '');
const fileOf = p => String(p || '').split('?')[0];

const EMOJI = [[/submarine|sub\b|dive|sonar|torpedo|underwater|sea\b|ocean/i, '🌊'], [/heli|fly|plane|jet|air/i, '🚁'], [/map|stage|level|world|island|place/i, '🗺️'],
  [/gun|weapon|missile|bomb|rifle|knife/i, '💥'], [/leaderboard|rank|rating|score/i, '🏆'], [/online|friend|lobby|versus|multiplayer|voice|chat/i, '👥'],
  [/car|race|drive|rally/i, '🏎️'], [/skin|look|model|new .*(model|design)/i, '🎨'], [/fix|bug|smoother|faster/i, '🔧']];
const emojiFor = s => (EMOJI.find(([re]) => re.test(s)) || [0, '✨'])[1];
const sentences = s => (String(s).match(/[^.!?]+[.!?]*/g) || []).map(x => x.trim()).filter(Boolean);
const cap1 = s => s.charAt(0).toUpperCase() + s.slice(1);
const short = s => { const w = String(s).split(/,|\(|;| with | and the | so /)[0].trim().split(/\s+/); return w.slice(0, 7).join(' ') + (w.length > 7 ? '…' : ''); };

// "Havoc Bay 1.4: submarines and helicopters. Dive ..." -> { name: 'Havoc Bay', ver: '1.4', head: 'Submarines and helicopters', rest: [...] }
function parse(n, g) {
  const text = String(n.text).trim();
  let m;
  if ((m = text.match(/^New game:\s*([^.]+)\.\s*([\s\S]*)$/i))) return { kind: 'game', name: m[1].trim(), ver: '', head: n.headline || m[1].trim(), rest: sentences(m[2]) };
  if ((m = text.match(/^New:\s*([\s\S]*)$/i))) { const s = sentences(m[1]); return { kind: 'feature', name: 'The Arcade', ver: '', head: n.headline || (s[0] || '').replace(/[,.].*$/, ''), rest: s }; }
  if ((m = text.match(/^(.+?)\s(\d+(?:\.\d+)+[a-z]?)\s*:\s*([\s\S]*)$/))) { const s = sentences(m[3]), h = n.headline || cap1(short(s[0] || '').replace(/[.!]$/, '')); if (s[0] && h.toLowerCase() === s[0].replace(/[.!]$/, '').toLowerCase()) s.shift(); return { kind: 'update', name: g ? g.title : m[1], ver: m[2], head: h, rest: s }; }
  return { kind: 'update', name: g ? g.title : 'The Arcade', ver: '', head: n.headline || cap1(short(sentences(text)[0] || 'Update')).replace(/[.!]$/, ''), rest: sentences(text).slice(1) };
}

function caption(n, g, p) {
  if (n.post) return n.post;
  const tags = '\n\n' + (g ? '#' + g.id.replace(/-/g, '') + ' ' : '') + '#TheArcade #' + (p.kind === 'game' ? 'NewGame' : p.kind === 'feature' ? 'NewFeature' : 'Update');
  const bullets = p.rest.slice(0, 5).map(s => emojiFor(s) + ' ' + s).join('\n');
  const hook = p.kind === 'game' ? `🎮 NEW GAME just dropped: ${p.name}!` : p.kind === 'feature' ? `✨ New on The Arcade: ${p.head}!` : `🚨 ${p.name}${p.ver ? ' ' + p.ver : ''} is out now!`;
  const sub = p.kind === 'update' && p.head ? `\n${emojiFor(p.head)} ${p.head}!` : '';
  const cta = p.kind === 'game' ? '▶️ Play it now in the Games tab and grab the first high score 👀' : p.kind === 'feature' ? 'Go try it and tell me what you think 👇' : '▶️ Jump in from the Games tab. What are you trying first? 👇';
  let t = `${hook}${sub}\n\n${bullets}${bullets ? '\n\n' : ''}${cta}${tags}`;
  while (t.length > 700 && p.rest.length) { p.rest.pop(); t = caption(n, g, p); }
  return t;
}

const [, , oldFile, newFile] = process.argv;
const old = read(oldFile), { news, games } = read(newFile);
const before = new Set(old.news.map(keyOf));
const fresh = news.filter(n => n && n.text && !before.has(keyOf(n))).slice(0, 5);
// a game that was updated (or added) without its own new NEWS line still gets a post, from the commit message
const msg = String(process.env.COMMIT_MSG || '').split('\n')[0].trim();
for (const g of games) {
  const was = old.games.find(x => x.id === g.id);
  if ((was && was.updated === g.updated) || fresh.some(n => n.game === g.id)) continue;
  if (!old.games.length) continue; // the first run has nothing to compare with
  const text = was ? (/\d+\.\d+/.test(msg) ? msg.replace(/^[^:]*?(\d+(?:\.\d+)+[a-z]?)\s*[:,-]?\s*/, g.title + ' $1: ') : g.title + ' update: ' + (msg || g.tagline) + '.') : 'New game: ' + g.title + '. ' + (g.description || g.tagline);
  fresh.push({ auto: 1, game: g.id, updated: g.updated, text });
}
if (!fresh.length) { console.log('nothing new to post'); process.exit(0); }
fresh.reverse(); // oldest first, so the newest ends up on top
for (const n of fresh) {
  const g = games.find(x => x.id === n.game), p = parse(n, g);
  const shots = [].concat(n.imgs || n.img || []).map(fileOf).filter(f => fs.existsSync(f) && /\.(jpe?g|png|webp)$/i.test(f));
  const thumb = g && /\.(jpe?g|png|webp)$/i.test(fileOf(g.thumb)) && fs.existsSync(fileOf(g.thumb)) ? fileOf(g.thumb) : 'og.png';
  const t = caption(n, g, { ...p, rest: p.rest.slice() });
  const card = { imgs: shots.length ? shots : [thumb], pill: p.kind === 'game' ? 'NEW GAME' : p.kind === 'feature' ? 'NEW FEATURE' : 'UPDATE',
    kicker: p.kind === 'feature' ? '' : p.name + (p.ver ? ' ' + p.ver : ''), headline: p.kind === 'game' ? p.name : p.head };
  const out = JSON.parse(execFileSync('python3', ['tools/claude-post/card.py'], { input: JSON.stringify(card), maxBuffer: 64 << 20 }).toString());
  const key = keyOf(n), replace = n.repost ? [baseKey(n), ...Array.from({ length: n.repost - 1 }, (_, i) => baseKey(n) + ':' + (i + 1))] : [];
  console.log('---', key.slice(0, 12), n.game || n.href || '', shots.length ? shots.join(', ') : '(thumbnail)', '\n' + t);
  if (process.env.DRY) { fs.writeFileSync('claude-post-' + key.slice(0, 8) + '.jpg', Buffer.from(out.img, 'base64')); continue; }
  const r = await fetch(API, { method: 'POST', headers: { 'content-type': 'application/json', 'x-bot-key': process.env.BOT_KEY || '' },
    body: JSON.stringify({ key, replace, g: g ? g.id : '', t, img: out.img, poster: out.poster, w: out.w, h: out.h, r: process.env.ROOM || '' }) });
  console.log(r.status, await r.text());
  if (!r.ok) process.exitCode = 1;
}
