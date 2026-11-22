// Test drive: physics worker + vehicle visuals + chase/first-person camera + HUD + controls.
import * as THREE from 'three';
import type { World } from './world';
import type { PhysicsClient } from '../physics/client';
import { SNAP_HEADER, SNAP_PER_WHEEL, type SpawnInfo } from '../physics/protocol';
import { deserialize, type VehicleFile } from '../sim-core/vehicle-format';
import { buildVehicleMesh, type VehicleMesh } from '../render/vehicle-mesh';
import { heightAt } from '../sim-core/terrain';
import { DriveInput } from '../input/input';
import { h, toast, isTouch } from '../ui/dom';
import type { Telemetry } from '../sim-core/vehicle-sim';
import { wavesFor } from '../sim-core/waves';
import { CELL, partDef } from '../sim-core/parts';
import { partCenter } from '../sim-core/grid';

function haloTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,240,200,1)');
  gr.addColorStop(0.25, 'rgba(255,214,120,0.55)');
  gr.addColorStop(1, 'rgba(255,200,90,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

const VID = 1;

export class DriveSession {
  camera = new THREE.PerspectiveCamera(62, 1, 0.1, 6000);
  private vm: VehicleMesh;
  private info: SpawnInfo | null = null;
  private input = new DriveInput();
  private camMode: 'chase' | 'seat' = 'chase';
  private camPos = new THREE.Vector3();
  private camLook = new THREE.Vector3();
  private orbitYaw = 0;
  private orbitPitch = 0;
  private dragging: { x: number; y: number } | null = null;
  private pos = new THREE.Vector3();
  private quat = new THREE.Quaternion();
  private telem: Telemetry | null = null;
  private time = 0;
  private hud: HTMLElement;
  private els: Record<string, HTMLElement> = {};
  private seatLocal = new THREE.Vector3();
  private firstFrame = true;
  private seaKey = '';
  private storm = false;
  private halos: THREE.Sprite[] = [];
  private headlight = new THREE.SpotLight('#fff1cf', 0, 60, 0.55, 0.5, 1.2);
  onExit: () => void = () => {};

  constructor(private world: World, private physics: PhysicsClient, file: VehicleFile, private canvas: HTMLCanvasElement, overlay: HTMLElement) {
    const { grid } = deserialize(file);
    this.vm = buildVehicleMesh(grid, { separateWheels: true });
    this.world.scene.add(this.vm.group);
    const seat = [...grid.parts.values()].find((p) => p.type === 'helm');
    if (seat) this.seatLocal.set((seat.pos[0] + 1.5) * 0.25, (seat.pos[1] + 5.2) * 0.25, (seat.pos[2] + 1.6) * 0.25);
    // Lamp halos (additive sprites) and one real headlight for the player's vehicle.
    const tex = haloTexture();
    for (const p of grid.parts.values()) {
      if (partDef(p.type).sim?.kind !== 'lamp') continue;
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
      const c = partCenter(p);
      sp.position.set(c[0] * CELL, c[1] * CELL, c[2] * CELL - 0.05);
      sp.visible = false;
      this.vm.group.add(sp);
      this.halos.push(sp);
    }
    if (this.halos.length) {
      const avg = this.halos.reduce((a, h2) => a.add(h2.position), new THREE.Vector3()).multiplyScalar(1 / this.halos.length);
      this.headlight.position.copy(avg);
      this.headlight.target.position.copy(avg).add(new THREE.Vector3(0, -1.2, -12));
      this.vm.group.add(this.headlight, this.headlight.target);
    }
    this.physics.onSpawned = (info) => { if (info.id === VID) { this.info = info; if (info.inWater) toast('Launched at the slipway'); } };
    const p = this.world.terrain.pad;
    this.physics.send({ type: 'spawn', id: VID, file, at: { x: p.x, z: p.z, yaw: 0 } });
    this.physics.send({ type: 'pause', paused: false });
    this.input.attach();
    this.hud = this.buildHud(file.name);
    overlay.append(this.hud);
    canvas.addEventListener('pointerdown', this.pDown);
    window.addEventListener('pointermove', this.pMove);
    window.addEventListener('pointerup', this.pUp);
  }

  private pDown = (e: PointerEvent) => { if (e.pointerType === 'mouse') this.dragging = { x: e.clientX, y: e.clientY }; };
  private pMove = (e: PointerEvent) => {
    if (!this.dragging) return;
    this.orbitYaw -= (e.clientX - this.dragging.x) * 0.006;
    this.orbitPitch = THREE.MathUtils.clamp(this.orbitPitch + (e.clientY - this.dragging.y) * 0.004, -0.3, 1.0);
    this.dragging = { x: e.clientX, y: e.clientY };
  };
  private pUp = () => { this.dragging = null; };

  dispose() {
    this.physics.send({ type: 'remove', id: VID });
    this.physics.send({ type: 'pause', paused: true });
    this.physics.forget(VID);
    this.world.scene.remove(this.vm.group);
    this.vm.dispose();
    this.input.detach();
    this.hud.remove();
    this.canvas.removeEventListener('pointerdown', this.pDown);
    window.removeEventListener('pointermove', this.pMove);
    window.removeEventListener('pointerup', this.pUp);
  }

  resize(w: number, hh: number) { this.camera.aspect = w / hh; this.camera.updateProjectionMatrix(); }

  update(dt: number) {
    this.time += dt;
    const edges = this.input.takePressed();
    const controls = this.input.poll(dt, edges);
    this.physics.send({ type: 'controls', id: VID, controls });
    if (edges.has('reset')) { this.physics.send({ type: 'reset', id: VID }); toast('Back on its wheels'); }
    if (edges.has('camera')) { this.camMode = this.camMode === 'chase' ? 'seat' : 'chase'; this.orbitYaw = 0; this.orbitPitch = 0; }
    if (edges.has('ignition')) this.physics.send({ type: 'ignition', id: VID, on: !(this.telem?.running ?? false) });
    if (edges.has('yard')) { this.onExit(); return; }

    const s = this.physics.get(VID);
    if (s) {
      const a = this.physics.alpha();
      const c = s.curr.data, p = s.prev?.data ?? c;
      this.pos.set(p[0] + (c[0] - p[0]) * a, p[1] + (c[1] - p[1]) * a, p[2] + (c[2] - p[2]) * a);
      const qa = new THREE.Quaternion(p[3], p[4], p[5], p[6]);
      const qb = new THREE.Quaternion(c[3], c[4], c[5], c[6]);
      this.quat.copy(qa).slerp(qb, a);
      this.vm.group.position.copy(this.pos);
      this.vm.group.quaternion.copy(this.quat);
      this.telem = s.curr.telem;
      if (this.info) {
        this.info.wheels.forEach((w, i) => {
          const obj = this.vm.wheels.get(w.partId);
          if (!obj) return;
          const o = SNAP_HEADER + i * SNAP_PER_WHEEL;
          const comp = p[o] + (c[o] - p[o]) * a;
          obj.position.set(w.center[0], w.center[1] - w.travel * 0.5 + comp, w.center[2]);
          obj.rotation.set(0, -c[o + 1], 0);
          obj.children[0].rotation.x = -c[o + 2];
        });
      }
      const lamps = this.vm.group.getObjectByName('lamps') as THREE.Mesh | undefined;
      if (lamps) (lamps.material as THREE.MeshBasicMaterial).color.setScalar(this.telem.lights ? 1.6 : 0.55);
    }
    // Keep the shader's waves identical to the worker's.
    const sea = this.physics.sea;
    const key = `${sea.level.toFixed(3)}/${sea.windDir.toFixed(3)}`;
    if (key !== this.seaKey) { this.seaKey = key; this.world.setWaves(wavesFor(sea)); }
    if (this.storm && this.time % 0.5 < dt) this.physics.send({ type: 'sea', level: Math.min(1, sea.level + 0.006) });
    const lit = !!this.telem?.lights;
    for (const h2 of this.halos) { h2.visible = lit; const s2 = 0.5 + this.world.night * 1.6; h2.scale.set(s2, s2, s2); }
    this.headlight.intensity = lit ? 40 + this.world.night * 120 : 0;
    this.updateCamera(dt);
    this.world.update(dt, this.physics.renderTime(), this.pos, this.camera.position);
    this.updateHud();
  }

  private updateCamera(dt: number) {
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(this.quat);
    const flat = new THREE.Vector3(fwd.x, 0, fwd.z);
    if (flat.lengthSq() < 1e-4) flat.set(0, 0, -1);
    flat.normalize();
    if (this.camMode === 'seat') {
      const eye = this.seatLocal.clone().applyQuaternion(this.quat).add(this.pos);
      this.camera.position.copy(eye);
      const look = new THREE.Vector3(0, -0.12, -1).applyAxisAngle(new THREE.Vector3(0, 1, 0), this.orbitYaw).applyQuaternion(this.quat);
      this.camera.up.set(0, 1, 0).applyQuaternion(this.quat);
      this.camera.lookAt(eye.add(look));
      return;
    }
    this.camera.up.set(0, 1, 0);
    if (!this.dragging) { this.orbitYaw *= Math.exp(-dt * 1.2); this.orbitPitch *= Math.exp(-dt * 1.2); }
    const speed = Math.abs(this.telem?.speed ?? 0);
    const dist = 7.5 + Math.min(speed * 0.08, 3);
    const back = flat.clone().multiplyScalar(-dist).applyAxisAngle(new THREE.Vector3(0, 1, 0), this.orbitYaw);
    const target = this.pos.clone().add(back);
    target.y += 2.6 + this.orbitPitch * 6;
    const g = heightAt(this.world.terrain, target.x, target.z);
    target.y = Math.max(target.y, Math.max(g, 0) + 1.2);
    const k = this.firstFrame ? 1 : 1 - Math.exp(-dt * 5);
    this.camPos.lerp(target, k);
    this.camLook.lerp(this.pos.clone().add(new THREE.Vector3(0, 1.0, 0)), this.firstFrame ? 1 : 1 - Math.exp(-dt * 12));
    this.firstFrame = false;
    this.camera.position.copy(this.camPos);
    this.camera.lookAt(this.camLook);
  }

  private buildHud(name: string): HTMLElement {
    const e = this.els;
    e.speed = h('div', { class: 'speed mono' }, '0');
    e.gear = h('div', { class: 'gear mono' }, 'N');
    e.rpmFill = h('span', { class: 'meter-fill' });
    e.fuelFill = h('span', { class: 'meter-fill' });
    e.battFill = h('span', { class: 'meter-fill' });
    e.status = h('div', { class: 'hud-status mono' });
    e.perf = h('div', { class: 'perf mono' });
    const card = h('div', { class: 'hud-card sheet' },
      h('div', { class: 'hud-row' }, h('div', {}, e.speed, h('small', {}, 'km/h')), h('div', {}, e.gear, h('small', {}, 'gear'))),
      h('div', { class: 'meter slim' }, h('span', { class: 'meter-label' }, 'Revs'), h('span', { class: 'meter-bar' }, e.rpmFill)),
      h('div', { class: 'meter slim' }, h('span', { class: 'meter-label' }, 'Fuel'), h('span', { class: 'meter-bar' }, e.fuelFill)),
      h('div', { class: 'meter slim' }, h('span', { class: 'meter-label' }, 'Cell'), h('span', { class: 'meter-bar' }, e.battFill)),
      e.status);
    const keys = h('div', { class: 'help sheet' },
      h('div', { class: 'sheet-title' }, name),
      h('dl', {},
        ...[['W / S', 'Throttle / brake, reverse'], ['A / D', 'Steer'], ['Space', 'Handbrake'], ['Q / E', 'Shift (manual box)'], ['R', 'Reset upright'], ['C', 'Chase / seat camera'], ['L', 'Lamps'], ['I', 'Ignition'], ['Esc', 'Back to Yard']]
          .flatMap(([k, v]) => [h('dt', {}, h('kbd', {}, k)), h('dd', {}, v)])),
      h('p', { class: 'hint' }, 'Gamepad: RT/LT drive, stick steers, A handbrake, LB/RB shift, Y camera, X reset.'));
    const top = h('div', { class: 'drive-top' },
      h('button', { class: 'btn', onclick: () => this.onExit() }, '◀ Yard'),
      h('button', { class: 'btn', onclick: () => this.input.pressTouch('reset') }, 'Reset'),
      h('button', { class: 'btn', onclick: () => this.input.pressTouch('camera') }, 'Camera'),
      h('button', { class: 'btn', onclick: () => this.input.pressTouch('lights') }, 'Lamps'),
      e.perf);
    e.sea = h('span', { class: 'mono' }, '');
    e.clock = h('span', { class: 'mono' }, '');
    e.stormBtn = h('button', { class: 'btn sm', title: 'Let the sea build steadily toward a full storm', onclick: () => { this.storm = !this.storm; e.stormBtn.classList.toggle('primary', this.storm); toast(this.storm ? 'Storm building…' : 'Storm paused'); } }, 'Storm');
    const weather = h('div', { class: 'weather sheet' },
      h('div', { class: 'row' }, h('span', { class: 'label' }, 'Sea state'),
        h('button', { class: 'btn sm', 'aria-label': 'Calmer sea', onclick: () => this.physics.send({ type: 'sea', level: this.physics.sea.level - 0.15 }) }, '−'),
        e.sea,
        h('button', { class: 'btn sm', 'aria-label': 'Rougher sea', onclick: () => this.physics.send({ type: 'sea', level: this.physics.sea.level + 0.15 }) }, '+'),
        e.stormBtn),
      h('div', { class: 'row' }, h('span', { class: 'label' }, 'Time'),
        h('button', { class: 'btn sm', onclick: () => { this.world.timeOfDay = (this.world.timeOfDay + 3) % 24; } }, '+3 h'),
        e.clock,
        h('button', { class: 'btn sm', onclick: (ev: Event) => { this.world.cycle = !this.world.cycle; (ev.target as HTMLElement).textContent = this.world.cycle ? 'Pause' : 'Run'; } }, 'Pause')));
    const root = h('div', { class: 'drive-ui' }, top, card, keys, weather);
    if (isTouch() || new URLSearchParams(location.search).has('touch')) { root.append(this.buildTouch()); root.classList.add('touch'); }
    return root;
  }

  private buildTouch(): HTMLElement {
    const hold = (label: string, cls: string, on: () => void, off: () => void) => {
      const b = h('button', { class: 'touch-btn ' + cls }, label);
      b.addEventListener('pointerdown', (ev) => { ev.preventDefault(); b.setPointerCapture(ev.pointerId); b.classList.add('down'); on(); });
      const up = () => { b.classList.remove('down'); off(); };
      b.addEventListener('pointerup', up);
      b.addEventListener('pointercancel', up);
      return b;
    };
    // Left: a steering pad you slide across; right: gas/brake pedals.
    const pad = h('div', { class: 'touch-steer', 'aria-label': 'Steering' }, h('span', {}, '◀'), h('span', {}, '▶'));
    const steerFrom = (ev: PointerEvent) => {
      const r = pad.getBoundingClientRect();
      const t = ((ev.clientX - r.left) / r.width) * 2 - 1;
      this.input.setTouch({ steer: Math.max(-1, Math.min(1, t * 1.4)) });
    };
    pad.addEventListener('pointerdown', (ev) => { ev.preventDefault(); pad.setPointerCapture(ev.pointerId); steerFrom(ev); });
    pad.addEventListener('pointermove', (ev) => { if (pad.hasPointerCapture(ev.pointerId)) steerFrom(ev); });
    const release = () => this.input.setTouch({ steer: 0 });
    pad.addEventListener('pointerup', release);
    pad.addEventListener('pointercancel', release);
    return h('div', { class: 'touch-layer' }, pad,
      h('div', { class: 'touch-pedals' },
        hold('BRAKE', 'brake', () => this.input.setTouch({ brake: 1 }), () => this.input.setTouch({ brake: 0 })),
        hold('GAS', 'gas', () => this.input.setTouch({ throttle: 1 }), () => this.input.setTouch({ throttle: 0 }))),
      hold('HAND', 'hand', () => this.input.setTouch({ handbrake: true }), () => this.input.setTouch({ handbrake: false })));
  }

  fps = 60;
  private updateHud() {
    const t = this.telem;
    if (!t) return;
    const e = this.els;
    e.speed.textContent = Math.abs(t.speed * 3.6).toFixed(0);
    e.gear.textContent = t.gear === -1 ? 'R' : t.gear === 0 ? 'N' : String(t.gear);
    const maxRps = 18;
    e.rpmFill.style.width = Math.min(100, (t.rps / maxRps) * 100) + '%';
    e.rpmFill.classList.toggle('over', t.rps > maxRps * 0.92);
    e.fuelFill.style.width = (t.fuelMax ? (t.fuel / t.fuelMax) * 100 : 0) + '%';
    e.battFill.style.width = t.battery * 100 + '%';
    const afloat = t.submerged > 0.01;
    e.status.textContent = !t.running ? (t.fuel <= 0 ? 'OUT OF FUEL' : 'ENGINE OFF · press I')
      : t.flooded > 0.05 ? `SWAMPING ${(t.flooded * 100).toFixed(0)}%`
      : afloat ? `AFLOAT · draft ${(t.submerged * 100).toFixed(0)}%` : this.info && !this.info.wheels.length ? 'AGROUND' : t.grounded === 0 ? 'AIRBORNE' : '';
    const lvl = this.physics.sea.level;
    e.sea.textContent = `${(lvl * 100).toFixed(0).padStart(3)}% ${lvl < 0.2 ? 'calm' : lvl < 0.45 ? 'choppy' : lvl < 0.75 ? 'rough' : 'storm'}`;
    const hh = Math.floor(this.world.timeOfDay), mm = Math.floor((this.world.timeOfDay % 1) * 60);
    e.clock.textContent = `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
    e.perf.textContent = `${this.fps.toFixed(0)} fps · phys ${this.physics.stepMs.toFixed(2)} ms${this.physics.dilation < 0.99 ? ` · slow-mo ${(this.physics.dilation * 100).toFixed(0)}%` : ''}`;
  }
}
