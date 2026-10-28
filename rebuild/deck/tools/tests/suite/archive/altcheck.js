// See alternatives across decks: rules hold for every alternative of every upgrade option and of 12 plan slots per generated deck.
const path = require('path'), H = require('./h.js')(path.resolve(process.argv[2])), X = H.ctx, run = H.run;
const slugs = ['abzan-armor', 'calling-all-angels', 'counter-blitz', 'family-matters', 'grand-larceny', 'limit-break', 'squirreled-away', 'temur-roar', 'wakanda-forever', 'turtle-power'];
let opts = 0, alts = 0, empty = 0, bad = [], ms = 0, maxMs = 0;
for (const s of slugs){ const d = H.retail(s); H.edh(d.commander); X.__d = d;
  const r = run(`(() => { const R = upgradePaths(__d), skip = R.paths.flatMap(L => Object.values(L.opts).map(o => o.add)), id = ctxOf(__d).ident, out = [];
    for (const L of R.paths) for (const t of ['apex', 'mid', 'budget']){ const p = L.opts[t]; if (!p) continue; const t0 = Date.now(), A = altsFor(__d, p.add, {cut:p.cut, val:R.valOf, skip}), dt = Date.now() - t0, j = mainJob(p.add), b = priceBand(find(p.add).p), vc = R.valOf(find(p.cut));
      const errs = A.filter(a => { const c = find(a.n); return priceBand(c.p) !== b || (j && !jobsOf(a.n).includes(j)) || R.valOf(c) <= vc || __d.cards.some(e => e.n === a.n) || skip.includes(a.n) || !c.ci.every(k => id.includes(k)) || !legalIn(c, 'commander') || (b === 'apex' && find(p.add).p != null && c.p > 2 * find(p.add).p); }).map(a => p.add + ' -> ' + a.n);
      out.push({n:A.length, dt, errs}); }
    const g = {id:'g', name:'g', format:'commander', commander:'', tier:'apex', aims:[], tribe:'', colors:[], cards:[], dismissed:[]}; setCommander(g, __d.commander); g.aims = ctxOf(g).cmdThemes.slice(0, 3); g.plan = buildPlan(g, [], null, new Set());
    const deck = g.plan.map(y => ({n:y.a, q:y.q})), sk = g.plan.flatMap(y => [y.m, y.b]).filter(Boolean);
    g.plan.filter(x => !x.basic).slice(0, 12).forEach(x => ['a', 'm', 'b'].forEach(k => { const n = x[k]; if (!n) return; const t0 = Date.now(), A = altsFor(g, n, {deck, skip:sk}), dt = Date.now() - t0, j = mainJob(n), b = priceBand(find(n).p);
      out.push({n:A.length, dt, errs:A.filter(a => { const c = find(a.n); return priceBand(c.p) !== b || (j && !jobsOf(a.n).includes(j)) || deck.some(e => e.n === a.n) || sk.includes(a.n); }).map(a => n + ' -> ' + a.n)}); }));
    return out; })()`);
  r.forEach(x => { opts++; alts += x.n; if (!x.n) empty++; bad.push(...x.errs); ms += x.dt; maxMs = Math.max(maxMs, x.dt); }); }
console.log({decks:slugs.length, picks:opts, avgAlts:+(alts / opts).toFixed(2), noAlts:empty, ruleBreaks:bad.length, avgMs:Math.round(ms / opts), maxMs}); if (bad.length) console.log(bad.slice(0, 10));
