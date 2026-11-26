/* Island Front: detailed main battle tanks (M1A2 Abrams and T-90A).
   Sloped armour built as lofted polygons, real turret shapes, skirts and reactive armour, hatches, sights, weapon stations,
   stowage, smoke launchers and gun details. Same dimensions, pivots and muzzle points as the armour model in vehicles.js.
   'C' as a colour means the team's camouflage paint. Loaded before vehicles.js (which merges every group into one mesh). */
'use strict';
function tkMat(color) { return color === 'C' ? CAMO_MARK : mat(color); }
function tkMesh(parent, geo, color, x = 0, y = 0, z = 0, r, s) { const m = new THREE.Mesh(geo, tkMat(color)); m.position.set(x, y, z); if (r) m.rotation.set(r[0] || 0, r[1] || 0, r[2] || 0); if (s) m.scale.set(s[0], s[1], s[2]); parent.add(m); return m; }
// a solid between a bottom outline at y0 and a top outline at y1 (both seen from above as [x, z]): sloped faces all round
function loftGeo(bot, y0, top, y1) {
  const P = [], quad = (a, b, c, d) => P.push(...a, ...b, ...c, ...a, ...c, ...d), n = bot.length;
  for (let i = 0; i < n; i++) { const j = (i + 1) % n; quad([bot[i][0], y0, bot[i][1]], [bot[j][0], y0, bot[j][1]], [top[j][0], y1, top[j][1]], [top[i][0], y1, top[i][1]]); }
  const capT = THREE.ShapeUtils.triangulateShape(top.map(p => new THREE.Vector2(p[0], p[1])), []), capB = THREE.ShapeUtils.triangulateShape(bot.map(p => new THREE.Vector2(p[0], p[1])), []);
  for (const [a, b, c] of capT) P.push(top[a][0], y1, top[a][1], top[b][0], y1, top[b][1], top[c][0], y1, top[c][1]);
  for (const [a, b, c] of capB) P.push(bot[a][0], y0, bot[a][1], bot[c][0], y0, bot[c][1], bot[b][0], y0, bot[b][1]);
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  // make every face point outwards: compare each triangle's normal with the direction from the solid's centre
  const cx = bot.reduce((s, p) => s + p[0], 0) / n, cz = bot.reduce((s, p) => s + p[1], 0) / n, cy = (y0 + y1) / 2, pos = g.attributes.position;
  for (let t = 0; t < pos.count; t += 3) {
    const a = new V3().fromBufferAttribute(pos, t), b = new V3().fromBufferAttribute(pos, t + 1), c = new V3().fromBufferAttribute(pos, t + 2), nn = b.clone().sub(a).cross(c.clone().sub(a)), m = a.clone().add(b).add(c).divideScalar(3).sub(new V3(cx, cy, cz));
    if (nn.dot(m) < 0) { pos.setXYZ(t + 1, c.x, c.y, c.z); pos.setXYZ(t + 2, b.x, b.y, b.z); }
  }
  g.computeVertexNormals(); return g;
}
function loft(parent, bot, y0, top, y1, color) { return tkMesh(parent, loftGeo(bot, y0, top, y1), color); }
const inset = (pts, k, dx = 0) => { const cx = pts.reduce((s, p) => s + p[0], 0) / pts.length, cz = pts.reduce((s, p) => s + p[1], 0) / pts.length; return pts.map(p => [cx + (p[0] - cx) * k + dx, cz + (p[1] - cz) * k]); };
function lathe(parent, prof, seg, color, x, y, z, r) { const g = new THREE.LatheGeometry(prof.map(p => new THREE.Vector2(p[0], p[1])), seg); return tkMesh(parent, g, color, x, y, z, r); }
function tube(parent, a, b, r, color, seg = 6) { const A = new V3(...a), B = new V3(...b), d = B.clone().sub(A), m = new THREE.Mesh(gCyl(r, r, seg), tkMat(color)); m.position.copy(A).add(B).multiplyScalar(.5); m.scale.set(1, d.length(), 1); m.quaternion.setFromUnitVectors(new V3(0, 1, 0), d.normalize()); parent.add(m); return m; }
function rails(parent, pts, r, color, closed) { for (let i = 0; i < pts.length - (closed ? 0 : 1); i++) tube(parent, pts[i], pts[(i + 1) % pts.length], r, color, 5); }
function bolts(parent, x0, x1, n, y, z, out, color = K_STEEL) { for (let k = 0; k < n; k++) { const m = cylZ(parent, lerp(x0, x1, n > 1 ? k / (n - 1) : .5), y, z, z + out * .018, .017, color, 6); } }
function kitBag(parent, x, y, z, sx, sy, sz, color) { const m = tkMesh(parent, gSph(10), color, x, y + sy / 2, z, null, [sx / 2, sy / 2, sz / 2]); return m; }
function gunTube(gun, segs, color = 'C') { // [x0, x1, r0, r1] pieces of a gun barrel along +x
  for (const [x0, x1, r0, r1, c] of segs) cylX(gun, x0, x1, r0, r1, 0, 0, c || color, 20);
}
function canvasCover(gun, x0, x1, r0, r1, color) { // the wrinkled dust cover between mantlet and barrel
  const prof = []; for (let k = 0; k <= 10; k++) { const t = k / 10; prof.push([lerp(r0, r1, t) * (1 + Math.sin(t * Math.PI * 5) * .06), lerp(x0, x1, t)]); }
  lathe(gun, prof, 16, color, 0, 0, 0, [0, 0, -Math.PI / 2]);
}
function smokeTubes(parent, x, y, z, side, n, rows = 2) { for (let r = 0; r < rows; r++) for (let k = 0; k < n; k++) { const m = cylX(parent, 0, .3, .042, .042, 0, 0, K_STEEL, 8); m.position.set(x - k * .12, y + r * .1, z); m.rotation.set(0, side * -.75 - k * side * .06, .38 + r * .2); const cap = cylX(parent, 0, .02, .044, .044, 0, 0, K_BLACK, 8); cap.position.copy(m.position); cap.rotation.copy(m.rotation); cap.translateY(.15); } }
function periscope(parent, x, y, z, ry = 0) { const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = ry; parent.add(g); bx(g, -.05, 0, -.09, .05, .1, .09, K_STEEL); bx(g, .045, .02, -.07, .055, .08, .07, K_GLASS); return g; }
function lightCluster(parent, x, y, z) { bx(parent, x - .06, y - .07, z - .1, x + .04, y + .07, z + .1, K_BLACK); bx(parent, x + .035, y - .05, z - .08, x + .045, y + .05, z + .08, 0x8a8a70); }

