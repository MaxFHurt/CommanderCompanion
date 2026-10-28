const path = require('path'), [, , dir, slug, tier] = process.argv; const H = require('./h.js')(path.resolve(dir)), X = H.ctx, run = H.run;
const pd = H.retail(slug || 'abzan-armor'); H.edh(pd.commander); X.__n = pd.commander; X.__tier = tier || 'apex';
const t0 = Date.now(); run(`(() => { const d = {id:'g', name:'g', format:'commander', commander:'', tier:'apex', aims:[], tribe:'', colors:[], aimLocked:false, cards:[], dismissed:[], auto:'commander'}; setCommander(d, __n);
  const E = EDH, t = (E.tags || []).filter(x => E.tmap && E.tmap[x.slug]).slice(0, 3); if (t.length) d.aims = t.map(x => 'edh:' + x.slug);
  const plan = buildPlan(d, [], null, new Set()); d.cards = []; plan.forEach(s => addCard(d, __tier === 'apex' ? s.a : planPick(s, __tier), s.q)); d.tier = __tier; if (__tier !== 'apex') polishDeck(d); return 1; })()`);
console.log('total', Date.now() - t0);
