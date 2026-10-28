// Visible practice games (Build 136, roadmap): opening hands, mulligans and the first turns of the same practice games the deck
// score plays (practiceGames, a step-by-step copy of simulate). Worked out only while the panel is open.
const PRAC = {k: '', v: null};
function practiceHtml(d) {
  const open = !!S.pracOpen,
    seed = (S.pgSeed || {})[d.id] || 1;
  let h =
    '<details class="grp" id="practice"' +
    (open ? ' open' : '') +
    '><summary class="lab" style="cursor:pointer">Practice games</summary>';
  if (!open) return h + '</details>';
  const n = d.cards.reduce((a, e) => a + e.q, 0);
  if (n < 40) return h + '<p class="note" style="margin:0">Add more cards to play practice games.</p></details>';
  const key = d.id + '|' + d.commander + '|' + d.cards.map(e => e.n + 'x' + e.q).join(',');
  if (PRAC.k !== key) {
    try {
      PRAC.v = practiceGames(d, 100, 1);
    } catch (e) {
      PRAC.v = null;
    }
    PRAC.k = key;
  }
  const S100 = PRAC.v,
    pct = x => Math.round(100 * x) + '%';
  let G = null;
  try {
    G = practiceGames(d, seed, 1).logs[seed - 1];
  } catch (e) {}
  if (S100)
    h +=
      '<p class="note" style="margin:0">In 100 practice games: short of lands on turn 5 in <b>' +
      pct(S100.screwT5) +
      '</b>, stuck without a colour a spell needs in <b>' +
      pct(S100.colourStuck) +
      '</b>, flooded by turn 8 in ' +
      pct(S100.floodT8) +
      ', mulligan in ' +
      pct(S100.mulligan) +
      (d.commander
        ? '; commander out by turn 4 in ' +
          pct(S100.cmdByT4) +
          ' (usually turn ' +
          (S100.cmdMedianTurn > 10 ? '11+' : S100.cmdMedianTurn) +
          ')'
        : '') +
      (S100.killMedianTurn
        ? '; unblocked attacks deal ' +
          S100.damageT1to8[7] +
          ' damage by turn 8 on average' +
          (S100.killMedianTurn <= 10 ? ' (40 damage usually by turn ' + S100.killMedianTurn + ')' : '')
        : '') +
      '.</p>';
  if (!G) return h + '</details>';
  const card = n => '<button class="chip pgc" data-act="card" data-n="' + esc(n) + '">' + esc(n.split(' // ')[0]) + '</button>';
  h +=
    '<div class="row"><span class="note">Game ' +
    seed +
    '</span><button class="btn sm" data-act="prac-new" data-v="-1"' +
    (seed > 1 ? '' : ' disabled') +
    '>Previous</button><button class="btn sm pri" data-act="prac-new" data-v="1">Deal another game</button></div>';
  h +=
    '<div class="pg-hand"><small>Opening hand</small><div class="row">' +
    G.hand0.map(card).join('') +
    '</div>' +
    (G.mull
      ? (() => {
          const nl = G.hand0.filter(x => {
            const c = find(x);
            return c && tags(c).land;
          }).length;
          return '<p class="note" style="margin:0">Mulligan (' + nl + ' land' + (nl === 1 ? '' : 's') + '): seven new cards';
        })() +
        (G.bottom ? ', then ' + esc(G.bottom) + ' goes to the bottom' : '') +
        '.</p><div class="row">' +
        G.hand1.map(card).join('') +
        '</div>'
      : '') +
    '</div>';
  h +=
    '<table class="pg"><thead><tr><th>Turn</th><th>Draw</th><th>Land</th><th>Cast</th><th>Mana</th>' +
    (UP.v2sim ? '<th>Attack</th>' : '') +
    '</tr></thead><tbody>' +
    G.turns
      .slice(0, 8)
      .map(
        T =>
          '<tr><td>' +
          T.turn +
          '</td><td>' +
          (T.draw ? card(T.draw) : '') +
          '</td><td>' +
          (T.land ? card(T.land) + (T.tapped ? ' <small>tapped</small>' : '') : '<small>none</small>') +
          '</td><td>' +
          (T.cast.length
            ? T.cast.map(x => card(x.n) + (x.cmd ? ' <small>commander</small>' : '')).join(' ')
            : '<small>nothing</small>') +
          '</td><td>' +
          T.spent +
          ' of ' +
          T.mana +
          '</td>' +
          (UP.v2sim ? '<td>' + (T.attack || 0) + ' <small>(' + (T.dmg || 0) + ' total)</small></td>' : '') +
          '</tr>'
      )
      .join('') +
    '</tbody></table>';
  h +=
    '<p class="note" style="margin:0">The deck score plays 300 of these. Play is simple on purpose: a land each turn (the one that adds a missing colour), then the commander, mana cards, card draw and the costliest spell it can cast. Creatures can’t attack or tap for mana the turn they arrive (unless they have haste), a creature tapped for mana doesn’t attack, and every attack is unblocked.</p>';
  return h + '</details>';
}
function upPanel(d, A, mode) {
  // mode "stats": the Build stats tab (the deck analysis); otherwise the Upgrades tab
  const T = A.T,
    meter = (label, have, want) => {
      const cls = have >= want ? 'good' : have >= want * 0.7 ? 'warn' : 'bad';
      return want
        ? '<div class="meter ' +
            cls +
            '"><span>' +
            label +
            '</span><i><b style="width:' +
            Math.min(100, (have / want) * 100) +
            '%"></b></i><span>' +
            have +
            ' / ' +
            want +
            '</span></div>'
        : '';
    };
  const stats = mode === 'stats';
  let h = stats
    ? '<div class="scroll up" id="statscroll" data-keep>'
    : '<div class="row"><div class="dd" style="flex:1 1 190px;min-width:0"><input type="search" id="add-q" placeholder="Add a card by name or rules text" autocomplete="off"><div class="ddl" id="add-res" hidden></div></div>' +
      '<button class="btn" data-act="fill"' +
      (isAimed(d) && A.size < A.T.size && !(d.plan && d.plan.length) ? '' : ' disabled') +
      ' title="Fill the open slots using your build">Fill ' +
      Math.max(0, A.T.size - A.size) +
      ' open</button><button class="btn" data-act="analyze"' +
      (d.cards.length ? '' : ' disabled') +
      ' title="Read what your cards are doing, score the deck as it stands, and see what it needs">Analyze this build</button>' +
      (d.format === 'commander' && find(d.commander)
        ? '<button class="btn" data-act="lands-open" title="Lands, colour sources and land swaps for this deck">Lands helper</button><button class="btn" data-act="jobs-open" title="The best ramp, card draw, removal, board wipes and protection for this deck">Best by job</button>'
        : '') +
      '' +
      (d.plan && d.plan.length
        ? '<button class="btn" data-act="plan-regen"' +
          (d.cards.length ? '' : ' disabled') +
          ' title="Keep every card in the deck and design the open slots again around them">Regenerate around my cards</button>'
        : isAimed(d) && d.cards.length && isNarrow()
          ? '<button class="btn" data-act="regen" title="Weigh every upgrade again for the cards in your deck now">Regenerate upgrades</button>'
          : '') +
      '</div><div class="scroll up" id="upscroll" data-keep>';
  if (d.plan && d.plan.length && syncPlan(d)) persistSoon();
  if (d.plan && d.plan.length)
    return (
      h +
      (stats
        ? '<p class="note">Build stats appear once the deck is built: install the plan on the Upgrades tab.</p>'
        : planHtml(d)) +
      '</div>'
    );
  h += statsHtml(d, A, isAimed(d) ? recsFor(d) : null, stats ? 'full' : 'compact');
  if (d.regenUndo)
    h +=
      '<div class="row"><span class="note">Rebuilt around your cards: they are the starting point, and every suggestion is an upgrade from here.</span><button class="btn sm" data-act="plan-regen-undo" style="margin-left:auto">Undo</button></div>';
  if (!DBINFO.complete)
    h += '<div class="row"><span class="chip warn">Card data still downloading · results will improve</span></div>'; // the EDHREC chip sits in the stats module (Build 131)
  if (stats) {
    if (d.format === 'commander') h += bracketHtml(d, A);
    if (d.format !== 'commander')
      h +=
        '<div class="grp"><span class="lab">Deck health</span>' +
        meter('Lands', A.lands, T.lands) +
        meter('Ramp', A.roles.ramp, T.ramp) +
        meter('Card draw', A.roles.draw, T.draw) +
        meter('Removal', A.roles.removal, T.removal) +
        meter('Board wipes', A.roles.wipe, T.wipe) +
        '</div>'; // Commander decks show these in Build stats
    if (!(d.plan && d.plan.length)) h += scoreHtml(d, A);
    h +=
      '<div class="grp"><span class="lab">Card types</span><div class="row">' +
      TYPE_ORDER.filter(k => A.types[k])
        .map(k => '<span class="chip">' + (k === 'Sorcery' ? 'Sorceries' : k + 's') + ' · ' + A.types[k] + '</span>')
        .join('') +
      '</div></div>';
    {
      const mp0 = manaPlan(d),
        cols = 'WUBRG'.split('').filter(k => mp0.pips[k] || mp0.have[k]);
      if (cols.length)
        h +=
          '<div class="grp"><span class="lab">Colored mana · spells need vs basic lands</span><div class="row">' +
          cols
            .map(
              k =>
                '<span class="chip' +
                (mp0.basics && Math.abs(mp0.want[k] - mp0.have[k]) >= 2 ? ' warn' : '') +
                '"><i class="pip p' +
                k +
                '">' +
                k +
                '</i> ' +
                mp0.pips[k] +
                ' symbols · ' +
                mp0.have[k] +
                ' ' +
                COLOR_BASIC[k] +
                '</span>'
            )
            .join('') +
          '</div></div>';
    }
    h += practiceHtml(d); // Build 136: visible practice games
    const mx = Math.max(1, ...A.curve);
    h +=
      '<div class="grp"><span class="lab">Mana curve · average ' +
      A.avg.toFixed(2) +
      '</span><div class="curve">' +
      A.curve
        .map(
          (v, i) =>
            '<div><span>' +
            v +
            '</span><i style="height:' +
            (v / mx) * 44 +
            'px"></i><span>' +
            (i === 6 ? '6+' : i) +
            '</span></div>'
        )
        .join('') +
      '</div></div>';
    const flags = [];
    if (A.offColor.length) flags.push('<span class="chip bad">' + A.offColor.length + ' outside colors</span>');
    if (A.illegal.length) flags.push('<span class="chip bad">' + A.illegal.length + ' not ' + d.format + '-legal</span>');
    if (A.dupes.length) flags.push('<span class="chip bad">' + A.dupes.length + ' over copy limit</span>');
    if (A.unknown.length) flags.push('<span class="chip warn">' + A.unknown.length + ' unrecognized</span>');
    d.aims.forEach((a, i) =>
      flags.push(
        '<span class="chip">' +
          (a === 'tribal' ? esc(A.ctx.tribe || 'Tribal') : esc(aimLabel(a, A.ctx.tribe).split(' / ')[0])) +
          ' · ' +
          A.aim[i] +
          '</span>'
      )
    );
    if (flags.length) h += '<div class="row">' + flags.join('') + '</div>';
    return h + '</div>';
  }
  if (!isAimed(d)) {
    const need =
      d.format === 'commander' && !A.ctx.cmd
        ? 'Choose your commander, then pick'
        : !d.aims.length
          ? 'Pick'
          : d.aims.includes('tribal') && !A.ctx.tribe
            ? 'Choose a creature type for your tribal aim. Then pick'
            : 'Choose your land colors, and pick';
    return (
      h +
      '<div class="gate"><b>Set up the build first</b>' +
      need +
      ' at least one mechanic in the Build panel. Upgrade paths are built around your priorities, so two players with the same commander get different lists.' +
      (d.cards.length
        ? '<div class="row" style="margin-top:10px"><button class="btn pri" data-act="analyze">Analyze this build</button><span class="note">Reads what your cards are doing and suggests the build for you.</span></div>'
        : '') +
      '</div></div>'
    );
  }
  const hasPlan = d.plan && d.plan.length,
    R = hasPlan ? null : recsFor(d),
    thumb = n => {
      const c = find(n);
      return c ? '<img alt="" src="' + artFor(c, {pid: c.id}) + '">' : '<span></span>';
    },
    price = n => money(find(n));
  const side = (kind, n, q) =>
    '<button class="sw ' +
    kind +
    '" data-act="card" data-n="' +
    esc(n) +
    '">' +
    thumb(n) +
    '<span><small>' +
    (kind === 'out' ? 'Remove' : 'Add') +
    '</small>' +
    (q > 1 ? q + '× ' : '') +
    esc(n) +
    (kind === 'in' ? printTag(find(n)) : '') +
    '</span><em>' +
    price(n) +
    '</em></button>';
  const mp = manaPlan(d);
  if (mp.off >= 2)
    h +=
      '<div class="gate"><b>Mana adjustment suggested</b>' +
      (mp.stuck
        ? 'Counting all your lands and mana rocks, the deck is ' +
          mp.stuck[0] +
          ' colour sources short of what its spells need; changing your basics brings that to ' +
          mp.stuck[1] +
          ': '
        : 'The basic lands don’t match the colours the spells need. I would change: ') +
      esc(planText(mp)) +
      '.<div class="row" style="margin-top:10px"><button class="btn pri" data-act="mana-apply">Accept the change</button></div></div>';
  if (R.fixes.length || R.drops.length) {
    h +=
      '<div class="grp"><span class="lab">Fixes this deck needs</span>' +
      R.fixes
        .map((p, i) =>
          isBasic(p.add)
            ? ''
            : '<div class="path">' +
              side('out', p.cut, p.q) +
              side('in', p.add, p.q) +
              '<div class="row"><span class="chip warn">' +
              esc(p.fix ? p.cutWhy[0] : p.why[0]) +
              '</span><button class="btn pri sm" data-act="fix" data-v="' +
              i +
              '" style="margin-left:auto">Swap</button></div></div>'
        )
        .join('') +
      R.drops
        .map(
          (c, i) =>
            '<div class="path">' +
            side('out', c.n, c.q) +
            '<div class="row"><span class="chip warn">' +
            esc(c.why[0]) +
            '</span><button class="btn danger sm" data-act="drop" data-v="' +
            i +
            '" style="margin-left:auto">Remove</button></div></div>'
        )
        .join('') +
      '</div>';
    {
      const bf = R.fixes.filter(p => isBasic(p.add));
      if (bf.length)
        h += basicsBox(
          bf.map(p => ({n: p.add, q: p.q})),
          'fix-basics',
          'Make these land changes',
          'These go in for: ' + bf.map(p => (p.q > 1 ? p.q + '× ' : '') + esc(p.cut)).join(', ') + '.'
        );
    }
  }
  if (R.conflicts && R.conflicts.length)
    h +=
      '<div class="grp"><span class="lab">Held picks that can’t go in · ' +
      R.conflicts.length +
      '</span><p class="note" style="margin:0">These picks were held for this deck but can no longer be added, so they are left out of every tier until you decide.</p>' +
      R.conflicts
        .map(
          x =>
            '<div class="path"><div class="row"><b>' +
            esc(x.add) +
            '</b><span class="note">for ' +
            esc(x.cut) +
            ' · ' +
            TIERS[x.t].label +
            '</span><span class="chip bad">' +
            esc(x.why) +
            '</span><button class="btn sm" data-act="hold-release" data-n="' +
            esc(x.add) +
            '" style="margin-left:auto">Release this pick</button></div></div>'
        )
        .join('') +
      '</div>';
  const any = R.paths.length;
  const out0 = (d.dismissed || []).filter(n => !entryOf(d, n));
  const outHtml = out0.length
    ? '<div class="grp"><span class="lab">Excluded cards for this deck · ' +
      out0.length +
      '</span><p class="note" style="margin:0">These are not suggested for this deck: cards you swapped out or removed, and cards you chose “Don’t suggest for this deck” for. Your deck itself is unchanged. The list keeps the latest 80. Tap a card to allow it in recommendations again.</p><div class="row">' +
      out0
        .map(
          n =>
            '<button class="chip" data-act="undismiss" data-n="' +
            esc(n) +
            '" aria-label="Allow ' +
            esc(n) +
            ' in recommendations">Allow ' +
            esc(n) +
            '</button>'
        )
        .join('') +
      '</div></div>'
    : '';
  h += '<div class="grp">';
  // the list appears once it is complete (owner, 19 Oct): the score check and the whole-card search both done
  const wait = R.pending || !!(R.pool && !R.poolDone);
  if (wait)
    h +=
      '<p class="note think" style="margin:0" id="pool-note" role="status">' +
      (R.pending
        ? 'Thinking… checking each upgrade against your deck score'
        : 'Thinking… checking every card that could fill these slots for a higher score' +
          (WK.w ? '' : ': ' + Math.floor((100 * R.pool.done) / Math.max(1, R.pool.total)) + '%')) +
      '</p>';
  if (wait) {
  } else if (!any)
    h +=
      '<p class="note" style="margin:0">No card in this deck has a clear upgrade right now that keeps the deck’s identity' +
      (DBINFO.source === 'starter' ? '. More options appear once the full card data has finished downloading' : '') +
      '.</p>';
  else {
    if (R.count.free)
      h +=
        '<div class="tip good"><b><small>Tip</small>' +
        R.count.free +
        ' free swap' +
        (R.count.free === 1 ? '' : 's') +
        ' from your library</b><ul><li class="pro"><i>+</i>You already own ' +
        (R.count.free === 1 ? 'a card' : 'cards') +
        ' that would improve this deck, so there is nothing to buy. They are listed first below.</li></ul><div class="row" style="margin-top:8px"><button class="btn sm" data-act="swap-all" data-v="free">Make all free swaps</button></div></div>';
    // Stick to the theme (owner, 24 Oct): a deck setting; on, every pick is a card on theme for the deck that raises its score
    h +=
      '<div class="row"><button class="btn sm' +
      (d.stick ? ' pri' : '') +
      '" data-act="stick" aria-pressed="' +
      !!d.stick +
      '" title="Picks only cards that fit this deck’s theme (its franchise, creature types and plans) and still raise its score">Stick to the theme: ' +
      (d.stick ? 'On' : 'Off') +
      '</button><small class="note">' +
      (d.stick
        ? 'Every pick fits the deck’s theme. A slot with no on-theme upgrade keeps its usual picks.'
        : 'Turn on to pick only on-theme cards (raw power can win otherwise).') +
      '</small></div>';
    // owner, 25 Oct: the Apply all buttons sit below the upgrade sheets and suggestions; the best decks under $3 and $12 moved to
    // the Build panel (buildFoot)
    let tierBlock = '';
    // Version 0.9.3 (owner, 19 Oct): the tiers are one row of three buttons, each applying that tier's swaps (it asks first):
    // "Apply All Budget Swaps" over "4 cards $5".
    {
      const TS = {};
      TIER_KEYS.forEach(t => (TS[t] = tierSum(d, R, t)));
      tierBlock =
        '<div class="tierbtns" role="group" aria-label="Apply a tier">' +
        TIER_KEYS.map(t => {
          const ts = TS[t];
          return (
            '<button class="btn tierbtn' +
            (t === 'apex' ? ' pri' : '') +
            '" data-act="swap-all" data-v="' +
            t +
            '"' +
            (ts.n ? '' : ' disabled') +
            '><b>Apply All ' +
            TIERS[t].label +
            ' Swaps</b><span>' +
            (ts.n
              ? ts.n + ' card' + (ts.n === 1 ? '' : 's') + ' · $' + ts.cost.toFixed(0) + ' to buy'
              : 'No worthwhile upgrades') +
            '</span></button>'
          );
        }).join('') +
        '</div>' +
        // owner, 24 Oct: when two tiers make exactly the same swaps, say why (the strongest cards already cost under that price)
        (TS.apex.n && TS.mid.keys === TS.apex.keys
          ? '<p class="note">Mid and Apex make the same swaps: every strongest card for this deck already costs under $' +
            TIERS.mid.cap +
            '.' +
            (TS.budget.keys === TS.mid.keys ? ' So does Budget (all under $' + TIERS.budget.cap + ').' : '') +
            '</p>'
          : TS.mid.n && TS.budget.keys === TS.mid.keys
            ? '<p class="note">Budget and Mid make the same swaps: the strongest cards you can get under $' +
              TIERS.mid.cap +
              ' all cost under $' +
              TIERS.budget.cap +
              '.</p>'
            : '') +
        // owner, 19 Oct ("all of them"): what all the Apex swaps do together, and the best decks with every new card under $3 and $12
        '<div class="tierx">' +
        (TS.apex.n && packLine(R, 'apex', TS.apex.n)
          ? '<p class="note tierpack">All Apex swaps together: ' + packLine(R, 'apex', TS.apex.n) + '</p>'
          : '') +
        '</div>';
    }
    const show = S.pathShow || 12,
      PT = R.paths.map(L => slotTypes(Object.values(L.opts).map(o => o.add))),
      PK = R.paths.map(L => slotKinds(d, Object.values(L.opts))),
      PV = R.paths.map((L, i) => [L, i]).filter(([, i]) => (!upT() || PT[i].has(upT())) && (!upK() || PK[i].has(upK())));
    // Sort: by how much each upgrade raises the deck score (the default), the engine's own ranking, or cheapest first.
    {
      const so = S.upSort || 'impact',
        imp = L => Math.max(...Object.values(L.opts).map(p => (p && p.dScore != null ? p.dScore : -1e9))),
        cost = L => {
          const p = tierPick(L, d.tier || 'apex') || L.opts.apex || Object.values(L.opts)[0],
            c = p && find(p.add);
          return p && p.own ? -1 : c && c.p != null ? c.p : 1e6;
        };
      if (so === 'impact') PV.sort((a, b) => imp(b[0]) - imp(a[0]) || a[1] - b[1]);
      else if (so === 'price') PV.sort((a, b) => cost(a[0]) - cost(b[0]) || a[1] - b[1]);
      // Once shown, the list keeps its order (Build 133): scores that arrive later (the Apex reference) don't move cards under
      // your finger. It re-sorts when you leave the tab, change the sort or filters, or regenerate.
      const ok = d.id + '|' + so + '|' + (upT() || '') + '|' + (upK() || '');
      if (!S.upOrd || S.upOrd.id !== d.id) S.upOrd = {id: d.id, m: {}};
      const fz = S.upOrd.m[ok];
      if (fz) {
        const pos = new Map(fz.map((c, i) => [c, i])),
          at = x => (pos.has(x[0].cut) ? pos.get(x[0].cut) : 1e6);
        PV.sort((a, b) => at(a) - at(b));
      } else if (!R.pending) S.upOrd.m[ok] = PV.map(([L]) => L.cut);
    }
    const sheet = (S.upView || 'sheet') === 'sheet' && PV.length > 0,
      si = sheet ? (S.sheetI = Math.max(0, Math.min(PV.length - 1, S.sheetI || 0))) : 0,
      sel = sheet ? sheetSel(d, R, PV[si][0], PV[si][1]) : '';
    // Build 135: swaps players mostly disagree with are left out (engine trimOf); say so, so nothing seems to be missing.
    const trimN = (R.scored && R.scored.trimmed) || 0;
    h +=
      filterBar(PT, PV.length, PK) +
      (trimN
        ? '<p class="note trimnote" style="margin:0">' +
          trimN +
          ' weaker swap' +
          (trimN === 1 ? '' : 's') +
          ' left out: players who upgrade this precon mostly keep ' +
          (trimN === 1 ? 'that card' : 'those cards') +
          ' and rarely add the replacement.</p>'
        : '') +
      (upK() && !PV.length
        ? '<p class="note" style="margin:0">No ' +
          esc(KIND_LAB[upK()].toLowerCase()) +
          ' upgrades right now' +
          (upT() ? ' of that card type' : '') +
          '.</p>'
        : '') +
      (sheet ? '<div class="sheet" data-sel="' + sel + '">' + sheetHead(d, R, PV[si][0], PV[si][1], si, PV.length, sel) : '') +
      '<div class="paths">' +
      (sheet ? [PV[si]] : PV.slice(0, show))
        .map(([L, i]) => {
          const en = d.cards.find(x => x.n === L.cut),
            step = (en && en.step) || 0;
          const fp = L.opts.free;
          const cw = (L.opts.apex || L.opts.mid || L.opts.budget || {}).cutWhy || [];
          // the explanation shares the swap-history row, so every card keeps the same 7 rows and lines up with its neighbours
          return (
            '<div class="path">' +
            side('out', L.cut, 1) +
            '<div class="cutwhy">' +
            (cw.length ? '<p class="note" style="margin:0">Why it can go: ' + esc(cw.join(' · ')) + '</p>' : '') +
            histHtml(en) +
            '</div>' +
            '<div class="prog" role="img" aria-label="Upgrade progress: ' +
            (step ? TIERS[TIER_KEYS[step - 1]].label : 'not started') +
            '">' +
            ['Now']
              .concat(TIER_KEYS.map(t => TIERS[t].label))
              .map(
                (lab, k) =>
                  '<span class="' +
                  (k <= step ? 'done' : '') +
                  (k === step ? ' here' : '') +
                  (k > 0 && L.opts[TIER_KEYS[k - 1]] ? ' has' : '') +
                  '"><i></i>' +
                  lab +
                  '</span>'
              )
              .join('') +
            '</div>' +
            (fp
              ? '<div class="tip good free"><b><small>Tip</small>Free swap · you already own this</b>' +
                side('in', fp.add, fp.q) +
                '<div class="row">' +
                scoreChip(fp.dScore) +
                gcChip(fp, R) +
                (fp.cross ? '<span class="chip warn">' + fp.from + ' → ' + fp.to + '</span>' : '') +
                fp.why
                  .slice(0, 2)
                  .map(w => '<span class="chip">' + esc(w) + '</span>')
                  .join('') +
                '</div><div class="row"><button class="btn sm" data-act="lib-not-own" data-n="' +
                esc(fp.add) +
                '">Add to buy list</button><button class="btn pri sm" data-act="swap" data-v="' +
                i +
                '|free" style="margin-left:auto">Swap</button></div></div>'
              : '<div></div>') +
            TIER_KEYS.map(t => {
              const RC = rowCols(d, R, L, i),
                col = RC[t],
                src = col && col.src,
                p = col && col.p;
              if (!p)
                return (
                  '<div class="opt none" data-t="' +
                  t +
                  '"><span class="chip">' +
                  TIERS[t].label +
                  '</span><p>' +
                  esc((col && col.note) || (L.none && L.none[t]) || 'No ' + TIERS[t].label + ' pick for this slot') +
                  '</p></div>'
                );
              const inh =
                col.kind === 'moved' && t === 'apex'
                  ? '<span class="chip gold" title="No stronger card was found for this slot, so this is its Apex card.">Best card for this slot</span>'
                  : '';
              return (
                '<div class="opt" data-t="' +
                t +
                '"><span class="chip gold">' +
                TIERS[t].label +
                '</span>' +
                side('in', p.add, p.q) +
                '<div class="row">' +
                inh +
                (p.held ? '<span class="chip" title="The alternative you chose for this slot">Your choice</span>' : '') +
                (p.own ? '<span class="chip good">You own this</span>' : '') +
                (p.pc ? pcChip(p) : col.kind === 'alt' ? scoreChip(p.dScore) : upChip(L, src) + driftChip(d, p.add, src)) +
                gcChip(p, R) +
                p.why
                  .slice(0, 2)
                  .map(w => '<span class="chip">' + esc(w) + '</span>')
                  .join('') +
                '</div>' +
                '<div class="row"><button class="btn sm" data-act="dismiss" data-n="' +
                esc(p.add) +
                '" aria-label="Remove suggestion: ' +
                esc(p.add) +
                '" title="Remove suggestion excludes that card from this deck’s recommendations. Your deck stays unchanged, and you can allow the card again under Excluded cards for this deck.">Remove suggestion</button>' +
                (col.kind === 'alt' ? '' : altBtn('up|' + i + '|' + src).replace('>See alternatives<', '>Alternate Options<')) +
                (p.own ? '' : upBuyBtn(d, p.add)) +
                '<button class="btn pri sm" data-act="swap" data-v="' +
                i +
                '|' +
                (col.kind === 'alt' ? t + '|alt' : src) +
                '" style="margin-left:auto">Swap</button></div>' +
                alt3Html(d, R, RC.shown, p, i, t) +
                '</div>'
              );
            }).join('') +
            topHtml(d, R, L, i) +
            '</div>'
          );
        })
        .join('') +
      '</div>' +
      (sheet ? '</div>' : '');
    if (!sheet && PV.length > show)
      h += '<button class="btn" data-act="path-more">Show ' + Math.min(12, PV.length - show) + ' more</button>';
    h += tierBlock;
  }
  h += '</div>';
  // the record of upgrades made, each with Undo, sits at the bottom of the list
  {
    const hs = d.cards.filter(x => x.hist && x.hist.length);
    if (hs.length)
      h +=
        '<div class="grp"><span class="lab">Upgrades you’ve made · ' +
        hs.length +
        '</span><p class="note" style="margin:0">Nothing is lost when a card is swapped out. Each slot keeps its history, and Undo puts the previous card back.</p>' +
        hs.map(histHtml).join('') +
        '</div>';
  }
  h += outHtml;
  h +=
    '<div class="grp"><span class="lab">Start the picks over</span><p class="note" style="margin:0">The list is worked out once and kept until something changes. Regenerate fetches the latest card and play data and weighs every option again, including newly released cards. Your deck, library and swap history are not touched.</p><div class="row"><button class="btn" data-act="regen">Regenerate picks</button>' +
    (d.recPrev ? '<button class="btn sm" data-act="regen-undo">Undo last regenerate</button>' : '') +
    '</div></div>';
  return h + '</div>';
}
function viewDeck() {
  const opt = (act, v, title, text) =>
    '<button class="tile" data-act="' +
    act +
    '"' +
    (v ? ' data-v="' + v + '"' : '') +
    '><div class="tb"><h3>' +
    title +
    '</h3><p>' +
    text +
    '</p></div></button>';
  return (
    '<section class="panel"><div class="ph"><h2>Build a new deck</h2><small>Saved to Decks when created</small></div><div class="tiles">' +
    opt(
      'gen-open',
      '',
      'Generate from a commander',
      'Pick a legendary creature and how to build it: best overall, theme first or around mechanics, at any price level. The full deck goes straight into your decklist, with upgrades from there.'
    ) +
    opt(
      'dycb-open',
      '',
      'Decks you can build',
      'The commanders your library fits best: how much of each deck you already own and what the rest would cost. Tap one to generate it from your cards.'
    ) +
    opt(
      'seed-open',
      '',
      'Generate from cards',
      'Don’t know your commander yet? Add any cards you want to play. The app suggests commanders that fit them and fills in the rest of the deck.'
    ) +
    opt('precon-open', '', 'Load a precon', 'Start from a real preconstructed Commander deck with its official card list.') +
    opt(
      'import-open',
      '',
      'Import a text list',
      'Paste or load a decklist you already have, from Arena, Moxfield, Archidekt or a plain text file.'
    ) +
    opt(
      'new-deck',
      'commander',
      'Empty Commander deck',
      'Start from nothing: choose a commander, set the build, and add cards yourself.'
    ) +
    opt(
      'new-deck',
      'standard',
      'Empty Standard deck',
      'Start a 60-card Standard deck: pick colors and mechanics, then add cards or fill it.'
    ) +
    '</div></section>'
  );
}
function searchResults() {
  const f = S.search,
    filt = {fmt: f.fmt, color: f.color, type: f.type, max: +f.max || 0, theme: f.theme},
    q = f.q.trim();
  if (f.prints) {
    if (DBINFO.source !== 'full')
      return '<p class="note" style="margin:0">Every-printing search needs the full card data, which is still downloading.</p>';
    if (q.length < 3)
      return '<p class="note" style="margin:0">Type at least three letters of a card name to see every printing.</p>';
    if (!S.printRes || S.printRes.q !== q) {
      if (S.printPending !== q) printSearch(q);
      return '<p class="note" style="margin:0">Searching Scryfall for every printing…</p>';
    }
    const ok = new Set(searchCards('', filt, 1e6).cards.map(c => c._n));
    const rows = S.printRes.out
      .filter(x => ok.has(x.c._n) && (!filt.max || (x.p != null && x.p <= filt.max)))
      .sort((a, b) => (b.sc === PRINT.key) - (a.sc === PRINT.key) || a.c.n.localeCompare(b.c.n) || b.yr.localeCompare(a.yr));
    return (
      '<p class="note" style="margin:0">' +
      (S.printRes.err ? 'Scryfall could not be reached. ' : '') +
      rows.length +
      ' printing' +
      (rows.length === 1 ? '' : 's') +
      (rows.length > 120 ? ' · showing the first 120' : '') +
      (PRINT.key && rows.some(x => x.sc === PRINT.key) ? ' · your commander’s set first' : '') +
      '</p><div class="cards">' +
      rows
        .slice(0, 120)
        .map(x => cardHtml(x.c, true, x, upBadge(x.c)))
        .join('') +
      '</div>'
    );
  }
  let r = f.sort || f.what ? searchCards(f.q, filt, 1e6) : searchCards(f.q, filt, 60);
  if (f.what && WHAT_BY[f.what]) {
    const F = WHAT_BY[f.what].f,
      cards = r.cards.filter(c => F(c));
    r = {total: cards.length, cards};
  }
  if (f.sort) r = sortSearch(r, f.sort);
  else if (f.what) r = {total: r.total, cards: r.cards.slice(0, 60)};
  return (
    '<p class="note" style="margin:0">' +
    r.total.toLocaleString() +
    ' card' +
    (r.total === 1 ? '' : 's') +
    (r.total > 60 ? ' · showing the first 60' : '') +
    (r.how ? ' · ' + esc(r.how) : '') +
    ' · ' +
    (DBINFO.source === 'starter' ? 'starter library' : 'full database') +
    (PRINT.key && PRINT.map.size ? ' · showing your commander’s set printing where one exists' : '') +
    (UPX.busy
      ? ' · checking your decks for upgrades…'
      : r.cards.some(c => upFor(c).length)
        ? ' · cards marked “Upgrade” are suggested for one of your decks'
        : '') +
    '</p><div class="cards">' +
    r.cards.map(c => cardHtml(c, true, null, upBadge(c))).join('') +
    '</div>'
  );
}
// Card search "What it does": plain-word filters on what a card's rules text does. Each is a pattern on the text (so a few
// unusual wordings can be missed); every filter is checked against a list of known cards that must and must not match.
const WHAT = [
  [
    'treasure',
    'Makes Treasure',
    c => /\bcreates? (a|an|one|two|three|x|that many|\w+) (tapped )?Treasure tokens?|\bTreasure tokens? for each/i.test(c.o)
  ],
  ['tokens', 'Makes creature tokens', c => /\bcreate[s]? [^.]*\bcreature tokens?/i.test(c.o)],
  [
    'diesdraw',
    'Draws when a creature dies',
    c => /whenever [^.]*(creature|creatures)[^.]* dies[^.]*draw|whenever equipped creature dies, draw/i.test(c.o)
  ],
  [
    'sacout',
    'Sacrifice outlet',
    c => /(^|\n|, )Sacrifice (a|another) (creature|artifact|permanent|nonland permanent)[^:.\n]*:/i.test(c.o)
  ],
  [
    'aristocrat',
    'Drains when a creature dies',
    c => /whenever [^.]*creature[^.]* dies[^.]*(loses? \d+ life|deals? \d+ damage to (each|target) (opponent|player))/i.test(c.o)
  ],
  ['counters', '+1/+1 counters', c => /\+1\/\+1 counters?/i.test(c.o)],
  [
    'doubler',
    'Doubles tokens or counters',
    c => /(creates? twice that many|twice that many (of those )?(tokens|counters)|that many plus one)/i.test(c.o)
  ],
  ['recursion', 'Returns cards from your graveyard', c => /return [^.]*from your graveyard/i.test(c.o)],
  [
    'gyhate',
    'Exiles graveyards',
    c =>
      /exile (target player's|each opponent's|all|target|each) graveyards?|exile all graveyards|exile all cards from (all|target player's) graveyards?/i.test(
        c.o
      )
  ],
  [
    'blink',
    'Flickers (exile, then return)',
    c => /exile [^.]*(, then return|\. return (it|that card|those cards|them) to the battlefield)/i.test(c.o)
  ],
  ['lifegain', 'Gains you life', c => /\byou gain (\d+|x|that much|life equal|an amount)|\byou gain life\b/i.test(c.o)],
  ['castdraw', 'Draws when you cast a kind of spell', c => /whenever you cast an? [^.]*spell, (you may )?draw/i.test(c.o)],
  [
    'costless',
    'Makes spells cost less',
    c => /cost[s]? \{\d+\} less to cast|cost[s]? \{[WUBRGC]\} less to cast|cost[s]? (\d+|x) less/i.test(c.o)
  ],
  ['combat', 'Extra combat', c => /additional combat phase/i.test(c.o)],
  [
    'copy',
    'Copies spells',
    c => /copy target (instant|sorcery|instant or sorcery|activated|triggered)? ?(spell|ability)/i.test(c.o)
  ],
  ['haste', 'Gives your creatures haste', c => /creatures you control (have|gain) [^.]*haste/i.test(c.o)],
  ['mill', 'Mills', c => /\bmills? (\d+|x|that many|a|two|three|four|five|ten) cards?|\bmill (\d+|x)\b/i.test(c.o)],
  ['untapper', 'Untaps permanents', c => /untap (all|target|each|up to)/i.test(c.o)]
];
const WHAT_BY = Object.fromEntries(WHAT.map(([k, l, f]) => [k, {l, f}]));
// Card search sort, by the app's own measures: how often it is played, price, the job it does, or how well it fits the deck
// you have open (the value that deck's upgrades are chosen by). Applied to every match, then the first 60 are shown.
const SEARCH_JOBS = ['ramp', 'draw', 'removal', 'wipe', 'protect', 'counter', 'tutor'],
  JOB_LAB = {
    ramp: 'ramp',
    draw: 'card draw',
    removal: 'removal',
    wipe: 'board wipes',
    protect: 'protection',
    counter: 'counterspells',
    tutor: 'tutors'
  };
