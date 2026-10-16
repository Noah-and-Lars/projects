// Loads the PBR texture set from /textures and uploads it as two texture
// arrays: albedo (rgb) + roughness (a), and tangent-space normal (rgb) + AO (a).
// Mipmaps are built on the CPU with a box filter so the trace shader can pick
// a level from its ray-cone footprint.

export interface TextureManifestEntry {
  name: string;
  /** Metres covered by one repetition of the texture. */
  scale: number;
  /** Roughness multiplier applied on top of the map. */
  roughMul?: number;
}

export interface TextureSet {
  albedo: GPUTexture;
  normal: GPUTexture;
  sampler: GPUSampler;
  /** name -> array layer */
  layers: Map<string, number>;
  size: number;
  mipLevels: number;
}

export const TEXTURE_MANIFEST: TextureManifestEntry[] = [
  { name: 'asphalt', scale: 5 },
  { name: 'paving', scale: 2.5 },
  { name: 'brick', scale: 3 },
  { name: 'brick2', scale: 2.6 },
  { name: 'concrete', scale: 4 },
  { name: 'concrete2', scale: 3.5 },
  { name: 'corrugated', scale: 1.8 },
  { name: 'metal', scale: 2 },
];

const SIZE = 1024;

async function loadImage(url: string): Promise<ImageBitmap | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const blob = await res.blob();
    return await createImageBitmap(blob, { colorSpaceConversion: 'none', premultiplyAlpha: 'none' });
  } catch {
    return null;
  }
}

function toPixels(bmp: ImageBitmap | null): Uint8ClampedArray | null {
  if (!bmp) return null;
  const canvas = new OffscreenCanvas(SIZE, SIZE);
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(bmp, 0, 0, SIZE, SIZE);
  return ctx.getImageData(0, 0, SIZE, SIZE).data;
}

/** Box-filter one mip level down (RGBA8). */
function downsample(src: Uint8Array, w: number, h: number): Uint8Array {
  const dw = Math.max(1, w >> 1), dh = Math.max(1, h >> 1);
  const dst = new Uint8Array(dw * dh * 4);
  for (let y = 0; y < dh; y++) {
    for (let x = 0; x < dw; x++) {
      for (let c = 0; c < 4; c++) {
        const x0 = Math.min(w - 1, x * 2), x1 = Math.min(w - 1, x * 2 + 1);
        const y0 = Math.min(h - 1, y * 2), y1 = Math.min(h - 1, y * 2 + 1);
        const s = src[(y0 * w + x0) * 4 + c] + src[(y0 * w + x1) * 4 + c] + src[(y1 * w + x0) * 4 + c] + src[(y1 * w + x1) * 4 + c];
        dst[(y * dw + x) * 4 + c] = (s + 2) >> 2;
      }
    }
  }
  return dst;
}

function uploadWithMips(device: GPUDevice, tex: GPUTexture, layer: number, base: Uint8Array, mipLevels: number): void {
  let data = base;
  let w = SIZE, h = SIZE;
  for (let level = 0; level < mipLevels; level++) {
    device.queue.writeTexture(
      { texture: tex, mipLevel: level, origin: [0, 0, layer] },
      data.buffer as ArrayBuffer,
      { offset: data.byteOffset, bytesPerRow: w * 4, rowsPerImage: h },
      [w, h, 1],
    );
    if (level + 1 < mipLevels) {
      data = downsample(data, w, h);
      w = Math.max(1, w >> 1);
      h = Math.max(1, h >> 1);
    }
  }
}

export async function loadTextureSet(device: GPUDevice, baseUrl = 'textures/', onProgress?: (done: number, total: number) => void): Promise<TextureSet> {
  const entries = TEXTURE_MANIFEST;
  const mipLevels = Math.floor(Math.log2(SIZE)) + 1;
  const usage = GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST;
  const albedo = device.createTexture({ label: 'albedo+rough array', size: [SIZE, SIZE, entries.length], format: 'rgba8unorm-srgb', mipLevelCount: mipLevels, usage });
  const normal = device.createTexture({ label: 'normal+ao array', size: [SIZE, SIZE, entries.length], format: 'rgba8unorm', mipLevelCount: mipLevels, usage });
  const layers = new Map<string, number>();

  let done = 0;
  await Promise.all(entries.map(async (e, layer) => {
    const [alb, rgh, nrm, ao] = await Promise.all([
      loadImage(`${baseUrl}${e.name}.alb.jpg`),
      loadImage(`${baseUrl}${e.name}.rgh.jpg`),
      loadImage(`${baseUrl}${e.name}.nrm.jpg`),
      loadImage(`${baseUrl}${e.name}.ao.jpg`),
    ]);
    const a = toPixels(alb), r = toPixels(rgh), n = toPixels(nrm), o = toPixels(ao);
    const packedA = new Uint8Array(SIZE * SIZE * 4);
    const packedN = new Uint8Array(SIZE * SIZE * 4);
    const roughMul = e.roughMul ?? 1;
    for (let i = 0; i < SIZE * SIZE; i++) {
      const j = i * 4;
      if (a) { packedA[j] = a[j]; packedA[j + 1] = a[j + 1]; packedA[j + 2] = a[j + 2]; }
      else { packedA[j] = packedA[j + 1] = packedA[j + 2] = 128; }
      packedA[j + 3] = Math.min(255, Math.round((r ? r[j] : 150) * roughMul));
      if (n) { packedN[j] = n[j]; packedN[j + 1] = n[j + 1]; packedN[j + 2] = n[j + 2]; }
      else { packedN[j] = 128; packedN[j + 1] = 128; packedN[j + 2] = 255; }
      packedN[j + 3] = o ? o[j] : 255;
    }
    uploadWithMips(device, albedo, layer, packedA, mipLevels);
    uploadWithMips(device, normal, layer, packedN, mipLevels);
    layers.set(e.name, layer);
    done++;
    onProgress?.(done, entries.length);
  }));

  const sampler = device.createSampler({
    magFilter: 'linear', minFilter: 'linear', mipmapFilter: 'linear',
    addressModeU: 'repeat', addressModeV: 'repeat', maxAnisotropy: 8,
  });
  return { albedo, normal, sampler, layers, size: SIZE, mipLevels };
}

/** Texture layer index for a manifest name, or -1 when missing. */
export function textureLayer(name: string): number {
  const i = TEXTURE_MANIFEST.findIndex((e) => e.name === name);
  return i;
}

export function textureScale(name: string): number {
  return TEXTURE_MANIFEST.find((e) => e.name === name)?.scale ?? 1;
}
