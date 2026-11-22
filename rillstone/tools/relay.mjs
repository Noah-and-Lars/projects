// A local stand-in for the arcade realtime Worker, for tests (M7). It speaks
// the same small protocol rt.js uses: one WebSocket per channel at
// /ws?topic=&key=; the server says {t:'joined'}, relays {t:'b', e, p, s}
// broadcasts to the channel (to the sender too when s is true), keeps
// presence from {t:'track', p} / {t:'untrack'} and pushes {t:'state', s}
// to everyone, and answers 'ping' with 'pong'.
//   node tools/relay.mjs [port]      (default 8790)
// It also counts bytes and messages per topic, for benchmark 5.
import { WebSocketServer } from 'ws';

export function startRelay(port = 8790, { maxMessage = 1 << 20 } = {}) {
  const wss = new WebSocketServer({ port, maxPayload: maxMessage });
  const topics = new Map(); // topic -> Set of sockets
  const stats = { msgs: 0, bytes: 0, biggest: 0 };
  const stateOf = (topic) => { const s = {}; for (const c of topics.get(topic) || []) if (c.meta) s[c.key] = [c.meta]; return s; };
  const pushState = (topic) => { const m = JSON.stringify({ t: 'state', s: stateOf(topic) }); for (const c of topics.get(topic) || []) if (c.readyState === 1) c.send(m); };
  wss.on('connection', (ws, req) => {
    const u = new URL(req.url, 'http://x');
    ws.topic = u.searchParams.get('topic') || ''; ws.key = u.searchParams.get('key') || Math.random().toString(36).slice(2);
    if (!topics.has(ws.topic)) topics.set(ws.topic, new Set());
    topics.get(ws.topic).add(ws);
    ws.send(JSON.stringify({ t: 'joined' }));
    ws.send(JSON.stringify({ t: 'state', s: stateOf(ws.topic) }));
    ws.on('message', (data) => {
      const txt = data.toString();
      if (txt === 'ping') { ws.send('pong'); return; }
      stats.msgs++; stats.bytes += txt.length; stats.biggest = Math.max(stats.biggest, txt.length);
      let m; try { m = JSON.parse(txt); } catch (_) { return; }
      if (m.t === 'track') { ws.meta = m.p; pushState(ws.topic); }
      else if (m.t === 'untrack') { ws.meta = null; pushState(ws.topic); }
      else if (m.t === 'b') {
        const out = JSON.stringify({ t: 'b', e: m.e, p: m.p });
        for (const c of topics.get(ws.topic)) if ((c !== ws || m.s) && c.readyState === 1) c.send(out);
      }
    });
    ws.on('close', () => { const set = topics.get(ws.topic); set.delete(ws); if (!set.size) topics.delete(ws.topic); else pushState(ws.topic); });
  });
  return { wss, stats, close: () => new Promise(r => wss.close(r)) };
}

if (process.argv[1] && process.argv[1].endsWith('relay.mjs')) {
  const port = +(process.argv[2] || 8790);
  startRelay(port);
  console.log('relay on ws://localhost:' + port + '/ws');
}
