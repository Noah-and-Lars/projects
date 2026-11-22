// The island world scene: terrain, sea, sky, lights.
import * as THREE from 'three';
import { buildTerrain, DEFAULT_TERRAIN, type Terrain } from '../sim-core/terrain';
import { buildTerrainMesh, buildSea } from '../render/terrain-mesh';
import { makeSky, Lights, SKY_HORIZON } from '../render/world-view';
import { buildScatter } from '../render/scatter';

export class World {
  scene = new THREE.Scene();
  terrain: Terrain;
  lights: Lights;
  private sea: ReturnType<typeof buildSea>;
  private sky: THREE.Mesh;
  constructor() {
    this.terrain = buildTerrain(DEFAULT_TERRAIN);
    this.scene.fog = new THREE.Fog(SKY_HORIZON.clone(), 300, 2600);
    this.sky = makeSky();
    this.scene.add(this.sky);
    this.scene.add(buildTerrainMesh(this.terrain));
    this.scene.add(buildScatter(this.terrain));
    this.sea = buildSea(this.terrain);
    this.scene.add(this.sea.mesh);
    this.lights = new Lights(this.scene, 40);
    this.addYardMarkers();
  }

  private addYardMarkers() {
    // Simple procedural Yard pad props: signal posts around the spawn pad.
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

  update(time: number, focus: THREE.Vector3) {
    this.sea.update(time);
    this.sky.position.copy(focus);
    this.sea.mesh.position.x = Math.round(focus.x / 100) * 100;
    this.sea.mesh.position.z = Math.round(focus.z / 100) * 100;
    this.lights.follow(focus);
  }
}
