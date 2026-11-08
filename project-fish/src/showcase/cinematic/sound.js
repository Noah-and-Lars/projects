// The film's sounds, made in code with the Web Audio API in its own audio
// context (freed when the film closes), as the breakdowns' click is.
//
// The shot (in time and slowed right down for the bullet cam), the air
// the slowed bullet roars through, the steel plate's ring (slowed at the
// strike, then at full speed as time snaps back), the case landing, and
// the soft thumps of his dive and roll.

const rand = (a, b) => a + Math.random() * (b - a);

export class FilmSound {
  constructor() {
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    } catch {
      this.ctx = null;
      return;
    }
    const ctx = this.ctx;
    this.out = ctx.createDynamicsCompressor();
    this.out.threshold.value = -14;
    this.out.ratio.value = 3.5;
    this.out.connect(ctx.destination);
    this.master = ctx.createGain();
    this.master.gain.value = 0.7;
    this.master.connect(this.out);
    // An outdoor echo: a few reflections, then a fading tail.
    this.verb = ctx.createConvolver();
    this.verb.buffer = this.echo(2.6);
    const send = ctx.createGain();
    send.gain.value = 0.5;
    this.verb.connect(send).connect(this.master);
    this.cache = new Map();
  }

  get ok() {
    return !!this.ctx && this.ctx.state !== 'closed';
  }

  close() {
    if (this.ctx) this.ctx.close().catch(() => {});
    this.ctx = null;
  }

  resume() {
    if (this.ok && this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
  }

  echo(seconds) {
    const ctx = this.ctx, rate = ctx.sampleRate, n = Math.floor(rate * seconds);
    const buf = ctx.createBuffer(2, n, rate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      for (const [at, v] of [[0.09, 0.5], [0.23, 0.35], [0.41, 0.25], [0.7, 0.18]]) {
        const i = Math.floor((at + rand(-0.01, 0.01)) * rate);
        for (let k = 0; k < 400 && i + k < n; k++) d[i + k] += (Math.random() * 2 - 1) * v * Math.exp(-k / 90);
      }
      let lp = 0;
      for (let i = 0; i < n; i++) {
        const t = i / rate;
        lp += 0.08 * ((Math.random() * 2 - 1) - lp);
        d[i] += lp * 0.6 * Math.exp(-t / 0.7);
      }
    }
    return buf;
  }

  // A buffer drawn sample by sample by fill(data, rate), made once.
  buffer(key, seconds, fill) {
    if (!this.cache.has(key)) {
      const ctx = this.ctx, rate = ctx.sampleRate;
      const buf = ctx.createBuffer(1, Math.floor(rate * seconds), rate);
      fill(buf.getChannelData(0), rate);
      this.cache.set(key, buf);
    }
    return this.cache.get(key);
  }

  play(buf, { volume = 1, rate = 1, reverb = 0.3, at = 0 } = {}) {
    if (!this.ok) return;
    this.resume();
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = rate;
    const g = this.ctx.createGain();
    g.gain.value = volume;
    src.connect(g).connect(this.master);
    if (reverb) {
      const s = this.ctx.createGain();
      s.gain.value = reverb;
      g.connect(s).connect(this.verb);
    }
    src.start(this.ctx.currentTime + at);
  }

  // A 9 mm shot: a sharp crack, a short bright blast and a low punch, and
  // the slide's clack.
  shotBuffer() {
    return this.buffer('shot', 0.5, (d, rate) => {
      let lp = 0, lp2 = 0;
      for (let i = 0; i < d.length; i++) {
        const t = i / rate;
        const n = Math.random() * 2 - 1;
        lp += 0.35 * (n - lp);
        lp2 += 0.03 * (n - lp2);
        const crack = t < 0.002 ? (1 - t / 0.002) * n : 0;
        const blast = lp * Math.exp(-t / 0.012) * 0.9;
        const punch = Math.sin(2 * Math.PI * 70 * t * (1 - t * 2)) * Math.exp(-t / 0.03) * 0.8 + lp2 * Math.exp(-t / 0.05) * 2;
        const clack = t > 0.012 ? (Math.random() * 2 - 1) * Math.exp(-(t - 0.012) / 0.004) * 0.25 : 0;
        const clack2 = t > 0.05 ? (Math.random() * 2 - 1) * Math.exp(-(t - 0.05) / 0.005) * 0.2 : 0;
        d[i] = crack + blast + punch + clack + clack2;
      }
    });
  }

  shot() {
    this.play(this.shotBuffer(), { volume: 0.9, reverb: 0.6 });
  }

  // The shot slowed to a deep, long boom.
  slowShot() {
    this.play(this.shotBuffer(), { volume: 1.1, rate: 0.2, reverb: 0.9 });
    this.play(this.buffer('sub', 3, (d, rate) => {
      for (let i = 0; i < d.length; i++) {
        const t = i / rate;
        d[i] = Math.sin(2 * Math.PI * (38 - 8 * t) * t) * Math.exp(-t / 0.9) * 0.7;
      }
    }), { volume: 0.9, reverb: 0.2 });
  }

  // The air the bullet tears through, slowed: a low roar that swells and
  // brightens over `seconds`.
  rush(seconds) {
    if (!this.ok) return;
    const key = 'rush' + seconds.toFixed(1);
    this.play(this.buffer(key, seconds, (d, rate) => {
      let a = 0, b = 0;
      for (let i = 0; i < d.length; i++) {
        const t = i / rate, x = t / seconds;
        const n = Math.random() * 2 - 1;
        const k = 0.01 + 0.05 * x;
        a += k * (n - a);
        b += 0.004 * (n - b);
        const env = Math.min(1, t / 0.6) * Math.min(1, (seconds - t) / 0.4);
        d[i] = (a * 1.4 + b * 3) * env * (0.35 + 0.4 * x) + Math.sin(2 * Math.PI * 1440 / 200 * t) * 0.02 * env;
      }
    }), { volume: 0.55, reverb: 0.15 });
  }

  // A steel plate's ring: a few inharmonic partials of a thick disc, each
  // dying away at its own rate, over a sharp knock. slow: the strike
  // slowed right down.
  ringBuffer() {
    return this.buffer('ring', 2.2, (d, rate) => {
      const partials = [[1010, 0.9, 0.55], [1655, 0.55, 0.5], [2390, 0.4, 0.38], [3170, 0.25, 0.3], [4280, 0.16, 0.22], [612, 0.3, 0.45]];
      for (let i = 0; i < d.length; i++) {
        const t = i / rate;
        let v = 0;
        for (const [f, a, tau] of partials) v += a * Math.sin(2 * Math.PI * f * t + f) * Math.exp(-t / tau);
        const knock = (Math.random() * 2 - 1) * Math.exp(-t / 0.004);
        d[i] = v * 0.35 * (1 - Math.exp(-t / 0.001)) + knock * 0.6;
      }
    });
  }

  ring() {
    this.play(this.ringBuffer(), { volume: 0.75, reverb: 0.55 });
  }

  slowRing() {
    this.play(this.ringBuffer(), { volume: 0.9, rate: 0.22, reverb: 0.7 });
  }

  // Time snapping back: a short rising rush into the real sound.
  snap() {
    this.play(this.buffer('snap', 0.5, (d, rate) => {
      let a = 0;
      for (let i = 0; i < d.length; i++) {
        const t = i / rate, x = t / 0.5;
        a += (0.02 + 0.4 * x * x) * ((Math.random() * 2 - 1) - a);
        d[i] = a * x * x * 0.8;
      }
    }), { volume: 0.5, reverb: 0.1 });
  }

  // A spent case landing: bright pings (rate below 1: slowed, deeper and
  // longer).
  tink(rate = 1, volume = 1) {
    if (!this.ok) return;
    this.resume();
    const ctx = this.ctx, now = ctx.currentTime;
    const base = rand(3800, 4600) * rate;
    for (let i = 0; i < 4; i++) {
      const o = ctx.createOscillator();
      o.frequency.value = base * (1 + i * 0.41);
      const g = ctx.createGain();
      const at = now + (i * rand(0.05, 0.11)) / rate;
      g.gain.setValueAtTime(0.0001, at);
      g.gain.exponentialRampToValueAtTime((0.06 * volume) / (i + 1), at + 0.002);
      g.gain.exponentialRampToValueAtTime(0.0001, at + 0.12 / rate);
      o.connect(g).connect(this.master);
      o.start(at);
      o.stop(at + 0.14 / rate);
    }
  }

  // A body landing or rolling on the ground; a hand slapping round the
  // gun as he catches it.
  thump(volume = 1, rate = 1) {
    this.play(this.buffer('thump', 0.3, (d, rate) => {
      let a = 0;
      for (let i = 0; i < d.length; i++) {
        const t = i / rate;
        a += 0.05 * ((Math.random() * 2 - 1) - a);
        d[i] = (a * 3 + Math.sin(2 * Math.PI * 60 * t) * 0.5) * Math.exp(-t / 0.06);
      }
    }), { volume: 0.6 * volume, reverb: 0.15, rate });
  }

  // Air rushing past, for a fast camera move or a body flying by.
  whoosh(rate = 1) {
    this.play(this.buffer('whoosh', 0.9, (d, rate) => {
      let a = 0;
      for (let i = 0; i < d.length; i++) {
        const t = i / rate, x = t / 0.9;
        a += (0.01 + 0.12 * Math.sin(Math.PI * x)) * ((Math.random() * 2 - 1) - a);
        d[i] = a * Math.sin(Math.PI * x) ** 2 * 2.2;
      }
    }), { volume: 0.45, reverb: 0.2, rate });
  }

  slap(rate = 1) {
    this.play(this.buffer('slap', 0.15, (d, rate) => {
      let a = 0;
      for (let i = 0; i < d.length; i++) {
        const t = i / rate;
        a += 0.3 * ((Math.random() * 2 - 1) - a);
        d[i] = a * Math.exp(-t / 0.012) * 1.2;
      }
    }), { volume: 0.5, rate: 0.8 * rate, reverb: 0.2 });
  }
}
