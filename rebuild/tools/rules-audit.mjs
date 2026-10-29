// Rules audit: which cards Guided Play cannot fully run by itself.
//   node tools/rules-audit.mjs cards.json [report.json]
// cards.json is a list of Scryfall card objects (for example a search ordered by EDHREC rank).
// For each card it reports what players would have to do by hand: triggers the game never fires,
// effects it cannot apply, and static rules text it does not enforce. Prints a summary grouped by
// the kind of gap, most common first, so the next rules work goes where real decks need it.

import { readFileSync, writeFileSync } from 'node:fs';
import { scryfallToDefinition } from '../src/data/card-api.js';
import { analyzeDefinitionSupport } from '../src/engine/abilities.js';
import { MECHANICS } from '../src/data/mechanics.js';

const [input, output] = process.argv.slice(2);
if (!input) { console.error('usage: node tools/rules-audit.mjs cards.json [report.json]'); process.exit(1); }
const cards = JSON.parse(readFileSync(input, 'utf8'));

// Static lines are not run through one checker in the game (keywords, anthems and restrictions are
// each handled in their own place), so they are judged here: an instant's or sorcery's text is the
// spell itself (checked above), a keyword uses the terms key's automation rating, and anything else
// is listed as "not verified" rather than counted as a gap.
const KEYWORDS = MECHANICS.filter(x => x.kind !== 'concept').sort((a, b) => b.name.length - a.name.length);
function staticVerdict(line, def) {
  const text = line.replace(/^Static: /, '').trim();
  if (/Instant|Sorcery/i.test(def.typeLine || '')) return 'spell-text';
  const words = text.split(/\s*,\s*/);
  const terms = words.map(w => KEYWORDS.find(k => new RegExp(`^${k.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(w)));
  if (terms.every(Boolean)) {
    const worst = terms.some(t => t.automation === 'manual') ? 'manual' : terms.some(t => t.automation === 'partial') ? 'partial' : 'auto';
    return worst === 'auto' ? 'auto' : `${worst}:${terms.find(t => t.automation === worst).name}`;
  }
  return 'unverified';
}

// One short label per gap, so similar gaps group together.
function gapKind(line) {
  const t = line.replace(/^(Activated|Trigger|Spell|Static): /, '');
  if (/^Trigger: The game never fires/.test(line) || /never fires/.test(t)) {
    const m = t.match(/"(.+?)"/);
    const when = (m?.[1] || '').replace(/\b[A-Z][a-z]+(?:,? [A-Z][a-z']+)*\b/g, w => w).toLowerCase();
    if (/becomes? the target/.test(when)) return 'Trigger never fires: becomes the target';
    if (/search/.test(when)) return 'Trigger never fires: searching a library';
    if (/\bcycle|cycling/.test(when)) return 'Trigger never fires: cycling';
    if (/\bmill|put into .* graveyard from (?:your library|anywhere)|cards? (?:are|is) put into/.test(when)) return 'Trigger never fires: cards put into graveyard';
    if (/\bactivate/.test(when)) return 'Trigger never fires: activating abilities';
    if (/\bcounter(?:ed)?\b/.test(when) && /spell/.test(when)) return 'Trigger never fires: spells countered';
    if (/\bexile|exiled/.test(when)) return 'Trigger never fires: exiling';
    if (/\buntap/.test(when)) return 'Trigger never fires: untapping';
    if (/\bdealt damage|is dealt|deals damage/.test(when)) return 'Trigger never fires: noncombat damage';
    if (/\bcopy|copied/.test(when)) return 'Trigger never fires: copying';
    if (/\btransform|turned face up|face up/.test(when)) return 'Trigger never fires: transform / face up';
    if (/\bcombat|attack|block/.test(when)) return 'Trigger never fires: other combat wording';
    if (/\benter|leaves|dies|sacrifice/.test(when)) return 'Trigger never fires: other enter/leave/die wording';
    if (/\bcast/.test(when)) return 'Trigger never fires: other cast wording';
    if (/\bbeginning of|end of/.test(when)) return 'Trigger never fires: other step/phase wording';
    if (/\bgain life|lose life|loses life/.test(when)) return 'Trigger never fires: other life wording';
    if (/\bdraw/.test(when)) return 'Trigger never fires: other draw wording';
    if (/\bcounter/.test(when)) return 'Trigger never fires: counters placed/removed';
    return 'Trigger never fires: other';
  }
  if (/^Static:/.test(line)) {
    if (/can't|cannot/i.test(t)) return 'Static: restriction ("can\'t …") not enforced';
    if (/\bcost(?:s)? \{?\d|cost .* less|cost .* more/i.test(t)) return 'Static: cost change';
    if (/\bif .* would|instead/i.test(t)) return 'Static: replacement effect ("would … instead")';
    if (/you may (?:play|cast)|from (?:your graveyard|the top of your library|exile)/i.test(t)) return 'Static: play/cast from another zone';
    if (/\bget [+-]|have |gains? /i.test(t)) return 'Static: other continuous effect';
    if (/^(Equip|Enchant|Crew|Ward|Protection|Landwalk|\w+walk|Cascade|Convoke|Affinity|Storm|Partner|Annihilator|Myriad|Prowess|Undying|Persist|Flanking|Bushido|Exalted|Extort|Evolve|Changeling|Devoid|Delve|Improvise|Embalm|Eternalize|Unearth|Ninjutsu|Madness|Suspend|Mutate|Companion|Hexproof from|Split second|Shroud|Horsemanship|Banding|Phasing|Rampage|Bloodthirst|Fabricate|Afterlife|Riot|Training|Disturb|Daybound|Decayed|Boast|Foretell|Casualty|Blitz|Backup|Bargain|Craft|Disguise|Offspring|Gift)\b/i.test(t)) return `Static: keyword ${t.split(/[\s—(]/)[0]}`;
    return 'Static: other rules text';
  }
  if (/^Spell:/.test(line)) {
    const alt = t.match(/^(\w+) is not fully automated/);
    return alt ? `Spell: ${alt[1]}` : 'Spell: effect not applied automatically';
  }
  if (/^Keyword:/.test(line)) return line;
  if (/^Activated:/.test(line)) return 'Activated ability: effect not applied automatically';
  if (/^Trigger:/.test(line)) return 'Trigger fires, but its effect is resolved by hand';
  return 'Other';
}

const rows = [];
for (const [rank, card] of cards.entries()) {
  if (!card.oracle_text && !card.card_faces) continue;
  const def = scryfallToDefinition(card);
  let report;
  try { report = analyzeDefinitionSupport(def); } catch (error) { report = { unsupported: [`Other: audit failed (${error.message})`] }; }
  const gaps = [], unverified = [];
  for (const u of report.unsupported) {
    if (u.startsWith('Static: ')) {
      const v = staticVerdict(u, def);
      if (v === 'spell-text' || v === 'auto') continue;
      if (v === 'unverified') { unverified.push(u.slice(8)); continue; }
      gaps.push(`Keyword: ${v.split(':')[1]} (${v.startsWith('manual') ? 'by hand' : 'common cases only'})`);
      continue;
    }
    gaps.push(u.startsWith('Trigger: ') && (report.triggers || []).some(t => !t.fires && u.includes(t.text)) ? `Trigger: The game never fires "${(report.triggers.find(t => !t.fires && u.includes(t.text)) || {}).trigger}"` : u);
  }
  rows.push({ rank: rank + 1, name: card.name, type: def.typeLine, automated: !gaps.length, gaps, unverified, kinds: [...new Set(gaps.map(gapKind))] });
}

const auto = rows.filter(r => r.automated).length;
const byKind = new Map();
for (const r of rows) for (const k of r.kinds) byKind.set(k, [...(byKind.get(k) || []), r]);
const kinds = [...byKind.entries()].sort((a, b) => b[1].length - a[1].length);
const unverified = rows.filter(r => r.automated && r.unverified.length).length;
console.log(`${rows.length} cards: ${auto} with nothing to do by hand (${Math.round(100 * auto / rows.length)}%; ${unverified} of them have other rules text this audit cannot verify), ${rows.length - auto} need something by hand.\n`);
for (const [kind, list] of kinds) console.log(`${String(list.length).padStart(4)}  ${kind}  — e.g. ${list.slice(0, 4).map(r => r.name).join(', ')}`);
if (output) writeFileSync(output, JSON.stringify({ total: rows.length, automated: auto, unverified, kinds: kinds.map(([kind, list]) => ({ kind, count: list.length, cards: list.map(r => r.name) })), cards: rows }, null, 1));
