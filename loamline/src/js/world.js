// Scene building: terrain, trail ribbon, scenery, props, sky and weather.

import * as THREE from 'three';
import { THEMES } from './courses.js';
import { mulberry32, makeNoise2D, smoothstep, clamp } from './noise.js';

export const WEATHERS = ['day', 'dusk', 'night', 'fog'];

const WEATHER = {
  day: { sunI: 3.0, hemiI: 1.25, exposure: 1.0, sunH: 0.85, sunAz: 0.6, lamp: false, stars: false, fogK: 1 },
  dusk: {
    sunI: 2.6, hemiI: 1.0, exposure: 1.08, sunH: 0.13, sunAz: 2.2, lamp: false, stars: false, fogK: 0.85,
    sky: { zenith: 0x2a3a6e, horizon: 0xf0a070, fog: 0xd99b80, sun: 0xffb070 },
  },
  night: {
    sunI: 0.45, hemiI: 0.55, exposure: 1.12, sunH: 0.6, sunAz: -1.0, lamp: true, stars: true, fogK: 0.6,
    sky: { zenith: 0x070b18, horizon: 0x1b2440, fog: 0x141a2c, sun: 0xa8c0ff },
  },
  fog: {
    sunI: 0.6, hemiI: 1.6, exposure: 1.1, sunH: 0.7, sunAz: 0.6, lamp: false, stars: false, fogK: 0.22,
    sky: { zenith: 0xc8ccd0, horizon: 0xc8ccd0, fog: 0xc6cacd, sun: 0xf2f2ea },
  },
};

// ---------------------------------------------------------------- textures

function noiseTexture(size, colA, colB, scale, seed, opts = {}) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(size, size);
  const n = makeNoise2D(seed);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      // Tileable by sampling a torus-ish wrap.
      const u = x / size, v = y / size;
      let t = 0, amp = 1, f = scale, norm = 0;
      for (let o = 0; o < 4; o++) {
        const a = n(Math.cos(u * 6.283) * f + 10, Math.sin(u * 6.283) * f + Math.cos(v * 6.283) * f * 0.7)
          + n(Math.sin(v * 6.283) * f + 3, Math.cos(v * 6.283) * f - Math.sin(u * 6.283) * f * 0.7);
        t += a * 0.5 * amp; norm += amp; amp *= 0.5; f *= 2;
      }
      t = t / norm * 0.5 + 0.5;
      if (opts.speckle) t += (Math.random() - 0.5) * opts.speckle;
      t = clamp(t, 0, 1);
      const i = (y * size + x) * 4;
      img.data[i] = colA[0] + (colB[0] - colA[0]) * t;
      img.data[i + 1] = colA[1] + (colB[1] - colA[1]) * t;
      img.data[i + 2] = colA[2] + (colB[2] - colA[2]) * t;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

