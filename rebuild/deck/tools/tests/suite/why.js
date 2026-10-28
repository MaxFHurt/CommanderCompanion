// Which parts of the deck score a swap moves. node why.js <engineDir> <set> <slug> "<cut>" "<add>" ["<add2>" ...]
const path = require('path'), [, , dir, set, slug, cut, ...adds] = process.argv;
process.argv = [process.argv[0], 'x', path.resolve(dir), 'g', set, '--quiet']; const B = require('./bench.js'), H = B.H, X = H.ctx, run = H.run;
if (process.env.UP){ X.__up = JSON.parse(process.env.UP); run('Object.assign(UP, __up)'); }
const [s, file] = B.SETS[set].find(x => x[0] === slug), ev = B.evidence(s, file), d = ev.d; H.edh(d.commander); X.__d = d; d.tier = 'apex';
run('__ar = apexRef(__d); __e = evaluateDeck(__d, {apex:__ar, games:300})');
for (const a of adds){ X.__c = cut; X.__a = a;
  const r = run(`(() => { const u = JSON.parse(JSON.stringify(__d)); cutCard(u, __c, 1); addCard(u, __a, 1); const x = evaluateDeck(u, {apex:__ar, sim:__e.sim}), g = {}; for (const k in __e.contrib) g[k] = +(x.contrib[k] - __e.contrib[k]).toFixed(3); const R = {}; for (const k in __e.raw) R[k] = +(x.raw[k] - __e.raw[k]).toFixed(4); return {d:+(x.exact - __e.exact).toFixed(2), contrib:g, raw:R, routes:x.why.routes, fin:isFinisher(find(__a)), roles:[...tags(find(__a)).roles], jobs:jobsOf(__a)}; })()`);
  console.log(a.padEnd(32), JSON.stringify(r)); }
