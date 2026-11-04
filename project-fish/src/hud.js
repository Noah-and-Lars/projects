// Debug readout in the top-left corner: frame rate, speed and whether you're on the ground.

import { horizontalSpeed } from './shared/movement.js';

const REFRESH_SECONDS = 0.25;

export class Hud {
  constructor(element) {
    this.element = element;
    this.frames = 0;
    this.elapsed = 0;
  }

  update(frameSeconds, player) {
    this.frames++;
    this.elapsed += frameSeconds;
    if (this.elapsed < REFRESH_SECONDS) return;

    const fps = Math.round(this.frames / this.elapsed);
    this.frames = 0;
    this.elapsed = 0;

    this.element.textContent =
      `${fps} FPS\n` +
      `Speed ${horizontalSpeed(player).toFixed(1)} m/s\n` +
      (player.grounded ? 'On ground' : `In air ${player.y.toFixed(2)} m`);
  }
}
