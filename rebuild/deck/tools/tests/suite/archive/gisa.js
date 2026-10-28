const path = require('path'), H = require('./h.js')(path.resolve(process.argv[2])), X = H.ctx, run = H.run;
const pd = H.retail('wretched-ranks'); H.edh(pd.commander); X.__c = pd.commander;
console.log(JSON.stringify(run(`(() => { const d = {id:'g', name:'g', format:'commander', commander:'', tier:'apex', aims:[], tribe:'', colors:[], cards:[], dismissed:[]}; setCommander(d, __c); const t = EDH.tags.filter(x => EDH.tmap[x.slug]).slice(0, 3); d.aims = t.map(x => 'edh:' + x.slug);
  const P = buildPlan(d, [], null, new Set()), names = P.map(x => x.a), tmp = JSON.parse(JSON.stringify(d)); P.forEach(x => addCard(tmp, x.a, x.q)); const ctx = ctxOf(tmp);
  const info = n => { const c = find(n), e = EDH.map && edhOf(EDH.map, c), b = baseScore(c, tmp, ctx); return {n, inPlan:names.includes(n), s:+b.s.toFixed(1), why:b.why.slice(0, 3), inc:e && +e.inc.toFixed(2), syn:e && +e.syn.toFixed(2), weak:weakHere(tmp).some(w => w.n === n)}; };
  const sc = tmp.cards.map(e => find(e.n)).filter(c => c && !tags(c).land).map(c => +baseScore(c, tmp, ctx).s.toFixed(1)).sort((a, b) => a - b);
  return {aims:d.aims, tribe:ctx.tribe, cmdThemes:ctx.cmdThemes, minPicked:sc.slice(0, 5), medPicked:sc[sc.length >> 1], cards:['Undead Warchief', 'Champion of the Perished', 'Zombie Master', 'Lord of the Undead', 'Death Baron'].map(info)}; })()`), null, 1));
