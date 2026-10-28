// Generated Apex decks vs the strongest real decks for the same commander (declared bracket 4–5 on Archidekt).
// strongTyp = mean share of strong decks that run each generated spell (the median strong deck's own value, leave-one-out,
// is the reference); core = share of the strong decks' core spells (in half or more of them) that the generator includes.
// node genstrong.js <engineDir> [set] [--show]      UP='{...}' for experiments; NOEDH=1 hides the commander's play data
const path = require('path'), fs = require('fs'), which = process.argv[3] || 'tuneall', show = process.argv.includes('--show');
process.argv = [process.argv[0], 'x', path.resolve(process.argv[2]), 'g', which, '--quiet']; const B = require('./bench.js'), H = B.H, X = H.ctx, run = H.run;
if (process.env.UP){ X.__up = JSON.parse(process.env.UP); run('Object.assign(UP, __up)'); }
const KN = new Map(run('LIB').map(c => [c._k, c])), mean = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0, med = a => { const s = a.slice().sort((x, y) => x - y); return s.length ? s[s.length >> 1] : 0; };
const CORP = ['corpus', 'corpus2', 'corpus3', 'corpus4'].map(x => path.resolve(__dirname, '../../' + x));
const list = which === 'all' ? B.SETS.tuneall.concat(B.SETS.test, B.SETS.holdout) : B.SETS[which]; const rows = [];
const FAST = new Set(['Sol Ring', 'Mana Crypt', 'Mana Vault', 'Chrome Mox', 'Mox Diamond', 'Jeweled Lotus', 'Lotus Petal', 'Mox Opal', 'Grim Monolith', 'Ancient Tomb', 'Arcane Signet', 'Fellwar Stone', 'Mind Stone', 'Talisman of Dominance']);
for (const [slug, file] of list){
  const pd = H.retail(slug), cmdN = pd.commander; H.edh(cmdN);
  // NOEDH=1: an obscure commander with no play data at all (only the card text guides the build)
  if (process.env.NOEDH) run("EDH={key:'',map:null,decks:0,state:'fail'}");
  // FALL=1 (Build 145): with no play data, the commander's tribe and theme pages are loaded, as ui.js loadEdh does
  if (process.env.NOEDH && process.env.FALL){ X.__fn = cmdN; X.__fp = pd.partner || ''; const T = run('fallTags(__fn, __fp)'), TD = path.resolve(__dirname, '../data2/tags');
    X.__fall = T.map(t => { const f = path.join(TD, t.path.replace(/\//g, '_') + '.json'); return fs.existsSync(f) && fs.statSync(f).size > 500 ? [t.label, JSON.parse(fs.readFileSync(f))] : null; }).filter(Boolean);
    run("EDH = {key:find(__fn).n, map:null, decks:0, state:'fail', tags:[], tmap:{}, fall:__fall.map(([label, j]) => ({label, map:parseTag(j)}))}"); }
  let decks = []; for (const d of CORP){ const p = path.join(d, file + '.jsonl'); if (fs.existsSync(p)){ decks = fs.readFileSync(p, 'utf8').split('\n').filter(Boolean).map(JSON.parse); break; } }
  const toSet = x => { const s = new Set(); x.cards.forEach(([n, q, cats, uid]) => { if (!n || (cats || []).includes('Commander') || (cats || []).some(t => /Maybe|Side/i.test(t))) return; const c = X.find(n); if (c && !run('tags')(c).land) s.add(c._k); }); return s; };
  const strong = decks.filter(x => x.bracket >= 4).map(toSet).filter(s => s.size >= 40);
  if (strong.length < 4) continue;
  const rate = new Map(); strong.forEach(s => s.forEach(k => rate.set(k, (rate.get(k) || 0) + 1)));
  const typ = (s, self) => mean([...s].map(k => ((rate.get(k) || 0) - (self ? 1 : 0)) / (strong.length - (self ? 1 : 0))));
  const realTyp = med(strong.map(s => typ(s, true))), core = [...rate.entries()].filter(([, v]) => v / strong.length >= 0.5).map(([k]) => k);
  X.__n = cmdN; X.__pp = pd.partner || ''; const nd = run(`(() => { const d = {id:'g', name:'g', format:'commander', commander:'', tier:'apex', aims:[], tribe:'', colors:[], aimLocked:false, cards:[], dismissed:[], auto:'commander'}; setCommander(d, __n); if (__pp) d.partner = __pp; return d; })()`);
  if (process.env.AIMS === 'edh'){ const E = run('EDH'), t = (E.tags || []).filter(x => E.tmap[x.slug]).slice(0, 3); if (t.length) nd.aims = t.map(x => 'edh:' + x.slug); }
  if (process.env.AIMS === 'mix'){ const E = run('EDH'), t = (E.tags || []).filter(x => E.tmap[x.slug]).slice(0, 2).map(x => 'edh:' + x.slug); nd.aims = t.concat(nd.aims).filter((a, i, A) => A.indexOf(a) === i).slice(0, 3); }
  X.__d = nd; const t0 = Date.now(), plan = run('buildPlan(__d, [], null, new Set())'), ms = Date.now() - t0;
  const deck = JSON.parse(JSON.stringify(nd)); deck.cards = []; plan.forEach(s => { X.__q = deck; X.__a = s.a; X.__k = s.q; run('addCard(__q, __a, __k)'); });
  X.__q = deck; const A = run('analyze(__q)'), sp = new Set(deck.cards.map(e => X.find(e.n)).filter(c => c && !run('tags')(c).land).map(c => c._k));
  const P = new Set(pd.cards.map(e => X.find(e.n)).filter(c => c && !run('tags')(c).land).map(c => c._k));
  const power = s => { const cs = [...s].map(k => KN.get(k)).filter(Boolean); return {gc:cs.filter(c => c.gc).length, tut:cs.filter(c => run('tags')(c).roles.has('tutor')).length, fast:cs.filter(c => FAST.has(c.n)).length, int:cs.filter(c => { const r = run('tags')(c).roles; return r.has('removal') || r.has('counter') || r.has('wipe'); }).length, mv:+mean(cs.map(c => c.cmc)).toFixed(2)}; };
  const sp0 = strong.map(power), realP = {}; ['gc', 'tut', 'fast', 'int', 'mv'].forEach(k => realP[k] = med(sp0.map(x => x[k])));
  const score = run('evaluateDeck(__q, {games:200}).exact');
  // MID=1 (Build 145): the app's own Mid build (genDeck at Mid), against the strong decks' cards under $12: its typicality, and the
  // best a Mid deck could do (the strong decks' most-run spells under $12, as many as the Mid deck has)
  if (process.env.MID){ X.__m = JSON.parse(JSON.stringify(nd)); run('genDeck(__m, [], null, new Set(), "mid")'); const md = run('__m'), ms = new Set(md.cards.map(e => X.find(e.n)).filter(c => c && !run('tags')(c).land).map(c => c._k));
    const cheap = [...rate.entries()].filter(([k]) => { const c = KN.get(k); return c && c.p != null && c.p < 12; }).sort((a, b) => b[1] - a[1]).slice(0, ms.size).map(([k]) => k);
    (globalThis.__mid = globalThis.__mid || []).push([typ(ms), typ(new Set(cheap)), +run('evaluateDeck(__m, {apex:apexRef(__m), games:300}).exact').toFixed(1)]);
    if (show) console.log(slug, 'mid misses:', cheap.filter(k => !ms.has(k)).slice(0, 10).map(k => KN.get(k).n + ' ' + Math.round(100 * rate.get(k) / strong.length) + '%').join('; ')); }
  rows.push({slug, n:strong.length, typ:+typ(sp).toFixed(3), realTyp:+realTyp.toFixed(3), precon:+typ(P).toFixed(3), core:core.length ? +(core.filter(k => sp.has(k)).length / core.length).toFixed(2) : null, nCore:core.length, pw:power(sp), realP, score:+score.toFixed(1), ms, lands:A.lands});
  if (show) console.log(slug, 'missing strong core:', core.filter(k => !sp.has(k)).map(k => KN.get(k).n + ' ' + Math.round(100 * rate.get(k) / strong.length) + '%').join('; '));
}
console.log('deck'.padEnd(20) + 'strong  gen/real-strong/precon   core   GC  tut fast int  mv   (strong median)          score');
rows.forEach(r => console.log(r.slug.padEnd(20) + String(r.n).padEnd(8) + (r.typ + '/' + r.realTyp + '/' + r.precon).padEnd(26) + String(r.core).padEnd(7) + [r.pw.gc, r.pw.tut, r.pw.fast, r.pw.int, r.pw.mv].join(' ').padEnd(18) + ('(' + [r.realP.gc, r.realP.tut, r.realP.fast, r.realP.int, r.realP.mv].join(' ') + ')').padEnd(22) + r.score));
if (globalThis.__mid) console.log('MID typicality: app ' + mean(__mid.map(x => x[0])).toFixed(3) + ' | best possible ' + mean(__mid.map(x => x[1])).toFixed(3) + ' | Mid deck score ' + mean(__mid.map(x => x[2])).toFixed(1));
console.log('\nMEAN strong-deck typicality: generated ' + mean(rows.map(r => r.typ)).toFixed(3) + ' | median strong deck ' + mean(rows.map(r => r.realTyp)).toFixed(3) + ' | precon ' + mean(rows.map(r => r.precon)).toFixed(3) + ' | strong-core coverage ' + mean(rows.filter(r => r.core != null).map(r => r.core)).toFixed(2) +
  ' | gen beats median strong deck in ' + rows.filter(r => r.typ >= r.realTyp).length + '/' + rows.length + ' | GC ' + mean(rows.map(r => r.pw.gc)).toFixed(1) + ' vs ' + mean(rows.map(r => r.realP.gc)).toFixed(1) + ' | tutors ' + mean(rows.map(r => r.pw.tut)).toFixed(1) + ' vs ' + mean(rows.map(r => r.realP.tut)).toFixed(1) + ' | interaction ' + mean(rows.map(r => r.pw.int)).toFixed(1) + ' vs ' + mean(rows.map(r => r.realP.int)).toFixed(1) + ' | mv ' + mean(rows.map(r => r.pw.mv)).toFixed(2) + ' vs ' + mean(rows.map(r => r.realP.mv)).toFixed(2) + ' | score ' + mean(rows.map(r => r.score)).toFixed(1));
