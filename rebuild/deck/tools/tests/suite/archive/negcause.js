const path = require('path'); process.argv = [process.argv[0], 'x', path.resolve(process.argv[2]), 'x', 'all', '--quiet']; const B = require('./bench.js'), H = B.H, X = H.ctx, run = H.run;
const list = B.SETS.tuneall.concat(B.SETS.test, B.SETS.holdout); const cause = {}, ex = [];
for (const [slug] of list){ const d = H.retail(slug); H.edh(d.commander); X.__d = d;
  const r = run(`(() => { const AR = apexRef(__d), base = evaluateDeck(__d, {games:300, apex:AR}), R = upgradePaths(__d), out = [];
    for (const L of R.paths) for (const t of ['apex','mid','budget']){ const p = L.opts[t]; if (!p) continue; const u = JSON.parse(JSON.stringify(__d)); cutCard(u, p.cut, p.q); addCard(u, p.add, p.q); const e = evaluateDeck(u, {apex:AR, sim:base.sim}); const dv = e.exact - base.exact;
      if (dv < 0.05){ const parts = {}; for (const k in e.parts) if (e.parts[k] != null) parts[k] = e.parts[k] - base.parts[k]; out.push({cut:p.cut, add:p.add, dv:+dv.toFixed(2), parts, why:Object.fromEntries(Object.keys(parts).filter(k => parts[k] < 0).map(k => [k, e.why[k]]))}); } }
    return out; })()`);
  r.forEach(x => { const worst = Object.entries(x.parts).sort((a, b) => a[1] - b[1])[0]; const k = worst && worst[1] < 0 ? worst[0] : 'tiny'; cause[k] = (cause[k] || 0) + 1; if (ex.length < 14 && k !== 'tiny') ex.push(slug + ': ' + x.cut + ' -> ' + x.add + ' ' + x.dv + ' ' + JSON.stringify(x.parts)); }); }
console.log(JSON.stringify(cause)); ex.forEach(x => console.log(x));
