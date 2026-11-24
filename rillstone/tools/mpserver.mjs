// The Rillstone server (server/worker.mjs) run locally for tests: the same
// Worker code, with an in-memory stand-in for its Durable Object storage.
import http from 'node:http';
import worker, { Hub } from '../server/worker.mjs';

export function startMpServer(port = 8792) {
  const data = new Map();
  const storage = {
    async get(k) { return data.has(k) ? structuredClone(data.get(k)) : undefined; },
    async put(k, v) { data.set(k, structuredClone(v)); },
    async delete(k) { return data.delete(k); },
    async list({ prefix = '' } = {}) { const m = new Map(); for (const [k, v] of [...data.entries()].sort()) if (k.startsWith(prefix)) m.set(k, structuredClone(v)); return m; },
  };
  const hub = new Hub({ storage });
  const env = { HUB: { idFromName: () => 'hub', get: () => hub } };
  const server = http.createServer(async (req, res) => {
    const chunks = []; for await (const c of req) chunks.push(c);
    const body = Buffer.concat(chunks);
    const r = await worker.fetch(new Request(`http://localhost:${port}${req.url}`, { method: req.method, headers: req.headers, body: ['GET', 'HEAD', 'OPTIONS'].includes(req.method) ? undefined : body }), env);
    res.writeHead(r.status, Object.fromEntries(r.headers)); res.end(Buffer.from(await r.arrayBuffer()));
  });
  server.listen(port);
  return { close: () => server.close(), data };
}
if (process.argv[1] && process.argv[1].endsWith('mpserver.mjs')) { const p = +process.argv[2] || 8792; startMpServer(p); console.log(`Rillstone server on http://localhost:${p}`); }
