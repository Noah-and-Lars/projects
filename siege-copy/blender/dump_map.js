// Export a Siege map for the Blender light bake.
// node dump_map.js <page> <out-dir> <map,...>
// Writes <out-dir>/<map>.json (meshes, lights, albedos) and <map>.bin (float32 / uint32 blocks it points into).
const { chromium } = require('playwright');
const fs = require('fs');
const [, , page = 'siege-copy/index.html', out = 'bake', mapsArg = 'hotel,port,manor'] = process.argv;
(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const p = await (await browser.newContext({ viewport: { width: 640, height: 360 } })).newPage();
  p.on('pageerror', e => console.log('PAGEERROR', e.message));
  await p.addInitScript(() => { try { localStorage.setItem('siege.profile', JSON.stringify({ name: 'Test' })); localStorage.setItem('siege.settings', JSON.stringify({ seenNotes: '1.0.1', quality: 'high' })); } catch (e) {} });
  await p.goto('http://127.0.0.1:8123/' + page, { waitUntil: 'load' });
  await p.waitForFunction(() => window.__sg && window.__sg.W && window.__sgAssets && window.__sgAssets.done, null, { timeout: 180000 });
  fs.mkdirSync(out, { recursive: true });
  for (const key of mapsArg.split(',')) {
    const res = await p.evaluate(k => {
      const S = window.__sg, X = window.__sgAssets; S.G.on = false;
      X.noBake = true; // the game's own light, for calibration
      S.sgScene.remove(S.W.group); S.sgBuildMap(k);
      X.noBake = false;
      const M = S.W, blocks = [], meshes = [];
      let off = 0;
      const push = (arr) => { const b = new Uint8Array(arr.buffer.slice(arr.byteOffset, arr.byteOffset + arr.byteLength)); blocks.push(b); const o = off; off += b.length; return [o, arr.length]; };
      const cv = document.createElement('canvas'); cv.width = cv.height = 16; const cx = cv.getContext('2d');
      const avg = (mat) => {
        let r = 1, g = 1, b = 1;
        if (mat.map && mat.map.image) { try { cx.drawImage(mat.map.image, 0, 0, 16, 16); const d = cx.getImageData(0, 0, 16, 16).data; r = g = b = 0; for (let i = 0; i < d.length; i += 4) { r += d[i]; g += d[i + 1]; b += d[i + 2]; } r /= 256 * 255; g /= 256 * 255; b /= 256 * 255; } catch (e) {} }
        return [r * mat.color.r, g * mat.color.g, b * mat.color.b];
      };
      const boxes = [], boxAlb = [];
      M.group.children.forEach(o => {
        if (o.isInstancedMesh) {
          const m4 = new THREE.Matrix4(), al = avg(o.material);
          for (let i = 0; i < o.count; i++) {
            o.getMatrixAt(i, m4); const e = m4.elements;
            const sx = Math.hypot(e[0], e[1], e[2]), sy = Math.hypot(e[4], e[5], e[6]), sz = Math.hypot(e[8], e[9], e[10]);
            if (sx * sy * sz < 1e-9) continue;
            boxes.push(e[12] - sx / 2, e[13] - sy / 2, e[14] - sz / 2, e[12] + sx / 2, e[13] + sy / 2, e[14] + sz / 2); boxAlb.push(...al);
          }
          return;
        }
        const k = o.userData && o.userData.sgx; if (!k || !o.isMesh) return;
        const g = o.geometry;
        meshes.push({ k, alb: avg(o.material), pos: push(g.attributes.position.array), nor: push(g.attributes.normal.array), col: push(g.attributes.color.array), idx: g.index ? push(g.index.array) : null });
      });
      const probes = push(new Float32Array(M.probes));
      const bx = push(new Float32Array(boxes)), ba = push(new Float32Array(boxAlb));
      const all = new Uint8Array(off); let o2 = 0; for (const b of blocks) { all.set(b, o2); o2 += b.length; }
      let bin = ''; for (let i = 0; i < all.length; i += 0x8000) bin += String.fromCharCode.apply(null, all.subarray(i, i + 0x8000));
      return { json: { key: k, amb: M.D.amb, meshes, probes, probeTotal: M.probeTotal, boxes: bx, boxAlb: ba, lights: M.lights.map(L => ({ x: L.x, y: L.y, z: L.z, r: L.r, g: L.g, b: L.b, R: L.R, style: L.style, f: L.f, dim: L.dim })) }, b64: btoa(bin) };
    }, key);
    fs.writeFileSync(`${out}/${key}.json`, JSON.stringify(res.json));
    fs.writeFileSync(`${out}/${key}.bin`, Buffer.from(res.b64, 'base64'));
    console.log(key, 'meshes', res.json.meshes.length, 'boxes', res.json.boxes[1] / 6, 'probes', res.json.probes[1] / 6, 'lights', res.json.lights.length);
  }
  await browser.close();
})();
