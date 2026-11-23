// SQL Injection teaching lab — single Cloudflare Worker.
// INTENTIONALLY VULNERABLE. Fake data only. See README / page for details.
import { runQuery } from './minisql.js';
import { users, products } from './seed.js';
import { PAGE_B64 } from './page.js';

const TABLES = { users, products };

function json(obj) {
  return new Response(JSON.stringify(obj, null, 2), {
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'access-control-allow-origin': '*',
    },
  });
}

function runSafe(query) {
  try {
    return { rows: runQuery(query, TABLES), error: null };
  } catch (e) {
    // Returning the raw error is itself a classic mistake, shown on purpose.
    return { rows: [], error: String(e.message || e) };
  }
}

async function readBody(request) {
  const ct = request.headers.get('content-type') || '';
  if (ct.includes('application/json')) return request.json().catch(() => ({}));
  if (ct.includes('form')) {
    const f = await request.formData();
    return Object.fromEntries(f.entries());
  }
  return {};
}

export default {
  async fetch(request) {
    const url = new URL(request.url);
    const path = url.pathname;

    // ---- vulnerable login ------------------------------------------------
    if (path === '/api/login') {
      let username = '', password = '';
      if (request.method === 'POST') {
        const b = await readBody(request);
        username = b.username ?? '';
        password = b.password ?? '';
      } else {
        username = url.searchParams.get('username') ?? '';
        password = url.searchParams.get('password') ?? '';
      }
      // THE VULNERABILITY: input concatenated straight into SQL.
      const query =
        `SELECT id, username, role FROM users ` +
        `WHERE username = '${username}' AND password = '${password}'`;
      const { rows, error } = runSafe(query);
      const authenticated = rows.length > 0;
      return json({
        query,
        authenticated,
        error,
        loggedInAs: authenticated ? rows[0] : null,
        rowsReturned: rows.length,
      });
    }

    // ---- vulnerable product search --------------------------------------
    if (path === '/api/search') {
      const q = url.searchParams.get('q') ?? '';
      // THE VULNERABILITY: input spliced into a LIKE clause (UNION-able).
      const query = `SELECT id, name, price FROM products WHERE name LIKE '%${q}%'`;
      const { rows, error } = runSafe(query);
      return json({ query, results: rows, rowsReturned: rows.length, error });
    }

    // ---- the lab page ----------------------------------------------------
    if (path === '/' || path === '/index.html') {
      const html = new TextDecoder().decode(
        Uint8Array.from(atob(PAGE_B64), (c) => c.charCodeAt(0))
      );
      return new Response(html, {
        headers: { 'content-type': 'text/html; charset=utf-8' },
      });
    }

    return new Response('Not found', { status: 404 });
  },
};
