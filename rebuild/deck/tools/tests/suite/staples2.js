// The app's own generation (genDeck, as the Generate window runs it) at each tier: are Sol Ring and Arcane Signet in?
const path = require('path'), [, , dir] = process.argv; const H = require('./h.js')(path.resolve(dir)), X = H.ctx, run = H.run;
for (const slug of (process.argv[3] || 'sultai-arisen,turtle-power,wakanda-forever,death-toll,abzan-armor').split(',')) { const pd = H.retail(slug); H.edh(pd.commander); X.__n = pd.commander;
  const row = [];
  for (const tier of ['apex', 'mid', 'budget']) { X.__t = tier;
    row.push(tier + ':' + run(`(() => { const d = {id:'g', name:'g', format:'commander', commander:'', tier:__t, aims:[], tribe:'', colors:[], aimLocked:false, cards:[], dismissed:[], auto:'commander'}; setCommander(d, __n);
      const E = EDH, t = (E.tags || []).filter(x => E.tmap && E.tmap[x.slug]).slice(0, 3); if (t.length) d.aims = t.map(x => 'edh:' + x.slug);
      genDeck(d, [], null, new Set(), __t); return ['Sol Ring', 'Arcane Signet'].map(n => d.cards.some(e => e.n === n) ? 'Y' : 'n').join('') + '/' + d.cards.reduce((s,e)=>s+e.q,0); })()`)); }
  console.log(slug.padEnd(18), row.join('  ')); }
