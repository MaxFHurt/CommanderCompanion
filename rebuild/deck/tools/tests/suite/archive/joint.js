// Joint upgrade optimisation vs the current selector, judged by the same evaluator AND by real players (bench agreement).
// The joint search starts from the current top-10 Apex swaps and tries replacing any add or cut with another candidate from
// the top 25 paths; it keeps a change when value + μ × evaluator total improves. node joint.js <engineDir> <set> [μ]
const path = require('path'), which = process.argv[3] || 'dev', MU = +(process.argv[4] || 1);
process.argv = [process.argv[0], 'x', path.resolve(process.argv[2]), 'jt', 'all', '--quiet'];
const B = require('./bench.js'), H = B.H, X = H.ctx, run = H.run, mean = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0;
const list = which === 'dev' ? B.SETS.tuneall.concat(B.SETS.test) : B.SETS[which];
const res = {cur:{ag:[], ev:[]}, jt:{ag:[], ev:[]}, changed:[]};
for (const [slug, file] of list){
  const ev = B.evidence(slug, file); if (ev.n < 20) continue; const d = ev.d; H.edh(d.commander); X.__d = d;
  const R = run('upgradePaths(__d)'), opts = R.paths.map(L => L.opts.apex).filter(Boolean).filter(p => !run('tags')(X.find(p.cut)).land), cur = opts.slice(0, 10); if (cur.length < 5) continue;
  const sim = run('simulate(__d, 200, 7)'), cuts = [...new Map(opts.slice(0, 25).map(p => [p.cut, p.cv])).entries()], adds = [...new Map(opts.slice(0, 25).map(p => [p.add, p.aq])).entries()];
  const evalSet = (C, A) => { const u = JSON.parse(JSON.stringify(d)); C.forEach(n => { X.__q = u; X.__a = n; run('cutCard(__q, __a, 1)'); }); A.forEach(n => { X.__q = u; X.__a = n; run('addCard(__q, __a, 1)'); }); X.__q = u; X.__s = sim; return run('evaluateDeck(__q, {sim:__s})').total; };
  const val = (C, A) => A.reduce((s, n) => s + new Map(adds).get(n), 0) - C.reduce((s, n) => s + new Map(cuts).get(n), 0);
  const obj = (C, A) => val(C, A) + MU * evalSet(C, A);
  let C = cur.map(p => p.cut), A = cur.map(p => p.add), best = obj(C, A), moved = true, it = 0;
  while (moved && it++ < 3){ moved = false;
    for (let i = 0; i < C.length; i++) for (const [n] of cuts){ if (C.includes(n)) continue; const C2 = C.slice(); C2[i] = n; const o = obj(C2, A); if (o > best + 1e-9){ best = o; C = C2; moved = true; } }
    for (let i = 0; i < A.length; i++) for (const [n] of adds){ if (A.includes(n)) continue; const A2 = A.slice(); A2[i] = n; const o = obj(C, A2); if (o > best + 1e-9){ best = o; A = A2; moved = true; } } }
  const kOf = n => ev.K.get(run('keyOf')(n)) || 0, aOf = n => ev.A.get(run('keyOf')(n)) || 0, ag = (C, A) => mean(A.map(aOf)) - mean(C.map(kOf));
  res.cur.ag.push(ag(cur.map(p => p.cut), cur.map(p => p.add))); res.jt.ag.push(ag(C, A)); res.cur.ev.push(evalSet(cur.map(p => p.cut), cur.map(p => p.add))); res.jt.ev.push(evalSet(C, A));
  const ch = A.filter(n => !cur.some(p => p.add === n)).length + C.filter(n => !cur.some(p => p.cut === n)).length; res.changed.push(ch);
  console.log(slug.padEnd(20), 'players agree: current', res.cur.ag.at(-1).toFixed(3), 'joint', res.jt.ag.at(-1).toFixed(3), '| evaluator: current', res.cur.ev.at(-1), 'joint', res.jt.ev.at(-1), '| changed', ch, ch ? '(in: ' + A.filter(n => !cur.some(p => p.add === n)).join(', ') + ' | out: ' + C.filter(n => !cur.some(p => p.cut === n)).join(', ') + ')' : '');
}
console.log('\nμ=' + MU + ' MEAN players-agree@10: current ' + mean(res.cur.ag).toFixed(3) + ', joint ' + mean(res.jt.ag).toFixed(3) + ' | evaluator: current ' + mean(res.cur.ev).toFixed(1) + ', joint ' + mean(res.jt.ev).toFixed(1) + ' | cards changed per deck ' + mean(res.changed).toFixed(1) + ' | decks ' + res.changed.length);
