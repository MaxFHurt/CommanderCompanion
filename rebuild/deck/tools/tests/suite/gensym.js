// Generate an Apex deck for one commander and show ramp, the on-theme reanimation cards and fast mana. node gensym.js <engineDir> "<commander>"  UP='{...}'
const path = require('path'), H = require('./h.js')(path.resolve(process.argv[2])), X = H.ctx, run = H.run;
if (process.env.UP){ X.__up = JSON.parse(process.env.UP); run('Object.assign(UP, __up)'); }
const cmd = process.argv[3]; H.edh(cmd); if (process.env.NOEDH) run("EDH={key:'',map:null,decks:0,state:'fail'}"); X.__n = cmd;
const nd = run(`(() => { const d = {id:'g', name:'g', format:'commander', commander:'', tier:'apex', aims:[], tribe:'', colors:[], aimLocked:false, cards:[], dismissed:[], auto:'commander'}; setCommander(d, __n); const E = EDH, t = (E.tags || []).filter(x => E.tmap && E.tmap[x.slug]).slice(0, 3); if (t.length) d.aims = t.map(x => 'edh:' + x.slug); return d; })()`);
X.__d = nd; const plan = run('buildPlan(__d, [], null, new Set())'); const deck = JSON.parse(JSON.stringify(nd)); deck.cards = []; plan.forEach(s => { X.__q = deck; X.__a = s.a; X.__k = s.q; run('addCard(__q, __a, __k)'); });
X.__q = deck; const A = run('analyze(__q)'), names = deck.cards.map(e => e.n), tg = run('tags');
console.log('aims', nd.aims.join(','), '| ramp', A.roles.ramp, 'target', A.T.ramp, '| score', run('evaluateDeck(__q, {games:200}).exact'));
console.log('ramp:', names.filter(n => { const c = X.find(n); return c && !tg(c).land && tg(c).roles.has('ramp'); }).join(', '));
console.log('all:', names.join(', '));
console.log('reanimation engines:', names.filter(n => run('isReanimEngine')(X.find(n))).join(', ') || '-');
for (const n of ['The Soul Stone', 'Living Death', 'Lotus Petal', 'Chrome Mox', 'Cabal Ritual', 'Dark Ritual']) console.log('  ', n.padEnd(16), names.includes(n) ? 'IN' : '-');
