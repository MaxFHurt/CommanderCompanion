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
  const pick = (edh.length ? edh : gen).slice(0, 3);
  return {
    edh,
    gen,
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
