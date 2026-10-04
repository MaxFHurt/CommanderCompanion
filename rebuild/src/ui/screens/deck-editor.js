// Deck Editor: build, edit, import and manage saved Commander decks.

import { html, setHtml, on, $, debounce } from '../dom.js';
import { go } from '../../app/router.js';
import { toast } from '../toast.js';
import { openModal, confirmDialog } from '../modal.js';
import { listDecks, saveDeck, deleteDeck } from '../../data/deck-store.js';
import { searchCards, parseDeckList } from '../../data/card-api.js';
import { hydrateDeck } from '../../data/card-cache.js';
import { parseManaBoxFileContents } from '../../data/deck-import.js';
import { analyzeDeck, deckAnalyticsHtml } from '../../data/deck-analytics.js';
import { recordDeckCreated, recordDeckDeleted, accountSetupDefaults } from '../../data/profile.js';
import { validateCommanderDeck, isCommanderEligible, allowsSecondaryCommander, isSecondaryCommanderEligible } from '../../engine/rules.js';
import { raw } from '../dom.js';
import { openPreconPicker } from '../seat-form.js';

export const deckEditorScreen = {
  mount(root) {
    const deck = { id: null, name: '', commander1: '', commander2: '', deckList: '', importMeta: null };
    let results = [], status = { text: '', bad: false }, analytics = null;

    const read = () => {
      deck.name = $('#deckName', root)?.value ?? deck.name;
      deck.deckList = $('#deckList', root)?.value ?? deck.deckList;
      deck.commander1 = $('#deckCmd1', root)?.value ?? deck.commander1;
      deck.commander2 = $('#deckCmd2', root)?.value ?? deck.commander2;
    };
    const count = () => parseDeckList(deck.deckList).reduce((n, r) => n + r.quantity, 0);
    const setStatus = (text, bad = false) => { status = { text, bad }; const el = $('#deckStatus', root); if (el) { el.textContent = text; el.classList.toggle('is-bad', bad); } };

    function draw() {
      const decks = listDecks().sort((a, b) => String(a.name).localeCompare(String(b.name)));
      setHtml(root, html`
        <main class="page page--deck">
          <header class="page__head">
            <button class="btn-back" type="button" data-act="back" aria-label="Back"><img src="assets/img/ui/back.png" alt="Back"></button>
            <div class="page__title"><h1 class="chrome-text">Deck Editor</h1><small>• Build • Edit • Import • Manage</small></div>
          </header>
          <div class="page__body deck-editor">
            <aside class="deck-editor__side panel">
              <button type="button" class="btn" data-act="new">New Deck</button>
              <button type="button" class="btn" data-act="copy">Copy Deck</button>
              <button type="button" class="btn" data-act="precon">Precon Catalog</button>
              <button type="button" class="btn" data-act="import">Import ManaBox File</button>
              <input type="file" id="manaBoxFile" accept=".txt,.csv,text/plain,text/csv" hidden>
              <div class="deck-editor__saved scroll-y">
                ${decks.length ? decks.map(d => html`<button type="button" class="option ${d.id === deck.id ? 'is-on' : ''}" data-act="load" data-id="${d.id}"><span><strong>${d.name || 'Untitled deck'}</strong><small>${d.commander1 || ''}</small></span></button>`) : html`<p class="muted">No saved decks yet.</p>`}
              </div>
            </aside>
            <section class="deck-editor__main">
              <label class="field">Deck Name<input class="input" id="deckName" maxlength="60" value="${deck.name}" autocomplete="off"></label>
              <label class="field deck-editor__list">Deck List <span class="deck-editor__count" id="deckCount">${count()} / 100</span>
                <textarea class="input deck-textarea" id="deckList" spellcheck="false" placeholder="1 Sol Ring&#10;1 Command Tower&#10;30 Forest">${deck.deckList}</textarea></label>
            </section>
            <section class="deck-editor__right">
              <label class="field">Commander 1<input class="input" id="deckCmd1" value="${deck.commander1}" autocomplete="off"></label>
              <div class="row"><button type="button" class="btn btn--small" data-act="pick-cmd" data-slot="1">Select From Deck</button>
                <button type="button" class="btn btn--small" data-act="pick-cmd" data-slot="2">Partner…</button></div>
              <label class="field" ${deck.commander2 ? '' : raw('hidden')} id="deckCmd2Wrap">Commander 2<input class="input" id="deckCmd2" value="${deck.commander2}" autocomplete="off"></label>
              <div class="field">Card Search
                <div class="row"><input class="input" id="cardSearch" type="search" placeholder="Type a card name" autocomplete="off"><button type="button" class="btn btn--small" data-act="search">Search</button></div>
              </div>
              <div class="deck-editor__results scroll-y" id="cardResults">
                ${results.length ? results.slice(0, 30).map((d, i) => html`<button type="button" class="option" data-act="add-card" data-i="${i}"><span><strong>${d.name}</strong><small>${d.typeLine || ''}</small></span><span class="option__end">+ ADD</span></button>`)
                  : analytics ? raw(deckAnalyticsHtml(analytics)) : html`<p class="muted">Validate the deck to calculate curve, land count, card types, and color identity.</p>`}
              </div>
            </section>
          </div>
          <footer class="page__foot">
            <span class="deck-editor__status ${status.bad ? 'is-bad' : ''}" id="deckStatus">${status.text}</span>
            <button type="button" class="btn btn--danger" data-act="delete" ${deck.id ? '' : raw('disabled')}>Delete</button>
            <button type="button" class="btn" data-act="validate">Validate</button>
            <button type="button" class="btn btn--confirm" data-act="save">Save Deck</button>
          </footer>
        </main>`);
    }

    function load(source) {
      Object.assign(deck, { id: null, name: '', commander1: '', commander2: '', deckList: '', importMeta: null }, source);
      results = []; analytics = null;
      draw();
    }

    function addCard(def) {
      read();
      const lines = deck.deckList.trim() ? deck.deckList.trim().split(/\r?\n/) : [];
      const escaped = def.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const re = new RegExp(`^(\\d+)\\s*[xX]?\\s+${escaped}(?:\\s+\\([A-Z0-9]+\\)\\s+\\d+)?$`, 'i');
      const i = lines.findIndex(l => re.test(l.trim()));
      if (i >= 0) lines[i] = `${Number(lines[i].trim().match(re)[1]) + 1} ${def.name}`;
      else lines.push(`1 ${def.name}`);
      deck.deckList = lines.filter(Boolean).join('\n');
      $('#deckList', root).value = deck.deckList;
      $('#deckCount', root).textContent = `${count()} / 100`;
      setStatus(`Added ${def.name}.`);
    }

    async function validate() {
      read();
      if (!deck.deckList.trim()) { setStatus('Add some cards first.', true); return null; }
      setStatus('Checking the card list…');
      try {
        const h = await hydrateDeck(deck.deckList, (d, t) => setStatus(`Loading cards ${d}/${t}…`));
        if (h.unresolved.length) throw new Error(`Not recognised: ${h.unresolved.slice(0, 5).join(', ')}`);
        const cmds = [];
        for (const n of [deck.commander1, deck.commander2].map(x => x.trim()).filter(Boolean)) {
          const d = h.definitions.find(x => x.name.toLowerCase() === n.toLowerCase() || String(x.combinedName || '').toLowerCase() === n.toLowerCase());
          if (!d) throw new Error(`Commander ${n} is not in this deck list.`);
          cmds.push(d);
        }
        const check = validateCommanderDeck({ manifest: h.manifest, definitions: h.definitions, commanders: cmds, rulesConfig: accountSetupDefaults().tableRuleDefaults || {} });
        analytics = analyzeDeck({ manifest: h.manifest, definitions: h.definitions });
        results = [];
        const text = `${h.total}/100 cards • ${!cmds.length ? 'Choose a commander' : check.legal ? 'Commander legal' : check.reasons.join(' • ')}`;
        status = { text, bad: !check.legal || !cmds.length };
        draw();
        return { h, cmds, check };
      } catch (error) {
        setStatus(error.message || 'The deck could not be checked.', true);
        return null;
      }
    }

    async function pickCommander(slot) {
      read();
      if (!deck.deckList.trim()) return toast('Add cards to the deck list first.');
      setStatus('Loading cards…');
      let h;
      try { h = await hydrateDeck(deck.deckList); } catch (error) { return setStatus(error.message, true); }
      setStatus('');
      const primary = h.definitions.find(d => d.name.toLowerCase() === deck.commander1.trim().toLowerCase());
      if (slot === 2 && !(primary && allowsSecondaryCommander(primary))) return toast('The first commander does not allow a partner or background.');
      const rows = h.definitions.filter(d => slot === 2 ? isSecondaryCommanderEligible(d) && d !== primary : isCommanderEligible(d)).sort((a, b) => a.name.localeCompare(b.name));
      openModal({
        title: slot === 2 ? 'Choose second commander' : 'Choose commander',
        body: rows.length ? html`<div class="option-list">${rows.map((d, i) => html`<button type="button" class="option" data-i="${i}"><span><strong>${d.name}</strong><small>${d.typeLine}</small></span></button>`)}</div>` : html`<p class="muted">No legendary creature was found in this list.</p>`,
        onMount(el, { close }) {
          on(el, 'click', '[data-i]', (e, b) => {
            const d = rows[Number(b.dataset.i)];
            if (slot === 2) deck.commander2 = d.name; else { deck.commander1 = d.name; deck.commander2 = ''; }
            close(); draw();
          });
        }
      });
    }

    draw();
    const search = async () => {
      const q = $('#cardSearch', root).value.trim();
      if (q.length < 2) return toast('Type at least two letters.');
      read();
      setStatus('Searching…');
      try { results = await searchCards(q, { allPrintings: false }); setStatus(results.length ? `${results.length} cards found.` : 'No cards found.'); }
      catch { results = []; setStatus('The card catalog could not be reached.', true); }
      const keep = q;
      draw();
      $('#cardSearch', root).value = keep;
    };
    const offs = [
      on(root, 'input', '#deckList', debounce(() => { read(); $('#deckCount', root).textContent = `${count()} / 100`; }, 200)),
      on(root, 'keydown', '#cardSearch', e => { if (e.key === 'Enter') search(); }),
      on(root, 'change', '#manaBoxFile', async (e, input) => {
        const file = input.files?.[0];
        input.value = '';
        if (!file) return;
        try {
          const parsed = parseManaBoxFileContents(file.name, await file.text());
          if (!parsed.deckList.trim()) throw new Error('No cards were recognised in that file.');
          load({ name: file.name.replace(/\.(txt|csv)$/i, '') || 'Imported deck', commander1: parsed.commanders[0] || '', commander2: parsed.commanders[1] || '', deckList: parsed.deckList, importMeta: { source: 'manabox', fileName: file.name, importedAt: new Date().toISOString() } });
          setStatus(`Imported ${parsed.totalCards} cards. Check the commander, validate, then save.`);
        } catch (error) { setStatus(error.message, true); }
      }),
      on(root, 'click', '[data-act]', async (event, el) => {
        switch (el.dataset.act) {
          case 'back': return go('landing');
          case 'new': return load({});
          case 'copy': read(); if (!deck.deckList.trim()) return toast('Open a deck to copy first.'); return load({ ...deck, id: null, name: `Copy of ${deck.name || 'deck'}` });
          case 'load': { const d = listDecks().find(x => x.id === el.dataset.id); return d && load({ id: d.id, name: d.name || '', commander1: d.commander1 || '', commander2: d.commander2 || '', deckList: d.deckList || '', importMeta: d.importMeta || null }); }
          case 'precon': return openPreconPicker(pre => load({ name: pre.name, commander1: pre.commanders[0] || '', commander2: pre.commanders[1] || '', deckList: pre.deckList }));
          case 'import': return $('#manaBoxFile', root).click();
          case 'search': return search();
          case 'add-card': return addCard(results[Number(el.dataset.i)]);
          case 'pick-cmd': return pickCommander(Number(el.dataset.slot));
          case 'validate': return validate();
          case 'save': {
            read();
            if (!deck.deckList.trim()) return setStatus('Add some cards first.', true);
            const checked = await validate();
            // A deck that is still being built can be saved; it just cannot start a Guided game yet.
            try {
              const saved = await saveDeck({ id: deck.id || undefined, name: deck.name.trim() || 'Untitled deck', commander1: deck.commander1.trim(), commander2: deck.commander2.trim(), deckList: deck.deckList, importMeta: deck.importMeta });
              deck.id = saved.id;
              await recordDeckCreated(saved).catch(() => {});
              const note = checked?.check.legal && checked.cmds.length ? 'Deck saved.' : 'Deck saved as a work in progress.';
              status = { text: `${note} ${status.text}`, bad: status.bad };
              draw();
              toast(note);
            } catch (error) { setStatus(error.message || 'The deck could not be saved.', true); }
            return;
          }
          case 'delete': {
            if (!deck.id) return;
            const ok = await confirmDialog({ title: 'Delete deck', message: `Delete “${deck.name}” from this device?`, confirmLabel: 'Delete', danger: true });
            if (!ok) return;
            await deleteDeck(deck.id);
            await recordDeckDeleted(deck.id).catch(() => {});
            toast('Deck deleted.');
            return load({});
          }
        }
      })
    ];
    return () => offs.forEach(off => off());
  }
};
