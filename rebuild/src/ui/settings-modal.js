// Device settings. Game-specific rules live on the Rules page of each game.

import { html, on } from './dom.js';
import { openModal } from './modal.js';
import { loadSettings, saveSettings } from '../data/store.js';
import { VERSION, BUILD_DATE } from '../version.js';
import { devReport, reportText } from '../net/corrections.js';
import { toast } from './toast.js';
import { backupSectionHtml, bindBackupSection } from './backup-section.js';

const GUIDANCE = [
  ['coach', 'Coach', 'Explains each step, highlights what you can play and suggests a next move.'],
  ['assist', 'Assist', 'Highlights legal plays and explains why something is not allowed.'],
  ['rules', 'Rules only', 'Blocks illegal plays with a short reason. No hints.']
];

export function openSettings() {
  const settings = loadSettings();
  openModal({
    title: 'Settings',
    body: html`
      <h3 class="section-title">Guidance level (Guided games)</h3>
      <div class="option-list" id="guidanceOptions">
        ${GUIDANCE.map(([id, label, text]) => html`
          <button type="button" class="option ${settings.guidance === id ? 'is-on' : ''}" data-guidance="${id}">
            <span><strong>${label}</strong><small>${text}</small></span>
          </button>`)}
      </div>
      <h3 class="section-title">Preferences</h3>
      <div class="option-list">
        <button type="button" class="option ${settings.tips ? 'is-on' : ''}" data-toggle="tips">
          <span><strong>Learning tips</strong><small>Short explanations of phases and keywords as they come up.</small></span>
          <span class="option__end">${settings.tips ? 'On' : 'Off'}</span>
        </button>
      </div>
      <h3 class="section-title">Help improve the rules</h3>
      <div class="option-list">
        <button type="button" class="option ${settings.sendCorrections !== false ? 'is-on' : ''}" data-toggle="sendCorrections">
          <span><strong>Send rule corrections</strong><small>When a card has to be resolved by hand or a play is corrected, send the card and what was done (no names, decks or hands) so it can be automated.</small></span>
          <span class="option__end">${settings.sendCorrections !== false ? 'On' : 'Off'}</span>
        </button>
      </div>
      ${backupSectionHtml()}
      <p class="muted">Commander Companion ${VERSION} • ${BUILD_DATE}</p>
      <div class="option-list">
        <button type="button" class="option" data-dev-report>
          <span><strong>Dev report</strong><small>PIN protected. Every correction from every game, ready to copy.</small></span>
        </button>
      </div>`,
    onMount(el, { close }) {
      on(el, 'click', '[data-guidance]', (event, button) => {
        saveSettings({ guidance: button.dataset.guidance });
        close();
        openSettings();
      });
      bindBackupSection(el, { close, reopen: openSettings });
      on(el, 'click', '[data-dev-report]', () => { close(); openDevReport(); });
      on(el, 'click', '[data-toggle]', (event, button) => {
        const key = button.dataset.toggle;
        saveSettings({ [key]: key === 'sendCorrections' ? loadSettings()[key] === false : !loadSettings()[key] });
        close();
        openSettings();
      });
    }
  });
}

async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; } catch { /* fall back below */ }
  const area = document.createElement('textarea');
  area.value = text; area.setAttribute('readonly', ''); area.style.position = 'fixed'; area.style.opacity = '0';
  document.body.appendChild(area); area.select();
  let ok = false;
  try { ok = document.execCommand('copy'); } catch { ok = false; }
  area.remove();
  return ok;
}

/** Dev report: asks for the owner's PIN (set on first use), fetches every new correction and shows the report to copy. */
export function openDevReport() {
  openModal({
    title: 'Dev report',
    body: html`
      <p class="muted">Enter your PIN (4 to 8 digits). The first time, the PIN you enter becomes the PIN.</p>
      <input class="field" id="devPin" type="password" inputmode="numeric" autocomplete="off" maxlength="8" placeholder="PIN">
      <label class="option"><span><strong>Include records already reported</strong></span><input type="checkbox" id="devAll"></label>
      <p class="muted" id="devStatus"></p>`,
    actions: [
      { label: 'Close', kind: 'cancel' },
      { label: 'Get report', kind: 'confirm', onClick: async ({ close, el }) => {
        const pin = el.querySelector('#devPin').value.trim(), all = el.querySelector('#devAll').checked;
        const status = el.querySelector('#devStatus');
        if (!/^\d{4,8}$/.test(pin)) { status.textContent = 'The PIN must be 4 to 8 digits.'; return; }
        status.textContent = 'Getting the report…';
        try {
          let r = await devReport.fetch(pin, all);
          if (r.status === 428) { const s = await devReport.setPin(pin); if (s.status !== 200) { status.textContent = s.error || 'Could not set the PIN.'; return; } r = await devReport.fetch(pin, all); }
          if (r.status !== 200) { status.textContent = r.error || 'Could not get the report.'; return; }
          close();
          showReport(pin, r);
        } catch { status.textContent = 'No connection. Try again when you are online.'; }
      } }
    ]
  });
}

function showReport(pin, r) {
  const text = reportText(r.records || [], { reportedUpTo: r.reportedUpTo, total: r.total, version: VERSION });
  const upTo = (r.records || []).reduce((m, x) => (String(x.at) > m ? String(x.at) : m), r.reportedUpTo || '');
  openModal({
    title: 'Dev report', size: 'wide',
    body: html`<p class="muted">${(r.records || []).length} new records. Copy this and paste it to Claude.</p>
      <textarea class="field" id="devText" readonly rows="16" style="width:100%;font-family:monospace;font-size:12px">${text}</textarea>`,
    actions: [
      { label: 'Close', kind: 'cancel' },
      { label: 'Mark as reported', kind: 'plain', onClick: async ({ close }) => { const m = await devReport.mark(pin, upTo).catch(() => ({})); toast(m.ok ? 'Marked. The next report starts after these.' : 'Could not mark them.'); close(); } },
      { label: 'Copy', kind: 'confirm', onClick: async () => toast((await copyText(text)) ? 'Report copied.' : 'Copy failed — select the text and copy it.') }
    ]
  });
}
