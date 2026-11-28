// Deck Builder card reader against the game engine's effect compiler, every Commander-legal card (roadmap 5.0).
//   node tools/readers-compare.mjs <oracle.jsonl.gz | cards.json.gz> <out.json> [rank.json]
// Deck Builder roles: tags(c).roles from deck/engine.min.js with its engine list (ENGINE_ROLES) emptied, so only its own reading.
// Engine roles: each ability line (spell text, trigger effect, activated effect, static line) compiled with
// src/engine/effects.js compileEffectText; effect kinds map to roles in engineRoles(). A third, independent text check
// ("arbiter", plain sentence patterns) sorts each disagreement: real Deck Builder misread / miss, or a mapping artefact.
import fs from 'node:fs'; import vm from 'node:vm'; import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
const here = fileURLToPath(new URL('../../', import.meta.url));
const [snap, outFile, rankFile] = process.argv.slice(2);
if (!snap || !outFile) { console.error('usage: node tools/readers-compare.mjs <cards file> <out.json> [rank.json]'); process.exit(1); }
const { compileEffectText } = await import(here + 'src/engine/effects.js');
const ctx = vm.createContext({ console, Math, JSON, Set, Map, Date, RegExp, Object, Array, String, Number, Infinity, isNaN, parseFloat, parseInt, setTimeout, clearTimeout, Promise });
vm.runInContext(fs.readFileSync(here + 'deck/engine.min.js', 'utf8'), ctx, { filename: 'engine.min.js' });
let buf = fs.readFileSync(snap); if (/\.gz$/.test(snap)) buf = zlib.gunzipSync(buf);
const txt = buf.toString().trim();
const raw = txt[0] === '[' ? JSON.parse(txt) : txt.split('\n').map(l => JSON.parse(l));
const seen = new Set();
const cards = raw.filter(o => o && o.name && o.legalities?.commander !== 'not_legal' && !/^(Token|Card|Emblem)\b/.test(o.type_line || '') && !seen.has(o.name) && seen.add(o.name));
ctx.__raw = cards;
vm.runInContext(`if (typeof ENGINE_ROLES !== 'undefined') for (const k of Object.keys(ENGINE_ROLES)) delete ENGINE_ROLES[k];`, ctx);
vm.runInContext(`{const rows=[];for(const o of __raw){const c=fromScryfall(o);if(c)rows.push(c);} buildIndex(rows);}`, ctx);
const deckRoles = name => { ctx.__n = name; return vm.runInContext(`(()=>{const c=find(__n);return c?[...tags(c).roles]:null})()`, ctx); };
const ROLES = ['ramp', 'draw', 'removal', 'wipe', 'protect', 'counter', 'tutor'];
const rank = rankFile ? new Map(JSON.parse(fs.readFileSync(rankFile)).map(c => [c.name, c.rank])) : new Map();

