// Stage 2 benchmark (see ../BENCHMARK_PLAN.md). node bench.js <engineDir> <label> [tune|test|all] [--quiet]
// Compares the engine's Apex swaps with what players who upgraded the same precon actually kept and added (Archidekt).
const fs = require('fs'), path = require('path');
const dir = path.resolve(process.argv[2]), label = process.argv[3] || 'bench', which = process.argv[4] || 'tune', quiet = process.argv.includes('--quiet');
if (process.env.NOPRE) require('./h.js').noPrecon = true;   // compare without the precon evidence
const H = require('./h.js')(dir), X = H.ctx, run = H.run;
// Weight overrides for experiments: UP='{"wf":0.1}' node bench.js ...  (applied to the engine's UP object)
if (process.env.UP){ X.__up = JSON.parse(process.env.UP); run('Object.assign(UP, __up)'); }
// CORPUS=corpus5: judge with that folder of player decks only (corpus5: up to 1,000 per commander, fetched 21 Oct by
// corpus-fetch.py); the default is the original folders
const CORP = (process.env.CORPUS ? [process.env.CORPUS] : ['corpus', 'corpus2', 'corpus3', 'corpus4']).map(x => path.resolve(__dirname, '../../' + x));
const SETS = {
  test: [['avengers-assemble', 'Captain_America'], ['doom-prevails', 'Doctor_Doom'], ['tramplesaurus-rex', 'Ghalta'], ['turtle-power', 'Leonardo'], ['wakanda-forever', 'TChalla']],
  tune: [['calling-all-angels', 'Giada'], ['keen-engineering', 'Sai'], ['wretched-ranks', 'Ghoulcaller_Gisa'], ['reign-of-dragons', 'Lathliss'], ['fantastic-four', 'Invisible_Woman']],
  tune2: [['abzan-armor', 'Felothar_the_Steadfast'], ['temur-roar', 'Eshki'], ['limit-break', 'Cloud'], ['revival-trance', 'Terra'], ['animated-army', 'Bello'], ['squirreled-away', 'Hazel_of_the_Rootbloom'], ['grand-larceny', 'Gonti'], ['death-toll', 'Winter']],
  // Sealed: scored once, at the very end (see BENCHMARK_PLAN.md, amendment 2).
  holdout: [['jeskai-striker', 'Shiko_and_Narset'], ['mardu-surge', 'Zurgo_Stormrender'], ['sultai-arisen', 'Teval'], ['counter-blitz', 'Tidus'], ['scions-spellcraft', 'Yshtola'], ['endless-punishment', 'Valgavoth'], ['family-matters', 'Zinnia'], ['most-wanted', 'Olivia']]
};
SETS.tuneall = SETS.tune.concat(SETS.tune2);
// wide (24 Oct, owner's choice B): 24 more precons, the most built of every Commander precon whose cards are all in the snapshot,
// judged with up to 400 Archidekt decks each (CORPUS=corpus5); their EDHREC pages live in data3/edhrec. wide-set.json lists them.
try { SETS.wide = JSON.parse(fs.readFileSync(path.join(__dirname, 'wide-set.json'), 'utf8')); } catch (e) {}
if (which === 'wide' && !process.env.EDHX) process.env.EDHX = 'data3/edhrec';
const list = which === 'all' ? SETS.tune.concat(SETS.tune2, SETS.test) : SETS[which];
const oidSet = new Set(run('LIB.map(c => c.oid).filter(Boolean)'));
const keyFor = (name, uid) => uid && oidSet.has(uid) ? uid : run('keyOf')(name);
const isLand = n => { const c = X.find(n); return !!c && run('tags')(c).land; };
let KP_; const KPget = () => KP_ || (KP_ = new Map(run('LIB').map(c => [c._k, c]))), KP = {get:k => KPget().get(k)};
const corpusOf = f => { for (const d of CORP){ const p = path.join(d, f + '.jsonl'); if (fs.existsSync(p)) return fs.readFileSync(p, 'utf8').split('\n').filter(Boolean).map(JSON.parse); } return []; };

