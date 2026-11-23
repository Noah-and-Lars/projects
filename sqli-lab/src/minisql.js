// minisql.js — a tiny, genuine SQL evaluator for the SQLi teaching lab.
//
// This is NOT a production database. It implements just enough real SQL
// semantics that textbook SQL-injection payloads behave the way they would
// against a real engine: boolean auth-bypass (' OR '1'='1' -- ), UNION-based
// data exfiltration, and SQL comment stripping (--, #, /* */).
//
// It is deliberately paired with endpoints that build queries by string
// concatenation so learners can see exactly how untrusted input changes the
// meaning of the query.

// ---- tokenizer ---------------------------------------------------------
const KEYWORDS = new Set([
  'SELECT', 'FROM', 'WHERE', 'AND', 'OR', 'LIKE', 'UNION', 'ALL', 'NOT',
]);

function stripComments(sql) {
  let out = '';
  for (let i = 0; i < sql.length; i++) {
    const c = sql[i];
    // string literal: copy verbatim (comments inside strings are data)
    if (c === "'") {
      out += c;
      i++;
      while (i < sql.length) {
        out += sql[i];
        if (sql[i] === "'") {
          // handle escaped '' inside a string
          if (sql[i + 1] === "'") { out += sql[i + 1]; i++; }
          else break;
        }
        i++;
      }
      continue;
    }
    // -- line comment
    if (c === '-' && sql[i + 1] === '-') {
      while (i < sql.length && sql[i] !== '\n') i++;
      continue;
    }
    // # line comment
    if (c === '#') {
      while (i < sql.length && sql[i] !== '\n') i++;
      continue;
    }
    // /* block comment */
    if (c === '/' && sql[i + 1] === '*') {
      i += 2;
      while (i < sql.length && !(sql[i] === '*' && sql[i + 1] === '/')) i++;
      i++; // skip the '/'
      continue;
    }
    out += c;
  }
  return out;
}

function tokenize(sql) {
  const src = stripComments(sql);
  const tokens = [];
  let i = 0;
  const isIdentStart = (ch) => /[A-Za-z_]/.test(ch);
  const isIdent = (ch) => /[A-Za-z0-9_.]/.test(ch);
  while (i < src.length) {
    const c = src[i];
    if (/\s/.test(c)) { i++; continue; }
    if (c === "'") {
      let val = '';
      i++;
      while (i < src.length) {
        if (src[i] === "'") {
          if (src[i + 1] === "'") { val += "'"; i += 2; continue; }
          i++; break;
        }
        val += src[i++];
      }
      tokens.push({ type: 'string', value: val });
      continue;
    }
    if (/[0-9]/.test(c)) {
      let num = '';
      while (i < src.length && /[0-9.]/.test(src[i])) num += src[i++];
      tokens.push({ type: 'number', value: num });
      continue;
    }
    if (isIdentStart(c)) {
      let id = '';
      while (i < src.length && isIdent(src[i])) id += src[i++];
      const up = id.toUpperCase();
      if (KEYWORDS.has(up)) tokens.push({ type: 'keyword', value: up });
      else tokens.push({ type: 'ident', value: id });
      continue;
    }
    // multi-char operators
    const two = src.slice(i, i + 2);
    if (two === '<>' || two === '!=' || two === '>=' || two === '<=') {
      tokens.push({ type: 'op', value: two === '<>' ? '!=' : two }); i += 2; continue;
    }
    if ('=(),*<>'.includes(c)) {
      tokens.push({ type: 'op', value: c }); i++; continue;
    }
    // anything else: skip (keeps the evaluator forgiving, like a real one being lenient)
    i++;
  }
  return tokens;
}

// ---- parser ------------------------------------------------------------
// Grammar (just what the lab needs):
//   query      := select (UNION [ALL] select)*
//   select     := SELECT selectList FROM ident [WHERE expr]
//   selectList := '*' | item (',' item)*
//   item       := string | number | ident
//   expr       := orExpr
//   orExpr     := andExpr (OR andExpr)*
//   andExpr    := cmpExpr (AND cmpExpr)*
//   cmpExpr    := primary [ (= | != | LIKE) primary ]
//   primary    := '(' expr ')' | value
//   value      := string | number | ident

