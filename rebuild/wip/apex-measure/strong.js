// node strong.js <candidateDir> <out.json> [w list]   per blend weight w (UP.strPopW = 1 - w), the generated deck finished by
// strFinish, compared with real strong decks:
//   tourney: 10 tournament commanders, 20 top-16 lists each: match (share of our cards each list runs), core (share of cards in
//            half the lists we include), for Apex and Mid
//   strong:  tuneall + test precon commanders, bracket 4+ player decks: typicality (mean share of strong decks running each of
//            our spells), strong-core coverage
const path = require('path'), fs = require('fs');
const [CD, OUT, WL] = process.argv.slice(2), TD = path.resolve(CD, '../tests');
const B = require(path.join(TD, 'bench.js')), H = B.H, X = H.ctx, run = H.run;
const WS = (WL || '0,0.25,0.5,0.75,1').split(',').map(Number);
const mean = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0;
const LIST = require(path.join(TD, 'tourney-list.js')), TRD = path.resolve(TD, '../tourney'), ZF = path.join(TD, 'tourney-data.json.gz');
if (!fs.existsSync(TRD) && fs.existsSync(ZF)) { const Z = JSON.parse(require('zlib').gunzipSync(fs.readFileSync(ZF))), ED = path.resolve(TD, '../data2/edhrec'); fs.mkdirSync(TRD, {recursive: true}); fs.mkdirSync(ED, {recursive: true});
  for (const f in Z.tourney) fs.writeFileSync(path.join(TRD, f), Z.tourney[f]); for (const f in Z.edhrec) if (!fs.existsSync(path.join(ED, f))) fs.writeFileSync(path.join(ED, f), Z.edhrec[f]); }
const tags = run('tags'), key = n => { const c = X.find(n); return c && !run('isBasic')(c.n) && !tags(c).land ? c._k : null; };
function gen(cmd, partner, tier) {
  X.__n = cmd; X.__pp = partner || '';
  const nd = run(`(() => { const d = {id:'g', name:'g', format:'commander', commander:'', tier:'apex', aims:[], tribe:'', colors:[], aimLocked:false, cards:[], dismissed:[], auto:'commander'}; setCommander(d, __n); if (__pp) setPartner(d, __pp); return d; })()`);
  const E = run('EDH'), t = (E.tags || []).filter(x => E.tmap && E.tmap[x.slug]).slice(0, 3);
  if (t.length) nd.aims = t.map(x => 'edh:' + x.slug);
  X.__m = nd; X.__f = tier; run('genDeck(__m, [], null, new Set(), __f)');
  return JSON.parse(JSON.stringify(run('__m')));
}
function finish(d0, tier, w) {
  X.__w = 1 - w; run('UP.strPopW = __w');
  const d = JSON.parse(JSON.stringify(d0)); X.__m = d; X.__f = tier;
  const n = run('strFinish(__m, __f, new Set())'), e = run('evaluateDeck(__m, {games: 200, apex: apexRef(__m), str: strengthOn(__m)})');
  return {d: run('__m'), n, score: e.total, mana: e.parts.mana, cmdT6: e.sim ? e.sim.cmdByT6 : null};
}
const out = {tourney: {}, strong: {}};
for (const T of LIST) {
  const f = path.join(TRD, H.slug(T.commander) + '.json'); if (!fs.existsSync(f)) continue;
  const J = JSON.parse(fs.readFileSync(f)); H.edh(T.commander);
  const skip = new Set([key(T.commander), T.partner && key(T.partner)].filter(Boolean));
  const lists = J.lists.map(L => new Set(L.cards.map(key).filter(k => k && !skip.has(k))));
  const rate = new Map(); lists.forEach(s => s.forEach(k => rate.set(k, (rate.get(k) || 0) + 1)));
  const core = [...rate.entries()].filter(([, v]) => v / lists.length >= 0.5).map(([k]) => k);
  const ks = d => new Set(d.cards.map(e => key(e.n)).filter(k => k && !skip.has(k)));
  const match = s => mean(lists.map(L => [...s].filter(k => L.has(k)).length / Math.max(1, s.size)));
  const r = out.tourney[T.commander] = {};
  for (const tier of ['apex', 'mid']) {
    let g; try { run('UP.strPopW = 0'); g = gen(T.commander, T.partner, tier); } catch (e) { r[tier] = {err: String(e).slice(0, 200)}; continue; }
    const s0 = ks(g); r[tier] = {gen: {match: +match(s0).toFixed(3), core: +(core.filter(k => s0.has(k)).length / Math.max(1, core.length)).toFixed(3)}};
    for (const w of WS) {
      try { const F = finish(g, tier, w), s = ks(F.d);
        r[tier]['w' + w] = {match: +match(s).toFixed(3), core: +(core.filter(k => s.has(k)).length / Math.max(1, core.length)).toFixed(3), swaps: F.n, score: F.score, mana: F.mana, cmdT6: F.cmdT6};
      } catch (e) { r[tier]['w' + w] = {err: String(e).slice(0, 200)}; }
    }
    console.error('T', T.commander, tier, JSON.stringify(r[tier]));
  }
}
const CORP = ['corpus', 'corpus2', 'corpus3', 'corpus4'].map(x => path.resolve(TD, '../../' + x));
for (const [slug, file] of B.SETS.tuneall.concat(B.SETS.test)) {
  let decks = []; for (const dd of CORP) { const p = path.join(dd, file + '.jsonl'); if (fs.existsSync(p)) { decks = fs.readFileSync(p, 'utf8').split('\n').filter(Boolean).map(JSON.parse); break; } }
  const toSet = x => { const s = new Set(); x.cards.forEach(([n, q, cats]) => { if (!n || (cats || []).includes('Commander') || (cats || []).some(t => /Maybe|Side/i.test(t))) return; const k = key(n); if (k) s.add(k); }); return s; };
  const strong = decks.filter(x => x.bracket >= 4).map(toSet).filter(s => s.size >= 40);
  if (strong.length < 4) continue;
  const pd = H.retail(slug); H.edh(pd.commander);
  const rate = new Map(); strong.forEach(s => s.forEach(k => rate.set(k, (rate.get(k) || 0) + 1)));
  const typ = s => mean([...s].map(k => (rate.get(k) || 0) / strong.length)), core = [...rate.entries()].filter(([, v]) => v / strong.length >= 0.5).map(([k]) => k);
  const ks = d => new Set(d.cards.map(e => key(e.n)).filter(k => k && k !== key(pd.commander)));
  let g; try { run('UP.strPopW = 0'); g = gen(pd.commander, pd.partner, 'apex'); } catch (e) { continue; }
  const r = out.strong[slug] = {n: strong.length, gen: {typ: +typ(ks(g)).toFixed(3), cov: +(core.filter(k => ks(g).has(k)).length / Math.max(1, core.length)).toFixed(3)}};
  for (const w of WS) { try { const F = finish(g, 'apex', w), s = ks(F.d); r['w' + w] = {typ: +typ(s).toFixed(3), cov: +(core.filter(k => s.has(k)).length / Math.max(1, core.length)).toFixed(3), swaps: F.n}; } catch (e) { r['w' + w] = {err: String(e).slice(0, 200)}; } }
  console.error('S', slug, JSON.stringify(r));
}
fs.writeFileSync(OUT, JSON.stringify(out, null, 1));
