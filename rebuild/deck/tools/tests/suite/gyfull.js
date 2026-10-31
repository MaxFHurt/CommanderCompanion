// The app's whole Upgrades pipeline (check, theme, whole-card search, promote), then: rows, each row's Apex and its gain,
// total Apex gain, and whether named cards are offered. UP overrides from env UP='{"poolX":60}'.
const path = require('path'), H = require('./h.js')(path.resolve(process.argv[2])), X = H.ctx, run = H.run;
if (process.env.UP){ X.__up = JSON.parse(process.env.UP); run('Object.assign(UP, __up)'); }
const d = H.retail(process.argv[3]); H.edh(d.commander); d.tier = 'apex'; X.__d = d; X.__w = (process.argv[4] || '').split('|').filter(Boolean);
const t0 = Date.now();
const r = run(`(() => { const AR = apexRef(__d), base = evaluateDeck(__d, {games:300, apex:AR}); upgradePaths.own = null; const R = upgradePaths(__d); scoreCheck(__d, R, {apex:AR, base}); stickTheme(__d, R);
  const S0 = poolScout(__d, R); if (S0) poolScoutApply(R, S0, S0.keys.map(k => R.dOf(k[0], k[1], k[2]))); const Q = poolQueue(__d, R); if (Q) { while (Q.r < Q.rows.length) poolStep(Q, 1e9); poolPromote(Q, __d); stickTheme(__d, R); }
  const rows = R.paths.filter(L => L.opts.apex).map(L => [L.cut, L.opts.apex.add, L.opts.apex.dScore]);
  const offered = new Set(R.paths.flatMap(L => Object.values(L.opts).filter(Boolean).map(p => norm(p.add))));
  return {rows, n: rows.length, sum: +rows.reduce((s, x) => s + (x[2] || 0), 0).toFixed(2), measured: (Q ? Q.total : 0) + (S0 ? S0.keys.length : 0), scout: (R.scout||[]).slice(0,40), offered: __w.map(n => [n, offered.has(norm(n))])}; })()`);
r.ms = Date.now() - t0; console.log(JSON.stringify(r));
