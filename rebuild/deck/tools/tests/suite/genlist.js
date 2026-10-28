// Generated deck lists, one line per commander and tier (for checking a speed change leaves decks identical). node genlist.js <dir> [set] TIERS=apex,budget
const path = require('path'), which = process.argv[3] || 'test';
process.argv = [process.argv[0], 'x', path.resolve(process.argv[2]), 'g', which, '--quiet']; const B = require('./bench.js'), H = B.H, X = H.ctx, run = H.run;
const crypto = require('crypto'); let ms = 0;
for (const [slug] of B.SETS[which]) for (const tier of (process.env.TIERS || 'apex,budget').split(',')){ const pd = H.retail(slug); H.edh(pd.commander); X.__n = pd.commander; X.__pp = pd.partner || ''; X.__tier = tier; const t0 = Date.now();
  const r = run(`(() => { const d = {id:'g', name:'g', format:'commander', commander:'', tier:'apex', aims:[], tribe:'', colors:[], aimLocked:false, cards:[], dismissed:[], auto:'commander'}; setCommander(d, __n); if (__pp) d.partner = __pp;
    const E = EDH, t = (E.tags || []).filter(x => E.tmap && E.tmap[x.slug]).slice(0, 3); if (t.length) d.aims = t.map(x => 'edh:' + x.slug);
    const plan = buildPlan(d, [], null, new Set()); d.cards = []; plan.forEach(s => addCard(d, __tier === 'apex' ? s.a : planPick(s, __tier), s.q)); d.tier = __tier; if (__tier !== 'apex') polishDeck(d);
    return d.cards.map(e => e.n + 'x' + e.q).sort().join('|'); })()`); ms += Date.now() - t0;
  console.log(slug.padEnd(24), tier.padEnd(7), crypto.createHash('md5').update(r).digest('hex').slice(0, 10)); }
console.log('TIME', ms);
