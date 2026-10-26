// Syntax-checks every inline <script> in a page.   node jscheck.mjs ../index.html
import fs from 'fs'; import vm from 'vm';
const html = fs.readFileSync(process.argv[2], 'utf8'); let n = 0, bad = 0;
for (const m of html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)) {
  n++; try { new vm.Script(m[1], { filename: 'script' + n }); } catch (e) { bad++; console.log('script', n, e.message); }
}
console.log(n + ' scripts, ' + bad + ' with errors'); process.exit(bad ? 1 : 0);
