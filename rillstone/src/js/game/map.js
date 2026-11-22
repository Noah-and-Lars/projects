// The map (M): a top-down view of the valley with the river, Millbrook,
// Upper Falls, the claims (yours filled in), the Pumphouse, the adit, the
// road, your vehicles, other players and you.
import { h } from '../ui/dom.js';
import { HALF, height, riverX, RIVER_HALF_WIDTH, TOWN, HAMLET, CLAIMS, ADIT, PUMPHOUSE, ROAD } from '../world/valley.js';

export function createMap({ panels, economy, vehicles, player, coop }) {
  const S = 560, k = S / (2 * HALF);
  const toPx = (x, z) => [(x + HALF) * k, (z + HALF) * k];
  let base = null;
  function drawBase() {
    base = document.createElement('canvas'); base.width = base.height = S;
    const g = base.getContext('2d'), img = g.createImageData(S, S), N = 140, cell = S / N;
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const x = -HALF + (i + 0.5) * (2 * HALF / N), z = -HALF + (j + 0.5) * (2 * HALF / N), y = height(x, z);
      const water = Math.abs(x - riverX(z)) < RIVER_HALF_WIDTH(z);
      const t = Math.max(0, Math.min(1, (y - 4) / 90));
      const col = water ? [96, 150, 168] : y > 92 ? [236, 238, 240] : [143 - t * 40 + t * 60, 179 - t * 60, 92 - t * 10 + t * 50];
      for (let dy = 0; dy < cell; dy++) for (let dx = 0; dx < cell; dx++) { const px = Math.floor(i * cell + dx), py = Math.floor(j * cell + dy); const o = (py * S + px) * 4; img.data[o] = col[0]; img.data[o + 1] = col[1]; img.data[o + 2] = col[2]; img.data[o + 3] = 255; }
    }
    g.putImageData(img, 0, 0);
    g.strokeStyle = 'rgba(200,180,140,0.9)'; g.lineWidth = 3; g.beginPath(); ROAD.forEach(([x, z], i) => { const [px, py] = toPx(x, z); i ? g.lineTo(px, py) : g.moveTo(px, py); }); g.stroke();
  }
  function label(g, text, x, y, size = 12) { g.font = `600 ${size}px sans-serif`; g.textAlign = 'center'; g.lineWidth = 3; g.strokeStyle = 'rgba(246,238,219,0.9)'; g.strokeText(text, x, y); g.fillStyle = '#2b3440'; g.fillText(text, x, y); }
  function draw(c) {
    if (!base) drawBase();
    const g = c.getContext('2d');
    g.drawImage(base, 0, 0);
    for (const cl of CLAIMS) {
      const [x0, y0] = toPx(cl.x0, cl.z0), [x1, y1] = toPx(cl.x1, cl.z1), own = economy.owns(cl.id);
      g.fillStyle = own ? 'rgba(200,144,44,0.55)' : 'rgba(255,255,255,0.18)'; g.fillRect(x0, y0, x1 - x0, y1 - y0);
      g.strokeStyle = own ? '#a8701c' : 'rgba(43,52,64,0.6)'; g.lineWidth = 1.5; g.setLineDash(cl.tunnel ? [3, 3] : []); g.strokeRect(x0, y0, x1 - x0, y1 - y0); g.setLineDash([]);
      label(g, cl.name, (x0 + x1) / 2, y1 + 12, 11);
    }
    for (const [p, name, r] of [[TOWN, 'Millbrook', 6], [HAMLET, 'Upper Falls', 5], [PUMPHOUSE, 'Pumphouse', 3]]) { const [x, y] = toPx(p.x, p.z); g.fillStyle = '#2a8a86'; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill(); label(g, name, x, y - r - 4); }
    { const [x, y] = toPx(ADIT.x, ADIT.z); g.fillStyle = '#3a2a1a'; g.fillRect(x - 3, y - 3, 6, 6); label(g, 'Adit', x, y - 7, 11); }
    for (const v of vehicles.list.values()) { const [x, y] = toPx(v.group.position.x, v.group.position.z); g.fillStyle = '#56616e'; g.fillRect(x - 3, y - 3, 6, 6); }
    for (const a of coop?.avatars?.values() || []) { const [x, y] = toPx(a.g.position.x, a.g.position.z); g.fillStyle = '#6e56a8'; g.beginPath(); g.arc(x, y, 4, 0, Math.PI * 2); g.fill(); }
    // You: an arrow pointing where you look.
    const [px, py] = toPx(player.cur.x, player.cur.z), yaw = player.yaw;
    g.save(); g.translate(px, py); g.rotate(-yaw); g.fillStyle = '#c8342a'; g.strokeStyle = '#fff'; g.lineWidth = 1.5;
    g.beginPath(); g.moveTo(0, -9); g.lineTo(6, 6); g.lineTo(0, 3); g.lineTo(-6, 6); g.closePath(); g.fill(); g.stroke(); g.restore();
  }
  return {
    open() {
      const c = h('canvas', { width: S, height: S, class: 'map' });
      draw(c);
      panels.show('map', 'Rillstone Vale', h('div', { class: 'mapwrap' }, c, h('p', { class: 'small' }, 'Gold: your claims. Dashed: the Ember Seam, inside the mountain behind the adit. The pale line is the road up to Upper Falls.')), { badge: 'M' });
    },
  };
}
