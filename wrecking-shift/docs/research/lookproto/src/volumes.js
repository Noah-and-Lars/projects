// three.js r187 side of the occupancy volumes: creation + sub-region (texSubImage3D) updates.
import * as THREE from 'three';
import { bitDims, densDims, buildBitVolume, buildDensityVolume, updateBitRegion, updateDensityRegion, buildDensityMips, updateDensityMipsRegion, COARSE } from './world.js';

export function createVolumes(world) {
  const [bx, by, bz] = bitDims(world);
  const [cx, cy, cz] = densDims(world);
  const bits = buildBitVolume(world);
  const dens = buildDensityVolume(world);

  // R8UI integer texture: format RedIntegerFormat + UnsignedByteType -> internalFormat R8UI.
  // Integer textures MUST use NearestFilter and no mipmaps (else incomplete -> reads return 0).
  const bitTex = new THREE.Data3DTexture(bits, bx, by, bz);
  bitTex.format = THREE.RedIntegerFormat;
  bitTex.type = THREE.UnsignedByteType;
  bitTex.internalFormat = 'R8UI';
  bitTex.minFilter = bitTex.magFilter = THREE.NearestFilter;
  bitTex.generateMipmaps = false;
  bitTex.unpackAlignment = 1;
  bitTex.needsUpdate = true;

  // R8 normalized texture with trilinear filtering (density / skip level).
  const densTex = new THREE.Data3DTexture(dens, cx, cy, cz);
  densTex.format = THREE.RedFormat;
  densTex.type = THREE.UnsignedByteType;
  // Mipmapped: three allocates texStorage3D(levels = log2(max(w,h))+1) and runs gl.generateMipmap
  // once on the first upload; later edits upload CPU-computed mip sub-boxes (updateVolumesRegion).
  densTex.minFilter = THREE.LinearMipmapLinearFilter; densTex.magFilter = THREE.LinearFilter;
  densTex.wrapS = densTex.wrapT = densTex.wrapR = THREE.ClampToEdgeWrapping;
  densTex.generateMipmaps = true;
  const levels = Math.floor(Math.log2(Math.max(cx, cy))) + 1; // what three allocates (it ignores depth)
  const mips = buildDensityMips(dens, [cx, cy, cz], levels);
  densTex.unpackAlignment = 1;
  densTex.needsUpdate = true;

  return { bits, dens, mips, bitTex, densTex, bitSize: [bx, by, bz], densSize: [cx, cy, cz] };
}

// Upload the sub-box [x0,x1)x[y0,y1)x[z0,z1) (texel coords) of `data` (full CPU mirror of the
// texture) into the GPU texture with ONE texSubImage3D, without copying, using UNPACK_ROW_LENGTH /
// UNPACK_IMAGE_HEIGHT / UNPACK_SKIP_* so the source is read directly from the full array.
// three.js r187 has no partial-update path for Data3DTexture (texture.updateRanges is only
// honoured for 2D DataTextures; needsUpdate re-uploads everything), so we use raw GL through
// renderer.state to keep three's state cache coherent.
export function uploadSubBox(renderer, tex, data, size, x0, y0, z0, x1, y1, z1, glFormat, level = 0) {
  const gl = renderer.getContext();
  const props = renderer.properties.get(tex);
  if (!props.__webglTexture) { renderer.initTexture(tex); }
  const w = x1 - x0, h = y1 - y0, d = z1 - z0;
  if (w <= 0 || h <= 0 || d <= 0) return;
  const st = renderer.state;
  st.activeTexture(gl.TEXTURE0);
  st.bindTexture(gl.TEXTURE_3D, props.__webglTexture);
  st.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
  st.pixelStorei(gl.UNPACK_ROW_LENGTH, size[0]);
  st.pixelStorei(gl.UNPACK_IMAGE_HEIGHT, size[1]);
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

// After editing `world` voxels inside voxel box [x0,x1)..: recompute CPU mirrors and upload.
export function updateVolumesRegion(renderer, world, vol, x0, y0, z0, x1, y1, z1) {
  const gl = renderer.getContext();
  const [b0, b1] = updateBitRegion(world, vol.bits, x0, y0, z0, x1, y1, z1);
  uploadSubBox(renderer, vol.bitTex, vol.bits, vol.bitSize, b0[0], b0[1], b0[2], b1[0], b1[1], b1[2], gl.RED_INTEGER);
  const [c0, c1] = updateDensityRegion(world, vol.dens, x0, y0, z0, x1, y1, z1);
  const boxes = updateDensityMipsRegion(vol.mips, c0, c1);
  boxes.forEach(([a, b], k) => uploadSubBox(renderer, vol.densTex, vol.mips[k].data, vol.mips[k].size, a[0], a[1], a[2], b[0], b[1], b[2], gl.RED, k));
}

export function volumeUniforms(world, vol, VS, origin = new THREE.Vector3()) {
  return {
    uBits: { value: vol.bitTex },
    uDens: { value: vol.densTex },
    uVolSize: { value: new THREE.Vector3(world.nx, world.ny, world.nz) },
    uVolOrigin: { value: origin.clone() },
    uVoxelSize: { value: VS },
  };
}
export { COARSE };