// Evidence for one precon: keep rates of its nonland cards, add rates of everything else, in its upgraded copies.
function evidence(slug, file){
  const d = H.retail(slug), cmdK = run('keyOf')(d.commander);
  const LANDS = !!process.env.LANDS, isUp = n => { const c = X.find(n); return !!c && run('tags')(c).land && !run('isBasic')(c.n) && !/Basic/.test(c.t); };
  const P = new Map(); d.cards.forEach(e => { if (LANDS ? isUp(e.n) : !isLand(e.n)) P.set(run('keyOf')(e.n), e.n); });
  // WEIGHT=a,b: a deck its builder marks bracket 3 counts a times, bracket 4 or 5 b times (the rest once): the stronger builders'
  // choices weigh more without throwing the rest away. Each deck set carries its weight (s.w).
  const WT = process.env.WEIGHT ? process.env.WEIGHT.split(',').map(Number) : null, wOf = x => !WT ? 1 : x.bracket >= 4 ? WT[1] : x.bracket === 3 ? WT[0] : 1;
  const decks = corpusOf(file).filter(x => !process.env.STRONG || x.bracket >= +process.env.STRONG).map(x => { const s = new Set(); s.w = wOf(x); s.br = x.bracket || 0; x.cards.forEach(([n, q, cats, uid]) => { if (!n || (cats || []).includes('Commander')) return; const k = keyFor(n, uid); if (k !== cmdK) s.add(k); }); return s; });
  const PN = new Map(); d.cards.forEach(e => { if (!isLand(e.n)) PN.set(run('keyOf')(e.n), e.n); });   // 'upgraded copy' is always judged on the spells
  let up = decks.filter(s => { let o = 0; PN.forEach((n, k) => { if (s.has(k)) o++; }); return o >= 0.4 * PN.size && PN.size - o >= 5; });
  // GROUP=lo / hi: judge against the cheapest half / priciest quarter of upgraded copies (snapshot prices) — the Budget and Apex questions.
  if (process.env.GROUP){ const pr = s => [...s].reduce((a, k) => { const c = KP.get(k); return a + (c && c.p != null ? c.p : 0); }, 0), srt = up.map(s => [pr(s), s]).sort((a, b) => a[0] - b[0]).map(x => x[1]);
    up = process.env.GROUP === 'lo' ? srt.slice(0, srt.length >> 1) : srt.slice(-Math.floor(srt.length / 4)); }
  const K = new Map(), A = new Map();
  const W = up.reduce((a, s) => a + s.w, 0) || 1; P.forEach((n, k) => K.set(k, up.filter(s => s.has(k)).reduce((a, s) => a + s.w, 0) / W));
  const landK = new Map(), landOf = k => { if (!landK.has(k)){ const c = run('LIB').find(c => c._k === k); landK.set(k, !c || run('tags')(c).land); } return landK.get(k); };
  const want = k => LANDS ? (landOf(k) && KP.get(k) && !run('isBasic')(KP.get(k).n) && !/Basic/.test(KP.get(k).t)) : !landOf(k);
  up.forEach(s => s.forEach(k => { if (!P.has(k) && want(k)) A.set(k, (A.get(k) || 0) + s.w); }));   // adds of the same kind as the swaps judged
  A.forEach((v, k) => A.set(k, v / W));
  return {d, P, K, A, n:up.length, total:decks.length, up};
}
function score(ev, swaps, Kx, Ax){
  Kx = Kx || ev.K; Ax = Ax || ev.A; let s = 0;
  swaps.forEach(p => { s += (Ax.get(run('keyOf')(p.add)) || 0) - (Kx.get(run('keyOf')(p.cut)) || 0); });
  return s;
}
if (require.main !== module){ module.exports = {evidence, H, SETS}; return; }
// RCACHE=<dir> (testing speed, 24 Oct): the engine's picks for a deck do not depend on which player decks judge them, so a run
// saves each deck's result and a second run with another CORPUS reuses it instead of working it out again. The key covers the
// engine's files, the deck and every setting that changes the picks; benchall.js gives each full run its own folder.
const RC = process.env.RCACHE ? path.resolve(process.env.RCACHE) : null,
  rcKey = (() => { if (!RC) return null; const h = require('crypto').createHash('sha256'), F = JSON.parse(fs.readFileSync(path.join(dir, 'files.json'), 'utf8'));
    F.data.concat(F.engine).forEach(f => h.update(fs.readFileSync(path.join(dir, f)))); ['UP', 'SCORECHECK', 'POOL', 'CAP', 'TIER', 'AIMS', 'NTHEMES', 'BUDGETONLY', 'NOPRE', 'EDHX'].forEach(k => h.update(k + '=' + (process.env[k] || '') + ';'));
    return h.digest('hex').slice(0, 16); })(),
  rcFile = slug => path.join(RC, rcKey + '-' + slug + '.json'),
  rcGet = slug => { if (!RC || !fs.existsSync(rcFile(slug))) return null; return JSON.parse(fs.readFileSync(rcFile(slug), 'utf8')); },
  rcPut = (slug, R) => { if (!RC || fs.existsSync(rcFile(slug))) return; fs.mkdirSync(RC, {recursive:true});
    // what the scoring below reads: each row's options, Most played picks, alternatives and the engine's diagnostics
    fs.writeFileSync(rcFile(slug), JSON.stringify({paths:R.paths.map(L => ({cut:L.cut, opts:L.opts, pop:L.pop, alts:L.alts ? {apex:L.alts.apex} : undefined})), _dbg:R._dbg})); };
