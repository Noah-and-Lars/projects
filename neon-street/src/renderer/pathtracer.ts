// The renderer: owns GPU buffers, textures and pipelines and encodes one frame.
//
// Frame pipeline (all at render resolution unless noted):
//   trace  x spp   -> radiance sum (demodulated), G-buffer (pos, normal, albedo)
//   temporal       -> reprojected history + variance
//   atrous x N     -> edge-aware blur; first pass also feeds next frame's history
//   display        -> remodulate, tone map, upscale to the canvas

import type { Vec3 } from '../core/math';
import type { Gpu } from '../core/gpu';
import type { SceneData } from '../world/geometry';
import type { BvhData } from './bvh';
import type { RenderSettings } from './presets';
import commonWgsl from './shaders/common.wgsl?raw';
import traceWgsl from './shaders/trace.wgsl?raw';
import temporalWgsl from './shaders/temporal.wgsl?raw';
import atrousWgsl from './shaders/atrous.wgsl?raw';
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
  /** Last measured GPU frame time in ms, or null when timestamps are unavailable. */
  gpuMs: number | null;
}

const MAX_ATROUS = 5;
const UNIFORM_FLOATS = 52;

export class PathTracer {
  private readonly device: GPUDevice;
  private readonly uniformBuf: GPUBuffer;
  private readonly uniformData = new Float32Array(UNIFORM_FLOATS);
  private readonly atrousParamBufs: GPUBuffer[] = [];
  private readonly displayParamBuf: GPUBuffer;
  private readonly sampler: GPUSampler;

  private readonly sceneBGL: GPUBindGroupLayout;
  private readonly traceTexBGL: GPUBindGroupLayout;
  private readonly temporalBGL: GPUBindGroupLayout;
  private readonly atrousBGL: GPUBindGroupLayout;
  private readonly displayBGL: GPUBindGroupLayout;
  private readonly sceneBG: GPUBindGroup;

  private readonly tracePipe: GPUComputePipeline;
  private readonly temporalPipe: GPUComputePipeline;
  private readonly atrousPipe: GPUComputePipeline;
  private readonly displayPipe: GPURenderPipeline;

  private tex: Record<string, GPUTexture> = {};
  private bgCache = new Map<string, GPUBindGroup>();
  private renderW = 0;
  private renderH = 0;
  private frame = 0;
  private prevCam: CameraState | null = null;
  private resetPending = true;
  displayMode = 0;

  // GPU timing.
  private querySet: GPUQuerySet | null = null;
  private resolveBuf: GPUBuffer | null = null;
  private readBufs: { buf: GPUBuffer; busy: boolean }[] = [];
  private gpuMs: number | null = null;

  readonly stats: RenderStats;

