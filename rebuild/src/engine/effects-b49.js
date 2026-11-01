// Card wordings added in build 49 (the rest of the most-played cards, then the long tail).
// compileB49Clause(c, ctx) is tried by effects-catalog.js before it gives up on a sentence; compileB49Sequence sees the
// sentences around it (and the parts compiled so far); applyB49 runs the effect kinds made here and gatherB49 asks the
// resolve-time questions. Every choice stays with the player who makes it in the rules.
import { numberFromText, locateCardInGame, moveCard, definitionFor, resolveAmount, parseCondition, checkCondition, catalogHelpers as H } from './effects.js';
import { effectivePower, effectiveToughness } from './combat.js';
import { cardFitsWords } from './effects-catalog.js';

const N = '(a|an|one|two|three|four|five|six|seven|eight|nine|ten|\\d+|X)';
const num = s => numberFromText(s) ?? (/^x$/i.test(String(s)) ? 'X' : null);
const cap = s => String(s || '').charAt(0).toUpperCase() + String(s || '').slice(1);
const playerById = (game, id) => (game.players || []).find(p => p.playerId === id) || null;
const nameOf = (game, id) => definitionFor(game, locateCardInGame(game, id)?.card)?.name || 'a card';
const compile = (text, sourceName) => H.compileSingleClause(text, { sourceName });
const ok = inner => inner && !inner.unsupported.length && inner.effects.length;

