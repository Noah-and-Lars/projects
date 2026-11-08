// The film's sounds, made in code with the Web Audio API in its own audio
// context (freed when the film closes), as the breakdowns' click is.
//
// The shot (in time and slowed right down for the bullet cam), the air
// the slowed bullet roars through, a low drone and heartbeat under the
// deepest slow motion, the bullet striking cloth (a dull,
// padded thud, deepened in slow motion), time snapping back, his
// footfalls, the rustle of his kit, the cases landing, the enemy's pistol
// clattering down, and the soft thumps of the dive, the roll and the fall.

const rand = (a, b) => a + Math.random() * (b - a);

export class FilmSound {
  constructor() {
    this.cache = new Map();
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
    if (!this.ctx) return null; // (no Web Audio: silence)
    if (!this.cache.has(key)) {
      const ctx = this.ctx, rate = ctx.sampleRate;
      const buf = ctx.createBuffer(1, Math.floor(rate * seconds), rate);
      fill(buf.getChannelData(0), rate);
      this.cache.set(key, buf);
    }
    return this.cache.get(key);
  }

  play(buf, { volume = 1, rate = 1, reverb = 0.3, at = 0 } = {}) {
    if (!this.ok || !buf) return;
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

  // Under the deepest slow motion: a low drone with a slow heartbeat in
  // it, over `seconds`, swelling in and fading out.
  drone(seconds) {
    if (!this.ok) return;
    this.play(this.buffer('drone' + seconds.toFixed(1), seconds, (d, rate) => {
      let a = 0;
      for (let i = 0; i < d.length; i++) {
        const t = i / rate;
        a += 0.002 * ((Math.random() * 2 - 1) - a);
        const env = Math.min(1, t / 0.8) * Math.min(1, (seconds - t) / 1.2);
        // (Two soft beats every 1.15 s.)
        const beat = t % 1.15;
        const thud = Math.sin(2 * Math.PI * 48 * beat) * (Math.exp(-beat / 0.07) + 0.7 * (beat > 0.28 ? Math.exp(-(beat - 0.28) / 0.07) : 0));
        d[i] = (Math.sin(2 * Math.PI * 41 * t) * 0.25 + Math.sin(2 * Math.PI * 61.5 * t) * 0.1 + a * 6 + thud * 0.55) * env;
      }
    }), { volume: 0.6, reverb: 0.25 });
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

  // A boot striking the ground at a run: a short, gritty scuff over a
  // low knock.
  step(rate = 1, volume = 1) {
    const k = Math.floor(Math.random() * 3);
    this.play(this.buffer('step' + k, 0.16, (d, sr) => {
      let a = 0, b = 0;
      for (let i = 0; i < d.length; i++) {
        const t = i / sr;
        const n = Math.random() * 2 - 1;
        a += 0.5 * (n - a);
        b += 0.04 * (n - b);
        d[i] = a * Math.exp(-t / (0.01 + k * 0.003)) * 0.35 + (b * 3 + Math.sin(2 * Math.PI * (85 + k * 9) * t) * 0.5) * Math.exp(-t / 0.025);
      }
    }), { volume: 0.32 * volume, reverb: 0.12, rate: rate * rand(0.92, 1.08) });
  }

  // His kit rustling and his knee meeting the ground as he settles.
  cloth(rate = 1, volume = 1) {
    this.play(this.buffer('cloth', 0.45, (d, sr) => {
      let a = 0;
      for (let i = 0; i < d.length; i++) {
        const t = i / sr, x = t / 0.45;
        a += 0.2 * ((Math.random() * 2 - 1) - a);
        d[i] = a * Math.sin(Math.PI * x) * (0.6 + 0.4 * Math.sin(t * 60)) * 0.7;
      }
    }), { volume: 0.4 * volume, reverb: 0.1, rate });
  }

  // The bullet striking his sleeve: a dull, padded thud with a soft tear
  // (slowed, a deep boom).
  hit(rate = 1) {
    this.play(this.buffer('hit', 0.6, (d, sr) => {
      let a = 0, b = 0;
      for (let i = 0; i < d.length; i++) {
        const t = i / sr;
        const n = Math.random() * 2 - 1;
        a += 0.08 * (n - a);
        b += 0.6 * (n - b);
        d[i] = (a * 2.5 + Math.sin(2 * Math.PI * 55 * t) * 0.8) * Math.exp(-t / 0.07) + b * Math.exp(-t / 0.006) * 0.4;
      }
    }), { volume: 0.8, reverb: 0.35, rate: Math.max(0.25, rate) });
  }

  // A pistol hitting the ground: a hard knock and a short metallic rattle.
  clatter(rate = 1) {
    this.play(this.buffer('clatter', 0.4, (d, sr) => {
      const partials = [[1850, 0.5, 0.05], [2900, 0.35, 0.04], [4100, 0.2, 0.03], [760, 0.4, 0.06]];
      for (let i = 0; i < d.length; i++) {
        const t = i / sr;
        let v = 0;
        for (const [f, a, tau] of partials) v += a * Math.sin(2 * Math.PI * f * t) * (Math.exp(-t / tau) + 0.5 * Math.exp(-Math.abs(t - 0.09) / tau) * (t > 0.09 ? 1 : 0));
        d[i] = v * 0.4 + (Math.random() * 2 - 1) * Math.exp(-t / 0.005) * 0.5;
      }
    }), { volume: 0.5, reverb: 0.3, rate });
  }
}
