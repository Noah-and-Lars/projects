// Shared declarations, prepended to every kernel by the TypeScript side.

struct Uniforms {
  camPos: vec4f,    // xyz, w = tan(fov/2)
  camFwd: vec4f,    // xyz, w = aspect
  camRight: vec4f,  // xyz
  camUp: vec4f,     // xyz
  pCamPos: vec4f,   // previous frame camera, same packing
  pCamFwd: vec4f,
  pCamRight: vec4f,
  pCamUp: vec4f,
  res: vec4f,       // width, height, 1/width, 1/height
  p0: vec4f,        // maxBounces, sampleIndex, fogDensity, fogMode
  p1: vec4f,        // lightCount, maxHistory, resetHistory, time
  p2: vec4f,        // fireflyClamp, skyIntensity, frame, spp
  p3: vec4f,        // lightCandidates, 0, 0, 0
};

const PI: f32 = 3.14159265358979;
const INV_PI: f32 = 0.31830988618;

fn luminance(c: vec3f) -> f32 {
  return dot(c, vec3f(0.2126, 0.7152, 0.0722));
}
