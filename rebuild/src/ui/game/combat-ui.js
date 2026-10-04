// Declare attackers and declare blockers.

import { html, on, $, setHtml } from '../dom.js';
import { openModal } from '../modal.js';
import { toast } from '../toast.js';
import { cardHtml } from '../card-view.js';

export function openAttack(ctx) {
  const view = ctx.view;
  const me = view.players.find(p => p.playerId === view.you);
  const rows = view.actions.attack || [];
  if (!me || !rows.length) return toast('None of your creatures can attack right now.');
  const opponents = view.players.filter(p => p.playerId !== me.playerId && !p.eliminated);
  const draft = new Map(); // instanceId → defenderId
  const draw = el => {
    setHtml($('[data-attackers]', el), rows.map(r => {
      const c = me.battlefield.find(x => x.id === r.instanceId);
      const target = draft.get(r.instanceId);
      return html`<div class="combat-row ${target ? 'is-on' : ''}">
        ${cardHtml(c, view.defs[c.def], { act: 'peek', cls: 'card--thumb' })}
        <span class="pick__text"><strong>${c.name}</strong><small>${c.power}/${c.toughness}${target ? ` → attacks ${opponents.find(o => o.playerId === target)?.name}` : ' — staying home'}</small></span>
        <span class="combat-row__targets">
          ${opponents.filter(o => r.defenders.includes(o.playerId)).map(o => html`<button type="button" class="chip ${target === o.playerId ? 'chip--gold is-on' : ''}" data-attacker="${r.instanceId}" data-defender="${o.playerId}" style="--player:${o.color}">${o.name} <b>${o.life}</b></button>`)}
        </span>
      </div>`;
    }));
    $('#attackConfirm', el).textContent = draft.size ? `Attack with ${draft.size}` : 'Choose attackers';
    $('#attackConfirm', el).disabled = !draft.size;
  };
  openModal({
    title: 'Declare attackers', size: 'wide',
    body: html`<div class="decision">
      <p class="decision__prompt">Tap the opponent each creature should attack. Nothing happens until you confirm.</p>
      <div class="row">${opponents.map(o => html`<button type="button" class="btn btn--small" data-all="${o.playerId}">All → ${o.name}</button>`)}<button type="button" class="btn btn--small" data-all="">Clear</button></div>
      <div class="combat-list" data-attackers></div></div>`,
    actions: [
      { label: 'Cancel', kind: 'cancel' },
      { label: 'Attack', kind: 'confirm', id: 'attackConfirm', onClick: async ({ close }) => {
        const result = await ctx.send({ type: 'attack', attacks: [...draft].map(([instanceId, defenderId]) => ({ instanceId, defenderId })) });
        if (result.ok) close();
      } }
    ],
    onMount(el) {
      draw(el);
      on(el, 'click', '[data-attacker]', (event, b) => {
        const id = b.dataset.attacker, to = b.dataset.defender;
        if (draft.get(id) === to) draft.delete(id); else draft.set(id, to);
        draw(el);
      });
      on(el, 'click', '[data-all]', (event, b) => {
        draft.clear();
        if (b.dataset.all) for (const r of rows) if (r.defenders.includes(b.dataset.all)) draft.set(r.instanceId, b.dataset.all);
        draw(el);
      });
    }
  });
}

export function openBlocks(ctx, rows, { minimize } = {}) {
  const view = ctx.view;
  const me = view.players.find(p => p.playerId === view.you);
  const all = view.players.flatMap(p => p.battlefield);
  let assignments = []; // { attackerId, blockerId }
  const used = id => assignments.filter(a => a.blockerId === id).length;
  const draw = el => {
    setHtml($('[data-blocks]', el), rows.map(r => {
      const attacker = all.find(c => c.id === r.attackerId);
      const mine = assignments.filter(a => a.attackerId === r.attackerId);
      return html`<section class="block-row">
        <div class="block-row__attacker">
          ${attacker ? cardHtml(attacker, view.defs[attacker.def], { act: 'peek', cls: 'card--thumb' }) : ''}
          <span class="pick__text"><strong>${r.attackerName}</strong><small>${attacker ? `${attacker.power}/${attacker.toughness} attacking you` : ''}${mine.length ? '' : ' — unblocked'}</small></span>
        </div>
        <div class="block-row__blockers">
          ${r.blockers.length ? r.blockers.map(b => {
            const c = me.battlefield.find(x => x.id === b.instanceId);
            const on = mine.some(a => a.blockerId === b.instanceId);
            const busy = !on && used(b.instanceId) >= b.capacity;
            return html`<button type="button" class="chip ${on ? 'chip--gold is-on' : ''}" data-block="${b.instanceId}" data-attacker="${r.attackerId}" ${busy ? html`disabled` : ''}>${c?.name || 'Creature'} ${c ? `${c.power}/${c.toughness}` : ''}</button>`;
          }) : html`<span class="muted">None of your creatures can block this.</span>`}
        </div>
      </section>`;
    }));
    $('#blockConfirm', el).textContent = assignments.length ? `Confirm ${assignments.length} block${assignments.length === 1 ? '' : 's'}` : 'No blocks';
  };
  const modal = openModal({
    title: 'Declare blockers', size: 'wide', dismissible: false,
    body: html`<div class="decision"><p class="decision__prompt">Choose which of your creatures block each attacker. Unblocked attackers deal their damage to you.</p><div class="combat-list" data-blocks></div></div>`,
    actions: [
      ...(minimize ? [{ label: 'View board', kind: 'plain', onClick: () => minimize() }] : []),
      { label: 'No blocks', kind: 'confirm', id: 'blockConfirm', onClick: async ({ close }) => {
        const result = await ctx.send({ type: 'block', assignments });
        if (result.ok) close();
      } }
    ],
    onMount(el) {
      draw(el);
      on(el, 'click', '[data-block]', (event, b) => {
        const row = { attackerId: b.dataset.attacker, blockerId: b.dataset.block };
        const i = assignments.findIndex(a => a.attackerId === row.attackerId && a.blockerId === row.blockerId);
        if (i >= 0) assignments.splice(i, 1); else assignments.push(row);
        draw(el);
      });
    }
  });
  return modal.close;
}
