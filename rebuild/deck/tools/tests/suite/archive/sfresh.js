const path = require('path'), H = require('./h.js')(path.resolve(process.argv[2])), X = H.ctx, run = H.run;
for (const s of ['limit-break', 'wakanda-forever']){ const d = H.retail(s); H.edh(d.commander); X.__d = d;
  console.log(s, JSON.stringify(run(`(() => { const AR = apexRef(__d); let t = Date.now(); const base = evaluateDeck(__d, {games:300, apex:AR}); const simMs = Date.now() - t; const R = upgradePaths(__d), out = [];
    for (const L of R.paths.slice(0, 8)) { const p = L.opts.apex; if (!p) continue; const u = JSON.parse(JSON.stringify(__d)); cutCard(u, p.cut, p.q); addCard(u, p.add, p.q);
      const a = evaluateDeck(u, {apex:AR, sim:base.sim}).total - base.total, b = evaluateDeck(u, {apex:AR, games:300}).total - base.total; out.push([p.add.slice(0, 18), a, b]); }
    return {simMs, base:base.total, mana:base.parts.mana, out}; })()`))); }
