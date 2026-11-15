import { html, setHtml, on } from '../dom.js';
import { go } from '../../app/router.js';
import { openModal } from '../modal.js';
import { routePanel, routePanels, routeRow } from '../route-kit.js';

function pickRemoteCount(onPick) {
  openModal({
    title: 'How many players?', size: 'small',
    body: html`<div class="grid-3">${[2, 3, 4, 5, 6].map(n => html`<button type="button" class="option" data-n="${n}"><span><strong>${n} players</strong></span></button>`)}</div>`,
    onMount(el, { close }) { on(el, 'click', '[data-n]', (e, b) => { close(); onPick(Number(b.dataset.n)); }); }
  });
}

// Visual handoff screens/mode-select: title plate, three panels (title, mode button, what it is), Back.
const MODES = [
  ['fully-tracked', 'Guided Play', 'Fully Guided', 'Rulebook enforced guided games.'],
  ['freeplay', 'Free Play', 'Free Play', 'Create, test, and play.'],
  ['table-tracker', 'Table Tracker', 'Table Tracker', 'Shared table tracking.']
];

export const modeSelectScreen = {
  mount(root) {
    setHtml(root, html`
      <main class="mode-select menu" aria-label="Choose game mode">
        <div class="menu__stack mode-select__stack">
          <header class="plate"><h1 class="plate__title">Choose Game Mode</h1></header>
          <div class="mode-select__choices">
            ${MODES.map(([mode, panel, label, text]) => html`
              <section class="mode-card skin-dialog" aria-labelledby="mode-${mode}-title">
                <h2 class="readout mode-card__title" id="mode-${mode}-title">${panel}</h2>
                <button type="button" class="btn" id="mode-${mode}" data-mode="${mode}" aria-describedby="mode-${mode}-text">${label}</button>
                <p class="readout mode-card__text" id="mode-${mode}-text">${text}</p>
              </section>`)}
          </div>
          <button class="btn mode-select__back" type="button" data-act="back">Back</button>
          <div class="skin-sep" aria-hidden="true"></div>
        </div>
      </main>`);
    const offBack = on(root, 'click', '[data-act="back"]', () => go('landing'));
    const offMode = on(root, 'click', '[data-mode]', (event, el) => {
      const mode = el.dataset.mode;
      if (mode === 'table-tracker') {
        return openModal({
          title: 'Table Tracker', route: { w: 1160, h: 475, ph: 276 },
          body: routePanels([
            routePanel('Local table', routeRow(html`<button type="button" class="btn" data-track="local">One device</button>`, 'Track the whole table on this device')),
            routePanel('Shared table', [
              routeRow(html`<button type="button" class="btn" data-track="host-player">Host a table — I am playing too</button>`, 'Players track their own seat on their phones; you get the host tools and Judge mode'),
              routeRow(html`<button type="button" class="btn" data-track="host-device">Host device — table view</button>`, 'This device shows the whole table and acts as judge'),
              routeRow(html`<button type="button" class="btn" data-track="join">Join a table</button>`, 'Enter the code shown on the host device')])
          ]),
          onMount(box, { close }) {
            on(box, 'click', '[data-track]', (e, b) => { close(); b.dataset.track === 'join' ? go('tracker-join') : go('tracker-setup', { play: b.dataset.track }); });
          }
        });
      }
      openModal({
        title: mode === 'freeplay' ? 'Free Play' : 'Guided Play', route: { w: 1160, h: 527, ph: 328 },
        body: routePanels([
          routePanel('Play on one device', routeRow(html`<button type="button" class="btn" data-play="local">One device</button>`, 'Everyone shares this device and passes it around')),
          routePanel('Play on separate devices', [
            routeRow(html`<button type="button" class="btn" data-play="host-player">Host a room — I am playing too</button>`, 'Other players join from their own devices; you get the host tools'),
            routeRow(html`<button type="button" class="btn" data-play="host-device">Host device — table view</button>`, 'This device shows the battlefield for everyone and acts as judge. It never shows hands'),
            routeRow(html`<button type="button" class="btn" data-play="join">Join a room</button>`, 'Enter the code shown on the host device'),
            routeRow(html`<button type="button" class="btn" data-play="online">Online games — play over time</button>`, 'Each player on their own device, whenever they have time. Saved online after every move')])
        ]),
        onMount(el, { close }) {
          on(el, 'click', '[data-play]', (e, b) => {
            close();
            const play = b.dataset.play;
            if (play === 'join') return go('join');
            if (play === 'online') return go('online', { mode });
            if (play === 'host-device') return pickRemoteCount(count => go('lobby', { mode, hostDevice: true, localSeats: [], remoteSeats: count }));
            go('player-setup', { mode, play });
          });
        }
      });
    });
    return () => { offBack(); offMode(); };
  }
};
