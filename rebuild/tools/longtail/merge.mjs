import { readFileSync, writeFileSync } from 'node:fs';
const [dir, tag] = process.argv.slice(2);
const rows = [];
for (let i = 0; i < 4; i++) { const r = JSON.parse(readFileSync(`${dir}/${tag}.${i}.json`)); for (const c of r.cards) rows.push({ ...c, rank: (c.rank - 1) * 4 + i + 1 }); }
rows.sort((a, b) => a.rank - b.rank);
const auto = rows.filter(r => r.automated).length;
const kinds = new Map();
for (const r of rows) for (const k of r.kinds) kinds.set(k, (kinds.get(k) || 0) + 1);
console.log(`${rows.length} cards: ${auto} automated, ${rows.length - auto} by hand`);
for (const [k, n] of [...kinds].sort((a, b) => b[1] - a[1]).slice(0, 40)) console.log(String(n).padStart(5), k);
writeFileSync(`${dir}/${tag}.json`, JSON.stringify(rows));
