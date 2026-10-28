// Combo data for Deck Companion, from Commander Spellbook (https://commanderspellbook.com), the community combo database.
// Keeps the Commander-legal combos of 2 or 3 cards that real decks play (20+) and that either win (infinite damage or life
// loss, extra turns or combats, a lock, "win the game"…) or give infinite mana or cards. Output, gzipped JSON:
//   {at, source, version, cards:[names], combos:[[cardIndexes], identity, kind 'w'|'e', what, decks, bracketTag, note]}
// The source is ~30 MB gzipped and over 500 MB as text, so it is streamed: each combo object is parsed on its own.
// Usage: import {buildCombos}, or: node tools/build-combos.mjs [variants.json.gz path or URL] [out file]
import fs from 'node:fs'; import zlib from 'node:zlib'; import {Readable} from 'node:stream'; import {StringDecoder} from 'node:string_decoder';
const SRC = 'https://json.commanderspellbook.com/variants.json.gz';
const WIN = /^(Win the game|Infinite damage|Infinite lifeloss|Infinite combat phases|Infinite turns|Infinite creature tokens with haste|Infinitely large creature|Infinite mill|Infinite opponent|Each opponent loses|Infinite drain|Lock)/i;
// damage that only reaches creatures clears a board; it does not win
const CREATURES_ONLY = /damage to (most |all |some |each )?(other )?creatures/i;
const ENG = /^Infinite (colored |colorless |red |blue |green |white |black )?mana|^Infinite card draw/i;
// Calls onObject(text) for each object directly inside the top-level "variants" array.
function splitter(onObject){
  let depth = 0, inStr = false, esc = false, key = '', keyBuf = null, inVariants = false, buf = null;
  return chunk => { for (let i = 0; i < chunk.length; i++){ const ch = chunk[i];
    if (buf !== null) buf.push(ch);
    if (inStr){ if (esc) esc = false; else if (ch === '\\') esc = true; else if (ch === '"'){ inStr = false; if (keyBuf !== null){ key = keyBuf.join(''); keyBuf = null; } } else if (keyBuf !== null) keyBuf.push(ch); continue; }
    if (ch === '"'){ inStr = true; if (depth === 1 && buf === null) keyBuf = []; continue; }
    if (ch === '[' || ch === '{'){ depth++; if (depth === 2 && ch === '[' && key === 'variants') inVariants = true; else if (inVariants && depth === 3 && ch === '{') buf = ['{']; continue; }
    if (ch === ']' || ch === '}'){ depth--; if (inVariants && depth === 2 && ch === '}' && buf){ onObject(buf.join('')); buf = null; } else if (inVariants && depth === 1) inVariants = false; } } };
}
export async function buildCombos(src = SRC, minDecks = 20){
  const raw = /^https?:/.test(src) ? Readable.fromWeb((await fetch(src, {headers:{'User-Agent':'DeckCompanion-data/1.0'}})).body) : fs.createReadStream(src);
  const names = [], idx = new Map(), out = [], id = n => { if (!idx.has(n)){ idx.set(n, names.length); names.push(n); } return idx.get(n); };
  let seen = 0;
  const feed = splitter(t => { seen++; const v = JSON.parse(t);
    if (v.status !== 'OK' || !(v.legalities || {}).commander || v.spoiler || (v.requires || []).length || v.uses.length > 3 || (v.popularity || 0) < minDecks) return;
    const feats = (v.produces || []).map(p => p.feature.name), win = feats.filter(f => WIN.test(f) && !CREATURES_ONLY.test(f)), eng = feats.filter(f => ENG.test(f)); if (!win.length && !eng.length) return;
    out.push([v.uses.map(u => id(u.card.name)), v.identity || 'C', win.length ? 'w' : 'e', win[0] || eng[0], v.popularity || 0, v.bracketTag || '', (v.notablePrerequisites || '').slice(0, 120)]); });
  // The server sends the file with Content-Encoding: gzip, so fetch may already have unzipped it; a file on disk is still
  // gzipped. The first two bytes (1f 8b) say which.
  await new Promise((res, rej) => { let gz = null, first = true; const dec = new StringDecoder('utf8');
    raw.on('data', chunk => { if (first){ first = false; if (chunk[0] === 0x1f && chunk[1] === 0x8b){ gz = zlib.createGunzip(); gz.setEncoding('utf8'); gz.on('data', feed); gz.on('end', res); gz.on('error', rej); } }
      if (gz) gz.write(chunk); else feed(dec.write(chunk)); });
    raw.on('end', () => { if (gz) gz.end(); else { feed(dec.end()); res(); } }); raw.on('error', rej); });
  if (!seen) throw new Error('no combos found in the source (format changed?)');
  out.sort((a, b) => b[4] - a[4]);
  return {at:new Date().toISOString(), source:'Commander Spellbook', read:seen, cards:names, combos:out};
}
if (process.argv[1] && process.argv[1].endsWith('build-combos.mjs')){
  const r = await buildCombos(process.argv[2] || SRC), f = process.argv[3] || 'out/combos.json.gz';
  fs.writeFileSync(f, zlib.gzipSync(JSON.stringify(r))); console.log('read', r.read, 'combos', r.combos.length, 'cards', r.cards.length, 'bytes', fs.statSync(f).size);
}
