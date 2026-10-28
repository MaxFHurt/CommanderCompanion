// What upgraders do with lands: keep rate of each precon land, add rate of each new land. node lands.js <slug>
const path = require('path'), fs = require('fs'), slug = process.argv[2]; process.argv = [process.argv[0], 'x', path.resolve(__dirname, '../candidate'), 'l', 'all', '--quiet'];
const B = require('./bench.js'), H = B.H, run = H.run, X = H.ctx, file = B.SETS.tuneall.concat(B.SETS.test, B.SETS.holdout).find(x => x[0] === slug)[1];
const ev = B.evidence(slug, file), d = ev.d, KN = new Map(run('LIB').map(c => [c._k, c])), isL = k => KN.get(k) && run('tags')(KN.get(k)).land;
const PL = new Map(); d.cards.forEach(e => { const c = X.find(e.n); if (c && run('tags')(c).land && !run('isBasic')(c.n)) PL.set(c._k, c.n); });
const keep = [...PL].map(([k, n]) => [n, ev.up.filter(s => s.has(k)).length / ev.n]).sort((a, b) => a[1] - b[1]);
const addL = new Map(); ev.up.forEach(s => s.forEach(k => { if (!PL.has(k) && isL(k) && !run('isBasic')(KN.get(k).n)) addL.set(k, (addL.get(k) || 0) + 1); }));
const basics = ev.up.map(s => [...s].filter(k => KN.get(k) && run('isBasic')(KN.get(k).n)).length);
console.log(slug, 'copies', ev.n, '| precon nonbasic lands', PL.size);
console.log('kept:', keep.map(([n, v]) => n + ' ' + Math.round(v * 100) + '%').join('; '));
console.log('added:', [...addL].sort((a, b) => b[1] - a[1]).slice(0, 18).map(([k, v]) => KN.get(k).n + ' ' + Math.round(100 * v / ev.n) + '% $' + KN.get(k).p).join('; '));
