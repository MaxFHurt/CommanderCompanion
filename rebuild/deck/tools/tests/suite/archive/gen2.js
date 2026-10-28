// Generated decks judged by the whole-deck evaluator and against real decks. node gen2.js <engineDir> [set] [--fn=buildPlanName] [--aims=edh]
// Per commander: the generated Apex deck's evaluator score (and parts), typicality (mean share of real decks running its spells),
// role gaps, validity; plus the median real deck's evaluator score for the same commander (from evalcal JSON if given).
const path = require('path'), fs = require('fs'), which = process.argv[3] || 'all', edhAims = process.argv.includes('--aims=edh'), fnA = process.argv.find(a => a.startsWith('--fn=')), FN = fnA ? fnA.slice(5) : 'buildPlan';
process.argv = [process.argv[0], 'x', path.resolve(process.argv[2]), 'gen', which, '--quiet'];
const B = require('./bench.js'), H = B.H, X = H.ctx, run = H.run;
if (process.env.UP){ X.__up = JSON.parse(process.env.UP); run('Object.assign(UP, __up)'); }
const KN = new Map(run('LIB').map(c => [c._k, c])), OID = new Map(run('LIB').filter(c => c.oid).map(c => [c.oid, c])), mean = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0, med = a => { const s = a.slice().sort((x, y) => x - y); return s.length ? s[s.length >> 1] : 0; };
const list = which === 'all' ? B.SETS.tuneall.concat(B.SETS.test, B.SETS.holdout) : B.SETS[which];
const CORP = ['corpus', 'corpus2', 'corpus3', 'corpus4'].map(x => path.resolve(__dirname, '../../' + x));
const REAL = process.env.REAL ? JSON.parse(fs.readFileSync(process.env.REAL)).ROWS : [];
const K = ['synergy', 'balance', 'quality', 'routes', 'mana'], rows = [];
for (const [slug, file] of list){
  const pd = H.retail(slug), cmdN = pd.commander; H.edh(cmdN);
  let decks = []; for (const d of CORP){ const p = path.join(d, file + '.jsonl'); if (fs.existsSync(p)){ decks = fs.readFileSync(p, 'utf8').split('\n').filter(Boolean).map(JSON.parse); break; } }
  const sets = decks.map(x => { const s = new Set(); x.cards.forEach(([n, q, cats, uid]) => { if (!n || (cats || []).includes('Commander')) return; const c = uid && OID.get(uid) || X.find(n); if (c && !run('tags')(c).land) s.add(c._k); }); return s; }).filter(s => s.size >= 40);
  { const P = new Set(pd.cards.map(e => X.find(e.n)).filter(c => c && !run('tags')(c).land).map(c => c._k)); const keep = sets.filter(s => [...P].filter(k => s.has(k)).length < 0.8 * P.size); sets.length = 0; keep.forEach(s => sets.push(s)); }
  const rate = new Map(); sets.forEach(s => s.forEach(k => rate.set(k, (rate.get(k) || 0) + 1)));
  const realRole = {}; ['ramp', 'draw', 'removal', 'wipe'].forEach(r => realRole[r] = med(sets.map(s => [...s].filter(k => run('tags')(KN.get(k)).roles.has(r)).length)));
  X.__n = cmdN; const nd = run(`(() => { const d = {id:'g', name:'g', format:'commander', commander:'', tier:'apex', aims:[], tribe:'', colors:[], aimLocked:false, cards:[], dismissed:[], auto:'commander'}; setCommander(d, __n); return d; })()`);
  if (pd.partner){ X.__d = nd; X.__p = pd.partner; run('setPartner(__d, __p)'); }
  if (edhAims){ const E = run('EDH'), t = (E.tags || []).filter(x => E.tmap[x.slug]).slice(0, 3); if (t.length) nd.aims = t.map(x => 'edh:' + x.slug); }
  X.__d = nd; const t0 = Date.now(), plan = run(FN + '(__d, [], null, new Set())'), ms = Date.now() - t0;
  const deck = JSON.parse(JSON.stringify(nd)); deck.cards = []; plan.forEach(s => { X.__q = deck; X.__a = s.a; X.__k = s.q; run('addCard(__q, __a, __k)'); });
  X.__q = deck; const A = run('analyze(__q)'), v = run('validateDeck(__q)').map(x => x.key), ev = run('evaluateDeck(__q)');
  const sp = new Set(deck.cards.map(e => X.find(e.n)).filter(c => c && !run('tags')(c).land).map(c => c._k)), typ = sets.length ? mean([...sp].map(k => (rate.get(k) || 0) / sets.length)) : NaN;
  const real = REAL.filter(r => r.cmd === cmdN), realT = real.length ? med(real.map(r => r.total)) : NaN, realTop = real.length ? real.map(r => r.total).sort((a, b) => a - b)[Math.floor(real.length * 0.9)] : NaN;
  rows.push({cmd:cmdN.split(',')[0], v, size:A.size, ev, typ, realT, realTop, gap:['ramp', 'draw', 'removal', 'wipe'].map(r => Math.abs(A.roles[r] - realRole[r])), ms, lands:A.lands});
  console.log(cmdN.split(',')[0].slice(0, 14).padEnd(15), 'valid', (v.length || A.size !== 100 ? 'NO ' + v.join(',') : 'yes'), '| eval', String(ev.total).padEnd(3), '(real median ' + realT + ', top tenth ' + realTop + ')', K.map(k => k.slice(0, 3) + ' ' + ev.parts[k]).join(' '), '| typical', typ.toFixed(3), '| lands', A.lands, '| stuck', ev.sim.colourStuck, 'screw', ev.sim.screwT5, '| wins', ev.combos.win.length, 'fin', ev.finishers.length, 'weak', [...new Set(ev.weak.map(w => w.n + ' (' + w.label + ' ' + w.have + ')'))].join('; '), '|', ms + 'ms');
  if (process.env.SHOW) console.log('   ' + Object.values(ev.why).join(' || '));
}
console.log('\nMEAN eval ' + mean(rows.map(r => r.ev.total)).toFixed(1) + ' (real median ' + mean(rows.filter(r => !isNaN(r.realT)).map(r => r.realT)).toFixed(1) + ', real top tenth ' + mean(rows.filter(r => !isNaN(r.realTop)).map(r => r.realTop)).toFixed(1) + ') | parts ' + K.map(k => k + ' ' + mean(rows.map(r => r.ev.parts[k])).toFixed(1)).join(', ') +
  ' | typicality ' + mean(rows.map(r => r.typ)).toFixed(3) + ' | role gap ' + mean(rows.map(r => mean(r.gap))).toFixed(2) + ' | invalid ' + rows.filter(r => r.v.length || r.size !== 100).length + ' | beats real median ' + rows.filter(r => r.ev.total > r.realT).length + '/' + rows.length + ', beats real top tenth ' + rows.filter(r => r.ev.total >= r.realTop).length + ' | mean ms ' + mean(rows.map(r => r.ms)).toFixed(0));
