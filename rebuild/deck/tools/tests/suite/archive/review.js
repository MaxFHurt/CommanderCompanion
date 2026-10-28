// The owner's four review cards: what players kept, what experts cut, and what each engine does. node review.js
const path = require('path'), fs = require('fs'); process.argv = [process.argv[0], 'x', path.resolve(__dirname, '../candidate'), 'rv', 'test', '--quiet'];
const B = require('./bench.js'), J = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../expert/expert_upgrades.json')));
const CASES = [['Syphon Mind', 'doom-prevails'], ['Endless Ranks of HYDRA', 'doom-prevails'], ['Divine Visitation', 'wakanda-forever'], ['Queen Mother Ramonda', 'wakanda-forever']];
const eng = {s1:require('./h.js')(path.resolve(__dirname, '../variants/s1')), cand:B.H};
for (const [card, slug] of CASES){
  const ev = B.evidence(slug, B.SETS.test.find(x => x[0] === slug)[1]), k = B.H.run('keyOf')(card);
  const ex = J.decks[slug].filter(e => (e.cuts || []).length), cutBy = ex.filter(e => e.cuts.some(n => n.toLowerCase() === card.toLowerCase())).map(e => e.url.split('/')[2]);
  const res = {}; for (const [lab, H] of Object.entries(eng)){ const d = H.retail(slug); H.edh(d.commander); H.ctx.__d = d; const R = H.run('upgradePaths(__d)'); const L = R.paths.find(L => H.run('keyOf')(L.cut) === k); res[lab] = L ? 'cut → ' + L.opts.apex.add + ' | why: ' + (L.opts.apex.cutWhy || []).join('; ') : 'kept'; }
  const c = B.H.ctx.find(card), e = B.H.run('EDH').map.get(c._n);
  console.log('\n' + card + ' (' + slug + ')\n  players who upgraded it keep it: ' + Math.round(ev.K.get(k) * 100) + '% (' + ev.n + ' decks)\n  experts cutting it: ' + cutBy.length + ' of ' + ex.length + (cutBy.length ? ' (' + cutBy.join(', ') + ')' : '') + '\n  EDHREC: in ' + (e ? Math.round(e.inc * 100) + '% of decks, synergy ' + e.syn : 'no row') + ' | roles now: ' + [...B.H.run('tags')(c).roles].join('/') + '\n  Stage 1:  ' + res.s1 + '\n  Stage 2:  ' + res.cand);
}
