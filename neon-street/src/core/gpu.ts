// WebGPU device setup. Everything else in the renderer receives a `Gpu`.

export interface Gpu {
  adapter: GPUAdapter;
  device: GPUDevice;
  context: GPUCanvasContext;
  format: GPUTextureFormat;
  canvas: HTMLCanvasElement;
  /** GPU timing is available when the adapter exposes timestamp queries. */
  hasTimestamps: boolean;
  adapterName: string;
}

export class GpuUnavailableError extends Error {}

export async function initGpu(canvas: HTMLCanvasElement): Promise<Gpu> {
  if (!('gpu' in navigator) || !navigator.gpu) {
    throw new GpuUnavailableError('This browser does not expose WebGPU (navigator.gpu is missing).');
  }
  const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
  if (!adapter) {
    throw new GpuUnavailableError('No WebGPU adapter was found. Check that hardware acceleration is enabled.');
  }

  const hasTimestamps = adapter.features.has('timestamp-query');
  const requiredFeatures: GPUFeatureName[] = [];
  if (hasTimestamps) requiredFeatures.push('timestamp-query');

  // Ask for generous storage limits; the scene buffers are small but the
  // accumulation textures at Melt (2x supersampling) are not.
  const device = await adapter.requestDevice({
    requiredFeatures,
    requiredLimits: {
      maxStorageBufferBindingSize: adapter.limits.maxStorageBufferBindingSize,
      maxBufferSize: adapter.limits.maxBufferSize,
      maxTextureDimension2D: adapter.limits.maxTextureDimension2D,
    },
  });

  const context = canvas.getContext('webgpu');
  if (!context) throw new GpuUnavailableError('Could not create a WebGPU canvas context.');
  const format = navigator.gpu.getPreferredCanvasFormat();
  context.configure({ device, format, alphaMode: 'opaque' });

  const info = (adapter as GPUAdapter & { info?: GPUAdapterInfo }).info;
  const adapterName = info
    ? [info.description, info.device, info.architecture, info.vendor].find((s) => s && s.length > 0) ?? 'unknown GPU'
    : 'unknown GPU';

  return { adapter, device, context, format, canvas, hasTimestamps, adapterName };
}
