import * as THREE from 'three';

/** Animated water surface: a big plane with layered ripples, fresnel sky reflection and sun glints. */
export class WaterSurface {
  readonly mesh: THREE.Mesh;
  private mat: THREE.ShaderMaterial;

  constructor(level: number, size = 1200) {
    this.mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      fog: true,
      uniforms: THREE.UniformsUtils.merge([
        THREE.UniformsLib.fog,
        {
          uTime: { value: 0 },
          uDeep: { value: new THREE.Color(0x0a3a4c) },
          uShallow: { value: new THREE.Color(0x1f7a8a) },
          uSky: { value: new THREE.Color(0xa9cbe8) },
          uSunDir: { value: new THREE.Vector3(0.4, 0.6, 0.4) },
          uSunCol: { value: new THREE.Color(0xfff0d0) },
        },
      ]),
      vertexShader: /* glsl */ `
        #include <common>
        #include <fog_pars_vertex>
        varying vec3 vWorld;
        void main() {
          vec4 wp = modelMatrix * vec4(position, 1.0);
          vWorld = wp.xyz;
          vec4 mvPosition = viewMatrix * wp;
          gl_Position = projectionMatrix * mvPosition;
          #include <fog_vertex>
        }`,
      fragmentShader: /* glsl */ `
        #include <common>
        #include <fog_pars_fragment>
        uniform float uTime; uniform vec3 uDeep, uShallow, uSky, uSunDir, uSunCol;
        varying vec3 vWorld;
        float h(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float n(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
          return mix(mix(h(i), h(i + vec2(1, 0)), f.x), mix(h(i + vec2(0, 1)), h(i + vec2(1, 1)), f.x), f.y); }
        float waves(vec2 p) {
          float t = uTime;
          return n(p * 0.35 + vec2(t * 0.35, t * 0.22)) * 0.55 + n(p * 0.9 - vec2(t * 0.5, -t * 0.3)) * 0.3 + n(p * 2.3 + vec2(-t * 0.8, t * 0.6)) * 0.15;
        }
        void main() {
          vec2 p = vWorld.xz;
          #ifdef SIMPLE_WATER
          // performance mode: one noise layer + analytic ripples (2 noise lookups instead of 15)
          float t = uTime;
          float w0 = n(p * 0.35 + vec2(t * 0.35, t * 0.22));
          vec3 nrm = normalize(vec3(0.12 * sin(p.x * 1.7 + t * 1.3) + 0.08 * sin(p.y * 2.3 - t), 0.55,
                                    0.12 * sin(p.y * 1.5 + t * 1.1) + 0.08 * sin((p.x + p.y) * 2.1 + t * 0.7) + 0.1 * (n(p * 0.9 - t * 0.4) - 0.5)));
          #else
          float e = 0.15;
          float w0 = waves(p);
          vec3 nrm = normalize(vec3(waves(p - vec2(e, 0.0)) - waves(p + vec2(e, 0.0)), 0.55, waves(p - vec2(0.0, e)) - waves(p + vec2(0.0, e))));
          #endif
          // chunky look: quantise the ripple shading a little
          vec3 V = normalize(cameraPosition - vWorld);
          float fres = pow(1.0 - max(dot(V, nrm), 0.0), 4.0);
          vec3 base = mix(uDeep, uShallow, smoothstep(0.35, 0.75, w0));
          float skyL = dot(uSky, vec3(0.3, 0.5, 0.2));
          vec3 col = mix(base * (0.35 + 0.9 * skyL), uSky, clamp(0.03 + fres * 0.6, 0.0, 0.55));
          vec3 H = normalize(V + normalize(uSunDir));
          col += uSunCol * pow(max(dot(nrm, H), 0.0), 220.0) * 2.5;
          gl_FragColor = vec4(col, mix(0.86, 0.97, fres));
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
          #include <fog_fragment>
        }`,
    });
    const geo = new THREE.PlaneGeometry(size, size, 1, 1);
    geo.rotateX(-Math.PI / 2);
    this.mesh = new THREE.Mesh(geo, this.mat);
    this.mesh.position.y = level - 0.04;
    this.mesh.renderOrder = 5;
    this.mesh.frustumCulled = false;
  }

  update(dt: number, camera: THREE.Camera, sky?: THREE.Color, sunDirToLight?: THREE.Vector3, sunCol?: THREE.Color): void {
    const u = this.mat.uniforms;
    u.uTime.value += dt;
    this.mesh.position.x = Math.round(camera.position.x / 50) * 50;
    this.mesh.position.z = Math.round(camera.position.z / 50) * 50;
    if (sky) u.uSky.value.copy(sky);
    if (sunDirToLight) u.uSunDir.value.copy(sunDirToLight);
    if (sunCol) u.uSunCol.value.copy(sunCol);
  }
  /** cheaper shader (performance mode) */
  setSimple(on: boolean): void {
    if (!!this.mat.defines?.SIMPLE_WATER === on) return;
    this.mat.defines = on ? { SIMPLE_WATER: 1 } : {};
    this.mat.needsUpdate = true;
  }
  dispose(): void { this.mesh.geometry.dispose(); this.mat.dispose(); }
}
