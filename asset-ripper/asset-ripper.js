(async () => {
  "use strict";

  // Remove any earlier copy of the panel.
  document.getElementById("__gr_overlay")?.remove();

  // ─────────────────────────────── helpers ───────────────────────────────
  const SCRIPT_OPEN = "<" + "script";
  const SCRIPT_CLOSE = "</" + "script>";
  // Keeps "</script" inside inlined code from closing the tag early.
  const escScript = (code) => String(code).replace(/<\/(script)/gi, "<\\/$1");

  const H = {
    skip: /google-analytics|googletagmanager|doubleclick|facebook|adservice|sentry|hotjar|cloudflareinsights|googlesyndication/i,
    sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
    fmtBytes: (b) =>
      b < 1024 ? b + " B" : b < 1048576 ? (b / 1024).toFixed(1) + " KB" : (b / 1048576).toFixed(2) + " MB",

    getContexts: () => {
      const list = [{ label: "Main Window (" + location.hostname + ")", win: window }];
      document.querySelectorAll("iframe").forEach((f, idx) => {
        try {
          const w = f.contentWindow;
          // Throws for cross-origin frames, which we can't read anyway.
          if (w && w.performance && w.document && w.location.origin) {
            let host = "embedded";
            try { if (f.src) host = new URL(f.src, location.href).hostname || host; } catch {}
            list.push({ label: "Iframe #" + (idx + 1) + " (" + host + ")", win: w });
          }
        } catch {}
      });
      return list;
    },

    classify: (ext) =>
      /^(glb|gltf|fbx|obj|bin)$/.test(ext) ? "3D Model"
      : /^(png|jpg|jpeg|webp|gif|svg|ktx2|avif)$/.test(ext) ? "Texture"
      : /^(mp3|ogg|wav|m4a|aac|flac)$/.test(ext) ? "Audio"
      : /^(mp4|webm)$/.test(ext) ? "Video"
      : /^(woff2?|ttf|otf)$/.test(ext) ? "Font"
      : /^(data|unityweb|wasm|pck|br|gz)$/.test(ext) ? "Engine Bundle"
      : "Code / Data",

    // Turns a URL into a safe relative path inside the zip.
    toPath: (u, origin) => {
      let p = u.pathname.split("/").map((seg) => {
        try { seg = decodeURIComponent(seg); } catch {}
        return seg.replace(/[<>:"|?*\\\x00-\x1f]/g, "_");
      }).join("/").replace(/^\/+/, "");
      if (!p || p.endsWith("/")) p += "index.html";
      return (u.origin === origin ? "" : "_external/" + u.hostname + "/") + p;
    },

    scanContext: async (targetWin, stealth, log) => {
      const origin = targetWin.location.origin;
      const isHttp = (u) => /^https?:/i.test(u);

      // 1) Everything the page actually loaded…
      const found = targetWin.performance.getEntriesByType("resource").map((r) => r.name);
      // …plus anything referenced in the DOM (the timing buffer drops entries after ~250).
      targetWin.document
        .querySelectorAll("script[src],link[href],img[src],source[src],audio[src],video[src],embed[src],object[data]")
        .forEach((el) => {
          if (el.tagName === "LINK" && !/stylesheet|preload|modulepreload|icon|manifest/i.test(el.rel)) return;
          const v = el.src || el.href || el.data;
          if (v) found.push(v);
        });

      const valid = new Set();
      for (const raw of found) {
        try {
          const u = new URL(raw, targetWin.location.href);
          u.hash = "";
          if (isHttp(u.href) && !H.skip.test(u.href)) valid.add(u.href);
        } catch {}
      }

      const bases = new Set([targetWin.document.baseURI, origin + "/"]);
      for (const u of valid) {
        try {
          if (new URL(u).origin !== origin) continue;
          const dir = u.split("?")[0];
          const d = dir.substring(0, dir.lastIndexOf("/") + 1);
          bases.add(d);
          bases.add(d.replace(/\/(assets|models|js|chunks|static|build|data|media)\/$/i, "/"));
        } catch {}
      }

      // 2) Deep scan: read JS/JSON/CSS for file names that haven't loaded yet.
      if (!stealth) {
        log("Deep-scanning JS/JSON/CSS for unloaded assets...");
        const rx = /["'(]([a-zA-Z0-9_\-.\/]+\.(?:glb|gltf|fbx|obj|bin|png|jpg|jpeg|webp|gif|svg|ktx2|avif|mp3|ogg|wav|m4a|mp4|webm|woff2?|ttf|otf|wasm|js|mjs|css|json|atlas|skel|data|pck|unityweb|br|gz))["')]/gi;
        const cands = new Set();
        const textUrls = [...valid].filter((u) => /\.(js|mjs|json|css)(\?|$)/i.test(u) && new URL(u).origin === origin);
        for (const url of textUrls) {
          try {
            const resp = await targetWin.fetch(url);
            if (!resp.ok) continue;
            const txt = await resp.text();
            if (txt.length > 30e6) continue;
            const fileDir = url.split("?")[0].replace(/[^/]*$/, "");
            let m;
            rx.lastIndex = 0;
            while ((m = rx.exec(txt)) !== null) {
              const raw = m[1];
              if (!raw || raw.length > 200 || raw.startsWith("//")) continue;
              if (raw.startsWith("/")) { cands.add(origin + raw); continue; }
              const rel = raw.replace(/^\.\//, "");
              for (const b of [fileDir, ...bases]) {
                try {
                  const c = new URL(rel, b);
                  if (c.origin === origin) cands.add(c.href);
                } catch {}
              }
            }
          } catch {}
        }

        let list = [...cands].filter((u) => !valid.has(u));
        if (list.length > 4000) {
          log("Too many candidates (" + list.length + "), checking the first 4000.", "#fbbf24");
          list = list.slice(0, 4000);
        }
        log("Verifying " + list.length + " candidate URLs...");

        // Rejects SPA fallbacks that answer 200 + index.html for any path.
        const looksReal = (r, u) => {
          if (!r.ok) return false;
          const ct = r.headers.get("content-type") || "";
          return !(/text\/html/i.test(ct) && !/\.html?(\?|$)/i.test(u));
        };
        let hits = 0;
        for (let i = 0; i < list.length; i += 20) {
          await Promise.all(list.slice(i, i + 20).map(async (u) => {
            try {
              let r = await targetWin.fetch(u, { method: "HEAD" });
              if (r.status === 405 || r.status === 501) {
                r = await targetWin.fetch(u, { headers: { Range: "bytes=0-0" } });
              }
              if (looksReal(r, u)) { valid.add(u); hits++; }
            } catch {}
          }));
        }
        log("Deep scan found " + hits + " extra files.");
      }

      const seen = new Set();
      return [...valid].map((url) => {
        const u = new URL(url);
        const ext = ((u.pathname.split("/").pop() || "").split(".").pop() || "bin").toLowerCase().slice(0, 8);
        let path = H.toPath(u, origin);
        // Same path with different query strings → keep both.
        if (seen.has(path)) {
          let n = 2;
          const dot = path.lastIndexOf(".");
          const mk = (k) => (dot > path.lastIndexOf("/") ? path.slice(0, dot) + "_" + k + path.slice(dot) : path + "_" + k);
          while (seen.has(mk(n))) n++;
          path = mk(n);
        }
        seen.add(path);
        return { url, path, ext, type: H.classify(ext), checked: true };
      }).sort((a, b) => a.path.localeCompare(b.path));
    },

    // ───────────── minimal zip writer (no libraries needed) ─────────────
    crcTable: (() => {
      const t = new Uint32Array(256);
      for (let n = 0; n < 256; n++) {
        let c = n;
        for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
        t[n] = c >>> 0;
      }
      return t;
    })(),
    crc32: (buf) => {
      let c = 0xffffffff;
      for (let i = 0; i < buf.length; i++) c = H.crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
      return (c ^ 0xffffffff) >>> 0;
    },
    deflate: async (u8) => {
      if (typeof CompressionStream === "undefined") return null;
      try {
        const stream = new Blob([u8]).stream().pipeThrough(new CompressionStream("deflate-raw"));
        return new Uint8Array(await new Response(stream).arrayBuffer());
      } catch { return null; }
    },
    buildZip: async (files) => {
      const enc = new TextEncoder();
      const parts = [], central = [];
      let offset = 0;
      const now = new Date();
      const dosTime = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1);
      const dosDate = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();

      for (const { path, data } of files) {
        const name = enc.encode(path);
        const crc = H.crc32(data);
        let body = data, method = 0;
        // Compress text-like files; images/audio/bundles are usually compressed already.
        if (/\.(html?|js|mjs|css|json|txt|svg|xml|gltf|obj|atlas|skel|wasm|data)$/i.test(path) && data.length > 256) {
          const z = await H.deflate(data);
          if (z && z.length < data.length) { body = z; method = 8; }
        }
        if (offset + body.length > 0xfffffff0) throw new Error("Zip would exceed 4 GB; deselect some files.");

        const lh = new DataView(new ArrayBuffer(30));
        lh.setUint32(0, 0x04034b50, true);
        lh.setUint16(4, 20, true);
        lh.setUint16(6, 0x0800, true); // UTF-8 names
        lh.setUint16(8, method, true);
        lh.setUint16(10, dosTime, true);
        lh.setUint16(12, dosDate, true);
        lh.setUint32(14, crc, true);
        lh.setUint32(18, body.length, true);
        lh.setUint32(22, data.length, true);
        lh.setUint16(26, name.length, true);
        lh.setUint16(28, 0, true);

        const ch = new DataView(new ArrayBuffer(46));
        ch.setUint32(0, 0x02014b50, true);
        ch.setUint16(4, 20, true);
        ch.setUint16(6, 20, true);
        ch.setUint16(8, 0x0800, true);
        ch.setUint16(10, method, true);
        ch.setUint16(12, dosTime, true);
        ch.setUint16(14, dosDate, true);
        ch.setUint32(16, crc, true);
        ch.setUint32(20, body.length, true);
        ch.setUint32(24, data.length, true);
        ch.setUint16(28, name.length, true);
        ch.setUint32(42, offset, true);

        parts.push(lh, name, body);
        central.push(ch, name);
        offset += 30 + name.length + body.length;
      }

      const cdSize = central.reduce((s, p) => s + p.byteLength, 0);
      const end = new DataView(new ArrayBuffer(22));
      end.setUint32(0, 0x06054b50, true);
      end.setUint16(8, files.length, true);
      end.setUint16(10, files.length, true);
      end.setUint32(12, cdSize, true);
      end.setUint32(16, offset, true);
      return new Blob([...parts, ...central, end], { type: "application/zip" });
    },

    // ─────────────────────────────── export ───────────────────────────────
    exportData: async (mode, targetWin, items, stealth, onProgress, log) => {
      const siteName = targetWin.location.hostname.replace(/^www\./, "").replace(/[^a-z0-9]/gi, "_") || "game";

      const fetchBytes = async (url) => {
        const resp = await targetWin.fetch(url);
        if (!resp.ok) throw new Error("HTTP " + resp.status);
        return new Uint8Array(await resp.arrayBuffer());
      };

      // Undo gzip/Unity-brotli compression the browser didn't already undo,
      // because blob: URLs can't carry a Content-Encoding header.
      const maybeDecompress = async (bytes, label) => {
        let fmt = null;
        if (bytes[0] === 0x1f && bytes[1] === 0x8b) fmt = "gzip";
        else if (new TextDecoder().decode(bytes.subarray(0, 96)).includes("UnityWeb Compressed Content (brotli)")) fmt = "brotli";
        if (!fmt) return bytes;
        try {
          const s = new Blob([bytes]).stream().pipeThrough(new DecompressionStream(fmt));
          const out = new Uint8Array(await new Response(s).arrayBuffer());
          log("Decompressed " + label + " (" + fmt + ").");
          return out;
        } catch {
          log("Could not decompress " + label + " (" + fmt + ") in this browser; the standalone file may not run.", "#fbbf24");
          return bytes;
        }
      };

      const toB64 = (bytes) => new Promise((res, rej) => {
        const fr = new FileReader();
        fr.onload = () => res(fr.result.slice(fr.result.indexOf(",") + 1));
        fr.onerror = () => rej(fr.error);
        fr.readAsDataURL(new Blob([bytes]));
      });

      const triggerDownload = (content, filename, type) => {
        const blob = content instanceof Blob ? content : new Blob([].concat(content), { type });
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = filename;
        a.style.display = "none";
        document.body.appendChild(a);
        a.click();
        setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 60000);
        log("Saved " + filename + " (" + H.fmtBytes(blob.size) + ")", "#4ade80");
      };

      // Base64 payloads live in inert <script type="application/octet-stream"> blocks,
      // which parse far faster than giant JS string literals.
      const dataBlock = (id, b64) => SCRIPT_OPEN + ' type="application/octet-stream" id="' + id + '">' + b64 + SCRIPT_CLOSE;
      const runtime =
        "async function __blobUrl(id,type){const b=document.getElementById(id).textContent.trim();" +
        "try{return URL.createObjectURL(await (await fetch('data:'+type+';base64,'+b)).blob())}catch(e){" +
        "const s=atob(b),a=new Uint8Array(s.length);for(let i=0;i<s.length;i++)a[i]=s.charCodeAt(i);" +
        "return URL.createObjectURL(new Blob([a],{type}))}}";

      // ── Standalone HTML ──
      if (mode === "html") {
        const urls = items.map((x) => x.url);
        const bare = (u) => u.split("?")[0];
        const legacyLoader = urls.find((u) => /UnityLoader\.js$/i.test(bare(u)));
        const legacyJson = urls.find((u) => /\/Build\/[^/]+\.json$/i.test(bare(u)));
        const modernLoader = urls.find((u) => /\.loader\.js$/i.test(bare(u)));
        const pageCss = "html,body{width:100%;height:100%;margin:0;overflow:hidden;background:#000}";

        // Legacy Unity (5.6 – 2019)
        if (legacyLoader && legacyJson) {
          log("Packing legacy Unity WebGL into standalone HTML...");
          const baseDir = bare(legacyJson).replace(/[^/]*$/, "");
          const loaderCode = await (await targetWin.fetch(legacyLoader)).text();
          const config = await (await targetWin.fetch(legacyJson)).json();
          const keys = ["dataUrl", "wasmCodeUrl", "wasmFrameworkUrl", "asmCodeUrl", "asmMemoryUrl", "asmFrameworkUrl"].filter((k) => config[k]);
          const blocks = [], map = {};
          let total = 0;
          for (let i = 0; i < keys.length; i++) {
            const k = keys[i];
            onProgress(i + 1, keys.length, total);
            log("Encoding " + config[k] + "...");
            const bytes = await maybeDecompress(await fetchBytes(new URL(config[k], baseDir).href), config[k]);
            total += bytes.length;
            blocks.push(dataBlock("f" + i, await toB64(bytes)));
            map[k] = "f" + i;
          }
          const boot =
            runtime +
            "(async()=>{const CONFIG=" + JSON.stringify(config) + ",MAP=" + JSON.stringify(map) + ",BASE=" + JSON.stringify(baseDir) + ";" +
            "for(const k in MAP)CONFIG[k]=await __blobUrl(MAP[k],'application/octet-stream');" +
            "const json=URL.createObjectURL(new Blob([JSON.stringify(CONFIG)],{type:'application/json'}));" +
            "UnityLoader.instantiate('unityContainer',json,{Module:{resolveBuildUrl:u=>/^(blob:|data:|https?:)/.test(u)?u:BASE+u}});})();";
          const html = [
            '<!DOCTYPE html><html><head><meta charset="utf-8"><title>' + siteName + "</title><style>" + pageCss +
              "#unityContainer{width:100%;height:100%}</style></head><body><div id=\"unityContainer\"></div>",
            ...blocks,
            SCRIPT_OPEN + ">" + escScript(loaderCode) + SCRIPT_CLOSE,
            SCRIPT_OPEN + ">" + escScript(boot) + SCRIPT_CLOSE,
            "</body></html>",
          ];
          triggerDownload(html, siteName + "-standalone.html", "text/html");
          return;
        }

        // Modern Unity (2020+)
        if (modernLoader) {
          const findF = (rx) => urls.find((u) => rx.test(bare(u)));
          const fw = findF(/\.framework\.js(\.unityweb|\.br|\.gz)?$/i);
          const dt = findF(/\.data(\.unityweb|\.br|\.gz)?$/i);
          const ws = findF(/\.wasm(\.unityweb|\.br|\.gz)?$/i);
          if (fw && dt && ws) {
            log("Packing modern Unity WebGL into standalone HTML...");
            const loaderCode = await (await targetWin.fetch(modernLoader)).text();
            const parts = [[fw, "application/javascript"], [dt, "application/octet-stream"], [ws, "application/wasm"]];
            const blocks = [];
            let total = 0;
            for (let i = 0; i < parts.length; i++) {
              onProgress(i + 1, parts.length, total);
              const name = bare(parts[i][0]).split("/").pop();
              log("Encoding " + name + "...");
              const bytes = await maybeDecompress(await fetchBytes(parts[i][0]), name);
              total += bytes.length;
              blocks.push(dataBlock("f" + i, await toB64(bytes)));
            }
            const streaming = new URL("StreamingAssets", targetWin.location.href).href;
            const boot =
              runtime +
              "(async()=>{const c=document.querySelector('#unity-canvas');" +
              "c.width=innerWidth;c.height=innerHeight;addEventListener('resize',()=>{c.style.width=innerWidth+'px';c.style.height=innerHeight+'px'});" +
              "await createUnityInstance(c,{frameworkUrl:await __blobUrl('f0','application/javascript')," +
              "dataUrl:await __blobUrl('f1','application/octet-stream')," +
              "codeUrl:await __blobUrl('f2','application/wasm')," +
              "streamingAssetsUrl:" + JSON.stringify(streaming) + "," +
              "companyName:'Offline',productName:" + JSON.stringify(siteName) + ",productVersion:'1.0'});})().catch(e=>{document.body.style.color='#fff';document.body.textContent='Failed to start: '+e});";
            const html = [
              '<!DOCTYPE html><html><head><meta charset="utf-8"><title>' + siteName + "</title><style>" + pageCss +
                "#unity-canvas{width:100%;height:100%;display:block}</style></head><body><canvas id=\"unity-canvas\" tabindex=\"-1\"></canvas>",
              ...blocks,
              SCRIPT_OPEN + ">" + escScript(loaderCode) + SCRIPT_CLOSE,
              SCRIPT_OPEN + ">" + escScript(boot) + SCRIPT_CLOSE,
              "</body></html>",
            ];
            triggerDownload(html, siteName + "-standalone.html", "text/html");
            return;
          }
          log("Found a Unity loader but not all of framework/data/wasm; falling back to generic inlining.", "#fbbf24");
        }

        // Generic page: inline CSS + JS, keep other assets pointing at the original site.
        log("Inlining HTML, CSS & JS into standalone file...");
        const srcDoc = targetWin.document;
        const doc = srcDoc.documentElement.cloneNode(true);
        doc.querySelector("#__gr_overlay")?.remove();

        // A <base> makes images, fonts, module imports etc. still resolve to the real site.
        let head = doc.querySelector("head");
        if (!head) { head = srcDoc.createElement("head"); doc.prepend(head); }
        doc.querySelectorAll("base").forEach((b) => b.remove());
        const base = srcDoc.createElement("base");
        base.href = srcDoc.baseURI;
        head.prepend(base);

        const links = [...doc.querySelectorAll('link[rel~="stylesheet"][href]')];
        const scripts = [...doc.querySelectorAll("script[src]")];
        const total = links.length + scripts.length;
        let done = 0;

        for (const link of links) {
          onProgress(++done, total, 0);
          try {
            const href = new URL(link.getAttribute("href"), srcDoc.baseURI).href;
            let css = await (await targetWin.fetch(href)).text();
            // Make url(...) / @import paths absolute, since the CSS no longer lives at its old URL.
            css = css.replace(/url\(\s*(['"]?)(?!data:|blob:|#)([^'")]+)\1\s*\)/gi, (m, q, p) => {
              try { return "url(" + q + new URL(p, href).href + q + ")"; } catch { return m; }
            }).replace(/@import\s+(['"])(?!https?:|data:)([^'"]+)\1/gi, (m, q, p) => {
              try { return "@import " + q + new URL(p, href).href + q; } catch { return m; }
            });
            const s = srcDoc.createElement("style");
            if (link.media) s.media = link.media;
            s.textContent = css;
            link.replaceWith(s);
          } catch (e) { log("Kept external CSS " + link.getAttribute("href") + " (" + e.message + ")", "#fbbf24"); }
        }
        for (const sc of scripts) {
          onProgress(++done, total, 0);
          try {
            const src = new URL(sc.getAttribute("src"), srcDoc.baseURI).href;
            const code = await (await targetWin.fetch(src)).text();
            const s = srcDoc.createElement("script");
            for (const attr of sc.attributes) {
              if (!/^(src|integrity|crossorigin|async|defer)$/i.test(attr.name)) s.setAttribute(attr.name, attr.value);
            }
            s.textContent = escScript(code);
            sc.replaceWith(s);
          } catch (e) { log("Kept external script " + sc.getAttribute("src") + " (" + e.message + ")", "#fbbf24"); }
        }
        triggerDownload(["<!DOCTYPE html>\n", doc.outerHTML], siteName + "-standalone.html", "text/html");
        return;
      }

      // ── Zip ("rip") ──
      const selected = items.filter((x) => x.checked);
      if (!selected.length) { log("Nothing selected.", "#f87171"); return; }

      const cleanDoc = targetWin.document.documentElement.cloneNode(true);
      cleanDoc.querySelector("#__gr_overlay")?.remove();
      const files = [{ path: "index.html", data: new TextEncoder().encode("<!DOCTYPE html>\n" + cleanDoc.outerHTML) }];
      const used = new Set(["index.html"]);

      let totalBytes = 0, failed = 0;
      for (let i = 0; i < selected.length; i++) {
        if (stealth && i > 0) await H.sleep(200);
        const it = selected[i];
        onProgress(i + 1, selected.length, totalBytes);
        try {
          const data = await fetchBytes(it.url);
          let path = it.path;
          if (used.has(path)) path = path.replace(/(\.[^./]+)?$/, "_" + i + "$1");
          used.add(path);
          files.push({ path, data });
          totalBytes += data.length;
        } catch (e) {
          failed++;
          log("Failed: " + it.path + " (" + (e.message || "blocked/CORS") + ")", "#f87171");
        }
      }

      log("Building zip (" + files.length + " files, " + H.fmtBytes(totalBytes) + ")...");
      try {
        const zip = await H.buildZip(files);
        triggerDownload(zip, siteName + "-assets.zip", "application/zip");
        if (failed) log(failed + " file(s) could not be downloaded (usually cross-origin/CORS).", "#fbbf24");
      } catch (e) {
        log("Zip failed: " + e.message, "#f87171");
      }
    },
  };

  // ─────────────────────────────── UI ───────────────────────────────
  // DOM is built without innerHTML so it also works on Trusted-Types pages,
  // and lives in a shadow root so page CSS can't break it.
  const el = (tag, props = {}, kids = []) => {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(props)) {
      if (k === "style") n.style.cssText = v;
      else if (k in n) n[k] = v;
      else n.setAttribute(k, v);
    }
    for (const c of [].concat(kids)) if (c != null) n.append(c);
    return n;
  };

  const host = el("div", { id: "__gr_overlay" });
  host.style.cssText = "position:fixed;top:16px;right:16px;z-index:2147483647;";
  const root = host.attachShadow({ mode: "open" });
  root.append(el("style", {
    textContent: `
      *{box-sizing:border-box;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif}
      .panel{width:min(560px,calc(100vw - 32px));max-height:calc(100vh - 32px);display:flex;flex-direction:column;
        background:#0d1017;color:#e2e8f0;border:1px solid #23283d;border-radius:12px;box-shadow:0 20px 50px rgba(0,0,0,.6);overflow:hidden;font-size:13px}
      .hdr{display:flex;align-items:center;gap:8px;padding:10px 14px;background:#151926;border-bottom:1px solid #23283d;cursor:move;user-select:none}
      .hdr b{flex:1;font-size:14px}
      .body{padding:12px 14px;display:flex;flex-direction:column;gap:10px;min-height:0;flex:1}
      .row{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
      select,input[type=text]{background:#151926;color:#e2e8f0;border:1px solid #23283d;border-radius:6px;padding:6px 8px;font-size:12px}
      select{flex:1;min-width:0}
      input[type=text]{flex:1;min-width:120px}
      button{background:#232942;color:#e2e8f0;border:1px solid #2f3655;border-radius:6px;padding:6px 10px;font-size:12px;cursor:pointer}
      button:hover:not(:disabled){background:#2c3354}
      button:disabled{opacity:.5;cursor:not-allowed}
      button.primary{background:#2563eb;border-color:#2563eb}
      button.primary:hover:not(:disabled){background:#1d4ed8}
      .x{background:none;border:none;font-size:18px;line-height:1;padding:0 4px;color:#94a3b8}
      .count{font-size:12px;color:#94a3b8}
      .list{display:flex;flex-direction:column;gap:4px;overflow:auto;min-height:80px;max-height:34vh;padding-right:2px}
      .item{display:flex;align-items:center;gap:10px;padding:6px 10px;background:#151926;border:1px solid #23283d;border-radius:8px;cursor:pointer;font-size:12px}
      .tag{padding:2px 7px;border-radius:4px;font-size:10px;font-weight:700;background:#232942;color:#93c5fd;min-width:84px;text-align:center;flex-shrink:0}
      .path{font-family:ui-monospace,Menlo,Consolas,monospace;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .bar{height:6px;background:#151926;border-radius:3px;overflow:hidden}
      .fill{height:100%;width:0;background:linear-gradient(90deg,#2563eb,#4ade80);transition:width .15s}
      .status{font-size:11px;color:#94a3b8;min-height:14px}
      .log{background:#07090e;border:1px solid #23283d;border-radius:6px;padding:6px 8px;height:110px;overflow:auto;
        font-family:ui-monospace,Menlo,Consolas,monospace;font-size:11px;line-height:1.5;color:#cbd5e1}
      label.chk{display:flex;align-items:center;gap:6px;font-size:12px;cursor:pointer}
    `,
  }));

  const closeBtn = el("button", { className: "x", title: "Close", textContent: "×" });
  const hdr = el("div", { className: "hdr" }, [el("b", { textContent: "Asset Ripper" }), closeBtn]);
  const frameSel = el("select");
  const stealthChk = el("input", { type: "checkbox" });
  const rescanBtn = el("button", { textContent: "Rescan" });
  const filterInp = el("input", { type: "text", placeholder: "Filter by path or type..." });
  const allBtn = el("button", { textContent: "All" });
  const noneBtn = el("button", { textContent: "None" });
  const countHdr = el("div", { className: "count" });
  const listEl = el("div", { className: "list" });
  const barFill = el("div", { className: "fill" });
  const statusEl = el("div", { className: "status" });
  const logEl = el("div", { className: "log" });
  const exportRipBtn = el("button", { className: "primary", textContent: "Download selected as .zip" });
  const exportHtmlBtn = el("button", { textContent: "Export standalone HTML" });

  root.append(el("div", { className: "panel" }, [
    hdr,
    el("div", { className: "body" }, [
      el("div", { className: "row" }, [frameSel, rescanBtn]),
      el("div", { className: "row" }, [
        el("label", { className: "chk", title: "Skip the deep scan and wait 200 ms between downloads" }, [stealthChk, "Stealth mode (fewer requests)"]),
      ]),
      el("div", { className: "row" }, [filterInp, allBtn, noneBtn]),
      countHdr,
      listEl,
      el("div", { className: "bar" }, barFill),
      statusEl,
      el("div", { className: "row" }, [exportRipBtn, exportHtmlBtn]),
      logEl,
    ]),
  ]));
  document.documentElement.appendChild(host);

  // Dragging by the header.
  hdr.addEventListener("pointerdown", (e) => {
    if (e.target === closeBtn) return;
    const r = host.getBoundingClientRect();
    const dx = e.clientX - r.left, dy = e.clientY - r.top;
    const move = (ev) => {
      host.style.left = Math.max(0, ev.clientX - dx) + "px";
      host.style.top = Math.max(0, ev.clientY - dy) + "px";
      host.style.right = "auto";
    };
    const up = () => { removeEventListener("pointermove", move); removeEventListener("pointerup", up); };
    addEventListener("pointermove", move);
    addEventListener("pointerup", up);
  });
  closeBtn.onclick = () => host.remove();

  const log = (msg, color) => {
    const line = el("div", { textContent: "› " + msg });
    if (color) line.style.color = color;
    logEl.appendChild(line);
    logEl.scrollTop = logEl.scrollHeight;
    console.log("[AssetRipper] " + msg);
  };

  const onProgress = (i, total, bytes) => {
    barFill.style.width = (total ? Math.round((i / total) * 100) : 0) + "%";
    statusEl.textContent = i + " / " + total + (bytes ? " · " + H.fmtBytes(bytes) : "");
  };

  // ─────────────────────────────── state ───────────────────────────────
  const contexts = H.getContexts();
  contexts.forEach((c, i) => frameSel.append(el("option", { value: String(i), textContent: c.label })));
  let activeWin = contexts[0].win;
  let scannedItems = [];
  let busy = false;

  const visibleItems = () => {
    const q = filterInp.value.trim().toLowerCase();
    return q ? scannedItems.filter((x) => x.path.toLowerCase().includes(q) || x.type.toLowerCase().includes(q)) : scannedItems;
  };
  const updateCount = () => {
    countHdr.textContent = "Selected: " + scannedItems.filter((x) => x.checked).length + " / " + scannedItems.length + " discovered assets";
  };

  function renderTable() {
    listEl.replaceChildren();
    const frag = document.createDocumentFragment();
    visibleItems().forEach((item) => {
      const cb = el("input", { type: "checkbox", checked: item.checked });
      cb.onchange = () => { item.checked = cb.checked; updateCount(); };
      frag.appendChild(el("label", { className: "item", title: item.url }, [
        cb,
        el("span", { className: "tag", textContent: item.type }),
        el("span", { className: "path", textContent: item.path }),
      ]));
    });
    listEl.appendChild(frag);
    updateCount();
  }

  const setBusy = (b) => {
    busy = b;
    [rescanBtn, exportRipBtn, exportHtmlBtn, frameSel].forEach((x) => (x.disabled = b));
  };

  const run = async (fn) => {
    if (busy) return;
    setBusy(true);
    try { await fn(); }
    catch (e) { log("Error: " + (e && e.message ? e.message : e), "#f87171"); console.error(e); }
    finally { setBusy(false); }
  };

  async function doScan() {
    barFill.style.width = "0%";
    statusEl.textContent = "";
    log("Scanning " + frameSel.selectedOptions[0].textContent + "...");
    scannedItems = await H.scanContext(activeWin, stealthChk.checked, log);
    renderTable();
    log("Scan complete! Found " + scannedItems.length + " files ready to export.", "#4ade80");
  }

  filterInp.oninput = renderTable;
  allBtn.onclick = () => { visibleItems().forEach((x) => (x.checked = true)); renderTable(); };
  noneBtn.onclick = () => { visibleItems().forEach((x) => (x.checked = false)); renderTable(); };
  frameSel.onchange = () => { activeWin = contexts[Number(frameSel.value)].win; run(doScan); };
  rescanBtn.onclick = () => run(doScan);
  exportRipBtn.onclick = () => run(() => H.exportData("rip", activeWin, scannedItems, stealthChk.checked, onProgress, log));
  exportHtmlBtn.onclick = () => run(() => H.exportData("html", activeWin, scannedItems, stealthChk.checked, onProgress, log));

  await run(doScan);
})();
