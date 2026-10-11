// Popups for looking at cards: one card, a zone, another player's board, the whole table.

import { html, on, $ } from '../dom.js';
import { openModal } from '../modal.js';
import { toast } from '../toast.js';
import { cardHtml, cardDetailHtml, cardBackHtml, manaPoolHtml, oracleHtml } from '../card-view.js';

const ZONE_LABEL = { hand: 'hand', battlefield: 'battlefield', graveyard: 'graveyard', exile: 'exile', command: 'command zone' };

export function findCardInView(view, id) {
  for (const p of view.players) {
    for (const zone of ['hand', 'battlefield', 'graveyard', 'exile', 'command']) {
      const card = (p[zone] || []).find(c => c.id === id);
      if (card) return { card, zone, player: p };
    }
  }
  return null;
}

export function openCardDetail(ctx, id) {
  const view = ctx.view;
  const hit = findCardInView(view, id);
  if (!hit) return;
  const { card, zone, player } = hit;
  const def = view.defs[card.def];
  const mine = !!view.you && (zone === 'battlefield' ? card.controller === view.you : player.playerId === view.you);
  const playableZone = zone === 'hand' || zone === 'command';
  const isLand = /\bLand\b/i.test(def?.typeLine || '') && !(def?.cardFaces?.length > 1);
  const others = view.players.filter(p => !p.eliminated);

  const status = [];
  if (zone === 'battlefield') {
    if (card.tapped) status.push('Tapped');
    if (card.sick) status.push('Summoning sick — cannot attack or use {T} abilities this turn');
    if (card.attacking) status.push(`Attacking ${view.players.find(p => p.playerId === card.attacking)?.name || ''}`);
    if (card.blocking) status.push('Blocking');
    if (card.power !== null) status.push(`Currently ${card.power}/${card.toughness}${card.damage ? ` with ${card.damage} damage` : ''}`);
    for (const [k, v] of Object.entries(card.counters || {})) if (v) status.push(`${v} ${k} counter${v === 1 ? '' : 's'}`);
    if (card.chosen) status.push(`Chosen: ${card.chosen}`);
    if (card.controller !== card.owner) status.push(`Owned by ${view.players.find(p => p.playerId === card.owner)?.name || 'another player'}`);
  }

  const abilities = mine ? (card.abilities || []) : [];
  const extra = html`
    ${status.length ? html`<p class="card-detail__status">${status.join(' • ')}</p>` : ''}
    ${mine && playableZone && !card.playable && card.reason ? html`<p class="card-detail__why"><b>Not right now:</b> ${card.reason}</p>` : ''}
    ${abilities.length ? html`<div class="ability-list">${abilities.map(a => html`
      <button type="button" class="option ${a.legal ? 'is-on' : ''}" data-ability="${a.id}" data-legal="${a.legal ? '1' : ''}">
        <span><strong>${oracleHtml(a.text)}</strong>${a.legal ? '' : html`<small>${a.reason || 'Not available right now'}</small>`}</span>
        <span class="option__end">${a.legal ? 'Use' : view.canForce ? 'Force' : ''}</span>
      </button>`)}</div>` : ''}
    ${view.canEdit ? html`<div class="edit-tools">
      <h4 class="section-title">${view.mode === 'freeplay' ? 'Edit' : 'Host tools'}</h4>
      <div class="row row--wrap">
        ${zone === 'battlefield' ? html`
          <button type="button" class="btn btn--small" data-edit="tap">${card.tapped ? 'Untap' : 'Tap'}</button>
          <button type="button" class="btn btn--small" data-edit="counter" data-counter="+1/+1" data-delta="1">+1/+1 ＋</button>
          <button type="button" class="btn btn--small" data-edit="counter" data-counter="+1/+1" data-delta="-1">+1/+1 －</button>
          <button type="button" class="btn btn--small" data-edit="counter-other">Other counter…</button>
          <button type="button" class="btn btn--small" data-edit="control">Give control…</button>
          <button type="button" class="btn btn--small" data-edit="attach">Attach…</button>` : ''}
        <button type="button" class="btn btn--small" data-edit="move">Move to…</button>
      </div></div>` : ''}`;

  const actions = [];
  if (mine && playableZone) {
    const label = isLand ? 'Play land' : zone === 'command' ? 'Cast commander' : 'Cast';
    if (card.playable) actions.push({ label, kind: 'confirm', onClick: async ({ close }) => { close(); await ctx.send({ type: 'play', instanceId: id }); } });
    else if (view.canForce) actions.push({ label: 'Play anyway', kind: 'danger', onClick: async ({ close }) => { close(); await ctx.send({ type: 'play', instanceId: id, force: true }); } });
    else if (view.deviceMode === 'multi-device' && view.players.length > 1 && view.stage === 'play') actions.push({ label: 'Ask the table', kind: 'plain', onClick: async ({ close }) => { close(); const r = await ctx.send({ type: 'vote-request', label: `playing ${card.name}`, reason: card.reason, intent: { type: 'play', instanceId: id } }); if (r.ok) toast('The table is voting.'); } });
  }

  openModal({
    title: `${card.name}${zone !== 'battlefield' ? ` — ${player.name}'s ${ZONE_LABEL[zone]}` : ''}`, size: 'wide',
    body: cardDetailHtml(def, card.face, extra),
    actions: [{ label: 'Close', kind: 'cancel' }, ...actions],
    onMount(el, { close }) {
      on(el, 'click', '[data-ability]', async (event, b) => {
        const legal = !!b.dataset.legal;
        if (!legal && !view.canForce) return toast(b.querySelector('small')?.textContent || 'That ability cannot be used right now.');
        close();
        await ctx.send({ type: 'activate', instanceId: id, abilityId: b.dataset.ability, force: !legal });
      });
      on(el, 'click', '[data-edit]', async (event, b) => {
        const kind = b.dataset.edit;
        if (kind === 'tap') { close(); return ctx.send({ type: 'edit', edit: { kind: 'tap', instanceId: id } }); }
        if (kind === 'counter') { await ctx.send({ type: 'edit', edit: { kind: 'card-counter', instanceId: id, counter: b.dataset.counter, delta: Number(b.dataset.delta) } }); close(); return openCardDetail(ctx, id); }
        if (kind === 'counter-other') {
          return pickText('Counter name', 'loyalty, charge, -1/-1, shield…', name => pickNumber(`${name} counters to add (negative removes)`, 1, async n => {
            await ctx.send({ type: 'edit', edit: { kind: 'card-counter', instanceId: id, counter: name, delta: n } }); close(); openCardDetail(ctx, id);
          }));
        }
        if (kind === 'move') {
          return pickOne('Move to…', [['hand', "Owner's hand"], ['battlefield', 'Battlefield'], ['graveyard', 'Graveyard'], ['exile', 'Exile'], ['library-top', 'Top of library'], ['library-bottom', 'Bottom of library'], ['command', 'Command zone']].filter(([z]) => z !== zone),
            async to => { close(); await ctx.send({ type: 'edit', edit: { kind: 'move', instanceId: id, to } }); });
        }
        if (kind === 'control') return pickOne('Give control to…', others.map(p => [p.playerId, p.name]), async playerId => { close(); await ctx.send({ type: 'edit', edit: { kind: 'control', instanceId: id, playerId } }); });
        if (kind === 'attach') {
          const targets = view.players.flatMap(p => p.battlefield.filter(c => c.id !== id).map(c => [c.id, `${c.name} — ${p.name}`]));
          return pickOne('Attach to…', [['', 'Nothing (unattach)'], ...targets], async targetId => { close(); await ctx.send({ type: 'edit', edit: { kind: 'attach', instanceId: id, targetId: targetId || null } }); });
        }
      });
    }
  });
}

