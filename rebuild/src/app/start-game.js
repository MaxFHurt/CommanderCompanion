// The steps between "the seats are filled in" and "the game screen opens":
// load card data, check the decks, confirm the table rules, create the game.

import { html, on, $ } from '../ui/dom.js';
import { openModal } from '../ui/modal.js';
import { toast } from '../ui/toast.js';
import { rulesEditorHtml, bindRulesEditor } from '../ui/rules-editor.js';
import { accountSetupDefaults, recordDeckSelection } from '../data/profile.js';
import { normalizeRulesConfig } from '../engine/rules.js';
import { createGame } from '../game/setup.js';
import { prepareSeat, seatProblems } from './seat-setup.js';

/** Prepare every seat. Shows progress and returns the prepared seats, or null if something is wrong. */
export async function prepareSeats(seats, { mode, rules }) {
  const problems = seats.flatMap((s, i) => seatProblems(s, i));
  if (problems.length) {
    openModal({ title: 'Player setup incomplete', size: 'small', body: html`<p class="modal__message">Every player needs a name, a deck and a commander.</p><p class="muted">${problems.map(p => html`${p}<br>`)}</p>`, actions: [{ label: 'OK', kind: 'confirm' }] });
    return null;
  }
  const progress = openModal({ title: 'Loading decks', size: 'small', dismissible: false, body: html`<p class="modal__message" data-progress>Loading card data…</p>` });
  const strict = mode !== 'freeplay';
  const prepared = [], issues = [];
  try {
    for (const seat of seats) {
      const result = await prepareSeat(seat, { rules, strict, onProgress: (done, total) => { const el = $('[data-progress]', progress.el); if (el) el.textContent = `${seat.name}: loading cards ${done}/${total}…`; } });
      if (!result.ok) issues.push(...result.errors.map(e => `${seat.name}: ${e}`));
      prepared.push(result);
    }
  } catch (error) {
    progress.close();
    toast(error.message || 'The decks could not be loaded.', { bad: true, ms: 5000 });
    return null;
  }
  progress.close();
  if (issues.length) {
    openModal({ title: 'Deck check', body: html`<p class="modal__message">These decks cannot be used in Guided Play yet:</p><div class="option-list">${issues.slice(0, 12).map(t => html`<div class="option"><span><small>${t}</small></span></div>`)}</div><p class="muted">Fix the deck in the Deck Builder, or use Free Play, which allows any deck.</p>`, actions: [{ label: 'OK', kind: 'confirm' }] });
    return null;
  }
  return prepared;
}

/** "Setup validation" summary. Resolves true when the players confirm. */
export function confirmSeats(prepared) {
  return new Promise(resolve => {
    openModal({
      title: 'Setup check', onClose: () => resolve(false),
      body: html`<p class="modal__message">Everything is ready. Check the players and decks, then continue.</p>
        <div class="option-list">${prepared.map(r => html`<div class="option is-on"><span><strong>✓ ${r.seat.name}</strong><small>${r.seat.commanderNames.join(' + ')} • ${r.seat.deckName} • ${r.seat.total} cards</small>${r.warnings.map(w => html`<small class="warn">Note: ${w}</small>`)}</span></div>`)}</div>`,
      actions: [{ label: 'Back', kind: 'cancel', onClick: ({ close }) => { close(); resolve(false); } }, { label: 'Continue', kind: 'confirm', onClick: ({ close }) => { close(); resolve(true); } }]
    });
  });
}

/** Table rules page. Resolves the chosen rules (plus first player), or null on Back. */
export function chooseRules({ mode, names = [] }) {
  const defaults = normalizeRulesConfig(accountSetupDefaults().tableRuleDefaults || {});
  return new Promise(resolve => {
    let read = null, first = 'random';
    openModal({
      title: mode === 'freeplay' ? 'Free Play rules' : 'Table rules', size: 'wide', onClose: () => resolve(null),
      body: html`${rulesEditorHtml(defaults)}
        ${names.length ? html`<h4 class="section-title">Who goes first?</h4><div class="row row--wrap" data-first><button type="button" class="chip is-on chip--gold" data-first-pick="random">Random</button>${names.map((n, i) => html`<button type="button" class="chip" data-first-pick="${i}">${n}</button>`)}</div>` : ''}`,
      actions: [{ label: 'Back', kind: 'cancel', onClick: ({ close }) => { close(); resolve(null); } }, { label: 'Start game', kind: 'confirm', onClick: ({ close }) => { close(); resolve({ rules: read(), firstPlayer: first === 'random' ? 'random' : Number(first) }); } }],
      onMount(el) {
        read = bindRulesEditor(el, defaults);
        on(el, 'click', '[data-first-pick]', (e, b) => {
          first = b.dataset.firstPick;
          for (const c of el.querySelectorAll('[data-first-pick]')) c.classList.toggle('is-on', c === b), c.classList.toggle('chip--gold', c === b);
        });
      }
    });
  });
}

export function buildGame({ mode, deviceMode = 'single-device', rules, firstPlayer = 'random', seats }) {
  // Keep only what play needs; deck-check data (legalities, printing details) would bloat every autosave.
  const defs = {};
  for (const s of seats) for (const d of s.definitions) {
    const { legalities, printing, language, ...slim } = d;
    defs[d.definitionId] = slim;
  }
  const game = createGame({
    mode, deviceMode, rules, firstPlayer, definitions: defs,
    players: seats.map(s => ({ name: s.name, manifest: s.manifest, commanderIds: s.commanderIds, deckName: s.deckName, deckId: s.deckId, sourceType: s.sourceType, matId: s.matId, clientId: s.clientId || null }))
  });
  for (const s of seats) {
    recordDeckSelection({ playerName: s.name, deckId: s.deckId, deckName: s.deckName, commander1: s.commanderNames?.[0] || '', commander2: s.commanderNames?.[1] || '', source: s.sourceType }).catch(() => {});
  }
  return game;
}
