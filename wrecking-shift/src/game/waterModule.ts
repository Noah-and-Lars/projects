import * as THREE from 'three';
import { WaterSurface } from '../render/water';
import { MAT, pal } from '../sim/materials';
import type { Game, GameModule } from './game';

/** Water surface rendering, splashes and the underwater screen tint. */
export function createWaterModule(): GameModule {
  let water: WaterSurface | null = null;
  let tint: HTMLDivElement | null = null;
  const sunTo = new THREE.Vector3();
  return {
    init() {
      tint = document.createElement('div');
      tint.style.cssText = 'position:fixed;inset:0;pointer-events:none;background:rgba(18,70,96,.55);backdrop-filter:blur(2px);display:none;z-index:1';
      document.body.appendChild(tint);
    },
    onLevelLoaded(game: Game) {
      if (water) { game.renderer.scene.remove(water.mesh); water.dispose(); water = null; }
      const wl = game.level.waterLevel;
      if (wl == null) return;
      water = new WaterSurface(wl);
      game.renderer.scene.add(water.mesh);
    },
    onEvents(game, events) {
      for (const e of events) {
        if (e.type !== 'custom' || e.name !== 'water:splash') continue;
        const { pos, size, speed } = e.data;
        const n = Math.min(60, Math.round(10 * size + speed * 2));
        for (let i = 0; i < n; i++) {
          const a = Math.random() * Math.PI * 2, r = Math.random() * size * 0.5;
          game.renderer.chips.spawn(
            { x: pos.x + Math.cos(a) * r, y: pos.y + 0.05, z: pos.z + Math.sin(a) * r },
            { x: Math.cos(a) * (1 + Math.random() * 2), y: 2 + Math.random() * Math.min(7, speed * 0.6), z: Math.sin(a) * (1 + Math.random() * 2) },
            pal(Math.random() < 0.5 ? MAT.snow : MAT.ice, 2), 0.05 + Math.random() * 0.06, 0.9,
          );
        }
      }
    },
    frameUpdate(game, dt) {
      if (water) {
        const r = game.renderer;
        const bg = r.scene.fog instanceof THREE.Fog || r.scene.fog instanceof THREE.FogExp2 ? r.scene.fog.color : undefined;
        sunTo.copy(r.sun.position).sub(r.sun.target.position).normalize();
        water.update(dt, r.camera, bg, sunTo, r.sun.color);
      }
      if (tint) {
        const wl = game.level?.waterLevel;
        const under = wl != null && game.renderer.camera.position.y < wl - 0.02;
        tint.style.display = under ? 'block' : 'none';
      }
    },
  };
}
