// Renders a glTF/glb from four sides in headless Chromium with three.js r128 (the game's version) and lists its
// nodes and materials.   node view.mjs <model.glb|.gltf> <out.png> [size]
// Views: side from +x (nose +z points right), from the front (+z, nose toward you), top (+y, nose up), three-quarter.
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
const { chromium } = createRequire(import.meta.url)('playwright'); // the container's preinstalled copy

const HERE = path.dirname(fileURLToPath(import.meta.url));
const [file, out, size = '900'] = process.argv.slice(2);
const dir = path.dirname(path.resolve(file)), name = path.basename(file);
const NM = path.join(HERE, 'node_modules');
const routes = {
  '/three.js': path.join(NM, 'three/build/three.min.js'),
  '/gltf.js': path.join(NM, 'three/examples/js/loaders/GLTFLoader.js'),
};
const page = `<!doctype html><body style="margin:0;background:#888"><script src="/three.js"></script><script src="/gltf.js"></script><script>
const S = ${+size}, R = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true }); R.setSize(S, S); document.body.appendChild(R.domElement);
R.setScissorTest(true);
const scene = new THREE.Scene(); scene.background = new THREE.Color(0xcde9f7);
scene.add(new THREE.HemisphereLight(0xe4f3ff, 0xa8946a, 0.62)); const sun = new THREE.DirectionalLight(0xfff4e0, 0.9); sun.position.set(0.42, 0.78, 0.46); scene.add(sun);
scene.add(new THREE.AxesHelper(1000));
const L = new THREE.GLTFLoader();
L.load('/m/${encodeURIComponent(name)}', g => {
  const m = g.scene; scene.add(m); m.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(m), c = box.getCenter(new THREE.Vector3()), d = box.getSize(new THREE.Vector3()).length();
  const info = { bounds: [box.min.toArray().map(v => +v.toFixed(3)), box.max.toArray().map(v => +v.toFixed(3))], nodes: [], mats: {}, tris: 0, draws: 0 };
  m.traverse(o => { if (o.isMesh) { info.draws++; const n = o.geometry.index ? o.geometry.index.count / 3 : o.geometry.attributes.position.count / 3; info.tris += n;
    const bb = new THREE.Box3().setFromObject(o); info.nodes.push(o.name + ' <' + (o.parent && o.parent.name) + '> ' + Math.round(n) + 't ' + bb.min.toArray().map(v => v.toFixed(2)) + '..' + bb.max.toArray().map(v => v.toFixed(2)));
    [].concat(o.material).forEach(mt => info.mats[mt.name || '?'] = (mt.map ? 'map ' : '') + (mt.normalMap ? 'nrm ' : '') + 'met' + mt.metalness + ' rgh' + mt.roughness + (mt.transparent ? ' transp' : '')); } });
  const cam = new THREE.PerspectiveCamera(30, 1, d / 100, d * 10), h = S / 2;
  const views = [[1, 0, 0, 0, 1, 0], [0, 0, 1, 0, 1, 0], [0, 1, 0, 0, 0, 1], [0.8, 0.45, 0.9, 0, 1, 0]];
  views.forEach(([x, y, z, ux, uy, uz], i) => { const dir = new THREE.Vector3(x, y, z).normalize();
    cam.position.copy(c).addScaledVector(dir, d * 1.9); cam.up.set(ux, uy, uz); cam.lookAt(c);
    const vx = (i % 2) * h, vy = (1 - (i >> 1)) * h; R.setViewport(vx, vy, h, h); R.setScissor(vx, vy, h, h); R.render(scene, cam); });
  window.INFO = info; }, undefined, e => { window.INFO = { error: String(e && e.message || e) }; });
</script>`;
const srv = http.createServer((q, r) => {
  const u = decodeURIComponent(q.url.split('?')[0]);
  let p = u === '/' ? null : routes[u] || (u.startsWith('/m/') ? path.join(dir, u.slice(3)) : null);
  if (u === '/') { r.writeHead(200, { 'content-type': 'text/html' }); return r.end(page); }
  if (!p || !p.startsWith(dir) && !Object.values(routes).includes(p) || !fs.existsSync(p)) { r.writeHead(404); return r.end(); }
  r.writeHead(200); fs.createReadStream(p).pipe(r);
}).listen(0);
const port = srv.address().port;
const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
const pg = await b.newPage({ viewport: { width: +size, height: +size } });
pg.on('pageerror', e => console.log('pageerror', e.message));
await pg.goto(`http://127.0.0.1:${port}/`);
await pg.waitForFunction(() => window.INFO, null, { timeout: 180000 });
const info = await pg.evaluate(() => window.INFO);
await pg.screenshot({ path: out });
console.log(JSON.stringify(info, null, 1).slice(0, 12000));
await b.close(); srv.close();
