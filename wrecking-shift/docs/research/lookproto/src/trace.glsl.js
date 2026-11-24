// GLSL ES 3.00 voxel tracing through a world-space occupancy volume.
// Tested in three.js r187 (WebGL2) against the CPU reference `cpuTrace` in world.js
// (see test_dda.html / test_dda.mjs).
//
// Textures:
//   uBits : Data3DTexture, RedIntegerFormat + UnsignedByteType (internal R8UI), NearestFilter,
//           size = ceil(N/2) per axis; 1 byte = 2x2x2 voxels, bit = (x&1)|(y&1)<<1|(z&1)<<2
//   uDens : Data3DTexture, RedFormat + UnsignedByteType (internal R8), LinearMipmapLinearFilter,
//           size = ceil(N/COARSE) per axis; value = solid fraction of the COARSE^3 cell (>0 if any solid)
//           Used (a) as the empty-space-skipping level of the DDA (texelFetch > 0)
//                (b) as a mipmapped density field for noise-free cone AO (textureLod).
// All trace inputs are in VOXEL units: p_vox = (p_world - uVolOrigin) / uVoxelSize.
export const TRACE_COARSE = 4;

export const TRACE_GLSL = /* glsl */`
uniform highp usampler3D uBits;
uniform highp sampler3D uDens;
uniform vec3 uVolSize;     // volume size in voxels (float)
uniform vec3 uVolOrigin;   // world position of voxel (0,0,0)'s min corner
uniform float uVoxelSize;  // 0.1

#define VX_COARSE ${TRACE_COARSE}
#ifndef VX_MAX_COARSE_STEPS
#define VX_MAX_COARSE_STEPS 256
#endif

bool vxSolid(ivec3 v) { // v must be inside the volume
  uint b = texelFetch(uBits, v >> 1, 0).r;
  uint bit = uint((v.x & 1) | ((v.y & 1) << 1) | ((v.z & 1) << 2));
  return ((b >> bit) & 1u) != 0u;
}
bool vxSolidSafe(ivec3 v) {
  if (any(lessThan(v, ivec3(0))) || any(greaterThanEqual(v, ivec3(uVolSize)))) return false;
  return vxSolid(v);
}

// Two-level DDA (coarse VX_COARSE^3 skip cells -> fine voxels).
// Returns true if any solid voxel intersects the segment ro + rd*t, t in [0, tMax] (voxel units).
// rd does not need to be normalized (t is then in units of |rd|). Never divides by zero.
bool vxTrace(vec3 ro, vec3 rd, float tMax) {
  vec3 srd = vec3(rd.x >= 0.0 ? max(rd.x, 1e-7) : min(rd.x, -1e-7),
                  rd.y >= 0.0 ? max(rd.y, 1e-7) : min(rd.y, -1e-7),
                  rd.z >= 0.0 ? max(rd.z, 1e-7) : min(rd.z, -1e-7));
  vec3 inv = 1.0 / srd;
  vec3 ta = (vec3(0.0) - ro) * inv, tb = (uVolSize - ro) * inv;
  vec3 tlo = min(ta, tb), thi = max(ta, tb);
  float tEnter = max(max(tlo.x, tlo.y), max(tlo.z, 0.0));
  float tExit  = min(min(thi.x, thi.y), min(thi.z, tMax));
  if (tEnter >= tExit) return false;
  ivec3 stp = ivec3(srd.x > 0.0 ? 1 : -1, srd.y > 0.0 ? 1 : -1, srd.z > 0.0 ? 1 : -1);
  vec3 ad = abs(inv);
  vec3 up = vec3(greaterThan(srd, vec3(0.0)));   // 1 where stepping +
  ivec3 vmax = ivec3(uVolSize) - 1;
  ivec3 cmax = (vmax) / VX_COARSE;
  float C = float(VX_COARSE);
  vec3 pe = ro + rd * tEnter;
  ivec3 c = clamp(ivec3(floor(pe / C)), ivec3(0), cmax);
  vec3 tNextC = ((vec3(c) + up) * C - ro) * inv;
  vec3 tDeltaC = ad * C;
  float tCur = tEnter;
  for (int i = 0; i < VX_MAX_COARSE_STEPS; i++) {
    float tCellExit = min(min(tNextC.x, tNextC.y), min(tNextC.z, tExit));
    if (texelFetch(uDens, c, 0).r > 0.0) {
      ivec3 lo = c * VX_COARSE;
      ivec3 hi = min(lo + (VX_COARSE - 1), vmax);
      vec3 p = ro + rd * tCur;
      ivec3 v = clamp(ivec3(floor(p)), lo, hi);
      vec3 tN = ((vec3(v) + up) - ro) * inv;
      for (int j = 0; j < 3 * VX_COARSE; j++) {
        if (vxSolid(v)) return true;
        if (tN.x <= tN.y && tN.x <= tN.z) {
          if (tN.x >= tCellExit) break; v.x += stp.x; tN.x += ad.x;
        } else if (tN.y <= tN.z) {
          if (tN.y >= tCellExit) break; v.y += stp.y; tN.y += ad.y;
        } else {
          if (tN.z >= tCellExit) break; v.z += stp.z; tN.z += ad.z;
        }
        if (any(lessThan(v, lo)) || any(greaterThan(v, hi))) break;
      }
    }
    if (tCellExit >= tExit) return false;
    tCur = tCellExit;
    if (tNextC.x <= tNextC.y && tNextC.x <= tNextC.z) { c.x += stp.x; tNextC.x += tDeltaC.x; }
    else if (tNextC.y <= tNextC.z) { c.y += stp.y; tNextC.y += tDeltaC.y; }
    else { c.z += stp.z; tNextC.z += tDeltaC.z; }
    if (any(lessThan(c, ivec3(0))) || any(greaterThan(c, cmax))) return false;
  }
  return false; // ran out of steps: treat as unoccluded
}

// Per-pixel version of classic voxel vertex AO, evaluated from the occupancy volume:
// 8 texel fetches in the layer in front of the face, bilinear over the face.
// pv = surface point (voxel units), n = axis-aligned face normal. Returns 0..1 (1 = open).
float vxFaceAO(vec3 pv, vec3 n) {
  vec3 an = abs(n);
  ivec3 N = ivec3(round(n));
  ivec3 U = an.x > 0.5 ? ivec3(0, 1, 0) : ivec3(1, 0, 0);
  ivec3 V = an.z > 0.5 ? ivec3(0, 1, 0) : ivec3(0, 0, 1);
  if (an.y > 0.5) { U = ivec3(1, 0, 0); V = ivec3(0, 0, 1); }
  ivec3 f = ivec3(floor(pv + n * 0.5)); // the empty cell in front of the face
  float fu = fract(dot(pv, vec3(U)));
  float fv = fract(dot(pv, vec3(V)));
  float s_u0 = float(vxSolidSafe(f - U)), s_u1 = float(vxSolidSafe(f + U));
  float s_v0 = float(vxSolidSafe(f - V)), s_v1 = float(vxSolidSafe(f + V));
  float c00 = float(vxSolidSafe(f - U - V)), c10 = float(vxSolidSafe(f + U - V));
  float c01 = float(vxSolidSafe(f - U + V)), c11 = float(vxSolidSafe(f + U + V));
  float a00 = (s_u0 * s_v0 > 0.5) ? 0.0 : 3.0 - (s_u0 + s_v0 + c00);
  float a10 = (s_u1 * s_v0 > 0.5) ? 0.0 : 3.0 - (s_u1 + s_v0 + c10);
  float a01 = (s_u0 * s_v1 > 0.5) ? 0.0 : 3.0 - (s_u0 + s_v1 + c01);
  float a11 = (s_u1 * s_v1 > 0.5) ? 0.0 : 3.0 - (s_u1 + s_v1 + c11);
  float a = mix(mix(a00, a10, fu), mix(a01, a11, fu), fv) / 3.0;
  return a;
}

// Noise-free large-scale AO / sky visibility: 5 cones (normal + 4 at 45 deg) marched through the
// MIPMAPPED density volume (voxel-cone-tracing style, textureLod by cone diameter).
#ifndef VX_CONE_MAX
#define VX_CONE_MAX 96.0   // max cone length in voxels (9.6 m)
#endif
#ifndef VX_CONE_K
#define VX_CONE_K 2.5      // density -> opacity gain (compensates thin walls diluted in mips)
#endif
float vxConeAO(vec3 pv, vec3 n) {
  vec3 an = abs(n);
  vec3 t1 = an.x > 0.5 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0);
  vec3 t2 = cross(n, t1);
  float C = float(VX_COARSE);
  vec3 invTex = 1.0 / (C * vec3(textureSize(uDens, 0)));   // voxel units -> texture coords
  vec3 base = pv + n * 1.0;
  float vis = 0.0, wsum = 0.0;
  for (int d = 0; d < 5; d++) {
    vec3 dir = d == 0 ? n : normalize(n + (d == 1 ? t1 : d == 2 ? -t1 : d == 3 ? t2 : -t2));
    float w = d == 0 ? 1.0 : max(dot(dir, vec3(0.0, 1.0, 0.0)) + 0.6, 0.15); // favour the sky
    float occ = 0.0;
    float dist = C;
    for (int k = 0; k < 8; k++) {
      float diam = max(C, dist * 1.0);                // ~53 deg cone
      float lod = log2(diam / C);
      float dens = textureLod(uDens, (base + dir * dist) * invTex, lod).r;
      occ += (1.0 - occ) * clamp(dens * VX_CONE_K, 0.0, 1.0);
      dist += diam * 0.75;
      if (dist > VX_CONE_MAX || occ > 0.97) break;
    }
    vis += (1.0 - occ) * w; wsum += w;
  }
  return vis / wsum;
}

// --- noise helpers ---
float vxIGN(vec2 p, float frame) { // interleaved gradient noise, animated
  p += 5.588238 * frame;
  return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715))));
}
vec3 vxCosineDir(vec3 n, vec2 r) {
  float phi = 6.2831853 * r.x;
  float ct = sqrt(1.0 - r.y), st = sqrt(r.y);
  vec3 t1 = abs(n.x) > 0.5 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0);
  vec3 b1 = normalize(cross(n, t1)), b2 = cross(n, b1);
  return normalize(b1 * (cos(phi) * st) + b2 * (sin(phi) * st) + n * ct);
}
// Stochastic ray-traced AO: N cosine rays of length "range" voxels. Noisy -> needs temporal accumulation.
float vxRayAO(vec3 pv, vec3 n, int N, float range, vec2 fragXY, float frame) {
  float open = 0.0;
  vec3 o = pv + n * 0.01;
  for (int i = 0; i < 16; i++) {
    if (i >= N) break;
    vec2 r = vec2(vxIGN(fragXY, frame * 7.0 + float(i) * 3.0), fract(vxIGN(fragXY + 17.0, frame * 7.0 + float(i) * 3.0) + 0.618034 * float(i)));
    vec3 d = vxCosineDir(n, r);
    open += vxTrace(o, d, range) ? 0.0 : 1.0;
  }
  return open / float(N);
}
`;
