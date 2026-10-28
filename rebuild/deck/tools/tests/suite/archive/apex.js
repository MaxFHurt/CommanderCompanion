// Which EDHREC signal predicts what HIGH-budget upgraders add (the Apex question), and what LOW-budget upgraders add (the
// Budget question)? Upgraded copies are priced with the snapshot's card prices. node apex.js [set]
const path = require('path'), fs = require('fs'), which = process.argv[2] || 'tuneall';
process.argv = [process.argv[0], 'x', path.resolve(__dirname, '../candidate'), 'apex', which, '--quiet'];
const B = require('./bench.js'), H = B.H, run = H.run, X = H.ctx;
const SNAP = path.resolve(__dirname, '../snapshot/edhrec'), D2 = path.resolve(__dirname, '../data2/edhrec');
const rk = a => { const q = a.map((v, i) => [v, i]).sort((x, y) => x[0] - y[0]), r = []; let i = 0; while (i < q.length){ let j = i; while (j + 1 < q.length && q[j + 1][0] === q[i][0]) j++; for (let k = i; k <= j; k++) r[q[k][1]] = (i + j) / 2; i = j + 1; } return r; };
const sp = (a, b) => { const ra = rk(a), rb = rk(b), n = a.length, m = (n - 1) / 2; let u = 0, x = 0, y = 0; for (let i = 0; i < n; i++){ u += (ra[i] - m) * (rb[i] - m); x += (ra[i] - m) ** 2; y += (rb[i] - m) ** 2; } return u / Math.sqrt(x * y); };
const page = (slug, v) => { for (const d of [SNAP, D2]){ const f = path.join(d, slug + (v ? '.' + v : '') + '.json'); if (fs.existsSync(f)){ const j = JSON.parse(fs.readFileSync(f)), m = new Map();
  ((j.container && j.container.json_dict && j.container.json_dict.cardlists) || []).forEach(L => (L.cardviews || []).forEach(c => { if (c.name && c.potential_decks){ const k = run('keyOf')(c.name), inc = c.num_decks / c.potential_decks; if (!m.has(k) || m.get(k) < inc) m.set(k, inc); } })); return m; } } return null; };
const KN = new Map(run('LIB').map(c => [c._k, c])), price = k => { const c = KN.get(k); return c && c.p != null ? c.p : 0; };
const tot = {}; const add = (k, v) => { if (!isNaN(v)) (tot[k] = tot[k] || []).push(v); };
for (const [slug, file] of (which === 'all' ? B.SETS.tuneall.concat(B.SETS.test) : B.SETS[which])){
  const ev = B.evidence(slug, file); if (ev.n < 40) { console.log(slug, 'too few copies', ev.n); continue; }
  const cs = H.slug(ev.d.commander), main = page(cs), exp = page(cs, 'expensive'), bud = page(cs, 'budget');
  const priced = ev.up.map(s => ({s, p:[...s].reduce((a, k) => a + price(k), 0)})).sort((a, b) => a.p - b.p);
  const q = Math.floor(priced.length / 4), hi = priced.slice(-q), lo = priced.slice(0, priced.length >> 1);
  const rate = grp => { const m = new Map(); grp.forEach(x => x.s.forEach(k => { if (!ev.P.has(k)) m.set(k, (m.get(k) || 0) + 1); })); m.forEach((v, k) => m.set(k, v / grp.length)); return m; };
  const Ahi = rate(hi), Alo = rate(lo);
  const pool = [...new Set([...(main ? main.keys() : []), ...(exp ? exp.keys() : [])])].filter(k => KN.get(k) && !ev.P.has(k) && !run('tags')(KN.get(k)).land);
  const sig = {main:k => main ? main.get(k) || 0 : 0, exp:k => exp ? exp.get(k) || 0 : 0, bud:k => bud ? bud.get(k) || 0 : 0, mainExp:k => (main ? main.get(k) || 0 : 0) * 0.5 + (exp ? exp.get(k) || 0 : 0) * 0.5};
  const row = [slug.padEnd(20), 'copies ' + ev.n, 'price lo/hi $' + Math.round(lo[lo.length - 1].p) + '/$' + Math.round(hi[0].p)];
  for (const [n, f] of Object.entries(sig)){ const rh = sp(pool.map(f), pool.map(k => Ahi.get(k) || 0)), rl = sp(pool.map(f), pool.map(k => Alo.get(k) || 0)); add(n + ':hi', rh); add(n + ':lo', rl); row.push(n + ' hi ' + rh.toFixed(2) + ' lo ' + rl.toFixed(2)); }
  console.log(row.join(' | '));
}
console.log('\nMEAN Spearman with what high-budget (Apex) / low-budget (Budget) upgraders add:');
['main', 'exp', 'bud', 'mainExp'].forEach(n => console.log('  ' + n.padEnd(8) + ' hi ' + (tot[n + ':hi'].reduce((a, b) => a + b, 0) / tot[n + ':hi'].length).toFixed(3) + '   lo ' + (tot[n + ':lo'].reduce((a, b) => a + b, 0) / tot[n + ':lo'].length).toFixed(3)));
