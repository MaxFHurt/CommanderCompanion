// Stylesheet cleanup: removes selectors whose classes no code uses, and declarations that a later
// rule with the same selector (in the same @media block) always overrides. Comments, order and
// formatting of everything kept are untouched.
//
//   node tools/css-clean.mjs            report only
//   node tools/css-clean.mjs --write    rewrite styles/app.css
//
// Check the result with tests/style_diff.py (capture before, capture after, compare).
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const CSS = join(ROOT, 'styles/app.css');
const write = process.argv.includes('--write');

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(js|mjs|html)$/.test(name)) out.push(p);
  }
  return out;
}
const code = [...walk(join(ROOT, 'src')), join(ROOT, 'index.html')].map(p => readFileSync(p, 'utf8')).join('\n');

/** Is a class name used by the code (literally, or built from a prefix like `tp--${n}`)? */
function classUsed(name) {
  if (code.includes(name)) return true;
  const cut = name.match(/^(.*?(?:--|-|__))[^-_]+$/);
  return !!cut && (code.includes(`${cut[1]}\${`) || code.includes(`'${cut[1]}' +`) || code.includes(`"${cut[1]}" +`));
}
const STATE_PREFIX = /^(?:is|has)-/; // state classes toggled from code by name pieces are checked too

// ── A small CSS parser that keeps source offsets ──────────────────────────────────────────────
const src = readFileSync(CSS, 'utf8');
const rules = []; // { selStart, selEnd, bodyStart, bodyEnd, selector, context, decls: [{ prop, value, important, start, end }] }

function skipComment(i) { return src.startsWith('/*', i) ? src.indexOf('*/', i + 2) + 2 : i; }

function parseBlock(start, end, context) {
  let i = start;
  while (i < end) {
    // skip whitespace and comments
    while (i < end && (/\s/.test(src[i]) || src.startsWith('/*', i))) i = src.startsWith('/*', i) ? skipComment(i) : i + 1;
    if (i >= end) break;
    const open = findTop(i, end, '{');
    if (open < 0) break;
    const close = matchBrace(open);
    const head = src.slice(i, open).trim();
    if (head.startsWith('@media') || head.startsWith('@supports')) parseBlock(open + 1, close, `${context}|${head}`);
    else if (head.startsWith('@')) { /* keyframes, font-face: leave alone */ }
    else rules.push({ selStart: i, selEnd: open, bodyStart: open + 1, bodyEnd: close, selector: head, context, decls: parseDecls(open + 1, close) });
    i = close + 1;
  }
}
function findTop(i, end, ch) {
  for (; i < end; i++) {
    if (src.startsWith('/*', i)) { i = skipComment(i) - 1; continue; }
    if (src[i] === '"' || src[i] === "'") { const q = src[i]; i++; while (i < end && src[i] !== q) i++; continue; }
    if (src[i] === ch) return i;
  }
  return -1;
}
function matchBrace(open) {
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src.startsWith('/*', i)) { i = skipComment(i) - 1; continue; }
    if (src[i] === '"' || src[i] === "'") { const q = src[i]; i++; while (src[i] !== q) i++; continue; }
    if (src[i] === '{') depth++;
    else if (src[i] === '}' && --depth === 0) return i;
  }
  throw new Error('unbalanced braces');
}
function parseDecls(start, end) {
  const out = [];
  let i = start, depthParen = 0, declStart = start;
  for (; i <= end; i++) {
    if (i < end && src.startsWith('/*', i)) { i = skipComment(i) - 1; continue; }
    const ch = i < end ? src[i] : ';';
    if (ch === '"' || ch === "'") { const q = ch; i++; while (src[i] !== q) i++; continue; }
    if (ch === '(') depthParen++;
    else if (ch === ')') depthParen--;
    else if (ch === ';' && depthParen === 0) {
      const text = src.slice(declStart, i);
      const colon = text.indexOf(':');
      const lead = text.match(/^\s*(?:\/\*[\s\S]*?\*\/\s*)*/)[0].length;
      if (colon > 0 && text.slice(lead, colon).trim()) {
        const prop = text.slice(lead, colon).trim().toLowerCase();
        const value = text.slice(colon + 1).trim();
        out.push({ prop, value, important: /!important\s*$/i.test(value), start: declStart + lead, end: i < end ? i + 1 : i });
      }
      declStart = i + 1;
    }
  }
  return out;
}
parseBlock(0, src.length, '');

// ── 1. Dead selectors ────────────────────────────────────────────────────────────────────────
const edits = []; // { start, end, text }
const deadSelectors = [];
for (const r of rules) {
  const parts = splitSelectors(r.selector);
  const keep = parts.filter(sel => {
    const classes = [...sel.replace(/:not\([^)]*\)/g, '').matchAll(/\.([A-Za-z_][\w-]*)/g)].map(m => m[1]);
    const dead = classes.find(c => !classUsed(c) && !(STATE_PREFIX.test(c) && classUsed(c.replace(STATE_PREFIX, ''))));
    if (dead) deadSelectors.push(`${sel}   (.${dead} unused)`);
    return !dead;
  });
  if (keep.length === parts.length) continue;
  r.dead = !keep.length;
  if (r.dead) edits.push({ start: r.selStart, end: r.bodyEnd + 1, text: '', rule: r });
  else edits.push({ start: r.selStart, end: r.selEnd, text: keep.join(', ') + ' ' });
}
function splitSelectors(s) {
  const out = []; let depth = 0, cur = '';
  for (const ch of s.replace(/\s+/g, ' ')) {
    if (ch === '(') depth++; if (ch === ')') depth--;
    if (ch === ',' && !depth) { out.push(cur.trim()); cur = ''; } else cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

// ── 2. Overridden declarations ──────────────────────────────────────────────────────────────
const deadDecls = [];
const norm = s => splitSelectors(s).join(', ');
const live = rules.filter(r => !r.dead);
for (let a = 0; a < live.length; a++) {
  const ra = live[a];
  for (const d of ra.decls) {
    if (d.prop.startsWith('--') && false) continue;
    const later = live.slice(a + 1).find(rb => rb.context === ra.context && norm(rb.selector) === norm(ra.selector) && rb.decls.some(x => x.prop === d.prop && (x.important || !d.important)));
    if (later) { deadDecls.push(`${norm(ra.selector)} { ${d.prop}: ${d.value} }`); edits.push({ start: d.start, end: d.end, text: '' }); }
  }
}

console.log(`${rules.length} rules parsed`);
console.log(`\nUnused selectors (${deadSelectors.length}):\n  ${deadSelectors.join('\n  ')}`);
console.log(`\nOverridden declarations (${deadDecls.length}):\n  ${deadDecls.join('\n  ')}`);

if (write) {
  // Apply from the end so offsets stay valid; drop edits inside a removed rule.
  const removed = edits.filter(e => e.rule);
  const clean = edits.filter(e => e.rule || !removed.some(r => e.start >= r.start && e.end <= r.end)).sort((x, y) => y.start - x.start);
  let out = src;
  for (const e of clean) out = out.slice(0, e.start) + e.text + out.slice(e.end);
  // Rules left with no declarations, and the blank lines removals leave behind.
  out = out.replace(/^[^{}\n@/]+\{\s*\}\n?/gm, '').replace(/\{ +\}/g, '{}').replace(/[ \t]+$/gm, '').replace(/\n{3,}/g, '\n\n');
  writeFileSync(CSS, out);
  console.log(`\nwrote ${CSS}: ${src.length} → ${out.length} bytes`);
}
