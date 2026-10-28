// Top of the engine's addition ranking vs players' add rates. node addview.js <slug> [n]
const path = require('path'), slug = process.argv[2], n = +(process.argv[3] || 20);
process.argv = [process.argv[0], 'x', path.resolve(__dirname, '../candidate'), 'av', 'all', '--quiet'];
const B = require('./bench.js'), H = B.H, X = H.ctx, run = H.run, f = B.SETS.test.concat(B.SETS.tune).find(x => x[0] === slug)[1];
const ev = B.evidence(slug, f); H.edh(ev.d.commander); X.__d = ev.d; if (process.env.UP){ X.__up = JSON.parse(process.env.UP); run('Object.assign(UP, __up)'); }
const R = run('upgradePaths(__d)'), KN = new Map(run('LIB').map(c => [c._k, c]));
const added = new Set(R.paths.map(L => L.opts.apex && L.opts.apex.add).filter(Boolean).map(x => run('keyOf')(x)));
R._dbg.pool.sort((a, b) => b.v - a.v).slice(0, n).forEach(p => { const c = KN.get(p.k), e = run('EDH').map.get(c._n);
  console.log((added.has(p.k) ? 'ADD ' : '    ') + c.n.padEnd(34) + ' v ' + String(p.v).padStart(5) + ' | players add ' + String(Math.round((ev.A.get(p.k) || 0) * 100)).padStart(3) + '% | EDHREC inc ' + (e ? Math.round(e.inc * 100) + '% syn ' + e.syn : '-') + ' | $' + (c.p == null ? '?' : c.p) + ' ' + [...run('tags')(c).roles].join('/')); });
