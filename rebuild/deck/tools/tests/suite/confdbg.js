const path = require('path'); process.argv = [process.argv[0], 'x', path.resolve('../cand6'), 'g', 'holdout', '--quiet']; const B = require('./bench.js'), H = B.H, X = H.ctx, run = H.run;
X.__up = JSON.parse(process.env.UP || '{}'); run('Object.assign(UP, __up)');
for (const [slug, file] of B.SETS.holdout.slice(0, 6)){ const ev = B.evidence(slug, file), d = ev.d; H.edh(d.commander); X.__d = d; d.tier = 'apex';
  const r = run('(() => { const R = upgradePaths(__d); scoreCheck(__d, R, {apex:apexRef(__d)}); return {n:R.paths.length, drop:R.confDrop || []}; })()'); console.log(slug, r.n, JSON.stringify(r.drop)); }
