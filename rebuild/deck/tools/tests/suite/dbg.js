// Debug: per-card value parts for a deck. node dbg.js <engineDir> <slug>
const path = require('path'), H = require('./h.js')(path.resolve(process.argv[2])), X = H.ctx, run = H.run;
const d = H.retail(process.argv[3]); H.edh(d.commander); X.__d = d;
run(`(()=>{ const ctx = ctxOf(__d); __ctx = ctx; })()`);
const rows = d.cards.map(e => { X.__c = X.find(e.n); if (!X.__c) return null; return run(`(()=>{ const c=__c, t=tags(c); if (t.land) return null; const e=EDH.map&&EDH.map.get(c._n); const b=baseScore(c, Object.assign({}, __d, {tier:'apex'}), __ctx); return {n:c.n, inc:e?e.inc:null, syn:e?e.syn:null, base:+b.s.toFixed(1), aim:+b.a.toFixed(1), jobs:jobsOf(c.n).join('/'), r:c.r, cmc:c.cmc, ft:foreignTribe(c)}; })()`); }).filter(Boolean);
rows.sort((a, b) => (a.inc || 0) - (b.inc || 0));
console.log('aims', d.aims, 'tribe', d.tribe);
rows.forEach(r => console.log(r.n.padEnd(36), 'inc', String(r.inc).padEnd(6), 'syn', String(r.syn).padEnd(6), 'base', String(r.base).padEnd(6), 'aim', String(r.aim).padEnd(5), 'rank', String(r.r).padEnd(6), r.jobs, r.ft ? 'FT:' + r.ft : ''));
