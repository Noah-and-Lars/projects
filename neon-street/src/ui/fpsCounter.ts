// Stats overlay: FPS, frame times, resolution, settings, position.

import type { RenderStats } from '../renderer/pathtracer';
import type { RenderSettings } from '../renderer/presets';

export interface HudInfo {
  stats: RenderStats;
  settings: RenderSettings;
  presetName: string;
  canvasW: number;
  canvasH: number;
  adapterName: string;
  pos: [number, number, number];
}

export class Hud {
  private el: HTMLElement;
  private acc = 0;
  private frames = 0;
  private cpuAcc = 0;
  fps = 0;
  cpuMs = 0;
  visible = true;

  constructor(el: HTMLElement) {
    this.el = el;
  }

  setVisible(v: boolean): void {
    this.visible = v;
    this.el.classList.toggle('hidden', !v);
  }

  update(dt: number, cpuFrameMs: number, info: HudInfo): void {
    this.acc += dt;
    this.cpuAcc += cpuFrameMs;
    this.frames++;
    if (this.acc < 0.25) return;
    this.fps = this.frames / this.acc;
    this.cpuMs = this.cpuAcc / this.frames;
    this.acc = 0;
    this.frames = 0;
    this.cpuAcc = 0;
    if (!this.visible) return;
    const s = info.stats;
    const st = info.settings;
    const ms = (v: number | null) => (v == null ? 'n/a' : `${v.toFixed(1)}`);
    const gpu = s.gpuMs == null ? 'gpu n/a' : `gpu ${ms(s.gpuMs)} ms (trace ${ms(s.traceMs)} / denoise ${ms(s.denoiseMs)} / post ${ms(s.postMs)})`;
    const lines = [
      `${this.fps.toFixed(0).padStart(4)} fps   frame ${(1000 / Math.max(this.fps, 0.01)).toFixed(1)} ms   ${gpu}`,
      `${info.presetName}  ${s.renderWidth}x${s.renderHeight} -> ${info.canvasW}x${info.canvasH}  (${st.renderScale.toFixed(2)}x)`,
      `${st.spp} spp  ${st.maxBounces} bounces  fog ${['off', 'cheap', 'volumetric'][st.fogMode] ?? st.fogMode}  denoise ${st.atrousIterations}`,
      `${s.triCount} tris  ${s.lightCount} lights  ${s.bvhNodes} bvh nodes`,
      `${info.adapterName}`,
      `pos ${info.pos.map((v) => v.toFixed(1)).join(' ')}`,
    ];
    this.el.textContent = lines.join('\n');
  }
}
