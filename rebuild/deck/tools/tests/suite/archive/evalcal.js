// Evaluator calibration and sanity checks against real decks. node evalcal.js <engineDir> [perCmd] [set]
// For each commander: raw category scores of up to N real player decks (Archidekt corpus), the retail precon, the precon with
// 10 random spells swapped for random legal cards ("degraded"), and the precon with its lands cut to 31 ("land-light").
const path = require('path'), fs = require('fs'), N = +(process.argv[3] || 30), which = process.argv[4] || 'all';
process.argv = [process.argv[0], 'x', path.resolve(process.argv[2]), 'gen', 'all', '--quiet'];
const B = require('./bench.js'), H = B.H, X = H.ctx, run = H.run;
const KN = new Map(run('LIB').map(c => [c._k, c])), OID = new Map(run('LIB').filter(c => c.oid).map(c => [c.oid, c]));
const list = which === 'all' ? B.SETS.tuneall.concat(B.SETS.test, B.SETS.holdout) : B.SETS[which];
const CORP = ['corpus', 'corpus2', 'corpus3', 'corpus4'].map(x => path.resolve(__dirname, '../../' + x));
const q = (a, p) => { const s = a.slice().sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };
const spear = (a, b) => { const r = v => { const o = v.map((x, i) => [x, i]).sort((p, q) => p[0] - q[0]), R = []; o.forEach(([, i], k) => R[i] = k); return R; }; const x = r(a), y = r(b), n = a.length, mx = (n - 1) / 2; let s = 0, sx = 0, sy = 0; for (let i = 0; i < n; i++){ s += (x[i] - mx) * (y[i] - mx); sx += (x[i] - mx) ** 2; sy += (y[i] - mx) ** 2; } return s / Math.sqrt(sx * sy); };
const K = ['synergy', 'balance', 'quality', 'routes', 'mana'], all = {}; K.forEach(k => all[k] = []);
const out = [], ROWS = []; let rnd = 12345; const R = () => (rnd = (rnd * 1103515245 + 12345) % 2147483648) / 2147483648;
const ev = d => { X.__d = d; return run('evaluateDeck(__d, {games:200})'); };
for (const [slug, file] of list){
  const pd = H.retail(slug), cmdN = pd.commander; H.edh(cmdN); const E = run('EDH');
  if (process.env.AIMS === 'edh'){ const t = (E.tags || []).filter(x => E.tmap[x.slug]).slice(0, 3); if (t.length) pd.aims = t.map(x => 'edh:' + x.slug); }
  let decks = []; for (const d of CORP){ const p = path.join(d, file + '.jsonl'); if (fs.existsSync(p)){ decks = fs.readFileSync(p, 'utf8').split('\n').filter(Boolean).map(JSON.parse); break; } }
  decks = decks.filter(x => x.cards && x.cards.length >= 60);
  const real = [];
  decks.sort((a, b) => (b.views || 0) - (a.views || 0));
  const br = decks.filter(x => x.bracket), nb = decks.filter(x => !x.bracket); const pickD = br.slice(0, Math.ceil(N / 2)).concat(nb.filter((x, i) => i % Math.max(1, Math.floor(nb.length / N)) === 0)).slice(0, N);
  for (const x of pickD){ const d = JSON.parse(JSON.stringify(pd)); d.cards = []; let n = 0;
    x.cards.forEach(([nm, qq, cats, uid]) => { if ((cats || []).includes('Commander') || (cats || []).includes('Maybeboard') || (cats || []).includes('Sideboard')) return; const c = (uid && OID.get(uid)) || X.find(nm); if (!c || c.n === pd.commander || c.n === pd.partner) return; X.__q = d; X.__a = c.n; X.__k = qq || 1; run('addCard(__q, __a, __k)'); n += qq || 1; });
    if (n < 95 || n > 101) continue; const r = ev(d); r.views = x.views || 0; r.bracket = x.bracket || 0; { const P = new Set(pd.cards.map(e => e.n)); r.pov = d.cards.filter(e => P.has(e.n)).length / d.cards.length; } r.price = run('analyze')(d).price; real.push(r); ROWS.push({cmd:cmdN, feat:r.feat, sim:r.sim, u:r.u, raw:r.raw, parts:r.parts, total:r.total, views:r.views, bracket:r.bracket, pov:r.pov, price:r.price}); K.forEach(k => all[k].push(r.raw[k])); }
  const pre = ev(JSON.parse(JSON.stringify(pd)));
  // degraded: 10 spells swapped for random legal, on-colour cards from the whole library
  const deg = JSON.parse(JSON.stringify(pd)), ident = run('ctxOf')(pd).ident, pool = run('LIB').filter(c => !run('tags')(c).land && c.ci.every(z => ident.includes(z)) && run('legalIn')(c, 'commander') && !/Legendary/.test(c.t));
  for (let i = 0; i < 10; i++){ const sp = deg.cards.filter(e => { const c = X.find(e.n); return c && !run('tags')(c).land; }); const e = sp[Math.floor(R() * sp.length)]; X.__q = deg; X.__a = e.n; run('cutCard(__q, __a, 1)'); X.__a = pool[Math.floor(R() * pool.length)].n; run('addCard(__q, __a, 1)'); }
  const dg = ev(deg);
  const ll = JSON.parse(JSON.stringify(pd)); { let cut = (run('analyze')(ll)).lands - 31; const sp = pool.filter(c => c.r && c.r < 3000); while (cut-- > 0){ const e = ll.cards.find(e => { const c = X.find(e.n); return c && run('tags')(c).land; }); X.__q = ll; X.__a = e.n; run('cutCard(__q, __a, 1)'); X.__a = sp[Math.floor(R() * sp.length)].n; run('addCard(__q, __a, 1)'); } }
  const lg = ev(ll);
  const med = k => q(real.map(r => r.parts[k]), 0.5), medT = q(real.map(r => r.total), 0.5);
  const vs = real.length >= 10 ? spear(real.map(r => r.total), real.map(r => Math.log(1 + r.views))) : NaN;
  const built = real.filter(r => r.pov < 0.6), beat = built.filter(r => r.total > pre.total).length; out.push({beat, built:built.length, cmd:cmdN.split(',')[0], n:real.length, medT, pre:pre.total, deg:dg.total, ll:lg.total, vs, preP:pre.parts, degP:dg.parts, llP:lg.parts, medP:Object.fromEntries(K.map(k => [k, med(k)]))});
  console.log(cmdN.split(',')[0].slice(0, 14).padEnd(15), 'real n=' + String(real.length).padEnd(3), 'median real', String(medT).padEnd(4), '| precon', String(pre.total).padEnd(4), '| degraded', String(dg.total).padEnd(4), '| land-light', String(lg.total).padEnd(4), '| ρ(score, views)', isNaN(vs) ? '-' : vs.toFixed(2),
    '|', K.map(k => k.slice(0, 3) + ' ' + out[out.length - 1].medP[k] + '/' + pre.parts[k] + '/' + dg.parts[k] + '/' + lg.parts[k]).join(' '));
}
console.log('\nRAW anchors (median → 60, 90th pct → 85):'); K.forEach(k => console.log('  ' + k.padEnd(8), 'p10 ' + q(all[k], 0.1).toFixed(3), 'p50 ' + q(all[k], 0.5).toFixed(3), 'p90 ' + q(all[k], 0.9).toFixed(3)));
const m = a => a.reduce((x, y) => x + y, 0) / a.length;
console.log('\nreal decks built away from the precon (<60% precon cards) that score above the precon: ' + out.reduce((a, r) => a + r.beat, 0) + '/' + out.reduce((a, r) => a + r.built, 0)); console.log('precon < median real deck: ' + out.filter(r => r.pre < r.medT).length + '/' + out.length + ' | degraded < precon: ' + out.filter(r => r.deg < r.pre).length + '/' + out.length + ' | land-light < precon: ' + out.filter(r => r.ll < r.pre).length + '/' + out.length + ' | mean ρ(score, views) ' + m(out.filter(r => !isNaN(r.vs)).map(r => r.vs)).toFixed(3));
if (process.env.JSON) fs.writeFileSync(process.env.JSON, JSON.stringify({out, all, ROWS}));
