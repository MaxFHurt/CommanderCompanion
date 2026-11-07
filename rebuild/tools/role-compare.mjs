// Deck Builder roles against the game engine's reading, for every card (roadmap 5, step 0).
//
//   node tools/role-compare.mjs <cards.json.gz> [out.json]
//
// <cards.json.gz> is the daily card-data snapshot (raw.githubusercontent.com/MaxFHurt/Deck-Companion/card-data/cards.json.gz).
// The Deck Builder's roles come from its own reader (deck/engine.min.js, tags(c).roles). The game engine's come from
// compiling each ability line with src/engine/effects.js compileEffectText: the whole text of an instant or sorcery, the
// effect of each triggered ability ("When/Whenever/At …, <effect>") and of each activated ability ("<cost>: <effect>").
// Effects map to roles: ramp (mana from a nonland permanent or a ritual, a land put onto the battlefield), draw, removal
// (one target destroyed, exiled, bounced, dealt damage or fought), wipe (each/all), protect (hexproof, indestructible,
// protection, shroud, phasing out) and counter (counterspells). Prints a summary; writes every disagreement to out.json.
import fs from 'node:fs'; import vm from 'node:vm'; import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
const here = fileURLToPath(new URL('..', import.meta.url));
const [snap, outFile] = process.argv.slice(2);
if (!snap) { console.error('usage: node tools/role-compare.mjs <cards.json.gz> [out.json]'); process.exit(1); }
const { compileEffectText } = await import(here + 'src/engine/effects.js');
const ctx = vm.createContext({ console, Math, JSON, Set, Map, Date, RegExp, Object, Array, String, Number, Infinity, isNaN, parseFloat, parseInt, setTimeout, clearTimeout, Promise });
vm.runInContext(fs.readFileSync(here + 'deck/engine.min.js', 'utf8'), ctx, { filename: 'engine.min.js' });
ctx.__raw = JSON.parse(zlib.gunzipSync(fs.readFileSync(snap)));
vm.runInContext(`{const rows=[];for(const o of __raw){const c=fromScryfall(o);if(c)rows.push(c);} buildIndex(rows);}`, ctx);
const deckRoles = name => { ctx.__n = name; return vm.runInContext(`(()=>{const c=find(__n);return c?[...tags(c).roles]:null})()`, ctx); };

