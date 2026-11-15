// One player's setup card (name, deck, commander, playmat), used for local seats and when joining a room.

import { html, on, $, setHtml } from './dom.js';
import { openModal } from './modal.js';
import { routePanel, routePanels, routeRow } from './route-kit.js';
import { toast } from './toast.js';
import { listDecks } from '../data/deck-store.js';
import { listPrecons, loadPrecon } from '../data/precons.js';
import { parseDeckList } from '../data/card-api.js';
import { unlockedMats, playmatById } from '../data/playmats.js';
import { loadProfile } from '../data/profile.js';

export function availableMats() {
  return unlockedMats(loadProfile());
}

export function seatFormHtml(seat, index) {
  const count = seat.deckList ? parseDeckList(seat.deckList).reduce((n, r) => n + r.quantity, 0) : 0;
  return html`
    <div class="seat-form" data-seat-form="${index}">
      <label class="field">Player name
        <input class="input" data-field="name" maxlength="24" placeholder="Player ${index + 1}" value="${seat.name}" autocomplete="off">
      </label>
      <div class="field">Deck
        <div class="seat-form__deck readout ${seat.deckList ? 'is-set' : ''}" title="${seat.deckName || ''}">
          <span><strong>${seat.deckName || 'No deck chosen'}</strong><small>${seat.deckList ? `${count} cards` : 'Pick a saved deck, a precon, or paste a list'}</small></span>
        </div>
      </div>
      <button type="button" class="btn btn--small" data-seat-act="saved">Saved decks</button>
      <button type="button" class="btn btn--small" data-seat-act="precon">Precon catalog</button>
      <button type="button" class="btn btn--small" data-seat-act="paste">Paste list</button>
      ${seat.deckList ? html`<button type="button" class="btn btn--small btn--cancel" data-seat-act="view">View deck</button>` : ''}
      <label class="field">Commander
        <input class="input" data-field="commander1" maxlength="80" placeholder="Commander name" value="${seat.commander1}" autocomplete="off">
      </label>
      <label class="field">Partner / Background (optional)
        <input class="input" data-field="commander2" maxlength="80" placeholder="Second commander" value="${seat.commander2}" autocomplete="off">
      </label>
      <div class="field field--stack">Advice
        <button type="button" class="option ${seat.advice !== false ? 'is-on' : ''}" data-seat-act="advice"><span><strong>Advice ${seat.advice !== false ? 'on' : 'off'}</strong><small>${seat.advice !== false ? 'The tip bar always suggests a move for this player and explains why.' : 'The tip bar only says what the game is waiting for. No suggestions.'}</small></span><span class="option__end">${seat.advice !== false ? 'On' : 'Off'}</span></button>
      </div>
      <div class="field field--stack">Playmat
        <div class="mat-pick">${availableMats().map(m => html`<button type="button" class="mat-thumb ${playmatById(seat.matId).id === m.id ? 'is-on' : ''}" data-seat-act="mat" data-mat="${m.id}" style="background-image:url('${m.thumb || m.image}')" aria-label="${m.name}"></button>`)}</div>
      </div>
    </div>`;
}

export function readSeatForm(root, seat) {
  for (const key of ['name', 'commander1', 'commander2']) {
    const input = root.querySelector(`[data-field="${key}"]`);
    if (input) seat[key] = input.value;
  }
}

function applyDeck(seat, { name, list, commander1 = '', commander2 = '', companion = '', id = '', sourceType = 'custom' }) {
  seat.deckName = name; seat.deckList = list; seat.deckId = id; seat.sourceType = sourceType;
  seat.commander1 = commander1; seat.commander2 = commander2; seat.companion = companion;
}