  constructor(private readonly gpu: Gpu, scene: SceneData, bvh: BvhData) {
    const device = gpu.device;
    this.device = device;

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
    const lightCdfBuf = storage(scene.lightCdf, 'light cdf');

    this.uniformBuf = device.createBuffer({ label: 'uniforms', size: UNIFORM_FLOATS * 4, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    for (let i = 0; i < MAX_ATROUS; i++) {
      const b = device.createBuffer({ label: `atrous ${i}`, size: 16, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
      device.queue.writeBuffer(b, 0, new Float32Array([1 << i, 4.0, 0, 0]));
      this.atrousParamBufs.push(b);
    }
    this.displayParamBuf = device.createBuffer({ label: 'display params', size: 16, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    this.sampler = device.createSampler({ magFilter: 'linear', minFilter: 'linear', addressModeU: 'clamp-to-edge', addressModeV: 'clamp-to-edge' });

    // ---- bind group layouts -------------------------------------------------
    const C = GPUShaderStage.COMPUTE;
    const ro = (binding: number): GPUBindGroupLayoutEntry => ({ binding, visibility: C, buffer: { type: 'read-only-storage' } });
    const tex = (binding: number, sampleType: GPUTextureSampleType = 'float', vis = C): GPUBindGroupLayoutEntry => ({ binding, visibility: vis, texture: { sampleType } });
    const st = (binding: number, format: GPUTextureFormat): GPUBindGroupLayoutEntry => ({ binding, visibility: C, storageTexture: { access: 'write-only', format } });
    const uni = (binding: number, vis = C): GPUBindGroupLayoutEntry => ({ binding, visibility: vis, buffer: { type: 'uniform' } });

    this.sceneBGL = device.createBindGroupLayout({ label: 'scene', entries: [uni(0), ro(1), ro(2), ro(3), ro(4), ro(5), ro(6)] });
    // WebGPU allows only 4 storage textures per stage, hence the packed G-buffer.
    this.traceTexBGL = device.createBindGroupLayout({ label: 'trace textures', entries: [tex(0), st(1, 'rgba16float'), st(2, 'rgba32float'), st(3, 'rgba16float'), st(4, 'rgba16float')] });
    this.temporalBGL = device.createBindGroupLayout({
      label: 'temporal',
      entries: [uni(0), tex(1), tex(2, 'unfilterable-float'), tex(3), tex(4), tex(5, 'unfilterable-float'), st(6, 'rgba16float'), st(7, 'rgba16float'), tex(8), tex(9), st(10, 'rgba16float')],
    });
    this.atrousBGL = device.createBindGroupLayout({ label: 'atrous', entries: [uni(0), tex(1), tex(2, 'unfilterable-float'), tex(3), st(4, 'rgba16float'), uni(5)] });
    const F = GPUShaderStage.FRAGMENT;
    this.displayBGL = device.createBindGroupLayout({
      label: 'display',
      entries: [{ binding: 0, visibility: F, sampler: { type: 'filtering' } }, tex(1, 'float', F), tex(2, 'float', F), tex(3, 'float', F), uni(4, F), tex(5, 'unfilterable-float', F), uni(6, F)],
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
        { binding: 6, resource: { buffer: lightCdfBuf } },
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
    this.tracePipe = compute('trace', traceWgsl, [this.sceneBGL, this.traceTexBGL]);
    this.temporalPipe = compute('temporal', temporalWgsl, [this.temporalBGL]);
    this.atrousPipe = compute('atrous', atrousWgsl, [this.atrousBGL]);
    const displayModule = module('display', displayWgsl);
    this.displayPipe = device.createRenderPipeline({
      label: 'display',
      layout: device.createPipelineLayout({ bindGroupLayouts: [this.displayBGL] }),
      vertex: { module: displayModule, entryPoint: 'vs' },
      fragment: { module: displayModule, entryPoint: 'fs', targets: [{ format: gpu.format }] },
      primitive: { topology: 'triangle-list' },
    });

    if (gpu.hasTimestamps) {
      this.querySet = device.createQuerySet({ type: 'timestamp', count: 2 });
      this.resolveBuf = device.createBuffer({ size: 16, usage: GPUBufferUsage.QUERY_RESOLVE | GPUBufferUsage.COPY_SRC });
      for (let i = 0; i < 3; i++) {
        this.readBufs.push({ buf: device.createBuffer({ size: 16, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST }), busy: false });
      }
    }

    this.stats = {
      renderWidth: 0,
      renderHeight: 0,
      triCount: scene.triCount,
      lightCount: scene.lightCount,
      bvhNodes: bvh.nodeCount,
      gpuMs: null,
    };
  }

  /** Ensure render targets match the canvas size and render scale. */
  resize(canvasW: number, canvasH: number, renderScale: number): void {
    const maxDim = this.device.limits.maxTextureDimension2D;
    const w = Math.min(maxDim, Math.max(8, Math.round(canvasW * renderScale)));
    const h = Math.min(maxDim, Math.max(8, Math.round(canvasH * renderScale)));
    if (w === this.renderW && h === this.renderH) return;
    this.renderW = w;
    this.renderH = h;
    this.stats.renderWidth = w;
    this.stats.renderHeight = h;
    for (const t of Object.values(this.tex)) t.destroy();
    this.tex = {};
    this.bgCache.clear();
    const usage = GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.TEXTURE_BINDING;
    const mk = (name: string, format: GPUTextureFormat) => {
      this.tex[name] = this.device.createTexture({ label: name, size: [w, h], format, usage });
    };
    for (const i of [0, 1]) {
      mk(`rad${i}`, 'rgba16float');
      mk(`pos${i}`, 'rgba32float');
      mk(`hist${i}`, 'rgba16float');
      mk(`mom${i}`, 'rgba16float');
      mk(`emitHist${i}`, 'rgba16float');
    }
    mk('alb', 'rgba16float');
    mk('emit', 'rgba16float');
    mk('tmpA', 'rgba16float');
    mk('tmpB', 'rgba16float');
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
    u[40] = this.stats.lightCount; u[41] = settings.maxHistory; u[42] = this.resetPending ? 1 : 0; u[43] = time;
    u[44] = 40; u[45] = 1.0; u[46] = this.frame; u[47] = settings.spp;
    u[48] = settings.lightSamples; u[49] = 0; u[50] = 0; u[51] = 0;
    this.device.queue.writeBuffer(this.uniformBuf, 0, u.buffer, 0, u.byteLength);
  }

  render(cam: CameraState, settings: RenderSettings, time: number): void {
    if (this.renderW === 0) return;
    const device = this.device;
    const cur = this.frame & 1;
    const prev = cur ^ 1;
    const groupsX = Math.ceil(this.renderW / 8);
    const groupsY = Math.ceil(this.renderH / 8);
    const spp = Math.max(1, Math.round(settings.spp));

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
      const passDesc: GPUComputePassDescriptor = {};
      if (s === 0 && this.querySet) passDesc.timestampWrites = { querySet: this.querySet, beginningOfPassWriteIndex: 0 };
      const pass = enc.beginComputePass(passDesc);
      pass.setPipeline(this.tracePipe);
      pass.setBindGroup(0, this.sceneBG);
      pass.setBindGroup(1, bg);
      pass.dispatchWorkgroups(groupsX, groupsY);
      pass.end();
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
        { binding: 3, resource: this.view(`hist${prev}`) },
        { binding: 4, resource: this.view(`mom${prev}`) },
        { binding: 5, resource: this.view(`pos${prev}`) },
        { binding: 6, resource: this.view('tmpA') },
        { binding: 7, resource: this.view(`mom${cur}`) },
        { binding: 8, resource: this.view('emit') },
        { binding: 9, resource: this.view(`emitHist${prev}`) },
        { binding: 10, resource: this.view(`emitHist${cur}`) },
      ]);
      const pass = enc.beginComputePass({ label: 'temporal' });
      pass.setPipeline(this.temporalPipe);
      pass.setBindGroup(0, bg);
      pass.dispatchWorkgroups(groupsX, groupsY);
      pass.end();
    }

    // ---- a-trous passes; pass 0 writes the history used by the next frame.
    const iters = Math.min(MAX_ATROUS, Math.max(1, Math.round(settings.atrousIterations)));
    let input = 'tmpA';
    for (let i = 0; i < iters; i++) {
      const output = i === 0 ? `hist${cur}` : input === 'tmpA' ? 'tmpB' : 'tmpA';
      const bg = this.bindGroup(`atrous${cur}:${input}>${output}:${i}`, this.atrousBGL, () => [
        { binding: 0, resource: { buffer: this.uniformBuf } },
        { binding: 1, resource: this.view(input) },
        { binding: 2, resource: this.view(`pos${cur}`) },
        { binding: 3, resource: this.view('alb') },
        { binding: 4, resource: this.view(output) },
        { binding: 5, resource: { buffer: this.atrousParamBufs[i] } },
      ]);
      const pass = enc.beginComputePass({ label: `atrous ${i}` });
      pass.setPipeline(this.atrousPipe);
      pass.setBindGroup(0, bg);
      pass.dispatchWorkgroups(groupsX, groupsY);
      pass.end();
      input = output;
    }

    // ---- display
    device.queue.writeBuffer(this.displayParamBuf, 0, new Float32Array([settings.exposure, 0.35, this.displayMode, 0]));
    {
      const bg = this.bindGroup(`display:${input}:${cur}`, this.displayBGL, () => [
        { binding: 0, resource: this.sampler },
        { binding: 1, resource: this.view(input) },
        { binding: 2, resource: this.view('alb') },
        { binding: 3, resource: this.view(`emitHist${cur}`) },
        { binding: 4, resource: { buffer: this.displayParamBuf } },
        { binding: 5, resource: this.view(`pos${cur}`) },
        { binding: 6, resource: { buffer: this.uniformBuf } },
      ]);
      const desc: GPURenderPassDescriptor = {
        label: 'display',
        colorAttachments: [{ view: this.gpu.context.getCurrentTexture().createView(), loadOp: 'clear', storeOp: 'store', clearValue: { r: 0, g: 0, b: 0, a: 1 } }],
      };
      if (this.querySet) desc.timestampWrites = { querySet: this.querySet, endOfPassWriteIndex: 1 };
      const pass = enc.beginRenderPass(desc);
      pass.setPipeline(this.displayPipe);
      pass.setBindGroup(0, bg);
      pass.draw(3);
      pass.end();
    }

    // ---- GPU timing readback
    let readSlot: { buf: GPUBuffer; busy: boolean } | undefined;
    if (this.querySet && this.resolveBuf) {
      readSlot = this.readBufs.find((r) => !r.busy);
      if (readSlot) {
        readSlot.busy = true;
        enc.resolveQuerySet(this.querySet, 0, 2, this.resolveBuf, 0);
        enc.copyBufferToBuffer(this.resolveBuf, 0, readSlot.buf, 0, 16);
      }
    }
    device.queue.submit([enc.finish()]);
    if (readSlot) {
      const slot = readSlot;
      slot.buf.mapAsync(GPUMapMode.READ).then(() => {
        const t = new BigUint64Array(slot.buf.getMappedRange());
        const ns = Number(t[1] - t[0]);
        slot.buf.unmap();
        slot.busy = false;
        if (ns > 0 && ns < 60e9) this.gpuMs = ns / 1e6;
        this.stats.gpuMs = this.gpuMs;
      }).catch(() => { slot.busy = false; });
    }

    this.prevCam = { pos: [...cam.pos], fwd: [...cam.fwd], right: [...cam.right], up: [...cam.up], tanHalfFov: cam.tanHalfFov };
    this.resetPending = false;
    this.frame++;
  }
}
