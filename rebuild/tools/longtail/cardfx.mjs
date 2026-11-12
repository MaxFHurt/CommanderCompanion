// node cardfx.mjs names.txt — every trigger/activated/spell effect of each card as the game compiles it
import { readFileSync } from 'node:fs';
const R = new URL('../../', import.meta.url).pathname;
const { scryfallToDefinition } = await import(R + 'src/data/card-api.js');
const { analyzeDefinitionSupport } = await import(R + 'src/engine/abilities.js');
const { compileEffectText } = await import(R + 'src/engine/effects.js');
const { castText } = await import(R + 'src/game/ops.js');
const S = (process.env.LT || '/tmp/longtail');
const names = new Set(readFileSync(process.argv[2], 'utf8').split('\n').map(l => l.split(' :: ')[0]).filter(Boolean));
const by = new Map(); for (let i = 0; i < 4; i++) for (const c of JSON.parse(readFileSync(`${S}/data/chunk${i}.json`))) by.set(c.name, c);
const short = e => { const { kind, sourceName, ...r } = e; return kind + JSON.stringify(r).replace(/"/g, '').slice(0, 200); };
for (const n of names) {
  const card = by.get(n); if (!card) continue;
  const printed = scryfallToDefinition(card);
  const def = /Instant|Sorcery/i.test(printed.typeLine || '') ? { ...printed, oracleText: castText(printed.oracleText) } : printed;
  const rep = analyzeDefinitionSupport(def);
  const out = [];
  for (const t of rep.triggers || []) { const c = compileEffectText(String(t.effect || '').replace(/^you may /i, ''), { sourceName: def.name }); out.push(`T[${t.trigger}] ${t.effect}\n      => ${c.effects.map(short).join(' ; ')}`); }
  for (const a of rep.activated || []) if (!a.ability.manaAbility) { const c = compileEffectText(a.ability.effect || '', { sourceName: def.name }); out.push(`A ${a.ability.effect}\n      => ${c.effects.map(short).join(' ; ')}`); }
  if (rep.spell?.compiled?.effects?.length) out.push(`S ${def.oracleText.replace(/\n/g, ' / ')}\n      => ${rep.spell.compiled.effects.map(short).join(' ; ')}`);
  console.log(`## ${n}\n  ${out.join('\n  ')}`);
}
