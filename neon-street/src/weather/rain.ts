// Rain: GPU particles around the camera, drawn as lit streaks and splashes
// into the HDR image after denoising (see rain.wgsl).

import type { Vec3 } from '../core/math';
import commonWgsl from '../renderer/shaders/common.wgsl?raw';
import rainWgsl from './shaders/rain.wgsl?raw';
import { WATER_GRID } from './water';

export const MAX_DROPS = 60000;

export class RainSystem {
  private readonly params: GPUBuffer;
  private readonly data = new Float32Array(24);
  /** Drone position and downwash strength for particle deflection. */
  drone: { pos: Vec3; strength: number } | null = null;
  private readonly particles: GPUBuffer;
  private readonly emitterBuf: GPUBuffer;
  private readonly emitterCount: number;
  private readonly updatePipe: GPUComputePipeline;
  private readonly drawPipe: GPURenderPipeline;
  private readonly simBG: GPUBindGroup;
  private readonly drawBGL: GPUBindGroupLayout;
  private readonly probeSampler: GPUSampler;
  private drawBGs = new Map<string, GPUBindGroup>();
  private frame = 0;
  active = 0;

  constructor(private readonly device: GPUDevice, groundTex: GPUTexture, dripEdges: [Vec3, Vec3][], hdrFormat: GPUTextureFormat) {
    // Particles start scattered above the spawn point; the update kernel wraps
    // them around the camera as it moves.
    const init = new Float32Array(MAX_DROPS * 8);
    for (let i = 0; i < MAX_DROPS; i++) {
      const o = i * 8;
      init[o] = (Math.random() * 2 - 1) * 9;
      init[o + 1] = Math.random() * 14;
      init[o + 2] = -6 + (Math.random() * 2 - 1) * 9;
      init[o + 3] = 0;
      init[o + 4] = 0;
      init[o + 5] = -(7.5 + Math.random() * 3);
      init[o + 6] = 0;
      init[o + 7] = 0;
    }
    this.particles = device.createBuffer({ label: 'rain particles', size: init.byteLength, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
    device.queue.writeBuffer(this.particles, 0, init.buffer as ArrayBuffer);

    this.emitterCount = dripEdges.length;
    const em = new Float32Array(Math.max(1, dripEdges.length) * 8);
    dripEdges.forEach(([a, b], i) => { em.set([a[0], a[1], a[2], 0, b[0], b[1], b[2], 0], i * 8); });
    this.emitterBuf = device.createBuffer({ label: 'drip emitters', size: em.byteLength, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
    device.queue.writeBuffer(this.emitterBuf, 0, em.buffer as ArrayBuffer);

    this.params = device.createBuffer({ label: 'rain params', size: 96, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    this.probeSampler = device.createSampler({ magFilter: 'linear', minFilter: 'linear', addressModeU: 'clamp-to-edge', addressModeV: 'clamp-to-edge', addressModeW: 'clamp-to-edge' });

    const C = GPUShaderStage.COMPUTE, V = GPUShaderStage.VERTEX, F = GPUShaderStage.FRAGMENT;
    const simBGL = device.createBindGroupLayout({
      label: 'rain sim',
      entries: [
        { binding: 0, visibility: C, buffer: { type: 'uniform' } },
        { binding: 1, visibility: C, buffer: { type: 'storage' } },
        { binding: 2, visibility: C, buffer: { type: 'read-only-storage' } },
        { binding: 3, visibility: C, texture: { sampleType: 'unfilterable-float' } },
      ],
    });
    // The draw pass only needs the parameters from group 0; particles come in
    // read-only through group 1 (vertex shaders cannot bind writable storage).
    const drawSimBGL = device.createBindGroupLayout({
      label: 'rain sim (draw)',
      entries: [{ binding: 0, visibility: V | F, buffer: { type: 'uniform' } }],
    });
    this.drawBGL = device.createBindGroupLayout({
      label: 'rain draw',
      entries: [
        { binding: 0, visibility: V | F, buffer: { type: 'uniform' } },
        { binding: 1, visibility: F, texture: { sampleType: 'unfilterable-float' } },
        { binding: 2, visibility: V, texture: { sampleType: 'float', viewDimension: '3d' } },
        { binding: 3, visibility: V, sampler: { type: 'filtering' } },
        { binding: 4, visibility: V, buffer: { type: 'read-only-storage' } },
      ],
    });
    const module = device.createShaderModule({ label: 'rain', code: commonWgsl + '\n' + rainWgsl });
    this.updatePipe = device.createComputePipeline({
      label: 'rain update',
      layout: device.createPipelineLayout({ bindGroupLayouts: [simBGL] }),
      compute: { module, entryPoint: 'update' },
    });
    this.drawPipe = device.createRenderPipeline({
      label: 'rain draw',
      layout: device.createPipelineLayout({ bindGroupLayouts: [drawSimBGL, this.drawBGL] }),
      vertex: { module, entryPoint: 'vs' },
      fragment: {
        module, entryPoint: 'fs',
        targets: [{ format: hdrFormat, blend: { color: { srcFactor: 'one', dstFactor: 'one', operation: 'add' }, alpha: { srcFactor: 'one', dstFactor: 'one', operation: 'add' } } }],
      },
      primitive: { topology: 'triangle-list' },
    });
    this.simBG = device.createBindGroup({
      layout: simBGL,
      entries: [
        { binding: 0, resource: { buffer: this.params } },
        { binding: 1, resource: { buffer: this.particles } },
        { binding: 2, resource: { buffer: this.emitterBuf } },
        { binding: 3, resource: groundTex.createView() },
      ],
    });
    this.drawSimBG = device.createBindGroup({ layout: drawSimBGL, entries: [{ binding: 0, resource: { buffer: this.params } }] });
  }

  private drawSimBG: GPUBindGroup;

  /** Advance the particles (submits its own command buffer). */
  update(dt: number, time: number, camPos: Vec3, drops: number, rain: number): void {
    this.active = Math.min(MAX_DROPS, Math.max(0, Math.round(drops * rain)));
    const d = this.data;
    d[0] = camPos[0]; d[1] = camPos[1]; d[2] = camPos[2]; d[3] = Math.min(dt, 0.05);
    d[4] = 0.6; d[5] = 0; d[6] = 0.25; d[7] = time;
    d[8] = this.active; d[9] = Math.min(this.active, Math.round(this.active * 0.06)); d[10] = this.emitterCount; d[11] = this.frame++;
    d[12] = WATER_GRID.originX; d[13] = WATER_GRID.originZ; d[14] = WATER_GRID.cell; d[15] = 0;
    d[16] = 0.022; d[17] = 0.045; d[18] = 24; d[19] = 0;
    if (this.drone) { d[20] = this.drone.pos[0]; d[21] = this.drone.pos[1]; d[22] = this.drone.pos[2]; d[23] = this.drone.strength; }
    else { d[20] = 0; d[21] = 0; d[22] = 0; d[23] = 0; }
    this.device.queue.writeBuffer(this.params, 0, d.buffer, 0, d.byteLength);
    if (this.active === 0) return;
    const enc = this.device.createCommandEncoder({ label: 'rain update' });
    const pass = enc.beginComputePass();
    pass.setPipeline(this.updatePipe);
    pass.setBindGroup(0, this.simBG);
    pass.dispatchWorkgroups(Math.ceil(this.active / 64));
    pass.end();
    this.device.queue.submit([enc.finish()]);
  }

  /** Draw streaks and splashes additively into the HDR target. */
  draw(enc: GPUCommandEncoder, hdrView: GPUTextureView, key: string, uniformBuf: GPUBuffer, posView: GPUTextureView, probeView: GPUTextureView): void {
    if (this.active === 0) return;
    let bg = this.drawBGs.get(key);
    if (!bg) {
      bg = this.device.createBindGroup({
        layout: this.drawBGL,
        entries: [
          { binding: 0, resource: { buffer: uniformBuf } },
          { binding: 1, resource: posView },
          { binding: 2, resource: probeView },
          { binding: 3, resource: this.probeSampler },
          { binding: 4, resource: { buffer: this.particles } },
        ],
      });
      this.drawBGs.set(key, bg);
    }
    const pass = enc.beginRenderPass({ label: 'rain', colorAttachments: [{ view: hdrView, loadOp: 'load', storeOp: 'store' }] });
    pass.setPipeline(this.drawPipe);
    pass.setBindGroup(0, this.drawSimBG);
    pass.setBindGroup(1, bg);
    pass.draw(6, this.active);
    pass.end();
  }

  /** Forget cached bind groups when the renderer recreates its textures. */
  invalidate(): void {
    this.drawBGs.clear();
  }
}
