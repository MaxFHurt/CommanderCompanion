// Amounts read from card text (build 101): "the number of …", "for each …", "twice …", "3 plus …", "half …, rounded up".
// parseCountB101 / parseAmountB101 turn a phrase into an expression; evalAmountB101 works it out as the effect
// resolves. A phrase that is not fully understood gives null, so the card is left to the player rather than run
// with a wrong number.

const WORDS = { zero: 0, a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fifteen: 15, twenty: 20 };
const lit = s => (/^\d+$/.test(s) ? Number(s) : WORDS[s] ?? null);
const CARD_TYPES = ['creature', 'artifact', 'enchantment', 'land', 'planeswalker', 'battle', 'instant', 'sorcery', 'kindred'];
const COLORS = { white: 'W', blue: 'U', black: 'B', red: 'R', green: 'G' };
const KEYWORDS = 'flying|defender|reach|trample|haste|vigilance|deathtouch|lifelink|menace|first strike|double strike|hexproof|indestructible|flash|shadow|infect|islandwalk|horsemanship';
const IRREGULAR = { elves: 'elf', wolves: 'wolf', werewolves: 'werewolf', dwarves: 'dwarf', thieves: 'thief', mice: 'mouse', oxen: 'ox', cyclopes: 'cyclops', pegasi: 'pegasus', fungi: 'fungus', geese: 'goose', children: 'child', sheep: 'sheep', fish: 'fish', elk: 'elk', kithkin: 'kithkin', merfolk: 'merfolk', treefolk: 'treefolk', vedalken: 'vedalken', viashino: 'viashino', kor: 'kor', moonfolk: 'moonfolk', homunculi: 'homunculus', djinn: 'djinn', efreet: 'efreet', myr: 'myr', eldrazi: 'eldrazi', cyclops: 'cyclops', pegasus: 'pegasus', fungus: 'fungus', octopus: 'octopus', walrus: 'walrus', sphinx: 'sphinx', phoenix: 'phoenix', lynx: 'lynx', fox: 'fox', ox: 'ox', class: 'class', ooze: 'ooze', plains: 'plains', locus: 'locus', equipment: 'equipment', zubera: 'zubera', aurochs: 'aurochs', spacecraft: 'spacecraft', food: 'food', treasure: 'treasure', mongoose: 'mongoose', nautilus: 'nautilus', hippopotamus: 'hippopotamus', rhinoceros: 'rhinoceros', platypus: 'platypus', atlas: 'atlas', boss: 'boss', glass: 'glass', mass: 'mass', dross: 'dross', moss: 'moss', dryads: 'dryad', sliver: 'sliver' };
export function singularB101(w) {
  const s = String(w || '').toLowerCase();
  if (IRREGULAR[s]) return IRREGULAR[s];
  if (/(?:zomb|faer|pix|gen|brown|cook|valkyr|rook|sort|aer|eer|junk|new|hipp|town)ies$/.test(s)) return s.slice(0, -1);
  if (/[^aeiou]ies$/.test(s)) return `${s.slice(0, -3)}y`;
  if (/(?:x|ch|sh|ss|us|z)es$/.test(s)) return s.slice(0, -2);
  if (/(?:ss|us|is)$/.test(s)) return s;
  return s.replace(/s$/, '');
}

