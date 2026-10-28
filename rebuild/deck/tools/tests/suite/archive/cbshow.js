const path = require('path'); process.argv = [process.argv[0], 'x', path.resolve(__dirname, '../candidate'), 'cc', 'all', '--quiet'];
const B = require('./bench.js'), H = B.H, X = H.ctx, run = H.run;
for (const [slug] of B.SETS.tuneall.concat(B.SETS.test, B.SETS.holdout)){ const d = H.retail(slug); H.edh(d.commander); X.__d = d; const R = run('upgradePaths(__d)');
  R.paths.forEach((L, i) => Object.entries(L.opts).forEach(([t, p]) => { if (p && (p.why || []).some(w => /Completes a combo|Backup for your/.test(w))) console.log(slug, '#' + (i + 1), t, 'cut', p.cut, '→ add', p.add, '|', p.why[0]); }));
  const cb = run('combosOf(__d, ctxOf(__d).ident)'); if (cb.full.length) console.log(slug, 'has combos:', cb.full.map(x => x.names.join(' + ') + ' (' + x.what + ')').join('; ')); }
