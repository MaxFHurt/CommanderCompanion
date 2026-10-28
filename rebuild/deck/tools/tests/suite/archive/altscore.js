const path = require('path'), H = require('./h.js')(path.resolve(process.argv[2])), X = H.ctx, run = H.run;
for (const s of ['doom-prevails', 'limit-break', 'wakanda-forever']){ const d = H.retail(s); H.edh(d.commander); X.__d = d;
  console.log(s, JSON.stringify(run(`(() => { const AR = apexRef(__d), base = evaluateDeck(__d, {games:300, apex:AR}), R = scoreCheck(__d, upgradePaths(__d), {apex:AR, base}); const skip = R.paths.flatMap(L => Object.values(L.opts).map(o => o.add)), out = [];
    for (const L of R.paths.slice(0, 6)) for (const t of ['apex','mid','budget']){ const p = L.opts[t]; if (!p) continue; const A = altsFor(__d, p.add, {cut:p.cut, val:R.valOf, skip, n:14}).map(a => R.dOf(p.cut, a.n, p.q));
      out.push([t, p.add.slice(0, 16), p.dScore, A.length, A.filter(v => v >= 0.05).length, A.filter(v => v >= Math.max(0.05, 0.5 * p.dScore)).length, Math.max(...A, -9).toFixed(2)]); }
    return out; })()`))); }
