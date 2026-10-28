const path = require('path'); process.argv = [process.argv[0], 'x', path.resolve(process.argv[2]), 'g', 'tuneall', '--quiet']; const B = require('./bench.js'), H = B.H, X = H.ctx, run = H.run;
const tier = process.env.T || 'mid', cap = tier === 'mid' ? 12 : 3; let tot = 0;
for (const [slug] of B.SETS.tuneall.concat(B.SETS.test)){ const pd = H.retail(slug); H.edh(pd.commander); X.__n = pd.commander; X.__pp = pd.partner || '';
  const nd = run(`(() => { const d = {id:'g', name:'g', format:'commander', commander:'', tier:'apex', aims:[], tribe:'', colors:[], cards:[], dismissed:[], auto:'commander'}; setCommander(d, __n); if (__pp) d.partner = __pp; return d; })()`);
  X.__d = nd; const plan = run('buildPlan(__d, [], null, new Set())'); X.__t = tier;
  const bad = plan.filter(s => !s.basic).map(s => { X.__s = s; const n = run('planPick(__s, __t)'), c = X.find(n); return c && c.p != null && c.p >= cap ? n + ' $' + c.p + (s.land ? ' (land)' : '') + ' a=' + s.a : null; }).filter(Boolean);
  tot += bad.length; if (bad.length) console.log(slug, bad.join('; ')); }
console.log('total over cap', tot);
