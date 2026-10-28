// Card quality vs Apex: precons, real player decks (by declared power bracket), engine upgrades, generated decks.
const path = require('path'), fs = require('fs'), which = process.argv[3] || 'all', N = +(process.argv[4] || 25);
process.argv = [process.argv[0], 'x', path.resolve(process.argv[2]), 'q', 'all', '--quiet'];
const B = require('./bench.js'), H = B.H, X = H.ctx, run = H.run; if (process.env.QPOW) run('QPOW = ' + process.env.QPOW); const OID = new Map(run('LIB').filter(c => c.oid).map(c => [c.oid, c]));
const list = which === 'all' ? B.SETS.tuneall.concat(B.SETS.test, B.SETS.holdout) : B.SETS[which];
const CORP = ['corpus', 'corpus2', 'corpus3', 'corpus4'].map(x => path.resolve(__dirname, '../../' + x)), med = a => { const s = a.slice().sort((x, y) => x - y); return s[s.length >> 1]; }, mean = a => a.reduce((x, y) => x + y, 0) / a.length;
const all = {pre:[], up:[], gen:[], real:[], br:{2:[], 3:[], 4:[]}, pricey:[], cheap:[]}; let t0 = Date.now();
for (const [slug, file] of list){
  const pd = H.retail(slug); H.edh(pd.commander); X.__d = pd; const A = run('apexRef(__d)'); X.__a = A;
  const q = d => { X.__q = d; return run(process.env.VF ? '(() => { const vf = upgradePaths(__q).valOf, M = apexMeans(__a, __q, ctxOf(__q), vf); return qualityPct(spellMean(__q.cards, __q, ctxOf(__q), vf), M.apex, M.floor); })()' : '(() => { const M = apexMeans(__a, __q, ctxOf(__q)); return qualityPct(spellMean(__q.cards, __q, ctxOf(__q)), M.apex, M.floor); })()'); };
  const pre = q(pd);
  const R = run('upgradePaths(__d)'), u = JSON.parse(JSON.stringify(pd)); R.paths.map(L => L.opts.apex).filter(Boolean).forEach(p => { X.__u = u; X.__c = p.cut; X.__n = p.add; run('cutCard(__u, __c, 1); addCard(__u, __n, 1)'); }); const up = q(u);
  let decks = []; for (const dd of CORP){ const p = path.join(dd, file + '.jsonl'); if (fs.existsSync(p)){ decks = fs.readFileSync(p, 'utf8').split('\n').filter(Boolean).map(JSON.parse); break; } }
  const real = []; decks.filter(x => x.cards && x.cards.length >= 60).slice(0, N * 3).forEach(x => { const d = JSON.parse(JSON.stringify(pd)); d.cards = [];
    x.cards.forEach(([nm, qq, cats, uid]) => { if ((cats || []).some(c => /Commander|Maybeboard|Sideboard/.test(c))) return; const c = (uid && OID.get(uid)) || X.find(nm); if (!c || c.n === pd.commander || c.n === pd.partner) return; d.cards.push({n:c.n, q:qq || 1}); });
    const n = d.cards.reduce((a, e) => a + e.q, 0); if (n < 95 || n > 101) return; const v = q(d), price = d.cards.reduce((a, e) => a + ((X.find(e.n) || {}).p || 0) * e.q, 0); real.push({v, br:x.bracket, price}); });
  real.forEach(r => { all.real.push(r.v); if (all.br[r.br]) all.br[r.br].push(r.v); }); const ps = real.map(r => r.price).sort((a, b) => a - b); real.forEach(r => { if (r.price >= ps[Math.floor(ps.length * 0.75)]) all.pricey.push(r.v); if (r.price <= ps[Math.floor(ps.length * 0.25)]) all.cheap.push(r.v); });
  all.pre.push(pre); all.up.push(up);
  console.log(pd.commander.split(',')[0].slice(0, 14).padEnd(15), 'precon', String(pre).padStart(3) + '%', '| after engine upgrades', String(up).padStart(3) + '%', '| real decks median', String(med(real.map(r => r.v))).padStart(3) + '% (n=' + real.length + ')', '');
}
console.log('\nMEAN precon ' + mean(all.pre).toFixed(1) + '% | after engine upgrades ' + mean(all.up).toFixed(1) + '% (higher in ' + all.pre.filter((p, i) => all.up[i] > p).length + '/' + all.pre.length + ') | real decks median ' + med(all.real) + '% | by declared bracket 2/3/4: ' + [2, 3, 4].map(b => med(all.br[b]) + '% (n=' + all.br[b].length + ')').join(', ') + ' | cheapest quarter ' + med(all.cheap) + '%, priciest quarter ' + med(all.pricey) + '% | ' + Math.round((Date.now() - t0) / 1000) + 's');
