// Deck-score change of every recommended swap (evaluator with the deck's own practice games and Apex reference).
const path = require('path'), H = require('./h.js')(path.resolve(process.argv[2])), X = H.ctx, run = H.run;
const slugs = (process.argv[3] || 'doom-prevails,turtle-power,wakanda-forever,avengers-assemble,family-matters,limit-break').split(',');
let all = [];
for (const s of slugs){ const d = H.retail(s); H.edh(d.commander); X.__d = d;
  const r = run(`(() => { const AR = apexRef(__d), base = evaluateDeck(__d, {games:300, apex:AR}), sim = base.sim, R = upgradePaths(__d), out = []; const t0 = Date.now(); let n = 0;
    for (const L of R.paths) for (const t of ['apex', 'mid', 'budget', 'free']){ const p = L.opts[t]; if (!p) continue; const u = JSON.parse(JSON.stringify(__d)); cutCard(u, p.cut, p.q); addCard(u, p.add, p.q); n++;
      const e = evaluateDeck(u, {apex:AR, sim}); out.push({t, cut:p.cut, add:p.add, gain:p.gain, d:+(e.exact - base.exact).toFixed(2), dq:e.parts.quality - base.parts.quality, ds:e.parts.synergy - base.parts.synergy, db:e.parts.balance - base.parts.balance, dr:e.parts.routes - base.parts.routes}); }
    return {base:base.total, ms:Math.round((Date.now() - t0) / Math.max(1, n)), out}; })()`);
  const neg = r.out.filter(x => x.d < 0), zero = r.out.filter(x => x.d === 0);
  console.log(s, 'score', r.base, 'swaps', r.out.length, 'lower', neg.length, 'same', zero.length, 'ms/eval', r.ms);
  neg.slice(0, 4).forEach(x => console.log('   ', x.t, x.cut, '->', x.add, 'gain', x.gain, 'score', x.d, JSON.stringify({q:x.dq, s:x.ds, b:x.db, r:x.dr})));
  all = all.concat(r.out); }
console.log('TOTAL', all.length, 'lower', all.filter(x => x.d < 0).length, 'same', all.filter(x => x.d === 0).length, 'higher', all.filter(x => x.d > 0).length);
const b = x => x.d < 0 ? 'neg' : x.d < 0.3 ? '0-0.3' : x.d < 1 ? '0.3-1' : x.d < 2 ? '1-2' : '2+'; const h = {}; all.forEach(x => h[b(x)] = (h[b(x)] || 0) + 1); console.log(JSON.stringify(h));
