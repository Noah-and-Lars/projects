import * as THREE from 'three';
import type { BodyViews } from './bodyViews';

/**
 * Outline for mission items near the player (target highlight). Each highlighted body gets a "shell": its own
 * chunk geometries drawn again with back faces only, pushed outward a little (along the face normal blended
 * with the direction from the body centre, so the flat greedy-mesh faces do not leave gaps at corners) in an
 * additive colour. Only the silhouette rim shows; the body itself hides the rest. One extra draw per chunk mesh
 * of a small prop, no extra passes. The strength is whatever the caller asks for (distance + aim); nothing here
 * animates on its own, so a still camera stays bit-identical.
 */

export type HighlightKind = 'required' | 'bonus' | 'valuable';
export interface HighlightItem {
  bodyId: number;
  kind: HighlightKind;
  /** 0..1 (and a bit more when aimed at) */
  strength: number;
  /** body-local centre of the voxel grid (metres) */
  center: { x: number; y: number; z: number };
}

const COLORS: Record<HighlightKind, THREE.Color> = {
  required: new THREE.Color(1.0, 0.72, 0.12),
  bonus: new THREE.Color(0.35, 0.8, 1.0),
  valuable: new THREE.Color(0.45, 1.0, 0.45),
};

const VERT = /* glsl */ `
uniform float uWidth;
uniform vec3 uCenter;
void main() {
  vec3 n = normalize(normal);
  vec3 r = position - uCenter;
  float rl = length(r);
  vec3 dir = normalize(n + (rl > 1e-4 ? r / rl : n) * 0.8);
  vec4 mv0 = modelViewMatrix * vec4(position, 1.0);
  // roughly constant on screen: wider with distance, within limits
  float w = uWidth * clamp(-mv0.z, 0.8, 9.0);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position + dir * w, 1.0);
}`;
const FRAG = /* glsl */ `
uniform vec3 uColor;
uniform float uStrength;
void main() { gl_FragColor = vec4(uColor * (uStrength * 2.2), 1.0); }`;

interface Shell { mesh: THREE.Mesh }
interface Entry {
  group: THREE.Group;
  mat: THREE.ShaderMaterial;
  shells: Map<THREE.Object3D, Shell>;
  seen: boolean;
}

export class TargetHighlight {
  readonly root = new THREE.Group();
  private entries = new Map<number, Entry>();
  /** world-space width per metre of distance at full strength */
  width = 0.014;

  constructor() { this.root.name = 'target-highlight'; }

  /** number of bodies currently outlined (tests) */
  get count(): number { return this.entries.size; }
  /** strength of a body's outline (0 = none; tests) */
  strengthOf(bodyId: number): number { return this.entries.get(bodyId)?.mat.uniforms.uStrength.value ?? 0; }

  update(items: HighlightItem[], views: BodyViews): void {
    for (const e of this.entries.values()) e.seen = false;
    for (const it of items) {
      if (it.strength <= 0.001) continue;
      const src = views.meshFor(it.bodyId);
      if (!src) continue;
      let e = this.entries.get(it.bodyId);
      if (!e) {
        const group = new THREE.Group();
        group.matrixAutoUpdate = false;
        const mat = new THREE.ShaderMaterial({
          uniforms: { uColor: { value: COLORS[it.kind].clone() }, uStrength: { value: 0 }, uWidth: { value: 0 }, uCenter: { value: new THREE.Vector3() } },
          vertexShader: VERT, fragmentShader: FRAG,
          side: THREE.BackSide, transparent: true, depthWrite: false, depthTest: true, blending: THREE.AdditiveBlending, fog: false, toneMapped: false,
        });
        e = { group, mat, shells: new Map(), seen: true };
        this.entries.set(it.bodyId, e);
        this.root.add(group);
      }
      e.seen = true;
      e.mat.uniforms.uColor.value.copy(COLORS[it.kind]);
      e.mat.uniforms.uStrength.value = it.strength * 1.6;
      e.mat.uniforms.uWidth.value = this.width * (0.55 + 0.45 * Math.min(1, it.strength));
      e.mat.uniforms.uCenter.value.set(it.center.x, it.center.y, it.center.z);
      e.group.matrix.copy(src.matrix);
      e.group.matrixWorldNeedsUpdate = true;
      this.syncShells(e, src);
    }
    for (const [id, e] of this.entries) if (!e.seen) this.remove(id, e);
  }

  /** mirror the body's chunk meshes (geometries are shared, swapped when the body is remeshed) */
  private syncShells(e: Entry, src: THREE.Group): void {
    const live = new Set<THREE.Object3D>();
    for (const c of src.children) {
      const m = c as THREE.Mesh;
      if (!m.isMesh || !m.geometry) continue;
      live.add(m);
      let s = e.shells.get(m);
      if (!s) {
        const mesh = new THREE.Mesh(m.geometry, e.mat);
        mesh.matrixAutoUpdate = false;
        mesh.castShadow = false; mesh.receiveShadow = false;
        mesh.frustumCulled = false; // the shell is a little bigger than the chunk bounds
        mesh.renderOrder = 2;
        e.group.add(mesh);
        s = { mesh };
        e.shells.set(m, s);
      }
      if (s.mesh.geometry !== m.geometry) s.mesh.geometry = m.geometry;
    }
    for (const [k, s] of e.shells) if (!live.has(k)) { e.group.remove(s.mesh); e.shells.delete(k); }
  }

  private remove(id: number, e: Entry): void {
    this.root.remove(e.group);
    e.mat.dispose();
    this.entries.delete(id);
  }

  clear(): void { for (const [id, e] of this.entries) this.remove(id, e); }
}
