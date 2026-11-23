# sqli-lab — SQL Injection teaching lab (intentionally vulnerable)

A **deliberately vulnerable** Cloudflare Worker for learning how SQL injection
works and how to fix it. **Fake data only.** Do not reuse this pattern in real
software.

## What's here
- `src/index.js` — the Worker: serves the page and two vulnerable endpoints.
- `src/minisql.js` — a tiny but genuine SQL evaluator so textbook payloads really work.
- `src/seed.js` — obviously-fake users/products (passwords are fake, cards use the 4111 test prefix).
- `src/page.js` — the UI HTML, base64-embedded (generated from `public/index.html`).
- `public/index.html` — editable source of the UI; run `npm run build:page` after editing.
- `_test/run.mjs` — local proof the injections work.

## The vulnerability
Both endpoints build SQL by **string-concatenating untrusted input** — the entire
bug class. Each response echoes the exact query that ran so you can see cause and
effect. The fix (parameterized queries) is documented in `src/index.js` and on the page.

## Try it (locally or once deployed)
- Honest login: `admin` / `S3cr3t-Admin-PW!`
- Auth bypass: username `' OR '1'='1' -- ` (any password)
- Admin with no password: username `admin' -- `
- Dump all users via search: `zzz' UNION SELECT username, password, card FROM users -- `

## Run locally
```
npm install
npm test          # runs the injection proof (6 checks)
npm run dev       # wrangler dev — open the printed http://localhost URL
```

## Deploy to your Cloudflare account
From a machine where you're logged in to Cloudflare (`npx wrangler login`):
```
npm install
npm run deploy    # builds the page bundle, then wrangler deploy
```
This publishes a Worker named `sqli-lab` at `sqli-lab.<your-subdomain>.workers.dev`.

> Note: it could not be auto-deployed from the Claude cloud sandbox because the
> sandbox's Cloudflare token is read-only (no Workers/Pages write permission).

> Safety note: the `deploy`/`dev` scripts pass `--config ./wrangler.toml`
> explicitly. Wrangler otherwise walks *up* the directory tree and can pick up
> a stray `wrangler.*` in a parent/home folder — if that stray config has an
> `assets` directory, a plain `wrangler deploy` would publish that folder
> instead of this Worker. The explicit `--config` prevents it.

## When you're done
Delete it so nothing vulnerable stays online:
```
npx wrangler delete        # removes the sqli-lab Worker
```
