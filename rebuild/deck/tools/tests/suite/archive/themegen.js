const path = require('path'), H = require('./h.js')(path.resolve(process.argv[2])), X = H.ctx, run = H.run;
const slugs = 'doom-prevails,turtle-power,wakanda-forever,avengers-assemble,limit-break,squirreled-away,abzan-armor,family-matters'.split(',');
const agg = {on:{th:0, sc:0, ms:0}, off:{th:0, sc:0, ms:0}};
for (const s of slugs){ const pd = H.retail(s); H.edh(pd.commander); X.__c = pd.commander; X.__p = pd.partner || '';
  const r = {}; for (const k of ['off', 'on']){ X.__k = k === 'on' ? 1 : 0;
    r[k] = run(`(() => { UP.theme = __k; const g = {id:'g', name:'g', format:'commander', commander:'', tier:'apex', aims:[], tribe:'', colors:[], cards:[], dismissed:[]}; setCommander(g, __c); if (__p) g.partner = __p; g.aims = ctxOf(g).cmdThemes.slice(0, 3);
      const t = Date.now(), P = buildPlan(g, [], null, new Set()), ms = Date.now() - t; P.forEach(x => addCard(g, x.a, x.q)); const T = themeCtx(g), sp = g.cards.map(e => find(e.n)).filter(c => c && !tags(c).land);
      return {th:sp.filter(c => themeOf(c, T)).length, n:sp.length, sc:evaluateDeck(g, {games:300}).exact, ms}; })()`); agg[k].th += r[k].th; agg[k].sc += r[k].sc; agg[k].ms += r[k].ms; }
  console.log(s.padEnd(18), 'on-theme spells', r.off.th + '→' + r.on.th, 'of', r.on.n, '| score', r.off.sc.toFixed(1) + '→' + r.on.sc.toFixed(1), '| ms', r.off.ms + '→' + r.on.ms); }
console.log('mean score', (agg.off.sc / slugs.length).toFixed(2), '→', (agg.on.sc / slugs.length).toFixed(2), '| on-theme', agg.off.th, '→', agg.on.th);
