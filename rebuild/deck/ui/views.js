// ---------- views ----------
function navHtml() {
  const b = (v, label) =>
    '<button data-act="nav" data-v="' +
    v +
    '"' +
    (S.view === v ? ' aria-current="page"' : '') +
    '>' +
    SVG[v] +
    label +
    '</button>';
  $('#nav-l').innerHTML =
    '<button data-act="cc-home" class="cc-home" aria-label="Commander Companion home"><img src="../assets/img/ui/home.png" alt="Home"></button>' +
    b('decks', 'Decks') +
    b('deck', 'Builder') +
    b('search', '<span><span class="xs-hide">Card&nbsp;</span>Search</span>') +
    b('buy', '<span>Buy<span class="xs-hide">&nbsp;list</span></span>') +
    b('library', 'Library');
  $('#nav-r').innerHTML = b('profile', 'Profile');
  let u = $('#undo-fab');
  if (!u) {
    u = document.createElement('button');
    u.id = 'undo-fab';
    u.dataset.act = 'undo';
    document.body.appendChild(u);
  }
  // in a deck the Undo button sits in the deck's bar, next to Save deck (owner, 19 Oct): the floating one is for the other screens
  const last = UNDO.stack[UNDO.stack.length - 1],
    inDeck = S.view === 'decks' && S.open && !!cur();
  u.hidden = !last || inDeck;
  document.body.classList.toggle('has-fab', !u.hidden);
  u.innerHTML = SVG.undo + '<span>Undo</span>';
  u.setAttribute('aria-label', last ? 'Undo: ' + (last.label || 'last change') : 'Undo');
  u.title = last ? 'Undo: ' + (last.label || 'last change') : '';
}
// Phones only (shown by the phone layout rules in index.html; hidden on iPad and desktop): one Continue card for the deck
// you last opened, under the home tiles and above Profile.
function recentIds() {
  const L = lsGet('dc.recent');
  return Array.isArray(L) ? L : [];
}
function recentAdd(id) {
  if (!id) return;
  lsSet('dc.recent', [id].concat(recentIds().filter(x => x !== id)).slice(0, 8));
}
function continueHtml() {
  const D = S.profile.decks.filter(d => !d.example),
    ids = recentIds(),
    byId = new Map(D.map(d => [d.id, d]));
  const order = ids
    .map(i => byId.get(i))
    .filter(Boolean)
    .concat(D.filter(d => !ids.includes(d.id)));
  if (!order.length) return '';
  const d0 = order[0],
    c0 = find(d0.commander),
    A0 = analyze(d0);
  return (
    '<section class="continue phone-only"><button class="tile" data-act="open-deck" data-v="' +
    d0.id +
    '"><img alt="" src="' +
    artFor(c0 || {n: d0.name, t: 'Enchantment', o: '', ci: d0.colors || []}) +
    '"><div class="tb"><small class="lab" style="margin:0">Continue</small><h3>' +
    esc(d0.name) +
    '</h3><p>' +
    esc(d0.commander || (d0.format === 'standard' ? 'Standard' : 'No commander yet')) +
    ' · ' +
    A0.size +
    ' / ' +
    A0.T.size +
    '</p></div></button>' +
    '</section>'
  );
}
function viewHome() {
  const n = S.profile.decks.filter(d => !d.example).length;
  const tile = (v, icon, title, text, extra) =>
    '<button class="tile big" data-act="nav" data-v="' +
    v +
    '"><div class="tb"><span class="hicon">' +
    SVG[icon] +
    '</span><h3>' +
    title +
    '</h3><p>' +
    text +
    '</p>' +
    (extra ? '<span class="chip gold">' + extra + '</span>' : '') +
    '</div></button>';
  return (
    '<section class="hero"><h1>Bring a deck. See every way to make it better.</h1><p class="narrow">A Magic: The Gathering deck builder for Commander and Standard that shows each card’s upgrade path at three budgets.</p><p class="wide">The Deck Builder is Commander Companion’s deck builder for Magic: The Gathering, made for Commander and Standard. Start a deck or bring your own, tell it what the deck is about, and it lays out each card’s upgrade path at three budgets, without turning your deck into something else.</p></section>' +
    '<div class="tiles home3">' +
    tile(
      'deck',
      'deck',
      'Builder',
      'Start a new deck. Generate one from a commander, load a real precon, import a list you already have, or begin empty.'
    ) +
    tile(
      'decks',
      'decks',
      'Decks',
      'Open a saved deck to edit it, tune its build, and follow its Budget, Mid and Apex upgrade paths.',
      n ? n + ' saved deck' + (n === 1 ? '' : 's') : ''
    ) +
    tile('search', 'search', 'Card search', 'Look up any card with its full details, price and every printing.') +
    '</div>' +
    continueHtml() +
    '<div class="row" style="justify-content:center"><button class="btn" data-act="nav" data-v="buy" style="display:inline-flex;gap:8px;align-items:center"><span class="hicon sm">' +
    SVG.buy +
    '</span>Buy list</button><button class="btn" data-act="nav" data-v="library" style="display:inline-flex;gap:8px;align-items:center"><span class="hicon sm">' +
    SVG.library +
    '</span>Library</button><button class="btn" data-act="nav" data-v="profile" style="display:inline-flex;gap:8px;align-items:center"><span class="hicon sm">' +
    SVG.profile +
    '</span>Profile and backups</button></div>' +
    '<ol class="steps"><li><b>Get a deck in.</b> Generate one, load a precon, or paste your own list.</li><li><b>Set the build.</b> Rank the mechanics that matter and pick your colors. For Commander, the deck follows what your commander does.</li><li><b>Follow the upgrade paths.</b> Every card shows its strongest upgrade (Apex) and cheaper cards that do the same job (Mid under $12, Budget under $3), and how far along it already is.</li></ol>'
  );
}
// The last tile of the Decks grid: a new deck, through the Builder (generate, precon, import or empty).
const newTile = () =>
  '<div class="tilewrap"><button class="tile newdeck" data-act="nav" data-v="deck" aria-label="New deck"><span class="plus" aria-hidden="true">+</span><div class="tb"><h3>New deck</h3><p>Generate one, load a precon, import a list or start empty.</p></div></button></div>';
