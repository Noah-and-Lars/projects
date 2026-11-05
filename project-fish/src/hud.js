// Debug readout in the top-left corner: frame rate, how long a frame takes
// to work out (CPU) and to draw (GPU, where the browser can tell), speed and
// whether you're on the ground.

import { horizontalSpeed } from './shared/movement.js';

const REFRESH_SECONDS = 0.25;

export class Hud {
  constructor(element) {
    this.element = element;
    this.frames = 0;
    this.elapsed = 0;
    this.cpu = 0;
    this.gpu = 0;
    this.gpuFrames = 0;
  }

  // cpuMs: how long this frame's work took (milliseconds); gpuMs: how long
  // the graphics card took to draw a recent frame, or null if unknown.
  update(frameSeconds, player, cpuMs = 0, gpuMs = null) {
    this.frames++;
    this.elapsed += frameSeconds;
    this.cpu += cpuMs;
    if (gpuMs !== null) {
      this.gpu += gpuMs;
      this.gpuFrames++;
    }
    if (this.elapsed < REFRESH_SECONDS) return;

    const fps = Math.round(this.frames / this.elapsed);
    const cpu = this.cpu / this.frames;
    const gpu = this.gpuFrames ? ` · GPU ${(this.gpu / this.gpuFrames).toFixed(1)} ms` : '';
    this.frames = 0;
    this.elapsed = 0;
    this.cpu = this.gpu = this.gpuFrames = 0;

    this.element.textContent =
      `${fps} FPS (CPU ${cpu.toFixed(1)} ms${gpu})\n` +
      `Speed ${horizontalSpeed(player).toFixed(1)} m/s\n` +
      (player.grounded ? 'On ground' : `In air ${player.y.toFixed(2)} m`) +
      ` · ${player.move === 'ground' || player.move === 'air' ? player.stance : player.move}${player.tacSprint ? ' (tactical sprint)' : player.sprinting ? ' (sprint)' : ''} · stamina ${Math.round(player.stamina * 100)}%`;
  }
}

// Times how long the graphics card takes to draw a frame, where the browser
// allows it (WebGL 2 with EXT_disjoint_timer_query_webgl2; most desktop
// Chrome and Edge). The answer comes a frame or two later; `ms` is the
// latest one (null if it can't be told).
export class GpuTimer {
  constructor(gl) {
    this.gl = gl;
    this.ext = gl.getExtension && gl.getExtension('EXT_disjoint_timer_query_webgl2');
    this.waiting = [];
    this.current = null;
    this.ms = null;
  }

  begin() {
    if (!this.ext || this.current || this.waiting.length > 3) return;
    this.current = this.gl.createQuery();
    this.gl.beginQuery(this.ext.TIME_ELAPSED_EXT, this.current);
  }

  end() {
    const gl = this.gl;
    if (this.current) {
      gl.endQuery(this.ext.TIME_ELAPSED_EXT);
      this.waiting.push(this.current);
      this.current = null;
    }
    while (this.waiting.length && gl.getQueryParameter(this.waiting[0], gl.QUERY_RESULT_AVAILABLE)) {
      const query = this.waiting.shift();
      if (!gl.getParameter(this.ext.GPU_DISJOINT_EXT)) this.ms = gl.getQueryParameter(query, gl.QUERY_RESULT) / 1e6;
      gl.deleteQuery(query);
    }
  }
}
