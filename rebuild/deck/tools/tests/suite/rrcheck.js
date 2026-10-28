// Checks the rules reader (engine/rules.js, engine redesign layer 1) against the hand-checked answer key
// (tools/rules/testset/cards.json), then measures how much card text it reads. node rrcheck.js <engineDir> [all]
const path = require('path'), fs = require('fs'), dir = path.resolve(process.argv[2] || '../candidate');
const H = require('./h.js')(dir), X = H.ctx, run = H.run;
if (run('typeof rrRead') !== 'function') require('vm').runInContext(fs.readFileSync(path.join(dir, 'engine/rules.js'), 'utf8'), X, {filename:'rules.js'});
const rr = run('rrRead'), key = JSON.parse(fs.readFileSync(path.join(dir, 'tools/rules/testset/cards.json'), 'utf8')).cards;
const costK = c => (c || []).map(x => Object.keys(x)[0] + (x.mana ? ':' + x.mana : '')).sort().join('+');
const effK = es => (es || []).map(e => e.do).filter(d => !['shuffle', 'reveal', 'put', 'choose', 'no-regenerate', 'change-text', 'put-rest', 'new-targets', 'once-each-turn', 'timing', 'still-land'].includes(d)).sort().join('+');
const sig = a => [a.kind === 'loyalty' ? 'activated' : a.kind, a.name || '', (a.trigger || {}).event || '', costK(a.cost), a.kind === 'mana' ? (a.makes || {}).amount : '', a.event || '', a.instead ? Object.keys(a.instead).filter(k => k !== 'text').sort().join() : '', a.modes ? a.modes.map(effK).join(' / ') : effK(a.effects), a.optional ? 'may' : '', a.unless ? 'unless' : ''].join('|');
let ok = 0; const bad = [];
for (const k of key){ const c = X.find(k.name); if (!c){ bad.push(k.name + ': not in the card data'); continue; } const r = rr(c);
  const want = k.abilities.map(sig).sort(), got = r.abilities.map(sig).sort(), same = JSON.stringify(want) === JSON.stringify(got) && !r.unknown.length;
  if (same) ok++; else bad.push(k.name + (r.unknown.length ? '  UNREAD: ' + r.unknown.join(' / ') : '') + '\n    want ' + want.join('  ||  ') + '\n    got  ' + got.join('  ||  ')); }
console.log('answer key: ' + ok + ' of ' + key.length + ' cards read exactly'); bad.forEach(b => console.log('  - ' + b));
// coverage: share of sentences read, over the five retail precons' spells and (with "all") every Commander-legal card
const cov = list => { let s = 0, u = 0, full = 0; for (const c of list){ const r = rr(c); s += r.sentences; u += r.unknown.length; if (!r.unknown.length) full++; } return {cards:list.length, fullyRead:full, sentences:s, sentencesRead:+(1 - u / Math.max(1, s)).toFixed(3)}; };
const seen = new Set(), spells = []; for (const s of ['avengers-assemble', 'doom-prevails', 'tramplesaurus-rex', 'turtle-power', 'wakanda-forever']) H.retail(s).cards.forEach(e => { const c = X.find(e.n); if (c && !run('tags')(c).land && !seen.has(c.n)){ seen.add(c.n); spells.push(c); } });
console.log('retail precon spells fully read: ' + JSON.stringify(cov(spells)) + '  (0.9.3: 156 of 289)');
if (process.argv[3] === 'all'){ const L = run('LIB').filter(c => c.cmd); console.log('every Commander card fully read: ' + JSON.stringify(cov(L)));
  const un = new Map(); for (const c of L) for (const s of rr(c).unknown){ const k = s.replace(/\d+/g, 'N').replace(/\{[^}]+\}/g, '{M}').slice(0, 60); un.set(k, (un.get(k) || 0) + 1); }
  console.log('most common unread openings:'); [...un].sort((a, b) => b[1] - a[1]).slice(0, +(process.env.TOP || 40)).forEach(([k, n]) => console.log('  ' + n + '  ' + k)); }
// EX="text": example cards whose unread sentences contain the text, with their full Oracle text
if (process.env.EX){ const L = run('LIB').filter(c => c.cmd), re = new RegExp(process.env.EX, 'i'); let n = 0;
  for (const c of L){ const r = rr(c); const u = r.unknown.find(s => re.test(s)); if (!u) continue; console.log('\n## ' + c.n + '  [unread: ' + u + ']\n' + c.o); if (++n >= +(process.env.N || 3)) break; } }
if (process.env.PRECON_UNREAD) spells.forEach(c => rr(c).unknown.forEach(s => console.log('  ' + c.n + ' :: ' + s.slice(0, 170))));
