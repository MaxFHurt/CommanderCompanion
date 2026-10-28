const path = require('path'), H = require('./h.js')(path.resolve(process.argv[2])), X = H.ctx, run = H.run;
const pd = H.retail('doom-prevails'); H.edh(pd.commander); X.__d = pd;
const g = run(`(() => { const d = {id:'g', name:'g', format:'commander', commander:'', tier:'apex', aims:[], tribe:'', colors:[], cards:[], dismissed:[]}; setCommander(d, __d.commander); d.aims = ctxOf(d).cmdThemes.slice(0, 3); d.plan = buildPlan(d, [], null, new Set()); return d; })()`);
X.__g = g;
for (const n of ['Arcane Signet', 'Black Market Connections', 'Toxic Deluge', 'Kang, Temporal Tyrant', 'Sol Ring'])
  console.log(n, JSON.stringify(run(`(() => { const ref = JSON.parse(JSON.stringify(__g)); ref.cards = __g.plan.map(y => ({n:y.a, q:y.q})); const ctx = ctxOf(ref), c = find(${JSON.stringify(n)}), j = mainJob(c.n), b = priceBand(c.p), used = new Set(ref.cards.map(x => norm(x.n)));
  const L = LIB.filter(x => !used.has(x._n) && legalIn(x, 'commander') && x.ci.every(k => ctx.ident.includes(k)) && priceBand(x.p) === b && x.p != null && (j ? jobsOf(x.n).includes(j) : mainType(x) === mainType(c))).map(x => [x.n, +baseScore(x, ref, ctx).s.toFixed(1), x.p]).sort((a, b) => b[1] - a[1]).slice(0, 10);
  return {j, b, self:+baseScore(c, ref, ctx).s.toFixed(1), L}; })()`)));
