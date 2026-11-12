// The speedometer dial (1.1), the same one Poly Racer uses: revs on a needle,
// the gear in the middle, three lights, and the speed in big digits.
// A bike has no real gearbox in the physics, so gears and revs come from the
// speed, the throttle and the rear wheel's spin.
const RED = 10500, IDLE = 1600, MAXK = Math.ceil(RED / 1000) + 1, GEARS = 5;

export function createSpeedo(canvas) {
  let key = '', gear = 1, rpm = IDLE;
  function update(bike, dt) {
    const v = bike.chassis.getLinearVelocity();
    const spd = Math.hypot(v.x, v.y);
    const top = bike.spec.topSpeed * 1.05;
    const wheel = Math.abs(bike.rear.getAngularVelocity()) * 0.36;
    const s = bike.grounded ? Math.max(spd, wheel) : wheel; // revs follow the rear wheel in the air
    // gear changes with a little hysteresis
    const band = top / GEARS;
    const want = Math.max(1, Math.min(GEARS, 1 + Math.floor(spd / band)));
    if (want > gear && spd > band * gear + 0.6) gear = want;
    else if (want < gear && spd < band * (gear - 1) - 0.6) gear = want;
    const inGear = Math.max(0, Math.min(1.15, (s - band * (gear - 1)) / band));
    const thr = bike.input.throttle > 0 ? 1 : 0;
    const target = bike.crashed ? IDLE : IDLE + (RED - IDLE) * (0.25 + 0.72 * inGear) * (thr ? 1 : 0.8) + (thr && spd < 1 ? 1800 : 0);
    rpm += (Math.min(RED + 400, target) - rpm) * Math.min(1, dt * 10);
    const reverse = bike.input.brake > 0 && v.x < -0.5;
    draw(spd, reverse ? 'R' : spd < 0.3 && !thr ? 'N' : gear, !bike.grounded && !bike.crashed, thr > 0, bike.input.brake > 0);
  }
  function draw(spd, g8, air, gas, brk) {
    const sv = spd * 3.6;
    const k = Math.round(rpm / 25) + ':' + Math.round(sv) + ':' + g8 + ':' + air + gas + brk;
    if (k === key) return;
    key = k;
    const g = canvas.getContext('2d'), W = canvas.width, cx = W * 0.5, cy = W * 0.4, R = W * 0.36;
    g.clearRect(0, 0, W, W);
    const a0 = Math.PI * 0.72, a1 = Math.PI * 2.28, A = (x) => a0 + (a1 - a0) * x / MAXK;
    const bg = g.createRadialGradient(cx, cy, R * 0.2, cx, cy, R * 1.15); bg.addColorStop(0, '#0b0d12d8'); bg.addColorStop(1, '#0b0d1200');
    g.fillStyle = bg; g.beginPath(); g.arc(cx, cy, R * 1.15, 0, 7); g.fill();
    g.lineCap = 'butt'; g.lineWidth = W * 0.035; g.strokeStyle = '#d9dde3'; g.beginPath(); g.arc(cx, cy, R, a0, A(RED / 1000)); g.stroke();
    g.strokeStyle = '#e8262a'; g.beginPath(); g.arc(cx, cy, R, A(RED / 1000), a1); g.stroke();
    g.textAlign = 'center'; g.textBaseline = 'middle';
    for (let x = 0; x <= MAXK + 1e-6; x += 0.5) {
      const a = A(x), major = x % 1 === 0, redZ = x >= RED / 1000;
      g.strokeStyle = redZ ? '#ff3a3a' : '#f2f4f8'; g.lineWidth = major ? W * 0.008 : W * 0.004;
      const r0 = R - W * 0.025, r1 = R - (major ? W * 0.07 : W * 0.045);
      g.beginPath(); g.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0); g.lineTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1); g.stroke();
      if (major) { g.fillStyle = redZ ? '#ff3a3a' : '#f2f4f8'; g.font = `600 ${W * 0.05}px system-ui, sans-serif`; g.fillText(String(x), cx + Math.cos(a) * (R - W * 0.11), cy + Math.sin(a) * (R - W * 0.11)); }
    }
    const pill = (txt, x, y, on) => {
      g.lineWidth = W * 0.005; g.strokeStyle = on ? '#ffcc33' : '#c8ccd2'; g.fillStyle = on ? '#ffcc33' : 'transparent';
      const w = W * 0.09, h = W * 0.045;
      g.beginPath(); g.roundRect ? g.roundRect(x - w / 2, y - h / 2, w, h, h / 2) : g.rect(x - w / 2, y - h / 2, w, h); if (on) g.fill(); g.stroke();
      g.fillStyle = on ? '#140a00' : '#e6e9ee'; g.font = `700 ${W * 0.03}px system-ui`; g.fillText(txt, x, y + 1);
    };
    pill('BRK', cx - R * 0.42, cy + R * 0.05, brk); pill('AIR', cx, cy - R * 0.33, air); pill('GAS', cx + R * 0.42, cy + R * 0.05, gas);
    const na = A(Math.min(MAXK, rpm / 1000));
    g.strokeStyle = '#ffffff'; g.lineWidth = W * 0.012; g.lineCap = 'round';
    g.beginPath(); g.moveTo(cx + Math.cos(na) * R * 0.2, cy + Math.sin(na) * R * 0.2); g.lineTo(cx + Math.cos(na) * (R + W * 0.01), cy + Math.sin(na) * (R + W * 0.01)); g.stroke();
    g.fillStyle = '#0b3b2e'; g.beginPath(); g.arc(cx, cy, R * 0.17, 0, 7); g.fill();
    g.lineWidth = W * 0.012; g.strokeStyle = '#3ee6b0'; g.beginPath(); g.arc(cx, cy, R * 0.17, 0, 7); g.stroke();
    g.fillStyle = '#e8fff6'; g.font = `italic 700 ${W * 0.1}px system-ui`; g.fillText(String(g8), cx, cy + W * 0.004);
    const s3 = String(Math.min(999, Math.round(sv))).padStart(3, '0'), lead = s3.match(/^0*/)[0].length;
    g.font = `italic 200 ${W * 0.18}px "Helvetica Neue", system-ui, sans-serif`; g.textAlign = 'left'; g.textBaseline = 'alphabetic';
    const tw = g.measureText(s3).width;
    let x = cx - tw / 2 - W * 0.02;
    for (let i = 0; i < 3; i++) { g.fillStyle = i < Math.min(lead, 2) ? '#8a8f98' : '#ffffff'; g.fillText(s3[i], x, W * 0.93); x += g.measureText(s3[i]).width; }
    g.fillStyle = '#e6e9ee'; g.font = `italic 600 ${W * 0.045}px system-ui`; g.fillText('KM/H', x + W * 0.01, cy + R * 0.62);
  }
  function reset() { gear = 1; rpm = IDLE; key = ''; }
  return { update, reset };
}