/* ---------------- M1A2 Abrams ---------------- */
function modelM1A2() {
  const root = new THREE.Group(), hull = new THREE.Group(); root.add(hull);
  // lower hull tub between the tracks, with the steep lower front plate
  prof(hull, [[-3.6, .48], [3.3, .48], [3.9, 1.24], [3.9, 1.3], [-3.85, 1.3], [-3.85, .85]], -1.18, 1.18, 'C', .02);
  // upper hull: full width, long low glacis, flat deck
  loft(hull, [[3.95, -1.83], [3.95, 1.83], [-3.85, 1.83], [-3.85, -1.83]], 1.15, [[2.05, -1.8], [2.05, 1.8], [-3.85, 1.8], [-3.85, -1.8]], 1.6, 'C');
  bx(hull, -3.86, 1.15, -1.83, -3.83, 1.6, 1.83, 'C');
  for (const sd of [-1, 1]) {
    // ballistic skirts: three heavy panels at the front, four thin ones behind, a rubber edge below
    const z = sd * 1.86, zo = sd * 1.97;
    for (let k = 0; k < 3; k++) { const x0 = 3.55 - k * .9, x1 = x0 - .88; const p = loft(hull, [[x0, z - sd * .0], [x0, zo], [x1, zo], [x1, z]].map(q => [q[0], q[1]]), .56, [[x0 + (k ? 0 : .12), z], [x0 + (k ? 0 : .12), zo], [x1, zo], [x1, z]], 1.17, 'C'); bolts(hull, x1 + .15, x0 - .15, 3, 1.08, zo, sd); bolts(hull, x1 + .15, x0 - .15, 3, .66, zo, sd); }
    for (let k = 0; k < 4; k++) { const x0 = .85 - k * 1.1, x1 = x0 - 1.08; bx(hull, x1, .62, z, x0, 1.17, z + sd * .05, 'C'); bolts(hull, x1 + .2, x0 - .2, 2, 1.07, z + sd * .05, sd); }
    bx(hull, -3.55, .5, z, 3.55, .58, z + sd * .04, K_RUBBER);
    bx(hull, -3.85, 1.15, sd * 1.8, 3.95, 1.18, sd * 1.97, 'C'); // the top rail the skirts hang from
    // front fender, headlight guard and lights, mud flap
    loft(hull, [[3.95, sd * 1.3], [3.95, sd * 1.97], [3.55, sd * 1.97], [3.55, sd * 1.3]], 1.22, [[3.85, sd * 1.3], [3.85, sd * 1.95], [3.55, sd * 1.95], [3.55, sd * 1.3]], 1.3, 'C');
    rails(hull, [[3.62, 1.3, sd * 1.42], [3.92, 1.42, sd * 1.42], [3.92, 1.42, sd * 1.74], [3.62, 1.3, sd * 1.74]], .022, 'C');
    lightCluster(hull, 3.82, 1.38, sd * 1.58);
    bx(hull, -3.86, .62, sd * 1.55, -3.78, 1.12, sd * 1.95, K_RUBBER); // rear mud flaps
    lightCluster(hull, -3.86, 1.45, sd * 1.62);
    // tow eyes
    for (const zz of [sd * .75]) { const t = new THREE.Mesh(new THREE.TorusGeometry(.09, .03, 6, 12), mat(K_STEEL)); t.position.set(3.72, .9, zz); t.rotation.y = Math.PI / 2; hull.add(t); }
    // tools and track-tension bar on the sponson tops
    bx(hull, -1.6, 1.6, sd * 1.5, .4, 1.66, sd * 1.62, 0x5a4a32); tube(hull, [-1.5, 1.68, sd * 1.7], [.3, 1.68, sd * 1.7], .025, K_STEEL);
    // tow cables along the rear deck
    rails(hull, [[-3.7, 1.63, sd * 1.6], [-2.6, 1.63, sd * 1.66], [-1.9, 1.63, sd * 1.5], [-1.7, 1.63, sd * 1.15]], .028, 0x2a2a26);
  }
  // driver's station: rotating hatch with three periscopes, a splash guard
  cylY(hull, 2.62, 1.6, 1.68, 0, .34, 'C', 18); cylY(hull, 2.62, 1.68, 1.73, 0, .28, 'C', 18);
  for (const a of [-.55, 0, .55]) periscope(hull, 2.62 + Math.cos(a) * .3, 1.62, Math.sin(a) * .3, -a);
  bx(hull, 2.98, 1.52, -.55, 3.03, 1.6, .55, 'C', { r: [0, 0, .5] });
  // engine deck: louvred grilles, access doors, the big exhaust grille at the back
  bx(hull, -3.8, 1.6, -1.25, -1.9, 1.63, 1.25, 'C');
  for (let k = 0; k < 14; k++) { const m = bx(hull, 0, 0, 0, .1, .02, 2.2, K_STEEL); m.position.set(-3.65 + k * .13, 1.645, 0); m.rotation.z = .5; }
  for (const zz of [-1.55, -1.42, 1.42, 1.55]) bx(hull, -3.8, 1.6, zz - .01, -1.9, 1.64, zz + .01, K_BLACK); // door seams
  bx(hull, -3.92, .78, -1.12, -3.85, 1.48, 1.12, K_STEEL); for (let k = 0; k < 9; k++) bx(hull, -3.95, .82 + k * .072, -1.08, -3.9, .84 + k * .072, 1.08, K_BLACK);
  cylZ(hull, -3.95, .7, -.12, .12, .07, K_STEEL, 8); // tow pintle
  for (let k = -2; k <= 2; k++) bx(hull, -3.86, 1.48, k * .45 - .02, -3.82, 1.6, k * .45 + .02, K_STEEL); // rear plate stiffeners

  const turret = new THREE.Group(); turret.position.set(-.2, 1.6, 0); hull.add(turret);
  // turret body: armoured cheeks either side of a recessed gun slot, sides leaning in, flat roof
  const tb = [[2.05, -1.62], [1.55, -.62], [1.55, .62], [2.05, 1.62], [1.85, 1.74], [-1.7, 1.82], [-2.05, 1.62], [-2.05, -1.62], [-1.7, -1.82], [1.85, -1.74]];
  const tt = [[2.18, -1.55], [1.62, -.62], [1.62, .62], [2.18, 1.55], [1.95, 1.7], [-1.7, 1.78], [-2.05, 1.58], [-2.05, -1.58], [-1.7, -1.78], [1.95, -1.7]];
  loft(turret, inset(tb, .94, -.05), 0, tb, .18, 'C'); loft(turret, tb, .18, tt, .78, 'C'); loft(turret, tt, .78, inset(tt, .97, -.04), .93, 'C');
  // the bustle with its blow-out panels, and the stowage basket round it
  loft(turret, [[-2.0, -1.5], [-2.0, 1.5], [-3.3, 1.4], [-3.3, -1.4]], .08, [[-2.0, -1.55], [-2.0, 1.55], [-3.32, 1.45], [-3.32, -1.45]], .86, 'C');
  bx(turret, -3.1, .86, -1.2, -2.15, .9, -.15, K_STEEL); bx(turret, -3.1, .86, .15, -2.15, .9, 1.2, K_STEEL); bx(turret, -3.1, .9, -.68, -2.15, .91, -.66, K_BLACK); bx(turret, -3.1, .9, .66, -2.15, .91, .68, K_BLACK);
  const bk = [[-3.32, .25, -1.62], [-3.32, .25, 1.62], [-4.0, .25, 1.62], [-4.0, .25, -1.62]];
  rails(turret, bk.map(p => [p[0], .82, p[2]]), .025, K_STEEL, true); rails(turret, bk, .025, K_STEEL, true);
  for (const p of bk) tube(turret, p, [p[0], .82, p[2]], .022, K_STEEL); for (let k = 1; k < 6; k++) tube(turret, [-4.0, .25, -1.62 + k * .54], [-4.0, .82, -1.62 + k * .54], .015, K_STEEL);
  bx(turret, -3.95, .25, -1.58, -3.36, .28, 1.58, K_STEEL); // basket floor
  kitBag(turret, -3.6, .28, -1.1, .55, .45, .7, 0x5d5338); kitBag(turret, -3.65, .28, -.3, .6, .5, .75, 0x4f4a34); kitBag(turret, -3.55, .28, .55, .5, .42, .7, 0x6a5c40); bx(turret, -3.9, .28, .95, -3.4, .62, 1.5, 0x4a4a3a); kitBag(turret, -3.7, .7, .1, .5, .3, .9, 0x5a5440);
  for (const sd of [-1, 1]) { // side stowage boxes on the bustle and turret
    bx(turret, -3.25, .35, sd * 1.48, -2.1, .8, sd * 1.72, 'C'); bx(turret, -3.25, .79, sd * 1.47, -2.1, .82, sd * 1.73, 'C');
    rails(turret, [[-1.6, .7, sd * 1.86], [-.2, .7, sd * 1.84], [.9, .7, sd * 1.8]], .018, K_STEEL); // grab rail
    smokeTubes(turret, 1.75, .5, sd * 1.72, sd, 3);
    const eye = new THREE.Mesh(new THREE.TorusGeometry(.06, .02, 5, 10), mat(K_STEEL)); eye.position.set(1.6, .96, sd * 1.5); turret.add(eye);
  }
  // gunner's primary sight with armoured doors
  loft(turret, [[1.6, .55], [1.6, 1.08], [.85, 1.08], [.85, .55]], .9, [[1.45, .58], [1.45, 1.05], [.85, 1.05], [.85, .58]], 1.3, 'C');
  bx(turret, 1.5, .96, .62, 1.56, 1.22, 1.0, K_GLASS); bx(turret, 1.52, 1.22, .58, 1.62, 1.26, 1.04, 'C');
  // commander's independent thermal viewer: a pedestal and a turning head
  cylY(turret, .45, .9, 1.25, -.5, .17, 'C', 14); bx(turret, .25, 1.25, -.72, .72, 1.52, -.28, 'C'); bx(turret, .71, 1.3, -.64, .74, 1.47, -.36, K_GLASS);
  // commander's cupola with vision blocks and a remote weapon station with the .50 cal
  cylY(turret, -.5, .9, 1.12, .78, .48, 'C', 20); cylY(turret, -.5, 1.12, 1.18, .78, .42, K_STEEL, 20);
  for (let k = 0; k < 6; k++) { const a = k / 6 * TAU; periscope(turret, -.5 + Math.cos(a) * .42, .98, .78 + Math.sin(a) * .42, -a); }
  bx(turret, -.75, 1.18, .55, -.15, 1.42, 1.0, 'C'); bx(turret, -.15, 1.24, .62, .1, 1.4, .82, K_STEEL); bx(turret, .08, 1.28, .64, .11, 1.36, .8, K_GLASS); // RWS cradle and sights
  cylX(turret, -.4, .35, .055, .05, 1.34, 1.02, K_BLACK, 10); cylX(turret, .35, 1.45, .028, .026, 1.34, 1.02, K_BLACK, 8); cylX(turret, 1.42, 1.52, .034, .034, 1.34, 1.02, K_BLACK, 8); bx(turret, -.55, 1.18, 1.0, -.25, 1.36, 1.12, 0x3d4430); // M2 and ammo can
  // loader's hatch with the M240 behind a gun shield
  cylY(turret, -.45, .9, 1.05, -.8, .38, 'C', 18); cylY(turret, -.45, 1.05, 1.1, -.8, .34, K_STEEL, 18);
  bx(turret, -.05, 1.05, -1.15, .02, 1.42, -.5, 'C', { r: [0, .15, 0] }); bx(turret, -.3, 1.05, -1.2, -.05, 1.42, -1.13, 'C');
  cylX(turret, -.4, .45, .03, .028, 1.25, -.85, K_BLACK, 8); cylX(turret, .45, .85, .016, .016, 1.25, -.85, K_BLACK, 6); bx(turret, -.35, 1.13, -.9, -.12, 1.25, -.78, K_BLACK);
  // wind sensor, antennas, lifting eyes, roof hatch seams
  cylY(turret, -1.9, .92, 1.5, .25, .025, K_STEEL, 6); bx(turret, -1.92, 1.5, .05, -1.88, 1.53, .45, K_STEEL);
  for (const zz of [-1.25, 1.3]) { cylY(turret, -2.6, .86, .98, zz, .07, K_STEEL, 8); cylY(turret, -2.6, .98, zz > 0 ? 3.1 : 3.6, zz, .012, K_BLACK, 4); }
  // gun: mantlet in the slot, a canvas cover, M256 with thermal sleeve bands, the bore evacuator and muzzle reference sensor
  const gun = new THREE.Group(); gun.position.set(2.0, .45, 0); turret.add(gun);
  loft(gun, [[-.45, -.55], [.3, -.55], [.3, .55], [-.45, .55]], -.36, [[-.45, -.5], [.22, -.5], [.22, .5], [-.45, .5]], .36, 'C');
  bx(gun, .2, -.22, .32, .32, -.08, .44, K_BLACK); // coax port
  canvasCover(gun, .28, .62, .26, .17, 0x6e6a52);
  gunTube(gun, [[.6, 1.3, .15, .145], [1.3, 1.36, .158, .158, K_STEEL], [1.36, 2.4, .142, .135], [2.4, 2.46, .15, .15, K_STEEL], [2.46, 3.25, .132, .128], [3.25, 3.42, .128, .17], [3.42, 4.05, .17, .17], [4.05, 4.2, .17, .12], [4.2, 4.26, .135, .135, K_STEEL], [4.26, 5.75, .118, .108], [5.75, 5.95, .112, .112, K_STEEL]]);
  bx(gun, 5.55, .1, -.05, 5.82, .2, .05, K_STEEL); bx(gun, 5.6, .2, -.06, 5.72, .28, .06, K_BLACK); // muzzle reference sensor
  const wheels = [], X = [-2.75, -1.85, -.95, -.05, .85, 1.75, 2.65];
  for (const x of X) wheels.push({ x, y: .36, r: .32, kind: 'road' });
  wheels.push({ x: -3.48, y: .78, r: .32, kind: 'sprocket' }, { x: 3.38, y: .68, r: .3, kind: 'idler' });
  return { root, hull, turret, gun, muzzle: 5.95, wheels, wz: 1.5, ww: .62, track: { top: 1.08, sag: .05, rollers: [-1.8, -.1, 1.6], pitch: .19, rubber: true } };
}

