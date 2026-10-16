// Composite the filtered channels into one HDR image at render resolution:
// diffuse x albedo + specular + direct emission.

@group(0) @binding(0) var<uniform> U: Uniforms;
@group(0) @binding(1) var diffTex: texture_2d<f32>;
@group(0) @binding(2) var specTex: texture_2d<f32>;
@group(0) @binding(3) var albTex: texture_2d<f32>;
@group(0) @binding(4) var emitTex: texture_2d<f32>;
@group(0) @binding(5) var outHdr: texture_storage_2d<rgba16float, write>;

@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) gid: vec3u) {
  let pix = vec2i(gid.xy);
  if (pix.x >= i32(U.res.x) || pix.y >= i32(U.res.y)) { return; }
  let d = textureLoad(diffTex, pix, 0).rgb;
  let s = textureLoad(specTex, pix, 0).rgb;
  let a = textureLoad(albTex, pix, 0).rgb;
  let e = textureLoad(emitTex, pix, 0).rgb;
  textureStore(outHdr, pix, vec4f(d * a + s + e, 1.0));
}
