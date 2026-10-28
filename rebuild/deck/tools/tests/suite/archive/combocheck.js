// Do upgraders add cards that complete a combo with the precon more than their play rate predicts? (residual analysis)
const path = require('path'); process.argv = [process.argv[0], 'x', path.resolve(__dirname, '../candidate'), 'cc', 'all', '--quiet'];
const B = require('./bench.js'), H = B.H, X = H.ctx, run = H.run, mean = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN;
const res = {win:[], eng:[], none:[]}, rows = [];
for (const [slug, file] of B.SETS.tuneall.concat(B.SETS.test, B.SETS.holdout)){
  const ev = B.evidence(slug, file); if (ev.n < 40) continue; const d = ev.d; H.edh(d.commander); X.__d = d;
  const near = run('combosOf(__d, ctxOf(__d).ident)').near, comp = new Map(); near.forEach(n => { const mk = X.find(n.miss)._k, o = comp.get(mk); if (!o || n.x.win) comp.set(mk, n.x); });
  const E = run('EDH'); const pts = []; E.map.forEach((v, k) => { const c = run('IDX').get(k); if (!c || ev.P.has(c._k) || run('tags')(c).land) return; pts.push({k:c._k, inc:v.inc, a:ev.A.get(c._k) || 0, n:c.n}); });
  // least squares a ≈ b*inc through the origin, per deck
  const b = pts.reduce((s, p) => s + p.inc * p.a, 0) / Math.max(1e-9, pts.reduce((s, p) => s + p.inc * p.inc, 0));
  pts.forEach(p => { const x = comp.get(p.k), r = p.a - b * p.inc; (x ? (x.win ? res.win : res.eng) : res.none).push(r); if (x) rows.push([slug, p.n, x.what, x.decks, p.inc.toFixed(2), p.a.toFixed(2), (b * p.inc).toFixed(2)]); });
}
console.log('residual add rate (actual − predicted from play rate): win-combo completers', mean(res.win).toFixed(3), '(n=' + res.win.length + ') | engine-combo completers', mean(res.eng).toFixed(3), '(n=' + res.eng.length + ') | other cards', mean(res.none).toFixed(3), '(n=' + res.none.length + ')');
rows.sort((a, b) => b[3] - a[3]).slice(0, 15).forEach(r => console.log('  ' + r.join(' | ')));
