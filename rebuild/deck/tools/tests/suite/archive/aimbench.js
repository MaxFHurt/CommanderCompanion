// Does aiming a mechanic steer the build toward what players who built that way did?
// For each deck and mechanic M: the third of upgraded copies that lean hardest into M (share of their spells that do M) is
// M's group. The engine is run with its default aims and with M ranked first; both are scored against M's group.
// node aimbench.js <engineDir> [set] [--show]      (UP='{...}' overrides engine settings as in bench.js)
const path = require('path'), which = process.argv[3] || 'tuneall', show = process.argv.includes('--show');
process.argv = [process.argv[0], 'x', path.resolve(process.argv[2]), 'aim', which, '--quiet'];
const B = require('./bench.js'), H = B.H, X = H.ctx, run = H.run;
if (process.env.UP){ X.__up = JSON.parse(process.env.UP); run('Object.assign(UP, __up)'); }
const KN = new Map(run('LIB').map(c => [c._k, c])), THEMES = run('THEMES'), mean = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0;
const list = which === 'all' ? B.SETS.tuneall.concat(B.SETS.test) : B.SETS[which];
const rows = [];
for (const [slug, file] of list){
  const ev = B.evidence(slug, file); if (ev.n < 60) continue;
  const d0 = ev.d; H.edh(d0.commander); const tribe = d0.tribe;
  const keys = Object.keys(THEMES).filter(k => k !== 'control' && k !== 'draw' && THEMES[k].re || k === 'tribal' && tribe);
  const mcache = new Map(), match = (k, T) => { const id = T + '|' + k; if (!mcache.has(id)){ const c = KN.get(k); mcache.set(id, !!c && !run('tags')(c).land && run('matchAim')(c, T, tribe) >= 0.7); } return mcache.get(id); };
  for (const T of keys){
    const dens = ev.up.map(s => { const sp = [...s].filter(k => KN.get(k) && !run('tags')(KN.get(k)).land); return sp.filter(k => match(k, T)).length / Math.max(1, sp.length); });
    const ord = dens.map((v, i) => [v, i]).sort((a, b) => b[0] - a[0]), g = ord.slice(0, Math.floor(ord.length / 3)).map(x => ev.up[x[1]]);
    const lift = mean(ord.slice(0, g.length).map(x => x[0])) - mean(dens); if (g.length < 20 || lift < 0.04) continue;   // no distinct group of players for M
    const K = new Map(), A = new Map(); ev.P.forEach((n, k) => K.set(k, g.filter(s => s.has(k)).length / g.length));
    g.forEach(s => s.forEach(k => { const c = KN.get(k); if (!ev.P.has(k) && c && !run('tags')(c).land) A.set(k, (A.get(k) || 0) + 1); })); A.forEach((v, k) => A.set(k, v / g.length));
    const score = aims => { const d = JSON.parse(JSON.stringify(d0)); d.aims = aims; X.__d = d; const R = run('upgradePaths(__d)');
      const sw = R.paths.map(L => L.opts.apex).filter(p => p && !run('tags')(X.find(p.cut)).land).slice(0, 10);
      const ag = mean(sw.map(p => (A.get(run('keyOf')(p.add)) || 0) - (K.get(run('keyOf')(p.cut)) || 0)));
      const onM = mean(sw.map(p => match(run('keyOf')(p.add), T) ? 1 : 0));
      return {ag, onM, adds:sw.map(p => p.add)}; };
    const def = score(d0.aims.slice()), aimed = score([T].concat(d0.aims.filter(x => x !== T)).slice(0, 3));
    rows.push({slug, T, group:g.length, lift:+lift.toFixed(2), def:+def.ag.toFixed(3), aimed:+aimed.ag.toFixed(3), onDef:+def.onM.toFixed(2), onAim:+aimed.onM.toFixed(2), isDefault:d0.aims[0] === T, changed:aimed.adds.filter(x => !def.adds.includes(x)).length});
    if (show) console.log(slug, T, 'new adds:', aimed.adds.filter(x => !def.adds.includes(x)).join(', '));
  }
}
rows.forEach(r => console.log(r.slug.padEnd(20) + r.T.padEnd(13) + ' group ' + String(r.group).padStart(3) + ' lean +' + r.lift.toFixed(2) + ' | agreement default ' + r.def.toFixed(3).padStart(6) + ' aimed ' + r.aimed.toFixed(3).padStart(6) + ' | on-mechanic adds ' + r.onDef + ' → ' + r.onAim + ' | top-10 changed ' + r.changed + (r.isDefault ? '  (already first)' : '')));
const nd = rows.filter(r => !r.isDefault);
console.log('\nMECHANIC NOT ALREADY FIRST (' + nd.length + ' cases): agreement with that group  default ' + mean(nd.map(r => r.def)).toFixed(3) + ' → aimed ' + mean(nd.map(r => r.aimed)).toFixed(3) + ' | aimed better in ' + nd.filter(r => r.aimed > r.def).length + ', worse in ' + nd.filter(r => r.aimed < r.def).length +
  ' | on-mechanic share of top-10 adds ' + mean(nd.map(r => r.onDef)).toFixed(2) + ' → ' + mean(nd.map(r => r.onAim)).toFixed(2) + ' | avg top-10 cards changed ' + mean(nd.map(r => r.changed)).toFixed(1));
