// Deploy the Rillstone server (server/worker.mjs) to Cloudflare Workers.
// Needs an API token with "Workers Scripts: Edit" (and "Account Settings:
// Read"): either CLOUDFLARE_API_TOKEN, or a proxy that adds it. Prints the
// URL to put in src/js/net/mp.js (MP_SERVER).
import { readFileSync } from 'node:fs';
const API = 'https://api.cloudflare.com/client/v4', NAME = 'rillstone-server';
const auth = { Authorization: `Bearer ${process.env.CLOUDFLARE_API_TOKEN || 'dummy'}` };
const call = async (path, opts = {}) => { const r = await fetch(API + path, { ...opts, headers: { ...auth, ...(opts.headers || {}) } }); const d = await r.json(); if (!d.success) throw new Error(`${path}: ${JSON.stringify(d.errors)}`); return d.result; };
const acc = (await call('/accounts'))[0].id;
const form = new FormData();
form.append('metadata', new Blob([JSON.stringify({ main_module: 'worker.mjs', compatibility_date: '2025-06-01', bindings: [{ type: 'durable_object_namespace', name: 'HUB', class_name: 'Hub' }], migrations: { new_tag: 'v1', new_sqlite_classes: ['Hub'] } })], { type: 'application/json' }));
form.append('worker.mjs', new Blob([readFileSync(new URL('../server/worker.mjs', import.meta.url))], { type: 'application/javascript+module' }), 'worker.mjs');
await call(`/accounts/${acc}/workers/scripts/${NAME}`, { method: 'PUT', body: form });
await call(`/accounts/${acc}/workers/scripts/${NAME}/subdomain`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ enabled: true }) });
const sub = (await call(`/accounts/${acc}/workers/subdomain`)).subdomain;
console.log(`Deployed: https://${NAME}.${sub}.workers.dev`);
