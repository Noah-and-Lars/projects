import * as THREE from 'three';
import { verticalFov } from '../progress';
import type { CameraOverride, Game } from '../game';
import type { V3 } from '../../sim/vec';
import { el, esc, setHtml, show } from './dom';

/**
 * Top-down site map (Tab): takes over the camera with a high view straight down over level.bounds,
 * DOM markers projected on top. The sim keeps running; tools are disabled while it is open.
 */
export class MapView {
  readonly root = el('div', 'ws-map hide');
  private layer = el('div');
  open = false;
  private cam = new THREE.PerspectiveCamera();
  private override: CameraOverride | null = null;
  private savedTools = true;
  private savedFog: { near: number; far: number } | null = null;

  constructor() {
    this.root.append(this.layer);
    this.root.insertAdjacentHTML('beforeend',
      '<div class="head">Site map · Tab to close</div>' +
      '<div class="legend"><span><i class="req"></i>Required</span><span><i class="opt"></i>Bonus</span>' +
      '<span><i class="esc"></i>Escape van</span><span><i class="alm"></i>Alarm box</span><span><i class="me"></i>You</span></div>');
  }

  setOpen(game: Game, on: boolean): void {
    if (on === this.open) return;
    this.open = on;
    show(this.root, on);
    const fog = game.renderer.scene.fog as THREE.Fog | null;
    if (on) {
      this.savedTools = game.toolsEnabled;
      game.toolsEnabled = false;
      if (fog && 'far' in fog) { this.savedFog = { near: fog.near, far: fog.far }; fog.near = 400; fog.far = 1200; }
    } else {
      game.toolsEnabled = this.savedTools;
      if (fog && this.savedFog) { fog.near = this.savedFog.near; fog.far = this.savedFog.far; }
      this.savedFog = null;
      if (game.cameraOverride === this.override) game.cameraOverride = null;
      this.override = null;
    }
  }

  /** per frame while open: camera + markers */
  update(game: Game): void {
    if (!this.open) return;
    const b = game.level.bounds;
    const cx = (b.min.x + b.max.x) / 2, cz = (b.min.z + b.max.z) / 2;
    const hx = (b.max.x - b.min.x) / 2, hz = (b.max.z - b.min.z) / 2;
    const w = window.innerWidth || 640, h = window.innerHeight || 360;
    const aspect = w / h;
    const fov = verticalFov(game.fov, aspect);
    const t = Math.tan((fov * Math.PI) / 360);
    const ground = Math.max(b.min.y, Math.min(0, game.level.spawn.y));
    const height = (Math.max(hz, hx / aspect) / t) * 1.06 + ground;
    this.override = { eye: { x: cx, y: height, z: cz }, yaw: 0, pitch: -Math.PI / 2 };
    game.cameraOverride = this.override;
    // projection camera identical to what the renderer will use
    const c = this.cam;
    c.fov = fov; c.aspect = aspect; c.near = 0.05; c.far = 2000;
    c.position.set(cx, height, cz);
    c.rotation.set(-Math.PI / 2, 0, 0, 'YXZ');
    c.updateProjectionMatrix(); c.updateMatrixWorld(true);
    const v = new THREE.Vector3();
    const proj = (p: V3) => {
      v.set(p.x, p.y, p.z).project(c);
      return { x: (v.x * 0.5 + 0.5) * w, y: (-v.y * 0.5 + 0.5) * h };
    };
    let html = '';
    const mk = (p: V3, inner: string, label = '', style = '') => {
      const s = proj(p);
      if (s.x < -20 || s.y < -20 || s.x > w + 20 || s.y > h + 20) return;
      html += `<div class="ws-mk" style="left:${s.x.toFixed(1)}px;top:${s.y.toFixed(1)}px;${style}">${inner}${label ? `<em>${esc(label)}</em>` : ''}</div>`;
    };
    const m = game.ext.mission?.current;
    if (m) {
      for (const k of m.markers()) {
        if (k.kind === 'alarm') mk(k.pos, '<i class="alm"></i>');
        else if (k.kind === 'zone') mk(k.pos, `<i class="zone${k.done ? ' done' : ''}"></i>`, k.name);
        else mk(k.pos, `<i class="${k.required ? 'req' : 'opt'}${k.done ? ' done' : ''}"></i>`, k.name);
      }
      mk(m.escapePos(), `<i class="esc${m.escapeOpen ? '' : ' closed'}"></i>`, m.escapeOpen ? 'Escape — open' : 'Escape');
      if (m.heli) mk(m.heli.pos, '<i class="heli"></i>', 'Security', `transform:translate(-50%,-50%) rotate(${(-m.heli.yaw).toFixed(3)}rad)`);
    }
    const ch = game.ext.challenge?.current;
    if (ch) {
      for (const k of ch.openCrates()) mk(k.pos, '<i class="req"></i>');
      if (ch.mode === 'snatch') mk(ch.escapePos(), `<i class="esc${ch.running && ch.cratesTaken > 0 ? '' : ' closed'}"></i>`, 'Clock out');
    }
    const p = game.player;
    const s = proj(p.pos);
    html += `<div class="ws-mk" style="left:${s.x.toFixed(1)}px;top:${s.y.toFixed(1)}px;transform:translate(-50%,-50%) rotate(${(-p.yaw).toFixed(3)}rad)"><i class="me"></i></div>`;
    setHtml(this.layer, html);
  }
}
