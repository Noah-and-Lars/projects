import * as THREE from 'three';

/**
 * First-person tool view models: small blocky meshes (a few boxes each, original designs) parented
 * to the camera. Animated from `tool.anim` (1 -> 0 after use), `tool.active` (continuous tools),
 * player speed / stride (bob) and look motion (sway). Presentation only.
 */

type BoxSpec = [w: number, h: number, d: number, x: number, y: number, z: number, color: number, opts?: { glow?: boolean; rx?: number; ry?: number; rz?: number; name?: string }];

const matCache = new Map<string, THREE.Material>();
function mat(color: number, glow = false): THREE.Material {
  const k = color + (glow ? 'g' : '');
  let m = matCache.get(k);
  if (!m) {
    m = glow ? new THREE.MeshBasicMaterial({ color, fog: false }) : new THREE.MeshLambertMaterial({ color, fog: false });
    matCache.set(k, m);
  }
  return m;
}
const unitBox = new THREE.BoxGeometry(1, 1, 1);

function build(specs: BoxSpec[]): THREE.Group {
  const g = new THREE.Group();
  for (const [w, h, d, x, y, z, color, o] of specs) {
    const m = new THREE.Mesh(unitBox, mat(color, o?.glow));
    m.scale.set(w, h, d);
    m.position.set(x, y, z);
    if (o) { m.rotation.set(o.rx ?? 0, o.ry ?? 0, o.rz ?? 0); if (o.name) m.name = o.name; }
    if (m.name === 'muzzle') m.visible = false;
    m.castShadow = false; m.receiveShadow = false;
    m.renderOrder = 10;
    g.add(m);
  }
  return g;
}

// palette (own)
const STEEL = 0x3b4148, STEEL_L = 0x7d8790, WOOD = 0x8a5a2b, WOOD_L = 0xb07a40, BLACK = 0x1c1d20, RED = 0xc4291c;
const YELLOW = 0xe8c21a, ORANGE = 0xe8731a, OLIVE = 0x4f5a2e, BRASS = 0xb8923a, WHITE = 0xe8e6df, BLUE = 0x2f5f9a;

