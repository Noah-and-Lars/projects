// Package dist/ as a single page + one script for publishing as an artifact:
//   npm run build && node scripts/make-artifact.mjs <out-dir>
// Writes <out-dir>/wrecking-shift.html (styles inlined) and <out-dir>/assets/game.js.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.resolve(process.argv[2] ?? path.join(root, 'artifact'));
const dist = path.join(root, 'dist');
const html = fs.readFileSync(path.join(dist, 'index.html'), 'utf8');
const assets = fs.readdirSync(path.join(dist, 'assets'));
const js = assets.find((f) => f.endsWith('.js'));
const css = assets.find((f) => f.endsWith('.css'));
if (!js) throw new Error('no script in dist/assets — run `npm run build` first');
const inlineStyle = (html.match(/<style>([\s\S]*?)<\/style>/) ?? [, ''])[1];
const body = (html.match(/<body>([\s\S]*?)<\/body>/) ?? [, ''])[1].replace(/<script[^>]*><\/script>/g, '').trim();
const sheet = css ? fs.readFileSync(path.join(dist, 'assets', css), 'utf8') : '';
fs.mkdirSync(path.join(out, 'assets'), { recursive: true });
fs.copyFileSync(path.join(dist, 'assets', js), path.join(out, 'assets', 'game.js'));
fs.writeFileSync(path.join(out, 'wrecking-shift.html'),
  `<title>Wrecking Shift</title>\n<meta name="color-scheme" content="dark">\n<style>:root{color-scheme:dark}${inlineStyle}${sheet}</style>\n${body}\n<script type="module" src="./assets/game.js"></script>\n`);
console.log('artifact written to', out);
