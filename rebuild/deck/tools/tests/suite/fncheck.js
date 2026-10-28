// Checks card functions (engine/functions.js, engine redesign layer 2) against the answer key's makes/uses/roles
// (tools/rules/testset/cards.json), then measures each role against Scryfall's community tags (tools/rules/data, tests only)
// and against the 0.9.3 engine's roles over every Commander card. node fncheck.js <engineDir>
// EX=<role>:<miss|extra> lists example cards (miss = Scryfall tags it, we don't; extra = we do, Scryfall doesn't).
const path = require('path'), fs = require('fs'), zlib = require('zlib'), dir = path.resolve(process.argv[2] || '../candidate');
const H = require('./h.js')(dir), X = H.ctx, run = H.run;
for (const f of ['rules', 'functions']) if (run('typeof ' + (f === 'rules' ? 'rrRead' : 'fnOf')) !== 'function') require('vm').runInContext(fs.readFileSync(path.join(dir, 'engine/' + f + '.js'), 'utf8'), X, {filename:f + '.js'});
run('Object.assign(UP, ENGINE_OLD)'); // the 0.9.3 column is 0.9.3's own jobs
const fn = run('fnOf'), key = JSON.parse(fs.readFileSync(path.join(dir, 'tools/rules/testset/cards.json'), 'utf8')).cards;
const eq = (a, b) => JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());
let ok = {makes:0, uses:0, roles:0}; const bad = [];
for (const k of key){ const c = X.find(k.name); if (!c) continue; const f = fn(c); const why = [];
  for (const w of ['makes', 'uses', 'roles']) if (eq(f[w], k[w] || [])) ok[w]++; else why.push(w + ' want ' + (k[w] || []).join(',') + ' got ' + [...f[w]].join(','));
  if (why.length) bad.push(k.name + ': ' + why.join(' | ')); }
console.log('answer key (' + key.length + ' cards): makes ' + ok.makes + ', uses ' + ok.uses + ', roles ' + ok.roles + ' exact'); bad.forEach(b => console.log('  - ' + b));
// Scryfall's community tags for the same jobs
const S = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(dir, 'tools/rules/data/scryfall-tags.json.gz'))));
const byName = new Map(); for (const t in S.tags) for (const id of S.tags[t]){ const n = S.names[id]; if (!n) continue; if (!byName.has(n)) byName.set(n, new Set()); byName.get(n).add(t); }
// (a land tutor is ramp in the app, as in 0.9.3, so Scryfall's land-ramp cards are left out of tutor)
const SF = {ramp:['ramp', 'mana-rock', 'mana-dork', 'land-ramp'], draw:['draw', 'card-advantage', 'wheel', 'impulse'], removal:['removal', 'spot-removal', 'creature-removal', 'artifact-removal', 'enchantment-removal', 'planeswalker-removal', 'edict', 'bounce'], wipe:['boardwipe', 'sweeper'], counterspell:['counterspell'], tutor:['tutor'], recursion:['recursion', 'reanimate', 'reanimate-creature', 'mass-reanimation', 'cast-from-graveyard'], 'sac-outlet':['sacrifice-outlet'], protection:['protection', 'protects-creature', 'gives-indestructible', 'gives-hexproof'], finisher:['win-condition', 'extra-combat', 'extra-turn', 'life-drain']};
const OLD = {ramp:'ramp', draw:'draw', removal:'removal', wipe:'wipe', counterspell:'counter', tutor:'tutor', protection:'protect'};
const tagsOf = run('tags'), L = run('LIB').filter(c => c.cmd && !/\bLand\b/.test(c.t || '') && byName.has(c.n));
const st = {}; for (const r in SF) st[r] = {tp:0, fp:0, fn:0, oldTp:0, oldFp:0, oldFn:0, miss:[], extra:[]};
for (const c of L){ const f = fn(c), sf = byName.get(c.n), old = tagsOf(c).roles;
  for (const r in SF){ const s = st[r], want = SF[r].some(t => sf.has(t)) && !(r === 'tutor' && (sf.has('land-ramp') || sf.has('ramp'))), got = f.roles.has(r) || (r === 'removal' && f.roles.has('wipe'));
    if (want && got) s.tp++; else if (got) { s.fp++; s.extra.push(c.n); } else if (want) { s.fn++; s.miss.push(c.n); }
    if (OLD[r]){ const o = old.has(OLD[r]); if (want && o) s.oldTp++; else if (o) s.oldFp++; else if (want) s.oldFn++; } } }
const pct = (a, b) => b ? (100 * a / b).toFixed(0) + '%' : '-';
console.log('roles against Scryfall tags over ' + L.length + ' Commander nonland cards (precision / recall; 0.9.3 in brackets):');
for (const r in SF){ const s = st[r]; console.log('  ' + r.padEnd(13) + pct(s.tp, s.tp + s.fp).padStart(4) + ' / ' + pct(s.tp, s.tp + s.fn).padStart(4) +
  (OLD[r] ? '   (' + pct(s.oldTp, s.oldTp + s.oldFp) + ' / ' + pct(s.oldTp, s.oldTp + s.oldFn) + ')' : '')); }
if (process.env.EX){ const [r, w] = process.env.EX.split(':'); (st[r][w] || []).slice(0, +(process.env.N || 20)).forEach(n => console.log('  - ' + n + ' :: ' + (X.find(n).o || '').replace(/\n/g, ' / ').slice(0, 200))); }
