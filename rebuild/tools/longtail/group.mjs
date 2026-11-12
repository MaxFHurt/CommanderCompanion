// usage: node group.mjs <tag> [minCards]  — groups failing clauses into wording patterns
import { readFileSync, writeFileSync } from 'node:fs';
const S = (process.env.LT || '/tmp/longtail');
const tag = process.argv[2];
let rows = []; for (let i = 0; i < 4; i++) rows.push(...JSON.parse(readFileSync(`${S}/out/${tag}.cl${i}.json`)));
rows.sort((a, b) => a.rank - b.rank);
const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const norm = (s, name) => {
  let t = s;
  for (const n of [name, name.split(' // ')[0], name.split(',')[0]]) if (n && n.length > 3) t = t.replace(new RegExp(esc(n), 'g'), 'SELF');
  return t.replace(/\{[^}]+\}/g, '{M}').replace(/(\{M\})+/g, '{M}').replace(/\b(a|an|one|two|three|four|five|six|seven|eight|nine|ten|\d+|X)\b/gi, 'N').replace(/[+-]N\/[+-]N/g, '±N/±N').replace(/\bthis (creature|artifact|enchantment|land|permanent|Aura|Equipment|Vehicle|Saga|token)\b/gi, 'SELF').replace(/\b(white|blue|black|red|green)\b/gi, 'COLOR').replace(/[.,]$/,'').trim();
};
const pat = new Map();
for (const r of rows) {
  const all = r.items.flatMap(i => i.clauses);
  for (const it of r.items) for (const c of it.clauses) {
    const k = norm(c, r.name);
    if (!pat.has(k)) pat.set(k, { k, cards: new Set(), solo: new Set(), ex: c });
    const p = pat.get(k); p.cards.add(r.name); if (all.length === 1) p.solo.add(r.name);
  }
}
const list = [...pat.values()].sort((a, b) => b.solo.size - a.solo.size || b.cards.size - a.cards.size);
writeFileSync(`${S}/out/${tag}.patterns.txt`, list.map(p => `${p.solo.size}\t${p.cards.size}\t${p.k}\t[${[...p.cards].slice(0, 4).join('; ')}]`).join('\n'));
writeFileSync(`${S}/out/${tag}.clauses.txt`, rows.map(r => `${r.rank}\t${r.name}\t${r.items.map(i => i.where + ': ' + i.clauses.join(' | ')).join(' || ')}`).join('\n'));
const solo = rows.filter(r => r.items.flatMap(i => i.clauses).length === 1).length;
console.log(`${rows.length} by-hand cards, ${solo} with a single failing clause, ${pat.size} patterns`);
