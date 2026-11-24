/**
 * GLSL ES 3.00 voxel tracing through the world occupancy volume (see occupancy.ts for the data layout).
 * Ported from docs/research/lookproto/src/trace.glsl.js; validated against `Occupancy.trace` in tests/e2e/look.mjs.
 *
 * All inputs are in volume voxel units: pv = (worldPos - uVolOrigin) * uInvVoxel.
 * Every loop is bounded by a compile-time constant; nothing scales with the level size except the
 * (capped) number of coarse cells a sun ray crosses.
 */
export const TRACE_GLSL = /* glsl */ `
uniform highp usampler3D uBits;   // R8UI, 1 byte = 2x2x2 voxels, bit = (x&1)|(y&1)<<1|(z&1)<<2
uniform highp sampler3D uDens;    // R8 + mips, 4^3 voxels per texel, > 0 if any voxel in the cell is solid
uniform vec3 uVolSize;            // voxels
uniform vec3 uVolOrigin;          // world position of voxel (0,0,0)'s min corner
uniform float uInvVoxel;          // 1 / voxel size

#define VX_COARSE 4
#ifndef VX_MAX_COARSE_STEPS
#define VX_MAX_COARSE_STEPS 192
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

// Two-level DDA (4^3 skip cells -> voxels). True if a solid voxel intersects ro + rd*t, t in [0, tMax].
// rd need not be normalized (t is then in units of |rd|). Never divides by zero.
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
  vec3 up = vec3(greaterThan(srd, vec3(0.0)));
  ivec3 vmax = ivec3(uVolSize) - 1;
  ivec3 cmax = vmax / VX_COARSE;
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
  return false; // out of steps: unoccluded
}

// Per-pixel version of classic voxel vertex AO from the volume: 8 fetches in the empty layer in front
// of the face, bilinear over the face. pv = surface point, n = axis-aligned face normal. 1 = open.
float vxFaceAO(vec3 pv, vec3 n) {
  vec3 an = abs(n);
  ivec3 U = an.x > 0.5 ? ivec3(0, 1, 0) : ivec3(1, 0, 0);
  ivec3 V = an.z > 0.5 ? ivec3(0, 1, 0) : ivec3(0, 0, 1);
  if (an.y > 0.5) { U = ivec3(1, 0, 0); V = ivec3(0, 0, 1); }
  ivec3 f = ivec3(floor(pv + n * 0.5));
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
  return mix(mix(a00, a10, fu), mix(a01, a11, fu), fv) / 3.0;
}

// Noise-free large-scale AO / sky visibility: 5 cones (normal + 4 at 45 deg) marched through the
// mipmapped density volume. <= 5 * VX_CONE_STEPS trilinear fetches.
#ifndef VX_CONE_MAX
#define VX_CONE_MAX 32.0
#endif
#ifndef VX_CONE_STEPS
#define VX_CONE_STEPS 6
#endif
#ifndef VX_CONE_K
#define VX_CONE_K 1.6
#endif
float vxConeAO(vec3 pv, vec3 n) {
  vec3 an = abs(n);
  vec3 t1 = an.x > 0.5 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0);
  t1 = normalize(t1 - n * dot(n, t1));
  vec3 t2 = cross(n, t1);
  float C = float(VX_COARSE);
  vec3 invTex = 1.0 / (C * vec3(textureSize(uDens, 0)));
  vec3 base = pv + n * 2.0;
  float vis = 0.0, wsum = 0.0;
  for (int d = 0; d < 5; d++) {
    vec3 dir = d == 0 ? n : normalize(n + (d == 1 ? t1 : d == 2 ? -t1 : d == 3 ? t2 : -t2));
    float w = d == 0 ? 1.0 : max(dir.y + 0.6, 0.15); // favour the sky
    float occ = 0.0;
    float dist = C * 1.5;
    for (int k = 0; k < VX_CONE_STEPS; k++) {
      float diam = max(C, dist);
      vec3 tc = (base + dir * dist) * invTex;
      if (any(lessThan(tc, vec3(0.0))) || any(greaterThan(tc, vec3(1.0)))) break; // outside = empty
      float dens = textureLod(uDens, tc, log2(diam / C)).r;
      occ += (1.0 - occ) * clamp(dens * VX_CONE_K, 0.0, 1.0);
      dist += diam * 0.75;
      if (dist > VX_CONE_MAX || occ > 0.97) break;
    }
    vis += (1.0 - occ) * w; wsum += w;
  }
  return vis / wsum;
}

float vxHash13(vec3 p) { p = fract(p * 0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
`;
