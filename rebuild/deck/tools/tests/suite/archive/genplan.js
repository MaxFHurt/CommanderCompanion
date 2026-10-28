// Generated plans: every Mid/Budget stand-in strictly under its limit, cheaper than its Apex card, same job; plan sizes.
const path = require('path'); process.argv = [process.argv[0], 'x', path.resolve(process.argv[2]), 'gp', 'all', '--quiet'];
const B = require('./bench.js'), H = B.H, X = H.ctx, run = H.run; let bad = [], n = 0, nm = 0, nb = 0, slots = 0;
for (const [slug] of B.SETS.tuneall.concat(B.SETS.test, B.SETS.holdout)){
  const pd = H.retail(slug); H.edh(pd.commander); X.__n = pd.commander; const nd = run(`(() => { const d = {id:'g', name:'g', format:'commander', commander:'', tier:'apex', aims:[], tribe:'', colors:[], cards:[], dismissed:[]}; setCommander(d, __n); return d; })()`);
  const E = run('EDH'), t = E.tags.filter(x => E.tmap[x.slug]).slice(0, 3); if (t.length) nd.aims = t.map(x => 'edh:' + x.slug); X.__d = nd; const plan = run('buildPlan(__d, [], null, new Set())');
  n++; const size = plan.reduce((s, x) => s + x.q, 0); if (size !== 99) bad.push(slug + ' plan size ' + size);
  for (const tier of ['mid', 'budget']){ const cap = tier === 'mid' ? 12 : 3, deck = {format:'commander', commander:pd.commander, cards:[], dismissed:[]}; plan.forEach(x => { X.__q = deck; X.__a = run('planPick')(x, tier); X.__k = x.q; run('addCard(__q, __a, __k)'); }); X.__q = deck; const v = run('validateDeck(__q)'); if (v.length) bad.push(slug + ' ' + tier + ' deck: ' + v.map(x => x.key + ':' + x.card).slice(0, 2).join(', ')); }
  plan.forEach(x => { slots++; const a = X.find(x.a); [['m', 12], ['b', 3]].forEach(([k, cap]) => { if (!x[k]) return; k === 'm' ? nm++ : nb++; const c = X.find(x[k]);
    if (!(c.p != null && c.p < cap)) bad.push(slug + ' ' + x[k] + ' $' + c.p + ' not under $' + cap);
    if (!(a.p == null || c.p < a.p)) bad.push(slug + ' ' + x[k] + ' not cheaper than ' + x.a);
    const j = run('mainJob')(x.a); if (!run('tags')(a).land && j && !run('jobsOf')(x[k]).includes(j)) bad.push(slug + ' ' + x[k] + ' does not do ' + j + ' like ' + x.a); }); });
}
console.log('plans', n, '| slots', slots, '| Mid stand-ins', nm, '| Budget stand-ins', nb, '| problems', bad.length); bad.slice(0, 12).forEach(x => console.log('  ' + x));
