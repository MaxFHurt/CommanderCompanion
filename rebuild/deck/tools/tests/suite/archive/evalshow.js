const path = require('path'), H = require('./h.js')(path.resolve(process.argv[2])), X = H.ctx, run = H.run;
for (const slug of process.argv.slice(3)){ const d = H.retail(slug); H.edh(d.commander); X.__d = d; const e = run('evaluateDeck(__d)');
  console.log('\n' + d.commander, e.total, JSON.stringify(e.parts)); for (const k in e.why) console.log('  ' + k + ': ' + e.why[k]); console.log('  finishers: ' + e.finishers.join('; ')); console.log('  near combos: ' + e.combos.near.map(x => x.x.names.join('+') + ' (need ' + x.miss + ') ' + x.x.what).join(' | ')); }
