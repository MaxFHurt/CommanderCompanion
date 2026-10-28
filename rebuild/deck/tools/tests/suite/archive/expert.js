// Independent check: the engine's Apex swaps against human-written expert upgrade guides (../../expert/expert_upgrades.json).
// node expert.js <engineDir> [--nopre] [--show]
const path = require('path'), fs = require('fs');
if (process.argv.includes('--nopre')) require('./h.js').noPrecon = true;
const dir = path.resolve(process.argv[2]), show = process.argv.includes('--show'), H = require('./h.js')(dir), X = H.ctx, run = H.run;
if (process.env.UP){ X.__up = JSON.parse(process.env.UP); run('Object.assign(UP, __up)'); }
const J = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../expert/expert_upgrades.json')));
const CMD = {'avengers-assemble':'Captain America', 'doom-prevails':'Doctor Doom', 'wakanda-forever':"T'Challa", 'turtle-power':'Leonardo', 'tramplesaurus-rex':'Ghalta'};
const resolve = (n, nn) => { if (!n) return null; let c = X.find(n); if (!c && nn && typeof nn === 'object' && nn[n]) c = X.find(String(nn[n]).replace(/\s*\(.*$/, '')); if (!c) c = X.find(n.replace(/ \/ /g, ' // ')); if (!c && run('typeof altName') === 'function') { const a = run('altName')(n); if (a) c = X.find(a); } return c ? c._k : null; };
const flat = v => Array.isArray(v) ? v.flatMap(flat) : v && typeof v === 'object' ? Object.values(v).flatMap(flat) : typeof v === 'string' ? [v] : [];
let tot = {cp:0, ap:0, cpr:0, n:0, unres:0};
for (const [slug, srcs0] of Object.entries(J.decks)){
  const srcs = srcs0.filter(e => !e.commander || e.commander.startsWith(CMD[slug]));   // a guide built around another commander is not this deck's plan
  const d = H.retail(slug); H.edh(d.commander); if (process.env.AIMS === 'edh'){ const E = run('EDH'), t = E.tags.filter(x => E.tmap[x.slug]).slice(0, 3); if (t.length) d.aims = t.map(x => 'edh:' + x.slug); }
  X.__d = d; const R = run('upgradePaths(__d)');
  const swaps = R.paths.map(L => L.opts.apex).filter(Boolean).filter(p => !process.env.SPELLS || !run('tags')(X.find(p.cut)).land).slice(0, +(process.env.TOPK || 99)), deckK = new Set(d.cards.map(e => run('keyOf')(e.n)));
  const cutV = new Map(), addV = new Map(), withCuts = srcs.filter(e => (e.cuts || []).length).length; let unres = [];
  srcs.forEach(e => { const nn = e.name_normalizations;
    new Set((e.cuts || []).map(n => resolve(n, nn) || (unres.push(n), null)).filter(Boolean)).forEach(k => cutV.set(k, (cutV.get(k) || 0) + 1));
    new Set([].concat(e.adds || [], flat(e.adds_by_tier), flat(e.higher_budget), flat(e.further_upgrades)).map(n => resolve(n, nn)).filter(Boolean)).forEach(k => addV.set(k, (addV.get(k) || 0) + 1)); });
  const nonland = d.cards.filter(e => { const c = X.find(e.n); return c && !run('tags')(c).land; }).map(e => run('keyOf')(e.n));
  const baseCut = nonland.filter(k => cutV.has(k)).length / nonland.length;   // chance a random spell is on some expert's cut list
  const cp = swaps.filter(p => cutV.has(run('keyOf')(p.cut))).length / Math.max(1, swaps.length), ap = swaps.filter(p => addV.has(run('keyOf')(p.add))).length / Math.max(1, swaps.length);
  const cutRecall = [...cutV.entries()].filter(([k, v]) => v >= 2 && deckK.has(k)), rec = cutRecall.filter(([k]) => swaps.some(p => run('keyOf')(p.cut) === k)).length / Math.max(1, cutRecall.length);
  tot.cp += cp; tot.ap += ap; tot.cpr += rec; tot.n++; tot.unres += unres.length;
  console.log(slug.padEnd(18), 'sources', srcs.length, '| swaps', String(swaps.length).padStart(2), '| cuts an expert also cuts', (100 * cp).toFixed(0).padStart(3) + '% (random ' + (100 * baseCut).toFixed(0) + '%)', '| adds an expert also adds', (100 * ap).toFixed(0).padStart(3) + '%', '| cuts 2+ experts agree on, found', (100 * rec).toFixed(0) + '% of ' + cutRecall.length, unres.length ? '| unresolved ' + unres.join(', ') : '');
  if (show) swaps.forEach(p => console.log('    ' + (cutV.has(run('keyOf')(p.cut)) ? 'E' + cutV.get(run('keyOf')(p.cut)) : '  ') + ' cut ' + p.cut.padEnd(34) + (addV.has(run('keyOf')(p.add)) ? 'E' + addV.get(run('keyOf')(p.add)) : '  ') + ' add ' + p.add));
}
console.log('MEAN cut agreement ' + (100 * tot.cp / tot.n).toFixed(1) + '% | add agreement ' + (100 * tot.ap / tot.n).toFixed(1) + '% | consensus-cut recall ' + (100 * tot.cpr / tot.n).toFixed(1) + '%');
