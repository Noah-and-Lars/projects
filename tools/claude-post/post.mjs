// Posts every NEWS entry that is new since the last push to Social, as the Claude account.
// node tools/claude-post/post.mjs <old games.js> <new games.js>   env: BOT_KEY, ROOM (optional test room), DRY=1
// A NEWS entry may carry `post: '...'` to use that caption instead of the written-for-you one.
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
const keyOf = n => crypto.createHash('sha1').update([n.date, n.game || '', n.href || '', String(n.text).slice(0, 60)].join('|')).digest('hex');

function caption(n, g) {
  if (n.post) return n.post;
  const text = String(n.text).trim(), tag = g ? '\n\n#' + g.id.replace(/-/g, '') + ' #TheArcade' : '\n\n#TheArcade';
  let m;
  if ((m = text.match(/^New game:\s*([^.]+)\.\s*([\s\S]*)$/i)))
    return `🎮 Brand new on The Arcade: ${m[1].trim()}!\n\n${m[2]}\n\n▶️ It's in the Games tab now. Go set the first high score.` + tag;
  if ((m = text.match(/^New:\s*([\s\S]*)$/i)))
    return `✨ Something new just landed on The Arcade!\n\n${m[1]}\n\nGo try it and tell me what you think in the comments 👇` + tag;
  if (g && (m = text.match(/^(.+?\s(\d+(?:\.\d+)+[a-z]?))\s*:\s*([\s\S]*)$/)))
    return `🚀 ${m[1]} is live!\n\n${m[3]}\n\n▶️ Jump in from the Games tab. Drop your thoughts below 👇` + tag;
  return (g ? `🔧 Update for ${g.title}!\n\n` : '📣 Arcade update!\n\n') + text + tag;
}

function label(n, g) {
  const t = String(n.text);
  if (/^New game:/i.test(t)) return ['NEW GAME', g ? g.title : 'New game', ''];
  if (/^New:/i.test(t)) return ['NEW FEATURE', (t.match(/^New:\s*([^,.:]+)/i) || [])[1] || 'Something new', 'The Arcade'];
  const v = t.match(/^(.+?)\s(\d+(?:\.\d+)+[a-z]?)\s*:/);
  return ['UPDATE', g ? g.title : (v ? v[1] : 'The Arcade'), v ? 'Version ' + v[2] : ''];
}

const [, , oldFile, newFile] = process.argv;
const before = new Set(read(oldFile).news.map(keyOf));
const { news, games } = read(newFile);
const fresh = news.filter(n => n && n.text && !before.has(keyOf(n))).slice(0, 5).reverse(); // oldest first, so the newest ends up on top
if (!fresh.length) { console.log('no new NEWS entries'); process.exit(0); }
for (const n of fresh) {
  const g = games.find(x => x.id === n.game);
  const t = caption(n, g), [pill, title, sub] = label(n, g);
  const thumb = g && /\.(jpe?g|png|webp)$/i.test(g.thumb || '') && fs.existsSync(g.thumb) ? g.thumb : 'og.png';
  const out = JSON.parse(execFileSync('python3', ['tools/claude-post/card.py', thumb, pill, title, sub], { maxBuffer: 64 << 20 }).toString());
  console.log('---', keyOf(n).slice(0, 8), n.game || n.href || '', '\n' + t);
  if (process.env.DRY) { fs.writeFileSync('claude-post-' + keyOf(n).slice(0, 8) + '.jpg', Buffer.from(out.img, 'base64')); continue; }
  const r = await fetch(API, { method: 'POST', headers: { 'content-type': 'application/json', 'x-bot-key': process.env.BOT_KEY || '' },
    body: JSON.stringify({ key: keyOf(n), g: g ? g.id : '', t, img: out.img, poster: out.poster, w: out.w, h: out.h, r: process.env.ROOM || '' }) });
  console.log(r.status, await r.text());
  if (!r.ok) process.exitCode = 1;
}
