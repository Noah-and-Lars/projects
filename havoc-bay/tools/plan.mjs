// Measured plan of a built model, for placing the game's gun mounts on a ship: a side view (top half) and a top
// view (bottom half), both orthographic with +z (the bow) to the right, a grid every game unit (bold every 5) and
// labelled coordinates.   node plan.mjs <model.glb> <out.png> [width]
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
const { chromium } = createRequire(import.meta.url)('playwright'); // the container's preinstalled copy

const HERE = path.dirname(fileURLToPath(import.meta.url));
const [file, out, width = '1800'] = process.argv.slice(2);
const dir = path.dirname(path.resolve(file)), name = path.basename(file);
const NM = path.join(HERE, 'node_modules');
const routes = { '/three.js': path.join(NM, 'three/build/three.min.js'), '/gltf.js': path.join(NM, 'three/examples/js/loaders/GLTFLoader.js') };
const page = `<!doctype html><body style="margin:0;background:#fff;font:11px sans-serif"><div id="w" style="position:relative"></div>
<script src="/three.js"></script><script src="/gltf.js"></script><script>
new THREE.GLTFLoader().load('/m/${encodeURIComponent(name)}', g => {
  const m = g.scene; m.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(m), W = ${+width};
  const pad = 2, z0 = Math.floor(box.min.z) - pad, z1 = Math.ceil(box.max.z) + pad;
  const sx = W / (z1 - z0);                                        // pixels per game unit
  const yA = Math.floor(box.min.y) - pad, yB = Math.ceil(box.max.y) + pad, xA = Math.floor(box.min.x) - pad, xB = Math.ceil(box.max.x) + pad;
  const H1 = Math.round((yB - yA) * sx), H2 = Math.round((xB - xA) * sx), H = H1 + H2 + 4;
  const R = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true }); R.setSize(W, H); R.setScissorTest(true);
  const wrap = document.getElementById('w'); wrap.appendChild(R.domElement);
  const scene = new THREE.Scene(); scene.background = new THREE.Color(0xf4f6f8);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x888888, 0.8)); const sun = new THREE.DirectionalLight(0xffffff, 0.6); sun.position.set(0.4, 0.8, 0.5); scene.add(sun);
  scene.add(m);
  const lines = (pts, color) => { const gm = new THREE.BufferGeometry().setFromPoints(pts); return new THREE.LineSegments(gm, new THREE.LineBasicMaterial({ color, depthTest: false, transparent: true, opacity: 0.55 })); };
  const label = (txt, x, y, c) => { const d = document.createElement('div'); d.textContent = txt; d.style.cssText = 'position:absolute;color:' + (c || '#c00') + ';left:' + x + 'px;top:' + y + 'px'; wrap.appendChild(d); };
  // side view: camera on -x looking +x: screen right is +z, up is +y
  const gS = [], gSb = [], gT = [], gTb = [];
  for (let z = z0; z <= z1; z++) { const a = z % 5 ? gS : gSb; a.push(new THREE.Vector3(0, yA, z), new THREE.Vector3(0, yB, z)); (z % 5 ? gT : gTb).push(new THREE.Vector3(xA, 0, z), new THREE.Vector3(xB, 0, z)); }
  for (let y = yA; y <= yB; y++) (y % 5 ? gS : gSb).push(new THREE.Vector3(0, y, z0), new THREE.Vector3(0, y, z1));
  for (let x = xA; x <= xB; x++) (x % 5 ? gT : gTb).push(new THREE.Vector3(x, 0, z0), new THREE.Vector3(x, 0, z1));
  const side = new THREE.Group(); side.add(lines(gS, 0x99aabb), lines(gSb, 0x334455)); side.children.forEach(l => l.renderOrder = 9);
  const top = new THREE.Group(); top.add(lines(gT, 0x99aabb), lines(gTb, 0x334455)); top.children.forEach(l => l.renderOrder = 9);
  const camS = new THREE.OrthographicCamera(z0 - (z1 + z0) / 2, z1 - (z1 + z0) / 2, (yB - yA) / 2, -(yB - yA) / 2, -1000, 1000);
  camS.position.set(-500, (yA + yB) / 2, (z0 + z1) / 2); camS.up.set(0, 1, 0); camS.lookAt(0, (yA + yB) / 2, (z0 + z1) / 2);
  scene.add(side); R.setViewport(0, H2 + 4, W, H1); R.setScissor(0, H2 + 4, W, H1); R.render(scene, camS); scene.remove(side);
  // top view: camera above with up = +x: screen right is +z, up is +x
  const camT = new THREE.OrthographicCamera(-(z1 - z0) / 2, (z1 - z0) / 2, (xB - xA) / 2, -(xB - xA) / 2, -1000, 1000);
  camT.position.set((xA + xB) / 2, 500, (z0 + z1) / 2); camT.up.set(1, 0, 0); camT.lookAt((xA + xB) / 2, 0, (z0 + z1) / 2);
  scene.add(top); R.setViewport(0, 0, W, H2); R.setScissor(0, 0, W, H2); R.render(scene, camT); scene.remove(top);
  for (let z = z0; z <= z1; z += 5) { label('z ' + z, (z - z0) * sx + 2, 0); label('z ' + z, (z - z0) * sx + 2, H1 + 6); }
  for (let y = yA; y <= yB; y += 1) if (y % 5 === 0 || yB - yA < 16) label('y ' + y, 2, (yB - y) * sx - 6, '#06c');
  for (let x = xA; x <= xB; x += 1) if (x % 5 === 0 || xB - xA < 16) label('x ' + x, 2, H1 + 4 + (xB - x) * sx - 6, '#06c');
  window.SIZE = { W, H, bounds: [box.min.toArray(), box.max.toArray()].map(v => v.map(n => +n.toFixed(2))) };
}, undefined, e => { window.SIZE = { error: String(e) }; });
</script>`;
const srv = http.createServer((q, r) => {
  const u = decodeURIComponent(q.url.split('?')[0]);
  if (u === '/') { r.writeHead(200, { 'content-type': 'text/html' }); return r.end(page); }
  const p = routes[u] || (u.startsWith('/m/') ? path.join(dir, u.slice(3)) : null);
  if (!p || !(p.startsWith(dir) || Object.values(routes).includes(p)) || !fs.existsSync(p)) { r.writeHead(404); return r.end(); }
  r.writeHead(200); fs.createReadStream(p).pipe(r);
}).listen(0);
const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
const pg = await b.newPage({ viewport: { width: +width, height: 400 } });
pg.on('pageerror', e => console.log('pageerror', e.message));
await pg.goto(`http://127.0.0.1:${srv.address().port}/`);
await pg.waitForFunction(() => window.SIZE, null, { timeout: 180000 });
const S = await pg.evaluate(() => window.SIZE);
await pg.setViewportSize({ width: S.W || +width, height: S.H || 400 });
await pg.screenshot({ path: out, fullPage: true });
console.log(JSON.stringify(S));
await b.close(); srv.close();
