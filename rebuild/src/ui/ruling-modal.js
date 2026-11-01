// Owner rulings: save how a card resolves, with the dev PIN, for everyone (build 48). Opened from the resolve-by-hand
// panel ("Store outcome") and from any card's detail view ("Correct ruling"), so a wrong result can be fixed mid-game.

import { html } from './dom.js';
import { openModal } from './modal.js';
import { toast } from './toast.js';
import { saveOutcome, storedOutcomes } from '../net/outcomes.js';

/** card: the card's name; oracle: its rules text; steps: what was done by hand (one line each). */
export function openStoreOutcome({ card, oracle = '', steps = [], override = null } = {}) {
  const existing = storedOutcomes()[card] || null;
  const lines = (steps.length ? steps : existing?.steps || []).join('\n');
  openModal({
    title: `Owner ruling — ${card}`, size: 'wide',
    body: html`
      <p class="muted">Saved for everyone using the app, straight away. Needs your dev PIN.</p>
      ${existing ? html`<p class="card-detail__status"><b>Current ruling</b> (${existing.updatedAt?.slice(0, 10) || ''}): ${existing.ruling || '—'}${existing.override ? ' • resolves by hand' : ''}</p>` : ''}
      <label class="field-label">How this card resolves
        <textarea class="field" id="rulingText" rows="4" style="width:100%">${existing?.ruling || ''}</textarea></label>
      <label class="field-label">Steps (one per line)
        <textarea class="field" id="rulingSteps" rows="4" style="width:100%;font-family:monospace;font-size:12px">${lines}</textarea></label>
      <label class="option"><span><strong>Turn off this card's automation</strong><small>Always resolve it by hand with this ruling (use this when the app gets it wrong).</small></span>
        <input type="checkbox" id="rulingOverride" ${(override ?? existing?.override) ? 'checked' : ''}></label>
      <input class="field" id="rulingPin" type="password" inputmode="numeric" autocomplete="off" maxlength="8" placeholder="Dev PIN">
      <p class="muted" id="rulingStatus"></p>`,
    actions: [
      { label: 'Cancel', kind: 'cancel' },
      ...(existing ? [{ label: 'Remove ruling', kind: 'danger', onClick: async ({ close, el }) => send(el, close, { card, remove: true }) }] : []),
      { label: 'Save ruling', kind: 'confirm', onClick: async ({ close, el }) => send(el, close, {
        card, oracle, ruling: el.querySelector('#rulingText').value.trim(),
        steps: el.querySelector('#rulingSteps').value.split('\n').map(x => x.trim()).filter(Boolean),
        override: el.querySelector('#rulingOverride').checked
      }) }
    ]
  });
}

async function send(el, close, rec) {
  const pin = el.querySelector('#rulingPin').value.trim(), status = el.querySelector('#rulingStatus');
  if (!/^\d{4,8}$/.test(pin)) { status.textContent = 'Enter your dev PIN (4 to 8 digits).'; return; }
  if (!rec.remove && !rec.ruling && !rec.steps?.length) { status.textContent = 'Write the ruling or the steps first.'; return; }
  status.textContent = 'Saving…';
  try {
    const r = await saveOutcome(pin, rec);
    if (r.status === 428) { status.textContent = 'Set your dev PIN first: Settings → Dev report.'; return; }
    if (r.status !== 200) { status.textContent = r.error || 'Could not save.'; return; }
    toast(rec.remove ? `Ruling for ${rec.card} removed.` : `Ruling for ${rec.card} saved for everyone.`);
    close();
  } catch { status.textContent = 'No connection. Try again when you are online.'; }
}
