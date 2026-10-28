// After the score check: no recommended swap (any tier, free, best-under-$X) lowers the deck score; how many paths remain.
const path = require('path'), H = require('./h.js')(path.resolve(process.argv[2])), X = H.ctx, run = H.run; if (process.env.UP){ X.__up = JSON.parse(process.env.UP); run('Object.assign(UP, __up)'); }
const slugs = 'doom-prevails,turtle-power,wakanda-forever,avengers-assemble,family-matters,limit-break,abzan-armor,counter-blitz,grand-larceny,squirreled-away'.split(',');
let tot = {paths0:0, paths:0, opts:0, bad:0, dropped:0, ms:0};
for (const s of slugs){ const d = H.retail(s); H.edh(d.commander); X.__d = d;
  const r = run(`(() => { const AR = apexRef(__d), base = evaluateDeck(__d, {games:300, apex:AR}), R = upgradePaths(__d), n0 = R.paths.length; const t = Date.now(); scoreCheck(__d, R, {apex:AR, base}); const ms = Date.now() - t; let opts = 0, bad = 0;
    for (const L of R.paths) for (const k in L.opts){ const p = L.opts[k]; opts++; const u = JSON.parse(JSON.stringify(__d)); cutCard(u, p.cut, p.q); addCard(u, p.add, p.q); const v = evaluateDeck(u, {apex:AR, games:300}).exact - base.exact; if (v <= 0){ bad++; (globalThis.__bad = globalThis.__bad || []).push([p.cut, p.add, p.dScore, +v.toFixed(2), !!p.repaired]); } }
    return {badList:globalThis.__bad || [], n0, n:R.paths.length, opts, bad, dropped:R.scored.dropped, refilled:R.scored.refilled, themed:R.scored.themed, ms}; })()`);
  console.log(s, JSON.stringify(r)); tot.paths0 += r.n0; tot.paths += r.n; tot.opts += r.opts; tot.bad += r.bad; tot.dropped += r.dropped; tot.refilled = (tot.refilled || 0) + r.refilled; tot.themed = (tot.themed || 0) + r.themed; tot.ms += r.ms; }
console.log('TOTAL', JSON.stringify(tot));
