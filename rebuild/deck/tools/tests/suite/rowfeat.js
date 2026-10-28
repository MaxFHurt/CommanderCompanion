// Per upgrade row: what the engine knows (precon cut-list position, precon add rate, commander play rates) against what
// players did (keep rate of the cut, add rate of the add). For designing a row cut-off. node rowfeat.js <engineDir> <set|all> [out.json]
const path = require('path'), A0 = process.argv.slice(2); process.argv = [process.argv[0], 'x', path.resolve(A0[0]), 'f', 'test', '--quiet'];
const B = require('./bench.js'), H = B.H, X = H.ctx, run = H.run, keyOf = run('keyOf'), tags = run('tags'), which = A0[1] || 'all';
const sets = which === 'all' ? B.SETS.tuneall.concat(B.SETS.test, B.SETS.holdout) : B.SETS[which]; const rows = [];
for (const [slug, file] of sets){ const ev = B.evidence(slug, file), d = ev.d; H.edh(d.commander); X.__d = d; d.tier = 'apex';
  const R = run('(() => { const R0 = upgradePaths(__d); try { scoreCheck(__d, R0, {apex:apexRef(__d)}); } catch (e) {} return R0; })()');
  const E = run('EDH'), pre = E && E.pre, cutI = new Map((pre && pre.cut || []).map((n, i) => [keyOf(n), i])), addR = new Map((pre && pre.add || []).map(r => [keyOf(r[0]), r[1]]));
  const inc = c => { const e = c && run('edhOf')(E.map, c); return e ? e.inc : 0; };
  R.paths.forEach((L, i) => { const p = L.opts.apex; if (!p) return; const cc = X.find(L.cut), ca = X.find(p.add); if (!cc || !ca || tags(cc).land || tags(ca).land) return;
    rows.push({slug, i, cut:L.cut, add:p.add, keep:ev.K.get(cc._k) || 0, added:ev.A.get(ca._k) || 0, ci:cutI.has(cc._k) ? cutI.get(cc._k) : null, cl:cutI.size, pa:addR.get(ca._k) || 0, cinc:inc(cc), ainc:inc(ca), d:p.dScore, n:ev.n}); }); }
require('fs').writeFileSync(A0[2] || '/tmp/rowfeat.json', JSON.stringify(rows));
console.log(rows.length + ' rows');