function viewDecks() {
  const P = S.profile,
    od = S.open ? cur() : null;
  if (od) {
    const A = analyze(od),
      isDraft = od === S.draft,
      narrow = isNarrow();
    let tab = S.tab || (narrow && !isAimed(od) ? 'build' : 'list');
    if (!narrow && tab === 'build') tab = 'list';
    const hasPlan = od.plan && od.plan.length,
      R = isAimed(od) && !hasPlan ? recsFor(od) : null,
      nUp = hasPlan ? od.plan.length : R ? upCardCount(R, od) : 0;
    const build = aimPanel(od, A.ctx)
      .replace('<section class="panel aimp">', '<section class="panel aimp"><div class="scroll" id="bscroll" data-keep>')
      .replace(/<\/section>$/, '</div>' + buildFoot(od) + '</section>');
    const tb = (k, label, cls) =>
      '<button class="tab' +
      (tab === k ? ' on' : '') +
      (cls || '') +
      '" data-act="tab" data-v="' +
      k +
      '" role="tab" aria-selected="' +
      (tab === k) +
      '">' +
      label +
      '</button>';
    return (
      '<div class="row bar"><button class="btn" data-act="deck-back">← All decks</button>' +
      (isDraft
        ? '<span class="chip warn">Not saved yet</span><button class="btn pri" data-act="draft-save" style="margin-left:auto">Save deck</button>' +
          undoBtn() +
          '<button class="btn danger" data-act="draft-discard">Discard</button>'
        : '<span class="note" style="flex:1">Saved · changes to this deck save as you make them</span>' +
          undoBtn() +
          '<button class="btn" data-act="dup-deck" data-v="' +
          od.id +
          '">Duplicate</button><button class="btn" data-act="share-open">Share link</button><button class="btn" data-act="cmp-open">Compare</button><button class="btn" data-act="hist-open">History</button><button class="btn danger" data-act="del-deck" data-v="' +
          od.id +
          '">' +
          (S.confirmDel === od.id ? 'Confirm delete' : 'Delete deck') +
          '</button>') +
      '</div>' +
      '<div class="work">' +
      (narrow ? '' : build) +
      '<section class="panel pane"><div class="tabs" role="tablist">' +
      (narrow ? tb('build', 'Build') : '') +
      tb('list', 'Decklist <em>' + A.size + '</em>') +
      tb('stats', 'Build stats') +
      tb(
        'up',
        'Upgrades' +
          (nUp
            ? ' <em title="' +
              nUp +
              (hasPlan ? ' cards to add' : ' card' + (nUp === 1 ? '' : 's') + ' recommended to swap out at this deck’s price level') +
              '">' +
              nUp +
              (hasPlan ? '' : ' card' + (nUp === 1 ? '' : 's')) +
              '</em>'
            : '')
      ) +
      tb('buy', 'Buy list') +
      tb('lib', 'Library' + (libCount() ? ' <em>' + libCount().toLocaleString() + '</em>' : '')) +
      '</div>' +
      (tab === 'build'
        ? build.replace('<section class="panel aimp">', '<div class="inpane">').replace(/<\/section>$/, '</div>')
        : tab === 'up'
          ? upPanel(od, A)
          : tab === 'stats'
            ? upPanel(od, A, 'stats')
            : tab === 'buy'
              ? buyPanel(od)
              : tab === 'lib'
                ? libPanel(od)
                : listPanel(od, A)) +
      '</section></div>'
    );
  }
  const owners = [...new Set(players().concat(P.decks.map(playerOf).filter(Boolean)))];
  // a filter for a player who is no longer on the list (or has no decks) would hide every deck with no way back: reset it
  if (S.deckPlayer && S.deckPlayer !== '*' && !owners.includes(S.deckPlayer)) S.deckPlayer = '*';
  if (S.deckFolder && S.deckFolder !== '*' && !folders().includes(S.deckFolder)) S.deckFolder = '*';
  if (S.deckTag && !allTags().includes(S.deckTag)) S.deckTag = '';
  const fp = S.deckPlayer;
  const ff = S.deckFolder == null ? '*' : S.deckFolder,
    ft = S.deckTag || '',
    FL = folders(),
    TG = allTags();
  const shown = P.decks.filter(
    d =>
      (fp == null || fp === '*' || playerOf(d) === fp) &&
      (ff === '*' || (d.folder || '').trim() === ff) &&
      (!ft || (d.dtags || []).includes(ft))
  );
  const orgBar =
    FL.length || TG.length
      ? '<div class="row"><label class="lab" for="deck-filter-folder" style="margin:0">Folder</label><select id="deck-filter-folder" style="width:auto"><option value="*"' +
        (ff === '*' ? ' selected' : '') +
        '>All folders</option>' +
        FL.map(f => '<option value="' + esc(f) + '"' + (ff === f ? ' selected' : '') + '>' + esc(f) + '</option>').join('') +
        '<option value=""' +
        (ff === '' ? ' selected' : '') +
        '>No folder</option></select>' +
        (TG.length
          ? '<label class="lab" for="deck-filter-tag" style="margin:0">Tag</label><select id="deck-filter-tag" style="width:auto"><option value="">Any tag</option>' +
            TG.map(t => '<option value="' + esc(t) + '"' + (ft === t ? ' selected' : '') + '>' + esc(t) + '</option>').join('') +
            '</select>'
          : '') +
        (ff && ff !== '*' && FL.includes(ff)
          ? '<input type="text" id="folder-new" value="' +
            esc(ff) +
            '" maxlength="40" aria-label="New folder name" style="width:auto;flex:0 1 160px"><button class="btn sm" data-act="folder-rename" data-n="' +
            esc(ff) +
            '">Rename folder</button><button class="btn sm danger" data-act="folder-del" data-n="' +
            esc(ff) +
            '">Delete folder</button>'
          : '') +
        '</div>'
      : '';
  const tiles = shown
    .map(d => {
      const A = analyze(d),
        c = find(d.commander) || find((d.cards.find(e => find(e.n) && !tags(find(e.n)).land) || {}).n);
      return (
        '<div class="tilewrap"><button class="tile" data-act="open-deck" data-v="' +
        d.id +
        '"><img alt="" src="' +
        artFor(c || {n: d.name, t: 'Enchantment', o: '', ci: d.colors || []}) +
        '"><div class="tb"><h3>' +
        esc(d.name) +
        (d.player ? ' <span class="chip gold">' + esc(d.player) + '</span>' : '') +
        '</h3>' +
        ((d.folder || '').trim() || (d.dtags || []).length
          ? '<div class="row" style="gap:4px">' +
            ((d.folder || '').trim() ? '<span class="chip">Folder: ' + esc(d.folder.trim()) + '</span>' : '') +
            (d.dtags || []).map(t => tagChip(t)).join('') +
            '</div>'
          : '') +
        '<p>' +
        (d.format === 'commander'
          ? esc(d.commander || 'No commander yet') + (d.partner ? ' + ' + esc(d.partner) : '')
          : 'Standard · ' + (d.colors || []).map(x => '<i class="pip p' + x + '">' + x + '</i>').join('')) +
        '</p><div class="row">' +
        priceChip(A) +
        '<span class="chip">' +
        d.format +
        '</span><span class="chip ' +
        (A.size === A.T.size ? 'good' : 'warn') +
        '">' +
        A.size +
        ' / ' +
        A.T.size +
        '</span>' +
        (d.plan && d.plan.length ? '<span class="chip warn">Build in progress</span>' : '') +
        (d.example ? '<span class="chip">Example</span>' : '') +
        '</div></div></button><button class="btn sm danger" data-act="del-deck" data-v="' +
        d.id +
        '">' +
        (S.confirmDel === d.id ? 'Confirm delete' : 'Delete') +
        '</button></div>'
      );
    })
    .join('');
  return (
    '<section class="panel"><div class="ph"><h2>' +
    esc(P.name) +
    '’s decks</h2><small>' +
    P.decks.length +
    ' saved</small></div>' +
    orgBar +
    (owners.length
      ? '<div class="row"><label class="lab" for="deck-filter-player" style="margin:0">Show decks for</label><select id="deck-filter-player" style="width:auto"><option value="*"' +
        (fp == null || fp === '*' ? ' selected' : '') +
        '>Everyone</option><option value=""' +
        (fp === '' ? ' selected' : '') +
        '>' +
        esc(P.name || 'Me') +
        ' (me)</option>' +
        owners.map(n => '<option value="' + esc(n) + '"' + (fp === n ? ' selected' : '') + '>' + esc(n) + '</option>').join('') +
        '</select></div>'
      : '') +
    (S.draft
      ? '<div class="gate"><b>Unsaved deck: ' +
        esc(S.draft.name) +
        '</b>' +
        (S.draft.plan && S.draft.plan.length ? '<span class="chip warn">Build in progress</span> ' : '') +
        'You started this deck but haven’t saved it to your profile.<div class="row" style="margin-top:10px"><button class="btn" data-act="draft-open">Keep editing</button><button class="btn pri" data-act="draft-save">Save deck</button><button class="btn danger" data-act="draft-discard">Discard</button></div></div>'
      : '') +
    (P.decks.some(d => !d.example) && Date.now() - lastBackup() > 7 * 864e5
      ? '<p class="note" style="margin:0">' +
        (lastBackup() ? 'Your last backup file is over a week old.' : 'These decks are only stored in this browser.') +
        ' <button class="btn sm" data-act="backup-save">Save backup file</button></p>'
      : '') +
    (tiles
      ? '<p class="note" style="margin:0">Tap a deck to edit it and see its upgrade paths.</p><div class="tiles">' +
        tiles +
        newTile() +
        '</div>'
      : '<p class="note">No decks yet. Create one on the Builder page.</p><div class="tiles">' + newTile() + '</div>') +
    '</section>' +
    myWantHtml()
  );
}
// Plain-English descriptions of every mechanic, shown in the mechanic picker and when you tap a mechanic already in the build.
const MECH_DESC = {
  tokens:
    'Make lots of creature tokens and win by going wide: token makers, cards that pump your whole team, and payoffs that care how many creatures you have.',
  counters:
    'Put +1/+1 counters on your creatures and grow them: counter makers, proliferate, and cards that reward creatures with counters.',
  graveyard:
    'Use your graveyard as a second hand: fill it (mill, discard), then bring creatures and spells back (reanimation, flashback).',
  sacrifice:
    'Sacrifice your own creatures for value: free sacrifice outlets, creatures that come back or leave tokens, and payoffs when creatures die (aristocrats).',
  spells:
    'Cast lots of instants and sorceries: cheap spells, copy effects, and creatures or enchantments that trigger whenever you cast one.',
  artifacts:
    'Fill the board with artifacts and the cards that reward them: artifact creatures, Treasure and other artifact tokens, and artifact payoffs.',
  enchantments:
    'Build around enchantments and auras: enchantment creatures, constellation, and cards that draw or grow when enchantments enter.',
  lifegain:
    'Gain life and turn it into an advantage: lifelink, life-gain triggers, and drain effects that make opponents lose life.',
  lands:
    'Play extra lands and reward each one: landfall triggers, ramp that puts lands onto the battlefield, and getting lands back from the graveyard.',
  voltron: 'Make one creature (often the commander) huge with equipment and auras, protect it, and win with commander damage.',
  blink:
    'Get value from creatures entering the battlefield: enter-the-battlefield effects, and blink cards that exile and return them to use those effects again.',
  burn: 'Deal damage directly to opponents and their creatures: burn spells, pingers and damage triggers.',
  aggro: 'Attack early and often: efficient creatures, haste, extra combat and team pumps that end the game in combat.',
  control: 'Answer what opponents do: counterspells, removal and board wipes, then win late.',
  draw: 'Out-draw everyone: card draw engines and payoffs for drawing extra cards.',
  tribal:
    'Build around one creature type: lords that pump the type, cards that reward casting it, and as many good creatures of that type as possible.'
};
function mechDesc(a, ctx) {
  if (isEdhAim(a)) {
    const t = (EDH.tags || []).find(x => 'edh:' + x.slug === a),
      m = EDH.tmap && EDH.tmap[a.slice(4)],
      cmd = ctx.cmd ? ctx.cmd.n.split(',')[0] : 'this commander';
    const top = m
      ? [...m.entries()]
          .filter(([, v]) => v.syn > 0.15)
          .sort((x, y) => y[1].syn - x[1].syn)
          .slice(0, 4)
          .map(([k]) => (find(k) || {n: k}).n)
      : [];
    return (
      'How ' +
      (t ? t.count.toLocaleString() : 'many') +
      ' ' +
      esc(cmd) +
      ' players build the deck (EDHREC). Suggestions lean toward cards those ' +
      esc(aimLabel(a)) +
      ' decks play far more than other ' +
      esc(cmd) +
      ' decks.' +
      (top.length ? ' Cards that define it: ' + top.map(esc).join(', ') + '.' : '')
    );
  }
  if (a === 'tribal') return MECH_DESC.tribal + (ctx.tribe ? ' This build uses ' + esc(ctx.tribe) + '.' : '');
  return MECH_DESC[a] || '';
}
function openMech(a) {
  const d = cur();
  if (!d) return;
  const ctx = ctxOf(d),
    i = d.aims.indexOf(a),
    lock = d.aimLocked;
  $('#modal').innerHTML =
    '<div class="panel" role="dialog" aria-label="Mechanic"><div class="ph"><h2>' +
    esc(a === 'tribal' ? (ctx.tribe || 'Creature type') + ' tribal' : aimLabel(a, ctx.tribe)) +
    '</h2><button class="ico" data-act="close" aria-label="Close">×</button></div>' +
    '<p style="margin:0">' +
    mechDesc(a, ctx) +
    '</p>' +
    (i >= 0
      ? '<p class="note" style="margin:0">In your build at priority ' +
        (i + 1) +
        ' of ' +
        d.aims.length +
        (ctx.cmdThemes.includes(a) ? '; it is also what your commander does' : '') +
        '.</p>'
      : '') +
    '<div class="row">' +
    (i < 0 && !lock && d.aims.length < 5
      ? '<button class="btn pri" data-act="mech-add" data-v="' + esc(a) + '">Add to my build</button>'
      : '') +
    '<button class="btn" data-act="mech-list">All mechanics</button><button class="btn" data-act="close">Close</button></div></div>';
  $('#modal').hidden = false;
}
function openMechList() {
  const d = cur();
  if (!d) return;
  const ctx = ctxOf(d),
    lock = d.aimLocked,
    own = ctx.cmd && EDH.key === ctx.cmd.n ? (EDH.tags || []).slice(0, 12) : [];
  const row = (a, label, extra) => {
    const i = d.aims.indexOf(a);
    return (
      '<div class="mrow"><button class="mname" data-act="mech-info" data-v="' +
      esc(a) +
      '"><b>' +
      esc(label) +
      '</b>' +
      (extra ? ' <small>' + extra + '</small>' : '') +
      '<span class="note">' +
      mechDesc(a, ctx) +
      '</span></button>' +
      (i >= 0
        ? '<span class="chip gold">In your build · ' + (i + 1) + '</span>'
        : lock || d.aims.length >= 5
          ? ''
          : '<button class="btn sm" data-act="mech-add" data-v="' + esc(a) + '">Add</button>') +
      '</div>'
    );
  };
  $('#modal').innerHTML =
    '<div class="panel" role="dialog" aria-label="Mechanics"><div class="ph"><h2>Mechanics</h2><button class="ico" data-act="close" aria-label="Close">×</button></div><p class="note" style="margin:0">Tap any mechanic to read what it means. Your build can rank up to five.</p><div class="mscroll">' +
    (own.length
      ? '<span class="lab">' +
        esc(ctx.cmd.n.split(',')[0]) +
        '’s mechanics (how players build it)</span>' +
        own.map(t => row('edh:' + t.slug, t.label, t.count.toLocaleString() + ' decks')).join('')
      : '') +
    '<span class="lab">Other mechanics</span>' +
    themeKeys()
      .map(k => row(k, THEMES[k].label, ''))
      .join('') +
    '</div></div>';
  $('#modal').hidden = false;
}
// Player, folder and tags fold into one line so the Build panel fits the screen; open, they are exactly as before.
function metaBox(d) {
  return (
    '<details class="grp dmeta" id="dmeta"' +
    (S.dmetaOpen ? ' open' : '') +
    '><summary><span class="lab" style="margin:0">Player, folder and tags</span></summary>' +
    playerSel('deck-player', playerOf(d)) +
    orgBox(d) +
    '</details>'
  );
}
// Regenerate upgrades sits at the foot of the Build panel (it rebuilds the suggestions from these settings; the deck's cards stay).
// The best decks with every new card under $3 and $12 sit here too (owner, 25 Oct: moved from the Upgrades tab).
function buildFoot(d) {
  if (!(isAimed(d) && d.cards.length && !(d.plan && d.plan.length))) return '';
  let caps = '';
  if (d.format === 'commander')
    try {
      const R = recsFor(d);
      if (R && !R.pending && (!R.pool || R.poolDone) && R.paths.length) caps = ['budget', 'mid'].map(t => capBox(d, t)).join('');
    } catch (e) {}
  return (
    '<div class="bfoot">' +
    caps +
    '<button class="btn pri" data-act="regen" title="Weigh every upgrade again from these settings; the cards in your deck stay as they are">Regenerate upgrades</button></div>'
  );
}
// Customised Build panel sections fold into one-line headers that always show their settings (Build 133); a section that still
// needs input starts open, and each remembers being opened or closed.
function bsec(key, lab, sum, def) {
  const S0 = S.bsec || (S.bsec = {}),
    op = key in S0 ? S0[key] : def;
  return (
    '<details class="grp bsec" id="bs-' +
    key +
    '"' +
    (op ? ' open' : '') +
    '><summary><span class="lab" style="margin:0">' +
    lab +
    '</span><span class="bsum">' +
    sum +
    '</span></summary>'
  );
}
function aimPanel(d, ctx) {
  if (d.auto && !d.custom && isAimed(d)) {
    return (
      '<section class="panel aimp"><div class="ph"><h2>Build</h2><small>' +
      (d.auto === 'precon' ? 'Precon theme' : 'Set from the commander') +
      '</small></div>' +
      '<div class="grp"><label class="lab" for="deck-name">Deck name</label><input type="text" id="deck-name" value="' +
      esc(d.name) +
      '" maxlength="60"></div>' +
      metaBox(d) +
      (ctx.cmd
        ? '<div class="cmdbox"><img alt="" src="' +
          artFor(ctx.cmd, {pid: d.cmdPid}) +
          '"><div><b>' +
          esc(ctx.cmd.n) +
          '</b><span>' +
          pips(ctx.cmd.m) +
          '</span><div class="row" style="margin-top:4px"><button class="btn sm" data-act="card" data-n="' +
          esc(ctx.cmd.n) +
          '">View</button><button class="btn sm" data-act="cmd-find">Find a commander</button></div></div></div>' +
          partnerBox(d, false)
        : '') +
      '<div class="grp"><span class="lab">This deck is built around</span><div class="row">' +
      d.aims
        .map(
          (a, i) =>
            '<button class="chip gold" data-act="mech-info" data-v="' +
            esc(a) +
            '" title="What this mechanic means">' +
            (i + 1) +
            ' · ' +
            esc(aimLabel(a, ctx.tribe)) +
            '</button>'
        )
        .join('') +
      '</div></div>' +
      '<p class="note" style="margin:0">' +
      (d.auto === 'precon'
        ? 'This precon already has a theme, so its upgrade paths are ready below.'
        : 'The build was set from what this commander does, so its upgrade paths are ready below.') +
      ' Change the mechanics, their order or the color focus only if you want to take the deck somewhere else.</p>' +
      '<div class="row"><button class="btn" data-act="build-custom">Customize the build</button></div></section>'
    );
  }
  const lock = d.aimLocked,
    dis = lock ? ' disabled' : '',
    aimed = isAimed(d);
  let h =
    '<section class="panel aimp"><div class="ph"><h2>Build</h2><button class="ico' +
    (lock ? ' on' : '') +
    '" data-act="lock-aim" title="' +
    (lock ? 'Unlock the build settings' : 'Lock the build settings') +
    '" aria-pressed="' +
    lock +
    '">' +
    SVG.lock +
    '</button></div>';
  h +=
    '<div class="grp"><label class="lab" for="deck-name">Deck name</label><input type="text" id="deck-name" value="' +
    esc(d.name) +
    '" maxlength="60"></div>' +
    metaBox(d);
  h +=
    bsec('fmt', 'Format', d.format === 'commander' ? 'Commander' : 'Standard', false) +
    '<div class="seg">' +
    ['commander', 'standard']
      .map(
        f =>
          '<button data-act="fmt" data-v="' + f + '" class="' + (d.format === f ? 'on' : '') + '"' + dis + '>' + f + '</button>'
      )
      .join('') +
    '</div></details>';
  if (d.format === 'commander') {
    h += '<div class="grp"><span class="lab">Commander</span>';
    if (ctx.cmd) {
      h +=
        '<div class="cmdbox"><img alt="" src="' +
        artFor(ctx.cmd, {pid: d.cmdPid}) +
        '"><div><b>' +
        esc(ctx.cmd.n) +
        '</b><span>' +
        pips(ctx.cmd.m) +
        '</span><div class="row" style="margin-top:4px"><button class="btn sm" data-act="card" data-n="' +
        esc(ctx.cmd.n) +
        '">View</button>' +
        (lock
          ? ''
          : '<button class="btn sm" data-act="clear-cmd">Change</button><button class="btn sm" data-act="cmd-find">Find a commander</button>') +
        '</div></div></div>' +
        partnerBox(d, lock);
      h +=
        '<div class="row">' +
        (ctx.cmdThemes.length
          ? ctx.cmdThemes
              .map(k => '<span class="chip gold">' + (k === 'tribal' ? ctx.cmdTribe + ' tribal' : THEMES[k].label) + '</span>')
              .join('')
          : '<span class="note">No built-in strategy detected. Your aims decide the direction.</span>') +
        '</div>' +
        (ctx.cmdThemes.length
          ? '<p class="note" style="margin:0">Upgrades always lean toward what this commander does, on top of the aims you set.</p>'
          : '');
    } else {
      const leg = d.cards
        .map(e => find(e.n))
        .filter(c => c && /Legendary/.test(c.t) && /Creature/.test(frontType(c)))
        .slice(0, 6);
      h +=
        (d.commander
          ? '<p class="note" style="margin:0"><span class="unk">' +
            esc(d.commander) +
            '</span> is not in the card library. Load the full card database in Profile, or pick another.</p>'
          : '') +
        '<div class="dd"><input type="search" id="cmd-q" placeholder="Search commanders" autocomplete="off"><div class="ddl" id="cmd-res" hidden></div></div>' +
        (leg.length
          ? '<div class="row"><span class="note">From your list:</span>' +
            leg
              .map(c => '<button class="btn sm" data-act="set-cmd" data-n="' + esc(c.n) + '">' + esc(c.n) + '</button>')
              .join('') +
            '</div>'
          : '');
    }
    h += '</div>';
  }
  h += bsec(
    'mech',
    'Mechanics, in priority order',
    d.aims.length
      ? d.aims
          .map(
            (a, i) =>
              i +
              1 +
              ' ' +
              esc(a === 'tribal' ? (ctx.tribe || 'Creature type') + ' tribal' : aimLabel(a, ctx.tribe).split(' / ')[0])
          )
          .join(' · ')
      : 'None yet: add one',
    !d.aims.length || (d.aims.includes('tribal') && !ctx.tribe)
  );
  h += d.aims
    .map(
      (a, i) =>
        '<div class="aim"><span class="n">' +
        (i + 1) +
        '</span><button class="t" data-act="mech-info" data-v="' +
        esc(a) +
        '" title="What this mechanic means">' +
        (a === 'tribal' ? esc(ctx.tribe || 'Pick a creature type') + ' tribal' : esc(aimLabel(a, ctx.tribe))) +
        (ctx.cmdThemes.includes(a) ? '<small>Commander strategy</small>' : '') +
        '</button><span class="row" style="gap:3px">' +
        (lock
          ? ''
          : '<button class="ico" data-act="aim-up" data-v="' +
            i +
            '" title="Raise priority"' +
            (i ? '' : ' disabled') +
            '>↑</button><button class="ico" data-act="aim-down" data-v="' +
            i +
            '" title="Lower priority"' +
            (i < d.aims.length - 1 ? '' : ' disabled') +
            '>↓</button><button class="ico" data-act="aim-rm" data-v="' +
            i +
            '" title="Remove">×</button>') +
        '</span></div>'
    )
    .join('');
  {
    const own =
      ctx.cmd && EDH.key === ctx.cmd.n ? (EDH.tags || []).filter(t => !d.aims.includes('edh:' + t.slug)).slice(0, 12) : [];
    if (!lock && d.aims.length < 5) h += '<button class="btn" data-act="mech-list">+ Add a mechanic…</button>';
    if (d.aims.some(isEdhAim))
      h +=
        '<p class="note" style="margin:0">' +
        (d.aimAuto
          ? 'Set from what players build ' + esc(ctx.cmd ? ctx.cmd.n.split(',')[0] : 'this commander') + ' around. '
          : '') +
        'Recommendations lean toward the cards players of each mechanic run, the first mechanic most. Reorder them to steer the build.</p>';
  }
  if (d.aims.includes('tribal'))
    h +=
      '<select id="tribe" aria-label="Creature type"' +
      dis +
      '><option value="">Creature type…</option>' +
      TRIBES.slice()
        .sort()
        .map(t => '<option' + (t === ctx.tribe ? ' selected' : '') + '>' + t + '</option>')
        .join('') +
      '</select>';
  h += '</details>';
  {
    const ty = d.types || [],
      ky = d.keys || [],
      tog = (act, on, a, b) =>
        '<button class="btn sm' +
        (on ? ' pri' : '') +
        '" data-act="' +
        act +
        '"' +
        dis +
        ' title="Switch between a preference and a rule">' +
        (on ? b : a) +
        '</button>';
    const fs = [
      ty.length ? 'Types: ' + ty.map(esc).join(', ') + (d.typesMust ? ' (rule)' : '') : '',
      ky.length
        ? 'Keywords: ' + ky.map(k => esc((KEYWORDS[k] || {label: k}).label)).join(', ') + (d.keysMust ? ' (rule)' : '')
        : '',
      (d.sets || []).length ? 'Sets: ' + d.sets.map(x => esc(setName(x))).join(', ') + (d.setsMust ? ' (rule)' : '') : ''
    ].filter(Boolean);
    h +=
      bsec('filt', 'Filters · optional', fs.length ? fs.join(' · ') : 'None', false) +
      '<div class="row">' +
      ty
        .map((t, i) => '<button class="chip gold" data-act="type-rm" data-v="' + i + '"' + dis + '>' + esc(t) + ' ×</button>')
        .join('') +
      (lock || ty.length >= 4
        ? ''
        : '<input type="search" id="type-add" list="ctype-list" placeholder="+ Creature type…" autocomplete="off" style="flex:1 1 130px;min-width:0;width:auto"><datalist id="ctype-list">' +
          creatureTypes()
            .map(t => '<option value="' + esc(t) + '">')
            .join('') +
          '</datalist>') +
      (ty.length ? tog('types-must', d.typesMust, 'Preferred', 'Creatures must match') : '') +
      '</div>' +
      '<div class="row">' +
      ky
        .map(
          (k, i) =>
            '<button class="chip gold" data-act="key-rm" data-v="' +
            i +
            '"' +
            dis +
            '>' +
            esc((KEYWORDS[k] || {label: k}).label) +
            ' ×</button>'
        )
        .join('') +
      (lock || ky.length >= 4
        ? ''
        : '<select id="key-add" aria-label="Add a keyword" style="flex:1 1 130px;min-width:0;width:auto"><option value="">+ Keyword or effect…</option>' +
          Object.keys(KEYWORDS)
            .filter(k => !ky.includes(k))
            .map(k => '<option value="' + k + '">' + KEYWORDS[k].label + '</option>')
            .join('') +
          '</select>') +
      (ky.length ? tog('keys-must', d.keysMust, 'Preferred', 'Theme cards must match') : '') +
      '</div>' +
      setFilterHtml(d.sets || [], d.setsMust, 'dset', lock ? dis : '') +
      '<p class="note" style="margin:0">' +
      ((d.sets || []).length && d.setsMust
        ? 'Only cards printed in ' + d.sets.map(setName).join(', ') + ' (and basic lands) are suggested. '
        : '') +
      (d.typesMust || d.keysMust
        ? 'A rule narrows the choices: ' +
          (d.typesMust ? 'every creature must be one of your types' : '') +
          (d.typesMust && d.keysMust ? ', and ' : '') +
          (d.keysMust ? 'every theme card must have one of your keywords' : '') +
          '. Lands, ramp, card draw and removal are still chosen freely.'
        : 'Preferred filters push matching cards up the list. Switch one to a rule to allow only matching cards.') +
      '</p></details>';
  }
  const pool = d.format === 'commander' ? ctx.ident : ['W', 'U', 'B', 'R', 'G'];
  h += bsec(
    'col',
    'Land colors to focus on',
    pool.length
      ? (ctx.focus.length ? ctx.focus.join(' ') : 'None') +
          (d.format === 'commander' && ctx.ident.length ? ' · ' + ctx.focus.length + ' of ' + ctx.ident.length : '')
      : 'Set by the commander',
    !pool.length || !ctx.focus.length
  );
  if (!pool.length)
    h +=
      '<p class="note" style="margin:0">' +
      (d.format === 'commander'
        ? ctx.cmd
          ? 'Colorless commander: the deck uses Wastes and colorless cards.'
          : 'Pick a commander to set the colors.'
        : '') +
      '</p>';
  else
    h +=
      '<div class="row">' +
      pool
        .map(
          c =>
            '<button class="pip p' +
            c +
            ((d.colors || []).includes(c) ? ' on' : '') +
            '" data-act="color" data-v="' +
            c +
            '" aria-pressed="' +
            (d.colors || []).includes(c) +
            '"' +
            dis +
            '>' +
            c +
            '</button>'
        )
        .join('') +
      '</div><p class="note" style="margin:0">' +
      (d.format === 'commander'
        ? 'Focus colors get most of the basic lands and first pick of upgrades. The rest become a light splash.'
        : 'Pick one to three colors. Every card must fit inside them.') +
      '</p>';
  h += '</details>';
  if (d.format === 'commander' && ctx.cmd && aimed)
    h +=
      bsec('gen', 'Generate', 'A full 100-card build from these settings, in a new deck', false) +
      '<div class="row"><button class="btn pri" data-act="build-gen">Generate a build with these settings</button></div><p class="note" style="margin:0">Designs a full 100-card build for ' +
      esc(ctx.cmd.n.split(',')[0]) +
      (ctx.par ? ' and ' + esc(ctx.par.n.split(',')[0]) : '') +
      ' from the mechanics above, in their order, and your filters and colors, at the ' +
      TIERS[S.gen.tier || 'apex'].label +
      ' price level, straight into a new deck. This one stays as it is. Cards you hold here are kept.</p>' +
      themeFirstToggle(d, lock ? dis : '') +
      '</details>';
  h +=
    '<div class="row"><span class="chip ' +
    (aimed ? 'good' : 'warn') +
    '">' +
    (aimed ? 'Deck is aimed' : 'Not aimed yet') +
    '</span><span class="note">' +
    'Saved in this browser' +
    '</span></div></section>';
  return h;
}
// Theme first on an existing deck: its upgrades and builds put the commander's own set and creature types first.
function themeFirstToggle(d, dis) {
  const T = themeCtx(d);
  if (!T.fam.size && !T.types.size) return '';
  return (
    '<div class="row"><button class="chk' +
    (d.themeFirst ? ' on' : '') +
    '" data-act="theme-first" role="switch" aria-checked="' +
    !!d.themeFirst +
    '"' +
    (dis || '') +
    '><i></i>Theme first</button><span class="note">Cards from ' +
    esc([...T.fam, ...[...T.types].slice(0, 2)].join(', ')) +
    ' are preferred, a little below the strongest cards from any set.</span></div>'
  );
}
const GROUPS = [
  ['Creature', 'Creatures'],
  ['Planeswalker', 'Planeswalkers'],
  ['Instant', 'Instants'],
  ['Sorcery', 'Sorceries'],
  ['Artifact', 'Artifacts'],
  ['Enchantment', 'Enchantments'],
  ['Land', 'Lands']
];
// The name printed on the player's copy when it differs from the card's own name (a reskinned reprint: the TMNT precon's
// "Humongous Fungus" is Corpsejack Menace). Kept from the list the deck came from; for precon decks saved before Build 119, read
// from the precon's own list (EDHREC, already loaded for the open deck).
function printedName(d, e, c) {
  if (e.pn) return e.pn;
  if (!c || d.src !== 'precon' || !EDH.pre || !EDH.pre.list || EDH.key !== d.commander) return '';
  if (printedName.pre !== EDH.pre) {
    printedName.pre = EDH.pre;
    printedName.m = new Map();
    EDH.pre.list.forEach(x => {
      const r = find(x);
      if (r && norm(x) !== r._n && altName(x)) printedName.m.set(r._k, x);
    });
  }
  return printedName.m.get(c._k) || '';
}
function listRows(d, q) {
  const buckets = {},
    unknown = [],
    lq = String(q || '')
      .toLowerCase()
      .trim(),
    byCol = listGroupOf() === 'color';
  let shown = 0;
  const lr = S.listRole || '';
  for (const e of d.cards) {
    const c = find(e.n);
    if (
      lq &&
      !(
        e.n.toLowerCase().includes(lq) ||
        printedName(d, e, c).toLowerCase().includes(lq) ||
        (c && ((c.t || '').toLowerCase().includes(lq) || (c.o || '').toLowerCase().includes(lq)))
      )
    )
      continue;
    if (lr && !(c && (lr === 'gc' ? c.gc : jobsOf(c.n).includes(lr)))) continue;
    shown++;
    if (!c) {
      unknown.push(e);
      continue;
    }
    const t = frontType(c),
      g = byCol ? colGroup(c) : /\bLand\b/.test(t) ? 'Land' : (GROUPS.find(x => new RegExp(x[0]).test(t)) || ['Artifact'])[0];
    (buckets[g] = buckets[g] || []).push([e, c]);
  }
  const rowH = (e, c) =>
    '<button class="dl" data-act="card" data-n="' +
    esc(e.n) +
    '">' +
    (c ? '<img alt="" src="' + artFor(c, e) + '">' : '<span></span>') +
    '<span class="q">' +
    e.q +
    '×</span>' +
    '<span class="nm' +
    (c ? '' : ' unk') +
    '">' +
    (printedName(d, e, c)
      ? esc(printedName(d, e, c)) +
        ' <span class="pnm" title="The card’s own name (this printing carries another name)">' +
        esc(e.n) +
        '</span>'
      : esc(e.n)) +
    (lacks(d, e.n) ? ' <span class="chip warn" title="You added this card to the buy list">On buy list</span>' : '') +
    (c && c.gc && d.format === 'commander' ? ' <span class="chip gc" title="On Wizards’ Game Changer list">GC</span>' : '') +
    '</span><span class="cost">' +
    (c ? pips(c.m) : '') +
    '</span><span class="lk">' +
    (e.l ? SVG.lock : '') +
    '</span>' +
    '<span class="pr">' +
    (e.pp != null ? '$' + e.pp.toFixed(2) : money(c)) +
    '</span></button>';
  let h = '';
  // The commander (and partner) lead the list with a Commander chip; they are not part of the 99.
  if (d.format === 'commander') {
    const cm = [d.commander, d.partner]
      .filter(Boolean)
      .map(n => find(n) || {n})
      .filter(
        c =>
          !lq ||
          c.n.toLowerCase().includes(lq) ||
          (c.t || '').toLowerCase().includes(lq) ||
          (c.o || '').toLowerCase().includes(lq)
      );
    if (cm.length)
      h +=
        '<div class="cmdgrp"><div class="gh"><span>Commander' +
        (cm.length > 1 ? 's' : '') +
        '</span><span>' +
        cm.length +
        '</span></div>' +
        cm
          .map(
            c =>
              '<button class="dl cmdrow" data-act="card" data-n="' +
              esc(c.n) +
              '">' +
              (c.id ? '<img alt="" src="' + artFor(c, {}) + '">' : '<span></span>') +
              '<span class="q">1×</span><span class="nm">' +
              esc(c.n) +
              ' <span class="chip gold">Commander</span></span><span class="cost">' +
              (c.m ? pips(c.m) : '') +
              '</span><span class="lk"></span><span class="pr">' +
              money(c.id ? c : null) +
              '</span></button>'
          )
          .join('') +
        '</div>';
  }
  if (!d.cards.length)
    h +=
      '<p class="note">This deck is empty. Add cards from the Upgrades tab, or set the build and fill the open slots there.</p>';
  else if ((lq || lr) && !shown)
    h +=
      '<p class="note">No card in this deck matches' +
      (lq ? ' “' + esc(q) + '”' : '') +
      (lr ? (lq ? ' and' : '') + ' the ' + esc(LIST_ROLE[lr].toLowerCase()) + ' filter' : '') +
      '.</p>';
  for (const [k, label] of byCol ? BUY_GROUPS.map(([g, l]) => [g, l === 'Land' ? 'Lands' : l]) : GROUPS) {
    const b = buckets[k];
    if (!b) continue;
    const so = S.listSort || 'name',
      pr = x => (x[0].pp != null ? x[0].pp : x[1].p != null ? x[1].p : -1);
    b.sort(
      (x, y) =>
        (so === 'mv' ? x[1].cmc - y[1].cmc : so === 'price' ? pr(y) - pr(x) : 0) ||
        (printedName(d, x[0], x[1]) || x[1].n).localeCompare(printedName(d, y[0], y[1]) || y[1].n)
    );
    h +=
      '<div><div class="gh"><span>' +
      label +
      '</span><span>' +
      b.reduce((s, x) => s + x[0].q, 0) +
      '</span></div>' +
      b.map(x => rowH(x[0], x[1])).join('') +
      '</div>';
  }
  if (unknown.length)
    h +=
      '<div><div class="gh"><span class="unk">Not in the card data yet</span><span>' +
      unknown.reduce((s, e) => s + e.q, 0) +
      '</span></div><p class="note" style="margin:6px 0">These stay in your list but can’t be analyzed until the full card data has loaded.</p>' +
      unknown.map(e => rowH(e, null)).join('') +
      '</div>';
  return h;
}
// A card's colour group (the buy list's rule): its colour identity, one colour or Multicolor; colourless; lands on their own.
const listGroupOf = () => {
  if (S.listGroup == null) {
    let v = null;
    try {
      v = localStorage.getItem('dc.listGroup');
    } catch (e) {}
    S.listGroup = v === 'color' ? 'color' : 'type';
  }
  return S.listGroup;
};
const colGroup = c => (!c ? 'C' : tags(c).land ? 'L' : c.ci.length > 1 ? 'M' : c.ci[0] || 'C');
const deckStat = (d, A) =>
  A.size +
  ' / ' +
  A.T.size +
  ' cards · ' +
  (A.price ? (DBINFO.source === 'starter' ? '~' : '') + '$' + A.price.toFixed(0) : '$0');