/** model definitions; each model's muzzle (if any) is a child named 'muzzle' */
const MODELS: Record<string, () => THREE.Group> = {
  sledge: () => {
    const g = build([
      [0.035, 0.52, 0.035, 0, 0.12, 0, WOOD],
      [0.045, 0.06, 0.045, 0, -0.12, 0, BLACK],
      [0.1, 0.1, 0.22, 0, 0.38, -0.04, STEEL],
      [0.106, 0.03, 0.06, 0, 0.38, -0.15, STEEL_L],
    ]);
    g.rotation.set(-0.55, 0, -0.3);
    return wrap(g, 0.0, -0.2, 0.0);
  },
  spray: () => wrap(build([
    [0.06, 0.15, 0.06, 0, 0, 0, YELLOW],
    [0.062, 0.05, 0.062, 0, -0.01, 0, WHITE],
    [0.045, 0.03, 0.045, 0, 0.09, 0, BLACK],
    [0.02, 0.02, 0.03, 0, 0.11, -0.02, RED],
    [0.01, 0.01, 0.01, 0, 0.11, -0.04, BLACK, { name: 'muzzle' }],
  ]), 0, -0.02, 0),
  extinguisher: () => wrap(build([
    [0.1, 0.26, 0.1, 0, -0.06, 0.04, RED],
    [0.104, 0.04, 0.104, 0, 0.0, 0.04, WHITE],
    [0.05, 0.05, 0.05, 0, 0.1, 0.04, BLACK],
    [0.03, 0.02, 0.1, 0.0, 0.13, 0.0, STEEL_L, { rx: 0.25 }],
    [0.028, 0.028, 0.16, -0.04, 0.06, -0.08, BLACK],
    [0.036, 0.036, 0.05, -0.04, 0.06, -0.17, BLACK],
    [0.01, 0.01, 0.01, -0.04, 0.06, -0.2, BLACK, { name: 'muzzle' }],
  ]), 0, -0.04, 0),
  blowtorch: () => wrap(build([
    [0.07, 0.17, 0.07, 0, -0.05, 0.04, BLUE],
    [0.072, 0.03, 0.072, 0, 0.02, 0.04, WHITE],
    [0.03, 0.04, 0.03, 0, 0.06, 0.04, BRASS],
    [0.022, 0.022, 0.16, 0, 0.08, -0.04, BRASS],
    [0.03, 0.03, 0.03, 0, 0.08, -0.125, STEEL_L],
    [0.018, 0.018, 0.07, 0, 0.08, -0.17, 0x6fb7ff, { glow: true, name: 'flame' }],
    [0.012, 0.012, 0.05, 0, 0.08, -0.215, 0xffd27a, { glow: true, name: 'flame2' }],
    [0.01, 0.01, 0.01, 0, 0.08, -0.23, BLACK, { name: 'muzzle' }],
  ]), 0, -0.03, 0),
  pistol: () => wrap(build([
    [0.038, 0.045, 0.17, 0, 0.02, -0.06, STEEL],
    [0.034, 0.03, 0.14, 0, -0.005, -0.05, BLACK],
    [0.034, 0.1, 0.045, 0, -0.05, 0.01, BLACK, { rx: 0.25 }],
    [0.012, 0.012, 0.01, 0, 0.048, -0.135, STEEL_L],
    [0.01, 0.01, 0.01, 0, 0.02, -0.15, BLACK, { name: 'muzzle' }],
  ]), 0, 0.0, 0),
  shotgun: () => wrap(build([
    [0.032, 0.032, 0.5, 0, 0.025, -0.25, STEEL],
    [0.03, 0.026, 0.42, 0, -0.008, -0.22, BLACK],
    [0.05, 0.045, 0.13, 0, -0.01, -0.27, WOOD_L],
    [0.05, 0.065, 0.15, 0, 0.0, 0.0, STEEL],
    [0.045, 0.075, 0.22, 0, -0.04, 0.16, WOOD, { rx: 0.12 }],
    [0.01, 0.01, 0.01, 0, 0.025, -0.51, BLACK, { name: 'muzzle' }],
  ]), 0, -0.01, 0.06),
  rocket: () => wrap(build([
    [0.1, 0.1, 0.62, 0, 0.04, -0.12, OLIVE],
    [0.11, 0.11, 0.04, 0, 0.04, -0.42, BLACK],
    [0.11, 0.11, 0.04, 0, 0.04, 0.18, BLACK],
    [0.035, 0.09, 0.05, 0, -0.06, -0.04, BLACK, { rx: 0.2 }],
    [0.02, 0.05, 0.06, 0.04, 0.11, -0.08, STEEL],
    [0.06, 0.06, 0.06, 0, 0.04, -0.43, RED, { name: 'warhead' }],
    [0.01, 0.01, 0.01, 0, 0.04, -0.46, BLACK, { name: 'muzzle' }],
  ]), 0.07, 0.01, 0.02),
  plank: () => wrap(build([
    [0.14, 0.025, 0.55, 0, 0, -0.15, WOOD_L, { rz: 0.15 }],
    [0.142, 0.026, 0.02, 0, 0, -0.3, WOOD, { rz: 0.15 }],
    [0.142, 0.026, 0.02, 0, 0, 0.02, WOOD, { rz: 0.15 }],
  ]), -0.02, -0.05, 0),
  cable: () => {
    const specs: BoxSpec[] = [];
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      specs.push([0.066, 0.024, 0.024, Math.cos(a) * 0.075, Math.sin(a) * 0.075, 0, i % 2 ? ORANGE : 0xc85f12, { rz: a + Math.PI / 2 }]);
    }
    specs.push([0.02, 0.02, 0.12, 0.0, -0.075, -0.07, STEEL_L]);
    specs.push([0.03, 0.012, 0.03, 0.0, -0.075, -0.14, STEEL]);
    const g = build(specs);
    g.rotation.y = 0.5;
    return wrap(g, 0, -0.02, 0);
  },
  pipebomb: () => wrap(build([
    [0.05, 0.05, 0.17, 0, 0, -0.03, STEEL_L],
    [0.058, 0.058, 0.03, 0, 0, -0.115, STEEL],
    [0.058, 0.058, 0.03, 0, 0, 0.055, STEEL],
    [0.006, 0.006, 0.05, 0, 0.03, 0.08, RED, { rx: 0.6 }],
  ]), 0, -0.01, 0),
  bomb: () => wrap(build([
    [0.13, 0.07, 0.13, 0, 0, -0.03, 0x2b2e33],
    [0.132, 0.02, 0.132, 0, 0.0, -0.03, YELLOW],
    [0.06, 0.03, 0.06, 0, 0.05, -0.03, STEEL],
    [0.02, 0.012, 0.02, 0.02, 0.07, -0.05, 0xff3020, { glow: true, name: 'light' }],
  ]), 0, -0.03, 0),
  rifle: () => wrap(build([
    [0.03, 0.03, 0.56, 0, 0.03, -0.3, STEEL],
    [0.045, 0.05, 0.2, 0, 0.01, -0.04, STEEL],
    [0.034, 0.034, 0.16, 0, 0.085, -0.06, BLACK],
    [0.044, 0.044, 0.03, 0, 0.085, -0.15, BLACK],
    [0.05, 0.06, 0.42, 0, -0.02, -0.06, WOOD, { rx: 0.03 }],
    [0.05, 0.08, 0.16, 0, -0.04, 0.16, WOOD, { rx: 0.12 }],
    [0.01, 0.01, 0.01, 0, 0.03, -0.58, BLACK, { name: 'muzzle' }],
  ]), 0, -0.01, 0.05),
  leafblower: () => wrap(build([
    [0.12, 0.12, 0.16, 0, -0.02, 0.04, ORANGE],
    [0.1, 0.03, 0.1, 0, 0.055, 0.04, BLACK],
    [0.05, 0.05, 0.36, 0.0, -0.03, -0.2, 0x8a8f96],
    [0.07, 0.03, 0.05, 0.0, -0.03, -0.39, 0x8a8f96],
    [0.01, 0.01, 0.01, 0, -0.03, -0.42, BLACK, { name: 'muzzle' }],
  ]), 0, -0.04, 0),
  nitro: () => wrap(build([
    [0.07, 0.13, 0.07, 0, 0, -0.02, RED],
    [0.072, 0.03, 0.072, 0, 0.0, -0.02, WHITE],
    [0.04, 0.03, 0.04, 0, 0.08, -0.02, STEEL_L],
  ]), 0, -0.02, 0),
  // booster can: squat red can, white band, dark nozzle pointing up/back, yellow fuse tab
  booster: () => {
    const g = build([
      [0.09, 0.12, 0.09, 0, 0, -0.02, 0xb8261a],
      [0.092, 0.025, 0.092, 0, 0.01, -0.02, WHITE],
      [0.05, 0.035, 0.05, 0, 0.075, -0.02, BLACK],
      [0.03, 0.02, 0.03, 0, 0.1, -0.02, STEEL],
      [0.02, 0.04, 0.008, 0.035, -0.03, -0.068, YELLOW],
    ]);
    g.rotation.set(0.35, 0, 0.2);
    return wrap(g, 0, -0.02, 0);
  },
};

