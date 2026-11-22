// The island world scene: terrain, Gerstner ocean, sky with a day/night cycle, lights, scenery.
import * as THREE from 'three';
import { buildTerrain, DEFAULT_TERRAIN, type Terrain } from '../sim-core/terrain';
import { buildTerrainMesh } from '../render/terrain-mesh';
import { Ocean } from '../render/ocean';
import { makeSky, Lights, SKY_HORIZON } from '../render/world-view';
import { buildScatter } from '../render/scatter';
import type { Wave } from '../sim-core/waves';

interface Palette { horizon: THREE.Color; zenith: THREE.Color; sun: THREE.Color; sunI: number; hemiI: number; ground: THREE.Color }
const P = (h: string, z: string, s: string, si: number, hi: number, g: string): Palette => ({ horizon: new THREE.Color(h), zenith: new THREE.Color(z), sun: new THREE.Color(s), sunI: si, hemiI: hi, ground: new THREE.Color(g) });
const DAY = P('#efe7d6', '#a9cfe0', '#fff3dc', 2.1, 1.3, '#5b6d6a');
const DUSK = P('#f0b48a', '#6d7db5', '#ffb27a', 1.1, 0.75, '#4a4a5e');
const NIGHT = P('#1d2b4b', '#0a1124', '#9fb6ff', 0.28, 0.32, '#141a28');

function mixPal(a: Palette, b: Palette, t: number): Palette {
  return {
    horizon: a.horizon.clone().lerp(b.horizon, t), zenith: a.zenith.clone().lerp(b.zenith, t), sun: a.sun.clone().lerp(b.sun, t),
    sunI: a.sunI + (b.sunI - a.sunI) * t, hemiI: a.hemiI + (b.hemiI - a.hemiI) * t, ground: a.ground.clone().lerp(b.ground, t),
  };
}

export class World {
  scene = new THREE.Scene();
  terrain: Terrain;
  lights: Lights;
  ocean: Ocean;
  /** Hours 0..24. Advances at `dayLength` real seconds per day when `cycle` is on. */
  timeOfDay = 10;
  dayLength = 3600;
  cycle = true;
  night = 0;
  private sky: THREE.Mesh;
  private fog: THREE.Fog;

  constructor() {
    this.terrain = buildTerrain(DEFAULT_TERRAIN);
    this.fog = new THREE.Fog(SKY_HORIZON.clone(), 300, 2600);
    this.scene.fog = this.fog;
    this.sky = makeSky();
    this.scene.add(this.sky);
    this.scene.add(buildTerrainMesh(this.terrain));
    this.scene.add(buildScatter(this.terrain));
    this.ocean = new Ocean(this.terrain);
    this.scene.add(this.ocean.group);
    this.lights = new Lights(this.scene, 40);
    this.addYardMarkers();
  }

  private addYardMarkers() {
    const { pad } = this.terrain;
    const post = new THREE.CylinderGeometry(0.15, 0.15, 3, 6);
    const mat = new THREE.MeshToonMaterial({ color: '#f26a21' });
    const cap = new THREE.MeshBasicMaterial({ color: '#ffd84a' });
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      const m = new THREE.Mesh(post, mat);
      m.position.set(pad.x + Math.cos(a) * pad.r, pad.y + 1.5, pad.z + Math.sin(a) * pad.r);
      m.castShadow = true;
      const c = new THREE.Mesh(new THREE.SphereGeometry(0.25, 8, 6), cap);
      c.position.y = 1.6;
      m.add(c);
      this.scene.add(m);
    }
  }

  setWaves(w: Wave[]) { this.ocean.setWaves(w); }

  private applyTimeOfDay() {
    const ang = ((this.timeOfDay - 6) / 24) * Math.PI * 2; // sunrise at 6, noon at 12
    const el = Math.sin(ang);
    const sunDir = new THREE.Vector3(Math.cos(ang) * 0.8, el, 0.45).normalize();
    let pal: Palette;
    if (el > 0.25) pal = DAY;
    else if (el > 0) pal = mixPal(DUSK, DAY, el / 0.25);
    else if (el > -0.18) pal = mixPal(NIGHT, DUSK, 1 + el / 0.18);
    else pal = NIGHT;
    this.night = THREE.MathUtils.clamp(-el / 0.18 + 0.2, 0, 1) * (el < 0.05 ? 1 : 0);
    const u = (this.sky.material as THREE.ShaderMaterial).uniforms;
    (u.uH.value as THREE.Color).copy(pal.horizon);
    (u.uZ.value as THREE.Color).copy(pal.zenith);
    this.fog.color.copy(pal.horizon);
    this.lights.sun.color.copy(pal.sun);
    this.lights.sun.intensity = pal.sunI;
    this.lights.hemi.intensity = pal.hemiI;
    this.lights.hemi.groundColor.copy(pal.ground);
    // Moonlight comes from above at night, so shadows never flip under the terrain.
    const lightDir = el > 0.02 ? sunDir : new THREE.Vector3(-0.3, 0.9, 0.3).normalize();
    this.lights.offset.copy(lightDir).multiplyScalar(140);
    const ou = this.ocean.uniforms;
    (ou.uSunDir.value as THREE.Vector3).copy(lightDir);
    (ou.uSunColor.value as THREE.Color).copy(pal.sun);
    (ou.uSky.value as THREE.Color).copy(pal.zenith);
    (ou.uFogColor.value as THREE.Color).copy(pal.horizon);
    ou.uNight.value = this.night;
  }

  update(dt: number, waveTime: number, focus: THREE.Vector3, camera: THREE.Vector3) {
    if (this.cycle) this.timeOfDay = (this.timeOfDay + (dt * 24) / this.dayLength) % 24;
    this.applyTimeOfDay();
    this.ocean.update(waveTime, camera);
    this.sky.position.copy(camera);
    this.lights.follow(focus);
  }
}
