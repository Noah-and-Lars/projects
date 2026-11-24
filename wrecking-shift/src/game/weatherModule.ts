import * as THREE from 'three';
import type { Game, GameModule } from './game';

/** Rain / snow: a box of falling points that follows the camera (presentation only). */
export function createWeatherModule(): GameModule {
  const N = 2600, R = 18, H = 16;
  let pts: THREE.Points | null = null;
  let kind: 'rain' | 'snow' | null = null;
  let pos: Float32Array, seed: Float32Array;
  let t = 0;
  function clear(game: Game) {
    if (pts) { game.renderer.scene.remove(pts); pts.geometry.dispose(); (pts.material as THREE.Material).dispose(); pts = null; }
  }
  function setWeather(game: Game, k: 'rain' | 'snow' | null) {
    clear(game);
    kind = k;
    if (!k) return;
    pos = new Float32Array(N * 3); seed = new Float32Array(N * 3);
    for (let i = 0; i < N * 3; i++) seed[i] = Math.random();
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({
      color: k === 'rain' ? 0x9fb4c8 : 0xffffff, size: k === 'rain' ? 0.05 : 0.07, transparent: true,
      opacity: k === 'rain' ? 0.55 : 0.9, depthWrite: false, sizeAttenuation: true, fog: true,
    });
    pts = new THREE.Points(geo, mat);
    pts.frustumCulled = false;
    pts.renderOrder = 6;
    game.renderer.scene.add(pts);
  }
  return {
    init(game) { game.ext.weather = { set: (k: 'rain' | 'snow' | null) => setWeather(game, k), get: () => kind }; },
    onLevelLoaded(game) { setWeather(game, (game.level as any).weather ?? null); },
    frameUpdate(game, dt) {
      if (!pts || !kind) return;
      t += dt;
      const c = game.renderer.camera.position;
      const fall = kind === 'rain' ? 14 : 1.4;
      // rain does not fall indoors: cheap check straight up from the camera
      const roof = game.sim.raycast({ x: c.x, y: c.y, z: c.z }, { x: 0, y: 1, z: 0 }, 30);
      pts.visible = true;
      (pts.material as THREE.PointsMaterial).opacity = (kind === 'rain' ? 0.55 : 0.9) * (roof ? 0.25 : 1);
      for (let i = 0; i < N; i++) {
        const sx = seed[i * 3], sy = seed[i * 3 + 1], sz = seed[i * 3 + 2];
        const wob = kind === 'snow' ? Math.sin(t * 0.8 + sx * 40) * 0.4 : 0;
        const x = ((sx * 2 * R + t * (kind === 'rain' ? 1.5 : 0.3)) % (2 * R)) - R + wob;
        const y = H - ((sy * H + t * fall * (0.8 + sz * 0.4)) % H) - H * 0.4;
        const z = ((sz * 2 * R) % (2 * R)) - R + wob * 0.6;
        // wrap around the camera
        pos[i * 3] = c.x + x; pos[i * 3 + 1] = c.y + y; pos[i * 3 + 2] = c.z + z;
      }
      pts.geometry.attributes.position.needsUpdate = true;
    },
  };
}