function wrap(inner: THREE.Group, x: number, y: number, z: number): THREE.Group {
  const g = new THREE.Group();
  inner.position.set(x, y, z);
  g.add(inner);
  return g;
}

export interface ViewModelState {
  toolId: string;
  /** tool.anim 1 -> 0 */
  anim: number;
  active: boolean;
  /** remaining ammo (Infinity = unlimited) — throwables hide when 0 */
  ammo: number;
  /** horizontal player speed m/s */
  speed: number;
  /** walked distance (head bob phase) */
  stride: number;
  yaw: number;
  pitch: number;
  visible: boolean;
  /** holding something with grab: lower the tool */
  grabbing: boolean;
  grounded: boolean;
  /** sim time in seconds (tool switch animation runs on sim time so it also works when frames are rare) */
  simTime: number;
}

const THROWN = new Set(['pipebomb', 'bomb', 'nitro', 'plank', 'booster']);
const GUNS = new Set(['pistol', 'shotgun', 'rocket', 'rifle']);

export class ViewModels {
  /** child of the camera */
  readonly root = new THREE.Group();
  private models = new Map<string, THREE.Group>();
  private current = '';
  private switchT = 1;
  private switchAt = -10;
  private time = 0;
  private swayX = 0;
  private swayY = 0;
  private lastYaw = 0;
  private lastPitch = 0;
  private grabT = 0;
  /** base hand position in camera space */
  readonly hand = new THREE.Vector3(0.15, -0.14, -0.26);

  constructor(camera: THREE.Camera) {
    camera.add(this.root);
    this.root.position.copy(this.hand);
    this.root.scale.setScalar(0.85);
  }

  private model(id: string): THREE.Group | null {
    let m = this.models.get(id);
    if (!m) {
      const f = MODELS[id];
      if (!f) return null;
      m = f();
      m.visible = false;
      this.root.add(m);
      this.models.set(id, m);
    }
    return m;
  }

  /** a tool was selected at sim time `t` (drives the raise animation) */
  noteSwitch(t: number): void { this.switchAt = t; }

  /** world position of the current model's muzzle (or the hand) */
  muzzleWorld(out = new THREE.Vector3()): THREE.Vector3 {
    const m = this.models.get(this.current);
    const mz = m?.getObjectByName('muzzle');
    this.root.updateWorldMatrix(true, true);
    if (mz) return mz.getWorldPosition(out);
    return this.root.getWorldPosition(out);
  }

