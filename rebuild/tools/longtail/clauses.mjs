// usage: node clauses.mjs <audit.json> <part> <of> <out.json>  — failing clauses of every by-hand card
import { readFileSync, writeFileSync } from 'node:fs';
const R = new URL('../../', import.meta.url).pathname;
const { scryfallToDefinition } = await import(R + 'src/data/card-api.js');
const { analyzeDefinitionSupport } = await import(R + 'src/engine/abilities.js');
const { compileEffectText } = await import(R + 'src/engine/effects.js');
const { castText, effectRunsByItself } = await import(R + 'src/game/ops.js');
const S = (process.env.LT || '/tmp/longtail');
const [audit, part, of, out] = process.argv.slice(2);
const rows = JSON.parse(readFileSync(audit)).filter(r => !r.automated);
const byName = new Map();
for (let i = 0; i < 4; i++) for (const c of JSON.parse(readFileSync(`${S}/data/chunk${i}.json`))) byName.set(c.name, c);
const res = [];
rows.forEach((row, idx) => {
  if (idx % Number(of) !== Number(part)) return;
  const card = byName.get(row.name); if (!card) return;
  const printed = scryfallToDefinition(card);
  const def = /Instant|Sorcery/i.test(printed.typeLine || '') ? { ...printed, oracleText: castText(printed.oracleText) } : printed;
  let rep; try { rep = analyzeDefinitionSupport(def); } catch { return; }
  const items = [];
  for (const g of row.gaps) {
    if (g.startsWith('Spell: ')) {
      const m = g.match(/(?:guided resolution for|need guided resolution): (.*)$/s);
      items.push({ where: 'spell', clauses: m ? m[1].split(' | ') : ['<' + g.slice(7, 60) + '>'] });
    } else if (g.startsWith('Trigger: The game never fires')) items.push({ where: 'nofire', clauses: ['NOFIRE ' + g.slice(31)] });
    else if (g.startsWith('Trigger: ')) {
      const t = (rep.triggers || []).find(t => g === `Trigger: ${t.text}`);
      let cl = [];
      try { const inner = String(t?.effect || '').replace(/^you may /i, ''); const c = compileEffectText(t?.effect || '', { sourceName: def.name }); const c2 = inner !== t?.effect ? compileEffectText(inner, { sourceName: def.name }) : c; cl = (c2.unsupported.length <= c.unsupported.length ? c2 : c).unsupported; } catch {}
      items.push({ where: 'trigger', clauses: cl.length ? cl : ['<whole> ' + (t?.effect || g)] });
    } else if (g.startsWith('Activated: ')) {
      const a = (rep.activated || []).find(a => g === `Activated: ${a.ability.text}`);
      let cl = [];
      try { cl = compileEffectText(a?.ability?.effect || '', { sourceName: def.name }).unsupported; } catch {}
      items.push({ where: 'activated', clauses: cl.length ? cl : ['<whole> ' + (a?.ability?.effect || g)] });
    } else items.push({ where: 'other', clauses: [g] });
  }
  res.push({ rank: row.rank, name: row.name, items });
});
writeFileSync(out, JSON.stringify(res));
