// node review.mjs <fixed.txt> <clauseTag> [skipFile] — failing clauses of each newly fixed card and how they compile now
import { readFileSync } from 'node:fs';
import { compileEffectText } from '../../src/engine/effects.js';
const S = (process.env.LT || '/tmp/longtail');
const names = new Set(readFileSync(process.argv[2], 'utf8').split('\n').filter(Boolean));
const skip = process.argv[4] ? new Set(readFileSync(process.argv[4], 'utf8').split('\n').filter(Boolean)) : new Set();
let rows = []; for (let i = 0; i < 4; i++) rows.push(...JSON.parse(readFileSync(`${S}/out/${process.argv[3]}.cl${i}.json`)));
const short = e => { const { kind, sourceName, ...r } = e; return kind + JSON.stringify(r).replace(/"/g, '').slice(0, 170); };
for (const r of rows.filter(r => names.has(r.name) && !skip.has(r.name)).sort((a, b) => a.rank - b.rank)) {
  for (const c of r.items.flatMap(i => i.clauses)) {
    let out; try { const k = compileEffectText(c.replace(/^<whole> /, ''), { sourceName: r.name.split(' // ')[0] }); out = (k.supported ? '' : 'ALONE-NO ') + k.effects.map(short).join(' ; ') + (k.requirements.length ? '  RQ ' + k.requirements.map(q => q.kind + ':' + (q.scope || q.filter || '')).join(',') : ''); } catch (e) { out = 'ERR ' + e.message; }
    console.log(`${r.name} :: ${c.slice(0, 200)}\n    => ${out}`);
  }
}
