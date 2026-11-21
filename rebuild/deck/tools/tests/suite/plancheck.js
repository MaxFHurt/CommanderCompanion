// Plan detection check (roadmap 6b): frozen decklists (plans/decks.json) against the plans each should and should not show
// (plans/LABELS.md, the table the owner corrects). Prints each deck's Game plan read-out and a pass / fail per label.
//   node plancheck.js <engineDir> [--show]
const fs = require('fs'), path = require('path');
const H = require('./h.js')(path.resolve(process.argv[2])), X = H.ctx, run = H.run, show = process.argv.includes('--show');
const decks = JSON.parse(fs.readFileSync(path.join(__dirname, 'plans/decks.json'), 'utf8'));
// LABELS.md rows: | deck | must show | must not show | (chain ids, comma separated)
const labels = new Map();
for (const l of fs.readFileSync(path.join(__dirname, 'plans/LABELS.md'), 'utf8').split('\n')) {
  const m = l.match(/^\|\s*\d+\s*\|\s*([^|]+?)\s*\|\s*([^|]*?)\s*\|\s*([^|]*?)\s*\|/);
  if (m) labels.set(m[1], {must: m[2].match(/`([a-z]+)`/g) || [], not: m[3].match(/`([a-z]+)`/g) || []});
}
const ids = s => s.map(x => x.replace(/`/g, ''));
let pass = 0, fail = 0, cover = {cards: 0, e: 0, r: 0, none: 0};
for (const D of decks) {
  X.__D = D;
  const v = run(`(() => { const d = {id: 'pc', format: 'commander', commander: find(__D.commander) ? find(__D.commander).n : __D.commander, partner: '', cards: [], aims: [], dismissed: []};
    const miss = []; for (const [q, n] of __D.cards) { const c = find(n); if (c) d.cards.push({n: c.n, q}); else miss.push(n); }
    PLANC.clear(); const p = planOf(d);
    return {miss, cover: p.cover, chains: p.chains.map(x => ({id: x.id, label: x.label, E: x.E, P: x.P, thin: x.thin, cmd: x.cmd, en: x.en.slice(0, 6), pay: x.pay.slice(0, 6)}))}; })()`);
  for (const k in cover) cover[k] += v.cover[k] || 0;
  const L = labels.get(D.commander) || {must: [], not: []}, got = new Set(v.chains.map(x => x.id));
  const miss = ids(L.must).filter(x => !got.has(x)), wrong = ids(L.not).filter(x => got.has(x)), ok = !miss.length && !wrong.length;
  ok ? pass++ : fail++;
  console.log((ok ? 'PASS ' : 'FAIL ') + D.commander + ' · shows ' + (v.chains.map(x => x.id).join(', ') || 'none') + (miss.length ? ' · missing ' + miss.join(', ') : '') + (wrong.length ? ' · should not show ' + wrong.join(', ') : '') + (v.miss.length ? ' · ' + v.miss.length + ' cards not in the snapshot' : ''));
  if (show) for (const x of v.chains) console.log('    ' + x.label + ' — enablers ' + x.E + ', payoffs ' + x.P + (x.thin ? ' (thin: ' + x.thin + ')' : '') + (x.cmd ? ' [commander: ' + x.cmd + ']' : '') + '\n      ' + x.en.join(', ') + '\n      → ' + x.pay.join(', '));
}
console.log(`plancheck: ${pass} passed, ${fail} failed · nonland cards read by the game engine ${cover.e}, with the Deck Builder reader's help ${cover.r}, no plan facts ${cover.none} (of ${cover.cards})`);
