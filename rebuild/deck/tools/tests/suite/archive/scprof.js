const path = require('path'), H = require('./h.js')(path.resolve(process.argv[2])), X = H.ctx, run = H.run;
const d = H.retail('limit-break'); H.edh(d.commander); X.__d = d;
console.log(run(`(() => { const AR = apexRef(__d), base = evaluateDeck(__d, {games:300, apex:AR}), R = upgradePaths(__d); let n = 0, te = 0, ta = 0; const se = swapScore, af = altsFor;
  swapScore = function(){ n++; const t = Date.now(); const r = se.apply(null, arguments); te += Date.now() - t; return r; };
  altsFor = function(){ const t = Date.now(); const r = af.apply(null, arguments); ta += Date.now() - t; return r; }; altsFor.pool = af.pool;
  const t = Date.now(); scoreCheck(__d, R, {apex:AR, base}); return JSON.stringify({total:Date.now() - t, evals:n, evalMs:te, altMs:ta}); })()`));
