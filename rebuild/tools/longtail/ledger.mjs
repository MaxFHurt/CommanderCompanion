// Ledger of every Commander-legal card: tier a (verified) / b (compiles, unverified) / c (unsupported), with mechanic group.
//   node tools/longtail/ledger.mjs --audit $LT/out/base.json --clauses $LT/out/base --oracle $LT/data/oracle.jsonl.gz
//        [--reviewed tools/longtail/reviewed.txt] [--out tools/longtail]
//   node tools/longtail/ledger.mjs --make-reviewed early.json late.json   # append names by hand in early, automatic in late
// --clauses <tag prefix>: the clauses.mjs outputs <prefix>.cl0..3.json (run `sh tools/longtail/cl.sh base` first; gives the exact failing clause).
// Writes ledger.jsonl.gz (one card per line), ledger-summary.json and GROUPS.md. Run from rebuild/.
//
// Tiers: a = verified gameplay, decided per card by (1) every rules line is a keyword line whose keywords are engine-tested, or only
//   reminder text (basic lands); (2) every non-keyword line's wording (or its effect half after "When/Whenever/At …," or "cost:") appears
//   in a test source (tests/node/*.mjs, tests/fixtures/*.mjs), i.e. a test compiles/runs that wording; (3) the card flipped from by hand
//   to automatic in a completed batch whose newly passing cards had their compiled effects read (reviewed.txt) and its static lines
//   the audit cannot check are covered by (1)/(2); or (4) tools/longtail/behaviour-tested.txt: the card was played with its condition true and
//   false through the real game by tests/node/b113.mjs (evidence behaviour-test). b = automatic in the audit but none of that. c = by hand.
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { gunzipSync, gzipSync } from 'node:zlib';
import { classify, RULES } from './ledger-rules.mjs';

const args = process.argv.slice(2);
const opt = k => { const i = args.indexOf(k); return i < 0 ? null : args[i + 1]; };
const ROOT = new URL('../../', import.meta.url).pathname;
const OUT = opt('--out') || ROOT + 'tools/longtail';

if (args[0] === '--make-reviewed') {
  const early = JSON.parse(readFileSync(args[1])), late = new Set(JSON.parse(readFileSync(args[2])).filter(r => r.automated).map(r => r.name));
  const names = early.filter(r => !r.automated && late.has(r.name)).map(r => r.name);
  const file = OUT + '/reviewed.txt';
  const have = new Set(existsSync(file) ? readFileSync(file, 'utf8').split('\n').filter(Boolean) : []);
  names.forEach(n => have.add(n));
  writeFileSync(file, [...have].sort().join('\n') + '\n');
  console.log(`${names.length} added, ${have.size} reviewed names`);
  process.exit(0);
}

const audit = JSON.parse(readFileSync(opt('--audit')));
const rows = Array.isArray(audit) ? audit : audit.cards;
const cards = gunzipSync(readFileSync(opt('--oracle'))).toString().split('\n').filter(Boolean).map(l => JSON.parse(l))
  .filter(c => c.legalities?.commander === 'legal' && !['token', 'art_series', 'double_faced_token', 'emblem'].includes(c.layout))
  .sort((a, b) => (a.edhrec_rank ?? 1e9) - (b.edhrec_rank ?? 1e9));
const BEHAVIOUR = new Set(existsSync(OUT + '/behaviour-tested.txt') ? readFileSync(OUT + '/behaviour-tested.txt', 'utf8').split('\n').filter(Boolean) : []);   // played true and false through the real game (tests/node/b113.mjs)
const REVIEWED = new Set(readFileSync(opt('--reviewed') || OUT + '/reviewed.txt', 'utf8').split('\n').filter(Boolean));

// failing clauses by rank
const cl = new Map();
if (opt('--clauses')) for (let i = 0; i < 4; i++) { const f = `${opt('--clauses')}.cl${i}.json`; if (existsSync(f)) for (const r of JSON.parse(readFileSync(f))) cl.set(r.rank, r.items); }

