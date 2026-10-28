// Players' choice: how many picks per deck are kept as Players' choice, and how often real players add them (vs the score-raising picks).
const path = require('path'), which = process.argv[3] || 'tuneall'; process.argv = [process.argv[0], 'x', path.resolve(process.argv[2]), 'g', which, '--quiet'];
const B = require('./bench.js'), H = B.H, X = H.ctx, run = H.run; if (process.env.UP){ X.__up = JSON.parse(process.env.UP); run('Object.assign(UP, __up)'); }
const T = {pc:0, pcHit:0, sc:0, scHit:0, decks:0};
for (const [slug, file] of B.SETS[which]){ const ev = B.evidence(slug, file), d = ev.d; H.edh(d.commander); X.__d = d; d.tier = 'apex';
  const R = run('(() => { const R0 = upgradePaths(__d); try { scoreCheck(__d, R0, {apex:apexRef(__d)}); } catch (e) {} return R0; })()');
  const picks = R.paths.flatMap(L => ['apex', 'mid', 'budget'].map(t => L.opts[t]).filter(Boolean)), key = n => { const c = X.find(n); return c ? c._k : ''; };
  const pc = picks.filter(p => p.pc).concat(R.paths.flatMap(L => Object.values(L.alts || {}).flat().filter(a => a.pc).map(a => ({cut:L.cut, add:a.n, dScore:a.dScore, pcInc:a.inc})))), sc = picks.filter(p => !p.pc), hit = p => (ev.A.get(key(p.add)) || 0) > 0;
  T.pc += pc.length; T.pcHit += pc.filter(hit).length; T.sc += sc.length; T.scHit += sc.filter(hit).length; T.decks++;
  console.log(slug.padEnd(22), 'players-choice', pc.length, pc.map(p => p.cut + ' > ' + p.add + ' (' + p.dScore + ', ' + Math.round(p.pcInc * 100) + '%' + (hit(p) ? ', players add it' : '') + ')').join('; ')); }
console.log('TOTAL players-choice picks ' + T.pc + ' (' + (T.pc / T.decks).toFixed(1) + ' per deck), added by real players ' + T.pcHit + ' (' + Math.round(100 * T.pcHit / Math.max(1, T.pc)) + '%) | score-raising picks ' + T.sc + ', added by players ' + T.scHit + ' (' + Math.round(100 * T.scHit / Math.max(1, T.sc)) + '%)');
