// Tournament comparison: our generated Apex ("Best overall") deck against 20 top-16 tournament lists per commander
// (EDHTop16, events of 48+ players; data from tourney-fetch.js in ../tourney). Basics and the commanders are left out.
//   match  = mean share of our cards that each tournament list also runs
//   core   = share of the cards in half or more of the lists that our deck includes
//   raise  = of the 8 most-shared core cards we miss, how many raise our deck score when put in for our weakest card
//            (lands scored with fresh practice games, as the app does)
//   mid    = match for the Mid build (every card under $12)
// node tourney.js <engineDir> [--show]      UP='{...}' for experiments
const path = require('path'), fs = require('fs'), show = process.argv.includes('--show'), H = require('./h.js')(path.resolve(process.argv[2])), X = H.ctx, run = H.run;
if (process.env.UP){ X.__up = JSON.parse(process.env.UP); run('Object.assign(UP, __up)'); }
const LIST = require('./tourney-list.js'), TD = path.resolve(__dirname, '../tourney'), ZF = path.join(__dirname, 'tourney-data.json.gz');
// first run: unpack the frozen data (tourney-data.json.gz: the lists, the EDHREC pages, Build 117's decks) next to the test data
if (!fs.existsSync(TD) && fs.existsSync(ZF)){ const Z = JSON.parse(require('zlib').gunzipSync(fs.readFileSync(ZF))), ED = path.resolve(__dirname, '../data2/edhrec'); fs.mkdirSync(TD, {recursive:true}); fs.mkdirSync(ED, {recursive:true});
  for (const f in Z.tourney) fs.writeFileSync(path.join(TD, f), Z.tourney[f]); for (const f in Z.edhrec) if (!fs.existsSync(path.join(ED, f))) fs.writeFileSync(path.join(ED, f), Z.edhrec[f]); }
