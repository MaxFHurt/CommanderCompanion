// Every benchmark deck: is any card suggested on two rows (any price column)? node dupall.js <dir>
const path = require('path'); process.argv = [process.argv[0], 'x', path.resolve(process.argv[2]), 'g', 'all', '--quiet']; const B = require('./bench.js'), H = B.H, X = H.ctx, run = H.run; let bad = 0, n = 0;
for (const s of ['tuneall', 'test', 'holdout']) for (const [slug] of B.SETS[s]){ const d = H.retail(slug); H.edh(d.commander); X.__d = d; n++;
  const dup = run(`(() => { const R = upgradePaths(__d); scoreCheck(__d, R, {apex:apexRef(__d)}); const seen = new Map(), dup = []; R.paths.forEach((L, i) => new Set(['apex', 'mid', 'budget'].map(t => L.opts[t] && L.opts[t].add).filter(Boolean)).forEach(a => { if (seen.has(a) && seen.get(a) !== i) dup.push(a); seen.set(a, i); })); return dup; })()`);
  if (dup.length){ bad++; console.log(slug, 'twice:', dup.join(', ')); } }
console.log('decks', n, 'with a card on two rows', bad);
