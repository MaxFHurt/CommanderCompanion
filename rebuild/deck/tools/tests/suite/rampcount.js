// Ramp in generated Apex decks vs the ramp target. node rampcount.js <engineDir> [set]   UP='{...}' for experiments
const path = require('path'), which = process.argv[3] || 'tuneall';
process.argv = [process.argv[0], 'x', path.resolve(process.argv[2]), 'g', which, '--quiet']; const B = require('./bench.js'), H = B.H, X = H.ctx, run = H.run;
if (process.env.UP){ X.__up = JSON.parse(process.env.UP); run('Object.assign(UP, __up)'); }
let tot = 0, n = 0;
for (const [slug] of B.SETS[which]){
  const pd = H.retail(slug), cmdN = pd.commander; H.edh(cmdN);
  X.__n = cmdN; X.__pp = pd.partner || ''; const nd = run(`(() => { const d = {id:'g', name:'g', format:'commander', commander:'', tier:'apex', aims:[], tribe:'', colors:[], aimLocked:false, cards:[], dismissed:[], auto:'commander'}; setCommander(d, __n); if (__pp) d.partner = __pp; return d; })()`);
  X.__d = nd; const plan = run('buildPlan(__d, [], null, new Set())');
  const deck = JSON.parse(JSON.stringify(nd)); deck.cards = []; plan.forEach(s => { X.__q = deck; X.__a = s.a; X.__k = s.q; run('addCard(__q, __a, __k)'); });
  X.__q = deck; const A = run('analyze(__q)'), ramp = deck.cards.filter(e => { const c = X.find(e.n); return c && !run('tags')(c).land && run('tags')(c).roles.has('ramp'); }).map(e => e.n);
  console.log(slug.padEnd(24), 'ramp', A.roles.ramp, 'target', A.T.ramp, '|', ramp.join(', '));
  tot += A.roles.ramp - A.T.ramp; n++;
}
console.log('MEAN over target', (tot / n).toFixed(2));
