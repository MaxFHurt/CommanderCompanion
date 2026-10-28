// Is a strength-weighted yardstick trustworthy? For every precon: coverage (upgraded copies that declare bracket 3+), validity
// (do the cards it promotes look stronger: Game Changers, tournament staples, Commander-wide rank; overlap with what bracket 3+
// decks alone add) and stability (do its top cards survive resampling). node wcheck.js <engineDir> [a,b ...]
const path = require('path'); process.argv = [process.argv[0], 'x', path.resolve(process.argv[2]), 'w', 'all', '--quiet', ...process.argv.slice(3)];
const B = require('./bench.js'), H = B.H, X = H.ctx, run = H.run, cfgs = process.argv.slice(6).length ? process.argv.slice(6) : ['1,1', '2,3', '3,6'];
const LIB = new Map(run('LIB').map(c => [c._k, c])), mean = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0, TOP = 20;
const sets = B.SETS.tuneall.concat(B.SETS.test, B.SETS.holdout), res = {};
const rnd = (() => { let x = 777; return () => (x = (x * 1103515245 + 12345) % 2147483648) / 2147483648; })();
const topOf = (up, P, W) => { const A = new Map(); let T = 0; up.forEach(s => { const w = W(s); T += w; s.forEach(k => { if (!P.has(k)) { const c = LIB.get(k); if (c && !run('tags')(c).land) A.set(k, (A.get(k) || 0) + w); } }); }); return [...A.entries()].sort((a, b) => b[1] - a[1]).slice(0, TOP).map(([k]) => k); };
const sig = ks => { const cs = ks.map(k => LIB.get(k)).filter(Boolean); return {gc:mean(cs.map(c => c.gc ? 1 : 0)), tour:mean(cs.map(c => run('TOURNEY_OF').has(c._n) ? 1 : 0)), rank:mean(cs.map(c => c.r ? Math.log10(c.r) : 4.5))}; };
const cov = [];
for (const [slug, file] of sets){ process.env.WEIGHT = ''; const ev = B.evidence(slug, file), up = ev.up, P = ev.P, strong = up.filter(s => s.br >= 3);
  cov.push({slug, up:up.length, b3:strong.length});
  const strongTop = new Set(topOf(strong, P, () => 1));
  for (const cfg of cfgs){ const [a, b] = cfg.split(',').map(Number), W = s => s.br >= 4 ? b : s.br === 3 ? a : 1, top = topOf(up, P, W), sg = sig(top);
    let stab = 0; for (let i = 0; i < 60; i++){ const smp = Array.from({length:up.length}, () => up[Math.floor(rnd() * up.length)]), t2 = new Set(topOf(smp, P, W)); stab += top.filter(k => t2.has(k)).length / TOP; }
    const r = res[cfg] = res[cfg] || {gc:[], tour:[], rank:[], strongOverlap:[], stab:[]};
    r.gc.push(sg.gc); r.tour.push(sg.tour); r.rank.push(sg.rank); r.strongOverlap.push(strong.length >= 8 ? top.filter(k => strongTop.has(k)).length / TOP : null); r.stab.push(stab / 60); } }
console.log('coverage (upgraded copies / of them bracket 3+):', cov.map(x => x.slug.slice(0, 10) + ' ' + x.up + '/' + x.b3).join(', '));
console.log('weights(b3,b4+)  topGC  topTourney  topRank(log10, lower=more played)  overlapWithBracket3+Only  stability');
for (const cfg of cfgs){ const r = res[cfg], so = r.strongOverlap.filter(x => x != null);
  console.log(cfg.padEnd(16), mean(r.gc).toFixed(3).padEnd(6), mean(r.tour).toFixed(3).padEnd(11), mean(r.rank).toFixed(3).padEnd(35), (mean(so).toFixed(3) + ' (' + so.length + ' decks)').padEnd(25), mean(r.stab).toFixed(3)); }
