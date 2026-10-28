// ---------- events ----------
const COLOR_NAME = {W: 'white', U: 'blue', B: 'black', R: 'red', G: 'green'};
const planText = plan =>
  plan.changes
    .slice()
    .sort((a, b) => a.delta - b.delta)
    .map(x => (x.delta > 0 ? '+' : '−') + Math.abs(x.delta) + ' ' + x.n)
    .join(', ');
// Before a card goes in, check whether it needs a color of mana the deck doesn't use yet. If so, ask first.
function manaCheck(d, act, v, n) {
  if (S.manaOK || !d || !/^(add-to-deck|pick-add|want|swap)$/.test(act)) return false;
  let add = n,
    cut = null;
  if (act === 'pick-add') return false; // picking opens the card with its tip; the check runs when it is actually added
  if (act === 'want') cut = v;
  if (act === 'swap') {
    const [i, t] = String(v).split('|'),
      L = recsFor(d).paths[+i],
      p = L && L.opts[t];
    if (!p) return false;
    add = p.add;
    cut = p.cut;
  }
  const c = find(add);
  if (!c || tags(c).land) return false;
  const before = manaPlan(d),
    sim = JSON.parse(JSON.stringify(d));
  if (cut) cutCard(sim, cut, 1);
  addCard(sim, add, 1);
  const after = manaPlan(sim),
    fresh = 'WUBRG'
      .split('')
      .filter(
        k =>
          after.spell[k] > 0 &&
          before.spell[k] === 0 &&
          (d.format !== 'commander' || !find(d.commander) || find(d.commander).ci.includes(k))
      );
  if (!fresh.length || (after.basics && !after.changes.length)) return false; // nothing new, or the lands already cover it
  S.pend = {act, v, n};
  S.modalCard = null;
  const names = fresh.map(k => COLOR_NAME[k]).join(' and ');
  $('#modal').innerHTML =
    '<div class="panel" role="dialog" aria-label="Mana adjustment"><div class="ph"><h2>New mana needed</h2><button class="ico" data-act="close" aria-label="Close">×</button></div>' +
    '<p style="margin:0"><b>' +
    esc(c.n) +
    '</b> ' +
    pips(c.m) +
    ' needs ' +
    names +
    ' mana, which this deck doesn’t use yet.</p>' +
    (after.changes.length
      ? '<div class="gate"><b>I will make this land adjustment to compensate</b>' +
        esc(planText(after)) +
        '<p class="note" style="margin:8px 0 0">Basic lands are split in proportion to the colored mana your spells need, so one ' +
        names +
        ' card gets a small share, not a big one. Result: ' +
        'WUBRG'
          .split('')
          .filter(k => after.want[k])
          .map(k => after.want[k] + ' ' + COLOR_BASIC[k])
          .join(', ') +
        '.</p></div>' +
        '<div class="row"><button class="btn pri" data-act="mana-accept">Accept the change</button><button class="btn" data-act="mana-skip">Add the card, leave lands alone</button><button class="btn" data-act="close">Cancel</button></div>'
      : '<p class="note" style="margin:0">This deck has no basic lands to rebalance, so you would need to add ' +
        names +
        ' sources yourself.</p><div class="row"><button class="btn pri" data-act="mana-skip">Add the card anyway</button><button class="btn" data-act="close">Cancel</button></div>') +
    '</div>';
  $('#modal').hidden = false;
  return true;
}
// Confirmation: every button that removes, deletes or rules out something asks first, in its own small window above
// whatever is open, and says what will happen. Nothing happens on Cancel.
function swapAsk(cut, add) {
  return [
    cut && add ? 'Swap ' + cut + ' for ' + add + '?' : 'Make this swap?',
    cut && add
      ? cut + ' comes out of ' + ((cur() || {}).name || 'the deck') + ' and ' + add + ' goes in. Undo can switch them back.'
      : 'The deck changes. Undo can switch it back.',
    'Swap'
  ];
}
const CONFIRM = {
  'buy-addall': () => {
    const d = cur(),
      k = d ? addAllPlan(d).length : 0;
    return [
      'Add the whole deck to its buy list?',
      k
        ? k +
          ' card' +
          (k === 1 ? '' : 's') +
          ' from ' +
          d.name +
          ' (commander and nonbasic lands included, basic lands left out) go on its buy list. Cards already there are not added twice.'
        : 'Every card is already on this deck’s buy list.',
      'Add to buy list'
    ];
  },
  'want-installed': (v, n) => {
    const d = S.profile.decks.find(x => x.id === v),
      L = String(n).split('|');
    return [
      'Remove from the buy list?',
      'You put ' +
        L.join(', ') +
        ' in ' +
        (d ? d.name : 'this deck') +
        '. Take ' +
        (L.length > 1 ? 'them' : 'it') +
        ' off this deck’s buy list? Other buy lists stay as they are.',
      'Remove from buy list'
    ];
  },
  dismiss: (v, n) => [
    'Remove the suggestion ' + n + '?',
    n + ' will no longer be recommended for this deck. You can bring it back from the list of cards you ruled out.',
    'Remove suggestion'
  ],
  'watch-drop': (v, n) => ['Exclude ' + n + '?', n + ' will no longer be recommended for this deck.', 'Exclude it'],
  rm: (v, n) => [
    'Remove ' + n + ' from the deck?',
    'Every copy of ' + n + ' leaves this deck, and it will not be suggested again for it. Undo can bring it back.',
    'Remove'
  ],
  drop: () => ['Remove this card from the deck?', 'The card leaves this deck. Undo can bring it back.', 'Remove'],
  'del-deck': v => {
    const d = S.profile.decks.find(x => x.id === v);
    return [
      'Delete ' + (d ? '“' + d.name + '”' : 'this deck') + '?',
      'The deck, its upgrade history and its buy list are deleted. Undo can bring it back during this visit; after that only a backup file can.',
      'Delete deck'
    ];
  },
  'draft-discard': () => [
    'Discard this unsaved deck?',
    '“' + ((S.draft || {}).name || 'This deck') + '” was never saved and will be gone.',
    'Discard'
  ],
  'want-rm': () => [
    'Remove from the buy list?',
    'The card comes off this deck’s buy list. The deck itself does not change.',
    'Remove'
  ],
  'want-undo': (v, n) => ['Remove ' + n + ' from the buy list?', 'The card comes off the buy list. No deck changes.', 'Remove'],
  'mywant-rm': () => ['Remove from your buy list?', 'The card comes off your own buy list.', 'Remove'],
  // owner, 24 Oct: no Undo happens without confirming what it will undo
  undo: () => {
    const u = UNDO.stack[UNDO.stack.length - 1];
    return [
      'Undo ' + (u && u.label ? '“' + u.label + '”' : 'the last change') + '?',
      u
        ? 'Your decks go back to how they were just before ' +
          (u.label ? '“' + u.label + '”' : 'the last change') +
          '. You can undo again after that, one change at a time.'
        : 'There is nothing to undo.',
      'Undo it'
    ];
  },
  'undo-card': (v, n) => {
    const d = cur(),
      en = d && d.cards.find(x => x.n === n),
      hh = en && en.hist && en.hist[en.hist.length - 1];
    return [
      'Undo the swap for ' + n + '?',
      hh ? n + ' comes out and ' + hh.n + ' goes back in.' : n + ' goes back to the card it replaced.',
      'Undo swap'
    ];
  },
  'plan-regen-undo': () => [
    'Undo the rebuild?',
    'The deck’s cards go back to what they were before it was rebuilt.',
    'Undo rebuild'
  ],
  'regen-undo': () => [
    'Undo the last Regenerate?',
    'The upgrade picks go back to what they were before you pressed Regenerate. Your deck’s cards do not change.',
    'Undo regenerate'
  ],
  'buy-refresh': () => [
    'Refresh the suggested buys?',
    'The suggestions are worked out again from the current upgrade list, so some cards may change. Cards you added yourself, and the Bought marks, stay.',
    'Refresh'
  ],
  'lib-clear': () => [
    'Empty your library?',
    'Every card you marked as owned is removed from your library, for all your decks.',
    'Empty library'
  ],
  'lib-not-own': (v, n) => [
    'Add ' + n + ' to the buy list?',
    'It comes out of your library (it will no longer count as a card you own, in any deck) and goes on this deck’s buy list.',
    'Add to buy list'
  ],
  'clear-cmd': () => [
    'Remove the commander?',
    'The deck keeps its cards but has no commander until you pick one.',
    'Remove commander'
  ],
  'partner-clear': () => ['Remove the second commander?', 'The deck goes back to one commander and its colours.', 'Remove'],
  'restore-replace': () => [
    'Replace all your decks with the backup?',
    'Every deck now in this browser is replaced by the decks in the backup file.',
    'Replace all'
  ],
  'stats-reset': () => [
    'Start counting from now?',
    'Score, swap and spending changes will be counted from today instead of the earlier date.',
    'Start from now'
  ],
  'ver-restore': v => [
    'Restore this version?',
    'The deck’s cards go back to how they were then. The cards it has now are kept in History, so you can come back.',
    'Restore'
  ],
  'player-rm': (v, n) => [
    'Remove ' + n + '?',
    n + ' comes off your list of players. Their decks are kept and still show their name.',
    'Remove'
  ],
  'consider-rm': (v, n) => [
    'Take ' + n + ' off the Considering list?',
    'It stays out of the deck and comes off this deck’s Considering list.',
    'Take it off'
  ],
  'seed-del': (v, n) => ['Remove ' + n + '?', n + ' comes off the list of cards to build around.', 'Remove'],
  'aim-rm': () => [
    'Remove this mechanic?',
    'The build stops aiming for it, so the upgrade list changes. You can add it back from the Build panel.',
    'Remove'
  ],
  'type-rm': () => [
    'Remove this creature type?',
    'The build stops preferring it. You can add it back from the Build panel.',
    'Remove'
  ],
  'key-rm': () => ['Remove this keyword?', 'The build stops preferring it. You can add it back from the Build panel.', 'Remove'],
  'dset-rm': () => [
    'Remove this card set?',
    'The build stops using this set. You can add it back from the Build panel.',
    'Remove'
  ],
  // buttons that change many cards at once, or make a new deck, ask first too
  'build-gen': () => {
    const d = cur();
    return [
      'Generate a new build?',
      'A new 100-card deck' +
        (d ? ' named “' + d.name.replace(/ \(generated\)$/, '') + ' (generated)”' : '') +
        ' is designed from these settings and opened. ' +
        (d ? '“' + d.name + '” itself' : 'This deck') +
        ' is not changed.',
      'Generate'
    ];
  },
  'swap-all': v => {
    const d = cur(),
      R = d && recsFor(d),
      k = R
        ? R.paths.filter(L => {
            const p = v === 'free' ? L.opts.free : tierPick(L, v);
            return p && !p.pc;
          }).length
        : 0;
    return [
      'Make every ' + ((TIERS[v] || {label: 'free'}).label || v) + ' swap?',
      (k ? k + ' card' + (k === 1 ? '' : 's') : 'Every suggested card') +
        ' in the deck will be swapped at once. Undo can put them back.',
      'Make the swaps'
    ];
  },
  'fix-top': v => [
    'Make the top swaps for ' + v + '?',
    'The best swaps in this list are made at once. Undo can put them back.',
    'Make the swaps'
  ],
  'mana-apply': () => [
    'Adjust the lands?',
    'The deck’s lands are changed to match the colours your spells need. Undo can put them back.',
    'Adjust lands'
  ],
  'cmd-switch': (v, n) => [
    'Make ' + n + ' the commander?',
    'The deck’s commander changes, which changes its colours and every suggestion. Undo can switch it back.',
    'Switch commander'
  ],
  // every swap and every card added to a deck asks first (owner's rule); each still has Undo
  swap: v => {
    const d = cur(),
      [i, t, al] = String(v).split('|'),
      R = d && recsFor(d),
      L = R && R.paths[+i],
      col = al && L ? rowCols(d, R, L, +i)[t] : null,
      p = col ? col.p : L && L.opts[t];
    return swapAsk(p && p.cut, p && p.add);
  },
  'swap-a3': (v, n) => {
    const d = cur(),
      [i, t] = String(v).split('|'),
      R = d && recsFor(d),
      L = R && R.paths[+i],
      col = L && rowCols(d, R, L, +i)[t];
    return swapAsk(col && col.p && col.p.cut, n);
  },
  want: (v, n) => swapAsk(v, n),
  'dtag-rm': (v, n) => ['Remove the tag ' + n + '?', 'Only the tag comes off; the deck itself does not change.', 'Remove tag'],
  'folder-del': (v, n) => {
    const k = S.profile.decks.filter(x => (x.folder || '').trim() === n).length;
    return [
      'Delete the folder ' + n + '?',
      'Its ' + k + ' deck' + (k === 1 ? ' is' : 's are') + ' kept and move to No folder.',
      'Delete folder'
    ];
  },
  'nh-swap': (v, n) => swapAsk(v, n),
  'swap-top': (v, n) => {
    const d = cur(),
      L = d && recsFor(d).paths[+v];
    return swapAsk(L && L.cut, n);
  },
  'fix-swap': v => {
    const [k, i] = String(v).split('|'),
      g = (S.fixG || []).find(x => x.k === k),
      p = g && g.L[+i];
    return swapAsk(p && p.cut, p && p.add);
  },
  'swap-cap': v => {
    const d = cur(),
      k = d ? capList(d, v).length : 0;
    return [
      'Make ' + (k || 'these') + ' swap' + (k === 1 ? '' : 's') + '?',
      'Every card in this price-capped list is swapped in at once. Undo can put them back.',
      'Make the swaps'
    ];
  },
  'add-to-deck': (v, n) => [
    'Add ' + n + ' to the deck?',
    n + ' goes into ' + ((cur() || {}).name || 'this deck') + ' without taking anything out. Undo can take it back out.',
    'Add it'
  ],
  'consider-in': (v, n) => [
    'Put ' + n + ' in the deck?',
    n + ' moves from Considering into ' + ((cur() || {}).name || 'this deck') + '. Undo can take it back out.',
    'Put it in'
  ],
  'an-apply': () => [
    'Change the build’s mechanics?',
    'The deck’s mechanics are replaced with the ones the analysis found, so the upgrade list changes. You can change them back in the Build panel.',
    'Change them'
  ]
};
function askConfirm(act, v, n, p, label) {
  if (S.autoYes && S.autoYes.has(act)) {
    askConfirm.pending = {act, v, n, p, label};
    confirmDone(true);
    return;
  } // test switch, like S.syncRecs
  const [t, x, ok] = CONFIRM[act](v, n || '');
  let c = $('#confirm');
  if (!c) {
    c = document.createElement('div');
    c.id = 'confirm';
    c.className = 'modal';
    c.style.zIndex = 60;
    document.body.appendChild(c);
  }
  askConfirm.pending = {act, v, n, p, label};
  c.innerHTML =
    '<div class="panel" role="alertdialog" aria-modal="true" aria-label="' +
    esc(t) +
    '" style="width:min(440px,100%)"><div class="ph"><h2>' +
    esc(t) +
    '</h2></div><p class="note" style="margin:0">' +
    esc(x) +
    '</p><div class="row" style="justify-content:flex-end"><button class="btn" data-act="conf-no">Cancel</button><button class="btn danger" data-act="conf-yes">' +
    esc(ok) +
    '</button></div></div>';
  c.hidden = false;
  const y = c.querySelector('[data-act="conf-no"]');
  if (y) y.focus();
}
function confirmDone(yes) {
  const c = $('#confirm'),
    P = askConfirm.pending;
  if (c) c.hidden = true;
  askConfirm.pending = null;
  if (!yes || !P) return;
  if (P.act === 'del-deck') S.confirmDel = P.v;
  if (P.act === 'lib-clear') S.confirmLib = true;
  if (P.act !== 'undo') UNDO.label = P.label;
  handleAct(P.act, P.v, P.n, P.p);
}
document.addEventListener('click', ev => {
  if (ev.target.id === 'confirm') {
    confirmDone(false);
    return;
  }
  {
    const cb = ev.target.closest('[data-act="conf-yes"],[data-act="conf-no"]');
    if (cb) {
      confirmDone(cb.dataset.act === 'conf-yes');
      return;
    }
  }
  {
    const b0 = ev.target.closest('[data-act]');
    if (b0 && CONFIRM[b0.dataset.act]) {
      askConfirm(
        b0.dataset.act,
        b0.dataset.v,
        b0.dataset.n,
        b0.dataset.p,
        (b0.getAttribute('aria-label') || b0.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 48)
      );
      return;
    }
  }
  if (ev.target.id === 'modal') {
    $('#modal').hidden = true;
    S.watchOpen = false;
    return;
  }
  const b = ev.target.closest('[data-act]');
  if (b) {
    if (b.dataset.act !== 'undo') {
      UNDO.label = (b.getAttribute('aria-label') || b.textContent || b.dataset.act).replace(/\s+/g, ' ').trim().slice(0, 48);
    }
    handleAct(b.dataset.act, b.dataset.v, b.dataset.n, b.dataset.p);
  }
});
// Pop-up frame: the window's frame and title stay still and only the content scrolls. Every pop-up's content (all but its
// title row) is moved into one scrolling body when it is shown; a pop-up that already has its own scrolling list keeps it.
function frameModal() {
  const m = $('#modal');
  if (!m || m.hidden) return;
  const p = m.querySelector(':scope > .panel');
  if (!p || p.classList.contains('full') || p.classList.contains('framed')) return;
  p.classList.add('framed');
  if (p.querySelector(':scope > .mscroll')) return;
  const kids = [...p.children].filter(x => !x.classList.contains('ph'));
  if (!kids.length) return;
  const b = document.createElement('div');
  b.className = 'mbody';
  kids.forEach(x => b.appendChild(x));
  p.appendChild(b);
}
{
  const fm = () => {
    const m = $('#modal');
    if (m && typeof MutationObserver !== 'undefined')
      new MutationObserver(frameModal).observe(m, {childList: true, attributes: true, attributeFilter: ['hidden']});
  };
  if (document.readyState === 'loading') addEventListener('DOMContentLoaded', fm);
  else fm();
}
function handleAct(act, v, n, pArg) {
  if (act !== 'undo') UNDO.seq++;
  const b = {dataset: {p: pArg}},
    d = cur();
  let changed = true;
  if (manaCheck(d, act, v, n)) return;
  switch (act) {
    case 'nav':
      S.view = v;
      S.open = false;
      S.confirmDel = null;
      changed = false;
      break;
    case 'close':
      $('#modal').hidden = true;
      S.watchOpen = false;
      return;
    case 'undo':
      undoLast();
      return;
    case 'dup-deck': {
      const src = S.profile.decks.find(x => x.id === v);
      if (!src) return;
      const cp = JSON.parse(JSON.stringify(src));
      cp.id = uid();
      cp.name = src.name.replace(/ \(copy( \d+)?\)$/, '') + ' (copy)';
      cp.example = false;
      delete cp.regenUndo;
      delete cp.base;
      S.profile.decks.splice(S.profile.decks.indexOf(src) + 1, 0, cp);
      S.deckId = cp.id;
      S.open = true;
      S.view = 'decks';
      toast('Duplicated as “' + cp.name + '”. The original is unchanged.');
      break;
    }
    case 'regen':
      openRegen();
      return;
    case 'plan-regen': {
      if (!d || !d.plan) return;
      const room = Math.max(0, planNeed(d) - d.cards.reduce((a, e) => a + e.q, 0));
      $('#modal').innerHTML =
        '<div class="panel" role="dialog" aria-label="Regenerate around my cards"><div class="ph"><h2>Regenerate around my cards?</h2><button class="ico" data-act="close" aria-label="Close">×</button></div>' +
        '<p class="note" style="margin:0">Every card in your deck stays, as the starting point. The ' +
        room +
        ' open slot' +
        (room === 1 ? '' : 's') +
        ' are filled with the cheapest card that suits each one, designed around your cards. From then on every suggestion in Upgrades is an upgrade from where your deck is (Budget, then Mid, then Apex), and each one must raise the deck score. You can undo this.</p>' +
        '<div class="row"><button class="btn pri" data-act="plan-regen-go">Regenerate</button><button class="btn" data-act="close">Cancel</button></div></div>';
      $('#modal').hidden = false;
      return;
    }
    case 'plan-regen-go': {
      if (!d || !d.plan) return;
      $('#modal').hidden = true;
      setStatus('Thinking… designing the open slots around your ' + d.cards.reduce((a, e) => a + e.q, 0) + ' cards');
      {
        const el = $('#status');
        if (el) el.classList.add('think');
      }
      setTimeout(async () => {
        let n;
        try {
          n = await regenPlan(d);
        } finally {
          {
            const el = $('#status');
            if (el) el.classList.remove('think');
          }
          setStatus('');
        }
        if (cur() !== d) return;
        S.tab = 'up';
        touch();
        render();
        toast(
          'Filled ' + n + ' slot' + (n === 1 ? '' : 's') + ' around your cards. Every suggestion is now an upgrade from here.'
        );
      }, 30);
      return;
    }
    case 'plan-regen-undo':
      if (d && d.regenUndo) {
        d.cards = d.regenUndo.cards;
        if (d.regenUndo.plan) d.plan = d.regenUndo.plan;
        d.recP = d.regenUndo.recP || {};
        delete d.regenUndo;
        S.planShow = 0;
        toast('Put your deck and the previous plan back.');
      }
      break;
    case 'regen-go':
      doRegen();
      return;
    case 'hold-release':
      if (d.recP) delete d.recP[norm(n)];
      toast(n + ' is no longer held for this deck.');
      break;
    case 'regen-undo':
      if (d.recPrev) {
        d.recP = d.recPrev;
        delete d.recPrev;
      }
      $('#modal').hidden = true;
      toast('Put the previous picks back.');
      break;
    case 'watch-keep': {
      const r = d.recP && d.recP[norm(n)];
      if (r) r.ack = true;
      toast(n + ' stays where it was recommended.');
      break;
    }
    case 'watch-move':
      if (d.recP) delete d.recP[norm(n)];
      toast(n + ' will be placed by today’s price.');
      break;
    case 'watch-drop':
      if (d.recP) delete d.recP[norm(n)];
      ruleOut(d, n);
      toast(n + ' excluded from this deck’s recommendations.');
      break;
    case 'watch-ok':
      d.okIllegal = (d.okIllegal || []).filter(x => norm(x) !== norm(n)).concat(n);
      break;
    case 'watch-fix':
      $('#modal').hidden = true;
      S.watchOpen = false;
      S.tab = 'up';
      changed = false;
      break;
    case 'card':
      openCard(n, b.dataset.p);
      return;
    case 'flip': {
      const c = find(S.modalCard);
      if (!c || !c.df) return;
      S.face = S.face ? 0 : 1;
      const im = $('#modal .card.real img'),
        id = (S.pick && S.pick.id) || pidOf(c);
      if (im) im.src = imgUrl('normal', id, S.face === 1);
      const fn = $('#face-note');
      if (fn) fn.innerHTML = faceNote(c);
      return;
    }
    case 'prac-new': {
      const d = cur();
      if (!d) return;
      S.pgSeed = S.pgSeed || {};
      S.pgSeed[d.id] = Math.max(1, (S.pgSeed[d.id] || 1) + (+v || 1));
      render();
      return;
    }
    case 'upview':
      S.upView = v;
      S.sheetSel = null;
      render();
      return;
    case 'sheet-go':
      S.sheetI = +v;
      S.sheetSel = null;
      render();
      return;
    case 'sheet-pick':
      S.sheetSel = v;
      render();
      return;
    case 'print-cheap': {
      const ch = cheapest();
      if (ch) handleAct('print', S.prints.list.indexOf(ch));
      return;
    }
    case 'print': {
      const x = S.prints && S.prints.list[+v];
      if (!x) return;
      S.pick = Object.assign({n: S.modalCard}, x);
      const im = $('#modal .card.real img');
      if (im) im.src = imgUrl('normal', x.id, S.face === 1);
      $('#prints').innerHTML = printsHtml();
      {
        const pi = $('#pr-info');
        if (pi) pi.innerHTML = pickHtml(find(S.modalCard));
        const pn = $('#pic-note');
        if (pn) pn.innerHTML = picNote(find(S.modalCard));
      }
      {
        const k = keyOf(S.modalCard),
          pr = {pid: x.id, ps: x.set, pp: x.p != null ? x.p : undefined};
        [d && wantOf(d), myWant()].forEach(W => {
          const w = W && W.find(y => keyOf(y.n) === k);
          if (w) Object.assign(w, pr);
        });
      }
      if (d) {
        const en = d.cards.find(e2 => e2.n === S.modalCard);
        if (en) {
          setPrint(en, x);
        }
        if (d.format === 'commander' && d.commander === S.modalCard) {
          d.cmdPid = x.id;
          d.cmdSet = x.sc;
          d.cmdCn = x.cn || '';
        }
        if (en || d.commander === S.modalCard) {
          touch();
          render();
          toast('Using the ' + x.set + ' printing.');
        }
      }
      return;
    }
    case 'open-deck':
      $('#modal').hidden = true;
      recentAdd(v);
      S.deckId = v;
      S.view = 'decks';
      S.open = true;
      S.pathShow = 0;
      S.tab = null;
      S.deckQ = '';
      changed = false;
      break;
    case 'tab':
      S.tab = v;
      S.upOrd = null;
      changed = false;
      break;
    case 'deck-back':
      S.open = false;
      S.confirmDel = null;
      changed = false;
      break;
    case 'draft-open':
      if (S.draft) {
        S.deckId = S.draft.id;
        S.open = true;
        S.tab = null;
      }
      changed = false;
      break;
    case 'draft-save':
      if (S.draft) {
        const nd = S.draft;
        S.profile.decks.unshift(nd);
        S.draft = null;
        S.deckId = nd.id;
        toast('Saved ' + nd.name + ' to your decks.');
      }
      break;
    case 'draft-discard':
      if (S.draft) {
        const nm = S.draft.name;
        S.draft = null;
        S.open = false;
        S.deckId = (S.profile.decks[0] || {}).id || null;
        lsSet('dc.draft', null);
        toast('Discarded ' + nm + '.');
      }
      changed = false;
      break;
    case 'new-deck':
      newDeck({format: v, name: v === 'commander' ? 'New Commander deck' : 'New Standard deck', src: 'scratch'});
      break;
    case 'del-deck':
      if (S.confirmDel !== v) {
        S.confirmDel = v;
        changed = false;
        break;
      }
      S.profile.decks = S.profile.decks.filter(x => x.id !== v);
      if (S.deckId === v) {
        S.deckId = (S.profile.decks[0] || {}).id || null;
        S.open = false;
      }
      S.confirmDel = null;
      break;
    case 'fmt':
      if (d.format !== v) {
        d.format = v;
        if (v === 'standard') {
          d.colors = (d.colors || []).slice(0, 3);
        } else if (find(d.commander)) d.colors = find(d.commander).ci.slice();
      }
      break;
    case 'tier':
      d.tier = v;
      break;
    case 'build-custom':
      d.custom = true;
      break;
    case 'mech-info':
      openMech(v);
      return;
    case 'mech-list':
      openMechList();
      return;
    case 'mech-add':
      if (!d || d.aimLocked || d.aims.includes(v) || d.aims.length >= 5) return;
      d.aimAuto = false;
      aimsChanged(d);
      d.aims.push(v);
      touch();
      render();
      ensureEdh();
      openMechList();
      toast(aimLabel(v, ctxOf(d).tribe) + ' added to your build at priority ' + d.aims.length + '.');
      return;
    case 'ua-plan': {
      const c = find(d.commander);
      d.uaMode = v;
      if (v === 'edh' && c && EDH.key === c.n && (EDH.tags || []).length) {
        aimsChanged(d);
        d.aims = EDH.tags.slice(0, 3).map(t => 'edh:' + t.slug);
        d.aimAuto = true;
        d.custom = true;
        loadThemes(c.n, d.aims).then(g => {
          if (g) render();
        });
      } else if (v === 'keep') {
        d.custom = false;
      } else if (v === 'custom') {
        d.custom = true;
      }
      touch();
      render();
      openUpgradeAsk();
      return;
    }
    case 'ua-tier':
      if (TIERS[v]) {
        d.tier = v;
        touch();
        render();
        openUpgradeAsk();
      }
      return;
    case 'ua-done':
      S.uaOpen = false;
      $('#modal').hidden = true;
      if (d && d.uaMode === 'custom') {
        S.tab = isNarrow() ? 'build' : S.tab;
        toast('Rank your mechanics in the Build panel; Upgrades follows them.');
      } else S.tab = 'up';
      changed = false;
      break;
    case 'lock-aim':
      d.aimLocked = !d.aimLocked;
      break;
    case 'aim-up': {
      d.aimAuto = false;
      aimsChanged(d);
      const i = +v;
      [d.aims[i - 1], d.aims[i]] = [d.aims[i], d.aims[i - 1]];
      break;
    }
    case 'aim-down': {
      d.aimAuto = false;
      aimsChanged(d);
      const i = +v;
      [d.aims[i + 1], d.aims[i]] = [d.aims[i], d.aims[i + 1]];
      break;
    }
    case 'aim-rm':
      d.aimAuto = false;
      aimsChanged(d);
      d.aims.splice(+v, 1);
      break;
    case 'type-rm':
      (d.types || []).splice(+v, 1);
      if (!d.types.length) d.typesMust = false;
      break;
    case 'key-rm':
      (d.keys || []).splice(+v, 1);
      if (!d.keys.length) d.keysMust = false;
      break;
    case 'types-must':
      d.typesMust = !d.typesMust;
      break;
    case 'keys-must':
      d.keysMust = !d.keysMust;
      break;
    case 'color': {
      const s = new Set(d.colors || []);
      if (s.has(v)) {
        if (s.size > 1 || d.format === 'standard') s.delete(v);
      } else {
        if (d.format === 'standard' && s.size >= 3) {
          toast('Standard decks here focus on up to three colors.');
          return;
        }
        s.add(v);
      }
      d.colors = 'WUBRG'.split('').filter(x => s.has(x));
      break;
    }
    case 'clear-cmd':
      if (d.commander) d.prevCmd = d.commander;
      d.commander = '';
      delete d.cmdPid;
      delete d.cmdSet;
      break;
    case 'set-cmd':
      if (d.commander && d.commander !== n) d.prevCmd = d.commander;
      delete d.cmdPid;
      delete d.cmdSet;
      setCommander(d, n);
      if (S.pick && S.pick.n === n && S.pick.sc) {
        d.cmdPid = S.pick.id;
        d.cmdSet = S.pick.sc;
      }
      $('#modal').hidden = true;
      toast(n + ' is now your commander.');
      break;
    case 'inc': {
      const en = entryOf(d, n);
      if (en && en.q >= copyLimit(d, find(n))) {
        toast(d.format === 'commander' ? 'Commander decks run one copy of each card.' : 'Four copies is the limit.');
        return;
      }
      addCard(d, n, 1);
      break;
    }
    case 'dec':
      cutCard(d, n, 1);
      break;
    case 'rm':
      cutCard(d, n, 999);
      if (!isBasic(n)) ruleOut(d, n);
      break;
    case 'dismiss':
      ruleOut(d, n);
      toast(n + ' excluded from this deck’s recommendations.');
      break;
    case 'undismiss': {
      const k = keyOf(n);
      d.dismissed = (d.dismissed || []).filter(x => keyOf(x) !== k);
      toast(n + ' allowed in this deck’s recommendations.');
      break;
    }
    case 'lock': {
      const e = d.cards.find(x => x.n === n);
      if (e) e.l = !e.l;
      break;
    }
    case 'pick-add': {
      if (offColor(d, find(n))) {
        document.querySelectorAll('.ddl').forEach(x => (x.hidden = true));
        openCard(n);
        return;
      }
      const en0 = entryOf(d, n);
      if (en0 && en0.q >= copyLimit(d, find(n))) {
        toast(n + ' is already in this deck' + (en0.n !== n ? ' as ' + en0.n : '') + '.');
        return;
      }
      document.querySelectorAll('.ddl').forEach(x => (x.hidden = true));
      openCard(n);
      return;
    }
    case 'want': {
      doSwap(d, {cut: v, add: n, q: 1}, 0);
      if (S.pick && S.pick.n === n && S.pick.set) {
        const en = d.cards.find(e2 => e2.n === n);
        if (en) {
          setPrint(en, S.pick);
        }
      }
      $('#modal').hidden = true;
      toast('Swapped ' + v + ' out for ' + n + '.');
      break;
    }
    case 'add-to-deck':
      {
        const en0 = entryOf(d, n);
        if (en0 && en0.q >= copyLimit(d, find(n))) {
          toast('That card is already in the deck at its copy limit.');
          return;
        }
      }
      {
        const sl = planSlotFor(d, n);
        if (sl) {
          planInstall(d, sl, sl.b && keyOf(sl.b) === keyOf(n) ? 'b' : sl.m && keyOf(sl.m) === keyOf(n) ? 'm' : 'a');
        } else addCard(d, n, 1);
      }
      if (S.pick && S.pick.n === n && S.pick.set) {
        const en = d.cards.find(e2 => e2.n === n);
        if (en) {
          setPrint(en, S.pick);
        }
      }
      $('#modal').hidden = true;
      toast('Added ' + n + ' to ' + d.name + '.');
      break;
    case 'swap': {
      const [i, t, al] = v.split('|'),
        L = recsFor(d).paths[+i],
        col = al && L ? rowCols(d, recsFor(d), L, +i)[t] : null,
        p = col ? col.p : L && L.opts[t];
      if (!p) return;
      if (gcBlocked(d, p)) {
        toast(gcBlockMsg(d));
        return;
      }
      const bad = validatePackage(d, [{cut: p.cut, add: p.add, q: p.q, t}]);
      if (bad.length) {
        toast('Not swapped: ' + bad[0].key.replace(/_/g, ' ') + (bad[0].card ? ' (' + bad[0].card + ')' : '') + '.');
        return;
      }
      const ap0 = rowCols(d, recsFor(d), L, +i).apex,
        top = !!ap0 && ap0.p.add === p.add;
      keepRecs(d, p);
      doSwap(d, p, top ? TIER_KEYS.length : Math.max(0, TIER_KEYS.indexOf(t) + 1));
      toast('Swapped ' + p.cut + ' for ' + p.add + '.');
      break;
    }
    case 'swap-cap': {
      const list = capList(d, v);
      // its own package, not a tier: holds on the cards it replaces end when those cards leave the deck
      const bad = validatePackage(
        d,
        list.map(p => ({cut: p.cut, add: p.add, q: p.q, t: 'cap'}))
      );
      if (bad.length) {
        toast(
          'Nothing applied: ' +
            bad.length +
            ' problem' +
            (bad.length === 1 ? '' : 's') +
            ' found (' +
            bad[0].key.replace(/_/g, ' ') +
            (bad[0].card ? ': ' + bad[0].card : '') +
            ').'
        );
        return;
      }
      list.forEach(p => doSwap(d, Object.assign({}, p, {t: v}), Math.max(0, TIER_KEYS.indexOf(v) + 1)));
      toast('Made ' + list.length + ' swap' + (list.length === 1 ? '' : 's') + ' using cards under $' + TIERS[v].cap + ' each.');
      break;
    }
    case 'swap-all': {
      const R = recsFor(d),
        list = R.paths
          .map(L => ({L, p: v === 'free' ? L.opts.free : tierPick(L, v)}))
          .filter(x => x.p && !x.p.pc && entryOf(d, x.p.cut) && !entryOf(d, x.p.add)); // Players' choice picks are made one at a time
      const bad = validatePackage(
        d,
        list.map(x => ({cut: x.p.cut, add: x.p.add, q: x.p.q, t: x.p.t}))
      );
      if (bad.length) {
        toast(
          'Nothing applied: ' +
            bad.length +
            ' problem' +
            (bad.length === 1 ? '' : 's') +
            ' found (' +
            bad[0].key.replace(/_/g, ' ') +
            (bad[0].card ? ': ' + bad[0].card : '') +
            ').'
        );
        return;
      }
      list.forEach(x =>
        doSwap(
          d,
          x.p,
          x.L.opts.apex && x.L.opts.apex.add === x.p.add ? TIER_KEYS.length : Math.max(0, TIER_KEYS.indexOf(x.p.t) + 1)
        )
      );
      toast(
        'Made ' + list.length + ' ' + (v === 'free' ? 'free' : TIERS[v].label) + ' swap' + (list.length === 1 ? '' : 's') + '.'
      );
      break;
    }
    case 'undo-card':
      if (!undoSwap(d, n)) return;
      break; // its own name (0.9.3): as 'undo' it was taken by the general Undo
    case 'lib-add': {
      document.querySelectorAll('.ddl').forEach(x => (x.hidden = true));
      const q0 = $('#lib-q');
      if (q0) q0.value = '';
      libAdd(n, 1);
      toast('Added ' + n + ' to your library.');
      break;
    }
    case 'lib-not-own': {
      const L = lib(),
        k = Object.keys(L).find(x => norm(x) === norm(n));
      if (k) delete L[k];
      S.libV = (S.libV || 0) + 1;
      if (d && d.plan)
        d.plan.forEach(x => {
          if (norm(x.a) === norm(n)) delete x.own;
        });
      if (d && d.format) addWant(d, n);
      toast(n + ' is no longer counted as owned and is on the ' + (d ? d.name + ' ' : '') + 'buy list.');
      break;
    }
    case 'lib-inc':
      libAdd(n, 1);
      break;
    case 'lib-add-card': {
      const c = find(n);
      if (!c) return;
      libAdd(c.n, 1);
      toast('Added ' + c.n + ' to your library.');
      const b = $('#libbox');
      if (b) b.outerHTML = libBox(c);
      touch();
      return;
    }
    case 'lib-dec':
      libAdd(n, -1);
      break;
    case 'lib-clear':
      if (S.confirmLib) {
        S.profile.library = {};
        S.libV = (S.libV || 0) + 1;
        S.confirmLib = false;
        toast('Library emptied.');
      } else {
        S.confirmLib = true;
        changed = false;
      }
      break;
    case 'lib-add-deck': {
      const val = ($('#lib-deck') || {}).value || '';
      let k = 0,
        nm = '';
      if (val.slice(0, 2) === 'd:') {
        const x = S.profile.decks.concat(S.draft ? [S.draft] : []).find(y => y.id === val.slice(2));
        if (x) {
          nm = x.name;
          k = libAddList(x.cards, x.format === 'commander' ? x.commander : '');
          if (x.format === 'commander' && x.partner) k += libAdd(x.partner, 1);
        }
      } else if (val.slice(0, 2) === 'p:' && PRECON_LISTS[val.slice(2)]) {
        nm = val.slice(2);
        const pc = PRECONS.find(y => y.name === nm);
        k = libAddList(
          PRECON_LISTS[nm].split(';').map(x => {
            const m = /^(\d+) (.+)$/.exec(x);
            return {n: m ? m[2] : x, q: m ? +m[1] : 1};
          }),
          (pc && (pc.cmd || pc.commander)) || ''
        );
      }
      if (!nm) return;
      toast('Added ' + k + ' cards from ' + nm + ' to your library.');
      break;
    }
    case 'lib-paste':
      openLibPaste();
      return;
    case 'lib-paste-go': {
      const txt = ($('#lib-text') || {}).value || '';
      const r = parseDeckText(txt),
        k = libAddList(r.cards, r.commander) + (r.partner ? libAdd(r.partner, 1) : 0);
      $('#modal').hidden = true;
      toast('Added ' + k + ' cards to your library.');
      break;
    }
    case 'lib-set-pick': {
      const i = $('#lib-set'),
        bx = $('#set-res');
      if (i) i.value = v;
      if (bx) bx.hidden = true;
      return;
    }
    case 'lib-add-set':
      libAddSet(($('#lib-set') || {}).value);
      return;
    case 'fix': {
      const p = recsFor(d).fixes[+v];
      if (!p) return;
      if (gcBlocked(d, p)) {
        toast(gcBlockMsg(d));
        return;
      }
      doSwap(d, p, 0);
      break;
    }
    case 'drop': {
      const c = recsFor(d).drops[+v];
      if (!c) return;
      cutCard(d, c.n, c.q);
      break;
    }
    case 'uptype':
      S.upType = {id: S.deckId, t: v || ''};
      S.pathShow = 0;
      S.planShow = 0;
      changed = false;
      break;
    case 'cap-show':
      S.capOpen = S.capOpen || {};
      S.capOpen[d.id + v] = true;
      changed = false;
      break;
    case 'upkind':
      S.upKind = {id: S.deckId, k: v || ''};
      S.pathShow = 0;
      changed = false;
      break;
    case 'stats-reset': {
      const e = evalFor(d);
      if (e && !e.quality.pending) {
        d.base = {score: e.total, q: e.quality.vsApex, at: new Date().toISOString().slice(0, 10)};
        toast('Changes are now counted from here.');
      }
      break;
    }
    case 'path-more':
      S.pathShow = (S.pathShow || 12) + 12;
      changed = false;
      break;
    case 'fill': {
      const k = fillDeck(d);
      const left = analyze(d);
      toast(
        k
          ? 'Filled ' +
              k +
              ' slots.' +
              (left.size < left.T.size ? ' The card library ran out of fits for the last ' + (left.T.size - left.size) + '.' : '')
          : 'No fitting cards left in the library for this aim and tier.'
      );
      break;
    }
    case 'backup-save':
      downloadBackup();
      return;
    case 'backup-link':
      linkBackup();
      return;
    case 'backup-resume':
      resumeBackup();
      return;
    case 'restore-cancel':
      S.pendingRestore = null;
      changed = false;
      break;
    case 'restore-replace':
    case 'restore-merge': {
      const R = S.pendingRestore;
      if (!R) return;
      const keep = act === 'restore-merge' ? S.profile.decks.filter(x => !x.example) : [],
        ids = new Set(keep.map(x => x.id));
      R.p.decks.forEach(x => {
        if (ids.has(x.id)) x.id = uid();
      });
      S.profile = Object.assign({name: 'Planeswalker'}, R.p, {decks: keep.concat(R.p.decks)});
      S.deckId = (S.profile.decks[0] || {}).id || null;
      S.pendingRestore = null;
      toast('Restored ' + R.p.decks.length + ' decks from your backup.');
      break;
    }
    case 'db-update':
      if (autoUpdate.busy) toast('An update is already running.');
      else autoUpdate(null, 'You pressed Update now');
      return;
    case 'export-open':
      openExport();
      return;
    case 'export-what':
      S.exp = v;
      openExport();
      return;
    case 'export-print':
      S.expPrint = v === '1';
      openExport();
      return;
    case 'export-copy':
      copyText(exportText(d, S.exp), 'Deck list copied.');
      return;
    case 'export-txt':
      saveText(exportName(d) + '.txt', exportText(d, S.exp));
      toast('Deck list saved.');
      return;
    case 'export-csv':
      saveText(exportName(d) + '.csv', exportCsv(d, S.exp));
      toast('Spreadsheet saved.');
      return;
    case 'export-share':
      navigator.share({title: d.name, text: exportText(d, S.exp)}).catch(() => {});
      return;
    case 'import-open':
      openImport();
      return;
    case 'mana-accept':
    case 'mana-skip': {
      const pd = S.pend;
      S.pend = null;
      if (!pd) return;
      $('#modal').hidden = true;
      S.manaOK = true;
      try {
        handleAct(pd.act, pd.v, pd.n);
      } finally {
        S.manaOK = false;
      }
      if (act === 'mana-accept') {
        const dk = cur(),
          plan = manaPlan(dk);
        if (plan.changes.length) {
          applyMana(dk, plan);
          touch();
          render();
          toast('Lands adjusted: ' + planText(plan) + '.');
        }
      }
      return;
    }
    case 'mana-apply': {
      const plan = manaPlan(d);
      if (!plan.changes.length) return;
      applyMana(d, plan);
      toast('Lands adjusted: ' + planText(plan) + '.');
      break;
    }
    case 'list-all':
      openList();
      return;
    case 'cmd-find':
      openFindCmd();
      return;
    case 'fc-color': {
      const s = new Set(S.fc.colors);
      if (s.has(v)) s.delete(v);
      else s.add(v);
      S.fc.colors = 'WUBRG'.split('').filter(x => s.has(x));
      openFindCmd();
      return;
    }
    case 'fc-pick': {
      const old = switchCommander(d, n);
      S.fc = null;
      $('#modal').hidden = true;
      toast(n + ' is now the commander.' + (old && old !== n ? ' ' + old + ' can now be suggested as an upgrade.' : ''));
      break;
    }
    case 'cmd-switch': {
      const old = switchCommander(d, n);
      touch();
      render();
      toast(n + ' is now the commander.' + (old && old !== n ? ' ' + old + ' can now be suggested as an upgrade.' : ''));
      openCard(v);
      return;
    }
    case 'buy-copy':
      copyText(buyText(d), 'Buy list copied.');
      return;
    case 'buy-save':
      saveText(
        d.name
          .replace(/[^\w -]+/g, '')
          .trim()
          .replace(/\s+/g, '-')
          .toLowerCase() + '-buy-list.txt',
        buyText(d)
      );
      toast('Buy list saved to your downloads.');
      return;
    case 'precon-open':
      openPrecons();
      return;
    case 'precon-live':
      $('#modal').hidden = true;
      loadPreconLive(v, n);
      return;
    case 'gen-open':
      openGenerate();
      return;
    case 'partner-open':
      openPartner();
      return;
    case 'partner-set': {
      const c = find(n),
        cmd = find(d.commander);
      if (!c || !cmd || !canPair(cmd, c)) return;
      d.partner = c.n;
      cutCard(d, c.n, 99);
      if (d.plan) d.plan = d.plan.filter(x => norm(x.a) !== c._n);
      d.colors = ctxOf(d).ident.slice();
      $('#modal').hidden = true;
      toast(c.n + ' is now your second commander.');
      break;
    }
    case 'partner-clear': {
      const old = d.partner;
      delete d.partner;
      d.colors = (d.colors || []).filter(k => ctxOf(d).ident.includes(k));
      toast(old + ' is no longer a commander. Cards outside the remaining colors are flagged on the Upgrades tab.');
      break;
    }
    case 'seed-open':
      S.seed = S.seed || {cards: [], paste: false};
      openSeed();
      return;
    case 'seed-add': {
      const c = find(n);
      if (c && !S.seed.cards.includes(c.n)) S.seed.cards.push(c.n);
      openSeed();
      const q = $('#seed-q');
      if (q) q.focus();
      return;
    }
    case 'seed-del':
      S.seed.cards = S.seed.cards.filter(x => x !== n);
      openSeed();
      return;
    case 'seed-paste':
      S.seed.paste = true;
      openSeed();
      return;
    case 'seed-paste-go': {
      const r = parseDeckText(($('#seed-text') || {}).value || '');
      let k = 0,
        miss = 0;
      (r.commander ? [{n: r.commander}] : []).concat(r.partner ? [{n: r.partner}] : [], r.cards).forEach(x => {
        const c = find(x.n);
        if (!c) {
          miss++;
          return;
        }
        if (!S.seed.cards.includes(c.n)) {
          S.seed.cards.push(c.n);
          k++;
        }
      });
      S.seed.paste = false;
      openSeed();
      toast('Added ' + k + ' card' + (k === 1 ? '' : 's') + (miss ? ' · ' + miss + ' not recognised' : '') + '.');
      return;
    }
    case 'seed-go': {
      $('#modal').hidden = true;
      const go = () => thinkThen('Thinking… building the strongest deck around your cards', () => seedBuild(n, v));
      loadEdh(n).then(go, go);
      return;
    }
    case 'precon': {
      $('#modal').hidden = true;
      const nd = loadPrecon(PRECONS[+v]),
        unk = nd.cards.filter(e => !find(e.n)).length;
      toast(
        'Loaded the official ' +
          nd.name +
          ' list.' +
          (unk ? ' ' + unk + ' cards need the full card database to show details.' : '')
      );
      break;
    }
    case 'analyze':
      openAnalysis();
      return;
    case 'alts':
      openAlts(v);
      return;
    case 'alt-use':
      if (!d || !useAlt(d, v, n)) return;
      $('#modal').hidden = true;
      break;
    case 'up-buy': {
      if (!d || !n) return;
      const c = find(n),
        name = c ? c.n : n;
      if (addWant(d, name)) toast(name + ' added to the ' + d.name + ' buy list.');
      if (!$('#modal').hidden && document.querySelector('#modal [aria-label="Best by job"]')) {
        touch();
        openJobs(S.jobTab);
        return;
      }
      if (!$('#modal').hidden && document.querySelector('#modal [aria-label="Lands helper"]')) {
        touch();
        openLands();
        return;
      }
      break;
    }
    case 'lack': {
      if (!fromScratch(d)) return;
      const c = find(n),
        name = c ? c.n : n;
      if (!lacks(d, name)) (d.lack = d.lack || []).push(name);
      if (addWant(d, name)) wantOf(d)[wantOf(d).length - 1].from = 'lack';
      toast(name + ' added to the ' + d.name + ' buy list.');
      break;
    }
    case 'an-apply': {
      const B = buildThemes(d);
      if (!B.suggest.length || d.aimLocked) return;
      aimsChanged(d);
      d.aims = B.suggest.slice();
      if (B.tribe) d.tribe = B.tribe;
      d.aimAuto = false;
      d.custom = true;
      touch();
      render();
      openAnalysis();
      toast('The build now follows your cards: ' + d.aims.map(k => aimLabel(k, d.tribe)).join(' › ') + '.');
      return;
    }
    case 'mywant-rm': {
      const W = myWant(),
        x = W[+v];
      if (!x) return;
      W.splice(+v, 1);
      toast('Removed ' + x.n + ' from your buy list.');
      break;
    }
    case 'buy-addall': {
      const d0 = cur();
      if (!d0) return;
      const L = addAllPlan(d0);
      L.forEach(x => {
        const w = wantOf(d0).find(y => keyOf(y.n) === keyOf(x.n));
        if (w) w.q = x.q;
        else wantOf(d0).push({n: x.n, q: x.q, at: Date.now()});
      });
      touch();
      render();
      toast(
        L.length
          ? 'Added ' + L.length + ' card' + (L.length === 1 ? '' : 's') + ' to the ' + d0.name + ' buy list.'
          : 'Every card is already on this deck’s buy list.'
      );
      return;
    }
    case 'want-installed': {
      const d0 = S.profile.decks.find(x => x.id === v);
      if (!d0) return;
      String(n)
        .split('|')
        .forEach(nm => {
          const k = keyOf(nm),
            w = wantOf(d0).find(y => keyOf(y.n) === k);
          if (!w) return;
          const inD = (d0.cards.find(e => keyOf(e.n) === k) || {}).q || 1;
          w.q -= inD;
          if (w.q <= 0) d0.want = wantOf(d0).filter(y => keyOf(y.n) !== k);
        });
      touch();
      render();
      toast('Taken off the ' + d0.name + ' buy list.');
      return;
    }
    case 'buy-sel': {
      const s = buySel();
      if (s.has(v)) s.delete(v);
      else s.add(v);
      render();
      return;
    }
    case 'buy-all':
      S.buySel = new Set(buyGroups().map(g => g.id));
      render();
      return;
    case 'buy-none':
      S.buySel = new Set();
      render();
      return;
    case 'buy-export': {
      const t = buyAllText();
      if (!t) {
        toast('Choose at least one list with cards.');
        return;
      }
      saveText('buy-list.txt', t + '\n');
      return;
    }
    case 'buy-copy-all': {
      const t = buyAllText(); // its own name (0.9.3): as 'buy-copy' it copied the open deck's list
      if (!t) {
        toast('Choose at least one list with cards.');
        return;
      }
      copyText(t, 'Buy list copied.');
      return;
    }
    case 'mywant-copy':
      copyText(['// My buy list'].concat(myWant().map(x => x.q + ' ' + x.n)).join('\n'), 'Buy list copied.');
      return;
    case 'want-add':
    case 'want-undo': {
      const c = find(n),
        sel = ($('#want-deck') || {}).value || MINE;
      if (c && sel === MINE) {
        const W = myWant();
        if (act === 'want-add') {
          const o = W.find(x => keyOf(x.n) === c._k);
          if (o) Object.assign(o, pickPrint(c));
          else W.push(Object.assign({n: c.n, q: 1, at: Date.now()}, pickPrint(c)));
          toast('Added ' + c.n + ' to your buy list.');
        } else {
          S.profile.want = W.filter(x => keyOf(x.n) !== c._k);
          toast('Removed ' + c.n + ' from your buy list.');
        }
        S.wantDeck = MINE;
        touch();
        const b = $('#wantbox');
        if (b) b.outerHTML = wantBox(c);
        return;
      }
      const dk = S.profile.decks.concat(S.draft ? [S.draft] : []).find(x => x.id === sel);
      if (!c || !dk) return;
      if (act === 'want-add') {
        if (wantFit(dk, c)) return;
        addWant(dk, c.n, pickPrint(c));
        toast('Added ' + c.n + ' to the ' + dk.name + ' buy list.');
      } else {
        dk.want = wantOf(dk).filter(x => keyOf(x.n) !== c._k);
        toast('Removed ' + c.n + ' from the ' + dk.name + ' buy list.');
      }
      S.wantDeck = dk.id;
      touch();
      const b = $('#wantbox');
      if (b) b.outerHTML = wantBox(c);
      return;
    }
    case 'want-rm': {
      const w = wantOf(d),
        x = w[+v];
      if (!x) return;
      w.splice(+v, 1);
      if (x.from === 'lack') d.lack = (d.lack || []).filter(y => keyOf(y) !== keyOf(x.n));
      toast('Removed ' + x.n + ' from the buy list.');
      break;
    }
    case 'buy-got': {
      if (!d || !n) return;
      const k = keyOf(n),
        had = (d.bought || []).some(x => keyOf(x) === k);
      d.bought = (d.bought || []).filter(x => keyOf(x) !== k).concat(had ? [] : [n]);
      toast(
        had ? n + ' is no longer marked bought.' : n + ' is marked bought. It stays on this list until it goes into the deck.'
      );
      break;
    }
    case 'engine-mode':
      if (v === engineMode()) return;
      lsSet('dc.engine', v);
      toast(v === 'old' ? 'Switching to the Classic engine…' : 'Switching to the Current engine…');
      setTimeout(() => location.reload(), 400); // every card's reading is cached for the session: a fresh start uses the new engine
      return;
    case 'stick':
      if (!d) return;
      d.stick = !d.stick;
      toast(d.stick ? 'Upgrades now stick to the theme. Working them out again…' : 'Upgrades pick the strongest cards again.');
      break;
    case 'buy-refresh':
      if (!d) return;
      delete d.buySnap;
      toast('Buy list suggestions worked out again from the current upgrades.');
      break;
    case 'gset-rm':
      S.gen.sets.splice(+v, 1);
      if (!S.gen.sets.length) S.gen.setsMust = false;
      openGenerate();
      return;
    case 'gset-must':
      S.gen.setsMust = !S.gen.setsMust;
      openGenerate();
      return;
    case 'dset-rm':
      (d.sets || []).splice(+v, 1);
      if (!d.sets.length) d.setsMust = false;
      aimsChanged(d);
      break;
    case 'dset-must':
      d.setsMust = !d.setsMust;
      aimsChanged(d);
      break;
    case 'gen-partner':
      S.gen.partner = n || '';
      openGenerate();
      return;
    case 'build-gen': {
      if (S.draft) {
        const dr = S.draft;
        S.profile.decks.unshift(dr);
        S.draft = null;
        toast('Saved ' + dr.name + ' to your decks first.');
      }
      thinkThen('Thinking… building the strongest deck', async () => {
        if (await regenBuild(d)) {
          touch();
          render();
        }
      });
      return;
    }
    case 'gen-pick':
      genConfirm(n);
      loadEdh(n).then(() => {
        if (!$('#modal').hidden && $('.gconfirm') && find(n)) genConfirm(n);
      });
      return;
    case 'gen-pick-back':
      openGenerate();
      return;
    case 'gen-pick-ok':
      S.gen.cmd = n;
      S.gen.partner = '';
      openGenerate();
      loadEdh(n).then(() => {
        if (!$('#modal').hidden && $('#gen-q') && S.gen.cmd === n) openGenerate();
      });
      return;
    case 'gen-tpick':
      S.gen.tk = S.gen.tk === v ? '' : v;
      S.gen.tmore = false;
      openGenerate();
      {
        const el = $('#themebuild');
        if (el) el.scrollIntoView({block: 'nearest'});
      }
      return;
    case 'gen-tmore':
      S.gen.tmore = !S.gen.tmore;
      openGenerate();
      {
        const el = $('#themebuild');
        if (el) el.scrollIntoView({block: 'nearest'});
      }
      return;
    case 'gen-tcol': {
      const a = (S.gen.tcol = S.gen.tcol || []),
        i = a.indexOf(v);
      if (i >= 0) a.splice(i, 1);
      else a.push(v);
      openGenerate();
      {
        const el = $('#themebuild');
        if (el) el.scrollIntoView({block: 'nearest'});
      }
      return;
    }
    case 'gen-tbuild': {
      const c = find(n);
      if (!c) return;
      $('#modal').hidden = true;
      const g = S.gen,
        k = g.tk,
        tribe = k === 'tribal' ? g.ttribe || '' : '';
      // the theme leads; the commander's own EDHREC theme pages that match it (and then its most-built ones) follow, so the deck is
      // built on what players run for that theme with this commander
      (async () => {
        setStatus('Thinking… reading how players build ' + c.n.split(',')[0] + ' for this theme');
        let aims = [k];
        try {
          await loadEdh(c.n);
          if (EDH.key === c.n && EDH.state === 'ok') {
            const re = k === 'tribal' ? new RegExp(tribe.toLowerCase().slice(0, 4)) : THEME_EDH[k],
              T0 = (EDH.tags || []).slice(0, 12),
              hit = T0.filter(t => re && re.test(t.slug)).slice(0, 1),
              rest = T0.filter(t => !hit.includes(t)).slice(0, 2 - hit.length);
            const ed = hit.concat(rest).map(t => 'edh:' + t.slug);
            if (ed.length) await loadThemes(c.n, ed);
            aims = aims.concat(ed.filter(a => (EDH.tmap || {})[a.slice(4)])).slice(0, 3);
          }
        } catch (e) {}
        await thinkThen('Thinking… building the strongest deck for ' + c.n.split(',')[0], () =>
          startPlan(c.n, [], null, null, {
            fill: g.tier || 'apex',
            mechChosen: true,
            aims,
            tribe,
            player: g.player || '',
            budget: genBudget(false)
          })
        );
        touch();
        render();
      })();
      return;
    }
    case 'gen-cmdown':
      S.gen.cmdOwned = !S.gen.cmdOwned;
      openGenerate();
      return;
    case 'gen-tier':
      S.gen.tier = TIERS[v] ? v : 'apex';
      S.gen.warn = '';
      openGenerate();
      return;
    case 'gen-best': {
      const g = S.gen;
      g.warn = '';
      if (!g.best && (g.theme || g.mech.length)) {
        g.warn =
          'Best overall builds from any set around what top players build this commander around, so it can’t also put ' +
          [g.theme ? 'the theme' : '', g.mech.length ? 'your mechanics' : ''].filter(Boolean).join(' or ') +
          ' first. ' +
          [g.theme ? 'Theme first' : '', g.mech.length ? 'Focus on mechanics' : ''].filter(Boolean).join(' and ') +
          (g.theme && g.mech.length ? ' were' : ' was') +
          ' switched off.';
        g.theme = false;
        g.mech = [];
        g.mechOpen = false;
      }
      g.best = !g.best;
      openGenerate();
      return;
    }
    case 'gen-theme': {
      const g = S.gen;
      g.warn = '';
      if (!g.theme && g.best) {
        g.best = false;
        g.warn =
          'Theme first puts the commander’s own set and creature types ahead of the strongest cards from any set, so Best overall was switched off. Theme first and mechanics can be used together.';
      }
      g.theme = !g.theme;
      openGenerate();
      return;
    }
    case 'gen-mechon': {
      const g = S.gen;
      g.warn = '';
      if (g.mech.length || g.mechOpen) {
        g.mech = [];
        g.mechOpen = false;
      } else {
        g.mechOpen = true;
        if (g.best) {
          g.best = false;
          g.warn =
            'Focusing on mechanics builds around the ones you pick instead of what top players build this commander around, so Best overall was switched off.';
        }
      }
      openGenerate();
      return;
    }
    case 'gen-mech': {
      const g = S.gen,
        i = g.mech.indexOf(v);
      g.warn = '';
      if (i >= 0) g.mech.splice(i, 1);
      else if (g.mech.length >= 3) g.warn = 'Up to three mechanics. Tap one you picked to remove it first.';
      else g.mech.push(v);
      if (g.best && g.mech.length) {
        g.best = false;
        g.warn = 'Focusing on mechanics builds around the ones you pick, so Best overall was switched off.';
      }
      openGenerate();
      return;
    }
    case 'gen-go': {
      const c = find(S.gen.cmd);
      if (!c) return;
      genBuilding(c); // the window stays up while the deck is built (owner, 24 Oct: it went back to the landing page)
      const g = S.gen,
        p = find(g.partner),
        sets = (g.sets || []).slice(),
        must = !!g.setsMust;
      (async () => {
        if (sets.length) {
          setStatus('Reading the chosen sets from Scryfall…');
          const ok = await loadSetCards(sets);
          if (!ok) toast('Some set lists could not be read from Scryfall; those sets match only by each card’s shown printing.');
        }
        setStatus('Reading how players build ' + c.n.split(',')[0] + '…');
        let aims = [];
        if (g.mech.length) {
          await loadEdh(c.n);
          const ed = g.mech.filter(isEdhAim);
          if (ed.length) await loadThemes(c.n, ed);
          aims = g.mech.filter(a => !isEdhAim(a) || (EDH.tmap || {})[a.slice(4)]);
        } else aims = await edhAimsFor(c);
        await thinkThen('Thinking… building the strongest deck for ' + c.n.split(',')[0], () =>
          startPlan(
            c.n,
            [],
            null,
            p && canPair(c, p) ? p.n : null,
            Object.assign(
              {
                fill: g.tier || 'apex',
                themeFirst: !!g.theme && !g.best,
                mechChosen: !!g.mech.length,
                player: g.player || '',
                budget: genBudget(!!g.cmdOwned)
              },
              sets.length ? {sets, setsMust: must} : {},
              aims.length ? {aims} : {}
            )
          )
        );
        if ($('#genbuild')) $('#modal').hidden = true;
        touch();
        render();
      })();
      return;
    }
    case 'h-fix': {
      const H0 = Object.keys(FIX_OF);
      if (v === '*') {
        const st = $('.hfix');
        const ks = st ? [...st.querySelectorAll('[data-act="h-fix"]')].map(b => b.dataset.v).filter(x => x !== '*') : H0;
        openFixSoon(ks);
      } else openFixSoon([v]);
      return;
    }
    case 'h-ignore':
      if (!d) return;
      d.ignoreH = (d.ignoreH || []).filter(x => x !== v).concat(v);
      toast('The ' + v + ' alert is ignored for this deck. You can stop ignoring it under Health.');
      if (!$('#modal').hidden && S.fixKeys) {
        const ks = S.fixKeys.filter(x => x !== v);
        if (ks.length) openFix(ks);
        else $('#modal').hidden = true;
      }
      break;
    case 'h-unignore':
      if (!d) return;
      d.ignoreH = (d.ignoreH || []).filter(x => x !== v);
      toast('The ' + v + ' alert is back on.');
      break;
    case 'fix-swap': {
      const [k, i] = String(v).split('|'),
        g = (S.fixG || []).find(x => x.k === k),
        p = g && g.L[+i];
      if (!d || !p) return;
      if (fixApply(d, [p])) toast('Swapped ' + p.cut + ' for ' + p.add + '.');
      touch();
      render();
      openFix(S.fixKeys);
      return;
    }
    case 'fix-top': {
      const g = (S.fixG || []).find(x => x.k === v);
      if (!d || !g) return;
      const A = analyze(d),
        tg = {
          Lands: [A.lands, A.T.lands],
          Ramp: [A.roles.ramp, A.T.ramp],
          Draw: [A.roles.draw, A.T.draw],
          Removal: [A.roles.removal, A.T.removal],
          Wipes: [A.roles.wipe, A.T.wipe]
        }[v],
        n = tg ? Math.max(1, Math.abs(tg[1] - tg[0])) : 1;
      const k = fixApply(d, g.L.filter(p => p.dScore == null || p.dScore >= 0).slice(0, n));
      toast('Made ' + k + ' swap' + (k === 1 ? '' : 's') + ' for ' + v + '.');
      touch();
      render();
      openFix(S.fixKeys);
      return;
    }
    // Highest score: the player's own choice over the slot's picks (checked as its own kind, not a tier, so a held pick doesn't block it)
    case 'no-have':
      openNoHave(n);
      return;
    case 'nh-swap': {
      const e0 = entryOf(d, v);
      if (!e0 || !n || hasCard(d, n)) return;
      const p = {cut: e0.n, add: n, q: e0.q};
      const bad = validatePackage(d, [{cut: p.cut, add: p.add, q: p.q, t: 'own'}]);
      if (bad.length) {
        toast('Not swapped: ' + bad[0].key.replace(/_/g, ' ') + '.');
        return;
      }
      doSwap(d, p, 0);
      S.noHave = null;
      $('#modal').hidden = true;
      toast('Swapped ' + p.cut + ' for ' + p.add + '. ' + p.cut + ' won’t be suggested again.');
      break;
    }
    case 'swap-top': {
      const R = recsFor(d),
        L = R.paths[+v],
        ref = L && (L.opts.apex || L.opts.mid || L.opts.budget);
      if (!ref || !n || !L.top || L.top.n !== n || hasCard(d, n)) return;
      const p = {cut: L.cut, add: n, q: ref.q};
      const bad = validatePackage(d, [{cut: p.cut, add: p.add, q: p.q, t: 'top'}]);
      if (bad.length) {
        toast('Not swapped: ' + bad[0].key.replace(/_/g, ' ') + '.');
        return;
      }
      keepRecs(d, p);
      doSwap(d, p, TIER_KEYS.length);
      toast('Swapped ' + p.cut + ' for ' + p.add + '.');
      break;
    }
    case 'dycb-open':
      openDycb();
      return;
    case 'dycb-gen': {
      S.gen = Object.assign({tier: 'apex', best: true, theme: false, mech: [], warn: ''}, S.gen || {}, {
        cmd: n,
        partner: '',
        own: true
      });
      openGenerate();
      loadEdh(n).then(() => {
        if (!$('#modal').hidden && $('#gen-q') && S.gen.cmd === n) openGenerate();
      });
      return;
    }
    case 'lands-open':
      openLands();
      return;
    case 'jobs-open':
      openJobs();
      return;
    case 'jobs-tab':
      openJobs(v);
      return;
    case 'share-open':
      openShare();
      return;
    case 'share-copy':
      copyText(S.shareUrl || '', 'Share link copied.');
      return;
    case 'share-send':
      navigator.share({title: (cur() || {}).name || 'Deck', url: S.shareUrl}).catch(() => {});
      return;
    case 'share-save': {
      const nd = saveShared();
      $('#modal').hidden = true;
      if (nd) {
        render();
        toast('Saved ' + nd.name + ' to your decks.');
      }
      return;
    }
    case 'dtag-add': {
      const inp = $('#deck-tag');
      if (!d || !inp) return;
      if (addTag(d, inp.value)) {
        touch();
        render();
      } else if (inp.value.trim()) toast('That tag is already on this deck, or it has 8.');
      return;
    }
    case 'dtag-rm': {
      if (!d || !n) return;
      d.dtags = (d.dtags || []).filter(t => t !== n);
      if (!d.dtags.length) delete d.dtags;
      break;
    }
    case 'folder-rename': {
      const v = (($('#folder-new') || {}).value || '').trim().slice(0, 40);
      if (!n || !v || v === n) return;
      S.profile.decks.forEach(x => {
        if ((x.folder || '').trim() === n) x.folder = v;
      });
      S.deckFolder = v;
      touch();
      render();
      toast('Folder renamed to ' + v + '.');
      return;
    }
    case 'folder-del': {
      if (!n) return;
      S.profile.decks.forEach(x => {
        if ((x.folder || '').trim() === n) delete x.folder;
      });
      S.deckFolder = '*';
      touch();
      render();
      toast('Folder deleted. Its decks are kept, with no folder.');
      return;
    }
    case 'swap-a3': {
      const [i, t] = v.split('|'),
        R = recsFor(d),
        L = R.paths[+i],
        col = L && rowCols(d, R, L, +i)[t];
      if (!col || !col.p || !n) return;
      const p = {cut: col.p.cut, add: n, q: col.p.q};
      const bad = validatePackage(d, [{cut: p.cut, add: p.add, q: p.q, t}]);
      if (bad.length) {
        toast('Not swapped: ' + bad[0].key.replace(/_/g, ' ') + '.');
        return;
      }
      keepRecs(d, p);
      doSwap(d, p, TIER_KEYS.indexOf(t) + 1);
      toast('Swapped ' + p.cut + ' for ' + p.add + '.');
      break;
    }
    case 'unpop': {
      const [i, t] = v.split('|'),
        L = recsFor(d).paths[+i],
        a = L && ((L.alts || {})[t] || []).find(x => x.n === n);
      if (!a) return;
      const cmdN = (find(d.commander) || {n: ''}).n.split(',')[0];
      $('#modal').innerHTML =
        '<div class="panel" role="dialog" aria-label="Unpopular pick"><div class="ph"><h2>Unpopular pick: ' +
        esc(a.n) +
        '</h2><button class="ico" data-act="close" aria-label="Close">×</button></div>' +
        '<p class="note" style="margin:0">The app’s deck score says this card helps this deck <b>more</b> than the suggested card: it raises the score by ' +
        a.dScore.toFixed(1) +
        ', against ' +
        (a.vsScore != null ? a.vsScore.toFixed(1) : '?') +
        ' for ' +
        esc(a.vs) +
        '.</p>' +
        '<p class="note" style="margin:0">But few players use it here: ' +
        (a.decks
          ? 'only ' + Math.round(a.inc * 100) + '% of ' + a.decks.toLocaleString() + ' ' + esc(cmdN) + ' decks play it.'
          : 'there is little play data for it with ' + esc(cmdN) + '.') +
        '</p>' +
        '<p class="note" style="margin:0">The suggested card is what players who build ' +
        esc(cmdN) +
        ' actually choose' +
        (a.vsInc ? ' (' + Math.round(a.vsInc * 100) + '% of decks play ' + esc(a.vs) + ')' : '') +
        ', so it leads. The deck score is the app’s own measure (synergy, balance, card quality, ways to win and practice games); it can spot a strong card players overlook, and it can also overrate one. Try it if its reasons fit how you play.</p>' +
        '<div class="row"><button class="btn" data-act="card" data-n="' +
        esc(a.n) +
        '">View card</button><button class="btn pri" data-act="close">Close</button></div></div>';
      $('#modal').hidden = false;
      return;
    }
    case 'consider-add': {
      const c = find(n);
      if (!d || !c) return;
      if (!considerOf(d).some(x => keyOf(x.n) === c._k)) considerOf(d).push({n: c.n, at: Date.now()});
      toast(c.n + ' is on ' + d.name + '’s Considering list. It is not in the deck.');
      const b = $('#considerbox');
      if (b) b.outerHTML = considerBox(c);
      break;
    }
    case 'consider-rm': {
      if (!d) return;
      d.consider = considerOf(d).filter(x => keyOf(x.n) !== keyOf(n));
      toast(n + ' is off the Considering list.');
      const c = find(n),
        b = $('#considerbox');
      if (b && c) b.outerHTML = considerBox(c);
      break;
    }
    case 'consider-in': {
      if (!d) return;
      const c = find(n);
      if (!c) return;
      if (wantFit(d, c)) {
        toast(c.n + ' can’t go in this deck: ' + wantFit(d, c) + '.');
        return;
      }
      d.consider = considerOf(d).filter(x => keyOf(x.n) !== c._k);
      addCard(d, c.n, 1);
      toast('Added ' + c.n + ' to ' + d.name + ' from Considering.');
      break;
    }
    case 'cmp-open':
      openCompare();
      return;
    case 'hist-open':
      openHistory();
      return;
    case 'ver-restore': {
      const vv = d && (d.versions || [])[+v];
      if (!vv) return;
      d.cards = JSON.parse(JSON.stringify(vv.cards));
      recsFor.k = null;
      $('#modal').hidden = true;
      toast('Restored the version from ' + new Date(vv.at).toLocaleString() + '.');
      break;
    }
    case 'player-add': {
      const i = $('#player-add'),
        nm = ((i && i.value) || '').trim().slice(0, 30);
      if (!nm) {
        toast('Type a name first.');
        return;
      }
      const P = players();
      if (P.length >= MAX_PLAYERS) {
        toast('Up to ' + MAX_PLAYERS + ' players.');
        return;
      }
      if (P.some(x => x.toLowerCase() === nm.toLowerCase()) || nm.toLowerCase() === (S.profile.name || '').toLowerCase()) {
        toast(nm + ' is already on your profile.');
        return;
      }
      P.push(nm);
      toast('Added ' + nm + '. Pick them as the player when you create or generate a deck.');
      break;
    }
    case 'player-rm': {
      const P = players(),
        i = +v;
      if (P[i] == null) return;
      const nm = P.splice(i, 1)[0];
      toast('Removed ' + nm + '. Their decks stay, marked with their name.');
      break;
    }
    case 'listsort':
      S.listSort = LIST_SORT[v] ? v : 'name';
      changed = false;
      break;
    case 'listgroup':
      S.listGroup = v === 'color' ? 'color' : 'type';
      try {
        localStorage.setItem('dc.listGroup', S.listGroup);
      } catch (e) {}
      changed = false;
      break;
    case 'listrole':
      S.listRole = LIST_ROLE[v] != null ? v : '';
      changed = false;
      break;
    case 'upsort':
      S.upSort = SORT_LAB[v] ? v : 'impact';
      changed = false;
      break;
    case 'theme-first':
      if (!d) return;
      d.themeFirst = !d.themeFirst;
      toast(
        d.themeFirst
          ? 'Theme first is on: on-theme cards are preferred in this deck’s upgrades and builds.'
          : 'Theme first is off: upgrades come from any set.'
      );
      break;
    case 'gen-own':
      S.gen.own = !S.gen.own;
      if (v === 'seed') openSeed();
      else openGenerate();
      return;
    case 'plan-more':
      S.planShow = (S.planShow || 16) + 24;
      changed = false;
      break;
    case 'plan-basics': {
      let k = 0;
      (d.plan || []).slice().forEach(x => {
        if (x.basic && planInstall(d, x, 'a')) k += x.q;
      });
      toast('Added ' + k + ' basic land' + (k === 1 ? '' : 's') + '.' + (d.plan ? '' : ' The deck is complete.'));
      break;
    }
    case 'fix-basics': {
      const F = recsFor(d).fixes.filter(p => isBasic(p.add));
      let k = 0;
      F.forEach(p => {
        doSwap(d, p, 0);
        k += p.q;
      });
      toast('Made ' + k + ' basic land change' + (k === 1 ? '' : 's') + '.');
      break;
    }
    case 'plan-add': {
      const [id, key] = String(v).split('|'),
        x = (d.plan || []).find(y => y.id === +id);
      if (!x || !planInstall(d, x, key)) return;
      if (!d.plan) toast('Every card is in. The deck is complete.');
      break;
    }
    case 'plan-all': {
      const k = planAll(d, v);
      toast('Added ' + k + ' slot' + (k === 1 ? '' : 's') + ' to the deck.' + (d.plan ? '' : ' The deck is complete.'));
      break;
    }
    case 'std-starter': {
      $('#modal').hidden = true;
      const p = STD_STARTERS[+v],
        nd = newDeck({
          name: p.name,
          format: 'standard',
          aims: p.aims.slice(),
          tribe: p.tribe || '',
          colors: p.colors.slice(),
          src: 'generated'
        });
      fillDeck(nd);
      toast('Standard deck generated.');
      break;
    }
    case 'import-go': {
      const txt = $('#imp-text').value;
      if (!txt.trim()) {
        toast('Paste a list or choose a text file first.');
        return;
      }
      const r = parseDeckText(txt),
        fmt = $('#imp-fmt').value,
        total = r.cards.reduce((s, e) => s + e.q, 0);
      if (!total && !r.commander) {
        toast('No cards found in that text.');
        return;
      }
      const pre = openImport.preset && openImport.preset.precon;
      let t = d;
      if (v === 'merge' && d) r.cards.forEach(e => addCard(d, e.n, e.q));
      else
        t = newDeck({
          name: $('#imp-name').value.trim() || r.name || 'Imported deck',
          format: fmt,
          cards: r.cards,
          aims: pre ? pre.aims.slice() : [],
          tribe: (pre && pre.tribe) || '',
          src: 'import',
          player: ($('#imp-player') || {}).value || ''
        });
      const cmdName = r.commander || (pre && pre.cmd);
      const hadCmd = v === 'merge' && t.commander;
      if (fmt === 'commander' && cmdName && !hadCmd) setCommander(t, cmdName);
      if (r.partner) {
        if (fmt === 'commander' && !hadCmd && r.commander) setPartner(t, r.partner);
        else addCard(t, r.partner, 1);
      }
      if (fmt === 'standard' && !t.colors.length) {
        const s = new Set();
        t.cards.forEach(e => {
          const c = find(e.n);
          if (c) c.ci.forEach(x => s.add(x));
        });
        t.colors = 'WUBRG'
          .split('')
          .filter(x => s.has(x))
          .slice(0, 3);
      }
      const unk = t.cards.filter(e => !find(e.n)).length;
      $('#modal').hidden = true;
      resolvePrints(t);
      toast(
        'Imported ' +
          total +
          ' cards' +
          (r.side ? ', skipped ' + r.side + ' sideboard' : '') +
          (unk ? '. ' + unk + ' not recognized' : '') +
          '.'
      );
      if (v !== 'merge' && fmt === 'commander' && t.commander && !S.noAsk) {
        render();
        openUpgradeAsk();
        return;
      }
      break;
    }
    default:
      return;
  }
  if (changed) touch();
  render();
  if (S.uaOpen && !$('#modal').hidden && /^dset/.test(act)) openUpgradeAsk();
  if (!$('#modal').hidden && S.modalCard && /^(inc|dec|lock|rm)$/.test(act)) {
    const box = $('#ctl'),
      still = cur() && cur().cards.some(e => e.n === S.modalCard);
    if (!still) $('#modal').hidden = true;
    else if (box) box.innerHTML = ctlHtml(S.modalCard);
  }
}
let st = 0;
document.addEventListener('input', ev => {
  const t = ev.target,
    d = cur();
  if (t.id === 'deck-q') {
    S.deckQ = t.value;
    const el = $('#rows'),
      dk = cur();
    if (el && dk) el.innerHTML = listRows(dk, S.deckQ);
    return;
  }
  if (t.id === 's-q') {
    S.search.q = t.value;
    clearTimeout(viewSearch.t);
    viewSearch.t = setTimeout(buildUpgradeIndex, 1500);
    clearTimeout(st);
    st = setTimeout(() => {
      const el = $('#s-res');
      if (el) el.innerHTML = searchResults();
    }, 160);
  } else if (t.id === 'add-q' && d) {
    const A = ctxOf(d);
    dropdown(t, $('#add-res'), {fmt: d.format, within: d.format === 'standard' && A.ident.length ? A.ident : null}, 'pick-add');
  } else if (t.id === 'lib-q') dropdown(t, $('#lib-res'), {}, 'lib-add');
  else if (t.id === 'lib-set') setDrop(t, $('#set-res'));
  else if (t.id === 'lib-f') {
    S.libF = t.value;
    const el = $('#librows');
    if (el) el.innerHTML = libRows(S.libF);
  } else if (t.id === 'pre-q') {
    const el = $('#pre-list');
    if (el) el.innerHTML = preRows(t.value);
  } else if (t.id === 'seed-q') dropdown(t, $('#seed-res'), {fmt: 'commander'}, 'seed-add');
  else if (t.id === 'gen-q') dropdown(t, $('#gen-res'), {fmt: 'commander', legend: true}, 'gen-pick');
  else if (t.id === 'cmd-q') dropdown(t, $('#cmd-res'), {fmt: 'commander', legend: true}, 'set-cmd');
});
document.addEventListener('change', ev => {
  UNDO.seq++;
  UNDO.label = 'change ' + ((ev.target.getAttribute && (ev.target.getAttribute('aria-label') || ev.target.id)) || 'setting');
  const t = ev.target,
    d = cur();
  if (t.tagName === 'SELECT' && t.dataset && t.dataset.act) {
    handleAct(t.dataset.act, t.value);
    return;
  } // drop-downs that act like buttons (upgrade filters)
  if (t.id === 'deck-name' && d) {
    d.name = t.value.trim() || 'Untitled deck';
    d.example = false;
    touch();
  } else if (t.id === 'deck-player' && d) {
    d.player = t.value || '';
    if (!d.player) delete d.player;
    touch();
    render();
  } else if (t.id === 'gen-player') {
    S.gen.player = t.value || '';
  } else if (t.id === 'gen-budget' || t.id === 'gen-tbudget') {
    S.gen.budget = Math.max(0, +t.value || 0);
  } else if (t.id === 'gen-ttribe') {
    S.gen.ttribe = t.value || '';
    openGenerate();
    const el = $('#themebuild');
    if (el) el.scrollIntoView({block: 'nearest'});
  } else if (t.id === 'imp-player') {
    S.impPlayer = t.value || '';
  } else if (t.id === 'deck-filter-player') {
    S.deckPlayer = t.value;
    render();
  } else if (t.id === 'deck-filter-folder') {
    S.deckFolder = t.value;
    render();
  } else if (t.id === 'deck-filter-tag') {
    S.deckTag = t.value;
    render();
  } else if (t.id === 'deck-folder' && d) {
    const v = t.value.trim().slice(0, 40);
    if (v) d.folder = v;
    else delete d.folder;
    touch();
    render();
  } else if (t.id === 'p-name') {
    S.profile.name = t.value.trim() || 'Planeswalker';
    touch();
  } else if (t.id === 'aim-add' && t.value && d) {
    d.aimAuto = false;
    aimsChanged(d);
    d.aims.push(t.value);
    touch();
    render();
    ensureEdh();
  } else if (t.id === 'tribe' && d) {
    d.tribe = t.value;
    touch();
    render();
  } else if (t.id === 'type-add' && d) {
    const v = t.value.trim().toLowerCase(),
      m = creatureTypes().find(x => x.toLowerCase() === v);
    if (m) {
      d.types = (d.types || []).filter(x => x !== m).concat(m);
      touch();
      render();
    } else if (v) toast('That is not a creature type in the card data.');
  } else if (t.id === 'cmp-with') {
    openCompare(t.value);
  } else if (t.id === 'want-deck') {
    S.wantDeck = t.value;
    const c = find(S.modalCard),
      b = $('#wantbox');
    if (c && b) b.outerHTML = wantBox(c);
  } else if ((t.id === 'gset-add' || t.id === 'dset-add') && t.value) {
    const st = resolveSet(t.value);
    if (!st) {
      toast('No set matches “' + t.value + '”.');
      return;
    }
    if (t.id === 'gset-add') {
      S.gen.sets = (S.gen.sets || []).filter(x => x !== st.code).concat(st.code);
      openGenerate();
      loadSetCards([st.code]);
    } else if (d) {
      SETFAIL.delete(st.code);
      d.sets = (d.sets || []).filter(x => x !== st.code).concat(st.code);
      aimsChanged(d);
      touch();
      render();
      ensureSetCards(d);
      if (S.uaOpen && !$('#modal').hidden) openUpgradeAsk();
    }
  } else if (t.id === 'key-add' && t.value && d) {
    d.keys = (d.keys || []).concat(t.value);
    touch();
    render();
  } else if (t.id === 'swaps') {
    S.swaps = +t.value;
    render();
  } else if (/^s-(fmt|color|type|max|theme|prints|sort|what)$/.test(t.id)) {
    S.search[t.id.slice(2)] = t.value;
    $('#s-res').innerHTML = searchResults();
  } else if (t.id === 'imp-file' && t.files[0]) {
    t.files[0]
      .text()
      .then(x => {
        $('#imp-text').value = x;
        if (!$('#imp-name').value) $('#imp-name').value = t.files[0].name.replace(/\.[^.]+$/, '');
      })
      .catch(() => toast('That file could not be read as text.'));
  } else if (t.id === 'db-file' && t.files[0]) loadBulk(t.files[0]);
  else if (t.id === 'restore-file' && t.files[0])
    t.files[0]
      .text()
      .then(readBackup)
      .catch(() => toast('That file could not be read.'));
});
document.addEventListener(
  'toggle',
  ev => {
    if (ev.target && ev.target.id === 'libstats') S.libStatsOpen = ev.target.open;
    if (ev.target && ev.target.id === 'score-more') S.scoreOpen = ev.target.open;
    if (ev.target && ev.target.id === 'plan-more') S.planOpen = ev.target.open;
    if (ev.target && ev.target.id === 'stats-more') S.statsOpen = ev.target.open;
    if (ev.target && ev.target.id === 'dmeta') S.dmetaOpen = ev.target.open;
    if (ev.target && ev.target.id && ev.target.id.startsWith('bs-'))
      (S.bsec || (S.bsec = {}))[ev.target.id.slice(3)] = ev.target.open;
    if (ev.target && ev.target.id === 'practice' && S.pracOpen !== ev.target.open) {
      S.pracOpen = ev.target.open;
      if (S.pracOpen) render();
    }
  },
  true
);
document.addEventListener('keydown', ev => {
  if (ev.key === 'Enter' && ev.target && ev.target.id === 'deck-tag') {
    ev.preventDefault();
    handleAct('dtag-add');
    return;
  }
  if (ev.key === 'Escape' && $('#confirm') && !$('#confirm').hidden) {
    confirmDone(false);
    return;
  }
  if (ev.key === 'Escape') {
    $('#modal').hidden = true;
    document.querySelectorAll('.ddl').forEach(x => (x.hidden = true));
  }
});

