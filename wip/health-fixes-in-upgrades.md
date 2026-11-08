# Health fixes in the upgrade list (not shipped)

Owner, 8 Nov: "Why are deck health fixes not shown as upgrades?" Built for build 84 and taken out before release: its background
work (fixList for each alert, run with setTimeout while the page is in use) made two Deck Builder tests fail (UI-B81-02:
generating twice no longer gave the same deck; UI-ALT-01: See alternatives on upgrade picks found nothing). With the section
switched off both pass. Likely shared state touched by fixList/evaluateDeck in the background (caches, the seeded practice
games) while generation and the alternatives run. Fix that, then put these back:

## ui/upgrades.js (before `function fixApply`)
```js
// Health fixes in the upgrade list (owner, 8 Nov: "Why are deck health fixes not shown as upgrades?"): each active alert (yellow or
// red, not ignored) shows its best two swaps from its Fix menu at the top of the list, worked out in the background one alert at a
// time and kept until the deck changes.
const UPFIX = {sig: '', G: [], busy: false, t: null};
function upFixHtml(d) {
  if (!d || d.format !== 'commander' || !d.cards.length) return '';
  const ign = new Set(d.ignoreH || []),
    keys = [...(HFIX.get(d.id) || [])].filter(k => FIX_OF[k] && !ign.has(k));
  if (!keys.length) return '';
  const sig = d.id + '#' + d.cards.map(e => e.n + '×' + e.q).join('|') + '#' + keys.join(',');
  if (UPFIX.sig !== sig) {
    UPFIX.sig = sig;
    UPFIX.G = [];
    UPFIX.busy = true;
    clearTimeout(UPFIX.t);
    const todo = keys.slice(),
      step = () => {
        if (UPFIX.sig !== sig) return;
        const k = todo.shift();
        if (k) {
          try {
            UPFIX.G.push({k, L: fixList(d, k)});
          } catch (e) {}
          UPFIX.t = setTimeout(step, 0);
        } else {
          UPFIX.busy = false;
          if (cur() === d && S.tab === 'up') render();
        }
      };
    UPFIX.t = setTimeout(step, 40);
  }
  const usedCut = new Set(),
    usedAdd = new Set(),
    rows = [];
  UPFIX.G.forEach(g => {
    g.L.map((p, i) => ({p, i}))
      .filter(x => (x.p.dScore == null || x.p.dScore >= 0) && !usedCut.has(norm(x.p.cut)) && !usedAdd.has(norm(x.p.add)) && entryOf(d, x.p.cut) && !entryOf(d, x.p.add))
      .slice(0, 2)
      .forEach(x => {
        usedCut.add(norm(x.p.cut));
        usedAdd.add(norm(x.p.add));
        rows.push({g, p: x.p, i: x.i});
      });
  });
  const sw = ({g, p, i}) => {
    const a = find(p.add),
      c = find(p.cut);
    return (
      '<div class="opt fixsw"><span class="chip warn">Fixes ' +
      esc(g.k) +
      '</span><button class="sw out" data-act="card" data-n="' +
      esc(p.cut) +
      '">' +
      (c ? '<img alt="" src="' + artFor(c, entryOf(d, p.cut)) + '">' : '<span></span>') +
      '<span><small>Cut</small>' +
      esc(p.cut) +
      '</span><em>' +
      money(c) +
      '</em></button><button class="sw in" data-act="card" data-n="' +
      esc(p.add) +
      '">' +
      (a ? '<img alt="" src="' + artFor(a, {pid: a.id}) + '">' : '') +
      cardBadges(d, p.add) +
      '<span><small>Add</small>' +
      esc(p.add) +
      '</span><em>' +
      money(a) +
      '</em></button><div class="row">' +
      (p.dScore != null ? scoreChip(p.dScore) : '') +
      (p.why ? '<span class="chip">' + esc(p.why) + '</span>' : '') +
      '<button class="btn pri sm" data-act="upfix-swap" data-v="' +
      esc(g.k) +
      '|' +
      i +
      '" style="margin-left:auto">Swap</button></div></div>'
    );
  };
  return (
    '<div class="grp upfix"><span class="lab">Fixes for health alerts</span>' +
    (rows.length
      ? rows.map(sw).join('')
      : '<p class="note' + (UPFIX.busy ? ' think' : '') + '" style="margin:0">' + (UPFIX.busy ? 'Thinking… finding the best swaps for ' + keys.join(', ') : 'No swap raises the deck score for ' + keys.join(', ') + ' right now.') + '</p>') +
    (UPFIX.busy && rows.length ? '<p class="note think" style="margin:0">Thinking… more alerts to check</p>' : '') +
    '</div>'
  );
}
```