const KM = new Map(run('LIB').map(c => [c._k, c])), tags = run('tags'), mean = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0;
const key = n => { const c = X.find(n); return c && !run('isBasic')(c.n) ? c._k : null; }, rows = [];
for (const T of LIST){
  const f = path.join(TD, H.slug(T.commander) + '.json'); if (!fs.existsSync(f)) continue; const J = JSON.parse(fs.readFileSync(f)); H.edh(T.commander);
  const skip = new Set([key(T.commander), T.partner && key(T.partner)].filter(Boolean));
  const lists = J.lists.map(L => new Set(L.cards.map(key).filter(k => k && !skip.has(k))));
  const rate = new Map(); lists.forEach(s => s.forEach(k => rate.set(k, (rate.get(k) || 0) + 1)));
  const core = [...rate.entries()].filter(([, v]) => v / lists.length >= 0.5).sort((a, b) => b[1] - a[1]).map(([k]) => k);
  X.__n = T.commander; X.__pp = T.partner || '';
  const nd = run(`(() => { const d = {id:'g', name:'g', format:'commander', commander:'', tier:'apex', aims:[], tribe:'', colors:[], aimLocked:false, cards:[], dismissed:[], auto:'commander'}; setCommander(d, __n); if (__pp) setPartner(d, __pp); return d; })()`);
  X.__d = nd; const plan = run('buildPlan(__d, [], null, new Set())');
  const deckOf = t => { const d = JSON.parse(JSON.stringify(nd)); d.cards = []; d.tier = t; X.__q = d; plan.forEach(s => { X.__a = run('planPick')(s, t); X.__k = s.q; if (X.__a) run('addCard(__q, __a, __k)'); }); return d; };
  const ks = d => new Set(d.cards.map(e => key(e.n)).filter(k => k && !skip.has(k)));
  const match = s => mean(lists.map(L => [...s].filter(k => L.has(k)).length / Math.max(1, s.size)));
  const apex = deckOf('apex'), A = ks(apex), M = ks(deckOf('mid'));
  // MID2=1 (Build 145): the Mid deck the app itself builds (genDeck: filled and polished at Mid), not slot-by-slot from the Apex plan
  let M2 = null, M3 = null; if (process.env.MID2){ X.__m = JSON.parse(JSON.stringify(nd)); run('genDeck(__m, [], null, new Set(), "mid")'); M2 = ks(run('__m'));
    { const S = M2.size, cheap = [...rate.entries()].filter(([k]) => { const c = KM.get(k); return c && c.p != null && c.p < 12 && !tags(c).land; }).sort((a, b) => b[1] - a[1]).slice(0, [...M2].filter(k => { const c = KM.get(k); return c && !tags(c).land; }).length).map(([k]) => k);
      const lands = [...M2].filter(k => { const c = KM.get(k); return c && tags(c).land; }); globalThis.__oracle = (globalThis.__oracle || []).concat([match(new Set(cheap.concat(lands)))]);
      const miss = cheap.filter(k => !M2.has(k)).slice(0, 8).map(k => KM.get(k).n + ' ' + Math.round(100 * rate.get(k) / lists.length) + '%'); if (process.env.SHOW) console.log(T.commander.split(',')[0], 'mid misses:', miss.join('; ')); }
    X.__m3 = JSON.parse(JSON.stringify(nd)); run('(() => { const p = UP.polish; UP.polish = 0; try { __m3.plan = buildPlan(__m3, [], null, new Set()); } finally { UP.polish = p; } planAll(__m3, "mid"); delete __m3.plan; __m3.tier = "mid"; })()'); M3 = ks(run('__m3')); }
  // Score check, on Build 117's own Apex deck (saved once with --save-base, so every version is asked about the same swaps):
  // the most-shared core cards it misses, each put in for its weakest spell (lands for its weakest land).
  const BF = path.join(TD, 'base-decks.json'), BD = fs.existsSync(BF) ? JSON.parse(fs.readFileSync(BF)) : {};
  if (process.argv.includes('--save-base')){ BD[T.commander] = apex.cards; fs.writeFileSync(BF, JSON.stringify(BD)); }
  const probe = BD[T.commander] ? Object.assign(JSON.parse(JSON.stringify(apex)), {cards:BD[T.commander]}) : apex, PA = ks(probe);
  X.__q0 = apex; X.__q = probe; const AR = run('apexRef(__q)'); X.__ar = AR; const base = run('evaluateDeck(__q, {apex:__ar})'); X.__b = base;
  const ctx = run('ctxOf(__q)'), val = c => run('baseScore')(c, probe, ctx).s, KN = k => run('LIB').find(c => c._k === k);
  const mine = probe.cards.map(e => X.find(e.n)).filter(c => c && !run('isBasic')(c.n) && !skip.has(c._k));
  const weakest = land => mine.filter(c => !!tags(c).land === land && !rate.has(c._k)).sort((a, b) => val(a) - val(b))[0];
  let f0 = null; const fresh = () => { if (f0 == null) f0 = run('evaluateDeck(__q, {apex:__ar, games:200}).exact'); return +(run('(() => { const u = JSON.parse(JSON.stringify(__q)); cutCard(u, __c, 1); addCard(u, __x, 1); return evaluateDeck(u, {apex:__ar, games:200}).exact; })()') - f0).toFixed(2); };
  const miss = core.filter(k => !PA.has(k)).slice(0, 8); let raise = 0; const missN = [];
  miss.forEach(k => { const c = KN(k); if (!c) return; const w = weakest(!!tags(c).land) || (tags(c).land ? probe.cards.map(e => X.find(e.n)).find(x => x && run('isBasic')(x.n)) : null); if (!w) return;
    X.__c = w.n; X.__x = c.n; const s = tags(c).land ? fresh() : run('swapScore(__q, __b, __ar, __c, __x)'); if (s > 0) raise++; missN.push(c.n + (s > 0 ? ' +' : ' ') + s); });
  rows.push({cmd:T.commander.split(',')[0], n:lists.length, match:match(A), core:core.length ? core.filter(k => A.has(k)).length / core.length : 0, nCore:core.length, raise, tried:missN.length, mid:match(M), mid2:M2 ? match(M2) : 0, mid3:M3 ? match(M3) : 0, score:run('evaluateDeck(__q0, {apex:__ar})').exact});
  if (show) console.log(T.commander.split(',')[0] + ' — missed core: ' + missN.join('; '));
}
const pc = v => (100 * v).toFixed(0) + '%';
console.log('commander'.padEnd(14) + 'lists  match  core        raise  mid    score');
rows.forEach(r => console.log(r.cmd.padEnd(14) + String(r.n).padEnd(7) + pc(r.match).padEnd(7) + (pc(r.core) + ' of ' + r.nCore).padEnd(12) + (r.raise + '/' + r.tried).padEnd(7) + pc(r.mid).padEnd(7) + r.score.toFixed(1)));
console.log('\nMEAN match ' + pc(mean(rows.map(r => r.match))) + ' | core ' + pc(mean(rows.map(r => r.core))) + ' | score raised by missed core cards (Build 117 decks) ' + rows.reduce((a, r) => a + r.raise, 0) + '/' + rows.reduce((a, r) => a + r.tried, 0) + ' | app mid ' + pc(mean(rows.map(r => r.mid2))) + ' | best possible Mid ' + pc(mean(globalThis.__oracle || [])) + ' | app mid, no polish ' + pc(mean(rows.map(r => r.mid3))) + ' | mid match ' + pc(mean(rows.map(r => r.mid))));
