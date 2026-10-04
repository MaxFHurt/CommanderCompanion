// Player setup for Guided Play and Free Play: 2–6 seats, each with a name, deck, commander, playmat.
// When hosting a room, only the seats on this device are filled in here; the rest join remotely.

import { html, setHtml, on, $ } from '../dom.js';
import { go } from '../../app/router.js';
import { toast } from '../toast.js';
import { accountSetupDefaults, loadProfile } from '../../data/profile.js';
import { listDecks } from '../../data/deck-store.js';
import { emptySeat } from '../../app/seat-setup.js';
import { seatFormHtml, readSeatForm, handleSeatAction } from '../seat-form.js';
import { prepareSeats, confirmSeats, chooseRules, buildGame } from '../../app/start-game.js';
import { startLocalSession } from '../../app/session.js';
import { PLAYER_COLORS } from '../../game/setup.js';

function seatFromDefaults(index, defaults) {
  const seat = emptySeat(defaults.playerNames?.[index] || '');
  // Table Defaults: each saved player's preferred deck is filled in automatically.
  const profile = loadProfile();
  const key = Object.keys(profile.players || {}).find(k => (profile.players[k].name || '').toLowerCase() === seat.name.toLowerCase());
  const row = key ? profile.players[key] : null;
  const preferredId = index === 0 && defaults.favoriteDeckId ? defaults.favoriteDeckId
    : row ? Object.values(row.decks || {}).sort((a, b) => String(b.lastSelectedAt || b.lastPlayedAt || '').localeCompare(String(a.lastSelectedAt || a.lastPlayedAt || '')))[0]?.id : '';
  const deck = preferredId ? listDecks().find(d => d.id === preferredId) : null;
  if (deck) Object.assign(seat, { deckId: deck.id, deckName: deck.name, deckList: deck.deckList || '', commander1: deck.commander1 || '', commander2: deck.commander2 || '', sourceType: 'saved-deck' });
  return seat;
}

export const playerSetupScreen = {
  mount(root, params = {}) {
    const mode = params.mode === 'freeplay' ? 'freeplay' : 'fully-tracked';
    const play = params.play || 'local'; // local | host-player
    const defaults = accountSetupDefaults();
    const hosting = play === 'host-player';
    const seats = params.seats || (hosting ? [seatFromDefaults(0, defaults)] : [seatFromDefaults(0, defaults), seatFromDefaults(1, defaults)]);
    let active = 0, remote = hosting ? Math.max(1, params.remoteSeats || 1) : 0, busy = false;
    const minLocal = hosting ? 1 : 2;

    function draw() {
      const title = mode === 'freeplay' ? 'Free Play' : 'Guided Play';
      setHtml(root, html`
        <main class="page page--setup">
          <header class="page__head">
            <button class="btn-back" type="button" data-act="back" aria-label="Back"><img src="assets/img/ui/back.png" alt="Back"></button>
            <h1 class="chrome-text">Player Setup — ${title}</h1>
          </header>
          <div class="page__body setup">
            <nav class="setup__tabs">
              ${seats.map((s, i) => html`<button type="button" class="setup__tab ${i === active ? 'is-on' : ''}" data-act="tab" data-seat="${i}" style="--player:${PLAYER_COLORS[i]}">
                <b>${s.name.trim() || `Player ${i + 1}`}</b><small>${s.deckList && s.commander1 ? `✓ ${s.deckName}` : 'Needs a deck'}</small></button>`)}
              ${seats.length + remote < 6 ? html`<button type="button" class="setup__tab setup__tab--add" data-act="add">+ Add player${hosting ? ' on this device' : ''}</button>` : ''}
              ${seats.length > minLocal ? html`<button type="button" class="setup__tab setup__tab--add" data-act="remove">Remove ${seats[active].name.trim() || `Player ${active + 1}`}</button>` : ''}
              ${hosting ? html`<div class="setup__remote"><span>Players joining from other devices</span><div class="stepper"><button type="button" class="icon-btn" data-act="remote" data-step="-1">−</button><b class="stepper__value">${remote}</b><button type="button" class="icon-btn" data-act="remote" data-step="1">+</button></div></div>` : ''}
            </nav>
            <section class="setup__form panel">${seatFormHtml(seats[active], active)}</section>
          </div>
          <footer class="page__foot">
            <span class="muted">${mode === 'freeplay' ? 'Free Play: any deck is allowed and every rule can be overridden.' : 'Guided Play checks each deck against the Commander rules.'}</span>
            <button type="button" class="btn btn--confirm" data-act="start">${hosting ? 'Open room' : 'Continue'}</button>
          </footer>
        </main>`);
    }

    async function start() {
      if (busy) return;
      busy = true;
      try {
        const prepared = await prepareSeats(seats, { mode, rules: accountSetupDefaults().tableRuleDefaults || {} });
        if (!prepared) return;
        if (!(await confirmSeats(prepared))) return;
        if (hosting) return go('lobby', { mode, hostDevice: false, localSeats: prepared.map(r => r.seat), remoteSeats: remote, setupSeats: seats });
        const choice = await chooseRules({ mode, names: prepared.map(r => r.seat.name) });
        if (!choice) return;
        const game = buildGame({ mode, rules: choice.rules, firstPlayer: choice.firstPlayer, seats: prepared.map(r => r.seat) });
        startLocalSession(game);
        go('game');
      } catch (error) {
        console.error(error);
        toast(error.message || 'The game could not be started.', { bad: true });
      } finally { busy = false; }
    }

    draw();
    const offInput = on(root, 'input', '[data-field]', () => {
      readSeatForm(root, seats[active]);
      const tab = $(`.setup__tab[data-seat="${active}"] b`, root);
      if (tab) tab.textContent = seats[active].name.trim() || `Player ${active + 1}`;
    });
    const offClick = on(root, 'click', '[data-act], [data-seat-act]', (event, el) => {
      readSeatForm(root, seats[active]);
      if (el.dataset.seatAct) return handleSeatAction(el.dataset.seatAct, el, seats[active], draw);
      switch (el.dataset.act) {
        case 'back': return go('mode-select');
        case 'tab': active = Number(el.dataset.seat); return draw();
        case 'add': seats.push(seatFromDefaults(seats.length, defaults)); active = seats.length - 1; return draw();
        case 'remove': seats.splice(active, 1); active = Math.max(0, active - 1); return draw();
        case 'remote': remote = Math.max(1, Math.min(6 - seats.length, remote + Number(el.dataset.step))); return draw();
        case 'start': return start();
      }
    });
    return () => { offInput(); offClick(); };
  }
};
