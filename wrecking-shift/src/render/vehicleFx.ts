import * as THREE from 'three';
import type { Vehicle } from '../sim/vehicle';

/**
 * Presentation for vehicles: raycast wheels (not voxels) drawn as dark blocky tyres with a hub,
 * positioned from the Rapier controller state, plus engine smoke when a vehicle is badly damaged.
 */

interface WheelView {
  group: THREE.Group;
  spin: THREE.Group;
}
interface View {
  v: Vehicle;
  wheels: WheelView[];
}
interface Puff {
  mesh: THREE.Mesh;
  vel: THREE.Vector3;
  life: number;
  max: number;
  size: number;
}

const X_AXIS = new THREE.Vector3(1, 0, 0);
const Y_AXIS = new THREE.Vector3(0, 1, 0);

export class VehicleFx {
  readonly root = new THREE.Group();
  private views = new Map<number, View>();
  private tyreMat = new THREE.MeshStandardMaterial({ color: 0x1c1c1f, roughness: 0.95, metalness: 0, flatShading: true });
  private hubMat = new THREE.MeshStandardMaterial({ color: 0x9aa0a6, roughness: 0.5, metalness: 0.4, flatShading: true });
  private geoCache = new Map<string, { tyre: THREE.BufferGeometry; hub: THREE.BufferGeometry; bolt: THREE.BufferGeometry }>();
  private puffs: Puff[] = [];
  private puffGeo = new THREE.BoxGeometry(1, 1, 1);
  private smokeAcc = new Map<number, number>();
  private tmpQ = new THREE.Quaternion();
  private tmpQ2 = new THREE.Quaternion();
  private tmpV = new THREE.Vector3();

  constructor() {
    this.root.name = 'vehicleFx';
  }

  private geos(r: number, w: number) {
    const key = r.toFixed(3) + ':' + w.toFixed(3);
    let g = this.geoCache.get(key);
    if (!g) {
      // axis along X (the axle); 10 sides keeps the blocky look of the voxel world
      const tyre = new THREE.CylinderGeometry(r, r, w, 10).rotateZ(Math.PI / 2);
      const hub = new THREE.CylinderGeometry(r * 0.52, r * 0.52, w * 1.06, 6).rotateZ(Math.PI / 2);
      const bolt = new THREE.BoxGeometry(w * 1.12, r * 0.18, r * 0.9);
      g = { tyre, hub, bolt };
      this.geoCache.set(key, g);
    }
    return g;
  }

  private ensure(v: Vehicle): View {
    let view = this.views.get(v.id);
    if (view) return view;
    const wheels: WheelView[] = [];
    for (const w of v.spec.wheels) {
      const g = this.geos(w.radius, w.width);
      const group = new THREE.Group();
      const spin = new THREE.Group();
      const tyre = new THREE.Mesh(g.tyre, this.tyreMat);
      const hub = new THREE.Mesh(g.hub, this.hubMat);
      const bolt = new THREE.Mesh(g.bolt, this.hubMat);
      for (const m of [tyre, hub, bolt]) { m.castShadow = true; m.receiveShadow = true; }
      spin.add(tyre, hub, bolt);
      group.add(spin);
      this.root.add(group);
      wheels.push({ group, spin });
    }
    view = { v, wheels };
    this.views.set(v.id, view);
    return view;
  }

  private drop(view: View): void {
    for (const w of view.wheels) this.root.remove(w.group);
    this.views.delete(view.v.id);
  }

  /** per rendered frame */
  sync(list: readonly Vehicle[], dt: number): void {
    const alive = new Set<number>();
    for (const v of list) {
      if (v.removed || v.body.removed) continue;
      alive.add(v.id);
      const view = this.ensure(v);
      const rb = v.body.rb;
      const t = rb.translation(), r = rb.rotation();
      const cq = this.tmpQ.set(r.x, r.y, r.z, r.w);
      const ctrl = v.ctrl;
      for (let i = 0; i < view.wheels.length; i++) {
        const wv = view.wheels[i];
        const spec = v.spec.wheels[i];
        if (v.wheelLost[i]) { wv.group.visible = false; continue; }
        wv.group.visible = true;
        const susp = Math.min(ctrl.wheelSuspensionLength(i) ?? v.spec.restLength, v.spec.restLength + v.spec.maxTravel);
        // chassis-local wheel centre -> world
        this.tmpV.set(spec.x, spec.y - susp, spec.z).applyQuaternion(cq);
        wv.group.position.set(t.x + this.tmpV.x, t.y + this.tmpV.y, t.z + this.tmpV.z);
        const steer = ctrl.wheelSteering(i) ?? 0;
        wv.group.quaternion.copy(cq).multiply(this.tmpQ2.setFromAxisAngle(Y_AXIS, steer));
        wv.spin.quaternion.setFromAxisAngle(X_AXIS, ctrl.wheelRotation(i) ?? 0); // forward roll = +X rotation
      }
      // engine smoke
      if (v.smoking) {
        const amount = v.smokeAmount;
        let acc = (this.smokeAcc.get(v.id) ?? 0) + dt * (6 + 22 * amount);
        while (acc >= 1) { acc -= 1; this.puff(v, amount); }
        this.smokeAcc.set(v.id, acc);
      }
    }
    for (const view of [...this.views.values()]) if (!alive.has(view.v.id)) this.drop(view);
    this.updatePuffs(dt);
  }

  private puff(v: Vehicle, amount: number): void {
    let p = this.puffs.find((q) => q.life <= 0);
    if (!p) {
      if (this.puffs.length >= 80) return;
      const mat = new THREE.MeshBasicMaterial({ color: 0x3a3836, transparent: true, opacity: 0.5, depthWrite: false });
      p = { mesh: new THREE.Mesh(this.puffGeo, mat), vel: new THREE.Vector3(), life: 0, max: 1, size: 0.3 };
      p.mesh.renderOrder = 2;
      this.root.add(p.mesh);
      this.puffs.push(p);
    }
    const e = v.localToWorld(v.spec.engine);
    p.mesh.position.set(e.x + (Math.random() - 0.5) * 0.4, e.y + 0.3, e.z + (Math.random() - 0.5) * 0.4);
    p.vel.set((Math.random() - 0.5) * 0.5, 1.0 + Math.random() * 0.8, (Math.random() - 0.5) * 0.5);
    p.max = p.life = 1.2 + Math.random() * 1.3;
    p.size = 0.25 + 0.25 * amount;
    const c = amount > 0.7 ? 0x1e1d1c : 0x55524e;
    (p.mesh.material as THREE.MeshBasicMaterial).color.setHex(c);
    p.mesh.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3);
    p.mesh.visible = true;
  }

  private updatePuffs(dt: number): void {
    for (const p of this.puffs) {
      if (p.life <= 0) continue;
      p.life -= dt;
      if (p.life <= 0) { p.mesh.visible = false; continue; }
      const k = 1 - p.life / p.max;
      p.mesh.position.addScaledVector(p.vel, dt);
      p.vel.multiplyScalar(Math.exp(-dt * 0.6));
      const s = p.size * (1 + k * 2.5);
      p.mesh.scale.set(s, s, s);
      (p.mesh.material as THREE.MeshBasicMaterial).opacity = 0.5 * (1 - k);
    }
  }

  clear(): void {
    for (const view of [...this.views.values()]) this.drop(view);
    for (const p of this.puffs) { p.life = 0; p.mesh.visible = false; }
    this.smokeAcc.clear();
  }
}
