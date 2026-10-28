// Why Game Changer picks are dropped by the score check. node gcwhy.js <engineDir> <set> <slug>   UP='{...}'
const path = require('path'), [, , dir, set, slug] = process.argv; process.argv = [process.argv[0], 'x', path.resolve(dir), 'g', set, '--quiet']; const B = require('./bench.js'), H = B.H, X = H.ctx, run = H.run;
if (process.env.UP){ X.__up = JSON.parse(process.env.UP); run('Object.assign(UP, __up)'); }
const [s, f] = B.SETS[set].find(x => x[0] === slug), ev = B.evidence(s, f), d = ev.d; H.edh(d.commander); X.__d = d; d.tier = 'apex';
run('__ar = apexRef(__d); __b = evaluateDeck(__d, {apex:__ar, games:300}); __R = upgradePaths(__d)');
const gcs = run('__R.paths.map(L => L.opts.apex).filter(p => p && find(p.add).gc).map(p => ({cut:p.cut, add:p.add}))');
for (const p of gcs){ X.__c = p.cut; X.__a = p.add; const r = run(`(() => { const u = JSON.parse(JSON.stringify(__d)); cutCard(u, __c, 1); addCard(u, __a, 1); const x = evaluateDeck(u, {apex:__ar, sim:__b.sim}), g = {}; for (const k in __b.contrib) g[k] = +(x.contrib[k] - __b.contrib[k]).toFixed(2); return {d:+(x.exact - __b.exact).toFixed(2), g, inc:(edhOf(EDH.map, find(__a)) || {inc:0}).inc}; })()`);
  console.log((p.cut + ' -> ' + p.add).padEnd(55), JSON.stringify(r)); }
run('scoreCheck(__d, __R, {apex:__ar, base:__b})'); console.log('after check, GC picks:', run('__R.paths.map(L => L.opts.apex).filter(p => p && find(p.add).gc).map(p => p.add).join(", ")'));
console.log(run('__R.paths.filter(L => L.gcPick || ["Dazzling Sphinx","Ukkima, Stalking Shadow","Silent-Blade Oni","Bronze Guardian","Mask of Memory","Aerith, Last Ancient"].includes(L.cut)).map(L => L.cut + " => " + Object.entries(L.opts).map(([t, p]) => t + ":" + p.add + " " + p.dScore).join(" | ") + (L.pop ? " (pop " + JSON.stringify(Object.fromEntries(Object.entries(L.pop).map(([t,p])=>[t,p.add]))) + ")" : "")).join("\\n")'));
console.log('rows', run('__R.paths.length'), 'trimmed', run('__R.trimN || 0'), 'gcPick rows left', run('__R.paths.filter(L => L.gcPick).length'));
