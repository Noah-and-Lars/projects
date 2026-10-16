// Procedural 3D audio for the street. Everything is synthesised with the Web
// Audio API: rain on several surfaces, drips, footsteps, neon buzz, hologram
// glitches, city ambience with distant sirens, the drone's rotors, thunder.

import type { AABB, Vec3 } from '../core/math';

export interface AudioFrame {
  camPos: Vec3;
  fwd: Vec3;
  up: Vec3;
  rain: number;
  /** World positions of feet landing this frame. */
  footsteps: Vec3[];
  drone: { pos: Vec3; rotorSpeed: number } | null;
  lightningStarted: boolean;
  time: number;
  dt: number;
}

interface Voice {
  panner: PannerNode;
  gain: GainNode;
  target: Vec3 | null;
}

const dist = (a: Vec3, b: Vec3) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private reverbSend!: GainNode;
  private rainGain!: GainNode;
  private rainFilter!: BiquadFilterNode;
  private patterGain!: GainNode;
  private awningGain!: GainNode;
  private cityGain!: GainNode;
  private noiseBuf!: AudioBuffer;
  private brownBuf!: AudioBuffer;
  private neonVoices: { voice: Voice; crackle: GainNode }[] = [];
  private holoVoices: { voice: Voice; osc: OscillatorNode; next: number }[] = [];
  private dripVoices: { voice: Voice; next: number }[] = [];
  private droneVoice: { voice: Voice; oscs: OscillatorNode[]; noise: GainNode; lastPos: Vec3 } | null = null;
  private nextSiren = 30;
  private nextAssign = 0;
  private covered = 0;
  private muffleFilter!: BiquadFilterNode;
  private breathGain!: GainNode;
  volume = 0.8;
  private started = false;

  constructor(private readonly spots: { pos: Vec3; kind: number }[], private readonly dripEdges: [Vec3, Vec3][], private readonly covers: AABB[]) {}

  get running(): boolean {
    return this.started;
  }

  /** Must be called from a user gesture (browsers block audio until then). */
  start(): void {
    if (this.started) { void this.ctx?.resume(); return; }
    const ctx = new AudioContext();
    this.ctx = ctx;
    this.started = true;
    this.master = ctx.createGain();
    this.master.gain.value = this.volume;
    // Everything passes through the helmet filter; wide open when it is off.
    this.muffleFilter = ctx.createBiquadFilter();
    this.muffleFilter.type = 'lowpass';
    this.muffleFilter.frequency.value = 20000;
    this.master.connect(this.muffleFilter).connect(ctx.destination);

    // Street-canyon reverb from a synthetic impulse response.
    const convolver = ctx.createConvolver();
    convolver.buffer = this.makeImpulse(1.6);
    this.reverbSend = ctx.createGain();
    this.reverbSend.gain.value = 0.22;
    this.reverbSend.connect(convolver);
    convolver.connect(this.master);

    this.noiseBuf = this.makeNoise(2, false);
    this.brownBuf = this.makeNoise(3, true);

    // Rain bed: hiss plus a patter layer, muffled under cover.
    this.rainFilter = ctx.createBiquadFilter();
    this.rainFilter.type = 'lowpass';
    this.rainFilter.frequency.value = 7000;
    this.rainGain = ctx.createGain();
    this.rainGain.gain.value = 0;
    const bed = this.loop(this.noiseBuf);
    const bedBp = ctx.createBiquadFilter();
    bedBp.type = 'bandpass'; bedBp.frequency.value = 2800; bedBp.Q.value = 0.5;
    bed.connect(bedBp).connect(this.rainFilter).connect(this.rainGain).connect(this.master);
    this.rainGain.connect(this.reverbSend);
    const patter = this.loop(this.noiseBuf);
    const patterHp = ctx.createBiquadFilter();
    patterHp.type = 'highpass'; patterHp.frequency.value = 4500;
    this.patterGain = ctx.createGain();
    this.patterGain.gain.value = 0;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 6.3;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 0.35;
    lfo.connect(lfoGain).connect(this.patterGain.gain);
    lfo.start();
    patter.connect(patterHp).connect(this.patterGain).connect(this.rainFilter);
    // Drumming on an awning overhead.
    const awning = this.loop(this.noiseBuf);
    const awningBp = ctx.createBiquadFilter();
    awningBp.type = 'bandpass'; awningBp.frequency.value = 900; awningBp.Q.value = 1.2;
    this.awningGain = ctx.createGain();
    this.awningGain.gain.value = 0;
    awning.connect(awningBp).connect(this.awningGain).connect(this.master);

    // City: low rumble and distant traffic.
    const rumble = this.loop(this.brownBuf);
    const rumbleLp = ctx.createBiquadFilter();
    rumbleLp.type = 'lowpass'; rumbleLp.frequency.value = 140;
    this.cityGain = ctx.createGain();
    this.cityGain.gain.value = 0.35;
    rumble.connect(rumbleLp).connect(this.cityGain).connect(this.master);
    const traffic = this.loop(this.noiseBuf);
    const trafficBp = ctx.createBiquadFilter();
    trafficBp.type = 'bandpass'; trafficBp.frequency.value = 320; trafficBp.Q.value = 0.8;
    const trafficGain = ctx.createGain();
    trafficGain.gain.value = 0.05;
    const trafficLfo = ctx.createOscillator();
    trafficLfo.frequency.value = 0.07;
    const trafficLfoGain = ctx.createGain();
    trafficLfoGain.gain.value = 0.03;
    trafficLfo.connect(trafficLfoGain).connect(trafficGain.gain);
    trafficLfo.start();
    traffic.connect(trafficBp).connect(trafficGain).connect(this.cityGain);

    // Breathing inside the helmet (bypasses the muffle filter: it is already inside).
    const breath = this.loop(this.noiseBuf);
    const breathBp = ctx.createBiquadFilter();
    breathBp.type = 'bandpass'; breathBp.frequency.value = 700; breathBp.Q.value = 0.6;
    this.breathGain = ctx.createGain();
    this.breathGain.gain.value = 0;
    const breathLfo = ctx.createOscillator();
    breathLfo.frequency.value = 0.27;
    const breathLfoGain = ctx.createGain();
    breathLfoGain.gain.value = 0.5;
    const breathBase = ctx.createGain();
    breathBase.gain.value = 0.5;
    breathLfo.connect(breathLfoGain).connect(breathBase.gain);
    breathLfo.start();
    breath.connect(breathBp).connect(breathBase).connect(this.breathGain).connect(ctx.destination);

    // Positioned voice pools.
    for (let i = 0; i < 6; i++) this.neonVoices.push(this.makeNeonVoice());
    for (let i = 0; i < 3; i++) this.holoVoices.push(this.makeHoloVoice());
    for (let i = 0; i < 8; i++) this.dripVoices.push({ voice: this.makeVoice(0.6, 9), next: Math.random() });
    this.droneVoice = this.makeDroneVoice();
  }

  setVolume(v: number): void {
    this.volume = v;
    if (this.master) this.master.gain.setTargetAtTime(v, this.ctx!.currentTime, 0.05);
  }

  /** 0 = open air, 1 = sealed inside the helmet. */
  setMuffle(m: number): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.muffleFilter.frequency.setTargetAtTime(20000 - 19400 * m, t, 0.08);
    this.breathGain.gain.setTargetAtTime(0.14 * m * this.volume, t, 0.1);
  }

  /** Intro cues. */
  cue(name: string): void {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    if (name === 'seal') {
      // Latch click, then a pressure hiss.
      this.oneShot(this.noiseBuf, null, 'highpass', 2500, 0.5, 0.002, 0.04, 1.5);
      setTimeout(() => this.oneShot(this.noiseBuf, null, 'bandpass', 3800, 0.22, 0.05, 0.9, 1.0), 120);
    } else if (name === 'thud') {
      this.oneShot(this.brownBuf, null, 'lowpass', 300, 0.9, 0.004, 0.35, 0.9);
      setTimeout(() => this.oneShot(this.noiseBuf, null, 'bandpass', 2200, 0.25, 0.01, 0.3, 1.1), 30);
    } else if (name === 'splash') {
      this.oneShot(this.noiseBuf, null, 'bandpass', 1800, 0.35, 0.01, 0.35, 1.0);
      this.oneShot(this.noiseBuf, null, 'lowpass', 400, 0.3, 0.005, 0.2, 0.7);
    } else if (name === 'drip') {
      for (let i = 0; i < 5; i++) setTimeout(() => this.plink([0, 0, 0]), 150 + i * 180 + Math.random() * 120);
    } else if (name === 'breath') {
      void t;
    }
  }

  // ------------------------------------------------------------ helpers

  private makeNoise(seconds: number, brown: boolean): AudioBuffer {
    const ctx = this.ctx!;
    const buf = ctx.createBuffer(2, Math.floor(ctx.sampleRate * seconds), ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      let last = 0;
      for (let i = 0; i < d.length; i++) {
        const w = Math.random() * 2 - 1;
        if (brown) { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; }
        else d[i] = w;
      }
    }
    return buf;
  }

  private makeImpulse(seconds: number): AudioBuffer {
    const ctx = this.ctx!;
    const n = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(2, n, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      const pre = Math.floor(ctx.sampleRate * 0.02);
      for (let i = pre; i < n; i++) {
        const t = (i - pre) / ctx.sampleRate;
        d[i] = (Math.random() * 2 - 1) * Math.exp(-t / (seconds * 0.35)) * 0.5;
      }
    }
    return buf;
  }

  private loop(buf: AudioBuffer): AudioBufferSourceNode {
    const src = this.ctx!.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    src.start();
    return src;
  }

  private makeVoice(refDistance: number, maxDistance: number): Voice {
    const ctx = this.ctx!;
    const panner = ctx.createPanner();
    panner.panningModel = 'HRTF';
    panner.distanceModel = 'inverse';
    panner.refDistance = refDistance;
    panner.maxDistance = maxDistance;
    panner.rolloffFactor = 1.4;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    gain.connect(panner).connect(this.master);
    gain.connect(this.reverbSend);
    return { panner, gain, target: null };
  }

  private place(v: Voice, p: Vec3): void {
    const t = this.ctx!.currentTime;
    v.panner.positionX.setTargetAtTime(p[0], t, 0.05);
    v.panner.positionY.setTargetAtTime(p[1], t, 0.05);
    v.panner.positionZ.setTargetAtTime(p[2], t, 0.05);
  }

  private makeNeonVoice() {
    const ctx = this.ctx!;
    const voice = this.makeVoice(0.8, 12);
    const hum = ctx.createOscillator();
    hum.type = 'sawtooth';
    hum.frequency.value = 120 + Math.random() * 1.5;
    const humLp = ctx.createBiquadFilter();
    humLp.type = 'lowpass'; humLp.frequency.value = 900;
    const humGain = ctx.createGain();
    humGain.gain.value = 0.05;
    hum.connect(humLp).connect(humGain).connect(voice.gain);
    hum.start();
    const crackleSrc = this.loop(this.noiseBuf);
    const crackleHp = ctx.createBiquadFilter();
    crackleHp.type = 'highpass'; crackleHp.frequency.value = 3500;
    const crackle = ctx.createGain();
    crackle.gain.value = 0;
    crackleSrc.connect(crackleHp).connect(crackle).connect(voice.gain);
    return { voice, crackle };
  }

  private makeHoloVoice() {
    const ctx = this.ctx!;
    const voice = this.makeVoice(1.2, 14);
    const osc = ctx.createOscillator();
    osc.type = 'square';
    osc.frequency.value = 440;
    const shaper = ctx.createWaveShaper();
    const curve = new Float32Array(16);
    for (let i = 0; i < 16; i++) curve[i] = Math.round(((i / 15) * 2 - 1) * 3) / 3;
    shaper.curve = curve;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 2200;
    const g = ctx.createGain();
    g.gain.value = 0.025;
    osc.connect(shaper).connect(lp).connect(g).connect(voice.gain);
    osc.start();
    return { voice, osc, next: 0 };
  }

  private makeDroneVoice() {
    const ctx = this.ctx!;
    const voice = this.makeVoice(2.5, 60);
    voice.panner.rolloffFactor = 1.1;
    const oscs: OscillatorNode[] = [];
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 2600;
    lp.connect(voice.gain);
    for (let i = 0; i < 4; i++) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = 95 + i * 1.7;
      const g = ctx.createGain();
      g.gain.value = 0.09;
      o.connect(g).connect(lp);
      o.start();
      oscs.push(o);
    }
    const air = this.loop(this.noiseBuf);
    const airBp = ctx.createBiquadFilter();
    airBp.type = 'bandpass'; airBp.frequency.value = 1100; airBp.Q.value = 0.7;
    const noise = ctx.createGain();
    noise.gain.value = 0.12;
    air.connect(airBp).connect(noise).connect(voice.gain);
    return { voice, oscs, noise, lastPos: [0, 0, 0] as Vec3 };
  }

  private oneShot(buf: AudioBuffer, p: Vec3 | null, filterType: BiquadFilterType, freq: number, gain: number, attack: number, decay: number, playbackRate = 1): void {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = playbackRate;
    const f = ctx.createBiquadFilter();
    f.type = filterType;
    f.frequency.value = freq;
    const g = ctx.createGain();
    const t = ctx.currentTime;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0005, t + attack + decay);
    src.connect(f).connect(g);
    if (p) {
      const panner = ctx.createPanner();
      panner.panningModel = 'HRTF';
      panner.refDistance = 0.8;
      panner.positionX.value = p[0]; panner.positionY.value = p[1]; panner.positionZ.value = p[2];
      g.connect(panner).connect(this.master);
      g.connect(this.reverbSend);
    } else {
      g.connect(this.master);
      g.connect(this.reverbSend);
    }
    src.start(t);
    src.stop(t + attack + decay + 0.05);
  }

  private plink(p: Vec3): void {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.type = 'sine';
    const f0 = 1400 + Math.random() * 1800;
    const t = ctx.currentTime;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(f0 * 0.6, t + 0.08);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.12, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0005, t + 0.09);
    const panner = ctx.createPanner();
    panner.panningModel = 'HRTF';
    panner.refDistance = 0.7;
    panner.positionX.value = p[0]; panner.positionY.value = p[1]; panner.positionZ.value = p[2];
    o.connect(g).connect(panner).connect(this.master);
    g.connect(this.reverbSend);
    o.start(t);
    o.stop(t + 0.12);
  }

  private siren(): void {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 1200;
    const g = ctx.createGain();
    const pan = ctx.createStereoPanner();
    pan.pan.value = Math.random() < 0.5 ? -0.8 : 0.8;
    const t = ctx.currentTime;
    const dur = 9 + Math.random() * 5;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.012, t + dur * 0.4);
    g.gain.linearRampToValueAtTime(0, t + dur);
    for (let k = 0; k < dur / 1.4; k++) {
      o.frequency.setValueAtTime(620, t + k * 1.4);
      o.frequency.linearRampToValueAtTime(880, t + k * 1.4 + 0.7);
      o.frequency.linearRampToValueAtTime(620, t + k * 1.4 + 1.4);
    }
    pan.pan.linearRampToValueAtTime(-pan.pan.value, t + dur);
    o.connect(lp).connect(g).connect(pan).connect(this.master);
    g.connect(this.reverbSend);
    o.start(t);
    o.stop(t + dur + 0.1);
  }

  private thunder(): void {
    const ctx = this.ctx!;
    const delay = 0.4 + Math.random() * 2.5;
    const t = ctx.currentTime + delay;
    const src = ctx.createBufferSource();
    src.buffer = this.brownBuf;
    src.playbackRate.value = 0.5 + Math.random() * 0.3;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(600, t);
    lp.frequency.exponentialRampToValueAtTime(90, t + 4);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.9 / (1 + delay * 0.4), t + 0.08);
    g.gain.exponentialRampToValueAtTime(0.3, t + 0.9);
    g.gain.exponentialRampToValueAtTime(0.001, t + 4.5 + Math.random() * 2);
    src.connect(lp).connect(g).connect(this.master);
    g.connect(this.reverbSend);
    src.start(t);
    src.stop(t + 7);
  }

  // ------------------------------------------------------------- update

  private isCovered(p: Vec3): boolean {
    for (const c of this.covers) {
      if (p[0] >= c.min[0] && p[0] <= c.max[0] && p[2] >= c.min[2] && p[2] <= c.max[2] && p[1] < c.min[1]) return true;
    }
    return false;
  }

  update(f: AudioFrame): void {
    if (!this.started || !this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const L = ctx.listener;
    if (L.positionX) {
      L.positionX.setTargetAtTime(f.camPos[0], t, 0.03);
      L.positionY.setTargetAtTime(f.camPos[1], t, 0.03);
      L.positionZ.setTargetAtTime(f.camPos[2], t, 0.03);
      L.forwardX.setTargetAtTime(f.fwd[0], t, 0.03);
      L.forwardY.setTargetAtTime(f.fwd[1], t, 0.03);
      L.forwardZ.setTargetAtTime(f.fwd[2], t, 0.03);
      L.upX.setTargetAtTime(f.up[0], t, 0.03);
      L.upY.setTargetAtTime(f.up[1], t, 0.03);
      L.upZ.setTargetAtTime(f.up[2], t, 0.03);
    }

    // Rain mix and cover.
    const coveredNow = this.isCovered(f.camPos) ? 1 : 0;
    this.covered += (coveredNow - this.covered) * Math.min(1, f.dt * 6);
    const rain = Math.min(2, f.rain);
    this.rainGain.gain.setTargetAtTime(0.16 * rain * (1 - 0.6 * this.covered), t, 0.2);
    this.patterGain.gain.setTargetAtTime(0.5 * rain * (1 - 0.7 * this.covered), t, 0.2);
    this.rainFilter.frequency.setTargetAtTime(7000 - 5800 * this.covered, t, 0.2);
    this.awningGain.gain.setTargetAtTime(0.18 * rain * this.covered, t, 0.2);

    // Occasional distant siren.
    if (f.time > this.nextSiren) {
      this.siren();
      this.nextSiren = f.time + 45 + Math.random() * 60;
    }
    if (f.lightningStarted) this.thunder();

    // Footsteps: a thud plus a splash now and then.
    for (const p of f.footsteps) {
      this.oneShot(this.noiseBuf, null, 'lowpass', 500, 0.16, 0.005, 0.11, 0.8);
      if (Math.random() < 0.5 * Math.min(1, rain)) this.oneShot(this.noiseBuf, p, 'bandpass', 2600, 0.11, 0.01, 0.17, 1.2);
    }

    // Re-assign positioned voices to the nearest spots every half second.
    if (f.time > this.nextAssign) {
      this.nextAssign = f.time + 0.5;
      const neon = this.spots.filter((s) => s.kind === 0).sort((a, b) => dist(a.pos, f.camPos) - dist(b.pos, f.camPos));
      this.neonVoices.forEach((v, i) => {
        const s = neon[i];
        if (!s) { v.voice.gain.gain.setTargetAtTime(0, t, 0.3); return; }
        this.place(v.voice, s.pos);
        v.voice.gain.gain.setTargetAtTime(1, t, 0.3);
      });
      const holo = this.spots.filter((s) => s.kind === 1).sort((a, b) => dist(a.pos, f.camPos) - dist(b.pos, f.camPos));
      this.holoVoices.forEach((v, i) => {
        const s = holo[i];
        if (!s) { v.voice.gain.gain.setTargetAtTime(0, t, 0.3); return; }
        this.place(v.voice, s.pos);
        v.voice.gain.gain.setTargetAtTime(1, t, 0.3);
      });
      const edges = [...this.dripEdges].sort((a, b) => dist(a[0], f.camPos) - dist(b[0], f.camPos)).slice(0, this.dripVoices.length);
      this.dripVoices.forEach((v, i) => { v.voice.target = edges[i] ? edges[i][0] : null; if (edges[i]) v.voice.target = edges[i][0]; });
      this.dripVoices.forEach((v, i) => {
        const e = edges[i];
        if (e) {
          const k = Math.random();
          v.voice.target = [e[0][0] + (e[1][0] - e[0][0]) * k, e[0][1] - 1.5, e[0][2] + (e[1][2] - e[0][2]) * k];
        }
      });
    }
    // Neon crackle bursts and hologram bleeps.
    for (const v of this.neonVoices) {
      if (Math.random() < f.dt * 1.5) {
        v.crackle.gain.setValueAtTime(0.08, t);
        v.crackle.gain.exponentialRampToValueAtTime(0.0005, t + 0.03 + Math.random() * 0.05);
      }
    }
    for (const v of this.holoVoices) {
      if (f.time > v.next) {
        v.next = f.time + 0.08 + Math.random() * 0.35;
        v.osc.frequency.setValueAtTime(300 + Math.random() * 1500, t);
      }
    }
    // Drips, more often in heavier rain.
    for (const v of this.dripVoices) {
      if (v.voice.target && f.time > v.next) {
        v.next = f.time + 0.25 + Math.random() * 1.4 / Math.max(0.3, rain);
        this.plink(v.voice.target);
      }
    }

    // Drone: rotor pitch follows thrust, doppler from radial velocity.
    if (this.droneVoice) {
      const d = this.droneVoice;
      if (f.drone) {
        this.place(d.voice, f.drone.pos);
        const toCam = [f.camPos[0] - f.drone.pos[0], f.camPos[1] - f.drone.pos[1], f.camPos[2] - f.drone.pos[2]];
        const r = Math.hypot(toCam[0], toCam[1], toCam[2]) || 1;
        const vel = [(f.drone.pos[0] - d.lastPos[0]) / Math.max(f.dt, 1e-3), (f.drone.pos[1] - d.lastPos[1]) / Math.max(f.dt, 1e-3), (f.drone.pos[2] - d.lastPos[2]) / Math.max(f.dt, 1e-3)];
        const radial = (vel[0] * toCam[0] + vel[1] * toCam[1] + vel[2] * toCam[2]) / r;
        const doppler = 1 + Math.max(-0.08, Math.min(0.08, radial / 343 * 6));
        const base = (f.drone.rotorSpeed / 180) * 95 * doppler;
        d.oscs.forEach((o, i) => o.frequency.setTargetAtTime(base * (1 + i * 0.018), t, 0.08));
        d.voice.gain.gain.setTargetAtTime(1, t, 0.2);
        d.lastPos = [...f.drone.pos];
      } else {
        d.voice.gain.gain.setTargetAtTime(0, t, 0.3);
      }
    }
  }
}
