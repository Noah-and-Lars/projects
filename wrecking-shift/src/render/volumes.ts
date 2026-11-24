/**
 * three.js r187 side of the world occupancy volumes: Data3DTextures + sub-box uploads.
 * three has no partial-update path for 3D textures (updateRanges is 2D only), so sub-boxes are uploaded with
 * raw texSubImage3D through `renderer.state` (keeps three's binding / pixel-store caches coherent).
 */
import * as THREE from 'three';
import type { Sim } from '../sim/sim';
import type { UpdateResult } from './occupancy';
import { VOXEL } from '../sim/materials';
import { WorldOccupancy, type Bounds } from './worldOccupancy';

export interface VolumeUniforms {
  uBits: { value: THREE.Data3DTexture };
  uDens: { value: THREE.Data3DTexture };
  uVolSize: { value: THREE.Vector3 };
  uVolOrigin: { value: THREE.Vector3 };
  uInvVoxel: { value: number };
}

export class VoxelVolumes {
  readonly bitTex: THREE.Data3DTexture;
  readonly densTex: THREE.Data3DTexture;
  /** stats */
  uploads = 0; lastUploadMs = 0; buildMs = 0;
  /** max voxels re-stamped per frame when not doing a full sync */
  budgetVoxels = 3_000_000;

  private constructor(private three: THREE.WebGLRenderer, readonly world: WorldOccupancy) {
    const occ = world.occ;
    // R8UI integer texture: must be Nearest, no mips (else incomplete -> reads 0)
    const bt = new THREE.Data3DTexture(occ.bits, occ.bx, occ.by, occ.bz);
    bt.format = THREE.RedIntegerFormat; bt.type = THREE.UnsignedByteType; bt.internalFormat = 'R8UI';
    bt.minFilter = bt.magFilter = THREE.NearestFilter;
    bt.generateMipmaps = false; bt.unpackAlignment = 1; bt.needsUpdate = true;
    this.bitTex = bt;
    const m0 = occ.mips[0];
    const dt = new THREE.Data3DTexture(m0.data, m0.sx, m0.sy, m0.sz);
    dt.format = THREE.RedFormat; dt.type = THREE.UnsignedByteType;
    dt.minFilter = THREE.LinearMipmapLinearFilter; dt.magFilter = THREE.LinearFilter;
    dt.wrapS = dt.wrapT = dt.wrapR = THREE.ClampToEdgeWrapping;
    dt.generateMipmaps = true; // three: texStorage3D(floor(log2(max(w,h)))+1 levels) + one generateMipmap
    dt.unpackAlignment = 1; dt.needsUpdate = true;
    this.densTex = dt;
  }

  /** Build volumes for the current sim. Returns null (after cleaning up) if allocation fails. */
  static create(three: THREE.WebGLRenderer, sim: Sim, bounds: Bounds, maxBytes: number, focus?: { x: number; z: number }): VoxelVolumes | null {
    const gl = three.getContext() as WebGL2RenderingContext;
    if (typeof WebGL2RenderingContext === 'undefined' || !(gl instanceof WebGL2RenderingContext)) return null;
    let v: VoxelVolumes | null = null;
    try {
      const t0 = performance.now();
      const maxTex = Math.min(2048, gl.getParameter(gl.MAX_3D_TEXTURE_SIZE) | 0);
      if (maxTex < 64) return null;
      const world = WorldOccupancy.create(sim, bounds, maxTex, maxBytes, focus);
      v = new VoxelVolumes(three, world);
      while (gl.getError() !== gl.NO_ERROR) { /* drain */ }
      three.initTexture(v.bitTex);
      three.initTexture(v.densTex);
      // replace the GPU-generated mips with the CPU mirror so later sub-box updates are consistent
      const occ = world.occ;
      for (let l = 1; l < occ.mips.length; l++) {
        const m = occ.mips[l];
        v.uploadBox(v.densTex, m.data, m.sx, m.sy, 0, 0, 0, m.sx, m.sy, m.sz, gl.RED, l);
      }
      const err = gl.getError();
      if (err !== gl.NO_ERROR) throw new Error('GL error 0x' + err.toString(16) + ' while allocating occupancy volumes');
      v.buildMs = performance.now() - t0;
      return v;
    } catch (e) {
      console.warn('[render] occupancy volumes unavailable, falling back to shadow maps:', e);
      v?.dispose();
      return null;
    }
  }

