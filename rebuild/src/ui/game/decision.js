// Shows one decision from the game (pick a target, choose modes, pick a number, arrange cards…)
// and sends the answer back. Returns a function that closes the popup.

import { html, on, $, $$, setHtml } from '../dom.js';
import { openModal } from '../modal.js';
import { toast } from '../toast.js';
import { cardHtml } from '../card-view.js';

function optionRow(ctx, o, { multi = false, picked = false } = {}) {
  const def = o.definitionId ? ctx.def(o.definitionId) : null;
  const thumb = def ? cardHtml({ id: o.id, name: o.label, face: o.faceIndex ?? null, counters: {} }, def, { act: 'peek', cls: 'card--thumb' }) : '';
  return html`<div class="pick ${picked ? 'is-on' : ''} ${o.disabled ? 'is-disabled' : ''}" data-pick="${String(o.id)}" role="button" tabindex="0">
    ${thumb}
    ${o.mana ? html`<img class="pick__mana" src="assets/img/mana/${o.mana}.png" alt="">` : ''}
    <span class="pick__text"><strong>${o.label}</strong>${o.sub ? html`<small>${o.sub}</small>` : ''}</span>
    ${multi ? html`<i class="pick__check"></i>` : ''}
  </div>`;
}

export function openDecision(ctx, d, { minimize } = {}) {
  const answer = async (value, close) => {
    const result = await ctx.send({ type: 'answer', key: d.key, value }, { quiet: true });
    if (!result.ok) toast(result.error || 'That choice is not allowed.', { bad: true });
    else close();
  };
  const cancelAction = d.cancellable !== false
    ? [{ label: 'Cancel', kind: 'cancel', onClick: async ({ close }) => { await ctx.send({ type: 'cancel' }); close(); } }]
    : [];
  const boardAction = minimize ? [{ label: 'View board', kind: 'plain', onClick: () => minimize() }] : [];
  const typed = id => { const o = (d.options || []).find(x => String(x.id) === id); return o ? o.id : id; };
  const promptHtml = html`<p class="decision__prompt">${d.prompt || ''}</p>`;
  const search = d.searchable && (d.options || []).length > 8 ? html`<input class="input" type="search" placeholder="Filter…" data-filter autocomplete="off">` : '';
  const bindFilter = el => {
    const input = $('[data-filter]', el);
    if (!input) return;
    input.addEventListener('input', () => {
      const q = input.value.trim().toLowerCase();
      for (const row of $$('[data-pick]', el)) row.hidden = !!q && !row.textContent.toLowerCase().includes(q);
    });
  };
  let modal;

  if (d.kind === 'choose-one') {
    modal = openModal({
      title: d.title || 'Choose', dismissible: false, size: (d.options || []).length > 6 ? 'wide' : '',
      body: html`<div class="decision">${promptHtml}${search}<div class="pick-list ${(d.options || []).some(o => o.definitionId) ? 'pick-list--cards' : ''}">${(d.options || []).map(o => optionRow(ctx, o))}</div></div>`,
      actions: [...cancelAction, ...boardAction, ...(d.allowNone ? [{ label: d.noneLabel || 'None', kind: 'plain', onClick: ({ close }) => answer(null, close) }] : [])],
      onMount(el, { close }) {
        bindFilter(el);
        on(el, 'click', '[data-pick]', (event, row) => {
          if (row.classList.contains('is-disabled')) return toast('That option is not available right now.');
          answer(typed(row.dataset.pick), close);
        });
      }
    });
  } else if (d.kind === 'choose-many') {
    const picked = new Set();
    const min = Number(d.min || 0), max = Number(d.max ?? (d.options || []).length);
    modal = openModal({
      title: d.title || 'Choose', dismissible: false, size: 'wide',
      body: html`<div class="decision">${promptHtml}<p class="decision__count" data-count></p>${search}<div class="pick-list ${(d.options || []).some(o => o.definitionId) ? 'pick-list--cards' : ''}">${(d.options || []).map(o => optionRow(ctx, o, { multi: true }))}</div></div>`,
      actions: [...cancelAction, ...boardAction, { label: 'Confirm', kind: 'confirm', id: 'decisionConfirm', onClick: ({ close }) => answer([...picked].map(typed), close) }],
      onMount(el) {
        bindFilter(el);
        const sync = () => {
          $('[data-count]', el).textContent = min === max ? `Selected ${picked.size} of ${max}` : `Selected ${picked.size} (choose ${min} to ${max})`;
          $('#decisionConfirm', el).disabled = picked.size < min || picked.size > max;
        };
        on(el, 'click', '[data-pick]', (event, row) => {
          const id = row.dataset.pick;
          if (picked.has(id)) picked.delete(id);
          else {
            if (picked.size >= max && max === 1) { picked.clear(); for (const r of $$('.pick.is-on', el)) r.classList.remove('is-on'); }
            if (picked.size >= max) return toast(`You can choose at most ${max}.`);
            picked.add(id);
          }
          row.classList.toggle('is-on', picked.has(id));
          sync();
        });
        sync();
      }
    });
  } else if (d.kind === 'number') {
    let value = Math.max(Number(d.min || 0), 0);
    modal = openModal({
      title: d.title || 'Choose a number', dismissible: false, size: 'small',
      body: html`<div class="decision">${promptHtml}<div class="stepper stepper--big"><button type="button" class="icon-btn" data-step="-1">−</button><b class="stepper__value" data-value>${value}</b><button type="button" class="icon-btn" data-step="1">+</button></div><p class="muted">Between ${d.min || 0} and ${d.max ?? 99}.</p></div>`,
      actions: [...cancelAction, { label: 'Confirm', kind: 'confirm', onClick: ({ close }) => answer(value, close) }],
      onMount(el) {
        on(el, 'click', '[data-step]', (event, b) => {
          value = Math.max(Number(d.min || 0), Math.min(Number(d.max ?? 99), value + Number(b.dataset.step)));
          $('[data-value]', el).textContent = value;
        });
      }
    });
  } else if (d.kind === 'text') {
    modal = openModal({
      title: d.title || 'Choose', dismissible: false, size: 'small',
      body: html`<div class="decision">${promptHtml}<input class="input" data-text list="decisionSuggestions" autocomplete="off" placeholder="Type to search">
        <datalist id="decisionSuggestions">${(d.suggestions || []).map(s => html`<option value="${s}"></option>`)}</datalist></div>`,
      actions: [...cancelAction, { label: 'Confirm', kind: 'confirm', onClick: ({ close, el }) => answer($('[data-text]', el).value, close) }]
    });
  } else if (d.kind === 'confirm') {
    modal = openModal({
      title: d.title || 'Confirm', dismissible: false, size: 'small',
      body: html`<div class="decision"><p class="decision__prompt decision__prompt--pre">${d.prompt || ''}</p></div>`,
      actions: [...boardAction, { label: d.noLabel || 'No', kind: 'cancel', onClick: ({ close }) => answer(false, close) }, { label: d.yesLabel || 'Yes', kind: 'confirm', onClick: ({ close }) => answer(true, close) }]
    });
  } else if (d.kind === 'arrange') {
    // Each card is kept on top (in the order shown) or sent to the other pile.
    let top = (d.cards || []).map(c => c.id), other = [];
    const draw = el => {
      const row = (id, where, i) => {
        const c = d.cards.find(x => x.id === id), def = ctx.def(c.definitionId);
        return html`<div class="arrange__row">
          ${def ? cardHtml({ id, name: c.label, counters: {} }, def, { act: 'peek', cls: 'card--thumb' }) : ''}
          <span class="pick__text"><strong>${c.label}</strong><small>${where === 'top' ? `Top — position ${i + 1}` : d.otherLabel}</small></span>
          ${where === 'top' && top.length > 1 ? html`<button type="button" class="icon-btn" data-move="up" data-id="${id}">↑</button>` : ''}
          <button type="button" class="btn btn--small" data-move="${where === 'top' ? 'other' : 'top'}" data-id="${id}">${where === 'top' ? d.otherLabel : 'Keep on top'}</button>
        </div>`;
      };
      setHtml($('[data-arrange]', el), html`${top.map((id, i) => row(id, 'top', i))}${other.map((id, i) => row(id, 'other', i))}`);
    };
    modal = openModal({
      title: d.title || 'Arrange', dismissible: false, size: 'wide',
      body: html`<div class="decision">${promptHtml}<div class="arrange" data-arrange></div></div>`,
      actions: [{ label: 'Confirm', kind: 'confirm', onClick: ({ close }) => answer({ top, other }, close) }],
      onMount(el) {
        draw(el);
        on(el, 'click', '[data-move]', (event, b) => {
          const id = b.dataset.id;
          if (b.dataset.move === 'up') { const i = top.indexOf(id); if (i > 0) [top[i - 1], top[i]] = [top[i], top[i - 1]]; }
          else if (b.dataset.move === 'other') { top = top.filter(x => x !== id); other.push(id); }
          else { other = other.filter(x => x !== id); top.push(id); }
          draw(el);
        });
      }
    });
  } else {
    modal = openModal({ title: d.title || 'Choice', body: promptHtml, actions: cancelAction, dismissible: false });
  }
  return modal.close;
}
