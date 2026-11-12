import { readFileSync, writeFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
const [inp, outDir] = process.argv.slice(2);
const cards = gunzipSync(readFileSync(inp)).toString().split('\n').filter(Boolean).map(l => JSON.parse(l))
  .filter(c => c.legalities?.commander === 'legal' && !['token','art_series','double_faced_token','emblem'].includes(c.layout))
  .sort((a, b) => (a.edhrec_rank ?? 1e9) - (b.edhrec_rank ?? 1e9));
console.log(cards.length);
const N = 4;
for (let i = 0; i < N; i++) writeFileSync(`${outDir}/chunk${i}.json`, JSON.stringify(cards.filter((_, j) => j % N === i)));
writeFileSync(`${outDir}/all.json`, JSON.stringify(cards.map(c => ({ name: c.name, rank: c.edhrec_rank, type_line: c.type_line, oracle_text: c.oracle_text, card_faces: c.card_faces?.map(f => ({ name: f.name, type_line: f.type_line, oracle_text: f.oracle_text })) }))));
