// Which signals predict what players keep (precon cards) and add (other cards)? Spearman rank correlations.
// node signals.js [tune|test|all]
const path = require('path'), which = process.argv[2] || 'tune';
process.argv = [process.argv[0], 'x', path.resolve(__dirname, '../candidate'), 'signals', which, '--quiet'];
const B = require('./bench.js'), H = B.H, run = H.run, X = H.ctx;
const rank = a => { const s = a.map((v, i) => [v, i]).sort((x, y) => x[0] - y[0]), r = new Array(a.length); let i = 0;
  while (i < s.length){ let j = i; while (j + 1 < s.length && s[j + 1][0] === s[i][0]) j++; for (let k = i; k <= j; k++) r[s[k][1]] = (i + j) / 2; i = j + 1; } return r; };
const spear = (a, b) => { const ra = rank(a), rb = rank(b), n = a.length, ma = ra.reduce((x, y) => x + y, 0) / n, mb = rb.reduce((x, y) => x + y, 0) / n;
  let num = 0, da = 0, db = 0; for (let i = 0; i < n; i++){ num += (ra[i] - ma) * (rb[i] - mb); da += (ra[i] - ma) ** 2; db += (rb[i] - mb) ** 2; } return num / Math.sqrt(da * db); };
const list = which === 'all' ? B.SETS.tune.concat(B.SETS.test) : B.SETS[which];
const FEAT = ['inc', 'syn', 'fit', 'pop', 'cmc', 'aim', 'val'];
const tabK = {}, tabA = {}; FEAT.forEach(f => { tabK[f] = []; tabA[f] = []; });
for (const [slug, file] of list){
  const ev = B.evidence(slug, file); if (!ev.n) continue; const d = ev.d; H.edh(d.commander); X.__d = d;
  run('__ctx = ctxOf(__d); __dd = Object.assign({}, __d, {tier:"apex"})');
  const feat = c => { X.__c = c; return run(`(() => { const c = __c, e = EDH.map && EDH.map.get(c._n), a = W_INC, b = W_SYN, p = POP_K; W_INC = 0; W_SYN = 0; POP_K = 0; let f; try { f = baseScore(c, __dd, __ctx); } finally { W_INC = a; W_SYN = b; POP_K = p; }
    return {inc:e ? e.inc : 0, syn:e ? e.syn : 0, fit:f.s, aim:f.a, pop:c.r ? -Math.log(c.r) : -12, cmc:-(c.cmc || 0), val:10 * (e ? e.inc : 0) + 4 * (e ? e.syn : 0) + 0.4 * f.s}; })()`); };
  const KN = new Map(run('LIB').map(c => [c._k, c]));
  const rowsK = [...ev.K.entries()].map(([k, v]) => ({y:v, f:feat(KN.get(k))}));
  const pool = new Set(); (run('[...EDH.map.keys()]') || []).forEach(n => { const c = X.find(n); if (c && !ev.P.has(c._k) && !run('tags')(c).land) pool.add(c._k); });
  const rowsA = [...pool].map(k => ({y:ev.A.get(k) || 0, f:feat(KN.get(k))}));
  const line = (rows, tab) => FEAT.map(f => { const r = spear(rows.map(x => x.f[f]), rows.map(x => x.y)); tab[f].push(r); return (f + ' ' + (isNaN(r) ? '  -  ' : r.toFixed(2))).padEnd(10); }).join(' ');
  (global.ALL = global.ALL || []).push({slug, K:rowsK, A:rowsA});
  console.log(slug.padEnd(20), 'KEEP  ', line(rowsK, tabK), ' n=' + rowsK.length);
  console.log(''.padEnd(20), 'ADD   ', line(rowsA, tabA), ' n=' + rowsA.length);
}
const avg = t => FEAT.map(f => (f + ' ' + (t[f].reduce((a, b) => a + b, 0) / t[f].length).toFixed(2)).padEnd(10)).join(' ');
console.log('\nMEAN'.padEnd(21), 'KEEP  ', avg(tabK)); console.log(''.padEnd(20), 'ADD   ', avg(tabA));

if (process.env.GRID){
  const res = [];
  for (const a of [0, 0.1, 0.2, 0.4]) for (const b of [0, 0.01, 0.02, 0.04]) for (const c of [0, 0.01, 0.02, 0.05]){
    const f = x => x.inc + a * x.syn + b * x.fit + c * x.pop;
    const k = ALL.map(D => spear(D.K.map(r => f(r.f)), D.K.map(r => r.y))), ad = ALL.map(D => spear(D.A.map(r => f(r.f)), D.A.map(r => r.y)));
    const m = v => v.reduce((x, y) => x + y, 0) / v.length; res.push([m(k) + m(ad), m(k), m(ad), a, b, c]); }
  res.sort((x, y) => y[0] - x[0]); console.log('\nbest (keep+add, keep, add, syn w, fit w, pop w):'); res.slice(0, 8).forEach(r => console.log('  ' + r.map(v => v.toFixed(3)).join('  ')));
  const engine = res.find(r => r[3] === 0.4 && r[4] === 0.04 && r[5] === 0); console.log('  engine-like (syn .4, fit .04):', engine && engine.map(v => v.toFixed(3)).join('  '));
}