/** One alternative of a noun list: "goblin creatures", "artifact creatures", "equipment", "cards". */
function nounAlt(text) {
  const words = text.trim().split(/\s+/).filter(Boolean);
  const alt = { types: [], subs: [] };
  for (const raw of words) {
    const w = singularB101(raw);
    if (w === 'card' || w === 'permanent' || w === 'spell') { if (w === 'permanent') alt.permanent = true; continue; }
    if (CARD_TYPES.includes(w)) alt.types.push(w);
    else if (w === 'token') alt.token = true;
    else if (/^[a-z'-]+$/.test(w)) alt.subs.push(w);
    else return null;
  }
  if (alt.subs.length > 1) return null;   // two unknown words: not a noun we know
  return alt;
}

/**
 * "other nontoken Goblins you control", "creature cards in your graveyard", "Squirrels, Bats, Lizards, and Rats you control",
 * "untapped lands they control", "creatures you control with +1/+1 counters on them". Lower case. → { kind: 'b101-n', … } | null.
 * who: 'you' | 'opponents' | 'all' | 'ref' (the player the sentence is about: settled by the caller as playerBind).
 */
export function parseCountB101(phrase) {
  let p = String(phrase || '').toLowerCase().trim().replace(/\.$/, '').replace(/ as you (?:activate this ability|cast this spell)$/, '').replace(/\s+/g, ' ');
  if (!p) return null;
  const e = { kind: 'b101-n', who: null, zone: 'battlefield', alts: [], adj: [] };
  let m;
  // "for each creature sacrificed this way" after a cost that sacrificed them (rules.js writes "as a cost"; ops.js counts it).
  if (/^(?:the )?(?:number of )?[a-z+\-\/0-9 ]+? (?:exiled|sacrificed|removed) as a cost$/.test(p)) return { kind: 'binding', bind: 'costCount' };
  // "creatures exiled this way", "nonartifact creatures destroyed this way", "nontoken creature you controlled that was destroyed this way".
  if ((m = p.match(/^(?:(?:the )?(?:number of )?)?(.+?) (?:that (?:was|were) )?(?:exiled|destroyed|sacrificed|put into (?:a|your|their) graveyard) this way$/)) && !/\b(?:target|your opponents?|in)\b/.test(m[1].replace(/ you controlled$/, ''))) {
    let mine = false;
    const t = m[1].replace(/ you controlled$/, () => { mine = true; return ''; });
    const e2 = { kind: 'b101-this-way', mine, nontoken: false, not: [], types: [] };
    for (const w of t.split(' ')) {
      if (w === 'nontoken') e2.nontoken = true;
      else if (/^non[a-z]+$/.test(w)) e2.not.push(w.slice(3));
      else if (w === 'cards' || w === 'card') e2.card = true;
      else if (['permanent', 'permanents'].includes(w)) continue;
      else if (CARD_TYPES.includes(singularB101(w))) e2.types.push(singularB101(w));
      else return null;
    }
    if (e2.card && !e2.types.length) return null;   // "cards exiled this way": from a graveyard or a cost, not counted here
    return e2;
  }
  // Batch 3: what is among a group, own cards across zones, highest values.
  if ((m = p.match(/^creature types? among (?:non-([a-z]+) )?creatures you control$/))) return { kind: 'b101-types-among', not: m[1] || null };
  if (/^card types? among spells you'?ve cast this turn$/.test(p)) return { kind: 'b101-spell-types' };
  if (/^colors? among permanents you control and spells you'?ve cast this turn$/.test(p)) return { kind: 'b101-colors-among', of: parseCountB101('permanents you control'), spells: true };
  if ((m = p.match(/^colors? among (other [a-z]+s you control)$/))) { const of = parseCountB101(m[1]); return of && of.kind === 'b101-n' ? { kind: 'b101-colors-among', of } : null; }
  if ((m = p.match(/^(different kinds? of )?counters? among (.+)$/))) { const of = parseCountB101(m[2]); return of && of.kind === 'b101-n' ? { kind: 'b101-counters-among', of, distinct: !!m[1] } : null; }
  if ((m = p.match(/^abilities from among ([a-z, ]+?) found among creatures you control$/))) return { kind: 'b101-abilities-among', list: m[1].split(/,\s*(?:and\s+)?|\s+and\s+/).map(x => x.trim()).filter(Boolean) };
  if (/^instant and sorcery cards you own in exile and in your graveyard$/.test(p)) return { kind: 'b101-own-spells', zones: ['exile', 'graveyard'], adventure: false };
  if (/^cards you own in exile and in your graveyard that are instant cards, are sorcery cards, and\/or have an adventure$/.test(p)) return { kind: 'b101-own-spells', zones: ['exile', 'graveyard'], adventure: true };
  if (/^cards in your graveyard that are instant cards, sorcery cards, and\/or have an adventure$/.test(p)) return { kind: 'b101-own-spells', zones: ['graveyard'], adventure: true };
  if (/^amount of mana spent to cast (?:this spell|it)$/.test(p)) return { kind: 'b101-mana-spent' };
  if (/^(?:the )?greatest mana value among your commanders$/.test(p)) return { kind: 'b101-commander-mv' };
  // Things that are not cards.
  if (/^opponents? you have$/.test(p)) return { kind: 'opponents' };
  if (/^players?(?: in the game)?$/.test(p)) return { kind: 'b101-players' };
  if ((m = p.match(/^(experience|energy|poison|rad|ticket) counters? you have$/))) return { kind: 'b101-player-counter', counter: m[1] };
  if (/^(?:other )?spells? you'?ve cast this turn$/.test(p)) return /^other/.test(p) ? { kind: 'b101-math', op: 'minus', a: { kind: 'spells-cast-this-turn' }, b: 1 } : { kind: 'spells-cast-this-turn' };
  if ((m = p.match(/^(other )?(instant and sorcery|instant|sorcery|creature|noncreature|artifact|enchantment) spells? you'?ve cast this turn$/)) && m[2] !== 'noncreature') {
    const x = { kind: 'spells-cast-this-turn', types: m[2] === 'instant and sorcery' ? ['Instant', 'Sorcery'] : [m[2].charAt(0).toUpperCase() + m[2].slice(1)] };
    return m[1] ? { kind: 'b101-math', op: 'minus', a: x, b: 1 } : x;
  }
  if (/^creatures? that died this turn$/.test(p)) return { kind: 'died-this-turn' };
  // This turn's tally (triggers.js tallyTurn).
  if ((m = p.match(/^(nontoken )?([a-z]+?)s? that died (under your control )?this turn$/)) && m[2] !== 'permanent') return { kind: 'b101-tally', what: 'died', nontoken: !!m[1], sub: m[2] === 'creature' ? null : singularB101(m[2]), mine: !!m[3] };
  if ((m = p.match(/^(nontoken )?creatures? (?:cards? )?put into your graveyard from the battlefield this turn$/))) return { kind: 'b101-tally', what: 'died', nontoken: !!m[1], sub: null, owned: true };
  if (/^cards? you'?ve drawn this turn$/.test(p)) return { kind: 'b101-tally', what: 'draws' };
  if (/^cards? you'?ve discarded this turn$/.test(p)) return { kind: 'b101-tally', what: 'discards' };
  if (/^tokens? you(?:'ve)? created this turn$/.test(p)) return { kind: 'b101-tally', what: 'tokens' };
  if (/^creatures? in your party$/.test(p)) return { kind: 'b101-party' };
  if (/^creatures? they control of the chosen type$/.test(p)) return { kind: 'b101-chosen-type', filter: 'creature', who: 'ref' };   // Pact of the Serpent
  if (/^\+1\/\+1 counters? you'?ve put on creatures under your control this turn$/.test(p)) return { kind: 'b101-tally', what: 'countersOnMine' };
  // Build 102, more of this turn's tally and one-off counts.
  if ((m = p.match(/^(other )?(nontoken )?([a-z]+?)s?(?: and\/or ([a-z]+?)s?)? that entered (?:the battlefield )?under your control this turn$/)) || (m = p.match(/^(other )?(nontoken )?([a-z]+?)s?(?: and\/or ([a-z]+?)s?)? you had enter (?:the battlefield )?under your control this turn$/)))
    return { kind: 'b101-tally', what: 'entered', other: !!m[1], nontoken: !!m[2], subs: [m[3], m[4]].filter(Boolean).map(singularB101) };
  if (/^(?:opponents|players) you attacked this (?:turn|combat)$/.test(p)) return { kind: 'b101-tally', what: 'attacked' };
  if (/^players? being attacked$/.test(p)) return { kind: 'b101-attacked-now' };
  if (/^permanents? you'?ve sacrificed this turn$/.test(p)) return { kind: 'b101-tally', what: 'sacrificed' };
  if ((m = p.match(/^(?:other )?spells? you'?ve cast this turn other than the first$/))) return { kind: 'b101-math', op: 'minus', a: { kind: 'spells-cast-this-turn' }, b: 1 };
  if (/^times? you'?ve cast (?:a|your) commanders? from the command zone this game$/.test(p)) return { kind: 'b101-commander-casts' };
  if ((m = p.match(/^colors? (?:that spell is|of that spell)$/)) || /^of that spell'?s colors$/.test(p)) return { kind: 'b101-event-spell-colors' };
  if ((m = p.match(/^cards? in all graveyards with the same name as (?:that|the) spell$/))) return { kind: 'b101-same-name-graveyards' };
  if ((m = p.match(/^graveyards? with (\w+) or more cards in (?:it|them)$/)) && lit(m[1]) != null) return { kind: 'b101-big-graveyards', min: lit(m[1]) };
  if ((m = p.match(/^(?:your )?opponents? with (\w+) or more cards in hand$/)) && lit(m[1]) != null) return { kind: 'b101-opponents-hand', min: lit(m[1]) };
  if ((m = p.match(/^opponents? who controls? fewer (creatures|lands|artifacts) than you$/))) return { kind: 'b101-opponents-more', type: singularB101(m[1]), fewer: true };
  if ((m = p.match(/^card types? among cards in all graveyards$/))) return { kind: 'b101-grave-types', all: true };
  if ((m = p.match(/^card types? among (other )?(nonland )?permanents you control$/))) return { kind: 'b101-types-among-permanents', other: !!m[1], nonland: !!m[2] };
  if ((m = p.match(/^different (mana values?|powers?) among (nonland cards in your graveyard|nonland permanents you control|creatures you control|permanents you control)$/))) return { kind: 'b101-distinct', stat: /power/.test(m[1]) ? 'power' : 'mv', where: m[2] };
  if (/^cards? with a cycling ability in your graveyard$/.test(p)) return { kind: 'b101-n', who: 'you', zone: 'graveyard', alts: [{ types: [], subs: [] }], adj: [], oracle: 'cycling' };
  if ((m = p.match(/^permanents you control that are ([a-z]+)s(?: and\/or| or) ([a-z]+)s$/))) return parseCountB101(`${m[1]}s and/or ${m[2]}s you control`);
  if ((m = p.match(/^(auras?|equipment|auras? and equipment) attached to (?:it|this creature|[a-z' ,-]+)$/))) return { kind: 'b101-attached', auras: /aura/.test(m[1]), equipment: /equipment/.test(m[1]) };
  if (/^counters? on that creature$/.test(p)) return { kind: 'b101-source-counters', counter: '*', it: true, that: true };
  if (/^times? (?:it|this creature) has mutated$/.test(p)) return { kind: 'b101-mutations' };
  if ((m = p.match(/^creatures? blocking it( beyond the first)?$/))) return m[1] ? { kind: 'b101-math', op: 'minus', a: { kind: 'b101-blockers' }, b: 1 } : { kind: 'b101-blockers' };
  if ((m = p.match(/^(white|blue|black|red|green) mana symbols? in the mana costs of permanents you control$/))) return { kind: 'devotion', color: COLORS[m[1]] };
  if ((m = p.match(/^opponents? who controls? more (creatures|lands|artifacts) than you$/))) return { kind: 'b101-opponents-more', type: singularB101(m[1]) };
  if (/^colors? of mana spent to cast (?:this spell|it|this creature|this permanent)$/.test(p)) return { kind: 'b101-colors-spent' };
  if (/^times? (?!you\b|that\b)[a-z' ,-]+ was kicked$/.test(p)) return { kind: 'b101-kicked' };
  if (/^basic land types? among lands you control$/.test(p)) return { kind: 'b101-domain' };
  if ((m = p.match(/^basic land types? among lands (they|that player|target player|target opponent) controls?$/))) return { kind: 'b101-domain', ref: true };
  if (/^colors? among permanents you control$/.test(p)) return { kind: 'b101-colors' };
  if (/^card types? among cards in your graveyard$/.test(p)) return { kind: 'b101-grave-types' };
  if ((m = p.match(/^(?:([+-]\d+\/[+-]\d+|[a-z]+) )?counters? on it$/))) return { kind: 'b101-source-counters', counter: m[1] || '*', it: true };
  if ((m = p.match(/^(?:([+-]\d+\/[+-]\d+|[a-z]+) )?counters? on (this [a-z]+|[a-z' ,-]+)$/)) && !/^(?:it|each|all|target|that|those|enchanted|equipped|creatures?|permanents?|lands?|artifacts?)\b/.test(m[2]) && !/ you control| among | and |\bcontrols?\b/.test(m[2]))
    return { kind: 'b101-source-counters', counter: m[1] || '*' };
  if ((m = p.match(/^(?:cards?|(creature|land|instant|sorcery|artifact|enchantment|nonland|permanent) cards?) in (your|their|that player'?s|target player'?s|target opponent'?s) hand$/)) && !m[1]) return /^your$/.test(m[2]) ? { kind: 'count', zone: 'hand', filter: 'card' } : { kind: 'b101-n', who: 'ref', zone: 'hand', alts: [{ types: [], subs: [] }], adj: [] };

  // Where the cards are and whose they are.
  const take = (re, fn) => { const x = p.match(re); if (!x) return false; p = (p.slice(0, x.index) + ' ' + p.slice(x.index + x[0].length)).replace(/\s+/g, ' ').trim(); fn(x); return true; };
  take(/ other than (?:this [a-z]+|it)$/, () => { e.other = true; });   // "Mounts you control other than this Vehicle"
  take(/ you own that (?:your opponents|an opponent) controls?\b/, () => { e.who = 'opponents'; e.owner = 'you'; })
    || take(/ you control\b/, () => { e.who = 'you'; })
    || take(/ (?:your opponents control|an opponent controls|you don'?t control)\b/, () => { e.who = 'opponents'; })
    || take(/ (?:that creature'?s|that permanent'?s) controller controls?\b/, () => { e.who = 'targetController'; })
    || take(/ (?:its controller|that creature'?s controller|its owner) controls?\b/, () => { e.who = 'unknown'; })   // whose: left to the player
    || take(/ (?:they|that player|target player|target opponent|defending player|that opponent) controls?\b/, x => { e.who = 'ref'; if (/defending/.test(x[0])) e.playerBind = 'defendingPlayer'; })
    || take(/ on the battlefield\b/, () => { e.who = 'all'; })
    || take(/ in your (graveyard|hand|library)\b/, x => { e.who = 'you'; e.zone = x[1]; })
    || take(/ (?:you own )?in exile\b/, () => { e.who = 'you'; e.zone = 'exile'; })
    || take(/ in (?:their|that player'?s|target player'?s|target opponent'?s|defending player'?s) (graveyard|hand|library)\b/, x => { e.who = 'ref'; e.zone = x[1]; if (/defending/.test(x[0])) e.playerBind = 'defendingPlayer'; })
    || take(/ in all graveyards\b/, () => { e.who = 'all'; e.zone = 'graveyard'; })
    || take(/ in your opponents'? graveyards\b/, () => { e.who = 'opponents'; e.zone = 'graveyard'; });
  // Qualities after the noun.
  take(new RegExp(` with (${KEYWORDS})\\b`), x => { e.keyword = x[1]; });
  take(/ with power (\d+) or (greater|less)\b/, x => { e.power = [x[2] === 'greater' ? '>=' : '<=', Number(x[1])]; });
  take(/ with toughness (\d+) or (greater|less)\b/, x => { e.toughness = [x[2] === 'greater' ? '>=' : '<=', Number(x[1])]; });
  take(/ with mana value (\d+) or (greater|less)\b/, x => { e.mv = [x[2] === 'greater' ? '>=' : '<=', Number(x[1])]; });
  take(/ with (?:an? |one or more )?([+-]\d+\/[+-]\d+|[a-z]+) counters? on (?:it|them)\b/, x => { e.counter = x[1]; });
  take(/ with (?:one or more )?counters on (?:it|them)\b/, () => { e.counter = '*'; });
  take(/ that(?:'s| is| are) attached to a creature\b/, () => { e.attachedToCreature = true; });
  take(/ attached to (?:it|this creature)\b/, () => { e.attachedToSource = true; });
  take(/ named ([a-z' ,-]+)$/, x => { e.name = x[1].trim(); });
  if (e.who === 'unknown') return null;
  if (e.who == null) {
    // No owner said: only the groups that mean the same for everyone.
    if (/\b(?:attacking|blocking)\b/.test(p)) e.who = 'all';
    else return null;
  }
  // Words before the noun.
  for (;;) {
    if (take(/^other /, () => { e.other = true; })) continue;
    if (take(/^(tapped|untapped|attacking|blocking|nontoken|basic|nonbasic|legendary|nonlegendary|snow|modified|enchanted|equipped|colorless|multicolored|monocolored)\b ?/, x => { e.adj.push(x[1]); })) continue;
    if (take(/^(white|blue|black|red|green)(?: and\/or (white|blue|black|red|green))?\b ?/, x => { e.colors = [COLORS[x[1]], ...(x[2] ? [COLORS[x[2]]] : [])]; })) continue;
    if (take(/^non-?([a-z]+)\b ?/, x => { (e.not = e.not || []).push(singularB101(x[1])); })) continue;
    break;
  }
  if (e.zone !== 'battlefield' && e.adj.some(a => ['tapped', 'untapped', 'attacking', 'blocking', 'modified', 'enchanted', 'equipped'].includes(a))) return null;
  if (!p) return null;
  for (const part of p.split(/,? and\/or |,? and |,? or |, /)) {
    const alt = nounAlt(part);
    if (!alt) return null;
    e.alts.push(alt);
  }
  // "cards" alone needs a zone that holds cards; a bare subtype on the battlefield is fine.
  if (e.zone === 'battlefield' && e.alts.some(a => !a.types.length && !a.subs.length && !a.permanent && !a.token)) return null;
  return e;
}

/**
 * A whole amount: "the number of …", "twice the number of …", "3 plus the number of …", "half the number of …, rounded up",
 * "the number of … plus the number of …", "the number of cards in your hand minus 4", "your life total".
 */
export function parseAmountB101(phrase) {
  const p = String(phrase || '').toLowerCase().trim().replace(/\.$/, '').replace(/\s+/g, ' ');
  let m;
  if (lit(p) != null) return lit(p);
  // What an activation cost exiled, sacrificed or removed (rules.js writes "this way" as "as a cost"; ops.js counts it).
  if (/^(?:the )?(?:total )?number of [a-z+\-\/0-9 ]+? (?:exiled|sacrificed|removed) as a cost$/.test(p)) return { kind: 'binding', bind: 'costCount' };
  if ((m = p.match(/^(twice|two times|three times|four times|five times|ten times) (.+)$/))) { const a = parseAmountB101(m[2]); return a == null ? null : { kind: 'b101-math', op: 'times', a, b: { twice: 2, 'two times': 2, 'three times': 3, 'four times': 4, 'five times': 5, 'ten times': 10 }[m[1]] }; }
  if ((m = p.match(/^(\d+) times (.+)$/))) { const a = parseAmountB101(m[2]); return a == null ? null : { kind: 'b101-math', op: 'times', a, b: Number(m[1]) }; }
  if (/^(?:that spell'?s|its) mana value$/.test(p)) return { kind: 'binding', bind: 'eventManaValue' };
  // What an activation cost discarded or sacrificed (ops.js remembers it before the card leaves).
  if (/^the (?:discarded|exiled) card'?s mana value$/.test(p)) return { kind: 'binding', bind: 'costManaValue' };
  if ((m = p.match(/^the number of (white|blue|black|red|green) mana symbols? in the sacrificed (?:creature|permanent|artifact)'?s mana cost$/))) return { kind: 'b101-cost-symbols', color: COLORS[m[1]] };
  if ((m = p.match(/^(\d+) or (the greatest .+?),? whichever is greater$/))) { const b = parseAmountB101(m[2]); return b == null ? null : { kind: 'b101-math', op: 'max', a: Number(m[1]), b }; }   // Triumphant Chomp
  if ((m = p.match(/^(the number of .+?) in excess of (the number of .+)$/))) { const a = parseAmountB101(m[1]), b = parseAmountB101(m[2]); return a == null || b == null ? null : { kind: 'b101-math', op: 'minus', a, b }; }   // Superior Numbers
  if (/^the amount of damage dealt to (?:it|this creature) this turn$/.test(p)) return { kind: 'binding', bind: 'eventDamage' };   // Tangled Colony (its last damage as it died)
  if (/^the damage already dealt to (?:it|this creature) this turn$/.test(p)) return { kind: 'b101-source-damage' };   // Whipkeeper
  if ((m = p.match(/^the number of times you descended this turn$/))) return { kind: 'b101-tally', what: 'descended' };
  if ((m = p.match(/^the number of creatures that were exiled under your opponents'? control this turn$/))) return { kind: 'b101-tally', what: 'exiledOpp' };
  if (/^the number of creatures it'?s blocking$/.test(p)) return { kind: 'b101-blocking' };
  if ((m = p.match(/^half (.+?),? rounded (up|down)$/))) { const a = parseAmountB101(m[1]); return a == null ? null : { kind: 'b101-math', op: 'half', a, round: m[2] }; }
  if ((m = p.match(/^(\d+|one|two|three|four|five|six|seven|eight|nine|ten) plus (.+)$/))) { const a = parseAmountB101(m[2]); return a == null ? null : { kind: 'b101-math', op: 'plus', a, b: lit(m[1]) }; }
  if ((m = p.match(/^(.+?) plus (\d+|one|two|three|four|five|six|seven|eight|nine|ten)$/))) { const a = parseAmountB101(m[1]); return a == null ? null : { kind: 'b101-math', op: 'plus', a, b: lit(m[2]) }; }
  if ((m = p.match(/^(.+?) minus (\d+|one|two|three|four|five|six|seven|eight|nine|ten)$/))) { const a = parseAmountB101(m[1]); return a == null ? null : { kind: 'b101-math', op: 'minus', a, b: lit(m[2]) }; }
  if ((m = p.match(/^(the number of .+?) (plus|minus) (the number of .+)$/))) { const a = parseAmountB101(m[1]), b = parseAmountB101(m[3]); return a == null || b == null ? null : { kind: 'b101-math', op: m[2], a, b }; }
  if ((m = p.match(/^the (?:total )?number of (.+)$/))) return parseCountB101(m[1]);
  if (/^the highest life total among (all players|your opponents)$/.test(p)) return { kind: 'b101-life-high', opponents: /opponents/.test(p) };
  if ((m = p.match(/^(?:the )?(?:greatest )?(amount of mana spent to cast (?:this spell|it)|mana value among your commanders)$/))) return parseCountB101(m[1].replace(/^mana value/, 'greatest mana value'));
  if (/^your life total$/.test(p)) return { kind: 'life-total' };
  if (/^(?:their|that player'?s|target player'?s|target opponent'?s) life total$/.test(p)) return { kind: 'life-total', playerBind: '__ref' };
  if (/^the number of cards in your hand$/.test(p)) return { kind: 'count', zone: 'hand', filter: 'card' };
  if ((m = p.match(/^the greatest (power|toughness|mana value) among (.+)$/))) { const c = parseCountB101(m[2]); return c && c.kind === 'b101-n' ? { ...c, greatest: m[1] } : null; }
  return null;
}

/** "… that creature's controller controls": the controller of the creature the instruction targets. */
export function bindTargetControllerB101(expr, bind) {
  if (!expr || typeof expr !== 'object') return expr;
  if (expr.who === 'targetController') expr.controllerBind = bind;
  for (const k of ['a', 'b', 'of']) if (expr[k] && typeof expr[k] === 'object') bindTargetControllerB101(expr[k], bind);
  return expr;
}
/** Give the "the player the sentence is about" parts of an amount their binding (a target player, or the trigger's player). */
export function bindAmountPlayerB101(expr, bind) {
  if (!expr || typeof expr !== 'object') return expr;
  if (((expr.kind === 'b101-n' || expr.kind === 'b101-chosen-type') && expr.who === 'ref' && !expr.playerBind) || (expr.kind === 'b101-domain' && expr.ref && !expr.playerBind) || expr.playerBind === '__ref') expr.playerBind = bind;
  for (const k of ['a', 'b', 'of']) if (expr[k] && typeof expr[k] === 'object') bindAmountPlayerB101(expr[k], bind);
  return expr;
}
export const amountNeedsPlayerB101 = expr => !!expr && typeof expr === 'object' && (((expr.kind === 'b101-n' || expr.kind === 'b101-chosen-type') && expr.who === 'ref' && !expr.playerBind) || (expr.kind === 'b101-domain' && expr.ref && !expr.playerBind) || expr.playerBind === '__ref' || ['a', 'b', 'of'].some(k => amountNeedsPlayerB101(expr[k])));

const SUBTYPE_OF = d => String(d?.typeLine || '').toLowerCase().split('—')[1] || '';
function matchesB101(game, card, e, bindings, H) {
  const d = H.definitionFor(game, card), line = String(d?.typeLine || '').toLowerCase(), front = line.split('—')[0], subs = SUBTYPE_OF(d);
  const changeling = /\bcreature\b|\bkindred\b/.test(front) && /changeling/i.test(String(d?.oracleText || ''));
  const hasSub = s => new RegExp(`\\b${s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(subs) || changeling;
  const okAlt = a => a.types.every(t => new RegExp(`\\b${t}\\b`).test(front)) && a.subs.every(hasSub) && (!a.permanent || !/\b(?:instant|sorcery)\b/.test(front)) && (!a.token || !!card.token);
  if (!e.alts.some(okAlt)) return false;
  if (e.other && card.instanceId === bindings.sourceId) return false;
  if (e.not && e.not.some(n => new RegExp(`\\b${n}\\b`).test(front) || (new RegExp(`\\b${n}\\b`).test(subs)) || (changeling && !CARD_TYPES.includes(n) && n !== 'token'))) return false;
  if (e.not && e.not.includes('token') && card.token) return false;
  const colors = d?.colors || [];
  if (e.colors && !e.colors.some(c => colors.includes(c))) return false;
  if (e.name && String(d?.name || '').toLowerCase() !== e.name) return false;
  for (const a of e.adj) {
    if (a === 'tapped' && !card.tapped) return false;
    if (a === 'untapped' && card.tapped) return false;
    if (a === 'nontoken' && card.token) return false;
    if (a === 'basic' && !/\bbasic\b/.test(front)) return false;
    if (a === 'nonbasic' && /\bbasic\b/.test(front)) return false;
    if (a === 'legendary' && !/\blegendary\b/.test(front)) return false;
    if (a === 'nonlegendary' && /\blegendary\b/.test(front)) return false;
    if (a === 'snow' && !/\bsnow\b/.test(front)) return false;
    if (a === 'colorless' && colors.length) return false;
    if (a === 'multicolored' && colors.length < 2) return false;
    if (a === 'monocolored' && colors.length !== 1) return false;
    if (a === 'attacking' && !(game.combatState?.attackers || []).some(x => x.instanceId === card.instanceId)) return false;
    if (a === 'blocking' && !Object.values(game.combatState?.blocks || {}).some(b => (b?.assignments || []).some(x => x.blockerId === card.instanceId))) return false;
    if (a === 'modified' || a === 'enchanted' || a === 'equipped') {
      const attached = (game.players || []).flatMap(q => (q.deck?.battlefield || []).filter(x => x.attachedTo === card.instanceId).map(x => ({ x, q })));
      const isAura = y => /\baura\b/i.test(H.definitionFor(game, y.x)?.typeLine || ''), isEquip = y => /\bequipment\b/i.test(H.definitionFor(game, y.x)?.typeLine || '');
      const counters = Object.values(card.counters || {}).some(n => Number(n) > 0);
      const mine = y => (y.x.controllerId || y.q.playerId) === (card.controllerId || card.ownerId);
      if (a === 'enchanted' && !attached.some(isAura)) return false;
      if (a === 'equipped' && !attached.some(isEquip)) return false;
      if (a === 'modified' && !(counters || attached.some(isEquip) || attached.some(y => isAura(y) && mine(y)))) return false;
    }
  }
  if (e.keyword && !H.hasKeyword(card, d, e.keyword, game)) return false;
  if (e.oracle && !new RegExp(`(?:^|\\n)\\s*${e.oracle}\\b`, 'i').test(String(d?.oracleText || ''))) return false;
  if (e.counter && !(e.counter === '*' ? Object.values(card.counters || {}).some(n => Number(n) > 0) : Number(card.counters?.[e.counter] || 0) > 0)) return false;
  const cmp = (v, [op, n]) => (op === '>=' ? v >= n : v <= n);
  if (e.power && !cmp(Number(H.effectivePower(card, d, game) || 0), e.power)) return false;
  if (e.toughness && !cmp(Number(H.effectiveToughness(card, d, game) || 0), e.toughness)) return false;
  if (e.mv && !cmp(Number(d?.manaValue ?? d?.cmc ?? 0), e.mv)) return false;
  if (e.attachedToCreature) { const host = card.attachedTo && H.locateCardInGame(game, card.attachedTo); if (!host || !/\bcreature\b/i.test(H.definitionFor(game, host.card)?.typeLine || '')) return false; }
  if (e.attachedToSource && card.attachedTo !== (bindings.eventCard || bindings.sourceId) && card.attachedTo !== bindings.sourceId) return false;
  return true;
}

/** The cards a "b101-n" expression counts (whose, where, which kind). */
export function listCardsB101(game, controllerId, expr, bindings, H) {
  const alive = (game.players || []).filter(p => !p.eliminated);
  const ref = alive.find(p => p.playerId === (bindings[expr.playerBind] || bindings.eventPlayer)) || null;
  const tc = expr.who === 'targetController' ? (H.locateCardInGame(game, bindings[expr.controllerBind])?.card?.controllerId || H.locateCardInGame(game, bindings[expr.controllerBind])?.player?.playerId) : null;
  const who = expr.who === 'targetController' ? alive.filter(p => p.playerId === tc) : expr.who === 'you' ? alive.filter(p => p.playerId === controllerId) : expr.who === 'opponents' ? alive.filter(p => p.playerId !== controllerId) : expr.who === 'ref' ? [ref].filter(Boolean) : alive;
  const zoneOf = p => (expr.zone === 'library' ? p.deck.remainingLibrary : p.deck[expr.zone]) || [];
  return who.flatMap(p => zoneOf(p).filter(c => matchesB101(game, c, expr, bindings, H) && (expr.owner !== 'you' || (c.ownerId || p.playerId) === controllerId)));
}

/** Works out an expression made here. Returns undefined for a kind it does not know. */
export function evalAmountB101(game, controllerId, expr, bindings, H) {
  const alive = (game.players || []).filter(p => !p.eliminated);
  const refPlayer = () => alive.find(p => p.playerId === (bindings[expr.playerBind] || bindings.eventPlayer)) || null;
  switch (expr.kind) {
    case 'b101-n': {
      const cards = listCardsB101(game, controllerId, expr, bindings, H);
      if (!expr.greatest) return cards.length;
      const stat = c => { const d = H.definitionFor(game, c); return expr.greatest === 'power' ? Number(H.effectivePower(c, d, game) || 0) : expr.greatest === 'toughness' ? Number(H.effectiveToughness(c, d, game) || 0) : Number(d?.manaValue ?? d?.cmc ?? 0); };
      return cards.reduce((n, c) => Math.max(n, stat(c)), 0);
    }
    case 'b101-types-among': {
      const mine = (alive.find(p => p.playerId === controllerId)?.deck?.battlefield || []).filter(c => { const d = H.definitionFor(game, c); return /\bcreature\b/i.test(d?.typeLine || '') && (!expr.not || !new RegExp(`\\b${expr.not}\\b`).test(SUBTYPE_OF(d))); });
      return new Set(mine.flatMap(c => SUBTYPE_OF(H.definitionFor(game, c)).split(/\s+/).filter(Boolean))).size;
    }
    case 'b101-spell-types': {
      const seen = new Set();
      for (const x of alive.find(p => p.playerId === controllerId)?.counters?.castThisTurn || []) for (const t of ['Artifact', 'Battle', 'Creature', 'Enchantment', 'Instant', 'Kindred', 'Land', 'Planeswalker', 'Sorcery']) if (new RegExp(`\\b${t}\\b`).test(String(x.typeLine || '').split('—')[0])) seen.add(t);
      return seen.size;
    }
    case 'b101-colors-among': {
      const seen = new Set();
      for (const c of listCardsB101(game, controllerId, expr.of, bindings, H)) for (const k of H.definitionFor(game, c)?.colors || []) seen.add(k);
      if (expr.spells) for (const x of alive.find(p => p.playerId === controllerId)?.counters?.castThisTurn || []) for (const k of x.colors || []) seen.add(k);
      return seen.size;
    }
    case 'b101-counters-among': {
      const cards = listCardsB101(game, controllerId, expr.of, bindings, H);
      if (expr.distinct) return new Set(cards.flatMap(c => Object.entries(c.counters || {}).filter(([, v]) => Number(v) > 0).map(([k]) => k))).size;
      return cards.reduce((n, c) => n + Object.values(c.counters || {}).reduce((a, v) => a + Math.max(0, Number(v) || 0), 0), 0);
    }
    case 'b101-abilities-among': {
      const mine = (alive.find(p => p.playerId === controllerId)?.deck?.battlefield || []).filter(c => /\bcreature\b/i.test(H.definitionFor(game, c)?.typeLine || ''));
      return expr.list.filter(k => mine.some(c => H.hasKeyword(c, H.definitionFor(game, c), k, game))).length;
    }
    case 'b101-own-spells': {
      const me = alive.find(p => p.playerId === controllerId);
      const rows = expr.zones.flatMap(z => (me?.deck?.[z] || []));
      return rows.filter(c => { const d = H.definitionFor(game, c); return /\b(?:instant|sorcery)\b/i.test(String(d?.typeLine || '').split('—')[0]) || (expr.adventure && (d?.layout === 'adventure' || /\bAdventure\b/.test(d?.typeLine || ''))); }).filter(c => !c.token).length;
    }
    case 'b101-life-high': return Math.max(0, ...alive.filter(p => !expr.opponents || p.playerId !== controllerId).map(p => Number(p.life || 0)));
    case 'b101-commander-mv': return Math.max(0, ...((alive.find(p => p.playerId === controllerId)?.commanders || []).map(c => { const d = H.definitionFor(game, { definitionId: c.cardId || c.definitionId }); return Number(d?.manaValue ?? d?.cmc ?? 0); })));
    case 'b101-cost-symbols': return Math.max(0, Number((bindings.sacrificedSymbols || {})[expr.color] || 0));
    case 'b101-mana-spent': {
      const hit = H.locateCardInGame(game, bindings.sourceId), onStack = (game.stack || []).find(x => x.card?.instanceId === bindings.sourceId || x.id === bindings.sourceId);
      return Number(onStack?.manaSpentCount ?? hit?.card?.manaSpentCount ?? 0) || 0;
    }
    case 'b101-loyalty': { const hit = H.locateCardInGame(game, bindings[expr.bind] || bindings.sourceId); return Math.max(0, Number(hit?.card?.counters?.loyalty || 0)); }
    case 'b101-source-damage': { const hit = H.locateCardInGame(game, bindings.sourceId); return Math.max(0, Number(hit?.card?.damageMarked || 0)); }
    case 'b101-blocking': {
      const id = bindings.sourceId;
      return Object.values(game.combatState?.blocks || {}).reduce((n, b) => n + (b?.assignments || []).filter(x => x.blockerId === id).length, 0);
    }
    case 'b101-this-way': {
      const rows = bindings.movedThisWayCards || [];
      return rows.filter(r => { const front = String(r.typeLine || '').split('—')[0].toLowerCase(); return (!expr.mine || r.controllerId === controllerId) && (!expr.nontoken || !r.token) && (!expr.card || !r.token) && expr.types.every(t => new RegExp(`\\b${t}\\b`).test(front)) && expr.not.every(n => !new RegExp(`\\b${n}\\b`).test(front)); }).length;
    }
    case 'b101-math': {
      const v = x => (typeof x === 'number' ? x : Number(H.resolveAmount(game, controllerId, x, bindings)) || 0);
      const a = v(expr.a), b = expr.b == null ? 0 : v(expr.b);
      return Math.max(0, expr.op === 'max' ? Math.max(a, b) : expr.op === 'times' ? a * b : expr.op === 'plus' ? a + b : expr.op === 'minus' ? a - b : expr.round === 'up' ? Math.ceil(a / 2) : Math.floor(a / 2));
    }
    case 'b101-tally': {
      const t = game.turnTally?.turn === Number(game.turnNumber || 0) ? game.turnTally : null;
      if (!t) return 0;
      if (expr.what === 'entered') return (t.entered || []).filter(e => e.controllerId === controllerId && (!expr.other || e.id !== (bindings.eventCard || bindings.sourceId)) && (!expr.nontoken || !e.token) && expr.subs.some(x => x === 'creature' ? /\bCreature\b/i.test(e.typeLine) : new RegExp(`\\b${x}\\b`, 'i').test(e.typeLine))).length;
      if (expr.what === 'descended') return Number(t.descended?.[controllerId] || 0);
      if (expr.what === 'exiledOpp') return (t.exiled || []).filter(x => x.controllerId !== controllerId && /\bCreature\b/i.test(x.typeLine)).length;
      if (expr.what === 'countersOnMine') return Number(t.countersOnMine?.[controllerId] || 0);
      if (expr.what === 'attacked') return (t.attacked?.[controllerId] || []).length;
      if (expr.what !== 'died') return Number(t[expr.what]?.[controllerId] || 0);
      return t.died.filter(d => (expr.sub ? new RegExp(`\\b${expr.sub}\\b`, 'i').test(d.typeLine.split('—')[1] || '') : /\bCreature\b/i.test(d.typeLine)) && (!expr.nontoken || !d.token) && (!expr.mine || d.controllerId === controllerId) && (!expr.owned || (d.ownerId === controllerId && !d.token))).length;
    }
    case 'b101-party': {
      // Up to one each of Cleric, Rogue, Warrior and Wizard; a creature fills one role (the best assignment is found).
      const roles = ['cleric', 'rogue', 'warrior', 'wizard'];
      const mine = (alive.find(p => p.playerId === controllerId)?.deck?.battlefield || []).filter(c => /\bcreature\b/i.test(H.definitionFor(game, c)?.typeLine || ''));
      const can = mine.map(c => { const d = H.definitionFor(game, c), all = /changeling/i.test(d?.oracleText || ''); return roles.filter(r => all || new RegExp(`\\b${r}\\b`).test(SUBTYPE_OF(d))); }).filter(x => x.length);
      const best = (i, used) => (i >= can.length ? 0 : Math.max(best(i + 1, used), ...can[i].filter(r => !used.includes(r)).map(r => 1 + best(i + 1, [...used, r]))));
      return Math.min(4, best(0, []));
    }
    case 'b101-blockers': {
      const id = bindings.eventCard || bindings.sourceId;
      return Object.values(game.combatState?.blocks || {}).reduce((n, b) => n + (b?.assignments || []).filter(x => x.attackerId === id).length, 0);
    }
    case 'b101-opponents-more': {
      const n = p => (p?.deck?.battlefield || []).filter(c => new RegExp(`\\b${expr.type}\\b`, 'i').test(H.definitionFor(game, c)?.typeLine || '')).length;
      const me = n(alive.find(p => p.playerId === controllerId));
      return alive.filter(p => p.playerId !== controllerId && (expr.fewer ? n(p) < me : n(p) > me)).length;
    }
    case 'b101-attacked-now': return new Set((game.combatState?.attackers || []).map(a => a.defenderId).filter(Boolean)).size;
    case 'b101-commander-casts': return (alive.find(p => p.playerId === controllerId)?.commanders || []).reduce((n, c) => n + Number(c.castCount || 0), 0);
    case 'b101-event-spell-colors': {
      const obj = (game.stack || []).find(x => x.id === bindings.eventStackId), card = obj?.card || (bindings.eventCard && H.locateCardInGame(game, bindings.eventCard)?.card);
      return card ? (H.definitionFor(game, card)?.colors || []).length : 0;
    }
    case 'b101-same-name-graveyards': {
      const obj = (game.stack || []).find(x => x.id === bindings.eventStackId), card = obj?.card || (bindings.eventCard && H.locateCardInGame(game, bindings.eventCard)?.card);
      const name = card && H.definitionFor(game, card)?.name;
      return name ? alive.reduce((n, p) => n + (p.deck.graveyard || []).filter(c => H.definitionFor(game, c)?.name === name).length, 0) : 0;
    }
    case 'b101-big-graveyards': return alive.filter(p => (p.deck.graveyard || []).length >= expr.min).length;
    case 'b101-opponents-hand': return alive.filter(p => p.playerId !== controllerId && (p.deck.hand || []).length >= expr.min).length;
    case 'b101-types-among-permanents': {
      const seen = new Set();
      for (const c of alive.find(p => p.playerId === controllerId)?.deck?.battlefield || []) {
        if (expr.other && c.instanceId === bindings.sourceId) continue;
        const front = String(H.definitionFor(game, c)?.typeLine || '').split('—')[0];
        if (expr.nonland && /\bLand\b/.test(front)) continue;
        for (const t of ['Artifact', 'Battle', 'Creature', 'Enchantment', 'Kindred', 'Land', 'Planeswalker']) if (new RegExp(`\\b${t}\\b`).test(front)) seen.add(t);
      }
      return seen.size;
    }
    case 'b101-distinct': {
      const me = alive.find(p => p.playerId === controllerId);
      const rows = expr.where === 'nonland cards in your graveyard' ? (me?.deck?.graveyard || []).filter(c => !/\bLand\b/.test(H.definitionFor(game, c)?.typeLine || ''))
        : (me?.deck?.battlefield || []).filter(c => { const t = H.definitionFor(game, c)?.typeLine || ''; return expr.where === 'creatures you control' ? /\bCreature\b/.test(t) : expr.where === 'nonland permanents you control' ? !/\bLand\b/.test(t) : true; });
      return new Set(rows.map(c => { const d = H.definitionFor(game, c); return expr.stat === 'power' ? Number(H.effectivePower(c, d, game) || 0) : Number(d?.manaValue ?? d?.cmc ?? 0); })).size;
    }
    case 'b101-attached': {
      const host = bindings.eventCard && bindings.eventCard !== bindings.sourceId && H.locateCardInGame(game, bindings.eventCard)?.zone === 'battlefield' ? bindings.eventCard : bindings.sourceId;
      return alive.flatMap(p => p.deck.battlefield || []).filter(c => c.attachedTo === host && ((expr.auras && /\bAura\b/.test(H.definitionFor(game, c)?.typeLine || '')) || (expr.equipment && /\bEquipment\b/.test(H.definitionFor(game, c)?.typeLine || '')))).length;
    }
    case 'b101-mutations': { const hit = H.locateCardInGame(game, bindings.sourceId); return Math.max(0, (hit?.card?.mutatedWith || []).length); }
    case 'b101-players': return alive.length;
    case 'b101-player-counter': return Number(alive.find(p => p.playerId === controllerId)?.counters?.[expr.counter] || 0);
    case 'b101-colors-spent': {
      const hit = H.locateCardInGame(game, bindings.sourceId), onStack = (game.stack || []).find(x => x.card?.instanceId === bindings.sourceId || x.id === bindings.sourceId);
      return (onStack?.colorsSpent || hit?.card?.colorsSpent || []).length;
    }
    case 'b101-kicked': {
      const hit = H.locateCardInGame(game, bindings.sourceId), onStack = (game.stack || []).find(x => x.card?.instanceId === bindings.sourceId || x.id === bindings.sourceId);
      return Number(onStack?.kickCount ?? hit?.card?.kickCount ?? ((onStack?.kicked || hit?.card?.kicked) ? 1 : 0)) || 0;
    }
    default: return undefined;
  }
}