## ui/events.js (before `case 'fix-swap'`)
```js
    case 'upfix-swap': {
      // a health fix from the upgrade list: the swap, and the upgrade list kept (the rows lose the card that went out)
      const [k, i] = String(v).split('|'),
        g = (UPFIX.G || []).find(x => x.k === k),
        p = g && g.L[+i];
      if (!d || !p) return;
      keepRecs(d, p, 'apex', -1);
      if (fixApply(d, [p])) toast('Swapped ' + p.cut + ' for ' + p.add + ' (' + k + ').');
      touch();
      render();
      return;
    }
```

## ui/deck.js: in the Upgrades tab, before the sheet/paths markup
```js
      upFixHtml(d) +
```

## tools/tests/suite/ui-test.mjs (after UI-B197-01) and ui-test.groups.json (["UI-B197-02"])
```js
if (RUN('UI-B197-02')) { try { if (SHARD) await RESET();
// Build 197 (owner, 8 Nov: "Why are deck health fixes not shown as upgrades?"): each active health alert's best swaps are shown
// at the top of the upgrade list, marked with the alert, and swapping one keeps the upgrade list.
const b1972 = await page.evaluate(async () => { const out = {}; const sy = S.syncRecs; S.syncRecs = true;
  await loadPreconLive('turtle-power', 'Turtle Power'); const d = S.draft; S.profile.decks.unshift(d); S.draft = null; S.deckId = d.id; touch(); await loadEdh(d.commander);
  for (let i = 0; i < 100 && !apexFor(d); i++) await new Promise(r => setTimeout(r, 100));
  S.view = 'decks'; S.open = true; S.tab = 'up'; S.upView = 'list'; recsFor.k = null; render(); await recsReady(d); render();
  out.alerts = [...(HFIX.get(d.id) || [])].filter(k => FIX_OF[k]);
  for (let i = 0; i < 400 && UPFIX.busy; i++) await new Promise(r => setTimeout(r, 50));
  render(); const rows = [...document.querySelectorAll('.upfix .fixsw')]; out.rows = rows.length; out.chips = rows.map(r => (r.querySelector('.chip.warn') || {}).textContent);
  const R = recsFor(d), b = document.querySelector('.upfix [data-act="upfix-swap"]');
  if (b) { const [k, i] = b.dataset.v.split('|'), p = UPFIX.G.find(x => x.k === k).L[+i]; b.click(); await new Promise(r => setTimeout(r, 200)); out.swapped = hasCard(d, p.add) && !hasCard(d, p.cut); out.kept = recsFor(d) === R; }
  S.profile.decks = S.profile.decks.filter(x => x !== d); S.syncRecs = sy; S.view = 'home'; render(); return out; });
T('UI-B197-02', 'Build 197: active health alerts show their best swaps at the top of the upgrade list, marked with the alert; a swap there keeps the list', !b1972.alerts.length || (b1972.rows > 0 && b1972.chips.every(c => /^Fixes /.test(c)) && b1972.swapped && b1972.kept), JSON.stringify(b1972));
} catch (e) { QUIET = false; T('UI-B197-02', 'threw before finishing', false, String(e && e.message || e).slice(0, 300)); } }
```
