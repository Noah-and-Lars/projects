import * as THREE from 'three';
import type { LevelInfo } from '../sim/levels/types';
import type { Sim, SimEvent } from '../sim/sim';
import type { V3 } from '../sim/vec';
import { BodyViews, setMeshInflate } from './bodyViews';
import { LampLights } from './lamps';
import { ChipParticles } from './particles';
import { PostFX } from './post';
import { SKY_PRESETS, Sky, type SkyPreset, type TimeOfDay } from './sky';
import { gpuTrace } from './traceDebug';
import { VoxelVolumes } from './volumes';
import { disposeVoxelMaterials, makeLookShared, makeVoxelMaterials, patchForeignMaterial, type LookConfig, type VoxelMaterials } from './worldMaterial';

export type Quality = 'low' | 'medium' | 'high';
export type { TimeOfDay } from './sky';

interface Tier {
  volumes: boolean;
  sunTaps: number; sunSteps: number;
  coneMax: number; coneSteps: number;
  pointShadows: boolean;
  /** shadow map: size, half extent (m) */
  shadowSize: number; shadowExtent: number;
  bloom: boolean; msaa: number; fxaa: boolean;
  lamps: number;
}

/**
 * low    : classic shadow map for everything + baked vertex AO (no volumes, no bloom)
 * medium : traced hard sun + face AO + short cone AO + traced lamp shadows, small shadow map for dynamic things, bloom, FXAA
 * high   : 4-tap soft sun, long cones, bigger dynamic shadow map, MSAA + FXAA
 */
const TIERS: Record<Quality, Tier> = {
  low: { volumes: false, sunTaps: 1, sunSteps: 0, coneMax: 0, coneSteps: 0, pointShadows: false, shadowSize: 2048, shadowExtent: 34, bloom: false, msaa: 0, fxaa: true, lamps: 3 },
  medium: { volumes: true, sunTaps: 1, sunSteps: 192, coneMax: 32, coneSteps: 5, pointShadows: true, shadowSize: 1024, shadowExtent: 14, bloom: true, msaa: 0, fxaa: true, lamps: 6 },
  high: { volumes: true, sunTaps: 4, sunSteps: 320, coneMax: 96, coneSteps: 8, pointShadows: true, shadowSize: 2048, shadowExtent: 18, bloom: true, msaa: 4, fxaa: true, lamps: 8 },
};

const _v = new THREE.Vector3(), _r = new THREE.Vector3(), _u = new THREE.Vector3();

export class Renderer {
  readonly three: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(75, 16 / 9, 0.05, 600);
  readonly bodies: BodyViews;
  readonly chips = new ChipParticles();
  readonly sun = new THREE.DirectionalLight(0xfff2dd, 2.6);
  readonly hemi = new THREE.HemisphereLight(0xbfd8ff, 0x8a7f6a, 1.1);
  readonly sky = new Sky();
  readonly lamps = new LampLights();
  readonly post: PostFX;
  /** uniforms shared by all volume-lit materials */
  readonly look = makeLookShared();
  /** world occupancy volumes of the current level (null in the low tier / when unsupported) */
  volumes: VoxelVolumes | null = null;
  shake = 0;
  /** memory budget for the bit volume (bytes); bigger levels are cropped around the spawn point */
  maxVolumeBytes = 96 * 1024 * 1024;
  /** automatically give other lit materials in the scene (props, particles, view models) the traced lighting */
  adoptForeignMaterials = true;

  private materials: VoxelMaterials;
  private cfg: LookConfig;
  private frame = 0;
  private time = 0;
  private sunDir = new THREE.Vector3(-0.45, -0.75, -0.5).normalize();
  private levelSunDir = new THREE.Vector3(-0.45, -0.75, -0.5).normalize();
  private level: LevelInfo | null = null;
  private sim: Sim | null = null;
  private requested: Quality = 'medium';
  private effective: Quality = 'medium';
  private tod: TimeOfDay = 'sunset';
  private preset: SkyPreset = SKY_PRESETS.sunset;
  private resScale = 1;
  private basePixelRatio = 1;
  private fallbackPending = false;
  private volumesFailed = false;
  private adopted = new Set<THREE.Material>();