  update(s: ViewModelState, dt: number): void {
    this.time += dt;
    this.root.visible = s.visible;
    if (s.toolId !== this.current) {
      const old = this.models.get(this.current);
      if (old) old.visible = false;
      this.current = s.toolId;
    }
    const m = this.model(s.toolId);
    if (!m || !s.visible) return;
    m.visible = true;
    this.switchT = Math.min(1, Math.max(0, (s.simTime - this.switchAt) * 4));
    this.grabT += ((s.grabbing ? 1 : 0) - this.grabT) * Math.min(1, dt * 10);

    // look sway (lags behind camera rotation)
    let dyaw = s.yaw - this.lastYaw, dp = s.pitch - this.lastPitch;
    if (Math.abs(dyaw) > 1) dyaw = 0;
    this.lastYaw = s.yaw; this.lastPitch = s.pitch;
    this.swayX += (Math.max(-0.04, Math.min(0.04, dyaw * 0.4)) - this.swayX) * Math.min(1, dt * 8);
    this.swayY += (Math.max(-0.04, Math.min(0.04, -dp * 0.4)) - this.swayY) * Math.min(1, dt * 8);

    // walk bob
    const amt = s.grounded ? Math.min(1, s.speed / 5) : 0;
    const ph = s.stride * Math.PI * 1.35;
    const bx = Math.cos(ph) * 0.007 * amt;
    const by = -Math.abs(Math.sin(ph)) * 0.009 * amt + Math.sin(this.time * 1.6) * 0.0018;

    const a = s.anim;
    const sw = 1 - this.switchT;
    const p = this.root.position;
    p.set(this.hand.x + bx + this.swayX, this.hand.y + by + this.swayY - sw * sw * 0.25 - this.grabT * 0.12, this.hand.z);
    const r = this.root.rotation;
    r.set(sw * -0.6 - this.grabT * 0.4, 0, 0);
    let ox = 0, oy = 0, oz = 0, rx = 0;
    const id = s.toolId;
    if (id === 'sledge') {
      // heavy swing driven by the sim's swing clock (anim = 1 - t/48, impact at t = 15):
      // haul it back over the shoulder, hang for a beat, whip it down, stick on impact, drag it back up
      if (a > 0) {
        const t = (1 - a) * 48;
        const ease = (u: number) => u * u * (3 - 2 * u);
        let ang: number, fwd: number, lift: number, side = 0;
        if (t < 9) { const u = ease(t / 9); ang = 1.05 * u; fwd = 0.07 * u; lift = 0.07 * u; side = 0.03 * u; }        // haul back
        else if (t < 12) { ang = 1.05 + (t - 9) * 0.015; fwd = 0.07; lift = 0.07; side = 0.03; }                    // hang
        else if (t < 15) { const u = (t - 12) / 3; const q = u * u * u; ang = 1.1 - 2.3 * q; fwd = 0.07 - 0.27 * q; lift = 0.07 - 0.02 * q; side = 0.03 * (1 - q); } // whip
        else if (t < 23) { const j = Math.sin(t * 11) * 0.035 * (23 - t) / 8; ang = -1.2 + j; fwd = -0.2; lift = 0.05 + j * 0.3; }  // stick + judder
        else { const u = ease((t - 23) / 25); ang = -1.2 * (1 - u); fwd = -0.2 * (1 - u); lift = 0.05 * (1 - u) - Math.sin(u * Math.PI) * 0.03; } // drag back
        rx = ang; oz = fwd; oy = lift; ox = side;
      }
    } else if (GUNS.has(id)) {
      const k = a * a;
      const big = id === 'pistol' ? 1 : id === 'shotgun' || id === 'rifle' ? 1.6 : 1.3;
      oz = k * 0.05 * big;
      rx = k * 0.3 * big;
      const wh = m.getObjectByName('warhead');
      if (wh) wh.visible = a < 0.05 && s.ammo > 0;
    } else if (THROWN.has(id)) {
      // swing out then come back up from below
      if (a > 0) {
        const k = a > 0.6 ? (1 - a) / 0.4 : a / 0.6;
        oz = -k * 0.15; oy = k * 0.04;
        if (a < 0.6) oy = -(a / 0.6) * 0.2;
      }
    } else if (s.active) {
      // continuous: small shake
      ox = (Math.random() - 0.5) * 0.003; oy = (Math.random() - 0.5) * 0.003;
      oz = 0.01;
    }
    m.position.set(ox, oy, oz);
    m.rotation.set(rx, 0, 0);
    // hide used-up consumables
    if (THROWN.has(id)) m.visible = s.ammo > 0 || a > 0.6;
    // blowtorch flame
    const fl = m.getObjectByName('flame'), fl2 = m.getObjectByName('flame2');
    if (fl) fl.visible = s.active;
    if (fl2) { fl2.visible = s.active; fl2.scale.z = 0.05 * (0.7 + Math.random() * 0.6); }
    const light = m.getObjectByName('light');
    if (light) light.visible = Math.sin(this.time * 9) > 0;
  }
}

export const VIEW_MODEL_IDS = Object.keys(MODELS);