function sortDeck() {
  const d = cur();
  return d && d.format === 'commander' && find(d.commander) && analyze(d).size >= 60 ? d : null;
}
function sortSearch(r, by) {
  const L = r.cards.slice(),
    pop = c => c.r || 1e6;
  let how = '';
  if (by === 'pop') {
    L.sort((a, b) => pop(a) - pop(b) || a.n.localeCompare(b.n));
    how = 'most played first';
  } else if (by === 'cheap' || by === 'dear') {
    const k = by === 'cheap' ? 1 : -1;
    L.sort((a, b) => (a.p == null) - (b.p == null) || k * ((a.p || 0) - (b.p || 0)) || pop(a) - pop(b));
    how = by === 'cheap' ? 'cheapest first' : 'most expensive first';
  } else if (by === 'role') {
    const j = c => {
      const R = tags(c).roles,
        i = SEARCH_JOBS.findIndex(x => R.has(x));
      return i < 0 ? 99 : i;
    };
    L.sort((a, b) => j(a) - j(b) || pop(a) - pop(b));
    how = 'by job: ramp, card draw, removal, board wipes, protection, counterspells, tutors, then the rest';
  } else if (by === 'deck') {
    const d = sortDeck(),
      R = d && recsFor(d);
    if (R && R.valOf) {
      const id = ctxOf(d).ident,
        ok = c => c.ci.every(x => id.includes(x)) && legalIn(c, d.format),
        V = new Map();
      // the deck's value is worked out for the 1,500 most played matches; rarer cards follow by popularity
      L.sort((a, b) => pop(a) - pop(b));
      L.slice(0, 1500).forEach(c => {
        if (ok(c)) V.set(c, R.valOf(c));
      });
      L.sort((a, b) => V.has(b) - V.has(a) || (V.get(b) || 0) - (V.get(a) || 0) || pop(a) - pop(b));
      how = 'best for ' + d.name + ' first (cards outside its colours last)';
    } else how = 'open a full Commander deck to sort by how well cards fit it';
  }
  return {total: r.total, cards: L.slice(0, 60), how};
}
function viewSearch() {
  clearTimeout(viewSearch.t);
  viewSearch.t = setTimeout(buildUpgradeIndex, 1500); // after the player pauses; decks already indexed cost nothing
  const f = S.search,
    opt = (v, l, curv) => '<option value="' + v + '"' + (v === curv ? ' selected' : '') + '>' + l + '</option>';
  return (
    '<section class="panel"><div class="ph"><h2>Card search</h2><small>Tap a card for full details</small></div><div class="filters">' +
    '<input type="search" id="s-q" placeholder="Name, type or rules text" value="' +
    esc(f.q) +
    '" autocomplete="off">' +
    '<select id="s-prints" aria-label="Printings">' +
    opt('', 'One per card', f.prints ? '1' : '') +
    opt('1', 'Every printing', f.prints ? '1' : '') +
    '</select>' +
    '<select id="s-fmt" aria-label="Format">' +
    opt('', 'Any format', f.fmt) +
    opt('commander', 'Commander', f.fmt) +
    opt('standard', 'Standard', f.fmt) +
    '</select>' +
    '<select id="s-color" aria-label="Color">' +
    opt('', 'Any color', f.color) +
    [
      ['W', 'White'],
      ['U', 'Blue'],
      ['B', 'Black'],
      ['R', 'Red'],
      ['G', 'Green'],
      ['C', 'Colorless']
    ]
      .map(x => opt(x[0], x[1], f.color))
      .join('') +
    '</select>' +
    '<select id="s-type" aria-label="Card type">' +
    opt('', 'Any type', f.type) +
    ['Creature', 'Instant', 'Sorcery', 'Artifact', 'Enchantment', 'Planeswalker', 'Land', 'Legendary']
      .map(x => opt(x, x, f.type))
      .join('') +
    '</select>' +
    '<select id="s-max" aria-label="Price">' +
    opt('', 'Any price', f.max) +
    opt('3', 'Budget ≤ $3', f.max) +
    opt('12', 'Mid ≤ $12', f.max) +
    '</select>' +
    '<select id="s-theme" aria-label="Mechanic">' +
    opt('', 'Any mechanic', f.theme) +
    themeKeys()
      .filter(k => k !== 'tribal')
      .map(k => opt(k, THEMES[k].label, f.theme))
      .join('') +
    '</select>' +
    '<select id="s-what" aria-label="What it does">' +
    opt('', 'Does anything', f.what || '') +
    WHAT.map(([k, l]) => opt(k, l, f.what || '')).join('') +
    '</select>' +
    '<select id="s-sort" aria-label="Sort">' +
    opt('', 'Sort: best match', f.sort || '') +
    opt('pop', 'Sort: most played', f.sort || '') +
    opt('cheap', 'Sort: cheapest', f.sort || '') +
    opt('dear', 'Sort: most expensive', f.sort || '') +
    opt('role', 'Sort: by job', f.sort || '') +
    (sortDeck() ? opt('deck', 'Sort: best for ' + esc(sortDeck().name), f.sort || '') : '') +
    '</select>' +
    '</div><div id="s-res" class="grp">' +
    searchResults() +
    '</div></section>'
  );
}
function loadPrecon(p) {
  const cards = PRECON_LISTS[p.name].split(';').map(x => {
    const m = /^(\d+) (.+)$/.exec(x),
      n = m ? m[2] : x,
      c = find(n),
      e = {n: c ? c.n : n, q: m ? +m[1] : 1, l: false};
    if (c && norm(n) !== c._n && altName(n)) e.pn = n;
    return e;
  });
  const d = newDeck({
    name: p.name,
    format: 'commander',
    cards,
    aims: p.aims.slice(),
    tribe: p.tribe || '',
    auto: 'precon',
    src: 'precon'
  });
  setCommander(d, p.cmd);
  if (p.tribe) d.tribe = p.tribe;
  return d;
}
// Precon picker: the 16 built-in decks are always there; the full catalogue and other decklists come live from EDHREC.
let PRE = {state: '', list: []};
async function loadPreIndex() {
  if (PRE.state) return;
  PRE.state = 'loading';
  const c = lsGet('dc.preidx');
  if (c && Date.now() - c.ts < 7 * 864e5 && c.list.length) {
    PRE = {state: 'ok', list: c.list};
    return;
  }
  try {
    const j = await (await fetch('https://json.edhrec.com/pages/precon.json')).json(),
      list = [],
      seen = new Set();
    ((j.container && j.container.json_dict && j.container.json_dict.cardlists) || []).forEach(L =>
      (L.cardviews || []).forEach(v => {
        const slug = String(v.url || '')
          .split('/')
          .pop();
        if (v.label && slug && !seen.has(slug)) {
          seen.add(slug);
          list.push([v.label, v.name || '', String(v.set || '').toUpperCase(), slug]);
        }
      })
    );
    if (!list.length) throw new Error('empty');
    PRE = {state: 'ok', list};
    lsSet('dc.preidx', {ts: Date.now(), list});
  } catch (e) {
    PRE.state = 'fail';
  }
}
function preRows(q) {
  const nq = norm(q || ''),
    have = new Set(PRECONS.map(p => norm(p.name)));
  const all = PRECONS.map((p, i) => ({i, name: p.name, cmd: p.cmd, note: p.note, tag: p.level, set: p.set + ' · ' + p.year}))
    .concat(PRE.list.filter(x => !have.has(norm(x[0]))).map(x => ({slug: x[3], name: x[0], cmd: x[1], set: x[2]})))
    .filter(x => !nq || norm(x.name + ' ' + x.cmd + ' ' + x.set).includes(nq));
  const rows = all
    .slice(0, 50)
    .map(x => {
      const c = find(x.cmd);
      return (
        '<div class="pre"><img alt="" src="' +
        artFor(c || {n: x.name, t: 'Creature', o: '', ci: []}) +
        '"><div style="min-width:0"><b>' +
        esc(x.name) +
        '</b> ' +
        (c ? c.ci.map(k => '<i class="pip p' + k + '">' + k + '</i>').join('') : '') +
        '<div class="note">' +
        esc(x.cmd) +
        (x.note ? ' · ' + esc(x.note) : '') +
        '</div><div class="why">' +
        (x.tag ? '<span class="chip gold">' + esc(x.tag) + '</span>' : '') +
        '<span class="chip">' +
        esc(x.set) +
        '</span></div></div><div class="acts"><button class="btn pri sm" ' +
        (x.slug
          ? 'data-act="precon-live" data-v="' + esc(x.slug) + '" data-n="' + esc(x.name) + '"'
          : 'data-act="precon" data-v="' + x.i + '"') +
        '>Load</button></div></div>'
      );
    })
    .join('');
  const status =
    PRE.state === 'ok'
      ? all.length +
        ' of ' +
        (PRECONS.length + PRE.list.filter(x => !have.has(norm(x[0]))).length) +
        ' precons' +
        (all.length > 50 ? ' · showing 50, type to narrow down' : '')
      : PRE.state === 'loading'
        ? 'Loading the full precon catalogue…'
        : 'Showing the ' + PRECONS.length + ' built-in precons. The full catalogue could not be loaded.';
  return '<p class="note" style="margin:0">' + status + '</p>' + (rows || '<p class="note">No precon matches that search.</p>');
}
function openPrecons() {
  $('#modal').innerHTML =
    '<div class="panel" role="dialog" aria-label="Load a precon"><div class="ph"><h2>Load a precon</h2><button class="ico" data-act="close" aria-label="Close">×</button></div><input type="search" id="pre-q" placeholder="Search by deck name, commander or set code" autocomplete="off"><div class="grp" id="pre-list">' +
    preRows('') +
    '</div><p class="note" style="margin:0">Official decklists from EDHREC’s precon pages. Loading one adds it as a new deck.</p></div>';
  $('#modal').hidden = false;
  loadPreIndex().then(() => {
    const el = $('#pre-list'),
      q = $('#pre-q');
    if (el && q) el.innerHTML = preRows(q.value);
  });
}
// After a precon is loaded or a list imported: how should it be upgraded? The deck itself never changes here; the answer
// only steers the suggestions (the same choices the generator offers: the plan to follow, card sets, the tier to aim for).
async function openUpgradeAsk() {
  const d = cur();
  if (!d || d.format !== 'commander') return;
  S.uaOpen = true;
  S.modalCard = null;
  const c = find(d.commander),
    ctx = ctxOf(d),
    lab = a => (a === 'tribal' ? (ctx.tribe || 'Tribal') + ' tribal' : aimLabel(a, ctx.tribe));
  if (c && EDH.key !== c.n) {
    $('#modal').innerHTML =
      '<div class="panel"><p class="note" style="margin:0">Reading what ' + esc(c.n.split(',')[0]) + ' players build…</p></div>';
    $('#modal').hidden = false;
    try {
      await loadEdh(c.n);
    } catch (e) {}
    if (!S.uaOpen || cur() !== d) return;
  }
  const edh = c && EDH.key === c.n && EDH.state === 'ok' ? (EDH.tags || []).slice(0, 3) : [],
    mode = d.uaMode || (d.custom ? 'custom' : 'keep');
  const opt = (v, title, text) =>
    '<button class="tile' +
    (mode === v ? ' on' : '') +
    '" data-act="ua-plan" data-v="' +
    v +
    '" aria-pressed="' +
    (mode === v) +
    '"><div class="tb"><h3>' +
    title +
    '</h3><p>' +
    text +
    '</p></div></button>';
  const tierB = t =>
    '<button class="btn sm' +
    (d.tier === t ? ' pri' : '') +
    '" data-act="ua-tier" data-v="' +
    t +
    '" aria-pressed="' +
    (d.tier === t) +
    '">' +
    TIERS[t].label +
    (t === 'apex' ? ' · any price' : ' · under $' + TIERS[t].cap) +
    '</button>';
  $('#modal').innerHTML =
    '<div class="panel" role="dialog" aria-label="How do you want to upgrade this deck?"><div class="ph"><h2>How do you want to upgrade ' +
    esc(d.name) +
    '?</h2><button class="ico" data-act="ua-done" aria-label="Close">×</button></div>' +
    '<p class="note" style="margin:0">Your deck stays exactly as it is. These choices only steer what Upgrades suggests, the same way they steer a generated deck.</p>' +
    '<div class="grp"><span class="lab">The plan to upgrade toward</span><div class="tiles">' +
    opt('keep', 'Keep the deck’s own plan', d.aims.length ? d.aims.map(lab).join(' › ') : 'What the cards already do') +
    (edh.length
      ? opt('edh', 'What players build ' + esc(c.n.split(',')[0]) + ' around', edh.map(t => esc(t.label)).join(' › '))
      : '') +
    opt('custom', 'Choose my own mechanics', 'Rank mechanics, creature types and keywords yourself in the Build panel') +
    '</div></div>' +
    '<div class="grp"><span class="lab">Tier to aim for</span><div class="row">' +
    TIER_KEYS.map(tierB).join('') +
    '</div><p class="note" style="margin:0">Every tier is always shown; this is the one the deck score and tier meter measure against.</p></div>' +
    '<div class="grp"><span class="lab">Card sets · optional</span>' +
    setFilterHtml(d.sets || [], d.setsMust, 'dset') +
    '<p class="note" style="margin:0">Cards from your commander’s own set and on-theme cards are always preferred when they are about as strong.</p></div>' +
    '<div class="row"><button class="btn pri" data-act="ua-done">Show my upgrades</button></div></div>';
  $('#modal').hidden = false;
}
async function loadPreconLive(slug, label) {
  toast('Loading ' + label + '…');
  try {
    const j = await (await fetch('https://json.edhrec.com/pages/precon/' + slug + '.json')).json(),
      dk = j.deck || {},
      cmds = dk.commander || [],
      map = new Map();
    const put = (n, q) => {
      const c = find(n),
        name = c ? c.n : n,
        k = norm(name);
      if (map.has(k)) map.get(k).q += q;
      else {
        const e = {n: name, q, l: false};
        if (c && norm(n) !== c._n && altName(n)) e.pn = n;
        map.set(k, e);
      }
    };
    Object.values(dk.cards || {}).forEach(arr =>
      (arr || []).forEach(t => {
        if (t && t[0]) put(t[0], +t[1] || 1);
      })
    );
    cmds.slice(2).forEach(n => put(n, 1));
    if (cmds[1] && !(find(cmds[0]) && find(cmds[1]) && canPair(find(cmds[0]), find(cmds[1])))) put(cmds[1], 1);
    if (!map.size) throw new Error('empty');
    const d = newDeck({name: dk.name || label, format: 'commander', cards: [...map.values()], src: 'precon'});
    if (cmds[0]) {
      setCommander(d, cmds[0]);
      if (cmds[1] && find(cmds[0]) && find(cmds[1]) && canPair(find(cmds[0]), find(cmds[1]))) setPartner(d, cmds[1]);
      const v2 = (dk.commander_v2 || [])[0];
      if (v2 && v2[2] && find(cmds[0])) d.cmdSet = v2[2];
    }
    if (d.aims.length) d.auto = 'precon';
    touch();
    render();
    if (!S.noAsk) openUpgradeAsk();
    const unk = d.cards.filter(e => !find(e.n)).length;
    toast(
      'Loaded ' +
        d.name +
        ' (' +
        analyze(d).size +
        ' cards).' +
        (unk ? ' ' + unk + ' need the full card data to show details.' : '')
    );
  } catch (e) {
    toast('That decklist could not be loaded from EDHREC.');
  }
}
// Generate from a commander: a commander with Partner (or a Background, or a Doctor's companion) can take its second
// commander before the deck is designed, so the build uses both commanders' colors and strategies from the start.
function genPartnerBox(c) {
  const k = pairKind(c);
  if (!k || k === 'isbg') return '';
  const p = find(S.gen.partner),
    d0 = {format: 'commander', commander: c.n, aims: [], cards: [], colors: []},
    ctx = ctxOf(d0);
  const res = LIB.filter(x => x.cmd && canPair(c, x))
    .map(x => ({c: x, s: baseScore(x, d0, Object.assign({}, ctx, {focus: x.ci, ident: x.ci, edh: null})).s}))
    .sort((a, b) => b.s - a.s)
    .slice(0, 8);
  if (!res.length) return '';
  return (
    '<div class="grp"><span class="lab">Second commander · optional (' +
    esc(pairLabel(c)) +
    ')</span><div class="row">' +
    '<button class="chip' +
    (p ? '' : ' gold') +
    '" data-act="gen-partner" data-n="" aria-pressed="' +
    !p +
    '">None</button>' +
    res
      .map(
        x =>
          '<button class="chip' +
          (p && p.n === x.c.n ? ' gold' : '') +
          '" data-act="gen-partner" data-n="' +
          esc(x.c.n) +
          '" aria-pressed="' +
          !!(p && p.n === x.c.n) +
          '">' +
          esc(x.c.n.split(',')[0]) +
          ' ' +
          x.c.ci.map(z => '<i class="pip p' + z + '">' + z + '</i>').join('') +
          '</button>'
      )
      .join('') +
    '</div>' +
    (p
      ? '<p class="note" style="margin:0">The deck will be designed for ' +
        esc(c.n.split(',')[0]) +
        ' and ' +
        esc(p.n.split(',')[0]) +
        ' together: ' +
        ctxOf(Object.assign({}, d0, {partner: p.n})).ident.join('') +
        ' colors.</p>'
      : '') +
    '</div>'
  );
}
// Customize menu: design a new build for this deck's commander(s) with the current mechanics (in order), filters and colors.
// It opens as a new, unsaved deck; this deck is not changed. Cards held in this deck are kept in the new build.
async function regenBuild(d) {
  const c = find(d.commander);
  if (!c || d.format !== 'commander') return null;
  const seeds = d.cards
    .filter(e => e.l)
    .map(e => find(e.n))
    .filter(Boolean);
  const nd = newDeck(
    {
      name: d.name.replace(/ \(generated\)$/, '') + ' (generated)',
      format: 'commander',
      tier: 'apex',
      src: 'generated',
      aims: d.aims.slice(),
      tribe: d.tribe || '',
      colors: (d.colors || []).slice(),
      types: (d.types || []).slice(),
      keys: (d.keys || []).slice(),
      typesMust: !!d.typesMust,
      keysMust: !!d.keysMust,
      sets: (d.sets || []).slice(),
      setsMust: !!d.setsMust,
      custom: true,
      aimAuto: d.aimAuto
    },
    true
  );
  setCommander(nd, c.n);
  if (d.partner) {
    const p = find(d.partner);
    if (p && canPair(c, p)) nd.partner = p.n;
  }
  nd.colors = (d.colors || []).length ? d.colors.slice() : ctxOf(nd).ident.slice();
  nd.tribe = d.tribe || nd.tribe; // setCommander resets them; keep the player's
  if (d.themeFirst) nd.themeFirst = true;
  const tier = S.gen.tier || 'apex',
    k = (await genRun(nd, seeds, S.gen.own ? ownSet() : null, ownSet(), tier)).k;
  openDraft(nd);
  S.planShow = 0;
  S.tab = 'list';
  toast('Built a new ' + k + '-card deck with your mechanics at ' + TIERS[tier].label + '. Your original deck is unchanged.');
  return nd;
}
// Build by theme (owner, 18 Oct): pick what the deck should do (and, if you like, its colours or creature type); the app ranks the
// commanders that build around it, by how much the commander itself cares about the theme, how many strong cards for it exist in
// its colours, and how proven the commander is, then generates the deck with that theme as its first mechanic.
const THEME_EDH = {
  tokens: /token|go-wide/,
  counters: /counter/,
  graveyard: /reanimat|graveyard|self-mill|dredge/,
  sacrifice: /aristocrat|sacrifice/,
  spells: /spell/,
  artifacts: /artifact/,
  enchantments: /enchant/,
  lifegain: /lifegain|life-gain|drain/,
  lands: /land/,
  voltron: /voltron|equipment|aura/,
  blink: /blink|flicker|etb/,
  burn: /burn/,
  aggro: /aggro|combat/,
  control: /control|stax/,
  draw: /draw|wheel/
};
function themeCards(k, tribe) {
  const key = k + '|' + (tribe || '') + '|' + LIB.length;
  if (themeCards.k === key) return themeCards.v;
  const tre = tribe ? new RegExp('\\b' + tribe + (tribe === 'Elf' ? '|\\bElves' : '') + 's?\\b') : null;
  const v = LIB.filter(
    c =>
      c.cmd &&
      !tags(c).land &&
      c.r &&
      c.r < 6000 &&
      (k === 'tribal' ? tre && (tre.test(frontType(c)) || tre.test(c.o || '')) : tags(c).th[k] === 1)
  );
  themeCards.k = key;
  themeCards.v = v;
  return v;
}
function themeCommanders(k, tribe, colors, n) {
  if (k === 'tribal' && !tribe) return [];
  const pool = themeCards(k, tribe),
    tre = tribe ? new RegExp('\\b' + tribe + (tribe === 'Elf' ? '|Elves' : '') + 's?\\b') : null,
    out = [];
  for (const c of LIB) {
    if (!c.cmd || !canLead(c) || !colors.every(x => c.ci.includes(x))) continue;
    const st = detectStrategy(c),
      own =
        k === 'tribal'
          ? st.tribe === tribe
            ? 2
            : tre.test(c.o || '')
              ? 1.5
              : tre.test(frontType(c))
                ? 0.5
                : 0
          : st.themes[0] === k
            ? 2
            : st.themes.includes(k)
              ? 1.5
              : tags(c).th[k] === 1
                ? 1
                : 0;
    if (!own) continue;
    const deep = pool.filter(x => x.ci.every(z => c.ci.includes(z))).length,
      pop = c.r ? Math.max(0, 1 - Math.log(c.r + 1) / Math.log(40000)) : 0;
    out.push({n: c.n, s: 2 * own + 1.5 * Math.min(1, deep / 150) + 1.5 * pop, deep, own});
  }
  return out.sort((a, b) => b.s - a.s).slice(0, n || 8);
}
function themeBuildBox() {
  const g = S.gen,
    k = g.tk || '',
    cols = g.tcol || [],
    tribe = g.ttribe || '';
  let h =
    '<div class="grp" id="themebuild"><span class="lab">Or start from a theme</span><p class="note" style="margin:0">Pick what the deck should do. The Deck Builder suggests the commanders that build around it best, then designs the deck with that theme first.</p><div class="row" role="group" aria-label="Theme">' +
    themeKeys()
      .map(
        t =>
          '<button class="btn sm' +
          (k === t ? ' pri' : '') +
          '" data-act="gen-tpick" data-v="' +
          t +
          '" aria-pressed="' +
          (k === t) +
          '">' +
          esc(THEMES[t].label) +
          '</button>'
      )
      .join('') +
    '</div>';
  if (!k) return h + '</div>';
  if (k === 'tribal')
    h +=
      '<div class="row"><label class="lab" for="gen-ttribe" style="margin:0">Creature type</label><select id="gen-ttribe" aria-label="Creature type"><option value="">Choose a type</option>' +
      TRIBES.slice()
        .sort()
        .map(t => '<option' + (t === tribe ? ' selected' : '') + '>' + esc(t) + '</option>')
        .join('') +
      '</select></div>';
  h +=
    '<div class="row" role="group" aria-label="Colours"><span class="lab" style="margin:0">Colours · optional</span>' +
    'WUBRG'
      .split('')
      .map(
        x =>
          '<button class="btn sm' +
          (cols.includes(x) ? ' pri' : '') +
          '" data-act="gen-tcol" data-v="' +
          x +
          '" aria-pressed="' +
          cols.includes(x) +
          '"><i class="pip p' +
          x +
          '">' +
          x +
          '</i></button>'
      )
      .join('') +
    '</div>';
  if (k === 'tribal' && !tribe)
    return h + '<p class="note" style="margin:0">Choose a creature type to see its commanders.</p></div>';
  if (!DBINFO.complete)
    h += '<p class="note" style="margin:0">Card data is still downloading, so more commanders appear when it finishes.</p>';
  const L = themeCommanders(k, tribe, cols, g.tmore ? 30 : 8),
    lab = k === 'tribal' ? tribe + ' tribal' : THEMES[k].label;
  h += L.length
    ? L.map(x => {
        const c = find(x.n),
          why = [
            x.own >= 2 ? 'Built around ' + lab : 'Supports ' + lab,
            x.deep + ' strong ' + lab + ' cards in its colours'
          ].concat(c.r && c.r < 1500 ? ['Popular commander'] : []);
        return (
          '<div class="pre"><img alt="" src="' +
          artFor(c) +
          '"><div style="min-width:0"><b>' +
          esc(c.n) +
          '</b> ' +
          c.ci.map(z => '<i class="pip p' + z + '">' + z + '</i>').join('') +
          '<div class="why">' +
          why.map(w => '<span class="chip">' + esc(w) + '</span>').join('') +
          '</div></div><div class="acts"><button class="btn sm" data-act="card" data-n="' +
          esc(c.n) +
          '">View</button><button class="btn pri sm" data-act="gen-tbuild" data-n="' +
          esc(c.n) +
          '">Build</button></div></div>'
        );
      }).join('') +
      (L.length >= 8
        ? '<div class="row"><button class="btn sm" data-act="gen-tmore">' +
          (g.tmore ? 'Fewer commanders' : 'More commanders, including less-known ones') +
          '</button></div>'
        : '')
    : '<p class="note" style="margin:0">No commander builds around ' +
      esc(lab) +
      (cols.length ? ' in these colours' : '') +
      '. Try fewer colours.</p>';
  return (
    h +
    '<span class="lab">Price level</span><div class="row" role="group" aria-label="Price level">' +
    TIER_KEYS.slice()
      .reverse()
      .map(
        t =>
          '<button class="btn sm' +
          ((g.tier || 'apex') === t ? ' pri' : '') +
          '" data-act="gen-tier" data-v="' +
          t +
          '" aria-pressed="' +
          ((g.tier || 'apex') === t) +
          '">' +
          TIERS[t].label +
          '</button>'
      )
      .join('') +
    '</div><p class="note" style="margin:0">' +
    GEN_PRICE[g.tier || 'apex'] +
    '</p>' +
    genBudgetBox(null, 'gen-tbudget') +
    '</div>'
  );
}
// Picking a commander for Generate asks first (owner, 24 Oct): its art, type, rules text, colours, price and how many decks
// players have built with it, then Build with it or Pick another.
function genConfirm(n) {
  const c = find(n);
  if (!c) return;
  const st = detectStrategy(c),
    ed = EDH.key === c.n && EDH.state === 'ok' && EDH.decks;
  $('#modal').innerHTML =
    '<div class="panel" role="dialog" aria-label="Use this commander?"><div class="ph"><h2>Build a deck with ' +
    esc(c.n.split(' // ')[0]) +
    '?</h2><button class="ico" data-act="gen-pick-back" aria-label="Back">×</button></div><div class="detail gconfirm">' +
    cardHtml(c, false) +
    '<div class="grp"><b>' +
    esc(c.n) +
    '</b><p class="note" style="margin:0">' +
    esc(c.t || '') +
    (c.m ? ' · ' + esc(c.m) : '') +
    '</p><p style="white-space:pre-line;margin:6px 0">' +
    esc(c.o || '') +
    '</p>' +
    (c.pt ? '<p class="note" style="margin:0">' + esc(c.pt) + '</p>' : '') +
    '<div class="row">' +
    (c.ci.length ? c.ci : ['C']).map(k => '<span class="chip">' + k + '</span>').join('') +
    '<span class="chip">' +
    money(c) +
    '</span>' +
    (ed ? '<span class="chip good">' + ed.toLocaleString() + ' decks on EDHREC</span>' : '') +
    '</div>' +
    (st.themes.length
      ? '<span class="lab">Strategy it will follow</span><div class="row">' +
        st.themes
          .map(k => '<span class="chip gold">' + (k === 'tribal' ? st.tribe + ' tribal' : THEMES[k].label) + '</span>')
          .join('') +
        '</div>'
      : '') +
    '<div class="row" style="margin-top:10px"><button class="btn pri" data-act="gen-pick-ok" data-n="' +
    esc(c.n) +
    '">Build with this commander</button><button class="btn" data-act="gen-pick-back">Pick another</button></div></div></div></div>';
  $('#modal').hidden = false;
}
// While a generated deck is built: the commander's art and what the app is doing now (setStatus fills #genbuild-msg), until the
// new deck opens.
function genBuilding(c) {
  $('#modal').innerHTML =
    '<div class="panel" role="dialog" aria-label="Building your deck" id="genbuild"><div class="ph"><h2>Building your ' +
    esc(c.n.split(',')[0]) +
    ' deck</h2></div><div class="detail">' +
    cardHtml(c, false) +
    '<div class="grp"><p class="note think" id="genbuild-msg" style="margin:0">Getting ready…</p><p class="note" style="margin:0">This takes a few seconds (longer on a phone). The new deck opens here when it is ready.</p></div></div></div>';
  $('#modal').hidden = false;
}
function openGenerate() {
  genPrefetchSoon();
  S.gen = Object.assign({tier: 'apex', best: true, theme: false, mech: [], warn: ''}, S.gen);
  if (!TIERS[S.gen.tier]) S.gen.tier = 'apex';
  if (!S.setList && !S.setErr)
    ensureSets().then(() => {
      if (S.setList && !$('#modal').hidden && $('#gen-q')) openGenerate();
    });
  const g = S.gen,
    c = find(g.cmd),
    st = detectStrategy(c);
  let h =
    '<div class="panel" role="dialog" aria-label="Generate from a commander"><div class="ph"><h2>Generate from a commander</h2><button class="ico" data-act="close" aria-label="Close">×</button></div><p class="note" style="margin:0">Pick any legendary creature and how to build it. The Deck Builder builds the full 100 cards straight into a new deck, then offers upgrades from there.</p>' +
    '<div class="grp"><label class="lab" for="gen-q">Commander</label><div class="dd"><input type="search" id="gen-q" placeholder="Search commanders" autocomplete="off"><div class="ddl" id="gen-res" hidden></div></div></div>';
  if (c)
    h +=
      '<div class="detail">' +
      cardHtml(c, false) +
      '<div class="grp"><span class="lab">Strategy it will follow</span><div class="row">' +
      (st.themes.length
        ? st.themes
            .map(k => '<span class="chip gold">' + (k === 'tribal' ? st.tribe + ' tribal' : THEMES[k].label) + '</span>')
            .join('')
        : '<span class="note">No built-in strategy detected. The deck opens in the Builder so you can pick the mechanics, then fill it.</span>') +
      '</div>' +
      genPartnerBox(c) +
      genModeBox(c, st) +
      playerSel('gen-player', S.gen.player || '') +
      '<div class="grp"><span class="lab">Card sets · optional</span>' +
      setFilterHtml(S.gen.sets || [], S.gen.setsMust, 'gset') +
      '<p class="note" style="margin:0">' +
      ((S.gen.sets || []).length
        ? S.gen.setsMust
          ? 'Only cards printed in these sets (and basic lands) go into the build.'
          : 'Cards printed in these sets are preferred.'
        : 'Build from one set or a few: add a set, then choose Preferred or Only these sets.') +
      '</p></div>' +
      ownToggle('gen') +
      '<div class="row">' +
      edhNote(c) +
      '</div>' +
      (DBINFO.complete
        ? '<div class="row"><button class="btn pri" data-act="gen-go"' +
          (EDH.key === c.n && EDH.state === 'loading' ? ' disabled' : '') +
          '>Generate this deck</button></div>'
        : '<div class="gate"><b>Card data is still downloading</b>' +
          (DBINFO.source === 'full'
            ? 'Only ' + DBINFO.count.toLocaleString() + ' cards are loaded so far'
            : 'Only the ' + DBINFO.count + '-card starter list is loaded') +
          ', so a deck generated now would miss most of what fits this commander. This button unlocks by itself when the download finishes.<div class="row" style="margin-top:10px"><button class="btn pri" disabled>Generate this deck</button><button class="btn" data-act="gen-go">Generate anyway</button></div></div>') +
      '</div></div>';
  h += themeBuildBox();
  h +=
    '<div class="grp"><span class="lab">Or a 60-card Standard deck from a theme</span>' +
    STD_STARTERS.map(
      (p, i) =>
        '<div class="pre" style="grid-template-columns:minmax(0,1fr) auto"><div style="min-width:0"><b>' +
        esc(p.name) +
        '</b> ' +
        p.colors.map(x => '<i class="pip p' + x + '">' + x + '</i>').join('') +
        '<div class="note">' +
        esc(p.note) +
        '</div></div><div><button class="btn pri sm" data-act="std-starter" data-v="' +
        i +
        '">Generate</button></div></div>'
    ).join('') +
    '</div></div>';
  $('#modal').innerHTML = h;
  $('#modal').hidden = false;
}
// How to build it: Best overall, Theme first and a mechanic focus are switches. Theme first and mechanics combine; Best overall
// (the strongest deck from any set, built on what top players build the commander around) can't put anything else first, so
// choosing it switches the others off and the reverse, and the player is told why. The price level always combines.
const GEN_PRICE = {
  apex: 'The strongest card for every slot.',
  mid: 'Nothing over $12; stand-ins that do the same job.',
  budget: 'Nothing over $3; stand-ins that do the same job.'
};
function genMechs(c, st) {
  const L = [];
  if (c && EDH.key === c.n && EDH.state === 'ok') (EDH.tags || []).slice(0, 10).forEach(t => L.push(['edh:' + t.slug, t.label]));
  (st.themes || []).forEach(k => {
    const lab = k === 'tribal' ? st.tribe + ' tribal' : THEMES[k].label;
    if (!L.some(x => x[1].toLowerCase() === lab.toLowerCase())) L.push([k, lab]);
  });
  return L;
}
function genModeBox(c, st) {
  const g = S.gen,
    T = themeCtx({commander: c.n, partner: g.partner || ''}),
    fam = [...T.fam][0],
    ty = [...T.types].slice(0, 2),
    M = genMechs(c, st);
  const sw = (act, on, title, note, dis) =>
    '<button class="chk' +
    (on ? ' on' : '') +
    '" data-act="' +
    act +
    '" role="switch" aria-checked="' +
    !!on +
    '"' +
    (dis ? ' disabled' : '') +
    '><i></i><span><b>' +
    title +
    '</b><small class="note" style="display:block">' +
    note +
    '</small></span></button>';
  const themeNote =
    fam || ty.length
      ? 'Cards from ' +
        [fam ? esc(fam) : '', ty.length ? esc(ty.join(' and ')) + ' cards' : ''].filter(Boolean).join(' and ') +
        ' first, then the strongest of the rest.'
      : 'This commander has no set family or creature type to build on.';
  return (
    '<div class="grp" id="genmode"><span class="lab">How to build it</span>' +
    sw(
      'gen-best',
      g.best,
      'Best overall',
      'The strongest deck for this commander, from any set, built on what top players build it around.'
    ) +
    sw('gen-theme', g.theme, 'Theme first', themeNote, !fam && !ty.length) +
    sw(
      'gen-mechon',
      g.mech.length || g.mechOpen,
      'Focus on mechanics',
      g.mech.length
        ? 'In this order: ' + g.mech.map(a => esc((M.find(x => x[0] === a) || [a, aimLabel(a, st.tribe)])[1])).join(', ') + '.'
        : 'Pick up to three mechanics; the first counts most.'
    ) +
    (g.mech.length || g.mechOpen
      ? '<div class="row" role="group" aria-label="Mechanics">' +
        (M.length
          ? M.map(([a, lab]) => {
              const i = g.mech.indexOf(a);
              return (
                '<button class="btn sm' +
                (i >= 0 ? ' pri' : '') +
                '" data-act="gen-mech" data-v="' +
                esc(a) +
                '" aria-pressed="' +
                (i >= 0) +
                '">' +
                (i >= 0 ? i + 1 + ' · ' : '') +
                esc(lab) +
                '</button>'
              );
            }).join('')
          : '<span class="note">' +
            (EDH.key === c.n && EDH.state === 'loading'
              ? 'Loading this commander’s mechanics…'
              : 'No mechanics found for this commander.') +
            '</span>') +
        '</div>'
      : '') +
    (g.warn ? '<div class="tip ok" role="alert"><b><small>Choices changed</small>' + esc(g.warn) + '</b></div>' : '') +
    (!g.best && !g.theme && !g.mech.length
      ? '<p class="note" style="margin:0">Nothing is switched on, so the deck is built as Best overall.</p>'
      : '') +
    '<span class="lab">Price level</span><div class="row" role="group" aria-label="Price level">' +
    TIER_KEYS.slice()
      .reverse()
      .map(
        t =>
          '<button class="btn sm' +
          (g.tier === t ? ' pri' : '') +
          '" data-act="gen-tier" data-v="' +
          t +
          '" aria-pressed="' +
          (g.tier === t) +
          '">' +
          TIERS[t].label +
          '</button>'
      )
      .join('') +
    '</div><p class="note" style="margin:0">' +
    GEN_PRICE[g.tier] +
    ' Every choice above works at every price level' +
    (g.tier === 'apex' && g.theme ? ': Apex with Theme first is the strongest deck that keeps the theme' : '') +
    '.</p>' +
    genBudgetBox(c, 'gen-budget') +
    '</div>'
  );
}
// Budget decks take an optional total budget (owner, 20 Oct): the whole deck fits it. Cards you own and basic lands are free,
// and so is the commander when you say you own it.
function genBudgetBox(c, id) {
  const g = S.gen;
  if (g.tier !== 'budget') return '';
  return (
    '<div class="grp" style="margin:0"><label class="lab" for="' +
    id +
    '">Total budget · optional</label><div class="row"><span>$</span><input type="number" id="' +
    id +
    '" min="0" step="5" inputmode="decimal" style="max-width:8em" placeholder="No limit" value="' +
    (g.budget > 0 ? +g.budget : '') +
    '"></div>' +
    (c
      ? '<div class="row"><button class="chk' +
        (g.cmdOwned ? ' on' : '') +
        '" data-act="gen-cmdown" role="checkbox" aria-checked="' +
        !!g.cmdOwned +
        '"><i></i>I already own ' +
        esc(c.n.split(',')[0]) +
        '</button></div>'
      : '') +
    '<p class="note" style="margin:0">The whole deck fits this total. Cards you own and basic lands are free' +
    (c ? (g.cmdOwned ? ', and so is your commander' : '; the commander counts unless you own it') : '') +
    '.</p></div>'
  );
}
// Generate from cards: the player names cards they want to play; the app proposes commanders that fit them and builds the rest.
function seedThemes(cards) {
  const n = {};
  cards.forEach(c => {
    const th = tags(c).th;
    for (const k in th) if (th[k] === 1) n[k] = (n[k] || 0) + 1;
  });
  return Object.keys(n)
    .sort((a, b) => n[b] - n[a])
    .slice(0, 3);
}
// Second commander: shown under the commander when the rules allow one.
function partnerBox(d, lock) {
  const cmd = find(d.commander),
    par = find(d.partner);
  if (!cmd) return '';
  if (par)
    return (
      '<div class="cmdbox"><img alt="" src="' +
      artFor(par) +
      '"><div><b>' +
      esc(par.n) +
      '</b><span>' +
      pips(par.m) +
      '</span><div class="row" style="margin-top:4px"><span class="chip good">Second commander · ' +
      esc(pairLabel(cmd) || pairLabel(par)) +
      '</span><button class="btn sm" data-act="card" data-n="' +
      esc(par.n) +
      '">View</button>' +
      (lock ? '' : '<button class="btn sm" data-act="partner-clear">Remove</button>') +
      '</div></div></div>'
    );
  if (!pairKind(cmd) || pairKind(cmd) === 'isbg') return '';
  return (
    '<div class="row"><span class="chip good">' +
    esc(pairLabel(cmd)) +
    ' · can have a second commander</span>' +
    (lock ? '' : '<button class="btn sm" data-act="partner-open">Add a second commander</button>') +
    '</div>'
  );
}
function openPartner() {
  const d = cur(),
    cmd = d && find(d.commander);
  if (!cmd) return;
  S.modalCard = null;
  const ctx = ctxOf(d);
  const res = LIB.filter(c => c.cmd && canPair(cmd, c))
    .map(c => ({c, s: baseScore(c, d, Object.assign({}, ctx, {focus: c.ci, ident: c.ci, edh: null})).s}))
    .sort((a, b) => b.s - a.s)
    .slice(0, 14);
  $('#modal').innerHTML =
    '<div class="panel" role="dialog" aria-label="Add a second commander"><div class="ph"><h2>Add a second commander</h2><button class="ico" data-act="close" aria-label="Close">×</button></div><p class="note" style="margin:0">' +
    esc(cmd.n) +
    ' has ' +
    esc(pairLabel(cmd)) +
    ', so the deck may have two commanders. The deck can then use both commanders’ colors, and holds 98 other cards instead of 99.</p>' +
    (res.length
      ? res
          .map(
            x =>
              '<div class="pre"><img alt="" src="' +
              artFor(x.c) +
              '"><div style="min-width:0"><b>' +
              esc(x.c.n) +
              '</b> ' +
              x.c.ci.map(z => '<i class="pip p' + z + '">' + z + '</i>').join('') +
              '<div class="note">' +
              esc(x.c.t) +
              '</div></div><div class="acts"><button class="btn sm" data-act="card" data-n="' +
              esc(x.c.n) +
              '">View</button><button class="btn pri sm" data-act="partner-set" data-n="' +
              esc(x.c.n) +
              '">Add</button></div></div>'
          )
          .join('')
      : '<p class="note" style="margin:0">No card in the card data can pair with this commander' +
        (DBINFO.complete ? '.' : ' yet. More appear when the card download finishes.') +
        '</p>') +
    '</div>';
  $('#modal').hidden = false;
}
function seedInfo() {
  const cards = S.seed.cards.map(find).filter(Boolean),
    colors = 'WUBRG'.split('').filter(k => cards.some(c => c.ci.includes(k))),
    aims = seedThemes(cards);
  const tmp = {format: 'commander', commander: '', cards: cards.map(c => ({n: c.n, q: 1})), aims, tribe: '', colors};
  const own = cards
    .filter(c => c.cmd && /Legendary/.test(c.t) && /Creature/.test(frontType(c)) && colors.every(k => c.ci.includes(k)))
    .map(c => ({n: c.n, why: ['One of your cards'], mine: true}));
  const rest = cards.length ? findCommanders(tmp, colors, 8).filter(x => !own.some(o => o.n === x.n)) : [];
  let pairs = cards.length ? findPairs(tmp, colors, 4) : [];
  for (let i = 0; i < cards.length; i++)
    for (let j = 0; j < cards.length; j++) {
      const a = cards[i],
        b = cards[j];
      if (i === j || !canLead(a) || !canPair(a, b) || pairs.some(x => x.mine && (x.n === b.n || x.n === a.n))) continue;
      const ci = 'WUBRG'.split('').filter(z => a.ci.includes(z) || b.ci.includes(z));
      if (colors.every(z => ci.includes(z))) {
        pairs = pairs.filter(x => !((x.n === a.n && x.p === b.n) || (x.n === b.n && x.p === a.n)));
        pairs.unshift({n: a.n, p: b.n, ci, mine: true});
      }
    }
  return {cards, colors, aims, cmds: own.concat(rest).slice(0, 8), pairs: pairs.slice(0, 5)};
}
function openSeed() {
  S.modalCard = null;
  const I = seedInfo(),
    g = S.gen;
  let h =
    '<div class="panel full" role="dialog" aria-label="Generate from cards"><div class="ph"><h2>Generate from cards</h2><button class="ico" data-act="close" aria-label="Close">×</button></div><p class="note" style="margin:0">Add any number of cards you want in the deck. The Deck Builder works out their colors and what they do, suggests commanders that fit, then designs the strongest build around them, with Mid and Budget stand-ins for each expensive card. Nothing goes into the decklist until you add it.</p>' +
    '<div class="grp"><label class="lab" for="seed-q">Cards you want to play</label><div class="dd"><input type="search" id="seed-q" placeholder="Search for a card to add" autocomplete="off"><div class="ddl" id="seed-res" hidden></div></div>' +
    (S.seed.paste
      ? '<textarea id="seed-text" placeholder="1 Doubling Season&#10;1 Craterhoof Behemoth"></textarea><div class="row"><button class="btn sm pri" data-act="seed-paste-go">Add these cards</button></div>'
      : '<div class="row"><button class="btn sm" data-act="seed-paste">Paste a list instead</button></div>') +
    (S.seed.cards.length
      ? '<div class="row">' +
        S.seed.cards
          .map(
            n =>
              '<span class="chip">' +
              esc(n) +
              ' <button class="x" data-act="seed-del" data-n="' +
              esc(n) +
              '" aria-label="Remove ' +
              esc(n) +
              '">×</button></span>'
          )
          .join('') +
        '</div>'
      : '<p class="note" style="margin:0">No cards yet.</p>') +
    '</div>';
  if (I.cards.length) {
    h +=
      '<div class="grp"><span class="lab">What these cards point to</span><div class="row">' +
      (I.colors.length
        ? I.colors.map(k => '<i class="pip p' + k + '">' + k + '</i>').join('')
        : '<span class="chip">Colorless</span>') +
      I.aims.map(k => '<span class="chip gold">' + THEMES[k].label + '</span>').join('') +
      '</div></div>' +
      ownToggle('seed') +
      '<div class="mscroll"><div class="grp"><span class="lab">Commanders that fit · pick one to build the deck</span>' +
      (DBINFO.complete
        ? ''
        : '<p class="note" style="margin:0">Card data is still downloading, so more commanders and better picks will appear when it finishes.</p>') +
      (I.cmds.length
        ? I.cmds
            .map(x => {
              const k = find(x.n);
              return (
                '<div class="pre"><img alt="" src="' +
                artFor(k) +
                '"><div style="min-width:0"><b>' +
                esc(k.n) +
                '</b> ' +
                k.ci.map(z => '<i class="pip p' + z + '">' + z + '</i>').join('') +
                '<div class="why">' +
                (x.mine
                  ? '<span class="chip good">One of your cards</span>'
                  : x.why.map(w => '<span class="chip">' + esc(w) + '</span>').join('')) +
                (pairKind(k) ? '<span class="chip good">' + esc(pairLabel(k)) + ' · can have a second commander</span>' : '') +
                '</div></div><div class="acts"><button class="btn sm" data-act="card" data-n="' +
                esc(k.n) +
                '">View</button><button class="btn pri sm" data-act="seed-go" data-n="' +
                esc(k.n) +
                '">Build</button></div></div>'
              );
            })
            .join('')
        : I.pairs.length
          ? '<div class="gate"><b>These cards need two commanders</b>No single commander covers all of their colors. A pair of commanders that are allowed to share the command zone does, so the deck has to be built with one of the pairs below.</div>'
          : '<p class="note" style="margin:0">No commander in the card data covers all of these colors' +
            (DBINFO.complete ? '. Try removing a card.' : ' yet.') +
            '</p>') +
      '</div>' +
      (I.pairs.length
        ? '<div class="grp"><span class="lab">Two commanders · pairs the rules allow</span><p class="note" style="margin:0">Some commanders may share the command zone. The deck then uses both commanders’ colors and has 98 other cards.</p>' +
          I.pairs
            .map(x => {
              const a = find(x.n),
                b2 = find(x.p);
              return (
                '<div class="pre"><img alt="" src="' +
                artFor(a) +
                '"><div style="min-width:0"><b>' +
                esc(a.n) +
                ' + ' +
                esc(b2.n) +
                '</b> ' +
                x.ci.map(z => '<i class="pip p' + z + '">' + z + '</i>').join('') +
                '<div class="why">' +
                (x.mine ? '<span class="chip good">Your cards</span>' : '') +
                '<span class="chip good">Two commanders · ' +
                esc(pairLabel(a)) +
                '</span></div></div><div class="acts"><button class="btn sm" data-act="card" data-n="' +
                esc(a.n) +
                '">View</button><button class="btn sm" data-act="card" data-n="' +
                esc(b2.n) +
                '">View 2nd</button><button class="btn pri sm" data-act="seed-go" data-n="' +
                esc(a.n) +
                '" data-v="' +
                esc(b2.n) +
                '">Build</button></div></div>'
              );
            })
            .join('') +
          '</div>'
        : '') +
      '</div>';
  }
  $('#modal').innerHTML = h + '</div>';
  $('#modal').hidden = false;
}
async function seedBuild(n, partner) {
  const I = seedInfo();
  if (!(await startPlan(n, I.cards, I.aims, partner))) return;
  S.seed = {cards: [], paste: false};
  touch();
  render();
}
// Players: up to 5 tablemates besides you. Each deck can belong to one of them, so a whole playgroup's decks live in one
// profile. A deck with no player is yours.
const MAX_PLAYERS = 5;
function players() {
  return S.profile.players || (S.profile.players = []);
}
function playerOf(d) {
  return d && d.player ? d.player : '';
}
// Folders and tags for decks (My decks filters by them). A deck has at most one folder and up to 8 tags; old decks and
// backups without them simply show under "No folder".
const TAG_COLS = ['#e3b558', '#3ddc84', '#f2a93b', '#b993ff', '#ff5b78', '#6ec6ff'];
const tagCol = t => TAG_COLS[parseInt(strHash(norm(t)), 36) % TAG_COLS.length];
function folders() {
  return [...new Set(S.profile.decks.map(d => (d.folder || '').trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b));
}
function allTags() {
  return [...new Set(S.profile.decks.flatMap(d => d.dtags || []))].sort((a, b) => a.localeCompare(b));
}
function tagChip(t, rm) {
  return (
    '<span class="chip tg" style="--c:' +
    tagCol(t) +
    '">' +
    esc(t) +
    (rm ? '<button class="x" data-act="dtag-rm" data-n="' + esc(t) + '" aria-label="Remove tag ' + esc(t) + '">×</button>' : '') +
    '</span>'
  );
}
function orgBox(d) {
  if (!d || d === S.draft) return '';
  return (
    '<div class="grp"><label class="lab" for="deck-folder">Folder</label><input type="text" id="deck-folder" list="folder-list" value="' +
    esc(d.folder || '') +
    '" maxlength="40" placeholder="No folder" autocomplete="off"><datalist id="folder-list">' +
    folders()
      .map(f => '<option value="' + esc(f) + '">')
      .join('') +
    '</datalist></div>' +
    '<div class="grp"><span class="lab">Tags</span><div class="row">' +
    (d.dtags || []).map(t => tagChip(t, true)).join('') +
    ((d.dtags || []).length < 8
      ? '<input type="text" id="deck-tag" list="tag-list" placeholder="Add a tag" maxlength="24" autocomplete="off" style="width:auto;flex:1 1 120px"><datalist id="tag-list">' +
        allTags()
          .filter(t => !(d.dtags || []).includes(t))
          .map(t => '<option value="' + esc(t) + '">')
          .join('') +
        '</datalist><button class="btn sm" data-act="dtag-add">Add tag</button>'
      : '<span class="note">Up to 8 tags.</span>') +
    '</div></div>'
  );
}
function addTag(d, v) {
  v = String(v || '')
    .trim()
    .slice(0, 24);
  if (!d || !v) return false;
  const T = d.dtags || [];
  if (T.some(t => norm(t) === norm(v)) || T.length >= 8) return false;
  d.dtags = T.concat([v]);
  return true;
}
function playerSel(id, val) {
  const P = players(),
    names = P.concat(val && !P.includes(val) ? [val] : []);
  return (
    '<div class="grp"><label class="lab" for="' +
    id +
    '">Player</label><select id="' +
    id +
    '" style="width:auto;min-width:200px"><option value=""' +
    (!val ? ' selected' : '') +
    '>' +
    esc(S.profile.name || 'Me') +
    ' (me)</option>' +
    names.map(n => '<option value="' + esc(n) + '"' + (n === val ? ' selected' : '') + '>' + esc(n) + '</option>').join('') +
    '</select>' +
    (P.length ? '' : '<p class="note" style="margin:0">Add your tablemates in Profile to save their decks here too.</p>') +
    '</div>'
  );
}
function playersHtml() {
  const P = players();
  return (
    '<div class="grp" style="max-width:520px"><span class="lab">Players at your table · ' +
    P.length +
    ' of ' +
    MAX_PLAYERS +
    '</span><p class="note" style="margin:0">Add up to ' +
    MAX_PLAYERS +
    ' tablemates. Their names show up when you create or generate a deck, so everyone’s decks can be saved to this profile.</p>' +
    (P.length
      ? '<div class="row">' +
        P.map(
          (n, i) =>
            '<span class="chip">' +
            esc(n) +
            ' <button class="ico" data-act="player-rm" data-v="' +
            i +
            '" data-n="' +
            esc(n) +
            '" aria-label="Remove ' +
            esc(n) +
            '" style="min-width:0;padding:0 4px">×</button></span>'
        ).join('') +
        '</div>'
      : '') +
    (P.length < MAX_PLAYERS
      ? '<div class="row"><input type="text" id="player-add" placeholder="Tablemate’s name" maxlength="30" style="flex:1 1 200px;min-width:0;width:auto"><button class="btn sm" data-act="player-add">Add player</button></div>'
      : '<p class="note" style="margin:0">That’s the most players a profile can hold. Remove one to add another.</p>') +
    '</div>'
  );
}
