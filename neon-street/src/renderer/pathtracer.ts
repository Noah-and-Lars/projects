// The renderer: owns GPU buffers, textures and pipelines and encodes one frame.
//
// Frame pipeline (all at render resolution unless noted):
//   trace  x spp   -> packed diffuse/specular sums, G-buffer (pos+normal, albedo+roughness, emission+reflection distance)
//   temporal       -> reprojected diffuse / specular / emission history + variance
//   atrous x N     -> edge-aware blur per channel; pass 0 of each also feeds next frame's history
//   composite      -> HDR image (diffuse x albedo + specular + emission)
//   bloom          -> mip chain down and back up
//   display        -> bicubic upscale, bloom, tone map, to the canvas

import type { Vec3 } from '../core/math';
import type { Gpu } from '../core/gpu';
import type { SceneData } from '../world/geometry';
import type { BvhData } from './bvh';
import type { LightGrid } from './lightgrid';
import type { RenderSettings } from './presets';
import type { TextureSet } from './textures';
import type { RainSystem } from '../weather/rain';
import commonWgsl from './shaders/common.wgsl?raw';
import traceWgsl from './shaders/trace.wgsl?raw';
import temporalWgsl from './shaders/temporal.wgsl?raw';
import atrousWgsl from './shaders/atrous.wgsl?raw';
import compositeWgsl from './shaders/composite.wgsl?raw';
import bloomWgsl from './shaders/bloom.wgsl?raw';
import displayWgsl from './shaders/display.wgsl?raw';

export interface CameraState {
  pos: Vec3;
  fwd: Vec3;
  right: Vec3;
  up: Vec3;
  tanHalfFov: number;
}

export interface RenderStats {
  renderWidth: number;
  renderHeight: number;
  triCount: number;
  lightCount: number;
  bvhNodes: number;
  /** GPU times in ms for the last measured frame, or null without timestamp support. */
  gpuMs: number | null;
  traceMs: number | null;
  denoiseMs: number | null;
  postMs: number | null;
}

const MAX_ATROUS = 5;
const MAX_OBJS = 4;
const UNIFORM_FLOATS = 72 + MAX_OBJS * 24;
const BLOOM_LEVELS = 4;

/** A rigid dynamic object's placement this frame (object space -> world). */
export interface DynObjectPose {
  pos: Vec3;
  /** Row-major 3x3 rotation. */
  rot: number[];
  boundsMin: Vec3;
  boundsMax: Vec3;
}

/** Static info about a dynamic object's slice of the merged BVH. */
export interface DynObjectInfo {
  root: number;
  triStart: number;
}

export interface SpotLightState {
  pos: Vec3;
  dir: Vec3;
  intensity: number;
  cosInner: number;
  cosOuter: number;
  range: number;
}

/** Per-frame weather inputs the renderer forwards to the shaders. */
export interface WeatherState {
  /** 0..1 how wet every surface is. */
  wetness: number;
  /** Rain intensity (drives drops on glass). */
  rain: number;
  /** Sky brightness multiplier (lightning). */
  sky: number;
  /** Minimum temporal blend factor this frame (0 = normal, 1 = full reset). */
  historyBoost: number;
}

export class PathTracer {
  private readonly device: GPUDevice;
  private readonly uniformBuf: GPUBuffer;
  private readonly uniformData = new Float32Array(UNIFORM_FLOATS);
  private readonly atrousDiffParams: GPUBuffer[] = [];
  private readonly atrousSpecParams: GPUBuffer[] = [];
  private readonly displayParamBuf: GPUBuffer;
  private bloomParamBufs: GPUBuffer[] = [];
  private readonly sampler: GPUSampler;

  private readonly sceneBGL: GPUBindGroupLayout;
  private readonly traceTexBGL: GPUBindGroupLayout;
  private readonly temporalBGL: GPUBindGroupLayout;
  private readonly atrousBGL: GPUBindGroupLayout;
  private readonly compositeBGL: GPUBindGroupLayout;
  private readonly bloomBGL: GPUBindGroupLayout;
  private readonly displayBGL: GPUBindGroupLayout;
  private readonly sceneBG: GPUBindGroup;