function parse(tokens) {
  let p = 0;
  const peek = () => tokens[p];
  const next = () => tokens[p++];
  const eat = (type, value) => {
    const t = tokens[p];
    if (!t || t.type !== type || (value !== undefined && t.value !== value)) {
      throw new Error(`parse error near token ${p} (${t ? t.type + ':' + t.value : 'EOF'})`);
    }
    return tokens[p++];
  };
  const isKw = (v) => peek() && peek().type === 'keyword' && peek().value === v;

  function parseSelect() {
    eat('keyword', 'SELECT');
    const items = [];
    if (peek() && peek().type === 'op' && peek().value === '*') {
      next();
      items.push({ kind: 'star' });
    } else {
      items.push(parseItem());
      while (peek() && peek().type === 'op' && peek().value === ',') {
        next();
        items.push(parseItem());
      }
    }
    eat('keyword', 'FROM');
    const table = eat('ident').value;
    let where = null;
    if (isKw('WHERE')) { next(); where = parseExpr(); }
    return { items, table, where };
  }

  function parseItem() {
    const t = peek();
    if (!t) throw new Error('unexpected EOF in select list');
    if (t.type === 'string') { next(); return { kind: 'lit', value: t.value, name: t.value }; }
    if (t.type === 'number') { next(); return { kind: 'lit', value: t.value, name: t.value }; }
    if (t.type === 'ident') { next(); return { kind: 'col', value: t.value, name: t.value.split('.').pop() }; }
    throw new Error('bad select item: ' + t.type);
  }

  function parseExpr() { return parseOr(); }
  function parseOr() {
    let left = parseAnd();
    while (isKw('OR')) { next(); const right = parseAnd(); left = { op: 'OR', left, right }; }
    return left;
  }
  function parseAnd() {
    let left = parseCmp();
    while (isKw('AND')) { next(); const right = parseCmp(); left = { op: 'AND', left, right }; }
    return left;
  }
  function parseCmp() {
    const left = parsePrimary();
    const t = peek();
    if (t && ((t.type === 'op' && (t.value === '=' || t.value === '!=')) ||
              (t.type === 'keyword' && t.value === 'LIKE'))) {
      next();
      const right = parsePrimary();
      return { op: 'cmp', cmp: t.value, left, right };
    }
    return left;
  }
  function parsePrimary() {
    const t = peek();
    if (t && t.type === 'op' && t.value === '(') {
      next();
      const e = parseExpr();
      if (peek() && peek().type === 'op' && peek().value === ')') next();
      return e;
    }
    if (t && t.type === 'string') { next(); return { op: 'val', vtype: 'string', value: t.value }; }
    if (t && t.type === 'number') { next(); return { op: 'val', vtype: 'number', value: t.value }; }
    if (t && t.type === 'ident') { next(); return { op: 'val', vtype: 'col', value: t.value }; }
    throw new Error('bad primary: ' + (t ? t.type : 'EOF'));
  }

  const selects = [parseSelect()];
  while (isKw('UNION')) {
    next();
    if (isKw('ALL')) next();
    selects.push(parseSelect());
  }
  return selects;
}

// ---- evaluator ---------------------------------------------------------
function colValue(node, row) {
  const key = node.value.split('.').pop();
  // case-insensitive column lookup, like many engines
  if (key in row) return row[key];
  const found = Object.keys(row).find((k) => k.toLowerCase() === key.toLowerCase());
  return found ? row[found] : null;
}

function truthy(v) {
  if (v === null || v === undefined) return false;
  if (typeof v === 'boolean') return v;
  if (typeof v === 'number') return v !== 0;
  const s = String(v).trim();
  if (s === '' || s === '0') return false;
  return true;
}

function likeToRegex(pattern) {
  let re = '^';
  for (const ch of String(pattern)) {
    if (ch === '%') re += '.*';
    else if (ch === '_') re += '.';
    else re += ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
  return new RegExp(re + '$', 'i');
}

function evalNode(node, row) {
  switch (node.op) {
    case 'OR': return truthy(evalNode(node.left, row)) || truthy(evalNode(node.right, row));
    case 'AND': return truthy(evalNode(node.left, row)) && truthy(evalNode(node.right, row));
    case 'val':
      if (node.vtype === 'col') return colValue(node, row);
      return node.value;
    case 'cmp': {
      const l = node.left.op === 'val'
        ? (node.left.vtype === 'col' ? colValue(node.left, row) : node.left.value)
        : evalNode(node.left, row);
      const r = node.right.op === 'val'
        ? (node.right.vtype === 'col' ? colValue(node.right, row) : node.right.value)
        : evalNode(node.right, row);
      if (node.cmp === 'LIKE') return likeToRegex(r).test(String(l ?? ''));
      const eq = String(l ?? '') === String(r ?? '');
      return node.cmp === '!=' ? !eq : eq;
    }
    default:
      return truthy(evalNode(node, row));
  }
}

function projectRow(items, row, firstNames) {
  const out = {};
  items.forEach((item, idx) => {
    if (item.kind === 'star') {
      Object.assign(out, row);
      return;
    }
    // output column name: from the FIRST select's names (UNION semantics)
    const name = firstNames ? (firstNames[idx] ?? item.name) : item.name;
    if (item.kind === 'lit') out[name] = item.value;
    else out[name] = colValue({ value: item.value }, row);
  });
  return out;
}

// Runs a SQL string against the provided tables object: { tableName: [rows] }.
// Returns an array of result rows. Throws on parse errors (surfaced to the UI,
// which is itself an information-leak lesson about verbose DB errors).
export function runQuery(sql, tables) {
  const selects = parse(tokenize(sql));

  // Determine output column names from the first SELECT.
  let firstNames = null;
  const first = selects[0];
  if (!(first.items.length === 1 && first.items[0].kind === 'star')) {
    firstNames = first.items.map((it) => it.name);
  }

  const results = [];
  for (const sel of selects) {
    const table = tables[sel.table] || tables[Object.keys(tables).find(
      (t) => t.toLowerCase() === sel.table.toLowerCase()) || ''] || [];
    for (const row of table) {
      if (sel.where && !truthy(evalNode(sel.where, row))) continue;
      const star = sel.items.length === 1 && sel.items[0].kind === 'star';
      results.push(star ? { ...row } : projectRow(sel.items, row, firstNames));
    }
  }
  return results;
}

export default { runQuery, tokenize, parse, stripComments };
