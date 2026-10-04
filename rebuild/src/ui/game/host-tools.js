// Host / Free Play tools: change anything about the game by hand. Every change is logged.

import { html, on, $, setHtml } from '../dom.js';
import { openModal, confirmDialog } from '../modal.js';
import { toast } from '../toast.js';
import { searchCards } from '../../data/card-api.js';
import { rulesEditorHtml, bindRulesEditor } from '../rules-editor.js';
import { pickOne, pickNumber, pickText } from './card-modals.js';

const PHASES = [['untap', 'Untap'], ['upkeep', 'Upkeep'], ['draw', 'Draw'], ['precombat-main', 'Main 1'], ['combat', 'Combat'], ['postcombat-main', 'Main 2'], ['end-step', 'End step']];
const TOKENS = [['Soldier', 1, 1], ['Goblin', 1, 1], ['Zombie', 2, 2], ['Spirit', 1, 1], ['Saproling', 1, 1], ['Beast', 3, 3], ['Elemental', 4, 4], ['Dragon', 5, 5], ['Treasure', null, null], ['Clue', null, null], ['Food', null, null]];

export function openHostTools(ctx) {
  const view = ctx.view;
  const edit = e => ctx.send({ type: 'edit', edit: e });
  const players = view.players;
  const choosePlayer = (title, fn) => players.length === 1 ? fn(players[0].playerId) : pickOne(title, players.map(p => [p.playerId, p.name, `Life ${p.life}`]), fn);
  const reopen = close => { close(); setTimeout(() => openHostTools(ctx), 0); };

  openModal({
    title: view.mode === 'freeplay' ? 'Edit game' : 'Host tools', size: 'wide',
    body: html`
      <h4 class="section-title">Players</h4>
      <div class="host-players">${players.map(p => html`
        <div class="host-player" style="--player:${p.color}">
          <strong>${p.name}${p.eliminated ? ' (out)' : ''}</strong>
          <span class="stepper">
            <button type="button" class="icon-btn" data-life="-5" data-p="${p.playerId}">−5</button>
            <button type="button" class="icon-btn" data-life="-1" data-p="${p.playerId}">−</button>
            <b class="stepper__value">${p.life}</b>
            <button type="button" class="icon-btn" data-life="1" data-p="${p.playerId}">+</button>
            <button type="button" class="icon-btn" data-life="5" data-p="${p.playerId}">+5</button>
          </span>
          <button type="button" class="btn btn--small" data-more="${p.playerId}">More…</button>
        </div>`)}</div>
      <h4 class="section-title">Turn</h4>
      <div class="row row--wrap">
        <button type="button" class="btn btn--small" data-tool="phase">Set phase…</button>
        <button type="button" class="btn btn--small" data-tool="active">Set active player…</button>
        <button type="button" class="btn btn--small" data-tool="rules">Table rules…</button>
      </div>
      <h4 class="section-title">Stack (${view.stack.length})</h4>
      <div class="row row--wrap">
        <button type="button" class="btn btn--small" data-tool="resolve-top" ${view.stack.length ? '' : html`disabled`}>Resolve top now</button>
        <button type="button" class="btn btn--small" data-tool="counter-top" ${view.stack.length ? '' : html`disabled`}>Remove top</button>
        <button type="button" class="btn btn--small" data-tool="clear-stack" ${view.stack.length ? '' : html`disabled`}>Clear stack</button>
      </div>
      <h4 class="section-title">Cards</h4>
      <div class="row row--wrap">
        <button type="button" class="btn btn--small" data-tool="token">Create token…</button>
        <button type="button" class="btn btn--small" data-tool="add-card">Add any card…</button>
        <button type="button" class="btn btn--small" data-tool="draw">Draw cards…</button>
        <button type="button" class="btn btn--small" data-tool="mill">Mill cards…</button>
        <button type="button" class="btn btn--small" data-tool="shuffle">Shuffle library…</button>
        <button type="button" class="btn btn--small" data-tool="note">Add a log note…</button>
      </div>
      <p class="muted">To change one card (tap, counters, move, control), tap the card on the board.</p>`,
    actions: [{ label: 'Close', kind: 'cancel' }, { label: 'End game…', kind: 'danger', onClick: ({ close }) => { close(); openEndGame(ctx); } }],
    onMount(el, { close }) {
      on(el, 'click', '[data-life]', async (event, b) => { await edit({ kind: 'life', playerId: b.dataset.p, delta: Number(b.dataset.life) }); reopen(close); });
      on(el, 'click', '[data-more]', (event, b) => { close(); openPlayerEdit(ctx, b.dataset.more); });
      on(el, 'click', '[data-tool]', async (event, b) => {
        const tool = b.dataset.tool;
        if (['resolve-top', 'counter-top', 'clear-stack'].includes(tool)) { close(); return edit({ kind: tool }); }
        if (tool === 'phase') return pickOne('Set phase', PHASES, phase => { close(); edit({ kind: 'phase', phase }); });
        if (tool === 'active') return choosePlayer('Whose turn is it?', playerId => { close(); edit({ kind: 'active', playerId }); });
        if (tool === 'shuffle') return choosePlayer('Shuffle whose library?', playerId => { close(); edit({ kind: 'shuffle', playerId }); });
        if (tool === 'draw' || tool === 'mill') return choosePlayer(tool === 'draw' ? 'Who draws?' : 'Who mills?', playerId => pickNumber('How many cards?', 1, count => { close(); edit({ kind: tool, playerId, count }); }, { min: 1, max: 20 }));
        if (tool === 'note') return pickText('Log note', 'What happened?', text => { close(); edit({ kind: 'note', text }); });
        if (tool === 'token') return choosePlayer('Who gets the token?', playerId => openTokenPicker(ctx, playerId, close));
        if (tool === 'add-card') return choosePlayer('Add a card for…', playerId => openAddCard(ctx, playerId, close));
        if (tool === 'rules') return openRulesEdit(ctx, close);
      });
    }
  });
}

