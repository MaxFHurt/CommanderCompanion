// Top swaps for one deck, with players' evidence. node topswaps.js <engineDir> <set> <slug> [n]   UP='{...}'
const path = require('path'), [, , dir, set, slug, nn] = process.argv;
process.argv = [process.argv[0], 'x', path.resolve(dir), 'g', set, '--quiet']; const B = require('./bench.js'), H = B.H, X = H.ctx, run = H.run;
if (process.env.UP){ X.__up = JSON.parse(process.env.UP); run('Object.assign(UP, __up)'); }
const [s, file] = B.SETS[set].find(x => x[0] === slug), ev = B.evidence(s, file), d = ev.d; H.edh(d.commander); X.__d = d; d.tier = 'apex';
const R = run('(() => { const R0 = upgradePaths(__d); scoreCheck(__d, R0, {apex:apexRef(__d)}); return R0; })()'), ko = run('keyOf');
const e = run('evaluateDeck(__d, {games:300})'); console.log('synergy raw', e.raw.synergy, 'exact', e.exact, 'cmp', e.cmp);
R.paths.slice(0, +(nn || 10)).forEach((L, i) => { const p = run('tierPick')(L, 'apex') || L.opts.apex; if (!p) return; console.log(String(i + 1).padStart(2), (p.cut + ' -> ' + p.add).padEnd(60), 'd', p.dScore, '| keep', ((ev.K.get(ko(p.cut)) || 0)).toFixed(2), 'add', ((ev.A.get(ko(p.add)) || 0)).toFixed(2)); });
