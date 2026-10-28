// Ceiling and crowd view: the score an engine copying the crowd exactly would get with N swaps, plus what players
// cut and add most. node oracle.js <slug> [N]
const path = require('path'), slug = process.argv[2], N = +(process.argv[3] || 15);
process.argv = [process.argv[0], 'x', path.resolve(__dirname, '../candidate'), 'oracle', 'all', '--quiet'];
const B = require('./bench.js'), file = B.SETS.test.concat(B.SETS.tune).find(x => x[0] === slug)[1];
const ev = B.evidence(slug, file), names = new Map();
ev.P.forEach((n, k) => names.set(k, n));
const KN = new Map(B.H.run('LIB').map(c => [c._k, c.n])), nm = k => names.get(k) || KN.get(k) || k;
const cuts = [...ev.K.entries()].sort((a, b) => a[1] - b[1]), adds = [...ev.A.entries()].sort((a, b) => b[1] - a[1]);
let s = 0; for (let i = 0; i < N; i++) s += adds[i][1] - cuts[i][1];
console.log(slug, 'upgraded copies', ev.n, '| crowd-ceiling score with', N, 'swaps:', s.toFixed(2));
console.log('\nLeast kept precon cards:'); cuts.slice(0, 25).forEach(([k, v]) => console.log('  ' + String(Math.round(v * 100)).padStart(3) + '%  ' + nm(k)));
console.log('\nMost added cards:'); adds.slice(0, 30).forEach(([k, v]) => console.log('  ' + String(Math.round(v * 100)).padStart(3) + '%  ' + nm(k)));
