// One player's setup card (name, deck, commander, playmat), used for local seats and when joining a room.

import { html, on, $, setHtml } from './dom.js';
import { openModal } from './modal.js';
import { toast } from './toast.js';
import { listDecks } from '../data/deck-store.js';
import { listPrecons, loadPrecon } from '../data/precons.js';
import { parseDeckList } from '../data/card-api.js';
import { listPlaymats, DEFAULT_MAT } from '../data/playmats.js';
import { unlockedMatSlots } from '../data/achievements.js';
import { loadProfile } from '../data/profile.js';

export function availableMats() {
  return [DEFAULT_MAT, ...listPlaymats().filter(m => m.slot < unlockedMatSlots(loadProfile()))];
}

export function seatFormHtml(seat, index) {
  const count = seat.deckList ? parseDeckList(seat.deckList).reduce((n, r) => n + r.quantity, 0) : 0;
  return html`
    <div class="seat-form" data-seat-form="${index}">
      <label class="field">Player name
        <input class="input" data-field="name" maxlength="24" placeholder="Player ${index + 1}" value="${seat.name}" autocomplete="off">
      </label>
      <div class="field">Deck
        <div class="seat-form__deck ${seat.deckList ? 'is-set' : ''}">
          <span><strong>${seat.deckName || 'No deck chosen'}</strong><small>${seat.deckList ? `${count} cards` : 'Pick a saved deck, a precon, or paste a list'}</small></span>
        </div>
        <div class="row row--wrap">
          <button type="button" class="btn btn--small" data-seat-act="saved">Saved decks</button>
          <button type="button" class="btn btn--small" data-seat-act="precon">Precon catalog</button>
          <button type="button" class="btn btn--small" data-seat-act="paste">Paste list</button>
          ${seat.deckList ? html`<button type="button" class="btn btn--small" data-seat-act="view">View deck</button>` : ''}
        </div>
      </div>
      <div class="grid-2">
        <label class="field">Commander
          <input class="input" data-field="commander1" maxlength="80" placeholder="Commander name" value="${seat.commander1}" autocomplete="off">
        </label>
        <label class="field">Partner / Background (optional)
          <input class="input" data-field="commander2" maxlength="80" placeholder="Second commander" value="${seat.commander2}" autocomplete="off">
        </label>
      </div>
      <div class="field">Playmat
        <div class="mat-pick">${availableMats().map(m => html`<button type="button" class="mat-thumb ${seat.matId === m.id ? 'is-on' : ''}" data-seat-act="mat" data-mat="${m.id}" style="background-image:url('${m.image}')" aria-label="${m.name}"></button>`)}</div>
      </div>
    </div>`;
}

export function readSeatForm(root, seat) {
  for (const key of ['name', 'commander1', 'commander2']) {
    const input = root.querySelector(`[data-field="${key}"]`);
    if (input) seat[key] = input.value;
  }
}

function applyDeck(seat, { name, list, commander1 = '', commander2 = '', id = '', sourceType = 'custom' }) {
  seat.deckName = name; seat.deckList = list; seat.deckId = id; seat.sourceType = sourceType;
  seat.commander1 = commander1; seat.commander2 = commander2;
}

/** Handle a [data-seat-act] click. Calls redraw() after the seat changed. */
export function handleSeatAction(act, el, seat, redraw) {
  if (act === 'mat') { seat.matId = el.dataset.mat; return redraw(); }
  if (act === 'view') {
    return openModal({ title: seat.deckName || 'Deck', body: html`<pre class="deck-text">${seat.deckList}</pre>` });
  }
  if (act === 'saved') {
    const decks = listDecks();
    return openModal({
      title: 'Saved decks',
      body: decks.length ? html`<div class="option-list">${decks.map((d, i) => html`<button type="button" class="option" data-deck="${i}"><span><strong>${d.name || 'Untitled deck'}</strong><small>${[d.commander1, d.commander2].filter(Boolean).join(' + ') || 'No commander set'}</small></span></button>`)}</div>`
        : html`<p class="muted">No saved decks yet. Build one in the Deck Builder, pick a precon, or paste a list.</p>`,
      onMount(m, { close }) {
        on(m, 'click', '[data-deck]', (e, b) => {
          const d = decks[Number(b.dataset.deck)];
          applyDeck(seat, { name: d.name || 'Saved deck', list: d.deckList || '', commander1: d.commander1 || '', commander2: d.commander2 || '', id: d.id, sourceType: 'saved-deck' });
          close(); redraw();
        });
      }
    });
  }
  if (act === 'paste') {
    return openModal({
      title: 'Paste a deck list', size: 'wide',
      body: html`<p class="muted">One card per line, for example “1 Sol Ring”. Include the commander in the list.</p>
        <textarea class="input deck-textarea" data-list placeholder="1 Atraxa, Praetors' Voice&#10;1 Sol Ring&#10;35 Forest">${seat.sourceType === 'custom' ? seat.deckList : ''}</textarea>
        <label class="field">Deck name<input class="input" data-name maxlength="60" value="${seat.sourceType === 'custom' ? seat.deckName : ''}" placeholder="My deck"></label>`,
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
    title: 'Precon catalog', size: 'wide',
    body: html`<input class="input" type="search" data-q placeholder="Search preconstructed Commander decks" autocomplete="off"><div class="option-list" data-list><p class="muted">Loading the catalog…</p></div>`,
    onMount(el, { close }) {
      const draw = () => {
        const q = $('[data-q]', el).value.trim().toLowerCase();
        const rows = (preconCache || []).filter(d => !q || d.name.toLowerCase().includes(q)).slice(0, 80);
        setHtml($('[data-list]', el), rows.length ? rows.map(d => html`<button type="button" class="option" data-file="${d.fileName}"><span><strong>${d.name}</strong><small>${d.releaseDate || ''}</small></span></button>`) : html`<p class="muted">No decks match.</p>`);
      };
      (preconCache ? Promise.resolve(preconCache) : listPrecons()).then(list => { preconCache = list; draw(); })
        .catch(() => setHtml($('[data-list]', el), html`<p class="muted">The precon catalog could not be reached. Check the internet connection.</p>`));
      $('[data-q]', el).addEventListener('input', draw);
      on(el, 'click', '[data-file]', async (e, b) => {
        b.disabled = true;
        try { const deck = await loadPrecon(b.dataset.file); close(); onPick(deck); }
        catch { toast('That deck could not be loaded.', { bad: true }); b.disabled = false; }
      });
    }
  });
}
