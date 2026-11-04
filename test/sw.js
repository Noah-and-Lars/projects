// Test builds: serves any commit of this repo from the site itself, so a work
// branch can be played before it goes live.
//
// test/play/<commit>/<path> is fetched from GitHub's raw file server and sent
// back with the right file type (GitHub sends everything as plain text, which
// the browser won't run). Commits never change, so a build always loads exactly
// what was pushed, with no stale cache.
//
// Only addresses under test/ are handled; the rest of the site is untouched.

const REPO = 'Noah-and-Lars/projects';

const TYPES = {
  html: 'text/html; charset=utf-8',
  js: 'text/javascript; charset=utf-8',
  mjs: 'text/javascript; charset=utf-8',
  css: 'text/css; charset=utf-8',
  json: 'application/json',
  webmanifest: 'application/manifest+json',
  txt: 'text/plain; charset=utf-8',
  svg: 'image/svg+xml',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  ico: 'image/x-icon',
  glb: 'model/gltf-binary',
  gltf: 'model/gltf+json',
  bin: 'application/octet-stream',
  wasm: 'application/wasm',
  mp3: 'audio/mpeg',
  ogg: 'audio/ogg',
  wav: 'audio/wav',
  m4a: 'audio/mp4',
  mp4: 'video/mp4',
  webm: 'video/webm',
  woff: 'font/woff',
  woff2: 'font/woff2',
  ttf: 'font/ttf',
};

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  const base = new URL('play/', self.registration.scope);
  if (url.origin !== base.origin || !url.pathname.startsWith(base.pathname)) return;
  // A folder without its closing slash would break the game's relative links.
  const last = url.pathname.slice(url.pathname.lastIndexOf('/') + 1);
  if (last !== '' && !last.includes('.')) {
    event.respondWith(Response.redirect(url.origin + url.pathname + '/' + url.search, 301));
    return;
  }
  event.respondWith(serve(url.pathname.slice(base.pathname.length)));
});

async function serve(rest) {
  // rest is "<commit>/<path inside the repo>"
  const slash = rest.indexOf('/');
  const commit = slash < 0 ? rest : rest.slice(0, slash);
  let path = slash < 0 ? '' : rest.slice(slash + 1);
  if (!/^[0-9a-f]{40}$/.test(commit)) return notFound();
  if (path === '' || path.endsWith('/')) path += 'index.html';

  let res;
  try {
    res = await fetch(`https://raw.githubusercontent.com/${REPO}/${commit}/${path}`);
  } catch {
    return new Response('Couldn’t reach GitHub. Check your connection and reload.', {
      status: 502,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  }
  if (!res.ok) return notFound();

  const ext = path.slice(path.lastIndexOf('.') + 1).toLowerCase();
  return new Response(res.body, {
    headers: { 'Content-Type': TYPES[ext] || 'application/octet-stream' },
  });
}

function notFound() {
  return new Response('Not found in this build.', {
    status: 404,
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
}
