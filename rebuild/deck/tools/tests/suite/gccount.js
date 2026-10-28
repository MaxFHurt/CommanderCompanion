// Game Changers: how many the Apex upgrade list suggests vs how many strong (bracket 4+) upgraded copies add.
const path = require('path'), which = process.argv[3] || 'tuneall'; process.argv = [process.argv[0], 'x', path.resolve(process.argv[2]), 'g', which, '--quiet'];
const B = require('./bench.js'), H = B.H, X = H.ctx, run = H.run; if (process.env.UP){ X.__up = JSON.parse(process.env.UP); run('Object.assign(UP, __up)'); }
const KN = new Map(run('LIB').map(c => [c._k, c])); let S = {sug:0, rows:0, hit:0, strongGC:0, decks:0};
for (const [slug, file] of B.SETS[which]){ process.env.STRONG = '4'; const ev = B.evidence(slug, file), d = ev.d; H.edh(d.commander); X.__d = d; d.tier = 'apex';
  const R = run(process.env.SC ? '(() => { const R0 = upgradePaths(__d); try { scoreCheck(__d, R0, {apex:apexRef(__d)}); } catch (e) {} return R0; })()' : 'upgradePaths(__d)'), adds = R.paths.map(L => L.opts.apex).filter(Boolean).map(p => X.find(p.add)).filter(Boolean), gc = adds.filter(c => c.gc);
  const top = [...ev.A.entries()].filter(([k]) => KN.get(k) && KN.get(k).gc).sort((a, b) => b[1] - a[1]);
  const popGC = top.filter(([, v]) => v >= 0.25).map(([k]) => KN.get(k).n), hit = gc.filter(c => popGC.includes(c.n)).length;
  S.sug += gc.length; S.rows += adds.length; S.hit += hit; S.strongGC += popGC.length; S.decks++;
  console.log(slug.padEnd(20), 'strong n=' + ev.n, 'suggested GC', gc.length + '/' + adds.length, gc.map(c => c.n).join(', '), '| GCs in 25%+ of strong copies:', popGC.join(', ') || '-', '| hit', hit); }
console.log('TOTAL suggested GC ' + S.sug + ' of ' + S.rows + ' apex picks | popular strong GCs ' + S.strongGC + ' | suggested & popular ' + S.hit);