/** Handle a [data-seat-act] click. Calls redraw() after the seat changed. */
export function handleSeatAction(act, el, seat, redraw) {
  if (act === 'advice') { seat.advice = seat.advice === false; return redraw(); }
  if (act === 'mat') { seat.matId = el.dataset.mat; return redraw(); }
  if (act === 'view') {
    return openModal({ title: seat.deckName || 'Deck', route: { w: 900, h: 527, ph: 328, back: 'Close' }, body: routePanels(routePanel('Deck list', html`<pre class="deck-text">${seat.deckList}</pre>`, 'route-panel--text')) });
  }
  if (act === 'saved') {
    const decks = listDecks();
    return openModal({
      title: 'Saved decks', route: { w: 900, h: 423, ph: 236, back: 'Close' },
      body: routePanels(routePanel('Choose a deck', decks.length
        ? decks.map((d, i) => routeRow(html`<button type="button" class="btn" data-deck="${i}" title="${d.name || 'Untitled deck'}">${d.name || 'Untitled deck'}</button>`, [d.owner && `${d.owner}'s deck`, [d.commander1, d.commander2].filter(Boolean).join(' + ') || 'No commander set'].filter(Boolean).join(' • ')))
        : html`<p class="route-note">No saved decks yet. Build one in the Deck Builder, pick a precon, or paste a list.</p>`)),
      onMount(m, { close }) {
        on(m, 'click', '[data-deck]', (e, b) => {
          const d = decks[Number(b.dataset.deck)];
          applyDeck(seat, { name: d.name || 'Saved deck', list: d.deckList || '', commander1: d.commander1 || '', commander2: d.commander2 || '', companion: d.companion || '', id: d.id, sourceType: 'saved-deck' });
          close(); redraw();
        });
      }
    });
  }
  if (act === 'paste') {
    return openModal({
      title: 'Paste a deck list', route: { w: 900, h: 450, ph: 263 },
      body: routePanels(routePanel('Deck list', html`<p class="route-note">One card per line, for example “1 Sol Ring”. Include the commander in the list.</p>
        <textarea class="input deck-textarea" data-list aria-label="Deck list" placeholder="1 Atraxa, Praetors' Voice&#10;1 Sol Ring&#10;35 Forest">${seat.sourceType === 'custom' ? seat.deckList : ''}</textarea>
        <label class="field">Deck name<input class="input" data-name maxlength="60" value="${seat.sourceType === 'custom' ? seat.deckName : ''}" placeholder="My deck"></label>`, 'route-panel--form')),
      actions: [{ label: 'Cancel', kind: 'cancel' }, { label: 'Use this list', kind: 'confirm', onClick: ({ close, el: m }) => {
        const list = $('[data-list]', m).value.trim();
        if (!list) return toast('Paste the deck list first.');
        const first = parseDeckList(list)[0]?.name || '';
        applyDeck(seat, { name: $('[data-name]', m).value.trim() || 'Pasted deck', list, commander1: seat.commander1 || first });
        close(); redraw();
      } }]
    });
  }
  if (act === 'precon') return openPreconPicker(deck => { applyDeck(seat, { name: deck.name, list: deck.deckList, commander1: deck.commanders[0] || '', commander2: deck.commanders[1] || '', id: `precon:${deck.name}`, sourceType: 'precon' }); redraw(); });
}

let preconCache = null;
export function openPreconPicker(onPick) {
  openModal({
    title: 'Precon catalog', route: { w: 1160, h: 423, ph: 236, back: 'Close' },
    body: routePanels([
      routePanel('Search', html`<input class="input" type="search" data-q aria-label="Search preconstructed Commander decks" placeholder="Search preconstructed Commander decks" autocomplete="off">`),
      routePanel('Precons', html`<div class="route-list" data-list><p class="route-note">Loading the catalog…</p></div>`)]),
    onMount(el, { close }) {
      const draw = () => {
        const q = $('[data-q]', el).value.trim().toLowerCase();
        const rows = (preconCache || []).filter(d => !q || d.name.toLowerCase().includes(q)).slice(0, 80);
        setHtml($('[data-list]', el), rows.length ? rows.map(d => routeRow(html`<button type="button" class="btn" data-file="${d.fileName}" title="${d.name}">${d.name}</button>`, d.releaseDate || '')) : html`<p class="route-note">No decks match.</p>`);
      };
      (preconCache ? Promise.resolve(preconCache) : listPrecons()).then(list => { preconCache = list; draw(); })
        .catch(() => setHtml($('[data-list]', el), html`<p class="route-note">The precon catalog could not be reached. Check the internet connection.</p>`));
      $('[data-q]', el).addEventListener('input', draw);
      on(el, 'click', '[data-file]', async (e, b) => {
        b.disabled = true;
        try { const deck = await loadPrecon(b.dataset.file); close(); onPick(deck); }
        catch { toast('That deck could not be loaded.', { bad: true }); b.disabled = false; }
      });
    }
  });
}