// Decklist sort and role filter: cards stay grouped by type; inside each group they sort A–Z (default), by mana value or by
// price, and the role filter shows only the cards doing that job.
const LIST_SORT = {name: 'A–Z', mv: 'Mana value', price: 'Price'},
  LIST_ROLE = {
    '': 'All',
    ramp: 'Ramp',
    draw: 'Card draw',
    removal: 'Removal',
    wipe: 'Board wipes',
    protect: 'Protection',
    counter: 'Counterspells',
    tutor: 'Tutors',
    gc: 'Game Changers'
  };
function listBar(d) {
  const so = S.listSort || 'name',
    lr = S.listRole || '',
    cnt = k =>
      d.cards.reduce((a, e) => {
        const c = find(e.n);
        return a + (c && (k === 'gc' ? c.gc : jobsOf(c.n).includes(k)) ? e.q : 0);
      }, 0);
  const gb = listGroupOf();
  return (
    '<div class="row typebar" role="group" aria-label="Group the decklist"><span class="lab" style="margin:0">Group</span>' +
    [
      ['type', 'Card type'],
      ['color', 'Color']
    ]
      .map(
        ([k, l]) =>
          '<button class="btn sm' +
          (gb === k ? ' pri' : '') +
          '" data-act="listgroup" data-v="' +
          k +
          '" aria-pressed="' +
          (gb === k) +
          '">' +
          l +
          '</button>'
      )
      .join('') +
    '</div>' +
    '<div class="row typebar" role="group" aria-label="Sort the decklist"><span class="lab" style="margin:0">Sort</span>' +
    Object.keys(LIST_SORT)
      .map(
        k =>
          '<button class="btn sm' +
          (so === k ? ' pri' : '') +
          '" data-act="listsort" data-v="' +
          k +
          '" aria-pressed="' +
          (so === k) +
          '">' +
          LIST_SORT[k] +
          '</button>'
      )
      .join('') +
    '</div>' +
    '<div class="row typebar" role="group" aria-label="Show only one role"><span class="lab" style="margin:0">Role</span>' +
    Object.keys(LIST_ROLE)
      .filter(k => !k || cnt(k))
      .map(
        k =>
          '<button class="btn sm' +
          (lr === k ? ' pri' : '') +
          '" data-act="listrole" data-v="' +
          k +
          '" aria-pressed="' +
          (lr === k) +
          '">' +
          LIST_ROLE[k] +
          (k ? ' · ' + cnt(k) : '') +
          '</button>'
      )
      .join('') +
    '</div>'
  );
}
// Considering: cards the player is thinking about for this deck. They are kept with the deck but are not in it: they don't
// count toward its 100 cards, its score or its upgrades. Each can be moved into the deck or taken off the list.
const considerOf = d => d.consider || (d.consider = []);
function libBox(c) {
  if (!c || isBasic(c.n)) return '';
  const q = (Object.entries(lib()).find(([k]) => norm(k) === c._n) || [])[1] || 0;
  return (
    '<div class="grp" id="libbox"><span class="lab">Your library</span><div class="row">' +
    (q
      ? '<span class="chip good">In your library · ' +
        q +
        '</span><button class="btn sm" data-act="lib-add-card" data-n="' +
        esc(c.n) +
        '">Add another</button>'
      : '<button class="btn sm" data-act="lib-add-card" data-n="' + esc(c.n) + '">Add to library</button>') +
    '</div></div>'
  );
}
function considerBox(c) {
  const d = cur();
  if (!d || !c || (S.view !== 'decks' && S.view !== 'deck')) return '';
  const on = considerOf(d).some(x => keyOf(x.n) === c._k),
    f = wantFit(d, c);
  if (f || entryOf(d, c.n)) return '';
  return (
    '<div class="grp" id="considerbox"><span class="lab">Considering</span><div class="row">' +
    (on
      ? '<span class="chip gold">On ' +
        esc(d.name) +
        '’s Considering list</span><button class="btn sm" data-act="consider-rm" data-n="' +
        esc(c.n) +
        '">Take off the list</button>'
      : '<button class="btn sm" data-act="consider-add" data-n="' + esc(c.n) + '">Consider for ' + esc(d.name) + '</button>') +
    '</div><p class="note" style="margin:0">Considering keeps a card with this deck without putting it in: it doesn’t count toward the deck or its score.</p></div>'
  );
}
function considerHtml(d) {
  const L = considerOf(d);
  if (!L.length) return '';
  return (
    '<div><div class="gh"><span>Considering · not in the deck</span><span>' +
    L.length +
    '</span></div>' +
    L.map(x => {
      const c = find(x.n);
      return (
        '<div class="row" style="flex-wrap:nowrap;gap:6px"><div style="flex:1;min-width:0"><button class="dl" data-act="card" data-n="' +
        esc(x.n) +
        '">' +
        (c ? '<img alt="" src="' + artFor(c, {}) + '">' : '<span></span>') +
        '<span class="q">1×</span><span class="nm">' +
        esc(x.n) +
        '</span><span class="cost">' +
        (c ? pips(c.m) : '') +
        '</span><span class="lk"></span><span class="pr">' +
        money(c) +
        '</span></button></div><button class="btn sm" data-act="consider-in" data-n="' +
        esc(x.n) +
        '">Add to deck</button><button class="ico" data-act="consider-rm" data-n="' +
        esc(x.n) +
        '" aria-label="Take ' +
        esc(x.n) +
        ' off the Considering list">×</button></div>'
      );
    }).join('') +
    '</div>'
  );
}
// Compare two decks: the cards only in each, how many they share, and their size, price, score and bracket side by side.
function openCompare(otherId) {
  const d = cur();
  if (!d) return;
  const others = S.profile.decks.filter(x => x.id !== d.id);
  if (!others.length) {
    toast('Save another deck to compare with.');
    return;
  }
  const o = others.find(x => x.id === otherId) || others.find(x => x.id === S.cmpWith) || others[0];
  S.cmpWith = o.id;
  const set = x => new Map(x.cards.map(e => [keyOf(e.n), e])),
    A = set(d),
    B = set(o),
    onlyA = [...A].filter(([k]) => !B.has(k)).map(([, e]) => e),
    onlyB = [...B].filter(([k]) => !A.has(k)).map(([, e]) => e),
    both = [...A.keys()].filter(k => B.has(k)).length;
  const sc = x => {
    if (x.format !== 'commander' || analyze(x).size < 90 || !DBINFO.complete) return '—';
    const e = evalFor(x);
    return e ? e.total + '/100' : '…';
  };
  const col = (x, L) => {
    const Ax = analyze(x);
    return (
      '<div style="flex:1 1 260px;min-width:0"><b>' +
      esc(x.name) +
      '</b><p class="note" style="margin:2px 0 6px">' +
      esc(x.commander || x.format) +
      ' · ' +
      Ax.size +
      ' cards · $' +
      (Ax.price || 0).toFixed(0) +
      ' · score ' +
      sc(x) +
      (Ax.ctx.bracket ? ' · bracket ' + Ax.ctx.bracket : '') +
      '</p><span class="lab">Only in this deck · ' +
      L.reduce((a, e) => a + e.q, 0) +
      '</span>' +
      L.slice()
        .sort((a, b) => a.n.localeCompare(b.n))
        .map(e => {
          const c = find(e.n);
          return (
            '<button class="dl" data-act="card" data-n="' +
            esc(e.n) +
            '">' +
            (c ? '<img alt="" src="' + artFor(c, e) + '">' : '<span></span>') +
            '<span class="q">' +
            e.q +
            '×</span><span class="nm">' +
            esc(e.n) +
            '</span><span class="cost">' +
            (c ? pips(c.m) : '') +
            '</span><span class="lk"></span><span class="pr">' +
            money(c) +
            '</span></button>'
          );
        })
        .join('') +
      '</div>'
    );
  };
  $('#modal').innerHTML =
    '<div class="panel" role="dialog" aria-label="Compare decks"><div class="ph"><h2>Compare decks</h2><button class="ico" data-act="close" aria-label="Close">×</button></div>' +
    '<div class="row"><label class="lab" for="cmp-with" style="margin:0">Compare ' +
    esc(d.name) +
    ' with</label><select id="cmp-with" style="flex:1 1 200px;min-width:0;width:auto">' +
    others
      .map(x => '<option value="' + esc(x.id) + '"' + (x.id === o.id ? ' selected' : '') + '>' + esc(x.name) + '</option>')
      .join('') +
    '</select></div>' +
    '<p class="note" style="margin:0">' +
    both +
    ' card' +
    (both === 1 ? '' : 's') +
    ' in both decks.</p><div class="row" style="align-items:flex-start;gap:12px">' +
    col(d, onlyA) +
    col(o, onlyB) +
    '</div></div>';
  $('#modal').hidden = false;
}
// How many cards in the deck have an upgrade (each card once, however many options it has), plus cards to fix or drop.
// Never suggest a card the deck already has (Commander allows one copy): a last check on every pick, alternative and fix shown.
function hasCard(d, n) {
  if (!d || !n) return false;
  const k = keyOf(n),
    c = find(n),
    k2 = c ? keyOf(c.n) : k;
  return (
    d.cards.some(e => {
      const x = keyOf(e.n);
      if (x === k || x === k2) return true;
      const ec = find(e.n);
      return !!ec && !!c && ec._k === c._k;
    }) || [d.commander, d.partner].some(x => x && (keyOf(x) === k || keyOf(x) === k2))
  );
}
// The Upgrades tab's number: how many cards are recommended to swap out at this deck's own price level (owner, 30 Oct), each
// copy counted, so it matches that level's "Upgrades left" chip; plus any fixes or cards to drop that aren't already counted.
function upCardCount(R, d) {
  const t = d && TIERS[d.tier] ? d.tier : 'apex',
    seen = new Set();
  let n = 0;
  R.paths.forEach(L => {
    const p = tierPick(L, t);
    if (!p || (d && !entryOf(d, p.cut)) || seen.has(keyOf(p.cut))) return;
    seen.add(keyOf(p.cut));
    n += p.q || 1;
  });
  (R.fixes || []).forEach(p => {
    if (!seen.has(keyOf(p.cut))) (seen.add(keyOf(p.cut)), n++);
  });
  (R.drops || []).forEach(p => {
    if (!seen.has(keyOf(p.n))) (seen.add(keyOf(p.n)), n++);
  });
  return n;
}
function listPanel(d, A) {
  return (
    '<div class="row"><span class="lab" style="flex:1;white-space:nowrap">' +
    deckStat(d, A) +
    '</span><button class="btn sm" data-act="buy-addall">Add all to buy list</button><button class="btn sm" data-act="list-all">View all</button></div>' +
    '<div class="row"><input type="search" id="deck-q" placeholder="Search this deck by name, type or rules text" autocomplete="off" value="' +
    esc(S.deckQ || '') +
    '" style="flex:1 1 190px;min-width:0;width:auto"><button class="btn pri" data-act="export-open">Export</button></div>' +
    listBar(d) +
    '<div class="scroll rows" id="rows" data-keep>' +
    listRows(d, S.deckQ) +
    considerHtml(d) +
    '</div>'
  );
}
// Buy list: grouped by the card being replaced. Each group lists every card that could take its place,
// weakest to strongest. Groups are ordered by the replaced card's color, then A–Z.
const BUY_GROUPS = [
  ['W', 'White'],
  ['U', 'Blue'],
  ['B', 'Black'],
  ['R', 'Red'],
  ['G', 'Green'],
  ['M', 'Multicolor'],
  ['C', 'Colorless'],
  ['L', 'Land']
];
// Cards the player chose to buy for a deck (from card search or any card's details). Kept with the deck, so they are saved,
// backed up and restored with it. They are not part of the decklist until the player adds them.
const wantOf = d => d.want || (d.want = []);
// Where a deck came from. Decks built from scratch (generated, or started empty) get an "I don't have this" button on their
// recommendations; precons and imported lists do not. Decks saved before this was recorded: generated and precon decks are
// recognised, anything else counts as imported (no button).
const srcOf = d =>
  d.src ||
  (d.auto === 'precon'
    ? 'precon'
    : d.plan || d.auto === 'commander' || / \(generated\)$/.test(d.name || '')
      ? 'generated'
      : 'import');