export function pickOne(title, rows, onPick) {
  openModal({
    title, size: 'small',
    body: html`<div class="option-list">${rows.map(([id, label, sub]) => html`<button type="button" class="option" data-choice="${id}"><span><strong>${label}</strong>${sub ? html`<small>${sub}</small>` : ''}</span></button>`)}</div>`,
    onMount(el, { close }) { on(el, 'click', '[data-choice]', (event, b) => { close(); onPick(b.dataset.choice); }); }
  });
}

export function pickText(title, placeholder, onDone, initial = '') {
  openModal({
    title, size: 'small',
    body: html`<input class="input" data-text placeholder="${placeholder}" value="${initial}" autocomplete="off">`,
    actions: [{ label: 'Cancel', kind: 'cancel' }, { label: 'OK', kind: 'confirm', onClick: ({ close, el }) => { const v = $('[data-text]', el).value.trim(); if (!v) return toast('Type something first.'); close(); onDone(v); } }]
  });
}

export function pickNumber(title, initial, onDone, { min = -999, max = 999 } = {}) {
  let value = initial;
  openModal({
    title, size: 'small',
    body: html`<div class="stepper stepper--big"><button type="button" class="icon-btn" data-step="-5">−5</button><button type="button" class="icon-btn" data-step="-1">−</button><b class="stepper__value" data-value>${value}</b><button type="button" class="icon-btn" data-step="1">+</button><button type="button" class="icon-btn" data-step="5">+5</button></div>`,
    actions: [{ label: 'Cancel', kind: 'cancel' }, { label: 'OK', kind: 'confirm', onClick: ({ close }) => { close(); onDone(value); } }],
    onMount(el) { on(el, 'click', '[data-step]', (event, b) => { value = Math.max(min, Math.min(max, value + Number(b.dataset.step))); $('[data-value]', el).textContent = value; }); }
  });
}

