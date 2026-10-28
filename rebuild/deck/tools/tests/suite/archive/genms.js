// Generation benchmark: N seeded variations per commander (card values moved by ±amp/2), each judged by the evaluator and by
// measures it does not use (typicality against real decks, role gaps, validity). Best-of-K: does choosing the variation the
// evaluator likes best also improve the independent measures? node genms.js <engineDir> <set> [N] [amp] [K]
const path = require('path'), fs = require('fs'), which = process.argv[3] || 'tune', N = +(process.argv[4] || 30), AMP = +(process.argv[5] || 2), KB = +(process.argv[6] || 5);
process.argv = [process.argv[0], 'x', path.resolve(process.argv[2]), 'gen', which, '--quiet'];
const B = require('./bench.js'), H = B.H, X = H.ctx, run = H.run;
const KN = new Map(run('LIB').map(c => [c._k, c])), OID = new Map(run('LIB').filter(c => c.oid).map(c => [c.oid, c])), mean = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0, sd = a => { const m = mean(a); return Math.sqrt(mean(a.map(x => (x - m) ** 2))); }, med = a => { const s = a.slice().sort((x, y) => x - y); return s[s.length >> 1]; };
const list = which === 'all' ? B.SETS.tuneall.concat(B.SETS.test, B.SETS.holdout) : which === 'dev' ? B.SETS.tuneall.concat(B.SETS.test) : B.SETS[which];
const CORP = ['corpus', 'corpus2', 'corpus3', 'corpus4'].map(x => path.resolve(__dirname, '../../' + x)), agg = {base:[], mean:[], best:[], typB:[], typM:[], typBest:[], gapB:[], gapBest:[], sd:[], invalid:0, overlap:[]};
for (const [slug, file] of list){
  const pd = H.retail(slug), cmdN = pd.commander; H.edh(cmdN);
  let decks = []; for (const d of CORP){ const p = path.join(d, file + '.jsonl'); if (fs.existsSync(p)){ decks = fs.readFileSync(p, 'utf8').split('\n').filter(Boolean).map(JSON.parse); break; } }
  const sets = decks.map(x => { const s = new Set(); x.cards.forEach(([n, q, cats, uid]) => { if (!n || (cats || []).includes('Commander')) return; const c = uid && OID.get(uid) || X.find(n); if (c && !run('tags')(c).land) s.add(c._k); }); return s; }).filter(s => s.size >= 40);
  { const P = new Set(pd.cards.map(e => X.find(e.n)).filter(c => c && !run('tags')(c).land).map(c => c._k)); const keep = sets.filter(s => [...P].filter(k => s.has(k)).length < 0.8 * P.size); sets.length = 0; keep.forEach(s => sets.push(s)); }
  const rate = new Map(); sets.forEach(s => s.forEach(k => rate.set(k, (rate.get(k) || 0) + 1)));
  const realRole = {}; ['ramp', 'draw', 'removal', 'wipe'].forEach(r => realRole[r] = med(sets.map(s => [...s].filter(k => run('tags')(KN.get(k)).roles.has(r)).length)));
  const one = seed => { X.__n = cmdN; X.__p = pd.partner || ''; run(`recommend.noise = ${seed ? `{seed:${seed}, amp:${AMP}}` : 'null'}`);
    const nd = run(`(() => { const d = {id:'g', name:'g', format:'commander', commander:'', tier:'apex', aims:[], tribe:'', colors:[], aimLocked:false, cards:[], dismissed:[], auto:'commander'}; setCommander(d, __n); if (__p) setPartner(d, __p); return d; })()`);
    X.__d = nd; const plan = run('buildPlan(__d, [], null, new Set())'); run('recommend.noise = null');
    const deck = JSON.parse(JSON.stringify(nd)); deck.cards = []; plan.forEach(s => { X.__q = deck; X.__a = s.a; X.__k = s.q; run('addCard(__q, __a, __k)'); });
    X.__q = deck; const A = run('analyze(__q)'), v = run('validateDeck(__q)').length || A.size !== 100, ev = run('evaluateDeck(__q, {games:200})');
    const sp = new Set(deck.cards.map(e => X.find(e.n)).filter(c => c && !run('tags')(c).land).map(c => c._k));
    return {ev:ev.total, typ:mean([...sp].map(k => (rate.get(k) || 0) / sets.length)), gap:mean(['ramp', 'draw', 'removal', 'wipe'].map(r => Math.abs(A.roles[r] - realRole[r]))), v, sp}; };
  const base = one(0), runs = []; for (let i = 1; i <= N; i++) runs.push(one(1000 + i));
  // best-of-K: for each block of K seeds, the variation with the top evaluator score
  const bests = []; for (let i = 0; i + KB <= runs.length; i += KB) bests.push(runs.slice(i, i + KB).reduce((a, b) => b.ev > a.ev ? b : a));
  const ov = mean(runs.map(r => [...r.sp].filter(k => base.sp.has(k)).length / base.sp.size));
  agg.base.push(base.ev); agg.mean.push(mean(runs.map(r => r.ev))); agg.best.push(mean(bests.map(r => r.ev))); agg.typB.push(base.typ); agg.typM.push(mean(runs.map(r => r.typ))); agg.typBest.push(mean(bests.map(r => r.typ))); agg.gapB.push(base.gap); agg.gapBest.push(mean(bests.map(r => r.gap))); agg.sd.push(sd(runs.map(r => r.ev))); agg.invalid += runs.filter(r => r.v).length + (base.v ? 1 : 0); agg.overlap.push(ov);
  console.log(cmdN.split(',')[0].slice(0, 14).padEnd(15), 'eval base', base.ev, '| seeds mean', mean(runs.map(r => r.ev)).toFixed(1), 'sd', sd(runs.map(r => r.ev)).toFixed(1), '| best-of-' + KB, mean(bests.map(r => r.ev)).toFixed(1), '| typical base', base.typ.toFixed(3), 'seeds', mean(runs.map(r => r.typ)).toFixed(3), 'best', mean(bests.map(r => r.typ)).toFixed(3), '| role gap base', base.gap.toFixed(2), 'best', mean(bests.map(r => r.gap)).toFixed(2), '| spells shared with base', (100 * ov).toFixed(0) + '%');
}
console.log('\nMEAN eval: base ' + mean(agg.base).toFixed(1) + ', seeds ' + mean(agg.mean).toFixed(1) + ' (sd ' + mean(agg.sd).toFixed(1) + '), best-of-' + KB + ' ' + mean(agg.best).toFixed(1) + ' | typicality: base ' + mean(agg.typB).toFixed(3) + ', seeds ' + mean(agg.typM).toFixed(3) + ', best ' + mean(agg.typBest).toFixed(3) + ' | role gap: base ' + mean(agg.gapB).toFixed(2) + ', best ' + mean(agg.gapBest).toFixed(2) + ' | invalid ' + agg.invalid + ' | spells shared with base ' + (100 * mean(agg.overlap)).toFixed(0) + '%');