// ---- test corpus ----
const norm = s => s.toLowerCase().replace(/\([^()]*\)/g, ' ').replace(/\\'/g, "'").replace(/\\n/g, '\n').replace(/[’]/g, "'")
  .replace(/\bthis (creature|artifact|enchantment|land|permanent|aura|equipment|vehicle|saga|token|spell|card|planeswalker)\b/g, '~').replace(/[ \t]+/g, ' ');
let blob = '', tests = ['tests/node', 'tests/fixtures'];
for (const d of tests) for (const f of readdirSync(ROOT + d)) if (f.endsWith('.mjs')) blob += '\n' + readFileSync(`${ROOT}${d}/${f}`, 'utf8');
const testBlob = norm(blob);
const testRaw = blob;

// ---- keywords engine-tested ----
const { MECHANICS } = await import(ROOT + 'src/data/mechanics.js');
const KW = MECHANICS.filter(m => m.kind !== 'concept' && m.automation === 'auto')
  .filter(m => new RegExp(`\\b${m.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(testRaw)).map(m => m.name.toLowerCase()).sort((a, b) => b.length - a.length);
const isKeywordLine = line => {
  const t = line.replace(/\([^()]*\)/g, '').trim().replace(/\.$/, '');
  if (!t) return true;
  return t.split(/\s*[,;]\s*/).every(tok => { const k = KW.find(k => tok.toLowerCase().startsWith(k)); return k && tok.length - k.length <= 28 && !/[.]/.test(tok) && !/\b(target|you|creature|when|whenever)\b/i.test(tok.slice(k.length)); });
};

const lineText = c => (c.card_faces?.length && !c.oracle_text ? c.card_faces.map(f => f.oracle_text || '').join('\n') : c.oracle_text || '');
const covered = (line, names) => {
  let t = norm(line); for (const n of names) if (n.length > 3) t = t.split(n.toLowerCase()).join('~');
  t = t.trim(); if (!t) return true;
  if (testBlob.includes(t)) return 1;
  let eff = null; const m = t.match(/^(?:when|whenever|at) [^,]+, (.+)$/); if (m) eff = m[1]; const a = t.match(/^[^:]{1,60}: (.+)$/); if (a) eff = a[1];
  return !!eff && eff.length >= 25 && testBlob.includes(eff.trim()) ? 2 : false;
};

const out = []; let skippedVanilla = 0;
const byRank = new Map(rows.map(r => [r.rank, r]));
cards.forEach((card, idx) => {
  const row = byRank.get(idx + 1);
  const names = [card.name, card.name.split(' // ')[0], card.name.split(',')[0], ...(card.card_faces || []).map(f => f.name)];
  const base = { name: card.name, oracle_id: card.oracle_id, rank: idx + 1 };
  if (!row) {   // not audited: no rules text at all (vanilla)
    skippedVanilla++; out.push({ ...base, tier: 'a', evidence: 'vanilla', group: 'vanilla', primitive: '', issue: '' }); return;
  }
  if (!row.automated) {
    const items = cl.get(row.rank) || row.gaps.map(g => ({ where: /never fires/.test(g) ? 'nofire' : /^Keyword/.test(g) ? 'other' : g.startsWith('Spell') ? 'spell' : g.startsWith('Activated') ? 'activated' : 'trigger', clauses: [g] }));
    const found = new Map();
    for (const it of items) for (const c of it.clauses) { const text = it.where === 'other' ? c : c; const r = classify(it.where === 'nofire' && !/^NOFIRE/.test(text) ? 'NOFIRE ' + text : text, it.where); if (!found.has(r.id)) found.set(r.id, { r, text: c, where: it.where }); }
    const gaps = row.gaps.some(g => /^Keyword:/.test(g)) ? row.gaps.filter(g => /^Keyword:/.test(g)).map(g => ({ r: classify(g, 'other'), text: g, where: 'other' })) : [];
    for (const g of gaps) found.set(g.r.id, g);
    const all = [...found.values()];
    // primary: the hardest (L > M > S), first found among ties
    const w = { L: 3, M: 2, S: 1 }; all.sort((x, y) => w[y.r.cx] - w[x.r.cx]);
    const p = all[0];
    out.push({ ...base, tier: 'c', group: p.r.id, groups: all.map(x => x.r.id), primitive: p.r.primitive, cx: p.r.cx, issue: all.map(x => `[${x.where}] ${x.text}`).join(' || ').slice(0, 600), gaps: row.gaps.length, solo: all.length === 1 });
    return;
  }
  // automatic: verified or not
  const lines = lineText(card).split('\n').map(l => l.trim()).filter(Boolean);
  const unv = new Set((row.unverified || []).map(u => norm(u).trim()));
  const uncovered = []; let kwOnly = true, halfOnly = false;
  for (const l of lines) {
    if (isKeywordLine(l)) continue;
    kwOnly = false;
    const cv = covered(l, names); if (!cv) uncovered.push(l); else if (cv === 2) halfOnly = true;
  }
  const reviewed = REVIEWED.has(card.name);
  const staticLines = lines.filter(l => unv.has(norm(l).trim()) || [...unv].some(u => u && norm(l).trim().startsWith(u.slice(0, 40))));
  const staticOpen = staticLines.filter(l => !isKeywordLine(l) && !covered(l, names));
  let tier, evidence;
  if (!uncovered.length) { tier = 'a'; evidence = kwOnly ? 'keyword-only' : halfOnly ? 'test-wording-effect-half' : 'test-wording'; }
  else if (BEHAVIOUR.has(card.name) && !staticOpen.length) { tier = 'a'; evidence = 'behaviour-test'; }
  else if (reviewed && !staticOpen.length) { tier = 'a'; evidence = 'batch-review'; }
  else { tier = 'b'; evidence = ''; }
  const rec = { ...base, tier, evidence };
  if (staticOpen.length) rec.static_unchecked = staticOpen.map(s => s.slice(0, 240));
  if (tier === 'b') {
    const first = uncovered.find(l => !staticOpen.includes(l)) || uncovered[0] || staticOpen[0] || '';
    const isStatic = !first ? false : staticOpen.includes(first) && !/^(when|whenever|at) /i.test(first) && !/^[^:]{1,60}: /.test(first);
    const r = isStatic ? { id: 'static-uncheckable', label: 'Static rule text compiles to nothing checkable', primitive: 'verify the continuous effect in a game (anthem, restriction, cost change, rule change)', cx: 'M' } : classify(first, /^(when|whenever|at) /i.test(first) ? 'trigger' : /: /.test(first) ? 'activated' : 'spell');
    rec.group = isStatic ? 'static-uncheckable' : 'unv-' + (r.id === 'other' ? 'other' : r.id);
    rec.primitive = 'behaviour test for: ' + (r.primitive || '');
    rec.issue = first.slice(0, 300);
    rec.untested_lines = uncovered.length;
  }
  out.push(rec);
});

// ---- write ledger ----
writeFileSync(OUT + '/ledger.jsonl.gz', gzipSync(out.map(o => JSON.stringify(o)).join('\n') + '\n', { level: 9 }));
const tier = t => out.filter(o => o.tier === t);
const ev = {}; for (const o of tier('a')) ev[o.evidence] = (ev[o.evidence] || 0) + 1;
const sum = { cards: out.length, a: tier('a').length, b: tier('b').length, c: tier('c').length, evidence: ev, vanilla_not_audited: skippedVanilla, audited: rows.length, audit_automatic: rows.filter(r => r.automated).length, static_unchecked_cards: out.filter(o => o.static_unchecked).length, keywords_tested: KW.length };

// ---- groups ----
const meta = new Map(RULES.map(r => [r.id, r]));
const G = new Map();
for (const o of out) {
  if (o.tier === 'a') continue;
  const ids = o.tier === 'c' ? o.groups : [o.group];
  for (const id of ids) { const g = G.get(id) || { id, touch: 0, solo: 0, cards: [] }; g.touch++; if (o.tier === 'c' ? (o.solo && ids.length === 1) : true) g.solo++; if (g.cards.length < 4) g.cards.push(o.name); G.set(id, g); }
}
const cxw = { S: 1, M: 2, L: 4 };
const isOther = g => g.id === 'other' || g.id === 'unv-other';
const rowsOf = tierId => [...G.values()].filter(g => (tierId === 'c' ? !g.id.startsWith('unv-') && g.id !== 'static-uncheckable' : g.id.startsWith('unv-') || g.id === 'static-uncheckable')).map(g => {
  const m = meta.get(g.id.replace(/^unv-/, '')) || { label: 'Static rule text compiles to nothing checkable', primitive: 'verify the continuous effect in a game', cx: 'M', why: 'each static kind needs its own test card' };
  return { ...g, label: m.label, primitive: m.primitive, cx: m.cx, why: m.why };
}).sort((x, y) => (isOther(x) - isOther(y)) || (tierId === 'c' ? (y.solo / cxw[y.cx]) - (x.solo / cxw[x.cx]) : y.touch - x.touch) || y.touch - x.touch);
const cRows = rowsOf('c'), bRows = rowsOf('b');
sum.groups_c = cRows.length; sum.groups_b = bRows.length;
writeFileSync(OUT + '/ledger-summary.json', JSON.stringify({ ...sum, top_c: cRows.slice(0, 40).map(g => ({ id: g.id, touch: g.touch, solo: g.solo, cx: g.cx })), top_b: bRows.slice(0, 20).map(g => ({ id: g.id, touch: g.touch, cx: g.cx })) }, null, 1));
const tbl = list => '| # | Group | Cards unlocked (alone / touched) | Missing primitive | Size | Why | Examples |\n|---|---|---|---|---|---|---|\n' +
  list.map((g, i) => `| ${i + 1} | ${g.label} | ${g.solo} / ${g.touch} | ${g.primitive} | ${g.cx} | ${g.why} | ${g.cards.join('; ')} |`).join('\n');
const md = `# Long-tail groups (generated by ledger.mjs)

Cards: ${sum.cards}. Tier a (verified): ${sum.a}; b (compiles, unverified): ${sum.b}; c (by hand): ${sum.c}.
Ranking: "alone" = cards whose only failing group is this one (what finishing the group unlocks by itself); ties by "touched" (cards that
have the group among their failing clauses). Ordered by alone / size weight (S 1, M 2, L 4), so cheap big groups come first.
Size: S = small change inside an existing mechanism; M = new op or state in an existing module; L = new engine layer or rewrite of a rule.
Grouping is by regex over the failing clause (ledger-rules.mjs); the "Unclassified wording" row is the share not yet classified.

## Tier c: unsupported (top 40 groups)

${tbl(cRows.slice(0, 40))}

## Tier b: compiled but unverified (top 20 groups; "unlocked" = cards a behaviour test of that wording moves to tier a)

${tbl(bRows.slice(0, 20))}
`;
writeFileSync(OUT + '/GROUPS.md', md);
console.log(JSON.stringify(sum, null, 1));
