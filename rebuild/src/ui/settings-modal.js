// Device settings. Game-specific rules live on the Rules page of each game.

import { html, on } from './dom.js';
import { openModal } from './modal.js';
import { loadSettings, saveSettings } from '../data/store.js';
import { VERSION, BUILD_DATE } from '../version.js';

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
      <p class="muted">Commander Companion ${VERSION} • ${BUILD_DATE}</p>`,
    onMount(el, { close }) {
      on(el, 'click', '[data-guidance]', (event, button) => {
        saveSettings({ guidance: button.dataset.guidance });
        close();
        openSettings();
      });
      on(el, 'click', '[data-toggle]', (event, button) => {
        const key = button.dataset.toggle;
        saveSettings({ [key]: !loadSettings()[key] });
        close();
        openSettings();
      });
    }
  });
}
