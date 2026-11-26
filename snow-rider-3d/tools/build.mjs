// Builds the single-file game: snow-rider-3d/index.html.
//
// Takes the loader page src/index.html and inlines the three Unity build
// files from src/Build/ as base64 blocks ahead of the loader script. The
// loader finds those blocks and uses them instead of fetching Build/, so the
// result opens with a double-click (file://) as well as from any web host.
//
//   node snow-rider-3d/tools/build.mjs
import { readFileSync, writeFileSync, statSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const src = join(root, 'src');
const build = join(src, 'Build');

const files = {
  // The framework is plain JS; gzip it here to keep the HTML smaller.
  framework: gzipSync(readFileSync(join(build, 'SnowRider3D.wasm.framework.js')), { level: 9 }),
  // These two are already gzip (.unityweb).
  code: readFileSync(join(build, 'SnowRider3D.wasm.code.unityweb')),
  data: readFileSync(join(build, 'SnowRider3D.data.unityweb')),
};

// Wrap base64 at 76 chars per line so editors and diff tools cope with the file.
const wrap = (b64) => b64.replace(/.{1,76}/g, '$&\n');

const blocks = Object.entries(files)
  .map(([key, buf]) =>
    `<script type="application/octet-stream" id="build-${key}">\n${wrap(buf.toString('base64'))}</script>`)
  .join('\n');

const page = readFileSync(join(src, 'index.html'), 'utf8');
const marker = '\n<script>\n';
const at = page.indexOf(marker);
if (at < 0) throw new Error('Could not find the loader <script> in src/index.html');

const banner = '<!-- Built by tools/build.mjs from src/index.html and src/Build/. Edit those, then rebuild. -->\n';
const out = page.slice(0, at) + '\n' + banner + blocks + page.slice(at);

const dest = join(root, 'index.html');
writeFileSync(dest, out);
console.log(`Wrote ${dest} (${(statSync(dest).size / 1048576).toFixed(1)} MB)`);