function cardsGrid(view, cards, zone) {
  return cards.length
    ? html`<div class="card-grid">${cards.map(c => cardHtml(c, view.defs[c.def], { act: 'open-card', zone }))}</div>`
    : html`<p class="muted">Nothing here.</p>`;
}

function bindOpen(ctx, el, close) {
  on(el, 'click', '[data-act="open-card"]', (event, b) => { close(); openCardDetail(ctx, b.dataset.id); });
}

export function openZone(ctx, playerId, zone) {
  const view = ctx.view;
  const p = view.players.find(x => x.playerId === playerId);
  if (!p) return;
  const cards = zone === 'tokens' ? p.battlefield.filter(c => c.token)
    : zone === 'attachments' ? p.battlefield.filter(c => c.attachedTo || c.attachments?.length)
    : [...(p[zone] || [])].reverse();
  openModal({
    title: `${p.name} — ${zone} (${cards.length})`, size: 'wide',
    body: cardsGrid(view, cards, zone),
    onMount(el, { close }) { bindOpen(ctx, el, close); }
  });
}

function boardHtml(view, p) {
  const lands = p.battlefield.filter(c => c.land), perms = p.battlefield.filter(c => !c.land);
  return html`
    <div class="board__head" style="--player:${p.color}">
      <strong>${p.name}</strong><span class="chip">♥ ${p.life}</span><span class="chip">✋ ${p.handCount}</span><span class="chip">▤ ${p.libraryCount}</span>
      ${p.poison ? html`<span class="chip chip--bad">☠ ${p.poison}</span>` : ''}
      ${p.commanders.map(c => html`<span class="chip chip--gold">${c.name} • ${c.zone === 'command' ? `command zone, tax ${c.tax}` : c.zone}</span>`)}
      ${manaPoolHtml(p.mana, { compact: true })}
    </div>
    <h4 class="section-title">Battlefield</h4>${cardsGrid(view, perms, 'battlefield')}
    <h4 class="section-title">Lands (${lands.length})</h4>${cardsGrid(view, lands, 'battlefield')}`;
}

export function openPlayerBoard(ctx, playerId, { onFocus = null } = {}) {
  const view = ctx.view;
  const p = view.players.find(x => x.playerId === playerId);
  if (!p) return;
  const local = ctx.session.role === 'local';
  openModal({
    title: p.name, size: 'full',
    body: html`<div class="board">${boardHtml(view, p)}
      <div class="row row--wrap">
        <button type="button" class="btn btn--small" data-zone="graveyard">Graveyard (${p.graveyard.length})</button>
        <button type="button" class="btn btn--small" data-zone="exile">Exile (${p.exile.length})</button>
        <button type="button" class="btn btn--small" data-zone="command">Command zone (${p.command.length})</button>
      </div></div>`,
    actions: [
      { label: 'Close', kind: 'cancel' },
      ...(onFocus ? [{ label: 'Show on main view', kind: 'plain', onClick: ({ close }) => { close(); onFocus(playerId); } }] : []),
      ...(local && !p.eliminated ? [{ label: `Act as ${p.name}`, kind: 'plain', onClick: ({ close }) => { close(); ctx.session.actAs(playerId); } }] : [])
    ],
    onMount(el, { close }) {
      bindOpen(ctx, el, close);
      on(el, 'click', '[data-zone]', (event, b) => openZone(ctx, playerId, b.dataset.zone));
    }
  });
}

/** Every battlefield at once — the tabletop / judge overview. */
export function tableHtml(view) {
  return html`<div class="table-view" data-count="${view.players.length}">${view.players.map(p => html`
    <section class="table-view__seat ${p.playerId === view.activePlayerId ? 'is-active' : ''} ${p.eliminated ? 'is-out' : ''}">${boardHtml(view, p)}
      ${p.hand ? '' : html`<div class="hand-backs">${Array.from({ length: Math.min(p.handCount, 10) }, () => cardBackHtml())}</div>`}
    </section>`)}</div>`;
}

export function openTable(ctx) {
  const view = ctx.view;
  openModal({
    title: `Table — turn ${view.turn}, ${view.phaseLabel}`, size: 'full',
    body: tableHtml(view),
    onMount(el, { close }) { bindOpen(ctx, el, close); }
  });
}
