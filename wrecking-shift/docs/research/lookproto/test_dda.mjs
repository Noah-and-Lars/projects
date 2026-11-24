import { chromium } from 'playwright';
import { listen, server } from './server.mjs';
const port = await listen(8781);
const b = await chromium.launch(); const p = await b.newPage();
p.on('console', m => console.log('console:', m.text())); p.on('pageerror', e => console.log('pageerror:', e.message));
await p.goto(`http://localhost:${port}/test_dda.html`); await p.waitForFunction(() => window.ready);
console.log(JSON.stringify(await p.evaluate(() => runTest({ side: 256 })), null, 1));
await b.close(); server.close();
