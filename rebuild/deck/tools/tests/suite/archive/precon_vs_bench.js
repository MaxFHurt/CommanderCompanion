// How close is EDHREC's precon-upgrade data to the Archidekt benchmark? node precon_vs_bench.js
const path = require('path'), fs = require('fs');
process.argv = [process.argv[0], 'x', path.resolve(__dirname, '../candidate'), 'pvb', 'all', '--quiet'];
const B = require('./bench.js'), H = B.H, run = H.run;
const PRE = {'calling-all-angels':'calling-all-angels', 'keen-engineering':'keen-engineering', 'wretched-ranks':'wretched-ranks', 'reign-of-dragons':'reign-of-dragons', 'fantastic-four':'the-fantastic-four',
  'avengers-assemble':'avengers-assemble', 'doom-prevails':'doom-prevails', 'tramplesaurus-rex':'tramplesaurus-rex', 'turtle-power':'turtle-power', 'wakanda-forever':'wakanda-forever'};
const file = s => { for (const d of ['../snapshot/precon/', '../data2/precon/']){ const f = path.resolve(__dirname, d + s + '.json'); if (fs.existsSync(f)) return f; } };
const rank = a => { const s = a.map((v, i) => [v, i]).sort((x, y) => x[0] - y[0]), r = []; s.forEach((x, i) => r[x[1]] = i); return r; };
const spear = (a, b) => { const ra = rank(a), rb = rank(b), n = a.length, m = (n - 1) / 2; let num = 0, da = 0, db = 0; for (let i = 0; i < n; i++){ num += (ra[i] - m) * (rb[i] - m); da += (ra[i] - m) ** 2; db += (rb[i] - m) ** 2; } return num / Math.sqrt(da * db); };
for (const [slug, cf] of B.SETS.tune.concat(B.SETS.test)){
  const ev = B.evidence(slug, cf), j = JSON.parse(fs.readFileSync(file(PRE[slug]))), L = t => (j.container.json_dict.cardlists.find(x => x.tag === t) || {cardviews:[]}).cardviews;
  const cutList = L('cardstocut').map(v => run('keyOf')(v.name)), addList = L('cardstoadd').map(v => [run('keyOf')(v.name), v.num_decks / v.potential_decks]);
  const Ks = cutList.map(k => ev.K.get(k)).filter(v => v != null);
  const inCutMeanK = Ks.reduce((a, b) => a + b, 0) / Ks.length, allMeanK = [...ev.K.values()].reduce((a, b) => a + b, 0) / ev.K.size;
  const posK = cutList.map((k, i) => [i, ev.K.get(k)]).filter(x => x[1] != null), rCut = spear(posK.map(x => x[0]), posK.map(x => x[1]));
  const rAdd = spear(addList.map(x => x[1]), addList.map(x => ev.A.get(x[0]) || 0));
  console.log(slug.padEnd(20), 'copies', String(ev.n).padStart(4), '| cut-list cards: mean keep', inCutMeanK.toFixed(2), 'vs all', allMeanK.toFixed(2), '| order vs keep r=' + rCut.toFixed(2), '| add-list rate vs add rate r=' + rAdd.toFixed(2));
}