addEventListener('orientationchange', () =>
  setTimeout(() => {
    wasNarrow = isNarrow();
    render();
  }, 250)
);
// iPad windows (Stage Manager, Split View) can come back at full size without a resize event, or report the
// new size a moment late. Re-check the layout whenever the app returns and shortly after, so a closed and
// reopened window never stays stuck in the one-pane layout.
function ensureLayout() {
  const app = document.querySelector('.app');
  if (!app) return;
  const nw = isNarrow();
  wasNarrow = nw;
  if (app.classList.contains('narrow') !== nw) render();
  else fitWork();
}
let elT = [];
function recheckLayout() {
  elT.forEach(clearTimeout);
  ensureLayout();
  elT = [120, 500, 1500].map(ms => setTimeout(ensureLayout, ms));
}
addEventListener('pageshow', recheckLayout);
addEventListener('focus', recheckLayout);
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) recheckLayout();
});
let rz2 = 0;
if (window.ResizeObserver)
  new ResizeObserver(() => {
    clearTimeout(rz2);
    rz2 = setTimeout(ensureLayout, 150);
  }).observe(document.documentElement);
// Where you were in the app survives the page being reloaded while it was in the background.
function saveSpot() {
  try {
    sessionStorage.setItem('dc.ui', JSON.stringify({view: S.view, deckId: S.deckId, open: !!S.open, tab: S.tab || null}));
  } catch (e) {}
}
function restoreSpot() {
  let u = null;
  try {
    u = JSON.parse(sessionStorage.getItem('dc.ui') || 'null');
  } catch (e) {}
  if (!u || !u.view) return;
  if (u.view === 'decks' && u.open) {
    const ok = (S.draft && S.draft.id === u.deckId) || S.profile.decks.some(d => d.id === u.deckId);
    if (!ok) return;
    S.deckId = u.deckId;
    S.view = 'decks';
    S.open = true;
    S.tab = u.tab || null;
  } else if (['home', 'decks', 'search', 'profile', 'buy', 'library'].includes(u.view)) {
    S.view = u.view;
    S.open = false;
  }
}
if (window.visualViewport) visualViewport.addEventListener('resize', () => fitWork());
// The working area is sized from where it starts on screen, which moves while the page loads (fonts, the logo, Safari's
// toolbar). Size it again once everything has loaded, so it never stays too tall to scroll until the window is zoomed or resized.
addEventListener('load', () => {
  fitWork();
  setTimeout(fitWork, 300);
});
if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => fitWork());
document.addEventListener(
  'load',
  ev => {
    if (ev.target && ev.target.tagName === 'IMG' && ev.target.closest && ev.target.closest('.top')) fitWork();
  },
  true
);
addEventListener('pagehide', () => {
  saveSpot();
  clearTimeout(saveT);
  if (!S.profile.example) persist();
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    saveSpot();
    if (!S.profile.example) {
      clearTimeout(saveT);
      persist();
    }
  }
});
