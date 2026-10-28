const path = require('path'), H = require('./h.js')(path.resolve(process.argv[2])), X = H.ctx, run = H.run;
for (const s of ['doom-prevails', 'turtle-power', 'limit-break', 'squirreled-away']){ const d = H.retail(s); H.edh(d.commander); X.__d = d;
  console.log(s, JSON.stringify(run(`(() => { const T = themeCtx(__d), AR = apexRef(__d), base = evaluateDeck(__d, {games:300, apex:AR}), R = upgradePaths(__d), out = {fam:[...T.fam], types:[...T.types], picks:0, onTheme:0, samples:[]};
    for (const L of R.paths) for (const t of ['apex','mid','budget']){ const p = L.opts[t]; if (!p) continue; out.picks++; if (themeOf(find(p.add), T)){ out.onTheme++; continue; }
      const vc = R.valOf(find(p.add)), vcu = R.valOf(find(p.cut)), A = altsFor(__d, p.add, {cut:p.cut, val:R.valOf, all:true}).filter(a => a.theme);
      if (out.samples.length < 4) out.samples.push({t, add:p.add, cut:p.cut, vc:+vc.toFixed(1), vcu:+vcu.toFixed(1), themeCands:A.slice(0, 3).map(a => a.n + ' ' + a.v + ' ' + a.theme), need:+(vc - 0.25 * Math.max(0, vc - vcu)).toFixed(1)}); }
    return out; })()`))); }
