// GPU shallow-water + ripple simulation over the street (see water.wgsl).

import waterWgsl from './shaders/water.wgsl?raw';

export const WATER_GRID = {
  originX: -8.5,
  originZ: -20,
  cell: 0.1,
  width: 170,   // texels across the street
  height: 1500, // texels along it
};

export interface WaterImpulse {
  x: number;
  z: number;
  radius: number;
  strength: number;
}

const PARAM_FLOATS = 48; // 192 bytes

export class WaterSim {
  private readonly params: GPUBuffer;
  private readonly data = new Float32Array(PARAM_FLOATS);
  readonly ground: GPUTexture;
  /** Stand-in for storage slots a pass does not write (a texture may not be read and written in one bind group). */
  private readonly scratch: GPUTexture;
  private readonly depth: [GPUTexture, GPUTexture];
  private readonly wave: [GPUTexture, GPUTexture];
  readonly surface: GPUTexture;
  readonly sampler: GPUSampler;
  private readonly layout: GPUBindGroupLayout;
  private readonly pipes: Record<'initGround' | 'flow' | 'wave' | 'finalize', GPUComputePipeline>;
  private parity = 0;
  private frame = 0;
  private initialized = false;

  constructor(private readonly device: GPUDevice) {
    const g = WATER_GRID;
    const usage = GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.TEXTURE_BINDING;
    const mk = (format: GPUTextureFormat, label: string) =>
      device.createTexture({ label, size: [g.width, g.height], format, usage });
    this.ground = mk('r32float', 'water ground');
    this.scratch = mk('r32float', 'water scratch');
    this.depth = [mk('r32float', 'water depth 0'), mk('r32float', 'water depth 1')];
    this.wave = [mk('rg32float', 'water wave 0'), mk('rg32float', 'water wave 1')];
    this.surface = mk('rgba16float', 'water surface');
    this.sampler = device.createSampler({ magFilter: 'linear', minFilter: 'linear', addressModeU: 'clamp-to-edge', addressModeV: 'clamp-to-edge' });
    this.params = device.createBuffer({ label: 'water params', size: PARAM_FLOATS * 4, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });

    const C = GPUShaderStage.COMPUTE;
    this.layout = device.createBindGroupLayout({
      label: 'water',
      entries: [
        { binding: 0, visibility: C, buffer: { type: 'uniform' } },
        { binding: 1, visibility: C, texture: { sampleType: 'unfilterable-float' } },
        { binding: 2, visibility: C, texture: { sampleType: 'unfilterable-float' } },
        { binding: 3, visibility: C, texture: { sampleType: 'unfilterable-float' } },
        { binding: 4, visibility: C, storageTexture: { access: 'write-only', format: 'r32float' } },
        { binding: 5, visibility: C, storageTexture: { access: 'write-only', format: 'r32float' } },
        { binding: 6, visibility: C, storageTexture: { access: 'write-only', format: 'rg32float' } },
        { binding: 7, visibility: C, storageTexture: { access: 'write-only', format: 'rgba16float' } },
      ],
    });
    const module = device.createShaderModule({ label: 'water', code: waterWgsl });
    const pipe = (entryPoint: string) =>
      device.createComputePipeline({ label: `water ${entryPoint}`, layout: device.createPipelineLayout({ bindGroupLayouts: [this.layout] }), compute: { module, entryPoint } });
    this.pipes = { initGround: pipe('initGround'), flow: pipe('flow'), wave: pipe('wave'), finalize: pipe('finalize') };

    const d = this.data;
    d[0] = g.originX; d[1] = g.originZ; d[2] = g.cell; d[3] = 1 / 60;
    d[4] = g.width; d[5] = g.height;
  }

