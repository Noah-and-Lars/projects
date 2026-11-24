// ad-hoc screenshot tool: node scripts/shots.mjs <level> name:x,y,z,yaw,pitch ...
import { openGame, serve, shot } from '../tests/e2e/harness.mjs';
const [level, ...views] = process.argv.slice(2);
const { srv, url } = await serve();
const { browser, page, errors } = await openGame(url, 'test=1&level=' + level, { width: 960, height: 540 });
for (const v of views) {
  const [name, rest] = v.split(':');
  const [x, y, z, yaw, pitch] = rest.split(',').map(Number);
  await page.evaluate(([x, y, z, yaw, pitch]) => { const g = window.__game; g.game.cameraOverride = { eye: { x, y, z }, yaw, pitch }; g.step(2); }, [x, y, z, yaw, pitch]);
  console.log(await shot(page, name));
}
if (errors.length) console.log('ERRORS', errors.slice(0, 5));
await browser.close(); srv.close();
