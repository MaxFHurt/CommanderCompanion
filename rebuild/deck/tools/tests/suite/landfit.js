// Fit a land-count formula to EDHREC averages: lands ~ average deck's mana value, ramp, card draw, commander cost, landfall.
const path = require('path'), fs = require('fs'), H = require('./h.js')(path.resolve(process.argv[2])), X = H.ctx, run = H.run;
const dirs = [path.resolve(__dirname, '../snapshot/edhrec'), path.resolve(__dirname, '../data2/edhrec')], seen = new Set(), rows = [];
for (const D of dirs) for (const f of fs.readdirSync(D).filter(f => /^[a-z0-9-]+\.json$/.test(f))){ if (seen.has(f)) continue; seen.add(f);
  const j = JSON.parse(fs.readFileSync(path.join(D, f))); X.__j = j; const y = run('parseLands(__j)'); if (!y) continue;
  const cards = []; ((j.container && j.container.json_dict && j.container.json_dict.cardlists) || []).forEach(L => (L.cardviews || []).forEach(v => { if (v.name && v.potential_decks) cards.push([v.name, Math.min(1, v.num_decks / v.potential_decks)]); }));
  const cmd = j.container && j.container.json_dict && j.container.json_dict.card && j.container.json_dict.card.name; X.__c = cards; X.__cmd = cmd || '';
  const r = run(`(() => { const by = new Map(); __c.forEach(([n, i]) => { const c = find(n); if (c && (!by.has(c._n) || by.get(c._n).i < i)) by.set(c._n, {c, i}); });
    let w = 0, mv = 0, ramp = 0, draw = 0, cheap = 0, landfall = 0; by.forEach(({c, i}) => { if (tags(c).land) return; w += i; mv += i * (c.cmc || 0); const R = tags(c).roles; if (R.has('ramp')){ ramp += i; if ((c.cmc || 0) <= 2) cheap += i; } if (R.has('draw')) draw += i; if (THEMES.lands.re.test(c.o || '')) landfall += i; });
    const cm = find(__cmd); return {w, avg:w ? mv / w : 0, ramp, draw, cheap, landfall, cmc:cm ? cm.cmc : 0, name:cm ? cm.n : __cmd}; })()`);
  if (r.w < 20) continue; rows.push(Object.assign(r, {y})); }
console.log('commanders', rows.length, 'mean lands', (rows.reduce((a, r) => a + r.y, 0) / rows.length).toFixed(2));
// least squares with leave-one-out error
const F = process.env.SIMPLE ? (r => [1, r.avg, r.cheap, r.landfall]) : (r => [1, r.avg, r.ramp, r.cheap, r.draw, r.cmc, r.landfall]);
function fit(R){ const k = F(R[0]).length, A = Array.from({length:k}, () => Array(k).fill(0)), b = Array(k).fill(0);
  R.forEach(r => { const x = F(r); for (let i = 0; i < k; i++){ b[i] += x[i] * r.y; for (let j = 0; j < k; j++) A[i][j] += x[i] * x[j]; } });
  for (let i = 0; i < k; i++) A[i][i] += 1e-6 + (i ? 0.5 : 0);   // light ridge
  for (let i = 0; i < k; i++){ let p = i; for (let r = i + 1; r < k; r++) if (Math.abs(A[r][i]) > Math.abs(A[p][i])) p = r; [A[i], A[p]] = [A[p], A[i]]; [b[i], b[p]] = [b[p], b[i]];
    for (let r = 0; r < k; r++) if (r !== i){ const m = A[r][i] / A[i][i]; for (let c = i; c < k; c++) A[r][c] -= m * A[i][c]; b[r] -= m * b[i]; } }
  return b.map((v, i) => v / A[i][i]); }
const pred = (w, r) => F(r).reduce((a, x, i) => a + x * w[i], 0);
const W = fit(rows); let e0 = 0, e1 = 0, eloo = 0;
rows.forEach((r, i) => { e0 += Math.abs(r.y - 37); e1 += Math.abs(r.y - pred(W, r)); const w2 = fit(rows.filter((_, j) => j !== i)); eloo += Math.abs(r.y - Math.max(31, Math.min(42, pred(w2, r)))); });
console.log('weights [1, avgMV, ramp, cheapRamp, draw, cmdMV, landfall]', W.map(x => x.toFixed(3)).join(', '));
console.log('mean abs error: flat 37', (e0 / rows.length).toFixed(2), '| formula (fit)', (e1 / rows.length).toFixed(2), '| formula (leave-one-out)', (eloo / rows.length).toFixed(2));
rows.sort((a, b) => a.y - b.y).filter((_, i) => i % 12 === 0).forEach(r => console.log(r.name.slice(0, 28).padEnd(28), 'real', r.y.toFixed(1), 'formula', pred(W, r).toFixed(1), 'avgMV', r.avg.toFixed(2), 'ramp', r.ramp.toFixed(1)));
