// Deck-engineering check: the deck before and after its whole Apex package. node structure.js <engineDir> [tune|test|all]
const path = require('path'), which = process.argv[3] || 'all'; process.argv = [process.argv[0], 'x', path.resolve(process.argv[2]), 'st', which, '--quiet'];
const B = require('./bench.js'), H = B.H, X = H.ctx, run = H.run, list = which === 'all' ? B.SETS.tune.concat(B.SETS.test) : B.SETS[which];
const facts = d => { X.__q = d; return run(`(() => { const A = analyze(__q), ctx = A.ctx; let plan = 0, ft = 0; __q.cards.forEach(e => { const c = find(e.n); if (!c || tags(c).land) return; if ((__q.aims || []).some(a => matchAim(c, a, ctx.tribe) >= 0.7) || ctx.cmdThemes.some(a => matchAim(c, a, ctx.cmdTribe) >= 1)) plan += e.q; });
  return {lands:A.lands, ramp:A.roles.ramp, draw:A.roles.draw, removal:A.roles.removal, wipe:A.roles.wipe, avg:+A.avg.toFixed(2), plan, T:A.T}; })()`); };
console.log('deck'.padEnd(20) + 'swaps  lands  ramp     draw     removal  wipes   avg cmc     on-plan cards');
for (const [slug] of list){
  const d = H.retail(slug); H.edh(d.commander); X.__d = d; const R = run('upgradePaths(__d)'), b = facts(d);
  const d2 = JSON.parse(JSON.stringify(d)); R.paths.forEach(L => { const p = L.opts.apex; if (!p) return; X.__d2 = d2; X.__p = p; run('cutCard(__d2, __p.cut, 1); addCard(__d2, __p.add, 1)'); });
  const a = facts(d2), f = k => (b[k] + '→' + a[k]).padEnd(9);
  console.log(slug.padEnd(20) + String(R.paths.filter(L => L.opts.apex).length).padEnd(7) + f('lands') + f('ramp') + f('draw') + f('removal') + f('wipe') + (b.avg + '→' + a.avg).padEnd(12) + b.plan + '→' + a.plan, ' (targets ramp ' + b.T.ramp + ' draw ' + b.T.draw + ' removal ' + b.T.removal + ' wipes ' + b.T.wipe + ')');
}