const ROLES = ['ramp', 'draw', 'removal', 'wipe', 'protect', 'counter'];
const PROTECT_KW = /^(hexproof|indestructible|shroud|protection)/i;
function lines(o) {
  const faces = o.card_faces?.length ? o.card_faces : [o];
  return faces.flatMap(f => String(f.oracle_text || '').split('\n').map(l => ({ line: l.replace(/\([^)]*\)/g, '').trim(), name: f.name || o.name, type: f.type_line || o.type_line || '' })));
}
function engineRoles(o) {
  const got = new Set(); let read = 0, tried = 0;
  for (const { line, name, type } of lines(o)) {
    if (!line) continue;
    const self = line.split(name).join('SELFNAME').replace(/\bthis (creature|permanent|artifact|enchantment|land)\b/gi, 'SELFNAME');
    let effect = null, mana = false;
    const act = /^([^:"]{1,80}):\s*(.+)$/.exec(self), trig = /^(?:When|Whenever|At)\b[^,]*,\s*(.+)$/i.exec(self);
    if (trig) effect = trig[1];
    else if (act && /\{|Sacrifice|Discard|Pay|Tap|Exile|Remove/i.test(act[1])) { effect = act[2]; mana = /^\{T\}/.test(act[1]); }
    else if (/\b(Instant|Sorcery)\b/.test(type)) effect = self;
    if (!effect) continue;
    tried++;
    let r; try { r = compileEffectText(effect, { sourceName: 'SELFNAME' }); } catch { continue; }
    if (!r.supported || !r.effects.length) continue;
    read++;
    const all = /\b(all|each)\b[^.]*\b(creatures?|permanents?|nonland|artifacts?|enchantments?|planeswalkers?)\b/i.test(effect);
    // a target that is a permanent or creature (not a player, a graveyard or a spell)
    const tgt = bind => { const q = (r.requirements || []).find(x => x.bind === bind); return !!q && q.kind === 'target' && /creature|permanent|artifact|enchantment|planeswalker|battle|\bland\b|any target/i.test(q.scope || q.label || '') && !/graveyard|spell|player\b(?!')|you control|you own/i.test(q.scope || ''); };
    const LANDWORD = /\b(land|Forest|Island|Swamp|Mountain|Plains)\b[^.]*onto the battlefield/i;
    const fetchland = act && /Sacrifice SELFNAME/i.test(act[1]) && /\bLand\b/.test(type);   // Evolving Wilds swaps itself for a land: not ramp
    for (const e of r.effects) {
      const k = e.kind;
      if (k === 'add-mana' && !/\bLand\b/.test(type)) got.add('ramp');
      if (k === 'library-search' && LANDWORD.test(e.text || effect) && !fetchland) got.add('ramp');
      if (k === 'hand-to-battlefield' && /\bland\b/i.test(effect)) got.add('ramp');
      if (/^draw/.test(k) && (!e.scope || e.scope === 'you')) got.add('draw');
      if (/^(destroy|exile|bounce|damage|fight|to-library|chaos-warp)$/.test(k) && !all && tgt(e.bind)) got.add('removal');
      if (k === 'sacrifice-many' && (r.requirements || []).some(q => q.kind === 'card-selection' && /opponent|target/.test(q.scope || ''))) got.add('removal');   // edicts
      if ((k === 'zone-each' && /creature|permanent|artifact|enchantment|nonland/.test(e.filter || 'permanent')) || (k === 'damage-each' && e.creatures) || (all && /^(destroy|exile|bounce)$/.test(k)) || /^(destroy-all|bounce-each|exile-each)/.test(k)) got.add('wipe');
      if (/^grant-keyword/.test(k) && PROTECT_KW.test(e.keyword || '')) got.add('protect');
      if (k === 'phase-out') got.add('protect');
      if (k === 'counter-spell') got.add('counter');
    }
  }
  return { roles: got, read, tried };
}

const seen = new Set(), rows = [];
const cards = ctx.__raw.filter(o => o && o.name && !/Basic Land/.test(o.type_line || '')).sort((a, b) => (a.edhrec_rank || 1e9) - (b.edhrec_rank || 1e9));
for (const o of cards) {
  if (seen.has(o.name)) continue; seen.add(o.name);
  const d = deckRoles(o.name); if (!d) continue;
  const g = engineRoles(o);
  rows.push({ name: o.name, rank: o.edhrec_rank || null, deck: d.filter(x => ROLES.includes(x)), engine: [...g.roles], read: g.read, tried: g.tried });
}
const sum = { cards: rows.length, engineRead: rows.filter(r => r.read).length, roles: {}, deckNoneEngineSome: [] };
for (const role of ROLES) {
  const x = { both: 0, deckOnly: [], engineOnly: [] };
  for (const r of rows) {
    if (!r.read) continue;   // only cards the engine reads at least one line of
    const a = r.deck.includes(role), b = r.engine.includes(role);
    if (a && b) x.both++; else if (a) x.deckOnly.push(r.name); else if (b) x.engineOnly.push(r.name);
  }
  sum.roles[role] = x;
}
sum.deckNoneEngineSome = rows.filter(r => r.read && !r.deck.length && r.engine.length).map(r => `${r.name} [${r.engine.join(', ')}]`);
if (outFile) fs.writeFileSync(outFile, JSON.stringify({ at: new Date().toISOString(), ...sum, rows }, null, 1));
// --lists <deck/lists.js>: write ENGINE_ROLES (the engine's confident roles for nonland cards the Deck Builder reads as nothing)
const li = process.argv.indexOf('--lists');
if (li > 0) {
  const rawBy = new Map(ctx.__raw.map(o => [o.name, o]));
  const er = {};
  for (const r of rows) {
    if (!r.read || r.deck.length || /\bLand\b/.test(rawBy.get(r.name)?.type_line || '')) continue;
    const roles = r.engine.filter(x => ['ramp', 'draw', 'removal', 'wipe', 'counter'].includes(x));
    if (roles.length) er[r.name] = roles;
  }
  const file = process.argv[li + 1], src = fs.readFileSync(file, 'utf8').replace(/\n\/\/ Engine roles[\s\S]*$/, '');
  fs.writeFileSync(file, src.trimEnd() + '\n// Engine roles (tools/role-compare.mjs --lists): the game engine\'s reading of nonland cards the Deck Builder\'s own reader\n// gives no role (ramp, draw, removal, wipe, counter). Regenerate after card or engine changes.\nconst ENGINE_ROLES = ' + JSON.stringify(er) + ';\n');
  console.log('ENGINE_ROLES:', Object.keys(er).length, 'cards written to', file);
}
console.log(`cards ${sum.cards}; the engine reads at least one ability line of ${sum.engineRead}`);
for (const role of ROLES) { const x = sum.roles[role]; console.log(`${role.padEnd(8)} both ${String(x.both).padStart(5)}  deck only ${String(x.deckOnly.length).padStart(5)}  engine only ${String(x.engineOnly.length).padStart(5)}   e.g. deck only: ${x.deckOnly.slice(0, 4).join('; ')} | engine only: ${x.engineOnly.slice(0, 4).join('; ')}`); }
console.log(`the Deck Builder gives no role, the engine does: ${sum.deckNoneEngineSome.length}, e.g. ${sum.deckNoneEngineSome.slice(0, 8).join('; ')}`);