  private bindGroup(groundIn: GPUTexture, depthIn: GPUTexture, waveIn: GPUTexture, groundOut: GPUTexture, depthOut: GPUTexture, waveOut: GPUTexture): GPUBindGroup {
    return this.device.createBindGroup({
      layout: this.layout,
      entries: [
        { binding: 0, resource: { buffer: this.params } },
        { binding: 1, resource: groundIn.createView() },
        { binding: 2, resource: depthIn.createView() },
        { binding: 3, resource: waveIn.createView() },
        { binding: 4, resource: groundOut.createView() },
        { binding: 5, resource: depthOut.createView() },
        { binding: 6, resource: waveOut.createView() },
        { binding: 7, resource: this.surface.createView() },
      ],
    });
  }

  /** World-space extent for samplers: origin xz and size in metres. */
  get extent(): [number, number, number, number] {
    const g = WATER_GRID;
    return [g.originX, g.originZ, g.width * g.cell, g.height * g.cell];
  }

  /** Run the simulation for `seconds` of rain so puddles already exist at startup. */
  warm(seconds: number, rainRate: number): void {
    const n = Math.max(1, Math.round(seconds * 60));
    for (let i = 0; i < n; i++) this.step(1 / 60, i / 60, rainRate, [], true);
  }

  /**
   * Advance the simulation and refresh the surface texture. Submits its own
   * command buffer; call before the renderer encodes the frame.
   */
  step(dt: number, time: number, rainRate: number, impulses: WaterImpulse[], single = false): void {
    const g = WATER_GRID;
    const d = this.data;
    const steps = single || !this.initialized ? 1 : Math.max(1, Math.min(3, Math.round(dt * 60)));
    d[3] = Math.min(dt, 0.05) / steps;
    d[6] = rainRate;
    d[7] = time;
    d[8] = 0.22;  // flowK
    d[9] = 0.4;   // waveSpeed (cells per step, < 0.5 for stability)
    d[10] = 0.985; // damping
    const n = Math.min(8, impulses.length);
    for (let i = 0; i < 8; i++) {
      const o = 12 + i * 4;
      if (i < n) { d[o] = impulses[i].x; d[o + 1] = impulses[i].z; d[o + 2] = impulses[i].radius; d[o + 3] = impulses[i].strength; }
      else { d[o] = 0; d[o + 1] = 0; d[o + 2] = 0; d[o + 3] = 0; }
    }
    d[44] = n;

    const gx = Math.ceil(g.width / 8), gy = Math.ceil(g.height / 8);
    const dispatch = (enc: GPUCommandEncoder, pipe: GPUComputePipeline, bg: GPUBindGroup) => {
      const pass = enc.beginComputePass();
      pass.setPipeline(pipe);
      pass.setBindGroup(0, bg);
      pass.dispatchWorkgroups(gx, gy);
      pass.end();
    };

    for (let s = 0; s < steps; s++) {
      d[11] = this.frame++;
      this.device.queue.writeBuffer(this.params, 0, d.buffer, 0, d.byteLength);
      const enc = this.device.createCommandEncoder({ label: 'water' });
      const cur = this.parity, nxt = cur ^ 1;
      if (!this.initialized) {
        dispatch(enc, this.pipes.initGround, this.bindGroup(this.scratch, this.depth[nxt], this.wave[nxt], this.ground, this.depth[cur], this.wave[cur]));
        this.initialized = true;
      }
      // flow: depth[cur] -> depth[nxt]
      dispatch(enc, this.pipes.flow, this.bindGroup(this.ground, this.depth[cur], this.wave[cur], this.scratch, this.depth[nxt], this.wave[nxt]));
      // wave: reads depth[nxt], wave[cur] -> wave[nxt]
      dispatch(enc, this.pipes.wave, this.bindGroup(this.ground, this.depth[nxt], this.wave[cur], this.scratch, this.depth[cur], this.wave[nxt]));
      // finalize: depth[nxt], wave[nxt] -> surface
      dispatch(enc, this.pipes.finalize, this.bindGroup(this.ground, this.depth[nxt], this.wave[nxt], this.scratch, this.depth[cur], this.wave[cur]));
      this.device.queue.submit([enc.finish()]);
      this.parity = nxt;
      // Only the first sub-step carries the one-off impulses.
      d[44] = 0;
    }
  }
}