/** One sentence. Pushes onto ctx.effects / ctx.requirements and returns true when understood. */
export function compileB49Clause(c, ctx) {
  const { effects, requirements, sourceName } = ctx;
  let m;
  // Dawn's Truce, Blossoming Defense-style: "You and permanents you control gain hexproof until end of turn."
  if ((m = c.match(/^You(?: and permanents you control)? gains? hexproof(?: and indestructible)? until end of turn\.?$/i))) {
    effects.push({ kind: 'player-hexproof' });
    if (/permanents you control/i.test(c)) {
      effects.push({ kind: 'grant-keyword-each', scope: 'you', filter: 'permanent', keyword: 'hexproof', expires: 'cleanup' });
      if (/indestructible/i.test(c)) effects.push({ kind: 'grant-keyword-each', scope: 'you', filter: 'permanent', keyword: 'indestructible', expires: 'cleanup' });
    }
    return true;
  }
  // "Return [up to] two target creature cards [each with mana value 2 or less] from your graveyard to your hand / the battlefield."
  if ((m = c.match(/^Return (up to )?(one|two|three|four|five|\d+) target ([a-z ,]*?)cards?( each with mana value \d+ or (?:less|greater))? from your graveyard to (your hand|the battlefield( tapped)?)\.?$/i))) {
    const n = num(m[2]), bind = `graveMulti${requirements.length}`;
    const filter = `${m[3].trim()}${m[4] ? m[4].replace(/ each/i, '') : ''}`;
    requirements.push({ kind: 'graveyard-multi', bind, filter, max: n, min: m[1] ? 0 : n, label: `${m[1] ? 'up to ' : ''}${m[2]} ${m[3]}card${n === 1 ? '' : 's'}${m[4] || ''} in your graveyard` });
    effects.push(/hand/i.test(m[5]) ? { kind: 'graveyard-to-hand-many', bind } : { kind: 'graveyard-to-battlefield-many', bind, tapped: !!m[6] });
    return true;
  }
  // Consumed by Greed: "Target opponent sacrifices a creature with the greatest power among creatures they control."
  if ((m = c.match(/^(Target opponent|Target player|Each opponent) sacrifices an? (creature|[a-z]+ creature) with the greatest (power|toughness|mana value) among (?:creatures|[a-z]+ creatures) they control\.?$/i))) {
    const each = /^each/i.test(m[1]);
    const pb = each ? null : H.playerRequirement(requirements, /opponent/i.test(m[1]) ? 'opponent' : 'player', m[1]);
    const bind = `greatest${requirements.length}`;
    requirements.push({ kind: 'b49-greatest', bind, playerBind: pb, each, filter: m[2].toLowerCase(), stat: m[3].toLowerCase(), label: `${m[2]} with the greatest ${m[3]}` });
    effects.push({ kind: 'sacrifice-chosen', bind });
    return true;
  }
  // High Tide, Bubbling Muck: "Until end of turn, whenever a player taps an Island for mana, that player adds an additional {U}."
  if ((m = c.match(/^Until end of turn, whenever (a player|you) taps? an? ([A-Z][a-z]+) for mana, (?:that player adds|add) an additional ((?:\{[WUBRGC]\})+)\.?$/i))) {
    const text = /you/i.test(m[1]) ? `Whenever you tap a ${m[2]} for mana, add an additional ${m[3]}` : `Whenever a ${m[2]} is tapped for mana, its controller adds an additional ${m[3]}`;
    effects.push({ kind: 'mana-extra-turn', text });
    return true;
  }
  // Hideaway lands: "You may play the exiled card without paying its mana cost if you attacked with three or more creatures this turn."
  // (Without "you may" the game already asked it: an optional ability's "you may" is asked before it resolves.)
  if ((m = c.match(/^(?:Then )?(?:if (.+?), )?(you may )?(play|cast) the exiled card without paying its mana cost(?: if (.+?))?\.?$/i))) {
    const cond = m[1] || m[4] || null;
    if (cond && !parseConditionAny(cond)) return false;
    const bind = `playExiled${requirements.length}`;
    requirements.push({ kind: 'b49-play-exiled', bind, cond, castOnly: /cast/i.test(m[3]), ask: !!m[2] });
    effects.push({ kind: 'play-exiled', bind });
    return true;
  }
  // Imprint — Chrome Mox, Isochron Scepter: "you may exile a nonartifact, nonland card from your hand." (kept with this permanent)
  if ((m = c.match(/^(you may )?exile (?:a|an) ([a-z ,-]+?) card(?: with mana value (\d+) or less)? from your hand\.?$/i)) && !/target/i.test(c)) {
    const bind = `imprint${requirements.length}`;
    requirements.push({ kind: 'b49-hand-pick', bind, filter: `${m[2]}${m[3] ? ` with mana value ${m[3]} or less` : ''}`, min: m[1] ? 0 : 1, label: `${m[2]} card${m[3] ? ` with mana value ${m[3]} or less` : ''} to exile` });
    effects.push({ kind: 'imprint', bind });
    return true;
  }
  // Chrome Mox: "Add one mana of any of the exiled card's colors." (as a mana ability the game asks the colour in ops.js)
  if (/^Add one mana of any of the exiled card'?s colors\.?$/i.test(c)) {
    const bind = `imprintColor${requirements.length}`;
    requirements.push({ kind: 'b49-imprint-color', bind });
    effects.push({ kind: 'add-mana', colorBind: bind, amount: 1 });
    return true;
  }
  // Watcher for Tomorrow: "put the exiled card into its owner's hand."
  if (/^put the exiled card into its owner'?s hand\.?$/i.test(c)) { effects.push({ kind: 'hideaway-to-hand' }); return true; }
  // The Ozolith: "put those counters on The Ozolith." / "move all counters from The Ozolith onto target creature."
  if (/^put those counters on (?:SELFNAME|this (?:artifact|creature|permanent))\.?$/i.test(c)) { effects.push({ kind: 'counters-from-event', bind: 'sourceId' }); return true; }
  if ((m = c.match(/^(?:you may )?move all counters from (?:SELFNAME|this (?:artifact|creature|permanent)) onto (target creature(?: you control)?|target permanent)\.?$/i))) {
    const bind = H.targetRequirement(requirements, m[1].toLowerCase(), m[1]);
    effects.push({ kind: 'move-all-counters', from: 'sourceId', bind });
    return true;
  }
  // Etali, Primal Storm: "exile the top card of each player's library, then you may cast any number of spells from among those cards without paying their mana costs."
  if (/^exile the top card of each player'?s library, then you may cast any number of spells from among (?:those cards|them) without paying their mana costs\.?$/i.test(c)) {
    requirements.push({ kind: 'b49-each-top-cast', bind: 'etaliPick', mode: 'top' });
    effects.push({ kind: 'each-top-cast', bind: 'etaliPick', mode: 'top' });
    return true;
  }
  // Sevinne's Reclamation: "If this spell was cast from a graveyard, you may copy this spell and may choose a new target for the copy."
  if ((m = c.match(/^(?:If this spell was cast from a graveyard, )?(you may )?copy this spell(?: and may choose (?:a )?new targets? for the copy)?\.?$/i))) {
    if (/^If this spell was cast from a graveyard/i.test(c)) effects.push({ kind: 'condition', test: 'b49-cast-from-graveyard', skip: m[1] ? 2 : 1 });
    if (m[1]) { const bind = `copySelf${requirements.length}`; requirements.push({ kind: 'yes-no', bind, label: 'Copy this spell?' }); effects.push({ kind: 'condition', test: 'chosen', bind, skip: 1 }); }
    effects.push({ kind: 'copy-self', retarget: /new target/i.test(c) });
    return true;
  }
  // Midnight Clock, Timetwister-style: "Shuffle your hand and graveyard into your library"
  if (/^(?:you )?shuffle your hand and graveyard into your library\.?$/i.test(c)) { effects.push({ kind: 'shuffle-hand-graveyard' }); return true; }
  // Scrap Trawler: "Return to your hand target artifact card in your graveyard with lesser mana value."
  if ((m = c.match(/^Return to your hand target ([a-z]+) card in your graveyard with lesser mana value\.?$/i))) {
    const bind = `lesser${requirements.length}`;
    requirements.push({ kind: 'b49-grave-lesser', bind, filter: m[1].toLowerCase(), label: `${m[1]} card with lesser mana value` });
    effects.push({ kind: 'return-from-graveyard', bind, to: 'hand' });
    return true;
  }
  // Selvala: "its controller may draw a card if its power is greater than each other creature's power."  Tataru Taru: "target opponent may draw a card."
  if ((m = c.match(/^(its controller|target opponent|target player|that player) may draw a card(?: if its power is greater than each other creature'?s power)?\.?$/i))) {
    const pb = /^target/i.test(m[1]) ? H.playerRequirement(requirements, /opponent/i.test(m[1]) ? 'opponent' : 'player', m[1]) : 'eventPlayer';
    const bind = `theyMay${requirements.length}`;
    requirements.push({ kind: 'b49-they-may', bind, playerBind: pb, label: 'Draw a card?', biggest: /greater than each other/i.test(c) });
    effects.push({ kind: 'condition', test: 'chosen', bind, skip: 1 }, { kind: 'draw', scope: 'you', amount: 1, forPlayerBind: pb });
    return true;
  }
  // Nesting Grounds: "Move a counter from target permanent you control onto a second target permanent."
  if (/^Move a counter from target permanent you control onto a second target permanent\.?$/i.test(c)) {
    const from = H.targetRequirement(requirements, 'target permanent you control', 'target permanent you control');
    const to = H.targetRequirement(requirements, 'target permanent', 'a second target permanent');
    const kind = `counterKind${requirements.length}`;
    requirements.push({ kind: 'b49-counter-kind', bind: kind, fromBind: from });
    effects.push({ kind: 'move-counter', fromBind: from, bind: to, kindBind: kind, amount: 1 });
    return true;
  }
  // Forgotten Ancient: "you may move any number of +1/+1 counters from this creature onto other creatures."
  if (/^(?:you may )?move any number of \+1\/\+1 counters from (?:SELFNAME|this creature) onto other creatures\.?$/i.test(c)) {
    requirements.push({ kind: 'b49-spread-counters', bind: 'spread' });
    effects.push({ kind: 'spread-counters', bind: 'spread' });
    return true;
  }
  // "Any number of target creatures each get +1/+1 and gain flying until end of turn." — the same instruction for each one chosen.
  if ((m = c.match(/\bany number of target ((?:[a-z]+ )*?[a-z]+?)s\b((?: you control| you don'?t control| your opponents control)?)/i)) && !/\bChoose\b/i.test(c)) {
    const single = singularEach(c.replace(m[0], `target ${m[1]}${m[2]}`));
    const r = eachTarget(single, `target ${m[1].toLowerCase()}${m[2]}`, requirements, sourceName);
    if (r) { effects.push(r); return true; }
  }
  // Curse of the Swine: "For each creature exiled this way, its controller creates a 2/2 green Boar creature token."
  if ((m = c.match(/^For each (creature|permanent|artifact|nonland permanent) (?:exiled|destroyed|put into a graveyard) this way, its controller creates (.+)$/i))) {
    const inner = compile(`Create ${m[2]}`, sourceName);
    if (ok(inner) && !inner.requirements.length) { effects.push({ kind: 'per-moved-controller', effects: inner.effects }); return true; }
  }
  // Veil of Summer: "You and permanents you control gain hexproof from blue and from black until end of turn."
  if ((m = c.match(/^You and permanents you control gain hexproof from (white|blue|black|red|green)(?: and from (white|blue|black|red|green))? until end of turn\.?$/i))) {
    const words = [m[1], m[2]].filter(Boolean).map(w => w.toLowerCase());
    effects.push({ kind: 'player-hexproof', colors: words.map(w => ({ white: 'W', blue: 'U', black: 'B', red: 'R', green: 'G' }[w])) });
    for (const w of words) effects.push({ kind: 'grant-keyword-each', scope: 'you', filter: 'permanent', keyword: `Hexproof from ${w}`, expires: 'cleanup' });
    return true;
  }
  // "Draw a card if an opponent has cast a blue or black spell this turn."
  if ((m = c.match(/^(.+?) if (an opponent has cast an? .+? spell this turn)\.?$/i)) && parseConditionAny(m[2])) {
    const inner = compile(`${m[1]}.`, sourceName);
    if (ok(inner)) { effects.push({ kind: 'condition', ...parseConditionAny(m[2]), skip: inner.effects.length }, ...inner.effects); requirements.push(...inner.requirements); return true; }
  }
  // Archway of Innovation, Dark Apostle: "The next [noncreature] spell you cast this turn has improvise / cascade."
  if ((m = c.match(/^The next (noncreature )?spell you cast this turn has (improvise|cascade)\.?$/i))) { effects.push({ kind: 'next-spell-keyword', keyword: m[2].toLowerCase(), noncreature: !!m[1] }); return true; }
  // Boromir, Mindbreak Trap-style triggers: "counter that spell." — the spell that caused the trigger.
  if (/^counter that spell\.?$/i.test(c)) { effects.push({ kind: 'counter-event-spell' }); return true; }
  // Liliana, Dreadhorde General −9: "Each opponent chooses a permanent they control of each permanent type and sacrifices the rest."
  if (/^Each (opponent|player) chooses a permanent they control of each permanent type and sacrifices the rest\.?$/i.test(c)) {
    requirements.push({ kind: 'b49-keep-each-type', bind: 'keepTypes', who: /opponent/i.test(c) ? 'opponents' : 'all' });
    effects.push({ kind: 'keep-each-type', bind: 'keepTypes' });
    return true;
  }
  // Mizzix's Mastery overloaded: "Exile each card that's an instant or sorcery from your graveyard."
  if ((m = c.match(/^Exile each card that'?s an? ([a-z]+(?: or [a-z]+)?) from your graveyard\.?$/i))) { effects.push({ kind: 'exile-graveyard-filter', filter: m[1].toLowerCase() }); return true; }
  // Agadeem's Awakening: "Return from your graveyard to the battlefield any number of target creature cards that each have a different mana value X or less."
  if (/^Return from your graveyard to the battlefield any number of target creature cards that each have a different mana value X or less\.?$/i.test(c)) {
    requirements.push({ kind: 'b49-distinct-mv', bind: 'agadeem', filter: 'creature' });
    effects.push({ kind: 'graveyard-to-battlefield-many', bind: 'agadeem', tapped: false });
    return true;
  }
  // Kodama of the East Tree: "if it wasn't put onto the battlefield with this ability, you may put a permanent card with equal or lesser mana value from your hand onto the battlefield."
  if (/^(?:if it wasn'?t put onto the battlefield with this ability, )?(?:you may )?put a permanent card with equal or lesser mana value from your hand onto the battlefield\.?$/i.test(c)) {
    requirements.push({ kind: 'b49-kodama', bind: 'kodama' });
    effects.push({ kind: 'kodama-put', bind: 'kodama' });
    return true;
  }
  // Thespian's Stage / Mycosynth Gardens / Shifting Woodland: "This land becomes a copy of target …"
  if ((m = c.match(/^(?:SELFNAME|This (?:land|artifact|permanent|creature)) becomes a copy of (target (?:land|nontoken artifact you control with mana value X|permanent card in your graveyard))(, except it has this ability)?( until end of turn)?\.?$/i))) {
    const grave = /graveyard/i.test(m[1]);
    const bind = grave ? `grave${requirements.length}` : H.targetRequirement(requirements, m[1].toLowerCase().replace(/ with mana value x/, ''), m[1]);
    if (grave) requirements.push({ kind: 'graveyard-target', bind, scope: 'target permanent card in your graveyard', label: 'target permanent card in your graveyard' });
    effects.push({ kind: 'become-copy', bind, keepAbility: !!m[2], until: m[3] ? 'turn' : 'permanent', mvX: /mana value X/i.test(m[1]) });
    return true;
  }
  // Cut a Deal: "Each opponent draws a card. Then you draw a card for each opponent who drew a card this way."
  if (/^(?:Then )?you draw a card for each opponent who drew a card this way\.?$/i.test(c)) { effects.push({ kind: 'draw-per-opponent-drew' }); return true; }
  // Kardur: "until your next turn, creatures your opponents control attack each combat if able and attack a player other than you if able."
  if (/^until your next turn, creatures your opponents control attack each combat if able and attack a player other than you if able\.?$/i.test(c)) { effects.push({ kind: 'goad-each', scope: 'opponents' }); return true; }
  // Bilbo's Gambit: "Players can't cast spells this turn." (everyone, the caster too)
  if ((m = c.match(/^(?:Players|Each player) can'?t cast (noncreature )?spells this turn\.?$/i))) { effects.push({ kind: 'cast-lock-all', noncreature: !!m[1] }); return true; }
  // "All permanents you control phase out, and until your next turn, …" — two instructions.
  if ((m = c.match(/^(.+?), and (until (?:your next turn|end of turn), .+)$/i))) {
    const a = compile(`${m[1]}.`, sourceName), b = compile(cap(m[2]), sourceName);
    if (ok(a) && ok(b)) { effects.push(...a.effects, ...b.effects); requirements.push(...a.requirements, ...b.requirements); return true; }
  }
  // Wildfire Howl: "~ deals 1 damage to any target and 2 damage to each creature."
  if ((m = c.match(/^(.+?) deals (\w+) damage to (.+?) and (\w+) damage to (.+?)\.?$/i)) && num(m[2]) !== null && num(m[4]) !== null) {
    const a = compile(`${m[1]} deals ${m[2]} damage to ${m[3]}.`, sourceName), b = compile(`${m[1]} deals ${m[4]} damage to ${m[5]}.`, sourceName);
    if (ok(a) && ok(b)) { effects.push(...a.effects, ...b.effects); requirements.push(...a.requirements, ...b.requirements); return true; }
  }
  return false;
}

/** Several sentences, or one that needs the parts before it. Returns { part, consumed } or null. */
export function compileB49Sequence(clauses, i, { sourceName, parts = [] }) {
  const c0 = String(clauses[i] || '').replace(/\([^()]*\)/g, '').trim();
  let m, m2;
  // Blooming Blast: "~ deals 3 damage to that creature's controller." — the controller of the creature targeted before.
  if ((m = c0.match(/^(?:.+? )?deals (\w+) damage to that (creature|permanent)'s controller\.?$/i)) && num(m[1]) !== null) {
    const earlier = [...parts].reverse().flatMap(p => [...(p.requirements || [])].reverse()).find(r => r.kind === 'target');
    if (earlier) {
      const as = `controllerOf${earlier.bind}`;
      parts.forEach(p => { if (p.requirements?.includes(earlier) && !p.effects.some(e => e.kind === 'remember-controller' && e.as === as)) p.effects.unshift({ kind: 'remember-controller', bind: earlier.bind, as }); });
      return { part: { effects: [{ kind: 'damage', amount: num(m[1]), bind: as, sourceName }], requirements: [], unsupported: [] }, consumed: 1 };
    }
  }
  // Smuggler's Buggy: "You may cast the exiled card without paying its mana cost. If you do, return this Vehicle to its owner's hand."
  const after = String(clauses[i + 1] || '').match(/^If you do,\s*(.+)$/i);
  if (after && /you may (?:play|cast) the exiled card without paying its mana cost/i.test(c0)) {
    const first = compile(c0, sourceName), then = compile(cap(after[1]), sourceName);
    const bind = first.requirements.find(r => r.kind === 'b49-play-exiled')?.bind;
    if (ok(first) && ok(then) && bind) return { part: { effects: [...first.effects, { kind: 'condition', test: 'b49-bound', bind, skip: then.effects.length }, ...then.effects], requirements: [...first.requirements, ...then.requirements], unsupported: [] }, consumed: 2 };
  }
  // "Until end of turn, target creature gets +2/+0 and gains "…"": the pump, then the grant to the same creature.
  if ((m = c0.match(/^(Until end of turn, )?(target creature(?: you control)?) gets ([+-]\d+\/[+-]\d+) and gains ((?:"[^"]+"(?:,? and )?)+)( until end of turn)?\.?$/i))) {
    const a = compile(`${cap(m[2])} gets ${m[3]} until end of turn.`, sourceName);
    const t = ok(a) && a.requirements.find(r => r.kind === 'target');
    const quotes = [...m[4].matchAll(/"([^"]+)"/g)].map(x => x[1]);
    const bind = t ? t.bind : null;
    if (ok(a) && quotes.every(grantedUnderstood)) {
      const earlier = bind || [...parts].reverse().flatMap(p => [...(p.requirements || [])].reverse()).find(r => r.kind === 'target' || r.kind === 'choose-permanent')?.bind;
      if (earlier) return { part: { effects: [...a.effects, { kind: 'grant-text', bind: earlier, texts: quotes, until: m[1] || m[5] ? 'turn' : 'permanent' }], requirements: a.requirements, unsupported: [] }, consumed: 1 };
    }
  }
  // Malakir Rebirth: 'Until end of turn, that creature gains "When this creature dies, return it to the battlefield tapped …"'
  if ((m = c0.match(/^(?:Until end of turn, )?(that creature|it|that permanent|target creature(?: you control)?|creatures you control|each creature you control)( also)? gains? ((?:"[^"]+"(?:,? and )?)+)( until end of turn)?\.?$/i))) {
    const quotes = [...m[3].matchAll(/"([^"]+)"/g)].map(x => x[1]);
    const until = /^Until end of turn/i.test(c0) || m[4] ? 'turn' : 'permanent';
    if (quotes.every(grantedUnderstood)) {
      if (/^(?:creatures you control|each creature you control)$/i.test(m[1])) return { part: { effects: [{ kind: 'grant-text-each', filter: 'creature', texts: quotes, until }], requirements: [], unsupported: [] }, consumed: 1 };
      if (/^target/i.test(m[1])) {
        const requirements = [], bind = H.targetRequirement(requirements, m[1].toLowerCase(), m[1]);
        return { part: { effects: [{ kind: 'grant-text', bind, texts: quotes, until }], requirements, unsupported: [] }, consumed: 1 };
      }
      const earlier = [...parts].reverse().flatMap(p => [...(p.requirements || [])].reverse()).find(r => r.kind === 'target' || r.kind === 'choose-permanent');
      if (earlier) return { part: { effects: [{ kind: 'grant-text', bind: earlier.bind, texts: quotes, until }], requirements: [], unsupported: [] }, consumed: 1 };
    }
  }
  // Isochron Scepter: "You may copy the exiled card. If you do, you may cast the copy without paying its mana cost."
  if (/^(?:you may )?copy the exiled card\.?$/i.test(c0) && /^If you do, you may cast the copy without paying its mana cost\.?$/i.test(String(clauses[i + 1] || ''))) {
    const bind = `castCopy${i}`;
    return { part: { effects: [{ kind: 'condition', test: 'chosen', bind, skip: 1 }, { kind: 'cast-copy', from: 'imprint' }], requirements: [{ kind: 'yes-no', bind, label: 'Cast a copy of the exiled card without paying its mana cost?' }], unsupported: [] }, consumed: 2 };
  }
  if (/^exile the top card of each player'?s library, then you may cast any number of spells from among (?:those cards|them) without paying their mana costs\.?$/i.test(c0))
    return { part: { effects: [{ kind: 'each-top-cast', bind: 'etaliPick', mode: 'top' }], requirements: [{ kind: 'b49-each-top-cast', bind: 'etaliPick', mode: 'top' }], unsupported: [] }, consumed: 1 };
  // Braids, Arisen Nightmare.
  if (/^(you may )?sacrifice an artifact, creature, enchantment, land, or planeswalker\.?$/i.test(c0) && /^If you do, each opponent may sacrifice a permanent of their choice that shares a card type with it\.?$/i.test(String(clauses[i + 1] || '')) && /^For each opponent who doesn'?t, that player loses (\w+) life and you draw a card\.?$/i.test(String(clauses[i + 2] || ''))) {
    const loss = num(String(clauses[i + 2]).match(/loses (\w+) life/i)[1]);
    return { part: { effects: [{ kind: 'braids', bind: 'braids', loss }], requirements: [{ kind: 'b49-braids', bind: 'braids', optional: /^you may/i.test(c0) }], unsupported: [] }, consumed: 3 };
  }
  // Etali, Primal Conqueror: "each player exiles cards from the top of their library until they exile a nonland card. You may cast any
  // number of spells from among the nonland cards exiled this way without paying their mana costs."
  if (/^each player exiles cards from the top of their library until they exile a nonland card\.?$/i.test(c0) && /^You may cast any number of spells from among (?:the nonland cards exiled this way|them|those cards) without paying their mana costs\.?$/i.test(String(clauses[i + 1] || ''))) {
    return { part: { effects: [{ kind: 'each-top-cast', bind: 'etaliPick', mode: 'until-nonland' }], requirements: [{ kind: 'b49-each-top-cast', bind: 'etaliPick', mode: 'until-nonland' }], unsupported: [] }, consumed: 2 };
  }
  // Curse of Opulence: "Each opponent attacking that player does the same." — the attacking player gets the same (if it isn't you).
  if (/^Each opponent attacking that player does the same\.?$/i.test(c0) && parts.length) {
    const prev = parts[parts.length - 1];
    if (prev.effects?.length && !(prev.requirements || []).length) return { part: { effects: [{ kind: 'condition', test: 'b49-event-player-opponent', skip: prev.effects.length }, ...prev.effects.map(e => ({ ...e, forPlayerBind: 'eventPlayer' }))], requirements: [], unsupported: [] }, consumed: 1 };
  }
  // Urza, Lord High Artificer: "Shuffle your library, then exile the top card. Until end of turn, you may play that card without paying its mana cost."
  if (/^Shuffle your library, then exile the top card\.?$/i.test(c0) && /^Until end of turn, you may play that card without paying its mana cost\.?$/i.test(String(clauses[i + 1] || '')))
    return { part: { effects: [{ kind: 'shuffle' }, { kind: 'impulse', amount: 1, until: 'turn', free: true }], requirements: [], unsupported: [] }, consumed: 2 };
  // Emry: "Choose target artifact card in your graveyard. You may cast that card this turn."
  if ((m = c0.match(/^Choose target ([a-z ]+?) card in your graveyard\.?$/i)) && /^You may cast that card this turn\.?$/i.test(String(clauses[i + 1] || ''))) {
    const bind = `grave${i}`;
    return { part: { effects: [{ kind: 'cast-from-graveyard', bind, thisTurn: true }], requirements: [{ kind: 'graveyard-target', bind, scope: `target ${m[1].toLowerCase()} card in your graveyard`, label: `target ${m[1].toLowerCase()} card in your graveyard` }], unsupported: [] }, consumed: 2 };
  }
  // Expressive Iteration: "Put one of them into your hand, put one of them on the bottom of your library, and exile one of them." (+ "You may play the exiled card this turn.")
  if (/^Look at the top three cards of your library\.?$/i.test(c0) && /^Put one of them into your hand, put one of them on the bottom of your library, and exile one of them\.?$/i.test(String(clauses[i + 1] || '')) && /^You may play the exiled card this turn\.?$/i.test(String(clauses[i + 2] || ''))) {
    const bind = `dig${i}`, picks = [{ min: 1, max: 1, filter: '', to: 'hand' }, { min: 1, max: 1, filter: '', to: 'bottom' }, { min: 1, max: 1, filter: '', to: 'exile-play' }];
    return { part: { effects: [{ kind: 'dig', bind, amount: 3, picks, rest: { to: 'exile' } }], requirements: [{ kind: 'dig', bind, amount: 3, picks, rest: { to: 'exile' }, label: 'the top three cards' }], unsupported: [] }, consumed: 3 };
  }
  // Unbreakable Formation: "Addendum — If you cast this spell during your main phase, put a +1/+1 counter on each of those creatures and they gain vigilance until end of turn."
  if (/^(?:Addendum — )?If you cast this spell during your main phase, put a \+1\/\+1 counter on each of those creatures and they gain vigilance until end of turn\.?$/i.test(c0) && parts.some(p => p.effects.some(e => e.kind === 'grant-keyword-each' && e.scope === 'you'))) {
    const a = compile('Put a +1/+1 counter on each creature you control.', sourceName), b = compile('Creatures you control gain vigilance until end of turn.', sourceName);
    if (ok(a) && ok(b)) return { part: { effects: [{ kind: 'condition', test: 'b49-cast-in-main', skip: a.effects.length + b.effects.length }, ...a.effects, ...b.effects], requirements: [], unsupported: [] }, consumed: 1 };
  }
  // Spelunking: "If you put a Cave onto the battlefield this way, you gain 4 life."
  if ((m = c0.match(/^If you put an? ([A-Z][a-z]+) onto the battlefield this way, (.+)$/))) {
    const inner = compile(cap(m[2]), sourceName);
    if (ok(inner)) return { part: { effects: [{ kind: 'condition', test: 'b49-last-moved-type', type: m[1], skip: inner.effects.length }, ...inner.effects], requirements: inner.requirements, unsupported: [] }, consumed: 1 };
  }
  // "Choose any number of target creatures. Put a +1/+1 counter on each of them." (Nature's Panoply, Twinflame, Solidarity of Heroes)
  if ((m = c0.match(/^Choose any number of target ((?:[a-z]+ )*?[a-z]+?)s((?: you control| you don'?t control)?)\.?$/i)) && /\beach of them\b/i.test(String(clauses[i + 1] || ''))) {
    const scope = `target ${m[1].toLowerCase()}${m[2]}`;
    const next = String(clauses[i + 1]).replace(/^For each of them, create a token that'?s a copy of that creature/i, 'Create a token that\'s a copy of target creature').replace(/\bon each of them\b/i, 'on target creature');
    const requirements = [];
    const r = !/each of them/i.test(next) && eachTarget(next, scope, requirements, sourceName);
    if (r) return { part: { effects: [r], requirements, unsupported: [] }, consumed: 2 };
  }
  // Approach of the Second Sun.
  if ((m = c0.match(/^If this spell was cast from your hand and you'?ve cast another spell named (.+?) this game, you win the game\.?$/i)) && (m2 = String(clauses[i + 1] || '').match(/^Otherwise, put .+? into its owner'?s library (\w+) from the top and you gain (\w+) life\.?$/i))) {
    const n = { second: 2, third: 3, fourth: 4, fifth: 5, sixth: 6, seventh: 7, eighth: 8 }[m2[1].toLowerCase()];
    if (n) return { part: { effects: [{ kind: 'condition', test: 'b49-approach', name: m[1], skip: 1 }, { kind: 'game-result', win: true }, { kind: 'condition', test: 'b49-approach', name: m[1], negate: true, skip: 2 }, { kind: 'self-library-nth', n }, { kind: 'life', scope: 'you', amount: num(m2[2]), deltaSign: 1 }], requirements: [], unsupported: [] }, consumed: 2 };
  }
  // Torment of Hailfire: "Repeat the following process X times. Each opponent loses 3 life unless that player sacrifices a nonland permanent of their choice or discards a card."
  if (/^Repeat the following process X times\.?$/i.test(c0) && (m = String(clauses[i + 1] || '').match(/^Each opponent loses (\w+) life unless that player sacrifices a nonland permanent of their choice or discards a card\.?$/i)))
    return { part: { effects: [{ kind: 'torment', bind: 'torment', loss: num(m[1]) }], requirements: [{ kind: 'number', bind: 'X', label: 'Choose X', min: 0, max: 99 }, { kind: 'b49-torment', bind: 'torment', loss: num(m[1]) }], unsupported: [] }, consumed: 2 };
  // Demonic Consultation.
  if (/^Choose a card name\.?$/i.test(c0) && (m = String(clauses[i + 1] || '').match(/^Exile the top (\w+) cards of your library, then reveal cards from the top of your library until you reveal a card with the chosen name\.?$/i)) && /^Put that card into your hand and exile all other cards revealed this way\.?$/i.test(String(clauses[i + 2] || '')))
    return { part: { effects: [{ kind: 'consultation', skipTop: num(m[1]), bind: 'chosenName' }], requirements: [{ kind: 'b49-card-name', bind: 'chosenName' }], unsupported: [] }, consumed: 3 };
  // Tainted Pact.
  if (/^Exile the top card of your library\.?$/i.test(c0) && /^You may put that card into your hand unless it has the same name as another card exiled this way\.?$/i.test(String(clauses[i + 1] || '')) && /^Repeat this process until you put a card into your hand or you exile two cards with the same name, whichever comes first\.?$/i.test(String(clauses[i + 2] || '')))
    return { part: { effects: [{ kind: 'tainted-pact', bind: 'pact' }], requirements: [{ kind: 'b49-tainted-pact', bind: 'pact' }], unsupported: [] }, consumed: 3 };
  // Mizzix's Mastery: "For each card exiled this way, copy it, and you may cast the copy without paying its mana cost."
  if (/^For each card exiled this way, copy it, and you may cast the copy without paying its mana cost\.?$/i.test(c0)) {
    const earlier = [...parts].reverse().flatMap(p => p.requirements || []).find(r => r.kind === 'graveyard-target');
    if (earlier || parts.some(p => p.effects.some(e => e.kind === 'exile-graveyard-filter'))) {
      const bind = `castCopies${i}`;
      return { part: { effects: [{ kind: 'condition', test: 'chosen', bind, skip: 1 }, { kind: 'cast-copy', bind: earlier?.bind || 'lastMoved' }], requirements: [{ kind: 'yes-no', bind, label: 'Cast the copies without paying their mana costs?' }], unsupported: [] }, consumed: 1 };
    }
  }
  // Sword of Hearth and Home: "exile up to one target creature you own, then search your library for a basic land card. Put both cards onto the battlefield under your control, then shuffle."
  if (/^exile up to one target creature you own, then search your library for a basic land card\.?$/i.test(c0) && /^Put both cards onto the battlefield under your control, then shuffle\.?$/i.test(String(clauses[i + 1] || ''))) {
    const requirements = [];
    const bind = H.targetRequirement(requirements, 'target creature you own', 'up to one target creature you own', { optional: true });
    requirements.push({ kind: 'library-search', bind: `search${i}`, text: 'Search your library for a basic land card, put it onto the battlefield, then shuffle.' });
    return { part: { effects: [{ kind: 'hearth-and-home', bind, searchBind: `search${i}` }], requirements, unsupported: [] }, consumed: 2 };
  }
  // Myr Battlesphere: "you may tap X untapped Myr you control. If you do, this creature gets +X/+0 until end of turn and deals X damage to the player or planeswalker it's attacking."
  if ((m = c0.match(/^(?:you may )?tap X untapped ([A-Z][a-z]+) you control\.?$/)) && /^If you do, (?:this creature|SELFNAME|.+?) gets \+X\/\+0 until end of turn and deals X damage to the player or planeswalker it'?s attacking\.?$/i.test(String(clauses[i + 1] || '')))
    return { part: { effects: [{ kind: 'battlesphere', bind: `tapX${i}` }], requirements: [{ kind: 'b49-tap-x', bind: `tapX${i}`, type: m[1] }], unsupported: [] }, consumed: 2 };
  // Chain of Vapor: "Then that permanent's controller may sacrifice a land of their choice. If the player does, they may copy this spell and may choose a new target for that copy."
  if (/^Then that permanent'?s controller may sacrifice a land of their choice\.?$/i.test(c0) && /^If the player does, they may copy this spell and may choose a new target for that copy\.?$/i.test(String(clauses[i + 1] || ''))) {
    const earlier = [...parts].reverse().flatMap(p => p.requirements || []).find(r => r.kind === 'target');
    if (earlier) return { part: { effects: [{ kind: 'chain-copy', bind: `chain${i}` }], requirements: [{ kind: 'b49-chain', bind: `chain${i}`, targetBind: earlier.bind }], unsupported: [] }, consumed: 2 };
  }
  // Saw in Half: "If that creature dies this way, its controller creates two tokens that are copies of that creature, except their power is
  // half that creature's power and their toughness is half that creature's toughness. Round up each time."
  if (/^If that creature dies this way, its controller creates two tokens that are copies of that creature, except their power is half that creature'?s power and their toughness is half that creature'?s toughness\.?$/i.test(c0) && /^Round up each time\.?$/i.test(String(clauses[i + 1] || ''))) {
    const earlier = [...parts].reverse().flatMap(p => p.requirements || []).find(r => r.kind === 'target');
    const part = earlier && parts.find(p => p.requirements?.includes(earlier));
    if (part) {
      part.effects.unshift({ kind: 'remember-lki', bind: earlier.bind, as: `lki${i}` });
      return { part: { effects: [{ kind: 'saw-in-half', bind: earlier.bind, lki: `lki${i}` }], requirements: [], unsupported: [] }, consumed: 2 };
    }
  }
  // "Draw two cards. If you have the city's blessing, draw three cards instead." / "If X, instead Y." — the second replaces the first
  // when the condition holds (checked as it resolves).
  const inst = String(clauses[i + 1] || '').match(/^If (.+?), (?:instead (.+?)|(.+?) instead)\.?$/i);
  if (inst && parseConditionAny(inst[1]) && !/^(?:if|then)\b/i.test(c0)) {
    const a = compile(c0, sourceName), b = compile(cap(String(inst[2] || inst[3]).replace(/^only /i, '')), sourceName);
    if (ok(a) && ok(b) && !/\b(?:those|that|it|them)\b/i.test(inst[2] || inst[3])) {
      const cond = parseConditionAny(inst[1]);
      return { part: { effects: [{ kind: 'condition', ...cond, negate: true, skip: a.effects.length }, ...a.effects, { kind: 'condition', ...cond, skip: b.effects.length }, ...b.effects], requirements: [...a.requirements, ...b.requirements], unsupported: [] }, consumed: 2 };
    }
  }
  // Archdruid's Charm: "Search your library for a creature or land card and reveal it. Put it onto the battlefield tapped if it's a land card. Otherwise, put it into your hand." (then shuffle)
  if (/^Search your library for a creature or land card and reveal it\.?$/i.test(c0) && /^Put it onto the battlefield tapped if it'?s a land card\.?$/i.test(String(clauses[i + 1] || '')) && /^Otherwise, put it into your hand\.?$/i.test(String(clauses[i + 2] || ''))) {
    const shuffle = /^Then shuffle\.?$/i.test(String(clauses[i + 3] || ''));
    return { part: { effects: [{ kind: 'search-land-or-hand', bind: `search${i}` }], requirements: [{ kind: 'library-search', bind: `search${i}`, text: 'Search your library for a creature or land card, reveal it, put it into your hand, then shuffle.' }], unsupported: [] }, consumed: shuffle ? 4 : 3 };
  }
  // "Put a +1/+1 counter on target creature you control. It deals damage equal to its power to target creature you don't control." (bite)
  if ((m = c0.match(/^Put (a|an|one|two|three) \+1\/\+1 counters? on target creature you control\.?$/i)) && /^(?:Then )?(?:it|that creature) deals damage equal to its power to (target creature (?:you don'?t control|an opponent controls)|another target creature|target creature or planeswalker you don'?t control)\.?$/i.test(String(clauses[i + 1] || ''))) {
    const requirements = [];
    const a = H.targetRequirement(requirements, 'target creature you control', 'target creature you control');
    const scope = String(clauses[i + 1]).match(/to (target [^.]+?)\.?$/i)[1].toLowerCase();
    const b = H.targetRequirement(requirements, scope.replace(/^another /, ''), scope);
    return { part: { effects: [{ kind: 'counter', bind: a, counter: '+1/+1', amount: num(m[1]) }, { kind: 'damage', bind: b, amount: { kind: 'bound-power', bind: a }, sourceName: 'That creature', fromTarget: true, sourceBind: a }], requirements, unsupported: [] }, consumed: 2 };
  }
  // Return the Favor: "Copy target instant spell, sorcery spell, activated ability, or triggered ability. You may choose new targets for the copy."
  if (/^Copy target instant spell, sorcery spell, activated ability, or triggered ability\.?$/i.test(c0)) {
    const bind = `stack${i}`, more = /^You may choose new targets for the copy\.?$/i.test(String(clauses[i + 1] || ''));
    return { part: { effects: [{ kind: 'copy-stack', bind, retarget: true }], requirements: [{ kind: 'stack-target', bind, scope: 'any', spellFilter: 'instant|sorcery', orAbility: true, label: 'target instant or sorcery spell, or activated or triggered ability' }], unsupported: [] }, consumed: more ? 2 : 1 };
  }
  // Longstalk Brawl: "Put a +1/+1 counter on the creature you control." — the one targeted earlier in the spell.
  if ((m = c0.match(/^Put (a|an|one|two|three|\d+) ([+-]\d+\/[+-]\d+|[a-z]+) counters? on the creature you (control|don'?t control)\.?$/i))) {
    const mine = /^control$/i.test(m[3]);
    const earlier = parts.flatMap(p => p.requirements || []).find(r => r.kind === 'target' && (mine ? /you control/i.test(r.scope) : /you don'?t control|opponent controls/i.test(r.scope)));
    if (earlier) return { part: { effects: [{ kind: 'counter', bind: earlier.bind, counter: m[2], amount: num(m[1]) }], requirements: [], unsupported: [] }, consumed: 1 };
  }
  return null;
}

/** Effect kinds made above. Returns true when handled. */
export function applyB49(game, controllerId, effect, bindings, notes) {
  const controller = playerById(game, controllerId);
  switch (effect.kind) {
    case 'player-hexproof':
      if (effect.colors) { controller.hexproofFrom = { turn: game.turnNumber, colors: effect.colors }; notes.push(`${controller.displayName} has hexproof from ${effect.colors.join(' and ')} until end of turn.`); return true; }
      controller.hexproofTurn = game.turnNumber;
      notes.push(`${controller.displayName} has hexproof until end of turn.`);
      return true;
    case 'mana-extra-turn':
      game.turnManaExtras = [...(game.turnManaExtras || []).filter(x => x.turn === game.turnNumber), { turn: game.turnNumber, controllerId, text: effect.text }];
      notes.push(`Until end of turn: ${effect.text}.`);
      return true;
    case 'hideaway': {
      // Exile the chosen card face down (only its owner may look at it); the rest go to the bottom in a random order.
      const emit = e => H.emit(bindings, e);
      const lib = controller.deck.remainingLibrary || [];
      const top = lib.slice(0, Math.max(0, Number(effect.amount || 0)));
      const pick = top.find(c => c.instanceId === bindings[effect.bind]) || null;
      const src = locateCardInGame(game, bindings.sourceId)?.card;
      if (pick) {
        const moved = moveCard(game, pick.instanceId, 'exile', { onEvent: emit });
        (moved?.card || pick).hiddenExile = true;
        if (src) src.hideawayId = pick.instanceId;
      }
      const rest = top.filter(c => c !== pick);
      for (const c of rest) { const k = lib.indexOf(c); if (k >= 0) lib.splice(k, 1); }
      H.shuffle(rest);
      lib.push(...rest);
      notes.push(`${controller.displayName} exiles a card face down and puts ${rest.length} on the bottom of their library.`);
      return true;
    }
    case 'play-exiled': {
      const id = bindings[effect.bind];
      if (!id) return true;
      const hit = locateCardInGame(game, id);
      if (!hit || hit.zone !== 'exile') { notes.push('The exiled card is gone.'); return true; }
      const def = definitionFor(game, hit.card);
      if (/\bLand\b/.test(def?.typeLine || '') && !/\b(?:Instant|Sorcery|Creature|Artifact|Enchantment|Planeswalker)\b/.test(def?.typeLine || '')) {
        // Playing a land this way uses a land play, so only during your own turn with one left.
        const limit = (game.rulesConfig?.allowExtraLand ? 2 : 1) + Number(controller.counters?.extraLandPlaysThisTurn || 0);
        if (game.activePlayerId !== controllerId || Number(controller.counters?.landsPlayedThisTurn || 0) >= limit) { notes.push(`${def?.name || 'The land'} can't be played now (no land play left).`); return true; }
        moveCard(game, id, 'battlefield', { controllerId, onEvent: e => H.emit(bindings, { ...e, playedLand: true }) });
        controller.counters = controller.counters || {};
        controller.counters.landsPlayedThisTurn = Number(controller.counters.landsPlayedThisTurn || 0) + 1;
        notes.push(`${controller.displayName} plays ${def?.name || 'the land'}.`);
        return true;
      }
      delete hit.card.hiddenExile;
      game.flow = game.flow || {};
      game.flow.freeCast = { playerId: controllerId, instanceId: id };
      notes.push(`${controller.displayName} casts ${def?.name || 'the exiled card'} without paying its mana cost.`);
      return true;
    }
    case 'hideaway-to-hand': {
      const src = locateCardInGame(game, bindings.sourceId)?.card;
      const id = src?.hideawayId || bindings.lastKnownHideaway, hit = id && locateCardInGame(game, id);
      if (!hit || hit.zone !== 'exile') { notes.push('There is no exiled card.'); return true; }
      moveCard(game, id, 'hand', { onEvent: e => H.emit(bindings, e) });
      notes.push(`${nameOf(game, id)} is put into its owner's hand.`);
      return true;
    }
    case 'imprint': {
      const id = [].concat(bindings[effect.bind] || [])[0];
      if (!id || locateCardInGame(game, id)?.zone !== 'hand') { notes.push('No card is exiled.'); return true; }
      moveCard(game, id, 'exile', { onEvent: e => H.emit(bindings, e) });
      const src = locateCardInGame(game, bindings.sourceId)?.card;
      if (src) src.imprintIds = [...(src.imprintIds || []), id];
      notes.push(`${controller.displayName} exiles ${nameOf(game, id)} with ${nameOf(game, bindings.sourceId)}.`);
      return true;
    }
    case 'cast-copy': {
      const src = locateCardInGame(game, bindings.sourceId)?.card;
      const ids = effect.from === 'imprint' ? (src?.imprintIds || []) : [].concat(bindings[effect.bind] || []);
      const live = ids.map(id => locateCardInGame(game, id)).filter(h => h && h.zone === 'exile');
      if (!live.length) { notes.push('There is no exiled card to copy.'); return true; }
      for (const h of live) castCopy(game, controllerId, h.card);
      notes.push(`${controller.displayName} casts a copy of ${live.map(h => definitionFor(game, h.card)?.name).join(', ')} without paying its mana cost.`);
      return true;
    }
    case 'grant-text':
    case 'grant-text-each': {
      const cards = effect.kind === 'grant-text' ? [locateCardInGame(game, H.resolveBoundId(effect, bindings))].filter(h => h?.zone === 'battlefield').map(h => h.card)
        : (controller.deck.battlefield || []).filter(c => cardFitsWords(definitionFor(game, c), effect.filter));
      if (!cards.length) { notes.push('It is no longer on the battlefield.'); return true; }
      for (const card of cards) {
        card.temporaryGrants = [...(card.temporaryGrants || []), ...effect.texts.map(text => ({ text, until: effect.until, turn: game.turnNumber }))];
        card.grantedText = [...(card.grantedText || []), ...effect.texts];
      }
      notes.push(`${cards.length === 1 ? definitionFor(game, cards[0])?.name : `${cards.length} creatures`} gain${cards.length === 1 ? 's' : ''} "${effect.texts.join('" and "')}"${effect.until === 'turn' ? ' until end of turn' : ''}.`);
      return true;
    }
    case 'move-all-counters': {
      const from = locateCardInGame(game, bindings[effect.from] || bindings.sourceId), to = locateCardInGame(game, H.resolveBoundId(effect, bindings));
      if (!from || !to || to.zone !== 'battlefield') { notes.push('Nothing to move.'); return true; }
      let n = 0;
      for (const [k, v] of Object.entries(from.card.counters || {})) if (Number(v) > 0) { H.addCounter(to.card, k, Number(v)); n += Number(v); H.emit(bindings, { type: 'counter-added', sourceId: to.card.instanceId, controllerId: to.card.controllerId, counter: k, amount: Number(v) }); }
      from.card.counters = {};
      notes.push(n ? `${n} counter${n === 1 ? '' : 's'} move${n === 1 ? 's' : ''} to ${definitionFor(game, to.card)?.name}.` : 'There were no counters to move.');
      return true;
    }
    case 'each-top-cast': {
      // Exile from each library (the top card, or down to the first nonland card), then cast the chosen spells free, one by one.
      const emit = e => H.emit(bindings, e);
      const chosen = new Set([].concat(bindings[effect.bind] || []));
      const exiled = [];
      for (const p of (game.players || []).filter(q => !q.eliminated)) {
        const lib = p.deck.remainingLibrary || [];
        const n = effect.mode === 'top' ? Math.min(1, lib.length) : (() => { const k = lib.findIndex(c => !/\bLand\b/.test(definitionFor(game, c)?.typeLine || '')); return k < 0 ? lib.length : k + 1; })();
        for (const c of lib.slice(0, n)) {
          const moved = moveCard(game, c.instanceId, 'exile', { onEvent: emit });
          exiled.push(c.instanceId);
          if (chosen.has(c.instanceId) && p.playerId !== controllerId) {
            // Another player's card: kept with the caster's exiled cards so they can cast it (it still belongs to its owner).
            const at = p.deck.exile.indexOf(moved?.card || c);
            if (at >= 0) { const [x] = p.deck.exile.splice(at, 1); controller.deck.exile.push(x); }
          }
        }
      }
      for (const id of chosen) if (exiled.includes(id)) queueFreeCast(game, { playerId: controllerId, instanceId: id });
      bindings.lastMoved = exiled;
      notes.push(`Exiled: ${exiled.map(id => nameOf(game, id)).join(', ') || 'nothing'}.${chosen.size ? ` ${controller.displayName} casts ${[...chosen].map(id => nameOf(game, id)).join(', ')} without paying their mana costs.` : ''}`);
      return true;
    }
    case 'braids': {
      const pick = bindings[effect.bind] || {};
      const emit = e => H.emit(bindings, e);
      const sac = id => { const h = locateCardInGame(game, id); if (!h || h.zone !== 'battlefield') return false; const who = playerById(game, h.card.controllerId)?.displayName; moveCard(game, id, 'graveyard', { moveReason: 'sacrifice', onEvent: emit }); notes.push(`${who} sacrifices ${nameOf(game, id)}.`); return true; };
      if (!pick.mine || !sac(pick.mine)) { notes.push(`${controller.displayName} doesn't sacrifice a permanent.`); return true; }
      for (const [pid, id] of Object.entries(pick.theirs || {})) {
        if (id && sac(id)) continue;
        const p = playerById(game, pid);
        if (!p) continue;
        H.applyEffectsUnsafe(game, pid, [{ kind: 'life', scope: 'you', amount: effect.loss, deltaSign: -1 }], bindings);
        H.applyEffectsUnsafe(game, controllerId, [{ kind: 'draw', scope: 'you', amount: 1 }], bindings);
        notes.push(`${p.displayName} doesn't sacrifice: they lose ${effect.loss} life and ${controller.displayName} draws a card.`);
      }
      return true;
    }
    case 'copy-self': {
      // The spell is resolving (already off the stack): its copy goes on the stack and resolves after it.
      const obj = game.__resolvingFull;
      if (!obj || obj.id !== bindings.selfStackId) { notes.push('The spell can no longer be copied.'); return true; }
      const copy = structuredClone(obj);
      copy.id = `stack-copy:${Date.now()}:${Math.random()}`;
      copy.kind = 'spell-copy'; copy.isCopy = true; copy.controllerId = controllerId; copy.retarget = !!effect.retarget;
      if (copy.card) copy.card = { ...copy.card, instanceId: `copy:${copy.card.instanceId}:${Date.now()}`, token: true, zone: 'stack' };
      // The copy can't copy itself again: its "cast from a graveyard" check fails (it wasn't cast).
      copy.fromZone = null;
      game.stack.push(copy);
      notes.push(`${controller.displayName} copies ${obj.label || 'the spell'}.`);
      return true;
    }
    case 'shuffle-hand-graveyard': {
      const lib = controller.deck.remainingLibrary;
      const moved = [...controller.deck.hand.splice(0), ...controller.deck.graveyard.splice(0)];
      for (const c of moved) { c.zone = 'library'; lib.push(c); }
      H.shuffle(lib);
      notes.push(`${controller.displayName} shuffles ${moved.length} card${moved.length === 1 ? '' : 's'} from their hand and graveyard into their library.`);
      return true;
    }
    case 'move-counter': {
      const from = locateCardInGame(game, bindings[effect.fromBind]), to = locateCardInGame(game, H.resolveBoundId(effect, bindings)), k = bindings[effect.kindBind];
      if (!from || !to || from.zone !== 'battlefield' || to.zone !== 'battlefield' || !k || !(Number(from.card.counters?.[k] || 0) > 0)) { notes.push('No counter is moved.'); return true; }
      from.card.counters[k] = Number(from.card.counters[k]) - 1;
      if (!from.card.counters[k]) delete from.card.counters[k];
      H.addCounter(to.card, k, 1);
      H.emit(bindings, { type: 'counter-added', sourceId: to.card.instanceId, controllerId: to.card.controllerId, counter: k, amount: 1 });
      notes.push(`A ${k} counter moves from ${definitionFor(game, from.card)?.name} to ${definitionFor(game, to.card)?.name}.`);
      return true;
    }
    case 'spread-counters': {
      const src = locateCardInGame(game, bindings.sourceId);
      const plan = bindings[effect.bind] || {};
      for (const [id, n0] of Object.entries(plan)) {
        const n = Math.min(Number(n0 || 0), Number(src?.card?.counters?.['+1/+1'] || 0));
        const to = locateCardInGame(game, id);
        if (!src || !to || to.zone !== 'battlefield' || n <= 0) continue;
        src.card.counters['+1/+1'] -= n;
        if (!src.card.counters['+1/+1']) delete src.card.counters['+1/+1'];
        H.addCounter(to.card, '+1/+1', n);
        H.emit(bindings, { type: 'counter-added', sourceId: to.card.instanceId, controllerId: to.card.controllerId, counter: '+1/+1', amount: n });
        notes.push(`${n} +1/+1 counter${n === 1 ? '' : 's'} move${n === 1 ? 's' : ''} to ${definitionFor(game, to.card)?.name}.`);
      }
      return true;
    }
    case 'per-moved-controller': {
      for (const was of bindings.movedThisWayCards || []) if (playerById(game, was.controllerId)) notes.push(...H.applyEffectsUnsafe(game, was.controllerId, effect.effects, bindings));
      return true;
    }
    case 'each-id': {
      const ids = [].concat(bindings[effect.bind] || []);
      if (!ids.length) { notes.push('No targets were chosen.'); return true; }
      for (const id of ids) { bindings[effect.innerBind] = id; notes.push(...H.applyEffectsUnsafe(game, controllerId, effect.effects, bindings)); }
      return true;
    }
    case 'next-spell-keyword':
      controller.temporaryPermissions = [...(controller.temporaryPermissions || []), { kind: 'next-spell-keyword', keyword: effect.keyword, noncreature: !!effect.noncreature, expires: 'cleanup' }];
      notes.push(`The next ${effect.noncreature ? 'noncreature ' : ''}spell ${controller.displayName} casts this turn has ${effect.keyword}.`);
      return true;
    case 'counter-event-spell': {
      if (!(game.stack || []).some(x => x.id === bindings.eventStackId)) { notes.push('That spell is no longer on the stack.'); return true; }
      notes.push(...H.applyEffectsUnsafe(game, controllerId, [{ kind: 'counter-spell', stackId: bindings.eventStackId }], bindings));
      return true;
    }
    case 'self-library-nth':
      game.spellLibraryNth = { id: bindings.sourceId, n: effect.n };
      notes.push(`${nameOf(game, bindings.sourceId)} goes into its owner's library ${effect.n === 7 ? 'seventh' : `#${effect.n}`} from the top.`);
      return true;
    case 'torment': {
      // Each round, in order: what each opponent chose (sacrifice, discard, or lose life).
      const emit = e => H.emit(bindings, e);
      for (const step of bindings[effect.bind] || []) {
        const p = playerById(game, step.playerId);
        if (!p || p.eliminated) continue;
        const h = step.id && locateCardInGame(game, step.id);
        if (step.do === 'sacrifice' && h?.zone === 'battlefield') { moveCard(game, step.id, 'graveyard', { moveReason: 'sacrifice', onEvent: emit }); notes.push(`${p.displayName} sacrifices ${nameOf(game, step.id)}.`); continue; }
        if (step.do === 'discard' && h?.zone === 'hand') { moveCard(game, step.id, 'graveyard', { onEvent: emit }); emit({ type: 'discard', playerId: p.playerId, sourceId: step.id }); notes.push(`${p.displayName} discards ${nameOf(game, step.id)}.`); continue; }
        notes.push(...H.applyEffectsUnsafe(game, p.playerId, [{ kind: 'life', scope: 'you', amount: effect.loss, deltaSign: -1 }], bindings));
      }
      return true;
    }
    case 'keep-each-type': {
      const keep = bindings[effect.bind] || {};
      const emit = e => H.emit(bindings, e);
      for (const [pid, ids] of Object.entries(keep)) {
        const p = playerById(game, pid);
        if (!p) continue;
        const gone = (p.deck.battlefield || []).filter(c => !ids.includes(c.instanceId)).map(c => c.instanceId);
        for (const id of gone) moveCard(game, id, 'graveyard', { moveReason: 'sacrifice', onEvent: emit });
        notes.push(`${p.displayName} keeps ${ids.map(id => nameOf(game, id)).join(', ') || 'nothing'} and sacrifices ${gone.length} permanent${gone.length === 1 ? '' : 's'}.`);
      }
      return true;
    }
    case 'consultation': {
      const emit = e => H.emit(bindings, e);
      const lib = controller.deck.remainingLibrary || [];
      const want = String(bindings[effect.bind] || '').trim().toLowerCase();
      for (const c of lib.slice(0, effect.skipTop)) moveCard(game, c.instanceId, 'exile', { onEvent: emit });
      const rest = [...lib];
      const k = rest.findIndex(c => String(definitionFor(game, c)?.name || '').toLowerCase() === want);
      const revealed = k < 0 ? rest : rest.slice(0, k + 1);
      for (const c of revealed) moveCard(game, c.instanceId, c === rest[k] ? 'hand' : 'exile', { onEvent: emit });
      notes.push(k < 0 ? `${controller.displayName} reveals their whole library and finds no "${bindings[effect.bind]}"; it is all exiled.` : `${controller.displayName} finds ${definitionFor(game, rest[k])?.name} after ${k} other card${k === 1 ? '' : 's'} and puts it into their hand.`);
      return true;
    }
    case 'tainted-pact': {
      const emit = e => H.emit(bindings, e);
      const r = bindings[effect.bind] || { count: 0, take: null };
      const ids = (controller.deck.remainingLibrary || []).slice(0, r.count).map(c => c.instanceId);
      for (const id of ids) moveCard(game, id, id === r.take ? 'hand' : 'exile', { onEvent: emit });
      notes.push(`${controller.displayName} exiles ${ids.length - (r.take ? 1 : 0)} card${ids.length - (r.take ? 1 : 0) === 1 ? '' : 's'}${r.take ? ` and puts ${nameOf(game, r.take)} into their hand` : ''}.`);
      return true;
    }
    case 'exile-graveyard-filter': {
      const ids = (controller.deck.graveyard || []).filter(c => c.instanceId !== bindings.sourceId && cardFitsWords(definitionFor(game, c), effect.filter)).map(c => c.instanceId);
      for (const id of ids) moveCard(game, id, 'exile', { onEvent: e => H.emit(bindings, e) });
      bindings.lastMoved = ids;
      notes.push(`${controller.displayName} exiles ${ids.length} card${ids.length === 1 ? '' : 's'} from their graveyard.`);
      return true;
    }
    case 'hearth-and-home': {
      const emit = e => H.emit(bindings, e);
      const id = H.resolveBoundId(effect, bindings), hit = id && locateCardInGame(game, id);
      const land = [].concat(bindings[effect.searchBind] || [])[0];
      if (hit?.zone === 'battlefield') { moveCard(game, id, 'exile', { onEvent: emit }); moveCard(game, id, 'battlefield', { controllerId, onEvent: emit }); notes.push(`${nameOf(game, id)} is exiled and returns under ${controller.displayName}'s control.`); }
      if (land && ['library', 'remainingLibrary'].includes(locateCardInGame(game, land)?.zone)) { moveCard(game, land, 'battlefield', { controllerId, onEvent: emit }); notes.push(`${controller.displayName} puts ${nameOf(game, land)} onto the battlefield.`); }
      H.shuffle(controller.deck.remainingLibrary);
      return true;
    }
    case 'battlesphere': {
      const ids = [].concat(bindings[effect.bind] || []).filter(id => locateCardInGame(game, id)?.zone === 'battlefield' && !locateCardInGame(game, id).card.tapped);
      if (!ids.length) { notes.push('No creatures are tapped.'); return true; }
      for (const id of ids) H.setTapped(locateCardInGame(game, id).card, true);
      const x = ids.length;
      notes.push(...H.applyEffectsUnsafe(game, controllerId, [{ kind: 'pump', bind: 'sourceId', power: x, toughness: 0, expires: 'cleanup' }], bindings));
      const atk = (game.combatState?.attackers || []).find(a => a.instanceId === bindings.sourceId);
      const victim = atk ? (atk.targetId || atk.defenderId) : null;
      if (victim) notes.push(...H.applyEffectsUnsafe(game, controllerId, [{ kind: 'damage', amount: x, targetId: victim, sourceName: nameOf(game, bindings.sourceId) }], bindings));
      return true;
    }
    case 'craft-return': {
      const hit = locateCardInGame(game, effect.targetId);
      if (!hit || hit.zone !== 'exile') { notes.push('The card is no longer in exile.'); return true; }
      const owner = hit.card.ownerId || controllerId;
      hit.card.activeFaceIndex = 1;   // transformed as it enters (its back face's enters abilities apply)
      const moved = moveCard(game, effect.targetId, 'battlefield', { controllerId: owner, onEvent: e => H.emit(bindings, e) });
      (moved?.card || hit.card).activeFaceIndex = 1;
      notes.push(`${nameOf(game, effect.targetId)} returns transformed.`);
      return true;
    }
    case 'chain-copy': {
      const pick = bindings[effect.bind] || {};
      if (!pick.land) return true;
      const h = locateCardInGame(game, pick.land);
      if (!h || h.zone !== 'battlefield') return true;
      moveCard(game, pick.land, 'graveyard', { moveReason: 'sacrifice', onEvent: e => H.emit(bindings, e) });
      const who = playerById(game, pick.player);
      notes.push(`${who?.displayName} sacrifices ${nameOf(game, pick.land)}.`);
      // Their copy: they control it and choose its new target.
      return applyB49(game, pick.player, { kind: 'copy-self', retarget: true }, bindings, notes);
    }
    case 'remember-lki': {
      const h = locateCardInGame(game, H.resolveBoundId(effect, bindings));
      if (h?.zone === 'battlefield') bindings[effect.as] = { controllerId: h.card.controllerId, power: effectivePower(h.card, definitionFor(game, h.card), game), toughness: effectiveToughness(h.card, definitionFor(game, h.card), game) };
      return true;
    }
    case 'saw-in-half': {
      const id = H.resolveBoundId(effect, bindings), h = locateCardInGame(game, id), lki = bindings[effect.lki];
      if (!lki || !h || h.zone !== 'graveyard') { notes.push('It did not die, so no tokens are made.'); return true; }
      const d = definitionFor(game, h.card);
      const half = n => String(Math.ceil(Math.max(0, Number(n || 0)) / 2));
      for (let k = 0; k < 2; k++) H.applyEffectsUnsafe(game, lki.controllerId, [{ kind: 'create-token', amount: 1, name: d?.name, typeLine: /^Token\b/.test(d?.typeLine || '') ? d.typeLine : `Token ${d?.typeLine || 'Creature'}`, oracleText: d?.oracleText || '', power: half(lki.power), toughness: half(lki.toughness), keywords: d?.keywords || [], colors: d?.colors || [] }], bindings);
      notes.push(`${playerById(game, lki.controllerId)?.displayName} creates two ${half(lki.power)}/${half(lki.toughness)} copies of ${d?.name}.`);
      return true;
    }
    case 'kodama-put': {
      const id = [].concat(bindings[effect.bind] || [])[0];
      if (!id || locateCardInGame(game, id)?.zone !== 'hand') { notes.push('No card is put onto the battlefield.'); return true; }
      const moved = moveCard(game, id, 'battlefield', { controllerId, onEvent: e => H.emit(bindings, { ...e, ...(e.type === 'enters-battlefield' ? { viaSource: bindings.sourceId } : {}) }) });
      if (moved?.card) moved.card.putBy = bindings.sourceId;
      notes.push(`${controller.displayName} puts ${nameOf(game, id)} onto the battlefield.`);
      return true;
    }
    case 'exile-top-of': {
      const p = playerById(game, bindings[effect.playerBind]);
      const top = p?.deck?.remainingLibrary?.[0];
      if (!top) return true;
      moveCard(game, top.instanceId, 'exile', { onEvent: e => H.emit(bindings, e) });
      notes.push(`${p.displayName} exiles ${nameOf(game, top.instanceId)} from the top of their library.`);
      return true;
    }
    case 'embalm-token': {
      // Embalm: a token copy that's a white Zombie with no mana cost. Eternalize: a 4/4 black Zombie with no mana cost.
      const h = locateCardInGame(game, effect.targetId), d = definitionFor(game, h?.card);
      if (!d) return true;
      const type = String(d.typeLine || 'Creature').replace(/—\s*(.*)$/, (a, sub) => `— Zombie ${sub}`).replace(/^(?!.*—)(.*)$/, '$1 — Zombie');
      H.applyEffectsUnsafe(game, controllerId, [{ kind: 'create-token', amount: 1, name: d.name, typeLine: /^Token\b/.test(type) ? type : `Token ${type}`, oracleText: d.oracleText || '', power: effect.eternalize ? '4' : d.power, toughness: effect.eternalize ? '4' : d.toughness, keywords: d.keywords || [], colors: effect.eternalize ? ['B'] : ['W'] }], bindings);
      notes.push(`${controller.displayName} creates a token copy of ${d.name}${effect.eternalize ? ' (a 4/4 black Zombie)' : ' (a white Zombie)'}.`);
      return true;
    }
    case 'myriad': {
      const src = locateCardInGame(game, bindings.sourceId);
      if (!src || src.zone !== 'battlefield') return true;
      const cs = game.combatState;
      for (const pid of effect.defenders) {
        // "You may create" — made for each opponent still in the game.
        H.applyEffectsUnsafe(game, controllerId, [{ kind: 'copy-token', targetId: src.card.instanceId, tapped: true }], bindings);
        const id = (bindings.lastCreated || []).slice(-1)[0], tok = id && locateCardInGame(game, id)?.card;
        if (!tok) continue;
        tok.exileEndCombat = true;
        if (cs && Array.isArray(cs.attackers)) { cs.attackers.push({ playerId: controllerId, instanceId: id, defenderId: pid, targetId: null, blocksConfirmed: false }); if (!(cs.defenders || []).includes(pid)) cs.defenders = [...(cs.defenders || []), pid]; tok.attacking = pid; tok.attackedTurn = game.turnNumber; }
        notes.push(`A token copy of ${nameOf(game, src.card.instanceId)} attacks ${playerById(game, pid)?.displayName}.`);
      }
      return true;
    }
    case 'unattach-self': {
      const h = locateCardInGame(game, bindings.sourceId);
      if (h?.zone === 'battlefield' && h.card.attachedTo) { const host = locateCardInGame(game, h.card.attachedTo); if (host?.card?.attachments) host.card.attachments = host.card.attachments.filter(x => x !== h.card.instanceId); h.card.attachedTo = null; notes.push(`${nameOf(game, bindings.sourceId)} becomes unattached.`); }
      return true;
    }
    case 'enlist': {
      const id = [].concat(bindings[effect.bind] || [])[0], h = id && locateCardInGame(game, id);
      if (!h || h.zone !== 'battlefield' || h.card.tapped) { notes.push('No creature is enlisted.'); return true; }
      H.setTapped(h.card, true);
      const p = Math.max(0, effectivePower(h.card, definitionFor(game, h.card), game));
      notes.push(...H.applyEffectsUnsafe(game, controllerId, [{ kind: 'pump', bind: 'sourceId', power: p, toughness: 0, expires: 'cleanup' }], bindings));
      return true;
    }
    case 'champion': {
      const id = [].concat(bindings[effect.bind] || [])[0], src = locateCardInGame(game, bindings.sourceId);
      const h = id && locateCardInGame(game, id);
      if (!h || h.zone !== 'battlefield') {
        if (src?.zone === 'battlefield') { moveCard(game, bindings.sourceId, 'graveyard', { moveReason: 'sacrifice', onEvent: e => H.emit(bindings, e) }); notes.push(`${nameOf(game, bindings.sourceId)} is sacrificed (nothing to champion).`); }
        return true;
      }
      moveCard(game, id, 'exile', { onEvent: e => H.emit(bindings, e) });
      if (src?.zone === 'battlefield') src.card.championedId = id;
      notes.push(`${nameOf(game, bindings.sourceId)} champions ${nameOf(game, id)}.`);
      return true;
    }
    case 'champion-return': {
      const h = locateCardInGame(game, effect.id);
      if (!h || h.zone !== 'exile') return true;
      moveCard(game, effect.id, 'battlefield', { controllerId: h.card.ownerId, onEvent: e => H.emit(bindings, e) });
      notes.push(`${nameOf(game, effect.id)} returns to the battlefield.`);
      return true;
    }
    case 'become-copy': {
      const src = locateCardInGame(game, bindings.sourceId), t = locateCardInGame(game, H.resolveBoundId(effect, bindings));
      if (!src || src.zone !== 'battlefield' || !t) { notes.push('Nothing is copied.'); return true; }
      if (effect.mvX && Number(definitionFor(game, t.card)?.manaValue ?? 0) !== Number(bindings.X || 0)) { notes.push('That artifact does not have mana value X.'); return true; }
      // "except it has this ability": keep the ability that made the copy.
      const keep = effect.keepAbility ? String(game.cardDefinitions?.[src.card.definitionId]?.oracleText || '').split('\n').find(l => /becomes a copy of/i.test(l)) : null;
      src.card.copyOf = { definitionId: t.card.copyOf?.definitionId || t.card.definitionId, keep, until: effect.until, turn: game.turnNumber };
      notes.push(`${game.cardDefinitions?.[src.card.definitionId]?.name} becomes a copy of ${definitionFor(game, t.card)?.name}${effect.until === 'turn' ? ' until end of turn' : ''}.`);
      return true;
    }
    case 'draw-per-opponent-drew': {
      // The opponents drew with the earlier sentence; each who could draw a card counts.
      const n = (game.players || []).filter(p => !p.eliminated && p.playerId !== controllerId).length;
      notes.push(...H.applyEffectsUnsafe(game, controllerId, [{ kind: 'draw', scope: 'you', amount: n }], bindings));
      return true;
    }
    case 'search-land-or-hand': {
      const id = [].concat(bindings[effect.bind] || [])[0];
      const h = id && locateCardInGame(game, id);
      if (h && ['library', 'remainingLibrary'].includes(h.zone)) {
        const land = /\bLand\b/.test(definitionFor(game, h.card)?.typeLine || '');
        moveCard(game, id, land ? 'battlefield' : 'hand', { controllerId, tapped: land, onEvent: e => H.emit(bindings, e) });
        notes.push(`${controller.displayName} reveals ${nameOf(game, id)} and puts it ${land ? 'onto the battlefield tapped' : 'into their hand'}.`);
      }
      H.shuffle(controller.deck.remainingLibrary);
      return true;
    }
    case 'living-weapon': {
      // Create a 0/0 black Phyrexian Germ, then attach this Equipment to it.
      H.applyEffectsUnsafe(game, controllerId, [{ kind: 'create-token', amount: 1, name: 'Phyrexian Germ', typeLine: 'Token Creature — Phyrexian Germ', oracleText: '', power: '0', toughness: '0', colors: ['B'] }], bindings);
      const germ = (bindings.lastCreated || []).slice(-1)[0];
      const eq = locateCardInGame(game, bindings.sourceId);
      if (germ && eq?.zone === 'battlefield') { eq.card.attachedTo = germ; notes.push(`${nameOf(game, bindings.sourceId)} is attached to a Germ token.`); }
      return true;
    }
    case 'renown': {
      const h = locateCardInGame(game, bindings.sourceId);
      if (!h || h.zone !== 'battlefield' || h.card.renowned) return true;
      H.addCounter(h.card, '+1/+1', effect.amount);
      h.card.renowned = true;
      notes.push(`${nameOf(game, bindings.sourceId)} gets ${effect.amount} +1/+1 counter${effect.amount === 1 ? '' : 's'} and becomes renowned.`);
      return true;
    }
    case 'cast-lock-all':
      game.castLocks = [...(game.castLocks || []).filter(x => x.turn === game.turnNumber), { turn: game.turnNumber, playerIds: game.players.map(p => p.playerId), noncreature: !!effect.noncreature, source: nameOf(game, bindings.sourceId) }];
      notes.push(`Players can't cast ${effect.noncreature ? 'noncreature ' : ''}spells this turn.`);
      return true;
    case 'sacrifice-chosen': {
      const emit = e => H.emit(bindings, e);
      for (const id of [].concat(bindings[effect.bind] || [])) {
        const hit = locateCardInGame(game, id);
        if (!hit || hit.zone !== 'battlefield') continue;
        const who = playerById(game, hit.card.controllerId)?.displayName || 'Its controller';
        moveCard(game, id, 'graveyard', { moveReason: 'sacrifice', onEvent: emit });
        notes.push(`${who} sacrifices ${nameOf(game, id)}.`);
      }
      return true;
    }
    default:
      return false;
  }
}

/** Resolve-time questions for the requirement kinds above. */
export function gatherB49(game, ctx, req, bindings, ask, key, title, base, util) {
  const { player } = ctx;
  if (req.kind === 'b49-greatest') {
    // Each affected player chooses among their own tied creatures.
    const who = req.each ? util.opponentsOf(game, player.playerId) : [playerById(game, bindings[req.playerBind])].filter(Boolean);
    const stat = c => req.stat === 'toughness' ? Number(util.defOf(game, c)?.toughness || 0) : req.stat === 'mana value' ? Number(util.defOf(game, c)?.manaValue ?? 0) : effectivePower(c, util.defOf(game, c), game);
    const picked = [];
    for (const p of who) {
      const rows = (p.deck.battlefield || []).filter(c => cardFitsWords(util.defOf(game, c), req.filter));
      if (!rows.length) continue;
      const top = Math.max(...rows.map(stat)), tied = rows.filter(c => stat(c) === top);
      picked.push(tied.length === 1 ? tied[0].instanceId : ask(`${key}:${p.playerId}`, () => ({ ...base, playerId: p.playerId, cancellable: false, kind: 'choose-one', title, prompt: `Sacrifice a ${req.filter} with the greatest ${req.stat} (${top}).`, options: tied.map(c => util.cardOption(game, c, p)) })));
    }
    bindings[req.bind] = picked;
    return true;
  }
  if (req.kind === 'b49-imprint-color') {
    const src = locateCardInGame(game, bindings.sourceId)?.card;
    const imp = (src?.imprintIds || []).map(id => locateCardInGame(game, id)).find(h => h?.zone === 'exile');
    const colors = [...new Set(util.defOf(game, imp?.card)?.colors || [])];
    if (!colors.length) throw new Error('The exiled card has no colour, so this adds no mana.');
    bindings[req.bind] = colors.length === 1 ? colors[0] : ask(key, () => ({ ...base, cancellable: false, kind: 'choose-one', title, prompt: 'Choose the mana to add.', options: colors.map(c => ({ id: c, label: c, mana: c })) }));
    return true;
  }
  if (req.kind === 'b49-each-top-cast') {
    // The cards are known before they move (nothing earlier changes the libraries), so the caster picks now.
    const spells = [];
    for (const p of (game.players || []).filter(q => !q.eliminated)) {
      const lib = p.deck.remainingLibrary || [];
      const c = req.mode === 'top' ? lib[0] : lib.find(x => !/\bLand\b/.test(util.defOf(game, x)?.typeLine || ''));
      if (c && !/\bLand\b/.test(util.defOf(game, c)?.typeLine || '')) spells.push({ c, p });
    }
    bindings[req.bind] = spells.length ? ask(key, () => ({ ...base, cancellable: false, kind: 'choose-many', title, prompt: 'Cast any number of these spells without paying their mana costs.', options: spells.map(r => util.cardOption(game, r.c, r.p, `${r.p.displayName}'s library`)), min: 0, max: spells.length })) : [];
    return true;
  }
  if (req.kind === 'b49-braids') {
    const types = ['Artifact', 'Creature', 'Enchantment', 'Land', 'Planeswalker'];
    const typesOf = c => types.filter(t => new RegExp(`\\b${t}\\b`).test(util.defOf(game, c)?.typeLine || ''));
    const mine = (player.deck.battlefield || []).filter(c => typesOf(c).length);
    if (!mine.length) { bindings[req.bind] = {}; return true; }
    const own = ask(`${key}:mine`, () => ({ ...base, cancellable: false, kind: 'choose-one', title, prompt: 'Sacrifice an artifact, creature, enchantment, land or planeswalker?', options: [...(req.optional ? [{ id: 'none', label: 'Don’t sacrifice' }] : []), ...mine.map(c => util.cardOption(game, c, player, typesOf(c).join(' ')))] }));
    if (!own || own === 'none') { bindings[req.bind] = {}; return true; }
    const shared = typesOf(mine.find(c => c.instanceId === own));
    const theirs = {};
    for (const p of util.opponentsOf(game, player.playerId)) {
      const rows = (p.deck.battlefield || []).filter(c => typesOf(c).some(t => shared.includes(t)));
      const v = rows.length ? ask(`${key}:${p.playerId}`, () => ({ ...base, playerId: p.playerId, cancellable: false, kind: 'choose-one', title, prompt: `Sacrifice a ${shared.join(' or ').toLowerCase()}, or lose 2 life and ${player.displayName} draws a card.`, options: [{ id: 'none', label: 'Don’t sacrifice' }, ...rows.map(c => util.cardOption(game, c, p, typesOf(c).join(' ')))] })) : 'none';
      theirs[p.playerId] = v && v !== 'none' ? v : null;
    }
    bindings[req.bind] = { mine: own, theirs };
    return true;
  }
  if (req.kind === 'b49-grave-lesser') {
    const ev = locateCardInGame(game, bindings.eventCard)?.card;
    const mv = Number(util.defOf(game, ev)?.manaValue ?? 0);
    const rows = (player.deck.graveyard || []).filter(c => c.instanceId !== bindings.eventCard && cardFitsWords(util.defOf(game, c), req.filter) && Number(util.defOf(game, c)?.manaValue ?? 0) < mv);
    bindings[req.bind] = rows.length ? ask(key, () => ({ ...base, cancellable: false, kind: 'choose-one', targeting: true, title, prompt: `Choose a target ${req.label} (less than ${mv}).`, options: rows.map(c => util.cardOption(game, c, player, util.defOf(game, c)?.typeLine || '')) })) : null;
    return true;
  }
  if (req.kind === 'b49-they-may') {
    const pid = bindings[req.playerBind], p = playerById(game, pid);
    bindings[req.bind] = false;
    if (!p) return true;
    if (req.biggest) {
      const ev = locateCardInGame(game, bindings.eventCard)?.card;
      const all = (game.players || []).flatMap(q => q.deck?.battlefield || []).filter(c => /\bCreature\b/.test(util.defOf(game, c)?.typeLine || ''));
      const pw = c => effectivePower(c, util.defOf(game, c), game);
      if (!ev || !all.includes(ev) || !all.filter(c => c !== ev).every(c => pw(ev) > pw(c))) return true;   // not the biggest: nothing to ask
    }
    const v = ask(key, () => ({ ...base, playerId: p.playerId, cancellable: false, kind: 'choose-one', title, prompt: req.label, options: [{ id: 'yes', label: 'Yes' }, { id: 'no', label: 'No' }] }));
    bindings[req.bind] = v === 'yes';
    return true;
  }
  if (req.kind === 'b49-counter-kind') {
    const from = locateCardInGame(game, bindings[req.fromBind])?.card;
    const kinds = Object.entries(from?.counters || {}).filter(([, v]) => Number(v) > 0).map(([k]) => k);
    bindings[req.bind] = kinds.length <= 1 ? kinds[0] || null : ask(key, () => ({ ...base, cancellable: false, kind: 'choose-one', title, prompt: 'Choose the kind of counter to move.', options: kinds.map(k => ({ id: k, label: `${k} counter` })) }));
    return true;
  }
  if (req.kind === 'b49-spread-counters') {
    const src = locateCardInGame(game, bindings.sourceId)?.card;
    let left = Number(src?.counters?.['+1/+1'] || 0);
    const plan = {};
    const others = (game.players || []).flatMap(q => (q.deck?.battlefield || []).map(c => ({ c, q }))).filter(x => x.c.instanceId !== bindings.sourceId && /\bCreature\b/.test(util.defOf(game, x.c)?.typeLine || ''));
    if (left > 0 && others.length) {
      const picked = [].concat(ask(`${key}:who`, () => ({ ...base, cancellable: false, kind: 'choose-many', title, prompt: `Choose creatures to move +1/+1 counters onto (${left} available), or none.`, options: others.map(x => util.cardOption(game, x.c, x.q)), min: 0, max: others.length })) || []);
      for (const id of picked) {
        if (left <= 0) break;
        const n = ask(`${key}:${id}`, () => ({ ...base, cancellable: false, kind: 'number', title, prompt: `How many +1/+1 counters onto ${util.defOf(game, others.find(x => x.c.instanceId === id)?.c)?.name}? (${left} left)`, min: 0, max: left }));
        plan[id] = Number(n || 0); left -= Number(n || 0);
      }
    }
    bindings[req.bind] = plan;
    return true;
  }
  if (req.kind === 'b49-torment') {
    const rounds = Math.max(0, Number(bindings.X || 0)), steps = [], used = new Set();
    let lifeLeft = Object.fromEntries((game.players || []).map(p => [p.playerId, Number(p.life || 0)]));
    for (let r = 0; r < rounds; r++) for (const p of util.opponentsOf(game, player.playerId)) {
      if (lifeLeft[p.playerId] <= 0) continue;
      const perms = (p.deck.battlefield || []).filter(c => !used.has(c.instanceId) && !/\bLand\b/.test(util.defOf(game, c)?.typeLine || ''));
      const hand = (p.deck.hand || []).filter(c => !used.has(c.instanceId));
      const v = (perms.length || hand.length) ? ask(`${key}:${r}:${p.playerId}`, () => ({ ...base, playerId: p.playerId, cancellable: false, private: true, kind: 'choose-one', title: `${title} (${r + 1} of ${rounds})`, prompt: `Lose ${req.loss} life, or sacrifice a nonland permanent, or discard a card.`,
        options: [{ id: 'life', label: `Lose ${req.loss} life` }, ...perms.map(c => ({ ...util.cardOption(game, c, p, 'Sacrifice'), id: `s:${c.instanceId}` })), ...hand.map(c => ({ ...util.cardOption(game, c, p, 'Discard'), id: `d:${c.instanceId}` }))] })) : 'life';
      if (v === 'life' || !v) { steps.push({ playerId: p.playerId, do: 'life' }); lifeLeft[p.playerId] -= req.loss; continue; }
      const id = String(v).slice(2);
      used.add(id);
      steps.push({ playerId: p.playerId, do: String(v).startsWith('s:') ? 'sacrifice' : 'discard', id });
    }
    bindings[req.bind] = steps;
    return true;
  }
  if (req.kind === 'b49-keep-each-type') {
    const types = ['Artifact', 'Creature', 'Enchantment', 'Land', 'Planeswalker', 'Battle'];
    const keep = {};
    const who = req.who === 'opponents' ? util.opponentsOf(game, player.playerId) : (game.players || []).filter(q => !q.eliminated);
    for (const p of who) {
      const kept = new Set();
      for (const type of types) {
        const rows = (p.deck.battlefield || []).filter(c => new RegExp(`\\b${type}\\b`).test(util.defOf(game, c)?.typeLine || ''));
        if (!rows.length) continue;
        if (rows.some(c => kept.has(c.instanceId)) && rows.length === 1) continue;
        const v = rows.length === 1 ? rows[0].instanceId : ask(`${key}:${p.playerId}:${type}`, () => ({ ...base, playerId: p.playerId, cancellable: false, kind: 'choose-one', title, prompt: `Choose a ${type.toLowerCase()} to keep; the rest of your permanents are sacrificed.`, options: rows.map(c => util.cardOption(game, c, p, util.defOf(game, c)?.typeLine || '')) }));
        if (v) kept.add(v);
      }
      keep[p.playerId] = [...kept];
    }
    bindings[req.bind] = keep;
    return true;
  }
  if (req.kind === 'b49-card-name') {
    bindings[req.bind] = ask(key, () => ({ ...base, cancellable: false, private: true, kind: 'text', title, prompt: 'Name a card.' }));
    return true;
  }
  if (req.kind === 'b49-tainted-pact') {
    // Walk the library as the cards would be exiled: stop at a repeated name or when the player keeps one.
    const lib = player.deck.remainingLibrary || [], seen = new Set();
    let count = 0, take = null;
    for (const c of lib) {
      const name = util.defOf(game, c)?.name || '';
      count++;
      if (seen.has(name)) break;
      seen.add(name);
      const v = ask(`${key}:${count}`, () => ({ ...base, cancellable: false, private: true, kind: 'choose-one', title, prompt: `You exile ${name}. Put it into your hand (and stop)?`, options: [{ id: 'take', label: `Put ${name} into your hand` }, { id: 'next', label: 'Exile it and continue' }] }));
      if (v === 'take') { take = c.instanceId; break; }
    }
    bindings[req.bind] = { count, take };
    return true;
  }
  if (req.kind === 'b49-tap-x') {
    const rows = (player.deck.battlefield || []).filter(c => !c.tapped && c.instanceId !== bindings.sourceId && new RegExp(`\\b${req.type}\\b`).test(util.defOf(game, c)?.typeLine || ''));
    bindings[req.bind] = rows.length ? ask(key, () => ({ ...base, cancellable: false, kind: 'choose-many', title, prompt: `Tap any number of untapped ${req.type} you control (X is the number tapped).`, options: rows.map(c => util.cardOption(game, c, player)), min: 0, max: rows.length })) : [];
    return true;
  }
  if (req.kind === 'b49-chain') {
    const t = locateCardInGame(game, bindings[req.targetBind]);
    const p = t?.zone === 'battlefield' ? playerById(game, t.card.controllerId) : null;
    bindings[req.bind] = {};
    if (!p) return true;
    const lands = (p.deck.battlefield || []).filter(c => /\bLand\b/.test(util.defOf(game, c)?.typeLine || ''));
    if (!lands.length) return true;
    const v = ask(`${key}:${p.playerId}`, () => ({ ...base, playerId: p.playerId, cancellable: false, kind: 'choose-one', title, prompt: 'You may sacrifice a land to copy this spell (choosing a new target).', options: [{ id: 'none', label: 'Don’t sacrifice' }, ...lands.map(c => util.cardOption(game, c, p))] }));
    bindings[req.bind] = v && v !== 'none' ? { player: p.playerId, land: v } : {};
    return true;
  }
  if (req.kind === 'b49-distinct-mv') {
    const x = Number(bindings.X || 0);
    const mv = c => Number(util.defOf(game, c)?.manaValue ?? 0);
    const rows = (player.deck.graveyard || []).filter(c => cardFitsWords(util.defOf(game, c), req.filter) && mv(c) <= x);
    const picked = rows.length ? [].concat(ask(key, () => ({ ...base, cancellable: false, kind: 'choose-many', targeting: true, title, prompt: `Choose any number of creature cards with mana value ${x} or less, each with a different mana value.`, options: rows.map(c => util.cardOption(game, c, player, `mana value ${mv(c)}`)), min: 0, max: rows.length })) || []) : [];
    const seenMv = new Set(), keep = [];
    for (const id of picked) { const c = rows.find(r => r.instanceId === id); if (c && !seenMv.has(mv(c))) { seenMv.add(mv(c)); keep.push(id); } }
    bindings[req.bind] = keep;
    return true;
  }
  if (req.kind === 'b49-kodama') {
    // Not for a permanent this ability put onto the battlefield; a card with mana value up to the one that entered.
    const ev = locateCardInGame(game, bindings.eventCard)?.card;
    bindings[req.bind] = [];
    if (!ev || ev.putBy === bindings.sourceId) return true;
    const max = Number(util.defOf(game, ev)?.manaValue ?? 0);
    const rows = (player.deck.hand || []).filter(c => !/\b(?:Instant|Sorcery)\b/.test(util.defOf(game, c)?.typeLine || '') && Number(util.defOf(game, c)?.manaValue ?? 0) <= max);
    bindings[req.bind] = rows.length ? [].concat(ask(key, () => ({ ...base, cancellable: false, private: true, kind: 'choose-many', title, prompt: `You may put a permanent card with mana value ${max} or less from your hand onto the battlefield.`, options: rows.map(c => util.cardOption(game, c, player, util.defOf(game, c)?.typeLine || '')), min: 0, max: 1 })) || []) : [];
    return true;
  }
  if (req.kind === 'b49-enlist') {
    const attacking = new Set((game.combatState?.attackers || []).map(a => a.instanceId));
    const sick = c => Number(c.controlSinceTurn ?? c.enteredTurn ?? -1) >= Number(game.turnNumber) && !/\bHaste\b/i.test(util.defOf(game, c)?.oracleText || '');
    const rows = (player.deck.battlefield || []).filter(c => c.instanceId !== bindings.sourceId && !c.tapped && !attacking.has(c.instanceId) && /\bCreature\b/.test(util.defOf(game, c)?.typeLine || '') && !sick(c));
    bindings[req.bind] = rows.length ? [].concat(ask(key, () => ({ ...base, cancellable: false, kind: 'choose-many', title, prompt: 'Enlist: you may tap a nonattacking creature you control (its power is added to this creature\'s).', options: rows.map(c => util.cardOption(game, c, player, `power ${effectivePower(c, util.defOf(game, c), game)}`)), min: 0, max: 1 })) || []) : [];
    return true;
  }
  if (req.kind === 'b49-champion') {
    const rows = (player.deck.battlefield || []).filter(c => c.instanceId !== bindings.sourceId && (new RegExp(`\\b${req.type}\\b`, 'i').test(util.defOf(game, c)?.typeLine || '') || (/^creature$/i.test(req.type) === false && /\bChangeling\b/.test(util.defOf(game, c)?.oracleText || ''))));
    bindings[req.bind] = rows.length ? [].concat(ask(key, () => ({ ...base, cancellable: false, kind: 'choose-many', title, prompt: `Exile another ${req.type} you control, or choose none and sacrifice this.`, options: rows.map(c => util.cardOption(game, c, player)), min: 0, max: 1 })) || []) : [];
    return true;
  }
  if (req.kind === 'b49-defender-creature') {
    const def = playerById(game, bindings.eventDefender);
    const rows = (def?.deck?.battlefield || []).filter(c => /\bCreature\b/.test(util.defOf(game, c)?.typeLine || ''));
    const v = rows.length ? ask(key, () => ({ ...base, cancellable: false, kind: 'choose-one', targeting: true, title, prompt: 'Provoke: choose a creature the defending player controls (it untaps and must block), or none.', options: [{ id: 'none', label: 'None' }, ...rows.map(c => util.cardOption(game, c, def))] })) : 'none';
    bindings[req.bind] = v && v !== 'none' ? v : null;
    return true;
  }
  if (req.kind === 'b49-hand-pick') {
    const rows = (player.deck.hand || []).filter(c => c.instanceId !== bindings.sourceId && cardFitsWords(util.defOf(game, c), req.filter));
    bindings[req.bind] = rows.length ? ask(key, () => ({ ...base, cancellable: false, private: true, kind: 'choose-many', title, prompt: `Choose a ${req.label}${req.min ? '' : ' (or none)'}.`, options: rows.map(c => util.cardOption(game, c, player, util.defOf(game, c)?.typeLine || '')), min: Math.min(req.min || 0, 1), max: 1 })) : [];
    return true;
  }
  if (req.kind === 'b49-hideaway') {
    const top = (player.deck.remainingLibrary || []).slice(0, Number(req.amount || 0));
    bindings[req.bind] = top.length ? ask(key, () => ({ ...base, cancellable: false, private: true, kind: 'choose-one', title: `${ctx.sourceName} — hideaway`, prompt: `Look at the top ${top.length} cards. Choose one to exile face down; the rest go on the bottom in a random order.`, options: top.map(c => util.cardOption(game, c, player, util.defOf(game, c)?.typeLine || '')) })) : null;
    return true;
  }
  if (req.kind === 'b49-play-exiled') {
    const src = locateCardInGame(game, bindings.sourceId)?.card;
    const id = src?.hideawayId, hit = id && locateCardInGame(game, id);
    bindings[req.bind] = null;
    if (!hit || hit.zone !== 'exile') return true;
    if (req.cond && !checkCondition(game, player.playerId, req.cond, bindings)) return true;   // the condition isn't met: nothing to ask
    const name = util.defOf(game, hit.card)?.name || 'the exiled card';
    if (!req.ask) { bindings[req.bind] = id; return true; }
    const yes = ask(key, () => ({ ...base, cancellable: false, kind: 'choose-one', title: `${ctx.sourceName} — the exiled card`, prompt: `${req.castOnly ? 'Cast' : 'Play'} ${name} without paying its mana cost?`, options: [{ id: 'yes', label: `${req.castOnly ? 'Cast' : 'Play'} ${name}` }, { id: 'no', label: 'Not now' }] }));
    bindings[req.bind] = yes === 'yes' ? id : null;
    return true;
  }
  return false;
}

/**
 * Cast a copy of a card (Isochron Scepter, Mizzix's Mastery, Spellbinder): the copy is made in its caster's exile and cast
 * without paying its mana cost; it ceases to exist as it resolves or if it isn't cast (sba.js).
 */
export function castCopy(game, controllerId, card) {
  const me = playerById(game, controllerId);
  if (!me || !card) return null;
  const copy = { ...structuredClone(card), instanceId: `copy:${card.instanceId}:${Date.now()}:${Math.random().toString(36).slice(2, 7)}`, zone: 'exile', ownerId: controllerId, controllerId, castCopy: true, token: true };
  delete copy.hiddenExile; delete copy.playPermission;
  me.deck.exile.push(copy);
  queueFreeCast(game, { playerId: controllerId, instanceId: copy.instanceId });
  return copy;
}
/** Free casts wait their turn (Etali, Mizzix's Mastery: several cards cast one after another). */
export function queueFreeCast(game, entry) {
  game.flow = game.flow || {};
  if (!game.flow.freeCast) game.flow.freeCast = entry;
  else game.flow.freeCastQueue = [...(game.flow.freeCastQueue || []), entry];
}

/** "each get +1/+1 and gain flying" → "gets +1/+1 and gains flying"; "to their owners' hands" → "to its owner's hand". */
function singularEach(t) {
  return t.replace(/\beach (get|gain|become|deal|fight|lose|have)\b/gi, (a, v) => `${v}s`).replace(/^(target [^.]*?) (get|gain|become|lose|have) /i, (a, x, v) => `${x} ${v}s `)
    .replace(/\band gain\b/gi, 'and gains').replace(/to their owners'? hands/gi, "to its owner's hand").replace(/^Any number of /i, '').replace(/^target/, 'Target');
}
/** One instruction about a single target, repeated for each of any number of targets. */
function eachTarget(text, scope, requirements, sourceName) {
  const inner = compile(cap(text), sourceName);
  const t = ok(inner) && inner.requirements.filter(r => r.kind === 'target');
  if (!t || t.length !== 1 || inner.requirements.length !== 1) return null;
  const bind = `anyNumber${requirements.length}`;
  requirements.push({ kind: 'multi-target', bind, scope: t[0].scope || scope, min: 0, max: 99, label: `Choose any number of ${String(t[0].scope || scope).replace(/^target /, '')}s` });
  return { kind: 'each-id', bind, innerBind: t[0].bind, effects: inner.effects };
}

/** Is a granted quoted ability one the game runs ("When this creature dies, …", "{T}: …")? */
function grantedUnderstood(q) {
  const t = String(q).trim();
  const trig = t.match(/^(?:When|Whenever|At)\b[^,]*,\s*(.+)$/i);
  const act = t.match(/^[^:"]+:\s*(.+)$/);
  const body = trig ? trig[1] : act ? act[1] : null;
  if (!body) return /^(?:flying|haste|trample|vigilance|lifelink|deathtouch|indestructible|hexproof|first strike|double strike|menace|reach)$/i.test(t);
  const r = H.compileEffectText(body.replace(/^you may /i, m => m).replace(/^You may /, ''), { sourceName: 'this creature' });
  return !!r?.supported;
}

// Conditions read here and checked in effects.js (conditionHolds).
const COUNTS = { a: 1, an: 1, no: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, twenty: 20 };
const cnt = w => COUNTS[String(w).toLowerCase()] ?? Number(w);
export function parseConditionB49(t) {
  let m;
  if (/^(?:it|this creature|this permanent|this spell) was bargained$/i.test(t)) return { test: 'b49-bargained' };
  if (/^you have the city'?s blessing$/i.test(t)) return { test: 'b49-blessing' };
  if (/^its surge cost was paid$/i.test(t)) return { test: 'b49-surged' };
  if (/^tribute wasn'?t paid$/i.test(t)) return { test: 'b49-tribute-unpaid' };
  if (/^it had counters on it$/i.test(t)) return { test: 'b49-event-counters' };
  if (/^no mana was spent to cast it$/i.test(t)) return { test: 'b49-no-mana-spent' };
  if ((m = t.match(/^an opponent has cast an? ((?:white|blue|black|red|green)(?: or (?:white|blue|black|red|green))*) spell this turn$/i))) return { test: 'b49-opp-cast-color', colors: m[1].toLowerCase().split(/ or /).map(w => ({ white: 'W', blue: 'U', black: 'B', red: 'R', green: 'G' }[w])) };
  if (/^that player controls more lands than you$/i.test(t)) return { test: 'b49-event-player-more-lands' };
  if (/^it isn'?t that player'?s turn$/i.test(t)) return { test: 'b49-not-event-players-turn' };
  if (/^(?:SELFNAME|this (?:artifact|creature|permanent)|[A-Z][A-Za-z ,'-]+) has counters on it$/.test(t)) return { test: 'b49-source-counters' };
  if ((m = t.match(/^creatures you control have total power (\w+) or greater$/i))) return { test: 'b49-total-power', min: cnt(m[1]) };
  if ((m = t.match(/^you attacked with (\w+) or more creatures this turn$/i))) return { test: 'b49-attacked-with', min: cnt(m[1]) };
  if ((m = t.match(/^an opponent was dealt (\w+) or more damage this turn$/i))) return { test: 'b49-opp-dealt', min: cnt(m[1]) };
  if ((m = t.match(/^a library has (\w+) or fewer cards in it$/i))) return { test: 'b49-library-small', max: cnt(m[1]) };
  if (/^each player has no cards in hand$/i.test(t)) return { test: 'b49-no-hands' };
  if ((m = t.match(/^you have (\w+) or more cards in hand$/i))) return { test: 'b49-hand', min: cnt(m[1]) };
  if ((m = t.match(/^you control a creature with power (\w+) or greater$/i))) return { test: 'b49-power-at-least', min: cnt(m[1]) };
  if ((m = t.match(/^you control (\w+) or more creatures with different powers$/i))) return { test: 'b49-different-powers', min: cnt(m[1]) };
  return null;
}
export function conditionHoldsB49(game, controllerId, effect, bindings = {}) {
  const me = playerById(game, controllerId);
  const creatures = p => (p?.deck?.battlefield || []).filter(c => /\bCreature\b/.test(definitionFor(game, c)?.typeLine || ''));
  const pow = c => effectivePower(c, definitionFor(game, c), game);
  switch (effect.test) {
    case 'b49-total-power': return creatures(me).reduce((n, c) => n + Math.max(0, pow(c)), 0) >= effect.min;
    case 'b49-attacked-with': { const a = game.attackedWithTurn?.[controllerId]; return !!a && a.turn === game.turnNumber && a.n >= effect.min; }
    case 'b49-opp-dealt': return (game.players || []).some(p => p.playerId !== controllerId && game.damageTakenTurn?.[p.playerId]?.turn === game.turnNumber && game.damageTakenTurn[p.playerId].n >= effect.min);
    case 'b49-library-small': return (game.players || []).some(p => !p.eliminated && (p.deck?.remainingLibrary || []).length <= effect.max);
    case 'b49-no-hands': return (game.players || []).filter(p => !p.eliminated).every(p => !(p.deck?.hand || []).length);
    case 'b49-hand': return (me?.deck?.hand || []).length >= effect.min;
    case 'b49-power-at-least': return creatures(me).some(c => pow(c) >= effect.min);
    case 'b49-different-powers': return new Set(creatures(me).map(pow)).size >= effect.min;
    case 'b49-bound': return !!bindings[effect.bind];
    case 'b49-text-is': return bindings[effect.bind] === effect.value;
    case 'b49-not-source': return !!bindings[effect.bind] && bindings[effect.bind] !== bindings.sourceId;
    case 'b49-event-counters': return Object.values(bindings.eventCounters || {}).some(v => Number(v) > 0);
    case 'b49-source-counters': return Object.values(locateCardInGame(game, bindings.sourceId)?.card?.counters || {}).some(v => Number(v) > 0);
    case 'b49-cast-from-graveyard': return bindings.selfFromZone === 'graveyard' && game.resolvingObj?.kind === 'spell';
    case 'b49-event-player-opponent': return !!bindings.eventPlayer && bindings.eventPlayer !== controllerId;
    case 'b49-event-player-more-lands': { const lands = p => (p?.deck?.battlefield || []).filter(c => /\bLand\b/.test(definitionFor(game, c)?.typeLine || '')).length; return lands(playerById(game, bindings.eventPlayer)) > lands(me); }
    case 'b49-not-event-players-turn': return !!bindings.eventPlayer && game.activePlayerId !== bindings.eventPlayer;
    case 'b49-opp-cast-color': return (game.players || []).some(p => p.playerId !== controllerId && (p.counters?.castThisTurn || []).some(x => (x.colors || []).some(c => effect.colors.includes(c))));
    case 'b49-no-mana-spent': return bindings.eventManaSpent === 0;
    case 'b49-approach': {
      // Cast from hand, and another spell with this name was cast earlier this game (this one is the last entry).
      const list = me?.castNamesGame || [], last = list[list.length - 1];
      return bindings.selfFromZone === 'hand' && list.slice(0, -1).some(x => x.name === effect.name) && !!last;
    }
    case 'b49-cast-in-main': return !!bindings.castInMain;
    case 'b49-last-moved-type': return [].concat(bindings.lastMoved || []).some(id => new RegExp(`\\b${effect.type}\\b`).test(definitionFor(game, locateCardInGame(game, id)?.card)?.typeLine || ''));
    case 'b49-blessing': {
      // An ascend spell gives the blessing as it resolves if you control ten or more permanents.
      if (!me?.citysBlessing && (me?.deck?.battlefield || []).length >= 10 && /(?:^|\n)\s*Ascend\b/i.test(String(definitionFor(game, locateCardInGame(game, bindings.sourceId)?.card)?.oracleText || ''))) me.citysBlessing = true;
      return !!me?.citysBlessing;
    }
    case 'b49-tribute-unpaid': return locateCardInGame(game, bindings.sourceId)?.card?.tributePaid === false;
    case 'b49-surged': return locateCardInGame(game, bindings.sourceId)?.card?.castMode === 'surge';
    case 'b49-bargained': return !!locateCardInGame(game, bindings.sourceId)?.card?.bargained;
    default: return undefined;
  }
}
const parseConditionAny = t => parseCondition(String(t).trim().replace(/\.$/, ''));

export { N, num, cap, compile, ok, nameOf, moveCard, resolveAmount };