  constructor(readonly canvas: HTMLCanvasElement) {
    this.three = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
    this.basePixelRatio = Math.min(window.devicePixelRatio || 1, 2);
    this.three.setPixelRatio(this.basePixelRatio);
    this.three.shadowMap.enabled = true;
    this.three.shadowMap.type = THREE.PCFShadowMap;
    // only used when the post chain is unavailable (the post chain tone-maps itself)
    this.three.toneMapping = THREE.AgXToneMapping;
    this.three.toneMappingExposure = 1.0;
    this.post = new PostFX(this.three);
    this.scene.fog = new THREE.Fog(0xa9cbe8, 40, 260);
    this.cfg = this.makeConfig();
    this.materials = makeVoxelMaterials(this.look, this.cfg);
    this.bodies = new BodyViews(this.materials);
    this.scene.add(this.bodies.root, this.chips.mesh, this.hemi, this.sun, this.sun.target, this.sky.mesh, this.lamps.group);
    this.sun.castShadow = true;
    this.sun.shadow.camera.near = 1; this.sun.shadow.camera.far = 220;
    // a broken shader on some driver must not leave the world black: fall back to the plain tier
    this.three.debug.onShaderError = (gl, program, vs, fs) => {
      console.error('[render] shader error:', gl.getProgramInfoLog(program), gl.getShaderInfoLog(vs), gl.getShaderInfoLog(fs));
      if (this.effective !== 'low') { this.volumesFailed = true; this.fallbackPending = true; }
    };
    this.applyTimeOfDay();
    this.applyLook();
    this.resize();
  }

  // ------------------------------------------------------------------ public look API

  /** requested quality tier */
  get quality(): Quality { return this.requested; }
  /** tier actually in use (drops to 'low' when volumes / shaders are unavailable) */
  get effectiveQuality(): Quality { return this.effective; }
  get timeOfDay(): TimeOfDay { return this.tod; }
  get resolutionScale(): number { return this.resScale; }
  /** kept for older callers: the material of static world chunks */
  get worldMaterial(): THREE.MeshLambertMaterial { return this.materials.static; }

  setQuality(q: Quality): void {
    if (!TIERS[q]) return;
    this.requested = q;
    this.effective = this.volumesFailed && q !== 'low' ? 'low' : q;
    if (this.sim && !!this.volumes !== TIERS[this.effective].volumes) this.bindSim(this.sim);
    else this.applyLook();
  }

  /** scene resolution relative to the canvas (0.5 .. 1); traced lighting cost is linear in pixels */
  setResolutionScale(s: number): void {
    this.resScale = Math.max(0.5, Math.min(1, s || 1));
    if (this.post.supported) this.post.configure({ scale: this.resScale });
    else { this.three.setPixelRatio(this.basePixelRatio * this.resScale); this.resize(); }
  }

  /**
   * Switch the time-of-day look. The sun keeps the level's compass direction; its elevation comes from the
   * preset unless `keepLevelSun` is set.
   */
  setTimeOfDay(preset: TimeOfDay, keepLevelSun = false): void {
    if (!SKY_PRESETS[preset]) return;
    this.tod = preset;
    this.preset = SKY_PRESETS[preset];
    if (keepLevelSun) this.sunDir.copy(this.levelSunDir);
    else {
      const el = (this.preset.elevation * Math.PI) / 180;
      let ax = this.levelSunDir.x, az = this.levelSunDir.z;
      const l = Math.hypot(ax, az);
      if (l < 1e-3) { ax = -0.6; az = -0.8; } else { ax /= l; az /= l; }
      this.sunDir.set(ax * Math.cos(el), -Math.sin(el), az * Math.cos(el)).normalize();
    }
    this.applyTimeOfDay();
  }

  /** debug: change the quad overlap (voxels) and remesh everything */
  setMeshInflate(v: number): void {
    setMeshInflate(v);
    if (this.sim) for (const b of this.sim.bodies.values()) b.allDirty = true;
  }

  /** chunks still waiting to be meshed (loading indicator) */
  pendingChunks(): number { return this.sim ? this.bodies.pendingChunks(this.sim) : 0; }

  /** give a lit three material the traced sun / lamp shadows + cone AO of the voxel world (done automatically for scene objects) */
  patchMaterial(mat: THREE.Material): boolean {
    const ok = patchForeignMaterial(mat, this.look, this.cfg);
    if (ok) this.adopted.add(mat);
    return ok;
  }

  /** numbers for debug overlays / tests */
  stats() {
    const v = this.volumes;
    return {
      quality: this.requested, effectiveQuality: this.effective, timeOfDay: this.tod, resolutionScale: this.resScale,
      post: this.post.supported, renderSize: this.post.renderSize,
      quads: this.bodies.stats.quads, remeshed: this.bodies.stats.remeshed, pendingChunks: this.pendingChunks(),
      drawCalls: this.three.info.render.calls, triangles: this.three.info.render.triangles,
      lamps: this.lamps.clusters.length, lampLights: this.lamps.activeLights,
      volume: v ? {
        voxels: [v.world.occ.nx, v.world.occ.ny, v.world.occ.nz], origin: v.world.origin, bytes: v.byteLength, cropped: v.world.plan.cropped,
        buildMs: v.buildMs, uploads: v.uploads, lastUpdateMs: v.world.lastUpdateMs, lastUpdateVoxels: v.world.lastUpdateVoxels, lastUploadMs: v.lastUploadMs,
      } : null,
    };
  }

