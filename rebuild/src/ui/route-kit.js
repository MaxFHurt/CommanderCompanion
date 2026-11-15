// Visual handoff routes (setup, rooms, online, tracker entry): the shared composition, built from each route's map in
// the handoff: title plate, one or two recessed panels (title readout + rows), one row of steel buttons, separator.
// Styles: styles/skin-routes.css. Sizes are in map units (the maps are 1200 wide): w and h set the scale, ph the panel height.

import { html } from './dom.js';

/** One recessed panel: live title in its readout, rows below (short lists centre, long ones scroll from the top). */
export function routePanel(title, body, cls = '') {
  return html`<section class="route-panel skin-dialog ${cls}"><h2 class="readout route-panel__title" title="${title}">${title}</h2><div class="route-panel__body">${body}</div></section>`;
}

/** A whole menu screen. `actions` is the bottom row of buttons (Back first). */
export function routeScreen({ cls = '', panelsCls = '', w = 1160, h = 527, ph = 328, title, label, panels, actions }) {
  return html`
    <main class="menu route ${cls}" aria-label="${label || title}">
      <div class="menu__stack route__stack" style="--W:${w};--H:${h};--PH:${ph}">
        <header class="plate"><h1 class="plate__title ${title.length > 20 ? 'plate__title--long' : ''}" title="${title}">${title}</h1></header>
        <div class="route__panels ${panelsCls}">${panels}</div>
        <div class="route__actions">${actions}</div>
        <div class="skin-sep" aria-hidden="true"></div>
      </div>
    </main>`;
}

/** Panels for a dialog (openModal with `route`): the same composition without the plate and buttons, which the modal draws. */
export const routePanels = panels => html`<div class="route__panels">${panels}</div>`;

/** A list row: the button carries the label; its explanation sits under it, outside the button (handoff rule). */
export function routeRow(buttonHtml, note = '') {
  return html`<div class="route-row">${buttonHtml}${note ? html`<small class="route-row__note">${note}</small>` : ''}</div>`;
}