function openPlayerEdit(ctx, playerId) {
  const view = ctx.view, p = view.players.find(x => x.playerId === playerId);
  const edit = e => ctx.send({ type: 'edit', edit: e });
  const sources = view.players.filter(o => o.playerId !== playerId).flatMap(o => o.commanders.map(c => ({ ...c, owner: o.name })));
  openModal({
    title: `${p.name} — adjust`,
    body: html`<div class="option-list">
      <button type="button" class="option" data-do="life"><span><strong>Set life total</strong><small>Now ${p.life}</small></span></button>
      <button type="button" class="option" data-do="poison"><span><strong>Poison counters</strong><small>Now ${p.poison}</small></span></button>
      <button type="button" class="option" data-do="counter"><span><strong>Other counter (energy, experience…)</strong><small>${Object.entries(p.counters).map(([k, v]) => `${k} ${v}`).join(', ') || 'None'}</small></span></button>
      ${sources.map(c => html`<button type="button" class="option" data-do="cmd" data-id="${c.id}"><span><strong>Commander damage from ${c.name}</strong><small>${c.owner} • now ${p.commanderDamage[c.id] || 0}</small></span></button>`)}
      ${p.commanders.map(c => html`<button type="button" class="option" data-do="tax" data-id="${c.id}"><span><strong>Commander tax — ${c.name}</strong><small>Now ${c.tax}</small></span></button>`)}
      <button type="button" class="option" data-do="mana"><span><strong>Add floating mana</strong><small>For effects the app does not track</small></span></button>
      <button type="button" class="option" data-do="status"><span><strong>Add / remove a status</strong><small>${p.statuses.join(', ') || 'None'} — monarch, initiative, city’s blessing…</small></span></button>
      <button type="button" class="option" data-do="out"><span><strong>${p.eliminated ? 'Return to the game' : 'Remove from the game'}</strong></span></button>
    </div>`,
    onMount(el, { close }) {
      on(el, 'click', '[data-do]', (event, b) => {
        const what = b.dataset.do;
        const done = () => close();
        if (what === 'life') return pickNumber('Life total', p.life, n => { done(); edit({ kind: 'life', playerId, set: n }); }, { min: 0, max: 999999 });
        if (what === 'poison') return pickNumber('Change poison by', 1, n => { done(); edit({ kind: 'poison', playerId, delta: n }); });
        if (what === 'counter') return pickText('Counter name', 'energy, experience, rad…', name => pickNumber(`Change ${name} by`, 1, n => { done(); edit({ kind: 'player-counter', playerId, counter: name, delta: n }); }));
        if (what === 'cmd') return pickNumber('Change commander damage by', 1, n => { done(); edit({ kind: 'commander-damage', playerId, commanderId: b.dataset.id, delta: n }); });
        if (what === 'tax') return pickNumber('Change tax by', 2, n => { done(); edit({ kind: 'commander-tax', playerId, commanderId: b.dataset.id, delta: n }); });
        if (what === 'mana') return pickOne('Mana color', [['W', 'White'], ['U', 'Blue'], ['B', 'Black'], ['R', 'Red'], ['G', 'Green'], ['C', 'Colorless']], color => pickNumber('How much?', 1, n => { done(); edit({ kind: 'mana', playerId, color, delta: n }); }));
        if (what === 'status') return pickText('Status', 'Monarch', status => { done(); edit({ kind: 'status', playerId, status, enabled: !p.statuses.includes(status) }); });
        if (what === 'out') { done(); return edit({ kind: 'eliminate', playerId, eliminated: !p.eliminated }); }
      });
    }
  });
}

