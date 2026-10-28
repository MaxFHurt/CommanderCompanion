// How much room a generated Apex deck leaves: its own Apex upgrade list right after generation (rows that raise the deck
// score, and their summed gain), its deck score, and typicality against strong decks. node genroom.js <engineDir> [set]  UP='{...}'
const path = require('path'), fs = require('fs'), which = process.argv[3] || 'tuneall';
process.argv = [process.argv[0], 'x', path.resolve(process.argv[2]), 'g', which, '--quiet']; const B = require('./bench.js'), H = B.H, X = H.ctx, run = H.run;
if (process.env.UP){ X.__up = JSON.parse(process.env.UP); run('Object.assign(UP, __up)'); }
const T = {rows:0, gain:0, score:0, n:0, ms:0};
for (const [slug] of B.SETS[which]){ const pd = H.retail(slug); H.edh(pd.commander); if (process.env.NOEDH) run("EDH={key:'',map:null,decks:0,state:'fail'}");
  X.__n = pd.commander; X.__pp = pd.partner || '';
  X.__tier = process.env.TIER || 'apex'; X.__nop = !!process.env.NOPOLISH; const t0 = Date.now(), r = run(`(() => { const d = {id:'g', name:'g', format:'commander', commander:'', tier:'apex', aims:[], tribe:'', colors:[], aimLocked:false, cards:[], dismissed:[], auto:'commander'}; setCommander(d, __n); if (__pp) d.partner = __pp;
    const E = EDH, t = (E.tags || []).filter(x => E.tmap && E.tmap[x.slug]).slice(0, 3); if (t.length) d.aims = t.map(x => 'edh:' + x.slug);
    const plan = buildPlan(d, [], null, new Set()); d.cards = []; const TT = __tier; plan.forEach(s => addCard(d, TT === 'apex' ? s.a : planPick(s, TT), s.q)); d.tier = TT; if (TT !== 'apex' && !__nop) polishDeck(d); const ms = Date.now() - __t0;
    const ar = apexRef(d), e = evaluateDeck(d, {apex:ar, games:300}), R = upgradePaths(d); scoreCheck(d, R, {apex:ar, base:e});
    const rows = R.paths.map(L => tierPick(L, __tier)).filter(p => p && p.dScore != null && p.dScore >= SCORE_MIN);
    return {score:e.exact, rows:rows.length, gain:rows.reduce((a, p) => a + p.dScore, 0), top:rows.sort((a, b) => b.dScore - a.dScore).slice(0, 3).map(p => p.cut + '>' + p.add + ' ' + p.dScore), ms}; })()`.replace('__t0', t0));
  T.rows += r.rows; T.gain += r.gain; T.score += r.score; T.n++; T.ms += r.ms;
  console.log(slug.padEnd(22), 'score', r.score.toFixed(1), '| room:', r.rows, 'swaps, +' + r.gain.toFixed(2), '| gen', r.ms, 'ms |', r.top.join('; ')); }
console.log('MEAN score ' + (T.score / T.n).toFixed(2) + ' | room ' + (T.rows / T.n).toFixed(1) + ' swaps, +' + (T.gain / T.n).toFixed(2) + ' per deck | gen ' + Math.round(T.ms / T.n) + ' ms');
