// ===== Rules reader (engine redesign, layer 1; engine-v2) =====
// Reads a card's Oracle text into structured abilities, following the Comprehensive Rules (2026-09-25): keyword abilities,
// static, triggered, activated and mana abilities, replacement effects, and what an instant or sorcery does. Each ability
// carries its costs (mana, tapping, sacrificing, discarding, life, counters), its trigger (event, subject, condition), its
// timing and its effects (verb, target, amount, duration). A sentence it cannot read is kept in `unknown`, never guessed.
// Format: tools/rules/testset/README.md; checked against tools/rules/testset/cards.json (rrcheck.js).
// Keyword abilities (rule 702) and ability words (207.2c), longest first so "first strike" wins over "strike".
const RR_KEYWORDS = [
  'daybound and nightbound',
  'more than meets the eye',
  'start your engines!',
  'cumulative upkeep',
  'indestructible',
  'space sculptor',
  'double strike',
  'for mirrodin!',
  'hidden agenda',
  'living weapon',
  'first strike',
  'horsemanship',
  'living metal',
  'split second',
  'web-slinging',
  '\u221e (infinity)',
  'annihilator',
  'bloodthirst',
  'demonstrate',
  'firebending',
  'freerunning',
  'reconfigure',
  'transfigure',
  'umbra armor',
  'battle cry',
  'changeling',
  'compleated',
  'deathtouch',
  'eternalize',
  'gravestorm',
  'intimidate',
  'job select',
  'jump-start',
  'protection',
  'read ahead',
  'afterlife',
  'aftermath',
  'aura swap',
  'companion',
  'fabricate',
  'flashback',
  'harmonize',
  'impending',
  'improvise',
  'increment',
  'max speed',
  'offspring',
  'poisonous',
  'prototype',
  'reinforce',
  'replicate',
  'soulshift',
  'spectacle',
  'transmute',
  'undaunted',
  'vanishing',
  'vigilance',
  'affinity',
  'casualty',
  'champion',
  'conspire',
  'defender',
  'dethrone',
  'disguise',
  'escalate',
  'flanking',
  'forecast',
  'foretell',
  'hexproof',
  'hideaway',
  'landwalk',
  'level up',
  'lifelink',
  'mobilize',
  'ninjutsu',
  'offering',
  'overload',
  'paradigm',
  'power-up',
  'ravenous',
  'scavenge',
  'soulbond',
  'sunburst',
  'teamwork',
  'training',
  'afflict',
  'amplify',
  'banding',
  'bargain',
  'bushido',
  'buyback',
  'cascade',
  'convoke',
  'cycling',
  'decayed',
  'disturb',
  'enchant',
  'entwine',
  'exalted',
  'exhaust',
  'exploit',
  'fortify',
  'madness',
  'miracle',
  'modular',
  'outlast',
  'partner',
  'persist',
  'phasing',
  'provoke',
  'prowess',
  'rampage',
  'rebound',
  'recover',
  'retrace',
  'station',
  'storied',
  'suspend',
  'trample',
  'tribute',
  'undying',
  'unearth',
  'unleash',
  'absorb',
  'ascend',
  'assist',
  'awaken',
  'backup',
  'bestow',
  'cipher',
  'cleave',
  'devoid',
  'devour',
  'dredge',
  'embalm',
  'emerge',
  'encore',
  'enlist',
  'escape',
  'evolve',
  'extort',
  'fading',
  'flying',
  'frenzy',
  'infect',
  'ingest',
  'kicker',
  'mayhem',
  'menace',
  'mentor',
  'mutate',
  'myriad',
  'renown',
  'ripple',
  'saddle',
  'shadow',
  'shroud',
  'solved',
  'splice',
  'tiered',
  'wither',
  'blitz',
  'boast',
  'craft',
  'delve',
  'equip',
  'evoke',
  'flash',
  'graft',
  'haste',
  'haunt',
  'melee',
  'morph',
  'prowl',
  'reach',
  'skulk',
  'sneak',
  'spree',
  'squad',
  'storm',
  'surge',
  'toxic',
  'visit',
  'crew',
  'dash',
  'echo',
  'epic',
  'fear',
  'fuse',
  'gift',
  'plot',
  'riot',
  'ward',
  'warp'
];
const RR_ABILITY_WORDS = new Set([
  'adamant',
  'addendum',
  'alliance',
  'battalion',
  'bloodrush',
  'celebration',
  'channel',
  'chroma',
  'cohort',
  'constellation',
  'converge',
  'council\u2019s dilemma',
  'coven',
  'delirium',
  'descend 4',
  'descend 8',
  'disappear',
  'domain',
  'eerie',
  'eminence',
  'enrage',
  'fateful hour',
  'fathomless descent',
  'ferocious',
  'flurry',
  'formidable',
  'grandeur',
  'hellbent',
  'heroic',
  'imprint',
  'infusion',
  'inspired',
  'join forces',
  'kinship',
  'landfall',
  'lieutenant',
  'magecraft',
  'metalcraft',
  'morbid',
  'opus',
  'pack tactics',
  'paradox',
  'parley',
  'radiance',
  'raid',
  'rally',
  'renew',
  'repartee',
  'revolt',
  'secret council',
  'spell mastery',
  'strive',
  'survival',
  'sweep',
  'tempting offer',
  'threshold',
  'undergrowth',
  'valiant',
  'vivid',
  'void',
  'will of the council'
]);
const RR_NUM = {
  a: 1,
  an: 1,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  another: 1
};
const rrNum = w => {
  if (w == null) return null;
  const s = String(w).toLowerCase().trim();
  if (/^\d+$/.test(s)) return +s;
  if (s in RR_NUM) return RR_NUM[s];
  if (/^x$/.test(s)) return 'X';
  if (/^that many$/.test(s)) return 'that many';
  if (/^any number of$/.test(s)) return 'any';
  const u = /^up to (\w+)$/.exec(s);
  if (u) return 'up to ' + rrNum(u[1]);
  return s;
};
// A card's text with its own name (and "this creature", "this spell"...) as ~, reminder text left out.
function rrPrep(text, name) {
  let o = String(text || '');
  const short = String(name || '').split(' // ')[0],
    first = short.split(',')[0];
  const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  if (short) o = o.split(short).join('~');
  if (first && first !== short && first.length > 3) o = o.replace(new RegExp('\\b' + esc(first) + '\\b', 'g'), '~');
  o = o.replace(
    /\bthis (creature|artifact|enchantment|land|planeswalker|permanent|spell|aura|equipment|vehicle|card|token|saga|battle|siege|class|case|room|attraction)\b/gi,
    '~'
  );
  o = o.replace(/\s*\([^()]*\)/g, ''); // reminder text
  return o;
}
// ---- costs ----
function rrCost(text) {
  const out = [];
  let ok = true;
  const parts = String(text)
    .split(/,\s*(?![^{]*\})/)
    .map(s => s.trim())
    .filter(Boolean);
  for (const p of parts) {
    let m;
    if (/^\{T\}$/i.test(p)) out.push({tap: true});
    else if (/^\{Q\}$/i.test(p)) out.push({untap: true});
    else if (/^(\{[^}]+\})+$/.test(p)) out.push({mana: p});
    else if ((m = /^([+−-]?)(\d+|X)$/.exec(p))) out.push({loyalty: (m[1] === '−' || m[1] === '-' ? '-' : m[1] || '') + m[2]});
    else if ((m = /^sacrifice (~|another|an|a|one|two|three|x|\d+|any number of)(?!\w)\s*(.*)$/i.exec(p)))
      out.push({
        sacrifice: {
          count: m[1] === '~' ? 1 : rrNum(m[1]) || 1,
          what: m[1] === '~' ? 'self' : (m[1] === 'another' ? 'another ' : '') + (m[2] || 'permanent')
        }
      });
    else if ((m = /^discard (a|an|one|two|three|x|\d+|your hand|this card|~)\s*(.*)$/i.exec(p)))
      out.push({
        discard: {count: /hand/.test(m[1]) ? 'hand' : /~|this card/.test(m[1]) ? 'self' : rrNum(m[1]), what: m[2] || 'card'}
      });
    else if ((m = /^pay (\d+|x) life$/i.exec(p))) out.push({life: rrNum(m[1])});
    else if ((m = /^remove (a|an|one|two|three|x|\d+|all|any number of) (.+?) counters? from (.+)$/i.exec(p)))
      out.push({'remove-counters': {count: rrNum(m[1]), kind: m[2], from: m[3]}});
    else if ((m = /^exile (.+?) from your graveyard$/i.exec(p))) out.push({'exile-from-graveyard': m[1]});
    else if ((m = /^exile ~$/i.exec(p))) out.push({'exile-self': true});
    else if ((m = /^tap (an|a|one|two|three|x|\d+) untapped (.+?)( you control)?$/i.exec(p)))
      out.push({'tap-others': {count: rrNum(m[1]), what: m[2]}});
    else if ((m = /^return (.+?) you control to its owner's hand$/i.exec(p))) out.push({'return-own': m[1]});
    else if ((m = /^put (.+?) counters? on (.+)$/i.exec(p))) out.push({'add-counters': m[1]});
    else if ((m = /^mill (\w+) cards?$/i.exec(p))) out.push({mill: rrNum(m[1])});
    else {
      out.push({unknown: p});
      ok = false;
    }
  }
  return {cost: out, ok};
}
// ---- what is targeted or affected ----
function rrScope(s) {
  let m;
  s = String(s || '').trim();
  if ((m = /^(up to (?:one|two|three|four|x|\d+)|one|two|three|x|\d+|any number of)?\s*(other )?target (.+)$/i.exec(s)))
    return {target: {count: rrNum(m[1] || 'one'), what: (m[2] || '') + m[3]}};
  if ((m = /^(all|each) (.+)$/i.exec(s))) return {all: m[2]};
  if (/^(~|it|itself)$/i.test(s)) return {self: true};
  return {what: s};
}
const RR_DUR = [
  [/\buntil end of turn\b/i, 'end-of-turn'],
  [/\buntil your next turn\b/i, 'your-next-turn'],
  [/\bthis turn\b/i, 'this-turn'],
  [/\bfor as long as\b/i, 'as-long-as']
];
const rrDur = s => (RR_DUR.find(([r]) => r.test(s)) || [])[1];
// ---- effects: one sentence into effect atoms ----
// Each pattern finds one kind of effect anywhere in the sentence; a sentence is read when its words are covered by what was
// found (the leftover is only joining words), otherwise it is kept as unknown.
// the subject of an effect found mid-sentence ("Creatures you control gain ..."): the words before it, back to the last clause break
const rrWho = m =>
  m.input
    .slice(0, m.index)
    .split(/[,;:]\s*|\bthen\b|\band\b(?= (?:target|each|all|creatures|permanents|it|you)\b)/i)
    .pop()
    .trim() ||
  (/^(each (?:other )?player|each opponent|target (?:player|opponent)|that player)\b/i.exec(m.input) || [])[1] ||
  '';
const RR_EFFECTS = [
  [
    /\badd ((?:\{[^}]+\})+(?:,? or (?:\{[^}]+\})+)*|one mana of any (?:one )?color[^.,]*|(?:one|two|three|x|\d+) mana of any (?:one )?color[^.,]*|mana of any color[^.,]*|an amount of \{\w\} equal to [^.,]*)/i,
    m => ({do: 'add-mana', mana: m[1]})
  ],
  [
    /\b(?:you )?draws? (a|an|one|two|three|four|five|six|seven|x|\d+|that many|up to (?:one|two|three|four|x)) cards?/i,
    m => ({do: 'draw', count: rrNum(m[1])})
  ],
  [/\bdraws? cards equal to ([^.,]+)/i, m => ({do: 'draw', count: m[1]})],
  [
    /\bsearch (your|target player's|its owner's|their) library for ([^.,]+?)(?:,|\.|$| and )/i,
    m => ({do: 'search', from: 'library', what: m[2]})
  ],
  [
    /\bput (?:that card|it|them|those cards|one of (?:them|those cards)|the other|that land) (?:onto the battlefield|into your hand)/i,
    m => ({do: 'put', to: /battlefield/.test(m[0]) ? 'battlefield' : 'hand'})
  ],
  [
    /\bdestroy ((?:up to (?:one|two|three|x) |one |two |three |x |\d+ |each |all |any number of )?(?:other )?(?:target )?[^.]+?)(?=\.|,| and |$|\. )/i,
    m => Object.assign({do: 'destroy'}, rrScope(m[1]))
  ],
  [
    /\bexile ((?:up to (?:one|two|three|x) |each |all |another |)target [^.]+?|all [^.]+?|each [^.]+?|~|it|them|that (?:card|creature|permanent|token|spell)[^.,]*|those cards[^.,]*|(?:a|two|three|x) cards? from [^.,]+|(?:target player's|each opponent's|their|your|its owner's) graveyard)(?=\.|,| and |$| until )/i,
    m => Object.assign({do: 'exile'}, rrScope(m[1]))
  ],
  [
    /\bcounter (target (?:spell|activated ability|triggered ability|activated or triggered ability|noncreature spell|creature spell|instant or sorcery spell|artifact or enchantment spell)[^.,]*|that spell|it)/i,
    m => Object.assign({do: 'counter'}, rrScope(m[1]))
  ],
  [
    /\bcreates? (a|an|one|two|three|four|five|x|\d+|that many|a number of) ([^.]*?)tokens?/i,
    m => ({do: 'create-token', count: rrNum(m[1]), token: m[2].trim()})
  ],
  [
    /\breturn ([^.]+?) (?:from (?:your|a|an opponent's|any|their|its owner's) graveyard )?to the battlefield|\bput ([^.]+?) from (?:your|a|an opponent's|any|their) graveyard onto the battlefield/i,
    m => ({do: 'return-to-battlefield', what: m[1] || m[2]})
  ],
  [/\breturn ([^.]+?) to (?:its|their) owner(?:'s|s'|s)? hands?/i, m => Object.assign({do: 'bounce'}, rrScope(m[1]))],
  [/\breturn ([^.]+?) from (?:your|a|their) graveyard to (?:your|its owner's|their) hand/i, m => ({do: 'regrow', what: m[1]})],
  [
    /\b(?:you |its controller |that player |target player |each player |each opponent )?gains? (\d+|x|that much|twice x) life|\bgains? life equal to ([^.,]+)/i,
    m => ({do: 'gain-life', amount: m[1] || m[2]})
  ],
  [
    /\b(?:you |its controller |that player |target (?:player|opponent) |each player |each opponent )?loses? (\d+|x|that much) life|\bloses? life equal to ([^.,]+)/i,
    m => ({do: 'lose-life', amount: m[1] || m[2]})
  ],
  [
    /\bdeals? (\d+|x|that much|damage equal to [^.,]+?|twice x) damage to ([^.]+?)(?=\.|,| and |$)/i,
    m => Object.assign({do: 'damage', amount: m[1]}, rrScope(m[2]))
  ],
  [/\bdeals damage equal to ([^.]+?) to ([^.]+?)(?=\.|$)/i, m => Object.assign({do: 'damage', amount: m[1]}, rrScope(m[2]))],
  [/\bfights? ([^.]+)/i, m => ({do: 'fight', what: m[1]})],
  [
    /\bputs? (a|an|one|two|three|four|five|x|\d+|that many|those|its|twice that many) ([+-]1\/[+-]1|\w+) counters? on ([^.]+?)(?=\.|,|$| for )/i,
    m => ({do: 'put-counters', count: rrNum(m[1]), kind: m[2], on: m[3]})
  ],
  [/\bput those counters on ([^.]+)/i, m => ({do: 'put-counters', what: 'those counters', on: m[1]})],
  [
    /\bmove (all|any number of|a|one|those|the) ([^.]*?)counters? from ([^.]+?) onto ([^.]+)/i,
    m => ({do: 'move-counters', what: m[1] + ' ' + m[2], from: m[3], to: m[4]})
  ],
  [/\bproliferate\b/i, () => ({do: 'proliferate'})],
  [/\bdouble the number of ([^.]+?) counters?/i, m => ({do: 'double-counters', kind: m[1]})],
  [/\bmills? (a|an|one|two|three|four|five|six|seven|ten|x|\d+|that many) cards?/i, m => ({do: 'mill', count: rrNum(m[1])})],
  [/\bmills cards equal to ([^.]+)/i, m => ({do: 'mill', count: m[1]})],
  [
    /\bdiscards? (a|an|one|two|three|x|\d+|that many|their hand|your hand|all the cards in their hand|that card|those cards|it) ?(cards?)?/i,
    m => ({do: 'discard', count: m[1]})
  ],
  [
    /\bsacrifices? (another|an|a|one|two|three|x|\d+|that|it|all|each|~|those|them|the rest)(?!\w)\s*([^.]*?)(?=\.|,|$| and )/i,
    m => ({do: 'sacrifice', who: rrWho(m), count: m[1], what: m[2]})
  ],
  [
    /\buntap (all|each|target|up to \w+ target|those|it|~|that|enchanted|equipped|the|two|three|x|\d+)\s*([^.]*?)(?=\.|,|$)/i,
    m => ({do: 'untap', what: (m[1] + ' ' + m[2]).trim()})
  ],
  [
    /\btap (all|each|target|up to \w+ target|those|it|that|enchanted|equipped|~|x|\d+|two|three)\s*([^.]*?)(?=\.|,|$)/i,
    m => ({do: 'tap', what: (m[1] + ' ' + m[2]).trim()})
  ],
  [
    /\badds? (?:an additional|one additional|an additional one) ((?:\{[^}]+\})+|mana of any (?:one )?(?:type|color)[^.]*)/i,
    m => ({do: 'add-mana', mana: m[1], extra: true})
  ],
  [
    /\b(?:the owner of (target [^.]+?|each [^.]+?) (?:shuffles (?:it|them) into|puts (?:it|them) on (?:their choice of )?the top or bottom of) (?:their|its owner's) library|(?:puts?|shuffles?) (target [^.]+?) (?:into|on (?:the )?(?:top|bottom) of) (?:its|their) owner's library)/i,
    m => ({do: 'tuck', target: {count: 1, what: (m[1] || m[2]).replace(/^target /, '')}})
  ],
  [/\bgain control of ([^.]+?)(?=\.|$| until | for as long)/i, m => ({do: 'gain-control', what: m[1]})],
  [/\b([^.]*?)\bgets? ([+-]\w+)\/([+-]\w+)/i, m => ({do: 'pump', who: m[1].trim(), power: m[2], toughness: m[3]})],
  [
    /(?<!you )\b(?:gains?|has|have) ((?:flying|first strike|double strike|deathtouch|haste|hexproof|indestructible|lifelink|menace|reach|trample|vigilance|ward \{\d\}|protection from [^.,]+?|shroud|defender|flash|islandwalk|forestwalk|swampwalk|mountainwalk|plainswalk)(?:,? (?:and )?(?:flying|first strike|double strike|deathtouch|haste|hexproof|indestructible|lifelink|menace|reach|trample|vigilance|protection from [^.,]+?|shroud))*)/i,
    m => ({do: 'grant', who: rrWho(m), keywords: m[1].split(/,? and |, /)})
  ],
  [/\bgoad ([^.]+)/i, m => ({do: 'goad', what: m[1]})],
  [/\bphases? out\b/i, () => ({do: 'phase-out'})],
  [
    /\bcopy (target [^.]+?spell|that spell|it|~|them)(?=\.|,| and |$| for | twice| x times)/i,
    m => ({do: 'copy-spell', what: m[1]})
  ],
  [
    /\bcreate (?:a|an|\w+|x) (?:tapped and attacking |tapped )?tokens? that(?:'s| are) (?:a )?cop(?:y|ies) of ([^.,]+)/i,
    m => ({do: 'copy-permanent', what: m[1]})
  ],
  [/\bscry (\w+)/i, m => ({do: 'scry', count: rrNum(m[1])})],
  [/\bsurveil (\w+)/i, m => ({do: 'surveil', count: rrNum(m[1])})],
  [
    /\blook at the top (?:(\w+) )?cards? of (your|target player's|that player's|each player's|their) library/i,
    m => ({do: 'look', count: rrNum(m[1])})
  ],
  [
    /\bexile the top (?:(\w+) )?cards? of (your|their|target player's|each player's|that player's|his or her) library/i,
    m => ({do: 'exile-top', count: rrNum(m[1])})
  ],
  [
    /(?:\b(?:you may|you can|may|you could) |^)(?:play|cast) (?:that card|it|them|those cards|cards exiled|spells? from among|a [^.]*?from among cards exiled|the exiled card)(?! this way)/i,
    () => ({do: 'may-play-exiled'})
  ],
  [/\bwithout paying (?:its|their) mana costs?/i, () => ({do: 'free-cast'})],
  [/\btake an extra turn\b/i, () => ({do: 'extra-turn'})],
  [/\badditional combat phase\b/i, () => ({do: 'extra-combat'})],
  [/\bprevent all (?:combat )?damage/i, () => ({do: 'prevent-damage'})],
  [/\b(?:you )?gain protection from ([^.,]+)/i, m => ({do: 'protection', from: m[1]})],
  [/\byour life total can't change\b/i, () => ({do: 'life-total-cant-change'})],
  [/\bassigns? combat damage equal to its toughness rather than its power/i, () => ({do: 'assign-damage-by-toughness'})],
  [/\b(?:deals? )?(double|triple) that damage\b/i, m => ({do: m[1] + '-damage'})],
  [/\bwins? the game\b/i, () => ({do: 'win-game'})],
  [/\bloses? the game\b/i, () => ({do: 'lose-game'})],
  [/\bshuffles?\b/i, () => ({do: 'shuffle'})],
  [/\breveal (?:those cards|it|that card|the top [^.,]+|cards? from [^.,]+|them)/i, () => ({do: 'reveal'})],
  [/\binvestigate\b/i, () => ({do: 'create-token', count: 1, token: 'Clue'})],
  [/\bamass (\w+ )?(\d+|x)/i, m => ({do: 'amass', count: m[2]})],
  [/\bexplores?\b/i, () => ({do: 'explore'})],
  [/\bconnives?\b/i, () => ({do: 'connive'})],
  [/\bbecomes? the monarch\b/i, () => ({do: 'monarch'})],
  [/\btake the initiative\b/i, () => ({do: 'initiative'})],
  [/\bventure into the dungeon\b/i, () => ({do: 'venture'})],
  [/\bplay an additional land\b/i, () => ({do: 'extra-land'})],
  [/\bcan't be blocked\b/i, () => ({do: 'unblockable'})],
  [/\b(?:they|it) can't be regenerated\b/i, () => ({do: 'no-regenerate'})],
  [
    /\bcan't (?:attack|block|be countered|be the targets?|cast|activate|untap|gain life|lose)[^.]*/i,
    m => ({do: 'restrict', what: m[0]})
  ],
  [
    /\b(?:costs?|cost) \{(\d+|x)\} (?:less|more) to (?:cast|activate)\b/i,
    m => ({do: /less/.test(m[0]) ? 'cost-less' : 'cost-more', amount: m[1]})
  ],
  [/\bspells? (?:you cast )?(?:[^.]*?)cost \{(\d)\} less\b/i, m => ({do: 'cost-less', amount: m[1]})],
  [/\bregenerate\b/i, () => ({do: 'regenerate'})],
  [/\bchoose (?:a|one|an) [^.]+/i, () => ({do: 'choose'})],
  [
    /\bchoose (?:up to (?:one|two|three|four|x) )?target ([^.]+)/i,
    m => Object.assign({do: 'choose-target'}, rrScope('target ' + m[1]))
  ],
  [
    /\battach (?:~|it|that equipment|that aura|target equipment|an equipment|equipment|(?:up to )?one target equipment) to ([^.]+)/i,
    m => ({do: 'attach', to: m[1]})
  ],
  [/\bbecomes? (?:a|an) ([^.]+?)(?: until end of turn|$|\.)/i, m => ({do: 'become', what: m[1]})],
  [/\btransform ~/i, () => ({do: 'transform'})],
  [/\b(?:it )?loses "[^"]+" and gains "[^"]+"/i, () => ({do: 'change-text'})],
  [/\bpay (\{[^}]+\}(?:\{[^}]+\})*|\d+ life|x life)/i, m => ({do: 'pay', what: m[1]})],
  [/\bput the rest (?:on the bottom|into (?:your|their) (?:graveyard|hand)|back)/i, () => ({do: 'put-rest'})],
  [/\b(?:you may )?choose new targets for the cop(?:y|ies)/i, () => ({do: 'new-targets'})],
  [/\b(?:this ability triggers|do this) only once each turn/i, () => ({do: 'once-each-turn'})],
  [/\bactivate (?:only|this ability only) [^.]+/i, () => ({do: 'timing'})],
  [/\bany player may activate this ability/i, () => ({do: 'anyone-activates'})],
  [/\bit's still a land/i, () => ({do: 'still-land'})],
  [/\breveals? (?:their|his or her|your) hand/i, () => ({do: 'reveal-hand'})],
  [/\b(?:attacks|blocks) each (?:combat|turn) if able/i, () => ({do: 'must-attack'})],
  [/\bprevent the next (\w+) damage/i, m => ({do: 'prevent-damage', amount: m[1]})],
  [/\bdoesn't untap during/i, () => ({do: 'doesnt-untap'})],
  [/\bget (\{E\})+/i, () => ({do: 'energy'})],
  [
    /\bexile (?:it|them|that token|those tokens|the tokens?) at (?:the beginning of the next end step|end of combat)/i,
    () => ({do: 'delayed-exile'})
  ],
  [/\bcan block only creatures with/i, () => ({do: 'restrict'})],
  [
    /\b(?:monstrosity|adapt|bolster|support) (\w+)/i,
    m => ({do: 'put-counters', count: rrNum(m[1]), kind: '+1/+1', on: 'creature'})
  ],
  [/\byou control enchanted (?:creature|permanent|artifact|land)/i, () => ({do: 'gain-control', what: 'enchanted permanent'})],
  [/\bflip a coin/i, () => ({do: 'coin'})],
  [/\bwould die this turn, exile it instead/i, () => ({do: 'exile-if-dies'})],
  [/\bexert ~/i, () => ({do: 'exert'})],
  [/\bpower and toughness are each equal to/i, () => ({do: 'pt-defined'})],
  [/\b(?:power|toughness) is equal to/i, () => ({do: 'pt-defined'})],
  [/\bno maximum hand size/i, () => ({do: 'no-max-hand'})],
  [/\benter as a copy of\b/i, () => ({do: 'clone'})],
  [/\bthe ring tempts you/i, () => ({do: 'ring'})],
  [/\byou don't lose this mana/i, () => ({do: 'mana-persists'})],
  [/\bas ~ enters, you may pay (\d+) life/i, m => ({do: 'pay', what: m[1] + ' life'})],
  [/\bit enters tapped/i, () => ({do: 'enters-tapped'})],
  [/\blook at the top card of your library any time/i, () => ({do: 'look'})],
  [
    /\bput (?:a|an|any number of|up to \w+) [^.]*?cards? (?:from your hand|from among them|from among those cards) onto the battlefield/i,
    () => ({do: 'cheat-into-play'})
  ],
  [/\bput (?:a|an|any number of|up to \w+) [^.]*?cards? from among (?:them|those cards) into your hand/i, () => ({do: 'put'})],
  [/\b(?:cast|play) [^.]*?as though (?:it|they) had flash/i, () => ({do: 'flash-grant'})],
  [
    /\benters? with (?:a|an|one|two|three|x|\d+) additional ([+-]1\/[+-]1|\w+) counters?/i,
    m => ({do: 'put-counters', kind: m[1], on: 'entering creature'})
  ],
  [/\benters with a \+1\/\+1 counter on (?:it|him|her) for each/i, () => ({do: 'put-counters', kind: '+1/+1', on: 'self'})],
  [/\bput the same number and kind of counters on ([^.]+)/i, m => ({do: 'put-counters', what: 'same', on: m[1]})],
  [/\b(?<!loses "[^"]*" and )(?:gains?|has|have) "([^"]+)"/i, m => ({do: 'grant', who: rrWho(m), ability: m[1]})],
  [/\bcast [^.]*?from (?:your|a|their) graveyard/i, () => ({do: 'cast-from-graveyard'})],
  [/\bplay (?:lands?|cards?) from (?:your|the top of your) (?:graveyard|library)/i, () => ({do: 'play-from-graveyard'})],
  [/\bexile cards from the top of (?:your|their|target player's) library until/i, () => ({do: 'exile-until'})],
  [/\bmana of any type can be spent/i, () => ({do: 'mana-any-type'})],
  [/\bprevent (?:that damage|\d+ of that damage|all damage|the damage)/i, () => ({do: 'prevent-damage'})],
  [/\bis dealt to [^.]+ instead/i, () => ({do: 'redirect-damage'})],
  [/\btriggers an additional time/i, () => ({do: 'double-triggers'})],
  [/\bdouble (?:all damage|the power(?: and toughness)?|that creature's power)/i, () => ({do: 'double'})],
  [/\bloses all abilities/i, () => ({do: 'lose-abilities'})],
  [/\bbase power and toughness (\d+|x)\/(\d+|x)/i, m => ({do: 'set-pt', power: m[1], toughness: m[2]})],
  [/\bloses? half (?:their|his or her|your) life/i, () => ({do: 'lose-life', amount: 'half'})],
  [/\b(?:is|are) the chosen type in addition to/i, () => ({do: 'become'})],
  [/\b(?:the )?tokens? enters? tapped and attacking/i, () => ({do: 'enters-attacking'})],
  [/\bput a card exiled with ~ into its owner's graveyard/i, () => ({do: 'put'})],
  [/\bif that spell would be put into (?:your|a) graveyard, exile it instead/i, () => ({do: 'exile-instead'})],
  [
    /\badd (?:that much|x|\d+|two|three) mana (?:of any one color|in any combination of colors|of the chosen color)/i,
    m => ({do: 'add-mana', mana: m[0].slice(4)})
  ],
  [/\badd one mana of the chosen color/i, () => ({do: 'add-mana', mana: 'chosen color'})]
];
// joining words that may be left over once the effects of a sentence are found
const RR_FILLER =
  /\b(then|and|or|you|may|it|its|that|this|the|a|an|of|to|with|on|in|for|from|as|if|each|all|those|them|their|they|player|opponent|controller|owner|card|cards|instead|until|end|turn|your|target|up|one|two|three|x|ward|where|is|are|be|number|equal|plus|other|another|under|control|controls|onto|into|battlefield|graveyard|hand|library|top|bottom|any|way|order|random|reveal|revealed|creature|creatures|permanent|permanents|spell|spells|land|lands|artifact|artifacts|enchantment|enchantments|gets|get|has|have|gain|gains|at|by|so|do|does|doesn't|don't|isn't|aren't|not|this way|chosen|choice|already|also|still|rest|remaining|amount|power|toughness|mana|value|damage|life|total|count|counters?|counter|token|tokens|times|twice|first|next|last|time|only|can|can't|would|could|other|than|less|more|which|who|whose|what|while|during|after|before|step|phase|combat|upkeep|draw|beginning|precombat|postcombat|main|end|among|exiled|cast|play|additional|kind|same|whenever|when|enters|enter|attacking|tapped|untapped|nonland|noncreature|legendary|types|type|color|colors|colorless|chosen|cards'|instant|sorcery|~)\b/gi;
// any keyword ability a permanent can gain or have ("gains suspend", "have melee", "have miracle {0}")
let RR_GRANT_RE = null;
const rrGrantRe = () =>
  RR_GRANT_RE ||
  (RR_GRANT_RE = new RegExp(
    '(?<!you )\\b(?:gains?|has|have) (' + RR_KEYWORDS.map(k => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')\\b',
    'i'
  ));
// many sentences repeat across cards ("Draw a card."): each is read once and its reading copied
const RR_SEEN = new Map();
function rrSentence(s0) {
  let v = RR_SEEN.get(s0);
  if (v === undefined) {
    if (RR_SEEN.size > 100000) RR_SEEN.clear();
    v = JSON.stringify(rrSentence1(s0));
    RR_SEEN.set(s0, v);
  }
  return JSON.parse(v);
}
function rrSentence1(s0) {
  const effects = [];
  const s = s0
    .replace(
      /^(?:if (?:you|they|that player|it|he or she) (?:do|does|did|don't|doesn't|didn't)(?: not)?|when you do|otherwise|if you can't|if no [^,]+|if (?:a|an|the) [^,]{1,40} (?:is|was) [^,]+),\s*/i,
      ''
    )
    .replace(/^you may /i, '');
  // quoted text is an ability granted to something (a token's "Sacrifice this token: Add {C}."): it is not this card's own
  // effect, so only the patterns that read quotes see it; the quote is kept on the token or grant that carries it
  const masked = s.replace(/"[^"]*"/g, '"…"'),
    quotes = s.match(/"[^"]*"/g) || [];
  let rest = masked;
  const gk = rrGrantRe().exec(masked);
  if (
    gk &&
    !/(?<!you )\b(?:gains?|has|have) (?:flying|first strike|double strike|deathtouch|haste|hexproof|indestructible|lifelink|menace|reach|trample|vigilance|protection|shroud|defender|flash)\b/i.test(
      s
    )
  ) {
    effects.push({do: 'grant', keywords: [gk[1].toLowerCase()]});
    rest = rest.replace(gk[0], ' ');
  }
  for (const [re, make] of RR_EFFECTS) {
    const quoted = re.source.includes('"'),
      m = re.exec(quoted ? s : masked);
    if (!m) continue;
    const e = make(m);
    const d = rrDur(s);
    if (d && ['pump', 'grant', 'gain-control', 'goad', 'protection', 'life-total-cant-change', 'become'].includes(e.do))
      e.until = d;
    if (e.do === 'create-token' && quotes.length) e.ability = quotes[0].slice(1, -1);
    effects.push(e);
    rest = rest.replace(quoted ? m[0].replace(/"[^"]*"/g, '"…"') : m[0], ' ');
  }
  const left = rest
    .replace(RR_FILLER, ' ')
    .replace(/[^a-z]+/gi, ' ')
    .trim();
  return {effects, read: effects.length > 0 && left.split(/\s+/).filter(w => w.length > 2).length <= 3, left};
}
function rrEffects(text) {
  const out = {effects: [], unknown: []};
  String(text)
    .split(/(?<=\.)\s+(?=[A-Z~])/)
    .map(s => s.trim())
    .filter(Boolean)
    .forEach(s => {
      const r = rrSentence(s);
      out.effects.push(...r.effects);
      if (!r.read) out.unknown.push(s);
    });
  return out;
}
// ---- triggers ----
const RR_TRIGGERS = [
  [/^when you cast ~/i, 'cast-self'],
  [/\b(?:a|one or more|another) lands? (?:you control )?enters?\b/i, 'landfall'],
  [/\btokens? (?:you control )?(?:are|is)? ?created|\bcreates? (?:one or more|a) tokens?/i, 'token-created'],
  [/\b(?:one or more )?[+-]?\d?\/?[+-]?\d? ?counters? (?:are|is) put on/i, 'counters-placed'],
  [/\bleaves the battlefield\b/i, 'leaves'],
  [/\bdies\b|\bdie\b|is put into (?:a|your|an opponent's) graveyard from the battlefield/i, 'dies'],
  [/\benters\b/i, 'enters'],
  [/\battacks\b|\battack\b/i, 'attacks'],
  [/\bblocks\b|becomes blocked/i, 'blocks'],
  [/deals combat damage to (?:a player|an opponent|one or more players|you)/i, 'combat-damage-player'],
  [/\bdeals (?:combat )?damage\b|is dealt damage/i, 'damage'],
  [/\bcasts?\b/i, 'cast'],
  [/\bdraws? (?:a|your|their|one or more)/i, 'draw'],
  [/\bgains? life\b/i, 'gain-life'],
  [/\bloses? life\b/i, 'lose-life'],
  [/\bsacrifices?\b/i, 'sacrifice'],
  [/\bdiscards?\b/i, 'discard'],
  [/\bis tapped for mana\b|\btaps? an? [^,]*?for mana\b/i, 'tapped-for-mana'],
  [/\bbecomes? tapped\b/i, 'tapped'],
  [/\bbecomes? untapped\b/i, 'untapped'],
  [/\bbecomes? the target\b/i, 'targeted'],
  [/(?:put into|are put into) (?:a|your) graveyard from (?:anywhere|your library)|\bmills?\b/i, 'to-graveyard'],
  [/\bactivates?\b/i, 'activate'],
  [/\bcycles?\b|\bcycling\b/i, 'cycle'],
  [/\bscry\b|\bsurveil/i, 'scry'],
  [/\bexplores?\b/i, 'explore'],
  [/\bbecomes the monarch\b/i, 'monarch']
];
function rrTrigger(clause) {
  const c = clause.trim();
  let m;
  if (
    (m =
      /^at the beginning of (?:(your|each|the|each opponent's|each player's|that player's|the next) )?(?:(next) )?(upkeep|end step|combat on your turn|combat|draw step|precombat main phase|first main phase|second main phase|postcombat main phase|main phase|end of combat)/i.exec(
        c
      ))
  )
    return {event: 'beginning-of-' + m[3].replace(/ on your turn/, '').replace(/ /g, '-'), whose: m[1] || 'each', subject: m[3]};
  const t = RR_TRIGGERS.find(([re]) => re.test(c));
  const out = {event: t ? t[1] : 'unknown'};
  // "enters or attacks": one ability listening for two events
  const also = [
    ...new Set(
      c
        .split(/\s+or\s+/)
        .slice(1)
        .map(p => (RR_TRIGGERS.find(([re]) => re.test(p)) || [])[1])
        .filter(e => e && e !== out.event)
    )
  ];
  if (also.length) out.also = also;
  out.subject = c.replace(/^(when|whenever|at)\s+/i, '');
  if (/\ban opponent\b|\bopponents?\b/i.test(c) && /cast|draw|attack|sacrific|discard|gains?|loses?/i.test(c))
    out.controller = 'opponent';
  else if (
    /\byou control\b|\byou cast\b|\byou draw\b|\byou gain\b|\byou attack\b|\byou sacrifice\b|\byou discard\b|^whenever ~|^when ~/i.test(
      c
    )
  )
    out.controller = 'you';
  const lim = /\b(?:first|second) [^,]* each turn/i.exec(c);
  if (lim) out.limit = lim[0];
  return out;
}
// ---- one line of text ----
// a keyword at the start of a part, longest first (built once)
const rrKwRe = () =>
  rrKwRe.re ||
  (rrKwRe.re = new RegExp('^(' + RR_KEYWORDS.map(k => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')(?=$| |—)'));
function rrKeywordLine(line, types) {
  const parts = line
    .split(/,\s*|;\s*/)
    .map(s => s.trim())
    .filter(Boolean);
  const out = [];
  for (const p of parts) {
    const low = p.toLowerCase();
    let m;
    if ((m = /^(\w+)walk$/.exec(low))) {
      out.push({kind: 'keyword', name: low});
      continue;
    }
    const k = (rrKwRe().exec(low) || [])[1];
    if (!k) return null;
    const rest = p.slice(k.length).replace(/^\s*—?\s*/, '');
    const a = {kind: 'keyword', name: k};
    if (rest) {
      if (/^(\{[^}]+\})+$/.test(rest)) a.cost = [{mana: rest}];
      else if (/^\d+$|^x$/i.test(rest)) a.n = rrNum(rest);
      else if (/^pay \d+ life/i.test(rest) || /^(sacrifice|discard|exile|tap)/i.test(rest)) a.cost = rrCost(rest).cost;
      else a.what = rest;
    }
    if (k === 'equip' || k === 'reconfigure') a.timing = 'sorcery';
    out.push(a);
  }
  return out;
}
// a whole line read once per card kind (permanent, instant, sorcery) and copied after
const RR_LINES = new Map();
function rrLine(line, ctx) {
  const k = (ctx.spell ? (ctx.instant ? 'i' : 's') : 'p') + line;
  let v = RR_LINES.get(k);
  if (v === undefined) {
    if (RR_LINES.size > 100000) RR_LINES.clear();
    v = JSON.stringify(rrLine1(line, ctx));
    RR_LINES.set(k, v);
  }
  return JSON.parse(v);
}
function rrLine1(line, ctx) {
  const unknown = [];
  let L = line.trim().replace(/\.$/, m => m);
  if (!L) return {abilities: [], unknown};
  // an ability word or a flavour word heads the ability: "Landfall — Whenever ..."
  let aw = null,
    m;
  if ((m = /^([A-Z][\w' -]{1,40}?) — (?=[A-Z~])/.exec(L)) && !/^choose\b/i.test(m[1])) {
    aw = m[1].toLowerCase();
    L = L.slice(m[0].length);
  }
  // saga chapters: "I, II — effect"
  if ((m = /^((?:[IVX]+)(?:, [IVX]+)*) — (.+)$/.exec(L))) {
    const e = rrEffects(m[2]);
    return {abilities: [{kind: 'chapter', chapters: m[1].split(', '), effects: e.effects}], unknown: e.unknown};
  }
  if (/^(?:level \d+(?:[-+]\d*)?|\d+\/\d+|(?:\{[^}]+\})+ — \d+\/\d+)$/i.test(L))
    return {abilities: [{kind: 'level', text: L}], unknown};
  if (
    /^partner with [^.]+$/i.test(L) ||
    (/^(?:multikicker|kicker|entwine|buyback|flashback|madness|escape|evoke|dash|blitz|overload|prowl|replicate|spectacle|surge|emerge|bestow|disturb|foretell|plot|squad|offspring|gift [^—]+) /i.test(
      L
    ) &&
      !/\./.test(L.replace(/\.$/, '')))
  )
    return {
      abilities: [
        {kind: 'keyword', name: L.split(' ')[0].toLowerCase() === 'partner' ? 'partner' : L.split(' ')[0].toLowerCase(), what: L}
      ],
      unknown
    };
  if ((m = /^(\w+ )?(?:basic )?(\w*)cycling (\{[^}]+\})+$/i.exec(L)) || /^(daybound|nightbound|doctor's companion)$/i.test(L))
    return {abilities: [{kind: 'keyword', name: /cycling/i.test(L) ? 'cycling' : L.toLowerCase(), what: L}], unknown};
  const kw = !aw && rrKeywordLine(L, ctx.types);
  if (kw) return {abilities: kw, unknown};
  const withAw = a => (aw ? Object.assign(a, {abilityWord: aw}) : a);
  // triggered: When / Whenever / At
  if (/^(when|whenever|at)\b/i.test(L)) {
    const ev = RR_TRIGGERS.map(([re]) => re.exec(L))
      .filter(Boolean)
      .sort((a, b) => a.index - b.index)[0];
    let idx = L.indexOf(', ', ev ? ev.index : 0);
    if (idx < 0) idx = L.indexOf(', ');
    if (idx > 0) {
      const clause = L.slice(0, idx);
      let body = L.slice(idx + 2);
      const a = {kind: 'triggered', trigger: rrTrigger(clause)};
      if ((m = /^if ([^,]+), /i.exec(body))) {
        a.trigger.condition = m[1];
        body = body.slice(m[0].length);
      }
      if (/^you may\b/i.test(body)) a.optional = true;
      if (
        (m = /unless (that player|they|its controller|any player|that spell's controller|an opponent) pays? ([^.]+)/i.exec(body))
      )
        a.unless = {who: m[1], pays: m[2]};
      if (
        (m =
          /^(that player|they|its controller|each opponent|an opponent) may pay ([^.]+)\. if (?:the player|they|that player|they) (?:doesn't|don't|does not|do not),? /i.exec(
            body
          ))
      ) {
        a.unless = {who: m[1], pays: m[2]};
        body = body.slice(m[0].length);
      }
      const e = rrEffects(body.replace(/unless [^.]+?pays? [^.]+/i, '').replace(/^you may /i, ''));
      a.effects = e.effects;
      return {abilities: [withAw(a)], unknown: e.unknown};
    }
  }
  // replacement: "If ... would ..., ... instead" and "~ enters tapped / with counters"
  if (
    (m = /^if (.+?) would (.+?), (.+?) instead\b/i.exec(L)) ||
    ((m = /^if (.+?) would (.+?), (.+)$/i.exec(L)) && /instead/i.test(L))
  ) {
    const ev = m[1] + ' would ' + m[2],
      instead = m[3];
    const event = /create|created/i.test(ev)
      ? 'create-token'
      : /counters?/i.test(ev)
        ? 'put-counters'
        : /deal damage|deals damage/i.test(ev)
          ? 'deal-damage'
          : /\bdie\b/i.test(ev)
            ? 'dies'
            : /draw/i.test(ev)
              ? 'draw'
              : /put into a graveyard|put into your graveyard/i.test(ev)
                ? 'to-graveyard'
                : /enter/i.test(ev)
                  ? 'enters'
                  : /gain life/i.test(ev)
                    ? 'gain-life'
                    : /lose life/i.test(ev)
                      ? 'lose-life'
                      : 'unknown';
    const a = {kind: 'replacement', event, scope: m[1] + ' would ' + m[2], instead: {}};
    if (/twice that many|double that/i.test(instead)) a.instead.times = 2;
    else if (/triple that/i.test(instead)) a.instead.times = 3;
    else if ((m = /that many plus (\w+)/i.exec(instead))) a.instead.plus = rrNum(m[1]);
    else if ((m = /plus that many ([^.]+)/i.exec(instead))) a.instead.plus = 'that many ' + m[1];
    else if (/exile it/i.test(instead)) a.instead.exile = true;
    else a.instead.text = instead;
    return {abilities: [withAw(a)], unknown: event === 'unknown' ? [line] : []};
  }
  if ((m = /^~ enters (tapped|with ([^.]+?) counters? on it)/i.exec(L))) {
    const a = {
      kind: 'replacement',
      event: 'enters',
      scope: 'self',
      instead: m[1] === 'tapped' ? {tapped: true} : {counters: m[2]}
    };
    const rest = L.slice(m[0].length).replace(/^[.,]\s*/, '');
    const e = rest ? rrEffects(rest) : {effects: [], unknown: []};
    if (e.effects.length) a.also = e.effects;
    return {abilities: [a], unknown: e.unknown};
  }
  // activated / mana: "cost: effect" (the colon outside quotes and braces)
  const q = L.indexOf('"'),
    col = L.indexOf(': ');
  if (col > 0 && (q < 0 || col < q)) {
    const c = rrCost(L.slice(0, col));
    if (c.ok) {
      let body = L.slice(col + 2);
      const a = {cost: c.cost};
      if (/activate only as a sorcery/i.test(body)) a.timing = 'sorcery';
      if ((m = /activate only (once each turn|during your turn|during combat|if [^.]+)/i.exec(body))) a.limit = m[1];
      body = body.replace(/\s*activate only [^.]+\./gi, '').trim();
      const e = rrEffects(body);
      if (/^add\b/i.test(body) && e.effects.length && e.effects[0].do === 'add-mana') {
        a.kind = 'mana';
        a.makes = rrManaMade(e.effects[0].mana);
        a.effects = e.effects.slice(1);
      } else {
        a.kind = c.cost.some(x => x.loyalty != null) ? 'loyalty' : 'activated';
        a.effects = e.effects;
      }
      return {abilities: [withAw(a)], unknown: e.unknown};
    }
  }
  // the rest: static abilities of a permanent, or what an instant or sorcery does
  const e = rrEffects(L);
  const a = {kind: ctx.spell ? 'spell' : 'static', effects: e.effects};
  if (ctx.spell) a.timing = ctx.instant ? 'instant' : 'sorcery';
  return {abilities: e.effects.length ? [withAw(a)] : [], unknown: e.unknown};
}
function rrManaMade(s) {
  const t = String(s || '');
  const sym = t.match(/\{[WUBRGC]\}/g) || [];
  if (/any color|any one color|any type|commander's color identity|could produce/i.test(t)) {
    const n = /(two|three|x|\d+) mana of any/i.exec(t);
    return {amount: n ? rrNum(n[1]) : 1, choice: t};
  }
  if (/ or /.test(t)) return {amount: 1, choice: t};
  return {amount: sym.length || 1, colors: sym.map(x => x[1])};
}
// ---- a whole card ----
function rrFace(o, t, name, pt, m) {
  const types = rrTypes(t);
  const ctx = {
    types,
    spell: types.card.includes('instant') || types.card.includes('sorcery'),
    instant: types.card.includes('instant')
  };
  const lines = rrPrep(o, name)
    .split('\n')
    .flatMap(l => l.split(/(?<=\.)\s+(?=(?:When|Whenever|At the beginning)\b)/));
  const abilities = [],
    unknown = [];
  for (let i = 0; i < lines.length; i++) {
    let line = lines[i].trim();
    if (!line) continue;
    // modal: "Choose one —" with its bullet lines
    let mm;
    if (
      (mm =
        /^(?:([A-Z][\w' -]{1,40}?) — )?choose (one|two|three|one or both|one or more|any number|up to \w+)\b([^—]*)—\s*(.*)$/i.exec(
          line
        )) ||
      (/^choose (one|two|three|one or both|one or more|any number|up to \w+)\b/i.test(line) &&
        i + 1 < lines.length &&
        /^•/.test(lines[i + 1].trim()) &&
        (mm = /^()choose (\S+(?: or both| or more| number| to \w+)?)\b(.*)()$/i.exec(line)))
    ) {
      const modes = [];
      const first = mm[4].replace(/^•\s*/, '');
      if (first) modes.push(first);
      while (i + 1 < lines.length && /^•/.test(lines[i + 1].trim())) modes.push(lines[++i].trim().replace(/^•\s*/, ''));
      const a = {kind: ctx.spell ? 'spell' : 'modal', choose: rrNum(mm[2]) || mm[2], modes: []};
      if (/if you control a commander/i.test(mm[3])) a['choose-both-if'] = 'you control a commander';
      if (ctx.spell) a.timing = ctx.instant ? 'instant' : 'sorcery';
      modes.forEach(md => {
        const e = rrEffects(md);
        a.modes.push(e.effects);
        unknown.push(...e.unknown);
      });
      abilities.push(a);
      continue;
    }
    const r = rrLine(line, ctx);
    abilities.push(...r.abilities);
    unknown.push(...r.unknown);
    // a triggered or activated ability that ends "choose one —" takes the bullet lines below it as its modes
    const last = r.abilities[r.abilities.length - 1];
    if (last && /—\s*$/.test(line) && i + 1 < lines.length && /^•/.test(lines[i + 1].trim())) {
      const mc = /choose (one|two|three|one or both|one or more|any number|up to \w+)/i.exec(line);
      last.choose = mc ? rrNum(mc[1]) || mc[1] : 1;
      last.modes = [];
      while (i + 1 < lines.length && /^•/.test(lines[i + 1].trim())) {
        const e = rrEffects(lines[++i].trim().replace(/^•\s*/, ''));
        last.modes.push(e.effects);
        unknown.push(...e.unknown);
      }
      last.effects = (last.effects || []).filter(e => e.do !== 'choose');
      if (!last.effects.length) delete last.effects;
    }
  }
  if (ctx.spell) {
    const sp = abilities.filter(a => a.kind === 'spell' && !a.modes);
    if (sp.length > 1) {
      sp[0].effects = sp.flatMap(a => a.effects);
      for (const a of sp.slice(1)) abilities.splice(abilities.indexOf(a), 1);
    }
  }
  const face = {name, types, cost: rrManaCost(m), abilities, unknown};
  if (pt && /^\S+\/\S+$/.test(pt)) {
    const [p, tt] = pt.split('/');
    face.body = {power: isNaN(+p) ? p : +p, toughness: isNaN(+tt) ? tt : +tt};
  } else if (/^Loyalty /.test(pt || '')) face.body = {loyalty: pt.slice(8)};
  return face;
}
function rrTypes(t) {
  const [left, right] = String(t || '').split(/\s+—\s+/);
  const words = (left || '').toLowerCase().split(/\s+/).filter(Boolean);
  const SUP = ['legendary', 'basic', 'snow', 'world', 'ongoing', 'host', 'elite'];
  return {
    super: words.filter(w => SUP.includes(w)),
    card: words.filter(w => !SUP.includes(w)),
    sub: (right || '').split(/\s+/).filter(Boolean)
  };
}
function rrManaCost(m) {
  const s = String(m || '').split(' // ')[0];
  const sym = s.match(/\{[^}]+\}/g) || [];
  let mv = 0;
  const colors = new Set();
  sym.forEach(x => {
    const v = x.slice(1, -1);
    if (/^\d+$/.test(v)) mv += +v;
    else if (v === 'X') {
    } else mv += 1;
    (v.match(/[WUBRG]/g) || []).forEach(c => colors.add(c));
  });
  const out = {mana: s, mv, colors: [...colors]};
  if (sym.includes('{X}')) out.x = true;
  return out;
}
// Reads a card (both faces of a double-faced card); kept on the card while its text is unchanged.
function rrRead(c) {
  if (!c) return null;
  const key = (c.o || '') + '|' + (c.t || '');
  if (c._rr && c._rrk === key) return c._rr;
  const os = String(c.o || '').split(' // '),
    ts = String(c.t || '').split(' // '),
    ns = String(c.n || '').split(' // ');
  const faces = os.map((o, i) => rrFace(o, ts[i] || ts[0], ns[i] || ns[0], i === 0 ? c.pt : '', i === 0 ? c.m : ''));
  const sentences = faces.reduce(
    (a, f) =>
      a +
      rrPrep(os[faces.indexOf(f)], f.name)
        .split(/(?<=\.)\s+|\n/)
        .filter(s => s.trim()).length,
    0
  );
  const unknown = faces.reduce((a, f) => a + f.unknown.length, 0);
  const r = Object.assign({}, faces[0], {
    faces: faces.length > 1 ? faces : undefined,
    sentences,
    unknown: faces.flatMap(f => f.unknown),
    read: sentences ? Math.max(0, 1 - unknown / sentences) : 1
  });
  c._rr = r;
  c._rrk = key;
  return r;
}