  private readonly tracePipe: GPUComputePipeline;
  private readonly probePipe: GPUComputePipeline;
  private readonly probeBGL: GPUBindGroupLayout;
  private readonly probeTex: [GPUTexture, GPUTexture];
  private readonly probeBGs: [GPUBindGroup, GPUBindGroup];
  /** Optional rain system drawn into the HDR image after compositing. */
  rain: RainSystem | null = null;
  private readonly temporalPipe: GPUComputePipeline;
  private readonly atrousPipe: GPUComputePipeline;
  private readonly compositePipe: GPUComputePipeline;
  private readonly bloomPipe: GPUComputePipeline;
  private readonly displayPipe: GPURenderPipeline;

  private tex: Record<string, GPUTexture> = {};
  private bloomSizes: [number, number][] = [];
  private bgCache = new Map<string, GPUBindGroup>();
  private renderW = 0;
  private renderH = 0;
  private frame = 0;
  private prevCam: CameraState | null = null;
  private resetPending = true;
  private readonly grid: LightGrid;
  displayMode = 0;

  // GPU timing: 0 trace begin, 1 trace end, 2 denoise+composite end, 3 display end.
  private querySet: GPUQuerySet | null = null;
  private resolveBuf: GPUBuffer | null = null;
  private readBufs: { buf: GPUBuffer; busy: boolean }[] = [];

  readonly stats: RenderStats;

  private readonly waterExtent: [number, number, number, number];
  weather: WeatherState = { wetness: 1, rain: 1, sky: 1, historyBoost: 0 };
  /** Per-slot poses for the dynamic objects; null hides a slot. */
  readonly poses: (DynObjectPose | null)[] = new Array(MAX_OBJS).fill(null);
  /** The drone's searchlight; null switches it off. */
  spot: SpotLightState | null = null;
  private readonly objects: DynObjectInfo[];
  private readonly firstDynamicTri: number;

