// Before/after tables for the report, from the saved run outputs. node tables.js > ../out/tables.md
const b = require('../out/baseline-b73.json'), c = require('../out/cand-final.json'), H = require('./h.js')(require('path').resolve(__dirname, '../candidate'));
const money = n => { const x = (H.ctx.find(n) || {}).p; return x == null ? '?' : '$' + x.toFixed(2); };
const short = n => String(n).split(' // ')[0];
const DECKS = [['avengers-assemble', 'Avengers Assemble'], ['doom-prevails', 'Doom Prevails'], ['tramplesaurus-rex', 'Tramplesaurus Rex'], ['turtle-power', 'Turtle Power'], ['wakanda-forever', 'Wakanda Forever']];
const out = [];
for (const [slug, name] of DECKS){
  const B = b.decks[slug + '/retail'], C = c.decks[slug + '/retail'];
  out.push('### ' + name + ' (commander: ' + C.commander + ')', '');
  const cost = (v, t) => v.packages[t].pairs.reduce((s, p) => s + ((H.ctx.find(p.add) || {}).p || 0) - ((H.ctx.find(p.cut) || {}).p || 0), 0);
  out.push('| | Build 73 (today) | Candidate |', '|---|---|---|',
    '| Cards with an upgrade | ' + B.rows.length + ' | ' + C.rows.length + ' |',
    '| Slots with an Apex pick | ' + B.rows.filter(r => r.opts.apex).length + ' | ' + C.rows.filter(r => r.opts.apex).length + ' |',
    '| Mid / Budget alternatives shown | ' + B.rows.filter(r => r.opts.mid).length + ' / ' + B.rows.filter(r => r.opts.budget).length + ' | ' + C.rows.filter(r => r.opts.mid).length + ' / ' + C.rows.filter(r => r.opts.budget).length + ' |',
    '| Swaps in "Apply all" Apex / Mid / Budget | ' + ['apex', 'mid', 'budget'].map(t => B.packages[t].swaps).join(' / ') + ' | ' + ['apex', 'mid', 'budget'].map(t => C.packages[t].swaps).join(' / ') + ' |',
    '| Net cost of the Apex package | $' + cost(B, 'apex').toFixed(2) + ' | $' + cost(C, 'apex').toFixed(2) + ' |', '');
  out.push('**Build 73 (today)** — Budget → Mid → Apex chosen in that order; a card used at one tier is not offered at a higher one.', '', '| Card leaving | Budget | Mid | Apex |', '|---|---|---|---|');
  B.rows.forEach(r => out.push('| ' + short(r.cut) + ' | ' + ['budget', 'mid', 'apex'].map(t => r.opts[t] ? short(r.opts[t]) + ' ' + money(r.opts[t]) + (r.flags[t] && r.flags[t].includes('weak') ? ' (weak)' : '') : '—').join(' | ') + ' |'));
  out.push('', '**Candidate** — Apex first, then cheaper same-job alternatives.', '', '| Card leaving | Why it can go | Apex | Mid | Budget |', '|---|---|---|---|---|');
  const raw = H; H.edh(C.commander); H.ctx.__d = H.retail(slug); const R = H.run('upgradePaths(__d)');
  R.paths.forEach(L => { const a = L.opts.apex; out.push('| ' + short(L.cut) + ' | ' + ((a || {}).cutWhy || []).join('; ') + ' | ' + (a ? short(a.add) + ' ' + money(a.add) + ' — ' + a.why.join('; ') : '—') + ' | ' +
    ['mid', 'budget'].map(t => L.opts[t] ? short(L.opts[t].add) + ' ' + money(L.opts[t].add) : '— ' + ((L.none || {})[t] || '').replace(/^The Apex card already costs under \$\d+$/, 'Apex is under the limit')).join(' | ') + ' |'); });
  out.push('');
}
console.log(out.join('\n'));
