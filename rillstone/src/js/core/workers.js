// Starts Web Workers from Blob URLs, so they also run from the single-file
// build (a file:// page can't load worker scripts by URL).
//
// Build: tools/build.mjs bundles each worker into a string and defines
// __RILL_WORKERS__ = { name: source }. Dev: we fetch the worker module and
// rewrite its imports to absolute URLs: bare names through the page's import
// map (module workers can't read import maps), relative paths against the
// worker file. Shared modules imported by a worker must follow the same rule.

/* global __RILL_WORKERS__ */
const BUILT = typeof __RILL_WORKERS__ !== 'undefined' ? __RILL_WORKERS__ : null;
const cache = new Map();

function importMap() {
  const el = document.querySelector('script[type="importmap"]');
  try { return el ? JSON.parse(el.textContent).imports || {} : {}; } catch (_) { return {}; }
}

async function devSource(url, map, seen) {
  if (seen.has(url)) return seen.get(url);
  const p = (async () => {
    let src = await (await fetch(url)).text();
    const deps = [];
    src = src.replace(/(\bfrom\s*|\bimport\s*\(?\s*)(['"])([^'"]+)\2/g, (all, pre, q, spec) => {
      let abs;
      if (spec.startsWith('.') || spec.startsWith('/')) abs = new URL(spec, url).href;
      else if (map[spec]) return pre + q + map[spec] + q;
      else return all;
      deps.push(abs);
      return pre + q + '%%' + abs + '%%' + q;
    });
    // Relative imports become blob URLs of their own rewritten source.
    for (const d of deps) {
      const blob = await devSource(d, map, seen);
      src = src.split('%%' + d + '%%').join(blob);
    }
    return URL.createObjectURL(new Blob([src], { type: 'text/javascript' }));
  })();
  seen.set(url, p);
  return p;
}

export async function startWorker(name) {
  let url = cache.get(name);
  if (!url) {
    if (BUILT) url = URL.createObjectURL(new Blob([BUILT[name]], { type: 'text/javascript' }));
    else url = await devSource(new URL(`../workers/${name}.js`, import.meta.url).href, importMap(), new Map());
    cache.set(name, url);
  }
  return new Worker(url, BUILT ? {} : { type: 'module' });
}

// Promise-based request/response on top of postMessage.
export function rpc(worker) {
  let seq = 0;
  const waiting = new Map();
  const listeners = new Set();
  worker.onmessage = (e) => {
    const m = e.data;
    if (m && m.re !== undefined && waiting.has(m.re)) { const w = waiting.get(m.re); waiting.delete(m.re); m.err ? w.rej(new Error(m.err)) : w.res(m); }
    else for (const l of listeners) l(m);
  };
  worker.onerror = (e) => { console.error('worker error', e.message); };
  return {
    call(msg, transfer) { return new Promise((res, rej) => { const id = ++seq; waiting.set(id, { res, rej }); worker.postMessage({ ...msg, rq: id }, transfer || []); }); },
    post(msg, transfer) { worker.postMessage(msg, transfer || []); },
    on(fn) { listeners.add(fn); },
    worker,
  };
}
