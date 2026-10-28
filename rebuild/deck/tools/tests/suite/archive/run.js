// Runs one engine copy on the five retail decks and records raw output plus independent checks.
// node run.js <engineDir> <label>   -> ../out/<label>.json
// Two inputs per deck: "retail" (the fixture through the app's text import; the fair comparison input) and
// "precon" (EDHREC precon page through the app's built-in precon loader steps; a source replay, not a live capture).
const fs = require('fs'), path = require('path'), I = require('./indep.js');
const dir = path.resolve(process.argv[2]), label = process.argv[3], H = require('./h.js')(dir);
const DECKS = [['avengers-assemble', 'Captain America, Team Leader'], ['doom-prevails', 'Doctor Doom, King of Latveria'], ['tramplesaurus-rex', 'Ghalta, Primal Hunger'], ['turtle-power', 'Leonardo, the Balance'], ['wakanda-forever', "T'Challa, the Black Panther"]];
const out = {label, engineDir:dir, runAt:new Date().toISOString(), decks:{}};
const TK = ['budget', 'mid', 'apex'];
// The deck a tier's "Apply all" would produce. Uses the engine's own tierPick when it has one (candidate), else the
// Build 73 UI rule (bestAt: walk down from the tier, skipping weak/beaten picks).
const pickAt = (L, t) => { if (H.ctx.tierPick) return H.ctx.tierPick(L, t); for (let k = TK.indexOf(t); k >= 0; k--){ const p = L.opts[TK[k]]; if (p && !p.beaten && !p.weak) return p; } return null; };
for (const [slug, cmdName] of DECKS){
  for (const mode of ['retail', 'precon']){
    const d = mode === 'retail' ? H.retail(slug) : H.preconReplay(slug); H.edh(d.commander);
    H.ctx.__d = d; const t0 = Date.now(); const R = H.run('upgradePaths(__d)'); const ms = Date.now() - t0;
    const A = H.run('analyze(__d)');
    const rows = R.paths.map(L => ({cut:L.cut, opts:Object.fromEntries(TK.concat(['free']).filter(t => L.opts[t]).map(t => [t, L.opts[t].add])),
      flags:Object.fromEntries(TK.filter(t => L.opts[t]).map(t => [t, ['weak', 'beaten', 'held'].filter(f => L.opts[t][f])])), none:L.none || null,
      price:Object.fromEntries(TK.filter(t => L.opts[t]).map(t => [t, (H.ctx.find(L.opts[t].add) || {}).p]))}));
    const cmds = [d.commander].concat(d.partner ? [d.partner] : []), cards = d.cards.map(e => ({n:e.n, q:e.q}));
    const packages = {};
    for (const t of TK){ const pairs = R.paths.map(L => pickAt(L, t)).filter(Boolean).map(p => ({cut:p.cut, add:p.add}));
      const ap = I.applyPairs(cards, pairs), dv = I.validateDeck(cmds, ap.cards);
      packages[t] = {swaps:pairs.length, applyViolations:ap.v, deckViolations:dv, pairs}; }
    out.decks[slug + '/' + mode] = {commander:d.commander, partner:d.partner || null, aims:d.aims, tribe:d.tribe, size:A.size, unknown:A.unknown, ms,
      inputViolations:I.validateDeck(cmds, cards), recViolations:I.checkRecs(cmds, cards, rows), rows, fixes:(R.fixes || []).map(p => ({cut:p.cut, add:p.add})), drops:(R.drops || []).map(x => ({n:x.n, q:x.q})), packages};
  }
}
fs.mkdirSync(path.resolve(__dirname, '../out'), {recursive:true});
fs.writeFileSync(path.resolve(__dirname, '../out/' + label + '.json'), JSON.stringify(out, null, 1));
for (const [k, v] of Object.entries(out.decks)){
  const vc = {}; v.recViolations.forEach(x => vc[x[0]] = (vc[x[0]] || 0) + 1);
  console.log(k.padEnd(28), 'cmd', v.commander.split(',')[0].padEnd(14), 'size', v.size, 'unknown', v.unknown.length, '| slots', String(v.rows.length).padStart(2), '| apex/mid/budget', TK.slice().reverse().map(t => v.rows.filter(r => r.opts[t]).length).join('/'),
    '| rec violations', JSON.stringify(vc), '| pkg deck violations', TK.map(t => v.packages[t].deckViolations.length + v.packages[t].applyViolations.length).join('/'), '|', v.ms + 'ms');
}