  uniforms(): VolumeUniforms {
    const o = this.world.origin, occ = this.world.occ;
    return {
      uBits: { value: this.bitTex }, uDens: { value: this.densTex },
      uVolSize: { value: new THREE.Vector3(occ.nx, occ.ny, occ.nz) },
      uVolOrigin: { value: new THREE.Vector3(o[0], o[1], o[2]) },
      uInvVoxel: { value: 1 / VOXEL },
    };
  }

  /** bytes of GPU memory (the CPU mirror costs the same again) */
  get byteLength(): number { return this.world.occ.byteLength; }

  private uploadBox(tex: THREE.Data3DTexture, data: Uint8Array, rowLen: number, imgH: number, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, glFormat: number, level: number): void {
    const w = x1 - x0, h = y1 - y0, d = z1 - z0;
    if (w <= 0 || h <= 0 || d <= 0) return;
    const three = this.three;
    const gl = three.getContext() as WebGL2RenderingContext;
    const props = three.properties.get(tex) as { __webglTexture?: WebGLTexture };
    if (!props.__webglTexture) three.initTexture(tex);
    const st = three.state as any;
    st.activeTexture(gl.TEXTURE0);
    st.bindTexture(gl.TEXTURE_3D, props.__webglTexture);
    st.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    st.pixelStorei(gl.UNPACK_ROW_LENGTH, rowLen);
    st.pixelStorei(gl.UNPACK_IMAGE_HEIGHT, imgH);
    st.pixelStorei(gl.UNPACK_SKIP_PIXELS, x0);
    st.pixelStorei(gl.UNPACK_SKIP_ROWS, y0);
    st.pixelStorei(gl.UNPACK_SKIP_IMAGES, z0);
    gl.texSubImage3D(gl.TEXTURE_3D, level, x0, y0, z0, w, h, d, glFormat, gl.UNSIGNED_BYTE, data);
    st.pixelStorei(gl.UNPACK_ROW_LENGTH, 0);
    st.pixelStorei(gl.UNPACK_IMAGE_HEIGHT, 0);
    st.pixelStorei(gl.UNPACK_SKIP_PIXELS, 0);
    st.pixelStorei(gl.UNPACK_SKIP_ROWS, 0);
    st.pixelStorei(gl.UNPACK_SKIP_IMAGES, 0);
  }

  private upload = (r: UpdateResult): void => {
    const gl = this.three.getContext() as WebGL2RenderingContext;
    const occ = this.world.occ;
    const b = r.bits;
    this.uploadBox(this.bitTex, occ.bits, occ.bx, occ.by, b[0], b[1], b[2], b[3], b[4], b[5], gl.RED_INTEGER, 0);
    for (let l = 0; l < occ.mips.length; l++) {
      const m = occ.mips[l], q = r.mips[l];
      this.uploadBox(this.densTex, m.data, m.sx, m.sy, q[0], q[1], q[2], q[3], q[4], q[5], gl.RED, l);
    }
    this.uploads++;
  };

  /** mirror sim changes (new / removed static bodies, voxel edits) into the textures. Call once per frame, before meshing. */
  update(sim: Sim, full: boolean): void {
    this.world.collect(sim);
    if (this.world.pending === 0) return;
    const t0 = performance.now();
    this.world.flush(this.upload, full ? Infinity : this.budgetVoxels);
    this.lastUploadMs = performance.now() - t0;
  }

  dispose(): void {
    this.bitTex.dispose();
    this.densTex.dispose();
  }
}
