import * as THREE from 'three';
import type { Mission } from '../../sim/mission';

/**
 * Cosmetic world objects for missions (three.js, render-only):
 * - the security helicopter (blocky original design: stubby cabin, twin skids, boxy tail, search cone)
 * - sagging red wires from alarm boxes to their targets
 */
export class MissionVisuals {
  readonly root = new THREE.Group();
  private heli = new THREE.Group();
  private rotor = new THREE.Group();
  private tailRotor = new THREE.Group();
  private beacon: THREE.Mesh;
  private cone: THREE.Mesh;
  private wires: THREE.LineSegments;
  private wirePos = new Float32Array(16 * 6 * 8);
  private t = 0;

  constructor() {
    const mat = (c: number, e = 0) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.6, metalness: 0.2, emissive: e ? c : 0x000000, emissiveIntensity: e });
    const boxm = (w: number, h: number, d: number, m: THREE.Material, x = 0, y = 0, z = 0) => {
      const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
      b.position.set(x, y, z); b.castShadow = true;
      return b;
    };
    const hull = mat(0x1d2733), stripe = mat(0xf5c518), glass = mat(0x9fd6ff, 0.35), dark = mat(0x101317);
    // nose points to -Z
    this.heli.add(
      boxm(1.9, 1.5, 3.4, hull, 0, 0, 0),
      boxm(1.92, 0.25, 3.42, stripe, 0, -0.25, 0),
      boxm(1.7, 1.0, 1.0, glass, 0, 0.15, -1.9),
      boxm(1.4, 0.7, 0.6, glass, 0, -0.35, -2.25),
      boxm(0.5, 0.5, 3.8, hull, 0, 0.35, 3.4),
      boxm(0.12, 1.2, 0.8, hull, 0, 0.9, 5.0),
      boxm(1.6, 0.12, 0.5, stripe, 0, 0.4, 5.0),
      boxm(0.6, 0.35, 0.6, dark, 0, 0.95, 0),
      // skids + struts
      boxm(0.12, 0.12, 3.6, dark, -0.95, -1.15, -0.1), boxm(0.12, 0.12, 3.6, dark, 0.95, -1.15, -0.1),
      boxm(0.1, 0.45, 0.1, dark, -0.85, -0.95, -0.9), boxm(0.1, 0.45, 0.1, dark, 0.85, -0.95, -0.9),
      boxm(0.1, 0.45, 0.1, dark, -0.85, -0.95, 0.8), boxm(0.1, 0.45, 0.1, dark, 0.85, -0.95, 0.8),
    );
    const blade = mat(0x2a2f36);
    this.rotor.add(boxm(8.4, 0.06, 0.32, blade), boxm(0.32, 0.06, 8.4, blade));
    this.rotor.position.set(0, 1.18, 0);
    this.tailRotor.add(boxm(0.06, 1.6, 0.18, blade), boxm(0.06, 0.18, 1.6, blade));
    this.tailRotor.position.set(0.12, 0.9, 5.15);
    this.beacon = boxm(0.18, 0.18, 0.18, new THREE.MeshBasicMaterial({ color: 0xff2a1a }), 0, -0.82, 1.2);
    // searchlight: translucent cone hanging below the nose, tilted forward
    const coneGeo = new THREE.ConeGeometry(5.5, 22, 20, 1, true);
    coneGeo.translate(0, -11, 0);
    this.cone = new THREE.Mesh(coneGeo, new THREE.MeshBasicMaterial({ color: 0xfff1b8, transparent: true, opacity: 0.12, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }));
    this.cone.position.set(0, -0.7, -2.2);
    this.cone.rotation.x = -0.35;
    const lamp = boxm(0.4, 0.25, 0.4, new THREE.MeshBasicMaterial({ color: 0xfff6d0 }), 0, -0.82, -2.2);
    this.heli.add(this.rotor, this.tailRotor, this.beacon, this.cone, lamp);
    this.heli.visible = false;
    this.root.add(this.heli);

    const wg = new THREE.BufferGeometry();
    wg.setAttribute('position', new THREE.BufferAttribute(this.wirePos, 3));
    wg.setDrawRange(0, 0);
    this.wires = new THREE.LineSegments(wg, new THREE.LineBasicMaterial({ color: 0xd8321e }));
    this.wires.frustumCulled = false;
    this.root.add(this.wires);
  }

  update(m: Mission | null, dt: number): void {
    this.t += dt;
    const h = m?.heli;
    this.heli.visible = !!h;
    if (h) {
      this.heli.position.set(h.pos.x, h.pos.y + Math.sin(this.t * 1.3) * 0.15, h.pos.z);
      this.heli.rotation.set(m!.phase === 'failed' ? 0 : -0.12, h.yaw, Math.sin(this.t * 0.7) * 0.04, 'YXZ');
      this.rotor.rotation.y += dt * 26;
      this.tailRotor.rotation.x += dt * 40;
      this.beacon.visible = Math.floor(this.t * 2.5) % 2 === 0;
    }
    // alarm wires (sag in the middle)
    const ws = m && !m.ended ? m.wires() : [];
    const SEG = 8;
    let n = 0;
    for (const w of ws.slice(0, 16)) {
      const len = Math.hypot(w.to.x - w.from.x, w.to.z - w.from.z, w.to.y - w.from.y);
      const sag = Math.min(0.6, len * 0.08);
      let px = w.from.x, py = w.from.y, pz = w.from.z;
      for (let i = 1; i <= SEG; i++) {
        const s = i / SEG;
        const x = w.from.x + (w.to.x - w.from.x) * s, z = w.from.z + (w.to.z - w.from.z) * s;
        const y = w.from.y + (w.to.y - w.from.y) * s - sag * 4 * s * (1 - s);
        this.wirePos.set([px, py, pz, x, y, z], n * 6);
        n++;
        px = x; py = y; pz = z;
      }
    }
    const g = this.wires.geometry;
    g.setDrawRange(0, n * 2);
    (g.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    this.wires.visible = n > 0;
  }
}
