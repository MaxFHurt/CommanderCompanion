// node table.js precon|gen  -> markdown table from the before/after json files
const fs = require('fs'), P = __dirname, mode = process.argv[2];
const J = f => JSON.parse(fs.readFileSync(P + '/' + f, 'utf8'));
const ab = (a, b) => (a == null ? '—' : a) + ' → ' + (b == null ? '—' : b);
if (mode === 'precon') {
  const A = J('pre-before.json'), B = J('pre-after.json');
  console.log('| Precon | Score | Power | Card quality | Synergy | Mana | Apex build score | Apex picks (strength list) | Lands | short T5 |');
  console.log('|---|---|---|---|---|---|---|---|---|---|');
  const s = {n: 0};
  for (const k of Object.keys(B)) {
    const a = A[k], b = B[k];
    if (!a || !b || a.err || b.err) { console.log('| ' + k + ' | error |'); continue; }
    console.log('| ' + k + ' | ' + ab(a.score, b.score) + ' | ' + ab(a.power, b.power) + ' | ' + ab(a.quality, b.quality) + ' | ' + ab(a.synergy, b.synergy) + ' | ' + ab(a.mana, b.mana) + ' | ' + ab(a.apexScore, b.apexScore) + ' | ' + ab(a.picks && a.picks.apex, b.picks && b.picks.apex) + ' | ' + ab(a.lands, b.lands) + ' | ' + ab(a.screw, b.short) + ' |');
    for (const f of ['score', 'power', 'quality', 'synergy', 'mana', 'apexScore']) { s['a' + f] = (s['a' + f] || 0) + a[f]; s['b' + f] = (s['b' + f] || 0) + b[f]; }
    s.ap = (s.ap || 0) + a.picks.apex; s.bp = (s.bp || 0) + b.picks.apex; s.n++;
  }
  const m = f => ab((s['a' + f] / s.n).toFixed(1), (s['b' + f] / s.n).toFixed(1));
  console.log('| **mean** | ' + m('score') + ' | ' + m('power') + ' | ' + m('quality') + ' | ' + m('synergy') + ' | ' + m('mana') + ' | ' + m('apexScore') + ' | ' + ab((s.ap / s.n).toFixed(1), (s.bp / s.n).toFixed(1)) + ' | | |');
} else {
  const A = J('gen-before.json'), B = J('gen-after.json');
  console.log('| Deck (commander, tier, theme) | Score | Power | Card quality | Synergy | Mana | Swaps by finish | Picks left at its tier | Lands | Score unfinished, new scale |');
  console.log('|---|---|---|---|---|---|---|---|---|---|');
  const G = {};
  for (const k of Object.keys(B)) {
    const a = A[k] && A[k].gen, b = B[k] && B[k].fin, g = B[k] && B[k].gen, t = k.split('|')[1];
    if (!a || !b) { console.log('| ' + k + ' | error ' + JSON.stringify((A[k] || {}).err || (B[k] || {}).err || '').slice(0, 80) + ' |'); continue; }
    console.log('| ' + k.replace(/\|/g, ' · ') + ' | ' + ab(a.score, b.score) + ' | ' + ab(a.power, b.power) + ' | ' + ab(a.quality, b.quality) + ' | ' + ab(a.synergy, b.synergy) + ' | ' + ab(a.mana, b.mana) + ' | ' + B[k].swapped + ' | ' + ab(a.picks && a.picks[t], b.picks && b.picks[t]) + ' | ' + ab(a.lands, b.lands) + ' | ' + g.score + ' |');
    const gk = t + ' · ' + k.split('|')[2], o = G[gk] || (G[gk] = {n: 0});
    o.n++;
    for (const f of ['score', 'power', 'quality', 'synergy', 'mana', 'lands']) { o['a' + f] = (o['a' + f] || 0) + a[f]; o['b' + f] = (o['b' + f] || 0) + b[f]; }
    o.sw = (o.sw || 0) + B[k].swapped; o.ap = (o.ap || 0) + a.picks[t]; o.bp = (o.bp || 0) + b.picks[t]; o.g = (o.g || 0) + g.score;
  }
  console.log('\n| Tier · theme (mean of ' + 'decks) | Score | Power | Card quality | Synergy | Mana | Swaps by finish | Picks left | Lands | Unfinished, new scale |');
  console.log('|---|---|---|---|---|---|---|---|---|---|');
  for (const gk of Object.keys(G).sort()) {
    const o = G[gk], m = f => ab((o['a' + f] / o.n).toFixed(1), (o['b' + f] / o.n).toFixed(1));
    console.log('| ' + gk + ' (' + o.n + ') | ' + m('score') + ' | ' + m('power') + ' | ' + m('quality') + ' | ' + m('synergy') + ' | ' + m('mana') + ' | ' + (o.sw / o.n).toFixed(1) + ' | ' + ab((o.ap / o.n).toFixed(1), (o.bp / o.n).toFixed(1)) + ' | ' + m('lands') + ' | ' + (o.g / o.n).toFixed(1) + ' |');
  }
}
