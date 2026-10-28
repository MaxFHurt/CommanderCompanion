// How many alternatives carry the "Unpopular pick" chip, over every benchmark precon (Apex tier). node unpopcount.js <engineDir>
const path = require('path'); process.argv = [process.argv[0], 'x', path.resolve(process.argv[2]), 'u', 'all', '--quiet'];
const B = require('./bench.js'), H = B.H, X = H.ctx, run = H.run; let alts = 0, un = 0; const ex = [];
for (const [slug, file] of B.SETS.tuneall.concat(B.SETS.test, B.SETS.holdout)){ const ev = B.evidence(slug, file), d = ev.d; H.edh(d.commander); X.__d = d; d.tier = 'apex';
  const R = run('(() => { const R0 = upgradePaths(__d); try { scoreCheck(__d, R0, {apex:apexRef(__d)}); } catch (e) {} return R0; })()');
  R.paths.forEach(L => Object.values(L.alts || {}).forEach(a => (a || []).forEach(x => { if (x.most) return; alts++; if (x.unpop){ un++; if (ex.length < 400) ex.push([slug, x.n, x.inc, x.vs, x.vsInc, x.dScore, x.vsScore]); } }))); }
console.log('alternatives ' + alts + ', marked Unpopular pick ' + un + ' (' + Math.round(100 * un / alts) + '%)');
ex.slice(0, +(process.env.SHOW || 12)).forEach(e => console.log('  ' + e[0].padEnd(20) + e[1].padEnd(34) + ' in ' + Math.round(e[2] * 100) + '%  vs ' + e[3] + (e[4] != null ? ' in ' + Math.round(e[4] * 100) + '%' : '') + '  score ' + e[5] + ' vs ' + e[6]));
