// Score blind spots (2b): cards real players add to a precon (in UP to ADD of its upgraded copies) that the deck score rates
// below the floor when swapped for the cards players cut most. Lists each with the score parts that go down, so the misjudged
// effects can be found. node blind.js <engineDir> [set] ADD=0.25
const path = require('path'), which = process.argv[3] || 'tuneall'; process.argv = [process.argv[0], 'x', path.resolve(process.argv[2]), 'g', which, '--quiet'];
const B = require('./bench.js'), H = B.H, X = H.ctx, run = H.run; if (process.env.UP){ X.__up = JSON.parse(process.env.UP); run('Object.assign(UP, __up)'); }
const ADD = +(process.env.ADD || 0.25), KN = new Map(run('LIB').map(c => [c._k, c])), out = [], T = {n:0, low:0};
const sets = which === 'all' ? ['tuneall', 'test', 'holdout'] : [which];
for (const s of sets) for (const [slug, file] of B.SETS[s]){ const ev = B.evidence(slug, file), d = ev.d; H.edh(d.commander);
  const cuts = [...ev.K.entries()].sort((a, b) => a[1] - b[1]).slice(0, 4).map(([k]) => ev.P.get(k));
  const adds = [...ev.A.entries()].filter(([k, v]) => v >= ADD && KN.get(k)).map(([k, v]) => [KN.get(k).n, v]);
  X.__d = d; X.__cuts = cuts; X.__adds = adds;
  const r = run(`(() => { const AR = apexRef(__d), base = evaluateDeck(__d, {games:300, apex:AR}), ctx = ctxOf(__d), res = [];
    for (const [n, rate] of __adds){ const c = find(n); if (!c || tags(c).land || !c.ci.every(k => ctx.ident.includes(k)) || entryOf(__d, n)) continue; let best = null;
      for (const cut of __cuts){ const u = JSON.parse(JSON.stringify(__d)); cutCard(u, cut, 1); addCard(u, n, 1); const e = evaluateDeck(u, {apex:AR, sim:base.sim}), v = e.exact - base.exact;
        if (!best || v > best.v){ const parts = {}; for (const k in e.parts) if (e.parts[k] != null && base.parts[k] != null) parts[k] = +(e.parts[k] - base.parts[k]).toFixed(2); best = {v, cut, parts}; } }
      if (!best) continue; let fresh = null; if (best.v < 0.05){ const u = JSON.parse(JSON.stringify(__d)); cutCard(u, best.cut, 1); addCard(u, n, 1); fresh = +(evaluateDeck(u, {apex:AR, games:300}).exact - evaluateDeck(__d, {apex:AR, games:300}).exact).toFixed(2); }
      res.push({n, rate:+rate.toFixed(2), v:+best.v.toFixed(2), fresh, cut:best.cut, parts:best.parts, cmc:c.cmc, t:c.t, o:(c.o || '').slice(0, 220)}); }
    return res; })()`);
  r.forEach(x => { T.n++; if (x.v < 0.05){ T.low++; out.push(Object.assign({slug}, x)); } }); }
out.sort((a, b) => b.rate - a.rate).forEach(x => console.log(x.slug.padEnd(20), (Math.round(x.rate * 100) + '%').padStart(4), String(x.v).padStart(6), 'fresh', String(x.fresh).padStart(6), '|', x.n, '(cmc ' + x.cmc + ')', 'vs', x.cut, '|', Object.entries(x.parts).filter(([, v]) => v < 0).map(([k, v]) => k + ' ' + v).join(' '), '|', x.o.replace(/\n/g, ' / ')));
console.log('TOTAL popular adds measured ' + T.n + ', rated below the floor ' + T.low + ' (' + Math.round(100 * T.low / T.n) + '%)');
