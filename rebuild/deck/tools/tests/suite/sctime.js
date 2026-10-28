const path = require('path'), [, , dir, slug] = process.argv; process.argv = [process.argv[0], 'x', path.resolve(dir), 'g', 'test', '--quiet']; const B = require('./bench.js'), H = B.H, X = H.ctx, run = H.run;
if (process.env.UP){ X.__up = JSON.parse(process.env.UP); run('Object.assign(UP, __up)'); }
const [s, f] = B.SETS.test.find(x => x[0] === (slug || 'wakanda-forever')), ev = B.evidence(s, f), d = ev.d; H.edh(d.commander); X.__d = d; d.tier = 'apex';
run('__ar = apexRef(__d); __b = evaluateDeck(__d, {apex:__ar, games:300})'); const t0 = Date.now(); run('(() => { const R = upgradePaths(__d); scoreCheck(__d, R, {apex:__ar, base:__b}); return 0; })()'); console.log(dir, process.env.UP || '', 'scoreCheck ms', Date.now() - t0);