const fromScratch = d => !!d && (srcOf(d) === 'scratch' || srcOf(d) === 'generated');
// "I don't have this": the card goes on the deck's buy list and is marked wherever it is shown; nothing is hidden.
const lacks = (d, n) => !!d && (d.lack || []).some(x => keyOf(x) === keyOf(n));
function lackBtn(d, n) {
  if (!fromScratch(d) || !n) return '';
  const on = lacks(d, n) || wantOf(d).some(x => keyOf(x.n) === keyOf(n));
  return on
    ? '<span class="chip good">On the buy list</span>'
    : '<button class="btn sm" data-act="lack" data-n="' +
        esc(n) +
        '" aria-label="Add ' +
        esc(n) +
        ' to the buy list">Add to buy list</button>';
}
// Add to Buy List on an upgrade row: puts the suggested card on this deck's buy list (any deck); the deck itself is unchanged.
function upBuyBtn(d, n) {
  if (!d || !n) return '';
  return wantOf(d).some(x => keyOf(x.n) === keyOf(n)) || lacks(d, n)
    ? '<span class="chip good">On the Buy List</span>'
    : '<button class="btn sm" data-act="up-buy" data-n="' +
        esc(n) +
        '" aria-label="Add ' +
        esc(n) +
        ' to the buy list">Add to Buy List</button>';
}
function wantFit(d, c) {
  if (!c) return 'not in the card data';
  if (d.format === 'commander' && find(d.commander) && !c.ci.every(z => ctxOf(d).ident.includes(z))) return 'outside its colors';
  if (!legalIn(c, d.format)) return 'not legal in ' + (d.format === 'commander' ? 'Commander' : 'Standard');
  return '';
}
// The printing chosen in the card window (set and price), kept with a buy-list entry; exports still use the card's own name.
function pickPrint(c) {
  return c && S.modalCard === c.n && S.pick && S.pick.set && S.pick.id
    ? {pid: S.pick.id, ps: S.pick.set, pp: S.pick.p != null ? S.pick.p : undefined}
    : {};
}
function addWant(d, name, pr) {
  const c = find(name),
    n = c ? c.n : name,
    old = wantOf(d).find(x => keyOf(x.n) === keyOf(n));
  if (old) {
    if (pr && pr.pid) Object.assign(old, pr);
    return false;
  }
  wantOf(d).push(Object.assign({n, q: 1, at: Date.now()}, pr || {}));
  return true;
}
function buyData(d) {
  const hasPlan = d.plan && d.plan.length,
    R = hasPlan ? {paths: [], fixes: []} : recsFor(d),
    grp = c => (!c ? 'C' : tags(c).land ? 'L' : c.ci.length > 1 ? 'M' : c.ci[0] || 'C'),
    order = BUY_GROUPS.map(g => g[0]);
  const item = (p, t) => {
    const c = find(p.add);
    return {n: p.add, q: p.q, p: c ? c.p : null, t, gain: p.gain || 0};
  };
  // the suggestions are worked out once and kept with the deck (owner, 24 Oct: cards already bought vanished when the engine
  // changed); a card that went into the deck, or whose card it replaces left, drops out; Refresh works them out again
  const snap = hasPlan ? null : buySnap(d, R),
    bought = new Set((d.bought || []).map(keyOf));
  const groups = (snap ? snap.groups : [])
    .filter(G => entryOf(d, G.cut))
    .map(G => ({
      cut: G.cut,
      g: grp(find(G.cut)),
      opts: G.opts
        .filter(o => !hasCard(d, o.n) || isBasic(o.n))
        .map(o => Object.assign(item({add: o.n, q: o.q, gain: o.gain}, o.t), {got: bought.has(keyOf(o.n))}))
    }))
    .filter(G => G.opts.length)
    .sort((a, b) => order.indexOf(a.g) - order.indexOf(b.g) || a.cut.localeCompare(b.cut));
  const fixes = R.fixes
    .filter(p => !isBasic(p.add))
    .map(p => ({cut: p.cut, why: p.fix ? p.cutWhy[0] : p.why[0], opts: [item(p, '')]}));
  if (hasPlan)
    d.plan
      .filter(x => !x.own && !x.basic)
      .forEach(x => {
        const mk = (n, gain) => {
          const c = find(n);
          return {n, q: x.q, p: c ? c.p : null, t: tierOfPrice(c), gain};
        };
        groups.push({
          cut: x.a,
          slot: true,
          g: grp(find(x.a)),
          opts: [x.b && mk(x.b, 1), x.m && mk(x.m, 2), mk(x.a, 3)].filter(o => o && !isBasic(o.n))
        });
      });
  if (hasPlan) groups.sort((a, b) => order.indexOf(a.g) - order.indexOf(b.g) || a.cut.localeCompare(b.cut));
  const want = (d.want || []).map(x => {
    const c = find(x.n);
    return {
      n: x.n,
      q: x.q,
      p: x.pp != null ? x.pp : c ? c.p : null,
      ps: x.ps,
      inDeck: !!entryOf(d, x.n),
      lack: x.from === 'lack'
    };
  });
  const count = groups.reduce((s, G) => s + G.opts.length, 0) + fixes.length + want.length;
  return {groups, fixes, want, count};
}
function buySnap(d, R) {
  if (d.buySnap && d.buySnap.groups) return d.buySnap;
  if (!R || R.pending || (R.pool && !R.poolDone) || !R.paths.length) return null;
  d.buySnap = {
    at: new Date().toISOString().slice(0, 10),
    // the same columns the upgrade list shows (tierCols): the slot's best card is its Apex card, whatever it costs
    groups: R.paths.map(L => {
      const C = tierCols(L.opts, p => p.beaten);
      return {
        cut: L.cut,
        opts: TIER_KEYS.filter(t => C[t])
          .map(t => ({n: C[t].add, q: C[t].q, t, gain: C[t].gain || 0}))
          .sort((a, b) => a.gain - b.gain)
      };
    })
  };
  persistSoon();
  return d.buySnap;
}
function buyText(d) {
  const B = buyData(d),
    L = [
      '// ' + d.name + ' · buy list',
      '// Grouped by the card each one replaces. Options run weakest to strongest; buy one per group.'
    ];
  if (!B.count) L.push('// nothing to buy right now');
  if (B.want.length) {
    L.push('', '// Added by you');
    B.want.forEach(x => L.push(x.q + ' ' + x.n));
  }
  B.fixes.forEach(G => {
    L.push('', '// Fix: replaces ' + G.cut);
    G.opts.forEach(x => L.push(x.q + ' ' + x.n));
  });
  B.groups.forEach(G => {
    L.push('', G.slot ? '// For the ' + G.cut + ' slot' : '// Replaces ' + G.cut);
    G.opts.forEach(x => L.push(x.q + ' ' + x.n));
  });
  return L.join('\n') + '\n';
}
function buyHtml(d) {
  const B = buyData(d),
    est = DBINFO.source === 'starter' ? '~' : '';
  const row = x =>
    '<button class="dl buy" data-act="card" data-n="' +
    esc(x.n) +
    '"><span class="q">' +
    x.q +
    '×</span><span class="nm">' +
    esc(x.n) +
    printTag(find(x.n)) +
    '</span>' +
    (x.t
      ? '<span class="chip gold"' +
        (driftOf(d, x.n, x.t) ? ' title="$' + driftOf(d, x.n, x.t).p.toFixed(2) + ' when it was picked"' : '') +
        '>' +
        TIERS[x.t].label +
        (driftOf(d, x.n, x.t) ? ' · was $' + driftOf(d, x.n, x.t).p.toFixed(2) : '') +
        '</span>'
      : '<span></span>') +
    '<span class="pr">' +
    money(find(x.n)) +
    '</span></button>';
  const box = (G, fix) => {
    const c = find(G.cut);
    return (
      '<div class="buygrp"><button class="sw out" data-act="card" data-n="' +
      esc(G.cut) +
      '">' +
      (c ? '<img alt="" src="' + artFor(c) + '">' : '<span></span>') +
      '<span><small>' +
      (fix ? esc(G.why || 'Needs replacing') : G.slot ? 'Open slot · built for' : 'Replaces') +
      '</small>' +
      esc(G.cut) +
      '</span><em>' +
      (G.opts.length > 1 ? G.opts.length + ' options' : '1 option') +
      '</em></button>' +
      G.opts
        .map(
          x =>
            '<div class="row" style="flex-wrap:nowrap;gap:6px"><div style="flex:1;min-width:0">' +
            row(x) +
            '</div><button class="btn sm' +
            (x.got ? ' pri' : '') +
            '" data-act="buy-got" data-n="' +
            esc(x.n) +
            '" aria-pressed="' +
            !!x.got +
            '" title="Mark that you have bought this card">' +
            (x.got ? 'Bought ✓' : 'Bought?') +
            '</button></div>'
        )
        .join('') +
      '</div>'
    );
  };
  const wantHtml = B.want.length
    ? '<div class="grp"><span class="lab">Added by you · ' +
      B.want.length +
      ' card' +
      (B.want.length === 1 ? '' : 's') +
      (B.want.some(x => x.p != null) ? ' · ' + est + '$' + B.want.reduce((a, x) => a + (x.p || 0) * x.q, 0).toFixed(2) : '') +
      '</span>' +
      B.want
        .map(
          (x, i) =>
            '<div class="row" style="flex-wrap:nowrap;gap:6px"><div style="flex:1;min-width:0">' +
            row(x) +
            '</div>' +
            (x.lack
              ? '<span class="chip warn" title="Added to the buy list from a recommendation">From a suggestion</span>'
              : '') +
            (x.inDeck ? '<span class="chip good">In the deck</span>' : '') +
            '<button class="ico" data-act="want-rm" data-v="' +
            i +
            '" aria-label="Remove ' +
            esc(x.n) +
            ' from the buy list" title="Remove from the buy list">×</button></div>'
        )
        .join('') +
      '</div>'
    : '';
  if (B.count === B.want.length && B.want.length)
    return (
      wantHtml +
      '<p class="note" style="margin:0">No upgrades to suggest beyond the cards you added' +
      (isAimed(d) ? '.' : ': set up the build to see suggested upgrades too.') +
      '</p>'
    );
  if (!B.count)
    return (
      '<p class="note" style="margin:0">Nothing to buy right now: no card in this deck has a worthwhile upgrade' +
      (DBINFO.complete ? '.' : ' yet. Card data is still downloading, so this list will grow.') +
      '</p>'
    );
  return (
    wantHtml +
    '<p class="note" style="margin:0">Grouped by the card being replaced. Each group lists the cards that could take its place, weakest to strongest, so you only need one per group.' +
    (d.buySnap && d.buySnap.at
      ? ' Suggestions as worked out on ' +
        d.buySnap.at +
        '; they stay put until you refresh them. <button class="btn sm" data-act="buy-refresh">Refresh suggestions</button>'
      : '') +
    (DBINFO.complete ? '' : ' Card data is still downloading, so this list will grow.') +
    '</p>' +
    (B.fixes.length
      ? '<div class="grp"><span class="lab">Fixes this deck needs</span>' + B.fixes.map(G => box(G, true)).join('') + '</div>'
      : '') +
    BUY_GROUPS.map(([k, label]) => {
      const gs = B.groups.filter(G => G.g === k);
      return gs.length ? '<div class="grp"><span class="lab">' + label + '</span>' + gs.map(G => box(G)).join('') + '</div>' : '';
    }).join('')
  );
}
// Deck value chip: the total price of the cards in the deck ("+" when some cards have no price yet).
function priceChip(A) {
  return A.price > 0
    ? '<span class="chip gold" title="Total price of the cards in this deck">' +
        (DBINFO.source === 'starter' ? '~' : '') +
        '$' +
        Math.round(A.price).toLocaleString() +
        (A.priced ? '' : '+') +
        '</span>'
    : '';
}
function buyPanel(d) {
  if (!isAimed(d) && !(d.want || []).length)
    return '<div class="scroll"><div class="gate"><b>Set up the build first</b>The buy list comes from the deck’s upgrade paths, which need the build to be set. You can also add any card from Card search.</div></div>';
  return (
    '<div class="row"><span class="lab" style="flex:1">What to buy, by the card it replaces</span><button class="btn pri sm" data-act="buy-copy">Copy as text</button><button class="btn sm" data-act="buy-save">Save text file</button></div>' +
    '<div class="scroll" id="buyscroll" data-keep>' +
    buyHtml(d) +
    '</div>'
  );
}
// Export: the decklist (or, for a build in progress, the full build at a tier) as text or a spreadsheet file.
function exportRows(d, what) {
  const rows = d.cards.map(x => ({n: x.n, q: x.q}));
  if (what !== 'deck' && d.plan)
    d.plan.forEach(x => {
      const n = x.own || x.seed || x.basic ? x.a : planPick(x, what),
        r = rows.find(y => y.n === n);
      if (r) r.q += x.q;
      else rows.push({n, q: x.q});
    });
  return rows;
}
// "(SET) number" for a line: the printing chosen for that card in this deck, else the card's default (cheapest) printing.
async function resolvePrints(d) {
  const todo = d.cards.filter(x => x.psc && !x.pid).slice(0, 150);
  if (!todo.length) return;
  let done = 0;
  for (const en of todo) {
    try {
      const r = await sfetch(
        'https://api.scryfall.com/cards/' + encodeURIComponent(en.psc) + (en.pcn ? '/' + encodeURIComponent(en.pcn) : '')
      );
      if (!r.ok) continue;
      const o = await r.json();
      if (!o || !o.id || norm(String(o.name || '').split(' // ')[0]) !== norm(en.n.split(' // ')[0])) continue;
      setPrint(en, {id: o.id, set: o.set_name, sc: o.set, cn: o.collector_number, rar: o.rarity, p: priceOf(o)});
      done++;
      if (done % 10 === 0) {
        persistSoon();
        render();
      }
    } catch (err) {
      break;
    }
  }
  if (done) {
    persistSoon();
    render();
    toast('Matched ' + done + ' card' + (done === 1 ? '' : 's') + ' to the printings in your list.');
  }
}
// Regenerate: drop the held picks, refresh the commander's play data, and weigh every option again. Reports what changed.
function picksOf(d) {
  const o = [];
  recsFor(d).paths.forEach(L =>
    TIER_KEYS.forEach(t => {
      const p = L.opts[t];
      if (p && !p.beaten) o.push({cut: L.cut, t, n: p.add});
    })
  );
  return o;
}
function openRegen() {
  const d = cur();
  if (!d) return;
  S.modalCard = null;
  const n = Object.keys(d.recP || {}).length;
  $('#modal').innerHTML =
    '<div class="panel" role="dialog" aria-label="Regenerate picks"><div class="ph"><h2>Regenerate picks?</h2><small>' +
    esc(d.name) +
    '</small><button class="ico" data-act="close" aria-label="Close">×</button></div>' +
    '<p class="note" style="margin:0">This fetches the latest data and builds the list again from scratch' +
    (n ? ', and releases the ' + n + ' alternative' + (n === 1 ? '' : 's') + ' you chose' : '') +
    '. Cards in your deck, your library, cards you ruled out and your swap history stay as they are. You can undo it.</p>' +
    '<div class="row"><button class="btn pri" data-act="regen-go">Regenerate</button><button class="btn" data-act="close">Cancel</button></div></div>';
  $('#modal').hidden = false;
}
async function doRegen() {
  S.upOrd = null; // the new list is sorted afresh

  const d = cur();
  if (!d) return;
  const before = picksOf(d),
    c = d.format === 'commander' ? find(d.commander) : null;
  $('#modal').innerHTML =
    '<div class="panel" role="dialog" aria-label="Regenerate picks"><div class="ph"><h2>Regenerating…</h2><small>' +
    esc(d.name) +
    '</small></div><p class="note" style="margin:0">Fetching the latest data and weighing every option again.</p></div>';
  d.recPrev = d.recP || {};
  d.recP = {};
  d.regenAt = new Date().toISOString().slice(0, 10);
  recDrop(d); // the saved list is not used again
  let fresh = false;
  if (c) {
    const slug = edhSlug(c.n),
      old = lsGet('dc.edh.' + slug);
    try {
      lsSet('dc.edh.' + slug, null);
      EDH = {key: '', map: null, decks: 0, state: ''};
      await loadEdh(c.n);
      fresh = EDH.state === 'ok';
    } catch (err) {}
    if (!fresh && old) {
      lsSet('dc.edh.' + slug, old);
      EDH = {key: '', map: null, decks: 0, state: ''};
      try {
        await loadEdh(c.n);
      } catch (err) {}
    }
    // the theme pages the mechanics rely on come back before anything is weighed, or the new picks would be built without them
    if (EDH.key === c.n && EDH.state === 'ok') {
      try {
        await loadThemes(c.n, d.aims);
      } catch (err) {}
    }
    for (let i = 0; i < 80 && !apexFor(d) && analyze(d).size >= 90; i++) await new Promise(r => setTimeout(r, 100));
  }
  touch();
  render();
  await recsReady(d);
  render();
  const after = picksOf(d),
    key = x => x.cut + '|' + x.t + '|' + x.n,
    B = new Set(before.map(key)),
    A = new Set(after.map(key));
  const added = after.filter(x => !B.has(key(x))),
    gone = before.filter(x => !A.has(key(x))),
    same = after.length - added.length;
  const line = (x, lab) =>
    '<button class="dl buy" data-act="card" data-n="' +
    esc(x.n) +
    '"><span class="q">' +
    lab +
    '</span><span class="nm">' +
    esc(x.n) +
    '</span><span class="chip gold">' +
    TIERS[x.t].label +
    '</span><span class="pr">for ' +
    esc(x.cut) +
    '</span></button>';
  $('#modal').innerHTML =
    '<div class="panel" role="dialog" aria-label="Regenerate picks"><div class="ph"><h2>Picks regenerated</h2><small>' +
    esc(d.name) +
    '</small><button class="ico" data-act="close" aria-label="Close">×</button></div>' +
    '<p class="note" style="margin:0">' +
    same +
    ' pick' +
    (same === 1 ? '' : 's') +
    ' unchanged · ' +
    added.length +
    ' new · ' +
    gone.length +
    ' no longer suggested.' +
    (c && !fresh ? ' The latest play data could not be fetched, so this used the data already on this device.' : '') +
    '</p>' +
    '<div class="mscroll">' +
    (added.length ? '<div class="grp"><span class="lab">New</span>' + added.map(x => line(x, '+')).join('') + '</div>' : '') +
    (gone.length
      ? '<div class="grp"><span class="lab">No longer suggested</span>' + gone.map(x => line(x, '−')).join('') + '</div>'
      : '') +
    '</div>' +
    '<div class="row"><button class="btn pri" data-act="close">Keep the new picks</button><button class="btn" data-act="regen-undo">Undo</button></div></div>';
  $('#modal').hidden = false;
}
