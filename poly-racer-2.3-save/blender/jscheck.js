// Syntax-check every <script> block of a single-file game: node jscheck.js <index.html>
const fs = require('fs'), vm = require('vm');
const html = fs.readFileSync(process.argv[2], 'utf8');
const re = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi; let m, n = 0, bad = 0;
while ((m = re.exec(html))) {
  if (/src=/.test(m[1])) continue;
  n++;
  const before = html.slice(0, m.index).split('\n').length;
  try { new vm.Script(m[2], { filename: 'script' + n }); }
  catch (e) { bad++; const ln = (e.stack.match(/script\d+:(\d+)/) || [])[1]; console.log('SYNTAX ERROR in script ' + n + ' (starts at html line ' + before + ')' + (ln ? ' at html line ' + (before + +ln - 1) : '') + ': ' + e.message); }
}
console.log(n + ' scripts checked, ' + bad + ' with errors');
process.exit(bad ? 1 : 0);
