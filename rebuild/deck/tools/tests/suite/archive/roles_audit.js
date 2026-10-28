// Engine role reading vs Scryfall Tagger oracle tags (snapshot/truth.json). node roles_audit.js <engineDir> [role] [n]
const path = require('path'), fs = require('fs'), H = require('./h.js')(path.resolve(process.argv[2])), run = H.run;
const T = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../snapshot/truth.json')));
const MAP = {ramp:['ramp'], draw:['draw'], removal:['removal'], wipe:['boardwipe'], counter:['counterspell'], tutor:['tutor'], protect:['protection']};
const norm = run('norm'), lib = run('LIB.filter(c => c.cmd && !tags(c).land)');
const sets = {}; for (const k in T) sets[k] = new Set(T[k].map(norm));
// Scryfall's removal includes board wipes and its tutors include land searches; the engine files those under wipe and ramp.
// Only cards Scryfall has tagged at all are judged: an untagged card may simply not be reviewed yet.
const tagged = new Set(); for (const k in sets) sets[k].forEach(x => tagged.add(x));
const want = process.argv[3], show = +(process.argv[4] || 0);
for (const role in MAP){ if (want && role !== want) continue;
  let tp = 0, fp = 0, fn = 0; const FP = [], FN = [];
  for (const c of lib){ const n = c._n; if (!tagged.has(n)) continue; const RS = run('tags')(c).roles, e = role === 'removal' ? RS.has('removal') || RS.has('wipe') : role === 'tutor' ? RS.has('tutor') || (RS.has('ramp') && /search your library/i.test(c.o || '')) : RS.has(role), t = MAP[role].some(k => sets[k].has(n));
    if (e && t) tp++; else if (e){ fp++; FP.push(c); } else if (t){ fn++; FN.push(c); } }
  const P = tp / (tp + fp), R = tp / (tp + fn);
  console.log(role.padEnd(8), 'precision', P.toFixed(2), 'recall', R.toFixed(2), 'F1', (2 * P * R / (P + R)).toFixed(2), `(tp ${tp} fp ${fp} fn ${fn})`);
  if (show){ const pop = a => a.sort((x, y) => (x.r || 1e9) - (y.r || 1e9)).slice(0, show);
    console.log('  engine says ' + role + ', Scryfall does not:'); pop(FP).forEach(c => console.log('    ' + c.n + ' :: ' + (c.o || '').replace(/\n/g, ' ').slice(0, 170)));
    console.log('  Scryfall says ' + role + ', engine does not:'); pop(FN).forEach(c => console.log('    ' + c.n + ' :: ' + (c.o || '').replace(/\n/g, ' ').slice(0, 170))); }
}
