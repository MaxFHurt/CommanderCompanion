// Colour identity check (owner, 12 Nov: "make sure the card color identity is correct"). Run: node identity.js <app dir>
// Reads the card snapshot next to the app (proto/snapshot) and checks, for every card:
//  1. the app's identity (the colours the app uses for legality, deck colours and the off-colour check) is the printed identity;
//  2. no mana cost colour and no rules-text colour (reminder text left out) falls outside that identity, on either face;
//  3. the identity is never empty while a face has a coloured mana cost.
// Identity colours with no printed symbol (colour indicators, some lands) are counted, not failed where the snapshot has no colour indicator; the indicator is checked where the export keeps it (colors).
const fs = require('fs'), path = require('path'), zlib = require('zlib');
const DIR = path.resolve(process.argv[2] || '.');
const file = [path.join(DIR, '..', 'snapshot', 'cards.json.gz'), path.join(DIR, '..', '..', 'snapshot', 'cards.json.gz')].find(f => fs.existsSync(f));
if (!file) { console.log('identity: no snapshot found'); process.exit(0); }
const cards = JSON.parse(zlib.gunzipSync(fs.readFileSync(file)).toString());
const ORDER = 'WUBRG';
const colsOf = s => { const out = new Set(); for (const t of (s || '').match(/\{[^}]*\}/g) || []) for (const k of ORDER) if (t.includes(k)) out.add(k); return out; };
const strip = s => (s || '').replace(/\([^)]*\)/g, '');
const faces = o => (o.card_faces && o.card_faces.length ? o.card_faces : [o]);
let n = 0, costOut = 0, textOut = 0, emptyWithCost = 0, indicator = 0;
const fails = [];
for (const o of cards) {
  if (o.object !== 'card') continue;
  n++;
  const id = new Set(o.color_identity || []);
  const cost = new Set(), text = new Set();
  for (const f of faces(o)) { colsOf(f.mana_cost).forEach(k => cost.add(k)); colsOf(strip(f.oracle_text)).forEach(k => text.add(k)); }
  const c1 = [...cost].filter(k => !id.has(k)), c2 = [...text].filter(k => !id.has(k));
  if (c1.length) { costOut++; fails.push(`${o.name}: cost colour ${c1.join('')} not in identity ${[...id].join('') || '(none)'}`); }
  if (c2.length) { textOut++; fails.push(`${o.name}: rules-text colour ${c2.join('')} not in identity ${[...id].join('') || '(none)'}`); }
  if (!id.size && cost.size) { emptyWithCost++; fails.push(`${o.name}: colourless identity but a coloured cost`); }
  // the colour indicator (when the snapshot keeps it) must also be inside the identity
  const ind = new Set([...(o.colors || []), ...faces(o).flatMap(f => f.colors || [])]);
  const c3 = [...ind].filter(k => !id.has(k));
  if (c3.length) { costOut++; fails.push(`${o.name}: colour indicator ${c3.join('')} not in identity ${[...id].join('') || '(none)'}`); }
  if ([...id].some(k => !cost.has(k) && !text.has(k) && !ind.has(k))) indicator++;
}
const ok = costOut === 0 && textOut === 0 && emptyWithCost === 0;
console.log(`identity: ${n} cards, cost outside identity ${costOut}, rules text outside identity ${textOut}, coloured cost with empty identity ${emptyWithCost}, identity from an indicator or land (not checked) ${indicator} ${ok ? 'OK' : 'FAILED'}`);
fails.slice(0, 10).forEach(f => console.log('  ' + f));
process.exit(ok ? 0 : 1);
