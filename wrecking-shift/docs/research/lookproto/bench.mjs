// node bench.mjs [w] [h] [modes,comma] [extraQuery] -> ms/frame (SwiftShader, relative only)
import { chromium } from 'playwright';
import { listen, server } from './server.mjs';
const [w = '320', h = '180', modes = 'B0,B,B4k,A,Anoao,Aface,Anosun,Asoft,Aray1,Aray', extra = ''] = process.argv.slice(2);
const port = await listen(8900 + Math.floor(Math.random() * 99));
const b = await chromium.launch();
const out = {};
for (const mode of modes.split(',')) {
  const p = await b.newPage({ viewport: { width: +w, height: +h }, deviceScaleFactor: 1 });
  p.on('pageerror', e => console.log('pageerror:', e.message));
  await p.goto(`http://localhost:${port}/index.html?mode=${mode}&w=${w}&h=${h}&noacc=1${extra}`);
  await p.waitForFunction(() => window.ready, null, { timeout: 120000 });
  const runs = [];
  for (let r = 0; r < 3; r++) runs.push(await p.evaluate(() => api.bench(8)));
  const info = await p.evaluate(() => api.info());
  out[mode] = { msMin: +Math.min(...runs).toFixed(2), runs: runs.map(x => +x.toFixed(1)), tris: info.tris, calls: info.calls };
  console.log(mode, JSON.stringify(out[mode]));
  await p.close();
}
await b.close(); server.close();
