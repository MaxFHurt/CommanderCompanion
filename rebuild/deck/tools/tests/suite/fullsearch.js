// How much does the per-slot shortlist miss? For each upgrade row, every legal card that does the same job as the row's pick
// (the rule alternatives follow) is scored with the full deck score, and the best of them is compared with the best the app
// measured (L.top) and with the Apex pick. Slow on purpose; a check, not app code. node fullsearch.js <engineDir> <set> [rows] [maxPerRow]
const path = require('path'), A0 = process.argv.slice(2); process.argv = [process.argv[0], 'x', path.resolve(A0[0]), 'f', 'test', '--quiet'];
const B = require('./bench.js'), H = B.H, X = H.ctx, run = H.run, which = A0[1] || 'test', NR = +(A0[2] || 8), MAX = +(A0[3] || 100000);
const sets = which === 'all' ? B.SETS.tuneall.concat(B.SETS.test, B.SETS.holdout) : !B.SETS[which] ? which.split(',').map(s => B.SETS.tuneall.concat(B.SETS.test, B.SETS.holdout).find(x => x[0] === s)) : B.SETS[which];
const tags = run('tags'), out = [];
for (const [slug, file] of sets){ const ev = B.evidence(slug, file), d = ev.d; H.edh(d.commander); X.__d = d; d.tier = 'apex'; const t0 = Date.now();
  const R = run('(() => { const R0 = upgradePaths(__d); try { scoreCheck(__d, R0, {apex:apexRef(__d)}); } catch (e) {} return R0; })()');
  const ctx0 = run('ctxOf')(d), inDeck = new Set(d.cards.map(e => run('norm')(e.n)).concat([run('norm')(d.commander)])), LIB = run('LIB'), E = run('EDH');
  const U = LIB.filter(x => !run('isBasic')(x.n) && x.cmd && x.ci.every(k => ctx0.ident.includes(k)) && run('mustOk')(x, d) && !inDeck.has(x._n) && x.p != null);
  let rows = 0; const usedN = new Set(R.paths.flatMap(L => Object.values(L.opts).filter(Boolean).map(p => run('norm')(p.add))));
  for (const L of R.paths.slice(0, NR)){ const p = L.opts.apex; if (!p || p.dScore == null) continue; const rc = X.find(p.add), cc = X.find(L.cut); if (!rc || !cc || tags(cc).land) continue;
    const mine = new Set(Object.values(L.opts).filter(Boolean).map(p => run('norm')(p.add))), same = run('sameJobAs')(rc, d, ctx0), pool = U.filter(x => !tags(x).land && same(x) && (!usedN.has(x._n) || mine.has(x._n))).slice(0, MAX); let best = null, n = 0; const t1 = Date.now();
    for (const x of pool){ const v = R.dOf(L.cut, x.n, p.q); n++; if (v != null && (!best || v > best.v)) best = {n:x.n, v, r:x.r, p:x.p, inc:((E && run('edhOf')(E.map, x)) || {inc:0}).inc}; }
    const top = L.top ? L.top.dScore : p.dScore; rows++;
    out.push({slug, cut:L.cut, pick:p.add, pickD:p.dScore, measuredBest:L.top && L.top.n, measuredD:top, poolN:pool.length, best:best && best.n, bestD:best && best.v, bestInc:best && +best.inc.toFixed(3), bestR:best && best.r, bestP:best && best.p, gap:best ? +(best.v - top).toFixed(2) : 0, ms:Date.now() - t1});
    const o = out[out.length - 1]; console.log(slug.slice(0, 14).padEnd(15) + o.cut.slice(0, 22).padEnd(23) + 'pick ' + String(o.pickD).padStart(5) + ' | measured best ' + (o.measuredBest || '').slice(0, 22).padEnd(23) + String(o.measuredD).padStart(5) + ' | full search ' + String(o.poolN).padStart(5) + ' cards: ' + (o.best || '').slice(0, 26).padEnd(27) + String(o.bestD).padStart(5) + ' (gap ' + o.gap + ', run by ' + Math.round(100 * (o.bestInc || 0)) + '%) ' + Math.round(o.ms / 1000) + 's'); }
}
require('fs').writeFileSync(A0[4] || '/tmp/fullsearch.json', JSON.stringify(out));
const g = out.map(o => o.gap), big = out.filter(o => o.gap >= 0.2);
console.log('\nrows ' + out.length + ' | full search found better than the best measured: ' + out.filter(o => o.gap > 0.02).length + ' | by 0.2+: ' + big.length + ' | mean gap ' + (g.reduce((a, b) => a + b, 0) / Math.max(1, g.length)).toFixed(3) + ' | best found is run by <10% of players in ' + out.filter(o => o.gap > 0.02 && o.bestInc < 0.1).length);
