const path = require('path'), H = require('./h.js')(path.resolve(process.argv[2])), X = H.ctx, run = H.run;
for (const slug of process.argv.slice(3)){ const pd = H.retail(slug); H.edh(pd.commander); X.__n = pd.commander;
  const nd = run(`(() => { const d = {id:'g', name:'g', format:'commander', commander:'', tier:'apex', aims:[], tribe:'', colors:[], aimLocked:false, cards:[], dismissed:[], auto:'commander'}; setCommander(d, __n); return d; })()`);
  if (pd.partner){ X.__d = nd; X.__p = pd.partner; run('setPartner(__d, __p)'); }
  X.__d = nd; const plan = run('buildPlan(__d, [], null, new Set())'); const deck = JSON.parse(JSON.stringify(nd)); deck.cards = []; plan.forEach(s => { X.__q = deck; X.__a = s.a; X.__k = s.q; run('addCard(__q, __a, __k)'); });
  X.__q = deck; const ctx = run('ctxOf(__q)'), lands = deck.cards.filter(e => run('tags')(X.find(e.n)).land);
  console.log('\n' + pd.commander, ctx.ident.join(''), 'lands', lands.reduce((a, e) => a + e.q, 0)); lands.forEach(e => console.log('   ' + e.q + ' ' + e.n + ' [' + [...run('landColors')(X.find(e.n))].join('') + '] ' + run('landSpeed')(X.find(e.n))));
  const src = {}; ctx.ident.forEach(k => src[k] = 0); deck.cards.forEach(e => { const c = X.find(e.n), s = run('simCard')(c, ctx.ident); if (s.land || s.mana) (s.fetch ? ctx.ident : s.cols).forEach(k => { if (k in src) src[k] += e.q; }); });
  console.log('  sources (lands + rocks/dorks):', JSON.stringify(src), 'mana plan pips:', JSON.stringify(run('manaPlan(__q)').pips));
  X.__q = deck; const S = run('simulate(__q, 500, 7)'); console.log('  sim', JSON.stringify(S));
}
