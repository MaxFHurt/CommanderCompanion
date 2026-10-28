// Does the engine's own advice raise the evaluator's score? For each precon: score it, apply the top N Apex swaps, score again.
// node evalup.js <engineDir> [N] [set]
const path = require('path'), N = +(process.argv[3] || 10), which = process.argv[4] || 'all';
process.argv = [process.argv[0], 'x', path.resolve(process.argv[2]), 'gen', 'all', '--quiet'];
const B = require('./bench.js'), H = B.H, X = H.ctx, run = H.run;
const list = which === 'all' ? B.SETS.tuneall.concat(B.SETS.test, B.SETS.holdout) : B.SETS[which];
const K = ['synergy', 'balance', 'quality', 'routes', 'mana'], dif = {}; K.forEach(k => dif[k] = []); let up = 0, n = 0, tot = [];
for (const [slug] of list){
  const d = H.retail(slug); H.edh(d.commander); if (process.env.AIMS === 'edh'){ const E = run('EDH'), t = (E.tags || []).filter(x => E.tmap[x.slug]).slice(0, 3); if (t.length) d.aims = t.map(x => 'edh:' + x.slug); }
  X.__d = d; X.__ar = run('apexRef(__d)'); const e0 = run('evaluateDeck(__d, {apex:__ar})'), R = run('upgradePaths(__d)'), sw = R.paths.map(L => L.opts.apex).filter(Boolean).slice(0, N);
  const u = JSON.parse(JSON.stringify(d)); sw.forEach(p => { X.__q = u; X.__a = p.cut; run('cutCard(__q, __a, 1)'); X.__a = p.add; run('addCard(__q, __a, 1)'); });
  X.__d = u; const e1 = run('evaluateDeck(__d, {apex:__ar})'); n++; if (e1.total > e0.total) up++; tot.push(e1.total - e0.total); K.forEach(k => dif[k].push(e1.parts[k] - e0.parts[k]));
  console.log(d.commander.split(',')[0].slice(0, 14).padEnd(15), String(e0.total).padStart(3), '→', String(e1.total).padEnd(4), K.map(k => k.slice(0, 3) + ' ' + e0.parts[k] + '→' + e1.parts[k]).join('  '));
}
const m = a => (a.reduce((x, y) => x + y, 0) / a.length).toFixed(1);
console.log('\nengine top-' + N + ' swaps raise the score in ' + up + '/' + n + ' decks; mean change ' + m(tot) + ' | ' + K.map(k => k + ' ' + m(dif[k])).join(', '));