const out = {label, engine:dir, at:new Date().toISOString(), set:which, decks:{}}; const tot = {score:0, swaps:0};
for (const [slug, file] of list){
  const ev = evidence(slug, file), d = ev.d; H.edh(d.commander); X.__d = d;
  // AIMS=edh: aim the deck with the commander's own top themes (EDHREC tags), most-built first
  if (process.env.AIMS === 'edh'){ const E = run('EDH'); const t = E.tags.filter(x => E.tmap[x.slug]).slice(0, +(process.env.NTHEMES || 3)); if (t.length) d.aims = t.map(x => 'edh:' + x.slug); }
  // BUDGETONLY=3: experiment — the whole engine restricted to cards under $3 (everything else ruled out for this deck).
  if (process.env.BUDGETONLY){ X.__cap = +process.env.BUDGETONLY; run('__d.dismissed = LIB.filter(c => c.p == null || c.p >= __cap).map(c => c.n)'); }
  X.__cap = +(process.env.CAP || 0); X.__pool = !!process.env.POOL;   // POOL=1: the whole-card search and its picks (0.9.3), as the app shows them
   if (process.env.TIER) X.__d.tier = process.env.TIER; X.__sco = process.env.SCORECHECK === '2' ? {refill:false, theme:false} : {}; const t0 = Date.now(), R = rcGet(slug) || run(process.env.SCORECHECK ? '(() => { const R0 = upgradePaths(__d, __cap ? {cap:__cap} : undefined); try { scoreCheck(__d, R0, Object.assign({apex:apexRef(__d)}, __sco)); } catch (e) {} if (__pool && typeof poolPromote === "function") try { const Q = poolQueue(__d, R0); if (Q){ poolStep(Q, 1e12); poolPromote(Q); } } catch (e) {} return R0; })()' : 'upgradePaths(__d, __cap ? {cap:__cap} : undefined)'), ms = Date.now() - t0; rcPut(slug, R);   // CAP=3: the per-card price-capped package
  const TIER = process.env.TIER || 'apex', swaps = R.paths.map(L => X.tierPick ? X.tierPick(L, TIER) : L.opts[TIER]).filter(Boolean).filter(p => process.env.LANDS ? isLand(p.cut) && isLand(p.add) : !isLand(p.cut) && !isLand(p.add)).map(p => ({cut:p.cut, add:p.add}));
  // Ranking quality over everything, not just the top 10: does the engine's value order the deck's cards the way players keep
  // them, and the candidate additions the way players add them? (Spearman; needs the engine's diagnostics.)
  const rk = a => { const q = a.map((v, i) => [v, i]).sort((x, y) => x[0] - y[0]), r = []; q.forEach((x, i) => r[x[1]] = i); return r; };
  const sp = (a, b) => { if (a.length < 3) return NaN; const ra = rk(a), rb = rk(b), n = a.length, m = (n - 1) / 2; let u = 0, x = 0, y = 0; for (let i = 0; i < n; i++){ u += (ra[i] - m) * (rb[i] - m); x += (ra[i] - m) ** 2; y += (rb[i] - m) ** 2; } return u / Math.sqrt(x * y); };
  const dg = R._dbg || {cuts:[], pool:[]}, cutR = sp(dg.cuts.filter(c => ev.K.has(c.k)).map(c => c.v), dg.cuts.filter(c => ev.K.has(c.k)).map(c => ev.K.get(c.k))), addR = sp(dg.pool.map(c => c.v), dg.pool.map(c => ev.A.get(c.k) || 0));
  const top = swaps.slice(0, 10), kOf = p => ev.K.get(run('keyOf')(p.cut)) || 0, aOf = p => ev.A.get(run('keyOf')(p.add)) || 0, mean = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0;
  // row@5: per row, the best player match among the cards the row offers (its pick, and the "Most played" card when that is not
  // the pick), so a stronger pick never hides the popular one; gain@5: how much the picks raise the deck score.
  const PL = R.paths.map(L => ({L, p:X.tierPick ? X.tierPick(L, TIER) : L.opts[TIER]})).filter(x => x.p && (process.env.LANDS ? isLand(x.p.cut) && isLand(x.p.add) : !isLand(x.p.cut) && !isLand(x.p.add))).slice(0, 5);
  const rowAg5 = mean(PL.map(({L, p}) => Math.max(aOf(p), ...['apex', 'mid', 'budget'].map(t => L.opts[t] ? aOf(L.opts[t]) : -1), ...Object.values(L.pop || {}).map(x => aOf(x)), ...((L.alts || {}).apex || []).filter(a => a.most).map(a => aOf({add:a.n}))) - kOf(p))), gain5 = mean(PL.map(({p}) => p.dScore || 0));
  const ag5 = mean(swaps.slice(0, 5).map(p => aOf(p) - kOf(p))), ag10 = mean(top.map(p => aOf(p) - kOf(p))), k10 = mean(top.map(kOf)), a10 = mean(top.map(aOf));
  // ALSOW=3,6 (testing 3a, 19 Oct): the same engine run also judged with weighted player data, so one run gives both rows of numbers
  if (process.env.ALSOW){ const w0 = process.env.WEIGHT; process.env.WEIGHT = process.env.ALSOW; const evW = evidence(slug, file); if (w0 == null) delete process.env.WEIGHT; else process.env.WEIGHT = w0;
    const kW = p => evW.K.get(run('keyOf')(p.cut)) || 0, aW = p => evW.A.get(run('keyOf')(p.add)) || 0;
    if (evW.n){ tot.wn = (tot.wn || 0) + 1; tot.w5 = (tot.w5 || 0) + mean(swaps.slice(0, 5).map(p => aW(p) - kW(p))); tot.w10 = (tot.w10 || 0) + mean(top.map(p => aW(p) - kW(p)));
      tot.wr5 = (tot.wr5 || 0) + mean(PL.map(({L, p}) => Math.max(aW(p), ...['apex', 'mid', 'budget'].map(t => L.opts[t] ? aW(L.opts[t]) : -1), ...Object.values(L.pop || {}).map(x => aW(x)), ...((L.alts || {}).apex || []).filter(a => a.most).map(a => aW({add:a.n}))) - kW(p))); } }
  const sk = [...ev.K.values()].sort((a, b) => a - b), sa = [...ev.A.values()].sort((a, b) => b - a), ceil10 = mean(sa.slice(0, 10).map((v, i) => v - sk[i]));
  const sc = score(ev, swaps), kc = swaps.map(p => ev.K.get(run('keyOf')(p.cut)) || 0), aa = swaps.map(p => ev.A.get(run('keyOf')(p.add)) || 0);
  const meanK = [...ev.K.values()].reduce((a, b) => a + b, 0) / Math.max(1, ev.K.size);
  const lowKeep = [...ev.K.entries()].filter(([, v]) => v < 1 / 3).map(([k]) => k), cutKeys = new Set(swaps.map(p => run('keyOf')(p.cut)));
  // bootstrap over upgraded copies
  const B = [], rnd = (() => { let x = 12345; return () => (x = (x * 1103515245 + 12345) % 2147483648) / 2147483648; })();
  for (let b = 0; b < 1000 && ev.n; b++){ const smp = Array.from({length:ev.n}, () => ev.up[Math.floor(rnd() * ev.n)]); const Kb = new Map(), Ab = new Map();
    const Wb = smp.reduce((a, s) => a + s.w, 0) || 1; swaps.forEach(p => { const kc = run('keyOf')(p.cut), ka = run('keyOf')(p.add); Kb.set(kc, smp.filter(s => s.has(kc)).reduce((a, s) => a + s.w, 0) / Wb); Ab.set(ka, smp.filter(s => s.has(ka)).reduce((a, s) => a + s.w, 0) / Wb); }); B.push(score(ev, swaps, Kb, Ab)); }
  B.sort((a, b) => a - b);
  const r = {commander:d.commander, upgraded:ev.n, corpus:ev.total, swaps:swaps.length, cutRank:+cutR.toFixed(3), addRank:+addR.toFixed(3), ag5:+ag5.toFixed(3), ag10:+ag10.toFixed(3), keep10:+k10.toFixed(3), add10:+a10.toFixed(3), ceil10:+ceil10.toFixed(3), score:+sc.toFixed(2), ci90:B.length ? [+B[50].toFixed(2), +B[949].toFixed(2)] : null,
    meanKeepCut:+(kc.reduce((a, b) => a + b, 0) / Math.max(1, kc.length)).toFixed(3), meanKeepAll:+meanK.toFixed(3), meanAddRate:+(aa.reduce((a, b) => a + b, 0) / Math.max(1, aa.length)).toFixed(3),
    cutRecall:+(lowKeep.filter(k => cutKeys.has(k)).length / Math.max(1, lowKeep.length)).toFixed(2), lowKeep:lowKeep.length, ms,
    pairs:swaps.map(p => ({cut:p.cut, keep:+(ev.K.get(run('keyOf')(p.cut)) || 0).toFixed(2), add:p.add, addRate:+(ev.A.get(run('keyOf')(p.add)) || 0).toFixed(2)}))};
  // Rank quality (used for lands, where keep/add rates are not comparable): share of precon cards kept MORE often than each cut,
  // share of added cards added LESS often than each addition. Random picks score 0.5 on both.
  { const kv = [...ev.K.values()], av = [...ev.A.values()].filter(v => v > 0);
    r.cutPct = swaps.length ? +(swaps.map(p => kv.filter(v => v > kOf(p)).length / Math.max(1, kv.length - 1)).reduce((a, b) => a + b, 0) / swaps.length).toFixed(2) : null;
    r.addPct = swaps.length ? +(swaps.map(p => av.filter(v => v < aOf(p)).length / Math.max(1, av.length - 1)).reduce((a, b) => a + b, 0) / swaps.length).toFixed(2) : null;
    if (r.cutPct != null){ tot.cpN = (tot.cpN || 0) + 1; tot.cp = (tot.cp || 0) + r.cutPct; tot.apc = (tot.apc || 0) + r.addPct; } }
  // Whole-list regret: how far the full swap list falls short of the best list of the same length players' data allow
  // (best adds paired with least-kept cuts), per swap. 0 = matches the crowd's best possible list; lower is better.
  { const N = swaps.length; let best = 0; for (let i = 0; i < N; i++) best += (sa[i] || 0) - (sk[i] != null ? sk[i] : 1); r.regret = N ? +((best - sc) / N).toFixed(3) : 0; }
  if (!ev.n){ out.decks[slug] = r; continue; }   // no player data for this deck yet: reported, not averaged
  out.decks[slug] = r; tot.score += sc; tot.swaps += swaps.length; tot.ag = (tot.ag || 0) + ag10; tot.a5 = (tot.a5 || 0) + ag5; tot.rw = (tot.rw || 0) + rowAg5; tot.g5 = (tot.g5 || 0) + gain5; tot.n = (tot.n || 0) + 1; tot.cr = (tot.cr || 0) + (cutR || 0); tot.rg = (tot.rg || 0) + r.regret; tot.ar = (tot.ar || 0) + (addR || 0);
  if (!quiet){ console.log('\n## ' + slug + ' — ' + d.commander + ' · upgraded copies ' + ev.n + ' of ' + ev.total);
    r.pairs.forEach(p => console.log('  ' + (p.addRate - p.keep >= 0 ? '+' : '-') + ' cut ' + p.cut.padEnd(36) + ' kept ' + String(Math.round(p.keep * 100)).padStart(3) + '%  → ' + p.add.padEnd(36) + ' added ' + String(Math.round(p.addRate * 100)).padStart(3) + '%')); }
}
out.total = {score:+tot.score.toFixed(2), swaps:tot.swaps, ag10:+(tot.ag / tot.n).toFixed(3), ag5:+(tot.a5 / tot.n).toFixed(3), row5:+(tot.rw / tot.n).toFixed(3), gain5:+(tot.g5 / tot.n).toFixed(2), regret:+(tot.rg / tot.n).toFixed(3), cutRank:+(tot.cr / tot.n).toFixed(3), addRank:+(tot.ar / tot.n).toFixed(3)};
fs.mkdirSync(path.resolve(__dirname, '../out/bench'), {recursive:true});
fs.writeFileSync(path.resolve(__dirname, '../out/bench/' + label + '-' + which + '.json'), JSON.stringify(out, null, 1));
console.log('\n' + 'deck'.padEnd(20) + 'copies swaps  agree@10 ceil@10 keep@10 add@10 | sum   90% CI         recall');
for (const [k, r] of Object.entries(out.decks)) console.log(k.padEnd(20) + String(r.upgraded).padStart(6) + String(r.swaps).padStart(6) + String(r.ag10).padStart(9) + String(r.ceil10).padStart(8) + String(r.keep10).padStart(8) + String(r.add10).padStart(7) + ' | ' + String(r.score).padStart(6) + '  ' + JSON.stringify(r.ci90).padEnd(15) + r.cutRecall + ' of ' + r.lowKeep);
if (tot.cpN) console.log('RANK (decks with swaps: ' + tot.cpN + ') cut percentile ' + (tot.cp / tot.cpN).toFixed(2) + ' | add percentile ' + (tot.apc / tot.cpN).toFixed(2) + '  (0.5 = random)');
if (tot.wn) console.log('MEAN weighted (' + process.env.ALSOW + ') agreement@5 ' + (tot.w5 / tot.wn).toFixed(3) + ' row@5 ' + (tot.wr5 / tot.wn).toFixed(3) + ' @10 ' + (tot.w10 / tot.wn).toFixed(3));
console.log('MEAN agreement@5 ' + out.total.ag5 + ' row@5 ' + out.total.row5 + ' gain@5 ' + out.total.gain5 + ' @10 ' + out.total.ag10 + ' | whole-list regret ' + out.total.regret + ' | cutRank ' + out.total.cutRank + ' addRank ' + out.total.addRank + ' | sum ' + out.total.score + ' over ' + out.total.swaps + ' swaps');
