// One modal layer for the whole app. Opening a modal while another is open stacks it;
// closing returns to the one underneath.
//
// Contract: Back, Close and Cancel never change game state. Only an action the caller
// marked kind:'confirm' (or 'danger') runs a committing handler.

import { html, raw, setHtml, $ } from './dom.js';

const stack = [];

function layer() {
  return document.getElementById('modalLayer');
}

/**
 * @param {object} options
 * @param {string} options.title
 * @param {*} options.body            html`` markup or string
 * @param {Array} [options.actions]   [{ label, kind: 'confirm'|'cancel'|'danger'|'plain', onClick, disabled, id }]
 * @param {Function} [options.onMount] called with the modal element after render
 * @param {Function} [options.onClose] called when dismissed without an action
 * @param {boolean} [options.dismissible=true] whether Back / backdrop closes it
 * @param {string} [options.size] 'small' | 'wide' | 'full'
 */
export function openModal({ title = '', body = '', actions = [], onMount, onClose, dismissible = true, size = '' } = {}) {
  const el = document.createElement('section');
  el.className = `modal${size ? ` modal--${size}` : ''}`;
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-modal', 'true');
  el.setAttribute('aria-label', title);
  setHtml(el, html`
    <div class="modal__panel">
      <header class="modal__head">
        ${dismissible ? raw('<button class="btn-back" type="button" data-modal-back aria-label="Back"><img src="assets/img/ui/back.png" alt="Back"></button>') : ''}
        <h2 class="chrome-text">${title}</h2>
      </header>
      <div class="modal__body">${body}</div>
      <footer class="modal__foot" ${actions.length ? '' : raw('hidden')}></footer>
    </div>`);

  const entry = { el, onClose, dismissible };
  const close = () => {
    const index = stack.indexOf(entry);
    if (index < 0) return;
    stack.splice(index, 1);
    el.remove();
    syncLayer();
  };
  entry.close = close;

  const foot = $('.modal__foot', el);
  // Cancel-type actions sit on the left, the committing action on the right.
  const ordered = [...actions.filter(a => a.kind === 'cancel'), ...actions.filter(a => a.kind !== 'cancel')];
  for (const action of ordered) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `btn btn--${action.kind || 'plain'}`;
    button.textContent = action.label;
    button.disabled = !!action.disabled;
    if (action.id) button.id = action.id;
    button.addEventListener('click', () => {
      if (action.onClick) action.onClick({ close, el, button });
      else close();
    });
    foot.appendChild(button);
  }

  el.addEventListener('click', event => {
    const target = event.target;
    const back = target instanceof Element && target.closest('[data-modal-back]');
    if (back || (target === el && dismissible)) {
      close();
      onClose?.();
    }
  });

  stack.push(entry);
  layer().appendChild(el);
  syncLayer();
  onMount?.(el, { close });
  return { el, close };
}

function syncLayer() {
  const host = layer();
  host.hidden = stack.length === 0;
  stack.forEach((entry, i) => entry.el.classList.toggle('is-under', i < stack.length - 1));
  document.body.classList.toggle('has-modal', stack.length > 0);
}

export function closeAllModals() {
  while (stack.length) stack[stack.length - 1].close();
}

export function modalOpen() {
  return stack.length > 0;
}

/** Yes/no question. Resolves true only when the confirming button is pressed. */
export function confirmDialog({ title, message, confirmLabel = 'Confirm', cancelLabel = 'Cancel', danger = false }) {
  return new Promise(resolve => {
    openModal({
      title,
      size: 'small',
      body: html`<p class="modal__message">${message}</p>`,
      onClose: () => resolve(false),
      actions: [
        { label: cancelLabel, kind: 'cancel', onClick: ({ close }) => { close(); resolve(false); } },
        { label: confirmLabel, kind: danger ? 'danger' : 'confirm', onClick: ({ close }) => { close(); resolve(true); } }
      ]
    });
  });
}
