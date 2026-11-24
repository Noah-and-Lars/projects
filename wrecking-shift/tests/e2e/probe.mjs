// Dev helper: node tests/e2e/probe.mjs <quality> <tod> <view> x,y [x,y ...]  -> CPU sun-occlusion at the world point under a pixel
import { openGame, serve } from './harness.mjs';
import { look, setCam } from './lookviews.mjs';

const [quality, tod, view, ...pix] = process.argv.slice(2);
const { srv, url } = await serve();
const { browser, page } = await openGame(url, 'test=1&level=testyard');
await look(page, quality, tod);
await setCam(page, view);
await page.evaluate(() => window.__game.render());
for (const p of pix) {
  const [px, py] = p.split(',').map(Number);
  const r = await page.evaluate(([px, py]) => {
    const g = window.__game.game, R = g.renderer, cam = R.camera;
    const ndc = { x: (px + 0.5) / 640 * 2 - 1, y: -((py + 0.5) / 360 * 2 - 1) };
    const o = cam.position.clone();
    const d = o.clone().set(ndc.x, ndc.y, 0.5).unproject(cam).sub(cam.position).normalize();
    const hit = g.sim.raycast({ x: o.x, y: o.y, z: o.z }, { x: d.x, y: d.y, z: d.z }, 200);
    if (!hit) return 'no hit';
    const w = R.volumes.world, occ = w.occ, org = w.origin;
    const sd = R.sun.position.clone().sub(R.sun.target.position).normalize();
    const P = [hit.point.x, hit.point.y, hit.point.z];
    const pv = [(P[0] - org[0]) * 10 + hit.normal.x * 0.05, (P[1] - org[1]) * 10 + hit.normal.y * 0.05, (P[2] - org[2]) * 10 + hit.normal.z * 0.05];
    return { pos: hit.point, normal: hit.normal, body: hit.body.name, pv, shadowCPU: occ.trace(pv[0], pv[1], pv[2], sd.x, sd.y, sd.z, 4000) };
  }, [px, py]);
  console.log(p, JSON.stringify(r));
}
await browser.close();
srv.close();