function labelTexture(text, bg, fg, w = 512, h = 128, font = 'italic 800 84px "Barlow Condensed", system-ui, sans-serif') {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = fg; ctx.font = font; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(text, w / 2, h / 2 + 4);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function checkerTexture() {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 128;
  const ctx = c.getContext('2d');
  for (let y = 0; y < 2; y++) for (let x = 0; x < 16; x++) {
    ctx.fillStyle = (x + y) % 2 ? '#111' : '#f4f4f4';
    ctx.fillRect(x * 32, y * 32, 32, 32);
  }
  ctx.fillStyle = '#111'; ctx.fillRect(0, 64, 512, 64);
  ctx.fillStyle = '#fff'; ctx.font = 'italic 800 58px "Barlow Condensed", system-ui, sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('FINISH', 256, 98);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// -------------------------------------------------------------------- sky

function makeSky() {
  const geo = new THREE.SphereGeometry(4000, 32, 16);
  const m = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: {
      zenith: { value: new THREE.Color() }, horizon: { value: new THREE.Color() },
      below: { value: new THREE.Color() }, sunCol: { value: new THREE.Color() },
      sunDir: { value: new THREE.Vector3(0, 1, 0) }, stars: { value: 0 }, disc: { value: 1 },
    },
    vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); vec4 p = modelViewMatrix*vec4(position,1.0); gl_Position = projectionMatrix*p; gl_Position.z = gl_Position.w*0.9999; }`,
    fragmentShader: `
      uniform vec3 zenith, horizon, below, sunCol, sunDir; uniform float stars, disc;
      varying vec3 vDir;
      float hash(vec3 p){ p = fract(p*0.3183099+0.1); p *= 17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
      void main(){
        vec3 d = normalize(vDir);
        float h = d.y;
        vec3 col = h > 0.0 ? mix(horizon, zenith, pow(clamp(h,0.0,1.0), 0.55)) : mix(horizon, below, clamp(-h*6.0,0.0,1.0));
        float s = max(dot(d, normalize(sunDir)), 0.0);
        col += sunCol * (pow(s, 900.0) * 3.0 * disc + pow(s, 12.0) * 0.25 * disc);
        if (stars > 0.0 && h > 0.0) {
          vec3 q = floor(d * 420.0);
          float st = step(0.9975, hash(q));
          col += vec3(st) * stars * smoothstep(0.0, 0.3, h);
        }
        gl_FragColor = vec4(col, 1.0);
        #include <colorspace_fragment>
      }`,
  });
  const mesh = new THREE.Mesh(geo, m);
  mesh.frustumCulled = false;
  mesh.renderOrder = -1;
  return mesh;
}

// ------------------------------------------------------------------ world

export class World {
  constructor(renderer, scene, track, opts) {
    this.renderer = renderer;
    this.scene = scene;
    this.track = track;
    this.quality = opts.quality || 'high';
    this.theme = THEMES[track.course.theme] || THEMES.forest;
    this.rng = mulberry32(track.course.seed * 31 + 7);
    this.tiles = [];
    this.group = new THREE.Group();
    scene.add(this.group);
    this.disposables = [];

    this.buildLights();
    this.sky = makeSky();
    this.group.add(this.sky);
    this.buildTerrain();
    this.buildTrail();
    this.buildProps();
    this.buildScenery();
    this.dust = new Dust(this.group, this.theme);
    this.setWeather(opts.weather || 'day');
  }

  buildLights() {
    this.hemi = new THREE.HemisphereLight(0xffffff, 0x445533, 1.2);
    this.group.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xffffff, 3);
    this.sun.castShadow = this.quality !== 'low';
    const sz = this.quality === 'high' ? 2048 : 1024;
    this.sun.shadow.mapSize.set(sz, sz);
    const c = this.sun.shadow.camera;
    c.left = -32; c.right = 32; c.top = 32; c.bottom = -32; c.near = 1; c.far = 260;
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.04;
    this.group.add(this.sun, this.sun.target);
    this.lamp = new THREE.SpotLight(0xfff2dd, 0, 70, 0.55, 0.45, 1.2);
    this.lamp.castShadow = false;
    this.group.add(this.lamp, this.lamp.target);
  }

  setWeather(name) {
    if (name === 'random') name = WEATHERS[Math.floor(Math.random() * WEATHERS.length)];
    this.weather = name;
    const w = WEATHER[name] || WEATHER.day;
    const sk = Object.assign({}, this.theme.sky, w.sky || {});
    const u = this.sky.material.uniforms;
    u.zenith.value.set(sk.zenith); u.horizon.value.set(sk.horizon);
    u.below.value.set(sk.fog).multiplyScalar(0.8);
    u.sunCol.value.set(sk.sun);
    u.stars.value = w.stars ? 1 : 0;
    u.disc.value = name === 'fog' ? 0 : name === 'night' ? 0.35 : 1;
    const az = w.sunAz, el = w.sunH;
    this.sunDir = new THREE.Vector3(Math.cos(az) * Math.cos(el), Math.sin(el), Math.sin(az) * Math.cos(el)).normalize();
    u.sunDir.value.copy(this.sunDir);
    this.sun.intensity = w.sunI;
    this.sun.color.set(sk.sun);
    this.hemi.intensity = w.hemiI;
    this.hemi.color.set(name === 'night' ? 0x6d7fb0 : sk.horizon).lerp(new THREE.Color(0xffffff), 0.35);
    this.hemi.groundColor.setRGB(...this.theme.ground).multiplyScalar(name === 'night' ? 0.25 : 0.7);
    const [fn, ff] = this.theme.fog;
    this.scene.fog = new THREE.Fog(sk.fog, fn * w.fogK * (name === 'fog' ? 0.2 : 1), ff * w.fogK);
    this.scene.background = new THREE.Color(sk.fog);
    this.renderer.toneMappingExposure = w.exposure;
    this.lamp.intensity = w.lamp ? 90 : 0;
    this.lampOn = w.lamp;
  }

  // Shadow box and lamp follow the bike.
  follow(pos, yaw) {
    // Distance culling for the tiled scenery (frustum culling is per tile too).
    for (const t of this.tiles) {
      const dx = t.cx - pos.x, dz = t.cz - pos.z;
      t.mesh.visible = dx * dx + dz * dz < t.max2;
    }
    const d = this.sunDir;
    this.sun.position.set(pos.x + d.x * 120, pos.y + d.y * 120, pos.z + d.z * 120);
    this.sun.target.position.set(pos.x, pos.y, pos.z);
    this.sky.position.set(pos.x, 0, pos.z);
    if (this.lampOn) {
      const fx = Math.sin(yaw), fz = Math.cos(yaw);
      this.lamp.position.set(pos.x + fx * 0.5, pos.y + 1.3, pos.z + fz * 0.5);
      this.lamp.target.position.set(pos.x + fx * 14, pos.y - 1, pos.z + fz * 14);
    }
  }

  // ------------------------------------------------------------- terrain

  buildTerrain() {
    const tr = this.track, th = this.theme;
    const b = tr.bounds;
    const margin = 320;
    const step = this.quality === 'high' ? 4 : 5;
    const x0 = b.minX - margin, x1 = b.maxX + margin, z0 = b.minZ - margin, z1 = b.maxZ + margin;
    const nx = Math.ceil((x1 - x0) / step) + 1, nz = Math.ceil((z1 - z0) / step) + 1;
    const pos = new Float32Array(nx * nz * 3);
    const col = new Float32Array(nx * nz * 3);
    const uv = new Float32Array(nx * nz * 2);
    const n = makeNoise2D(tr.course.seed + 5);
    const p = {};
    const under = new Uint8Array(nx * nz);   // vertex hidden under the trail ribbon
    const g1 = th.ground, g2 = th.ground2, rk = th.rock;
    for (let j = 0; j < nz; j++) {
      for (let i = 0; i < nx; i++) {
        const x = x0 + i * step, z = z0 + j * step;
        tr.project(x, z, -1, p);
        let h = tr.heightFromProj(x, z, p);
        const ad = Math.abs(p.d);
        // Under the trail ribbon the coarse grid would poke through jump
        // faces: sink it below the base line (and into gaps).
        const tuck = 1 - smoothstep(tr.hw + 2.5, tr.hw + 4.5, ad);
        if (tuck > 0) h = h + (Math.min(h - 0.4, p.base + Math.min(0, p.feat) + p.bank * p.d - 0.5) - h) * tuck;
        const k = (j * nx + i) * 3;
        if (ad < tr.hw + 2.6 && p.s > 1 && p.s < tr.length - 1) under[j * nx + i] = 1;
        pos[k] = x; pos[k + 1] = h; pos[k + 2] = z;
        uv[(j * nx + i) * 2] = x / 6; uv[(j * nx + i) * 2 + 1] = z / 6;
        // Colour: patchy ground, rock on steep/high bits, snow caps.
        const t = smoothstep(-0.4, 0.6, n(x * 0.02, z * 0.02));
        let r = g1[0] + (g2[0] - g1[0]) * t, g = g1[1] + (g2[1] - g1[1]) * t, bl = g1[2] + (g2[2] - g1[2]) * t;
        const rel = h - p.base;
        const rockT = smoothstep(18, 60, rel) * 0.8 + smoothstep(0.3, 0.9, n(x * 0.05 + 7, z * 0.05)) * 0.25 * th.rocks;
        r += (rk[0] - r) * rockT; g += (rk[1] - g) * rockT; bl += (rk[2] - bl) * rockT;
        if (th.snowCaps) {
          const sn = smoothstep(55, 85, rel + n(x * 0.03, z * 0.03) * 12);
          r += (0.93 - r) * sn; g += (0.95 - g) * sn; bl += (0.98 - bl) * sn;
        }
        const v = 0.92 + n(x * 0.3, z * 0.3) * 0.08;
        col[k] = r * v; col[k + 1] = g * v; col[k + 2] = bl * v;
      }
    }
    // Triangles entirely under the ribbon are never seen: don't draw them.
    const idxA = new Uint32Array((nx - 1) * (nz - 1) * 6);
    let q = 0;
    for (let j = 0; j < nz - 1; j++) for (let i = 0; i < nx - 1; i++) {
      const a = j * nx + i, b2 = a + 1, c = a + nx, d = c + 1;
      if (!(under[a] && under[c] && under[b2])) { idxA[q++] = a; idxA[q++] = c; idxA[q++] = b2; }
      if (!(under[b2] && under[c] && under[d])) { idxA[q++] = b2; idxA[q++] = c; idxA[q++] = d; }
    }
    const idx = idxA.subarray(0, q);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    geo.setIndex(new THREE.BufferAttribute(idx, 1));
    geo.computeVertexNormals();
    const detail = noiseTexture(256, [200, 200, 200], [255, 255, 255], 2.5, tr.course.seed, { speckle: 0.25 });
    const m = new THREE.MeshStandardMaterial({ vertexColors: true, map: detail, roughness: 0.95, metalness: 0 });
    const mesh = new THREE.Mesh(geo, m);
    mesh.receiveShadow = true;
    this.group.add(mesh);
    this.terrain = mesh;
  }

  buildTrail() {
    const tr = this.track, th = this.theme;
    const hw = tr.hw;
    const ds = [-hw - 3.6, -hw - 2.4, -hw - 1.4, -hw - 0.6, -hw, -hw * 0.7, -hw * 0.4, -hw * 0.15, 0, hw * 0.15, hw * 0.4, hw * 0.7, hw, hw + 0.6, hw + 1.4, hw + 2.4, hw + 3.6];
    const rows = [];
    for (let i = 0; i < tr.N; i++) {
      const fine = tr.kind[i] === 1 || tr.kind[i] === 2;
      if (fine || i % 4 === 0 || i === tr.N - 1) rows.push(i);
    }
    const nc = ds.length;
    const pos = new Float32Array(rows.length * nc * 3);
    const col = new Float32Array(rows.length * nc * 3);
    const uv = new Float32Array(rows.length * nc * 2);
    const n = makeNoise2D(tr.course.seed + 9);
    const p = {};
    const d1 = th.dirt, d2 = th.dirt2, g1 = th.ground;
    rows.forEach((i, r) => {
      const yaw = tr.yaw[i];
      const rx = -Math.cos(yaw), rz = Math.sin(yaw);
      for (let c = 0; c < nc; c++) {
        const d = ds[c];
        const x = tr.cx[i] + rx * d, z = tr.cz[i] + rz * d;
        tr.project(x, z, i, p);
        const h = tr.heightFromProj(x, z, p);
        const k = (r * nc + c) * 3;
        pos[k] = x; pos[k + 1] = h + 0.02; pos[k + 2] = z;
        uv[(r * nc + c) * 2] = d / 3; uv[(r * nc + c) * 2 + 1] = i * 0.25 / 3;
        const ad = Math.abs(d);
        const e = smoothstep(hw - 0.4, hw + 2.6, ad);               // edge → ground
        const line = Math.exp(-((d - 0.35) ** 2) * 3) * 0.6;          // ridden line
        const nz = n(x * 0.4, z * 0.4) * 0.5 + 0.5;
        let cr = d1[0] + (d2[0] - d1[0]) * (nz * 0.7 + line);
        let cg = d1[1] + (d2[1] - d1[1]) * (nz * 0.7 + line);
        let cb = d1[2] + (d2[2] - d1[2]) * (nz * 0.7 + line);
        // Packed jump faces read a touch darker and smoother.
        const f = tr.feat[i];
        if (f > 0.3) { cr *= 0.93; cg *= 0.93; cb *= 0.93; }
        if (f < -0.3) { cr *= 0.75; cg *= 0.75; cb *= 0.78; }
        cr += (g1[0] - cr) * e; cg += (g1[1] - cg) * e; cb += (g1[2] - cb) * e;
        col[k] = cr; col[k + 1] = cg; col[k + 2] = cb;
      }
    });
    const idx = [];
    for (let r = 0; r < rows.length - 1; r++) for (let c = 0; c < nc - 1; c++) {
      const a = r * nc + c, b = a + 1, cc = a + nc, d = cc + 1;
      idx.push(a, b, cc, b, d, cc);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    const tex = noiseTexture(256, [175, 170, 165], [255, 250, 245], 4, tr.course.seed + 3, { speckle: 0.35 });
    const m = new THREE.MeshStandardMaterial({ vertexColors: true, map: tex, roughness: 0.92 });
    const mesh = new THREE.Mesh(geo, m);
    mesh.receiveShadow = true;
    this.group.add(mesh);
    this.trail = mesh;
  }

  // Ground height exactly as the terrain mesh computes it.
  groundAt(x, z) {
    const p = this.track.project(x, z, -1, this._gp || (this._gp = {}));
    return this.track.heightFromProj(x, z, p);
  }

  // --------------------------------------------------------------- props

  placeOnTrail(obj, s, d, yawOff = 0) {
    const tr = this.track;
    const pt = tr.pointAt(s, d);
    obj.position.set(pt.x, tr.height(pt.x, pt.z, pt.i), pt.z);
    obj.rotation.y = pt.yaw + yawOff;
    return obj;
  }

  buildProps() {
    const tr = this.track;
    const wood = new THREE.MeshStandardMaterial({ color: 0x8a6a48, roughness: 0.85 });
    const woodDark = new THREE.MeshStandardMaterial({ color: 0x5e4630, roughness: 0.9 });
    const steel = new THREE.MeshStandardMaterial({ color: 0x3a3d42, roughness: 0.5, metalness: 0.6 });
    const accent = new THREE.MeshStandardMaterial({ color: 0xc8f03c, roughness: 0.6 });

    // Start: a timber roll-in deck behind the start line.
    const start = new THREE.Group();
    const deckH = 1.6;
    const deck = new THREE.Mesh(new THREE.BoxGeometry(tr.hw * 2 + 1, 0.2, 5), wood);
    deck.position.set(0, deckH, -6.5); deck.castShadow = deck.receiveShadow = true;
    start.add(deck);
    const ramp = new THREE.Mesh(new THREE.BoxGeometry(tr.hw * 2 + 1, 0.12, 5.2), wood);
    ramp.position.set(0, deckH / 2 - 0.05, -2.0); ramp.rotation.x = Math.atan2(deckH, 4.8);
    ramp.castShadow = ramp.receiveShadow = true;
    start.add(ramp);
    for (const sx of [-1, 1]) for (const sz of [-8.8, -4.2]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.2, deckH + 4, 0.2), woodDark);
      post.position.set(sx * (tr.hw + 0.4), (deckH + 4) / 2 - 1, sz); post.castShadow = true;
      start.add(post);
    }
    const roof = new THREE.Mesh(new THREE.BoxGeometry(tr.hw * 2 + 1.6, 0.15, 5.6), woodDark);
    roof.position.set(0, deckH + 3, -6.5); roof.castShadow = true;
    start.add(roof);
    const banner = new THREE.Mesh(new THREE.PlaneGeometry(tr.hw * 2, 0.9),
      new THREE.MeshBasicMaterial({ map: labelTexture(tr.course.name.toUpperCase(), '#14161b', '#c8f03c', 1024, 128), side: THREE.DoubleSide }));
    banner.position.set(0, deckH + 2.5, -3.75);
    start.add(banner);
    // Behind the spawn point, so the chase camera clears it.
    const back = tr.pointAt(0, 0);
    start.position.set(back.x - Math.sin(back.yaw) * 4, tr.height(back.x, back.z, 0) - 0.05, back.z - Math.cos(back.yaw) * 4);
    start.rotation.y = back.yaw;
    this.group.add(start);
    this.startDeckH = deckH;

    // Arches at start and finish.
    const arch = (s, label, tex) => {
      const g = new THREE.Group();
      const w = tr.hw * 2 + 2.4;
      for (const sx of [-1, 1]) {
        const leg = new THREE.Mesh(new THREE.BoxGeometry(0.35, 4.2, 0.35), steel);
        leg.position.set(sx * w / 2, 2.1, 0); leg.castShadow = true;
        g.add(leg);
      }
      const top = new THREE.Mesh(new THREE.BoxGeometry(w + 0.35, 0.9, 0.3), steel);
      top.position.y = 4.1; top.castShadow = true;
      g.add(top);
      const face = new THREE.Mesh(new THREE.PlaneGeometry(w, 0.8), new THREE.MeshBasicMaterial({ map: tex || labelTexture(label, '#14161b', '#ffffff'), side: THREE.DoubleSide }));
      face.position.set(0, 4.1, -0.16); face.rotation.y = Math.PI;
      g.add(face);
      const face2 = face.clone(); face2.position.z = 0.16; face2.rotation.y = 0;
      g.add(face2);
      this.placeOnTrail(g, s, 0);
      this.group.add(g);
      return g;
    };
    if (tr.course.timed) arch(tr.startS, 'START');
    arch(tr.finishS, 'FINISH', checkerTexture());

    // Checkpoint flags.
    const flagMat = new THREE.MeshStandardMaterial({ color: 0xc8f03c, side: THREE.DoubleSide, roughness: 0.7 });
    const poleMat = new THREE.MeshStandardMaterial({ color: 0xe8e8e8, roughness: 0.5 });
    if (tr.course.timed) {
      for (const s of tr.checkpoints) {
        for (const sx of [-1, 1]) {
          const g = new THREE.Group();
          const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 2.6, 6), poleMat);
          pole.position.y = 1.3; g.add(pole);
          const flag = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.55), flagMat);
          flag.position.set(-sx * 0.45, 2.25, 0); g.add(flag);
          this.placeOnTrail(g, s, sx * (tr.hw + 0.9), Math.PI / 2);
          this.group.add(g);
        }
      }
    }

    // Course tape: posts and tape along both edges (gaps at jumps' sides are fine).
    const posts = [];
    const tapePts = [];
    const stepS = 5;
    let prev = [null, null];
    for (let s = 3; s < tr.finishS + 20; s += stepS) {
      for (let k = 0; k < 2; k++) {
        const sd = k ? 1 : -1;
        const pt = tr.pointAt(s, sd * (tr.hw + 1.6));
        const y = tr.height(pt.x, pt.z, pt.i);
        posts.push([pt.x, y, pt.z]);
        const cur = [pt.x, y + 0.75, pt.z];
        if (prev[k]) tapePts.push(...prev[k], ...cur);
        prev[k] = cur;
      }
    }
    const postGeo = new THREE.CylinderGeometry(0.025, 0.03, 1.0, 5);
    postGeo.translate(0, 0.5, 0);
    const postMesh = new THREE.InstancedMesh(postGeo, new THREE.MeshStandardMaterial({ color: 0xd8d2c4, roughness: 0.8 }), posts.length);
    const m4 = new THREE.Matrix4();
    posts.forEach((p, i) => { m4.makeTranslation(p[0], p[1], p[2]); postMesh.setMatrixAt(i, m4); });
    this.group.add(postMesh);
    const tg = new THREE.BufferGeometry();
    tg.setAttribute('position', new THREE.Float32BufferAttribute(tapePts, 3));
    this.group.add(new THREE.LineSegments(tg, new THREE.LineBasicMaterial({ color: 0xff6a2a })));

    // Jumps: timber drop decks, wooden lips on gaps, signs with names.
    let jn = 0;
    for (const j of tr.jumps()) {
      jn++;
      const sign = new THREE.Group();
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.4, 0.08), woodDark);
      post.position.y = 0.7; sign.add(post);
      const label = j.name ? j.name.toUpperCase() : `${j.kind.toUpperCase()} ${jn}`;
      const board = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.38),
        new THREE.MeshBasicMaterial({ map: labelTexture(label, '#f0e6d2', '#2a2116', 512, 128, 'italic 800 64px "Barlow Condensed", system-ui, sans-serif'), side: THREE.DoubleSide }));
      board.position.y = 1.45; board.rotation.y = Math.PI;
      sign.add(board);
      this.placeOnTrail(sign, j.s0 + 1, -(tr.hw + 2.4));
      this.group.add(sign);

      if (j.kind === 'drop') {
        // Timber face under the drop edge.
        const pt = tr.pointAt(j.lipS, 0);
        const yTop = tr.height(pt.x, pt.z, pt.i);
        const ptB = tr.pointAt(j.lipS + 0.6, 0);
        const yBot = tr.height(ptB.x, ptB.z, ptB.i);
        const hgt = Math.max(0.5, yTop - yBot + 0.6);
        const face = new THREE.Mesh(new THREE.BoxGeometry(tr.hw * 2 + 0.4, hgt, 0.2), wood);
        face.position.set(pt.x, yTop - hgt / 2 + 0.05, pt.z);
        face.rotation.y = pt.yaw;
        face.castShadow = face.receiveShadow = true;
        this.group.add(face);
        // Timber deck: planks across the whole platform (it knocks underfoot).
        const deckLen = j.lipS - j.deckS;
        const plankGeo = new THREE.BoxGeometry(tr.hw * 2 + 0.4, 0.05, 0.26);
        const n = Math.floor(deckLen / 0.3);
        const planks = new THREE.InstancedMesh(plankGeo, wood, n);
        const m = new THREE.Matrix4(), qq = new THREE.Quaternion(), e = new THREE.Euler();
        for (let k = 0; k < n; k++) {
          const sp = j.lipS - 0.15 - k * 0.3;
          const pt2 = tr.pointAt(sp, 0);
          e.set(0, pt2.yaw, (k % 3 - 1) * 0.004);
          m.compose(new THREE.Vector3(pt2.x, tr.height(pt2.x, pt2.z, pt2.i) + 0.02, pt2.z), qq.setFromEuler(e), new THREE.Vector3(1, 1, 1));
          planks.setMatrixAt(k, m);
          if (k % 2) planks.setColorAt(k, new THREE.Color(0xb08a62)); else planks.setColorAt(k, new THREE.Color(0xc79f74));
        }
        planks.receiveShadow = true;
        this.group.add(planks);
      }
      if (j.gap && j.pit > 1.5) {
        // Rocks in the bottom of big gaps.
        for (let k = 0; k < 6; k++) {
          const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(0.5 + this.rng() * 0.6, 0),
            new THREE.MeshStandardMaterial({ color: new THREE.Color().setRGB(...this.theme.rock), roughness: 0.9, flatShading: true }));
          const s = j.lipS + 1 + this.rng() * Math.max(0.5, j.knuckleS - j.lipS - 2);
          this.placeOnTrail(rock, s, (this.rng() - 0.5) * tr.hw * 1.6);
          rock.castShadow = true;
          this.group.add(rock);
        }
      }
    }

    // A handful of accent hay bales at berms.
    const baleGeo = new THREE.CylinderGeometry(0.55, 0.55, 1.1, 12);
    baleGeo.rotateZ(Math.PI / 2);
    const baleMat = new THREE.MeshStandardMaterial({ color: 0xd8b860, roughness: 1 });
    for (const f of tr.features) {
      if (f.type !== 'berm') continue;
      const mid = (f.s0 + f.s1) / 2;
      const sd = f.angle > 0 ? 1 : -1;
      for (let k = -1; k <= 1; k++) {
        const b = new THREE.Mesh(baleGeo, baleMat);
        this.placeOnTrail(b, mid + k * 3, sd * (tr.hw + 3.2));
        b.position.y += 0.55;
        b.castShadow = true;
        this.group.add(b);
      }
    }
    void accent;
  }

  // ------------------------------------------------------------ scenery

  buildScenery() {
    const tr = this.track, th = this.theme;
    const q = this.quality;
    const rng = this.rng;
    const b = tr.bounds;
    const area = 260;
    const target = Math.round((q === 'high' ? 2600 : q === 'medium' ? 1600 : 900) * th.treeDensity);
    const n = makeNoise2D(tr.course.seed + 21);
    const spots = [];
    const p = {};
    let tries = 0;
    while (spots.length < target && tries < target * 12) {
      tries++;
      const x = b.minX - area + rng() * (b.maxX - b.minX + area * 2);
      const z = b.minZ - area + rng() * (b.maxZ - b.minZ + area * 2);
      if (n(x * 0.012, z * 0.012) < -0.15 + (1 - th.treeDensity) * 0.3) continue; // groves and clearings
      tr.project(x, z, -1, p);
      const ad = Math.abs(p.d);
      if (ad < tr.hw + 5) continue;
      if (p.s < -10 || p.s > tr.length + 10) { /* past the ends is fine */ }
      // Thinner close to the trail so the line stays readable.
      if (ad < tr.hw + 12 && rng() < 0.5) continue;
      const y = tr.heightFromProj(x, z, p);
      if (th.snowCaps && y - p.base > 60) continue;
      spots.push([x, y, z, 0.7 + rng() * 0.7, rng() * Math.PI * 2]);
    }
    const blobs = new Tiles(this, 120);
    this.blobs = blobs;
    this.addTrees(spots, th.trees);

    const m4 = new THREE.Matrix4(), qt = new THREE.Quaternion(), sc = new THREE.Vector3(), ps = new THREE.Vector3();
    const eu = new THREE.Euler();
    // Rocks.
    const rockN = Math.round((q === 'high' ? 700 : 400) * th.rocks);
    const rockMat = new THREE.MeshStandardMaterial({ color: new THREE.Color().setRGB(...th.rock), roughness: 0.95, flatShading: true });
    const rocks = new Tiles(this, 120);
    for (let k = 0; k < rockN; k++) {
      const s = rng() * tr.length;
      const sd = rng() < 0.5 ? -1 : 1;
      const d = sd * (tr.hw + 2.5 + Math.pow(rng(), 1.6) * 120);
      const pt = tr.pointAt(s, d);
      const y = Math.abs(d) > 12 ? this.groundAt(pt.x, pt.z) : tr.height(pt.x, pt.z, pt.i);
      const size = 0.25 + Math.pow(rng(), 3) * (th.trees === 'juniper' ? 4 : 2.2);
      eu.set(rng() * 3, rng() * 3, rng() * 3);
      qt.setFromEuler(eu);
      sc.set(size * (0.8 + rng() * 0.6), size * (0.5 + rng() * 0.5), size * (0.8 + rng() * 0.6));
      ps.set(pt.x, y + size * 0.2, pt.z);
      rocks.add(m4.compose(ps, qt, sc));
      if (size > 0.7) blobs.addBlob(pt.x, y, pt.z, size * 1.6);
    }
    rocks.build(new THREE.DodecahedronGeometry(1, 0), rockMat, { maxDist: 600, cast: q === 'high' });

    // Desert: tall sandstone towers in the distance.
    if (th.trees === 'juniper') {
      const towers = new Tiles(this, 400);
      for (let k = 0; k < 60; k++) {
        const s = rng() * tr.length;
        const d = (rng() < 0.5 ? -1 : 1) * (90 + rng() * 260);
        const pt = tr.pointAt(s, d);
        const y = this.groundAt(pt.x, pt.z);
        const hgt = 20 + rng() * 60, r = 6 + rng() * 18;
        towers.add(m4.compose(ps.set(pt.x, y + hgt / 2 - 2, pt.z), qt.identity(), sc.set(r, hgt, r * (0.7 + rng() * 0.6))));
      }
      towers.build(new THREE.CylinderGeometry(1, 1.25, 1, 7, 1), rockMat, { maxDist: 3000, cast: false });
    }

    // Grass tufts near the trail (and scattered); only drawn close up.
    if (q !== 'low' && th.grass > 0.1) {
      const gN = Math.round((q === 'high' ? 7000 : 3000) * th.grass);
      const gGeo = new THREE.ConeGeometry(0.12, 0.45, 4, 1);
      gGeo.translate(0, 0.2, 0);
      const gMat = new THREE.MeshStandardMaterial({ color: new THREE.Color().setRGB(th.ground[0] * 0.9, th.ground[1] * 1.15, th.ground[2] * 0.8), roughness: 1 });
      const grass = new Tiles(this, 60);
      for (let k = 0; k < gN; k++) {
        const s = rng() * tr.length;
        const sd = rng() < 0.5 ? -1 : 1;
        const d = sd * (tr.hw + 0.8 + Math.pow(rng(), 2) * 30);
        const pt = tr.pointAt(s, d);
        const y = Math.abs(d) > 12 ? this.groundAt(pt.x, pt.z) : tr.height(pt.x, pt.z, pt.i);
        const sz = 0.6 + rng() * 1.2;
        eu.set((rng() - 0.5) * 0.4, rng() * 6, (rng() - 0.5) * 0.4);
        grass.add(m4.compose(ps.set(pt.x, y - 0.03, pt.z), qt.setFromEuler(eu), sc.set(sz, sz * (0.7 + rng()), sz)));
      }
      grass.build(gGeo, gMat, { maxDist: q === 'high' ? 160 : 110, cast: false, receive: true });
    }
    blobs.buildBlobs(q === 'high' ? 700 : 450);
  }

  addTrees(spots, kind) {
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
    const up = new THREE.Vector3(0, 1, 0);
    const trunkMat = new THREE.MeshStandardMaterial({ color: kind === 'birch' ? 0xd8d4cc : 0x5a4030, roughness: 0.9 });
    const leafCol = { pine: 0x2d4a2a, larch: 0xd0a040, birch: 0x8aa94a, juniper: 0x4b5a35, mixed: 0x3d6030 }[kind] || 0x2d4a2a;
    const leafCol2 = kind === 'larch' ? 0x3a5a30 : 0x587a3a;
    const two = kind === 'mixed' || kind === 'larch';
    const leafMat = new THREE.MeshStandardMaterial({ color: two ? 0xffffff : leafCol, roughness: 0.9, flatShading: true });
    const conic = kind === 'pine' || kind === 'larch' || kind === 'mixed';
    const trunkGeo = new THREE.CylinderGeometry(0.12, 0.22, 1, 6);
    trunkGeo.translate(0, 0.5, 0);
    const parts = [];
    if (conic) {
      for (const [r, h, y] of [[2.2, 4.2, 2.8], [1.7, 3.6, 4.8], [1.1, 3.0, 6.7]]) {
        const g = new THREE.ConeGeometry(r, h, 7, 1);
        g.translate(0, y, 0);
        parts.push(g);
      }
    } else if (kind === 'juniper') {
      const g = new THREE.IcosahedronGeometry(1.4, 0); g.scale(1, 0.8, 1); g.translate(0, 1.6, 0); parts.push(g);
      const g2 = new THREE.IcosahedronGeometry(1.0, 0); g2.translate(0.7, 2.3, 0.3); parts.push(g2);
    } else {
      const g = new THREE.IcosahedronGeometry(2.0, 0); g.scale(1, 1.3, 1); g.translate(0, 5.2, 0); parts.push(g);
      const g2 = new THREE.IcosahedronGeometry(1.4, 0); g2.translate(0.6, 6.6, -0.3); parts.push(g2);
    }
    const trunks = new Tiles(this, 150), crowns = new Tiles(this, 150);
    const c1 = new THREE.Color(leafCol), c2 = new THREE.Color(leafCol2);
    spots.forEach((sp, i) => {
      const [x, y, z, sc, rot] = sp;
      q.setFromAxisAngle(up, rot);
      const th = kind === 'juniper' ? 2.2 : conic ? 8.5 : 7;
      trunks.add(m4.compose(p.set(x, y - 0.2, z), q, s.set(sc, sc * th, sc)));
      crowns.add(m4.compose(p.set(x, y - 0.2, z), q, s.set(sc, sc * (0.9 + (i % 7) * 0.04), sc)), two ? (i % 3 === 0 ? c2 : c1) : null);
      this.blobs.addBlob(x, y, z, sc * (kind === 'juniper' ? 2.2 : 3));
    });
    const cast = this.quality !== 'low';
    trunks.build(trunkGeo, trunkMat, { maxDist: 900, cast });
    crowns.build(mergeGeos(parts), leafMat, { maxDist: 1400, cast, receive: true });
  }

  dispose() {
    this.scene.remove(this.group);
    this.group.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) {
        const ms = Array.isArray(o.material) ? o.material : [o.material];
        for (const m of ms) { if (m.map) m.map.dispose(); m.dispose(); }
      }
    });
    this.scene.fog = null;
  }
}

// Instanced scenery split into square tiles, so each tile can be frustum-
// and distance-culled on its own.
let blobTex = null;
class Tiles {
  constructor(world, size) { this.world = world; this.size = size; this.cells = new Map(); this.blobsList = []; }
  key(x, z) { return `${Math.floor(x / this.size)},${Math.floor(z / this.size)}`; }
  add(m, color = null) {
    const x = m.elements[12], z = m.elements[14];
    const k = this.key(x, z);
    let c = this.cells.get(k);
    if (!c) { c = { ms: [], cols: [], cx: 0, cz: 0, n: 0 }; this.cells.set(k, c); }
    c.ms.push(m.clone()); c.cols.push(color);
    c.cx += x; c.cz += z; c.n++;
  }
  build(geo, mat, { maxDist = 800, cast = false, receive = false } = {}) {
    for (const c of this.cells.values()) {
      const mesh = new THREE.InstancedMesh(geo, mat, c.ms.length);
      c.ms.forEach((m, i) => { mesh.setMatrixAt(i, m); if (c.cols[i]) mesh.setColorAt(i, c.cols[i]); });
      mesh.computeBoundingSphere();
      mesh.castShadow = cast; mesh.receiveShadow = receive;
      this.world.group.add(mesh);
      this.world.tiles.push({ mesh, cx: c.cx / c.n, cz: c.cz / c.n, max2: maxDist * maxDist });
    }
  }
  // Soft dark discs on the ground: cheap shadows that work at any distance.
  addBlob(x, y, z, r) { this.blobsList.push([x, y, z, r]); }
  buildBlobs(maxDist) {
    if (!blobTex) {
      const cv = document.createElement('canvas');
      cv.width = cv.height = 64;
      const g = cv.getContext('2d');
      const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
      gr.addColorStop(0, 'rgba(0,0,0,0.55)'); gr.addColorStop(0.6, 'rgba(0,0,0,0.25)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
      blobTex = new THREE.CanvasTexture(cv);
    }
    const geo = new THREE.PlaneGeometry(1, 1);
    geo.rotateX(-Math.PI / 2);
    const mat = new THREE.MeshBasicMaterial({ map: blobTex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
    for (const [x, y, z, r] of this.blobsList) this.add(m.compose(p.set(x, y + 0.06, z), q, s.set(r, 1, r)));
    this.build(geo, mat, { maxDist });
    for (const t of this.world.tiles) if (t.mesh.material === mat) t.mesh.renderOrder = 1;
  }
}

function mergeGeos(geos) {
  let total = 0, totalIdx = 0;
  const nonIdx = geos.map((g) => (g.index ? g.toNonIndexed() : g));
  for (const g of nonIdx) total += g.attributes.position.count;
  const pos = new Float32Array(total * 3), nor = new Float32Array(total * 3);
  let o = 0;
  for (const g of nonIdx) {
    g.computeVertexNormals();
    pos.set(g.attributes.position.array, o * 3);
    nor.set(g.attributes.normal.array, o * 3);
    o += g.attributes.position.count;
  }
  void totalIdx;
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  return out;
}

// Dust kicked up by the tyres.
class Dust {
  constructor(parent, theme) {
    this.max = 260;
    this.pos = new Float32Array(this.max * 3);
    this.vel = new Float32Array(this.max * 3);
    this.life = new Float32Array(this.max);
    this.geo = new THREE.BufferGeometry();
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    const c = theme.dirt;
    // Soft round puff.
    const cv = document.createElement('canvas');
    cv.width = cv.height = 64;
    const cx = cv.getContext('2d');
    const gr = cx.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,255,255,0.9)'); gr.addColorStop(0.5, 'rgba(255,255,255,0.35)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    cx.fillStyle = gr; cx.fillRect(0, 0, 64, 64);
    this.mat = new THREE.PointsMaterial({
      color: new THREE.Color(c[0] * 1.4, c[1] * 1.4, c[2] * 1.4), size: 0.7, map: new THREE.CanvasTexture(cv),
      transparent: true, opacity: 0.5, depthWrite: false, alphaTest: 0.01,
    });
    this.points = new THREE.Points(this.geo, this.mat);
    this.points.frustumCulled = false;
    parent.add(this.points);
    this.next = 0;
    for (let i = 0; i < this.max; i++) this.pos[i * 3 + 1] = -1e5;
  }
  emit(x, y, z, vx, vy, vz, n = 1) {
    for (let k = 0; k < n; k++) {
      const i = this.next; this.next = (this.next + 1) % this.max;
      this.pos[i * 3] = x + (Math.random() - 0.5) * 0.3;
      this.pos[i * 3 + 1] = y + Math.random() * 0.1;
      this.pos[i * 3 + 2] = z + (Math.random() - 0.5) * 0.3;
      this.vel[i * 3] = vx + (Math.random() - 0.5) * 1.2;
      this.vel[i * 3 + 1] = vy + Math.random() * 1.2;
      this.vel[i * 3 + 2] = vz + (Math.random() - 0.5) * 1.2;
      this.life[i] = 0.9 + Math.random() * 0.6;
    }
  }
  update(dt) {
    for (let i = 0; i < this.max; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt;
      if (this.life[i] <= 0) { this.pos[i * 3 + 1] = -1e5; continue; }
      this.vel[i * 3 + 1] += 0.4 * dt;
      const damp = Math.max(0, 1 - dt * 1.8);
      this.vel[i * 3] *= damp; this.vel[i * 3 + 2] *= damp; this.vel[i * 3 + 1] *= damp;
      this.pos[i * 3] += this.vel[i * 3] * dt;
      this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
      this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
    }
    this.geo.attributes.position.needsUpdate = true;
  }
}
