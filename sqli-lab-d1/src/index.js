// SQL Injection lab — REAL SQLite via Cloudflare D1. INTENTIONALLY VULNERABLE.
// Fake data only. This version is a valid sqlmap target because queries run
// against an actual database (env.DB), built by raw string concatenation.
//
// Endpoints:
//   GET  /product?id=1         <- classic numeric injection (best sqlmap target)
//   GET  /api/search?q=Blue    <- string injection inside LIKE
//   POST /api/login {username,password}
//
// Example once deployed:
//   sqlmap -u "https://<worker>.workers.dev/product?id=1" --batch --dbms=sqlite --dump

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj, null, 2), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'access-control-allow-origin': '*' },
  });
}

async function readBody(request) {
  const ct = request.headers.get('content-type') || '';
  if (ct.includes('application/json')) return request.json().catch(() => ({}));
  if (ct.includes('form')) return Object.fromEntries((await request.formData()).entries());
  return {};
}

// Runs a raw SQL string against D1 and returns rows (or the raw error — leaking
// DB errors is intentional here; it powers sqlmap's error-based detection).
async function runSql(env, sql) {
  try {
    const { results } = await env.DB.prepare(sql).all();
    return { rows: results || [], error: null };
  } catch (e) {
    return { rows: [], error: String(e.message || e) };
  }
}

const PAGE = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow"><title>SQLi Lab (D1 / real SQLite)</title>
<style>body{font:15px system-ui,sans-serif;max-width:760px;margin:40px auto;padding:0 16px;background:#0f1117;color:#e7e9ee}
.b{background:#3a1113;border:1px solid #ff6b6b;color:#ffd9d9;padding:12px;border-radius:8px;font-weight:700}
code{background:#1e2230;padding:2px 6px;border-radius:5px}a{color:#6ea8fe}pre{background:#0b0d13;border:1px solid #2a3040;padding:12px;border-radius:8px;overflow:auto}</style>
</head><body>
<p class="b">&#9888; INTENTIONALLY VULNERABLE &mdash; real SQLite (D1) behind these endpoints. Fake data only.</p>
<h1>SQL Injection Lab (D1)</h1>
<p>This version runs a <b>real SQLite database</b>, so automated tools like sqlmap work against it.</p>
<h3>Endpoints</h3>
<ul>
<li><a href="/product?id=1">/product?id=1</a> &mdash; numeric injection (best sqlmap target)</li>
<li><a href="/api/search?q=Blue">/api/search?q=Blue</a> &mdash; string injection in LIKE</li>
<li><code>POST /api/login</code> &mdash; body <code>{"username":"...","password":"..."}</code></li>
</ul>
<h3>Try with sqlmap</h3>
<pre>sqlmap -u "LOCATION/product?id=1" --batch --dbms=sqlite --dump</pre>
<h3>Manual payloads</h3>
<ul>
<li><a href="/product?id=0 OR 1=1">/product?id=0 OR 1=1</a> &mdash; returns all products</li>
<li><a href="/product?id=0 UNION SELECT username, password, card FROM users">/product?id=0 UNION SELECT username,password,card FROM users</a> &mdash; dumps credentials</li>
</ul>
</body></html>`;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    if (!env || !env.DB) {
      return json({ error: 'D1 binding "DB" is not configured. Create the DB, add the binding to wrangler.toml, seed schema.sql, then deploy.' }, 500);
    }

    // ---- classic numeric injection -------------------------------------
    if (path === '/product') {
      const id = url.searchParams.get('id') ?? '1';
      // THE VULNERABILITY: id concatenated raw, unquoted (numeric context).
      const query = `SELECT id, name, price FROM products WHERE id = ${id}`;
      const { rows, error } = await runSql(env, query);
      return json({ query, results: rows, rowsReturned: rows.length, error });
    }

    // ---- string injection inside LIKE ----------------------------------
    if (path === '/api/search') {
      const q = url.searchParams.get('q') ?? '';
      const query = `SELECT id, name, price FROM products WHERE name LIKE '%${q}%'`;
      const { rows, error } = await runSql(env, query);
      return json({ query, results: rows, rowsReturned: rows.length, error });
    }

    // ---- login auth bypass ---------------------------------------------
    if (path === '/api/login') {
      let username = '', password = '';
      if (request.method === 'POST') {
        const b = await readBody(request);
        username = b.username ?? ''; password = b.password ?? '';
      } else {
        username = url.searchParams.get('username') ?? '';
        password = url.searchParams.get('password') ?? '';
      }
      const query = `SELECT id, username, role FROM users WHERE username = '${username}' AND password = '${password}'`;
      const { rows, error } = await runSql(env, query);
      const authenticated = rows.length > 0;
      return json({ query, authenticated, error, loggedInAs: authenticated ? rows[0] : null, rowsReturned: rows.length });
    }

    if (path === '/' || path === '/index.html') {
      return new Response(PAGE.replace('LOCATION', url.origin), { headers: { 'content-type': 'text/html; charset=utf-8' } });
    }
    return new Response('Not found', { status: 404 });
  },
};

// ---- FIX (for reference) ------------------------------------------------
// Parameterize every query so input is data, not code:
//   env.DB.prepare('SELECT id, name, price FROM products WHERE id = ?').bind(id).all();
//   env.DB.prepare("... WHERE name LIKE ?").bind('%' + q + '%').all();
//   env.DB.prepare('... WHERE username = ? AND password = ?').bind(username, password).all();
