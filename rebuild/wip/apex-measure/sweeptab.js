// node sweeptab.js <sweepDir>: one table per blend weight w (1 = option A strength, 0 = commander play rate)
const fs = require('fs'), D = process.argv[2], WS = ['1', '0.75', '0.5', '0.25', '0'];
const J = f => (fs.existsSync(D + '/' + f) ? JSON.parse(fs.readFileSync(D + '/' + f, 'utf8')) : null);
const mean = a => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN), f1 = v => (isNaN(v) ? '—' : v.toFixed(1)), f3 = v => (isNaN(v) ? '—' : v.toFixed(3));
const B = fs.existsSync(D + '/bench.txt') ? fs.readFileSync(D + '/bench.txt', 'utf8').split('\n') : [];
const ag = (w, s, t) => { const l = B.find(x => x.startsWith('w' + w + ' ' + s + ' ' + t + ':')); const m = l && /MEAN agreement@5 (-?[\d.]+)/.exec(l); return m ? m[1] : '—'; };
console.log('| w | agree@5 test A/M/B | agree@5 tuneall A/M/B | precon score / power / synergy / mana / quality | Apex swaps left (precon) |');
console.log('|---|---|---|---|---|');
for (const w of WS) {
  const P = J('pre-w' + w + '.json'), v = P ? Object.values(P).filter(x => !x.err) : [], m = k => f1(mean(v.map(x => x[k])));
  console.log('| ' + w + ' | ' + ['apex', 'mid', 'budget'].map(t => ag(w, 'test', t)).join(' / ') + ' | ' + ['apex', 'mid', 'budget'].map(t => ag(w, 'tuneall', t)).join(' / ') + ' | ' + [m('score'), m('power'), m('synergy'), m('mana'), m('quality')].join(' / ') + ' | ' + f1(mean(v.map(x => x.picks ? x.picks.apex : NaN))) + ' |');
}
console.log('\n| w | generated score (power) apex · mid · budget, Best overall | same, Theme first | swaps by finish A/M/B | Apex picks left |');
console.log('|---|---|---|---|---|');
for (const w of WS) {
  const G = J('gen-w' + w + '.json'); if (!G) continue;
  const cell = (t, th) => { const v = Object.entries(G).filter(([k, x]) => k.endsWith('|' + t + '|' + th) && x.fin).map(([, x]) => x.fin); return f1(mean(v.map(x => x.score))) + ' (' + f1(mean(v.map(x => x.power))) + ')'; };
  const sw = t => f1(mean(Object.entries(G).filter(([k, x]) => k.includes('|' + t + '|') && x.fin).map(([, x]) => x.swapped)));
  const left = f1(mean(Object.entries(G).filter(([k, x]) => k.includes('|apex|') && x.fin).map(([, x]) => x.fin.picks.apex)));
  console.log('| ' + w + ' | ' + ['apex', 'mid', 'budget'].map(t => cell(t, 'best')).join(' · ') + ' | ' + ['apex', 'mid', 'budget'].map(t => cell(t, 'theme')).join(' · ') + ' | ' + ['apex', 'mid', 'budget'].map(sw).join(' / ') + ' | ' + left + ' |');
}
const S = J('strong.json');
if (S) {
  console.log('\n| w | tournament match Apex / core Apex | tournament match Mid | strong-deck typicality / core coverage (Apex) | finished Apex score |');
  console.log('|---|---|---|---|---|');
  const T = Object.values(S.tourney), St = Object.values(S.strong);
  const row = (lab, g) => console.log('| ' + lab + ' | ' + f3(mean(T.map(x => g(x.apex) && g(x.apex).match).filter(v => v != null))) + ' / ' + f3(mean(T.map(x => g(x.apex) && g(x.apex).core).filter(v => v != null))) + ' | ' + f3(mean(T.map(x => g(x.mid) && g(x.mid).match).filter(v => v != null))) + ' | ' + f3(mean(St.map(x => g(x) && g(x).typ).filter(v => v != null))) + ' / ' + f3(mean(St.map(x => g(x) && g(x).cov).filter(v => v != null))) + ' | ' + f1(mean(T.map(x => g(x.apex) && g(x.apex).score).filter(v => v != null))) + ' |');
  row('generator, no finish', x => x && x.gen);
  for (const w of WS) row(w, x => x && x['w' + w]);
}