/* ---------------- T-90A ---------------- */
function modelT90A() {
  const root = new THREE.Group(), hull = new THREE.Group(); root.add(hull);
  prof(hull, [[-3.25, .44], [2.95, .44], [3.43, .98], [3.43, 1.04], [-3.45, 1.04], [-3.45, .82]], -1.1, 1.1, 'C', .02);
  loft(hull, [[3.43, -1.1], [3.43, 1.1], [-3.45, 1.1], [-3.45, -1.1]], 1.0, [[2.2, -1.1], [2.2, 1.1], [-3.45, 1.1], [-3.45, -1.1]], 1.48, 'C');
  for (const sd of [-1, 1]) {
    // fender shelves over the tracks, with the fuel and stowage boxes the T-series carry on them
    bx(hull, -3.45, 1.12, sd * 1.1, 3.28, 1.16, sd * 1.82, 'C');
    loft(hull, [[3.28, sd * 1.1], [3.28, sd * 1.82], [3.0, sd * 1.82], [3.0, sd * 1.1]], 1.0, [[3.4, sd * 1.1], [3.4, sd * 1.82], [3.0, sd * 1.82], [3.0, sd * 1.1]], 1.16, 'C');
    for (let k = 0; k < 4; k++) { bx(hull, -2.9 + k * .95, 1.16, sd * 1.32, -2.05 + k * .95, 1.5, sd * 1.78, 'C'); bx(hull, -2.85 + k * .95, 1.5, sd * 1.35, -2.1 + k * .95, 1.52, sd * 1.75, K_STEEL); } // fender fuel tanks and boxes
    bx(hull, -2.95, 1.25, sd * 1.78, 1.0, 1.29, sd * 1.8, K_STEEL); // the fuel line along them
    // rubber side skirt with Kontakt-5 panels at the front
    bx(hull, -3.1, .7, sd * 1.8, 3.25, 1.12, sd * 1.84, K_RUBBER);
    for (let k = 0; k < 4; k++) { const x0 = 3.2 - k * .55; loft(hull, [[x0, sd * 1.84], [x0, sd * 1.96], [x0 - .52, sd * 1.96], [x0 - .52, sd * 1.84]], .7, [[x0, sd * 1.84], [x0, sd * 1.93], [x0 - .52, sd * 1.93], [x0 - .52, sd * 1.84]], 1.12, 'C'); bolts(hull, x0 - .45, x0 - .07, 2, 1.05, sd * 1.96, sd); }
    lightCluster(hull, 3.3, 1.25, sd * 1.55); rails(hull, [[3.2, 1.16, sd * 1.45], [3.42, 1.32, sd * 1.45], [3.42, 1.32, sd * 1.66], [3.2, 1.16, sd * 1.66]], .02, K_STEEL);
    rails(hull, [[-3.3, 1.18, sd * 1.25], [-1.0, 1.18, sd * 1.22], [1.2, 1.18, sd * 1.24]], .028, 0x2a2a26); // tow cable
    cylZ(hull, -3.7, 1.15, sd * .25, sd * 1.15, .3, 0x3c4030, 16); bx(hull, -3.65, .9, sd * .3, -3.4, 1.0, sd * 1.1, K_STEEL); // external fuel drums on their brackets
    for (const t of [.35, .9]) { const ring = new THREE.Mesh(new THREE.TorusGeometry(.305, .02, 5, 16), mat(K_STEEL)); ring.position.set(-3.7, 1.15, sd * t); hull.add(ring); }
    bx(hull, -3.48, .55, sd * 1.5, -3.42, 1.0, sd * 1.8, K_RUBBER);
  }
  // Kontakt-5 on the glacis: two rows of wedge bricks in a V
  for (let r = 0; r < 2; r++) for (let k = -3; k <= 3; k++) { if (k === 0 && r === 1) continue; const m = loft(hull, [[0, -.24], [0, .24], [-.5, .24], [-.5, -.24]], 0, [[0, -.24], [0, .24], [-.5, .24], [-.5, -.24]], .13, 'C'); m.position.set(3.38 - r * .5, 1.06 + r * .2, k * .5); m.rotation.z = .4; }
  // self-entrenching blade below the nose, driver's hatch and periscope
  bx(hull, 3.15, .55, -1.05, 3.48, .72, 1.05, 'C', { r: [0, 0, -.6] }); for (let k = -3; k <= 3; k++) bx(hull, 3.25, .62, k * .3 - .03, 3.45, .82, k * .3 + .03, K_STEEL);
  cylY(hull, 2.35, 1.48, 1.56, 0, .28, 'C', 16); periscope(hull, 2.62, 1.46, 0, 0);
  // engine deck louvres and the exhaust on the left
  bx(hull, -3.42, 1.48, -1.0, -1.7, 1.51, 1.0, 'C'); for (let k = 0; k < 11; k++) { const m = bx(hull, 0, 0, 0, .1, .02, 1.85, K_STEEL); m.position.set(-3.3 + k * .15, 1.52, 0); m.rotation.z = -.5; }
  bx(hull, -1.0, 1.0, -1.83, -.3, 1.28, -1.78, 0x1e1e1c);

  const turret = new THREE.Group(); turret.position.set(.1, 1.48, 0); hull.add(turret);
  // welded turret: a flat-sided front and a rounded back, sides leaning in
  const tb = [[1.5, -1.05], [1.5, 1.05], [.9, 1.55], [-.6, 1.6], [-1.6, 1.25], [-1.95, .55], [-1.95, -.55], [-1.6, -1.25], [-.6, -1.6], [.9, -1.55]];
  loft(turret, inset(tb, .95, .02), 0, tb, .26, 'C'); loft(turret, tb, .26, inset(tb, .86, -.05), .8, 'C');
  // Kontakt-5 clamshells on the turret front and the brow plates on the roof
  for (const sd of [-1, 1]) {
    const cs = loft(turret, [[0, 0], [.95, 0], [.95, .78], [0, .78]].map(p => [p[0], p[1] * sd]), 0, [[0, 0], [.75, 0], [.75, .74], [0, .74]].map(p => [p[0], p[1] * sd]), .68, 'C'); cs.position.set(1.05, .12, sd * .42); cs.rotation.y = sd * .42;
    const brow = loft(turret, [[0, 0], [.7, 0], [.7, .7], [0, .7]].map(p => [p[0], p[1] * sd]), 0, [[0, 0], [.4, 0], [.4, .62], [0, .62]].map(p => [p[0], p[1] * sd]), .1, 'C'); brow.position.set(.55, .8, sd * .35);
    // Shtora infrared dazzlers either side of the gun
    bx(turret, 1.32, .5, sd * .62, 1.72, .82, sd * .92, 0x2e2e28); bx(turret, 1.71, .55, sd * .66, 1.74, .77, sd * .88, 0x6a1a14);
    // Tucha smoke grenade launchers fanned along the turret side
    smokeTubes(turret, .4, .35, sd * 1.55, sd, 6, 1);
    rails(turret, [[-1.4, .55, sd * 1.4], [-.4, .6, sd * 1.62], [.6, .6, sd * 1.6]], .018, K_STEEL);
    const eye = new THREE.Mesh(new THREE.TorusGeometry(.06, .02, 5, 10), mat(K_STEEL)); eye.position.set(-1.2, .8, sd * 1.05); turret.add(eye);
  }
  // gunner's 1G46 sight, the commander's cupola with TKN-4 and a 12.7 mm machine gun
  loft(turret, [[.95, -.95], [.95, -.45], [.45, -.45], [.45, -.95]], .78, [[.85, -.92], [.85, -.48], [.45, -.48], [.45, -.92]], 1.08, 'C'); bx(turret, .93, .84, -.88, .97, 1.02, -.52, K_GLASS);
  cylY(turret, -.05, .78, .98, .62, .42, 'C', 20); cylY(turret, -.05, .98, 1.04, .62, .36, K_STEEL, 20);
  bx(turret, .2, 1.0, .5, .5, 1.2, .74, 'C'); bx(turret, .49, 1.05, .54, .52, 1.17, .7, K_GLASS);
  bx(turret, -.45, 1.04, .35, .1, 1.12, .9, K_STEEL); cylX(turret, -.2, .55, .05, .045, 1.2, .62, K_BLACK, 10); cylX(turret, .55, 1.55, .026, .024, 1.2, .62, K_BLACK, 8); bx(turret, -.35, 1.1, .82, -.1, 1.3, .95, 0x3d4430);
  cylY(turret, -.45, .78, .9, -.55, .3, 'C', 16); // gunner's hatch
  // rear: big stowage box, the snorkel tube, antenna
  bx(turret, -2.15, .2, -1.05, -1.55, .72, 1.05, 0x4e4a35); bx(turret, -2.17, .7, -1.07, -1.53, .74, 1.07, 0x464230);
  cylZ(turret, -1.9, .85, -1.1, 1.1, .11, 'C', 12);
  cylY(turret, -1.3, .8, .88, -.95, .06, K_STEEL, 8); cylY(turret, -1.3, .88, 3.1, -.95, .012, K_BLACK, 4);
  // gun: cylindrical mantlet, canvas cover, 2A46M-5 with thermal sleeve bands and the bore evacuator well forward
  const gun = new THREE.Group(); gun.position.set(1.55, .4, 0); turret.add(gun);
  cylX(gun, -.25, .25, .3, .3, 0, 0, 'C', 18); canvasCover(gun, .22, .55, .25, .16, 0x5c5a44);
  gunTube(gun, [[.5, 1.5, .14, .135], [1.5, 1.56, .148, .148, K_STEEL], [1.56, 2.7, .132, .126], [2.7, 2.76, .14, .14, K_STEEL], [2.76, 3.45, .124, .12], [3.45, 3.6, .12, .175], [3.6, 4.3, .175, .175], [4.3, 4.45, .175, .115], [4.45, 6.0, .112, .102], [6.0, 6.15, .106, .106, K_STEEL]]);
  const wheels = [], X = [-2.55, -1.55, -.55, .45, 1.45, 2.45];
  for (const x of X) wheels.push({ x, y: .4, r: .38, kind: 'road' });
  wheels.push({ x: -3.18, y: .72, r: .3, kind: 'sprocket' }, { x: 3.08, y: .65, r: .3, kind: 'idler' });
  return { root, hull, turret, gun, muzzle: 6.15, wheels, wz: 1.42, ww: .58, track: { top: .86, sag: .12, rollers: [], pitch: .17 } };
}
