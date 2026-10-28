const path = require('path'), H = require('./h.js')(path.resolve(process.argv[2])), X = H.ctx, run = H.run;
if (process.env.UP){ X.__up = JSON.parse(process.env.UP); run('Object.assign(UP, __up)'); }
const d = H.retail(process.argv[3] || 'avengers-assemble'); d.tier = 'apex'; H.edh(d.commander); X.__d = d;
const R = run('(() => { const R0 = upgradePaths(__d); scoreCheck(__d, R0, {apex:apexRef(__d)}); return R0; })()');
console.log((process.env.UP || '{}').padEnd(40), 'paths', R.paths.length, 'alts', R.paths.map(L => Object.values(L.alts || {}).flat().length).reduce((a, b) => a + b, 0), 'trimmed', R.scored && R.scored.trimmed, 'dropped', R.scored && R.scored.dropped);
