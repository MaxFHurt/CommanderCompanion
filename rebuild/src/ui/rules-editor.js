// The game rules form, shared by Table Defaults and the per-game Rules page.

import { html } from './dom.js';
import { normalizeRulesConfig } from '../engine/rules.js';

const TOGGLES = [
  ['commanderDamage', 'Commander damage loss', '21 combat damage from one commander'],
  ['poisonLoss', 'Poison loss', '10 poison counters'],
  ['commanderTax', 'Commander tax', '+2 for each earlier cast from the command zone'],
  ['bannedList', 'Banned list', 'Enforce the Commander banned list in deck checks'],
  ['colorIdentity', 'Color identity', 'Cards must match the commander’s colors'],
  ['singleton', 'Singleton', 'One copy of each card except basic lands'],
  ['firstPlayerDraw', 'First player draws', 'The player who goes first draws on turn one'],
  ['physicalDraw', 'Real cards: pick what you drew', 'Draw from your real deck and tell the app which card it was', true],
  ['endTurnConfirm', 'Confirm End Turn', 'Ask before passing the turn'],
  ['autoSkip', 'Skip empty phases', 'Move past steps where nobody can act (logged every time)'],
  ['wishes', 'Outside-the-game effects', 'House rule: allow Wish effects', true],
  ['ruleZeroOverrides', 'Rule Zero overrides', 'House rule: allow normally illegal plays', true],
  ['allowExtraLand', 'Extra land play', 'House rule: one additional land each turn', true]
];

export function rulesEditorHtml(config) {
  const r = normalizeRulesConfig(config);
  return html`
    <div class="rules-editor">
      <div class="grid-3">
        <label class="field">Starting life
          <input type="number" inputmode="numeric" min="1" max="999" data-rule="startingLife" value="${Number(r.startingLife || 40)}">
        </label>
        <label class="field">Mulligan rule
          <select data-rule="mulligan">
            <option value="commander" ${r.mulligan === 'commander' ? 'selected' : ''}>Commander — first one free</option>
            <option value="london" ${r.mulligan === 'london' ? 'selected' : ''}>London mulligan</option>
            <option value="free" ${r.mulligan === 'free' ? 'selected' : ''}>Free mulligans (house rule)</option>
          </select>
        </label>
        <label class="field">Response timer (seconds, 0 = off)
          <input type="number" inputmode="numeric" min="0" max="600" data-rule="priorityTimer" value="${Number(r.priorityTimer || 0)}">
        </label>
      </div>
      <div class="grid-2">
        ${TOGGLES.map(([key, label, text, house]) => {
          const on = key === 'autoSkip' ? r.autoSkip !== false : (house ? !!r[key] : r[key] !== false);
          return html`<button type="button" class="option ${on ? 'is-on' : ''}" data-rule-toggle="${key}" aria-pressed="${on ? 'true' : 'false'}">
            <span><strong>${label}</strong><small>${text}</small></span><span class="option__end">${on ? 'On' : 'Off'}</span>
          </button>`;
        })}
      </div>
    </div>`;
}

/** Wire the toggles inside `root` and return a function that reads the current values. */
export function bindRulesEditor(root, initial) {
  const state = normalizeRulesConfig(initial);
  if (state.autoSkip === undefined) state.autoSkip = true;
  root.addEventListener('click', event => {
    const button = event.target instanceof Element ? event.target.closest('[data-rule-toggle]') : null;
    if (!button) return;
    const key = button.dataset.ruleToggle;
    state[key] = button.getAttribute('aria-pressed') !== 'true';
    button.setAttribute('aria-pressed', state[key] ? 'true' : 'false');
    button.classList.toggle('is-on', state[key]);
    button.querySelector('.option__end').textContent = state[key] ? 'On' : 'Off';
  });
  return () => {
    const life = root.querySelector('[data-rule="startingLife"]');
    const mulligan = root.querySelector('[data-rule="mulligan"]');
    return normalizeRulesConfig({
      ...state,
      startingLife: Math.max(1, Math.min(999, Number(life?.value) || 40)),
      mulligan: mulligan?.value || 'commander',
      priorityTimer: Math.max(0, Math.min(600, Number(root.querySelector('[data-rule="priorityTimer"]')?.value) || 0))
    });
  };
}
