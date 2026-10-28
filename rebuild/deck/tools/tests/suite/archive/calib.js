// Deck-score calibration against real players: for each precon, the stock deck vs the decks players built from it.
// A good evaluator rates most of those player decks at or above the stock deck. node calib.js <engineDir> <set> [N]
const path = require('path'), fs = require('fs'); const which = process.argv[3] || 'tuneall', N = +(process.argv[4] || 25);
process.argv = [process.argv[0], 'x', path.resolve(process.argv[2]), 'c', which, '--quiet']; const B = require('./bench.js'), H = B.H, X = H.ctx, run = H.run;
if (process.env.UP){ X.__up = JSON.parse(process.env.UP); run('Object.assign(UP, __up)'); }
if (process.env.EV){ X.__ev = JSON.parse(process.env.EV); run('Object.assign(EVK, __ev)'); }
const CORP = ['corpus', 'corpus2', 'corpus3', 'corpus4'].map(x => path.resolve(__dirname, '../../' + x));
const corpusOf = f => { for (const d of CORP){ const p = path.join(d, f + '.jsonl'); if (fs.existsSync(p)) return fs.readFileSync(p, 'utf8').split('\n').filter(Boolean).map(JSON.parse); } return []; };
let tot = 0, up = 0; const comp = {}, cnt = {};
for (const [slug, file] of B.SETS[which]){ const pd = H.retail(slug); H.edh(pd.commander); X.__p = pd;
  const decks = corpusOf(file).filter(x => x.cards && x.cards.length >= 90).slice(0, N).map(x => x.cards.filter(c => c[0] && !(c[2] || []).includes('Commander') && !(c[2] || []).some(t => /Maybeboard|Sideboard/i.test(t))).map(c => [c[0], c[1] || 1]));
  X.__D = decks;
  const r = run(`(() => { const AR = apexRef(__p), b = evaluateDeck(__p, {games:200, apex:AR}), out = [];
    for (const L of __D){ const d = JSON.parse(JSON.stringify(__p)); d.cards = []; L.forEach(([n, q]) => { if (find(n) && keyOf(n) !== keyOf(d.commander) && (!d.partner || keyOf(n) !== keyOf(d.partner))) addCard(d, n, q); }); const size = d.cards.reduce((a, e) => a + e.q, 0); if (size < 95 || size > 101) continue;
      const e = evaluateDeck(d, {games:200, apex:AR}); const pd = {}; for (const k in e.parts) if (e.parts[k] != null) pd[k] = +(e.parts[k] - b.parts[k]).toFixed(1); out.push({d:+(e.exact - b.exact).toFixed(2), pd}); }
    return out; })()`);
  const pos = r.filter(x => x.d >= 0).length; tot += r.length; up += pos; r.forEach(x => { for (const k in x.pd){ comp[k] = (comp[k] || 0) + x.pd[k]; cnt[k] = (cnt[k] || 0) + (x.pd[k] < 0 ? 1 : 0); } });
  if (!process.env.QUIET) console.log(slug.padEnd(20), 'player decks', r.length, 'scored at/above stock', pos, ' mean Δ', (r.reduce((a, x) => a + x.d, 0) / Math.max(1, r.length)).toFixed(2)); }
console.log('ALL', which, 'player decks', tot, 'at/above stock', up, '(' + (100 * up / Math.max(1, tot)).toFixed(1) + '%)', '| mean part Δ', JSON.stringify(Object.fromEntries(Object.keys(comp).map(k => [k, +(comp[k] / tot).toFixed(1)]))), '| decks with part below stock', JSON.stringify(cnt));
