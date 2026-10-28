// Generated decks ("Generate from a commander"): legal? well shaped? like what real players build?
// For each commander: builds the Apex plan the way ui.js startPlan does, then measures it against ALL public decks for that
// commander (not only precon copies). Typicality = mean share of player decks that run each of its spells; compared with the
// median real deck's own typicality (leave-one-out). node gen.js <engineDir> [set] [--aims=edh] [--show]
const path = require('path'), which = process.argv[3] || 'all', show = process.argv.includes('--show'), edhAims = process.argv.includes('--aims=edh');
process.argv = [process.argv[0], 'x', path.resolve(process.argv[2]), 'gen', which, '--quiet'];
const B = require('./bench.js'), H = B.H, X = H.ctx, run = H.run, fs = require('fs');
if (process.env.UP){ X.__up = JSON.parse(process.env.UP); run('Object.assign(UP, __up)'); }
const KN = new Map(run('LIB').map(c => [c._k, c])), mean = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0, med = a => { const s = a.slice().sort((x, y) => x - y); return s.length ? s[s.length >> 1] : 0; };
const list = which === 'all' ? B.SETS.tuneall.concat(B.SETS.test, B.SETS.holdout) : B.SETS[which];
const CORP = ['corpus', 'corpus2', 'corpus3', 'corpus4'].map(x => path.resolve(__dirname, '../../' + x));
const rows = [];
for (const [slug, file] of list){
  const pd = H.retail(slug), cmdN = pd.commander; H.edh(cmdN);
  let decks = []; for (const d of CORP){ const p = path.join(d, file + '.jsonl'); if (fs.existsSync(p)){ decks = fs.readFileSync(p, 'utf8').split('\n').filter(Boolean).map(JSON.parse); break; } }
  const sets = decks.map(x => { const s = new Set(); x.cards.forEach(([n, q, cats, uid]) => { if (!n || (cats || []).includes('Commander')) return; const c = uid && KN.get(uid) || X.find(n); if (c && !run('tags')(c).land) s.add(c._k); }); return s; }).filter(s => s.size >= 40);
  // Leave out decks that are the precon with few changes (≥ 80% of its spells): they say nothing about building from scratch.
  { const P = new Set(pd.cards.map(e => X.find(e.n)).filter(c => c && !run('tags')(c).land).map(c => c._k)); const keep = sets.filter(s => [...P].filter(k => s.has(k)).length < 0.8 * P.size); sets.length = 0; keep.forEach(s => sets.push(s)); }
  if (sets.length < 50) continue;
  const rate = new Map(); sets.forEach(s => s.forEach(k => rate.set(k, (rate.get(k) || 0) + 1)));
  const roleN = (s, r) => [...s].filter(k => run('tags')(KN.get(k)).roles.has(r)).length, realRole = {}; ['ramp', 'draw', 'removal', 'wipe'].forEach(r => realRole[r] = med(sets.map(s => roleN(s, r))));
  const typ = (s, self) => mean([...s].map(k => ((rate.get(k) || 0) - (self ? 1 : 0)) / (sets.length - (self ? 1 : 0))));
  const realTyp = med(sets.map(s => typ(s, true)));
  // build the plan exactly as startPlan does (no seeds, nothing owned)
  X.__n = cmdN; const nd = run(`(() => { const d = {id:'g', name:'g', format:'commander', commander:'', tier:'apex', aims:[], tribe:'', colors:[], aimLocked:false, cards:[], dismissed:[], auto:'commander'}; setCommander(d, __n); return d; })()`);
  if (edhAims){ const E = run('EDH'), t = (E.tags || []).filter(x => E.tmap[x.slug]).slice(0, 3); if (t.length) nd.aims = t.map(x => 'edh:' + x.slug); }
  X.__d = nd; const t0 = Date.now(), plan = run('buildPlan(__d, [], null, new Set())'), ms = Date.now() - t0;
  const deck = JSON.parse(JSON.stringify(nd)); deck.cards = []; plan.forEach(s => { X.__q = deck; X.__a = s.a; X.__k = s.q; run('addCard(__q, __a, __k)'); });
  X.__q = deck; const A = run('analyze(__q)'), v = run('validateDeck(__q)').map(x => x.key), ctx = A.ctx;
  const sp = new Set(deck.cards.map(e => X.find(e.n)).filter(c => c && !run('tags')(c).land).map(c => c._k));
  // colour sources: lands that make each colour of the identity
  const src = {}; ctx.ident.forEach(k => src[k] = 0); deck.cards.forEach(e => { const c = X.find(e.n); if (!c || !run('tags')(c).land) return; const lc = run('landColors')(c); ctx.ident.forEach(k => { if (lc.has(k)) src[k] += e.q; }); });
  const budget = plan.reduce((s, x) => s + (((X.find(run('planPick')(x, 'budget')) || {}).p || 0) * x.q), 0), apexCost = plan.reduce((s, x) => s + (((X.find(x.a) || {}).p || 0) * x.q), 0);
  rows.push({slug, cmd:cmdN.split(',')[0], aims:nd.aims, size:A.size, v, lands:A.lands, ramp:A.roles.ramp, draw:A.roles.draw, removal:A.roles.removal, wipe:A.roles.wipe, avg:+A.avg.toFixed(2), src, typ:+typ(sp).toFixed(3), realTyp:+realTyp.toFixed(3), decks:sets.length, apexCost:Math.round(apexCost), budgetCost:Math.round(budget), ms, realRole});
  if (show) console.log(slug, 'spells:', [...sp].map(k => KN.get(k).n + ' ' + Math.round(100 * (rate.get(k) || 0) / sets.length) + '%').join('; '));
}
console.log('commander'.padEnd(14) + 'size  bad  lands ramp draw rem wipe  avg   typical(gen/real deck)  colour sources            apex$ budget$');
rows.forEach(r => console.log(r.cmd.slice(0, 13).padEnd(14) + String(r.size).padEnd(6) + String(r.v.length).padEnd(5) + String(r.lands).padEnd(6) + String(r.ramp).padEnd(5) + String(r.draw).padEnd(5) + String(r.removal).padEnd(4) + String(r.wipe).padEnd(6) + String(r.avg).padEnd(6) + (r.typ + ' / ' + r.realTyp).padEnd(24) + JSON.stringify(r.src).padEnd(26) + String(r.apexCost).padEnd(6) + r.budgetCost));
console.log('\nRoles, generated vs median real deck (ramp / draw / removal / wipes):'); rows.forEach(r => console.log('  ' + r.cmd.slice(0, 13).padEnd(14) + ['ramp', 'draw', 'removal', 'wipe'].map(k => (r[k] + ' vs ' + r.realRole[k]).padEnd(10)).join(' ')));
{ const e = {}; ['ramp', 'draw', 'removal', 'wipe'].forEach(k => e[k] = mean(rows.map(r => Math.abs(r[k] - r.realRole[k])))); console.log('\nRole count gap to the median real deck (mean |difference|): ' + Object.entries(e).map(([k, v]) => k + ' ' + v.toFixed(1)).join(', ')); }
console.log('\nMEAN typicality: generated ' + mean(rows.map(r => r.typ)).toFixed(3) + ' vs median real deck ' + mean(rows.map(r => r.realTyp)).toFixed(3) + ' | generated more typical than the median real deck in ' + rows.filter(r => r.typ >= r.realTyp).length + ' of ' + rows.length +
  ' | invalid decks ' + rows.filter(r => r.v.length || r.size !== 100).length + ' | lands ' + Math.min(...rows.map(r => r.lands)) + '–' + Math.max(...rows.map(r => r.lands)) + ' | ramp<8: ' + rows.filter(r => r.ramp < 8).length + ' draw<8: ' + rows.filter(r => r.draw < 8).length + ' removal<6: ' + rows.filter(r => r.removal < 6).length + ' wipes<2: ' + rows.filter(r => r.wipe < 2).length);
