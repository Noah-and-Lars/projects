#!/usr/bin/env bash
# Publishes the site to Cloudflare Pages at https://thearcade.pages.dev, a copy of the GitHub Pages site
# (https://noah-and-lars.github.io/projects/). Both use the same realtime Worker, so accounts, saves, chat and
# Social are shared. Run from anywhere in the repo, logged in to the owner's Cloudflare account (npx wrangler login).
set -euo pipefail
cd "$(dirname "$0")/.."
OUT="$(mktemp -d)"
tar --exclude=.git --exclude=.github --exclude=realtime-worker --exclude=tools --exclude=test --exclude=node_modules \
  --exclude=CLAUDE.md -cf - . | tar -xf - -C "$OUT"
# GitHub serves the site under /projects/; Cloudflare serves it at the root
perl -pi -e 's#"/projects/#"/#g' "$OUT/404.html"
# the games load the shared realtime client from the GitHub site (so downloaded copies work); on this copy, load
# our own so it keeps working even if GitHub is down
find "$OUT" -name '*.html' -exec perl -pi -e 's#https://noah-and-lars\.github\.io/projects/rt\.js#/rt.js#g' {} +
npx wrangler pages deploy "$OUT" --project-name thearcade --branch main --commit-dirty=true
rm -rf "$OUT"
