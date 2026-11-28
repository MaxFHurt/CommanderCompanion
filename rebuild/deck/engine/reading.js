// ----- card effects: structured reading of Oracle text -----
// Each sentence (or mode of a modal spell) is read into an effect with its trigger, cost, timing, condition and limits.
// Patterns the reader does not support stay in `unknown`: they are never given an invented role. The Oracle text hash
// (`hash`) marks which text an effect list was read from, so changed text invalidates it.
const NUM = {a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, x: 'X', that: 'X'};
const NONCREATURE_TOKENS =
  /\b(Treasure|Food|Clue|Blood|Map|Powerstone|Gold|Shard|Incubator|Junk|Vibranium|Lander|Mutagen|Role|Walker|Aura)\b token/i;
function oracleHash(s) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h.toString(36);
}
function effectsOf(c) {
  if (!c) return null;
  if (c._fx && c._fxSrc === c.o) return c._fx; // same text object: same reading
  const o0 = (c.o || '').split(' // ')[0],
    hash = oracleHash(o0);
  if (c._fx && c._fx.hash === hash) {
    c._fxSrc = c.o;
    return c._fx;
  }
  const t = frontType(c),
    creature = /Creature/.test(t),
    instant = /Instant/.test(t) || /\bFlash\b/.test(o0),
    out = {hash, effects: [], unknown: [], modal: /Choose (one|two|any number|one or more|up to)/i.test(o0)};
  const haste = /\bhaste\b/i.test(o0),
    push = (kind, x, src) => out.effects.push(Object.assign({kind, text: src.trim().slice(0, 140)}, x));
  // reminder text explains keywords; quoted token abilities are kept (the token's own mana ability matters)
  const body = o0.replace(/\((?![^)]*"\{T\})[^)]*\)/g, '').replace(/[ \t]+/g, ' ');
  const lines = body
    .split(/\n/)
    .flatMap(l => (/^•/.test(l.trim()) ? [l.trim().slice(1).trim()] : l.split(/(?<=\.)\s+(?=[A-Z{])/)))
    .map(x => x.trim())
    .filter(Boolean);
  for (let i = 0; i < lines.length; i++) {
    const s = lines[i],
      next = lines[i + 1] || '',
      n0 = out.effects.length;
    const trig = /^(Whenever|When|At the beginning)/i.test(s)
      ? 'trigger'
      : /^[^"]*:\s/.test(s) && !/^Choose/i.test(s)
        ? 'activated'
        : 'static';
    const cost = trig === 'activated' ? s.slice(0, s.indexOf(':')) : '',
      cond = (/^(Whenever|When|At the beginning of)[^,]*,/i.exec(s) || [''])[0].replace(/,$/, '');
    if (
      /^(Flying|Trample|Haste|Vigilance|Lifelink|Deathtouch|Menace|Reach|First strike|Double strike|Indestructible|Hexproof|Defender|Flash|Ward|Partner|Changeling|Prowess|Convoke|Equip|Enchant|Crew|Affinity|Landfall —$)[^.]*\.?$/i.test(
        s
      ) ||
      /^(Choose one|Choose two|Choose any)/i.test(s)
    )
      continue;
    // mana: "{T}: Add …", quoted token abilities, Treasure; with any restriction on what the mana can cast
    let m;
    if (!/\bTreasure token/i.test(s) && (m = /(\{T\}[^:"]*|[^":]*\{T\}[^:"]*): Add ([^."]*)/i.exec(s))) {
      const syms = m[2].match(/\{[WUBRGC]\}/g) || [],
        any = /any (one )?colou?r|any combination of colou?rs|any type/i.test(m[2]),
        amt = /\bX mana\b|X mana in any/i.test(m[2])
          ? 'X'
          : NUM[(/\b(one|two|three|four|five) mana\b/i.exec(m[2]) || [])[1]] ||
            (/ or /.test(m[2]) ? 1 : Math.max(1, syms.length));
      const rs =
          /can't be spent to cast (a |an )?non(\w+) spell/i.exec(s + ' ' + next) ||
          /Spend this mana only (?:to cast|on) (?:a |an )?(\w+)/i.exec(s + ' ' + next),
        restrict = rs ? (rs[2] || rs[1]).toLowerCase().replace(/s$/, '') : '';
      const token = /create[^"]*token[^"]*"/i.test(s);
      push(
        'mana',
        {
          amount: amt,
          colors: any ? 'WUBRG'.split('') : [...new Set(syms.map(x => x[1]))],
          restrict,
          source: token ? 'token' : creature ? 'creature' : 'permanent',
          sick: creature && !haste && !token,
          cost: m[1].replace(/\{T\}/, '').replace(/^,\s*/, '').trim(),
          tapped: /create a tapped/i.test(s)
        },
        s
      );
    }
    if (/\bTreasure token/i.test(s) && /\bcreates?\b/i.test(s))
      push('mana', {amount: 1, colors: 'WUBRG'.split(''), restrict: '', source: 'treasure', once: true, cond}, s);
    if (
      (m =
        /search your library for (?:up to (\w+) |an? |(\w+) )?([^.]*?)(lands?|Plains|Island|Swamp|Mountain|Forest)( cards?)?[^.]*?(onto the battlefield|into your hand)/i.exec(
          s
        )) &&
      !/creature card/i.test(s)
    ) {
      const n = NUM[(m[1] || m[2] || 'a').toLowerCase()] || 1,
        split = /put one onto the battlefield[^.]*and the other into your hand/i.test(s);
      push(
        'landramp',
        {
          n: split ? 1 : m[6] === 'into your hand' ? 0 : n,
          toHand: split ? 1 : m[6] === 'into your hand' ? n : 0,
          tapped: /tapped/.test(s)
        },
        s
      );
    }
    // card flow: draw (with net, symmetry and condition), filtering (loot, rummage, connive), monarch, top-library play
    m = null;
    if (!/discard (a|one|two) cards?, then draw/i.test(s)) {
      m =
        /\b(you |each player |its controller |target player |that player |each opponent )?(?:may )?draws? (a|an|one|two|three|four|five|six|seven|x|that many|\d+) (?:additional )?cards?|draw cards equal to ([^.,]+)/i.exec(
          s
        );
      if (m && m.index < cond.length) m = null;
    }
    if (m) {
      const who = (m[1] || 'you ').trim(),
        n = m[3] ? 'X' : NUM[(m[2] || '').toLowerCase()] || +m[2] || 'X',
        dis = /then discard (a|an|one|two|three|\d+) cards?/i.exec(s),
        dn = dis ? NUM[dis[1].toLowerCase()] || +dis[1] : 0;
      const symmetric = /^(each player|its controller)$/i.test(who) && !/each opponent/i.test(who);
      if (dn && dn >= (typeof n === 'number' ? n : 99)) push('filter', {n, discard: dn, cond, cost}, s);
      else
        push(
          'draw',
          {
            n,
            who,
            symmetric,
            discard: dn,
            net: typeof n === 'number' ? n - dn : 'X',
            cond,
            cost,
            scale: m[3] ? m[3].trim() : '',
            repeat: trig !== 'static'
          },
          s
        );
    }
    if (/\bconnives?\b/i.test(s)) push('filter', {n: 1, discard: 1, connive: true, cond}, s);
    if (/discard (a|one|two) cards?, then draw/i.test(s)) push('filter', {n: 1, discard: 1, rummage: true, cond, cost}, s);
    if (/you become the monarch/i.test(s)) push('monarch', {cond}, s);
    if (/you take the initiative|take the initiative/i.test(s)) push('initiative', {cond}, s);
    if ((m = /(?:cast|play) ([^.]*?) from the top of your library/i.exec(s)))
      push('topcast', {filter: m[1].replace(/^(the top card of your library if it's an? )/, '').trim()}, s);
    else if (/look at the top card of your library (at )?any time/i.test(s)) push('peek', {}, s);
    if (
      /exile the top (\w+ )?cards? of your library[^.]*\.?/i.test(s) &&
      /(you may (play|cast)|until (the )?end of (your next )?turn)/i.test(s + ' ' + next)
    )
      push('impulse', {cond, cost}, s);
    else if (/exile the top card of your library/i.test(s) && trig === 'activated') push('mill-self', {cost}, s);
    if (
      ROLE_RE.tutor.test(s) &&
      !/onto the battlefield tapped/.test(s) &&
      !/(lands?|Plains|Island|Swamp|Mountain|Forest)( cards?)? [^.]*(onto the battlefield|into your hand)/i.test(s)
    )
      push('tutor', {cond, cost}, s);
    if (/return [^.]*from (your|a) graveyard to (the battlefield|your hand)/i.test(s))
      push('recursion', {to: /battlefield/.test(s) ? 'battlefield' : 'hand', cond, cost}, s);
    // interaction: one target or many, what it hits, and when it can be used
    if (
      (m =
        /(destroy|exile) (x|up to (?:one|two|three|x)|one|two|three)? ?(?:other |another )?target ([^.]*?)(creatures?|permanents?|artifacts?(?: and\/or enchantments?)?|enchantments?|planeswalkers?|lands?)\b/i.exec(
          s
        )) &&
      !/you control/i.test(m[3])
    )
      push(
        'removal',
        {
          how: m[1].toLowerCase(),
          count: (m[2] || 'one').toLowerCase().replace('up to ', ''),
          hits: m[4].toLowerCase(),
          speed: instant || trig === 'activated' ? 'instant' : trig === 'trigger' ? 'trigger' : 'sorcery',
          cond,
          cost
        },
        s
      );
    else if (ROLE_RE.removal.test(s))
      push(
        'removal',
        {
          how: 'other',
          count: 'one',
          hits: '',
          speed: instant || trig === 'activated' ? 'instant' : trig === 'trigger' ? 'trigger' : 'sorcery',
          cond,
          cost
        },
        s
      );
    if (ROLE_RE.wipe.test(s)) push('wipe', {speed: instant ? 'instant' : 'sorcery', cond}, s);
    if (ROLE_RE.counter.test(s)) push('counter', {cond, cost}, s);
    if (ROLE_RE.protect.test(s)) push('protect', {cond, cost}, s);
    // board: team pumps (and who they include), tokens (creature or not), cost reductions, sacrifice outlets
    if ((m = /((?:other |non-?\w+ |\w+ )?)creatures you control get \+(\d+|x)\/\+(\d+|x)/i.exec(s)))
      push('pump', {who: m[1].trim() || 'all', p: m[2], until: /until end of turn/i.test(s) ? 'turn' : 'static', cond}, s);
    if ((m = /creates? ([^.]*?)\btokens?\b([^.]*)/i.exec(s))) {
      const tx = m[0],
        copyCr =
          /copy of (equipped|enchanted|target|another target|that|it|a|each)[^.]*creature|copy of (equipped|enchanted) /i.test(
            tx
          );
      const cr =
        copyCr ||
        (!/\bcopy\b/i.test(m[1]) &&
          (/creature token/i.test(tx) ||
            /\d+\/\d+/.test(tx) ||
            (!NONCREATURE_TOKENS.test(tx) &&
              /\b[A-Z][a-z]+ (?:and \w+ )?tokens?/.test(tx) &&
              !/Treasure|Food|Clue|Vibranium|Map|Blood|Powerstone|Gold/.test(tx))));
      // a token given to someone else (Beast Within, Generous Gift: "its controller creates") is not yours
      const theirs =
        /(its controller|that player|target player|target opponent|each opponent|each other player|that creature's controller|that permanent's controller) creates?/i.test(
          s.slice(Math.max(0, m.index - 40), m.index + 8)
        );
      push(
        'token',
        {
          creature: cr,
          mine: !theirs,
          what: tx.replace(/^creates? /i, '').slice(0, 60),
          once: trig === 'static' && /Instant|Sorcery/.test(t),
          cond,
          cost
        },
        s
      );
    }
    if (/costs? \{(\d+|X)\} less to cast/i.test(s))
      push('cost', {how: /total power/i.test(s) ? 'total power' : /for each/i.test(s) ? 'per permanent' : 'flat'}, s);
    if ((m = /^Sacrifice (a|another) (creature|artifact|permanent)[^:]*:/i.exec(s)))
      push('sac-outlet', {what: m[2].toLowerCase(), cost}, s);
    if (
      (m =
        /put (a|an|one|two|three|x|\d+) \+1\/\+1 counters? on (each (?:other )?creature you control|target creature|each of up to|that (?:creature|Hero|\w+)|it|~|[A-Z][^.,]*)/i.exec(
          s
        ))
    )
      push(
        'counters',
        {
          n: NUM[m[1].toLowerCase()] || +m[1] || 'X',
          on: /each/.test(m[2]) ? 'team' : 'one',
          cond,
          limit: /only once each turn/i.test(next) ? 'once per turn' : ''
        },
        s
      );
    if (/^If one or more (creature )?tokens would be created/i.test(s))
      push('token-replace', {creatureOnly: /creature tokens/i.test(s)}, s);
    if (/gains? (twice )?(\d+|x|that much) life|you gain \d+ life/i.test(s)) push('lifegain', {cond}, s);
    if (/each opponent loses (\d+|x|that much) life/i.test(s)) push('drain', {cond, repeat: trig === 'trigger'}, s);
    if (
      out.effects.length === n0 &&
      !/^(This spell|As long as|If |~|Activate only|Spend this mana|This mana|This ability|It's an? |Partner|Choose a Background|Do this only|\{[^}]+\}:? *$)/i.test(
        s
      ) &&
      !/can't (attack|block|be blocked)|has |have |gains? (vigilance|haste|menace|flying|trample|lifelink)/i.test(s)
    )
      out.unknown.push(s.slice(0, 160));
  }
  c._fxSrc = c.o;
  return (c._fx = out);
}
// ----- roles 2 (UP.roles2, roadmap 5.0 option B, owner 28 Nov): the jobs a card is given, corrected both ways -----
// tags() calls this last, after the patterns, the game engine's list and the rules reading have all had their say. It adds the
// few jobs they miss (removal: "non-X" targets, shuffled into the library, locked down; protect: a creature type you control
// gains hexproof) and takes away jobs they over-read. A job is only taken away when a clause of a known kind is on the card and
// nothing else on it shows the job (the text with those clauses cut out has no evidence left), so no other card is touched.
// Kept on purpose (Deck Builder rules): cost reducers as ramp, impulse draw / Clues / connive as card flow, edicts as removal,
// umbra armor as protection. Report and card lists: tools/readers-report.md.
const R2_SELF = /\b(this (creature|permanent|artifact|vehicle|enchantment|land|equipment)|it|~)\b/i;
const R2_OTHERS =
  /\btarget\b|\b(each|all|other|another|enchanted|equipped|those|these|opponents?)\b|\bcreatures?\b|\bpermanents\b|\byou (gain|have)\b|\bplayers?\b|\byou control\b/i;
const R2_REM = /\([^()]*\)/g;
function r2Sentences(o) {
  return o
    .replace(/\((?:[^()]|\([^()]*\))*\)/g, m => (/^\((?:You may promise|Discard this card: Search|\{[^}]*\}, Discard this card: Search)/.test(m) ? '' : m))
    .split(/(?<=\.)\s+|\n|•/)
    .map(x => x.trim())
    .filter(Boolean);
}
function roles2Fix(c, o, t, roles) {
  const name = c.n.split(' // ')[0],
    flat = o.split(name).join('~'),
    bare = flat.replace(R2_REM, ' '),
    sents = r2Sentences(flat),
    has = r => roles.has(r);
  const planeswalker = /Planeswalker/.test(t);
  // ---- misses ----
  // removal: "destroy/exile target non-Angel, non-Demon creature" (the removal pattern skips every "non-" target)
  if (
    !has('removal') &&
    sents.some(
      x =>
        /\b(?:destroy|exile)s? (?:x |up to (?:one|two|three|x) |one |two |three )?(?:other |another )?target (?:non-?[\w']+,? (?:(?:and|or) )?)+(?:creatures?|permanents?|artifacts?|enchantments?|planeswalkers?|battles?)\b(?! card)/i.test(x) &&
        !/\byou (?:control|own)\b|\bfrom (?:a |your |their )?graveyard\b/i.test(x)
    )
  )
    roles.add('removal');
  // removal: the owner shuffles it into the library (Unravel the Aether, Deglamer)
  if (
    !has('removal') &&
    (/\btarget (?:artifact|enchantment|creature|permanent|planeswalker|nonland permanent|artifact or enchantment|creature or planeswalker)\b(?![^.]*\byou (?:control|own)\b)[^.]*\.\s*(?:Its|Their|That (?:creature|permanent)'s) (?:owner|controller) shuffles (?:it|that \w+) into (?:their|its owner's|his or her) library/i.test(bare) ||
      /\bshuffles? (?:target|that) (?:creature|permanent|artifact|enchantment|planeswalker|nonland permanent)[^.]* into (?:its owner's|their owner's|their|his or her) library/i.test(bare))
  )
    roles.add('removal');
  // removal: lock-down, a creature tapped that stays tapped for as long as you control the source (Icefall Regent)
  if (
    !has('removal') &&
    /\btap target (?:creature|artifact|permanent|nonland permanent)[^.]*\.\s*(?:That \w+|It) doesn't untap during (?:its|their) controller's untap step for as long as you control\b/i.test(bare)
  )
    roles.add('removal');
  // protect: "Humans you control gain hexproof and indestructible", "other Heroes you control have hexproof"
  if (
    !has('protect') &&
    /\b[A-Z][a-z]+s?(?:(?:,| and|, and| or) (?:other )?[A-Z][a-z]+s?)* you control (?:also )?(?:gain|gains|have|has)\b[^.]{0,40}\b(?:hexproof|indestructible|shroud|protection from|ward)\b/.test(bare.replace(/\b(?:Target|Creatures|Permanents|Artifacts|Enchantments|Lands|Equipment|Other|Each|All|Nonland|Noncreature|Nonartifact|Nonblack|Nonwhite|Nonred|Nongreen|Nonblue)\b/g, ' '))
  )
    roles.add('protect');

  // ---- over-reads ----
  // draw: a wheel or any "each player draws", what an opponent draws (a gift), and casting or playing from the graveyard or from
  // exile, are not card draw for you. Cut those sentences out; if no draw (or impulse, monarch, Clue ...) is left, the job goes.
  if (has('draw')) {
    const OTHERS_DRAW =
      /\b(?:each|every) (?:other )?(?:player|opponent)\b[^.]*\bdraws?\b|\b(?:target opponent|that player|defending player|its controller|that creature's controller|they|an opponent|the player) draws?\b/i;
    const FROM_ELSEWHERE =
      /\b(?:cast|play) [^.]*\bfrom (?:your |a |each |their |an opponent's |target |any )?(?:graveyard|graveyards|exile)\b|\byou may (?:cast|play) (?:cards?|spells?|lands?|permanents?|those cards?|that card|them|it)[^.]*\b(?:exiled|remain exiled)\b|\byou may (?:cast|play) [^.]*cards? exiled (?:with|this way|by)\b|\bexile each card [^.]*search|\b(?:target|choose) [^.]*\bcards? (?:in|from) (?:your|a|an opponent's) graveyard\b/i;
    const kept = sents.filter(x => {
      const mine = /\byou (?:may )?draw\b|\bthen you draw\b|:\s*draw\b|^draw\b|, draw\b/i.test(x);
      if (OTHERS_DRAW.test(x) && !mine) return false;
      if (FROM_ELSEWHERE.test(x) && !/\bdraws?\b|exile the top|top (?:card|\w+ cards) of (?:your|target) library/i.test(x)) return false;
      return true;
    });
    // a gift promised to an opponent ("they draw a card" in the Gift reminder) is cut out before the sentences are made
    if (kept.length < sents.length || /\(You may promise an opponent a gift[^)]*\bthey draw\b/.test(flat)) {
      const rest = kept.join('\n');
      if (!/\bdraws?\b|monarch|initiative|investigate|\bClues?\b|connive|exile the top|exile [^.]*from the top of your library|top (?:card|\w+ cards) of (?:your|target) library|look at the top|\bexplores?\b|collect evidence/i.test(rest))
        roles.delete('draw');
    }
  }
  // wipe: damage divided as you choose among chosen targets is removal (Fury, Fire Covenant, Atarka); a planeswalker's ultimate
  // (minus 5 or more), "exile all other Nightmare tokens you control" (own tokens) and a damage rider on the second or third
  // resolution of a trigger (Ashling) are not wipes
  if (has('wipe')) {
    const DIVIDED = /\bdamage (?:divided|dealt|split) as you choose among\b[^.]*\btargets?\b|\bdamage divided as you choose among (?:one|two|three|any number)[^.]*\btargets?\b|\bdivide (?:that|\w+) damage as you choose among\b/i,
      OWN = /\b(?:exile|destroy) all other [A-Z][a-z]+ tokens you control\b|\b(?:second|third) time\b/i;
    let lines = flat.split('\n'),
      ult = false;
    if (planeswalker) {
      ult = lines.some(l => /^[−-](?:[5-9]|\d\d):/.test(l.trim()));
      lines = lines.filter(l => !/^[−-](?:[5-9]|\d\d):/.test(l.trim()));
    }
    const kept = r2Sentences(lines.join('\n')).filter(x => !DIVIDED.test(x) && !OWN.test(x));
    const div = sents.some(x => DIVIDED.test(x)),
      touched = ult || div || sents.some(x => OWN.test(x));
    if (touched) {
      const WIPE_EV =
        /\b(?:destroy|exile|sacrifice|sacrifices|return|deals?|put|gets?|get)\b[^.]*\b(?:all|each|every)\b[^.]*\b(?:creatures?|permanents?|nonland|artifacts?|enchantments?|planeswalkers?|tokens?)\b|\beach (?:other )?(?:player|opponent) sacrifices\b|\b(?:all|each) (?:other )?creatures?\b[^.]*\bget\b|\bOverload\b|damage to each\b/i;
      const left = kept.some(x => (ROLE_RE.wipe.test(x) && !/\b(?:exile|destroy) all other cards\b|\bcards? (?:revealed|exiled) this way\b/i.test(x)) || WIPE_EV.test(x));
      if (!left) {
        roles.delete('wipe');
        if (div) roles.add('removal');
      }
    }
  }
  // protect: a job done for the card itself only (Paradise Druid and Invisible Stalker have hexproof, Fog Bank prevents damage to
  // and by itself), or damage prevented on a permanent an opponent controls (Kiora, Dovin: a lock, not protection)
  if (has('protect') && !/\bumbra armor\b|\bBestow\b/.test(o)) {
    const PROT = /\b(?:hexproof|indestructible|shroud|protection from|ward|phases? out|prevent all|regenerate|can't be the targets?|returns? (?:it|that card) to the battlefield|totem armor)\b/i;
    const KEYLINE = /^(?:(?:Flying|Vigilance|Defender|Reach|First strike|Trample|Flash|Haste|Lifelink|Deathtouch|Menace|Hexproof|Shroud|Indestructible|Protection from [\w ]+|Ward[^,.]*)(?:,\s*)?)+\.?$/i;
    const selfOnly = (x, prev) => {
      const y = x.replace(R2_REM, ' ').trim();
      if (KEYLINE.test(y)) return true;
      // equipment and auras give it to another creature, a fog or "damage dealt to you" protects more than this card
      if (/\b(?:equipped|enchanted)\b|\bto you\b|\byou (?:and|have|gain)\b|\bdamage that would be dealt (?:this turn|to (?:a|an|each|target)\b)|\bdamage that would be dealt\.?$|\bsource of your choice would deal\b|\bsource would deal\b/i.test(y)) return false;
      // a lock on an opponent's permanent (Kiora, Dovin), not protection
      if (/prevent all (?:combat )?damage that would be dealt to (?:and dealt by )?target (?:permanent|creature)[^.]*an opponent controls/i.test(y)) return true;
      // "it" after a target sentence is that target (Fleeting Flight, Slip Out the Back): a trick on a creature, which protects
      if (/\b(?:it|that creature)\b/i.test(y) && /\btarget\b/i.test(prev || '')) return false;
      const z = y
        .replace(/^(?:As long as|During|If)\b[^,]*,\s*/i, '')
        .replace(/\bas long as [^.]*$/i, '')
        .replace(/\bprevent all\b/gi, ' ')
        .replace(/\bby (?:creatures|a creature|artifact creatures|enchanted creatures|artifact sources|creatures with first strike|creatures it's blocking|creatures blocking it|target creature|Walls|Deserts)\b/gi, ' ')
        .replace(/\bthis (?:creature|permanent|artifact|vehicle)\b/gi, ' ')
        .replace(/\b(?:it|~)\b/gi, ' ');
      return R2_SELF.test(y) && !R2_OTHERS.test(z);
    };
    const sn = sents.map(x => x.replace(R2_REM, ' ').trim()),
      ps = sn.filter(x => PROT.test(x));
    if (ps.length && ps.every(x => selfOnly(x, sn.slice(0, sn.indexOf(x)).join(' ')))) roles.delete('protect');
  }
  // tutor: transmute, typecycling (wizardcycling, landcycling) and a basic land fetched into the hand are not tutors
  if (has('tutor')) {
    const LANDW = '(?:basic )?(?:lands?|plains|island|swamp|mountain|forest|snow-covered \\w+|gates?)';
    const landFetch = new RegExp('\\bsearch your library for (?:a|an|up to \\w+|two|three|x) ' + LANDW + '[^.]*?\\binto your hand\\b', 'i');
    const kept = sents.filter(x => !/^(?:Transmute|\w+cycling)\b/i.test(x) && !landFetch.test(x));
    const dropped = kept.length < sents.length || /\bTransmute\b|cycling\b/i.test(o);
    if (dropped) {
      const rest = kept.join('\n');
      // evidence left: the tutor pattern, or any other search of a library for something that is not just lands
      const search = kept.some(x => /\bsearch(?:es)? (?:your|their|target (?:player|opponent)'s|its owner's) library\b/i.test(x) && !/\b(?:lands?|plains|island|swamp|mountain|forest)\b[^.]*\bonto the battlefield\b/i.test(x));
      if (!ROLE_RE.tutor.test(rest) && !search) roles.delete('tutor');
    }
  }
  // removal: damage to a player or planeswalker only (Boros Charm) is not removal; a card with a creature target keeps it
  if (has('removal')) {
    const PW = /\bdamage to target (?:player|opponent)(?: or planeswalker| or battle)?\b|\bdamage to each opponent\b/i,
      NOTPW = x => PW.test(x) && !/\b(?:any target|creature|permanent)\b/i.test(x);
    if (sents.some(NOTPW)) {
      const rest = sents.filter(x => !NOTPW(x)).join('\n');
      const EV =
        /\b(?:destroy|exile)s? [^.]*\btarget\b|\bfights?\b|\bgets? -\d|-\d+\/-\d+|\bdamage to (?:any target|(?:up to \w+ )?(?:other |another )?target (?:creature|permanent|attacking|blocking|tapped|nonland))|\bdamage equal to\b[^.]*\bto (?:any target|target (?:creature|permanent))|\breturn [^.]*target [^.]*to (?:its|their) owner's hand|\bsacrifices? (?:a|an|two|that many)\b|\bshuffles?\b|\btap target\b|\bgain control\b|-1\/-1 counter|\bdeals? (?:\d+|x|that much) damage to (?:each|all)\b|\bcan't (?:attack|block)\b/i;
      if (!ROLE_RE.removal.test(rest) && !EV.test(rest)) roles.delete('removal');
    }
  }
}
// What a card depends on to work, read from its text: creature tokens, non-Human creatures, artifact spells, a creature
// type, land discards, instants and sorceries, +1/+1 counters, equipment. Each need says how to count support in a deck.
const NEEDS = {
  // a one-shot token spell counts half; a card that keeps making them counts fully
  creatureTokens: {
    label: 'creature tokens',
    min: 6,
    test: /creature tokens? would be created|whenever (one or more |a )?creature tokens?|creature tokens? you control/i,
    count: c => {
      const t = effectsOf(c).effects.filter(e => e.kind === 'token' && e.creature && e.mine);
      return !t.length ? 0 : t.some(e => !e.once) ? 1 : 0.5;
    }
  },
  tokens: {
    label: 'tokens',
    min: 6,
    test: /whenever (one or more |a )?tokens? (you control )?enters?|tokens? would be created/i,
    count: c => {
      const t = effectsOf(c).effects.filter(e => e.kind === 'token' && e.mine);
      return !t.length ? 0 : t.some(e => !e.once) ? 1 : 0.5;
    }
  },
  nonHuman: {
    label: 'non-Human creatures',
    min: 0.5,
    share: true,
    test: /non-Human creatures? you control/i,
    count: c =>
      /Creature/.test(frontType(c))
        ? /\bHuman\b/.test((c.t || '').split(' // ')[0]) && !/Changeling/.test(c.o || '')
          ? 0
          : 1
        : null
  },
  artifactSpells: {
    label: 'artifact spells',
    min: 15,
    test: /whenever you cast an artifact spell|artifact spells? you cast|cast artifact spells/i,
    count: c => (/Artifact/.test(frontType(c)) && !tags(c).land ? 1 : 0)
  },
  bigArtifacts: {
    label: 'artifacts with mana value 4 or more',
    min: 8,
    test: /artifact spell with (mana value|converted mana cost) 4 or greater/i,
    count: c => (/Artifact/.test(frontType(c)) && (c.cmc || 0) >= 4 ? 1 : 0)
  },
  landDiscard: {
    label: 'ways to discard lands',
    min: 6,
    test: /whenever you discard one or more land cards|whenever you discard a land/i,
    count: c =>
      effectsOf(c).effects.some(e => e.kind === 'filter' || (e.kind === 'draw' && e.discard)) ||
      /\bdiscard (a|one|two|any number of) (land )?cards?\b|landcycling|cycling \{/i.test(c.o || '')
        ? 1
        : 0
  },
  spells: {
    label: 'instants and sorceries',
    min: 15,
    test: /whenever you cast (an|your) instant or sorcery|instant (and|or) sorcery spells? you cast|magecraft/i,
    count: c => (/Instant|Sorcery/.test(frontType(c)) ? 1 : 0)
  },
  topPower: {
    label: 'creatures with power 4 or more',
    min: 6,
    test: /greatest power among (non-\w+ )?creatures you control/i,
    count: c => (/Creature/.test(frontType(c)) && (parseInt(String(c.pt || '0').split('/')[0], 10) || 0) >= 4 ? 1 : 0)
  },
  bigPower: {
    label: 'creatures with power 4 or more',
    min: 12,
    test: /total power of creatures you control|sacrificed creature's power/i,
    count: c => (/Creature/.test(frontType(c)) && (parseInt(String(c.pt || '0').split('/')[0], 10) || 0) >= 4 ? 1 : 0)
  },
  counters: {
    label: 'ways to put +1/+1 counters',
    min: 8,
    test: /creatures? (you control )?with (a |one or more )?\+1\/\+1 counters? on (it|them)|for each \+1\/\+1 counter on (creatures|permanents) you control/i,
    count: c => (/\+1\/\+1 counters?\b/.test(c.o || '') && /\bput\b|enters with|proliferate/i.test(c.o || '') ? 1 : 0)
  }
};
function needsOf(c) {
  if (!c) return [];
  if (c._nd) return c._nd;
  const o = (c.o || '').split(' // ')[0],
    out = [];
  for (const k in NEEDS) if (NEEDS[k].test.test(o)) out.push(k);
  // a free sacrifice outlet that mills (Altar of Dementia) is a sacrifice outlet and self-mill first: it works with any creature
  // (UP.altar, Build 143), unlike a payoff that needs big ones (Fling, Greater Good)
  if (UP.altar && /mills cards equal to the sacrificed creature's power/i.test(o)) {
    const i = out.indexOf('bigPower');
    if (i >= 0) out.splice(i, 1);
  }
  // a creature type the card rewards (Heroes, Villains, Dinosaurs…), the same reading the tribe checks use
  const m =
    /(?:whenever (?:another |a |one or more (?:other )?)|other |each )(\w+?)s? (?:you control|creatures? you control)/i.exec(o);
  if (m) {
    const tr = m[1].replace(/^./, x => x.toUpperCase());
    if (TRIBE_SET.has(tr) && !new RegExp('\\bcreates? [^.]*\\b' + tr + '\\b').test(o)) out.push('tribe:' + tr);
  }
  return (c._nd = out);
}
// Support for each need in a deck: count of cards (or share of creatures) that feed it.
function supportOf(d, key) {
  const cards = [];
  d.cards.forEach(e => {
    const c = find(e.n);
    if (c) for (let i = 0; i < e.q; i++) cards.push(c);
  });
  [d.commander, d.partner]
    .filter(Boolean)
    .map(find)
    .filter(Boolean)
    .forEach(c => cards.push(c));
  if (key.startsWith('tribe:')) {
    const tr = key.slice(6);
    let have = cards.filter(c => hasCType(c, tr)).length;
    // creature tokens of the type count too (UP.ttok, Build 143): a card that keeps making them (Teval's Zombie Druids) counts as
    // three of the type, a one-time maker as one. The commander is always there, so its tokens are dependable support.
    if (UP.ttok) {
      const re = new RegExp('\\b' + tr + '\\b');
      cards.forEach(c => {
        const fx = effectsOf(c).effects.filter(x => x.kind === 'token' && x.creature && x.mine && re.test(x.what || ''));
        if (fx.length) have += fx.some(x => !x.once) ? 3 : 1;
      });
    }
    return {have, min: 10};
  }
  const N = NEEDS[key];
  if (!N) return {have: 0, min: 0};
  if (N.share) {
    const v = cards.map(N.count).filter(x => x != null);
    return {have: v.length ? +(v.reduce((a, b) => a + b, 0) / v.length).toFixed(2) : 0, min: N.min, share: true};
  }
  return {have: cards.reduce((a, c) => a + (N.count(c) || 0), 0), min: N.min};
}
// ----- analyze a build by hand -----
// What a deck's own cards are doing, whatever its build is set to: the commander's EDHREC themes (when loaded) and the general
// mechanics, each with the spells that support it, and the most common creature type. Ranked by how many cards back each.
function buildThemes(d) {
  const ctx = ctxOf(d),
    spells = [];
  d.cards.forEach(e => {
    const c = find(e.n);
    if (c && !tags(c).land) for (let i = 0; i < e.q; i++) spells.push(c);
  });
  const edh = [],
    gen = [],
    E = ctx.edh;
  // A theme is ranked by the cards backing it and by how many of the commander's players build that way (broad themes
  // such as Legends touch many cards without being the plan).
  const top = E && E.tags && E.tags.length ? Math.max(1, ...E.tags.slice(0, 10).map(t => t.count || 0)) : 1;
  if (E && E.tags)
    E.tags.slice(0, 10).forEach(t => {
      if (!E.tmap || !E.tmap[t.slug]) return;
      const cs = spells.filter(c => matchAim(c, 'edh:' + t.slug) >= 1);
      if (cs.length >= 3)
        edh.push({
          key: 'edh:' + t.slug,
          label: t.label,
          n: cs.length,
          cards: cs.map(c => c.n),
          r: cs.length * Math.sqrt((t.count || 0) / top)
        });
    });
  themeKeys()
    .filter(k => THEMES[k].re && k !== 'draw')
    .forEach(k => {
      const cs = spells.filter(c => matchAim(c, k, ctx.tribe) >= 0.7);
      if (cs.length >= 4) gen.push({key: k, label: THEMES[k].label, n: cs.length, cards: cs.map(c => c.n)});
    });
  const cnt = {};
  spells.forEach(c => {
    if (/Creature/.test(frontType(c)))
      subtypes(c).forEach(t => {
        if (TRIBE_SET.has(t) && t !== 'Human') cnt[t] = (cnt[t] || 0) + 1;
      });
  });
  const tt = Object.entries(cnt).sort((a, b) => b[1] - a[1])[0];
  if (tt && tt[1] >= 8) gen.push({key: 'tribal', tribe: tt[0], label: tt[0] + ' tribal', n: tt[1], cards: []});
  edh.sort((a, b) => b.r - a.r);
  gen.sort((a, b) => b.n - a.n);
  // the suggested build: the commander's own themes when it has play data, otherwise the general mechanics
  let pick = (edh.length ? edh : gen).slice(0, 3);
  // UP.planList (roadmap 6b batch C): the deck's strong game-plan chains (plans.js planList). With little or no play data for
  // the commander (no EDHREC page, or under 60 cards on it) they lead the suggested build, up to two, ahead of the themes or
  // mechanics (a mechanic that is the same plan by keywords is left out); a well-known commander keeps its EDHREC themes.
  const plans = planList(d).map(x => ({key: 'plan:' + x.id, label: x.label, n: new Set(x.en.concat(x.pay)).size, cards: x.en.concat(x.pay.filter(n => !x.en.includes(n))), strength: x.strength}));
  const thinData = !E || !E.map || E.map.size < 60;
  if (plans.length && thinData) {
    const top = plans.slice(0, 2),
      twin = new Set(top.map(x => PLAN_TWIN[x.key.slice(5)]).filter(Boolean));
    pick = top.concat((edh.length ? edh : gen).filter(x => !twin.has(x.key))).slice(0, 3);
  }
  return {
    edh,
    gen,
    ...(UP.planList ? {plans, thinData} : {}),
    suggest: pick.map(x => x.key),
    tribe: (pick.find(x => x.key === 'tribal') || {}).tribe || '',
    spells: spells.length
  };
}
// The colours a commander-less deck's cards ask for (for suggesting a commander).
function deckColors(d) {
  const s = new Set();
  d.cards.forEach(e => {
    const c = find(e.n);
    if (c && !tags(c).land) c.ci.forEach(k => s.add(k));
  });
  return 'WUBRG'.split('').filter(k => s.has(k));
}
// Commander profiles for the five benchmark decks, written from their current Oracle text (hash: the text they were reviewed
// against; a changed text drops the profile until it is reviewed again). A profile describes how the commander works and
// what it depends on, not a list of preferred cards. Other commanders get the needs read from their text (needsOf).
const PROFILES = {
  'Captain America, Team Leader': {
    hash: '4m2l4y',
    needs: ['tribe:Hero'],
    plan: 'Each other Hero entering gets vigilance, haste and a +1/+1 counter, and Captain America gets one too. The deck wants a steady stream of Hero creatures; Heroes that are good on their own and cheap keep the triggers coming.',
    wins: 'Wide, hasty Hero attacks growing with counters; team pumps close games.'
  },
  'Doctor Doom, King of Latveria': {
    hash: 'ddb1m5',
    needs: ['landDiscard'],
    plan: 'Each time you discard one or more land cards, each opponent loses 2 life. Only your own discards count (opponents discarding does nothing). Each combat Doom makes a Villain you control connive, which is a free discard. Ways to discard lands repeatedly are the engine; more Villains give the connive more targets.',
    wins: 'Repeated land discards draining the table, backed by menace attackers.'
  },
  'Ghalta, Primal Hunger': {
    hash: '4uq0b1',
    needs: ['bigPower'],
    plan: 'Ghalta costs {X} less, where X is the total power of your creatures, down to its {G}{G}. Big creatures and ramp make it cheap early; it then attacks with trample. Dinosaurs are not required: any large creatures lower the cost.',
    wins: 'Big tramplers and team pumps; Ghalta arriving early.'
  },
  'Leonardo, the Balance': {
    hash: 'l1f65y',
    needs: ['tokens'],
    plan: 'Once each turn, when a token you control enters (any token: a Treasure or Food counts), you may put a +1/+1 counter on each creature you control. For {W}{U}{B}{R}{G}, your creatures gain menace, trample and lifelink until end of turn.',
    wins: 'A wide board grown by counters, then the five-colour menace/trample/lifelink alpha strike.'
  },
  "T'Challa, the Black Panther": {
    hash: 'y9rmeh',
    needs: ['artifactSpells', 'bigArtifacts'],
    plan: 'T\u2019Challa makes a tapped, indestructible Vibranium token when it enters or attacks. Vibranium mana can only cast artifact spells, so it is ramp for artifacts only. Casting an artifact with mana value 4 or more puts two +1/+1 counters on T\u2019Challa. Vibranium tokens are artifacts, not creatures: they do not feed creature-token cards such as Divine Visitation.',
    wins: 'Large artifacts and a growing T\u2019Challa; artifact-creature threats.'
  }
};
function profileOf(c) {
  if (!c) return null;
  const p = PROFILES[c.n];
  if (p && p.hash === effectsOf(c).hash) return Object.assign({reviewed: true}, p);
  const n = needsOf(c);
  return n.length ? {reviewed: false, needs: n} : null;
}
// Cards whose condition this deck barely meets: each with what it needs, how much the deck has, and the usual minimum.
function weakHere(d) {
  const out = [],
    cache = {};
  d.cards.forEach(e => {
    const c = find(e.n);
    if (!c || tags(c).land) return;
    needsOf(c).forEach(k => {
      const s = cache[k] || (cache[k] = supportOf(d, k));
      const self = !s.share && (k.startsWith('tribe:') ? hasCType(c, k.slice(6)) : NEEDS[k] && NEEDS[k].count(c)) ? 1 : 0,
        have = s.share ? s.have : s.have - self;
      if (have < s.min)
        out.push({
          n: c.n,
          need: k,
          label: k.startsWith('tribe:') ? k.slice(6) + ' creatures' : NEEDS[k].label,
          have,
          min: s.min,
          share: !!s.share
        });
    });
  });
  return out;
}
