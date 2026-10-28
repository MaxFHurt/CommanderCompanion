// Theme first vs best overall: share of generated spells that are on theme (commander's set family or creature types),
// and the deck score of each. node themefirst.js <engineDir> [set]
const path = require('path'), which = process.argv[3] || 'tuneall';
process.argv = [process.argv[0], 'x', path.resolve(process.argv[2]), 'g', which, '--quiet']; const B = require('./bench.js'), H = B.H, X = H.ctx, run = H.run;
if (process.env.UP){ X.__up = JSON.parse(process.env.UP); run('Object.assign(UP, __up)'); }
const mean = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0, rows = [];
const list = which === 'all' ? B.SETS.tuneall.concat(B.SETS.test, B.SETS.holdout) : B.SETS[which];
for (const [slug] of list){ const pd = H.retail(slug), cmdN = pd.commander; H.edh(cmdN); const r = {slug};
  for (const tf of [false, true]){
    X.__n = cmdN; X.__pp = pd.partner || ''; X.__tf = tf;
    const nd = run(`(() => { const d = {id:'g', name:'g', format:'commander', commander:'', tier:'apex', aims:[], tribe:'', colors:[], cards:[], dismissed:[], auto:'commander'}; setCommander(d, __n); if (__pp) d.partner = __pp; if (__tf) d.themeFirst = true; return d; })()`);
    const E = run('EDH'), t = (E.tags || []).filter(x => E.tmap[x.slug]).slice(0, 3); if (t.length) nd.aims = t.map(x => 'edh:' + x.slug);
    X.__d = nd; const plan = run('buildPlan(__d, [], null, new Set())'); const deck = JSON.parse(JSON.stringify(nd)); deck.cards = [];
    plan.forEach(s => { X.__q = deck; X.__a = s.a; X.__k = s.q; run('addCard(__q, __a, __k)'); }); X.__q = deck;
    const T = run('themeCtx(__q)'); X.__T = T; const sp = deck.cards.map(e => X.find(e.n)).filter(c => c && !run('tags')(c).land);
    const on = sp.filter(c => { X.__c = c; return run('themeOf(__c, __T)'); }).length;
    r[tf ? 'tf' : 'b'] = {on, n:sp.length, score:+run('evaluateDeck(__q, {games:200}).exact').toFixed(1)}; }
  rows.push(r); console.log(slug.padEnd(22), 'best', r.b.on + '/' + r.b.n, r.b.score, '| theme-first', r.tf.on + '/' + r.tf.n, r.tf.score); }
console.log('MEAN on-theme spells best ' + mean(rows.map(r => r.b.on)).toFixed(1) + ' theme-first ' + mean(rows.map(r => r.tf.on)).toFixed(1) + ' | score best ' + mean(rows.map(r => r.b.score)).toFixed(1) + ' theme-first ' + mean(rows.map(r => r.tf.score)).toFixed(1));