const LAND_W = /\b(lands?|Forests?|Islands?|Swamps?|Mountains?|Plains|basic)\b/i;
const PERM = /creature|permanent|artifact|enchantment|planeswalker|battle|\bland|any target/i;
const KEEP = /^(hexproof|indestructible|shroud|protection|ward)/i;
function lines(o) {
  const faces = o.card_faces?.length && !o.oracle_text ? o.card_faces : [o];
  return faces.flatMap(f => String(f.oracle_text || '').split('\n').map(l => ({ line: l.replace(/\([^)]*\)/g, '').trim(), name: f.name || o.name, type: f.type_line || o.type_line || '' })));
}
function engineRoles(o) {
  const got = new Set(); let read = 0, tried = 0;
  for (const { line, name, type } of lines(o)) {
    if (!line) continue;
    const self = line.split(name).join('SELFNAME').replace(/\bthis (creature|permanent|artifact|enchantment|land)\b/gi, 'SELFNAME');
    const land = /\bLand\b/.test(type), spell = /\b(Instant|Sorcery)\b/.test(type);
    const act = /^([^:"]{1,80}):\s*(.+)$/.exec(self), trig = /^(?:[A-Z][\w' ]+ — )?(?:When|Whenever|At)\b[^,]*,\s*(.+)$/i.exec(self);
    let effect = trig ? trig[1] : act && /\{|Sacrifice|Discard|Pay|Tap|Exile|Remove|Return/i.test(act[1]) ? act[2] : spell || /^(You|Each|Target|Creatures|Other|Enchanted|Equipped)\b/.test(self) ? self : null;
    if (!effect) continue;
    tried++;
    let r; try { r = compileEffectText(effect, { sourceName: 'SELFNAME' }); } catch { continue; }
    if (!r.supported || !r.effects.length) continue;
    read++;
    const scope = bind => ((r.requirements || []).find(q => q.bind === bind)?.scope) || '';
    const tgt = e => { const s = scope(e.bind); return !!e.bind && PERM.test(s) && !/you control|you own|graveyard|\bcard\b|player/.test(s.replace(/an opponent controls/, '')) ; };
    for (const e of r.effects) {
      const k = e.kind;
      if (k === 'add-mana' && !land) got.add('ramp');
      if (k === 'create-token' && /Treasure/.test(e.name || '') && !land) got.add('ramp');
      if ((k === 'library-search' || k === 'b110-search-many') && !land) {
        const w = (e.text || effect) + ' ' + (r.requirements || []).map(q => q.label || '').join(' ');
        if (LAND_W.test(w) && /battlefield/.test(e.text || effect)) got.add('ramp');
        else if (!LAND_W.test(w)) got.add('tutor');
      }
      if (k === 'hand-to-battlefield' && /\bland\b/i.test(effect) && !land) got.add('ramp');
      if (k === 'draw' && e.scope === 'you' && !e.bind) got.add('draw');
      if (k === 'designation' || /monarch|initiative/.test(k)) got.add('draw');
      if (/^(destroy|exile|bounce|damage|fight|to-library|gain-control|tap|b110-gain-control-while|b110-lock-untap|damage-from-selected-creature|destroy-many|exile-many|bounce-many|distribute)$/.test(k) && k !== 'tap' && tgt(e)) got.add('removal');
      if (k === 'pump' && tgt(e) && (e.toughness < 0 || e.power < 0)) got.add('removal');
      if (k === 'sacrifice-many' && e.playerBind) got.add('removal');
      if (k === 'zone-each' && !/^lands?$/i.test(e.filter || '') && !/you control/.test(e.filter || '') && e.to !== 'hand-own') got.add('wipe');
      if (k === 'damage-each' && e.creatures) got.add('wipe');
      if (k === 'pump-each' && (e.power < 0 || e.toughness < 0) && !/you/.test(e.scope || '')) got.add('wipe');
      if (/^(destroy-all|bounce-each|exile-each)/.test(k)) got.add('wipe');
      if (/^grant-keyword/.test(k) && KEEP.test(e.keyword || '') && (e.bind ? /creature|permanent/.test(scope(e.bind)) : k.endsWith('each'))) got.add('protect');
      if (k === 'phase-out' || k === 'prevent-combat' || k === 'b110-grant-protection-choice') got.add('protect');
      if (k === 'counter-spell' || (k === 'unless-pays' && /counter/i.test(effect))) got.add('counter');
    }
  }
  return { roles: got, read, tried };
}
// arbiter: plain sentence patterns, independent of both readers
const SENT = o => (o.card_faces?.length && !o.oracle_text ? o.card_faces : [o]).flatMap(f => String(f.oracle_text || '').replace(/\([^)]*\)/g, '').split(/\n|(?<=\.)\s+/)).map(s => s.trim()).filter(Boolean);
const ARB = {
  ramp: s => /\bAdd (\{[^}]+\})+|adds? (one|two|three|x) mana|Treasure token|search your library for [^.]*(land|Forest|Plains|Island|Swamp|Mountain)[^.]*onto the battlefield|put a land card from your hand onto the battlefield|additional land|spells? you cast cost \{\d\} less|adds? an additional|adds? one additional/i.test(s) && !/Treasure token[^.]*opponent|each opponent/i.test(s),
  draw: s => /\bdraws? (a|an|one|two|three|four|x|that many|\d+) (additional )?cards?|you become the monarch|take the initiative|draw cards equal|exile the top [^.]*of your library[^.]*(play|cast)/i.test(s) && !/each opponent draws|each player draws|target opponent draws|whenever (you|an opponent|a player) draws?/i.test(s) && !/discard (a|two|one) cards?, then draw/i.test(s),
  removal: s => /(destroy|exile) (up to \w+ |x |two |three )?(other |another )?target [^.]*?(creature|permanent|artifact|enchantment|planeswalker|battle)|deals? (\d+|x) damage to (any target|target (creature|planeswalker|battle|permanent)|up to)|gets? -\d+\/-\d+|(return|put)s? target [^.]*?(creature|permanent|nonland)[^.]*(owner's hand|library)|\bfights?\b|sacrifices? (a|an|another) (creature|permanent|nonland)|gain control of target|opponent sacrifices|shuffles it into|each (other )?player sacrifices|tap target creature|exile that creature|loses all abilities|can't attack or block|can't attack,|base power and toughness|destroy it|shuffles? (it|them) into/i.test(s) && !/you control|you own|graveyard/i.test(s.replace(/(don't|doesn't) control/, '')),
  wipe: s => /(destroy|exile|return) (all|each) (?!lands)(other )?(nonland )?(creatures?|artifacts?|enchantments?|permanents?|nontoken|non)|damage to each (other )?(creature|non)|(all|each) (other )?creatures? gets? -|creatures (your opponents control|you don't control) get -|Overload|sacrifices (all|\w+) creatures|damage to each other creature/i.test(s) && (/Overload|each other creature/i.test(s) || !/you control|from (a|your|all) graveyards?/i.test(s.replace(/(don't|doesn't) control/, ''))),
  protect: s => /(hexproof|indestructible|protection from|shroud|phases? out|prevent all (combat )?damage|regenerate|return it to the battlefield|then return|change the target of|ward)/i.test(s) && /(target|creatures|permanents|artifacts|you control|enchanted|equipped|you (gain|have))/i.test(s) && !/^(Flying|Hexproof|Indestructible|Ward|Protection)\b/i.test(s) && !/\b(this creature|SELF) (gains?|has|have)\b/i.test(s) && !/(creatures?|permanents?) (an opponent|your opponents) controls?/i.test(s),
  counter: s => /\bcounter (up to \w+ )?(another )?target [^.]*?(spell|ability)|\bcounter (that|the|it|each) (spell|ability|creature)|exile (any number of )?target spells?/i.test(s) && !/ward/i.test(s),
  tutor: s => /search your library (and\/or (graveyard|outside)[^.]* )?for (a|an|up to \w+|two|three|x|\w+) (?!basic land|land|Plains|Island|Swamp|Mountain|Forest)/i.test(s) && !/basic land|land card|Forest card|Plains card/i.test(s)
};
const arbiter = o => { const S = SENT(o), r = new Set(); for (const k of ROLES) if (S.some(ARB[k])) r.add(k); return r; };

// jobs the Deck Builder gives on purpose (its own rules, not misreads): cost reducers and Utopia Sprawl-style auras and untaps as ramp,
// impulse draw / Clues / connive as card flow, edicts as removal, umbra armor as protection
const DESIGN = { ramp: /cost[s]? \{\d\} less|adds? an additional|adds? one additional|untap target (Forest|land)/i, draw: /exile the top [^.]*(play|cast)|investigate|Clue|connive|explores?\b/i, removal: /sacrifices? (a|an|another|\w+) (creature|permanent|nonland)/i, protect: /umbra armor|totem armor/i };
const rows = [];
for (const o of cards) {
  const d = deckRoles(o.name); if (!d) continue;
  const g = engineRoles(o), a = arbiter(o);
  const land = /\bLand\b/.test(o.type_line || '') && !/ \/\/ /.test(o.type_line || '');
  const row = { name: o.name, rank: rank.get(o.name) ?? o.edhrec_rank ?? null, type: o.type_line, land, deck: d.filter(x => ROLES.includes(x)), engine: [...g.roles], arb: [...a], read: g.read, tried: g.tried, cat: {} };
  for (const role of ROLES) {
    const D = row.deck.includes(role), E = g.roles.has(role), A = a.has(role);
    let c = null;
    if (D && E) c = 'agree';
    else if (D && !E) c = land ? 'artefact-land' : DESIGN[role]?.test(o.oracle_text || '') ? 'db-design' : A ? (g.read < g.tried || !g.read ? 'artefact-engine-unread' : 'artefact-engine-kind') : 'db-wrong';
    else if (!D && E) c = land ? 'artefact-land' : A ? 'db-miss' : 'artefact-engine-loose';
    else if (A && !land) c = 'arbiter-only';
    if (c) row.cat[role] = c;
  }
  if (Object.keys(row.cat).length) rows.push({ ...row, text: (o.oracle_text || (o.card_faces || []).map(f => f.oracle_text).join(' // ')).slice(0, 400) });
}
const sum = { cards: cards.length, roles: {} };
for (const role of ROLES) { const x = {}; for (const r of rows) { const c = r.cat[role]; if (c) x[c] = (x[c] || 0) + 1; } sum.roles[role] = x; }
fs.writeFileSync(outFile, JSON.stringify({ at: new Date().toISOString(), ...sum, rows }, null, 1));
for (const role of ROLES) console.log(role.padEnd(8), JSON.stringify(sum.roles[role]));
console.log('cards', cards.length, 'rows with a disagreement or agreement', rows.length);
