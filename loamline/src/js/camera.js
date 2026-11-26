// Camera views. 'photo' is a free orbit used by photo mode.

import * as THREE from 'three';
import { wrapAngle, clamp } from './noise.js';

export const VIEWS = ['follow', 'far', 'side', 'sideLeft', 'front', 'profile', 'first', 'chest'];
export const VIEW_NAMES = {
  follow: 'Behind', far: 'Far behind', side: 'Rear right', sideLeft: 'Rear left', front: 'Front',
  profile: 'Side', first: 'Helmet', chest: 'Chest', photo: 'Photo',
};

export class CameraRig {
  constructor(camera) {
    this.cam = camera;
    this.view = 'follow';
    this.yaw = 0;
    this.pos = new THREE.Vector3();
    this.look = new THREE.Vector3();
    this.inited = false;
    this.shake = 0;
    this.photo = { yaw: 0, pitch: 0.25, dist: 6 };
    this.fovBase = 62;
  }

  setView(v) { this.view = v; this.inited = false; }
  next() {
    const i = VIEWS.indexOf(this.view);
    this.setView(VIEWS[(i + 1) % VIEWS.length]);
    return this.view;
  }

  update(dt, bike, ground) {
    const cam = this.cam;
    const p = bike.pos;
    // Follow the direction of travel, not the spinning bike.
    const hs = Math.hypot(bike.vel.x, bike.vel.z);
    const travelYaw = hs > 1 ? Math.atan2(bike.vel.x, bike.vel.z) : bike.yaw;
    const target = bike.grounded ? bike.yaw : travelYaw;
    if (!this.inited) this.yaw = target;
    this.yaw += wrapAngle(target - this.yaw) * Math.min(1, dt * (bike.grounded ? 4 : 2));
    const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
    const rx = -fz, rz = fx;
    const speed = Math.abs(bike.speed || hs);

    const want = new THREE.Vector3(), look = new THREE.Vector3();
    let fov = this.fovBase + Math.min(14, speed * 0.6);
    let rigid = false;
    switch (this.view) {
      case 'far':
        want.set(p.x - fx * 9, p.y + 3.8, p.z - fz * 9);
        look.set(p.x + fx * 4, p.y + 0.8, p.z + fz * 4);
        break;
      case 'side':
        want.set(p.x - fx * 4.4 + rx * 2.6, p.y + 2.0, p.z - fz * 4.4 + rz * 2.6);
        look.set(p.x + fx * 3, p.y + 0.9, p.z + fz * 3);
        break;
      case 'sideLeft':
        want.set(p.x - fx * 4.4 - rx * 2.6, p.y + 2.0, p.z - fz * 4.4 - rz * 2.6);
        look.set(p.x + fx * 3, p.y + 0.9, p.z + fz * 3);
        break;
      case 'front':
        want.set(p.x + fx * 5.5, p.y + 1.7, p.z + fz * 5.5);
        look.set(p.x, p.y + 1.0, p.z);
        break;
      case 'profile':
        want.set(p.x + rx * 7 + fx * 1.5, p.y + 1.6, p.z + rz * 7 + fz * 1.5);
        look.set(p.x + fx * 1.5, p.y + 1.0, p.z + fz * 1.5);
        fov = 55;
        break;
      case 'first': {
        rigid = true;
        const by = bike.yaw, bfx = Math.sin(by), bfz = Math.cos(by);
        const cp = Math.cos(bike.pitch), sp = Math.sin(bike.pitch);
        want.set(p.x - bfx * 0.15 * cp, p.y + 1.62 + sp * 0.2 - bike.preload * 0.18, p.z - bfz * 0.15 * cp);
        look.set(want.x + bfx * 6 * cp, want.y - 1.2 + sp * 6, want.z + bfz * 6 * cp);
        fov = 78;
        break;
      }
      case 'chest': {
        rigid = true;
        const by = bike.yaw, bfx = Math.sin(by), bfz = Math.cos(by);
        const cp = Math.cos(bike.pitch), sp = Math.sin(bike.pitch);
        want.set(p.x - bfx * 0.05, p.y + 1.3 + sp * 0.15 - bike.preload * 0.15, p.z - bfz * 0.05);
        look.set(want.x + bfx * 5 * cp, want.y - 0.9 + sp * 5, want.z + bfz * 5 * cp);
        fov = 80;
        break;
      }
      case 'photo': {
        rigid = true;
        const ph = this.photo;
        const cy = Math.cos(ph.pitch);
        want.set(p.x + Math.sin(ph.yaw) * ph.dist * cy, p.y + 1 + Math.sin(ph.pitch) * ph.dist, p.z + Math.cos(ph.yaw) * ph.dist * cy);
        look.set(p.x, p.y + 0.9, p.z);
        fov = 50;
        break;
      }
      default:
        want.set(p.x - fx * 5.4, p.y + 2.35, p.z - fz * 5.4);
        look.set(p.x + fx * 3.5, p.y + 0.9, p.z + fz * 3.5);
    }
    // Keep the camera above the ground, and slide it toward the bike if a
    // bank or hillside is in the way.
    if (ground && !rigid) {
      for (let k = 0; k < 6; k++) {
        let blocked = false;
        for (const t of [0.35, 0.6, 0.85]) {
          const x = want.x + (look.x - want.x) * t * 0.6, z = want.z + (look.z - want.z) * t * 0.6;
          const y = want.y + (p.y + 1 - want.y) * t;
          if (ground.height(x, z) > y - 0.2) { blocked = true; break; }
        }
        if (!blocked) break;
        want.lerp(new THREE.Vector3(p.x, p.y + 2.2, p.z), 0.25);
      }
      const gh = ground.height(want.x, want.z);
      if (want.y < gh + 0.6) want.y = gh + 0.6;
    }
    if (!this.inited || rigid) { this.pos.copy(want); this.look.copy(look); this.inited = true; }
    else {
      const k = Math.min(1, dt * 6), kl = Math.min(1, dt * 10);
      this.pos.lerp(want, k);
      // Vertical follow is softer in the air so jumps read as height.
      this.look.lerp(look, kl);
    }
    cam.position.copy(this.pos);
    if (this.shake > 0) {
      this.shake = Math.max(0, this.shake - dt * 2.5);
      const s = this.shake * 0.12;
      cam.position.x += (Math.random() - 0.5) * s;
      cam.position.y += (Math.random() - 0.5) * s;
    }
    cam.lookAt(this.look);
    if (this.view === 'first' || this.view === 'chest') {
      cam.rotateZ(clamp(-bike.roll * 0.5, -0.4, 0.4));
    }
    cam.fov += (fov - cam.fov) * Math.min(1, dt * 3);
    cam.updateProjectionMatrix();
  }
}
