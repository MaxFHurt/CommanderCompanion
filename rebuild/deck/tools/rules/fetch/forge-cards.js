// Packs Forge's card scripts (github.com/Card-Forge/forge, forge-gui/res/cardsfolder; GPL-3.0) into one file for the engine
// redesign's TESTS ONLY (owner, 20 Oct: Forge yes; kept out of the app because of its licence). Each card keeps its machine
// lines as Forge wrote them: K keywords, T triggers, A activated abilities and spells, S statics, R replacements, SVar
// sub-abilities, and Forge's deck hints (DeckHas = what it makes, DeckHints/DeckNeeds = what it wants).
// node tools/rules/fetch/forge-cards.js <cardsfolder> <out.json.gz>
const fs = require('fs'), path = require('path'), zlib = require('zlib');
const [dir, out] = process.argv.slice(2), cards = {};
const walk = d => { for (const f of fs.readdirSync(d)){ const p = path.join(d, f); if (fs.statSync(p).isDirectory()) walk(p); else if (f.endsWith('.txt')) read(p); } };
function read(p){ const faces = []; let c = null;
  for (const line of fs.readFileSync(p, 'utf8').split(/\r?\n/)){
    if (/^ALTERNATE\s*$/.test(line)){ c = null; continue; } const m = /^([A-Za-z]+):(.*)$/.exec(line); if (!m) continue; const [, k, v] = m;
    if (k === 'Name'){ c = {name:v.trim(), K:[], T:[], A:[], S:[], R:[], SVar:{}}; faces.push(c); continue; } if (!c) continue;
    if (['K', 'T', 'A', 'S', 'R'].includes(k)) c[k].push(v.trim());
    else if (k === 'SVar'){ const i = v.indexOf(':'); if (i > 0) c.SVar[v.slice(0, i)] = v.slice(i + 1).trim(); }
    else if (['ManaCost', 'Types', 'PT', 'Loyalty', 'Defense', 'Colors', 'DeckHas', 'DeckHints', 'DeckNeeds', 'AlternateMode', 'Oracle'].includes(k)) c[k] = v.trim(); }
  if (!faces.length) return; const main = faces[0]; if (faces.length > 1) main.faces = faces.slice(1); for (const f of faces) for (const k of ['K', 'T', 'A', 'S', 'R']) if (!f[k].length) delete f[k];
  if (!Object.keys(main.SVar).length) delete main.SVar; (faces.slice(1)).forEach(f => { if (f.SVar && !Object.keys(f.SVar).length) delete f.SVar; });
  cards[main.name] = main; }
walk(dir);
fs.writeFileSync(out, zlib.gzipSync(JSON.stringify({source:'Card-Forge/forge forge-gui/res/cardsfolder (GPL-3.0, tests only)', at:new Date().toISOString().slice(0, 10), cards})));
console.log(Object.keys(cards).length, 'cards ->', out, fs.statSync(out).size, 'bytes');