  /** test hook: GLSL vxTrace for rays (7 floats each: origin, dir, tMax; volume voxel units) -> 1 byte per ray */
  debugTrace(rays: Float32Array): Uint8Array | null {
    return this.volumes ? gpuTrace(this.three, this.look, rays) : null;
  }

  // ------------------------------------------------------------------ level / frame

  /** drop all per-level state (meshes are rebuilt from the new sim) */
  reset(): void {
    this.bodies.clear();
    this.shake = 0;
  }

  setLevel(info: LevelInfo): void {
    this.level = info;
    this.levelSunDir.set(info.sunDir.x, info.sunDir.y, info.sunDir.z).normalize();
    if (this.levelSunDir.y > -0.05) this.levelSunDir.y = -0.05, this.levelSunDir.normalize();
    // a level that names its sky also owns the exact sun direction; otherwise: golden hour along the level's azimuth
    this.setTimeOfDay(info.sky ?? 'sunset', !!info.sky);
  }

  resize(): void {
    const w = this.canvas.clientWidth || window.innerWidth, h = this.canvas.clientHeight || window.innerHeight;
    this.three.setSize(w, h, false);
    this.three.getDrawingBufferSize(_tmp2);
    this.post.setSize(_tmp2.x, _tmp2.y);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  setCamera(eye: V3, yaw: number, pitch: number, roll = 0): void {
    this.camera.position.set(eye.x, eye.y, eye.z);
    this.camera.rotation.set(pitch, yaw, roll, 'YXZ');
    if (this.shake > 0.001) {
      const s = this.shake * 0.05;
      this.camera.rotation.x += (Math.random() - 0.5) * s;
      this.camera.rotation.y += (Math.random() - 0.5) * s;
      this.camera.rotation.z += (Math.random() - 0.5) * s;
    }
  }

  /** react to sim events with particles etc. */
  handleEvents(events: SimEvent[], viewer: V3): void {
    for (const e of events) {
      if (e.type === 'carve') {
        const per = Math.max(1, Math.min(4, Math.round(60 / Math.max(1, e.samples.length))));
        for (const s of e.samples) this.chips.burst(s.p, s.pal, per, e.cause === 'explosion' ? 9 : 3.2, e.pos);
      } else if (e.type === 'custom' && e.name === 'tool:impact') {
        this.shake = Math.max(this.shake, e.data.power ?? 0.3);
      } else if (e.type === 'crumb') {
        this.chips.burst(e.pos, e.pal, Math.min(10, e.count + 2), 2);
      } else if (e.type === 'explosion') {
        const d = Math.hypot(e.pos.x - viewer.x, e.pos.y - viewer.y, e.pos.z - viewer.z);
        this.shake = Math.max(this.shake, Math.min(1.5, (e.size * 6) / (d + 2)));
      }
    }
  }

  render(sim: Sim, dt: number, fullSync = false): void {
    this.frame++;
    this.time += dt;
    if (this.fallbackPending) { this.fallbackPending = false; this.effective = 'low'; this.sim = null; }
    if (sim !== this.sim) this.bindSim(sim);
    // volume first: faces meshed this frame must find the matching occupancy
    this.volumes?.update(sim, fullSync);
    this.bodies.sync(sim, fullSync, this.camera.position);
    this.chips.update(dt, sim, this.frame);
    this.lamps.update(this.camera.position, this.frame);
    this.shake *= Math.exp(-dt * 6);
    this.placeSun();
    this.sky.uniforms.uTime.value = this.time;
    if (this.adoptForeignMaterials && (this.frame % 20 === 1 || fullSync)) this.adoptScene();
    if (this.post.supported) this.post.render(this.scene, this.camera, this.preset.exposure);
    else { this.three.setRenderTarget(null); this.three.render(this.scene, this.camera); }
  }

  // ------------------------------------------------------------------ internals

  private makeConfig(): LookConfig {
    const t = TIERS[this.effective];
    const vol = t.volumes && !!this.volumes;
    return { volumes: vol, tracedSun: vol, sunTaps: t.sunTaps, sunSteps: t.sunSteps, coneAO: vol && t.coneMax > 0, coneMax: t.coneMax, coneSteps: t.coneSteps, pointShadows: vol && t.pointShadows };
  }

  /** (re)build per-level GPU state for a sim: occupancy volumes, lamp lights */
  private bindSim(sim: Sim): void {
    this.sim = sim;
    this.volumes?.dispose();
    this.volumes = null;
    this.look.uBits.value = null; this.look.uDens.value = null;
    const tier = TIERS[this.effective];
    if (tier.volumes) {
      const b = this.level?.bounds ?? { min: { x: -100, y: -10, z: -100 }, max: { x: 100, y: 60, z: 100 } };
      const v = VoxelVolumes.create(this.three, sim, b, this.maxVolumeBytes, this.level?.spawn);
      if (v) {
        this.volumes = v;
        const u = v.uniforms();
        this.look.uBits.value = u.uBits.value; this.look.uDens.value = u.uDens.value;
        this.look.uVolSize.value.copy(u.uVolSize.value); this.look.uVolOrigin.value.copy(u.uVolOrigin.value);
        this.look.uInvVoxel.value = u.uInvVoxel.value;
      } else { this.volumesFailed = true; this.effective = 'low'; }
    }
    this.lamps.build(sim, TIERS[this.effective].lamps);
    this.applyLook();
  }

  /** materials, shadow setup and post options for the effective tier */
  private applyLook(): void {
    const tier = TIERS[this.effective];
    const cfg = this.makeConfig();
    const changed = JSON.stringify(cfg) !== JSON.stringify(this.cfg);
    this.cfg = cfg;
    const vol = this.volumes;
    this.bodies.classify = vol && cfg.volumes ? (b) => vol.world.has(b.id) : () => false;
    if (changed) {
      const old = this.materials;
      this.materials = makeVoxelMaterials(this.look, cfg);
      this.bodies.setLook(this.materials, !cfg.volumes);
      disposeVoxelMaterials(old);
      for (const m of this.adopted) patchForeignMaterial(m, this.look, cfg);
    } else this.bodies.setLook(this.materials, !cfg.volumes);
    const s = this.sun.shadow;
    if (s.mapSize.x !== tier.shadowSize) { s.mapSize.set(tier.shadowSize, tier.shadowSize); s.map?.dispose(); s.map = null; }
    const e = tier.shadowExtent;
    s.camera.left = -e; s.camera.right = e; s.camera.top = e; s.camera.bottom = -e;
    s.camera.updateProjectionMatrix();
    s.bias = -0.0004; s.normalBias = cfg.volumes ? 0.02 : 0.035;
    s.radius = cfg.volumes ? 2 : 2.5;
    this.lamps.resize(tier.lamps);
    this.post.configure({ samples: tier.msaa, bloom: tier.bloom, fxaa: tier.fxaa, scale: this.resScale });
  }

  private applyTimeOfDay(): void {
    const p = this.preset;
    this.sun.color.setRGB(...p.sunColor); this.sun.intensity = p.sunIntensity;
    this.hemi.color.setRGB(...p.skyLight); this.hemi.groundColor.setRGB(...p.groundLight); this.hemi.intensity = p.ambient;
    const fog = this.scene.fog as THREE.Fog;
    fog.color.setRGB(...p.horizon); fog.near = p.fogNear; fog.far = p.fogFar;
    this.scene.background = null;
    this.three.setClearColor(fog.color, 1);
    this.sky.apply(p, _v.copy(this.sunDir).negate());
    this.look.uEmissive.value = p.emissive; this.look.uAOMin.value = p.aoMin;
    this.look.uSkyZenith.value.setRGB(...p.zenith); this.look.uSkyHorizon.value.setRGB(...p.horizon);
    this.lamps.intensity = p.lamp;
    this.post.bloomStrength = p.bloom;
    this.three.toneMappingExposure = p.exposure;
  }

  /** shadow frustum follows the camera, snapped to shadow texels (in light space) to avoid shimmer */
  private placeSun(): void {
    const tier = TIERS[this.effective];
    const d = this.sunDir;
    _r.set(0, 1, 0).cross(d).normalize();
    _u.copy(d).cross(_r).normalize();
    const texel = (2 * tier.shadowExtent) / tier.shadowSize;
    const c = this.camera.position;
    const x = c.dot(_r), y = c.dot(_u);
    _v.copy(c).addScaledVector(_r, Math.round(x / texel) * texel - x).addScaledVector(_u, Math.round(y / texel) * texel - y);
    this.sun.target.position.copy(_v);
    this.sun.position.copy(_v).addScaledVector(d, -100);
  }

  /** find lit materials other systems added to the scene and give them the volume lighting */
  private adoptScene(): void {
    if (!this.cfg.volumes && this.adopted.size === 0) return;
    const visit = (o: THREE.Object3D) => {
      if (o === this.bodies.root || o === this.sky.mesh) return;
      const m = (o as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined;
      if (m) {
        if (Array.isArray(m)) { for (const x of m) if (!this.adopted.has(x)) this.patchMaterial(x); }
        else if (!this.adopted.has(m)) this.patchMaterial(m);
      }
      for (const c of o.children) visit(c);
    };
    visit(this.scene);
    if (this.adopted.size > 2000) this.adopted.clear();
  }
}

const _tmp2 = new THREE.Vector2();