function openTokenPicker(ctx, playerId, closeParent) {
  openModal({
    title: 'Create token',
    body: html`<div class="grid-3">${TOKENS.map(([name, p, t], i) => html`<button type="button" class="option" data-token="${i}"><span><strong>${name}</strong><small>${p === null ? 'Artifact' : `${p}/${t} creature`}</small></span></button>`)}
      <button type="button" class="option" data-token="custom"><span><strong>Custom…</strong><small>Name and size</small></span></button></div>`,
    onMount(el, { close }) {
      on(el, 'click', '[data-token]', (event, b) => {
        const make = (name, power, toughness) => pickNumber('How many?', 1, count => { close(); closeParent?.(); ctx.send({ type: 'edit', edit: { kind: 'token', playerId, name, power, toughness, count } }); }, { min: 1, max: 50 });
        if (b.dataset.token === 'custom') return pickText('Token name', 'Angel', name => pickText('Power/toughness (blank for a non-creature)', '4/4', pt => { const m = pt.match(/(\d+)\s*\/\s*(\d+)/); make(name, m ? Number(m[1]) : null, m ? Number(m[2]) : null); }, '1/1'));
        const [name, p, t] = TOKENS[Number(b.dataset.token)];
        make(name, p, t);
      });
    }
  });
}

/** Search the whole card catalog and add a copy to a player's hand or battlefield. */
export function openAddCard(ctx, playerId, closeParent) {
  let results = [];
  openModal({
    title: 'Add any card', size: 'wide',
    body: html`<div class="row"><input class="input" data-q type="search" placeholder="Card name" autocomplete="off"><button type="button" class="btn" data-go>Search</button></div><div class="option-list" data-results><p class="muted">Search the card catalog by name. Needs an internet connection.</p></div>`,
    onMount(el, { close }) {
      const run = async () => {
        const q = $('[data-q]', el).value.trim();
        if (q.length < 2) return toast('Type at least two letters.');
        setHtml($('[data-results]', el), html`<p class="muted">Searching…</p>`);
        try {
          results = await searchCards(q, { allPrintings: false });
          setHtml($('[data-results]', el), results.length ? results.slice(0, 40).map((d, i) => html`<button type="button" class="option" data-add="${i}"><span><strong>${d.name}</strong><small>${d.typeLine}</small></span></button>`) : html`<p class="muted">No cards found.</p>`);
        } catch {
          setHtml($('[data-results]', el), html`<p class="muted">The card catalog could not be reached. Check the connection and try again.</p>`);
        }
      };
      on(el, 'click', '[data-go]', run);
      $('[data-q]', el).addEventListener('keydown', e => { if (e.key === 'Enter') run(); });
      on(el, 'click', '[data-add]', (event, b) => {
        const definition = results[Number(b.dataset.add)];
        pickOne(`Put ${definition.name} into…`, [['hand', 'Hand'], ['battlefield', 'Battlefield'], ['graveyard', 'Graveyard']], zone => { close(); closeParent?.(); ctx.send({ type: 'edit', edit: { kind: 'add-card', playerId, definition, zone } }); });
      });
    }
  });
}

export function openRulesEdit(ctx, closeParent) {
  let read = null;
  openModal({
    title: 'Table rules', size: 'wide',
    body: rulesEditorHtml(ctx.view.rules),
    actions: [{ label: 'Cancel', kind: 'cancel' }, { label: 'Save rules', kind: 'confirm', onClick: ({ close }) => { close(); closeParent?.(); ctx.send({ type: 'edit', edit: { kind: 'rules', patch: read() } }); } }],
    onMount(el) { read = bindRulesEditor(el, ctx.view.rules); }
  });
}

export function openEndGame(ctx) {
  const view = ctx.view;
  pickOne('End the game — who won?', [...view.players.filter(p => !p.eliminated).map(p => [p.playerId, `${p.name} wins`]), ['', 'No winner (stop the game)']], async winnerId => {
    const ok = await confirmDialog({ title: 'End game', message: 'End this game for everyone? This cannot be continued afterwards.', confirmLabel: 'End game', danger: true });
    if (ok) ctx.send({ type: 'end-game', winnerId: winnerId || null });
  });
}
