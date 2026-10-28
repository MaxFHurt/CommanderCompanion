// Consensus upgrades: the stock precon with its K most-cut nonland cards swapped for the K most-added nonland cards across
// real players' copies. A calibrated deck score should rate these at or above the stock deck. node consensus.js <dir> <set>
const path = require('path'), fs = require('fs'); const which = process.argv[3] || 'tuneall';
process.argv = [process.argv[0], 'x', path.resolve(process.argv[2]), 'c', which, '--quiet']; const B = require('./bench.js'), H = B.H, X = H.ctx, run = H.run;
if (process.env.EV){ X.__ev = JSON.parse(process.env.EV); run('Object.assign(EVK, __ev)'); }
const CORP = ['corpus', 'corpus2', 'corpus3', 'corpus4'].map(x => path.resolve(__dirname, '../../' + x));
const corpusOf = f => { for (const d of CORP){ const p = path.join(d, f + '.jsonl'); if (fs.existsSync(p)) return fs.readFileSync(p, 'utf8').split('\n').filter(Boolean).map(JSON.parse); } return []; };
const KS = [3, 6, 10, 15], res = {}; KS.forEach(k => res[k] = {n:0, up:0, sum:0, parts:{}});
for (const [slug, file] of B.SETS[which]){ const pd = H.retail(slug); H.edh(pd.commander); X.__p = pd;
  const decks = corpusOf(file).filter(x => x.cards && x.cards.length >= 90).map(x => x.cards.filter(c => c[0] && !(c[2] || []).includes('Commander') && !(c[2] || []).some(t => /Maybeboard|Sideboard/i.test(t))).map(c => c[0]));
  if (decks.length < 5) continue; X.__D = decks; X.__K = KS; X.__DBG = !!process.env.DBG;
  const r = run(`(() => { const nl = n => { const c = find(n); return c && !tags(c).land && !isBasic(c.n); }, P = new Map(__p.cards.filter(e => nl(e.n)).map(e => [keyOf(e.n), e.n])), cnt = new Map(), keep = new Map(), nm = new Map();
    __D.forEach(L => { const s = new Set(L.filter(nl).map(n => { const c = find(n), k = keyOf(c.n); nm.set(k, c); return k; })); s.forEach(k => { if (P.has(k)) keep.set(k, (keep.get(k) || 0) + 1); else cnt.set(k, (cnt.get(k) || 0) + 1); }); });
    const id = ctxOf(__p).ident, cuts = [...P.keys()].map(k => [P.get(k), (keep.get(k) || 0) / __D.length]).sort((a, b) => a[1] - b[1]);
    const adds = [...cnt.entries()].map(([k, v]) => [nm.get(k), v / __D.length]).filter(([c]) => c && c.ci.every(z => id.includes(z)) && legalIn(c, 'commander') && keyOf(c.n) !== keyOf(__p.commander)).sort((a, b) => b[1] - a[1]);
    if (__DBG) return {dbg:[P.size, cuts.length, adds.length, cuts.slice(0, 3), adds.slice(0, 3).map(x => [x[0].n, x[1]])]};
    const AR = apexRef(__p), b = evaluateDeck(__p, {games:200, apex:AR}), out = {};
    for (const K of __K){ const d = JSON.parse(JSON.stringify(__p)); for (let i = 0; i < K && i < cuts.length && i < adds.length; i++){ cutCard(d, cuts[i][0], 1); addCard(d, adds[i][0].n, 1); }
      const e = evaluateDeck(d, {games:200, apex:AR}), pp = {}; for (const k in e.parts) if (e.parts[k] != null) pp[k] = e.parts[k] - b.parts[k]; out[K] = {d:e.exact - b.exact, pp}; }
    return out; })()`);
  if (r.dbg){ console.log(slug, JSON.stringify(r.dbg)); continue; }
  KS.forEach(k => { const x = r[k]; res[k].n++; if (x.d >= 0) res[k].up++; res[k].sum += x.d; for (const p in x.pp) res[k].parts[p] = (res[k].parts[p] || 0) + x.pp[p]; });
  if (!process.env.QUIET) console.log(slug.padEnd(20), KS.map(k => 'K' + k + ' ' + r[k].d.toFixed(1)).join('  ')); }
KS.forEach(k => { const x = res[k]; console.log('K=' + k, 'rated at/above stock', x.up + '/' + x.n, 'mean Δ', (x.sum / x.n).toFixed(2), 'parts', JSON.stringify(Object.fromEntries(Object.entries(x.parts).map(([p, v]) => [p, +(v / x.n).toFixed(1)])))); });
