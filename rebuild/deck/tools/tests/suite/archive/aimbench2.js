// Steering by the commander's own themes (EDHREC tags). For each deck and theme T: T's signature cards are those its builders
// play clearly more (theme rate ≥ 25% and ≥ 15 points above the commander's overall rate). The third of upgraded copies that
// run the most signature cards is T's group. Default = the commander's top 3 themes; aimed = T first, then the rest.
// Reports agreement with T's group (top-10 swaps) for both. node aimbench2.js <engineDir> [set]   (UP='{...}' overrides)
const path = require('path'), which = process.argv[3] || 'tuneall';
process.argv = [process.argv[0], 'x', path.resolve(process.argv[2]), 'aim2', which, '--quiet'];
const B = require('./bench.js'), H = B.H, X = H.ctx, run = H.run;
if (process.env.UP){ X.__up = JSON.parse(process.env.UP); run('Object.assign(UP, __up)'); }
const KN = new Map(run('LIB').map(c => [c._k, c])), mean = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0;
const list = which === 'all' ? B.SETS.tuneall.concat(B.SETS.test) : B.SETS[which];
const rows = [];
for (const [slug, file] of list){
  const ev = B.evidence(slug, file); if (ev.n < 60) continue;
  const d0 = ev.d; H.edh(d0.commander); const E = run('EDH'), tags = E.tags.filter(t => E.tmap[t.slug]).slice(0, 8);
  const def = tags.slice(0, 3).map(t => 'edh:' + t.slug);
  const spells = s => [...s].filter(k => KN.get(k) && !run('tags')(KN.get(k)).land);
  const play = (aims, K, A) => { const d = JSON.parse(JSON.stringify(d0)); d.aims = aims; X.__d = d; const R = run('upgradePaths(__d)');
    const sw = R.paths.map(L => L.opts.apex).filter(p => p && !run('tags')(X.find(p.cut)).land).slice(0, 10);
    return {ag:mean(sw.map(p => (A.get(run('keyOf')(p.add)) || 0) - (K.get(run('keyOf')(p.cut)) || 0))), adds:sw.map(p => p.add)}; };
  for (const t of tags){
    const tm = E.tmap[t.slug], sig = new Set(); tm.forEach((x, k) => { const c = run('IDX').get(k), all = c && run('edhOf')(E.map, c); if (c && x.inc >= 0.25 && x.inc - (all ? all.inc : 0) >= 0.15) sig.add(c._k); });
    if (sig.size < 5) continue;
    const dens = ev.up.map(s => { const sp = spells(s); return sp.filter(k => sig.has(k)).length / Math.max(1, sp.length); });
    const ord = dens.map((v, i) => [v, i]).sort((a, b) => b[0] - a[0]), g = ord.slice(0, Math.floor(ord.length / 3)).map(x => ev.up[x[1]]);
    const lean = mean(ord.slice(0, g.length).map(x => x[0])) - mean(dens); if (g.length < 20 || lean < 0.03) continue;
    const K = new Map(), A = new Map(); ev.P.forEach((n, k) => K.set(k, g.filter(s => s.has(k)).length / g.length));
    g.forEach(s => s.forEach(k => { const c = KN.get(k); if (!ev.P.has(k) && c && !run('tags')(c).land) A.set(k, (A.get(k) || 0) + 1); })); A.forEach((v, k) => A.set(k, v / g.length));
    const a0 = play(def, K, A), a1 = play(['edh:' + t.slug].concat(def.filter(x => x !== 'edh:' + t.slug)).slice(0, 3), K, A), gen = play(d0.aims.slice(), K, A);
    rows.push({slug, T:t.label, first:def[0] === 'edh:' + t.slug, group:g.length, lean, gen:gen.ag, def:a0.ag, aimed:a1.ag, changed:a1.adds.filter(x => !a0.adds.includes(x)).length});
  }
}
rows.forEach(r => console.log(r.slug.padEnd(20) + r.T.padEnd(20) + ' group ' + String(r.group).padStart(3) + ' lean +' + r.lean.toFixed(2) + ' | old aims ' + r.gen.toFixed(3).padStart(6) + ' | themes default ' + r.def.toFixed(3).padStart(6) + ' → this theme first ' + r.aimed.toFixed(3).padStart(6) + ' | top-10 changed ' + r.changed + (r.first ? '  (already first)' : '')));
const nf = rows.filter(r => !r.first);
console.log('\nTHEME NOT ALREADY FIRST (' + nf.length + '): agreement with that theme\'s players  default ' + mean(nf.map(r => r.def)).toFixed(3) + ' → theme first ' + mean(nf.map(r => r.aimed)).toFixed(3) + ' | better ' + nf.filter(r => r.aimed > r.def + 1e-9).length + ', worse ' + nf.filter(r => r.aimed < r.def - 1e-9).length + ' | avg top-10 changed ' + mean(nf.map(r => r.changed)).toFixed(1));
console.log('ALL (' + rows.length + '): old generic aims ' + mean(rows.map(r => r.gen)).toFixed(3) + ' | commander themes, default order ' + mean(rows.map(r => r.def)).toFixed(3));
