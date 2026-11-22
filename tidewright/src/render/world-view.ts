// Shared three.js renderer, sky, light rig and quality governor.
import * as THREE from 'three';

export const SKY_HORIZON = new THREE.Color('#efe7d6');
export const SKY_ZENITH = new THREE.Color('#a9cfe0');

export function makeSky(): THREE.Mesh {
  const g = new THREE.SphereGeometry(5000, 24, 12);
  const m = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: { uH: { value: SKY_HORIZON }, uZ: { value: SKY_ZENITH } },
    vertexShader: `varying vec3 vD; void main(){ vD = normalize(position); vec4 p = projectionMatrix * modelViewMatrix * vec4(position,1.0); gl_Position = p.xyww; }`,
    fragmentShader: `uniform vec3 uH, uZ; varying vec3 vD;
      void main(){ float t = clamp(vD.y * 1.6, 0.0, 1.0); vec3 c = mix(uH, uZ, pow(t, 0.7));
      gl_FragColor = vec4(c, 1.0);
      #include <colorspace_fragment>
      }`,
  });
  const s = new THREE.Mesh(g, m);
  s.renderOrder = -10;
  s.frustumCulled = false;
  s.name = 'sky';
  return s;
}

export class Lights {
  hemi = new THREE.HemisphereLight('#fff6e6', '#5b6d6a', 1.3);
  sun = new THREE.DirectionalLight('#fff3dc', 2.1);
  offset = new THREE.Vector3(60, 110, 40);
  constructor(scene: THREE.Scene, shadowSize = 45) {
    scene.add(this.hemi);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const c = this.sun.shadow.camera;
    c.left = -shadowSize; c.right = shadowSize; c.top = shadowSize; c.bottom = -shadowSize; c.near = 1; c.far = 400;
    this.sun.shadow.bias = -0.0006;
    this.sun.shadow.normalBias = 0.03;
    scene.add(this.sun, this.sun.target);
  }
  follow(p: THREE.Vector3) {
    this.sun.target.position.copy(p);
    this.sun.position.copy(p).add(this.offset);
  }
}

export function makeRenderer(canvas: HTMLCanvasElement): THREE.WebGLRenderer {
  const r = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: false });
  r.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  r.shadowMap.enabled = true;
  r.shadowMap.type = THREE.PCFShadowMap;
  r.outputColorSpace = THREE.SRGBColorSpace;
  return r;
}

/** Drops/raises pixel ratio to hold the frame rate. */
export class QualityGovernor {
  private acc = 0;
  private frames = 0;
  ratio: number;
  fps = 60;
  constructor(private renderer: THREE.WebGLRenderer, private maxRatio = Math.min(window.devicePixelRatio, 2)) {
    this.ratio = maxRatio;
  }
  frame(dt: number) {
    this.acc += dt; this.frames++;
    if (this.acc < 1.5) return;
    this.fps = this.frames / this.acc;
    this.acc = 0; this.frames = 0;
    let r = this.ratio;
    if (this.fps < 45) r = Math.max(0.6, r - 0.25);
    else if (this.fps > 58 && r < this.maxRatio) r = Math.min(this.maxRatio, r + 0.25);
    if (r !== this.ratio) { this.ratio = r; this.renderer.setPixelRatio(r); }
  }
}
