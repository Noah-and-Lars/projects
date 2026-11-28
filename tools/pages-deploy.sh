#!/usr/bin/env bash
# Publishes the site to Cloudflare Pages at https://thearcade.pages.dev, a copy of the GitHub Pages site
# (https://noah-and-lars.github.io/projects/). Both use the same realtime Worker, so accounts, saves, chat and
# Social are shared. Run from anywhere in the repo, logged in to the owner's Cloudflare account (npx wrangler login).
set -euo pipefail
cd "$(dirname "$0")/.."
OUT="$(mktemp -d)"
tar --exclude=.git --exclude=.github --exclude=.wrangler --exclude=.DS_Store --exclude=realtime-worker --exclude=tools --exclude=test --exclude=node_modules \
  --exclude=CLAUDE.md -cf - . | tar -xf - -C "$OUT"
# GitHub serves the site under /projects/; Cloudflare serves it at the root
perl -pi -e 's#"/projects/#"/#g' "$OUT/404.html"
# the games load the shared realtime client from the GitHub site (so downloaded copies work); on this copy, load
# our own so it keeps working even if GitHub is down
find "$OUT" -name '*.html' -exec perl -pi -e 's#https://noah-and-lars\.github\.io/projects/rt\.js#/rt.js#g' {} +
# Cloudflare Pages caps files at 25 MiB; replace any that are over the limit with a redirect to the GitHub Pages version
find "$OUT" -name '*.html' | while read f; do
  size=$(wc -c < "$f")
  if [ "$size" -gt 26214400 ]; then
    rel="${f#$OUT/}"
    echo "  swapping large file for redirect: $rel ($(( size / 1024 / 1024 )) MiB)"
    printf '<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="refresh" content="0;url=https://playthearcade.github.io/%s"><title>Loading...</title></head><body></body></html>\n' "$rel" > "$f"
  fi
done
npx wrangler pages deploy "$OUT" --project-name thearcade --branch main --commit-dirty=true
rm -rf "$OUT"
