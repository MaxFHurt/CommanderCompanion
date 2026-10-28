const path = require('path'), [, , dir, slug, tier] = process.argv; const H = require('./h.js')(path.resolve(dir)), X = H.ctx, run = H.run;
const pd = H.retail(slug); H.edh(pd.commander); X.__n = pd.commander; X.__tier = tier || 'apex';
// warm: a first build (the app's worker is warm too), then the measured one
const go = () => run(`(() => { const d = {id:'g', name:'g', format:'commander', commander:'', tier:'apex', aims:[], tribe:'', colors:[], aimLocked:false, cards:[], dismissed:[], auto:'commander'}; setCommander(d, __n);
  const E = EDH, t = (E.tags || []).filter(x => E.tmap && E.tmap[x.slug]).slice(0, 3); if (t.length) d.aims = t.map(x => 'edh:' + x.slug); genDeck(d, [], null, new Set(), __tier); return 1; })()`);
go(); run('apexRef.cache = new Map()'); const t0 = Date.now(); go(); console.log('total', Date.now() - t0);