  constructor(
    private readonly gpu: Gpu, scene: SceneData, bvh: BvhData, grid: LightGrid, textures: TextureSet,
    water: { surface: GPUTexture; sampler: GPUSampler; extent: [number, number, number, number] },
    objects: DynObjectInfo[] = [],
  ) {
    this.waterExtent = water.extent;
    this.objects = objects.slice(0, MAX_OBJS);
    this.firstDynamicTri = objects.length ? Math.min(...objects.map((o) => o.triStart)) : 1e9;
    const device = gpu.device;
    this.device = device;
    this.grid = grid;

    const storage = (data: ArrayBufferView | ArrayBuffer, label: string) => {
      const byteLength = Math.max(16, data.byteLength);
      const buf = device.createBuffer({ label, size: byteLength, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
      if (data.byteLength > 0) {
        if (data instanceof ArrayBuffer) device.queue.writeBuffer(buf, 0, data);
        else device.queue.writeBuffer(buf, 0, data.buffer as ArrayBuffer, data.byteOffset, data.byteLength);
      }
      return buf;
    };
    const trisBuf = storage(scene.tris, 'tris');
    const nodesBuf = storage(bvh.nodes, 'bvh nodes');
    const triIdxBuf = storage(bvh.triIdx, 'bvh tri indices');
    const matsBuf = storage(scene.mats, 'materials');
    const lightTrisBuf = storage(scene.lightTris, 'light tris');
    const gridBuf = storage(grid.cdf, 'light grid cdf');

    this.uniformBuf = device.createBuffer({ label: 'uniforms', size: UNIFORM_FLOATS * 4, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    const atrousParams = (label: string, sigmaL: number, sigmaRough: number, normalPow: number) => {
      const out: GPUBuffer[] = [];
      for (let i = 0; i < MAX_ATROUS; i++) {
        const b = device.createBuffer({ label: `${label} ${i}`, size: 16, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
        device.queue.writeBuffer(b, 0, new Float32Array([1 << i, sigmaL, sigmaRough, normalPow]));
        out.push(b);
      }
      return out;
    };
    this.atrousDiffParams = atrousParams('atrous diff', 4.0, 0.15, 64);
    // Reflections: stop hard at roughness and normal changes, blur less.
    this.atrousSpecParams = atrousParams('atrous spec', 3.0, 0.05, 128);
    this.displayParamBuf = device.createBuffer({ label: 'display params', size: 32, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    this.sampler = device.createSampler({ magFilter: 'linear', minFilter: 'linear', addressModeU: 'clamp-to-edge', addressModeV: 'clamp-to-edge' });

    // ---- bind group layouts -------------------------------------------------
    const C = GPUShaderStage.COMPUTE;
    const F = GPUShaderStage.FRAGMENT;
    const ro = (binding: number): GPUBindGroupLayoutEntry => ({ binding, visibility: C, buffer: { type: 'read-only-storage' } });
    const tex = (binding: number, sampleType: GPUTextureSampleType = 'float', vis = C): GPUBindGroupLayoutEntry => ({ binding, visibility: vis, texture: { sampleType } });
    const st = (binding: number, format: GPUTextureFormat): GPUBindGroupLayoutEntry => ({ binding, visibility: C, storageTexture: { access: 'write-only', format } });
    const uni = (binding: number, vis = C): GPUBindGroupLayoutEntry => ({ binding, visibility: vis, buffer: { type: 'uniform' } });
    const smp = (binding: number, vis = C): GPUBindGroupLayoutEntry => ({ binding, visibility: vis, sampler: { type: 'filtering' } });

    const texArr = (binding: number): GPUBindGroupLayoutEntry => ({ binding, visibility: C, texture: { sampleType: 'float', viewDimension: '2d-array' } });
    this.sceneBGL = device.createBindGroupLayout({ label: 'scene', entries: [uni(0), ro(1), ro(2), ro(3), ro(4), ro(5), ro(6), smp(7), texArr(8), texArr(9), tex(10), smp(11)] });
    // WebGPU allows only 4 storage textures per stage, hence the packed outputs.
    this.traceTexBGL = device.createBindGroupLayout({
      label: 'trace textures',
      entries: [tex(0, 'uint'), st(1, 'rgba32uint'), st(2, 'rgba32float'), st(3, 'rgba16float'), st(4, 'rgba16float')],
    });
    this.temporalBGL = device.createBindGroupLayout({
      label: 'temporal',
      entries: [
        uni(0), tex(1, 'uint'), tex(2, 'unfilterable-float'), tex(3), tex(4), tex(5), tex(6), tex(7), tex(8), tex(9, 'unfilterable-float'),
        st(10, 'rgba16float'), st(11, 'rgba16float'), st(12, 'rgba16float'), st(13, 'rgba16float'),
      ],
    });
    this.atrousBGL = device.createBindGroupLayout({ label: 'atrous', entries: [uni(0), tex(1), tex(2, 'unfilterable-float'), tex(3), st(4, 'rgba16float'), uni(5)] });
    this.compositeBGL = device.createBindGroupLayout({ label: 'composite', entries: [uni(0), tex(1), tex(2), tex(3), tex(4), st(5, 'rgba16float')] });
    this.bloomBGL = device.createBindGroupLayout({ label: 'bloom', entries: [smp(0), tex(1), st(2, 'rgba16float'), uni(3), tex(4)] });
    this.displayBGL = device.createBindGroupLayout({
      label: 'display',
      entries: [smp(0, F), tex(1, 'float', F), tex(2, 'float', F), uni(3, F), uni(4, F), tex(5, 'unfilterable-float', F), tex(6, 'float', F), tex(7, 'float', F), tex(8, 'float', F)],
    });

    this.sceneBG = device.createBindGroup({
      layout: this.sceneBGL,
      entries: [
        { binding: 0, resource: { buffer: this.uniformBuf } },
        { binding: 1, resource: { buffer: trisBuf } },
        { binding: 2, resource: { buffer: nodesBuf } },
        { binding: 3, resource: { buffer: triIdxBuf } },
        { binding: 4, resource: { buffer: matsBuf } },
        { binding: 5, resource: { buffer: lightTrisBuf } },
        { binding: 6, resource: { buffer: gridBuf } },
        { binding: 7, resource: textures.sampler },
        { binding: 8, resource: textures.albedo.createView({ dimension: '2d-array' }) },
        { binding: 9, resource: textures.normal.createView({ dimension: '2d-array' }) },
        { binding: 10, resource: water.surface.createView() },
        { binding: 11, resource: water.sampler },
      ],
    });

    // ---- pipelines ------------------------------------------------------------
    const module = (label: string, code: string) => device.createShaderModule({ label, code: commonWgsl + '\n' + code });
    const compute = (label: string, code: string, layouts: GPUBindGroupLayout[]) =>
      device.createComputePipeline({
        label,
        layout: device.createPipelineLayout({ bindGroupLayouts: layouts }),
        compute: { module: module(label, code), entryPoint: 'main' },
      });
    const traceModule = module('trace', traceWgsl);
    this.tracePipe = device.createComputePipeline({
      label: 'trace',
      layout: device.createPipelineLayout({ bindGroupLayouts: [this.sceneBGL, this.traceTexBGL] }),
      compute: { module: traceModule, entryPoint: 'main' },
    });
    // Irradiance probes: same module, second entry point, 3D ping-pong textures.
    this.probeBGL = device.createBindGroupLayout({
      label: 'probes',
      entries: [
        { binding: 0, visibility: C, texture: { sampleType: 'float', viewDimension: '3d' } },
        { binding: 1, visibility: C, storageTexture: { access: 'write-only', format: 'rgba16float', viewDimension: '3d' } },
      ],
    });
    const emptyBGL = device.createBindGroupLayout({ label: 'empty', entries: [] });
    this.probePipe = device.createComputePipeline({
      label: 'probes',
      layout: device.createPipelineLayout({ bindGroupLayouts: [this.sceneBGL, emptyBGL, this.probeBGL] }),
      compute: { module: traceModule, entryPoint: 'probes' },
    });
    const mkProbe = (label: string) => device.createTexture({
      label, size: [32, 24, 300], dimension: '3d', format: 'rgba16float',
      usage: GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.TEXTURE_BINDING,
    });
    this.probeTex = [mkProbe('probes 0'), mkProbe('probes 1')];
    const probeBG = (i: number) => device.createBindGroup({
      layout: this.probeBGL,
      entries: [
        { binding: 0, resource: this.probeTex[i ^ 1].createView({ dimension: '3d' }) },
        { binding: 1, resource: this.probeTex[i].createView({ dimension: '3d' }) },
      ],
    });
    this.probeBGs = [probeBG(0), probeBG(1)];
    this.temporalPipe = compute('temporal', temporalWgsl, [this.temporalBGL]);
    this.atrousPipe = compute('atrous', atrousWgsl, [this.atrousBGL]);
    this.compositePipe = compute('composite', compositeWgsl, [this.compositeBGL]);
    this.bloomPipe = compute('bloom', bloomWgsl, [this.bloomBGL]);
    const displayModule = module('display', displayWgsl);
    this.displayPipe = device.createRenderPipeline({
      label: 'display',
      layout: device.createPipelineLayout({ bindGroupLayouts: [this.displayBGL] }),
      vertex: { module: displayModule, entryPoint: 'vs' },
      fragment: { module: displayModule, entryPoint: 'fs', targets: [{ format: gpu.format }] },
      primitive: { topology: 'triangle-list' },
    });

    if (gpu.hasTimestamps) {
      this.querySet = device.createQuerySet({ type: 'timestamp', count: 4 });
      this.resolveBuf = device.createBuffer({ size: 32, usage: GPUBufferUsage.QUERY_RESOLVE | GPUBufferUsage.COPY_SRC });
      for (let i = 0; i < 3; i++) {
        this.readBufs.push({ buf: device.createBuffer({ size: 32, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST }), busy: false });
      }
    }

    this.stats = {
      renderWidth: 0,
      renderHeight: 0,
      triCount: scene.triCount,
      lightCount: scene.lightCount,
      bvhNodes: bvh.nodeCount,
      gpuMs: null,
      traceMs: null,
      denoiseMs: null,
      postMs: null,
    };
  }

  /** Ensure render targets match the canvas size and render scale. */
  resize(canvasW: number, canvasH: number, renderScale: number): void {
    const maxDim = this.device.limits.maxTextureDimension2D;
    const w = Math.min(maxDim, Math.max(16, Math.round(canvasW * renderScale)));
    const h = Math.min(maxDim, Math.max(16, Math.round(canvasH * renderScale)));
    if (w === this.renderW && h === this.renderH) return;
    this.renderW = w;
    this.renderH = h;
    this.stats.renderWidth = w;
    this.stats.renderHeight = h;
    for (const t of Object.values(this.tex)) t.destroy();
    this.tex = {};
    this.bgCache.clear();
    const usage = GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.TEXTURE_BINDING;
    const mk = (name: string, format: GPUTextureFormat, tw = w, th = h, extraUsage = 0) => {
      this.tex[name] = this.device.createTexture({ label: name, size: [tw, th], format, usage: usage | extraUsage });
    };
    this.rain?.invalidate();
    for (const i of [0, 1]) {
      mk(`rad${i}`, 'rgba32uint');
      mk(`pos${i}`, 'rgba32float');
      mk(`diffHist${i}`, 'rgba16float');
      mk(`specHist${i}`, 'rgba16float');
      mk(`mom${i}`, 'rgba16float');
      mk(`emitHist${i}`, 'rgba16float');
    }
    mk('alb', 'rgba16float');
    mk('emit', 'rgba16float');
    for (const n of ['tmpA', 'tmpB', 'tmpC', 'tmpD']) mk(n, 'rgba16float');
    mk('hdr', 'rgba16float', w, h, GPUTextureUsage.RENDER_ATTACHMENT);

    // Bloom chain: half, quarter, eighth, sixteenth.
    this.bloomSizes = [];
    for (const b of this.bloomParamBufs) b.destroy();
    this.bloomParamBufs = [];
    let bw = w, bh = h;
    for (let i = 0; i < BLOOM_LEVELS; i++) {
      bw = Math.max(1, bw >> 1);
      bh = Math.max(1, bh >> 1);
      this.bloomSizes.push([bw, bh]);
      mk(`down${i}`, 'rgba16float', bw, bh);
      if (i < BLOOM_LEVELS - 1) mk(`up${i}`, 'rgba16float', bw, bh);
    }
    const bloomParam = (srcW: number, srcH: number, dstW: number, dstH: number, mode: number) => {
      const b = this.device.createBuffer({ label: `bloom params ${mode}`, size: 32, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
      this.device.queue.writeBuffer(b, 0, new Float32Array([srcW, srcH, dstW, dstH, 1.0, 0.5, mode, 0]));
      this.bloomParamBufs.push(b);
    };
    // Downsample passes 0..3, then upsample passes.
    let sw = w, sh = h;
    for (let i = 0; i < BLOOM_LEVELS; i++) {
      const [dw, dh] = this.bloomSizes[i];
      bloomParam(sw, sh, dw, dh, i === 0 ? 0 : 1);
      sw = dw; sh = dh;
    }
    for (let i = BLOOM_LEVELS - 2; i >= 0; i--) {
      const [srcW2, srcH2] = this.bloomSizes[i + 1];
      const [dw, dh] = this.bloomSizes[i];
      bloomParam(srcW2, srcH2, dw, dh, 2);
    }
    this.resetPending = true;
  }

  resetHistory(): void {
    this.resetPending = true;
  }

  private bindGroup(key: string, layout: GPUBindGroupLayout, make: () => GPUBindGroupEntry[]): GPUBindGroup {
    let bg = this.bgCache.get(key);
    if (!bg) {
      bg = this.device.createBindGroup({ label: key, layout, entries: make() });
      this.bgCache.set(key, bg);
    }
    return bg;
  }

  private view(name: string): GPUTextureView {
    return this.tex[name].createView();
  }

  private writeUniforms(cam: CameraState, settings: RenderSettings, sampleIndex: number, time: number): void {
    const u = this.uniformData;
    const prev = this.prevCam ?? cam;
    const aspect = this.renderW / this.renderH;
    const put = (o: number, v: Vec3, w: number) => { u[o] = v[0]; u[o + 1] = v[1]; u[o + 2] = v[2]; u[o + 3] = w; };
    put(0, cam.pos, cam.tanHalfFov);
    put(4, cam.fwd, aspect);
    put(8, cam.right, 0);
    put(12, cam.up, 0);
    put(16, prev.pos, prev.tanHalfFov);
    put(20, prev.fwd, aspect);
    put(24, prev.right, 0);
    put(28, prev.up, 0);
    u[32] = this.renderW; u[33] = this.renderH; u[34] = 1 / this.renderW; u[35] = 1 / this.renderH;
    u[36] = settings.maxBounces; u[37] = sampleIndex; u[38] = settings.fogDensity; u[39] = settings.fogMode;
    const w = this.weather;
    u[40] = this.stats.lightCount; u[41] = settings.maxHistory; u[42] = this.resetPending ? 1 : Math.min(0.98, w.historyBoost); u[43] = time;
    u[44] = 40; u[45] = w.sky; u[46] = this.frame; u[47] = settings.spp;
    u[48] = settings.lightSamples; u[49] = this.grid.z0; u[50] = this.grid.cellSize; u[51] = this.grid.cellCount;
    u[52] = this.waterExtent[0]; u[53] = this.waterExtent[1]; u[54] = this.waterExtent[2]; u[55] = this.waterExtent[3];
    u[56] = w.wetness; u[57] = w.historyBoost; u[58] = w.rain; u[59] = this.firstDynamicTri;
    const sp = this.spot;
    if (sp) {
      put(60, sp.pos, sp.intensity);
      put(64, sp.dir, sp.cosOuter);
      u[68] = sp.cosInner; u[69] = sp.range; u[70] = 0; u[71] = 0;
    } else {
      u[63] = 0; // intensity 0 switches the searchlight off
    }
    for (let i = 0; i < MAX_OBJS; i++) {
      const o = 72 + i * 24;
      const pose = this.poses[i];
      const info = this.objects[i];
      if (!pose || !info) { u[o + 3] = -1; continue; }
      put(o, pose.pos, info.root);
      u[o + 4] = pose.rot[0]; u[o + 5] = pose.rot[1]; u[o + 6] = pose.rot[2]; u[o + 7] = 0;
      u[o + 8] = pose.rot[3]; u[o + 9] = pose.rot[4]; u[o + 10] = pose.rot[5]; u[o + 11] = 0;
      u[o + 12] = pose.rot[6]; u[o + 13] = pose.rot[7]; u[o + 14] = pose.rot[8]; u[o + 15] = 0;
      put(o + 16, pose.boundsMin, 0);
      put(o + 20, pose.boundsMax, info.triStart);
    }
    this.device.queue.writeBuffer(this.uniformBuf, 0, u.buffer, 0, u.byteLength);
  }

  private computePass(enc: GPUCommandEncoder, label: string, pipe: GPUComputePipeline, bgs: GPUBindGroup[], gx: number, gy: number, ts?: GPUComputePassTimestampWrites): void {
    const desc: GPUComputePassDescriptor = { label };
    if (ts) desc.timestampWrites = ts;
    const pass = enc.beginComputePass(desc);
    pass.setPipeline(pipe);
    bgs.forEach((bg, i) => pass.setBindGroup(i, bg));
    pass.dispatchWorkgroups(gx, gy);
    pass.end();
  }

  /** Runs one a-trous chain; returns the name of the texture holding the result. */
  private atrousChain(enc: GPUCommandEncoder, cur: number, input: string, histName: string, scratch: string, params: GPUBuffer[], iters: number, gx: number, gy: number): string {
    let src = input;
    for (let i = 0; i < iters; i++) {
      const output = i === 0 ? histName : src === input ? scratch : input;
      const bg = this.bindGroup(`atrous${cur}:${src}>${output}:${histName}:${i}`, this.atrousBGL, () => [
        { binding: 0, resource: { buffer: this.uniformBuf } },
        { binding: 1, resource: this.view(src) },
        { binding: 2, resource: this.view(`pos${cur}`) },
        { binding: 3, resource: this.view('alb') },
        { binding: 4, resource: this.view(output) },
        { binding: 5, resource: { buffer: params[i] } },
      ]);
      this.computePass(enc, `atrous ${histName} ${i}`, this.atrousPipe, [bg], gx, gy);
      src = output;
    }
    return src;
  }

  render(cam: CameraState, settings: RenderSettings, time: number): void {
    if (this.renderW === 0) return;
    const device = this.device;
    const cur = this.frame & 1;
    const prev = cur ^ 1;
    const gx = Math.ceil(this.renderW / 8);
    const gy = Math.ceil(this.renderH / 8);
    const spp = Math.max(1, Math.round(settings.spp));
    const qs = this.querySet;

    // ---- irradiance probes (a quarter of the volume per frame)
    {
      this.writeUniforms(cam, settings, 0, time);
      const enc = device.createCommandEncoder({ label: 'probes' });
      const pass = enc.beginComputePass({ label: 'probes' });
      pass.setPipeline(this.probePipe);
      pass.setBindGroup(0, this.sceneBG);
      pass.setBindGroup(2, this.probeBGs[cur]);
      pass.dispatchWorkgroups(8, 6, 75);
      pass.end();
      device.queue.submit([enc.finish()]);
    }

    // ---- trace: one submit per sample so a heavy preset can't stall the GPU
    // watchdog with a single giant dispatch.
    for (let s = 0; s < spp; s++) {
      this.writeUniforms(cam, settings, s, time);
      const inIdx = (s + 1) & 1;
      const outIdx = s & 1;
      const bg = this.bindGroup(`trace${cur}${outIdx}`, this.traceTexBGL, () => [
        { binding: 0, resource: this.view(`rad${inIdx}`) },
        { binding: 1, resource: this.view(`rad${outIdx}`) },
        { binding: 2, resource: this.view(`pos${cur}`) },
        { binding: 3, resource: this.view('alb') },
        { binding: 4, resource: this.view('emit') },
      ]);
      const enc = device.createCommandEncoder({ label: `trace ${s}` });
      let ts: GPUComputePassTimestampWrites | undefined;
      if (qs) {
        ts = { querySet: qs };
        if (s === 0) ts.beginningOfPassWriteIndex = 0;
        if (s === spp - 1) ts.endOfPassWriteIndex = 1;
      }
      this.computePass(enc, `trace ${s}`, this.tracePipe, [this.sceneBG, bg], gx, gy, ts);
      device.queue.submit([enc.finish()]);
    }
    const lastRad = `rad${(spp - 1) & 1}`;

    const enc = device.createCommandEncoder({ label: 'denoise+display' });

    // ---- temporal accumulation
    {
      const bg = this.bindGroup(`temporal${cur}${lastRad}`, this.temporalBGL, () => [
        { binding: 0, resource: { buffer: this.uniformBuf } },
        { binding: 1, resource: this.view(lastRad) },
        { binding: 2, resource: this.view(`pos${cur}`) },
        { binding: 3, resource: this.view('alb') },
        { binding: 4, resource: this.view('emit') },
        { binding: 5, resource: this.view(`diffHist${prev}`) },
        { binding: 6, resource: this.view(`specHist${prev}`) },
        { binding: 7, resource: this.view(`mom${prev}`) },
        { binding: 8, resource: this.view(`emitHist${prev}`) },
        { binding: 9, resource: this.view(`pos${prev}`) },
        { binding: 10, resource: this.view('tmpA') },
        { binding: 11, resource: this.view('tmpB') },
        { binding: 12, resource: this.view(`mom${cur}`) },
        { binding: 13, resource: this.view(`emitHist${cur}`) },
      ]);
      this.computePass(enc, 'temporal', this.temporalPipe, [bg], gx, gy);
    }

    // ---- a-trous chains; pass 0 of each writes the history for the next frame.
    const iters = Math.min(MAX_ATROUS, Math.max(1, Math.round(settings.atrousIterations)));
    const specIters = Math.max(1, Math.min(iters, Math.round(iters * 0.6)));
    const diffOut = this.atrousChain(enc, cur, 'tmpA', `diffHist${cur}`, 'tmpC', this.atrousDiffParams, iters, gx, gy);
    const specOut = this.atrousChain(enc, cur, 'tmpB', `specHist${cur}`, 'tmpD', this.atrousSpecParams, specIters, gx, gy);

    // ---- composite to HDR
    {
      const bg = this.bindGroup(`composite${cur}:${diffOut}:${specOut}`, this.compositeBGL, () => [
        { binding: 0, resource: { buffer: this.uniformBuf } },
        { binding: 1, resource: this.view(diffOut) },
        { binding: 2, resource: this.view(specOut) },
        { binding: 3, resource: this.view('alb') },
        { binding: 4, resource: this.view(`emitHist${cur}`) },
        { binding: 5, resource: this.view('hdr') },
      ]);
      this.computePass(enc, 'composite', this.compositePipe, [bg], gx, gy, qs ? { querySet: qs, endOfPassWriteIndex: 2 } : undefined);
    }

    // ---- rain streaks and splashes, lit by the probes, depth-tested against the G-buffer
    this.rain?.draw(enc, this.view('hdr'), `rain${cur}`, this.uniformBuf, this.view(`pos${cur}`), this.probeTex[cur].createView({ dimension: '3d' }));

    // ---- bloom
    {
      let src = 'hdr';
      for (let i = 0; i < BLOOM_LEVELS; i++) {
        const dst = `down${i}`;
        const [dw, dh] = this.bloomSizes[i];
        const bg = this.bindGroup(`bloom down ${i}`, this.bloomBGL, () => [
          { binding: 0, resource: this.sampler },
          { binding: 1, resource: this.view(src) },
          { binding: 2, resource: this.view(dst) },
          { binding: 3, resource: { buffer: this.bloomParamBufs[i] } },
          { binding: 4, resource: this.view(dst === 'down0' ? 'down1' : 'down0') },
        ]);
        this.computePass(enc, `bloom down ${i}`, this.bloomPipe, [bg], Math.ceil(dw / 8), Math.ceil(dh / 8));
        src = dst;
      }
      let pIdx = BLOOM_LEVELS;
      src = `down${BLOOM_LEVELS - 1}`;
      for (let i = BLOOM_LEVELS - 2; i >= 0; i--) {
        const dst = `up${i}`;
        const [dw, dh] = this.bloomSizes[i];
        const srcName = src;
        const bg = this.bindGroup(`bloom up ${i}`, this.bloomBGL, () => [
          { binding: 0, resource: this.sampler },
          { binding: 1, resource: this.view(srcName) },
          { binding: 2, resource: this.view(dst) },
          { binding: 3, resource: { buffer: this.bloomParamBufs[pIdx] } },
          { binding: 4, resource: this.view(`down${i}`) },
        ]);
        this.computePass(enc, `bloom up ${i}`, this.bloomPipe, [bg], Math.ceil(dw / 8), Math.ceil(dh / 8));
        src = dst;
        pIdx++;
      }
    }

    // ---- display
    const sharpen = settings.renderScale < 0.95 ? 0.35 : 0;
    device.queue.writeBuffer(this.displayParamBuf, 0, new Float32Array([settings.exposure, 0.35, this.displayMode, settings.bloom, this.renderW, this.renderH, sharpen, 0]));
    {
      const bg = this.bindGroup(`display:${cur}:${diffOut}:${specOut}`, this.displayBGL, () => [
        { binding: 0, resource: this.sampler },
        { binding: 1, resource: this.view('hdr') },
        { binding: 2, resource: this.view('up0') },
        { binding: 3, resource: { buffer: this.displayParamBuf } },
        { binding: 4, resource: { buffer: this.uniformBuf } },
        { binding: 5, resource: this.view(`pos${cur}`) },
        { binding: 6, resource: this.view('alb') },
        { binding: 7, resource: this.view(diffOut) },
        { binding: 8, resource: this.view(specOut) },
      ]);
      const desc: GPURenderPassDescriptor = {
        label: 'display',
        colorAttachments: [{ view: this.gpu.context.getCurrentTexture().createView(), loadOp: 'clear', storeOp: 'store', clearValue: { r: 0, g: 0, b: 0, a: 1 } }],
      };
      if (qs) desc.timestampWrites = { querySet: qs, endOfPassWriteIndex: 3 };
      const pass = enc.beginRenderPass(desc);
      pass.setPipeline(this.displayPipe);
      pass.setBindGroup(0, bg);
      pass.draw(3);
      pass.end();
    }

    // ---- GPU timing readback
    let readSlot: { buf: GPUBuffer; busy: boolean } | undefined;
    if (qs && this.resolveBuf) {
      readSlot = this.readBufs.find((r) => !r.busy);
      if (readSlot) {
        readSlot.busy = true;
        enc.resolveQuerySet(qs, 0, 4, this.resolveBuf, 0);
        enc.copyBufferToBuffer(this.resolveBuf, 0, readSlot.buf, 0, 32);
      }
    }
    device.queue.submit([enc.finish()]);
    if (readSlot) {
      const slot = readSlot;
      slot.buf.mapAsync(GPUMapMode.READ).then(() => {
        const t = new BigUint64Array(slot.buf.getMappedRange());
        const ms = (a: bigint, b: bigint) => Number(b - a) / 1e6;
        const total = ms(t[0], t[3]);
        slot.buf.unmap();
        slot.busy = false;
        if (total > 0 && total < 60000) {
          this.stats.gpuMs = total;
          this.stats.traceMs = ms(t[0], t[1]);
          this.stats.denoiseMs = ms(t[1], t[2]);
          this.stats.postMs = ms(t[2], t[3]);
        }
      }).catch(() => { slot.busy = false; });
    }

    this.prevCam = { pos: [...cam.pos], fwd: [...cam.fwd], right: [...cam.right], up: [...cam.up], tanHalfFov: cam.tanHalfFov };
    this.resetPending = false;
    this.frame++;
  }
}
